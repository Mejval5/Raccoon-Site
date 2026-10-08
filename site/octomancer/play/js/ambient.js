// Ambient fish the world can lose (Actions tuning, 2026-10-08; Daniel: "ink does not hit the little fish"). Two kinds of
// harmless background fish are drawn from placement data, not simulated:
//   'fish'        decor.js open-water critters (critter-fish.webp), drifting +-0.5 tiles (decor-draw.js drawOne)
//   'greenranha'  the foliage hover fish (data/foliage.json 'greenranha', render.js drawFoliageInstance), +-0.15 tiles
// An Ink Jet blob that touches one kills it Spelunky style: it is struck off the level (killAmbient: a set of dead base
// positions that decor.visibleCritters and render.js drawPlants skip), and a small belly-up corpse ('ambient-<kind>',
// corpses.js) sinks in its place. ambientPos() gives the same drawn position the art uses, so the hit lands on the fish
// you see. The set is per level: resetAmbient() on every new level.

import { setCorpseArt, drawDeadEye } from './corpses-draw.js';
import { getFoliageTable } from './foliage.js';

const dead = new Set();
const key = (x, y) => Math.round(x * 8) + ',' + Math.round(y * 8);

export function resetAmbient() { dead.clear(); }
/** Strike the fish placed at base (x, y) off the level. */
export function killAmbient(x, y) { dead.add(key(x, y)); }
export function isAmbientDead(x, y) { return dead.size > 0 && dead.has(key(x, y)); }
export function ambientDeadCount() { return dead.size; }

/** Hit radius (tiles) per kind: about the drawn body. */
export const AMBIENT_R = { fish: 0.2, greenranha: 0.22 };

/** Where the fish with base (x, y) and `phase` is drawn at `time` (same motion as its art); writes out.x / out.y. */
export function ambientPos(kind, x, y, phase, time, reduced, out) {
  const t = reduced ? 0 : time;
  if (kind === 'fish') { out.x = x + Math.sin(t * 0.6 + phase) * 0.5; out.y = y + Math.sin(t * 1.3 + phase * 1.7) * 0.12; }
  else { out.x = x + Math.sin(t * 0.5 + phase) * 0.15; out.y = y + Math.sin(t * 1.3 + phase * 1.7) * 0.06; }
  return out;
}

// ---- corpse art: the fish's own sprite, darker and belly up, a dead eye ----
const LIMP = 'brightness(0.68) saturate(0.5)';
let fishImg = null, sheetImg = null;
function img(which) {
  if (typeof Image === 'undefined') return null;
  if (which === 'fish') { if (!fishImg) { fishImg = new Image(); fishImg.src = new URL('../assets/critter-fish.webp', import.meta.url).href; } return fishImg; }
  if (!sheetImg) { sheetImg = new Image(); sheetImg.src = new URL('../assets/foliage.webp', import.meta.url).href; }
  return sheetImg;
}
function bodyArt(kind, worldW) {
  return (ctx, sx, sy, ppu, rot, face, alpha) => {
    const im = img(kind);
    if (!im || !im.complete || !im.naturalWidth) return;
    let srcX = 0, srcY = 0, srcW = im.naturalWidth, srcH = im.naturalHeight;
    if (kind === 'greenranha') {
      const T = getFoliageTable();
      const k = T ? T.ids.indexOf('greenranha') : -1;
      if (k < 0) return;
      srcX = T.sx[k]; srcY = T.sy[k]; srcW = T.sw[k]; srcH = T.sh[k];
    }
    const w = worldW * ppu, h = w * srcH / srcW;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy); ctx.rotate(rot); ctx.scale(face > 0 ? -1 : 1, -1); // the art faces -x; belly up
    if ('filter' in ctx) ctx.filter = LIMP;
    ctx.drawImage(im, srcX, srcY, srcW, srcH, -w / 2, -h / 2, w, h);
    if ('filter' in ctx) ctx.filter = 'none';
    drawDeadEye(ctx, -w * 0.28, -h * 0.08, ppu * 0.035, ppu, false);
    ctx.restore();
  };
}
setCorpseArt('ambient-fish', bodyArt('fish', 0.25 * 1.4));
setCorpseArt('ambient-greenranha', bodyArt('greenranha', 0.36));
