// The looks picker (2026-10-08, skins): the mirror shell in the hub (swim to it, F) and Settings > Looks open it. A card per skin
// (skins.js SKINS): the octopus's portrait in that skin, its name and whose it is; a locked skin is a dark silhouette with '???'
// and the hint the journal shows. A tap / click / Enter wears it at once (the octopus behind the panel changes); Esc / Close shut it.
// Plain HTML over the canvas, like the settings panel. The portraits are drawn into small card canvases once per open.

import { skinRows } from './skins.js';
import { drawOctopusPortrait, onOctopusReady } from './octopus-draw.js';
import { artUrl } from './v2-art.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const SIL = '#2a1d16'; // the locked silhouette's ink (the journal's locked plates are the same warm dark)

/** Draw a skin's portrait into a card canvas (`locked`: flat silhouette). Returns false before the octopus sheet is in. */
export function paintSkinCard(cv, id, locked) {
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  const ok = drawOctopusPortrait(g, id, cv.width / 2, cv.height * 0.6, cv.width * 0.86);
  if (ok && locked) { g.save(); g.globalCompositeOperation = 'source-in'; g.fillStyle = SIL; g.fillRect(0, 0, cv.width, cv.height); g.restore(); }
  return ok;
}

/**
 * @param {HTMLElement} root the #hud element
 * @param {{getUnlocked:()=>string[], getCurrent:()=>string, onWear:(id:string)=>void, onOpen?:()=>void, onClose?:()=>void}} handlers
 */
export function createSkinPicker(root, handlers) {
  const overlay = el('div', 'octo-overlay octo-skins-overlay');
  overlay.dataset.octoModal = '1';
  overlay.style.display = 'none';
  const panel = el('div', 'octo-overlay-panel octo-skins-panel');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Looks');
  const banner = el('div', 'octo-banner octo-skins-banner');
  banner.style.backgroundImage = `url(${artUrl('title-banner.webp')})`;
  banner.appendChild(el('div', 'octo-banner-text', 'Looks'));
  const sub = el('div', 'octo-skins-sub', 'Each friend you help gives you a look. Pick one to wear.');
  const grid = el('div', 'octo-skins-grid'); grid.setAttribute('role', 'listbox');
  const detail = el('div', 'octo-skins-detail');
  const closeBtn = el('button', 'octo-btn-wide octo-skins-close', 'Close'); closeBtn.type = 'button';
  panel.append(banner, sub, grid, detail, closeBtn);
  overlay.appendChild(panel);
  root.appendChild(overlay);

  let open = false, focus = 0, rows = [];
  const cards = [];

  function build() {
    rows = skinRows(handlers.getUnlocked(), handlers.getCurrent());
    grid.textContent = ''; cards.length = 0;
    rows.forEach((r, i) => {
      const b = el('button', 'octo-skin-card'); b.type = 'button'; b.dataset.skin = r.id;
      b.setAttribute('role', 'option');
      const cv = el('canvas', 'octo-skin-cv'); cv.width = 128; cv.height = 128;
      b.append(cv, el('div', 'octo-skin-name', r.unlocked ? r.name : '???'));
      b.classList.toggle('is-locked', !r.unlocked);
      b.addEventListener('click', () => { focus = i; wear(i); });
      b.addEventListener('mouseenter', () => { focus = i; showDetail(); });
      grid.appendChild(b); cards.push({ b, cv, r });
    });
    paintAll(); mark();
  }
  function paintAll() { for (const c of cards) paintSkinCard(c.cv, c.r.id, !c.r.unlocked); }
  function mark() {
    const cur = handlers.getCurrent();
    cards.forEach((c, i) => {
      c.b.classList.toggle('is-current', c.r.id === cur);
      c.b.classList.toggle('is-focus', i === focus);
      c.b.setAttribute('aria-selected', c.r.id === cur ? 'true' : 'false');
    });
    showDetail();
  }
  function showDetail() {
    const r = rows[focus];
    detail.textContent = '';
    if (!r) return;
    if (r.unlocked) {
      detail.append(el('div', 'octo-skins-dname', r.name + (r.id === handlers.getCurrent() ? ' (worn)' : '')), el('div', 'octo-skins-dtext', r.text));
    } else {
      detail.append(el('div', 'octo-skins-dname', '???'), el('div', 'octo-skins-dtext', 'Not yet. ' + r.hint));
    }
  }
  function wear(i) {
    const r = rows[i];
    if (!r || !r.unlocked) { mark(); return false; }
    handlers.onWear(r.id);
    mark();
    return true;
  }
  onOctopusReady(() => { if (open) paintAll(); });

  function onKey(e) {
    if (!open) return;
    if (e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF')) { e.preventDefault(); e.stopPropagation(); return; } // the F that opened it, held
    const cols = Math.max(1, Math.round(grid.clientWidth / ((cards[0] && cards[0].b.offsetWidth) || 120)) || 1);
    let used = true;
    switch (e.code) {
      case 'ArrowRight': case 'KeyD': focus = Math.min(cards.length - 1, focus + 1); mark(); break;
      case 'ArrowLeft': case 'KeyA': focus = Math.max(0, focus - 1); mark(); break;
      case 'ArrowDown': case 'KeyS': focus = Math.min(cards.length - 1, focus + cols); mark(); break;
      case 'ArrowUp': case 'KeyW': focus = Math.max(0, focus - cols); mark(); break;
      case 'Enter': case 'Space': case 'KeyF': wear(focus); break;
      case 'Escape': hide(); break;
      default: used = false;
    }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }
  window.addEventListener('keydown', onKey, true);

  function show() {
    if (open) return;
    open = true;
    build();
    focus = Math.max(0, rows.findIndex((r) => r.current));
    mark();
    overlay.style.display = 'flex';
    if (handlers.onOpen) handlers.onOpen();
  }
  function hide() {
    if (!open) return;
    open = false;
    overlay.style.display = 'none';
    if (document.activeElement && overlay.contains(document.activeElement)) document.activeElement.blur();
    if (handlers.onClose) handlers.onClose();
  }
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });

  return {
    show, hide, isOpen() { return open; }, el: overlay,
    /** Tests: the cards as {id, unlocked, current, name}. */
    cards() { return cards.map((c) => ({ id: c.r.id, unlocked: c.r.unlocked, current: c.b.classList.contains('is-current'), name: c.b.querySelector('.octo-skin-name').textContent })); },
    wearIndex: wear, focus() { return focus; },
  };
}
