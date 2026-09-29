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
  rune1: loadImage(ASSET('decor-rune1.webp')),
  rune3: loadImage(ASSET('decor-rune3.webp')),
  rune5: loadImage(ASSET('decor-rune5.webp')),
  bush2: loadImage(ASSET('decor-bush2.webp')),
};

function ready(img) { return img.complete && img.naturalWidth > 0; }

// Round-3 fix (Daniel's screenshot review: "rune glyphs are drawn inside a
// visible pale-blue rectangle, and float in open water beside the walls
// instead of sitting on the rock face"). The old tint drew straight onto the
// main canvas with `globalCompositeOperation = 'source-atop'` -- but
// `source-atop` only keeps the *new* paint where the canvas ALREADY has
// opaque pixels, and by the time this ran the whole scene behind it (rock,
// water, whatever else already drew) was opaque, not just the rune sprite,
// so the fill landed as a solid pale-blue rectangle over everything under
// it. Tinting on a small offscreen canvas -- draw the glyph alone, then
// `source-atop` fill just that canvas -- keeps the transparency mask scoped
// to the sprite's own alpha, so only the glyph's own pixels tint. Built once
// per rune kind and cached (never per frame, never per instance).
const tintedRuneCache = {};
function getTintedRune(kind) {
  const cached = tintedRuneCache[kind];
  if (cached) return cached;
  const img = IMAGES[kind];
  if (!ready(img)) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cctx = c.getContext('2d');
  cctx.drawImage(img, 0, 0);
  cctx.globalCompositeOperation = 'source-atop';
  cctx.fillStyle = 'rgba(150,205,255,0.75)';
  cctx.fillRect(0, 0, c.width, c.height);
  tintedRuneCache[kind] = c;
  return c;
}

/** Draws one critter with its idle motion baked into the transform, so the
 * caller never needs per-frame state -- everything is a function of `time`
 * and the critter's own fixed `phase`. Motion is skipped (static pose) under
 * prefers-reduced-motion, same convention as every other M7 juice effect. */
