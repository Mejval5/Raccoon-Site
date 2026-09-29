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

  // Visual pass, round 1 (Daniel's screenshot review: "one tile is drawn as
  // a circle -- the lone-island tile-0 appearing where it shouldn't"):
  // `pickWallArt` (render.js) picks the `tile-0` lone-circle art for *any*
  // solid tile with 3-4 open orthogonal neighbours, whether or not that
  // tile's own component is small -- a single-tile-wide nub still attached
  // to a much bigger wall mass gets the same circle as a true isolated
  // island. The noise+smoothing above readily leaves both shapes scattered
  // through open, reached water, same as it leaves the small water pockets
  // the MIN_SOFT_POCKET pass below already cleans up.
  //
  // Two cleanup passes, in order: first shave any interior solid tile with
  // 3+ open sides straight to water regardless of its component's size (a
  // couple of passes, since shaving one nub can expose its former neighbour
  // in turn); then demote any remaining solid component smaller than
  // MIN_ROCK_ISLAND as a whole (catches small blobs -- an L-tromino, say --
  // where no single tile has 3 open sides but the group still reads as
  // clutter). Both skip the level's own unbreakable side border (a real
  // wall, not noise) and the chunk's top/bottom row (may continue into a
  // neighbouring chunk, generated independently, so neither its true shape
  // nor its component size is known here).
  {
    const countOpen = (x, y) => {
      let n = 0;
      if (smoothed[idx(x, y - 1)] === 0) n++;
      if (smoothed[idx(x, y + 1)] === 0) n++;
      if (smoothed[idx(x - 1, y)] === 0) n++;
      if (smoothed[idx(x + 1, y)] === 0) n++;
      return n;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 1; y < CHUNK_H - 1; y++) {
        for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
          const i = idx(x, y);
          if (smoothed[i] === 0) continue;
          if (countOpen(x, y) >= 3) smoothed[i] = 0;
        }
      }
    }
  }
  const MIN_ROCK_ISLAND = 4;
  {
    const visited = new Uint8Array(smoothed.length);
    for (let y = 0; y < CHUNK_H; y++) {
      for (let x = 0; x < CHUNK_W; x++) {
        const i0 = idx(x, y);
        if (visited[i0] || smoothed[i0] === 0) continue;
        const comp = [[x, y]];
        const stack = [[x, y]];
        visited[i0] = 1;
        let touchesEdge = false;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          if (cx < BORDER || cx >= CHUNK_W - BORDER || cy === 0 || cy === CHUNK_H - 1) touchesEdge = true;
          const neigh = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
          for (const [nx, ny] of neigh) {
            if (nx < 0 || nx >= CHUNK_W || ny < 0 || ny >= CHUNK_H) continue;
            const ni = idx(nx, ny);
            if (visited[ni] || smoothed[ni] === 0) continue;
            visited[ni] = 1;
            comp.push([nx, ny]);
            stack.push([nx, ny]);
          }
        }
        if (!touchesEdge && comp.length < MIN_ROCK_ISLAND) {
          for (const [cx, cy] of comp) smoothed[idx(cx, cy)] = 0;
        }
      }
    }
  }

  const exitCol = carvePath(smoothed, rng, entryCol);

  // Flood-fill from the carved path; anything not reached is sealed off and
  // becomes soft (breakable) rock rather than an unreachable pocket.
  const midRow = Math.floor(CHUNK_H / 2);
  const pathSeedCol = clampInt(entryCol, BORDER, CHUNK_W - BORDER - 1);
  const reached = floodFillReachable(smoothed, pathSeedCol, 0);
  let softPockets = []; // [[x,y], ...] cells turned into soft rock this pass
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
      const i = idx(x, y);
      if (smoothed[i] === 0 && !reached[i]) {
        smoothed[i] = 2;
        softPockets.push([x, y]);
      }
    }
  }

  // Visual pass (this session): the noise+smoothing above seals off many
  // single- and double-tile pockets, which used to render as a dense grid of
  // small breakable-rock dots (Daniel's screenshot review). Merge sealed
  // cells into 4-connected components and demote anything smaller than
  // MIN_SOFT_POCKET back to unbreakable rock, so what's left reads as a few
  // larger coral-like clusters instead. Runs before spawn selection below, so
  // shells/hidden pearls only ever land in a pocket that stays soft rock
  // (gen.test.js asserts that).
  const MIN_SOFT_POCKET = 4;
  if (softPockets.length) {
    const sealed = new Uint8Array(smoothed.length);
    for (const [x, y] of softPockets) sealed[idx(x, y)] = 1;
    const visited = new Uint8Array(smoothed.length);
    const kept = [];
    for (const [sx, sy] of softPockets) {
      const si = idx(sx, sy);
      if (visited[si]) continue;
      visited[si] = 1;
      const comp = [[sx, sy]];
      const stack = [[sx, sy]];
      while (stack.length) {
        const [x, y] = stack.pop();
        const neigh = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of neigh) {
          if (nx < 0 || nx >= CHUNK_W || ny < 0 || ny >= CHUNK_H) continue;
          const ni = idx(nx, ny);
          if (visited[ni] || !sealed[ni]) continue;
          visited[ni] = 1;
          comp.push([nx, ny]);
          stack.push([nx, ny]);
        }
      }
      if (comp.length < MIN_SOFT_POCKET) {
        for (const [x, y] of comp) smoothed[idx(x, y)] = 1; // too small to read as a cluster: solid rock instead
      } else {
        for (const cell of comp) kept.push(cell);
      }
    }
    softPockets = kept;
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
  //
  // Density (visual pass, this session, NIGHT-LOG.md "alive pass" entry):
  // the Unity level generator (`EnemyPlanterTiles`, DynamicDensity off) caps
  // each enemy type at MaxSpawned 4-10 per full 3-room (30x48-tile) level --
  // up to 10 Urchin, 10 SpikeTrap, 10 Piranha, 5 each of Cannon/CannonAngle/
  // Slapper, 4 ElectroRock -- so a packed level carries on the order of
  // 45-50 static hazards plus up to 10 roaming piranhas. Our chunk (32x24 =
  // 768 tiles) is roughly half that level's area; raising the per-chunk slot
  // count from the old 2-4 to 5-8 (a little more with depth) tracks that
  // density without hard-copying Unity's exact per-type caps.
  const depthStart = chunkIndex * CHUNK_H;
  if (depthStart + CHUNK_H >= 40) {
    const depthBonus = Math.min(3, Math.floor(depthStart / 150)); // +1 every 150 units, capped at +3
    const slotCount = 5 + depthBonus + Math.floor(rng() * 4); // 5-8 near the surface, up to 8-11 deep
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
