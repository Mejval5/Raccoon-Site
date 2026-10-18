// Local co-op, Phase 2 (octomancer-web/MULTIPLAYER-PLAN.md decisions 5 and 6): the Spelunky-style ghost of a dead player.
// Pure state and geometry, no DOM and no world: main.js owns the ghosts (one per dead player in co-op, `p.ghost`), feeds them
// the player's input, and applies what they did (a blow, a freeze) to the world's creatures, props and corpses.
//
// The ghost rises from the body GHOST.riseS after the death, floats through everything (no collision, no hurt, no grab, no
// buying, no talking, no portals; the shared camera never frames it), and has two powers:
//  - Blow (the jet button): a soft push in a short cone along the aim, every GHOST.blowCd. No damage.
//  - Freeze (the use button): hold GHOST.chargeS to charge (a ring fills round the ghost), let go to cast: the nearest creature
//    within GHOST.freezeReach freezes for GHOST.freezeS. Then GHOST.freezeCd of cooldown. Letting go early cancels.
// The next level (and the zone-end rest grotto) brings the player back alive with REVIVE_HEARTS (players.js); the grotto's
// spring revives a ghost that floats into it as well.

export const GHOST = Object.freeze({
  riseS: 1.0,        // s from the death to the ghost (the ragdoll has mostly settled by then)
  speed: 4.8,        // tiles/s top speed (a live octopus swims at 6)
  accel: 7,          // 1/s: how fast the velocity follows the stick (a soft, floaty start and stop)
  blowCd: 0.6,       // s between blows (held: one on each refill)
  blowRange: 2.8,    // tiles: how far the puff reaches
  blowCos: 0.82,     // cos of the cone's half angle (about 35 degrees)
  blowPush: 5,       // u/s given to a unit-mass prop at the ghost's mouth (props.nudge divides by mass); half at the far end
  puffS: 0.5,        // s the drawn puff of bubbles lasts
  chargeS: 2.5,      // s the use button is held to charge a freeze
  freezeReach: 4,    // tiles: the creature it freezes must be this near
  freezeS: 3,        // s a creature stays frozen
  freezeCd: 10,      // s before the next freeze can charge
});

/** A new ghost at (x, y) (the body's position; it drifts up out of it). */
export function createGhost(x, y) {
  return {
    x, y, prevX: x, prevY: y, vx: 0, vy: -1.2, face: 1, t: 0,
    blowCd: 0, puff: 0, bx: 1, by: 0,          // the last blow's direction (the drawn puff)
    charge: 0, charging: false, freezeCd: 0, useWas: false,
    blew: false, cast: false, cancelled: false, // this step's events (main.js reads them right after stepGhost)
  };
}

/**
 * One fixed step of a ghost. (mx, my): the stick or WASD (-1..1); `blow`: the jet button down (pressed or held) this step;
 * `use`: the use button held. Sets g.blew (a blow goes off now, along (g.bx, g.by) which main.js sets from the aim before or
 * after), g.cast (a full charge was let go: main.js picks the creature and calls freezeDone), g.cancelled (let go early).
 */
export function stepGhost(g, mx, my, blow, use, dt) {
  g.prevX = g.x; g.prevY = g.y;
  g.t += dt;
  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  const k = Math.min(1, GHOST.accel * dt);
  g.vx += (mx * GHOST.speed - g.vx) * k;
  g.vy += (my * GHOST.speed - g.vy) * k;
  g.x += g.vx * dt; g.y += g.vy * dt;
  if (Math.abs(mx) > 0.25) g.face = mx > 0 ? 1 : -1;
  g.blew = false; g.cast = false; g.cancelled = false;
  if (g.blowCd > 0) g.blowCd = Math.max(0, g.blowCd - dt);
  if (g.puff > 0) g.puff = Math.max(0, g.puff - dt);
  if (g.freezeCd > 0) g.freezeCd = Math.max(0, g.freezeCd - dt);
  if (blow && g.blowCd <= 0) { g.blowCd = GHOST.blowCd; g.puff = GHOST.puffS; g.blew = true; }
  if (use) {
    if (g.freezeCd <= 0 && (g.charging || !g.useWas)) { g.charging = true; g.charge = Math.min(GHOST.chargeS, g.charge + dt); } // a press made during the cooldown does not start charging when it ends
  } else if (g.charging) {
    if (g.charge >= GHOST.chargeS - 1e-6) g.cast = true; else g.cancelled = true;
    g.charging = false; g.charge = 0;
  }
  g.useWas = use;
  return g;
}

/** The cast found a creature: the cooldown starts. (Nothing in reach: no cooldown, the charge is just spent.) */
export function freezeDone(g) { g.freezeCd = GHOST.freezeCd; }

/** 0..1: how full the charge ring is. */
export function chargeOf(g) { return g.charging ? g.charge / GHOST.chargeS : 0; }

/**
 * How hard a blow from (gx, gy) along the unit (ux, uy) pushes something at (x, y) of radius r: 0 outside the cone, else 1 at
 * the mouth down to 0.5 at the far end. The thing counts when its edge reaches into the range; right on top of the ghost it is
 * always inside (no direction to judge).
 */
export function blowFactor(gx, gy, ux, uy, x, y, r = 0) {
  const dx = x - gx, dy = y - gy, d = Math.hypot(dx, dy);
  if (d - r > GHOST.blowRange) return 0;
  if (d > 0.35 && (dx * ux + dy * uy) / d < GHOST.blowCos) return 0;
  return 1 - 0.5 * Math.min(1, Math.max(0, d - r) / GHOST.blowRange);
}

/** The creature a freeze takes: the nearest live one within reach of (gx, gy) (no line of sight needed: a ghost sees through
 *  rock). `list` = enemy records ({x, y, dead, ghost, kind}); the Beholder never freezes. Returns the record or null. */
export function pickFreeze(gx, gy, list, reach = GHOST.freezeReach) {
  let best = null, bd = reach * reach;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.dead || e.ghost || e.kind === 'beholder') continue;
    const d = (e.x - gx) * (e.x - gx) + (e.y - gy) * (e.y - gy);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}

/** Keep the ghost inside the box (the camera's view, the level). */
export function clampGhost(g, x0, y0, x1, y1) {
  if (x1 > x0) { if (g.x < x0) { g.x = x0; if (g.vx < 0) g.vx = 0; } else if (g.x > x1) { g.x = x1; if (g.vx > 0) g.vx = 0; } }
  if (y1 > y0) { if (g.y < y0) { g.y = y0; if (g.vy < 0) g.vy = 0; } else if (g.y > y1) { g.y = y1; if (g.vy > 0) g.vy = 0; } }
}
