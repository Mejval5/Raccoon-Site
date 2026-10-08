// Journal art (round 38): the picture on an entry's card and page. Creatures use their real sprites, places the generated v2
// art; r46: people, loot, hazards and carried items use the very sprites the game draws them with (js/sprites.js atlas, via the
// game's own draw functions or {sprite: name}); the rest (bombs, plankton, the pocket, fossils) are small code drawings. A locked entry is the same picture as a flat dark silhouette (Spelunky 2 style) under a '?'.
// One flat table of descriptors keyed by entry id; canvases are cached per (id, size, locked).

import { drawItemIcon } from './items-draw.js';
import { drawBoulder } from './hazards-draw.js';
import { drawSpellIcon, drawJarIcon } from './spell-icons.js';
import { ENTRIES } from './journal.js';
import { drawDiver, drawCritter, drawCollector } from './v2-props-draw.js';
import { drawSprite, drawSpriteColumns, spriteAspect, onSpritesReady, ensureSprites } from './sprites.js';
import { drawPoolHost } from './pool-draw.js';
import { drawClamIcon, drawPearlIcon } from './creatures-draw.js';

const TAU = Math.PI * 2;
const INK = '#10202c';

/** The picture of each entry is data (data/journal.json `art`): {img: url under play/} | {sprite: atlas name} | {item: carried item id} | {game: person} | {fn: name of a code drawing below}. */
const ART = new Map(ENTRIES.map((e) => [e.id, e.art ? (e.art.img ? { ...e.art, img: new URL('../' + e.art.img, import.meta.url).href } : e.art) : null]));

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
// r46: once the sprite atlas is in, every cached plate is redrawn with it
onSpritesReady(() => { cache.clear(); for (const fn of listeners) fn(); });

function stroke(ctx, fill, lw) { ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }

