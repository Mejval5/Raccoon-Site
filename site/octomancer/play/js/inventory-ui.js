// Inventory panel: the spell bar order (tap a row to select, arrows to reorder), the carried items and the fish juice jar.
// Rebuilt whole on show() / refresh() (those run on a change or a key press, never per frame), so it keeps no per-row state.
// state = hotbar state ({ slots, sel, spellName(id), bombs, bombMax, juice, cap, perCast }) plus { items, spellRow(id) -> row }.

import { ITEM_DEFS } from './items.js';
import { drawItemIcon } from './items-draw.js';
import { drawSpellIcon, drawJarIcon, drawBombSlotIcon, drawRuneBadge } from './spell-icons.js';
import { resolveSlot, modById } from './spells.js';
import { onSpritesReady } from './sprites.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function iconCanvas(px, draw) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = el('canvas', 'octo-inv-icon');
  c.width = Math.round(px * dpr); c.height = Math.round(px * dpr);
  const ctx = c.getContext('2d');
  if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(ctx, px); }
  return c;
}

/** Stack the flat item list into [id, count] pairs in first-seen order. */
function stackItems(items) {
  const m = new Map();
  for (const id of items || []) m.set(id, (m.get(id) || 0) + 1);
  return [...m];
}

/** @param {HTMLElement} root the #hud element @param {{onClose:()=>void, onMove:(from:number,to:number)=>void, onSelect:(i:number)=>void}} handlers */
export function createInventoryUI(root, handlers = {}) {
  const overlay = el('div', 'octo-overlay octo-inv-overlay');
  overlay.dataset.octoModal = '1'; // input.js ignores keys typed in here
  overlay.style.display = 'none';
  const panel = el('div', 'octo-inv');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Inventory');
  const head = el('div', 'octo-inv-head');
  head.append(el('div', 'octo-inv-title', 'Inventory'));
  const closeBtn = el('button', 'octo-inv-close', 'Close');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', () => { if (handlers.onClose) handlers.onClose(); });
  head.appendChild(closeBtn);
  const body = el('div', 'octo-inv-body');
  panel.append(head, body);
  overlay.appendChild(panel);
  // a tap on the dim backdrop closes it, like a page of the book
  overlay.addEventListener('click', (e) => { if (e.target === overlay && handlers.onClose) handlers.onClose(); });
  root.appendChild(overlay);

  let open = false;

  function spellRows(state) {
    const sec = el('section', 'octo-inv-sec');
    sec.appendChild(el('h3', 'octo-inv-h', 'Spells'));
    const n = state.slots.length;
    state.slots.forEach((slot, i) => {
      const fold = resolveSlot(slot.ids);
      const id = fold ? fold.spell.id : slot.ids[0];
      const row = state.spellRow ? state.spellRow(id) : null;
      const runes = slot.ids.filter((r) => modById(r));
      const li = el('div', 'octo-inv-row octo-inv-spell' + (i === state.sel ? ' is-selected' : ''));
      li.dataset.slot = String(i);
      li.appendChild(iconCanvas(40, (ctx, px) => {
        drawSpellIcon(ctx, id, px / 2, px * (runes.length ? 0.42 : 0.5), px * (runes.length ? 0.32 : 0.38));
        runes.forEach((r, k) => drawRuneBadge(ctx, r, px * (runes.length === 1 ? 0.5 : 0.33 + 0.34 * k), px * 0.84, px * 0.13, !!fold && fold.greyed.includes(r)));
      }));
      const text = el('div', 'octo-inv-text');
      text.append(el('div', 'octo-inv-name', (i + 1) + '. ' + (row ? row.name : id)));
      if (row && row.blurb) text.appendChild(el('div', 'octo-inv-blurb', row.blurb));
      if (runes.length) text.appendChild(el('div', 'octo-inv-meta', 'runes: ' + runes.map((r) => modById(r).name + (fold && fold.greyed.includes(r) ? ' (does nothing here)' : '')).join(', ')));
      if (row) { const c = fold ? fold.price : row.cost; text.appendChild(el('div', 'octo-inv-meta', 'costs ' + c + (c === 1 ? ' cast' : ' casts'))); }
      li.appendChild(text);
      const mv = el('div', 'octo-inv-moves');
      const up = el('button', 'octo-inv-move', '◀'); up.type = 'button'; up.dataset.dir = 'left';
      const dn = el('button', 'octo-inv-move', '▶'); dn.type = 'button'; dn.dataset.dir = 'right';
      up.setAttribute('aria-label', 'Move left'); dn.setAttribute('aria-label', 'Move right');
      up.disabled = i === 0; dn.disabled = i === n - 1;
      up.addEventListener('click', (e) => { e.stopPropagation(); if (handlers.onMove) handlers.onMove(i, i - 1); });
      dn.addEventListener('click', (e) => { e.stopPropagation(); if (handlers.onMove) handlers.onMove(i, i + 1); });
      mv.append(up, dn);
      li.appendChild(mv);
      li.addEventListener('click', () => { if (handlers.onSelect) handlers.onSelect(i); });
      sec.appendChild(li);
    });
    return sec;
  }

  function itemRows(state) {
    const sec = el('section', 'octo-inv-sec');
    sec.appendChild(el('h3', 'octo-inv-h', 'Items'));
    const bomb = el('div', 'octo-inv-row octo-inv-item octo-inv-bomb');
    bomb.appendChild(iconCanvas(40, (ctx, px) => drawBombSlotIcon(ctx, px / 2, px / 2, px * 0.38)));
    const bt = el('div', 'octo-inv-text');
    bt.append(el('div', 'octo-inv-name', 'Bombs ' + state.bombs + '/' + state.bombMax), el('div', 'octo-inv-blurb', state.touch ? 'throw one with the Bomb button' : 'throw one with B, X or the middle button'));
    bomb.append(bt, el('span', 'octo-inv-tag octo-inv-tag-active', 'active'));
    sec.appendChild(bomb);
    for (const [id, count] of stackItems(state.items)) {
      const def = ITEM_DEFS[id];
      if (!def) continue;
      const row = el('div', 'octo-inv-row octo-inv-item octo-inv-passive');
      row.dataset.item = id;
      row.appendChild(iconCanvas(40, (ctx, px) => drawItemIcon(ctx, id, px / 2, px / 2, px * 0.36)));
      const t = el('div', 'octo-inv-text');
      t.append(el('div', 'octo-inv-name', def.name + (count > 1 ? ' x' + count : '')), el('div', 'octo-inv-blurb', def.blurb));
      row.append(t, el('span', 'octo-inv-tag', 'passive'));
      sec.appendChild(row);
    }
    return sec;
  }

  function juiceRow(state) {
    const sec = el('section', 'octo-inv-sec');
    sec.appendChild(el('h3', 'octo-inv-h', 'Fish juice'));
    const row = el('div', 'octo-inv-row octo-inv-juice');
    const total = Math.round(state.cap / state.perCast), casts = Math.floor(state.juice / state.perCast);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = el('canvas', 'octo-inv-jar');
    c.width = Math.round(32 * dpr); c.height = Math.round(44 * dpr);
    const ctx = c.getContext('2d');
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawJarIcon(ctx, 0, 0, 32, 44, state.cap > 0 ? state.juice / state.cap : 0, total); }
    const t = el('div', 'octo-inv-text');
    t.append(el('div', 'octo-inv-name', casts + ' of ' + total + ' casts'), el('div', 'octo-inv-blurb', 'blended-up fishes: spells drink it; the spring at the end of a zone refills it'));
    row.append(c, t);
    sec.appendChild(row);
    return sec;
  }

  let lastState = null;
  function build(state) {
    lastState = state;
    body.textContent = '';
    body.append(spellRows(state), itemRows(state), juiceRow(state));
  }

  // the painted icons arrive with the atlas: redraw an open panel (a closed one is rebuilt on show)
  onSpritesReady(() => { if (open && lastState) { const y = body.scrollTop; build(lastState); body.scrollTop = y; } });

  return {
    el: overlay,
    show(state) { build(state); open = true; overlay.style.display = ''; body.scrollTop = 0; },
    hide() { open = false; overlay.style.display = 'none'; },
    isOpen() { return open; },
    /** Redraw with a new state while open (keeps the scroll position). */
    refresh(state) { if (!open) return; const y = body.scrollTop; build(state); body.scrollTop = y; },
  };
}
