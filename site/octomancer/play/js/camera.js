// Camera: at least 18x24 world units visible, clamped to the world bounds,
// following the octopus's interpolated (render-alpha) position.
// Ports octomancer-unity/Assets/Scripts/Camera/CameraPos.cs:108-147
// (GetCamSizeDefault + BoundCam) to a 2D canvas pxPerUnit + clamp.
import { CAMERA_MIN_WIDTH, CAMERA_MIN_HEIGHT } from './config.js';

export function createCamera() {
  return { x: 0, y: 0, pxPerUnit: 32 };
}

/** CameraPos.GetCamSizeDefault(): pick the scale that guarantees both the
 * minimum width and minimum height are visible (never less, extra shown on
 * the other axis for off-ratio screens). */
export function computePxPerUnit(canvasW, canvasH) {
  const scaleForWidth = canvasW / CAMERA_MIN_WIDTH;
  const scaleForHeight = canvasH / CAMERA_MIN_HEIGHT;
  return Math.min(scaleForWidth, scaleForHeight);
}

/** CameraPos.BoundCam(): clamp the camera center so the viewport stays
 * within the world; if the world is smaller than the viewport on an axis,
 * center on that axis instead. */
export function updateCamera(cam, canvasW, canvasH, targetX, targetY, worldW, worldH) {
  cam.pxPerUnit = computePxPerUnit(canvasW, canvasH);
  const halfViewW = (canvasW / cam.pxPerUnit) / 2;
  const halfViewH = (canvasH / cam.pxPerUnit) / 2;

  cam.x = worldW > halfViewW * 2
    ? Math.min(Math.max(targetX, halfViewW), worldW - halfViewW)
    : worldW / 2;
  cam.y = worldH > halfViewH * 2
    ? Math.min(Math.max(targetY, halfViewH), worldH - halfViewH)
    : worldH / 2;
}

/** World-space (units) -> canvas-space (device px) for the current camera. */
export function worldToScreen(cam, canvasW, canvasH, wx, wy) {
  return {
    x: canvasW / 2 + (wx - cam.x) * cam.pxPerUnit,
    y: canvasH / 2 + (wy - cam.y) * cam.pxPerUnit,
  };
}
