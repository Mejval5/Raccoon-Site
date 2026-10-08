// Drawing the hub village's rooms (hub-rooms.js, data/hub-rooms.json): the furniture of each room (img/v2/sprites-hub.webp and
// the older atlases), hanging snail-shell lamps with a soft glow, Quill's idols on his shelf, the seals of locked rooms (a kelp
// curtain, a rubble heap over rock, a dim veil over an empty room), the wardrobe shell, the Ink Jet practice target and the
// hidden keepsake. Drawn before the octopus (main.js v2Extra), in device pixels. Nothing here allocates per frame except the
// few radial gradients of the lamps in view.

import { drawSprite } from './sprites.js';
import { SEAL_KELP, SEAL_RUBBLE } from './hub-rooms.js';

const TAU = Math.PI * 2;

function inView(camera, cw, ch, x0, y0, x1, y1) {
  const ppu = camera.pxPerUnit, hw = cw / ppu / 2 + 1, hh = ch / ppu / 2 + 1;
  return x1 > camera.x - hw && x0 < camera.x + hw && y1 > camera.y - hh && y0 < camera.y + hh;
}

/** Is a furnishing shown for this room state? */
export function furnishShown(f, open, story) {
  const when = f.when || 'open';
  if (when === 'locked' ? open : when === 'open' ? !open : false) return false;
  if (f.need && ((story[f.need.story] | 0) < (f.need.min === undefined ? 1 : f.need.min))) return false;
  return true;
}

/** The ceiling above (x, y): the first solid tile row's bottom edge, at most 8 tiles up. */
function ceilingAbove(tileAt, x, y) {
  const tx = Math.floor(x);
  for (let ty = Math.floor(y); ty > Math.floor(y) - 8; ty--) if (tileAt(tx, ty) !== 0) return ty + 1;
  return Math.floor(y) - 8;
}

function glow(ctx, sx, sy, r, alpha, inner = 'rgba(255,214,150,', outer = 'rgba(255,190,120,') {
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, inner + (0.32 * alpha).toFixed(3) + ')');
  g.addColorStop(0.45, outer + (0.12 * alpha).toFixed(3) + ')');
  g.addColorStop(1, outer + '0)');
  ctx.fillStyle = g;
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
}

/** A hanging lamp from the ceiling above (x, y): a rope down to the snail-shell lamp, swaying a little, and its glow. */
function drawLamp(ctx, camera, cw, ch, x, y, t, tileAt, lit) {
  const ppu = camera.pxPerUnit;
  const top = ceilingAbove(tileAt, x, y);
  const sway = Math.sin(t * 0.9 + x * 1.7) * 0.06;
  const sx = cw / 2 + (x - camera.x) * ppu, topY = ch / 2 + (top - camera.y) * ppu, bot = ch / 2 + (y - camera.y) * ppu;
  const len = Math.max(ppu * 0.6, bot - topY);
  const lx = sx + Math.sin(sway) * len, ly = topY + Math.cos(sway) * len;
  ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = Math.max(1, ppu * 0.05);
  ctx.beginPath(); ctx.moveTo(sx, topY); ctx.lineTo(lx, ly - ppu * 0.6); ctx.stroke();
  if (lit) {
    const flick = 0.88 + 0.12 * Math.sin(t * 2.3 + x);
    glow(ctx, lx, ly - ppu * 0.25, ppu * 2.4, flick);
  }
  drawSprite(ctx, 'hangingLamp', lx, ly, 0, ppu * 1.2, 0.5, 1, -sway);
}

