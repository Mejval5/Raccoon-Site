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
// matching non-hostile layer here: a reef fish, runes and a couple of the
// kept 2021 bushes (snail, jellyfish and the background eyes were all tried
// and dropped again across rounds 1-6 -- none of them read as a wall
// creature at this art scale; see CRITTER_KINDS_WALL/_OPEN's own comments),
// picked and placed purely from each chunk's own tile data + a small
// integer hash (same "no extra RNG stream" style as `findVents` below and
// `drawPlants` in render.js), so they stay in sync across re-renders without
// decor.js needing a seed of its own. Positions/kinds only; the actual
// sprites and their idle motion (bob/sway/blink/tiny crawl) are drawn by
// decor-draw.js, called from render.js's per-frame draw list.

import { isAmbientDead } from './ambient.js';
import { getFoliageTable, pickEmbedded, SURF_EMBED } from './foliage.js';

const BUBBLE_RISE_SPEED = 1.4; // u/s
const BUBBLE_LIFETIME = 3.5; // s before a vent's bubble respawns at the bottom

// Wall-mounted (floor/ceiling/side-wall) vs free-floating open-water kinds.
// Round-1 fix (Daniel's screenshot review): the wall "hole" critter (looks
// like a bullet hole -- a grey spiky ring with a dark centre, not a readable
// cave feature at this art scale) is removed from spawn entirely, below.
// Round-4 fix (Daniel's screenshot review round 3: "ceiling snails float and
// read as an 'i' glyph, remove snail from ceiling placements or from wall
// critters entirely"). Checking a floor placement too (same `critter-snail.
// webp` art, this session's own screenshots) found the exact same read there
// -- a tiny blue circle-over-a-dash hovering above the rim, not a readable
// creature at this scale on ANY surface, not just the ceiling. Removed from
// spawn entirely, same treatment round-1 already gave the "hole" critter and
// round-3 gave the open-water "jelly".
// Round-6 fix (Daniel's own screenshot review round 5: "remove the wall eye
// critter completely -- decor-eye/decor-eyeblue"). Same call the round-1
// "hole" critter and round-3/4's "jelly"/"snail" got: `Eye`/`EyeBlue`
// (Assets/Sprites/Background) are Milan's background-layer decoration, not a
// critter meant to be scattered across walls at this density/scale --
// ART-SORT.md now marks the wall-critter USE of them "not original" (the
// source images themselves are still Milan's art, just never spawned as a
// creature here). Dropped from spawn entirely; decor-draw.js's `eye`/
// `eyeblue` image loads and draw branch are removed too, so there's no dead
// reference left pointing at them.
// Round-7 fix (Daniel's screenshot review round 6, item 5: "bush decor shows
// as a blurry, outline-less green smudge, not a plant"). `decor-bushmini.
// webp`'s source art is itself a soft, edgeless glow blob (not a mistake in
// how it was drawn here -- there is no crisp outline to preserve), so no
// filter change fixes it; dropped from spawn entirely, same call already
// made for the other art that never read as intended (`eye`/`eyeblue`,
// round 6; `critter-jelly`, round 3). `bush2` DOES have real leaf/frond
// shapes and stays, but see the `!ceilingCap` check below (findWallCritters)
// -- the review's other complaint ("under ceilings it looks like a splat, or
// a dripping smear") was the same asset hung upside-down with its own
// gravity-shaped silhouette now pointing the wrong way, which no filter or
// flip fixes either; it now only spawns growing up from a floor.
export const CRITTER_KINDS_WALL = ['rune1', 'rune3', 'rune5', 'bush2'];
/** r37: fossils embedded in thick rock, drawn procedurally by decor-draw.js (an ammonite, a fish skeleton, a bone). */
export const FOSSIL_KINDS = ['fossil-shell', 'fossil-fish', 'fossil-bone'];
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

/** Round-6 fix (reviewer leftover, NIGHT-LOG.md task 6: "keep decor away
 * from enemy slots"). gen.js's enemy-slot spawns (`chunk.spawns`, tagged
 * `type: 'enemy-slot'`) and this file's own wall-critter search used to pick
 * cells completely independently, so a decor critter could land on (or right
 * beside) the exact cell an enemy is anchored to -- the sprite pair could
 * overlap depending on their placements, and an enemy the player is dashing
 * around/dodging reads more confusingly with a static critter camped on the
 * same wall pixel. Builds the set of tile cells (local `x,y`) any enemy slot
 * already claims, so `findWallCritters` can skip them. */
