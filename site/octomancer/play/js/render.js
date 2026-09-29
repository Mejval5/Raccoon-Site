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

// Round-3 fix (Daniel's screenshot review: "on desktop retina the rim is
// visibly stair-stepped and soft, because walls are baked at 48px/tile and
// upscaled to about 74 device px/tile"). Baking at a fixed 48px/tile was
// already coarser than a typical desktop's own device pixels even at 1x
// zoom, and DPR 2 (`devicePixelRatio`) doubles that again. Scale the bake
// resolution by the page's own DPR (capped so a stray DPR 3-4 display, or a
// very zoomed-in view, doesn't blow up chunk canvas memory -- each one is
// already `32 x 24` tiles).
const BAKE_PX_PER_UNIT = Math.min(96, Math.round(48 * (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1)));

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
  // Round-3 fix (Daniel's screenshot review: "the rim is thicker and a
  // different, bluer green [(11,85,78)] at concave/convex corners than along
  // straight edges [(2,88,62)] -- every step corner shows a dark blob"). The
  // source tile images (tile-2/2A edge, tile-3 corner, tile-5 corridor) each
  // carry their own rim colour baked in, close but not identical; recolour
  // that too (same technique this function already uses for the black fill)
  // so every tile's rim comes out the one canonical `RIM_TARGET` colour, the
  // same one `RIM_COLOR`/`drawNubTile`'s procedural rim below already use --
  // no more per-corner colour seam. Any opaque pixel that isn't the near-
  // black fill is rim art at this style's two-tone tile art (fill + rim), so
  // no separate greenish-hue detection is needed.
  const RIM_TARGET = [25, 109, 94]; // sampled from the promo-video reference frames
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
      } else {
        d[i] = RIM_TARGET[0]; d[i + 1] = RIM_TARGET[1]; d[i + 2] = RIM_TARGET[2];
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
  // Round-3 fix (Daniel's screenshot review: "when one asset request fails
  // (net::ERR_CONNECTION_REFUSED), the game silently renders with no walls
  // at all... nothing indicates an error"). `tilesReady` used to gate ALL
  // wall baking on EVERY tile image loading -- one failed request meant
  // `pending` never reached 0, so `getBakedWalls` returned null forever and
  // the whole level's geometry (and its rim art, the player's only visual
  // read on where rock is) vanished with no signal at all. Now: (1) retry a
  // failed tile image a couple of times (a transient network blip, like
  // Daniel's first run, often clears on its own); (2) if it still fails,
  // give up on that ONE tile key (not the whole bake) and let `tilesReady`
  // still flip true once every other tile has resolved; `bakeChunkWalls`
  // below falls back to a flat rock fill + rim stroke for any tile whose art
  // never arrived, so the level is always at least readable as rock.
  for (const [key, img] of Object.entries(wallTileSources)) {
    const src = img.src;
    let tries = 0;
    const retry = () => {
      tries++;
      img.src = tries === 1 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${tries}`;
    };
    img.addEventListener('load', () => { wallArt[key] = recolorWallTile(img); onTileReady(); }, { once: true });
    img.addEventListener('error', () => {
      // eslint-disable-next-line no-console
      console.warn(`[render] wall tile "${key}" failed to load (attempt ${tries})`);
      if (tries < 3) setTimeout(retry, 250 * tries);
      else onTileReady(); // give up on this tile only; bakeChunkWalls falls back to a flat fill
    });
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
    if (count === 4) return { key: 'island', turns: 0 }; // true isolated tile, the only case tile-0 actually depicts
    if (count === 3) {
      // A 1-wide nub/peninsula tip: solid on exactly one side, still
      // attached to real rock there. Round-2 fix (Daniel's screenshot
      // review: "the level is still full of lone circles, and many of them
      // look broken" -- tile-0 is a floating-island sprite with a rim baked
      // in on all 4 sides, so using it here drew a rim across the one side
      // that's actually flush against solid rock, leaving a gap/flat-cut
      // seam there). No tileset art fits "3 open, 1 closed", so this is
      // drawn procedurally by `drawNubTile` (below) as a rounded cap flush
      // against its one solid neighbour instead. `turns` picks which side
      // is the closed one, same rotation convention as every other case
      // here (0=N, 1=E, 2=S, 3=W).
      const turns = !openN ? 0 : !openE ? 1 : !openS ? 2 : 3;
      return { key: 'nub', turns };
    }
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

  // Round-2 fix: procedural art for a "nub" tile (pickWallArt's count===3
  // case) -- flat full-width on the one closed side (flush against the real
  // solid neighbour, no gap), rounded on the other three. `turns` rotates
  // the canonical orientation (closed side at the top) to the true closed
  // direction, same convention `bakeChunkWalls` already uses for rotating
  // the sprite-based tiles.
  // Round-4 fix (Daniel's screenshot review round 3: "one-tile-wide peninsula
  // ends/stubs draw as a flat, rimless half-square plus half a rimmed
  // semicircle"). The old shape only rounded the two BOTTOM corners of the
  // tile (`arcTo(...,r)` with r < hw), leaving the straight left/right edges
  // unrounded above that -- and the rim stroke started/ended 0.1*hw short of
  // the flat (closed) edge's own corners, so it never quite reached the
  // corners where a neighbouring corridor tile's own rim continues. That
  // combination reads as exactly the bug: a rounded bit at the bottom, a
  // flat unrimmed edge above it. Redrawn as a TRUE semicircular cap (radius
  // = hw, centred on the open edge) on a flat-topped rectangle -- the cap
  // continues smoothly from both straight side edges instead of just
  // rounding their corners -- with the rim stroke running the full open
  // path corner-to-corner (both long straight sides plus the cap), so it
  // meets the flat (closed, unrimmed) edge exactly at its own two corners
  // and lines up with whatever rim a neighbouring corridor/edge tile draws
  // there.
  // Round-5 fix (Daniel's screenshot review round 4, issue 1: "the cap
  // sticks out past the stem as square shoulders, joins it along a hard
  // straight line, and cuts off the neighbour's rim and concave-corner
  // curves"). The round-4 shape (a full-tile-width flat top edge dropping
  // straight down the sides to a semicircle) is exactly that: the straight
  // sides met the semicircle's own flat diameter at a sharp corner (the
  // "square shoulder"), and the flat top ran the tile's FULL width, wider
  // than a sprite tile's own rim-inset rock face, so it visibly overhung the
  // neighbour it welds onto. Two changes: inset the flush (closed) top edge
  // by about 0.125 tile each side -- roughly the same inset the sprite
  // tiles' own rim sits at -- so the cap no longer sticks out past the stem,
  // and fillet (`arcTo`) the two corners where that inset edge meets the
  // open sides instead of turning a hard corner into the semicircle, so the
  // whole open boundary (fillet, straight run down to the arc's start,
  // semicircle, mirrored fillet) reads as one continuous curve with no
  // sharp transition anywhere -- no more "stepped chamfer" on either corner.
  function drawNubTile(bctx, px, py, s, turns) {
    const hw = s / 2;
    // topR: how far each of the two corners nearest the flush (closed) edge
    // is inset/filleted -- keeps the flat edge narrower than the tile (so it
    // no longer overhangs the stem it welds onto) and rounds its corners
    // instead of leaving them sharp. botR: the far corners' radius, set to
    // exactly half the tile width so those two quarter-circles meet at the
    // tile's own centreline with a zero-length straight run between them --
    // i.e. one continuous 180-degree curve, same as an explicit semicircle,
    // built the same well-tested way any rounded rect is (four `arcTo`
    // calls, standard corner-by-corner order -- the earlier version here
    // free-handed the two side fillets against a separate `arc()` call and
    // got the winding wrong for half the rotations, so three of every four
    // nubs rendered as almost bare fill with no rim at all).
    const x = -hw, y = -hw, w = s, h = s;
    const topR = s * 0.15;
    const botR = hw;
    function boundary() {
      bctx.lineTo(x + w - topR, y);
      bctx.arcTo(x + w, y, x + w, y + botR, topR);
      bctx.arcTo(x + w, y + h, x + w - botR, y + h, botR);
      bctx.lineTo(x + botR, y + h);
      bctx.arcTo(x, y + h, x, y + h - botR, botR);
      bctx.arcTo(x, y, x + topR, y, topR);
    }
    bctx.save();
    bctx.beginPath();
    bctx.rect(px, py, s, s);
    bctx.clip();
    bctx.translate(px + hw, py + hw);
    bctx.rotate(turns * (Math.PI / 2));
    // Fill: the flush top edge (flat, unrimmed -- matches the real solid
    // neighbour it welds onto), inset by `topR` each side, plus the whole
    // open boundary (three open sides), closed.
    bctx.beginPath();
    bctx.moveTo(x + topR, y);
    boundary();
    bctx.closePath();
    bctx.fillStyle = `rgb(${WALL_FILL_COLOR.join(',')})`;
    bctx.fill();
    // Rim: just the open boundary, never the flush top edge.
    bctx.beginPath();
    bctx.moveTo(x + w - topR, y);
    boundary();
    bctx.strokeStyle = RIM_COLOR;
    bctx.lineWidth = s * 0.1;
    bctx.lineJoin = 'round';
    bctx.stroke();
    bctx.restore();
  }

  // Concave (inward) corners -- where both edges touching that corner are
  // solid but the diagonal neighbour beyond it is open -- have no single
  // tileset piece for every count, so round them procedurally: a wedge of
  // the tileset's own rim colour, then a smaller destination-out wedge to
  // cut the actual water notch. k = 0..3 for TL/TR/BR/BL, matching the
  // quarter-turn convention above.
  // Round-3 fix (Daniel's screenshot review: rim reads darker than the video
  // -- measured (4,83,64) vs. the video's (25,109,94)). Brightened to match;
  // shares its RGB with `RIM_TARGET` above so the procedural rim (concave
  // corners, `drawNubTile`, the fallback tile below) and the recoloured
  // sprite rim are the exact same colour everywhere.
  const RIM_COLOR = `rgba(${RIM_TARGET.join(',')},0.95)`;
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
        if (key === 'nub') {
          drawNubTile(bctx, px, py, s, turns);
        } else if (wallArt[key]) {
          bctx.save();
          bctx.translate(px + s / 2, py + s / 2);
          bctx.rotate(turns * (Math.PI / 2));
          bctx.drawImage(wallArt[key], -s / 2, -s / 2, s, s);
          bctx.restore();
        } else {
          // Round-3 fix: this tile's art image never loaded (see the
          // wallTileSources retry/give-up block above) -- draw a flat rock
          // fill with a rim stroke instead of leaving this tile as invisible
          // open water, so level geometry is never silently missing.
          bctx.fillStyle = `rgb(${WALL_FILL_COLOR.join(',')})`;
          bctx.fillRect(px, py, s, s);
          bctx.strokeStyle = RIM_COLOR;
          bctx.lineWidth = s * 0.08;
          bctx.strokeRect(px + bctx.lineWidth / 2, py + bctx.lineWidth / 2, s - bctx.lineWidth, s - bctx.lineWidth);
        }

        // Round-2 fix (Daniel's screenshot review: soft rock buried inside
        // solid rock rendered as a flat blocky patch with hard square edges
        // and no rim -- looked like a missing texture, no counterpart in the
        // promo video). Only tint a soft-rock tile if it actually has an
        // open face to be reached/blown open from; a fully-buried v===2 tile
        // (surrounded by solid rock on all 4 sides) stays visually identical
        // to normal rock instead.
        if (v === 2 && (openN || openE || openS || openW)) {
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
    if (!tilesReady) return;
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
