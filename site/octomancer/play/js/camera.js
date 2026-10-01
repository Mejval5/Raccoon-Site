// Camera: at least 18x24 world units visible, clamped to the world bounds,
// following the octopus's interpolated (render-alpha) position.
// Ports octomancer-unity/Assets/Scripts/Camera/CameraPos.cs:108-147
// (GetCamSizeDefault + BoundCam) to a 2D canvas pxPerUnit + clamp.
import { CAMERA_MIN_WIDTH, CAMERA_MIN_WIDTH_PORTRAIT, CAMERA_MIN_HEIGHT, CAMERA_MAX_WIDTH } from './config.js';

export function createCamera() {
  return { x: 0, y: 0, pxPerUnit: 32 };
}

/** CameraPos.GetCamSizeDefault(): pick the scale that guarantees both the
 * minimum width and minimum height are visible (never less, extra shown on
 * the other axis for off-ratio screens). */
export function computePxPerUnit(canvasW, canvasH) {
  // Round-4 fix: a portrait viewport (phones, in their normal orientation)
  // uses a much narrower width floor (see CAMERA_MIN_WIDTH_PORTRAIT's
  // comment in config.js) so the height floor actually gets to bind.
  const minWidth = canvasH > canvasW ? CAMERA_MIN_WIDTH_PORTRAIT : CAMERA_MIN_WIDTH;
  const scaleForWidth = canvasW / minWidth;
  const scaleForHeight = canvasH / CAMERA_MIN_HEIGHT;
  const base = Math.min(scaleForWidth, scaleForHeight);
  // Round-3 fix (Daniel's screenshot review, framing too small/empty on
  // desktop -- see CAMERA_MAX_WIDTH's comment in config.js): never let more
  // than CAMERA_MAX_WIDTH world units show across, even when the min-height
  // requirement above would otherwise leave the width unconstrained.
  const capScale = canvasW / CAMERA_MAX_WIDTH;
  return Math.max(base, capScale);
}

// Round-6 task 3 (NIGHT-LOG.md): "smooth the camera follow; no snapping."
// `updateCamera` used to set `cam.x/y` straight to the (clamped) target every
// frame -- with the target itself now the octopus's smoothly-interpolated
// render position (see render.js's `followX/followY`), the camera tracked it
// 1:1, so any small per-frame wobble in that target (subpixel jitter from
// float rounding, a hurt-knockback impulse, a dash) showed up in the camera
// just as sharply as it would have unsmoothed. An exponential follow (time
// constant, not a fixed-per-frame lerp factor, so it doesn't depend on frame
// rate) closes most of the gap to the target every ~1/CAMERA_FOLLOW_RATE
// seconds instead of instantly, same idea as the original's Cinemachine
// camera's own damping.
const CAMERA_FOLLOW_RATE = 10; // 1/s; higher = snappier, lower = laggier

// Round-8 fix (Daniel's screenshot review round 7, item 5: "camera:
// look-ahead in the velocity direction and keep the octopus within ~30% of
// screen centre"). The follow target used to be exactly the octopus's own
// position -- fine for staying on-screen, but it means the player never
// sees more of what they're swimming INTO than what they're swimming away
// from, which reads as reactive rather than anticipatory. `updateCamera`
// now offsets the follow target by the octopus's own velocity (capped, in
// world units) before the existing world-bounds clamp/smoothing runs, same
// idea as the original's Cinemachine composer "look ahead" behaviour.
const CAMERA_LOOKAHEAD_TIME = 0.45; // seconds of velocity extrapolated into the look-ahead offset
const CAMERA_LOOKAHEAD_MAX = 3.2; // world units, caps the offset at high dash speeds
// The look-ahead should never be so strong that the octopus itself drifts
// out toward the screen edge -- pulled back so the octopus's OWN position
// (not the look-ahead point) always stays within this fraction of the half
// viewport from screen centre, on each axis.
const CAMERA_OCTO_MAX_OFFSET_FRAC = 0.3;

