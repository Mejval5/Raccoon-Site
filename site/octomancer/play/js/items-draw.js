// Code-drawn icons for the carried items (round 32): used by the HUD (small canvases), the shop pedestals and the
// hidden-pocket items. drawItemIcon(ctx, id, cx, cy, r) draws inside a circle of radius r around (cx, cy).

import { drawSprite, spriteAspect, onSpritesReady } from './sprites.js';

const TAU = Math.PI * 2;

// Sprites for the items that have one (generated, Milan style: img/v2/, octomancer-web/ASSETS.md). They load the first
// time they are drawn; until then the code-drawn fallback below stands in. itemArtVersion() goes up when one arrives,
// so a cached icon (the HUD's small canvases) can redraw.
const SPRITES = { goggles: 'item-goggles.webp' };
const sprites = {};
let artVersion = 0;
export function itemArtVersion() { return artVersion; }
onSpritesReady(() => { artVersion++; }); // r46: the atlas icons (flippers, lantern, lodestone, bomb bag, heart container) arrived
function sprite(id) {
  if (!SPRITES[id] || typeof Image === 'undefined') return null;
  let img = sprites[id];
  if (!img) {
    img = sprites[id] = new Image();
    img.addEventListener('load', () => { artVersion++; }, { once: true });
    img.src = new URL('../img/v2/' + SPRITES[id], import.meta.url).href;
  }
  return img.complete && img.naturalWidth ? img : null;
}

function outline(ctx, r, fill, stroke) {
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1.2, r * 0.16); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}

