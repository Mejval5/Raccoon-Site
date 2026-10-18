// The cannon fish in the running game (2026-10-18, Daniel: "this guy should turn and shoot from its mouth, not have a
// bazooka"): a wall fish turns its body up-left toward the octopus, squishes during its 0.6 s charge, and spits the shot
// from its mouth (within 0.3 tiles); the live record draws no barrel (no rect, no gradient). Frames at 1440x900.
//   node cannon-cdp.js [baseUrl] [shotDir]   baseUrl default http://127.0.0.1:65512/octomancer/play/index.html
const path = require('path');
const fs = require('fs');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP, 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:65512/octomancer/play/index.html';
const SHOTS = process.argv[3] || path.join(__dirname, '..', '..', '..', '..', 'octomancer-web', 'night');
const SEED = 3;
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
    await page.goto(BASE + `?at=1&seed=${SEED}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__octo && !__octo.level().transitioning, { timeout: 90000 });
    await page.evaluate(async () => {
      __octo.god(true); __octo.freeze(true); __octo.stepDraw(300);
      const base = new URL('js/', location.href).href;
      window.__ED = await import(base + 'enemy-draw.js');
      window.__EN = await import(base + 'enemies.js');
      const dt = await import(base + 'draw-trace.js');
      // the live cannon record: caught from the draw trace (the drawn record is the simulation's own)
      window.__grab = () => {
        const log = []; window.__cannon = null;
        log.push = function (k, r) { if (k === 'enemy' && r && r.kind === 'cannon' && r.id === window.__cid) window.__cannon = r; return Array.prototype.push.call(this, k, r); };
        const old = dt.drawTrace.log; dt.drawTrace.log = log; dt.drawTrace.on = true;
        try { __octo.stepDraw(1); } finally { dt.drawTrace.on = false; dt.drawTrace.log = old; old.length = 0; }
        return !!window.__cannon;
      };
      // draw the live record alone on a recording context: which canvas calls does the cannon make?
      window.__calls = () => {
        const calls = [];
        const ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; return () => { calls.push(k); return { addColorStop() {} }; }; }, set(t, k, v) { t[k] = v; return true; } });
        const c = window.__cannon;
        __ED.drawEnemyOne(ctx, { x: c.x, y: c.y, pxPerUnit: 60 }, (cam, cw, ch, x, y) => ({ x: cw / 2 + (x - cam.x) * 60, y: ch / 2 + (y - cam.y) * 60 }), 800, 600, c, 1, 1);
        return calls;
      };
      const W = (x, y) => __octo.tileAt(Math.floor(x), Math.floor(y)) === 0;
      const box = (x0, y0, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!W(x0 + i, y0 + j)) return false; return true; };
      const clear = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4); for (let k = 0; k <= n; k++) { const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; for (const [ox, oy] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (!W(x + ox, y + oy)) return false; } return true; };
      const bodies = __octo.damageBodies();
      const quiet = (x, y, d) => !bodies.some((b) => Math.hypot(b.x - x, b.y - y) < d);
      window.__spot = null;
      const L = __octo.level();
      for (let cy = 8; cy < L.h - 8 && !window.__spot; cy++) for (let cx = 6; cx < L.w - 6 && !window.__spot; cx++) {
        // a water cell with rock to its right (the fish sits on that wall, facing left), open water up-left of it
        if (!W(cx, cy) || W(cx + 1, cy) || !W(cx - 1, cy) || !W(cx, cy - 1)) continue;
        if (!quiet(cx, cy, 7)) continue;
        for (const [dx, dy] of [[4, 3], [3.5, 3], [3, 2.5], [4, 2], [3, 3.5]]) {
          const ox = cx + 0.5 - dx, oy = cy + 0.5 - dy;
          if (!box(Math.floor(ox) - 1, Math.floor(oy) - 1, 3, 3) || !clear(cx + 0.3, cy + 0.5, ox, oy)) continue;
          window.__spot = { cx: cx + 0.5, cy: cy + 0.5, ox, oy }; break;
        }
      }
    });
    const spot = await page.evaluate(() => window.__spot);
    check('cannon: found a wall cell with open water up-left of it', !!spot, JSON.stringify(spot));
    if (spot) {
      const shot = (name) => page.screenshot({ path: path.join(SHOTS, `cannon-${name}.png`) });
      const id = await page.evaluate((s) => {
        __octo.teleport(s.ox, s.oy); __octo.stepDraw(1);
        const r = __octo.spawn('cannon', s.cx, s.cy, 'wall', 1);
        window.__cid = r.id; return r.id;
      }, spot);
      check('cannon: spawned on the wall', id > 0);
      check('cannon: its live record is reachable through the draw trace', await page.evaluate(() => __grab()));
      // 1. it turns to face up-left (hold the reload so it has time to turn without charging)
      await page.evaluate(() => { __cannon.t = 3; __octo.stepDraw(60); });
      const face = await page.evaluate((s) => { const c = __cannon, want = Math.atan2(s.oy - c.y, s.ox - c.x); let d = (c.aim - want) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return { aim: c.aim, want, d, lip: c.lip, cos: Math.cos(c.aim), sin: Math.sin(c.aim) }; }, spot);
      check('cannon: the fish turned to face the octopus up-left', Math.abs(face.d) < 0.1 && face.cos < 0 && face.sin < 0, JSON.stringify(face));
      await shot('face-upleft');
      let calls = await page.evaluate(() => __calls());
      check('cannon: at rest it draws its sprite and nothing else (no barrel)', calls.filter((k) => k === 'drawImage').length === 1 && !calls.some((k) => k === 'rect' || k === 'fillRect' || k === 'createRadialGradient' || k === 'createLinearGradient'), calls.join(','));
      // 2. the charge: the squish
      await page.evaluate(() => { __cannon.t = 0.02; });
      let st = null;
      for (let i = 0; i < 200; i++) { st = await page.evaluate(() => { __octo.stepDraw(1); return { st: __cannon.st, charge: __cannon.st === __EN.CN_CHARGE, tell: __cannon.tell, sq: __cannon.sq }; }); if (st.charge && st.tell >= 0.8) break; }
      check('cannon: it charges (squashing) before it spits', st && st.tell >= 0.8 && st.sq >= 0.8, JSON.stringify(st));
      await shot('charging');
      const pose = await page.evaluate(() => { const o = { along: 1, across: 1, shift: 0 }; __ED.cannonPose(__cannon, o); return o; });
      check('cannon: charging, the body is squashed along its facing and wider across', pose.along < 0.65 && pose.across > 1.15, JSON.stringify(pose));
      calls = await page.evaluate(() => __calls());
      check('cannon: charging, no barrel, no glow, no ring (no rect, no gradient, no arc)', !calls.some((k) => k === 'rect' || k === 'fillRect' || k === 'createRadialGradient' || k === 'arc'), calls.join(','));
      // 3. the spit: the shot leaves its mouth
      let fired = null;
      for (let i = 0; i < 60 && !fired; i++) {
        fired = await page.evaluate(() => {
          __octo.stepDraw(1);
          const sh = __octo.shots();
          if (!sh.length) return null;
          const m = __EN.cannonMouth(__cannon, { x: 0, y: 0 });
          return { sx: sh[0].x, sy: sh[0].y, vx: sh[0].vx, vy: sh[0].vy, mx: m.x, my: m.y, kick: __cannon.kick };
        });
      }
      check('cannon: it spat a shot', !!fired);
      if (fired) {
        const d = Math.hypot(fired.sx - fired.mx, fired.sy - fired.my);
        check(`cannon: the shot is within 0.3 tiles of the fish's mouth (${d.toFixed(3)})`, d < 0.3, JSON.stringify(fired));
        check('cannon: the shot flies up-left, along the facing', fired.vx < 0 && fired.vy < 0);
        await page.evaluate(() => __octo.stepDraw(4));
        await shot('spit');
        calls = await page.evaluate(() => __calls());
        check('cannon: just after the spit it draws the sprite and a few pale bubbles, still no barrel', calls.filter((k) => k === 'arc').length >= 4 && !calls.some((k) => k === 'rect' || k === 'fillRect' || k === 'createRadialGradient'), calls.join(','));
        const p2 = await page.evaluate(() => { const o = { along: 1, across: 1, shift: 0 }; __ED.cannonPose(__cannon, o); return o; });
        check('cannon: just after the spit the body is snapping long', p2.along > 1.05, JSON.stringify(p2));
      }
    }
    check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) {
    console.log('FAIL exception ' + (e && e.stack || e)); fails++;
  } finally {
    await browser.close();
  }
  console.log(fails ? `FAIL (${fails})` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
