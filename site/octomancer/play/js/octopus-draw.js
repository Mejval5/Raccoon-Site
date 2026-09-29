// Milan's baked octopus (OVERNIGHT.md §2 "Octopus look", track B / M2-B2).
//
// The body is a baked sprite sheet (`assets/octopus.webp` + `.json`) built
// offline by `octomancer-web/tools/bake_creature.py` from the Creature-pack
// animation data (`OctoRemasteredExport_character_data.creature_pack.bytes` +
// atlas) -- see DECISIONS-2026-09-29.md §4 for the recipe. No Creature
// runtime code and no mesh at runtime: this module only ever does a handful
// of `drawImage` calls (one for the body frame, two for the eyes).
//
// `?octo=code` keeps the M1 code-drawn placeholder (below) as the fallback,
// and the placeholder is also what renders until the bake has loaded.

const TENTACLE_COUNT = 8;
const BODY = '#c05060';
const SHADE = '#904050';
const OUTLINE = '#181012';
const HIGHLIGHT = '#f0e0e0';

// Round-1 fix (Daniel's screenshot review: "the octopus is far too big
// compared to other elements" -- checked against the promo-video frames,
// where the octopus reads roughly tile-sized, close to the other creatures,
// never ~2 tiles across). `octopus.json`'s `cellWorldSize` (1.9171 world
// units) comes from `bake_creature.py`'s own logged approximation: it scales
// the whole sprite-sheet cell (sized to fit the widest frame across
// idle/swim/hurt, including fully-extended swim tentacles) by
// `colliderRadius / head_radius_mesh`, where `head_radius_mesh` is a median
// point-to-centroid distance over the body mesh -- a proxy the script itself
// flags as an approximation, not a real measured radius, because "no
// numeric scale field was found on the Octopus transform". That proxy comes
// out small relative to the sheet's true half-width, so the derived scale
// overshoots: cellWorldSize/colliderRadius is ~4.3x here vs ~1.7-2.3x for
// every other creature's own worldSize/radius ratio (crab 0.7/0.42, urchin
// 0.9/0.42, horns 0.9/0.4, manta 0.9/0.5 -- enemy-draw.js/config.js). Rather
// than re-run the offline bake (needs the Creature-pack export, out of
// scope for a round-1 fix), correct the visual size at draw time to land in
// that same ratio band -- confirmed against octo-video-hub.webp/
// octo-video-cave-urchin.webp, where the octopus reads about tile-sized.
const OCTO_VISUAL_SCALE = 0.5;

const params = new URLSearchParams(location.search);
const FORCE_CODE = params.get('octo') === 'code';

// --- Bake loading (async, best-effort; placeholder covers until it lands) --
let bake = null; // { img, data } once both the sheet and JSON are ready
let bakeFailed = false;
if (!FORCE_CODE) {
  Promise.all([
    fetch('assets/octopus.json').then((r) => { if (!r.ok) throw new Error('octopus.json ' + r.status); return r.json(); }),
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('octopus.webp failed to load'));
      img.src = 'assets/octopus.webp';
    }),
  ]).then(([data, img]) => {
    // Round-3 fix (Daniel's screenshot review, seed 42 depth 15 x2 + seed 11
    // 1x: "the eyes turn into two huge black-and-white bars whenever it
    // blinks, and in the hurt/angry state too"). Root cause 1b: every clip's
    // eye anchor carries a near-constant ~2.05rad (~117deg) rotation that is
    // invisible on the round `open` sprite but turns the thin `closed`/
    // `angry` sprites almost vertical. That offset is baked into the anchor
    // data itself (it does not represent real per-frame eye movement, which
    // is much smaller), so cache the rest-pose (idle frame 0) angle per side
    // once here and subtract it at draw time instead of rotating by the raw
    // anchor angle -- see the per-side loop below.
    const idle0 = data.eyeAnchors.idle && data.eyeAnchors.idle[0];
    const eyeBaseAngle = {
      left: idle0 && idle0.left ? idle0.left.angle : 0,
      right: idle0 && idle0.right ? idle0.right.angle : 0,
    };
    bake = { data, img, eyeBaseAngle };
  }).catch((err) => {
    bakeFailed = true;
    // eslint-disable-next-line no-console
    console.warn('[octopus-draw] baked sprite unavailable, using placeholder:', err);
  });
}

