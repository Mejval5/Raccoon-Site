// r42: the portals (level exit, the hub's dive well, the shortcut rings) are Milan Svancara's Whirlpool sprite animation from the
// original game (octomancer-unity/Assets/Sprites/Elements/Whirlpool; img/v2/whirlpool-sheet.webp, made by
// octomancer-web/tools/export_whirlpool.py): the idle loop (WhirlpoolAnimation1-5, 12 fps), and when the octopus comes in the
// Bounce (10 frames) and the Rise (6 frames), as the .anim files give them. r44: the Rise plays forward only when a portal appears (a
// level starts, a ring unlocks) and reversed only as the swallow when the octopus goes in; a Bounce from swimming near returns straight to idle.
// The code-drawn whirlpool of r41 (below) is kept only as the fallback while the sheet has not loaded.

// r41: the portals (level exit, the hub's dive well, the shortcut rings) as an animated whirlpool drawn in code, like the
// green vortex in the store screenshots (octomancer-web/reference/store/store-portals.png): spiral arms that turn, a dark
// centre, bubbles pulled in towards it and a soft glow. No art file: everything is a function of `time`.
//
// A floor portal lies flat in the opening: the same drawing squashed to a perspective ellipse. An upright portal (a niche in
// a wall) is drawn at full height. One colour set per hue, so the hub's dive well, the shortcut ring and Marlo's ring read as
// different doors of the same kind.

const TAU = Math.PI * 2;

/** Colour sets: [dark rim, deep, mid, bright, highlight, glow rgb]. */
export const WHIRL_TINTS = {
  green: { rim: '#0b4a22', deep: '#0f6a30', mid: '#1fa347', bright: '#4fe05f', hi: '#c6ffa8', glow: '70,235,110', core: '#031a0d' },
  teal: { rim: '#0a3e4e', deep: '#0e6a80', mid: '#1fa3b8', bright: '#4fdcf0', hi: '#c8f8ff', glow: '70,225,240', core: '#03161d' },
  violet: { rim: '#35124e', deep: '#5a2290', mid: '#8a3fd0', bright: '#c070ff', hi: '#ecd2ff', glow: '190,110,255', core: '#12041f' },
  amber: { rim: '#5a3006', deep: '#9a5a0e', mid: '#e09a22', bright: '#ffc84f', hi: '#fff0b8', glow: '255,200,90', core: '#1d0f02' },
};

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const ARMS = 4;
const STEPS = 22;

/**
 * Draw one whirlpool.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx centre x (px)
 * @param {number} cy centre y (px)
 * @param {number} R radius (px), the half width of the ellipse
 * @param {number} time seconds
 * @param {{tint?:string, flat?:boolean, phase?:number}} [o] flat: lies in the floor (squashed to a perspective ellipse); upright otherwise
 */
