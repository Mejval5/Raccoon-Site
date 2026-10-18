// Drawing the hub building (hub-build.js, octomancer-web/HUB-BUILDING.md): the hoard's shell pile and its tally stone, the chalk
// outlines of empty spots, and the decorations built on them. Milan's sprites (atlas, the foliage sheet, the shell assets), three
// generated pieces (img/v2/sprites-build.webp) and code drawing in his manner (dark outline, flat fills, a little moss).
//
// Cost: every piece is painted ONCE into a small canvas per zoom bucket (like the cave painting) and blitted while on screen;
// a hanging piece swings by turning that blit. Lights are one cached glow sprite each. Nothing is painted per frame except the
// ropes, the chalk outlines of nearby empty spots, and the blits.

import { drawSprite, spritesReady } from './sprites.js';
import { getFoliageTable } from './foliage.js';
import { pileStage, OUTLINE_NEAR } from './hub-build.js';

const TAU = Math.PI * 2;
const INK = '#2a2220', ROPE = '#3a2a18', STONE = '#8a8c84', STONE_D = '#5f625c', STONE_L = '#a9aaa1', MOSS = '#6f8a3c';
const ASSET = (n) => new URL(`../assets/${n}`, import.meta.url).href;

// ---------------------------------------------------------------- images (the shell assets and the foliage sheet)
let imgs = null;
function images() {
  if (!imgs && typeof Image !== 'undefined') {
    imgs = {};
    for (const k of ['cowrie', 'conch', 'nautilus', 'moon']) { const i = new Image(); i.src = ASSET('shell-' + k + '.webp'); imgs[k] = i; }
    const f = new Image(); f.src = ASSET('foliage.webp'); imgs.foliage = f;
  }
  return imgs;
}
const loaded = (i) => !!i && i.complete && i.naturalWidth > 0;
/** Everything a bake needs is loaded (until then nothing is baked or drawn: a bake must not miss a part). */
export function buildArtReady() {
  const I = images();
  return !!I && spritesReady() && loaded(I.cowrie) && loaded(I.conch) && loaded(I.nautilus) && loaded(I.foliage) && !!getFoliageTable();
}

function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/** A foliage-sheet plant (data/foliage.json art) with its base centre at (x, y), `h` px tall. */
function plant(c, id, x, y, h, flip = false, rot = 0) {
  const T = getFoliageTable(), I = images();
  const k = T ? T.ids.indexOf(id) : -1;
  if (k < 0 || !T.sh[k]) return;
  const w = h * T.sw[k] / T.sh[k];
  c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (flip) c.scale(-1, 1);
  c.drawImage(I.foliage, T.sx[k], T.sy[k], T.sw[k], T.sh[k], -w / 2, -h, w, h);
  c.restore();
}
/** A shell asset centred on (x, y), `s` px wide. */
function shell(c, kind, x, y, s, rot = 0) {
  const im = images()[kind];
  c.save(); c.translate(x, y); if (rot) c.rotate(rot);
  c.drawImage(im, -s / 2, -s / 2, s, s);
  c.restore();
}
function outlined(c, path, fill, lw) { path(); c.fillStyle = fill; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
function blob(c, x, y, rx, ry, fill, lw) { outlined(c, () => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }, fill, lw); }

// ---------------------------------------------------------------- the pieces
// Each art: w, h (tiles, the bake box), ax, ay (the anchor as fractions of the box: (0.5, 1) a floor piece's base centre,
// (0.5, 0) a hanging piece's top), rope (hanging: tiles of rope from the ceiling to the anchor), lights [[dx, dy, r, cool]]
// (tiles from the anchor), and paint(c, u) drawing around the anchor (u = px per tile).

