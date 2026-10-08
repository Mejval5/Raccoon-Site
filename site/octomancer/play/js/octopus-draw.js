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

import { sharedCanvas } from './canvas-pool.js';

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
    fetch(new URL('../assets/octopus.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error('octopus.json ' + r.status); return r.json(); }),
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('octopus.webp failed to load'));
      img.src = new URL('../assets/octopus.webp', import.meta.url).href; // module-relative: the test page lives in tests/
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

/** V2-PLAN 16: incapacitated (stunned / held) or killed in place (skewered / flattened): limp, eyes shut or crossed out. */
function isLimpLook(o) { return o.stunT > 0 || o.held > 0 || (o.dead && (o.deathStyle === 'impale' || o.deathStyle === 'splat')); }
/** Eyes crossed out: the skewered and the flattened. */
function isCrossedOut(o) { return o.dead && (o.deathStyle === 'impale' || o.deathStyle === 'splat'); }

/**
 * Pick the clip + frame-within-clip for the current octopus state.
 * Swim05 while pushing (rate scaled by speed), Idle4 at rest, Swim05 at 2x
 * with a dash squash right after a dash, Idle4Swirl while hurt.
 */
// V2-PLAN 14: the dead octopus holds one swim frame with the tentacles splayed out, limp (no animation at all)
const DEAD_FRAME = 4;

function pickFrame(data, o, t) {
  if (isLimpLook(o)) { // V2-PLAN 16: a limp body (stunned, held, skewered, flattened) is held on one hurt frame, not animating
    const clip = data.clips.hurt || data.clips.idle;
    const idx = Math.min(clip.count - 1, Math.floor(clip.count * 0.4));
    return { clipKey: data.clips.hurt ? 'hurt' : 'idle', frameIndex: clip.start + idx, localIndex: idx };
  }
  if (o.dead || o.limp) { // V2-PLAN 14: the plain death and a ragdoll limp: tentacles splayed
    const clip = data.clips.swim || data.clips.idle;
    const idx = Math.min(clip.count - 1, DEAD_FRAME);
    return { clipKey: data.clips.swim ? 'swim' : 'idle', frameIndex: clip.start + idx, localIndex: idx };
  }
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

  const limp = o.dead || o.limp;
  const justDashed = !limp && o.dashCooldown && o.dashCooldown > 0.45;
  const squash = limp ? 1 : Math.min(justDashed ? 0.85 : 1, 1 - 0.18 * (o.squash || 0)); // dash squash, and a soft squash on landing

  ctx.save();
  ctx.scale(1 / squash, squash);
  ctx.drawImage(img, frameIndex * cell, 0, cell, cell, -half, -half, worldSize, worldSize);
  ctx.restore();

  const anchors = data.eyeAnchors[clipKey] && data.eyeAnchors[clipKey][localIndex];
  if (!anchors) return;

  const angry = !!o.hurting;
  const crossed = o.dead; // every dead octopus has its eyes crossed out (V2-PLAN 14 / 16)
  const eyeState = crossed || isLimpLook(o) || o.limp ? 'closed' : angry ? 'angry' : (blinkState.blinking ? 'closed' : 'open');
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
    // Round-4 fix (Daniel's screenshot review round 3: "closed-eye slits read
    // as one bar" -- deriving the WIDTH from the open eye fixed the
    // over-wide bar shape (round-3 note above), but a full-width slit at the
    // open eye's own width still reads as a single flat bar rather than a
    // narrowed, closing eyelid. Narrow just the CLOSED state's width too.
    // Round-5 fix (Daniel's screenshot review round 4, issue 5: "both eye
    // slits merge into one long diagonal bar across the face"). 0.8x still
    // left the two slits wide enough, combined with their own rotation, to
    // visually bridge the gap between the eyes on some clips/frames --
    // reproduced directly (an isolated render of every eye state) with the
    // `hurting`/`angry` state specifically: the same full-open-eye-width bug
    // this round-4 note already diagnosed for `closed`, but the round-4 fix
    // only ever narrowed `closed`, leaving `angry` (drawn on every hurt
    // frame, not just an occasional blink) at the full open-eye width.
    // Narrow both non-open states now.
    const eyeWorldW = eyeState !== 'open' ? openWorldW * 0.55 : openWorldW;
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
    // Round-5 fix (Daniel's screenshot review round 4, issue 5: "faint
    // pale-pink outline fragments show through around the closed/hurt eye").
    // The BODY frame itself bakes in a darker eye-socket patch sized to fit
    // the full 60x60 `open` eye sprite (see `bake_creature.py`'s source
    // rig); the much smaller `closed`/`angry` overlays only cover part of
    // that socket, leaving its edges visible as a stray outline. Painting a
    // body-coloured ellipse over the full open-eye footprint first erases
    // the socket before the (smaller) actual eye state draws on top.
    if (eyeState !== 'open') {
      ctx.fillStyle = BODY;
      ctx.beginPath();
      ctx.ellipse(0, 0, (openWorldW / 2) * 1.05, (openWorldH / 2) * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (crossed) { // an X over each eye (dark outline colour, rounded caps)
      const k = openWorldW * 0.3;
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = openWorldW * 0.15; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k); ctx.stroke();
    } else {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, -eyeWorldW / 2, -eyeWorldH / 2, eyeWorldW, eyeWorldH);
    }
    ctx.restore();
  }
}

