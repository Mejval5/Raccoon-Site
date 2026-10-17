// Controller Phase 2B (octomancer-web/CONTROLLER-PLAN.md "Text in the world, not over it"): guidance text names controls with
// tokens that draw as the active scheme's glyphs (rich.js), the signs (signs.js, signs-draw.js), the tutorial's controls
// painting (cave-paint.js) and the journal's Controls tab. Checks the words a desktop / pad / phone player reads, the layout,
// that a scheme switch repaints (new board / painting), and that every authored sign text resolves.
import { richSegments, plainText, glyphLabels, layoutRich, drawRichLayout } from '../js/rich.js';
import { glyph, glyphs, signScheme, drawGlyph, LOOK_WOOD, LOOK_PAINT, PAD_MAP } from '../js/glyphs.js';
import { signText, pickPrompt, placeSigns, CONTROL_ROWS } from '../js/signs.js';
import { drawSigns, drawAnchorTag, boardCacheSize } from '../js/signs-draw.js';
import { drawCavePainting, paintingCacheKeys, drawControlCard } from '../js/cave-paint.js';
import { createJournal, TABS, CONTROL_ENTRIES, completion, ENTRIES, entryById } from '../js/journal.js';
import { setArtScheme, entryArt, onArtReady, hasArt } from '../js/journal-art.js';