export function drawWhirlpoolCode(ctx, cx, cy, R, time, o = {}) {
  const t = WHIRL_TINTS[o.tint] || WHIRL_TINTS.green;
  const squash = o.flat === false ? 1 : 0.46;
  const phase = o.phase || 0;
  const spin = -(time * 1.7 + phase); // arms wind inwards: the pattern turns the way it flows
  ctx.save();
  // the glow: drawn first, unsquashed and wide, so the portal lights the water round it
  const pulse = 0.5 + 0.5 * Math.sin(time * 2 + phase);
  const gr = R * (2.0 + 0.12 * pulse);
  const g = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, gr);
  g.addColorStop(0, `rgba(${t.glow},0.55)`);
  g.addColorStop(0.45, `rgba(${t.glow},0.2)`);
  g.addColorStop(1, `rgba(${t.glow},0)`);
  ctx.fillStyle = g;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, squash < 1 ? 0.6 : 1); ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill(); ctx.restore();

  ctx.translate(cx, cy);
  ctx.scale(1, squash);
  const lw = Math.max(1.2, R * 0.045); // line widths are in the squashed space: keep them thin and even
  // the pool: a dark disc whose edge feathers into the water
  const base = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R * 1.02);
  base.addColorStop(0, t.core);
  base.addColorStop(0.35, t.deep);
  base.addColorStop(0.85, rgba(t.mid, 0.55));
  base.addColorStop(1, rgba(t.mid, 0));
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.02, 0, TAU); ctx.fill();

  // spiral arms: tapered blades along a logarithmic spiral, pointed at both ends, fattest two thirds out
  ctx.lineJoin = 'round';
  for (let k = 0; k < ARMS; k++) {
    const a0 = spin + (k * TAU) / ARMS;
    const edge = [], mid = [];
    for (let i = 0; i <= STEPS; i++) {
      const f = i / STEPS;                      // along the blade
      const r = R * (0.14 + 0.86 * f);
      const ang = a0 + (1 - f) * 4.2;           // the blade curls the more the nearer the centre
      const w = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 0.97 + 0.03)), 0.85) * (0.3 + 0.7 * f);
      edge.push([Math.cos(ang + w) * r, Math.sin(ang + w) * r, Math.cos(ang - w * 0.45) * r, Math.sin(ang - w * 0.45) * r]);
      mid.push([Math.cos(ang + w * 0.3) * r, Math.sin(ang + w * 0.3) * r]);
    }
    ctx.beginPath();
    ctx.moveTo(edge[0][0], edge[0][1]);
    for (let i = 1; i <= STEPS; i++) ctx.lineTo(edge[i][0], edge[i][1]);
    for (let i = STEPS; i >= 0; i--) ctx.lineTo(edge[i][2], edge[i][3]);
    ctx.closePath();
    ctx.fillStyle = k % 2 ? t.bright : t.mid;
    ctx.fill();
    ctx.strokeStyle = t.rim; ctx.lineWidth = lw; ctx.stroke();
    // a light streak along the blade
    ctx.beginPath();
    for (let i = 4; i <= STEPS - 3; i++) { const p = mid[i]; if (i === 4) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    ctx.strokeStyle = t.hi; ctx.lineWidth = lw * 0.8; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
  }

  // the dark centre, with its own slow throb
  const cr = R * (0.24 + 0.02 * pulse);
  const hole = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * 1.6);
  hole.addColorStop(0, '#000');
  hole.addColorStop(0.6, t.core);
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hole;
  ctx.beginPath(); ctx.arc(0, 0, cr * 1.6, 0, TAU); ctx.fill();

  // a thin lip where the water goes down: a dark ring with a bright one inside it, faint, so the edge stays soft
  ctx.strokeStyle = t.rim; ctx.lineWidth = lw * 1.2; ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.99, 0, TAU); ctx.stroke();
  ctx.strokeStyle = t.bright; ctx.lineWidth = lw * 0.6; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.94, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;

  // bubbles pulled inwards: each starts outside the rim, curls round and shrinks into the centre
  ctx.fillStyle = t.hi;
  for (let i = 0; i < 9; i++) {
    const p = (time * 0.32 + i / 9 + phase * 0.1) % 1;
    const r = R * (1.25 - 1.1 * p * p);
    const ang = spin * 0.9 + i * 2.399 + p * 3.4;
    const sz = Math.max(1.2, R * 0.085 * (1 - p * 0.8));
    ctx.globalAlpha = Math.min(1, p * 5) * (1 - p) * 0.9;
    ctx.beginPath(); ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, sz, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------- sprite whirlpool (r42, r44)

import { artBitmap, whirlpoolSheetKey } from './v2-art.js';
import { sharedCanvas, unshareCanvas } from './canvas-pool.js';
import { WHIRL_SHEETS } from './whirlpool-meta.js';

const COLS = 7, FPS = 12;
const IDLE = [0, 5], BOUNCE = [5, 15], RISE = [15, 21]; // frame ranges in the sheet: [from, to)
// r44: two sheets (octomancer-web/tools/export_whirlpool.py, js/whirlpool-meta.js): the normal one for most screens, a 0.55-scale one for a
// DPR >= 2 desktop. Every number that depends on the scale (cell size, the idle width, each frame's visible bottom) comes from the sheet's own meta.
let sheetKey = null, SH = null;
function sheetMeta() { const k = whirlpoolSheetKey(); if (k !== sheetKey) { sheetKey = k; SH = WHIRL_SHEETS[k] || WHIRL_SHEETS.lo; } return SH; }
const mean = (a, from, to) => { let t = 0; for (let i = from; i < to; i++) t += a[i]; return t / (to - from); };
export const PORTAL_TILES = 2.2;   // the idle whirlpool is this many tiles wide
export const PORTAL_SQUASH = 0.5; // lying in the floor: seen at a slant, height / width
/** How far the visible bottom of a seated frame sinks below the floor line, in tiles: the rim of a lying whirlpool touches the rock, it does not hover over it. */
export const PORTAL_SEAT = 0.03;

/** r44: the tints. They colour only the LIGHT arms (a hue shift on the light pixels, in proportion to how light they are); the dark core and the dark arms stay neutral, so the ring does not turn muddy brown. `mul` is the colour the light pixels move towards, `k` how far. */
export const PORTAL_TINTS = {
  none: null,
  warm: { mul: [1.0, 0.66, 0.42], k: 0.7 },  // the shortcut ring
  gold: { mul: [1.0, 0.84, 0.40], k: 0.7 },  // Marlo's ring
};
const LIGHT_LO = 105, LIGHT_HI = 185; // luminance (0-255) where a pixel starts / finishes counting as 'light arm'

// r43: a tinted frame is one cell-sized canvas made when it is first drawn; they are dropped when a level is torn down (resetPortalStates)
const tinted = new Map(); // 'tint|frame' -> {cv, img}
function tintedCell(src, sx, sy, cell, tint) {
  const t = PORTAL_TINTS[tint];
  const cv = sharedCanvas(document.createElement('canvas'));
  cv.width = cell; cv.height = cell;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, sx, sy, cell, cell, 0, 0, cell, cell);
  const id = g.getImageData(0, 0, cell, cell), d = id.data;
  const lum = t.mul[0] * 0.3 + t.mul[1] * 0.59 + t.mul[2] * 0.11;
  const mr = t.mul[0] / lum, mg = t.mul[1] / lum, mb = t.mul[2] / lum;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    if (l <= LIGHT_LO) continue;
    const w = (l >= LIGHT_HI ? 1 : (l - LIGHT_LO) / (LIGHT_HI - LIGHT_LO)) * t.k;
    d[i] += (Math.min(255, l * mr) - d[i]) * w;
    d[i + 1] += (Math.min(255, l * mg) - d[i + 1]) * w;
    d[i + 2] += (Math.min(255, l * mb) - d[i + 2]) * w;
  }
  g.putImageData(id, 0, 0);
  return cv;
}
function frameFor(tint, frame) {
  const bmp = artBitmap('whirlpool');
  if (!bmp) return null;
  const sh = sheetMeta(), cell = sh.cell;
  const sx = (frame % COLS) * cell, sy = ((frame / COLS) | 0) * cell;
  if (!PORTAL_TINTS[tint]) return { src: bmp, sx, sy };
  const key = tint + '|' + frame;
  let c = tinted.get(key);
  if (!c || c.img !== bmp) {
    if (c) unshareCanvas(c.cv);
    tinted.set(key, c = { cv: tintedCell(bmp, sx, sy, cell, tint), img: bmp });
  }
  return { src: c.cv, sx: 0, sy: 0 };
}
/** True once the sheet is decoded and can be drawn without a first-use decode (the level's fade-in waits for it). */
export function whirlpoolReady() { return !!artBitmap('whirlpool'); }

