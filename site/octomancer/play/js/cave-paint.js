// Controller Phase 2B: the tutorial's first room is a cave-painting wall of the whole control scheme (swim, aim, ink jet, use
// slot, hand, dash, hotbar, journal, pause), painted on the cave's back wall in red and yellow ochre and charcoal: a little
// octopus figure doing the thing, the control glyphs in the same hand (glyphs.js LOOK_PAINT) and the word. It follows the
// active scheme (signs repaint on modechange). The journal's Controls page draws its cards with the same marks (drawControlCard).
//
// The wall is painted once into a cached canvas per (scheme, style, zoom) and blitted while it is on screen; nothing is
// read back from the game canvas. It is drawn behind the plants and the rock (render.js backWallDraw).

import { glyphs, glyphWidth, drawGlyph, LOOK_PAINT } from './glyphs.js';
import { CONTROL_ROWS } from './signs.js';

const OCHRE = '#9a4a28', YELLOW = '#b88a2e', CHAR = '#2a2220';
const FONT = 'Quicksand, sans-serif';
const TAU = Math.PI * 2;

// a small deterministic wobble (painted lines are never straight)
function wob(i) { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s) - 0.5; }

/** The figure for an action, painted around (0, 0) in a box about [-1, 1] (unit u px). */
function picto(c, action, u) {
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = Math.max(1.5, u * 0.11);
  const octo = (x, y, s = 1) => { // the octopus as a cave figure: a round head, two eyes, four wavy arms
    c.strokeStyle = OCHRE; c.fillStyle = 'rgba(154, 74, 40, 0.55)';
    c.beginPath(); c.arc(x, y - 0.25 * s * u, 0.34 * s * u, Math.PI, 0); c.lineTo(x + 0.34 * s * u, y - 0.05 * s * u); c.lineTo(x - 0.34 * s * u, y - 0.05 * s * u); c.closePath(); c.fill(); c.stroke();
    for (let k = 0; k < 4; k++) {
      const ax = x + (-0.27 + k * 0.18) * s * u;
      c.beginPath(); c.moveTo(ax, y - 0.05 * s * u);
      c.quadraticCurveTo(ax + (k % 2 ? 0.1 : -0.1) * s * u, y + 0.2 * s * u, ax + (k % 2 ? -0.04 : 0.04) * s * u, y + 0.38 * s * u); c.stroke();
    }
    c.fillStyle = CHAR;
    for (const ex of [-0.12, 0.12]) { c.beginPath(); c.arc(x + ex * s * u, y - 0.25 * s * u, 0.05 * s * u, 0, TAU); c.fill(); }
  };
  const arrow = (x0, y0, x1, y1) => {
    c.strokeStyle = CHAR; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
    const a = Math.atan2(y1 - y0, x1 - x0), h = u * 0.16;
    c.moveTo(x1, y1); c.lineTo(x1 - Math.cos(a - 0.6) * h, y1 - Math.sin(a - 0.6) * h);
    c.moveTo(x1, y1); c.lineTo(x1 - Math.cos(a + 0.6) * h, y1 - Math.sin(a + 0.6) * h); c.stroke();
  };
  switch (action) {
    case 'move':
      octo(0, 0.05 * u);
      arrow(0.5 * u, 0, 0.9 * u, 0); arrow(-0.5 * u, 0, -0.9 * u, 0); arrow(0, -0.55 * u, 0, -0.9 * u); arrow(0, 0.5 * u, 0, 0.85 * u);
      break;
    case 'aim':
      octo(-0.55 * u, 0.15 * u, 0.85);
      c.strokeStyle = CHAR; c.setLineDash([u * 0.08, u * 0.13]); c.beginPath(); c.moveTo(-0.2 * u, -0.05 * u); c.lineTo(0.55 * u, -0.45 * u); c.stroke(); c.setLineDash([]);
      c.strokeStyle = OCHRE; c.beginPath(); c.arc(0.65 * u, -0.5 * u, 0.2 * u, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(0.65 * u, -0.78 * u); c.lineTo(0.65 * u, -0.22 * u); c.moveTo(0.37 * u, -0.5 * u); c.lineTo(0.93 * u, -0.5 * u); c.stroke();
      break;
    case 'attack':
      octo(-0.5 * u, 0.1 * u, 0.85);
      c.fillStyle = CHAR;
      for (let k = 0; k < 6; k++) { c.beginPath(); c.arc((-0.05 + k * 0.17) * u, (-0.05 + wob(k) * 0.25) * u, (0.1 - k * 0.01) * u, 0, TAU); c.fill(); }
      break;
    case 'use': // a spell: a spiral, and a bomb beside it
      c.strokeStyle = YELLOW; c.beginPath();
      for (let k = 0; k <= 40; k++) { const a = k * 0.42, rr = (0.05 + k * 0.012) * u; const px = -0.35 * u + Math.cos(a) * rr, py = Math.sin(a) * rr; if (k) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
      c.fillStyle = CHAR; c.beginPath(); c.arc(0.5 * u, 0.15 * u, 0.28 * u, 0, TAU); c.fill();
      c.strokeStyle = OCHRE; c.beginPath(); c.moveTo(0.62 * u, -0.1 * u); c.quadraticCurveTo(0.75 * u, -0.4 * u, 0.9 * u, -0.35 * u); c.stroke();
      break;
    case 'hand': // an arm curled round a pot
      octo(-0.5 * u, 0.1 * u, 0.85);
      c.strokeStyle = OCHRE; c.beginPath(); c.moveTo(-0.25 * u, 0.2 * u); c.bezierCurveTo(0.1 * u, 0.5 * u, 0.55 * u, 0.4 * u, 0.6 * u, 0.0); c.stroke();
      c.strokeStyle = CHAR; c.fillStyle = 'rgba(184, 138, 46, 0.6)';
      c.beginPath(); c.moveTo(0.38 * u, -0.5 * u); c.lineTo(0.72 * u, -0.5 * u); c.quadraticCurveTo(0.95 * u, -0.1 * u, 0.72 * u, 0.15 * u); c.lineTo(0.38 * u, 0.15 * u); c.quadraticCurveTo(0.15 * u, -0.1 * u, 0.38 * u, -0.5 * u); c.closePath(); c.fill(); c.stroke();
      break;
    case 'dash':
      octo(0.35 * u, 0.05 * u, 0.9);
      c.strokeStyle = CHAR;
      for (let k = 0; k < 3; k++) { const yy = (-0.3 + k * 0.25) * u; c.beginPath(); c.moveTo(-0.95 * u, yy); c.lineTo((-0.2 - k * 0.08) * u, yy); c.stroke(); }
      break;
    case 'cycle': // the bar: three slots, the middle one ringed
      c.strokeStyle = OCHRE;
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.rect(k * 0.55 * u - 0.22 * u, -0.22 * u, 0.44 * u, 0.44 * u); c.stroke(); }
      c.strokeStyle = CHAR; c.beginPath(); c.arc(0, 0, 0.36 * u, 0, TAU); c.stroke();
      arrow(-0.2 * u, 0.6 * u, -0.85 * u, 0.6 * u); arrow(0.2 * u, 0.6 * u, 0.85 * u, 0.6 * u);
      break;
    case 'inventory': // an open book
      c.strokeStyle = CHAR; c.fillStyle = 'rgba(184, 138, 46, 0.45)';
      c.beginPath(); c.moveTo(0, -0.35 * u); c.quadraticCurveTo(-0.4 * u, -0.55 * u, -0.85 * u, -0.4 * u); c.lineTo(-0.85 * u, 0.45 * u); c.quadraticCurveTo(-0.4 * u, 0.3 * u, 0, 0.5 * u);
      c.quadraticCurveTo(0.4 * u, 0.3 * u, 0.85 * u, 0.45 * u); c.lineTo(0.85 * u, -0.4 * u); c.quadraticCurveTo(0.4 * u, -0.55 * u, 0, -0.35 * u); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(0, -0.35 * u); c.lineTo(0, 0.5 * u); c.stroke();
      c.strokeStyle = OCHRE; c.lineWidth *= 0.7;
      for (let k = 0; k < 3; k++) { const yy = (-0.15 + k * 0.17) * u; c.beginPath(); c.moveTo(-0.65 * u, yy); c.lineTo(-0.2 * u, yy + 0.02 * u); c.moveTo(0.2 * u, yy + 0.02 * u); c.lineTo(0.65 * u, yy); c.stroke(); }
      break;
    case 'pause':
      c.fillStyle = OCHRE;
      c.beginPath(); c.roundRect(-0.38 * u, -0.5 * u, 0.24 * u, 1.0 * u, 0.06 * u); c.roundRect(0.14 * u, -0.5 * u, 0.24 * u, 1.0 * u, 0.06 * u); c.fill();
      break;
    default: break;
  }
  c.restore();
}

/** The glyphs of an action in a row, centred on (x, y), half height r; returns the row's width. */
function glyphRow(c, action, scheme, style, x, y, r, max = 2, maxW = Infinity) {
  const gs = glyphs(action, scheme, style).slice(0, max);
  const widthAt = (rr) => { let w = 0; for (const g of gs) w += glyphWidth(g, rr); return w + rr * 0.55 * Math.max(0, gs.length - 1); };
  if (widthAt(r) > maxW) r *= maxW / widthAt(r); // a long row (Space / Shift) shrinks to fit
  const gap = r * 0.55;
  const w = widthAt(r);
  let gx = x - w / 2;
  gs.forEach((g, i) => {
    if (i) { c.fillStyle = CHAR; c.font = '700 ' + Math.round(r * 1.1) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('/', gx + gap / 2 - r * 0.02, y); gx += gap; }
    const gw = glyphWidth(g, r);
    drawGlyph(c, g, gx + gw / 2, y, r, LOOK_PAINT);
    gx += gw;
  });
  return w;
}

/**
 * One control as a painted card (the journal's Controls page): the figure on top, the scheme's glyphs under it, in a px x px
 * card whose centre is the origin.
 */
export function drawControlCard(c, action, px, scheme, style) {
  // a pale flat stone to paint on (the book's plates are dark sea; the marks need their rock)
  c.save();
  c.fillStyle = '#d8c7a0'; c.strokeStyle = 'rgba(90, 60, 30, 0.35)'; c.lineWidth = Math.max(1, px * 0.012);
  c.beginPath();
  const n = 18;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU, q = 1 + wob(k + action.length) * 0.07;
    const x = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.45) * px * 0.43 * q, y = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.45) * px * 0.41 * q;
    if (k) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath(); c.fill(); c.stroke();
  c.restore();
  c.save(); c.translate(0, -px * 0.12); picto(c, action, px * 0.21); c.restore();
  glyphRow(c, action, scheme, style, 0, px * 0.25, px * 0.115, 3, px * 0.78);
}

