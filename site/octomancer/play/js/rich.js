// Controller Phase 2B (octomancer-web/CONTROLLER-PLAN.md "Text in the world, not over it"): guidance text that names
// controls. A sign, a cave painting or an object prompt is written once with tokens, and every token is drawn as the active
// scheme's glyph (glyphs.js), so a pad player reads A / RT / RB and a desktop player F / LMB / RMB:
//
//   {hand}     the action's first glyph in the scheme ('F' on the desktop, 'LB' on a pad, 'Grab' on a phone)
//   {dash+}    every glyph of the action, one after another with a small '/' (desktop: Space / Shift; pad: B / LT)
//   {key:J}    a literal key or mouse button (a second key in desktop text: '{key:J} or {key:K}')
//
// Pure layout (no DOM): `richSegments` resolves the tokens, `plainText` gives the same text with the glyphs as their
// labels (tests, toasts), `layoutRich` wraps it to a width with a measuring context, `drawRichLayout` draws it.

import { glyph, glyphs, keyGlyph, glyphWidth, drawGlyph } from './glyphs.js';

const TOKEN = /\{([a-z]+)(\+?)\}|\{key:([^}]+)\}/g;

/**
 * The text of `str` as segments for `scheme` ('desktop' | 'pad' | 'touch' | 'keyboard' | 'mouse') and pad `style`:
 * [{t: 'text', s} | {t: 'glyph', g: [glyph ...]}]. An action the scheme lacks reads as its name in words.
 */
export function richSegments(str, scheme, style = 'xbox') {
  const out = [];
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(str); m; m = TOKEN.exec(str)) {
    if (m.index > last) out.push({ t: 'text', s: str.slice(last, m.index) });
    last = TOKEN.lastIndex;
    let gs;
    if (m[3]) gs = [keyGlyph(m[3])];
    else if (m[2]) gs = glyphs(m[1], scheme, style);
    else { const g = glyph(m[1], scheme, style); gs = g ? [g] : []; }
    if (gs.length) out.push({ t: 'glyph', g: gs });
    else out.push({ t: 'text', s: m[1] });
  }
  if (last < str.length) out.push({ t: 'text', s: str.slice(last) });
  return out;
}

/** The same text with each glyph as its label ('F', 'A', 'Space/Shift'): what tests read and what a toast can say. */
export function plainText(str, scheme, style = 'xbox') {
  return richSegments(str, scheme, style).map((s) => (s.t === 'text' ? s.s : s.g.map((g) => g.label).join('/'))).join('');
}

/** Every glyph label the text draws, in order (tests). */
export function glyphLabels(str, scheme, style = 'xbox') {
  const out = [];
  for (const s of richSegments(str, scheme, style)) if (s.t === 'glyph') for (const g of s.g) out.push(g.label);
  return out;
}

/**
 * Wrap `str` to `maxW` px. `measure(s)` gives a text run's width at the font in use; a glyph is `r` px half-high.
 * Returns {lines: [{w, items: [{t:'text', s, w} | {t:'glyph', g, w}]}], w (widest line), r}. Words never split; a glyph
 * group stays with the word it touches ("{hand}." keeps the full stop).
 */
export function layoutRich(str, scheme, style, measure, maxW, r) {
  // tokens: words with their trailing space, and glyph groups; a group's width includes its '/' separators
  const sep = measure('/') + r * 0.3;
  const atoms = [];
  for (const seg of richSegments(str, scheme, style)) {
    if (seg.t === 'glyph') {
      let w = 0;
      seg.g.forEach((g, i) => { w += glyphWidth(g, r) + (i ? sep : 0); });
      atoms.push({ t: 'glyph', g: seg.g, w, gap: false });
      continue;
    }
    const parts = seg.s.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { if (atoms.length) atoms[atoms.length - 1].gap = true; continue; }
      atoms.push({ t: 'text', s: p, w: measure(p), gap: false });
    }
  }
  const space = measure(' ');
  const lines = [];
  let cur = { w: 0, items: [] };
  let glue = false; // the previous atom had no space after it: this one sticks to it ("{hand}." / "(J")
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const pad = cur.items.length && !glue ? space + (a.t === 'glyph' || cur.items[cur.items.length - 1].t === 'glyph' ? r * 0.15 : 0) : 0;
    if (cur.items.length && !glue && cur.w + pad + a.w > maxW) { lines.push(cur); cur = { w: 0, items: [] }; }
    const lead = cur.items.length ? (glue ? (a.t === 'glyph' || cur.items[cur.items.length - 1].t === 'glyph' ? r * 0.12 : 0) : pad) : 0;
    cur.items.push({ t: a.t, s: a.s, g: a.g, w: a.w, x: cur.w + lead });
    cur.w += lead + a.w;
    glue = !a.gap;
  }
  if (cur.items.length) lines.push(cur);
  let w = 0;
  for (const l of lines) w = Math.max(w, l.w);
  return { lines, w, r, sep };
}

/**
 * Draw a layout with its first line's middle at y (lines `lh` px apart), each line centred on x (align 'center') or
 * starting at x ('left'). The caller has set the font and fillStyle; glyphs take `look` (glyphs.js LOOK_*).
 */
export function drawRichLayout(ctx, L, x, y, lh, look = null, align = 'center') {
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const fill = ctx.fillStyle;
  L.lines.forEach((line, li) => {
    const x0 = align === 'center' ? x - line.w / 2 : x, yy = y + li * lh;
    for (const it of line.items) {
      if (it.t === 'text') { ctx.fillStyle = fill; ctx.fillText(it.s, x0 + it.x, yy); continue; }
      let gx = x0 + it.x;
      it.g.forEach((g, i) => {
        if (i) { ctx.fillStyle = fill; ctx.fillText('/', gx + L.r * 0.15, yy); gx += L.sep; }
        const gw = glyphWidth(g, L.r);
        drawGlyph(ctx, g, gx + gw / 2, yy, L.r, look);
        gx += gw;
      });
    }
  });
  ctx.fillStyle = fill;
}
