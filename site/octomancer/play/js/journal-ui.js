// Journal list screen (B1-4): plain HTML over the canvas, opened from the hub board.
// Discovered entries show their name and text, the rest show "???".

import { CATEGORIES, CATEGORY_TITLES } from './journal.js';
import { statsRows, bestRunLines } from './runstats.js';

/**
 * @param {HTMLElement} root the #hud element
 * @param {ReturnType<import('./journal.js').createJournal>} journal
 * @param {{onClose?:()=>void, onOpen?:()=>void, getStats?:()=>{meta:any, bestRuns:any[]}}} handlers (getStats feeds the Stats tab)
 */
export function createJournalScreen(root, journal, handlers = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'octo-overlay octo-journal-overlay';
  overlay.style.display = 'none';
  const panel = document.createElement('div');
  panel.className = 'octo-overlay-panel octo-journal-panel';
  const title = document.createElement('div');
  title.className = 'octo-overlay-title';
  const tabs = document.createElement('div');
  tabs.className = 'octo-journal-tabs';
  const tabEntries = document.createElement('button');
  const tabStats = document.createElement('button');
  for (const [b, label] of [[tabEntries, 'Entries'], [tabStats, 'Stats']]) {
    b.type = 'button'; b.className = 'octo-journal-tab'; b.textContent = label; tabs.appendChild(b);
  }
  tabs.style.display = handlers.getStats ? '' : 'none';
  const body = document.createElement('div');
  body.className = 'octo-journal-body';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'octo-btn-wide';
  close.textContent = 'Close';
  panel.append(title, tabs, body, close);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  let open = false;
  let tab = 'entries';

  function head(text) {
    const h = document.createElement('div');
    h.className = 'octo-journal-cat';
    h.textContent = text;
    body.appendChild(h);
  }
  function statRow(k, v) {
    const row = document.createElement('div');
    row.className = 'octo-stat-row';
    const a = document.createElement('span'); a.textContent = k;
    const b = document.createElement('b'); b.textContent = v;
    row.append(a, b);
    body.appendChild(row);
  }

  /** The Stats tab: lifetime totals, deaths by cause, the best runs (save.js meta). */
  function renderStats() {
    const { meta, bestRuns } = handlers.getStats();
    body.textContent = '';
    head('Runs');
    const s = statsRows(meta);
    for (const [k, v] of s.rows) statRow(k, v);
    head('Deaths by cause');
    if (!s.deaths.length) statRow('None yet', '');
    for (const [k, v] of s.deaths) statRow(k, v);
    head('Best runs');
    const lines = bestRunLines(bestRuns);
    if (!lines.length) statRow('None yet', '');
    for (const l of lines) statRow(l, '');
  }

  function render() {
    tabEntries.classList.toggle('is-active', tab === 'entries');
    tabStats.classList.toggle('is-active', tab === 'stats');
    if (tab === 'stats' && handlers.getStats) { title.textContent = 'Journal stats'; renderStats(); return; }
    title.textContent = 'Journal ' + journal.count() + '/' + journal.total();
    body.textContent = '';
    for (const cat of CATEGORIES) {
      const head = document.createElement('div');
      head.className = 'octo-journal-cat';
      head.textContent = CATEGORY_TITLES[cat];
      body.appendChild(head);
      for (const e of journal.list(cat)) {
        const row = document.createElement('div');
        row.className = 'octo-journal-entry' + (e.found ? '' : ' octo-journal-unknown');
        row.dataset.id = e.id;
        const name = document.createElement('div');
        name.className = 'octo-journal-name';
        name.textContent = e.found ? e.name : '???';
        const text = document.createElement('div');
        text.className = 'octo-journal-text';
        text.textContent = e.text;
        row.append(name);
        if (e.found) row.append(text);
        body.appendChild(row);
      }
    }
  }

  function hide() {
    if (!open) return;
    open = false;
    overlay.style.display = 'none';
    if (handlers.onClose) handlers.onClose();
  }
  tabEntries.addEventListener('click', () => { tab = 'entries'; render(); body.scrollTop = 0; });
  tabStats.addEventListener('click', () => { tab = 'stats'; render(); body.scrollTop = 0; });
  close.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });

  return {
    show() { open = true; tab = 'entries'; if (handlers.onOpen) handlers.onOpen(); render(); overlay.style.display = 'flex'; body.scrollTop = 0; },
    hide,
    isOpen() { return open; },
    /** Switch tab ('entries' | 'stats') while open (tests, review). */
    setTab(t) { tab = t; if (open) render(); },
  };
}
