// Node script (not part of tests/index.html): the giant clam's pearl carried to the exit whirlpool for the moon shell
// (2026-10-18, pearl.js), in real Chrome at 1440x900, through the real hand button (the input override).
//  - run 1: a giant clam holding the level's pearl opens; F takes the pearl (the hand holds it, the swim is slowed); in the
//    exit whirlpool the key hint shows and F there dives with it: the whirlpool takes the pearl (a swirl), +50 shells (the moon
//    shell), the toast, the journal's moon shell and giant pearl counts;
//  - run 2: the same, but the pearl is dropped (hold F) before entering: the dive credits nothing;
//  - frames: octomancer-web/night/pearl-clam-1440.png (in the open clam), pearl-carry-1440.png (carrying it),
//    pearl-convert-1440.png (the conversion moment).
//   node pearl-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '63107';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'pearl-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,helpDone:true,journal:[]}))}catch(e){}";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  await page.goto(BASE + '?at=1&seed=23', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
  await sleep(1200);
  await page.evaluate(() => { __octo.god(true); __octo.freeze(true); __octo.stepDraw(2); });
  page.errs = errs;
  return page;
}
const pressF = (p) => p.evaluate(() => { __octo.input({ hand: true }); __octo.stepDraw(1); __octo.input(null); __octo.stepDraw(1); });
const holdF = (p) => p.evaluate(() => { __octo.input({ hand: true }); __octo.stepDraw(25); __octo.input(null); __octo.stepDraw(1); });

