// Drawing the hostile shopkeepers (shopkeeper.js) and the wares knocked off their pedestals (shop.js). The calm keeper
// behind his counter is still drawn by drawShopArt (v2-props-draw.js); this draws every keeper that is not calm.
//
// The keeper is the stall's hermit-crab sprite (art 'keeper'), drawn bigger (he is buff), turned toward the octopus,
// with heavy brows. A thrown claw leaves the sprite (its drawn claw is clipped away) on a long jointed arm with an open
// pincer, and closes as it is reeled back. The wind-up (CLAW_TELL) is a shiver and a pale glow at that claw; a hit that
// glances off (ink, a dash) is a shudder. Natural colours only: no gold, no sparkles.

import { artImg } from './v2-art.js';
import { itemGlyph } from './v2-props-draw.js';
import { visibleAt, cullFlags, cullView } from './cull.js';
import { KM_CALM, KM_DEAD, CLAW_TELL, shoulderX, shoulderY } from './shopkeeper.js';
import { W_LOOSE, W_HELD } from './shop.js';
import { drawTrace, traceDraw } from './draw-trace.js';

const TAU = Math.PI * 2;
export const KEEPER_DRAW_W = 1.95; // tiles (the calm keeper behind the counter is 1.5)
// the sprite's own claws, in source fractions (463 x 283 art): left claw x < 0.255, right claw x > 0.782, both below y 0.42
const CLAW_L_X = 0.255, CLAW_R_X = 0.782, CLAW_TOP = 0.42;
const EYE_L = [0.501, 0.655], EYE_R = [0.683, 0.655]; // eye centres (fractions)
const SHELL = '#e8622a', SHELL_HI = '#f59a5a', OUT = '#4a1806';

function view(camera, cw, ch) {
  const ppu = camera.pxPerUnit;
  return { ppu, sx: (wx) => cw / 2 + (wx - camera.x) * ppu, sy: (wy) => ch / 2 + (wy - camera.y) * ppu };
}

/**
 * Every keeper that is not calm (and not dead), and his claws.
 * @param {ReturnType<import('./shopkeeper.js').createKeepers>} k
 * @param {{calmShop:boolean}} [opts] calmShop: the stall's calm keeper is drawn by drawShopArt (skip mode KM_CALM)
 */
