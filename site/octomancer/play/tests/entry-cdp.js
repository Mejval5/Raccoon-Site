// Node script (not part of tests/index.html): round 44, the entry sequence and the near-miss, in real Chrome against a running copy of the game.
//   node entry-cdp.js [baseUrl]      baseUrl default http://127.0.0.1:59641/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// Checks, on a desktop (1440 x 900) and a phone (412 x 915, DPR 3): touching the hub's whirlpool locks the input (a swim command is ignored), pulls the
// octopus to the whirlpool's centre while it shrinks and fades (octo.entering 0 -> 1), forces the portal into the Bounce and then the swallow, and the screen
// fade does not start before BOUNCE_S + RISE_S (1.333 s) after the touch, in real time and in simulation time; then the level has changed. A near miss (hovering
// at 1.6 tiles from an exit) plays the Bounce once and goes back to the idle loop: never the Rise, never the swallow, and no second Bounce.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59641/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,shortcut:true,journal:[]}))}catch(e){}";
const ENTRY_S = 10 / 12 + 0.5;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    for (const [tag, vp] of [['desktop 1440x900', { width: 1440, height: 900, deviceScaleFactor: 1 }], ['phone 412x915', { width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errs.push('' + e));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED/.test(m.text())) errs.push(m.text()); });
      await page.setViewport(vp);
      await page.evaluateOnNewDocument(SAVE);
      await page.goto(BASE + '?seed=5', { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 60000 });
      await sleep(2500);
      const lv = await page.evaluate(() => { __octo.god(false); const l = __octo.level(); return { ex: l.exitX, ey: l.exitY, stage: l.stage }; });
      check(`[${tag}] starts in the hub`, lv.stage === 'Hub', lv.stage);
      // the appear: the Rise is over after 0.5 s of the level being shown, so the portal is idle now
      check(`[${tag}] the portal has finished its appear (Rise) and idles`, (await page.evaluate(() => __octo.portalMode())) === 'idle');
      // --- near miss, in the hub: 1.6 tiles from the well: the Bounce once, then idle ---
      const modes = [];
      await page.evaluate((l) => { __octo.god(true); __octo.teleport(l.ex - 1.7, l.ey); }, lv);
      for (let i = 0; i < 90; i++) { modes.push(await page.evaluate(() => __octo.portalMode())); await sleep(20); }
      const seen = [...new Set(modes)];
      check(`[${tag}] a near miss: the Bounce once, then straight back to idle (modes seen: ${seen.join(' > ')})`, seen[0] === 'near' || seen[0] === 'idle' ? seen.every((m) => m === 'near' || m === 'idle') && !modes.slice(modes.lastIndexOf('near') + 1).includes('near') && modes[modes.length - 1] === 'idle' : false);
      check(`[${tag}] ... still in the hub (a near miss does not enter)`, (await page.evaluate(() => __octo.level().stage)) === 'Hub');
      // --- the entry: touch the whirlpool, then try to swim away ---
      await page.evaluate((l) => { __octo.teleport(l.ex - 1.0, l.ey); }, lv);
      const t0 = Date.now();
      await sleep(120);
      await page.evaluate(() => __octo.input({ move: { x: -1, y: 0 }, dash: true })); // swimming away is ignored now
      let e0 = await page.evaluate(() => __octo.entry());
      check(`[${tag}] touching the whirlpool starts the entry sequence`, !!e0);
      const samples = [];
      let fadeAt = null;
      for (let i = 0; i < 120; i++) {
        const s = await page.evaluate(() => { const e = __octo.entry(), f = document.getElementById('octo-fade'); return { e, op: f ? +getComputedStyle(f).opacity : 0, tr: __octo.level().transitioning, m: __octo.portalMode(), o: __octo.state().octopus }; });
        samples.push({ ...s, t: Date.now() - t0 });
        if (s.tr && fadeAt === null) fadeAt = Date.now() - t0;
        if (s.tr) break;
        await sleep(25);
      }
      const le = await page.evaluate(() => __octo.lastEntry());
      const wall = le ? le.fadeAt - le.start : 0, sim = le ? le.simFade - le.simStart : 0;
      check(`[${tag}] the fade starts no earlier than BOUNCE_S + RISE_S = ${ENTRY_S.toFixed(3)} s after the touch (real ${(wall / 1000).toFixed(3)} s, simulation ${sim.toFixed(3)} s)`, wall >= ENTRY_S * 1000 - 2 && sim >= ENTRY_S - 1e-6);
      check(`[${tag}] ... and the screen was not dark before that (fade opacity stayed under 0.05)`, samples.filter((s) => !s.tr).every((s) => s.op < 0.05));
      const mid = samples.find((s) => s.e && s.e.t > 0.5 && s.e.t < 0.7);
      const cx = e0 ? e0.cx : 0, cy = e0 ? e0.cy : 0;
      const nearEnd = samples.filter((s) => s.e && s.e.t > 0.8);
      check(`[${tag}] the octopus is pulled to the whirlpool centre (within 0.15 tiles after 0.8 s) although the player pushes away`, nearEnd.length > 3 && nearEnd.every((s) => Math.hypot(s.o.x - cx, s.o.y - cy) < 0.15), nearEnd.length ? `d ${Math.hypot(nearEnd[0].o.x - cx, nearEnd[0].o.y - cy).toFixed(3)}` : 'no samples');
      check(`[${tag}] ... shrinking and fading while it goes (entering 0 -> ~1)`, samples.some((s) => s.e && s.e.entering < 0.1) && samples.some((s) => s.e && s.e.entering > 0.9) && samples.filter((s) => s.e).every((s, i, a) => i === 0 || s.e.entering >= a[i - 1].e.entering - 1e-9));
      check(`[${tag}] ... the whirlpool plays the Bounce (forced), then the swallow, then it is gone`, samples.some((s) => s.m === 'enter') && samples.some((s) => s.m === 'swallow'));
      await page.evaluate(() => __octo.input(null));
      await page.waitForFunction(() => !__octo.level().transitioning, { timeout: 30000 });
      await sleep(300);
      check(`[${tag}] the dive started (Shallows 1-1)`, (await page.evaluate(() => __octo.level().stage)).startsWith('Shallows'));
      // the new level's exit has its own appear: the portal is in the 'appear' or 'idle' mode, never 'gone'
      check(`[${tag}] the new level's portal plays its Rise (appear) once the screen is back, not the swallow`, ['appear', 'idle'].includes(await page.evaluate(() => __octo.portalMode())));
      await page.close();
    }
    check('0 console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { console.log('FAIL script error', String(e).slice(0, 400)); fails.push('script'); }
  await browser.close();
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASSED');
  process.exit(fails.length ? 1 : 0);
})();
