// Rendering: camera, per-chunk baked walls (dirty-flag cache) built from
// Milan's marching-squares-style wall tileset, background (a deep-water
// gradient plus a single non-repeating cave silhouette anchored near the
// surface, matching the title screen), plants anchored to floor surfaces,
// pickups (pearls/plankton/shells), bubbles, the depth tint, and the octopus
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
import { depthTint } from './decor.js';
import { drawEnemies, drawBombs, drawParticles } from './enemy-draw.js';
import { drawCritters } from './decor-draw.js'; // Otter's "alive pass" wall critters, NIGHT-LOG.md
import { prefersReducedMotion } from './config.js';

const ASSET = (name) => new URL(`../assets/${name}`, import.meta.url).href;

const BAKE_PX_PER_UNIT = 48; // resolution chunk wall bakes are rendered at

// The cave silhouette fades out by this world depth, below which the deep
// gradient (plus the existing depth tint / caustics / vignette) carries the
// mood on its own -- comfortably inside a typical run, so it's drawn once in
// world space (never tiled) and simply never comes back once passed.
const CAVE_ART_FADE_START = 30;
const CAVE_ART_FADE_END = 130;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

export function createRenderer(ctx, world) {
  // Wall tileset (Milan's marching-squares-style set, `play/assets/tiles/`):
  //   tile-1  = fully solid (0 exposed edges)
  //   tile-2 / tile-2A = one exposed edge (two art variants, alternated per
  //     tile for texture variety); default orientation is edge-on-top
  //   tile-3  = two adjacent exposed edges (a convex corner); default TL
  //   tile-5  = two opposite exposed edges (a corridor); default top+bottom
  //   tile-0  = isolated / near-isolated (3-4 exposed edges) fallback
  const tileFull = loadImage(ASSET('tiles/tile-1.webp'));
  const tileEdgeA = loadImage(ASSET('tiles/tile-2.webp'));
  const tileEdgeB = loadImage(ASSET('tiles/tile-2A.webp'));
  const tileCorner = loadImage(ASSET('tiles/tile-3.webp'));
  const tileCorridor = loadImage(ASSET('tiles/tile-5.webp'));
  const tileIsland = loadImage(ASSET('tiles/tile-0.webp'));
  // Video-match: Milan's tile art is a solid-black fill plus the teal-green
  // rim; recolour just the black fill to the sampled navy (see module-header
  // comment) once per source image, so the bake loop below keeps drawing
  // these exactly like the raw Image objects but gets the right base colour
  // for free, with zero added per-chunk or per-frame cost.
  const WALL_FILL_COLOR = [34, 56, 112];
  const WALL_FILL_THRESHOLD = 24; // tile art's fill is pure (0,0,0); the rim art is nowhere near this dark
  function recolorWallTile(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0);
    const id = cctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      if (d[i] < WALL_FILL_THRESHOLD && d[i + 1] < WALL_FILL_THRESHOLD && d[i + 2] < WALL_FILL_THRESHOLD) {
        d[i] = WALL_FILL_COLOR[0]; d[i + 1] = WALL_FILL_COLOR[1]; d[i + 2] = WALL_FILL_COLOR[2];
      }
    }
    cctx.putImageData(id, 0, 0);
    return c;
  }
  // Recoloured tile canvases, filled in as each source image loads; bakeChunkWalls
  // draws from here (via pickWallArt's `key`) instead of the raw Image objects.
  const wallArt = {};
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
    fctx.drawImage(caveArt, 0, 0);
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
  const shellImgs = {
    blue: loadImage(ASSET('shell-blue.webp')),
    green: loadImage(ASSET('shell-green.webp')),
    red: loadImage(ASSET('shell-red.webp')),
  };
  const wallTileSources = { full: tileFull, edgeA: tileEdgeA, edgeB: tileEdgeB, corner: tileCorner, corridor: tileCorridor, island: tileIsland };
  let tilesReady = false;
  let pending = Object.keys(wallTileSources).length;
  function onTileReady() { if (--pending === 0) tilesReady = true; }
  for (const [key, img] of Object.entries(wallTileSources)) {
    img.addEventListener('load', () => { wallArt[key] = recolorWallTile(img); onTileReady(); }, { once: true });
  }

  const camera = { x: 0, y: 0, pxPerUnit: 32 };
  const chunkW = world.width, chunkH = world.chunkHeight;

  // --- Per-chunk baked wall cache, rebaked only when a chunk's tiles change
  // (bomb breaks) or when it is seen for the first time. ---
  /** @type {Map<number, {canvas:HTMLCanvasElement, bakedTiles:Uint8Array|null}>} */
  const wallCache = new Map();

  function isSolidLocal(chunk, tx, ty) {
    if (tx < 0 || tx >= chunkW || ty < 0 || ty >= chunkH) return null; // ask neighbour chunk
    const v = chunk.tiles[ty * chunkW + tx];
    return v === 1 || v === 2;
  }

  // Pick which tileset art (and rotation, in quarter turns clockwise) draws
  // a solid tile given which of its 4 orthogonal neighbours are open water.
  // The art's default orientation is edge(s)-on-top(-left); rotating by the
  // returned quarter-turn count moves that edge to match.
  function pickWallArt(openN, openE, openS, openW, altParity) {
    const count = (openN ? 1 : 0) + (openE ? 1 : 0) + (openS ? 1 : 0) + (openW ? 1 : 0);
    if (count === 0) return { key: 'full', turns: 0 };
    if (count >= 3) return { key: 'island', turns: 0 }; // rare thin spur, closest available shape
    if (count === 1) {
      const turns = openN ? 0 : openE ? 1 : openS ? 2 : 3;
      return { key: altParity ? 'edgeB' : 'edgeA', turns };
    }
    // count === 2
    if (openN && openS) return { key: 'corridor', turns: 0 };
    if (openE && openW) return { key: 'corridor', turns: 1 };
    const turns = (openN && openW) ? 0 : (openN && openE) ? 1 : (openE && openS) ? 2 : 3; // 3 = S+W
    return { key: 'corner', turns };
  }

  // Concave (inward) corners -- where both edges touching that corner are
  // solid but the diagonal neighbour beyond it is open -- have no single
  // tileset piece for every count, so round them procedurally: a wedge of
  // the tileset's own rim colour, then a smaller destination-out wedge to
  // cut the actual water notch. k = 0..3 for TL/TR/BR/BL, matching the
  // quarter-turn convention above.
  // Sampled from the rim art in the promo-video reference frames (~rgb(8,104,88));
  // close to the old value, nudged to match exactly.
  const RIM_COLOR = 'rgba(9,100,84,0.95)';
  function carveConcaveCorner(bctx, cx, cy, k, r) {
    const a0 = k * (Math.PI / 2), a1 = a0 + Math.PI / 2;
    bctx.save();
    bctx.beginPath();
    bctx.moveTo(cx, cy);
    bctx.arc(cx, cy, r, a0, a1);
    bctx.closePath();
    bctx.fillStyle = RIM_COLOR;
    bctx.fill();
    bctx.restore();
    bctx.save();
    bctx.globalCompositeOperation = 'destination-out';
    bctx.beginPath();
    bctx.moveTo(cx, cy);
    bctx.arc(cx, cy, r * 0.6, a0, a1);
    bctx.closePath();
    bctx.fill();
    bctx.restore();
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
  // Rock: navy-on-navy variation (darker/lighter than WALL_FILL_COLOR) rather
  // than a contrasting teal speckle, and much lower alpha -- the promo-video
  // reference frames read as close to flat at this art style's resolution,
  // so a loud grain fought the video look as much as the old wrong base
  // colour did. Kept (rather than dropped) per Daniel's Unity-shader
  // ground-truth note, just dialled down to a subtle rock-grain hint.
  const rockNoiseCanvas = buildNoiseTexture(noiseField, NOISE_FIELD_PX, [20, 34, 74], [58, 88, 165], 0.14);
  // Soft/breakable rock: the same field, tinted through the coral palette
  // already used for its rim so the grain matches its own material.
  const coralNoiseCanvas = buildNoiseTexture(noiseField, NOISE_FIELD_PX, [90, 46, 26], [235, 175, 120], 0.20);
  // CanvasPattern only needs *a* 2D context to be created from, not the one
  // it will later be drawn into -- build both patterns once, up front.
  const patternCtx = document.createElement('canvas').getContext('2d');
  const rockNoisePattern = patternCtx.createPattern(rockNoiseCanvas, 'repeat');
  const coralNoisePattern = patternCtx.createPattern(coralNoiseCanvas, 'repeat');

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

  function bakeChunkWalls(entry) {
    const { chunk } = entry;
    let canvas = wallCache.get(entry.index)?.canvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = chunkW * BAKE_PX_PER_UNIT;
      canvas.height = chunkH * BAKE_PX_PER_UNIT;
    }
    const bctx = canvas.getContext('2d');
    const s = BAKE_PX_PER_UNIT;
    bctx.clearRect(0, 0, canvas.width, canvas.height);
    // Round-1 fix (Daniel's screenshot review: the horizontal seam / "wall
    // borders look broken"): a tile's row above/below a chunk boundary used
    // to just assume the neighbouring chunk was solid there, which baked a
    // spurious closed rim cap across passages that actually continue into
    // the next chunk -- a solid-looking line across the whole width at every
    // chunk seam. Ask the real world tile (crossing into the neighbouring
    // chunk via world.tileAt, world.js) for the row above/below instead;
    // left/right of the chunk is still always solid (the level's real outer
    // border, not a chunk seam).
    const solidAt = (tx, ty) => {
      if (tx < 0 || tx >= chunkW) return true;
      if (ty < 0 || ty >= chunkH) {
        const v = world.tileAt(tx, entry.yOffset + ty);
        return v === 1 || v === 2;
      }
      return isSolidLocal(chunk, tx, ty);
    };
    const softTiles = []; // v===2 (breakable) tile rects, textured after the main noise pass
    for (let ty = 0; ty < chunkH; ty++) {
      for (let tx = 0; tx < chunkW; tx++) {
        const v = chunk.tiles[ty * chunkW + tx];
        if (v === 0) continue;
        const px = tx * s, py = ty * s;
        const openN = !solidAt(tx, ty - 1);
        const openE = !solidAt(tx + 1, ty);
        const openS = !solidAt(tx, ty + 1);
        const openW = !solidAt(tx - 1, ty);
        const { key, turns } = pickWallArt(openN, openE, openS, openW, (tx + ty) % 2 === 0);
        const img = wallArt[key];

        bctx.save();
        bctx.translate(px + s / 2, py + s / 2);
        bctx.rotate(turns * (Math.PI / 2));
        bctx.drawImage(img, -s / 2, -s / 2, s, s);
        bctx.restore();

        if (v === 2) {
          // Soft (breakable) rock: same shape, a warm coral tint (flat base
          // colour so it reads as diggable/distinct even before its own
          // noise pass below) so it stays distinct from unbreakable
          // (green-rimmed) walls.
          bctx.save();
          bctx.globalCompositeOperation = 'source-atop';
          bctx.fillStyle = 'rgba(210,130,80,0.30)';
          bctx.fillRect(px, py, s, s);
          bctx.restore();
          softTiles.push({ px, py });
        }

        // Round any concave corner the picked art doesn't already show an
        // open edge at (an open edge there is already handled by the art).
        const r = s * 0.32;
        if (!openN && !openW && !solidAt(tx - 1, ty - 1)) carveConcaveCorner(bctx, px, py, 0, r);
        if (!openN && !openE && !solidAt(tx + 1, ty - 1)) carveConcaveCorner(bctx, px + s, py, 1, r);
        if (!openS && !openE && !solidAt(tx + 1, ty + 1)) carveConcaveCorner(bctx, px + s, py + s, 2, r);
        if (!openS && !openW && !solidAt(tx - 1, ty + 1)) carveConcaveCorner(bctx, px, py + s, 3, r);
      }
    }
    // Surface texture pass, baked once here (never per-frame): the seamless
    // fBm field masked onto every opaque wall pixel via source-atop, then
    // the same field again -- coral-tinted -- over just the soft-rock tiles
    // so their grain matches the field exactly, tile for tile, with the
    // surrounding rock.
    paintNoise(bctx, entry, rockNoisePattern, rockNoiseCanvas, 0, 0, canvas.width, canvas.height);
    for (const { px, py } of softTiles) {
      paintNoise(bctx, entry, coralNoisePattern, coralNoiseCanvas, px, py, s, s);
    }
    wallCache.set(entry.index, { canvas, bakedTiles: chunk.tiles.slice() });
  }

  function getBakedWalls(entry) {
    if (!tilesReady) return null;
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
  function drawBackground(canvasW, canvasH, time, depth) {
    const t = Math.min(1, depth / 400);
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, `rgb(${lerp(120, 20, t)},${lerp(235, 46, t)},${lerp(248, 76, t)})`);
    grad.addColorStop(1, `rgb(${lerp(95, 10, t)},${lerp(205, 26, t)},${lerp(228, 46, t)})`);
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
  const PLANT_INTO_WALL = 0.22;

  function drawPlants(canvasW, canvasH, resident) {
    if (!plants[0].complete || !plants[0].naturalWidth) return;
    for (const { index, yOffset, chunk } of resident) {
      let seedI = index * 97;
      for (let ty = 1; ty < chunkH - 1; ty++) {
        for (let tx = 1; tx < chunkW - 1; tx++) {
          const v = chunk.tiles[ty * chunkW + tx];
          if (v === 0) continue;
          // Round-1 fix (Daniel's screenshot review: "a tentacle is not
          // attached to the wall"): this condition was inverted -- `=== 0`
          // kept solid tiles that are NOT a floor cap (buried rock, or a
          // ceiling tile with solid still above it) and skipped the actual
          // floor caps the comment above describes, so the vine sprite's
          // root (its image's bottom edge, per PLANT_INTO_WALL below) landed
          // on a tile with no open water above it to grow into -- reading as
          // a plant floating detached from any surface. `!== 0` keeps only
          // true floor caps: solid here, open water directly above.
          if (chunk.tiles[(ty - 1) * chunkW + tx] !== 0) continue;
          seedI++;
          if (seedI % 9 !== 0) continue; // sparse: Daniel's screenshot showed these carpeting every wall top
          const img = plants[seedI % 2];
          if (!img.complete || !img.naturalWidth) continue;
          const s = worldToScreen(camera, canvasW, canvasH, tx + 0.5, ty + yOffset + PLANT_INTO_WALL);
          const h = camera.pxPerUnit * 1.4;
          const w = h * (img.naturalWidth / img.naturalHeight);
          ctx.drawImage(img, s.x - w / 2, s.y - h, w, h);
        }
      }
    }
  }

  function drawWalls(canvasW, canvasH, resident) {
    for (const entry of resident) {
      const canvas = getBakedWalls(entry);
      if (!canvas) continue;
      const topLeft = worldToScreen(camera, canvasW, canvasH, 0, entry.yOffset);
      const scale = camera.pxPerUnit / BAKE_PX_PER_UNIT;
      ctx.drawImage(canvas, topLeft.x, topLeft.y, canvas.width * scale, canvas.height * scale);
    }
  }

  function drawPickups(canvasW, canvasH, items, time) {
    for (const it of items) {
      if (it.hidden) continue; // sealed behind soft rock; nothing to draw until it breaks
      const s = worldToScreen(camera, canvasW, canvasH, it.x, it.y);
      if (it.type === 'pearl') {
        const r = camera.pxPerUnit * 0.16;
        const grad = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, r * 0.1, s.x, s.y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.5, 'rgba(200,225,255,0.85)');
        grad.addColorStop(1, 'rgba(140,170,220,0.55)');
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 3 + it.x);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (it.type === 'plankton') {
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
    if (o.invulnTimer > 0 && !o.dead) ctx.globalAlpha = Math.sin(time * 24) > 0 ? 1 : 0.35;
    drawOctopus(ctx, o);
    ctx.restore();
  }

  return {
    camera,
    render(canvasW, canvasH, octo, alpha, time, {
      resident, pickups, bubbles, critters = [], depth, enemies = [], shots = [], bombs = [], particles = null, shakeOffset, dreadLevel = 0,
    }) {
      // Drop wall-bake canvases for chunks the world has evicted, or their
      // offscreen canvases (48px/unit x 32x24 units each) leak for the life
      // of the run (~10 min soak test caught this: heap kept climbing).
      const liveIdx = new Set(resident.map((r) => r.index));
      for (const ci of [...wallCache.keys()]) if (!liveIdx.has(ci)) wallCache.delete(ci);
      updateCamera(camera, canvasW, canvasH, octo.x, octo.y, world.width, world.height);
      const shakePx = shakeOffset ? { x: shakeOffset.x * camera.pxPerUnit, y: shakeOffset.y * camera.pxPerUnit } : { x: 0, y: 0 };
      ctx.save();
      ctx.translate(shakePx.x, shakePx.y);
      const reduced = prefersReducedMotion();
      drawBackground(canvasW, canvasH, time, depth);
      drawCaustics(canvasW, canvasH, time, reduced);
      // Layering pass: plants/decor draw BEFORE the walls now (was after), so
      // the wall bake -- opaque rock art -- composites on top and occludes
      // each sprite's anchor-tucked base (see PLANT_INTO_WALL / decor.js's
      // own INTO_WALL for critters). Matches the sorting-layer order in the
      // Unity original too: the foliage prefabs sit on the "Default" sorting
      // layer, the tilemap on "Map", which renders after "Default" -- i.e.
      // walls were always meant to composite over decor, not the other way
      // round.
      drawPlants(canvasW, canvasH, resident);
      drawCritters(ctx, camera, worldToScreen, canvasW, canvasH, critters, time); // Otter's alive pass
      drawWalls(canvasW, canvasH, resident);
      drawBubbles(canvasW, canvasH, bubbles);
      drawPickups(canvasW, canvasH, pickups, time);
      drawEnemies(ctx, camera, worldToScreen, canvasW, canvasH, enemies, shots, time);
      drawBombs(ctx, camera, worldToScreen, canvasW, canvasH, bombs, time);
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
