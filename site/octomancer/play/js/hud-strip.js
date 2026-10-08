// The HUD's top-right column (2026-10-08, Daniel's Spelunky / Noita references). The usable hotbar is the top-left row
// (hotbar-ui.js); everything else sits here, right-aligned next to the pause / mute / settings column, top to bottom:
//   1. the run line:  hourglass + level time / run time ('00:05.4 / 01:28.7'), the Swift Current target, the level (place + '1-2')
//   2. the vitals:    heart, bomb, juice jar (casts) and shell, each a chunky icon with an integer on its lower right (Spelunky)
//   3. the timers:    thin bars for the Ink Jet and the dash cooldowns (the only real timers), a soft brighten when ready
//   4. the perks:     the carried passive items as small icons (wraps), hover / tap for a tooltip
//   5. the effects:   timed effects, one per line, right-aligned: a small icon and the seconds left (Anchor, Coral Wall, ...)
// DOM only, and update(state) is called every frame, so every write is keyed: text and canvases change only when their value
// does, the clocks and effect timers show tenths (at most 10 changes a second), the timer bars move by transform in 5% steps,
// and the clock box has a fixed size and `contain`, so a tick never lays out the rest of the page.
// The endless mode (?endless=1) keeps its depth / score / best line instead of the run line.

import { drawBombSlotIcon, drawJarIcon, drawSpellIcon } from './spell-icons.js';
import { onSpritesReady } from './sprites.js';
import { drawItemIcon, itemArtVersion } from './items-draw.js';
import { ITEM_DEFS } from './items.js';
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
// the Swift Current mark
const CURRENT = '<svg viewBox="0 0 24 14" aria-hidden="true"><path d="M1 4c3-3 5 3 8 0s5 3 8 0 4 1 6-1M1 10c3-3 5 3 8 0s5 3 8 0 4 1 6-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
// small marks for the timer bars and the effects that have no spell icon
const SVG = {
  jet: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5C10 5 13 7.5 12.6 10.6 12.2 13.6 3.8 13.6 3.4 10.6 3 7.5 6 5 8 1.5z" fill="#2a1d40" stroke="#c9b8ec" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  dash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5h7M1 8h9.5M1.5 11h7" stroke="#bfe6dc" stroke-width="1.6" stroke-linecap="round"/><path d="M10 3.5l4.5 4.5-4.5 4.5" fill="none" stroke="#bfe6dc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stun: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 8.2c0-1 1.6-1 1.6.2 0 1.6-2.6 2-3.4.4-1-2 1.4-4 3.6-3.2 2.6 1 2.6 4.8.2 6-2.6 1.4-6-.2-6.2-3" fill="none" stroke="#f0d9a8" stroke-width="1.4" stroke-linecap="round"/></svg>',
  dashsafe: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l5 2v3.6c0 3.2-2.2 5.4-5 6.8-2.8-1.4-5-3.6-5-6.8V3.8z" fill="#2f5d58" fill-opacity=".7" stroke="#bfe6dc" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};
/** The timed effects the column knows: label (tooltip) and icon (a spell id drawn by spell-icons.js, or an SVG key). */
export const EFFECTS = {
  anchor: { label: 'Anchor', spell: 'anchor' },
  coral: { label: 'Coral Wall', spell: 'coral-wall' },
  riptide: { label: 'Riptide', spell: 'riptide' },
  lure: { label: 'Lure', spell: 'lure' },
  delayed: { label: 'Delayed cast', spell: 'delayed' },
  cloud: { label: 'Hidden in the ink cloud', spell: 'ink-cloud' },
  stun: { label: 'Stunned', svg: 'stun' },
  dashsafe: { label: 'Dash: nothing can hurt you', svg: 'dashsafe' },
};

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

/** 3.24 -> "3.2s", 12 -> "12s" (an effect's time left; tenths under ten seconds). */
export function effectTime(sec) {
  if (sec === undefined || sec === null || !isFinite(sec)) return '';
  const s = Math.max(0, sec);
  return s < 10 ? (Math.floor(s * 10 + 1e-6) / 10).toFixed(1) + 's' : Math.floor(s) + 's';
}

function makeCanvas(cls, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = el('canvas', cls);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, ctx, w, h };
}

