// Corpse drawing (corpses.js). Every kind registers an art function with setCorpseArt(kind, fn):
//   fn(ctx, sx, sy, ppu, rot, face, alpha, t)  draws that kind's dead body centred on screen point (sx, sy), ppu px per
//   tile, rotated `rot` radians, mirrored when face < 0, with eyes closed or X'd. No glow, no animation but the drift.
// The enemies reuse their own sprite (enemy-draw.js drawEnemyBody), turned limp: darker and greyer, belly up for the fish
// and the crab, a small dark X over each eye. Other owners register 'gclam', 'tentacle' and the 'npc-*' kinds.

import { drawEnemyBody } from './enemy-draw.js';
import { kindName, LIFE_AFTER_REST, FADE_TIME } from './corpses.js';
import { visibleAt, cullFlags, cullView } from './cull.js';

const artFns = new Map();
/** Register the art function of one corpse kind (a later call replaces an earlier one). */
export function setCorpseArt(kind, fn) { artFns.set(kind, fn); }
export function hasCorpseArt(kind) { return artFns.has(kind); }

const LIMP = 'brightness(0.68) saturate(0.5)';
const INK = '#181012';

/** Two crossing strokes: a closed, dead eye. (cx, cy) is in the current transform's px, `r` the half size. */
export function drawDeadEye(ctx, cx, cy, r, ppu, pale) {
  ctx.save();
  if (pale) { ctx.fillStyle = 'rgba(232,222,200,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, ppu * 0.03); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
  ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
  ctx.stroke();
  ctx.restore();
}

/**
 * Build the art function for a sprite kind. `flipFace(face)` says when the raw sprite must be mirrored, `belly` turns it
 * belly up (vertical mirror), `eyes` are [x, y] offsets from the sprite centre as fractions of its drawn width / height.
 */
function spriteArt(kind, o) {
  return (ctx, sx, sy, ppu, rot, face, alpha) => {
    const flipX = o.faceLeft ? face < 0 : face > 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    const sz = drawEnemyBody(ctx, kind, sx, sy, ppu, rot, flipX, !!o.belly, LIMP);
    if (sz && o.eyes) {
      ctx.translate(sx, sy); ctx.rotate(rot); ctx.scale(flipX ? -1 : 1, o.belly ? -1 : 1);
      for (const [ex, ey] of o.eyes) drawDeadEye(ctx, ex * sz.w, ey * sz.h, ppu * o.eyeR, ppu, o.pale);
    }
    ctx.restore();
  };
}

// the piranha art faces -x (so it is mirrored when it faces +x); the crab and manta are drawn mirrored when they face -x
setCorpseArt('piranha', spriteArt('piranha', { belly: true, eyes: [[-0.27, -0.11]], eyeR: 0.06 }));
setCorpseArt('crab', spriteArt('crab', { faceLeft: true, belly: true, eyes: [[-0.13, 0.2], [0.1, 0.2]], eyeR: 0.04, pale: true }));
setCorpseArt('crab-fast', spriteArt('crab-fast', { faceLeft: true, belly: true, eyes: [[-0.15, 0.28], [0.12, 0.28]], eyeR: 0.04, pale: true }));
setCorpseArt('manta', spriteArt('manta', { faceLeft: true, belly: true, eyes: [[-0.14, -0.06], [0.12, -0.06]], eyeR: 0.05, pale: true }));
setCorpseArt('cannon', spriteArt('cannon', { faceLeft: true, eyes: [[-0.03, 0.0]], eyeR: 0.08 }));
setCorpseArt('urchin', spriteArt('urchin', { faceLeft: true }));
setCorpseArt('horns', spriteArt('horns', { faceLeft: true }));

/** Draw every live corpse that is on screen (device pixels), `d` = corpses.data. Called before the hazards. */
export function drawCorpses(ctx, camera, cw, ch, d, t) {
  if (!d.live) return;
  const ppu = camera.pxPerUnit;
  cullView(camera, cw, ch);
  const fl = cullFlags('corpses', d.cap);
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i]) continue;
    if (!visibleAt(fl, i, d.x[i], d.y[i], 1.8)) continue;
    const name = kindName(d.kind[i]);
    const fn = artFns.get(name);
    if (!fn) continue;
    const alpha = Math.min(1, Math.max(0, (LIFE_AFTER_REST - d.restT[i]) / FADE_TIME));
    if (alpha <= 0) continue;
    fn(ctx, cw / 2 + (d.x[i] - camera.x) * ppu, ch / 2 + (d.y[i] - camera.y) * ppu, ppu, d.rot[i], d.face[i], alpha, t);
  }
}