// --- Blink timing (code-driven per OVERNIGHT.md §2: "blink and angry are
// code-driven") ------------------------------------------------------------
const blinkState = { next: 3 + Math.random() * 3, timer: 0, blinking: false };
function updateBlink(dt) {
  blinkState.timer += dt;
  if (!blinkState.blinking && blinkState.timer >= blinkState.next) {
    blinkState.blinking = true;
    blinkState.timer = 0;
  } else if (blinkState.blinking && blinkState.timer >= 0.12) {
    blinkState.blinking = false;
    blinkState.timer = 0;
    blinkState.next = 3 + Math.random() * 3;
  }
}

/**
 * Pick the clip + frame-within-clip for the current octopus state.
 * Swim05 while pushing (rate scaled by speed), Idle4 at rest, Swim05 at 2x
 * with a dash squash right after a dash, Idle4Swirl while hurt.
 */
function pickFrame(data, o, t) {
  const hurt = !!o.hurting;
  const justDashed = o.dashCooldown && o.dashCooldown > 0.45;
  let clipKey = 'idle';
  let rate = 1.4; // idle cycles per second, gentle bob
  if (hurt) {
    clipKey = 'hurt';
    rate = 1.2;
  } else if (o.swimming || justDashed) {
    clipKey = 'swim';
    const speed = o.__speed || 0;
    rate = justDashed ? 6 : 1.5 + speed * 0.6; // dash plays Swim05 fast
  }
  const clip = data.clips[clipKey] || data.clips.idle;
  const phase = (t * rate) % 1;
  const idx = Math.min(clip.count - 1, Math.floor(phase * clip.count));
  return { clipKey, frameIndex: clip.start + idx, localIndex: idx };
}

function drawBaked(ctx, o, bakeData) {
  const { data, img } = bakeData;
  const t = o.__t || 0;
  updateBlink(1 / 60); // called every draw; ~frame-rate granularity is fine for a cosmetic blink
  const { clipKey, frameIndex, localIndex } = pickFrame(data, o, t);
  const cell = data.cellSize;
  const worldSize = data.cellWorldSize * OCTO_VISUAL_SCALE;
  const half = worldSize / 2;

  const justDashed = o.dashCooldown && o.dashCooldown > 0.45;
  const squash = justDashed ? 0.85 : 1;

  ctx.save();
  ctx.scale(1 / squash, squash);
  ctx.drawImage(img, frameIndex * cell, 0, cell, cell, -half, -half, worldSize, worldSize);
  ctx.restore();

  const anchors = data.eyeAnchors[clipKey] && data.eyeAnchors[clipKey][localIndex];
  if (!anchors) return;

  const angry = !!o.hurting;
  const eyeState = angry ? 'angry' : (blinkState.blinking ? 'closed' : 'open');
  const sprites = data.eyeSprites[eyeState] || data.eyeSprites.open;
  const toWorld = worldSize / cell; // px-in-cell -> world units, same transform as the body

  for (const side of ['left', 'right']) {
    const a = anchors[side];
    const rect = sprites[side];
    if (!a || !rect || !img.complete) continue;
    const restSize = data.eyeRestSize[side];
    // Round-2 fix (Daniel's screenshot review: "the octopus looks wrong and
    // too big" -- the eyes were drawn at 2x their correct size). This used
    // to skip OCTO_VISUAL_SCALE entirely -- the body/eye *positions* go
    // through `toWorld` (which is itself `worldSize / cell`, and `worldSize`
    // already carries OCTO_VISUAL_SCALE), but the eye *size* was computed
    // straight from the unscaled mesh data, so it stayed at the pre-round-1
    // (too-large) scale while the body shrank around it -- two oversized
    // white eyeballs covering most of the now-smaller head. Multiplying by
    // the same OCTO_VISUAL_SCALE keeps eyes and body in the same ratio.
    //
    // Round-3 fix, cause 1a (Daniel's screenshot review: blink/hurt eyes
    // render as two huge black-and-white bars, seed 42 depth 15 x2 + seed 11
    // 1x). This used to derive both eyeWorldH AND eyeWorldW from the OPEN
    // eye's rest *height*, then stretched that height by the *current*
    // state's own aspect ratio (`rect.w/rect.h`) to get the width -- so a
    // sprite far wider than tall (`closed`, 53x18, ratio ~2.9) or noticeably
    // taller (`angry`, 53x33, ratio ~1.6) than the open eye (60x60, ratio 1)
    // drew far too wide relative to the open eye's own width. Deriving the
    // WIDTH from the open eye instead (which stays constant across every
    // state, matching how a real eyelid closes over a fixed eye socket) and
    // computing each state's own height from ITS OWN aspect ratio gives a
    // closed eye that is the same width as the open one and only 18/53 as
    // tall -- a thin horizontal slit, not a bar.
    const openRect = data.eyeSprites.open[side] || rect;
    const openWorldH = restSize.meshH * data.meshUnitsToWorld * a.scale * OCTO_VISUAL_SCALE;
    const openWorldW = openWorldH * (openRect.w / openRect.h);
    const eyeWorldW = openWorldW;
    const eyeWorldH = eyeWorldW * (rect.h / rect.w);
    const ex = (a.x - cell / 2) * toWorld;
    const ey = (a.y - cell / 2) * toWorld;
    // Round-3 fix, cause 1b: see the `eyeBaseAngle` comment where the bake
    // loads. Rotating by the raw anchor angle (~2.05rad/~117deg, present in
    // every clip) is invisible on the round `open` sprite but turns a thin
    // slit sprite (`closed`/`angry`) almost vertical; rotating by the angle
    // *relative to* the idle rest pose cancels that constant baked-in offset
    // while still tracking whatever small genuine eye movement the clip has.
    const baseAngle = (bakeData.eyeBaseAngle && bakeData.eyeBaseAngle[side]) || 0;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a.angle - baseAngle);
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, -eyeWorldW / 2, -eyeWorldH / 2, eyeWorldW, eyeWorldH);
    ctx.restore();
  }
}

