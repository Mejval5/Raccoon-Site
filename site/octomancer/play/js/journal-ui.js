// The journal book (round 38, modelled on the Spelunky 2 journal): tabs Places, People, Bestiary, Items, Traps and a
// Progress page. A tab is a grid of cards: the entry's picture (the real sprite where there is one), or a dark
// silhouette with '???' until it has been met. Tapping a card opens its page: big picture, name, description and the
// counters (seen, defeated, defeated you, collected). Plain HTML over the canvas; opened from the hub board and the
// pause menu.

import { TABS, STAT_SEEN, STAT_KILLED, STAT_KILLED_BY, STAT_COLLECTED, CAT_CREATURE, CAT_HAZARD, CAT_ITEM, CAT_LOOT, CAT_PERSON, CAT_PLACE } from './journal.js';
import { entryArt, onArtReady, preloadArt } from './journal-art.js';
import { statsRows, bestRunLines, formatTime, depthLabel } from './runstats.js';

const CARD_PX = 72, PAGE_PX = 132;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Counter rows for an entry page: [label, value] pairs that make sense for its category. */
export function counterRows(e) {
  const s = e.stats;
  switch (e.cat) {
    case CAT_CREATURE: return [['Seen', s[STAT_SEEN]], ['Defeated', s[STAT_KILLED]], ['Defeated you', s[STAT_KILLED_BY]]];
    case CAT_HAZARD: return [['Seen', s[STAT_SEEN]], ['Defeated you', s[STAT_KILLED_BY]]];
    case CAT_ITEM: case CAT_LOOT: return [['Seen', s[STAT_SEEN]], [e.id === 'item-bomb' ? 'Thrown' : e.cat === CAT_LOOT ? 'Opened' : 'Collected', s[STAT_COLLECTED]], ...(s[STAT_KILLED_BY] ? [['Defeated you', s[STAT_KILLED_BY]]] : [])];
    case CAT_PERSON: return [['Met', s[STAT_SEEN]], ['Freed', s[STAT_COLLECTED]]];
    case CAT_PLACE: return [['Visited', s[STAT_SEEN]]];
    default: return [];
  }
}

/**
 * @param {HTMLElement} root the #hud element
 * @param {ReturnType<import('./journal.js').createJournal>} journal
 * @param {{onClose?:()=>void, onOpen?:()=>void, getStats?:()=>{meta:any, bestRuns:any[]}}} handlers (getStats feeds the Progress page)
 */