function paintJar(c, u, y0 = 0) { // a glass jar with a cork, bioluminescent blobs inside; base centre at (0, y0)
  const w = 0.46 * u, h = 0.62 * u, lw = Math.max(1.5, u * 0.035);
  c.save(); c.translate(0, y0);
  outlined(c, () => { c.beginPath(); c.moveTo(-w * 0.42, -h * 0.82); c.quadraticCurveTo(-w * 0.62, -h * 0.6, -w * 0.5, -h * 0.25); c.quadraticCurveTo(-w * 0.5, 0, 0, 0); c.quadraticCurveTo(w * 0.5, 0, w * 0.5, -h * 0.25); c.quadraticCurveTo(w * 0.62, -h * 0.6, w * 0.42, -h * 0.82); c.closePath(); }, 'rgba(150,205,190,0.55)', lw);
  const g = c.createRadialGradient(0, -h * 0.38, 0, 0, -h * 0.38, w * 0.55);
  g.addColorStop(0, 'rgba(200,255,225,0.9)'); g.addColorStop(1, 'rgba(110,210,190,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, -h * 0.38, w * 0.55, 0, TAU); c.fill();
  for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#bff7d8' : '#8ee8d0'; c.beginPath(); c.arc((hash(k) - 0.5) * w * 0.5, -h * (0.2 + hash(k + 9) * 0.45), u * (0.035 + hash(k + 3) * 0.03), 0, TAU); c.fill(); }
  outlined(c, () => { c.beginPath(); c.rect(-w * 0.3, -h * 1.0, w * 0.6, h * 0.2); }, '#8a5a32', lw);
  c.restore();
}
function paintSlab(c, u, w, h) { // a rounded stone slab, base centre at (0, 0)
  const lw = Math.max(1.5, u * 0.04);
  outlined(c, () => { c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h + w * 0.32); c.quadraticCurveTo(-w / 2, -h, 0, -h); c.quadraticCurveTo(w / 2, -h, w / 2, -h + w * 0.32); c.lineTo(w / 2, 0); c.closePath(); }, STONE, lw);
  c.fillStyle = STONE_D; c.globalAlpha = 0.35; c.fillRect(-w / 2 + lw, -h * 0.18, w - lw * 2, h * 0.16); c.globalAlpha = 1;
  c.fillStyle = MOSS; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(-w / 2 + w * (0.1 + 0.25 * k + hash(k) * 0.1), -lw, u * (0.05 + hash(k + 4) * 0.04), Math.PI, 0); c.fill(); }
}
// the people's plaques: the person carved in relief (their sprite, flattened into the stone) and their name
const PLAQUE = { marlo: { sprite: 'marlo', name: 'MARLO' }, pip: { sprite: 'pip', name: 'PIP' }, quill: { sprite: 'quill', name: 'QUILL' }, host: { sprite: 'host', name: 'HOST' }, keeper: { sprite: 'shopkeeper', name: 'KEEPER' } };
function paintPlaque(c, u, who) {
  const w = 0.72 * u, h = 0.92 * u;
  paintSlab(c, u, w, h);
  const p = PLAQUE[who] || PLAQUE.marlo;
  const rs = Math.ceil(0.5 * u), t = document.createElement('canvas'); t.width = t.height = rs;
  const g = t.getContext('2d');
  let drew = drawSprite(g, p.sprite, rs / 2, rs, 0, rs * 0.96, 0.5, 1);
  if (!drew) { g.fillStyle = '#000'; g.beginPath(); g.arc(rs / 2, rs * 0.55, rs * 0.32, 0, TAU); g.fill(); } // (the keeper: a round face)
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#c9cac0'; g.fillRect(0, 0, rs, rs);
  c.drawImage(t, -rs / 2 + u * 0.02, -h * 0.84 + u * 0.02, rs, rs); // the lit lip of the cut
  g.fillStyle = '#4a4c47'; g.fillRect(0, 0, rs, rs);
  c.drawImage(t, -rs / 2, -h * 0.84, rs, rs);
  c.fillStyle = STONE_D; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `700 ${Math.max(6, Math.round(u * 0.13))}px Quicksand, sans-serif`;
  c.fillText(p.name, 0, -h * 0.2);
}
function paintFan(c, u) { // a sea fan: a fan-shaped web over a branching frame, on a short stalk
  const lw = Math.max(1.2, u * 0.035);
  const segs = [];
  const branch = (x, y, a, len, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    segs.push([x, y, x2, y2, d]);
    if (d < 4) { branch(x2, y2, a - 0.36 + (hash(d * 7 + len) - 0.5) * 0.2, len * 0.78, d + 1); branch(x2, y2, a + 0.36 + (hash(d * 3 + x) - 0.5) * 0.2, len * 0.78, d + 1); }
  };
  branch(0, -0.02 * u, -Math.PI / 2, 0.3 * u, 0);
  // the web: a fan of soft colour behind the frame
  c.beginPath(); c.moveTo(0, -0.25 * u);
  for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 - 1.15 + k * (2.3 / 16), r = (0.95 + hash(k) * 0.12) * u; c.lineTo(Math.cos(a) * r * 0.62, -0.25 * u + Math.sin(a) * r * 0.82 + 0.25 * u); }
  c.closePath(); c.fillStyle = 'rgba(176, 92, 120, 0.55)'; c.fill(); c.strokeStyle = 'rgba(42,34,32,0.6)'; c.lineWidth = lw; c.stroke();
  c.lineCap = 'round';
  for (const [x, y, x2, y2, d] of segs) { c.strokeStyle = INK; c.lineWidth = lw * (2.2 - d * 0.3); c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); }
  for (const [x, y, x2, y2, d] of segs) { c.strokeStyle = d % 2 ? '#c26f8c' : '#a95a77'; c.lineWidth = lw * (1.1 - d * 0.15); c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); }
}
function paintChimes(c, u) { // a driftwood bar, five threads with sea-glass shards (dull, no shine)
  const lw = Math.max(1.2, u * 0.03);
  const cols = ['#7fa98f', '#8fb3b8', '#6d9a8a', '#a3b9a0', '#7f9fb0'];
  c.strokeStyle = ROPE; c.lineWidth = lw;
  for (let k = 0; k < 5; k++) {
    const x = (-0.44 + k * 0.22) * u, len = (0.4 + hash(k + 2) * 0.4) * u;
    c.strokeStyle = ROPE; c.beginPath(); c.moveTo(x, 0.05 * u); c.lineTo(x, len); c.stroke();
    const s = (0.15 + hash(k) * 0.07) * u;
    outlined(c, () => { c.beginPath(); c.moveTo(x - s * 0.1, len - s * 0.15); c.lineTo(x + s * 0.5, len + s * 0.35); c.lineTo(x + s * 0.3, len + s * 1.45); c.lineTo(x - s * 0.15, len + s * 1.6); c.lineTo(x - s * 0.5, len + s * 0.6); c.closePath(); }, cols[k], lw * 1.2);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(x, len + s * 0.1); c.lineTo(x + s * 0.3, len + s * 0.4); c.lineTo(x - s * 0.1, len + s * 0.9); c.closePath(); c.fill();
  }
  outlined(c, () => { c.beginPath(); c.moveTo(-0.62 * u, -0.02 * u); c.quadraticCurveTo(0, -0.1 * u, 0.62 * u, -0.01 * u); c.lineTo(0.6 * u, 0.09 * u); c.quadraticCurveTo(0, 0.03 * u, -0.6 * u, 0.1 * u); c.closePath(); }, '#7d6a52', lw * 1.3);
}
function paintBell(c, u) { // a conch shell hung mouth-down, a pebble clapper under it
  c.strokeStyle = ROPE; c.lineWidth = Math.max(1, u * 0.04);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 0.2 * u); c.stroke();
  c.beginPath(); c.moveTo(0.04 * u, 0.6 * u); c.lineTo(0.04 * u, 1.05 * u); c.stroke();
  blob(c, 0.04 * u, 1.1 * u, 0.08 * u, 0.08 * u, STONE_D, Math.max(1, u * 0.03));
  shell(c, 'conch', 0, 0.55 * u, 1.1 * u, 0.45); // spire up, mouth down
}
function paintPile(c, u, stage) { // a ring of stones and a mound of shells that grows with the hoard
  const lw = Math.max(1.5, u * 0.035);
  const half = [0.55, 0.6, 0.75, 0.9, 1.05, 1.2][stage] * u;
  const n = [0, 5, 12, 22, 36, 54][stage];
  const top = [0, 0.18, 0.32, 0.48, 0.66, 0.86][stage] * u;
  // the stones the hoard is kept in: a low ring behind the heap
  const stones = [[-1.0, 0.2, 0.15], [-0.62, 0.17, 0.12], [-0.2, 0.14, 0.1], [0.25, 0.16, 0.11], [0.66, 0.18, 0.12], [1.02, 0.2, 0.15]];
  for (let k = 0; k < stones.length; k++) { const [fx, rx, ry] = stones[k]; blob(c, fx * (half + 0.12 * u), -ry * u * 0.8, rx * u, ry * u, k % 2 ? STONE_D : '#727570', lw); }
  const kinds = ['cowrie', 'cowrie', 'conch', 'cowrie', 'nautilus', 'cowrie', 'conch', 'cowrie'];
  const sh = [];
  for (let i = 0; i < n; i++) { // a mound under a parabola of the given top; the high ones first, the low ones in front
    const x = (hash(i * 3 + 1) * 2 - 1) * half * 0.92, hmax = Math.max(0, 1 - (x / half) * (x / half)) * top;
    sh.push([x, -0.07 * u - Math.pow(hash(i * 7 + 2), 0.8) * hmax, i]);
  }
  sh.sort((a, b) => a[1] - b[1]);
  for (const [x, y, i] of sh) shell(c, kinds[i % kinds.length], x, y, (0.3 + hash(i + 11) * 0.12) * u, (hash(i * 5) - 0.5) * 2.4);
  for (const fx of [-0.82, 0.05, 0.86]) blob(c, fx * half, -0.06 * u, (0.12 + hash(fx * 9 + 3) * 0.04) * u, 0.075 * u, STONE, lw); // the front stones over the heap's foot
}
function paintTally(c, u, marks) { // a small rough boulder with tally marks cut in it
  const w = 0.56 * u, h = 0.6 * u, lw = Math.max(1.5, u * 0.035);
  outlined(c, () => {
    c.beginPath(); c.moveTo(-w * 0.5, 0); c.lineTo(-w * 0.52, -h * 0.55); c.lineTo(-w * 0.34, -h * 0.92); c.lineTo(w * 0.05, -h); c.lineTo(w * 0.38, -h * 0.86); c.lineTo(w * 0.52, -h * 0.5); c.lineTo(w * 0.48, 0); c.closePath();
  }, STONE, lw);
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(-w * 0.34, -h * 0.86); c.lineTo(w * 0.05, -h * 0.94); c.lineTo(w * 0.3, -h * 0.82); c.lineTo(-w * 0.2, -h * 0.74); c.closePath(); c.fill();
  c.fillStyle = MOSS; c.beginPath(); c.ellipse(-w * 0.2, -lw, w * 0.22, h * 0.06, 0, Math.PI, 0); c.fill();
  c.strokeStyle = STONE_D; c.lineWidth = Math.max(1, u * 0.028); c.lineCap = 'round';
  const groups = Math.min(3, Math.ceil(marks / 5));
  for (let gI = 0; gI < groups; gI++) {
    const left = Math.min(5, marks - gI * 5), y0 = -h * (0.76 - gI * 0.22), y1 = y0 + h * 0.15;
    for (let k = 0; k < Math.min(4, left); k++) { const x = -w * 0.24 + k * w * 0.13; c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
    if (left >= 5) { c.beginPath(); c.moveTo(-w * 0.32, y1); c.lineTo(w * 0.22, y0); c.stroke(); }
  }
}

export const ARTS = {
  lantern: { w: 0.8, h: 1.3, ax: 0.5, ay: 0, rope: 1.1, lights: [[0, 0.95, 2.2, false]], paint(c, u) { drawSprite(c, 'hangingLamp', 0, 1.2 * u, 0, 1.2 * u, 0.5, 1); } },
  bell: { w: 1.2, h: 1.3, ax: 0.5, ay: 0, rope: 0.9, paint: paintBell },
  glowjar: { w: 0.7, h: 1.0, ax: 0.5, ay: 0, base: 0.85, rope: 1.1, lights: [[0, 0.62, 1.5, true]], stands: true, paint(c, u) {
    c.strokeStyle = ROPE; c.lineWidth = Math.max(1, u * 0.04); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 0.2 * u); c.stroke();
    paintJar(c, u, 0.85 * u);
  } },
  chimes: { w: 1.4, h: 1.6, ax: 0.5, ay: 0, rope: 1.0, paint: paintChimes },
  net: { w: 1.8, h: 1.7, ax: 0.5, ay: 0, rope: 0.9, vee: 0.62, lights: [[0, 0.9, 1.2, true]], paint(c, u) { drawSprite(c, 'floatNet', 0, 0, 0, 1.5 * u, 0.5, 0.06); } },
  lanterns: { w: 2.2, h: 2.4, ax: 0.5, ay: 0, rope: 0.7, lights: [[-0.75, 1.15, 1.4, false], [0, 1.75, 1.6, false], [0.75, 1.35, 1.4, false]], paint(c, u) {
    c.strokeStyle = ROPE; c.lineWidth = Math.max(1, u * 0.04);
    const drops = [[-0.75, 0.4], [0, 1.0], [0.75, 0.6]];
    for (const [x, d] of drops) { c.beginPath(); c.moveTo(x * u, 0.04 * u); c.lineTo(x * u, (0.04 + d) * u); c.stroke(); drawSprite(c, 'hangingLamp', x * u, (0.04 + d + 0.95) * u, 0, 0.95 * u, 0.5, 1); }
    outlined(c, () => { c.beginPath(); c.ellipse(0, 0.02 * u, 0.95 * u, 0.06 * u, 0, 0, TAU); }, '#8a7558', Math.max(1.5, u * 0.035));
  } },
  planter: { w: 1.4, h: 2.0, ax: 0.5, ay: 1, paint(c, u) {
    plant(c, 'plant12', 0.02 * u, -0.6 * u, 1.05 * u);
    plant(c, 'plant24', 0.16 * u, -0.6 * u, 0.62 * u, true, 0.35);
    plant(c, 'plant24', -0.14 * u, -0.62 * u, 0.5 * u, false, -0.4);
    drawSprite(c, 'pot', 0, 0, 0, 0.82 * u, 0.5, 1);
  } },
  coral: { w: 1.5, h: 0.9, ax: 0.5, ay: 1, grows: true, paint(c, u) {
    plant(c, 'plant25', -0.5 * u, 0.04 * u, 0.36 * u, true);
    plant(c, 'plant20', 0.42 * u, 0.04 * u, 0.42 * u);
    plant(c, 'plant25', -0.08 * u, 0.06 * u, 0.56 * u);
  } },
  anemones: { w: 1.6, h: 0.9, ax: 0.5, ay: 1, paint(c, u) {
    drawSprite(c, 'anemone', 0.42 * u, 0.02 * u, 0, 0.52 * u, 0.5, 1, 0, true);
    drawSprite(c, 'anemone', -0.25 * u, 0.03 * u, 0, 0.74 * u, 0.5, 1);
  } },
  fan: { w: 1.4, h: 1.2, ax: 0.5, ay: 1, grows: true, paint: paintFan },
  plaque: { w: 0.9, h: 1.0, ax: 0.5, ay: 1, stands: true, paint: null }, // per person (who): paintPlaque
  bench: { w: 2.0, h: 1.0, ax: 0.5, ay: 1, paint(c, u) { drawSprite(c, 'driftBench', 0, 0.02 * u, 0, 0.86 * u, 0.5, 1); } },
  anchor: { w: 1.6, h: 1.8, ax: 0.5, ay: 1, paint(c, u) { drawSprite(c, 'anchor', 0, 0.04 * u, 0, 1.55 * u, 0.5, 1, 0.12); } },
  garden: { w: 3.0, h: 1.3, ax: 0.5, ay: 1, paint(c, u) {
    c.save(); c.translate(-0.15 * u, 0); paintFan(c, u * 0.62); c.restore();
    drawSprite(c, 'stone', -1.15 * u, 0.04 * u, 0, 0.62 * u, 0.5, 1);
    drawSprite(c, 'anemone', -0.6 * u, 0.03 * u, 0, 0.62 * u, 0.5, 1);
    plant(c, 'plant25', 0.4 * u, 0.06 * u, 0.5 * u);
    plant(c, 'plant20', 0.98 * u, 0.04 * u, 0.4 * u, true);
    drawSprite(c, 'anemone', 1.18 * u, 0.03 * u, 0, 0.38 * u, 0.5, 1, 0, true);
  } },
  idol: { w: 1.4, h: 1.5, ax: 0.5, ay: 1, paint(c, u) {
    outlined(c, () => { c.beginPath(); c.rect(-0.55 * u, -0.22 * u, 1.1 * u, 0.22 * u); }, STONE, Math.max(1.5, u * 0.04));
    c.fillStyle = MOSS; c.fillRect(-0.5 * u, -0.24 * u, 0.3 * u, 0.04 * u);
    drawSprite(c, 'idol', 0, -0.2 * u, 0, 1.0 * u, 0.5, 1);
  } },
  mosaic: { mural: true },
};
/** A decoration's art spec. */
export function artOf(deco) { return ARTS[deco.art] || null; }

