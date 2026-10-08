// Drawing for the first spell set (SPELLS-PICK.md, spell-fx.js). Riptide streams are drawn with the hazards (hazards-draw.js
// drawJet, a temp record) and the coral is a baked tile material (render.js MAT_CORAL). Here: the Delayed motes, the bud of coral
// growing and the cracks of coral about to crumble, the anchor under an anchored octopus, and the rune pedestals. A few arcs and one
// sprite per thing; off-screen ones are culled (cull.js).

import { cullView, cullFlags, visibleAt } from './cull.js';
import { drawSprite } from './sprites.js';

const TAU = Math.PI * 2;
const INK = '#10202c';
const RUNE_SPRITE = { heavy: 'runeHeavy', delayed: 'runeDelayed', lingering: 'runeLingering' };
const SPELL_SPRITE = { 'ink-cloud': 'iconInkCloud', riptide: 'iconRiptide', 'coral-wall': 'iconCoralWall', anchor: 'iconAnchor', lure: 'iconLure' };
/** The atlas sprite of a rune or spell id (null when it has none). */
export function runeSprite(id) { return RUNE_SPRITE[id] || SPELL_SPRITE[id] || null; }

/** A bioluminescent mote: a pale-green core in a soft glow, pulsing faster as it is about to go off. */
function drawMote(ctx, x, y, ppu, t, frac) {
  const pulse = 0.75 + 0.25 * Math.sin(t * (6 + frac * 18));
  const R = ppu * (0.32 + 0.1 * frac) * pulse;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, 'rgba(210,255,230,0.95)'); g.addColorStop(0.25, 'rgba(120,240,200,0.55)'); g.addColorStop(1, 'rgba(60,200,170,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8fff0';
  ctx.beginPath(); ctx.arc(x, y, ppu * 0.05, 0, TAU); ctx.fill();
}

