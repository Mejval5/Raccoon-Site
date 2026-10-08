// Fragile terrain (2026-10-08): the fish-bone block (materials.js MAT_BONE, room char 'B'), a plug of packed fish bones
// that crumbles from anything with a bit of force: a dash, the Ink Jet, a cannon shot, a harpoon, a thrown or flung prop,
// a bomb and a falling boulder. It never has to be broken to finish a level (level-spawns.js places it only where the
// A* path does not need it: solid stays solid for the path check), but it hides shortcuts and the odd buried find.
//
// One entry point for every breaker: world.crumbleTile(tx, ty, cause) (world-v2.js) turns a fragile tile into water and
// logs it; main.js drains world.takeCrumbles() once per step for the shards, the silt, the crunch and the journal.
// Bombs (world.breakTile) and boulders (world.smashTile) log the bone tiles they break into the same list.
// Leaf module: imports only materials.js, so octopus.js, props.js, inkjet.js, enemies.js and npcs.js can all use it.

import { MAT_BONE } from './materials.js';

export const CR_NONE = 0, CR_DASH = 1, CR_INK = 2, CR_SHOT = 3, CR_HARPOON = 4, CR_PROP = 5, CR_BOMB = 6, CR_BOULDER = 7;
export const CRUMBLE_CAUSES = ['', 'dash', 'ink', 'shot', 'harpoon', 'prop', 'bomb', 'boulder'];

/** Material ids that crumble from a light hit (dash, projectiles, props): only the fish bone. */
export const MAT_FRAGILE = new Uint8Array([0, 0, 0, 1, 0, 0]);
export function isFragileMat(m) { return m === MAT_BONE; }

// tuning
export const DASH_BREAK_SPEED = 3.5;  // u/s: a dash this fast (inside the dash window) crumbles the bone in front of it
export const DASH_BREAK_KEEP = 0.95;  // the dash keeps this much of its speed per crunch (a little bite, never a stop)
export const DASH_BREAK_REACH = 0.14; // tiles looked ahead of the body (plus this step's travel) along the dash
export const PROP_BREAK_SPEED = 6;    // u/s: a prop hitting fish bone this fast (along the wall normal) breaks the tile

/**
 * Crumble every fragile tile a circle at (x, y) of radius r overlaps. Returns how many broke.
 * `dx, dy` (optional, unit): only tiles whose centre lies ahead along it (a dash breaks what is in front, not under it).
 */
export function crumbleCircle(world, x, y, r, cause, dx = 0, dy = 0) {
  if (!world || typeof world.crumbleTile !== 'function') return 0;
  let n = 0;
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isFragileMat(world.tileAt(tx, ty))) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1)); // nearest point of the tile
      if ((cx - x) * (cx - x) + (cy - y) * (cy - y) > r * r) continue;
      if ((dx || dy) && (tx + 0.5 - x) * dx + (ty + 0.5 - y) * dy <= 0) continue;
      if (world.crumbleTile(tx, ty, cause)) n++;
    }
  }
  return n;
}

/** A projectile at (x, y) found solid: crumble the tile there if it is fish bone. True when it broke. */
export function crumbleAt(world, x, y, cause) {
  if (!world || typeof world.crumbleTile !== 'function') return false;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!isFragileMat(world.tileAt(tx, ty))) return false;
  return world.crumbleTile(tx, ty, cause);
}

/**
 * octopus.js, before the collision of a step while the dash window runs: a fast dash crumbles the fish bone just in
 * front of the body, so it swims straight through instead of bouncing off. Sets o.crunched (pieces broken this step).
 */
export function dashCrumble(o, dt, world) {
  o.crunched = 0;
  if (!world || typeof world.crumbleTile !== 'function') return 0;
  const sp = Math.hypot(o.vx, o.vy);
  if (sp < DASH_BREAK_SPEED) return 0;
  const ux = o.vx / sp, uy = o.vy / sp, ahead = sp * dt + DASH_BREAK_REACH;
  let n = crumbleCircle(world, o.x + ux * ahead, o.y + uy * ahead, o.radius + 0.04, CR_DASH, ux, uy);
  // a plug two tiles thick pops in one go: the dash chews on one more tile along its line
  if (n) n += crumbleCircle(world, o.x + ux * (ahead + 1), o.y + uy * (ahead + 1), o.radius + 0.04, CR_DASH, ux, uy);
  if (n) { o.vx *= DASH_BREAK_KEEP; o.vy *= DASH_BREAK_KEEP; o.crunched = n; }
  return n;
}
