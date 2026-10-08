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
//   - r44 perf: the midpoint test of a move is memoised per grid (quarter lattice), the search buffers are reused
//     between calls, and tileGrid keeps the tile part of the last level's lattice so repeated checks on the same
//     tiles (generate attempts, exit candidates, blocks and hazards) only stamp their blockers. Same answers, bit for bit.

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
  const free = new Uint8Array(nx * ny);
  latticeFree(solid, w, h, rr, nx, ny, free);
  if (blockers.length) stampBlockers(free, nx, ny, rr, blockers);
  return makeGrid(w, h, rr, nx, ny, solid, free, new Uint8Array((2 * nx - 1) * (2 * ny - 1)), blockers);
}

// A point is free when the tiles leave room for the body (tilesFree) AND no blocker circle overlaps it (blockerFree);
// both keep exactly the arithmetic of the original single freeAt.
function tilesFree(solid, w, h, rr, px, py) {
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
  return true;
}
function blockerFree(blockers, rr, px, py) {
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i], dx = px - b.x, dy = py - b.y, rad = rr + b.r;
    if (dx * dx + dy * dy < rad * rad) return false;
  }
  return true;
}
function latticeFree(solid, w, h, rr, nx, ny, free) {
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) free[gy * nx + gx] = tilesFree(solid, w, h, rr, gx * PATH_STEP, gy * PATH_STEP) ? 1 : 0;
}
/** Clear the lattice points a blocker circle overlaps (only points inside its box can be hit). */
function stampBlockers(free, nx, ny, rr, blockers) {
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i], rad = rr + b.r;
    const g0x = Math.max(0, Math.floor((b.x - rad) / PATH_STEP) - 1), g1x = Math.min(nx - 1, Math.ceil((b.x + rad) / PATH_STEP) + 1);
    const g0y = Math.max(0, Math.floor((b.y - rad) / PATH_STEP) - 1), g1y = Math.min(ny - 1, Math.ceil((b.y + rad) / PATH_STEP) + 1);
    for (let gy = g0y; gy <= g1y; gy++) {
      for (let gx = g0x; gx <= g1x; gx++) {
        const dx = gx * PATH_STEP - b.x, dy = gy * PATH_STEP - b.y;
        if (dx * dx + dy * dy < rad * rad) free[gy * nx + gx] = 0;
      }
    }
  }
}
/** `mid` memoises tilesFree at move midpoints (quarter lattice, (2nx-1) x (2ny-1); 0 unknown, 1 free, 2 not): valid while the tiles stay. */
function makeGrid(w, h, rr, nx, ny, solid, free, mid, blockers, midBlk = null, blkRun = 0) {
  const freeAt = (px, py) => tilesFree(solid, w, h, rr, px, py) && blockerFree(blockers, rr, px, py);
  return { w, h, nx, ny, rr, free, freeAt, solid, mid, mw: 2 * nx - 1, blockers, midBlk, blkRun };
}
/** Mark the move midpoints (quarter lattice) a blocker circle overlaps with `run` (blockerFree's arithmetic). */
function stampMidBlockers(midBlk, mw, mh, rr, blockers, run) {
  const Q = 0.5 * PATH_STEP;
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i], rad = rr + b.r;
    const q0x = Math.max(0, Math.floor((b.x - rad) / Q) - 1), q1x = Math.min(mw - 1, Math.ceil((b.x + rad) / Q) + 1);
    const q0y = Math.max(0, Math.floor((b.y - rad) / Q) - 1), q1y = Math.min(mh - 1, Math.ceil((b.y + rad) / Q) + 1);
    for (let qy = q0y; qy <= q1y; qy++) {
      for (let qx = q0x; qx <= q1x; qx++) {
        const dx = qx * 0.5 * PATH_STEP - b.x, dy = qy * 0.5 * PATH_STEP - b.y;
        if (dx * dx + dy * dy < rad * rad) midBlk[qy * mw + qx] = run;
      }
    }
  }
}

/**
 * latticeFree for a body radius under half a tile: a lattice point (whole or half tile coordinates) lies inside or on the
 * edge of every tile its box touches, so the distance freeAt measures to any of them is 0 and the point is free exactly
 * when it is in bounds and none of those 1-4 tiles is solid. Same answers as latticeFree, without the distance math.
 */
