// Loot drawing (loot.js): code-drawn clams, pots, hidden-pocket cues, the relic on its pedestal, pocket items,
// the trap burst and the chase rocks; chests use the generated chest sprites (img/v2/, js/v2-art.js).
// Called from main.js's v2 extra draw hook, in device pixels, before the octopus.

import { LK_CLAM, LK_POT, LK_CHEST, LK_POCKET, LK_RELIC, ST_INTACT, ST_RATTLE, ST_BURST, SPIKE_RADIUS, POCKET_BOMB, POCKET_ITEM } from './loot.js';
import { itemFromCode } from './items.js';
import { drawItemIcon } from './items-draw.js';
import { drawBoulder } from './hazards-draw.js';
import { artImg } from './v2-art.js';
import { visibleAt, cullFlags, cullView } from './cull.js';

const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {ReturnType<import('./loot.js').createLoot>['data']} d
 * @param {number} time seconds
 */
export function drawLoot(ctx, camera, cw, ch, d, time) {
  const ppu = camera.pxPerUnit;
  const sx = (wx) => cw / 2 + (wx - camera.x) * ppu, sy = (wy) => ch / 2 + (wy - camera.y) * ppu;
  cullView(camera, cw, ch);
  const fl = cullFlags('loot', d.n), fi = cullFlags('lootItems', d.ni), fr = cullFlags('lootRocks', d.nr);
  for (let i = 0; i < d.n; i++) {
    if (!visibleAt(fl, i, d.x[i], d.y[i], 3)) continue; // r43: off-screen loot is not animated or drawn
    const x = sx(d.x[i]), y = sy(d.y[i]);
    const st = d.state[i];
    switch (d.kind[i]) {
      case LK_CLAM: if (st === ST_INTACT) drawClam(ctx, x, y, ppu, time, i); break;
      case LK_POT: if (st === ST_INTACT) drawPot(ctx, x, y, ppu, i); break;
      case LK_CHEST: drawChest(ctx, x, y, ppu, time, i, st, d.t[i], d.aux[i]); break;
      case LK_POCKET: if (st === ST_INTACT) drawPocketCue(ctx, x, y, ppu, time, i); break;
      case LK_RELIC: drawRelic(ctx, x, y, ppu, time, st === ST_INTACT); break;
      default: break;
    }
  }
  for (let i = 0; i < d.ni; i++) {
    if (d.itaken[i]) continue;
    if (!visibleAt(fi, i, d.ix[i], d.iy[i], 3)) continue;
    const x = sx(d.ix[i]), y = sy(d.iy[i]) + Math.sin(time * 2.4 + i) * 0.06 * ppu;
    if (d.ikind[i] === POCKET_BOMB) drawBombItem(ctx, x, y, ppu);
    else if (d.ikind[i] === POCKET_ITEM) {
      const gl = ctx.createRadialGradient(x, y, 0.05 * ppu, x, y, 0.7 * ppu);
      gl.addColorStop(0, 'rgba(255,240,170,0.45)'); gl.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 0.7 * ppu, 0, TAU); ctx.fill();
      drawItemIcon(ctx, itemFromCode(d.iid[i]), x, y, 0.3 * ppu);
    } else drawHeartItem(ctx, x, y, ppu);
  }
  for (let i = 0; i < d.nr; i++) {
    if (!visibleAt(fr, i, d.rx[i], d.ry[i], 6)) continue;
    const x = sx(d.rx[i]), y = sy(d.ry[i]);
    if (d.rstate[i] === 1) { // warning: grit shaking loose at the ceiling, and a pale streak down the column
      const k = 1 - d.rt[i] / 0.55;
      ctx.fillStyle = 'rgba(205,195,180,0.75)';
      for (let g = 0; g < 4; g++) {
        const u = (time * 3 + g * 0.27) % 1;
        ctx.globalAlpha = 0.4 + 0.5 * k;
        ctx.beginPath(); ctx.arc(x + (hash(i * 5 + g) - 0.5) * 0.7 * ppu + Math.sin(time * 50 + g) * 0.03 * ppu, y - 0.6 * ppu + u * 0.5 * ppu, Math.max(1.2, 0.04 * ppu), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawBoulder(ctx, x + Math.sin(time * 60) * 0.03 * ppu, y - 0.15 * ppu, 0.36 * ppu, i + 3, 0);
    } else {
      ctx.strokeStyle = 'rgba(200,200,190,0.3)';
      ctx.lineWidth = Math.max(1, ppu * 0.05);
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 0.2 * ppu, y - 0.4 * ppu); ctx.lineTo(x + k * 0.2 * ppu, y - 1.2 * ppu); ctx.stroke(); }
      drawBoulder(ctx, x, y, 0.45 * ppu, i + 3, time * 2);
    }
  }
}

