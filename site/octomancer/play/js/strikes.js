// What the octopus's own body does to creatures (Actions tuning, 2026-10-08).
//
// The dash no longer hurts anything: it only moves the octopus and makes it invincible for DASH_IFRAMES (octopus.js
// `dashInvuln`). Contact damage from the body comes from one carried item, the Urchin Cap (items.js 'urchincap', sets
// `octo.spikeHelmet`): while it is worn, touching a creature at ram speed (a dash, or any swim that fast) hurts it the way
// the old dash did (enemies.js kills a dash-killable enemy, npcs.js takes RAM_DMG, the shopkeeper a glancing HIT_DASH).
//
// This is the ONE predicate every body-contact site asks (enemies.js, npcs.js, shopkeeper.js). When the Unified creature
// rules owner's shared damage entry lands (octomancer-web/CREATURES.md), retarget the callers' hit through it from here.
// The Ink Jet's damage has its own single call site: main.js `inkHurt`.

import { DASH_KILL_SPEED } from './config.js';

export const RAM_SPEED = DASH_KILL_SPEED; // u/s: as fast as a fresh dash
export const RAM_DMG = 2;                 // hearts a ram takes off a person (npcs.js); enemies with dashKillable just die

/** True while the octopus wears the Urchin Cap and moves at ram speed: its body hurts what it touches. */
export function octoRams(o) {
  return !!o.spikeHelmet && !o.dead && Math.hypot(o.vx || 0, o.vy || 0) >= RAM_SPEED;
}

/** True during a dash's i-frames: body contact with a creature does nothing to either side (unless it rams). */
export function octoPhasing(o) {
  return !o.dead && (o.dashInvuln || 0) > 0;
}
