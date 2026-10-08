// Octopus skins, drawing side (2026-10-08; the table is skins.js). Two rules from OWNERS.md hold here:
//  - a skin's recoloured sheet is built ONCE, offscreen, a few frames at a time (no long task), and kept as one ImageBitmap per
//    skin; nothing is tinted per frame and the game canvas is never read back (getImageData only ever runs on the small work canvas);
//  - only the worn skin's sheet stays alive (switching frees the old one with bitmap.close()); the picker and the journal plates
//    use small single-frame previews (one 160 px canvas per skin, counted as shared canvases).
// The eyes are not in the tinted sheet: octopus-draw.js keeps drawing them from Milan's sheet, so every eye state (open, blink,
// angry, the crossed-out X) is the same on every skin. Accessories are sprites from img/v2/skins.webp drawn at the eye anchors.

import { skinById, DEFAULT_SKIN } from './skins.js';
import { SKIN_ATLAS } from './skin-atlas.js';
import { sharedCanvas } from './canvas-pool.js';

const BASE = [192, 80, 96]; // the base pink of Milan's octopus (octopus-draw.js BODY #c05060)
const BASE_L = 0.299 * BASE[0] + 0.587 * BASE[1] + 0.114 * BASE[2];
export const FRAMES_PER_TICK = 6; // cells recoloured per task while a sheet builds (42 cells: 7 short tasks)

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// The look worn now (octopus-draw.js setOctopusSkin sets it): the code-drawn bits of the octopus (the hand's reaching arm, the
// gib chunks) take its colours from wornColors().
let worn = DEFAULT_SKIN;
let wornCol = { body: '#c05060', dark: '#904050' };
export function setWornSkin(id) {
  worn = id;
  const b = skinById(id).body;
  if (!b) { wornCol = { body: '#c05060', dark: '#904050' }; return; }
  const [r, g, bl] = hexRgb(b), d = (v) => Math.round(v * 0.74).toString(16).padStart(2, '0');
  wornCol = { body: b, dark: '#' + d(r) + d(g) + d(bl) };
}
export function wornSkinId() { return worn; }
/** {body, dark}: the worn look's colours (Milan's pink and its shade by default). */
export function wornColors() { return wornCol; }

/** The colour the body-coloured socket patch under a closed eye takes for this skin (octopus-draw.js paints it). */
export function skinBodyColor(id) {
  const s = skinById(id);
  return s.body || '#c05060';
}

/** Recolour RGBA pixels in place: every pixel keeps its brightness relative to the base pink, in the skin's colour. */
export function recolorPixels(px, body) {
  const [br, bg, bb] = hexRgb(body);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / BASE_L;
    if (l <= 1) { px[i] = br * l; px[i + 1] = bg * l; px[i + 2] = bb * l; } else {
      const k = Math.min(1, (l - 1) * 0.8); // lighter than the base (a highlight): toward a pale tint of the colour, never white
      px[i] = br + (235 - br) * k; px[i + 1] = bg + (232 - bg) * k; px[i + 2] = bb + (222 - bb) * k;
    }
  }
}

/**
 * The head frame of a cell from its eye anchors (cell pixels): centre between the eyes, `ux, uy` along the eye line (left to
 * right eye), `vx, vy` up out of the head, `d` the eye spacing.
 */
export function headFrame(anchors) {
  const L = anchors.left, R = anchors.right;
  let ux = R.x - L.x, uy = R.y - L.y;
  const d = Math.hypot(ux, uy) || 1;
  ux /= d; uy /= d;
  return { cx: (L.x + R.x) / 2, cy: (L.y + R.y) / 2, ux, uy, vx: uy, vy: -ux, d };
}

