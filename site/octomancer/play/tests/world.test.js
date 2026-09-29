// Round-9 regression guard (NIGHT-LOG.md, Daniel's screenshot review round
// 8, item 1: SEVERE regression). Every chunk seam from chunk index 2 onward
// (world tile y = 72, 96, ...) baked a closed rounded rim capping every
// passage, on both the render bake AND the collision outline (the octopus
// got stuck at depth 63.5m in an autodive). Root cause: `getWallOutline(ci)`
// (world.js) caches per-chunk traced outlines keyed on `outlineVersion`, but
// only `setTileAt` used to bump that version. `ensureNext()` generating
// chunk `i` (and `shaveChunkSeam(prev, c)` changing tiles on both sides of
// the seam) never invalidated chunk `i-1`'s already-cached outline -- that
// outline had been traced back when chunk `i` did not exist yet, and
// `tileAt` returns 1 (solid) for a missing chunk, so a closed floor got
// baked and used for collision.
//
// This drives `createWorld` exactly like the real game (via `update`,
// diving tile-by-tile so every chunk is generated the normal streaming way,
// not pre-built), and at every chunk boundary crossed asserts there is no
// horizontal outline segment lying across a column that's open on BOTH
// sides of the seam -- the direct shape of the phantom cap.
import { createWorld } from '../js/world.js';
import { CHUNK_H, CHUNK_W, BORDER } from '../js/gen.js';

export function runWorldTests(assert, approx) {
  const SEEDS = [1, 5, 13, 42];
  const CHUNKS_TO_DIVE = 5; // chunk 0..4, so seams at chunk 1/2, 2/3, 3/4 (the reported "chunk 2 onward") are all crossed

  for (const seed of SEEDS) {
    const world = createWorld(seed);
    let y = world.startY;
    let phantomCaps = 0;
    let seamsChecked = 0;

    while (world.currentChunkIndex(y) < CHUNKS_TO_DIVE) {
      world.update(y);
      const curChunk = world.currentChunkIndex(y);
      if (curChunk >= 1) {
        const boundaryY = curChunk * CHUNK_H; // world tile y of the seam just above us
        const above = world.getWallOutline(curChunk - 1);
        const below = world.getWallOutline(curChunk);
        if (above && below) {
          seamsChecked++;
          for (let x = BORDER; x < CHUNK_W - BORDER; x++) {
            const openAbove = world.tileAt(x, boundaryY - 1) === 0;
            const openBelow = world.tileAt(x, boundaryY) === 0;
            if (!openAbove || !openBelow) continue; // only a fully-open passage can show a phantom cap
            // A phantom cap is a near-horizontal segment (either chunk's
            // cached outline -- the bug could live in either neighbour's
            // stale cache) whose y sits right at the seam and whose x-span
            // covers this open column.
            for (const segs of [above.segments, below.segments]) {
              for (const s of segs) {
                const nearSeamY = Math.abs(s.y1 - boundaryY) < 0.6 && Math.abs(s.y2 - boundaryY) < 0.6;
                if (!nearSeamY) continue;
                const minSx = Math.min(s.x1, s.x2), maxSx = Math.max(s.x1, s.x2);
                if (minSx <= x + 0.5 && maxSx >= x + 0.5) phantomCaps++;
              }
            }
          }
        }
      }
      y += 1; // dive one tile per check, like a slow descent -- exercises every seam the normal streaming path would
    }

    assert(`world.js seed ${seed}: at least one chunk seam was actually checked (sanity)`, seamsChecked > 0);
    assert(
      `world.js seed ${seed}: no phantom horizontal outline cap over an open column at any of ${seamsChecked} chunk seams (round-9 severe regression guard)`,
      phantomCaps === 0,
    );
  }

  // --- Direct collision guard (the reported symptom itself): the shared
  // `wallSegmentsNear` collision surface (world.js), at a point in the
  // middle of a chunk seam's open passage, must never report a segment
  // directly underneath an octopus-sized circle there -- that's exactly
  // what pinned the s5 autodive at 63.5m against the phantom cap.
  {
    const world = createWorld(5);
    let y = world.startY;
    for (let ci = 1; ci < CHUNKS_TO_DIVE; ci++) {
      y = ci * CHUNK_H - 0.5;
      world.update(y);
      const boundaryY = ci * CHUNK_H;
      const cx = Math.floor(CHUNK_W / 2) + 0.5; // the generator's own start column -- always kept open
      if (world.tileAt(Math.floor(cx), boundaryY - 1) !== 0 || world.tileAt(Math.floor(cx), boundaryY) !== 0) continue;
      const segs = world.wallSegmentsNear(cx, boundaryY, 0.35);
      let blocked = false;
      for (const s of segs) {
        const nearSeamY = Math.abs(s.y1 - boundaryY) < 0.6 && Math.abs(s.y2 - boundaryY) < 0.6;
        const minSx = Math.min(s.x1, s.x2), maxSx = Math.max(s.x1, s.x2);
        if (nearSeamY && minSx <= cx && maxSx >= cx) blocked = true;
      }
      assert(`world.js seed 5, chunk seam ${ci}: the open centre column at the seam has no blocking collision segment (round-9 severe regression guard)`, !blocked);
    }
  }
}
