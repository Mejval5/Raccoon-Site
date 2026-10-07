// v2 (?v2=1) generated art registry (round 24). One flat table of file names; the images load lazily the
// first time a v2 renderer asks (endless mode never calls `ensureV2Art`, so it fetches nothing).
// All files are "generated, Milan style" (see octomancer-web/ASSETS.md) and live in play/img/v2/.

const FILES = {
  rock: 'shallows-rock.webp',       // tileable rock texture (512 px = ROCK_TILE_UNITS world units)
  far: 'shallows-far.webp',         // backdrop layer 1 (opaque, distant)
  near: 'shallows-near.webp',       // backdrop layer 2 (keyed, nearer silhouettes)
  keeper: 'shop-keeper.webp',
  sign: 'shop-sign.webp',
  pedestal: 'shop-pedestal.webp',
  counter: 'shop-counter.webp',     // left cap | stretchable middle | right cap
  crackVault: 'crack-vault.webp',
  crackWall: 'crack-wall.webp',
  board: 'hub-board.webp',
  questSign: 'hub-questsign.webp',
  banner: 'title-banner.webp',
  whirlpool: 'whirlpool-sheet.webp', // r42: Milan's Whirlpool animation (21 frames, 7 columns of 208 px)
};

export const ROCK_TILE_UNITS = 9;           // world units one rock texture tile spans
export const COUNTER_SLICES = [60, 20, 68]; // px widths of the counter strip's left cap, middle, right cap (set from export_info.json)

/** @type {Record<string, HTMLImageElement>} */
export const art = {};
const listeners = [];
let started = false;

export function artUrl(file) { return new URL(`../img/v2/${file}`, import.meta.url).href; }

let warmCtx = null;
/** r44: decode an image off the main thread, then draw it once into a 1 x 1 canvas so its first real draw (the hub's whirlpool and board, a
 *  level's art) is not the first time the browser decodes and uploads it: that was a 50-100 ms frame during a transition. */
function warmImage(img) {
  const touch = () => {
    try {
      if (!warmCtx) { const c = document.createElement('canvas'); c.width = c.height = 1; warmCtx = c.getContext('2d'); }
      warmCtx.drawImage(img, 0, 0, 1, 1);
    } catch (e) { /* not drawable yet: it is decoded at its first use, as before */ }
  };
  if (img.decode) img.decode().then(touch, touch); else touch();
}

/** Start loading every image (idempotent). `cb` runs once per image when it has loaded. */
export function ensureV2Art(cb) {
  if (cb) listeners.push(cb);
  if (started || typeof Image === 'undefined') return art;
  started = true;
  for (const key of Object.keys(FILES)) {
    const img = new Image();
    // r44: decode once, when it arrives (off the main thread), not at the first drawImage of a frame during play
    img.addEventListener('load', () => { for (const f of listeners) f(key); warmImage(img); }, { once: true });
    img.src = artUrl(FILES[key]);
    art[key] = img;
  }
  return art;
}

/** r41: a renderer that is thrown away must stop listening, or every level's renderer (and its canvases) stays alive for the page's life. */
export function offV2Art(cb) { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }

/** The image for `key`, or null until it has loaded (draw code falls back to its code-drawn look). */
export function artImg(key) {
  const im = art[key];
  return im && im.complete && im.naturalWidth ? im : null;
}

export const V2_ART_FILES = FILES;
