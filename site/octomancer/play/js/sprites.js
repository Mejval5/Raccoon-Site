// Round 46 art pass: the packed sprite atlas img/v2/sprites.webp (people, loot, items, hazards; see octomancer-web/ASSETS.md and
// tools/export_r46_sprites.py). One image, fetched the first time anything asks for a sprite (endless mode never does), decoded
// once off the main thread and warmed into a 1 x 1 canvas so its first real draw is not a decode. Until it has loaded every
// caller falls back to its old code drawing.
//
// Corpses and other owners: drawSprite takes a rotation and a flip, so a sprite can be laid down limp (rot = +-PI/2) as is.

import { ATLAS_RECTS } from './sprite-atlas.js';
import { decodeBitmap } from './v2-art.js';

let img = null, ready = false;
const listeners = [];

function load() {
  if (img || typeof Image === 'undefined') return;
  img = new Image();
  img.addEventListener('load', () => {
    const done = () => {
      try { const c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').drawImage(img, 0, 0, 1, 1); } catch (e) { /* drawn at first use */ }
      ready = true;
      for (const f of listeners) f();
    };
    // vibe fixes: the atlas is drawn from a decoded ImageBitmap (an <img> can be dropped from the browser's decode cache and decoded
    // again inside a frame, a 50-80 ms task on a phone at 4x), decoded off the main thread (v2-art.js decodeBitmap); the <img> is the fallback
    const src = img;
    decodeBitmap(src).then((b) => { img = b; done(); }, () => { if (src.decode) src.decode().then(done, done); else done(); });
  }, { once: true });
  img.src = new URL('../img/v2/sprites.webp', import.meta.url).href;
}

/** Start loading the atlas (idempotent). */
export function ensureSprites() { load(); }
/** Called once the atlas is ready (the journal clears its cached plates, a HUD redraws). */
export function onSpritesReady(fn) { if (ready) fn(); else listeners.push(fn); }
export function spritesReady() { load(); return ready; }

/** The rect [x, y, w, h] of sprite `name` in the atlas, or null when there is no such sprite or the atlas is not loaded yet. */
export function spriteRect(name) { load(); return ready ? ATLAS_RECTS[name] || null : null; }

/**
 * Draw sprite `name` with its anchor at (x, y): `ax`, `ay` are the anchor as fractions of the sprite (0.5, 1 = bottom centre).
 * The size is `w` device px wide (h follows the aspect) or, with w = 0, `h` px tall. `rot` turns it about the anchor, `flip`
 * mirrors it left-right. Returns false (draws nothing) until the atlas is ready.
 */
export function drawSprite(ctx, name, x, y, w, h = 0, ax = 0.5, ay = 1, rot = 0, flip = false) {
  const r = spriteRect(name);
  if (!r) return false;
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
  const r = spriteRect(name);
  if (!r) return false;
  const sy = r[1] + r[3] * v0, sh = Math.max(1, r[3] * (v1 - v0));
  ctx.drawImage(img, r[0], sy, r[2], sh, dx, dy, dw, dh);
  return true;
}

/** Draw a vertical strip [u0, u1) (fractions of the sprite's width) of sprite `name` into the box (dx, dy, dw, dh). */
export function drawSpriteColumns(ctx, name, u0, u1, dx, dy, dw, dh) {
  const r = spriteRect(name);
  if (!r) return false;
  ctx.drawImage(img, r[0] + r[2] * u0, r[1], Math.max(1, r[2] * (u1 - u0)), r[3], dx, dy, dw, dh);
  return true;
}

/** The aspect w / h of a sprite (1 when unknown): sizes can be worked out before the atlas has loaded. */
export function spriteAspect(name) { const r = ATLAS_RECTS[name]; return r ? r[2] / r[3] : 1; }