const walls = new Map(); // scheme|style|scale -> canvas
/** Paint the wall for (scheme, style) at `s` px per tile into a canvas `wT` x `hT` tiles. */
function paintWall(scheme, style, s, wT, hT, cols) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(wT * s); c.height = Math.ceil(hT * s);
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  // the flat of the rock it is painted on: a pale, uneven slab a shade off the water, edged softly
  g.fillStyle = 'rgba(214, 196, 160, 0.13)';
  g.beginPath();
  const n = 26;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU;
    const rx = (wT * s) / 2 - s * 0.12, ry = (hT * s) / 2 - s * 0.1;
    const q = 1 + wob(k + 3) * 0.06;
    const px = (wT * s) / 2 + Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.35) * rx * q;
    const py = (hT * s) / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.35) * ry * q;
    if (k) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath(); g.fill();
  const rows = Math.ceil(CONTROL_ROWS.length / cols);
  const cellW = (wT * s) / cols, cellH = (hT * s) / rows;
  const r = s * 0.25, u = s * 0.46;
  CONTROL_ROWS.forEach(([action, name], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x0 = col * cellW, y0 = row * cellH, cy = y0 + cellH * 0.5;
    g.save();
    g.translate(x0 + cellW * 0.22, cy + wob(i) * s * 0.06);
    g.rotate(wob(i + 7) * 0.08);
    picto(g, action, u);
    g.restore();
    // the glyphs and, under them, the word
    const gx = x0 + cellW * 0.63;
    g.save();
    g.translate(0, wob(i + 11) * s * 0.04);
    glyphRow(g, action, scheme, style, gx, cy - cellH * 0.14, r, 2, cellW * 0.7);
    g.fillStyle = CHAR; g.globalAlpha = 0.88;
    g.font = '700 ' + Math.round(s * 0.27) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name.toLowerCase(), gx, cy + cellH * 0.27);
    g.restore();
  });
  return c;
}

