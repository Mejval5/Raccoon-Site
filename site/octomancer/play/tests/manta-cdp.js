// The glider manta (2026-10-18, CREATURES.md "Manta") in the running game: a manta spawned over an octopus lying on the
// floor glides first (and never bites her when she touches it), then banks, slams down onto her (she loses one heart during
// its dive and nowhere else), rests on the floor in a silt puff and lifts off. Saves a 1440x900 frame strip:
// glide, telegraph, slam, rest.
//   node manta-cdp.js [baseUrl] [shotDir]    baseUrl default http://127.0.0.1:63311/octomancer/play/index.html
const path = require('path');
const fs = require('fs');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP, 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:63311/octomancer/play/index.html';
const SHOTS = process.argv[3] || path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night');
const SEED = +(process.env.MANTA_SEED || 3);
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; let fails = 0;
  const check = (n, ok, x = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); if (!ok) fails++; };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    let spot = null, seed = SEED;
    for (const sd of [SEED, 5, 7, 11, 13, 17, 21, 29]) {
      seed = sd;
      await page.goto(BASE + `?at=1&seed=${seed}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
      await page.evaluate(() => { __octo.god(true); __octo.freeze(true); __octo.stepDraw(250); }); // past the level title banner

      // open water 7 wide and 6 tall over a flat floor, away from the native creatures (the Shallows are tight: few such spots), far from every native creature
      spot = await page.evaluate(() => {
        const L = __octo.level(), W = (x, y) => __octo.tileAt(x, y) === 0;
        const bodies = __octo.damageBodies();
        for (let cy = 10; cy < L.h - 3; cy++) for (let cx = 5; cx < L.w - 5; cx++) {
          let ok = true;
          for (let y = cy - 5; y <= cy && ok; y++) for (let x = cx - 3; x <= cx + 3; x++) if (!W(x, y)) { ok = false; break; }
          for (let x = cx - 2; x <= cx + 2 && ok; x++) if (W(x, cy + 1)) ok = false;
          if (!ok || bodies.some((b) => Math.hypot(b.x - cx, b.y - cy) < 8)) continue;
          if (Math.hypot(L.startX - cx, L.startY - cy) < 6) continue;
          return { cx: cx + 0.5, floor: cy + 1 };
        }
        return null;
      });
      if (spot) break;
    }
    console.log('seed', seed);
    check('found open water over a floor for the test', !!spot, JSON.stringify(spot));
    if (!spot) throw new Error('no spot');

    const shots = [];
    const shot = async (tag) => { const f = path.join(SHOTS, `manta-${tag}.png`); await page.screenshot({ path: f }); shots.push(f); };
    // her on the floor, the manta about 4.5 tiles over her (its first 1.5 s it only glides: the spawn cooldown)
    const r0 = await page.evaluate((s) => {
      __octo.god(false); __octo.setHearts(3);
      __octo.teleport(s.cx, s.floor - 0.45); __octo.stepDraw(25);
      const sp = __octo.spawn('manta', s.cx, s.floor - 5, 'open');
      window.__mid = sp.id; window.__m = () => __octo.enemies().find((e) => e.id === window.__mid);
      return { hearts: __octo.state().octopus.hearts, m: window.__m() };
    }, spot);
    check('manta spawned gliding over her', r0.m && r0.m.st === 0, JSON.stringify(r0));

    // 1) gliding: she sits right on its back (touching it, never under it) for 1 s: no bite
    const g = await page.evaluate(() => {
      const h0 = __octo.state().octopus.hearts; let notGlide = 0;
      for (let i = 0; i < 50; i++) { const m = window.__m(); __octo.teleport(m.x + 0.2, m.y - 0.35); __octo.stepDraw(1); if (window.__m().st !== 0) notGlide++; }
      return { h0, h1: __octo.state().octopus.hearts, notGlide, m: window.__m() };
    });
    check(`in game: touching a gliding manta for 1 s costs nothing (hearts ${g.h0} -> ${g.h1})`, g.h1 === g.h0 && g.notGlide === 0, JSON.stringify(g.m));
    await page.evaluate((s) => { __octo.teleport(s.cx, s.floor - 0.45); __octo.stepDraw(2); }, spot);

    // 2) the bank / telegraph, 3) the slam, 4) rest; she stays on the floor under it
    const run = await page.evaluate(async (s) => {
      const log = { states: [], hurtIn: [], tellShot: false, landed: false, restSteps: 0, rose: false, h0: __octo.state().octopus.hearts };
      let lastH = log.h0, lastSt = -1;
      for (let i = 0; i < 50 * 8; i++) {
        const before = window.__m();
        __octo.stepDraw(1);
        const m = window.__m(), h = __octo.state().octopus.hearts;
        if (!m) break;
        if (m.st !== lastSt) { log.states.push(m.st); lastSt = m.st; }
        if (h < lastH) log.hurtIn.push(before.st + '>' + m.st);
        lastH = h;
        if (m.st === 1 && m.tell > 0.75 && !log.tellShot) { log.tellShot = true; return { log, pause: 'tell', m }; }
        if (m.st === 4) log.restSteps++;
        if (m.st === 4 && log.restSteps === 6) return { log, pause: 'slam', m };
      }
      return { log, pause: 'none', m: window.__m() };
    }, spot);
    check('in game: the manta banks over her (the telegraph)', run.pause === 'tell', JSON.stringify(run.log));
    await shot('2-telegraph');
    const run2 = await page.evaluate(() => {
      const log = { hurtIn: [], restSteps: 0, states: [] };
      let lastH = __octo.state().octopus.hearts, lastSt = -1;
      for (let i = 0; i < 100; i++) {
        const before = window.__m();
        __octo.stepDraw(1);
        const m = window.__m(), h = __octo.state().octopus.hearts;
        if (m.st !== lastSt) { log.states.push(m.st); lastSt = m.st; }
        if (h < lastH) log.hurtIn.push(before.st + '>' + m.st);
        lastH = h;
        if (m.st === 4 && ++log.restSteps === 5) return { log, m, hearts: h };
      }
      return { log, m: window.__m(), hearts: lastH };
    });
    check(`in game: it slams down onto her: one heart, taken during the dive (${run2.log.hurtIn.join(',')}), then it rests on the floor`, run2.log.hurtIn.length === 1 && /^2>/.test(run2.log.hurtIn[0]) && run2.m.st === 4 && run2.m.y > spot.floor - 1.2, JSON.stringify(run2));
    await shot('3-slam');
    const r3 = await page.evaluate(() => { __octo.stepDraw(40); return window.__m(); });
    check('in game: still resting, stunned, 0.9 s after the slam', r3.st === 4 && r3.stun > 0, JSON.stringify(r3));
    await shot('4-rest');
    const r4 = await page.evaluate(() => {
      const seen = [];
      for (let i = 0; i < 150; i++) { __octo.stepDraw(1); const m = window.__m(); if (seen[seen.length - 1] !== m.st) seen.push(m.st); }
      return { seen, m: window.__m(), hearts: __octo.state().octopus.hearts };
    });
    check(`in game: it lifts off and glides again (${r4.seen.join(',')}), no more hurt meanwhile`, r4.seen.includes(3) && r4.seen.includes(0) && r4.m.y < spot.floor - 1.5, JSON.stringify(r4));
    await page.evaluate(() => __octo.stepDraw(20));
    await shot('1-glide'); // taken last: the level title banner hangs over its first loop

    // the strip: the four frames side by side (each scaled to 720x450), for review
    const imgs = shots.slice().sort().map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
    const strip = await browser.newPage();
    await strip.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await strip.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:720px 720px;gap:0">${imgs.map((s, i) => `<div style="position:relative"><img src="${s}" style="width:720px;height:450px;display:block"><span style="position:absolute;left:8px;top:6px;color:#fff;font:600 16px sans-serif;text-shadow:0 0 3px #000">${['glide', 'telegraph', 'slam', 'rest'][i]}</span></div>`).join('')}</body>`);
    await strip.screenshot({ path: path.join(SHOTS, 'manta-strip.png') });
    console.log('frames:', shots.concat(path.join(SHOTS, 'manta-strip.png')).join(' '));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (err) { console.log('FAIL exception ' + err); fails++; }
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
