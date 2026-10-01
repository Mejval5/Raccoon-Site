// The journal book (round 38, modelled on the Spelunky 2 journal): an open book with two facing parchment pages inside the
// banner-art frame, chapter bookmarks on the right edge (Places, People, Bestiary, Items, Traps, Progress), a grid of
// entries on the left page and the selected entry on the right page (big picture, name, a short description and the
// counters). A locked entry is a clear silhouette with '???' until it has been met. Pages turn with the arrows, the
// arrow keys or a swipe, with a short flip. Phone portrait shows one page at a time (the grid, then the entry).
// Plain HTML over the canvas; opened from the hub board, the pause menu and the settings panel. The book has a fixed
// size, so the tabs never move: the pages scroll inside.

import { TABS, counterRows, completion, storyLines } from './journal.js';
import { entryArt, onArtReady, preloadArt } from './journal-art.js';
import { statsRows, bestRunLines, formatTime, depthLabel } from './runstats.js';
import { artUrl } from './v2-art.js';

const COLS = 3;
const CARD_H = 112;          // px per grid row (picture + name), for the rows-per-page estimate
const SWIPE_PX = 48;
const TAB_PROGRESS = { id: 'progress', title: 'Progress' };
const TAB_ORDER = TABS.concat([TAB_PROGRESS]);
const TAB_COLORS = { places: '#e3b25e', people: '#e58f7e', bestiary: '#86bd7c', items: '#74acd8', traps: '#b890d6', progress: '#dcd5ba' };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} root the #hud element
 * @param {ReturnType<import('./journal.js').createJournal>} journal
 * @param {{onClose?:()=>void, onOpen?:()=>void, getStats?:()=>{meta:any, bestRuns:any[]}, getStory?:()=>Record<string, number>, reducedMotion?:()=>boolean}} handlers
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
  for (const t of TAB_ORDER) {
    const b = el('button', 'octo-bk-tab'); b.type = 'button'; b.dataset.tab = t.id; b.setAttribute('role', 'tab');
    b.style.setProperty('--tab', TAB_COLORS[t.id] || '#ddd');
    b.append(el('span', 'octo-bk-tabname', t.title));
    b.addEventListener('click', () => { if (t.id !== tab) turnTo(t.id, 0, TAB_ORDER.findIndex((x) => x.id === t.id) > TAB_ORDER.findIndex((x) => x.id === tab) ? 1 : -1); });
    tabsEl.appendChild(b); tabBtns[t.id] = b;
  }
  if (!handlers.getStats) tabBtns.progress.style.display = 'none';
  book.append(ribbon, frame, tabsEl);
  overlay.appendChild(book);
  root.appendChild(overlay);

  let open = false;
  let tab = TABS[0].id;     // a TABS id or 'progress'
  let gpage = 0;            // grid page (progress: 0 / 1 = the two pages)
  let entryId = null;       // the selected entry (right page)
  let view = 'grid';        // single-page mode: 'grid' | 'entry' (progress: page 0 | 1 via gpage)
  let mode = 'spread';      // 'spread' | 'single'
  let perPage = COLS * 3;
  let flipTimer = 0, suppressClick = 0;

  const list = () => journal.tabList(tab);
  // Progress is two pages, both on screen in the spread; one at a time on a phone
  const pagesOf = (t) => (t === 'progress' ? (mode === 'spread' ? 1 : 2) : Math.max(1, Math.ceil(journal.tabList(t).length / perPage)));

  function measure() {
    mode = frame.clientWidth >= 600 ? 'spread' : 'single';
    book.dataset.mode = mode;
  }
  let fitting = false;
  /** Rows of cards that fit the left page (measured from a real card), so the grid never shows a cut-off row. */
  function fitRows(head, grid) {
    const card = grid.firstChild;
    if (fitting || !card || !card.offsetHeight) return false;
    const avail = pageL.clientHeight - head.offsetHeight - 14 - 26 - 12 - 6;
    const rows = Math.max(2, Math.min(5, Math.floor((avail + 8) / (card.offsetHeight + 8))));
    if (rows * COLS === perPage) return false;
    perPage = rows * COLS;
    const all = list(), i = all.findIndex((e) => e.id === entryId);
    gpage = i >= 0 ? Math.floor(i / perPage) : 0;
    return true;
  }

  function artCanvas(id, px, locked) {
    const c = el('canvas', 'octo-bk-art');
    c.width = c.height = px;
    c.getContext('2d').drawImage(entryArt(id, px, locked), 0, 0);
    return c;
  }
  const pageNo = (n, of) => el('div', 'octo-bk-no', of > 1 ? n + ' / ' + of : '');

  function renderGrid() {
    const all = list();
    const pages = pagesOf(tab);
    if (gpage >= pages) gpage = pages - 1;
    const slice = all.slice(gpage * perPage, (gpage + 1) * perPage);
    const tdef = TABS.find((t) => t.id === tab);
    const head = el('div', 'octo-bk-head');
    const p = journal.tabProgress(tab);
    head.append(el('span', 'octo-bk-title', tdef.title), el('span', 'octo-bk-count', p.found + ' / ' + p.total));
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
    pageL.replaceChildren(head, grid, pageNo(gpage + 1, pages));
    if (fitRows(head, grid)) { fitting = true; renderGrid(); fitting = false; }
  }

  function renderEntry() {
    const all = list();
    let e = all.find((x) => x.id === entryId);
    if (!e) { e = all[gpage * perPage] || all[0]; entryId = e ? e.id : null; }
    if (!e) { pageR.replaceChildren(); return; }
    const tdef = TABS.find((t) => t.id === tab);
    const idx = all.findIndex((x) => x.id === e.id);
    const box = el('div', 'octo-bk-entry' + (e.found ? '' : ' is-locked'));
    box.dataset.id = e.id;
    box.append(el('div', 'octo-bk-kicker', tdef.title + '  No. ' + (idx + 1)));
    const plate = el('div', 'octo-bk-plate octo-bk-plate-big');
    plate.appendChild(artCanvas(e.id, 192, !e.found));
    if (!e.found) plate.appendChild(el('span', 'octo-bk-q octo-bk-qbig', '?'));
    box.append(plate, el('div', 'octo-bk-name', e.found ? e.name : '???'));
    if (e.found) {
      box.appendChild(el('div', 'octo-bk-text', e.text));
      // a person's questline so far (Spelunky 2's People pages): what happened, from the save's story flags
      const lines = e.story && handlers.getStory ? storyLines(e, handlers.getStory()) : [];
      if (lines.length) {
        const story = el('div', 'octo-bk-story');
        story.appendChild(el('div', 'octo-bk-sub', 'Story so far'));
        const ul = el('ol', 'octo-bk-steps');
        for (const l of lines) ul.appendChild(el('li', '', l));
        story.appendChild(ul);
        box.appendChild(story);
      }
      const ledger = el('div', 'octo-bk-ledger');
      for (const [k, v] of counterRows(e)) {
        const r = el('div', 'octo-bk-lrow');
        r.append(el('span', 'octo-bk-lk', k), el('i', 'octo-bk-dots'), el('b', 'octo-bk-lv', String(v)));
        ledger.appendChild(r);
      }
      box.appendChild(ledger);
    } else {
      box.appendChild(el('div', 'octo-bk-text octo-bk-hint', 'Not found yet. Keep exploring.'));
    }
    pageR.replaceChildren(box);
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
    if (tab === 'progress') {
      if (mode === 'spread') gpage = 0;
      if (handlers.getStats) renderProgress();
      view = mode === 'single' ? (gpage === 1 ? 'entry' : 'grid') : 'grid';
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
    for (const t of TAB_ORDER) {
      if (t.id === 'progress' && !handlers.getStats) continue;
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
    if (t !== 'progress') { const all = journal.tabList(t); const e = all[page * perPage]; entryId = e ? e.id : null; }
    else entryId = null;
    view = 'grid';
    if (open) { flip(dir); render(); }
  }

  /** One page forward (+1) or back (-1) through the whole book. */
  function turn(dir) {
    if (!open) return false;
    if (mode === 'single' && tab !== 'progress' && view === 'entry') { moveEntry(dir); return true; }
    if (mode === 'single' && tab === 'progress' && dir > 0 && gpage === 0) { gpage = 1; flip(1); render(); return true; }
    if (mode === 'single' && tab === 'progress' && dir < 0 && gpage === 1) { gpage = 0; flip(-1); render(); return true; }
    const order = TAB_ORDER.filter((t) => t.id !== 'progress' || handlers.getStats);
    const ti = order.findIndex((t) => t.id === tab);
    const pages = pagesOf(tab);
    if (dir > 0) {
      if (gpage + 1 < pages && tab !== 'progress') turnTo(tab, gpage + 1, 1);
      else if (ti + 1 < order.length) turnTo(order[ti + 1].id, 0, 1);
      else return false;
    } else {
      if (gpage > 0 && tab !== 'progress') turnTo(tab, gpage - 1, -1);
      else if (ti > 0) { const pt = order[ti - 1].id; turnTo(pt, pt === 'progress' ? 1 : pagesOf(pt) - 1, -1); }
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
    entryId = all[j].id; gpage = Math.floor(j / perPage);
    flip(dir); render();
  }

  // swipe: a horizontal drag turns the page
  let sx = 0, sy = 0, sid = -1;
  spread.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; sid = e.pointerId; });
  spread.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sid) return;
    sid = -1;
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
    switch (e.code) {
      case 'ArrowRight': case 'KeyD': turn(1); break;
      case 'ArrowLeft': case 'KeyA': turn(-1); break;
      case 'ArrowDown': case 'KeyS': moveEntry(1); break;
      case 'ArrowUp': case 'KeyW': moveEntry(-1); break;
      case 'Backspace': if (mode === 'single' && view === 'entry') { view = 'grid'; render(); } else used = false; break;
      default: {
        const m = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
        const order = TAB_ORDER.filter((t) => t.id !== 'progress' || handlers.getStats);
        if (m && order[Number(m[1]) - 1]) turnTo(order[Number(m[1]) - 1].id, 0, Number(m[1]) - 1 > order.findIndex((t) => t.id === tab) ? 1 : -1);
        else used = false;
      }
    }
    if (used) e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  function hide() {
    if (!open) return;
    open = false;
    overlay.style.display = 'none';
    journal.flush();
    if (handlers.onClose) handlers.onClose();
  }
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
  onArtReady(() => { if (open) render(); });
  window.addEventListener('resize', () => { if (open) render(); });

  return {
    show(startTab) {
      open = true; tab = startTab && TAB_ORDER.some((t) => t.id === startTab) ? startTab : TABS[0].id; gpage = 0; view = 'grid';
      preloadArt();
      if (handlers.onOpen) handlers.onOpen();
      overlay.style.display = 'flex';
      measure();
      entryId = tab === 'progress' ? null : (journal.tabList(tab)[0] || {}).id || null;
      render();
    },
    hide,
    isOpen() { return open; },
    /** Switch tab ('places' | 'people' | 'bestiary' | 'items' | 'traps' | 'progress') while open (tests, review). */
    setTab(t) { if (TAB_ORDER.some((x) => x.id === t)) turnTo(t, 0, 1); },
    /** Open an entry's page by id (tests, review); the tab and grid page follow the entry. */
    showEntry(id) {
      for (const t of TABS) {
        const all = journal.tabList(t.id), i = all.findIndex((e) => e.id === id);
        if (i < 0) continue;
        tab = t.id; entryId = id; if (open) { measure(); gpage = Math.floor(i / perPage); if (mode === 'single') view = 'entry'; render(); } else gpage = 0;
        return true;
      }
      return false;
    },
    /** Turn the page forward (+1) / back (-1). */
    turn,
    /** Select an entry on the current tab without changing page (tests). */
    select(id) { entryId = id; if (open) render(); },
    tab() { return tab; },
    entry() { return entryId; },
    page() { return { tab, page: gpage, pages: pagesOf(tab), perPage, mode, view }; },
    el: overlay,
  };
}
