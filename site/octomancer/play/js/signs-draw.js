// Controller Phase 2B: the signs of signs.js drawn in the world. A sign far from the octopus is the small plank with its label
// (the tutorial look since round 23); the open one unfolds into a wooden board with its title and the whole text, the
// controls burnt into the wood as the active scheme's glyphs (glyphs.js LOOK_WOOD). Boards are drawn once into a small
// cached canvas per (text, scheme, size) and blitted, so a frame costs one drawImage per open board.
// Also the small prompts fixed to an object (the mirror shell, a lit bomb, a grabbing tentacle): drawAnchorTag.

import { layoutRich, drawRichLayout } from './rich.js';
import { LOOK_WOOD } from './glyphs.js';
import { signText, placeBoard, signPosts, boardView } from './signs.js';

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

// Night batch 1 (IMPROVEMENTS.md #1): the open (or folding) boards are not drawn with the posts. drawSigns, in the world pass
// before the actors, draws the posts, the closed planks and the cord of an open board, and queues the board; drawSignBoards,
// called once after the octopus (main.js postOctoDraw), places each queued board clear of what it explains, of every octopus
// and of the other posts (signs.js placeBoard) and draws it over the actors. The board still hangs on its post: a cord runs from
// the post top (or the rope ends) to it whenever it has slid or risen off it.
const queue = []; // [{p, view, time, prompts, hidden}] the boards to draw this frame
let queueTime = NaN;
const CORD = '#4a3418';

/**
 * Draw the signs of a level. `open` = the prompt being read (or null); `view` = {scheme: 'desktop'|'pad'|'touch', style}.
 * Signs whose `when` the caller filtered out are skipped through `hidden(p)`. An open board is queued for drawSignBoards.
 */
export function drawSigns(ctx, camera, cw, ch, prompts, open, view, time, hidden = null) {
  if (!prompts || !prompts.length) return;
  if (time !== queueTime) { queue.length = 0; queueTime = time; } // a frame that was never flushed (no postOctoDraw) drops its boards
  const ppu = camera.pxPerUnit;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const p of prompts) {
    const target = p === open ? 1 : 0;
    const dt = p._t === undefined ? 1 : Math.max(0, Math.min(0.1, time - p._t));
    p._t = time;
    p._open = p._open === undefined ? target : p._open + Math.sign(target - p._open) * Math.min(Math.abs(target - p._open), dt / OPEN_S);
    if (hidden && hidden(p)) { p._open = 0; p._pl = null; continue; }
    if (drawOne(ctx, camera, cw, ch, p, ppu, time) && p._open > 0) queue.push({ p, view, time, prompts, hidden, open: p === open });
    else if (!(p._open > 0)) p._pl = null;
  }
  ctx.restore();
}

/** The world point a board hangs from: {x, y, dir} ('up' = its bottom sits there, a post top; 'down' = its top, the rope ends). */
function attachOf(p) {
  if (p.sign) return { x: p.sign[0] + 0.5, y: p.sign[1] + 1 - 0.78 + 0.2, dir: 'up', top: p.sign[1] + 1 - 0.78 };
  if (p.hang) return { x: p.hang[0] + 0.5, y: p.hang[1] + (p.hang[2] || 0.7), dir: 'down', top: p.hang[1] };
  return { x: p.anchor[0], y: p.anchor[1], dir: 'up', top: p.anchor[1] };
}

