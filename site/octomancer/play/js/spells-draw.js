// Drawing for fish juice droplets and ink clouds (spells.js). Both are code-drawn in the house style (dark ink outline, flat
// fills, a soft glow) from two small sprites baked once per page, so a frame costs one drawImage per droplet and a handful per
// cloud. Off-screen culling (cull.js) applies to both.
import { sharedCanvas } from './canvas-pool.js';
import { cullView, cullFlags, visibleAt } from './cull.js';

const TAU = Math.PI * 2;
const INK = '#10202c';
const DROP_PX = 64;   // droplet sprite size (the droplet is about 0.36 tiles across, the glow more)
const PUFF_PX = 128;  // one ink billow
let dropSprite = null, puffSprite = null, murkSprite = null;
const DISSOLVE = 1.4; // s: the last part of a droplet's life it clouds out and fades into the water

/** A juice droplet: a murky green bead with a dark outline, a purple glow around it and a pale glint. */
function bakeDrop() {
  const c = sharedCanvas(document.createElement('canvas'));
  c.width = c.height = DROP_PX;
  const g = c.getContext('2d'), m = DROP_PX / 2;
  const glow = g.createRadialGradient(m, m, 4, m, m, m);
  glow.addColorStop(0, 'rgba(150,96,205,0.55)'); glow.addColorStop(0.45, 'rgba(120,80,180,0.22)'); glow.addColorStop(1, 'rgba(110,70,170,0)');
  g.fillStyle = glow; g.fillRect(0, 0, DROP_PX, DROP_PX);
  // the bead: a slightly pointed drop, outlined
  const r = DROP_PX * 0.2;
  g.beginPath();
  g.moveTo(m, m - r * 1.45);
  g.bezierCurveTo(m + r * 0.55, m - r * 0.75, m + r, m - r * 0.2, m + r, m + r * 0.25);
  g.arc(m, m + r * 0.25, r, 0, Math.PI);
  g.bezierCurveTo(m - r, m - r * 0.2, m - r * 0.55, m - r * 0.75, m, m - r * 1.45);
  g.closePath();
  const body = g.createLinearGradient(m - r, m - r, m + r, m + r * 1.2);
  body.addColorStop(0, '#9cbf63'); body.addColorStop(0.55, '#6f9447'); body.addColorStop(1, '#5a4f86');
  g.fillStyle = body; g.fill();
  g.lineWidth = DROP_PX * 0.05; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = 'rgba(226,240,208,0.6)';
  g.beginPath(); g.ellipse(m - r * 0.38, m - r * 0.05, r * 0.2, r * 0.32, -0.4, 0, TAU); g.fill();
  return c;
}

