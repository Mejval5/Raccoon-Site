// Local co-op, Phase 1 (octomancer-web/MULTIPLAYER-PLAN.md): the two bits of DOM co-op adds.
//  1. The pause menu's player rows (the only place to join or leave, Daniel's rule: no popup in the world): one row per player
//     with their colour, device and hearts (or "ghost" when dead until the next level), a Remove button, and the Add line. The
//     buttons are ordinary buttons, so the pad's menu cursor (menu-nav.js) walks them. Co-op polish: the Add line is a button
//     too, and joining is explicit: a free pad joins with Start, or with A while the Add line has the focus; the keyboard with
//     Enter there (or a click on it). A or Enter anywhere else is that button's own press (main.js menuPress / addFocused).
//  2. The HUD strips: with two or more players, one compact strip per player along the top in the player's colour (hearts,
//     bombs, the jar's casts, the selected hotbar slot). Solo shows none of it: the solo HUD is unchanged.
// DOM only, keyed writes (a strip's text changes only when its value does), no per-frame layout.

import { PLAYER_COLOURS, KEYBOARD } from './players.js';
import { drawSpellIcon, drawBombSlotIcon } from './spell-icons.js';

const asset = (p) => new URL(p, import.meta.url).href;
const HEART_SRC = asset('../assets/ui-heart.webp');

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

/** The HUD strip's ghost mark (a dead player, until the next level): a little floating octopus-ghost shape in the player's
 *  colour, drawn once into the strip's 40x40 canvas: a round head, three wavy tentacle tips, two dark eyes. */
function drawGhostMark(g, col) {
  g.clearRect(0, 0, 40, 40);
  g.save();
  g.globalAlpha = 0.9;
  g.fillStyle = col; g.strokeStyle = '#10202c'; g.lineWidth = 2.5; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(8, 22);
  g.arc(20, 18, 12, Math.PI, 0);
  g.lineTo(32, 31);
  g.quadraticCurveTo(29, 36, 26, 31); g.quadraticCurveTo(23, 36, 20, 31); g.quadraticCurveTo(17, 36, 14, 31); g.quadraticCurveTo(11, 36, 8, 31);
  g.closePath();
  g.fill(); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = '#eafffa';
  g.beginPath(); g.ellipse(15.5, 18, 3.2, 3.8, 0, 0, Math.PI * 2); g.ellipse(24.5, 18, 3.2, 3.8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#10202c';
  g.beginPath(); g.arc(16, 19, 1.6, 0, Math.PI * 2); g.arc(25, 19, 1.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** `deviceName(dev)`: 'Keyboard' | 'Pad' | 'Any'. */
export function deviceName(dev, style = 'xbox') {
  if (dev === null || dev === undefined) return 'Any device';
  if (dev === KEYBOARD) return 'Keyboard';
  return style === 'ps' ? 'PlayStation pad' : 'Pad';
}

/**
 * @param {HTMLElement} hudEl the #hud root
 * @param {{ onRemove(slot: number): void, onAdd?(): void }} handlers
 */
export function createCoopUI(hudEl, handlers) {
  // --- 1. pause rows: put inside the pause card, above its buttons
  const box = el('div', 'octo-coop');
  box.addEventListener('click', (e) => e.stopPropagation()); // a click here is not "tap to resume"
  const list = el('div', 'octo-coop-rows');
  const add = el('button', 'octo-coop-add');
  add.type = 'button';
  const addName = el('span', 'octo-coop-add-name', 'Add player');
  const addHow = el('span', 'octo-coop-add-how');
  add.append(addName, addHow);
  add.addEventListener('click', (e) => { e.stopPropagation(); if (handlers.onAdd) handlers.onAdd(); }); // a click (or Enter): the keyboard joins
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
  let addStyle = 'xbox';
  /** rows: [{slot, device, style, hearts, heartMax, dead}] in slot order; `full`: four already play; `style`: the pad make the
   *  Add line names ('xbox' | 'ps'). */
  function setRows(rows, full, style = addStyle) {
    place();
    addStyle = style;
    const k = JSON.stringify(rows) + full + style;
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
      const st = el('span', 'octo-coop-state', r.dead ? 'ghost' : r.hearts + ' / ' + r.heartMax);
      if (!r.dead) { const h = el('img', 'octo-coop-heart'); h.src = HEART_SRC; h.alt = ''; st.prepend(h); }
      const rm = el('button', 'octo-coop-remove', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', (e) => { e.stopPropagation(); handlers.onRemove(r.slot); });
      row.append(dot, name, dev, st, rm);
      list.append(row);
    }
    add.disabled = !!full;
    addName.textContent = full ? 'The party is full' : 'Add player';
    const A = style === 'ps' ? 'Cross' : 'A', S = style === 'ps' ? 'Options' : 'Menu';
    addHow.textContent = full ? 'four play' : S + ' on a free pad, or ' + A + ' / Enter here';
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
    const ghost = el('canvas', 'octo-coop-ghost'); ghost.width = ghost.height = 40; ghost.style.display = 'none'; // co-op Phase 2: a dead player's mark
    const hearts = el('span', 'octo-coop-n');
    const bombC = el('canvas', 'octo-coop-icon'); bombC.width = bombC.height = 40;
    const bombs = el('span', 'octo-coop-n');
    const jar = el('span', 'octo-coop-jar');
    const slotC = el('canvas', 'octo-coop-icon octo-coop-slot'); slotC.width = slotC.height = 40;
    s.append(tag, heart, ghost, hearts, bombC, bombs, jar, slotC);
    strips.appendChild(s);
    return (made[i] = { s, tag, heart, ghost, hearts, bombs, jar, bombC, slotC, k: {} });
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
      if (k.slot !== p.slot) { k.slot = p.slot; k.dead = undefined; m.s.style.setProperty('--coop', c.ui); m.s.style.setProperty('--coop-dark', c.dark); m.tag.textContent = 'P' + (p.slot + 1); }
      if (k.dead !== p.dead) {
        k.dead = p.dead; m.s.classList.toggle('octo-coop-out', !!p.dead);
        m.heart.style.display = p.dead ? 'none' : ''; m.ghost.style.display = p.dead ? '' : 'none';
        if (p.dead) drawGhostMark(m.ghost.getContext('2d'), c.ui);
      }
      const ht = p.dead ? 'ghost' : String(p.hearts);
      if (k.h !== ht) { k.h = ht; m.hearts.textContent = ht; }
      if (k.b !== p.bombs) { k.b = p.bombs; m.bombs.textContent = String(p.bombs); }
      if (!k.bombDrawn) { const g = m.bombC.getContext('2d'); g.clearRect(0, 0, 40, 40); drawBombSlotIcon(g, 20, 20, 17); k.bombDrawn = true; }
      const jt = p.casts + ' ink';
      if (k.j !== jt) { k.j = jt; m.jar.textContent = jt; }
      if (k.sl !== p.slotId) {
        k.sl = p.slotId;
        const g = m.slotC.getContext('2d'); g.clearRect(0, 0, 40, 40);
        if (p.slotId === 'bomb') drawBombSlotIcon(g, 20, 20, 17); else if (p.slotId) drawSpellIcon(g, p.slotId, 20, 20, 16);
      }
    }
  }
  /** The sprites came in: redraw the icons on the next update. */
  function refreshIcons() { for (const m of made) if (m) { m.k.bombDrawn = false; m.k.sl = undefined; } }
  return { setRows, update, refreshIcons, el: box, strips, addBtn: add };
}
