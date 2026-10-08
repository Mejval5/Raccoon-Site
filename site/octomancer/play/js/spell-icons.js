// Code-drawn icons for the hotbar and the inventory (house style: dark ink outline #10202c, flat fills, no shine).
// Each draws inside a circle of radius r around (x, y), except the jar, which fills the box (x, y, w, h).

import { drawSprite, spriteRect, spriteMeta, drawBombSprite } from './sprites.js';

const TAU = Math.PI * 2;
const INK = '#10202c';

/** A puffy blob made of overlapping circles: an ink pass slightly larger first, so the union gets one outline. */
function puffs(ctx, list, fill, ink, lw) {
  ctx.fillStyle = ink;
  for (const [cx, cy, cr] of list) { ctx.beginPath(); ctx.arc(cx, cy, cr + lw, 0, TAU); ctx.fill(); }
  ctx.fillStyle = fill;
  for (const [cx, cy, cr] of list) { ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill(); }
}

// painted icons (round 3 atlas: Ink Cloud; round 4: the first spell set and its runes, SPELLS-PICK.md)
const ICON_SPRITE = { 'ink-cloud': 'iconInkCloud', riptide: 'iconRiptide', 'coral-wall': 'iconCoralWall', anchor: 'iconAnchor', lure: 'iconLure',
  heavy: 'runeHeavy', delayed: 'runeDelayed', lingering: 'runeLingering' };

