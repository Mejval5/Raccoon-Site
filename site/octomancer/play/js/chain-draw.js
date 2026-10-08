// Chain reactions, drawn (chain.js). While a link waits, a glowing mote of plankton runs from what went off to what it is about
// to set off, along a shallow arc, with a faint wake behind it; when the target goes off, a ring opens round it. So the player
// reads every link of a chain: bomb -> bomb -> boulder -> clam. Natural look: bioluminescent motes, no sparkles or stars.
// Data-oriented: reads chain.queue / chain.flashes (flat arrays), no allocation per frame.

import { CHAIN_FLASH_T } from './chain.js';
import { TRIGGER_TARGET_NAMES } from './creature-rules.js';

const TAU = Math.PI * 2;
// per target kind: the mote's colour (r, g, b). Blasts and boulders warm, living things and currents cool.
const COL = { bomb: [255, 196, 140], rock: [235, 210, 170], clam: [170, 255, 230], tentacle: [200, 170, 255], eel: [255, 245, 150], pot: [200, 240, 255], tile: [235, 215, 180], jet: [170, 225, 255], trap: [255, 160, 140] };
const RGB = TRIGGER_TARGET_NAMES.map((n) => COL[n] || [200, 240, 255]);
const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')';

/** Draw the pending links and the recent rings of `chain` in world space (camera: {x, y, pxPerUnit}; cw, ch: canvas px). */
export function drawChain(ctx, camera, cw, ch, chain) {
  const q = chain.queue, fl = chain.flashes, now = chain.now();
  if (q.n === 0 && fl.n === 0) return;
  const ppu = camera.pxPerUnit, ox = cw / 2 - camera.x * ppu, oy = ch / 2 - camera.y * ppu;
  const margin = 2 * ppu;
  ctx.save();
  ctx.lineCap = 'round';
  for (let k = 0; k < q.n; k++) {
    const span = Math.max(1e-3, q.due[k] - q.t0[k]);
    const u = Math.max(0, Math.min(1, (now - q.t0[k]) / span));
    const sx = ox + q.sx[k] * ppu, sy = oy + q.sy[k] * ppu, tx = ox + q.tx[k] * ppu, ty = oy + q.ty[k] * ppu;
    if ((sx < -margin && tx < -margin) || (sx > cw + margin && tx > cw + margin) || (sy < -margin && ty < -margin) || (sy > ch + margin && ty > ch + margin)) continue;
    const c = RGB[q.tgt[k]];
    // a shallow arc (a mote drifting, not a laser): the control point lifts off the straight line by a fifth of its length
    const mx = (sx + tx) / 2, my = (sy + ty) / 2, dx = tx - sx, dy = ty - sy;
    const cx = mx - dy * 0.2, cy = my + dx * 0.2 - Math.hypot(dx, dy) * 0.08;
    // the wake: the arc from the source up to the mote, fading in
    ctx.strokeStyle = rgba(c, 0.3 + 0.35 * u); ctx.lineWidth = Math.max(1.5, ppu * 0.05);
    ctx.beginPath(); ctx.moveTo(sx, sy);
    const n = 8;
    for (let s = 1; s <= n; s++) {
      const v = (s / n) * u, iv = 1 - v;
      ctx.lineTo(iv * iv * sx + 2 * iv * v * cx + v * v * tx, iv * iv * sy + 2 * iv * v * cy + v * v * ty);
    }
    ctx.stroke();
    // the mote itself, with a soft halo
    const iu = 1 - u, px = iu * iu * sx + 2 * iu * u * cx + u * u * tx, py = iu * iu * sy + 2 * iu * u * cy + u * u * ty;
    const r = Math.max(2.5, ppu * 0.12);
    ctx.fillStyle = rgba(c, 0.22); ctx.beginPath(); ctx.arc(px, py, r * 2.8, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(c, 0.45); ctx.beginPath(); ctx.arc(px, py, r * 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,245,0.95)'; ctx.beginPath(); ctx.arc(px, py, r * 0.8, 0, TAU); ctx.fill();
    // the target glows and its ring closes in as the mote nears it: "this one is next"
    ctx.fillStyle = rgba(c, 0.1 + 0.2 * u); ctx.beginPath(); ctx.arc(tx, ty, ppu * (0.6 - 0.2 * u), 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(c, 0.35 + 0.55 * u); ctx.lineWidth = Math.max(1.5, ppu * 0.06);
    ctx.beginPath(); ctx.arc(tx, ty, ppu * (0.6 - 0.2 * u), 0, TAU); ctx.stroke();
  }
  for (let k = 0; k < fl.n; k++) {
    const age = now - fl.t[k];
    if (age < 0 || age > CHAIN_FLASH_T) continue;
    const v = age / CHAIN_FLASH_T, c = RGB[fl.tgt[k]];
    const x = ox + fl.x[k] * ppu, y = oy + fl.y[k] * ppu;
    if (x < -margin || x > cw + margin || y < -margin || y > ch + margin) continue;
    ctx.strokeStyle = rgba(c, 0.95 * (1 - v)); ctx.lineWidth = Math.max(2, ppu * 0.1 * (1 - v));
    ctx.beginPath(); ctx.arc(x, y, ppu * (0.3 + 0.9 * v), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
