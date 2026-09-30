// M1-0 combat spike (?auto=1 only): Ink Jet L1 auto-fires at the nearest
// targetable enemy in line of sight. V2-PLAN 3.1: range 6, dmg 4, cd 1.0 s,
// speed 10. Fixed 64-blob pool (typed arrays), no allocation per shot.
// Throwaway quality. Hazards (urchin, horns) and the Beholder have no hp, so
// they are never targeted or damaged (Daniel's Q7).
import { hasLineOfSight } from './pathfind.js';

// --- tuning knobs ---
export const INK_RANGE = 6; // tiles
export const INK_DAMAGE = 4;
export const INK_COOLDOWN = 1.0; // s
export const INK_SPEED = 10; // tiles/s
const BLOB_RADIUS = 0.16; // tiles (draw + hit)
const POOL = 64;

export function createAutofire() {
  const x = new Float32Array(POOL), y = new Float32Array(POOL);
  const vx = new Float32Array(POOL), vy = new Float32Array(POOL);
  const life = new Float32Array(POOL);
  const live = new Uint8Array(POOL);
  const stats = { shots: 0, hits: 0, kills: 0 };
  let cd = 0;
  let solid = null, solidWorld = null;

  function spawn(px, py, dx, dy) {
    for (let i = 0; i < POOL; i++) {
      if (live[i]) continue;
      live[i] = 1; x[i] = px; y[i] = py; vx[i] = dx * INK_SPEED; vy[i] = dy * INK_SPEED;
      life[i] = (INK_RANGE + 1) / INK_SPEED;
      return;
    }
  }

  function update(dt, octo, world, enemies) {
    if (solidWorld !== world) { solidWorld = world; solid = (tx, ty) => world.isSolid(tx, ty); }
    const list = enemies.live();
    // Move blobs, stop at rock, hit the first enemy touched.
    for (let i = 0; i < POOL; i++) {
      if (!live[i]) continue;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; life[i] -= dt;
      if (life[i] <= 0 || world.isSolid(x[i], y[i])) { live[i] = 0; continue; }
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (e.dead || e.hp === undefined) continue;
        const r = e.radius + BLOB_RADIUS + 0.15;
        const dx = e.x - x[i], dy = e.y - y[i];
        if (dx * dx + dy * dy < r * r) {
          live[i] = 0; stats.hits++;
          enemies.hurt(e, INK_DAMAGE);
          if (e.dead) stats.kills++;
          break;
        }
      }
    }
    if (octo.dead) return;
    cd -= dt;
    if (cd > 0) return;
    // Nearest targetable enemy within range and line of sight.
    let best = null, bestD = INK_RANGE * INK_RANGE;
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      if (e.dead || e.hp === undefined) continue;
      const dx = e.x - octo.x, dy = e.y - octo.y, d2 = dx * dx + dy * dy;
      if (d2 >= bestD) continue;
      if (!hasLineOfSight(solid, octo.x, octo.y, e.x, e.y)) continue;
      best = e; bestD = d2;
    }
    if (!best) return;
    const d = Math.sqrt(bestD) || 1;
    spawn(octo.x, octo.y, (best.x - octo.x) / d, (best.y - octo.y) / d);
    stats.shots++;
    cd = INK_COOLDOWN;
  }

  const TAU = 6.2832;
  function draw(ctx, camera, worldToScreen, canvasW, canvasH) {
    const ppu = camera.pxPerUnit;
    const r = Math.max(3, BLOB_RADIUS * ppu);
    for (let i = 0; i < POOL; i++) {
      if (!live[i]) continue;
      // Inline worldToScreen (no per-blob object).
      const sx = canvasW / 2 + (x[i] - camera.x) * ppu;
      const sy = canvasH / 2 + (y[i] - camera.y) * ppu;
      if (sx < -30 || sy < -30 || sx > canvasW + 30 || sy > canvasH + 30) continue; // off screen: skip
      const tx = -vx[i] * 0.03 * ppu, ty = -vy[i] * 0.03 * ppu; // short trail behind
      ctx.fillStyle = 'rgba(40,20,80,0.45)';
      ctx.beginPath(); ctx.arc(sx + tx, sy + ty, r * 0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a1650';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#9b7fd4';
      ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.35, 0, TAU); ctx.fill();
    }
  }

  return { update, draw, stats };
}