// ---------------------------------------------------------------- the mosaics (shells set into the back wall, cave-painting style)
const MOSAIC_COLS = ['#e8dcc0', '#d9a7a0', '#c9d6cf', '#e3c79a', '#b9c4c8'];
/** Points along a path every `step` (a polyline [[x, y], ...]). */
function along(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}
const circlePts = (cx, cy, r, a0 = 0, a1 = TAU, n = 40) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
/** The motif's lines in a unit box (x 0..W, y 0..1). */
function motifLines(motif, W) {
  const L = [];
  const fish = (cx, cy, s, dir = 1) => {
    L.push(circlePts(cx, cy, s, 0, TAU, 24).map(([x, y]) => [cx + (x - cx) * 1.5, y]));
    L.push([[cx - dir * s * 1.4, cy], [cx - dir * s * 2.3, cy - s * 0.8], [cx - dir * s * 2.3, cy + s * 0.8], [cx - dir * s * 1.4, cy]]);
    L.push([[cx + dir * s * 0.75, cy - s * 0.2]]);
  };
  const octo = (cx, cy, s) => {
    L.push(circlePts(cx, cy, s, Math.PI, TAU, 22));
    L.push([[cx - s, cy], [cx + s, cy]]);
    for (let k = 0; k < 4; k++) { const ax = cx - s * 0.75 + k * s * 0.5; L.push(Array.from({ length: 9 }, (_, j) => [ax + Math.sin(j * 0.8 + k) * s * 0.18, cy + j * s * 0.16])); }
    L.push([[cx - s * 0.35, cy - s * 0.45]], [[cx + s * 0.35, cy - s * 0.45]]);
  };
  if (motif === 'fish') { fish(W * 0.22, 0.32, 0.1, 1); fish(W * 0.5, 0.58, 0.13, 1); fish(W * 0.78, 0.36, 0.09, 1); fish(W * 0.36, 0.8, 0.07, 1); fish(W * 0.7, 0.78, 0.08, 1); }
  else if (motif === 'octopus') { octo(W * 0.5, 0.42, 0.3); L.push(circlePts(W * 0.15, 0.3, 0.05), circlePts(W * 0.85, 0.7, 0.06), circlePts(W * 0.8, 0.25, 0.04)); }
  else if (motif === 'whirl') { L.push(Array.from({ length: 90 }, (_, k) => { const a = k * 0.21, r = 0.04 + k * 0.0048; return [W * 0.5 + Math.cos(a) * r * 1.4, 0.5 + Math.sin(a) * r]; })); L.push(circlePts(W * 0.5, 0.5, 0.47, 0, TAU, 48).map(([x, y]) => [W * 0.5 + (x - W * 0.5) * 1.4, y])); }
  else { // the village: the octopus with the four it helped (a diver's helmet, the critter, the tall collector, the host)
    octo(W * 0.5, 0.42, 0.22);
    L.push(circlePts(W * 0.15, 0.52, 0.13), circlePts(W * 0.15, 0.52, 0.06)); // helmet with its window
    L.push(circlePts(W * 0.31, 0.7, 0.08)); L.push([[W * 0.27, 0.62], [W * 0.25, 0.54]], [[W * 0.35, 0.62], [W * 0.37, 0.54]]); // the critter's ears
    L.push([[W * 0.7, 0.85], [W * 0.7, 0.32]], circlePts(W * 0.7, 0.24, 0.08)); // the tall collector
    L.push([[W * 0.84, 0.85], [W * 0.9, 0.5], [W * 0.96, 0.85], [W * 0.84, 0.85]], circlePts(W * 0.9, 0.42, 0.07)); // the host
    L.push([[W * 0.04, 0.95], [W * 0.96, 0.95]]);
  }
  return L;
}
function paintMosaic(c, wPx, hPx, motif) {
  const u = hPx, W = wPx / hPx;
  // the far wall darkens softly behind the shells (a smudge, no edge: it is the cave's back wall, not a board)
  c.save();
  c.translate(wPx / 2, hPx / 2); c.scale(wPx / 2, hPx / 2);
  const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, 'rgba(12,30,40,0.3)'); gr.addColorStop(0.7, 'rgba(12,30,40,0.2)'); gr.addColorStop(1, 'rgba(12,30,40,0)');
  c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
  c.restore();
  const step = 0.055;
  let i = 0;
  for (const line of motifLines(motif, W)) {
    const pts = line.length === 1 ? line : along(line, step);
    for (const [x, y] of pts) {
      const px = x * u, py = y * u, s = u * (line.length === 1 ? 0.05 : 0.026 + hash(i) * 0.008);
      c.fillStyle = 'rgba(30,22,20,0.55)'; c.beginPath(); c.ellipse(px + u * 0.004, py + u * 0.006, s * 1.15, s * 0.85, hash(i + 3) * 3, 0, TAU); c.fill();
      c.fillStyle = line.length === 1 ? '#2a2220' : MOSAIC_COLS[Math.floor(hash(i * 7) * MOSAIC_COLS.length)];
      c.beginPath(); c.ellipse(px, py, s, s * 0.72, hash(i + 3) * 3, 0, TAU); c.fill();
      i++;
    }
  }
}

