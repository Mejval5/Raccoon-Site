// Round-8 fix (NIGHT-LOG.md, Daniel's screenshot review round 7, item 1:
// SEVERE regression). `traceWallOutlines` (render.js, before this session)
// used a local-chunk-only tile window while asking the real neighbouring
// chunk for edge EXPOSURE -- a solid region whose true boundary needed to
// leave that window (real solid rock continuing into the next chunk,
// correctly un-exposed there) left the chain-follower with nowhere to go,
// and the caller's `closePath()` drew a straight line from wherever it
// stopped back to the loop's start: the diagonal wedges / hairline slivers
// / chunk-seam artifacts in review-r7-zoom-s13-chunk-seam-diagonal.png and
// review-r7-zoom-s1-sliver-hairline.png.
//
// outline.js's `traceOutlineLoops` fixes this by tracing a PADDED window
// (real tiles) and treating anything outside it as empty, so every loop is
// guaranteed to close. This test drives the exact same trace world.js's
// `buildChunkOutline` runs, across many seeds and several chunk indices
// (including right at a freshly-generated chunk seam), and asserts:
//  1. `openChains` is always 0 (the direct regression guard -- this would
//     have failed reliably under the old algorithm whenever a solid region
//     touched a chunk's top/bottom row and continued into the next chunk,
//     which is most of them).
//  2. every loop is closed (first point === last point wrapped).
//  3. after the shared Chaikin smoothing, no segment is longer than one
//     tile's diagonal -- a direct guard against the "diagonal wedge" shape
//     specifically (a genuine closePath()-across-open-water artifact would
//     produce a segment spanning most of the chunk).
import { createGenerator, CHUNK_W, CHUNK_H } from '../js/gen.js';
import {
  traceOutlineLoops, chaikinSmoothLoop, loopsToSegments,
  OUTLINE_PAD, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO,
} from '../js/outline.js';
import { resolveCircleVsSegments } from '../js/physics.js';
import { STEP } from '../js/loop.js';
import { createOctopus, stepOctopus } from '../js/octopus.js';

/** Builds a `{isSolid, wallSegmentsNear}` collider (the same shape world.js
 * exposes) from an ASCII map, tracing + smoothing it exactly like
 * world.js's `buildChunkOutline` -- so `stepOctopus` (via
 * `integrateWithCollision`'s `wallSegmentsNear` branch, physics.js) collides
 * against the traced+smoothed rim instead of the raw tile grid. */
function segmentGridFromRows(rows) {
  const h = rows.length, w = rows[0].length;
  const isSolidAt = (tx, ty) => {
    if (tx < 0 || tx >= w || ty < 0 || ty >= h) return true;
    return rows[ty][tx] === '#';
  };
  const { loops } = traceOutlineLoops(isSolidAt, w, h, 2);
  const smoothedLoops = loops.map((l) => chaikinSmoothLoop(l, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO));
  const segments = loopsToSegments(smoothedLoops);
  return {
    isSolid(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (x < 0 || x >= w || y < 0 || y >= h) return true;
      return rows[y][x] === '#';
    },
    wallSegmentsNear() { return segments; }, // small fixed test map: every segment is "near enough"
  };
}

/** Mirrors world.js's `buildChunkOutline`, but against a small in-memory
 * chain of generated chunks (no start pool / bomb-break machinery needed
 * for this geometry test). */
function traceGeneratedChunk(chunks, ci) {
  const chunk = chunks[ci];
  const isSolidAt = (tx, ty) => {
    if (tx >= 0 && tx < CHUNK_W && ty >= 0 && ty < CHUNK_H) {
      const v = chunk.tiles[ty * CHUNK_W + tx];
      return v === 1 || v === 2;
    }
    // Cross into a real neighbour chunk if we generated one; otherwise fall
    // back to "solid" (safe), matching world.js's `tileAt` for a
    // not-yet-resident chunk -- never "treat as empty" here, that's only
    // for OUTSIDE the padded window, which traceOutlineLoops itself applies.
    const otherCi = ci + Math.floor(ty / CHUNK_H);
    const other = chunks[otherCi];
    if (!other) return true;
    const ly = ty - (otherCi - ci) * CHUNK_H;
    const v = other.tiles[ly * CHUNK_W + tx];
    return v === 1 || v === 2;
  };
  return traceOutlineLoops(isSolidAt, CHUNK_W, CHUNK_H, OUTLINE_PAD);
}

