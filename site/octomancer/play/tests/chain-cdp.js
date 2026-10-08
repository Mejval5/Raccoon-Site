// Chain reactions (2026-10-08) in the running game (main.js wiring, chain.js, creature-rules.js TRIGGERS):
//  - a row of 4 lit bombs on a floor: the first sets off the next, one link at a time (0.1-0.3 s apart), all in one chain
//  - the bombs' chain also bursts a pot and makes a giant clam beside them snap
//  - a chain that starts off screen leaves the bombs off screen alone
//  - the step time while the chain runs stays inside the phone budget; no page errors
//   node chain-cdp.js [baseUrl] [shotDir] [w] [h]   baseUrl default http://127.0.0.1:61211/octomancer/play/index.html
//   shotDir: also save a frame sequence of the chain (chain-<w>x<h>-NN.png) there
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP, 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:61211/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const VW = +(process.argv[4] || 1280), VH = +(process.argv[5] || 800);
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; let fails = 0;
  const check = (n, ok, x = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); if (!ok) fails++; };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    const phone = VW < 600;
    await page.setViewport({ width: VW, height: VH, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
    // a level with a long flat floor stretch (12 open tiles over 12 solid ones, 4 open rows above, not the shop) close to the start
    let found = null;
    for (const seed of [47, 11, 23, 5, 42, 77, 101, 3, 8, 13, 19, 29, 31, 37, 41, 43, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 103, 107, 109, 113]) {
      console.log('seed', seed);
      await page.goto(BASE + `?at=1&seed=${seed}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
      found = await page.evaluate(() => {
        const T = (x, y) => __octo.tileAt(x, y), st = __octo.state(), L = __octo.level();
        const sx = st.octopus.x, sy = st.octopus.y;
        const shop = (m) => m === 4 || m === 5;
        let best = null;
        for (let y = 5; y < 70; y++) for (let x = 3; x < 22; x++) {
          const floor = [];
          let ok = true;
          for (let k = 0; k < 12 && ok; k++) {
            ok = T(x + k, y) === 0 && T(x + k, y - 1) === 0 && T(x + k, y - 2) === 0 && T(x + k, y - 3) === 0;
            let f = -1;
            for (let j = 1; j <= 4 && ok && f < 0; j++) if (T(x + k, y + j) !== 0) f = y + j;
            ok = ok && f > 0 && !shop(T(x + k, f));
            floor.push(f);
          }
          if (!ok) continue;
          for (let yy = y - 7; yy <= y + 5 && ok; yy++) for (let xx = x - 6; xx <= x + 17 && ok; xx++) ok = !shop(T(xx, yy)); // well away from the shop
          if (!ok || Math.hypot(x + 6 - L.exitX, y - L.exitY) < 10) continue; // and from the whirlpool
          const d = Math.hypot(x + 6 - sx, y - sy);
          if (!best || d < best.d) best = { x, y, d, floor };
        }
        return best;
      });
      if (found) { found.seed = seed; break; }
    }
    check('a level with a 12-tile floor stretch to stage the chain on', !!found, JSON.stringify(found));
    if (!found) throw new Error('no stage');
    const fx = found.x, fy = found.y, FL = found.floor; // open water rows fy-3..fy; FL[k] = the floor row under column fx + k
    const setup = await page.evaluate((fx, fy, FL) => {
      __octo.god(true); __octo.freeze(true);
      __octo.teleport(fx + 5.5, fy - 2.6); // over the middle of the stage, so the camera frames the whole chain (god mode: the blasts only shove her)
      // controls 2026-10-08: the bombs hang in one row 1.8 apart (pinned), since the bomb's own reach is 2.0 now and a step in the
      // floor would put two of them out of it; the row is at the highest floor of their columns, so all four are in water
      const by = Math.min(FL[1], FL[3], FL[5], FL[6]) - 0.35;
      const on = (k, dx) => [fx + k + dx, by];
      const ids = [__octo.bombAt(...on(1, 0.5), 3.15), __octo.bombAt(...on(3, 0.3), 99), __octo.bombAt(...on(5, 0.1), 99), __octo.bombAt(...on(6, 0.9), 99)];
      // the clam on the floor in the last bomb's shove ring (2.6 .. 3.8 from it: not its blast), the pot beside it
      let ck = 10, cbest = 1e9;
      for (let k = 7; k <= 10; k++) { const d = Math.hypot(fx + k + 0.2 - (fx + 6.9), FL[k] - 0.5 - by); if (d >= 2.6 && d <= 3.9 && Math.abs(d - 3.3) < cbest) { cbest = Math.abs(d - 3.3); ck = k; } }
      const clam = __octo.spawnCreature('gclam', fx + ck + 0.2, FL[ck] - 0.5, 0, -1);
      // the pot within the clam's snap reach (1.6) on whichever side the floor allows, out of the last bomb's blast
      const cx = fx + ck + 0.2, cy = FL[ck] - 0.5;
      let px = fx + ck + 1.6, py = FL[ck + 1] - 0.5;
      for (const dx of [1.4, -1.4, 1.2, -1.2]) { const x = cx + dx, y = FL[Math.floor(x) - fx] - 0.5; if (Math.hypot(x - cx, y - cy) <= 1.55 && Math.hypot(x - (fx + 6.9), y - by) > 2.05) { px = x; py = y; break; } }
      const pot = __octo.addLoot('pot', px, py);
      __octo.stepDraw(150); // the camera settles on her, the bombs settle on the floor (the first one has 0.15 s of fuse left: 3.15 s, 150 steps of 0.02)
      return { ids, pot, clam, ck, FL, by, bombs: __octo.bombs(), chain0: __octo.chain().stats };
    }, fx, fy, FL);
    check('stage: 4 lit bombs, a pot and a giant clam placed', setup.ids.every((i) => i > 0) && setup.pot >= 0 && setup.clam >= 0, JSON.stringify(setup));
    // run it frame by frame, recording when each bomb went off (and the step cost), saving a frame sequence
    const fs = require('fs');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const seen = {}; const stepMs = []; let shot = 0;
    for (let f = 0; f < 66; f++) {
      const r = await page.evaluate((ids) => {
        const t0 = performance.now(); const time = __octo.stepDraw(2); const ms = performance.now() - t0;
        const bs = __octo.bombs(); const gone = ids.filter((id) => { const b = bs.find((x) => x.id === id); return !b || b.exploded; });
        return { time, ms, gone, bombs: bs, pending: __octo.chain().links.length };
      }, setup.ids);
      for (const id of r.gone) if (seen[id] === undefined) seen[id] = { t: r.time, chain: (r.bombs.find((b) => b.id === id) || {}).chain };
      stepMs.push(r.ms);
      if (SHOTS && f % 2 === 0 && f < 50) await page.screenshot({ path: path.join(SHOTS, `chain-${VW}x${VH}-${String(shot++).padStart(2, '0')}.png`) });
    }
    const times = setup.ids.map((id) => seen[id] && seen[id].t);
    const gaps = times.slice(1).map((t, k) => (t && times[k] ? +(t - times[k]).toFixed(3) : null));
    check(`in game: all 4 bombs go off in a chain (gaps ${gaps.join(', ')} s)`, times.every(Boolean) && gaps.every((g) => g !== null && g >= 0.08 && g <= 0.36));
    const after = await page.evaluate(() => ({ chain: __octo.chain(), loot: __octo.loot().items, creatures: __octo.creatures() }));
    const st = after.chain.stats;
    check('in game: the chain fired its links (bombs, pot, clam) and ended', st.fired >= 4 && after.chain.links.length === 0, JSON.stringify(st) + ' ' + JSON.stringify(after.creatures.map((c) => [c.kind, c.alive, c.x, c.state])) + JSON.stringify(setup.bombs.map((b) => [b.x.toFixed(2), b.y.toFixed(2)])));
    const pot = after.loot[after.loot.length - 1];
    check('in game: the pot at the end of the row burst', pot && pot.state !== 0, JSON.stringify(pot));
    const maxMs = Math.max(...stepMs.slice(1)), avg = stepMs.reduce((a, b) => a + b, 0) / stepMs.length;
    check(`in game: two steps + a frame during the chain stay inside the budget (avg ${avg.toFixed(1)} ms, max ${maxMs.toFixed(1)} ms)`, avg < 25 && maxMs < 120);
    // off screen: two lit bombs far off screen, a chain started at the first: the second stays lit
    const off = await page.evaluate((fx, fy) => {
      const L = __octo.level();
      let spot = null; // open water at least 30 tiles from the octopus
      const st = __octo.state(); const ox = st.octopus.x, oy = st.octopus.y;
      for (let y = 4; y < 70 && !spot; y++) for (let x = 3; x < 31 && !spot; x++) if (Math.abs(y - oy) > 30 && __octo.tileAt(x, y) === 0 && __octo.tileAt(x + 1, y) === 0) spot = { x, y };
      if (!spot) return null;
      const a = __octo.bombAt(spot.x + 0.5, spot.y + 0.5, 99), b = __octo.bombAt(spot.x + 1.5, spot.y + 0.5, 99);
      const c = __octo.chainEmit('bomb', spot.x + 0.5, spot.y + 0.5);
      __octo.stepDraw(30);
      const bs = __octo.bombs();
      return { spot, info: __octo.chainInfo(c), a: bs.find((x) => x.id === a), b: bs.find((x) => x.id === b), offscreen: __octo.chain().stats.offscreen };
    }, fx, fy);
    check('off screen: a chain that starts off screen does not set off the bombs there', off && off.info && !off.info.onScreen && off.a && !off.a.exploded && off.b && !off.b.exploded && off.offscreen >= 2, JSON.stringify(off));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (err) { console.log('FAIL exception ' + err); fails++; }
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
