// Local co-op, Phase 1 (octomancer-web/MULTIPLAYER-PLAN.md): the two bits of DOM co-op adds.
//  1. The pause menu's player rows (the only place to join or leave, Daniel's rule: no popup in the world): one row per player
//     with their colour, device and hearts (or "out" when dead until the next level), a Remove button, and the Add line (the free
//     devices only: "press A on a pad or Enter on the keyboard", less once a device plays). The buttons are ordinary buttons, so
//     the pad's menu cursor (menu-nav.js) walks them.
//  2. The HUD strips: with two or more players, one compact strip per player along the top in the player's colour (hearts,
//     bombs, the jar and its casts, the selected hotbar slot), each on one line; a lost heart pulses. Solo shows none of it.
// DOM only, keyed writes (a strip's text changes only when its value does), no per-frame layout.

import { PLAYER_COLOURS, KEYBOARD } from './players.js';
import { drawSpellIcon, drawBombSlotIcon, drawJarIcon } from './spell-icons.js';
import { onSpritesReady } from './sprites.js';

const asset = (p) => new URL(p, import.meta.url).href;
const HEART_SRC = asset('../assets/ui-heart.webp');

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

/** `deviceName(dev)`: 'Keyboard' | 'Pad' | 'Any'. */
export function deviceName(dev, style = 'xbox') {
  if (dev === null || dev === undefined) return 'Any device';
  if (dev === KEYBOARD) return 'Keyboard';
  return style === 'ps' ? 'PlayStation pad' : 'Pad';
}

/** The Add line names only the devices that are still free: the keyboard drops out once it plays, "a pad" becomes "another pad". */
export function addLine(rows) {
  const kb = rows.some((r) => r.device === KEYBOARD), pads = rows.some((r) => r.device && r.device !== KEYBOARD);
  return 'Add player: press A on ' + (pads ? 'another pad' : 'a pad') + (kb ? '' : ' or Enter on the keyboard');
}

/**
 * @param {HTMLElement} hudEl the #hud root
 * @param {{ onRemove(slot: number): void }} handlers
 */
