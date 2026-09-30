// Infinite procedural world: a ring buffer of seeded chunks generated ahead
// of the octopus and dropped behind it. OVERNIGHT.md §2 "World" / M2-2.
//
// Deviation (logged in NIGHT-LOG.md): M1's `createTestCave()` (fixed 32x48
// hand-built layout) is gone; M2's world is this streaming generator. The
// old export names (WORLD_W/WORLD_H) are kept as the chunk width / a large
// nominal height so render.js's camera-bounds call site did not need to
// change shape.

import { createGenerator, CHUNK_W, CHUNK_H, BORDER, shaveNubsAndSmallIslands } from './gen.js';
import {
  traceOutlineLoops, chaikinSmoothLoop, loopsToSegments,
  OUTLINE_PAD, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO,
} from './outline.js';

// Round-3 fix (Daniel's screenshot review: "single-tile nubs ... the same
// pair of stubs appears at the same x positions in seed 42 at depth 46 and
// seed 19 at depth 74" -- both chunk-boundary depths, 24 apart, i.e. exactly
// CHUNK_H). `shaveNubsAndSmallIslands` (gen.js) deliberately skips a chunk's
// own top and bottom row (`for y=1; y<CHUNK_H-1`) because the neighbouring
// chunk it would need to check isn't generated yet when a chunk generates.
// By the time a chunk's DOWNSTREAM neighbour exists (this module generates
// chunks strictly top-to-bottom, `ensureNext`), both rows either side of the
// seam are known, so re-run the same "3+ open sides -> water" shave across
// just that seam, treating the two chunks' abutting rows as one connected
// strip. Only ever turns solid to water (like `shaveNubsAndSmallIslands`
// itself), so it can't disconnect anything already carved -- no reachability
// re-check needed. */
function seamOpen(top, bottom, x, y) {
  if (x < BORDER || x >= CHUNK_W - BORDER) return false; // the level's real side border, not noise
  if (y < 0) return false; // unknown row above `top`: treat as solid/safe
  if (y < CHUNK_H) return top.tiles[y * CHUNK_W + x] === 0;
  if (y === CHUNK_H) return bottom.tiles[x] === 0; // bottom's own row 0
  return false; // unknown row below `bottom`'s row 0: treat as solid/safe
}
function countOpenSeam(top, bottom, x, y) {
  return (seamOpen(top, bottom, x, y - 1) ? 1 : 0) + (seamOpen(top, bottom, x, y + 1) ? 1 : 0)
    + (seamOpen(top, bottom, x - 1, y) ? 1 : 0) + (seamOpen(top, bottom, x + 1, y) ? 1 : 0);
}
function shaveChunkSeam(top, bottom) {
  for (let pass = 0; pass < 2; pass++) {
    const topY = CHUNK_H - 1;
    for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
      const i = topY * CHUNK_W + x;
      if (top.tiles[i] !== 0 && countOpenSeam(top, bottom, x, topY) >= 3) top.tiles[i] = 0;
    }
    for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
      if (bottom.tiles[x] !== 0 && countOpenSeam(top, bottom, x, CHUNK_H) >= 3) bottom.tiles[x] = 0;
    }
  }
}

export const WORLD_W = CHUNK_W;
// There is no real bottom; a very large nominal height keeps camera.js's
// "clamp inside the world" logic doing the one thing we actually want at
// the top (never show above row 0) without ever clamping the bottom.
export const WORLD_H = 1e7;

const RESIDENT_BEHIND = 2; // chunks kept behind the octopus's current chunk
const RESIDENT_AHEAD = 2; // chunks kept generated ahead of it
const GENERATE_AHEAD_FRACTION = 2 / 3; // generate the next chunk this far into the lowest one

/**
 * @param {number} seed
 */
