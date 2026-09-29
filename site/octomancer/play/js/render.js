// Rendering: camera, walls (bake once from Milan's tileset, blit per frame),
// background (BGFar + a code vignette + a drifting code value-noise layer),
// plants anchored to wall tops, and the octopus behind the drawOctopus()
// interface. OVERNIGHT.md §2 "Rendering" (M1-2).
//
// Deviation (logged in NIGHT-LOG.md): the plan asks for a 4-bit neighbour
// autotile with per-chunk offscreen caches; M1's cave is a single small fixed
// layout, so walls are baked ONCE into one offscreen canvas (same "no seams,
// cheap per-frame blit" goal, simpler code) using tile-0 as the interior rock
// fill and tile-1 as a rotated open-side edge (drawn once per open neighbour
// side, so corners combine naturally without a full 16-case blob table).
// M2's chunked generator will revisit this when the world is actually infinite.

import { updateCamera, worldToScreen } from './camera.js';
import { drawOctopus } from './octopus-draw.js';
import { WORLD_W, WORLD_H } from './world.js';

const ASSET = (name) => new URL(`../assets/${name}`, import.meta.url).href;

// BGFar.png is a tall 1200x3000 strip; this is how many world units of
// depth one copy of it should visually span (tuned by eye, not a source fact).
const BG_WORLD_HEIGHT = 40;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

