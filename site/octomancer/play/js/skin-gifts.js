// The skin gift moment (2026-10-08, skins.js): the first time a person is rescued or befriended, they hand the octopus a trinket.
// The trinket (the skin's accessory sprite; Pip's is a pinch of green scales) leaves the person, arcs over and lands on the
// octopus in GIFT_S seconds; then main.js shows the toast 'New look: ...'. Several gifts in one go queue up one after the other.
// Also the hub's mirror shell (the looks picker): drawn from the skins atlas at the hub.json position.

import { skinById } from './skins.js';
import { drawSkinSprite, ensureSkinAtlas } from './skin-draw.js';
import { worldToScreen } from './camera.js';

export const GIFT_S = 1.1;     // seconds from the person's hands to the octopus
export const GIFT_GAP_S = 0.5; // between two gifts given at once
export const MIRROR_H = 1.75;  // tiles: the mirror shell's height
export const MIRROR_REACH = 1.3; // tiles from the octopus's centre to the shell's middle for F (hand.js registerInteract 'mirror')

export function createSkinGifts() {
  const queue = []; // {id, x, y, t (s since it started; < 0 = waiting), done}
  const st = {
    list: queue,
    /** A person at (x, y) gives skin `id`. */
    give(id, x, y) {
      ensureSkinAtlas();
      const last = queue[queue.length - 1];
      queue.push({ id, x, y, t: last ? Math.min(0, last.t - GIFT_GAP_S - GIFT_S) : 0, done: false });
    },
    /** Advance; returns the ids that landed this step. */
    step(dt) {
      const landed = [];
      for (const g of queue) {
        g.t += dt;
        if (!g.done && g.t >= GIFT_S) { g.done = true; landed.push(g.id); }
      }
      while (queue.length && queue[0].done && queue[0].t > GIFT_S + 0.35) queue.shift();
      return landed;
    },
    busy() { return queue.length > 0; },
    clear() { queue.length = 0; },
  };
  return st;
}

/** Where a gift is now: from (x0, y0) over an arc to the octopus. */
function giftPos(g, octo) {
  const k = Math.max(0, Math.min(1, g.t / GIFT_S));
  const e = k * k * (3 - 2 * k);
  const x = g.x + (octo.x - g.x) * e;
  const y = g.y + (octo.y - 0.35 - g.y) * e - Math.sin(Math.PI * k) * 0.55; // a low arc: it stays under the person's speech bubble
  return { x, y, k };
}

/** The trinkets in flight (and a short soft ring where one landed). World draw, after the people. */
export function drawSkinGifts(ctx, camera, cw, ch, gifts, octo, t) {
  for (const g of gifts.list) {
    if (g.t < 0) continue;
    const ppu = camera.pxPerUnit;
    if (g.done) { // landed: a ring of pale water spreading from the octopus, fading
      const k = Math.min(1, (g.t - GIFT_S) / 0.35);
      const s = worldToScreen(camera, cw, ch, octo.x, octo.y);
      ctx.save(); ctx.globalAlpha = 0.5 * (1 - k); ctx.strokeStyle = '#cfe9e0'; ctx.lineWidth = Math.max(1, ppu * 0.05);
      ctx.beginPath(); ctx.arc(s.x, s.y, ppu * (0.45 + 0.5 * k), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      continue;
    }
    const p = giftPos(g, octo);
    const s = worldToScreen(camera, cw, ch, p.x, p.y);
    const sk = skinById(g.id);
    const w = ppu * (0.85 + 0.25 * Math.sin(Math.PI * p.k));
    const wob = Math.sin(t * 9 + g.x) * 0.25 * (1 - p.k);
    if (sk.acc) drawSkinSprite(ctx, sk.acc.sprite, s.x, s.y, w, wob);
    else drawScales(ctx, s.x, s.y, w * 0.5, sk.body || '#9aa64a', sk.pattern ? sk.pattern.color : '#4f6a2a');
  }
}

/** Pip's trinket: a pinch of fish scales (three small overlapping half-moons). */
function drawScales(ctx, x, y, r, fill, ink) {
  ctx.save();
  ctx.lineWidth = Math.max(1, r * 0.14); ctx.strokeStyle = ink; ctx.fillStyle = fill;
  for (const [dx, dy] of [[-0.45, 0.15], [0.45, 0.15], [0, -0.3]]) {
    ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * 0.52, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** The hub's mirror shell, its base on the floor at (mx, my). */
export function drawMirrorShell(ctx, camera, cw, ch, mx, my, near) {
  ensureSkinAtlas();
  const ppu = camera.pxPerUnit;
  const h = MIRROR_H * ppu, w = h * (233 / 256);
  const s = worldToScreen(camera, cw, ch, mx, my);
  if (s.x < -w || s.x > cw + w || s.y < -h * 1.2 || s.y > ch + h) return;
  drawSkinSprite(ctx, 'mirrorShell', s.x, s.y - h / 2 + ppu * 0.04, w, 0);
  if (near) { // the octopus is in reach: a soft pale rim on the water face (no glow, no sparkle)
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = '#d6efe8'; ctx.lineWidth = Math.max(1, ppu * 0.035);
    ctx.beginPath(); ctx.ellipse(s.x, s.y - h * 0.52, w * 0.27, h * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}
/** The middle of the shell's water face (the interact target point). */
export function mirrorPoint(m) { return { x: m.x, y: m.y - MIRROR_H * 0.5 }; }