export function drawKeepers(ctx, camera, cw, ch, k, time) {
  if (!k || !k.n) return;
  const { ppu, sx, sy } = view(camera, cw, ch);
  cullView(camera, cw, ch);
  const fl = cullFlags('keepers', k.cap);
  const img = artImg('keeper');
  for (let i = 0; i < k.n; i++) {
    const m = k.mode[i];
    if (m === KM_DEAD || m === KM_CALM) continue;
    if (!visibleAt(fl, i, k.x[i], k.y[i], 9)) continue; // the claws reach 6.5 tiles
    // claws first (the arm runs behind the body)
    for (let s = 0; s < 2; s++) {
      const c = i * 2 + s;
      if (k.cst[c] === 0) continue;
      drawClawArm(ctx, sx(shoulderX(k, i, s)), sy(shoulderY(k, i)), sx(k.cx[c]), sy(k.cy[c]), ppu, k.cst[c] === 1);
    }
    const face = k.face[i] || -1;
    let px = sx(k.x[i]), py = sy(k.y[i]) + Math.sin(time * 2.1 + i) * ppu * 0.05;
    const tell = k.tell[i] > 0 ? 1 - k.tell[i] / CLAW_TELL : 0;
    if (k.tell[i] > 0) { px += Math.sin(time * 75) * ppu * 0.05; px -= (k.tellSide[i] ? 1 : -1) * tell * ppu * 0.12; }
    if (k.shrug[i] > 0) px += Math.sin(time * 90) * ppu * 0.035 * (k.shrug[i] / 0.35);
    const tilt = k.stun[i] > 0 ? Math.sin(time * 9) * 0.35 : 0;
    if (k.tell[i] > 0) tellGlow(ctx, sx(shoulderX(k, i, k.tellSide[i])), sy(shoulderY(k, i)), ppu, tell, time);
    const W = ppu * KEEPER_DRAW_W;
    if (img) {
      const H = W * (img.naturalHeight / img.naturalWidth);
      ctx.save();
      ctx.translate(px, py); ctx.rotate(tilt); ctx.scale(face, 1);
      const x0 = -W / 2, y0 = -H * 0.58;
      // a claw that is out (or reeled in) is not on the body: clip the sprite's own claw on that side away
      // (local x is mirrored when he faces left: the world's left claw is then the sprite's right one)
      const outL = k.cst[i * 2] !== 0, outR = k.cst[i * 2 + 1] !== 0;
      const hideSrcL = face > 0 ? outL : outR, hideSrcR = face > 0 ? outR : outL;
      if (hideSrcL || hideSrcR) {
        ctx.beginPath();
        ctx.rect(x0 - 2, y0 - 2, W + 4, H + 4);
        if (hideSrcL) ctx.rect(x0 - 2, y0 + H * CLAW_TOP, W * CLAW_L_X + 2, H * (1 - CLAW_TOP) + 4);
        if (hideSrcR) ctx.rect(x0 + W * CLAW_R_X, y0 + H * CLAW_TOP, W * (1 - CLAW_R_X) + 2, H * (1 - CLAW_TOP) + 4);
        ctx.save(); ctx.clip('evenodd');
        ctx.drawImage(img, x0, y0, W, H);
        ctx.restore();
      } else ctx.drawImage(img, x0, y0, W, H);
      if (k.flash[i] > 0) { // a bomb got him: a pale blink over the body
        ctx.globalAlpha = Math.min(0.55, k.flash[i] * 2);
        ctx.fillStyle = '#fff4e4';
        ctx.beginPath(); ctx.ellipse(x0 + W * 0.55, y0 + H * 0.6, W * 0.3, H * 0.33, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      brows(ctx, x0, y0, W, H);
      ctx.restore();
    } else {
      ctx.fillStyle = SHELL; ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(2, ppu * 0.06);
      ctx.beginPath(); ctx.arc(px, py, W * 0.4, 0, TAU); ctx.fill(); ctx.stroke();
    }
    if (k.roused[i] > 0) bang(ctx, px, py - W * 0.55, ppu, k.roused[i]);
  }
}

/** Angry brows over the sprite's eyes (local, unflipped sprite coordinates). */
function brows(ctx, x0, y0, W, H) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a0e04'; ctx.lineWidth = Math.max(2, W * 0.034);
  const r = W * 0.06;
  for (const [ex, ey, inner] of [[EYE_L[0], EYE_L[1], 1], [EYE_R[0], EYE_R[1], -1]]) {
    const cx = x0 + W * ex, cy = y0 + H * ey;
    ctx.beginPath();
    ctx.moveTo(cx - inner * r * 1.15, cy - r * 1.55);
    ctx.lineTo(cx + inner * r * 0.95, cy - r * 0.85);
    ctx.stroke();
  }
}

/** A long jointed arm from the shoulder (sx, sy) to the claw (tx, ty), screen px, with the pincer at the end. */
function drawClawArm(ctx, sx, sy, tx, ty, ppu, open) {
  const a = Math.atan2(ty - sy, tx - sx), len = Math.hypot(tx - sx, ty - sy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = ppu * 0.24;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = SHELL; ctx.lineWidth = ppu * 0.15;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
  // joints along the arm
  const n = Math.max(1, Math.floor(len / (ppu * 0.75)));
  ctx.fillStyle = SHELL_HI; ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, ppu * 0.04);
  for (let j = 1; j < n; j++) {
    const u = j / n;
    ctx.beginPath(); ctx.arc(sx + (tx - sx) * u, sy + (ty - sy) * u, ppu * 0.11, 0, TAU); ctx.fill(); ctx.stroke();
  }
  drawPincer(ctx, tx, ty, a, ppu, open ? 0.55 : 0.08);
}

/** The pincer at (x, y) pointing along angle `a`; `gape` radians between the jaws. */
function drawPincer(ctx, x, y, a, ppu, gape) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  const s = ppu * 0.62;
  ctx.lineWidth = Math.max(2, ppu * 0.05); ctx.strokeStyle = OUT;
  // palm
  ctx.fillStyle = SHELL;
  ctx.beginPath(); ctx.ellipse(-s * 0.15, 0, s * 0.55, s * 0.42, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // two jaws: the big upper one and the smaller lower one
  for (const [dir, big] of [[-1, 1], [1, 0.8]]) {
    ctx.save();
    ctx.rotate(dir * gape * 0.5);
    ctx.fillStyle = big === 1 ? SHELL : '#d4521f';
    ctx.beginPath();
    ctx.moveTo(s * 0.2, dir * s * 0.32);
    ctx.quadraticCurveTo(s * 0.95 * big, dir * s * 0.42, s * 1.15 * big, dir * s * 0.04);
    ctx.quadraticCurveTo(s * 0.7 * big, dir * s * 0.1, s * 0.3, dir * s * 0.02);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = SHELL_HI;
  ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.15, s * 0.18, s * 0.1, -0.3, 0, TAU); ctx.fill();
  ctx.restore();
}

/** The wind-up: a pale glow swelling at the claw that is about to fly. */
function tellGlow(ctx, x, y, ppu, u, time) {
  const r = ppu * (0.7 + 0.7 * u);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const a = (0.45 + 0.45 * u) * (0.8 + 0.2 * Math.sin(time * 40));
  g.addColorStop(0, `rgba(255,226,196,${a.toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,226,196,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/** The keeper has seen the octopus: a "!" over his shell (like the piranha's notice). */
function bang(ctx, x, y, ppu, t) {
  const s = ppu * 0.42 * Math.min(1, t * 3);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3a1608'; ctx.lineWidth = Math.max(2, s * 0.22);
  ctx.fillStyle = '#ffe85a';
  ctx.beginPath(); ctx.moveTo(-s * 0.2, -s); ctx.lineTo(s * 0.2, -s); ctx.lineTo(s * 0.12, -s * 0.28); ctx.lineTo(-s * 0.12, -s * 0.28); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.14, 0, TAU); ctx.stroke(); ctx.fill();
  ctx.restore();
}

/** Wares knocked off their pedestals (loose props.js bodies): the item's icon where the body is, tumbling with it. */
export function drawLooseWares(ctx, camera, cw, ch, st, props, time, skip = -1) {
  if (!st || !props || !st.ware) return;
  for (let i = 0; i < st.ware.length; i++) if (i !== skip) drawWare(ctx, camera, cw, ch, st, props, i, time); // skip: the ware in the octopus's hand
}
/** Loose or held ware slot i alone (the one in the octopus's hand is drawn after the octopus; drawLooseWares skipped it). */
export function drawWare(ctx, camera, cw, ch, st, props, i, time) {
  const d = props.data;
  if (i < 0 || i >= st.ware.length || (st.ware[i] !== W_LOOSE && st.ware[i] !== W_HELD) || st.pid[i] < 0 || !d.alive[st.pid[i]]) return;
  const { ppu, sx, sy } = view(camera, cw, ch);
  const p = st.pid[i], x = sx(d.x[p]), y = sy(d.y[p]);
  if (x < -ppu * 2 || x > cw + ppu * 2 || y < -ppu * 2 || y > ch + ppu * 2) return;
  if (drawTrace.on) traceDraw('ware', i);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(d.x[p] * 1.4); // rolls as it goes
  itemGlyph(ctx, st.items[st.stock[i]].glyph, 0, 0, ppu * 0.3, time + i);
  ctx.restore();
}
