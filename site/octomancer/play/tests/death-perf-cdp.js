// Node script (not part of tests/index.html): frame time on the death screen and after many deaths, in real (headless) Chrome,
// at 1440x900 and 412x915, against a running copy of the game.
//   node death-perf-cdp.js [baseUrl]      baseUrl default http://127.0.0.1:59137/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// Daniel, 2026-10-08: "when I die, the performance tanks", "it actually got good after reloading", "going to the hub did not help".
// The death camera shows the bedrock beyond the level's side, and render.js filled it every frame with a pattern made from an
// ImageBitmap. On the game canvas Chrome executed each such fill by reading the canvas back to the CPU and writing it again
// (RasterImplementation::ReadbackImagePixels), and after about 100 of them it switched the game canvas to software rendering
// for good: every later frame was painted on the CPU (Blink Paint ~110 ms a frame at 1440x900), in the hub and every level, until a
// reload. The fill now uses one pre-composited tile canvas.
//
// Per viewport: the frame time of a live octopus right after the page loads; the death screen's (within 1.5x of it); then five
// death -> hub -> dive cycles, and the dive after them (within 1.2x of the fresh load). A Chrome trace of the death screen and of
// the last dive must show no GPU readbacks at all. The game's own requestAnimationFrame calls stay one per frame and the live
// canvases (after a garbage collection) do not grow from the first cycle to the last. A frame time is the quietest of four windows
// (other work on the machine stalls frames in bursts; the bug made every frame slow).
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59137/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
// counts the page's requestAnimationFrame calls, and keeps every canvas the page makes, weakly (a collected one does not count)
const HOOKS = `(() => { const raf = window.requestAnimationFrame.bind(window); window.__rafN = 0;
  window.requestAnimationFrame = (f) => { window.__rafN++; return raf(f); };
  const refs = []; window.__cv = refs; const oc = document.createElement.bind(document);
  document.createElement = function (t, o) { const e = oc(t, o); if (String(t).toLowerCase() === 'canvas') refs.push(new WeakRef(e)); return e; }; })();`;
