// Physics props (v2, behind ?v2=1): a small rigid-body system for round things lying around in the water.
// Data-oriented: one flat typed array per field (x, y, vx, vy, radius, kind, state, timer, ...), no objects.
//
//   bombs, pots, clams, chests, the relic and falling rocks sink (water gravity, scaled per kind), are slowed by
//   drag, bounce (restitution) and roll (friction) off the SAME traced wall segments the octopus collides with
//   (world.wallSegmentsNear, physics.js), and push each other apart (circle separation). Rubble from bombed rock
//   is the cheap kind: it sinks, settles, falls asleep and stays for the level (RUBBLE_CAP chips, the oldest recycled), collides with walls only (never the octopus, never props).
//
//   state: PS_FREE  simulating
//          PS_REST  settled, asleep (skipped until something wakes it: a blast, a tile change, a hit)
//          PS_HELD  attached to a support tile (a clam on a wall, a chest on a ledge); lets go when the tile goes
//
// The live octopus is not a prop: bombs are pushed by it (pushByOctopus), nothing else is. The DEAD octopus is one
// (PK_BODY, V2-PLAN 14): main.js adds it on death and copies it back to the octopus record every step (the ragdoll).
//
//   PK_BLOCK (Spelunky-style push block) is the exception to "round": an axis-aligned square of half extent radius[i]
//   that never rotates. It has its own mover (stepBlock: AABB against the tile grid, x then y, substepped) so it rests
//   exactly on tile tops, stacks on other blocks, and is a solid box to the octopus (pushBlocksByOctopus) and to circle props.

import { resolveCircleVsSegments, resolveCircleVsGrid, contact } from './physics.js';
import { hurtOctopus } from './octopus.js';

export const PK_NONE = 0, PK_BOMB = 1, PK_POT = 2, PK_CLAM = 3, PK_CHEST = 4, PK_RELIC = 5, PK_ROCK = 6, PK_RUBBLE = 7;
export const PK_FIND = 8; // a shell, bomb or item released from the rock (embed.js)
export const PK_BODY = 9; // the limp / dead octopus (ragdoll.js, V2-PLAN 14)
export const PK_BLOCK = 10; // materials: a pushable block (box, see above)
export const PS_FREE = 0, PS_REST = 1, PS_HELD = 2;
export const PROP_NAMES = ['', 'bomb', 'pot', 'clam', 'chest', 'relic', 'rock', 'rubble', 'find', 'body', 'block'];

// per kind (index = PK_*): sink acceleration u/s^2, linear drag 1/s (terminal sink speed = grav / drag),
// restitution, rolling friction 1/s (tangential damping while touching), mass, default radius, no-roll slope
const GRAV = new Float32Array([0, 3.0, 4.5, 5, 8, 7, 16, 6, 4.2, 4.2, 9]);
const DRAG = new Float32Array([0, 1.6, 2.4, 2.4, 2.0, 2.0, 1.45, 2.5, 2.6, 1.4, 2]);
const REST = new Float32Array([0, 0.5, 0.25, 0.3, 0.1, 0.25, 0.12, 0.35, 0.3, 0.45, 0.05]);
const ROLL = new Float32Array([0, 0.2, 1.5, 2.2, 3.5, 2.5, 3.0, 2.0, 2.4, 0.4, 8]);
const MASS = new Float32Array([0, 1, 1.2, 0.8, 4, 3, 6, 0.2, 0.5, 1.5, 5]);
const STICK = new Float32Array([0, 0.2, 0.25, 0.3, 0.6, 0.45, 0.5, 0.35, 0.3, 0.3, 1]); // |slope sine| below which a slow prop stays put
export const PROP_RADIUS = new Float32Array([0, 0.32, 0.38, 0.4, 0.5, 0.5, 0.5, 0.13, 0.26, 0.45, 0.47]);

