// The giant clam's pearl as a carried thing (Daniel 2026-10-18: "if you find a pearl in the level, it should be bigger and you
// must bring it to the exit portal where it gets converted into the moon shell"). One per level at most: only the level's one
// pearl clam holds it (creatures.js gives the pearl to one clam of the level), and a level without a giant clam has none.
//
//   - It is big (PEARL_BIG_R, about 0.85 tiles across) and HEAVY: in the hand it slows the swim like a stunned shopkeeper
//     (PEARL_WEIGHT), it takes no hit for the octopus (no shield) and while it is held nothing else can be grabbed.
//   - Thrown or dropped it sinks and rolls (a ball on the traced walls: little rolling friction, it runs down a slope), so it
//     can be lost down a shaft or into a spike pit; bombs knock it about (blast). It never breaks.
//   - Enemies ignore it: it is in no creature's target list and no family of the damage table.
//   - Carried into the exit whirlpool and the hand pressed there (main.js), the whirlpool takes it (take(): a short swirl into
//     the whirlpool's centre) and a moon shell (shells.js SK_MOON) is paid.
//
// One body, plain fields (no pool needed for one thing); no allocation per step. Drawing: pearl-draw.js.

import { resolveCircleVsSegments, resolveCircleVsGrid, contact } from './physics.js';
import { jetForceAt } from './hazards.js';

export const PEARL_BIG_R = 0.42;   // tiles (0.84 across)
export const PEARL_WEIGHT = 0.45;  // hand carryMul: the stunned shopkeeper's weight (altar.js registerKeeperGrab)
export const PEARL_THROW = 6;      // u/s: a heavy throw (the keeper's)
export const PEARL_CLAM_REACH = 0.85; // the hand must be this near the pearl in an open clam (closer than HAND_REACH: into the mouth)
export const GRAV = 3.5, DRAG = 0.8, ROLL_DRAG = 0.5, RESTITUTION = 0.3, ROLL_FRICTION = 0.15; // sinks at about 4.4 u/s; on the floor less drag: it rolls
export const BLAST_POWER = 9;      // a bomb shoves it a little less than a corpse (it is heavy)
export const SWIRL_T = 0.7;        // s: taken by the whirlpool
const BOUNCE_MIN = 0.8, BOUNCE_FULL = 2.5, SLEEP_SPEED = 0.1, SLEEP_TIME = 0.6, STICK_SPEED = 0.25, MAX_SPEED = 12;
const FAST2 = 3 * 3; // (u/s)^2: in flight, not a hand target

export const PL_NONE = 0, PL_FREE = 1, PL_REST = 2, PL_CARRY = 3, PL_SWIRL = 4, PL_GONE = 5;

const B = { x: 0, y: 0, vx: 0, vy: 0, radius: PEARL_BIG_R };

export function createPearl() {
  const p = {
    state: PL_NONE, x: 0, y: 0, vx: 0, vy: 0, prevX: 0, prevY: 0, rot: 0, spin: 0, r: PEARL_BIG_R,
    still: 0, grounded: false, lastVersion: -1, nx: 0, ny: -1,
    swirlT: 0, sx: 0, sy: 0, cx: 0, cy: 0, // the swirl: from (sx, sy) into the whirlpool centre (cx, cy)
    taken: 0, // times the whirlpool took it (tests)
  };
  return p;
}

/** Is the pearl lying about (a hand target, physics on)? */
export function pearlLoose(p) { return p.state === PL_FREE || p.state === PL_REST; }
/** Is it anywhere in the level (loose, carried or swirling)? */
export function pearlInLevel(p) { return p.state !== PL_NONE && p.state !== PL_GONE; }

/** The pearl comes out into the water at (x, y) (out of a clam, or put down by a test). */
export function spawnPearl(p, x, y, vx = 0, vy = 0) {
  p.state = PL_FREE; p.x = p.prevX = x; p.y = p.prevY = y; p.vx = vx; p.vy = vy; p.rot = 0; p.spin = vx * 1.2; p.still = 0;
  return p;
}
export function clearPearl(p) { p.state = PL_NONE; p.vx = p.vy = 0; p.lastVersion = -1; }

