// Infinite procedural world: a ring buffer of seeded chunks generated ahead
// of the octopus and dropped behind it. OVERNIGHT.md §2 "World" / M2-2.
//
// Deviation (logged in NIGHT-LOG.md): M1's `createTestCave()` (fixed 32x48
// hand-built layout) is gone; M2's world is this streaming generator. The
// old export names (WORLD_W/WORLD_H) are kept as the chunk width / a large
// nominal height so render.js's camera-bounds call site did not need to
// change shape.

import { createGenerator, CHUNK_W, CHUNK_H } from './gen.js';

export const WORLD_W = CHUNK_W;
// There is no real bottom; a very large nominal height keeps camera.js's
// "clamp inside the world" logic doing the one thing we actually want at
// the top (never show above row 0) without ever clamping the bottom.
export const WORLD_H = 1e7;

const RESIDENT_BEHIND = 1; // chunks kept behind the octopus's current chunk
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

  function ensureNext() {
    const i = highestGenerated + 1;
    const c = gen.next(i);
    c.dirty = true; // render cache needs (re)baking
    chunks.set(i, c);
    highestGenerated = i;
    return c;
  }

  // A small open start pool at the very top (M2-2's "start pool"): chunk 0's
  // generator output already carves a path from the centre column, but we
  // want the first few rows guaranteed open above the octopus's spawn so it
  // never spawns touching rock. Punch a simple open room into chunk 0's
  // upper rows after generation (cheap, still deterministic per seed).
  function carveStartPool(c) {
    const cx = Math.floor(CHUNK_W / 2);
    for (let y = 0; y < 4; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) {
        if (x < 2 || x >= CHUNK_W - 2) continue;
        c.tiles[y * CHUNK_W + x] = 0;
      }
    }
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
  }

  return {
    width: CHUNK_W,
    height: WORLD_H,
    chunkH: CHUNK_H,
    startX: Math.floor(CHUNK_W / 2) + 0.5,
    startY: 2,

    isSolid(tx, ty) {
      const v = tileAt(Math.floor(tx), Math.floor(ty));
      return v === 1 || v === 2;
    },
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
        if (ci < curChunk - RESIDENT_BEHIND) chunks.delete(ci);
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
