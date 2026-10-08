// Node script (not part of tests/index.html): what the hand holds is drawn ON TOP of the octopus, once, and rigidly in its
// tentacles (controls 2026-10-08; Daniel: "when you grab something, like the little NPC fish here, it must be on top" and
// "the grabbed item jitters as we move").
//  - for every held kind (a pot, a clam, a corpse fish, a bomb, a stunned creature, a shop ware) the frame's draw order is
//    traced (__octo.heldDrawOrder): the held thing is drawn 0 times before the octopus and exactly once after it;
//  - frame by frame at 30, 60 and 120 Hz render rates (the fixed 50 Hz sim) while it swims in a circle, the held thing keeps
//    its place against the drawn octopus: it never moves back and forth relative to the body (the old draw position, the
//    system's own 50 Hz step position, is measured too, to show the beat this removes);
//  - frames of each kind held go to octomancer-web/night/held-*.png (desktop 1440x900, phone 412x915).
//   node held-cdp.js [port | baseUrl]      (serve with python -m http.server <port> --directory site)
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const arg = process.argv[2] || '60911';
const BASE = /^https?:/.test(arg) ? arg : 'http://127.0.0.1:' + arg + '/octomancer/play/index.html';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night', 'held-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const fails = [];
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
const PHONE = { viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' };

async function open(browser, vp, q) {
  const page = await browser.newPage();
  if (vp === 'phone') await page.emulate(PHONE); else await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(SAVE);
  await page.goto(BASE + q, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 30000 });
  await sleep(1500);
  await page.evaluate(() => { __octo.god(true); __octo.freeze(true); });
  page.errs = errs;
  return page;
}
const H = (p) => p.evaluate(() => __octo.hand());
const step = (p, n = 1) => p.evaluate((n) => __octo.stepDraw(n), n);
const octoAt = (p) => p.evaluate(() => { const o = __octo.state().octopus; return { x: o.x, y: o.y }; });
/** F through the input override (works the same with the phone's emulation): press, then let go after a step. */
async function pressF(p) { await p.evaluate(() => { __octo.input({ hand: true }); __octo.stepDraw(1); __octo.input(null); __octo.stepDraw(2); }); }
/** Teleport to open water a few tiles from the start (room above and below), so each kind starts clean. */
async function openSpot(p, k) {
  await p.evaluate((k) => {
    const o = __octo.state().octopus, free = (x, y) => !__octo.tileAt(Math.floor(x), Math.floor(y));
    for (let r = 0; r < 12; r++) for (const dx of [r, -r]) for (const dy of [0, -1, 1, -2, 2]) {
      const x = o.x + dx * (k % 2 ? -1 : 1), y = o.y + dy;
      if (free(x, y) && free(x + 1, y) && free(x - 1, y) && free(x, y - 1) && free(x, y + 1) && free(x + 1, y + 1)) { __octo.teleport(x, y); __octo.stepDraw(2); return; }
    }
  }, k);
}
async function waitTarget(p, kind) { return p.evaluate((kind) => { for (let i = 0; i < 8; i++) { __octo.stepDraw(1); const h = __octo.hand(); if (h.target && h.target.kind === kind) return true; } return false; }, kind); }

/** Put one thing of `kind` by the octopus and pick it up; returns whether it is held. */
async function grab(p, kind, tag) {
  await openSpot(p, tag.length);
  const o = await octoAt(p);
  if (kind === 'pot') await p.evaluate((o) => __octo.addLoot('pot', o.x + 0.75, o.y), o);
  else if (kind === 'clam') await p.evaluate((o) => __octo.addLoot('clam', o.x + 0.75, o.y), o);
  else if (kind === 'corpse') await p.evaluate((o) => __octo.addCorpse('ambient-fish', o.x + 0.7, o.y, 0, 0, 1), o);
  else if (kind === 'piranha-corpse') await p.evaluate((o) => __octo.addCorpse('piranha', o.x + 0.7, o.y, 0, 0, 1), o);
  else if (kind === 'bomb') { await p.evaluate(() => __octo.giveBombs(3)); await p.keyboard.press('KeyB'); await step(p, 1); await p.evaluate((o) => __octo.teleport(o.x - 0.5, o.y - 0.3), o); }
  else if (kind === 'creature') await p.evaluate((o) => { __octo.spawn('piranha', o.x + 0.8, o.y); __octo.stunNear(o.x + 0.8, o.y, 0.5, 12); }, o);
  const want = kind === 'clam' ? 'pot' : kind === 'piranha-corpse' ? 'corpse' : kind;
  const tgt = await waitTarget(p, want);
  if (!tgt) { check(`[${tag}] a ${kind} by the octopus is the hand target`, false, JSON.stringify(await H(p))); return false; }
  await pressF(p);
  const h = await H(p);
  return h.held === want;
}
async function order(p, tag, kind) {
  const r = await p.evaluate(() => __octo.heldDrawOrder());
  check(`[${tag}] holding a ${kind}: drawn 0x before the octopus and once after it`, !!r && r.octo && r.before === 0 && r.after === 1, JSON.stringify(r));
}

