// Decor: bubbles rising from vents, plants anchored per chunk from the
// chunk's own seeded data, wall critters (this session's "alive pass" --
// NIGHT-LOG.md), and the depth tint (bluer/darker every 100 units, never
// below 35% floor brightness). OVERNIGHT.md §2 "World" / M2-3.
//
// Wall critters: Daniel played the build and said the original had "a lot
// more critters on the walls". The Unity foliage system (PatternGenerator +
// a `FoliagePlanterTiles` with DynamicDensity on) spawns ~5-6 distinct
// non-hostile items per pattern at 9-45 instances each across a full 3-room
// level, plus a denser background ambient layer (eyes/holes/runes, density
// 16, cap 10-15 each) -- see NIGHT-LOG.md for the exact numbers. This adds a
// matching non-hostile layer here: snails, a reef fish, a jellyfish,
// background eyes, wall holes, runes and a couple of the kept 2021 bushes,
// picked and placed purely from each chunk's own tile data + a small
// integer hash (same "no extra RNG stream" style as `findVents` below and
// `drawPlants` in render.js), so they stay in sync across re-renders without
// decor.js needing a seed of its own. Positions/kinds only; the actual
// sprites and their idle motion (bob/sway/blink/tiny crawl) are drawn by
// decor-draw.js, called from render.js's per-frame draw list.

const BUBBLE_RISE_SPEED = 1.4; // u/s
const BUBBLE_LIFETIME = 3.5; // s before a vent's bubble respawns at the bottom

// Wall-mounted (floor/ceiling/side-wall) vs free-floating open-water kinds.
export const CRITTER_KINDS_WALL = ['snail', 'eye', 'eyeblue', 'hole1', 'hole2', 'rune1', 'rune3', 'rune5', 'bush2', 'bushmini'];
export const CRITTER_KINDS_OPEN = ['fish', 'jelly'];

/** Cheap 32-bit integer hash of two ints (no external state, no RNG stream
 * to keep in sync) -- used only to pick which cells get a critter and which
 * kind, deterministically from each chunk's own coordinates. */
