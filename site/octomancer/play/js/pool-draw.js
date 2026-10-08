// The Challenge Pool's drawing (pool.js), round 40: a carved stone basin in the plinth with a standing rune stone for the pedestal (it
// rattles while the wager runs; r46: it was a die), the wager as five hovering shells (no shop price pill), a ring of glowing specks that
// burns down during the wager and the prize (r46: a giant clam, drawChest) once it is won; plus the host (r46: Milan's sea horse, was a
// code-drawn pufferfish in a top hat; drawPoolHost, after the octopus). Natural light only: sea-green glow, no gold. Device pixels.

import { PL_IDLE, PL_ACTIVE, PL_WON, PL_LOST, PL_DONE, POOL_COST, POOL_SECONDS, RISE_S } from './pool.js';
import { drawChest } from './loot-draw.js';
import { ST_INTACT, ST_DONE } from './loot.js';
import { drawSprite, spriteRect } from './sprites.js';

const TAU = Math.PI * 2;
const shellImg = new Image();
shellImg.src = new URL('../assets/shell-blue.webp', import.meta.url).href;

/** A carved stone basin set into the plinth: a wide chiselled rim round a dark hollow, with a faint gold rune glow. */
function drawBasin(ctx, cx, fy, ppu, lw, dim, active, time) {
  const rw = ppu * 1.18, rh = ppu * 0.27;
  ctx.fillStyle = dim ? '#4c525c' : '#76808e'; ctx.strokeStyle = '#1c222c'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.ellipse(cx, fy - ppu * 0.03, rw, rh, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dim ? '#262c35' : '#232a36';
  ctx.beginPath(); ctx.ellipse(cx, fy - ppu * 0.06, rw * 0.8, rh * 0.68, 0, 0, TAU); ctx.fill();
  if (!dim) { // the hollow glows a faint sea-green, faster while the wager runs
    const g = 0.16 + 0.1 * Math.sin(time * (active ? 7 : 2.4));
    ctx.fillStyle = 'rgba(130,230,200,' + g.toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(cx, fy - ppu * 0.07, rw * 0.7, rh * 0.58, 0, 0, TAU); ctx.fill();
  }
  // chisel marks round the rim: short ticks between the two outlines
  ctx.strokeStyle = dim ? '#383e48' : '#4f5966'; ctx.lineWidth = Math.max(1, ppu * 0.035); ctx.lineCap = 'butt'; // r46: dark chisel marks (pale ones read as rivets)
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    ctx.moveTo(cx + Math.cos(a) * rw * 0.86, fy - ppu * 0.035 + Math.sin(a) * rh * 0.86);
    ctx.lineTo(cx + Math.cos(a) * rw * 0.96, fy - ppu * 0.035 + Math.sin(a) * rh * 0.96);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
}

const PIPS = [null, [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
/** A stone die standing on its bottom edge at (cx, by): a front face with pips, a lit top face and a shaded side. */
function drawDie(ctx, cx, by, s, face, lw, dim) {
  const h = s * 0.82, x0 = cx - s / 2, y1 = by, y0 = by - h, dx = s * 0.2, dy = s * 0.2;
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#1c222c'; ctx.lineWidth = lw;
  ctx.fillStyle = dim ? '#5a606a' : '#8d97a6'; // right side
  ctx.beginPath(); ctx.moveTo(x0 + s, y0); ctx.lineTo(x0 + s + dx, y0 - dy); ctx.lineTo(x0 + s + dx, y1 - dy); ctx.lineTo(x0 + s, y1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dim ? '#7b828d' : '#cdd5df'; // top
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 - dy); ctx.lineTo(x0 + s + dx, y0 - dy); ctx.lineTo(x0 + s, y0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dim ? '#6c737e' : '#b4bdc9'; // front
  ctx.beginPath(); ctx.roundRect(x0, y0, s, h, s * 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dim ? '#2a303a' : '#2b2146';
  for (const [px, py] of PIPS[face] || PIPS[5]) { ctx.beginPath(); ctx.arc(cx + px * s * 0.24, y0 + h / 2 + py * h * 0.24, s * 0.085, 0, TAU); ctx.fill(); }
}

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
    drawBasin(ctx, cx, fy, ppu, lw, false, false, time);
    const rise = st.state === PL_WON && st.rise > 0 ? st.rise / RISE_S : 0;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - ppu * 2, fy - ppu * 4, ppu * 4, ppu * 4 + ppu * 0.05); ctx.clip();
    drawChest(ctx, cx, fy - ppu * 0.5 + rise * ppu * 0.7, ppu * 1.15, time, 7, st.state === PL_DONE ? ST_DONE : ST_INTACT, 0, 0);
    ctx.restore();
    if (st.state === PL_WON) { // the prize glows faintly
      const g = ctx.createRadialGradient(cx, fy - ppu * 0.5, ppu * 0.1, cx, fy - ppu * 0.5, ppu * 1.3);
      g.addColorStop(0, 'rgba(150,235,215,0.3)'); g.addColorStop(1, 'rgba(150,235,215,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, fy - ppu * 0.5, ppu * 1.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return;
  }
  const dim = st.state === PL_LOST;
  drawBasin(ctx, cx, fy, ppu, lw, dim, st.state === PL_ACTIVE, time);
  // the pedestal is a standing rune stone (r46; the die without a sprite), rattling while the wager runs
  const rattle = st.state === PL_ACTIVE;
  const px = cx + (rattle ? Math.sin(time * 38) * ppu * 0.025 : 0), pby = fy - ppu * 0.12 - (rattle ? Math.abs(Math.sin(time * 9)) * ppu * 0.05 : 0);
  if (spriteRect('stone')) {
    if (dim) ctx.globalAlpha = 0.6;
    drawSprite(ctx, 'stone', px, pby + ppu * 0.06, 0, ppu * 0.82);
    ctx.globalAlpha = 1;
  } else drawDie(ctx, px, pby, ppu * 0.72, rattle ? 1 + (Math.floor(time * 4 + st.t * 3) * 7 % 6) : 5, lw, dim);
  if (st.state === PL_IDLE) {
    // the wager: five shells hovering in an arc over the die (the cost, counted, no text and no price tag)
    const afford = shells >= POOL_COST, flash = st.flash > 0;
    const n = POOL_COST, sz = ppu * 0.3;
    if (flash) { ctx.fillStyle = 'rgba(255,90,70,0.28)'; ctx.beginPath(); ctx.arc(cx, fy - ppu * 1.55, ppu * 0.95, 0, TAU); ctx.fill(); }
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const sx = cx + k * ppu * 0.3 + (flash ? Math.sin(time * 50 + i) * ppu * 0.03 : 0);
      const sy = fy - ppu * 1.5 + Math.abs(k) * Math.abs(k) * ppu * 0.05 - Math.sin(time * 2.2 + i * 0.9) * ppu * 0.05;
      ctx.globalAlpha = afford || flash ? 1 : 0.5;
      if (shellImg.complete && shellImg.naturalWidth) ctx.drawImage(shellImg, sx - sz / 2, sy - sz / 2, sz, sz);
      else { ctx.fillStyle = '#7fc4ff'; ctx.beginPath(); ctx.arc(sx, sy, sz * 0.4, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // a slim dashed arc of pale water under the shells ties them to the stone
    ctx.strokeStyle = flash ? '#ff6a5a' : 'rgba(170,235,220,' + (afford ? 0.45 : 0.2) + ')'; ctx.lineWidth = Math.max(1, ppu * 0.035);
    ctx.setLineDash([ppu * 0.08, ppu * 0.1]);
    ctx.beginPath(); ctx.arc(cx, fy - ppu * 1.5, ppu * 0.78, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
    ctx.setLineDash([]);
  } else if (st.state === PL_ACTIVE) {
    // the wager is on: a ring of glowing specks round the stone, one per second, going out
    const n = POOL_SECONDS, left = Math.ceil(st.t);
    const cy = fy - ppu * 0.75;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU, on = i < left;
      const rx = cx + Math.cos(a) * ppu * 0.95, ry = cy + Math.sin(a) * ppu * 0.95;
      ctx.fillStyle = on ? 'rgba(160,250,225,' + (0.7 + 0.25 * Math.sin(time * 6 + i)).toFixed(3) + ')' : 'rgba(90,100,110,0.45)';
      ctx.beginPath(); ctx.arc(rx, ry, Math.max(1.6, ppu * 0.06), 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * The pool's host (round 40): a stout orange pufferfish in a purple top hat and bow tie, who stands on the floor left of the plinth
 * (the same chunky dark outline as the other code-drawn people), watches the octopus and cheers, groans or hops with the wager. Drawn
 * after the octopus (main.js v2People), so it never hides him.
 * @param {{plan:{x:number,floorY:number}, state:number}} st
 * @param {number} lookX the octopus's x (the host's eyes follow it)
 */
export function drawPoolHost(ctx, camera, cw, ch, st, time, lookX) {
  const ppu = camera.pxPerUnit, p = st.plan;
  const cx = cw / 2 + (p.x - 1.7 - camera.x) * ppu, fy = ch / 2 + (p.floorY + 1 - camera.y) * ppu; // his feet on the floor beside the plinth
  if (cx < -ppu * 3 || cx > cw + ppu * 3 || fy < -ppu * 3 || fy > ch + ppu * 4) return;
  const k = ppu, lw = Math.max(1.5, ppu * 0.05);
  const hop = st.state === PL_ACTIVE ? Math.abs(Math.sin(time * 5)) * k * 0.12 : st.state === PL_WON ? Math.abs(Math.sin(time * 7)) * k * 0.16 : 0;
  const bob = Math.sin(time * 1.9) * k * 0.025;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (!st.noShadow) { ctx.fillStyle = 'rgba(6,14,22,0.3)'; ctx.beginPath(); ctx.ellipse(cx, fy - 1, k * 0.42, ppu * 0.07, 0, 0, TAU); ctx.fill(); } // st.noShadow: a corpse
  if (spriteRect('host')) {
    // r46: Milan's sea horse, hovering just over the floor: it faces the octopus, bobs, hops and sways when it cheers, droops when lost
    const lost = st.state === PL_LOST, cheer = st.state === PL_ACTIVE || st.state === PL_WON;
    const sway = cheer ? Math.sin(time * 8) * 0.08 : lost ? 0.12 : Math.sin(time * 1.3) * 0.03;
    if (lost) ctx.globalAlpha = 0.85;
    ctx.translate(cx, fy - ppu * 0.08 - hop + bob);
    ctx.rotate(sway);
    drawSprite(ctx, 'host', 0, 0, 0, k * (lost ? 1.08 : 1.15), 0.5, 1, 0, lookX > p.x - 1.7);
    ctx.restore();
    return;
  }
  ctx.translate(cx, fy - hop);
  ctx.strokeStyle = '#2a1808'; ctx.lineWidth = lw;
  ctx.fillStyle = '#c4622a'; // feet
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * k * 0.17, -k * 0.07, k * 0.14, k * 0.07, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.translate(0, bob);
  const cheer = st.state === PL_ACTIVE || st.state === PL_WON, flap = Math.sin(time * 8) * 0.25;
  ctx.fillStyle = '#e07a3a'; // arm fins: raised when he cheers
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(sd * k * 0.44, -k * (cheer ? 0.62 : 0.4), k * 0.14, k * 0.07, sd * ((cheer ? -1.0 : 0.5) + (cheer ? flap : 0)), 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#f29a52'; // body
  ctx.beginPath(); ctx.ellipse(0, -k * 0.42, k * 0.4, k * 0.38, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd9a0'; // belly
  ctx.beginPath(); ctx.ellipse(0, -k * 0.3, k * 0.25, k * 0.22, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#a8501f'; ctx.lineWidth = Math.max(1, lw * 0.7); // little spines
  ctx.beginPath();
  for (const a of [-2.5, -2.05, -1.6, -1.15, -0.7]) { ctx.moveTo(Math.cos(a) * k * 0.38, -k * 0.42 + Math.sin(a) * k * 0.36); ctx.lineTo(Math.cos(a) * k * 0.5, -k * 0.42 + Math.sin(a) * k * 0.47); }
  ctx.stroke();
  ctx.strokeStyle = '#2a1808'; ctx.lineWidth = lw;
  // eyes follow the octopus
  const lk = Math.max(-1, Math.min(1, (lookX - p.x + 1.7) / 4));
  for (const sd of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sd * k * 0.16, -k * 0.55, k * 0.1, k * 0.115, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10202c'; ctx.beginPath(); ctx.arc(sd * k * 0.16 + lk * k * 0.04, -k * 0.54, k * 0.045, 0, TAU); ctx.fill();
  }
  // mouth: a grin when it is on, a frown when lost, a small smile otherwise
  ctx.strokeStyle = '#6b2a10'; ctx.lineWidth = Math.max(1, lw * 0.8);
  ctx.beginPath();
  if (st.state === PL_LOST) ctx.arc(0, -k * 0.2, k * 0.09, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (cheer) { ctx.arc(0, -k * 0.34, k * 0.12, 0.1 * Math.PI, 0.9 * Math.PI); ctx.closePath(); ctx.fillStyle = '#7a2a14'; ctx.fill(); }
  else ctx.arc(0, -k * 0.36, k * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // bow tie
  ctx.fillStyle = '#7b3fa0'; ctx.strokeStyle = '#2a1808'; ctx.lineWidth = Math.max(1, lw * 0.8);
  ctx.beginPath(); ctx.moveTo(0, -k * 0.16); ctx.lineTo(-k * 0.13, -k * 0.23); ctx.lineTo(-k * 0.13, -k * 0.09); ctx.closePath(); ctx.moveTo(0, -k * 0.16); ctx.lineTo(k * 0.13, -k * 0.23); ctx.lineTo(k * 0.13, -k * 0.09); ctx.closePath(); ctx.fill(); ctx.stroke();
  // top hat with a sea-glass band
  ctx.fillStyle = '#2b2146'; ctx.strokeStyle = '#120c20'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.roundRect(-k * 0.2, -k * 1.02, k * 0.4, k * 0.34, k * 0.04); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-k * 0.3, -k * 0.73, k * 0.6, k * 0.08, k * 0.03); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7fcfb4'; ctx.fillRect(-k * 0.2, -k * 0.8, k * 0.4, k * 0.07);
  ctx.restore();
}