export function createRenderer(ctx, world) {
  const tileEdge = loadImage(ASSET('tiles/tile-1.webp'));
  const tileFill = loadImage(ASSET('tiles/tile-0.webp'));
  const bgFar = loadImage(ASSET('bg-far.webp'));
  const plants = [loadImage(ASSET('plant1.webp')), loadImage(ASSET('plant2.webp'))];

  const camera = { x: 0, y: 0, pxPerUnit: 32 };

  // --- Baked wall layer (built once assets are ready, rebuilt if they load late) ---
  const wallCanvas = document.createElement('canvas');
  const wallCtx = wallCanvas.getContext('2d');
  const BAKE_PX_PER_UNIT = 48; // resolution the wall bake is rendered at
  wallCanvas.width = world.width * BAKE_PX_PER_UNIT;
  wallCanvas.height = world.height * BAKE_PX_PER_UNIT;
  let wallsBaked = false;

  function bakeWalls() {
    const s = BAKE_PX_PER_UNIT;
    wallCtx.clearRect(0, 0, wallCanvas.width, wallCanvas.height);
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) {
        if (!world.isSolid(tx, ty)) continue;
        const px = tx * s, py = ty * s;
        wallCtx.drawImage(tileFill, px, py, s, s);
        // One rotated edge sprite per open (water) neighbour side, so
        // corners combine as the union of their open-side edges.
        const sides = [
          { dx: 0, dy: -1, rot: 0 },          // open above
          { dx: 1, dy: 0, rot: Math.PI / 2 }, // open right
          { dx: 0, dy: 1, rot: Math.PI },     // open below
          { dx: -1, dy: 0, rot: -Math.PI / 2 }, // open left
        ];
        for (const side of sides) {
          if (world.isSolid(tx + side.dx, ty + side.dy)) continue;
          wallCtx.save();
          wallCtx.translate(px + s / 2, py + s / 2);
          wallCtx.rotate(side.rot);
          wallCtx.drawImage(tileEdge, -s / 2, -s / 2, s, s);
          wallCtx.restore();
        }
      }
    }
    wallsBaked = true;
  }

  let pending = 3;
  function onAssetReady() { if (--pending === 0) bakeWalls(); }
  tileEdge.addEventListener('load', onAssetReady, { once: true });
  tileFill.addEventListener('load', onAssetReady, { once: true });
  bgFar.addEventListener('load', () => {}, { once: true });
  // plants are decorative; don't gate the bake on them
  pending = 2;

  // --- Drifting code value-noise layer (small offscreen canvas, generated once) ---
  const NOISE_SIZE = 128;
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = noiseCanvas.height = NOISE_SIZE;
  const noiseCtx = noiseCanvas.getContext('2d');
  (function generateNoise() {
    const img = noiseCtx.createImageData(NOISE_SIZE, NOISE_SIZE);
    // Cheap value noise: random per-cell, no external image (never
    // OverlayNoise.jpg -- DECISIONS-2026-09-29.md Q1).
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 10 + Math.random() * 18;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    noiseCtx.putImageData(img, 0, 0);
  })();

  function drawBackground(canvasW, canvasH, time) {
    ctx.fillStyle = '#08141f';
    ctx.fillRect(0, 0, canvasW, canvasH);
    if (bgFar.complete && bgFar.naturalWidth) {
      // BGFar.png is a tall (1200x3000) background strip, not a screen-fill
      // photo: scale it against world units (BG_WORLD_HEIGHT) and tile it in
      // both axes, parallaxed slightly behind the camera, rather than
      // "cover"-fitting it to the canvas (which blew a narrow crop of it up
      // to fill the whole screen -- logged in NIGHT-LOG.md).
      const scale = (BG_WORLD_HEIGHT * camera.pxPerUnit) / bgFar.naturalHeight;
      const iw = bgFar.naturalWidth * scale, ih = bgFar.naturalHeight * scale;
      const parallax = 0.3;
      const drift = time * 2;
      const offsetX = camera.x * parallax * camera.pxPerUnit + drift;
      const offsetY = camera.y * parallax * camera.pxPerUnit;
      const startX = -(((offsetX % iw) + iw) % iw) - iw;
      const startY = -(((offsetY % ih) + ih) % ih) - ih;
      for (let y = startY; y < canvasH + ih; y += ih) {
        for (let x = startX; x < canvasW + iw; x += iw) {
          ctx.drawImage(bgFar, x, y, iw, ih);
        }
      }
    }
    // Drifting value-noise layer, low alpha, tiled and slowly panning.
    ctx.save();
    ctx.globalAlpha = 0.10;
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

  function drawPlants(canvasW, canvasH) {
    if (!plants[0].complete || !plants[0].naturalWidth) return;
    let seedI = 0;
    for (let ty = 1; ty < world.height - 1; ty++) {
      for (let tx = 1; tx < world.width - 1; tx++) {
        if (!world.isSolid(tx, ty)) continue;
        if (world.isSolid(tx, ty - 1)) continue; // needs open space above
        seedI++;
        if (seedI % 5 !== 0) continue; // sparse
        const img = plants[seedI % 2];
        if (!img.complete || !img.naturalWidth) continue;
        const s = worldToScreen(camera, canvasW, canvasH, tx + 0.5, ty);
        const h = camera.pxPerUnit * 1.4;
        const w = h * (img.naturalWidth / img.naturalHeight);
        ctx.drawImage(img, s.x - w / 2, s.y - h, w, h);
      }
    }
  }

  function drawWalls(canvasW, canvasH) {
    if (!wallsBaked) return;
    const topLeft = worldToScreen(camera, canvasW, canvasH, 0, 0);
    const scale = camera.pxPerUnit / BAKE_PX_PER_UNIT;
    ctx.drawImage(wallCanvas, topLeft.x, topLeft.y, wallCanvas.width * scale, wallCanvas.height * scale);
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
    drawOctopus(ctx, o);
    ctx.restore();
  }

  return {
    camera,
    render(canvasW, canvasH, octo, alpha, time) {
      updateCamera(camera, canvasW, canvasH, octo.x, octo.y, world.width, world.height);
      drawBackground(canvasW, canvasH, time);
      drawWalls(canvasW, canvasH);
      drawPlants(canvasW, canvasH);
      drawOcto(octo, alpha, canvasW, canvasH, time);
      drawVignette(canvasW, canvasH);
    },
  };
}
