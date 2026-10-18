// Node script (not part of tests/index.html): 2026-10-18 bug (Daniel: "I couldn't place the Lure until I opened the journal,
// swapped it with another slot and back"; Ink Cloud the same). Root cause: the 0.4 s cast lock (run.castLockUntil) was kept on
// the run while the time it is compared with is the level clock (sim.time, back to 0 on every level), so after a cast late on one
// level every cast of the next was refused (CAST_BUSY, silently) until the new clock passed the old time. This plays it in real
// Chrome, never opening the journal: a cast at 90 s, the next level, then Use by every input (1-9, Q / E, the wheel, right
// click, a pad's d-pad + RB) casts the Lure and Ink Cloud; a quick restart (a fresh dive) casts too; and a Lure aimed into rock
// shakes its tile (quiet feedback, no popup).
//   node use-slot-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '65471';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const STUB = "(() => { const f = () => [window.__octoFakePad || null, null, null, null]; f.__octoFake = true; window.__octoFakePad = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

const st = (page) => page.evaluate(() => {
  const s = __octo.spells(), j = __octo.juice();
  const by = j.byEffect || {};
  return { slots: s.slots.map((x) => x[0]), sel: s.sel, lures: by.lure | 0, clouds: by.cloud | 0, juice: j.juice, lock: s.lock, now: s.now, journal: __octo.journal().open };
});
const waitLevel = (page) => page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 30000 });
const fill = (page) => page.evaluate(() => { __octo.god(true); __octo.setJuice(999); });
/** One Use and what it cast: +1 lure / +1 cloud between before and after. */
async function used(page, act) {
  await fill(page); // a full jar (3 casts) before every Use
  const a = await st(page);
  await act();
  await sleep(550); // past the 0.4 s lock
  const b = await st(page);
  return { lure: b.lures - a.lures, cloud: b.clouds - a.clouds, b };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.evaluateOnNewDocument(SAVE);
    await page.evaluateOnNewDocument(STUB);
    await page.goto(BASE + '?at=1&seed=5', { waitUntil: 'networkidle0', timeout: 60000 });
    await waitLevel(page);
    await sleep(1200);

    // ---- the first level: the Lure on the bar, a cast late in the level (90 s on its clock)
    await fill(page);
    const slot = await page.evaluate(() => __octo.giveRune('lure'));
    check('the Lure rune goes onto the bar (slot 3)', slot === 2, String(slot));
    await page.evaluate(() => __octo.setLevelTime(90));
    let r = await used(page, () => page.keyboard.press('KeyC'));
    check('C casts the Lure at 90 s on the level clock', r.lure === 1 && r.b.lock > 90, JSON.stringify(r.b));

    // ---- the next level: never opening the journal
    await page.evaluate(() => __octo.runEvent('exit'));
    await waitLevel(page); await sleep(1200);
    await fill(page);
    let s = await st(page);
    check('next level: the level clock starts over and the cast lock with it', s.now < 5 && s.lock <= s.now + 0.41 && s.slots.join() === 'bomb,ink-cloud,lure', JSON.stringify(s));
    r = await used(page, async () => { await page.keyboard.press('Digit3'); await page.keyboard.press('KeyC'); });
    check('next level: 3 then C places the Lure', r.lure === 1, JSON.stringify(r));
    r = await used(page, async () => { await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyC'); });
    check('next level: Q then C puffs Ink Cloud', r.cloud === 1 && r.b.sel === 1, JSON.stringify(r));
    r = await used(page, async () => { await page.keyboard.press('KeyE'); await page.keyboard.press('KeyC'); });
    check('next level: E then C places the Lure', r.lure === 1 && r.b.sel === 2, JSON.stringify(r));
    await page.mouse.move(760, 450);
    r = await used(page, async () => { await page.mouse.wheel({ deltaY: -100 }); await sleep(80); await page.mouse.click(760, 450, { button: 'right' }); });
    check('next level: the wheel then right click casts Ink Cloud', r.cloud === 1 && r.b.sel === 1, JSON.stringify(r));
    r = await used(page, async () => { await page.mouse.wheel({ deltaY: 100 }); await sleep(80); await page.mouse.click(760, 450, { button: 'right' }); });
    check('next level: the wheel then right click places the Lure', r.lure === 1 && r.b.sel === 2, JSON.stringify(r));

    // ---- a pad on the same level: d-pad left / right picks, RB uses
    const pad = (state) => page.evaluate((st) => { window.__octoFakePad = null; return __octo.pad(st, 0); }, state);
    const tap = async (state) => { await pad(state); await sleep(90); await pad({}); await sleep(90); };
    await pad({}); await sleep(150);
    r = await used(page, async () => { await tap({ left: true }); await tap({ rb: true }); });
    check('pad: d-pad left then RB puffs Ink Cloud', r.cloud === 1 && r.b.sel === 1, JSON.stringify(r));
    r = await used(page, async () => { await tap({ right: true }); await tap({ rb: true }); });
    check('pad: d-pad right then RB places the Lure', r.lure === 1 && r.b.sel === 2, JSON.stringify(r));
    check('the journal was never opened', !(await st(page)).journal);

    // ---- a Lure that cannot happen (its point is rock): nothing paid, the tile shakes
    const refused = await page.evaluate(() => {
      const o = __octo.state().octopus;
      let x = o.x, y = o.y;
      for (let d = 1; d < 40 && !__octo.isSolid(x, y); d++) { x = o.x; y = o.y + d; } // straight down into the floor
      __octo.setJuice(999); const j0 = __octo.juice().juice;
      const tEl = document.querySelector('.octo-toast'), t0 = tEl ? tEl.style.display + '|' + tEl.textContent : '';
      const res = __octo.cast(x, y + 0.2);
      const tile = document.querySelectorAll('.octo-hb-slot')[2];
      return { res, paid: j0 - __octo.juice().juice, shake: !!tile && tile.classList.contains('octo-jar-shake'), toast: tEl ? tEl.style.display + '|' + tEl.textContent !== t0 : false }; // no new toast
    });
    check('a Lure into rock is refused for free and its tile shakes (no popup)', refused.res === -1 && refused.paid === 0 && refused.shake && !refused.toast, JSON.stringify(refused));

    // ---- a fresh dive (quick restart) after a long level: Ink Cloud works straight away
    await sleep(500);
    await page.evaluate(() => __octo.setLevelTime(200));
    await page.keyboard.press('KeyC'); await sleep(500);
    await page.evaluate(() => __octo.runEvent('restart'));
    await waitLevel(page); await sleep(1500);
    await fill(page);
    s = await st(page);
    r = await used(page, () => page.keyboard.press('KeyC'));
    check('fresh dive: C puffs Ink Cloud at once (the old 200 s lock is gone)', r.cloud === 1 && s.slots[s.sel] === 'ink-cloud', JSON.stringify({ s, r }));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
