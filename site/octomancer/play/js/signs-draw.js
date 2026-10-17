// Controller Phase 2B: the signs of signs.js drawn in the world. A sign far from the octopus is the small plank with its label
// (the tutorial look since round 23); the open one unfolds into a wooden board with its title and the whole text, the
// controls burnt into the wood as the active scheme's glyphs (glyphs.js LOOK_WOOD). Boards are drawn once into a small
// cached canvas per (text, scheme, size) and blitted, so a frame costs one drawImage per open board.
// Also the small prompts fixed to an object (the mirror shell, a lit bomb, a grabbing tentacle): drawAnchorTag.

import { layoutRich, drawRichLayout } from './rich.js';
import { LOOK_WOOD } from './glyphs.js';
import { signText } from './signs.js';

const WOOD = '#c09056', WOOD_LIT = '#d6a96a', WOOD_EDGE = '#3a2410', BURNT = '#3a2410', POST = '#6b4a22';
const FONT = 'Quicksand, sans-serif';
const OPEN_S = 0.22; // s for a sign to unfold or fold

const boards = new Map(); // key -> {c: canvas, w, h} (CSS = canvas px of the game)
let measureCtx = null;
function mctx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/** Board metrics at a zoom: text and title font px, the widest a board may be. */
function metrics(ppu, cw) {
  const fs = Math.max(12, Math.round(ppu * 0.2)), ts = Math.max(13, Math.round(ppu * 0.24));
  return { fs, ts, maxW: Math.min(ppu * 5.6, cw * 0.86), pad: Math.round(fs * 0.85), lh: Math.round(fs * 1.55), r: fs * 0.82 };
}

/** The open board of a prompt for a scheme, cached. */
function board(p, scheme, style, ppu, cw) {
  const m = metrics(ppu, cw);
  const text = signText(p, scheme), title = p.title || '';
  const key = scheme + '|' + style + '|' + m.fs + '|' + Math.round(m.maxW) + '|' + title + '|' + text;
  let b = boards.get(key);
  if (b) return b;
  const g = mctx();
  g.font = '600 ' + m.fs + 'px ' + FONT;
  const L = layoutRich(text, scheme, style, (s) => g.measureText(s).width, m.maxW - 2 * m.pad, m.r);
  g.font = '700 ' + m.ts + 'px ' + FONT;
  const tw = title ? g.measureText(title).width : 0;
  const w = Math.ceil(Math.max(L.w, tw, m.fs * 6) + 2 * m.pad);
  const titleH = title ? Math.round(m.ts * 1.5) : 0;
  const h = Math.ceil(m.pad * 1.6 + titleH + L.lines.length * m.lh);
  const c = document.createElement('canvas');
  c.width = w + 4; c.height = h + 4;
  const x = c.getContext('2d');
  x.translate(2, 2);
  // the board: a plank with a few grain lines and a dark edge
  x.fillStyle = WOOD; x.strokeStyle = WOOD_EDGE; x.lineWidth = Math.max(2, m.fs * 0.14); x.lineJoin = 'round';
  x.beginPath(); x.roundRect(0, 0, w, h, m.fs * 0.45); x.fill();
  x.save(); x.clip();
  x.strokeStyle = 'rgba(90, 56, 22, 0.22)'; x.lineWidth = Math.max(1, m.fs * 0.06);
  for (let k = 1; k < 5; k++) { const yy = (h * k) / 5 + Math.sin(k * 2.3) * 3; x.beginPath(); x.moveTo(4, yy); x.bezierCurveTo(w * 0.3, yy - 3, w * 0.6, yy + 3, w - 4, yy - 1); x.stroke(); }
  x.restore();
  x.beginPath(); x.roundRect(0, 0, w, h, m.fs * 0.45); x.stroke();
  let y = m.pad * 0.8;
  if (title) {
    x.fillStyle = BURNT; x.font = '700 ' + m.ts + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(title, w / 2, y + titleH * 0.42);
    x.strokeStyle = 'rgba(58, 36, 16, 0.35)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(w * 0.3, y + titleH * 0.86); x.lineTo(w * 0.7, y + titleH * 0.86); x.stroke();
    y += titleH;
  }
  x.font = '600 ' + m.fs + 'px ' + FONT; x.fillStyle = BURNT;
  drawRichLayout(x, L, w / 2, y + m.lh / 2, m.lh, LOOK_WOOD, 'center');
  b = { c, w: w + 4, h: h + 4, lines: L.lines.length };
  if (boards.size > 40) boards.clear();
  boards.set(key, b);
  return b;
}

