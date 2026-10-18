// Local co-op, Phase 2: drawing a ghost (ghost.js). The octopus sprite itself, pale and see-through with a faint rim in the
// player's colour (octopus-draw.js drawOctopusGhost), bobbing gently; the blow as a puff of pale bubbles along its cone; the
// freeze charge as a thin ring round it that fills in the player's colour. All code-drawn, no new images, nothing glossy.
import { worldToScreen } from './camera.js';
import { drawOctopusGhost } from './octopus-draw.js';
import { GHOST, chargeOf } from './ghost.js';

const TAU = Math.PI * 2;
const GHOST_ALPHA = 0.55;

/**
 * @param {CanvasRenderingContext2D} ctx @param camera @param {number} cw @param {number} ch
 * @param g the ghost (ghost.js) @param pose a reusable octopus-like pose record @param look {ui, wash} @param {number} time
 * @param {number} alpha the render interpolation
 */
export function drawGhost(ctx, camera, cw, ch, g, pose, look, time, alpha) {
  const ppu = camera.pxPerUnit;
  const ix = g.prevX + (g.x - g.prevX) * alpha;
  const iy = g.prevY + (g.y - g.prevY) * alpha + Math.sin(g.t * 2.1) * 0.06; // a slow bob
  const s = worldToScreen(camera, cw, ch, ix, iy);
  if (s.x < -ppu * 3 || s.y < -ppu * 3 || s.x > cw + ppu * 3 || s.y > ch + ppu * 3) return;
  const sp = Math.hypot(g.vx, g.vy);
  // the pose: idle at rest, the swim clip while it moves; it leans into the way it floats (never upside down)
  pose.x = ix; pose.y = iy; pose.swimming = sp > 0.6; pose.__t = time; pose.__speed = sp;
  const lean = Math.max(-40, Math.min(40, g.vx * 7));
  const rise = Math.min(1, g.t / 0.5); // it fades in as it rises out of the body
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((lean * Math.PI) / 180);
  ctx.scale(ppu, ppu);
  drawOctopusGhost(ctx, pose, look.wash, look.ui, GHOST_ALPHA * rise * (0.92 + 0.08 * Math.sin(g.t * 3.3)));
  ctx.restore();
  if (g.puff > 0) drawPuff(ctx, s.x, s.y, ppu, g);
  drawCharge(ctx, s.x, s.y, ppu, g, look.ui, time);
}

/** The blow: pale bubbles thrown out along the cone, slowing and fading. */
function drawPuff(ctx, sx, sy, ppu, g) {
  const u = 1 - g.puff / GHOST.puffS; // 0 at the blow, 1 when it is gone
  const ease = 1 - (1 - u) * (1 - u);
  const ang = Math.atan2(g.by, g.bx);
  ctx.save();
  ctx.lineWidth = Math.max(1, ppu * 0.02);
  for (let k = 0; k < 7; k++) {
    const rk = ((k * 37) % 7) / 7; // a fixed spread per bubble
    const a = ang + (rk - 0.5) * 0.9;
    const d = ppu * (0.35 + GHOST.blowRange * ease * (0.45 + 0.55 * ((k * 3) % 7) / 6));
    const x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d - ppu * 0.15 * u;
    const r = ppu * (0.05 + 0.045 * rk) * (1 - 0.35 * u);
    const al = (1 - u) * 0.75;
    ctx.fillStyle = 'rgba(226,238,242,' + (al * 0.55).toFixed(3) + ')';
    ctx.strokeStyle = 'rgba(40,62,76,' + (al * 0.6).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** The freeze charge: a thin ring round the ghost filling clockwise from the top in the player's colour; full, it breathes.
 *  The use button held during the cooldown shows the ring's dim track refilling instead. */
function drawCharge(ctx, sx, sy, ppu, g, col, time) {
  const c = chargeOf(g);
  const cooling = !g.charging && g.useWas && g.freezeCd > 0;
  if (c <= 0 && !cooling) return;
  const r = ppu * 0.72, lw = Math.max(2, ppu * 0.06);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = 'rgba(20,34,44,0.35)';
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke(); // the track
  if (cooling) {
    ctx.strokeStyle = 'rgba(214,226,232,0.45)';
    ctx.beginPath(); ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - g.freezeCd / GHOST.freezeCd)); ctx.stroke();
  } else {
    const full = c >= 1 - 1e-6;
    ctx.strokeStyle = col;
    ctx.globalAlpha = full ? 0.75 + 0.25 * Math.sin(time * 6) : 0.9;
    ctx.lineWidth = full ? lw * 1.3 : lw;
    ctx.beginPath(); ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + TAU * c); ctx.stroke();
  }
  ctx.restore();
}
