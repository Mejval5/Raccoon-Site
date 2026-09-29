// Own tiny physics core, ~250 lines (OVERNIGHT.md §2 "Physics"): semi-implicit
// Euler, Box2D-style linear drag, impulses, circle vs. tile-grid collision
// (push out along the normal, kill normal velocity, keep tangential),
// sub-stepping when |v|*dt > r/2. No per-frame allocation on the hot path:
// callers pass in scratch objects / reuse `body` in place.

import { SUBSTEP_RADIUS_FACTOR, MAX_SUBSTEPS, TILE_SIZE } from './config.js';

/** @typedef {{x:number,y:number}} Vec2 */

export function len(x, y) { return Math.sqrt(x * x + y * y); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Apply an impulse J (world units * mass) to a body of mass m: v += J/m. */
export function applyImpulse(body, jx, jy) {
  body.vx += jx / body.mass;
  body.vy += jy / body.mass;
}

/** Box2D-style linear drag: v *= 1/(1 + dt*drag). */
export function applyDrag(body, drag, dt) {
  const f = 1 / (1 + dt * drag);
  body.vx *= f;
  body.vy *= f;
}

/**
 * Resolve a moving circle against a solid tile grid for one small position
 * delta (dx,dy already scaled for this sub-step). Mutates body.x/body.y and
 * body.vx/body.vy in place: pushes the circle out of any overlapped solid
 * tile along the shallowest axis, zeroes the velocity component along that
 * normal, and keeps the tangential component.
 *
 * @param {{x:number,y:number,vx:number,vy:number,radius:number}} body
 * @param {{isSolid:(tx:number,ty:number)=>boolean, width:number, height:number}} grid
 */
export function resolveCircleVsGrid(body, grid) {
  const r = body.radius;
  const minTx = Math.floor(body.x - r);
  const maxTx = Math.floor(body.x + r);
  const minTy = Math.floor(body.y - r);
  const maxTy = Math.floor(body.y + r);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!grid.isSolid(tx, ty)) continue;
      // Tile AABB in world units (TILE_SIZE == 1 tonight, but keep it explicit).
      const ax0 = tx * TILE_SIZE, ax1 = ax0 + TILE_SIZE;
      const ay0 = ty * TILE_SIZE, ay1 = ay0 + TILE_SIZE;
      const cx = clamp(body.x, ax0, ax1);
      const cy = clamp(body.y, ay0, ay1);
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d = len(dx, dy);
      if (d >= r) continue; // no overlap
      if (d < 1e-6) {
        // Center exactly on a tile edge/corner: push out along the axis with
        // the smaller penetration (fallback for a degenerate distance).
        const penL = body.x - ax0, penR = ax1 - body.x;
        const penT = body.y - ay0, penB = ay1 - body.y;
        const minPen = Math.min(penL, penR, penT, penB);
        if (minPen === penL) { body.x = ax0 - r; body.vx = Math.min(body.vx, 0); }
        else if (minPen === penR) { body.x = ax1 + r; body.vx = Math.max(body.vx, 0); }
        else if (minPen === penT) { body.y = ay0 - r; body.vy = Math.min(body.vy, 0); }
        else { body.y = ay1 + r; body.vy = Math.max(body.vy, 0); }
        continue;
      }
      const nx = dx / d, ny = dy / d;
      const penetration = r - d;
      body.x += nx * penetration;
      body.y += ny * penetration;
      // Kill the velocity component along the normal, keep tangential.
      const vn = body.vx * nx + body.vy * ny;
      if (vn < 0) {
        body.vx -= vn * nx;
        body.vy -= vn * ny;
      }
    }
  }
}

/**
 * Integrate a body's position by dt against the grid, sub-stepping when the
 * displacement this step would exceed half the collider radius (tunnelling
 * guard for dash speeds).
 */
export function integrateWithCollision(body, dt, grid) {
  const speed = len(body.vx, body.vy);
  const maxStepDist = body.radius * SUBSTEP_RADIUS_FACTOR;
  let steps = 1;
  if (speed * dt > maxStepDist && maxStepDist > 0) {
    steps = Math.min(MAX_SUBSTEPS, Math.ceil((speed * dt) / maxStepDist));
  }
  const subDt = dt / steps;
  for (let i = 0; i < steps; i++) {
    body.x += body.vx * subDt;
    body.y += body.vy * subDt;
    resolveCircleVsGrid(body, grid);
  }
}
