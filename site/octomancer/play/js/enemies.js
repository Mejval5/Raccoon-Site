// Enemies: urchin, piranha, cannon + its shot, and the Beholder chaser.
// OVERNIGHT.md §4 M3-1: "one small behaviour object per kind so M6 only adds
// entries." Spawned from each chunk's `enemy-slot` spawns (gen.js, tagged by
// placement: floor/ceiling/wall/open) via a small depth table, pooled and
// despawned with the chunk that owns them. The Beholder is not chunk-owned:
// it is a single, always-resident chaser: a warning at beholderTiming().warn, then it enters off screen at .arrive
// and drifts through rock toward the octopus (beholder.js, the Spelunky ghost).
//
// Sources: `NPC25` (urchin), `NPC21`/`SidePiranha` (piranha),
// `NPC30`+`NPC32Ball` (cannon+shot), `Beholder_*` (46 frames) --
// octomancer-unity/Assets/Sprites/NPCs/**, `unity/Scripts/Player/EyeChaser.cs`
// for the Beholder's straight-line chase. DECISIONS-2026-09-29.md §2.
//
// M6 (2021 creatures, `OldAssets/.../NPC.old/`): crabs
// (`CrabFlatten`/`CrabFlatten2`), spike horns (`NPC6`), manta (`NPC10` +
// `NPC10Ball`). OVERNIGHT.md §4 M6.

import { octoRams, octoPhasing } from './strikes.js';
import { crumbleAt, CR_SHOT } from './fragile.js';
import {
  URCHIN_RADIUS, PIRANHA_RADIUS, PIRANHA_CHASE_SPEED,
  PIRANHA_CHASE_RANGE, CANNON_RADIUS, CANNON_RANGE,
  CANNON_SHOT_SPEED, CANNON_SHOT_RADIUS, BEHOLDER_RADIUS,
  DASH_KILL_SPEED, ENEMY_MIN_DEPTH,
  CRAB_RADIUS, CRAB_SPEED_SLOW, CRAB_SPEED_FAST,
  HORNS_RADIUS,
  STUN_S, MANTA_RADIUS, MANTA_SPEED, MANTA_PATROL_RANGE, MANTA_SINE_AMPLITUDE, MANTA_SINE_FREQ,
} from './config.js';
import { PK_BOMB } from './props.js';
import { inCameraView } from './cull.js';
import { hurtOctopus, stunOctopus, killOctopus } from './octopus.js';
import { resolveCircleVsGrid, resolveCircleVsSegments } from './physics.js';
import { hasLineOfSight, findSmoothPath, resetPathBudget } from './pathfind.js';
import { beholderTiming, beholderSpeed, planBeholderEntry, driftBeholder } from './beholder.js';
import { resolveHit, rowOf, dashKillable, SOURCES, PH_ANCHORED, PH_WALK } from './creature-rules.js';
import { octoHit } from './damage.js';
import { FRENZY_R } from './creature-rules.js';
import { LURE_ARRIVE } from './infight.js';
import { pickTarget, leadOf, octoList } from './players.js';
import { KILL_FLASH_S, KILL_FLASH } from './config.js';

const ONE = [null]; // octoList's reusable slot for a single octopus (solo play passes one, co-op an array)

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
// 2026-10-08: hp, dash-killable and immune come from the creature table (creature-rules.js); urchin and horns still carry no
// hp field, so the Ink Jet's targeting (hp present) leaves them alone (the table makes them immune to ink as well).
const ENEMY_HP = { piranha: rowOf('piranha').hp, crab: rowOf('crab').hp, cannon: rowOf('cannon').hp, manta: rowOf('manta').hp };
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
//   cannon   CN_TRACK   the gourd fish turns its whole body slowly toward you (needs a clear line and the half plane it
//                       faces; its facing is clamped to that half plane, so it never looks into its own rock)
//            CN_CHARGE  0.6 s: it squashes down against its rock (the Unity CanonShoot squish), still turning at 40%
//                       rate; then it snaps long and spits the ball from its mouth, along its facing, not at you
//            CN_RELOAD  2 s (the first 0.75 s of it the snap-and-settle recoil, `kick`)
//   manta    MA_GLIDE   a glider: slow figure-eight loops around its home, steered on smooth curves; it ignores the octopus
//                       and never bites. The octopus passing underneath (|dx| < 1.6, 0.8 < dy < 5.5, clear line) -> MA_TELL
//            MA_TELL    (the bank) 0.6 s: it slows to a hover, wings spread, body squashed, its shadow grows where it will land
//            MA_DIVE    straight slam along the line to where the octopus was at the end of the tell, to the floor (the slam)
//            MA_REST    1.5 s flat on the floor in a silt puff: stunned (e.stun), harmless, grabbable, jets carry it
//            MA_RISE    0.9 s lift-off on a curve, then it glides home again; 3 s before it can dive again
//   urchin, horns: static; the spikes pulse slowly (2.6 s) and the contact radius pulses with them
// ---------------------------------------------------------------------------------------------------------------
export const PS_PATROL = 0, PS_WINDUP = 1, PS_LUNGE = 2, PS_RECOVER = 3;
export const PIRANHA_WINDUP = 0.4, PIRANHA_LUNGE_SPEED = 7, PIRANHA_LUNGE_MAX = 1.1, PIRANHA_RECOVER = 1.0;
export const PIRANHA_IDLE_SPEED = 1.5, PIRANHA_PATROL_RANGE = 5, PIRANHA_NOTICE = PIRANHA_CHASE_RANGE;
export const CS_WALK = 0, CS_PAUSE = 1, CS_SNAP = 2, CS_COOL = 3;
export const CRAB_SNAP_RANGE = 1.5, CRAB_PAUSE = 0.35, CRAB_SNAP = 0.2, CRAB_COOL = 1.0, CRAB_SNAP_REACH = 0.4;
export const CN_TRACK = 0, CN_CHARGE = 1, CN_RELOAD = 2;
export const CANNON_WINDUP = 0.6, CANNON_RELOAD = 2.0, CANNON_TURN = 1.2, CANNON_ARC = Math.PI / 2 - 0.12, CANNON_AIM_OK = 0.3;
// The fish's body (enemy-cannon.webp, NPC30, 0.9 tiles tall) sits CANNON_SEAT tiles from its cell centre toward its rock
// (enemy-draw.js draws it there). Its mouth is the slit at the top of the spout: CANNON_MOUTH_ALONG tiles out along the
// facing and CANNON_MOUTH_SIDE to the side its lip curls (e.lip: +1 the art's own right, -1 mirrored).
export const CANNON_SEAT = 0.15, CANNON_MOUTH_ALONG = 0.4, CANNON_MOUTH_SIDE = 0.14, CANNON_RECOIL = 0.75;
export const MA_GLIDE = 0, MA_TELL = 1, MA_DIVE = 2, MA_RISE = 3, MA_REST = 4, MA_BANK = MA_TELL;
export const MANTA_TELL = 0.6, MANTA_DIVE_SPEED = 9, MANTA_DIVE_MAX = 1.2, MANTA_DIVE_COOLDOWN = 3, MANTA_REST = 1.5, MANTA_LIFT = 0.9;
export const MANTA_GLIDE_SPEED = 2.2, MANTA_TURN = 1.8, MANTA_NOTICE = 5.5, MANTA_UNDER = 1.6, MANTA_LOOP_A = 4.5, MANTA_LOOP_B = 1.3;
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

