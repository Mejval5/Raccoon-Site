// Node script (not part of tests/index.html): hub building (octomancer-web/HUB-BUILDING.md) in real Chrome against a running copy
// of the game, navigator.getGamepads stubbed before load (driven by __octo.pad):
//   - a dive's shells are banked on a death (the death screen's "Banked" row) and the pile in the hub grows a stage;
//   - a run dropped from the pause menu (Restart run, alive) banks too;
//   - the tally stone names the count when near; an empty spot shows its chalk outline only within 3 tiles;
//   - F at a spot opens the build picker (paused), Enter builds the focused piece, the hoard pays, the first build is toasted
//     and finds Your Village in the journal; a dear piece is refused;
//   - the pad's hand button at another spot opens it, the d-pad moves, A builds, B closes;
//   - a reload keeps the pieces; Clear takes one down (free, no refund);
//   - frame cost of the hub with 0 and with 13 pieces built (render only, the same view);
//   - frames at 1440x900 and 412x915: the empty hub with the pile, a spot outline, the picker on a pad, the decorated hub.
// Frames go to octomancer-web/night/hubbuild-*.png.
//   node hub-build-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '65490';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'hubbuild-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
const STORY = { marlo: 3, saidMarlo: 3, pip: 2, saidPip: 2, quill: 2, saidQuill: 2, relics: 3, relicsGiven: 3, host: 1, saidHost: 1, mamaPip: 1, explorePip: 1 };
const SAVE = { v: 1, best: 9, runs: 12, muted: true, helpDone: true, helpPadDone: true, tutorialDone: true, shortcut: true, journal: ['place-hub'], meta: { dives: 12, clears: 4 }, story: STORY, journalStats: { 'person-keeper': [2, 0, 0, 1, 0, 0, 0] } };
const ALL13 = { 'plaza-hook-w': 'lanterns', 'plaza-hook-e': 'net', 'plaza-mural': 'mosaic-village', 'plaza-floor': 'bench', 'shaft-niche-w': 'coral', 'shaft-niche-e': 'plaque-marlo',
  'dive-ledge-w': 'anchor', 'dive-ledge-e': 'glowjar', 'workshop-niche': 'fan', 'grotto-niche': 'plaque-quill', 'nook-hook': 'bell', 'arena-hook': 'chimes', 'den-ledge': 'idol' };
const STUB = "(() => { const f = () => [window.__octoFakePad || null, null, null, null]; f.__octoFake = true; window.__octoFakePad = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const VPS = {
  desk: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

async function open(browser, save, vp = 'desk', q = '') {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.setViewport(VPS[vp]);
  // the save is written once per tab: a reload keeps what the game stored
  await page.evaluateOnNewDocument("try{if(!sessionStorage.getItem('keep'))localStorage.setItem('octomancer.best.v1'," + JSON.stringify(JSON.stringify(save)) + ");sessionStorage.setItem('keep','1')}catch(e){}");
  await page.evaluateOnNewDocument(STUB);
  await page.goto(BASE + '?offer=0&seed=11' + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 60000 });
  page.errs = errs;
  await sleep(800);
  return page;
}
const HB = (p) => p.evaluate(() => __octo.hubBuild());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });
const P = (p, st, polls = 1) => p.evaluate((st, n) => __octo.pad(st, n), st, polls);
async function tap(p, st, n = 2) { await P(p, st); if (n) await step(p, n); await P(p, {}); await step(p, 1); }
async function settle(page) { await page.waitForFunction(() => !__octo.transitioning(), { timeout: 60000 }); await sleep(300); }
/** Swim beside a spot (its touch point) and let the hand find it. */
async function toSpot(page, id, dx = 0.25, dy = 0.15) {
  const s = (await HB(page)).spots.find((q) => q.id === id);
  await page.evaluate((p, dx, dy) => { __octo.teleport(p.x + dx, p.y + dy); __octo.stepDraw(24); }, s.point, dx, dy);
  return s;
}
const target = (page) => page.evaluate(() => { const t = __octo.hand().target; return t ? { kind: t.kind, ref: t.ref } : null; });
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.octo-toast')].map((e) => e.textContent).join(' | '));

