// The one-line HUD (2026-10-08, Daniel: "unify it like Spelunky into one line, also with the timer like this").
// One line across the top, floating over the scene as in Spelunky 2 (no band):
//   left:  heart + number, bomb + number, juice jar + casts, together on one dark translucent pill; the carried passive items as
//          small icons right under the pill
//   right: shells + number, an hourglass with the level time and the run time ('00:05.4 / 01:28.7') and the Swift Current
//          target next to it, the level (a small place picture + '1-2').
// Spelunky style badges: a chunky icon with its number on the icon's lower right corner, ink outlined, so the floating right
// group reads over bright water too.
// DOM only, and update(state) is called every frame, so every write is keyed: text / canvases change only when their value
// does, and the clocks show tenths, so they change at most 10 times a second. The clock box has a fixed size and `contain`,
// so a clock tick never lays out the rest of the strip.
// The endless mode (?endless=1) keeps its depth / score / best line in the right group instead of the clocks.

import { drawBombSlotIcon, drawJarIcon } from './spell-icons.js';
import { onSpritesReady } from './sprites.js';
import { drawItemIcon, itemArtVersion } from './items-draw.js';
import { formatClock } from './runstats.js';

const asset = (p) => new URL(p, import.meta.url).href; // relative to this module, not the page (the test page lives in tests/)
const HEART_SRC = asset('../assets/ui-heart.webp');
const SHELL_SRC = asset('../assets/shell-blue.webp');
const PLACE_SRC = {
  hub: asset('../img/journal/place-hub.webp'),
  tutorial: asset('../img/journal/place-tutorial.webp'),
  shallows: asset('../img/journal/place-shallows.webp'),
  rest: asset('../img/journal/place-pool.webp'),
};
// an hourglass of driftwood and sea glass with pale sand (no gold)
const HOURGLASS = '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M5 4h10c0 6-4 7-4 10s4 4 4 10H5c0-6 4-7 4-10S5 10 5 4z" fill="#cfe3dc" fill-opacity=".55" stroke="#10202c" stroke-width="1.6" stroke-linejoin="round"/>'
  + '<path d="M7.2 8.5h5.6c-.8 1.8-2.8 2.6-2.8 4.4 0-1.8-2-2.6-2.8-4.4zM6.4 23c.8-2.6 3.6-3.4 3.6-5.2 0 1.8 2.8 2.6 3.6 5.2z" fill="#e2cf9f" stroke="#7a6346" stroke-width=".6"/>'
  + '<rect x="2.5" y="1.5" width="15" height="3.4" rx="1.4" fill="#8a6a4a" stroke="#10202c" stroke-width="1.5"/><rect x="2.5" y="23.1" width="15" height="3.4" rx="1.4" fill="#8a6a4a" stroke="#10202c" stroke-width="1.5"/></svg>';
// the Swift Current mark (as on the old banner line)
const CURRENT = '<svg viewBox="0 0 24 14" aria-hidden="true"><path d="M1 4c3-3 5 3 8 0s5 3 8 0 4 1 6-1M1 10c3-3 5 3 8 0s5 3 8 0 4 1 6-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "Shallows 1-2" -> { place: 'shallows', text: '1-2' }; "Hub" -> { place: 'hub', text: 'Hub' }. */
export function levelBadge(stage) {
  const s = String(stage || '');
  const m = /^(.*?)\s+(\d+-\d+)$/.exec(s);
  if (m) return { place: 'shallows', text: m[2] }; // one biome today; a deeper one adds its place picture here
  if (/^hub$/i.test(s)) return { place: 'hub', text: 'Hub' };
  if (/^tutorial$/i.test(s)) return { place: 'tutorial', text: 'Tutorial' };
  if (/grotto/i.test(s)) return { place: 'rest', text: 'Grotto' };
  return { place: 'shallows', text: s };
}

function makeCanvas(cls, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = el('canvas', cls);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, ctx, w, h };
}

/** A badge: an icon node and its number on the lower right. */
function badge(cls, icon, title) {
  const b = el('div', 'octo-hud-badge ' + cls);
  b.title = title;
  const num = el('span', 'octo-hud-num', '0');
  b.append(icon, num);
  return { el: b, num };
}

