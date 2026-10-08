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
import { visibleObj, cullView } from './cull.js';
import { getFoliageTable } from './foliage.js';

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
// the foliage sheet (data/foliage.json "art"): Daniel's six runes and the background crystals / pebbles live there
let sheetImg = null;
function sheet() { if (!sheetImg) sheetImg = loadImage(ASSET('foliage.webp')); return sheetImg; }
function sheetCell(id) {
  const T = getFoliageTable();
  if (!T) return -1;
  return T.ids.indexOf(id);
}

function ready(img) { return img.complete && img.naturalWidth > 0; }

/** Kinds drawn in the second pass, on top of the wall bake: rune glyphs, (r37) the procedural fossils and the
 * background generator's crystals and pebbles. */
function onWallPass(kind) { return kind.startsWith('rune') || kind.startsWith('fossil') || kind === 'embed'; }

/** A crystal / pebble cluster of the original's BackgroundPattern1, on the rock face, in its own colours. */
function drawEmbedded(ctx, camera, worldToScreen, canvasW, canvasH, c) {
  const T = getFoliageTable(), img = sheet();
  if (!T || !ready(img)) return;
  const k = c.fk, s = worldToScreen(camera, canvasW, canvasH, c.x, c.y);
  const h = T.h[k] * c.scale * camera.pxPerUnit, w = T.w[k] * c.scale * camera.pxPerUnit;
  ctx.save();
  ctx.globalAlpha = T.alpha[k];
  ctx.translate(s.x, s.y); ctx.rotate(-c.rot); if (c.flip) ctx.scale(-1, 1); // Unity z rotation is counter-clockwise, y up
  ctx.drawImage(img, T.sx[k], T.sy[k], T.sw[k], T.sh[k], -w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * A fossil in the rock: thin, slightly wobbly dark-teal lines at low alpha that sink into the rock, like a faint pencil
 * drawing of an ammonite, a fish skeleton or a bone (no pale fill, no stamped edge). Drawn flat on the face, no
 * animation. Size in screen px; rot in radians; `seed` (the critter's phase) fixes the wobble so it never shimmers.
 */
function drawFossil(ctx, x, y, size, kind, rot, flip, alpha, seed = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let n = 0;
  const wob = () => Math.sin((n++) * 12.9898 + seed * 78.233) * 0.5; // deterministic -0.5..0.5
  // a hand-drawn stroke: a slightly bowed curve instead of a ruler line
  const seg = (x0, y0, x1, y1) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, b = wob() * size * 0.05;
    ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx - dy / len * b, my + dx / len * b, x1 + wob() * size * 0.012, y1 + wob() * size * 0.012);
  };
  const blob = (cx, cy, rx, ry) => { // a wobbly loop
    for (let k = 0; k <= 10; k++) {
      const a = k / 10 * Math.PI * 2, j = 1 + wob() * 0.14, px = cx + Math.cos(a) * rx * j, py = cy + Math.sin(a) * ry * j;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  };
  ctx.beginPath();
  if (kind === 'fossil-shell') { // an ammonite: a spiral with growth ribs
    for (let t = 0; t <= 11; t += 0.3) {
      const r = size * (0.03 + 0.036 * t) * (1 + wob() * 0.05), a = t * 0.62;
      if (t === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (let t = 3.5; t <= 11; t += 1.5) {
      const a = t * 0.62, r0 = size * (0.03 + 0.036 * t), r1 = size * (0.03 + 0.036 * (t - 2.4));
      seg(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    }
  } else if (kind === 'fossil-fish') { // a fish skeleton: skull, spine, ribs and a forked tail
    const L = size * 0.9;
    blob(-L * 0.42, 0, L * 0.12, L * 0.08);
    seg(-L * 0.3, 0, L * 0.34, 0);
    for (let k = 0; k < 5; k++) { const rx = -L * 0.2 + k * L * 0.1, rh = L * (0.1 - Math.abs(k - 1.6) * 0.012); seg(rx, 0, rx + L * 0.03, -rh); seg(rx, 0, rx + L * 0.03, rh); }
    seg(L * 0.34, 0, L * 0.5, -L * 0.1); seg(L * 0.34, 0, L * 0.5, L * 0.1);
  } else { // a bone: a shaft with a knob at each end
    const L = size * 0.78, k = size * 0.07;
    seg(-L / 2, 0, L / 2, 0);
    for (const sx of [-1, 1]) { blob(sx * L / 2, -k, k, k); blob(sx * L / 2, k, k, k); }
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(8,44,52,0.9)'; ctx.lineWidth = Math.max(1.2, size * 0.04); ctx.stroke(); // thin dark-teal line
  ctx.translate(size * 0.012, size * 0.016);
  ctx.globalAlpha = alpha * 0.28; ctx.strokeStyle = 'rgba(150,200,205,1)'; ctx.lineWidth = Math.max(0.8, size * 0.02); ctx.stroke(); // the faintest light edge below it
  ctx.restore();
}

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
  const img = IMAGES[kind] || sheet();
  if (!ready(img)) return null;
  const c = document.createElement('canvas');
  const cctx = c.getContext('2d');
  if (IMAGES[kind]) {
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    cctx.drawImage(img, 0, 0);
  } else { // rune2 / rune4 / rune6: a cell of the foliage sheet
    const T = getFoliageTable(), k = sheetCell(kind);
    if (k < 0) return null;
    c.width = T.sw[k]; c.height = T.sh[k];
    cctx.drawImage(img, T.sx[k], T.sy[k], T.sw[k], T.sh[k], 0, 0, c.width, c.height);
  }
  cctx.globalCompositeOperation = 'source-atop';
  cctx.fillStyle = 'rgba(10,48,58,0.95)'; // vibefix: a dark-teal scratch in the rock like the fossils, not a bright pale-blue stamp
  cctx.fillRect(0, 0, c.width, c.height);
  tintedRuneCache[kind] = c;
  return c;
}

/** Draws one critter with its idle motion baked into the transform, so the
 * caller never needs per-frame state -- everything is a function of `time`
 * and the critter's own fixed `phase`. Motion is skipped (static pose) under
 * prefers-reduced-motion, same convention as every other M7 juice effect. */
function drawOne(ctx, camera, worldToScreen, canvasW, canvasH, c, time, reduced) {
  if (c.kind.startsWith('fossil')) {
    const s = worldToScreen(camera, canvasW, canvasH, c.x, c.y);
    drawFossil(ctx, s.x, s.y, camera.pxPerUnit * 0.85, c.kind, (c.phase - Math.PI) * 0.5, c.flip, 0.85, c.phase);
    return;
  }
  if (c.kind === 'embed') { drawEmbedded(ctx, camera, worldToScreen, canvasW, canvasH, c); return; }
  const isRune = c.kind.startsWith('rune');
  const img = isRune ? getTintedRune(c.kind) : IMAGES[c.kind];
  if (!img || (!isRune && !ready(img))) return;
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
  } else if (isRune) {
    worldSize = 0.4;
    rot = Math.sin(t * 0.7 + c.phase) * 0.08;
    // Round-2 fix (Daniel's screenshot review: "the white rune glyphs float
    // in open water beside walls; in the video, rune and cross marks are
    // drawn ON the rock face in a pale blue"). decor.js's round-2 INTO_WALL
    // bump already pulls these flush against the rim; lowering the alpha
    // ceiling here (was 0.65-1.0, bright white) makes them read as a faint
    // mark on the rock rather than a floating bright glyph, and the pale-
    // blue tint below (drawn after the sprite, `source-atop`) replaces the
    // source art's white with the video's pale-blue rune colour.
    alpha = 0.62 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.4 + c.phase)); // vibefix: dark teal, so a lower alpha still reads and sinks into the rock
  } else if (c.kind === 'bush2') {
    worldSize = 0.55;
    rot = Math.sin(t * 0.8 + c.phase) * 0.1;
  }

  const s = worldToScreen(camera, canvasW, canvasH, c.x + dx, c.y + dy);
  const h = worldSize * camera.pxPerUnit;
  const w = h * (isRune ? img.width / img.height : img.naturalWidth / img.naturalHeight);
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
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
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
  cullView(camera, canvasW, canvasH);
  for (const c of critters) {
    if (onWallPass(c.kind) !== runesOnly) continue;
    if (!visibleObj(c, c.x, c.y, 3)) continue; // r43: off-screen critters are not animated or drawn
    drawOne(ctx, camera, worldToScreen, canvasW, canvasH, c, time, reduced);
  }
}
