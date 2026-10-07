// Enemies: urchin, piranha, cannon + its shot, and the Beholder chaser.
// OVERNIGHT.md §4 M3-1: "one small behaviour object per kind so M6 only adds
// entries." Spawned from each chunk's `enemy-slot` spawns (gen.js, tagged by
// placement: floor/ceiling/wall/open) via a small depth table, pooled and
// despawned with the chunk that owns them. The Beholder is not chunk-owned:
// it is a single, always-resident chaser that appears once at
// BEHOLDER_SPAWN_TIME.
//
// Sources: `NPC25` (urchin), `NPC21`/`SidePiranha` (piranha),
// `NPC30`+`NPC32Ball` (cannon+shot), `Beholder_*` (46 frames) --
// octomancer-unity/Assets/Sprites/NPCs/**, `unity/Scripts/Player/EyeChaser.cs`
// for the Beholder's straight-line chase. DECISIONS-2026-09-29.md §2.
//
// M6 (2021 creatures, `OldAssets/.../NPC.old/`): crabs
// (`CrabFlatten`/`CrabFlatten2`), spike horns (`NPC6`), manta (`NPC10` +
// `NPC10Ball`). OVERNIGHT.md §4 M6.

import {
  URCHIN_RADIUS, PIRANHA_RADIUS, PIRANHA_CHASE_SPEED,
  PIRANHA_CHASE_RANGE, CANNON_RADIUS, CANNON_RANGE,
  CANNON_SHOT_SPEED, CANNON_SHOT_RADIUS, BEHOLDER_SPAWN_TIME,
  BEHOLDER_SPAWN_HEIGHT, BEHOLDER_RADIUS, BEHOLDER_SPEED, BEHOLDER_SPEED_RAMP,
  DASH_KILL_SPEED, ENEMY_MIN_DEPTH,
  CRAB_RADIUS, CRAB_SPEED_SLOW, CRAB_SPEED_FAST,
  HORNS_RADIUS,
  MANTA_RADIUS, MANTA_SPEED, MANTA_PATROL_RANGE, MANTA_SINE_AMPLITUDE, MANTA_SINE_FREQ,
} from './config.js';
import { PK_BOMB } from './props.js';
import { hurtOctopus, killOctopus } from './octopus.js';
import { resolveCircleVsGrid, resolveCircleVsSegments } from './physics.js';
import { hasLineOfSight, findSmoothPath, resetPathBudget } from './pathfind.js';

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Round-6 task 5 (NIGHT-LOG.md): "give moving enemies (piranha, crab, manta,
// Beholder) the same wall collision as the octopus so they never overlap
// rock". `resolveCircleVsGrid` (physics.js) is exactly the octopus's own
// per-substep collision resolver; enemies move at low enough speed (no dash)
// that a single resolve per fixed step (no sub-stepping) is enough to keep
// them out of rock without tunnelling.
//
// Round-8 fix (NIGHT-LOG.md item 3): same switch as the octopus's own
// `integrateWithCollision` in physics.js -- when `world` exposes
// `wallSegmentsNear` (it does), enemies collide against the exact same
// traced+smoothed outline segments the wall art draws instead of the raw
// tile grid, so a piranha or crab sliding along a diagonal rim follows the
// same rounded shape the octopus and the drawn rock do.
// Round-10 fix (review round 9 leftover, issue A5: "piranhas overlap the
// rock: the wall-separation radius should cover the drawn sprite"). Wall
// collision below used to resolve against `e.radius` -- the small physics
// circle (`PIRANHA_RADIUS`=0.4) used for octopus-contact damage -- while the
// piranha's own drawn sprite reads about 1.8 tiles long (enemy-draw.js's
// round-2 note on the Unity collider it was matched to, also why the
// enemy-vs-enemy separation pass above already gives it a much bigger
// `ENEMY_SEP_HALF_EXTENT`). A piranha could swim its visible body a third of
// a tile into a wall before the small physics circle ever touched it. Wall
// collision now resolves against the larger of the two -- the same visual
// half-extent the separation pass uses where one is defined for this kind,
// otherwise falls back to the physics radius unchanged.
function wallCollisionRadius(e) { return e.wallR || Math.max(e.radius, ENEMY_SEP_HALF_EXTENT[e.kind] ?? 0); }
function resolveWallsAt(e, world) {
  if (typeof world.wallSegmentsNear === 'function') {
    resolveCircleVsSegments(e, world.wallSegmentsNear(e.x, e.y, e.radius));
  } else {
    resolveCircleVsGrid(e, { isSolid: (tx, ty) => world.isSolid(tx, ty) });
  }
}

// Round-11 fix (review round 10 leftover, issue 1: "piranhas still visibly
// swim into rock -- head and belly cross the rim by 0.2-0.4 tile"). A single
// 0.68-tile circle (the round-10 fix's `ENEMY_SEP_HALF_EXTENT.piranha`,
// tuned for enemy-vs-enemy separation) can only bound one axis of the
// piranha's actual footprint at once: the sprite (enemy-draw.js, worldSize
// 1.15 at the image's 204x128 aspect) reads about 1.83 tiles long and 1.15
// tiles tall, but is only ever flipped left/right, never rotated -- its long
// axis is always screen/world x. A 0.68 circle covers the 0.58-tile
// perpendicular (top/bottom) half-extent with room to spare, but falls
// 0.25-0.3 tile short of the 0.9-tile nose-to-tail half-length, letting the
// head or tail sink into a wall the fish is swimming straight at or along.
// `collidePiranhaWithWalls` samples 3 points along that fixed body axis
// (nose, centre, tail) with the smaller perpendicular radius instead of one
// big circle -- close to the review's suggested capsule/3-point check,
// without needing a full capsule-vs-segments resolver.
const PIRANHA_BODY_HALF_LEN = 0.85; // tiles, nose-to-tail half length (image aspect 204/128 * 1.15 worldSize / 2 ~= 0.92, kept slightly inside the art edge)
const PIRANHA_BODY_HALF_HEIGHT = 0.52; // tiles, perpendicular (top/bottom) half-extent
const PIRANHA_TURN_PROBE = PIRANHA_BODY_HALF_LEN + 0.55; // r36: how far ahead of its centre a patrolling piranha looks for rock: where the wall collision (nose circle) starts to push, so it turns just before it touches rock
function collidePiranhaWithWalls(e, world) {
  const origRadius = e.radius;
  e.radius = PIRANHA_BODY_HALF_HEIGHT;
  for (const off of [PIRANHA_BODY_HALF_LEN, -PIRANHA_BODY_HALF_LEN, 0]) {
    e.x += off;
    resolveWallsAt(e, world);
    e.x -= off;
  }
  e.radius = origRadius;
}

// Round-12 fix (review round 11 leftover: "the manta's wings go into rock").
// Same root cause as round-11's piranha fix: `collideWithWalls`'s single
// circle for a manta used `ENEMY_SEP_HALF_EXTENT.manta` (0.55), tuned for
// enemy-vs-enemy separation, not the ~1.4-tile-wide glide sprite (twice the
// piranha's own long axis) -- a wingtip could sink well into rock the body
// centre never touched, and the "turn around near a wall" look-ahead check
// in `updateManta` used the even smaller physics radius (`MANTA_RADIUS`=0.5)
// for its own probe, so the manta often only reversed after a wingtip was
// already inside the rock. Samples 3 points along the fixed wing axis (both
// tips + centre), same pattern as `collidePiranhaWithWalls`.
const MANTA_WING_HALF_LEN = 1.4; // tiles, wingtip-to-wingtip half length (sprite reads ~2.8 tiles wide)
const MANTA_BODY_HALF_HEIGHT = 0.4; // tiles, perpendicular (top/bottom) half-extent
function collideMantaWithWalls(e, world) {
  const origRadius = e.radius;
  e.radius = MANTA_BODY_HALF_HEIGHT;
  for (const off of [MANTA_WING_HALF_LEN, -MANTA_WING_HALF_LEN, 0]) {
    e.x += off;
    resolveWallsAt(e, world);
    e.x -= off;
  }
  e.radius = origRadius;
}