/** The cannon's facing `a` clamped to the half plane round its surface normal `out` (never into its own rock). */
export function cannonFacing(out, a) {
  const d = angDiff(a, out);
  return d > CANNON_ARC ? out + CANNON_ARC : d < -CANNON_ARC ? out - CANNON_ARC : out + d;
}
/** Which way the lip curls (+1 / -1) for facing `aim`: away from the rock (a wall fish: up and away), keeping `prev` near
 * the tie (a floor fish looking straight up) so it never flickers. */
export function cannonLip(e, aim, prev) {
  const ox = Math.cos(e.out), oy = Math.sin(e.out);
  const px = ox, py = e.placement === 'wall' ? oy - 0.4 : oy; // a wall fish: lip away from the rock, a little up (up at rest)
  const d = -Math.sin(aim) * px + Math.cos(aim) * py; // the art's right side (sprite +x) rotated to `aim`, dot the preference
  return d > 0.1 ? 1 : d < -0.1 ? -1 : prev;
}
/** World centre of the cannon's body (`o` gets x, y; no allocation). */
export function cannonBody(e, o) {
  const seat = e.placement === 'floor' || e.placement === 'ceiling' || (e.placement === 'wall' && e.wallDir) ? CANNON_SEAT : 0;
  o.x = e.x - Math.cos(e.out) * seat; o.y = e.y - Math.sin(e.out) * seat;
  return o;
}
/** World point of the cannon's mouth at its facing e.aim (`o` gets x, y; no allocation). */
export function cannonMouth(e, o) {
  cannonBody(e, o);
  const ca = Math.cos(e.aim), sa = Math.sin(e.aim), side = CANNON_MOUTH_SIDE * (e.lip || 1);
  o.x += ca * CANNON_MOUTH_ALONG - sa * side; o.y += sa * CANNON_MOUTH_ALONG + ca * side;
  return o;
}
const MOUTH = { x: 0, y: 0 };

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
    return { ...base, radius: URCHIN_RADIUS, r0: URCHIN_RADIUS, contactDamage: true, dashKillable: dashKillable(kind), pulse: 0.5 };
  }
  if (kind === 'piranha') {
    const dir = rnd(base) < 0.5 ? -1 : 1;
    return {
      ...base, radius: PIRANHA_RADIUS, contactDamage: true, dashKillable: dashKillable(kind), moving: true,
      dir, face: dir, chasing: false, baseX: x, baseY: y, flipCd: 0, stuck: 0, st: PS_PATROL, t: 0.3 + rnd(base) * 0.7,
      lx: 0, ly: 0, ltrav: 0, lmax: 0, rvx: 0, rvy: 0,
      tg: 0, tgid: 0, tgx: 0, tgy: 0, scan: 0, frenzy: 0, // infight.js frenzy: tg 1 = it hunts body / corpse tgid instead of the octopus
    };
  }
  if (kind === 'cannon') {
    const out = cannonOut(placement, wallDir);
    // sq 0..1: the drawn squash (follows the charge, eases out when a charge is called off); kick: s left of the spit recoil;
    // fa, mx, my: the facing and mouth point of the last spit (the puff of bubbles stays where it was spat)
    const c = { ...base, radius: CANNON_RADIUS, contactDamage: false, dashKillable: dashKillable(kind), st: CN_RELOAD, t: 1 + rnd(base), out, aim: out, lip: 1, sq: 0, kick: 0, fa: out, mx: x, my: y };
    c.lip = cannonLip(c, out, rnd(base) < 0.5 ? -1 : 1);
    return c;
  }
  if (kind === 'crab') {
    const fast = rnd(base) < 0.4;
    const dir = rnd(base) < 0.5 ? -1 : 1;
    return {
      ...base, radius: CRAB_RADIUS, contactDamage: true, dashKillable: dashKillable(kind), moving: true,
      dir, face: dir, speed: fast ? CRAB_SPEED_FAST : CRAB_SPEED_SLOW, variant: fast ? 'fast' : 'slow', cool: 0, snapHit: false, st: CS_WALK, stuck: 0, flipCd: 0,
    };
  }
  if (kind === 'horns') {
    return { ...base, radius: HORNS_RADIUS, r0: HORNS_RADIUS, contactDamage: true, dashKillable: dashKillable(kind), immune: !!rowOf(kind).invulnerable, pulse: 0.5 };
  }
  if (kind === 'manta') {
    const dir = rnd(base) < 0.5 ? -1 : 1;
    return {
      ...base, radius: MANTA_RADIUS, contactDamage: true, dashKillable: dashKillable(kind), moving: true,
      dir, face: dir, baseX: x, baseY: y, st: MA_GLIDE, cool: 1.5, stuck: 0, flipCd: 0, tx: 0, ty: 1, dived: 0,
      // the glide loop: centre (cx, cy), half width ax, half height by (fitted to the water on its first step), curve
      // parameter ph (0 at the centre heading right, PI heading left), heading hd and speed spd; lx/ly/ld: where the slam lands
      cx: x, cy: y, ax: 0, by: 0, fit: 0, fcx: x, fcy: y, ph: dir > 0 ? 0 : Math.PI, hd: dir > 0 ? 0 : Math.PI, spd: MANTA_GLIDE_SPEED,
      lx: x, ly: y, ld: 0,
    };
  }
  return base;
}