// ---------------------------------------------------------------- bakes and glows
const bakes = new Map(); // key -> {c, ox, oy, w, h} (ox, oy = the anchor inside the canvas, px)
let bakeScale = 0;
const BAKE_MAX = 48;
function bucket(ppu) { return Math.max(24, Math.min(112, Math.round(ppu / 4) * 4)); }
function bake(key, wT, hT, ax, ay, s, paint) {
  if (bakeScale !== s) { bakes.clear(); bakeScale = s; }
  let b = bakes.get(key);
  if (b) return b;
  if (bakes.size >= BAKE_MAX) bakes.clear();
  const m = 0.15; // margin (tiles): outlines and leaves past the box
  const c = document.createElement('canvas');
  c.width = Math.ceil((wT + m * 2) * s); c.height = Math.ceil((hT + m * 2) * s);
  const g = c.getContext('2d');
  const ox = (m + wT * ax) * s, oy = (m + hT * ay) * s;
  g.translate(ox, oy);
  g.lineJoin = 'round';
  paint(g, s);
  b = { c, ox, oy };
  bakes.set(key, b);
  return b;
}
/** The canvas of a decoration (anchor ox, oy), painted once per zoom bucket. */
function pieceBake(deco, s) {
  const a = artOf(deco);
  if (!a || a.mural) return null;
  const paint = deco.art === 'plaque' ? (g, u) => paintPlaque(g, u, deco.who) : a.paint;
  return bake('p:' + deco.id, a.w, a.h, a.ax, a.ay, s, paint);
}
function shelfBake(s) { // a little stone shelf jutting from a wall (a standing piece in a niche), anchor = its top at the wall
  return bake('shelf', 0.9, 0.45, 0, 0, s, (g, u) => {
    outlined(g, () => { g.beginPath(); g.moveTo(-0.15 * u, -0.02 * u); g.lineTo(0.74 * u, -0.01 * u); g.quadraticCurveTo(0.86 * u, 0.06 * u, 0.74 * u, 0.15 * u); g.quadraticCurveTo(0.4 * u, 0.24 * u, 0.12 * u, 0.4 * u); g.lineTo(-0.15 * u, 0.42 * u); g.closePath(); }, STONE, Math.max(1.5, u * 0.04));
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(0.05 * u, 0.12 * u); g.quadraticCurveTo(0.4 * u, 0.16 * u, 0.7 * u, 0.12 * u); g.quadraticCurveTo(0.4 * u, 0.22 * u, 0.1 * u, 0.36 * u); g.closePath(); g.fill();
    g.fillStyle = MOSS; g.beginPath(); g.ellipse(0.22 * u, -0.02 * u, 0.18 * u, 0.04 * u, 0, Math.PI, 0); g.fill();
  });
}
const glows = new Map();
function glowSprite(r, cool) {
  const R = Math.max(4, Math.round(r / 4) * 4), key = R + (cool ? 'c' : 'w');
  let c = glows.get(key);
  if (c) return c;
  if (glows.size > 24) glows.clear();
  c = document.createElement('canvas'); c.width = c.height = R * 2;
  const g = c.getContext('2d'), gr = g.createRadialGradient(R, R, 0, R, R, R);
  const inner = cool ? 'rgba(170,245,220,' : 'rgba(255,214,150,', outer = cool ? 'rgba(130,220,210,' : 'rgba(255,190,120,';
  gr.addColorStop(0, inner + '0.3)'); gr.addColorStop(0.45, outer + '0.11)'); gr.addColorStop(1, outer + '0)');
  g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
  glows.set(key, c);
  return c;
}

