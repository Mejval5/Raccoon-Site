// Journal list screen (B1-4): plain HTML over the canvas, opened from the hub board.
// Discovered entries show their name and text, the rest show "???".

import { CATEGORIES, CATEGORY_TITLES } from './journal.js';

/**
 * @param {HTMLElement} root the #hud element
 * @param {ReturnType<import('./journal.js').createJournal>} journal
 * @param {{onClose?:()=>void, onOpen?:()=>void}} handlers
 */
export function createJournalScreen(root, journal, handlers = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'octo-overlay octo-journal-overlay';
  overlay.style.display = 'none';
  const panel = document.createElement('div');
  panel.className = 'octo-overlay-panel octo-journal-panel';
  const title = document.createElement('div');
  title.className = 'octo-overlay-title';
  const body = document.createElement('div');
  body.className = 'octo-journal-body';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'octo-btn-wide';
  close.textContent = 'Close';
  panel.append(title, body, close);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  let open = false;

  function render() {
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
  close.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });

  return {
    show() { open = true; if (handlers.onOpen) handlers.onOpen(); render(); overlay.style.display = 'flex'; body.scrollTop = 0; },
    hide,
    isOpen() { return open; },
  };
}
