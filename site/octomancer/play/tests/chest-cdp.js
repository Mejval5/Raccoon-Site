// Node script (not part of tests/index.html): the giant clam (loot.js LK_CHEST, "barnacle clam") in the real game, headless Chrome.
// Daniel 2026-10-18, at a wreck in the Shallows: "this shell doesn't seem to do anything now". The clam did open and pay, but the
// shells it pops up into the wreck's hold were drawn UNDER the hull (render.js drew the wreck in preEnemyDraw, after the pickups),
// so nothing seemed to come out. This checks, at the wreck of ?at=1&seed=2 (level 1-1):
//  - solo: touching a fresh clam opens it (its state, and the open sprite drawn in place of the shut one), its shells come out
//    and each one is VISIBLE (the frame differs where it lies when it is hidden for one frame), and taking them pays the clam's
//    shells; a spike-trapped clam rattles then bursts, a swarm-trapped one lets piranhas out;
//  - co-op with two stubbed pads: player 2 touching the clam opens it, the carried item goes into player 2's pack (not the
//    focus player's), and player 2 picking the shells up pays the shared count.
// Frames: octomancer-web/night/chest-*.png.
//   node chest-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '65400';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'chest-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const STUB = "(() => { const f = () => (window.__octoFakePads || [null, null, null, null]); f.__octoFake = true; window.__octoFakePads = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, q, pads = false) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  if (pads) await page.evaluateOnNewDocument(STUB);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1500);
  await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
  page.errs = errs;
  return page;
}

