// Journal art (round 38): the picture on an entry's card and page. Creatures use their real sprites, places and people
// the generated v2 art, carried items the code-drawn icons of items-draw.js; the rest (traps, loot, bombs) are small
// code drawings. A locked entry is the same picture as a flat dark silhouette (Spelunky 2 style) under a '?'.
// One flat table of descriptors keyed by entry id; canvases are cached per (id, size, locked).

import { drawItemIcon } from './items-draw.js';
import { drawBoulder } from './hazards-draw.js';

const ASSET = (f) => new URL('../assets/' + f, import.meta.url).href;
const V2 = (f) => new URL('../img/v2/' + f, import.meta.url).href;
const TAU = Math.PI * 2;
const INK = '#10202c';

/** id -> {img: url} | {item: carried item id} | {fn: name of a code drawing} */
const ART = {
  'place-hub': { img: V2('hub-board.webp') },
  'place-tutorial': { img: V2('exit-ring.webp') },
  'place-shallows': { img: V2('shallows-near.webp'), cover: true },
  'place-shop': { img: V2('shop-sign.webp') },
  'person-diver': { fn: 'diver' },
  'person-critter': { fn: 'critter' },
  'person-keeper': { img: V2('shop-keeper.webp') },
  'creature-urchin': { img: ASSET('enemy-urchin.webp') },
  'creature-piranha': { img: ASSET('enemy-piranha.webp') },
  'creature-crab': { img: ASSET('enemy-crab-slow.webp') },
  'creature-horns': { img: ASSET('enemy-horns.webp') },
  'creature-manta': { img: ASSET('enemy-manta.webp') },
  'creature-cannon': { img: ASSET('enemy-cannon.webp') },
  'creature-beholder': { img: ASSET('enemy-beholder-0.webp') },
  'hazard-jet': { fn: 'jet' }, 'hazard-spikes': { fn: 'spikes' }, 'hazard-rock': { fn: 'rock' }, 'hazard-eel': { fn: 'eel' }, 'hazard-anemone': { fn: 'anemone' },
  'item-plankton': { fn: 'plankton' }, 'item-shell': { img: ASSET('shell-blue.webp') }, 'item-bomb': { fn: 'bomb' },
  'item-heart': { img: ASSET('ui-heart.webp') }, 'item-bombpack': { fn: 'bombpack' },
  'item-flippers': { item: 'flippers' }, 'item-lantern': { item: 'lantern' }, 'item-magnet': { item: 'magnet' },
  'item-bombbag': { item: 'bombbag' }, 'item-heartcontainer': { item: 'heartcontainer' },
  'loot-clam': { fn: 'clam' }, 'loot-pot': { fn: 'pot' }, 'loot-chest': { img: V2('chest-closed.webp') },
  'loot-pocket': { fn: 'pocket' }, 'loot-relic': { fn: 'relic' },
};

/** @type {Map<string, HTMLImageElement>} */
const images = new Map();
const listeners = [];
function image(url) {
  let im = images.get(url);
  if (!im) {
    im = new Image();
    im.onload = () => { cache.clear(); for (const fn of listeners) fn(); };
    im.src = url;
    images.set(url, im);
  }
  return im;
}
/** Called when an image finished loading (the book redraws its cards). */
export function onArtReady(fn) { listeners.push(fn); }

function stroke(ctx, fill, lw) { ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }

