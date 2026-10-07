// Push-block drawing (props.js PK_BLOCK): Milan's square sprite, axis aligned, one tile-ish box per live block. Drawn
// before the walls (main.js v2PreWall), so terrain edges overlap a block resting against them. Until the image has
// loaded a code-drawn mossy stone square stands in. Reads the flat props arrays; no allocation per block.

import { PK_BLOCK } from './props.js';
import { artImg } from './v2-art.js';
import { visibleAt, cullFlags, cullView } from './cull.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {number} cw canvas width (px)
 * @param {number} ch canvas height (px)
 * @param {ReturnType<import('./props.js').createProps>['data']} d
 */
export function drawBlocks(ctx, camera, cw, ch, d) {
  let img = null, fl = null;
  const ppu = camera.pxPerUnit;
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || d.kind[i] !== PK_BLOCK) continue;
    if (!fl) { cullView(camera, cw, ch); fl = cullFlags('blocks', d.cap); img = artImg('pushBlock'); }
    if (!visibleAt(fl, i, d.x[i], d.y[i], d.radius[i] * 1.5)) continue;
    const half = d.radius[i] * ppu;
    const sx = cw / 2 + (d.x[i] - camera.x) * ppu - half, sy = ch / 2 + (d.y[i] - camera.y) * ppu - half;
    if (img) ctx.drawImage(img, sx, sy, half * 2, half * 2);
    else fallbackBlock(ctx, sx, sy, half * 2, i);
  }
}

/** Plain mossy stone: a rounded grey square, a lighter top edge, a darker base, a green cap and a few crack lines. */
function fallbackBlock(ctx, x, y, s, seed) {
  const r = s * 0.12;
  ctx.fillStyle = '#6f7a78';
  ctx.beginPath(); ctx.roundRect(x, y, s, s, r); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + r * 0.6, y + s * 0.05, s - r * 1.2, s * 0.08);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + r * 0.6, y + s * 0.88, s - r * 1.2, s * 0.07);
  // moss along the top, ragged by the block's index
  ctx.fillStyle = '#4f8a4a';
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  for (let k = 0; k <= 6; k++) ctx.lineTo(x + s * k / 6, y + s * (0.1 + 0.1 * (((seed * 7 + k * 5) % 5) / 4)));
  ctx.lineTo(x + s, y + r);
  ctx.quadraticCurveTo(x + s, y, x + s - r, y);
  ctx.lineTo(x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.3, y + s * 0.35); ctx.lineTo(x + s * 0.42, y + s * 0.55); ctx.lineTo(x + s * 0.35, y + s * 0.75);
  ctx.moveTo(x + s * 0.7, y + s * 0.45); ctx.lineTo(x + s * 0.62, y + s * 0.62);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.roundRect(x, y, s, s, r); ctx.stroke();
}