// ---- the play state of one portal ----
// APPEAR  the Rise, forward, once: when the portal appears (the level starts, a ring unlocks)
// IDLE    the idle loop; the octopus swimming near (not in) starts NEAR once, then back to IDLE until it has gone away
// NEAR    the Bounce once, then straight back to the idle loop (no Rise)
// ENTER   the octopus went in: the Bounce, forced; then SWALLOW: the Rise reversed (the pool closes over it); then GONE (the last frame)
const M_APPEAR = 0, M_IDLE = 1, M_NEAR = 2, M_ENTER = 3, M_SWALLOW = 4, M_GONE = 5;
const states = new Map();
export const BOUNCE_S = (BOUNCE[1] - BOUNCE[0]) / FPS, RISE_S = (RISE[1] - RISE[0]) / FPS;
/** How long the entry sequence takes from the moment the octopus touches the whirlpool: the Bounce, then the swallow. */
export const ENTRY_S = BOUNCE_S + RISE_S;
export const portalKey = (tx, ty) => tx + ',' + ty;
let held = false;
/** While the new level is baked behind the dark screen the appear clock does not start: the Rise plays once the screen is back. */
export function setPortalHold(h) { held = !!h; }
function stateOf(key, time) {
  let st = states.get(key);
  if (!st) { st = { mode: M_APPEAR, t0: held ? null : time, armed: false, entered: undefined }; states.set(key, st); if (states.size > 12) states.delete(states.keys().next().value); }
  else if (st.t0 === null && !held) st.t0 = time;
  return st;
}
/** Make the state exist (so the appear clock starts) even if the portal is not drawn this frame (it is far off screen). */
export function portalTouch(key, time) { stateOf(key, time); }
/** The octopus has touched this portal: play the Bounce now whatever it was doing, then the swallow. */
export function portalEnter(key, time) { const st = stateOf(key, time); st.mode = M_ENTER; st.t0 = time; st.entered = time; }
/** Which mode a portal is in, as a word (tests). */
export function portalMode(key) { const st = states.get(key); return st ? ['appear', 'idle', 'near', 'enter', 'swallow', 'gone'][st.mode] : null; }
/** Frame index in the sheet for a portal at `key`, given the time and whether the octopus is near / far. */
export function portalFrame(key, time, near, far) {
  const st = stateOf(key, time);
  if (st.t0 === null) return RISE[0]; // held: the first Rise frame, the clock not started
  if (time < st.t0 - 0.5) { st.mode = M_IDLE; st.t0 = time; st.armed = true; } // the clock went back (a new run)
  if (st.mode === M_APPEAR && time - st.t0 >= RISE_S) { st.mode = M_IDLE; st.armed = !!near; }
  if (st.mode === M_IDLE) { if (st.armed) { if (far) st.armed = false; } else if (near) { st.mode = M_NEAR; st.t0 = time; } }
  if (st.mode === M_NEAR && time - st.t0 >= BOUNCE_S) { st.mode = M_IDLE; st.armed = true; } // straight back to the idle loop
  if (st.mode === M_ENTER && time - st.t0 >= BOUNCE_S) { st.mode = M_SWALLOW; st.t0 += BOUNCE_S; }
  if (st.mode === M_SWALLOW && time - st.t0 >= RISE_S) st.mode = M_GONE;
  const el = time - st.t0;
  switch (st.mode) {
    case M_APPEAR: return RISE[0] + Math.min(RISE[1] - RISE[0] - 1, Math.floor(el * FPS));
    case M_NEAR: case M_ENTER: return BOUNCE[0] + Math.min(BOUNCE[1] - BOUNCE[0] - 1, Math.floor(el * FPS));
    case M_SWALLOW: return RISE[1] - 1 - Math.min(RISE[1] - RISE[0] - 1, Math.floor(el * FPS));
    case M_GONE: return RISE[0];
    default: return IDLE[0] + (Math.floor(time * FPS) % (IDLE[1] - IDLE[0]));
  }
}
export function resetPortalStates() { states.clear(); for (const c of tinted.values()) unshareCanvas(c.cv); tinted.clear(); }

