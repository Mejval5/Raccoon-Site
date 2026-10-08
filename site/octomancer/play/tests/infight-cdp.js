// Enemy infighting in the running game (Spelunky style: creatures ignore each other except a few rules, see js/infight.js):
// feeding frenzy, a cannon shot hitting what is in the way, a lure, and no touch damage. Captures frame sequences too.
//   node infight-cdp.js [baseUrl] [shotDir]    baseUrl default http://127.0.0.1:61310/octomancer/play/index.html
const path = require('path');
const fs = require('fs');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP, 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:61310/octomancer/play/index.html';
const SHOTS = process.argv[3] || 'D:\\Projects\\Raccoon-Site\\.claude\\worktrees\\agent-a2774ea72c52d9085\\octomancer-web\\night';
const VIEWS = [{ tag: 'desktop', w: 1280, h: 800, vert: false }, { tag: '412', w: 412, h: 915, vert: true }];
const SEED = 3;
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; let fails = 0;
  const check = (n, ok, x = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); if (!ok) fails++; };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });

    // helpers living in the page (water is tile 0)
    const pageHelpers = () => {
      window.__W = (x, y) => __octo.tileAt(Math.floor(x), Math.floor(y)) === 0;
      window.__box = (x0, y0, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!__W(x0 + i, y0 + j)) return false; return true; };
      window.__clearLine = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4); for (let k = 0; k <= n; k++) { const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; for (const [ox, oy] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) if (!__W(x + ox, y + oy)) return false; } return true; };
      window.__quiet = (x, y, d) => !window.__bodies0.some((b) => Math.hypot(b.x - x, b.y - y) < d); // no native creature near (they would join in)
    };
    async function load(view) {
      await page.setViewport({ width: view.w, height: view.h, deviceScaleFactor: 1 });
      await page.goto(BASE + `?at=1&seed=${SEED}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); __octo.stepDraw(300); window.__bodies0 = __octo.damageBodies(); });
      await page.evaluate(pageHelpers);
    }
    const shot = (prefix, tag, n) => page.screenshot({ path: path.join(SHOTS, `infight-${prefix}-${tag}-${n}.png`) });
    const step = (n) => page.evaluate((c) => __octo.stepDraw(c), n);

    // open water: a 7x5 box (centre cx, cy) and a spot for the octopus 9 tiles away (beyond the 6 tile notice range), her 3x3 free.
    // u = unit vector from her to the box.
    const findWater = (vert) => page.evaluate((vert) => {
      const L = __octo.level();
      for (let cy = 6; cy < L.h - 8; cy++) for (let cx = 6; cx < L.w - 8; cx++) {
        if (!(vert ? __box(cx - 2, cy - 3, 5, 7) : __box(cx - 3, cy - 2, 7, 5))) continue;
        for (const sgn of [-1, 1]) {
          const ux = vert ? 0 : -sgn, uy = vert ? -sgn : 0; // octopus at box - u*9
          for (const dist of (vert ? [7.5, 8, 7] : [9, 8.5, 9.5, 10])) { // the phone is tall: nearer, or the school hides under the title banner
            const ox = cx + 0.5 - ux * dist, oy = cy + 0.5 - uy * dist;
            if (!__box(Math.floor(ox) - 1, Math.floor(oy) - 1, 3, 3) || !__quiet(cx, cy, 6) || !__quiet(ox, oy, 6.5)) continue;
            return { ox, oy, cx: cx + 0.5, cy: cy + 0.5, ux, uy };
          }
        }
      }
      return null;
    }, vert);
    // cannon: a floor cell with water above and a clear diagonal line to a spot 4 up and 4 to a side
    const findCannon = () => page.evaluate(() => {
      const L = __octo.level();
      for (let cy = 8; cy < L.h - 8; cy++) for (let cx = 6; cx < L.w - 10; cx++) {
        if (!__W(cx, cy) || __W(cx, cy + 1)) continue;
        for (const s of [1, -1]) {
          const ox = cx + 0.5 + s * 4, oy = cy + 0.45 - 4;
          if (!__box(Math.floor(ox) - 1, Math.floor(oy) - 1, 3, 3) || !__clearLine(cx + 0.5, cy + 0.2, ox, oy)) continue;
          if (!__box(cx - 1, cy - 1, 3, 2) || !__quiet(cx, cy, 10)) continue;
          return { cx: cx + 0.5, cy: cy + 0.45, ox, oy, s };
        }
      }
      return null;
    });
    // a floor strip: 3 water cells wide on top of rock, water 2 high above it; the octopus 7.5-10 tiles away somewhere (her 3x3 free)
    const findFloor = () => page.evaluate(() => {
      const L = __octo.level();
      for (let cy = 8; cy < L.h - 8; cy++) for (let cx = 3; cx < L.w - 3; cx++) {
        let ok = __box(cx - 1, cy - 2, 3, 3);
        for (let i = -1; i <= 1 && ok; i++) if (__W(cx + i, cy + 1)) ok = false;
        if (!ok || !__quiet(cx, cy, 5)) continue;
        for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
          const d = Math.hypot(dx, dy);
          if (d < 7.5 || d > 10) continue;
          const ox = cx + dx, oy = cy + dy;
          if (ox < 2 || ox > L.w - 2 || oy < 3 || oy > L.h - 3) continue;
          if (__box(ox - 1, oy - 1, 3, 3) && __quiet(ox, oy, 6.5)) return { cx: cx + 0.5, cy: cy + 0.45, ox: ox + 0.5, oy: oy + 0.5 };
        }
      }
      return null;
    });

    // ================= 1. feeding frenzy (+ frames). A bleeding victim swims on at 1.5 u/s and a lunge is a straight line at where it was,
    // so a bite can miss; the school gets up to 4 fresh tries (reload, different patrol phase) of 7 s each before the check fails.
    const LAYOUTS = [[[-1.5, -0.5], [0, 0.5], [1.5, -0.3]], [[-0.5, 0.3], [1.0, -0.4], [2.0, 0.5]], [[0.8, -0.5], [2.1, 0.1], [3.4, -0.5]], [[1.5, 0], [2.5, 0.6], [3, -0.6]]];
    for (const view of VIEWS) {
      let ok = false, sc = null, tries = 0, lastInfo = '';
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        tries++;
        await load(view);
        sc = await findWater(view.vert);
        if (!sc) break;
        await page.evaluate((s, attempt, LAYOUTS) => {
          __octo.teleport(s.ox, s.oy);
          __octo.stepDraw(2);
          // three piranhas, in the far half of the box (away from her), so she is out of their 6 tile notice range
          const px = -s.uy, py = s.ux; // perpendicular
          window.__ids = LAYOUTS[attempt].map(([a, b]) => __octo.spawn('piranha', s.cx + s.ux * a + px * b, s.cy + s.uy * a + py * b, 'open').id);
          __octo.stepDraw(1);
        }, sc, attempt, LAYOUTS);
        const pir = await page.evaluate(() => __octo.damageBodies().filter((b) => window.__ids.includes(b.id)));
        if (pir.length < 3) { lastInfo = 'spawned ' + pir.length; break; }
        const victim = pir[1]; // damageBodies lists in spawn order: the middle one
        const dmg = await page.evaluate((v) => __octo.damageHit('enemy', v.i, 'ink', 4), victim);
        const h0 = await page.evaluate(() => __octo.infight().hits);
        const w0 = await page.evaluate((id) => __octo.damageBodies().find((x) => x.id === id).wound, victim.id);
        await shot('frenzy', view.tag, 1);
        let died = false, n = 1, firstHit = -1;
        for (let s = 0; s < 420 && !died; s += 6) {
          await step(6);
          const st = await page.evaluate((id) => ({ gone: !__octo.damageBodies().some((x) => x.id === id), hits: __octo.infight().hits }), victim.id);
          if (firstHit < 0 && st.hits > h0) firstHit = s;
          died = st.gone;
          if (firstHit >= 0 && n < 6 && (s - firstHit) % 12 === 0) { n++; await shot('frenzy', view.tag, n); } // frames from the first bite on
        }
        while (n < 6) { await step(8); n++; await shot('frenzy', view.tag, n); }
        const h1 = await page.evaluate(() => __octo.infight().hits);
        lastInfo = `victim id ${victim.id} (ink ${dmg}, wound ${w0}), first bite at step ${firstHit}, hits ${h0} -> ${h1}`;
        console.log(`  [${view.tag}] try ${tries}: ${lastInfo}${died ? ' - killed' : ' - survived 7 s'}`);
        if (died) { ok = true; check(`[${view.tag}] frenzy: infight hits grew`, h1 > h0, lastInfo); }
      }
      check(`[${view.tag}] frenzy: found open water ~9 tiles from a spot for the octopus`, !!sc, JSON.stringify(sc));
      check(`[${view.tag}] frenzy: the wounded piranha is killed by its school (try ${tries} of 4)`, ok, lastInfo);
      if (!ok) continue;
      // a fresh corpse in the box is bitten away
      const ci = await page.evaluate((s) => { const i = __octo.addCorpse('piranha', s.cx + s.ux * 1.5, s.cy + s.uy * 1.5, 0, 0, 1); __octo.stepDraw(1); return i; }, sc);
      const c0 = await page.evaluate(() => __octo.corpses().length);
      let eaten = false;
      for (let s = 0; s < 600 && !eaten; s += 20) {
        await step(20);
        eaten = await page.evaluate((ci) => !__octo.corpses().some((c) => c.i === ci), ci);
      }
      const left = await page.evaluate(() => ({ corpses: __octo.corpses().length, hits: __octo.infight().hits }));
      check(`[${view.tag}] frenzy: a fresh corpse is bitten away (${c0} -> ${left.corpses})`, eaten, JSON.stringify(left));
    }

    // ================= 2. cannon shot hits another creature (+ frames)
    for (const view of VIEWS) {
      await load(view);
      const sc = await findCannon();
      check(`[${view.tag}] cannon: found a floor cell with a clear diagonal line to the octopus`, !!sc, JSON.stringify(sc));
      if (!sc) continue;
      await page.evaluate((s) => {
        __octo.teleport(s.ox, s.oy);
        __octo.stepDraw(1);
        __octo.spawn('cannon', s.cx, s.cy, 'floor');
        __octo.stepDraw(1);
      }, sc);
      // wait for the shot; a piranha then swims into its line ahead of it (a free piranha would not hold still on the line)
      let fired = false;
      for (let s = 0; s < 600 && !fired; s += 3) { await step(3); fired = await page.evaluate(() => __octo.shots().length > 0); }
      check(`[${view.tag}] cannon: it fired at the octopus`, fired);
      if (!fired) continue;
      const midId = await page.evaluate(() => {
        const sh = __octo.shots()[0], sp = Math.hypot(sh.vx, sh.vy);
        const e = __octo.spawn('piranha', sh.x + sh.vx / sp * 2.0, sh.y + sh.vy / sp * 2.0, 'open');
        __octo.stepDraw(1);
        return e.id;
      });
      const h0 = await page.evaluate(() => __octo.infight().hits);
      await shot('cannon', view.tag, 1);
      let hit = false, n = 1, info = '';
      for (let s = 0; s < 150 && !hit; s += 4) {
        await step(4);
        const st = await page.evaluate((id) => {
          const b = __octo.damageBodies().find((x) => x.id === id);
          return { shots: __octo.shots().length, gone: !b, wound: b ? b.wound : -1, hits: __octo.infight().hits, corpses: __octo.corpses().length };
        }, midId);
        if (n < 6) { n++; await shot('cannon', view.tag, n); }
        if (st.gone || st.wound === 1 || st.hits > h0) { hit = true; info = JSON.stringify(st); }
      }
      while (n < 6) { await step(4); n++; await shot('cannon', view.tag, n); }
      check(`[${view.tag}] cannon: the shot hit the creature in between (died or wounded, infight hits grew)`, hit, info);
    }

    // ================= 3. lure, 4. no touch damage (desktop scene)
    await load(VIEWS[0]);
    {
      const sc = await findWater(false);
      check('lure: found open water', !!sc);
      if (sc) {
        // a patrolling piranha in the box; the lure 4.5 tiles from it, further from her (she is 7.5+ tiles away)
        const lure = await page.evaluate((s) => {
          __octo.teleport(s.ox, s.oy); __octo.stepDraw(2);
          const px = s.cx + s.ux * 3, py = s.cy + s.uy * 3; // the far end of the box (away from her)
          window.__lp = __octo.spawn('piranha', s.cx - s.ux * 1.5, s.cy - s.uy * 1.5, 'open').id; // 4.5 tiles from the lure
          window.__lure = { x: px, y: py };
          __octo.stepDraw(1);
          return window.__lure;
        }, sc);
        const dist0 = await page.evaluate(() => { const e = __octo.enemies().find((x) => x.id === window.__lp); return Math.hypot(e.x - __lure.x, e.y - __lure.y); });
        const slot = await page.evaluate(() => __octo.setLure(__lure.x, __lure.y, 10, Infinity));
        check('lure: set (slot >= 0) and listed', slot >= 0 && (await page.evaluate(() => __octo.lures().length)) === 1, 'slot ' + slot);
        await step(360);
        const d1 = await page.evaluate(() => { const e = __octo.enemies().find((x) => x.id === window.__lp); return e ? Math.hypot(e.x - __lure.x, e.y - __lure.y) : -1; });
        check(`lure: the patrolling piranha swims to it and hovers (${dist0.toFixed(1)} -> ${d1.toFixed(1)} tiles)`, d1 >= 0 && d1 <= 1.5);
        await page.evaluate(() => __octo.clearLure());
        check('lure: clearLure() empties lures()', (await page.evaluate(() => __octo.lures().length)) === 0);
      }
    }
    await load(VIEWS[0]);
    {
      const sc = await findFloor();
      check('no touch damage: found a floor strip', !!sc, JSON.stringify(sc));
      if (sc) {
        await page.evaluate((s) => {
          __octo.teleport(s.ox, s.oy); __octo.stepDraw(2);
          const a = __octo.spawn('crab', s.cx - 1.0, s.cy, 'floor').id, b = __octo.spawn('urchin', s.cx + 1.0, s.cy, 'floor').id;
          const c = __octo.spawn('piranha', s.cx, s.cy - 1.2, 'open').id;
          __octo.stepDraw(1);
          window.__ids = [a, b, c];
          window.__h0 = __octo.infight().hits;
        }, sc);
        await step(300); // 5 s
        const r = await page.evaluate(() => ({ b: __octo.damageBodies().filter((x) => window.__ids.includes(x.id)).map((x) => x.kind + ':' + x.wound), hits: __octo.infight().hits - window.__h0 }));
        check('no touch damage: after 5 s crab, urchin and piranha are all alive and unwounded, no infight hits', r.b.length === 3 && r.b.every((s) => /:0$/.test(s)) && r.hits === 0, JSON.stringify(r));
      }
    }
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (err) { console.log('FAIL exception ' + (err && err.stack || err)); fails++; }
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
