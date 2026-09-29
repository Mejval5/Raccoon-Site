// Score: depth (m) + pickups + kills. OVERNIGHT.md §4 M4-1:
// "score = depth + 1 per plankton + 10 per pearl + 50 per shell + 25 per kill"
// -- round-16 fix (pearls removed entirely, not Milan's art): pearls no
// longer contribute to score.

/**
 * @param {number} depth world units of depth reached (already relative to start)
 * @param {{plankton:number, shells:number}} pickupTotals
 * @param {number} kills enemies killed this run (dash-through or bomb)
 */
export function computeScore(depth, pickupTotals, kills) {
  const d = Math.max(0, Math.round(depth));
  return d
    + pickupTotals.plankton * 1
    + pickupTotals.shells * 50
    + kills * 25;
}