/** A dead eye: a dark X, `s` across, centred on the (already socket-filled) eye. */
function drawDeadEye(ctx, s) {
  const h = s / 2;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = s * 0.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-h, -h); ctx.lineTo(h, h);
  ctx.moveTo(h, -h); ctx.lineTo(-h, h);
  ctx.stroke();
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

  const squash = Math.min(o.dashCooldown && o.dashCooldown > 0.45 ? 0.82 : 1, 1 - 0.18 * (o.squash || 0));
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
    if (o.dead || o.limp) { ctx.save(); ctx.translate(dx, eyeY); if (o.dead) drawDeadEye(ctx, eyeR * 1.6); else { ctx.strokeStyle = OUTLINE; ctx.lineWidth = eyeR * 0.4; ctx.beginPath(); ctx.moveTo(-eyeR, 0); ctx.lineTo(eyeR, 0); ctx.stroke(); } ctx.restore(); continue; }
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

// V2-PLAN 14: special ragdoll poses by cause (octopus.js enterRagdoll(o, s, cause)): a drawer replaces the limp pose
// for that cause. It gets (ctx in the octopus's local frame, the octopus, drawLimp) and may call drawLimp() to draw the
// plain limp body first (then add to it), or draw something else entirely (a splat).
const RAGDOLL_POSES = new Map();
/** Register (or with null remove) the drawer for a ragdoll cause such as 'impaled' or 'splat'. */
export function setRagdollPose(cause, draw) { if (draw) RAGDOLL_POSES.set(cause, draw); else RAGDOLL_POSES.delete(cause); }

function drawOctopusUnclipped(ctx, o) {
  const pose = (o.dead || o.limp) && o.limpCause ? RAGDOLL_POSES.get(o.limpCause) : null;
  if (pose) { pose(ctx, o, () => drawOctopusPlain(ctx, o)); return; }
  drawOctopusPlain(ctx, o);
}
function drawOctopusPlain(ctx, o) {
  const splat = o.dead && o.deathStyle === 'splat';
  const impaled = o.dead && o.deathStyle === 'impale';
  if (splat) { // V2-PLAN 16: a pancake: the body frame squashed wide and thin about its centre
    const f = Math.max(0, Math.min(1, o.flat || 0));
    ctx.save();
    ctx.scale(1 + SPLAT_WIDE * f, 1 - SPLAT_THIN_K * f);
  } else if (impaled) { // the hurt frame is curled up and half of it hides behind the strip: draw it bigger so it reads as a skewered body
    ctx.save();
    ctx.scale(IMPALE_SCALE, IMPALE_SCALE);
  }
  if (!FORCE_CODE && bake && !bakeFailed) {
    drawBaked(ctx, o, bake);
  } else {
    drawPlaceholder(ctx, o);
  }
  if (splat || impaled) ctx.restore();
}
const IMPALE_SCALE = 1.3; // verification pass 2026-10-08: the skewered body looked small on the tips
const SPLAT_WIDE = 1.1;   // 2.1x as wide when fully flat (the sprite cell has empty margins, so it reads about 1.6 tiles)...
const SPLAT_THIN_K = 0.7;  // ...and 0.3x as tall (hazards.js SPLAT_THIN is the matching height in tiles)

