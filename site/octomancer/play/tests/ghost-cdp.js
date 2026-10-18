// Node script (not part of tests/index.html): local co-op Phase 2, the ghosts (ghost.js, MULTIPLAYER-PLAN.md decisions 5 and 6),
// in real Chrome with two fake standard pads (navigator.getGamepads stubbed; __octo.pads([...]) drives them). Pad A plays,
// pad B joins as player 2 in the pause menu; player 2 dies and rises as a ghost about a second later; the ghost floats through
// rock, is not framed by the shared camera, blows a pot along (RT), charges a freeze (RB held 2.5 s, the ring) and freezes a
// piranha for 3 s (then the 10 s cooldown); the next level revives player 2 with 2 hearts; the rest grotto revives on arrival
// and its spring revives a ghost that floats into it; solo death is the death screen with no ghost.
// Frames (1440x900): octomancer-web/night/ghost-*.png.
//   node ghost-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '64300';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'ghost-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const STUB = "(() => { const f = () => (window.__octoFakePads || [null, null, null, null]); f.__octoFake = true; window.__octoFakePads = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, q) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  await page.evaluateOnNewDocument(STUB);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1200);
  page.errs = errs;
  return page;
}
const PADS = (p, list, polls = 1) => p.evaluate((l, n) => __octo.pads(l, n), list, polls);
const C = (p) => p.evaluate(() => __octo.coop());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
const waitLevel = (p) => p.waitForFunction(() => !__octo.transitioning(), { timeout: 30000, polling: 100 });
async function tapPads(p, list) { await PADS(p, list.map(() => ({}))); await PADS(p, list); await PADS(p, list.map(() => ({}))); }
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });
/** Steps with pad states held: the pads are polled before each step (a held button stays held). */
async function hold(p, list, n) { for (let i = 0; i < n; i++) { await PADS(p, list); await step(p, 1); } }
/** Pad B joins (pause on A, A on B, resume), then the sim is frozen for stepping; waits for the teal sheet. */
async function joinB(page) {
  await PADS(page, [{ lx: 0.3 }, {}]); await sleep(100); await PADS(page, [{}, {}]);
  await tapPads(page, [{ start: true }, {}]);
  await tapPads(page, [{}, { start: true }]);
  await tapPads(page, [{ start: true }, {}]);
  await page.evaluate(() => __octo.freeze(true));
  await page.waitForFunction(() => __octo.coop().tints.ready >= 1, { timeout: 10000, polling: 100 }).catch(() => {});
}
async function lvl(page) { return page.evaluate(() => { const l = __octo.level(); return { w: l.w, h: l.h, tiles: l.tiles, exitX: l.exitX, exitY: l.exitY, state: l.run.state, level: l.run.level }; }); }
const openAt = (L, x, y) => L.tiles[Math.floor(y) * L.w + Math.floor(x)] === 0;
const roomy = (L, x, y) => openAt(L, x, y) && openAt(L, x, y - 0.6) && openAt(L, x, y + 0.6) && openAt(L, x - 0.6, y) && openAt(L, x + 0.6, y);
const solidAt = (L, x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < L.w && ty < L.h && L.tiles[ty * L.w + tx] !== 0; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 });
  try {
    const page = await open(browser, '?at=1&seed=5');
    await page.evaluate(() => __octo.god(true));
    await joinB(page);
    let c = await C(page);
    check('pad B joined as player 2', c.players.length === 2 && c.players[1].colour === 'teal');
    check('the teal colour sheet is ready (the octopus is not drawn in red first)', c.tints.ready >= 1, JSON.stringify(c.tints));
    let L = await lvl(page);
    const p1 = c.players[0];
    // a roomy spot near player 1 for player 2 to die in
    let spot = null;
    for (let r = 1.5; r < 6 && !spot; r += 0.5) for (let a = 0; a < 6.28 && !spot; a += 0.4) { const x = p1.x + Math.cos(a) * r, y = p1.y + Math.sin(a) * r; if (roomy(L, x, y)) spot = { x, y }; }
    await page.evaluate((q) => __octo.teleportPlayer(1, q.x, q.y), spot || p1);

    // ---- player 2 dies: the body lies there, the ghost rises about a second later
    await page.evaluate(() => __octo.killPlayer(1));
    await step(page, 25);
    c = await C(page);
    check('just dead: no ghost yet (the body settles first)', c.players[1].dead && !c.players[1].ghost && !c.gameOver);
    await step(page, 30);
    c = await C(page);
    const g0 = c.players[1].ghost;
    check('about 1 s after the death: player 2 is a ghost', !!g0 && c.players[1].dead && !c.gameOver, JSON.stringify(g0));
    check('the ghost rises out of the body', g0 && Math.hypot(g0.x - c.players[1].x, g0.y - c.players[1].y) < 2);
    check('HUD strip: player 2 shows the ghost mark', /ghost/.test(c.strips[1] || ''), JSON.stringify(c.strips));
    const markShown = await page.evaluate(() => { const s = [...document.querySelectorAll('.octo-coop-strip')][1]; const g = s && s.querySelector('.octo-coop-ghost'), h = s && s.querySelector('.octo-coop-heart'); return !!g && g.style.display !== 'none' && h.style.display === 'none'; });
    check('HUD strip: hearts replaced by the ghost mark', markShown);

    // ---- the camera ignores the ghost
    const cam0 = { x: c.camera.x, y: c.camera.y, z: c.camera.solo / c.camera.ppu };
    await hold(page, [{}, { lx: 1, ly: -0.4 }], 40);
    c = await C(page);
    const g1 = c.players[1].ghost;
    const camZ = c.camera.solo / c.camera.ppu;
    check('the stick floats the ghost', Math.hypot(g1.x - g0.x, g1.y - g0.y) > 1.5, g0.x.toFixed(2) + ',' + g0.y.toFixed(2) + ' -> ' + g1.x.toFixed(2) + ',' + g1.y.toFixed(2));
    check('the shared camera does not frame the ghost (solo zoom, camera still on player 1)', Math.abs(camZ - 1) < 0.03 && Math.hypot(c.camera.x - cam0.x, c.camera.y - cam0.y) < 0.5, 'zoom ' + camZ.toFixed(3));
    await hold(page, [{}, {}], 30);

    // ---- it floats through rock: put it next to a solid tile near player 1 and push into it
    let rock = null;
    for (let r = 1.5; r < 7 && !rock; r += 0.5) for (let a = 0; a < 6.28 && !rock; a += 0.3) {
      const x = p1.x + Math.cos(a) * r, y = p1.y + Math.sin(a) * r;
      if (solidAt(L, x, y) && solidAt(L, x + 1, y) && openAt(L, x - 1.2, y)) rock = { x: x - 1.2, y, rx: x + 0.5, ry: y };
    }
    check('found rock near player 1', !!rock);
    if (rock) {
      await page.evaluate((q) => __octo.teleportGhost(1, q.x, q.y), rock);
      await hold(page, [{}, { lx: 1 }], 22);
      c = await C(page);
      const g = c.players[1].ghost;
      check('the ghost floats into the rock (no collision)', solidAt(L, g.x, g.y) && g.x > rock.x + 1, g.x.toFixed(2) + ',' + g.y.toFixed(2));
      await hold(page, [{}, {}], 20);
    }

    // ---- a ghost beside a live player (screenshot)
    c = await C(page);
    await page.evaluate((q) => __octo.teleportGhost(1, q.x + 1.6, q.y - 0.6), c.players[0]);
    await hold(page, [{}, {}], 3);
    await shot(page, 'beside');

    // ---- blow: the jet button (RT) pushes a pot along, no damage; 0.6 s cooldown
    let potSpot = null;
    for (let r = 2; r < 9 && !potSpot; r += 0.5) for (let a = 0; a < 6.28 && !potSpot; a += 0.3) {
      const x = p1.x + Math.cos(a) * r, y = p1.y + Math.sin(a) * r;
      if (roomy(L, x, y) && roomy(L, x - 1.3, y) && roomy(L, x + 1.5, y) && solidAt(L, x, y + 1.0)) potSpot = { x, y: Math.floor(y) + 0.6 };
    }
    check('found a floor for the pot', !!potSpot);
    if (potSpot) {
      await page.evaluate((q) => __octo.spawnLoot('pot', q.x, q.y), potSpot);
      await hold(page, [{}, {}], 40); // it settles
      const pots = await page.evaluate(() => __octo.props().filter((q) => q.kind === 'pot'));
      const pot = pots.reduce((b, q) => (!b || Math.hypot(q.x - potSpot.x, q.y - potSpot.y) < Math.hypot(b.x - potSpot.x, b.y - potSpot.y) ? q : b), null);
      check('the pot is there', !!pot && Math.hypot(pot.x - potSpot.x, pot.y - potSpot.y) < 1.5, JSON.stringify(pot));
      if (pot) {
        await page.evaluate((q) => __octo.teleportGhost(1, q.x - 1.1, q.y - 0.1), pot);
        await hold(page, [{}, { rt: 1, rx: 1 }], 1);
        c = await C(page);
        check('RT: the ghost blows (the puff, the cooldown)', c.players[1].ghost.puff > 0 && c.players[1].ghost.blowCd > 0.5);
        await hold(page, [{}, {}], 6);
        await shot(page, 'blow');
        await hold(page, [{}, {}], 30);
        const after = (await page.evaluate(() => __octo.props())).find((q) => q.i === pot.i);
        check('the blow pushed the pot along the aim', after && after.x > pot.x + 0.15, pot.x.toFixed(2) + ' -> ' + (after ? after.x.toFixed(2) : 'gone'));
        check('a blow does no damage: the pot is still whole', !!after && after.kind === 'pot');
      }
    }

    // ---- freeze: RB held 2.5 s charges (the ring), let go: the nearest creature freezes 3 s; 10 s cooldown
    c = await C(page);
    let fz = null;
    for (let r = 3; r < 10 && !fz; r += 0.5) for (let a = 0; a < 6.28 && !fz; a += 0.3) {
      const x = p1.x + Math.cos(a) * r, y = p1.y + Math.sin(a) * r;
      if (roomy(L, x, y) && roomy(L, x + 2.4, y) && roomy(L, x + 1.2, y)) fz = { x, y };
    }
    check('found open water for the freeze', !!fz);
    if (fz) {
      await page.evaluate((q) => __octo.teleportGhost(1, q.x, q.y), fz);
      await hold(page, [{}, { rb: true }], 60);
      c = await C(page);
      const ch = c.players[1].ghost.charge;
      check('RB held 1.2 s: charging, the ring about half full', c.players[1].ghost.charging && ch > 1.0 && ch < 1.4, ch.toFixed(2));
      await shot(page, 'charge');
      await hold(page, [{}, { rb: true }], 70);
      c = await C(page);
      check('RB held 2.6 s: fully charged, waiting for the release', Math.abs(c.players[1].ghost.charge - 2.5) < 1e-3);
      const gh = c.players[1].ghost;
      const sp = await page.evaluate((q) => __octo.spawn('piranha', q.x + 2.4, q.y, 'open'), gh);
      await hold(page, [{}, { rb: true }], 1);
      await hold(page, [{}, {}], 1);
      let e = (await page.evaluate(() => __octo.enemies())).find((q) => q.id === sp.id);
      c = await C(page);
      check('let go: the piranha freezes for about 3 s', e && e.frozen > 2.8 && e.frozen <= 3, e && e.frozen.toFixed(2));
      check('the freeze cooldown is 10 s', Math.abs(c.players[1].ghost.freezeCd - 10) < 0.1, c.players[1].ghost.freezeCd.toFixed(2));
      const ex0 = { x: e.x, y: e.y };
      await hold(page, [{}, {}], 40);
      await shot(page, 'frozen');
      e = (await page.evaluate(() => __octo.enemies())).find((q) => q.id === sp.id);
      check('frozen: it does not move', e && Math.hypot(e.x - ex0.x, e.y - ex0.y) < 0.02);
      await hold(page, [{}, { rb: true }], 40);
      c = await C(page);
      check('RB during the cooldown: no charge', !c.players[1].ghost.charging && c.players[1].ghost.charge === 0);
      await hold(page, [{}, {}], 80);
      e = (await page.evaluate(() => __octo.enemies())).find((q) => q.id === sp.id);
      check('after 3 s it thaws', e && !(e.frozen > 0));
      // a short press cancels
      await page.evaluate(() => __octo.freeze(true));
    }

    // ---- the ghost cannot be hurt and is not a target: still dead, still a ghost, no game over
    c = await C(page);
    check('still a ghost, player 1 alive, no death screen', c.players[1].dead && !!c.players[1].ghost && !c.players[0].dead && !c.gameOver);

    // ---- the pause menu row says ghost
    await tapPads(page, [{ start: true }, {}]);
    c = await C(page);
    check('pause menu: player 2 row says ghost', /ghost/.test(c.rows[1] || ''), JSON.stringify(c.rows));
    await tapPads(page, [{ start: true }, {}]);

    // ---- the next level revives with 2 hearts
    await page.evaluate(() => { __octo.freeze(false); __octo.runEvent('exit'); });
    await sleep(500); await waitLevel(page); await sleep(800);
    c = await C(page);
    L = await lvl(page);
    check('next level (1-2): player 2 is alive again with 2 hearts, no ghost', L.level === 2 && !c.players[1].dead && c.players[1].hearts === 2 && !c.players[1].ghost, JSON.stringify(c.players.map((p) => [p.hearts, p.dead, !!p.ghost])));
    check('no page errors (level)', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
    await page.close();

    // ---- the rest grotto: arriving revives; its spring revives a ghost that floats into it
    const rp = await open(browser, '?at=3&seed=5');
    await rp.evaluate(() => __octo.god(true));
    await joinB(rp);
    await rp.evaluate(() => __octo.killPlayer(1));
    await step(rp, 60);
    c = await C(rp);
    check('1-3: player 2 is a ghost', !!c.players[1].ghost);
    await rp.evaluate(() => { __octo.freeze(false); __octo.runEvent('exit'); });
    await sleep(500); await waitLevel(rp); await sleep(800);
    L = await lvl(rp);
    c = await C(rp);
    check('the rest grotto: player 2 arrives alive with 2 hearts', L.state === 4 && !c.players[1].dead && c.players[1].hearts === 2 && !c.players[1].ghost, 'state ' + L.state + ' ' + JSON.stringify(c.players.map((p) => [p.hearts, p.dead])));
    const sp2 = await rp.evaluate(() => __octo.juice().spring);
    await rp.evaluate(() => { __octo.freeze(true); __octo.killPlayer(1); });
    await step(rp, 60);
    c = await C(rp);
    check('killed in the grotto: a ghost again', !!c.players[1].ghost);
    check('the grotto has a spring', !!sp2, JSON.stringify(sp2));
    if (sp2) {
      await rp.evaluate((s) => { __octo.teleportPlayer(0, s.x - 3, s.y - 1); }, sp2); // player 1 nearby: the ghost stays in the camera's view
      await rp.evaluate(() => __octo.stepDraw(30));
      await rp.evaluate((s) => __octo.teleportGhost(1, s.x, s.y - 0.2), sp2);
      await step(rp, 3);
      c = await C(rp);
      check('the spring revives the ghost: alive, every heart', !c.players[1].dead && !c.players[1].ghost && c.players[1].hearts === c.players[1].heartMax, JSON.stringify(c.players[1]));
    }
    // ---- solo: the only player dies: the death screen, no ghost
    await rp.evaluate(() => __octo.removePlayer(1));
    await rp.evaluate(() => { __octo.god(false); __octo.killPlayer(0); });
    await step(rp, 30); await rp.evaluate(() => __octo.freeze(false)); await sleep(1500);
    c = await C(rp);
    check('solo death: the death screen, no ghost', c.players.length === 1 && c.players[0].dead && !c.players[0].ghost && c.gameOver);
    check('no page errors (grotto)', rp.errs.length === 0, rp.errs.slice(0, 3).join(' | '));
    await rp.close();
  } finally {
    await browser.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
