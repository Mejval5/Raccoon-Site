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
  ['attack', 'Ink jet', 'Squirts ink; it refills slowly.'],
  ['use', 'Use slot', 'Casts the spell or throws the bomb picked on the bar.'],
  ['hand', 'Hand', 'Grab, talk, buy, dive; again throws, hold drops.'],
  ['dash', 'Dash', 'A burst of speed; nothing hurts you mid-dash.'],
  ['cycle', 'Hotbar', 'Pick a slot on the bar.'],
  ['inventory', 'Journal', 'What you carry, and all you have met.'],
  ['pause', 'Pause', 'Stop the water; settings are in there.'],
];

// --- Night batch 1 (IMPROVEMENTS.md #1): where an open board goes. The board is drawn above the actors (main.js postOctoDraw ->
// signs-draw.js drawSignBoards), so it must keep clear of what it explains (the whirlpool, the altar, the wares), of the
// octopus that reads it and of the other posts. It still hangs on its own post / ropes: it prefers to open straight up from
// the post top (or down from the rope ends); when that spot is taken it slides aside, rises higher on a longer cord, or
// flips, and it stays inside the view. All in world tiles; pure, so the tests place boards with the real level data.

/** Rects {x0, y0, x1, y1} (tiles) of what a sign's board must not hide on an authored or generated level: its whirlpools and
 *  their key hint, the shop's wares and their "buy" tag, the mirror shell; the tutorial's controls painting as a `soft` one
 *  (left clear where that costs little). `extra` rects (the altar) are appended. */
export function levelSignTargets(lv, extra = null) {
  const out = [];
  const pool = (tx, ty) => { if (tx !== undefined && tx >= 0 && ty !== undefined && ty >= 0) out.push({ x0: tx + 0.5 - 1.6, y0: ty - 1.3, x1: tx + 0.5 + 1.6, y1: ty + 1.05 }); };
  if (lv) {
    pool(lv.exitX, lv.exitY);
    pool(lv.tutorialX, lv.tutorialY); pool(lv.shortcutX, lv.shortcutY); pool(lv.shortcut3X, lv.shortcut3Y);
    const s = lv.shop;
    if (s && s.px) {
      let a = 1e9, b = -1e9, fy = -1e9;
      for (let i = 0; i < s.px.length; i += 2) { a = Math.min(a, s.px[i]); b = Math.max(b, s.px[i]); fy = Math.max(fy, Math.floor(s.px[i + 1]) + 1); }
      out.push({ x0: a - 0.2, y0: fy - 2.45, x1: b + 1.2, y1: fy }); // the pedestals, the wares on them and the "{hand} buy" tag over a ware
    }
    if (lv.mirror) out.push({ x0: lv.mirror.x - 0.9, y0: lv.mirror.y - 1.8, x1: lv.mirror.x + 0.9, y1: lv.mirror.y });
    // the controls painting: better left readable, but a board may lie over it when nothing else is free (soft)
    if (lv.painting && lv.painting.rect) { const [x0, y0, x1, y1] = lv.painting.rect; out.push({ x0, y0, x1, y1, soft: true }); }
  }
  if (extra) for (const r of extra) if (r) out.push(r);
  return out;
}

/** Rects of the posts and hung planks of `prompts` (a closed sign's plank and post), skipping `except` and hidden ones. */
export function signPosts(prompts, except = null, hidden = null) {
  const out = [];
  for (const p of prompts || []) {
    if (p === except || (hidden && hidden(p))) continue;
    const half = ((p.label || p.title || '').length * 0.15 + 0.36) / 2 + 0.05;
    if (p.sign) { const x = p.sign[0] + 0.5, f = p.sign[1] + 1; out.push({ x0: x - half, y0: f - 1.05, x1: x + half, y1: f }); }
    else if (p.hang) { const x = p.hang[0] + 0.5, y = p.hang[1] + (p.hang[2] || 0.7); out.push({ x0: x - half, y0: y, x1: x + half, y1: y + 0.45 }); }
  }
  return out;
}

const ov = (r, x0, y0, x1, y1) => Math.max(0, Math.min(r.x1, x1) - Math.max(r.x0, x0)) * Math.max(0, Math.min(r.y1, y1) - Math.max(r.y0, y0));
/** Does rect r touch the disc (x, y, rad)? */
export function rectHitsDisc(r, x, y, rad) {
  const nx = Math.max(r.x0, Math.min(x, r.x1)), ny = Math.max(r.y0, Math.min(y, r.y1));
  return (nx - x) * (nx - x) + (ny - y) * (ny - y) < rad * rad;
}
/** Do two rects overlap (by more than a hair)? */
export function rectsHit(a, b) { return ov(a, b.x0, b.y0, b.x1, b.y1) > 1e-4; }