// ---- clam: two ribbed halves, a hinge and a glint inside ----
function drawClam(ctx, x, y, ppu, time, seed) {
  const floor = y + 0.5 * ppu - 0.05 * ppu;
  const w = 0.5 * ppu, h = 0.38 * ppu;
  ctx.save();
  ctx.translate(x, floor);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a1f4c'; ctx.lineWidth = Math.max(1.5, ppu * 0.05);
  // lower half
  ctx.fillStyle = '#c86fa8';
  ctx.beginPath(); ctx.moveTo(-w, -0.08 * ppu); ctx.quadraticCurveTo(-w * 0.8, 0.02 * ppu, 0, 0.02 * ppu); ctx.quadraticCurveTo(w * 0.8, 0.02 * ppu, w, -0.08 * ppu);
  ctx.quadraticCurveTo(0, -0.2 * ppu, -w, -0.08 * ppu); ctx.closePath(); ctx.fill(); ctx.stroke();
  // inside gleam
  ctx.fillStyle = '#fff2c8';
  const g = 0.55 + 0.45 * Math.sin(time * 3 + seed);
  ctx.globalAlpha = 0.6 + 0.4 * g;
  ctx.beginPath(); ctx.ellipse(0, -0.1 * ppu, w * 0.42, 0.045 * ppu, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // upper half, opened a crack
  const lift = (0.06 + 0.03 * Math.sin(time * 1.6 + seed)) * ppu;
  ctx.fillStyle = '#e58ac2';
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-w, -0.08 * ppu);
  ctx.bezierCurveTo(-w * 0.95, -h * 1.25 - lift, w * 0.95, -h * 1.25 - lift, w, -0.08 * ppu);
  ctx.quadraticCurveTo(0, -0.17 * ppu - lift, -w, -0.08 * ppu); ctx.closePath(); ctx.fill(); ctx.stroke();
  // ribs: fan out from the hinge and stay inside the lid (clipped to its outline), so nothing pokes into the water
  ctx.clip();
  const top = 0.9375 * h + 0.75 * lift + 0.02 * ppu;   // height of the dome above the hinge line
  const hingeY = -0.14 * ppu - lift * 0.4;
  ctx.strokeStyle = 'rgba(74,31,76,0.5)'; ctx.lineWidth = Math.max(1, ppu * 0.03); ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    const fx = k * 0.36 * w * 0.8 * 2 / 2;           // |x| <= 0.58 w at the dome
    const dome = 1 - (fx / w) * (fx / w);
    ctx.moveTo(k * w * 0.06, hingeY);
    ctx.quadraticCurveTo(k * w * 0.3, hingeY - top * 0.45, fx, -0.08 * ppu - top * dome * 0.86 - lift * 0.3);
  }
  ctx.stroke();
  // scalloped lid edge: small bumps along the opening
  ctx.fillStyle = 'rgba(255,214,236,0.55)';
  for (let k = -3; k <= 3; k++) {
    const ex = k * w * 0.27, ey = -0.08 * ppu + 0.5 * (1 - (ex / w) * (ex / w)) * (-0.09 * ppu - lift);
    ctx.beginPath(); ctx.arc(ex, ey, w * 0.12, Math.PI, 2 * Math.PI); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

// ---- pot: a terracotta amphora ----
function drawPot(ctx, x, y, ppu, seed) {
  const floor = y + 0.5 * ppu - 0.04 * ppu;
  ctx.save();
  ctx.translate(x, floor);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3a1d0e'; ctx.lineWidth = Math.max(1.5, ppu * 0.05);
  const g = ctx.createLinearGradient(-0.3 * ppu, 0, 0.3 * ppu, 0);
  g.addColorStop(0, '#d8824a'); g.addColorStop(0.55, '#b9602f'); g.addColorStop(1, '#8a4322');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-0.14 * ppu, 0);
  ctx.bezierCurveTo(-0.42 * ppu, -0.05 * ppu, -0.42 * ppu, -0.5 * ppu, -0.15 * ppu, -0.6 * ppu);
  ctx.lineTo(-0.17 * ppu, -0.72 * ppu); ctx.lineTo(0.17 * ppu, -0.72 * ppu); ctx.lineTo(0.15 * ppu, -0.6 * ppu);
  ctx.bezierCurveTo(0.42 * ppu, -0.5 * ppu, 0.42 * ppu, -0.05 * ppu, 0.14 * ppu, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // rim and bands
  ctx.fillStyle = '#c4703c';
  ctx.beginPath(); ctx.roundRect(-0.2 * ppu, -0.77 * ppu, 0.4 * ppu, 0.09 * ppu, 0.03 * ppu); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#f4d8a4'; ctx.lineWidth = Math.max(1.2, ppu * 0.04);
  ctx.beginPath(); ctx.moveTo(-0.33 * ppu, -0.3 * ppu); ctx.quadraticCurveTo(0, -0.22 * ppu, 0.33 * ppu, -0.3 * ppu);
  ctx.moveTo(-0.3 * ppu, -0.4 * ppu); ctx.quadraticCurveTo(0, -0.32 * ppu, 0.3 * ppu, -0.4 * ppu); ctx.stroke();
  ctx.restore();
}

// ---- chest: the generated sprite (code fallback), shaking while a spike trap rattles, spikes when it bursts ----
export function drawChest(ctx, x, y, ppu, time, seed, st, t, trap) {
  const open = st !== ST_INTACT;
  const img = artImg(open ? 'chestOpen' : 'chestClosed');
  const foot = y + 0.5 * ppu - 0.08 * ppu;
  const shake = st === ST_RATTLE ? Math.sin(time * 90) * 0.04 * ppu : 0;
  if (img) {
    const dw = ppu * 0.95, dh = dw * (img.naturalHeight / img.naturalWidth);
    ctx.drawImage(img, x + shake - dw / 2, foot - dh, dw, dh);
    if (!open) glint(ctx, x + dw * 0.2, foot - dh * 0.75, ppu * 0.8, 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(time * 3 + seed)));
  } else {
    const w = ppu * 0.8, h = ppu * 0.5;
    ctx.lineJoin = 'round'; ctx.fillStyle = open ? '#9c6a24' : '#c98a2c'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = Math.max(1.5, ppu * 0.06);
    ctx.beginPath(); ctx.roundRect(x + shake - w / 2, foot - h, w, h, ppu * 0.1); ctx.fill(); ctx.stroke();
  }
  if (st === ST_BURST) { // a ring of spikes bursting out, then drawing back
    const k = Math.min(1, (0.5 - t) / 0.12) * Math.min(1, t / 0.15 + 0.2); // out fast, in at the end
    const len = SPIKE_RADIUS * 0.85 * ppu * k;
    ctx.fillStyle = '#eaf4fb'; ctx.strokeStyle = '#223445'; ctx.lineWidth = Math.max(1, ppu * 0.03);
    const cy = foot - 0.3 * ppu;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * TAU;
      const c = Math.cos(ang), s = Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.06 * ppu, cy + c * 0.06 * ppu);
      ctx.lineTo(x + c * len, cy + s * len);
      ctx.lineTo(x + s * 0.06 * ppu, cy - c * 0.06 * ppu);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (st === ST_RATTLE) { // warning sparks
    ctx.fillStyle = '#ff7a5a';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(time * 40 + k * 1.6) * 0.45 * ppu, foot - 0.3 * ppu + Math.sin(time * 40 + k * 1.6) * 0.3 * ppu, Math.max(1.5, 0.04 * ppu), 0, TAU); ctx.fill(); }
  }
}