export async function runSignsTests(assert) {
  // --- the scheme a sign reads in
  assert('signs: keyboard and mouse are one desktop scheme on signs; a pad and a phone keep theirs',
    signScheme('keyboard') === 'desktop' && signScheme('mouse') === 'desktop' && signScheme('') === 'desktop' && signScheme('pad') === 'pad' && signScheme('touch') === 'touch');
  assert('glyphs (desktop): F, LMB, RMB, Space first; the second key after it',
    glyph('hand', 'desktop').label === 'F' && glyph('attack', 'desktop').label === 'LMB' && glyph('use', 'desktop').label === 'RMB' && glyph('dash', 'desktop').label === 'Space' &&
    glyphs('attack', 'desktop').map((g) => g.label).join() === 'LMB,J' && glyphs('hand', 'desktop').map((g) => g.label).join() === 'F,MMB' && glyph('attack', 'desktop').kind === 'mouse');
  assert('glyphs (desktop): every play action a pad has, the desktop has too (the pad menu-only tab / menu moves aside)', Object.keys(PAD_MAP).filter((a) => !/^(tab|menu)/.test(a)).every((a) => glyphs(a, 'desktop').length > 0));

  // --- tokens
  assert('rich: {hand} is F on the desktop, A on an Xbox pad, Cross on a DualSense, Grab on a phone',
    plainText('{hand}', 'desktop') === 'F' && plainText('{hand}', 'pad') === 'A' && plainText('{hand}', 'pad', 'ps') === 'Cross' && plainText('{hand}', 'touch') === 'Grab');
  assert('rich: {dash+} lists every glyph (Space/Shift; B/LT); {key:J} is a literal key',
    plainText('{dash+} dashes', 'desktop') === 'Space/Shift dashes' && plainText('{dash+} dashes', 'pad') === 'B/LT dashes' && plainText('({key:J} or {key:K})', 'pad') === '(J or K)');
  assert('rich: the same sentence keeps its words and swaps only the glyphs on a scheme switch',
    plainText('Press {use} to cast.', 'desktop') === 'Press RMB to cast.' && plainText('Press {use} to cast.', 'pad') === 'Press RB to cast.' && glyphLabels('Press {use} to cast.', 'pad').join() === 'RB');
  {
    const seg = richSegments('a {nope} b {hand}.', 'pad');
    assert('rich: an unknown action reads as its word, text around tokens is kept', seg.length === 5 && seg[1].t === 'text' && seg[1].s === 'nope' && seg[3].t === 'glyph' && seg[4].s === '.');
  }
  // --- layout: wraps to the width, a glyph sticks to its punctuation, all words kept
  {
    const measure = (s) => s.length * 7, r = 8;
    const str = 'Swim up to a ware and press {hand} to buy it. Today it is free. In a real shop, carrying off a ware makes the keeper come for you.';
    const L = layoutRich(str, 'desktop', 'xbox', measure, 160, r);
    const words = L.lines.flatMap((l) => l.items.map((it) => (it.t === 'text' ? it.s : it.g.map((g) => g.label).join('/')))).join(' ');
    assert('rich layout: lines never run past the width (one over-long word aside)', L.lines.length > 3 && L.lines.every((l) => l.w <= 160 || l.items.length === 1));
    assert('rich layout: every word and the glyph are laid out, in order', words.replace(/\s+/g, ' ') === plainText(str, 'desktop').replace(/\s+/g, ' '));
    const L2 = layoutRich('press {hand}.', 'desktop', 'xbox', measure, 1000, r);
    const it = L2.lines[0].items;
    assert('rich layout: "{hand}." keeps the full stop right after the glyph', it.length === 3 && it[2].s === '.' && it[2].x - (it[1].x + it[1].w) < 4);
  }
  // --- drawing never throws, in every look
  {
    const c = document.createElement('canvas'); c.width = 200; c.height = 60;
    const g = c.getContext('2d');
    let ok = true;
    try {
      for (const sc of ['desktop', 'pad', 'touch']) for (const a of Object.keys(PAD_MAP)) for (const gl of glyphs(a, sc, 'ps').concat(glyphs(a, sc))) { drawGlyph(g, gl, 30, 30, 12, LOOK_WOOD); drawGlyph(g, gl, 30, 30, 12, LOOK_PAINT); }
      const L = layoutRich('{attack} squirts ink, {dash+} dashes', 'pad', 'xbox', (s) => g.measureText(s).width, 180, 9);
      g.font = '600 12px sans-serif'; g.fillStyle = '#3a2410'; drawRichLayout(g, L, 100, 15, 18, LOOK_WOOD);
    } catch (e) { ok = false; }
    const d = g.getImageData(0, 0, 200, 60).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
    assert('glyphs: every glyph draws burnt into wood and painted in ochre (both pad styles), and a rich line paints', ok && ink > 200);
  }

  // --- signs.js
  {
    const ps = [{ x: 5, y: 5, r: 3, title: 'A' }, { x: 9, y: 5, r: 3, title: 'B' }];
    assert('signs: the nearest prompt whose radius holds the octopus opens; none out of reach; skip leaves one out',
      pickPrompt(ps, 6, 5).title === 'A' && pickPrompt(ps, 8.5, 5).title === 'B' && pickPrompt(ps, 20, 5) === null && pickPrompt(ps, 6, 5, (p) => p.title === 'A') === null);
    const p = { desktop: 'd {hand}', touch: 't' };
    assert('signs: a pad reads the pad text, else the desktop words; a phone the touch text', signText(p, 'pad') === 'd {hand}' && signText({ ...p, pad: 'p' }, 'pad') === 'p' && signText(p, 'touch') === 't' && signText(p, 'desktop') === 'd {hand}');
    // a 10x10 room: rock rim, floor at y = 8
    const solid = (x, y) => x <= 0 || y <= 0 || x >= 9 || y >= 9;
    const placed = placeSigns([{ x: 4.5, y: 4 }, { x: 4.5, y: 2, sign: [2, 8] }], solid);
    assert('signs: a prompt without a place gets a post on the floor under it; a written place is kept', placed[0].sign && placed[0].sign[0] === 4 && placed[0].sign[1] === 8 && placed[1].sign[0] === 2);
    const hung = placeSigns([{ x: 4.5, y: 3 }], (x, y) => y <= 0 || (y >= 5 ? false : x === 99));
    assert('signs: over open water with no floor near, it hangs from the rock above', hung[0].hang && hung[0].hang[1] === 1);
  }
  assert('signs: the controls are swim, aim, ink jet, use slot, hand, dash, hotbar, journal, pause; each has a glyph on the desktop and a pad',
    CONTROL_ROWS.map((r) => r[0]).join() === 'move,aim,attack,use,hand,dash,cycle,inventory,pause' && CONTROL_ROWS.every(([a]) => glyph(a, 'desktop') && glyph(a, 'pad')));

  // --- a scheme switch repaints the boards and the painting
  {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    const cam = { x: 5, y: 5, pxPerUnit: 60 };
    const prompts = [{ title: 'Grab', label: 'Grab', x: 5, y: 5, r: 4, sign: [5, 6], desktop: '{hand} grabs a pot.', touch: 'Tap Grab.' }];
    const n0 = boardCacheSize();
    drawSigns(g, cam, 640, 360, prompts, prompts[0], { scheme: 'desktop', style: 'xbox' }, 0);
    drawSigns(g, cam, 640, 360, prompts, prompts[0], { scheme: 'desktop', style: 'xbox' }, 1);
    const n1 = boardCacheSize();
    const desk = g.getImageData(0, 0, 640, 360).data.slice();
    g.clearRect(0, 0, 640, 360);
    drawSigns(g, cam, 640, 360, prompts, prompts[0], { scheme: 'pad', style: 'xbox' }, 2);
    const n2 = boardCacheSize();
    const pad = g.getImageData(0, 0, 640, 360).data;
    let diff = 0; for (let i = 0; i < pad.length; i += 4) if (Math.abs(pad[i] - desk[i]) > 40) diff++;
    assert('signs: the open board is drawn once per scheme (cached), and a pad switch draws a new one that looks different', n1 === n0 + 1 && n2 === n1 + 1 && diff > 20 && prompts[0]._open === 1);
    let ok = true;
    try { drawAnchorTag(g, cam, 640, 360, 5, 4, '{hand} change your look', { scheme: 'pad', style: 'ps' }, 0); drawSigns(g, cam, 640, 360, [{ title: 'Hung', label: 'Hi', x: 5, y: 5, r: 3, hang: [5, 2], desktop: 'x' }, { title: 'Fixed', x: 5, y: 5, r: 3, anchor: [5, 4], desktop: 'y' }], null, { scheme: 'desktop', style: 'xbox' }, 0); } catch (e) { ok = false; }
    assert('signs: an object prompt, a hung board and an anchored one draw', ok);
    const spec = { rect: [1, 1, 9, 4], cols: 3 };
    drawCavePainting(g, cam, 640, 360, spec, { scheme: 'desktop', style: 'xbox' });
    drawCavePainting(g, cam, 640, 360, spec, { scheme: 'pad', style: 'xbox' });
    const keys = paintingCacheKeys();
    assert('cave painting: painted once per scheme (desktop, then pad on a switch)', keys.some((k) => k.startsWith('desktop|')) && keys.some((k) => k.startsWith('pad|xbox')));
  }

  // --- the journal's Controls tab
  {
    const j = createJournal({ load: () => [], save: () => {} });
    const list = j.tabList('controls');
    assert('journal Controls (Phase 2B): a tab of the nine controls, always open, not part of completion',
      TABS.some((t) => t.id === 'controls') && list.length === 9 && list.every((e) => e.found) && completion(j).total === ENTRIES.length && entryById('control-hand').name === 'Hand' && CONTROL_ENTRIES.every((e) => hasArt(e.id)));
    let calls = 0;
    onArtReady(() => { calls++; });
    setArtScheme('desktop', 'xbox');
    const a1 = entryArt('control-attack', 96, false);
    setArtScheme('pad', 'xbox');
    const a2 = entryArt('control-attack', 96, false);
    setArtScheme('desktop', 'xbox');
    assert('journal Controls: a scheme switch repaints the cards (a new picture, the book told to redraw)', a1 !== a2 && calls >= 2);
    let ok = true;
    try { const c = document.createElement('canvas'); c.width = c.height = 120; const g = c.getContext('2d'); g.translate(60, 60); for (const [a] of CONTROL_ROWS) drawControlCard(g, a, 120, 'pad', 'ps'); } catch (e) { ok = false; }
    assert('journal Controls: every card draws for a DualSense too', ok);
  }

  // --- every authored sign resolves in every scheme (no stray braces, a pad never reads keys)
  {
    const load = async (f) => (await fetch(new URL('../data/' + f, import.meta.url))).json();
    const all = [];
    for (const f of ['tutorial.json', 'hub.json', 'rest.json']) for (const p of (await load(f)).prompts) all.push(p);
    const pads = all.map((p) => plainText(signText(p, 'pad'), 'pad'));
    const desks = all.map((p) => plainText(signText(p, 'desktop'), 'desktop'));
    assert('signs data: every sign resolves in every scheme (no token left as braces)', pads.concat(desks).every((s) => !/[{}]/.test(s)) && all.every((p) => !/[{}]/.test(plainText(p.touch, 'touch'))));
    assert('signs data: a pad player never reads a key or a mouse button on a sign', pads.every((s) => !/\b(F|WASD|LMB|RMB|MMB|Space|Shift|Tab|click|C)\b/.test(s)), pads.find((s) => /\b(F|WASD|LMB|RMB|MMB|Space|Shift|Tab|click|C)\b/.test(s)) || '');
    assert('signs data: every tutorial and hub sign that names a control does it with a glyph token', all.filter((p) => /press|grabs|dashes|squirts|opens your/.test(p.desktop)).every((p) => /\{[a-z]+\+?\}|\{key:/.test(p.desktop)));
  }
}