/** Pattern marks on the mantle of one cell (drawn source-atop: only on the body's own pixels). */
function drawPattern(g, pat, hf) {
  const P = (u, v) => [hf.cx + (hf.ux * u + hf.vx * v) * hf.d, hf.cy + (hf.uy * u + hf.vy * v) * hf.d];
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = pat.alpha;
  g.fillStyle = pat.color; g.strokeStyle = pat.color; g.lineCap = 'round';
  const s = hf.d;
  if (pat.kind === 'scales') { // overlapping half-moon fish scales over the crown and the cheeks, clear of the eyes
    const rows = [[0.75, [-0.6, -0.2, 0.2, 0.6]], [1.05, [-0.4, 0, 0.4]], [0.45, [-0.95, 0.95]], [1.3, [-0.2, 0.2]], [-0.45, [-0.2, 0.2]]];
    g.lineWidth = s * 0.07;
    for (const [v, us] of rows) for (const u of us) {
      const [x, y] = P(u, v);
      const a = Math.atan2(hf.vy, hf.vx);
      g.beginPath(); g.arc(x, y, s * 0.16, a + Math.PI * 0.15, a + Math.PI * 0.85, true); g.stroke();
      g.beginPath(); g.arc(x, y + 0, s * 0.05, 0, Math.PI * 2); g.fill();
    }
  } else if (pat.kind === 'quill') { // two long quill-pen strokes curling over the mantle and a few ink dots
    g.lineWidth = s * 0.12;
    for (const sgn of [-1, 1]) {
      const a = P(sgn * 0.08, 1.35), b = P(sgn * 0.6, 1.2), c = P(sgn * 0.66, 0.55);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); g.stroke();
      const e = P(sgn * 0.3, 1.22), f = P(sgn * 0.45, 0.98);
      g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(e[0], e[1]); g.lineTo(f[0], f[1]); g.stroke(); g.lineWidth = s * 0.12;
    }
    for (const [u, v, r] of [[0, 0.95, 0.07], [0.3, 0.7, 0.045], [-0.32, 0.62, 0.05], [0.05, -0.55, 0.05]]) { const [x, y] = P(u, v); g.beginPath(); g.arc(x, y, s * r, 0, Math.PI * 2); g.fill(); }
  } else if (pat.kind === 'rings') { // sea-horse ring marks: two under the eyes, one across the brow (the hat covers the crown)
    g.lineWidth = s * 0.11;
    for (const v of [-0.42, -0.72, 0.62]) {
      const w = v > 0 ? 1.2 : 1.25 + v * 0.3;
      const a = P(-w, v + 0.1), m = P(0, v - 0.12), b = P(w, v + 0.1);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(m[0], m[1], b[0], b[1]); g.stroke();
    }
  }
  g.restore();
}

// --- the worn skin's sheet ---------------------------------------------------------------------------------------------------
let sheet = null;     // { id, bitmap | null (building), canvas (while building), next: cell index, cancel }
let built = 0;        // test counter: sheets finished
let tintCalls = 0;    // test counter: recolorPixels runs (one per cell per build; never per frame)
let workCanvas = null, workCtx = null;
function work(cell) {
  if (!workCanvas) { workCanvas = document.createElement('canvas'); workCtx = workCanvas.getContext('2d', { willReadFrequently: true }); }
  if (workCanvas.width !== cell) { workCanvas.width = cell; workCanvas.height = cell; }
  return workCtx;
}

/** Recolour one cell of Milan's sheet into `out` at (ox, oy). */
function tintCell(out, img, data, frame, s, ox, oy) {
  const cell = data.cellSize;
  const g = work(cell);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, cell, cell);
  g.drawImage(img, frame * cell, 0, cell, cell, 0, 0, cell, cell);
  const id = g.getImageData(0, 0, cell, cell); // the small work canvas, never the game canvas
  recolorPixels(id.data, s.body);
  tintCalls++;
  g.putImageData(id, 0, 0);
  if (s.pattern) {
    const clip = frameClip(data, frame);
    const an = clip && data.eyeAnchors[clip.key] && data.eyeAnchors[clip.key][clip.local];
    if (an && an.left && an.right) drawPattern(g, s.pattern, headFrame(an));
  }
  out.drawImage(workCanvas, 0, 0, cell, cell, ox, oy, cell, cell);
}

/** Which clip / frame-in-clip a sheet cell belongs to. */
export function frameClip(data, frame) {
  for (const key of Object.keys(data.clips)) { const c = data.clips[key]; if (frame >= c.start && frame < c.start + c.count) return { key, local: frame - c.start }; }
  return null;
}

/**
 * The tinted body sheet of the worn skin, or null while it builds (draw Milan's sheet meanwhile) or for the default skin.
 * `bake` = {img, data} from octopus-draw.js. The first call for a skin starts the build; it runs FRAMES_PER_TICK cells per task.
 */