export function createHudStrip() {
  const bar = el('div', 'octo-hud-bar');
  const left = el('div', 'octo-hud-left');
  const right = el('div', 'octo-hud-stats octo-hud-right');

  const heartImg = el('img', 'octo-hud-icon octo-hud-heart-icon'); heartImg.src = HEART_SRC; heartImg.alt = '';
  const hearts = badge('octo-hud-hearts', heartImg, 'Hearts');
  const bombCv = makeCanvas('octo-hud-icon octo-hud-bomb-icon', 32, 32);
  const drawBomb = () => { if (bombCv.ctx) { bombCv.ctx.clearRect(0, 0, 32, 32); drawBombSlotIcon(bombCv.ctx, 16, 16, 14.5); } };
  drawBomb();
  const bombs = badge('octo-hud-bombs', bombCv.c, 'Bombs');
  const jarCv = makeCanvas('octo-hud-icon octo-hud-jar-icon', 24, 32);
  const jar = badge('octo-hud-jar', jarCv.c, 'Fish juice');
  left.append(hearts.el, bombs.el, jar.el);

  const shellImg = el('img', 'octo-hud-icon octo-hud-shell-icon'); shellImg.src = SHELL_SRC; shellImg.alt = 'Shells';
  const shells = badge('octo-hud-shells', shellImg, 'Shells');
  // the clocks: hourglass, level time / run time, and the Swift Current target
  const clock = el('div', 'octo-hud-clock');
  clock.title = 'Level time / run time';
  const glass = el('span', 'octo-hud-glass'); glass.innerHTML = HOURGLASS;
  const times = el('span', 'octo-hud-times');
  const lvlT = el('span', 'octo-hud-time octo-hud-time-level', '00:00.0');
  const slash = el('span', 'octo-hud-time-slash', '/');
  const runT = el('span', 'octo-hud-time octo-hud-time-run', '00:00.0');
  times.append(lvlT, slash, runT);
  const swiftEl = el('span', 'octo-hud-swift');
  swiftEl.innerHTML = CURRENT;
  const swiftText = el('span', 'octo-hud-swift-t', '');
  swiftEl.appendChild(swiftText);
  swiftEl.title = 'Swift Current: reach the whirlpool by this time';
  swiftEl.style.display = 'none';
  clock.append(glass, times, swiftEl);
  clock.style.display = 'none';
  // the level: a small round place picture and '1-2'
  const levelEl = el('div', 'octo-hud-level');
  const placeImg = el('img', 'octo-hud-place'); placeImg.alt = '';
  const levelText = el('span', 'octo-hud-level-t', '');
  levelEl.append(placeImg, levelText);
  levelEl.style.display = 'none';
  // the endless mode's line
  const endless = el('span', 'octo-hud-endless', '');
  endless.style.display = 'none';
  right.append(shells.el, clock, levelEl, endless);
  shells.el.style.display = 'none';

  const itemsEl = el('div', 'octo-hud-items'); // right under the vitals pill
  itemsEl.style.display = 'none';
  bar.append(left, right, itemsEl);

  const shown = new Map(); // node -> last text / key written
  const setText = (node, t) => { if (shown.get(node) !== t) { shown.set(node, t); node.textContent = t; } };
  const setShown = (node, on) => { const k = on ? '' : 'none'; if (node.style.display !== k) node.style.display = k; };
  let jarKey = null, itemsKey = '', placeKey = '', swiftKey = '', heartsKey = '';
  onSpritesReady(() => { drawBomb(); jarKey = null; }); // the painted bomb and jar arrive with the atlas

  return {
    el: bar,
    /**
     * @param {{hearts:number, heartMax:number, bombs:number, stage?:string, shells?:number, items?:string[], juice?:number,
     *   cap?:number, perCast?:number, levelTime?:number|null, runTime?:number|null, swift?:{target:number, earned:boolean}|null,
     *   depth?:number, score?:number, best?:number}} s
     */
    update(s) {
      const v2 = s.stage !== undefined;
      setText(hearts.num, String(Math.max(0, s.hearts | 0)));
      const hk = (s.hearts <= 1 ? 'low' : '') + (s.hearts <= 0 ? 'out' : '');
      if (hk !== heartsKey) { heartsKey = hk; hearts.el.classList.toggle('is-low', s.hearts <= 1); }
      setText(bombs.num, String(Math.max(0, s.bombs | 0)));
      bombs.el.classList.toggle('is-empty', s.bombs <= 0);
      const hasJar = v2 && s.cap > 0 && s.perCast > 0;
      setShown(jar.el, hasJar);
      if (hasJar) {
        const jk = s.juice + '|' + s.cap + '|' + s.perCast;
        if (jk !== jarKey) {
          jarKey = jk;
          const casts = Math.floor(s.juice / s.perCast), total = Math.round(s.cap / s.perCast);
          if (jarCv.ctx) { jarCv.ctx.clearRect(0, 0, 24, 32); drawJarIcon(jarCv.ctx, 1, 1, 22, 30, s.juice / s.cap, total); }
          setText(jar.num, String(casts));
          jar.el.classList.toggle('is-empty', casts <= 0);
          jar.el.title = 'Fish juice: ' + casts + ' of ' + total + ' casts';
        }
      }
      setShown(shells.el, v2 && s.shells !== undefined);
      if (v2 && s.shells !== undefined) setText(shells.num, String(s.shells));
      // clocks
      const timed = v2 && s.levelTime !== undefined && s.levelTime !== null;
      setShown(clock, timed);
      if (timed) {
        setText(lvlT, formatClock(s.levelTime));
        setText(runT, formatClock(s.runTime || 0));
        const sw = s.swift;
        const sk = sw ? sw.target + (sw.earned ? 'e' : s.levelTime > sw.target ? 'm' : '') : '';
        if (sk !== swiftKey) {
          swiftKey = sk;
          setShown(swiftEl, !!sw);
          if (sw) {
            const t = Math.max(0, Math.round(sw.target));
            swiftText.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
            swiftEl.classList.toggle('is-earned', !!sw.earned);
            swiftEl.classList.toggle('is-missed', !sw.earned && s.levelTime > sw.target);
          }
        }
      }
      // the level
      setShown(levelEl, v2);
      if (v2) {
        const b = levelBadge(s.stage);
        if (b.place !== placeKey) { placeKey = b.place; placeImg.src = PLACE_SRC[b.place]; }
        setText(levelText, b.text);
        if (levelEl.title !== s.stage) levelEl.title = s.stage;
      }
      setShown(endless, !v2);
      if (!v2) setText(endless, `Depth ${s.depth}m  Score ${s.score}  Best ${s.best}`);
      // carried items: a stacked item is drawn once with an 'x2' badge
      const key = v2 && s.items && s.items.length ? s.items.join() + '/' + itemArtVersion() : '';
      if (key !== itemsKey) {
        itemsKey = key;
        itemsEl.textContent = '';
        const counts = new Map();
        for (const id of (key ? s.items : [])) counts.set(id, (counts.get(id) || 0) + 1);
        for (const [id, n] of counts) {
          const c = document.createElement('canvas');
          c.width = 40; c.height = 40; c.className = 'octo-hud-item'; c.dataset.item = id; c.title = n > 1 ? id + ' x' + n : id;
          const cx = c.getContext('2d');
          drawItemIcon(cx, id, 20, 20, 15);
          if (n > 1) {
            cx.font = '700 15px Quicksand, sans-serif'; cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
            cx.lineWidth = 4; cx.strokeStyle = '#04121c'; cx.strokeText('x' + n, 40, 39);
            cx.fillStyle = '#f1e4c3'; cx.fillText('x' + n, 40, 39);
          }
          itemsEl.appendChild(c);
        }
        setShown(itemsEl, !!key);
      }
    },
    /** The empty-jar feedback (restartable). */
    shakeJar() {
      jar.el.classList.remove('octo-jar-shake');
      void jar.el.offsetWidth;
      jar.el.classList.add('octo-jar-shake');
    },
    /** What the strip shows, for the tests. */
    read() {
      return { hearts: hearts.num.textContent, bombs: bombs.num.textContent, casts: jar.el.style.display === 'none' ? null : jar.num.textContent,
        shells: shells.el.style.display === 'none' ? null : shells.num.textContent,
        level: clock.style.display === 'none' ? null : lvlT.textContent, run: clock.style.display === 'none' ? null : runT.textContent,
        swift: swiftEl.style.display === 'none' || clock.style.display === 'none' ? '' : swiftText.textContent,
        swiftState: swiftEl.classList.contains('is-earned') ? 'earned' : swiftEl.classList.contains('is-missed') ? 'missed' : '',
        stage: levelEl.style.display === 'none' ? '' : levelText.textContent, items: itemsEl.children.length };
    },
  };
}
