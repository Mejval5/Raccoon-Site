// The spell hotbar on screen: carved stone slots for the spells, the bomb slot (active-use item) and the fish juice jar.
// update(state) is called every frame, so it only touches the DOM / redraws a canvas when its own key changed (as ui.js does).
// state = { slots, sel, spellName(id), bombs, bombMax, juice, cap, perCast }.

import { drawSpellIcon, drawJarIcon, drawBombSlotIcon } from './spell-icons.js';
import { onSpritesReady } from './sprites.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const ICON_PX = 48;                      // canvas size of a slot icon in css px (the css scales it down when compact)
const JAR_W = 22, JAR_H = 30;

function makeCanvas(w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = el('canvas');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, ctx, w, h };
}

/** @param {HTMLElement} root the #hud element @param {{onSelect:(i:number)=>void}} handlers */
export function createHotbarUI(root, handlers = {}) {
  const bar = el('div', 'octo-hotbar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Spells');
  const slotsEl = el('div', 'octo-hb-slots');
  const sep = el('div', 'octo-hb-sep');
  const bombSlot = el('div', 'octo-hb-slot octo-hb-bomb');
  const bombCv = makeCanvas(ICON_PX, ICON_PX);
  bombCv.c.className = 'octo-hb-icon';
  const drawBomb = () => { if (bombCv.ctx) { bombCv.ctx.clearRect(0, 0, ICON_PX, ICON_PX); drawBombSlotIcon(bombCv.ctx, ICON_PX / 2, ICON_PX / 2, ICON_PX * 0.36); } };
  drawBomb();
  const bombCount = el('span', 'octo-hb-count', '');
  const bombKey = el('span', 'octo-hb-key octo-hb-key-bomb', 'B');
  bombSlot.append(bombCv.c, bombCount, bombKey);
  const jarEl = el('div', 'octo-hb-jar');
  const jarCv = makeCanvas(JAR_W, JAR_H);
  jarCv.c.className = 'octo-hb-jarcv';
  const jarCasts = el('span', 'octo-hb-casts', '');
  jarEl.append(jarCv.c, jarCasts);
  bar.append(slotsEl, sep, bombSlot, jarEl);
  root.appendChild(bar);

  let slotKey = null;          // ids joined: rebuild the slot elements when this changes
  let selShown = -2;
  let bombKeyShown = null, jarKeyShown = null;
  let slotEls = [];
  let bombTextShown = '', castsShown = '';
  // the painted icons arrive with the atlas: redraw the bomb, rebuild the spell slots and the jar on the next update
  onSpritesReady(() => { drawBomb(); slotKey = null; jarKeyShown = null; });

  function setText(node, prev, text) { if (prev !== text) node.textContent = text; return text; }

  function buildSlots(state, key) {
    slotsEl.textContent = '';
    slotEls = state.slots.map((slot, i) => {
      const b = el('button', 'octo-hb-slot octo-hb-spell');
      b.type = 'button';
      b.dataset.slot = String(i);
      const id = slot.ids[0];
      const name = state.spellName ? state.spellName(id) : id;
      b.title = name; b.setAttribute('aria-label', name + ' (key ' + (i + 1) + ')');
      const cv = makeCanvas(ICON_PX, ICON_PX);
      cv.c.className = 'octo-hb-icon';
      if (cv.ctx) drawSpellIcon(cv.ctx, id, ICON_PX / 2, ICON_PX / 2, ICON_PX * 0.38);
      b.append(cv.c, el('span', 'octo-hb-key', String(i + 1)));
      b.addEventListener('click', () => { if (handlers.onSelect) handlers.onSelect(i); });
      slotsEl.appendChild(b);
      return b;
    });
    slotKey = key;
    selShown = -2;
  }

  return {
    el: bar,
    update(state) {
      const key = state.slots.map((s) => s.ids.join('+')).join(',');
      if (key !== slotKey) buildSlots(state, key);
      if (state.sel !== selShown) {
        for (let i = 0; i < slotEls.length; i++) {
          const on = i === state.sel;
          slotEls[i].classList.toggle('is-selected', on);
          slotEls[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        selShown = state.sel;
      }
      const bk = state.bombs + '/' + state.bombMax;
      if (bk !== bombKeyShown) {
        bombKeyShown = bk;
        bombTextShown = setText(bombCount, bombTextShown, bk);
        bombSlot.classList.toggle('is-empty', state.bombs <= 0);
        bombSlot.title = 'Bombs ' + bk + ' (B / X)';
      }
      const jk = state.juice + '|' + state.cap + '|' + state.perCast;
      if (jk !== jarKeyShown) {
        jarKeyShown = jk;
        const casts = Math.floor(state.juice / state.perCast), total = Math.round(state.cap / state.perCast);
        const ctx = jarCv.ctx;
        if (ctx) {
          ctx.clearRect(0, 0, JAR_W, JAR_H);
          drawJarIcon(ctx, 0, 0, JAR_W, JAR_H, state.cap > 0 ? state.juice / state.cap : 0, total);
        }
        castsShown = setText(jarCasts, castsShown, String(casts));
        jarEl.classList.toggle('is-empty', casts <= 0);
        jarEl.title = 'Fish juice: ' + casts + ' of ' + total + ' casts';
      }
    },
    /** The empty-jar feedback: restartable (remove, force a reflow, add). */
    shakeJar() {
      jarEl.classList.remove('octo-jar-shake');
      void jarEl.offsetWidth;
      jarEl.classList.add('octo-jar-shake');
    },
    setCompact(on) { bar.classList.toggle('is-compact', !!on); },
    setVisible(on) { bar.style.display = on ? '' : 'none'; },
  };
}
