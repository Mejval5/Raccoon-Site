// M1 code-drawn octopus placeholder: head + 8 bezier tentacles. Track B (M2)
// swaps this for Milan's baked animation behind the same interface.
// OVERNIGHT.md §2 "Octopus look": "colours sampled from Milan's octopus atlas".
//
// Colours sampled (offline, Pillow histogram) from
// octomancer-unity/Assets/Sprites/Animations/Octopus/OctoRemasteredExport2_character_img.png:
// body ~ (192,80,96), shade ~ (144,64,80), outline ~ (16,16,16), highlight ~ (240,224,224).

const BODY = '#c05060';
const SHADE = '#904050';
const OUTLINE = '#181012';
const HIGHLIGHT = '#f0e0e0';

const TENTACLE_COUNT = 8;

/**
 * Draws the octopus in *local* space: the caller has already translated the
 * canvas to the octopus's interpolated screen position, rotated it to the
 * facing angle (0 = up), and scaled it to pxPerUnit -- so here "up" is
 * always -y and one unit is one octopus radius-ish drawing unit.
 *
 * `drawOctopus(ctx, o, alpha)` is the stable interface Track B (the baked
 * sprite sheet) replaces; `?octo=code` keeps this placeholder as a fallback.
 *
 * @param {CanvasRenderingContext2D} ctx pre-transformed to the octopus's frame
 * @param {{radius:number, swimming:boolean, dashCooldown:number, __t:number, __speed:number}} o
 */
export function drawOctopus(ctx, o) {
  const r = o.radius;
  const t = o.__t || 0;
  const speed = o.__speed || 0;
  const wiggleRate = 6 + speed * 1.2; // faster swim -> faster wiggle
  const wiggleAmp = Math.min(0.6, 0.18 + speed * 0.05);

  // Tentacles trail behind the head, i.e. toward local +y (facing is -y).
  ctx.save();
  for (let i = 0; i < TENTACLE_COUNT; i++) {
    const spread = (i / (TENTACLE_COUNT - 1)) * 2 - 1; // -1..1 across the back
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

  // Head (mantle): a slightly squashed circle, squashed further while
  // dashing (dashCooldown freshly full == just dashed).
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

  // Shade crescent (underside, toward the back / +y).
  ctx.fillStyle = SHADE;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.35, r * 0.75, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (simple placeholder dots; the bake replaces these with Milan's eye
  // sprites at baked anchors).
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