/** A curtain of kelp blades hanging from the top of a door to its floor, swaying; parts where the octopus noses in. */
function drawKelpCurtain(ctx, camera, cw, ch, r, t, octo, since) {
  const ppu = camera.pxPerUnit;
  const x0 = r.dx0, x1 = r.dx1 + 1, y0 = r.dy0, y1 = r.dy1 + 1;
  const n = Math.max(4, Math.round((x1 - x0) * 3));
  const shiver = since >= 0 && since < 0.7 ? Math.sin(since * 30) * (0.7 - since) * 0.25 : 0;
  ctx.save();
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const bx = x0 + u * (x1 - x0);
    const sx = cw / 2 + (bx - camera.x) * ppu, sy0 = ch / 2 + (y0 - 0.1 - camera.y) * ppu, sy1 = ch / 2 + (y1 + 0.05 - camera.y) * ppu;
    const push = octo && Math.abs(octo.y - (y0 + y1) / 2) < (y1 - y0) / 2 + 0.6 ? Math.max(0, 1 - Math.abs(octo.x - bx) / 1.2) * Math.sign(bx - octo.x) * 0.35 : 0;
    const wav = Math.sin(t * 1.4 + i * 1.9) * 0.1 + shiver * (i % 2 ? 1 : -1) + push;
    const w = ppu * (0.32 + 0.08 * ((i * 7) % 3) / 2);
    const steps = 8;
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) { // left edge, top to bottom
      const v = k / steps, x = sx + Math.sin(v * 3 + t * 1.2 + i) * ppu * 0.08 + wav * ppu * v * v, y = sy0 + (sy1 - sy0) * v;
      const half = w * (0.35 + 0.65 * Math.sin(Math.min(1, v * 1.2) * Math.PI * 0.5)) / 2;
      if (k === 0) ctx.moveTo(x - half, y); else ctx.lineTo(x - half, y);
    }
    for (let k = steps; k >= 0; k--) {
      const v = k / steps, x = sx + Math.sin(v * 3 + t * 1.2 + i) * ppu * 0.08 + wav * ppu * v * v, y = sy0 + (sy1 - sy0) * v;
      const half = w * (0.35 + 0.65 * Math.sin(Math.min(1, v * 1.2) * Math.PI * 0.5)) / 2;
      ctx.lineTo(x + half, y);
    }
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#4d8a3e' : '#6c9e43'; ctx.fill();
    ctx.strokeStyle = '#163319'; ctx.lineWidth = Math.max(1.5, ppu * 0.035); ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param {any} level the hub level (level.rooms from applyHubRooms, level.points)
 * @param {any} table parseHubRooms result
 * @param {{story:any, tileAt:(x:number,y:number)=>number, octo:any, targetHitAt:number, targetHits:number, kelpBumpAt:number,
 *          keepsakeTaken:boolean}} s
 */
