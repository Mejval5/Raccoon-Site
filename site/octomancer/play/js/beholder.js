// Time pressure (2026-10-08, the Spelunky ghost): the Beholder is the level timer. After `warn` seconds on a level the
// water darkens at the screen edges, the drone swells and a distant eye opens on the edge it will come from; at `arrive`
// it enters from off screen (always BEHOLDER_SPAWN_DIST tiles away, never closer than BEHOLDER_MIN_DIST) and drifts slowly
// but relentlessly toward the octopus THROUGH rock, killing on touch. Hub, tutorial and the rest grotto never run the
// clock (main.js passes time 0 there, run.js isSafeState).
//
// Pure data and math; enemies.js owns the live Beholder and calls these.

import { killOctopus } from './octopus.js';

/** Level 1-1 timing (Spelunky: the ghost at 2:30). Deeper levels come a little sooner (beholderTiming). */
export const BEHOLDER_WARN_TIME = 120; // s on the level: the warning starts
export const BEHOLDER_ARRIVE_TIME = 150; // s on the level: it enters
export const BEHOLDER_DEPTH_STEP = 10; // s sooner per level deeper (1-2: 2:20, 1-3: 2:10)
export const BEHOLDER_MIN_ARRIVE = 110; // s, never sooner than this
export const BEHOLDER_WARN_LEAD = 30; // s of warning before it enters

/** Drift: slower than the octopus swims (6 u/s), so you can always outswim it for a while, but it never stops. */
export const BEHOLDER_DRIFT = 1.7; // u/s on 1-1
export const BEHOLDER_DRIFT_DEPTH = 0.2; // + u/s per level deeper
export const BEHOLDER_DRIFT_RAMP = 0.12; // + u/s per 10 s alive
export const BEHOLDER_DRIFT_MAX = 4.2; // u/s cap: still under a plain swim
export const BEHOLDER_TURN = 1.6; // 1/s: how fast its heading eases toward the octopus (a drift, not a homing missile)

/** Entry: off screen on every viewport (desktop shows at most 20 tiles across, a phone ~24 tall). */
export const BEHOLDER_SPAWN_DIST = 17;
export const BEHOLDER_MIN_DIST = 15; // a hard floor: it never appears closer than this

/** The level's clock: {warn, arrive, drift} in seconds / u/s. `levelIndex` is 0 for 1-1. */
export function beholderTiming(levelIndex = 0) {
  const d = Math.max(0, levelIndex | 0);
  const arrive = Math.max(BEHOLDER_MIN_ARRIVE, BEHOLDER_ARRIVE_TIME - BEHOLDER_DEPTH_STEP * d);
  return { warn: arrive - BEHOLDER_WARN_LEAD, arrive, drift: BEHOLDER_DRIFT + BEHOLDER_DRIFT_DEPTH * d };
}

/** Its drift speed `aliveFor` seconds after it entered. */
export function beholderSpeed(timing, aliveFor) {
  return Math.min(BEHOLDER_DRIFT_MAX, timing.drift + BEHOLDER_DRIFT_RAMP * Math.max(0, aliveFor) / 10);
}

// Entry directions in preference order: the sides and the diagonals above first (it reads as coming out of the dark
// around you), straight above / below last.
const DIRS = [
  [-1, 0], [1, 0], [-0.7071, -0.7071], [0.7071, -0.7071], [0, -1], [-0.7071, 0.7071], [0.7071, 0.7071], [0, 1],
];

/**
 * Where it will enter, from where the octopus is now: {x, y, dx, dy} (dx, dy = unit direction from the octopus).
 * The first direction (in DIRS order, starting at `pref`) whose point lies inside the level, padded by 2 tiles,
 * so it comes in from the level's own rock rather than from far outside; any direction works in an open world.
 * The point is always exactly BEHOLDER_SPAWN_DIST from the octopus.
 */
export function planBeholderEntry(ox, oy, world, pref = 0) {
  const W = world && world.width, H = world && world.height, pad = 2;
  for (let k = 0; k < DIRS.length; k++) {
    const [dx, dy] = DIRS[(pref + k) % DIRS.length];
    const x = ox + dx * BEHOLDER_SPAWN_DIST, y = oy + dy * BEHOLDER_SPAWN_DIST;
    if (!W || !H || (x >= -pad && x <= W + pad && y >= -pad && y <= H + pad)) return { x, y, dx, dy };
  }
  const [dx, dy] = DIRS[pref % DIRS.length];
  return { x: ox + dx * BEHOLDER_SPAWN_DIST, y: oy + dy * BEHOLDER_SPAWN_DIST, dx, dy };
}

/** One drift step: ease the heading toward the target, move, no wall collision (it passes through rock). */
export function driftBeholder(b, tx, ty, speed, dt) {
  const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
  const wantX = dx / d * speed, wantY = dy / d * speed;
  const k = Math.min(1, BEHOLDER_TURN * dt);
  b.vx += (wantX - b.vx) * k; b.vy += (wantY - b.vy) * k;
  const v = Math.hypot(b.vx, b.vy);
  if (v > speed) { b.vx *= speed / v; b.vy *= speed / v; } // never faster than its drift
  b.x += b.vx * dt; b.y += b.vy * dt;
}

/**
 * The Beholder's touch. The ONE call site for its damage: retarget this to the unified creature damage table
 * (octomancer-web/CREATURES.md) when it lands. Today: an instant kill that ignores hearts and invulnerability.
 */
export function beholderTouch(octo) {
  killOctopus(octo, 'beholder');
}