/** The murk a leaking droplet trails: a soft, murky green-violet cloud. */
function bakeMurk() {
  const c = sharedCanvas(document.createElement('canvas'));
  c.width = c.height = DROP_PX;
  const g = c.getContext('2d'), m = DROP_PX / 2;
  const gr = g.createRadialGradient(m, m, 2, m, m, m);
  gr.addColorStop(0, 'rgba(104,132,80,0.7)'); gr.addColorStop(0.45, 'rgba(92,82,124,0.38)'); gr.addColorStop(1, 'rgba(90,80,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, DROP_PX, DROP_PX);
  return c;
}

/** One ink billow: a dark violet-black disc, dense in the middle, with a soft lumpy edge. */
function bakePuff() {
  const c = sharedCanvas(document.createElement('canvas'));
  c.width = c.height = PUFF_PX;
  const g = c.getContext('2d'), m = PUFF_PX / 2;
  const lumps = [[0, 0, 0.62], [0.2, -0.16, 0.42], [-0.22, -0.12, 0.4], [0.16, 0.2, 0.4], [-0.18, 0.2, 0.38]];
  for (const [dx, dy, rr] of lumps) {
    const x = m + dx * m, y = m + dy * m, r = rr * m;
    const gr = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    gr.addColorStop(0, 'rgba(14,10,26,0.9)'); gr.addColorStop(0.6, 'rgba(20,14,38,0.7)'); gr.addColorStop(1, 'rgba(26,18,48,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return c;
}

/**
 * Fish juice leaking out of a beaten creature (spells.js createJuiceDrops().data): each droplet trails a little murk, and over its
 * last DISSOLVE seconds (JUICE.life `life`) it clouds out and fades into the water.
 */
export function drawJuiceDrops(ctx, camera, cw, ch, d, time, life = 3.5) {
  if (!d.live) return;
  if (!dropSprite) { dropSprite = bakeDrop(); murkSprite = bakeMurk(); }
  cullView(camera, cw, ch);
  const flags = cullFlags('juice', d.n), ppu = camera.pxPerUnit;
  ctx.save();
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || !visibleAt(flags, i, d.x[i], d.y[i], 0.8)) continue;
    const age = d.age[i], fade = Math.max(0, Math.min(1, (life - age) / DISSOLVE)); // 1 until it starts to dissolve, then down to 0
    const bob = Math.sin(time * 3.1 + d.ph[i]) * 0.04;
    const sx = cw / 2 + (d.x[i] - camera.x) * ppu, sy = ch / 2 + (d.y[i] + bob - camera.y) * ppu;
    // the murk: grows as the droplet ages, a wisp left a little behind it (it oozes upward)
    const ms = ppu * (1.0 + 0.8 * Math.min(1, age / life) + 0.9 * (1 - fade));
    ctx.globalAlpha = Math.min(1, age * 3) * (0.4 + 0.6 * fade);
    ctx.drawImage(murkSprite, sx - ms / 2, sy - ms / 2 + ppu * 0.12, ms, ms);
    const size = ppu * (0.52 + 0.05 * Math.sin(time * 4.3 + d.ph[i] * 2)) * Math.min(1, 0.4 + age * 4) * (0.6 + 0.4 * fade);
    ctx.globalAlpha = 0.9 * fade;
    ctx.drawImage(dropSprite, sx - size / 2, sy - size / 2, size, size);
  }
  ctx.restore();
}

const BILLOWS = 7; // around the centre, plus the centre one
/** How opaque a cloud is at `age` of `dur`: a quick swell, thick for a while, then it thins out over the rest of its life. */
export function cloudAlpha(age, dur) {
  const t = age / dur;
  return Math.min(1, age / 0.12) * Math.max(0, 1 - Math.pow(t, 2.2));
}

/**
 * Ink clouds (spells.js createInkClouds().data). `pass` 0 is the thick cloud (drawn over the enemies, under the octopus); pass 1 is
 * a thin veil drawn over the octopus so it reads as inside the ink without the player losing sight of it.
 */
export function drawInkClouds(ctx, camera, cw, ch, c, time, pass = 0) {
  if (!c.live) return;
  if (!puffSprite) puffSprite = bakePuff();
  cullView(camera, cw, ch);
  const flags = cullFlags(pass ? 'inkVeil' : 'ink', c.n), ppu = camera.pxPerUnit;
  ctx.save();
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i] || !visibleAt(flags, i, c.x[i], c.y[i], c.r[i] * 1.6)) continue;
    const a = cloudAlpha(c.age[i], c.dur[i]) * (pass ? 0.38 : 0.95);
    if (a <= 0.01) continue;
    const grow = Math.min(1, 0.55 + 0.45 * c.age[i] / 0.25) * (1 + 0.12 * c.age[i] / c.dur[i]);
    const R = c.r[i] * grow, seed = c.seed[i];
    const cx = cw / 2 + (c.x[i] - camera.x) * ppu, cy = ch / 2 + (c.y[i] - camera.y) * ppu;
    ctx.globalAlpha = a;
    for (let k = 0; k <= BILLOWS; k++) {
      let bx = cx, by = cy, br = R * 1.05;
      if (k > 0) {
        const ang = seed + (k / BILLOWS) * TAU + Math.sin(time * 0.7 + k * 1.7 + seed) * 0.25;
        const off = R * (0.5 + 0.08 * Math.sin(time * 1.1 + k * 2.3));
        bx += Math.cos(ang) * off * ppu; by += Math.sin(ang) * off * ppu * 0.85;
        br = R * (0.62 + 0.1 * Math.sin(k * 3.1 + seed));
      }
      const s = br * 2 * ppu;
      ctx.drawImage(puffSprite, bx - s / 2, by - s / 2, s, s);
    }
  }
  ctx.restore();
}