/** Scale of a sprite frame for an idle whirlpool `w` px wide: px per sheet px. */
function scaleFor(w) { return w / sheetMeta().idlePx; }
/** The idle whirlpool's height in px for a width `w` and a squash (the visible part of the first idle frames). */
export function idleHeightPx(w, squash) { const sh = sheetMeta(); return (mean(sh.bottoms, IDLE[0], IDLE[1]) - mean(sh.tops, IDLE[0], IDLE[1])) * scaleFor(w) * squash; }
/** Where a frame's visible bottom lies, in px, relative to its cell's centre (tests, and the seat of a frame). */
export function frameBottomPx(frame, w, squash) { const sh = sheetMeta(); return (sh.bottoms[frame] - sh.cell / 2) * scaleFor(w) * squash; }

/**
 * Draw the sprite whirlpool. `w` is the width in px of the IDLE whirlpool (the Bounce frames are a little bigger, the Rise
 * starts small, as in the sheet); `squash` 1 = upright, PORTAL_SQUASH = lying in the floor. (cx, seatY) is where the frame's own
 * visible bottom goes: r44, every frame is seated by its stored visible bottom, so the Bounce frames (which sit lower in their
 * cells than the idle ones) and the idle ones all rest on the same line instead of lifting and hovering.
 * Returns false when the sheet is not decoded yet (the caller draws the fallback).
 */