export function skinSheet(id, bake) {
  if (!id || id === DEFAULT_SKIN || !bake) { if (sheet && (!id || id === DEFAULT_SKIN)) dropSheet(); return null; }
  if (sheet && sheet.id === id) return sheet.bitmap || sheet.canvasReady || null;
  dropSheet();
  startBuild(id, bake);
  return null;
}
function dropSheet() {
  if (!sheet) return;
  sheet.cancel = true;
  if (sheet.bitmap && sheet.bitmap.close) sheet.bitmap.close();
  if (sheet.canvas) { sheet.canvas.width = 0; sheet.canvas.height = 0; }
  sheet = null;
}
function startBuild(id, bake) {
  const s = skinById(id);
  const { img, data } = bake;
  const frames = data.frameCount;
  const c = document.createElement('canvas');
  c.width = frames * data.cellSize; c.height = data.cellSize;
  const st = { id, bitmap: null, canvasReady: null, canvas: c, next: 0, cancel: false };
  sheet = st;
  const g = c.getContext('2d');
  const tick = () => {
    if (st.cancel) return;
    const end = Math.min(frames, st.next + FRAMES_PER_TICK);
    for (; st.next < end; st.next++) tintCell(g, img, data, st.next, s, st.next * data.cellSize, 0);
    if (st.next < frames) { setTimeout(tick, 0); return; }
    built++;
    const done = (b) => {
      if (st.cancel) { if (b && b.close) b.close(); return; }
      st.bitmap = b; st.canvasReady = null; c.width = 0; c.height = 0; st.canvas = null; // the bitmap holds it now: the canvas is freed
    };
    if (typeof createImageBitmap === 'function') { st.canvasReady = c; createImageBitmap(c).then(done, () => { st.canvasReady = c; }); } else st.canvasReady = c;
  };
  setTimeout(tick, 0);
}
/** Tests / memory: the worn sheet's state and bytes. */
export function skinSheetStats() {
  const cell = sheet ? (sheet.bitmap ? sheet.bitmap.height : sheet.canvas ? sheet.canvas.height : 0) : 0;
  const w = sheet ? (sheet.bitmap ? sheet.bitmap.width : sheet.canvas ? sheet.canvas.width : 0) : 0;
  return { id: sheet ? sheet.id : DEFAULT_SKIN, ready: !!(sheet && (sheet.bitmap || sheet.canvasReady)), sheets: sheet ? 1 : 0, bytes: w * cell * 4, built, tintCalls,
    previews: previews.size, previewBytes: [...previews.values()].reduce((a, p) => a + p.width * p.height * 4, 0) };
}

// --- accessories ---------------------------------------------------------------------------------------------------------
let atlas = null; // the decoded img/v2/skins.webp (ImageBitmap or <img>)
let atlasLoading = false;
const atlasListeners = [];
export function ensureSkinAtlas() {
  if (atlas || atlasLoading || typeof Image === 'undefined') return;
  atlasLoading = true;
  const im = new Image();
  im.onload = () => {
    const fin = (b) => { atlas = b || im; for (const fn of atlasListeners) fn(); };
    if (typeof createImageBitmap === 'function') createImageBitmap(im).then(fin, () => fin(null)); else fin(null);
  };
  im.onerror = () => { atlasLoading = false; };
  im.src = new URL('../img/v2/skins.webp', import.meta.url).href;
}
export function onSkinArtReady(fn) { atlasListeners.push(fn); }
export function skinAtlasReady() { return !!atlas; }

/** Draw a sprite of the skins atlas centred at (x, y), `w` wide (local units), rotated by `rot`. */
export function drawSkinSprite(ctx, name, x, y, w, rot = 0) {
  const r = SKIN_ATLAS[name];
  if (!r || !atlas) return false;
  const h = w * r[3] / r[2];
  ctx.save();
  ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.drawImage(atlas, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

/**
 * The skin's accessory on a body frame. `anchors` = the frame's eye anchors in cell pixels, `toWorld` cell px -> local units,
 * `cell` the cell size, `eyeW` the open eye's width in local units. Drawn after the eyes (the monocle sits over one).
 */
export function drawAccessory(ctx, id, anchors, cell, toWorld, eyeW) {
  const s = skinById(id);
  if (!s.acc || !anchors || !anchors.left || !anchors.right) return;
  ensureSkinAtlas();
  const hf = headFrame(anchors);
  const a = s.acc;
  let cx = hf.cx, cy = hf.cy;
  if (a.at === 'rightEye') { cx = anchors.right.x; cy = anchors.right.y; }
  const px = cx + (hf.ux * a.dx + hf.vx * a.dy) * hf.d, py = cy + (hf.uy * a.dx + hf.vy * a.dy) * hf.d;
  const tilt = Math.atan2(hf.uy, hf.ux) + (a.rot || 0);
  drawSkinSprite(ctx, a.sprite, (px - cell / 2) * toWorld, (py - cell / 2) * toWorld, eyeW * a.w, tilt);
}

// --- previews (picker, journal plates) ----------------------------------------------------------------------------------------
const previews = new Map(); // skin id -> 160 px canvas (idle frame 0, tinted, pattern, accessory; no eyes: the caller adds them)
/** A cell-sized canvas with the skin's idle body (pattern included), or null before the bake is in. Built once per skin. */
export function skinPreviewBody(id, bake) {
  if (!bake) return null;
  let c = previews.get(id);
  if (c) return c;
  const { img, data } = bake;
  const cell = data.cellSize;
  c = sharedCanvas(document.createElement('canvas'));
  c.width = cell; c.height = cell;
  const g = c.getContext('2d');
  const frame = data.clips.idle ? data.clips.idle.start : 0;
  const s = skinById(id);
  if (s.body) tintCell(g, img, data, frame, s, 0, 0); else g.drawImage(img, frame * cell, 0, cell, cell, 0, 0, cell, cell);
  previews.set(id, c);
  return c;
}