/** The live spell effects of the level drawn under the octopus. `fx` = spell-fx.js createSpellFx(). */
export function drawSpellFx(ctx, camera, cw, ch, fx, octo, t) {
  const ppu = camera.pxPerUnit, ox = cw / 2 - camera.x * ppu, oy = ch / 2 - camera.y * ppu;
  cullView(camera, cw, ch);
  const mo = fx.moteData;
  if (mo.live) {
    const fl = cullFlags('motes', mo.n);
    for (let i = 0; i < mo.n; i++) if (mo.alive[i] && visibleAt(fl, i, mo.x[i], mo.y[i], 0.6)) drawMote(ctx, ox + mo.x[i] * ppu, oy + mo.y[i] * ppu, ppu, t, Math.min(1, mo.t[i] / Math.max(0.01, mo.delay[i])));
  }
  const lu = fx.lureData;
  if (lu && lu.on && visibleAt(cullFlags('lure', 1), 0, lu.x, lu.y, lu.light + 0.5)) {
    // an anglerfish lure: a pale-green bulb on a curved stalk, its light (radius lu.light) pulsing; it swells in over its grace
    const x = ox + lu.x * ppu, y = oy + lu.y * ppu, k = Math.min(1, lu.t / Math.max(0.05, lu.grace)), fade = Math.min(1, (lu.life - lu.t) / 0.6);
    const R = lu.light * ppu * (0.6 + 0.4 * k) * (0.92 + 0.08 * Math.sin(t * 3.1));
    ctx.save();
    ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, 'rgba(190,255,215,0.32)'); g.addColorStop(0.35, 'rgba(110,230,190,0.14)'); g.addColorStop(1, 'rgba(60,200,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    if (!drawSprite(ctx, 'iconLure', x, y + ppu * 0.1, 0, ppu * 0.75, 0.5, 0.5, Math.sin(t * 1.7) * 0.15)) {
      ctx.strokeStyle = '#3f5a3a'; ctx.lineWidth = Math.max(1, ppu * 0.05);
      ctx.beginPath(); ctx.moveTo(x - ppu * 0.25, y + ppu * 0.45); ctx.quadraticCurveTo(x - ppu * 0.3, y - ppu * 0.1, x, y); ctx.stroke();
      ctx.fillStyle = '#d8ffe4'; ctx.beginPath(); ctx.arc(x, y, ppu * 0.12, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  const co = fx.coralData;
  if (co.live) {
    const fl = cullFlags('coral', co.n);
    ctx.save();
    ctx.strokeStyle = 'rgba(40,14,20,0.8)'; ctx.lineWidth = Math.max(1, ppu * 0.035); ctx.lineCap = 'round';
    for (let i = 0; i < co.n; i++) {
      if (co.state[i] === 1) { // growing: a bud of coral rising in the cell
        if (!visibleAt(fl, i, co.tx[i] + 0.5, co.ty[i] + 0.5, 0.8)) continue;
        const x = ox + (co.tx[i] + 0.5) * ppu, y = oy + (co.ty[i] + 1) * ppu;
        ctx.fillStyle = 'rgba(214,112,92,0.75)';
        ctx.beginPath(); ctx.ellipse(x, y - ppu * 0.25, ppu * 0.3, ppu * 0.25, 0, 0, TAU); ctx.fill();
        continue;
      }
      if (co.state[i] !== 2) continue;
      const left = co.life[i] - co.t[i];
      if (!(left < fx.CRUMBLE_WARN) || !visibleAt(fl, i, co.tx[i] + 0.5, co.ty[i] + 0.5, 0.8)) continue;
      // about to crumble: cracks spread over it and grains fall from it
      const k = 1 - left / fx.CRUMBLE_WARN, x0 = ox + co.tx[i] * ppu, y0 = oy + co.ty[i] * ppu;
      const jit = Math.sin(t * 40 + i) * ppu * 0.02 * k;
      ctx.beginPath();
      ctx.moveTo(x0 + ppu * 0.5 + jit, y0 + ppu * 0.1); ctx.lineTo(x0 + ppu * (0.5 - 0.2 * k), y0 + ppu * 0.5); ctx.lineTo(x0 + ppu * 0.45, y0 + ppu * (0.5 + 0.4 * k));
      ctx.moveTo(x0 + ppu * (0.5 - 0.2 * k), y0 + ppu * 0.5); ctx.lineTo(x0 + ppu * (0.5 + 0.35 * k), y0 + ppu * 0.62);
      ctx.stroke();
      ctx.fillStyle = 'rgba(230,150,130,0.8)';
      for (let g = 0; g < 3; g++) {
        const u = (t * 1.3 + g * 0.37 + i * 0.11) % 1;
        ctx.beginPath(); ctx.arc(x0 + ppu * (0.25 + 0.25 * g), y0 + ppu * (1 + u * 0.6 * k), ppu * 0.03, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
}

/**
 * Anchor: an old barnacled anchor the octopus clutches in its arms (drawn over the body, after the octopus), bubbles streaming up
 * off it as it drops. Its flukes end at the body's lower rim, so a body resting on a floor never shows iron sunk in the rock.
 */
export function drawAnchorHeld(ctx, camera, cw, ch, octo, t) {
  if (!octo || !(octo.anchorT > 0) || octo.dead) return;
  const ppu = camera.pxPerUnit;
  const x = cw / 2 + (octo.x - camera.x) * ppu, y = ch / 2 + (octo.y - camera.y) * ppu, fall = Math.min(1, Math.max(0, octo.vy) / 12);
  ctx.save();
  if (!drawSprite(ctx, 'iconAnchor', x, y + ppu * 0.42, 0, ppu * 0.6, 0.5, 1, Math.sin(t * 3) * 0.06)) {
    ctx.fillStyle = '#56645c'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ppu * 0.04);
    ctx.beginPath(); ctx.rect(x - ppu * 0.04, y - ppu * 0.1, ppu * 0.08, ppu * 0.4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + ppu * 0.2, ppu * 0.2, 0.15, Math.PI - 0.15); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(225,250,255,0.7)'; ctx.lineWidth = Math.max(1, ppu * 0.025);
  for (let b = 0; b < 5; b++) {
    const u = (t * (1.2 + fall) + b * 0.21) % 1;
    ctx.globalAlpha = (1 - u) * (0.3 + 0.7 * fall);
    ctx.beginPath(); ctx.arc(x + Math.sin(b * 2.3 + t * 3) * ppu * 0.25, y - u * ppu * 1.2, ppu * (0.04 + 0.02 * (b % 2)), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/** A rune pedestal: the carved stone with the rune floating over it in a faint bioluminescent glow. `spot` = {x, y, id, dwell}. */
export function drawRunePedestal(ctx, camera, cw, ch, spot, t) {
  const ppu = camera.pxPerUnit, x = cw / 2 + (spot.x - camera.x) * ppu, y = ch / 2 + (spot.y - camera.y) * ppu;
  ctx.save();
  if (!drawSprite(ctx, 'stone', x, y + ppu * 0.28, 0, ppu * 0.62)) {
    ctx.fillStyle = '#5e6a6b'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ppu * 0.04);
    ctx.beginPath(); ctx.roundRect(x - ppu * 0.28, y - ppu * 0.3, ppu * 0.56, ppu * 0.58, ppu * 0.1); ctx.fill(); ctx.stroke();
  }
  const hy = y - ppu * (0.62 + 0.05 * Math.sin(t * 1.6));
  const glow = ctx.createRadialGradient(x, hy, 0, x, hy, ppu * 0.6);
  glow.addColorStop(0, 'rgba(140,255,215,0.35)'); glow.addColorStop(1, 'rgba(80,220,180,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, hy, ppu * 0.6, 0, TAU); ctx.fill();
  const name = runeSprite(spot.id);
  if (!name || !drawSprite(ctx, name, x, hy, 0, ppu * 0.5, 0.5, 0.5)) {
    ctx.strokeStyle = '#a8ffe0'; ctx.lineWidth = Math.max(1, ppu * 0.05);
    ctx.beginPath(); ctx.arc(x, hy, ppu * 0.16, 0, TAU); ctx.stroke();
  }
  if (spot.dwell > 0) { // taking it: a ring fills around the rune
    ctx.strokeStyle = 'rgba(190,255,230,0.9)'; ctx.lineWidth = Math.max(1.5, ppu * 0.05);
    ctx.beginPath(); ctx.arc(x, hy, ppu * 0.36, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, spot.dwell / 0.5)); ctx.stroke();
  }
  ctx.restore();
}
