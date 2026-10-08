// Node script (not part of tests/index.html): time pressure and the Swift Current bonus in real Chrome, at 1440x900 and
// 412x915, against a running copy of the game.
//   node timepressure-cdp.js [baseUrl] [shotDir]   baseUrl default http://127.0.0.1:60531/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check. With shotDir it
// saves the warning, the arrival and the bonus frames there (tp-<what>-<viewport>.png).
//
// Checks: the level banner carries the Swift Current target (m:ss); the hub never runs the clock; on 1-1 the warning starts
// at 2:00 (dark edge, distant eye, quiet toast) and the Beholder enters at 2:30 at least 15 tiles away and drifts in;
// reaching the whirlpool in time brings up a moon shell (toast, +50 shells when taken, the journal counts it); too late
// brings nothing.
const path = require('path');
const fs = require('fs');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:60531/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,helpDone:true,journal:[]}))}catch(e){}";
const VPS = [
  ['1440x900', { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ['412x915', { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  const open = async (vp, vn, q) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push(vn + ' ' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(vn + ' ' + m.text()); });
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(SAVE);
    await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
    await sleep(400);
    return page;
  };
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  // an open cell `r` tiles from (x, y) in some direction, with open neighbours (the octopus fits)
  const openNear = (page, x, y, rMin, rMax) => page.evaluate((x, y, rMin, rMax) => {
    const s = (tx, ty) => __octo.tileAt ? __octo.tileAt(tx, ty) !== 0 : false;
    for (let r = rMin; r <= rMax; r++) for (let a = 0; a < 16; a++) {
      const tx = Math.floor(x + Math.cos(a / 16 * Math.PI * 2) * r), ty = Math.floor(y + Math.sin(a / 16 * Math.PI * 2) * r);
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (s(tx + dx, ty + dy)) { ok = false; break; }
      if (ok) return { x: tx + 0.5, y: ty + 0.5 };
    }
    return null;
  }, x, y, rMin, rMax);
  try {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    for (const [vn, vp] of VPS) {
      // ---- the hub: no clock
      {
        const page = await open(vp, vn, '?at=hub&seed=11');
        await page.evaluate(() => { __octo.setLevelTime(400); });
        await sleep(1500);
        const tp = await page.evaluate(() => __octo.timePressure());
        check(`${vn} hub: no warning and no Beholder at 6:40 on the clock`, tp.safe && tp.warn.state === 0 && !tp.beholder && !tp.swift);
        await page.close();
      }
      // ---- 1-1: banner, warning, arrival
      {
        const page = await open(vp, vn, '?at=1&seed=11');
        const banner = await page.evaluate(() => __octo.hud().swift); // the target sits by the clock on the HUD strip (hud-strip.js) since 2026-10-08
        const tp0 = await page.evaluate(() => __octo.timePressure());
        check(`${vn} 1-1: the HUD strip shows the Swift Current target by the clock (${banner})`, /^\d:\d\d$/.test(banner) && tp0.swift && banner === Math.floor(tp0.swift.target / 60) + ':' + String(tp0.swift.target % 60).padStart(2, '0'));
        if (SHOTS) { await page.evaluate(() => __octo.frames(1, 16, true)); await shot(page, 'tp-banner-' + vn); await page.evaluate(() => __octo.frames(0)); }
        await page.evaluate(() => { __octo.god(true); __octo.setLevelTime(119); });
        await sleep(400);
        const before = await page.evaluate(() => __octo.timePressure());
        await sleep(1200);
        const warn = await page.evaluate(() => ({ tp: __octo.timePressure(), toast: (document.querySelector('.octo-toast') || {}).textContent || '' }));
        check(`${vn} 1-1: calm just before 2:00, the warning after it, with a quiet toast`, before.warn.state === 0 && warn.tp.warn.state === 1 && /cold/.test(warn.toast), `(${before.time.toFixed(1)} s: ${before.warn.state}, ${warn.tp.time.toFixed(1)} s: ${warn.tp.warn.state})`);
        await page.evaluate(() => { __octo.setLevelTime(141); });
        await sleep(300);
        await page.evaluate(() => __octo.frames(1, 16, true));
        await shot(page, 'tp-warning-' + vn);
        await page.evaluate(() => __octo.frames(0));
        await page.evaluate(() => { __octo.setLevelTime(149.8); });
        await sleep(600);
        const arr = await page.evaluate(() => { const t = __octo.timePressure(), o = __octo.state().octopus; return { t, o }; });
        const d0 = arr.t.beholder ? Math.hypot(arr.t.beholder.x - arr.o.x, arr.t.beholder.y - arr.o.y) : 0;
        check(`${vn} 1-1: the Beholder enters at 2:30, at least 15 tiles away (${d0.toFixed(1)})`, arr.t.beholder && d0 >= 15 && arr.t.warn.state === 2);
        // let it drift onto the screen: about 7 tiles at under 2 u/s
        await sleep(4500);
        const mid = await page.evaluate(() => { const t = __octo.timePressure(), o = __octo.state().octopus; return { t, o }; });
        const d1 = mid.t.beholder ? Math.hypot(mid.t.beholder.x - mid.o.x, mid.t.beholder.y - mid.o.y) : 0;
        check(`${vn} 1-1: it drifts in slowly (${d0.toFixed(1)} -> ${d1.toFixed(1)} tiles in ~4.5 s)`, d1 < d0 - 4 && d1 > d0 - 14 && !mid.o.dead);
        await page.evaluate(() => __octo.frames(1, 16, true));
        await shot(page, 'tp-arrival-' + vn);
        await page.evaluate(() => __octo.frames(0));
        await page.close();
      }
      // ---- 1-1: the Swift Current, in time and too late
      for (const late of [false, true]) {
        const page = await open(vp, vn, '?at=1&seed=23');
        const tp = await page.evaluate(() => __octo.timePressure());
        const spot = await openNear(page, tp.swift.exitX, tp.swift.exitY, 3, 4);
        const shells0 = await page.evaluate(() => __octo.level().run.shells);
        await page.evaluate((late, tg) => { __octo.god(true); if (late) __octo.setLevelTime(tg + 1); }, late, tp.swift.target);
        await page.evaluate((s) => __octo.teleport(s.x, s.y), spot);
        await sleep(500);
        const got = await page.evaluate(() => ({ tp: __octo.timePressure(), toast: (document.querySelector('.octo-toast') || {}).textContent || '' }));
        if (!late) {
          check(`${vn} swift: reaching the whirlpool in time brings up a moon shell with a quiet toast`, got.tp.swift.earned && got.tp.swift.shell && !got.tp.swift.shell.collected && /Swift Current/.test(got.toast), `(target ${tp.swift.target} s)`);
          await sleep(250);
          await page.evaluate(() => __octo.frames(1, 16, true));
          await shot(page, 'tp-bonus-' + vn);
          await page.evaluate(() => __octo.frames(0));
          const sh = got.tp.swift.shell;
          await page.evaluate((s) => __octo.teleport(s.x, s.y), sh);
          await sleep(400);
          const after = await page.evaluate(() => ({ tp: __octo.timePressure(), shells: __octo.level().run.shells, j: __octo.journal ? __octo.journal() : null }));
          check(`${vn} swift: taking the moon shell adds 50 shells`, after.tp.swift.shell.collected && after.shells - shells0 === 50, `(${shells0} -> ${after.shells})`);
          if (SHOTS) { await page.evaluate(() => __octo.frames(1, 16, true)); await shot(page, 'tp-bonus-taken-' + vn); await page.evaluate(() => __octo.frames(0)); }
        } else {
          check(`${vn} swift: too late, nothing comes up`, !got.tp.swift.earned && !got.tp.swift.shell);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
