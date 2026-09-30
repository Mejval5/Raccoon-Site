// Hazard drawing (hazards.js), all code-drawn shapes (no sprites this round). Called from main.js's v2 extra
// draw hook, in device pixels, after enemies and bombs and before the octopus. Reads the flat hazard arrays.

import { HZ_JET, HZ_SPIKES, HZ_ROCK, HZ_EEL, HZ_ANEMONE, SPIKE_HALF_LEN, SPIKE_REACH, EEL_HALF_BODY, EEL_RING_MAX } from './hazards.js';

const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {number} cw canvas width (px)
 * @param {number} ch canvas height (px)
 * @param {ReturnType<import('./hazards.js').createHazards>['data']} d
 * @param {number} time seconds
 */
export function drawHazards(ctx, camera, cw, ch, d, time) {
  const ppu = camera.pxPerUnit;
  const margin = 9; // world units: skip hazards farther off screen than a jet stream can reach
  const left = camera.x - cw / 2 / ppu - margin, right = camera.x + cw / 2 / ppu + margin;
  const top = camera.y - ch / 2 / ppu - margin, bottom = camera.y + ch / 2 / ppu + margin;
  for (let i = 0; i < d.n; i++) {
    if (d.x[i] < left || d.x[i] > right || d.y[i] < top || d.y[i] > bottom) continue;
    const sx = cw / 2 + (d.x[i] - camera.x) * ppu, sy = ch / 2 + (d.y[i] - camera.y) * ppu;
    switch (d.kind[i]) {
      case HZ_JET: drawJet(ctx, sx, sy, ppu, d.dx[i], d.dy[i], d.len[i], time, i); break;
      case HZ_SPIKES: drawSpikes(ctx, sx, sy, ppu, d.dx[i], d.dy[i]); break;
      case HZ_ROCK: if (d.state[i] !== 3) drawRock(ctx, sx, sy, ppu, d.state[i], time, i, d.v[i]); break;
      case HZ_EEL: drawEel(ctx, sx, sy, ppu, d.state[i], d.r[i], d.t[i], time); break;
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
function drawSpikes(ctx, sx, sy, ppu, dx, dy) {
  ctx.save();
  ctx.translate(sx - dx * 0.5 * ppu, sy - dy * 0.5 * ppu); // centre of the face
  ctx.rotate(Math.atan2(dy, dx)); // +x = out of the rock
  const half = SPIKE_HALF_LEN;
  ctx.fillStyle = '#4d6278';
  ctx.strokeStyle = '#223445';
  ctx.lineWidth = Math.max(1, ppu * 0.04);
  ctx.beginPath(); ctx.rect(-0.04 * ppu, -half * ppu, 0.2 * ppu, 2 * half * ppu); ctx.fill(); ctx.stroke();
  const count = 6, step = (2 * half) / count;
  for (let k = 0; k < count; k++) {
    const cy = (-half + step * (k + 0.5)) * ppu, hw = step * 0.44 * ppu;
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

// ---- falling rock: a boulder in the same slate and mint as the cave walls ----
function drawRock(ctx, sx, sy, ppu, state, time, seed, vy) {
  const shake = state === 1 ? Math.sin(time * 70) * 0.045 * ppu : 0;
  if (state === 2) { // motion streaks above a falling rock
    ctx.strokeStyle = 'rgba(200,225,255,0.35)';
    ctx.lineWidth = Math.max(1, ppu * 0.05);
    const l = Math.min(1.4, vy * 0.12) * ppu;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(sx + k * 0.25 * ppu, sy - 0.5 * ppu); ctx.lineTo(sx + k * 0.25 * ppu, sy - 0.5 * ppu - l); ctx.stroke(); }
  }
  ctx.save();
  ctx.translate(sx + shake, sy);
  const N = 9, R = 0.46 * ppu;
  ctx.beginPath();
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU + hash(seed * 5.7) * 0.6;
    const r = R * (0.86 + hash(seed * 11 + k) * 0.22);
    const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.94;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-0.15 * ppu, -0.2 * ppu, 0.05 * ppu, 0, 0, R * 1.1);
  g.addColorStop(0, '#6f8cc8');
  g.addColorStop(1, '#3a548e');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#46cda5';
  ctx.lineWidth = Math.max(1.5, ppu * 0.06);
  ctx.stroke();
  // cracks
  ctx.strokeStyle = 'rgba(18,30,64,0.65)';
  ctx.lineWidth = Math.max(1, ppu * 0.035);
  ctx.beginPath();
  ctx.moveTo(-0.22 * ppu, -0.12 * ppu); ctx.lineTo(-0.05 * ppu, 0.04 * ppu); ctx.lineTo(0.12 * ppu, 0.0 * ppu);
  ctx.moveTo(-0.05 * ppu, 0.04 * ppu); ctx.lineTo(0.0 * ppu, 0.26 * ppu);
  ctx.stroke();
  ctx.restore();
  if (state === 1) { // dust puffs while it rumbles
    ctx.fillStyle = 'rgba(190,210,235,0.35)';
    for (let k = 0; k < 3; k++) {
      const u = (time * 2 + k * 0.33) % 1;
      ctx.beginPath(); ctx.arc(sx + (k - 1) * 0.3 * ppu, sy - 0.45 * ppu + u * 0.3 * ppu, (0.05 + 0.05 * u) * ppu, 0, TAU); ctx.fill();
    }
  }
}

// ---- electric eel: a striped body, a glow while it charges and a jagged shock ring ----
function drawEel(ctx, sx, sy, ppu, state, ring, cycle, time) {
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
  // the ring: a jagged circle growing out of the eel
  if (ring > 0) {
    const fade = Math.max(0, 1 - ring / EEL_RING_MAX);
    const pts = 44;
    const ringPath = (wob) => {
      ctx.beginPath();
      for (let k = 0; k <= pts; k++) {
        const a = (k / pts) * TAU;
        const r = (ring + (k % 2 ? 1 : -1) * wob * (0.6 + 0.4 * Math.sin(k * 3.1 + time * 40))) * ppu;
        const px = sx + Math.cos(a) * r, py = sy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    ctx.strokeStyle = 'rgba(255,240,110,' + (0.35 * fade).toFixed(3) + ')';
    ctx.lineWidth = 0.3 * ppu; ringPath(0.08); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,220,' + (0.95 * fade + 0.05).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, 0.07 * ppu); ringPath(0.07); ctx.stroke();
  } else if (glow > 0) { // telegraph: a small ring drawing in
    ctx.strokeStyle = 'rgba(255,245,140,' + (0.5 * glow).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, 0.04 * ppu);
    ctx.beginPath(); ctx.arc(sx, sy, (1.0 - 0.5 * ((cycle - 1.3) / 0.6)) * ppu, 0, TAU); ctx.stroke();
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
