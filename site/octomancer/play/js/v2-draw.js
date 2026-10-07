// v2 world markers drawn in code (no new art this round): the glowing exit / dive ring and
// the hub's journal board. Called from render.js through its `extraDraw` hook, in device
// pixels, after enemies and bombs and before the octopus.

import { artImg } from './v2-art.js';
import { drawWhirlpoolCode, drawWhirlpoolSprite, portalPlace, portalFrame, PORTAL_SQUASH } from './portal-draw.js';
import { visibleAt, cullFlags, cullView } from './cull.js';

const TAU = Math.PI * 2;

/** Labels of the portals found by drawV2Marks this frame; drawV2Labels draws them after the octopus. */
const pendingLabels = [];
/** r42: the portal names (the hub's 'Dive' label, the shortcut signs), drawn after the octopus so it never hides them. */
export function drawV2Labels() { for (const f of pendingLabels) f(); pendingLabels.length = 0; }

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

  // --- portals (the exit, the hub's dive well, the shortcut rings): Milan's Whirlpool animation (portal-draw.js), lying in the floor ---
  // The portal is drawn here (before the octopus); its label is queued and drawn by drawV2Labels, after the octopus.
  pendingLabels.length = 0;
  const water = (px, py) => { // is the screen point in an open water tile?
    const tx = Math.floor(camera.x + (px - cw / 2) / ppu), ty = Math.floor(camera.y + (py - ch / 2) / ppu);
    return m.tileAt ? m.tileAt(tx, ty) === 0 : true;
  };
  cullView(camera, cw, ch);
  const pf = cullFlags('portals', 8);
  let pi = 0;
  function ring(tx, ty, label, tint, plank) {
    const ex0 = sx(tx + 0.5), ey0 = sy(ty + 0.5);
    if (!visibleAt(pf, pi++ & 7, tx + 0.5, ty + 0.5, 4)) return; // r43: a portal far from the camera is not animated or drawn
    const pl = m.tileAt ? portalPlace(m.tileAt, tx, ty) : { flat: false, w: 2, cx: tx + 0.5, floorY: ty + 1, cy: ty + 0.5 };
    const wpx = pl.w * ppu, ex = sx(pl.cx);
    const hIdle = wpx * 0.97 * (pl.flat ? PORTAL_SQUASH : 1);
    const floorPx = sy(pl.floorY);
    const cy = pl.flat ? floorPx - hIdle / 2 - ppu * 0.08 : sy(pl.cy);
    const d = m.octoX === undefined ? 99 : Math.hypot(m.octoX - (tx + 0.5), m.octoY - (ty + 0.5));
    const frame = portalFrame(tx + ',' + ty, time, d < 2.0, d > 3.2);
    const spriteTint = tint === 'violet' ? 'warm' : tint === 'amber' ? 'gold' : 'none';
    if (!drawWhirlpoolSprite(ctx, ex, cy, wpx, pl.flat ? PORTAL_SQUASH : 1, frame, spriteTint)) {
      // the sheet has not loaded: the code-drawn whirlpool, as a fallback
      const r = ppu * 1.45;
      drawWhirlpoolCode(ctx, ex, pl.flat ? cy : sy(pl.cy), pl.flat ? r : r * 0.8, time, { tint, flat: pl.flat, phase: tx * 0.7 });
    } else {
      // bubbles rising from the pool, only through water tiles
      ctx.save();
      ctx.lineWidth = Math.max(1, ppu * 0.03);
      for (let i = 0; i < 6; i++) {
        const p = (time * 0.35 + i / 6 + tx * 0.13) % 1;
        const bx = ex + Math.sin(i * 2.7 + tx) * wpx * 0.36 + Math.sin(time * 2 + i) * ppu * 0.05;
        const by = (pl.flat ? floorPx - hIdle * 0.5 : sy(pl.cy)) - p * ppu * 1.7;
        if (!water(bx, by)) continue;
        ctx.globalAlpha = Math.min(1, p * 6) * (1 - p) * 0.7;
        ctx.fillStyle = 'rgba(200,235,250,0.25)'; ctx.strokeStyle = 'rgba(225,245,255,0.9)';
        ctx.beginPath(); ctx.arc(bx, by, ppu * (0.045 + 0.05 * ((i * 7) % 5) / 5), 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    if (!label || !(ex > 0 && ex < cw && cy > 0 && cy < ch)) return;
    const dpr = window.devicePixelRatio || 1;
    const topY = pl.flat ? cy - hIdle / 2 : cy - wpx / 2;  // the rim of the whirlpool
    pendingLabels.push(() => {
      if (plank) {
        // the shortcut ring's name on a small wooden sign (65% of the old size) standing on the floor rim BESIDE the
        // ring (away from a wall), its post running down to the rim, never planted in the ring
        const S = 0.65;
        const free = (dx) => !m.tileAt || (m.tileAt(tx + dx, ty) === 0 && m.tileAt(tx + dx + (dx > 0 ? 1 : -1), ty) === 0);
        const side = free(2) || !free(-2) ? 1 : -1;
        const px = ex + side * 1.9 * ppu;
        const rimY = floorPx; // top edge of the floor under the ring
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
        const ly = topY - ppu * 0.32; // just above the whirlpool's rim
        const inHint = ex < 320 * dpr && ly > ch - 130 * dpr;
        if (!inHint && ly > 0) {
          ctx.font = `700 ${Math.max(11, Math.round(ppu * 0.4))}px Quicksand, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(4,20,34,0.8)';
          ctx.strokeText(label, ex, ly);
          ctx.fillStyle = '#ffe9a8';
          ctx.fillText(label, ex, ly);
        }
      }
    });
  }

  ring(m.exitX, m.exitY, m.label, 'green', false);
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
