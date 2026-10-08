// Enemy + bomb art and particle rendering. OVERNIGHT.md §4 M3-3, M6-2.
// Urchin/piranha/cannon/shot/Beholder/crabs/horns/manta are Milan's
// sprites, exported to display size in play/assets/ (web/ASSETS.md has the
// source rows); the bomb itself, its fuse spark, the explosion ring and
// debris are code-drawn (OVERNIGHT.md §2 art rule: "Drawn in code ... bomb
// ... explosion, particles").

import { BOMB_RADIUS } from './config.js';
import { visibleObj, cullView } from './cull.js';

const ASSET = (name) => new URL(`../assets/${name}`, import.meta.url).href;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const urchinImg = loadImage(ASSET('enemy-urchin.webp'));
const piranhaImg = loadImage(ASSET('enemy-piranha.webp'));
const cannonImg = loadImage(ASSET('enemy-cannon.webp'));
const shotImg = loadImage(ASSET('enemy-shot.webp'));
const beholderFrames = [0, 1, 2, 3, 4, 5].map((i) => loadImage(ASSET(`enemy-beholder-${i}.webp`)));
// M6: the 2021 creatures (`CrabFlatten`/`CrabFlatten2`, `NPC6`,
// `NPC10`/`NPC10Ball` -- OldAssets/.../NPC.old/, DECISIONS §2).
const crabSlowImg = loadImage(ASSET('enemy-crab-slow.webp'));
const crabFastImg = loadImage(ASSET('enemy-crab-fast.webp'));
const hornsImg = loadImage(ASSET('enemy-horns.webp'));
const mantaImg = loadImage(ASSET('enemy-manta.webp'));
const mantaBallImg = loadImage(ASSET('enemy-manta-ball.webp'));

function ready(img) { return img.complete && img.naturalWidth > 0; }

// Round-3 fix (Daniel's screenshot review: crabs float about half a tile
// above the floor they walk on, and the ceiling "horns" spike floats below
// the ceiling with a gap of water above it). Root cause: `gen.js` spawns
// every enemy slot at its open cell's centre (`y+0.5`), and both draw calls
// below drew their sprite centred exactly there, with no regard for
// `e.placement`. That centres a floor-walking crab about half its own
// height above the actual floor surface, and the rim art itself is inset a
// little further still from the tile edge on top of that (the same inset
// `decor.js`'s wall critters already correct for). Rather than move the
// enemy's simulation `x`/`y` (which also drives collision -- out of scope
// for a visual-only pass), nudge the *draw* position toward the anchor
// surface: floor placements draw further down (toward positive y, since the
// solid floor tile is at y+1), ceiling placements further up, by enough to
// close the half-sprite gap plus the rim's own inset. Mirrors `PLANT_INTO_WALL`
// (render.js) and `INTO_WALL` (decor.js), the same "anchor slightly into the
// solid neighbour" idea already used for plants and wall critters.
// Round-4 fix (Daniel's screenshot review round 3: "floor crabs hover 5-10px
// above the rim"). 0.15 undershot the gap: the crab sprites' own transparent
// bottom padding (their canvas is several px taller than the drawn body) eats
// into the push before any of it reaches the visible rim surface. Bumped so
// the crab's OWN visible feet -- not just its canvas bottom edge -- reach the
// rim.
const GROUND_RIM_INSET = 0.26;
// Round-9 fix (Daniel's screenshot review round 8, issue 2: "floor crabs are
// sunk about 0.25-0.3 tile into the rock ... eyes/mouth below the rim line,
// feet hidden") and issue 4 ("horns base ring set a little below the rim,
// into the rock"). Round-8's segment-vs-outline collision (world.js's
// `wallSegmentsNear`) now rests emplacements on the SAME smoothed/traced rim
// the wall art draws, which already sits higher than the raw-tile floor the
// shared GROUND_RIM_INSET was tuned against -- the crab's draw push
// (0.5 - 0.35 + 0.26 = 0.41 for its 0.7 worldSize) now overshoots well past
// that rim into the rock. Per-kind overrides (rather than lowering the
// shared constant) so urchin/cannon, which weren't reported as regressed,
// keep the round-4/5 tuning that's still correct for them.
const CRAB_RIM_INSET = 0.02; // push = 0.5-0.35+0.02 = 0.17 (was 0.41)
const HORNS_RIM_INSET = 0.18; // push = 0.5-0.45+0.18 = 0.23 (was 0.31)
// Round-10 fix (review round 9 leftover, issue A2: "urchins sink into rock
// ... push them out along the surface normal so the sphere edge lands on the
// rim and only the spikes cross it"). Same round-8 root cause as the crab/
// horns fixes above (collision moved onto the smoothed/traced rim, which
// sits higher than the raw tile grid GROUND_RIM_INSET was tuned against),
// but the urchin's own round-5 tuning was never revisited. The urchin's
// drawn body is a central sphere with spikes radiating well past its own
// canvas edge, so (unlike crab/horns, which want their visible feet flush
// with the rim) the urchin wants a SMALLER push than GROUND_RIM_INSET: just
// enough that the sphere itself sits at the rim, letting the spikes overlap
// the solid tile the way they visibly do in the promo stills.
const URCHIN_RIM_INSET = 0.1; // push = 0.5-0.45+0.1 = 0.15 (was 0.31)
// Round-11 fix (review round 10 leftover, issue 3: "a floor cannon in a
// concave corner sinks 0.2-0.3 tile below the floor rim ... looks
// half-buried"). Same round-8/round-10 root cause as urchin/crab/horns
// above: the cannon's floor/wall `surfaceDrawOffsetXY` call never got its
// own inset and was still using the shared `GROUND_RIM_INSET` (0.26, tuned
// pre-round-8 for the raw tile grid), which overshoots the smoothed/traced
// rim collision now rests on (push = 0.5-0.45+0.26 = 0.31 for its 0.9
// worldSize). A smaller, urchin-sized inset brings its base flush with the
// rim instead of sunk into the rock.
const CANNON_RIM_INSET = 0.1; // push = 0.5-0.45+0.1 = 0.15 (was 0.31)
function surfaceDrawOffset(placement, worldSize, inset = GROUND_RIM_INSET) {
  const push = 0.5 - worldSize / 2 + inset;
  if (placement === 'floor') return push;
  if (placement === 'ceiling') return -push;
  return 0;
}

