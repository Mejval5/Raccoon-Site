// Node script (not part of tests/index.html): the journal book in real Chrome against a running copy of the game (round 38).
//   node journal-cdp.js [baseUrl]            baseUrl default http://127.0.0.1:59611/octomancer/play/index.html
// puppeteer-core is resolved from $OCTO_TOOLS (default %TEMP%/octo-tools). Exits 1 on a failed check.
// Checks: opens from the pause menu, the settings panel and the API; the book keeps a fixed size and the bookmark tabs stay
// put on every tab; two facing pages on desktop and phone landscape, one page at a time on phone portrait; page turning with
// the arrow buttons, the arrow keys and a swipe; locked silhouettes are readable (contrast against the page); the HUD row is
// hidden under the book; the book stays clear of the corner buttons; no console errors.
const path = require('path');
const tools = process.env.OCTO_TOOLS || path.join(process.env.TEMP || '/tmp', 'octo-tools');
const puppeteer = require(path.join(tools, 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://127.0.0.1:59611/octomancer/play/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = "try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:7,runs:2,muted:true,tutorialDone:true,journal:['place-hub','creature-crab','creature-urchin','item-shell'],journalStats:{'creature-urchin':[12,4,1,0]}}))}catch(e){}";

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const fails = [], errs = [];
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fails.push(name); };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push('' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await page.evaluateOnNewDocument(SAVE);
    const load = async (w, h, mobile) => {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile });
      await page.goto(BASE + '?at=1&seed=5', { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__octo, { timeout: 30000 });
      await sleep(500);
    };
    const J = () => page.evaluate(() => __octo.journal());
    const rects = () => page.evaluate(() => {
      const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, vis: getComputedStyle(e).display !== 'none' }; };
      return { book: R('.octo-book'), frame: R('.octo-bk-frame'), left: R('.octo-bk-left'), right: R('.octo-bk-right'), tabs: R('.octo-bk-tabs'), prog: R('.octo-bk-tab[data-tab="progress"]'), places: R('.octo-bk-tab[data-tab="places"]'), gear: R('.octo-gear-btn'), pause: R('.octo-pause-btn'), mute: R('.octo-mute-btn'), vw: innerWidth, vh: innerHeight };
    });

    // ---- desktop: the ways in
    await load(1440, 900, false);
    await page.click('.octo-pause-btn'); await sleep(150);
    await page.evaluate(() => [...document.querySelectorAll('.octo-pause-overlay button')].find((b) => /Journal/.test(b.textContent)).click()); await sleep(250);
    check('opens from the pause menu', (await J()).open === true);
    await page.keyboard.press('Escape'); await sleep(150);
    check('Esc closes it', (await J()).open === false);
    await page.click('.octo-gear-btn'); await sleep(150);
    await page.click('.octo-set-journal'); await sleep(250);
    check('opens from the settings panel (which closes)', (await J()).open === true && (await page.evaluate(() => __octo.settings().open)) === false);
    await page.evaluate(() => __octo.closeJournal());
    await page.evaluate(() => __octo.openJournal('places')); await sleep(300);

    // ---- fixed size: the book and its bookmark tabs never move between tabs
    const seen = [];
    for (const tab of ['places', 'people', 'bestiary', 'items', 'traps', 'progress']) {
      await page.click('.octo-bk-tab[data-tab="' + tab + '"]'); await sleep(450);
      const r = await rects();
      seen.push([tab, Math.round(r.book.t), Math.round(r.book.h), Math.round(r.prog.t), Math.round(r.places.t)]);
    }
    check('the book and the bookmark tabs keep their place on every tab', seen.every((x) => x[1] === seen[0][1] && x[2] === seen[0][2] && x[3] === seen[0][3] && x[4] === seen[0][4]), JSON.stringify(seen));
    let r = await rects();
    check('desktop: two facing pages side by side, the tabs on the right edge', r.left.vis && r.right.vis && Math.abs(r.left.t - r.right.t) < 2 && r.right.l >= r.left.r - 2 && r.tabs.l >= r.frame.r - 8);
    check('desktop: the book is clear of the pause / mute / gear column', r.book.r <= Math.min(r.pause.l, r.mute.l, r.gear.l) + 1 && r.book.t >= 0 && r.book.b <= r.vh);
    check('the HUD row is hidden while the book is open', await page.evaluate(() => getComputedStyle(document.querySelector('.octo-hud-bar')).visibility === 'hidden'));
    await page.screenshot({ path: path.join(process.env.OCTO_SHOT_DIR || process.env.TEMP || '.', 'journal-desktop-progress.png') });

    // ---- r39: Progress is one spread on desktop (no dead next arrow, no '1/2'), the footer label is centred under the book
    await page.click('.octo-bk-tab[data-tab="progress"]'); await sleep(450);
    const prog = await page.evaluate(() => ({ next: document.querySelector('.octo-bk-turn[aria-label="Next page"]').disabled, prev: document.querySelector('.octo-bk-turn[aria-label="Previous page"]').disabled, label: document.querySelector('.octo-bk-pagelabel').textContent, page: __octo.journalPage() }));
    check('Progress (desktop): the next arrow is disabled and the label says just Progress', prog.next === true && prog.prev === false && prog.label.trim() === 'Progress' && prog.page.pages === 1, JSON.stringify(prog));
    const mid = await page.evaluate(() => { const l = document.querySelector('.octo-bk-pagelabel').getBoundingClientRect(), f = document.querySelector('.octo-bk-spread').getBoundingClientRect(); return { dx: (l.left + l.right) / 2 - (f.left + f.right) / 2 }; });
    check('the desktop footer label is centred under the book (within 4 px)', Math.abs(mid.dx) <= 4, JSON.stringify(mid));
    await page.click('.octo-bk-tab[data-tab="people"]'); await sleep(450);
    await page.evaluate(() => __octo.setStory('diverFreed', 2));
    await page.evaluate(() => __octo.openJournal('people', 'person-diver')); await sleep(400);
    const ptxt = await page.evaluate(() => { const e = document.querySelector('.octo-bk-entry'); return e ? e.textContent : ''; });
    const found = (await J()).found;
    check('a People page tells the story so far (found people only)', !found.includes('person-diver') || /Story so far/.test(ptxt), ptxt.slice(0, 160));


    // ---- page turning: arrows, keys, swipe
    await page.evaluate(() => __octo.openJournal('items')); await sleep(300);
    let st = await page.evaluate(() => __octo.journalPage());
    check('Items has several grid pages', st.pages >= 2, JSON.stringify(st));
    await page.click('.octo-bk-turn[aria-label="Next page"]'); await sleep(450);
    let st2 = await page.evaluate(() => __octo.journalPage());
    check('the next arrow turns to the next page', st2.tab === 'items' && st2.page === 1, JSON.stringify(st2));
    await page.keyboard.press('ArrowLeft'); await sleep(450);
    check('the left arrow key turns back', (await page.evaluate(() => __octo.journalPage())).page === 0);
    await page.keyboard.press('ArrowRight'); await sleep(450);
    check('the right arrow key turns forward', (await page.evaluate(() => __octo.journalPage())).page === 1);
    const sp = await page.evaluate(() => { const b = document.querySelector('.octo-bk-spread').getBoundingClientRect(); return { x: b.left + b.width * 0.7, y: b.top + b.height * 0.5 }; });
    await page.mouse.move(sp.x, sp.y); await page.mouse.down(); await page.mouse.move(sp.x - 120, sp.y + 4, { steps: 6 }); await page.mouse.up(); await sleep(450);
    const sw = await page.evaluate(() => __octo.journalPage());
    check('a swipe to the left turns the page forward (to the next tab at the end of Items)', sw.tab === 'traps' || sw.page === 2, JSON.stringify(sw));
    await page.mouse.move(sp.x - 120, sp.y); await page.mouse.down(); await page.mouse.move(sp.x, sp.y - 3, { steps: 6 }); await page.mouse.up(); await sleep(450);
    const sw2 = await page.evaluate(() => __octo.journalPage());
    check('a swipe to the right turns back', sw2.tab === 'items' && sw2.page === 1, JSON.stringify(sw2));
    await page.click('.octo-bk-tab[data-tab="bestiary"]'); await sleep(400);
    await page.keyboard.press('ArrowDown'); await sleep(100);
    check('the down arrow selects the next entry', (await J()).entry === 'creature-piranha' || (await J()).entry === 'creature-crab', (await J()).entry);
    await page.click('.octo-bk-card[data-id="creature-urchin"]'); await sleep(300);
    const entry = await page.evaluate(() => document.querySelector('.octo-bk-entry').textContent);
    check('a found entry shows name, text and its counters on the right page', /Urchin/.test(entry) && /Dives met in\s*12/.test(entry) && /Killed\s*4/.test(entry) && /Killed by\s*1/.test(entry), entry.slice(0, 120));

    // ---- locked silhouettes read clearly against the page
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const sil = await page.evaluate(() => {
      const card = document.querySelector('.octo-bk-card.is-locked');
      const cv = card.querySelector('canvas'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, r = 0, gr = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { n++; r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
      const bg = getComputedStyle(card.querySelector('.octo-bk-plate')).backgroundImage;
      const m = [...bg.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
      return { n, ink: n ? [r / n, gr / n, b / n] : null, plate: m[0] || null, area: n / (cv.width * cv.height) };
    });
    const ratio = sil.ink && sil.plate ? (Math.max(lum(sil.ink), lum(sil.plate)) + 0.05) / (Math.min(lum(sil.ink), lum(sil.plate)) + 0.05) : 0;
    check('a locked silhouette is a solid shape (not almost invisible) and its contrast against the page is at least 4.5:1', sil.n > 400 && sil.area > 0.08 && ratio >= 4.5, JSON.stringify({ n: sil.n, area: sil.area, ratio }));
    // r39: the '?' sits on a dark disc (it read as white on pale parchment on thin silhouettes)
    check('locked cards: the ? has a dark disc behind it (readable on the silhouette and on bare parchment)', await page.evaluate(() => { const q = document.querySelector('.octo-bk-card.is-locked .octo-bk-q'); const cs = getComputedStyle(q); const m = /rgba?\((\d+), (\d+), (\d+)/.exec(cs.backgroundColor); return !!m && Number(m[1]) < 90 && Number(m[2]) < 70 && parseFloat(cs.width) >= 28 && cs.borderRadius !== '0px'; }));
    check('locked cards say ???', await page.evaluate(() => [...document.querySelectorAll('.octo-bk-card.is-locked')].every((c) => c.textContent.includes('???') && c.querySelector('.octo-bk-q'))));
    await page.evaluate(() => __octo.closeJournal());

    // ---- phone portrait: one page at a time
    await load(375, 812, true);
    await page.evaluate(() => __octo.openJournal('bestiary')); await sleep(400);
    r = await rects();
    check('phone portrait: the book is inside the screen and clear of the corner buttons', r.book.l >= 0 && r.book.t >= 0 && r.book.b <= r.vh && r.book.r <= Math.min(r.pause.l, r.mute.l, r.gear.l) + 1 && r.book.r <= r.vw, JSON.stringify(r.book));
    check('phone portrait: only the grid page shows at first', r.left.vis && !r.right.vis);
    check('phone portrait: the HUD row is hidden and the three hearts do not stick out', await page.evaluate(() => getComputedStyle(document.querySelector('.octo-hud-bar')).visibility === 'hidden'));
    await page.click('.octo-bk-card[data-id="creature-urchin"]'); await sleep(450);
    r = await rects();
    check('phone portrait: picking an entry turns to its page (the grid is hidden)', !r.left.vis && r.right.vis);
    const tabsOk = await page.evaluate(() => [...document.querySelectorAll('.octo-bk-tab')].every((t) => { const b = t.getBoundingClientRect(); return b.height >= 43.5 && b.width >= 30 && b.right <= innerWidth + 1; }));
    check('phone portrait: the bookmark tabs are at least 44 px tall and on screen', tabsOk);
    await page.click('.octo-bk-plate-big'); await sleep(400);
    r = await rects();
    check('phone portrait: tapping the picture goes back to the grid', r.left.vis && !r.right.vis);
    await page.screenshot({ path: path.join(process.env.OCTO_SHOT_DIR || process.env.TEMP || '.', 'journal-phoneP.png') });
    await page.evaluate(() => __octo.closeJournal());

    // ---- phone landscape: two pages, tabs reachable
    await load(812, 375, true);
    await page.evaluate(() => __octo.openJournal('bestiary')); await sleep(400);
    r = await rects();
    check('phone landscape: two pages, the book fits the screen and every tab is at least 40 px tall', r.left.vis && r.right.vis && r.book.b <= r.vh && r.book.t >= 0 && r.book.r <= Math.min(r.pause.l, r.mute.l, r.gear.l) + 1 &&
      (await page.evaluate(() => [...document.querySelectorAll('.octo-bk-tab')].every((t) => t.getBoundingClientRect().height >= 39.5))), JSON.stringify(r.book));
    await page.screenshot({ path: path.join(process.env.OCTO_SHOT_DIR || process.env.TEMP || '.', 'journal-phoneL.png') });
    // ---- r39: every description fits the specified two lines on desktop (three on a phone), with every entry found
    {
      const ids = require('../data/journal.json').entries.map((e) => e.id);
      const pg = await browser.newPage();
      pg.on('pageerror', (e) => errs.push('' + e));
      await pg.evaluateOnNewDocument("try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:" + JSON.stringify(ids) + "}))}catch(e){}");
      for (const [w, h, mobile, maxLines] of [[1440, 900, false, 2], [375, 812, true, 3]]) {
        await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
        await pg.goto(BASE + '?at=1&seed=5', { waitUntil: 'networkidle0', timeout: 60000 });
        await pg.waitForFunction(() => window.__octo, { timeout: 30000 });
        await sleep(400);
        const over = await pg.evaluate(async (ids) => {
          const out = [];
          for (const id of ids) {
            __octo.openJournal(null, id);
            await new Promise((r) => setTimeout(r, 25));
            const t = document.querySelector('.octo-bk-entry .octo-bk-text');
            if (!t) { out.push(id + ' (no text)'); continue; }
            const lh = parseFloat(getComputedStyle(t).lineHeight) || 19;
            const lines = Math.round(t.getBoundingClientRect().height / lh);
            out.push([id, lines]);
          }
          __octo.closeJournal();
          return out;
        }, ids);
        const bad = over.filter((x) => typeof x === 'string' || x[1] > maxLines);
        check(w + 'px: every description wraps to at most ' + maxLines + ' lines (' + over.length + ' entries)', bad.length === 0, JSON.stringify(bad));
      }
      await pg.close();
    }
    // ---- r40: a complete People entry (every found, every story line the flags can reach) fits the fixed page without scrolling,
    // on desktop, phone portrait and phone landscape
    {
      const ids = require('../data/journal.json').entries.map((e) => e.id);
      const pg = await browser.newPage();
      pg.on('pageerror', (e) => errs.push('' + e));
      await pg.evaluateOnNewDocument("try{localStorage.setItem('octomancer.best.v1',JSON.stringify({v:1,best:0,runs:0,muted:true,tutorialDone:true,journal:" + JSON.stringify(ids) + "}))}catch(e){}");
      for (const [w, h, mobile] of [[1440, 900, false], [375, 812, true], [812, 375, true], [1024, 600, false]]) {
        await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
        await pg.goto(BASE + '?at=1&seed=5', { waitUntil: 'networkidle0', timeout: 60000 });
        await pg.waitForFunction(() => window.__octo, { timeout: 30000 });
        await sleep(400);
        const res = await pg.evaluate(async () => {
          for (const [k, n] of [['diverFreed', 9], ['critterFreed', 9], ['relicsGiven', 9]]) __octo.setStory(k, n);
          const out = [];
          for (const id of ['person-diver', 'person-critter', 'person-keeper', 'person-collector']) {
            __octo.openJournal('people', id);
            await new Promise((r) => setTimeout(r, 60));
            const page = document.querySelector('.octo-bk-right');
            const box = document.querySelector('.octo-bk-entry');
            out.push({ id, steps: document.querySelectorAll('.octo-bk-steps li').length, over: page.scrollHeight - page.clientHeight, ch: page.clientHeight, sh: page.scrollHeight, visible: getComputedStyle(page).display !== 'none', story: !!box && box.classList.contains('has-story') });
          }
          __octo.closeJournal();
          return out;
        });
        const bad = res.filter((x) => !x.visible || !x.story || x.steps < 1 || x.over > 1);
        check(w + 'x' + h + ': every People entry at its longest story fits the fixed page (no scrolling)', bad.length === 0, JSON.stringify(res.map((x) => [x.id.slice(7), x.steps, x.sh + '/' + x.ch])));
        if (w === 812) {
          // phone landscape: the People grid shows no cut-off card, the bookmark names fit their tabs, and Progress has nothing cut off
          const lay = await pg.evaluate(async () => {
            __octo.openJournal('people'); await new Promise((r) => setTimeout(r, 120));
            const L = document.querySelector('.octo-bk-left').getBoundingClientRect();
            const cut = [...document.querySelectorAll('.octo-bk-card')].filter((c) => c.getBoundingClientRect().bottom > L.bottom - 1).length;
            const tabs = [...document.querySelectorAll('.octo-bk-tab')].filter((t) => { const n = t.querySelector('.octo-bk-tabname').getBoundingClientRect(), b = t.getBoundingClientRect(); return n.top < b.top - 0.5 || n.bottom > b.bottom + 0.5; }).length;
            const out = { cut, tabs };
            for (const t of ['places', 'bestiary', 'items', 'traps', 'progress']) {
              __octo.openJournal(t); await new Promise((r) => setTimeout(r, 120));
              const sc = [...document.querySelectorAll('.octo-bk-page')].filter((p) => p.clientHeight && p.scrollHeight - p.clientHeight > 1).length;
              out[t] = sc;
            }
            __octo.closeJournal();
            return out;
          });
          check('812x375: People grid has no cut-off card, tab names fit, no page scrolls on any tab', lay.cut === 0 && lay.tabs === 0 && lay.places === 0 && lay.bestiary === 0 && lay.items === 0 && lay.traps === 0 && lay.progress === 0, JSON.stringify(lay));
        }
        if (w === 375 || w === 1440) { await pg.evaluate(() => __octo.openJournal('people', 'person-diver')); await sleep(300); await pg.screenshot({ path: path.join(process.env.OCTO_SHOT_DIR || process.env.TEMP || '.', 'journal-people-' + w + '.png') }); await pg.evaluate(() => __octo.closeJournal()); }
      }
      await pg.close();
    }
  } catch (e) { check('script ran to the end', false, String(e && e.stack || e)); }
  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASSED');
  process.exit(fails.length ? 1 : 0);
})();
