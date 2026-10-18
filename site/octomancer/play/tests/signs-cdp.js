// Node script (not part of tests/index.html): controller Phase 2B (octomancer-web/CONTROLLER-PLAN.md "Text in the world, not
// over it") in real Chrome with a fake standard gamepad (navigator.getGamepads stubbed before load, driven by __octo.pad).
//   - the tutorial's first room is a cave painting of the whole scheme: keyboard glyphs first, pad glyphs (LS RS RT RB A B LB
//     View Menu) once the pad is touched, keyboard again on a key press;
//   - each later room's sign opens into a board naming only its own controls, in the active scheme;
//   - no floating box (the old prompt banner, the offer card) shows anywhere in the tutorial or the hub;
//   - the hub's welcome is a board hung over the start; the mirror shell and the whirlpool carry their own prompt;
//   - the journal's Controls tab lists the nine controls and repaints on a scheme switch;
//   - phone (412x915): the painting and the signs in touch words, and in pad glyphs when a pad is used.
// Frames: octomancer-web/night/signs-*.png.
//   node signs-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '64107';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'signs-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (done) => "try{if(!sessionStorage.getItem('sg')){sessionStorage.setItem('sg','1');localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:" + done + ",journal:[]}))}}catch(e){}";
const STUB = "(() => { const f = () => [window.__octoFakePad || null, null, null, null]; f.__octoFake = true; window.__octoFakePad = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const PHONE = { viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' };
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, vp, q, done = false) {
  const page = await browser.newPage();
  if (vp === 'phone') await page.emulate(PHONE); else await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(save(done));
  await page.evaluateOnNewDocument(STUB);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(900);
  await page.evaluate(() => __octo.freeze(true));
  page.errs = errs;
  return page;
}
const G = (p) => p.evaluate(() => __octo.signs());
const at = (p, x, y, n = 24) => p.evaluate((x, y, n) => { for (let i = 0; i < n; i++) { __octo.teleport(x, y); __octo.stepDraw(1); } }, x, y, n);
const padOn = (p) => p.evaluate(() => { __octo.pad({ lx: 0.6 }); __octo.stepDraw(1); __octo.pad({}); __octo.stepDraw(16); });
const keyOn = async (p) => { await p.keyboard.press('KeyQ'); await p.evaluate(() => __octo.stepDraw(16)); };
const shot = async (p, tag) => { await p.evaluate(() => __octo.stepDraw(2)); await p.screenshot({ path: OUT + tag + '.png' }); };
const PAD_ALL = ['LS', 'RS', 'RT', 'RB', 'A', 'B', 'LB', 'View', 'Menu'];
const KEY_ALL = ['WASD', 'Cursor', 'LMB', 'RMB', 'F', 'Space', 'Q', 'Tab', 'Esc'];
const rowGlyphs = (s) => s.painting.rows.flatMap((r) => r.glyphs);
const KEYISH = /\b(F|WASD|LMB|RMB|MMB|Space|Shift|Tab|click)\b/;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000 });
  try {
    // ======================================================== the tutorial, desktop
    const p = await open(browser, 'desktop', '?at=tutorial&seed=7');
    await at(p, 9, 9.5);
    let s = await G(p);
    check('room 1: the cave painting of the whole scheme, in keyboard glyphs', !!s.painting && s.painting.rows.length === 9 && KEY_ALL.every((g) => rowGlyphs(s).includes(g)), rowGlyphs(s).join());
    check('room 1: the swim sign is open and names WASD; no floating box', s.open && s.open.title === 'Swim' && s.open.glyphs.includes('WASD') && !s.popup, JSON.stringify(s.open));
    await shot(p, 'paint-keyboard-1440');
    await padOn(p);
    s = await G(p);
    check('room 1: the pad touched, the painting switches to pad glyphs (LS RS RT RB A B LB View Menu)', s.scheme === 'pad' && PAD_ALL.every((g) => rowGlyphs(s).includes(g)) && !rowGlyphs(s).includes('WASD'), rowGlyphs(s).join());
    check('room 1: and the sign names LS', s.open && s.open.glyphs.join() === 'LS' && !KEYISH.test(s.open.text), JSON.stringify(s.open));
    await shot(p, 'paint-pad-1440');
    await keyOn(p);
    s = await G(p);
    check('room 1: a key press switches the painting and the sign back to keyboard glyphs', s.scheme === 'desktop' && rowGlyphs(s).includes('WASD') && !rowGlyphs(s).includes('LS') && s.open.glyphs.includes('WASD'));

    // each later room: its sign names only its own controls
    const rooms = [
      ['dash', 15.5, 11.4, ['Space', 'Shift'], ['B', 'LT']],
      ['ink', 28, 9, ['LMB', 'J'], ['RT', 'RS']],
      ['grab', 41, 10, ['F', 'MMB'], ['A', 'RS']],
      ['bomb', 61.5, 10, ['B'], ['RB']],
      ['sticky', 58, 30, ['RMB'], ['RS', 'RB']],
      ['cloud', 42, 29, ['Q', 'E', 'Wheel', 'RMB'], ['LB', 'D-pad left / right', 'RB']],
      ['shop', 27, 30, ['F'], ['A']],
      ['exit', 4.5, 30.5, ['F'], ['A']],
    ];
    let popups = 0;
    for (const [tag, x, y, keys, pads] of rooms) {
      await at(p, x, y);
      const k = await G(p);
      await padOn(p);
      const q = await G(p);
      if (k.popup || q.popup) popups++;
      check(`room ${tag}: its sign names only its own controls (keyboard ${keys.join(' ')}, pad ${pads.join(' ')})`,
        k.open && q.open && [...new Set(k.open.glyphs)].join() === keys.join() && [...new Set(q.open.glyphs)].join() === pads.join() && !KEYISH.test(q.open.text), JSON.stringify([k.open && k.open.glyphs, q.open && q.open.glyphs, q.open && q.open.text.slice(0, 80)]));
      if (tag === 'ink') await shot(p, 'room-ink-pad-1440');
      if (tag === 'grab') { await keyOn(p); await shot(p, 'room-grab-keyboard-1440'); }
      await keyOn(p);
    }
    check('tutorial: no floating prompt box in any room', popups === 0);
    // a lit bomb says swim away on the bomb itself
    await at(p, 61.5, 10.5);
    await p.keyboard.press('KeyB'); await p.evaluate(() => __octo.stepDraw(3));
    s = await G(p);
    check('a lit tutorial bomb carries its own prompt (swim away, the dash glyph), no box', s.tags.some((t) => t.id === 'bomb' && /Swim away/.test(t.text) && t.glyphs.includes('Space')) && !s.popup, JSON.stringify(s.tags));
    check('tutorial desktop: no page errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));

    // the journal's Controls tab
    await p.evaluate(() => __octo.openJournal('controls'));
    await sleep(500);
    const jk = await p.evaluate(() => ({ tab: __octo.journal().tab, cards: [...document.querySelectorAll('.octo-bk-card .octo-bk-cardname')].map((e) => e.textContent) }));
    check('journal: a Controls tab with the nine controls', jk.tab === 'controls' && jk.cards.join() === 'Swim,Aim,Ink Jet,Use slot,Hand,Dash,Hotbar,Journal,Pause', JSON.stringify(jk));
    await p.screenshot({ path: OUT + 'journal-keyboard-1440.png' });
    const before = await p.evaluate(() => document.querySelector('.octo-bk-card canvas').toDataURL().length);
    await p.evaluate(() => { __octo.pad({ lx: 0.6 }); __octo.pad({}); });
    await sleep(400);
    const after = await p.evaluate(() => document.querySelector('.octo-bk-card canvas').toDataURL().length);
    check('journal: a pad switch repaints the Controls cards', before !== after, before + ' vs ' + after);
    await p.screenshot({ path: OUT + 'journal-pad-1440.png' });
    await p.close();

    // ======================================================== the hub (a fresh save)
    const h = await open(browser, 'desktop', '?seed=7');
    s = await G(h);
    check('hub: the welcome is a board hung over the start (kelp seals the dive, the tutorial whirlpool, F); no offer card, no banner',
      s.open && s.open.where === 'hang' && /seals the dive/.test(s.open.text) && /whirlpool/.test(s.open.text) && /tutorial/.test(s.open.text) && s.open.glyphs.includes('F') && !s.popup, JSON.stringify(s.open));
    await shot(h, 'hub-keyboard-1440');
    await padOn(h);
    s = await G(h);
    check('hub: with a pad the board names A', s.open && s.open.glyphs.includes('A') && !KEYISH.test(s.open.text));
    await shot(h, 'hub-pad-1440');
    // the tutorial ring: the hand's prompt over the whirlpool, the pad glyph
    const hs = await h.evaluate(() => __octo.hubSeal());
    await at(h, hs.tutorialX + 1.4, hs.tutorialY + 0.2);
    s = await G(h);
    check('hub: by the tutorial ring, no box (the ring carries the hand glyph)', !s.popup);
    await shot(h, 'portal-pad-1440');
    await keyOn(h);
    await at(h, hs.tutorialX + 1.4, hs.tutorialY + 0.2);
    await shot(h, 'portal-keyboard-1440');
    // the mirror shell names its verb on itself
    const mir = await h.evaluate(async () => (await (await fetch('data/hub.json')).json()).mirror || null);
    if (mir) {
      await at(h, mir.x + 1.2, mir.y - 0.7);
      s = await G(h);
      check('hub: the mirror shell carries its prompt (F change your look), no box', s.tags.some((t) => t.id === 'mirror' && t.glyphs.includes('F')) && !s.popup, JSON.stringify(s.tags));
      await padOn(h);
      s = await G(h);
      check('hub: with a pad the mirror says A', s.tags.some((t) => t.id === 'mirror' && t.glyphs.includes('A')));
      await shot(h, 'mirror-pad-1440');
    } else check('hub: the level exposes the mirror', false);
    check('hub: no page errors', h.errs.length === 0, h.errs.slice(0, 3).join(' | '));
    await h.close();

    // ======================================================== phone
    const q = await open(browser, 'phone', '?at=tutorial&seed=7');
    await q.touchscreen.tap(60, 400);
    await q.evaluate(() => __octo.input(null));
    await at(q, 8, 9.5);
    s = await G(q);
    check('phone: the painting and the swim sign in touch words (Drag, the Stick)', s.scheme === 'touch' && /Drag/.test(s.open.text) && rowGlyphs(s).includes('Stick') && !s.popup, JSON.stringify(s.open));
    await shot(q, 'paint-touch-412');
    await padOn(q);
    s = await G(q);
    check('phone + pad: the painting in pad glyphs', s.scheme === 'pad' && PAD_ALL.every((g) => rowGlyphs(s).includes(g)));
    await shot(q, 'paint-pad-412');
    await at(q, 41, 10);
    await shot(q, 'room-grab-pad-412');
    check('phone: no page errors', q.errs.length === 0, q.errs.slice(0, 3).join(' | '));
    await q.close();
    const qh = await open(browser, 'phone', '?seed=7');
    s = await G(qh);
    check('phone hub: the welcome board, no box', s.open && s.open.where === 'hang' && !s.popup);
    await shot(qh, 'hub-412');
    const hs2 = await qh.evaluate(() => __octo.hubSeal());
    await padOn(qh);
    await at(qh, hs2.tutorialX + 1.4, hs2.tutorialY + 0.2);
    await shot(qh, 'portal-pad-412');
    await qh.close();

    // ======================================================== night batch 1: the open board keeps clear of what it explains
    // In the real game (camera, HUD, the post pass and the board pass): the dash, shop and dive signs of the tutorial and the
    // altar's, with the octopus where the review saw it covered (IMPROVEMENTS.md #1). Frames night/signs-board-*.png.
    const boardCheck = (page, which) => page.evaluate(async (which) => {
      const D = await import('/octomancer/play/js/signs-draw.js'), S = await import('/octomancer/play/js/signs.js'), A = await import('/octomancer/play/js/authored.js');
      const o = __octo.state().octopus, a = __octo.altar();
      const targets = which === 'altar' ? [{ x0: a.x - 1.5, y0: a.y - 1.86, x1: a.x + 1.5, y1: a.y }]
        : S.levelSignTargets(A.parseAuthoredMap(await (await fetch('/octomancer/play/data/tutorial.json')).json())).filter((t) => !t.soft);
      const rs = D.boardRects();
      return { ok: rs.length === 1 && rs.every((r) => !targets.some((t) => S.rectsHit(r, t)) && !S.rectHitsDisc(r, o.x, o.y, S.OCTO_CLEAR)), rs: JSON.stringify(rs) };
    }, which);
    // Daniel 2026-10-18: the hub's welcome board hangs on ropes from the rock, a fixture: it never slides or clamps into view.
    for (const vp of ['desktop', 'phone']) {
      const tag = vp === 'phone' ? '412' : '1440';
      const hb = await open(browser, vp, '?seed=7');
      const rect = () => hb.evaluate(async () => { const D = await import('/octomancer/play/js/signs-draw.js'); const r = D.boardRects()[0]; return r ? [r.title, r.x0, r.y0, r.x1, r.y1] : null; });
      const start = await hb.evaluate(() => { const o = __octo.state().octopus; return [o.x, o.y]; });
      await at(hb, start[0], start[1], 20);
      const r0 = await rect();
      await shot(hb, 'board-hub-start-' + tag);
      const drift = [];
      for (let i = 1; i <= 6; i++) { // swim down and right, still inside the sign's reach (9 tiles)
        await at(hb, start[0] + i * 0.9, start[1] + i * 1.0, 12);
        drift.push(await rect());
      }
      await shot(hb, 'board-hub-away-' + tag);
      const same = !!r0 && drift.every((r) => !r || (r[0] === r0[0] && Math.abs(r[1] - r0[1]) < 1e-6 && Math.abs(r[2] - r0[2]) < 1e-6 && Math.abs(r[3] - r0[3]) < 1e-6));
      check(tag + ' hub: the hung welcome board stays at its anchor while the octopus swims away', same && drift.some((r) => r), JSON.stringify({ r0, drift }));
      check(tag + ' hub board: no page errors', hb.errs.length === 0, hb.errs.slice(0, 3).join(' | '));
      await hb.close();
    }
    for (const vp of ['desktop', 'phone']) {
      const tag = vp === 'phone' ? '412' : '1440';
      const b = await open(browser, vp, '?at=tutorial&seed=7');
      for (const [name, x, y] of [['dash', 15.6, 11.5], ['shop', 26, 28.2], ['dive', 4.6, 29.2]]) {
        await at(b, x, y, 40);
        const r = await boardCheck(b, name);
        check(tag + ' ' + name + ': the open board is drawn and hides neither its target nor the octopus', r.ok, r.rs);
        await shot(b, 'board-' + name + '-' + tag);
      }
      check(tag + ' boards: no page errors', b.errs.length === 0, b.errs.slice(0, 3).join(' | '));
      await b.close();
      const al = await open(browser, vp, '?at=1&seed=5&altar=1', true);
      const a = await al.evaluate(() => __octo.altar());
      if (a && a.sign) {
        await al.evaluate((a) => { __octo.god(true); for (let i = 0; i < 40; i++) { __octo.teleport(a.x - 0.77, a.y - 2.7); __octo.stepDraw(1); } }, a);
        const r = await boardCheck(al, 'altar');
        check(tag + ' altar: the board is off the stone and the octopus', r.ok, r.rs);
        await shot(al, 'board-altar-' + tag);
      } else check(tag + ' altar: a first-meeting altar with a sign on ?altar=1', false, JSON.stringify(a));
      check(tag + ' altar: no page errors', al.errs.length === 0, al.errs.slice(0, 3).join(' | '));
      await al.close();
    }
  } catch (e) {
    fails.push('exception'); console.log('FAIL exception', e && e.stack ? e.stack.slice(0, 800) : e);
  } finally {
    await browser.close();
  }
  console.log(fails.length ? 'FAIL ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
