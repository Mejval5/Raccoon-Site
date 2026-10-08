// Node script (not part of tests/index.html): the tutorial's rooms inside the REAL game, headless Chrome.
//   node tutorial-cdp.js [baseUrl] [shotDir]   baseUrl default http://127.0.0.1:63310/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// A bot plays the whole tutorial through main.js with the real input: the swim is steered with __octo.input({move}) (an A*
// path from pathcheck.js, as tests/bot.js does), every action is a real key or mouse press (Space dash, J ink, F hand,
// C use, a right click for the sticky mine, 1-9 hotbar). Each room's goal must open its door (and nothing else does),
// a door also opens after a wait, prompts follow the input method (keyboard / touch), the hearts never drop to zero,
// and finishing unlocks the dive in the hub. Frames of every room at 1440x900 and 412x915 go to shotDir (tutorial-*.png).
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:63310/octomancer/play/index.html';
const SHOTS = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:false,journal:[]}))}}catch(e){}";
const PHONE = { viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' };
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };

async function open(browser, vp, q) {
  const page = await browser.newPage();
  if (vp === 'phone') await page.emulate(PHONE); else await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1200);
  await page.evaluate(() => __octo.freeze(true));
  await page.evaluate(async () => { window.__pc = await import('./js/pathcheck.js'); }); // the bot's A* (the same module tests/bot.js uses)
  page.errs = errs;
  return page;
}
const T = (p) => p.evaluate(() => __octo.tutorial());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
let shotN = 0;
const shot = async (p, tag) => { if (!SHOTS) return; await p.evaluate(() => __octo.stepDraw(1)); await p.screenshot({ path: path.join(SHOTS, 'tutorial-' + tag + '.png') }); shotN++; };