/** A post, a closed plank, a hung plank's ropes; true when the sign is near enough the view to show a board. */
function drawOne(ctx, camera, cw, ch, p, ppu, time) {
  const k = p._open || 0;
  const label = p.label || p.title || '';
  if (p.sign) {
    const bx = cw / 2 + (p.sign[0] + 0.5 - camera.x) * ppu;
    const floor = ch / 2 + (p.sign[1] + 1 - camera.y) * ppu;
    if (bx < -ppu * 6 || bx > cw + ppu * 6 || floor < -ppu * 2 || floor > ch + ppu * 6) return false;
    const signY = floor - ppu * 0.78;
    const postW = Math.max(2, ppu * 0.08);
    if (k > 0 && p._pl) cord(ctx, camera, cw, ch, ppu, p, bx, signY, k); // under the actors, like the post
    ctx.fillStyle = POST; ctx.strokeStyle = WOOD_EDGE; ctx.lineWidth = Math.max(1, ppu * 0.03);
    ctx.fillRect(bx - postW / 2, signY, postW, floor - signY);
    ctx.strokeRect(bx - postW / 2, signY, postW, floor - signY);
    const sway = Math.sin(time * 1.1 + p.sign[0] * 1.9) * 0.02;
    if (k < 1 && label) { ctx.save(); ctx.globalAlpha *= 1 - k; ctx.translate(bx, signY); ctx.rotate(sway); plank(ctx, label, ppu, k > 0); ctx.restore(); }
    return true;
  }
  if (p.hang) {
    const cx = cw / 2 + (p.hang[0] + 0.5 - camera.x) * ppu;
    const top = ch / 2 + (p.hang[1] - camera.y) * ppu;
    if (cx < -ppu * 6 || cx > cw + ppu * 6 || top < -ppu * 6 || top > ch + ppu) return false;
    if (k >= 1) return true; // the open board's ropes go with it (drawSignBoards)
    const drop = (p.hang[2] || 0.7) * ppu;
    const sway = Math.sin(time * 0.9 + p.hang[0]) * 0.015;
    let half = ppu * 0.6;
    if (label) { ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.27))}px ${FONT}`; half = (ctx.measureText(label).width + ppu * 0.36) / 2; }
    ctx.save(); ctx.globalAlpha *= 1 - k;
    ctx.strokeStyle = CORD; ctx.lineWidth = Math.max(1.5, ppu * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx - half * 0.7, top); ctx.lineTo(cx - half * 0.7, top + drop + 2);
    ctx.moveTo(cx + half * 0.7, top); ctx.lineTo(cx + half * 0.7, top + drop + 2);
    ctx.stroke();
    if (label) { ctx.translate(cx, top + drop + ppu * 0.21); ctx.rotate(sway); plank(ctx, label, ppu, k > 0); }
    ctx.restore();
    return true;
  }
  if (p.anchor) {
    const ax = cw / 2 + (p.anchor[0] - camera.x) * ppu, ay = ch / 2 + (p.anchor[1] - camera.y) * ppu;
    return !(ax < -ppu * 6 || ax > cw + ppu * 6 || ay < -ppu * 6 || ay > ch + ppu * 6);
  }
  return false;
}

/** The cord from a post top (screen bx, top) to the board's nearest bottom (or top) edge, when the board is off the post. */
function cord(ctx, camera, cw, ch, ppu, p, bx, top, k) {
  const r = p._pl, s = 0.7 + 0.3 * k;
  const X = (x) => cw / 2 + (x - camera.x) * ppu, Y = (y) => ch / 2 + (y - camera.y) * ppu;
  const cx = (r.x0 + r.x1) / 2, hw = ((r.x1 - r.x0) / 2) * s;
  const edge = r.up ? r.y1 : r.y0; // the edge the board hangs by
  const ex = X(Math.max(cx - hw + 0.25, Math.min(cx + hw - 0.25, (bx - cw / 2) / ppu + camera.x)));
  const ey = r.up ? Y(edge) - ppu * 0.08 : Y(edge) + ppu * 0.08;
  if (r.up && Math.abs(ex - bx) < 1.5 && ey >= top - ppu * 0.05) return; // it sits on the post: the post is its anchor
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.strokeStyle = CORD; ctx.lineWidth = Math.max(1.5, ppu * 0.035); ctx.lineCap = 'round';
  const sag = Math.min(ppu * 0.25, Math.hypot(ex - bx, ey - top) * 0.08);
  ctx.beginPath(); ctx.moveTo(bx, top); ctx.quadraticCurveTo((bx + ex) / 2, (top + ey) / 2 + sag, ex, ey); ctx.stroke();
  ctx.fillStyle = WOOD_EDGE; ctx.beginPath(); ctx.arc(bx, top, Math.max(1.5, ppu * 0.045), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * Draw the boards queued by drawSigns this frame, over the actors. `avoid` = {targets: [rects], discs: [{x, y}] (every
 * octopus), solid(tx, ty)?}; the board stays in the view and out from under the HUD corners (signs.js boardView).
 */
export function drawSignBoards(ctx, camera, cw, ch, avoid = null) {
  if (!queue.length) return;
  if (typeof avoid === 'function') avoid = avoid(); // (built only on a frame with a board)
  const ppu = camera.pxPerUnit;
  const cssW = ctx.canvas && ctx.canvas.clientWidth;
  const bv = boardView(camera.x, camera.y, ppu, cw, ch, cssW ? cw / cssW : 1), view = bv.view;
  const targets = ((avoid && avoid.targets) || []).concat(bv.hud), discs = (avoid && avoid.discs) || [], solid = (avoid && avoid.solid) || null;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const q of queue) {
    const p = q.p, k = p._open || 0;
    const b = board(p, q.view.scheme, q.view.style, ppu, cw);
    const a = attachOf(p);
    a.w = b.w / ppu; a.h = b.h / ppu;
    const posts = signPosts(q.prompts, p, q.hidden);
    // only the open board looks for its spot; a folding one stays where it was
    if (q.open || !p._pl) {
      const pick = placeBoard(a, targets, posts, discs, view, solid, p._pl);
      const dt = p._plT === undefined ? 1 : Math.max(0, Math.min(0.1, q.time - p._plT));
      p._plT = q.time;
      if (!p._pl || k < 0.05 || p._pl.w !== a.w) p._pl = { x0: pick.x0, y0: pick.y0, x1: pick.x1, y1: pick.y1, w: a.w, up: (a.dir === 'up') !== (pick.f === 1) };
      else { // glide to the new spot (no jump when the octopus swims into it)
        const e = 1 - Math.exp(-dt * 12), pl = p._pl;
        pl.x0 += (pick.x0 - pl.x0) * e; pl.y0 += (pick.y0 - pl.y0) * e;
        pl.x1 = pl.x0 + a.w; pl.y1 = pl.y0 + a.h; pl.up = (a.dir === 'up') !== (pick.f === 1);
      }
      p._pl.i = pick.i; p._pl.j = pick.j; p._pl.f = pick.f; p._pl.clear = pick.clear;
    }
    const r = p._pl, s = 0.7 + 0.3 * k;
    const X = (x) => cw / 2 + (x - camera.x) * ppu, Y = (y) => ch / 2 + (y - camera.y) * ppu;
    const sway = p.sign ? Math.sin(q.time * 1.1 + p.sign[0] * 1.9) * 0.01 : p.hang ? Math.sin(q.time * 0.9 + p.hang[0]) * 0.015 : 0;
    const px = X((r.x0 + r.x1) / 2), py = r.up ? Y(r.y1) : Y(r.y0); // the edge it unfolds from
    if (p.hang) { // its two ropes from the rock to the board's top corners
      const at = Y(a.top), hw = (b.w / 2) * s; // the ropes slide along the rock with the board (they hang straight)
      ctx.save(); ctx.globalAlpha *= k;
      ctx.strokeStyle = CORD; ctx.lineWidth = Math.max(1.5, ppu * 0.035);
      ctx.beginPath();
      for (const sx of [-1, 1]) { ctx.moveTo(px + sx * hw * 0.7, at); ctx.lineTo(px + sx * hw * 0.7, (r.up ? py - b.h * s : py) + 2); }
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha *= k;
    ctx.translate(px, py);
    ctx.rotate(sway);
    ctx.scale(s, s);
    ctx.drawImage(b.c, -b.w / 2, r.up ? -b.h : 0);
    ctx.restore();
  }
  ctx.restore();
  lastDrawn.length = 0;
  for (const q of queue) lastDrawn.push(q.p);
  queue.length = 0;
}
const lastDrawn = []; // the prompts whose boards the last drawSignBoards drew (test hook)

/** A prompt's open board size in tiles for a scheme at a zoom (the cached board). */
export function boardSize(p, scheme, style, ppu, cw) { const b = board(p, scheme, style, ppu, cw); return { w: b.w / ppu, h: b.h / ppu }; }

/** Test hook: the boards drawn by the last drawSignBoards (or the open ones of `prompts`) in world tiles: {title, x0, y0, x1, y1, open, clear}. */
export function boardRects(prompts = null) {
  return (prompts || lastDrawn).filter((p) => p._pl && p._open > 0).map((p) => ({ title: p.title, x0: p._pl.x0, y0: p._pl.y0, x1: p._pl.x1, y1: p._pl.y1, open: p._open, clear: p._pl.clear }));
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