/** Is a hull of half length `reach` ahead of (x, y) in direction dir blocked (three samples across `halfH`)? */
function blockedAhead(world, x, y, dir, reach, halfH) {
  for (let k = -1; k <= 1; k++) if (world.isSolid(x + dir * reach, y + k * halfH)) return true;
  return false;
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
  let timing = beholderTiming(0);
  const warn = { state: 0, p: 0, dx: 0, dy: 0, pref: 0 };
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
  let cloak = null; // spells.js ink clouds (v2): a creature whose line to the octopus passes through one has lost it
  /** The octopus is hidden from `e` by an ink cloud (inside one, or one is in the way). */
  function lost(e, octo) { return cloak !== null && cloak.hides(e.x, e.y, octo.x, octo.y); }
  let inf = null; // infight.js (v2): the INFIGHT rules (frenzy, projectiles) and the lures; null = creatures ignore each other entirely
  let curWorld = null;
  const solidAt = (tx, ty) => curWorld.isSolid(tx, ty);
  const losSolid = (x0, y0, x1, y1) => hasLineOfSight(solidAt, x0, y0, x1, y1);
  function allEnemies() {
    const out = [];
    for (const list of byChunk.values()) for (let i = 0; i < list.length; i++) out.push(list[i]);
    return out;
  }

  const KILL_REASON = { boulder: 'crush', block: 'crush', helmet: 'dash' }; // an Urchin Cap ram is the old dash kill (ghost, hit-stop)
  function killEnemy(e, reason, kx = 0, ky = 0) {
    if (e.dead) return;
    e.dead = true;
    // vx, vy, face (and a dash's shove) start the corpse (corpses.js)
    events.push({ type: 'enemyKilled', kind: e.kind, x: e.x, y: e.y, reason, vx: (e.vx || 0) + kx, vy: (e.vy || 0) + ky, face: e.face || e.dir || 1, variant: e.variant });
    if (reason === 'dash') {
      // hit-stop: a white ghost of the enemy stays for 60 ms and main.js freezes the sim for as long
      // r36: the ghost is only a white silhouette: no wind-up cue, '!' or glow (the enemy it copies is dead)
      ghosts.push({ ...e, dead: false, ghost: true, t: HIT_STOP, hitFlash: 1.2, stun: 0, tell: 0, st: 0, prevX: e.x, prevY: e.y });
      events.push({ type: 'hitStop', dur: HIT_STOP });
    } else {
      // impact pass (2026-10-18): every other kill (ink, bomb, boulder, spikes, a creature) gets a brief pale after-image too,
      // weaker than the dash kill's white and with no sim freeze: it fades with the sim in KILL_FLASH_S
      ghosts.push({ ...e, dead: false, ghost: true, t: KILL_FLASH_S, hitFlash: KILL_FLASH, stun: 0, tell: 0, st: 0, prevX: e.x, prevY: e.y });
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
  /** Local co-op (ghost.js): a ghost's blow is a soft drift that dies away over about half a second; no stun, no damage. */
  function stepBlown(e, dt, world) {
    e.x += e.gvx * dt; e.y += e.gvy * dt;
    const f = Math.exp(-5 * dt);
    e.gvx *= f; e.gvy *= f;
    if (Math.abs(e.gvx) + Math.abs(e.gvy) < 0.05) e.gvx = e.gvy = 0;
    if (e.moving) collideWithWalls(e, world);
  }
  /**
   * 2026-10-08, the one way an enemy takes a hit: creature-rules.js resolveHit for its kind and `src`, then the outcome on the
   * record. dmg < 0: the source's own damage; knockScale: a blast's falloff; (kx, ky): the corpse's shove when it dies (NaN: the
   * knock). Kills go through killEnemy (a corpse like any kill). A survivor flashes, loses hp and is knocked out (stun) and
   * thrown by the table's knock (a walker only sideways, an anchored kind stunned in place). Returns the damage dealt (0: ignored).
   */
  function applyHit(e, src, fx, fy, dmg = -1, knockScale = 1, kx = NaN, ky = NaN) {
    if (!e || e.dead || e.ghost) return 0;
    const o = resolveHit(e.kind, src, dmg);
    if (o.ignore) return 0;
    const row = rowOf(e.kind);
    let dx = e.x - fx, dy = e.y - fy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
    const knock = o.knock * Math.max(0, knockScale), stun = o.stun, dealt = o.dmg, kill = o.kill;
    const hp = e.hp !== undefined ? e.hp : row.hp;
    if (kill || (dealt > 0 && dealt >= hp)) {
      killEnemy(e, KILL_REASON[src] || src, Number.isFinite(kx) ? kx : dx * knock, Number.isFinite(ky) ? ky : dy * knock);
      return Math.max(dealt, hp, 1e-3);
    }
    if (dealt > 0) { if (e.hp !== undefined) e.hp -= dealt; e.hitFlash = 0.25; }
    if (stun > 0 || knock > 0) {
      const fixed = row.physics === PH_ANCHORED;
      e.kvx = fixed ? 0 : dx * knock; e.kvy = fixed || row.physics === PH_WALK ? 0 : dy * knock;
      if (row.physics === PH_WALK && Math.abs(e.kvx) < 0.5) e.kvx = (dx >= 0 ? 1 : -1) * knock * 0.7;
      if (stun > 0) { e.stun = Math.max(e.stun || 0, stun); e.path = null; e.tell = 0; }
      e.hitFlash = Math.max(e.hitFlash || 0, 0.3);
    }
    return dealt;
  }
  function pruneDead() {
    for (const [ci, list] of byChunk) {
      const filtered = list.filter((e) => !e.dead);
      if (filtered.length !== list.length) byChunk.set(ci, filtered);
    }
  }
  // the damage.js family adapter: this step's live enemies (the Beholder is invulnerable and not listed)
  const famList = [];
  const family = {
    name: 'enemy',
    begin() { famList.length = 0; for (const list of byChunk.values()) for (let i = 0; i < list.length; i++) if (!list[i].dead) famList.push(list[i]); },
    count() { return famList.length; },
    view(i, V) {
      const e = famList[i];
      if (!e || e.dead || e.ghost) return false;
      V.kind = e.kind; V.x = e.x; V.y = e.y; V.r = e.radius || 0.4; V.vx = e.vx || 0; V.vy = e.vy || 0; V.stun = e.stun || 0;
      V.shut = false; V.cool = e.hzCool || 0; V.blame = e.blame || 0;
      V.id = e.id; V.wound = e.hp !== undefined && e.hp < e.maxHp ? 1 : 0;
      return true;
    },
    apply(i, src, fx, fy, dmg, knockScale) { return applyHit(famList[i], src, fx, fy, dmg, knockScale); },
    push(i, ax, ay, mode) {
      const e = famList[i];
      if (mode === 'knock') { e.kvx += ax; e.kvy += ay; } else { e.x += ax; e.y += ay; }
    },
    setTimers(i, cool, blame) { const e = famList[i]; if (cool >= 0) e.hzCool = cool; if (blame >= 0) e.blame = blame; },
    /** The record behind slot i (tests). */
    record(i) { return famList[i]; },
  };

  function resetPattern(e) {
    e.tell = 0;
    if (e.kind === 'piranha') { e.st = PS_PATROL; e.t = 0.5; e.flipCd = 0; }
    else if (e.kind === 'crab') { e.st = CS_WALK; e.cool = 0.5; }
    else if (e.kind === 'cannon') { e.st = CN_RELOAD; e.t = 1.0; e.sq = 0; e.kick = 0; }
    else if (e.kind === 'manta') mantaWake(e);
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
  /** infight.js: the target of a frenzy (e.tg = 1: a bleeding or knocked-out body, or a fresh corpse) is still there? Moves (e.tgx, e.tgy). */
  function trackPrey(e) {
    if (!inf || !inf.locate(e.tgid)) return false;
    e.tgx = inf.target.x; e.tgy = inf.target.y;
    return true;
  }
  function piranhaToPatrol(e, t) {
    e.st = PS_PATROL; e.t = t; e.tell = 0; e.flipCd = 0.4; e.stuck = 0; e.tg = 0;
    e.dir = rnd(e) < 0.5 ? -1 : 1; e.face = e.dir; e.baseX = e.x; e.baseY = e.y; e.chasing = false;
  }
  function updatePiranha(e, dt, octo, world) {
    const px = e.x, py = e.y;
    const seesOcto = () => dist(e.x, e.y, octo.x, octo.y) < PIRANHA_NOTICE && !lost(e, octo) && hasLineOfSight((tx, ty) => world.isSolid(tx, ty), e.x, e.y, octo.x, octo.y);
    // ink: a winding-up or lunging piranha that loses the octopus gives up and wanders off from where it is
    if (!e.tg && (e.st === PS_WINDUP || e.st === PS_LUNGE) && lost(e, octo)) {
      piranhaToPatrol(e, 1.2); e.lostInk = (e.lostInk | 0) + 1;
    }
    // a frenzy whose prey is gone (dead and stripped, eaten by another, out of reach): back to its beat
    if (e.tg && e.st === PS_WINDUP && !trackPrey(e)) piranhaToPatrol(e, 0.3);
    e.chasing = e.st === PS_WINDUP || e.st === PS_LUNGE;
    switch (e.st) {
      case PS_PATROL: {
        e.ph += dt * 1.3;
        e.t = Math.max(0, e.t - dt);
        e.flipCd = Math.max(0, e.flipCd - dt);
        if (inf && inf.lureAt(e.x, e.y)) {
          // the target override (a lure, infight.setLure): it swims to the point of interest instead of its beat, and hovers there
          const L = inf.lurePoint, ld = dist(e.x, e.y, L.x, L.y);
          if (ld > LURE_ARRIVE) chaseWithPath(e, world, L.x, L.y, PIRANHA_IDLE_SPEED * 1.4, dt);
          else { e.vx = Math.cos(e.ph) * 0.3; e.vy = Math.sin(e.ph * 1.3) * 0.2; e.x += e.vx * dt; e.y += e.vy * dt; }
          collideWithWalls(e, world);
          e.baseX = e.x; e.baseY = e.y; e.stuck = 0;
          if (Math.abs(e.vx) > 0.05) e.dir = sgn(e.vx, e.dir);
        } else {
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
        }
        e.face = e.dir;
        if (e.t <= 0 && seesOcto()) {
          e.st = PS_WINDUP; e.t = PIRANHA_WINDUP; e.vx = e.vy = 0; e.tell = 0; e.tg = 0;
          e.face = sgn(octo.x - e.x, e.face);
        } else if (inf && e.t <= 0 && (e.scan = (e.scan || 0) - dt) <= 0) {
          // INFIGHT.frenzy: it smells blood (a bleeding or knocked-out body, a fresh corpse) and goes for it like for the octopus
          e.scan = 0.25;
          if (inf.prey(e.x, e.y, FRENZY_R, e.id, losSolid)) {
            e.tg = 1; e.tgid = inf.target.id; e.tgx = inf.target.x; e.tgy = inf.target.y;
            e.st = PS_WINDUP; e.t = PIRANHA_WINDUP * 0.6; e.vx = e.vy = 0; e.tell = 0; e.frenzy = (e.frenzy | 0) + 1;
            e.face = sgn(e.tgx - e.x, e.face);
          }
        }
        break;
      }
      case PS_WINDUP: {
        e.vx = e.vy = 0;
        const wind = e.tg ? PIRANHA_WINDUP * 0.6 : PIRANHA_WINDUP;
        const ax = e.tg ? e.tgx : octo.x, ay = e.tg ? e.tgy : octo.y;
        e.t -= dt; e.tell = Math.min(1, 1 - e.t / wind);
        e.face = sgn(ax - e.x, e.face);
        if (e.t <= 0) {
          const dx = ax - e.x, dy = ay - e.y, d = Math.hypot(dx, dy) || 1;
          e.lx = dx / d; e.ly = dy / d; e.lmax = d + 1.5; e.ltrav = 0;
          e.st = PS_LUNGE; e.t = PIRANHA_LUNGE_MAX; e.tell = 0; e.face = sgn(e.lx, e.face);
        }
        break;
      }
      case PS_LUNGE: {
        // a frenzy lunge homes on its prey (a bleeding fish keeps swimming); a lunge at the octopus stays locked (she can dodge it)
        if (e.tg && trackPrey(e)) { const dx = e.tgx - e.x, dy = e.tgy - e.y, d = Math.hypot(dx, dy); if (d > 0.3) { e.lx = dx / d; e.ly = dy / d; e.face = sgn(e.lx, e.face); } }
        e.vx = e.lx * PIRANHA_LUNGE_SPEED; e.vy = e.ly * PIRANHA_LUNGE_SPEED;
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideWithWalls(e, world);
        const moved = Math.hypot(e.x - px, e.y - py);
        e.ltrav += moved; e.t -= dt;
        // a frenzy lunge bites at its nose: the corpse it hunts, or any prey (bleeding, knocked out) it meets; a healthy body it
        // swims into is left alone (touch enemies never hurt each other). The nose is the sprite's (PIRANHA_BODY_HALF_LEN): the
        // separation pass keeps two piranhas about 1.8 tiles apart side by side, so a bite circle nearer the centre never lands
        if (e.tg && inf && inf.bite(e.tgid, e.x + e.lx * PIRANHA_BODY_HALF_LEN, e.y + e.ly * PIRANHA_BODY_HALF_LEN, 0.6, e.id)) { piranhaRecover(e, true); e.tg = 0; break; }
        if (moved < 0.4 * PIRANHA_LUNGE_SPEED * dt || e.t <= 0 || e.ltrav >= e.lmax) { piranhaRecover(e, false); e.tg = 0; }
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
      if (Math.abs(angDiff(a, e.out)) <= CANNON_ARC && !lost(e, octo) && hasLineOfSight((tx, ty) => world.isSolid(tx, ty), e.x, e.y, octo.x, octo.y)) { target = true; want = a; }
    }
    // turn slowly toward it (slower while charging), or back to rest
    const rate = (e.st === CN_CHARGE ? CANNON_TURN * 0.4 : CANNON_TURN) * dt;
    const diff = angDiff(want, e.aim);
    e.aim = cannonFacing(e.out, e.aim + Math.max(-rate, Math.min(rate, diff)));
    e.lip = cannonLip(e, e.aim, e.lip);
    if (e.kick > 0) e.kick = Math.max(0, e.kick - dt);
    if (e.st !== CN_CHARGE && e.sq > 0) e.sq = Math.max(0, e.sq - dt * 4); // a called-off charge eases back out
    if (e.st === CN_RELOAD) {
      e.t -= dt;
      if (e.t <= 0) { e.st = CN_TRACK; e.t = 0; }
    } else if (e.st === CN_TRACK) {
      if (target && Math.abs(angDiff(want, e.aim)) < CANNON_AIM_OK && inCameraView(e.x, e.y, e.radius)) { /* item 6: it never starts a shot from off-screen */ e.st = CN_CHARGE; e.t = CANNON_WINDUP; e.tell = 0; }
    } else { // CN_CHARGE
      e.t -= dt; e.tell = Math.min(1, 1 - e.t / CANNON_WINDUP); e.sq = e.tell;
      if (!target) { e.st = CN_TRACK; e.tell = 0; return; } // lost the line: stand down
      if (e.t <= 0) {
        const ca = Math.cos(e.aim), sa = Math.sin(e.aim);
        cannonMouth(e, MOUTH); // spat from its mouth
        // owner: the cannon itself is never hit by its own shot; oc: the octopus is to blame for this shot (0: a future reflect spell sets it)
        shots.push({ x: MOUTH.x, y: MOUTH.y, vx: ca * CANNON_SHOT_SPEED, vy: sa * CANNON_SHOT_SPEED, radius: CANNON_SHOT_RADIUS, dead: false, owner: e.id, oc: 0 });
        events.push({ type: 'shotFired', kind: 'cannon' });
        e.st = CN_RELOAD; e.t = CANNON_RELOAD; e.tell = 0;
        e.sq = 0; e.kick = CANNON_RECOIL; e.fa = e.aim; e.mx = MOUTH.x; e.my = MOUTH.y;
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
    const near = dist(e.x, e.y, octo.x, octo.y) < CRAB_SNAP_RANGE && Math.abs(octo.y - e.y) < 1.3 && !lost(e, octo);
    switch (e.st) {
      case CS_WALK: {
        // sinks if the floor under it was bombed away
        if (groundDy === 1 && !world.isSolid(e.x, e.y + 0.6)) { e.y += 2.5 * dt; e.vy = 2.5; } else e.vy = 0;
        // the target override (a lure, infight.setLure) on about its level: it walks its ledge toward it, and waits under it
        let lureStop = false;
        if (inf && e.flipCd <= 0 && inf.lureAt(e.x, e.y) && Math.abs(inf.lurePoint.y - e.y) < 3) {
          const lx = inf.lurePoint.x - e.x;
          if (Math.abs(lx) < LURE_ARRIVE * 0.6) lureStop = true; else e.dir = lx > 0 ? 1 : -1;
        }
        const step = lureStop ? 0 : e.dir * e.speed * dt;
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
        e.stuck = !lureStop && Math.abs(e.x - cx0) < 0.55 * e.speed * dt ? e.stuck + dt : 0;
        if (lureStop) e.vx = 0;
        if (e.stuck > 0.4) { e.dir = -e.dir; e.face = e.dir; e.stuck = 0; e.flipCd = 0.5; }
        if (e.cool <= 0 && near) { e.st = CS_PAUSE; e.t = CRAB_PAUSE; e.dir = sgn(octo.x - e.x, e.dir); e.face = e.dir; e.vx = 0; e.tell = 0; }
        break;
      }
      case CS_PAUSE:
        if (lost(e, octo)) { e.st = CS_WALK; e.cool = 0.6; e.tell = 0; break; } // ink: it lost the octopus, no snap
        e.vx = 0; e.t -= dt; e.tell = Math.min(1, 1 - e.t / CRAB_PAUSE);
        e.dir = sgn(octo.x - e.x, e.dir); e.face = e.dir;
        if (e.t <= 0) { e.st = CS_SNAP; e.t = CRAB_SNAP; e.tell = 0; e.snapHit = false; }
        break;
      case CS_SNAP:
        e.vx = 0; e.t -= dt;
        if (!e.snapHit && !lost(e, octo) && dist(e.x + e.dir * 0.2, e.y, octo.x, octo.y) < e.radius + octo.radius + CRAB_SNAP_REACH) {
          e.snapHit = true;
          octoHit(octo, 'bite', e.x, e.y, 'crab');
        }
        if (e.t <= 0) { e.st = CS_COOL; e.t = CRAB_COOL; }
        break;
      default: // CS_COOL
        e.vx = 0; e.t -= dt;
        if (e.t <= 0) { e.st = CS_WALK; e.cool = 0.4; }
    }
  }

  // ------------------------------------------------------------------------------------------ manta
  // 2026-10-18, the glider (CREATURES.md "Manta"). Everything it does is on smooth curves: its heading turns at most
  // MANTA_TURN rad/s while it glides, chasing a point that runs along a figure-eight around its home; it never bites. Only
  // the octopus passing underneath it makes it bank, hover (the tell: wings spread, body squashed, a shadow grows where it
  // will land) and slam straight down through where she was; then it lies stunned on the floor for MANTA_REST s and lifts off.
  function mantaFits(world, x, y) {
    for (let k = -1; k <= 1; k++) {
      const yy = y + k * MANTA_BODY_HALF_HEIGHT;
      if (world.isSolid(x - MANTA_WING_HALF_LEN - 0.2, yy) || world.isSolid(x + MANTA_WING_HALF_LEN + 0.2, yy)) return false;
    }
    return true;
  }
  /** mantaFits, and clear of every rooted enemy (an urchin, horns, a cannon): the loop is never laid through one. */
  function mantaRoom(e, world, x, y) {
    if (!mantaFits(world, x, y)) return false;
    for (let i = 0; i < stepList.length; i++) {
      const o = stepList[i];
      if (o === e || o.dead || o.moving) continue;
      const eo = sepExtent(o.kind);
      if (Math.abs(o.x - x) < MANTA_WING_HALF_LEN + eo.hx + 0.2 && Math.abs(o.y - y) < MANTA_BODY_HALF_HEIGHT + eo.hy + 0.1) return false;
    }
    return true;
  }
  function loopFits(e, world, A, B) {
    for (let k = 0; k < 24; k++) {
      const p = k * (TAU / 24);
      if (!mantaRoom(e, world, e.cx + A * Math.sin(p), e.cy - B * Math.sin(2 * p))) return false;
    }
    return true;
  }
  /** Lay the figure-eight around (cx, cy): as wide as the water lets it (MANTA_LOOP_A down to 1), then as tall. */
  function fitLoop(e, world) {
    let A = MANTA_LOOP_A, B = MANTA_LOOP_B;
    for (let n = 0; n < 24 && !loopFits(e, world, A, B); n++) {
      if (A > 1.01) A -= 0.25; else if (B > 0.45) B -= 0.2; else break;
    }
    e.ax = A; e.by = B; e.fit = 1; e.fcx = e.cx; e.fcy = e.cy;
  }
  /** Turn heading `hd` toward `want` by at most `rate * dt`. */
  function turnToward(hd, want, rate, dt) {
    const d = angDiff(want, hd), m = rate * dt;
    const h = hd + (d > m ? m : d < -m ? -m : d);
    return h > Math.PI ? h - TAU : h < -Math.PI ? h + TAU : h;
  }
  /** Fly one step along heading e.hd at e.spd, against rock; returns how far it got. */
  function mantaMove(e, dt, world) {
    const px = e.x, py = e.y;
    e.vx = Math.cos(e.hd) * e.spd; e.vy = Math.sin(e.hd) * e.spd;
    e.x += e.vx * dt; e.y += e.vy * dt;
    collideMantaWithWalls(e, world);
    if (Math.abs(e.vx) > 0.35 * MANTA_GLIDE_SPEED) e.face = e.dir = e.vx > 0 ? 1 : -1; // hysteresis: no flicker while it climbs or sinks
    return Math.hypot(e.x - px, e.y - py);
  }
  /** Steer toward the point running along the loop (and away from rock ahead), at most MANTA_TURN rad/s. */
  function mantaSteer(e, dt, world) {
    const tx = e.cx + e.ax * Math.sin(e.ph), ty = e.cy - e.by * Math.sin(2 * e.ph);
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    // the point runs at glide speed while the manta is near it; it waits while the manta is off its loop (knocked, lured, lifting off)
    if (d < 2.5) e.ph += MANTA_GLIDE_SPEED * dt / Math.max(0.5, Math.hypot(e.ax * Math.cos(e.ph), 2 * e.by * Math.cos(2 * e.ph)));
    if (e.ph > TAU) e.ph -= TAU;
    let rate = MANTA_TURN;
    let want = d > 0.05 ? Math.atan2(dy, dx) : e.hd;
    // rock ahead: bank away from it toward whichever side is open (still a curve, a little tighter)
    if (!mantaFits(world, e.x + Math.cos(e.hd), e.y + Math.sin(e.hd))) {
      const l = mantaFits(world, e.x + Math.cos(e.hd - 0.7), e.y + Math.sin(e.hd - 0.7));
      const r = mantaFits(world, e.x + Math.cos(e.hd + 0.7), e.y + Math.sin(e.hd + 0.7));
      want = e.hd + (l && !r ? -1.2 : r && !l ? 1.2 : angDiff(want, e.hd) < 0 ? -1.2 : 1.2);
      rate = MANTA_TURN * 1.6;
    }
    e.hd = turnToward(e.hd, want, rate, dt);
    // trail the point by about a tile: faster when behind it, slower when on it
    const target = MANTA_GLIDE_SPEED * Math.max(0.7, Math.min(1.35, 0.7 + 0.3 * d));
    e.spd += (target - e.spd) * Math.min(1, 2.5 * dt);
  }
  /** Re-centre the loop where the manta is now (it got stuck against rock): the point starts on it, running back the way it came. */
  function mantaReanchor(e, world) {
    e.cx = e.x; e.cy = e.y; e.ph = Math.cos(e.hd) >= 0 ? Math.PI : 0;
    fitLoop(e, world);
  }
  /** Its stun ran out (resetPattern): off the floor it lifts off; knocked about mid-glide it just glides on. */
  function mantaWake(e) {
    e.tell = 0; e.kvx = e.kvy = 0;
    if (e.st === MA_REST || e.st === MA_DIVE) { e.st = MA_RISE; e.t = MANTA_LIFT; e.hd = -Math.PI / 2 + (e.face || 1) * 0.35; e.spd = 0.2; e.cool = MANTA_DIVE_COOLDOWN; }
    else { e.st = MA_GLIDE; e.cool = Math.max(e.cool, 1.0); }
  }
  /** Cast from the manta along (ux, uy) to the first rock (the floor it will hit): lx/ly the surface, ld the centre's travel. */
  function mantaLanding(e, world, ux, uy) {
    let k = 0.5;
    for (; k <= 12; k += 0.25) if (world.isSolid(e.x + ux * k, e.y + uy * k)) break;
    e.lx = e.x + ux * k; e.ly = e.y + uy * k;
    e.ld = Math.max(0.2, k - MANTA_BODY_HALF_HEIGHT - 0.05);
  }
  let mantaWorld = null;
  const mantaSolid = (x, y) => mantaWorld.isSolid(x, y);
  /** The octopus is passing underneath it: within MANTA_UNDER sideways, 0.8..MANTA_NOTICE below, in sight, not in ink. */
  function mantaSeesBelow(e, octo, world) {
    if (octo.sealed || octo.safe) return false;
    const dx = octo.x - e.x, dy = octo.y - e.y;
    if (Math.abs(dx) >= MANTA_UNDER || dy <= 0.8 || dy >= MANTA_NOTICE || lost(e, octo)) return false;
    mantaWorld = world;
    return hasLineOfSight(mantaSolid, e.x, e.y, octo.x, octo.y);
  }
  function updateManta(e, dt, octo, world) {
    e.cool = Math.max(0, e.cool - dt);
    if (!e.fit) fitLoop(e, world);
    switch (e.st) {
      case MA_GLIDE: {
        if (inf && inf.lureAt(e.x, e.y)) {
          // the target override (a lure, infight.setLure): the loop's centre drifts to the point of interest
          const L = inf.lurePoint, k = 1.2 * dt;
          e.cx += Math.max(-k, Math.min(k, L.x - e.cx));
          e.cy += Math.max(-k, Math.min(k, L.y - e.cy));
          e.baseX = e.cx; e.baseY = e.cy; // its home moves with it
        }
        if (Math.abs(e.cx - e.fcx) + Math.abs(e.cy - e.fcy) > 1) fitLoop(e, world);
        mantaSteer(e, dt, world);
        const moved = mantaMove(e, dt, world);
        e.stuck = moved < 0.4 * e.spd * dt ? e.stuck + dt : 0;
        if (e.stuck > 0.8) { e.stuck = 0; mantaReanchor(e, world); }
        // the octopus passing underneath: bank and hover over her
        if (e.cool <= 0 && mantaSeesBelow(e, octo, world)) { e.st = MA_TELL; e.t = MANTA_TELL; e.tell = 0; }
        break;
      }
      case MA_TELL: { // the bank: it slows to a hover, its shadow grows where it will land
        e.t -= dt; e.tell = Math.min(1, 1 - e.t / MANTA_TELL);
        e.spd *= Math.exp(-7 * dt);
        mantaMove(e, dt, world);
        const dx = octo.x - e.x, dy = octo.y - e.y, d = Math.hypot(dx, dy) || 1;
        mantaLanding(e, world, dx / d, dy / d);
        if (e.t > 0) break;
        e.tell = 0;
        if (lost(e, octo) || dy / d < 0.55) { e.st = MA_GLIDE; e.cool = 1.0; break; } // ink, or she got out from under it: it sweeps on
        e.tx = dx / d; e.ty = dy / d; e.st = MA_DIVE; e.t = MANTA_DIVE_MAX; e.dived = 0;
        break;
      }
      case MA_DIVE: { // the slam: straight down the locked line to the floor
        const px = e.x, py = e.y;
        e.vx = e.tx * MANTA_DIVE_SPEED; e.vy = e.ty * MANTA_DIVE_SPEED;
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideMantaWithWalls(e, world);
        const moved = Math.hypot(e.x - px, e.y - py);
        e.t -= dt; e.dived += moved;
        if (moved < 0.4 * MANTA_DIVE_SPEED * dt || (e.ld > 0 && e.dived >= e.ld)) {
          // on the floor: a silt puff, and it lies there stunned (no AI, no contact, grabbable, carried by jets)
          e.st = MA_REST; e.vx = e.vy = 0; e.kvx = e.kvy = 0; e.stun = Math.max(e.stun, MANTA_REST); e.hd = e.tx >= 0 ? 0 : Math.PI;
          events.push({ type: 'mantaSlam', x: e.x, y: e.y + MANTA_BODY_HALF_HEIGHT });
        } else if (e.t <= 0) mantaWake(e); // nothing under it after all: it pulls out and lifts off
        break;
      }
      case MA_REST: // only reached when its stun was cleared some other way
        mantaWake(e);
        break;
      default: { // MA_RISE: lift-off, up and forward on a curve, easing up to glide speed, then it glides home
        e.t -= dt;
        e.spd += (MANTA_GLIDE_SPEED - e.spd) * Math.min(1, 2.2 * dt);
        mantaSteer(e, dt, world);
        if (e.t > MANTA_LIFT * 0.5) e.hd = turnToward(e.hd, -Math.PI / 2 + (e.face || 1) * 0.35, MANTA_TURN * 2, dt); // climb first
        mantaMove(e, dt, world);
        if (e.t <= 0) { e.st = MA_GLIDE; e.stuck = 0; }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ shots, beholder
  function updateShots(dt, octoArg, world, hurtFn) {
    const octos = octoList(octoArg, ONE);
    for (const s of shots) {
      if (s.dead) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (world.isSolid(s.x, s.y)) { crumbleAt(world, s.x, s.y, CR_SHOT); s.dead = true; continue; } // fish bone crumbles (fragile.js)
      for (let k = 0; k < octos.length; k++) { // a shot hits any octopus it touches
        const octo = octos[k];
        if (dist(s.x, s.y, octo.x, octo.y) < s.radius + octo.radius) {
          octoHit(octo, 'shot', s.x, s.y, 'shot');
          s.dead = true;
          break;
        }
      }
      if (s.dead) continue;
      // INFIGHT.projectile: the first other body it touches takes the shot (a fish, a crab, Marlo, the keeper; a spike or a shut
      // shell just stops it); never its own cannon
      if (inf && inf.projectile('shot', s.x, s.y, s.radius, s.owner || 0, s.oc ? true : undefined) >= 0) {
        s.dead = true;
        events.push({ type: 'shotHit', x: s.x, y: s.y });
      }
    }
    shots = shots.filter((s) => !s.dead);
  }

  // Time pressure (beholder.js): warning at timing.warn, entry at timing.arrive, then a slow drift through rock
  function makeBeholder(x, y, time) {
    return {
      id: nextId++, kind: 'beholder', x, y, prevX: x, prevY: y, vx: 0, vy: 0,
      radius: BEHOLDER_RADIUS, dead: false, spawnedAt: time, moving: true, ghostly: true,
    };
  }
  function updateBeholder(dt, octoArg, time, world) {
    const octos = octoList(octoArg, ONE);
    if (!beholder && time >= timing.warn && time > 0) {
      if (warn.state === 0) {
        warn.state = 1;
        const octo = leadOf(octos); // the entry is planned around the lead octopus
        warn.pref = (Math.floor(octo.x) + Math.floor(octo.y)) & 1; // left or right side first: varies by where you are, still deterministic
        events.push({ type: 'beholderWarn' });
      }
      const lead = leadOf(octos);
      const plan = planBeholderEntry(lead.x, lead.y, world, warn.pref);
      warn.dx = plan.dx; warn.dy = plan.dy;
      warn.p = Math.min(1, (time - timing.warn) / Math.max(1e-6, timing.arrive - timing.warn));
      if (time >= timing.arrive) {
        beholder = makeBeholder(plan.x, plan.y, time);
        warn.state = 2; warn.p = 1;
        events.push({ type: 'beholderSpawned', x: beholder.x, y: beholder.y });
      }
    }
    if (!beholder) return;
    beholder.prevX = beholder.x; beholder.prevY = beholder.y;
    if (Number.isNaN(beholder.spawnedAt)) beholder.spawnedAt = time;
    const chased = pickTarget(octos, beholder.x, beholder.y);
    driftBeholder(beholder, chased.x, chased.y, beholderSpeed(timing, time - beholder.spawnedAt), dt); // time pressure: drifts through rock like Spelunky's ghost
    for (let k = 0; k < octos.length; k++) { // it touches any octopus: the shared damage entry (CREATURES.md); dead: it keeps knocking the body about
      const octo = octos[k];
      if (dist(beholder.x, beholder.y, octo.x, octo.y) < beholder.radius + octo.radius) {
        octoHit(octo, 'beholder', beholder.x, beholder.y, 'beholder');
      }
    }
  }

  return {
    /** v2: hand over the level's hazard data (hazards.js `data`) so patrolling enemies turn before an anemone or spike wall. */
    setHazardData(d) { hazData = d; },
    /** v2: the level's ink clouds (spells.js createInkClouds; anything with `hides(ex, ey, ox, oy)`), or null. */
    setInkClouds(c) { cloak = c; },
    /** v2: the enemy-infighting runtime (infight.js createInfight): frenzies, projectiles hitting creatures, lures. null: none. */
    setInfight(x) { inf = x; },
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
    /** Time pressure: this level's clock (beholder.js beholderTiming). Set once per level; a new createEnemies starts at 1-1's. */
    setBeholderTiming(t) { timing = t; },
    beholderTiming() { return timing; },
    /** The warning: {state: 0 calm | 1 warning | 2 it is here, p: 0..1 through the warning, dx, dy: the side it comes from}. */
    beholderWarn() { return warn; },

    /** One fixed step. `props` (v2, optional): resting bombs make a crab turn around. */
    update(dt, time, octoArg, world, resident, props = null) {
      const octos = octoList(octoArg, ONE);
      events.length = 0;
      curWorld = world;
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

      for (let i = 0; i < stepList.length; i++) {
        const e = stepList[i];
        if (e.dead) continue;
        if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (e.frozen > 0) { e.frozen = Math.max(0, e.frozen - dt); e.vx = e.vy = 0; e.tell = 0; continue; } // co-op ghost.js: frozen still, no AI, no contact damage (hits still land: applyHit)
        if (e.gvx || e.gvy) stepBlown(e, dt, world); // co-op ghost.js: a ghost's blow drifts it a little, on top of its own pattern
        if (e.stun > 0) { stepKnock(e, dt, world); continue; } // knocked about by a blast: no AI, no contact damage
        if (e.kind === 'piranha') updatePiranha(e, dt, pickTarget(octos, e.x, e.y), world);
        else if (e.kind === 'cannon') updateCannon(e, dt, pickTarget(octos, e.x, e.y), world);
        else if (e.kind === 'crab') updateCrab(e, dt, pickTarget(octos, e.x, e.y), world, props);
        else if (e.kind === 'manta') updateManta(e, dt, pickTarget(octos, e.x, e.y), world);
        else if (e.kind === 'urchin' || e.kind === 'horns') {
          // slow spike pulse: the drawn spikes and the contact radius breathe together
          e.ph += dt * TAU / URCHIN_PULSE_PERIOD;
          e.pulse = 0.5 + 0.5 * Math.sin(e.ph);
          e.radius = e.r0 * (0.92 + 0.2 * e.pulse);
        }

        if (!e.contactDamage) continue;
        // the dead body (V2-PLAN 14) is still a target: contact hits it (octopus.js hitBody), but a flung corpse never kills
        // (a corpse wedged in a gap narrower than the enemy is still in reach of its nose: +0.25)
        for (let k = 0; k < octos.length; k++) { // every octopus touching gets its own check
          const octo = octos[k];
          if (dist(e.x, e.y, octo.x, octo.y) < e.radius + octo.radius + (octo.dead ? 0.25 : 0)) {
            if (e.dashKillable && octoRams(octo)) { // the Urchin Cap (strikes.js): a ram at speed splats it, through the table
              applyHit(e, 'helmet', octo.x, octo.y, -1, 1, octo.vx * 0.4, octo.vy * 0.4);
              if (e.dead) break; // splatted: the other octopi find nothing to touch
            } else if (octoPhasing(octo)) {
              // dash i-frames: the contact does nothing to either side (no hurt, no bite recoil, no manta slam)
            } else {
              if (e.kind === 'manta') { if (e.st === MA_DIVE) octoHit(octo, 'slam', e.x, e.y, 'manta'); } // V2-PLAN 16: only the dive slam hurts (it incapacitates); a gliding manta never bites
              else octoHit(octo, 'bite', e.x, e.y, e.kind);
              if (e.kind === 'piranha' && e.st === PS_LUNGE) piranhaRecover(e, true); // it bit: it recoils
            }
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
      pruneDead();

      updateShots(dt, octos, world, hurtOctopus);
      if (inf) pruneDead(); // a shot that killed an enemy (INFIGHT.projectile)
      updateBeholder(dt, octos, time, world);
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
      applyHit(e, 'ink', e.x, e.y + 1e-3, dmg); // the Ink Jet's own damage, through the table
      return true;
    },
    /** 2026-10-08: the one way an enemy takes a hit (creature-rules.js); see applyHit. Returns the damage dealt (0: ignored). */
    applyHit,
    /** The damage.js family adapter (register it with damage.register). */
    family,

    /** Local co-op (ghost.js): a ghost's blow nudges `e` along (ux, uy) at `dv` u/s (a walker only sideways; an emplacement and
     *  the Beholder not at all). Returns true when it moved. */
    nudge(e, ux, uy, dv) {
      if (!e || e.dead || e.ghost || e.kind === 'beholder' || !e.moving) return false;
      const row = rowOf(e.kind);
      if (row.physics === PH_ANCHORED) return false;
      e.gvx = (e.gvx || 0) + ux * dv; e.gvy = (e.gvy || 0) + (row.physics === PH_WALK ? 0 : uy * dv);
      return true;
    },
    /** Local co-op (ghost.js): a ghost's freeze holds `e` still for `s` seconds (no AI, no attack; hits still land). */
    freeze(e, s) {
      if (!e || e.dead || e.ghost || e.kind === 'beholder') return false;
      e.frozen = Math.max(e.frozen || 0, s); e.tell = 0; e.vx = e.vy = 0; e.gvx = e.gvy = 0;
      return true;
    },
    /** Kill one enemy record by the regular path (corpse, journal, score events); materials: a pushable block crushing it. */
    kill(e, reason = 'crush') { killEnemy(e, reason); },

    /** Kill every enemy (not the Beholder or an immune trap) within `radius`
     * of (x,y) - used by bomb.js.
     * Returns the count killed. */
    killInRadius(x, y, radius) {
      let n = 0;
      for (const e of allEnemies()) {
        if (e.dead) continue;
        if (dist(e.x, e.y, x, y) > radius) continue;
        applyHit(e, 'bomb', x, y, -1, 0); // the table: a bomb kills every ordinary kind (horns are invulnerable)
        if (e.dead) n++;
      }
      pruneDead();
      return n;
    },

    /** A blast at (x, y): every live moving enemy (and cannon) within `reach` is knocked away (radial, linear falloff),
     * flashes and is stunned for `stun` s. Returns the count. (Kills are bomb.js's killInRadius; this moves what survived.) */
    knockInRadius(x, y, reach, power, stun) {
      let n = 0;
      const base = SOURCES.bomb.knock || 1;
      for (const e of allEnemies()) {
        if (e.dead) continue;
        const d = dist(e.x, e.y, x, y);
        if (d > reach) continue;
        const s0 = e.stun;
        applyHit(e, 'bomb', x, y, 0, (1 - d / reach) * power / base); // a shove: no damage; the table says who is thrown or stunned
        if (e.stun !== s0 || e.hitFlash >= 0.3) n++;
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
        beholder = makeBeholder(x, y, NaN); // its drift ramp starts on its first step
        warn.state = 2; warn.p = 1;
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
