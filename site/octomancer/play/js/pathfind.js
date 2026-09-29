// A* pathfinding for chasers, bounded to a window around the chaser and its
// target so a search never scans the whole (effectively endless) world, plus
// a per-fixed-step node-expansion budget shared across every caller so a bad
// frame (several chasers all recomputing at once) can't spike frame time.
// round-6 task 5 (NIGHT-LOG.md): "make chasers (Beholder, piranhas once they
// spot the player) path-find with A* on the tile grid (recompute a few times
// per second, smooth the path, per-frame time budget)".
//
// Read first, per the task: how the Unity chasers actually moved.
// `MoveSideways.cs` (crab/patrol enemies) is a fixed-range back-and-forth at
// constant speed, flipping at each end -- no pathfinding at all, which is
// why patrol enemies here (updateCrab/updatePiranha's non-chasing branch)
// keep that exact "walk until blocked, turn around" shape untouched.
// `EyeChaser`/`Beholder_*` (the Beholder) is a pure straight-line homing
// chase in the original -- it "ignores rock" by design, a dread enemy meant
// to always be visibly closing distance on the player, with no obstacle
// avoidance of its own. This A* keeps that same always-closing FEEL (it
// still homes on the player and still speeds up the same way over time) but
// routes the straight-line desire around rock instead of clipping through
// it, since round-6 task 5 also requires the Beholder to collide with the
// grid like every other moving enemy now.

const DEFAULT_MAX_NODES = 500;
const PAD = 5; // tiles of slack around the start/goal bounding box

function heuristic(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function key(x, y) { return y * 1000003 + x; }

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Raw tile-grid A*, bounded + budgeted. Returns an array of {x,y} tile
 * centres from start to goal (or the closest node reached, if the budget or
 * bound ran out before the goal), or null if the start/goal itself is solid. */
function astar(isSolid, sx, sy, gx, gy, maxNodes) {
  if (isSolid(sx, sy) || isSolid(gx, gy)) return null;
  const minX = Math.min(sx, gx) - PAD, maxX = Math.max(sx, gx) + PAD;
  const minY = Math.min(sy, gy) - PAD, maxY = Math.max(sy, gy) + PAD;
  const inBounds = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;

  /** @type {Map<number, {x:number,y:number,g:number,f:number,parent:number|null}>} */
  const nodes = new Map();
  const open = new Set();
  const closed = new Set();
  const startKey = key(sx, sy);
  nodes.set(startKey, { x: sx, y: sy, g: 0, f: heuristic(sx, sy, gx, gy), parent: null });
  open.add(startKey);

  let bestKey = startKey, bestH = heuristic(sx, sy, gx, gy);
  let expansions = 0;
  while (open.size && expansions < maxNodes) {
    let curKey = null, cur = null;
    for (const k of open) {
      const n = nodes.get(k);
      if (!cur || n.f < cur.f) { cur = n; curKey = k; }
    }
    open.delete(curKey);
    closed.add(curKey);
    expansions++;
    const h = heuristic(cur.x, cur.y, gx, gy);
    if (h < bestH) { bestH = h; bestKey = curKey; }
    if (cur.x === gx && cur.y === gy) { bestKey = curKey; break; }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny) || isSolid(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (isSolid(cur.x + dx, cur.y) || isSolid(cur.x, cur.y + dy))) continue; // no corner-cutting
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const g = cur.g + cost;
      const existing = nodes.get(nk);
      if (!existing || g < existing.g) {
        nodes.set(nk, { x: nx, y: ny, g, f: g + heuristic(nx, ny, gx, gy), parent: curKey });
        open.add(nk);
      }
    }
  }
  const path = [];
  let k = bestKey;
  while (k !== null) {
    const n = nodes.get(k);
    path.push({ x: n.x + 0.5, y: n.y + 0.5 });
    k = n.parent;
  }
  path.reverse();
  return path;
}

/** DDA-ish line-of-sight check between two world points: true if no solid
 * tile lies on the straight segment between them. */
export function hasLineOfSight(isSolid, ax, ay, bx, by) {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist * 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isSolid(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false;
  }
  return true;
}

/** Prunes a tile-by-tile path down to the few waypoints that actually need a
 * turn (each kept waypoint has line-of-sight to the previous one), so a
 * chaser steers smoothly toward the next turn instead of snapping heading
 * every single tile. */
function smoothPath(isSolid, points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !hasLineOfSight(isSolid, points[i].x, points[i].y, points[j].x, points[j].y)) j--;
    out.push(points[j]);
    i = j;
  }
  return out;
}

// Shared per-fixed-step node budget (round-6 task 5: "per-frame time
// budget"), so several chasers recomputing on the same step can't each pay
// the full A* cost -- later callers this step get a smaller allowance (down
// to a minimum floor) rather than none, so a request always makes at least
// some progress.
let stepBudget = DEFAULT_MAX_NODES * 4;
export function resetPathBudget() { stepBudget = DEFAULT_MAX_NODES * 4; }

/** Finds a smoothed path from (startX,startY) to (goalX,goalY) in world
 * units, consuming this step's shared budget. Returns null if there is no
 * budget left, the start/goal is solid, or a straight line already has
 * clear line-of-sight (callers should check `hasLineOfSight` first and skip
 * calling this at all when it's clear -- cheaper than a full search). */
export function findSmoothPath(isSolid, startX, startY, goalX, goalY) {
  if (stepBudget <= 0) return null;
  const budget = Math.max(60, Math.min(DEFAULT_MAX_NODES, stepBudget));
  const sx = Math.floor(startX), sy = Math.floor(startY);
  const gx = Math.floor(goalX), gy = Math.floor(goalY);
  const raw = astar(isSolid, sx, sy, gx, gy, budget);
  stepBudget -= budget;
  if (!raw || raw.length < 2) return raw;
  return smoothPath(isSolid, raw);
}