// ---------------------------------------------------------------- drawing in the world
function inView(camera, cw, ch, x, y, r) {
  const ppu = camera.pxPerUnit, hw = cw / ppu / 2 + r, hh = ch / ppu / 2 + r;
  return Math.abs(x - camera.x) < hw && Math.abs(y - camera.y) < hh;
}

/** One decoration on its spot (`t` for the hanging sway). */
function drawPiece(ctx, camera, cw, ch, spot, deco, t) {
  const a = artOf(deco);
  if (!a || a.mural) return;
  const ppu = camera.pxPerUnit, s = bucket(ppu), k = ppu / s;
  const b = pieceBake(deco, s);
  if (!b) return;
  const SX = cw / 2 + (spot.x - camera.x) * ppu, SY = ch / 2 + (spot.y - camera.y) * ppu;
  const blit = () => ctx.drawImage(b.c, -b.ox * k, -b.oy * k, b.c.width * k, b.c.height * k);
  const light = (lx, ly) => { for (const L of a.lights || []) { const r = L[2] * ppu, g = glowSprite(r, L[3]); ctx.drawImage(g, lx + L[0] * ppu - r, ly + L[1] * ppu - r, r * 2, r * 2); } };
  ctx.save();
  if (spot.type === 'hook') {
    const sway = Math.sin(t * 0.9 + spot.x * 1.7) * 0.05, L = a.rope * ppu;
    ctx.translate(SX, SY);
    ctx.rotate(sway);
    ctx.strokeStyle = ROPE; ctx.lineWidth = Math.max(1, ppu * 0.045);
    ctx.beginPath();
    if (a.vee) { ctx.moveTo(-a.vee * ppu, L + ppu * 0.08); ctx.lineTo(0, 0); ctx.lineTo(a.vee * ppu, L + ppu * 0.08); } else { ctx.moveTo(0, 0); ctx.lineTo(0, L + ppu * 0.02); }
    ctx.stroke();
    ctx.translate(0, L);
    ctx.save(); ctx.rotate(-sway * 0.5); light(0, 0); ctx.restore();
    blit();
  } else if (spot.type === 'niche') {
    const dir = spot.side === 'right' ? -1 : 1; // into the water
    if (a.grows) { // grows out of the rock
      ctx.translate(SX - dir * 0.06 * ppu, SY);
      ctx.rotate(dir * Math.PI / 2);
      blit();
    } else { // stands on a little shelf
      const sb = shelfBake(s);
      ctx.translate(SX, SY + 0.32 * ppu);
      ctx.save(); if (dir < 0) ctx.scale(-1, 1); ctx.drawImage(sb.c, -sb.ox * k, -sb.oy * k, sb.c.width * k, sb.c.height * k); ctx.restore();
      ctx.translate(dir * 0.42 * ppu, 0);
      if (a.ay === 0) ctx.translate(0, -(a.base || a.h) * ppu); // a hanging jar stands: lift it by its base
      light(0, 0);
      blit();
    }
  } else { // a floor piece
    ctx.translate(SX, SY);
    if (a.ay === 0) ctx.translate(0, -(a.base || a.h) * ppu); // a jar on the floor
    light(0, 0);
    blit();
  }
  ctx.restore();
}

