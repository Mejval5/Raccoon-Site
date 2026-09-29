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
    bake = { data, img };
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
  const worldSize = data.cellWorldSize;
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
    const eyeWorldH = restSize.meshH * data.meshUnitsToWorld * a.scale;
    const eyeWorldW = eyeWorldH * (rect.w / rect.h);
    const ex = (a.x - cell / 2) * toWorld;
    const ey = (a.y - cell / 2) * toWorld;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a.angle);
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
