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

import { updateCamera, updateDeathCamera, worldToScreen, computePxPerUnit } from './camera.js';
import { acquireCanvas, releaseCanvas, sharedCanvas } from './canvas-pool.js';
import { visibleAt, visibleObj, cullFlags, cullFrame, cullEnd } from './cull.js';
import { drawOctopus } from './octopus-draw.js';
import { depthTint } from './decor.js';
import { getFoliageTable, createFoliageCandidates, stepFoliageCandidates, placeFoliageCells, SURF_WALL, SURF_CEIL, SURF_HOVER, BASE_BOTTOM, BASE_TOP, BASE_RIGHT } from './foliage.js';
import { drawEnemies, drawBombs, drawParticles } from './enemy-draw.js';
import { drawCritters } from './decor-draw.js';
import { isAmbientDead } from './ambient.js'; // Otter's "alive pass" wall critters, NIGHT-LOG.md
import { prefersReducedMotion, DASH_IFRAMES } from './config.js';
import { SHELL_SIZE } from './shells.js';
import { wallBandWindow } from './world-v2.js';
import { ensureV2Art, offV2Art, artImg, artBitmap, ROCK_TILE_UNITS } from './v2-art.js';
import { MAT_ROCK, MAT_BEDROCK, MAT_BONE, MAT_TIMBER, MAT_MASONRY, MAT_DRAW_ORDER, getTileDrawHook } from './materials.js';

// ---- Materials (Spelunky-style layering, materials.js). Per material id: flat fill, texture (v2-art key, world units per
// repeat, alpha), an optional tint laid over the texture, per-tile art keys, and up to two rim strokes along the layer's
// outline (width in tiles). Every layer is drawn as if it touched air everywhere; the next, higher layer covers it and its
// rim overlaps the boundary. Rock keeps the original navy fill + mint rim.
const MAT_FILL = ['', 'rgb(58,84,142)', 'rgb(24,23,40)', 'rgb(118,106,90)', 'rgb(96,66,40)', 'rgb(128,122,112)'];
const MAT_TEX = ['', 'rock', 'matBedrock', '', 'matTimber', 'matMasonry'];
const MAT_TEX_UNITS = new Float32Array([0, ROCK_TILE_UNITS, 4, 0, 2, 3]);
const MAT_TEX_ALPHA = new Float32Array([0, 0.8, 1, 0, 1, 1]);
const MAT_TINT = ['', '', 'rgba(14,8,30,0.32)', '', 'rgba(176,122,66,0.2)', 'rgba(30,44,78,0.28)']; // timber: a warm lift (verification 2026-10-08: it read too dark and muddy under the deeper levels' tint)
const MAT_TILE_ART = [null, null, null, ['matBoneA', 'matBoneB'], null, null];
const MAT_RIM = ['', 'rgba(70,205,165,0.95)', 'rgb(8,7,16)', 'rgb(46,30,18)', 'rgb(34,22,13)', 'rgb(44,44,58)'];
const MAT_RIM_W = new Float32Array([0, 0.1, 0.2, 0.11, 0.12, 0.11]);
const MAT_RIM2 = ['', '', 'rgba(132,124,184,0.6)', 'rgba(214,180,130,0.45)', 'rgba(176,128,80,0.5)', 'rgba(200,196,186,0.45)'];
const MAT_RIM2_W = new Float32Array([0, 0, 0.035, 0.03, 0.03, 0.03]);
/** Texture keys the wall bake uses (a cell baked before one loaded is baked again when it arrives). */
const MAT_ART_KEYS = new Set(['rock', 'matBedrock', 'matTimber', 'matMasonry', 'matBoneA', 'matBoneB']);
export const MATERIAL_STYLE = { MAT_FILL, MAT_RIM, MAT_RIM_W };

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
const ROCK_TEX_ALPHA = 0.8; // v2 rock texture strength over the flat fill
// r43: the bake resolution follows the screen the walls are drawn on (about one baked pixel per screen pixel), not the device pixel
// ratio: DPR 3 baked at 96 px/unit although the phone canvas shows 62, and every canvas was 2.4 times bigger than it could be seen.
const BAKE_MIN = 24, BAKE_MAX = 96;
const MAX_CELL_TILES = 8;
function bakeFor(ppu) { return Math.max(BAKE_MIN, Math.min(BAKE_MAX, Math.round(ppu))); }

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

/** r41: free a canvas's backing store at once (setting the size to 0 releases the bitmap without waiting for the GC). */
function freeCanvas(c) { if (c) { c.width = 0; c.height = 0; } }
/** Empty a Map of baked canvases (the value is a canvas or {canvas}): each goes back to the pool (or is freed at once). */
function releaseCanvases(map) {
  for (const v of map.values()) eachCanvas(v, releaseCanvas);
  map.clear();
}
/** r44: call fn on each canvas a cache value holds: a canvas, {canvas}, or an endless chunk's {cells: Map of canvases}. */
function eachCanvas(v, fn) {
  if (!v) return;
  if (v.cells) { for (const c of v.cells.values()) fn(c); } else fn(v.canvas ? v.canvas : v);
}

const NOISE_TEX_PX = 384; // the rock grain texture: 8 tiles at 48 px, scaled to the bake size by a pattern transform
let sharedRock = null; // {px, canvas, pattern}: built once per page, see createRenderer
// r43: images and tiny tinted sprites every level shares, made once per page (a renderer per level used to make its own)
let sharedArt = null; // {plants, clusterBush, shellImgs, noise, deepTint}
function getSharedArt() {
  if (sharedArt) return sharedArt;
  const noise = sharedCanvas(document.createElement('canvas'));
  noise.width = noise.height = 128;
  const nctx = noise.getContext('2d');
  const img = nctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 10 + Math.random() * 18; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  nctx.putImageData(img, 0, 0);
  sharedArt = {
    plants: [loadImage(ASSET('plant1.webp')), loadImage(ASSET('plant2.webp'))],
    // Round-14 "fill the cave" pass: a third foliage variant for cluster-mates only (reuses decor.js's bush2 art)
    clusterBush: loadImage(ASSET('decor-bush2.webp')),
    foliage: loadImage(ASSET('foliage.webp')), // r46: every original foliage sprite on one sheet (data/foliage.json)
    shellImgs: { blue: loadImage(ASSET('shell-blue.webp')), green: loadImage(ASSET('shell-green.webp')), red: loadImage(ASSET('shell-red.webp')), kinds: [null, loadImage(ASSET('shell-cowrie.webp')), loadImage(ASSET('shell-conch.webp')), loadImage(ASSET('shell-nautilus.webp')), loadImage(ASSET('shell-pearl.webp'))] }, // kinds: by value (shells.js)
    noise,
    deepTint: null,
  };
  return sharedArt;
}
const DEEP_FOLIAGE = 'rgba(24,78,98,0.85)';
/** The two plant sprites tinted dark teal for the deep rock (65 x 256 each), once per page. */
function deepTintOf(plants) {
  const sa = getSharedArt();
  if (sa.deepTint) return sa.deepTint;
  if (!plants.every((im) => im.complete && im.naturalWidth)) return null;
  sa.deepTint = plants.map((img) => {
    const t = sharedCanvas(document.createElement('canvas')); t.width = img.naturalWidth; t.height = img.naturalHeight;
    const tg = t.getContext('2d'); tg.drawImage(img, 0, 0);
    tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = DEEP_FOLIAGE; tg.fillRect(0, 0, t.width, t.height);
    return t;
  });
  return sa.deepTint;
}