function enemySlotCellSet(chunk) {
  const set = new Set();
  if (!chunk.spawns) return set;
  for (const s of chunk.spawns) {
    if (s.type !== 'enemy-slot' && s.type !== 'hazard' && s.type !== 'loot') continue;
    // s.x/s.y are local tile coords + 0.5 (gen.js); floor gets the tile back.
    set.add(`${Math.floor(s.x)},${Math.floor(s.y)}`);
  }
  return set;
}

/** Finds candidate cells for non-hostile wall decor: floor caps, ceiling
 * caps and side-wall faces get the wall-mounted kinds (snail/eye/rune/
 * bush); open water away from any wall occasionally gets a drifting fish or
 * jelly. Sparse sampling (same idea as `drawPlants`'s "every 9th cell") so
 * this reads as inhabited walls, not a solid carpet of sprites. */
function findWallCritters(chunk, yOffset, chunkW, chunkH, chunkIndex) {
  const out = [];
  const enemyCells = enemySlotCellSet(chunk);
  for (let y = 1; y < chunkH - 1; y++) {
    for (let x = 1; x < chunkW - 1; x++) {
      const i = y * chunkW + x;
      if (chunk.tiles[i] !== 0) continue; // must itself be open water
      if (enemyCells.has(`${x},${y}`)) continue; // an enemy already anchors here
      const floorCap = chunk.tiles[(y + 1) * chunkW + x] !== 0;
      const ceilingCap = chunk.tiles[(y - 1) * chunkW + x] !== 0;
      const wallSide = chunk.tiles[y * chunkW + (x - 1)] !== 0 || chunk.tiles[y * chunkW + (x + 1)] !== 0;
      const h = hash2(chunkIndex * 92821 + x, y * 131 + chunkIndex);
      if (floorCap || ceilingCap || wallSide) {
        // Round-12 "fill the cave" pass, density bump (Daniel: "still very
        // empty" comparing against the promo video stills): 1-in-11 read as
        // sparse scattered dots even with this file's own bubble/rune/bush
        // layer added on top; 1-in-7 roughly matches the video's density of
        // wall marks/growth without carpeting every cell (still gated by
        // every corner/thin-wall/rim-crossing skip below, so a busier hash
        // hit just means more CANDIDATES get a chance to actually place).
        if (h % 7 !== 0) continue;
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
        // Round-4 fix (Daniel's screenshot review round 3: "bush2 and
        // bushmini float above floors/below ceilings and past corners").
        // `isThinWallCell` only catches a near-isolated nub (3+ open sides);
        // a plain corner/end-of-run anchor (2 open sides, one of them
        // perpendicular to the placement) still reads as "not a flat run" for
        // a bush -- its rim curves away right where the bush would sit,
        // leaving a gap. Skip bush placements there (other kinds keep
        // anchoring fine at a corner, e.g. eyes/runes).
        if (kind === 'bush2' && (floorCap || ceilingCap)) {
          const cornerOpen = (nx) => nx < 0 || nx >= chunkW || chunk.tiles[anchorSolidY * chunkW + nx] === 0;
          if (cornerOpen(anchorSolidX - 1) || cornerOpen(anchorSolidX + 1)) continue;
        }
        // Round-5 fix (Daniel's screenshot review round 4, issue 2: "side-wall
        // bushes still float detached in open water" -- the promo video only
        // ever shows bush2 growing out of a floor or ceiling; a side-wall
        // face was never a placement the art was drawn for, and no anchor
        // depth reads right there. Drop the kind entirely for a plain
        // side-wall anchor rather than trying to tune INTO_WALL further.
        if (kind === 'bush2' && wallSide && !floorCap && !ceilingCap) continue;
        // Round-7 fix (Daniel's screenshot review round 6, item 5): a
        // ceiling-hung bush2 read as "a splat, or a dripping olive-yellow
        // smear with specks trailing below" -- the sprite's own silhouette
        // (a plant growing up, wide base tapering to fine fronds at the top)
        // is only readable that way up; flipped upside-down under a ceiling
        // it inverts into exactly that drip/smear shape. Floor-only.
        if (kind === 'bush2' && ceilingCap) continue;
        // Same "end of a wall run" corner check floor/ceiling anchors already
        // get above, applied to side-wall anchors too: skip whenever the row
        // above or below the anchor's solid neighbour is open, i.e. the rock
        // face's rim curves away right there instead of running flat past
        // this cell.
        if (wallSide && !floorCap && !ceilingCap) {
          const rowOpen = (ny) => ny < 0 || ny >= chunkH || chunk.tiles[ny * chunkW + anchorSolidX] === 0;
          if (rowOpen(anchorSolidY - 1) || rowOpen(anchorSolidY + 1)) continue;
        }
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
        // Round-6: was `isEye || isRune` -- 'eye'/'eyeblue' no longer spawn
        // (removed above), so this simplifies to just the rune check.
        const isRune = kind.startsWith('rune');
        const isRimKind = isRune;
        const isBush = kind === 'bush2';
        let wallDir = 0;
        if (wallSide) wallDir = chunk.tiles[y * chunkW + (x + 1)] !== 0 ? 1 : -1;
        // Round-5 fix (Daniel's screenshot review round 4, issue 4: "runes
        // still read as faint glyphs floating in the water, not marks
        // painted on rock" -- even 0.65 tile in still leaves most of the
        // glyph over the open-water side of the rim). Runes (unlike eyes,
        // which are meant to peer out right at the rim) want to sit well
        // inside the rock face, like the promo video's cave-urchin/hub
        // frames -- but only where the cell one tile further into the rock
        // is ALSO solid, so a rune never pokes out the far side of a thin
        // (1-tile) wall. Falls back to the eye/bush depth otherwise.
        let runeDeepOk = false;
        if (isRune) {
          if (floorCap) runeDeepOk = (y + 2 < chunkH) && chunk.tiles[(y + 2) * chunkW + x] !== 0;
          else if (ceilingCap) runeDeepOk = (y - 2 >= 0) && chunk.tiles[(y - 2) * chunkW + x] !== 0;
          else if (wallSide) {
            const farX = anchorSolidX + wallDir;
            runeDeepOk = farX >= 0 && farX < chunkW && chunk.tiles[y * chunkW + farX] !== 0;
          }
        }
        // Round-10 fix (review round 9 leftover, issue A4: "rune decals cross
        // the rim"). `runeDeepOk` above only checked one further tile in the
        // anchor direction, which still lets a rune land right next to an
        // outer corner or a thin peninsula (solid one way, open a diagonal
        // step away) where the traced/smoothed rim (world.js's
        // `getWallOutline`) cuts back in behind the flat "2 deep" check --
        // the tint (decor-draw.js's `getTintedRune`) then paints past that
        // cut and visibly crosses the drawn rock edge. Require the anchor
        // tile itself to be "fully interior" (all 8 neighbours solid, so the
        // rim can't possibly cut back anywhere near it) before a rune is
        // allowed to spawn at all; skip the placement entirely otherwise
        // (like the thin-wall-cell / corner skips above) rather than fall
        // back to a shallower inset that can still cross a smoothed corner.
        if (isRune) {
          let interior = true;
          for (let dy = -1; dy <= 1 && interior; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = anchorSolidX + dx, ny = anchorSolidY + dy;
              if (nx < 0 || nx >= chunkW || ny < 0 || ny >= chunkH || chunk.tiles[ny * chunkW + nx] === 0) {
                interior = false; break;
              }
            }
          }
          if (!interior) continue;
        }
        const RUNE_INTO_WALL = 1.15;
        const INTO_WALL = isRune ? (runeDeepOk ? RUNE_INTO_WALL : 0.65)
          : isRimKind ? 0.65 : isBush && !wallSide ? 0.6 : (wallSide ? 0.5 : 0.3);
        let ax = x + 0.5, ay = y + yOffset + 0.5;
        if (floorCap) ay += INTO_WALL;
        else if (ceilingCap) ay -= INTO_WALL;
        else if (wallSide) {
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
          support: anchorSolidY * chunkW + anchorSolidX, // tile the sprite is mounted on; if a bomb removes it the decor goes too
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

/** r36: rune carvings from the pattern table (data/patterns.json, kind 'decor', spawn 'rune'). The anchor is the ROCK
 * tile carrying the carving, so the critter sits inside that tile and the rune pass (drawn over the wall) paints it on
 * the face. Gone with its tile when a bomb removes it (`support`). */
function patternRunes(chunk, yOffset, chunkW) {
  const out = [];
  if (!chunk.spawns) return out;
  for (const s of chunk.spawns) {
    if (s.type !== 'decor' || (s.dk !== 'rune' && s.dk !== 'fossil')) continue;
    const tx = Math.floor(s.x), ty = Math.floor(s.y);
    if (nearEnemySlot(chunk, tx, ty)) continue;
    const h = hash2(tx * 91 + 7, ty * 53 + 3);
    // r37: jitter along the wall (runes on a straight wall used to line up in columns); fossils sit anywhere in their tile
    const j1 = (((h >>> 5) % 100) / 100 - 0.5), j2 = (((h >>> 13) % 100) / 100 - 0.5);
    const FT = getFoliageTable();
    // (not over a buried-treasure find: embed.js's {type:'embed'} records sit in rock tiles too)
    if (s.dk === 'fossil' && FT && ((h >>> 21) % 5) < 2 && !chunk.spawns.some((e) => e.type === 'embed' && Math.abs(Math.floor(e.x) - tx) <= 1 && Math.abs(Math.floor(e.y) - ty) <= 1)) {
      // the background generator's crystals and pebbles (FoliageRock23, Rock23_Solo, Plant20), on two in five fossil
      // cells: thick rock all round, so their FoliageRandomizer scale and rotation keep them on the rock face
      const e = pickEmbedded(FT, SURF_EMBED, ((h >>> 3) % 997) / 997, ((h >>> 9) % 991) / 991, ((h >>> 15) % 983) / 983, (h >>> 27) & 1);
      if (e) {
        out.push({
          kind: 'embed', fk: e.kind, scale: e.scale, rot: e.rot, x: s.x + j1 * 0.4, y: s.y + yOffset + j2 * 0.4,
          support: ty * chunkW + tx, onFloor: false, onCeiling: false, wallDir: 0, phase: (h % 1000) / 1000 * Math.PI * 2, flip: e.flip,
        });
        continue;
      }
    }
    if (s.dk === 'fossil') {
      out.push({
        kind: FOSSIL_KINDS[h % FOSSIL_KINDS.length], x: s.x + j1 * 0.5, y: s.y + yOffset + j2 * 0.5,
        support: ty * chunkW + tx, onFloor: false, onCeiling: false, wallDir: 0,
        phase: (h % 1000) / 1000 * Math.PI * 2, flip: (h >> 3) % 2 === 0,
      });
      continue;
    }
    const alongX = s.dy !== 0; // a floor or ceiling rune slides sideways, a wall rune up and down
    out.push({
      kind: FT ? 'rune' + (1 + ((h >>> 7) % 6)) : CRITTER_KINDS_WALL[h % 3], x: s.x - s.dx * 0.12 + (alongX ? j1 * 0.7 : 0), y: s.y + yOffset - s.dy * 0.12 + (alongX ? 0 : j2 * 0.7),
      support: ty * chunkW + tx, onFloor: s.dy < 0, onCeiling: s.dy > 0, wallDir: -s.dx,
      phase: (h % 1000) / 1000 * Math.PI * 2, flip: (h >> 3) % 2 === 0,
    });
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
        // Round-10 fix (review round 9 leftover, issue A3: "vent bubbles
        // rise through solid rock"). A bubble used to rise a fixed distance
        // (BUBBLE_RISE_SPEED * BUBBLE_LIFETIME) regardless of what's above
        // the vent, so any vent with a low ceiling (a short open pocket, a
        // thin ledge above it) sent its bubbles straight through the rock.
        // Scan upward from the vent's own row, within this same chunk's
        // tile grid (a bubble's ~4.9-unit max rise is well under one
        // chunk's 24-unit height, so a same-chunk scan is enough), and cap
        // the rise at the first solid tile's bottom edge.
        let ceilingRow = 0;
        for (let ry = y; ry >= 0; ry--) {
          if (chunk.tiles[ry * chunkW + x] !== 0) { ceilingRow = ry + 1; break; }
        }
        const riseCapY = ceilingRow + yOffset;
        vents.push({ x: x + 0.5, y: y + yOffset + 0.9, riseCapY });
      }
    }
  }
  return vents;
}

/** Round-14 fix (round-13 review leftover, Daniel: "a plant must not sprout
 * out of an urchin"). `findPlantAnchors` picked its cells purely from tile
 * data, with no idea an enemy slot (urchin/cannon/horns/crab/...) had
 * already claimed a cell right next to it -- `findWallCritters` above
 * already skips a slot's own cell for the wall-critter layer via
 * `enemySlotCellSet`, but the foreground-plant anchors never got the same
 * treatment, so a floor/ceiling anchor could land within a tile of a static
 * emplacement and the plant would visually sprout out of it. Checks a full
 * 3x3 neighbourhood (Chebyshev distance <=1, "~1 tile" per the brief) around
 * the anchor's OWN tile against every enemy-slot cell in the chunk -- cheap
 * (slot counts are single digits per chunk, gen.js's `slotCount`) and run
 * once per anchor candidate. */
function nearEnemySlot(chunk, tx, ty) {
  if (!chunk.spawns) return false;
  for (const s of chunk.spawns) {
    if (s.type !== 'enemy-slot' && s.type !== 'hazard' && s.type !== 'loot') continue;
    const sx = Math.floor(s.x), sy = Math.floor(s.y);
    if (Math.abs(sx - tx) <= 1 && Math.abs(sy - ty) <= 1) return true;
  }
  return false;
}

/**
 * r37: the same test for a plant that GROWS (floor: up, ceiling: down) from the rock tile (tx, ty): the sprite is up to
 * PLANT_REACH tiles long, so an enemy, hazard or loot anchor within one tile sideways of that stretch is overlapped
 * by it (seed 32 level 1: a ceiling plant hung straight down into the anemone below it).
 */
const PLANT_REACH = 3;
export function plantBlockedBySlot(chunk, tx, ty, onCeiling) {
  if (!chunk.spawns) return false;
  for (const s of chunk.spawns) {
    if (s.type !== 'enemy-slot' && s.type !== 'hazard') continue; // (loot sits on the floor and is small: the old one-tile ring is enough)
    const sx = Math.floor(s.x), sy = Math.floor(s.y);
    if (Math.abs(sx - tx) > 1) continue;
    const d = onCeiling ? sy - ty : ty - sy; // tiles from the rock tile towards the plant's tip
    if (d >= -1 && d <= PLANT_REACH) return true;
  }
  return false;
}

/** Round-12 "fill the cave" pass, density test support: the same anchor
 * cells + hash gate render.js's `drawPlants` uses for floor/ceiling foliage
 * (plant1/plant2.webp), factored out here as a pure function of chunk tile
 * data so `decor.test.js` can assert on real density/placement numbers
 * without needing a canvas. Returns `{tx, ty, onCeiling}` local-tile anchors
 * only (render.js still owns the actual draw position/size/clustering) --
 * every entry is guaranteed `onFloor`/`onCeiling`-consistent with the tile
 * grid (solid at the anchor cell, open on the side the sprite grows toward),
 * i.e. never "floating" or anchored with its growth side inside rock, and
 * (round 14) never within a tile of a static enemy-slot emplacement.
 */
export function findPlantAnchors(chunk, chunkW, chunkH, chunkIndex = 0) {
  const out = [];
  for (let ty = 1; ty < chunkH - 1; ty++) {
    for (let tx = 1; tx < chunkW - 1; tx++) {
      if (chunk.tiles[ty * chunkW + tx] === 0) continue; // must itself be solid
      const h = hash2(chunkIndex * 733 + tx * 131, ty * 977 + chunkIndex);
      // r44: the cheap gates first (the hash, then open water on the growing side: most solid tiles are inside the rock); the keep-outs and the
      // enemy-slot scan, which cost a pass over the chunk's spawns per tile, only for the few tiles that passed them. Same set as before: every test must pass.
      if (h % 3 !== 0 && h % (chunk.v2 ? 5 : 7) !== 0) continue;
      if (chunk.tiles[(ty - 1) * chunkW + tx] !== 0 && chunk.tiles[(ty + 1) * chunkW + tx] !== 0) continue;
      const nf = chunk.plantFree; // v2: the shop stall (counter span plus a margin) grows no foliage
      if (nf && tx >= nf.x0 && tx < nf.x1 && ty >= nf.y0 && ty < nf.y1) continue;
      const pf = chunk.plantKeepOut; // round 27: no foliage behind the exit ring or the hub's rings
      if (pf && pf.some((r) => tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1)) continue;
      if (nearEnemySlot(chunk, tx, ty)) continue; // round-13 review: no plant on an urchin/cannon/horns
      const openAbove = chunk.tiles[(ty - 1) * chunkW + tx] === 0;
      const openBelow = chunk.tiles[(ty + 1) * chunkW + tx] === 0;
      // Round-17 fix (Daniel's screenshot review: "a vine placed in a
      // 1-tile-high notch grows from the notch floor all the way up to the
      // notch ceiling, top leaves pressed against the rim -- looks cramped
      // and wedged in"). The sprite is drawn at a fixed height regardless of
      // how much open space is actually above/below the anchor, so a floor
      // anchor whose ceiling is only 1 tile up (or a ceiling anchor whose
      // floor is only 1 tile down) has nowhere for the plant to taper before
      // hitting rock. Require a second open tile beyond the immediate one in
      // the growth direction (out-of-bounds treated as open -- open water
      // continuing past this chunk's edge is never the notch this guards
      // against) so a plant only ever anchors where it actually has room.
      const clearAbove = ty - 2 < 0 || chunk.tiles[(ty - 2) * chunkW + tx] === 0;
      const clearBelow = ty + 2 >= chunkH || chunk.tiles[(ty + 2) * chunkW + tx] === 0;
      if (openAbove && clearAbove && h % 3 === 0) { if (!chunk.v2 || !plantBlockedBySlot(chunk, tx, ty, false)) out.push({ tx, ty, onCeiling: false, hash: h }); }
      else if (openBelow && clearBelow && h % (chunk.v2 ? 5 : 7) === 0) { if (!chunk.v2 || !plantBlockedBySlot(chunk, tx, ty, true)) out.push({ tx, ty, onCeiling: true, hash: h }); }
    }
  }
  // r36: foliage clusters the pattern table placed (kind 'decor', spawn 'foliage'): on ledges, platforms and floors,
  // under overhangs; the same keep-outs apply, and a cell the hash gate already chose is not doubled
  if (chunk.spawns) {
    const have = new Set();
    for (const a of out) have.add(a.ty * chunkW + a.tx);
    for (const s of chunk.spawns) {
      if (s.type !== 'decor' || s.dk !== 'foliage') continue;
      const tx = Math.floor(s.x), ty = Math.floor(s.y) - s.dy; // the rock tile under (or over) the anchor cell
      if (tx < 1 || tx >= chunkW - 1 || ty < 1 || ty >= chunkH - 1 || chunk.tiles[ty * chunkW + tx] === 0 || have.has(ty * chunkW + tx)) continue;
      const nf = chunk.plantFree;
      if (nf && tx >= nf.x0 && tx < nf.x1 && ty >= nf.y0 && ty < nf.y1) continue;
      const pf = chunk.plantKeepOut;
      if (pf && pf.some((r) => tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1)) continue;
      if (nearEnemySlot(chunk, tx, ty) || (chunk.v2 && plantBlockedBySlot(chunk, tx, ty, s.dy > 0))) continue;
      have.add(ty * chunkW + tx);
      out.push({ tx, ty, onCeiling: s.dy > 0, hash: hash2(chunkIndex * 733 + tx * 131 + 17, ty * 977 + chunkIndex) });
    }
  }
  return out;
}

/** Round-14 "fill the cave" pass: cluster-mate offsets for a floor anchor
 * from `findPlantAnchors`, factored out as a pure function (same reasoning
 * as `findPlantAnchors` itself) so `decor.test.js` can assert on real
 * cluster sizes/safety without a canvas, and so render.js only has to turn
 * validated tile offsets into a draw call. Each candidate slot is
 * independently hash-gated (~2/3 chance) and re-checked against the tile
 * grid -- a cap/open-side pair just like the anchor itself needs -- so a
 * cluster only ever grows along a real flat run, never past its end or
 * across a corner into rock. Ceiling anchors get no cluster-mates (the
 * brief's clusters are a floor-growth behaviour; a dense hanging cluster
 * was never asked for and doubles up on the ceiling vine's own single-strand
 * read). Returns `{dx, hash}` offsets only; render.js maps `hash` to an art
 * variant/size the same way it already does for the anchor sprite. */
export function findClusterMates(chunk, chunkW, chunkH, tx, ty, onCeiling, anchorHash) {
  if (onCeiling) return [];
  const mateSlots = [-1, 1, -2];
  const out = [];
  for (let i = 0; i < mateSlots.length && out.length < 3; i++) {
    const h2 = hash2(anchorHash + 37 + i * 53, anchorHash * 7 + i);
    if (h2 % 3 === 0) continue; // ~2/3 chance per slot -> clusters of 2-4 incl. the anchor
    const nx = tx + mateSlots[i];
    if (nx < 1 || nx >= chunkW - 1) continue;
    if (chunk.tiles[ty * chunkW + nx] === 0) continue; // no floor cap there
    if (chunk.tiles[(ty - 1) * chunkW + nx] !== 0) continue; // that side isn't open -- would grow into rock
    if (chunk.v2 && plantBlockedBySlot(chunk, nx, ty, false)) continue; // r37: a cluster mate never grows into an enemy or hazard
    out.push({ dx: mateSlots[i], hash: h2 });
  }
  return out;
}

/**
 * Side-wall anchors for the wall foliage (the original's FoliagePattern03: water beside rock; FoliagePlant25 coral,
 * FoliagePlant7 drooping leaves). The rock tile (tx, ty) faces water on side -dir (dir +1 = rock right of the water)
 * and the face continues one tile above and below, so the plant sits on a flat stretch, never on a corner. Same
 * keep-outs as the floor and ceiling anchors; hash-gated (about 1 in 5) and at least 3 tiles apart on a face. Returns {tx, ty, dir}.
 */
export function findWallAnchors(chunk, chunkW, chunkH, chunkIndex = 0) {
  const out = [];
  const T = (x, y) => x < 0 || y < 0 || x >= chunkW || y >= chunkH || chunk.tiles[y * chunkW + x] !== 0;
  const nf = chunk.plantFree, pf = chunk.plantKeepOut;
  for (let ty = 2; ty < chunkH - 2; ty++) {
    for (let tx = 1; tx < chunkW - 1; tx++) {
      if (!T(tx, ty)) continue;
      for (const dir of [1, -1]) {
        const wx = tx - dir;
        if (T(wx, ty) || !T(tx, ty - 1) || !T(tx, ty + 1) || T(wx, ty - 1) || T(wx, ty + 1)) continue;
        if (T(wx - dir, ty)) continue; // at least two tiles of water in front: never wedged into a one-tile shaft
        const h = hash2(chunkIndex * 977 + tx * 37 + (dir > 0 ? 11 : 0), ty * 613 + chunkIndex);
        if (h % 5 !== 0) continue;
        // never a column of them: at least three tiles to the next one on the same face
        if (out.some((a) => a.tx === tx && a.dir === dir && ty - a.ty < 3)) continue;
        if (nf && wx >= nf.x0 && wx < nf.x1 && ty >= nf.y0 && ty < nf.y1) continue;
        if (pf && pf.some((r) => wx >= r.x0 && wx < r.x1 && ty >= r.y0 && ty < r.y1)) continue;
        if (nearEnemySlot(chunk, tx, ty) || nearEnemySlot(chunk, wx, ty)) continue;
        out.push({ tx, ty, dir });
      }
    }
  }
  return out;
}

export function createDecor(chunkW, chunkH) {
  /** @type {Map<number, {vents:{x:number,y:number}[], bubbles:{x:number,y:number,t:number}[]}>} */
  const byChunk = new Map();

  function ensureChunk(ci, chunk, yOffset) {
    if (byChunk.has(ci)) return byChunk.get(ci);
    const vents = findVents(chunk, yOffset, chunkW, chunkH);
    const bubbles = vents.map((v, i) => ({ x: v.x, y: v.y, t: (i * BUBBLE_LIFETIME) / (vents.length || 1) }));
    const critters = findWallCritters(chunk, yOffset, chunkW, chunkH, ci).concat(patternRunes(chunk, yOffset, chunkW));
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
          const riseY = Math.max(vent.y - progress * BUBBLE_RISE_SPEED * BUBBLE_LIFETIME, vent.riseCapY);
          out.push({ x: vent.x + Math.sin(b.t * 2 + i) * 0.15, y: riseY, alpha: 1 - progress * 0.6 });
        }
      }
      return out;
    },
    /** Static (position/kind/phase) wall-critter instances for every
     * resident chunk; decor-draw.js animates them per-frame from `time` and
     * each one's own `phase`, so nothing here needs per-frame state. */
    visibleCritters(resident) {
      const out = [];
      for (const { index, chunk } of resident) {
        const entry = byChunk.get(index);
        if (!entry) continue;
        for (const c of entry.critters) {
          if (c.support !== undefined && chunk.tiles[c.support] === 0) continue; // its rock was bombed away
          if (c.kind === 'fish' && isAmbientDead(c.x, c.y)) continue; // inked (ambient.js)
          out.push(c);
        }
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
