// Node script (not part of tests/index.html): octopus skins in the running game (2026-10-08, skins.js).
//   node skins-cdp.js [baseUrl] [shotDir]
//   baseUrl default http://127.0.0.1:63412/octomancer/play/index.html; shotDir: write skins-*.png there (desktop 1440x900, phone 412x915)
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
// Checks: a fresh save wears the default look; freeing Marlo gives his look with the gift moment (the trinket flies, then the
// toast and the journal page), a second rescue gives nothing; Pip's cage, Quill's welcome and the host's won wager give theirs;
// the looks and the one worn survive a reload; at the hub's mirror shell F opens the picker (paused), a click wears a look,
// Esc closes it; Settings > Looks opens the same picker; with a look worn the tinted sheet is built once (no recolour over
// hundreds of frames and level changes) and the skin's canvas memory stays within one sheet plus the previews.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:63412/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a fresh save (no skins field): kept across reloads in one tab when sessionStorage says so
const SAVE = "try{if(!sessionStorage.getItem('octo-keep-save'))localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:1,muted:true,tutorialDone:true,helpDone:true,journal:[],meta:{dives:2,clears:1}}))}catch(e){}";
const VPS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};
const SHEET_MB = 42 * 160 * 160 * 4 / 1048576; // one tinted sheet

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
  const S = (page) => page.evaluate(() => __octo.skins());
  const shotOf = (page, vp) => async (tag) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `skins-${vp}-${tag}.png`) }); };
  /** Step until the gifts in flight have landed (frozen game: stepDraw). */
  async function land(page, shot, tag) {
    let mid = false;
    for (let n = 0; n < 60; n++) {
      const g = await page.evaluate(() => { __octo.stepDraw(3); return __octo.skins().gifts; });
      if (!mid && shot && g.some((x) => x.t > 0.45 && !x.done)) { mid = true; await shot(tag); }
      if (!g.length) break;
    }
  }
  /** Free Marlo (forced onto this level), as quests-cdp.js does: break his pocket, swim beside him. */
  async function freeMarlo(page, oid) {
    const pl = await page.evaluate((oid) => __octo.forceQuest('marlo-1', oid), oid);
    if (!pl) return null;
    await page.evaluate((x, y) => { for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) __octo.breakTile(Math.floor(x) + dx, Math.floor(y) + dy); }, pl.x, pl.y);
    for (let n = 0; n < 30; n++) await page.evaluate((x, y) => { __octo.teleport(x + 3.5, y - 0.6); __octo.stepDraw(1); }, pl.x, pl.y);
    for (let n = 0; n < 12; n++) await page.evaluate((x, y) => { __octo.teleport(x + 1.4, y - 0.4); __octo.stepDraw(1); }, pl.x, pl.y);
    return pl;
  }

  try {
    // ================================================================ desktop: unlocks, persistence, picker, memory
    {
      const vp = 'desktop';
      const page = await open(vp, BASE + '?at=1&seed=11');
      const shot = shotOf(page, vp);
      let s = await S(page);
      check('fresh save: only the default look, worn, no gift', JSON.stringify(s.unlocked) === '["classic"]' && s.current === 'classic' && s.drawn === 'classic' && !s.gifts.length, JSON.stringify(s));
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
      // ---- Marlo, first rescue: the gift moment
      const pl = await freeMarlo(page, 'shells');
      check('Marlo\'s vault fits on this level', !!pl);
      s = await S(page);
      check('freeing Marlo the first time starts his gift (the goggles fly over)', s.gifts.some((g) => g.id === 'marlo') && s.unlocked.includes('marlo'), JSON.stringify(s.gifts));
      const said = await page.evaluate(() => { const q = __octo.people().quest; return q.text + ' ' + q.queued.join(' '); });
      check('he says his give line', /goggles/i.test(said), said);
      await land(page, shot, 'gift-marlo');
      let toast = '';
      for (let k = 0; k < 50 && !/New look/.test(toast); k++) { toast = await page.evaluate(() => document.querySelector('.octo-toast').textContent); if (!/New look/.test(toast)) await sleep(100); } // (queued behind a reward toast, if one shows)
      const found = await page.evaluate(() => __octo.journal().found);
      check('it lands: toast "New look: Diver\'s Goggles", the Looks page is found', /New look: Diver's Goggles/.test(toast) && found.includes('look-marlo'), toast);
      check('the look is not put on by itself (you pick it at the mirror)', (await S(page)).current === 'classic');
      // ---- Marlo again: nothing new
      await page.evaluate(() => { __octo.stepDraw(30); });
      await freeMarlo(page, 'shells');
      await page.evaluate(() => __octo.stepDraw(5));
      s = await S(page);
      check('a second rescue of Marlo gives no second gift', !s.gifts.length && s.unlocked.filter((x) => x === 'marlo').length === 1, JSON.stringify(s.gifts));
      // ---- Pip's cage
      const pp = await page.evaluate(() => __octo.forceQuest('pip-1', 'mama'));
      if (pp) {
        await page.evaluate((x, y) => { __octo.teleport(x + 2.5, y - 0.5); __octo.stepDraw(2); __octo.placeBomb(x, y); }, pp.x, pp.y);
        let got = false;
        for (let n = 0; n < 40 && !got; n++) got = await page.evaluate((x, y) => { __octo.teleport(x + 6, y - 1); __octo.stepDraw(5); return __octo.skins().unlocked.includes('pip'); }, pp.x, pp.y);
        check('breaking Pip\'s cage gives his look', got);
        await land(page, shot, 'gift-pip');
      } else check('Pip\'s cage fits on this level', false);
      // ---- the host (a won wager) and Quill (met): through the story counters
      await page.evaluate(() => { __octo.setStory('poolWon', 1); __octo.checkSkins(); });
      s = await S(page);
      check('the first won wager gives the host\'s hat', s.unlocked.includes('host') && s.gifts.some((g) => g.id === 'host'));
      await land(page, shot, 'gift-host');
      await page.evaluate(() => { __octo.setStory('saidQuill', 1); __octo.checkSkins(); });
      await land(page, null, '');
      s = await S(page);
      check('meeting Quill gives his look; all five looks unlocked', ['classic', 'marlo', 'pip', 'host', 'quill'].every((x) => s.unlocked.includes(x)), JSON.stringify(s.unlocked));
      // ---- persistence: wear one, reload
      await page.evaluate(() => __octo.wearSkin('quill'));
      await page.evaluate(() => sessionStorage.setItem('octo-keep-save', '1'));
      await page.goto(BASE + '?seed=11', { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
      await sleep(800);
      s = await S(page);
      check('after a reload: the looks unlocked and the one worn are kept, and it is drawn', s.unlocked.length === 5 && s.current === 'quill' && s.drawn === 'quill' && !s.gifts.length, JSON.stringify({ u: s.unlocked, c: s.current, g: s.gifts }));
      check('the hub has the mirror shell', !!s.mirror);
      // ---- the mirror shell: F opens the picker
      await page.evaluate((m) => { __octo.teleport(m.x + 0.9, m.y - 0.55); }, s.mirror);
      await sleep(400);
      await shot('hub-quill');
      const tgt = await page.evaluate(() => __octo.hand().target);
      check('beside the mirror shell the hand\'s target is the mirror', tgt && tgt.kind === 'mirror', JSON.stringify(tgt));
      await page.keyboard.press('KeyF');
      await sleep(400);
      s = await S(page);
      const paused = await page.evaluate(() => __octo.level().run && document.querySelector('.octo-skins-overlay').style.display !== 'none');
      check('F at the mirror opens the looks picker over the game', s.open && paused);
      check('the picker lists every look, all unlocked, the worn one marked', s.cards.length === 5 && s.cards.every((c) => c.unlocked) && s.cards.find((c) => c.current).id === 'quill');
      await shot('picker');
      await page.click('.octo-skin-card[data-skin="pip"]');
      await sleep(300);
      s = await S(page);
      check('a click wears Pip\'s look at once (saved and drawn)', s.current === 'pip' && s.drawn === 'pip');
      await page.keyboard.press('Escape');
      await sleep(300);
      s = await S(page);
      check('Esc closes the picker', !s.open);
      for (let k = 0; k < 40 && !(await S(page)).sheet.ready; k++) await sleep(50);
      await shot('hub-pip');
      // ---- Settings > Looks
      await page.evaluate(() => __octo.openSettings());
      await sleep(300);
      await page.click('.octo-set-looks');
      await sleep(300);
      s = await S(page);
      const setOpen = await page.evaluate(() => __octo.settings().open);
      check('Settings > Looks opens the same picker (the settings panel steps aside)', s.open && !setOpen);
      await page.evaluate(() => __octo.closeLooks());
      // ---- every look in play (hub), then memory over frames and level changes
      for (const id of ['classic', 'marlo', 'host']) {
        await page.evaluate((id) => __octo.wearSkin(id), id);
        for (let k = 0; k < 60 && id !== 'classic' && !(await S(page)).sheet.ready; k++) await sleep(50);
        await sleep(200);
        await shot('hub-' + id);
      }
      await page.evaluate(() => __octo.wearSkin('marlo'));
      for (let k = 0; k < 60 && !(await S(page)).sheet.ready; k++) await sleep(50);
      const t0 = (await S(page)).sheet;
      await sleep(3000); // ~180 live frames
      for (const ev of ['enter', 'exit', 'exit']) {
        await page.evaluate((e) => __octo.runEvent(e), ev);
        await sleep(500);
        for (let k = 0; k < 80 && (await page.evaluate(() => __octo.level().transitioning)); k++) await sleep(100);
        await sleep(800);
      }
      await shot('dive-marlo');
      const t1 = (await S(page)).sheet;
      const mem = await page.evaluate(() => __octo.memory());
      check('no per-frame tinting: frames and three level changes recolour nothing more', t1.tintCalls === t0.tintCalls && t1.built === t0.built, JSON.stringify({ t0, t1 }));
      check('skin memory: one tinted sheet (' + SHEET_MB.toFixed(1) + ' MB) plus the small previews', mem.skinSheets === 1 && mem.skinMB <= SHEET_MB + 0.8, JSON.stringify({ skinMB: mem.skinMB, sheets: mem.skinSheets }));
      // ---- death with a look worn
      await page.evaluate(() => { __octo.freeze(false); __octo.god(false); __octo.kill('crab', true); });
      await sleep(700);
      await shot('death-marlo');
      check('the dead octopus is drawn in the worn look', (await S(page)).drawn === 'marlo');
      await page.close();
    }

    // ================================================================ phone: the picker and the looks in play
    {
      const vp = 'phone';
      const page = await open(vp, BASE + '?seed=11');
      const shot = shotOf(page, vp);
      await page.evaluate(() => { __octo.setStory('diverFreed', 1); __octo.setStory('critterFreed', 1); __octo.setStory('saidQuill', 1); __octo.checkSkins(); });
      for (let k = 0; k < 40 && (await S(page)).gifts.length; k++) await sleep(100);
      await shot('gift-hub');
      for (let k = 0; k < 40 && (await S(page)).gifts.length; k++) await sleep(150);
      const s0 = await S(page);
      check('phone: three looks given in the hub, one after the other', ['marlo', 'pip', 'quill'].every((x) => s0.unlocked.includes(x)) && !s0.unlocked.includes('host'));
      await page.evaluate((m) => __octo.teleport(m.x + 0.9, m.y - 0.55), s0.mirror);
      await sleep(400);
      const mode = await page.evaluate(() => __octo.hand().phone);
      check('phone: beside the mirror the Spell button turns into Use', mode === 'use', mode);
      await page.evaluate(() => __octo.openLooks());
      await sleep(400);
      const box = await page.evaluate(() => { const r = document.querySelector('.octo-skins-panel').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight }; });
      check('phone: the picker fits the screen', box.l >= 0 && box.r <= box.w && box.t >= 0 && box.b <= box.h, JSON.stringify(box));
      const s1 = await S(page);
      check('phone: a locked look shows ??? (the host\'s)', s1.cards.find((c) => c.id === 'host').name === '???');
      await shot('picker');
      await page.tap('.octo-skin-card[data-skin="marlo"]');
      await sleep(300);
      check('phone: a tap wears it', (await S(page)).current === 'marlo');
      await page.tap('.octo-skins-close');
      await sleep(300);
      for (const id of ['marlo', 'pip', 'quill']) {
        await page.evaluate((id) => __octo.wearSkin(id), id);
        for (let k = 0; k < 60 && !(await S(page)).sheet.ready; k++) await sleep(50);
        await sleep(200);
        await shot('hub-' + id);
      }
      // the journal's Looks pages
      await page.evaluate(() => __octo.openJournal('items', 'look-pip'));
      await sleep(500);
      await shot('journal-pip');
      await page.evaluate(() => __octo.openJournal('items', 'look-host'));
      await sleep(400);
      const lockedTxt = await page.evaluate(() => document.querySelector('.octo-bk-entry').textContent);
      check('phone: the host\'s locked Looks page is a silhouette with its hint', /\?\?\?/.test(lockedTxt) && /wager/.test(lockedTxt), lockedTxt.slice(0, 120));
      await shot('journal-host-locked');
      await page.close();
    }
  } catch (e) {
    check('no exception', false, String(e && e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fails.length ? `FAIL ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
