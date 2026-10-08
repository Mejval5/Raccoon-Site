// Node script (not part of tests/index.html): the hub village (data/hub.json, data/hub-rooms.json, js/hub-rooms.js) in real Chrome
// against a running copy of the game. Three saves (fresh, mid progress, everyone home) at 1440x900 and 412x915:
//   - which rooms are open, the 'moved in' lines, the residents standing in their own rooms, story.hubRooms remembered (a reload
//     with a person gone keeps the room open);
//   - the locked kelp curtain pushes the octopus back; the boarded / rubble doors are solid;
//   - F talks to Marlo in his workshop and to the keeper in his den;
//   - the Ink Jet practice target: three hits in the window win a round (the host calls it);
//   - the fish bone hides the keepsake: a dash crumbles it, the keepsake gives a bomb for the next dive, once;
//   - the hub is safe: no bomb from the keys, a bomb set off beside the octopus does not hurt it;
//   - the hub loads fast (the authored world step) and stays inside the canvas budget.
// Frames go to octomancer-web/night/hub-*.png.
//   node hub-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '63210';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'hub-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
const SAVES = {
  fresh: { v: 1, best: 0, runs: 0, muted: true, helpDone: true, tutorialDone: false, journal: [] },
  mid: { v: 1, best: 3, runs: 3, muted: true, helpDone: true, tutorialDone: true, journal: ['place-hub'], meta: { dives: 3, clears: 1 },
    story: { marlo: 1, saidMarlo: 1, pip: 1, saidPip: 1, quill: 1, saidQuill: 1, relics: 1, relicsGiven: 1 } },
  full: { v: 1, best: 9, runs: 12, muted: true, helpDone: true, tutorialDone: true, shortcut: true, journal: ['place-hub'], meta: { dives: 12, clears: 4 },
    story: { marlo: 3, saidMarlo: 3, pip: 2, saidPip: 2, quill: 2, saidQuill: 2, relics: 3, relicsGiven: 3, host: 1, saidHost: 1, mamaPip: 1, explorePip: 1 },
    journalStats: { 'person-keeper': [2, 0, 0, 1, 0, 0, 0] } },
};
const VPS = {
  desk: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

async function open(browser, saveName, vp = 'desk', extra = '') {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.setViewport(VPS[vp]);
  const save = typeof saveName === 'string' ? SAVES[saveName] : saveName;
  await page.evaluateOnNewDocument("try{if(!sessionStorage.getItem('keep'))localStorage.setItem('octomancer.best.v1'," + JSON.stringify(JSON.stringify(save)) + ");sessionStorage.setItem('keep','1')}catch(e){}");
  const t0 = Date.now();
  await page.goto(BASE + '?offer=0' + extra, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.transitioning() && __octo.hubRooms(), { timeout: 60000 });
  page.loadMs = Date.now() - t0;
  page.errs = errs;
  await sleep(600);
  return page;
}
const R = (p) => p.evaluate(() => __octo.hubRooms());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });
const room = (h, id) => h.rooms.find((r) => r.id === id);

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    // ================================================================== which rooms are open, per save
    const expect = { fresh: [], mid: ['workshop', 'nook', 'grotto'], full: ['workshop', 'nook', 'grotto', 'arena', 'den'] };
    for (const name of ['fresh', 'mid', 'full']) {
      const p = await open(browser, name);
      const h = await R(p);
      const opened = h.rooms.filter((r) => r.npc && r.open).map((r) => r.id).sort();
      check(`${name}: the open rooms are [${expect[name].join(', ')}]`, JSON.stringify(opened) === JSON.stringify(expect[name].slice().sort()), JSON.stringify(opened));
      check(`${name}: every open room is remembered in story.hubRooms`, h.rooms.every((r) => !r.open || (h.story.hubRooms & (1 << h.rooms.indexOf(r))) !== 0));
      check(`${name}: each resident stands inside their own open room`, h.residents.every((res) => { const r = h.rooms.find((x) => x.npc === res.id); return r && r.open && res.x >= r.x0 && res.x <= r.x1 + 1 && res.y >= r.y0 - 0.5 && res.y <= r.y1 + 1.6; }), JSON.stringify(h.residents.map((r) => [r.id, +r.x.toFixed(1), +r.y.toFixed(1)])));
      check(`${name}: the octopus is safe in the hub`, h.safe);
      const toast = await p.evaluate(() => { const t = document.querySelector('.octo-toast'); return t && t.style.display !== 'none' ? t.textContent : ''; });
      check(`${name}: a newly opened room says who moved in (or nothing on a fresh save)`, name === 'fresh' ? !/moved/.test(toast) : /moved/.test(toast), JSON.stringify(toast));
      check(`${name}: no page errors`, p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
      // frames: desktop and phone, the plaza and each room
      for (const vp of ['desk', 'phone']) {
        const q = vp === 'desk' ? p : await open(browser, name, 'phone');
        await q.evaluate(() => __octo.freeze(true));
        const spots = [['plaza', 36.5, 11.5], ['workshop', 59.5, 9.5], ['grotto', 12.5, 9.5], ['nook', 12.5, 27.5], ['arena', 59.5, 27.5], ['den', 16.5, 37.5], ['dive', 38.5, 32.5]];
        for (const [sn, x, y] of spots) {
          if (vp === 'phone' && !['plaza', 'workshop', 'nook', 'dive'].includes(sn)) continue;
          await q.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(40); }, x, y);
          await shot(q, `${name}-${vp}-${sn}`);
        }
        if (vp === 'phone') await q.close();
      }
      await p.close();
    }

    // ================================================================== persistence: a room once open stays open
    {
      const p = await open(browser, { ...SAVES.mid, meta: { dives: 0, clears: 0 }, story: { ...SAVES.mid.story, quill: 0, saidQuill: 0, hubRooms: 0 } }); // (Quill moves in after the first dive)
      let h = await R(p);
      check('persistence: with Quill not yet met the grotto is locked', !room(h, 'grotto').open);
      await p.close();
      const p2 = await open(browser, 'mid');
      h = await R(p2);
      const bits = h.story.hubRooms;
      await p2.close();
      const p3 = await open(browser, { ...SAVES.mid, story: { ...SAVES.mid.story, quill: 0, goneQuill: 1, hubRooms: bits } });
      h = await R(p3);
      check('persistence: the grotto, seen open before, stays open after Quill is gone (story.hubRooms)', room(h, 'grotto').open && !h.residents.some((r) => r.id === 'quill'));
      await p3.reload({ waitUntil: 'networkidle0' });
      await p3.waitForFunction(() => window.__octo && !__octo.transitioning() && __octo.hubRooms(), { timeout: 60000 });
      h = await R(p3);
      check('persistence: and after a reload', room(h, 'grotto').open && h.story.hubRooms === bits);
      await p3.close();
    }

    // ================================================================== seals: kelp pushes back, planks and rubble are solid
    {
      const p = await open(browser, 'fresh');
      await p.evaluate(() => __octo.freeze(true));
      let h = await R(p);
      const g = room(h, 'grotto');
      await p.evaluate((x, y) => { __octo.teleport(x, y); __octo.input({ move: { x: -1, y: 0 } }); __octo.stepDraw(150); __octo.input(null); }, g.dx1 + 2.5, g.dy0 + 2);
      const o = await p.evaluate(() => __octo.state().octopus);
      check('seal: swimming into the locked kelp curtain for 2.5 s never gets the octopus past it', o.x > g.dx0 - 0.2, `x ${o.x.toFixed(2)} door ${g.dx0}..${g.dx1 + 1}`);
      await shot(p, 'fresh-desk-kelp');
      const solid = await p.evaluate(() => { const h = __octo.hubRooms(); const w = h.rooms.find((r) => r.id === 'workshop'), d = h.rooms.find((r) => r.id === 'den'); return [__octo.tileAt(w.dx0, w.dy0), __octo.tileAt(d.dx0, d.dy0)]; });
      check('seal: the locked workshop door is timber, the den door rock', solid[0] === 4 && solid[1] === 1, JSON.stringify(solid));
      // safety: the bomb key does nothing; a bomb set off at the octopus does not hurt it
      const b0 = (await p.evaluate(() => __octo.state().octopus)).bombs;
      await p.evaluate(() => { __octo.teleport(36.5, 17.5); __octo.input({ bomb: { pressed: true, held: true } }); __octo.stepDraw(1); __octo.input(null); __octo.stepDraw(5); });
      const after = await p.evaluate(() => ({ o: __octo.state().octopus, live: __octo.bombsLive().length }));
      check('safe: the bomb key places no bomb in the hub', after.live === 0 && after.o.bombs === b0, JSON.stringify({ live: after.live, bombs: after.o.bombs }));
      const hearts = after.o.hearts;
      await p.evaluate(() => { const o = __octo.state().octopus; __octo.placeBomb(o.x, o.y); __octo.stepDraw(200); });
      const o2 = await p.evaluate(() => __octo.state().octopus);
      check('safe: a bomb blowing up on the octopus in the hub neither kills nor hurts it', !o2.dead && o2.hearts === hearts, JSON.stringify({ dead: o2.dead, hearts: o2.hearts }));
      await p.close();
    }

    // ================================================================== F talks; the practice target; the keepsake
    {
      const p = await open(browser, 'full');
      await p.evaluate(() => __octo.freeze(true));
      let h = await R(p);
      const marlo = h.residents.find((r) => r.id === 'marlo');
      await p.evaluate((x, y) => { __octo.teleport(x + 0.9, y - 0.8); __octo.stepDraw(30); }, marlo.x, marlo.y);
      // let any speech that started on approach run out, then F gives Marlo the turn
      await p.evaluate(() => __octo.stepDraw(900));
      const u0 = await p.evaluate(() => __octo.hand().uses);
      await p.keyboard.press('KeyF'); await step(p, 3);
      h = await R(p);
      check('talk: F beside Marlo in his workshop is an interact and he speaks', (await p.evaluate(() => __octo.hand().uses)) === u0 + 1 && h.talk.who === 'marlo', JSON.stringify(h.talk));
      await shot(p, 'full-desk-talk');
      // the keeper in his den
      const k = h.keeper;
      await p.evaluate((x, y) => { __octo.teleport(x + 1.0, y - 0.8); __octo.stepDraw(20); }, k.x, k.y);
      h = await R(p);
      check('talk: the keeper in his den says an off-duty line', !!h.keeperSays, JSON.stringify(h.keeperSays));
      // the practice target: three ink hits within the window
      const G = h.points.G;
      await p.evaluate((x, y) => { __octo.teleport(x - 2.5, y + 0.2); __octo.stepDraw(20); }, G[0] + 0.5, G[1]);
      for (let i = 0; i < 3; i++) await p.evaluate(() => { __octo.fireInk(1, -0.05); __octo.stepDraw(100); }); // 1.67 s apart (the jet's cooldown is 1.5 s)
      h = await R(p);
      check('target: three Ink Jet hits within the window win a practice round (story.hubPractice), the host calls it', h.story.hubPractice >= 1 && h.talk.who === 'host', JSON.stringify({ round: h.round, practice: h.story.hubPractice, talk: h.talk }));
      await shot(p, 'full-desk-target');
      // the fish bone: a dash crumbles it; the keepsake behind gives a bomb for the next dive, once
      const L = h.points.y;
      const boneX = L[0] - 4; // the bone wall sits two tiles left of the hollow
      const before = await p.evaluate((x, y) => [__octo.tileAt(x, y), __octo.tileAt(x + 1, y)], boneX, L[1]);
      check('secret: fish bone (material 3) seals the hollow', before.every((t) => t === 3), JSON.stringify(before));
      // the dash goes where the octopus faces: swim right along the chamber floor first, then dash into the bone
      for (let i = 0; i < 4; i++) await p.evaluate((x, y) => { __octo.teleport(x - 2.9, y + 0.4); __octo.input({ move: { x: 1, y: 0.1 } }); __octo.stepDraw(12); __octo.input({ move: { x: 1, y: 0.1 }, dash: { pressed: true, held: true } }); __octo.stepDraw(1); __octo.input({ move: { x: 1, y: 0 } }); __octo.stepDraw(40); }, boneX, L[1]);
      await p.evaluate(() => { __octo.input({ move: { x: 1, y: 0.2 } }); __octo.stepDraw(120); __octo.input(null); __octo.stepDraw(10); });
      const bone = await p.evaluate((x, y) => [__octo.tileAt(x, y), __octo.tileAt(x + 1, y)], boneX, L[1]);
      h = await R(p);
      check('secret: dashes crumble the fish bone and the octopus swims through to the keepsake', bone.some((t) => t === 0) && h.story.hubSecret === 1 && h.story.boonBombs >= 1, JSON.stringify({ bone, story: h.story }));
      await shot(p, 'full-desk-keepsake');
      const b1 = h.story.boonBombs;
      await p.evaluate((x, y) => { __octo.teleport(x - 2, y + 0.5); __octo.stepDraw(20); __octo.teleport(x + 0.5, y + 0.5); __octo.stepDraw(20); }, L[0], L[1]);
      h = await R(p);
      check('secret: the keepsake gives its bomb only once', h.story.boonBombs === b1);
      check('full: no page errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
      await p.close();
    }

    // ================================================================== load time and canvas memory
    {
      const p = await open(browser, 'full');
      const first = p.loadMs;
      await p.evaluate(() => __octo.runEvent('enter'));
      await sleep(400); await p.waitForFunction(() => !__octo.transitioning(), { timeout: 30000 }); await sleep(300);
      await p.evaluate(() => __octo.runEvent('death')); // dies in 1-1: back to the hub
      await sleep(400); await p.waitForFunction(() => !__octo.transitioning() && __octo.hubRooms(), { timeout: 30000 }); await sleep(800);
      const log = await p.evaluate(() => __octo.stepLog());
      const world = log.filter((s) => s.step === 'authored world').map((s) => s.ms);
      const lastHub = world[world.length - 1];
      check('load: the hub world is built in one short task (< 40 ms) after a death', lastHub < 40, `${lastHub} ms (first page load ${first} ms)`);
      const mem = await p.evaluate(() => __octo.memory());
      check('memory: canvases in the hub stay under 30 MB at 1440x900', mem.canvasMB < 30, `${mem.canvasMB} MB in ${mem.canvases} canvases, pool ${mem.poolMB} MB`);
      await p.close();
      const q = await open(browser, 'full', 'phone');
      const qm = await q.evaluate(() => __octo.memory());
      check('memory: canvases in the hub stay under 30 MB at 412x915', qm.canvasMB < 30, `${qm.canvasMB} MB in ${qm.canvases} canvases`);
      await q.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
