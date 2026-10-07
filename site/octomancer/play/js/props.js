// Physics props (v2, behind ?v2=1): a small rigid-body system for round things lying around in the water.
// Data-oriented: one flat typed array per field (x, y, vx, vy, radius, kind, state, timer, ...), no objects.
//
//   bombs, pots, clams, chests, the relic and falling rocks sink (water gravity, scaled per kind), are slowed by
//   drag, bounce (restitution) and roll (friction) off the SAME traced wall segments the octopus collides with
//   (world.wallSegmentsNear, physics.js), and push each other apart (circle separation). Rubble from bombed rock
//   is the cheap kind: it sinks, settles and fades, collides with walls only (never the octopus, never props).
//
//   state: PS_FREE  simulating
//          PS_REST  settled, asleep (skipped until something wakes it: a blast, a tile change, a hit)
//          PS_HELD  attached to a support tile (a clam on a wall, a chest on a ledge); lets go when the tile goes
//
// The octopus itself is not a prop: bombs are pushed by it (pushByOctopus), nothing else is.

import { resolveCircleVsSegments, resolveCircleVsGrid, contact } from './physics.js';

export const PK_NONE = 0, PK_BOMB = 1, PK_POT = 2, PK_CLAM = 3, PK_CHEST = 4, PK_RELIC = 5, PK_ROCK = 6, PK_RUBBLE = 7;
export const PK_FIND = 8; // a shell, bomb or item released from the rock (embed.js)
export const PS_FREE = 0, PS_REST = 1, PS_HELD = 2;
export const PROP_NAMES = ['', 'bomb', 'pot', 'clam', 'chest', 'relic', 'rock', 'rubble', 'find'];

// per kind (index = PK_*): sink acceleration u/s^2, linear drag 1/s (terminal sink speed = grav / drag),
// restitution, rolling friction 1/s (tangential damping while touching), mass, default radius, no-roll slope
const GRAV = new Float32Array([0, 3.6, 4.5, 5, 8, 7, 16, 6, 4.2]);
const DRAG = new Float32Array([0, 1.6, 2.4, 2.4, 2.0, 2.0, 1.45, 2.5, 2.6]);
const REST = new Float32Array([0, 0.5, 0.25, 0.3, 0.1, 0.25, 0.12, 0.35, 0.3]);
const ROLL = new Float32Array([0, 0.2, 1.5, 2.2, 3.5, 2.5, 3.0, 2.0, 2.4]);
const MASS = new Float32Array([0, 1, 1.2, 0.8, 4, 3, 6, 0.2, 0.5]);
const STICK = new Float32Array([0, 0.2, 0.25, 0.3, 0.6, 0.45, 0.5, 0.35, 0.3]); // |slope sine| below which a slow prop stays put
export const PROP_RADIUS = new Float32Array([0, 0.32, 0.38, 0.4, 0.5, 0.5, 0.5, 0.13, 0.26]);

export const MAX_SPEED = 14;
const BOUNCE_MIN = 0.9;        // u/s of impact speed below which nothing bounces
const BOUNCE_FULL = 3;         // ... and above which (BOUNCE_MIN + this) the full restitution applies
const SLEEP_SPEED = 0.12, SLEEP_TIME = 0.45, STICK_SPEED = 0.3;
const STICK_CEIL_SPEED = 0.5; // u/s of impact speed up into a ceiling at which a bomb sticks to it
export const RUBBLE_LIFE = 3, RUBBLE_FADE = 0.8;
export const THROW_SPEED = 9; // bombs: u/s added to the octopus's velocity in the aim direction
export const BLAST_POWER = 11;  // u/s of velocity change for a unit-mass prop at the centre of a blast
const DEFAULT_CAP = 160;

// scratch body for the wall resolvers (no allocation on the hot path)
const B = { x: 0, y: 0, vx: 0, vy: 0, radius: 0 };

export function createProps(cap = DEFAULT_CAP) {
  const d = {
    cap, n: 0, live: 0,
    alive: new Uint8Array(cap), kind: new Uint8Array(cap), state: new Uint8Array(cap),
    x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
    radius: new Float32Array(cap),
    timer: new Float32Array(cap),   // bomb: fuse left; rubble: life left; other: unused
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

  function add(kind, x, y, vx = 0, vy = 0, opts = null) {
    let i;
    if (freeList.length) i = freeList.pop();
    else if (d.n < cap) i = d.n++;
    else return -1;
    d.alive[i] = 1; d.kind[i] = kind; d.state[i] = PS_FREE;
    d.x[i] = x; d.y[i] = y; d.vx[i] = vx; d.vy[i] = vy;
    d.radius[i] = opts && opts.radius ? opts.radius : PROP_RADIUS[kind];
    d.timer[i] = opts && opts.timer !== undefined ? opts.timer : kind === PK_RUBBLE ? RUBBLE_LIFE : 0;
    d.rest[i] = 0; d.grace[i] = opts && opts.grace ? opts.grace : 0; d.grounded[i] = 0; d.sup[i] = 0;
    d.sx[i] = 0; d.sy[i] = 0; d.ref[i] = opts && opts.ref !== undefined ? opts.ref : -1;
    d.live++;
    return i;
  }

  function remove(i) {
    if (i < 0 || i >= d.n || !d.alive[i]) return;
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

  function stepOne(i, dt, world) {
    const k = d.kind[i];
    d.vy[i] += GRAV[k] * dt;
    const f = 1 / (1 + dt * DRAG[k]);
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
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        if (d.grace[i] > 0) d.grace[i] = Math.max(0, d.grace[i] - dt);
        if (d.kind[i] === PK_RUBBLE) {
          d.timer[i] -= dt;
          if (d.timer[i] <= 0) { remove(i); continue; }
        }
        if (d.state[i] !== PS_FREE) continue;
        awake[nAwake++] = i;
        stepOne(i, dt, world);
      }
      if (nAwake > 0) { separate(); separateRubble(); }
      if (octo) pushByOctopus(octo);
      if (enemies) pushByEnemies(enemies);
      // nothing may end inside rock: a landed rock can fill the tile a sleeper lies in
      for (let i = 0; i < d.n; i++) {
        if (d.alive[i] && d.state[i] !== PS_HELD && solidAt(world, d.x[i], d.y[i])) eject(i, world);
      }
    },
  };
}
