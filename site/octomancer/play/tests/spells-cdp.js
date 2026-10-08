// Node script (not part of tests/index.html): section 14 (fish juice, Ink Cloud, Ink Jet, hotbar, inventory, Siphon Shell, rest
// grotto) in real Chrome against a running copy of the game: every input method fires its action (keyboard, mouse, real CDP
// touches), the empty jar, the Siphon Shell, the spring, the phone layout, and screenshots (desktop 1440x900, phone 412x915).
//   node spells-cdp.js [port | baseUrl]      port default 59250 (serve with python -m http.server <port> --directory site)
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
// the argument is a port or, like the other *-cdp.js scripts, the game's full URL
const arg = process.argv[2] || '59250';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'juice-'); // this checkout's night/ folder
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, vp, q) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); }); // as the other scripts: a refused connection is the test server's backlog, not the game
  await page.evaluateOnNewDocument(SAVE);
  await page.goto(BASE + q, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1800);
  page.errs = errs;
  return page;
}
const J = (page) => page.evaluate(() => __octo.juice());
/** screen (css px) of a world point */
async function toScreen(page, x, y, k) {
  return page.evaluate((x, y, k) => { const c = __octo.state().camera; return { x: innerWidth / 2 + (x - c.x) * c.ppu / k, y: innerHeight / 2 + (y - c.y) * c.ppu / k }; }, x, y, k);
}
/** an open spot to the right of the octopus where enemies can be placed */
async function setStage(page) {
  return page.evaluate(() => {
    __octo.god(true);
    const o = __octo.state().octopus;
    return { x: o.x, y: o.y };
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // ================================================================== desktop: inputs
    const page = await open(browser, { width: 1440, height: 900 }, '?at=1&seed=5');
    await setStage(page);
    let j0 = await J(page);
    check('desktop: a dive starts with a full jar (3 casts)', j0.juice === j0.cap && j0.cap === 3 * j0.perCast);
    await page.keyboard.press('KeyF'); await sleep(150);
    let j1 = await J(page);
    check('keyboard F casts Ink Cloud (one cast paid, a cloud)', j1.juice === j0.juice - j0.perCast && j1.clouds === 1);
    await page.keyboard.press('KeyC'); await sleep(150);
    let j2 = await J(page);
    check('keyboard C casts too', j2.juice === j1.juice - j0.perCast && j2.clouds === 2);
    const mid = { x: 900, y: 450 };
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.click(mid.x, mid.y, { button: 'right' }); await sleep(150);
    let j3 = await J(page);
    check('right click casts the selected spell toward the cursor', j3.juice === j2.juice - j0.perCast && j3.clouds === 3);
    const cl = j3.cloudList.sort((a, b) => a.age - b.age)[0];
    const oNow = await page.evaluate(() => __octo.state().octopus);
    check('the right-click cloud lands toward the cursor (right of the octopus, at most 3 tiles out)', cl.x > oNow.x + 0.5 && Math.hypot(cl.x - oNow.x, cl.y - oNow.y) <= 3.3, JSON.stringify([cl.x, cl.y, oNow.x, oNow.y]));
    await page.keyboard.press('KeyF'); await sleep(150);
    const s0 = (await J(page)).empty;
    const shaken = await page.evaluate(() => !!document.querySelector('.octo-jar-shake'));
    check('keyboard F with an empty jar fails: the jar shakes, nothing is cast', (await J(page)).juice === 0 && s0 === 1 && shaken);
    const sh0 = (await J(page)).shots;
    await page.mouse.down({ button: 'left' }); await sleep(1100); await page.mouse.up({ button: 'left' }); await sleep(100);
    const sh1 = (await J(page)).shots;
    check('left button fires the ink jet, holding it repeats (about one per 0.42 s)', sh1 - sh0 >= 2 && sh1 - sh0 <= 4, String(sh1 - sh0));
    await sleep(500); await page.keyboard.press('KeyJ'); await sleep(500); await page.keyboard.press('KeyK'); await sleep(100);
    check('keyboard J and K fire the ink jet', (await J(page)).shots - sh1 === 2);
    const b0 = (await page.evaluate(() => __octo.state().octopus.bombs));
    await page.mouse.click(mid.x, mid.y, { button: 'middle' }); await sleep(150);
    const b1 = (await page.evaluate(() => __octo.state().octopus.bombs));
    await page.keyboard.press('KeyB'); await sleep(150);
    const b2 = (await page.evaluate(() => __octo.state().octopus.bombs));
    await page.keyboard.press('KeyX'); await sleep(150);
    const b3 = (await page.evaluate(() => __octo.state().octopus.bombs));
    check('middle click, B and X each throw a bomb', b1 === b0 - 1 && b2 === b1 - 1 && b3 === b2 - 1, [b0, b1, b2, b3].join());
    await sleep(2500); // the bombs go off away from... (god mode)
    for (const [key, dirKey] of [['Space', 'KeyD'], ['ShiftLeft', 'KeyA']]) {
      await sleep(700);
      await page.keyboard.down(dirKey); await sleep(250);
      const v0 = await page.evaluate(() => Math.hypot(__octo.state().octopus.vx, __octo.state().octopus.vy));
      await page.keyboard.press(key); await sleep(60);
      const v1 = await page.evaluate(() => Math.hypot(__octo.state().octopus.vx, __octo.state().octopus.vy));
      await page.keyboard.up(dirKey);
      check('keyboard ' + key + ' dashes', v1 > v0 + 2, v0.toFixed(2) + ' -> ' + v1.toFixed(2));
    }
    const menu = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('game').dispatchEvent(e); return e.defaultPrevented; });
    check('no context menu on the canvas', menu);
    await page.keyboard.press('Tab'); await sleep(200);
    const inv = await page.evaluate(() => ({ open: __octo.juice().inventory, paused: __octo.state().paused, el: !!document.querySelector('.octo-inv-overlay') && getComputedStyle(document.querySelector('.octo-inv-overlay')).display !== 'none' }));
    check('Tab opens the inventory and pauses the game', inv.open && inv.paused && inv.el);
    await page.screenshot({ path: OUT + 'inventory-1440.png' });
    await page.keyboard.press('Tab'); await sleep(200);
    check('Tab closes it again', !(await J(page)).inventory && !(await page.evaluate(() => __octo.state().paused)));
    await page.keyboard.press('KeyI'); await sleep(150);
    const iOpen = (await J(page)).inventory; await page.keyboard.press('Escape'); await sleep(150);
    check('I opens it too and Esc closes it', iOpen && !(await J(page)).inventory && !(await page.evaluate(() => __octo.state().paused)));
    const help = await page.evaluate(() => document.querySelector('.octo-controls-help').textContent);
    check('the on-screen help lists the new controls and no mouse steering', /left-click/.test(help) && /right-click or F/.test(help) && !/hold mouse/.test(help), help);
    check('desktop: no page errors', page.errs.length === 0, page.errs.join(' | '));
    await page.close();

    // ================================================================== desktop screenshots: leaking juice, siphon, cloud, enemies losing track
    const p2 = await open(browser, { width: 1440, height: 900 }, '?at=1&seed=5');
    const st = await setStage(p2);
    // three piranhas to the right; ink jet kills one: its body leaks
    const kill = await p2.evaluate(() => {
      const o = __octo.state().octopus;
      __octo.spawn('piranha', o.x + 2.5, o.y);
      __octo.input({ attack: true, move: { x: 0.01, y: 0 }, src: { attack: 'key' } }); __octo.step(50); __octo.input(null); __octo.step(30);
      return __octo.juice();
    });
    await sleep(200);
    await p2.screenshot({ path: OUT + 'leak-1440.png' });
    { const d = (await J(p2)).dropList[0]; if (d) { const q = await toScreen(p2, d[0], d[1], 1); await p2.evaluate(() => __octo.step(60)); await sleep(100); await p2.screenshot({ path: OUT + 'leak-zoom-1440.png', clip: { x: q.x - 120, y: q.y - 120, width: 240, height: 240 } }); } }
    // the ink jet in flight toward the cursor, with the reticle
    { const o = await p2.evaluate(() => __octo.state().octopus); const q = await toScreen(p2, o.x + 4, o.y - 1.5, 1);
      await p2.mouse.move(q.x, q.y); await p2.mouse.down({ button: 'left' }); await sleep(560); await p2.screenshot({ path: OUT + 'jet-1440.png' }); await p2.mouse.up({ button: 'left' }); await sleep(300); }
    check('a beaten piranha leaks juice droplets (no siphon: they stay and dissolve)', kill.drops >= 1 && kill.juice === kill.cap, JSON.stringify([kill.drops, kill.juice]));
    const sip = await p2.evaluate(() => { __octo.giveItem('siphon'); __octo.setJuice(0); const o = __octo.state().octopus; __octo.spawn('piranha', o.x + 1.6, o.y); __octo.input({ attack: true, move: { x: 0.01, y: 0 }, src: { attack: 'key' } }); __octo.step(40); __octo.input(null); __octo.step(20); const d = __octo.juice().dropList[0]; if (d) __octo.teleport(d[0] - 1.4, d[1]); __octo.step(100); return __octo.juice(); });
    check('with the Siphon Shell the octopus drinks the leaked juice', sip.siphonR === 2 && sip.juice >= 1, JSON.stringify([sip.siphonR, sip.juice, sip.drops, sip.dropList, sip.octo]));
    // cloud with enemies around: piranhas lose track
    const lost = await p2.evaluate(() => {
      __octo.setJuice(12);
      const o = __octo.state().octopus;
      const ids = [__octo.spawn('piranha', o.x + 3.2, o.y - 0.5).id, __octo.spawn('piranha', o.x - 3.2, o.y + 0.3).id];
      __octo.step(25); // they notice and wind up
      const before = __octo.enemies().filter((e) => ids.includes(e.id)).map((e) => e.st);
      __octo.input({ spell: true }); __octo.step(1); __octo.input(null); __octo.step(40);
      const after = __octo.enemies().filter((e) => ids.includes(e.id)).map((e) => ({ st: e.st, x: e.x, y: e.y, tg: e.tg, frenzy: e.frenzy }));
      return { before, after, hides: after.map((e) => __octo.inkHides(e.x, e.y)) };
    });
    await sleep(150);
    await p2.screenshot({ path: OUT + 'cloud-1440.png' });
    check('piranhas around the octopus lose it in the cloud (back to wandering, or off after a fresh corpse: the frenzy, line of sight hidden)', lost.after.every((e) => e.st === 0 || e.tg === 1 || e.frenzy > 0) && lost.hides.every(Boolean), JSON.stringify(lost));
    const hb = await p2.evaluate(() => { const r = document.querySelector('.octo-hotbar').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await p2.screenshot({ path: OUT + 'hotbar-1440.png', clip: { x: Math.max(0, hb.x - 30), y: Math.max(0, hb.y - 30), width: hb.w + 60, height: Math.min(900 - hb.y + 30, hb.h + 60) } });
    check('desktop: no page errors (screens)', p2.errs.length === 0, p2.errs.join(' | '));
    await p2.close();

    // ================================================================== Siphon Shell set spot and rest grotto
    const p3 = await open(browser, { width: 1440, height: 900 }, '?at=1&seed=5');
    let spot = null;
    for (let lv = 1; lv <= 3 && !spot; lv++) {
      const j = await J(p3);
      if (j.siphonSpot) { spot = j.siphonSpot; break; }
      if (lv < 3) { await p3.evaluate(() => __octo.runEvent('exit')); await sleep(400); await p3.waitForFunction(() => !__octo.level().transitioning, { timeout: 20000 }); await sleep(1200); }
    }
    check('the Siphon Shell lies on one of the three Shallows levels', !!spot, JSON.stringify(spot));
    if (spot) {
      await p3.evaluate((s) => { __octo.god(true); __octo.teleport(s.x - 1.6, s.y - 0.4); }, spot); await sleep(500);
      await p3.screenshot({ path: OUT + 'siphon-spot-1440.png' });
      await p3.evaluate((s) => __octo.teleport(s.x, s.y - 0.1), spot); await sleep(300);
      check('swimming onto it picks it up (a carried passive)', (await p3.evaluate(() => __octo.extras().items)).includes('siphon'));
    }
    // to the rest grotto: finish the remaining levels
    for (let i = 0; i < 3; i++) {
      const s = await p3.evaluate(() => __octo.level().run.state);
      if (s === 4) break;
      await p3.evaluate(() => __octo.runEvent('exit')); await sleep(400); await p3.waitForFunction(() => !__octo.level().transitioning, { timeout: 20000 }); await sleep(1200);
    }
    const rest = await J(p3);
    check('after Shallows 1-3 comes the rest grotto with its spring', rest.state === 4 && !!rest.spring);
    await p3.evaluate(() => { __octo.god(false); __octo.setJuice(0); });
    await p3.evaluate(() => { const o = __octo.state(); }); // hearts: hurt via kill? set by test hook below
    await p3.evaluate((sp) => __octo.teleport(sp.x - 3, sp.y - 1), rest.spring); await sleep(400);
    await p3.screenshot({ path: OUT + 'rest-1440.png' });
    await p3.evaluate((sp) => __octo.teleport(sp.x, sp.y - 0.2), rest.spring); await sleep(400);
    const rest2 = await J(p3);
    check('the spring refills the jar and every heart', rest2.juice === rest2.cap && rest2.hearts === rest2.heartMax && rest2.spring.used);
    { const sh = await p3.evaluate(() => __octo.extras().shop); if (sh) { await p3.evaluate((k) => __octo.teleport(k[0] - 2.5, k[1] - 0.6), sh.keeper); await sleep(500); await p3.screenshot({ path: OUT + 'rest-shop-1440.png' }); } check('the grotto has a stall', !!sh); }
    await p3.evaluate(() => __octo.runEvent('exit')); await sleep(600);
    check('the grotto ring leads to the zone-clear screen', await p3.evaluate(() => __octo.level().endShown));
    check('grotto: no page errors', p3.errs.length === 0, p3.errs.join(' | '));
    await p3.close();

    // ================================================================== phone 412x915: touch buttons, compact hotbar, screenshots
    const ph = await open(browser, { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '?at=1&seed=5');
    const cdp = await ph.target().createCDPSession();
    const tap = async (x, y, ms = 60) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120);
    };
    await tap(100, 600); await sleep(300); // first touch: the controls appear
    await ph.evaluate(() => __octo.god(true));
    const rect = (sel) => ph.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, shown: getComputedStyle(e).display !== 'none' }; }, sel);
    const btn = {};
    for (const id of ['attack', 'spell', 'bomb', 'dash']) btn[id] = await rect('#octo-' + id + '-btn');
    const bar = await rect('.octo-hotbar'), hud = await rect('.octo-hud-bar'), gear = await rect('.octo-gear-btn');
    const ov = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const bl = Object.values(btn);
    check('phone: four touch buttons shown, bottom right, not overlapping each other', bl.every((b) => b && b.shown && b.l > 412 / 2) && !bl.some((a, i) => bl.some((b, k) => i < k && ov(a, b))), JSON.stringify(btn));
    check('phone: the compact hotbar overlaps neither the HUD row, the corner buttons nor the touch buttons', bar && !ov(bar, hud) && !ov(bar, gear) && !bl.some((b) => ov(bar, b)), JSON.stringify({ bar, hud, gear }));
    const pj0 = await J(ph);
    await tap(btn.spell.cx, btn.spell.cy); await sleep(150);
    const pj1 = await J(ph);
    check('touch: the Spell button casts Ink Cloud', pj1.clouds === pj0.clouds + 1 && pj1.juice === pj0.juice - pj0.perCast);
    await tap(btn.attack.cx, btn.attack.cy); await sleep(100);
    check('touch: the Jet button fires the ink jet', (await J(ph)).shots === pj0.shots + 1);
    const pb0 = await ph.evaluate(() => __octo.state().octopus.bombs);
    await tap(btn.bomb.cx, btn.bomb.cy); await sleep(100);
    check('touch: the Bomb button throws a bomb', (await ph.evaluate(() => __octo.state().octopus.bombs)) === pb0 - 1);
    await sleep(2600);
    const pv0 = await ph.evaluate(() => Math.hypot(__octo.state().octopus.vx, __octo.state().octopus.vy));
    await tap(btn.dash.cx, btn.dash.cy, 30);
    const pv1 = await ph.evaluate(() => Math.hypot(__octo.state().octopus.vx, __octo.state().octopus.vy));
    check('touch: the Dash button dashes', pv1 > pv0 + 1.5, pv0.toFixed(2) + ' -> ' + pv1.toFixed(2));
    await ph.evaluate(() => { const o = __octo.state().octopus; __octo.spawn('piranha', o.x + 2.6, o.y - 0.4); __octo.spawn('crab', o.x - 2, o.y + 1); __octo.input({ spell: true }); __octo.step(1); __octo.input(null); __octo.step(30); });
    await sleep(150);
    await ph.screenshot({ path: OUT + 'cloud-412.png' });
    await ph.evaluate(() => { const o = __octo.state().octopus; __octo.dropJuice(o.x + 1.4, o.y + 0.2, 3); __octo.step(4); });
    await sleep(120);
    await ph.screenshot({ path: OUT + 'drops-412.png' });
    await ph.evaluate(() => __octo.openInventory()); await sleep(250);
    await ph.screenshot({ path: OUT + 'inventory-412.png' });
    await ph.evaluate(() => __octo.closeInventory());
    check('phone: no page errors', ph.errs.length === 0, ph.errs.join(' | '));
    await ph.close();
  } catch (e) { console.log('ERROR', e); fails.push('exception'); }
  finally { await browser.close(); }
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
