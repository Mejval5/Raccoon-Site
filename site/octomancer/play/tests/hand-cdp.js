// Node script (not part of tests/index.html): controls 2026-10-08 (V2-PLAN 17, "the eighth tentacle") in real Chrome against a
// running copy of the game, through the real inputs (CDP keys, mouse buttons, the wheel, touches): F grabs / throws / drops
// every carryable kind, C / right click use the selected hotbar slot (spell, bomb), Q / E / wheel / 1-9 scroll the hotbar, the
// two bombs (dropped: straight down, no bounce; aimed: sticks), no Ink Jet while carrying, buying with F, shooting a ware off
// its pedestal (theft, the keeper's '!'), talking with F in the hub, the phone's Spell button turning into Grab / Throw and
// the Use button, and the tutorial's bomb floor. Frames go to octomancer-web/night/hand-*.png (desktop 1440x900, phone 412x915).
//   node hand-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '60911';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'hand-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
const PHONE = { viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' };

async function open(browser, vp, q) {
  const page = await browser.newPage();
  if (vp === 'phone') await page.emulate(PHONE); else await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1500);
  await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
  page.errs = errs;
  return page;
}
const H = (p) => p.evaluate(() => __octo.hand());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
async function toScreen(page, x, y) {
  return page.evaluate((x, y) => { const c = __octo.state().camera, k = devicePixelRatio || 1; return { x: innerWidth / 2 + (x - c.x) * c.ppu / k, y: innerHeight / 2 + (y - c.y) * c.ppu / k }; }, x, y);
}
let shotN = 0;
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' }).then(() => shotN++);
/** An open spot in the level with water around: the octopus's start. */
const octoAt = (p) => p.evaluate(() => { const o = __octo.state().octopus; return { x: o.x, y: o.y }; });

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // ================================================================== desktop: grab / carry / throw / drop
    const page = await open(browser, 'desktop', '?at=1&seed=5');
    let o = await octoAt(page);
    await page.evaluate((o) => { __octo.addLoot('pot', o.x + 0.8, o.y); }, o);
    await step(page, 4);
    let h = await H(page);
    check('desktop: a pot in reach is the hand target (the tentacle-curl tell)', h.target && h.target.kind === 'pot');
    await shot(page, 'tell-desktop');
    await page.keyboard.press('KeyF'); await step(page, 2);
    h = await H(page);
    check('desktop: F picks the pot up (carried, slower swim, shields)', h.held === 'pot' && h.carryMul < 1 && h.shield);
    await shot(page, 'carry-desktop');
    // carried while swimming right
    await page.evaluate(() => __octo.input({ move: { x: 1, y: 0 } })); await step(page, 25);
    const sw = await page.evaluate(() => { const o = __octo.state().octopus; return Math.hypot(o.vx, o.vy); });
    await page.evaluate(() => __octo.input(null));
    await shot(page, 'carry-swim-desktop');
    h = await H(page);
    check(`desktop: the pot stays in the tentacles while swimming (speed ${sw.toFixed(2)})`, h.held === 'pot' && h.heldAt && Math.hypot(h.heldAt.x - (await octoAt(page)).x, h.heldAt.y - (await octoAt(page)).y) < 1.2);
    // no ink while carrying
    const shots0 = await page.evaluate(() => __octo.juice().shots);
    await page.keyboard.down('KeyJ'); await step(page, 6); await page.keyboard.up('KeyJ'); await step(page, 1);
    const shots1 = await page.evaluate(() => __octo.juice().shots);
    check('desktop: no Ink Jet while carrying (J does nothing)', shots1 === shots0, `${shots0} -> ${shots1}`);
    // throw toward the cursor: up and right
    o = await octoAt(page);
    const aim = await toScreen(page, o.x + 3, o.y - 2);
    await page.mouse.move(aim.x, aim.y);
    await page.keyboard.press('KeyF'); await step(page, 1);
    h = await H(page);
    const flew = await page.evaluate(() => __octo.props().filter((p) => p.kind === 'pot').map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy })));
    check('desktop: a tap of F throws the pot toward the cursor (up and right)', h.held === '' && h.throws === 1 && flew.some((p) => p.vx > 3 && p.vy < -1), JSON.stringify(flew));
    for (let i = 0; i < 4; i++) { await step(page, 2); await shot(page, 'throw-desktop-' + i); }
    // a corpse: carried, thrown at a fish (the shared damage entry)
    o = await octoAt(page);
    await page.evaluate((o) => { __octo.addCorpse('crab', o.x + 0.7, o.y, 0, 0, 1); }, o);
    await step(page, 2);
    await page.keyboard.press('KeyF'); await step(page, 2);
    h = await H(page);
    check('desktop: F picks a corpse up (no shield)', h.held === 'corpse' && !h.shield);
    await shot(page, 'carry-corpse-desktop');
    const c0 = await page.evaluate(() => __octo.juice().thrownHits);
    o = await octoAt(page);
    await page.evaluate((o) => __octo.spawn('piranha', o.x + 2.8, o.y), o);
    const fishAt = await toScreen(page, o.x + 2.8, o.y);
    await page.mouse.move(fishAt.x, fishAt.y);
    await page.keyboard.press('KeyF');
    let hitOk = false;
    for (let i = 0; i < 30 && !hitOk; i++) { await step(page, 1); hitOk = (await page.evaluate(() => __octo.juice().thrownHits)) > c0; if (i === 4) await shot(page, 'throw-corpse-desktop'); }
    check('desktop: the thrown corpse hits the fish through the shared damage entry', hitOk);
    // hold F: drop gently
    o = await octoAt(page);
    await page.evaluate((o) => { __octo.addLoot('clam', o.x + 0.7, o.y); }, o);
    await step(page, 3);
    await page.keyboard.press('KeyF'); await step(page, 2);
    const g0 = await H(page);
    await page.keyboard.down('KeyF'); await step(page, 20); await page.keyboard.up('KeyF'); await step(page, 2);
    h = await H(page);
    check('desktop: holding F puts the clam down gently (no throw)', g0.held === 'pot' && h.held === '' && h.drops === g0.drops + 1 && h.throws === g0.throws);
    // a stunned creature
    await page.evaluate(() => { const o = __octo.state().octopus; for (const dy of [-2, -3, 2, 3]) if (!__octo.tileAt(Math.floor(o.x), Math.floor(o.y + dy)) && !__octo.tileAt(Math.floor(o.x + 1), Math.floor(o.y + dy))) { __octo.teleport(o.x, o.y + dy); break; } __octo.stepDraw(1); });
    o = await octoAt(page);
    await page.evaluate((o) => { __octo.spawn('piranha', o.x + 0.8, o.y); __octo.stunNear(o.x + 0.8, o.y, 0.5, 1.2); }, o); // as a blast stuns what it does not kill
    const stunned = await page.evaluate(() => { for (let i = 0; i < 5; i++) { __octo.stepDraw(1); const h = __octo.hand(); if (h.target && h.target.kind === 'creature') return true; } return false; });
    if (stunned) {
      await page.keyboard.press('KeyF'); await step(page, 2);
      h = await H(page);
      check('desktop: a stunned creature can be carried', h.held === 'creature');
      await shot(page, 'carry-creature-desktop');
      let freed = false;
      for (let i = 0; i < 150 && !freed; i++) { await step(page, 1); freed = (await H(page)).held === ''; }
      check('desktop: it wriggles free when its stun is over', freed);
    } else check('desktop: a stunned creature is the hand target', false);

    // ================================================================== hotbar: Q / E / wheel / 1-9 and right click / C
    let hb = await page.evaluate(() => __octo.juice().hotbar);
    check('hotbar: a dive starts with the spell and the bomb stack', hb.slots.length === 2 && hb.slots[1][0] === 'bomb' && hb.sel === 0);
    await page.keyboard.press('KeyE'); await step(page, 1);
    const afterE = (await page.evaluate(() => __octo.juice().hotbar)).sel;
    await page.keyboard.press('KeyQ'); await step(page, 1);
    const afterQ = (await page.evaluate(() => __octo.juice().hotbar)).sel;
    await page.mouse.move(700, 450);
    await page.mouse.wheel({ deltaY: 100 }); await step(page, 1);
    const afterWheel = (await page.evaluate(() => __octo.juice().hotbar)).sel;
    await page.keyboard.press('Digit1'); await step(page, 1);
    const after1 = (await page.evaluate(() => __octo.juice().hotbar)).sel;
    check(`hotbar: E next (${afterE}), Q back (${afterQ}), the wheel (${afterWheel}), 1 (${after1})`, afterE === 1 && afterQ === 0 && afterWheel === 1 && after1 === 0);
    // right click with the spell selected: casts
    const j0 = await page.evaluate(() => __octo.juice());
    o = await octoAt(page);
    let at = await toScreen(page, o.x + 2, o.y);
    await page.mouse.click(at.x, at.y, { button: 'right' }); await step(page, 1);
    const j1 = await page.evaluate(() => __octo.juice());
    check('right click with the spell selected casts it at the cursor', j1.juice === j0.juice - j0.perCast && j1.clouds === j0.clouds + 1);
    await step(page, 25); await page.keyboard.press('KeyC'); await step(page, 1); // after the 0.4 s cast lock
    const j2 = await page.evaluate(() => __octo.juice());
    check('C casts the selected spell too', j2.juice === j1.juice - j0.perCast);
    await page.evaluate(() => __octo.setJuice ? __octo.setJuice(999) : 0);

    // ================================================================== bombs: dropped and aimed
    const pb = await open(browser, 'desktop', '?at=1&seed=5');
    await pb.evaluate(() => __octo.giveBombs(5));
    await pb.keyboard.press('Digit2'); await step(pb, 1);
    o = await octoAt(pb);
    // right click on the octopus: a drop
    at = await toScreen(pb, o.x + 0.3, o.y);
    await pb.mouse.click(at.x, at.y, { button: 'right' }); await step(pb, 1);
    let bl = await pb.evaluate(() => __octo.bombsLive());
    check('right click on the octopus with the bomb selected drops a heavy bomb under it', bl.length === 1 && bl[0].mode === 1 && Math.abs(bl[0].x - o.x) < 0.05 && bl[0].y > o.y);
    const xs = [], vys = [];
    for (let i = 0; i < 70; i++) {
      await step(pb, 1);
      bl = await pb.evaluate(() => __octo.bombsLive());
      if (bl.length) { xs.push(bl[0].x); vys.push(bl[0].vy); }
      if (i % 10 === 2 && bl.length) await shot(pb, 'bomb-drop-' + i);
      if (!bl.length) { await shot(pb, 'bomb-drop-blast'); break; }
    }
    check(`the dropped bomb sinks straight down (x drift ${(Math.max(...xs) - Math.min(...xs)).toFixed(3)}) and never bounces (min vy ${Math.min(...vys).toFixed(2)})`, xs.length > 10 && Math.max(...xs) - Math.min(...xs) < 0.02 && Math.min(...vys) > -0.05);
    await step(pb, 30);
    // aimed: right click at rock to the side
    o = await octoAt(pb);
    const wall = await pb.evaluate((o) => { for (let dx = 2; dx < 14; dx += 0.25) if (__octo.tileAt(Math.floor(o.x + dx), Math.floor(o.y))) return { x: o.x + dx, y: o.y }; for (let dx = 2; dx < 14; dx += 0.25) if (__octo.tileAt(Math.floor(o.x - dx), Math.floor(o.y))) return { x: o.x - dx, y: o.y }; return null; }, o);
    if (wall) {
      at = await toScreen(pb, wall.x, wall.y);
      await pb.mouse.click(at.x, at.y, { button: 'right' }); await step(pb, 1);
      bl = await pb.evaluate(() => __octo.bombsLive());
      check('right click away from the octopus throws a sticky mine', bl.length === 1 && bl[0].mode === 2 && !bl[0].armed);
      let stuck = null;
      for (let i = 0; i < 60 && !stuck; i++) { await step(pb, 1); bl = await pb.evaluate(() => __octo.bombsLive()); if (bl.length && bl[0].state === 2) stuck = bl[0]; if (i % 3 === 0) await shot(pb, 'bomb-sticky-' + i); }
      check('the mine clings to the rock it was thrown at and its fuse starts there', !!stuck && stuck.armed && Math.abs(stuck.x - wall.x) < 1.2, stuck ? JSON.stringify(stuck) : 'never stuck');
      for (let i = 0; i < 6; i++) { await step(pb, 5); await shot(pb, 'bomb-sticky-wait-' + i); }
      for (let i = 0; i < 20; i++) { await step(pb, 3); if (!(await pb.evaluate(() => __octo.bombsLive().length))) { await shot(pb, 'bomb-sticky-blast'); break; } }
    } else check('a wall near the start to throw a mine at', false);
    // B drops, middle click throws
    await step(pb, 40);
    await pb.keyboard.press('KeyB'); await step(pb, 1);
    bl = await pb.evaluate(() => __octo.bombsLive());
    check('B drops a heavy bomb', bl.length === 1 && bl[0].mode === 1);
    await step(pb, 100);
    o = await octoAt(pb);
    at = await toScreen(pb, o.x + 3, o.y - 1);
    await pb.mouse.click(at.x, at.y, { button: 'middle' }); await step(pb, 1);
    bl = await pb.evaluate(() => __octo.bombsLive());
    check('the middle click is the quick bomb: a sticky mine at the cursor', bl.length === 1 && bl[0].mode === 2 && bl[0].vx > 3);
    await pb.close();

    // ================================================================== shop: buy with F, shoot a ware off
    const sp = await open(browser, 'desktop', '?at=1&seed=3');
    const seed = await sp.evaluate(async () => { const L = await import('./js/level.js'); for (let s = 2; s < 400; s++) if (L.generateLevel(s, 0).shop) return s; return 0; });
    await sp.close();
    for (const mode of ['buy', 'shoot']) {
      const p = await open(browser, 'desktop', `?at=1&seed=${seed}`);
      const sh = await p.evaluate(() => __octo.extras().shop);
      // the rightmost ware, shot from its right (the stall's left edge may be bedrock)
      const W = mode === 'buy' ? 0 : 2, px = sh.px[W * 2], py = sh.px[W * 2 + 1];
      if (mode === 'buy') {
        await p.evaluate(() => __octo.giveShells(200));
        for (let n = 0; n < 30; n++) await p.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, px, py - 0.2);
        const touchBuy = await p.evaluate(() => __octo.extras().shop.sold.some((v) => v));
        h = await H(p);
        check('shop: swimming onto a pedestal does not buy any more; the ware is the hand target', !touchBuy && h.target && h.target.kind === 'ware');
        await shot(p, 'shop-tell-desktop');
        const sh0 = await p.evaluate(() => __octo.extras().shells);
        await p.keyboard.press('KeyF'); await p.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, px, py - 0.2);
        const r = await p.evaluate(() => ({ shop: __octo.extras().shop, shells: __octo.extras().shells, a: __octo.extras().shopAggro }));
        check('shop: F on a ware buys it when you have the shells', r.shop.sold.some((v) => v) && r.shells < sh0 && !r.a.on, `${sh0} -> ${r.shells}`);
      } else {
        // the Ink Jet at the ware from the left: it is knocked off, the keeper notices and is angry
        for (let n = 0; n < 20; n++) await p.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, px + 2.6, py - 0.15);
        const wp = await toScreen(p, px, py - 0.15);
        await p.mouse.move(wp.x, wp.y);
        await p.mouse.down(); let knocked = false;
        for (let n = 0; n < 40 && !knocked; n++) { await p.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, px + 2.6, py - 0.15); knocked = (await p.evaluate((W) => __octo.extras().shop.ware[W], W)) !== 0; }
        await p.mouse.up();
        h = await H(p);
        const r = await p.evaluate(() => ({ shop: __octo.extras().shop, a: __octo.extras().shopAggro, k: __octo.keepers().list[0] }));
        check("shop: an ink shot knocks a ware off its pedestal; the keeper notices ('!') and is angry (theft)", knocked && r.a.on && r.a.why === 'theft' && h.keeperNotice > 0, JSON.stringify({ ware: r.shop.ware, a: r.a }));
        await step(p, 2); await shot(p, 'shop-shoot-notice-desktop');
        // it falls; pick it up: stolen
        let got = false;
        for (let n = 0; n < 120 && !got; n++) {
          got = await p.evaluate((n, W) => {
            const e = __octo.extras(), pid = e.shop.pid[W], o = __octo.state().octopus;
            const pr = __octo.props().find((q) => q.i === pid);
            const h = __octo.hand();
            if (pr) { const dx = pr.x - o.x, dy = pr.y - o.y, l = Math.hypot(dx, dy) || 1; __octo.input({ move: { x: dx / l, y: dy / l }, hand: !!(h.target && h.target.kind === 'ware') && n % 2 === 0 }); }
            __octo.stepDraw(1);
            return __octo.extras().shop.stolen >= 1;
          }, n, W);
        }
        await p.evaluate(() => __octo.input(null));
        check('shop: picking the shot-off ware up counts as stolen', got);
      }
      check(`shop (${mode}): no console errors`, p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
      await p.close();
    }

    // ================================================================== hub: talk with F
    {
      const p = await open(browser, 'desktop', '?seed=5');
      await p.evaluate(() => { __octo.setStory('marlo', 1); __octo.setStory('quill', 1); });
      const res = await p.evaluate(() => { // sweep the hub's water for a spot beside a resident (from the right: the journal board on the left opens the book)
        const lv = __octo.level();
        for (let x = lv.w - 1.5; x > 1; x -= 0.7) for (let y = 1; y < lv.h - 1; y += 0.7) {
          if (__octo.tileAt(Math.floor(x), Math.floor(y)) || Math.hypot(x - lv.boardX - 0.5, y - lv.boardY - 0.5) < 3) continue;
          __octo.teleport(x, y); __octo.step(1);
          const h = __octo.hand(); if (h.target && h.target.kind === 'talk') { __octo.stepDraw(1); return true; }
        }
        return false;
      });
      if (res) {
        const u0 = (await H(p)).uses;
        await p.keyboard.press('KeyF'); await step(p, 2);
        check('hub: F next to a resident talks (an interact, nothing is held)', (await H(p)).uses === u0 + 1 && (await H(p)).held === '');
        await shot(p, 'talk-desktop');
      } else check('hub: a resident is in reach to talk to', false);
      await p.close();
    }

    // ================================================================== phone: the Spell button turns into Grab / Throw; Use
    {
      const p = await open(browser, 'phone', '?at=1&seed=5');
      const btn = (id) => p.evaluate((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: e.textContent, shown: getComputedStyle(e).display !== 'none' }; }, id);
      await p.touchscreen.tap(100, 600); await step(p, 2); // a touch shows the buttons
      o = await octoAt(p);
      await p.evaluate((o) => { __octo.addLoot('pot', o.x + 0.8, o.y); }, o);
      await step(p, 4); await sleep(50); await step(p, 1);
      let sb = await btn('octo-spell-btn');
      check(`phone: with a pot in reach and the octopus still, Spell reads Grab (${sb.text})`, sb.shown && sb.text === 'Grab');
      await shot(p, 'phone-grab');
      await p.touchscreen.tap(sb.x, sb.y); await step(p, 2);
      sb = await btn('octo-spell-btn');
      h = await H(p);
      check(`phone: tapping Grab picks the pot up and the button reads Throw (${sb.text})`, h.held === 'pot' && sb.text === 'Throw');
      await shot(p, 'phone-throw');
      await p.touchscreen.tap(sb.x, sb.y); await step(p, 2);
      h = await H(p);
      check('phone: tapping Throw throws it', h.held === '' && h.throws === 1);
      for (let i = 0; i < 20; i++) await step(p, 1);
      sb = await btn('octo-spell-btn');
      check(`phone: nothing in reach: the button is Spell again (${sb.text})`, sb.text === 'Spell');
      // Use: with the bomb picked on the bar it drops one
      const slot = await p.evaluate(() => { const e = document.querySelector('.octo-hb-bomb'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await p.touchscreen.tap(slot.x, slot.y); await step(p, 2);
      const ub = await btn('octo-use-btn');
      console.log('  phone hotbar after the tap', JSON.stringify(await p.evaluate(() => __octo.juice().hotbar)), JSON.stringify(slot));
      check(`phone: with the bomb picked the Use button reads Bomb (${ub.text})`, ub.text === 'Bomb');
      await p.touchscreen.tap(ub.x, ub.y); await step(p, 1);
      const bl2 = await p.evaluate(() => __octo.bombsLive());
      check('phone: tapping it drops a heavy bomb', bl2.length === 1 && bl2[0].mode === 1);
      await step(p, 6); await shot(p, 'phone-bomb');
      check('phone: no console errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
      await p.close();
    }

    // ================================================================== the tutorial's bomb floor
    {
      const p = await open(browser, 'desktop', '?at=tutorial&seed=7');
      for (let n = 0; n < 20; n++) await p.evaluate(() => { __octo.teleport(37.5, 11.5); __octo.stepDraw(1); });
      const pr = await p.evaluate(() => ({ text: (document.querySelector('.octo-prompt') || document.body).textContent, hb: __octo.juice().hotbar }));
      check('tutorial: the bomb prompt names B (drop) and the middle click (sticky), and the bomb is picked on the bar', /press B/.test(pr.text) && /sticks/.test(pr.text) && pr.hb.slots[pr.hb.sel][0] === 'bomb', pr.text.slice(0, 160));
      await p.keyboard.press('KeyB'); await step(p, 1);
      await p.evaluate(() => __octo.input({ move: { x: -1, y: -0.3 } }));
      await step(p, 40); await p.evaluate(() => __octo.input(null));
      await shot(p, 'tutorial-bomb');
      await step(p, 80);
      const open1 = await p.evaluate(() => { const lv = __octo.level(); let broken = 0; for (let x = 34; x <= 41; x++) for (let y = 14; y <= 15; y++) if (!__octo.tileAt(x, y)) broken++; return broken; });
      check(`tutorial: one dropped bomb breaks through the floor (${open1} tiles)`, open1 >= 4 && await p.evaluate(() => !__octo.tileAt(37, 14) && !__octo.tileAt(37, 15)));
      await shot(p, 'tutorial-bomb-after');
      await p.close();
    }
    check('desktop: no console errors', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
    await page.close();
  } catch (e) {
    fails.push('exception'); console.log('FAIL exception', e && e.stack ? e.stack.slice(0, 800) : e);
  } finally {
    await browser.close();
  }
  console.log(fails.length ? 'FAIL ' + fails.length : 'ALL PASS', `(${shotN} frames)`);
  process.exit(fails.length ? 1 : 0);
})();
