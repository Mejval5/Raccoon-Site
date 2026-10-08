// Node script (not part of tests/index.html): the one-line HUD strip (hud-strip.js, 2026-10-08) against a running copy of the game.
//   node hud-cdp.js [baseUrl] [shotDir]     baseUrl default http://127.0.0.1:62360/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
// Checks: hearts / bombs / jar / shells / items / level on the strip follow the game's values; the strip writes only on a change
// (no DOM mutation in a quiet second but the clock, at most ~10 clock writes a second, few layouts a second); the level and run
// clocks run, stop on pause and on death, the level clock resets per level and the run clock per run; the death screen shows
// both clocks; the Swift Current target sits by the clock (not under the banner); the hotbar row (Ink Jet tile, then slot 1 bombs, slot 2 Ink Cloud) and the Ink Jet / dash cooldowns; timed effects
// (an Anchor) appear, count down at most ~10 writes a second and go; the layout at 1440x900, 412x915, 915x412 and 375x812: the
// hotbar row top left, the HUD column top right left of the 44 px corner buttons, the bottom free, nothing overlapping the touch
// controls, the buttons, the hotbar or each other; a perk's tooltip on a tap.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:62360/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:1,muted:true,tutorialDone:true,journal:['place-hub']}))}catch(e){}";
const clock = (sec) => { const d = Math.max(0, Math.floor(sec * 10 + 1e-6)); return String(Math.floor(d / 600)).padStart(2, '0') + ':' + String(Math.floor(d / 10) % 60).padStart(2, '0') + '.' + (d % 10); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  const open = async (w, h, mobile, q) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument(SAVE);
    await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.transitioning(), { timeout: 30000 });
    await sleep(800);
    return page;
  };
  const H = (page) => page.evaluate(() => __octo.hud());
  try {
    // ---------------------------------------------------------------- values, clocks, pause, levels, death (desktop)
    {
      const page = await open(1440, 900, false, '?at=1&seed=5');
      await page.evaluate(() => __octo.god(true));
      let h = await H(page);
      const st = await page.evaluate(() => { const s = __octo.state().octopus; return { hearts: s.hearts, bombs: s.bombs }; });
      check('1-1: the strip shows hearts, bombs, casts, shells and the level', h.hearts === String(st.hearts) && h.bombs === String(st.bombs) && /^\d+$/.test(h.casts) && h.shells === '0' && h.stage === '1-1', JSON.stringify(h));
      check('1-1: both clocks show in the Spelunky format', /^\d\d:\d\d\.\d$/.test(h.level) && /^\d\d:\d\d\.\d$/.test(h.run), h.level + ' / ' + h.run);
      check('1-1: the Swift Current target sits by the clock, not under the level banner', /^\d:\d\d$/.test(h.swift)
        && await page.evaluate(() => { const e = document.querySelector('.octo-title-current'); return !e || e.style.display === 'none'; }), h.swift);
      // values follow the game
      await page.evaluate(() => { __octo.giveBombs(2); __octo.giveShells(14); __octo.setJuice(0); __octo.giveItem('lantern'); });
      await sleep(150);
      h = await H(page);
      check('values: bombs, shells, casts and the item row follow a change', h.bombs === '2' && h.shells === '14' && h.casts === '0' && h.items === 1, JSON.stringify(h));
      // writes only on a change: a quiet second mutates nothing but the clocks, and those at most ~10 times a second
      const mut = await page.evaluate(async () => {
        const bar = document.querySelector('.octo-hud-bar'); let clockN = 0, other = 0;
        const mo = new MutationObserver((list) => { for (const m of list) { if (m.target.closest && m.target.closest('.octo-hud-times') || (m.target.parentElement && m.target.parentElement.closest('.octo-hud-times'))) clockN++; else other++; } });
        mo.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true });
        await new Promise((r) => setTimeout(r, 1000));
        mo.disconnect();
        return { clockN, other };
      });
      check('writes: a quiet second changes nothing on the strip but the clocks', mut.other === 0, JSON.stringify(mut));
      check('writes: the clocks change at most ~10 times a second', mut.clockN > 0 && mut.clockN <= 2 * 12, JSON.stringify(mut));
      const cdp = await page.target().createCDPSession();
      await cdp.send('Performance.enable');
      const lc = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutCount').value;
      const l0 = await lc(); await sleep(2000); const l1 = await lc();
      check('layout: no per-frame layout from the HUD (layouts in 2 s, clocks running)', l1 - l0 <= 30, String(l1 - l0));
      // clocks run
      const c0 = await H(page); await sleep(1500); const c1 = await H(page);
      check('clocks: both run (about 1.5 s)', c1.levelClock - c0.levelClock > 1.2 && c1.levelClock - c0.levelClock < 2.2 && c1.runClock - c0.runClock > 1.2, (c1.levelClock - c0.levelClock).toFixed(2));
      check('clocks: the text is the clock value', c1.level === clock(c1.levelClock) || Math.abs(parseFloat(c1.level.slice(3)) - (c1.levelClock % 60)) < 0.25, c1.level + ' ~ ' + c1.levelClock.toFixed(2));
      // pause stops both
      await page.evaluate(() => __octo.pause(true));
      const p0 = await H(page); await sleep(1200); const p1 = await H(page);
      check('pause: both clocks stop', p1.levelClock === p0.levelClock && p1.runClock === p0.runClock && p1.level === p0.level && p1.run === p0.run, p0.level + ' -> ' + p1.level);
      await page.evaluate(() => __octo.pause(false));
      const q0 = await H(page); await sleep(400); const q1 = await H(page);
      check('resume: the clocks run again', q1.levelClock > q0.levelClock);
      // the Swift Current target fades once missed
      await page.evaluate(() => __octo.setClocks(500, 520)); await sleep(200);
      h = await H(page);
      check('swift: a missed target is marked (and the clocks show 08:20.x / 08:40.x)', h.swiftState === 'missed' && /^08:20\.\d$/.test(h.level) && /^08:40\.\d$/.test(h.run), JSON.stringify(h));
      await page.evaluate(() => __octo.setClocks(20, 40)); await sleep(150);
      // next level: the level clock resets, the run clock goes on
      const before = await H(page);
      await page.evaluate(() => __octo.runEvent('exit'));
      await page.waitForFunction(() => !__octo.transitioning(), { timeout: 30000 }); await sleep(600);
      h = await H(page);
      check('next level: the level clock starts again, the run clock carries on', h.stage === '1-2' && h.levelClock < 3 && h.runClock >= before.runClock, `${before.level}/${before.run} -> ${h.level}/${h.run}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hud-1440-play.png') });
      // death: the clocks stop and the death screen shows them
      await page.evaluate(() => { __octo.god(false); __octo.kill('crab'); }); await sleep(1500);
      const d0 = await H(page); await sleep(800); const d1 = await H(page);
      check('death: both clocks stop', d0.levelClock === d1.levelClock && d0.runClock === d1.runClock);
      const row = await page.evaluate(() => [...document.querySelectorAll('.octo-gameover-overlay .octo-summary-row')].map((r) => r.textContent).find((t) => /Time/.test(t)) || '');
      check('death: the summary shows level / run time as on the strip', row.includes(d1.level + ' / ' + d1.run), row);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hud-1440-death.png') });
      // a new run: the run clock starts again
      await page.evaluate(() => __octo.runEvent('death'));
      await page.waitForFunction(() => !__octo.transitioning(), { timeout: 30000 }); await sleep(500);
      h = await H(page);
      check('hub: no clocks, the level reads Hub', h.level === null && h.stage === 'Hub', JSON.stringify(h));
      await page.evaluate(() => __octo.runEvent('enter'));
      await page.waitForFunction(() => !__octo.transitioning(), { timeout: 30000 }); await sleep(500);
      h = await H(page);
      check('new run: both clocks start from zero', h.stage === '1-1' && h.runClock < 3 && h.levelClock < 3, `${h.level} / ${h.run}`);
      await page.close();
    }
    // ---------------------------------------------------------------- the hotbar row, the cooldowns and timed effects (desktop)
    {
      const page = await open(1440, 900, false, '?at=1&seed=5');
      await page.evaluate(() => __octo.god(true));
      let h = await H(page);
      const jetShade = () => page.evaluate(() => parseFloat(document.querySelector('.octo-hb-jetshade').style.height) || 0);
      check('timers: the dash slider is full (ready) at rest, the Ink Jet tile is clear', h.dash === 1 && h.jet === undefined && (await jetShade()) === 0, JSON.stringify({ dash: h.dash }));
      // the hotbar row: the Ink Jet tile first (no number, not a button), a divider, then slot 1 = bombs, slot 2 = Ink Cloud (selected)
      const row = await page.evaluate(() => {
        const vis = (e) => e && getComputedStyle(e).display !== 'none';
        const jet = document.querySelector('.octo-hb-jet'), sep = document.querySelector('.octo-hb-sep');
        const slots = [...document.querySelectorAll('.octo-hb-slots > .octo-hb-slot')].filter(vis);
        const r = (e) => e.getBoundingClientRect();
        return { noLetters: [...document.querySelectorAll('.octo-hb-key-bomb, .octo-hb-key-jet')].every((k) => !vis(k) || getComputedStyle(k).display === 'none'),
          jetVis: vis(jet), jetKey: vis(jet.querySelector('.octo-hb-key')), jetBtn: jet.tagName, jetLeft: r(jet).right <= r(sep).left + 0.5 && r(sep).right <= r(slots[0]).left + 0.5,
          keys: slots.map((sl) => sl.querySelector('.octo-hb-key').textContent), sel: slots.findIndex((sl) => sl.classList.contains('is-selected')),
          first: __octo.juice().hotbar.slots.map((sl) => sl[0]) };
      });
      check('hotbar: the Ink Jet tile sits first, left of a divider, with no key number and not a button; no J or B letters anywhere', row.noLetters && row.jetVis && !row.jetKey && row.jetBtn !== 'BUTTON' && row.jetLeft, JSON.stringify(row));
      check('hotbar: slot 1 is the bomb stack, slot 2 Ink Cloud (selected), numbered 1, 2', row.first[0] === 'bomb' && row.first[1] === 'ink-cloud' && row.keys.join() === '1,2' && row.sel === 1, JSON.stringify(row));
      await page.evaluate(() => __octo.fireInk(1, 0)); await sleep(250);
      check('timers: the Ink Jet tile darkens after a shot', (await jetShade()) > 40, String(await jetShade()));
      await sleep(1700);
      check('timers: ... and is clear again after its cooldown', (await jetShade()) === 0, String(await jetShade()));
      await page.evaluate(() => __octo.input({ move: { x: 1, y: 0 }, dash: { pressed: true, held: true } })); await sleep(80);
      await page.evaluate(() => __octo.input(null)); await sleep(80);
      const d1 = (await H(page)).dash;
      await sleep(900);
      h = await H(page);
      check('timers: the dash slider drops on a dash and is full again after its cooldown', d1 < 1 && h.dash === 1, `${d1} -> ${h.dash}`);
      check('effects: none at rest', h.effects.length === 0, h.effects.join());
      await page.evaluate(() => { __octo.setSlots([['bomb'], ['anchor'], ['ink-cloud']], 1); __octo.setJuice(99); });
      await sleep(150);
      const cast = await page.evaluate(() => __octo.cast());
      await sleep(200);
      h = await H(page);
      const anc = h.effects.find((e) => e.startsWith('anchor'));
      check('effects: an Anchor shows with its seconds left', cast === 1 && !!anc && /\d\.\ds$/.test(anc), `${cast} ${h.effects.join()}`);
      const t0 = anc ? parseFloat(anc.split(' ')[1]) : 0;
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hud-1440-effects.png') });
      await sleep(600);
      h = await H(page);
      const anc2 = h.effects.find((e) => e.startsWith('anchor'));
      check('effects: ... counting down', !anc2 || parseFloat(anc2.split(' ')[1]) < t0, `${t0} -> ${anc2}`);
      await page.waitForFunction(() => !__octo.hud().effects.some((e) => e.startsWith('anchor')), { timeout: 15000 }).catch(() => {});
      check('effects: ... and gone when it ends', !(await H(page)).effects.some((e) => e.startsWith('anchor')));
      const writes = await page.evaluate(async () => {
        const box = document.querySelector('.octo-hud-effects'); let n = 0;
        const mo = new MutationObserver((l) => { n += l.length; });
        mo.observe(box, { subtree: true, childList: true, characterData: true, attributes: true });
        __octo.setSlots([['bomb'], ['anchor'], ['ink-cloud']], 1); __octo.setJuice(99); __octo.cast();
        await new Promise((r) => setTimeout(r, 1000));
        mo.disconnect(); return n;
      });
      check('effects: a running timer writes at most ~10 times a second', writes > 0 && writes <= 14, String(writes));
      await page.close();
    }
    // ---------------------------------------------------------------- layout at four viewports
    for (const [w, ht, mobile, tag] of [[1440, 900, false, 'desktop'], [412, 915, true, 'portrait'], [915, 412, true, 'landscape'], [375, 812, true, 'small-portrait']]) {
      const page = await open(w, ht, mobile, '?at=2&seed=5');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hud-${tag}-fresh.png`) }); // a fresh dive, as the player sees it
      await page.evaluate(() => { __octo.god(true); __octo.giveShells(14500); for (const id of ['lantern', 'flippers', 'magnet', 'goggles', 'urchincap']) __octo.giveItem(id); __octo.setClocks(65.4, 3599.5); __octo.setSlots([['bomb'], ['ink-cloud'], ['anchor'], ['riptide']], 1); });
      await sleep(400);
      const r = await page.evaluate(() => {
        const R = (sel) => { const e = document.querySelector(sel); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const kids = ['.octo-hud-runline', '.octo-hud-vitals', '.octo-hud-timers', '.octo-hud-items', '.octo-hud-effects'];
        const touch = [...document.querySelectorAll('#touch-ui > *')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; });
        return { vw: innerWidth, vh: innerHeight, bar: R('.octo-hud-bar'), hotbar: R('.octo-hotbar'), slots: [...document.querySelectorAll('.octo-hb-slot')].filter((e) => getComputedStyle(e).display !== 'none').length,
          btns: ['.octo-pause-btn', '.octo-mute-btn', '.octo-gear-btn'].map(R), kids: kids.map((k) => [k, R(k)]).filter((x) => x[1]), touch,
          small: ['.octo-pause-btn', '.octo-mute-btn', '.octo-gear-btn'].map((s) => document.querySelector(s).getBoundingClientRect()).some((b) => b.width < 43.5 || b.height < 43.5),
          times: document.querySelector('.octo-hud-times').textContent };
      });
      const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      check(`${tag}: the hotbar row sits at the top left`, r.hotbar && r.hotbar.l < 40 && r.hotbar.t < 30 && r.slots >= 4, JSON.stringify(r.hotbar));
      check(`${tag}: the HUD column sits at the top right, left of the corner buttons`, r.bar && r.bar.t < 30 && r.bar.r <= Math.min(...r.btns.map((b) => b.l)) + 0.5 && r.bar.l > r.vw * 0.25, JSON.stringify(r.bar));
      check(`${tag}: the bottom of the screen is free (hotbar and column in the top part)`, r.hotbar.b < r.vh * 0.3 && r.bar.b < r.vh * 0.6, JSON.stringify({ hb: r.hotbar.b, bar: r.bar.b, vh: r.vh }));
      const hits = [];
      for (const [k, b] of r.kids) {
        if (b.l < -0.5 || b.r > r.vw + 0.5 || b.t < -0.5) hits.push(k + ' off screen');
        r.btns.forEach((x, i) => { if (ov(b, x)) hits.push(k + ' x button ' + i); });
        if (ov(b, r.hotbar)) hits.push(k + ' x hotbar');
        r.touch.forEach((x, i) => { if (ov(b, x)) hits.push(k + ' x touch control ' + i); });
      }
      for (let i = 0; i < r.kids.length; i++) for (let j = i + 1; j < r.kids.length; j++) if (ov(r.kids[i][1], r.kids[j][1])) hits.push(r.kids[i][0] + ' x ' + r.kids[j][0]);
      r.btns.forEach((x, i) => { if (ov(x, r.hotbar)) hits.push('hotbar x button ' + i); });
      r.touch.forEach((x, i) => { if (ov(x, r.hotbar)) hits.push('hotbar x touch control ' + i); });
      check(`${tag}: nothing overlaps the buttons, the touch controls, the hotbar or each other`, hits.length === 0, hits.join('; '));
      check(`${tag}: the pause / mute / settings buttons stay 44 px`, !r.small);
      check(`${tag}: a long run reads 59:5x and shells 14500, five perks`, /01:0[56]\.\d/.test(r.times) && /59:5\d\.\d/.test(r.times) && (await H(page)).shells === '14500' && (await H(page)).items === 5, r.times);
      // a perk's tooltip on a tap / hover
      const tipText = await page.evaluate(() => { const c = document.querySelector('.octo-hud-item'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); const t = document.querySelector('.octo-hud-tip'); return t.style.display === 'none' ? '' : t.textContent; });
      check(`${tag}: tapping a perk shows its name and what it does`, /:/.test(tipText), tipText);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hud-${tag}.png`) });
      await page.close();
    }
  } catch (e) {
    check('no exception', false, String(e && e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