function collideWithWalls(e, world) {
  if (e.kind === 'piranha') { collidePiranhaWithWalls(e, world); return; }
  // Swap in the (possibly larger) wall-collision radius just for the
  // resolve call, then restore `e.radius` -- the resolvers mutate `e.x`/
  // `e.y` in place, so `e` itself (not a copy) must be passed through, but
  // `e.radius` elsewhere (octopus-contact damage, enemy separation) must
  // keep meaning the small physics circle.
  const origRadius = e.radius;
  e.radius = wallCollisionRadius(e);
  resolveWallsAt(e, world);
  e.radius = origRadius;
}

// Round-7 fix (Daniel's screenshot review round 6, item 3: "piranhas stack
// into a double-decker"). The old flat 0.55-tile minimum was tuned to the
// enemies' small physics collision radii (PIRANHA_RADIUS=0.4 etc, used for
// octopus-contact damage only), not their much bigger drawn sprites -- a
// piranha's art reads about 1.8 tiles long (enemy-draw.js's own round-2 note
// on the Unity collider it was matched to), so two chasing piranhas could sit
// well inside 0.55 tiles of each other and overlap by more than half their
// length. Each kind now carries its own approximate visual half-extent
// (`ENEMY_SEP_HALF_EXTENT`, tiles) and a pair's minimum separation is the SUM
// of the two half-extents -- close to the sprite's own footprint -- instead
// of one fixed constant for every kind. Kinds not listed keep the old
// half-extent (0.275, i.e. the previous 0.55 split evenly).
const ENEMY_MIN_SEP_DEFAULT_HALF = 0.275;
const ENEMY_SEP_HALF_EXTENT = {
  piranha: 0.68, // two piranhas -> 1.36 tiles apart, inside the review's suggested 1.2-1.5 range
  crab: 0.45,
  manta: 0.55,
};
function sepHalfExtent(kind) { return ENEMY_SEP_HALF_EXTENT[kind] ?? ENEMY_MIN_SEP_DEFAULT_HALF; }

// Round-12 fix (review round 11 leftover, item "same-kind enemies overlap"):
// the pairwise separation above only ever used one ISOTROPIC half-extent per
// kind (a circle), which under-covers a long, thin sprite along its own axis
// (a manta's ~1.4-tile wingspan, a piranha's ~0.9-tile nose-to-tail length)
// while over-covering the perpendicular axis. Each kind now also carries a
// per-AXIS (x, y) half-extent, matched to the drawn sprite footprint --
// manta ~1.4x0.4, piranha ~0.9x0.55 (matches `PIRANHA_BODY_HALF_LEN`/
// `_HEIGHT` above so the enemy-vs-enemy and enemy-vs-wall checks agree),
// urchin ~0.5 (its spiky sphere reads round, so x=y). Kinds without an entry
// fall back to the old scalar default on both axes. Also, `separateEnemies`
// used to skip any pair unless BOTH sides were `moving` -- a static
// emplacement (urchin) never pushed back, so a moving enemy pathing
// past one could visibly sit right on top of it. The loop below still skips
// two STATIC enemies against each other (they never move, nothing to
// resolve), but now separates a moving enemy from a static one too, pushing
// only the moving side.
const ENEMY_SEP_EXTENT = {
  piranha: { hx: 0.9, hy: 0.55 },
  manta: { hx: 1.4, hy: 0.4 },
  urchin: { hx: 0.5, hy: 0.5 },
  crab: { hx: 0.45, hy: 0.45 },
};
function sepExtent(kind) {
  const e = ENEMY_SEP_EXTENT[kind];
  return e || { hx: ENEMY_MIN_SEP_DEFAULT_HALF, hy: ENEMY_MIN_SEP_DEFAULT_HALF };
}

/** Cheap O(n^2) pairwise separation pass (enemy counts per chunk are small,
 * single digits) -- pushes any two enemies whose per-axis half-extent boxes,
 * projected along the line between them, overlap back apart along that
 * line. A static enemy (urchin, horns, cannon) never moves itself, but
 * still pushes a moving enemy off of it. */
