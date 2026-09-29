// Enemy + bomb art and particle rendering. OVERNIGHT.md §4 M3-3, M6-2.
// Urchin/piranha/cannon/shot/Beholder/mine/crabs/horns/manta are Milan's
// sprites, exported to display size in play/assets/ (web/ASSETS.md has the
// source rows); the bomb itself, its fuse spark, the explosion ring and
// debris are code-drawn (OVERNIGHT.md §2 art rule: "Drawn in code ... bomb
// ... explosion, particles").

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
// M6: the 2021 creatures (`NPC8`, `CrabFlatten`/`CrabFlatten2`, `NPC6`,
// `NPC10`/`NPC10Ball` -- OldAssets/.../NPC.old/, DECISIONS §2).
const mineImg = loadImage(ASSET('enemy-mine.webp'));
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
// emplacement (urchin/cannon/horns/mine, `moving` false and `prevX===x`) is
// unaffected since the interpolation is a no-op when the position didn't
// change.
function interpPos(e, alpha) {
  const px = e.prevX === undefined ? e.x : e.prevX;
  const py = e.prevY === undefined ? e.y : e.prevY;
  return { x: px + (e.x - px) * alpha, y: py + (e.y - py) * alpha };
}

export function drawEnemies(ctx, camera, worldToScreen, canvasW, canvasH, enemies, shots, time, alpha = 1) {
  for (const e of enemies) {
    if (e.dead) continue;
    const { x: ex, y: ey } = interpPos(e, alpha);
    if (e.kind === 'urchin') {
      const { dx, dy } = surfaceDrawOffsetXY(e.placement, e.wallDir, 0.9, URCHIN_RIM_INSET);
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, urchinImg, ex + dx, ey + dy, 0.9, 0, e.hitFlash);
    } else if (e.kind === 'piranha') {
      // Round-1 fix (Daniel's screenshot review: "some enemies render upside
      // down"): this used to rotate the full sprite by atan2(vy,vx), as if
      // its default art pointed along +x. The art (enemy-piranha.webp)
      // actually faces -x (nose/dorsal-fin-up to the left) -- rotating a
      // left-facing sprite by close to 180 deg (moving left, vy~=0) flips it
      // both horizontally AND vertically, landing belly-up. A left/right
      // mirror (matching how crab/horns/manta already handle direction) reads
      // correctly at every heading and never turns it upside down.
      // Round-2 fix (Daniel's screenshot review: piranhas read ~1.3x the
      // octopus, video shows ~3x; the Unity `Piranha` prefab's own collider
      // is 2.04x1.28 at 0.9 scale, ~1.8 tiles long -- 0.7 world units tall
      // (~1.2 tiles) undersold that).
      const vx = e.vx || (e.dir || 0);
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, piranhaImg, ex, ey, 1.15, vx > 0, false, e.hitFlash);
    } else if (e.kind === 'cannon') {
      const { dx, dy } = surfaceDrawOffsetXY(e.placement, e.wallDir, 0.9);
      // Round-10 fix (review round 9 leftover, issue A1: "wall-placed
      // cannons: rotate the sprite by wallDir so the base sits on the wall
      // rim, body in open water"). The sprite art is drawn base-down for a
      // floor placement (angle 0: the base sits at ex,ey+dy, barrel pointing
      // up into open water). A wall placement instead needs the base against
      // whichever side is solid (gen.js's wallDir: +1 = solid to the right,
      // -1 = solid to the left) and the barrel pointing into open water on
      // the opposite side. Canvas rotate() is clockwise in this y-down
      // space, so rotating the base-down sprite by -90deg swings its base
      // from pointing +y to pointing +x (right); +90deg swings it to -x
      // (left) -- i.e. angle = -wallDir * PI/2.
      const angle = e.placement === 'wall' && e.wallDir ? -e.wallDir * Math.PI / 2 : 0;
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, cannonImg, ex + dx, ey + dy, 0.9, angle, e.hitFlash);
    } else if (e.kind === 'beholder') {
      const frame = beholderFrames[Math.floor(time * 8) % beholderFrames.length];
      const pulse = 1 + Math.sin(time * 6) * 0.04;
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, frame, ex, ey, 1.6 * pulse, 0, 0);
      // Dread: a soft light cone toward the octopus grows as it nears (M7
      // will tune this further; a first cut lands here since the Beholder is
      // brand-new this milestone).
    } else if (e.kind === 'mine') {
      const flash = e.state === 'armed' ? 1 : e.hitFlash;
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, mineImg, ex, ey, 0.8, 0, flash);
    } else if (e.kind === 'crab') {
      const img = e.variant === 'fast' ? crabFastImg : crabSlowImg;
      // Face the walk direction; flip vertically when it's hanging from a
      // ceiling so it always reads feet-toward-the-surface.
      const dy = surfaceDrawOffset(e.placement, 0.7, CRAB_RIM_INSET);
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, ex, ey + dy, 0.7, e.dir < 0, e.placement === 'ceiling', e.hitFlash);
    } else if (e.kind === 'horns') {
      const flip = e.placement === 'ceiling';
      const dy = surfaceDrawOffset(e.placement, 0.9, HORNS_RIM_INSET);
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, hornsImg, ex, ey + dy, 0.9, false, flip, e.hitFlash);
    } else if (e.kind === 'manta') {
      drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, mantaImg, ex, ey, 0.9, e.dir < 0, false, e.hitFlash);
    }
  }
  for (const s of shots) {
    if (s.dead) continue;
    const angle = Math.atan2(s.vy, s.vx);
    const img = s.radius > 0.23 ? shotImg : mantaBallImg;
    drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, s.x, s.y, 0.4, angle, 0);
  }
}

/** Like `drawSprite`, but can mirror horizontally (walk direction) and/or
 * vertically (hanging from a ceiling), for the M6 creatures. */
function drawFlippableSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, x, y, worldSize, flipX, flipY, hitFlash) {
  if (!ready(img)) return;
  const s = worldToScreen(camera, canvasW, canvasH, x, y);
  const h = worldSize * camera.pxPerUnit;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  if (hitFlash > 0) {
    ctx.filter = `brightness(${1 + hitFlash * 2}) saturate(${1 - hitFlash * 0.6})`;
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
      ctx.save();
      ctx.fillStyle = '#20262c';
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0a0d10';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Fuse spark: blinks faster as the fuse runs down.
      const blinkRate = 4 + (1 - b.fuse) * 8;
      const lit = Math.sin(time * blinkRate * Math.PI) > 0;
      ctx.fillStyle = lit ? '#ffd94a' : '#a05a1a';
      ctx.beginPath(); ctx.arc(s.x, s.y - r * 1.1, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      const t = b.age / 0.4; // 0..1 over the lingering window
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = '#ffdca0';
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, camera.pxPerUnit * 2.5 * Math.min(1, t * 2.2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawParticles(ctx, camera, worldToScreen, canvasW, canvasH, particlePool) {
  for (const p of particlePool) {
    if (!p.active) continue;
    const s = worldToScreen(camera, canvasW, canvasH, p.x, p.y);
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const r = p.size * camera.pxPerUnit * alpha;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