/** A giant clam with the level's pearl on a floor near the start, opened; the octopus over its mouth. Returns the clam index. */
async function clamWithPearl(p) {
  return p.evaluate(() => {
    const o = __octo.state().octopus, solid = (x, y) => !!__octo.tileAt(x, y);
    for (let r = 2; r < 30; r++) for (const dx of [r, -r]) for (let dy = -6; dy <= 6; dy++) {
      const tx = Math.floor(o.x) + dx, ty = Math.floor(o.y) + dy;
      let ok = true;
      for (let k = -1; k <= 1 && ok; k++) { if (!solid(tx + k, ty + 1) || solid(tx + k, ty) || solid(tx + k, ty - 1) || solid(tx + k, ty - 2)) ok = false; }
      if (!ok) continue;
      const i = __octo.spawnCreature('gclam', tx + 0.5, ty + 0.5, 0, -1, true);
      __octo.clamOpen(i);
      __octo.teleport(tx + 0.5, ty + 0.5 - 0.55); // over the open mouth (the pearl sits 0.5 above the floor line)
      __octo.clamOpen(i); __octo.stepDraw(1); __octo.clamOpen(i);
      return { i, x: tx + 0.5, y: ty + 1 };
    }
    return null;
  });
}
const P = (p) => p.evaluate(() => ({ pearl: __octo.pearl(), hand: __octo.hand(), shells: __octo.level().run.shells, toast: (document.querySelector('.octo-toast') || {}).textContent || '', clams: __octo.creatures().filter((c) => c.kind === 'gclam') }));
const exitOf = (p) => p.evaluate(() => { const s = __octo.timePressure().swift; return { x: s.exitX, y: s.exitY }; });

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // ---- run 1: the pearl into the whirlpool ----
    {
      const p = await open(browser);
      const lv0 = await P(p);
      check('1-1: at most one clam of the level holds a pearl', lv0.clams.filter((c) => c.pearl).length <= 1, JSON.stringify(lv0.clams.map((c) => c.pearl)));
      const clam = await clamWithPearl(p);
      check('a giant clam holding the pearl is placed and opened', !!clam);
      const before = await P(p);
      await p.evaluate((c) => { __octo.teleport(c.x - 1.6, c.y - 1.6); __octo.clamOpen(c.i); __octo.stepDraw(1); __octo.clamOpen(c.i); __octo.stepDraw(0); }, clam);
      await p.screenshot({ path: OUT + 'clam-1440.png' }); // the open clam with the pearl in it (the octopus beside it)
      await p.evaluate((c) => { __octo.teleport(c.x, c.y - 1.05); __octo.clamOpen(c.i); __octo.stepDraw(1); __octo.clamOpen(c.i); }, clam);
      check('the open clam\'s pearl is the hand target (kind "pearl")', before.hand.target && before.hand.target.kind === 'pearl', JSON.stringify(before.hand.target));
      await pressF(p);
      const held = await P(p);
      check('F takes the pearl: the hand holds it, the swim is slowed (carry x0.45), the clam is empty', held.hand.held === 'pearl' && held.pearl.state === 3 && Math.abs(held.hand.carryMul - 0.45) < 1e-6 && held.clams.find((c) => c.i === clam.i).pearl === 0, JSON.stringify({ h: held.hand.held, cm: held.hand.carryMul, st: held.pearl.state }));
      check('no shells for taking it (it is not a shell)', held.shells === before.shells);
      // carry it toward the whirlpool: a few tiles out from the exit, swimming in, for the carrying frame
      const ex = await exitOf(p);
      const spot = await p.evaluate((ex) => {
        const free = (x, y) => !__octo.tileAt(Math.floor(x), Math.floor(y));
        for (let r = 3; r < 8; r++) for (let a = 0; a < 16; a++) { const x = ex.x + Math.cos(a / 16 * Math.PI * 2) * r, y = ex.y + Math.sin(a / 16 * Math.PI * 2) * r; if (free(x, y) && free(x + 1, y) && free(x - 1, y) && free(x, y + 1) && free(x, y - 1)) return { x, y }; }
        return null;
      }, ex);
      await p.evaluate((s) => { __octo.teleport(s.x, s.y); __octo.stepDraw(3); }, spot || ex);
      const dir = { x: ex.x - (spot || ex).x, y: ex.y - (spot || ex).y }, dl = Math.hypot(dir.x, dir.y) || 1;
      await p.evaluate((d) => { __octo.input({ move: { x: d.x, y: d.y } }); __octo.stepDraw(25); __octo.input(null); __octo.stepDraw(1); }, { x: dir.x / dl, y: dir.y / dl });
      const mid = await P(p);
      check('it stays in the tentacles while she swims', mid.hand.held === 'pearl' && mid.pearl.heldBy === 0);
      await p.screenshot({ path: OUT + 'carry-1440.png' });
      // into the whirlpool
      await p.evaluate((e) => { __octo.teleport(e.x, e.y); __octo.stepDraw(2); }, ex);
      const at = await P(p);
      check('in the exit whirlpool, holding the pearl, F would dive with it (the phone button reads Enter)', at.pearl.heldPortal && at.hand.phone === 'enter', JSON.stringify({ hp: at.pearl.heldPortal, ph: at.hand.phone }));
      await pressF(p);
      const conv = await P(p);
      check(`F in the whirlpool: the whirlpool takes the pearl and a moon shell is paid (+50: ${at.shells} -> ${conv.shells})`, conv.pearl.converted === 1 && conv.shells - at.shells === 50 && !conv.hand.held && (conv.pearl.state === 4 || conv.pearl.state === 5));
      check('the toast says so', /The whirlpool takes the pearl: a moon shell/.test(conv.toast), JSON.stringify(conv.toast));
      check('nothing was thrown (the press dived instead)', conv.hand.throws === held.hand.throws);
      await p.evaluate(() => __octo.stepDraw(6));
      const sw = await P(p);
      await p.screenshot({ path: OUT + 'convert-1440.png' });
      check('the pearl swirls into the whirlpool, then is gone', sw.pearl.state === 4 || sw.pearl.state === 5);
      const j = await p.evaluate(() => (__octo.journal ? __octo.journal() : null));
      if (j && j.stats) check('journal: the moon shell and the giant pearl are counted', (j.stats['item-moon'] || [])[3] >= 1 && (j.stats['item-bigpearl'] || [])[3] >= 1, JSON.stringify([j.stats['item-moon'], j.stats['item-bigpearl']]));
      else if (j && j.found) check('journal: the moon shell and the giant pearl are found', j.found.includes('item-moon') && j.found.includes('item-bigpearl'));
      check('run 1: no page errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
      await p.close();
    }
    // ---- run 2: dropped before the dive: nothing ----
    {
      const p = await open(browser);
      const clam = await clamWithPearl(p);
      await pressF(p);
      const held = await P(p);
      check('run 2: the pearl is taken', !!clam && held.hand.held === 'pearl');
      const ex = await exitOf(p);
      // dropped (hold F) a few tiles short of the whirlpool: in the whirlpool itself F with the pearl dives with it
      await p.evaluate((e) => { const free = (x, y) => !__octo.tileAt(Math.floor(x), Math.floor(y)); for (let r = 3; r < 8; r++) for (let a = 0; a < 16; a++) { const x = e.x + Math.cos(a / 16 * Math.PI * 2) * r, y = e.y + Math.sin(a / 16 * Math.PI * 2) * r; if (free(x, y) && free(x + 1, y) && free(x - 1, y) && free(x, y + 1) && free(x, y - 1)) { __octo.teleport(x, y); __octo.stepDraw(2); return; } } }, ex);
      await holdF(p);
      const dropped = await P(p);
      check('run 2: holding F drops it (loose, not held)', !dropped.hand.held && (dropped.pearl.state === 1 || dropped.pearl.state === 2) && dropped.hand.drops >= 1);
      await p.evaluate((e) => { __octo.teleport(e.x, e.y); __octo.stepDraw(1); }, ex);
      const s0 = (await P(p)).shells;
      await pressF(p);
      const after = await P(p);
      check(`run 2: entering without the pearl just dives: nothing credited (${s0} -> ${after.shells}), the pearl stays behind`, after.pearl.converted === 0 && after.shells === s0 && after.pearl.state !== 4 && after.pearl.state !== 5);
      check('run 2: no moon-shell toast', !/moon shell/.test(after.toast), JSON.stringify(after.toast));
      check('run 2: no page errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
      await p.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