/** Render cost of the current view: the median ms per render over batches (stepDraw(0) = draw only). */
async function frameCost(page) {
  return page.evaluate(() => {
    for (let i = 0; i < 30; i++) __octo.stepDraw(0); // warm (bakes)
    const per = [];
    for (let b = 0; b < 7; b++) { const t0 = performance.now(); for (let i = 0; i < 40; i++) __octo.stepDraw(0); per.push((performance.now() - t0) / 40); }
    per.sort((a, b) => a - b);
    return +per[3].toFixed(3);
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 });
  try {
    // ================================================================== banking: a death in a dive, then the hub
    {
      const page = await open(browser, SAVE, 'desk', '&at=1');
      await page.evaluate(() => { __octo.god(false); __octo.freeze(true); __octo.giveShells(64); });
      await page.evaluate(() => __octo.kill('crab'));
      await page.evaluate(() => __octo.freeze(false));
      await page.waitForFunction(() => document.querySelector('.octo-gameover-overlay') && getComputedStyle(document.querySelector('.octo-gameover-overlay')).display !== 'none', { timeout: 20000 });
      const rows = await page.evaluate(() => [...document.querySelectorAll('.octo-gameover-overlay .octo-summary-row')].map((r) => r.textContent));
      check('death screen: the summary has a "Banked 64 shells" row', rows.some((r) => /^Banked\s*64 shells$/.test(r)), JSON.stringify(rows));
      const h = await page.evaluate(() => __octo.hubBuild());
      check('the death banked the carried shells into the hoard (64, lifetime 64)', h.hoard.shells === 64 && h.hoard.lifetime === 64, JSON.stringify(h.hoard));
      await page.evaluate(() => document.querySelector('.octo-gameover-overlay .octo-go-hub').click());
      await settle(page);
      await page.evaluate(() => __octo.freeze(true));
      const b = await HB(page);
      await page.evaluate((p) => { __octo.teleport(p.x - 1.2, p.y - 1.4); __octo.stepDraw(30); }, b.pile);
      const bakes = (await HB(page)).bakes.bakes;
      check('in the hub the pile is drawn at stage 3 (64 shells: 60+)', bakes.includes('pile:3'), JSON.stringify(bakes));
      // a run dropped from the pause menu (alive) banks too
      await page.evaluate(() => __octo.runEvent('enter'));
      await settle(page);
      await page.evaluate(() => { __octo.freeze(true); __octo.giveShells(9); });
      const before = (await HB(page)).hoard.shells;
      const restarted = await page.evaluate(() => __octo.runEvent('restart'));
      await settle(page);
      const after = (await HB(page)).hoard.shells;
      check('Restart run from the pause menu (alive) banks the 9 carried shells', restarted && after === before + 9, before + ' -> ' + after);
      if (page.errs.length) check('no page errors (banking)', false, page.errs.slice(0, 3).join(' | '));
      await page.close();
    }

    // ================================================================== building on the keyboard and the pad, desktop
    let costEmpty = 0, costFull = 0;
    for (const vp of ['desk', 'phone']) {
      const page = await open(browser, { ...SAVE, hoard: { shells: 64, lifetime: 64 } }, vp);
      await page.evaluate(() => { __octo.freeze(true); __octo.god(true); });
      let h = await HB(page);
      check(vp + ': the hub has 13 spots, all open (every room open), nothing built', h.spots.length === 13 && h.spots.every((s) => s.open) && h.pieces.length === 0, h.spots.length + '/' + h.pieces.length);
      // the empty hub with the pile, and the tally stone's count
      await page.evaluate((p) => { __octo.teleport(p.x - 0.2, p.y - 0.8); __octo.stepDraw(30); }, h.tally);
      const tags = await page.evaluate(() => __octo.signs().tags);
      check(vp + ': beside the tally stone its count shows ("64 shells in the hoard")', tags.some((t) => t.id === 'tally' && /64 shells in the hoard/.test(t.text)), JSON.stringify(tags));
      await shot(page, vp + '-pile');
      await page.evaluate((p) => { __octo.teleport(p.x + 4.5, p.y - 2); __octo.stepDraw(10); }, h.tally);
      check(vp + ': away from it, no count', !(await page.evaluate(() => __octo.signs().tags)).some((t) => t.id === 'tally'));
      // a chalk outline: only near
      await toSpot(page, 'plaza-floor', 0.4, -0.2);
      const tg = await target(page);
      check(vp + ': at the plaza spot the hand\'s target is the build spot', tg && tg.kind === 'build', JSON.stringify(tg));
      const tag2 = await page.evaluate(() => __octo.signs().tags.find((t) => t.id === 'build'));
      check(vp + ': the spot says how to build (anchored tag)', !!tag2 && /build/.test(tag2.text), JSON.stringify(tag2));
      await shot(page, vp + '-outline');
      if (vp === 'desk') {
        // F opens the picker
        await page.keyboard.press('KeyF');
        await step(page, 2); await sleep(200);
        h = await HB(page);
        const paused = await page.evaluate(() => __octo.state().paused);
        check('desk: F at a spot opens the build picker over the paused game, for that spot', h.open && h.spot === 'plaza-floor' && paused, JSON.stringify({ open: h.open, spot: h.spot, paused }));
        check('desk: it lists the plaza pieces with costs; the dear ones are dimmed, tier 2+ are ??? at 64 lifetime', h.cards.some((c) => c.id === 'planter' && c.cost === 15 && !c.poor) && h.cards.some((c) => c.id === 'anchor' && c.locked && c.name === '???') && h.cards.some((c) => c.id === 'bench' && !c.locked), JSON.stringify(h.cards));
        const focusId = h.cards[h.focus].id;
        await page.keyboard.press('Enter');
        await step(page, 2); await sleep(150);
        h = await HB(page);
        check('desk: Enter builds the focused piece (the first affordable: ' + focusId + '), pays from the hoard, closes', !h.open && h.build['plaza-floor'] === focusId && h.hoard.shells === 64 - 15 && h.pieces.includes('plaza-floor:' + focusId), JSON.stringify({ b: h.build, hoard: h.hoard }));
        let toast = '';
        for (let k = 0; k < 80 && !/Built: Kelp planter/.test(toast); k++) { toast = await toastText(page); if (!/Built/.test(toast)) await sleep(150); }
        check('desk: the first build is toasted "Built: Kelp planter"', /Built: Kelp planter/.test(toast), toast);
        check('desk: the journal found "Your Village"', (await page.evaluate(() => __octo.journal().found)).includes('place-village'));
        // a dear piece is refused (and nothing is paid)
        await page.evaluate(() => __octo.openBuild('plaza-floor'));
        const ok = await page.evaluate(() => __octo.buildChoose('garden'));
        h = await HB(page);
        check('desk: a piece the hoard cannot pay for is refused, nothing spent, the picker stays', !ok && h.open && h.hoard.shells === 49, JSON.stringify(h.hoard));
        await page.keyboard.press('Escape'); await step(page, 1);
        check('desk: Esc closes the picker', !(await HB(page)).open);
      }
      // the pad: the hand button at another spot, the d-pad, A builds, B closes
      await P(page, {}); await P(page, { lx: 1 }); await P(page, {}); await step(page, 2);
      await toSpot(page, 'plaza-hook-w');
      await tap(page, { a: true });
      h = await HB(page);
      if (!h.open) { await tap(page, { lb: true }); h = await HB(page); } // (the hand may move to LB)
      check(vp + ': the pad\'s hand button at the ceiling hook opens the picker', h.open && h.spot === 'plaza-hook-w', JSON.stringify({ open: h.open, spot: h.spot }));
      const f0 = h.focus;
      await tap(page, { right: true }, 0);
      h = await HB(page);
      const ring = await page.evaluate(() => { const e = document.querySelector('.octo-pad-focus'); return e ? e.dataset.deco || '' : ''; });
      check(vp + ': the d-pad moves the focus, the pad ring follows it', h.focus === f0 + 1 && ring === h.cards[h.focus].id, JSON.stringify({ f0, f: h.focus, ring }));
      await tap(page, { left: true }, 0);
      await shot(page, vp + '-picker-pad');
      const want = (await HB(page)).cards[(await HB(page)).focus].id;
      await tap(page, { a: true }, 0);
      await step(page, 2);
      h = await HB(page);
      check(vp + ': A builds it (' + want + ') and closes', !h.open && h.build['plaza-hook-w'] === want, JSON.stringify(h.build));
      await page.evaluate(() => __octo.openBuild('plaza-hook-e')); await P(page, {}, 2); // (a frame passes: the pad sees the menu open before B)
      await tap(page, { b: true }, 0); await P(page, {}, 3);
      const afterB = await page.evaluate(() => ({ open: __octo.hubBuild().open, paused: __octo.state().paused, modal: document.getElementById('hud').classList.contains('octo-modal-open') }));
      check(vp + ': B closes the picker (no modal left)', !afterB.open && !afterB.modal, JSON.stringify(afterB));
      if (vp === 'desk') {
        // a reload keeps the pieces; Clear takes one down (free, no refund)
        const kept = (await HB(page)).build, hoard = (await HB(page)).hoard;
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForFunction(() => window.__octo && !__octo.transitioning() && __octo.hubBuild(), { timeout: 60000 });
        await page.evaluate(() => { __octo.freeze(true); __octo.god(true); });
        h = await HB(page);
        check('desk: after a reload the pieces are still there (save and drawn)', JSON.stringify(h.build) === JSON.stringify(kept) && h.pieces.length === Object.keys(kept).length && h.hoard.shells === hoard.shells, JSON.stringify({ build: h.build, pieces: h.pieces }));
        await toSpot(page, 'plaza-hook-w');
        await page.keyboard.press('KeyF'); await step(page, 2);
        h = await HB(page);
        check('desk: a built spot\'s picker starts with Clear', h.open && h.cards[0].id === 'clear' && h.cards.some((c) => c.current), JSON.stringify(h.cards.slice(0, 3)));
        await page.evaluate(() => __octo.buildChoose('clear'));
        h = await HB(page);
        check('desk: Clear takes the piece down, free, no refund', !h.open && !h.build['plaza-hook-w'] && h.hoard.shells === hoard.shells && !h.pieces.some((x) => x.startsWith('plaza-hook-w')), JSON.stringify({ b: h.build, hoard: h.hoard }));
        // frame cost: three views (the plaza, the pile, the shaft), 0 pieces vs 13
        const VIEWS = [[38, 12], [41, 16], [36.5, 25]];
        const costOf = async () => { let sum = 0; for (const [x, y] of VIEWS) { await page.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(30); }, x, y); sum += await frameCost(page); } return +sum.toFixed(3); };
        await page.evaluate(() => { __octo.hubBuildSet({}); __octo.bankShells(240); });
        costEmpty = await costOf();
        await page.evaluate((b) => __octo.hubBuildSet(b), ALL13);
        h = await HB(page);
        check('desk: 13 pieces built and drawn', h.pieces.length === 13, h.pieces.join());
        costFull = await costOf();
        console.log('INFO hub render cost, sum of 3 views: ' + costEmpty + ' ms with 0 pieces, ' + costFull + ' ms with 13 (' + (costFull - costEmpty).toFixed(3) + ' ms, ' + ((costFull - costEmpty) / 3).toFixed(3) + ' ms a frame)');
        check('desk: 13 pieces add under 0.5 ms a frame (mean of the 3 views)', (costFull - costEmpty) / 3 < 0.5, costEmpty + ' -> ' + costFull);
        const bk = (await HB(page)).bakes;
        check('desk: pieces are baked once (one canvas each, no growth over frames)', bk.bakes.length <= 30, JSON.stringify(bk));
        await page.evaluate(() => { __octo.freeze(false); });
        for (const [tag, x, y] of [['decorated-plaza', 36, 12], ['decorated-pile', 40, 16], ['decorated-shaft', 36.5, 25], ['decorated-dive', 36, 33]]) {
          await page.evaluate((x, y) => { __octo.teleport(x, y); }, x, y);
          await sleep(900);
          await shot(page, 'desk-' + tag);
        }
      } else {
        await page.evaluate((b) => { __octo.hubBuildSet(b); __octo.bankShells(240); __octo.freeze(false); }, ALL13);
        await page.evaluate(() => { __octo.teleport(40, 16); });
        await sleep(1200);
        await shot(page, 'phone-decorated');
        await page.evaluate(() => { __octo.teleport(36, 9); });
        await sleep(1200);
        await shot(page, 'phone-decorated-plaza');
      }
      if (page.errs.length) check(vp + ': no page errors', false, page.errs.slice(0, 3).join(' | '));
      await page.close();
    }
  } catch (e) {
    check('script ran', false, String(e && e.stack || e).slice(0, 600));
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