/** The small plank with the label (a closed sign). Drawn at (0, 0) = its centre; `lit` = being read. */
function plank(ctx, label, ppu, lit) {
  ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.27))}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width, pw = tw + ppu * 0.36, ph = ppu * 0.42;
  ctx.fillStyle = lit ? WOOD_LIT : '#b98a4f'; ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = Math.max(2, ppu * 0.05);
  ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ppu * 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = BURNT;
  ctx.fillText(label, 0, 1);
  return ph;
}

/**
 * Draw the signs of a level. `open` = the prompt being read (or null); `view` = {scheme: 'desktop'|'pad'|'touch', style}.
 * Signs whose `when` the caller filtered out are skipped through `hidden(p)`.
 */
export function drawSigns(ctx, camera, cw, ch, prompts, open, view, time, hidden = null) {
  if (!prompts || !prompts.length) return;
  const ppu = camera.pxPerUnit;
  ctx.save();
  ctx.lineJoin = 'round';
  let last = null;
  for (const p of prompts) {
    const target = p === open ? 1 : 0;
    const dt = p._t === undefined ? 1 : Math.max(0, Math.min(0.1, time - p._t));
    p._t = time;
    p._open = p._open === undefined ? target : p._open + Math.sign(target - p._open) * Math.min(Math.abs(target - p._open), dt / OPEN_S);
    if (hidden && hidden(p)) { p._open = 0; continue; }
    if (p === open) { last = p; continue; }
    drawOne(ctx, camera, cw, ch, p, ppu, view, time);
  }
  if (last) drawOne(ctx, camera, cw, ch, last, ppu, view, time);
  ctx.restore();
}