function latticeFreeSmall(solid, w, h, nx, ny, free) {
  free.fill(0, 0, nx * ny);
  for (let gy = 1; gy < ny - 1; gy++) {
    const ty0 = (gy - 1) >> 1, ty1 = gy >> 1;
    for (let gx = 1; gx < nx - 1; gx++) {
      const tx0 = (gx - 1) >> 1, tx1 = gx >> 1;
      free[gy * nx + gx] = solid[ty0 * w + tx0] | solid[ty0 * w + tx1] | solid[ty1 * w + tx0] | solid[ty1 * w + tx1] ? 0 : 1;
    }
  }
}

// ---- the level grid cache: the tile part of the lattice and the midpoint memo for the last solidity seen (compared tile
// by tile, so a materials pass that only turns rock into bone or timber keeps it); a call with blockers stamps them on a copy.
const _tg = { w: 0, h: 0, nx: 0, ny: 0, solid: null, base: null, work: null, mid: null, midBlk: null, blkRun: 0, gen: 0 };
/**
 * The path grid for a tile array (solid where tiles[i] !== 0, the default radius) plus blocker circles, the tile part from a
 * one-level cache. The grid and its arrays are only valid until the next tileGrid call; `grid.gen` changes when the tiles do.
 */
export function tileGrid(tiles, w, h, blockers) {
  const rr = OCTO_RADIUS + PATH_MARGIN;
  const c = _tg, WH = w * h;
  let same = c.solid !== null && c.w === w && c.h === h;
  if (same) { const a = c.solid; for (let i = 0; i < WH; i++) if (a[i] !== (tiles[i] !== 0 ? 1 : 0)) { same = false; break; } }
  if (!same) {
    const nx = Math.round(w / PATH_STEP) + 1, ny = Math.round(h / PATH_STEP) + 1;
    if (!c.solid || c.solid.length !== WH || c.nx !== nx || c.ny !== ny) {
      c.solid = new Uint8Array(WH);
      c.base = new Uint8Array(nx * ny); c.work = new Uint8Array(nx * ny); c.mid = new Uint8Array((2 * nx - 1) * (2 * ny - 1));
      c.midBlk = new Uint32Array((2 * nx - 1) * (2 * ny - 1)); c.blkRun = 0;
    }
    c.w = w; c.h = h; c.nx = nx; c.ny = ny; c.gen++;
    for (let i = 0; i < WH; i++) c.solid[i] = tiles[i] !== 0 ? 1 : 0;
    if (rr < 0.5 && nx === 2 * w + 1 && ny === 2 * h + 1) latticeFreeSmall(c.solid, w, h, nx, ny, c.base);
    else latticeFree(c.solid, w, h, rr, nx, ny, c.base);
    c.mid.fill(0);
  }
  const bl = blockers || [];
  let free = c.base;
  let midBlk = null;
  if (bl.length) {
    c.work.set(c.base); stampBlockers(c.work, c.nx, c.ny, rr, bl); free = c.work;
    if (++c.blkRun >= 0xffffffff) { c.midBlk.fill(0); c.blkRun = 1; }
    stampMidBlockers(c.midBlk, 2 * c.nx - 1, 2 * c.ny - 1, rr, bl, c.blkRun); midBlk = c.midBlk;
  }
  const g = makeGrid(w, h, rr, c.nx, c.ny, c.solid, free, c.mid, bl, midBlk, c.blkRun);
  g.gen = c.gen;
  return g;
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

/** Whether the move's midpoint (gx + tx, gy + ty in quarter-lattice units) is free: the tile part memoised in grid.mid. */
function midFree(grid, qx, qy) {
  const k = qy * grid.mw + qx, mid = grid.mid;
  let m = mid[k];
  const px = qx * 0.5 * PATH_STEP, py = qy * 0.5 * PATH_STEP;
  if (m === 0) { m = tilesFree(grid.solid, grid.w, grid.h, grid.rr, px, py) ? 1 : 2; mid[k] = m; }
  if (m === 2) return false;
  if (grid.midBlk) return grid.midBlk[k] !== grid.blkRun;
  return grid.blockers.length === 0 || blockerFree(grid.blockers, grid.rr, px, py);
}

/** Whether the lattice move from node (gx,gy) in direction d is legal. */
function moveOk(grid, gx, gy, d) {
  const { nx, ny, free } = grid;
  const tx = gx + DX[d], ty = gy + DY[d];
  if (tx < 0 || ty < 0 || tx >= nx || ty >= ny || !free[ty * nx + tx]) return false;
  if (d >= 4 && !(free[gy * nx + tx] && free[ty * nx + gx])) return false; // diagonal corner cut
  return midFree(grid, gx + tx, gy + ty);
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
  const N = grid.nx * grid.ny;
  return floodNodes(grid, sx, sy, new Uint8Array(N), new Int32Array(N));
}

/** reachableNodes into caller buffers (`seen` is cleared first; both at least nx*ny long). */
export function floodNodes(grid, sx, sy, seen, q) {
  const { nx, ny, free, mid, mw, solid, w, h, rr, blockers, midBlk, blkRun } = grid;
  seen.fill(0, 0, nx * ny);
  const s = nearestNode(grid, sx, sy);
  if (s < 0) return seen;
  const nb = blockers.length;
  let qh = 0, qt = 0;
  q[qt++] = s; seen[s] = 1;
  // moveOk inlined: target free, no corner cut on a diagonal, midpoint free (tiles memoised in mid, then the blockers)
  while (qh < qt) {
    const i = q[qh++], gx = i % nx, gy = (i / nx) | 0;
    for (let d = 0; d < 8; d++) {
      const jx = gx + DX[d], jy = gy + DY[d];
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const j = jy * nx + jx;
      if (seen[j] || !free[j]) continue;
      if (d >= 4 && !(free[gy * nx + jx] && free[jy * nx + gx])) continue;
      const qx = gx + jx, qy = gy + jy, k = qy * mw + qx;
      let m = mid[k];
      if (m === 0) { m = tilesFree(solid, w, h, rr, qx * 0.5 * PATH_STEP, qy * 0.5 * PATH_STEP) ? 1 : 2; mid[k] = m; }
      if (m === 2) continue;
      if (midBlk) { if (midBlk[k] === blkRun) continue; }
      else if (nb && !blockerFree(blockers, rr, qx * 0.5 * PATH_STEP, qy * 0.5 * PATH_STEP)) continue;
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

// A* scratch, reused between calls: g / parent are valid for a node only when its stamp is this search's
let _aN = 0, _aG = null, _aKey = null, _aParent = null, _aStamp = null, _aClosed = null, _aHeap = null, _aRun = 0;
function hOf(i, nx, gx, gy, goalR) { return Math.max(0, Math.hypot((i % nx) * PATH_STEP - gx, ((i / nx) | 0) * PATH_STEP - gy) - goalR); }

/**
 * A* from a start point to within `goalR` of a goal point. Returns null when unreachable, else
 * {points: Float32Array [x0,y0,x1,y1,...] (world units, start first), length, expanded}.
 */
export function findPath(grid, sx, sy, gx, gy, goalR = EXIT_TRIGGER_R - 0.15) {
  const { nx, ny } = grid;
  const N = nx * ny;
  const s = nearestNode(grid, sx, sy);
  if (s < 0) return null;
  if (N > _aN) {
    _aN = N; _aG = new Float32Array(N); _aKey = new Float32Array(N); _aParent = new Int32Array(N);
    _aStamp = new Uint32Array(N); _aClosed = new Uint32Array(N); _aHeap = new Int32Array(N * 8); _aRun = 0;
  }
  if (++_aRun >= 0xffffffff) { _aStamp.fill(0); _aClosed.fill(0); _aRun = 1; }
  const run = _aRun, g = _aG, key = _aKey, parent = _aParent, stamp = _aStamp, closed = _aClosed, heap = _aHeap;
  let size = 0, expanded = 0;
  g[s] = 0; parent[s] = -1; stamp[s] = run;
  heapPush(heap, size++, key, s, hOf(s, nx, gx, gy, goalR));
  let found = -1;
  while (size > 0) {
    const i = heapPop(heap, size--, key);
    if (closed[i] === run) continue;
    closed[i] = run; expanded++;
    const ix = i % nx, iy = (i / nx) | 0;
    if (Math.hypot(ix * PATH_STEP - gx, iy * PATH_STEP - gy) <= goalR) { found = i; break; }
    const gi = g[i];
    for (let d = 0; d < 8; d++) {
      const jx = ix + DX[d], jy = iy + DY[d];
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const j = jy * nx + jx;
      if (closed[j] === run) continue;
      const ng = gi + (d >= 4 ? SQ2 : 1) * PATH_STEP;
      if (stamp[j] === run && ng >= g[j]) continue;
      if (!moveOk(grid, ix, iy, d)) continue;
      g[j] = ng; parent[j] = i; stamp[j] = run;
      heapPush(heap, size++, key, j, ng + hOf(j, nx, gx, gy, goalR));
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
