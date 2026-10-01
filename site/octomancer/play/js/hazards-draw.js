// Hazard drawing (hazards.js), all code-drawn shapes (no sprites this round). Called from main.js's v2 extra
// draw hook, in device pixels, after enemies and bombs and before the octopus. Reads the flat hazard arrays.

import { HZ_JET, HZ_SPIKES, HZ_ROCK, HZ_EEL, HZ_ANEMONE, SPIKE_HALF_LEN, SPIKE_REACH, EEL_HALF_BODY, EEL_RING_MAX, EEL_CHARGE_AT, EEL_FIRE_AT } from './hazards.js';
import { prefersReducedMotion } from './config.js';

const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {number} cw canvas width (px)
 * @param {number} ch canvas height (px)
 * @param {ReturnType<import('./hazards.js').createHazards>['data']} d
 * @param {number} time seconds
 * @param {(tx:number,ty:number)=>boolean} [isSolid] world tile test: clips the eel ring at rock, insets spike plates at convex corners
 */
export function drawHazards(ctx, camera, cw, ch, d, time, isSolid) {
  const ppu = camera.pxPerUnit;
  const margin = 9; // world units: skip hazards farther off screen than a jet stream can reach
  const left = camera.x - cw / 2 / ppu - margin, right = camera.x + cw / 2 / ppu + margin;
  const top = camera.y - ch / 2 / ppu - margin, bottom = camera.y + ch / 2 / ppu + margin;
  for (let i = 0; i < d.n; i++) {
    if (d.x[i] < left || d.x[i] > right || d.y[i] < top || d.y[i] > bottom) continue;
    const sx = cw / 2 + (d.x[i] - camera.x) * ppu, sy = ch / 2 + (d.y[i] - camera.y) * ppu;
    switch (d.kind[i]) {
      case HZ_JET: drawJet(ctx, sx, sy, ppu, d.dx[i], d.dy[i], d.len[i], time, i); break;
      case HZ_SPIKES: drawSpikes(ctx, sx, sy, ppu, d.dx[i], d.dy[i], isSolid, d.x[i], d.y[i]); break;
      case HZ_ROCK: if (d.state[i] !== 3) drawRock(ctx, sx, sy, ppu, d.state[i], time, i, d.v[i], isSolid, d.x[i], d.y[i], d.a[i]); break;
      case HZ_EEL: drawEel(ctx, sx, sy, ppu, d.state[i], d.r[i], d.t[i], time, isSolid, d.x[i], d.y[i]); break;
      case HZ_ANEMONE: drawAnemone(ctx, sx, sy, ppu, time, i); break;
      default: break;
    }
  }
}

// ---- current jet: a nozzle in the wall and a stream of bubbles streaming away from it ----
function drawJet(ctx, sx, sy, ppu, dx, dy, len, time, seed) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.atan2(dy, dx)); // +x runs along the stream
  // faint current body
  const g = ctx.createLinearGradient(0, 0, len * ppu, 0);
  g.addColorStop(0, 'rgba(190,250,255,0.26)');
  g.addColorStop(1, 'rgba(190,250,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0.1 * ppu, -0.45 * ppu);
  ctx.lineTo(len * ppu, -1.05 * ppu);
  ctx.lineTo(len * ppu, 1.05 * ppu);
  ctx.lineTo(0.1 * ppu, 0.45 * ppu);
  ctx.closePath(); ctx.fill();
  // streaks
  ctx.strokeStyle = 'rgba(220,255,255,0.35)';
  ctx.lineWidth = Math.max(1, ppu * 0.03);
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const off = (k - 1.5) * 0.3;
    const u = ((time * 0.9 + k * 0.27 + seed * 0.13) % 1);
    const x0 = (0.3 + u * (len - 1.2)) * ppu, x1 = x0 + 0.7 * ppu;
    ctx.beginPath(); ctx.moveTo(x0, off * (0.4 + u) * ppu); ctx.lineTo(x1, off * (0.5 + u) * ppu); ctx.stroke();
  }
  // bubbles
  const n = Math.round(len * 3.2);
  ctx.strokeStyle = 'rgba(235,255,255,0.85)';
  ctx.fillStyle = 'rgba(200,245,255,0.22)';
  ctx.lineWidth = Math.max(1, ppu * 0.035);
  for (let b = 0; b < n; b++) {
    const u = ((b / n) + time * 0.5 + hash(b + seed * 31) * 0.2) % 1;
    const px = (0.25 + u * (len - 0.4)) * ppu;
    const py = (hash(b * 3.1 + seed) - 0.5) * 2 * (0.3 + 0.7 * u) * 0.95 * ppu + Math.sin(time * 4 + b) * 0.05 * ppu;
    const r = (0.05 + hash(b + 7) * 0.07) * ppu * (1 - u * 0.4);
    ctx.globalAlpha = Math.min(1, (1 - u) * 1.6);
    ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // nozzle block on the wall face
  const nw = 0.42 * ppu, nh = 0.95 * ppu;
  ctx.fillStyle = '#2b5f6e';
  ctx.strokeStyle = '#7ff0d0';
  ctx.lineWidth = Math.max(1.5, ppu * 0.05);
  roundRect(ctx, -0.14 * ppu, -nh / 2, nw, nh, 0.12 * ppu);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0d2c36';
  roundRect(ctx, 0.12 * ppu, -0.24 * ppu, 0.14 * ppu, 0.48 * ppu, 0.05 * ppu);
  ctx.fill();
  ctx.restore();
}