const VPS = [
  ['1440x900', { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ['412x915', { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }],
];
const CYCLES = 5;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    for (const [vn, vp] of VPS) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errs.push(vn + ' ' + e));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(vn + ' ' + m.text()); });
      await page.setViewport(vp);
      await page.evaluateOnNewDocument(SAVE);
      await page.evaluateOnNewDocument(HOOKS);
      await page.goto(BASE + '?at=1&seed=7', { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
      await sleep(1500);
      const cdp = await page.target().createCDPSession();
      // frame times over `ms` (median, p95) and the game's rAF calls per frame (the sampler's own calls taken out)
      const window1 = (ms) => page.evaluate((ms) => new Promise((res) => {
        const t = []; let last = performance.now(); const end = last + ms; const r0 = window.__rafN;
        function f(now) { t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else { const n = t.length; t.sort((a, b) => a - b); res({ n, med: +t[n >> 1].toFixed(1), p95: +t[Math.floor(n * 0.95)].toFixed(1), rafPerFrame: +((window.__rafN - r0 - n) / n).toFixed(2) }); } }
        requestAnimationFrame(f);
      }), ms);
      // the quietest of several windows: other work on the machine (parallel test runs) stalls frames in bursts, while the
      // canvas this guards against (drawn on the CPU) is slow in every window
      const sample = async (ms) => {
        let best = null;
        for (let i = 0; i < 4; i++) { const s = await window1(ms / 2); if (!best || s.med < best.med) best = { ...s, rafPerFrame: Math.max(s.rafPerFrame, best ? best.rafPerFrame : 0) }; }
        return best;
      };
      const readbacks = async (ms) => {
        await page.tracing.start({ categories: ['gpu', 'devtools.timeline', 'disabled-by-default-devtools.timeline'] });
        await sleep(ms);
        const ev = JSON.parse(Buffer.from(await page.tracing.stop()).toString('utf8')).traceEvents;
        return {
          readbacks: ev.filter((e) => e.name === 'RasterImplementation::ReadbackImagePixels').length,
          paintMs: Math.round(ev.filter((e) => e.ph === 'X' && e.name === 'Paint').reduce((s, e) => s + e.dur, 0) / 1000),
        };
      };
      const canvases = async () => {
        await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); await sleep(250);
        return page.evaluate(() => { let n = 0, bytes = 0; for (const r of window.__cv) { const c = r.deref(); if (c && c.width * c.height > 0) { n++; bytes += c.width * c.height * 4; } } return { n, mb: +(bytes / 1048576).toFixed(1), game: __octo.memory().canvases }; });
      };
      const settle = async () => { await sleep(500); for (let k = 0; k < 100 && (await page.evaluate(() => __octo.level().transitioning)); k++) await sleep(100); await sleep(800); };
      const die = async (wait) => {
        await page.evaluate(() => __octo.kill('piranha', true));
        await page.waitForFunction(() => { const b = __octo.body(); return b && b.shown; }, { timeout: 8000 });
        await sleep(wait);
      };

      const fresh = await sample(3000);
      console.log(`  ${vn} alive, fresh load: ${JSON.stringify(fresh)}`);
      await die(1500); // the death screen has been up for a while (the old bug switched the canvas over ~100 frames after death)
      const panel = await sample(3000);
      const panelTrace = await readbacks(1500);
      console.log(`  ${vn} death screen: ${JSON.stringify(panel)} trace ${JSON.stringify(panelTrace)}`);
      check(`${vn}: the death screen runs at the alive frame time (median within 1.5x)`, panel.med <= fresh.med * 1.5, `(${panel.med} ms vs ${fresh.med} ms alive)`);
      check(`${vn}: no GPU readbacks on the death screen (a canvas drawn on the CPU)`, panelTrace.readbacks === 0, `(${panelTrace.readbacks} readbacks, ${panelTrace.paintMs} ms of Paint in 1.5 s)`);

      let first = null, last = null, hub = null;
      for (let i = 0; i < CYCLES; i++) {
        if (i > 0) await die(800);
        await page.evaluate(() => __octo.runEvent('death')); await settle(); // the death screen's "Back to the hub"
        if (i === CYCLES - 1) hub = await sample(2000);
        await page.evaluate(() => __octo.runEvent('enter')); await settle(); // and dive again
        const cv = await canvases();
        if (i === 0) first = cv;
        last = cv;
      }
      const after = await sample(3000);
      const afterTrace = await readbacks(1500);
      const stage = await page.evaluate(() => __octo.level().stage);
      console.log(`  ${vn} hub after ${CYCLES} deaths: ${JSON.stringify(hub)}; dive (${stage}): ${JSON.stringify(after)} trace ${JSON.stringify(afterTrace)}`);
      console.log(`  ${vn} live canvases after the first cycle ${JSON.stringify(first)}, after the last ${JSON.stringify(last)}`);
      check(`${vn}: after ${CYCLES} death -> hub -> dive cycles a dive runs as after a fresh load (median within 1.2x)`, after.med <= fresh.med * 1.2, `(${after.med} ms vs ${fresh.med} ms)`);
      check(`${vn}: the hub after ${CYCLES} deaths runs as after a fresh load (median within 1.2x)`, hub.med <= fresh.med * 1.2, `(${hub.med} ms)`);
      check(`${vn}: no GPU readbacks in the dive after ${CYCLES} deaths`, afterTrace.readbacks === 0, `(${afterTrace.readbacks} readbacks, ${afterTrace.paintMs} ms of Paint in 1.5 s)`);
      check(`${vn}: the game requests one animation frame per frame (fresh ${fresh.rafPerFrame}, death screen ${panel.rafPerFrame}, after ${CYCLES} deaths ${after.rafPerFrame})`,
        [fresh, panel, hub, after].every((s) => s.rafPerFrame <= 1.05));
      check(`${vn}: the live canvases do not grow from the first cycle to the last (${first.n} -> ${last.n}, ${first.mb} -> ${last.mb} MB)`, last.n <= first.n + 2 && last.mb <= first.mb * 1.15 + 1);
      await page.close();
    }
  } catch (e) { fails.push('threw ' + e); console.log('THREW', e); }
  await browser.close();
  check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})();
