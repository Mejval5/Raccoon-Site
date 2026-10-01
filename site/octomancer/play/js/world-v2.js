// v2 single-level world (V2-PLAN M1-4, behind ?v2=1). One generated level
// (level.js, 34x68 tiles) replaces the endless chunk ring buffer. It exposes
// the same interface as world.js's createWorld so physics, enemies, pickups,
// decor and the camera keep working unchanged:
//   - the whole level is presented as ONE resident "chunk" (index 0), so the
//     chunk-based consumers (decor, pickups, enemies) read it as-is;
//   - the traced + smoothed wall outline is built per horizontal BAND of rows
//     (same padded-window trace world.js does per chunk), lazily, and each
//     band's outline is kept until a bomb changes it; a bomb retraces only
//     the band(s) its tiles touch;
//   - bombs break any interior rock (tile 1) but never the border (isBedrock).
//
// Bands are the unit render.js caches wall canvases in; `configureBands(rows)`
// lets the renderer pick the band height (about 512 px of baked canvas).

import { generateLevel, LEVEL_W, LEVEL_H, BORDER } from './level.js';
import { buildLevelSpawns, START_SAFE_RADIUS } from './level-spawns.js';
import {
  traceOutlineLoops, chaikinSmoothLoop, loopsToSegments,
  OUTLINE_PAD, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO,
} from './outline.js';

export { START_SAFE_RADIUS };

/**
 * Which wall bands to keep cached for a viewport spanning world rows
 * [topY, bottomY]: those on screen plus one each side (V2-PLAN M1-4). A phone
 * viewport (24 tiles) spans several 512 px bands, so "3" means the bands on
 * screen + 2, never the whole level.
 */
export function wallBandWindow(topY, bottomY, rows, count) {
  const cl = (b) => Math.max(0, Math.min(count - 1, b));
  const visFrom = cl(Math.floor(topY / rows)), visTo = cl(Math.floor(bottomY / rows));
  return { visFrom, visTo, keepFrom: cl(visFrom - 1), keepTo: cl(visTo + 1) };
}

/**
 * @param {number} runSeed
 * @param {number} levelIndex
 */