/** The back-wall pass (behind plants and rock: main.js paintPass): the mosaics. */
export function drawHubBuildBack(ctx, camera, cw, ch, pieces) {
  if (!pieces.length || !buildArtReady()) return;
  const ppu = camera.pxPerUnit, s = bucket(ppu), k = ppu / s;
  for (const { spot, deco } of pieces) {
    if (spot.type !== 'mural' || deco.art !== 'mosaic' || !inView(camera, cw, ch, spot.x, spot.y, spot.w)) continue;
    const b = bake('m:' + deco.id + ':' + spot.w + 'x' + spot.h, spot.w, spot.h, 0.5, 0.5, s, (g, u) => { g.translate(-spot.w * u / 2, -spot.h * u / 2); paintMosaic(g, spot.w * u, spot.h * u, deco.motif); });
    ctx.save();
    ctx.globalAlpha *= 0.72; // set into the far wall: quieter than the pieces in the water
    ctx.drawImage(b.c, cw / 2 + (spot.x - camera.x) * ppu - b.ox * k, ch / 2 + (spot.y - camera.y) * ppu - b.oy * k, b.c.width * k, b.c.height * k);
    ctx.restore();
  }
}

/** The faint chalk outline of an empty spot (alpha: 0..1 by how near the closest octopus is). */
function drawOutline(ctx, camera, cw, ch, s, alpha, t) {
  const ppu = camera.pxPerUnit, SX = cw / 2 + (s.x - camera.x) * ppu, SY = ch / 2 + (s.y - camera.y) * ppu;
  ctx.save();
  ctx.globalAlpha = alpha * (0.5 + 0.12 * Math.sin(t * 2.2 + s.x));
  ctx.strokeStyle = '#e6efe4'; ctx.lineWidth = Math.max(1.5, ppu * 0.035); ctx.lineCap = 'round';
  ctx.setLineDash([ppu * 0.12, ppu * 0.1]);
  ctx.beginPath();
  switch (s.type) {
    case 'hook': ctx.moveTo(SX, SY); ctx.lineTo(SX, SY + ppu * 0.9); ctx.moveTo(SX + ppu * 0.28, SY + ppu * 1.2); ctx.arc(SX, SY + ppu * 1.2, ppu * 0.28, 0, TAU); break;
    case 'niche': { const d = s.side === 'right' ? -1 : 1; ctx.ellipse(SX + d * 0.06 * ppu, SY, ppu * 0.5, ppu * 0.62, 0, -Math.PI / 2 * d, Math.PI / 2 * d, d < 0); break; }
    case 'mural': { const w = s.w * ppu, h = s.h * ppu, x0 = SX - w / 2, y0 = SY - h / 2, c = Math.min(w, h) * 0.18; for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]]) { ctx.moveTo(x + dx * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * c); } break; }
    default: { const r = (s.type === 'plaza' ? 1.1 : 0.6) * ppu; ctx.ellipse(SX, SY - ppu * 0.06, r, r * 0.22, 0, 0, TAU); }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // a small chalk cross where the piece would go
  const p = s.type === 'hook' ? [SX, SY + ppu * 1.2] : s.type === 'niche' ? [SX + (s.side === 'right' ? -0.45 : 0.45) * ppu, SY] : s.type === 'mural' ? [SX, SY] : [SX, SY - ppu * 0.45];
  const r = ppu * 0.1;
  ctx.beginPath(); ctx.moveTo(p[0] - r, p[1] - r); ctx.lineTo(p[0] + r, p[1] + r); ctx.moveTo(p[0] + r, p[1] - r); ctx.lineTo(p[0] - r, p[1] + r); ctx.stroke();
  ctx.restore();
}

