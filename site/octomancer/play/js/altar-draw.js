// Drawing of the offering altar (altar.js): Milan-style stone sprite 'altar' (img/v2/altar.webp, generated, see
// octomancer-web/tools/export_altar_art.py), the three carved hollows lit from inside with a soft bioluminescent glow as the
// favour grows, a few bubbles rising from the basin after it takes something, and a rust-red murk when it is angry.
// No numbers, no sparkles. Glows are one small offscreen canvas per colour, made once (no per-frame gradients, no readback).

import { drawSprite } from './sprites.js';
import { ALTAR_W } from './altar.js';

const SPRITE_H = ALTAR_W * 200 / 322;            // tiles: the sprite's aspect
const HOLLOWS = [0.256, 0.495, 0.736], HOLLOW_Y = 0.741, HOLLOW_R = 0.127; // fractions of the sprite (export_altar_art.py)
const BASIN_X = 0.495, BASIN_Y = 0.436;
const TAU = Math.PI * 2;

const glows = {};
/** A soft round glow of colour rgb ('r,g,b'), 64 px, built once. */
function glowCanvas(rgb) {
  if (glows[rgb] !== undefined) return glows[rgb];
  let c = null;
  try {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 64) : document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},0.95)`); gr.addColorStop(0.35, `rgba(${rgb},0.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  } catch (e) { c = null; }
  glows[rgb] = c;
  return c;
}

const LIT = '150,255,215', EMBER = '190,84,52', MURK = '96,70,52';

/**
 * Draw altar `a` (altar.js state). camera = {x, y, pxPerUnit}; t = sim time (s).
 */
export function drawAltar(ctx, camera, cw, ch, a, t) {
  const ppu = camera.pxPerUnit;
  const cx = cw / 2 + (a.x - camera.x) * ppu, by = ch / 2 + (a.y + 0.06 - camera.y) * ppu;
  const w = ALTAR_W * ppu, h = SPRITE_H * ppu;
  if (cx < -w || cx > cw + w || by < -h * 2 || by > ch + h) return;
  const left = cx - w / 2, top = by - h;
  ctx.save();
  if (!drawSprite(ctx, 'altar', cx, by, w, h)) { // until the image is decoded: a plain slab
    ctx.fillStyle = '#5f6866'; ctx.strokeStyle = '#1d2422'; ctx.lineWidth = Math.max(1, ppu * 0.04);
    ctx.beginPath(); ctx.roundRect(left + w * 0.08, top + h * 0.38, w * 0.84, h * 0.6, ppu * 0.08); ctx.fill(); ctx.stroke();
  }
  // the hollows: lit from inside (they breathe slowly), or a dull ember when angry
  const col = a.angry ? EMBER : LIT, img = glowCanvas(col);
  const r = HOLLOW_R * h;
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const gv = a.glow[k];
    if (gv < 0.02 || !img) continue;
    const breathe = 0.8 + 0.2 * Math.sin(t * 1.7 + k * 1.3);
    ctx.globalAlpha = Math.min(1, gv * breathe * (a.angry ? 0.7 : 0.85));
    const hx = left + HOLLOWS[k] * w, hy = top + HOLLOW_Y * h, s = r * 2.6;
    ctx.drawImage(img, hx - s, hy - s, s * 2, s * 2);
  }
  // after a gulp the basin brightens a moment
  if (a.gulp > 0.01 && img && !a.angry) {
    ctx.globalAlpha = a.gulp * 0.5;
    const s = w * 0.28;
    ctx.drawImage(img, left + BASIN_X * w - s, top + BASIN_Y * h - s * 0.5, s * 2, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  // bubbles from the basin: a steady trickle that grows with the favour, a burst after it takes something
  const amount = a.angry ? 0 : Math.min(1, a.tier * 0.18 + a.gulp);
  if (amount > 0.02) {
    ctx.strokeStyle = 'rgba(205,245,240,0.9)'; ctx.lineWidth = Math.max(1, ppu * 0.025);
    const n = 3 + Math.round(amount * 5);
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.45 + i * 0.618) % 1;
      const bx = left + BASIN_X * w + Math.sin(t * 2.1 + i * 2.4) * ppu * 0.12 + (i % 3 - 1) * w * 0.07;
      const byy = top + BASIN_Y * h - ph * ppu * 1.7;
      ctx.globalAlpha = (1 - ph) * amount * 0.8;
      ctx.beginPath(); ctx.arc(bx, byy, ppu * (0.035 + 0.025 * ((i * 7) % 3)), 0, TAU); ctx.stroke();
    }
  }
  // angry: a cloud of silt and rust hangs over it, thick at first, then thin for good
  if (a.angry) {
    const m = glowCanvas(MURK);
    if (m) {
      const k = 0.35 + a.rage * 0.65;
      for (let i = 0; i < 4; i++) {
        const sx = left + w * (0.2 + i * 0.2) + Math.sin(t * 0.7 + i) * ppu * 0.15;
        const sy = top + h * 0.3 - (1 - a.rage) * ppu * 0.2 - (i % 2) * ppu * 0.25;
        const s = ppu * (0.7 + (1 - a.rage) * 0.4);
        ctx.globalAlpha = 0.45 * k;
        ctx.drawImage(m, sx - s, sy - s, s * 2, s * 2);
      }
    }
  }
  ctx.restore();
}
