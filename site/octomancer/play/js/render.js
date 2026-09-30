// Rendering: camera, per-chunk baked walls (dirty-flag cache) built from
// Milan's marching-squares-style wall tileset, background (a deep-water
// gradient plus a single non-repeating cave silhouette anchored near the
// surface, matching the title screen), plants anchored to floor surfaces,
// pickups (plankton/shells), bubbles, the depth tint, and the octopus
// behind the drawOctopus() interface.
// OVERNIGHT.md §2 "Rendering" (M1-2) and §2 "World" / M2-2/M2-3 (chunked
// render cache, decor, pickups, depth tint).
//
// Visual pass (this session, per Daniel's screenshot review): the wall bake
// had picked the wrong two tiles from Milan's set -- `tile-0` (a lone
// green-rimmed circle, meant for an isolated 1-tile island) as the universal
// fill, and `tile-1` (fully solid, meant for a tile with no exposed edges at
// all) rotated onto every exposed side. That is exactly backwards, and is
// why walls rendered as a dense grid of dark circles instead of Milan's
// actual rounded-cave art. Fixed by picking the tile that matches each
// tile's real exposed-edge shape (see `pickWallArt` below) and procedurally
// rounding the remaining concave (inner) corners the tileset itself doesn't
// have a piece for. The background swap and plant floor-anchoring are
// separate fixes logged inline below.
//
// Texture pass (earlier session, per Daniel): the walls read as flat single-tone
// shapes -- no rock surface detail. In the Unity original this came from
// `Assets/Shaders/My shaders/Map/SquidTilemap.shader`'s `SamplePerlinTexture`,
// which tiles a set of fBm-noise textures (baked by
// `Assets/Scripts/Shaders/CreatePerlinTexture.cs` /
// `PerlinComputeShader.compute`'s `fbm()`: value noise, several octaves,
// lacunarity/gain falloff, `pow(v*0.5+0.5, power)` for contrast) across the
// sprite UV and blends them onto the tile colour with an Overlay-style blend
// (`OverlayC`) tinted by `_PerlinTex_Color`; `OverlayProcessor` composites a
// second Perlin pass as a soft mask for other surfaces. Replicated here with
// `generateFbmField` (same value-noise-with-smoothstep-interpolation shape,
// baked once into a seamless tileable field -- lattice frequencies wrap
// modulo themselves so the texture tiles exactly) and two palette lookups
// (`buildNoiseTexture`) painted onto each chunk's wall canvas with
// `source-atop` so it only lands on already-opaque rock pixels, once at bake
// time (no per-frame shader cost, and no animated blend weights -- the
// original's `_SinTime`/`_CosTime` shimmer is dropped as unnecessary per-frame
// cost for a static rock surface). Soft/breakable rock reuses the identical
// field through a coral-tinted lookup so both textures line up pixel-for-
// pixel with the rock's own grain.
//
// Video-match pass (this session, per Daniel: "that is not really anything
// like the video" -- comparing against octo-video-{hero,hub,cave-urchin,
// fish-swarm}.webp in site/img/octomancer/video/). Sampling those frames
// pixel-by-pixel (see the render task notes) found the actual look is much
// simpler than what was baked here: a flat navy-blue rock fill (~rgb(34,56,
// 112), not the near-black/dark-teal it was), Milan's existing teal-green rim
// art basically as-is (~rgb(8,104,88), the old RIM_COLOR was already close),
// and a bright flat cyan background (~rgb(120,235,248)) instead of the
// near-black gradient this file had -- the promo footage barely darkens with
// depth at all in these frames. Milan's tile art (`tiles/tile-*.webp`) is
// drawn with a pure-black fill and the green rim baked in; `recolorWallTile`
// below remaps just the near-black fill pixels to the navy fill once per tile
// image (not per chunk, not per frame) so the rim art is untouched. The fBm
// texture pass is kept (Daniel's shader ground-truth note still applies) but
// dialled way down -- low alpha, tinted as navy-on-navy variation instead of
// a contrasting teal speckle -- since the reference frames read as close to
// flat at this art style's resolution; a loud grain was fighting the video
// look as much as the wrong base colour was.

import { updateCamera, worldToScreen } from './camera.js';
import { drawOctopus } from './octopus-draw.js';
import { depthTint, findPlantAnchors, findClusterMates } from './decor.js';
import { drawEnemies, drawBombs, drawParticles } from './enemy-draw.js';
import { drawCritters } from './decor-draw.js'; // Otter's "alive pass" wall critters, NIGHT-LOG.md
import { prefersReducedMotion } from './config.js';
import { wallBandWindow } from './world-v2.js';

const ASSET = (name) => new URL(`../assets/${name}`, import.meta.url).href;

// Round-3 fix (Daniel's screenshot review: "on desktop retina the rim is
// visibly stair-stepped and soft, because walls are baked at 48px/tile and
// upscaled to about 74 device px/tile"). Baking at a fixed 48px/tile was
// already coarser than a typical desktop's own device pixels even at 1x
// zoom, and DPR 2 (`devicePixelRatio`) doubles that again. Scale the bake
// resolution by the page's own DPR (capped so a stray DPR 3-4 display, or a
// very zoomed-in view, doesn't blow up chunk canvas memory -- each one is
// already `32 x 24` tiles).
export const WALL_BAND_PX = 512; // v2 wall cache band height, baked px
const BAKE_PX_PER_UNIT = Math.min(96, Math.round(48 * (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1)));

// The cave silhouette fades out by this world depth, below which the deep
// gradient (plus the existing depth tint / caustics / vignette) carries the
// mood on its own -- comfortably inside a typical run, so it's drawn once in
// world space (never tiled) and simply never comes back once passed.
// Round-6 fix (reviewer leftover, NIGHT-LOG.md task 6: "the cave-mouth
// background art shows hard-edged ghost silhouettes (chest, tentacle) in
// open water: blur it and fade it out by ~15m"). FADE_START/END (30/130)
// used to keep the art fully solid all the way to depth 30 -- well past
// where the octopus has already swum out into open water and enemies start
// spawning (ENEMY_MIN_DEPTH=40) -- so its foreground silhouettes (a
// treasure chest, a stray tentacle, both drawn crisp/opaque in the source
// art) kept reading as solid shapes sitting IN the water long after the
// player had swum well past the cave mouth itself, rather than as distant
// background. Fading out by depth 15 keeps the mouth readable right at
// spawn but has it gone within a few seconds of diving.
const CAVE_ART_FADE_START = 2;
const CAVE_ART_FADE_END = 15;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

