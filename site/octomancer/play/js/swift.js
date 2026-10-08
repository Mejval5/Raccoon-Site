// Swift Current (2026-10-08): the optional, skill-rewarding level bonus (Spelunky 2's "finish fast" kind). Each generated
// level gets a target time from the swim distance between the start and the exit whirlpool. Reach the whirlpool's
// surroundings before it and the current brings up a moon shell (shells.js SK_MOON, the top shell, worth more than a
// pearl): it pops out of the whirlpool toward you. If you dive in without grabbing it, it is paid into the purse anyway.
// The target shows on the level banner (a small current mark with the time); earning it is a quiet toast and a journal
// count (`loot-swift`, "Earned").
//
// Pure logic, no drawing; main.js wires it.

export const SWIFT_NEAR = 5; // tiles from the whirlpool centre that count as "reached it"
export const SWIFT_SWIM = 2.6; // u/s: the average pace the target assumes (a plain swim tops out at 6, paths wind)
export const SWIFT_SLACK = 12; // s added on top (getting your bearings, a bomb or two)
export const SWIFT_MIN = 30, SWIFT_MAX = 120; // s

/** Tiles of 4-connected open-water path from the start to the exit (BFS over `isSolid`), or -1 when not connected. */
export function swimDistance(world, sx, sy, ex, ey) {
  const W = world.width | 0, H = world.height | 0;
  if (!W || !H) return -1;
  const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.floor(ex), y1 = Math.floor(ey);
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !world.isSolid(x + 0.5, y + 0.5);
  if (!open(x0, y0)) return -1;
  const dist = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H);
  let h = 0, t = 0;
  dist[y0 * W + x0] = 0; q[t++] = y0 * W + x0;
  while (h < t) {
    const i = q[h++], x = i % W, y = (i / W) | 0;
    if (x === x1 && y === y1) return dist[i];
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!open(nx, ny) || dist[ny * W + nx] >= 0) continue;
      dist[ny * W + nx] = dist[i] + 1; q[t++] = ny * W + nx;
    }
  }
  return -1;
}

/** The level's target in whole seconds, rounded up to 5 (a soft-rock wall in the way still counts as a long swim). */
export function swiftTarget(pathTiles) {
  const raw = pathTiles > 0 ? pathTiles / SWIFT_SWIM + SWIFT_SLACK : SWIFT_MAX;
  return Math.max(SWIFT_MIN, Math.min(SWIFT_MAX, Math.ceil(raw / 5) * 5));
}

/** "0:45" */
export function swiftLabel(sec) {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** This level's bonus state. `exitX/Y` = the whirlpool centre. */
export function createSwift(target, exitX, exitY) {
  return { target, exitX, exitY, earned: false, paid: false, shell: null };
}

/** One step: true exactly once, on the step the octopus first comes within SWIFT_NEAR of the whirlpool in time. */
export function stepSwift(sw, time, octo) {
  if (!sw || sw.earned || octo.dead || time > sw.target) return false;
  if (Math.hypot(octo.x - sw.exitX, octo.y - sw.exitY) > SWIFT_NEAR) return false;
  sw.earned = true;
  return true;
}

/** Is the window still open? (the HUD / tests) */
export function swiftOpen(sw, time) { return !!sw && !sw.earned && time <= sw.target; }
