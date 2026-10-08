// Back rooms (backroom.js), the drawing: the kelp curtain over a dark niche (the way in, and the way back out from inside),
// and the overlay while the octopus is in the back room (the frozen, dimmed front round the room's box; the short fade of a
// hop). House style: Milan's kelp (assets/plant1/plant2), dark ink, muted stone, a few rising bubbles; no glow, no sparkle.
// Device pixels; world -> screen is sx = canvasW / 2 + (x - camera.x) * camera.pxPerUnit.

import { cullView, cullFlags, visibleAt } from './cull.js';

const TAU = Math.PI * 2;
const INK = '#10202c';
const NICHE_W = 0.95, NICHE_H = 2.25; // half width and height of the opening, in tiles, from the floor line
const STONES = [[-1.02, -0.18, 0.3, 0.24, 0], [-0.98, -0.62, 0.22, 0.19, 1], [-0.86, -1.08, 0.2, 0.17, 2], [-0.6, -1.5, 0.21, 0.17, 0],
  [-0.2, -1.78, 0.22, 0.16, 1], [0.24, -1.8, 0.21, 0.16, 2], [0.63, -1.52, 0.22, 0.17, 1], [0.88, -1.07, 0.2, 0.18, 0],
  [1.0, -0.6, 0.23, 0.19, 2], [1.04, -0.16, 0.3, 0.24, 1]];
const STONE_FILL = ['#7d8a8c', '#6c797d', '#5e6a70'];
// kelp strands across the opening: [x offset, height, image 0 / 1, sway phase, lean]
const STRANDS = [[-0.62, 2.0, 0, 0.0, -0.05], [-0.28, 2.35, 1, 1.3, 0.03], [0.05, 2.1, 0, 2.6, -0.02], [0.36, 2.4, 1, 3.7, 0.05], [0.66, 1.85, 0, 4.9, 0.02]];

let kelp = null; // [plant1, plant2] images, loaded on first use
function kelpImages() {
  if (kelp) return kelp;
  kelp = ['plant1', 'plant2'].map((n) => {
    const img = new Image();
    img.src = new URL('../assets/' + n + '.webp', import.meta.url).href;
    if (img.decode) img.decode().catch(() => {});
    return img;
  });
  return kelp;
}
/** Start loading the curtain's kelp (a level with a back room calls it at its start, so the first frame never decodes). */
export function preloadBackroomArt() { kelpImages(); }

/**
 * The curtain on floor tile (tx, ty): its floor line is ty + 1. `inside`: seen from the back room (the opening shows the pale
 * water of the level instead of the dark), `open` 0..1: the strands part (the octopus is at it, or a hop just went through).
 */
