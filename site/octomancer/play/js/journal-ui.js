// The journal book (round 38, modelled on the Spelunky 2 journal): an open book with two facing parchment pages inside the
// banner-art frame, chapter bookmarks on the right edge (Carried, Places, People, Bestiary, Items, Traps, Progress), a grid of
// entries on the left page and the selected entry on the right page (big picture, name, a short description and the
// counters). A locked entry is a clear silhouette with '???' (and, for items, spells and runes, a one-line hint where it is
// found) until it has been met. Pages turn with the arrows, the arrow keys or a swipe, with a short flip. Phone portrait shows
// one page at a time (the grid, then the entry). Plain HTML over the canvas; Tab / I open it on the Carried page, the hub board,
// the pause menu and the settings panel open it too. The book has a fixed size, so the tabs never move: the pages scroll inside.
//
// 2026-10-08, the Carried page (first bookmark): everything the octopus carries now (hotbar slots, Ink Jet, bombs, the juice
// jar, passive items) as a grid; the highlighted one (hover, arrow keys, a tap) shows its picture, numbers and key on the right
// page. Hotbar slots swap by dragging one onto another, or Enter / Space on one and then on the other, or the arrow buttons on
// its page. A tab with several categories (Items: items, spells and runes, loot) starts a new grid page at each category.

import { TABS, CATEGORY_TITLES, counterRows, completion, storyLines, entryById } from './journal.js';
import { entryArt, onArtReady, preloadArt } from './journal-art.js';
import { statsRows, bestRunLines, formatTime, depthLabel } from './runstats.js';
import { artUrl } from './v2-art.js';
import { carriedList, describe, entryNumbers, entryUse, K_SLOT, K_BOMB, K_ITEM, K_JAR } from './carried.js';
import { drawRuneBadge } from './spell-icons.js';
import { resolveSlot, modById } from './spells.js';

const COLS = 3;
const SWIPE_PX = 48;
const DRAG_PX = 8;
const TAB_CARRIED = { id: 'carried', title: 'Carried' };
const TAB_PROGRESS = { id: 'progress', title: 'Progress' };
const TAB_ORDER = [TAB_CARRIED].concat(TABS, [TAB_PROGRESS]);
const TAB_COLORS = { carried: '#7cc4b4', places: '#e3b25e', people: '#e58f7e', bestiary: '#86bd7c', items: '#74acd8', traps: '#b890d6', progress: '#dcd5ba' };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} root the #hud element
 * @param {ReturnType<import('./journal.js').createJournal>} journal
 * @param {{onClose?:()=>void, onOpen?:()=>void, getStats?:()=>{meta:any, bestRuns:any[]}, getStory?:()=>Record<string, number>, reducedMotion?:()=>boolean,
 *   getCarried?:()=>any, onSwap?:(a:number, b:number)=>void, onSelectSlot?:(i:number)=>void}} handlers
 *   getCarried: the carried state (carried.js) for the Carried page; without it that page is hidden.
 */
