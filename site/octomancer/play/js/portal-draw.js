// r42: the portals (level exit, the hub's dive well, the shortcut rings) are Milan Svancara's Whirlpool sprite animation from the
// original game (octomancer-unity/Assets/Sprites/Elements/Whirlpool; img/v2/whirlpool-sheet.webp, made by
// octomancer-web/tools/export_whirlpool.py): the idle loop (WhirlpoolAnimation1-5, 12 fps), and when the octopus comes in the
// Bounce (10 frames) once and then the Rise (6 frames), as the .anim files give them.
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

// ---------------------------------------------------------------- sprite whirlpool (r42)

import { artImg } from './v2-art.js';
import { sharedCanvas, unshareCanvas } from './canvas-pool.js';

const CELL = 208, COLS = 7, FPS = 12;
const IDLE = [0, 5], BOUNCE = [5, 15], RISE = [15, 21]; // frame ranges in the sheet: [from, to)
const IDLE_PX = 167;       // the idle whirlpool's width in the sheet (557 px x 0.30), so a frame scales by (wanted px / IDLE_PX)
export const PORTAL_TILES = 2.2;   // the idle whirlpool is this many tiles wide
export const PORTAL_SQUASH = 0.5; // lying in the floor: seen at a slant, height / width

/** Light tints only (a wash over Milan's blue-grey, never a saturated colour): exit and hub dive none, the shortcut a little warm. */
export const PORTAL_TINTS = {
  none: null,
  warm: 'rgba(255,150,80,0.22)',  // the shortcut ring
  gold: 'rgba(255,205,110,0.18)', // Marlo's ring
};
// r43: a tinted frame is one 208 x 208 canvas made when it is first drawn (the whole tinted sheet was one 1456 x 624 canvas, 3.6 MB,
// bigger than a phone screen, and one per tint); they are dropped when a level is torn down (resetPortalStates)
const tinted = new Map(); // 'tint|frame' -> canvas
function frameFor(tint, frame) {
  const img = artImg('whirlpool');
  if (!img) return null;
  const wash = PORTAL_TINTS[tint];
  const sx = (frame % COLS) * CELL, sy = ((frame / COLS) | 0) * CELL;
  if (!wash) return { src: img, sx, sy };
  const key = tint + '|' + frame;
  let c = tinted.get(key);
  if (!c || c.img !== img) {
    const cv = sharedCanvas(document.createElement('canvas'));
    cv.width = CELL; cv.height = CELL;
    const g = cv.getContext('2d');
    g.drawImage(img, sx, sy, CELL, CELL, 0, 0, CELL, CELL);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = wash; g.fillRect(0, 0, CELL, CELL);
    tinted.set(key, c = { cv, img });
  }
  return { src: c.cv, sx: 0, sy: 0 };
}
export function whirlpoolReady() { return !!artImg('whirlpool'); }

// per-portal play state: idle until the octopus is close, then the Bounce once, then the Rise once, then idle (until it has left)
const states = new Map();
export const BOUNCE_S = (BOUNCE[1] - BOUNCE[0]) / FPS, RISE_S = (RISE[1] - RISE[0]) / FPS;
/** Frame index in the sheet for a portal at `key`, given the time and whether the octopus is near. */
export function portalFrame(key, time, near, far) {
  let st = states.get(key);
  if (!st) { st = { mode: 0, t0: 0 }; states.set(key, st); if (states.size > 12) states.delete(states.keys().next().value); }
  if (st.mode === 0 && near) { st.mode = 1; st.t0 = time; }
  if (st.mode === 1 && time - st.t0 >= BOUNCE_S) { st.mode = 2; st.t0 += BOUNCE_S; }
  if (st.mode === 2 && time - st.t0 >= RISE_S) { st.mode = 3; }
  if (st.mode === 3 && far) st.mode = 0;
  if (time < st.t0 - 0.5) st.mode = 0; // the clock went back (a new run)
  if (st.mode === 1) return BOUNCE[0] + Math.min(BOUNCE[1] - BOUNCE[0] - 1, Math.floor((time - st.t0) * FPS));
  if (st.mode === 2) return RISE[0] + Math.min(RISE[1] - RISE[0] - 1, Math.floor((time - st.t0) * FPS));
  return IDLE[0] + (Math.floor(time * FPS) % (IDLE[1] - IDLE[0]));
}
export function resetPortalStates() { states.clear(); for (const c of tinted.values()) unshareCanvas(c.cv); tinted.clear(); }

/**
 * Draw the sprite whirlpool. `w` is the width in px of the IDLE whirlpool (the Bounce frames are a little bigger, the Rise
 * starts small, as in the sheet); `squash` 1 = upright, PORTAL_SQUASH = lying in the floor. (cx, cy) is the centre.
 * Returns false when the sheet is not loaded (the caller draws the fallback).
 */
export function drawWhirlpoolSprite(ctx, cx, cy, w, squash, frame, tint) {
  const f = frameFor(tint, frame);
  if (!f) return false;
  const k = w / IDLE_PX;
  const dw = CELL * k, dh = CELL * k * squash;
  ctx.drawImage(f.src, f.sx, f.sy, CELL, CELL, cx - dw / 2, cy - dh / 2, dw, dh);
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
