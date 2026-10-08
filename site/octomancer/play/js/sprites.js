// Round 46 art pass: the packed sprite atlas img/v2/sprites.webp (people, loot, items, hazards; see octomancer-web/ASSETS.md and
// tools/export_r46_sprites.py). One image, fetched the first time anything asks for a sprite (endless mode never does), decoded
// once off the main thread and warmed into a 1 x 1 canvas so its first real draw is not a decode. Until it has loaded every
// caller falls back to its old code drawing.
//
// Corpses and other owners: drawSprite takes a rotation and a flip, so a sprite can be laid down limp (rot = +-PI/2) as is.

import { ATLAS_RECTS } from './sprite-atlas.js';
import { ATLAS_R3_RECTS, ATLAS_R3_META } from './sprite-atlas-r3.js';
import { decodeBitmap } from './v2-art.js';

// Two atlases: the first (people, loot, items, hazards) and round 3 (giant clam, limb, drops, ink, bomb). Each has its own image,
// ready flag and rect table; a name is drawable once its own atlas is ready.
const atlases = [
  { file: 'sprites.webp', rects: ATLAS_RECTS, img: null, ready: false },
  { file: 'sprites-r3.webp', rects: ATLAS_R3_RECTS, img: null, ready: false },
];
const listeners = [];

function loadAtlas(at) {
  if (at.img || typeof Image === 'undefined') return;
  at.img = new Image();
  at.img.addEventListener('load', () => {
    const done = () => {
      try { const c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').drawImage(at.img, 0, 0, 1, 1); } catch (e) { /* drawn at first use */ }
      at.ready = true;
      if (atlases.every((a) => a.ready)) { const fs = listeners.splice(0); for (const f of fs) f(); }
    };
    // vibe fixes: the atlas is drawn from a decoded ImageBitmap (an <img> can be dropped from the browser's decode cache and decoded
    // again inside a frame, a 50-80 ms task on a phone at 4x), decoded off the main thread (v2-art.js decodeBitmap); the <img> is the fallback
    const src = at.img;
    decodeBitmap(src).then((b) => { at.img = b; done(); }, () => { if (src.decode) src.decode().then(done, done); else done(); });
  }, { once: true });
  at.img.src = new URL('../img/v2/' + at.file, import.meta.url).href;
}
function load() { for (const at of atlases) loadAtlas(at); }
function find(name) {
  load();
  for (const at of atlases) { const r = at.rects[name]; if (r) return at.ready ? { r, img: at.img } : null; }
  return null;
}

/** Start loading the atlases (idempotent). */
export function ensureSprites() { load(); }
/** Called once both atlases are ready (the journal clears its cached plates, a HUD redraws). */
export function onSpritesReady(fn) { if (atlases.every((a) => a.ready)) fn(); else listeners.push(fn); }
export function spritesReady() { load(); return atlases.every((a) => a.ready); }

/** The rect [x, y, w, h] of sprite `name` in its atlas, or null when there is no such sprite or its atlas is not loaded yet. */
export function spriteRect(name) { const f = find(name); return f ? f.r : null; }
/** Anchors of a round 3 sprite (see sprite-atlas-r3.js), or null. */
export function spriteMeta(name) { return ATLAS_R3_META[name] || null; }

/**
 * Draw sprite `name` with its anchor at (x, y): `ax`, `ay` are the anchor as fractions of the sprite (0.5, 1 = bottom centre).
 * The size is `w` device px wide (h follows the aspect) or, with w = 0, `h` px tall. `rot` turns it about the anchor, `flip`
 * mirrors it left-right. Returns false (draws nothing) until the atlas is ready.
 */
export function drawSprite(ctx, name, x, y, w, h = 0, ax = 0.5, ay = 1, rot = 0, flip = false) {
  const f = find(name);
  if (!f) return false;
  const r = f.r, img = f.img;
  const dw = w || (h * r[2] / r[3]), dh = w ? (h || w * r[3] / r[2]) : h;
  if (!rot && !flip) { ctx.drawImage(img, r[0], r[1], r[2], r[3], x - dw * ax, y - dh * ay, dw, dh); return true; }
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, r[0], r[1], r[2], r[3], -dw * ax, -dh * ay, dw, dh);
  ctx.restore();
  return true;
}

/** Draw a horizontal slice [v0, v1) (fractions of the sprite's height) of sprite `name` into the box (dx, dy, dw, dh). */
export function drawSpriteSlice(ctx, name, v0, v1, dx, dy, dw, dh) {
  const f = find(name);
  if (!f) return false;
  const r = f.r, sy = r[1] + r[3] * v0, sh = Math.max(1, r[3] * (v1 - v0));
  ctx.drawImage(f.img, r[0], sy, r[2], sh, dx, dy, dw, dh);
  return true;
}

/** Draw a vertical strip [u0, u1) (fractions of the sprite's width) of sprite `name` into the box (dx, dy, dw, dh). */
export function drawSpriteColumns(ctx, name, u0, u1, dx, dy, dw, dh) {
  const f = find(name);
  if (!f) return false;
  const r = f.r;
  ctx.drawImage(f.img, r[0] + r[2] * u0, r[1], Math.max(1, r[2] * (u1 - u0)), r[3], dx, dy, dw, dh);
  return true;
}

/** The aspect w / h of a sprite (1 when unknown): sizes can be worked out before the atlas has loaded. */
export function spriteAspect(name) { const r = ATLAS_RECTS[name] || ATLAS_R3_RECTS[name]; return r ? r[2] / r[3] : 1; }

/** Draw the bomb sprite `name` ('bomb' or 'bombHot') with its body centre on (x, y) and its body radius `r` px, turned by `rot` about that centre. */
export function drawBombSprite(ctx, name, x, y, r, rot = 0) {
  const m = ATLAS_R3_META[name];
  return !!m && drawSprite(ctx, name, x, y, r / m.ru, 0, m.cu, m.cv, rot);
}