/** A badge: an icon node and its integer on the lower right. */
function badge(cls, icon, title) {
  const b = el('div', 'octo-hud-badge ' + cls);
  b.title = title;
  const num = el('span', 'octo-hud-num', '0');
  b.append(icon, num);
  return { el: b, num };
}

/** A thin cooldown bar (Ink Jet, dash): an icon and a track whose fill moves by transform, in 5% steps. */
function timerBar(cls, svg, title) {
  const row = el('div', 'octo-hud-timer ' + cls);
  row.title = title;
  const ic = el('span', 'octo-hud-timer-icon'); ic.innerHTML = svg;
  const track = el('span', 'octo-hud-track');
  const fill = el('span', 'octo-hud-fill');
  track.appendChild(fill);
  row.append(track, ic);
  let q = -1, flip = false;
  return {
    el: row,
    set(frac) {
      const k = Math.max(0, Math.min(20, Math.floor((frac === undefined ? 1 : frac) * 20 + 1e-6)));
      if (k === q) return;
      const wasReady = q === 20 || q === -1; // (no flash on the first value)
      q = k;
      fill.style.transform = `scaleX(${k / 20})`;
      row.classList.toggle('is-ready', k === 20);
      if (k === 20 && !wasReady) { // a brief brighten when it is ready again: two classes with the same keyframes take turns, so the
        flip = !flip;                  // animation restarts without forcing a reflow
        row.classList.toggle('is-flash-a', flip); row.classList.toggle('is-flash-b', !flip);
      }
    },
    value() { return q / 20; },
  };
}

