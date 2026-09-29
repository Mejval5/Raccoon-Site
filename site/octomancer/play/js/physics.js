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
 * body.vx/body.vy in place.
 *
 * Round-6 fix (NIGHT-LOG.md task 2: "the octopus gets stuck in concave wall
 * corners and only a dash frees it"). The old version resolved each
 * overlapping tile independently, in sequence: at a concave (inward) corner
 * two solid tiles touch the circle at once with near-perpendicular normals
 * (e.g. one straight down, one straight right), and pushing out + zeroing
 * velocity against tile A, then immediately doing the same against tile B,
 * zeroes BOTH velocity components in turn -- the circle ends the step
 * wedged in the corner with ~zero velocity, and next step's thrust just
 * re-collides and gets zeroed again the same way. It never had a
 * component left to slide away along, only a dash's much larger impulse
 * could punch through the (re-)zeroing.
 *
 * Fix: gather every overlapping tile's normal+penetration this call, combine
 * them into one weighted normal (deepest contact dominates), push out along
 * THAT combined normal once, and cancel velocity only along it -- so the
 * tangential direction (the corner's own diagonal, i.e. "away from both
 * walls at once") is always preserved for the octopus to swim out along,
 * exactly like the octopus already slides along a single flat wall. A few
 * passes handle 3-4-tile corners (an L-shaped nub, etc.) converging to a
 * clean separated position without re-opening a contact the previous pass
 * just resolved.
 *
 * @param {{x:number,y:number,vx:number,vy:number,radius:number}} body
 * @param {{isSolid:(tx:number,ty:number)=>boolean, width:number, height:number}} grid
 */
export function resolveCircleVsGrid(body, grid) {
  const r = body.radius;
  const MAX_PASSES = 4;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const minTx = Math.floor(body.x - r);
    const maxTx = Math.floor(body.x + r);
    const minTy = Math.floor(body.y - r);
    const maxTy = Math.floor(body.y + r);

    let sumNx = 0, sumNy = 0, maxPen = 0, anyContact = false;
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

        let nx, ny, pen;
        if (d < 1e-6) {
          // Center exactly on a tile edge/corner: push along the axis with
          // the smaller penetration (fallback for a degenerate distance).
          const penL = body.x - ax0, penR = ax1 - body.x;
          const penT = body.y - ay0, penB = ay1 - body.y;
          const minPen = Math.min(penL, penR, penT, penB);
          if (minPen === penL) { nx = -1; ny = 0; pen = r + penL; }
          else if (minPen === penR) { nx = 1; ny = 0; pen = r + penR; }
          else if (minPen === penT) { nx = 0; ny = -1; pen = r + penT; }
          else { nx = 0; ny = 1; pen = r + penB; }
        } else {
          if (d >= r) continue; // no overlap
          nx = dx / d; ny = dy / d; pen = r - d;
        }
        anyContact = true;
        // Weight each contact's normal by its own penetration depth, so the
        // deepest contact dominates the combined direction but a shallower
        // second contact (typical just as the circle enters a corner) still
        // pulls it toward the true diagonal escape route.
        sumNx += nx * pen;
        sumNy += ny * pen;
        if (pen > maxPen) maxPen = pen;
      }
    }
    if (!anyContact) break;
    const nlen = len(sumNx, sumNy);
    if (nlen < 1e-6) break; // opposing contacts exactly cancel; nothing more this call can resolve
    const nx = sumNx / nlen, ny = sumNy / nlen;
    // Push out along the combined normal by the single deepest penetration --
    // enough to clear the worst contact without overshooting into open water.
    body.x += nx * maxPen;
    body.y += ny * maxPen;
    // Cancel velocity ONLY along the combined normal (one dot product, one
    // subtraction) -- the tangential component (along the corner's own
    // diagonal) is left untouched, so a wedged octopus always keeps
    // whatever push it had along the way out.
    const vn = body.vx * nx + body.vy * ny;
    if (vn < 0) {
      body.vx -= vn * nx;
      body.vy -= vn * ny;
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
