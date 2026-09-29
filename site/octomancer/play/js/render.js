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

import { updateCamera, worldToScreen } from './camera.js';
import { drawOctopus } from './octopus-draw.js';
import { depthTint } from './decor.js';
import { drawEnemies, drawBombs, drawParticles } from './enemy-draw.js';
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
  const wallTiles = [tileFull, tileEdgeA, tileEdgeB, tileCorner, tileCorridor, tileIsland];
  let tilesReady = false;
  let pending = wallTiles.length;
  function onTileReady() { if (--pending === 0) tilesReady = true; }
  for (const img of wallTiles) img.addEventListener('load', onTileReady, { once: true });

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
    if (count === 0) return { img: tileFull, turns: 0 };
    if (count >= 3) return { img: tileIsland, turns: 0 }; // rare thin spur, closest available shape
    if (count === 1) {
      const turns = openN ? 0 : openE ? 1 : openS ? 2 : 3;
      return { img: altParity ? tileEdgeB : tileEdgeA, turns };
    }
    // count === 2
    if (openN && openS) return { img: tileCorridor, turns: 0 };
    if (openE && openW) return { img: tileCorridor, turns: 1 };
    const turns = (openN && openW) ? 0 : (openN && openE) ? 1 : (openE && openS) ? 2 : 3; // 3 = S+W
    return { img: tileCorner, turns };
  }

  // Concave (inward) corners -- where both edges touching that corner are
  // solid but the diagonal neighbour beyond it is open -- have no single
  // tileset piece for every count, so round them procedurally: a wedge of
  // the tileset's own rim colour, then a smaller destination-out wedge to
  // cut the actual water notch. k = 0..3 for TL/TR/BR/BL, matching the
  // quarter-turn convention above.
  const RIM_COLOR = 'rgba(15,90,66,0.95)';
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
    // Treat an out-of-chunk neighbour as solid (border columns are solid in
    // every chunk; the row above/below is handled per-chunk, so a chunk
    // boundary seam at worst shows a harmless extra edge/corner).
    const solidAt = (tx, ty) => {
      const local = isSolidLocal(chunk, tx, ty);
      return local === null ? true : local;
    };
    for (let ty = 0; ty < chunkH; ty++) {
      for (let tx = 0; tx < chunkW; tx++) {
        const v = chunk.tiles[ty * chunkW + tx];
        if (v === 0) continue;
        const px = tx * s, py = ty * s;
        const openN = !solidAt(tx, ty - 1);
        const openE = !solidAt(tx + 1, ty);
        const openS = !solidAt(tx, ty + 1);
        const openW = !solidAt(tx - 1, ty);
        const { img, turns } = pickWallArt(openN, openE, openS, openW, (tx + ty) % 2 === 0);

        bctx.save();
        bctx.translate(px + s / 2, py + s / 2);
        bctx.rotate(turns * (Math.PI / 2));
        bctx.drawImage(img, -s / 2, -s / 2, s, s);
        bctx.restore();

        if (v === 2) {
          // Soft (breakable) rock: same shape, a warm coral tint so it reads
          // as diggable and distinct from unbreakable (green-rimmed) walls.
          bctx.save();
          bctx.globalCompositeOperation = 'source-atop';
          bctx.fillStyle = 'rgba(210,130,80,0.30)';
          bctx.fillRect(px, py, s, s);
          bctx.restore();
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
  function drawBackground(canvasW, canvasH, time, depth) {
    const t = Math.min(1, depth / 400);
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, `rgb(${lerp(10, 4, t)},${lerp(34, 12, t)},${lerp(46, 16, t)})`);
    grad.addColorStop(1, `rgb(${lerp(4, 2, t)},${lerp(13, 5, t)},${lerp(18, 7, t)})`);
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

  function drawPlants(canvasW, canvasH, resident) {
    if (!plants[0].complete || !plants[0].naturalWidth) return;
    for (const { index, yOffset, chunk } of resident) {
      let seedI = index * 97;
      for (let ty = 1; ty < chunkH - 1; ty++) {
        for (let tx = 1; tx < chunkW - 1; tx++) {
          const v = chunk.tiles[ty * chunkW + tx];
          if (v === 0) continue;
          if (chunk.tiles[(ty - 1) * chunkW + tx] === 0) continue; // this is a "floor cap": solid here, open water directly above -- the only surface plants grow from
          seedI++;
          if (seedI % 9 !== 0) continue; // sparse: Daniel's screenshot showed these carpeting every wall top
          const img = plants[seedI % 2];
          if (!img.complete || !img.naturalWidth) continue;
          const s = worldToScreen(camera, canvasW, canvasH, tx + 0.5, ty + yOffset);
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
      resident, pickups, bubbles, depth, enemies = [], shots = [], bombs = [], particles = null, shakeOffset, dreadLevel = 0,
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
      drawWalls(canvasW, canvasH, resident);
      drawPlants(canvasW, canvasH, resident);
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
