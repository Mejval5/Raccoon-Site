// Node script (not part of tests/index.html): the first spell set (SPELLS-PICK.md) in real Chrome against a running copy of the
// game: a rune pedestal is taken by staying on it, every spell is cast with the real inputs (right click toward the cursor, the
// F key ahead of the facing, the phone Spell button), each does its job in the level, runes show on the hotbar, and frames of each
// spell in use (desktop 1440x900, phone 412x915) go to octomancer-web/night/spells-*.png.
//   node spell-set-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '61437';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'spells-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, vp, q) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  await page.goto(BASE + q, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1800);
  page.errs = errs;
  return page;
}
const S = (page) => page.evaluate(() => __octo.spells());
async function toScreen(page, x, y) {
  return page.evaluate((x, y) => { const c = __octo.state().camera, k = c.ppu / (innerWidth > 0 ? (document.getElementById('game').width / innerWidth) : 1); return { x: innerWidth / 2 + (x - c.x) * k, y: innerHeight / 2 + (y - c.y) * k }; }, x, y);
}
/** An open pocket near the start: the octopus is put where 3 tiles each way are water and a floor lies 2-6 tiles below. */
async function stage(page) {
  return page.evaluate(() => {
    __octo.god(true);
    const o = __octo.state().octopus;
    const solid = (x, y) => __octo.isSolid ? __octo.isSolid(x, y) : false;
    let best = null;
    for (let r = 0; r < 14 && !best; r++) for (let dx = -r; dx <= r && !best; dx++) for (let dy = -r; dy <= r && !best; dy++) {
      const x = Math.floor(o.x) + dx + 0.5, y = Math.floor(o.y) + dy + 0.5;
      let open = true;
      for (let a = -3; a <= 3 && open; a++) for (let b = -2; b <= 1 && open; b++) if (solid(x + a, y + b)) open = false;
      if (!open) continue;
      let fl = -1; for (let k = 2; k <= 6; k++) if (solid(x, y + k)) { fl = k; break; }
      if (fl > 0) best = { x, y, floor: y + fl };
    }
    if (best) __octo.teleport(best.x, best.y);
    __octo.step(20);
    return best || { x: o.x, y: o.y, floor: -1 };
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // ================================================================== desktop
    const page = await open(browser, { width: 1440, height: 900 }, '?at=1&seed=5');
    const s0 = await S(page);
    check('a Shallows level has a rune pedestal with a spell rune on it', !!s0.rune && ['riptide', 'coral-wall', 'anchor'].includes(s0.rune.id), JSON.stringify(s0.rune));
    const at = await stage(page);
    check('staged in an open pocket with a floor below', at.floor > 0, JSON.stringify(at));
    // the pedestal: swim over it and stay 0.5 s
    await page.evaluate((at) => { __octo.placeRuneAt(at.x + 2, at.floor - 0.28, 'riptide'); }, at);
    await page.evaluate((at) => { __octo.teleport(at.x - 1, at.y); __octo.step(10); }, at);
    await sleep(200);
    await page.screenshot({ path: OUT + 'pedestal-1440.png' });
    const taken = await page.evaluate(() => { const r = __octo.spells().rune; __octo.teleport(r.x, r.y - 0.35); const a = __octo.spells().rune.taken; __octo.step(10); const b = __octo.spells().rune.taken; __octo.step(30); return { a, b, c: __octo.spells().rune.taken, slots: __octo.spells().slots }; });
    check('the rune is taken by staying on the pedestal 0.5 s (not on the first touch)', !taken.a && !taken.b && taken.c && taken.slots.some((s) => s[0] === 'riptide'), JSON.stringify(taken));
    // ---- Riptide: right click toward the cursor
    await page.evaluate(() => { __octo.setSlots([['riptide'], ['coral-wall'], ['anchor'], ['ink-cloud', 'delayed']], 0); __octo.setJuice(12); });
    await page.evaluate((at) => __octo.teleport(at.x - 2.5, at.y), at);
    await page.evaluate(() => __octo.step(5));
    let o = await page.evaluate(() => __octo.state().octopus);
    let q = await toScreen(page, o.x + 2.2, o.y);
    await page.mouse.move(q.x, q.y); await sleep(100);
    await page.mouse.click(q.x, q.y, { button: 'right' }); await sleep(150);
    let s1 = await S(page);
    check('right click casts Riptide toward the cursor: a current running right, 1 cast paid', s1.riptides.length === 1 && s1.riptides[0].dx > 0.9 && s1.riptides[0].x > o.x + 0.5, JSON.stringify(s1.riptides));
    await page.evaluate((at) => { const r = __octo.spells().riptides[0]; __octo.spawn('piranha', r.x + 1, r.y + 0.3); }, at);
    await sleep(700);
    await page.screenshot({ path: OUT + 'riptide-1440.png' });
    // ---- Coral Wall: F key, 1.5 tiles ahead of the facing
    await sleep(2600);
    await page.evaluate(() => { __octo.setSlots([['coral-wall']], 0); __octo.setJuice(12); });
    await page.evaluate((at) => { __octo.teleport(at.x - 1.5, at.floor - 0.6); __octo.step(30); }, at);
    const c0 = await page.evaluate(() => __octo.cast(undefined, undefined, 1, 0));
    await page.evaluate(() => __octo.step(30));
    const s2 = await S(page);
    o = await page.evaluate(() => __octo.state().octopus);
    check('Coral Wall cast ahead of the facing grows coral cells right of the octopus', c0 === 1 && s2.coral >= 1 && s2.cells.every((c) => c.tx + 0.5 > o.x), JSON.stringify([c0, s2.cells, o.x]));
    await sleep(250);
    await page.screenshot({ path: OUT + 'coral-1440.png' });
    // ---- Anchor: a fall onto a piranha
    await page.evaluate(() => { __octo.setSlots([['anchor']], 0); __octo.setJuice(12); });
    const an = await page.evaluate((at) => {
      __octo.teleport(at.x + 2.5, at.y - 1); __octo.step(2);
      const o = __octo.state().octopus;
      const e = __octo.spawn('piranha', o.x, at.floor - 0.6);
      const r = __octo.cast();
      __octo.step(14);
      return { r, anchorT: __octo.spells().anchorT, vy: __octo.state().octopus.vy, id: e.id };
    }, at);
    await sleep(60);
    await page.screenshot({ path: OUT + 'anchor-1440.png' });
    const an2 = await page.evaluate((id) => { __octo.step(60); return { dead: !__octo.enemies().some((e) => e.id === id), stats: __octo.spells().stats }; }, an.id);
    check('Anchor: the octopus drops like a stone (no swim-up) and crushes the piranha it lands on', an.r === 1 && an.anchorT > 0 && an.vy > 4 && an2.dead && an2.stats.crushes >= 1, JSON.stringify([an, an2]));
    // ---- Ink Cloud with Delayed: a mote first, the cloud 1.5 s later; hotbar shows the rune
    await page.evaluate(() => { __octo.setSlots([['ink-cloud', 'delayed'], ['riptide', 'heavy', 'lingering']], 0); __octo.setJuice(12); });
    await page.evaluate((at) => { __octo.teleport(at.x, at.y); __octo.step(5); }, at);
    const d0 = await page.evaluate(() => { const r = __octo.cast(); __octo.step(30); return { r, motes: __octo.spells().motes.length, clouds: __octo.juice().clouds }; });
    await sleep(80);
    await page.screenshot({ path: OUT + 'delayed-1440.png' });
    const d1 = await page.evaluate(() => { __octo.step(70); return { motes: __octo.spells().motes.length, clouds: __octo.juice().clouds }; });
    check('Delayed Ink Cloud: a glowing mote first, the cloud 1.5 s later', d0.r === 1 && d0.motes === 1 && d0.clouds === 0 && d1.motes === 0 && d1.clouds === 1, JSON.stringify([d0, d1]));
    const hb = await page.evaluate(() => ({ prices: [...document.querySelectorAll('.octo-hb-spell')].map((b) => (b.querySelector('.octo-hb-price') || {}).textContent || '1'), titles: [...document.querySelectorAll('.octo-hb-spell')].map((b) => b.title) }));
    check('the hotbar shows the runes and the whole-cast price (Heavy + Lingering Riptide costs 3)', hb.prices.join() === '1,3' && /Delayed/.test(hb.titles[0]) && /Heavy/.test(hb.titles[1]), JSON.stringify(hb));
    await page.evaluate(() => { __octo.setSlots([['ink-cloud', 'delayed'], ['riptide', 'heavy', 'lingering']], 1); });
    const big = await page.evaluate((at) => { __octo.setJuice(12); __octo.teleport(at.x - 2.5, at.y); __octo.step(30); const r = __octo.cast(at.x + 1, at.y - 1, 1, 0); /* right of the Coral Wall grown above, which would stop the stream */ __octo.step(20); return { r, rips: __octo.spells().riptides, juice: __octo.juice().juice }; }, at);
    check('Heavy + Lingering Riptide: wider (half width 1.76), 4.5 s, the whole jar (3 casts) paid', big.r === 1 && big.rips.length >= 1 && Math.abs(big.rips[big.rips.length - 1].hw - 1.76) < 0.01 && Math.abs(big.rips[big.rips.length - 1].life - 4.5) < 0.01 && big.juice === 0, JSON.stringify(big));
    await sleep(100);
    await page.screenshot({ path: OUT + 'heavy-riptide-1440.png' });
    // ---- Lure: a piranha that lost the octopus swims to its light
    await sleep(500);
    const lu = await page.evaluate((at) => {
      __octo.setSlots([['lure']], 0); __octo.setJuice(12);
      __octo.teleport(at.x - 2.5, at.y); __octo.step(30);
      const e = __octo.spawn('piranha', at.x + 2.5, at.y - 1.5);
      const r = __octo.cast(at.x + 0.5, at.y, 1, 0);
      __octo.step(150);
      const f = __octo.enemies().find((q) => q.id === e.id);
      return { r, lures: __octo.lures(), d: f ? Math.hypot(f.x - (at.x + 0.5), f.y - at.y) : -1, stats: __octo.spells().stats };
    }, at);
    check('Lure: a glowing bulb on the infight lure hook, a nearby piranha goes to it', lu.r === 1 && lu.lures.length === 1 && lu.d >= 0 && lu.d < 2.5, JSON.stringify(lu));
    await sleep(120);
    await page.screenshot({ path: OUT + 'lure-1440.png' });
    check('desktop: no page errors', page.errs.length === 0, page.errs.join(' | '));
    await page.close();

    // ================================================================== phone 412x915: the Spell button, aim ahead / on self
    const ph = await open(browser, { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '?at=1&seed=5');
    const cdp = await ph.target().createCDPSession();
    const tap = async (x, y, ms = 60) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120);
    };
    await tap(100, 600); await sleep(300);
    const pat = await stage(ph);
    const spellBtn = await ph.evaluate(() => { const r = document.querySelector('#octo-spell-btn').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
    const shots = [['riptide', 'riptide-412', 40], ['coral-wall', 'coral-412', 30], ['anchor', 'anchor-412', 12], ['lure', 'lure-412', 90]];
    for (const [id, name, steps] of shots) {
      await ph.evaluate((id, at) => { __octo.setSlots([[id]], 0); __octo.setJuice(12); __octo.teleport(at.x - 1.5, at.y - (id === 'anchor' ? 1 : 0)); __octo.step(30); }, id, pat);
      // facing right: a short swim right first
      await ph.evaluate(() => { __octo.input({ move: { x: 1, y: 0 } }); __octo.step(6); __octo.input(null); __octo.step(4); });
      const before = await S(ph);
      await tap(spellBtn.x, spellBtn.y);
      await ph.evaluate((n) => __octo.step(n), steps);
      const after = await S(ph);
      const oo = await ph.evaluate(() => __octo.state().octopus);
      let ok = false;
      if (id === 'riptide') ok = after.riptides.length === 1 && Math.abs(after.riptides[0].x - oo.x) < 4 && after.riptides[0].dx > 0.5;
      if (id === 'coral-wall') ok = after.coral > before.coral && after.cells.every((c) => c.tx + 0.5 > oo.x - 0.2);
      if (id === 'anchor') ok = after.anchorT > 0;
      if (id === 'lure') ok = after.stats.lures > before.stats.lures;
      check('phone: the Spell button casts ' + id + (id === 'anchor' ? ' on the octopus' : ' 1.5 tiles ahead of the facing'), ok, JSON.stringify({ r: after.riptides, cells: after.cells, a: after.anchorT, o: [oo.x, oo.y] }));
      await sleep(150);
      await ph.screenshot({ path: OUT + name + '.png' });
      await ph.evaluate(() => __octo.step(200));
    }
    await ph.evaluate(() => { __octo.setSlots([['ink-cloud', 'delayed'], ['riptide', 'heavy'], ['coral-wall', 'lingering']], 0); __octo.setJuice(12); });
    await ph.evaluate((at) => { __octo.teleport(at.x, at.y); __octo.step(5); __octo.cast(); __octo.step(20); }, pat);
    await sleep(150);
    await ph.screenshot({ path: OUT + 'delayed-412.png' });
    check('phone: no page errors', ph.errs.length === 0, ph.errs.join(' | '));
    await ph.close();
  } finally {
    await browser.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
