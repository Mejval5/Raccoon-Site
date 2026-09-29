// Rendering: camera, per-chunk baked walls (dirty-flag cache), background
// (BGFar + a code vignette + a drifting code value-noise layer), plants
// anchored to wall tops, pickups (pearls/plankton/shells), bubbles, the
// depth tint, and the octopus behind the drawOctopus() interface.
// OVERNIGHT.md §2 "Rendering" (M1-2) and §2 "World" / M2-2/M2-3 (chunked
// render cache, decor, pickups, depth tint).

import { updateCamera, worldToScreen } from './camera.js';
import { drawOctopus } from './octopus-draw.js';
import { depthTint } from './decor.js';
import { drawEnemies, drawBombs, drawParticles } from './enemy-draw.js';
import { prefersReducedMotion } from './config.js';

const ASSET = (name) => new URL(`../assets/${name}`, import.meta.url).href;

// BGFar.png is a tall 1200x3000 strip; this is how many world units of
// depth one copy of it should visually span (tuned by eye, not a source fact).
const BG_WORLD_HEIGHT = 40;
const BAKE_PX_PER_UNIT = 48; // resolution chunk wall bakes are rendered at

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
  const shellImgs = {
    blue: loadImage(ASSET('shell-blue.webp')),
    green: loadImage(ASSET('shell-green.webp')),
    red: loadImage(ASSET('shell-red.webp')),
  };
  let tilesReady = false;
  let pending = 2;
  function onTileReady() { if (--pending === 0) tilesReady = true; }
  tileEdge.addEventListener('load', onTileReady, { once: true });
  tileFill.addEventListener('load', onTileReady, { once: true });

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
    for (let ty = 0; ty < chunkH; ty++) {
      for (let tx = 0; tx < chunkW; tx++) {
        const v = chunk.tiles[ty * chunkW + tx];
        if (v === 0) continue;
        const px = tx * s, py = ty * s;
        bctx.drawImage(tileFill, px, py, s, s);
        if (v === 2) {
          // Soft (breakable) rock: same fill, tinted so it reads as diggable.
          bctx.save();
          bctx.globalCompositeOperation = 'source-atop';
          bctx.fillStyle = 'rgba(120,200,190,0.22)';
          bctx.fillRect(px, py, s, s);
          bctx.restore();
        }
        const sides = [
          { dx: 0, dy: -1, rot: 0 },
          { dx: 1, dy: 0, rot: Math.PI / 2 },
          { dx: 0, dy: 1, rot: Math.PI },
          { dx: -1, dy: 0, rot: -Math.PI / 2 },
        ];
        for (const side of sides) {
          const local = isSolidLocal(chunk, tx + side.dx, ty + side.dy);
          // Treat an out-of-chunk neighbour as solid (border columns are
          // solid in every chunk; the row above/below is handled per-chunk,
          // so a chunk boundary seam at worst shows a harmless extra edge).
          const solidNeighbour = local === null ? true : local;
          if (solidNeighbour) continue;
          bctx.save();
          bctx.translate(px + s / 2, py + s / 2);
          bctx.rotate(side.rot);
          bctx.drawImage(tileEdge, -s / 2, -s / 2, s, s);
          bctx.restore();
        }
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

  function drawBackground(canvasW, canvasH, time) {
    ctx.fillStyle = '#08141f';
    ctx.fillRect(0, 0, canvasW, canvasH);
    if (bgFar.complete && bgFar.naturalWidth) {
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
          if (chunk.tiles[(ty - 1) * chunkW + tx] === 0) continue; // needs solid above (grows down from ceiling-less... actually needs open above it, i.e. this tile is a "floor" cap)
          seedI++;
          if (seedI % 5 !== 0) continue;
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
      drawBackground(canvasW, canvasH, time);
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