export function createJournalScreen(root, journal, handlers = {}) {
  const overlay = el('div', 'octo-overlay octo-journal-overlay');
  overlay.dataset.octoModal = '1';
  overlay.style.display = 'none';
  const book = el('div', 'octo-book');
  book.setAttribute('role', 'dialog'); book.setAttribute('aria-label', 'Journal');
  const ribbon = el('div', 'octo-bk-ribbon');
  ribbon.style.backgroundImage = `url(${artUrl('title-banner.webp')})`;
  ribbon.appendChild(el('span', 'octo-bk-ribbon-text', 'Journal'));
  const frame = el('div', 'octo-bk-frame');
  const spread = el('div', 'octo-bk-spread');
  const pageL = el('div', 'octo-bk-page octo-bk-left');
  const spine = el('div', 'octo-bk-spine');
  const pageR = el('div', 'octo-bk-page octo-bk-right');
  spread.append(pageL, spine, pageR);
  const foot = el('div', 'octo-bk-foot');
  const prevBtn = el('button', 'octo-bk-turn', '‹'); prevBtn.type = 'button'; prevBtn.setAttribute('aria-label', 'Previous page');
  const nextBtn = el('button', 'octo-bk-turn', '›'); nextBtn.type = 'button'; nextBtn.setAttribute('aria-label', 'Next page');
  const pageLabel = el('div', 'octo-bk-pagelabel');
  const closeBtn = el('button', 'octo-bk-close', 'Close'); closeBtn.type = 'button';
  foot.append(prevBtn, pageLabel, closeBtn, nextBtn);
  frame.append(spread, foot);
  const tabsEl = el('div', 'octo-bk-tabs');
  tabsEl.setAttribute('role', 'tablist');
  const tabBtns = {};
  const has = (id) => (id === 'progress' ? !!handlers.getStats : id === 'carried' ? !!handlers.getCarried : true);
  const order = () => TAB_ORDER.filter((t) => has(t.id));
  const tabIndex = (id) => order().findIndex((x) => x.id === id);
  for (const t of TAB_ORDER) {
    const b = el('button', 'octo-bk-tab'); b.type = 'button'; b.dataset.tab = t.id; b.setAttribute('role', 'tab');
    b.style.setProperty('--tab', TAB_COLORS[t.id] || '#ddd');
    b.append(el('span', 'octo-bk-tabname', t.title));
    b.addEventListener('click', () => { if (t.id !== tab) turnTo(t.id, 0, tabIndex(t.id) > tabIndex(tab) ? 1 : -1); });
    tabsEl.appendChild(b); tabBtns[t.id] = b;
    if (!has(t.id)) b.style.display = 'none';
  }
  book.append(ribbon, frame, tabsEl);
  overlay.appendChild(book);
  root.appendChild(overlay);

  let open = false;
  let tab = order()[0].id;  // a TAB_ORDER id
  let gpage = 0;            // grid page (progress: 0 / 1 = the two pages)
  let entryId = null;       // the selected entry (right page); on the Carried page a card key ('slot:0', 'jet', 'item:flippers', ...)
  let view = 'grid';        // single-page mode: 'grid' | 'entry' (progress: page 0 | 1 via gpage)
  let mode = 'spread';      // 'spread' | 'single'
  let perPage = COLS * 3;
  let flipTimer = 0, suppressClick = 0;
  let pickSlot = -1;        // Carried page: the hotbar slot picked up for a swap (Enter / Space / the Swap button), -1 = none
  let noSwipe = false;      // a card drag just ended: the spread does not read it as a swipe

  const carriedState = () => (handlers.getCarried ? handlers.getCarried() : null);
  /** The entries of a tab: journal rows, or on the Carried page the cards ({id: card key, found: true, card}). */
  function items(t) {
    if (t === 'carried') return carriedList(carriedState()).map((c) => ({ id: c.key, found: true, card: c }));
    if (t === 'progress') return [];
    return journal.tabList(t);
  }
  const list = () => items(tab);
  /** The grid pages of a tab as index ranges: at most perPage entries, and a new page where the category changes (Items: items, then spells and runes, then loot). */
  function ranges(t, all = items(t)) {
    if (t === 'carried' || t === 'progress') return [{ s: 0, e: all.length, cat: null }];
    const out = [];
    let s = 0;
    for (let i = 1; i <= all.length; i++) {
      if (i === all.length || i - s >= perPage || all[i].cat !== all[s].cat) { out.push({ s, e: i, cat: all[s].cat }); s = i; }
    }
    return out.length ? out : [{ s: 0, e: 0, cat: null }];
  }
  const pageOfIndex = (t, i, all) => Math.max(0, ranges(t, all).findIndex((r) => i >= r.s && i < r.e));
  // Progress is two pages, both on screen in the spread; one at a time on a phone
  const pagesOf = (t) => (t === 'progress' ? (mode === 'spread' ? 1 : 2) : ranges(t).length);

  function measure() {
    mode = frame.clientWidth >= 600 ? 'spread' : 'single';
    book.dataset.mode = mode;
  }
  let fitting = false;
  /** Rows of cards that fit the left page (measured from a real card), so the grid never shows a cut-off row. */
  function fitRows(head, grid) {
    const card = grid.querySelector('.octo-bk-card');
    if (fitting || !card || !card.offsetHeight) return false;
    const avail = pageL.clientHeight - head.offsetHeight - 14 - 26 - 12 - 6;
    const rows = Math.max(2, Math.min(5, Math.floor((avail + 8) / (card.offsetHeight + 8))));
    if (rows * COLS === perPage) return false;
    perPage = rows * COLS;
    const all = list(), i = all.findIndex((e) => e.id === entryId);
    gpage = i >= 0 ? pageOfIndex(tab, i, all) : 0;
    return true;
  }

  function artCanvas(id, px, locked) {
    const c = el('canvas', 'octo-bk-art');
    c.width = c.height = px;
    c.getContext('2d').drawImage(entryArt(id, px, locked), 0, 0);
    return c;
  }
  /** A Carried card's picture: the entry art, with a spell slot's rune stones set under it. */
  function cardCanvas(card, px) {
    const c = el('canvas', 'octo-bk-art');
    c.width = c.height = px;
    const g = c.getContext('2d');
    const runes = card.kind === K_SLOT ? card.ids.filter((r) => modById(r)) : [];
    if (card.journal && entryById(card.journal)) {
      if (runes.length) g.drawImage(entryArt(card.journal, px, false), px * 0.1, 0, px * 0.8, px * 0.8);
      else g.drawImage(entryArt(card.journal, px, false), 0, 0);
    }
    if (runes.length) {
      const fold = resolveSlot(card.ids);
      runes.forEach((r, k) => drawRuneBadge(g, r, px * (runes.length === 1 ? 0.5 : 0.33 + 0.34 * k), px * 0.84, px * 0.13, !!fold && fold.greyed.includes(r)));
    }
    return c;
  }
  const pageNo = (n, of) => el('div', 'octo-bk-no', of > 1 ? n + ' / ' + of : '');

  function renderGrid() {
    const all = list();
    const rs = ranges(tab, all);
    if (gpage >= rs.length) gpage = rs.length - 1;
    const r = rs[gpage];
    const slice = all.slice(r.s, r.e);
    const tdef = TABS.find((t) => t.id === tab);
    const head = el('div', 'octo-bk-head');
    const p = journal.tabProgress(tab);
    // a tab of several categories names the section of this page (Items: Spells and Runes)
    const sect = tdef.cats.length > 1 && r.cat && r.cat !== tdef.cats[0] ? CATEGORY_TITLES[r.cat] || tdef.title : tdef.title;
    head.append(el('span', 'octo-bk-title', sect), el('span', 'octo-bk-count', p.found + ' / ' + p.total));
    const grid = el('div', 'octo-bk-grid');
    for (const e of slice) {
      const card = el('button', 'octo-bk-card' + (e.found ? '' : ' is-locked') + (e.id === entryId ? ' is-sel' : ''));
      card.type = 'button'; card.dataset.id = e.id;
      card.setAttribute('aria-label', e.found ? e.name : 'Undiscovered entry');
      const plate = el('div', 'octo-bk-plate');
      plate.appendChild(artCanvas(e.id, 96, !e.found));
      if (!e.found) plate.appendChild(el('span', 'octo-bk-q', '?'));
      card.append(plate, el('span', 'octo-bk-cardname', e.found ? e.name : '???'));
      card.addEventListener('click', () => {
        if (performance.now() < suppressClick) return;
        if (entryId !== e.id) { entryId = e.id; flip(1); }
        if (mode === 'single') view = 'entry';
        render();
      });
      grid.appendChild(card);
    }
    pageL.replaceChildren(head, grid, pageNo(gpage + 1, rs.length));
    if (fitRows(head, grid)) { fitting = true; renderGrid(); fitting = false; }
  }

  function ledger(rows, cls = '') {
    const box = el('div', 'octo-bk-ledger' + (cls ? ' ' + cls : ''));
    for (const [k, v] of rows) box.appendChild(lrow(k, v));
    return box;
  }

  function renderEntry() {
    const all = list();
    let e = all.find((x) => x.id === entryId);
    if (!e) { const r = ranges(tab, all)[gpage]; e = all[r ? r.s : 0] || all[0]; entryId = e ? e.id : null; }
    if (!e) { pageR.replaceChildren(); return; }
    const tdef = TABS.find((t) => t.id === tab);
    const idx = all.findIndex((x) => x.id === e.id);
    const box = el('div', 'octo-bk-entry' + (e.found ? '' : ' is-locked'));
    box.dataset.id = e.id;
    box.append(el('div', 'octo-bk-kicker', tdef.title + '  No. ' + (idx + 1)));
    const plate = el('div', 'octo-bk-plate octo-bk-plate-big');
    plate.appendChild(artCanvas(e.id, 192, !e.found));
    if (!e.found) plate.appendChild(el('span', 'octo-bk-q octo-bk-qbig', '?'));
    // a person's questline so far (Spelunky 2's People pages): what happened, from the save's story flags
    const lines = e.found && e.story && handlers.getStory ? storyLines(e, handlers.getStory()) : [];
    // an item, spell or rune page: its numbers and where it is found (the unlock collection)
    const facts = e.found ? entryNumbers(e.id) : [];
    if (lines.length) {
      // r40: a People page with its story is a compact page: a small picture, then (beside it on a phone or a short screen) the name, then the
      // description, the story and the counters, so a complete entry fits the fixed page without scrolling
      box.classList.add('has-story');
      const bio = el('div', 'octo-bk-bio');
      bio.append(plate, el('div', 'octo-bk-name', e.name));
      box.append(bio, el('div', 'octo-bk-text', e.text));
    } else if (e.found && (facts.length || e.where)) {
      // the same compact layout for an item page: picture and name, description, numbers, where found, counters
      box.classList.add('has-facts');
      const bio = el('div', 'octo-bk-bio');
      bio.append(plate, el('div', 'octo-bk-name', e.name));
      box.append(bio, el('div', 'octo-bk-text', e.text));
    } else box.append(plate, el('div', 'octo-bk-name', e.found ? e.name : '???'));
    if (e.found) {
      if (!lines.length && !box.classList.contains('has-facts')) box.appendChild(el('div', 'octo-bk-text', e.text));
      if (lines.length) {
        const story = el('div', 'octo-bk-story');
        story.appendChild(el('div', 'octo-bk-sub', 'Story so far'));
        const ul = el('ol', 'octo-bk-steps');
        for (const l of lines) ul.appendChild(el('li', '', l));
        story.appendChild(ul);
        box.appendChild(story);
      }
      if (facts.length) box.appendChild(ledger(facts, 'octo-bk-facts'));
      if (e.where) box.appendChild(el('div', 'octo-bk-where', 'Found: ' + e.where));
      const rows = counterRows(e);
      if (rows.length) box.appendChild(ledger(rows));
    } else {
      // locked: the silhouette, '???', and (items, spells, runes) a one-line tease of where to look
      box.appendChild(el('div', 'octo-bk-text octo-bk-hint', e.where ? 'Not found yet. ' + e.where : 'Not found yet. Keep exploring.'));
    }
    pageR.replaceChildren(box);
  }

  // ------------------------------------------------------------------------------------------ the Carried page
  const SECTIONS = { slot: 'Hotbar', jet: 'Always with you', bomb: 'Always with you', jar: 'Always with you', item: 'Items' };
  let carriedCols = 4;

  function renderCarriedGrid() {
    const st = carriedState();
    const all = list();
    const head = el('div', 'octo-bk-head');
    const nSlots = all.filter((e) => e.card.kind === K_SLOT).length;
    head.append(el('span', 'octo-bk-title', 'Carried'), el('span', 'octo-bk-count', pickSlot >= 0 ? 'Swap slot ' + (pickSlot + 1) + ' with...' : 'Hotbar ' + nSlots + ' / 9'));
    const grid = el('div', 'octo-bk-grid octo-bk-cgrid');
    let lastSect = '';
    for (const e of all) {
      const c = e.card, sect = SECTIONS[c.kind] || '';
      if (sect !== lastSect) { grid.appendChild(el('div', 'octo-bk-csect', sect)); lastSect = sect; }
      const d = describe(c, st);
      const card = el('button', 'octo-bk-card octo-bk-ccard' + (e.id === entryId ? ' is-sel' : '') + (d.selected ? ' is-held' : '') + (c.kind === K_SLOT && c.slot === pickSlot ? ' is-picked' : ''));
      card.type = 'button'; card.dataset.id = e.id;
      if (c.kind === K_SLOT) card.dataset.slot = String(c.slot);
      card.setAttribute('aria-label', d.name);
      const plate = el('div', 'octo-bk-plate');
      plate.appendChild(cardCanvas(c, 96));
      if (c.kind === K_SLOT) plate.appendChild(el('span', 'octo-bk-slotno', String(c.slot + 1)));
      const cnt = c.kind === K_BOMB || (c.kind === K_SLOT && c.id === 'bomb') ? String(st ? st.bombs | 0 : 0) : c.kind === K_ITEM && c.count > 1 ? 'x' + c.count : c.kind === K_JAR && st ? Math.floor((st.juice | 0) / (st.perCast || 1)) + '/' + Math.round((st.cap || 0) / (st.perCast || 1)) : '';
      if (cnt) plate.appendChild(el('span', 'octo-bk-cnt', cnt));
      card.append(plate, el('span', 'octo-bk-cardname', d.short));
      card.addEventListener('click', () => {
        if (performance.now() < suppressClick) return;
        if (pickSlot >= 0 && c.kind === K_SLOT) { finishPick(c.slot); return; }
        highlight(e.id, true);
        if (mode === 'single') { view = 'entry'; flip(1); render(); }
      });
      // hover highlights with a mouse (a touch highlights on the tap)
      card.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && !drag) highlight(e.id, false); });
      if (c.kind === K_SLOT) bindDrag(card, c.slot);
      grid.appendChild(card);
    }
    if (!all.some((e) => e.card.kind === K_ITEM)) {
      grid.appendChild(el('div', 'octo-bk-csect', 'Items'));
      grid.appendChild(el('div', 'octo-bk-none octo-bk-cnone', 'None yet. The Shell Stall, clams and pockets hold them.'));
    }
    pageL.replaceChildren(head, grid);
    const cs = getComputedStyle(grid).gridTemplateColumns;
    carriedCols = cs && cs !== 'none' ? cs.split(' ').length : 4;
  }

  /** Highlight a Carried card: the right page follows without rebuilding the grid (hover must not break a drag or the hover). */
  function highlight(id, fromTap) {
    if (entryId === id && !fromTap) return;
    entryId = id;
    for (const b of pageL.querySelectorAll('.octo-bk-ccard')) b.classList.toggle('is-sel', b.dataset.id === id);
    renderCarriedEntry();
  }

  function renderCarriedEntry() {
    const st = carriedState();
    const all = list();
    let e = all.find((x) => x.id === entryId);
    if (!e) { e = all[0]; entryId = e ? e.id : null; }
    if (!e) { pageR.replaceChildren(); return; }
    const c = e.card, d = describe(c, st);
    const row = c.journal ? entryById(c.journal) : null;
    const box = el('div', 'octo-bk-entry octo-bk-carried has-facts');
    box.dataset.id = e.id;
    box.append(el('div', 'octo-bk-kicker', 'Carried · ' + (c.kind === K_SLOT ? 'Hotbar slot ' + (c.slot + 1) + (d.selected ? ', in hand' : '') : SECTIONS[c.kind] || '')));
    const plate = el('div', 'octo-bk-plate octo-bk-plate-big');
    plate.appendChild(cardCanvas(c, 192));
    const bio = el('div', 'octo-bk-bio');
    bio.append(plate, el('div', 'octo-bk-name', d.name));
    box.append(bio, el('div', 'octo-bk-text', row ? row.text : d.blurb));
    if (d.numbers.length) box.appendChild(ledger(d.numbers, 'octo-bk-facts'));
    if (d.use) { const u = el('div', 'octo-bk-use'); u.append(el('b', '', 'How: '), document.createTextNode(d.use)); box.appendChild(u); }
    if (c.kind === K_SLOT) {
      const n = all.filter((x) => x.card.kind === K_SLOT).length;
      const acts = el('div', 'octo-bk-acts');
      const mk = (cls, text, label, fn, dis) => { const b = el('button', 'octo-bk-act ' + cls, text); b.type = 'button'; b.setAttribute('aria-label', label); b.disabled = !!dis; b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); return b; };
      acts.append(
        mk('octo-bk-act-left', '◀', 'Move left', () => swap(c.slot, c.slot - 1), c.slot === 0),
        mk('octo-bk-act-hold', d.selected ? 'In hand' : 'Hold it', 'Hold this slot', () => { if (handlers.onSelectSlot) handlers.onSelectSlot(c.slot); render(); }, d.selected),
        mk('octo-bk-act-swap', c.slot === pickSlot ? 'Cancel' : 'Swap', 'Swap with another slot', () => { pickSlot = pickSlot === c.slot ? -1 : c.slot; if (pickSlot >= 0 && mode === 'single') view = 'grid'; render(); }, n < 2),
        mk('octo-bk-act-right', '▶', 'Move right', () => swap(c.slot, c.slot + 1), c.slot >= n - 1),
      );
      box.appendChild(acts);
    }
    if (row) {
      const link = el('button', 'octo-bk-link', 'Journal page ›'); link.type = 'button';
      link.addEventListener('click', (ev) => { ev.stopPropagation(); api.showEntry(row.id); });
      box.appendChild(link);
    }
    pageR.replaceChildren(box);
  }

  /** Swap hotbar slots a and b; the highlight follows the slot that moved. */
  function swap(a, b) {
    const n = list().filter((x) => x.card.kind === K_SLOT).length;
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) return false;
    if (handlers.onSwap) handlers.onSwap(a, b);
    entryId = 'slot:' + b; pickSlot = -1;
    render();
    return true;
  }
  function finishPick(slot) {
    const from = pickSlot;
    pickSlot = -1;
    if (from !== slot) swap(from, slot); else render();
  }

  // drag a hotbar card onto another (mouse or touch); a short move is still a tap
  let drag = null;
  function bindDrag(card, slot) {
    card.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      drag = { slot, id: ev.pointerId, x: ev.clientX, y: ev.clientY, on: false, card, over: -1 };
    });
    card.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      if (!drag.on) {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < DRAG_PX) return;
        drag.on = true; card.classList.add('is-dragging');
        try { card.setPointerCapture(ev.pointerId); } catch (e) { /* the pointer is gone */ }
      }
      card.style.transform = 'translate(' + (ev.clientX - drag.x) + 'px,' + (ev.clientY - drag.y) + 'px)';
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x !== card && x.dataset && x.dataset.slot !== undefined && x.classList.contains('octo-bk-ccard'));
      const over = under ? Number(under.dataset.slot) : -1;
      if (over !== drag.over) {
        for (const b of pageL.querySelectorAll('.octo-bk-ccard.is-drop')) b.classList.remove('is-drop');
        if (under) under.classList.add('is-drop');
        drag.over = over;
      }
    });
    const end = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.on) return;
      noSwipe = true; suppressClick = performance.now() + 300;
      card.classList.remove('is-dragging'); card.style.transform = '';
      if (ev.type === 'pointerup' && d.over >= 0 && d.over !== d.slot) swap(d.slot, d.over);
      else render();
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  /** Arrow keys on the Carried grid: left / right by one card, up / down by a row; past the last card the book turns on. */
  function moveCarried(dx, dy) {
    const all = list();
    if (!all.length) return;
    const i = Math.max(0, all.findIndex((e) => e.id === entryId));
    let j = i + dx + dy * carriedCols;
    if (dx > 0 && j >= all.length) { turn(1); return; }
    j = Math.max(0, Math.min(all.length - 1, j));
    if (j !== i) highlight(all[j].id, true);
  }

  function lrow(k, v) {
    const r = el('div', 'octo-bk-lrow');
    r.append(el('span', 'octo-bk-lk', k), el('i', 'octo-bk-dots'), el('b', 'octo-bk-lv', String(v)));
    return r;
  }
  function renderProgress() {
    const comp = completion(journal);
    const left = el('div', 'octo-bk-prog');
    left.append(el('div', 'octo-bk-head octo-bk-headrow', ''), el('div', 'octo-bk-bignum', comp.pct + '%'), el('div', 'octo-bk-bigsub', 'of the journal filled (' + comp.found + ' of ' + comp.total + ')'));
    left.firstChild.append(el('span', 'octo-bk-title', 'Completion'), el('span', 'octo-bk-count', comp.found + ' / ' + comp.total));
    const bars = el('div', 'octo-bk-bars');
    for (const t of comp.tabs) {
      const row = el('div', 'octo-bk-barrow');
      row.append(el('span', 'octo-bk-lk', t.title), el('span', 'octo-bk-barpct', t.pct + '%'));
      const bar = el('div', 'octo-bk-bar'); const fill = el('div', 'octo-bk-barfill'); fill.style.width = t.pct + '%'; bar.appendChild(fill);
      row.appendChild(bar);
      bars.appendChild(row);
    }
    left.appendChild(bars);
    pageL.replaceChildren(left, pageNo(1, 2));
    const { meta, bestRuns } = handlers.getStats();
    const s = statsRows(meta);
    const deaths = Object.values(meta.deaths).reduce((a, b) => a + b, 0);
    const right = el('div', 'octo-bk-prog');
    const head = el('div', 'octo-bk-head'); head.append(el('span', 'octo-bk-title', 'Your dives'));
    right.append(head, lrow('Runs', meta.dives), lrow('Deaths', deaths), lrow('Best depth', meta.bestDepth ? depthLabel(meta.bestDepth) : 'None yet'), lrow('Play time', formatTime(meta.time || 0)), lrow('Shells collected', meta.shells || 0));
    for (const [k, v] of s.rows) if (!['Runs', 'Best depth', 'Total shells'].includes(k)) right.appendChild(lrow(k, v));
    right.appendChild(el('div', 'octo-bk-sub', 'Deaths by cause'));
    if (!s.deaths.length) right.appendChild(el('div', 'octo-bk-none', 'None yet'));
    for (const [k, v] of s.deaths) right.appendChild(lrow(k, v));
    right.appendChild(el('div', 'octo-bk-sub', 'Best runs'));
    const lines = bestRunLines(bestRuns);
    if (!lines.length) right.appendChild(el('div', 'octo-bk-none', 'None yet'));
    for (const l of lines) right.appendChild(el('div', 'octo-bk-bestline', l));
    pageR.replaceChildren(right, pageNo(2, 2));
  }

  function render() {
    measure();
    for (const t of TAB_ORDER) {
      tabBtns[t.id].classList.toggle('is-active', t.id === tab);
      tabBtns[t.id].setAttribute('aria-selected', t.id === tab ? 'true' : 'false');
    }
    if (tab !== 'carried') pickSlot = -1;
    if (tab === 'progress') {
      if (mode === 'spread') gpage = 0;
      if (handlers.getStats) renderProgress();
      view = mode === 'single' ? (gpage === 1 ? 'entry' : 'grid') : 'grid';
    } else if (tab === 'carried') {
      gpage = 0;
      renderCarriedGrid();
      renderCarriedEntry();
    } else {
      renderGrid();
      renderEntry();
    }
    book.dataset.view = view;
    const pages = pagesOf(tab);
    const tdef = TAB_ORDER.find((t) => t.id === tab);
    pageLabel.textContent = tdef.title + (pages > 1 ? '  ' + (gpage + 1) + '/' + pages : '');
    const seq = sequencePos();
    prevBtn.disabled = seq.i <= 0; nextBtn.disabled = seq.i >= seq.n - 1;
    book.dataset.tab = tab;
  }

  /** The book as one run of pages (every tab's grid pages in order, Progress last): index and length. */
  function sequencePos() {
    let i = 0, n = 0;
    for (const t of order()) {
      const c = pagesOf(t.id);
      if (t.id === tab) i = n + gpage;
      n += c;
    }
    return { i, n };
  }

  function flip(dir) {
    if (!open || (handlers.reducedMotion && handlers.reducedMotion())) return;
    const target = mode === 'spread' ? (dir > 0 ? pageR : pageL) : (view === 'entry' ? pageR : pageL);
    for (const p of [pageL, pageR]) p.classList.remove('turn-next', 'turn-prev');
    void target.offsetWidth;
    target.classList.add(dir > 0 ? 'turn-next' : 'turn-prev');
    clearTimeout(flipTimer);
    flipTimer = setTimeout(() => { pageL.classList.remove('turn-next', 'turn-prev'); pageR.classList.remove('turn-next', 'turn-prev'); }, 420);
  }

  /** Go to a tab page; the selected entry becomes the first one on it. */
  function turnTo(t, page, dir) {
    tab = t; gpage = page;
    if (t !== 'progress') { const all = items(t); const r = ranges(t, all)[page]; const e = all[r ? r.s : 0]; entryId = e ? e.id : null; }
    else entryId = null;
    view = 'grid'; pickSlot = -1;
    if (open) { flip(dir); render(); }
  }

  /** One page forward (+1) or back (-1) through the whole book. */
  function turn(dir) {
    if (!open) return false;
    if (mode === 'single' && tab !== 'progress' && view === 'entry') { moveEntry(dir); return true; }
    if (mode === 'single' && tab === 'progress' && dir > 0 && gpage === 0) { gpage = 1; flip(1); render(); return true; }
    if (mode === 'single' && tab === 'progress' && dir < 0 && gpage === 1) { gpage = 0; flip(-1); render(); return true; }
    const ord = order();
    const ti = ord.findIndex((t) => t.id === tab);
    const pages = pagesOf(tab);
    if (dir > 0) {
      if (gpage + 1 < pages && tab !== 'progress') turnTo(tab, gpage + 1, 1);
      else if (ti + 1 < ord.length) turnTo(ord[ti + 1].id, 0, 1);
      else return false;
    } else {
      if (gpage > 0 && tab !== 'progress') turnTo(tab, gpage - 1, -1);
      else if (ti > 0) { const pt = ord[ti - 1].id; turnTo(pt, pt === 'progress' ? 1 : pagesOf(pt) - 1, -1); }
      else return false;
    }
    return true;
  }

  /** Select the previous / next entry of the tab (and bring its grid page along). */
  function moveEntry(dir) {
    if (tab === 'progress') return;
    const all = list();
    if (!all.length) return;
    const i = Math.max(0, all.findIndex((e) => e.id === entryId));
    const j = (i + dir + all.length) % all.length;
    entryId = all[j].id; gpage = pageOfIndex(tab, j, all);
    flip(dir); render();
  }

  // swipe: a horizontal drag turns the page
  let sx = 0, sy = 0, sid = -1;
  spread.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; sid = e.pointerId; noSwipe = false; });
  spread.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sid) return;
    sid = -1;
    if (noSwipe) { noSwipe = false; return; }
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) { suppressClick = performance.now() + 300; turn(dx < 0 ? 1 : -1); }
  });
  spread.addEventListener('pointercancel', () => { sid = -1; });

  prevBtn.addEventListener('click', () => turn(-1));
  nextBtn.addEventListener('click', () => turn(1));
  // in single-page mode the back arrow on an entry returns to the grid
  pageR.addEventListener('click', (e) => { if (mode === 'single' && tab !== 'progress' && e.target.closest('.octo-bk-plate-big')) { view = 'grid'; flip(-1); render(); } });

  function onKey(e) {
    if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    const carried = tab === 'carried' && !(mode === 'single' && view === 'entry');
    switch (e.code) {
      case 'ArrowRight': case 'KeyD': if (carried) moveCarried(1, 0); else turn(1); break;
      case 'ArrowLeft': case 'KeyA': if (carried) moveCarried(-1, 0); else turn(-1); break;
      case 'ArrowDown': case 'KeyS': if (carried) moveCarried(0, 1); else moveEntry(1); break;
      case 'ArrowUp': case 'KeyW': if (carried) moveCarried(0, -1); else moveEntry(-1); break;
      // Q / E (the hotbar keys in the game) turn to the previous / next bookmark, like a pad's shoulder buttons
      case 'KeyQ': case 'KeyE': {
        const ord = order(), ti = ord.findIndex((t) => t.id === tab), d = e.code === 'KeyE' ? 1 : -1;
        if (ord[ti + d]) turnTo(ord[ti + d].id, 0, d);
        break;
      }
      case 'Enter': case 'NumpadEnter': case 'Space': {
        if (tab !== 'carried') { if (mode === 'single' && view === 'grid' && entryId) { view = 'entry'; flip(1); render(); } else used = false; break; }
        const cur = list().find((x) => x.id === entryId);
        if (!cur || cur.card.kind !== K_SLOT) { if (pickSlot >= 0) { pickSlot = -1; render(); } break; }
        if (pickSlot < 0) { pickSlot = cur.card.slot; render(); } else finishPick(cur.card.slot);
        break;
      }
      case 'Backspace': if (pickSlot >= 0) { pickSlot = -1; render(); } else if (mode === 'single' && view === 'entry') { view = 'grid'; render(); } else used = false; break;
      default: {
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        const ord = order();
        if (m && ord[Number(m[1]) - 1]) turnTo(ord[Number(m[1]) - 1].id, 0, Number(m[1]) - 1 > ord.findIndex((t) => t.id === tab) ? 1 : -1);
        else used = false;
      }
    }
    if (used) e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  function hide() {
    if (!open) return;
    open = false; pickSlot = -1; drag = null;
    overlay.style.display = 'none';
    journal.flush();
    if (handlers.onClose) handlers.onClose();
  }
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
  onArtReady(() => { if (open && !drag) render(); });
  window.addEventListener('resize', () => { if (open) render(); });

  const api = {
    /** Open the book on a tab (default: the first bookmark, the Carried page when the game provides it). */
    show(startTab) {
      open = true; tab = startTab && order().some((t) => t.id === startTab) ? startTab : order()[0].id; gpage = 0; view = 'grid'; pickSlot = -1;
      preloadArt();
      if (handlers.onOpen) handlers.onOpen();
      overlay.style.display = 'flex';
      measure();
      entryId = tab === 'progress' ? null : (items(tab)[0] || {}).id || null;
      render();
    },
    hide,
    isOpen() { return open; },
    /** Switch tab ('carried' | 'places' | 'people' | 'bestiary' | 'items' | 'traps' | 'progress') while open (tests, review). */
    setTab(t) { if (order().some((x) => x.id === t)) turnTo(t, 0, 1); },
    /** Open an entry's page by id (tests, review); the tab and grid page follow the entry. */
    showEntry(id) {
      for (const t of TABS) {
        const all = journal.tabList(t.id), i = all.findIndex((e) => e.id === id);
        if (i < 0) continue;
        tab = t.id; entryId = id; pickSlot = -1;
        if (open) { measure(); gpage = pageOfIndex(tab, i, all); if (mode === 'single') view = 'entry'; flip(1); render(); } else gpage = 0;
        return true;
      }
      return false;
    },
    /** Turn the page forward (+1) / back (-1). */
    turn,
    /** Select an entry on the current tab without changing page (tests); on the Carried page a card key ('slot:1', 'jet', 'item:flippers'). */
    select(id) { entryId = id; if (open) render(); },
    /** Redraw an open book (the carried state changed under it). */
    refresh() { if (open && !drag) render(); },
    tab() { return tab; },
    entry() { return entryId; },
    page() { return { tab, page: gpage, pages: pagesOf(tab), perPage, mode, view, pick: pickSlot }; },
    el: overlay,
  };
  return api;
}