function drawOne(ctx, camera, worldToScreen, canvasW, canvasH, c, time, reduced) {
  const img = IMAGES[c.kind];
  if (!ready(img)) return;
  let worldSize = 0.6;
  let dx = 0, dy = 0, rot = 0, scaleY = 1, alpha = 1;
  let facingRight = null; // non-null overrides c.flip with a direction-of-travel mirror (fish, round-7)
  const t = reduced ? 0 : time;

  if (c.kind === 'fish') {
    // Round-2 fix (Daniel's screenshot review: critter fish read ~25px,
    // nearly octopus-sized; octo-video-fish-swarm.webp shows them at about a
    // third of the octopus).
    worldSize = 0.25;
    const phaseArg = t * 0.6 + c.phase;
    dx = Math.sin(phaseArg) * 0.5;
    dy = Math.sin(t * 1.3 + c.phase * 1.7) * 0.12;
    // Round-7 fix (Daniel's screenshot review round 6, item 4: "ambient fish
    // all face right and never flip... half the time they swim backwards").
    // `critter-fish.webp`'s default art faces -x (head/nose to the left,
    // same convention as the piranha sprite); the old code never mirrored it
    // at all, so every fish drew nose-left even on the half of its sin()
    // oscillation where dx's own derivative (velocity) pointed +x -- tail
    // first, and identical for every fish on screen. `cos(phaseArg)` is that
    // derivative's sign (d/dt of sin is cos); mirror the sprite whenever it's
    // positive (moving +x/right) so the fish always faces the way it's
    // actually swimming.
    facingRight = Math.cos(phaseArg) > 0;
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
  } else if (c.kind === 'rune1' || c.kind === 'rune3' || c.kind === 'rune5') {
    worldSize = 0.36;
    rot = Math.sin(t * 0.7 + c.phase) * 0.08;
    // Round-2 fix (Daniel's screenshot review: "the white rune glyphs float
    // in open water beside walls; in the video, rune and cross marks are
    // drawn ON the rock face in a pale blue"). decor.js's round-2 INTO_WALL
    // bump already pulls these flush against the rim; lowering the alpha
    // ceiling here (was 0.65-1.0, bright white) makes them read as a faint
    // mark on the rock rather than a floating bright glyph, and the pale-
    // blue tint below (drawn after the sprite, `source-atop`) replaces the
    // source art's white with the video's pale-blue rune colour.
    alpha = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.4 + c.phase));
  } else if (c.kind === 'bush2') {
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
  // (wallDir -1/+1); a fish (facingRight, round-7) mirrors to match its
  // current direction of travel; everything else keeps its deterministic
  // random flip.
  const flip = c.wallDir ? c.wallDir < 0 : facingRight !== null ? facingRight : c.flip;
  ctx.scale(flip ? -1 : 1, scaleY);
  // Round-2 fix (Daniel's screenshot review): the bright lime `bushmini`
  // blobs read far more saturated than the video's pale sage/beige plants;
  // mute it at draw time (no new art) rather than editing the source webp.
  // Round-4 fix (Daniel's screenshot review round 3): `bush2` reads just as
  // over-saturated and was never muted the same way -- same filter.
  // Round-6 fix (Daniel's screenshot review round 5, "muddy yellow jelly
  // critter": `critter-jelly.webp` was never actually spawned -- see
  // decor.js's CRITTER_KINDS_OPEN -- so the "jelly" being flagged was this
  // filter: `sepia()` specifically rotates hue toward yellow-brown, and
  // stacked with grayscale+saturate it pushed the bush's green well past
  // "muted sage" into a muddy yellow-olive blob (worse still hanging off a
  // ceiling with a drooping leaf, which reads exactly like a dripping
  // jellyfish). Desaturating without the sepia hue-shift keeps it a pale,
  // muted GREEN -- what round-2/4 actually asked for -- instead of yellow.
  // Round-7 fix (Daniel's screenshot review round 6, item 5: "bush decor
  // shows as a blurry, outline-less green smudge"). A `ctx.filter` graph
  // forces the browser to rasterize the sprite through an offscreen filter
  // pass rather than blit it directly -- fine for a few pixels of hue/
  // brightness shift, but stacked on top of the image already being scaled
  // up from a small source it read as soft/blurry rather than crisp,
  // unlike every other sprite in the game (all drawn filter-free). Dropped:
  // `bushmini` is gone entirely (see decor.js), and `bush2`'s own source art
  // is a plausible muted green already, so it draws unfiltered/native now,
  // same as every other critter/decor sprite.
  const isRune = c.kind === 'rune1' || c.kind === 'rune3' || c.kind === 'rune5';
  const drawImg = isRune ? (getTintedRune(c.kind) || img) : img;
  ctx.drawImage(drawImg, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Draws every visible non-hostile wall critter/decor instance. Called from
 * render.js's per-frame draw list, between the walls/plants layer and the
 * enemies layer, same as `drawBubbles`.
 *
 * Round-4 fix (Daniel's screenshot review round 3: "runes float in open
 * water beside the rock" -- their deep INTO_WALL anchor (decor.js) puts them
 * inside the solid tile, but this whole layer used to draw BEFORE the wall
 * bake, so the opaque rock painted right over them, leaving only whatever
 * sliver of the glyph poked out past the tile edge into open water visible --
 * exactly a "floating beside the rock" read. Runes now draw in a separate
 * pass, AFTER the wall bake (render.js calls this twice), landing on TOP of
 * the rock face as a painted mark, like octo-video-cave-urchin.webp. Every
 * other kind keeps drawing before the walls (tucked under the rim), so
 * `runesOnly` filters which pass a given call handles. */
export function drawCritters(ctx, camera, worldToScreen, canvasW, canvasH, critters, time, runesOnly = false) {
  const reduced = prefersReducedMotion();
  for (const c of critters) {
    const isRune = c.kind === 'rune1' || c.kind === 'rune3' || c.kind === 'rune5';
    if (isRune !== runesOnly) continue;
    drawOne(ctx, camera, worldToScreen, canvasW, canvasH, c, time, reduced);
  }
}
