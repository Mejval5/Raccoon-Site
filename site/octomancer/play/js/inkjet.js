// Ink Jet: the octopus's basic ranged attack (V2-PLAN 3.1). A short-range stream of ink blobs.
// Data-oriented: one fixed pool of typed arrays, nothing is allocated per shot or per frame.
// Hazards (urchin, horns) and the Beholder have no hp, so a blob only splats on them and does no damage.
import { hasLineOfSight } from './pathfind.js';
import { cullView, cullFlags, visibleAt } from './cull.js';

export const INKJET = Object.freeze({
  range: 6.5, // tiles a blob flies before it fades
  speed: 13, // tiles/s
  damage: 4,
  cooldown: 0.42, // s between shots; holding the button repeats at this rate
  radius: 0.16, // tiles (draw + hit)
});

const POOL = 32;
const MAX_SPLAT = 32; // splat points per update (x,y pairs)
const MAX_SUB = 0.08; // longest sub-step in tiles, so a blob cannot skip a wall or a small enemy
const TAU = Math.PI * 2;

export function createInkJet() {
  const data = {
    x: new Float32Array(POOL), y: new Float32Array(POOL),
    vx: new Float32Array(POOL), vy: new Float32Array(POOL),
    life: new Float32Array(POOL), // seconds of flight left
    alive: new Uint8Array(POOL),
  };
  const events = { hits: 0, kills: 0, nSplat: 0, splat: new Float32Array(MAX_SPLAT * 2) };
  const flags = cullFlags('inkjet', POOL);
  let cd = 0;
  let n = 0;

  function splat(x, y) {
    if (events.nSplat >= MAX_SPLAT) return;
    events.splat[events.nSplat * 2] = x; events.splat[events.nSplat * 2 + 1] = y; events.nSplat++;
  }

  function fire(ox, oy, dx, dy, ownerR = 0.5) {
    if (cd > 0) return false;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return false;
    dx /= len; dy /= len;
    let i = 0;
    while (i < POOL && data.alive[i]) i++;
    if (i === POOL) return false; // pool full (cannot happen at this cooldown and range)
    data.x[i] = ox + dx * ownerR; data.y[i] = oy + dy * ownerR;
    data.vx[i] = dx * INKJET.speed; data.vy[i] = dy * INKJET.speed;
    data.life[i] = INKJET.range / INKJET.speed;
    data.alive[i] = 1;
    cd = INKJET.cooldown;
    return true;
  }

  function update(dt, world, list, hurt) {
    events.hits = 0; events.kills = 0; events.nSplat = 0;
    if (cd > 0) cd -= dt;
    n = 0;
    const R = INKJET.radius;
    for (let i = 0; i < POOL; i++) {
      if (!data.alive[i]) continue;
      // A spawn spot inside rock splats on the first sub-step below, at the blob's own position.
      const step = Math.min(dt, data.life[i]);
      const dist = Math.hypot(data.vx[i], data.vy[i]) * step;
      const subs = Math.max(1, Math.ceil(dist / MAX_SUB));
      const sdt = step / subs;
      let done = false;
      for (let s = 0; s < subs && !done; s++) {
        const px = data.x[i], py = data.y[i];
        const x = px + data.vx[i] * sdt, y = py + data.vy[i] * sdt;
        if (world.isSolid(x, y)) { // splat at the last free spot, so it sits on the wall face
          splat(px, py); data.alive[i] = 0; done = true; break;
        }
        data.x[i] = x; data.y[i] = y;
        for (let j = 0; j < list.length; j++) {
          const e = list[j];
          if (e.dead || e.ghost) continue;
          const rr = (e.radius || 0.4) + R, ex = e.x - x, ey = e.y - y;
          if (ex * ex + ey * ey > rr * rr) continue;
          if (e.hp !== undefined) {
            hurt(e, INKJET.damage);
            events.hits++;
            if (e.dead) events.kills++;
          }
          splat(x, y); data.alive[i] = 0; done = true; break;
        }
      }
      if (done) continue;
      data.life[i] -= dt;
      if (data.life[i] <= 1e-6) { data.alive[i] = 0; continue; }
      n++;
    }
  }

  function draw(ctx, camera, canvasW, canvasH) {
    if (n === 0) return;
    cullView(camera, canvasW, canvasH);
    const ppu = camera.pxPerUnit;
    const r = Math.max(2.5, INKJET.radius * ppu);
    const hw = canvasW / 2, hh = canvasH / 2;
    ctx.lineWidth = Math.max(1, r * 0.22);
    for (let i = 0; i < POOL; i++) {
      if (!data.alive[i]) continue;
      if (!visibleAt(flags, i, data.x[i], data.y[i], 0.6)) continue;
      const sx = hw + (data.x[i] - camera.x) * ppu, sy = hh + (data.y[i] - camera.y) * ppu;
      const sp = Math.hypot(data.vx[i], data.vy[i]) || 1;
      const ux = data.vx[i] / sp, uy = data.vy[i] / sp; // flight direction
      const tl = r * 3.2; // trail length in px
      // Tapering trail: a thin wedge from the blob back along its path.
      ctx.fillStyle = 'rgba(26,16,48,0.45)';
      ctx.beginPath();
      ctx.moveTo(sx - uy * r * 0.8, sy + ux * r * 0.8);
      ctx.lineTo(sx - ux * tl, sy - uy * tl);
      ctx.lineTo(sx + uy * r * 0.8, sy - ux * r * 0.8);
      ctx.closePath(); ctx.fill();
      // Body: slightly stretched along the flight direction, with a small soft highlight.
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = '#1a1030'; ctx.strokeStyle = '#0b0618';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.9, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(150,130,200,0.45)';
      ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 0.3, r * 0.35, r * 0.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  return {
    data, events, fire, update, draw,
    cooldown() { return cd > 0 ? cd : 0; },
    count() { return n; },
    clear() { data.alive.fill(0); n = 0; cd = 0; events.hits = events.kills = events.nSplat = 0; },
  };
}

/** The nearest living enemy with hp, within range and in line of sight of the octopus, or null. */
export function autoAimTarget(octo, list, isSolid) {
  let best = null, bestD = INKJET.range * INKJET.range;
  for (let j = 0; j < list.length; j++) {
    const e = list[j];
    if (e.dead || e.ghost || e.hp === undefined) continue;
    const dx = e.x - octo.x, dy = e.y - octo.y, d2 = dx * dx + dy * dy;
    if (d2 >= bestD) continue;
    if (!hasLineOfSight(isSolid, octo.x, octo.y, e.x, e.y)) continue;
    best = e; bestD = d2;
  }
  return best;
}

/** Unit aim vector {x, y}: at the nearest targetable enemy, else straight ahead along `facing`. */
export function autoAim(octo, list, isSolid, facing) {
  const e = autoAimTarget(octo, list, isSolid);
  if (e) {
    const dx = e.x - octo.x, dy = e.y - octo.y, d = Math.hypot(dx, dy);
    if (d > 1e-6) return { x: dx / d, y: dy / d };
  }
  return { x: facing >= 0 ? 1 : -1, y: 0 };
}

/** A small, quiet aim reticle: a thin broken ring in ink-blue and pale sea-green at a screen point (canvas px). */
export function drawReticle(ctx, sx, sy, ppu, time) {
  const r = 0.35 * ppu * (1 + Math.sin(time * 2.2) * 0.05);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, ppu * 0.04); ctx.lineCap = 'round';
  const rot = time * 0.4;
  for (let k = 0; k < 4; k++) {
    const a = rot + k * (TAU / 4);
    ctx.strokeStyle = k % 2 ? '#9fd8c4' : '#6f86d6';
    ctx.beginPath(); ctx.arc(sx, sy, r, a, a + TAU / 4 - 0.7); ctx.stroke();
  }
  ctx.restore();
}
