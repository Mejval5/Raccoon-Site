// The Challenge Pool's drawing (pool.js): a stone pedestal on the plinth with a price tag like a shop item, a ring of pips that
// burns down while the wager runs, and the prize chest once it is won. Device pixels, drawn with the loot (before the octopus).

import { PL_IDLE, PL_ACTIVE, PL_WON, PL_LOST, PL_DONE, POOL_COST, POOL_SECONDS, RISE_S } from './pool.js';
import { drawChest } from './loot-draw.js';
import { ST_INTACT, ST_DONE } from './loot.js';

const TAU = Math.PI * 2;
const shellImg = new Image();
shellImg.src = new URL('../assets/shell-blue.webp', import.meta.url).href;

/** @param {{plan:{x:number,y:number,floorY:number}, state:number, t:number, flash:number}} st */
export function drawPool(ctx, camera, cw, ch, st, shells, time) {
  const ppu = camera.pxPerUnit, p = st.plan;
  const cx = cw / 2 + (p.x - camera.x) * ppu, fy = ch / 2 + (p.floorY - camera.y) * ppu; // the plinth top
  if (cx < -ppu * 4 || cx > cw + ppu * 4 || fy < -ppu * 5 || fy > ch + ppu * 4) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const lw = Math.max(1.5, ppu * 0.05);
  if (st.state === PL_WON || st.state === PL_DONE) {
    // the chest rises out of the pedestal's dish (clipped at the plinth top) in its first second
    const rise = st.state === PL_WON && st.rise > 0 ? st.rise / RISE_S : 0;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - ppu * 2, fy - ppu * 4, ppu * 4, ppu * 4 + ppu * 0.05); ctx.clip();
    drawChest(ctx, cx, fy - ppu * 0.5 + rise * ppu * 0.7, ppu * 1.15, time, 7, st.state === PL_DONE ? ST_DONE : ST_INTACT, 0, 0);
    ctx.restore();
    if (st.state === PL_WON) { // the prize glows
      const g = ctx.createRadialGradient(cx, fy - ppu * 0.5, ppu * 0.1, cx, fy - ppu * 0.5, ppu * 1.4);
      g.addColorStop(0, 'rgba(255,230,140,0.4)'); g.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, fy - ppu * 0.5, ppu * 1.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return;
  }
  // the pedestal: a short stone column with a shallow dish on top
  const dim = st.state === PL_LOST;
  ctx.fillStyle = dim ? '#5a606a' : '#8a93a0'; ctx.strokeStyle = '#242a34'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(cx - ppu * 0.36, fy); ctx.lineTo(cx - ppu * 0.26, fy - ppu * 0.5); ctx.lineTo(cx + ppu * 0.26, fy - ppu * 0.5); ctx.lineTo(cx + ppu * 0.36, fy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dim ? '#6c727c' : '#b9c1cc';
  ctx.beginPath(); ctx.ellipse(cx, fy - ppu * 0.5, ppu * 0.42, ppu * 0.1, 0, 0, TAU); ctx.fill(); ctx.stroke();
  if (st.state === PL_IDLE) {
    // a gold glint in the dish, and the price in a tag above it
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(255,226,130,${0.5 + 0.4 * pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, fy - ppu * 0.53, ppu * 0.22, ppu * 0.05, 0, 0, TAU); ctx.fill();
    const afford = shells >= POOL_COST, flash = st.flash > 0;
    const ty = fy - ppu * 1.15 - Math.sin(time * 2) * ppu * 0.04, text = String(POOL_COST);
    ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.36))}px Quicksand, sans-serif`;
    const tw = ctx.measureText(text).width, pw = tw + ppu * 0.75, ph = ppu * 0.44;
    const col = flash ? '#ff6a5a' : afford ? '#ffe38a' : '#ff8a80';
    ctx.fillStyle = 'rgba(6,22,34,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, ppu * (flash ? 0.08 : 0.05));
    ctx.beginPath(); ctx.roundRect(cx - pw / 2, ty - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
    const s = ppu * 0.36;
    if (shellImg.complete && shellImg.naturalWidth) ctx.drawImage(shellImg, cx - pw / 2 + ppu * 0.26 - s / 2, ty - s / 2, s, s);
    else { ctx.fillStyle = '#7fc4ff'; ctx.beginPath(); ctx.arc(cx - pw / 2 + ppu * 0.26, ty, s * 0.4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx + ppu * 0.2, ty + ppu * 0.02);
  } else if (st.state === PL_ACTIVE) {
    // the wager is on: a ring of pips round the dish, one per second, going out
    const n = POOL_SECONDS, left = Math.ceil(st.t);
    const cy = fy - ppu * 0.62;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU, on = i < left;
      const rx = cx + Math.cos(a) * ppu * 0.8, ry = cy - ppu * 0.55 + Math.sin(a) * ppu * 0.8;
      ctx.fillStyle = on ? `rgba(255,214,110,${0.75 + 0.25 * Math.sin(time * 6 + i)})` : 'rgba(90,100,110,0.45)';
      ctx.beginPath(); ctx.arc(rx, ry, Math.max(1.6, ppu * 0.06), 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
