// Score: depth (m) + pickups + kills. OVERNIGHT.md §4 M4-1:
// "score = depth + 1 per plankton + 10 per pearl + 50 per shell + 25 per kill".

/**
 * @param {number} depth world units of depth reached (already relative to start)
 * @param {{pearls:number, plankton:number, shells:number}} pickupTotals
 * @param {number} kills enemies killed this run (dash-through or bomb)
 */
export function computeScore(depth, pickupTotals, kills) {
  const d = Math.max(0, Math.round(depth));
  return d
    + pickupTotals.plankton * 1
    + pickupTotals.pearls * 10
    + pickupTotals.shells * 50
    + kills * 25;
}
