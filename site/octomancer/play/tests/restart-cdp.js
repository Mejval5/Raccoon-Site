// Node script (not part of tests/index.html): the tutorial as its own place that unseals the dive, and Spelunky's quick restart,
// in real Chrome against a running copy of the game.
//   node restart-cdp.js [baseUrl]      baseUrl default http://127.0.0.1:61500/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// Checks: a fresh save offers the tutorial (Enter takes it, Esc declines); the hub's dive is sealed (swimming into it bounces
// back, runEvent('enter') is refused, the plank and prompt explain); the tutorial ring enters the tutorial; finishing it returns
// to the hub with the unlock moment and saves tutorialDone (a reload keeps the dive open and offers nothing); the tutorial is
// replayable (no second unlock moment) and can be left from the pause menu; the death screen's Restart run (R, Enter, the button)
// starts Shallows 1-1 at once, H / 'Back to the hub' goes to the hub; the pause menu's Restart run (button and R); and a quick
// restart leaves exactly the state that death -> hub -> dive leaves (run, octopus, juice, items, hotbar, aggro, moods, people,
// dive story, Beholder clock, best runs and journal counters), at 1440x900 and 412x915.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:61500/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveScript = (done) => "try{if(!sessionStorage.getItem('keep'))localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,helpDone:true,tutorialDone:" + done + ",journal:[]}));sessionStorage.setItem('keep','1')}catch(e){}";
const VPS = [
  ['1440x900', { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ['412x915', { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  async function open(vp, url, done, tag) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push(tag + ' ' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(tag + ' ' + m.text()); });
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(saveScript(done));
    await page.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 90000 });
    await sleep(500);
    return page;
  }
  const settle = async (page) => { await sleep(450); await page.waitForFunction(() => !__octo.transitioning(), { timeout: 20000 }); await sleep(300); };
  const stage = (page) => page.evaluate(() => __octo.level().stage);
  const dieAndWait = async (page, cause = 'crab') => { await page.evaluate((c) => __octo.kill(c), cause); await page.waitForFunction(() => __octo.state().gameOverShown, { timeout: 5000 }); await sleep(300); };
  const saved = (page) => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('octomancer.best.v1')); return { done: !!s.tutorialDone, bestRuns: (s.bestRuns || []).length, dives: s.meta ? s.meta.dives : -1, killedBy: Object.entries(s.journalStats || {}).filter(([, v]) => v[2] > 0).map(([k, v]) => k + ':' + v[2]).sort().join() }; }); // what a hub visit itself adds (the hub seen, its fish) is not compared
  try {
    for (const [vn, vp] of VPS) {
      const touch = !!vp.hasTouch;
      // --- 1) a fresh save: the offer, the sealed dive, the tutorial ring ---
      let page = await open(vp, '?seed=7', false, vn);
      let s = await page.evaluate(() => __octo.hubSeal());
      check(`[${vn}] a fresh save starts in the hub with the tutorial offered and the dive sealed`, (await stage(page)) === 'Hub' && s.offer && s.seal === 1 && !s.open);
      if (!touch) { await page.keyboard.press('Escape'); await sleep(200); } else { await page.tap('.octo-offer-no'); await sleep(200); }
      s = await page.evaluate(() => __octo.hubSeal());
      check(`[${vn}] declining the offer leaves the hub`, !s.offer && (await stage(page)) === 'Hub');
      check(`[${vn}] the dive event is refused while sealed`, (await page.evaluate(() => __octo.runEvent('enter'))) === false && (await stage(page)) === 'Hub');
      const lv = await page.evaluate(() => __octo.level());
      await page.evaluate((x, y) => __octo.teleport(x, y), lv.exitX + 0.5, lv.exitY + 0.4);
      await sleep(1500);
      s = await page.evaluate(() => __octo.hubSeal());
      const pos = await page.evaluate(() => __octo.state().octopus);
      check(`[${vn}] swimming into the sealed dive bounces the octopus back (no entry)`, (await stage(page)) === 'Hub' && !(await page.evaluate(() => __octo.entry())) && s.bumpAt > 0 && !(await page.evaluate(() => __octo.transitioning())), JSON.stringify({ bump: s.bumpAt, y: pos.y }));
      const prompt = await page.evaluate(() => { const e = document.querySelector('.octo-prompt'); return e && e.style.display !== 'none' ? e.textContent : ''; });
      check(`[${vn}] the prompt at the dive says why`, /Sealed by kelp/.test(prompt) && /tutorial/.test(prompt), prompt);
      // the tutorial ring: swim into it and press F (Daniel 2026-10-08: whirlpools are entered with the hand)
      await page.evaluate((x, y) => { __octo.teleport(x, y); __octo.pressHand(); }, s.tutorialX + 0.5, s.tutorialY + 0.3);
      await page.waitForFunction(() => __octo.transitioning() || __octo.level().stage === 'Tutorial', { timeout: 6000 }).catch(() => {});
      await settle(page);
      check(`[${vn}] the hub's tutorial ring enters the tutorial`, (await stage(page)) === 'Tutorial');
      // pause menu: Leave the tutorial
      if (!touch) { await page.keyboard.press('Escape'); } else { await page.tap('.octo-pause-btn'); }
      await sleep(300);
      let b = await page.evaluate(() => __octo.uiButtons());
      check(`[${vn}] the tutorial's pause menu offers Leave the tutorial, not Restart run`, b.pauseLeave.shown && !b.pauseRestart.shown);
      if (!touch) await page.click('.octo-pause-leave'); else await page.tap('.octo-pause-leave');
      await settle(page);
      s = await page.evaluate(() => __octo.hubSeal());
      check(`[${vn}] leaving the tutorial goes back to the hub, still sealed`, (await stage(page)) === 'Hub' && s.seal === 1 && !s.savedDone && !s.unlock);
      // finish it
      await page.evaluate(() => __octo.runEvent('tutorial')); await settle(page);
      await page.evaluate(() => __octo.runEvent('exit')); await settle(page);
      s = await page.evaluate(() => __octo.hubSeal());
      check(`[${vn}] finishing the tutorial returns to the hub, saves it and plays the unlock moment`, (await stage(page)) === 'Hub' && s.savedDone && s.open && !!s.unlock, JSON.stringify(s));
      await page.waitForFunction(() => !__octo.hubSeal().unlock, { timeout: 8000 }).catch(() => {});
      s = await page.evaluate(() => __octo.hubSeal());
      check(`[${vn}] after the unlock moment the kelp is gone`, s.seal === 0 && !s.unlock);
      // replay: no second unlock moment
      await page.evaluate(() => __octo.runEvent('tutorial')); await settle(page);
      check(`[${vn}] the tutorial is replayable`, (await stage(page)) === 'Tutorial');
      await page.evaluate(() => __octo.runEvent('exit')); await settle(page);
      s = await page.evaluate(() => __octo.hubSeal());
      check(`[${vn}] a replayed tutorial returns to the open hub with no unlock moment`, (await stage(page)) === 'Hub' && s.open && !s.unlock);
      // the unlock persists over a reload
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 90000 }); await sleep(500);
      s = await page.evaluate(() => __octo.hubSeal());
      check(`[${vn}] after a reload the dive stays open and nothing is offered`, s.open && s.seal === 0 && !s.offer);
      check(`[${vn}] the open dive starts Shallows 1-1`, (await page.evaluate(() => __octo.runEvent('enter'))) && ((await settle(page)), (await stage(page)) === 'Shallows 1-1'));
      await page.close();

      // --- 2) the offer accepted with Enter / its button ---
      page = await open(vp, '?seed=9', false, vn);
      if (!touch) await page.keyboard.press('Enter'); else await page.tap('.octo-offer-yes');
      await settle(page);
      check(`[${vn}] accepting the offer starts the tutorial`, (await stage(page)) === 'Tutorial');
      await page.close();

      // --- 3) quick restart vs death -> hub -> dive: the same state ---
      const snaps = [];
      for (const how of ['hub', 'quick']) {
        page = await open(vp, '?seed=7&at=2', true, vn);
        await page.evaluate(() => { __octo.giveItem('lantern'); __octo.giveShells(30); __octo.setJuice(9); __octo.giveBombs(1); __octo.shopAggro && __octo.shopAggro('test'); });
        await dieAndWait(page);
        b = await page.evaluate(() => __octo.uiButtons());
        if (how === 'hub') {
          check(`[${vn}] the death screen shows Restart run first, Back to the hub second`, b.restart.shown && b.restart.label === 'Restart run' && b.hub.shown && b.hub.label === 'Back to the hub' && (touch || (b.restart.key === 'R' && b.hub.key === 'H')));
          if (!touch) await page.keyboard.press('KeyH'); else await page.tap('.octo-go-hub');
          await settle(page);
          check(`[${vn}] H / Back to the hub goes to the hub`, (await stage(page)) === 'Hub');
          await page.evaluate(() => __octo.runEvent('enter'));
        } else {
          if (!touch) await page.keyboard.press('KeyR'); else await page.tap('.octo-go-restart');
        }
        await sleep(450);
        await page.waitForFunction(() => !__octo.transitioning(), { timeout: 20000 });
        const snap = await page.evaluate(() => __octo.runSnapshot());
        snap.save = await saved(page);
        snaps.push(snap);
        if (how === 'quick') check(`[${vn}] R / Restart run starts Shallows 1-1 at once, no hub`, snap.stage === 'Shallows 1-1' && !snap.gameOver);
        await page.close();
      }
      const [A, B] = snaps;
      const norm = (x) => {
        const o = JSON.parse(JSON.stringify(x));
        delete o.time; delete o.seenDive; delete o.paused; delete o.dive.time; delete o.save; // save: compared below
        for (const k of Object.keys(o.diveStory)) if (/^said/.test(k)) delete o.diveStory[k]; // the hub residents' greetings (a hub visit talks)
        for (const k of Object.keys(o.story)) if (/^said/.test(k)) delete o.story[k];
        return JSON.stringify(o);
      };
      const diff = [];
      const na = JSON.parse(norm(A)), nb = JSON.parse(norm(B));
      for (const k of Object.keys(na)) if (JSON.stringify(na[k]) !== JSON.stringify(nb[k])) diff.push(k + ': ' + JSON.stringify(na[k]).slice(0, 120) + ' vs ' + JSON.stringify(nb[k]).slice(0, 120));
      check(`[${vn}] a quick restart leaves the same state as death -> hub -> dive`, diff.length === 0, diff.join(' | '));
      check(`[${vn}] ... a fresh dive: full hearts and bombs, no items, no shells, start juice, calm keepers, a new Beholder clock`,
        B.octo.hearts === B.octo.heartMax && B.octo.bombs === A.octo.bombs && B.items.length === 0 && B.shells === 0 && B.juice === B.juiceStart && !B.shopAggro && B.time < 3 && !B.beholderOut && B.level === 1 && B.deaths === 1, JSON.stringify({ h: B.octo.hearts, b: B.octo.bombs, j: B.juice, t: B.time }));
      check(`[${vn}] ... the death was recorded once either way (best runs, dives, journal killed-by)`, A.save.bestRuns === 1 && B.save.bestRuns === 1 && A.save.dives === B.save.dives && A.save.killedBy === B.save.killedBy && /creature-crab:1/.test(B.save.killedBy), JSON.stringify([A.save, B.save]).slice(0, 300));

      // --- 4) Enter on the death screen, the button, and the pause menu's Restart run ---
      page = await open(vp, '?seed=7&at=1', true, vn);
      await dieAndWait(page);
      if (!touch) await page.keyboard.press('Enter'); else await page.tap('.octo-go-restart');
      await settle(page);
      check(`[${vn}] ${touch ? 'the Restart run button' : 'Enter'} on the death screen restarts the run`, (await stage(page)) === 'Shallows 1-1' && !(await page.evaluate(() => __octo.state().octopus.dead)));
      await page.evaluate(() => __octo.runEvent('exit')); await settle(page);
      check(`[${vn}] (on to Shallows 1-2)`, (await stage(page)) === 'Shallows 1-2');
      if (!touch) await page.keyboard.press('Escape'); else await page.tap('.octo-pause-btn');
      await sleep(300);
      b = await page.evaluate(() => __octo.uiButtons());
      check(`[${vn}] the pause menu in a dive shows Restart run`, b.pauseRestart.shown && !b.pauseLeave.shown);
      const deaths0 = await page.evaluate(() => __octo.runSnapshot().deaths);
      if (!touch) await page.keyboard.press('KeyR'); else await page.tap('.octo-pause-restart');
      await settle(page);
      const after = await page.evaluate(() => __octo.runSnapshot());
      check(`[${vn}] the pause menu's Restart run starts Shallows 1-1, unpaused, and is not counted as a death`, after.stage === 'Shallows 1-1' && !after.paused && after.deaths === deaths0);
      // the hub has no quick restart
      await dieAndWait(page);
      await page.evaluate(() => document.querySelector('.octo-go-hub').click()); await settle(page);
      check(`[${vn}] R does nothing in the hub`, (await stage(page)) === 'Hub' && !(await page.evaluate(() => __octo.runEvent('restart'))));
      if (!touch) { await page.keyboard.press('KeyR'); await sleep(500); check(`[${vn}] (R key in the hub)`, (await stage(page)) === 'Hub' && !(await page.evaluate(() => __octo.transitioning()))); }
      await page.close();
    }
  } catch (e) { fails.push('threw ' + e); console.log('THREW', e); }
  await browser.close();
  check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})();