// ---- spike wall: a steel strip on the rock face with a row of pale spikes ----
const CORNER_INSET = 0.22; // tiles: where the strip ends at a convex rock corner, plate and spikes stop this far short of it
function drawSpikes(ctx, sx, sy, ppu, dx, dy, isSolid, wx, wy) {
  const half = SPIKE_HALF_LEN;
  // a strip end is at a convex corner when the rock layer behind the strip stops there (no rock beyond the end)
  let lo = -half, hi = half;
  if (isSolid) {
    const tx = -dy, ty = dx;
    if (!isSolid(Math.floor(wx - dx - tx * 2), Math.floor(wy - dy - ty * 2))) lo += CORNER_INSET;
    if (!isSolid(Math.floor(wx - dx + tx * 2), Math.floor(wy - dy + ty * 2))) hi -= CORNER_INSET;
  }
  ctx.save();
  ctx.translate(sx - dx * 0.5 * ppu, sy - dy * 0.5 * ppu); // centre of the face
  ctx.rotate(Math.atan2(dy, dx)); // +x = out of the rock
  ctx.fillStyle = '#4d6278';
  ctx.strokeStyle = '#223445';
  ctx.lineWidth = Math.max(1, ppu * 0.04);
  ctx.beginPath(); ctx.rect(-0.04 * ppu, lo * ppu, 0.2 * ppu, (hi - lo) * ppu); ctx.fill(); ctx.stroke();
  const count = 6, step = (hi - lo) / count;
  for (let k = 0; k < count; k++) {
    const cy = (lo + step * (k + 0.5)) * ppu, hw = step * 0.44 * ppu;
    const g = ctx.createLinearGradient(0.15 * ppu, 0, SPIKE_REACH * ppu, 0);
    g.addColorStop(0, '#9fb4c6');
    g.addColorStop(1, '#f2f8fc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0.14 * ppu, cy - hw);
    ctx.lineTo(SPIKE_REACH * ppu, cy);
    ctx.lineTo(0.14 * ppu, cy + hw);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ---- falling rock: a loose boulder, grey-brown and faceted (not the blue of the cave walls) ----
const BOULDER_N = 10;
/**
 * A faceted boulder of radius R centred on (x, y): grey-brown, dark outline, a few cracks. Each facet is a
 * triangle from an off-centre hub, shaded by the side it faces (light from the upper left).
 */
export function drawBoulder(ctx, x, y, R, seed, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  const vx = new Array(BOULDER_N), vy = new Array(BOULDER_N);
  for (let k = 0; k < BOULDER_N; k++) {
    const a = (k / BOULDER_N) * TAU + hash(seed * 5.7) * 0.5;
    const r = R * (0.84 + hash(seed * 11 + k * 1.7) * 0.2);
    vx[k] = Math.cos(a) * r; vy[k] = Math.sin(a) * r * 0.95;
  }
  const hubX = -R * 0.12, hubY = -R * 0.14;
  ctx.lineJoin = 'round';
  for (let k = 0; k < BOULDER_N; k++) {
    const k2 = (k + 1) % BOULDER_N;
    const mx = (vx[k] + vx[k2]) / 2, my = (vy[k] + vy[k2]) / 2;
    const light = (-mx * 0.6 - my * 0.8) / R; // upper left is lit
    const v = 0.5 + light * 0.32 + (hash(seed * 3 + k) - 0.5) * 0.1;
    const r = Math.round(62 + v * 88), g = Math.round(56 + v * 80), b = Math.round(50 + v * 70);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath(); ctx.moveTo(hubX, hubY); ctx.lineTo(vx[k], vy[k]); ctx.lineTo(vx[k2], vy[k2]); ctx.closePath(); ctx.fill();
  }
  // facet edges
  ctx.strokeStyle = 'rgba(28,22,18,0.45)';
  ctx.lineWidth = Math.max(1, R * 0.05);
  ctx.beginPath();
  for (let k = 0; k < BOULDER_N; k += 2) { ctx.moveTo(hubX, hubY); ctx.lineTo(vx[k], vy[k]); }
  ctx.stroke();
  // dark outline
  ctx.strokeStyle = '#1f1a17';
  ctx.lineWidth = Math.max(1.8, R * 0.12);
  ctx.beginPath();
  for (let k = 0; k < BOULDER_N; k++) { if (k === 0) ctx.moveTo(vx[k], vy[k]); else ctx.lineTo(vx[k], vy[k]); }
  ctx.closePath(); ctx.stroke();
  // cracks
  ctx.strokeStyle = 'rgba(20,15,12,0.75)';
  ctx.lineWidth = Math.max(1, R * 0.06);
  ctx.beginPath();
  ctx.moveTo(vx[1] * 0.92, vy[1] * 0.92); ctx.lineTo(R * 0.12, -R * 0.02); ctx.lineTo(R * 0.3, R * 0.32);
  ctx.moveTo(R * 0.12, -R * 0.02); ctx.lineTo(-R * 0.22, R * 0.18); ctx.lineTo(-R * 0.3, R * 0.5);
  ctx.moveTo(vx[6] * 0.9, vy[6] * 0.9); ctx.lineTo(-R * 0.1, R * 0.3);
  ctx.stroke();
  // a pale chip on the lit edge
  ctx.fillStyle = 'rgba(225,215,200,0.35)';
  ctx.beginPath(); ctx.moveTo(-R * 0.55, -R * 0.45); ctx.lineTo(-R * 0.2, -R * 0.68); ctx.lineTo(-R * 0.3, -R * 0.42); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawRock(ctx, sx, sy, ppu, state, time, seed, vy, isSolid, wx, wy, landY) {
  const calm = prefersReducedMotion();
  const shake = state === 1 && !calm ? Math.sin(time * 70) * 0.09 * ppu : 0; // r35: twice the old rumble, it was easy to miss
  if (state === 1 && landY > wy) { // a shadow grows on the floor under it while it rumbles
    const fy = sy + (landY - wy + 0.5) * ppu, k = 0.5 + 0.5 * Math.abs(Math.sin(time * 12));
    ctx.fillStyle = 'rgba(6,10,20,' + (0.3 + 0.25 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(sx, fy - 0.04 * ppu, 0.55 * ppu, 0.1 * ppu, 0, 0, TAU); ctx.fill();
  }
  if (state === 2) { // motion streaks above a falling rock
    ctx.strokeStyle = 'rgba(200,200,190,0.35)';
    ctx.lineWidth = Math.max(1, ppu * 0.05);
    const l = Math.min(1.4, vy * 0.12) * ppu;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(sx + k * 0.25 * ppu, sy - 0.5 * ppu); ctx.lineTo(sx + k * 0.25 * ppu, sy - 0.5 * ppu - l); ctx.stroke(); }
  }
  let R = 0.5 * ppu;
  // hanging in a ceiling corner beside a wall: shrink a little and lean off the wall so the rim is not covered
  let lean = 0;
  if (state < 2 && isSolid) {
    const tx = Math.floor(wx), ty = Math.floor(wy);
    const l = isSolid(tx - 1, ty), r = isSolid(tx + 1, ty);
    if (l !== r) { R = 0.45 * ppu; lean = (l ? 0.12 : -0.12) * ppu; }
  }
  sx += lean;
  if (state < 2) {
    // hanging: a dark gap where it meets the ceiling, and a few grains of grit trickling down
    const top = sy - 0.5 * ppu;
    ctx.fillStyle = 'rgba(8,14,24,0.55)';
    ctx.beginPath(); ctx.ellipse(sx, top + 0.03 * ppu, 0.36 * ppu, 0.07 * ppu, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(205,195,180,0.6)';
    for (let k = 0; k < 3; k++) {
      const u = (time * (state === 1 ? 1.6 : 0.35) + k * 0.37 + hash(seed + k)) % 1;
      const gx = sx + (hash(seed * 3 + k) - 0.5) * 0.55 * ppu;
      ctx.globalAlpha = (1 - u) * (state === 1 ? 0.9 : 0.55);
      ctx.beginPath(); ctx.arc(gx, top + 0.1 * ppu + u * 0.6 * ppu, Math.max(1, 0.025 * ppu), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const wob = state === 0 ? Math.sin(time * 1.3 + seed) * 0.012 : 0; // a faint unsteady tilt: it is loose
  drawBoulder(ctx, sx + shake, sy + 0.01 * ppu, R, seed, wob + (state === 1 ? Math.sin(time * 60) * 0.03 : 0));
  if (state === 1) { // dust puffs while it rumbles
    ctx.fillStyle = 'rgba(200,190,175,0.4)';
    for (let k = 0; k < 3; k++) {
      const u = (time * 2 + k * 0.33) % 1;
      ctx.beginPath(); ctx.arc(sx + (k - 1) * 0.3 * ppu, sy - 0.45 * ppu + u * 0.3 * ppu, (0.05 + 0.05 * u) * ppu, 0, TAU); ctx.fill();
    }
  }
}

// ---- electric eel: a striped body, a glow while it charges and a jagged shock ring ----
const RING_PTS = 44;
const ringOk = new Uint8Array(RING_PTS + 1);
function drawEel(ctx, sx, sy, ppu, state, ring, cycle, time, isSolid, wx, wy) {
  const glow = state === 1 ? 0.35 + 0.65 * Math.abs(Math.sin(time * 18)) : 0;
  if (glow > 0) {
    const g = ctx.createRadialGradient(sx, sy, 0.1 * ppu, sx, sy, 1.3 * ppu);
    g.addColorStop(0, 'rgba(255,245,120,' + (0.55 * glow).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,245,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, 1.3 * ppu, 0, TAU); ctx.fill();
  }
  // body: a wavy vertical line, drawn as two strokes (dark outline, teal body) plus yellow dashes
  const seg = 9, half = EEL_HALF_BODY * ppu;
  const path = () => {
    ctx.beginPath();
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      const px = sx + Math.sin(time * 5 + u * 5) * 0.13 * ppu;
      const py = sy - half + u * 2 * half;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1b2f45'; ctx.lineWidth = 0.36 * ppu; path(); ctx.stroke();
  ctx.strokeStyle = '#3f8a78'; ctx.lineWidth = 0.26 * ppu; path(); ctx.stroke();
  ctx.strokeStyle = glow > 0 ? '#fff7a0' : '#d9e85a'; ctx.lineWidth = 0.09 * ppu;
  ctx.setLineDash([0.1 * ppu, 0.17 * ppu]); path(); ctx.stroke(); ctx.setLineDash([]);
  // head (top end) with an eye
  const hx = sx + Math.sin(time * 5) * 0.13 * ppu, hy = sy - half;
  ctx.fillStyle = '#3f8a78'; ctx.strokeStyle = '#1b2f45'; ctx.lineWidth = Math.max(1, ppu * 0.04);
  ctx.beginPath(); ctx.arc(hx, hy, 0.19 * ppu, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + 0.06 * ppu, hy - 0.03 * ppu, 0.06 * ppu, 0, TAU); ctx.fill();
  ctx.fillStyle = '#10202e'; ctx.beginPath(); ctx.arc(hx + 0.075 * ppu, hy - 0.03 * ppu, 0.03 * ppu, 0, TAU); ctx.fill();
  // the ring: a jagged circle growing out of the eel, stopped by rock (the same cover the shock's damage check uses)
  if (ring > 0) {
    const fade = Math.max(0, 1 - ring / EEL_RING_MAX);
    const pts = RING_PTS;
    for (let k = 0; k < pts; k++) {
      let ok = 1;
      if (isSolid) {
        const a = (k / pts) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        for (let r = 0.25; r <= ring + 0.1; r += 0.2) if (isSolid(Math.floor(wx + ca * r), Math.floor(wy + sa * r))) { ok = 0; break; }
      }
      ringOk[k] = ok;
    }
    ringOk[pts] = ringOk[0];
    const ringPath = (wob) => {
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k <= pts; k++) {
        if (!ringOk[k]) { pen = false; continue; }
        const a = (k / pts) * TAU;
        const r = (ring + (k % 2 ? 1 : -1) * wob * (0.6 + 0.4 * Math.sin(k * 3.1 + time * 40))) * ppu;
        const px = sx + Math.cos(a) * r, py = sy + Math.sin(a) * r;
        if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
      }
    };
    ctx.strokeStyle = 'rgba(255,240,110,' + (0.35 * fade).toFixed(3) + ')';
    ctx.lineWidth = 0.3 * ppu; ringPath(0.08); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,220,' + (0.95 * fade + 0.05).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, 0.07 * ppu); ringPath(0.07); ctx.stroke();
  } else if (glow > 0) { // telegraph: a small ring drawing in, and 0.5 s of crackling arcs round the body
    const u = Math.max(0, Math.min(1, (cycle - EEL_CHARGE_AT) / (EEL_FIRE_AT - EEL_CHARGE_AT)));
    ctx.strokeStyle = 'rgba(255,245,140,' + (0.5 * glow).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, 0.04 * ppu);
    ctx.beginPath(); ctx.arc(sx, sy, (1.0 - 0.5 * u) * ppu, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,230,0.95)'; ctx.lineWidth = Math.max(1.5, 0.045 * ppu); ctx.lineJoin = 'miter';
    const flick = Math.floor(time * 30); // a new set of arcs 30 times a second
    for (let k = 0; k < 4; k++) {
      let a = hash(flick * 7 + k) * TAU, r = 0.15 * ppu;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * r, sy + (hash(flick + k * 3) - 0.5) * 2 * half * 0.9);
      for (let j = 0; j < 4; j++) {
        a += (hash(flick * 3 + k * 11 + j) - 0.5) * 1.8; r += (0.16 + 0.14 * hash(flick + j * 5 + k)) * ppu * (0.6 + 0.6 * u);
        ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.9);
      }
      ctx.stroke();
    }
  }
}

// ---- anemone cluster: a low base and swaying pink tentacles ----
function drawAnemone(ctx, sx, sy, ppu, time, seed) {
  const floor = sy + 0.5 * ppu;
  ctx.fillStyle = '#7a2352';
  ctx.beginPath(); ctx.ellipse(sx, floor - 0.06 * ppu, 0.56 * ppu, 0.16 * ppu, 0, 0, TAU); ctx.fill();
  ctx.lineCap = 'round';
  const n = 11;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1) - 0.5; // -0.5..0.5
    const bx = sx + u * 0.95 * ppu;
    const h = (0.62 + hash(seed * 3 + k) * 0.36 + (0.5 - Math.abs(u)) * 0.2) * ppu;
    const sway = Math.sin(time * 1.7 + k * 0.85 + seed) * 0.2 * ppu;
    const tipX = bx + sway + u * 0.25 * ppu, tipY = floor - h;
    ctx.strokeStyle = k % 2 ? '#ff6fb0' : '#e3479b';
    ctx.lineWidth = 0.1 * ppu;
    ctx.beginPath();
    ctx.moveTo(bx, floor - 0.06 * ppu);
    ctx.quadraticCurveTo(bx + sway * 0.2, floor - h * 0.6, tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = '#ffd3e8';
    ctx.beginPath(); ctx.arc(tipX, tipY, 0.065 * ppu, 0, TAU); ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
