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
  matBedrock: 'mat-bedrock.webp',   // materials: indestructible basalt (generated, Milan style)
  matCoral: 'mat-coral.webp',       // materials: coral wall (generated, Milan style)
  matTimber: 'mat-timber.webp',     // materials: sunken-ship planks (generated, Milan style)
  matMasonry: 'mat-masonry.webp',   // materials: shop frame stone (generated, Milan style)
  matBoneA: 'mat-bone-a.webp',      // materials: bone block (Milan's PushableBlock02)
  matBoneB: 'mat-bone-b.webp',      // materials: bone block (Milan's PushableBlock03)
  pushBlock: 'push-block.webp',     // pushable block prop (Milan's PushableBlock01)
  whirlpool: 'whirlpool-sheet.webp', // r42: Milan's Whirlpool animation (21 frames, 7 columns of 208 px)
};
/** r44: the same animation at about 0.55 scale (380 px cells), used only on a DPR >= 2 screen wider than 900 css px (a desktop at DPR 2 drew the normal sheet 1.9x too big and it looked soft). It loads under the key 'whirlpool' instead of the normal sheet, never both. */
export const WHIRLPOOL_HI_FILE = 'whirlpool-sheet-hi.webp';
/** 'hi' or 'lo': which whirlpool sheet this page loads. `?whirl=hi|lo` forces one (tests, review). */
let whirlParam;
export function whirlpoolSheetKey() {
  if (typeof window === 'undefined') return 'lo';
  if (whirlParam === undefined) { // the URL is read once (this runs every frame a whirlpool is drawn; parsing it each time showed up in phone profiles)
    whirlParam = null;
    try { const q = new URLSearchParams(location.search).get('whirl'); if (q === 'hi' || q === 'lo') whirlParam = q; } catch (e) { /* no URL: the default */ }
  }
  if (whirlParam) return whirlParam;
  return pickWhirlSheet(window.devicePixelRatio || 1, window.innerWidth);
}
/** The rule: the big sheet only for a DPR >= 2 screen wider than 900 css px. */
export function pickWhirlSheet(dpr, cssWidth) { return dpr >= 2 && cssWidth > 900 ? 'hi' : 'lo'; }

export const ROCK_TILE_UNITS = 9;           // world units one rock texture tile spans
export const COUNTER_SLICES = [60, 20, 68]; // px widths of the counter strip's left cap, middle, right cap (set from export_info.json)

/** @type {Record<string, HTMLImageElement>} */
export const art = {};
/** r44: decoded copies (ImageBitmap) of the images that are drawn every frame at a scale. Drawing the <img> itself decodes it at the first real draw (at the scale
 *  asked for: the 1 x 1 warm-up draw only decoded a thumbnail), which was a 17-47 ms drawImage when the hub's whirlpool first showed on a phone at 4x. */
const bitmaps = {};
// vibe fixes: the two backdrop layers (drawn scaled every frame) and the opaque material textures (patterns in every band bake) too:
// an opaque <img> was decoded again (as YUV) inside a frame after a level change
const BITMAP_KEYS = new Set(['whirlpool', 'far', 'near', 'rock', 'matBedrock', 'matTimber', 'matMasonry', 'matCoral', 'matBoneA', 'matBoneB']);

/** vibe fixes: decode an image's file into an ImageBitmap OFF the main thread: the bytes are fetched again (from the HTTP cache) and
 *  createImageBitmap(blob) decodes them on a worker. createImageBitmap(img) decodes on the main thread (an 84 ms task for the sprite
 *  atlas on a phone at 4x, Chrome trace), and a plain <img> can be dropped from the browser's decode cache and decoded again inside a
 *  frame (50-80 ms 'Decode Image' tasks during level changes, the music stutter). A bitmap keeps its pixels. */
export function decodeBitmap(img) {
  if (typeof createImageBitmap !== 'function') return Promise.reject(new Error('no createImageBitmap'));
  const url = img.currentSrc || img.src;
  return fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then((b) => createImageBitmap(b)).catch(() => createImageBitmap(img));
}
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
    img.addEventListener('load', () => {
      if (BITMAP_KEYS.has(key) && typeof createImageBitmap === 'function') {
        decodeBitmap(img).then((b) => { bitmaps[key] = b; for (const f of listeners) f(key); }, () => { for (const f of listeners) f(key); });
      } else { for (const f of listeners) f(key); warmImage(img); }
    }, { once: true });
    img.src = key === 'whirlpool' && whirlpoolSheetKey() === 'hi' ? artUrl(WHIRLPOOL_HI_FILE) : artUrl(FILES[key]);
    art[key] = img;
  }
  return art;
}

/** r41: a renderer that is thrown away must stop listening, or every level's renderer (and its canvases) stays alive for the page's life. */
export function offV2Art(cb) { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }

/** The image for `key`, or null until it has loaded (draw code falls back to its code-drawn look). */
export function artImg(key) {
  if (BITMAP_KEYS.has(key)) return artBitmap(key); // decoded once off the main thread (an ImageBitmap: use .width, not .naturalWidth)
  const im = art[key];
  return im && im.complete && im.naturalWidth ? im : null;
}

/** The decoded bitmap of `key` (see `bitmaps`), or null until it is ready; the image itself is the fallback for a browser without createImageBitmap. */
export function artBitmap(key) {
  if (bitmaps[key]) return bitmaps[key];
  if (typeof createImageBitmap !== 'function') return artImg(key);
  return null;
}

export const V2_ART_FILES = FILES;
