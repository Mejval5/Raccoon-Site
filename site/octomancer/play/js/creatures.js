// Ambush creatures (V2-PLAN 16): the giant clam and the tentacle. Both come from the pattern table (patterns.js, rows of kind
// 'creature'): level-spawns.js turns a hit into a `{type:'creature', ck, x, y, dx, dy, ...}` record with makeCreatureRecord(), and
// createCreatures() runs the records the world's chunk carries. Data-oriented like hazards.js: one flat typed array per field.
//
//  - Giant clam: sits on a floor, cycles shut -> opening -> open (a pearl inside) -> tremble -> snap while the octopus is near.
//    A snap with the octopus centre in the mouth is an instant death. A bomb kills it (the pearl drops out).
//  - Tentacle (Milan's Clamissaint): dormant until the octopus comes close, then wakes, reaches, strikes. A hit holds the octopus
//    and drags it into the shell unless it breaks free (3 dash presses, ink damage, or a bomb).
//
// Neither is solid for the A* check (a clam shell bonks, a tentacle only grabs), so no blockers are listed.

import { killOctopus } from './octopus.js';
import { hasLineOfSight } from './pathfind.js';
import { PEARL_VALUE } from './shells.js';
import { inCameraView } from './cull.js';
import { resolveHit, rowOf, SOURCES } from './creature-rules.js';
import { creatureId } from './damage.js';

export const CR_NONE = 0, CR_GCLAM = 1, CR_TENTACLE = 2;
export const CREATURE_NAMES = ['', 'gclam', 'tentacle'];
export const CREATURE_CODE = { gclam: CR_GCLAM, tentacle: CR_TENTACLE };
export const CREATURE_CAP = 16;
const CAP = CREATURE_CAP;

// giant clam states
export const CL_SHUT = 0, CL_OPENING = 1, CL_OPEN = 2, CL_TREMBLE = 3, CL_SNAP = 4;
export const CLAM_WAKE_R = 9;        // it only cycles while the octopus is this near
export const CLAM_SHUT_MIN = 2.5, CLAM_SHUT_VAR = 1.0;
export const CLAM_OPENING_T = 0.45;
export const CLAM_OPEN_T = 2.0;
export const CLAM_TREMBLE_T = 0.5;   // the telegraph: the shell shivers, the lid twitches
export const CLAM_SNAP_T = 0.08;
export const CLAM_HALF_W = 0.95;     // half the shell width
export const CLAM_SHUT_H = 0.8;      // height of the shut shell (the bonk box)
export const CLAM_MOUTH_HALF_W = 0.85; // the octopus centre inside this box at the snap is caught
export const CLAM_MOUTH_H = 1.0;
export const CLAM_HP = rowOf('gclam').hp; // creature-rules.js (18)
export const PEARL_R = 0.16;
const BONK_PUSH = 3;

// tentacle states
export const TN_DORMANT = 0, TN_WAKE = 1, TN_REACH = 2, TN_STRIKE = 3, TN_GRAB = 4, TN_STUN = 5, TN_RETRACT = 6, TN_FED = 7;
export const TENT_WAKE_R = 4.5;      // dormant until the octopus is this near (with a clear line)
export const TENT_LOSE_R = 6;        // an awake tentacle gives up beyond this
export const TENT_REACH = 3.4;       // furthest the tip gets from the shell mouth
export const TENT_WAKE_T = 0.7;
export const TENT_REACH_T = 1.5;
export const TENT_REACH_SPEED = 2.2; // tiles/s the tip follows the octopus
export const TENT_STRIKE_T = 0.25;
export const TENT_TIP_R = 0.3;
export const TENT_DRAG = 1.2;        // tiles/s towards the shell while held
export const TENT_GRAB_MAX = 2.2;    // s: then the octopus is eaten wherever it is
export const TENT_STRUGGLES = 3;     // dash presses that free the octopus
export const TENT_INK_FREE = 6;      // ink damage that frees it
export const TENT_FLING = 8;         // u/s away from the shell on release
export const TENT_STUN_T = 2.0;
export const TENT_REGRAB_CD = 3;     // s after a release before it can grab again
export const TENT_MISS_CD = 1.2;     // s after a miss
export const TENT_HP = rowOf('tentacle').hp; // creature-rules.js (14)
export const TENT_SHELL_LEN = 1.3;   // the shell sprite's length in tiles
export const TENT_MOUTH = 0.43;      // mouth distance from the shell centre

