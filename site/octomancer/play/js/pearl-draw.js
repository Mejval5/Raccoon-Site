// The big pearl (pearl.js) drawn: Milan's clam pearl sprite (round 3 atlas 'gclamPearl') scaled up to the pearl's size, turned
// as it rolls, with a soft pale sheen round it (a slow breathing halo, the moon shell's kind of light: no sparkle, no glint
// star). The whirlpool's swirl shrinks it into the centre. One draw call path; culled off screen.

import { PL_FREE, PL_REST, PL_CARRY, PL_SWIRL, SWIRL_T } from './pearl.js';
import { drawSprite, spriteRect } from './sprites.js';
import { prefersReducedMotion } from './config.js';

const TAU = Math.PI * 2;

/**
 * Draw the pearl. `skipHeld`: true in the normal pass while it is in a hand (main.js drawHeld draws it after the octopus).
 * Returns true when something was drawn (tests).
 */
export function drawPearl(c, camera, cw, ch, p, t, skipHeld = false) {
  if (!p) return false;
  const st = p.state;
  if (st !== PL_FREE && st !== PL_REST && st !== PL_CARRY && st !== PL_SWIRL) return false;
  if (skipHeld && st === PL_CARRY) return false;
  const ppu = camera.pxPerUnit;
  const sx = cw / 2 + (p.x - camera.x) * ppu, sy = ch / 2 + (p.y - camera.y) * ppu;
  let k = 1;
  if (st === PL_SWIRL) k = Math.max(0, 1 - p.swirlT / SWIRL_T);
  const r = p.r * ppu * k;
  if (r < 0.5 || sx < -r * 3 || sy < -r * 3 || sx > cw + r * 3 || sy > ch + r * 3) return false;
  const breathe = prefersReducedMotion() ? 0 : Math.sin(t * 1.6) * 0.08;
  c.save();
  // the sheen: a soft, pale, cool-white light round it, wide and faint (it reads in a dark cave without a sparkle)
  const hr = r * (1.9 + breathe);
  const g = c.createRadialGradient(sx, sy, r * 0.6, sx, sy, hr);
  g.addColorStop(0, 'rgba(236,232,248,0.30)'); g.addColorStop(1, 'rgba(236,232,248,0)');
  c.fillStyle = g; c.beginPath(); c.arc(sx, sy, hr, 0, TAU); c.fill();
  const size = r * 2 * 1.08;
  if (!(spriteRect('gclamPearl') && drawSprite(c, 'gclamPearl', sx, sy, size, size, 0.5, 0.5, p.rot || 0))) {
    const b = c.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.05, sx, sy, r);
    b.addColorStop(0, '#f4eee6'); b.addColorStop(1, '#cdc1b6');
    c.fillStyle = b; c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.fill();
    c.lineWidth = Math.max(1, ppu * 0.05); c.strokeStyle = '#6f6260'; c.stroke();
  }
  // a milky soft patch on the upper side that stays put while it rolls (the light comes from above)
  const mx = sx - r * 0.3, my = sy - r * 0.35, mr = r * 0.55;
  const m = c.createRadialGradient(mx, my, 0, mx, my, mr);
  m.addColorStop(0, 'rgba(255,253,248,' + (0.32 + breathe).toFixed(3) + ')'); m.addColorStop(1, 'rgba(255,253,248,0)');
  c.fillStyle = m; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
  c.restore();
  return true;
}