// Round-5 fix (Daniel's screenshot review round 4, issue 3: "urchins float
// in open water 0.3-0.6 tile off the wall/ceiling they were placed against").
// `urchin` never called `surfaceDrawOffset` at all, so it always drew at the
// open cell's own centre regardless of placement; `cannon` had the same gap
// for its `floor`/`wall` placements (only ever seen past 80m depth). Also
// adds the horizontal case `surfaceDrawOffset` never had, for a `wall`
// placement, using the spawn's own `wallDir` (gen.js: +1 = solid tile is to
// the right, -1 = to the left) to push toward whichever side is solid.
function surfaceDrawOffsetXY(placement, wallDir, worldSize, inset = GROUND_RIM_INSET) {
  const dy = surfaceDrawOffset(placement, worldSize, inset);
  if (placement === 'wall' && wallDir) {
    const push = 0.5 - worldSize / 2 + inset;
    return { dx: push * wallDir, dy: 0 };
  }
  return { dx: 0, dy };
}

/** Draw one image centered at world (x,y), sized to `worldSize` units tall
 * (width follows the image's own aspect ratio), tinted red briefly on hit. */
function drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, x, y, worldSize, angle, hitFlash) {
  if (!ready(img)) return;
  const s = worldToScreen(camera, canvasW, canvasH, x, y);
  const h = worldSize * camera.pxPerUnit;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.translate(s.x, s.y);
  if (angle) ctx.rotate(angle);
  if (hitFlash > 0) {
    ctx.filter = `brightness(${1 + hitFlash * 2}) saturate(${1 - hitFlash * 0.6})`;
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// Round-6 task 3 (NIGHT-LOG.md): "interpolate render positions between fixed
// 50 Hz steps (octopus, enemies, camera) using the loop's alpha ... no
// snapping." Enemies only ever moved at their raw simulation position before
// this (the octopus already interpolated, render.js's `drawOcto`), so a
// fast mover like a chasing piranha or the Beholder visibly stair-stepped
// once per fixed step. `ix`/`iy` below blend each enemy's last-step and
// current position the same way `drawOcto` already does; a stationary
// emplacement (urchin/cannon/horns, `moving` false and `prevX===x`) is
// unaffected since the interpolation is a no-op when the position didn't
// change.
function interpPos(e, alpha) {
  const px = e.prevX === undefined ? e.x : e.prevX;
  const py = e.prevY === undefined ? e.y : e.prevY;
  return { x: px + (e.x - px) * alpha, y: py + (e.y - py) * alpha };
}

// Round 35: telegraphs and reactions are drawn from the enemy's own pattern fields (enemies.js): `tell` 0..1 while it
// winds up (white pulse, a glow, pose), `stun` > 0 after a blast (hit flash, wobble, orbiting stars), `ghost` for the
// 60 ms white after-image of a dash kill.
const HALF_PI = Math.PI / 2;

/** The white-flash strength (0..1.2) for an enemy this frame. */
function flashOf(e, time) {
  let f = e.hitFlash || 0;
  if (e.stun > 0) f = Math.max(f, 0.3 + 0.3 * Math.abs(Math.sin(time * 34)));
  if (e.tell > 0) f = Math.max(f, 0.15 + 0.5 * Math.abs(Math.sin(time * (16 + 26 * e.tell))));
  return f;
}

/** A soft round glow behind a telegraphing enemy. */
function drawTellGlow(ctx, sx, sy, ppu, tell, time) {
  const r = ppu * (0.8 + 0.5 * tell);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  const a = (0.25 + 0.4 * tell) * (0.7 + 0.3 * Math.sin(time * 30));
  g.addColorStop(0, `rgba(255,236,140,${a.toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,236,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
}

/** A yellow "!" over a piranha that has noticed the octopus. */
function drawBang(ctx, sx, sy, ppu, tell) {
  const s = ppu * (0.32 + 0.1 * tell);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3a1608'; ctx.lineWidth = Math.max(2, s * 0.22);
  ctx.fillStyle = '#ffe85a';
  ctx.beginPath(); ctx.moveTo(-s * 0.2, -s); ctx.lineTo(s * 0.2, -s); ctx.lineTo(s * 0.12, -s * 0.28); ctx.lineTo(-s * 0.12, -s * 0.28); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.14, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
  ctx.restore();
}

/** Three small bubbles circling and rising above a stunned enemy (a woozy head): pale fill, soft ink outline. */
function drawStunStars(ctx, sx, sy, ppu, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(220,242,255,0.55)'; ctx.strokeStyle = 'rgba(30,50,70,0.7)'; ctx.lineWidth = Math.max(1, ppu * 0.02);
  for (let k = 0; k < 3; k++) {
    const a = time * 5 + k * 2.094, rise = ((time * 0.9 + k / 3) % 1);
    const x = sx + Math.cos(a) * ppu * 0.32, y = sy - ppu * (0.45 + 0.35 * rise) + Math.sin(a) * ppu * 0.08, r = ppu * (0.045 + 0.03 * (1 - rise));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,242,255,0.55)';
  }
  ctx.restore();
}

/** The cannon's barrel along its aim (e.aim, radians) with a muzzle glow while it charges. */
/** Ink Jet hits leave dark blotches on the creature (inkjet.js sets inkStain = seconds left, inkHits = how many hits): one more blotch per hit,
 * fading over the last 1.5 s. Flat dark fills, no outline, laid out by golden angle so the same enemy always looks the same. */
function drawInkStain(ctx, sx, sy, ppu, e) {
  const hits = e.inkHits || 1, rad = (e.radius || 0.4) * ppu;
  ctx.globalAlpha = 0.85 * Math.min(1, e.inkStain / 1.5);
  ctx.fillStyle = '#1a1030';
  ctx.beginPath();
  for (let k = 0; k < hits + 1; k++) {
    const a = k * 2.399 + 0.6, d = rad * (0.15 + 0.5 * ((k * 5) % 7) / 7), r = ppu * (0.028 + 0.022 * ((k * 3) % 4) / 3);
    const px = sx + Math.cos(a) * d, py = sy + Math.sin(a) * d * 0.8;
    ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.moveTo(px + Math.cos(a) * d * 0.35 + r * 0.5, py + r); // a smaller drip beside it
    ctx.arc(px + Math.cos(a) * d * 0.35, py + r, r * 0.5, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBarrel(ctx, sx, sy, ppu, e, time) {
  const a = e.aim;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(a);
  const len = ppu * 0.62, w = ppu * 0.2;
  ctx.fillStyle = '#26323d'; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = Math.max(1.5, ppu * 0.035);
  ctx.beginPath(); ctx.rect(ppu * 0.1, -w / 2, len, w); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5b6f80';
  ctx.fillRect(ppu * 0.1 + len * 0.82, -w * 0.62, len * 0.18, w * 1.24); // muzzle ring
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(ppu * 0.1, -w / 2, len * 0.8, w * 0.25);
  if (e.tell > 0) { // the charge: a glow growing at the muzzle
    const mx = ppu * 0.1 + len + ppu * 0.04, r = ppu * (0.18 + 0.4 * e.tell);
    const g = ctx.createRadialGradient(mx, 0, 0, mx, 0, r);
    g.addColorStop(0, 'rgba(255,250,200,0.95)'); g.addColorStop(0.4, 'rgba(255,190,70,0.6)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, 0, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawEnemies(ctx, camera, worldToScreen, canvasW, canvasH, enemies, shots, time, alpha = 1) {
  const ppu = camera.pxPerUnit;
  cullView(camera, canvasW, canvasH);
  for (const e of enemies) {
    if (e.dead) continue;
    if (!visibleObj(e, e.x, e.y, 3)) continue; // r43: far from the camera it is not animated or drawn (its AI and collisions run in enemies.js)
    const { x: ex, y: ey } = interpPos(e, alpha);
    const fl = flashOf(e, time);
    const tell = e.tell || 0;
    const wob = e.stun > 0 ? Math.sin(time * 28) * 0.18 : 0; // a stunned enemy wobbles
    let sc = null; // a screen position for the overlays, set per kind
    if (e.kind === 'urchin') {
      const { dx, dy } = surfaceDrawOffsetXY(e.placement, e.wallDir, 0.9, URCHIN_RIM_INSET);
      const size = 0.9 * (0.94 + 0.14 * (e.pulse === undefined ? 0.5 : e.pulse)); // slow spike pulse
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, urchinImg, ex + dx, ey + dy, size, wob, fl);
      sc = worldToScreen(camera, canvasW, canvasH, ex + dx, ey + dy);
    } else if (e.kind === 'piranha') {
      // The art (enemy-piranha.webp) faces -x; a left/right mirror reads correctly at every heading and never turns it
      // upside down (round-1 fix). The facing is the enemy's own `face` (it changes only when it turns or notices you),
      // so a piranha hovering at vx ~ 0 no longer flickers between left and right.
      const face = e.face !== undefined ? e.face : ((e.vx || e.dir || 1) > 0 ? 1 : -1);
      let px = ex, py = ey, tilt = wob;
      if (tell > 0) { px -= face * 0.16 * tell; py += Math.sin(time * 60) * 0.02; } // the wind-up: it pulls back and shivers
      if (e.st === 2 && !e.ghost) tilt = (face > 0 ? 1 : -1) * Math.atan2(e.ly, Math.abs(e.lx)); // lunging: nose along the line
      sc = worldToScreen(camera, canvasW, canvasH, px, py);
      if (tell > 0) drawTellGlow(ctx, sc.x, sc.y, ppu, tell, time);
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, piranhaImg, px, py, 1.15, face > 0, false, fl, tilt);
      if (tell > 0) drawBang(ctx, sc.x, sc.y - ppu * 0.75, ppu, tell);
    } else if (e.kind === 'cannon') {
      const { dx, dy } = surfaceDrawOffsetXY(e.placement, e.wallDir, 0.9, CANNON_RIM_INSET);
      // wall placement: the base sits against the solid side (gen.js wallDir: +1 = solid to the right), see round 10
      const angle = e.placement === 'wall' && e.wallDir ? -e.wallDir * Math.PI / 2 : 0;
      sc = worldToScreen(camera, canvasW, canvasH, ex + dx, ey + dy);
      if (tell > 0) drawTellGlow(ctx, sc.x, sc.y, ppu, tell * 0.7, time);
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, cannonImg, ex + dx, ey + dy, 0.9, angle + wob, fl);
      if (e.aim !== undefined && !e.ghost) drawBarrel(ctx, sc.x, sc.y, ppu, e, time);
    } else if (e.kind === 'beholder') {
      const frame = beholderFrames[Math.floor(time * 8) % beholderFrames.length];
      const pulse = 1 + Math.sin(time * 6) * 0.04;
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, frame, ex, ey, 1.6 * pulse, 0, 0);
    } else if (e.kind === 'crab') {
      const img = e.variant === 'fast' ? crabFastImg : crabSlowImg;
      const dy = surfaceDrawOffset(e.placement, 0.7, CRAB_RIM_INSET);
      // CS_PAUSE rears up (taller, narrower, shivering); CS_SNAP is a wide lunge of the claws
      let sx = 1, sy = 1, lunge = 0;
      if (e.st === 1) { sx = 0.92; sy = 1 + 0.2 * tell; }
      else if (e.st === 2) { sx = 1.3; sy = 0.9; lunge = 0.12 * (e.dir < 0 ? -1 : 1); }
      const shift = (e.placement === 'ceiling' ? -1 : 1) * 0.7 * (1 - sy) / 2;
      sc = worldToScreen(camera, canvasW, canvasH, ex, ey + dy);
      if (tell > 0) drawTellGlow(ctx, sc.x, sc.y, ppu, tell * 0.6, time);
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, ex + lunge + (tell > 0 ? Math.sin(time * 70) * 0.012 : 0), ey + dy + shift, 0.7, (e.face !== undefined ? e.face : e.dir) < 0, e.placement === 'ceiling', fl, wob, sx, sy);
    } else if (e.kind === 'horns') {
      const flip = e.placement === 'ceiling';
      const dy = surfaceDrawOffset(e.placement, 0.9, HORNS_RIM_INSET);
      const sy = 0.93 + 0.14 * (e.pulse === undefined ? 0.5 : e.pulse); // the spikes grow and shrink slowly from their base
      const shift = (flip ? -1 : 1) * 0.9 * (1 - sy) / 2;
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, hornsImg, ex, ey + dy + shift, 0.9, false, flip, fl, 0, 1, sy);
      sc = worldToScreen(camera, canvasW, canvasH, ex, ey + dy);
    } else if (e.kind === 'manta') {
      const face = e.face !== undefined ? e.face : e.dir;
      let tilt = wob, py = ey;
      if (tell > 0) { tilt += face * 0.35 * tell; py += Math.sin(time * 60) * 0.02; } // the tell: it banks nose-down
      else if (e.st === 2 && !e.ghost) tilt += face * 0.7;
      sc = worldToScreen(camera, canvasW, canvasH, ex, py);
      if (tell > 0) drawTellGlow(ctx, sc.x, sc.y, ppu, tell, time);
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, mantaImg, ex, py, 0.9, face < 0, false, fl, tilt);
      if (tell > 0) drawBang(ctx, sc.x, sc.y - ppu * 0.6, ppu, tell);
    }
    if (e.inkStain > 0 && sc) drawInkStain(ctx, sc.x, sc.y, ppu, e);
    if (e.stun > 0 && sc) drawStunStars(ctx, sc.x, sc.y, ppu, time);
  }
  for (const s of shots) {
    if (s.dead) continue;
    if (!visibleObj(s, s.x, s.y, 1)) continue;
    const angle = Math.atan2(s.vy, s.vx);
    const img = s.radius > 0.23 ? shotImg : mantaBallImg;
    drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, s.x, s.y, 0.4, angle, 0);
  }
}

// V2-PLAN 16: corpses reuse each enemy's own sprite. kind -> [image, drawn height in tiles]
const BODY_SPRITES = {
  urchin: [urchinImg, 0.9], piranha: [piranhaImg, 1.15], cannon: [cannonImg, 0.9], crab: [crabSlowImg, 0.7],
  'crab-fast': [crabFastImg, 0.7], horns: [hornsImg, 0.9], manta: [mantaImg, 0.9],
};
/** Draw a kind's sprite centred on screen point (sx, sy) at `ppu` px per tile, rotated `rot` radians, mirrored in x / y,
 * with an optional canvas filter. Returns the drawn size {w, h} in px (for overlays), or null when not ready / unknown. */
export function drawEnemyBody(ctx, kind, sx, sy, ppu, rot, flipX, flipY, filter) {
  const e = BODY_SPRITES[kind];
  if (!e || !ready(e[0])) return null;
  const img = e[0], h = e[1] * ppu, w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.translate(sx, sy);
  if (rot) ctx.rotate(rot);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  if (filter) ctx.filter = filter;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return { w, h };
}

/** Like `drawSprite`, but can mirror horizontally (walk direction) and/or vertically (hanging from a ceiling), tilt
 * (`rot`, radians, applied before the mirror) and squash / stretch (`sx`, `sy`) for the M6 creatures. */
function drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, x, y, worldSize, flipX, flipY, hitFlash, rot = 0, sx = 1, sy = 1) {
  if (!ready(img)) return;
  const s = worldToScreen(camera, canvasW, canvasH, x, y);
  const h = worldSize * camera.pxPerUnit;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.translate(s.x, s.y);
  if (rot) ctx.rotate(rot);
  ctx.scale((flipX ? -1 : 1) * sx, (flipY ? -1 : 1) * sy);
  if (hitFlash > 0) {
    ctx.filter = `brightness(${1 + hitFlash * 2}) saturate(${Math.max(0, 1 - hitFlash * 0.6)})`;
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Code-drawn bomb: a dark shell with a lit fuse spark; once exploded, an
 * expanding ring shockwave for its brief lingering frame. */
export function drawBombs(ctx, camera, worldToScreen, canvasW, canvasH, bombs, time) {
  for (const b of bombs) {
    const s = worldToScreen(camera, canvasW, canvasH, b.x, b.y);
    const r = camera.pxPerUnit * 0.32;
    if (!b.exploded) {
      // body (rolls: the fuse stub turns with the distance travelled), a lit fuse spark that blinks faster as it burns down
      const rot = b.rot || 0;
      const burn = 1 - Math.max(0, b.fuse) / (b.fuse0 || 1.5); // 0 fresh .. 1 about to go
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = '#20262c';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0a0d10';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.24, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(rot);
      const len = r * (0.75 - 0.35 * burn); // the fuse shortens as it burns
      ctx.strokeStyle = '#8f8366'; ctx.lineWidth = Math.max(2, r * 0.2); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.quadraticCurveTo(r * 0.3, -r * 0.85 - len * 0.7, r * 0.15, -r * 0.9 - len); ctx.stroke();
      const lit = Math.sin(time * (6 + burn * 22) * Math.PI) > -0.3;
      const sx = r * 0.15, sy = -r * 0.9 - len;
      ctx.restore();
      // fuse fizz (screen space): the lit tip is a pale bubbling point, three tiny bubbles rise off it
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const spx = s.x + sx * cs - sy * sn, spy = s.y + sx * sn + sy * cs;
      ctx.fillStyle = lit ? 'rgba(235,248,255,0.95)' : 'rgba(170,205,225,0.8)';
      ctx.beginPath(); ctx.arc(spx, spy, r * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(210,238,255,0.8)'; ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const ph = (time * (1.6 + burn * 2.4) + k / 3) % 1;
        ctx.beginPath(); ctx.arc(spx + Math.sin(ph * 9 + k * 2) * r * 0.18, spy - ph * r * 1.1, r * (0.07 + 0.05 * ph), 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      drawBlast(ctx, s.x, s.y, camera.pxPerUnit * BOMB_RADIUS, b.age / 0.4);
    }
  }
}

// The blast: a silt-and-bubble burst. An ink-dark core that swells and fades, a pale shock ring that races out to exactly
// BLAST_DRAW_RADIUS (= BOMB_RADIUS, the lethal radius) and fades there, and a very short pale flash. Nothing is drawn
// beyond R; the bubbles and the lingering silt are pooled particles (particles.js blastBurst). `t` runs 0..1 over the
// 0.4 s the bomb lingers. No gradients, no shadow blur: a few arcs.
export const BLAST_DRAW_RADIUS = BOMB_RADIUS;
function drawBlast(ctx, x, y, R, t) {
  t = Math.max(0, Math.min(1, t));
  const q = Math.min(1, t / 0.3), ease = 1 - (1 - q) * (1 - q) * (1 - q); // the ring arrives at R by t = 0.3 and then holds, fading
  ctx.save();
  const fade = 1 - t * t;
  // faint cold water tint inside the ring
  ctx.fillStyle = `rgba(200,225,235,${(0.22 * fade).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, Math.max(1, R * ease), 0, Math.PI * 2); ctx.fill();
  // ink-dark core
  const ca = 0.85 * Math.max(0, 1 - t * 1.25);
  if (ca > 0) {
    ctx.fillStyle = `rgba(21,13,28,${ca.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, R * (0.18 + 0.4 * ease), 0, Math.PI * 2); ctx.fill();
  }
  // very short pale flash
  if (t < 0.12) {
    ctx.fillStyle = `rgba(235,247,255,${(0.7 * (1 - t / 0.12)).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, R * (0.2 + 0.3 * ease), 0, Math.PI * 2); ctx.fill();
  }
  // pale shock ring with a soft ink outline; the outer edge of the outline sits on R
  const lw = Math.max(2, R * 0.045), ringR = Math.max(1, R * ease - (lw + 2) / 2);
  ctx.strokeStyle = `rgba(25,40,55,${(0.55 * fade).toFixed(3)})`; ctx.lineWidth = lw + 2;
  ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(226,244,255,${(0.95 * fade).toFixed(3)})`; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** vibe fixes: one soft round cloud (white, alpha falling to 0 at the rim), baked once; silt particles draw it tinted by their colour. */
let siltSprites = null;
function siltSprite(color) {
  if (!siltSprites) siltSprites = new Map();
  let c = siltSprites.get(color);
  if (c || typeof document === 'undefined') return c || null;
  c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d'), m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color) || [0, 130, 128, 108];
  const grad = g.createRadialGradient(24, 24, 1, 24, 24, 24);
  grad.addColorStop(0, `rgba(${m[1]},${m[2]},${m[3]},0.75)`); grad.addColorStop(0.5, `rgba(${m[1]},${m[2]},${m[3]},0.4)`); grad.addColorStop(1, `rgba(${m[1]},${m[2]},${m[3]},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 48, 48);
  siltSprites.set(color, c);
  return c;
}

export function drawParticles(ctx, camera, worldToScreen, canvasW, canvasH, particlePool) {
  cullView(camera, canvasW, canvasH);
  for (const p of particlePool) {
    if (!p.active) continue;
    if (!visibleObj(p, p.x, p.y, 0.5)) continue; // r43
    const s = worldToScreen(camera, canvasW, canvasH, p.x, p.y);
    if (p.soft) { // silt: a soft cloud that swells and thins out as it settles (no hard disc edge)
      const img = siltSprite(p.color);
      if (img) {
        const t = Math.max(0, p.life / p.maxLife), r = p.size * camera.pxPerUnit * (1.5 + (1 - t) * 0.8);
        const ga = ctx.globalAlpha; ctx.globalAlpha = Math.min(1, t * 1.6) * 0.8;
        ctx.drawImage(img, s.x - r, s.y - r, r * 2, r * 2);
        ctx.globalAlpha = ga;
      }
      continue;
    }
    // V2-PLAN 16: a sticky chunk (a splat's gore) keeps its size and only fades in its last second
    const alpha = p.sticky ? Math.min(1, p.life) : Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const r = p.size * camera.pxPerUnit * (p.sticky ? 1 : alpha);
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill();
    if (p.sticky) { ctx.strokeStyle = '#181012'; ctx.lineWidth = Math.max(1, r * 0.22); ctx.stroke(); } // Milan's dark outline
    ctx.restore();
  }
}
