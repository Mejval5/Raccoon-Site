// A* reachability check for v2 levels (V2-PLAN "A* check", round 22). Answers one question on the
// FINAL in-game tiles (after quantum rolls, shaving, clearance carving, pockets, spawns and any
// blocking props): can a body of the octopus's real collision radius swim from the start marker to
// the exit trigger radius?
//
//   - Search space: a lattice of world points every PATH_STEP (0.5) units, so a 1-tile corridor
//     (centre line) and a 2-tile passage (any of 3 lines) are both representable.
//   - A lattice point is free when a circle of OCTO_RADIUS + PATH_MARGIN centred there overlaps no
//     solid tile (distance to the tile's square, the same shape physics.js resolves against) and no
//     blocking prop circle. Out of bounds counts as solid.
//   - 8 directions. A move is legal when both end points and the segment midpoint are free; a
//     diagonal move also needs both orthogonal neighbours free (no corner cutting).
//   - Data-oriented: flat typed arrays, no per-node objects. The solidity is a callback so the game can
//     pass world.isSolid-style reads (bomb walls counted as open only where the caller says so).

import { OCTO_RADIUS } from './config.js';

export const PATH_MARGIN = 0.03;
export const PATH_STEP = 0.5;
export const EXIT_TRIGGER_R = 1.2; // world-v2.js reachedExit
const SQ2 = Math.SQRT2;

/**
 * @param {number} w tile columns
 * @param {number} h tile rows
 * @param {(tx:number,ty:number)=>boolean} isSolid tile solidity (called only for in-bounds tiles)
 * @param {{radius?:number, margin?:number, blockers?:{x:number,y:number,r:number}[]}} [opts]
 */
export function createPathGrid(w, h, isSolid, opts = {}) {
  const rr = (opts.radius === undefined ? OCTO_RADIUS : opts.radius) + (opts.margin === undefined ? PATH_MARGIN : opts.margin);
  const blockers = opts.blockers || [];
  const nx = Math.round(w / PATH_STEP) + 1, ny = Math.round(h / PATH_STEP) + 1;
  // solid tile cache (1 byte per tile) so isSolid runs once per tile
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) solid[y * w + x] = isSolid(x, y) ? 1 : 0;

  function freeAt(px, py) {
    if (px < rr || py < rr || px > w - rr || py > h - rr) return false;
    const x0 = Math.floor(px - rr), x1 = Math.floor(px + rr), y0 = Math.floor(py - rr), y1 = Math.floor(py + rr);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!solid[ty * w + tx]) continue;
        const cx = px < tx ? tx : px > tx + 1 ? tx + 1 : px;
        const cy = py < ty ? ty : py > ty + 1 ? ty + 1 : py;
        const dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy < rr * rr) return false;
      }
    }
    for (let i = 0; i < blockers.length; i++) {
      const b = blockers[i], dx = px - b.x, dy = py - b.y, rad = rr + b.r;
      if (dx * dx + dy * dy < rad * rad) return false;
    }
    return true;
  }

  const free = new Uint8Array(nx * ny);
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) free[gy * nx + gx] = freeAt(gx * PATH_STEP, gy * PATH_STEP) ? 1 : 0;
  return { w, h, nx, ny, rr, free, freeAt };
}

/** Lattice index of the free node nearest to a world point, or -1. */
export function nearestNode(grid, x, y) {
  const { nx, ny, free } = grid;
  const cx = Math.round(x / PATH_STEP), cy = Math.round(y / PATH_STEP);
  let best = -1, bd = 1e9;
  for (let r = 0; r <= 4; r++) {
    for (let gy = cy - r; gy <= cy + r; gy++) {
      for (let gx = cx - r; gx <= cx + r; gx++) {
        if (gx < 0 || gy < 0 || gx >= nx || gy >= ny || !free[gy * nx + gx]) continue;
        const d = Math.hypot(gx * PATH_STEP - x, gy * PATH_STEP - y);
        if (d < bd) { bd = d; best = gy * nx + gx; }
      }
    }
    if (best >= 0) return best;
  }
  return best;
}

// 8 neighbours: 4 orthogonal, then 4 diagonal
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Whether the lattice move from node (gx,gy) in direction d is legal. */
function moveOk(grid, gx, gy, d) {
  const { nx, ny, free, freeAt } = grid;
  const tx = gx + DX[d], ty = gy + DY[d];
  if (tx < 0 || ty < 0 || tx >= nx || ty >= ny || !free[ty * nx + tx]) return false;
  if (d >= 4 && !(free[gy * nx + tx] && free[ty * nx + gx])) return false; // diagonal corner cut
  return freeAt((gx + tx) * 0.5 * PATH_STEP, (gy + ty) * 0.5 * PATH_STEP);
}

