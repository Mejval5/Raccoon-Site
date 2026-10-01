// v2 game feel, drawing: faint contact shadows under props and enemies that rest on rock.
// Called by render.js right before the enemies (so the shadow lies under them and under the props
// drawn later by the v2 extras). Reads the props struct-of-arrays and the enemy list; no allocation.

import { PK_BOMB, PK_POT, PK_CLAM, PK_CHEST, PK_RELIC, PK_ROCK, PS_FREE } from './props.js';

const SHADOW_ALPHA = 0.22;
const FLOOR_SCAN = 1.6; // tiles below an enemy that are searched for the floor it stands on

/** Y of the top of the first solid tile at or below (x, y0), within `reach` tiles; NaN if none. */
export function floorBelow(isSolid, x, y0, reach) {
  const tx = Math.floor(x);
  let ty = Math.floor(y0);
  const end = Math.floor(y0 + reach);
  for (; ty <= end; ty++) if (isSolid(tx, ty)) return ty;
  return NaN;
}

function blob(ctx, cx, cy, rx, ry, a) {
  ctx.fillStyle = 'rgba(8,12,20,' + a.toFixed(3) + ')';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Shadow strength 0..1 for a thing whose underside is `gap` tiles above the floor: full when it touches, none at 0.5. */
export function shadowStrength(gap) {
  return gap <= 0.08 ? 1 : gap >= 0.5 ? 0 : 1 - (gap - 0.08) / 0.42;
}

/**
 * @param {*} d the props data (createProps().data / props.data)
 * @param {Array} enemies the live enemy list
 * @param {(tx:number,ty:number)=>boolean} isSolid
 * @param {{x:number,y:number,radius:number,dead?:boolean}|null} octo r38: the octopus gets a faint shadow too when it rests within 0.5 tiles of a floor
 */
export function drawContactShadows(ctx, camera, cw, ch, d, enemies, isSolid, octo = null) {
  const ppu = camera.pxPerUnit;
  const sx = (wx) => cw / 2 + (wx - camera.x) * ppu, sy = (wy) => ch / 2 + (wy - camera.y) * ppu;
  const m = 2 * ppu;
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i]) continue;
    const k = d.kind[i];
    if (k !== PK_BOMB && k !== PK_POT && k !== PK_CLAM && k !== PK_CHEST && k !== PK_RELIC && k !== PK_ROCK) continue;
    if (k === PK_ROCK && d.state[i] === PS_FREE && Math.abs(d.vy[i]) > 1) continue; // a falling rock
    const r = d.radius[i];
    const fy = floorBelow(isSolid, d.x[i], d.y[i] + r * 0.5, r + 0.6);
    if (fy !== fy) continue;
    const a = shadowStrength(fy - (d.y[i] + r)) * SHADOW_ALPHA;
    if (a <= 0) continue;
    const x = sx(d.x[i]), y = sy(fy);
    if (x < -m || x > cw + m || y < -m || y > ch + m) continue;
    blob(ctx, x, y + 0.02 * ppu, r * 1.05 * ppu, r * 0.26 * ppu, a);
  }
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead || e.ghost) continue;
    const ground = e.kind === 'crab' || (e.placement === 'floor' && (e.kind === 'urchin' || e.kind === 'horns' || e.kind === 'cannon'));
    if (!ground) continue;
    const fy = floorBelow(isSolid, e.x, e.y, FLOOR_SCAN);
    if (fy !== fy) continue;
    const half = e.kind === 'crab' ? 0.45 : 0.4;
    const a = shadowStrength(fy - (e.y + half)) * SHADOW_ALPHA;
    if (a <= 0) continue;
    const x = sx(e.x), y = sy(fy);
    if (x < -m || x > cw + m || y < -m || y > ch + m) continue;
    blob(ctx, x, y + 0.02 * ppu, half * 1.15 * ppu, half * 0.26 * ppu, a);
  }
  if (octo && !octo.dead) {
    const r = octo.radius || 0.45;
    const fy = floorBelow(isSolid, octo.x, octo.y + r * 0.5, r + 0.6);
    if (fy === fy) {
      const a = shadowStrength(fy - (octo.y + r)) * SHADOW_ALPHA;
      const x = sx(octo.x), y = sy(fy);
      if (a > 0 && x > -m && x < cw + m && y > -m && y < ch + m) blob(ctx, x, y + 0.02 * ppu, r * 1.05 * ppu, r * 0.26 * ppu, a);
    }
  }
}
