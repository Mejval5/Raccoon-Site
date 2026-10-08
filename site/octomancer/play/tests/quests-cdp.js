// Node script (not part of tests/index.html): the quests rework (owners round 3) in the running game. People stay after you help
// them (Spelunky 2 style), thank you, react to blasts, and pay now, later in the dive, or in the hub on the next run.
//   node quests-cdp.js [baseUrl] [shotDir]
//   baseUrl default http://127.0.0.1:60731/octomancer/play/index.html; shotDir: write quests-*.png there (desktop 1440x900, phone 412x915)
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
// Checks: a freed Marlo never despawns in the level (12 s), faces the octopus, says thanks, jumps at a blast; a freed Pip who stays
// swims about his open cage; a 'later' outcome brings the person back near the exit of a later level of the same dive and the
// reward is handed over in-world; a 'gift' outcome waits in the hub across runs and lands as bombs on the next dive; an angered
// person keeps the grudge for the dive (the owed meeting comes back hostile, no reward).
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:60731/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{if(!sessionStorage.getItem('octo-keep-save'))localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:1,muted:true,tutorialDone:true,helpDone:true,journal:[]}))}catch(e){}";
const VPS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  async function open(vp, url) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE|404/.test(m.text())) errs.push(m.text()); });
    await page.setViewport(VPS[vp]);
    await page.evaluateOnNewDocument(SAVE);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
    return page;
  }
  const waitLevel = async (page) => { await sleep(300); await page.waitForFunction(() => !__octo.level().transitioning, { timeout: 60000 }); await page.evaluate(() => { __octo.god(true); __octo.freeze(true); __octo.stepDraw(2); }); };
  const P = (page) => page.evaluate(() => __octo.people());
  const still = { move: { x: 0, y: 0 }, dash: false, bomb: false, pause: false };
  let frame = 0;

  /** Free Marlo (forced into this level with outcome `oid`); returns the people snapshot after he swam out. */
  async function freeMarlo(page, oid, shot) {
    const pl = await page.evaluate((oid) => __octo.forceQuest('marlo-1', oid), oid);
    if (!pl) return null;
    // open his pocket like a bomb would (break the rock round him), then swim up beside him
    await page.evaluate((x, y) => {
      for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) __octo.breakTile(Math.floor(x) + dx, Math.floor(y) + dy);
      __octo.input({ move: { x: 0, y: 0 }, dash: false, bomb: false, pause: false });
    }, pl.x, pl.y);
    for (let n = 0; n < 30; n++) await page.evaluate((x, y) => { __octo.teleport(x + 3.5, y - 0.6); __octo.stepDraw(1); }, pl.x, pl.y);
    if (shot) await shot('marlo-sealed');
    for (let n = 0; n < 20; n++) await page.evaluate((x, y) => { __octo.teleport(x + 1.4, y - 0.4); __octo.stepDraw(1); }, pl.x, pl.y);
    const q = (await P(page)).quest;
    if (shot) await shot('marlo-freed');
    return { pl, q };
  }

  try {
    for (const vp of SHOTS ? ['desktop', 'phone'] : ['desktop']) {
      const page = await open(vp, BASE + '?at=1&seed=11');
      const shot = async (tag) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `quests-${vp}-${String(frame++).padStart(2, '0')}-${tag}.png`) }); };
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      // ---- Marlo freed with a 'later' outcome: he stays, faces you, thanks you, jumps at a blast ----
      const fm = await freeMarlo(page, 'later', shot);
      check(`${vp}: Marlo's vault fits on this level`, !!fm);
      if (!fm) { await page.close(); continue; }
      const { pl } = fm;
      check(`${vp}: freeing Marlo completes the encounter, pays the outcome and he thanks you`, fm.q.collected && fm.q.paid && fm.q.outcome === 'later' && /You did it|Thank/.test(fm.q.text + fm.q.queued.join(' ')), JSON.stringify({ text: fm.q.text, q: fm.q.queued }));
      let present = 0, sawThanks = false, last = null;
      for (let s = 0; s < 60; s++) { // 12 s
        last = await page.evaluate((x, y) => { __octo.teleport(x + 2.6, y - 0.6); __octo.stepDraw(10); const p = __octo.people(); return { p, n: __octo.npcs().filter((n) => n.who === 'marlo' && !n.hostile).length }; }, pl.x, pl.y);
        if (last.n === 1) present++;
        if (/Thank|nothing on me|Look for me/.test(last.p.quest.text)) sawThanks = true;
        if (s === 6 || s === 14) await shot('marlo-thanks');
      }
      check(`${vp}: Marlo never despawns after the rescue (present in all ${present}/60 checks over 12 s) and settles`, present === 60 && last.p.quest.settled && last.p.quest.status !== 2);
      check(`${vp}: he says the thank-you and what the outcome says (he will meet you further down)`, sawThanks);
      const fR = await page.evaluate(() => { const q = __octo.people().quest; __octo.teleport(q.cx + 3, q.cy - 0.3); __octo.stepDraw(3); return __octo.people().quest.face; });
      const fL = await page.evaluate(() => { const q = __octo.people().quest; __octo.teleport(q.cx - 3, q.cy - 0.3); __octo.stepDraw(3); return __octo.people().quest.face; });
      check(`${vp}: he faces the octopus (right ${fR}, left ${fL})`, fR === 1 && fL === -1);
      const hop = await page.evaluate(() => { const q = __octo.people().quest; __octo.reactAt(q.cx + 2, q.cy); __octo.stepDraw(1); const r = __octo.people().quest; return { hop: r.hop, text: r.text }; });
      check(`${vp}: a blast close by makes him jump (and shout when he is not talking)`, hop.hop > 0.5, JSON.stringify(hop));
      await page.evaluate(() => __octo.stepDraw(6)); await shot('marlo-react');
      const owed = (await P(page)).owed;
      check(`${vp}: the 'later' outcome owes a meeting one or two levels down this dive (or the grotto)`, owed.length === 1 && owed[0].npc === 'marlo' && (owed[0].due === 2 || owed[0].due === 3 || owed[0].due === 99), JSON.stringify(owed));
      // ---- the delayed reward: exit until the level he waits on ----
      let met = null;
      for (let lv = 0; lv < 4 && !met; lv++) {
        await page.evaluate(() => __octo.runEvent('exit'));
        await waitLevel(page);
        const p = await P(page);
        if (p.visitors.length) met = p;
        if (!p.owed.length && !p.visitors.length) break;
      }
      check(`${vp}: Marlo waits further down the dive (level ${met && met.level}, state ${met && met.state})`, !!met && met.visitors[0].npc === 'marlo' && !met.visitors[0].hostile);
      if (met) {
        const v = met.visitors[0];
        const before = await page.evaluate(() => __octo.extras().shells);
        for (let n = 0; n < 25; n++) await page.evaluate((x, y) => { __octo.teleport(x + 5, y - 0.6); __octo.stepDraw(1); }, v.x, v.floorY);
        const greet = await page.evaluate(() => __octo.people().visitors[0]);
        await shot('later-greet');
        check(`${vp}: he greets you as you come near`, greet.greeted && /There you are/.test(greet.text), greet.text);
        for (let n = 0; n < 40; n++) await page.evaluate((x, y) => { __octo.teleport(x + 1.2, y - 0.6); __octo.stepDraw(1); }, v.x, v.floorY);
        await shot('later-reward');
        for (let n = 0; n < 30; n++) await page.evaluate((x, y) => { __octo.teleport(x + 0.4, y - 0.5); __octo.stepDraw(1); }, v.x, v.floorY);
        for (let n = 0; n < 160; n++) await page.evaluate((x, y, n) => { __octo.teleport(x - 2.5 + (n % 11) * 0.5, y - 0.4 - ((n / 11) | 0) % 3 * 0.6); __octo.stepDraw(1); }, v.x, v.floorY, n); // sweep up the dropped shells
        const after = await page.evaluate(() => ({ shells: __octo.extras().shells, v: __octo.people().visitors[0], story: __octo.extras().story }));
        check(`${vp}: he hands over the reward in-world (the shells drop and are picked up: ${before} -> ${after.shells}) and stays`, after.v.gave && after.shells >= before + 12 && after.story.laterMarlo >= 1);
        await page.evaluate(() => __octo.stepDraw(30)); await shot('later-after');
      }
      await page.close();
    }

    // ---- Pip stays (role 'stay'): the cage breaks and he swims about it; never vanishes ----
    {
      const page = await open('desktop', BASE + '?at=1&seed=11');
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      const pl = await page.evaluate(() => __octo.forceQuest('pip-1', 'mama'));
      check('Pip\'s cage fits on this level', !!pl);
      if (pl) {
        await page.evaluate((x, y) => { __octo.teleport(x + 2.5, y - 0.5); __octo.stepDraw(2); __octo.placeBomb(x, y); }, pl.x, pl.y);
        let broke = false;
        for (let n = 0; n < 40 && !broke; n++) broke = await page.evaluate((x, y) => { __octo.teleport(x + 6, y - 1); __octo.stepDraw(5); return __octo.people().quest.staying; }, pl.x, pl.y);
        let present = 0, maxD = 0;
        for (let s = 0; s < 40; s++) {
          const r = await page.evaluate((x, y) => { __octo.teleport(x + 4, y - 1); __octo.stepDraw(10); return { q: __octo.people().quest, n: __octo.npcs().filter((n) => n.who === 'pip' && !n.hostile).length }; }, pl.x, pl.y);
          if (r.n === 1) present++;
          maxD = Math.max(maxD, Math.hypot(r.q.cx - pl.x, r.q.cy - pl.y));
        }
        check(`a bomb breaks the cage; Pip stays and swims about it for 8 s (present ${present}/40, at most ${maxD.toFixed(1)} tiles off), paid at once`, broke && present === 40 && maxD < 3 && (await P(page)).quest.paid);
        const owed = (await P(page)).owed;
        check('his mother owes you a visit later in the dive', owed.length === 1 && owed[0].npc === 'pip' && owed[0].variant === 'mama', JSON.stringify(owed));
      }
      await page.close();
    }

    // ---- aggro memory: an angered Marlo keeps the grudge; his owed meeting comes back hostile, no reward ----
    {
      const page = await open('desktop', BASE + '?at=1&seed=11');
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      const fm = await freeMarlo(page, 'later', null);
      if (fm) {
        await page.evaluate(() => { __octo.stepDraw(60); __octo.hitNpc('marlo', 1, 'test'); __octo.stepDraw(2); }); // after the second of grace a freed person has
        const g = await P(page);
        check('hurting the freed Marlo angers him; the dive remembers it', g.grudge[1] === 1);
        let met = null;
        for (let lv = 0; lv < 4 && !met; lv++) {
          await page.evaluate(() => __octo.runEvent('exit'));
          await waitLevel(page);
          const p = await P(page);
          if (p.visitors.length) met = p;
          if (!p.owed.length && !p.visitors.length) break;
        }
        const npc = met ? await page.evaluate(() => __octo.npcs().filter((n) => n.who === 'marlo')) : [];
        check('his owed meeting comes back hostile (npcs.js has him, harpoon and all) and gives nothing', !!met && met.visitors[0].hostile && npc.length === 1 && npc[0].hostile && !met.visitors[0].gave, JSON.stringify({ v: met && met.visitors, npc }));
      } else check('Marlo fits for the grudge test', false);
      await page.close();
    }

    // ---- the pool host after a won wager: a debt paid further down the dive; he moves into the hub ----
    {
      let page = await open('desktop', BASE + '?at=1&seed=11');
      const pseed = await page.evaluate(async () => {
        const L = await import('./js/level.js'), Pl = await import('./js/pool.js');
        for (let s = 2; s < 300; s++) if (Pl.planPools(L.generateLevel(s, 0)).length) return s;
        return 0;
      });
      await page.close();
      if (pseed) {
        page = await open('desktop', BASE + `?at=1&seed=${pseed}`);
        await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
        const oc = await page.evaluate(() => { const r = __octo.hostWin('owed'); __octo.stepDraw(2); return { r, p: __octo.people(), story: __octo.extras().story }; });
        check(`host (seed ${pseed}): a won wager can make the house owe you; he says so and moves into the hub`, oc.r === 'owed' && /owes you/.test(oc.p.hosts[0].text) && oc.p.owed.some((o) => o.npc === 'host') && oc.story.host >= 1, JSON.stringify(oc.p.hosts));
        await page.close();
      } else check('a seed with a Challenge Pool on 1-1', false);
    }

    // ---- across runs: a 'gift' outcome waits in the hub; the next dive starts with it ----
    {
      const page = await open('desktop', BASE + '?at=1&seed=11');
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      const fm = await freeMarlo(page, 'gift', null);
      const st0 = await page.evaluate(() => __octo.extras().story);
      check('the gift outcome is kept in the save for the hub', fm && st0.giftMarlo > 0 && st0.marlo >= 1, JSON.stringify({ g: st0.giftMarlo, m: st0.marlo }));
      // reload the page in the hub: a new session, the save carries it
      await page.evaluate(() => sessionStorage.setItem('octo-keep-save', '1'));
      await page.goto(BASE + '?at=hub&seed=12', { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      const lv = await page.evaluate(() => __octo.level());
      let said = '';
      for (let n = 0; n < 120 && !/next dive/.test(said); n++) said = await page.evaluate((x, y) => { __octo.teleport(x + 1.6, y - 0.6); __octo.stepDraw(2); return __octo.extras().hubTalk.text; }, lv.signX + 0.5, lv.signY + 1);
      const st1 = await page.evaluate(() => __octo.extras().story);
      check('in the hub Marlo hands the gift over (his words) and it waits for the next dive', /next dive/.test(said) && st1.giftMarlo === 0 && st1.boonBombs === 2, JSON.stringify({ said, g: st1.giftMarlo, b: st1.boonBombs }));
      const b0 = await page.evaluate(() => __octo.state().octopus.bombs);
      await page.evaluate(() => __octo.runEvent('enter'));
      await waitLevel(page);
      const after = await page.evaluate(() => ({ bombs: __octo.state().octopus.bombs, story: __octo.extras().story, state: __octo.people().state }));
      check(`the next dive starts with Marlo's bombs (${b0} in the hub -> ${after.bombs}) and the boon is used up`, after.bombs >= Math.min(5, 3 + 2) && after.story.boonBombs === 0, JSON.stringify(after.story.boonBombs));
      await page.close();
    }
  } catch (e) {
    check('no exception', false, String(e && e.stack || e).slice(0, 400));
  }
  check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(fails.length ? `FAIL ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
