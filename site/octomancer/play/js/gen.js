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

/** Visual pass (Daniel's screenshot review: "the lone-island tile-0 appearing
 * where it shouldn't"): `pickWallArt` (render.js) picks a lone-circle/nub
 * shape for any solid tile with 3+ open orthogonal neighbours, whether or
 * not that tile's own rock mass is actually small -- a single-tile-wide nub
 * still attached to a much bigger wall mass reads the same as a true
 * isolated island. The noise+smoothing generator readily leaves both shapes
 * scattered through open, reached water, same as it leaves the small water
 * pockets `MIN_SOFT_POCKET` cleans up elsewhere.
 *
 * Two cleanup passes, in order: first shave any interior solid tile with 3+
 * open sides straight to water regardless of its component's size (twice,
 * since shaving one nub can expose its former neighbour in turn); then
 * demote any remaining solid component smaller than MIN_ROCK_ISLAND as a
 * whole (catches small blobs -- an L-tromino, say -- where no single tile
 * has 3 open sides but the group still reads as clutter). Both skip the
 * level's own unbreakable side border (a real wall, not noise) and the
 * chunk's top/bottom row (may continue into a neighbouring chunk, generated
 * independently, so neither its true shape nor its component size is known
 * here). Mutates `tiles` in place; only ever turns solid tiles to water,
 * never the reverse, so it can only add connectivity, never remove it --
 * safe to call after path carving without re-checking connectivity. */
export function shaveNubsAndSmallIslands(tiles) {
  const countOpen = (x, y) => {
    let n = 0;
    if (tiles[idx(x, y - 1)] === 0) n++;
    if (tiles[idx(x, y + 1)] === 0) n++;
    if (tiles[idx(x - 1, y)] === 0) n++;
    if (tiles[idx(x + 1, y)] === 0) n++;
    return n;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < CHUNK_H - 1; y++) {
      for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
        const i = idx(x, y);
        if (tiles[i] === 0) continue;
        if (countOpen(x, y) >= 3) tiles[i] = 0;
      }
    }
  }
  const MIN_ROCK_ISLAND = 4;
  const visited = new Uint8Array(tiles.length);
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = 0; x < CHUNK_W; x++) {
      const i0 = idx(x, y);
      if (visited[i0] || tiles[i0] === 0) continue;
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
          if (visited[ni] || tiles[ni] === 0) continue;
          visited[ni] = 1;
          comp.push([nx, ny]);
          stack.push([nx, ny]);
        }
      }
      if (!touchesEdge && comp.length < MIN_ROCK_ISLAND) {
        for (const [cx, cy] of comp) tiles[idx(cx, cy)] = 0;
      }
    }
  }
}

/** True if the solid tile at (x,y) is a thin nub/island (open on 3+ of its
 * own 4 sides) -- same test `shaveNubsAndSmallIslands` and render.js's
 * `pickWallArt` use. Out-of-range coords are treated as safe/solid (not
 * thin), since this is only ever called with in-chunk coordinates here. */
function isThinSurface(tiles, x, y) {
  if (x < 0 || x >= CHUNK_W || y < 0 || y >= CHUNK_H) return false;
  let n = 0;
  if (y - 1 < 0 || tiles[idx(x, y - 1)] === 0) n++;
  if (y + 1 >= CHUNK_H || tiles[idx(x, y + 1)] === 0) n++;
  if (x - 1 < 0 || tiles[idx(x - 1, y)] === 0) n++;
  if (x + 1 >= CHUNK_W || tiles[idx(x + 1, y)] === 0) n++;
  return n >= 3;
}

/** Round-4 fix (Daniel's screenshot review round 3: "ceiling horns at convex
 * ceiling corners hang in open water below the rim"). A floor/ceiling anchor
 * tile is a convex corner (the solid mass turns a corner right there, so the
 * flat surface a `horns` spike assumes doesn't actually run under/over it)
 * whenever its own left or right neighbour, at the SAME row as the anchor,
 * is open water -- a straight run keeps solid rock on both sides of the
 * anchor at that row. Out-of-chunk (x-1/x+1) counts as a corner too (unknown
 * neighbour, safer to skip than to risk one). */
function isCornerAnchor(tiles, ax, ay) {
  if (ax - 1 < 0 || ax + 1 >= CHUNK_W) return true;
  return tiles[idx(ax - 1, ay)] === 0 || tiles[idx(ax + 1, ay)] === 0;
}

/** Round-4 fix (Daniel's screenshot review round 3: "piranhas can spawn
 * stacked and draw over walls"). True if every tile in the (2r+1)x(2r+1)
 * block centred on (x,y) is open water -- enough clearance for an open-water
 * enemy's sprite half-extents (piranha/mine/manta, worldSize up to ~1.15, so
 * r=1 covers a full tile of headroom on every side) to never overlap solid
 * rock. Out-of-chunk counts as not-clear (unknown neighbour). */