export function createLevelWorld(runSeed, levelIndex = 0, opts = null) {
  // opts.level: a prebuilt level (authored hub / tutorial from authored.js, any size);
  // otherwise one is generated (34x68).
  const authored = !!(opts && opts.level);
  const level = authored ? opts.level : generateLevel(runSeed, levelIndex);
  const tiles = level.tiles;
  const W = level.w || LEVEL_W, H = level.h || LEVEL_H;
  const bedrock = (x, y) => x < BORDER || x >= W - BORDER || y < BORDER || y >= H - BORDER;
  const startX = level.startX + 0.5, startY = level.startY + 0.5;
  const spawnInfo = authored ? { spawns: level.spawns || [] } : buildLevelSpawns(level, runSeed, levelIndex);
  const chunk = {
    tiles, width: W, height: H, spawns: spawnInfo.spawns, dirty: true,
    exclude: authored ? undefined : { x: startX, y: startY, r: START_SAFE_RADIUS },
    depthBias: 40 + levelIndex * 15,
    noDepthGate: true, // enemies.js: no "first 40 units enemy-free" rule in a whole-level chunk
    v2: true,
    salt: hashSalt(runSeed, levelIndex),
    exitCol: level.exitX,
    // decor: no plants inside the shop stall (counter span + 3 tiles each side, from above the sign to below the floor)
    plantKeepOut: [
      ...(level.exitX >= 0 && level.exitX !== undefined ? [{ x0: level.exitX - 2, x1: level.exitX + 3, y0: level.exitY - 1, y1: level.exitY + 2 }] : []),
      ...(level.shortcutX >= 0 && level.shortcutX !== undefined ? [{ x0: level.shortcutX - 2, x1: level.shortcutX + 3, y0: level.shortcutY - 2, y1: level.shortcutY + 2 }] : []),
      ...(level.boardX >= 0 && level.boardX !== undefined ? [{ x0: level.boardX - 1, x1: level.boardX + 2, y0: level.boardY - 1, y1: level.boardY + 3 }] : []),
    ],
    plantFree: level.shop ? {
      x0: Math.min(level.shop.px[0], level.shop.kx) - 3, x1: Math.max(level.shop.px[4], level.shop.kx) + 4,
      y0: level.shop.ky - 5, y1: Math.max(level.shop.px[1], level.shop.px[3], level.shop.px[5]) + 3,
    } : undefined,
  };

  const shopRect = level.shop || null;
  function inShop(x, y) { return shopRect !== null && x >= shopRect.x0 && x < shopRect.x1 && y >= shopRect.y0 && y < shopRect.y1; }

  let deepestY = startY;

  // ---- bands ----
  let bandRows = 12;
  /** @type {Map<number, {loops:any[], segments:any[], version:number}>} */
  const outlineCache = new Map();
  const bandVersion = new Map(); // band -> version, bumped when its outline may change
  let tileVer = 0; // bumped on every tile change (bomb break, landed rock): props wake and re-check their support
  let retraceCount = 0; // bands traced so far (tests: a bomb retraces only nearby bands)

  function bandCount() { return Math.ceil(H / bandRows); }
  function bandOfRow(ty) { return Math.min(bandCount() - 1, Math.max(0, Math.floor(ty / bandRows))); }

  function tileAt(tx, ty) {
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return 1;
    return tiles[ty * W + tx];
  }

  function buildBandOutline(bi) {
    const y0 = bi * bandRows, h = Math.min(bandRows, H - y0);
    if (h <= 0) return null;
    const isSolidAt = (tx, ty) => tileAt(tx, y0 + ty) !== 0;
    const { loops: rawLoops } = traceOutlineLoops(isSolidAt, W, h, OUTLINE_PAD);
    const loops = rawLoops.map((loop) => {
      const smoothed = chaikinSmoothLoop(loop, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO);
      return smoothed.map((p) => ({ x: p.x, y: p.y + y0 }));
    });
    retraceCount++;
    return { loops, segments: loopsToSegments(loops) };
  }

  /** Traced + smoothed outline (world tile units) of band `bi`, cached until a
   * bomb changes tiles near it. Same shape world.js's getWallOutline returns. */
  function getWallOutline(bi) {
    if (bi < 0 || bi >= bandCount()) return null;
    const want = bandVersion.get(bi) || 0;
    const cached = outlineCache.get(bi);
    if (cached && cached.version === want) return cached;
    const built = buildBandOutline(bi);
    if (!built) return null;
    const entry = { ...built, version: want };
    outlineCache.set(bi, entry);
    return entry;
  }

  function bump(bi) {
    if (bi < 0 || bi >= bandCount()) return;
    bandVersion.set(bi, (bandVersion.get(bi) || 0) + 1);
  }

  function setTile(tx, ty, v) {
    tiles[ty * W + tx] = v;
    chunk.dirty = true;
    tileVer++;
    // The trace of band b reads OUTLINE_PAD rows beyond it, and smoothing
    // moves points by up to about a tile, so a tile near a band edge also
    // changes the neighbour's outline; anything farther cannot.
    const bi = bandOfRow(ty);
    bump(bi);
    const margin = OUTLINE_PAD + 2;
    if (ty - bi * bandRows < margin) bump(bi - 1);
    if ((bi + 1) * bandRows - ty <= margin) bump(bi + 1);
  }

  function wallSegmentsNear(x, y, r) {
    const pad = r + 1;
    const minB = bandOfRow(Math.floor(y - pad)), maxB = bandOfRow(Math.floor(y + pad));
    const out = [];
    for (let bi = minB; bi <= maxB; bi++) {
      const o = getWallOutline(bi);
      if (!o || !o.segments.length) continue;
      for (const s of o.segments) {
        const minSx = Math.min(s.x1, s.x2), maxSx = Math.max(s.x1, s.x2);
        const minSy = Math.min(s.y1, s.y2), maxSy = Math.max(s.y1, s.y2);
        if (maxSx < x - pad || minSx > x + pad || maxSy < y - pad || minSy > y + pad) continue;
        out.push(s);
      }
    }
    return out;
  }

  const resident = [{ index: 0, yOffset: 0, chunk }];

  return {
    v2: true,
    level,
    levelIndex,
    runSeed,
    width: W,
    height: H, // real bottom: the camera clamps to the level
    chunkH: H,
    chunkHeight: H,
    startX, startY,
    exitX: level.exitX + 0.5, exitY: level.exitY + 0.5,

    isSolid(tx, ty) { return tileAt(Math.floor(tx), Math.floor(ty)) !== 0; },
    tileAt,
    authored,
    isBedrock: bedrock,
    isBreakable(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      return !bedrock(x, y) && !inShop(x, y) && tileAt(x, y) !== 0;
    },
    /** Bomb break: any interior rock, never the 2-tile border. */
    breakTile(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (bedrock(x, y) || inShop(x, y)) return false; // the stall's room is unbreakable: its planks, keeper and pedestals never end up floating
      if (tiles[y * W + x] === 0) return false;
      setTile(x, y, 0);
      return true;
    },

    /** A falling rock settles: a water tile becomes breakable rock (hazards.js). False when it is not open water. */
    placeRock(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (bedrock(x, y) || tiles[y * W + x] !== 0) return false;
      setTile(x, y, 1);
      return true;
    },

    getWallOutline,
    wallSegmentsNear,

    // ---- bands (render.js) ----
    configureBands(rows) {
      const r = Math.max(2, Math.floor(rows));
      if (r === bandRows) return;
      bandRows = r; outlineCache.clear(); bandVersion.clear();
    },
    get tileVersion() { return tileVer; },
    get bandRows() { return bandRows; },
    bandCount,
    bandVersion(bi) { return bandVersion.get(bi) || 0; },
    get outlineTraces() { return retraceCount; },
    /** Any change to tiles since the render last looked (render clears it). */
    get dirty() { return chunk.dirty; },

    update(octoY) { if (octoY > deepestY) deepestY = octoY; },
    depth() { return deepestY; },
    currentChunkIndex() { return 0; },
    residentChunkCount() { return 1; },
    residentChunks() { return resident; },
    reachedExit(x, y) { return Math.hypot(x - (level.exitX + 0.5), y - (level.exitY + 0.5)) < 1.2; },
  };
}

function hashSalt(a, b) {
  let h = (Math.imul(a >>> 0, 2654435761) ^ Math.imul((b >>> 0) + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
