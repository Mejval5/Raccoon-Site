// Hazard drawing (hazards.js). Called from main.js's v2 extra draw hook, in device pixels, after enemies and bombs and before
// the octopus. Reads the flat hazard arrays. r46: the jet's rock chimney, the spine strip, the eel and the anemone are sprites
// (js/sprites.js, generated in Milan's style) animated by transforms; the code shapes stay as the fallback until the atlas loads.

import { HZ_JET, HZ_SPIKES, HZ_ROCK, HZ_EEL, HZ_ANEMONE, SPIKE_REACH, SPIKE_COUNT, EEL_HALF_BODY, EEL_RING_MAX, EEL_CHARGE_AT, EEL_FIRE_AT, JET_HALF_WIDTH, spikeSpan, tempEnvelope } from './hazards.js';
import { prefersReducedMotion, DEATH_DURATION } from './config.js';
import { visibleAt, cullFlags, cullView } from './cull.js';
import { drawSprite, drawSpriteSlice, spriteRect } from './sprites.js';

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
  cullView(camera, cw, ch);
  const fl = cullFlags('hazards', d.n);
  for (let i = 0; i < d.n; i++) {
    // r43: off-screen hazards are not animated or drawn (the reach is a jet stream's length, or the plate / rock / ring around the centre)
    if (!visibleAt(fl, i, d.x[i], d.y[i], d.kind[i] === HZ_JET ? d.len[i] + 1 : 2.5)) continue;
    const sx = cw / 2 + (d.x[i] - camera.x) * ppu, sy = ch / 2 + (d.y[i] - camera.y) * ppu;
    switch (d.kind[i]) {
      case HZ_JET: if (d.temp[i]) drawRiptide(ctx, sx, sy, ppu, d, i, time); else drawJet(ctx, sx, sy, ppu, d.dx[i], d.dy[i], d.len[i], time, i); break;
      case HZ_SPIKES: drawSpikes(ctx, sx, sy, ppu, d.dx[i], d.dy[i], isSolid, d.x[i], d.y[i]); break;
      case HZ_ROCK: if (d.state[i] !== 3 && d.state[i] < 5) drawRock(ctx, sx, sy, ppu, d.state[i], time, i, d.v[i], isSolid, d.x[i], d.y[i], d.a[i]); break;
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
  // r46: a rock chimney growing out of the wall face, its mouth along the stream
  if (drawSprite(ctx, 'vent', 0.3 * ppu, 0, 0, 0.78 * ppu, 1, 0.5)) { ctx.restore(); return; }
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

// ---- Riptide (spells, a temporary jet in any direction): the same stream of bubbles and streaks, no chimney, swelling in and
// fading out with its strength, as wide as its own half width (Heavy is wider). Streaks curl a little, like a rip current. ----
function drawRiptide(ctx, sx, sy, ppu, d, i, time) {
  const env = tempEnvelope(d, i), len = d.len[i], w = d.hw[i] / JET_HALF_WIDTH;
  if (env <= 0.01) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.atan2(d.dy[i], d.dx[i]));
  ctx.globalAlpha = env;
  const g = ctx.createLinearGradient(0, 0, len * ppu, 0);
  g.addColorStop(0, 'rgba(150,235,240,0)'); g.addColorStop(Math.min(0.3, 0.8 / len), 'rgba(150,235,240,0.28)'); g.addColorStop(0.7, 'rgba(150,235,240,0.14)'); g.addColorStop(1, 'rgba(150,235,240,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -0.55 * w * ppu); ctx.quadraticCurveTo(len * 0.5 * ppu, -1.0 * w * ppu, len * ppu, -1.05 * w * ppu);
  ctx.lineTo(len * ppu, 1.05 * w * ppu); ctx.quadraticCurveTo(len * 0.5 * ppu, 1.0 * w * ppu, 0, 0.55 * w * ppu);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(225,255,255,0.45)'; ctx.lineWidth = Math.max(1, ppu * 0.03); ctx.lineCap = 'round';
  const speed = 1.1 * d.pw[i] + 0.3;
  for (let k = 0; k < 6; k++) {
    const off = (k - 2.5) * 0.28 * w;
    const u = (time * speed + k * 0.19 + i * 0.13) % 1;
    const x0 = (0.1 + u * (len - 0.9)) * ppu, x1 = x0 + 0.8 * ppu, cy = off * ppu, bend = Math.sin(time * 3 + k) * 0.12 * ppu;
    ctx.beginPath(); ctx.moveTo(x0, cy); ctx.quadraticCurveTo((x0 + x1) / 2, cy + bend, x1, cy); ctx.stroke();
  }
  const n = Math.round(len * 3.4 * w);
  ctx.strokeStyle = 'rgba(235,255,255,0.85)'; ctx.fillStyle = 'rgba(200,245,255,0.2)'; ctx.lineWidth = Math.max(1, ppu * 0.03);
  for (let b = 0; b < n; b++) {
    const u = ((b / n) + time * 0.6 * speed + hash(b + i * 31) * 0.2) % 1;
    const px = (0.05 + u * (len - 0.2)) * ppu;
    const py = (hash(b * 3.1 + i) - 0.5) * 2 * (0.45 + 0.55 * u) * 0.95 * w * ppu + Math.sin(time * 5 + b) * 0.06 * ppu;
    const r = (0.04 + hash(b + 7) * 0.06) * ppu;
    ctx.globalAlpha = env * Math.min(1, (1 - u) * 1.8, u * 6);
    ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ---- spike wall: a steel strip on the rock face with a row of pale spikes ----
const spanOut = { lo: 0, hi: 0 };

let tileSolid = null; // spikeSpan takes tile coordinates; the callers' isSolid takes world points
const spanSolid = (tx, ty) => tileSolid(tx, ty);
function drawSpikes(ctx, sx, sy, ppu, dx, dy, isSolid, wx, wy) {
  // the strip ends where the hit test does (hazards.js spikeSpan): QA P4 had drawn tips outside the hitbox
  tileSolid = isSolid;
  const { lo, hi } = spikeSpan(dx, dy, wx, wy, isSolid ? spanSolid : null, spanOut);
  ctx.save();
  ctx.translate(sx - dx * 0.5 * ppu, sy - dy * 0.5 * ppu); // centre of the face
  ctx.rotate(Math.atan2(dy, dx)); // +x = out of the rock
  if (spriteRect('spines')) { // r46: bone-white urchin spines on a crusty coral base; the sprite's up is +x here
    ctx.rotate(Math.PI / 2);
    drawSprite(ctx, 'spines', (lo + hi) / 2 * ppu, 0.08 * ppu, (hi - lo) * ppu, (SPIKE_REACH + 0.1) * ppu);
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#4d6278';
  ctx.strokeStyle = '#223445';
  ctx.lineWidth = Math.max(1, ppu * 0.04);
  ctx.beginPath(); ctx.rect(-0.04 * ppu, lo * ppu, 0.2 * ppu, (hi - lo) * ppu); ctx.fill(); ctx.stroke();
  const count = SPIKE_COUNT, step = (hi - lo) / count;
  for (let k = 0; k < count; k++) spikeTip(ctx, (lo + step * (k + 0.5)) * ppu, step * 0.44 * ppu, ppu, SPIKE_REACH);
  ctx.restore();
}
/** One spike in the strip's frame (+x out of the rock): a pale cone from the plate to its tip at `reach` tiles. */
function spikeTip(ctx, cy, hw, ppu, reach) {
  const g = ctx.createLinearGradient(0.15 * ppu, 0, reach * ppu, 0);
  g.addColorStop(0, '#9fb4c6');
  g.addColorStop(1, '#f2f8fc');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0.14 * ppu, cy - hw);
  ctx.lineTo(reach * ppu, cy);
  ctx.lineTo(0.14 * ppu, cy + hw);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ---- V2-PLAN 16: the skewered octopus (drawn after the body) ----
const INK = '#150d1c', INK_EDGE = '#0b0610';
/**
 * Two or three spike tips stand THROUGH the pinned body and a dark ink leak dribbles down from each wound. Called after the
 * octopus is drawn when octo.deathStyle === 'impale'. Finds the strip the body is pinned on.
 */
export function drawImpaleOverlay(ctx, camera, cw, ch, octo, d, t, isSolid) {
  if (!octo || !octo.dead || octo.deathStyle !== 'impale' || !d) return;
  let best = -1, bd = 1e9;
  for (let i = 0; i < d.n; i++) {
    if (d.kind[i] !== HZ_SPIKES) continue;
    const dd = Math.hypot(d.x[i] - octo.pinX, d.y[i] - octo.pinY);
    if (dd < bd) { bd = dd; best = i; }
  }
  if (best < 0 || bd > 3) return;
  const ppu = camera.pxPerUnit, dx = d.dx[best], dy = d.dy[best];
  tileSolid = isSolid;
  const { lo, hi } = spikeSpan(dx, dy, d.x[best], d.y[best], isSolid ? spanSolid : null, spanOut);
  const fx = d.x[best] - dx * 0.5, fy = d.y[best] - dy * 0.5;
  const c = (octo.pinX - fx) * -dy + (octo.pinY - fy) * dx; // where along the strip the body hangs
  const step = (hi - lo) / SPIKE_COUNT;
  const j = Math.max(1, Math.min(SPIKE_COUNT - 1, Math.round((c - lo) / step))); // the body hangs on the gap between spikes j-1 and j
  ctx.save();
  ctx.translate(cw / 2 + (fx - camera.x) * ppu, ch / 2 + (fy - camera.y) * ppu);
  const rot = Math.atan2(dy, dx);
  ctx.rotate(rot);
  ctx.strokeStyle = '#223445';
  ctx.lineWidth = Math.max(1, ppu * 0.04);
  const age = Math.max(0, Math.min(1, (DEATH_DURATION - octo.deathTimer) / DEATH_DURATION)); // 0..1 over the death second, then it stays
  const calm = prefersReducedMotion();
  const wounds = [];
  const NT = 2; // the head is about a spike gap tall: the two spikes beside the pin go through it
  for (let n = 0; n < NT; n++) {
    const cy = lo + step * (j - 1 + n + 0.5);
    // the tip standing out of the far side of the body: a dark wound ring where the flesh closes round it, then the tip
    const bx = 0.6, tip = 1.0, hw = 0.09;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(bx * ppu, cy * ppu, 0.07 * ppu, 0.13 * ppu, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(bx * ppu, 0, tip * ppu, 0);
    g.addColorStop(0, '#aebfcf'); g.addColorStop(1, '#f2f8fc');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(bx * ppu, (cy - hw) * ppu); ctx.lineTo(tip * ppu, cy * ppu); ctx.lineTo(bx * ppu, (cy + hw) * ppu); ctx.closePath(); ctx.fill(); ctx.stroke();
    wounds.push(bx * ppu, (cy + 0.1) * ppu);
  }
  ctx.restore();
  // ink leak: runs down the screen from each wound (a dribble that grows over the first second, then keeps creeping)
  const cosr = Math.cos(rot), sinr = Math.sin(rot);
  for (let n = 0; n < NT; n++) {
    const lx = wounds[n * 2], ly = wounds[n * 2 + 1];
    const wx = cw / 2 + (fx - camera.x) * ppu + lx * cosr - ly * sinr;
    const wy = ch / 2 + (fy - camera.y) * ppu + lx * sinr + ly * cosr;
    const len = (0.1 + 0.2 * age + 0.03 * n + (calm ? 0 : 0.03 * Math.sin(t * 2 + n))) * ppu; // short: the three leaks stay three
    const w0 = 0.045 * ppu;
    ctx.fillStyle = INK; ctx.strokeStyle = INK_EDGE; ctx.lineWidth = Math.max(1, ppu * 0.02);
    ctx.beginPath();
    ctx.moveTo(wx - w0, wy);
    ctx.quadraticCurveTo(wx - w0 * 0.7 + Math.sin(n * 2.1) * 0.05 * ppu, wy + len * 0.6, wx - w0 * 0.3, wy + len);
    ctx.arc(wx, wy + len, w0 * 0.55, Math.PI, 0, true); // rounded drip end
    ctx.quadraticCurveTo(wx + w0 * 0.7 + Math.sin(n * 2.1) * 0.05 * ppu, wy + len * 0.6, wx + w0, wy);
    ctx.closePath(); ctx.fill();
    if (!calm) { // a falling drop under the end
      const u = (t * 0.9 + n * 0.37) % 1;
      ctx.beginPath(); ctx.arc(wx, wy + len + (0.15 + u * 0.5) * ppu, w0 * 0.5 * (1 - u * 0.5), 0, TAU); ctx.fill();
    }
  }
}

// ---- V2-PLAN 16: the boulder that flattened the octopus, drawn AFTER the body so it sits on top of the pancake ----
/**
 * Draws every boulder that came down on the octopus (state 5 falling with it, 6 resting on it). Smears of ink and pink-red goo
 * run from under it along the floor on both sides, so the pancake reads as crushed, not as a flat sticker.
 */
export function drawSplatRock(ctx, camera, cw, ch, d, t, octo = null) {
  const ppu = camera.pxPerUnit;
  for (let i = 0; i < d.n; i++) {
    if (d.kind[i] !== HZ_ROCK || d.state[i] < 5) continue;
    const sx = cw / 2 + (d.x[i] - camera.x) * ppu, sy = ch / 2 + (d.y[i] - camera.y) * ppu;
    if (sx < -2 * ppu || sx > cw + 2 * ppu || sy < -2 * ppu || sy > ch + 2 * ppu) continue;
    const flat = octo && octo.flat > 0 ? octo.flat : 0;
    const resting = d.state[i] === 6;
    if (resting && flat > 0.3) { // goo seeping out from under it, along the floor, both ways
      const floorY = cw ? ch / 2 + (d.b[i] - camera.y) * ppu : sy + 0.5 * ppu;
      const reach = (0.7 + 0.5 * flat) * ppu;
      for (const side of [-1, 1]) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(sx + side * reach * 0.7, floorY - 0.03 * ppu, reach * 0.42, 0.05 * ppu, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b1c3d'; // vibefix: bruised ink-violet, not gore red
        ctx.beginPath(); ctx.ellipse(sx + side * reach * 0.62, floorY - 0.05 * ppu, reach * 0.26, 0.032 * ppu, 0, 0, TAU); ctx.fill();
      }
    }
    // the boulder sits a hair into the pancake, dust settling on it for a moment after the hit
    // resting on the pancake: it sits a little high (the pancake is under it) and a touch off level
    drawBoulder(ctx, sx, sy + 0.01 * ppu - (resting ? 0.1 * flat * ppu : 0), 0.5 * ppu, i, resting ? 0.07 * flat : 0);
  }
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
    // r36: beside a wall it wedges INTO the corner (its side overlaps the wall rim a little) instead of hovering off it
    if (l !== r) { R = 0.47 * ppu; lean = (l ? -0.05 : 0.05) * ppu; }
  }
  sx += lean;
  // r36: hanging, it is pressed up into the ceiling rim (top overlaps it by about a tenth of a tile)
  if (state < 2) sy -= 0.1 * ppu;
  if (state < 2) {
    // hanging: a dark crevice IN the rim where it meets the ceiling (centred on the rim line, so it reads as a shadowed
    // crack in the rock, not a disc floating in the water), and a few grains of grit trickling down
    const top = sy - 0.5 * ppu;
    ctx.fillStyle = 'rgba(8,14,24,0.6)';
    ctx.beginPath(); ctx.ellipse(sx, top + 0.05 * ppu, 0.38 * ppu, 0.1 * ppu, 0, 0, TAU); ctx.fill();
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
  const seg = 9, half = EEL_HALF_BODY * ppu;
  if (spriteRect('eel')) {
    // r46: the eel sprite cut into horizontal slices, each shifted by the same travelling wave the code body used
    const top = sy - half - 0.25 * ppu, hgt = 2 * half + 0.35 * ppu, wid = hgt * 50 / 240 * 1.4, n = 16; // a little plumper than the sprite: it read too thin on dark water
    for (let k = 0; k < n; k++) {
      const u = k / n, wave = Math.sin(time * 5 + u * 5) * 0.13 * ppu;
      drawSpriteSlice(ctx, 'eel', u, u + 1 / n, sx + wave - wid / 2, top + u * hgt, wid, hgt / n + 0.6);
    }
  } else {
  // body: a wavy vertical line, drawn as two strokes (dark outline, teal body) plus yellow dashes
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
  }
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
  if (spriteRect('anemone')) { // r46: the sprite, swaying by a skew about its base
    ctx.save();
    ctx.translate(sx, floor + 0.04 * ppu);
    ctx.transform(1, 0, -Math.sin(time * 1.7 + seed) * 0.16, 1, 0, 0);
    drawSprite(ctx, 'anemone', 0, 0, 1.35 * ppu);
    ctx.restore();
    return;
  }
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