export function createHudStrip() {
  const bar = el('div', 'octo-hud-bar');

  // 1. the run line: clocks, Swift Current, level (or the endless line)
  const runLine = el('div', 'octo-hud-runline');
  const clock = el('div', 'octo-hud-clock');
  clock.title = 'Level time / run time';
  const glass = el('span', 'octo-hud-glass'); glass.innerHTML = HOURGLASS;
  const times = el('span', 'octo-hud-times');
  const lvlT = el('span', 'octo-hud-time octo-hud-time-level', '00:00.0');
  const slash = el('span', 'octo-hud-time-slash', '/');
  const runT = el('span', 'octo-hud-time octo-hud-time-run', '00:00.0');
  times.append(lvlT, slash, runT);
  clock.append(glass, times);
  clock.style.display = 'none';
  const swiftEl = el('span', 'octo-hud-swift');
  swiftEl.innerHTML = CURRENT;
  const swiftText = el('span', 'octo-hud-swift-t', '');
  swiftEl.appendChild(swiftText);
  swiftEl.title = 'Swift Current: reach the whirlpool by this time';
  swiftEl.style.display = 'none';
  const levelEl = el('div', 'octo-hud-level');
  const placeImg = el('img', 'octo-hud-place'); placeImg.alt = '';
  const levelText = el('span', 'octo-hud-level-t', '');
  levelEl.append(placeImg, levelText);
  levelEl.style.display = 'none';
  const endless = el('span', 'octo-hud-endless', '');
  endless.style.display = 'none';
  runLine.append(clock, swiftEl, levelEl, endless);

  // 2. the vitals: integers (Spelunky)
  const vitals = el('div', 'octo-hud-stats octo-hud-vitals');
  const heartImg = el('img', 'octo-hud-icon octo-hud-heart-icon'); heartImg.src = HEART_SRC; heartImg.alt = '';
  const hearts = badge('octo-hud-hearts', heartImg, 'Hearts');
  const bombCv = makeCanvas('octo-hud-icon octo-hud-bomb-icon', 32, 32);
  const drawBomb = () => { if (bombCv.ctx) { bombCv.ctx.clearRect(0, 0, 32, 32); drawBombSlotIcon(bombCv.ctx, 16, 16, 14.5); } };
  drawBomb();
  const bombs = badge('octo-hud-bombs', bombCv.c, 'Bombs');
  const jarCv = makeCanvas('octo-hud-icon octo-hud-jar-icon', 24, 32);
  const jar = badge('octo-hud-jar', jarCv.c, 'Fish juice');
  const shellImg = el('img', 'octo-hud-icon octo-hud-shell-icon'); shellImg.src = SHELL_SRC; shellImg.alt = 'Shells';
  const shells = badge('octo-hud-shells', shellImg, 'Shells');
  shells.el.style.display = 'none';
  vitals.append(hearts.el, bombs.el, jar.el, shells.el);

  // 3. the timers: Ink Jet and dash cooldowns
  const timers = el('div', 'octo-hud-timers');
  const jetBar = timerBar('octo-hud-jetbar', SVG.jet, 'Ink Jet: refills after each shot');
  const dashBar = timerBar('octo-hud-dashbar', SVG.dash, 'Dash: ready when full');
  timers.append(jetBar.el, dashBar.el);
  timers.style.display = 'none';

  // 4. the perks: carried passive items, with a tooltip on hover / tap
  const itemsEl = el('div', 'octo-hud-items');
  itemsEl.style.display = 'none';
  const tip = el('div', 'octo-hud-tip');
  tip.style.display = 'none';
  let tipTimer = 0;
  const showTip = (c) => {
    const def = ITEM_DEFS[c.dataset.item];
    tip.textContent = (def ? def.name + ': ' + def.blurb : c.dataset.item) + (c.dataset.n > 1 ? ' (x' + c.dataset.n + ')' : '');
    tip.style.display = '';
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.style.display = 'none'; }, 2200);
  };
  itemsEl.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse' && e.target.dataset && e.target.dataset.item) showTip(e.target); });
  itemsEl.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse') { tip.style.display = 'none'; clearTimeout(tipTimer); } });
  itemsEl.addEventListener('pointerdown', (e) => { if (e.target.dataset && e.target.dataset.item) { e.stopPropagation(); showTip(e.target); } });

  // 5. the effects: one row per kind, made once and kept (shown / hidden), so nothing is created per frame
  const effectsEl = el('div', 'octo-hud-effects');
  const effectRows = new Map();
  function effectRow(id) {
    let r = effectRows.get(id);
    if (r) return r;
    const def = EFFECTS[id] || { label: id };
    const row = el('div', 'octo-hud-effect');
    row.dataset.effect = id; row.title = def.label;
    const t = el('span', 'octo-hud-effect-t', '');
    let icon;
    if (def.spell) {
      const cv = makeCanvas('octo-hud-effect-icon', 18, 18);
      if (cv.ctx) drawSpellIcon(cv.ctx, def.spell, 9, 9, 8);
      icon = cv.c; icon._spell = def.spell; icon._ctx = cv.ctx;
    } else { icon = el('span', 'octo-hud-effect-icon'); icon.innerHTML = SVG[def.svg] || ''; }
    row.append(t, icon);
    row.style.display = 'none';
    effectsEl.appendChild(row);
    r = { row, t, icon, on: false, text: '' };
    effectRows.set(id, r);
    return r;
  }
  const redrawEffectIcons = () => { for (const r of effectRows.values()) if (r.icon._ctx) { r.icon._ctx.clearRect(0, 0, 18, 18); drawSpellIcon(r.icon._ctx, r.icon._spell, 9, 9, 8); } };

  bar.append(runLine, vitals, timers, itemsEl, tip, effectsEl);

  const shown = new Map(); // node -> last text written
  const setText = (node, t) => { if (shown.get(node) !== t) { shown.set(node, t); node.textContent = t; } };
  const setShown = (node, on) => { const k = on ? '' : 'none'; if (node.style.display !== k) node.style.display = k; };
  let jarKey = null, itemsKey = '', placeKey = '', swiftKey = '', lowKey = null, bombsEmpty = null;
  onSpritesReady(() => { drawBomb(); jarKey = null; redrawEffectIcons(); }); // the painted bomb, jar and spell icons arrive with the atlas

  return {
    el: bar,
    /**
     * @param {{hearts:number, heartMax:number, bombs:number, stage?:string, shells?:number, items?:string[], juice?:number,
     *   cap?:number, perCast?:number, levelTime?:number|null, runTime?:number|null, swift?:{target:number, earned:boolean}|null,
     *   jet?:number, dash?:number, effects?:{id:string, left?:number}[], depth?:number, score?:number, best?:number}} s
     *   jet / dash: cooldown charge 0..1 (1 = ready); effects: the active timed effects, `left` in s (omitted: no timer)
     */
    update(s) {
      const v2 = s.stage !== undefined;
      // vitals
      setText(hearts.num, String(Math.max(0, s.hearts | 0)));
      const low = s.hearts <= 1;
      if (low !== lowKey) { lowKey = low; hearts.el.classList.toggle('is-low', low); }
      setText(bombs.num, String(Math.max(0, s.bombs | 0)));
      if ((s.bombs <= 0) !== bombsEmpty) { bombsEmpty = s.bombs <= 0; bombs.el.classList.toggle('is-empty', bombsEmpty); }
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
      // run line
      const timed = v2 && s.levelTime !== undefined && s.levelTime !== null;
      setShown(clock, timed);
      if (timed) {
        setText(lvlT, formatClock(s.levelTime));
        setText(runT, formatClock(s.runTime || 0));
      }
      const sw = timed ? s.swift : null;
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
      setShown(levelEl, v2);
      if (v2) {
        const b = levelBadge(s.stage);
        if (b.place !== placeKey) { placeKey = b.place; placeImg.src = PLACE_SRC[b.place]; }
        setText(levelText, b.text);
        if (levelEl.title !== s.stage) levelEl.title = s.stage;
      }
      setShown(endless, !v2);
      if (!v2) setText(endless, `Depth ${s.depth}m  Score ${s.score}  Best ${s.best}`);
      // timers
      const hasTimers = v2 && (s.jet !== undefined || s.dash !== undefined);
      setShown(timers, hasTimers);
      if (hasTimers) { jetBar.set(s.jet); dashBar.set(s.dash); }
      // perks: a stacked item is drawn once with an 'x2' badge
      const key = v2 && s.items && s.items.length ? s.items.join() + '/' + itemArtVersion() : '';
      if (key !== itemsKey) {
        itemsKey = key;
        itemsEl.textContent = '';
        const counts = new Map();
        for (const id of (key ? s.items : [])) counts.set(id, (counts.get(id) || 0) + 1);
        for (const [id, n] of counts) {
          const c = document.createElement('canvas');
          c.width = 40; c.height = 40; c.className = 'octo-hud-item'; c.dataset.item = id; c.dataset.n = String(n);
          const def = ITEM_DEFS[id];
          c.title = (def ? def.name : id) + (n > 1 ? ' x' + n : '');
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
        if (!key) setShown(tip, false);
      }
      // effects
      const list = v2 && s.effects ? s.effects : null;
      for (const r of effectRows.values()) r.seen = false;
      if (list) for (const e of list) {
        const r = effectRow(e.id);
        r.seen = true;
        const txt = effectTime(e.left);
        if (txt !== r.text) { r.text = txt; r.t.textContent = txt; }
        if (!r.on) { r.on = true; r.row.style.display = ''; }
      }
      for (const r of effectRows.values()) if (!r.seen && r.on) { r.on = false; r.row.style.display = 'none'; }
    },
    /** The empty-jar feedback (restartable). */
    shakeJar() {
      jar.el.classList.remove('octo-jar-shake');
      void jar.el.offsetWidth;
      jar.el.classList.add('octo-jar-shake');
    },
    /** What the column shows, for the tests. */
    read() {
      const vis = (n) => n.style.display !== 'none';
      return { hearts: hearts.num.textContent, bombs: bombs.num.textContent, casts: vis(jar.el) ? jar.num.textContent : null,
        shells: vis(shells.el) ? shells.num.textContent : null,
        level: vis(clock) ? lvlT.textContent : null, run: vis(clock) ? runT.textContent : null,
        swift: vis(swiftEl) ? swiftText.textContent : '',
        swiftState: swiftEl.classList.contains('is-earned') ? 'earned' : swiftEl.classList.contains('is-missed') ? 'missed' : '',
        stage: vis(levelEl) ? levelText.textContent : '', items: itemsEl.children.length,
        jet: vis(timers) ? jetBar.value() : null, dash: vis(timers) ? dashBar.value() : null,
        effects: [...effectRows.entries()].filter(([, r]) => r.on).map(([id, r]) => id + (r.text ? ' ' + r.text : '')) };
    },
  };
}
