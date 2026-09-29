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

/** CameraPos.BoundCam(): clamp the camera center so the viewport stays
 * within the world; if the world is smaller than the viewport on an axis,
 * center on that axis instead. Then exponentially damp `cam.x/y` toward that
 * clamped target over `dt` seconds (frame time, not the fixed sim step --
 * this is purely a render-side smoothing, it never touches simulation
 * state) instead of snapping straight to it.
 */
export function updateCamera(cam, canvasW, canvasH, targetX, targetY, worldW, worldH, dt = 1) {
  cam.pxPerUnit = computePxPerUnit(canvasW, canvasH);
  const halfViewW = (canvasW / cam.pxPerUnit) / 2;
  const halfViewH = (canvasH / cam.pxPerUnit) / 2;

  const clampedX = worldW > halfViewW * 2
    ? Math.min(Math.max(targetX, halfViewW), worldW - halfViewW)
    : worldW / 2;
  const clampedY = worldH > halfViewH * 2
    ? Math.min(Math.max(targetY, halfViewH), worldH - halfViewH)
    : worldH / 2;

  if (!cam.initialized) {
    // First frame (or a fresh camera object, e.g. tests): jump straight
    // there rather than easing in from (0,0).
    cam.x = clampedX; cam.y = clampedY; cam.initialized = true;
    return;
  }
  const t = 1 - Math.exp(-CAMERA_FOLLOW_RATE * Math.max(0, dt));
  cam.x += (clampedX - cam.x) * t;
  cam.y += (clampedY - cam.y) * t;
}

/** World-space (units) -> canvas-space (device px) for the current camera. */
export function worldToScreen(cam, canvasW, canvasH, wx, wy) {
  return {
    x: canvasW / 2 + (wx - cam.x) * cam.pxPerUnit,
    y: canvasH / 2 + (wy - cam.y) * cam.pxPerUnit,
  };
}
