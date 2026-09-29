// Wall-critter art + idle motion (Otter, "alive pass", this session --
// NIGHT-LOG.md). Positions/kinds come from decor.js's `visibleCritters`
// (pure, derived from chunk tile data); this file only draws them and
// supplies the small idle animations (bob, sway, blink, a tiny crawl) so the
// walls read as inhabited, matching the same draw-function-per-layer shape
// as enemy-draw.js's `drawEnemies`/`drawBombs`/`drawParticles`.
//
// Sources (ASSETS.md): `Critter1Fish`/`Critter4JellyFish`/`Critter5Snail`
// (Assets/Sprites/NPCs/Critters -- Milan's non-hostile critter art,
// `CritterHealth.cs` marks these immune to enemy damage in the original),
// `Eye`/`EyeBlue` (Assets/Sprites/Background), and the kept bucket-D
// `Rune{1,3,5}`/`Bush2`/`BushMini`. (The `Hole01`/`Hole02` "wall hole"
// critter was removed in the round-1 visual-fixes pass -- Daniel's
// screenshot review: it read as a bullet hole, not a cave feature.)

import { prefersReducedMotion } from './config.js';

const ASSET = (name) => new URL(`../assets/${name}`, import.meta.url).href;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const IMAGES = {
  fish: loadImage(ASSET('critter-fish.webp')),
  jelly: loadImage(ASSET('critter-jelly.webp')),
  snail: loadImage(ASSET('critter-snail.webp')),
  eye: loadImage(ASSET('decor-eye.webp')),
  eyeblue: loadImage(ASSET('decor-eyeblue.webp')),
  rune1: loadImage(ASSET('decor-rune1.webp')),
  rune3: loadImage(ASSET('decor-rune3.webp')),
  rune5: loadImage(ASSET('decor-rune5.webp')),
  bush2: loadImage(ASSET('decor-bush2.webp')),
  bushmini: loadImage(ASSET('decor-bushmini.webp')),
};

function ready(img) { return img.complete && img.naturalWidth > 0; }

/** Draws one critter with its idle motion baked into the transform, so the
 * caller never needs per-frame state -- everything is a function of `time`
 * and the critter's own fixed `phase`. Motion is skipped (static pose) under
 * prefers-reduced-motion, same convention as every other M7 juice effect. */
function drawOne(ctx, camera, worldToScreen, canvasW, canvasH, c, time, reduced) {
  const img = IMAGES[c.kind];
  if (!ready(img)) return;
  let worldSize = 0.6;
  let dx = 0, dy = 0, rot = 0, scaleY = 1, alpha = 1;
  const t = reduced ? 0 : time;

  if (c.kind === 'fish') {
    worldSize = 0.45;
    dx = Math.sin(t * 0.6 + c.phase) * 0.5;
    dy = Math.sin(t * 1.3 + c.phase * 1.7) * 0.12;
  } else if (c.kind === 'jelly') {
    worldSize = 0.55;
    dy = Math.sin(t * 0.9 + c.phase) * 0.2;
    dx = Math.sin(t * 0.4 + c.phase) * 0.1;
    alpha = 0.75 + 0.15 * Math.sin(t * 1.1 + c.phase);
  } else if (c.kind === 'snail') {
    worldSize = 0.32;
    // A slow, barely-visible crawl back and forth along its own wall cell.
    dx = c.onFloor || c.onCeiling ? Math.sin(t * 0.05 + c.phase) * 0.3 : 0;
    dy = !c.onFloor && !c.onCeiling ? Math.sin(t * 0.05 + c.phase) * 0.3 : 0;
  } else if (c.kind === 'eye' || c.kind === 'eyeblue') {
    worldSize = 0.4;
    // A rare blink: mostly open, briefly squashed flat.
    const cycle = (t * 0.18 + c.phase) % (Math.PI * 2);
    const blink = Math.sin(cycle * 6);
    scaleY = blink > 0.985 ? 0.12 : 1;
  } else if (c.kind === 'rune1' || c.kind === 'rune3' || c.kind === 'rune5') {
    worldSize = 0.36;
    rot = Math.sin(t * 0.7 + c.phase) * 0.08;
    alpha = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.4 + c.phase));
  } else if (c.kind === 'bush2' || c.kind === 'bushmini') {
    worldSize = 0.55;
    rot = Math.sin(t * 0.8 + c.phase) * 0.1;
  }

  const s = worldToScreen(camera, canvasW, canvasH, c.x + dx, c.y + dy);
  const h = worldSize * camera.pxPerUnit;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(s.x, s.y);
  if (c.onCeiling) ctx.scale(1, -1); // hang the sprite from the ceiling right-side up in world space
  if (rot) ctx.rotate(rot);
  // Side-wall critters face outward from the wall they're anchored into
  // (wallDir -1/+1); everything else keeps its deterministic random flip.
  const flip = c.wallDir ? c.wallDir < 0 : c.flip;
  ctx.scale(flip ? -1 : 1, scaleY);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Draws every visible non-hostile wall critter/decor instance. Called from
 * render.js's per-frame draw list, between the walls/plants layer and the
 * enemies layer, same as `drawBubbles`. */
export function drawCritters(ctx, camera, worldToScreen, canvasW, canvasH, critters, time) {
  const reduced = prefersReducedMotion();
  for (const c of critters) drawOne(ctx, camera, worldToScreen, canvasW, canvasH, c, time, reduced);
}