export function createRenderer(ctx, world) {
  // Wall rendering (round-7 rewrite -- Daniel's screenshot review round 6,
  // item 1/2/6): walls used to be assembled from Milan's per-tile marching-
  // squares tileset (`play/assets/tiles/tile-*.webp`, picked by
  // `pickWallArt`) plus a procedural cap (`drawNubTile`) for 1-wide stubs and
  // a procedural wedge (`carveConcaveCorner`) for inward corners. Each piece
  // carried its OWN rim stroke, composited edge-to-edge against its
  // neighbours' own rim strokes -- at a stub or a concave corner those two
  // independently-drawn rims never quite lined up (a doubled rim, a notch of
  // water, or the tile's own square corner peeking through), exactly the
  // "lollipop nub" and "rim break" bugs the review kept catching across
  // rounds 4-6. Replaced with the fix the round-6 log deferred: trace ONE
  // continuous outline per connected solid region with a grid boundary walk
  // (the tile-grid analogue of marching squares -- see `traceWallOutlines`),
  // smooth it with a few Chaikin corner-cutting passes (`chaikinSmoothLoop`)
  // so every corner, convex or concave, rounds the same continuous way a
  // stretch of straight rim does, then fill and stroke that single path once
  // per chunk. A 1-wide stub is just a few extra points on the same path --
  // there is no separate piece to seam against its neighbour, and no per-
  // tile art to keep in sync, so Milan's `tiles/tile-*.webp` set is no longer
  // loaded for walls (see ASSETS.md).
  // Round-8 fix (Daniel's screenshot review round 7, item 2: "rock look:
  // fewer/tighter smoothing... slightly lighter slate-blue rock with more
  // visible texture/cracks; constant-width mint rim"). Nudged lighter/more
  // slate (was a flatter navy) and the rim brightened toward mint (was a
  // darker, more muted teal) -- both still close to the promo-video-sampled
  // values above them in history, just per this round's review.
  const WALL_FILL_COLOR = [58, 84, 142]; // lighter slate-blue (was [34,56,112])
  const RIM_TARGET = [70, 205, 165]; // brighter mint-green rim (was [25,109,94])
  const caveArt = loadImage(ASSET('bg-cave.webp'));
  // Feathered once the source image loads: the raw art is a bright cave
  // mouth on a big flat near-black rectangle, and even under a 'screen'
  // blend that flat area is dark-teal (not literal black), so drawing it
  // straight left a visible rectangular seam at its edge (Daniel's
  // screenshot review). Baking a vertical fade into an offscreen copy once,
  // instead of redoing the gradient every frame, keeps this cheap.
  let caveArtFeathered = null;
  caveArt.addEventListener('load', () => {
    const fc = document.createElement('canvas');
    fc.width = caveArt.naturalWidth;
    fc.height = caveArt.naturalHeight;
    const fctx = fc.getContext('2d');
    // Round-6 fix (reviewer leftover, task 6): "shows hard-edged ghost
    // silhouettes (chest, tentacle) in open water: blur it". The source art
    // draws its foreground shapes (a treasure chest, a stray tentacle) with
    // crisp, fully-opaque edges -- fine as a hero background image, but once
    // composited over open water at low alpha near the end of its fade those
    // same crisp edges read as flat, hard-edged silhouettes floating in the
    // water rather than distant, out-of-focus background. A blur pass at
    // bake time (native resolution, before the radial feather below, so the
    // feather's own edge stays soft too) reads as "distant/out of focus"
    // instead.
    fctx.filter = 'blur(10px)';
    fctx.drawImage(caveArt, 0, 0);
    fctx.filter = 'none';
    fctx.globalCompositeOperation = 'destination-in';
    // A radial fade (rather than a vertical one) so every edge -- top,
    // bottom, left and right -- softens the same way; a straight edge in
    // any one direction is exactly the seam this is fixing. Centred and
    // sized so alpha is already 0 well inside the canvas rectangle.
    const cx = fc.width / 2, cy = fc.height / 2;
    const inner = Math.min(fc.width, fc.height) * 0.22;
    const outer = Math.max(fc.width, fc.height) * 0.52;
    const fade = fctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = fade;
    fctx.fillRect(0, 0, fc.width, fc.height);
    caveArtFeathered = fc;
  }, { once: true });
  const plants = [loadImage(ASSET('plant1.webp')), loadImage(ASSET('plant2.webp'))];
  // Round-14 "fill the cave" pass: a third foliage variant for cluster-mates
  // only (never the primary anchor sprite, so `findPlantAnchors`'s own
  // solid/open checks -- which only know about the plant1/2 silhouette's
  // footprint -- still hold for the anchor itself). Reuses decor.js's
  // existing `bush2` art (already vetted floor-only, round-4/5/7 notes in
  // decor.js), not new art, so a floor cluster can mix a bush in alongside
  // the vine/frond plants per the brief ("clusters of 2-4 mixed items").
  const clusterBush = loadImage(ASSET('decor-bush2.webp'));
  const shellImgs = {
    blue: loadImage(ASSET('shell-blue.webp')),
    green: loadImage(ASSET('shell-green.webp')),
    red: loadImage(ASSET('shell-red.webp')),
  };
  const camera = { x: 0, y: 0, pxPerUnit: 32 };
  const chunkW = world.width, chunkH = world.chunkHeight;
  if (world.v2) world.configureBands(Math.max(2, Math.round(WALL_BAND_PX / BAKE_PX_PER_UNIT)));

  // --- Per-chunk baked wall cache, rebaked only when a chunk's tiles change
  // (bomb breaks) or when it is seen for the first time. ---
  /** @type {Map<number, {canvas:HTMLCanvasElement, bakedTiles:Uint8Array|null}>} */
  const wallCache = new Map();

  const RIM_COLOR = `rgba(${RIM_TARGET.join(',')},0.95)`;

  // Round-8 fix (Daniel's screenshot review round 7, item 1 -- SEVERE
  // regression -- and item 3, "collision must match the drawn outline"):
  // this used to trace + Chaikin-smooth the wall outline itself, right
  // here, using only the local chunk's own tile window; that duplicate
  // trace is exactly what produced the diagonal wedges/hairline slivers
  // (see outline.js's module comment for the root cause) and, separately,
  // could never match physics' own collision shape even after a fix, since
  // they'd be two independently-computed outlines. Both bugs are fixed by
  // tracing ONCE, in world.js (`getWallOutline`, backed by the shared
  // outline.js module), and having both this wall bake and physics.js's
  // collision read from that one cache. This just re-offsets/scales the
  // chunk's cached WORLD-space tile-unit loops into this canvas's own LOCAL
  // pixel space.
  function chunkLoopsPx(entry, s) {
    const outline = world.getWallOutline(entry.index);
    if (!outline) return [];
    return outline.loops.map((loop) => loop.map((p) => ({
      x: p.x * s,
      y: (p.y - entry.yOffset) * s,
    })));
  }

  function pathFromLoops(bctx, loops) {
    bctx.beginPath();
    for (const loop of loops) {
      bctx.moveTo(loop[0].x, loop[0].y);
      for (let i = 1; i < loop.length; i++) bctx.lineTo(loop[i].x, loop[i].y);
      bctx.closePath();
    }
  }

  // --- Wall surface texture: seamless fBm noise, baked once (Daniel's
  // "Perlin noise with masking" note on the Unity original -- see the
  // module-header comment above for the shader/compute-shader it mirrors).
  //
  // Value noise on an integer lattice, smoothstep-interpolated, several
  // octaves combined with lacunarity/gain falloff -- the same shape as the
  // original's `fbm()`. Seamless tiling comes for free: every lattice index
  // is taken modulo that octave's own frequency, so the noise at the far
  // edge of the field is hashed identically to the noise at x=0, and the
  // field is generated at a pixel size that is an exact divisor of both the
  // chunk width (32 tiles) and height (24 tiles) -- 8 tiles -- so tiling it
  // across a chunk canvas, and across chunk boundaries stacked in world
  // space, lines up exactly with no seam and no per-chunk offset needed.
  const NOISE_FIELD_TILES = 8; // world tiles per noise repeat (divides 32x24)
  const NOISE_FIELD_PX = NOISE_FIELD_TILES * BAKE_PX_PER_UNIT;
  const NOISE_BASE_FREQ = 6; // lattice cells across one repeat, octave 0
  const NOISE_OCTAVES = 4;
  const NOISE_LACUNARITY = 2;
  const NOISE_GAIN = 0.5;
  const NOISE_POWER = 1.3; // contrast, matches the original's `_power` remap

  function hash01(ix, iy, freq, seed) {
    const xi = ((ix % freq) + freq) % freq;
    const yi = ((iy % freq) + freq) % freq;
    let h = (xi * 374761393 + yi * 668265263 + seed * 2654435761) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return ((h >>> 0) / 4294967295) * 2 - 1; // [-1, 1]
  }
  function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerpN(a, b, t) { return a + (b - a) * t; }
  // fBm field, generated once into a plain array: value in [-1, 1] per texel
  // of a NOISE_FIELD_PX x NOISE_FIELD_PX square, x/y in [0,1) across it.
  function generateFbmField(size, seed) {
    const field = new Float32Array(size * size);
    for (let py = 0; py < size; py++) {
      const y = py / size;
      for (let px = 0; px < size; px++) {
        const x = px / size;
        let freq = NOISE_BASE_FREQ, amp = 1, sum = 0, norm = 0;
        for (let o = 0; o < NOISE_OCTAVES; o++) {
          const f = Math.round(freq);
          sum += amp * latticeNoise2(x, y, f, seed + o * 17);
          norm += amp;
          freq *= NOISE_LACUNARITY;
          amp *= NOISE_GAIN;
        }
        field[py * size + px] = norm > 0 ? sum / norm : 0;
      }
    }
    return field;
  }
  function latticeNoise2(x, y, freq, seed) {
    const gx = x * freq, gy = y * freq;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const v00 = hash01(ix, iy, freq, seed), v10 = hash01(ix + 1, iy, freq, seed);
    const v01 = hash01(ix, iy + 1, freq, seed), v11 = hash01(ix + 1, iy + 1, freq, seed);
    const tx = smooth(fx), ty = smooth(fy);
    const a = lerpN(v00, v10, tx), b = lerpN(v01, v11, tx);
    return lerpN(a, b, ty);
  }

  // Paints the fBm field into an RGBA canvas: `crevice` (low noise) to
  // `speckle` (high noise), the "masking" step from the original --
  // `pow(v*0.5+0.5, power)` for contrast, then alpha weighted toward the
  // extremes so mid-grey noise stays subtle and crevices/speckle read.
  function buildNoiseTexture(field, size, crevice, speckle, maxAlpha) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const nctx = canvas.getContext('2d');
    const img = nctx.createImageData(size, size);
    for (let i = 0, p = 0; i < field.length; i++, p += 4) {
      const v = field[i];
      const t = Math.pow(Math.min(1, Math.max(0, v * 0.5 + 0.5)), NOISE_POWER);
      img.data[p] = lerp(crevice[0], speckle[0], t);
      img.data[p + 1] = lerp(crevice[1], speckle[1], t);
      img.data[p + 2] = lerp(crevice[2], speckle[2], t);
      img.data[p + 3] = Math.round(maxAlpha * (0.35 + 0.65 * Math.abs(v)) * 255);
    }
    nctx.putImageData(img, 0, 0);
    return canvas;
  }

  const noiseField = generateFbmField(NOISE_FIELD_PX, 1337);
  // Rock: slate-blue variation (darker/lighter than WALL_FILL_COLOR) rather
  // than a contrasting teal speckle -- the promo-video reference frames read
  // as close to flat at this art style's resolution, so a loud grain fought
  // the video look as much as the old wrong base colour did. Kept (rather
  // than dropped) per Daniel's Unity-shader ground-truth note.
  // Round-8 fix (Daniel's screenshot review round 7, item 2: "more visible
  // texture/cracks"): widened the dark/light endpoints and raised the max
  // alpha (0.14 -> 0.22) so the crevice/speckle contrast actually reads as
  // rock grain/cracks up close instead of a near-flat tint.
  const rockNoiseCanvas = buildNoiseTexture(noiseField, NOISE_FIELD_PX, [12, 24, 58], [92, 128, 205], 0.22);
  // CanvasPattern only needs *a* 2D context to be created from, not the one
  // it will later be drawn into -- build the pattern once, up front.
  const patternCtx = document.createElement('canvas').getContext('2d');
  const rockNoisePattern = patternCtx.createPattern(rockNoiseCanvas, 'repeat');

  // Round-17 fix (Daniel's screenshot review, item 1: the round-15 feathered
  // soft-rock tint -- meant to read as a material patch -- instead showed up
  // as a lone, blurry brown/orange smudge about one tile across sitting
  // inside the dark rock, nothing like the promo video's distinct grey
  // boulder sprite for breakable rock. Every previous round (2, 8, 15) tried
  // tuning the tint's shape (flat rect -> feathered radial mask) rather than
  // its presence, and each attempt still read as "a circle painted on a
  // wall" per Daniel's item 4 on separately drawn art that isn't Milan's.
  // Simplest fix, and consistent with removing art that isn't Milan's
  // (round 16's pearl removal): stop tinting soft rock at all. It now bakes
  // identically to normal rock (same fill/rim/grain); breakable tiles are
  // still tracked and still break on hit (`world.js`/`enemies.js` own that
  // logic independently of how the tile is drawn) -- there just isn't a
  // visual cue distinguishing them up front, matching the video's own look.
  //
  // (Removed: `coralNoiseCanvas`/`coralNoisePattern`, `softMaskCanvas`,
  // `softTileScratch`/`softTileScratchCtx`, and `paintSoftTile` -- all of
  // which existed only to build/composite this tint.)

  // Paints a seamless noise pattern onto already-opaque wall pixels only
  // (`source-atop`), offset so it tiles across chunk boundaries in world
  // space -- see the NOISE_FIELD_TILES comment above.
  function paintNoise(bctx, entry, pattern, canvas, rectX, rectY, rectW, rectH) {
    bctx.save();
    bctx.globalCompositeOperation = 'source-atop';
    const offPx = ((entry.yOffset * BAKE_PX_PER_UNIT) % canvas.height + canvas.height) % canvas.height;
    bctx.translate(0, -offPx);
    bctx.fillStyle = pattern;
    bctx.fillRect(rectX, rectY + offPx, rectW, rectH);
    bctx.restore();
  }

  // Shared wall-art pass: fill + rim from already-px loops, clipped to the
  // canvas, then the seamless noise grain. `yOffsetTiles` is the world row
  // the canvas top sits at (so the noise tiles across neighbouring canvases).
  function paintWallCanvas(canvas, loops, yOffsetTiles) {
    const bctx = canvas.getContext('2d');
    const s = BAKE_PX_PER_UNIT;
    bctx.clearRect(0, 0, canvas.width, canvas.height);
    // Fill + rim: one traced-and-smoothed outline per connected solid
    // region (world.js's `getWallOutline`, backed by outline.js -- see
    // `chunkLoopsPx` above), instead of per-tile art pieces each carrying
    // their own rim stroke. Round-1 fix (Daniel's screenshot review: the
    // horizontal seam / "wall borders look broken") still applies inside
    // `getWallOutline`: a tile's row above/below a chunk boundary asks the
    // real world tile (crossing into the neighbouring chunk via
    // `world.tileAt`) instead of assuming solid, so passages that continue
    // into the next chunk don't bake a spurious closed rim cap across them;
    // left/right of the chunk is still always solid (the level's real outer
    // border, not a chunk seam).
    //
    // Round-8 fix (item 1, SEVERE regression): `getWallOutline`'s trace
    // pads beyond this chunk's own tile bounds (see outline.js) so a loop
    // that spans the seam still closes correctly -- which means its points
    // can fall outside this canvas's own 0..width x 0..height rect. Clip to
    // that rect before filling/stroking so the off-canvas part of a loop
    // (there for correctness, not for this chunk to draw) never paints.
    bctx.save();
    bctx.beginPath();
    bctx.rect(0, 0, canvas.width, canvas.height);
    bctx.clip();
    bctx.fillStyle = `rgb(${WALL_FILL_COLOR.join(',')})`;
    pathFromLoops(bctx, loops);
    bctx.fill('nonzero');
    bctx.strokeStyle = RIM_COLOR;
    bctx.lineWidth = s * 0.1;
    bctx.lineJoin = 'round';
    bctx.lineCap = 'round';
    pathFromLoops(bctx, loops);
    bctx.stroke();
    bctx.restore();

    // Round-17 fix: soft (breakable) rock no longer gets any tint/texture
    // pass of its own -- see the comment above (the removed
    // `paintSoftTile`/`coralNoise*` block) for why. It bakes through the
    // same fill/rim/grain as every other wall tile below.
    //
    // Surface texture pass, baked once here (never per-frame): the seamless
    // fBm field masked onto every opaque wall pixel via source-atop.
    paintNoise(bctx, { yOffset: yOffsetTiles }, rockNoisePattern, rockNoiseCanvas, 0, 0, canvas.width, canvas.height);
  }

  function bakeChunkWalls(entry) {
    const { chunk } = entry;
    let canvas = wallCache.get(entry.index)?.canvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = chunkW * BAKE_PX_PER_UNIT;
      canvas.height = chunkH * BAKE_PX_PER_UNIT;
    }
    paintWallCanvas(canvas, chunkLoopsPx(entry, BAKE_PX_PER_UNIT), entry.yOffset);
    wallCache.set(entry.index, { canvas, bakedTiles: chunk.tiles.slice() });
  }

  // --- v2 single-level walls (world-v2.js): the wall art is cached in
  // horizontal bands of about WALL_BAND_PX baked pixels. Only the bands on
  // screen plus one on each side stay cached (`wallBandWindow`); a bomb
  // rebakes just the bands whose outline changed, at most one per frame
  // beyond the ones needed on screen, so no single frame pays for a whole
  // blast crossing several bands.
  const bandCache = new Map(); // band -> {canvas, version}
  let bandBakes = 0; // total bakes, for tests / perf checks
  let bandBakeMaxMs = 0, bandBakeLastMs = 0; // slowest / latest single band bake
  function bandLoopsPx(bi, y0) {
    const outline = world.getWallOutline(bi);
    if (!outline) return [];
    const s = BAKE_PX_PER_UNIT;
    return outline.loops.map((loop) => loop.map((p) => ({ x: p.x * s, y: (p.y - y0) * s })));
  }
  function bakeBand(bi) {
    const rows = world.bandRows, y0 = bi * rows, h = Math.min(rows, world.height - y0);
    let entry = bandCache.get(bi);
    let canvas = entry && entry.canvas;
    const wantH = h * BAKE_PX_PER_UNIT;
    if (!canvas || canvas.height !== wantH) {
      canvas = document.createElement('canvas');
      canvas.width = chunkW * BAKE_PX_PER_UNIT;
      canvas.height = wantH;
    }
    const t0 = performance.now();
    paintWallCanvas(canvas, bandLoopsPx(bi, y0), y0);
    bandCache.set(bi, { canvas, version: world.bandVersion(bi) });
    bandBakes++;
    bandBakeLastMs = performance.now() - t0;
    if (bandBakeLastMs > bandBakeMaxMs) bandBakeMaxMs = bandBakeLastMs;
  }
  function drawBandWalls(canvasW, canvasH) {
    const rows = world.bandRows, n = world.bandCount();
    const halfH = canvasH / 2 / camera.pxPerUnit;
    const win = wallBandWindow(camera.y - halfH, camera.y + halfH, rows, n);
    for (const bi of [...bandCache.keys()]) if (bi < win.keepFrom || bi > win.keepTo) bandCache.delete(bi);
    let budget = 1;
    // Visible bands first: a missing one must bake now; a stale one (bomb) may
    // keep drawing its old canvas one more frame if the budget is spent.
    for (let bi = win.visFrom; bi <= win.visTo; bi++) {
      const c = bandCache.get(bi);
      if (!c) bakeBand(bi);
      else if (c.version !== world.bandVersion(bi) && budget > 0) { bakeBand(bi); budget--; }
    }
    for (let bi = win.keepFrom; bi <= win.keepTo && budget > 0; bi++) {
      if (bi >= win.visFrom && bi <= win.visTo) continue;
      const c = bandCache.get(bi);
      if (!c || c.version !== world.bandVersion(bi)) { bakeBand(bi); budget--; }
    }
    for (let bi = win.visFrom; bi <= win.visTo; bi++) {
      const c = bandCache.get(bi);
      if (!c) continue;
      const y0 = bi * rows, y1 = Math.min(world.height, y0 + rows);
      const tl = worldToScreen(camera, canvasW, canvasH, 0, y0);
      const br = worldToScreen(camera, canvasW, canvasH, chunkW, y1);
      const sx0 = Math.round(tl.x), sy0 = Math.round(tl.y);
      ctx.drawImage(c.canvas, sx0, sy0, Math.round(br.x) - sx0, Math.round(br.y) - sy0);
    }
  }

  function getBakedWalls(entry) {
    const cached = wallCache.get(entry.index);
    if (!cached || entry.chunk.dirty) {
      bakeChunkWalls(entry);
      entry.chunk.dirty = false;
      return wallCache.get(entry.index).canvas;
    }
    return cached.canvas;
  }

  // --- Drifting code value-noise layer (small offscreen canvas, generated once) ---
  const NOISE_SIZE = 128;
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = noiseCanvas.height = NOISE_SIZE;
  const noiseCtx = noiseCanvas.getContext('2d');
  (function generateNoise() {
    const img = noiseCtx.createImageData(NOISE_SIZE, NOISE_SIZE);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 10 + Math.random() * 18;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    noiseCtx.putImageData(img, 0, 0);
  })();

  function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

  // Deep-water gradient: darkens and desaturates with world depth so the
  // background stays calm and low-contrast at any point in a run, screen-top
  // to screen-bottom for an immediate sense of depth even before the depth
  // tint (decor.js) kicks in. Replaces the old bg-far.webp tiling strip,
  // which was too bright/saturated and showed a visible seam every 40 units.
  //
  // Video-match: the previous stops (a near-black dark-teal gradient) were
  // nowhere near the promo footage -- pixel sampling every reference frame
  // (hero/hub/cave-urchin/fish-swarm) found a flat bright cyan
  // (~rgb(120,235,248)) that barely darkens with depth at all in-clip. Kept
  // the existing depth falloff shape (still goes dark at extreme depth, for
  // gameplay readability) but recalibrated both endpoints to start from that
  // bright cyan instead of the old near-black base.
  // Round-3 fix (Daniel's screenshot review: "the water is noticeably darker
  // and more muted than the video: median (99,197,213) at spawn, against the
  // video's flat bright cyan (132,253,251)"). Both gradient stops nudged
  // brighter so the shallow-water median lands on the video's measured
  // colour instead of undershooting it; the depth-darkening falloff itself
  // (still goes dark at extreme depth, for gameplay readability) is unchanged.
  function drawBackground(canvasW, canvasH, time, depth) {
    const t = Math.min(1, depth / 400);
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, `rgb(${lerp(140, 20, t)},${lerp(252, 46, t)},${lerp(252, 76, t)})`);
    grad.addColorStop(1, `rgb(${lerp(118, 10, t)},${lerp(230, 26, t)},${lerp(238, 46, t)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    drawCaveArt(canvasW, canvasH, depth);
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.globalCompositeOperation = 'overlay';
    const nSize = 256;
    const nx = (time * 6) % nSize;
    const ny = (time * 3) % nSize;
    for (let y = -ny - nSize; y < canvasH; y += nSize) {
      for (let x = -nx - nSize; x < canvasW; x += nSize) {
        ctx.drawImage(noiseCanvas, x, y, nSize, nSize);
      }
    }
    ctx.restore();
  }

  // Milan's cave-mouth art (same file as the title screen, so Start Game's
  // zoom lands on a matching look): drawn ONCE in world space near the start
  // pool, slow parallax, never tiled -- it simply scrolls out of view and
  // fades by CAVE_ART_FADE_END, rather than repeating down the whole run.
  const CAVE_ART_ASPECT = 2560 / 1440;
  const CAVE_ART_ANCHOR_Y = 14; // world y of the art's vertical centre
  function drawCaveArt(canvasW, canvasH, depth) {
    if (!caveArtFeathered || depth >= CAVE_ART_FADE_END) return;
    const alpha = depth <= CAVE_ART_FADE_START
      ? 1
      : 1 - (depth - CAVE_ART_FADE_START) / (CAVE_ART_FADE_END - CAVE_ART_FADE_START);
    const parallax = 0.35;
    const worldW = Math.max(34, (canvasW / camera.pxPerUnit) * 1.3);
    const worldH = worldW / CAVE_ART_ASPECT;
    const cx = canvasW / 2 + (chunkW / 2 - camera.x) * camera.pxPerUnit;
    const cy = canvasH / 2 + (CAVE_ART_ANCHOR_Y - camera.y * parallax) * camera.pxPerUnit;
    const w = worldW * camera.pxPerUnit, h = worldH * camera.pxPerUnit;
    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    // 'screen' so the art's own near-black canvas (outside its cave-mouth
    // silhouette) contributes nothing -- only its lighter tones lift the
    // gradient -- instead of painting a visible rectangular seam over it.
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(caveArtFeathered, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  // Round-12 "fill the cave" pass, section 2: background ambient layer --
  // distant plant silhouettes behind everything (walls draw over this, same
  // as drawCaveArt/drawBackground before it), with their own slower
  // parallax so they read as farther away than the foreground foliage, plus
  // a handful of slow drifting motes (distinct from decor.js's vent bubbles
  // -- those rise from a fixed vent and pop; these just drift, ambient dust/
  // plankton in the water column). Both darken and fade out with depth,
  // same falloff shape as drawBackground's own gradient. Deterministic per
  // chunk (own tiny LCG, `ambientRng`) so nothing here needs a persistent
  // RNG stream to stay in sync across re-renders.
  const AMBIENT_PARALLAX = 0.5; // < 1: scrolls slower than the foreground -> reads farther back
  function ambientRng(seed) {
    let m = seed >>> 0 || 1;
    return () => { m = (m * 1664525 + 1013904223) >>> 0; return m / 4294967296; };
  }
  // Baked once per plant image (not a per-frame `ctx.filter` -- decor-draw.js's
  // round-7 note already found a filter graph reads soft/blurry and costs a
  // rasterize pass per draw; a plain `source-atop` darken, cached, is free at
  // draw time and stays crisp) so the many silhouette instances below are
  // ordinary `drawImage` calls.
  const ambientSilCache = [];
  // Round-13 fix (Daniel's screenshot review round 12, item 2: "the depth
  // cue is backwards -- background silhouettes read darker and heavier
  // than the pale foreground rim foliage, video shows the opposite"). This
  // used to tint toward near-black cave rock (rgba(2,10,16,0.88)), which at
  // the layer's own draw-time alpha (silAlpha below) still reads as a
  // saturated dark shape against the bright shallow-water gradient
  // (drawBackground: ~rgb(140,252,252) at the surface). Tinting toward that
  // same pale water colour instead -- and at a lower fill alpha so some of
  // the source art's own shading survives the tint -- keeps it low-contrast
  // and washed-out like the pale background weeds in the promo footage
  // (octo-video-cave-urchin.webp) rather than a bold silhouette.
  const AMBIENT_TINT = 'rgba(150,215,220,0.6)';
  function getAmbientSilhouette(i) {
    if (ambientSilCache[i]) return ambientSilCache[i];
    const img = plants[i];
    if (!img.complete || !img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0);
    cctx.globalCompositeOperation = 'source-atop';
    cctx.fillStyle = AMBIENT_TINT;
    cctx.fillRect(0, 0, c.width, c.height);
    // Fade the tinted sprite to fully transparent over its bottom third so
    // no cut-off stem end shows once it's anchor-tucked into a floor tile
    // the same way the foreground plants are (see drawAmbientBackground
    // below) -- matches PLANT_INTO_WALL's "hide the faded root under the
    // rim" trick without needing a second baked variant per anchor depth.
    cctx.globalCompositeOperation = 'destination-in';
    const fade = cctx.createLinearGradient(0, c.height * 0.62, 0, c.height);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = fade;
    cctx.fillRect(0, c.height * 0.62, c.width, c.height * 0.38);
    ambientSilCache[i] = c;
    return c;
  }
  function parallaxScreen(canvasW, canvasH, wx, wy) {
    const s = worldToScreen(camera, canvasW, canvasH, wx, wy);
    return {
      x: canvasW / 2 + (s.x - canvasW / 2) * AMBIENT_PARALLAX,
      y: canvasH / 2 + (s.y - canvasH / 2) * AMBIENT_PARALLAX,
    };
  }
  function drawAmbientBackground(canvasW, canvasH, resident, time, depth, reduced) {
    if (!plants[0].complete || !plants[0].naturalWidth) return;
    const t = Math.min(1, depth / 500);
    const moteAlpha = Math.max(0.04, 0.18 - t * 0.1);
    ctx.save();
    // Distant plant silhouettes removed (round-13 review): drawn through the
    // 0.5 parallax they only sat on their floor tile at screen centre and
    // floated as pale detached leaves everywhere else. Only the motes remain.
    // A few slow drifting motes per resident chunk, own slower parallax
    // still (closer than the silhouettes, farther than the foreground).
    for (const { index, yOffset } of resident) {
      const rng = ambientRng(index * 104729 + 3);
      const count = 6;
      for (let i = 0; i < count; i++) {
        const baseX = rng() * chunkW, baseY = yOffset + rng() * chunkH;
        const phase = rng() * Math.PI * 2;
        const drift = reduced ? 0 : time * 0.06 + phase;
        const wx = baseX + Math.sin(drift) * 0.6;
        const wy = baseY - (reduced ? 0 : (time * 0.15 + phase) % chunkH);
        const p = parallaxScreen(canvasW, canvasH, wx, wy);
        const r = camera.pxPerUnit * 0.02;
        ctx.globalAlpha = moteAlpha * (0.5 + 0.5 * Math.sin(drift * 2));
        ctx.fillStyle = 'rgba(210,240,255,1)';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawDepthTint(canvasW, canvasH, depth) {
    const { overlay } = depthTint(depth);
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  function drawVignette(canvasW, canvasH) {
    const grad = ctx.createRadialGradient(
      canvasW / 2, canvasH / 2, Math.min(canvasW, canvasH) * 0.25,
      canvasW / 2, canvasH / 2, Math.max(canvasW, canvasH) * 0.7,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,4,8,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // M7-1: caustic light - one drifting code pattern of soft diagonal streaks
  // (never OverlayNoise.jpg/Stripes.jpg, both excluded by the art rule).
  // Drift is frozen under reduced motion; the streaks themselves still show,
  // just static, per OVERNIGHT.md M7-1's per-effect reduced-motion rule.
  function drawCaustics(canvasW, canvasH, time, reduced) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(190,235,255,0.9)';
    ctx.lineWidth = Math.max(canvasW, canvasH) * 0.05;
    const spacing = Math.max(canvasW, canvasH) * 0.18;
    const drift = reduced ? 0 : (time * 14) % spacing;
    for (let x = -spacing * 2 + drift; x < canvasW + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, -spacing);
      ctx.lineTo(x + spacing * 1.4, canvasH + spacing);
      ctx.stroke();
    }
    ctx.restore();
  }

  // M7-1: Beholder dread - a reddish vignette pulse plus a light cone at its
  // own screen position, both ramping in with DREAD_RANGE proximity (M7's
  // `dreadLevel`, computed once per step in main.js and passed straight
  // through here so render.js never has to search the enemy list itself).
  // The pulse is a flat static intensity under reduced motion instead of a
  // sine flicker.
  function drawBeholderDread(canvasW, canvasH, beholder, dreadLevel, time, reduced) {
    if (!beholder || !dreadLevel) return;
    const pulse = reduced ? 1 : 0.8 + Math.sin(time * 5) * 0.2;
    const intensity = dreadLevel * pulse;
    ctx.save();
    const vGrad = ctx.createRadialGradient(
      canvasW / 2, canvasH / 2, 0,
      canvasW / 2, canvasH / 2, Math.max(canvasW, canvasH) * 0.75,
    );
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, `rgba(130,0,10,${(intensity * 0.45).toFixed(3)})`);
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    const s = worldToScreen(camera, canvasW, canvasH, beholder.x, beholder.y);
    const r = camera.pxPerUnit * (2.5 + intensity * 4);
    const cGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    cGrad.addColorStop(0, `rgba(255,60,60,${(0.4 * intensity).toFixed(3)})`);
    cGrad.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Layering pass (this session, per Daniel: "the plants are on top of
  // terrain which was not the case, they need to be behind so they poke out
  // of the terrain"). drawPlants/drawCritters now run BEFORE drawWalls (see
  // the render() draw list below), so the wall bake composites over them;
  // this constant tucks each plant's anchor point a little way down into the
  // solid floor-cap tile (rather than sitting exactly on its top edge) so
  // the wall art occludes the base of the sprite once it draws on top --
  // same "anchor slightly into the solid neighbour" idea Otter's critter
  // placement in decor.js already uses (`INTO_WALL`) for the wall-critter
  // layer, ported here for the plant sprites drawPlants places directly.
  // Round-2 fix (Daniel's screenshot review: "vines fade out 6-9px above the
  // floor rim, some read as slightly hovering"): the vine art's own bottom
  // edge fades out before its true root; sinking the anchor further into the
  // solid tile hides that faded stem base under the wall bake's rim instead
  // of leaving it exposed above it.
  const PLANT_INTO_WALL = 0.4;

  // Round-12 "fill the cave" pass, section 1 (Daniel: "still very empty, add
  // all the other critters and decorations" -- comparing against the promo
  // video stills, site/img/octomancer/video/*.webp, which show floors and
  // ceilings both thick with plant growth, not the bare rock this had).
  // Reused the only foreground-foliage art actually harvested (plant1/
  // plant2.webp, Milan's Assets/Sprites/Background/Plant{1,2}.png -- no
  // dedicated "FGFoliageTiles" sheet made it into the harvest, see
  // MANIFEST.md/ART-SORT.md) rather than pulling in new art out of scope for
  // a code-only pass: same art, denser placement plus two new anchor
  // orientations (ceiling-hanging, side-wall) it never had before.
  //
  // Density: floor divisor dropped 9 -> 3 (per the Unity `FoliagePlanterTiles`
  // spawner reference this round's brief points at -- PatternGenerator.cs's
  // density knob runs a similar 1-in-3 to 1-in-5 duty cycle per eligible
  // anchor cell, not 1-in-9). Ceiling/wall stay sparser (1-in-7 / 1-in-8):
  // the video stills show floor growth dominating, with hanging/wall growth
  // as an occasional accent, matching the brief's "most on floors, hanging
  // less, wall orientation too".
  //
  // Clustering: "cluster naturally" (brief) -- each accepted anchor has a
  // further chance (own local hash, no RNG stream) of a second, smaller
  // sprite right beside it, rather than every plant standing alone in a
  // perfectly even grid.
  //
  // The anchor cells + density gate themselves live in decor.js's
  // `findPlantAnchors` (pure function of chunk tile data, no canvas), shared
  // with `decor.test.js`'s round-12 density test; round-14's cluster-mate
  // offsets live in decor.js's `findClusterMates` for the same reason -- this
  // file only turns those into an actual draw position/size/tilt.

  // Round-14 "fill the cave" pass: the cave still read bare next to the
  // promo video stills at round-13's 1.4x scale/single-sprite anchors --
  // bumped toward the video's own foliage scale and given every accepted
  // anchor a real chance (not a rare 1-in-15) at 1-3 cluster-mates so floor
  // growth reads as clumps of mixed items, not lone stalks. Every
  // cluster-mate is still placed from the SAME anchor's hash (no extra RNG
  // stream) and re-validated against the tile grid before it draws, so
  // density never regresses `findPlantAnchors`'s own floating/into-rock
  // guarantees for the anchor itself -- only the decorative mates can be
  // skipped, never the anchor.
  const PLANT_BASE_SCALE = 1.9; // was 1.4 (round-12/13): closer to the video stills' bolder growth
  const SWAY_AMPLITUDE = 0.035; // radians, gentle -- not a wave effect
  const SWAY_SPEED = 0.7; // rad/s equivalent, per-plant phase-shifted below

  function drawOnePlant(cx, cy, tiltRad, mirrorY, seed, sizeMul = 1, img = plants[seed % 2]) {
    if (!img.complete || !img.naturalWidth) return;
    const s = worldToScreen(camera, canvasW_, canvasH_, cx, cy);
    const h = camera.pxPerUnit * PLANT_BASE_SCALE * sizeMul;
    const w = h * (img.naturalWidth / img.naturalHeight);
    ctx.save();
    ctx.translate(s.x, s.y);
    if (tiltRad) ctx.rotate(tiltRad);
    if (mirrorY) ctx.scale(1, -1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  }

  // worldToScreen/camera don't need per-call canvas dims beyond what the
  // caller already has; stashed on module-local vars each call so
  // `drawOnePlant` (used from three separate loops below) doesn't need its
  // own canvasW/canvasH parameters threaded through every call site.
  let canvasW_ = 0, canvasH_ = 0;

  function drawPlants(canvasW, canvasH, resident, time = 0, reduced = false) {
    if (!plants[0].complete || !plants[0].naturalWidth) return;
    canvasW_ = canvasW; canvasH_ = canvasH;
    for (const { index, yOffset, chunk } of resident) {
      const anchors = findPlantAnchors(chunk, chunkW, chunkH, index);
      for (const { tx, ty, onCeiling, hash: h } of anchors) {
        const sway = reduced ? 0 : Math.sin(time * SWAY_SPEED + (h % 1000) / 1000 * Math.PI * 2) * SWAY_AMPLITUDE;
        if (!onCeiling) {
          // Floor cap: solid here, open water directly above -- grows up.
          const cx = tx + 0.5, cy = ty + yOffset + PLANT_INTO_WALL;
          drawOnePlant(cx, cy, sway, false, h);
          // Round-14: 1-3 cluster-mates (mixed plant1/plant2/bush2) beside
          // most floor anchors -- offsets/safety come from decor.js's
          // `findClusterMates` (shared with decor.test.js) so this loop only
          // turns each validated slot into a draw call.
          for (const { dx, hash: h2 } of findClusterMates(chunk, chunkW, chunkH, tx, ty, false, h)) {
            const useBush = false; // r15 review: decor-bush2 clashes with the pale vines; vine-only clusters
            const mateSway = reduced ? 0 : Math.sin(time * SWAY_SPEED * 1.3 + (h2 % 1000) / 1000 * Math.PI * 2) * SWAY_AMPLITUDE;
            drawOnePlant(tx + dx + 0.5, cy + 0.05, mateSway, false, h2, useBush ? 0.9 : 0.7, useBush ? clusterBush : undefined);
          }
        } else {
          // Ceiling cap: solid here, open water directly below -- hangs
          // down (mirrored vertically, same art). No side-wall variant:
          // decor.js's own round-5 note already found this exact art (a
          // tall vine/frond growing from one narrow root) doesn't read
          // right rotated onto a side-wall face -- not repeating that here.
          drawOnePlant(tx + 0.5, ty + yOffset + 1 - PLANT_INTO_WALL, sway, true, h);
        }
      }
    }
  }

  // Round-2 fix (Daniel's screenshot review: a 1px lighter horizontal line
  // running the full level width at chunk boundaries inside rock, in 5/9
  // desktop frames and on phone). Each chunk's baked canvas used to be drawn
  // at a fractional device-pixel `topLeft.y`/height, so neighbouring chunks'
  // anti-aliased top/bottom edges didn't land on the same physical pixel row
  // and left a hairline gap (or a doubled, lighter-blended row) between them.
  // Snapping both this chunk's top edge AND the next chunk's top edge (used
  // as this chunk's bottom) to the same rounding gives adjacent chunks an
  // exactly shared edge with no seam, matching the "line through the screen"
  // fix already applied to the vertical case.
  function drawWalls(canvasW, canvasH, resident) {
    if (world.v2) { drawBandWalls(canvasW, canvasH); return; }
    for (const entry of resident) {
      const canvas = getBakedWalls(entry);
      if (!canvas) continue;
      const topLeft = worldToScreen(camera, canvasW, canvasH, 0, entry.yOffset);
      const bottomRight = worldToScreen(camera, canvasW, canvasH, chunkW, entry.yOffset + chunkH);
      const x0 = Math.round(topLeft.x), y0 = Math.round(topLeft.y);
      const x1 = Math.round(bottomRight.x), y1 = Math.round(bottomRight.y);
      ctx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0);
    }
  }

  // Round-2 fix (Daniel's screenshot review: "a 120px flat light-teal band
  // on each side, outside the 32-tile level" -- the outer walls end in a
  // hard straight vertical cut against open water instead of rock filling
  // the frame, as in the promo video). The camera can show more world width
  // than the level's 32 tiles on a wide/short viewport (CAMERA_MIN_HEIGHT
  // dominates); fill everything outside the level's tile-x range with the
  // same rock fill + noise the walls use, so it reads as more cave rather
  // than open water.
  function drawOuterRock(canvasW, canvasH) {
    const left = worldToScreen(camera, canvasW, canvasH, 0, 0).x;
    const right = worldToScreen(camera, canvasW, canvasH, chunkW, 0).x;
    ctx.save();
    ctx.fillStyle = `rgb(${WALL_FILL_COLOR.join(',')})`;
    if (left > 0) ctx.fillRect(0, 0, left, canvasH);
    if (right < canvasW) ctx.fillRect(right, 0, canvasW - right, canvasH);
    if (rockNoisePattern) {
      ctx.fillStyle = rockNoisePattern;
      if (left > 0) ctx.fillRect(0, 0, left, canvasH);
      if (right < canvasW) ctx.fillRect(right, 0, canvasW - right, canvasH);
    }
    ctx.restore();
  }

  function drawPickups(canvasW, canvasH, items, time) {
    for (const it of items) {
      if (it.hidden) continue; // sealed behind soft rock; nothing to draw until it breaks
      const s = worldToScreen(camera, canvasW, canvasH, it.x, it.y);
      if (it.type === 'plankton') {
        const r = camera.pxPerUnit * 0.045;
        ctx.save();
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 4 + it.phase);
        ctx.fillStyle = '#9dffd8';
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (it.type === 'shell') {
        const img = shellImgs.blue;
        const size = camera.pxPerUnit * 0.7;
        ctx.save();
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 5);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, s.x - size / 2, s.y - size / 2, size, size);
        ctx.restore();
      }
    }
  }

  function drawBubbles(canvasW, canvasH, bubbles) {
    if (!plants[0]) return;
    for (const b of bubbles) {
      const s = worldToScreen(camera, canvasW, canvasH, b.x, b.y);
      const r = camera.pxPerUnit * 0.08;
      ctx.save();
      ctx.globalAlpha = Math.max(0, b.alpha) * 0.6;
      ctx.strokeStyle = 'rgba(210,240,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  function drawOcto(o, alpha, canvasW, canvasH, time) {
    const ix = o.prevX + (o.x - o.prevX) * alpha;
    const iy = o.prevY + (o.y - o.prevY) * alpha;
    const s = worldToScreen(camera, canvasW, canvasH, ix, iy);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((o.angle * Math.PI) / 180);
    ctx.scale(camera.pxPerUnit, camera.pxPerUnit);
    o.__t = time;
    o.__speed = Math.hypot(o.vx, o.vy);
    // Invulnerability blink (M3-2): flicker the octopus while it can't be
    // hurt again, skipped once it's dead (death fades via the hurt clip
    // itself, not this flicker).
    // Round-5 fix (Daniel's screenshot review round 4, issue 5: "during the
    // invulnerability fade the semi-transparent body shows internal
    // overlapping layers, an x-ray look with red smears"). Setting
    // `ctx.globalAlpha` here used to make EVERY draw call inside
    // `drawOctopus` (the body frame, then each eye overlay) apply that same
    // alpha independently -- two or three partially-transparent layers
    // stacked on top of each other blend differently than one flattened
    // image at that alpha, which is exactly an "x-ray" look. Passing the
    // alpha into `drawOctopus` instead lets it draw fully opaque to an
    // offscreen buffer first and composite that flattened result once.
    const octoAlpha = o.invulnTimer > 0 && !o.dead ? (Math.sin(time * 24) > 0 ? 1 : 0.35) : 1;
    drawOctopus(ctx, o, octoAlpha);
    ctx.restore();
  }

  return {
    camera,
    /** v2: how many wall bands are cached / were on screen last frame. */
    wallBandStats() { return { live: bandCache.size, bakes: bandBakes, maxBakeMs: +bandBakeMaxMs.toFixed(2), lastBakeMs: +bandBakeLastMs.toFixed(2) }; },
    render(canvasW, canvasH, octo, alpha, time, frameDt, {
      resident, pickups, bubbles, critters = [], depth, enemies = [], shots = [], bombs = [], particles = null, shakeOffset, dreadLevel = 0, extraDraw = null,
    }) {
      // Drop wall-bake canvases for chunks the world has evicted, or their
      // offscreen canvases (48px/unit x 32x24 units each) leak for the life
      // of the run (~10 min soak test caught this: heap kept climbing).
      const liveIdx = new Set(resident.map((r) => r.index));
      if (!world.v2) for (const ci of [...wallCache.keys()]) if (!liveIdx.has(ci)) wallCache.delete(ci);
      // Round-6 task 3: follow the octopus's INTERPOLATED (render-alpha)
      // position, not its raw fixed-step one -- camera.js's own doc comment
      // already said it should ("following the octopus's interpolated
      // (render-alpha) position"), but this call passed the raw `octo.x/y`,
      // so the camera itself re-snapped to a new target every fixed step
      // even though everything it looks at (the octopus sprite) was already
      // smoothly interpolating -- a visible camera jitter independent of the
      // octopus's own.
      const followX = octo.prevX + (octo.x - octo.prevX) * alpha;
      const followY = octo.prevY + (octo.y - octo.prevY) * alpha;
      updateCamera(camera, canvasW, canvasH, followX, followY, world.width, world.height, frameDt, octo.vx, octo.vy);
      const shakePx = shakeOffset ? { x: shakeOffset.x * camera.pxPerUnit, y: shakeOffset.y * camera.pxPerUnit } : { x: 0, y: 0 };
      ctx.save();
      ctx.translate(shakePx.x, shakePx.y);
      const reduced = prefersReducedMotion();
      drawBackground(canvasW, canvasH, time, depth);
      drawCaustics(canvasW, canvasH, time, reduced);
      // Round-12 "fill the cave" pass, section 2: distant background
      // silhouettes/motes, behind everything (drawWalls, below, composites
      // opaque rock right over this same as it does the FG plants).
      drawAmbientBackground(canvasW, canvasH, resident, time, depth, reduced);
      // Layering pass: plants/decor draw BEFORE the walls now (was after), so
      // the wall bake -- opaque rock art -- composites on top and occludes
      // each sprite's anchor-tucked base (see PLANT_INTO_WALL / decor.js's
      // own INTO_WALL for critters). Matches the sorting-layer order in the
      // Unity original too: the foliage prefabs sit on the "Default" sorting
      // layer, the tilemap on "Map", which renders after "Default" -- i.e.
      // walls were always meant to composite over decor, not the other way
      // round.
      drawPlants(canvasW, canvasH, resident, time, reduced);
      // Otter's alive pass; runes are excluded here and drawn again AFTER
      // drawWalls below (Round-4 fix: runes need to land on top of the rock
      // face like a painted mark, not be buried under the opaque wall bake).
      drawCritters(ctx, camera, worldToScreen, canvasW, canvasH, critters, time, false);
      // Round-3 fix (Daniel's screenshot review: "each light shaft ends in a
      // hard straight vertical edge at the level boundary" -- `drawOuterRock`
      // used to draw right after the background, BEFORE `drawCaustics`, so
      // the light-shaft streaks painted over the outer rock (outside the
      // 32-tile level) but the walls -- drawn later, opaque -- occluded them
      // from ever showing on the level's own rock. Moved into this same
      // "rock" compositing step, after caustics and right alongside
      // `drawWalls`, so outer rock occludes the shafts exactly the same way
      // the level's own walls already do -- no shaft shows on rock anywhere.
      drawOuterRock(canvasW, canvasH);
      drawWalls(canvasW, canvasH, resident);
      // Round-4 fix: runes drawn on top of the just-baked wall art, so they
      // read as a mark painted onto the rock face instead of a sprite the
      // rock bake occludes.
      drawCritters(ctx, camera, worldToScreen, canvasW, canvasH, critters, time, true);
      drawBubbles(canvasW, canvasH, bubbles);
      drawPickups(canvasW, canvasH, pickups, time);
      drawEnemies(ctx, camera, worldToScreen, canvasW, canvasH, enemies, shots, time, alpha);
      drawBombs(ctx, camera, worldToScreen, canvasW, canvasH, bombs, time);
      if (extraDraw) extraDraw(ctx, camera, worldToScreen, canvasW, canvasH);
      if (particles) drawParticles(ctx, camera, worldToScreen, canvasW, canvasH, particles);
      drawOcto(octo, alpha, canvasW, canvasH, time);
      ctx.restore();
      drawDepthTint(canvasW, canvasH, depth);
      drawVignette(canvasW, canvasH);
      const beholder = enemies.find((e) => e.kind === 'beholder' && !e.dead);
      drawBeholderDread(canvasW, canvasH, beholder, dreadLevel, time, reduced);
    },
  };
}