/** A small carved rune stone (Heavy, Delayed, Lingering) set under a spell icon; greyed when it does nothing on that spell. */
export function drawRuneBadge(ctx, id, x, y, r, greyed = false) {
  ctx.save();
  if (greyed) ctx.globalAlpha = 0.35;
  const name = ICON_SPRITE[id];
  if (!(name && spriteRect(name) && drawSprite(ctx, name, x, y, 0, 2 * r, 0.5, 0.5))) {
    ctx.fillStyle = '#34444a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9dffd8'; ctx.font = `bold ${Math.round(r * 1.2)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(id[0].toUpperCase(), x, y + r * 0.05);
  }
  ctx.restore();
}

export function drawSpellIcon(ctx, id, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const lw = Math.max(1.2, r * 0.11);
  const painted = ICON_SPRITE[id];
  if (painted && spriteRect(painted)) drawSprite(ctx, painted, 0, 0, 0, 2 * r, 0.5, 0.5);
  else if (!painted && spriteRect('stone')) drawSprite(ctx, 'stone', 0, 0, 0, 2 * r, 0.5, 0.5);
  else if (id === 'ink-cloud') {
    const blobs = [[-0.5, 0.2, 0.36], [0.1, 0.32, 0.4], [0.5, 0.12, 0.32], [-0.25, -0.2, 0.4], [0.28, -0.22, 0.36], [0, -0.5, 0.26]];
    puffs(ctx, blobs.map(([a, b, c]) => [a * r, b * r, c * r]), '#2b2038', INK, lw);
    // lighter violet curls inside, drawn as thin arcs
    ctx.strokeStyle = '#6c5a8a'; ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath(); ctx.arc(-0.2 * r, -0.2 * r, 0.24 * r, Math.PI * 0.9, Math.PI * 1.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.18 * r, 0.3 * r, 0.22 * r, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.4 * r, -0.2 * r, 0.14 * r, Math.PI, Math.PI * 1.8); ctx.stroke();
    // a few ink drops trailing off
    ctx.fillStyle = INK;
    for (const [dx, dy, dr] of [[0.8, 0.62, 0.1], [-0.78, 0.6, 0.08], [0.15, 0.88, 0.07]]) { ctx.beginPath(); ctx.arc(dx * r, dy * r, dr * r, 0, TAU); ctx.fill(); }
  } else {
    // unknown spell: a plain carved rune stone with a scratch mark
    ctx.fillStyle = '#7d8a8b'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-0.55 * r, 0.8 * r); ctx.lineTo(-0.7 * r, -0.2 * r); ctx.lineTo(-0.25 * r, -0.8 * r); ctx.lineTo(0.4 * r, -0.75 * r); ctx.lineTo(0.7 * r, -0.1 * r); ctx.lineTo(0.5 * r, 0.8 * r);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.beginPath(); ctx.moveTo(-0.05 * r, -0.45 * r); ctx.lineTo(-0.05 * r, 0.5 * r); ctx.moveTo(-0.3 * r, -0.05 * r); ctx.lineTo(0.2 * r, 0.2 * r); ctx.stroke();
  }
  ctx.restore();
}

/** The painted jar: the liquid is drawn first, clipped to the box inside the glass (iconJar meta), then the see-through glass over it. */
function drawPaintedJar(ctx, x, y, w, h, frac, ticks, jr, jm) {
  const dw = h * jr[2] / jr[3], x0 = x + (w - dw) / 2;
  const bx = x0 + jm.u0 * dw, by = y + jm.v0 * h, bw = (jm.u1 - jm.u0) * dw, bh = (jm.v1 - jm.v0) * h;
  const f = Math.max(0, Math.min(1, frac));
  ctx.save();
  if (f > 0) {
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, Math.max(1, bw * 0.12)); ctx.clip();
    const top = by + bh - bh * f;
    ctx.fillStyle = '#4a6a3e'; ctx.fillRect(bx, top, bw, by + bh - top);
    ctx.fillStyle = 'rgba(96,52,120,0.55)'; ctx.fillRect(bx, top, bw, by + bh - top);
    ctx.fillStyle = 'rgba(30,22,40,0.35)'; ctx.fillRect(bx + bw * 0.55, top, bw * 0.45, by + bh - top);
    ctx.fillStyle = '#7f9a5a'; ctx.fillRect(bx, top, bw, Math.max(1, h * 0.035));
  }
  ctx.restore();
  drawSprite(ctx, 'iconJar', x0, y, dw, h, 0, 0);
  if (ticks > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(16,32,44,0.8)'; ctx.lineWidth = Math.max(1, dw * 0.05); ctx.lineCap = 'round';
    for (let k = 1; k <= ticks; k++) {
      const ty = by + bh - bh * (k / ticks);
      ctx.beginPath(); ctx.moveTo(bx + 1, ty); ctx.lineTo(bx + 1 + bw * 0.22, ty); ctx.stroke();
    }
    ctx.restore();
  }
}

/** A small corked glass jar. `frac` 0..1 of liquid, `ticks` notches (one per cast) on the glass. */
export function drawJarIcon(ctx, x, y, w, h, frac, ticks) {
  const jr = spriteRect('iconJar'), jm = spriteMeta('iconJar');
  if (jr && jm) { drawPaintedJar(ctx, x, y, w, h, frac, ticks, jr, jm); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const lw = Math.max(1, w * 0.08);
  const neckW = w * 0.56, neckH = h * 0.14, corkH = h * 0.14;
  const bodyTop = corkH + neckH, bx = w * 0.05, bw = w * 0.9;
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo((w - neckW) / 2, corkH);
    ctx.lineTo((w - neckW) / 2, bodyTop);
    ctx.lineTo(bx + w * 0.1, bodyTop + h * 0.04);
    ctx.quadraticCurveTo(bx, bodyTop + h * 0.06, bx, bodyTop + h * 0.2);
    ctx.lineTo(bx, h - h * 0.14);
    ctx.quadraticCurveTo(bx, h - lw * 0.5, bx + h * 0.14, h - lw * 0.5);
    ctx.lineTo(bx + bw - h * 0.14, h - lw * 0.5);
    ctx.quadraticCurveTo(bx + bw, h - lw * 0.5, bx + bw, h - h * 0.14);
    ctx.lineTo(bx + bw, bodyTop + h * 0.2);
    ctx.quadraticCurveTo(bx + bw, bodyTop + h * 0.06, bx + bw - w * 0.1, bodyTop + h * 0.04);
    ctx.lineTo((w + neckW) / 2, bodyTop);
    ctx.lineTo((w + neckW) / 2, corkH);
    ctx.closePath();
  };
  // empty glass: a pale, mostly clear green-grey
  bodyPath(); ctx.fillStyle = 'rgba(170,205,200,0.22)'; ctx.fill();
  const floor = h - lw, ceil = bodyTop + h * 0.1;
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0) {
    // murky green with a purple tint, clipped to the glass
    ctx.save(); bodyPath(); ctx.clip();
    const top = floor - (floor - ceil) * f;
    ctx.fillStyle = '#4a6a3e'; ctx.fillRect(0, top, w, h - top);
    ctx.fillStyle = 'rgba(96,52,120,0.55)'; ctx.fillRect(0, top, w, h - top);
    ctx.fillStyle = 'rgba(30,22,40,0.35)'; ctx.fillRect(bx + bw * 0.55, top, bw * 0.45, h - top);
    ctx.fillStyle = '#7f9a5a'; ctx.fillRect(bx, top, bw, Math.max(1, h * 0.035));
    ctx.restore();
  }
  // cast notches on the left of the glass: notch k is where k whole casts fill to
  if (ticks > 0) {
    ctx.strokeStyle = 'rgba(16,32,44,0.8)'; ctx.lineWidth = Math.max(1, lw * 0.8);
    for (let k = 1; k <= ticks; k++) {
      const ty = floor - (floor - ceil) * (k / ticks);
      ctx.beginPath(); ctx.moveTo(bx, ty); ctx.lineTo(bx + w * 0.24, ty); ctx.stroke();
    }
  }
  bodyPath(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
  // the cork: a plain brown block
  ctx.fillStyle = '#8a6a48';
  ctx.beginPath(); ctx.roundRect((w - neckW) / 2 - w * 0.05, lw * 0.5, neckW + w * 0.1, corkH, w * 0.07); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** The bomb for the active-use slot: round and dark with a short fuse; the tip is a dull ember, not a bright spark. */
export function drawBombSlotIcon(ctx, x, y, r) {
  if (drawBombSprite(ctx, 'bomb', x, y + 0.15 * r, 0.68 * r)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = '#2c3946'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, r * 0.13);
  ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.68, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(190,210,225,0.2)'; ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.08, r * 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a5663'; ctx.beginPath(); ctx.rect(-r * 0.2, -r * 0.68, r * 0.4, r * 0.2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#a89468'; ctx.lineWidth = Math.max(1.2, r * 0.11);
  ctx.beginPath(); ctx.moveTo(r * 0.05, -r * 0.68); ctx.quadraticCurveTo(r * 0.3, -r * 0.93, r * 0.55, -r * 0.8); ctx.stroke();
  ctx.fillStyle = '#b4572c'; ctx.beginPath(); ctx.arc(r * 0.57, -r * 0.8, r * 0.11, 0, TAU); ctx.fill();
  ctx.restore();
}
