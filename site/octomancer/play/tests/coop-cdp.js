// Node script (not part of tests/index.html): local co-op Phase 1 (octomancer-web/MULTIPLAYER-PLAN.md) in real Chrome, with two
// fake standard pads (navigator.getGamepads stubbed; __octo.pads([...]) drives them) and the keyboard. Pad A plays solo, Start
// pauses, pad B presses A in the pause menu and joins as player 2 (teal); both swim on their own sticks; the shared camera
// frames both and zooms out (at most 1.6x) as they spread; player 2 dies and is out (no death screen), the next level revives
// them with 2 hearts; Remove then Add (pad B again) brings back the hearts they had; Enter on the keyboard joins as player 3;
// the exit pull draws the others to the whirlpool; game over when every player is dead; four players in the hub; frame time and
// canvas memory with four players at 1440x900. Frames: octomancer-web/night/coop-*.png.
//   node coop-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '64200';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'coop-');
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
/** A tap of pad buttons (states by pad index): a neutral poll (a pad that just changed role is read fresh), down for a poll, then up. */
async function tapPads(p, list) { await PADS(p, list.map(() => ({}))); await PADS(p, list); await PADS(p, list.map(() => ({}))); }
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });
/** Is world point (x, y) inside the view of the camera now (CSS px margin `m`)? */
const inView = (c, x, y, m = 0) => {
  const W = 1440, H = 900, dpr = c.dpr || 1;
  const sx = (x - c.camera.x) * c.camera.ppu / dpr + W / 2, sy = (y - c.camera.y) * c.camera.ppu / dpr + H / 2;
  return sx >= m && sx <= W - m && sy >= m && sy <= H - m;
};
async function camInfo(page) { const c = await C(page); c.dpr = await page.evaluate(() => __octo.metrics().dpr); return c; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 });
  try {
    const page = await open(browser, '?at=1&seed=5');
    await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
    // ---- pad A plays solo
    await PADS(page, [{}, {}]);
    let c = await C(page);
    check('solo: one player on any device, no strips, no player rows', c.players.length === 1 && c.players[0].device === null && c.strips.length === 0);
    check('solo: pad A is the primary pad, pad B is seen as a free pad', /#0$/.test(c.primary) && c.others.length === 1 && /#1$/.test(c.others[0].key), c.primary + ' ' + JSON.stringify(c.others));
    const s0 = c.players[0];
    await PADS(page, [{ lx: 1 }, {}]); await step(page, 25);
    c = await C(page);
    check('solo: pad A swims player 1', c.players[0].x > s0.x + 0.5, s0.x.toFixed(2) + ' -> ' + c.players[0].x.toFixed(2));
    await PADS(page, [{}, { lx: -1 }]); const bx = c.players[0].x; await step(page, 20);
    c = await C(page);
    check('solo: the idle pad B does not swim player 1 (no turn to the left)', c.players[0].x >= bx - 0.05, bx.toFixed(2) + ' -> ' + c.players[0].x.toFixed(2));
    await PADS(page, [{}, {}]); await step(page, 5);

    // ---- pause on pad A, pad B presses A: player 2 joins
    await page.evaluate(() => __octo.freeze(false));
    await tapPads(page, [{ start: true }, {}]);
    let st = await page.evaluate(() => __octo.state().paused);
    check('Start on pad A pauses', st);
    c = await C(page);
    check('the pause menu offers Add player', /Add player: press A on a pad or Enter on the keyboard/.test(c.add), c.add);
    await tapPads(page, [{}, { a: true }]);
    c = await C(page);
    check('pad B joins as player 2 (teal), player 1 is bound to pad A', c.players.length === 2 && c.players[1].slot === 1 && /#1$/.test(c.players[1].device) && /#0$/.test(c.players[0].device) && c.players[1].colour === 'teal' && !!c.players[1].tint, JSON.stringify(c.players.map((p) => [p.slot, p.device, p.colour])));
    check('player 2 starts with base stats (3 hearts, 3 bombs, a full jar, the starting bar)', c.players[1].hearts === 3 && c.players[1].bombs === 3 && c.players[1].juice > 0);
    check('player 2 appears beside player 1', Math.hypot(c.players[1].x - c.players[0].x, c.players[1].y - c.players[0].y) < 3.2);
    check('the pause menu shows two player rows', c.rows.length === 2 && /P1/.test(c.rows[0]) && /P2/.test(c.rows[1]), JSON.stringify(c.rows));
    check('co-op: no primary pad (each pad is its own player)', c.primary === '');
    await shot(page, 'pause');
    // the same pad again: it already plays (its A is a menu press now, so ask the join directly)
    const again = await page.evaluate((k) => __octo.join(k), c.players[1].device);
    c = await C(page);
    check('the same pad cannot join twice', !again && c.players.length === 2);
    await tapPads(page, [{ start: true }, {}]);
    st = await page.evaluate(() => __octo.state().paused);
    check('Start on pad A resumes', !st);
    await page.evaluate(() => __octo.freeze(true));

    // ---- both swim on their own sticks
    c = await C(page);
    const a0 = c.players[0], b0 = c.players[1];
    await PADS(page, [{ lx: 1 }, { lx: -1 }]); await step(page, 25);
    c = await C(page);
    check('both move independently (A right, B left)', c.players[0].x > a0.x + 0.4 && c.players[1].x < b0.x - 0.4, [a0.x, c.players[0].x, b0.x, c.players[1].x].map((v) => v.toFixed(2)).join(' '));
    await PADS(page, [{}, {}]); await step(page, 10);
    c = await camInfo(page);
    check('the shared camera frames both', inView(c, c.players[0].x, c.players[0].y, 20) && inView(c, c.players[1].x, c.players[1].y, 20));
    await page.waitForFunction(() => __octo.coop().tints.ready >= 1, { timeout: 10000, polling: 100 }).catch(() => {}); // the teal sheet builds in a few short tasks
    await step(page, 1);
    check('two HUD strips, one per player', c.strips.length === 2 && /P1/.test(c.strips[0]) && /P2/.test(c.strips[1]), JSON.stringify(c.strips));
    await shot(page, 'level-two');

    // ---- spread out: the camera zooms out, capped at 1.6x
    const lv = await page.evaluate(() => { const l = __octo.level(); return { w: l.w, h: l.h, tiles: l.tiles, sx: l.startX, sy: l.startY }; });
    const open1 = (x, y) => lv.tiles[Math.floor(y) * lv.w + Math.floor(x)] === 0;
    let far = null;
    for (let d = 9; d <= 22 && !far; d++) for (const [dx, dy] of [[0, d * 0.8], [0, -d * 0.8], [d * 1.6, 0], [-d * 1.6, 0], [d, d * 0.6], [-d, d * 0.6]]) { const x = c.players[0].x + dx, y = c.players[0].y + dy; if (open1(x, y) && open1(x, y - 0.4) && open1(x, y + 0.4)) { far = { x, y }; break; } }
    check('found open water away from player 1', !!far);
    if (far) {
      await page.evaluate((f) => __octo.teleportPlayer(1, f.x, f.y), far);
      await page.evaluate(() => __octo.freeze(false)); await sleep(2200); await page.evaluate(() => __octo.freeze(true));
      c = await camInfo(page);
      const zoom = c.camera.solo / c.camera.ppu;
      check('spread out: the camera zooms out (more than 1x, at most 1.6x)', zoom > 1.05 && zoom <= 1.6001, zoom.toFixed(3));
      check('and still frames both', inView(c, c.players[0].x, c.players[0].y, 0) && inView(c, c.players[1].x, c.players[1].y, 0));
      await page.evaluate((x, y) => __octo.teleportPlayer(1, x, y), c.players[0].x + 1, c.players[0].y);
    }

    // ---- player 2 dies: out until the next level, no death screen
    await page.evaluate(() => __octo.killPlayer(1));
    await step(page, 30);
    c = await C(page);
    check('player 2 dies and is out; player 1 plays on; no death screen', c.players[1].dead && !c.players[0].dead && !c.gameOver);
    check('player 2 strip says out', /out/.test(c.strips[1] || ''), c.strips[1]);
    // the dead are not framed: the zoom comes back to 1x
    await page.evaluate(() => __octo.freeze(false)); await sleep(1500); await page.evaluate(() => __octo.freeze(true));
    c = await camInfo(page);
    check('the camera ignores the dead player (solo zoom again)', Math.abs(c.camera.solo / c.camera.ppu - 1) < 0.03, (c.camera.solo / c.camera.ppu).toFixed(3));

    // ---- the next level revives them with 2 hearts
    await page.evaluate(() => { __octo.freeze(false); __octo.runEvent('exit'); });
    await sleep(500); await waitLevel(page); await sleep(800);
    c = await C(page);
    let lvl = await page.evaluate(() => __octo.level().run.level);
    check('next level (1-2): player 2 revives with 2 hearts', lvl === 2 && c.players.length === 2 && !c.players[1].dead && c.players[1].hearts === 2, 'level ' + lvl + ' ' + JSON.stringify(c.players.map((p) => [p.hearts, p.dead])));
    check('player 1 keeps its hearts', c.players[0].hearts === 3);

    // ---- Remove, then Add again: the hearts come back
    await page.evaluate(() => __octo.setPlayerHearts(1, 1));
    await tapPads(page, [{ start: true }, {}]);
    await sleep(100);
    const removed = await page.evaluate(() => { const b = [...document.querySelectorAll('.octo-coop-row')].find((r) => r.dataset.slot === '1'); const btn = b && b.querySelector('.octo-coop-remove'); if (btn) btn.click(); return !!btn; });
    c = await C(page);
    check('Remove (pause menu) takes player 2 out; the game is solo again', removed && c.players.length === 1 && c.records.length === 1 && c.records[0].hearts === 1, JSON.stringify(c.records));
    check('still paused after Remove', await page.evaluate(() => __octo.state().paused));
    await tapPads(page, [{}, { a: true }]);
    c = await C(page);
    check('pad B adds again: player 2 is back in teal with the 1 heart it had', c.players.length === 2 && c.players[1].slot === 1 && c.players[1].hearts === 1 && c.records.length === 0, JSON.stringify(c.players.map((p) => [p.slot, p.hearts])));

    // ---- the keyboard joins as player 3
    await page.keyboard.press('Enter');
    await sleep(100);
    c = await C(page);
    check('Enter on the keyboard joins as player 3 (ochre)', c.players.length === 3 && c.players[2].device === 'keyboard' && c.players[2].colour === 'ochre', JSON.stringify(c.players.map((p) => [p.slot, p.device])));
    check('three player rows in the pause menu', c.rows.length === 3);
    await shot(page, 'pause-three');
    await tapPads(page, [{ start: true }, {}]);
    await page.evaluate(() => __octo.freeze(true));
    c = await C(page);
    const k0 = c.players[2];
    await page.keyboard.down('KeyA'); await step(page, 20); await page.keyboard.up('KeyA'); await step(page, 2);
    c = await C(page);
    check('the keyboard swims player 3 only', c.players[2].x < k0.x - 0.3 && Math.abs(c.players[0].x - c.players[0].x) < 1e-9, k0.x.toFixed(2) + ' -> ' + c.players[2].x.toFixed(2));
    check('three strips, smaller', c.strips.length === 3);
    await page.waitForFunction(() => __octo.coop().tints.ready >= 2, { timeout: 10000, polling: 100 }).catch(() => {});
    await step(page, 1);
    await shot(page, 'level-three');

    // ---- the exit pull: player 1 at the whirlpool, the hand: the others are drawn in, then the level changes
    const ex = await page.evaluate(() => { const l = __octo.level(); return { x: l.exitX + 0.5, y: l.exitY + 0.5 }; });
    await page.evaluate((e) => __octo.teleportPlayer(0, e.x, e.y), ex);
    const pulled = await page.evaluate(() => __octo.pressHandOf(0));
    c = await C(page);
    check('the hand at the whirlpool starts the pull (co-op)', pulled && !!c.pull && c.players[1].sealed && c.players[2].sealed);
    const d0 = c.players.slice(1).map((p) => Math.hypot(p.x - ex.x, p.y - ex.y));
    await step(page, 75);
    c = await C(page);
    const d1 = c.players.slice(1).map((p) => Math.hypot(p.x - ex.x, p.y - ex.y));
    const nearExit = d1.map((d) => d.toFixed(1)).join(',');
    check('after 1.5 s the others are halfway to the whirlpool', !!c.pull && d1.every((d, i) => d < d0[i] * 0.6 + 0.01), d0.map((d) => d.toFixed(1)) + ' -> ' + nearExit);
    await step(page, 80);
    c = await C(page);
    check('after 3 s they are in and the entry runs', !c.pull && c.players[1].hidden && c.players[2].hidden, JSON.stringify(c.players.map((p) => [p.hidden, p.sealed])) + ' ' + nearExit);
    await page.evaluate(() => __octo.freeze(false));
    await page.waitForFunction(() => __octo.level().run.level === 3 || __octo.level().run.state !== 2, { timeout: 15000 }).catch(() => {});
    await waitLevel(page); await sleep(600);
    lvl = await page.evaluate(() => __octo.level().run.level);
    c = await C(page);
    check('the pull ends in the next level with all three', lvl === 3 && c.players.length === 3 && c.players.every((p) => !p.hidden), 'level ' + lvl);

    // ---- friendly fire (Daniel 2026-10-17): a bomb blast kills a teammate too; the others, out of reach, are fine
    {
      const L = await page.evaluate(() => { const l = __octo.level(); return { w: l.w, tiles: l.tiles }; });
      const openAt = (x, y) => L.tiles[Math.floor(y) * L.w + Math.floor(x)] === 0 && L.tiles[Math.floor(y - 0.5) * L.w + Math.floor(x)] === 0 && L.tiles[Math.floor(y + 0.5) * L.w + Math.floor(x)] === 0;
      const p0 = c.players[0];
      let spot = null;
      for (let r = 6; r < 14 && !spot; r += 0.5) for (let a = 0; a < 6.28 && !spot; a += 0.3) { const x = p0.x + Math.cos(a) * r, y = p0.y + Math.sin(a) * r; if (openAt(x, y) && c.players.every((q) => Math.hypot(q.x - x, q.y - y) > 5)) spot = { x, y }; }
      check('found a spot for the friendly-fire bomb', !!spot);
      if (spot) {
        await page.evaluate((q) => { __octo.freeze(true); __octo.god(false); __octo.teleportPlayer(1, q.x, q.y); __octo.bombAt(q.x + 0.3, q.y, 0.2); }, spot);
        await step(page, 40);
        c = await C(page);
        check('friendly fire: the bomb kills player 2, players 1 and 3 are fine', c.players[1].dead && !c.players[0].dead && !c.players[2].dead, JSON.stringify(c.players.map((q) => q.dead)));
        await page.evaluate(() => __octo.god(true));
      }
    }

    // ---- game over when all are dead
    await page.evaluate(() => { __octo.freeze(true); __octo.killPlayer(0); __octo.killPlayer(1); });
    await step(page, 20);
    c = await C(page);
    check('two of three dead: no game over yet', !c.gameOver && !c.players[2].dead);
    await page.evaluate(() => __octo.killPlayer(2));
    await step(page, 30); await page.evaluate(() => __octo.freeze(false)); await sleep(1200);
    c = await C(page);
    check('every player dead: the death screen', c.gameOver, JSON.stringify(c.players.map((p) => p.dead)));
    check('no page errors (level)', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
    await page.close();

    // ---- four players in the hub; frame time and memory
    const hub = await open(browser, '?at=hub&seed=5&offer=0');
    await hub.evaluate(() => __octo.god(true));
    await PADS(hub, [{ lx: 0.4 }, {}, {}]); await sleep(200); await PADS(hub, [{}, {}, {}]);
    await tapPads(hub, [{ start: true }, {}, {}]);
    await tapPads(hub, [{}, { a: true }, {}]);
    await tapPads(hub, [{}, {}, { start: true }]);
    await hub.keyboard.press('Enter');
    c = await C(hub);
    check('hub: four players (pads A, B, C and the keyboard)', c.players.length === 4 && c.players.map((p) => p.colour).join() === 'red,teal,ochre,violet', JSON.stringify(c.players.map((p) => [p.slot, p.device])));
    check('a fifth device cannot join: the party is full', /full/.test(c.add));
    await tapPads(hub, [{ start: true }, {}, {}]);
    // spread them a little and let the tint sheets build
    const hp = c.players;
    await hub.evaluate((p) => { __octo.teleportPlayer(1, p[0].x - 2.5, p[0].y); __octo.teleportPlayer(2, p[0].x + 2.5, p[0].y - 0.5); __octo.teleportPlayer(3, p[0].x + 4.5, p[0].y); }, hp);
    await sleep(2500);
    c = await C(hub);
    check('the three player colour sheets are built (about 4.3 MB each)', c.tints.sheets === 3 && c.tints.ready === 3, JSON.stringify(c.tints));
    await shot(hub, 'hub-four');
    // frame time: four players swimming about for 6 s (real frames)
    await PADS(hub, [{ lx: 0.7, ly: 0.2 }, { lx: -0.6 }, { ly: -0.5, lx: 0.3 }]);
    await sleep(800);
    await hub.evaluate(() => __octo.metrics()); await sleep(6000);
    const m4 = await hub.evaluate(() => ({ ...__octo.metrics(), mem: __octo.memory() }));
    await PADS(hub, [{}, {}, {}]);
    console.log('INFO hub, 4 players, 1440x900: frame median ' + m4.frameMsMedian + ' ms, p95 ' + m4.frameMsP95 + ' ms, canvases ' + m4.mem.canvases + ' (' + m4.mem.canvasMB + ' MB), tints ' + (c.tints.bytes / 1048576).toFixed(1) + ' MB');
    check('hub, four players: frames stay smooth (median under 20 ms)', m4.frameMsMedian < 20, m4.frameMsMedian + ' ms');
    check('no page errors (hub)', hub.errs.length === 0, hub.errs.slice(0, 3).join(' | '));
    await hub.close();

    // ---- frame time in a level: solo vs four players spread out (the zoomed-out camera)
    const pf = await open(browser, '?at=1&seed=5');
    await pf.evaluate(() => __octo.god(true));
    await sleep(3000);
    const solo = await pf.evaluate(() => ({ ...__octo.metrics(), mem: __octo.memory() }));
    await PADS(pf, [{ lx: 0.2 }, {}, {}]); await sleep(100); await PADS(pf, [{}, {}, {}]);
    await tapPads(pf, [{ start: true }, {}, {}]);
    await tapPads(pf, [{}, { a: true }, {}]);
    await tapPads(pf, [{}, {}, { a: true }]);
    await pf.keyboard.press('Enter');
    await tapPads(pf, [{ start: true }, {}, {}]);
    c = await C(pf);
    const pl = c.players[0];
    const L = await pf.evaluate(() => { const l = __octo.level(); return { w: l.w, tiles: l.tiles }; });
    const openAt = (x, y) => L.tiles[Math.floor(y) * L.w + Math.floor(x)] === 0 && L.tiles[Math.floor(y - 0.5) * L.w + Math.floor(x)] === 0 && L.tiles[Math.floor(y + 0.5) * L.w + Math.floor(x)] === 0;
    const near = (x, y) => { for (let r = 0; r < 6; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (openAt(px, py)) return { x: px, y: py }; } return { x: pl.x, y: pl.y }; };
    const spots = [near(pl.x - 9, pl.y), near(pl.x + 9, pl.y + 4), near(pl.x + 3, pl.y + 7)]; // spread wide: the camera zooms out
    await pf.evaluate((sp) => sp.forEach((q, i) => __octo.teleportPlayer(i + 1, q.x, q.y)), spots);
    await PADS(pf, [{ lx: 0.5 }, { lx: -0.5 }, { ly: 0.5 }]);
    await sleep(7000);
    const four = await pf.evaluate(() => ({ ...__octo.metrics(), mem: __octo.memory(), z: __octo.coop().camera }));
    console.log('INFO level 1-1, 1440x900: solo frame median ' + solo.frameMsMedian + ' / p95 ' + solo.frameMsP95 + ' ms, canvases ' + solo.mem.canvases + ' (' + solo.mem.canvasMB + ' MB); four players median ' + four.frameMsMedian + ' / p95 ' + four.frameMsP95 + ' ms, canvases ' + four.mem.canvases + ' (' + four.mem.canvasMB + ' MB), zoom ' + (four.z.solo / four.z.ppu).toFixed(2) + ', dpr ' + four.dpr);
    check('level, four players: median frame under 20 ms', four.frameMsMedian < 20, four.frameMsMedian + ' ms');
    check('no page errors (perf)', pf.errs.length === 0, pf.errs.slice(0, 3).join(' | '));
    await pf.close();
  } finally {
    await browser.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