/**
 * The world pass (main.js v2Extra, with the hub rooms, before the octopus): the pile, the tally stone, the pieces, the chalk
 * outlines of empty spots near an octopus. `s` = {build (level.build), pieces (hub-build.js builtPieces), shells (the hoard's
 * balance), octos: [{x, y}], hubBuild ({spotId: decoId})}.
 */
export function drawHubBuild(ctx, camera, cw, ch, table, t, s) {
  const B = s.build;
  if (!B || !buildArtReady()) return;
  const ppu = camera.pxPerUnit, sc = bucket(ppu), k = ppu / sc;
  if (B.pile && inView(camera, cw, ch, B.pile.x, B.pile.y, 3)) {
    const st = pileStage(table, s.shells);
    const b = bake('pile:' + st, 2.6, 1.3, 0.5, 1, sc, (g, u) => paintPile(g, u, st));
    ctx.drawImage(b.c, cw / 2 + (B.pile.x - camera.x) * ppu - b.ox * k, ch / 2 + (B.pile.y - camera.y) * ppu - b.oy * k, b.c.width * k, b.c.height * k);
  }
  if (B.tally && inView(camera, cw, ch, B.tally.x, B.tally.y, 2)) {
    const marks = Math.min(15, Math.max(1, Math.ceil(Math.sqrt(s.shells | 0))));
    const b = bake('tally:' + marks, 0.6, 0.7, 0.5, 1, sc, (g, u) => paintTally(g, u, marks));
    ctx.drawImage(b.c, cw / 2 + (B.tally.x - camera.x) * ppu - b.ox * k, ch / 2 + (B.tally.y - camera.y) * ppu - b.oy * k, b.c.width * k, b.c.height * k);
  }
  for (const p of s.pieces) if (p.spot.type !== 'mural' && inView(camera, cw, ch, p.spot.x, p.spot.y, 3)) drawPiece(ctx, camera, cw, ch, p.spot, p.deco, t);
  for (const sp of B.spots) {
    if (!sp.open || s.hubBuild[sp.id] || !inView(camera, cw, ch, sp.x, sp.y, 3)) continue;
    let d = 1e9;
    for (const o of s.octos) { const px = sp.type === 'hook' ? sp.x : sp.x, py = sp.type === 'hook' ? sp.y + 1.2 : sp.y - 0.4; d = Math.min(d, Math.hypot(o.x - px, o.y - py) - (sp.type === 'mural' ? Math.min(sp.w, sp.h) / 2 : 0)); }
    if (d < OUTLINE_NEAR) drawOutline(ctx, camera, cw, ch, sp, Math.min(1, (OUTLINE_NEAR - d) / 1.2), t);
  }
}