// Round-5 fix (Daniel's screenshot review round 4, issue 5): a reused
// offscreen canvas for the alpha < 1 (invulnerability flicker) path below,
// sized to the main canvas so it can hold a straight copy of the current
// transform. Grown, never shrunk, and cleared per use rather than
// reallocated every frame.
let compositeCanvas = null;
let compositeCtx = null;
function getCompositeCtx(w, h) {
  if (!compositeCanvas) {
    compositeCanvas = sharedCanvas(document.createElement('canvas'));
    compositeCtx = compositeCanvas.getContext('2d');
  }
  if (compositeCanvas.width !== w || compositeCanvas.height !== h) {
    compositeCanvas.width = w;
    compositeCanvas.height = h;
  } else {
    compositeCtx.clearRect(0, 0, w, h);
  }
  return compositeCtx;
}

/**
 * Draws the octopus in *local* space: the caller has already translated the
 * canvas to the octopus's interpolated screen position, rotated it to the
 * facing angle (0 = up), and scaled it to pxPerUnit.
 *
 * @param {CanvasRenderingContext2D} ctx pre-transformed to the octopus's frame
 * @param {{radius:number, swimming:boolean, dashCooldown:number, hurting?:boolean, __t:number, __speed:number}} o
 * @param {number} [alpha] overall opacity (invulnerability flicker). At 1
 *   (the default) this draws straight to `ctx`, same as always. Below 1, it
 *   draws fully opaque to an offscreen buffer first and composites that
 *   flattened result once, so the body frame and eye overlays never blend
 *   as separate translucent layers (see the round-5 fix note at the call
 *   site in render.js).
 */
export function drawOctopus(ctx, o, alpha = 1) {
  const flash = o.dead && o.hitFlash > 0 ? o.hitFlash : 0; // V2-PLAN 14: a hit on the dead body flashes it white
  const splat = o.dead && o.deathStyle === 'splat' && o.flat > 0;
  if (alpha >= 1 && !flash && !splat) {
    drawOctopusUnclipped(ctx, o);
    return;
  }
  const w = ctx.canvas.width, h = ctx.canvas.height;
  if (!w || !h) { drawOctopusUnclipped(ctx, o); return; } // e.g. headless/test canvases with no size
  const cctx = getCompositeCtx(w, h);
  cctx.setTransform(ctx.getTransform());
  drawOctopusUnclipped(cctx, o);
  if (splat) { // the flattened body is darker, a bruised ink-red, painted only over the body's own pixels
    cctx.globalCompositeOperation = 'source-atop';
    cctx.fillStyle = 'rgba(40,10,24,' + (0.5 * Math.min(1, o.flat)).toFixed(3) + ')';
    cctx.fillRect(-3, -3, 6, 6);
    cctx.globalCompositeOperation = 'source-over';
  }
  cctx.setTransform(1, 0, 0, 1, 0, 0);
  if (flash) {
    cctx.save();
    cctx.globalCompositeOperation = 'source-atop';
    cctx.globalAlpha = 0.85 * flash;
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, w, h);
    cctx.restore();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(compositeCanvas, 0, 0);
  ctx.restore();
}

/** Test/debug hook: true once the baked sheet is in use (not the placeholder). */
export function isBaked() {
  return !FORCE_CODE && !!bake && !bakeFailed;
}
