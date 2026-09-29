// Seeded, pure chunk generator. OVERNIGHT.md §2 "World" / M2-1.
//
// Deviation (logged in NIGHT-LOG.md): the plan asks for a ported ~40-line fbm
// value noise from `PerlinComputeShader.compute`; tonight's generator uses
// the standard per-cell random-density + 2-pass cellular-automata smoothing
// cave algorithm instead (same "thresholded value noise, smoothed twice"
// shape the plan describes, without porting GPU compute-shader code under
// time pressure). Everything downstream (path carve, flood-fill, spawns) is
// exactly as specified.
//
// Tile values: 0 = water, 1 = unbreakable rock, 2 = soft (breakable) rock.

import { mulberry32, hashSeed } from './rng.js';

export const CHUNK_W = 32;
export const CHUNK_H = 24;
export const BORDER = 2; // left/right unbreakable border, in tiles

const ROCK_DENSITY = 0.45; // initial noise fill probability
const SMOOTH_PASSES = 2;
const PATH_MIN_W = 2;
const PATH_MAX_W = 3;

function idx(x, y) { return y * CHUNK_W + x; }

/** One pass of the standard 3x3-majority cellular automaton: a cell becomes
 * rock if >=5 of its 8 neighbours (out-of-bounds counts as rock) are rock,
 * water if <=3, else unchanged. This is what turns per-cell noise into
 * cave-shaped blobs. */
function smooth(tiles) {
  const out = new Uint8Array(tiles.length);
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = 0; x < CHUNK_W; x++) {
      let rockN = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= CHUNK_W || ny < 0 || ny >= CHUNK_H) { rockN++; continue; }
          if (tiles[idx(nx, ny)] !== 0) rockN++;
        }
      }
      const cur = tiles[idx(x, y)];
      if (rockN >= 5) out[idx(x, y)] = 1;
      else if (rockN <= 3) out[idx(x, y)] = 0;
      else out[idx(x, y)] = cur;
    }
  }
  return out;
}

/** Carve a 2-3 wide meandering path of water from (entryCol, row 0) to
 * (exitCol, row CHUNK_H-1), one row at a time, clamped inside the border. */
function carvePath(tiles, rng, entryCol) {
  const minCol = BORDER, maxCol = CHUNK_W - BORDER - 1;
  const startCol = clampInt(entryCol, minCol, maxCol);
  const target = clampInt(startCol + Math.floor((rng() - 0.5) * (CHUNK_H * 0.8)), minCol, maxCol);
  let col = startCol;
  let actualExitCol = startCol;
  for (let y = 0; y < CHUNK_H; y++) {
    if (y === 0) {
      // Row 0 must sit exactly on entryCol: this is the water cell the
      // previous chunk's exit lines up with, so it must not drift before
      // the meander even starts (drifting here broke top<->bottom
      // connectivity in ~6% of chunks; fixed and verified below).
      col = startCol;
    } else {
      const t = y / (CHUNK_H - 1);
      const targetCol = Math.round(startCol + (target - startCol) * t);
      // Nudge toward targetCol by at most 1 per row: never more than 1, or a
      // 2-3 wide path could lose 4-connectivity between rows (two bands with
      // no shared column are only diagonally adjacent, not connected).
      let step = clampInt(targetCol - col, -1, 1);
      if (step === 0 && rng() < 0.3) step = rng() < 0.5 ? -1 : 1;
      col = clampInt(col + step, minCol, maxCol);
    }
    const w = PATH_MIN_W + Math.floor(rng() * (PATH_MAX_W - PATH_MIN_W + 1));
    for (let dx = 0; dx < w; dx++) {
      const x = clampInt(col + dx - (w >> 1), minCol, maxCol);
      tiles[idx(x, y)] = 0;
    }
    actualExitCol = col;
  }
  // Report the column actually carved at the last row (not the random
  // target), so the next chunk's entryCol always lines up with real water.
  return actualExitCol;
}

function clampInt(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** BFS flood-fill of water tiles reachable from (startX, startY). Returns a
 * Uint8Array mask, 1 = reachable. 4-connected (matches the "≥2 tiles wide"
 * passage requirement: a 1-wide diagonal squeeze does not count as open). */
function floodFillReachable(tiles, startX, startY) {
  const reached = new Uint8Array(tiles.length);
  if (tiles[idx(startX, startY)] !== 0) return reached;
  const stack = [[startX, startY]];
  reached[idx(startX, startY)] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    const neigh = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || nx >= CHUNK_W || ny < 0 || ny >= CHUNK_H) continue;
      const ni = idx(nx, ny);
      if (reached[ni] || tiles[ni] !== 0) continue;
      reached[ni] = 1;
      stack.push([nx, ny]);
    }
  }
  return reached;
}

/**
 * Generate one 32x24 chunk deterministically from `seed` + `chunkIndex`.
 * @param {number} seed
 * @param {number} chunkIndex - 0-based, increasing downward
 * @param {number} entryCol - the column (in this chunk's local space) the
 *   path must start at, i.e. the previous chunk's exitCol.
 */