export function createRenderer(ctx, world) {
  let disposed = false; // set by dispose(): late image loads then build nothing
  const sa = getSharedArt();
  // r43: bake px per world unit, from the size of the screen this renderer draws to (re-checked on a resize, see syncBake)
  const screenPpu = () => (ctx.canvas && ctx.canvas.width > 0 && ctx.canvas.height > 0 ? computePxPerUnit(ctx.canvas.width, ctx.canvas.height) : 48);
  let BAKE_PX_PER_UNIT = bakeFor(screenPpu());
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
  const caveArt = world.v2 ? null : loadImage(ASSET('bg-cave.webp')); // r43: the v2 game draws its own backdrop layers; the 2560 x 1440 cave art (a 15 MB canvas once feathered) is endless-only
  // Feathered once the source image loads: the raw art is a bright cave
  // mouth on a big flat near-black rectangle, and even under a 'screen'
  // blend that flat area is dark-teal (not literal black), so drawing it
  // straight left a visible rectangular seam at its edge (Daniel's
  // screenshot review). Baking a vertical fade into an offscreen copy once,
  // instead of redoing the gradient every frame, keeps this cheap.
  let caveArtFeathered = null;
  if (caveArt) caveArt.addEventListener('load', () => {
    if (disposed) return;
    const fk = Math.min(1, 1024 / caveArt.naturalWidth); // r43: feathered at no more than 1024 px wide (it is drawn blurred and faded)
    const fc = acquireCanvas(Math.round(caveArt.naturalWidth * fk), Math.round(caveArt.naturalHeight * fk));
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
    fctx.filter = `blur(${Math.max(2, Math.round(10 * fk))}px)`;
    fctx.drawImage(caveArt, 0, 0, fc.width, fc.height);
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
  const plants = sa.plants;
  // Round-14 "fill the cave" pass: a third foliage variant for cluster-mates
  // only (never the primary anchor sprite, so `findPlantAnchors`'s own
  // solid/open checks -- which only know about the plant1/2 silhouette's
  // footprint -- still hold for the anchor itself). Reuses decor.js's
  // existing `bush2` art (already vetted floor-only, round-4/5/7 notes in
  // decor.js), not new art, so a floor cluster can mix a bush in alongside
  // the vine/frond plants per the brief ("clusters of 2-4 mixed items").
  const clusterBush = sa.clusterBush;
  const sheetImg = sa.foliage;
  const shellImgs = sa.shellImgs;
  const camera = { x: 0, y: 0, pxPerUnit: 32 };
  const chunkW = world.width, chunkH = world.chunkHeight;
  const cellTiles = () => Math.max(2, Math.min(MAX_CELL_TILES, Math.round(WALL_BAND_PX / BAKE_PX_PER_UNIT))); // r43: wall cells are this many tiles square (about 512 px, at most 8 tiles: never wider than the screen)
  if (world.v2) world.configureBands(cellTiles());

  // --- Per-chunk baked wall cache, rebaked only when a chunk's tiles change
  // (bomb breaks) or when it is seen for the first time. ---
  /** @type {Map<number, {canvas:HTMLCanvasElement, bakedTiles:Uint8Array|null}>} */
  const wallCache = new Map();

  // round 29 (endless only): each baked chunk carries a transparent margin of about a quarter tile above and below
  // its rows. Where a water pocket's top row sits exactly on the top of the topmost resident chunk (the swim-up cap
  // line) its mint rim runs along the chunk edge; clipped to the exact chunk rect it came out half as thick with hard
  // corners. The margin lets the whole stroke (and the smoothed corners) bake; drawWalls draws it only at the cap line
  // and crops it everywhere else, so chunk seams stay exactly what they were.
  const CHUNK_MARGIN_PX = Math.round(0.25 * BAKE_PX_PER_UNIT);

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
  const NOISE_FIELD_PX = NOISE_TEX_PX; // r43: a fixed texture (8 tiles at 48 px), scaled to the bake size when it is painted
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

  // r41: the rock grain is the same for every level (fixed seed): built once per page, shared by every renderer
  const noiseField = sharedRock && sharedRock.px === NOISE_FIELD_PX ? null : generateFbmField(NOISE_FIELD_PX, 1337);
  // Rock: slate-blue variation (darker/lighter than WALL_FILL_COLOR) rather
  // than a contrasting teal speckle -- the promo-video reference frames read
  // as close to flat at this art style's resolution, so a loud grain fought
  // the video look as much as the old wrong base colour did. Kept (rather
  // than dropped) per Daniel's Unity-shader ground-truth note.
  // Round-8 fix (Daniel's screenshot review round 7, item 2: "more visible
  // texture/cracks"): widened the dark/light endpoints and raised the max
  // alpha (0.14 -> 0.22) so the crevice/speckle contrast actually reads as
  // rock grain/cracks up close instead of a near-flat tint.
  if (noiseField) {
    const canvas = buildNoiseTexture(noiseField, NOISE_FIELD_PX, [12, 24, 58], [92, 128, 205], 0.22);
    sharedCanvas(canvas);
    sharedRock = { px: NOISE_FIELD_PX, canvas, pattern: document.createElement('canvas').getContext('2d').createPattern(canvas, 'repeat') };
  }
  const rockNoiseCanvas = sharedRock.canvas;
  // CanvasPattern only needs *a* 2D context to be created from, not the one
  // it will later be drawn into -- build the pattern once, up front.
  const rockNoisePattern = sharedRock.pattern;

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
  // r43: the grain is one fixed texture; a pattern transform scales it to the bake size and puts its origin at world (0, 0), so
  // cells, chunks and caps baked at different offsets still continue it.
  function paintNoise(bctx, xTiles, yTiles, rectW, rectH) {
    const k = (NOISE_FIELD_TILES * BAKE_PX_PER_UNIT) / rockNoiseCanvas.width;
    if (rockNoisePattern.setTransform) rockNoisePattern.setTransform(new DOMMatrix([k, 0, 0, k, -xTiles * BAKE_PX_PER_UNIT, -yTiles * BAKE_PX_PER_UNIT]));
    bctx.save();
    bctx.globalCompositeOperation = 'source-atop';
    bctx.fillStyle = rockNoisePattern;
    bctx.fillRect(0, 0, rectW, rectH);
    bctx.restore();
  }

  // Shared wall-art pass: fill + rim from already-px loops, clipped to the
  // canvas, then the seamless noise grain. `yOffsetTiles` is the world row
  // the canvas top sits at (so the noise tiles across neighbouring canvases).
  function paintWallCanvas(canvas, loops, yOffsetTiles, xOffsetTiles = 0) {
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
    // round 24 (v2 only): the generated Shallows rock texture over the flat fill, world-aligned so
    // neighbouring bands continue it; the rim stroke below still follows the traced outline.
    const rockImg = world.v2 ? artImg('rock') : null;
    if (rockImg) {
      const pat = bctx.createPattern(rockImg, 'repeat');
      if (pat && pat.setTransform) {
        const k = (ROCK_TILE_UNITS * s) / (rockImg.naturalWidth || rockImg.width);
        pat.setTransform(new DOMMatrix([k, 0, 0, k, -xOffsetTiles * s, -yOffsetTiles * s]));
        bctx.save();
        bctx.globalAlpha = ROCK_TEX_ALPHA;
        bctx.fillStyle = pat;
        pathFromLoops(bctx, loops);
        bctx.fill('nonzero');
        bctx.restore();
      }
    }
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
    paintNoise(bctx, xOffsetTiles, yOffsetTiles, canvas.width, canvas.height);
  }

  // Materials: one cell of the v2 walls, layer by layer (see MAT_* above). For each material present in the band, lowest
  // priority first: fill the outline of every tile of that priority or higher (the lowest layer's outline is the collision
  // outline itself, so the silhouette always matches collision), texture it, draw its per-tile art, stroke its rim. The
  // embedded-treasure hook (materials.js setTileDrawHook) runs after the main-terrain layer, before bedrock.
  function paintMaterialCell(canvas, bi, y0, x0, cols, rows) {
    const bctx = canvas.getContext('2d');
    const s = BAKE_PX_PER_UNIT;
    bctx.clearRect(0, 0, canvas.width, canvas.height);
    bctx.save();
    bctx.beginPath();
    bctx.rect(0, 0, canvas.width, canvas.height);
    bctx.clip();
    bctx.lineJoin = 'round';
    bctx.lineCap = 'round';
    const mask = world.bandMaterials(bi);
    const hook = getTileDrawHook();
    let hooked = !hook;
    const runHook = () => {
      hooked = true;
      for (let ty = y0 - 1; ty <= y0 + rows; ty++) for (let tx = x0 - 1; tx <= x0 + cols; tx++) {
        const m = world.tileAt(tx, ty);
        if (m !== 0 && m !== MAT_BEDROCK) hook(bctx, tx, ty, m, (tx - x0) * s, (ty - y0) * s, s);
      }
    };
    for (let k = 0; k < MAT_DRAW_ORDER.length; k++) {
      const m = MAT_DRAW_ORDER[k];
      if (m === MAT_BEDROCK && !hooked) runHook();
      if (!(mask & (1 << m))) continue;
      const o = world.getLayerOutline(bi, m);
      if (!o || !o.loops.length) continue;
      const loops = o.loops.map((loop) => loop.map((p) => ({ x: (p.x - x0) * s, y: (p.y - y0) * s })));
      bctx.fillStyle = MAT_FILL[m];
      pathFromLoops(bctx, loops);
      bctx.fill('nonzero');
      const img = MAT_TEX[m] ? artImg(MAT_TEX[m]) : null;
      const pat = img ? bctx.createPattern(img, 'repeat') : null;
      if (pat && pat.setTransform) {
        const kk = (MAT_TEX_UNITS[m] * s) / (img.naturalWidth || img.width);
        pat.setTransform(new DOMMatrix([kk, 0, 0, kk, -x0 * s, -y0 * s]));
        bctx.globalAlpha = MAT_TEX_ALPHA[m];
        bctx.fillStyle = pat;
        bctx.fill('nonzero');
        bctx.globalAlpha = 1;
      }
      if (MAT_TINT[m]) { bctx.fillStyle = MAT_TINT[m]; bctx.fill('nonzero'); }
      const art = MAT_TILE_ART[m];
      if (art) {
        // one block sprite per tile of this material (Spelunky's bone blocks), clipped to the layer's rounded outline
        bctx.save();
        bctx.clip('nonzero');
        for (let ty = y0 - 1; ty <= y0 + rows; ty++) for (let tx = x0 - 1; tx <= x0 + cols; tx++) {
          if (world.tileAt(tx, ty) !== m) continue;
          const img = artImg(art[((tx * 7 + ty * 13) >>> 0) % art.length]);
          if (img) bctx.drawImage(img, (tx - x0) * s, (ty - y0) * s, s, s);
        }
        bctx.restore();
      }
      bctx.strokeStyle = MAT_RIM[m];
      bctx.lineWidth = s * MAT_RIM_W[m];
      pathFromLoops(bctx, loops);
      bctx.stroke();
      if (MAT_RIM2_W[m] > 0) {
        bctx.strokeStyle = MAT_RIM2[m];
        bctx.lineWidth = s * MAT_RIM2_W[m];
        bctx.stroke();
      }
      if (m === MAT_ROCK && !hooked) runHook();
    }
    if (!hooked) runHook();
    bctx.restore();
    paintNoise(bctx, x0, y0, canvas.width, canvas.height);
  }

  // r44: an endless chunk (32 x 24 tiles) is no longer one canvas (6.7 MB at 48 px per unit on a phone, three live plus a cap, 26 MB, far
  // more than the screen): it is cut into cells of cellTiles() tiles square, like the v2 bands, and only the cells on the screen (and half a cell
  // round them, kept until the camera is further away) are baked. Every cell carries the quarter-tile margin above and below (see CHUNK_MARGIN_PX) so the cap line works.
  const ENDLESS_KEY = 64; // cell key = row * 64 + column
  function chunkEntry(entry) {
    let e = wallCache.get(entry.index);
    if (!e) { e = { cells: new Map(), loops: null }; wallCache.set(entry.index, e); }
    if (entry.chunk.dirty) { // a bomb changed the tiles: the cells are baked again when drawn
      for (const c of e.cells.values()) releaseCanvas(c);
      e.cells.clear(); e.loops = null; entry.chunk.dirty = false;
    }
    return e;
  }
  function bakeChunkCell(entry, e, cx, ry) {
    const ct = cellTiles(), s = BAKE_PX_PER_UNIT, M = CHUNK_MARGIN_PX;
    const x0 = cx * ct, y0 = ry * ct, w = Math.min(ct, chunkW - x0), h = Math.min(ct, chunkH - y0);
    if (!e.loops) e.loops = chunkLoopsPx(entry, s);
    const canvas = acquireCanvas(ct * s, ct * s + 2 * M); // full cell size whatever the cell's own size (pool reuse), see bakeCell
    const ox = x0 * s, oy = y0 * s - M;
    const loops = e.loops.map((loop) => loop.map((p) => ({ x: p.x - ox, y: p.y - oy })));
    paintWallCanvas(canvas, loops, entry.yOffset + y0 - M / s, x0);
    e.cells.set(ry * ENDLESS_KEY + cx, canvas);
    return canvas;
  }

  // --- v2 single-level walls (world-v2.js): the wall art is cached in CELLS, a band of rows (about WALL_BAND_PX baked
  // pixels tall) cut into columns of the same width, so a cell is about 512 x 512 baked pixels. r43: until now a band was as
  // wide as the whole level (3264 or 6144 x 480 px, 6-12 MB each, seven of them live, a whole new set per level), which on a
  // phone made the transition spike by 100 MB. Now only the cells on the screen and a one-cell ring round them are live, they
  // come from the canvas pool (the previous level's cells are reused), and baking is budgeted: at most BAKE_BUDGET_MS per frame
  // (always at least one missing cell on screen), the ring one cell per frame when nothing on screen was missing. A bomb
  // rebakes only the cells of the bands whose outline changed, on the same budget.
  const CELL_KEY = 4096; // key = band * CELL_KEY + column
  const BAKE_BUDGET_MS = 8;
  const bandCache = new Map(); // key -> {canvas, version}
  // bake with the texture once it is there: the cells go stale (baked again on the frame budget, the old bake drawn meanwhile)
  let artGen = 0;
  const bandTouchOf = (bi) => (world.bandTouch ? world.bandTouch(bi) : 0); // materials: world.touchTile (embedded treasure drawn into the cell)
  const onArt = (key) => { if (MAT_ART_KEYS.has(key)) artGen++; };
  if (world.v2) ensureV2Art(onArt);
  let bandBakes = 0; // total bakes, for tests / perf checks
  let bandBakeMaxMs = 0, bandBakeLastMs = 0; // slowest / latest single cell bake
  let wallsReady = false; // every cell on screen is baked (the level may fade in)
  function bandLoopsPx(bi, y0, x0) {
    const outline = world.getWallOutline(bi);
    if (!outline) return [];
    const s = BAKE_PX_PER_UNIT;
    return outline.loops.map((loop) => loop.map((p) => ({ x: (p.x - x0) * s, y: (p.y - y0) * s })));
  }
  function bakeCell(bi, ci) {
    const rows = world.bandRows, cols = cellTiles();
    const y0 = bi * rows, h = Math.min(rows, world.height - y0), x0 = ci * cols, w = Math.min(cols, world.width - x0);
    const key = bi * CELL_KEY + ci;
    let entry = bandCache.get(key);
    let canvas = entry && entry.canvas;
    // r44: every cell canvas has the full cell size (edge cells use part of it), so the pool's exact-size keys always find the last level's
    const wantW = cols * BAKE_PX_PER_UNIT, wantH = rows * BAKE_PX_PER_UNIT;
    if (!canvas || canvas.height !== Math.ceil(wantH) || canvas.width !== Math.ceil(wantW)) {
      if (canvas) releaseCanvas(canvas);
      canvas = acquireCanvas(wantW, wantH);
    }
    const t0 = performance.now();
    if (world.getLayerOutline) paintMaterialCell(canvas, bi, y0, x0, cols, rows);
    else paintWallCanvas(canvas, bandLoopsPx(bi, y0, x0), y0, x0);
    bandCache.set(key, { canvas, version: world.bandVersion(bi), art: artGen, touch: bandTouchOf(bi) });
    bandBakes++;
    bandBakeLastMs = performance.now() - t0;
    if (bandBakeLastMs > bandBakeMaxMs) bandBakeMaxMs = bandBakeLastMs;
  }
  /** The window of cells on screen (vis*) and the ring that stays baked (keep*), in band rows and cell columns. */
  function cellWindow(canvasW, canvasH) {
    const ppu = camera.pxPerUnit, halfW = canvasW / 2 / ppu, halfH = canvasH / 2 / ppu;
    const rows = world.bandRows, n = world.bandCount(), cols = cellTiles(), nc = Math.ceil(world.width / cols);
    const win = wallBandWindow(camera.y - halfH, camera.y + halfH, rows, n);
    const cl = (c) => Math.max(0, Math.min(nc - 1, c));
    const cFrom = cl(Math.floor((camera.x - halfW - 0.5) / cols)), cTo = cl(Math.floor((camera.x + halfW + 0.5) / cols));
    return { ...win, cFrom, cTo, kFrom: cl(cFrom - 1), kTo: cl(cTo + 1), nc, cols };
  }
  /** r43: re-bake at the new size when the screen changed a lot (a window resize, a rotation). */
  function syncBake(canvasW, canvasH) {
    if (!world.v2) return; // the endless chunks are baked at one size for their whole life
    const want = bakeFor(computePxPerUnit(canvasW, canvasH));
    if (want === BAKE_PX_PER_UNIT || Math.abs(want - BAKE_PX_PER_UNIT) / BAKE_PX_PER_UNIT < 0.2) return;
    BAKE_PX_PER_UNIT = want;
    releaseCanvases(bandCache);
    if (world.v2) world.configureBands(cellTiles());
  }
  /** Prune what left the window and bake what is missing, within the frame's budget (see the comment above). Returns the window. */
  function updateCells(canvasW, canvasH) {
    syncBake(canvasW, canvasH);
    const w = cellWindow(canvasW, canvasH);
    for (const key of [...bandCache.keys()]) {
      const bi = Math.floor(key / CELL_KEY), ci = key % CELL_KEY;
      if (bi < w.keepFrom || bi > w.keepTo || ci < w.kFrom || ci > w.kTo) { releaseCanvas(bandCache.get(key).canvas); bandCache.delete(key); }
    }
    const t0 = performance.now();
    let baked = 0, missing = 0;
    const need = (bi, ci) => { const c = bandCache.get(bi * CELL_KEY + ci); return !c || c.version !== world.bandVersion(bi) || c.art !== artGen || c.touch !== bandTouchOf(bi); };
    // cells on screen first: a missing one must be baked, within the frame's budget but never fewer than one per frame
    for (let bi = w.visFrom; bi <= w.visTo; bi++) {
      for (let ci = w.cFrom; ci <= w.cTo; ci++) {
        if (!need(bi, ci)) continue;
        if (baked === 0 || performance.now() - t0 < BAKE_BUDGET_MS) { bakeCell(bi, ci); baked++; } else missing++;
      }
    }
    wallsReady = missing === 0;
    // then the ring, one cell per frame, only when the screen needed nothing this frame
    if (baked === 0) {
      ring: for (let bi = w.keepFrom; bi <= w.keepTo; bi++) {
        for (let ci = w.kFrom; ci <= w.kTo; ci++) {
          if ((bi >= w.visFrom && bi <= w.visTo && ci >= w.cFrom && ci <= w.cTo) || !need(bi, ci)) continue;
          bakeCell(bi, ci); break ring;
        }
      }
    }
    return w;
  }
  function drawBandWalls(canvasW, canvasH) {
    const rows = world.bandRows;
    const w = updateCells(canvasW, canvasH);
    const flat = `rgb(${WALL_FILL_COLOR.join(',')})`;
    for (let bi = w.visFrom; bi <= w.visTo; bi++) {
      const y0 = bi * rows, y1 = Math.min(world.height, y0 + rows);
      for (let ci = w.cFrom; ci <= w.cTo; ci++) {
        const x0 = ci * w.cols, x1 = Math.min(world.width, x0 + w.cols);
        const tl = worldToScreen(camera, canvasW, canvasH, x0, y0);
        const br = worldToScreen(camera, canvasW, canvasH, x1, y1);
        const sx0 = Math.round(tl.x), sy0 = Math.round(tl.y), sw = Math.round(br.x) - sx0, sh = Math.round(br.y) - sy0;
        const c = bandCache.get(bi * CELL_KEY + ci);
        if (c) ctx.drawImage(c.canvas, 0, 0, (x1 - x0) * BAKE_PX_PER_UNIT, (y1 - y0) * BAKE_PX_PER_UNIT, sx0, sy0, sw, sh);
        else { ctx.fillStyle = flat; ctx.fillRect(sx0, sy0, sw, sh); } // not baked yet (the next frame has it): plain rock, never a hole
      }
    }
  }

  // --- Drifting code value-noise layer (small offscreen canvas, generated once) ---
  const NOISE_SIZE = 128;
  const noiseCanvas = sa.noise; // r43: one 128 x 128 texture for the whole page

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
    const t = Math.min(0.5, depth / 400); // capped so water stays clearly lighter than the rock fill
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, `rgb(${lerp(140, 20, t)},${lerp(252, 46, t)},${lerp(252, 76, t)})`);
    grad.addColorStop(1, `rgb(${lerp(118, 10, t)},${lerp(230, 26, t)},${lerp(238, 46, t)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    if (world.v2) drawV2Backdrop(canvasW, canvasH, depth);
    else drawCaveArt(canvasW, canvasH, depth);
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

  // Round 24 (v2 only): two generated Shallows backdrop layers with their own parallax. The far layer is a
  // misty cave of pillars and kelp multiplied over the water gradient; the near layer is sparser silhouettes.
  // Both are mirrored side by side (and the near one top to bottom) so they tile without a seam.
  const V2_FAR_PARALLAX = 0.12, V2_NEAR_PARALLAX = 0.3;
  function drawV2Layer(img, parallax, canvasW, canvasH, alpha, mode, heightUnits) {
    const ppu = camera.pxPerUnit;
    const h = Math.max(canvasH * 1.05, heightUnits * ppu), w = h * ((img.naturalWidth || img.width) / (img.naturalHeight || img.height)); // an <img> or an ImageBitmap
    const ox = -((camera.x * ppu * parallax) % (w * 2));
    const oy = -((camera.y * ppu * parallax) % (h * 2));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = mode;
    for (let iy = -1; iy * h + oy < canvasH; iy++) {
      const y = oy + iy * h;
      if (y + h < 0) continue;
      for (let ix = -1; ix * w + ox < canvasW; ix++) {
        const x = ox + ix * w;
        if (x + w < 0) continue;
        const fx = (((ix % 2) + 2) % 2) === 1, fy = (((iy % 2) + 2) % 2) === 1;
        if (!fx && !fy) { ctx.drawImage(img, x, y, w, h); continue; }
        ctx.save();
        ctx.translate(fx ? x + w : x, fy ? y + h : y);
        ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawV2Backdrop(canvasW, canvasH, depth) {
    const far = artBitmap('far'), near = artBitmap('near'); // vibe fixes: decoded bitmaps (an <img> was decoded again inside a frame after a level change)
    const fade = 1 - Math.min(0.5, depth / 240);
    if (far) drawV2Layer(far, V2_FAR_PARALLAX, canvasW, canvasH, 0.3 * fade, 'multiply', 40);
    if (near) drawV2Layer(near, V2_NEAR_PARALLAX, canvasW, canvasH, 0.2 * fade, 'multiply', 30);
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
  // (The pale ambient plant silhouettes were removed in round 13 and their baked cache with them, r43.)
  function parallaxScreen(canvasW, canvasH, wx, wy) {
    const s = worldToScreen(camera, canvasW, canvasH, wx, wy);
    return {
      x: canvasW / 2 + (s.x - canvasW / 2) * AMBIENT_PARALLAX,
      y: canvasH / 2 + (s.y - canvasH / 2) * AMBIENT_PARALLAX,
    };
  }
  // ---- r36 (v2 only): deeper rock behind the walls. A second cave wall seen through the water, 0.7 parallax and a
  // touch smaller than the real one: the level's own rock mask, thickened along its edges by a hash, softened by a
  // low-res bake, with the existing plant sprites in a dark teal on its floors and ceilings. Baked once per level
  // (and again when the plant art finishes loading); one drawImage per frame. The opaque walls cover it, so it only
  // shows in the open water, where it gives the cave depth the flat gradient lacked.
  // r43: baked in three steps, one per frame, never in one task (it used to cost 150-230 ms at 4x CPU throttle, most of it a
  // blur per arc and a GPU read-back): 1) the blobs, unblurred, on a scratch canvas; 2) one blur of the whole thing into the
  // canvas that is drawn, tinted; 3) the plant list, worked out from the blob circles on the CPU (no read-back). Both canvases
  // come from the pool and the scratch one goes straight back. At 8 px per tile it is 0.6 MB (was 1.3).
  const DEEP_PARALLAX = 0.7, DEEP_SCALE = 0.86, DEEP_PX = 8;
  const DEEP_ROCK = 'rgba(18,58,80,0.9)';
  let deepLevel = null, deepStage = 0, deepCanvas = null, deepScratch = null, deepCircles = null, deepCount = 0, deepPlantList = [];
  const deepHash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263 + 1013, 1274126177); h ^= h >>> 13; return (Math.imul(h, 1103515245) >>> 0); };
  let deepAl = null, deepAlTmp = null, deepAlStep = 0; // deepAlphaStep's work in progress
  function resetDeepRock() {
    deepAl = deepAlTmp = null; deepAlStep = 0;
    releaseCanvas(deepCanvas); releaseCanvas(deepScratch);
    deepCanvas = deepScratch = null; deepCircles = null; deepCount = 0; deepPlantList = []; deepStage = 0;
  }
  function deepSolid(x, y) { return x < 0 || y < 0 || x >= world.width || y >= world.height || world.tileAt(x, y) !== 0; }
  function deepStage1() {
    const W = world.width, H = world.height;
    // the mass as overlapping round blobs (one per rock cell, a few extra beside the edges), blurred in step 2: organic, soft-edged
    // silhouettes instead of a tile grid
    deepScratch = acquireCanvas(W * DEEP_PX, H * DEEP_PX);
    const g = deepScratch.getContext('2d');
    g.fillStyle = '#000';
    deepCircles = new Float32Array(W * H * 3); deepCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const h = deepHash(x, y);
        let on = deepSolid(x, y), r = 0.78;
        if (!on) { // water next to rock: a hash-gated extra lump, so the deep wall is lumpier and thicker than the near one
          const n = deepSolid(x + 1, y) + deepSolid(x - 1, y) + deepSolid(x, y + 1) + deepSolid(x, y - 1);
          on = n > 0 && h % 100 < 25 + n * 12;
          r = 0.55 + ((h >>> 8) % 40) / 100;
        }
        if (!on) continue;
        const jx = (((h >>> 12) % 21) - 10) / 40, jy = (((h >>> 17) % 21) - 10) / 40;
        g.beginPath(); g.arc((x + 0.5 + jx) * DEEP_PX, (y + 0.5 + jy) * DEEP_PX, r * DEEP_PX, 0, Math.PI * 2); g.fill();
        const o = deepCount++ * 3; deepCircles[o] = x + 0.5 + jx; deepCircles[o + 1] = y + 0.5 + jy; deepCircles[o + 2] = r;
      }
    }
    deepStage = 1;
  }
  function deepStage2() {
    const c = acquireCanvas(deepScratch.width, deepScratch.height);
    const g = c.getContext('2d');
    if ('filter' in g) g.filter = 'blur(' + Math.max(1, Math.round(DEEP_PX * 0.45)) + 'px)';
    g.drawImage(deepScratch, 0, 0);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = DEEP_ROCK;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    releaseCanvas(deepScratch); deepScratch = null;
    deepCanvas = c; deepStage = 2;
  }
  /** The deep mass as the alpha the player sees: its circles rasterised at 8 cells per tile (the bake's own 8 px per tile) and blurred
   *  with three box passes that approximate deepStage2's gaussian (4 px). No read-back from the canvas. Float32 0..1, OW x OH.
   *  Built over four calls (one per frame: the raster, then one blur pass each), so no single frame pays for all of it: on a phone at
   *  4x the whole thing was a 30+ ms task during the level's fade-in (verification 2026-10-08). Returns the array when done, else null. */
  function deepAlphaStep(OW, OH, RS) {
    if (deepAlStep === 0) {
      const a = deepAl = new Float32Array(OW * OH); deepAlTmp = new Float32Array(OW * OH);
      for (let i = 0; i < deepCount; i++) {
        const cx = deepCircles[i * 3], cy = deepCircles[i * 3 + 1], r = deepCircles[i * 3 + 2], r2 = r * r;
        const x0 = Math.max(0, Math.floor((cx - r) * RS)), x1 = Math.min(OW - 1, Math.ceil((cx + r) * RS));
        const y0 = Math.max(0, Math.floor((cy - r) * RS)), y1 = Math.min(OH - 1, Math.ceil((cy + r) * RS));
        for (let yy = y0; yy <= y1; yy++) {
          const dy = (yy + 0.5) / RS - cy;
          for (let xx = x0; xx <= x1; xx++) { const dx = (xx + 0.5) / RS - cx; if (dx * dx + dy * dy <= r2) a[yy * OW + xx] = 1; }
        }
      }
      deepAlStep = 1;
      return null;
    }
    const a = deepAl, t = deepAlTmp, R = 3, inv = 1 / (2 * R + 1);
    for (let y = 0; y < OH; y++) { // horizontal: running sum, edges clamp to the border cell
      const row = y * OW; let sum = 0;
      for (let k = -R; k <= R; k++) sum += a[row + Math.min(OW - 1, Math.max(0, k))];
      for (let x = 0; x < OW; x++) {
        t[row + x] = sum * inv;
        sum += a[row + Math.min(OW - 1, x + R + 1)] - a[row + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < OW; x++) { // vertical
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += t[Math.min(OH - 1, Math.max(0, k)) * OW + x];
      for (let y = 0; y < OH; y++) {
        a[y * OW + x] = sum * inv;
        sum += t[Math.min(OH - 1, y + R + 1) * OW + x] - t[Math.max(0, y - R) * OW + x];
      }
    }
    if (++deepAlStep <= 3) return null;
    deepAlStep = 0; deepAlTmp = null;
    const done = deepAl; deepAl = null;
    return done;
  }
  function deepStage3(tint) {
    // foliage on the deep rock's floors and ceilings (the sprites are the near plants, tinted dark), drawn live at screen
    // resolution (drawDeepRock). r47: each plant is anchored on the edge of the mass AS DRAWN (the blurred alpha, deepAlpha), not on
    // the tile edge: the blobs of the water cells next to a rock cell (r 0.55-0.95) and the blur move the visible edge up to a tile
    // from the tile's own, which left bases sunk in the face (pasted on the rock) or floating beside it. A plant is kept only where
    // the rock under its base is solid, the water in front of it is open (not a small pocket in the mass), and the edge is about
    // level under the whole base.
    const W = world.width, H = world.height, RS = DEEP_PX, OW = W * RS, OH = H * RS;
    const al = deepAlphaStep(OW, OH, RS);
    if (!al) return; // the alpha is still being built (one part per frame); deepStage stays 2
    const A = (wx, wy) => al[Math.min(OH - 1, Math.max(0, Math.floor(wy * RS))) * OW + Math.min(OW - 1, Math.max(0, Math.floor(wx * RS)))];
    // the y where the mass's alpha falls through 0.5 going out of it from (wx, wy) in direction dir (-1 up, +1 down); null if the start is not in it
    const edgeOf = (wx, wy, dir) => {
      if (A(wx, wy) < 0.6) return null;
      let prev = wy;
      for (let n = 1; n <= 2.5 * RS; n++) { const yy = wy + dir * n / RS; if (A(wx, yy) < 0.5) return (yy + prev) / 2; prev = yy; }
      return null;
    };
    const list = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (world.tileAt(x, y) === 0) continue;
        const h = deepHash(x * 3 + 1, y * 5 + 2);
        const floor = world.tileAt(x, y - 1) === 0, ceil = world.tileAt(x, y + 1) === 0;
        if (!(floor && h % 3 === 0) && !(ceil && !floor && h % 5 === 0)) continue;
        const dyIn = floor ? 1 : -1; // one tile into the rock, and the neighbours of that tile: the mass under the plant is thick
        if (!deepSolid(x, y + dyIn) || !deepSolid(x - 1, y) || !deepSolid(x + 1, y) || !deepSolid(x - 1, y + dyIn) || !deepSolid(x + 1, y + dyIn)) continue;
        const img = (h >>> 8) & 1, ph = 1.5 + ((h >>> 12) % 10) / 10, pw = ph * (tint[img].width / tint[img].height);
        const dir = floor ? -1 : 1; // out of the rock, into the water
        let lo = Infinity, hi = -Infinity, ok = true;
        const half = Math.min(0.75, pw * 0.4);
        for (let o = -1; o <= 1 && ok; o++) {
          const e = edgeOf(x + 0.5 + o * half, y + 0.5, dir);
          if (e === null) ok = false; else { if (e < lo) lo = e; if (e > hi) hi = e; }
        }
        if (!ok || hi - lo > 0.5) continue; // an uneven or distant edge: the base would sink at one side and float at the other
        const edge = floor ? hi : lo; // the sample deepest in the rock, so no part of the base floats over a dip
        const by = edge - dir * 0.1; // a hair under the drawn edge
        let good = true;
        for (let o = -1; o <= 1 && good; o++) {
          const sxp = x + 0.5 + o * half;
          if (A(sxp, by - dir * 0.35) < 0.8 || A(sxp, by + dir * 0.6) > 0.3) good = false;
        }
        if (!good) continue;
        list.push({ x: x + 0.5, y: by, pw, ph, ceil: !floor, img });
      }
    }
    deepPlantList = list; deepCircles = null; deepStage = 3;
  }
  /** One step of the deep-rock bake per call (the renderer calls it once a frame while the level is new). */
  function stepDeepRock() {
    if (!world.level || !world.tileAt) return false;
    if (deepLevel !== world.level) { resetDeepRock(); deepLevel = world.level; }
    if (deepStage === 0) deepStage1();
    else if (deepStage === 1) deepStage2();
    else if (deepStage === 2) { const tint = deepTintOf(plants); if (tint) deepStage3(tint); else return false; } // five calls: the alpha in four, then the list
    else return false;
    return true;
  }
  function drawDeepRock(canvasW, canvasH, depth) {
    if (!deepCanvas || deepLevel !== world.level) return;
    const ppu = camera.pxPerUnit, W = world.width, H = world.height, cx0 = W / 2, cy0 = H / 2, s = DEEP_SCALE;
    const camLx = cx0 + (camera.x - cx0) * DEEP_PARALLAX, camLy = cy0 + (camera.y - cy0) * DEEP_PARALLAX;
    const dx = canvasW / 2 + (cx0 * (1 - s) - camLx) * ppu, dy = canvasH / 2 + (cy0 * (1 - s) - camLy) * ppu;
    const dw = W * s * ppu, dh = H * s * ppu;
    if (dx > canvasW || dy > canvasH || dx + dw < 0 || dy + dh < 0) return;
    ctx.save();
    ctx.globalAlpha = 1 - Math.min(0.5, depth / 240);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(deepCanvas, dx, dy, dw, dh);
    // the plants, live at screen resolution and culled to the view
    const k = s * ppu, tint = sa.deepTint;
    if (tint) for (let i = 0; i < deepPlantList.length; i++) {
      const pl = deepPlantList[i];
      const px = dx + pl.x * k, py = dy + pl.y * k, w = pl.pw * k, h = pl.ph * k;
      if (px + w < 0 || px - w > canvasW || py + h < 0 || py - h > canvasH) continue;
      const img = tint[pl.img];
      if (pl.ceil) { ctx.save(); ctx.translate(px, py); ctx.scale(1, -1); ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore(); }
      else ctx.drawImage(img, px - w / 2, py - h, w, h);
    }
    ctx.restore();
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

  // Round 32: the dim Shallows. `lightR` is the octopus's light radius in tiles (items.js: 4.5, a lantern 8.5): clear
  // inside half of it, falling to a soft dark vignette (alpha DIM_MAX) by 1.6 times it. 0 = no dimming.
  const DIM_MAX = 0.64;
  function drawLight(canvasW, canvasH, sx, sy, lightR) {
    const ppu = camera.pxPerUnit;
    const grad = ctx.createRadialGradient(sx, sy, lightR * 0.5 * ppu, sx, sy, lightR * 1.6 * ppu);
    grad.addColorStop(0, 'rgba(2,8,18,0)');
    grad.addColorStop(0.45, 'rgba(2,8,18,' + (DIM_MAX * 0.4).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(2,8,18,' + DIM_MAX + ')');
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

  // Round 35: the approach cue. While the Beholder is off screen, a red pulsing arrow sits on the screen edge in its
  // direction (bigger and faster as it closes in); once it is on screen the dread glow above takes over.
  function drawBeholderCue(canvasW, canvasH, beholder, dreadLevel, time, reduced) {
    if (!beholder) return;
    const s = worldToScreen(camera, canvasW, canvasH, beholder.x, beholder.y);
    const m = camera.pxPerUnit * 1.2;
    if (s.x > -m && s.x < canvasW + m && s.y > -m && s.y < canvasH + m) return;
    const cx = canvasW / 2, cy = canvasH / 2;
    const dx = s.x - cx, dy = s.y - cy;
    const inset = camera.pxPerUnit * 0.9;
    const k = Math.min((cx - inset) / (Math.abs(dx) || 1e-6), (cy - inset) / (Math.abs(dy) || 1e-6));
    const ax = cx + dx * k, ay = cy + dy * k;
    const near = Math.max(0.35, dreadLevel);
    const pulse = reduced ? 1 : 0.75 + 0.25 * Math.sin(time * (5 + near * 7));
    const size = camera.pxPerUnit * (0.5 + 0.45 * near) * pulse;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = `rgba(255,50,50,${(0.55 + 0.4 * near).toFixed(3)})`;
    ctx.strokeStyle = 'rgba(40,0,0,0.85)';
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(size * 0.6, 0); ctx.lineTo(-size * 0.45, -size * 0.55); ctx.lineTo(-size * 0.2, 0); ctx.lineTo(-size * 0.45, size * 0.55); ctx.closePath();
    ctx.stroke(); ctx.fill();
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
  // (r46: the vines' 1.9-tile height, their 0.035 rad sway and PLANT_INTO_WALL's 0.4 sink now live in data/foliage.json
  // as plant1 / plant2's "h", "sway" and "sink", next to every other kind's)
  const SWAY_SPEED = 0.7; // rad/s equivalent, per-plant phase-shifted below

  // Round 46 (Daniel: "add some horizontal or vertical offset... specific offsets per each plant", "I had way more types
  // of foliage"): the plants come from foliage.js's placement -- every original FoliageItem (data/foliage.json) with its own
  // offsets, jitter, Perlin patches and caps, a per-instance scale / mirror / sway phase, no kind repeated on the next cell.
  // Each instance is drawn with its base point (inside the rock, under the wall bake) at the origin, turned to its surface.
  const FALLBACK_SEED = 0x51a7;
  function drawFoliageInstance(F, i, ox, oy, time, reduced) {
    const T = getFoliageTable();
    const k = F.kind[i], surf = F.surf[i], base = T.base[k];
    const ext = T.ext[k];
    const img = ext ? plants[ext === 'plant2' ? 1 : 0] : sheetImg;
    if (!img.complete || !img.naturalWidth) return;
    const ppu = camera.pxPerUnit, sc = F.scale[i];
    const iw = ext ? img.naturalWidth : T.sw[k], ih = ext ? img.naturalHeight : T.sh[k];
    const h = T.h[k] * sc * ppu, w = T.w[k] > 0 ? T.w[k] * sc * ppu : h * (iw / ih);
    const s = worldToScreen(camera, canvasW_, canvasH_, F.x[i] + ox, F.y[i] + oy);
    const r = Math.max(w, h);
    if (s.x < -r || s.x > canvasW_ + r || s.y < -r || s.y > canvasH_ + r) return;
    const ph = F.phase[i];
    ctx.save();
    ctx.translate(s.x, s.y);
    if (surf === SURF_HOVER) { // the little green fish: bobs and drifts under its ceiling, facing its way
      const t = reduced ? 0 : time;
      ctx.translate(Math.sin(t * 0.5 + ph) * 0.15 * ppu, Math.sin(t * 1.3 + ph * 1.7) * 0.06 * ppu);
      ctx.scale(Math.cos(t * 0.5 + ph) > 0 ? -1 : 1, 1);
      ctx.drawImage(img, T.sx[k], T.sy[k], iw, ih, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
    // turn the art so its base edge faces the rock
    if (surf === SURF_WALL) {
      const rockRight = F.nx[i] < 0;
      if (base === BASE_BOTTOM) ctx.rotate(rockRight ? -Math.PI / 2 : Math.PI / 2);
      else if (!rockRight) ctx.scale(-1, 1); // base 'right': mirrored for rock on the left
    } else if (surf === SURF_CEIL && base === BASE_BOTTOM && T.mirror[k]) ctx.scale(1, -1); // floor art hung from a ceiling
    const sway = reduced ? 0 : Math.sin(time * SWAY_SPEED * (0.8 + 0.4 * ((k * 7 + 3) % 5) / 5) + ph) * T.sway[k];
    if (sway) ctx.rotate(sway);
    if (F.flip[i] && surf !== SURF_WALL) ctx.scale(-1, 1);
    const dx = base === BASE_RIGHT ? -w : -w / 2, dy = base === BASE_TOP ? 0 : base === BASE_RIGHT ? -h / 2 : -h;
    if (ext) ctx.drawImage(img, dx, dy, w, h); else ctx.drawImage(img, T.sx[k], T.sy[k], iw, ih, dx, dy, w, h);
    ctx.restore();
  }

  // worldToScreen/camera don't need per-call canvas dims beyond what the
  // caller already has; stashed on module-local vars each call so
  // `drawFoliageInstance` doesn't need its own canvasW/canvasH parameters.
  let canvasW_ = 0, canvasH_ = 0;
  const plantCache = new WeakMap();

  /** A chunk's foliage, worked out once per tile change (or keep-out change: a quest cage added after the level was made). */
  // r43: the anchors are found in one go, the cluster mates a few at a time (PLANT_MATES_MS per call, about 4 ms), so a new level or a
  // bomb does not cost one 30-60 ms task; until the new placement is ready the previous one keeps drawing
  const PLANT_MATES_MS = 4;
  function plantEntry(chunk, index) {
    const T = getFoliageTable();
    if (!T) return null;
    let e = plantCache.get(chunk);
    const ver = world.v2 ? world.tileVersion : 0, kv = chunk.keepVer | 0;
    if (!e) { e = { ver: -1, kv: -1, F: null, vis: null, job: null }; plantCache.set(chunk, e); }
    // one piece per call on v2 (r44's set-up budget): the anchors, then cluster mates PLANT_MATES_MS at a time, then the placement
    if (e.ver !== ver || e.kv !== kv) {
      e.ver = ver; e.kv = kv; e.job = createFoliageCandidates(chunk, chunkW, chunkH, index);
      if (world.v2) return e;
    }
    if (e.job && !e.job.done) { stepFoliageCandidates(e.job, world.v2 ? PLANT_MATES_MS : Infinity); if (world.v2) return e; }
    if (e.job && e.job.done) {
      e.F = placeFoliageCells(T, chunk, chunkW, chunkH, e.job.cand, chunk.salt === undefined ? (FALLBACK_SEED + index * 2654435761) >>> 0 : chunk.salt);
      e.vis = new Uint8Array(e.F.n); e.job = null;
    }
    return e;
  }
  /** True once a chunk's foliage is placed for its current tiles and keep-outs. */
  function plantsReady(chunk) {
    const e = plantCache.get(chunk);
    return !!e && e.ver === (world.v2 ? world.tileVersion : 0) && e.kv === (chunk.keepVer | 0) && !e.job && !!e.F;
  }
  /** r44: ONE piece of a new level's set-up per frame behind the dark screen (before, a set-up frame did the plant anchors of every chunk, a
   *  deep-rock step and the cell bakes together: a 50-80 ms task at 4x on a phone): one piece of one chunk's foliage (r46: its
   *  anchors, a few cluster mates, or the placement), then the deep-rock steps one by one, then the wall cells (updateCells keeps its
   *  own per-frame budget). */
  function setupPiece(canvasW, canvasH, resident) {
    if (getFoliageTable()) {
      for (const { index, chunk } of resident) {
        if (!plantsReady(chunk)) { plantEntry(chunk, index); return; }
      }
    }
    plantsWarm = true;
    if (deepStage < 3 && stepDeepRock()) return;
    updateCells(canvasW, canvasH);
  }
  let plantsWarm = false;
  const timing = { warmMs: 0, warmMax: 0, wallsMs: 0, wallsMax: 0 }; // r43: the level's set-up steps and the wall drawing (with its cell bakes), worst frame so far

  function drawPlants(canvasW, canvasH, resident, time = 0, reduced = false) {
    canvasW_ = canvasW; canvasH_ = canvasH;
    for (const { index, yOffset, chunk } of resident) {
      const e = plantEntry(chunk, index);
      if (!e || !e.F) continue;
      const F = e.F;
      for (let i = 0; i < F.n; i++) {
        if (chunk.tiles[F.support[i]] === 0) continue; // its rock was bombed away (the new placement follows in a few frames)
        if (F.surf[i] === SURF_HOVER && isAmbientDead(F.x[i], F.y[i] + yOffset)) continue; // inked (ambient.js)
        if (!visibleAt(e.vis, i, F.x[i], F.y[i] + yOffset, 3)) continue; // r43: off-screen foliage is not swayed or drawn
        drawFoliageInstance(F, i, 0, yOffset, time, reduced);
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
  // round 28: a flat-rock tile baked like a wall chunk (fill + world-aligned noise), cached per noise phase
  const capCache = new Map();
  // r44: the grain repeats every NOISE_FIELD_TILES tiles, so the flat rock above the top resident chunk is tiled from one square of
  // that size per noise phase (it was a chunk-sized canvas, 6.7 MB on a phone, per phase)
  function getCapTile(yOffsetTiles) {
    const phase = ((Math.round(yOffsetTiles) % NOISE_FIELD_TILES) + NOISE_FIELD_TILES) % NOISE_FIELD_TILES;
    let c = capCache.get(phase);
    if (!c) {
      const px = NOISE_FIELD_TILES * BAKE_PX_PER_UNIT;
      c = acquireCanvas(px, px);
      const b = c.getContext('2d');
      b.fillStyle = `rgb(${WALL_FILL_COLOR.join(',')})`;
      b.fillRect(0, 0, c.width, c.height);
      if (rockNoisePattern) paintNoise(b, 0, phase, c.width, c.height);
      capCache.set(phase, c);
    }
    return c;
  }

  function drawWalls(canvasW, canvasH, resident) {
    if (world.v2) { drawBandWalls(canvasW, canvasH); return; }
    let capped = false;
    if (resident.length) {
      // endless mode: the chunks above the top resident one were dropped and count as solid (world.tileAt),
      // so draw them as rock too, instead of open water cut flat
      const topEntry = resident[0];
      const cutY = Math.round(worldToScreen(camera, canvasW, canvasH, 0, topEntry.yOffset).y);
      if (topEntry.index > 0 && cutY > 0) {
        capped = true;
        // round 28: paint the cap exactly like a baked chunk (same canvas fill + paintNoise, then the same scaled
        // drawImage), one chunk-sized tile at a time going up, so brightness and grain match across the join
        const flat = `rgb(${WALL_FILL_COLOR.join(',')})`;
        ctx.save();
        ctx.fillStyle = flat;
        ctx.fillRect(0, 0, canvasW, cutY + 1);
        let yOff = topEntry.yOffset - chunkH;
        for (let j = 0; j < 8; j++, yOff -= chunkH) {
          const brTop = worldToScreen(camera, canvasW, canvasH, chunkW, yOff + chunkH);
          if (brTop.y < 0) break;
          const T = NOISE_FIELD_TILES, tile = getCapTile(yOff);
          for (let ty = 0; ty < chunkH; ty += T) {
            const tl = worldToScreen(camera, canvasW, canvasH, 0, yOff + ty);
            const br = worldToScreen(camera, canvasW, canvasH, T, yOff + ty + T);
            const y0 = Math.round(tl.y), y1 = Math.round(br.y);
            if (y1 <= y0 || y1 < 0 || y0 > canvasH) continue;
            const lastRow = ty + T >= chunkH;
            for (let tx = 0; tx < chunkW; tx += T) {
              const a = worldToScreen(camera, canvasW, canvasH, tx, 0).x, b = worldToScreen(camera, canvasW, canvasH, tx + T, 0).x;
              const x0 = Math.round(a), x1 = Math.round(b);
              if (x1 <= 0 || x0 >= canvasW) continue;
              ctx.drawImage(tile, x0, y0, x1 - x0, y1 - y0 + (j === 0 && lastRow ? 1 : 0));
            }
          }
        }
        ctx.restore();
      }
    }
    const ct = cellTiles(), ncx = Math.ceil(chunkW / ct), nry = Math.ceil(chunkH / ct);
    const ringPx = ct * camera.pxPerUnit * 0.5; // a cell that has left the screen stays baked until it is half a cell away (so a camera that turns back does not re-bake), then it goes back to the pool
    for (const entry of resident) {
      const e = chunkEntry(entry);
      const M = CHUNK_MARGIN_PX, s = BAKE_PX_PER_UNIT;
      for (let ry = 0; ry < nry; ry++) {
        const y0w = ry * ct, h = Math.min(ct, chunkH - y0w);
        const tl0 = worldToScreen(camera, canvasW, canvasH, 0, entry.yOffset + y0w);
        const br0 = worldToScreen(camera, canvasW, canvasH, 0, entry.yOffset + y0w + h);
        const y0 = Math.round(tl0.y), y1 = Math.round(br0.y);
        for (let cx = 0; cx < ncx; cx++) {
          const x0w = cx * ct, w = Math.min(ct, chunkW - x0w);
          const x0 = Math.round(worldToScreen(camera, canvasW, canvasH, x0w, 0).x), x1 = Math.round(worldToScreen(camera, canvasW, canvasH, x0w + w, 0).x);
          const key = ry * ENDLESS_KEY + cx;
          const onScreen = x1 > 0 && x0 < canvasW && y1 > 0 && y0 < canvasH;
          let canvas = e.cells.get(key);
          if (!onScreen) {
            const near = x1 > -ringPx && x0 < canvasW + ringPx && y1 > -ringPx && y0 < canvasH + ringPx;
            if (canvas && !near) { releaseCanvas(canvas); e.cells.delete(key); }
            continue;
          }
          if (!canvas) canvas = bakeChunkCell(entry, e, cx, ry);
          if (y1 <= y0) continue;
          const coreH = h * s;
          if (capped && entry === resident[0] && ry === 0) {
            // the cap line: keep the top margin so a rim lying on the chunk edge bakes at full thickness
            const k = (y1 - y0) / coreH;
            ctx.drawImage(canvas, 0, 0, w * s, M + coreH, x0, y0 - M * k, x1 - x0, (y1 - y0) + M * k);
          } else {
            ctx.drawImage(canvas, 0, M, w * s, coreH, x0, y0, x1 - x0, y1 - y0);
          }
        }
      }
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
  let outerAll = false; // the death camera is on: fill past the top and bottom of the level as well
  function drawOuterRock(canvasW, canvasH) {
    const left = worldToScreen(camera, canvasW, canvasH, 0, 0).x;
    const right = worldToScreen(camera, canvasW, canvasH, chunkW, 0).x;
    ctx.save();
    if (world.v2) {
      // materials: beyond the level is the same indestructible bedrock as its border
      if (left <= 0 && right >= canvasW) { ctx.restore(); return; }
      const img = artImg('matBedrock');
      const o = worldToScreen(camera, canvasW, canvasH, 0, 0), k = camera.pxPerUnit;
      const fills = [MAT_FILL[MAT_BEDROCK]];
      const pat = img ? ctx.createPattern(img, 'repeat') : null;
      if (pat && pat.setTransform) { const kk = (4 * k) / (img.naturalWidth || img.width); pat.setTransform(new DOMMatrix([kk, 0, 0, kk, o.x, o.y])); fills.push(pat); }
      fills.push(MAT_TINT[MAT_BEDROCK]);
      for (const f of fills) {
        ctx.fillStyle = f;
        if (left > 0) ctx.fillRect(0, 0, left, canvasH);
        if (right < canvasW) ctx.fillRect(right, 0, canvasW - right, canvasH);
      }
      ctx.restore();
      return;
    }
    ctx.fillStyle = `rgb(${WALL_FILL_COLOR.join(',')})`;
    // the death camera (V2-PLAN 14) may look past the top or bottom of the level under the death panel: rock there too
    const top = outerAll ? worldToScreen(camera, canvasW, canvasH, 0, 0).y : 0;
    const bottom = outerAll ? worldToScreen(camera, canvasW, canvasH, 0, world.height).y : canvasH;
    for (let pass = 0; pass < (rockNoisePattern ? 2 : 1); pass++) {
      if (pass === 1) ctx.fillStyle = rockNoisePattern;
      if (left > 0) ctx.fillRect(0, 0, left, canvasH);
      if (right < canvasW) ctx.fillRect(right, 0, canvasW - right, canvasH);
      if (top > 0) ctx.fillRect(0, 0, canvasW, top);
      if (bottom < canvasH) ctx.fillRect(0, bottom, canvasW, canvasH - bottom);
    }
    ctx.restore();
  }

  function drawPickups(canvasW, canvasH, items, time) {
    for (const it of items) {
      if (it.hidden) continue; // sealed behind soft rock; nothing to draw until it breaks
      if (!visibleObj(it, it.x, it.y, 1)) continue; // r43: off-screen pickups are not animated or drawn
      const s = worldToScreen(camera, canvasW, canvasH, it.x, it.y);
      if (it.type === 'plankton') {
        const r = camera.pxPerUnit * 0.045;
        ctx.save();
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 4 + it.phase);
        ctx.fillStyle = '#9dffd8';
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (it.type === 'shell') {
        const kindImg = it.sk ? shellImgs.kinds[it.sk] : null; // V2: the currency kinds (cowrie, conch, nautilus, pearl); endless keeps the blue shell
        const img = kindImg || shellImgs.blue;
        const size = camera.pxPerUnit * (kindImg ? SHELL_SIZE[it.sk] : 0.7);
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
      if (!visibleObj(b, b.x, b.y, 1)) continue; // r43
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
    if (o.hidden) { o.__drawn = null; return; } // r45: gone into a whirlpool
    const ix = o.prevX + (o.x - o.prevX) * alpha;
    const iy = o.prevY + (o.y - o.prevY) * alpha;
    const s = worldToScreen(camera, canvasW, canvasH, ix, iy);
    // r45: going into a whirlpool (main.js stepEntry): the turn and the scale come from the scripted pose, interpolated like the position
    const e = o.entry;
    const rot = e ? e.prot + (e.rot - e.prot) * alpha : o.angle;
    const k = e ? e.psc + (e.sc - e.psc) * alpha : 1;
    o.__drawn = { x: ix, y: iy, sx: s.x, sy: s.y, rot, scale: k };
    // Actions tuning: dash i-frames (octopus.js dashInvuln) read as a brief translucent smear: two faint after-images trailing
    // back along the velocity (dark ink silhouettes), fading with the i-frames, and the body itself a touch see-through. No blink.
    const phase = !o.dead && !e && o.dashInvuln > 0 ? Math.min(1, o.dashInvuln / DASH_IFRAMES) : 0;
    if (phase > 0) {
      const sp = Math.hypot(o.vx, o.vy) || 1, back = 0.22 * Math.min(sp, 20) * camera.pxPerUnit / 20 * 1.6;
      for (let g = 2; g >= 1; g--) {
        ctx.save();
        ctx.translate(s.x - (o.vx / sp) * back * g, s.y - (o.vy / sp) * back * g);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.scale(camera.pxPerUnit * k, camera.pxPerUnit * k);
        o.__t = time; o.__speed = sp;
        if ('filter' in ctx) ctx.filter = 'brightness(0.15)'; // an ink-dark silhouette: no second pair of eyes in the smear
        drawOctopus(ctx, o, (g === 1 ? 0.35 : 0.18) * phase);
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((rot * Math.PI) / 180);
    const sc = camera.pxPerUnit * k;
    ctx.scale(sc, sc);
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
    const octoAlpha = o.invulnTimer > 0 && !o.dead && !o.noBlink && !e ? (Math.sin(time * 24) > 0 ? 1 : 0.35) : 1;
    drawOctopus(ctx, o, phase > 0 ? Math.min(octoAlpha, 1 - 0.15 * phase) : octoAlpha);
    ctx.restore();
  }

  return {
    camera,
    /** r41: release every canvas this renderer baked (wall bands and chunks, caps, the deep-rock bake and its tinted plants, ambient silhouettes) and stop listening for art. After this the renderer must not draw again. */
    dispose() {
      if (disposed) return;
      disposed = true;
      offV2Art(onArt);
      releaseCanvases(wallCache); releaseCanvases(bandCache); releaseCanvases(capCache);
      resetDeepRock(); deepLevel = null;
      releaseCanvas(caveArtFeathered); caveArtFeathered = null;
    },
    /** Actions tuning: the live foliage hover fish (the little greenranha) of the resident chunks, as {x, y, phase} in world
     *  tiles (their base: ambient.js ambientPos adds the drawn drift). Writes into `out` (reused objects) and returns the count. */
    hoverFish(resident, out) {
      let n = 0;
      for (const { index, yOffset, chunk } of resident) {
        const e = plantCache.get(chunk);
        if (!e || !e.F) continue;
        const F = e.F;
        for (let i = 0; i < F.n; i++) {
          if (F.surf[i] !== SURF_HOVER || chunk.tiles[F.support[i]] === 0) continue;
          const y = F.y[i] + yOffset;
          if (isAmbientDead(F.x[i], y)) continue;
          const o = out[n] || (out[n] = { x: 0, y: 0, phase: 0 });
          o.x = F.x[i]; o.y = y; o.phase = F.phase[i]; n++;
        }
      }
      return n;
    },
    /** r43: the first screen of this level is baked (every wall cell on screen, the deep rock's blobs): the level may fade in. */
    ready() { return !world.v2 || (wallsReady && deepStage >= 2); },
    /** r41 test hook: live canvases this renderer holds. */
    canvasStats() {
      let n = 0, bytes = 0;
      const add = (c) => { if (c && c.width * c.height > 0) { n++; bytes += c.width * c.height * 4; } };
      for (const m of [wallCache, bandCache, capCache]) for (const v of m.values()) eachCanvas(v, add);
      add(deepCanvas); add(deepScratch); add(caveArtFeathered);
      let maxW = 0, maxH = 0;
      for (const m of [wallCache, bandCache, capCache]) for (const v of m.values()) eachCanvas(v, (c) => { if (c) { maxW = Math.max(maxW, c.width); maxH = Math.max(maxH, c.height); } });
      for (const c of [deepCanvas, deepScratch, caveArtFeathered]) if (c) { maxW = Math.max(maxW, c.width); maxH = Math.max(maxH, c.height); }
      return { n, bytes, maxW, maxH, bake: BAKE_PX_PER_UNIT, cells: bandCache.size, deepStage };
    },
    /** r43: the slowest set-up step (plant anchors, one deep-rock step) and the slowest wall pass (cell bakes) of this level, in ms. */
    timing() { return { warmMax: +timing.warmMax.toFixed(1), wallsMax: +timing.wallsMax.toFixed(1) }; },
    /** Materials test hook: bake (if needed) and return v2 wall cell (band bi, column ci) with its tile origin and px per tile. */
    debugCell(bi, ci) {
      const key = bi * CELL_KEY + ci;
      const c = bandCache.get(key);
      if (!c || c.version !== world.bandVersion(bi) || c.art !== artGen || c.touch !== bandTouchOf(bi)) bakeCell(bi, ci);
      return { canvas: bandCache.get(key).canvas, x0: ci * cellTiles(), y0: bi * world.bandRows, cols: cellTiles(), rows: world.bandRows, s: BAKE_PX_PER_UNIT };
    },
    /** v2: how many wall bands are cached / were on screen last frame. */
    wallBandStats() { const rowsLive = new Set(); for (const k of bandCache.keys()) rowsLive.add(Math.floor(k / CELL_KEY)); return { live: rowsLive.size, cells: bandCache.size, bakes: bandBakes, maxBakeMs: +bandBakeMaxMs.toFixed(2), lastBakeMs: +bandBakeLastMs.toFixed(2) }; },
    render(canvasW, canvasH, octo, alpha, time, frameDt, {
      warmOnly = false, warmGroup = 0, resident, pickups, bubbles, critters = [], depth, enemies = [], shots = [], bombs = [], particles = null, shakeOffset, shakePx: shakePxIn = null, preEnemyDraw = null, preWallDraw = null, dreadLevel = 0, extraDraw = null, postOctoDraw = null, followBias = null, lightR = 0, deathFocus = null,
    }) {
      // Drop wall-bake canvases for chunks the world has evicted, or their
      // offscreen canvases (48px/unit x 32x24 units each) leak for the life
      // of the run (~10 min soak test caught this: heap kept climbing).
      const liveIdx = new Set(resident.map((r) => r.index));
      if (!world.v2) for (const ci of [...wallCache.keys()]) if (!liveIdx.has(ci)) { eachCanvas(wallCache.get(ci), releaseCanvas); wallCache.delete(ci); }
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
      // r40: an optional lean of the camera target (the pool keeps its pedestal in view); the octopus's own pull-back clamp still applies
      const camX = followBias ? followX + (followBias.x - followX) * followBias.k : followX;
      const camY = followBias ? followY + (followBias.y - followY) * followBias.k : followY;
      // V2-PLAN 14: a dead octopus is framed in the part of the screen the death panel leaves free
      if (deathFocus) updateDeathCamera(camera, canvasW, canvasH, followX, followY, world.width, world.height, frameDt, deathFocus, deathFocus.strict);
      else updateCamera(camera, canvasW, canvasH, followX, followY, world.width, world.height, frameDt, octo.vx, octo.vy, camX, camY);
      outerAll = !!deathFocus;
      if (warmOnly && warmGroup < 0) return; // r44: a frame behind the dark screen that main.js uses to run the simulation's first updates: nothing to set up or draw
      if (warmOnly && warmGroup <= 0) {
        // r43: the screen is dark while a new level's first view bakes: do only the set-up (plant anchors, the deep rock, the wall
        // cells) and draw nothing, so these frames stay cheap
        if (world.v2) setupPiece(canvasW, canvasH, resident);
        return;
      }
      // r43: a warm-up frame (warmGroup 1..5, behind the dark screen) draws one group of the scene so the first real frame does not
      // meet every draw path for the first time at once; warmGroup 0 outside a warm-up draws everything (warmOnly with warmGroup <= 0 is a set-up frame, handled above)
      const G = (n) => !warmGroup || warmGroup === n;
      cullFrame(camera, canvasW, canvasH); // r43: what is far from the camera is not drawn or animated (cull.js); its logic keeps running
      const shakePx = shakePxIn ? shakePxIn : shakeOffset ? { x: shakeOffset.x * camera.pxPerUnit, y: shakeOffset.y * camera.pxPerUnit } : { x: 0, y: 0 };
      ctx.save();
      ctx.translate(shakePx.x, shakePx.y);
      const reduced = prefersReducedMotion();
      // r43: a new level's heavy set-up runs one piece per frame, never several in one: the plant anchors first, then the three
      // deep-rock steps (and the wall cells, a few per frame, see drawBandWalls)
      const tf0 = performance.now();
      if (!warmOnly && world.v2) { if (!plantsWarm) { for (const { index, chunk } of resident) plantEntry(chunk, index); plantsWarm = true; } else stepDeepRock(); }
      timing.warmMs = performance.now() - tf0; if (timing.warmMs > timing.warmMax) timing.warmMax = timing.warmMs;
      if (G(1)) drawBackground(canvasW, canvasH, time, depth);
      if (G(1)) drawCaustics(canvasW, canvasH, time, reduced);
      // Round-12 "fill the cave" pass, section 2: distant background
      // silhouettes/motes, behind everything (drawWalls, below, composites
      // opaque rock right over this same as it does the FG plants).
      if (G(1) && world.v2) drawDeepRock(canvasW, canvasH, depth);
      if (G(1)) drawAmbientBackground(canvasW, canvasH, resident, time, depth, reduced);
      // Layering pass: plants/decor draw BEFORE the walls now (was after), so
      // the wall bake -- opaque rock art -- composites on top and occludes
      // each sprite's anchor-tucked base (see PLANT_INTO_WALL / decor.js's
      // own INTO_WALL for critters). Matches the sorting-layer order in the
      // Unity original too: the foliage prefabs sit on the "Default" sorting
      // layer, the tilemap on "Map", which renders after "Default" -- i.e.
      // walls were always meant to composite over decor, not the other way
      // round.
      if (G(1)) drawPlants(canvasW, canvasH, resident, time, reduced);
      // Otter's alive pass; runes are excluded here and drawn again AFTER
      // drawWalls below (Round-4 fix: runes need to land on top of the rock
      // face like a painted mark, not be buried under the opaque wall bake).
      if (G(1)) drawCritters(ctx, camera, worldToScreen, canvasW, canvasH, critters, time, false);
      // Round-3 fix (Daniel's screenshot review: "each light shaft ends in a
      // hard straight vertical edge at the level boundary" -- `drawOuterRock`
      // used to draw right after the background, BEFORE `drawCaustics`, so
      // the light-shaft streaks painted over the outer rock (outside the
      // 32-tile level) but the walls -- drawn later, opaque -- occluded them
      // from ever showing on the level's own rock. Moved into this same
      // "rock" compositing step, after caustics and right alongside
      // `drawWalls`, so outer rock occludes the shafts exactly the same way
      // the level's own walls already do -- no shaft shows on rock anywhere.
      if (G(2)) drawOuterRock(canvasW, canvasH);
      // materials: wall traps and pushable blocks sit below every terrain material, so the walls' edges overlap their bases
      if (G(2) && preWallDraw) preWallDraw(ctx, camera, canvasW, canvasH);
      const tw0 = performance.now();
      if (G(2)) drawWalls(canvasW, canvasH, resident);
      timing.wallsMs = performance.now() - tw0; if (timing.wallsMs > timing.wallsMax) timing.wallsMax = timing.wallsMs;
      // Round-4 fix: runes drawn on top of the just-baked wall art, so they
      // read as a mark painted onto the rock face instead of a sprite the
      // rock bake occludes.
      if (G(2)) drawCritters(ctx, camera, worldToScreen, canvasW, canvasH, critters, time, true);
      if (G(2)) drawBubbles(canvasW, canvasH, bubbles);
      if (G(2)) drawPickups(canvasW, canvasH, pickups, time);
      if (G(3) && preEnemyDraw) preEnemyDraw(ctx, camera, canvasW, canvasH);
      if (G(3)) drawEnemies(ctx, camera, worldToScreen, canvasW, canvasH, enemies, shots, time, alpha);
      if (G(3)) drawBombs(ctx, camera, worldToScreen, canvasW, canvasH, bombs, time);
      if (G(4) && extraDraw) extraDraw(ctx, camera, worldToScreen, canvasW, canvasH);
      if (G(4) && particles) drawParticles(ctx, camera, worldToScreen, canvasW, canvasH, particles);
      if (G(5)) drawOcto(octo, alpha, canvasW, canvasH, time);
      if (G(5) && postOctoDraw) postOctoDraw(ctx, camera, worldToScreen, canvasW, canvasH);
      cullEnd();
      ctx.restore();
      if (!G(5)) return;
      if (lightR > 0) { const o = worldToScreen(camera, canvasW, canvasH, followX, followY); drawLight(canvasW, canvasH, o.x, o.y, lightR); }
      drawDepthTint(canvasW, canvasH, depth);
      drawVignette(canvasW, canvasH);
      const beholder = enemies.find((e) => e.kind === 'beholder' && !e.dead);
      drawBeholderDread(canvasW, canvasH, beholder, dreadLevel, time, reduced);
      drawBeholderCue(canvasW, canvasH, beholder, dreadLevel, time, reduced);
    },
  };
}