export function drawItemIcon(ctx, id, x, y, r) {
  // r46: the generated Milan-style icons (sprites.js); the code drawings below stay as the fallback until the atlas has loaded
  if (id === 'lantern') {
    const g = ctx.createRadialGradient(x, y + r * 0.15, r * 0.05, x, y + r * 0.15, r * 1.1); // its own soft light
    g.addColorStop(0, 'rgba(255,226,150,0.45)'); g.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + r * 0.15, r * 1.1, 0, TAU); ctx.fill();
  }
  const a = spriteAspect(id), d = 2 * r * 0.98;
  if (drawSprite(ctx, id, x, y, a >= 1 ? d : d * a, a >= 1 ? d / a : d, 0.5, 0.5)) return;
  ctx.save();
  ctx.translate(x, y);
  const img = sprite(id);
  if (img) {
    // the sprite fills the icon circle's width (2.1 r), keeping its aspect
    const w = r * 2.15, h = w * img.naturalHeight / img.naturalWidth;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else if (id === 'goggles') {
    // fallback until the sprite has loaded: two sea-glass lenses in kelp rims, a kelp strap behind
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2a10'; ctx.lineWidth = Math.max(2, r * 0.3);
    ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.95, r * 0.55, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = '#6b6a24'; ctx.lineWidth = Math.max(1.2, r * 0.18);
    ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.95, r * 0.55, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    for (const s of [-1, 1]) {
      outline(ctx, r, '#5e5c1e', '#22200a');
      ctx.beginPath(); ctx.arc(s * r * 0.47, r * 0.12, r * 0.46, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = s < 0 ? '#a9cfae' : '#a6d3cf';
      ctx.beginPath(); ctx.arc(s * r * 0.47, r * 0.12, r * 0.3, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#4e4c18'; ctx.beginPath(); ctx.arc(0, r * 0.14, r * 0.12, 0, TAU); ctx.fill();
  } else if (id === 'flippers') {
    // a pair of fins: two leaf shapes side by side
    outline(ctx, r, '#f59a2a', '#4a2406'); // orange: cyan vanished against the Shallows water on a pedestal
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.15, r * 0.85);
      ctx.bezierCurveTo(s * r * 0.95, r * 0.45, s * r * 1.05, -r * 0.55, s * r * 0.45, -r * 0.9);
      ctx.bezierCurveTo(s * r * 0.15, -r * 0.55, s * r * 0.05, r * 0.1, s * r * 0.15, r * 0.85);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.6); ctx.lineTo(-r * 0.4, r * 0.35); ctx.moveTo(r * 0.45, -r * 0.6); ctx.lineTo(r * 0.4, r * 0.35); ctx.stroke();
  } else if (id === 'lantern') {
    // a small lantern: ring on top, glass body with a flame
    const g = ctx.createRadialGradient(0, r * 0.1, r * 0.05, 0, r * 0.1, r * 1.1);
    g.addColorStop(0, 'rgba(255,240,160,0.9)'); g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, r * 0.1, r * 1.1, 0, TAU); ctx.fill();
    outline(ctx, r, '#ffd868', '#4a3208');
    ctx.beginPath(); ctx.roundRect(-r * 0.52, -r * 0.4, r * 1.04, r * 1.1, r * 0.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b4a12';
    ctx.fillRect(-r * 0.62, -r * 0.55, r * 1.24, r * 0.2); ctx.fillRect(-r * 0.62, r * 0.62, r * 1.24, r * 0.2);
    ctx.strokeStyle = '#4a3208'; ctx.beginPath(); ctx.arc(0, -r * 0.72, r * 0.3, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.ellipse(0, r * 0.18, r * 0.16, r * 0.3, 0, 0, TAU); ctx.fill();
  } else if (id === 'magnet') {
    // a horseshoe magnet: red arch, pale tips
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#0b1a2a'; ctx.lineWidth = r * 0.78;
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.55, Math.PI, TAU); ctx.lineTo(r * 0.55, r * 0.6); ctx.moveTo(-r * 0.55, -r * 0.05); ctx.lineTo(-r * 0.55, r * 0.6); ctx.stroke();
    ctx.strokeStyle = '#e0453c'; ctx.lineWidth = r * 0.56;
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.55, Math.PI, TAU); ctx.lineTo(r * 0.55, r * 0.35); ctx.moveTo(-r * 0.55, -r * 0.05); ctx.lineTo(-r * 0.55, r * 0.35); ctx.stroke();
    ctx.fillStyle = '#e8eef4'; ctx.strokeStyle = '#0b1a2a'; ctx.lineWidth = Math.max(1, r * 0.1);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(s * r * 0.55 - r * 0.28, r * 0.35, r * 0.56, r * 0.4); ctx.fill(); ctx.stroke(); }
  } else if (id === 'bombbag') {
    // a drawstring sack tied at the neck, a black bomb with a lit fuse poking out of the top (same look as the bomb glyph)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#0b1218'; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.fillStyle = '#26303a';
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.63, r * 0.1, 0, TAU); ctx.fill();
    // fuse and spark
    ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.beginPath(); ctx.moveTo(r * 0.14, -r * 0.88); ctx.quadraticCurveTo(r * 0.32, -r * 1.05, r * 0.5, -r * 0.95); ctx.stroke();
    ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.arc(r * 0.52, -r * 0.96, r * 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(r * 0.52, -r * 0.96, r * 0.07, 0, TAU); ctx.fill();
    // the sack: flared lip, pinched neck, round belly
    outline(ctx, r, '#c99a5a', '#3a2410');
    ctx.beginPath();
    ctx.moveTo(-r * 0.46, -r * 0.3);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.18, -r * 0.2, -r * 0.05);
    ctx.bezierCurveTo(-r * 1.05, r * 0.15, -r * 1.0, r * 0.92, 0, r * 0.92);
    ctx.bezierCurveTo(r * 1.0, r * 0.92, r * 1.05, r * 0.15, r * 0.2, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.18, r * 0.46, -r * 0.3);
    ctx.quadraticCurveTo(0, -r * 0.1, -r * 0.46, -r * 0.3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // belly shading and the drawstring tie with two tails
    ctx.fillStyle = 'rgba(58,36,16,0.22)'; ctx.beginPath(); ctx.ellipse(r * 0.38, r * 0.5, r * 0.28, r * 0.38, 0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b3f16'; ctx.lineWidth = Math.max(1.4, r * 0.15);
    ctx.beginPath(); ctx.moveTo(-r * 0.24, -r * 0.04); ctx.lineTo(r * 0.24, -r * 0.04); ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.02); ctx.lineTo(r * 0.3, r * 0.2); ctx.moveTo(r * 0.02, -r * 0.02); ctx.lineTo(r * 0.06, r * 0.26); ctx.stroke();
  } else if (id === 'heartcontainer') {
    // a heart in a glass vial
    outline(ctx, r, 'rgba(210,235,255,0.35)', '#9fc4e0');
    ctx.beginPath(); ctx.roundRect(-r * 0.78, -r * 0.8, r * 1.56, r * 1.65, r * 0.5); ctx.fill(); ctx.stroke();
    outline(ctx, r * 0.8, '#ff5a6e', '#5a0f1c');
    const k = r * 0.62;
    ctx.beginPath(); ctx.moveTo(0, k * 0.95);
    ctx.bezierCurveTo(-k * 1.5, -k * 0.05, -k * 0.85, -k * 1.1, 0, -k * 0.4);
    ctx.bezierCurveTo(k * 0.85, -k * 1.1, k * 1.5, -k * 0.05, 0, k * 0.95);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-k * 0.45, -k * 0.3, k * 0.17, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
