// Shop aggro hooks (2026-10-07, the Shop and shopkeeper owner). A tiny registry so any module can anger the shopkeepers
// or hit one without importing main.js: main.js registers the real handlers (setShopHooks) for the level that is loaded.
//
//   shopAggro(reason)                       every shopkeeper turns hostile for the rest of the run (run.shopAggro).
//                                           reason: 'hurt' | 'shop' (his stall damaged or bombed) | 'theft' | 'kill' | any string.
//                                           Returns true when this call is what angered them (false: already angry, or no run).
//   hitShopkeepersAt(x, y, r, kind, dmg, fromX, fromY)
//                                           a hit landing in a circle: every keeper whose body overlaps it takes `dmg` scaled by
//                                           the keeper's resistance to `kind` (HIT_INK, HIT_DASH barely scratch him; HIT_BOMB,
//                                           HIT_HEAVY really hurt). Any hit on a keeper is also aggro. Returns the damage dealt (0: missed).
//   isShopAggro()                           whether the run's shopkeepers are hostile.
//
// Kept data-free on purpose: the keepers themselves are flat arrays in shopkeeper.js.

export const HIT_INK = 1, HIT_DASH = 2, HIT_BOMB = 3, HIT_HEAVY = 4;

/** Whether the octopus is in a dash right now (octopus.js dashT: the window after a dash; or simply dash-fast). */
export function octoDashing(o) {
  const v = Math.hypot(o.vx || 0, o.vy || 0);
  return !o.dead && (v >= 8 || ((o.dashT || 0) > 0 && v > 4.5));
}

let hooks = { aggro: null, hit: null, angry: null };

/** main.js: the handlers for the current run / level. Missing ones become no-ops. */
export function setShopHooks(h) { hooks = { aggro: h.aggro || null, hit: h.hit || null, angry: h.angry || null }; }

export function shopAggro(reason = 'hurt') { return hooks.aggro ? !!hooks.aggro(String(reason)) : false; }

export function hitShopkeepersAt(x, y, r, kind, dmg, fromX = x, fromY = y) { return hooks.hit ? hooks.hit(x, y, r, kind, dmg, fromX, fromY) : 0; }

export function isShopAggro() { return hooks.angry ? !!hooks.angry() : false; }
