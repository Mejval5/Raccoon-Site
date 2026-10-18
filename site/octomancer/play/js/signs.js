// Controller Phase 2B: guidance lives in the world (CONTROLLER-PLAN "Text in the world, not over it"). The prompts of a level
// (tutorial.json, hub.json, rest.json, the altar's) are signs: a plank on a post standing on the floor (`sign: [tx, ty]`, the
// open tile it stands in), a board hung from the ceiling on two ropes (`hang: [tx, ty, drop?]`, the open tile under the rock),
// or a board fixed to an object (`anchor: [x, y]`, its bottom middle; shown only while the octopus is near). The sign the
// octopus is near opens into a board with the whole text (signs-draw.js); the words name controls with rich.js tokens.
//
//   prompt: {title, label?, x, y, r, desktop, pad?, touch, when?, sign? | hang? | anchor?}
//
// Pure: no DOM, no canvas. The game (main.js) picks the open sign each step; tests read the same functions.

/** The prompt's text for a sign scheme ('desktop' | 'pad' | 'touch'): a pad reads `pad` when written, else the desktop words. */
export function signText(p, scheme) {
  if (!p) return '';
  if (scheme === 'touch') return p.touch || p.desktop || '';
  if (scheme === 'pad') return p.pad || p.desktop || '';
  return p.desktop || '';
}

/** The nearest prompt whose radius holds (x, y), or null. `skip(p)` leaves a prompt out (the hub's sealed / open ones). */
export function pickPrompt(prompts, x, y, skip = null) {
  let best = null, bd = 1e9;
  for (const p of prompts || []) {
    if (skip && skip(p)) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < p.r && d < bd) { best = p; bd = d; }
  }
  return best;
}

/**
 * Give every prompt without a place a sign: a post on the floor under its centre (a column or two aside if need be), else a
 * board hung from the rock above it, else a board anchored at its centre. `solid(tx, ty)` is the tile test. Mutates and
 * returns the list (the authored levels keep their own written places).
 */
export function placeSigns(prompts, solid) {
  for (const p of prompts || []) {
    if (p.sign || p.hang || p.anchor) continue;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    let done = false;
    for (const dx of [0, 1, -1, 2, -2]) {
      const tx = cx + dx;
      if (solid(tx, cy)) continue;
      for (let ty = cy; ty <= cy + 8; ty++) {
        if (solid(tx, ty)) break;
        if (solid(tx, ty + 1) && !solid(tx, ty - 1)) { p.sign = [tx, ty]; done = true; break; }
      }
      if (done) break;
    }
    if (done) continue;
    for (let ty = cy; ty >= cy - 8; ty--) {
      if (solid(cx, ty)) break;
      if (solid(cx, ty - 1)) { p.hang = [cx, ty]; done = true; break; }
    }
    if (!done) p.anchor = [p.x, p.y - 0.5];
  }
  return prompts;
}

/** The scheme's controls, in the order the tutorial's painting and the journal's Controls page show them: [action, name, note]. */
export const CONTROL_ROWS = [
  ['move', 'Swim', 'Through the water, any way you like.'],
  ['aim', 'Aim', 'Where the ink and the spells go.'],
  ['attack', 'Ink Jet', 'Squirts ink; it refills slowly.'],
  ['use', 'Use slot', 'Casts the spell or throws the bomb picked on the bar.'],
  ['hand', 'Hand', 'Grab, talk, buy, dive; again throws, hold drops.'],
  ['dash', 'Dash', 'A burst of speed; nothing hurts you mid-dash.'],
  ['cycle', 'Hotbar', 'Pick a slot on the bar.'],
  ['inventory', 'Journal', 'What you carry, and all you have met.'],
  ['pause', 'Pause', 'Stop the water; settings are in there.'],
];