function separateEnemies(list) {
  for (let pass = 0; pass < 3; pass++) separatePass(list, pass);
}
function separatePass(list, pass) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      if (!a.moving && !b.moving) continue; // two static emplacements: nothing to resolve
      const ea = sepExtent(a.kind), eb = sepExtent(b.kind);
      const dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      let nx, ny;
      if (d < 1e-6) { nx = (a.id & 1) ? 1 : -1; ny = 0; d = 0; } // exactly on top of each other: split sideways (r36)
      else { nx = dx / d; ny = dy / d; }
      // Box half-extent sum projected onto the connecting direction --
      // cheap stand-in for a proper ellipse/box-vs-box test, but (unlike a
      // single circle) scales down on the short axis and up on the long
      // one, matching an elongated sprite far better.
      const minSep = Math.abs(nx) * (ea.hx + eb.hx) + Math.abs(ny) * (ea.hy + eb.hy);
      if (d >= minSep) continue;
      const push = minSep - d;
      if (a.moving && b.moving) {
        a.x -= nx * push / 2; a.y -= ny * push / 2;
        b.x += nx * push / 2; b.y += ny * push / 2;
      } else if (a.moving) {
        a.x -= nx * push; a.y -= ny * push;
      } else {
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

/** A* chase step shared by the Beholder and a spotted piranha (round-6 task
 * 5): recomputes a smoothed path a few times a second (`REPATH_INTERVAL`,
 * staggered per-enemy by its own id so many chasers don't all recompute on
 * the same step), steers toward the next waypoint, and falls back to a
 * direct line whenever that line already has clear line-of-sight (cheaper
 * than a search, and reads identically). Keeps the original's
 * always-closing-distance feel: `speed` is whatever the caller already
 * computed (ramped for the Beholder, constant for a piranha), this only
 * changes the STEERING direction, never whether the chaser is closing in.
 */
const REPATH_INTERVAL = 0.25; // seconds
function chaseWithPath(e, world, targetX, targetY, speed, dt) {
  if (e.pathTimer === undefined) { e.pathTimer = (e.id % 7) * 0.03; e.path = null; e.pathIndex = 0; }
  const isSolid = (tx, ty) => world.isSolid(tx, ty);
  e.pathTimer -= dt;
  // the straight line must be clear for the whole body, not just its centre ray: two more rays a body radius to each side
  let directClear = hasLineOfSight(isSolid, e.x, e.y, targetX, targetY);
  if (directClear && e.wallR) {
    const dx = targetX - e.x, dy = targetY - e.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l * e.wallR, ny = dx / l * e.wallR;
    directClear = hasLineOfSight(isSolid, e.x + nx, e.y + ny, targetX + nx, targetY + ny) && hasLineOfSight(isSolid, e.x - nx, e.y - ny, targetX - nx, targetY - ny);
  }
  if (directClear) {
    e.path = null;
  } else if (e.pathTimer <= 0 || !e.path || e.pathIndex >= e.path.length) {
    e.pathTimer = REPATH_INTERVAL;
    const p = findSmoothPath(isSolid, e.x, e.y, targetX, targetY);
    if (p && p.length) { e.path = p; e.pathIndex = 0; }
  }
  let aimX = targetX, aimY = targetY;
  if (!directClear && e.path && e.path.length) {
    // Advance past any waypoint already reached (or already behind us, if
    // the chaser overshot it a little).
    while (e.pathIndex < e.path.length - 1 && dist(e.x, e.y, e.path[e.pathIndex].x, e.path[e.pathIndex].y) < 0.35) {
      e.pathIndex++;
    }
    const wp = e.path[Math.min(e.pathIndex, e.path.length - 1)];
    aimX = wp.x; aimY = wp.y;
  }
  const dx = aimX - e.x, dy = aimY - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * speed;
  e.vy = (dy / d) * speed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

/** Deterministic per-chunk RNG (same tiny LCG pattern as pickups.js), used
 * only to pick which enemy kind fills each generator-tagged slot so the same
 * seed always spawns the same enemies. */
function makeRng(seedSalt) {
  let m = seedSalt >>> 0 || 1;
  return () => { m = (m * 1664525 + 1013904223) >>> 0; return m / 4294967296; };
}

// Round-4 fix (Daniel's screenshot review round 3: "ceiling crabs render
// upside down and float -- the original never had ceiling crabs"). Crabs are
// floor-only now, matching the Unity original (`CrabFlatten`/`CrabFlatten2`
// walk the floor, never the ceiling); `horns` stays available on both floor
// and ceiling, but only on a "flat run" anchor (gen.js's `flatRun`, set
// false at convex ceiling/floor corners) -- Daniel's review: "horns at
// convex ceiling corners hang in open water below the rim".
function pickKind(placement, depth, rng, flatRun, nearSideWall, mantaFit = true, narrowShaft = false) {
  const candidates = [];
  if (placement === 'open') {
    candidates.push('piranha');
    if (depth > 100 && mantaFit) candidates.push('manta');
  } else {
    candidates.push('urchin');
    // Round-6 fix (reviewer leftover, NIGHT-LOG.md task 6: "floor
    // enemies/decor must not hang past convex corners -- need full flat
    // support under the sprite"). `crab` is ~0.7 world units (over half a
    // tile) wide and walks -- unlike `horns`, which was already flatRun-only
    // since round-4, a crab anchored right at a convex floor corner used to
    // spawn with its far side hanging past the rim into open water before
    // its very first patrol step ever turned it around.
    if (placement === 'floor' && flatRun) candidates.push('crab');
    if ((placement === 'floor' || placement === 'ceiling') && flatRun && !(placement === 'ceiling' && narrowShaft)) candidates.push('horns');
  }
  // Round-11 fix (review round 10 leftover, issue 3): skip a cannon slot at
  // a concave floor/ceiling-meets-wall corner (gen.js's `nearSideWall`) --
  // its round body has no per-side inset to correct for a second,
  // perpendicular wall, so it reads half-buried and drawn over the wall's
  // rim there. `wall` placements are unaffected (their own solid side isn't
  // a corner).
  if (depth > 80 && (placement === 'floor' || placement === 'wall') && !nearSideWall) candidates.push('cannon');
  if (candidates.length > 1) return candidates[Math.floor(rng() * candidates.length)];
  return candidates[0];
}

let nextId = 1;

// M1-0 combat spike (?auto=1 only, V2-PLAN section 4): hit points per kind.
// Urchin and horns are hazards (Daniel's Q7): no hp, so Ink Jet ignores them.
let hpMode = false;
const ENEMY_HP = { piranha: 6, crab: 10, cannon: 14, manta: 16 };
export function setHpMode(on) { hpMode = !!on; }

// ---------------------------------------------------------------------------------------------------------------
// Round 35: readable, Spelunky-style patterns. Every kind runs a small state machine on flat fields of its record
// (`st` state, `t` timer, `tell` 0..1 while it telegraphs, `rs` its own xorshift32 state so a seed always replays the
// same way). Nothing here calls Math.random.
//
//   piranha  PS_PATROL  idle drift +-5 tiles, turns at rock (probe = the hull, not a tile centre)
//            PS_WINDUP  0.4 s: stops, faces you, flashes white (tell)
//            PS_LUNGE   straight line at 7 u/s along the direction locked at the end of the wind-up
//            PS_RECOVER 1 s: recoils and drifts, then back to patrol
//   crab     CS_WALK    walks its ledge, turns at wall / ledge / resting bomb; octopus within 1.5 -> CS_PAUSE
//            CS_PAUSE   0.35 s rears up (tell), CS_SNAP 0.2 s snaps (reach +0.4), CS_COOL 1 s
//   cannon   CN_TRACK   turns its barrel slowly toward you (needs a clear line and the half plane it faces)
//            CN_CHARGE  0.6 s glow, still turning at 40% rate; fires along the barrel, not at you
//            CN_RELOAD  2 s
//   manta    MA_GLIDE   wide sine glide; octopus below and within 1.2 tiles sideways with a clear drop -> MA_TELL
//            MA_TELL    0.6 s stops, tilts and flashes; MA_DIVE steep dive to where you were; MA_RISE climbs back; 3 s cooldown
//   urchin, horns: static; the spikes pulse slowly (2.6 s) and the contact radius pulses with them
// ---------------------------------------------------------------------------------------------------------------
export const PS_PATROL = 0, PS_WINDUP = 1, PS_LUNGE = 2, PS_RECOVER = 3;
export const PIRANHA_WINDUP = 0.4, PIRANHA_LUNGE_SPEED = 7, PIRANHA_LUNGE_MAX = 1.1, PIRANHA_RECOVER = 1.0;
export const PIRANHA_IDLE_SPEED = 1.5, PIRANHA_PATROL_RANGE = 5, PIRANHA_NOTICE = PIRANHA_CHASE_RANGE;
export const CS_WALK = 0, CS_PAUSE = 1, CS_SNAP = 2, CS_COOL = 3;
export const CRAB_SNAP_RANGE = 1.5, CRAB_PAUSE = 0.35, CRAB_SNAP = 0.2, CRAB_COOL = 1.0, CRAB_SNAP_REACH = 0.4;
export const CN_TRACK = 0, CN_CHARGE = 1, CN_RELOAD = 2;
export const CANNON_WINDUP = 0.6, CANNON_RELOAD = 2.0, CANNON_TURN = 1.2, CANNON_ARC = Math.PI / 2 - 0.12, CANNON_AIM_OK = 0.3;
export const MA_GLIDE = 0, MA_TELL = 1, MA_DIVE = 2, MA_RISE = 3;
export const MANTA_TELL = 0.6, MANTA_DIVE_SPEED = 6.5, MANTA_DIVE_MAX = 1.1, MANTA_RISE_SPEED = 2.8, MANTA_DIVE_COOLDOWN = 3;
export const URCHIN_PULSE_PERIOD = 2.6;
export const HIT_STOP = 0.06; // s the whole sim freezes on a dash kill
const TAU = Math.PI * 2;

function seedOf(x, y, kind) {
  let h = (Math.imul(Math.floor(x * 64) + 1013, 374761393) ^ Math.imul(Math.floor(y * 64) + 7, 668265263) ^ Math.imul(kind.length * 31 + kind.charCodeAt(0), 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) || 1;
}
/** xorshift32 on the enemy's own `rs` field, [0,1). */
function rnd(e) {
  let s = e.rs;
  s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0;
  e.rs = s;
  return s / 4294967296;
}
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
function sgn(v, d = 1) { return v > 0 ? 1 : v < 0 ? -1 : d; }

/** The direction a cannon faces out of its surface (radians, y down). */
function cannonOut(placement, wallDir) {
  if (placement === 'ceiling') return Math.PI / 2;
  if (placement === 'wall' && wallDir) return wallDir > 0 ? Math.PI : 0; // solid on the right: faces left
  return -Math.PI / 2; // floor, open
}

function makeEnemy(kind, x, y, chunkIndex, placement, wallDir = 0) {
  // `moving`: which kinds get wall collision + the minimum-separation pass. Static emplacements
  // (urchin / cannon / horns) are anchored by decor.js / gen.js's own surface placement.
  const base = {
    id: nextId++, kind, x, y, prevX: x, prevY: y, vx: 0, vy: 0, dead: false,
    chunkIndex, placement, wallDir, hitFlash: 0, moving: false, stun: 0, kvx: 0, kvy: 0,
    st: 0, t: 0, tell: 0, ph: 0, face: 1, rs: seedOf(x, y, kind),
  };
  base.ph = rnd(base) * TAU;
  if (hpMode && ENEMY_HP[kind]) { base.hp = ENEMY_HP[kind]; base.maxHp = base.hp; }
  if (kind === 'urchin') {
    return { ...base, radius: URCHIN_RADIUS, r0: URCHIN_RADIUS, contactDamage: true, dashKillable: false, pulse: 0.5 };
  }
  if (kind === 'piranha') {
    const dir = rnd(base) < 0.5 ? -1 : 1;
    return {
      ...base, radius: PIRANHA_RADIUS, contactDamage: true, dashKillable: true, moving: true,
      dir, face: dir, chasing: false, baseX: x, baseY: y, flipCd: 0, stuck: 0, st: PS_PATROL, t: 0.3 + rnd(base) * 0.7,
      lx: 0, ly: 0, ltrav: 0, lmax: 0, rvx: 0, rvy: 0,
    };
  }
  if (kind === 'cannon') {
    const out = cannonOut(placement, wallDir);
    return { ...base, radius: CANNON_RADIUS, contactDamage: false, dashKillable: false, st: CN_RELOAD, t: 1 + rnd(base), out, aim: out };
  }
  if (kind === 'crab') {
    const fast = rnd(base) < 0.4;
    const dir = rnd(base) < 0.5 ? -1 : 1;
    return {
      ...base, radius: CRAB_RADIUS, contactDamage: true, dashKillable: true, moving: true,
      dir, face: dir, speed: fast ? CRAB_SPEED_FAST : CRAB_SPEED_SLOW, variant: fast ? 'fast' : 'slow', cool: 0, snapHit: false, st: CS_WALK, stuck: 0, flipCd: 0,
    };
  }
  if (kind === 'horns') {
    return { ...base, radius: HORNS_RADIUS, r0: HORNS_RADIUS, contactDamage: true, dashKillable: false, immune: true, pulse: 0.5 };
  }
  if (kind === 'manta') {
    const dir = rnd(base) < 0.5 ? -1 : 1;
    return {
      ...base, radius: MANTA_RADIUS, contactDamage: true, dashKillable: true, moving: true,
      dir, face: dir, baseX: x, baseY: y, st: MA_GLIDE, cool: 1.5, stuck: 0, flipCd: 0, tx: 0, ty: 1, dived: 0,
    };
  }
  return base;
}

/** Is a hull of half length `reach` ahead of (x, y) in direction dir blocked (three samples across `halfH`)? */
function blockedAhead(world, x, y, dir, reach, halfH) {
  for (let k = -1; k <= 1; k++) if (world.isSolid(x + dir * reach, y + k * halfH)) return true;
  return false;
}

// its body is 1.8 across but it squeezes through the 2-tile passages the level generator guarantees: the wall collision
// uses a smaller circle (it used to wedge on rim corners with a clear straight line)
const BEHOLDER_WALL_R = 0.55;
const BEHOLDER_CLEAR = 1; // tiles of open space around its spawn cell (its body is 1.8 across)
/** v2: the open cell, reachable from the octopus, nearest to `BEHOLDER_SPAWN_HEIGHT` above it but at least 13 tiles away
 * (off screen on every viewport). Null when the world has no grid or nothing fits. */
function findBeholderSpawn(octo, world) {
  const W = world.width, H = world.height;
  if (!W || !H || typeof world.isSolid !== 'function') return null;
  const sx = Math.floor(octo.x), sy = Math.floor(octo.y);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  const seen = new Uint8Array(W * H), queue = new Int32Array(W * H);
  let qh = 0, qt = 0;
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !world.isSolid(x + 0.5, y + 0.5);
  if (!open(sx, sy)) return null;
  seen[sy * W + sx] = 1; queue[qt++] = sy * W + sx;
  const aimX = octo.x, aimY = octo.y - BEHOLDER_SPAWN_HEIGHT;
  let best = -1, bestScore = Infinity;
  while (qh < qt) {
    const i = queue[qh++], x = i % W, y = (i / W) | 0;
    const d = Math.hypot(x + 0.5 - octo.x, y + 0.5 - octo.y);
    if (d >= 13) {
      let clear = true;
      for (let dy = -BEHOLDER_CLEAR; dy <= BEHOLDER_CLEAR && clear; dy++) for (let dx = -BEHOLDER_CLEAR; dx <= BEHOLDER_CLEAR; dx++) if (!open(x + dx, y + dy)) { clear = false; break; }
      if (clear) {
        const sc = Math.hypot(x + 0.5 - aimX, y + 0.5 - aimY);
        if (sc < bestScore) { bestScore = sc; best = i; }
      }
    }
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!open(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; queue[qt++] = ny * W + nx;
    }
  }
  return best < 0 ? null : { x: (best % W) + 0.5, y: ((best / W) | 0) + 0.5 };
}

/** Nudge a body that ended up inside rock to the nearest open cell centre (spiral over 4 tiles). */
function ejectFromRock(e, world) {
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  for (let r = 1; r <= 4; r++) {
    let best = -1, bx = 0, by = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || world.isSolid(cx + dx + 0.5, cy + dy + 0.5)) continue;
      const dd = (cx + dx + 0.5 - e.x) ** 2 + (cy + dy + 0.5 - e.y) ** 2;
      if (best < 0 || dd < best) { best = dd; bx = cx + dx + 0.5; by = cy + dy + 0.5; }
    }
    if (best >= 0) { e.x = bx; e.y = by; e.kvx = e.kvy = e.vx = e.vy = 0; return true; }
  }
  return false;
}

/** Is a static emplacement (urchin, horns, cannon) still standing on its surface tile? */
function supported(e, world) {
  if (e.placement === 'floor') return world.isSolid(e.x, e.y + 0.9);
  if (e.placement === 'ceiling') return world.isSolid(e.x, e.y - 0.9);
  if (e.placement === 'wall' && e.wallDir) return world.isSolid(e.x + e.wallDir * 0.9, e.y);
  return true;
}

export function createEnemies() {
  /** @type {Map<number, any[]>} enemies grouped by owning chunk index */
  const byChunk = new Map();
  const spawnedChunks = new Set();
  /** @type {any[]} */
  let shots = [];
  let beholder = null;
  const ghosts = []; // a dash-killed enemy lingers 60 ms, flashing white, while the sim freezes (hit-stop)
  let tileVer = -1;
  const events = []; // consumed by main.js each frame: {type:'enemyKilled'|'shotFired'|'hitStop'|'beholderSpawned', ...}

  function spawnFromSlots(index, chunk, yOffset) {
    if (spawnedChunks.has(index)) return;
    spawnedChunks.add(index);
    // v2 whole-level chunk (world-v2.js): per-level salt, no depth gate, and a
    // depth bias so kind tiers (manta, cannon) can appear in a 68-row level.
    const rng = makeRng(chunk.salt !== undefined ? chunk.salt : index * 104729 + 7);
    const list = [];
    for (const s of chunk.spawns) {
      if (s.type !== 'enemy-slot') continue;
      const wy = s.y + yOffset;
      if (!chunk.noDepthGate && wy < ENEMY_MIN_DEPTH) continue;
      const kind = s.kind || pickKind(s.placement, wy + (chunk.depthBias || 0), rng, s.flatRun !== false, !!s.nearSideWall, s.mantaFit !== false, !!s.narrowShaft);
      list.push(makeEnemy(kind, s.x, wy, index, s.placement, s.wallDir || 0));
    }
    if (list.length) byChunk.set(index, list);
  }

  const liveCache = []; // reusable list for autofire (rebuilt each step in hpMode)
  const stepList = []; // every enemy of this step (rebuilt once per update)
  let hazData = null; // hazards.js data (v2): anemone / spike anchors the crab and piranha turn probes avoid
  function allEnemies() {
    const out = [];
    for (const list of byChunk.values()) for (let i = 0; i < list.length; i++) out.push(list[i]);
    return out;
  }

  function killEnemy(e, reason) {
    if (e.dead) return;
    e.dead = true;
    events.push({ type: 'enemyKilled', kind: e.kind, x: e.x, y: e.y, reason });
    if (reason === 'dash') {
      // hit-stop: a white ghost of the enemy stays for 60 ms and main.js freezes the sim for as long
      // r36: the ghost is only a white silhouette: no wind-up cue, '!' or glow (the enemy it copies is dead)
      ghosts.push({ ...e, dead: false, ghost: true, t: HIT_STOP, hitFlash: 1.2, stun: 0, tell: 0, st: 0, prevX: e.x, prevY: e.y });
      events.push({ type: 'hitStop', dur: HIT_STOP });
    }
  }

  /** A stunned enemy drifts on its knockback velocity (drag, walls) until the stun runs out, then picks its pattern up again. */
  function stepKnock(e, dt, world) {
    e.stun = Math.max(0, e.stun - dt);
    e.x += e.kvx * dt; e.y += e.kvy * dt;
    const f = 1 / (1 + dt * 3.5);
    e.kvx *= f; e.kvy *= f;
    e.vx = e.kvx; e.vy = e.kvy;
    if (e.moving) collideWithWalls(e, world);
    if (e.stun <= 0) resetPattern(e);
  }
  function resetPattern(e) {
    e.tell = 0;
    if (e.kind === 'piranha') { e.st = PS_PATROL; e.t = 0.5; e.flipCd = 0; }
    else if (e.kind === 'crab') { e.st = CS_WALK; e.cool = 0.5; }
    else if (e.kind === 'cannon') { e.st = CN_RELOAD; e.t = 1.0; }
    else if (e.kind === 'manta') { e.st = MA_GLIDE; e.cool = 1.5; }
  }

  /** r36: is another live enemy's hull in the way ahead of `e` (direction `dir`, within `margin` tiles of touching)?
   * A patroller that only turned at rock used to keep swimming into an urchin or horns while separateEnemies pushed it
   * back, hovering motionless against the spike; every patroller now treats any other enemy as an obstacle. */
  function enemyAhead(e, dir, margin) {
    const ea = sepExtent(e.kind);
    for (let i = 0; i < stepList.length; i++) {
      const o = stepList[i];
      if (o === e || o.dead) continue;
      const eo = sepExtent(o.kind);
      const dx = (o.x - e.x) * dir;
      if (dx < -0.1 || dx > ea.hx + eo.hx + margin) continue;
      if (Math.abs(o.y - e.y) < ea.hy + eo.hy) return true;
    }
    return false;
  }

  // r38: hazard anchors (anemone clusters, spike walls) are obstacles for the crab and piranha turn probes too: a crab
  // used to walk straight into an anemone on its floor. Same hazard codes as hazards.js (kept local: no import cycle).
  const HZ_SPIKES_K = 2, HZ_ANEMONE_K = 5;
  function blockerAhead(e, dir, margin, cx, cy, r) {
    const dx = (cx - e.x) * dir;
    return dx > -0.1 && dx < e.radius + r + margin && Math.abs(cy - e.y) < e.radius + r;
  }
  function hazardAhead(e, dir, margin) {
    const d = hazData;
    if (!d) return false;
    for (let i = 0; i < d.n; i++) {
      const k = d.kind[i];
      if (k === HZ_ANEMONE_K) { if (blockerAhead(e, dir, margin, d.x[i], d.y[i] + 0.05, 0.55)) return true; }
      else if (k === HZ_SPIKES_K) {
        const tx = -d.dy[i], ty = d.dx[i];
        for (let j = -1; j <= 1; j++) if (blockerAhead(e, dir, margin, d.x[i] + tx * j - d.dx[i] * 0.15, d.y[i] + ty * j - d.dy[i] * 0.15, 0.35)) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------ piranha
  function piranhaRecover(e, hit) {
    e.st = PS_RECOVER; e.t = PIRANHA_RECOVER; e.tell = 0;
    const k = hit ? 3.2 : 1.2;
    e.rvx = -e.lx * k; e.rvy = -e.ly * k;
  }
  function updatePiranha(e, dt, octo, world) {
    const px = e.x, py = e.y;
    const seesOcto = () => dist(e.x, e.y, octo.x, octo.y) < PIRANHA_NOTICE && hasLineOfSight((tx, ty) => world.isSolid(tx, ty), e.x, e.y, octo.x, octo.y);
    e.chasing = e.st === PS_WINDUP || e.st === PS_LUNGE;
    switch (e.st) {
      case PS_PATROL: {
        e.ph += dt * 1.3;
        e.t = Math.max(0, e.t - dt);
        e.flipCd = Math.max(0, e.flipCd - dt);
        e.vx = e.dir * PIRANHA_IDLE_SPEED;
        e.vy = Math.cos(e.ph) * 0.35 + Math.max(-0.6, Math.min(0.6, (e.baseY - e.y) * 0.5));
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideWithWalls(e, world);
        // turn at the end of its range, or when the hull would meet rock (probe = nose + body radius, not a tile centre);
        // a piranha that is not getting anywhere turns too (smoothed rims bulge a little past the tile edge)
        const moved = Math.abs(e.x - px);
        e.stuck = moved < 0.55 * PIRANHA_IDLE_SPEED * dt ? e.stuck + dt : 0; // r36: 0.3 let one hovering at 0.01 per step through
        const far = (e.x - e.baseX) * e.dir > PIRANHA_PATROL_RANGE;
        if (e.flipCd <= 0 && (far || e.stuck > 0.2 || blockedAhead(world, e.x, e.y, e.dir, PIRANHA_TURN_PROBE, 0.45) || enemyAhead(e, e.dir, 0.4) || hazardAhead(e, e.dir, 0.4))) {
          e.dir = -e.dir; e.flipCd = 0.6; e.stuck = 0;
        }
        e.face = e.dir;
        if (e.t <= 0 && seesOcto()) {
          e.st = PS_WINDUP; e.t = PIRANHA_WINDUP; e.vx = e.vy = 0; e.tell = 0;
          e.face = sgn(octo.x - e.x, e.face);
        }
        break;
      }
      case PS_WINDUP: {
        e.vx = e.vy = 0;
        e.t -= dt; e.tell = Math.min(1, 1 - e.t / PIRANHA_WINDUP);
        e.face = sgn(octo.x - e.x, e.face);
        if (e.t <= 0) {
          const dx = octo.x - e.x, dy = octo.y - e.y, d = Math.hypot(dx, dy) || 1;
          e.lx = dx / d; e.ly = dy / d; e.lmax = d + 1.5; e.ltrav = 0;
          e.st = PS_LUNGE; e.t = PIRANHA_LUNGE_MAX; e.tell = 0; e.face = sgn(e.lx, e.face);
        }
        break;
      }
      case PS_LUNGE: {
        e.vx = e.lx * PIRANHA_LUNGE_SPEED; e.vy = e.ly * PIRANHA_LUNGE_SPEED;
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideWithWalls(e, world);
        const moved = Math.hypot(e.x - px, e.y - py);
        e.ltrav += moved; e.t -= dt;
        if (moved < 0.4 * PIRANHA_LUNGE_SPEED * dt || e.t <= 0 || e.ltrav >= e.lmax) piranhaRecover(e, false);
        break;
      }
      default: { // PS_RECOVER
        e.t -= dt;
        e.rvx *= 1 - Math.min(1, dt * 2.5); e.rvy *= 1 - Math.min(1, dt * 2.5);
        e.vx = e.rvx; e.vy = e.rvy;
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideWithWalls(e, world);
        if (e.t <= 0) { e.st = PS_PATROL; e.t = 0.3; e.flipCd = 0; e.dir = e.face; }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ cannon
  function updateCannon(e, dt, octo, world) {
    // the target: octopus in range, inside the half plane the cannon faces, with a clear line
    let target = false, want = e.out;
    if (dist(e.x, e.y, octo.x, octo.y) < CANNON_RANGE) {
      const a = Math.atan2(octo.y - e.y, octo.x - e.x);
      if (Math.abs(angDiff(a, e.out)) <= CANNON_ARC && hasLineOfSight((tx, ty) => world.isSolid(tx, ty), e.x, e.y, octo.x, octo.y)) { target = true; want = a; }
    }
    // turn slowly toward it (slower while charging), or back to rest
    const rate = (e.st === CN_CHARGE ? CANNON_TURN * 0.4 : CANNON_TURN) * dt;
    const diff = angDiff(want, e.aim);
    e.aim += Math.max(-rate, Math.min(rate, diff));
    if (e.st === CN_RELOAD) {
      e.t -= dt;
      if (e.t <= 0) { e.st = CN_TRACK; e.t = 0; }
    } else if (e.st === CN_TRACK) {
      if (target && Math.abs(angDiff(want, e.aim)) < CANNON_AIM_OK) { e.st = CN_CHARGE; e.t = CANNON_WINDUP; e.tell = 0; }
    } else { // CN_CHARGE
      e.t -= dt; e.tell = Math.min(1, 1 - e.t / CANNON_WINDUP);
      if (!target) { e.st = CN_TRACK; e.tell = 0; return; } // lost the line: stand down
      if (e.t <= 0) {
        const ca = Math.cos(e.aim), sa = Math.sin(e.aim);
        shots.push({ x: e.x + ca * 0.5, y: e.y + sa * 0.5, vx: ca * CANNON_SHOT_SPEED, vy: sa * CANNON_SHOT_SPEED, radius: CANNON_SHOT_RADIUS, dead: false });
        events.push({ type: 'shotFired', kind: 'cannon' });
        e.st = CN_RELOAD; e.t = CANNON_RELOAD; e.tell = 0;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ crab
  function bombAhead(e, props) {
    if (!props) return false;
    const d = props.data;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.kind[i] !== PK_BOMB) continue;
      const dx = (d.x[i] - e.x) * e.dir;
      if (dx > -0.2 && dx < e.radius + d.radius[i] + 0.25 && Math.abs(d.y[i] - e.y) < 0.8) return true;
    }
    return false;
  }
  function updateCrab(e, dt, octo, world, props) {
    const groundDy = e.placement === 'ceiling' ? -1 : 1;
    e.cool = Math.max(0, e.cool - dt);
    e.flipCd = Math.max(0, e.flipCd - dt);
    const near = dist(e.x, e.y, octo.x, octo.y) < CRAB_SNAP_RANGE && Math.abs(octo.y - e.y) < 1.3;
    switch (e.st) {
      case CS_WALK: {
        // sinks if the floor under it was bombed away
        if (groundDy === 1 && !world.isSolid(e.x, e.y + 0.6)) { e.y += 2.5 * dt; e.vy = 2.5; } else e.vy = 0;
        const step = e.dir * e.speed * dt;
        const cx0 = e.x;
        e.x += step;
        const aheadX = e.x + e.dir * (e.radius + 0.15);
        if (world.isSolid(aheadX, e.y) || bombAhead(e, props) || (e.flipCd <= 0 && (enemyAhead(e, e.dir, 0.3) || hazardAhead(e, e.dir, 0.3)))) {
          e.x -= step; e.dir *= -1; e.flipCd = 0.5; // wall, resting bomb or another enemy ahead: undo the step and turn around
        } else if (!world.isSolid(aheadX, e.y + groundDy)) {
          e.dir *= -1; // no ledge ahead: turn around before walking off it
        }
        e.vx = e.dir * e.speed; e.face = e.dir;
        collideWithWalls(e, world);
        // r36 stuck detector (as the piranha and manta have): a crab that is not getting anywhere turns round
        e.stuck = Math.abs(e.x - cx0) < 0.55 * e.speed * dt ? e.stuck + dt : 0;
        if (e.stuck > 0.4) { e.dir = -e.dir; e.face = e.dir; e.stuck = 0; e.flipCd = 0.5; }
        if (e.cool <= 0 && near) { e.st = CS_PAUSE; e.t = CRAB_PAUSE; e.dir = sgn(octo.x - e.x, e.dir); e.face = e.dir; e.vx = 0; e.tell = 0; }
        break;
      }
      case CS_PAUSE:
        e.vx = 0; e.t -= dt; e.tell = Math.min(1, 1 - e.t / CRAB_PAUSE);
        e.dir = sgn(octo.x - e.x, e.dir); e.face = e.dir;
        if (e.t <= 0) { e.st = CS_SNAP; e.t = CRAB_SNAP; e.tell = 0; e.snapHit = false; }
        break;
      case CS_SNAP:
        e.vx = 0; e.t -= dt;
        if (!e.snapHit && dist(e.x + e.dir * 0.2, e.y, octo.x, octo.y) < e.radius + octo.radius + CRAB_SNAP_REACH) {
          e.snapHit = true;
          hurtOctopus(octo, e.x, e.y, 'crab');
        }
        if (e.t <= 0) { e.st = CS_COOL; e.t = CRAB_COOL; }
        break;
      default: // CS_COOL
        e.vx = 0; e.t -= dt;
        if (e.t <= 0) { e.st = CS_WALK; e.cool = 0.4; }
    }
  }

  // ------------------------------------------------------------------------------------------ manta
  function mantaFits(world, x, y) {
    for (const dy of [-MANTA_BODY_HALF_HEIGHT, 0, MANTA_BODY_HALF_HEIGHT]) {
      if (world.isSolid(x - MANTA_WING_HALF_LEN - 0.2, y + dy) || world.isSolid(x + MANTA_WING_HALF_LEN + 0.2, y + dy)) return false;
    }
    return true;
  }
  function updateManta(e, dt, octo, world) {
    const px = e.x, py = e.y;
    e.ph += dt * MANTA_SINE_FREQ;
    e.cool = Math.max(0, e.cool - dt);
    e.flipCd = Math.max(0, e.flipCd - dt);
    const glideY = e.baseY + Math.sin(e.ph) * MANTA_SINE_AMPLITUDE;
    switch (e.st) {
      case MA_GLIDE: {
        e.vx = e.dir * MANTA_SPEED;
        let nx = e.x + e.vx * dt;
        // wide back-and-forth around its spawn point; it turns while a wingtip (plus margin) is still clear of rock
        if (Math.abs(nx - e.baseX) > MANTA_PATROL_RANGE) e.dir *= -1;
        if (!mantaFits(world, nx, e.y) || (e.flipCd <= 0 && enemyAhead(e, e.dir, 0.3))) { e.dir = -e.dir; nx = e.x; e.flipCd = 0.6; }
        e.x = nx;
        const ny = e.y + Math.max(-3 * dt, Math.min(3 * dt, glideY - e.y));
        if (mantaFits(world, e.x, ny)) e.y = ny;
        e.vy = (e.y - py) / dt;
        collideMantaWithWalls(e, world);
        const moved = Math.abs(e.x - px);
        e.stuck = moved < 0.55 * MANTA_SPEED * dt ? e.stuck + dt : 0;
        if (e.stuck > 0.3) { e.dir = -e.dir; e.stuck = 0; }
        e.face = e.dir;
        // octopus below it, in line, with a clear drop: tell, then dive
        if (e.cool <= 0) {
          const dy = octo.y - e.y;
          if (Math.abs(octo.x - e.x) < 1.2 && dy > 1.5 && dy < 7 && hasLineOfSight((tx, ty) => world.isSolid(tx, ty), e.x, e.y, octo.x, octo.y)) {
            e.st = MA_TELL; e.t = MANTA_TELL; e.vx = e.vy = 0; e.tell = 0;
          }
        }
        break;
      }
      case MA_TELL:
        e.vx = e.vy = 0; e.t -= dt; e.tell = Math.min(1, 1 - e.t / MANTA_TELL);
        if (e.t <= 0) {
          const dx = octo.x - e.x, dy = octo.y - e.y, d = Math.hypot(dx, dy) || 1;
          e.tx = dx / d; e.ty = dy / d; e.tell = 0;
          if (e.ty < 0.5) { e.st = MA_RISE; e.cool = MANTA_DIVE_COOLDOWN; break; }
          e.st = MA_DIVE; e.t = MANTA_DIVE_MAX; e.dived = 0;
        }
        break;
      case MA_DIVE: {
        e.vx = e.tx * MANTA_DIVE_SPEED; e.vy = e.ty * MANTA_DIVE_SPEED;
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideMantaWithWalls(e, world);
        const moved = Math.hypot(e.x - px, e.y - py);
        e.t -= dt; e.dived += moved;
        if (moved < 0.4 * MANTA_DIVE_SPEED * dt || e.t <= 0 || e.dived > 6.5) { e.st = MA_RISE; e.cool = MANTA_DIVE_COOLDOWN; }
        break;
      }
      default: { // MA_RISE: climb back to its glide line
        const dy = glideY - e.y;
        e.vx = 0; e.vy = Math.max(-MANTA_RISE_SPEED, Math.min(MANTA_RISE_SPEED, dy * 3));
        e.y += e.vy * dt;
        collideMantaWithWalls(e, world);
        if (Math.abs(glideY - e.y) < 0.2 || Math.abs(e.y - py) < 0.2 * MANTA_RISE_SPEED * dt) e.st = MA_GLIDE;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ shots, beholder
  function updateShots(dt, octo, world, hurtFn) {
    for (const s of shots) {
      if (s.dead) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (world.isSolid(s.x, s.y)) { s.dead = true; continue; }
      if (dist(s.x, s.y, octo.x, octo.y) < s.radius + octo.radius) {
        hurtFn(octo, s.x, s.y, "shot");
        s.dead = true;
      }
    }
    shots = shots.filter((s) => !s.dead);
  }

  function updateBeholder(dt, octo, time, hurtFn, world) {
    if (!beholder && time >= BEHOLDER_SPAWN_TIME) {
      // v2 (a level grid): the nearest open cell reachable from the octopus, off screen; before, it spawned at
      // octo.y - 20 even when that was rock or outside the level and sat there forever
      const sp = findBeholderSpawn(octo, world) || { x: octo.x, y: octo.y - BEHOLDER_SPAWN_HEIGHT };
      beholder = {
        id: nextId++, kind: 'beholder', x: sp.x, y: sp.y,
        prevX: sp.x, prevY: sp.y,
        vx: 0, vy: 0, radius: BEHOLDER_RADIUS, wallR: BEHOLDER_WALL_R, dead: false, spawnedAt: time, moving: true,
      };
      events.push({ type: 'beholderSpawned', x: beholder.x, y: beholder.y });
    }
    if (!beholder) return;
    beholder.prevX = beholder.x; beholder.prevY = beholder.y;
    const aliveFor = time - beholder.spawnedAt;
    const speed = BEHOLDER_SPEED + BEHOLDER_SPEED_RAMP * (aliveFor / 10);
    // It collides with the grid like every other moving enemy and chases with A* (the piranha no longer does).
    chaseWithPath(beholder, world, octo.x, octo.y, speed, dt);
    collideWithWalls(beholder, world);
    if (dist(beholder.x, beholder.y, octo.x, octo.y) < beholder.radius + octo.radius) { // dead: it keeps knocking the body about (octopus.js hitBody)
      killOctopus(octo, 'beholder');
    }
  }

  return {
    /** v2: hand over the level's hazard data (hazards.js `data`) so patrolling enemies turn before an anemone or spike wall. */
    setHazardData(d) { hazData = d; },
    events,
    /** All resident enemies plus the Beholder (if spawned) and any hit-stop ghosts, for rendering. */
    all() {
      const a = allEnemies();
      if (beholder) a.push(beholder);
      for (let i = 0; i < ghosts.length; i++) a.push(ghosts[i]);
      return a;
    },
    shots() { return shots; },
    beholder() { return beholder; },

    /** One fixed step. `props` (v2, optional): resting bombs make a crab turn around. */
    update(dt, time, octo, world, resident, props = null) {
      events.length = 0;
      for (let i = ghosts.length - 1; i >= 0; i--) { ghosts[i].t -= dt; if (ghosts[i].t <= 0) ghosts.splice(i, 1); }
      const liveChunks = new Set(resident.map((r) => r.index));
      for (const { index, yOffset, chunk } of resident) spawnFromSlots(index, chunk, yOffset);
      for (const ci of [...byChunk.keys()]) {
        // -1 holds test/debug spawns from __octo.spawn(), never chunk-owned.
        if (ci !== -1 && !liveChunks.has(ci)) byChunk.delete(ci); // despawn with the chunk
      }

      // Round-6 task 3 (render interpolation) + task 5 (A* budget): snapshot
      // last step's position before anything moves, and give every chaser
      // this step's share of the shared pathfinding node budget.
      resetPathBudget();
      stepList.length = 0;
      for (const list of byChunk.values()) for (let i = 0; i < list.length; i++) stepList.push(list[i]);
      for (let i = 0; i < stepList.length; i++) { const e = stepList[i]; e.prevX = e.x; e.prevY = e.y; }

      // a static emplacement whose surface tile was bombed away is gone (it would float)
      const ver = world.tileVersion;
      if (ver !== undefined && ver !== tileVer) {
        if (tileVer !== -1) for (let i = 0; i < stepList.length; i++) { const e = stepList[i]; if (!e.moving && !e.dead && !supported(e, world)) e.dead = true; }
        tileVer = ver;
      }

      const octoSpeed = Math.hypot(octo.vx, octo.vy);
      for (let i = 0; i < stepList.length; i++) {
        const e = stepList[i];
        if (e.dead) continue;
        if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (e.stun > 0) { stepKnock(e, dt, world); continue; } // knocked about by a blast: no AI, no contact damage
        if (e.kind === 'piranha') updatePiranha(e, dt, octo, world);
        else if (e.kind === 'cannon') updateCannon(e, dt, octo, world);
        else if (e.kind === 'crab') updateCrab(e, dt, octo, world, props);
        else if (e.kind === 'manta') updateManta(e, dt, octo, world);
        else if (e.kind === 'urchin' || e.kind === 'horns') {
          // slow spike pulse: the drawn spikes and the contact radius breathe together
          e.ph += dt * TAU / URCHIN_PULSE_PERIOD;
          e.pulse = 0.5 + 0.5 * Math.sin(e.ph);
          e.radius = e.r0 * (0.92 + 0.2 * e.pulse);
        }

        if (!e.contactDamage) continue;
        // the dead body (V2-PLAN 14) is still a target: contact hits it (octopus.js hitBody), but a flung corpse never kills
        // (a corpse wedged in a gap narrower than the enemy is still in reach of its nose: +0.25)
        if (dist(e.x, e.y, octo.x, octo.y) < e.radius + octo.radius + (octo.dead ? 0.25 : 0)) {
          if (e.dashKillable && !octo.dead && octoSpeed >= DASH_KILL_SPEED) {
            killEnemy(e, 'dash');
          } else {
            hurtOctopus(octo, e.x, e.y, e.kind);
            if (e.kind === 'piranha' && e.st === PS_LUNGE) piranhaRecover(e, true); // it bit: it recoils
          }
        }
      }
      separateEnemies(stepList);
      // Round-11 fix: re-clamp every moving enemy against walls once more right after separation so a push from
      // this step never gets to render as an overlap; and (r35) nothing may stay inside rock.
      for (let i = 0; i < stepList.length; i++) {
        const e = stepList[i];
        if (e.dead || !e.moving) continue;
        collideWithWalls(e, world);
        if (world.isSolid(e.x, e.y)) ejectFromRock(e, world);
      }
      // Prune dead enemies out of their chunk lists (dash/bomb kills).
      for (const [ci, list] of byChunk) {
        const filtered = list.filter((e) => !e.dead);
        if (filtered.length !== list.length) byChunk.set(ci, filtered);
      }

      updateShots(dt, octo, world, hurtOctopus);
      updateBeholder(dt, octo, time, hurtOctopus, world);
      if (hpMode) {
        liveCache.length = 0;
        for (const list of byChunk.values()) for (let i = 0; i < list.length; i++) if (!list[i].dead) liveCache.push(list[i]);
      }
    },

    /** Spike: live enemies (no Beholder), valid until the next update(). */
    live() { return liveCache; },
    /** Spike: apply weapon damage to an enemy that has hp; kills via the normal death event. */
    hurt(e, dmg) {
      if (e.dead || e.hp === undefined) return false;
      e.hp -= dmg;
      e.hitFlash = 0.25;
      if (e.hp <= 0) killEnemy(e, 'ink');
      return true;
    },

    /** Kill every enemy (not the Beholder or an immune trap) within `radius`
     * of (x,y) - used by bomb.js.
     * Returns the count killed. */
    killInRadius(x, y, radius) {
      let n = 0;
      for (const e of allEnemies()) {
        if (e.dead) continue;
        if (dist(e.x, e.y, x, y) > radius) continue;
        if (e.immune) continue;
        killEnemy(e, 'bomb'); n++;
      }
      for (const [ci, list] of byChunk) {
        const filtered = list.filter((e) => !e.dead);
        if (filtered.length !== list.length) byChunk.set(ci, filtered);
      }
      return n;
    },

    /** A blast at (x, y): every live moving enemy (and cannon) within `reach` is knocked away (radial, linear falloff),
     * flashes and is stunned for `stun` s. Returns the count. (Kills are bomb.js's killInRadius; this moves what survived.) */
    knockInRadius(x, y, reach, power, stun) {
      let n = 0;
      for (const e of allEnemies()) {
        if (e.dead || !(e.moving || e.kind === 'cannon')) continue;
        let dx = e.x - x, dy = e.y - y;
        const d = Math.hypot(dx, dy);
        if (d > reach) continue;
        if (d < 1e-4) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
        const f = (1 - d / reach) * power;
        const fixed = !e.moving; // a cannon is bolted down: stunned, not thrown
        e.kvx = fixed ? 0 : dx * f; e.kvy = fixed || e.kind === 'crab' ? 0 : dy * f;
        if (e.kind === 'crab' && Math.abs(e.kvx) < 0.5) e.kvx = (dx >= 0 ? 1 : -1) * f * 0.7;
        e.stun = stun; e.path = null; e.tell = 0; e.hitFlash = 0.3;
        n++;
      }
      return n;
    },

    /** Remove (silently: no kill, no drop) every enemy within `r` of (x, y); used to keep a quest objective clear. */
    despawnNear(x, y, r) {
      let n = 0;
      for (const e of allEnemies()) if (!e.dead && dist(e.x, e.y, x, y) < r) { e.dead = true; n++; }
      for (const [ci, list] of byChunk) {
        const filtered = list.filter((e) => !e.dead);
        if (filtered.length !== list.length) byChunk.set(ci, filtered);
      }
      return n;
    },

    /** Test/debug hook (`__octo.spawn`): force-spawn one enemy at (x,y), not
     * tied to any chunk (never despawns from chunk eviction). */
    spawnAt(kind, x, y, placement, wallDir = 0) {
      if (kind === 'beholder') {
        beholder = {
          id: nextId++, kind: 'beholder', x, y, prevX: x, prevY: y, vx: 0, vy: 0,
          radius: BEHOLDER_RADIUS, wallR: BEHOLDER_WALL_R, dead: false, spawnedAt: 0, moving: true,
        };
        return beholder;
      }
      const e = makeEnemy(kind, x, y, -1, placement || 'open', wallDir);
      const list = byChunk.get(-1) || [];
      list.push(e);
      byChunk.set(-1, list);
      return e;
    },

    count() { return allEnemies().length + shots.length + (beholder ? 1 : 0); },
  };
}
