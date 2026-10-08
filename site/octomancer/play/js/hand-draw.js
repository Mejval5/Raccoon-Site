// Drawing for the hand (controls 2026-10-08, hand.js). Natural, no glossy UI:
//   drawHandTell   a single tentacle curls out of the arms toward what F would take (a pot, a corpse, a stunned fish) and
//                  its tip coils; a faint bioluminescent ring breathes round the target. People, wares and doors (priority
//                  above things) get the same curl with a paler ring.
//   drawHeldArm    the arm that holds a carried thing: from under the body to the thing (drawn before the octopus).
//   drawHeldGrip   its end, wrapped once round the thing and curled across its front (drawn after the thing, which is drawn
//                  after the octopus: what the hand holds is always on top, main.js drawHeld).
//   drawKeeperNotice  the shopkeeper's '!' when a ware is knocked off its pedestal: a bone-white mark that pops and fades.
// All coordinates are world units; the camera turns them into canvas px.

const SKIN = '#c05060', SKIN_DARK = '#904050', SUCKER = '#f0d8d2', OUTLINE = 'rgba(24,16,18,0.55)';

function toScreen(camera, cw, ch, x, y, out) {
  out.x = cw / 2 + (x - camera.x) * camera.pxPerUnit;
  out.y = ch / 2 + (y - camera.y) * camera.pxPerUnit;
  return out;
}
const A = { x: 0, y: 0 }, B = { x: 0, y: 0 };

