// Controller Phase 2A: glyphs.js icons as small DOM canvases, for the HTML screens (the journal's pad legend, the settings
// Controller block). Drawn once when a screen builds or the pad style changes, never per frame.

import { glyph, glyphWidth, drawGlyph } from './glyphs.js';

/** One glyph as a canvas `2 r` px tall (CSS px), crisp on a HiDPI screen. */
export function glyphCanvas(g, r = 8) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = Math.ceil(glyphWidth(g, r)) + 2, h = 2 * r + 2;
  const cv = document.createElement('canvas');
  cv.className = 'octo-glyph';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.dataset.glyph = g.label; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', g.label); cv.title = g.label;
  const c = cv.getContext('2d');
  if (c) { c.scale(dpr, dpr); drawGlyph(c, g, w / 2, h / 2, r); }
  return cv;
}

/**
 * A legend line of pad buttons and what they do here: [[action | action[], words], ...] -> a span of glyph + word pairs
 * (class octo-padhint; play.css shows it only in pad mode). Actions are glyphs.js PAD_MAP names (menus: confirm back
 * tabprev tabnext menux menuy).
 */
export function padLegend(pairs, style = 'xbox', r = 9.5) {
  const box = document.createElement('span');
  box.className = 'octo-padhint';
  for (const [acts, words] of pairs) {
    const part = document.createElement('span');
    part.className = 'octo-padhint-part';
    for (const a of Array.isArray(acts) ? acts : [acts]) {
      const g = glyph(a, 'pad', style);
      if (g) part.appendChild(glyphCanvas(g, r));
    }
    const t = document.createElement('span');
    t.textContent = words;
    part.appendChild(t);
    box.appendChild(part);
  }
  return box;
}
