// Node script (not part of tests/index.html): the offering altar (js/altar.js, altar-level.js, altar-draw.js) in real Chrome
// against a running copy of the game:
//   - a Shallows level with ?altar=1 has one, standing on a floor the octopus can swim to (scenery: the tiles are unchanged);
//   - the first one ever met carries a sign and a prompt (desktop and touch wording); once the journal knows it, no sign;
//   - a body grabbed with the real F key and dropped on the stone is taken; a body thrown at it (cursor aim) is taken;
//   - enough offerings light all three hollows: a heart, the jar, an item;
//   - a person's body angers it (piranhas come out of it), and so does a bomb going off beside it;
//   - no page errors.
// Frames (1440x900 and 412x915) go to octomancer-web/night/altar-*.png.
//   node altar-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '63800';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'altar-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (journal) => "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,helpDone:true,tutorialDone:true,journal:" + JSON.stringify(journal) + "}))}catch(e){}";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
const VPS = {
  desk: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

async function open(browser, vp, q, journal = []) {
  const page = await browser.newPage();
  await page.setViewport(VPS[vp]);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(save(journal));
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 60000 });
  await sleep(1500);
  page.errs = errs;
  return page;
}
const A = (page) => page.evaluate(() => __octo.altar());
async function toScreen(page, x, y) {
  return page.evaluate((x, y) => { const c = __octo.state().camera, k = c.ppu / (document.getElementById('game').width / innerWidth); return { x: innerWidth / 2 + (x - c.x) * k, y: innerHeight / 2 + (y - c.y) * k }; }, x, y);
}
/** Swim (teleport) beside the altar, still, and let the camera settle. */
async function beside(page, a, dx = -2.2) {
  await page.evaluate((a, dx) => { __octo.god(true); __octo.teleport(a.x + dx * 0.35, a.y - 2.7); __octo.step(40); }, a, dx);
  await sleep(500);
}
/** A body laid straight onto the stone (a quick offering for counting tiers). */
const layOn = (page, kind, a) => page.evaluate((kind, a) => { __octo.addCorpse(kind, a.x, a.y - 1.4, 0, 0, 1); __octo.step(40); return __octo.altar(); }, kind, a);

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // ================================================================== desktop: placement, sign, real hand offerings, gifts
    const page = await open(browser, 'desk', '?at=1&seed=5&altar=1');
    let a = await A(page);
    const home = a;
    check('a Shallows level with ?altar=1 has an altar, with the first-meeting sign', !!a && a.sign && a.tier === 0 && !a.angry, JSON.stringify(a));
    const geo = await page.evaluate((a) => {
      const S = (x, y) => __octo.isSolid(x, y);
      const floor = S(a.x - 1, a.y + 0.5) && S(a.x, a.y + 0.5) && S(a.x + 1, a.y + 0.5);
      const water = !S(a.x - 1, a.y - 0.5) && !S(a.x + 1, a.y - 1.5) && !S(a.x, a.y - 2.5);
      // a swim flood from the start reaches the water over the stone
      const L = __octo.level(), sx = Math.floor(L.startX), sy = Math.floor(L.startY);
      const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
      let reach = false;
      for (let i = 0; i < q.length && i < 60000; i++) {
        const [x, y] = q[i];
        if (x === Math.floor(a.x) && y === Math.floor(a.y) - 1) { reach = true; break; }
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const k = nx + ',' + ny; if (!seen.has(k) && !S(nx + 0.5, ny + 0.5)) { seen.add(k); q.push([nx, ny]); } }
      }
      return { floor, water, reach };
    }, a);
    check('it stands on three tiles of floor with open water above, reachable from the start', geo.floor && geo.water && geo.reach, JSON.stringify(geo));
    await beside(page, a);
    const prompt = await page.evaluate(() => { const t = document.querySelector('.octo-prompt-title'), b = document.querySelector('.octo-prompt-text'), el = document.querySelector('.octo-prompt'); return { title: t && t.textContent, text: b && b.textContent, shown: el && el.style.display !== 'none' }; });
    check('beside it the prompt explains the altar (F to grab, never a person or a bomb)', prompt.shown && /altar/i.test(prompt.title) && /F/.test(prompt.text) && /person/.test(prompt.text) && /bomb/.test(prompt.text), JSON.stringify(prompt));
    const j = await page.evaluate(() => __octo.journal ? __octo.journal() : null);
    check('meeting it writes the journal page', j && (j.found || j).includes ? (j.found || j).includes('place-altar') : JSON.stringify(j).includes('place-altar'));
    await page.screenshot({ path: OUT + 'sign-1440.png' });
    // a quiet stone for the hand checks: the creatures about it are cleared (their bodies settle and may be taken), then a fresh altar
    await page.evaluate((a) => {
      for (const b of __octo.damageBodies()) if (b.family === 'enemy' && Math.hypot(b.x - a.x, b.y - a.y) < 14) __octo.damageHit('enemy', b.i, 'bomb', 99, false);
      __octo.step(250);
      __octo.placeAltarAt(a.x, a.y);
    }, a);

    // ---- a body grabbed with the real F key and dropped gently on the stone
    const grab = await page.evaluate((a) => { __octo.teleport(a.x, a.y - 2.2); __octo.step(2); const i = __octo.addCorpse('piranha', a.x + 0.4, a.y - 2.2, 0, 0, 1); __octo.step(2); return { i, target: __octo.hand().target }; }, a);
    await page.keyboard.press('f'); await sleep(120);
    let h = await page.evaluate(() => __octo.hand());
    check('F grabs the body beside the altar', h.held === 'corpse', JSON.stringify({ target: grab.target, held: h.held }));
    const before = await A(page);
    await page.evaluate(() => { __octo.input({ hand: true }); __octo.step(25); __octo.input(null); __octo.step(60); });
    a = await A(page);
    check('held over the stone, it is not taken; dropped (hold F), it sinks on and is taken (+1)', before.offerings === 0 && a.offerings === 1 && a.favour === 1, JSON.stringify({ before: before.offerings, after: a.offerings }));

    // ---- a body thrown at it from the side (cursor aim, F)
    const side = await page.evaluate((a) => { // throw from the side that is open water (else from above the stone)
      const S = (x, y) => __octo.isSolid(x, y);
      let at = null;
      for (const s of [-1, 1]) if (!at && [1.8, 2.4, 2.8, 3.2, 3.6].every((d) => !S(a.x + s * d, a.y - 1.6) && !S(a.x + s * d, a.y - 2.2))) at = { x: a.x + s * 3.2, y: a.y - 1.8, cx: a.x + s * 2.8 };
      if (!at) at = { x: a.x - 0.3, y: a.y - 2.6, cx: a.x + 0.1 };
      __octo.teleport(at.x, at.y); __octo.step(60); __octo.teleport(at.x, at.y); __octo.addCorpse('crab', at.cx, at.y, 0, 0, 1); __octo.step(2);
      return at;
    }, a);
    await sleep(300); // the camera settles on her before the cursor is aimed
    await page.keyboard.press('f'); await sleep(120);
    h = await page.evaluate(() => __octo.hand());
    // thrown along the move keys (hold the key toward the stone, tap F)
    const key = side.y < a.y - 2.4 ? 'KeyS' : side.x < a.x ? 'KeyD' : 'KeyA';
    const q = await toScreen(page, a.x, a.y - 1.2); // a mouse player aims a throw with the cursor: put it on the stone as well
    await page.mouse.move(q.x, q.y); await sleep(60);
    const dbg = await page.evaluate(() => ({ cam: __octo.state().camera, o: __octo.state().octopus }));
    await page.keyboard.down(key); await sleep(60);
    await page.keyboard.press('f');
    await page.keyboard.up(key);
    const fly = await page.evaluate(() => { const out = []; for (let i = 0; i < 40; i++) { __octo.step(2); const c = __octo.corpses().filter((c) => c.kind === 'crab')[0]; if (c) out.push([+c.x.toFixed(1), +c.y.toFixed(1)]); } return { out, hand: __octo.hand() }; });
    a = await A(page);
    check('a body thrown at it (F with the move key toward it) is taken', h.held === 'corpse' && a.offerings === 2 && a.tier === 1 && a.gifts[0] === 'heart', JSON.stringify({ q, cam: dbg.cam, ox: dbg.o.x, oy: dbg.o.y, a, side, throws: fly.hand.throws, path: fly.out.slice(0, 12) }));
    // ---- up to all three hollows
    for (const k of ['gclam', 'manta', 'tentacle']) a = await layOn(page, k, a);
    const items = await page.evaluate(() => __octo.state().items || null);
    check('enough offerings light all three hollows: a heart, the jar, an item', a.tier === 3 && a.gifts.join(',') === 'heart,juice,item' && a.glow.every((g) => g > 0.3), JSON.stringify({ gifts: a.gifts, glow: a.glow, items }));
    await beside(page, a, -2.5);
    await page.evaluate(() => __octo.step(60));
    await page.screenshot({ path: OUT + 'lit-1440.png' });

    // ---- anger: a person's body
    await page.evaluate(() => { __octo.placeAltarAt(null, null, false); });
    a = await A(page);
    const n0 = await page.evaluate(() => __octo.enemies().filter((e) => !e.dead && e.kind === 'piranha').length);
    await page.evaluate((a) => { __octo.teleport(a.x - 2.6, a.y - 1.5); __octo.addCorpse('npc-pip', a.x, a.y - 1.4, 0, 0, 1); __octo.step(20); }, a);
    a = await A(page);
    const n1 = await page.evaluate(() => __octo.enemies().filter((e) => !e.dead && e.kind === 'piranha').length);
    check('a person\'s body on it angers it and piranhas come out', a.angry && a.why === 'person' && n1 >= n0 + 2, JSON.stringify({ a, n0, n1 }));
    const offerAfter = await layOn(page, 'piranha', a);
    check('an angry altar takes nothing more', offerAfter.offerings === a.offerings && offerAfter.favour === a.favour);
    await page.evaluate(() => __octo.step(10));
    await page.screenshot({ path: OUT + 'angry-1440.png' });

    // ---- anger: a bomb beside it
    a = await page.evaluate((o) => { __octo.placeAltarAt(o.x, o.y, false); return __octo.altar(); }, home);
    await page.evaluate((a) => { __octo.teleport(a.x - 8, a.y - 3); __octo.giveBombs(3); __octo.placeBomb(a.x, a.y - 0.5); __octo.step(130); }, a);
    a = await A(page);
    check('a bomb going off beside it angers it too', a.angry && a.why === 'bomb', JSON.stringify(a));
    check('desktop: no page errors', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
    await page.close();

    // ================================================================== a journal that knows it: no sign
    const p2 = await open(browser, 'desk', '?at=1&seed=5&altar=1', ['place-altar']);
    a = await A(p2);
    check('once the journal knows the altar, it stands without a sign', !!a && !a.sign, JSON.stringify(a));
    await p2.close();

    // ================================================================== phone
    const ph = await open(browser, 'phone', '?at=1&seed=5&altar=1');
    a = await A(ph);
    await beside(ph, a, -2.0);
    const pp = await ph.evaluate(() => { const b = document.querySelector('.octo-prompt-text'); return b && b.textContent; });
    check('phone: the prompt speaks of Grab and Throw, not keys', !!pp && /Grab/.test(pp) && !/middle click/.test(pp), pp);
    await ph.screenshot({ path: OUT + 'sign-412.png' });
    for (const k of ['gclam', 'gclam', 'gclam']) a = await layOn(ph, k, a);
    await beside(ph, a, -2.0);
    await ph.evaluate(() => __octo.step(60));
    await ph.screenshot({ path: OUT + 'lit-412.png' });
    check('phone: all three hollows lit', a.tier === 3, JSON.stringify(a));
    check('phone: no page errors', ph.errs.length === 0, ph.errs.slice(0, 3).join(' | '));
    await ph.close();
  } catch (e) {
    console.error(e);
    fails.push('exception: ' + e.message);
  } finally {
    await browser.close();
  }
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
