// Node script (not part of tests/index.html): controller Phase 2A (octomancer-web/CONTROLLER-PLAN.md), every screen on a pad.
// Real Chrome against a running copy of the game, navigator.getGamepads stubbed before load and driven by __octo.pad(state).
// Walks, without the mouse: the journal (View opens it on the Carried page; LB / RB chapters, the d-pad over the grid and
// across pages, A picks a hotbar slot and A again swaps it, B cancels a pick, Y holds a slot, X opens its journal page and B
// comes back, B closes), settings from the pause menu (every switch and button reachable, A flips a switch, the reset
// confirm backs out on B, the Controller block draws pad glyphs, Journal and Looks open from it and B comes back to it), the
// hub's mirror (A opens it, the d-pad browses, A wears, B closes), talking to Marlo on A, buying a ware on A, and B on the
// death and clear screens never throwing. The focus ring is .octo-pad-focus everywhere. Frames: octomancer-web/night/padui-*.png.
//   node pad-ui-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '64011';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'padui-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIVE = { v: 1, best: 0, runs: 0, muted: true, tutorialDone: true, journal: [] };
const FULL = { v: 1, best: 9, runs: 12, muted: true, helpDone: true, tutorialDone: true, shortcut: true, journal: ['place-hub'], meta: { dives: 12, clears: 4 },
  story: { marlo: 3, saidMarlo: 3, pip: 2, saidPip: 2, quill: 2, saidQuill: 2, relics: 3, relicsGiven: 3, host: 1, saidHost: 1, mamaPip: 1, explorePip: 1 } };
