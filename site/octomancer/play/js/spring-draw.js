// The rest grotto's spring (V2 plan, juice economy): a natural upwelling of clear water in a floor basin, ringed by smooth pale
// stones with a few kelp fronds. Code drawing in the house style (dark ink outlines, flat muted fills, no gold, no sparkle). Swim
// into it to heal and refill the jar; `used` (already drunk from this visit) only calms it down, it never disappears.
// Device pixels; world->screen is sx = canvasW/2 + (x - camera.x) * camera.pxPerUnit.

import { cullView, cullFlags, visibleAt } from './cull.js';

const TAU = Math.PI * 2;
const INK = '#10202c';
const SPRING_R = 1.1; // tiles: how close the octopus has to be to count as in the spring

// fixed stone ring around the basin: [dx, dy, rx, ry, shade] in tiles from the centre
const STONES = [
  [-3.1, -0.3, 0.55, 0.38, 0], [-2.55, 0.15, 0.4, 0.3, 2], [3.1, -0.3, 0.55, 0.38, 1], [2.55, 0.15, 0.4, 0.3, 0],
  [-1.5, 1.2, 0.42, 0.28, 1], [-0.55, 1.35, 0.34, 0.22, 2], [0.7, 1.32, 0.38, 0.25, 0], [1.6, 1.2, 0.4, 0.28, 2],
];
const STONE_FILL = ['#b8c4c4', '#a2b2b4', '#8fa2a6'];
const KELP = [[-2.05, 1.5, 0.95, 0.0], [2.0, 1.5, 0.75, 1.7], [-1.1, 1.5, 0.55, 3.1]]; // x, base y, height, phase

/** True when the octopus at (octoX, octoY) is inside the spring's area (about 1.1 tiles of its centre). */
export function springReach(octoX, octoY, x, y) {
  const dx = octoX - x, dy = octoY - y;
  return dx * dx + dy * dy <= SPRING_R * SPRING_R;
}

export function drawSpring(ctx, camera, canvasW, canvasH, x, y, time, used) {
  cullView(camera, canvasW, canvasH);
  if (!visibleAt(cullFlags('spring', 1), 0, x, y, 3)) return;
  const ppu = camera.pxPerUnit;
  const cx = canvasW / 2 + (x - camera.x) * ppu, cy = canvasH / 2 + (y - camera.y) * ppu;
  const lw = Math.max(1.2, ppu * 0.05);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // clear pool: a soft blue-green glow that breathes slowly
  const breathe = 0.5 + 0.5 * Math.sin(time * (used ? 0.9 : 1.6));
  const g = ctx.createRadialGradient(cx, cy + ppu * 0.25, ppu * 0.1, cx, cy + ppu * 0.25, ppu * 1.7);
  const a0 = (used ? 0.26 : 0.38) + breathe * 0.08;
  g.addColorStop(0, 'rgba(150,226,214,' + a0 + ')');
  g.addColorStop(1, 'rgba(110,200,196,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(cx, cy + ppu * 0.25, ppu * 1.8, ppu * 1.5, 0, 0, TAU); ctx.fill();

  // the water standing in the basin: a flat pale wash over the pool's footprint
  ctx.fillStyle = used ? 'rgba(150,215,210,0.22)' : 'rgba(150,226,214,0.32)';
  ctx.beginPath(); ctx.roundRect(cx - ppu * 2.5, cy - ppu * 0.5, ppu * 5, ppu * 2, ppu * 0.15); ctx.fill();

  // slow shimmer: pale curved lines drifting up through the pool
  ctx.strokeStyle = 'rgba(214,242,236,0.5)'; ctx.lineWidth = lw * 0.8;
  for (let i = 0; i < 3; i++) {
    const ph = (time * (used ? 0.12 : 0.22) + i / 3) % 1;
    const wy = cy + ppu * (0.9 - ph * 1.9), ww = ppu * (0.7 - Math.abs(ph - 0.5) * 0.5);
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - ww, wy);
    ctx.quadraticCurveTo(cx - ww * 0.4, wy - ppu * 0.12, cx, wy);
    ctx.quadraticCurveTo(cx + ww * 0.4, wy + ppu * 0.12, cx + ww, wy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // kelp fronds swaying at the basin edges
  ctx.strokeStyle = INK;
  for (const [kx, ky, kh, kp] of KELP) {
    const bx = cx + kx * ppu, by = cy + ky * ppu;
    const sway = Math.sin(time * 1.1 + kp) * ppu * 0.12;
    ctx.lineWidth = lw * 2.6;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sway, by - kh * ppu * 0.5, bx + sway * 1.6, by - kh * ppu); ctx.stroke();
    ctx.strokeStyle = '#4c8a5e'; ctx.lineWidth = lw * 1.3;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sway, by - kh * ppu * 0.5, bx + sway * 1.6, by - kh * ppu); ctx.stroke();
    ctx.strokeStyle = INK;
  }

  // smooth pale stones around the basin
  ctx.lineWidth = lw;
  for (const [dx, dy, rx, ry, sh] of STONES) {
    const sx = cx + dx * ppu, sy = cy + dy * ppu;
    ctx.fillStyle = STONE_FILL[sh]; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.ellipse(sx, sy, rx * ppu, ry * ppu, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; // a flat lighter patch on top, not a gloss
    ctx.beginPath(); ctx.ellipse(sx - rx * ppu * 0.2, sy - ry * ppu * 0.3, rx * ppu * 0.5, ry * ppu * 0.3, 0, 0, TAU); ctx.fill();
  }

  // bubbles: thin rings rising from the bottom of the upwelling (fewer once drunk from)
  const n = used ? 3 : 7;
  ctx.strokeStyle = 'rgba(226,248,244,0.85)'; ctx.lineWidth = Math.max(1, lw * 0.7);
  for (let i = 0; i < n; i++) {
    const speed = 0.16 + (i % 3) * 0.04;
    const ph = (time * speed + i * 0.6180339) % 1;
    const bx = cx + Math.sin(i * 2.4 + ph * 5) * ppu * 0.38;
    const by = cy + ppu * 1.0 - ph * ppu * 2.3;
    const r = ppu * (0.05 + (i % 3) * 0.025) * (0.8 + ph * 0.5);
    ctx.globalAlpha = Math.min(1, ph * 6) * (1 - ph * ph);
    ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