export function drawWhirlpoolSprite(ctx, cx, seatY, w, squash, frame, tint) {
  const f = frameFor(tint, frame);
  if (!f) return false;
  const sh = sheetMeta(), cell = sh.cell;
  const k = scaleFor(w);
  const dw = cell * k, dh = cell * k * squash;
  ctx.drawImage(f.src, f.sx, f.sy, cell, cell, cx - dw / 2, seatY - sh.bottoms[frame] * k * squash, dw, dh);
  return true;
}

/**
 * Where a portal goes (tile units), measured from the tiles so it never overlaps rock.
 * Lying in the floor: it rests on the first solid tile within 2 below the marker tile, in the open water span of that row
 * (water above, rock under it), and its width is capped to that span. With no floor (a niche in a wall) it stands upright
 * in the open span of its own row, capped to the free width and height.
 * @returns {{flat:boolean, w:number, cx:number, floorY:number, cy:number}} w = idle width, cx = centre x, floorY = the floor line (flat) , cy = centre y (upright)
 */
export function portalPlace(tileAt, tx, ty) {
  const solid = (x, y) => tileAt(x, y) !== 0;
  let row = ty, flat = false, floorY = ty + 1;
  for (let d = 1; d <= 2; d++) if (solid(tx, ty + d)) { row = ty + d - 1; floorY = ty + d; flat = true; break; }
  const open = flat ? (x) => !solid(x, row) && solid(x, row + 1) : (x) => !solid(x, row);
  let L = 0, R = 0;
  while (L < 3 && open(tx - 1 - L)) L++;
  while (R < 3 && open(tx + 1 + R)) R++;
  let avail = L + R + 1;
  if (!flat) { // upright: also the free height in this column
    let u = 0, dn = 0;
    while (u < 3 && !solid(tx, row - 1 - u)) u++;
    while (dn < 3 && !solid(tx, row + 1 + dn)) dn++;
    avail = Math.min(avail, u + dn + 1);
  }
  const want = flat ? PORTAL_TILES : 2.0;
  const w = Math.min(want, avail / 1.2); // the Bounce frames are up to 1.2x the idle one
  const left = tx - L, right = tx + R + 1, margin = Math.min(avail, w * 1.2) / 2;
  const cx = Math.min(Math.max(tx + 0.5, left + margin), right - margin);
  return { flat, w, cx, floorY, cy: row + 0.5 };
}

/** r44: the centre of the idle whirlpool in tile units (where the entering octopus is pulled to), the same place drawV2Marks seats it. */
export function portalCenter(tileAt, tx, ty) {
  const pl = portalPlace(tileAt, tx, ty);
  if (!pl.flat) return { x: pl.cx, y: pl.cy };
  return { x: pl.cx, y: pl.floorY + PORTAL_SEAT - idleHeightPx(pl.w, PORTAL_SQUASH) / 2 };
}