/** Stable journal id for a creature code ('creature-gclam'). */
export function creatureJournalId(code) { return 'creature-' + CREATURE_NAMES[code]; }

function hash2(x, y) { let h = (Math.imul(Math.floor(x * 2), 73856093) ^ Math.imul(Math.floor(y * 2), 19349663)) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; return (h ^ (h >>> 15)) >>> 0 || 1; }
/** xorshift32 over one slot of a Uint32Array, in [0, 1). */
function rnd(a, i) { let s = a[i]; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; a[i] = s; return s / 4294967296; }

// ---------------------------------------------------------------- records

/**
 * Build the spawn record for a pattern hit, or null when the surroundings do not fit. (x, y) is the anchor cell centre
 * (water against the surface), (dx, dy) the facing away from the surface.
 */
export function makeCreatureRecord(name, x, y, dx, dy, tiles, w, h) {
  const code = CREATURE_CODE[name];
  if (!code) return null;
  const cx = Math.floor(x), cy = Math.floor(y);
  const solid = (tx, ty) => tx < 0 || ty < 0 || tx >= w || ty >= h || tiles[ty * w + tx] !== 0;
  const hs = hash2(x, y);
  if (code === CR_GCLAM) {
    if (dy !== -1) return null;
    for (let i = -1; i <= 1; i++) if (!solid(cx + i, cy + 1) || solid(cx + i, cy) || solid(cx + i, cy - 1)) return null; // flat floor, 3x2 water above
    return { type: 'creature', ck: code, x, y, dx: 0, dy: -1, side: hs & 1 ? 1 : -1 };
  }
  // tentacle: the surface cell behind the anchor must be rock
  if (solid(cx, cy) || !solid(cx - dx, cy - dy)) return null;
  if (!dx && !dy) return null;
  const tilt = (((hs >>> 3) & 255) / 255 - 0.5) * (dx ? 0.4 : 0.9); // the mouth leans a little off the surface normal
  return { type: 'creature', ck: code, x, y, dx, dy, tilt, side: hs & 1 ? 1 : -1 };
}

// ---------------------------------------------------------------- runtime