/** The M1 code-drawn placeholder: head + 8 bezier tentacles, colours sampled
 * (offline, Pillow histogram) from Milan's octopus atlas. Kept as the
 * fallback behind `?octo=code` and while the bake is still loading. */
function drawPlaceholder(ctx, o) {
  const r = o.radius;
  const t = o.__t || 0;
  const speed = o.__speed || 0;
  const wiggleRate = 6 + speed * 1.2;
  const wiggleAmp = Math.min(0.6, 0.18 + speed * 0.05);

  ctx.save();
  for (let i = 0; i < TENTACLE_COUNT; i++) {
    const spread = (i / (TENTACLE_COUNT - 1)) * 2 - 1;
    const baseX = spread * r * 0.85;
    const baseY = r * 0.55;
    const len = r * (2.1 + 0.15 * Math.abs(spread));
    const phase = t * wiggleRate + i * 0.7;
    const swing = Math.sin(phase) * wiggleAmp * (0.4 + 0.6 * Math.abs(spread));

    const midX = baseX + spread * len * 0.35 + swing * r;
    const midY = baseY + len * 0.55;
    const endX = baseX + spread * len * 0.15 + swing * r * 1.6;
    const endY = baseY + len;

    ctx.strokeStyle = i % 2 === 0 ? BODY : SHADE;
    ctx.lineWidth = r * (0.5 - 0.03 * Math.abs(spread));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();
  }
  ctx.restore();

  const squash = o.dashCooldown && o.dashCooldown > 0.45 ? 0.82 : 1;
  ctx.save();
  ctx.scale(1 / squash, squash);
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * squash, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = SHADE;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.35, r * 0.75, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const eyeY = -r * 0.15;
  const eyeDX = r * 0.42;
  const eyeR = r * 0.22;
  for (const dx of [-eyeDX, eyeDX]) {
    ctx.fillStyle = HIGHLIGHT;
    ctx.beginPath();
    ctx.ellipse(dx, eyeY, eyeR, eyeR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.ellipse(dx, eyeY, eyeR * 0.45, eyeR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws the octopus in *local* space: the caller has already translated the
 * canvas to the octopus's interpolated screen position, rotated it to the
 * facing angle (0 = up), and scaled it to pxPerUnit.
 *
 * @param {CanvasRenderingContext2D} ctx pre-transformed to the octopus's frame
 * @param {{radius:number, swimming:boolean, dashCooldown:number, hurting?:boolean, __t:number, __speed:number}} o
 */
export function drawOctopus(ctx, o) {
  if (!FORCE_CODE && bake && !bakeFailed) {
    drawBaked(ctx, o, bake);
  } else {
    drawPlaceholder(ctx, o);
  }
}

/** Test/debug hook: true once the baked sheet is in use (not the placeholder). */
export function isBaked() {
  return !FORCE_CODE && !!bake && !bakeFailed;
}