export function drawHubRooms(ctx, camera, cw, ch, level, table, t, s) {
  if (!level.rooms) return;
  const ppu = camera.pxPerUnit;
  const SX = (x) => cw / 2 + (x - camera.x) * ppu, SY = (y) => ch / 2 + (y - camera.y) * ppu;
  for (const r of level.rooms) {
    if (!inView(camera, cw, ch, r.x0 - 3, r.y0 - 3, r.x1 + 4, r.y1 + 3)) continue;
    const room = r.room;
    // the furniture: lamps first (their glow under everything), then the pieces
    for (const f of room.furnish) {
      if (f.kind !== 'lamp' && f.kind !== 'glow') continue;
      if (!furnishShown(f, r.open, s.story)) continue;
      if (f.kind === 'lamp') drawLamp(ctx, camera, cw, ch, r.ax + 0.5 + f.dx, r.ay + f.dy, t, s.tileAt, r.open);
      else glow(ctx, SX(r.ax + 0.5 + f.dx), SY(r.ay + f.dy), ppu * (f.r || 1.5), 0.8, 'rgba(190,240,220,', 'rgba(150,220,210,');
    }
    for (const f of room.furnish) {
      if (f.kind === 'lamp' || f.kind === 'glow' || !furnishShown(f, r.open, s.story)) continue;
      const x = SX(r.ax + 0.5 + f.dx), y = SY(r.ay + f.dy);
      if (f.kind === 'relics') { // Quill's idols in the shelf's three alcoves, one per relic handed over
        const n = Math.min(3, s.story.relicsGiven | 0), hh = (f.h || 1.4) * ppu;
        const w = hh * 378 / 130;
        for (let k = 0; k < n; k++) drawSprite(ctx, 'idol', x + (k - 1) * w * 0.3, y - hh * 0.2, 0, hh * 0.52, 0.5, 1);
        continue;
      }
      if (f.back) ctx.globalAlpha = 0.92;
      drawSprite(ctx, f.sprite, x, y, 0, (f.h || 1) * ppu, 0.5, 1, f.rot ? f.rot * Math.PI / 180 : 0, !!f.flip);
      ctx.globalAlpha = 1;
    }
    if (!r.open) {
      // locked: an empty room lies dim; a kelp curtain hangs in its door; a rubble heap sits in front of the rock that fills it
      // (a soft oval, darkest in the middle: no hard edge shows over the rock or the corridor)
      const rx = (r.x1 + 1 - r.x0) * ppu * 0.6, ry = (r.y1 + 1 - r.y0) * ppu * 0.7;
      ctx.save();
      ctx.translate(SX((r.x0 + r.x1 + 1) / 2), SY((r.y0 + r.y1 + 1) / 2)); ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(3,14,26,0.4)'); g.addColorStop(0.65, 'rgba(3,14,26,0.3)'); g.addColorStop(1, 'rgba(3,14,26,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
      ctx.restore();
      if (r.seal === SEAL_KELP && r.doors.length) drawKelpCurtain(ctx, camera, cw, ch, r, t, s.octo, t - (s.kelpBumpAt || -99));
      if (r.seal === SEAL_RUBBLE && r.doors.length) {
        const outX = r.ax < r.dx0 ? r.dx1 + 1.3 : r.dx0 - 0.3; // in front of the door, on the corridor side
        drawSprite(ctx, 'rubblePile', SX(outX), SY(r.dy1 + 1.05), 0, ppu * 1.15, 0.5, 1);
      }
    }
  }
  const P = level.points || {};
  // the wardrobe shell in its alcove (a hub-rooms.json `wardrobe` row; the skins owner's mirror shell, hub.json `mirror`, stands there now)
  if (P.A && table.wardrobe && !level.mirror && inView(camera, cw, ch, P.A[0] - 2, P.A[1] - 2, P.A[0] + 2, P.A[1] + 2)) {
    drawSprite(ctx, table.wardrobe.sprite, SX(P.A[0] + 0.5), SY(P.A[1] + 1.02), 0, ppu * (table.wardrobe.h || 1.9), 0.5, 1);
  }
  // the practice target: it rocks back when an ink blob lands
  if (P.G && table.target && inView(camera, cw, ch, P.G[0] - 2, P.G[1] - 3, P.G[0] + 2, P.G[1] + 2)) {
    const since = t - (s.targetHitAt || -99);
    const rock = since < 0.9 ? Math.sin(since * 22) * (0.9 - since) * 0.16 : 0;
    drawSprite(ctx, table.target.sprite, SX(P.G[0] + 0.5), SY(P.G[1] + 1.02), 0, ppu * (table.target.h || 1.8), 0.5, 1, rock);
    if (s.targetHits > 0 && since < 10) { // the round's tally: small ink dots under the target
      ctx.fillStyle = '#2a1840';
      for (let k = 0; k < s.targetHits; k++) { ctx.beginPath(); ctx.arc(SX(P.G[0] + 0.5 + (k - (s.targetHits - 1) / 2) * 0.3), SY(P.G[1] + 1.22), ppu * 0.08, 0, TAU); ctx.fill(); }
    }
  }
  // the keepsake behind the fish bone
  if (P.L && table.keepsake && inView(camera, cw, ch, P.L[0] - 2, P.L[1] - 2, P.L[0] + 2, P.L[1] + 2)) {
    drawSprite(ctx, table.keepsake.sprite, SX(P.L[0] + 0.5), SY(P.L[1] + 1.02), 0, ppu * (table.keepsake.h || 0.9), 0.5, 1);
    if (!s.keepsakeTaken) drawSprite(ctx, 'bomb', SX(P.L[0] - 0.2), SY(P.L[1] + 1.0), 0, ppu * 0.45, 0.5, 1, -0.4);
  }
}

/** A locked room's door in front of which to say why it is shut: the door's centre, or null. */
export function doorCentre(r) { return r.doors.length ? { x: (r.dx0 + r.dx1 + 1) / 2, y: (r.dy0 + r.dy1 + 1) / 2 } : null; }
