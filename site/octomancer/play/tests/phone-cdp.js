// Node script (not part of tests/index.html): the phone transition freeze and off-screen culling (round 43), in real Chrome at the
// size and speed of a Samsung S24 (412 x 915, DPR 3, touch, 4x CPU throttle), against a running copy of the game.
//   node phone-cdp.js [baseUrl]      baseUrl default http://127.0.0.1:59641/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check, prints the numbers.
//
// Checks: 12 transitions (tutorial -> 1-1 -> 1-2 -> 1-3 -> end -> hub -> ...): live canvas memory stays under 30 MB (the game's own
// __octo.memory() AND every canvas the page ever made, counted from outside), no canvas is bigger than the viewport at the capped
// pixel ratio, a transition creates under 15 MB of new canvases, no main-thread task over 50 ms while one runs; then in a level:
// drawn entities well below total, and a culled piranha keeps patrolling and bites when the octopus comes back.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59641/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
// every canvas the page makes, weakly (a collected one does not count), plus the long tasks
const TRACK = `(() => { const refs = []; window.__cv = refs; window.__lt = [];
 const oc = document.createElement.bind(document);
 document.createElement = function (t, o) { const e = oc(t, o); if (String(t).toLowerCase() === 'canvas') refs.push(new WeakRef(e)); return e; };
 if (window.OffscreenCanvas) { const OC = window.OffscreenCanvas; window.OffscreenCanvas = function (w, h) { const c = new OC(w, h); refs.push(new WeakRef(c)); return c; }; window.OffscreenCanvas.prototype = OC.prototype; }
 try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} })();`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  const MB = 1048576;
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED/.test(m.text())) errs.push(m.text()); });
    await page.emulate({ viewport: { width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
    await page.evaluateOnNewDocument(SAVE);
    await page.evaluateOnNewDocument(TRACK);
    await page.goto(BASE + '?at=tutorial&seed=7', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo, { timeout: 30000 });
    await sleep(1500);
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const tracked = async () => {
      await cdp.send('HeapProfiler.collectGarbage'); await sleep(150);
      return page.evaluate(() => {
        let n = 0, bytes = 0, maxW = 0, maxH = 0, maxPx = 0;
        for (const r of window.__cv) { const c = r.deref(); if (c && c.width * c.height > 0) { n++; bytes += c.width * c.height * 4; if (c.width * c.height > maxPx) { maxPx = c.width * c.height; maxW = c.width; maxH = c.height; } } }
        return { n, bytes, maxW, maxH, maxPx };
      });
    };
    const budget = await page.evaluate(() => { const dpr = Math.min(window.devicePixelRatio, 1.5); return { w: Math.ceil(innerWidth * dpr), h: Math.ceil(innerHeight * dpr), dpr }; });
    console.log(`  viewport 412x915 at DPR 3: canvas budget ${budget.w}x${budget.h} px (DPR capped at ${budget.dpr})`);

    // --- transitions ---
    // the events that move between levels: tutorial -> 1-1 -> 1-2 -> 1-3 -> rest grotto -> (end screen, no transition) -> hub -> 1-1 ...; 'x' marks the end screen
    const seq = ['exit', 'exit', 'exit', 'exit', 'x', 'continue', 'enter', 'exit', 'exit', 'exit', 'x', 'continue', 'enter', 'exit', 'exit', 'exit', 'x', 'continue', 'enter'];
    const rows = [];
    let longTasks = [];
    const lateTasks = [];
    for (let i = 0; i < seq.length && rows.length < 12; i++) { // 12 transitions, the last one into a level
      if (seq[i] === 'x') { await page.evaluate(() => __octo.runEvent('exit')); await sleep(400); continue; } // clearing 1-3 shows the end screen
      const ev = seq[i];
      await page.evaluate(() => { window.__lt.length = 0; });
      const t0 = await page.evaluate(() => performance.now());
      const ok = await page.evaluate((e) => __octo.runEvent(e), ev);
      if (!ok) { check('transition ' + (rows.length + 1) + ' (' + ev + ') ran', false); continue; }
      // until the screen is back
      let waited = 0;
      while (waited < 15000) { await sleep(150); waited += 150; if (!(await page.evaluate(() => __octo.level().transitioning))) break; }
      await sleep(100); // the observer delivers entries a little late
      // only tasks that started after the event (a garbage collection this script forced after the last transition is not the game's)
      const dark = await page.evaluate(() => __octo.lastTransition());
      const allLts = (await page.evaluate(() => window.__lt.slice())).filter((x) => x[0] >= t0);
      const lts = allLts.filter((x) => dark && x[0] <= dark.end); // the transition proper: the event until the screen starts to fade in
      lateTasks.push(...allLts.filter((x) => dark && x[0] > dark.end && x[1] > 50)); // the fade-in (r44: judged below, until transitioning is false)
      const tr = await tracked();
      const mem = await page.evaluate(() => __octo.memory());
      rows.push({ i: rows.length + 1, ev, ms: waited, worst: lts.reduce((m, x) => Math.max(m, x[1]), 0), tracked: tr, mem });
      longTasks.push(...lts);
      console.log(`  #${rows.length} ${ev.padEnd(8)} dark ${String(waited).padStart(5)} ms | long tasks ${lts.length} worst ${Math.round(lts.reduce((m, x) => Math.max(m, x[1]), 0))} ms | memory(): ${mem.canvases} canvases ${mem.canvasMB} MB (shared ${mem.sharedMB}), pool ${mem.poolMB} MB, new ${mem.allocatedMB} MB | page: ${tr.n} canvases ${(tr.bytes / MB).toFixed(1)} MB, biggest ${tr.maxW}x${tr.maxH}`);
    }
    check('all 12 transitions ran', rows.length === 12);
    const peakReported = Math.max(...rows.map((r) => r.mem.canvasMB + r.mem.poolMB));
    const peakTracked = Math.max(...rows.map((r) => r.tracked.bytes / MB));
    const worstAlloc = Math.max(...rows.slice(1).map((r) => r.mem.allocatedMB));
    const worstTask = Math.max(0, ...longTasks.map((x) => x[1]));
    check('live canvas memory (in use + pooled) stays under 30 MB through 12 transitions (as reported by __octo.memory())', peakReported < 30, `peak ${peakReported.toFixed(1)} MB`);
    check('... and counted from outside, over every canvas the page made, after a GC', peakTracked < 30, `peak ${peakTracked.toFixed(1)} MB`);
    check('a transition creates under 15 MB of new canvases (the pool hands the last level\'s back)', worstAlloc < 15, `worst ${worstAlloc} MB`);
    check('no canvas is bigger than the viewport at the capped pixel ratio', rows.every((r) => r.tracked.maxPx <= budget.w * budget.h), `biggest ${Math.max(...rows.map((r) => r.tracked.maxPx))} px vs ${budget.w * budget.h}`);
    check('no main-thread task over 50 ms during a transition at 4x CPU throttle', worstTask <= 50, `worst ${Math.round(worstTask)} ms`);
    const worstLate = Math.max(0, ...lateTasks.map((x) => x[1]));
    console.log(`  tasks over 50 ms during the fade-in (until transitioning is false): ${lateTasks.length}, worst ${Math.round(worstLate)} ms`);
    check('no main-thread task over 50 ms during the fade-in either (transition start until transitioning is false)', worstLate <= 50, `worst ${Math.round(worstLate)} ms`);
    check('the screen is dark for under 2.5 s per transition', rows.every((r) => r.ms < 2500), `worst ${Math.max(...rows.map((r) => r.ms))} ms`);

    // --- in a level: frame time and culling ---
    let lv = await page.evaluate(() => __octo.level());
    for (let k = 0; k < 6 && !/Shallows 1-2|Shallows 1-1/.test(lv.stage); k++) { // get to a generated level
      await page.evaluate((e) => __octo.runEvent(e), lv.stage === 'Hub' ? 'enter' : 'exit'); await sleep(2800);
      lv = await page.evaluate(() => __octo.level());
    }
    for (let k = 0; k < 4 && lv.stage === 'Tutorial'; k++) { await page.evaluate(() => __octo.runEvent('exit')); await sleep(2800); lv = await page.evaluate(() => __octo.level()); }
    console.log('  playing in ' + lv.stage);
    check('the level the generator worker built equals the one the main thread generates for the same seed', (await page.evaluate(() => __octo.levelMatchesMainThread())) === true);
    // r44: really swim (input() reads move:{x,y} and dash), changing direction every 400 ms, so the wall cells bake while the camera moves
    const dirs = [[1, 1], [1, 0], [0, 1], [-1, 1], [1, -1], [-1, 0], [0, -1], [1, 1]];
    const p0 = await page.evaluate(() => { __octo.god(true); const o = __octo.state().octopus; return { x: o.x, y: o.y }; });
    let pathLen = 0, prev = p0;
    for (let k = 0; k < 15; k++) { // 6 s
      const d = dirs[k % dirs.length];
      await page.evaluate((d) => __octo.input({ move: { x: d[0], y: d[1] }, dash: true }), d);
      await sleep(400);
      const o = await page.evaluate(() => { const q = __octo.state().octopus; return { x: q.x, y: q.y }; });
      pathLen += Math.hypot(o.x - prev.x, o.y - prev.y); prev = o;
    }
    check('the octopus really swam while the frame time was measured (moved over 8 tiles in all)', pathLen > 8, `path ${pathLen.toFixed(1)} tiles`);
    const m = await page.evaluate(() => __octo.metrics());
    console.log(`  phone frame time (4x throttle, headless): median ${m.frameMsMedian.toFixed(1)} ms, p95 ${m.frameMsP95.toFixed(1)} ms`);
    await page.evaluate(() => __octo.input(null));
    const mem = await page.evaluate(() => __octo.memory());
    console.log(`  entities: ${mem.drawnEntities} drawn of ${mem.totalEntities}`);
    check('in a full level far fewer entities are drawn than exist', mem.totalEntities > 40 && mem.drawnEntities < mem.totalEntities * 0.5, `${mem.drawnEntities} of ${mem.totalEntities}`);

    // --- a culled piranha keeps patrolling and bites ---
    await page.evaluate(() => { __octo.god(false); });
    lv = await page.evaluate(() => __octo.level());
    const st = await page.evaluate(() => __octo.state());
    // an open 7 x 3 patch of water 10.6..15 tiles to the side of the camera (beyond 1.1 x the half-width plus the piranha's reach) at about the camera's height
    const spot = await page.evaluate(() => {
      const l = __octo.level(), s = __octo.state(), W = l.w, t = l.tiles;
      const open = (x, y) => x >= 0 && y >= 0 && x < W && y < l.h && t[y * W + x] === 0;
      const cx = s.camera.x, cy = s.camera.y;
      let best = null;
      for (let y = Math.max(3, Math.floor(cy) - 3); y <= Math.floor(cy) + 3; y++) {
        for (let x = 4; x < W - 4; x++) {
          const dx = Math.abs(x + 0.5 - cx);
          if (dx < 10.6 || dx > 15) continue;
          let ok = true;
          for (let yy = -1; yy <= 1 && ok; yy++) for (let xx = -3; xx <= 3; xx++) if (!open(x + xx, y + yy)) { ok = false; break; }
          if (ok) { best = { x: x + 0.5, y: y + 0.5, dx }; break; }
        }
        if (best) break;
      }
      return best;
    });
    if (!spot) { console.log('  (no open water 10.6-15 tiles beside the camera here; the piranha check is skipped)'); }
    else {
      await page.evaluate((sp) => { __octo.god(true); __octo.spawn('piranha', sp.x, sp.y, 'open', 0); }, spot);
      await sleep(400);
      let e0 = await page.evaluate(() => __octo.enemies().filter((e) => e.kind === 'piranha').pop());
      check('the far piranha is not drawn (culled)', e0 && e0.drawn === false, e0 ? `at ${e0.x.toFixed(1)},${e0.y.toFixed(1)}` : 'not found');
      const id = e0.id;
      await page.evaluate(() => __octo.step(150)); // 3 s of simulation with the octopus where it is
      await sleep(300);
      const e1 = await page.evaluate((i) => __octo.enemies().find((e) => e.id === i), id);
      check('... but it keeps patrolling: its position changed while it was culled', e1 && Math.hypot(e1.x - e0.x, e1.y - e0.y) > 0.2 && e1.drawn === false, e1 ? `moved ${Math.hypot(e1.x - e0.x, e1.y - e0.y).toFixed(2)} tiles` : '');
      // the octopus comes back into view: it is drawn again, and it bites
      const hearts0 = await page.evaluate(() => { const s = __octo.state(); return s.octopus.hearts; });
      // r44: in front of its nose as it is NOW (it patrols and turns, so the position sampled a moment ago can be behind it or in rock)
      const front = await page.evaluate((i) => { const e = __octo.enemies().find((x) => x.id === i); const l = __octo.level(); const open = (x, y) => l.tiles[Math.floor(y) * l.w + Math.floor(x)] === 0; const dx = open(e.x + e.dir * 2.2, e.y) ? e.dir : -e.dir; __octo.god(false); __octo.teleport(e.x + dx * 2.2, e.y); return dx; }, id);
      await sleep(300);
      const e2 = await page.evaluate((i) => __octo.enemies().find((e) => e.id === i), id);
      check('... it is drawn again once the octopus is near', e2 && e2.drawn === true);
      let hurt = false;
      for (let k = 0; k < 12 && !hurt; k++) {
        // keep the octopus in the piranha's lane while it is still patrolling or winding up (the octopus sinks, and the piranha turns)
        await page.evaluate((i) => { const e = __octo.enemies().find((x) => x.id === i); if (e && e.st < 2) { const l = __octo.level(); const o = (x, y) => l.tiles[Math.floor(y) * l.w + Math.floor(x)] === 0; const dx = o(e.x + e.dir * 2.2, e.y) ? e.dir : -e.dir; __octo.teleport(e.x + dx * 2.2, e.y); } }, id);
        await page.evaluate(() => __octo.step(25));
        const h = await page.evaluate(() => __octo.state().octopus.hearts);
        hurt = h < hearts0;
      }
      if (!hurt) console.log('  debug', JSON.stringify(await page.evaluate((i) => ({ e: __octo.enemies().find((x) => x.id === i), o: __octo.state().octopus, tele: null }), id)), JSON.stringify(e1));
      check('... and it still hits the octopus', hurt);
    }

    check('0 console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { console.log('FAIL script error', String(e).slice(0, 300)); fails.push('script'); }
  await browser.close();
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASSED');
  process.exit(fails.length ? 1 : 0);
})();
