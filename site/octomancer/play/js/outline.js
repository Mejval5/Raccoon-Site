// Shared wall-outline tracing + Chaikin smoothing: tile-unit geometry, used
// BOTH to bake each chunk's rock art (render.js) and to collide the octopus
// and moving enemies against (physics.js, via world.js's `getWallOutline`/
// `wallSegmentsNear`). Built once per chunk in world.js and consumed by
// both, so the drawn rim and the collision surface are always the exact
// same shape -- never traced or smoothed twice with different parameters.
//
// Round-8 fix (Daniel's screenshot review round 7, item 1: SEVERE
// regression). The previous version of this trace (render.js's own
// `traceWallOutlines`, before this module existed) only ever emitted edges
// for tiles strictly inside a chunk's own local 0..chunkW-1 x 0..chunkH-1
// window, while deciding each edge's EXPOSURE (whether to emit it at all)
// by asking the real neighbouring chunk's tiles. That made a solid region
// whose true boundary needed to leave the window (real solid rock
// continuing into the next chunk, correctly un-exposed there) simply stop:
// the edge-chain follower had nowhere to go next, so it ended wherever it
// happened to be, and the caller's `closePath()` drew a straight line
// from that dangling point back to the loop's start -- exactly the
// diagonal wedges, hairline slivers and seam artifacts in
// review-r7-zoom-s13-chunk-seam-diagonal.png and
// review-r7-zoom-s1-sliver-hairline.png.
//
// Fixed here by tracing a PADDED window (`pad` tiles beyond the chunk on
// every side, still asking the real world tiles there -- so a region that
// genuinely spans the seam is still traced with its true shape) and then
// treating anything OUTSIDE that padded window as empty/non-solid. That
// makes every tile's exposure decision a function of one well-defined,
// BOUNDED domain, so the standard grid boundary-walk guarantee -- every
// solid tile's exposed edges chain into a closed loop -- holds
// unconditionally, with no dependency on a neighbour chunk that might not
// even be resident yet. A loop that ends up partly or entirely outside the
// chunk's own 0..chunkW x 0..chunkH rectangle (only possible from the
// padding) still closes correctly here; the caller clips to the chunk's
// own canvas/collision rect afterward, so the off-canvas part of it simply
// never draws or collides with anything.
export const OUTLINE_PAD = 2;
// Round-8 item 2 (Daniel's screenshot review round 7: "rock look: fewer/
// tighter smoothing... so steps stay crisp like the video"). Round 7's
// smoothing (3 passes, ratio 0.22) rounded corners considerably further
// than the promo video's crisp, blocky steps; dialled back to 2 tighter
// passes at a smaller cut ratio -- still enough to knock the bare 90-degree
// tile corners down to a soft edge (and to give collision segments a normal
// to slide along, item 3), but nowhere near as rounded.
export const OUTLINE_SMOOTH_ITERATIONS = 2;
export const OUTLINE_SMOOTH_RATIO = 0.2;

/**
 * Trace every solid region's boundary (outer and any inner holes) as a set
 * of closed polylines in tile units, using the grid-boundary-walk form of
 * marching squares: for each solid tile within the padded window, emit a
 * directed unit edge for each side bordering a non-solid tile (or the edge
 * of the window itself), walked clockwise around that tile's own perimeter.
 * @param {(tx:number, ty:number)=>boolean} isSolidAt real tile solidity, may be asked anywhere inside the padded window
 * @param {number} chunkW
 * @param {number} chunkH
 * @param {number} pad tiles of real-tile padding beyond the chunk before the domain is just treated as empty
 * @returns {{loops: {x:number,y:number}[][], openChains: number}} `openChains` should always be 0; see tests/outline.test.js
 */
export function traceOutlineLoops(isSolidAt, chunkW, chunkH, pad = OUTLINE_PAD) {
  const minT = -pad, maxTx = chunkW - 1 + pad, maxTy = chunkH - 1 + pad;
  const solidAt = (tx, ty) => {
    if (tx < minT || tx > maxTx || ty < minT || ty > maxTy) return false; // outside the padded window: empty, so every loop closes off-canvas
    return isSolidAt(tx, ty);
  };
  const key = (x, y) => `${x},${y}`;
  const edgesByStart = new Map();
  const addEdge = (x1, y1, x2, y2) => {
    const k = key(x1, y1);
    let arr = edgesByStart.get(k);
    if (!arr) { arr = []; edgesByStart.set(k, arr); }
    arr.push({ x: x2, y: y2, used: false });
  };
  for (let ty = minT; ty <= maxTy; ty++) {
    for (let tx = minT; tx <= maxTx; tx++) {
      if (!solidAt(tx, ty)) continue;
      const x0 = tx, y0 = ty, x1 = x0 + 1, y1 = y0 + 1;
      if (!solidAt(tx, ty - 1)) addEdge(x0, y0, x1, y0); // North
      if (!solidAt(tx + 1, ty)) addEdge(x1, y0, x1, y1); // East
      if (!solidAt(tx, ty + 1)) addEdge(x1, y1, x0, y1); // South
      if (!solidAt(tx - 1, ty)) addEdge(x0, y1, x0, y0); // West
    }
  }
  const loops = [];
  let openChains = 0;
  for (const [startKey, arr] of edgesByStart) {
    for (const startEdge of arr) {
      if (startEdge.used) continue;
      const loop = [];
      const [startX, startY] = startKey.split(',').map(Number);
      let curX = startX, curY = startY;
      let curEdge = startEdge;
      let guard = 0;
      while (curEdge && !curEdge.used && guard++ < 20000) {
        curEdge.used = true;
        loop.push({ x: curX, y: curY });
        curX = curEdge.x; curY = curEdge.y;
        const nextArr = edgesByStart.get(key(curX, curY));
        curEdge = nextArr ? nextArr.find((e) => !e.used) : null;
      }
      // Only a genuinely closed chain (the walk actually returned to its own
      // start point) is a real loop -- fill/stroke/collision must never run
      // on a partial chain, which is exactly what used to draw the diagonal
      // wedges (see the module comment above, and NIGHT-LOG.md round 8).
      if (loop.length >= 3 && curX === startX && curY === startY) {
        loops.push(loop);
      } else if (loop.length > 0) {
        openChains++;
      }
    }
  }
  return { loops, openChains };
}

/** Chaikin corner-cutting: replaces every vertex with two points a fraction
 * `ratio` in from each of its neighbouring edges, a few times over. Applied
 * uniformly to a whole loop it rounds every corner -- convex, concave, or a
 * 1-wide stub's -- the same continuous way, with no per-corner-shape case.
 * Long straight runs of collinear points stay straight (each cut point
 * still lies on the same line). Scale-invariant (a pure linear blend), so
 * it can run in tile units once and be reused, scaled, for both the pixel
 * canvas bake and the world-unit collision segments. */
export function chaikinSmoothLoop(points, iterations, ratio) {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const next = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % n];
      next.push({ x: p0.x + (p1.x - p0.x) * ratio, y: p0.y + (p1.y - p0.y) * ratio });
      next.push({ x: p0.x + (p1.x - p0.x) * (1 - ratio), y: p0.y + (p1.y - p0.y) * (1 - ratio) });
    }
    pts = next;
  }
  return pts;
}

/** Flattens a set of closed loops into directed line segments (world/tile
 * units), for circle-vs-segments collision (physics.js). */
export function loopsToSegments(loops) {
  const segments = [];
  for (const loop of loops) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i], b = loop[(i + 1) % n];
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return segments;
}
