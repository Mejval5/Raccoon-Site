// V2-PLAN 16: currency shells by value. One table, read by pickups.js (what a placed or dropped shell is worth and how it
// looks), loot / chests (a sum of shells is paid out in the fewest natural pieces) and the giant clam's pearl.
//   cowrie   1  small, common
//   conch    5  spiral conch, uncommon
//   nautilus 15 big chambered shell, rare
//   pearl    30 only inside a giant clam (creatures.js), never placed loose
//   moon     50 the top shell: only the Swift Current bonus brings one (swift.js), never placed loose
// (Owner: damage model. The drawing lives in shells-draw / render.js; the art is natural, no glossy gem look.)

export const SK_COWRIE = 1, SK_CONCH = 2, SK_NAUTILUS = 3, SK_PEARL = 4, SK_MOON = 5;
export const SHELL_NAMES = ['', 'cowrie', 'conch', 'nautilus', 'pearl', 'moon'];
export const SHELL_VALUE = [0, 1, 5, 15, 30, 50];
export const PEARL_VALUE = SHELL_VALUE[SK_PEARL];
export const MOON_VALUE = SHELL_VALUE[SK_MOON];
/** Drawn size per kind in tiles (grows with value). */
export const SHELL_SIZE = [0, 0.45, 0.6, 0.8, 0.4, 0.75];

const PIECES = [SK_NAUTILUS, SK_CONCH, SK_COWRIE]; // largest first

/**
 * Pay out n shells as a list of kinds that sums to exactly n, in natural pieces: nautilus (15) first, then conch (5), then
 * cowries (1). With an rng a little variety is added so a small sum is not always the same pile: a 5 is sometimes paid as
 * five cowries (when n <= 14), a 15 as conches and cowries (when n <= 40).
 */
export function payout(n, rng = null) {
  const out = [];
  let rem = Math.max(0, Math.floor(n));
  const total = rem;
  for (const sk of PIECES) {
    const v = SHELL_VALUE[sk];
    let cnt = Math.floor(rem / v);
    if (rng && cnt > 0 && sk === SK_NAUTILUS && total <= 40 && rng() < 0.25) cnt--;
    else if (rng && cnt > 0 && sk === SK_CONCH && total <= 14 && rng() < 0.3) cnt--;
    for (let i = 0; i < cnt; i++) out.push(sk);
    rem -= cnt * v;
  }
  return out;
}

/**
 * The kind of a loose shell placed in a level: cowrie ~70%, conch ~25%, nautilus ~5% on the first level, a little more
 * conch and nautilus deeper. Pearls are never placed loose (only a giant clam holds one).
 */
export function pickPlacedKind(rng, levelIndex = 1) {
  const depth = Math.max(0, Math.min(8, (levelIndex | 0) - 1));
  const nautilus = 0.05 + 0.006 * depth, conch = 0.25 + 0.02 * depth;
  const r = rng();
  return r < nautilus ? SK_NAUTILUS : r < nautilus + conch ? SK_CONCH : SK_COWRIE;
}
