// Node script (not part of tests/index.html): level transitions at phone size, memory and audio, against a running copy of the game.
//   node memory-cdp.js [baseUrl]            baseUrl default http://127.0.0.1:59611/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// Round 41: a transition used to leave the old level's renderer alive (a listener in v2-art.js held it), about 12 canvases
// and 50 MB per level, until a phone ran out of memory. This plays 10 consecutive transitions at 375x812, DPR 3 and checks that
// after a garbage collection the JS heap grows by less than 10% over the first transition's, the number of live canvases is flat
// and so are their bytes. It also checks that after a transition no synthesised sound source is left (only the music).
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59611/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
// every canvas the page makes, weakly: a collected one does not count
const TRACK = `(() => { const refs = []; window.__cv = refs; const oc = document.createElement.bind(document);
 document.createElement = function (t, o) { const e = oc(t, o); if (String(t).toLowerCase() === 'canvas') refs.push(new WeakRef(e)); return e; }; })();`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(SAVE);
    await page.evaluateOnNewDocument(TRACK);
    await page.goto(BASE + '?at=tutorial&seed=7', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo, { timeout: 30000 });
    await sleep(1500);
    const cdp = await page.target().createCDPSession();
    await cdp.send('Performance.enable');
    const snap = async () => {
      await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); await sleep(250);
      const heap = (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'JSHeapUsedSize').value;
      const cv = await page.evaluate(() => { let n = 0, bytes = 0; for (const r of window.__cv) { const c = r.deref(); if (c && c.width * c.height > 0) { n++; bytes += c.width * c.height * 4; } } return { n, bytes }; });
      return { heap, ...cv, mem: await page.evaluate(() => __octo.memory()) };
    };
    let afterSources = [];
    const go = async (ev) => {
      const ok = await page.evaluate((e) => __octo.runEvent(e), ev);
      await sleep(500);
      for (let k = 0; k < 60 && (await page.evaluate(() => __octo.level().transitioning)); k++) await sleep(100); // r44: until the screen is back (the warm-up frames take a while)
      afterSources = await page.evaluate(() => __octo.audioSources()); // taken before any step, so a drifting octopus has not started a whoosh yet
      await page.evaluate(() => __octo.step(30));
      await sleep(200);
      return ok;
    };
    // the sequence of events that moves between levels: tutorial -> hub -> 1-1 -> 1-2 -> 1-3 -> rest grotto -> end -> hub -> 1-1 ...
    const seq = ['exit', 'enter', 'exit', 'exit', 'exit', 'exit', 'continue', 'enter', 'exit', 'exit', 'exit', 'exit', 'continue', 'enter', 'exit', 'exit', 'exit', 'exit', 'continue', 'enter'];
    // warm-up: three transitions fill the page's lazy caches (art, fonts, the shared rock grain, code), then the base is taken
    check('the warm-up transitions run', (await go(seq[0])) && (await go(seq[1])) && (await go(seq[2])));
    const base = await snap();
    let n = 3, last = base, peakCanvases = base.n, peakBytes = base.bytes;
    const series = [base]; // r43: the canvas set differs from level to level (the hub, the tutorial and a cave need different cells), so growth is judged by the later transitions against the earlier ones, not against the first level
    for (let i = 3; i < 13; i++) {
      const ok = await go(seq[i]);
      if (!ok) check('transition ' + (i + 1) + ' (' + seq[i] + ') ran', false);
      n++;
      last = await snap();
      peakCanvases = Math.max(peakCanvases, last.n); peakBytes = Math.max(peakBytes, last.bytes);
      series.push(last);
    }
    const half = Math.floor(series.length / 2), early = series.slice(0, half), late = series.slice(half);
    const maxOf = (a, k) => Math.max(...a.map((x) => x[k]));
    const mb = (b) => (b / 1048576).toFixed(1);
    console.log(`  after 3 transitions (base): heap ${mb(base.heap)} MB, ${base.n} canvases, ${mb(base.bytes)} MB of canvas`);
    console.log(`  after ${n} transitions: heap ${mb(last.heap)} MB, ${last.n} canvases, ${mb(last.bytes)} MB of canvas (peak ${peakCanvases} canvases, ${mb(peakBytes)} MB)`);
    check('10 more transitions (13 in all) grow the JS heap by less than 10% (or 3 MB: the heap includes JIT code and performance entries, measured by heap snapshots)', last.heap < base.heap * 1.1 || last.heap - base.heap < 3 * 1048576, `${mb(base.heap)} -> ${mb(last.heap)} MB`);
    check('the live canvas count does not grow (the later transitions never exceed the earlier ones peak + 8: a level needs more or fewer cells)', maxOf(late, 'n') <= maxOf(early, 'n') + 8, `early peak ${maxOf(early, 'n')} -> late peak ${maxOf(late, 'n')}`);
    check('canvas bytes do not grow (the later peak within 25% of the earlier one) and stay under 30 MB', maxOf(late, 'bytes') <= maxOf(early, 'bytes') * 1.25 && peakBytes < 30 * 1048576, `early peak ${mb(maxOf(early, 'bytes'))} -> late peak ${mb(maxOf(late, 'bytes'))} MB`);
    check('canvases are baked at no more than 96 px per unit (DPR 3 is capped at 2)', await page.evaluate(() => { for (const r of window.__cv) { const c = r.deref(); if (c && c.width > 0 && c.width > 64 * 96 + 8) return false; } return true; }));
    check('the renderer reports a small canvas set (cells for the screen and a ring)', last.mem.rendererCanvases <= 30 && last.mem.rendererCanvasBytes < 20 * 1048576, JSON.stringify(last.mem));

    // --- audio: nothing synthesised survives a transition, only the music ---
    // r44: the next 'exit' must be a real transition (not the end screen, which tears nothing down); the sequence above ends in 1-1
    // (this check used to pass because the octopus stood still: no swim loop existed to be left behind)
    check('the sequence ends in Shallows 1-1', await page.evaluate(() => __octo.level().stage === 'Shallows 1-1'));
    await page.keyboard.press('KeyD'); // the first input starts the audio
    await sleep(400);
    await page.evaluate(() => { __octo.teleport(__octo.level().startX, __octo.level().startY); __octo.input({ move: { x: 1, y: 0.4 }, dash: true }); __octo.step(40); });
    check('the octopus really moved during the swim', await page.evaluate(() => Math.hypot(__octo.state().octopus.vx, __octo.state().octopus.vy) > 0.5));
    await page.evaluate(() => { __octo.sfx('dash'); __octo.sfx('bomb'); __octo.sfx('chime'); __octo.sfx('hurt'); });
    const before = await page.evaluate(() => __octo.audioSources());
    check('before the transition the swim whoosh and the effects make sources', before.filter((s) => s.kind !== 'music').length >= 4, JSON.stringify(before.map((s) => s.kind)));
    check('the swim loop exists once (deduped)', before.filter((s) => s.kind === 'swim').length <= 1);
    await page.evaluate(() => __octo.input(null));
    await go('exit');
    const after = afterSources;
    check('after a transition only the music sources remain', after.length > 0 ? after.every((s) => s.kind === 'music') : true, JSON.stringify(after));
    // a transition while moving and with a pending chime note
    await page.evaluate(() => { __octo.input({ move: { x: -1, y: 0.6 }, dash: true }); __octo.step(40); __octo.sfx('chime'); __octo.runEvent('exit'); });
    await sleep(520); // the fade is 320 ms: the old level is torn down by now
    const mid = await page.evaluate(() => __octo.audioSources());
    check('once the old level is torn down no synthesised source is alive', mid.every((s) => s.kind === 'music'), JSON.stringify(mid));
    await page.evaluate(() => __octo.input(null));
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally { await browser.close(); }
  process.exit(fails.length ? 1 : 0);
})();