function hash2(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Finds candidate cells for non-hostile wall decor: floor caps, ceiling
 * caps and side-wall faces get the wall-mounted kinds (snail/eye/hole/rune/
 * bush); open water away from any wall occasionally gets a drifting fish or
 * jelly. Sparse sampling (same idea as `drawPlants`'s "every 9th cell") so
 * this reads as inhabited walls, not a solid carpet of sprites. */
function findWallCritters(chunk, yOffset, chunkW, chunkH, chunkIndex) {
  const out = [];
  for (let y = 1; y < chunkH - 1; y++) {
    for (let x = 1; x < chunkW - 1; x++) {
      const i = y * chunkW + x;
      if (chunk.tiles[i] !== 0) continue; // must itself be open water
      const floorCap = chunk.tiles[(y + 1) * chunkW + x] !== 0;
      const ceilingCap = chunk.tiles[(y - 1) * chunkW + x] !== 0;
      const wallSide = chunk.tiles[y * chunkW + (x - 1)] !== 0 || chunk.tiles[y * chunkW + (x + 1)] !== 0;
      const h = hash2(chunkIndex * 92821 + x, y * 131 + chunkIndex);
      if (floorCap || ceilingCap || wallSide) {
        if (h % 11 !== 0) continue; // ~1 eligible wall cell in 11
        const kind = CRITTER_KINDS_WALL[h % CRITTER_KINDS_WALL.length];
        // Anchor slightly into the solid neighbour tile, not the open
        // cell's centre: ported from the original's `PositionOffset`
        // (`FoliagePlant1.asset` PositionOffset.y=-0.58, almost a full tile
        // into the ground) plus a small `RandomOffsetRangeX/Y` jitter, which
        // is how Unity's foliage sits partly inside its matched solid tile
        // so it draws poking out from underneath the terrain sprite. Magpie
        // is moving render.js's draw order so walls composite on top of this
        // decor layer this session (NIGHT-LOG.md) -- with that order, an
        // anchor 0.3 tiles into the wall reads the same way: mostly visible,
        // its base tucked under the rock.
        const INTO_WALL = 0.3;
        let ax = x + 0.5, ay = y + yOffset + 0.5;
        let wallDir = 0;
        if (floorCap) ay += INTO_WALL;
        else if (ceilingCap) ay -= INTO_WALL;
        else if (wallSide) {
          wallDir = chunk.tiles[y * chunkW + (x + 1)] !== 0 ? 1 : -1;
          ax += wallDir * INTO_WALL;
        }
        const jitter = (((h >> 5) % 21) - 10) / 10 * 0.3; // ~RandomOffsetRangeX/Y
        if (floorCap || ceilingCap) ax += jitter; else ay += jitter;
        out.push({
          kind, x: ax, y: ay,
          onFloor: floorCap, onCeiling: !floorCap && ceilingCap, wallDir,
          phase: (h % 1000) / 1000 * Math.PI * 2,
          flip: (h >> 3) % 2 === 0,
        });
      } else {
        if (h % 23 !== 0) continue; // rarer still: a drifting fish/jelly out in open water
        const kind = CRITTER_KINDS_OPEN[h % CRITTER_KINDS_OPEN.length];
        out.push({
          kind, x: x + 0.5, y: y + yOffset + 0.5,
          onFloor: false, onCeiling: false, wallDir: 0,
          phase: (h % 1000) / 1000 * Math.PI * 2,
          flip: (h >> 3) % 2 === 0,
        });
      }
    }
  }
  return out;
}

/** Picks a handful of floor cells per chunk to act as bubble vents (cheap,
 * deterministic given the chunk's own tile data - no extra RNG needed). */
function findVents(chunk, yOffset, chunkW, chunkH) {
  const vents = [];
  for (let y = chunkH - 2; y > 0 && vents.length < 3; y--) {
    for (let x = 2; x < chunkW - 2 && vents.length < 3; x++) {
      const i = y * chunkW + x;
      const below = (y + 1) * chunkW + x;
      if (chunk.tiles[i] === 0 && chunk.tiles[below] !== 0 && (x + y) % 7 === 0) {
        vents.push({ x: x + 0.5, y: y + yOffset + 0.9 });
      }
    }
  }
  return vents;
}

export function createDecor(chunkW, chunkH) {
  /** @type {Map<number, {vents:{x:number,y:number}[], bubbles:{x:number,y:number,t:number}[]}>} */
  const byChunk = new Map();

  function ensureChunk(ci, chunk, yOffset) {
    if (byChunk.has(ci)) return byChunk.get(ci);
    const vents = findVents(chunk, yOffset, chunkW, chunkH);
    const bubbles = vents.map((v, i) => ({ x: v.x, y: v.y, t: (i * BUBBLE_LIFETIME) / (vents.length || 1) }));
    const critters = findWallCritters(chunk, yOffset, chunkW, chunkH, ci);
    const entry = { vents, bubbles, critters };
    byChunk.set(ci, entry);
    return entry;
  }

  return {
    update(dt, resident) {
      const live = new Set(resident.map((r) => r.index));
      for (const ci of [...byChunk.keys()]) if (!live.has(ci)) byChunk.delete(ci);
      for (const { index, yOffset, chunk } of resident) {
        const entry = ensureChunk(index, chunk, yOffset);
        for (const b of entry.bubbles) {
          b.t += dt;
          if (b.t > BUBBLE_LIFETIME) b.t -= BUBBLE_LIFETIME;
        }
      }
    },
    /** Visible bubble instances (world x, world y, rise progress 0..1). */
    visibleBubbles(resident) {
      const out = [];
      for (const { index } of resident) {
        const entry = byChunk.get(index);
        if (!entry) continue;
        for (let i = 0; i < entry.bubbles.length; i++) {
          const b = entry.bubbles[i];
          const vent = entry.vents[i];
          const progress = b.t / BUBBLE_LIFETIME;
          out.push({ x: vent.x + Math.sin(b.t * 2 + i) * 0.15, y: vent.y - progress * BUBBLE_RISE_SPEED * BUBBLE_LIFETIME, alpha: 1 - progress * 0.6 });
        }
      }
      return out;
    },
    /** Static (position/kind/phase) wall-critter instances for every
     * resident chunk; decor-draw.js animates them per-frame from `time` and
     * each one's own `phase`, so nothing here needs per-frame state. */
    visibleCritters(resident) {
      const out = [];
      for (const { index } of resident) {
        const entry = byChunk.get(index);
        if (!entry) continue;
        out.push(...entry.critters);
      }
      return out;
    },
  };
}

/** Depth tint: bluer and darker every 100 units, floored at 35% brightness.
 * Returns an rgba() overlay to composite over the scene with 'multiply' plus
 * a flat blue wash, cheap and stable at any depth. */
export function depthTint(depth) {
  const t = Math.min(1, depth / 600); // fully saturated by depth 600
  const brightness = Math.max(0.35, 1 - t * 0.65);
  const blue = 40 + t * 60;
  return { brightness, overlay: `rgba(4,10,${Math.round(blue)},${(t * 0.35).toFixed(3)})` };
}