export const MAX_SPEED = 14;
const BOUNCE_MIN = 0.9;        // u/s of impact speed below which nothing bounces
const BOUNCE_FULL = 3;         // ... and above which (BOUNCE_MIN + this) the full restitution applies
const SLEEP_SPEED = 0.12, SLEEP_TIME = 0.45, STICK_SPEED = 0.3;
const STICK_CEIL_SPEED = 0.5; // u/s of impact speed up into a ceiling at which a bomb sticks to it
export const RUBBLE_CAP = 60; // live rubble chips per level: a new chip recycles the oldest one past this (rubble settles, sleeps and stays; it never expires)
// a bomb keeps its throw (DRAG[PK_BOMB]) while `grace` runs, then the water grabs it: it settles near where it was thrown
// (terminal sink speed GRAV/BOMB_SETTLE_DRAG = 0.6 u/s, so about 1.3 tiles over the 2.5 s fuse) and a rolling bomb stops within a tile
export const BOMB_SETTLE_DRAG = 5, BOMB_ROLL_DRAG = 2.5; // free in the water / touching a floor (a slope still lets it creep downhill)
export const THROW_SPEED = 9; // bombs: u/s added to the octopus's velocity in the aim direction
export const BLAST_POWER = 11;  // u/s of velocity change for a unit-mass prop at the centre of a blast
const DEFAULT_CAP = 160;
// push blocks
const BEPS = 0.001;            // overlaps smaller than this do not count (a block resting on a tile top shares an edge with it)
const BLOCK_GROUND_DAMP = 9;   // 1/s of extra horizontal damping while a block is on something: it slides a little, then stops
const BLOCK_PUSH_SPEED = 1.6;  // u/s a swimming octopus shoves a grounded block along
const BLOCK_CRUSH_SPEED = 3;   // u/s of fall speed above which a block hurts what it lands on
const BLOCK_STEP = 0.4;        // furthest a block moves in one substep (never tunnels)

// scratch body for the wall resolvers (no allocation on the hot path)
const B = { x: 0, y: 0, vx: 0, vy: 0, radius: 0 };
const BN = { nx: 0, ny: 0, pen: 0 }; // scratch: push-out normal and depth of a circle against a block

