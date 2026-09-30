// v2 (?v2=1) generated art registry (round 24). One flat table of file names; the images load lazily the
// first time a v2 renderer asks (endless mode never calls `ensureV2Art`, so it fetches nothing).
// All files are "generated, Milan style" (see octomancer-web/ASSETS.md) and live in play/img/v2/.

const FILES = {
  rock: 'shallows-rock.webp',       // tileable rock texture (512 px = ROCK_TILE_UNITS world units)
  far: 'shallows-far.webp',         // backdrop layer 1 (opaque, distant)
  near: 'shallows-near.webp',       // backdrop layer 2 (keyed, nearer silhouettes)
  ring: 'exit-ring.webp',           // glowing ring on the floor (exit and hub dive well)
  keeper: 'shop-keeper.webp',
  sign: 'shop-sign.webp',
  pedestal: 'shop-pedestal.webp',
  counter: 'shop-counter.webp',     // left cap | stretchable middle | right cap
  chestClosed: 'chest-closed.webp',
  chestOpen: 'chest-open.webp',
  crackVault: 'crack-vault.webp',
  crackWall: 'crack-wall.webp',
  board: 'hub-board.webp',
  questSign: 'hub-questsign.webp',
  banner: 'title-banner.webp',
};

export const ROCK_TILE_UNITS = 9;           // world units one rock texture tile spans
export const COUNTER_SLICES = [60, 20, 68]; // px widths of the counter strip's left cap, middle, right cap (set from export_info.json)

/** @type {Record<string, HTMLImageElement>} */
export const art = {};
const listeners = [];
let started = false;

export function artUrl(file) { return new URL(`../img/v2/${file}`, import.meta.url).href; }

/** Start loading every image (idempotent). `cb` runs once per image when it has loaded. */
export function ensureV2Art(cb) {
  if (cb) listeners.push(cb);
  if (started || typeof Image === 'undefined') return art;
  started = true;
  for (const key of Object.keys(FILES)) {
    const img = new Image();
    img.addEventListener('load', () => { for (const f of listeners) f(key); }, { once: true });
    img.src = artUrl(FILES[key]);
    art[key] = img;
  }
  return art;
}

/** The image for `key`, or null until it has loaded (draw code falls back to its code-drawn look). */
export function artImg(key) {
  const im = art[key];
  return im && im.complete && im.naturalWidth ? im : null;
}

export const V2_ART_FILES = FILES;