/**
 * Draw the painted wall `spec` = {rect: [x0, y0, x1, y1] (tiles, world), cols} for `view` = {scheme, style}. The canvas is
 * painted at most at 96 px per tile and scaled to the zoom.
 */
export function drawCavePainting(ctx, camera, cw, ch, spec, view) {
  if (!spec || !spec.rect) return;
  const ppu = camera.pxPerUnit, [x0, y0, x1, y1] = spec.rect;
  const sx = cw / 2 + (x0 - camera.x) * ppu, sy = ch / 2 + (y0 - camera.y) * ppu;
  const w = (x1 - x0) * ppu, h = (y1 - y0) * ppu;
  if (sx > cw || sy > ch || sx + w < 0 || sy + h < 0) return;
  const s = Math.min(96, Math.round(ppu));
  const key = view.scheme + '|' + view.style + '|' + s + '|' + spec.rect.join(',');
  let c = walls.get(key);
  if (!c) {
    if (walls.size > 6) walls.clear();
    c = paintWall(view.scheme, view.style, s, x1 - x0, y1 - y0, spec.cols || 3);
    walls.set(key, c);
  }
  ctx.save();
  ctx.globalAlpha *= 0.92;
  ctx.drawImage(c, sx, sy, w, h);
  ctx.restore();
}

/** Test hook: the painted walls cached. */
export function paintingCacheKeys() { return [...walls.keys()]; }