/** The flat arrays are the state (`data`); `events` is read and cleared by main.js each step. */
export function createCreatures() {
  const d = {
    n: 0,
    kind: new Uint8Array(CAP), state: new Uint8Array(CAP), alive: new Uint8Array(CAP),
    x: new Float32Array(CAP), y: new Float32Array(CAP),          // shell centre (clam: centre on the floor line minus half height)
    dx: new Float32Array(CAP), dy: new Float32Array(CAP),        // facing away from the surface
    side: new Int8Array(CAP),                                    // clam: hinge side; tentacle: mirror of the shell
    mx: new Float32Array(CAP), my: new Float32Array(CAP),        // tentacle mouth (where the limb leaves the shell)
    mdx: new Float32Array(CAP), mdy: new Float32Array(CAP),      // direction the mouth faces
    fy: new Float32Array(CAP),                                   // clam floor line
    t: new Float32Array(CAP), cd: new Float32Array(CAP), hp: new Float32Array(CAP),
    ang: new Float32Array(CAP),                                  // clam lid opening 0 (shut) .. 1 (open)
    pearl: new Uint8Array(CAP),
    fed: new Uint8Array(CAP),                                    // it holds a dead octopus (drawn over it)
    tipx: new Float32Array(CAP), tipy: new Float32Array(CAP),    // tentacle tip
    sx: new Float32Array(CAP), sy: new Float32Array(CAP),        // strike start / target
    tx: new Float32Array(CAP), ty: new Float32Array(CAP),
    ink: new Float32Array(CAP),                                  // ink damage taken while holding
    squeeze: new Float32Array(CAP),                              // 0..1 how tight it holds (draw)
    rs: new Uint32Array(CAP).fill(1),
    hzCool: new Float64Array(CAP), blame: new Float64Array(CAP), // damage.js: hazard cooldown and octopus-blame (sim time stamps)
    tg: new Uint8Array(CAP), tgid: new Int32Array(CAP),         // tentacle: 1 = it hunts body tgid (INFIGHT.grab) instead of the octopus
  };
  const events = []; // {type:'pearl'|'pearlDrop'|'killed'|'snap'|'grab'|'grabCreature'|'release'|'eaten'|'wake'|'strike'|'bonk'|'tremble', ...}
  const loaded = new Set();
  let inf = null; // infight.js (v2): the INFIGHT rules (snap, grab); null = they only ever attack the octopus
  let curWorld = null;
  const solidAt = (tx, ty) => curWorld.isSolid(tx, ty);
  const losSolid = (x0, y0, x1, y1) => hasLineOfSight(solidAt, x0, y0, x1, y1);

  function add(rec) {
    if (d.n >= CAP) return -1;
    const i = d.n++;
    const code = rec.ck;
    d.kind[i] = code; d.state[i] = 0; d.alive[i] = 1;
    d.dx[i] = rec.dx || 0; d.dy[i] = rec.dy || 0; d.side[i] = rec.side || 1;
    d.rs[i] = hash2(rec.x, rec.y);
    d.cd[i] = 0; d.ink[i] = 0; d.squeeze[i] = 0; d.fed[i] = 0; d.ang[i] = 0; d.tg[i] = 0; d.tgid[i] = 0;
    if (code === CR_GCLAM) {
      d.fy[i] = rec.y + 0.5;
      d.x[i] = rec.x; d.y[i] = d.fy[i] - 0.4;
      d.hp[i] = CLAM_HP; d.pearl[i] = 1;
      d.t[i] = CLAM_SHUT_MIN + rnd(d.rs, i) * CLAM_SHUT_VAR;
    } else {
      d.x[i] = rec.x + d.dx[i] * 0.04; d.y[i] = rec.y + d.dy[i] * 0.04; // the shell sits on its surface, a hair into it
      const tilt = rec.tilt || 0, c = Math.cos(tilt), s = Math.sin(tilt);
      d.mdx[i] = d.dx[i] * c - d.dy[i] * s; d.mdy[i] = d.dx[i] * s + d.dy[i] * c;
      d.mx[i] = d.x[i] + d.mdx[i] * TENT_MOUTH; d.my[i] = d.y[i] + d.mdy[i] * TENT_MOUTH;
      d.tipx[i] = d.mx[i]; d.tipy[i] = d.my[i];
      d.hp[i] = TENT_HP; d.pearl[i] = 0; d.t[i] = 0;
    }
    return i;
  }

  function die(i, vx, vy, reason = '') {
    d.alive[i] = 0;
    events.push({ type: 'killed', kind: CREATURE_NAMES[d.kind[i]], x: d.x[i], y: d.y[i], vx, vy, face: d.side[i], reason });
    if (d.kind[i] === CR_GCLAM && d.pearl[i]) { d.pearl[i] = 0; events.push({ type: 'pearlDrop', x: d.x[i], y: d.fy[i] - 0.38 }); }
  }

  // ------------------------------------------------------------ damage (2026-10-08, creature-rules.js)

  /** Is the creature's shell shut right now (a shut clam; a tentacle curled up in its shell)? The table's `shell` sources stop on it. */
  function shut(i) {
    const st = d.state[i];
    if (d.kind[i] === CR_GCLAM) return !(st === CL_OPEN || st === CL_TREMBLE || (st === CL_OPENING && d.ang[i] > 0.4));
    return st === TN_DORMANT || st === TN_RETRACT || st === TN_FED;
  }
  /** Body radius for blasts and hazards: the shell's half width. */
  const bodyR = (i) => (d.kind[i] === CR_GCLAM ? CLAM_HALF_W : 0.55);
  /**
   * The one way a clam or a tentacle takes a hit: creature-rules.js resolveHit for its kind and `src` (dmg < 0: the source's
   * own), with its shell's state. Both are anchored: no knock, no knock-out. A tentacle holding the octopus counts the damage
   * toward letting go; at 0 hp it dies (and lets go). Returns the damage dealt.
   */
  function applyHit(i, src, fx, fy, dmg = -1, octo = null) {
    if (!d.alive[i]) return 0;
    const o = resolveHit(CREATURE_NAMES[d.kind[i]], SOURCES[src] ? src : 'ink', dmg, shut(i));
    if (o.ignore || o.dmg <= 0) return 0;
    d.hp[i] -= o.dmg;
    if (d.kind[i] === CR_TENTACLE && d.state[i] === TN_GRAB) d.ink[i] += o.dmg;
    if (d.hp[i] <= 0 || o.kill) {
      if (d.kind[i] === CR_TENTACLE && d.state[i] === TN_GRAB && octo) release(i, octo, false);
      let dx = d.x[i] - fx, dy = d.y[i] - fy;
      const l = Math.hypot(dx, dy);
      if (l < 1e-4) { dx = 0; dy = 0; } else { dx /= l; dy /= l; }
      die(i, dx * (src === 'bomb' ? 3 : 0), dy * (src === 'bomb' ? 3 : 0) - 1, src);
    }
    return o.dmg;
  }

  function releaseNear(i, x, y, R, octo) {
    if (d.kind[i] !== CR_TENTACLE || d.state[i] !== TN_GRAB || !octo || !d.alive[i]) return false;
    const near = Math.max(0, Math.hypot(d.x[i] - x, d.y[i] - y) - bodyR(i) * 0.5) <= R || Math.hypot(octo.x - x, octo.y - y) <= R + 0.5;
    if (near) release(i, octo, false);
    return near;
  }

  // ------------------------------------------------------------ giant clam

  /** The octopus centre is in the open mouth. */
  function inMouth(i, octo) {
    return Math.abs(octo.x - d.x[i]) < CLAM_MOUTH_HALF_W && octo.y > d.fy[i] - CLAM_MOUTH_H && octo.y < d.fy[i] - 0.1;
  }

  function updateClam(i, dt, octo, world) {
    const st = d.state[i], cx = d.x[i], fy = d.fy[i];
    const near = !octo.dead && Math.hypot(octo.x - cx, octo.y - fy) < CLAM_WAKE_R;
    switch (st) {
      case CL_SHUT:
        d.ang[i] = 0;
        if (near) { d.t[i] -= dt; if (d.t[i] <= 0) { d.state[i] = CL_OPENING; d.t[i] = 0; } }
        break;
      case CL_OPENING: {
        d.t[i] += dt;
        const u = Math.min(1, d.t[i] / CLAM_OPENING_T);
        d.ang[i] = u * u * (3 - 2 * u);
        if (!near) { d.state[i] = CL_SNAP; d.t[i] = 0; events.push({ type: 'snap', x: cx, y: fy, kill: false, far: true }); break; }
        if (d.t[i] >= CLAM_OPENING_T) { d.state[i] = CL_OPEN; d.t[i] = 0; d.ang[i] = 1; }
        break;
      }
      case CL_OPEN: {
        d.t[i] += dt; d.ang[i] = 1;
        if (!near) { d.state[i] = CL_SNAP; d.t[i] = 0; events.push({ type: 'snap', x: cx, y: fy, kill: false, far: true }); break; }
        // INFIGHT.snap: a creature that swims into the open mouth sets the snap off now (the tremble still telegraphs it)
        const fishIn = inf !== null && inf.box('snap', '', cx - CLAM_MOUTH_HALF_W, fy - CLAM_MOUTH_H, cx + CLAM_MOUTH_HALF_W, fy - 0.1, creatureId(i)) > 0;
        if (d.t[i] >= CLAM_OPEN_T || fishIn) { d.state[i] = CL_TREMBLE; d.t[i] = 0; events.push({ type: 'tremble', x: cx, y: fy, by: fishIn ? 'creature' : '' }); }
        break;
      }
      case CL_TREMBLE:
        d.t[i] += dt; d.ang[i] = 1 - 0.06 * Math.min(1, d.t[i] / CLAM_TREMBLE_T);
        if (d.t[i] >= CLAM_TREMBLE_T) {
          d.state[i] = CL_SNAP; d.t[i] = 0;
          let kill = false;
          if (!octo.dead && inMouth(i, octo)) {
            // the body ends up pinned in the seam (side s = hinge side): head towards the hinge, arms trailing out of the front edge
            const s = d.side[i];
            const px = cx + s * 0.12, py = fy - 0.42;
            kill = killOctopus(octo, 'clam', 'clam', px, py, 90 * s);
            if (kill) d.fed[i] = 1;
          }
          // INFIGHT.snap: the lid crushes whatever else is in the mouth too
          const caught = inf !== null ? inf.box('snap', 'snap', cx - CLAM_MOUTH_HALF_W, fy - CLAM_MOUTH_H, cx + CLAM_MOUTH_HALF_W, fy - 0.1, creatureId(i)) : 0;
          events.push({ type: 'snap', x: cx, y: fy, kill, far: false, caught });
        }
        break;
      default: { // CL_SNAP: the lid slams shut
        d.t[i] += dt;
        d.ang[i] = Math.max(0, d.ang[i] - dt / CLAM_SNAP_T);
        if (d.ang[i] <= 0) { d.state[i] = CL_SHUT; d.t[i] = CLAM_SHUT_MIN + rnd(d.rs, i) * CLAM_SHUT_VAR; }
        break;
      }
    }
    if (octo.dead || octo.held > 0) return;
    const sn = d.state[i];
    // the pearl: taken while the shell is open (or trembling)
    if (d.pearl[i] && (sn === CL_OPEN || sn === CL_TREMBLE || (sn === CL_OPENING && d.ang[i] > 0.5))) {
      if (Math.hypot(octo.x - cx, octo.y - (fy - 0.38)) < PEARL_R + octo.radius * 0.8) {
        d.pearl[i] = 0;
        events.push({ type: 'pearl', x: cx, y: fy - 0.38, value: PEARL_VALUE });
      }
    }
    // a shut shell is a solid mound: swimming or dashing into it just bonks (no damage), the octopus is pushed out
    if (sn === CL_SHUT || sn === CL_SNAP || (sn === CL_OPENING && d.ang[i] < 0.25)) bonk(i, octo, world);
  }

  function bonk(i, octo, world) {
    const cx = d.x[i], top = d.fy[i] - CLAM_SHUT_H, r = octo.radius * 0.8;
    const hx = CLAM_HALF_W + r;
    const lx = octo.x - cx;
    if (Math.abs(lx) >= hx || octo.y <= top - r || octo.y >= d.fy[i]) return;
    // penetration out of the top and out of each side; take the smallest (the top when a side is rock)
    const pTop = octo.y - (top - r) , pSide = hx - Math.abs(lx);
    const side = lx >= 0 ? 1 : -1;
    const sideOpen = !world.isSolid(cx + side * (hx + 0.5), octo.y);
    const speedIn = Math.hypot(octo.vx, octo.vy);
    if (sideOpen && pSide < Math.abs(pTop) * 0.9 + 0.2) {
      octo.x = cx + side * hx; octo.prevX = octo.x;
      octo.vx = side * Math.max(Math.abs(octo.vx) * 0.3, BONK_PUSH);
    } else {
      octo.y = top - r; octo.prevY = octo.y;
      octo.vy = -Math.max(Math.abs(octo.vy) * 0.3, BONK_PUSH);
    }
    if (speedIn > 3) events.push({ type: 'bonk', x: octo.x, y: octo.y });
  }

  // ------------------------------------------------------------ tentacle

  function ease(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }

  function bodyFree(world, x, y, r) {
    return !world.isSolid(x + r, y) && !world.isSolid(x - r, y) && !world.isSolid(x, y + r) && !world.isSolid(x, y - r);
  }

  /** Let go of the octopus and fling it away from the shell. */
  function release(i, octo, stun) {
    if (octo.held > 0) {
      octo.held = 0;
      let ux = octo.x - d.mx[i], uy = octo.y - d.my[i];
      let l = Math.hypot(ux, uy);
      if (l < 1e-3) { ux = d.mdx[i]; uy = d.mdy[i]; l = 1; }
      octo.vx = ux / l * TENT_FLING; octo.vy = uy / l * TENT_FLING;
      octo.invulnTimer = Math.max(octo.invulnTimer, 0.6);
      octo.dashCooldown = Math.max(octo.dashCooldown, 0.3);
      events.push({ type: 'release', x: octo.x, y: octo.y });
    }
    d.squeeze[i] = 0; d.ink[i] = 0;
    d.cd[i] = TENT_REGRAB_CD;
    d.state[i] = stun ? TN_STUN : TN_RETRACT; d.t[i] = 0;
  }

  function startRetract(i, cd) { d.state[i] = TN_RETRACT; d.t[i] = 0; if (cd > d.cd[i]) d.cd[i] = cd; }

  function updateTentacle(i, dt, octo, world) {
    const mx = d.mx[i], my = d.my[i];
    if (d.cd[i] > 0) d.cd[i] = Math.max(0, d.cd[i] - dt);
    const st = d.state[i];
    const dist = Math.hypot(octo.x - mx, octo.y - my);
    const solidT = (tx, ty) => world.isSolid(tx, ty);
    if (st === TN_FED) { d.tipx[i] = mx; d.tipy[i] = my; return; }
    if (st === TN_GRAB) { grab(i, dt, octo, world); return; }
    let aware = !octo.dead && dist < TENT_LOSE_R && hasLineOfSight(solidT, mx, my, octo.x, octo.y);
    // INFIGHT.grab: the octopus first; while she is not in reach a tentacle hunts any free creature it can reach (d.tg = 1)
    if (d.tg[i] && aware && dist < TENT_WAKE_R && (st === TN_WAKE || st === TN_REACH)) d.tg[i] = 0; // she came close: back to her
    let ax = octo.x, ay = octo.y, adist = dist;
    if (d.tg[i]) {
      if (st === TN_DORMANT || st === TN_RETRACT || st === TN_STUN || !inf || !inf.locate(d.tgid[i])) d.tg[i] = 0;
      else {
        ax = inf.target.x; ay = inf.target.y; adist = Math.hypot(ax - mx, ay - my);
        aware = adist < TENT_LOSE_R && hasLineOfSight(solidT, mx, my, ax, ay);
      }
      if (!d.tg[i] && (st === TN_WAKE || st === TN_REACH || st === TN_STRIKE)) { startRetract(i, 0.6); return; } // the prey is gone
    }
    const prey = d.tg[i] === 1;
    switch (st) {
      case TN_DORMANT:
        d.tipx[i] = mx; d.tipy[i] = my;
        if (!octo.dead && d.cd[i] <= 0 && dist < TENT_WAKE_R && aware && inCameraView(mx, my)) { /* item 6: it never wakes from off-screen */ d.state[i] = TN_WAKE; d.t[i] = 0; events.push({ type: 'wake', x: mx, y: my }); }
        else if (inf && d.cd[i] <= 0 && inCameraView(mx, my) && inf.hunt('grab', mx, my, TENT_WAKE_R, creatureId(i), losSolid)) {
          d.tg[i] = 1; d.tgid[i] = inf.target.id; d.state[i] = TN_WAKE; d.t[i] = 0; events.push({ type: 'wake', x: mx, y: my, prey: inf.target.name });
        }
        break;
      case TN_WAKE: {
        d.t[i] += dt;
        if (!aware) { startRetract(i, 0.6); break; }
        // the limb uncoils out of the shell towards its target
        const k = ease(d.t[i] / TENT_WAKE_T) * Math.min(1.5, adist) / (adist || 1);
        d.tipx[i] = mx + (ax - mx) * k; d.tipy[i] = my + (ay - my) * k;
        if (d.t[i] >= TENT_WAKE_T) { d.state[i] = TN_REACH; d.t[i] = 0; }
        break;
      }
      case TN_REACH: {
        d.t[i] += dt;
        if (!aware || (!prey && octo.dead)) { startRetract(i, 0.6); break; }
        followTip(i, dt, ax, ay, world);
        if (d.t[i] >= TENT_REACH_T) {
          if (adist > TENT_REACH + 0.9) { startRetract(i, 0.6); break; } // out of reach: no strike
          d.state[i] = TN_STRIKE; d.t[i] = 0;
          d.sx[i] = d.tipx[i]; d.sy[i] = d.tipy[i];
          // the strike goes where its target is now, no further than the limb reaches
          let tx = ax, ty = ay;
          const l = Math.hypot(tx - mx, ty - my);
          if (l > TENT_REACH + 0.3) { tx = mx + (tx - mx) / l * (TENT_REACH + 0.3); ty = my + (ty - my) / l * (TENT_REACH + 0.3); }
          d.tx[i] = tx; d.ty[i] = ty;
          events.push({ type: 'strike', x: mx, y: my });
        }
        break;
      }
      case TN_STRIKE: {
        d.t[i] += dt;
        const u = 1 - Math.pow(1 - Math.min(1, d.t[i] / TENT_STRIKE_T), 3); // fast out, then settling
        d.tipx[i] = d.sx[i] + (d.tx[i] - d.sx[i]) * u; d.tipy[i] = d.sy[i] + (d.ty[i] - d.sy[i]) * u;
        // INFIGHT.grab: a strike at another creature crushes whatever free body the tip meets, then the limb pulls back in
        if (prey && d.cd[i] <= 0 && inf.strike('grab', 'grab', d.tipx[i], d.tipy[i], TENT_TIP_R + 0.15, creatureId(i)) >= 0) {
          events.push({ type: 'grabCreature', x: d.tipx[i], y: d.tipy[i], kind: inf.events.length ? inf.events[inf.events.length - 1].kind : '' });
          d.tg[i] = 0; startRetract(i, TENT_REGRAB_CD);
          break;
        }
        if (!prey && !octo.dead && d.cd[i] <= 0 && Math.hypot(octo.x - d.tipx[i], octo.y - d.tipy[i]) < TENT_TIP_R + octo.radius * 0.8) {
          d.state[i] = TN_GRAB; d.t[i] = 0; d.ink[i] = 0; d.squeeze[i] = 0;
          octo.held = 1; octo.struggles = 0; octo.stunT = 0; octo.spin = 0; octo.vx = octo.vy = 0;
          events.push({ type: 'grab', x: octo.x, y: octo.y });
          break;
        }
        if (d.t[i] >= TENT_STRIKE_T) { d.tg[i] = 0; startRetract(i, TENT_MISS_CD); } // a miss
        break;
      }
      case TN_STUN: {
        d.t[i] += dt;
        const k = Math.min(1, dt * 6);
        d.tipx[i] += (mx - d.tipx[i]) * k; d.tipy[i] += (my - d.tipy[i]) * k;
        if (d.t[i] >= TENT_STUN_T) { d.state[i] = TN_DORMANT; d.t[i] = 0; }
        break;
      }
      default: { // TN_RETRACT
        d.t[i] += dt;
        const k = Math.min(1, dt * 8);
        d.tipx[i] += (mx - d.tipx[i]) * k; d.tipy[i] += (my - d.tipy[i]) * k;
        if (d.t[i] >= 0.5) { d.state[i] = TN_DORMANT; d.t[i] = 0; d.tipx[i] = mx; d.tipy[i] = my; }
        break;
      }
    }
  }

  /** The reaching tip drifts slowly towards its target (the octopus, or INFIGHT.grab prey), within the limb's reach and never into rock. */
  function followTip(i, dt, ax, ay, world) {
    const mx = d.mx[i], my = d.my[i];
    let ux = ax - d.tipx[i], uy = ay - d.tipy[i];
    const l = Math.hypot(ux, uy);
    if (l < 1e-3) return;
    const step = Math.min(l, TENT_REACH_SPEED * dt);
    let nx = d.tipx[i] + ux / l * step, ny = d.tipy[i] + uy / l * step;
    const fromMouth = Math.hypot(nx - mx, ny - my);
    if (fromMouth > TENT_REACH) { nx = mx + (nx - mx) / fromMouth * TENT_REACH; ny = my + (ny - my) / fromMouth * TENT_REACH; }
    if (!world.isSolid(nx, ny)) { d.tipx[i] = nx; d.tipy[i] = ny; }
  }

  function grab(i, dt, octo, world) {
    const mx = d.mx[i], my = d.my[i];
    if (octo.dead || octo.held <= 0) { // something else ended it (it died, or a test freed it)
      d.squeeze[i] = 0; startRetract(i, 1);
      return;
    }
    d.t[i] += dt;
    d.squeeze[i] = Math.min(1, d.squeeze[i] + dt * 2.5);
    octo.held = 1; octo.vx = octo.vy = 0;
    if (octo.struggles >= TENT_STRUGGLES || d.ink[i] >= TENT_INK_FREE) { release(i, octo, true); return; }
    // drag towards the shell mouth; stay out of rock (slide along it, or hold still)
    const ux = mx - octo.x, uy = my - octo.y, l = Math.hypot(ux, uy);
    if (l > 0.3 && d.t[i] < TENT_GRAB_MAX) {
      const s = TENT_DRAG * dt / l, r = octo.radius * 0.8;
      octo.prevX = octo.x; octo.prevY = octo.y;
      let nx = octo.x + ux * s, ny = octo.y + uy * s;
      if (!bodyFree(world, nx, ny, r)) {
        if (bodyFree(world, nx, octo.y, r)) ny = octo.y;
        else if (bodyFree(world, octo.x, ny, r)) nx = octo.x;
        else { nx = octo.x; ny = octo.y; }
      }
      octo.x = nx; octo.y = ny;
    }
    d.tipx[i] = octo.x; d.tipy[i] = octo.y;
    if (l <= 0.3 || d.t[i] >= TENT_GRAB_MAX) { // pulled in
      const px = d.x[i] - d.mdx[i] * 0.1, py = d.y[i] - d.mdy[i] * 0.1;
      const ang = Math.atan2(-d.mdx[i], d.mdy[i]) * 180 / Math.PI; // head into the shell, arms trailing out of the mouth
      if (killOctopus(octo, 'tentacle', 'eaten', px, py, ang)) {
        d.state[i] = TN_FED; d.fed[i] = 1; d.squeeze[i] = 0;
        events.push({ type: 'eaten', x: px, y: py });
      } else release(i, octo, true); // a test hook (godMode) refuses styled kills
    }
  }

  return {
    data: d,
    events,
    /** Add one record directly (tests, debug). Returns its index, or -1 when full. */
    add,
    /** v2: the enemy-infighting runtime (infight.js): a clam's snap and a tentacle's grab reach other creatures. null: none. */
    setInfight(x) { inf = x; },
    count() { return d.n; },
    /** One fixed step (after the octopus moved). Picks up the creature records of every resident chunk once. */
    update(dt, octo, world, resident) {
      events.length = 0;
      curWorld = world;
      if (resident) {
        for (const { index, chunk } of resident) {
          if (loaded.has(index)) continue;
          loaded.add(index);
          for (const s of chunk.spawns) if (s.type === 'creature') add(s);
        }
      }
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        if (d.kind[i] === CR_GCLAM) updateClam(i, dt, octo, world); else updateTentacle(i, dt, octo, world);
      }
    },
    /** A bomb blast of radius R at (x, y), by the table (damage.js blast): a body whose edge is inside takes the bomb; a held
     * octopus is let go when the blast reaches her or the tentacle. Returns the kills. */
    blast(x, y, R, octo = null) {
      let n = 0;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        releaseNear(i, x, y, R, octo);
        const dd = Math.max(0, Math.hypot(d.x[i] - x, d.y[i] - y) - bodyR(i) * 0.5);
        if (dd > R) continue;
        applyHit(i, 'bomb', x, y, -1, octo);
        if (!d.alive[i]) n++;
      }
      return n;
    },
    /** A blast at (x, y) radius R lets a tentacle's held octopus go when it reaches either of them. True when it let go. */
    releaseNear,
    /** 2026-10-08: the one way a creature takes a hit (creature-rules.js); see applyHit. */
    applyHit,
    /** The damage.js family adapter (register it with damage.register). `octo` (optional getter) lets a killed tentacle let go. */
    family(getOcto = null) {
      return {
        name: 'creature',
        count() { return d.n; },
        view(i, V) {
          if (!d.alive[i]) return false;
          V.kind = CREATURE_NAMES[d.kind[i]]; V.x = d.x[i]; V.y = d.y[i]; V.r = bodyR(i); V.vx = 0; V.vy = 0; V.stun = 0;
          V.shut = shut(i); V.cool = d.hzCool[i]; V.blame = d.blame[i];
          V.id = creatureId(i); V.wound = d.hp[i] < (d.kind[i] === CR_GCLAM ? CLAM_HP : TENT_HP) ? 1 : 0;
          return true;
        },
        apply(i, src, fx, fy, dmg) { return applyHit(i, src, fx, fy, dmg, getOcto ? getOcto() : null); },
        push() {},
        setTimers(i, cool, blame) { if (cool >= 0) d.hzCool[i] = cool; if (blame >= 0) d.blame[i] = blame; },
      };
    },
    /** Something hits the circle (x, y, r) for `dmg` (src 'ink' | 'dash' | 'bomb'). Returns how many creatures were hit. */
    hit(x, y, r, dmg, src, octo = null) {
      let n = 0;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        let touched = false;
        if (d.kind[i] === CR_GCLAM) {
          // only the soft inside is vulnerable: while the shell is open
          const open = d.state[i] === CL_OPEN || d.state[i] === CL_TREMBLE || (d.state[i] === CL_OPENING && d.ang[i] > 0.4);
          touched = open && Math.abs(x - d.x[i]) < CLAM_HALF_W + r && y > d.fy[i] - CLAM_MOUTH_H - r && y < d.fy[i] + r;
        } else {
          const st = d.state[i];
          if (st === TN_WAKE || st === TN_REACH || st === TN_STRIKE || st === TN_GRAB || st === TN_STUN) {
            const mx = d.mx[i], my = d.my[i], tx = d.tipx[i], ty = d.tipy[i];
            for (let k = 0; k <= 4 && !touched; k++) {
              const u = k / 4;
              touched = Math.hypot(mx + (tx - mx) * u - x, my + (ty - my) * u - y) < r + 0.25;
            }
            if (!touched) touched = Math.hypot(d.x[i] - x, d.y[i] - y) < r + 0.55;
          }
        }
        if (!touched) continue;
        if (applyHit(i, src, x, y, dmg, octo) > 0) n++;
      }
      return n;
    },
    /** Creature codes within `range` of (x,y) with a clear line (journal sightings). */
    seen(x, y, range, isSolid) {
      const out = [];
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        const px = d.kind[i] === CR_TENTACLE ? d.mx[i] : d.x[i], py = d.kind[i] === CR_TENTACLE ? d.my[i] : d.y[i];
        if (Math.hypot(px - x, py - y) < range && hasLineOfSight(isSolid, x, y, px, py)) out.push(d.kind[i]);
      }
      return out;
    },
  };
}
