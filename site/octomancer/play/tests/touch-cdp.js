// Node script (not part of tests/index.html): real CDP touch events at 375x812 against a running copy of the game.
//   node touch-cdp.js [baseUrl]            baseUrl default http://127.0.0.1:59611/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// Round 35 / review 1: the stick and the Dash / Bomb buttons used to listen on #touch-ui, which has pointer-events:none,
// so a real touch went to the canvas and nothing happened. This checks, with Input.dispatchTouchEvent (not synthetic
// DOM events), that the controls appear, the octopus swims along the stick, and a bomb thrown with the Bomb button
// flies along the stick.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59611/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(SAVE);
    await page.goto(BASE + '?v2=1&at=1&seed=1', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo, { timeout: 30000 });
    await sleep(800);
    const cdp = await page.target().createCDPSession();
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const vis = () => page.evaluate(() => ['.octo-stick-base', '.octo-stick-nub', '#octo-dash-btn', '#octo-use-btn'].map((s) => getComputedStyle(document.querySelector(s)).display));
    const st = () => page.evaluate(() => __octo.state().octopus);

    check('controls are hidden before the first touch', (await vis()).every((d) => d === 'none'));
    // the stick: touch in the left half, drag right
    await touch('touchStart', [{ x: 100, y: 500, id: 1 }]);
    await sleep(100);
    await touch('touchMove', [{ x: 170, y: 500, id: 1 }]);
    await sleep(120);
    const shown = await vis();
    check('the stick, its nub and both buttons appear after a real touch', shown.every((d) => d !== 'none'), shown.join());
    const a = await st();
    await sleep(450);
    const b = await st();
    check('the octopus swims right along the stick', b.x - a.x > 0.5, `x ${a.x.toFixed(2)} -> ${b.x.toFixed(2)}`);
    // the Bomb button with a second finger while the stick is held right: the bomb flies right
    // controls 2026-10-08: the Bomb button is the Use button now; with the bomb picked on the hotbar it throws one (a sticky mine along the stick)
    await page.evaluate(() => { __octo.input({ select: 1 }); __octo.step(1); __octo.input(null); });
    const bb = await page.evaluate(() => { const r = document.querySelector('#octo-use-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const bombsBefore = (await st()).bombs;
    const o0 = await st();
    await touch('touchStart', [{ x: 170, y: 500, id: 1 }, { x: bb.x, y: bb.y, id: 2 }]);
    await sleep(30);
    const props = await page.evaluate(() => __octo.props().filter((p) => p.kind === 'bomb'));
    console.log('  octopus', o0.x.toFixed(2), o0.y.toFixed(2), 'v', o0.vx.toFixed(2), o0.vy.toFixed(2), 'bomb', props.map((p) => [p.x, p.y, p.vx, p.vy].map((v) => v.toFixed(2)).join(',')).join(' '));
    await touch('touchEnd', []);
    const bombsAfter = (await st()).bombs;
    check('the Use button (bomb picked) throws a bomb', bombsAfter === bombsBefore - 1 && props.length === 1, `bombs ${bombsBefore} -> ${bombsAfter}`);
    if (props.length) check('the bomb flies along the stick (to the right)', props[0].vx > 3, `vx ${props[0].vx.toFixed(2)}`);
    await sleep(200);
    check('the controls stay up while touch is the input mode', (await vis()).slice(2).every((d) => d !== 'none'));
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally { await browser.close(); }
  process.exit(fails.length ? 1 : 0);
})();