function glint(ctx, gx, gy, ppu, alpha) {
  ctx.fillStyle = `rgba(255,248,200,${alpha})`;
  ctx.beginPath(); ctx.moveTo(gx, gy - ppu * 0.2); ctx.lineTo(gx + ppu * 0.05, gy - ppu * 0.05); ctx.lineTo(gx + ppu * 0.2, gy);
  ctx.lineTo(gx + ppu * 0.05, gy + ppu * 0.05); ctx.lineTo(gx, gy + ppu * 0.2); ctx.lineTo(gx - ppu * 0.05, gy + ppu * 0.05);
  ctx.lineTo(gx - ppu * 0.2, gy); ctx.lineTo(gx - ppu * 0.05, gy - ppu * 0.05); ctx.closePath(); ctx.fill();
}

// ---- hidden pocket: a solid rock tile with a hairline crack and a slow glint ----
function drawPocketCue(ctx, x, y, ppu, time, seed) {
  const x0 = x - ppu / 2, y0 = y - ppu / 2;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(14,30,48,0.6)';
  ctx.lineWidth = Math.max(1, ppu * 0.025);
  ctx.beginPath();
  const fx = hash(seed * 3.3) > 0.5 ? 1 : -1;
  ctx.moveTo(x0 + ppu * (0.5 - 0.22 * fx), y0 + ppu * 0.14);
  ctx.lineTo(x0 + ppu * (0.5 - 0.06 * fx), y0 + ppu * 0.38);
  ctx.lineTo(x0 + ppu * (0.5 + 0.08 * fx), y0 + ppu * 0.5);
  ctx.lineTo(x0 + ppu * (0.5 - 0.04 * fx), y0 + ppu * 0.66);
  ctx.lineTo(x0 + ppu * (0.5 + 0.16 * fx), y0 + ppu * 0.88);
  ctx.moveTo(x0 + ppu * (0.5 + 0.08 * fx), y0 + ppu * 0.5);
  ctx.lineTo(x0 + ppu * (0.5 + 0.28 * fx), y0 + ppu * 0.44);
  ctx.stroke();
  // a slow glint: only bright for a moment every few seconds
  const u = ((time * 0.33 + hash(seed * 7.1)) % 1);
  const a = Math.max(0, Math.sin(u * Math.PI * 1.3) - 0.2) * 0.85;
  if (a > 0.02) glint(ctx, x0 + ppu * (0.5 + 0.08 * fx), y0 + ppu * 0.5, ppu * 0.7, a);
  ctx.restore();
}