// In-page helpers: the number of canvas pixels that differ between two renders of the same frame inside a world-space box.
const HELPERS = () => {
  window.__chest = {
    /** Canvas pixel rect of a world box (camera as it is now: settle() it first, the camera eases on every drawn frame). */
    rect(x0, y0, x1, y1) {
      const cv = document.getElementById('game'), c = __octo.state().camera;
      const sx = (x) => Math.round((x - c.x) * c.ppu + cv.width / 2), sy = (y) => Math.round((y - c.y) * c.ppu + cv.height / 2);
      const X0 = Math.max(0, sx(x0)), Y0 = Math.max(0, sy(y0)), X1 = Math.min(cv.width, sx(x1)), Y1 = Math.min(cv.height, sy(y1));
      return X1 > X0 && Y1 > Y0 ? [X0, Y0, X1 - X0, Y1 - Y0] : null;
    },
    read(r) { return r ? document.getElementById('game').getContext('2d').getImageData(r[0], r[1], r[2], r[3]).data : null; },
    settle() { for (let k = 0; k < 150; k++) __octo.stepDraw(0); },
    diff(a, b) { if (!a || !b || a.length !== b.length) return -1; let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++; return n; },
  };
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 });
  try {
    // ---------------- solo ----------------
    const page = await open(browser, '?at=1&seed=2');
    await page.evaluate(HELPERS);
    const wreck = await page.evaluate(() => { const l = __octo.loot(); const i = l.items.findIndex((it) => it.kind === 'chest'); return i < 0 ? null : { i, ...l.items[i] }; });
    check('1-1 (seed 2) has a giant clam at its wreck, shut', !!wreck && wreck.state === 0, JSON.stringify(wreck));
    if (!wreck) throw new Error('no chest');
    const r = await page.evaluate((c) => {
      const o = {};
      __octo.teleport(c.x - 4, c.y - 1); __octo.stepDraw(30);
      o.shells0 = __octo.state().pickups.shells;
      // touch it
      __octo.teleport(c.x, c.y - 0.6); __octo.stepDraw(2);
      o.state = __octo.loot().items[c.i].state;
      // swim off before the shells can be taken (they pop up for SHELL_PICKUP_DELAY), let them settle
      __octo.teleport(c.x - 4, c.y - 1); __octo.stepDraw(40);
      const ds = __octo.droppedShells();
      o.dropped = ds.map((s) => ({ x: s.x, y: s.y, v: s.value }));
      o.droppedValue = ds.reduce((a, s) => a + (s.value || 1), 0);
      // the open sprite: the clam drawn open now, drawn shut for one frame (same camera, same time), differs
      __chest.settle();
      const cr = __chest.rect(c.x - 0.6, c.y - 0.9, c.x + 0.6, c.y + 0.5);
      __octo.stepDraw(0); const open = __chest.read(cr);
      __octo.setLootState(c.i, 0); __octo.stepDraw(0);
      const shut = __chest.read(cr);
      __octo.setLootState(c.i, o.state); __octo.stepDraw(0);
      o.spriteDiff = __chest.diff(open, shut);
      __octo.stepDraw(0); o.noise = __chest.diff(open, __chest.read(cr)); // the same frame again: nothing moves
      // every shell is visible: hidden for one frame, the frame differs where it lies (the wreck's hull hid them before)
      //   (measured against the same kind of shell put down in open water: its whole sprite, nothing in front of it)
      const shows = (it) => {
        const sr = __chest.rect(it.x - 0.3, it.y - 0.3, it.x + 0.3, it.y + 0.3);
        __octo.stepDraw(0); const a = __chest.read(sr);
        it.collected = true; __octo.stepDraw(0);
        const b = __chest.read(sr);
        it.collected = false; __octo.stepDraw(0);
        return __chest.diff(a, b);
      };
      const free = (x, y) => !__octo.isSolid(x, y);
      let fx = c.x - 4, fy = c.y - 2.5;
      for (let k = 0; k < 40 && !(free(fx, fy) && free(fx - 0.5, fy - 0.5) && free(fx + 0.5, fy + 0.5) && free(fx - 0.5, fy + 0.5) && free(fx + 0.5, fy - 0.5)); k++) fy -= 0.5;
      o.vis = ds.map((s) => {
        const ref = __octo.dropShellAt(fx, fy, s.sk); // not stepped: it stays where it is put
        const full = shows(ref);
        ref.collected = true;
        const seen = shows(s);
        return { seen, full, part: full > 0 ? +(seen / full).toFixed(2) : 0 };
      });
      return o;
    }, wreck);
    check('touching the fresh clam opens it (state leaves intact)', r.state !== 0, 'state ' + r.state);
    check('the open clam is drawn with the open sprite (differs from the shut one in place)', r.spriteDiff > 150 && r.noise >= 0 && r.noise < 20, r.spriteDiff + ' px (same frame twice: ' + r.noise + ')');
    check(`its shells come out (${r.dropped.length} dropped, worth ${r.droppedValue} = the clam's ${wreck.count})`, r.dropped.length >= 1 && r.droppedValue === wreck.count, JSON.stringify(r.dropped));
    check('the shells pop up out of the clam into the hold', r.dropped.every((s) => s.y < wreck.y && s.y > wreck.y - 2.2 && Math.abs(s.x - wreck.x) < 1.8));
    check('every shell is visible, none hidden by the wreck\'s hull', r.vis.length > 0 && r.vis.every((v) => v.full >= 40 && v.part >= 0.75), JSON.stringify(r.vis));
    await page.screenshot({ path: OUT + 'open.png' });
    // take them
    const got = await page.evaluate(() => { const s0 = __octo.state().pickups.shells; for (const s of __octo.droppedShells()) { __octo.teleport(s.x, s.y); __octo.stepDraw(3); } return { gain: __octo.state().pickups.shells - s0, left: __octo.droppedShells().length }; });
    check(`taking them pays the clam's shells (+${got.gain}, ${got.left} left)`, got.gain === wreck.count && got.left === 0);
    const again = await page.evaluate((c) => { const s0 = __octo.state().pickups.shells; __octo.teleport(c.x, c.y - 0.6); __octo.stepDraw(60); return { gain: __octo.state().pickups.shells - s0, dropped: __octo.droppedShells().length }; }, wreck);
    check('an opened clam pays nothing a second time', again.gain === 0 && again.dropped === 0, JSON.stringify(again));
    await page.evaluate((c) => { __octo.teleport(c.x - 1.2, c.y - 0.8); __octo.stepDraw(2); }, wreck);
    await page.screenshot({ path: OUT + 'taken.png' });

    // traps, on clams put down in open water by the start
    const traps = await page.evaluate(() => {
      const free = (x, y) => !__octo.isSolid(x, y);
      const lv = __octo.level();
      let spot = null;
      for (let y = lv.startY; y < lv.startY + 20 && !spot; y += 1) for (let x = 3.5; x < 30; x += 1) if (free(x, y) && free(x + 1, y) && free(x - 1, y) && free(x, y - 1) && free(x, y - 2) && !free(x, y + 1)) { spot = { x, y }; break; }
      if (!spot) return null;
      const out = {};
      const i = __octo.addLoot('chest', spot.x, spot.y, 1);
      __octo.teleport(spot.x - 3, spot.y - 1); __octo.stepDraw(3);
      __octo.teleport(spot.x, spot.y - 0.6); __octo.stepDraw(2);
      out.rattle = __octo.loot().items[i].state;
      __octo.stepDraw(25);
      out.after = __octo.loot().items[i].state;
      __octo.teleport(spot.x - 4, spot.y - 1); __octo.stepDraw(30);
      out.spent = __octo.loot().items[i].state;
      const p0 = __octo.enemies().filter((e) => e.kind === 'piranha' && !e.dead).length;
      const j = __octo.addLoot('chest', spot.x, spot.y, 2);
      __octo.stepDraw(3);
      __octo.teleport(spot.x, spot.y - 0.6); __octo.stepDraw(3);
      out.swarm = __octo.enemies().filter((e) => e.kind === 'piranha' && !e.dead).length - p0;
      out.swarmState = __octo.loot().items[j].state;
      return out;
    });
    check('a spike-trapped clam opens with a rattle (state 2), then bursts and is spent', !!traps && traps.rattle === 2 && traps.after !== 2 && traps.spent === 1, JSON.stringify(traps));
    check('a swarm-trapped clam opens and lets piranhas out', !!traps && traps.swarm >= 1 && traps.swarmState === 1, JSON.stringify(traps));
    check('no page errors (solo)', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
    await page.close();

    // ---------------- co-op: player 2 opens it ----------------
    const cp = await open(browser, '?at=1&seed=2', true);
    const PADS = (list) => cp.evaluate((l) => __octo.pads(l, 1), list);
    const tap = async (list) => { await PADS(list.map(() => ({}))); await PADS(list); await PADS(list.map(() => ({}))); };
    await PADS([{}, {}]);
    await cp.evaluate(() => __octo.freeze(false));
    await tap([{ start: true }, {}]);
    await tap([{}, { start: true }]);
    await tap([{ start: true }, {}]);
    await cp.evaluate(() => __octo.freeze(true));
    const co = await cp.evaluate((c) => {
      const o = { n: __octo.coop().players.length };
      const before = __octo.coop().players.map((p) => p.items.slice());
      const s0 = __octo.state().pickups.shells;
      __octo.teleportPlayer(1, c.x, c.y - 0.6); __octo.stepDraw(2);
      o.state = __octo.loot().items[c.i].state;
      __octo.teleportPlayer(1, c.x - 4, c.y - 1); __octo.stepDraw(40);
      const ds = __octo.droppedShells();
      o.dropped = ds.reduce((a, s) => a + (s.value || 1), 0);
      for (const s of ds) { __octo.teleportPlayer(1, s.x, s.y); __octo.stepDraw(3); }
      o.gain = __octo.state().pickups.shells - s0;
      const after = __octo.coop().players.map((p) => p.items.slice());
      o.newP1 = after[0].filter((id) => !before[0].includes(id));
      o.newP2 = after[1].filter((id) => !before[1].includes(id));
      return o;
    }, wreck);
    check('co-op: two players', co.n === 2);
    check('co-op: player 2 touching the clam opens it', co.state !== 0, 'state ' + co.state);
    check(`co-op: its shells come out and player 2 takes them for the shared count (+${co.gain} of ${wreck.count})`, co.dropped === wreck.count && co.gain === wreck.count);
    check('co-op: the clam\'s carried item (seed 2: an Urchin Cap) goes to player 2 (the opener), not player 1', co.newP1.length === 0 && co.newP2.length === 1, JSON.stringify(co));
    await cp.screenshot({ path: OUT + 'coop.png' });
    check('no page errors (co-op)', cp.errs.length === 0, cp.errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('script ran', false, String(e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