/** Code drawings: each fills roughly the box [-1, 1] x [-1, 1] around the origin (unit = half the picture). */
const FN = {
  bomb(c) {
    stroke(c, '#2c3946', 0.1); c.beginPath(); c.arc(0, 0.12, 0.62, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.arc(-0.22, -0.1, 0.18, 0, TAU); c.fill();
    c.strokeStyle = '#c9a56a'; c.lineWidth = 0.09; c.beginPath(); c.moveTo(0.1, -0.5); c.quadraticCurveTo(0.35, -0.85, 0.6, -0.7); c.stroke();
    c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(0.62, -0.72, 0.13, 0, TAU); c.fill();
  },
  bombpack(c) {
    for (const [x, y] of [[-0.42, 0.25], [0.42, 0.25], [0, -0.3]]) { c.save(); c.translate(x, y); c.scale(0.55, 0.55); FN.bomb(c); c.restore(); }
  },
  plankton(c) {
    for (const [x, y, r] of [[-0.4, 0.3, 0.2], [0.35, 0.4, 0.15], [0.05, -0.1, 0.26], [-0.35, -0.45, 0.13], [0.5, -0.35, 0.17]]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, 'rgba(190,255,240,0.95)'); g.addColorStop(1, 'rgba(120,230,210,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.2, 0, TAU); c.fill();
      c.fillStyle = '#e6fff8'; c.beginPath(); c.arc(x, y, r * 0.7, 0, TAU); c.fill();
    }
  },
  jet(c) {
    stroke(c, '#5d6b78', 0.1); c.beginPath(); c.roundRect(-0.75, 0.35, 1.5, 0.45, 0.1); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.roundRect(-0.3, 0.3, 0.6, 0.18, 0.06); c.fill();
    c.strokeStyle = 'rgba(200,240,255,0.9)'; c.lineWidth = 0.07;
    for (const [x, y, r] of [[0, 0.1, 0.08], [0.14, -0.2, 0.11], [-0.1, -0.5, 0.09], [0.1, -0.78, 0.13], [-0.16, -0.95, 0.07]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  },
  spikes(c) {
    stroke(c, '#5d6b78', 0.1); c.beginPath(); c.roundRect(-0.85, 0.35, 1.7, 0.5, 0.08); c.fill(); c.stroke();
    stroke(c, '#d7dfe6', 0.08);
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 0.24 - 0.11, 0.38); c.lineTo(i * 0.24, -0.38); c.lineTo(i * 0.24 + 0.11, 0.38); c.closePath(); c.fill(); c.stroke(); }
  },
  rock(c) { drawBoulder(c, 0, 0, 0.78, 7, 0.3); },
  eel(c) {
    c.strokeStyle = INK; c.lineWidth = 0.34; c.lineCap = 'round'; c.beginPath(); c.moveTo(-0.8, 0.3); c.bezierCurveTo(-0.4, -0.5, -0.1, 0.9, 0.3, 0.1); c.bezierCurveTo(0.5, -0.3, 0.7, -0.3, 0.8, -0.1); c.stroke();
    c.strokeStyle = '#6fb7a0'; c.lineWidth = 0.24; c.stroke();
    c.strokeStyle = '#fff58a'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(0.1, -0.95); c.lineTo(-0.05, -0.65); c.lineTo(0.12, -0.6); c.lineTo(-0.02, -0.3); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(0.7, -0.12, 0.05, 0, TAU); c.fill();
  },
  anemone(c) {
    stroke(c, '#7a3b5c', 0.08); c.beginPath(); c.roundRect(-0.4, 0.5, 0.8, 0.35, 0.12); c.fill(); c.stroke();
    stroke(c, '#ff8fb8', 0.07);
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 0.12, 0.55); c.quadraticCurveTo(i * 0.34, -0.1, i * 0.46 + (i % 2) * 0.08, -0.62 - Math.abs(i) * 0.03); c.stroke(); c.fillStyle = '#ffd1e3'; c.beginPath(); c.arc(i * 0.46 + (i % 2) * 0.08, -0.62 - Math.abs(i) * 0.03, 0.07, 0, TAU); c.fill(); }
  },
  clam(c) {
    stroke(c, '#d9a5c4', 0.09);
    c.beginPath(); c.moveTo(-0.8, 0.3); c.quadraticCurveTo(0, -1.0, 0.8, 0.3); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#b87ba3'; c.beginPath(); c.moveTo(-0.8, 0.3); c.quadraticCurveTo(0, 1.0, 0.8, 0.3); c.quadraticCurveTo(0, 0.5, -0.8, 0.3); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(60,20,50,0.5)'; c.lineWidth = 0.05; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 0.28, 0.24); c.quadraticCurveTo(i * 0.2, -0.2, i * 0.1, -0.55); c.stroke(); }
    c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(0, 0.3, 0.12, 0, TAU); c.fill();
  },
  pot(c) {
    stroke(c, '#b9714a', 0.09);
    c.beginPath(); c.moveTo(-0.28, -0.7); c.bezierCurveTo(-0.9, -0.2, -0.75, 0.75, -0.3, 0.8); c.lineTo(0.3, 0.8); c.bezierCurveTo(0.75, 0.75, 0.9, -0.2, 0.28, -0.7); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#d38b5f'; c.beginPath(); c.ellipse(0, -0.7, 0.34, 0.1, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(70,30,15,0.5)'; c.lineWidth = 0.06; c.beginPath(); c.moveTo(-0.62, -0.05); c.quadraticCurveTo(0, 0.2, 0.62, -0.05); c.stroke();
  },
  pocket(c) {
    stroke(c, '#7d8b96', 0.1); c.beginPath(); c.roundRect(-0.8, -0.8, 1.6, 1.6, 0.18); c.fill(); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 0.07; c.beginPath(); c.moveTo(-0.15, -0.8); c.lineTo(0.05, -0.4); c.lineTo(-0.15, -0.1); c.lineTo(0.12, 0.3); c.lineTo(-0.02, 0.8); c.stroke();
    c.fillStyle = '#ffe38a'; c.beginPath(); c.arc(0.4, 0.2, 0.09, 0, TAU); c.fill();
  },
  relic(c) {
    stroke(c, '#e7b94a', 0.09);
    c.beginPath(); c.roundRect(-0.55, 0.45, 1.1, 0.35, 0.08); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-0.34, 0.45); c.bezierCurveTo(-0.7, -0.2, -0.45, -0.8, 0, -0.8); c.bezierCurveTo(0.45, -0.8, 0.7, -0.2, 0.34, 0.45); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(-0.16, -0.25, 0.08, 0, TAU); c.arc(0.16, -0.25, 0.08, 0, TAU); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.06; c.beginPath(); c.arc(0, 0.05, 0.2, 0.2, Math.PI - 0.2); c.stroke();
  },
  diver(c) {
    stroke(c, '#e0a94a', 0.09); c.beginPath(); c.roundRect(-0.4, 0.0, 0.8, 0.85, 0.2); c.fill(); c.stroke(); // suit
    stroke(c, '#c7d3dc', 0.09); c.beginPath(); c.arc(0, -0.38, 0.46, 0, TAU); c.fill(); c.stroke(); // helmet
    c.fillStyle = '#2a4a63'; c.beginPath(); c.ellipse(0.04, -0.38, 0.28, 0.24, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(-0.06, -0.46, 0.07, 0, TAU); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.08; c.beginPath(); c.moveTo(-0.4, 0.2); c.lineTo(-0.7, -0.15); c.stroke();
    c.strokeStyle = 'rgba(210,240,255,0.85)'; c.lineWidth = 0.05; c.beginPath(); c.arc(0.55, -0.85, 0.08, 0, TAU); c.stroke(); c.beginPath(); c.arc(0.72, -0.6, 0.05, 0, TAU); c.stroke();
  },
  critter(c) {
    stroke(c, '#7ac7e8', 0.08); c.beginPath(); c.ellipse(0, 0.1, 0.42, 0.34, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(-0.14, 0.02, 0.1, 0, TAU); c.arc(0.14, 0.02, 0.1, 0, TAU); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(-0.12, 0.04, 0.05, 0, TAU); c.arc(0.16, 0.04, 0.05, 0, TAU); c.fill();
    c.strokeStyle = '#8a6a3a'; c.lineWidth = 0.08;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 0.25, -0.62); c.lineTo(i * 0.25, 0.72); c.stroke(); }
    c.beginPath(); c.moveTo(-0.82, -0.62); c.lineTo(0.82, -0.62); c.moveTo(-0.82, 0.72); c.lineTo(0.82, 0.72); c.stroke();
  },
};