export function runOutlineTests(assert, approx) {
  const SEEDS = [1, 2, 7, 19, 42, 77, 101, 12345];
  const CHUNKS_PER_SEED = 4; // chunk 0..3, so chunk 0/1's shared seam and chunk 2/3's are both exercised

  let totalOpenChains = 0;
  let totalLoops = 0;
  let maxSegLen = 0;
  const TILE_DIAGONAL = Math.SQRT2;

  for (const seed of SEEDS) {
    const gen = createGenerator(seed);
    const chunks = [];
    for (let i = 0; i < CHUNKS_PER_SEED; i++) chunks.push(gen.next(i));

    for (let ci = 0; ci < CHUNKS_PER_SEED; ci++) {
      const { loops, openChains } = traceGeneratedChunk(chunks, ci);
      totalOpenChains += openChains;
      totalLoops += loops.length;
      for (const loop of loops) {
        const smoothed = chaikinSmoothLoop(loop, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO);
        const segs = loopsToSegments([smoothed]);
        for (const s of segs) {
          const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
          if (len > maxSegLen) maxSegLen = len;
        }
      }
    }
  }

  assert(
    `outline trace: 0 open (unclosed) chains across ${SEEDS.length} seeds x ${CHUNKS_PER_SEED} chunks (round-8 severe regression guard)`,
    totalOpenChains === 0,
  );
  assert('outline trace: found at least one closed loop per seed/chunk batch (sanity -- caves aren’t empty)', totalLoops > 0);
  // A single tile's raw edge is length 1; Chaikin corner-cutting only ever
  // shortens (it replaces one edge with two shorter ones along it), so no
  // post-smooth segment should ever exceed a tile's diagonal. A genuine
  // "diagonal wedge" bug produces a segment spanning a large fraction of the
  // whole chunk (32 tiles wide) -- this bound catches that by orders of
  // magnitude, not just barely.
  assert(
    `outline trace: no post-smooth segment exceeds one tile's diagonal (max seen ${maxSegLen.toFixed(3)}, bound ${TILE_DIAGONAL.toFixed(3)}) -- guards the round-7 diagonal-wedge shape`,
    maxSegLen <= TILE_DIAGONAL + 1e-6,
  );

  // --- Round-8 item 3: collision must match the drawn outline. A basic
  // sanity check that `resolveCircleVsSegments` (physics.js) actually
  // resolves against the traced+smoothed geometry, not the raw square tile
  // grid: build a simple diagonal staircase of solid tiles, trace+smooth it
  // exactly like world.js does, and confirm a circle pushed into it (a) never
  // ends up overlapping any segment by more than a tiny epsilon and (b)
  // keeps a nonzero tangential velocity (can slide, doesn't just zero out
  // and stick, matching resolveCircleVsGrid's own corner-escape behaviour).
  {
    const w = 10, h = 10;
    const rows = [
      '##########',
      '#........#',
      '##.......#',
      '###......#',
      '####.....#',
      '#####....#',
      '######...#',
      '#######..#',
      '########.#',
      '##########',
    ];
    const isSolidAt = (tx, ty) => {
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) return true;
      return rows[ty][tx] === '#';
    };
    const { loops } = traceOutlineLoops(isSolidAt, w, h, 2);
    const smoothedLoops = loops.map((l) => chaikinSmoothLoop(l, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO));
    const segments = loopsToSegments(smoothedLoops);

    // A body approaching the staircase diagonal from open water, with both
    // velocity and later position driven into it over several steps (a
    // dash-like approach), should settle without ever penetrating deeply.
    const body = { x: 5.5, y: 2.4, vx: 6, vy: 6, radius: 0.35, mass: 1 };
    let minDistToAnySegment = Infinity;
    for (let step = 0; step < 40; step++) {
      body.x += body.vx * 0.02;
      body.y += body.vy * 0.02;
      resolveCircleVsSegments(body, segments);
      let d = Infinity;
      for (const s of segments) {
        const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
        const el2 = ex * ex + ey * ey || 1e-9;
        let t = ((body.x - s.x1) * ex + (body.y - s.y1) * ey) / el2;
        t = Math.min(1, Math.max(0, t));
        const cx = s.x1 + ex * t, cy = s.y1 + ey * t;
        const dd = Math.hypot(body.x - cx, body.y - cy);
        if (dd < d) d = dd;
      }
      if (d < minDistToAnySegment) minDistToAnySegment = d;
    }
    assert(
      `collision vs traced segments: a body driven into a diagonal staircase never penetrates more than a small epsilon past the smoothed rim (closest approach ${minDistToAnySegment.toFixed(3)} vs radius ${body.radius})`,
      minDistToAnySegment >= body.radius - 0.06,
    );
  }

  // --- Round-8 item 3 (continued): the octopus itself, driven through
  // `stepOctopus` exactly like the real game, must still escape a concave
  // corner without dashing when collision runs against the traced+smoothed
  // outline segments (the `wallSegmentsNear` branch of physics.js's
  // `integrateWithCollision`) -- not just the raw tile grid corner.test.js
  // already covers. Same two representative shapes (a plain right-angle and
  // a narrower notch), same "steady push, no dash, 4s budget" method.
  {
    const shapes = {
      'right-angle corner (segment collision)': {
        rows: ['#####', '#....', '#....', '#....', '#....'],
        start: { x: 1.35, y: 1.35 },
      },
      'narrow notch (segment collision)': {
        rows: ['#####', '#.###', '#....', '#....', '#....'],
        start: { x: 1.5, y: 2.35 },
      },
    };
    for (const [name, { rows, start }] of Object.entries(shapes)) {
      const grid = segmentGridFromRows(rows);
      const o = createOctopus(start.x, start.y);
      const input = { move: { x: 0.8, y: 0.8 }, dash: { pressed: false } };
      let escaped = false;
      for (let i = 0; i < Math.round(4 / STEP); i++) {
        stepOctopus(o, input, STEP, grid);
        const movedDist = Math.hypot(o.x - start.x, o.y - start.y);
        if (movedDist > 1.5 && !grid.isSolid(o.x, o.y)) { escaped = true; break; }
      }
      assert(`corner escape via segment collision (${name}): swims >=1.5 tiles away within 4s, no dash`, escaped);
    }
  }
}