/** A picker card's preview: the decoration fitted into a `w` x `h` canvas (a hanging piece with a short rope). */
export function paintDecoPreview(cv, deco, spotType) {
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  if (!buildArtReady()) return false;
  const a = artOf(deco);
  if (!a) return false;
  g.lineJoin = 'round';
  if (a.mural) {
    const W = 1.6, H = 1;
    const u = Math.min(cv.width * 0.92 / W, cv.height * 0.92 / H);
    g.translate((cv.width - W * u) / 2, (cv.height - H * u) / 2);
    g.fillStyle = '#3c6a78'; g.fillRect(0, 0, W * u, H * u);
    paintMosaic(g, W * u, H * u, deco.motif);
    return true;
  }
  const hang = a.ay === 0;
  const W = a.w + 0.2, H = a.h + (hang ? 0.35 : 0.15);
  const u = Math.min(cv.width * 0.9 / W, cv.height * 0.9 / H);
  g.translate(cv.width / 2 - (0.5 - a.ax) * a.w * u, hang ? (cv.height - H * u) / 2 + 0.3 * u : (cv.height + H * u) / 2 - 0.08 * u);
  if (hang) { g.strokeStyle = ROPE; g.lineWidth = Math.max(1, u * 0.04); g.beginPath(); g.moveTo(0, -0.3 * u); g.lineTo(0, 0); g.stroke(); }
  if (deco.art === 'plaque') paintPlaque(g, u, deco.who); else a.paint(g, u);
  void spotType;
  return true;
}

/** Tests: the bake cache (keys) and the glow sprites. */
export function buildBakeStats() { return { bakes: [...bakes.keys()], glows: glows.size, scale: bakeScale }; }
