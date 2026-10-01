// v2 world markers drawn in code (no new art this round): the glowing exit / dive ring and
// the hub's journal board. Called from render.js through its `extraDraw` hook, in device
// pixels, after enemies and bombs and before the octopus.

import { artImg } from './v2-art.js';

const TAU = Math.PI * 2;

// the ring sprite tinted blue-teal for the hub's dive well (baked once, never per frame)
let diveRing = null, diveRingSrc = null;
function tintedRing(src) {
  if (diveRing && diveRingSrc === src) return diveRing;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth; c.height = src.naturalHeight;
  const cx = c.getContext('2d');
  cx.filter = 'hue-rotate(150deg) saturate(1.1)';
  cx.drawImage(src, 0, 0);
  diveRing = c; diveRingSrc = src;
  return c;
}


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

  // --- exit ring (also the hub's dive well and shortcut ring): one thick, soft, warm-teal portal ring lying in the floor, with a strong glow ---
  function ring(tx, ty, label, tint, plank) {
    const ex = sx(tx + 0.5), ey = sy(ty + 0.5);
    if (ex > -ppu * 3 && ex < cw + ppu * 3 && ey > -ppu * 3 && ey < ch + ppu * 3) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
      const r = ppu * (0.95 + 0.06 * pulse);
      // the ring lies on the floor: the first solid tile within 2 below the exit tile, else the exit tile's own floor
      let floorY = ty + 1;
      if (m.tileAt) for (let d = 1; d <= 2; d++) if (m.tileAt(tx, ty + d) !== 0) { floorY = ty + d; break; }
      const cy = ey + (floorY - ty - 0.5) * ppu - ppu * 0.52; // ring centre: its bottom lip (about 0.5 tile below) on the floor
      const g = ctx.createRadialGradient(ex, cy, r * 0.2, ex, cy, r * 2.3);
      g.addColorStop(0, 'rgba(255,236,150,0.85)');
      g.addColorStop(0.35, 'rgba(255,190,90,0.45)');
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex, cy, r * 2.3, 0, TAU); ctx.fill();
      const ringImg = artImg('ring');
      if (ringImg) {
        // generated ring sprite: the ellipse centre sits at about (0.5, 0.63) of the image
        const src = tint ? tintedRing(ringImg) : ringImg;
        const dw = ppu * 2.7, dh = dw * (ringImg.naturalHeight / ringImg.naturalWidth);
        ctx.drawImage(src, ex - dw / 2, cy - dh * 0.63, dw, dh);
      } else {
        const gi = ctx.createRadialGradient(ex, cy, 0, ex, cy, r);
        gi.addColorStop(0, 'rgba(255,255,230,0.75)');
        gi.addColorStop(1, 'rgba(255,220,140,0.15)');
        ctx.fillStyle = gi;
        ctx.beginPath(); ctx.ellipse(ex, cy, r, r * 0.42, 0, 0, TAU); ctx.fill();
        const strokeRing = (w, style) => { ctx.lineWidth = w; ctx.strokeStyle = style; ctx.beginPath(); ctx.ellipse(ex, cy, r, r * 0.42, 0, 0, TAU); ctx.stroke(); };
        strokeRing(Math.max(6, ppu * 0.34), 'rgba(10,60,80,0.9)');
        strokeRing(Math.max(4, ppu * 0.24), '#ff9a3c');
        strokeRing(Math.max(2, ppu * 0.09), '#ffe9a8');
      }
      ctx.fillStyle = '#fff2c0';
      for (let i = 0; i < 5; i++) {
        const ph = (time * 0.5 + i * 0.2) % 1;
        const px = ex + Math.sin(i * 2.4 + time) * r * 0.6;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.arc(px, cy - ph * ppu * 1.8, Math.max(1.5, ppu * 0.06), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
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

  ring(m.exitX, m.exitY, m.label, m.label === 'Dive', false);
  if (m.shortcutX >= 0) ring(m.shortcutX, m.shortcutY, m.shortcutLabel || '', false, true);
  if (m.shortcut3X >= 0) ring(m.shortcut3X, m.shortcut3Y, m.shortcut3Label || '', false, true);

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
