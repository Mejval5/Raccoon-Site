// Node script (not part of tests/index.html): the Ink Jet against what lives in a real level, in headless Chrome:
// a clay pot and a clam break, a background fish (decor fish or the foliage greenranha) dies and leaves a corpse,
// Pip (calm, free) is hurt and turns, Pip in his cage gets the cage broken; and a dash through a piranha harms neither.
//   node actions-cdp.js [baseUrl]      (serve with python -m http.server <port> --directory site)
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:60611/octomancer/play/index.html';
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, q) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  await page.goto(BASE + q, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1200);
  await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
  page.errs = errs;
  return page;
}

// in the page: an open stretch (clear water from x - 2.5 to x + 0.5 on row y) near the octopus to stage a shot along +x
const FIND_LANE = `(function () {
  const o = __octo.state().octopus;
  const clear = (x, y) => { for (let t = -2.6; t <= 0.6; t += 0.2) for (const dy of [-0.5, 0, 0.5]) if (__octo.isSolid(x + t, y + dy)) return false; return true; };
  for (let r = 0; r < 30; r++) for (let a = 0; a < 16; a++) {
    const x = Math.floor(o.x + Math.cos(a / 16 * 6.283) * r) + 0.5, y = Math.floor(o.y + Math.sin(a / 16 * 6.283) * r) + 0.5;
    if (clear(x, y)) return { x, y };
  }
  return null;
})()`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    const page = await open(browser, '?at=1&seed=5');
    // ---- pots and clams break ----
    for (const kind of ['pot', 'clam']) {
      const r = await page.evaluate(async (kind, FIND) => {
        const lane = eval(FIND);
        if (!lane) return { lane: null };
        const li = __octo.spawnLoot(kind, lane.x, lane.y, 2);
        __octo.teleport(lane.x - 2.3, lane.y);
        __octo.step(80); // the jet has refilled, the prop is in place
        const L = __octo.loot().items[li];
        __octo.teleport(L.x - 2.3, L.y);
        const fired = __octo.fireInk(1, 0);
        __octo.step(20);
        return { lane, fired, state: __octo.loot().items[li].state };
      }, kind, FIND_LANE);
      check(`ink: a ${kind} hit by a blob breaks (as a dash or a blast would)`, r.fired && r.state === 1, JSON.stringify(r));
    }
    // ---- Pip: in his cage (seed 5 has the rescue), the blob breaks the cage; then, free, a blob hurts him ----
    {
      const r = await page.evaluate(() => {
        const q0 = __octo.extras().quest;
        const pip = __octo.npcs().find((n) => n.who === 'pip');
        if (!q0 || !pip) return { none: true };
        const free = (x, y) => !__octo.isSolid(x, y) && !__octo.isSolid(x, y - 0.3) && !__octo.isSolid(x, y + 0.3);
        let side = 0;
        for (const s of [-1, 1]) { let ok = true; for (let t = 0.5; t <= 2.4; t += 0.15) if (!free(pip.x + s * t, pip.cy)) ok = false; if (ok) { side = s; break; } }
        if (!side) return { lane: false };
        __octo.teleport(pip.x + side * 2.2, pip.cy);
        __octo.step(80);
        const fired1 = __octo.fireInk(-side, 0);
        __octo.step(20);
        const q1 = __octo.extras().quest, hp1 = __octo.npcs().find((n) => n.who === 'pip').hp;
        // free and following: wait for the refill, then shoot him where he is
        __octo.step(80);
        const p2 = __octo.npcs().find((n) => n.who === 'pip'), o = __octo.state().octopus;
        const fired2 = __octo.fireInk(p2.x - o.x, p2.cy - o.y);
        __octo.step(20);
        const p3 = __octo.npcs().find((n) => n.who === 'pip');
        return { fired1, following: q1.following, hp0: pip.hp, hp1, fired2, hp3: p3 && p3.hp, hostile: p3 && p3.hostile, dead: !p3 || p3.dead };
      });
      check('ink: a blob on the caged critter breaks the cage (he follows) without hurting him', r.fired1 && r.following === true && r.hp1 === r.hp0, JSON.stringify(r));
      check('ink: Pip, free, is hit: he loses health and turns on you (or dies)', r.fired2 && (r.dead || (r.hp3 < r.hp1 && r.hostile)), JSON.stringify(r));
    }
    // ---- background fish: search a few levels for one with a clear lane ----
    {
      let res = null;
      for (const seed of [5, 7, 11, 13, 17, 21, 29, 33]) {
        const pg = seed === 5 ? page : await open(browser, '?at=1&seed=' + seed);
        res = await pg.evaluate(() => {
          const free = (x, y) => !__octo.isSolid(x, y) && !__octo.isSolid(x, y - 0.3) && !__octo.isSolid(x, y + 0.3);
          const list = __octo.ambientFish().fish;
          for (const f of list) {
            let ok = true;
            for (let t = 0; t <= 2.4; t += 0.15) if (!free(f.x - t, f.y)) { ok = false; break; }
            if (!ok) continue;
            const before = __octo.ambientFish();
            const corpses0 = __octo.corpses().length;
            __octo.teleport(f.x - 2.2, f.y);
            __octo.step(80); // refill the jet
            const g = __octo.ambientFish().fish.find((h) => h.kind === f.kind && Math.hypot(h.x - f.x, h.y - f.y) < 1);
            if (!g) continue;
            __octo.teleport(g.x - 2.2, g.y);
            const fired = __octo.fireInk(1, 0);
            __octo.step(20);
            const after = __octo.ambientFish();
            const bodies = __octo.corpses().filter((c) => c.kind === 'ambient-' + f.kind).length;
            return { kind: f.kind, fired, killedBefore: before.killed, killed: after.killed, left: after.fish.length, had: before.fish.length, bodies, corpses0 };
          }
          return { none: list.length };
        });
        if (seed !== 5) await pg.close();
        if (res && res.kind) { res.seed = seed; break; }
      }
      check('ink: a background fish hit by a blob dies (struck off the level) and leaves a small corpse', !!res && res.fired && res.killed === res.killedBefore + 1 && res.left === res.had - 1 && res.bodies >= 1, JSON.stringify(res));
    }
    check('no page errors', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
    await page.close();
  } finally { await browser.close(); }
  console.log(fails.length ? 'FAILED ' + fails.length : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
