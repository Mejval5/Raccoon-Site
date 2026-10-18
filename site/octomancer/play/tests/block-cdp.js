// Node script (not part of tests/index.html): pushing a block off a one-tile ledge in the REAL game (?movetest=1), headless Chrome.
//   node block-cdp.js [baseUrl] [shotDir]   baseUrl default http://127.0.0.1:60850/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// 2026-10-18 (Daniel: "moving the block jitters the camera"; "if you push it off a cliff it should stay in the grid"). The movement
// room's bottom area has a 7-wide rock shelf (x 40..46, top y 26) with open water to its right down to the floor (y 38). A block
// put on the shelf's right end (45.5) is pushed right by steering __octo.input once per 60 Hz frame through main.js's own loop:
//   - while it is pushed the camera (renderer camera, what is drawn) never moves back and never moves faster per frame than it does
//     following the octopus swimming freely at full speed in the same room (no jitter from the contact)
//   - the block slides at a steady speed, leaves the shelf, falls straight down column 47 and lands on the grid: x 47.5, bottom 38
//   - a hard landing plays the block thud (main.js blockLandingFx)
// With a shotDir: a 1440x900 frame strip of the push-off (block-strip.png, six frames) plus the single frames.
const path = require('path');
const fs = require('fs');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:60850/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const FRAME = 1000 / 60;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(SAVE);
    await page.goto(BASE + '?movetest=1&seed=1', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 500));

    // baseline: the camera's per-frame move following a free full-speed swim along the open bottom area (y 30, x 22 -> 40)
    const base = await page.evaluate((FRAME) => {
      __octo.teleport(22, 30);
      __octo.frames(30, FRAME, true);
      let last = null, max = 0;
      for (let f = 0; f < 200; f++) {
        const o = __octo.state().octopus;
        __octo.input({ move: { x: o.x < 40 ? 1 : 0, y: 0 }, dash: false });
        __octo.frames(1, FRAME, true);
        const c = __octo.state().camera.x;
        if (last !== null && f > 30) max = Math.max(max, Math.abs(c - last));
        last = c;
      }
      // ... and swimming at full speed into a wall (the pillar at x 43, y 28..31): the camera's look-ahead eases back
      __octo.teleport(33, 29.5);
      __octo.frames(30, FRAME, true);
      let wall = 0, hit = -1;
      last = null;
      for (let f = 0; f < 150; f++) {
        __octo.input({ move: { x: 1, y: 0 }, dash: false });
        __octo.frames(1, FRAME, true);
        const s = __octo.state(), c = s.camera.x;
        if (hit < 0 && f > 20 && s.octopus.vx < 1) hit = f;
        if (hit >= 0 && f < hit + 30 && last !== null) wall = Math.max(wall, Math.abs(c - last));
        last = c;
      }
      __octo.input({ move: { x: 0, y: 0 }, dash: false });
      return { max, wall, hit };
    }, FRAME);
    check('baseline: the camera follows a free swim', base.max > 0.02, JSON.stringify(base));

    // the push-off: block on the shelf's right end, octopus behind it, steer right until the block has dropped
    const setup = await page.evaluate((FRAME) => {
      const tiles = __octo.level().tiles, W = 60, solid = (x, y) => tiles[y * W + x] !== 0;
      const shelf = solid(45, 26) && solid(46, 26) && !solid(47, 26) && !solid(47, 25) && !solid(45, 25);
      let col = true; for (let y = 25; y < 38; y++) if (solid(47, y)) col = false;
      const i = __octo.addBlock(45.5, 25.5);
      __octo.teleport(42.6, 25.4);
      __octo.frames(40, FRAME, true); // the block settles, the camera arrives
      const b = __octo.props().find((p) => p.i === i);
      return { i, shelf, col, floor: solid(47, 38), bx: b.x, by: b.y, lands: __octo.blockLands() };
    }, FRAME);
    check('the movement room has the shelf (x 40..46, top 26) with open water down column 47 to the floor at 38', setup.shelf && setup.col && setup.floor, JSON.stringify(setup));
    check('the block rests on the shelf', Math.abs(setup.by + 0.47 - 26) < 0.02 && setup.bx === 45.5, JSON.stringify(setup));

    const shots = [];
    const run = async (n, steer) => page.evaluate((n, steer, i, FRAME) => {
      const rec = [];
      for (let f = 0; f < n; f++) {
        const b0 = __octo.props().find((p) => p.i === i);
        __octo.input({ move: steer === 'down' ? { x: 0.45, y: 1 } : { x: steer && b0.y < 26 ? 1 : 0, y: 0 }, dash: false });
        __octo.frames(1, FRAME, true);
        const s = __octo.state(), b = __octo.props().find((p) => p.i === i);
        rec.push({ cx: s.camera.x, cy: s.camera.y, ox: s.octopus.x, ovx: s.octopus.vx, bx: b.x, by: b.y, bvx: b.vx, bvy: b.vy, st: b.state });
      }
      return rec;
    }, n, steer, setup.i, FRAME);
    const rec = [];
    // six strip frames: approaching, pushing, at the edge, just dropped, falling straight, landed (the octopus swims down after it)
    const plan = [[20, true], [45, true], [38, true], [14, true], [40, false], [170, 'down']];
    for (let k = 0; k < plan.length; k++) {
      rec.push(...await run(plan[k][0], plan[k][1]));
      if (SHOTS) { const p = path.join(SHOTS, `block-push-${k + 1}.png`); await page.screenshot({ path: p }); shots.push(p); }
    }
    rec.push(...await run(200, false));

    // pushing: from the first frame the block moves until it leaves the shelf
    const start = rec.findIndex((r) => r.bvx > 0);
    const lost = rec.findIndex((r, k) => k > start && r.bvx === 0); // the frame it lost the shelf
    const off = rec.findIndex((r) => r.by > 25.6);
    if (process.env.DUMP) rec.slice(0, off + 10).forEach((r, k) => console.log(k, JSON.stringify(r)));
    // the contact itself slows the octopus from a full swim to the push speed: the camera eases its look-ahead back once, as it
    // does when the octopus swims into a wall; after that settle (0.5 s) it only moves forward, at most as fast as a free swim
    let back = 0, maxD = 0, maxBv = 0, minBv = 9, settle = 0;
    for (let f = start + 1; start >= 0 && f < lost; f++) {
      const d = rec[f].cx - rec[f - 1].cx;
      if (f < start + 30) { settle = Math.max(settle, Math.abs(d)); continue; }
      if (d < -1e-6) back++;
      maxD = Math.max(maxD, Math.abs(d));
      maxBv = Math.max(maxBv, rec[f].bvx); minBv = Math.min(minBv, rec[f].bvx);
    }
    check('the octopus pushes the block along the shelf', start >= 0 && lost > start + 30 && off > lost, `start ${start}, lost support ${lost}, off ${off}`);
    check('while pushing the block slides at a steady speed', maxBv - minBv < 1e-3 && maxBv > 1, `vx ${minBv.toFixed(3)}..${maxBv.toFixed(3)}`);
    check('while pushing the camera never moves back (no jitter)', back === 0, `${back} frames back`);
    check('while pushing the camera moves no faster per frame than following a free swim', maxD <= base.max + 1e-4, `${maxD.toFixed(4)} vs ${base.max.toFixed(4)}`);
    check('at contact the camera eases no harder than when the octopus swims into a wall', settle <= base.wall + 1e-4, `${settle.toFixed(4)} vs wall ${base.wall.toFixed(4)}`);
    const air = rec.filter((r, k) => k >= off && r.by < 37.5 - 0.01);
    const xs = new Set(air.map((r) => r.bx));
    check('off the shelf it falls straight down (one x in the air, no sideways speed)', air.length > 5 && xs.size === 1 && air.every((r) => r.bvx === 0), `${air.length} frames, x ${[...xs].join(',')}`);
    const end = rec[rec.length - 1];
    check('it lands in the next column, on the tile grid (x 47.5, bottom 38)', end.bx === 47.5 && Math.abs(end.by + 0.47 - 38) < 0.02, JSON.stringify(end));
    const lands = await page.evaluate(() => __octo.blockLands());
    check('the landing plays the block thud', lands === setup.lands + 1, `${setup.lands} -> ${lands}`);

    if (SHOTS) {
      const imgs = shots.map((p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'));
      const sp = await browser.newPage();
      await sp.setViewport({ width: 1440, height: 600 });
      await sp.setContent('<body style="margin:0;background:#000"><canvas id="c" width="1440" height="600"></canvas></body>');
      await sp.evaluate(async (imgs) => {
        const c = document.getElementById('c').getContext('2d');
        for (let k = 0; k < imgs.length; k++) {
          const im = new Image(); im.src = imgs[k]; await im.decode();
          c.drawImage(im, (k % 3) * 480, Math.floor(k / 3) * 300, 480, 300);
          c.fillStyle = '#fff'; c.font = '16px sans-serif'; c.fillText(String(k + 1), (k % 3) * 480 + 8, Math.floor(k / 3) * 300 + 20);
        }
      }, imgs);
      await sp.screenshot({ path: path.join(SHOTS, 'block-strip.png') });
      await sp.close();
    }
    await page.evaluate(() => { __octo.input(null); __octo.frames(0); });
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('ran without throwing', false, String(e).slice(0, 300));
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})();
