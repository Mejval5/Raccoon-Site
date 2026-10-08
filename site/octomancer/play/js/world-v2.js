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
//   - tiles hold material ids (materials.js); bombs break every material but bedrock (the border and its outcrops), the shop frame included;
//   - render.js draws one layer per material present in a band, each from the outline of the tiles of that
//     material's priority or higher (getLayerOutline), lowest first, so a higher material's edge overlaps a lower one.
//
// Bands are the unit render.js caches wall canvases in; `configureBands(rows)`
// lets the renderer pick the band height (about 512 px of baked canvas).

import { generateLevel, LEVEL_W, LEVEL_H, BORDER } from './level.js';
import { buildLevelSpawns, START_SAFE_RADIUS } from './level-spawns.js';
import { MAT_FRAGILE, CR_BOMB, CR_BOULDER } from './fragile.js';
import { planPools } from './pool.js';
import { createFresh } from './fresh.js';
import {
  traceOutlineLoops, chaikinSmoothLoop, loopsToSegments,
  OUTLINE_PAD, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO,
} from './outline.js';
import { MAT_ROCK, MAT_BEDROCK, MAT_PRIORITY, MAT_BOMBABLE, MAT_BOULDER_BREAKS, MAT_DRAW_ORDER } from './materials.js';

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
  // r43: opts.generated / opts.spawnInfo let a caller do the two expensive steps (generateLevel, buildLevelSpawns) in tasks of
  // their own and pass the results in; the world is the same either way
  const level = authored ? opts.level : (opts && opts.generated) || generateLevel(runSeed, levelIndex);
  const tiles = level.tiles;
  const W = level.w || LEVEL_W, H = level.h || LEVEL_H;
  const border = (x, y) => x < BORDER || x >= W - BORDER || y < BORDER || y >= H - BORDER;
  const bedrock = (x, y) => border(x, y) || (x >= 0 && y >= 0 && x < W && y < H && tiles[y * W + x] === MAT_BEDROCK);
  const startX = level.startX + 0.5, startY = level.startY + 0.5;
  const spawnInfo = authored ? { spawns: level.spawns || [] } : (opts && opts.spawnInfo) || buildLevelSpawns(level, runSeed, levelIndex);
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
      ...(level.shortcut3X >= 0 && level.shortcut3X !== undefined ? [{ x0: level.shortcut3X - 2, x1: level.shortcut3X + 3, y0: level.shortcut3Y - 2, y1: level.shortcut3Y + 2 }] : []),
      ...(level.tutorialX >= 0 && level.tutorialX !== undefined ? [{ x0: level.tutorialX - 2, x1: level.tutorialX + 3, y0: level.tutorialY - 2, y1: level.tutorialY + 2 }] : []),
      ...(level.keepOut || []), // the hub village's rooms (hub-rooms.js): no plants over the furniture
      // r46: the whirlpool pedestal (its plinth, the portal ring above it and the prize chest beside it)
      ...(level.setPieces ? planPools(level).map((p) => ({ x0: Math.floor(p.x) - 3, x1: Math.floor(p.x) + 3, y0: p.floorY - 4, y1: p.floorY + 1 })) : []),
    ],
    keepVer: 0, // bumped when a keep-out is added later (a quest's cage): render.js re-places the foliage
    plantFree: level.shop ? {
      x0: Math.min(level.shop.px[0], level.shop.kx) - 3, x1: Math.max(level.shop.px[4], level.shop.kx) + 4,
      y0: level.shop.ky - 5, y1: Math.max(level.shop.px[1], level.shop.px[3], level.shop.px[5]) + 3,
    } : undefined,
  };

  const shopRect = level.shop || null;
  function inShop(x, y) { return shopRect !== null && x >= shopRect.x0 && x < shopRect.x1 && y >= shopRect.y0 && y < shopRect.y1; }
  // 2026-10-07: the shop is ordinary breakable world (Spelunky: bombing the stall is how you anger the keeper). Every shop
  // tile broken is counted, so main.js can tell the stall was damaged. When the Materials owner's shop-frame material
  // (timber / masonry) lands, its tiles break the same way: only the border (isBedrock) is unbreakable.
  let shopBroken = 0;

  let deepestY = startY;

  // ---- bands ----
  let bandRows = 12;
  /** @type {Map<number, {loops:any[], segments:any[], version:number}>} */
  const outlineCache = new Map();
  const bandVersion = new Map(); // band -> version, bumped when its outline may change
  const bandTouch = new Map(); // band -> count of touchTile calls (art only: the outline stays)
  let tileVer = 0; // bumped on every tile change (bomb break, landed rock): props wake and re-check their support
  let retraceCount = 0; // bands traced so far (tests: a bomb retraces only nearby bands)

  function bandCount() { return Math.ceil(H / bandRows); }
  function bandOfRow(ty) { return Math.min(bandCount() - 1, Math.max(0, Math.floor(ty / bandRows))); }

  function tileAt(tx, ty) {
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return MAT_BEDROCK;
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

  // ---- material layers (render.js): per band, which materials are present and the outline of each layer ----
  /** @type {Map<number, {loops:any[], version:number}>} key = band * 8 + material */
  const layerCache = new Map();
  const maskCache = new Map(); // band -> {mask, version}
  /** Bit (1 << material) for every material in band `bi` and the rows its trace reads (OUTLINE_PAD + 1 beyond it). */
  function bandMaterials(bi) {
    const want = bandVersion.get(bi) || 0;
    const c = maskCache.get(bi);
    if (c && c.version === want) return c.mask;
    const y0 = Math.max(0, bi * bandRows - OUTLINE_PAD - 1), y1 = Math.min(H, (bi + 1) * bandRows + OUTLINE_PAD + 1);
    let mask = 0;
    for (let i = y0 * W; i < y1 * W; i++) mask |= 1 << tiles[i];
    mask &= ~1;
    maskCache.set(bi, { mask, version: want });
    return mask;
  }
  /** The lowest-priority material in band `bi` (its layer is the plain solid outline, the collision shape). */
  function lowestMaterial(mask) {
    for (let k = 0; k < MAT_DRAW_ORDER.length; k++) if (mask & (1 << MAT_DRAW_ORDER[k])) return MAT_DRAW_ORDER[k];
    return MAT_ROCK;
  }
  /** Traced + smoothed outline of every tile whose material has `mat`'s priority or higher (world tile units). */
  function getLayerOutline(bi, mat) {
    if (bi < 0 || bi >= bandCount()) return null;
    if (mat === lowestMaterial(bandMaterials(bi))) return getWallOutline(bi);
    const want = bandVersion.get(bi) || 0, key = bi * 8 + mat;
    const cached = layerCache.get(key);
    if (cached && cached.version === want) return cached;
    const y0 = bi * bandRows, h = Math.min(bandRows, H - y0);
    const p = MAT_PRIORITY[mat];
    const { loops: raw } = traceOutlineLoops((tx, ty) => MAT_PRIORITY[tileAt(tx, y0 + ty)] >= p, W, h, OUTLINE_PAD);
    const loops = raw.map((loop) => chaikinSmoothLoop(loop, OUTLINE_SMOOTH_ITERATIONS, OUTLINE_SMOOTH_RATIO).map((pt) => ({ x: pt.x, y: pt.y + y0 })));
    const entry = { loops, version: want };
    layerCache.set(key, entry);
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
  const fresh = createFresh(); // freshly broken edges and silt haze (fresh.js)
  const crumbs = []; // fish-bone tiles broken this step: tx, ty, cause (fragile.js CR_*)
  const logCrumb = (x, y, cause) => { if (crumbs.length < 600) crumbs.push(x, y, cause); }; // capped: nothing drains it in a bare test world

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
    /** Freshly broken rock edges and silt haze of this level (fresh.js; main.js ages and draws them). */
    fresh,
    isBreakable(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      return !border(x, y) && MAT_BOMBABLE[tileAt(x, y)] === 1;
    },
    /** Shop tiles broken on this level so far (main.js: a change angers the shopkeepers). */
    get shopTilesBroken() { return shopBroken; },
    /** Whether tile (tx, ty) is part of the shop room (its frame, floor, walls). */
    inShop(tx, ty) { return inShop(Math.floor(tx), Math.floor(ty)); },
    /** Bomb break: every material but bedrock (the border and its outcrops); the shop frame (timber, masonry) too. */
    breakTile(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (border(x, y)) return false;
      const m = tiles[y * W + x];
      if (!MAT_BOMBABLE[m]) return false;
      setTile(x, y, 0);
      if (MAT_FRAGILE[m]) logCrumb(x, y, CR_BOMB); // fish bone: shards and a crunch like any other break (main.js)
      fresh.add(x, y);
      if (inShop(x, y)) shopBroken++; // the stall breaks like any rock: its pedestals fall, the keeper is angered (main.js, shop.js)
      return true;
    },
    /** A falling boulder smashes a wooden platform or a bone block it lands on. False for anything else. */
    smashTile(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      const m = tileAt(x, y);
      if (border(x, y) || !MAT_BOULDER_BREAKS[m]) return false;
      setTile(x, y, 0);
      if (MAT_FRAGILE[m]) logCrumb(x, y, CR_BOULDER);
      fresh.add(x, y);
      if (inShop(x, y)) shopBroken++; // a smashed beam of the stall counts like a bombed one
      return true;
    },
    /** Fragile terrain (fragile.js): a fish-bone tile crumbles from a dash, a projectile or a flung prop (`cause` CR_*).
     *  False for anything that is not fish bone. Logged for main.js (takeCrumbles). */
    crumbleTile(tx, ty, cause = 0) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (border(x, y) || !MAT_FRAGILE[tileAt(x, y)]) return false;
      setTile(x, y, 0);
      fresh.add(x, y);
      logCrumb(x, y, cause);
      return true;
    },
    /** Fish-bone tiles broken since the last call, as a flat [tx, ty, cause, ...] list (main.js: shards, silt, crunch). */
    takeCrumbles() { const out = crumbs.slice(); crumbs.length = 0; return out; },
    /** Material id at a tile (0 water). */
    materialAt(tx, ty) { return tileAt(Math.floor(tx), Math.floor(ty)); },
    /** Something drawn on this tile changed (embedded treasure, ...): its wall cell is baked again. */
    touchTile(tx, ty) { const bi = bandOfRow(ty); bandTouch.set(bi, (bandTouch.get(bi) || 0) + 1); },
    /** How often a tile of band `bi` was touched (render.js bakes its cells again when this changes). */
    bandTouch(bi) { return bandTouch.get(bi) || 0; },

    /** A falling rock settles: a water tile becomes breakable rock (hazards.js). False when it is not open water. */
    placeRock(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (border(x, y) || tiles[y * W + x] !== 0) return false;
      setTile(x, y, MAT_ROCK);
      return true;
    },

    /** Spells (Coral Wall): a water tile becomes material `mat` (placeRock generalised). False when it is not open water or on the border. */
    placeTile(tx, ty, mat) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (border(x, y) || tiles[y * W + x] !== 0 || !mat) return false;
      setTile(x, y, mat);
      return true;
    },

    getWallOutline,
    wallSegmentsNear,
    getLayerOutline,
    bandMaterials,
    /** r46: no foliage in tile rect [x0, x1) x [y0, y1) (a quest's person or cage, placed after the level). */
    addPlantKeepOut(x0, y0, x1, y1) { chunk.plantKeepOut.push({ x0, y0, x1, y1 }); chunk.keepVer++; },

    // ---- bands (render.js) ----
    configureBands(rows) {
      const r = Math.max(2, Math.floor(rows));
      if (r === bandRows) return;
      bandRows = r; outlineCache.clear(); bandVersion.clear(); layerCache.clear(); maskCache.clear();
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