const STUB = "(() => { const f = () => [window.__octoFakePad || null, null, null, null]; f.__octoFake = true; window.__octoFakePad = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, q, save = DIVE, ready = () => window.__octo && !__octo.level().transitioning) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument("try{localStorage.setItem('octomancer.best.v1'," + JSON.stringify(JSON.stringify(save)) + ")}catch(e){}");
  await page.evaluateOnNewDocument(STUB);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(ready, { timeout: 60000 });
  await sleep(1000);
  page.errs = errs;
  return page;
}
const P = (p, st, polls = 1) => p.evaluate((st, n) => __octo.pad(st, n), st, polls);
const S = (p) => p.evaluate(() => __octo.padState());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
/** A tap of one pad button: down for a poll (and n steps), then up. */
async function tap(p, st, n = 0) { await P(p, st); if (n) await step(p, n); await P(p, {}); await step(p, 1); }
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });
/** The ring: one element wears .octo-pad-focus; what it is. */
const ring = (p) => p.evaluate(() => {
  const r = [...document.querySelectorAll('.octo-pad-focus')];
  const e = r[0];
  return { n: r.length, cls: e ? e.className : '', id: e ? e.dataset.id || e.dataset.tab || e.dataset.skin || e.dataset.setting || '' : '', text: e ? e.textContent.trim().slice(0, 40) : '', col: e ? (getComputedStyle(e).outlineStyle !== 'none' ? getComputedStyle(e).outlineColor : '') + ' ' + getComputedStyle(e).boxShadow : '' };
});
const JP = (p) => p.evaluate(() => ({ ...__octo.journalPage(), open: __octo.journal().open, entry: __octo.journal().entry }));
const HB = (p) => p.evaluate(() => __octo.juice().hotbar);

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // ======================================================== the journal / inventory, in a dive
    {
      const page = await open(browser, '?at=1&seed=5');
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      await P(page, {}); await P(page, { lx: 1 }); await P(page, {}); await step(page, 2); // the pad takes over
      // a second spell slot so there is something to reorder
      await page.evaluate(() => { if (__octo.giveSpell) __octo.giveSpell('bubble'); });
      let hb = await HB(page);
      await tap(page, { back: true });
      await P(page, {}, 3);
      let j = await JP(page);
      let r = await ring(page);
      check('View opens the journal on the Carried page', j.open && j.tab === 'carried', JSON.stringify(j));
      check('the ring is on the highlighted Carried card (#d2fbe6)', r.n === 1 && /octo-bk-ccard/.test(r.cls) && r.id === j.entry && /210, 251, 230/.test(r.col), JSON.stringify(r));
      const legend = await page.evaluate(() => { const h = document.querySelector('.octo-bk-padhint'); return { shown: !!h && getComputedStyle(h).display !== 'none', glyphs: h ? [...h.querySelectorAll('canvas.octo-glyph')].map((c) => c.dataset.glyph) : [], text: h ? h.textContent : '' }; });
      check('the book\'s foot shows the pad legend with glyphs (LB RB A B), not the mouse arrows', legend.shown && ['LB', 'RB', 'A', 'B'].every((g) => legend.glyphs.includes(g)) && await page.evaluate(() => getComputedStyle(document.querySelector('.octo-bk-turn')).display === 'none'), JSON.stringify(legend));
      // move over the cards
      const e0 = j.entry;
      await tap(page, { right: true });
      j = await JP(page); r = await ring(page);
      check('d-pad right moves the highlight and the ring to the next card; the right page follows', j.entry !== e0 && r.id === j.entry && await page.evaluate((id) => document.querySelector('.octo-bk-right .octo-bk-entry').dataset.id === id, j.entry), `${e0} -> ${j.entry}`);
      await tap(page, { left: true });
      j = await JP(page);
      check('d-pad left moves it back', j.entry === e0, j.entry);
      // reorder: the slot cards
      const slots = await page.evaluate(() => [...document.querySelectorAll('.octo-bk-ccard[data-slot]')].map((b) => b.dataset.id));
      if (slots.length >= 2) {
        const order0 = hb.slots ? JSON.stringify(hb.slots) : JSON.stringify(hb);
        // walk to slot 0
        for (let i = 0; i < 12 && (await JP(page)).entry !== slots[0]; i++) await tap(page, { left: true });
        await tap(page, { a: true });
        j = await JP(page);
        check('A on a hotbar card picks the slot up (the book says what to swap it with)', j.pick === 0 && await page.evaluate(() => /Swap slot 1/.test(document.querySelector('.octo-bk-left .octo-bk-count').textContent)), JSON.stringify(j));
        await tap(page, { b: true });
        j = await JP(page);
        check('B cancels the pick (the book stays open)', j.pick === -1 && j.open);
        await tap(page, { a: true });
        await tap(page, { right: true });
        await sleep(300);
        await shot(page, 'inventory-reorder');
        await tap(page, { a: true });
        j = await JP(page);
        const hb2 = await HB(page);
        check('A on another slot swaps the two (the hotbar order changes)', j.pick === -1 && JSON.stringify(hb2.slots || hb2) !== order0, `${order0} -> ${JSON.stringify(hb2.slots || hb2)}`);
        // Y holds the highlighted slot
        const cur = await JP(page);
        const sl = await page.evaluate((id) => Number(document.querySelector('.octo-bk-ccard[data-id="' + id + '"]').dataset.slot), cur.entry);
        await tap(page, { y: true });
        check('Y holds the highlighted slot', (await HB(page)).sel === sl, `${(await HB(page)).sel} vs ${sl}`);
        // swap back
        await tap(page, { a: true }); await tap(page, { left: true }); await tap(page, { a: true });
        check('A, left, A swaps them back', JSON.stringify((await HB(page)).slots || (await HB(page))) === order0);
      } else check('the Carried page has two hotbar slots to reorder', false, JSON.stringify(slots));
      // X: its journal page, B back to Carried
      const before = (await JP(page)).entry;
      await tap(page, { x: true });
      j = await JP(page);
      check('X opens the highlighted card\'s journal page', j.tab !== 'carried', JSON.stringify(j));
      await tap(page, { b: true });
      j = await JP(page);
      check('B comes back to the Carried card it left from (the book stays open)', j.open && j.tab === 'carried' && j.entry === before, JSON.stringify(j));
      // chapters
      await tap(page, { rb: true });
      j = await JP(page); r = await ring(page);
      check('RB turns to the next chapter (Places), the ring on its first entry', j.tab === 'places' && r.id === j.entry && /octo-bk-card/.test(r.cls), JSON.stringify([j.tab, j.entry, r.id]));
      await tap(page, { rb: true });
      await tap(page, { rb: true });
      j = await JP(page);
      check('RB again: People, then the Bestiary', j.tab === 'bestiary', j.tab);
      // the grid: down a row, right along it and past the page's side (the page turns)
      const g0 = await JP(page);
      await tap(page, { down: true });
      let g1 = await JP(page);
      const idx = (p, id) => p.evaluate((id) => [...document.querySelectorAll('.octo-bk-left .octo-bk-card')].findIndex((b) => b.dataset.id === id), id);
      check('d-pad down moves a row (three cards on)', (await idx(page, g1.entry)) === 3 || (g0.perPage <= 3), `${g0.entry} -> ${g1.entry} (${await idx(page, g1.entry)})`);
      let turned = false;
      for (let i = 0; i < 4 && !turned; i++) { await tap(page, { right: true }); turned = (await JP(page)).page !== g0.page || (await JP(page)).tab !== 'bestiary'; }
      g1 = await JP(page);
      check('d-pad right past the last column turns the page', turned && (g1.page === g0.page + 1 || g1.tab !== 'bestiary'), JSON.stringify(g1));
      if (g1.tab === 'bestiary' && g1.page > g0.page) {
        const rowOn = Math.floor((await idx(page, g1.entry)) / 3);
        await tap(page, { left: true });
        const g2 = await JP(page);
          check('d-pad left at the first column turns back, onto the near side of the same row', g2.page === g0.page && (await idx(page, g2.entry)) === rowOn * 3 + 2, JSON.stringify(g2) + ' idx ' + (await idx(page, g2.entry)) + ' row ' + rowOn);
      }
      await sleep(500); // the page flip settles
      await shot(page, 'journal-focus');
      // LB back, Progress at the end
      await tap(page, { lb: true });
      check('LB turns back a chapter', (await JP(page)).tab === 'people');
      for (let i = 0; i < 8; i++) await tap(page, { rb: true });
      j = await JP(page); r = await ring(page);
      check('the last chapter (Progress) has no cards: the ring sits on its bookmark', j.tab === 'progress' && r.id === 'progress', JSON.stringify([j.tab, r]));
      await tap(page, { a: true }); await tap(page, { up: true }); await tap(page, { x: true }); await tap(page, { y: true });
      check('A, up, X, Y on Progress do nothing harmful', (await JP(page)).open && page.errs.length === 0, page.errs.join(' | '));
      await tap(page, { b: true });
      check('B closes the book, the game runs again', !(await JP(page)).open && !(await page.evaluate(() => __octo.state().paused)));
      await tap(page, { back: true }); await P(page, {}, 3);
      await tap(page, { back: true });
      check('View opens and View closes it too', !(await JP(page)).open);

      // ---------------------------------------------------- settings, from the pause menu
      await tap(page, { start: true }); await P(page, {}, 9);
      for (let i = 0; i < 5 && !/Settings/.test((await S(page)).focus); i++) await tap(page, { down: true });
      await tap(page, { a: true }); await P(page, {}, 9);
      check('Settings opens from the pause menu on A', (await page.evaluate(() => __octo.settings())).open);
      // walk the whole panel: down until the focus stops changing, then up the same way; collect what was focused
      const seen = new Set();
      let last = '';
      for (let i = 0; i < 30; i++) await tap(page, { up: true }); // from the top
      for (let i = 0; i < 30; i++) {
        const k = await page.evaluate(() => { const e = document.querySelector('.octo-settings-overlay .octo-pad-focus'); if (!e) return ''; const c = e.matches('.octo-set-row') ? e.querySelector('input') : e; return (c.dataset.setting || c.className.split(' ').find((x) => /octo-set-|octo-settings-close|octo-btn-danger/.test(x)) || c.textContent.trim()); });
        seen.add(k);
        if (k === last && i > 2) break;
        last = k;
        await tap(page, { down: true });
      }
      for (let i = 0; i < 30; i++) { await tap(page, { up: true }); const k = await page.evaluate(() => { const e = document.querySelector('.octo-settings-overlay .octo-pad-focus'); if (!e) return ''; const c = e.matches('.octo-set-row') ? e.querySelector('input') : e; return c.dataset.setting || c.className.split(' ').find((x) => /octo-set-|octo-settings-close|octo-btn-danger/.test(x)) || c.textContent.trim(); }); seen.add(k); }
      for (let i = 0; i < 10; i++) { await tap(page, { right: true }); const k = await page.evaluate(() => { const e = document.querySelector('.octo-settings-overlay .octo-pad-focus'); if (!e) return ''; const c = e.matches('.octo-set-row') ? e.querySelector('input') : e; return c.dataset.setting || c.className.split(' ').find((x) => /octo-set-|octo-settings-close|octo-btn-danger/.test(x)) || c.textContent.trim(); }); seen.add(k); }
      const want = ['musicVol', 'sfxVol', 'shake', 'reducedMotion', 'sink', 'octo-set-clear', 'octo-set-journal', 'octo-set-looks', 'octo-btn-danger', 'octo-settings-close'];
      check('every settings control is reachable with the d-pad (sliders, switches, Random, Journal, Looks, Reset, Close)', want.every((w) => seen.has(w)), [...seen].join(','));
      // a switch on A
      const goTo = async (pred, dirs = ['down', 'up', 'right', 'left']) => {
        for (const d of dirs) for (let i = 0; i < 16; i++) { if (await page.evaluate(pred)) return true; await tap(page, { [d]: true }); }
        return page.evaluate(pred);
      };
      const onShake = await goTo(() => { const e = document.querySelector('.octo-pad-focus'); return !!e && e.dataset.setting === 'shake'; });
      const sh0 = await page.evaluate(() => __octo.settings().values ? __octo.settings().values.shake : __octo.settings().shake);
      await tap(page, { a: true });
      const sh1 = await page.evaluate(() => __octo.settings().values ? __octo.settings().values.shake : __octo.settings().shake);
      await tap(page, { a: true });
      check('A flips a switch (screen shake), A flips it back', onShake && sh0 !== sh1, `${sh0} -> ${sh1}`);
      // the Controller block
      const ctl = await page.evaluate(() => { const b = [...document.querySelectorAll('.octo-set-help')].find((x) => /Controller/.test(x.textContent)); return b ? { cur: b.classList.contains('is-current'), glyphs: [...b.querySelectorAll('canvas.octo-glyph')].map((c) => c.dataset.glyph) } : null; });
      check('the Controller help block is the current one and leads its lines with pad glyphs', !!ctl && ctl.cur && ['LS', 'RS', 'RT', 'RB', 'A', 'B', 'LT', 'LB', 'View', 'Menu'].every((g) => ctl.glyphs.includes(g)), JSON.stringify(ctl));
      // reset confirm: A opens it, B closes only it
      const onReset = await goTo(() => { const e = document.querySelector('.octo-pad-focus'); return !!e && e.classList.contains('octo-btn-danger'); });
      await tap(page, { a: true }); await P(page, {}, 2);
      const conf = await page.evaluate(() => ({ shown: getComputedStyle(document.querySelector('.octo-set-confirm')).display !== 'none', f: (document.querySelector('.octo-pad-focus') || {}).textContent }));
      await shot(page, 'settings-confirm');
      await tap(page, { b: true }); await P(page, {}, 2);
      const conf2 = await page.evaluate(() => ({ shown: getComputedStyle(document.querySelector('.octo-set-confirm')).display !== 'none', open: __octo.settings().open, f: (document.querySelector('.octo-pad-focus') || {}).textContent }));
      check('Reset progress: A asks, B backs out of the question only (settings stay open, focus on Reset)', onReset && conf.shown && !conf2.shown && conf2.open && /Reset/.test(conf2.f || ''), JSON.stringify([conf, conf2]));
      // Journal from settings, B back to settings
      await goTo(() => { const e = document.querySelector('.octo-pad-focus'); return !!e && e.classList.contains('octo-set-journal'); });
      await tap(page, { a: true }); await P(page, {}, 3);
      const jOpen = (await JP(page)).open;
      await tap(page, { b: true }); await P(page, {}, 3);
      check('Open the journal from Settings, B comes back to Settings', jOpen && !(await JP(page)).open && (await page.evaluate(() => __octo.settings().open)));
      await goTo(() => { const e = document.querySelector('.octo-pad-focus'); return !!e && e.classList.contains('octo-set-looks'); });
      await tap(page, { a: true }); await P(page, {}, 3);
      const lOpen = await page.evaluate(() => __octo.skins().open);
      await tap(page, { b: true }); await P(page, {}, 3);
      check('Looks from Settings, B comes back to Settings', lOpen && !(await page.evaluate(() => __octo.skins().open)) && (await page.evaluate(() => __octo.settings().open)));
      await shot(page, 'settings-controller');
      await tap(page, { b: true }); await P(page, {}, 3);
      check('B closes Settings back to the pause menu, B again resumes', !(await page.evaluate(() => __octo.settings().open)) && (await page.evaluate(() => __octo.state().paused)));
      await tap(page, { b: true });
      check('(resumed)', !(await page.evaluate(() => __octo.state().paused)));

      // ---------------------------------------------------- the shop: A buys a ware (nothing needs a click)
      check('dive: no page errors', page.errs.length === 0, page.errs.join(' | '));
      await page.close();
    }
    {
      // a dive seed whose 1-1 has a shop
      const finder = await open(browser, '?at=1&seed=3');
      const seed = await finder.evaluate(async () => { const L = await import('./js/level.js'); for (let s = 2; s < 400; s++) if (L.generateLevel(s, 0).shop) return s; return 0; });
      await finder.close();
      const page = await open(browser, '?at=1&seed=' + seed);
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); __octo.giveShells(40); });
      await P(page, {}); await P(page, { lx: 1 }); await P(page, {});
      const sh = await page.evaluate(() => __octo.extras().shop);
      const W = 1, px = sh.px[W * 2], py = sh.px[W * 2 + 1];
      for (let n = 0; n < 30; n++) await page.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, px - 0.7, py - 0.1);
      const tgt = await page.evaluate(() => __octo.hand().target);
      await shot(page, 'shop');
      const s0 = await page.evaluate(() => __octo.extras().shells);
      await P(page, { a: true }); await step(page, 2); await P(page, {}); await step(page, 3);
      const after = await page.evaluate(() => ({ shop: __octo.extras().shop, shells: __octo.extras().shells, aggro: __octo.extras().shopAggro }));
      check('shop: beside a ware the hand targets it, A buys it (paid, the keeper stays calm)', tgt && tgt.kind === 'ware' && after.shop.sold.some((v) => v === 1) && after.shells < s0 && !after.aggro.on, JSON.stringify({ tgt, sold: after.shop.sold, s0, s1: after.shells, aggro: after.aggro }));
      check('shop: no page errors', page.errs.length === 0, page.errs.join(' | '));
      await page.close();
    }
    // ======================================================== the hub: the mirror and talking
    {
      const page = await open(browser, '?offer=0&seed=11', FULL, () => window.__octo && !__octo.transitioning() && __octo.hubRooms());
      await page.evaluate(() => __octo.freeze(true));
      await P(page, {}); await P(page, { lx: 1 }); await P(page, {});
      let s = await page.evaluate(() => __octo.skins());
      await page.evaluate((m) => __octo.teleport(m.x + 0.9, m.y - 0.55), s.mirror);
      await step(page, 20);
      const tgt = await page.evaluate(() => __octo.hand().target);
      await tap(page, { a: true }, 2); await P(page, {}, 3);
      s = await page.evaluate(() => __octo.skins());
      let r = await ring(page);
      check('hub: A at the mirror shell opens the looks picker, the ring on the worn look', tgt && tgt.kind === 'mirror' && s.open && /octo-skin-card/.test(r.cls) && r.id === s.current, JSON.stringify({ tgt: tgt && tgt.kind, open: s.open, r, cur: s.current }));
      const unlocked = s.cards.filter((c) => c.unlocked).map((c) => c.id);
      let moved = '';
      for (let i = 0; i < 6; i++) { await tap(page, { right: true }); r = await ring(page); if (r.id !== s.current && unlocked.includes(r.id)) { moved = r.id; break; } }
      await shot(page, 'mirror');
      await tap(page, { a: true });
      const s2 = await page.evaluate(() => __octo.skins());
      check('hub: the d-pad browses the looks, A wears the one with the ring', !!moved && s2.current === moved, JSON.stringify({ moved, cur: s2.current, unlocked }));
      await tap(page, { down: true }); await tap(page, { up: true });
      await tap(page, { b: true }); await P(page, {}, 3);
      check('hub: B closes the looks picker, the game runs again', !(await page.evaluate(() => __octo.skins().open)) && !(await page.evaluate(() => __octo.state().paused)));
      await page.evaluate((id) => __octo.wearSkin(id), s.current);
      // talk to Marlo on A
      const h = await page.evaluate(() => __octo.hubRooms());
      const marlo = h.residents.find((x) => x.id === 'marlo');
      await page.evaluate((x, y) => { __octo.teleport(x + 0.9, y - 0.8); __octo.stepDraw(30); }, marlo.x, marlo.y);
      await step(page, 900);
      const u0 = await page.evaluate(() => __octo.hand().uses);
      await tap(page, { a: true }, 2); await step(page, 3);
      const h2 = await page.evaluate(() => __octo.hubRooms());
      check('hub: A beside Marlo talks to him', (await page.evaluate(() => __octo.hand().uses)) === u0 + 1 && h2.talk.who === 'marlo', JSON.stringify(h2.talk));
      check('hub: no page errors', page.errs.length === 0, page.errs.join(' | '));
      await page.close();
    }
    // ======================================================== the end screens: B never throws or strands the pad
    {
      const page = await open(browser, '?at=1&seed=5');
      await P(page, {}); await P(page, { lx: 1 }); await P(page, {});
      await page.evaluate(() => { __octo.god(false); __octo.kill('crab'); });
      await page.waitForFunction(() => __octo.state().gameOverShown, { timeout: 8000 });
      await sleep(300); await P(page, {}, 9);
      await tap(page, { b: true }); await tap(page, { x: true }); await tap(page, { lb: true }); await tap(page, { down: true });
      const s = await S(page);
      check('death screen: B, X, LB do nothing harmful, the d-pad still moves the ring', s.menu && s.ring && (await page.evaluate(() => __octo.state().gameOverShown)), s.focus);
      check('death: no page errors', page.errs.length === 0, page.errs.join(' | '));
      await page.close();
      const pe = await open(browser, '?at=end&seed=5');
      await P(pe, {}); await P(pe, { a: true }); await P(pe, {}, 9);
      await tap(pe, { b: true }); await tap(pe, { rb: true });
      check('clear screen: B and RB leave it up with its ring', (await pe.evaluate(() => __octo.level().endShown)) && (await S(pe)).ring);
      await tap(pe, { a: true }); await sleep(1500);
      check('clear screen: A goes on', !(await pe.evaluate(() => __octo.level().endShown)));
      check('clear: no page errors', pe.errs.length === 0, pe.errs.join(' | '));
      await pe.close();
    }
  } catch (e) {
    check('THREW ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e), false);
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})();
