// Node script (not part of tests/index.html): controller Phase 1 (octomancer-web/CONTROLLER-PLAN.md) in real Chrome against a
// running copy of the game, with a fake standard gamepad: navigator.getGamepads is stubbed before the page loads
// (evaluateOnNewDocument) and __octo.pad(state) drives the stub. Plays Shallows 1-1 with it: swim, aim the ink jet with the
// right stick and by the light auto-aim cone, the bomb from its slot (dropped and thrown), the hand (grab, throw), dash on B and
// LT, Start pauses and unpauses, the menu cursor on the pause menu and settings (a slider), the death screen's Restart run on A,
// the clear screen, the controls line switching between pad and keyboard glyphs, an unplug pausing the game, and a DualSense
// showing its own glyphs. Frames: octomancer-web/night/pad-*.png (1440x900).
//   node pad-cdp.js [port | baseUrl]
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '63907';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'pad-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
// the stub: no pad until the test plugs one in (window.__octoFakePad, written by __octo.pad)
const STUB = "(() => { const f = () => [window.__octoFakePad || null, null, null, null]; f.__octoFake = true; window.__octoFakePad = null; Object.defineProperty(navigator, 'getGamepads', { value: f, configurable: true, writable: true }); })();";
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
const P = (p, st, polls = 1) => p.evaluate((st, n) => __octo.pad(st, n), st, polls);
const S = (p) => p.evaluate(() => __octo.padState());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
const octoAt = (p) => p.evaluate(() => { const o = __octo.state().octopus; return { x: o.x, y: o.y, vx: o.vx, vy: o.vy }; });
/** A tap of one pad button: down for a step, then up. */
async function tap(p, st, n = 2) { await P(p, st); await step(p, n); await P(p, {}); await step(p, 1); }
const shot = (page, tag) => page.screenshot({ path: OUT + tag + '.png' });

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    const page = await open(browser, '?at=1&seed=5');
    await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
    let s = await S(page);
    check('no pad yet: the controls line is the keyboard one', s.help.scheme === 'keyboard' && /Hand F/.test(s.help.text) && s.help.glyphs.length === 0, JSON.stringify(s.help).slice(0, 120));
    // plug in: nothing changes until the pad is used
    s = await P(page, {});
    check('a pad plugged in is seen (standard mapping, Xbox glyphs)', s.connected && s.style === 'xbox');
    check('plugging it in alone does not switch the scheme', (await S(page)).mode !== 'pad');

    // ---- swim on the left stick
    const o0 = await octoAt(page);
    await P(page, { lx: 1 }); await step(page, 30);
    const o1 = await octoAt(page);
    s = await S(page);
    check('the left stick swims (right)', o1.x > o0.x + 0.8, `${o0.x.toFixed(2)} -> ${o1.x.toFixed(2)}`);
    check('using the pad switches the input mode to pad', s.mode === 'pad');
    check('the controls line shows pad glyphs (LS, RS, RT, RB, A, B, LB, View, Menu)', s.help.scheme === 'pad' && ['LS', 'RS', 'RT', 'RB', 'A', 'B', 'LB', 'View', 'Menu'].every((g) => s.help.glyphs.includes(g)) && !/Hand F/.test(s.help.text), s.help.glyphs.join(','));
    await P(page, { lx: 0.1, ly: 0.1 }); await step(page, 1);
    check('a stick inside its 0.2 deadzone does not move the octopus', (await page.evaluate(() => __octo.state().input.move.x)) === 0);
    await P(page, {}); await step(page, 30);
    await shot(page, 'line-pad');

    // ---- aim: the right stick sends the ink jet up
    await P(page, { ry: -1, rt: 1 }); await step(page, 2);
    s = await S(page);
    const up = s.jet[0];
    check('RT fires the ink jet along the right stick (up)', !!up && up[1] < -1 && Math.abs(up[0]) < Math.abs(up[1]) * 0.2, JSON.stringify(s.jet));
    check('the aim stick shows in the snapshot (aim.active)', await page.evaluate(() => { const a = __octo.state().input.aim; return a && a.active && a.y < -0.9; }));
    await P(page, {}); await step(page, 90);

    // ---- auto-aim: no aim stick, a creature up-ahead in the facing cone bends the shot onto it
    await P(page, { lx: -1 }); await step(page, 3); await P(page, {}); await step(page, 1); // face left (open water there)
    let o = await octoAt(page);
    const spawned = await page.evaluate((o) => { const before = __octo.enemies().length; __octo.spawn('piranha', o.x - 3.2, o.y - 1.1); return __octo.enemies().length > before; }, o);
    await step(page, 1);
    const foe = await page.evaluate(() => __octo.enemies().slice(-1)[0]);
    await P(page, { rt: 1 }); await step(page, 1);
    s = await S(page);
    o = await octoAt(page);
    const blob = s.jet[0];
    if (spawned && foe && blob) {
      const want = Math.atan2(foe.y - o.y, foe.x - o.x), got = Math.atan2(blob[1], blob[0]);
      check('auto-aim: with the aim stick idle the jet bends toward the creature in the facing cone', Math.abs(want - got) < 0.25 && blob[1] < -0.5, `want ${want.toFixed(2)} got ${got.toFixed(2)}`);
    } else check('auto-aim: set-up (a piranha and a blob)', false, JSON.stringify({ spawned, foe, blob }));
    await P(page, {}); await step(page, 90);
    await page.evaluate(() => { for (const e of __octo.enemies()) if (!e.dead && e.kind === 'piranha') { /* leave it: god mode */ } });

    // ---- the bomb from its slot: d-pad up picks it, RB drops it (no aim) or throws it (aim)
    await page.evaluate(() => __octo.giveBombs(4));
    await tap(page, { up: true });
    let j = await page.evaluate(() => __octo.juice().hotbar);
    check('d-pad up selects the bomb slot', j.sel === 0 && j.spell === 'bomb', JSON.stringify(j));
    await tap(page, { rb: true });
    let bl = await page.evaluate(() => __octo.bombsLive());
    check('RB with the aim stick idle drops a bomb', bl.length === 1 && Math.abs(bl[0].vx) < 1.5 && (await octoAt(page)).y <= bl[0].y + 0.1, JSON.stringify(bl));
    await P(page, { rx: -1, rb: true }); await step(page, 2); await P(page, {}); await step(page, 1);
    bl = await page.evaluate(() => __octo.bombsLive());
    check('RB with the aim stick throws the bomb that way', bl.length === 2 && bl.some((b) => b.vx < -2), JSON.stringify(bl.map((b) => [b.vx.toFixed(1), b.vy.toFixed(1)])));
    await step(page, 200);
    // the hotbar cycle: LB and d-pad right / left
    j = await page.evaluate(() => __octo.juice().hotbar);
    await tap(page, { lb: true });
    const sel1 = (await page.evaluate(() => __octo.juice().hotbar)).sel;
    await tap(page, { left: true });
    const sel2 = (await page.evaluate(() => __octo.juice().hotbar)).sel;
    check('LB steps the hotbar forward, d-pad left back', sel1 !== j.sel && sel2 === j.sel, `${j.sel} -> ${sel1} -> ${sel2}`);

    // ---- the hand on A: grab a pot, throw it (back at the start: open water all round)
    await page.evaluate((o) => __octo.teleport(o.x, o.y), o0); await step(page, 10);
    o = await octoAt(page);
    await page.evaluate((o) => __octo.addLoot('pot', o.x - 0.8, o.y), o);
    await step(page, 4);
    let h = await page.evaluate(() => __octo.hand());
    check('a pot in reach is the hand target', !!h.target && h.target.kind === 'pot');
    await tap(page, { a: true });
    h = await page.evaluate(() => __octo.hand());
    check('A grabs the pot', h.held === 'pot');
    const throws0 = h.throws;
    await P(page, { rx: -1 }); await step(page, 1);
    await P(page, { rx: -1, a: true }); await step(page, 2);
    await P(page, { rx: -1 }); await step(page, 1); // a tap throws on its release (a hold drops)
    h = await page.evaluate(() => __octo.hand());
    const pot = await page.evaluate(() => Math.min(...__octo.props().filter((p) => p.kind === 'pot').map((p) => p.vx)));
    await P(page, {}); await step(page, 2);
    check('A again throws it along the aim stick', h.held === '' && h.throws === throws0 + 1 && pot < -1, `vx ${pot}`);
    await step(page, 60);

    // ---- dash on B and on LT
    await page.evaluate((o) => __octo.teleport(o.x, o.y), o0); await step(page, 10);
    await tap(page, { b: true }, 1);
    let d1 = (await S(page)).dashCd;
    await step(page, 60);
    await tap(page, { lt: 1 }, 1);
    let d2 = (await S(page)).dashCd;
    check('B dashes, and so does LT', d1 > 0 && d2 > 0, `${d1} ${d2}`);
    await step(page, 30);

    // ---- Start pauses; the menu cursor; B and Start resume
    await P(page, { start: true }); await P(page, {}, 9);
    s = await S(page);
    const pausedNow = await page.evaluate(() => __octo.state().paused && getComputedStyle(document.querySelector('.octo-pause-overlay')).display !== 'none');
    check('Start pauses (the pause menu shows)', pausedNow && s.menu);
    check('the pause menu has a focus ring in pad mode', s.ring, s.focus);
    const ringCol = await page.evaluate(() => getComputedStyle(document.querySelector('.octo-pad-focus')).outlineColor);
    check('the focus ring is the selected hotbar border colour (#d2fbe6)', /210, 251, 230/.test(ringCol), ringCol);
    check('the pause hint names the pad buttons', await page.evaluate(() => /Menu or B/.test(document.querySelector('.octo-pause-overlay .octo-overlay-hint').textContent)));
    const keyCaps = await page.evaluate(() => [...document.querySelectorAll('.octo-pause-overlay .octo-key')].every((k) => getComputedStyle(k).display === 'none'));
    check('key caps (R) are hidden on the buttons in pad mode', keyCaps);
    const f0 = s.focus;
    await tap(page, { down: true }, 0);
    s = await S(page);
    check('the d-pad moves the focus', s.focus !== f0 && s.ring, `${f0} -> ${s.focus}`);
    await shot(page, 'pause-focus');
    // into settings: walk down to it, A
    for (let i = 0; i < 4 && !/Settings/.test((await S(page)).focus); i++) await tap(page, { down: true }, 0);
    check('Settings is reachable in the pause menu', /Settings/.test((await S(page)).focus), (await S(page)).focus);
    await tap(page, { a: true }, 0);
    await P(page, {}, 9);
    let st = await page.evaluate(() => __octo.settings());
    s = await S(page);
    check('A opens Settings, the ring is on a control there', st.open && s.ring, s.focus);
    // find the music slider: move until the focus is a range input, then right raises it
    let onRange = false;
    for (let i = 0; i < 12 && !onRange; i++) {
      onRange = await page.evaluate(() => { const e = document.activeElement; return !!e && e.tagName === 'INPUT' && e.type === 'range' && !!document.querySelector('.octo-set-row.octo-pad-focus'); });
      if (!onRange) await tap(page, { up: true }, 0);
    }
    const rangeKey = await page.evaluate(() => { const e = document.activeElement; return e && e.dataset.setting; });
    const v0 = await page.evaluate((k) => __octo.settings()[k] !== undefined ? __octo.settings()[k] : __octo.settings().values[k], rangeKey);
    await tap(page, { left: true }, 0);
    const v1 = await page.evaluate((k) => __octo.settings()[k] !== undefined ? __octo.settings()[k] : __octo.settings().values[k], rangeKey);
    check('on a slider the d-pad left / right changes its value', onRange && v1 !== v0, `${rangeKey}: ${v0} -> ${v1}`);
    await tap(page, { right: true }, 0);
    await shot(page, 'settings-focus');
    await tap(page, { b: true }, 0);
    st = await page.evaluate(() => __octo.settings());
    const backToPause = await page.evaluate(() => getComputedStyle(document.querySelector('.octo-pause-overlay')).display !== 'none');
    check('B closes Settings back to the pause menu', !st.open && backToPause);
    await tap(page, { b: true }, 0);
    check('B resumes from the pause menu', !(await page.evaluate(() => __octo.state().paused)));
    await P(page, { start: true }); await P(page, {});
    const p1 = await page.evaluate(() => __octo.state().paused);
    await P(page, { start: true }); await P(page, {});
    const p2 = await page.evaluate(() => __octo.state().paused);
    check('Start pauses and Start unpauses', p1 && !p2);
    await page.evaluate(() => __octo.freeze(true));

    // ---- the keyboard takes over again: the line follows
    await page.keyboard.press('KeyW'); await step(page, 2);
    s = await S(page);
    check('a key flips the scheme back to keyboard (the line names keys again)', s.mode === 'keyboard' && s.help.scheme === 'keyboard' && /Hand F/.test(s.help.text) && s.help.glyphs.length === 0);
    await shot(page, 'line-keyboard');
    await P(page, { a: true }); await P(page, {}); await step(page, 1);
    check('the pad takes it back on a press', (await S(page)).help.scheme === 'pad');
    await page.mouse.click(700, 450); await step(page, 1);
    check('a click flips it to mouse (the keyboard / mouse line)', (await S(page)).mode === 'mouse' && (await S(page)).help.scheme === 'keyboard');
    await P(page, { lx: 1 }); await P(page, {}); await step(page, 1);

    // ---- the death screen: A on Restart run
    await page.evaluate(() => { __octo.god(false); __octo.freeze(false); __octo.kill('crab'); });
    await page.waitForFunction(() => __octo.state().gameOverShown, { timeout: 8000 });
    await sleep(300);
    await P(page, {}, 9);
    s = await S(page);
    check('the death screen takes the pad, focus on Restart run', s.menu && s.ring && /Restart run/.test(s.focus), s.focus);
    await shot(page, 'death-focus');
    await P(page, { a: true }); await sleep(250);
    await P(page, { a: true }, 3); // still held while the new level comes in
    await page.waitForFunction(() => !__octo.level().transitioning && !__octo.state().octopus.dead, { timeout: 20000 }).catch(() => {});
    const grabs0 = (await page.evaluate(() => __octo.hand())).grabs;
    await P(page, { a: true }, 3); await page.evaluate(() => __octo.stepDraw(3));
    const latchedA = (await S(page)).latched.includes('a');
    const after = await page.evaluate(() => ({ go: __octo.state().gameOverShown, dead: __octo.state().octopus.dead, stage: __octo.level().stage }));
    await P(page, {});
    check('A restarts the run from the death screen (Shallows 1-1 again)', !after.go && !after.dead, JSON.stringify(after));
    check('the A that restarted waits for its release (no grab in the new level)', latchedA && (await page.evaluate(() => __octo.hand())).grabs === grabs0);
    await page.waitForFunction(() => !__octo.level().transitioning, { timeout: 20000 });

    // ---- unplugging mid-play pauses
    await sleep(400);
    await P(page, { lx: 1 }); await sleep(100); await P(page, {});
    await P(page, null);
    check('unplugging the pad mid-play pauses the game', await page.evaluate(() => __octo.state().paused));
    check('desktop: no page errors', page.errs.length === 0, page.errs.join(' | '));
    await page.close();

    // ---- the clear screen: A continues
    const pe = await open(browser, '?at=end&seed=5');
    await P(pe, {}); await P(pe, { a: true }); await P(pe, {}, 9);
    s = await S(pe);
    check('the clear screen takes the pad, focus on its button', s.menu && s.ring && /hub/i.test(s.focus), s.focus);
    await P(pe, { a: true }); await sleep(200); await P(pe, {});
    await sleep(1500);
    check('A on the clear screen goes on', !(await pe.evaluate(() => __octo.level().endShown)));
    check('clear screen: no page errors', pe.errs.length === 0, pe.errs.join(' | '));
    await pe.close();

    // ---- a fresh save: the tutorial offer answered with A (the demo's first step)
    {
      const pf = await browser.newPage();
      await pf.setViewport({ width: 1440, height: 900 });
      const errs = []; pf.on('pageerror', (e) => errs.push(String(e)));
      await pf.evaluateOnNewDocument("try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:false,journal:[]}))}catch(e){}");
      await pf.evaluateOnNewDocument(STUB);
      await pf.goto(BASE + '?seed=7', { waitUntil: 'networkidle0', timeout: 60000 });
      await pf.waitForFunction(() => window.__octo && __octo.hubSeal && !__octo.transitioning(), { timeout: 30000 });
      await sleep(600);
      // Phase 2B: no offer card; the welcome board points at the ring, the ring takes A
      await P(pf, { lx: 0.6 }); await sleep(150); await P(pf, {}); await sleep(250);
      const sg = await pf.evaluate(() => __octo.signs());
      check('a fresh save: no offer card, the welcome board over the start names A', !sg.popup && sg.scheme === 'pad' && sg.open && sg.open.glyphs.includes('A'), JSON.stringify(sg.open));
      const ring = await pf.evaluate(() => __octo.hubSeal());
      await pf.evaluate((x, y) => { for (let n = 0; n < 6; n++) { __octo.teleport(x, y); __octo.stepDraw(1); } }, ring.tutorialX + 0.5, ring.tutorialY + 0.3);
      await P(pf, { a: true }); await sleep(150); await P(pf, {});
      await sleep(400);
      const off = await pf.evaluate(() => __octo.hubSeal().offer);
      await pf.waitForFunction(() => __octo.level().stage === 'Tutorial' && !__octo.level().transitioning, { timeout: 20000 }).catch(() => {}); // (the dive-in takes a moment)
      await sleep(500);
      const stg = await pf.evaluate(() => __octo.level().stage);
      check('A at the tutorial ring takes the tutorial', !off && /tutorial/i.test(stg), stg);
      check('offer: no page errors', errs.length === 0, errs.join(' | '));
      await pf.close();
    }

    // ---- a DualSense shows its own glyphs
    const pp = await open(browser, '?at=1&seed=5');
    const DS = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
    await P(pp, { id: DS }); await P(pp, { id: DS, lx: 1 }); await P(pp, { id: DS });
    s = await S(pp);
    check('a DualSense: PlayStation glyphs on the line (R2, R1, Cross, Options)', s.style === 'ps' && ['R2', 'R1', 'Cross', 'Options'].every((g) => s.help.glyphs.includes(g)), s.help.glyphs.join(','));
    await shot(pp, 'line-ps');
    check('DualSense: no page errors', pp.errs.length === 0, pp.errs.join(' | '));
    await pp.close();
  } catch (e) {
    check('THREW ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e), false);
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})();