export function createCoopUI(hudEl, handlers) {
  // --- 1. pause rows: put inside the pause card, above its buttons
  const box = el('div', 'octo-coop');
  box.addEventListener('click', (e) => e.stopPropagation()); // a click here is not "tap to resume"
  const list = el('div', 'octo-coop-rows');
  const add = el('div', 'octo-coop-add');
  box.append(list, add);
  let placed = false;
  function place() {
    if (placed) return;
    const panel = hudEl.querySelector('.octo-pause-overlay .octo-overlay-panel');
    const btns = panel && panel.querySelector('.octo-pause-btns');
    if (!panel || !btns) return;
    panel.insertBefore(box, btns);
    placed = true;
  }
  let rowsKey = '';
  /** rows: [{slot, device, style, hearts, heartMax, dead}] in slot order; `full`: four already play. */
  function setRows(rows, full) {
    place();
    const k = JSON.stringify(rows) + full;
    if (k === rowsKey) return;
    rowsKey = k;
    list.textContent = '';
    const solo = rows.length <= 1;
    box.classList.toggle('octo-coop-solo', solo);
    if (!solo) for (const r of rows) {
      const c = PLAYER_COLOURS[r.slot];
      const row = el('div', 'octo-coop-row');
      row.dataset.slot = String(r.slot);
      const dot = el('span', 'octo-coop-dot'); dot.style.background = c.ui;
      const name = el('span', 'octo-coop-name', 'P' + (r.slot + 1));
      const dev = el('span', 'octo-coop-dev', deviceName(r.device, r.style));
      const st = el('span', 'octo-coop-state', r.dead ? 'out' : r.hearts + ' / ' + r.heartMax);
      if (!r.dead) { const h = el('img', 'octo-coop-heart'); h.src = HEART_SRC; h.alt = ''; st.prepend(h); }
      const rm = el('button', 'octo-coop-remove', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', (e) => { e.stopPropagation(); handlers.onRemove(r.slot); });
      row.append(dot, name, dev, st, rm);
      list.append(row);
    }
    add.textContent = full ? 'Four players: the party is full' : addLine(rows);
  }

  // --- 2. HUD strips
  const strips = el('div', 'octo-coop-hud');
  strips.style.display = 'none';
  hudEl.appendChild(strips);
  const made = [];
  function strip(i) {
    if (made[i]) return made[i];
    const s = el('div', 'octo-coop-strip');
    const tag = el('span', 'octo-coop-tag');
    const heart = el('img', 'octo-coop-heart'); heart.src = HEART_SRC; heart.alt = '';
    const hearts = el('span', 'octo-coop-n');
    const bombC = el('canvas', 'octo-coop-icon'); bombC.width = bombC.height = 40;
    const bombs = el('span', 'octo-coop-n');
    const hb = el('span', 'octo-coop-hb'); hb.append(heart, hearts); // the heart and its number pulse together on a lost heart
    const jarC = el('canvas', 'octo-coop-icon octo-coop-jarc'); jarC.width = 30; jarC.height = 40; // the solo HUD's jar, not a word
    const jar = el('span', 'octo-coop-n octo-coop-jar');
    const slotC = el('canvas', 'octo-coop-icon octo-coop-slot'); slotC.width = slotC.height = 40;
    s.append(tag, hb, bombC, bombs, jarC, jar, slotC);
    strips.appendChild(s);
    return (made[i] = { s, tag, hb, hearts, bombs, jar, bombC, jarC, slotC, k: {} });
  }
  /** players: [{slot, hearts, dead, bombs, casts, slotId}] (solo or none: the strips hide). */
  function update(players) {
    const on = players.length > 1;
    if (strips.style.display !== (on ? '' : 'none')) { strips.style.display = on ? '' : 'none'; hudEl.classList.toggle('octo-coop-on', on); }
    if (!on) return;
    strips.classList.toggle('octo-coop-small', players.length > 2);
    for (let i = 0; i < made.length; i++) if (made[i]) made[i].s.style.display = i < players.length ? '' : 'none';
    for (let i = 0; i < players.length; i++) {
      const p = players[i], m = strip(i), k = m.k, c = PLAYER_COLOURS[p.slot];
      if (k.slot !== p.slot) { k.slot = p.slot; m.s.style.setProperty('--coop', c.ui); m.s.style.setProperty('--coop-dark', c.dark); m.tag.textContent = 'P' + (p.slot + 1); }
      if (k.dead !== p.dead) { k.dead = p.dead; m.s.classList.toggle('octo-coop-out', !!p.dead); }
      const ht = p.dead ? 'out' : String(p.hearts);
      if (k.h !== ht) {
        // a lost heart: a short pulse (two classes with the same keyframes take turns, so it restarts without a reflow)
        if (!p.dead && k.slot === k.hs && k.hn > p.hearts) { k.flip = !k.flip; m.hb.classList.toggle('is-hit-a', k.flip); m.hb.classList.toggle('is-hit-b', !k.flip); }
        k.h = ht; k.hs = p.slot; k.hn = p.dead ? 0 : p.hearts; m.hearts.textContent = ht;
      }
      if (k.b !== p.bombs) { k.b = p.bombs; m.bombs.textContent = String(p.bombs); }
      if (!k.bombDrawn) { const g = m.bombC.getContext('2d'); g.clearRect(0, 0, 40, 40); drawBombSlotIcon(g, 20, 20, 17); k.bombDrawn = true; }
      if (!k.jarDrawn) { const g = m.jarC.getContext('2d'); g.clearRect(0, 0, 30, 40); drawJarIcon(g, 1, 1, 28, 38, 1, 0); k.jarDrawn = true; }
      const jt = String(p.casts);
      if (k.j !== jt) { k.j = jt; m.jar.textContent = jt; m.jarC.classList.toggle('is-empty', p.casts <= 0); }
      if (k.sl !== p.slotId) {
        k.sl = p.slotId;
        const g = m.slotC.getContext('2d'); g.clearRect(0, 0, 40, 40);
        if (p.slotId === 'bomb') drawBombSlotIcon(g, 20, 20, 17); else if (p.slotId) drawSpellIcon(g, p.slotId, 20, 20, 16);
      }
    }
  }
  /** The sprites came in: redraw the icons on the next update. */
  function refreshIcons() { for (const m of made) if (m) { m.k.bombDrawn = m.k.jarDrawn = false; m.k.sl = undefined; } }
  onSpritesReady(refreshIcons); // a strip made before the atlas came in redraws its painted icons
  return { setRows, update, refreshIcons, el: box, strips };
}
