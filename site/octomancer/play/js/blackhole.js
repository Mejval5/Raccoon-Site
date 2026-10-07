// r45: the black-hole fade when the octopus goes into a whirlpool, a port of the original's BlackHoleEffect
// (octomancer-unity/Assets/Scripts/Portal/BlackHoleEffect.cs with the Wormhole shader, Shaders/My shaders/Portals/Wormhole.shader).
//
// Unity: FadeoutAt(exit) runs an image effect for TimeEffect seconds. Its radius y follows
//   x = 1 - clamp(t / T * 1.2 - 0.2, 0, 1);  y = (exp(x * Exponent) - 1) / (exp(Exponent) - 1) * MaxValue
// (MainGame.unity: Exponent 1, MaxValue 10): it holds for the first sixth of the time, then closes a little faster at the start than at
// the end. The shader keeps the picture inside 0.75 of that radius, ends in black at 1.0 and frays the edge in between with a Perlin
// texture (mixRadiusOutside = clamp(4 - 3r - r * (perlin + 0.5))), so the edge is ragged, not a clean circle.
//
// Here: the same curve over the entry's 1.5 s (T = ENTRY_S in main.js), the same clear / dark edge ratio (0.75 : 1) and a ragged edge
// from a few turning sine waves in place of the Perlin texture. One difference on purpose: Unity's MaxValue of 10 screen widths kept the
// iris off screen until the last quarter of the effect; here the radius at the start is the distance to the farthest screen corner, so
// the whole close is seen. Drawn on the game canvas in screen space, in the colour of the transition's dark screen, so when it has closed
// the dark screen takes over without a seam.

export const IRIS_COLOR = '#04121c'; // = the transition's dark screen (main.js ensureFade)
const EXPONENT = 1;
const CLEAR = 0.75; // the picture is untouched inside this fraction of the radius (the shader's 4 - 4r = 1 at r = 0.75)
const SIDES = 72;
const TAU = Math.PI * 2;

/** How far the iris is open at time t of a close lasting T seconds: 1 = fully open, 0 = closed (Unity's curve, normalised). */
export function irisOpen(t, T) {
  const x = 1 - Math.min(1, Math.max(0, (t / T) * 1.2 - 0.2));
  return (Math.exp(x * EXPONENT) - 1) / (Math.exp(EXPONENT) - 1);
}

/** The distance from (cx, cy) to the farthest corner of a w x h screen. */
export function farCorner(w, h, cx, cy) {
  return Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
}

/** The ragged edge, -1..1: three sine waves round the circle that turn at different speeds (the Perlin fray of the shader). */
function fray(a, t) {
  return 0.5 * Math.sin(3 * a + 2.3 * t) + 0.3 * Math.sin(7 * a - 3.1 * t + 1.3) + 0.2 * Math.sin(13 * a + 4.7 * t + 0.4);
}

/**
 * Draw the black hole over the whole canvas (screen space; the caller's transform is ignored).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w canvas width px
 * @param {number} h canvas height px
 * @param {number} cx centre px (the whirlpool on screen)
 * @param {number} cy
 * @param {number} t seconds since the entry
 * @param {number} T length of the close, seconds
 * @param {number} far the distance from the centre to the farthest screen corner when the close started (px; see farCorner): fixed for the
 *   whole close, so the radius only ever shrinks while the camera settles
 * @returns {number} the dark radius in px (0 = closed), for tests
 */
export function drawBlackHole(ctx, w, h, cx, cy, t, T, far) {
  const open = irisOpen(t, T);
  const R = (far / CLEAR) * 1.02 * open; // the dark edge; at open = 1 the clear part reaches past every corner
  if (R * CLEAR >= farCorner(w, h, cx, cy)) return R; // nothing on screen is touched yet
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (R <= 0.5) { ctx.fillStyle = IRIS_COLOR; ctx.fillRect(0, 0, w, h); ctx.restore(); return 0; }
  // 1) the soft part: darkening from the clear radius out to the edge
  const g = ctx.createRadialGradient(cx, cy, R * CLEAR, cx, cy, R);
  g.addColorStop(0, 'rgba(4,18,28,0)');
  g.addColorStop(0.55, 'rgba(4,18,28,0.55)');
  g.addColorStop(1, 'rgba(4,18,28,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 2) the ragged dark: everything outside a frayed ring between 0.86 and 1.0 of the radius is solid
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  for (let i = 0; i <= SIDES; i++) {
    const a = (i / SIDES) * TAU;
    const r = R * (0.93 + 0.07 * fray(a, t));
    const x = cx + Math.cos(-a) * r, y = cy + Math.sin(-a) * r; // the opposite winding to the rect
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = IRIS_COLOR;
  ctx.fill('evenodd');
  ctx.restore();
  return R;
}