/**
 * The visible world a board must stay in, for a camera centred on (cx, cy) at `ppu` canvas px a tile on a cw x ch canvas
 * (`k` canvas px per CSS px), and the HUD corners it must not slide under (world rects): the hotbar top left, the vitals,
 * clock and round buttons top right; a band at the bottom for the controls line and the toasts.
 */
export function boardView(cx, cy, ppu, cw, ch, k = 1) {
  const W = cw / ppu, H = ch / ppu, x0 = cx - W / 2, y0 = cy - H / 2, px = (v) => (v * k) / ppu, css = cw / k;
  return {
    view: { x0: x0 + px(8), y0: y0 + px(8), x1: x0 + W - px(8), y1: y0 + H - px(60) },
    hud: [
      { x0, y0, x1: x0 + px(Math.min(170, css * 0.42)), y1: y0 + px(58) },
      { x0: x0 + W - px(Math.min(270, css * 0.56)), y0, x1: x0 + W, y1: y0 + px(155) },
    ],
  };
}

const SCRATCH = { x0: 0, y0: 0, x1: 0, y1: 0 }; // the candidate rect (no allocation per candidate)
export const OCTO_CLEAR = 1.2; // tiles: the disc round each octopus a board keeps clear of
const SHIFTS = [0, -0.12, 0.12, -0.24, 0.24, -0.36, 0.36, -0.48, 0.48, -0.6, 0.6]; // x board widths
const LIFTS = [0, 0.5, 1, 1.6, 2.3, 3.1, 4, 5, 6.5, 8, 10, 12]; // tiles further from the attach point

/**
 * The board's rect for an attach point. `a` = {x, y, dir: 'up' | 'down', w, h} (tiles; 'up' = the board's bottom sits on (x, y),
 * a post top; 'down' = its top hangs from (x, y), the rope ends). `targets` / `posts` = rects, `discs` = [{x, y}] octopi,
 * `view` = {x0, y0, x1, y1} (the visible world minus the HUD margins) or null, `solid(tx, ty)` or null, `prev` = the last
 * pick ({i, j, f}) so a board does not flick between two equal spots. Returns {x0, y0, x1, y1, i, j, f, cost, clear}.
 * About 150 candidates, only for the one open board: a few microseconds a frame.
 */
export function placeBoard(a, targets, posts, discs, view, solid, prev = null) {
  const w = a.w, h = a.h, R = OCTO_CLEAR;
  let best = null;
  for (let f = 0; f < 2; f++) {
    const up = (a.dir === 'up') !== (f === 1);
    for (let j = 0; j < LIFTS.length; j++) {
      for (let i = 0; i < SHIFTS.length; i++) {
        let x0 = a.x - w / 2 + SHIFTS[i] * w;
        let y0 = up ? a.y - LIFTS[j] - h : a.y + LIFTS[j];
        if (view) { // stay in the view (a board wider than it is centred)
          x0 = view.x1 - view.x0 <= w ? (view.x0 + view.x1 - w) / 2 : Math.max(view.x0, Math.min(view.x1 - w, x0));
          y0 = view.y1 - view.y0 <= h ? (view.y0 + view.y1 - h) / 2 : Math.max(view.y0, Math.min(view.y1 - h, y0));
        }
        const x1 = x0 + w, y1 = y0 + h, r = SCRATCH;
        r.x0 = x0; r.y0 = y0; r.x1 = x1; r.y1 = y1;
        let hard = 0, cost = 0;
        for (const t of targets) { const o = ov(t, x0, y0, x1, y1); if (o > 1e-4) { if (t.soft) cost += o * 3; else { hard++; cost += o * 40; } } }
        for (const d of discs) if (rectHitsDisc(r, d.x, d.y, R)) hard++;
        for (const t of posts) cost += ov(t, x0, y0, x1, y1) * 25;
        if (solid) {
          let n = 0;
          for (let ty = Math.floor(y0 + 0.3); ty <= Math.floor(y1 - 0.3); ty++) for (let tx = Math.floor(x0 + 0.3); tx <= Math.floor(x1 - 0.3); tx++) if (solid(tx, ty)) n++;
          cost += n * 1.5;
        }
        // the anchor: how far the board sits from where it hangs (its cord) and how far its middle is from the post
        const gapY = up ? a.y - y1 : y0 - a.y, outX = Math.max(0, x0 - a.x, a.x - x1);
        cost += Math.abs((x0 + x1) / 2 - a.x) * 0.35 + Math.abs(gapY) * 0.9 + outX * 3 + f * 4 + hard * 100;
        if (prev && prev.i === i && prev.j === j && prev.f === f) cost -= 1.5;
        if (!best || cost < best.cost) best = { x0, y0, x1, y1, i, j, f, cost, clear: hard === 0 };
      }
    }
  }
  return best;
}
