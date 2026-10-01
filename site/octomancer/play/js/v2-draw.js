// v2 world markers drawn in code (no new art this round): the glowing exit / dive ring and
// the hub's journal board. Called from render.js through its `extraDraw` hook, in device
// pixels, after enemies and bombs and before the octopus.

import { artImg } from './v2-art.js';
import { drawWhirlpool } from './portal-draw.js';

const TAU = Math.PI * 2;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {number} cw canvas width (px)
 * @param {number} ch canvas height (px)
 * @param {{exitX:number, exitY:number, boardX:number, boardY:number, label:string}} m tile coords; boardX < 0 means none
 * @param {number} time seconds
 */
export function drawV2Marks(ctx, camera, cw, ch, m, time) {
  const ppu = camera.pxPerUnit;
  const sx = (wx) => cw / 2 + (wx - camera.x) * ppu;
  const sy = (wy) => ch / 2 + (wy - camera.y) * ppu;

  // --- portals (the exit, the hub's dive well, the shortcut rings): an animated whirlpool drawn in code (portal-draw.js), lying flat in the floor opening ---
  function ring(tx, ty, label, tint, plank) {
    const ex = sx(tx + 0.5), ey = sy(ty + 0.5);
    if (ex > -ppu * 3 && ex < cw + ppu * 3 && ey > -ppu * 3 && ey < ch + ppu * 3) {
      const r = ppu * 1.45;
      // the pool lies on the floor: the first solid tile within 2 below the exit tile; with none the portal stands upright (a niche)
      let floorY = ty + 1, flat = false;
      if (m.tileAt) for (let d = 1; d <= 2; d++) if (m.tileAt(tx, ty + d) !== 0) { floorY = ty + d; flat = true; break; }
      const cy = flat ? ey + (floorY - ty - 0.5) * ppu - r * 0.46 * 0.3 : ey;
      drawWhirlpool(ctx, ex, cy, flat ? r : r * 0.8, time, { tint, flat, phase: tx * 0.7 });
      // label only while the ring itself is on screen and clear of the bottom-left controls hint
      if (label && ex > 0 && ex < cw && cy > 0 && cy < ch) {
        const dpr = window.devicePixelRatio || 1;
        if (plank) {
          // the shortcut ring's name on a small wooden sign (65% of the old size) standing on the floor rim BESIDE the
          // ring (1.6 tiles to the side, away from a wall), its post running down to the rim, never planted in the ring
          const S = 0.65;
          const free = (dx) => !m.tileAt || (m.tileAt(tx + dx, ty) === 0 && m.tileAt(tx + dx + (dx > 0 ? 1 : -1), ty) === 0);
          const side = free(2) || !free(-2) ? 1 : -1;
          const px = ex + side * 1.6 * ppu;
          const rimY = ey + (floorY - ty - 0.5) * ppu; // top edge of the floor under the ring
          const ph = ppu * 0.56 * S, signY = rimY - ppu * 1.7;
          ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.32 * S))}px Quicksand, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(label).width, pw = tw + ppu * 0.5 * S;
          const inHint = px < 320 * dpr && signY > ch - 130 * dpr;
          if (!inHint && signY > 0 && px > -pw && px < cw + pw) {
            ctx.lineJoin = 'round';
            const postW = Math.max(2, ppu * 0.1 * S);
            ctx.fillStyle = '#6b4a22'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = Math.max(1, ppu * 0.04);
            ctx.fillRect(px - postW / 2, signY + ph / 2 - 1, postW, rimY - (signY + ph / 2) + 1);
            ctx.strokeRect(px - postW / 2, signY + ph / 2 - 1, postW, rimY - (signY + ph / 2) + 1);
            ctx.lineWidth = Math.max(2, ppu * 0.07 * S); ctx.fillStyle = '#c99a5a';
            ctx.beginPath(); ctx.roundRect(px - pw / 2, signY - ph / 2, pw, ph, ppu * 0.1 * S); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#3a2410'; ctx.fillText(label, px, signY + 1);
          }
        } else {
          const ly = cy - r * 1.9;
          const inHint = ex < 320 * dpr && ly > ch - 130 * dpr;
          if (!inHint && ly > 0) {
            ctx.font = `700 ${Math.max(11, Math.round(ppu * 0.4))}px Quicksand, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,20,34,0.8)';
            ctx.strokeText(label, ex, ly);
            ctx.fillStyle = '#ffe9a8';
            ctx.fillText(label, ex, ly);
          }
        }
      }
    }
  }

  ring(m.exitX, m.exitY, m.label, m.label === 'Dive' ? 'teal' : 'green', false);
  if (m.shortcutX >= 0) ring(m.shortcutX, m.shortcutY, m.shortcutLabel || '', 'violet', true);
  if (m.shortcut3X >= 0) ring(m.shortcut3X, m.shortcut3Y, m.shortcut3Label || '', 'amber', true);

  // --- journal board: a wooden plank hung on the rock face, outlined like the sprites ---
  if (m.boardX >= 0) {
    const bx = sx(m.boardX + 0.5), by0 = sy(m.boardY + 1);  // by0 = ledge floor line; the board stands on it, inside the 1-tile ledge
    let by = by0 - ppu * 0.6;
    const w = ppu * 1.7, h = ppu * 1.2;
    const boardImg = artImg('board');
    if (boardImg && bx > -w && bx < cw + w && by > -h && by < ch + h) {
      // generated notice board (Milan style); the word goes on a small plaque under it
      const dw = ppu * 1.0, dh = dw * (boardImg.naturalHeight / boardImg.naturalWidth);
      by = by0 - dh / 2;
      ctx.drawImage(boardImg, bx - dw / 2, by - dh / 2, dw, dh);
      ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.3))}px Quicksand, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, ppu * 0.1); ctx.lineJoin = 'round'; ctx.strokeStyle = '#3a2410';
      ctx.strokeText('Journal', bx, by - dh / 2 - ppu * 0.2);
      ctx.fillStyle = '#f6e7b8'; ctx.fillText('Journal', bx, by - dh / 2 - ppu * 0.2);
    } else if (bx > -w && bx < cw + w && by > -h && by < ch + h) {
      const lw = Math.max(2, ppu * 0.09);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(bx - w * 0.3, by - h / 2); ctx.lineTo(bx, by - h / 2 - ppu * 0.3); ctx.lineTo(bx + w * 0.3, by - h / 2); ctx.stroke();
      const rr = ppu * 0.14;
      const rect = (x, y, ww, hh) => { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, rr); };
      rect(bx - w / 2, by - h / 2, w, h);
      ctx.fillStyle = '#9a6a3a'; ctx.fill();
      ctx.strokeStyle = '#3a2410'; ctx.stroke();
      rect(bx - w * 0.4, by - h * 0.36, w * 0.8, h * 0.72);
      ctx.fillStyle = '#f0e0b0'; ctx.fill();
      ctx.lineWidth = Math.max(1, lw * 0.6); ctx.stroke();
      ctx.fillStyle = 'rgba(58,36,16,0.28)';
      ctx.fillRect(bx - w / 2 + lw, by + h / 2 - ppu * 0.12, w - lw * 2, ppu * 0.1);
      ctx.fillStyle = '#3a2410';
      ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.32))}px Quicksand, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Journal', bx, by - h * 0.06);
      ctx.fillStyle = 'rgba(58,36,16,0.5)';
      ctx.fillRect(bx - w * 0.28, by + h * 0.16, w * 0.56, Math.max(1, ppu * 0.04));
    }
  }
}