export function drawCurtain(ctx, camera, cw, ch, tx, ty, t, inside = false, open = 0, slot = 0) {
  cullView(camera, cw, ch);
  if (!visibleAt(cullFlags('backdoor', 2), slot, tx + 0.5, ty, 3)) return;
  const u = camera.pxPerUnit;
  const cx = cw / 2 + (tx + 0.5 - camera.x) * u, fy = ch / 2 + (ty + 1 - camera.y) * u;
  ctx.save();
  ctx.translate(cx, fy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the opening: an arch into the rock, dark at its heart (from inside: the level's water, paler)
  const g = ctx.createRadialGradient(0, -u * 0.9, u * 0.1, 0, -u * 0.9, u * 1.5);
  if (inside) { g.addColorStop(0, 'rgba(120,170,180,0.85)'); g.addColorStop(1, 'rgba(36,70,84,0.92)'); }
  else { g.addColorStop(0, 'rgba(3,8,14,0.96)'); g.addColorStop(1, 'rgba(14,30,40,0.9)'); }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-NICHE_W * u, 0);
  ctx.bezierCurveTo(-NICHE_W * u, -NICHE_H * 0.75 * u, -NICHE_W * 0.55 * u, -NICHE_H * u, 0, -NICHE_H * u);
  ctx.bezierCurveTo(NICHE_W * 0.55 * u, -NICHE_H * u, NICHE_W * u, -NICHE_H * 0.75 * u, NICHE_W * u, 0);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, u * 0.05); ctx.stroke();
  // a ring of rough stones round the arch
  for (const [x, y, rx, ry, s] of STONES) {
    ctx.fillStyle = STONE_FILL[s];
    ctx.beginPath(); ctx.ellipse(x * u, y * u, rx * u, ry * u, x * 0.4, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1, u * 0.035); ctx.stroke();
  }
  // the kelp, growing from the floor across the opening, swaying; parting when `open`
  const imgs = kelpImages();
  const reduced = false;
  for (let i = 0; i < STRANDS.length; i++) {
    const [x, h, k, ph, lean] = STRANDS[i];
    const img = imgs[k];
    if (!img.complete || !img.naturalWidth) continue;
    const part = open * (x < 0 ? -1 : 1) * (0.35 + Math.abs(x) * 0.5);
    const sway = reduced ? 0 : Math.sin(t * 1.3 + ph) * 0.07 + Math.sin(t * 0.55 + ph * 1.7) * 0.04;
    const hh = h * u, ww = hh * img.naturalWidth / img.naturalHeight;
    ctx.save();
    ctx.translate((x + part * 0.4) * u, u * 0.08);
    ctx.rotate(lean + sway + part * 0.35);
    ctx.drawImage(img, -ww / 2, -hh, ww, hh);
    ctx.restore();
  }
  // a few bubbles leaking out of it (the tell that there is air and space behind)
  ctx.strokeStyle = inside ? 'rgba(220,245,240,0.55)' : 'rgba(200,236,232,0.7)'; ctx.lineWidth = Math.max(1, u * 0.03);
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.32 + i / 3) % 1;
    const bx = (Math.sin(i * 2.1 + t * 0.9) * 0.18 + (i - 1) * 0.3) * u, by = -(0.4 + p * 2.6) * u;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath(); ctx.arc(bx, by, u * (0.05 + 0.03 * i), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/**
 * Inside the back room: the front layer as it was when she went through (a small copy of the screen: blurred by its scale),
 * dimmed, everywhere but the room's box, with a soft dark edge round the box. `snap` is that copy; `box` is the room in tiles.
 */
export function drawBackOverlay(ctx, camera, cw, ch, box, snap) {
  const u = camera.pxPerUnit;
  const x0 = cw / 2 + (box.x0 + 0.35 - camera.x) * u, y0 = ch / 2 + (box.y0 + 0.35 - camera.y) * u;
  const x1 = cw / 2 + (box.x1 - 0.35 - camera.x) * u, y1 = ch / 2 + ((box.cutY || box.y1 - 1.35) - camera.y) * u; // the floor's lower rock is cut off: the room sits on the frozen level
  const r = u * 1.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  ctx.clip('evenodd');
  if (snap) ctx.drawImage(snap, 0, 0, cw, ch);
  else { ctx.fillStyle = '#0b1820'; ctx.fillRect(0, 0, cw, ch); }
  ctx.fillStyle = 'rgba(4,10,16,0.52)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
  // the soft edge: a few dark strokes along the box, wide and faint to narrow and darker
  ctx.save();
  ctx.strokeStyle = 'rgba(4,10,16,0.22)';
  for (const w of [1.1, 0.7, 0.38, 0.16]) {
    ctx.lineWidth = w * u;
    ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, r); ctx.stroke();
  }
  ctx.restore();
}

/** A hop's fade: the screen as it was before the hop, fading out over the new view (k 1 -> 0). */
export function drawHopFade(ctx, cw, ch, snap, k) {
  if (!snap || k <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k);
  ctx.drawImage(snap, 0, 0, cw, ch);
  ctx.restore();
}