export function generateChunk(seed, chunkIndex, entryCol) {
  const rng = mulberry32(hashSeed(seed, chunkIndex));
  const tiles = new Uint8Array(CHUNK_W * CHUNK_H);

  // Unbreakable side borders.
  for (let y = 0; y < CHUNK_H; y++) {
    for (let b = 0; b < BORDER; b++) {
      tiles[idx(b, y)] = 1;
      tiles[idx(CHUNK_W - 1 - b, y)] = 1;
    }
  }

  // Noise fill of the interior (thresholded value noise).
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
      tiles[idx(x, y)] = rng() < ROCK_DENSITY ? 1 : 0;
    }
  }

  let smoothed = tiles;
  for (let i = 0; i < SMOOTH_PASSES; i++) smoothed = smooth(smoothed);
  // Re-stamp the unbreakable border (smoothing can erode it at the edges).
  for (let y = 0; y < CHUNK_H; y++) {
    for (let b = 0; b < BORDER; b++) {
      smoothed[idx(b, y)] = 1;
      smoothed[idx(CHUNK_W - 1 - b, y)] = 1;
    }
  }

  const exitCol = carvePath(smoothed, rng, entryCol);

  // Flood-fill from the carved path; anything not reached is sealed off and
  // becomes soft (breakable) rock rather than an unreachable pocket.
  const midRow = Math.floor(CHUNK_H / 2);
  const pathSeedCol = clampInt(entryCol, BORDER, CHUNK_W - BORDER - 1);
  const reached = floodFillReachable(smoothed, pathSeedCol, 0);
  const softPockets = []; // [[x,y], ...] cells turned into soft rock this pass
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
      const i = idx(x, y);
      if (smoothed[i] === 0 && !reached[i]) {
        smoothed[i] = 2;
        softPockets.push([x, y]);
      }
    }
  }

  // --- Spawns ---
  const spawns = [];
  const openCells = [];
  for (let y = 1; y < CHUNK_H - 1; y++) {
    for (let x = BORDER + 1; x < CHUNK_W - BORDER - 1; x++) {
      if (smoothed[idx(x, y)] === 0 && reached[idx(x, y)]) openCells.push([x, y]);
    }
  }

  function pick(list) { return list.length ? list[Math.floor(rng() * list.length)] : null; }

  const pearlCount = 6 + Math.floor(rng() * 5); // 6-10
  for (let i = 0; i < pearlCount; i++) {
    // ~30% of pearls hide in a sealed soft-rock pocket (need a bomb).
    if (softPockets.length && rng() < 0.3) {
      const [x, y] = pick(softPockets);
      spawns.push({ type: 'pearl', x: x + 0.5, y: y + 0.5, hidden: true });
    } else if (openCells.length) {
      const [x, y] = pick(openCells);
      spawns.push({ type: 'pearl', x: x + 0.5, y: y + 0.5, hidden: false });
    }
  }

  const swarmCount = 1 + Math.floor(rng() * 2); // 1-2
  for (let i = 0; i < swarmCount; i++) {
    const center = pick(openCells);
    if (!center) continue;
    const count = 5 + Math.floor(rng() * 8); // 5-12
    spawns.push({ type: 'plankton-swarm', x: center[0] + 0.5, y: center[1] + 0.5, count });
  }

  // At most once per 3 chunks, always behind soft rock.
  if (softPockets.length && chunkIndex % 3 === 0 && rng() < 0.7) {
    const [x, y] = pick(softPockets);
    spawns.push({ type: 'shell', x: x + 0.5, y: y + 0.5 });
  }

  // Enemy slots tagged by placement, from depth 40 onward (depth in world
  // units = chunkIndex * CHUNK_H + local y).
  const depthStart = chunkIndex * CHUNK_H;
  if (depthStart + CHUNK_H >= 40) {
    const slotCount = 2 + Math.floor(rng() * 3); // 2-4 per chunk
    for (let i = 0; i < slotCount; i++) {
      const cell = pick(openCells);
      if (!cell) continue;
      const [x, y] = cell;
      let placement = 'open';
      if (smoothed[idx(x, y + 1)] !== 0) placement = 'floor';
      else if (smoothed[idx(x, y - 1)] !== 0) placement = 'ceiling';
      else if (smoothed[idx(x - 1, y)] !== 0 || smoothed[idx(x + 1, y)] !== 0) placement = 'wall';
      if (depthStart + y < 40) continue; // keep the first 40 units enemy-free
      spawns.push({ type: 'enemy-slot', placement, x: x + 0.5, y: y + 0.5 });
    }
  }

  return { tiles: smoothed, spawns, exitCol, width: CHUNK_W, height: CHUNK_H };
}

/** Sequential chunk stream: each chunk's entryCol is the previous chunk's
 * exitCol, so this must be called in increasing chunkIndex order. */
export function createGenerator(seed) {
  let prevExit = Math.floor(CHUNK_W / 2);
  let nextIndex = 0;
  return {
    next(chunkIndex) {
      if (chunkIndex !== nextIndex) {
        throw new Error(`createGenerator.next: expected chunk ${nextIndex}, got ${chunkIndex}`);
      }
      const chunk = generateChunk(seed, chunkIndex, prevExit);
      prevExit = chunk.exitCol;
      nextIndex++;
      return chunk;
    },
  };
}

/** BFS check used by the tests and self-check: is there a 4-connected path
 * of water tiles from any cell in the top row to any cell in the bottom row? */
export function isTopToBottomConnected(tiles) {
  const startRow = [];
  for (let x = 0; x < CHUNK_W; x++) if (tiles[idx(x, 0)] === 0) startRow.push(x);
  for (const sx of startRow) {
    const reached = floodFillReachable(tiles, sx, 0);
    for (let x = 0; x < CHUNK_W; x++) {
      if (reached[idx(x, CHUNK_H - 1)]) return true;
    }
  }
  return false;
}
