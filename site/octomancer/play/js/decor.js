// Decor: bubbles rising from vents, plants anchored per chunk from the
// chunk's own seeded data, wall critters (this session's "alive pass" --
// NIGHT-LOG.md), and the depth tint (bluer/darker every 100 units, never
// below 35% floor brightness). OVERNIGHT.md §2 "World" / M2-3.
//
// Wall critters: Daniel played the build and said the original had "a lot
// more critters on the walls". The Unity foliage system (PatternGenerator +
// a `FoliagePlanterTiles` with DynamicDensity on) spawns ~5-6 distinct
// non-hostile items per pattern at 9-45 instances each across a full 3-room
// level, plus a denser background ambient layer (eyes/runes, density
// 16, cap 10-15 each) -- see NIGHT-LOG.md for the exact numbers. This adds a
// matching non-hostile layer here: snails, a reef fish, a jellyfish,
// background eyes, runes and a couple of the kept 2021 bushes,
// picked and placed purely from each chunk's own tile data + a small
// integer hash (same "no extra RNG stream" style as `findVents` below and
// `drawPlants` in render.js), so they stay in sync across re-renders without
// decor.js needing a seed of its own. Positions/kinds only; the actual
// sprites and their idle motion (bob/sway/blink/tiny crawl) are drawn by
// decor-draw.js, called from render.js's per-frame draw list.

const BUBBLE_RISE_SPEED = 1.4; // u/s
const BUBBLE_LIFETIME = 3.5; // s before a vent's bubble respawns at the bottom

// Wall-mounted (floor/ceiling/side-wall) vs free-floating open-water kinds.
// Round-1 fix (Daniel's screenshot review): the wall "hole" critter (looks
// like a bullet hole -- a grey spiky ring with a dark centre, not a readable
// cave feature at this art scale) is removed from spawn entirely, below.
export const CRITTER_KINDS_WALL = ['snail', 'eye', 'eyeblue', 'rune1', 'rune3', 'rune5', 'bush2', 'bushmini'];
// Round-3 fix (Daniel's screenshot review: "the faint open-water 'jelly'
// critter reads as a UI glyph, a flat teal dot above two dashes, a bit like
// a person icon -- nothing like it appears in the promo video"). The
// `critter-jelly.webp` export looks like a cropped/low-alpha fragment of the
// jellyfish art rather than a readable creature at this scale; dropped from
// spawn rather than re-exporting art out of scope for a visual-fixes pass.
export const CRITTER_KINDS_OPEN = ['fish'];

/** Cheap 32-bit integer hash of two ints (no external state, no RNG stream
 * to keep in sync) -- used only to pick which cells get a critter and which
 * kind, deterministically from each chunk's own coordinates. */
function hash2(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

/** True if the solid tile at (x,y) is a thin nub/island -- open on 3 or more
 * of its own 4 orthogonal sides, same test render.js's `pickWallArt` uses to
 * pick its rounded-nub/island art -- so wall decor never anchors to a tile
 * that barely reads as "wall" itself. Out-of-bounds (chunk seam, unknown
 * neighbour) is treated as solid/safe rather than thin. */
function isThinWallCell(chunk, chunkW, chunkH, x, y) {
  const openAt = (nx, ny) => {
    if (nx < 0 || nx >= chunkW || ny < 0 || ny >= chunkH) return false;
    return chunk.tiles[ny * chunkW + nx] === 0;
  };
  const open = (openAt(x, y - 1) ? 1 : 0) + (openAt(x, y + 1) ? 1 : 0)
    + (openAt(x - 1, y) ? 1 : 0) + (openAt(x + 1, y) ? 1 : 0);
  return open >= 3;
}

/** Finds candidate cells for non-hostile wall decor: floor caps, ceiling
 * caps and side-wall faces get the wall-mounted kinds (snail/eye/rune/
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
        // Round-2 fix (Daniel's screenshot review: critters/decor float
        // detached from walls -- a bushmini anchored for side-wall cell
        // (18,4) at y=3.84, a tile above where it belongs). `h` is an
        // unsigned 32-bit hash (`hash2` returns `h >>> 0`), but `h >> 5` is
        // a *signed* right shift: once bit 31 of `h` is set, `h >> 5` comes
        // out negative, so `(h >> 5) % 21` ranges over negative values too
        // and the jitter below skews to about -0.9..+0.3 tiles instead of
        // the intended +-0.3 -- almost a full tile of unwanted drift on
        // roughly half of all placements. `h >>> 5` (unsigned shift) keeps
        // it a plain 0..2^27-1 value.
        //
        // Skip an anchor tile that's itself a thin nub/island (open on 3+
        // of its own 4 sides, render.js's `pickWallArt` count>=3 case): it
        // reads as a lone floating dot, not a readable wall to be "on", so
        // no decor should be pinned to it.
        const anchorSolidX = floorCap || ceilingCap ? x : (chunk.tiles[y * chunkW + (x + 1)] !== 0 ? x + 1 : x - 1);
        const anchorSolidY = floorCap ? y + 1 : ceilingCap ? y - 1 : y;
        if (isThinWallCell(chunk, chunkW, chunkH, anchorSolidX, anchorSolidY)) continue;
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
        //
        // Round-2 fix: eyes/runes and anything on a side wall sat about 0.25
        // tile off the visible rim even unjittered, because the rim art
        // itself is inset from the tile edge -- a deeper anchor for those
        // brings them flush against the rim instead of hovering just past it.
        //
        // Round-3 fix (Daniel's screenshot review): eyes/runes still read as
        // floating in open water next to the rock, not marks ON it -- 0.5
        // tile in still leaves most of a 0.36-0.4-unit sprite sitting past
        // the rim in open water. Deepened further (0.65) so the anchor -- and
        // now the rune's own tint (decor-draw.js's `getTintedRune`) -- lands
        // on the rock face itself, matching the promo video's runes/crosses
        // painted onto the rock.
        const isRimKind = kind === 'eye' || kind === 'eyeblue' || kind.startsWith('rune');
        const INTO_WALL = isRimKind ? 0.65 : (wallSide ? 0.5 : 0.3);
        let ax = x + 0.5, ay = y + yOffset + 0.5;
        let wallDir = 0;
        if (floorCap) ay += INTO_WALL;
        else if (ceilingCap) ay -= INTO_WALL;
        else if (wallSide) {
          wallDir = chunk.tiles[y * chunkW + (x + 1)] !== 0 ? 1 : -1;
          ax += wallDir * INTO_WALL;
        }
        // Round-3 fix (Daniel's screenshot review: "some wall eye critters
        // float in open water up to about 1 tile from any rock" -- a side
        // eye sitting entirely in the water, just touching the rim, and one
        // above a step corner). The along-wall jitter can carry the anchor
        // past the end of a short wall face onto a cell that is not actually
        // solid there; clamp it to 0 whenever the jittered position would no
        // longer border its solid anchor neighbour, so decor never drifts
        // off the wall it was placed on.
        let jitter = (((h >>> 5) % 21) - 10) / 10 * 0.3; // ~RandomOffsetRangeX/Y
        if (floorCap || ceilingCap) {
          const jx = Math.min(chunkW - 1, Math.max(0, Math.round(x + jitter)));
          if (chunk.tiles[anchorSolidY * chunkW + jx] === 0) jitter = 0;
          ax += jitter;
        } else {
          const jyLocal = Math.min(chunkH - 1, Math.max(0, Math.round(y + jitter)));
          if (chunk.tiles[jyLocal * chunkW + anchorSolidX] === 0) jitter = 0;
          ay += jitter;
        }
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
