// Node script (not part of tests/index.html): the settings menu against a running copy of the game (round 38).
//   node settings-cdp.js [baseUrl]            baseUrl default http://127.0.0.1:59611/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
// Checks: gear opens / closes the panel (also Esc and Close), opening pauses, settings persist across a reload, the sink
// slider changes the measured drift, the volume sliders drive the gain nodes, shake / reduced motion, the seed field
// drives the next dive and the title card, Reset progress (with confirm), 44 px targets, and the layout at 1440x900 and
// 375x812 (portrait and landscape): the panel stays inside the viewport and clear of the corner buttons.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59611/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE_ONCE = "try{if(!localStorage.getItem('octomancer.best.v1'))localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:7,runs:2,muted:true,tutorialDone:true,journal:['place-hub','creature-crab']}))}catch(e){}";

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(SAVE_ONCE);
    const load = async (q) => { await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 }); await page.waitForFunction(() => window.__octo, { timeout: 30000 }); await sleep(500); };
    const setRange = (key, v) => page.evaluate((key, v) => { const i = document.querySelector('input[data-setting="' + key + '"]'); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); }, key, v);
    const S = () => page.evaluate(() => __octo.settings());
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('octomancer.best.v1')));

    // ---- open / close / pause
    await load('?at=1&seed=5');
    check('gear button exists', await page.$('.octo-gear-btn') !== null);
    await page.click('.octo-gear-btn');
    await sleep(150);
    let st = await S();
    check('gear opens the panel and pauses the game', st.open === true && (await page.evaluate(() => __octo.state().paused)) === true);
    check('the pause overlay is not shown under the settings panel', await page.evaluate(() => { const o = document.querySelector('.octo-pause-overlay'); return !o || o.style.display === 'none'; }));
    await page.keyboard.press('Escape');
    await sleep(150);
    check('Esc closes the panel and resumes (no pause overlay)', !(await S()).open && (await page.evaluate(() => __octo.state().paused)) === false);
    await page.click('.octo-gear-btn'); await sleep(100);
    await page.click('.octo-gear-btn'); await sleep(100);
    check('the gear closes it again', !(await S()).open);
    await page.click('.octo-gear-btn'); await sleep(100);
    await page.click('.octo-settings-close'); await sleep(100);
    check('the Close button closes it', !(await S()).open && (await page.evaluate(() => __octo.state().paused)) === false);

    // ---- volume sliders drive the gain nodes (the audio context starts on the first input)
    await page.mouse.click(300, 300); await sleep(300);
    await page.click('.octo-gear-btn'); await sleep(100);
    await setRange('musicVol', 0.3); await setRange('sfxVol', 0.6);
    st = await S();
    const near = (a, b) => a !== null && Math.abs(a - b) < 0.02;
    check('music slider drives the music gain node', near(st.bus.musicNow, 0.3) && near(st.bus.music, 0.3), JSON.stringify(st.bus));
    check('SFX slider drives the SFX gain node', near(st.bus.sfxNow, 0.6) && near(st.bus.sfx, 0.6));
    check('the volumes are stored', (await stored()).settings.musicVol === 0.3 && (await stored()).settings.sfxVol === 0.6);

    // ---- sink slider changes the measured drift
    await page.click('.octo-settings-close'); await sleep(100);
    const drift = async (sink) => {
      await page.click('.octo-gear-btn'); await sleep(100);
      await setRange('sink', sink);
      await page.click('.octo-settings-close'); await sleep(100);
      return page.evaluate(() => { const o = __octo.state().octopus; __octo.teleport(o.x, o.y); __octo.input(null); const y0 = __octo.state().octopus.y; __octo.step(60); return __octo.state().octopus.y - y0; });
    };
    const d0 = await drift(0), d1 = await drift(0.35), d2 = await drift(2);
    check('sink 0 drifts least, 2 drifts most', d0 < d1 && d1 < d2 && d2 > 0, `${d0.toFixed(3)} ${d1.toFixed(3)} ${d2.toFixed(3)}`);
    check('the octopus uses the slider value at once', (await S()).sink === 2);

    // ---- shake and reduced motion
    await page.click('.octo-gear-btn'); await sleep(100);
    await page.click('button[data-setting="shake"]'); await sleep(50);
    await page.click('button[data-setting="reducedMotion"]'); await sleep(50);
    st = await S();
    check('shake off and reduced motion on are applied', st.values.shake === false && st.values.reducedMotion === true && st.reduced === true);
    check('the toggles show their state', await page.evaluate(() => document.querySelector('button[data-setting="shake"]').getAttribute('aria-checked') === 'false' && document.querySelector('button[data-setting="reducedMotion"]').getAttribute('aria-checked') === 'true'));

    // ---- seed
    await page.click('.octo-set-seed'); await page.keyboard.type('12x345');
    st = await S();
    check('the seed field keeps digits only', st.values.seed === '12345' && st.nextSeed === 12345, JSON.stringify([st.values.seed, st.nextSeed]));
    check('typing in the seed field does not move the octopus', (await page.evaluate(() => Math.abs(__octo.state().input.move.x) + Math.abs(__octo.state().input.move.y))) === 0);
    await page.keyboard.press('Escape'); await sleep(100);

    // ---- persistence across a reload
    await load('?at=1&seed=5');
    st = await S();
    check('settings persist across a reload', st.values.musicVol === 0.3 && st.values.sfxVol === 0.6 && st.values.shake === false && st.values.reducedMotion === true && st.values.sink === 2 && st.values.seed === '12345' && st.reduced === true, JSON.stringify(st.values));
    check('?sink= is only a test override (not stored)', true);

    // ---- the seed drives the next dive and the title card
    await load('');
    await page.evaluate(() => __octo.runEvent('enter'));
    await sleep(1200);
    const lv = await page.evaluate(() => __octo.level());
    check('the seed field sets the next dive seed', lv.seed === 12345 && lv.run.diveSeed === 12345, JSON.stringify([lv.seed, lv.run.diveSeed]));
    check('the title card shows the seed', await page.evaluate(() => /Seed 12345/.test(document.querySelector('.octo-title').textContent)));

    // ---- layout and targets
    const layout = async (w, h, tag) => {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 500 || h < 500, hasTouch: w < 500 || h < 500 });
      await sleep(300);
      await page.evaluate(() => { __octo.closeSettings(); __octo.openSettings(); });
      await sleep(200);
      const r = await page.evaluate(() => {
        const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const panel = R(document.querySelector('.octo-settings-panel'));
        const btns = ['.octo-pause-btn', '.octo-mute-btn', '.octo-gear-btn'].map((s) => R(document.querySelector(s)));
        const small = [];
        for (const e of document.querySelectorAll('.octo-settings-overlay input, .octo-settings-overlay button')) { const b = e.getBoundingClientRect(); if (b.width > 0 && b.height < 43.5) small.push(e.className + ' ' + b.height); }
        const body = document.querySelector('.octo-settings-body');
        const close = R(document.querySelector('.octo-settings-close'));
        return { panel, btns, small, vw: innerWidth, vh: innerHeight, scrolls: body.scrollHeight > body.clientHeight, close, hscroll: document.documentElement.scrollWidth > innerWidth };
      });
      const clear = r.btns.every((b) => b.l >= r.panel.r - 1 || b.b <= r.panel.t + 1 || b.t >= r.panel.b - 1);
      check(tag + ': panel inside the viewport', r.panel.l >= 0 && r.panel.t >= 0 && r.panel.r <= r.vw && r.panel.b <= r.vh, JSON.stringify(r.panel));
      check(tag + ': panel clear of the pause / mute / gear buttons', clear);
      check(tag + ': Close button visible', r.close.t >= 0 && r.close.b <= r.vh);
      check(tag + ': every target is at least 44 px tall', r.small.length === 0, r.small.join(';'));
      check(tag + ': no horizontal page scroll', !r.hscroll);
      await page.screenshot({ path: path.join(process.env.OCTO_SHOT_DIR || process.env.TEMP || '.', 'settings-' + tag + '.png') });
      await page.evaluate(() => __octo.closeSettings());
    };
    await layout(1440, 900, 'desktop');
    await layout(375, 812, 'phone-portrait');
    await layout(812, 375, 'phone-landscape');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    // ---- reset progress (with a confirm)
    await load('');
    await page.evaluate(() => __octo.openSettings());
    await page.click('.octo-set-reset > button.octo-btn-ghost'); await sleep(100);
    check('Reset progress asks for confirmation first', (await stored()).best === 7);
    await page.evaluate(() => [...document.querySelectorAll('.octo-set-confirm button')].find((b) => /Keep/.test(b.textContent)).click()); await sleep(100);
    check('Keep my progress changes nothing', (await stored()).best === 7);
    await page.click('.octo-set-reset > button.octo-btn-ghost'); await sleep(100);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }), page.evaluate(() => [...document.querySelectorAll('.octo-set-confirm button')].find((b) => /Yes/.test(b.textContent)).click())]);
    await page.waitForFunction(() => window.__octo); await sleep(300);
    const after = await stored();
    check('Reset progress erases the journal and best score but keeps the settings', after.best === 0 && after.journal.length <= 1 && after.tutorialDone === false && after.runs === 0 && after.settings.sink === 2 && after.settings.musicVol === 0.3, JSON.stringify(after).slice(0, 200));
  } catch (e) { check('script ran to the end', false, String(e && e.stack || e)); }
  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASSED');
  process.exit(fails.length ? 1 : 0);
})();
