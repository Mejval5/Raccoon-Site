// Node script (not part of tests/index.html): the destructible shop, theft, Spelunky aggro and the brutal shopkeeper in
// the running game, through the real input, octopus, props and keeper code. Optionally saves frame-by-frame screenshots.
//   node shop-cdp.js [baseUrl] [shotDir]
//   baseUrl default http://127.0.0.1:59841/octomancer/play/index.html; shotDir: write shop-*.png there (desktop 1440x900, phone 412x915)
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59841/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const VPS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  let seed = 0;
  async function open(vp, url) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED/.test(m.text())) errs.push(m.text()); });
    await page.setViewport(VPS[vp]);
    await page.evaluateOnNewDocument(SAVE);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
    return page;
  }
  const waitLevel = (page) => page.waitForFunction(() => !__octo.level().transitioning, { timeout: 30000 });
  try {
    // a dive seed whose Shallows 1-1 has a shop and whose 1-2 has a keeper waiting by the exit once the run is angry
    {
      const page = await open('desktop', BASE + '?at=1&seed=3');
      seed = await page.evaluate(async () => {
        const L = await import('./js/level.js'), K = await import('./js/shopkeeper.js');
        for (let s = 2; s < 400; s++) if (L.generateLevel(s, 0).shop && K.exitGuardWaits(s, 1)) return s;
        return 0;
      });
      await page.close();
      check('a dive seed with a shop on 1-1 and a guard on 1-2 was found', seed > 0, 'seed ' + seed);
    }
    for (const vp of SHOTS ? ['desktop', 'phone'] : ['desktop']) {
      const page = await open(vp, BASE + `?at=1&seed=${seed}`);
      let frame = 0;
      const shot = async (tag) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shop-${tag}-${vp}-${String(frame++).padStart(2, '0')}.png`) }); };
      await page.evaluate(() => { __octo.god(false); __octo.freeze(true); });
      const sh = await page.evaluate(() => __octo.extras().shop);
      const k0 = await page.evaluate(() => __octo.keepers().list);
      check(`${vp}: the shop keeper starts calm behind his counter`, k0.length === 1 && k0[0].mode === 'calm' && sh.keeperCalm === true);
      // swim in from the left of the first pedestal and let the camera settle
      const W = 1, px = sh.px[W * 2], py = sh.px[W * 2 + 1]; // the middle ware, approached from the left
      for (let n = 0; n < 40; n++) await page.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, px - 2, py - 0.1);
      await shot('theft');
      // ---- theft: a dash knocks the ware off the pedestal, the octopus grabs it without paying ----
      await page.evaluate(() => __octo.input({ move: { x: 1, y: 0 }, dash: false, bomb: false, pause: false }));
      for (let n = 0; n < 12; n++) { await page.evaluate((x, y) => { __octo.stepDraw(1); __octo.teleport(x, y); }, px - 2, py - 0.1); if (n % 4 === 3) await shot('theft'); } // turns to face it
      await page.evaluate(() => __octo.input({ move: { x: 1, y: 0 }, dash: true, bomb: false, pause: false }));
      await page.evaluate(() => __octo.stepDraw(1));
      await page.evaluate(() => __octo.input({ move: { x: 0, y: 0 }, dash: false, bomb: false, pause: false }));
      let knocked = false;
      for (let f = 0; f < 10; f++) {
        await page.evaluate(() => __octo.stepDraw(3));
        await shot('theft');
        const e = await page.evaluate(() => __octo.extras().shop);
        if (e.ware[W] === 1) knocked = true;
      }
      const afterKnock = await page.evaluate(() => ({ shop: __octo.extras().shop, shells: __octo.extras().shells, aggro: __octo.extras().shopAggro }));
      check(`${vp}: a dash knocks the middle ware off its pedestal, nothing is paid, nobody is angry yet`, knocked && afterKnock.shop.sold[W] === 0 && afterKnock.aggro.on === false);
      // swim to the loose ware with the real input
      let stolen = false;
      for (let f = 0; f < 60 && !stolen; f++) {
        stolen = await page.evaluate((W) => {
          const e = __octo.extras(), pid = e.shop.pid[W], o = __octo.state().octopus;
          const p = __octo.props().find((q) => q.i === pid);
          if (p) { const dx = p.x - o.x, dy = p.y - o.y, l = Math.hypot(dx, dy) || 1; __octo.input({ move: { x: dx / l, y: dy / l }, dash: false, bomb: false, pause: false }); }
          __octo.stepDraw(2);
          return __octo.extras().shopAggro.on;
        }, W);
        if (f % 3 === 0 || stolen) await shot('theft');
      }
      const ag = await page.evaluate(() => ({ a: __octo.extras().shopAggro, k: __octo.keepers().list[0], shop: __octo.extras().shop, shells: __octo.extras().shells }));
      check(`${vp}: picking the loose ware up without paying is theft: the keepers are angry`, stolen && ag.a.why === 'theft' && ag.shop.stolen === 1 && ag.k.mode === 'angry' && ag.shells === 0, JSON.stringify(ag.a));
      // ---- the keeper's attack: frame by frame until the octopus is hit twice (it makes off with the loot, up and away) ----
      await page.evaluate(() => __octo.input({ move: { x: -0.8, y: -0.6 }, dash: false, bomb: false, pause: false }));
      const log = [];
      let hearts0 = await page.evaluate(() => __octo.state().octopus.hearts);
      let tellAt = -1, launchAt = -1, hitAt = -1, dead = false, launches0 = 0;
      for (let f = 0; f < 150 && !dead; f++) {
        const s = await page.evaluate(() => { const t = __octo.stepDraw(1); const k = __octo.keepers(); const o = __octo.state().octopus; return { t, k: k.list[0], launches: k.launches, hearts: o.hearts, dead: o.dead, ox: o.x, oy: o.y, inv: o.invulnTimer }; });
        // the first claw thrown while the octopus can be hurt (the grab under his nose may already have cost it two hearts)
        if (launchAt < 0 && s.k.tell > 0 && (tellAt < 0 || s.t - tellAt > 0.3)) tellAt = s.t;
        if (launchAt < 0 && s.launches > launches0 && s.inv <= 0.001) { launchAt = s.t; hearts0 = s.hearts; }
        launches0 = s.launches;
        if (launchAt >= 0 && hitAt < 0 && s.hearts < hearts0) hitAt = s.t;
        dead = s.dead;
        log.push(s);
        if (tellAt >= 0 && (f % 2 === 0 || s.k.tell > 0 || s.k.claws.some((c) => c.st))) await shot('attack');
      }
      check(`${vp}: the angry keeper throws a claw after a ${(launchAt - tellAt).toFixed(2)} s tell and hits ${(hitAt - launchAt).toFixed(2)} s later`, tellAt >= 0 && launchAt - tellAt > 0.2 && launchAt - tellAt < 0.32 && hitAt > launchAt && hitAt - launchAt < 0.5);
      if (process.env.SHOPLOG) for (const s of log.slice(0, 60)) console.log(s.t.toFixed(2), 'o', s.ox.toFixed(2), s.oy.toFixed(2), 'h', s.hearts, s.inv.toFixed(2), 'k', s.k.x.toFixed(2), s.k.y.toFixed(2), s.k.mode, 'tell', s.k.tell.toFixed(2), 'c', s.k.claws.map((c) => c.st + '@' + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' '));
      for (let f = 0; f < 4; f++) { await page.evaluate(() => __octo.stepDraw(8)); await shot('attack'); }
      await page.evaluate(() => __octo.freeze(false));
      await sleep(2500);
      const cause = await page.evaluate(() => __octo.level().run.dive.cause || '');
      check(`${vp}: two hits kill the octopus, killed by the Shopkeeper`, dead && cause === 'shopkeeper', `(cause ${cause}, ${log.length} steps)`);
      if (vp === 'desktop') {
        // ---- the death screen names him; the journal counts it ----
        const deathText = await page.evaluate(() => document.body.innerText);
        check('the death screen names the Shopkeeper', /Shopkeeper/.test(deathText));
        check('the journal counts the angering and the death on the keeper\'s entry', await page.evaluate(() => __octo.stat('person-keeper', 1) >= 1 && __octo.stat('person-keeper', 2) >= 1));
      }
      await page.close();
    }

    // ---- aggro persists across levels, an angry keeper waits by the next exit, a new dive is calm ----
    {
      const page = await open('desktop', BASE + `?at=1&seed=${seed}`);
      await page.evaluate(() => { __octo.god(true); __octo.shopAggro('test'); __octo.runEvent('exit'); });
      await sleep(400); await waitLevel(page);
      const l2 = await page.evaluate(() => ({ a: __octo.extras().shopAggro, k: __octo.keepers().list, lv: __octo.level() }));
      const guard = l2.k.find((k) => !k.shop);
      check('aggro persists into the next level of the dive', l2.a.on === true && l2.lv.run.level === 2);
      check('an angry keeper waits by the exit whirlpool', !!guard && guard.mode === 'wait' && Math.hypot(guard.x - l2.lv.exitX, guard.y - l2.lv.exitY) < 5, guard ? `(${guard.x.toFixed(1)}, ${guard.y.toFixed(1)}) exit (${l2.lv.exitX}, ${l2.lv.exitY})` : 'none');
      check('a stall on a later level has its keeper hostile at his post', l2.k.filter((k) => k.shop).every((k) => k.mode === 'wait'));
      // swim within sight of the guard: he rouses and attacks
      if (guard) {
        await page.evaluate(() => { __octo.god(false); __octo.freeze(true); });
        const gi = guard.i;
        const side = l2.lv.exitX + 0.5 < guard.x ? 1 : -1;
        let frame = 0;
        for (let n = 0; n < 30; n++) await page.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, guard.x + side * 4.5, guard.y);
        let roused = false, launched = false;
        for (let f = 0; f < 80 && !launched; f++) {
          const s = await page.evaluate((i) => { __octo.stepDraw(1); const k = __octo.keepers(); return { m: k.list[i].mode, l: k.launches }; }, gi);
          roused = roused || s.m === 'angry'; launched = s.l > 0;
          if (SHOTS && (f % 3 === 0 || launched)) await page.screenshot({ path: path.join(SHOTS, `shop-guard-desktop-${String(frame++).padStart(2, '0')}.png`) });
        }
        for (let f = 0; f < 3; f++) { await page.evaluate(() => __octo.stepDraw(2)); if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shop-guard-desktop-${String(frame++).padStart(2, '0')}.png`) }); }
        check('the exit guard rouses when the octopus comes into sight, and throws a claw', roused && launched);
        await page.evaluate(() => __octo.freeze(false));
      }
      await page.evaluate(() => { __octo.god(true); __octo.runEvent('death'); });
      await sleep(400); await waitLevel(page);
      await page.evaluate(() => __octo.runEvent('enter'));
      await sleep(400); await waitLevel(page);
      const nd = await page.evaluate(() => ({ a: __octo.extras().shopAggro, k: __octo.keepers().list, st: __octo.level().stage }));
      check('a new dive starts with calm keepers and no guards', nd.a.on === false && nd.k.every((k) => k.mode === 'calm' && k.shop), nd.st);
      await page.close();
    }

    // ---- bombing the stall: the tiles break, the pedestal over them falls, the keeper is angered; ink barely scratches him ----
    {
      const page = await open('desktop', BASE + `?at=1&seed=${seed}`);
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      const sh = await page.evaluate(() => __octo.extras().shop);
      const ink = await page.evaluate(() => { const hp0 = __octo.keepers().list[0].hp; const d = __octo.hitKeeper(0, 'ink', 4); __octo.stepDraw(1); return { hp0, d, hp: __octo.keepers().list[0].hp, a: __octo.extras().shopAggro }; });
      check(`an ink jet barely scratches the keeper (${ink.d.toFixed(2)} hp of ${ink.hp0}) but angers him`, ink.d > 0 && ink.d < 0.5 && ink.a.on && ink.a.why === 'hurt');
      await page.close();
      // the real Ink Jet (inkjet.js through main.js's target list), fired at a calm keeper
      const pj = await open('desktop', BASE + `?at=1&seed=${seed}`);
      const jet = await pj.evaluate(() => {
        __octo.god(true); __octo.freeze(true);
        const k = __octo.keepers().list[0];
        for (let n = 0; n < 5; n++) { __octo.teleport(k.x - 3, k.y - 0.2); __octo.stepDraw(1); }
        __octo.input({ move: { x: 0.3, y: 0 }, attack: true });
        for (let n = 0; n < 45; n++) { __octo.teleport(k.x - 3, k.y - 0.2); __octo.stepDraw(1); }
        __octo.input(null);
        const k2 = __octo.keepers().list[0];
        return { hp0: k.hp, hp: k2.hp, mode: k2.mode, a: __octo.extras().shopAggro };
      });
      check(`ink jet blobs hit the keeper for almost nothing (${(jet.hp0 - jet.hp).toFixed(2)} hp) and anger him`, jet.hp0 - jet.hp > 0.2 && jet.hp0 - jet.hp < 1.5 && jet.a.on && jet.a.why === 'hurt' && jet.mode === 'angry', JSON.stringify(jet));
      await pj.close();
      const p2 = await open('desktop', BASE + `?at=1&seed=${seed}`);
      await p2.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      const sh2 = await p2.evaluate(() => __octo.extras().shop);
      const fx = Math.floor(sh2.px[4]), fy = Math.floor(sh2.px[5]) + 1;
      await p2.evaluate((x, y) => { __octo.teleport(x - 6, y - 4); __octo.placeBomb(x + 0.5, y - 0.45); }, fx, fy);
      let frame = 0;
      for (let f = 0; f < 70; f++) { await p2.evaluate(() => __octo.stepDraw(3)); if (SHOTS && f >= 36 && f % 2 === 0) await p2.screenshot({ path: path.join(SHOTS, `shop-bomb-desktop-${String(frame++).padStart(2, '0')}.png`) }); }
      const r = await p2.evaluate((x, y) => ({ shop: __octo.extras().shop, a: __octo.extras().shopAggro, tile: __octo.level().tiles[y * __octo.level().w + x], k: __octo.keepers().list[0] }), fx, fy);
      check('a bomb on the stall floor breaks it, the pedestal falls, its ware comes loose and the keeper is angered', r.tile === 0 && r.shop.pedGone[2] === 1 && r.shop.ware[2] !== 0 && r.a.on && r.a.why === 'shop' && r.k.mode === 'angry', JSON.stringify({ why: r.a.why, ped: r.shop.pedGone, ware: r.shop.ware, hp: r.k.hp.toFixed(1) }));
      await p2.close();
    }
  } catch (e) {
    fails.push('exception'); console.log('FAIL exception', e && e.stack ? e.stack.slice(0, 600) : e);
  } finally {
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