/** A tapering tentacle along a quadratic curve from (ax, ay) to (bx, by) bending by `bend` (px, sideways), widths in px. */
function tentacle(ctx, ax, ay, bx, by, bend, w0, w1, suckers) {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const cx = (ax + bx) / 2 + nx * bend, cy = (ay + by) / 2 + ny * bend;
  const N = 10;
  // outline pass, then the skin, as round-capped segments of falling width
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? SKIN : OUTLINE;
    ctx.lineCap = 'round';
    let px = ax, py = ay;
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx, y = u * u * ay + 2 * u * t * cy + t * t * by;
      ctx.lineWidth = (w0 + (w1 - w0) * t) + (pass ? 0 : 1.6);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      px = x; py = y;
    }
  }
  if (suckers) {
    ctx.fillStyle = SUCKER;
    for (let k = 2; k < N; k += 2) {
      const t = k / N, u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx, y = u * u * ay + 2 * u * t * cy + t * t * by;
      const r = Math.max(0.8, (w0 + (w1 - w0) * t) * 0.18);
      ctx.beginPath(); ctx.arc(x - nx * r, y - ny * r, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** The "I could grab that" tell. (ox, oy) the octopus (drawn position), (tx, ty) the target. */
export function drawHandTell(ctx, camera, cw, ch, ox, oy, tx, ty, t, use = false) {
  const ppu = camera.pxPerUnit;
  const wx = tx - ox, wy = ty - oy, wl = Math.hypot(wx, wy) || 1, ux = wx / wl, uy = wy / wl;
  // the arm leaves the arms' side of the body that faces the target and reaches most of the way, breathing in and out
  toScreen(camera, cw, ch, ox + ux * 0.22, oy + 0.22 + uy * 0.1, A);
  const reach = Math.max(0.2, wl - 0.42 - 0.1 * (0.5 + 0.5 * Math.sin(t * 3.1)));
  toScreen(camera, cw, ch, ox + ux * (0.22 + reach * 0.8), oy + 0.22 + uy * (0.1 + reach * 0.8), B);
  ctx.save();
  ctx.globalAlpha = 0.9;
  tentacle(ctx, A.x, A.y, B.x, B.y, ppu * 0.16 * Math.sin(t * 2.3), ppu * 0.13, ppu * 0.05, true);
  // the tip curls (a little spiral toward the thing)
  ctx.strokeStyle = SKIN; ctx.lineWidth = ppu * 0.05; ctx.lineCap = 'round';
  const a0 = Math.atan2(uy, ux) - Math.PI / 2;
  ctx.beginPath(); ctx.arc(B.x + ux * ppu * 0.06, B.y + uy * ppu * 0.06, ppu * 0.065, a0, a0 + Math.PI * 1.5); ctx.stroke();
  // a soft bioluminescent halo round the target (a glow in the water, never a hard UI ring)
  toScreen(camera, cw, ch, tx, ty, B);
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  const r = ppu * (0.52 + 0.04 * pulse);
  const g = ctx.createRadialGradient(B.x, B.y, r * 0.55, B.x, B.y, r * 1.15);
  const col = use ? '207,232,220' : '143,224,200';
  g.addColorStop(0, 'rgba(' + col + ',0)');
  g.addColorStop(0.6, 'rgba(' + col + ',' + (0.10 + 0.10 * pulse).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(' + col + ',0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(B.x, B.y, r * 1.15, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** The arm to a carried thing at (hx, hy) of radius r: drawn BEFORE the octopus (its root goes under the body); the thing
 * itself and the grip round it (drawHeldGrip) are drawn after the octopus. (ox, oy) = the octopus as drawn (interpolated). */
export function drawHeldArm(ctx, camera, cw, ch, ox, oy, hx, hy, r, t) {
  const ppu = camera.pxPerUnit;
  toScreen(camera, cw, ch, ox, oy + 0.15, A);
  toScreen(camera, cw, ch, hx, hy, B);
  const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1;
  ctx.save();
  tentacle(ctx, A.x, A.y, B.x - dx / l * r * ppu * 0.6, B.y - dy / l * r * ppu * 0.6, ppu * 0.12 * Math.sin(t * 2), ppu * 0.15, ppu * 0.09, true);
  ctx.restore();
}

/** The grip, drawn over the carried thing (after it, after the octopus): the arm's end wraps once round its near side and
 * the tip curls across its front, so the thing reads as held, not floating in front of the body. */
export function drawHeldGrip(ctx, camera, cw, ch, ox, oy, hx, hy, r, t) {
  const ppu = camera.pxPerUnit;
  toScreen(camera, cw, ch, ox, oy + 0.15, A);
  toScreen(camera, cw, ch, hx, hy, B);
  const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const R = r * ppu * 0.85; // a little inside the thing's rim: the arm overlaps it
  const q = ppu * Math.min(1, Math.max(0.45, r / 0.35)); // a thinner arm round a small thing (a little fish), so it still shows
  ctx.save();
  // the arm's last stretch comes onto the thing from the body's side ...
  const ex = B.x - ux * r * ppu * 1.05, ey = B.y - uy * r * ppu * 1.05;
  const a0 = Math.atan2(-uy, -ux) - 1.2, a1 = a0 + 2.4;
  const sx = B.x + Math.cos(a0) * R, sy = B.y + Math.sin(a0) * R;
  tentacle(ctx, ex, ey, sx, sy, 0, q * 0.095, q * 0.085, false);
  // ... wraps round the near side ...
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = q * 0.085 + 1.6;
  ctx.beginPath(); ctx.arc(B.x, B.y, R, a0, a1); ctx.stroke();
  ctx.strokeStyle = SKIN; ctx.lineWidth = q * 0.08;
  ctx.beginPath(); ctx.arc(B.x, B.y, R, a0, a1); ctx.stroke();
  ctx.fillStyle = SUCKER;
  for (let k = 1; k < 4; k++) { const a = a0 + (a1 - a0) * k / 4; ctx.beginPath(); ctx.arc(B.x + Math.cos(a) * (R - q * 0.025), B.y + Math.sin(a) * (R - q * 0.025), Math.max(0.8, q * 0.014), 0, Math.PI * 2); ctx.fill(); }
  // ... and the tip curls a little way across the thing's front, breathing
  const ta = a1, tx0 = B.x + Math.cos(ta) * R, ty0 = B.y + Math.sin(ta) * R;
  const reach = R * (0.75 + 0.08 * Math.sin(t * 2.6));
  const tx1 = B.x + Math.cos(ta) * (R - reach) + Math.cos(ta + Math.PI / 2) * R * 0.25, ty1 = B.y + Math.sin(ta) * (R - reach) + Math.sin(ta + Math.PI / 2) * R * 0.25;
  if (r >= 0.25) tentacle(ctx, tx0, ty0, tx1, ty1, R * 0.25, q * 0.075, q * 0.035, false); // (a small thing: the wrap alone)
  ctx.restore();
}

/** A key hint over a whirlpool (Daniel 2026-10-08: entered on F): a small bone-white tablet with the key on it, breathing. */
export function drawKeyHint(ctx, camera, cw, ch, x, y, label, t) {
  const ppu = camera.pxPerUnit;
  toScreen(camera, cw, ch, x, y, A);
  const s = ppu * 0.42, a = 0.75 + 0.25 * Math.sin(t * 3);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(A.x, A.y + Math.sin(t * 2.2) * ppu * 0.04);
  ctx.fillStyle = '#efe6d6'; ctx.strokeStyle = '#2a1c18'; ctx.lineWidth = Math.max(1, ppu * 0.035);
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.42); ctx.quadraticCurveTo(0, -s * 0.56, s * 0.5, -s * 0.44);
  ctx.lineTo(s * 0.46, s * 0.44); ctx.quadraticCurveTo(0, s * 0.54, -s * 0.48, s * 0.42); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1c18'; ctx.font = '700 ' + Math.round(s * 0.62) + 'px Quicksand, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, s * 0.03);
  ctx.restore();
}

/** The shopkeeper's '!' at (x, y) (above his head), k = 1 .. 0 as it fades. */
export function drawKeeperNotice(ctx, camera, cw, ch, x, y, k, t) {
  const ppu = camera.pxPerUnit;
  toScreen(camera, cw, ch, x, y, A);
  const pop = k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1; // it pops in, then holds
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 2.2);
  ctx.translate(A.x, A.y + Math.sin(t * 18) * ppu * 0.02);
  ctx.scale(pop, pop);
  ctx.fillStyle = '#efe6d6'; ctx.strokeStyle = '#2a1c18'; ctx.lineWidth = ppu * 0.04;
  // a bone-white sliver and a dot, hand-cut
  ctx.beginPath();
  ctx.moveTo(-ppu * 0.08, -ppu * 0.42); ctx.lineTo(ppu * 0.09, -ppu * 0.44); ctx.lineTo(ppu * 0.04, -ppu * 0.08); ctx.lineTo(-ppu * 0.03, -ppu * 0.07);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, ppu * 0.05, ppu * 0.055, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