export function createJournalScreen(root, journal, handlers = {}) {
  const overlay = el('div', 'octo-overlay octo-journal-overlay');
  overlay.dataset.octoModal = '1';
  overlay.style.display = 'none';
  const panel = el('div', 'octo-overlay-panel octo-journal-panel');
  const head = el('div', 'octo-journal-head');
  const title = el('div', 'octo-overlay-title octo-journal-title');
  const total = el('div', 'octo-journal-total');
  head.append(title, total);
  const tabs = el('div', 'octo-journal-tabs');
  const tabBtns = {};
  const allTabs = TABS.concat([{ id: 'progress', title: 'Progress' }]);
  for (const t of allTabs) {
    const b = el('button', 'octo-journal-tab');
    b.type = 'button'; b.dataset.tab = t.id;
    b.append(el('span', 'octo-journal-tabname', t.title), el('span', 'octo-journal-tabcount'));
    b.addEventListener('click', () => { setTab(t.id); });
    tabs.appendChild(b); tabBtns[t.id] = b;
  }
  if (!handlers.getStats) tabBtns.progress.style.display = 'none';
  const body = el('div', 'octo-journal-body');
  const close = el('button', 'octo-btn-wide octo-journal-close', 'Close');
  close.type = 'button';
  panel.append(head, tabs, body, close);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  let open = false, tab = TABS[0].id, entryId = null;

  function row(k, v) {
    const r = el('div', 'octo-stat-row');
    r.append(el('span', '', k), el('b', '', String(v)));
    return r;
  }
  function sub(text) { return el('div', 'octo-journal-cat', text); }
  function artCanvas(id, px, locked) {
    const c = el('canvas', 'octo-journal-art');
    c.width = c.height = px;
    c.getContext('2d').drawImage(entryArt(id, px, locked), 0, 0);
    return c;
  }

  function renderGrid() {
    const list = journal.tabList(tab);
    const grid = el('div', 'octo-journal-grid');
    for (const e of list) {
      const card = el('button', 'octo-journal-card' + (e.found ? '' : ' octo-journal-unknown'));
      card.type = 'button'; card.dataset.id = e.id;
      card.setAttribute('aria-label', e.found ? e.name : 'Undiscovered entry');
      card.append(artCanvas(e.id, CARD_PX, !e.found));
      if (!e.found) card.appendChild(el('span', 'octo-journal-q', '?'));
      card.appendChild(el('span', 'octo-journal-cardname', e.found ? e.name : '???'));
      card.addEventListener('click', () => { entryId = e.id; render(); body.scrollTop = 0; });
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  function renderEntry() {
    const list = journal.tabList(tab);
    const idx = list.findIndex((e) => e.id === entryId);
    const e = list[idx];
    if (!e) { entryId = null; renderGrid(); return; }
    const nav = el('div', 'octo-journal-nav');
    const back = el('button', 'octo-journal-navbtn', '‹ ' + TABS.find((t) => t.id === tab).title);
    back.type = 'button'; back.addEventListener('click', () => { entryId = null; render(); });
    const prev = el('button', 'octo-journal-navbtn octo-journal-navsq', '←'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous entry');
    const next = el('button', 'octo-journal-navbtn octo-journal-navsq', '→'); next.type = 'button'; next.setAttribute('aria-label', 'Next entry');
    prev.addEventListener('click', () => { entryId = list[(idx + list.length - 1) % list.length].id; render(); });
    next.addEventListener('click', () => { entryId = list[(idx + 1) % list.length].id; render(); });
    nav.append(back, prev, next);
    const page = el('div', 'octo-journal-page' + (e.found ? '' : ' octo-journal-unknown'));
    page.dataset.id = e.id;
    const art = artCanvas(e.id, PAGE_PX, !e.found);
    const artBox = el('div', 'octo-journal-pageart'); artBox.appendChild(art);
    if (!e.found) artBox.appendChild(el('span', 'octo-journal-q octo-journal-qbig', '?'));
    page.append(artBox, el('div', 'octo-journal-name', e.found ? e.name : '???'));
    if (e.found) {
      page.appendChild(el('div', 'octo-journal-text', e.text));
      const rows = el('div', 'octo-journal-counters');
      for (const [k, v] of counterRows(e)) rows.appendChild(row(k, v));
      page.appendChild(rows);
    } else page.appendChild(el('div', 'octo-journal-text', 'Not found yet. Keep exploring.'));
    body.append(nav, page);
  }

  function renderProgress() {
    const { meta, bestRuns } = handlers.getStats();
    const all = journal.count(), tot = journal.total();
    body.appendChild(sub('Completion'));
    const bar = el('div', 'octo-journal-bar'); const fill = el('div', 'octo-journal-barfill');
    fill.style.width = Math.round(100 * all / tot) + '%'; bar.appendChild(fill);
    body.append(row('Journal complete', Math.round(100 * all / tot) + '%'), bar);
    for (const t of TABS) { const p = journal.tabProgress(t.id); body.appendChild(row(t.title, p.found + ' / ' + p.total)); }
    body.appendChild(sub('Runs'));
    const s = statsRows(meta);
    const deaths = Object.values(meta.deaths).reduce((a, b) => a + b, 0);
    body.append(row('Deaths', deaths), row('Best depth', meta.bestDepth ? depthLabel(meta.bestDepth) : 'None yet'), row('Play time', formatTime(meta.time || 0)));
    for (const [k, v] of s.rows) if (k !== 'Best depth') body.appendChild(row(k, v));
    body.appendChild(sub('Deaths by cause'));
    if (!s.deaths.length) body.appendChild(row('None yet', ''));
    for (const [k, v] of s.deaths) body.appendChild(row(k, v));
    body.appendChild(sub('Best runs'));
    const lines = bestRunLines(bestRuns);
    if (!lines.length) body.appendChild(row('None yet', ''));
    for (const l of lines) body.appendChild(row(l, ''));
  }

  function render() {
    for (const t of allTabs) {
      tabBtns[t.id].classList.toggle('is-active', t.id === tab);
      const cnt = tabBtns[t.id].lastChild;
      if (t.id === 'progress') cnt.textContent = '';
      else { const p = journal.tabProgress(t.id); cnt.textContent = p.found + '/' + p.total; }
    }
    title.textContent = tab === 'progress' ? 'Progress' : 'Journal';
    total.textContent = journal.count() + ' / ' + journal.total();
    body.textContent = '';
    if (tab === 'progress' && handlers.getStats) renderProgress();
    else if (entryId) renderEntry();
    else renderGrid();
  }

  function setTab(t) {
    tab = t; entryId = null;
    if (open) { render(); body.scrollTop = 0; }
  }
  function hide() {
    if (!open) return;
    open = false;
    overlay.style.display = 'none';
    journal.flush();
    if (handlers.onClose) handlers.onClose();
  }
  close.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
  onArtReady(() => { if (open) { const st = body.scrollTop; render(); body.scrollTop = st; } });

  return {
    show(startTab) {
      open = true; tab = startTab || TABS[0].id; entryId = null;
      preloadArt();
      if (handlers.onOpen) handlers.onOpen();
      render(); overlay.style.display = 'flex'; body.scrollTop = 0;
    },
    hide,
    isOpen() { return open; },
    /** Switch tab ('places' | 'people' | 'bestiary' | 'items' | 'traps' | 'progress') while open (tests, review). */
    setTab,
    /** Open an entry's page by id (tests, review); the tab follows the entry. */
    showEntry(id) {
      for (const t of TABS) if (journal.tabList(t.id).some((e) => e.id === id)) { tab = t.id; entryId = id; if (open) render(); return true; }
      return false;
    },
    tab() { return tab; },
    entry() { return entryId; },
  };
}