function clampNum(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** CameraPos.BoundCam(): clamp the camera center so the viewport stays
 * within the world; if the world is smaller than the viewport on an axis,
 * center on that axis instead. Then exponentially damp `cam.x/y` toward that
 * clamped target over `dt` seconds (frame time, not the fixed sim step --
 * this is purely a render-side smoothing, it never touches simulation
 * state) instead of snapping straight to it.
 * @param {number} vx octopus velocity (world units/s), for the round-8 look-ahead offset; omit/0 for no look-ahead.
 * @param {number} vy
 * @param {number} [aimX] r40: where the camera wants to look (default the octopus); the octopus is still kept within 30% of the centre
 */
export function updateCamera(cam, canvasW, canvasH, targetX, targetY, worldW, worldH, dt = 1, vx = 0, vy = 0, aimX = targetX, aimY = targetY) {
  cam.pxPerUnit = computePxPerUnit(canvasW, canvasH);
  const halfViewW = (canvasW / cam.pxPerUnit) / 2;
  const halfViewH = (canvasH / cam.pxPerUnit) / 2;

  const aheadX = clampNum(vx * CAMERA_LOOKAHEAD_TIME, -CAMERA_LOOKAHEAD_MAX, CAMERA_LOOKAHEAD_MAX);
  const aheadY = clampNum(vy * CAMERA_LOOKAHEAD_TIME, -CAMERA_LOOKAHEAD_MAX, CAMERA_LOOKAHEAD_MAX);
  const desiredX = aimX + aheadX; // r40: the aim may lean away from the octopus (the pool's pedestal); the octopus clamp below still uses the octopus
  const desiredY = aimY + aheadY;

  const clampedX = worldW > halfViewW * 2
    ? Math.min(Math.max(desiredX, halfViewW), worldW - halfViewW)
    : worldW / 2;
  const clampedY = worldH > halfViewH * 2
    ? Math.min(Math.max(desiredY, halfViewH), worldH - halfViewH)
    : worldH / 2;

  if (!cam.initialized) {
    // First frame (or a fresh camera object, e.g. tests): jump straight
    // there rather than easing in from (0,0).
    cam.x = clampedX; cam.y = clampedY; cam.initialized = true;
  } else {
    const t = 1 - Math.exp(-CAMERA_FOLLOW_RATE * Math.max(0, dt));
    cam.x += (clampedX - cam.x) * t;
    cam.y += (clampedY - cam.y) * t;
  }

  // Keep the octopus's OWN position (not the look-ahead-shifted point above)
  // within CAMERA_OCTO_MAX_OFFSET_FRAC of screen centre on each axis, so a
  // big look-ahead offset (e.g. at dash speed) never drifts the octopus
  // itself out toward the edge of the view.
  const maxOffX = halfViewW * CAMERA_OCTO_MAX_OFFSET_FRAC;
  const maxOffY = halfViewH * CAMERA_OCTO_MAX_OFFSET_FRAC;
  cam.x = clampNum(cam.x, targetX - maxOffX, targetX + maxOffX);
  cam.y = clampNum(cam.y, targetY - maxOffY, targetY + maxOffY);
  // Re-apply the world-bounds clamp in case pulling toward the octopus just
  // pushed the camera back outside the world (only ever matters right at a
  // world edge, where BoundCam's own clamp above still wins).
  // Round-34 fix (hub at 375x812: "the bottom edge shows as a straight cut with the backdrop below"): when the
  // world is no bigger than the view on an axis (the 24-row hub on a tall phone) the octopus-offset pull above
  // used to win and drag the camera past the world edge; there the world stays centred, as the first clamp says.
  if (worldW > halfViewW * 2) cam.x = clampNum(cam.x, halfViewW, worldW - halfViewW);
  else cam.x = worldW / 2;
  if (worldH > halfViewH * 2) cam.y = clampNum(cam.y, halfViewH, worldH - halfViewH);
  else cam.y = worldH / 2;
}

/** World-space (units) -> canvas-space (device px) for the current camera. */
export function worldToScreen(cam, canvasW, canvasH, wx, wy) {
  return {
    x: canvasW / 2 + (wx - cam.x) * cam.pxPerUnit,
    y: canvasH / 2 + (wy - cam.y) * cam.pxPerUnit,
  };
}

/** Inverse of `worldToScreen`: canvas-space (device px) -> world-space
 * (units). Round-8 (item 4, mouse control): turns a tracked cursor pixel
 * position into a world point so main.js can aim the octopus's swim
 * direction at it each fixed step. */
export function screenToWorld(cam, canvasW, canvasH, px, py) {
  return {
    x: cam.x + (px - canvasW / 2) / cam.pxPerUnit,
    y: cam.y + (py - canvasH / 2) / cam.pxPerUnit,
  };
}