function hasOpenClearance(tiles, x, y, r) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= CHUNK_W || ny < 0 || ny >= CHUNK_H) return false;
      if (tiles[idx(nx, ny)] !== 0) return false;
    }
  }
  return true;
}

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

  // Visual pass, round 2 (Daniel's screenshot review: "the level is still
  // full of lone circles, and many of them look broken" -- round 1 ran this
  // cleanup BEFORE `carvePath`/`carveStartPool`, but both of those carve new
  // water into the grid and can leave fresh 3-open nubs or small islands in
  // their wake, which this pass never saw. Running it here, as the very
  // last tile-shape edit before flood-fill, catches those too. It can only
  // ever turn solid tiles to water, never the reverse, so it can only ever
  // add connectivity to the path `carvePath` just carved, never remove it --
  // no separate re-check needed. `carveStartPool` (world.js) punches chunk
  // 0's start room in *after* this returns, so it calls
  // `shaveNubsAndSmallIslands` again itself once it has.
  shaveNubsAndSmallIslands(smoothed);

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

  // Round-5 fix (Daniel's screenshot review round 4, issue 1: "1-wide
  // peninsula tips still break the border art in every seed"). The shave
  // pass above (line ~275) runs BEFORE this sealing step, which can itself
  // turn small open pockets solid again (comp.length < MIN_SOFT_POCKET,
  // just above) -- that re-solidified cell can leave a fresh 3-open-side
  // nub next to it that the earlier pass never saw, and `render.js`'s
  // procedural nub cap (`drawNubTile`) can't match the sprite tileset's
  // rim shape/weight, so it always reads as a seam. Re-running the shave
  // here, as the last tile-shape edit before the reachable-cells list is
  // built (below), removes any nub this step just created -- same
  // solid-to-open-only, connectivity-safe guarantee documented above.
  shaveNubsAndSmallIslands(smoothed);

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
    // Round-4 fix (Daniel's screenshot review round 3: "piranhas can spawn
    // stacked and draw over walls"). `pick(openCells)` used to be able to
    // return (near-)the same cell for two different slots in the same
    // chunk, and never checked that an open-water placement actually had
    // room for its own sprite -- track every slot already placed and refuse
    // a new one too close to it (min separation), and refuse an 'open'
    // placement with no clearance around it (see `hasOpenClearance` above).
    const MIN_ENEMY_SEP = 1.6; // tiles, centre to centre
    const placedSlots = [];
    for (let i = 0; i < slotCount; i++) {
      const cell = pick(openCells);
      if (!cell) continue;
      const [x, y] = cell;
      if (depthStart + y < 40) continue; // keep the first 40 units enemy-free
      if (placedSlots.some((p) => Math.hypot(x - p.x, y - p.y) < MIN_ENEMY_SEP)) continue;
      let placement = 'open';
      if (smoothed[idx(x, y + 1)] !== 0) placement = 'floor';
      else if (smoothed[idx(x, y - 1)] !== 0) placement = 'ceiling';
      else if (smoothed[idx(x - 1, y)] !== 0 || smoothed[idx(x + 1, y)] !== 0) placement = 'wall';
      // Round-2 fix (Daniel's screenshot review: "enemies attach to nothing,
      // or to the lone circles" -- a crab floating in open water, a horns
      // spike hanging off a single lone-circle tile, wall eyes mounted mid-
      // room). `shaveNubsAndSmallIslands` above already removes nearly all
      // of these, but as a defence in depth, never anchor a wall-mounted
      // enemy slot (crab/horns/urchin/cannon) to a thin nub/island (open on
      // 3+ of its own 4 sides, not "a surface at least 2 tiles wide"); fall
      // back to an open-water placement (piranha/mine/manta) instead of
      // dropping the slot outright, so per-chunk enemy density is unaffected.
      //
      // Round-4 addition: also tag whether the anchor is a "flat run" (not
      // a convex corner, `isCornerAnchor` above) -- `horns` gets restricted
      // to flat runs only in enemies.js, since a spike anchored right at a
      // corner reads as hanging in open water below the actual rim there.
      let flatRun = true;
      // Round-5 fix (Daniel's screenshot review round 4, issue 3: "urchins
      // float in open water off the wall/ceiling they were placed against").
      // A `wall` placement needs to know which side (x+1 or x-1) is the
      // solid neighbour so the draw code can push the sprite horizontally
      // toward it, the same way `floor`/`ceiling` already push vertically --
      // recorded once here since gen.js already has to look this up for the
      // thin-surface/corner checks just below.
      let wallDir = 0;
      if (placement !== 'open') {
        const wallOnRight = smoothed[idx(x + 1, y)] !== 0;
        const [ax, ay] = placement === 'floor' ? [x, y + 1] : placement === 'ceiling' ? [x, y - 1]
          : (wallOnRight ? [x + 1, y] : [x - 1, y]);
        if (placement === 'wall') wallDir = wallOnRight ? 1 : -1;
        if (isThinSurface(smoothed, ax, ay)) placement = 'open';
        else flatRun = !isCornerAnchor(smoothed, ax, ay);
      }
      if (placement === 'open' && !hasOpenClearance(smoothed, x, y, 1)) continue;
      // Round-11 fix (review round 10 leftover, issue 3: "a floor cannon in
      // a concave corner sinks below the rim AND overlaps the adjacent side
      // wall's rim"). `flatRun`/`isCornerAnchor` above only look at the
      // ANCHOR tile's own row (e.g. the floor tile's left/right neighbours),
      // which never sees a concave corner where the floor is perfectly flat
      // but a side wall rises immediately next to the ENEMY's own cell
      // (x,y) -- exactly the "bottom-right corner of a notch" case reported.
      // Recorded here (grid access only exists in gen.js) so enemies.js's
      // `pickKind` can skip a cannon at this slot -- the round cannon body
      // has no per-side inset to correct for a second, perpendicular wall.
      const nearSideWall = (placement === 'floor' || placement === 'ceiling')
        && (smoothed[idx(x - 1, y)] !== 0 || smoothed[idx(x + 1, y)] !== 0);
      spawns.push({ type: 'enemy-slot', placement, x: x + 0.5, y: y + 0.5, flatRun, wallDir, nearSideWall });
      placedSlots.push({ x, y });
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