/**
 * Frame by frame while swimming in a circle: the held thing against the drawn octopus. Its place against the body may only
 * change with the body's own pose (its angle and the side it carries on, which change once per 50 Hz step, exactly as the
 * body is drawn turned). `slip`: frames where the pose did not change but the thing moved against the body (it lags or runs
 * ahead of the interpolated body: the beat that reads as jitter); `rev`: of those, how often it then moved back.
 */
function slips(fr, keyX, keyY) {
  let slip = 0, rev = 0, n = 0, lx = 0, ly = 0;
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i];
    if (!a || !b || a.angle !== b.angle || a.side !== b.side || a.wall !== b.wall) { lx = ly = 0; continue; } // wall: it moved to beside the body (rock under the arms)
    n++;
    const dx = (b[keyX] - b.ox) - (a[keyX] - a.ox), dy = (b[keyY] - b.oy) - (a[keyY] - a.oy);
    if (Math.hypot(dx, dy) > 1e-4) { slip++; if (lx * dx + ly * dy < 0) rev++; lx = dx; ly = dy; }
  }
  return { slip, rev, n };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    for (const vp of ['desktop', 'phone']) {
      for (const kind of ['pot', 'clam', 'corpse', 'piranha-corpse', 'bomb', 'creature']) {
        const p = await open(browser, vp, '?at=1&seed=5');
        const tag = vp + ' ' + kind;
        const ok = await grab(p, kind, tag);
        check(`[${tag}] F picks it up`, ok, JSON.stringify(await H(p)));
        if (ok) {
          await order(p, tag, kind);
          // a few steps of swimming right, then a still frame for the eye
          await p.evaluate(() => { __octo.input({ move: { x: 1, y: 0 } }); __octo.stepDraw(8); __octo.input(null); __octo.stepDraw(1); });
          await order(p, tag + ' swimming', kind);
          await sleep(500); await step(p, 1); // a corpse's art (the little fish's sheet) loads on first use
          await p.screenshot({ path: OUT + kind + '-' + vp + '.png' });
          // and a close-up of the octopus from the game canvas (2 tiles square), for the eye
          const url = await p.evaluate(() => {
            __octo.stepDraw(1);
            const d = __octo.drawnOcto(), src = document.querySelector('canvas');
            if (!d || !src) return null;
            const s = __octo.state().camera.ppu * 2, c = document.createElement('canvas');
            c.width = c.height = 360;
            c.getContext('2d').drawImage(src, d.sx - s / 2, d.sy - s / 2, s, s, 0, 0, 360, 360);
            return c.toDataURL('image/png');
          });
          if (url) require('fs').writeFileSync(OUT + kind + '-' + vp + '-near.png', Buffer.from(url.split(',')[1], 'base64'));
          if (kind === 'pot' || kind === 'creature' || kind === 'corpse') {
            for (const hz of [30, 60, 120]) for (const [how, circ] of [['in a circle', 1.6], ['straight on', -1]]) {
              await p.evaluate(() => __octo.heldStun(5));
              const fr = await p.evaluate((hz, circ) => __octo.heldFrames(90, 1000 / hz, circ), hz, circ);
              const held = (await H(p)).held;
              const got = fr.filter(Boolean).length;
              const now = slips(fr, 'x', 'y'), old = slips(fr, 'sx', 'sy');
              check(`[${tag}] ${hz} Hz, swimming ${how}: ${got} of 90 frames drew it; rigid against the drawn body: ${now.slip} slips, ${now.rev} back-and-forth in ${now.n} frame pairs of one pose (the old 50 Hz step position: ${old.slip} slips, ${old.rev} back-and-forth)`,
                got >= 89 && now.slip === 0 && (circ > 0 || now.n > 20), held);
            }
          }
        }
        check(`[${tag}] no console errors`, p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
        await p.close();
      }
    }

    // a shop ware it cannot pay for: lifted (unpaid), drawn on top
    const s0 = await open(browser, 'desktop', '?at=1&seed=3');
    const seed = await s0.evaluate(async () => { const L = await import('./js/level.js'); for (let s = 2; s < 400; s++) if (L.generateLevel(s, 0).shop) return s; return 0; });
    await s0.close();
    for (const vp of ['desktop', 'phone']) {
      const p = await open(browser, vp, `?at=1&seed=${seed}`);
      const sh = await p.evaluate(() => __octo.extras().shop);
      const px = sh.px[0], py = sh.px[1];
      for (let n = 0; n < 20; n++) await p.evaluate((x, y) => { __octo.teleport(x, y); __octo.stepDraw(1); }, px, py - 0.2);
      const h0 = await H(p);
      await p.evaluate((x, y) => { __octo.input({ hand: true }); __octo.teleport(x, y); __octo.stepDraw(1); __octo.input(null); __octo.stepDraw(2); }, px, py - 0.2);
      const h = await H(p);
      check(`[${vp} ware] F lifts a ware it cannot pay for`, h0.target && h0.target.kind === 'ware' && h.held === 'ware', JSON.stringify({ t: h0.target, held: h.held }));
      if (h.held === 'ware') { await order(p, vp + ' ware', 'ware'); await p.screenshot({ path: OUT + 'ware-' + vp + '.png' }); }
      check(`[${vp} ware] no console errors`, p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
      await p.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
