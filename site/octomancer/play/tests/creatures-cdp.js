// Unified creature rules (2026-10-08) in the running game: the shared damage entry (damage.js) sees every family of the level,
// spikes hurt the shopkeeper quietly (no aggro), the octopus's ink angers the run, a boulder through the entry crushes an enemy.
//   node creatures-cdp.js [baseUrl]      baseUrl default http://127.0.0.1:60411/octomancer/play/index.html
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP, 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:60411/octomancer/play/index.html';
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; let fails = 0;
  const check = (n, ok, x = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); if (!ok) fails++; };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE + '?at=1&seed=3', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
    const seed = await page.evaluate(async () => { const L = await import('./js/level.js'); for (let s = 2; s < 400; s++) if (L.generateLevel(s, 0).shop) return s; return 0; });
    await page.goto(BASE + `?at=1&seed=${seed}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
    await page.evaluate(() => { __octo.god(true); __octo.freeze(true); __octo.stepDraw(30); });
    const bodies = await page.evaluate(() => __octo.damageBodies());
    const fams = [...new Set(bodies.map((b) => b.family))];
    check('the damage entry sees this level\'s bodies (enemies and the keeper)', fams.includes('enemy') && fams.includes('keeper'), JSON.stringify(fams) + ' ' + bodies.length);
    const r = await page.evaluate(() => {
      const k0 = __octo.keepers().list[0].hp;
      const d1 = __octo.damageHit('keeper', 0, 'spikes'); __octo.stepDraw(1);
      const a1 = __octo.extras().shopAggro.on, k1 = __octo.keepers().list[0];
      const d2 = __octo.damageHit('keeper', 0, 'ink'); __octo.stepDraw(1);
      return { k0, d1, a1, hp1: k1.hp, mode1: k1.mode, d2, a2: __octo.extras().shopAggro.on };
    });
    check(`in game: spikes hurt the keeper (${r.k0} -> ${r.hp1}) quietly (no aggro, still ${r.mode1})`, r.d1 >= 15 && r.hp1 < r.k0 && !r.a1 && r.mode1 === 'calm', JSON.stringify(r));
    check('in game: her ink on him angers the run', r.d2 > 0 && r.a2 === true);
    const e = await page.evaluate(() => { const b = __octo.damageBodies().find((x) => x.family === 'enemy'); if (!b) return null; const d = __octo.damageHit('enemy', b.i, 'boulder'); __octo.stepDraw(1); return { kind: b.kind, d, left: __octo.damageBodies().filter((x) => x.family === 'enemy').length }; });
    check('in game: a boulder through the entry crushes an enemy (or is ignored by an invulnerable kind)', e && (e.d > 0 || e.kind === 'horns'), JSON.stringify(e));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (err) { console.log('FAIL exception ' + err); fails++; }
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
