// Node script (not part of tests/index.html): the death ragdoll and the death screen (V2-PLAN 14) in real Chrome, at
// 1440x900, 412x915 and 915x412, against a running copy of the game.
//   node death-cdp.js [baseUrl]      baseUrl default http://127.0.0.1:59137/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
//
// Per viewport and seed: a bomb at the octopus and a piranha next to it, then death. Sampled every ~60 ms for 7.5 s: the death
// screen appears after about 1.5 s (not before 1.3 s, by 2.1 s); once it shows, the panel rect never overlaps the body's
// screen circle and the body stays in the free part of the screen (the camera tracks it); the body is never inside rock; the
// world keeps simulating behind the panel (sim time runs, the body sinks and bounces, and on most seeds a piranha above it bites it); the tint is light (a
// clear hole around the body; drawn on the game canvas, read through __octo.deathTint()); the panel is a side panel on desktop and a bottom sheet on phones. Then "Back to the hub".
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59137/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:[]}))}catch(e){}";
const VPS = [
  ['1440x900', { width: 1440, height: 900, deviceScaleFactor: 1 }, 'side'],
  ['412x915', { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, 'sheet'],
  ['915x412', { width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, 'sheet'],
];
const SEEDS = [11, 23, 77];

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    for (const [vn, vp, kind] of VPS) {
      let bitten = 0;
      for (const seed of SEEDS) {
        const page = await browser.newPage();
        page.on('pageerror', (e) => errs.push(vn + ' ' + e));
        page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(vn + ' ' + m.text()); });
        await page.setViewport(vp);
        await page.evaluateOnNewDocument(SAVE);
        await page.goto(BASE + '?at=1&seed=' + seed, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
        await sleep(600);
        await page.evaluate(() => {
          const s = __octo.state().octopus;
          __octo.placeBomb(s.x, s.y, 0, 0.01);
          __octo.spawn('piranha', s.x + 2.2, s.y);
          window.__deathAt = performance.now();
          __octo.kill('piranha', true);
        });
        const samples = [];
        const t0 = Date.now();
        let spawned = false;
        while (Date.now() - t0 < 7500) {
          // once the body has come to rest, a piranha just above it (or beside it): it goes for the corpse
          // (above it: the body came down through that water, so the piranha has room to lunge, even in a narrow shaft)
          if (!spawned && Date.now() - t0 > 2400) {
            spawned = await page.evaluate(() => {
              const b = __octo.body(); if (b.state !== 1 && performance.now() - window.__deathAt < 3200) return false;
              // open water near the body with open water between (a fish-bone block or a ledge may sit right above it): above first
              const open = (x, y) => __octo.tileAt(Math.floor(x), Math.floor(y)) === 0;
              const spots = [[0, -1.7], [1.6, -1.2], [-1.6, -1.2], [1.8, 0], [-1.8, 0], [0, -2.6]];
              const s = spots.find(([dx, dy]) => open(b.x + dx, b.y + dy) && open(b.x + dx / 2, b.y + dy / 2)) || spots[0];
              __octo.spawn('piranha', b.x + s[0], b.y + s[1]); return true;
            });
          }
          samples.push(await page.evaluate(() => { const b = __octo.body(); return b && { ...b, at: performance.now() - window.__deathAt, time: __octo.state().time }; }));
          await sleep(60);
        }
        const tag = `${vn} seed ${seed}:`;
        const firstShown = samples.find((s) => s && s.shown);
        check(`${tag} the death screen appears about 1.5 s after death`, firstShown && firstShown.at > 1300 && firstShown.at < 2100, firstShown ? `(${Math.round(firstShown.at)} ms)` : '(never)');
        const shown = samples.filter((s) => s && s.shown);
        let overlap = 0, outside = 0, worst = 1e9;
        for (const s of shown) {
          const p = s.panel, r = s.rCss;
          const hits = s.screenX + r > p.left && s.screenX - r < p.right && s.screenY + r > p.top && s.screenY - r < p.bottom;
          if (hits) overlap++;
          if (s.screenX < 0 || s.screenX > s.viewW || s.screenY < 0 || s.screenY > s.viewH) outside++;
          // distance from the body's circle to the panel (the clear margin)
          const gap = kind === 'side' ? p.left - (s.screenX + r) : p.top - (s.screenY + r);
          worst = Math.min(worst, gap);
        }
        check(`${tag} the panel never covers the body (${shown.length} samples)`, shown.length > 40 && overlap === 0 && outside === 0, `(closest gap ${Math.round(worst)} px)`);
        check(`${tag} the body is never inside rock`, samples.every((s) => !s || !s.inRock));
        const last = samples[samples.length - 1];
        check(`${tag} the world keeps simulating behind the panel (sim time ${firstShown ? (last.time - firstShown.time).toFixed(2) : '-'} s on)`, firstShown && last.time - firstShown.time > 3);
        const moved = Math.max(...samples.filter(Boolean).map((s) => Math.hypot(s.x - samples[0].x, s.y - samples[0].y)));
        check(`${tag} the body sinks, bounces and rolls (moved up to ${moved.toFixed(1)} tiles; ${last.hits} hits taken)`, moved > 1);
        if (last.hits >= 1) bitten++;
        const look = await page.evaluate(() => {
          const ov = document.querySelector('.octo-gameover-overlay');
          const tint = __octo.deathTint(), body = __octo.body(); // the tint is drawn on the game canvas (main.js render), not in CSS
          const pr = ov.querySelector('.octo-overlay-panel').getBoundingClientRect();
          const btn = [...ov.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, top: r.top, bottom: r.bottom }; });
          return { tint, body: body && { x: body.screenX, y: body.screenY, r: body.rCss }, w: pr.width, h: pr.height, top: pr.top, right: pr.right, btn, vh: innerHeight, vw: innerWidth };
        });
        const tn = look.tint, bd = look.body;
        const holeOk = tn && bd && Math.hypot(tn.x - bd.x, tn.y - bd.y) <= bd.r * 0.75 + 4 && tn.hole >= bd.r * 1.2 && tn.outer > tn.hole;
        check(`${tag} the tint is light with a clear hole around the body`, tn && tn.alpha > 0.05 && tn.alpha <= 0.35 && holeOk,
          tn ? `(max alpha ${tn.alpha.toFixed(2)}, hole ${Math.round(tn.hole)} px at ${Math.round(tn.x)},${Math.round(tn.y)}, body r ${bd ? Math.round(bd.r) : '-'} at ${bd ? Math.round(bd.x) + ',' + Math.round(bd.y) : '-'})` : '');
        if (kind === 'side') check(`${tag} a side panel on the right (${Math.round(look.w)} px wide)`, look.w <= look.vw * 0.36 && look.right > look.vw - 30);
        else check(`${tag} a bottom sheet (${Math.round(look.h)} px tall of ${look.vh})`, look.w >= look.vw - 2 && look.h <= look.vh * 0.52 && Math.abs(look.top + look.h - look.vh) < 2);
        check(`${tag} the three buttons (Restart run, Back to the hub, Exit) are on screen without scrolling`, look.btn.length === 3 && look.btn.every((b) => b.top >= 0 && b.bottom <= look.vh));
        if (seed === SEEDS[0]) {
          await page.screenshot({ path: path.join(process.env.TEMP || '.', `death-cdp-${vn}.png`) });
          await page.evaluate(() => document.querySelector('.octo-gameover-overlay .octo-go-hub').click());
          await sleep(300);
          await page.waitForFunction(() => !__octo.level().transitioning && !__octo.state().octopus.dead, { timeout: 15000 }).catch(() => {});
          const after = await page.evaluate(() => ({ dead: __octo.state().octopus.dead, shown: !!__octo.body(), stage: __octo.level().stage, overlay: getComputedStyle(document.querySelector('.octo-gameover-overlay')).display }));
          check(`${tag} "Back to the hub" leaves the death screen for a live octopus (${after.stage})`, !after.dead && after.overlay === 'none');
        }
        await page.close();
      }
      // a body that sank to the bottom of a shaft narrower than a piranha is out of its reach (as it should be): most are not
      check(`${vn}: the piranhas (and the bomb) reach and hit the body on most seeds (${bitten} of ${SEEDS.length})`, bitten >= 2);
    }
  } catch (e) { fails.push('threw ' + e); console.log('THREW', e); }
  await browser.close();
  check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS all');
  process.exit(fails.length ? 1 : 0);
})();