export function carryPearl(p) { if (pearlLoose(p)) { p.state = PL_CARRY; p.vx = p.vy = 0; p.still = 0; } }
export function placePearl(p, x, y, vx = 0, vy = 0) { p.x = x; p.y = y; p.vx = vx; p.vy = vy; }
/** Let go with (vx, vy): it rolls on (spin from the throw). */
export function releasePearl(p, vx = 0, vy = 0) {
  if (p.state !== PL_CARRY) return;
  p.state = PL_FREE; p.vx = vx; p.vy = vy; p.spin = vx / PEARL_BIG_R * 0.5; p.still = 0;
  clampSpeed(p);
}
/** The whirlpool takes it: a short swirl into (cx, cy), then it is gone. Returns false when it is not carried or loose. */
export function takePearl(p, cx, cy) {
  if (p.state !== PL_CARRY && !pearlLoose(p)) return false;
  p.state = PL_SWIRL; p.swirlT = 0; p.sx = p.x; p.sy = p.y; p.cx = cx; p.cy = cy; p.vx = p.vy = 0; p.taken++;
  return true;
}

function clampSpeed(p) {
  const s = Math.hypot(p.vx, p.vy);
  if (s > MAX_SPEED) { const m = MAX_SPEED / s; p.vx *= m; p.vy *= m; }
}

/** A bomb at (x, y), radius R: a radial shove (linear falloff to 2R), like a corpse. Returns true when it was moved. */
export function blastPearl(p, x, y, R, power = BLAST_POWER) {
  if (!pearlLoose(p)) return false;
  let dx = p.x - x, dy = p.y - y, dist = Math.hypot(dx, dy);
  const reach = R * 2;
  if (dist > reach) return false;
  if (dist < 1e-4) { dx = 0; dy = -1; dist = 1; } else { dx /= dist; dy /= dist; }
  const f = (1 - Math.min(1, dist / reach)) * power;
  p.state = PL_FREE; p.still = 0;
  p.vx += dx * f; p.vy += dy * f - f * 0.15; p.spin += dx * f;
  clampSpeed(p);
  return true;
}

function collide(p, world) {
  B.x = p.x; B.y = p.y; B.vx = p.vx; B.vy = p.vy; B.radius = p.r;
  contact.hit = 0;
  if (typeof world.wallSegmentsNear === 'function') resolveCircleVsSegments(B, world.wallSegmentsNear(B.x, B.y, B.radius));
  else resolveCircleVsGrid(B, world);
  let hit = false;
  if (contact.hit) {
    hit = true;
    const vn = contact.vn, e = RESTITUTION * Math.min(1, (-vn - BOUNCE_MIN) / BOUNCE_FULL);
    if (-vn > BOUNCE_MIN && e > 0) { B.vx += -e * vn * contact.nx; B.vy += -e * vn * contact.ny; }
    if (contact.ny < -0.3) p.grounded = true;
    p.nx = contact.nx; p.ny = contact.ny;
  }
  p.x = B.x; p.y = B.y; p.vx = B.vx; p.vy = B.vy;
  return hit;
}

/** Inside rock (a crater filled, a block landed on it): the nearest open tile centre. */
function eject(p, world) {
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let r = 1; r <= 5; r++) {
    let best = -1, bx = 0, by = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || world.isSolid(cx + dx + 0.5, cy + dy + 0.5)) continue;
      const dd = (cx + dx + 0.5 - p.x) ** 2 + (cy + dy + 0.5 - p.y) ** 2;
      if (best < 0 || dd < best) { best = dd; bx = cx + dx + 0.5; by = cy + dy + 0.5; }
    }
    if (best >= 0) { p.x = bx; p.y = by; p.vx = p.vy = 0; p.state = PL_FREE; p.still = 0; return; }
  }
}

