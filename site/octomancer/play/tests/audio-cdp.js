// Node script (not part of tests/index.html): night batch 5 (IMPROVEMENTS.md), sound in real Chrome with navigator.getGamepads
// stubbed. A pad-only player: the first pad press (gamepad.js 'octo-padpress') builds the AudioContext. Headless Chrome lets
// every context run, so the spy below plays the desktop autoplay policy: the context is suspended at birth and resume() does
// nothing until a trusted key press. With it suspended, every effect and every menu sound (the pause menu walked on the pad)
// must not throw and must schedule nothing. Then one real key press resumes it, and effects play. Until that key press every
// call goes through raw CDP with userGesture false (puppeteer's page.evaluate would hand the page a user gesture).
// Headless runs are muted: Daniel listens on real speakers.
//   node audio-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '65123';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIVE = { v: 1, best: 0, runs: 0, muted: true, tutorialDone: true, journal: [] };
const STUB = "(() => { const f = () => [window.__octoFakePad || null, null, null, null]; f.__octoFake = true; window.__octoFakePad = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
const SPY = "(() => { const AC = window.AudioContext; if (!AC) return; window.__acs = []; window.__resumes = 0; window.__gestured = false;"
  + " window.addEventListener('keydown', (e) => { if (e.isTrusted) window.__gestured = true; }, true);"
  + " window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__acs.push(this); super.suspend(); }"
  + " resume() { window.__resumes++; return window.__gestured ? super.resume() : Promise.resolve(); } }; })();";
const SFX = ['dreadSwell', 'beholderArrive', 'dash', 'chime', 'shell', 'inkJet', 'inkPuff', 'slurp', 'emptyJar', 'hurt', 'thud', 'splat', 'impale', 'chainTick', 'zap', 'crunch', 'bomb', 'potBreak', 'harpoon'];
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.evaluateOnNewDocument("try{localStorage.setItem('octomancer.best.v1'," + JSON.stringify(JSON.stringify(DIVE)) + ")}catch(e){}");
    await page.evaluateOnNewDocument(STUB);
    await page.evaluateOnNewDocument(SPY);
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
    // puppeteer's page.evaluate runs with userGesture: true, which would give the page sticky activation (and unlock audio):
    // until the real key press below, every call goes through raw CDP with userGesture false
    const cdp = await page.target().createCDPSession();
    const ev = async (fn, ...args) => {
      const r = await cdp.send('Runtime.evaluate', { expression: '(' + fn + ')(...' + JSON.stringify(args) + ')', userGesture: false, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
      return r.result.value;
    };
    for (let i = 0; i < 120 && !(await ev(() => !!(window.__octo && !__octo.level().transitioning))); i++) await sleep(500);
    await sleep(800);
    const state = () => ev(() => ({ n: (window.__acs || []).length, state: window.__acs && window.__acs[0] ? window.__acs[0].state : null, started: __octo.audio().started, src: __octo.audioSources().filter((s) => s.kind !== 'music').length, active: navigator.userActivation ? navigator.userActivation.hasBeenActive : null, resumes: window.__resumes }));
    let s = await state();
    check('no AudioContext before any input, and the page has no user activation', s.n === 0 && !s.started && s.active === false, JSON.stringify(s));

    // a pad press only (no key, no click): the stub pad's A
    await ev(() => { __octo.pad({}, 2); __octo.pad({ a: true }, 2); __octo.pad({}, 2); });
    await sleep(200);
    s = await state();
    check('the first pad press builds the AudioContext (pad-only players get sound)', s.n === 1 && s.started, JSON.stringify(s));
    check('without a user gesture it stays suspended (the spy plays the autoplay policy)', s.state === 'suspended' && s.resumes >= 1, JSON.stringify(s));

    // every effect, and the pause menu on the pad (focus moves, a slider-free walk, confirm on Resume is avoided: back)
    const out = await ev((names) => {
      const bad = [];
      for (const n of names) { try { __octo.sfx(n); } catch (e) { bad.push(n + ': ' + e); } }
      return bad;
    }, SFX);
    check('with the context suspended no effect call throws', out.length === 0, out.join(' | '));
    await ev(() => { __octo.pad({ start: true }, 2); __octo.pad({}, 2); });
    await sleep(150);
    const paused = await ev(() => __octo.padState().menu);
    await ev(() => { for (let i = 0; i < 3; i++) { __octo.pad({ down: true }, 2); __octo.pad({}, 2); } __octo.pad({ up: true }, 2); __octo.pad({}, 2); __octo.pad({ b: true }, 2); __octo.pad({}, 2); });
    await sleep(150);
    s = await state();
    check('the pause menu opened and was walked on the pad (focus ticks, back) with the context suspended', paused === true, JSON.stringify(s));
    check('nothing was scheduled while suspended (no burst waiting for the resume)', s.src === 0 && s.state === 'suspended', JSON.stringify(s));
    check('each later pad press retried resume() (a pad press may count as a gesture in some browser)', s.resumes >= 4, JSON.stringify(s));
    check('no page errors while suspended', errs.length === 0, errs.slice(0, 3).join(' | '));

    // one real gesture: the context resumes
    await page.keyboard.press('KeyZ'); // (a modifier alone is no user activation)
    for (let i = 0; i < 25 && (await ev(() => window.__acs[0].state)) !== 'running'; i++) await sleep(200);
    s = await state();
    check('the first real key resumes it', s.state === 'running' && s.n === 1, JSON.stringify(s));
    const after = await page.evaluate(() => { __octo.sfx('chime'); __octo.sfx('inkJet'); return __octo.audioSources().filter((x) => x.kind !== 'music').length; });
    check('effects play once it runs', after > 0, 'sources ' + after);
    const capped = await page.evaluate(() => { for (let i = 0; i < 200; i++) { __octo.sfx('bomb'); __octo.sfx('splat'); __octo.sfx('hurt'); } return __octo.audioSources().filter((x) => x.kind !== 'music' && !x.loop).length; });
    check('a burst of 600 effect calls stays within the 24-voice cap', capped <= 24, 'one-shots ' + capped);
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally { await browser.close(); }
  process.exit(fails.length ? 1 : 0);
})();
