// Tutorial assists (round 22, behind ?v2=1): the bomb wall must never strand the player.
//   - bombs refill to 1 whenever the count hits 0 while the wall still stands, anywhere in the tutorial;
//   - a player who idles (not moving) for IDLE_HINT_S seconds while the wall stands gets the bomb hint
//     back and the wall cue pulses harder.
// Pure functions over plain state, so tests can play the tutorial without the game page.

import { BOMB_MAX } from './config.js';

export const IDLE_HINT_S = 5;
export const IDLE_SPEED = 0.6;   // u/s: slower than this counts as idle
/** The tutorial guarantees at least one bomb while its wall stands: authored-map solvability may count the wall as passable. */
export const TUTORIAL_BOMBS_GUARANTEED = true;

export function createTutorialState() {
  return { idle: 0, hint: false, refills: 0 };
}

/**
 * One fixed step in the tutorial.
 * @param {{bombs:number, vx:number, vy:number}} octo
 * @param {boolean} wallIntact any bomb-wall tile still solid
 * @returns {boolean} true when a bomb was refilled this step
 */
export function tutorialStep(st, octo, wallIntact, dt) {
  let refilled = false;
  if (wallIntact && octo.bombs < 1 && BOMB_MAX >= 1) { octo.bombs = 1; st.refills++; refilled = true; }
  const speed = Math.hypot(octo.vx, octo.vy);
  if (!wallIntact || speed >= IDLE_SPEED) { st.idle = 0; st.hint = false; }
  else { st.idle += dt; if (st.idle >= IDLE_HINT_S) st.hint = true; }
  return refilled;
}

/** Placing a bomb counts as doing something: the hint goes away and the idle clock restarts. */
export function tutorialActed(st) { st.idle = 0; st.hint = false; }