/** Swim to (gx, gy) within r along an A* path (replanned), the move steered through __octo.input; real keys pressed meanwhile still count. */
function go(p, gx, gy, r = 0.6, max = 1500) {
  return p.evaluate((gx, gy, r, max) => {
    const { createPathGrid, findPath, segmentFree } = window.__pc;
    const L = __octo.level();
    let grid = null, path = null, pi = 0, since = 1e9, best = 1e9, stall = 0;
    for (let n = 0; n < max; n++) {
      const o = __octo.state().octopus;
      const d = Math.hypot(o.x - gx, o.y - gy);
      if (d <= r) { __octo.input({ move: { x: 0, y: 0 } }); return { ok: true, n, x: o.x, y: o.y }; }
      if (d < best - 0.02) { best = d; stall = 0; } else stall++;
      if (!path || since >= 30 || stall > 120) {
        grid = createPathGrid(L.w, L.h, (x, y) => __octo.tileAt(x, y) !== 0);
        path = findPath(grid, o.x, o.y, gx, gy, Math.max(0.3, r - 0.1));
        pi = 0; since = 0; if (stall > 120) { stall = 0; best = 1e9; }
        if (!path) { __octo.input({ move: { x: 0, y: 0 } }); return { ok: false, n, why: 'no path', x: o.x, y: o.y }; }
      }
      since++;
      const P = path.points, np = P.length / 2;
      while (pi < np - 1 && Math.hypot(o.x - P[pi * 2], o.y - P[pi * 2 + 1]) < 0.6) pi++;
      let tj = pi;
      for (let j = Math.min(np - 1, pi + 14); j > pi; j--) if (segmentFree(grid, o.x, o.y, P[j * 2], P[j * 2 + 1])) { tj = j; break; }
      const tx = P[tj * 2] - o.x, ty = P[tj * 2 + 1] - o.y, tl = Math.hypot(tx, ty) || 1;
      __octo.input({ move: { x: tx / tl, y: ty / tl } });
      __octo.stepDraw(1);
    }
    __octo.input({ move: { x: 0, y: 0 } });
    const o = __octo.state().octopus;
    return { ok: false, n: max, why: 'timeout', x: o.x, y: o.y };
  }, gx, gy, r, max);
}
/** Hold a move for n steps. */
const hold = (p, mx, my, n) => p.evaluate((mx, my, n) => { __octo.input({ move: { x: mx, y: my } }); __octo.stepDraw(n); __octo.input({ move: { x: 0, y: 0 } }); }, mx, my, n);
const key = async (p, k, after = 1) => { await p.keyboard.press(k); await step(p, after); };
async function toScreen(page, x, y) {
  return page.evaluate((x, y) => { const c = __octo.state().camera, k = devicePixelRatio || 1; return { x: innerWidth / 2 + (x - c.x) * c.ppu / k, y: innerHeight / 2 + (y - c.y) * c.ppu / k }; }, x, y);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000 });
  try {
    // ======================================================== the bot plays the tutorial (desktop, keyboard + mouse)
    const p = await open(browser, 'desktop', '?at=tutorial&seed=7&offer=0');
    let t = await T(p);
    check('start: in the tutorial, in the first room, every door shut, practice on', t.tutorial && t.roomId === 'swim' && Object.values(t.doors).every((n) => n > 0) && t.practice, JSON.stringify(t.doors));
    check('start: the swim prompt names the keys', /WASD/.test(t.prompt), t.prompt.slice(0, 60));
    await shot(p, 'swim-desktop');
    let minHearts = 3;
    const hearts = async () => { const h = (await T(p)).hearts; minHearts = Math.min(minHearts, h); return h; };

    // 1 swim + dash: through the urchins on a dash (i-frames)
    let r = await go(p, 16.9, 11.6, 0.35);
    t = await T(p);
    check('room 1: swims to the urchin gap', r.ok, JSON.stringify(r));
    check('room 1: the dash prompt says the dash cannot be hurt', /Dash/.test(t.prompt) && /nothing can hurt you/.test(t.prompt), t.prompt.slice(0, 80));
    await shot(p, 'dash-desktop');
    const h0 = await hearts();
    await p.evaluate(() => __octo.input({ move: { x: 1, y: 0.05 } }));
    await p.keyboard.press('Space');
    await step(p, 30);
    const h1 = await hearts();
    t = await T(p);
    check(`room 1: a dash through the urchins costs no heart (${h0} -> ${h1}) and the room is passed`, h1 === h0 && t.rooms[0].done, JSON.stringify(t.rooms[0]));

    // 2 ink jet at the fish bones: door 1
    check('room 2: door 1 still shut before any ink', (await T(p)).doors[1] > 0);
    r = await go(p, 30.6, 9.6, 0.4);
    t = await T(p);
    check('room 2: the ink prompt names left click and J', /Left click/.test(t.prompt) && /\bJ\b/.test(t.prompt), t.prompt.slice(0, 80));
    await shot(p, 'ink-desktop');
    for (let k = 0; k < 6 && (await T(p)).doors[1] > 0; k++) {
      await hold(p, 0.15, -1, 2);         // face up (the J jet goes the way you last swam)
      await key(p, 'KeyJ', 60);           // one blob, then the 1.5 s refill
      await hold(p, 0, 0, 20);
    }
    t = await T(p);
    check('room 2: the Ink Jet breaks the fish bones and door 1 opens', t.rooms[1].done && t.doors[1] === 0 && t.open[1], JSON.stringify(t.rooms[1]));
    check('room 2: door 2 is still shut', t.doors[2] > 0);

    // 3 grab a pot with F, throw it at the fish-bone stump: door 2
    r = await go(p, 39.4, 12.2, 0.45);
    await hold(p, 0, 0, 25);              // stop: the hand's target is in reach
    t = await T(p);
    check('room 3: the hand prompt names F and the middle click', /F or middle click/.test(t.prompt), t.prompt.slice(0, 80));
    await key(p, 'KeyF', 2);
    let hd = await p.evaluate(() => __octo.hand());
    check('room 3: F picks up a pot', hd.held === 'pot', JSON.stringify(hd));
    await shot(p, 'grab-desktop');
    r = await go(p, 44.2, 11.8, 0.5);
    await p.evaluate(() => __octo.input({ move: { x: 1, y: 0 } }));
    await key(p, 'KeyF', 1);              // a tap: thrown along the move keys
    await step(p, 40);
    await p.evaluate(() => __octo.input({ move: { x: 0, y: 0 } }));
    t = await T(p);
    check('room 3: a thrown pot opens door 2', t.rooms[2].done && t.doors[2] === 0 && t.throws >= 1, JSON.stringify({ r: t.rooms[2], d: t.doors }));

    // 4 bombs: drop one on the cracked floor (C = use the picked slot), swim clear
    r = await go(p, 61.5, 11.4, 0.35);
    await hold(p, 0, 0, 35);
    t = await T(p);
    check('room 4: the bomb prompt names C and that a blast kills outside the tutorial', /press C/.test(t.prompt) && /kills you/.test(t.prompt), t.prompt.slice(0, 80));
    const sel = await p.evaluate(() => { const h = __octo.juice().hotbar; return h.slots[h.sel][0]; });
    check('room 4: the bomb is picked on the bar', sel === 'bomb', sel);
    for (let k = 0; k < 3 && !(await T(p)).rooms[3].done; k++) {
      await go(p, 61.5, 11.4, 0.35); await hold(p, 0, 0, 30);
      await key(p, 'KeyC', 2);
      await shot(p, 'bomb-desktop');
      await go(p, 54.5, 8.5, 0.8, 300);
      await hold(p, 0, 0, 120);
    }
    t = await T(p);
    check('room 4: the floor breaks', t.rooms[3].done, JSON.stringify(t.rooms[3]));
    r = await go(p, 58.5, 30.5, 0.6, 2500);
    check('room 4: down the shaft into the sticky-mine room', r.ok && (await T(p)).roomId === 'sticky', JSON.stringify(r));

    // 4b the sticky mine: a right click at the cracked wall
    await go(p, 55.5, 31, 0.5); await hold(p, 0, 0, 20);
    t = await T(p);
    check('room 4b: the sticky prompt names the right click', /right click/.test(t.prompt), t.prompt.slice(0, 80));
    await shot(p, 'sticky-desktop');
    for (let k = 0; k < 3 && !(await T(p)).rooms[4].done; k++) {
      await go(p, 55.5, 31, 0.5); await hold(p, 0, 0, 10);
      const at = await toScreen(p, 50.6, 30.8);
      await p.mouse.move(at.x, at.y);
      await p.mouse.click(at.x, at.y, { button: 'right' });
      await step(p, 2);
      await go(p, 62.5, 28.5, 0.8, 300);
      await hold(p, 0, 0, 140);
    }
    t = await T(p);
    check('room 4b: the sticky mine breaks the wall', t.rooms[4].done, JSON.stringify(t.rooms[4]));

    // 5 hotbar + Ink Cloud: pick slot 1 and use it; door 3
    check('room 5: door 3 shut before a cast', (await T(p)).doors[3] > 0);
    r = await go(p, 44.5, 30.5, 0.5, 1500);
    t = await T(p);
    check('room 5: the spell prompt names Q / E and Ink Cloud', /Q, E/.test(t.prompt) && /Ink Cloud/.test(t.prompt), t.prompt.slice(0, 80));
    await key(p, 'Digit1', 1);
    await key(p, 'KeyC', 2);
    await shot(p, 'cloud-desktop');
    t = await T(p);
    check('room 5: an Ink Cloud cast opens door 3', t.rooms[5].done && t.doors[3] === 0 && t.casts >= 1, JSON.stringify({ r: t.rooms[5], d: t.doors }));
    await hold(p, 0, 0, 30);
    await hearts();

    // 6 the free stall: F on a ware; door 4
    r = await go(p, 29.6, 31.5, 0.45, 1500);
    await hold(p, 0, 0, 25);
    t = await T(p);
    check('room 6: the shop prompt names F and theft', /press F/.test(t.prompt) && /keeper come for you/.test(t.prompt), t.prompt.slice(0, 80));
    await shot(p, 'shop-desktop');
    await key(p, 'KeyF', 3);
    if ((await T(p)).buys === 0) { await go(p, 27.4, 31.5, 0.45); await hold(p, 0, 0, 25); await key(p, 'KeyF', 3); }
    t = await T(p);
    check('room 6: taking a ware opens door 4', t.rooms[6].done && t.doors[4] === 0 && t.buys >= 1, JSON.stringify({ r: t.rooms[6], d: t.doors, b: t.buys }));
    if ((await p.evaluate(() => __octo.hand())).held) { await p.keyboard.down('KeyF'); await step(p, 20); await p.keyboard.up('KeyF'); await step(p, 2); } // set a lifted ware down

    // 7 the hazard gallery: seen from the corridor
    r = await go(p, 12.5, 31.2, 0.6, 1500);
    t = await T(p);
    check('room 7: the gallery shows its signs (spikes / boulder / clam)', ['Spikes', 'Boulder', 'Clam'].some((w) => t.prompt.includes(w)) || /Spikes/.test(t.prompt), t.prompt.slice(0, 60));
    await shot(p, 'hazards-desktop');
    // 8 the exit
    r = await go(p, 5.4, 31.2, 0.5, 1500);
    t = await T(p);
    check('room 8: the exit prompt names F, the Beholder, the Swift Current and Tab', /press F/.test(t.prompt) && /Beholder/.test(t.prompt) && /Swift Current/.test(t.prompt) && /Tab/.test(t.prompt), t.prompt.slice(0, 120));
    await shot(p, 'exit-desktop');
    check(`the hearts never dropped to zero (lowest ${minHearts})`, minHearts >= 1 && (await T(p)).hearts >= 1);
    // into the whirlpool (F where the whirlpool asks for it)
    r = await go(p, 4.5, 32.2, 0.5, 600);
    await hold(p, 0, 0, 10);
    if ((await T(p)).state === 1 && !(await p.evaluate(() => __octo.level().transitioning))) { await key(p, 'KeyF', 3); }
    await p.evaluate(() => __octo.freeze(false));
    await p.waitForFunction(() => __octo.level().run.state === 0 && !__octo.level().transitioning, { timeout: 30000 }).catch(() => {});
    await sleep(3500);
    const seal = await p.evaluate(() => __octo.hubSeal());
    check('the end: back in the hub, the tutorial saved as done and the dive open', seal.tutorialDone && seal.savedDone && seal.open, JSON.stringify(seal));
    check('desktop: no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await p.close();

    // ======================================================== a door opens after a wait; nothing else opens it
    {
      const q = await open(browser, 'desktop', '?at=tutorial&seed=7&offer=0');
      await q.evaluate(() => { __octo.teleport(44.5, 10.5); __octo.stepDraw(5); });
      let w = await T(q);
      check('wait: in room 3, door 2 shut', w.roomId === 'hand' && w.doors[2] > 0);
      await q.evaluate(() => __octo.stepDraw(500));
      w = await T(q);
      check('wait: after 10 s door 2 is still shut', w.doors[2] > 0 && !w.rooms[2].done);
      await q.evaluate(() => __octo.stepDraw(520));
      w = await T(q);
      check('wait: after 20 s in the room door 2 opens anyway (goal not done)', w.doors[2] === 0 && !w.rooms[2].done, JSON.stringify(w.doors));
      check('wait: the other doors stay shut', w.doors[1] > 0 && w.doors[3] > 0 && w.doors[4] > 0, JSON.stringify(w.doors));
      await q.close();
    }

    // ======================================================== a replay (tutorial done once): every door open
    {
      const q = await browser.newPage();
      await q.setViewport({ width: 1440, height: 900 });
      await q.evaluateOnNewDocument("try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}");
      await q.goto(BASE + '?at=tutorial&seed=7', { waitUntil: 'networkidle0', timeout: 60000 });
      await q.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
      await sleep(800);
      const w = await T(q);
      check('replay: after the first finish every door starts open (skip to any lesson)', Object.values(w.doors).every((n) => n === 0), JSON.stringify(w.doors));
      await q.close();
    }

    // ======================================================== prompts per input method, and every room on a phone
    {
      const q = await open(browser, 'phone', '?at=tutorial&seed=7&offer=0');
      await q.touchscreen.tap(60, 400); // a touch: the game is in touch mode
      await q.evaluate(() => __octo.input(null));
      const spots = [['swim', 8, 9, /Drag/], ['dash', 15.5, 11.5, /Tap Dash/], ['ink', 28, 9, /Tap Jet/], ['grab', 41, 10, /tap Grab/], ['bomb', 61.5, 10, /tap Bomb/],
        ['sticky', 58, 30, /tap Bomb/], ['cloud', 42, 29, /Tap Spell/], ['shop', 27, 30, /tap Grab/], ['hazards', 12.5, 31, /Spikes/], ['exit', 4.5, 30.5, /tap Enter to dive/]];
      for (const [tag, x, y, re] of spots) {
        await q.evaluate((x, y) => { for (let n = 0; n < 12; n++) { __octo.teleport(x, y); __octo.stepDraw(1); } }, x, y);
        const w = await T(q);
        check(`phone (touch): the ${tag} prompt is the touch text`, re.test(w.prompt) && !/WASD|Left click|press C|right click/.test(w.prompt), w.prompt.slice(0, 70));
        await shot(q, tag + '-phone');
      }
      check('phone: no console errors', q.errs.length === 0, q.errs.slice(0, 3).join(' | '));
      await q.close();
    }
    // desktop frames of the rooms not already captured in the run (the gallery from the corridor, the sticky wall)
  } catch (e) {
    fails.push('exception'); console.log('FAIL exception', e && e.stack ? e.stack.slice(0, 800) : e);
  } finally {
    await browser.close();
  }
  console.log(fails.length ? 'FAIL ' + fails.length : 'ALL PASS', `(${shotN} frames)`);
  process.exit(fails.length ? 1 : 0);
})();