/** One fixed step: water gravity and drag, the jets, the walls, rolling, sleep; the swirl. `hd` = hazards.data (jets) or null. */
export function stepPearl(p, dt, world, hd = null) {
  p.prevX = p.x; p.prevY = p.y;
  if (p.state === PL_SWIRL) {
    p.swirlT += dt;
    const u = Math.min(1, p.swirlT / SWIRL_T), k = 1 - u, a = u * Math.PI * 2.5;
    p.x = p.cx + (p.sx - p.cx) * k * Math.cos(a) - (p.sy - p.cy) * k * Math.sin(a) * 0.6;
    p.y = p.cy + (p.sy - p.cy) * k * Math.cos(a) + (p.sx - p.cx) * k * Math.sin(a) * 0.6;
    p.rot += dt * 9;
    if (u >= 1) p.state = PL_GONE;
    return;
  }
  if (!world) return;
  const v = world.tileVersion;
  if (v !== undefined && v !== p.lastVersion) { if (p.lastVersion !== -1 && p.state === PL_REST) { p.state = PL_FREE; p.still = 0; } p.lastVersion = v; }
  if (p.state === PL_REST) {
    if (hd) for (let h = 0; h < hd.n; h++) { const f = jetForceAt(hd, h, p.x, p.y); if (f) { p.state = PL_FREE; p.still = 0; break; } } // a jet under it lifts it again
    if (p.state === PL_REST) return;
  }
  if (p.state !== PL_FREE) return;
  if (world.isSolid(p.x, p.y)) eject(p, world);
  p.vy += GRAV * dt;
  if (hd) for (let h = 0; h < hd.n; h++) { const f = jetForceAt(hd, h, p.x, p.y); if (f) { p.vx += f.fx * dt * 0.6; p.vy += f.fy * dt * 0.6; } } // heavy: a jet lifts it less than a corpse
  const f = 1 / (1 + dt * (p.grounded ? ROLL_DRAG : DRAG)); // (grounded: from the last step)
  p.vx *= f; p.vy *= f;
  clampSpeed(p);
  p.grounded = false;
  const sp = Math.hypot(p.vx, p.vy);
  const steps = sp * dt > p.r * 0.5 ? Math.min(8, Math.ceil(sp * dt / (p.r * 0.5))) : 1, sub = dt / steps;
  let touched = false;
  for (let s = 0; s < steps; s++) { p.x += p.vx * sub; p.y += p.vy * sub; if (collide(p, world)) touched = true; }
  if (touched) {
    // a ball: little rolling friction along the surface, so it runs on down a slope; it only stops on (nearly) flat ground
    const tx = -p.ny, ty = p.nx, vt = p.vx * tx + p.vy * ty, vtN = vt / (1 + dt * ROLL_FRICTION);
    p.vx += (vtN - vt) * tx; p.vy += (vtN - vt) * ty;
    if (Math.hypot(p.vx, p.vy) < STICK_SPEED && Math.abs(p.nx) < 0.12 && p.ny < -0.5) { p.vx = 0; p.vy = 0; }
  }
  if (p.grounded) p.spin += (p.vx / p.r - p.spin) * Math.min(1, 10 * dt); else p.spin *= 1 / (1 + dt);
  p.rot += p.spin * dt;
  if (touched && Math.hypot(p.vx, p.vy) < SLEEP_SPEED) {
    p.still += dt;
    if (p.still >= SLEEP_TIME) { p.state = PL_REST; p.vx = p.vy = 0; p.spin = 0; }
  } else p.still = 0;
}

/**
 * The hand kind 'pearl' (hand.js): the pearl in the level's open pearl clam (env.clamPearl() -> {x, y, i} or null, taken with
 * env.takeClamPearl(i)) or lying loose. env = { pearl() -> the pearl state or null, clamPearl(), takeClamPearl(i), onGrab() }.
 * `registerInteract` / `PRI_THING` are passed in (hand.js), so this file stays free of the hand's imports for the unit tests.
 */
export function registerPearlGrab(registerInteract, priority, env) {
  registerInteract('pearl', {
    priority,
    find(octo, reach) {
      const p = env.pearl();
      if (!p) return null;
      if (pearlLoose(p) && p.vx * p.vx + p.vy * p.vy <= FAST2) {
        const d = Math.hypot(p.x - octo.x, p.y - octo.y) - p.r * 0.5;
        if (d < reach) return { x: p.x, y: p.y, ref: -1 };
      }
      const c = env.clamPearl ? env.clamPearl(octo, PEARL_CLAM_REACH) : null; // the pearl still in its open clam
      return c ? { x: c.x, y: c.y, ref: c.i } : null;
    },
    use(t) {
      const p = env.pearl();
      if (!p) return null;
      if (t.ref >= 0) { // out of the open clam: it comes loose into the tentacles
        if (!env.takeClamPearl(t.ref)) return null;
        spawnPearl(p, t.x, t.y, 0, 0);
      }
      if (!pearlLoose(p)) return null;
      carryPearl(p);
      if (env.onGrab) env.onGrab(p);
      return pearlHeld(p);
    },
  });
}

/** The HELD record (hand.js) of the carried pearl. */
export function pearlHeld(p) {
  const pos = { x: 0, y: 0, vx: 0, vy: 0 };
  let carried = true;
  return {
    pearl: p, r: p.r, weight: PEARL_WEIGHT, shield: false, speed: PEARL_THROW, dmg: 4,
    place(x, y, vx, vy) { placePearl(p, x, y, vx, vy); },
    alive() { return carried ? p.state === PL_CARRY : pearlLoose(p); },
    release(vx, vy) { carried = false; releasePearl(p, vx, vy); },
    pos() { pos.x = p.x; pos.y = p.y; pos.vx = p.vx; pos.vy = p.vy; return pos; },
    bounce(f) { p.vx *= f; p.vy *= f; },
    impact() {}, // it never breaks
  };
}
