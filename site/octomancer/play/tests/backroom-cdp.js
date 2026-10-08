// Node script (not part of tests/index.html): back rooms (js/backroom.js, backroom-draw.js, main.js 'backdoor') in real Chrome
// against a running copy of the game, on Shallows 1-1 of a seed for each kind of grotto, at 1440x900 and 412x915:
//   - nothing of the grotto exists before the first entry (no loot, creature or enemy in its box, no copy of the screen);
//   - F (the hand) at the kelp curtain takes the octopus in: she is in the box, the camera keeps to it, its things spawn once,
//     the depth reached does not count the grotto;
//   - the spring gives one heart (or one cast when the hearts are full), once;
//   - F at the curtain inside brings her back to the curtain outside, the camera to the front rows, and the copies of the screen
//     are let go once the fade is over; ten more hops leave no canvas behind;
//   - no page errors.
// Frames go to octomancer-web/night/backroom-*.png.
//   node backroom-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '63701';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'backroom-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
const SAVE = { v: 1, best: 0, runs: 1, muted: true, helpDone: true, tutorialDone: true, journal: [] };
const VPS = {
  desk: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

async function open(browser, seed, vp) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.setViewport(VPS[vp]);
  await page.evaluateOnNewDocument("try{localStorage.setItem('octomancer.best.v1'," + JSON.stringify(JSON.stringify(SAVE)) + ")}catch(e){}");
  await page.goto(BASE + '?offer=0&at=1&seed=' + seed, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 60000 });
  page.errs = errs;
  await sleep(300);
  await page.evaluate(() => { __octo.god(true); __octo.freeze(true); __octo.stepDraw(2); });
  return page;
}
const B = (p) => p.evaluate(() => __octo.backroom());
const frames = (p, n) => p.evaluate((n) => { for (let i = 0; i < n; i++) __octo.stepDraw(2); }, n); // two steps and one frame each (the hop's fade runs on frames)
const inBox = (b, x, y) => x >= b.box.x0 && x < b.box.x1 && y >= b.box.y0 && y < b.box.y1;
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // a dive seed per kind of grotto on 1-1 (the dive seed of ?at=1&seed=s is s)
    const finder = await open(browser, 1, 'desk');
    const seeds = await finder.evaluate(async () => {
      const L = await import('./js/level.js'), S = await import('./js/level-spawns.js'), K = await import('./js/backroom.js');
      const out = {};
      for (let s = 2; s < 300 && Object.keys(out).length < 3; s++) {
        const lv = L.generateLevel(s, 0), b = K.addBackRoom(lv, S.buildLevelSpawns(lv, s, 0).spawns, s, 0);
        if (b && !out[b.kind]) out[b.kind] = s;
      }
      return out;
    });
    await finder.close();
    check('a seed with a grotto on 1-1 for every kind', !!(seeds.spring && seeds.pearl && seeds.den), JSON.stringify(seeds));

    for (const kind of ['pearl', 'spring', 'den']) {
      for (const vp of ['desk', 'phone']) {
        if (vp === 'phone' && kind !== 'spring') continue;
        const tag = `${kind}-${vp}`;
        const p = await open(browser, seeds[kind], vp);
        let b = await B(p);
        check(`${tag}: the level has its grotto`, !!b && b.kind === kind, b ? b.kind : 'none');
        if (!b) { await p.close(); continue; }
        // before the first entry: nothing of it is alive
        const before = await p.evaluate((box) => {
          const inb = (x, y) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
          return { loot: __octo.loot().items.filter((l) => inb(l.x, l.y)).length, creatures: __octo.creatures().filter((c) => inb(c.x, c.y)).length, enemies: __octo.enemies().filter((e) => inb(e.x, e.y)).length, mem: __octo.memory() };
        }, b.box);
        check(`${tag}: nothing in the grotto exists before the first entry, no copy of the screen`, before.loot === 0 && before.creatures === 0 && before.enemies === 0 && b.snaps === 0 && !b.entered, JSON.stringify(before).slice(0, 120));
        // at the curtain: the hand's target, F goes through
        await p.evaluate(() => { __octo.toCurtain(false); });
        await frames(p, 30);
        b = await B(p);
        check(`${tag}: at the curtain the hand's target is the curtain`, b.target === 'backdoor');
        await shot(p, `${tag}-front`);
        const depth0 = b.depth;
        await p.evaluate(() => { __octo.pressHand(); __octo.stepDraw(1); });
        b = await B(p);
        check(`${tag}: F takes her into the grotto, beside the curtain inside`, b.inside && b.entered && inBox(b, b.octo.x, b.octo.y) && Math.abs(b.octo.x - (b.retX + 0.5)) < 0.6 && b.snaps === 1);
        await frames(p, 40);
        b = await B(p);
        const cv = await p.evaluate(() => { const c = document.getElementById('game'); return { w: c.width, h: c.height }; });
        const viewW = cv.w / 2 / b.cam.ppu, viewH = cv.h / 2 / b.cam.ppu; // half the view, in tiles
        const camOk = (b.box.x1 - b.box.x0 > 2 * viewW ? b.cam.x >= b.box.x0 + viewW - 0.05 && b.cam.x <= b.box.x1 - viewW + 0.05 : Math.abs(b.cam.x - (b.box.x0 + b.box.x1) / 2) < 0.1)
          && (b.box.y1 - b.box.y0 > 2 * viewH ? b.cam.y >= b.box.y0 + viewH - 0.05 && b.cam.y <= b.box.y1 - viewH + 0.05 : Math.abs(b.cam.y - (b.box.y0 + b.box.y1) / 2) < 0.1);
        check(`${tag}: the camera keeps to the grotto's box`, camOk, JSON.stringify(b.cam));
        check(`${tag}: the grotto does not count as depth reached`, Math.abs(b.depth - depth0) < 0.6, depth0.toFixed(1) + ' -> ' + b.depth.toFixed(1));
        const after = await p.evaluate((box) => {
          const inb = (x, y) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
          return { loot: __octo.loot().items.filter((l) => inb(l.x, l.y)).length, creatures: __octo.creatures().filter((c) => inb(c.x, c.y)).length, enemies: __octo.enemies().filter((e) => inb(e.x, e.y)).length };
        }, b.box);
        const want = { loot: b.spawns.filter((s) => s.type === 'loot').length, creatures: b.spawns.filter((s) => s.type === 'creature').length, enemies: b.spawns.filter((s) => s.type === 'enemy-slot').length };
        check(`${tag}: its things spawn on the first entry`, after.loot === want.loot && after.creatures === want.creatures && after.enemies >= want.enemies && want.loot >= 1, JSON.stringify(after) + ' want ' + JSON.stringify(want));
        await shot(p, `${tag}-inside`);
        // the spring: one heart, else one cast, once
        if (b.spring) {
          await p.evaluate(() => __octo.setHearts(1));
          await p.evaluate((x, y) => { __octo.teleport(x, y); }, b.spring.x, b.spring.y - 0.3);
          await frames(p, 4);
          const s1 = await B(p);
          await frames(p, 20);
          const s2 = await B(p);
          check(`${tag}: the spring gives one heart, once`, s1.hearts === 2 && s1.spring.used && s2.hearts === 2, `${s1.hearts} ${s2.hearts}`);
          await shot(p, `${tag}-spring`);
        }
        // back out through the curtain inside
        await p.evaluate(() => { __octo.toCurtain(true); });
        await frames(p, 6);
        b = await B(p);
        check(`${tag}: inside, the hand's target is the curtain back`, b.target === 'backdoor');
        await p.evaluate(() => { __octo.pressHand(); __octo.stepDraw(1); });
        b = await B(p);
        check(`${tag}: F at it brings her back to the curtain outside`, !b.inside && Math.abs(b.octo.x - (b.doorX + 0.5)) < 0.6 && Math.abs(b.octo.y - (b.doorY + 0.55)) < 0.6);
        await frames(p, 40);
        b = await B(p);
        check(`${tag}: the camera is back on the front rows and the copies of the screen are let go`, b.cam.y < b.frontH && b.snaps === 0, JSON.stringify(b.cam) + ' snaps ' + b.snaps);
        await shot(p, `${tag}-out`);
        if (kind === 'pearl' && vp === 'desk') {
          const m0 = await p.evaluate(() => __octo.memory());
          for (let k = 0; k < 10; k++) {
            await p.evaluate(() => { __octo.toCurtain(false); __octo.stepDraw(2); __octo.pressHand(); __octo.stepDraw(1); });
            await frames(p, 4);
            await p.evaluate(() => { __octo.toCurtain(true); __octo.stepDraw(2); __octo.pressHand(); __octo.stepDraw(1); });
            await frames(p, 30);
          }
          const m1 = await p.evaluate(() => __octo.memory()), b1 = await B(p);
          check(`${tag}: ten more hops leave no canvas behind (${m0.canvases} -> ${m1.canvases} live, ${m0.canvasMB} -> ${m1.canvasMB} MB)`, b1.hops === 22 && b1.snaps === 0 && m1.canvases <= m0.canvases && m1.canvasMB <= m0.canvasMB + 0.01, 'hops ' + b1.hops);
          const lootN = await p.evaluate((box) => __octo.loot().items.filter((l) => l.x >= box.x0 && l.x < box.x1 && l.y >= box.y0 && l.y < box.y1).length, b1.box);
          check(`${tag}: ... and spawn nothing twice`, lootN === b1.spawns.filter((s) => s.type === 'loot').length, String(lootN));
        }
        check(`${tag}: no page errors`, p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
        await p.close();
      }
    }
  } catch (err) {
    check('the script ran to the end', false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length} check(s)` : 'PASS all back-room checks');
  process.exit(fails.length ? 1 : 0);
})();