// ---- relic: a golden idol on a stone pedestal ----
function drawRelic(ctx, x, y, ppu, time, present) {
  const floor = y + 0.5 * ppu;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#20272e'; ctx.lineWidth = Math.max(1.5, ppu * 0.05);
  ctx.fillStyle = '#7d8a94';
  ctx.beginPath(); ctx.roundRect(x - 0.4 * ppu, floor - 0.3 * ppu, 0.8 * ppu, 0.3 * ppu, 0.04 * ppu); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9aa7b0';
  ctx.beginPath(); ctx.roundRect(x - 0.3 * ppu, floor - 0.42 * ppu, 0.6 * ppu, 0.14 * ppu, 0.03 * ppu); ctx.fill(); ctx.stroke();
  if (present) {
    const bob = Math.sin(time * 2) * 0.03 * ppu, cy = floor - 0.42 * ppu - 0.3 * ppu + bob;
    const gl = ctx.createRadialGradient(x, cy, 0.05 * ppu, x, cy, 0.9 * ppu);
    gl.addColorStop(0, 'rgba(255,230,120,0.5)'); gl.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, cy, 0.9 * ppu, 0, TAU); ctx.fill();
    // an idol: a tall faceted drop with two side fins
    ctx.fillStyle = '#e9b73a'; ctx.strokeStyle = '#5a3b08';
    ctx.beginPath();
    ctx.moveTo(x, cy - 0.3 * ppu); ctx.lineTo(x + 0.17 * ppu, cy - 0.05 * ppu); ctx.lineTo(x + 0.11 * ppu, cy + 0.26 * ppu);
    ctx.lineTo(x - 0.11 * ppu, cy + 0.26 * ppu); ctx.lineTo(x - 0.17 * ppu, cy - 0.05 * ppu); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7d96a';
    ctx.beginPath(); ctx.moveTo(x, cy - 0.3 * ppu); ctx.lineTo(x + 0.17 * ppu, cy - 0.05 * ppu); ctx.lineTo(x, cy + 0.02 * ppu); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c4902a';
    ctx.beginPath(); ctx.moveTo(x - 0.17 * ppu, cy - 0.05 * ppu); ctx.lineTo(x - 0.3 * ppu, cy - 0.16 * ppu); ctx.lineTo(x - 0.12 * ppu, cy + 0.12 * ppu); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 0.17 * ppu, cy - 0.05 * ppu); ctx.lineTo(x + 0.3 * ppu, cy - 0.16 * ppu); ctx.lineTo(x + 0.12 * ppu, cy + 0.12 * ppu); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a2410';
    ctx.beginPath(); ctx.arc(x - 0.05 * ppu, cy - 0.04 * ppu, 0.022 * ppu, 0, TAU); ctx.arc(x + 0.05 * ppu, cy - 0.04 * ppu, 0.022 * ppu, 0, TAU); ctx.fill();
    glint(ctx, x + 0.22 * ppu, cy - 0.22 * ppu, ppu * 0.8, 0.5 + 0.4 * Math.sin(time * 4));
  }
  ctx.restore();
}

export function drawBombItem(ctx, x, y, ppu) {
  const r = 0.2 * ppu;
  ctx.fillStyle = '#26303a'; ctx.strokeStyle = '#0b1218'; ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath(); ctx.arc(x, y + r * 0.2, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.25, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#d8b56a'; ctx.beginPath(); ctx.moveTo(x + r * 0.3, y - r * 0.7); ctx.quadraticCurveTo(x + r * 0.8, y - r * 1.3, x + r * 1.1, y - r * 0.9); ctx.stroke();
  ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.arc(x + r * 1.1, y - r * 0.9, r * 0.22, 0, TAU); ctx.fill();
}

export function drawHeartItem(ctx, x, y, ppu) {
  const r = 0.2 * ppu;
  ctx.fillStyle = '#ff5a6e'; ctx.strokeStyle = '#6b1222'; ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.95);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.9, y - r * 1.1, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.5, y - r * 0.1, x, y + r * 0.95);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x - r * 0.5, y - r * 0.35, r * 0.2, 0, TAU); ctx.fill();
}