/** True when a straight segment (world units) stays free for the body: used to smooth paths and steer. */
export function segmentFree(grid, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / 0.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!grid.freeAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/** Nodes reachable from a start point (flood fill over legal moves). Uint8Array over the lattice, 1 = reached. */
export function reachableNodes(grid, sx, sy) {
  const { nx, ny } = grid;
  const seen = new Uint8Array(nx * ny);
  const s = nearestNode(grid, sx, sy);
  if (s < 0) return seen;
  const q = new Int32Array(nx * ny);
  let qh = 0, qt = 0;
  q[qt++] = s; seen[s] = 1;
  while (qh < qt) {
    const i = q[qh++], gx = i % nx, gy = (i / nx) | 0;
    for (let d = 0; d < 8; d++) {
      const jx = gx + DX[d], jy = gy + DY[d];
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const j = jy * nx + jx;
      if (seen[j] || !moveOk(grid, gx, gy, d)) continue;
      seen[j] = 1; q[qt++] = j;
    }
  }
  return seen;
}

/** Whether the reached set (from reachableNodes) contains a node within `r` of the world point. */
export function reachedNear(grid, reached, x, y, r = 0.75) {
  const { nx, ny } = grid;
  const g0x = Math.max(0, Math.floor((x - r) / PATH_STEP)), g1x = Math.min(nx - 1, Math.ceil((x + r) / PATH_STEP));
  const g0y = Math.max(0, Math.floor((y - r) / PATH_STEP)), g1y = Math.min(ny - 1, Math.ceil((y + r) / PATH_STEP));
  for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
    if (reached[gy * nx + gx] && Math.hypot(gx * PATH_STEP - x, gy * PATH_STEP - y) <= r) return true;
  }
  return false;
}

// ---- binary min-heap over node ids keyed by f (typed arrays, lazy deletion) ----
function heapPush(heap, size, key, id, f) {
  let i = size;
  key[id] = f;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (key[heap[p]] <= f) break;
    heap[i] = heap[p]; i = p;
  }
  heap[i] = id;
}
function heapPop(heap, size, key) {
  const top = heap[0];
  const last = heap[size - 1];
  const n = size - 1;
  const f = key[last];
  let i = 0;
  while (true) {
    let c = 2 * i + 1;
    if (c >= n) break;
    if (c + 1 < n && key[heap[c + 1]] < key[heap[c]]) c++;
    if (key[heap[c]] >= f) break;
    heap[i] = heap[c]; i = c;
  }
  if (n > 0) heap[i] = last;
  return top;
}

/**
 * A* from a start point to within `goalR` of a goal point. Returns null when unreachable, else
 * {points: Float32Array [x0,y0,x1,y1,...] (world units, start first), length, expanded}.
 */
export function findPath(grid, sx, sy, gx, gy, goalR = EXIT_TRIGGER_R - 0.15) {
  const { nx, ny } = grid;
  const N = nx * ny;
  const s = nearestNode(grid, sx, sy);
  if (s < 0) return null;
  const g = new Float32Array(N).fill(Infinity);
  const key = new Float32Array(N);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Int32Array(N * 8);
  let size = 0, expanded = 0;
  const hOf = (i) => Math.max(0, Math.hypot((i % nx) * PATH_STEP - gx, ((i / nx) | 0) * PATH_STEP - gy) - goalR);
  g[s] = 0;
  heapPush(heap, size++, key, s, hOf(s));
  let found = -1;
  while (size > 0) {
    const i = heapPop(heap, size--, key);
    if (closed[i]) continue;
    closed[i] = 1; expanded++;
    const ix = i % nx, iy = (i / nx) | 0;
    if (Math.hypot(ix * PATH_STEP - gx, iy * PATH_STEP - gy) <= goalR) { found = i; break; }
    for (let d = 0; d < 8; d++) {
      const jx = ix + DX[d], jy = iy + DY[d];
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const j = jy * nx + jx;
      if (closed[j]) continue;
      const ng = g[i] + (d >= 4 ? SQ2 : 1) * PATH_STEP;
      if (ng >= g[j]) continue;
      if (!moveOk(grid, ix, iy, d)) continue;
      g[j] = ng; parent[j] = i;
      heapPush(heap, size++, key, j, ng + hOf(j));
    }
  }
  if (found < 0) return null;
  const chain = [];
  for (let i = found; i >= 0; i = parent[i]) chain.push(i);
  chain.reverse();
  const points = new Float32Array(chain.length * 2);
  for (let k = 0; k < chain.length; k++) { points[k * 2] = (chain[k] % nx) * PATH_STEP; points[k * 2 + 1] = ((chain[k] / nx) | 0) * PATH_STEP; }
  return { points, length: g[found], expanded };
}

/**
 * One-call check on a tile array: solid tiles are `tiles[i] !== 0` unless `open(tx,ty)` says the tile
 * is passable (a bomb wall the player is guaranteed to be able to break).
 * @param {{open?:(tx:number,ty:number)=>boolean, blockers?:any[], goalR?:number}} [opts]
 */
export function pathSolvable(tiles, w, h, sx, sy, ex, ey, opts = {}) {
  const open = opts.open;
  const grid = createPathGrid(w, h, (x, y) => tiles[y * w + x] !== 0 && !(open && open(x, y)), opts);
  return findPath(grid, sx + 0.5, sy + 0.5, ex + 0.5, ey + 0.5, opts.goalR) !== null;
}
