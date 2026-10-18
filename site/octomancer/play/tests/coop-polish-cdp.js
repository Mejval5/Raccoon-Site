// Node script (not part of tests/index.html): the co-op and controller polish pass (OWNERS.md 2026-10-17, "Co-op polish") in
// real Chrome, with fake standard pads (navigator.getGamepads stubbed; __octo.pads([...]) drives them) and the keyboard:
//   1. the bottom-left controls line shows the scheme of the player who last pressed something, with that player's colour dot
//      (solo: no dot); the line retires per scheme (two levels cleared on the keyboard retire the keyboard line only; the pad's
//      line still shows when a pad is picked up), kept in the save;
//   2. the prompts on objects (the hand's key over a whirlpool, a sign's board, the mirror's tag) name the controls of the
//      player nearest that object;
//   3. the pause menu's join is explicit: A on a pad is a menu press unless the Add line has the focus; a free pad's Start
//      joins; Enter joins the keyboard only on the focused Add line (the arrow keys walk the menu);
//   4. the journal's Carried "How" line names the pad's buttons for a pad player (no "Right click or C");
//   5. the Controls bookmark has its own colour;
//   6. back rooms in co-op: the curtain takes the party only when every live player is within 6 tiles; else its prompt says
//      "Gather the party"; a dead player is never waited for.
// Frames: octomancer-web/night/cpolish-*.png (1440x900).
//   node coop-polish-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '64410';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'cpolish-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJs = (o) => "try{localStorage.setItem('octomancer.best.v1'," + JSON.stringify(JSON.stringify({ v: 1, best: 0, runs: 1, muted: true, tutorialDone: true, journal: [], ...o })) + ")}catch(e){}";
const STUB = "(() => { const f = () => (window.__octoFakePads || [null, null, null, null]); f.__octoFake = true; window.__octoFakePads = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, q, save = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(saveJs(save));
  await page.evaluateOnNewDocument(STUB);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 30000 });
  await sleep(800);
  page.errs = errs;
  return page;
}
const PADS = (p, list, polls = 1) => p.evaluate((l, n) => __octo.pads(l, n), list, polls);
const C = (p) => p.evaluate(() => __octo.coop());
const G = (p) => p.evaluate(() => __octo.signs());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
const waitLevel = (p) => p.waitForFunction(() => !__octo.transitioning(), { timeout: 30000, polling: 100 });
/** A tap of pad buttons (states by pad index): neutral, down for a poll, then up. */
async function tapPads(p, list) { await PADS(p, list.map(() => ({}))); await PADS(p, list); await PADS(p, list.map(() => ({}))); }
const paused = (p) => p.evaluate(() => __octo.state().paused);
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });
const line = (p) => p.evaluate(() => __octo.coop().line);
const RED = '#c05060', TEAL = '#4fa39b';

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 });
  try {
    // ================================================================ 3. the pause menu's join (hub; player 1 on the keyboard)
    const h = await open(browser, '?seed=7', { helpDone: false });
    await h.evaluate(() => __octo.god(true));
    await PADS(h, [{}, {}]);
    await h.keyboard.press('KeyD'); await step(h, 2);
    let L = await line(h);
    check('1 solo: the keyboard line, no dot', L.scheme === 'keyboard' && L.dot === '' && L.shown, JSON.stringify(L).slice(0, 160));
    await h.keyboard.press('Escape'); await sleep(100);
    check('3 Esc pauses', await paused(h));
    let c = await C(h);
    check('3 the Add line is a button that names Start on a free pad and A / Enter on it', /^Add player/.test(c.add) && /Menu on a free pad, or A \/ Enter here/.test(c.add), c.add);
    // pad A presses A: the menu's focus starts on the first pause button (Resume since 2026-10-18; down once: Journal in the hub), not on the Add line
    check('3 the pause menu focus starts on Resume, not on the Add line', (await C(h)).focus === 'Resume' || !(await C(h)).addFocused, (await C(h)).focus);
    await tapPads(h, [{ down: true }, {}]);
    await tapPads(h, [{ a: true }, {}]); await sleep(150);
    c = await C(h);
    const jOpen = await h.evaluate(() => __octo.journal().open);
    check('3 a pad\'s A in the pause menu (player 1 on the keyboard) presses the focused button (the journal opens), nobody joins', c.players.length === 1 && jOpen, JSON.stringify({ n: c.players.length, jOpen, focus: c.focus }));
    await tapPads(h, [{ b: true }, {}]); await sleep(150);
    check('3 B closes the journal back to the pause menu', !(await h.evaluate(() => __octo.journal().open)) && await paused(h));
    // up to the Add line, A: pad A joins as player 2 (player 1 stays on the keyboard)
    for (let i = 0; i < 4 && !(await C(h)).addFocused; i++) await tapPads(h, [{ up: true }, {}]);
    c = await C(h);
    check('3 the d-pad walks up to the Add line (the ring on it)', c.addFocused && await h.evaluate(() => !!document.querySelector('.octo-coop-add.octo-pad-focus')), c.focus);
    await shot(h, 'pause-add-focused');
    await tapPads(h, [{ a: true }, {}]);
    c = await C(h);
    check('3 A on the focused Add line joins pad A as player 2; player 1 is bound to the keyboard', c.players.length === 2 && c.players[0].device === 'keyboard' && /#0$/.test(c.players[1].device), JSON.stringify(c.players.map((p) => [p.slot, p.device])));
    check('1 the joiner\'s press: the line is player 2\'s pad line with the teal dot', c.line.scheme === 'pad' && c.line.dot === TEAL, JSON.stringify(c.line).slice(0, 120));
    // pad B (free) walks down off the Add line and presses A: a menu press (the journal), no join
    await tapPads(h, [{}, { down: true }]);
    c = await C(h);
    check('3 a free pad walks the pause menu too (down: off the Add line)', !c.addFocused, c.focus);
    await tapPads(h, [{}, { down: true }]); // Resume -> Journal
    await tapPads(h, [{}, { a: true }]); await sleep(150);
    c = await C(h);
    check('3 a free pad\'s A off the Add line is a menu press (the journal opens), it does not join', c.players.length === 2 && await h.evaluate(() => __octo.journal().open), String(c.players.length));
    await tapPads(h, [{}, { b: true }]); await sleep(150);
    await tapPads(h, [{}, { start: true }]);
    c = await C(h);
    check('3 a free pad\'s Start joins it (player 3)', c.players.length === 3 && /#1$/.test(c.players[2].device), JSON.stringify(c.players.map((p) => [p.slot, p.device])));
    // resume and play: whoever pressed last owns the controls line
    await h.keyboard.press('Escape'); await sleep(100);
    check('3 Esc resumes', !(await paused(h)));
    await h.keyboard.press('KeyD'); await step(h, 2);
    L = await line(h);
    check('1 co-op: a key press shows the keyboard line with player 1\'s red dot', L.scheme === 'keyboard' && L.dot === RED && L.shown, JSON.stringify(L).slice(0, 120));
    await shot(h, 'line-keyboard-dot');
    await tapPads(h, [{ rb: true }, {}]); await step(h, 2);
    L = await line(h);
    check('1 co-op: a press on player 2\'s pad shows the pad line with the teal dot', L.scheme === 'pad' && L.dot === TEAL && L.glyphs.includes('A') && L.shown, JSON.stringify(L).slice(0, 160));
    await shot(h, 'line-pad-dot');
    const dot = await h.evaluate(() => { const d = document.querySelector('.octo-controls-help .octo-ch-dot'); return d ? getComputedStyle(d).backgroundColor : ''; });
    check('1 the dot is drawn in front of the line, in the player\'s colour', dot === 'rgb(79, 163, 155)', dot);

    // ================================================================ 2. prompts on objects follow the nearest player (same hub)
    const far = await h.evaluate(() => {
      const s = __octo.signs(), list = s.list;
      const lv = __octo.level();
      for (let dx = 4; dx < 60; dx += 2) for (const sx of [1, -1]) {
        const x = lv.startX + dx * sx, y = lv.startY;
        if (!list.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 2)) return { x, y };
      }
      return null;
    });
    const board = await h.evaluate(() => __octo.signs().list.find((p) => p.where === 'hang' || p.where === 'sign'));
    if (far && board) {
      await h.evaluate((b, f) => { __octo.teleportPlayer(1, b.x, b.y); __octo.teleportPlayer(0, f.x, f.y); __octo.teleportPlayer(2, f.x + 0.5, f.y); }, board, far);
      await step(h, 3);
      let s = await G(h);
      check('2 a sign\'s board names the controls of the player nearest it (player 2, a pad: A)', s.openView && s.openView.scheme === 'pad' && s.openView.glyphs.includes('A') && !s.openView.glyphs.includes('F'), JSON.stringify(s.openView || {}).slice(0, 200));
      await h.evaluate((b, f) => { __octo.teleportPlayer(0, b.x, b.y); __octo.teleportPlayer(1, f.x, f.y); }, board, far);
      await step(h, 3);
      s = await G(h);
      check('2 ... and the keyboard\'s when player 1 is the one beside it (F)', s.openView && s.openView.scheme === 'desktop' && s.openView.glyphs.includes('F'), JSON.stringify(s.openView || {}).slice(0, 200));
    } else check('2 the hub has a board and a spot away from every sign', false, JSON.stringify({ far, board }));
    const mir = await h.evaluate(async () => (await (await fetch('data/hub.json')).json()).mirror || null);
    if (mir && far) {
      await h.evaluate((m, f) => { __octo.teleportPlayer(1, m.x + 1.2, m.y - 0.7); __octo.teleportPlayer(0, f.x, f.y); }, mir, far);
      await step(h, 3);
      let s = await G(h);
      const tag = s.tags.find((t) => t.id === 'mirror');
      check('2 the mirror\'s tag names the pad player\'s button (A) when they are beside it', tag && tag.scheme === 'pad' && tag.glyphs.includes('A'), JSON.stringify(s.tags));
      await h.evaluate((m, f) => { __octo.teleportPlayer(0, m.x + 1.2, m.y - 0.7); __octo.teleportPlayer(1, f.x, f.y); }, mir, far);
      await step(h, 3);
      s = await G(h);
      const tag2 = s.tags.find((t) => t.id === 'mirror');
      check('2 ... and F when the keyboard player is', tag2 && tag2.scheme === 'desktop' && tag2.glyphs.includes('F'), JSON.stringify(s.tags));
    }
    const hs = await h.evaluate(() => __octo.hubSeal());
    if (hs && far) {
      await h.evaluate((r, f) => { __octo.teleportPlayer(1, r.tutorialX + 1.4, r.tutorialY + 0.2); __octo.teleportPlayer(0, f.x, f.y); }, hs, far);
      await step(h, 4);
      let s = await G(h);
      const hint = s.hints.find((x) => x.slot === 1 && x.kind === 'portal');
      check('2 the hand\'s key over the whirlpool is the pad player\'s glyph (A)', hint && hint.scheme === 'pad' && hint.label === 'A', JSON.stringify(s.hints));
      await shot(h, 'portal-pad-player');
      await h.evaluate((r, f) => { __octo.teleportPlayer(0, r.tutorialX + 1.4, r.tutorialY + 0.2); __octo.teleportPlayer(1, f.x, f.y); }, hs, far);
      await step(h, 4);
      s = await G(h);
      const hint0 = s.hints.find((x) => x.slot === 0 && x.kind === 'portal');
      check('2 ... and F for the keyboard player', hint0 && hint0.scheme === 'desktop' && hint0.label === 'F', JSON.stringify(s.hints));
    }

    // ================================================================ 4 + 5. the journal: Carried on a pad, the Controls bookmark
    await tapPads(h, [{ back: true }, {}]); await sleep(300);
    const jc = await h.evaluate(() => {
      const j = __octo.journal();
      const keys = [...document.querySelectorAll('.octo-bk-ccard')].map((e) => e.dataset.id);
      const slot = keys.find((k) => /^slot:/.test(k));
      if (slot) __octo.journalSelect(slot);
      const e = document.querySelector('.octo-bk-entry.octo-bk-carried');
      return { open: j.open, tab: j.tab, slot, text: e ? e.textContent : '' };
    });
    check('4 View on player 2\'s pad opens the Carried page', jc.open && jc.tab === 'carried', JSON.stringify(jc).slice(0, 120));
    check('4 the Carried "How" line names the pad\'s buttons (RB), not "Right click or C"', /RB/.test(jc.text) && !/Right click|right click/.test(jc.text), jc.text.slice(0, 260));
    await sleep(200);
    await shot(h, 'carried-pad');
    const tabs = await h.evaluate(() => [...document.querySelectorAll('.octo-bk-tab')].map((b) => ({ id: b.dataset.tab, c: b.style.getPropertyValue('--tab').trim() })));
    const ct = tabs.find((t) => t.id === 'controls');
    check('5 the Controls bookmark has its own colour (not the default grey), unlike every other bookmark', ct && ct.c && ct.c !== '#ddd' && tabs.filter((t) => t.c === ct.c).length === 1, JSON.stringify(tabs));
    await h.keyboard.press('KeyF'); await step(h, 1); // the keyboard player presses: the page names the keys again
    await sleep(150);
    const jk = await h.evaluate(() => { const e = document.querySelector('.octo-bk-entry.octo-bk-carried'); return e ? e.textContent : ''; });
    check('4 a key press while the book is open: the line names the keyboard\'s keys (Right click or C)', /Right click or C/.test(jk), jk.slice(0, 200));
    check('no page errors (hub)', h.errs.length === 0, h.errs.slice(0, 3).join(' | '));
    await h.close();

    // ================================================================ 3b. solo on a pad: Enter only on the focused Add line
    const k = await open(browser, '?seed=7', { helpDone: true });
    await PADS(k, [{}]);
    await PADS(k, [{ lx: 0.8 }], 3); await PADS(k, [{}]); await step(k, 2);
    await tapPads(k, [{ start: true }]);
    check('3b Start on player 1\'s own pad pauses', await paused(k));
    await k.keyboard.press('Enter'); await sleep(100);
    c = await C(k);
    check('3b Enter in the pause menu off the Add line does not join the keyboard', c.players.length === 1, String(c.players.length));
    for (let i = 0; i < 4 && !(await C(k)).addFocused; i++) await k.keyboard.press('ArrowUp');
    c = await C(k);
    check('3b the arrow keys walk the pause menu to the Add line', c.addFocused, c.focus);
    await k.keyboard.press('Enter'); await sleep(100);
    c = await C(k);
    check('3b Enter on the focused Add line joins the keyboard as player 2 (player 1 stays on the pad)', c.players.length === 2 && c.players[1].device === 'keyboard' && /#0$/.test(c.players[0].device), JSON.stringify(c.players.map((p) => [p.slot, p.device])));
    await tapPads(k, [{ start: true }]);
    check('3b Start on a pad that plays resumes', !(await paused(k)));
    // solo: Start on a pad player 1 is not on joins it (player 1 paused from the keyboard)
    check('no page errors (solo pad)', k.errs.length === 0, k.errs.slice(0, 3).join(' | '));
    await k.close();
    const s3 = await open(browser, '?seed=7', { helpDone: true });
    await PADS(s3, [{}]);
    await s3.keyboard.press('KeyD'); await step(s3, 2);
    await s3.keyboard.press('Escape'); await sleep(100);
    await tapPads(s3, [{ start: true }]);
    c = await C(s3);
    check('3c solo, paused from the keyboard: Start on a pad joins it as player 2 (the menu stays)', c.players.length === 2 && /#0$/.test(c.players[1].device) && c.players[0].device === 'keyboard' && await paused(s3), JSON.stringify(c.players.map((p) => [p.slot, p.device])));
    await s3.close();

    // ================================================================ 1b. the controls line retires per scheme, in the save
    const r = await open(browser, '?at=1&seed=5', { helpDone: false });
    await r.evaluate(() => { __octo.god(true); });
    await PADS(r, [{}]);
    await r.keyboard.press('KeyD'); await step(r, 3);
    L = await line(r);
    check('1b a fresh save shows the keyboard line', L.scheme === 'keyboard' && L.shown && L.dot === '');
    for (let i = 0; i < 2; i++) { await r.evaluate(() => __octo.runEvent('exit')); await waitLevel(r); await r.keyboard.press('KeyD'); await step(r, 3); }
    L = await line(r);
    const sv = await r.evaluate(() => JSON.parse(localStorage.getItem('octomancer.best.v1')));
    check('1b two levels cleared on the keyboard retire the keyboard line (saved)', !L.shown && L.retired.keyboard && !L.retired.pad && sv.helpDone === true && !sv.helpPadDone && sv.helpLevels.keyboard >= 2 && !sv.helpLevels.pad, JSON.stringify({ L: { shown: L.shown, retired: L.retired }, help: [sv.helpDone, sv.helpPadDone, sv.helpLevels] }));
    await PADS(r, [{ lx: 0.8 }], 3); await PADS(r, [{}]); await step(r, 2);
    L = await line(r);
    check('1b a pad picked up later still gets its own line', L.scheme === 'pad' && L.shown, JSON.stringify(L).slice(0, 120));
    await r.close();
    const r2 = await open(browser, '?at=1&seed=5', { helpDone: true, helpPadDone: true });
    await PADS(r2, [{}]);
    await PADS(r2, [{ lx: 0.8 }], 3); await PADS(r2, [{}]); await step(r2, 2);
    L = await line(r2);
    check('1b a save with both lines retired shows neither', L.scheme === 'pad' && !L.shown);
    await r2.close();

    // ================================================================ IMPROVEMENTS.md 6: the controls line is one line at 1440 and 1024
    for (const [w, ht] of [[1440, 900], [1024, 768]]) {
      const q = await open(browser, '?at=1&seed=5', { helpDone: false });
      await q.setViewport({ width: w, height: ht });
      await PADS(q, [{}]);
      await q.keyboard.press('KeyD'); await step(q, 2); await sleep(100);
      const kh = await q.evaluate(() => { const e = document.querySelector('.octo-controls-help'); const r = e.getBoundingClientRect(); return { h: r.height, w: r.width, t: e.textContent.length }; });
      check(`6i ${w}x${ht}: the keyboard line is one line (under 110 characters)`, kh.h < 26 && kh.t <= 110, JSON.stringify(kh));
      await PADS(q, [{ lx: 0.8 }], 3); await PADS(q, [{}]); await step(q, 2); await sleep(100);
      const ph = await q.evaluate(() => { const e = document.querySelector('.octo-controls-help'); const r = e.getBoundingClientRect(); return { h: r.height, w: r.width, scheme: e.dataset.scheme }; });
      check(`6i ${w}x${ht}: the pad line is one line`, ph.scheme === 'pad' && ph.h < 32, JSON.stringify(ph));
      if (w === 1440) await shot(q, 'line-short-pad');
      await q.close();
    }

    // ================================================================ 6. back rooms: gather the party
    const finder = await open(browser, '?at=1&seed=1');
    const seed = await finder.evaluate(async () => {
      const Lv = await import('./js/level.js'), S = await import('./js/level-spawns.js'), K = await import('./js/backroom.js');
      for (let s = 2; s < 300; s++) { const lv = Lv.generateLevel(s, 0); if (K.addBackRoom(lv, S.buildLevelSpawns(lv, s, 0).spawns, s, 0)) return s; }
      return 0;
    });
    await finder.close();
    const b = await open(browser, '?offer=0&at=1&seed=' + seed, { helpDone: true });
    await b.evaluate(() => { __octo.god(true); });
    await PADS(b, [{}, {}]);
    await b.keyboard.press('Escape'); await sleep(100);
    await tapPads(b, [{}, { start: true }]);
    await b.keyboard.press('Escape'); await sleep(100);
    await b.evaluate(() => __octo.freeze(true));
    const joined = (await C(b)).players.length;
    check('6 two players on a level with a grotto', joined === 2, String(joined));
    let br = await b.evaluate(() => __octo.backroom());
    const cur = await b.evaluate(() => __octo.toCurtain(false));
    // player 2 far from the curtain (more than 6 tiles, open water, near enough that the shared camera frames both)
    const farPt = await b.evaluate((c) => {
      const l = __octo.level(), open = (x, y) => x >= 0 && y >= 0 && x < l.w && y < l.h && l.tiles[y * l.w + x] === 0;
      let best = null;
      for (let ty = 0; ty < l.h; ty++) for (let tx = 0; tx < l.w; tx++) {
        const d = Math.hypot(tx + 0.5 - c.x, ty + 0.5 - c.y);
        if (d < 7.5 || d > 10 || !open(tx, ty) || !open(tx + 1, ty) || !open(tx - 1, ty) || !open(tx, ty - 1) || !open(tx, ty + 1)) continue;
        if (!best || Math.abs(ty + 0.5 - c.y) < Math.abs(best.y - c.y)) best = { x: tx + 0.5, y: ty + 0.5 };
      }
      return best || { x: c.x + 9, y: c.y };
    }, cur);
    await b.evaluate((f) => __octo.teleportPlayer(1, f.x, f.y), farPt);
    await step(b, 4);
    br = await b.evaluate(() => __octo.backroom());
    let s = await G(b);
    const gh = s.hints.find((x) => x.slot === 0 && x.kind === 'backdoor');
    check('6 a player far from the curtain: the party is apart, the curtain\'s prompt says "Gather the party"', br.apart && br.target === 'backdoor' && gh && gh.label === 'Gather the party', JSON.stringify({ apart: br.apart, target: br.target, hints: s.hints }));
    await step(b, 120); // the shared camera eases in (frozen: steps only)
    await shot(b, 'gather');
    await b.evaluate(() => { __octo.pressHand(); __octo.stepDraw(1); });
    br = await b.evaluate(() => __octo.backroom());
    check('6 ... and the hand at the curtain does not go through', !br.inside, JSON.stringify({ inside: br.inside }));
    check('6 no popup box for it', !s.popup);
    // player 2 within 6 tiles: through together
    await b.evaluate((cp) => __octo.teleportPlayer(1, cp.x + 3.5, cp.y), cur);
    await b.evaluate(() => __octo.toCurtain(false));
    await step(b, 4);
    br = await b.evaluate(() => __octo.backroom());
    s = await G(b);
    const gh2 = s.hints.find((x) => x.slot === 0 && x.kind === 'backdoor');
    check('6 the party gathered (within 6 tiles): the prompt is the hand key again', !br.apart && gh2 && gh2.label === 'F', JSON.stringify(s.hints));
    await b.evaluate(() => { __octo.pressHand(); __octo.stepDraw(1); });
    br = await b.evaluate(() => __octo.backroom());
    c = await C(b);
    const inb = (x, y) => x >= br.box.x0 && x < br.box.x1 && y >= br.box.y0 && y < br.box.y1;
    check('6 ... and the hand takes the whole party into the grotto', br.inside && c.players.every((p) => inb(p.x, p.y)), JSON.stringify(c.players.map((p) => [p.x.toFixed(1), p.y.toFixed(1)])));
    // out again with player 2 dead far away: a dead player is never waited for
    await b.evaluate(() => __octo.toCurtain(true));
    await b.evaluate((f) => { __octo.teleportPlayer(1, f.x, f.y); __octo.killPlayer(1); }, { x: br.box.x0 + 1.5, y: br.box.y0 + 1.5 });
    await b.evaluate(() => __octo.toCurtain(true));
    await step(b, 4);
    br = await b.evaluate(() => __octo.backroom());
    check('6 a dead player far away does not hold the party back', !br.apart && br.target === 'backdoor', JSON.stringify({ apart: br.apart, target: br.target }));
    await b.evaluate(() => { __octo.pressHand(); __octo.stepDraw(1); });
    br = await b.evaluate(() => __octo.backroom());
    check('6 ... the curtain takes the living back out', !br.inside);
    check('no page errors (back room)', b.errs.length === 0, b.errs.slice(0, 3).join(' | '));
    await b.close();
  } catch (e) {
    console.error(e);
    fails.push('exception: ' + String(e).slice(0, 200));
  } finally {
    await browser.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