export function createProps(cap = DEFAULT_CAP) {
  const d = {
    cap, n: 0, live: 0,
    alive: new Uint8Array(cap), kind: new Uint8Array(cap), state: new Uint8Array(cap),
    x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
    radius: new Float32Array(cap),
    timer: new Float32Array(cap),   // bomb: fuse left; other: unused (rubble lives until it is recycled, see RUBBLE_CAP)
    born: new Uint32Array(cap),     // rubble: spawn serial, the smallest is the oldest
    rest: new Float32Array(cap),    // time spent nearly still
    grace: new Float32Array(cap),   // bombs: the octopus cannot push it yet (just thrown)
    grounded: new Uint8Array(cap),  // touched a floor-ish surface this step
    sup: new Uint8Array(cap),       // resting on another prop (set by separate(), read next step so a stack can fall asleep)
    sx: new Int16Array(cap), sy: new Int16Array(cap), // support tile for PS_HELD
    ref: new Int32Array(cap),       // owner's own index (loot record, hazard, ...), -1 none
  };
  const freeList = [];
  let lastVersion = -1;
  let awake = new Int32Array(cap), nAwake = 0;

  let serial = 0, rubbleLive = 0;
  /** Remove the oldest live rubble chip (the cap is full, or a solid prop needs the slot). False when there is none. */
  function recycleRubble() {
    let best = -1;
    for (let j = 0; j < d.n; j++) if (d.alive[j] && d.kind[j] === PK_RUBBLE && (best < 0 || d.born[j] < d.born[best])) best = j;
    if (best < 0) return false;
    remove(best);
    return true;
  }

  function add(kind, x, y, vx = 0, vy = 0, opts = null) {
    let i;
    if (kind === PK_RUBBLE && rubbleLive >= RUBBLE_CAP) recycleRubble();
    if (freeList.length) i = freeList.pop();
    else if (d.n < cap) i = d.n++;
    else if (kind !== PK_RUBBLE && recycleRubble()) i = freeList.pop(); // rubble never starves a bomb, block or body of a slot
    else return -1;
    if (kind === PK_RUBBLE) { rubbleLive++; d.born[i] = ++serial; }
    d.alive[i] = 1; d.kind[i] = kind; d.state[i] = PS_FREE;
    d.x[i] = x; d.y[i] = y; d.vx[i] = vx; d.vy[i] = vy;
    d.radius[i] = opts && opts.radius ? opts.radius : PROP_RADIUS[kind];
    d.timer[i] = opts && opts.timer !== undefined ? opts.timer : 0;
    d.rest[i] = 0; d.grace[i] = opts && opts.grace ? opts.grace : 0; d.grounded[i] = 0; d.sup[i] = 0;
    d.sx[i] = 0; d.sy[i] = 0; d.ref[i] = opts && opts.ref !== undefined ? opts.ref : -1;
    d.live++;
    return i;
  }

  function remove(i) {
    if (i < 0 || i >= d.n || !d.alive[i]) return;
    if (d.kind[i] === PK_RUBBLE) rubbleLive--;
    d.alive[i] = 0; d.live--;
    freeList.push(i);
  }

  function hold(i, tx, ty) { d.state[i] = PS_HELD; d.sx[i] = tx; d.sy[i] = ty; d.vx[i] = d.vy[i] = 0; }
  function wake(i) { if (d.alive[i] && d.state[i] === PS_REST) { d.state[i] = PS_FREE; d.rest[i] = 0; } }
  function release(i) { if (d.alive[i] && d.state[i] !== PS_FREE) { d.state[i] = PS_FREE; d.rest[i] = 0; } }

  function wakeAll() { for (let i = 0; i < d.n; i++) wake(i); }
  function wakeNear(x, y, r) {
    for (let i = 0; i < d.n; i++) if (d.alive[i] && d.state[i] === PS_REST && Math.hypot(d.x[i] - x, d.y[i] - y) <= r + d.radius[i]) wake(i);
  }

  /** Let go of every held prop whose support tile is no longer solid. */
  function checkSupports(world) {
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.state[i] !== PS_HELD) continue;
      if (world.tileAt ? world.tileAt(d.sx[i], d.sy[i]) === 0 : !world.isSolid(d.sx[i] + 0.5, d.sy[i] + 0.5)) release(i);
    }
  }

  /** A blast at (x, y) with radius R: every prop within 2R gets a radial impulse (falls off linearly, divided by mass). */
  function blast(x, y, R, power = BLAST_POWER) {
    const reach = R * 2;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      const k = d.kind[i];
      if (k === PK_BODY) continue; // the dead octopus: bomb.js shoves it with the octopus's own blast impulse
      let dx = d.x[i] - x, dy = d.y[i] - y;
      let dist = Math.hypot(dx, dy);
      if (dist > reach) continue;
      if (d.state[i] === PS_HELD) continue; // still attached: only a lost support frees it (checkSupports)
      if (dist < 1e-4) { dx = 0; dy = -1; dist = 1; } else { dx /= dist; dy /= dist; }
      const f = (1 - Math.min(1, dist / reach)) * power / Math.max(0.5, MASS[k] * 0.6 + 0.4);
      d.state[i] = PS_FREE; d.rest[i] = 0;
      d.vx[i] += dx * f; d.vy[i] += dy * f - f * 0.15; // a touch of lift so things hop instead of grinding the floor
      clampSpeed(i);
    }
  }

  function clampSpeed(i) {
    const s = Math.hypot(d.vx[i], d.vy[i]);
    if (s > MAX_SPEED) { const m = MAX_SPEED / s; d.vx[i] *= m; d.vy[i] *= m; }
  }

  function solidAt(world, x, y) { return world.isSolid(x, y); }

  /** Nearest open tile centre (spiral over a few tiles) for a prop that ended up inside rock. */
  function eject(i, world) {
    const cx = Math.floor(d.x[i]), cy = Math.floor(d.y[i]);
    for (let r = 1; r <= 4; r++) {
      let best = -1, bx = 0, by = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (solidAt(world, cx + dx + 0.5, cy + dy + 0.5)) continue;
          const dd = (cx + dx + 0.5 - d.x[i]) ** 2 + (cy + dy + 0.5 - d.y[i]) ** 2;
          if (best < 0 || dd < best) { best = dd; bx = cx + dx + 0.5; by = cy + dy + 0.5; }
        }
      }
      if (best >= 0) { d.x[i] = bx; d.y[i] = by; d.vx[i] = d.vy[i] = 0; d.state[i] = PS_FREE; d.rest[i] = 0; return true; }
    }
    return false;
  }

  function collideWorld(i, world) {
    B.x = d.x[i]; B.y = d.y[i]; B.vx = d.vx[i]; B.vy = d.vy[i]; B.radius = d.radius[i];
    contact.hit = 0;
    if (typeof world.wallSegmentsNear === 'function') resolveCircleVsSegments(B, world.wallSegmentsNear(B.x, B.y, B.radius));
    else resolveCircleVsGrid(B, world);
    let touched = false;
    if (contact.hit) {
      touched = true;
      // restitution grows with impact speed: a soft touch settles, a hard throw rebounds
      const vn = contact.vn, e = REST[d.kind[i]] * Math.min(1, (-vn - BOUNCE_MIN) / BOUNCE_FULL);
      if (-vn > BOUNCE_MIN && e > 0) { B.vx += -e * vn * contact.nx; B.vy += -e * vn * contact.ny; }
      if (contact.ny < -0.3) d.grounded[i] = 1;
      // a bomb thrown up against a ceiling sticks to it (as in Spelunky); stepOne turns this into PS_HELD
      if (d.kind[i] === PK_BOMB && contact.ny > 0.6 && -vn > STICK_CEIL_SPEED) ceilHit = true;
      lastNx = contact.nx; lastNy = contact.ny;
    }
    d.x[i] = B.x; d.y[i] = B.y; d.vx[i] = B.vx; d.vy[i] = B.vy;
    return touched;
  }
  let lastNx = 0, lastNy = 0, ceilHit = false;

  // ---- push blocks (PK_BLOCK): axis-aligned squares moved by their own AABB-vs-tile-grid mover ----
  function tileSolid(world, tx, ty) { return world.tileAt ? world.tileAt(tx, ty) !== 0 : world.isSolid(tx + 0.5, ty + 0.5); }

  /** Does the box (centre x, y, half extent r) overlap any solid tile? (Touching an edge does not count.) */
  function boxHitsTiles(world, x, y, r) {
    const x0 = Math.floor(x - r + BEPS), x1 = Math.floor(x + r - BEPS), y0 = Math.floor(y - r + BEPS), y1 = Math.floor(y + r - BEPS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tileSolid(world, tx, ty)) return true;
    return false;
  }

  /** Move block i by dx along x: stop flush against rock or another block, handing a pushed block the speed. */
  function blockMoveX(i, world, dx) {
    const r = d.radius[i];
    d.x[i] += dx;
    const y0 = Math.floor(d.y[i] - r + BEPS), y1 = Math.floor(d.y[i] + r - BEPS);
    const tx = dx > 0 ? Math.floor(d.x[i] + r - BEPS) : Math.floor(d.x[i] - r + BEPS);
    for (let ty = y0; ty <= y1; ty++) {
      if (!tileSolid(world, tx, ty)) continue;
      d.x[i] = dx > 0 ? tx - r : tx + 1 + r;
      d.vx[i] = 0;
      break;
    }
    for (let j = 0; j < d.n; j++) {
      if (j === i || !d.alive[j] || d.kind[j] !== PK_BLOCK) continue;
      const rr = r + d.radius[j] - BEPS;
      if (Math.abs(d.x[i] - d.x[j]) >= rr || Math.abs(d.y[i] - d.y[j]) >= rr) continue;
      if (dx > 0 ? d.x[i] - dx > d.x[j] : d.x[i] - dx < d.x[j]) continue; // it started on the far side: not an entry
      d.x[i] = dx > 0 ? d.x[j] - r - d.radius[j] : d.x[j] + r + d.radius[j];
      // a pushed block passes its speed on (a row of blocks shoves along), the pusher is held by the one ahead
      if (d.vx[i] * dx > 0) { d.vx[j] = d.vx[i]; d.state[j] = PS_FREE; d.rest[j] = 0; }
      d.vx[i] = 0;
    }
  }

  /** Move block i by dy along y; landing on rock or a block sets `grounded`. */
  function blockMoveY(i, world, dy) {
    const r = d.radius[i];
    d.y[i] += dy;
    const x0 = Math.floor(d.x[i] - r + BEPS), x1 = Math.floor(d.x[i] + r - BEPS);
    const ty = dy > 0 ? Math.floor(d.y[i] + r - BEPS) : Math.floor(d.y[i] - r + BEPS);
    for (let tx = x0; tx <= x1; tx++) {
      if (!tileSolid(world, tx, ty)) continue;
      d.y[i] = dy > 0 ? ty - r : ty + 1 + r;
      if (dy > 0) d.grounded[i] = 1;
      d.vy[i] = 0;
      break;
    }
    for (let j = 0; j < d.n; j++) {
      if (j === i || !d.alive[j] || d.kind[j] !== PK_BLOCK) continue;
      const rr = r + d.radius[j] - BEPS;
      if (Math.abs(d.x[i] - d.x[j]) >= rr || Math.abs(d.y[i] - d.y[j]) >= rr) continue;
      if (dy > 0 ? d.y[i] - dy > d.y[j] : d.y[i] - dy < d.y[j]) continue;
      d.y[i] = dy > 0 ? d.y[j] - r - d.radius[j] : d.y[j] + r + d.radius[j];
      if (dy > 0) d.grounded[i] = 1;
      d.vy[i] = 0;
    }
  }

  function stepBlock(i, dt, world) {
    const k = PK_BLOCK;
    const onGround = d.grounded[i] === 1;
    d.vy[i] += GRAV[k] * dt;
    d.vx[i] /= 1 + dt * (DRAG[k] + (onGround ? BLOCK_GROUND_DAMP : 0)); // grounded: it slides a little, then stops
    d.vy[i] /= 1 + dt * DRAG[k];
    clampSpeed(i);
    d.grounded[i] = 0;
    d.timer[i] = Math.max(0, d.vy[i]); // fall speed going into this step: what a landing block hits with (crush)
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(d.vx[i]), Math.abs(d.vy[i])) * dt / BLOCK_STEP));
    const sub = dt / steps;
    for (let s = 0; s < steps; s++) {
      if (d.vx[i] !== 0) blockMoveX(i, world, d.vx[i] * sub);
      blockMoveY(i, world, d.vy[i] * sub);
    }
    if (d.grounded[i] && Math.hypot(d.vx[i], d.vy[i]) < SLEEP_SPEED) {
      d.rest[i] += dt;
      if (d.rest[i] >= SLEEP_TIME) { d.state[i] = PS_REST; d.vx[i] = d.vy[i] = 0; d.timer[i] = 0; }
    } else d.rest[i] = 0;
  }

  /** Is a sleeping block still held up by rock or another block under it? */
  function blockSupported(i, world) {
    const r = d.radius[i];
    if (boxHitsTiles(world, d.x[i], d.y[i] + 0.02, r)) return true;
    for (let j = 0; j < d.n; j++) {
      if (j === i || !d.alive[j] || d.kind[j] !== PK_BLOCK || d.y[j] < d.y[i]) continue;
      const rr = r + d.radius[j];
      if (Math.abs(d.x[i] - d.x[j]) < rr - BEPS && d.y[j] - d.y[i] < rr + 0.02) return true;
    }
    return false;
  }

  /** Closest-point test of a circle (centre cx, cy, radius R) against block b: writes the push-out normal and depth into BN, or returns false. */
  function circleVsBox(cx, cy, R, b) {
    const r = d.radius[b], bx = d.x[b], by = d.y[b];
    const px = cx < bx - r ? bx - r : cx > bx + r ? bx + r : cx, py = cy < by - r ? by - r : cy > by + r ? by + r : cy;
    const dx = cx - px, dy = cy - py, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return false;
    if (d2 > 1e-10) { const dist = Math.sqrt(d2); BN.nx = dx / dist; BN.ny = dy / dist; BN.pen = R - dist; }
    else { // the centre is inside the box: leave along the shallower axis
      const ex = r - Math.abs(cx - bx), ey = r - Math.abs(cy - by);
      if (ex < ey) { BN.nx = cx >= bx ? 1 : -1; BN.ny = 0; BN.pen = ex + R; } else { BN.nx = 0; BN.ny = cy >= by ? 1 : -1; BN.pen = ey + R; }
    }
    return true;
  }

  /** A circle prop against a block: the circle is pushed out, the heavy block does not move. */
  function circleVsBlock(c, b) {
    if (d.state[c] === PS_HELD || !circleVsBox(d.x[c], d.y[c], d.radius[c], b)) return;
    if (d.state[c] !== PS_FREE) { if (BN.pen < 0.02) return; d.state[c] = PS_FREE; d.rest[c] = 0; } // a sleeper only wakes if really overlapped
    d.x[c] += BN.nx * BN.pen; d.y[c] += BN.ny * BN.pen;
    const vn = d.vx[c] * BN.nx + d.vy[c] * BN.ny;
    if (vn < 0) { const e = -vn > BOUNCE_MIN ? 0.25 : 0; d.vx[c] -= (1 + e) * vn * BN.nx; d.vy[c] -= (1 + e) * vn * BN.ny; }
    if (BN.ny < -0.3) d.sup[c] = 1; // sits on top of the block
  }

  /** The octopus is solid to blocks: pushed out along the shallower axis, its speed into the box removed. Swimming sideways into a grounded block shoves it along. */
  function pushBlocksByOctopus(octo, world) {
    if (!octo || octo.dead) return;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.kind[i] !== PK_BLOCK || !circleVsBox(octo.x, octo.y, octo.radius, i)) continue;
      const nx = BN.nx, ny = BN.ny, pen = BN.pen;
      if (ny > 0.5 && d.timer[i] > BLOCK_CRUSH_SPEED) hurtOctopus(octo, d.x[i], d.y[i], 'block'); // a fast fall onto the octopus
      if (Math.abs(nx) > 0.7 && d.grounded[i]) {
        const dir = nx < 0 ? 1 : -1, into = octo.vx * dir;
        // only along a free floor: the next column over must be open, or the block stays put
        if (into > 0.15 && !boxHitsTiles(world, d.x[i] + dir * 0.12, d.y[i], d.radius[i])) {
          const v = Math.min(BLOCK_PUSH_SPEED, into * 2);
          if (d.vx[i] * dir < v) d.vx[i] = dir * v;
          d.state[i] = PS_FREE; d.rest[i] = 0;
        }
      }
      octo.x += nx * pen; octo.y += ny * pen;
      const vn = octo.vx * nx + octo.vy * ny;
      if (vn < 0) { octo.vx -= vn * nx; octo.vy -= vn * ny; }
    }
  }

  /** A block landing fast on an enemy kills it (no kill event: the enemy is just flagged dead, as when its support goes). */
  let enemyKiller = null; // main.js: enemies.kill, so a crushed enemy leaves a corpse like any other kill
  function crushEnemies(list) {
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.kind[i] !== PK_BLOCK || d.timer[i] <= BLOCK_CRUSH_SPEED) continue;
      const r = d.radius[i], bx = d.x[i], by = d.y[i];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead || e.ghost || e.immune || e.kind === 'beholder') continue;
        const er = e.radius || 0.4;
        if (Math.abs(e.x - bx) < r + er * 0.8 && e.y > by && e.y - er < by + r) { if (enemyKiller) enemyKiller(e); else e.dead = true; }
      }
    }
  }

  function stepOne(i, dt, world) {
    const k = d.kind[i];
    if (k === PK_BLOCK) { stepBlock(i, dt, world); return; }
    d.vy[i] += GRAV[k] * dt;
    const f = 1 / (1 + dt * (k === PK_BOMB && d.grace[i] <= 0 ? (d.grounded[i] ? BOMB_ROLL_DRAG : BOMB_SETTLE_DRAG) : DRAG[k]));
    d.vx[i] *= f; d.vy[i] *= f;
    clampSpeed(i);
    d.grounded[i] = 0;
    ceilHit = false;
    const speed = Math.hypot(d.vx[i], d.vy[i]);
    const r = d.radius[i];
    let steps = 1;
    if (speed * dt > r * 0.5) steps = Math.min(8, Math.ceil(speed * dt / (r * 0.5)));
    const sub = dt / steps;
    let touched = false;
    for (let s = 0; s < steps; s++) {
      d.x[i] += d.vx[i] * sub; d.y[i] += d.vy[i] * sub;
      if (collideWorld(i, world)) touched = true;
    }
    if (ceilHit) {
      const tx = Math.floor(d.x[i]), ty = Math.floor(d.y[i] - r - 0.2);
      if (world.tileAt ? world.tileAt(tx, ty) !== 0 : world.isSolid(tx + 0.5, ty + 0.5)) { hold(i, tx, ty); return; }
    }
    if (touched) {
      // rolling friction along the surface, and a stick threshold so a slow prop on a shallow slope stays put
      const tx = -lastNy, ty = lastNx;
      const vt = d.vx[i] * tx + d.vy[i] * ty;
      const vtN = vt / (1 + dt * ROLL[k]);
      d.vx[i] += (vtN - vt) * tx; d.vy[i] += (vtN - vt) * ty;
      const sp = Math.hypot(d.vx[i], d.vy[i]);
      if (sp < STICK_SPEED && Math.abs(lastNx) < STICK[k] && lastNy < -0.5) { d.vx[i] = 0; d.vy[i] = 0; }
    }
    // sleep when nearly still on something (rock, or another prop)
    const supported = touched || d.sup[i] === 1;
    d.sup[i] = 0;
    if (supported && Math.hypot(d.vx[i], d.vy[i]) < SLEEP_SPEED) {
      d.rest[i] += dt;
      if (d.rest[i] >= SLEEP_TIME) { d.state[i] = PS_REST; d.vx[i] = d.vy[i] = 0; }
    } else d.rest[i] = 0;
  }

  /** Circle separation among the solid kinds (everything but rubble). */
  function separate() {
    for (let a = 0; a < nAwake; a++) {
      const i = awake[a];
      if (!d.alive[i] || d.kind[i] === PK_RUBBLE || d.state[i] !== PS_FREE) continue;
      for (let j = 0; j < d.n; j++) {
        if (j === i || !d.alive[j] || d.kind[j] === PK_RUBBLE) continue;
        const sj = d.state[j];
        if (sj === PS_FREE && j < i) continue; // each free pair once (the lower index handles it)
        const bi = d.kind[i] === PK_BLOCK, bj = d.kind[j] === PK_BLOCK;
        if (bi || bj) { if (bi !== bj) circleVsBlock(bi ? j : i, bi ? i : j); continue; } // block vs block is the AABB mover's job
        let dx = d.x[i] - d.x[j], dy = d.y[i] - d.y[j];
        const rr = d.radius[i] + d.radius[j];
        if (Math.abs(dx) >= rr || Math.abs(dy) >= rr) continue;
        let dist = Math.hypot(dx, dy);
        if (dist >= rr) continue;
        if (dist < 1e-5) { dx = 0; dy = -1; dist = 1; } else { dx /= dist; dy /= dist; }
        const pen = rr - dist;
        const mi = MASS[d.kind[i]], mj = MASS[d.kind[j]];
        const staticJ = sj !== PS_FREE;
        const wi = staticJ ? 1 : mj / (mi + mj), wj = staticJ ? 0 : mi / (mi + mj);
        d.x[i] += dx * pen * wi; d.y[i] += dy * pen * wi;
        if (dy < -0.3) d.sup[i] = 1; // i sits on top of j
        const rel = (d.vx[i] - (staticJ ? 0 : d.vx[j])) * dx + (d.vy[i] - (staticJ ? 0 : d.vy[j])) * dy;
        if (rel < 0) {
          const e = -rel > BOUNCE_MIN ? 0.25 : 0; // a resting contact does not jitter
          const jn = -(1 + e) * rel / (1 / mi + (staticJ ? 0 : 1 / mj));
          d.vx[i] += jn / mi * dx; d.vy[i] += jn / mi * dy;
          if (!staticJ) { d.vx[j] -= jn / mj * dx; d.vy[j] -= jn / mj * dy; }
          else if (-rel > 1.5 && sj === PS_REST) { wake(j); }
        }
        if (!staticJ) { d.x[j] -= dx * pen * wj; d.y[j] -= dy * pen * wj; d.state[j] = PS_FREE; }
        if (rel < -0.5) d.rest[i] = 0;
      }
    }
  }

  /** A moving octopus pushes a bomb (any other prop is left alone). */
  function pushByOctopus(octo) {
    if (!octo || octo.dead) return;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.kind[i] !== PK_BOMB || d.grace[i] > 0 || d.state[i] === PS_HELD) continue;
      let dx = d.x[i] - octo.x, dy = d.y[i] - octo.y;
      const rr = d.radius[i] + octo.radius * 0.9;
      if (Math.abs(dx) >= rr || Math.abs(dy) >= rr) continue;
      let dist = Math.hypot(dx, dy);
      if (dist >= rr) continue;
      if (dist < 1e-5) { dx = 0; dy = 1; dist = 1; } else { dx /= dist; dy /= dist; }
      d.x[i] += dx * (rr - dist); d.y[i] += dy * (rr - dist);
      const rel = (d.vx[i] - octo.vx) * dx + (d.vy[i] - octo.vy) * dy;
      if (rel < 0) { d.vx[i] -= 1.4 * rel * dx; d.vy[i] -= 1.4 * rel * dy; }
      // the octopus never holds a bomb up: one resting on its head is nudged sideways until it rolls off
      if (dy < -0.5) d.vx[i] += (dx >= 0 ? 1 : -1) * 0.17; // about 8 u/s^2 sideways
      d.state[i] = PS_FREE; d.rest[i] = 0;
      clampSpeed(i);
    }
  }

  /** Moving enemies (crab, piranha, manta) are solid to a bomb: it is shoved out of the body and kicked along. */
  function pushByEnemies(list) {
    if (!list) return;
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (!e.moving || e.dead || e.ghost || e.kind === 'beholder') continue;
      const er = e.radius + 0.05;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i] || d.kind[i] !== PK_BOMB || d.state[i] === PS_HELD) continue;
        let dx = d.x[i] - e.x, dy = d.y[i] - e.y;
        const rr = d.radius[i] + er;
        if (Math.abs(dx) >= rr || Math.abs(dy) >= rr) continue;
        let dist = Math.hypot(dx, dy);
        if (dist >= rr) continue;
        if (dist < 1e-5) { dx = e.vx >= 0 ? 1 : -1; dy = 0; dist = 1; } else { dx /= dist; dy /= dist; }
        d.x[i] += dx * (rr - dist); d.y[i] += dy * (rr - dist);
        const rel = (d.vx[i] - (e.vx || 0)) * dx + (d.vy[i] - (e.vy || 0)) * dy;
        if (rel < 0) { d.vx[i] -= 1.3 * rel * dx; d.vy[i] -= 1.3 * rel * dy; }
        d.state[i] = PS_FREE; d.rest[i] = 0;
        clampSpeed(i);
      }
    }
  }

  /** Rubble spreads out: awake chips closer than their own size are pushed apart (cheap, capped). */
  function separateRubble() {
    let n = 0;
    for (let a = 0; a < nAwake && n < 48; a++) {
      const i = awake[a];
      if (!d.alive[i] || d.kind[i] !== PK_RUBBLE) continue;
      n++;
      for (let b = a + 1; b < nAwake; b++) {
        const j = awake[b];
        if (!d.alive[j] || d.kind[j] !== PK_RUBBLE) continue;
        let dx = d.x[j] - d.x[i], dy = d.y[j] - d.y[i];
        const rr = (d.radius[i] + d.radius[j]) * 1.2;
        if (Math.abs(dx) >= rr || Math.abs(dy) >= rr) continue;
        let dist = Math.hypot(dx, dy);
        if (dist >= rr) continue;
        if (dist < 1e-5) { const a2 = (i * 2.399 + j) % 6.283; dx = Math.cos(a2); dy = Math.sin(a2); dist = 1; } else { dx /= dist; dy /= dist; }
        const push = (rr - Math.min(dist, rr)) * 0.5;
        d.x[i] -= dx * push; d.y[i] -= dy * push; d.x[j] += dx * push; d.y[j] += dy * push;
      }
    }
  }

  return {
    data: d,
    /** fn(enemyRecord) kills an enemy by its regular path (crushed under a falling block). */
    setEnemyKiller(fn) { enemyKiller = fn; },
    add, remove, hold, wake, release, wakeAll, wakeNear, blast, checkSupports,
    count() { return d.live; },
    /** Indices of live props of one kind (tests, drawing). */
    ofKind(k, out = []) { out.length = 0; for (let i = 0; i < d.n; i++) if (d.alive[i] && d.kind[i] === k) out.push(i); return out; },

    /** One fixed step. `octo` is optional (bombs get pushed by it); `enemies` (optional list of enemy records) are solid to bombs. */
    step(dt, world, octo, enemies) {
      const v = world.tileVersion;
      if (v !== undefined && v !== lastVersion) {
        if (lastVersion !== -1) { wakeAll(); checkSupports(world); }
        lastVersion = v;
      }
      nAwake = 0;
      let blocksAwake = false;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        if (d.grace[i] > 0) d.grace[i] = Math.max(0, d.grace[i] - dt);
        if (d.state[i] !== PS_FREE) continue;
        awake[nAwake++] = i;
        if (d.kind[i] === PK_BLOCK) blocksAwake = true;
        stepOne(i, dt, world);
      }
      // a sleeping block whose support slid away (the block under it was shoved off) falls again
      if (blocksAwake) for (let i = 0; i < d.n; i++) if (d.alive[i] && d.kind[i] === PK_BLOCK && d.state[i] === PS_REST && !blockSupported(i, world)) wake(i);
      if (nAwake > 0) { separate(); separateRubble(); }
      if (octo) { pushByOctopus(octo); pushBlocksByOctopus(octo, world); }
      if (enemies) { pushByEnemies(enemies); crushEnemies(enemies); }
      // nothing may end inside rock: a landed rock can fill the tile a sleeper lies in
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i] || d.state[i] === PS_HELD || (d.state[i] === PS_REST && d.kind[i] === PK_RUBBLE)) continue; // a sleeping chip costs nothing (a tile change wakes it first)
        if (d.kind[i] === PK_BLOCK ? boxHitsTiles(world, d.x[i], d.y[i], d.radius[i]) : solidAt(world, d.x[i], d.y[i])) eject(i, world);
      }
    },
  };
}