const cache = new Map();

function paint(ctx, id, px) {
  const a = ART[id];
  ctx.save();
  ctx.translate(px / 2, px / 2);
  if (!a) { ctx.restore(); return; }
  if (a.img) {
    const im = image(a.img);
    if (im.complete && im.naturalWidth) {
      const k = (a.cover ? Math.max : Math.min)(px / im.naturalWidth, px / im.naturalHeight) * (a.cover ? 1 : 0.92);
      ctx.beginPath(); ctx.rect(-px / 2, -px / 2, px, px); ctx.clip();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k);
    }
  } else if (a.item) {
    drawItemIcon(ctx, a.item, 0, 0, px * 0.42);
  } else if (a.fn && FN[a.fn]) {
    ctx.scale(px * 0.46, px * 0.46);
    FN[a.fn](ctx);
  }
  ctx.restore();
}

/**
 * A canvas (px x px, cached) with the entry's picture; `locked` gives the flat dark silhouette of the same shape.
 * Entries without art draw nothing (the book then shows only the '?').
 */
export function entryArt(id, px, locked) {
  const key = id + '|' + px + '|' + (locked ? 1 : 0);
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  paint(g, id, px);
  if (locked) {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#0a1a26';
    g.fillRect(0, 0, px, px);
    g.globalCompositeOperation = 'source-over';
  }
  cache.set(key, c);
  return c;
}

/** Preload every picture of the book (called when it opens). */
export function preloadArt() { for (const id of Object.keys(ART)) if (ART[id].img) image(ART[id].img); }

/** Whether an entry id has art at all (tests). */
export function hasArt(id) { return !!ART[id]; }
export const ART_IDS = Object.keys(ART);
