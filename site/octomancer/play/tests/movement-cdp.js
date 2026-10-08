// Node script (not part of tests/index.html): the movement test room inside the REAL game (?movetest=1), headless Chrome.
//   node movement-cdp.js [baseUrl] [shotDir]   baseUrl default http://127.0.0.1:60850/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// tests/movement.test.js swims the same room with the game's modules; this one goes through main.js itself (its step order,
// props, camera, render) by steering __octo.input once per frame and running the game's own loop with __octo.frames at a
// 30, 60 and 120 Hz display. The route is the room's json.tour, corner rests included (where the octopus used to stick
// until a dash). No dash is ever pressed.
const path = require('path');
const fs = require('fs');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:60850/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'movement-test.json'), 'utf8'));
    for (const hz of [60, 30, 120]) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errs.push('' + e));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
      await page.setViewport({ width: 1280, height: 720 });
      await page.evaluateOnNewDocument(SAVE);
      await page.goto(BASE + '?movetest=1&seed=1', { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 500));
      if (hz === 60) {
        const lv = await page.evaluate(() => { const l = __octo.level(); return { w: l.w, h: l.h, exitX: l.exitX, startX: l.startX, startY: l.startY, prompt: (l.prompts[0] || {}).title, stage: l.stage }; });
        check('?movetest=1 opens the 60x40 movement room, start at S, no way out', lv.w === 60 && lv.h === 40 && lv.startX === 4.5 && lv.startY === 6.5 && lv.exitX < 0, JSON.stringify(lv));
        check('the room greets with its own prompt', lv.prompt === 'Movement test room');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'movetest-start.png') });
      }
      const r = await page.evaluate((route, hz) => {
        const frameMs = 1000 / hz, speed = 5.5 / Math.SQRT2;
        const tiles = __octo.level().tiles, W = 60;
        const solid = (x, y) => tiles[Math.floor(y) * W + Math.floor(x)] !== 0;
        __octo.teleport(route[0][0], route[0][1]);
        let leg = 1, legFrames = 0, rest = 0, frames = 0, inRock = 0, worst = 0;
        const budget = (l) => (Math.hypot(route[l][0] - route[l - 1][0], route[l][1] - route[l - 1][1]) / (speed * 0.25) + 2) * hz;
        let b = budget(1);
        while (leg < route.length && frames < 200000) {
          const o = __octo.state().octopus;
          if (rest > 0) { __octo.input({ move: { x: 0, y: 0 }, dash: false }); rest--; if (rest === 0) { leg++; legFrames = 0; if (leg < route.length) b = budget(leg); } }
          else {
            const tx = route[leg][0] - o.x, ty = route[leg][1] - o.y, d = Math.hypot(tx, ty);
            if (d < 0.45) {
              if (route[leg][2]) rest = Math.round(route[leg][2] * hz);
              else { leg++; legFrames = 0; if (leg < route.length) b = budget(leg); }
              continue;
            }
            __octo.input({ move: { x: tx / d, y: ty / d }, dash: false });
            if (++legFrames > b) break;
          }
          __octo.frames(1, frameMs, true);
          frames++;
          const p = __octo.state().octopus;
          if (solid(p.x, p.y)) inRock++;
          if (p.dead) break;
        }
        const o = __octo.state().octopus;
        __octo.input(null);
        __octo.frames(0);
        return { done: leg >= route.length, leg, frames, inRock, at: [+o.x.toFixed(2), +o.y.toFixed(2)], dead: o.dead, steps: __octo.physSteps() };
      }, json.tour, hz);
      check(`in-game tour at ${hz} Hz: all ${json.tour.length} waypoints, corner rests included, no dash`, r.done, JSON.stringify(r));
      check(`in-game tour at ${hz} Hz: the octopus centre never inside rock`, r.inRock === 0 && !r.dead);
      if (SHOTS && hz === 60) await page.screenshot({ path: path.join(SHOTS, 'movetest-end.png') });
      await page.close();
    }
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('ran without throwing', false, String(e).slice(0, 300));
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})();