/** Code drawings: each fills roughly the box [-1, 1] x [-1, 1] around the origin (unit = half the picture). `u` is the pixel size of one unit. */
export const FN = {
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
  // section 14: the fish juice jar (two thirds full) and the Ink Cloud spell, drawn at pixel scale like the boulder
  juice(c, u = 40) { c.save(); c.scale(1 / u, 1 / u); drawJarIcon(c, -0.6 * u, -0.85 * u, 1.2 * u, 1.7 * u, 0.67, 3); c.restore(); },
  inkcloud(c, u = 40) { c.save(); c.scale(1 / u, 1 / u); drawSpellIcon(c, 'ink-cloud', 0, 0, 0.85 * u); c.restore(); },
  // the rest grotto's spring: pale stones round a clear upwelling, a few rising bubbles and a kelp frond
  spring(c) {
    c.fillStyle = 'rgba(150,215,200,0.55)'; c.beginPath(); c.ellipse(0, 0.35, 0.62, 0.22, 0, 0, TAU); c.fill();
    for (const [x, y, rx, ry] of [[-0.66, 0.42, 0.26, 0.18], [0.66, 0.42, 0.27, 0.19], [-0.32, 0.6, 0.24, 0.15], [0.3, 0.6, 0.25, 0.15], [0, 0.66, 0.2, 0.13]]) {
      stroke(c, '#b8b4a6', 0.06); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
    }
    c.strokeStyle = 'rgba(210,245,235,0.9)'; c.lineWidth = 0.06;
    for (const [x, y, r] of [[0, 0.05, 0.09], [0.12, -0.25, 0.12], [-0.08, -0.55, 0.08], [0.06, -0.82, 0.11]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
    stroke(c, '#5f8a4a', 0.06); c.beginPath(); c.moveTo(-0.82, 0.3); c.quadraticCurveTo(-0.98, -0.2, -0.7, -0.6); c.quadraticCurveTo(-0.72, -0.15, -0.66, 0.3); c.closePath(); c.fill(); c.stroke();
  },
  // the in-game boulder, drawn at pixel scale (drawBoulder's outline widths are in pixels: in unit space they were 80 px thick, a black blob)
  rock(c, u = 40) { c.save(); c.scale(1 / u, 1 / u); drawBoulder(c, 0, 0, 0.78 * u, 7, 0.3); c.restore(); },
  fish(c) {
    stroke(c, '#f0a45a', 0.08);
    c.beginPath(); c.moveTo(-0.85, 0.02); c.bezierCurveTo(-0.55, -0.62, 0.3, -0.62, 0.55, 0.02); c.bezierCurveTo(0.3, 0.6, -0.55, 0.6, -0.85, 0.02); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e07a4a'; c.beginPath(); c.moveTo(0.5, 0.02); c.lineTo(0.98, -0.42); c.lineTo(0.84, 0.02); c.lineTo(0.98, 0.46); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-0.3, -0.42); c.quadraticCurveTo(-0.05, -0.85, 0.22, -0.42); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,240,200,0.8)'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(0.05, -0.38); c.quadraticCurveTo(0.18, 0.02, 0.05, 0.4); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(-0.5, -0.1, 0.13, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 0.04; c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(-0.53, -0.09, 0.06, 0, TAU); c.fill();
  },
  pool(c) {
    // a stone pedestal with a golden glint, and rocks coming down over it
    stroke(c, '#8a93a0', 0.08); c.beginPath(); c.moveTo(-0.4, 0.8); c.lineTo(-0.28, 0.15); c.lineTo(0.28, 0.15); c.lineTo(0.4, 0.8); c.closePath(); c.fill(); c.stroke();
    stroke(c, '#b9c1cc', 0.07); c.beginPath(); c.ellipse(0, 0.13, 0.46, 0.12, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#ffe38a'; c.beginPath(); c.ellipse(0, 0.1, 0.24, 0.06, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(200,240,255,0.8)'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(-0.7, -0.15); c.lineTo(-0.7, -0.5); c.moveTo(0.72, -0.05); c.lineTo(0.72, -0.4); c.stroke();
    for (const [x, y, r] of [[-0.45, -0.62, 0.2], [0.3, -0.78, 0.17], [0.0, -0.3, 0.13]]) { stroke(c, '#8d7c6a', 0.06); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke(); }
  },
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
  gclam(c) { drawClamIcon(c); },
  pearl(c) { drawPearlIcon(c); },
  swift(c) {
    // Swift Current: three streaming lines of current curling into a small whirlpool
    c.lineCap = 'round';
    c.strokeStyle = INK; c.lineWidth = 0.2;
    const lines = (w) => {
      c.lineWidth = w;
      for (const y of [-0.45, 0, 0.45]) { c.beginPath(); c.moveTo(-0.9, y); c.bezierCurveTo(-0.6, y - 0.25, -0.35, y + 0.25, -0.05, y); c.bezierCurveTo(0.15, y - 0.15, 0.3, y - 0.05, 0.35, y * 0.4); c.stroke(); }
      c.beginPath(); c.arc(0.55, 0, 0.3, Math.PI, Math.PI * 2.7); c.stroke();
      c.beginPath(); c.arc(0.58, 0.02, 0.12, 0, Math.PI * 1.6); c.stroke();
    };
    lines(0.2);
    c.strokeStyle = '#9fdcf0'; lines(0.1);
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
    c.strokeStyle = 'rgba(225,245,255,0.9)'; c.lineWidth = 0.05; c.beginPath(); c.arc(0.3, -0.05, 0.09, 0, TAU); c.moveTo(0.48, -0.3); c.arc(0.42, -0.3, 0.06, 0, TAU); c.stroke(); // a bubble seeping out
  },
  buried(c) {
    // a block of rock with a shell sealed in it, shown as the goggles see it: a pale silhouette and a few flecks
    stroke(c, '#7d8b96', 0.1); c.beginPath(); c.roundRect(-0.8, -0.8, 1.6, 1.6, 0.18); c.fill(); c.stroke();
    c.fillStyle = 'rgba(190,232,220,0.35)'; c.beginPath(); c.arc(0.05, 0.05, 0.6, 0, TAU); c.fill();
    c.fillStyle = '#d6f1e8'; c.strokeStyle = 'rgba(40,70,70,0.6)'; c.lineWidth = 0.05;
    c.beginPath(); c.ellipse(0.05, 0.08, 0.36, 0.3, -0.4, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.arc(0.05, 0.08, 0.16, 0.5, 5.2); c.stroke();
    c.fillStyle = 'rgba(236,226,200,0.8)'; for (const [x, y] of [[-0.55, -0.5], [-0.42, -0.58], [0.52, 0.55]]) { c.beginPath(); c.arc(x, y, 0.05, 0, TAU); c.fill(); }
  },
  relic(c) {
    stroke(c, '#e7b94a', 0.09);
    c.beginPath(); c.roundRect(-0.55, 0.45, 1.1, 0.35, 0.08); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-0.34, 0.45); c.bezierCurveTo(-0.7, -0.2, -0.45, -0.8, 0, -0.8); c.bezierCurveTo(0.45, -0.8, 0.7, -0.2, 0.34, 0.45); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(-0.16, -0.25, 0.08, 0, TAU); c.arc(0.16, -0.25, 0.08, 0, TAU); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.06; c.beginPath(); c.arc(0, 0.05, 0.2, 0.2, Math.PI - 0.2); c.stroke();
  },
  wreck(c) {
    stroke(c, '#6b4a2f', 0.07); c.beginPath(); c.moveTo(-0.05, 0.1); c.lineTo(-0.2, -0.95); c.lineTo(-0.1, -0.95); c.lineTo(0.08, 0.1); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(210,218,205,0.9)'; c.beginPath(); c.moveTo(-0.18, -0.9); c.lineTo(0.6, -0.78); c.lineTo(0.5, -0.35); c.lineTo(0.3, -0.45); c.lineTo(0.15, -0.2); c.lineTo(-0.1, -0.35); c.closePath(); c.fill(); c.stroke();
    stroke(c, '#7a5636', 0.08); c.beginPath(); c.moveTo(-0.95, 0.05); c.lineTo(-0.55, 0.0); c.lineTo(-0.5, 0.12); c.lineTo(0.3, 0.1); c.lineTo(0.95, -0.1); c.lineTo(0.55, 0.5); c.quadraticCurveTo(0, 0.78, -0.55, 0.62); c.quadraticCurveTo(-0.9, 0.45, -0.95, 0.05); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; for (const x of [-0.5, -0.12, 0.3]) { c.beginPath(); c.arc(x, 0.36, 0.07, 0, TAU); c.fill(); }
  },
  fossil(c) {
    stroke(c, '#d9cdb4', 0.08); c.beginPath(); c.roundRect(-0.8, -0.8, 1.6, 1.6, 0.2); c.fill(); c.stroke();
    // the spiral stays inside the stone (it used to run to radius 1.3 and out of the plate)
    c.strokeStyle = '#8c7e63'; c.lineWidth = 0.09; c.lineCap = 'round'; c.beginPath();
    for (let a = 0; a < TAU * 2.1; a += 0.2) { const r = 0.06 + a * 0.037; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (a === 0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
  },
  decorrock(c) {
    stroke(c, '#9fb0bd', 0.09); c.beginPath(); c.moveTo(-0.8, 0.5); c.bezierCurveTo(-0.85, -0.3, -0.35, -0.75, 0.15, -0.7); c.bezierCurveTo(0.7, -0.65, 0.9, 0, 0.8, 0.5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(-0.2, -0.3, 0.3, 0.16, -0.5, 0, TAU); c.fill();
    c.fillStyle = '#6fa078'; c.beginPath(); c.ellipse(0.35, 0.12, 0.2, 0.12, 0.3, 0, TAU); c.fill();
  },
  collector(c) {
    stroke(c, '#8d6fb0', 0.08);
    for (const [x, a] of [[-0.55, 0.5], [-0.2, 0.2], [0.2, -0.2], [0.55, -0.5]]) { c.beginPath(); c.moveTo(x * 0.6, 0.35); c.quadraticCurveTo(x * 1.2, 0.95, x * 1.35 + a * 0.2, 0.85); c.lineWidth = 0.2; c.strokeStyle = INK; c.stroke(); c.lineWidth = 0.13; c.strokeStyle = '#8d6fb0'; c.stroke(); }
    stroke(c, '#8d6fb0', 0.08); c.beginPath(); c.ellipse(0, -0.05, 0.62, 0.7, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#fff'; for (const sx of [-0.24, 0.24]) { c.beginPath(); c.arc(sx, -0.05, 0.19, 0, TAU); c.fill(); }
    c.fillStyle = INK; for (const sx of [-0.22, 0.26]) { c.beginPath(); c.arc(sx, -0.03, 0.08, 0, TAU); c.fill(); }
    c.strokeStyle = '#e7b94a'; c.lineWidth = 0.06; for (const sx of [-0.24, 0.24]) { c.beginPath(); c.arc(sx, -0.05, 0.22, 0, TAU); c.stroke(); }
    c.beginPath(); c.moveTo(-0.02, -0.05); c.lineTo(0.02, -0.05); c.stroke();
    c.strokeStyle = '#efe6d2'; c.lineWidth = 0.09; c.beginPath(); c.moveTo(-0.3, 0.3); c.quadraticCurveTo(0, 0.18, 0.3, 0.3); c.stroke();
  },
};

/**
 * r40: the people on the People pages are drawn by the very functions the game draws them with (v2-props-draw.js), at plate
 * scale: a camera whose origin is the plate's centre (cw = ch = 0 puts the screen centre at the translated origin).
 * Each takes the plate's pixel size and paints Marlo, Pip or Quill the way they stand in the hub.
 */
export const GAME_DRAW = {
  diver(c, px) { drawDiver(c, { x: 0, y: 0, pxPerUnit: px * 0.7 }, 0, 0, 0, 0.6, 0.6, true, false); },
  critter(c, px) { drawCritter(c, { x: 0, y: 0, pxPerUnit: px * 1.35 }, 0, 0, 0, 0.0, true, 0.6, 0, ''); },
  collector(c, px) { drawCollector(c, { x: 0, y: 0, pxPerUnit: px * 0.66 }, 0, 0, 0, 0.6, 0.6, false); },
  host(c, px) { drawPoolHost(c, { x: 0, y: 0, pxPerUnit: px * 0.62 }, 0, 0, { plan: { x: 1.7, floorY: -0.52 }, state: 0 }, 0, 1.7); },
};

const cache = new Map();
/** The locked silhouette's ink: a warm brown that reads on parchment. */
const LOCKED_INK = '#5b4636';

function paint(ctx, id, px) {
  const a = ART.get(id);
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
  } else if (a.sprite) {
    ensureSprites();
    // `cols` [u0, u1]: only that part of a long sprite (a few spines of the strip); `rot`: turned (the eel lies across the plate)
    const c = a.cols || [0, 1], asp = spriteAspect(a.sprite) * (c[1] - c[0]) * (a.rot ? 1 / (spriteAspect(a.sprite) ** 2) : 1), d = px * 0.84;
    const w = asp >= 1 ? d : d * asp, h = asp >= 1 ? d / asp : d;
    if (a.rot) { ctx.rotate(a.rot * Math.PI / 180); drawSprite(ctx, a.sprite, 0, 0, h, w, 0.5, 0.5); }
    else if (a.cols) drawSpriteColumns(ctx, a.sprite, c[0], c[1], -w / 2, -h / 2, w, h);
    else drawSprite(ctx, a.sprite, 0, 0, w, h, 0.5, 0.5);
  } else if (a.item) {
    drawItemIcon(ctx, a.item, 0, 0, px * 0.42);
  } else if (a.game && GAME_DRAW[a.game]) {
    GAME_DRAW[a.game](ctx, px);
  } else if (a.fn && FN[a.fn]) {
    ctx.scale(px * 0.46, px * 0.46);
    FN[a.fn](ctx, px * 0.46);
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
    g.fillStyle = LOCKED_INK;
    g.fillRect(0, 0, px, px);
    g.globalCompositeOperation = 'source-over';
  }
  cache.set(key, c);
  return c;
}

/** Preload every picture of the book (called when it opens). */
export function preloadArt() { ensureSprites(); for (const a of ART.values()) if (a && a.img) image(a.img); }

/** Whether an entry id has art at all (tests). */
export function hasArt(id) { return !!ART.get(id); }
/** Every entry's art descriptor, with image urls resolved (tests check that each file exists and each drawing is defined). */
export function artList() { return ENTRIES.map((e) => ({ id: e.id, art: ART.get(e.id) })); }
