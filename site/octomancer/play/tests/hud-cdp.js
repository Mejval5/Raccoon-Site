// Node script (not part of tests/index.html): the one-line HUD strip (hud-strip.js, 2026-10-08) against a running copy of the game.
//   node hud-cdp.js [baseUrl] [shotDir]     baseUrl default http://127.0.0.1:62360/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
// Checks: hearts / bombs / jar / shells / items / level on the strip follow the game's values; the strip writes only on a change
// (no DOM mutation in a quiet second but the clock, at most ~10 clock writes a second, few layouts a second); the level and run
// clocks run, stop on pause and on death, the level clock resets per level and the run clock per run; the death screen shows
// both clocks; the Swift Current target sits by the clock (not under the banner); the layout at 1440x900, 412x915 and 915x412:
// one strip at the top, nothing overlapping the pause / mute / gear buttons, the hotbar or each other, inside the viewport.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:62360/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:1,muted:true,tutorialDone:true,journal:['place-hub']}))}catch(e){}";
const clock = (sec) => { const d = Math.max(0, Math.floor(sec * 10 + 1e-6)); return String(Math.floor(d / 600)).padStart(2, '0') + ':' + String(Math.floor(d / 10) % 60).padStart(2, '0') + '.' + (d % 10); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  const open = async (w, h, mobile, q) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument(SAVE);
    await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 30000 });
    await sleep(800);
    return page;
  };
  const H = (page) => page.evaluate(() => __octo.hud());
  try {
    // ---------------------------------------------------------------- values, clocks, pause, levels, death (desktop)
    {
      const page = await open(1440, 900, false, '?at=1&seed=5');
      await page.evaluate(() => __octo.god(true));
      let h = await H(page);
      const st = await page.evaluate(() => { const s = __octo.state().octopus; return { hearts: s.hearts, bombs: s.bombs }; });
      check('1-1: the strip shows hearts, bombs, casts, shells and the level', h.hearts === String(st.hearts) && h.bombs === String(st.bombs) && /^\d+$/.test(h.casts) && h.shells === '0' && h.stage === '1-1', JSON.stringify(h));
      check('1-1: both clocks show in the Spelunky format', /^\d\d:\d\d\.\d$/.test(h.level) && /^\d\d:\d\d\.\d$/.test(h.run), h.level + ' / ' + h.run);
      check('1-1: the Swift Current target sits by the clock, not under the level banner', /^\d:\d\d$/.test(h.swift)
        && await page.evaluate(() => { const e = document.querySelector('.octo-title-current'); return !e || e.style.display === 'none'; }), h.swift);
      // values follow the game
      await page.evaluate(() => { __octo.giveBombs(2); __octo.giveShells(14); __octo.setJuice(0); __octo.giveItem('lantern'); });
      await sleep(150);
      h = await H(page);
      check('values: bombs, shells, casts and the item row follow a change', h.bombs === '2' && h.shells === '14' && h.casts === '0' && h.items === 1, JSON.stringify(h));
      // writes only on a change: a quiet second mutates nothing but the clocks, and those at most ~10 times a second
      const mut = await page.evaluate(async () => {
        const bar = document.querySelector('.octo-hud-bar'); let clockN = 0, other = 0;
        const mo = new MutationObserver((list) => { for (const m of list) { if (m.target.closest && m.target.closest('.octo-hud-times') || (m.target.parentElement && m.target.parentElement.closest('.octo-hud-times'))) clockN++; else other++; } });
        mo.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true });
        await new Promise((r) => setTimeout(r, 1000));
        mo.disconnect();
        return { clockN, other };
      });
      check('writes: a quiet second changes nothing on the strip but the clocks', mut.other === 0, JSON.stringify(mut));
      check('writes: the clocks change at most ~10 times a second', mut.clockN > 0 && mut.clockN <= 2 * 12, JSON.stringify(mut));
      const cdp = await page.target().createCDPSession();
      await cdp.send('Performance.enable');
      const lc = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutCount').value;
      const l0 = await lc(); await sleep(2000); const l1 = await lc();
      check('layout: no per-frame layout from the HUD (layouts in 2 s, clocks running)', l1 - l0 <= 30, String(l1 - l0));
      // clocks run
      const c0 = await H(page); await sleep(1500); const c1 = await H(page);
      check('clocks: both run (about 1.5 s)', c1.levelClock - c0.levelClock > 1.2 && c1.levelClock - c0.levelClock < 2.2 && c1.runClock - c0.runClock > 1.2, (c1.levelClock - c0.levelClock).toFixed(2));
      check('clocks: the text is the clock value', c1.level === clock(c1.levelClock) || Math.abs(parseFloat(c1.level.slice(3)) - (c1.levelClock % 60)) < 0.25, c1.level + ' ~ ' + c1.levelClock.toFixed(2));
      // pause stops both
      await page.evaluate(() => __octo.pause(true));
      const p0 = await H(page); await sleep(1200); const p1 = await H(page);
      check('pause: both clocks stop', p1.levelClock === p0.levelClock && p1.runClock === p0.runClock && p1.level === p0.level && p1.run === p0.run, p0.level + ' -> ' + p1.level);
      await page.evaluate(() => __octo.pause(false));
      const q0 = await H(page); await sleep(400); const q1 = await H(page);
      check('resume: the clocks run again', q1.levelClock > q0.levelClock);
      // the Swift Current target fades once missed
      await page.evaluate(() => __octo.setClocks(500, 520)); await sleep(200);
      h = await H(page);
      check('swift: a missed target is marked (and the clocks show 08:20.x / 08:40.x)', h.swiftState === 'missed' && /^08:20\.\d$/.test(h.level) && /^08:40\.\d$/.test(h.run), JSON.stringify(h));
      await page.evaluate(() => __octo.setClocks(20, 40)); await sleep(150);
      // next level: the level clock resets, the run clock goes on
      const before = await H(page);
      await page.evaluate(() => __octo.runEvent('exit'));
      await page.waitForFunction(() => !__octo.transitioning(), { timeout: 30000 }); await sleep(600);
      h = await H(page);
      check('next level: the level clock starts again, the run clock carries on', h.stage === '1-2' && h.levelClock < 3 && h.runClock >= before.runClock, `${before.level}/${before.run} -> ${h.level}/${h.run}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hud-1440-play.png') });
      // death: the clocks stop and the death screen shows them
      await page.evaluate(() => { __octo.god(false); __octo.kill('crab'); }); await sleep(1500);
      const d0 = await H(page); await sleep(800); const d1 = await H(page);
      check('death: both clocks stop', d0.levelClock === d1.levelClock && d0.runClock === d1.runClock);
      const row = await page.evaluate(() => [...document.querySelectorAll('.octo-gameover-overlay .octo-summary-row')].map((r) => r.textContent).find((t) => /Time/.test(t)) || '');
      check('death: the summary shows level / run time as on the strip', row.includes(d1.level + ' / ' + d1.run), row);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hud-1440-death.png') });
      // a new run: the run clock starts again
      await page.evaluate(() => __octo.runEvent('death'));
      await page.waitForFunction(() => !__octo.transitioning(), { timeout: 30000 }); await sleep(500);
      h = await H(page);
      check('hub: no clocks, the level reads Hub', h.level === null && h.stage === 'Hub', JSON.stringify(h));
      await page.evaluate(() => __octo.runEvent('enter'));
      await page.waitForFunction(() => !__octo.transitioning(), { timeout: 30000 }); await sleep(500);
      h = await H(page);
      check('new run: both clocks start from zero', h.stage === '1-1' && h.runClock < 3 && h.levelClock < 3, `${h.level} / ${h.run}`);
      await page.close();
    }
    // ---------------------------------------------------------------- layout at three viewports
    for (const [w, ht, mobile, tag] of [[1440, 900, false, 'desktop'], [412, 915, true, 'portrait'], [915, 412, true, 'landscape'], [375, 812, true, 'small-portrait']]) {
      const page = await open(w, ht, mobile, '?at=2&seed=5');
      await page.evaluate(() => { __octo.god(true); __octo.giveShells(14500); __octo.giveItem('lantern'); __octo.giveItem('flippers'); __octo.giveItem('magnet'); __octo.setClocks(65.4, 3599.5); });
      await sleep(400);
      const r = await page.evaluate(() => {
        const R = (sel) => { const e = document.querySelector(sel); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const kids = ['.octo-hud-hearts', '.octo-hud-bombs', '.octo-hud-jar', '.octo-hud-shells', '.octo-hud-clock', '.octo-hud-level', '.octo-hud-swift', '.octo-hud-items'];
        return { vw: innerWidth, vh: innerHeight, bar: R('.octo-hud-bar'), left: R('.octo-hud-left'), right: R('.octo-hud-right'), hotbar: R('.octo-hotbar'),
          btns: ['.octo-pause-btn', '.octo-mute-btn', '.octo-gear-btn'].map(R), kids: kids.map((k) => [k, R(k)]).filter((x) => x[1]),
          title: R('.octo-title'), times: document.querySelector('.octo-hud-times').textContent };
      });
      const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      check(`${tag}: one strip across the top`, r.bar && r.bar.t <= 0.5 && r.bar.l <= 0.5 && r.bar.r >= r.vw - 0.5 && r.bar.b < 70, JSON.stringify(r.bar));
      check(`${tag}: left and right groups on one line inside the strip, apart`, r.left && r.right && r.left.r < r.right.l && Math.abs((r.left.t + r.left.b) / 2 - (r.right.t + r.right.b) / 2) < 6 && r.right.b <= r.bar.b + 1, JSON.stringify({ l: r.left, r: r.right }));
      const hits = [];
      for (const [k, b] of r.kids) {
        if (b.l < -0.5 || b.r > r.vw + 0.5 || b.t < -0.5) hits.push(k + ' off screen');
        r.btns.forEach((x, i) => { if (ov(b, x)) hits.push(k + ' x button ' + i); });
        if (ov(b, r.hotbar)) hits.push(k + ' x hotbar');
      }
      for (let i = 0; i < r.kids.length; i++) for (let j = i + 1; j < r.kids.length; j++) {
        const a = r.kids[i], b = r.kids[j];
        if (a[0] === '.octo-hud-clock' && b[0] === '.octo-hud-swift') continue; // the target is part of the clock
        if (ov(a[1], b[1])) hits.push(a[0] + ' x ' + b[0]);
      }
      check(`${tag}: nothing on the strip overlaps the buttons, the hotbar or each other`, hits.length === 0, hits.join('; '));
      check(`${tag}: the hotbar does not overlap the corner buttons`, !r.btns.some((b) => ov(b, r.hotbar)));
      check(`${tag}: a long run reads 59:5x and shells 14500`, /01:0[56]\.\d/.test(r.times) && /59:5\d\.\d/.test(r.times) && (await H(page)).shells === '14500', r.times);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hud-${tag}.png`) });
      await page.close();
    }
  } catch (e) {
    check('no exception', false, String(e && e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