export function createWorld(seed) {
  const gen = createGenerator(seed);
  /** @type {Map<number, {tiles:Uint8Array, spawns:any[], exitCol:number, dirty:boolean}>} */
  const chunks = new Map();
  let highestGenerated = -1; // largest chunkIndex generated so far
  let deepestY = 0; // deepest octopus y reached, for the score/HUD depth stat

  // --- Shared wall-outline cache (round-8 fix, NIGHT-LOG.md): the SAME
  // traced + Chaikin-smoothed geometry backs both the wall art bake
  // (render.js) and wall collision (physics.js via `wallSegmentsNear`
  // below) -- built once per chunk here rather than twice with drifting
  // parameters, so the drawn rim and the collision surface are always
  // exactly the same shape (round-8 item 3: "collision must match the
  // drawn outline"). Loops are kept in WORLD-space tile units (the local
  // trace's y already offset by the chunk's own yOffset), so they can be
  // used directly for collision; render.js re-offsets/scales them to its
  // own chunk-local pixel canvas at bake time.
  //
  // Round-9 fix (severe regression, NIGHT-LOG.md: horizontal phantom caps
  // at every chunk seam from chunk 2 onward, octopus stuck on them).
  // Declared here, above the first `ensureNext()` calls below, rather than
  // after `buildChunkOutline`/`getWallOutline` further down -- `ensureNext`
  // now bumps `outlineVersion` itself (see below), and if these were still
  // declared later in the function body, those earlier `ensureNext()` calls
  // (chunk 0/1/2 preload, just below) would hit the `const` in its
  // temporal-dead-zone and throw.
  /** @type {Map<number, {loops: {x:number,y:number}[][], segments: {x1:number,y1:number,x2:number,y2:number}[], version: number}>} */
  const outlineCache = new Map();
  const outlineVersion = new Map(); // chunkIndex -> version bumped by setTileAt/ensureNext

  function ensureNext() {
    const i = highestGenerated + 1;
    const c = gen.next(i);
    c.dirty = true; // render cache needs (re)baking
    chunks.set(i, c);
    highestGenerated = i;
    // The wall baker now looks at the real neighbouring chunk's edge row
    // instead of assuming it's solid (round-1 fix, chunk-seam rim bug); the
    // chunk above (i-1) was very likely baked before this one existed, using
    // that old "assume solid" fallback for its own bottom row, so re-dirty
    // it now that its true neighbour is known.
    const prev = chunks.get(i - 1);
    if (prev) {
      prev.dirty = true;
      shaveChunkSeam(prev, c); // round-3 fix: shave chunk-boundary nubs now both sides of the seam are known
      c.dirty = true;
      // Round-9 fix: `getWallOutline(i-1)` may already have been traced (and
      // cached) BEFORE chunk `i` existed -- `isSolidAt`/`tileAt` treat a
      // missing chunk as solid (line ~136 below), so that stale trace closes
      // off chunk i-1's bottom row with a phantom rim cap across every
      // passage, and `shaveChunkSeam` above can also have just changed
      // tiles on both sides of the seam. Bump both neighbours' outline
      // versions so `getWallOutline` retraces them against the now-real
      // (and possibly shaved) neighbour instead of serving the stale/closed
      // cache entry -- this is what both the render bake and
      // `wallSegmentsNear` collision read, so a stale entry here is exactly
      // the "phantom cap is also in the collision outline" bug.
      outlineVersion.set(i - 1, (outlineVersion.get(i - 1) || 0) + 1);
      outlineVersion.set(i, (outlineVersion.get(i) || 0) + 1);
    }
    return c;
  }

  // A small open start pool at the very top (M2-2's "start pool"): chunk 0's
  // generator output already carves a path from the centre column, but we
  // want the first few rows guaranteed open above the octopus's spawn so it
  // never spawns touching rock. Punch a simple open room into chunk 0's
  // upper rows after generation (cheap, still deterministic per seed).
  //
  // Round-2 fix (Daniel's screenshot review: "on phone, the octopus spawns
  // underneath the HUD... on desktop it also spawns at y~78 against the HUD
  // row" -- the camera clamps to the world top whenever the octopus is
  // within one half-viewport of it, so a startY this close to 0 pins the
  // camera to the ceiling and the octopus draws right under the HUD row).
  // Widened from 4 to 12 rows so it comfortably covers the new deeper
  // `startY` (world.js's own `startY: 8` below) with room to spare above
  // and below it, rather than spawning the octopus outside the guaranteed-
  // open area.
  function carveStartPool(c) {
    const cx = Math.floor(CHUNK_W / 2);
    for (let y = 0; y < 12; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) {
        if (x < 2 || x >= CHUNK_W - 2) continue;
        c.tiles[y * CHUNK_W + x] = 0;
      }
    }
    // carveStartPool can leave a fresh 3-open nub/small island right at the
    // pool's own boundary (Daniel #1's round-2 fix); re-run the same
    // cleanup gen.js runs at the end of generateChunk, now that this pool
    // exists too (only ever turns solid to water, so it can't disturb the
    // pool or the path gen.js already carved).
    shaveNubsAndSmallIslands(c.tiles);
  }

  const chunk0 = ensureNext();
  carveStartPool(chunk0);
  ensureNext();
  ensureNext(); // preload a few chunks so the very first frames never block

  function chunkIndexOf(ty) { return Math.floor(ty / CHUNK_H); }

  function tileAt(tx, ty) {
    if (tx < 0 || tx >= CHUNK_W) return 1; // outside the play width = solid
    if (ty < 0) return 1; // above the world = solid ceiling
    const ci = chunkIndexOf(ty);
    const c = chunks.get(ci);
    if (!c) return 1; // not resident (shouldn't happen if update() is called) = safe solid
    const ly = ty - ci * CHUNK_H;
    return c.tiles[ly * CHUNK_W + tx];
  }

  function setTileAt(tx, ty, v) {
    if (tx < 0 || tx >= CHUNK_W || ty < 0) return;
    const ci = chunkIndexOf(ty);
    const c = chunks.get(ci);
    if (!c) return;
    const ly = ty - ci * CHUNK_H;
    c.tiles[ly * CHUNK_W + tx] = v;
    c.dirty = true;
    // A tile changing (bomb break) can move the traced outline of THIS
    // chunk and of its neighbours above/below (their own outline trace
    // reads this chunk's tiles too, across the padded window -- see
    // `buildChunkOutline` below), so bump all three outline-cache entries'
    // version rather than just this chunk's.
    outlineVersion.set(ci, (outlineVersion.get(ci) || 0) + 1);
    outlineVersion.set(ci - 1, (outlineVersion.get(ci - 1) || 0) + 1);
    outlineVersion.set(ci + 1, (outlineVersion.get(ci + 1) || 0) + 1);
  }

  function buildChunkOutline(ci) {
    const c = chunks.get(ci);
    if (!c) return null;
    const yOff = ci * CHUNK_H;
    const isSolidAt = (tx, ty) => {
      if (tx >= 0 && tx < CHUNK_W && ty >= 0 && ty < CHUNK_H) {
        const v = c.tiles[ty * CHUNK_W + tx];
        return v === 1 || v === 2;
      }
      const v = tileAt(tx, yOff + ty);
      return v === 1 || v === 2;
    };
    const { loops: rawLoops } = traceOutlineLoops(isSolidAt, CHUNK_W, CHUNK_H, OUTLINE_PAD);
    const loops = rawLoops.map((loop) => {
      const smoothed = chaikinSmoothLoop(loop, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO);
      return smoothed.map((p) => ({ x: p.x, y: p.y + yOff }));
    });
    const segments = loopsToSegments(loops);
    return { loops, segments };
  }

  /** Chunk-local (tile units) + world-space (y offset applied) outline for
   * one chunk, rebuilt only when that chunk's tiles (or an immediate
   * neighbour's, across the padded trace window) have changed since the
   * last build. Consumed by render.js's wall bake and by
   * `wallSegmentsNear` below. */
  function getWallOutline(ci) {
    const wantVersion = outlineVersion.get(ci) || 0;
    const cached = outlineCache.get(ci);
    if (cached && cached.version === wantVersion) return cached;
    const built = buildChunkOutline(ci);
    if (!built) return null;
    const entry = { ...built, version: wantVersion };
    outlineCache.set(ci, entry);
    return entry;
  }

  /** Collision segments (world-space tile units) from every chunk whose
   * y-range could plausibly touch a circle at (x,y) with radius r -- used
   * by physics.js's `resolveCircleVsSegments` in place of the raw tile
   * grid, so the octopus and enemies collide against the exact same
   * smoothed rim the wall art draws (round-8 item 3). */
  function wallSegmentsNear(x, y, r) {
    const pad = r + 1;
    const minCi = chunkIndexOf(y - pad);
    const maxCi = chunkIndexOf(y + pad);
    let out = [];
    for (let ci = minCi; ci <= maxCi; ci++) {
      const o = getWallOutline(ci);
      if (!o || !o.segments.length) continue;
      for (const s of o.segments) {
        // Cheap bbox reject before the caller's per-segment distance check.
        const minSx = Math.min(s.x1, s.x2), maxSx = Math.max(s.x1, s.x2);
        const minSy = Math.min(s.y1, s.y2), maxSy = Math.max(s.y1, s.y2);
        if (maxSx < x - pad || minSx > x + pad || maxSy < y - pad || minSy > y + pad) continue;
        out.push(s);
      }
    }
    return out;
  }

  return {
    width: CHUNK_W,
    height: WORLD_H,
    chunkH: CHUNK_H,
    startX: Math.floor(CHUNK_W / 2) + 0.5,
    // Round-2 fix (Daniel's screenshot review: spawn point pinned against
    // the HUD -- see `carveStartPool`'s comment above). Moved down from 2 to
    // 8 so the camera (clamped to the world top only while the octopus is
    // within one half-viewport of y=0) settles below the HUD row instead of
    // right against it.
    startY: 8,

    isSolid(tx, ty) {
      const v = tileAt(Math.floor(tx), Math.floor(ty));
      return v === 1 || v === 2;
    },
    /** Raw tile value at integer world tile coords (1/2 = solid, 0 = water),
     * crossing chunk boundaries via the same resident-chunk lookup `isSolid`
     * uses. Exposed for the wall baker (render.js), which used to treat a
     * chunk's own top/bottom row as bordering solid rock unconditionally --
     * a wrong assumption whenever the neighbouring chunk is actually open
     * there, baking a spurious rim cap across the passage at every chunk
     * seam (round-1 fix, Daniel's screenshot review: "wall borders look
     * broken" / the horizontal seam line). */
    tileAt,
    /** Round-8: the shared traced+smoothed wall outline for one chunk (see
     * `getWallOutline` above) -- render.js's canvas bake and physics'
     * collision both read from this one cache instead of tracing twice. */
    getWallOutline,
    /** Round-8 item 3: collision segments (world-space tile units) near a
     * point, for circle-vs-segments wall collision (physics.js). */
    wallSegmentsNear,
    isBreakable(tx, ty) { return tileAt(Math.floor(tx), Math.floor(ty)) === 2; },
    /** Break a soft-rock tile (bomb radius, M3) back to water. */
    breakTile(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (tileAt(x, y) === 2) setTileAt(x, y, 0);
    },

    /** Call once per fixed step with the octopus's current y. Streams chunks
     * in ahead and drops chunks that fell too far behind. */
    update(octoY) {
      if (octoY > deepestY) deepestY = octoY;
      const curChunk = chunkIndexOf(octoY);
      const intoChunk = (octoY - curChunk * CHUNK_H) / CHUNK_H;
      if (curChunk + RESIDENT_AHEAD - 1 > highestGenerated ||
          (curChunk === highestGenerated - RESIDENT_AHEAD + 1 && intoChunk > GENERATE_AHEAD_FRACTION)) {
        // Generate the next chunk once the octopus is far enough into the
        // lowest resident one (or if we are simply behind for any reason).
        while (highestGenerated < curChunk + RESIDENT_AHEAD) ensureNext();
      }
      for (const ci of [...chunks.keys()]) {
        if (ci < curChunk - RESIDENT_BEHIND) {
          chunks.delete(ci);
          // the chunk below the dropped one is now the topmost resident: a missing neighbour counts as solid,
          // so retrace + rebake it and its top edge gets a real rim (no open-water cut into the void)
          const below = chunks.get(ci + 1);
          if (below) { below.dirty = true; outlineVersion.set(ci + 1, (outlineVersion.get(ci + 1) || 0) + 1); }
        }
      }
    },

    depth() { return deepestY; },
    currentChunkIndex(octoY) { return chunkIndexOf(octoY); },
    residentChunkCount() { return chunks.size; },
    /** For the renderer / decor / pickups: iterate resident chunks with their
     * world-space y offset. */
    residentChunks() {
      const out = [];
      for (const [ci, c] of chunks) out.push({ index: ci, yOffset: ci * CHUNK_H, chunk: c });
      out.sort((a, b) => a.index - b.index);
      return out;
    },
    chunkHeight: CHUNK_H,
  };
}