function drawOne(ctx, camera, cw, ch, p, ppu, view, time) {
  const k = p._open || 0;
  const label = p.label || p.title || '';
  if (p.sign) {
    const bx = cw / 2 + (p.sign[0] + 0.5 - camera.x) * ppu;
    const floor = ch / 2 + (p.sign[1] + 1 - camera.y) * ppu;
    if (bx < -ppu * 6 || bx > cw + ppu * 6 || floor < -ppu * 2 || floor > ch + ppu * 6) return;
    const signY = floor - ppu * 0.78;
    const postW = Math.max(2, ppu * 0.08);
    ctx.fillStyle = POST; ctx.strokeStyle = WOOD_EDGE; ctx.lineWidth = Math.max(1, ppu * 0.03);
    ctx.fillRect(bx - postW / 2, signY, postW, floor - signY);
    ctx.strokeRect(bx - postW / 2, signY, postW, floor - signY);
    const sway = Math.sin(time * 1.1 + p.sign[0] * 1.9) * 0.02;
    if (k < 1 && label) { ctx.save(); ctx.globalAlpha *= 1 - k; ctx.translate(bx, signY); ctx.rotate(sway); plank(ctx, label, ppu, k > 0); ctx.restore(); }
    if (k > 0) openBoard(ctx, p, ppu, cw, ch, view, bx, signY + ppu * 0.2, k, sway * 0.5, 'up', postW);
  } else if (p.hang) {
    const cx = cw / 2 + (p.hang[0] + 0.5 - camera.x) * ppu;
    const top = ch / 2 + (p.hang[1] - camera.y) * ppu;
    if (cx < -ppu * 6 || cx > cw + ppu * 6 || top < -ppu * 6 || top > ch + ppu) return;
    const drop = (p.hang[2] || 0.7) * ppu;
    const sway = Math.sin(time * 0.9 + p.hang[0]) * 0.015;
    // the plank / board hangs from two ropes; the ropes reach the board's top corners
    const b = k > 0 ? board(p, view.scheme, view.style, ppu, cw) : null;
    let half = ppu * 0.6;
    if (label && !b) { ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.27))}px ${FONT}`; half = (ctx.measureText(label).width + ppu * 0.36) / 2; }
    if (b) half = (b.w / 2) * (0.7 + 0.3 * k);
    const shift = b ? clampShift(cx, half, cw) : 0;
    ctx.strokeStyle = '#4a3418'; ctx.lineWidth = Math.max(1.5, ppu * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx - half * 0.7 + shift, top); ctx.lineTo(cx - half * 0.7 + shift, top + drop + 2);
    ctx.moveTo(cx + half * 0.7 + shift, top); ctx.lineTo(cx + half * 0.7 + shift, top + drop + 2);
    ctx.stroke();
    if (k < 1 && label) { ctx.save(); ctx.globalAlpha *= 1 - k; ctx.translate(cx, top + drop + ppu * 0.21); ctx.rotate(sway); plank(ctx, label, ppu, k > 0); ctx.restore(); }
    if (b) { ctx.save(); ctx.globalAlpha *= k; ctx.translate(cx + shift, top + drop); ctx.rotate(sway); const s = 0.7 + 0.3 * k; ctx.scale(s, s); ctx.drawImage(b.c, -b.w / 2, 0); ctx.restore(); }
  } else if (p.anchor && k > 0) {
    const ax = cw / 2 + (p.anchor[0] - camera.x) * ppu, ay = ch / 2 + (p.anchor[1] - camera.y) * ppu;
    openBoard(ctx, p, ppu, cw, ch, view, ax, ay, k, 0, 'up', ppu * 0.5);
  }
}

/** How far a board centred at x with half-width `half` slides to stay on screen (it never leaves the post it stands on). */
function clampShift(x, half, cw) {
  const m = 8;
  let s = 0;
  if (x - half < m) s = m - (x - half);
  else if (x + half > cw - m) s = cw - m - (x + half);
  return Math.max(-half * 0.85, Math.min(half * 0.85, s));
}

function openBoard(ctx, p, ppu, cw, ch, view, x, bottom, k, rot, dir, keep) {
  const b = board(p, view.scheme, view.style, ppu, cw);
  const s = 0.7 + 0.3 * k;
  const shift = clampShift(x, (b.w / 2) * s, cw);
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.translate(x + shift, bottom);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.drawImage(b.c, -b.w / 2, -b.h);
  ctx.restore();
}

/**
 * A short prompt fixed to an object (no box): the words in bone with a dark edge and the glyphs in the HUD's look, bobbing
 * gently, its middle at world (x, y). `str` is rich text; `alpha` fades it.
 */
export function drawAnchorTag(ctx, camera, cw, ch, x, y, str, view, time, alpha = 1) {
  const ppu = camera.pxPerUnit;
  const sx = cw / 2 + (x - camera.x) * ppu, sy = ch / 2 + (y - camera.y) * ppu + Math.sin(time * 2.2) * ppu * 0.04;
  if (sx < -ppu * 4 || sx > cw + ppu * 4 || sy < -ppu * 2 || sy > ch + ppu * 2) return;
  const fs = Math.max(11, Math.round(ppu * 0.22));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = '700 ' + fs + 'px ' + FONT;
  const L = layoutRich(str, view.scheme, view.style, (s) => ctx.measureText(s).width, ppu * 6, fs * 0.8);
  // the words' dark edge first, then the line itself
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(16, 26, 30, 0.85)'; ctx.lineWidth = Math.max(2, fs * 0.28);
  const lh = fs * 1.7;
  L.lines.forEach((line, li) => {
    const x0 = sx - line.w / 2, yy = sy + li * lh;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const it of line.items) if (it.t === 'text') ctx.strokeText(it.s, x0 + it.x, yy);
  });
  ctx.fillStyle = '#efe6d6';
  drawRichLayout(ctx, L, sx, sy, lh, null, 'center');
  ctx.restore();
}

/** Test hook: how many boards are cached (a scheme switch makes new ones). */
export function boardCacheSize() { return boards.size; }
