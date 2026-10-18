// The build picker (hub building, octomancer-web/HUB-BUILDING.md): the hand at a hub build spot opens it. Built on the looks
// picker (skin-picker.js): the same overlay, panel, card grid and detail line, and the same keys and pad actions. A card per
// decoration that fits the spot (hub-build.js pickerRows): its preview, its name and its cost in shells, plus Clear (free, no
// refund) when something stands there. A card not yet unlocked is a dark silhouette with '???'; one the hoard cannot pay for is
// dimmed. A / Enter / a click builds and closes; B / Esc / Close shut it. Plain HTML over the canvas.

import { pickerRows, CLEAR } from './hub-build.js';
import { paintDecoPreview } from './hub-build-draw.js';
import { onSpritesReady } from './sprites.js';
import { artUrl } from './v2-art.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
const SIL = '#2a1d16';
const SPOT_WORDS = { hook: 'A hook in the ceiling', niche: 'A niche in the wall', ledge: 'A spot on the floor', plaza: 'The plaza floor', mural: 'A bare stretch of wall' };
const shells = (n) => n + (n === 1 ? ' shell' : ' shells');

/** The detail line for a row: [title, text]. */
export function rowDetail(r, have) {
  if (r.id === CLEAR) return ['Clear', 'Take it down. Free, and the shells stay spent.'];
  if (r.lock === 'tier') return ['???', 'Bank ' + shells(r.toTier) + ' more from your dives to learn this one.'];
  if (r.lock === 'need') return ['???', r.deco.hint || 'Not yet.'];
  if (r.current) return [r.name + ' (built here)', 'Already standing on this spot.'];
  if (!r.afford) return [r.name, 'Costs ' + shells(r.cost) + ': ' + r.missing + ' more needed. The hoard holds ' + shells(have) + '.'];
  return [r.name, 'Costs ' + shells(r.cost) + '. The hoard holds ' + shells(have) + '.'];
}

/**
 * @param {HTMLElement} root the #hud element
 * @param {{table:any, ctx:()=>any, hoard:()=>{shells:number, lifetime:number}, onBuild:(spot:any, id:string)=>boolean,
 *          onRefuse?:()=>void, onOpen?:()=>void, onClose?:()=>void}} handlers
 */
export function createBuildPicker(root, handlers) {
  const overlay = el('div', 'octo-overlay octo-skins-overlay octo-build-overlay');
  overlay.dataset.octoModal = '1';
  overlay.style.display = 'none';
  const panel = el('div', 'octo-overlay-panel octo-skins-panel octo-build-panel');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Build');
  const banner = el('div', 'octo-banner octo-skins-banner');
  banner.appendChild(el('div', 'octo-banner-text', 'Build'));
  const sub = el('div', 'octo-skins-sub octo-build-sub');
  const grid = el('div', 'octo-skins-grid'); grid.setAttribute('role', 'listbox');
  const detail = el('div', 'octo-skins-detail');
  const closeBtn = el('button', 'octo-btn-wide octo-skins-close', 'Close'); closeBtn.type = 'button';
  panel.append(banner, sub, grid, detail, closeBtn);
  overlay.appendChild(panel);
  root.appendChild(overlay);

  let open = false, focus = 0, rows = [], spot = null, current = '';
  const cards = [];

  function build() {
    const hoard = handlers.hoard();
    rows = pickerRows(handlers.table, spot, current, hoard, handlers.ctx());
    sub.textContent = (SPOT_WORDS[spot.type] || 'A spot') + ' - the hoard holds ' + shells(hoard.shells) + '.';
    grid.textContent = ''; cards.length = 0;
    rows.forEach((r, i) => {
      const b = el('button', 'octo-skin-card octo-build-card'); b.type = 'button'; b.dataset.deco = r.id;
      b.setAttribute('role', 'option');
      const cv = el('canvas', 'octo-skin-cv'); cv.width = 128; cv.height = 128;
      const known = r.unlocked;
      b.append(cv, el('div', 'octo-skin-name', known ? r.name : '???'), el('div', 'octo-build-cost', r.id === CLEAR ? 'free' : known ? shells(r.cost) : ''));
      b.classList.toggle('is-locked', !known);
      b.classList.toggle('is-poor', known && !r.afford);
      b.classList.toggle('is-current', r.current);
      b.addEventListener('click', () => { focus = i; choose(i); });
      b.addEventListener('mouseenter', () => { focus = i; mark(); });
      grid.appendChild(b); cards.push({ b, cv, r });
    });
    paintAll(); mark();
  }
  function paintOne(c) {
    const g = c.cv.getContext('2d');
    if (c.r.id === CLEAR) { // a chalk cross: the bare spot
      g.clearRect(0, 0, c.cv.width, c.cv.height);
      g.strokeStyle = 'rgba(230,239,228,0.7)'; g.lineWidth = 5; g.lineCap = 'round'; g.setLineDash([12, 10]);
      g.beginPath(); g.arc(64, 70, 34, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(50, 56); g.lineTo(78, 84); g.moveTo(78, 56); g.lineTo(50, 84); g.stroke();
      return;
    }
    const ok = paintDecoPreview(c.cv, c.r.deco, spot.type);
    if (ok && !c.r.unlocked) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = SIL; g.fillRect(0, 0, c.cv.width, c.cv.height); g.restore(); }
  }
  function paintAll() { for (const c of cards) paintOne(c); }
  function mark() {
    cards.forEach((c, i) => { c.b.classList.toggle('is-focus', i === focus); c.b.setAttribute('aria-selected', i === focus ? 'true' : 'false'); });
    const r = rows[focus];
    detail.textContent = '';
    if (!r) return;
    const [t, x] = rowDetail(r, handlers.hoard().shells);
    detail.append(el('div', 'octo-skins-dname', t), el('div', 'octo-skins-dtext', x));
  }
  function choose(i) {
    const r = rows[i];
    if (!r) return false;
    if (!r.unlocked || !r.afford || r.current) { if (handlers.onRefuse) handlers.onRefuse(); mark(); return false; }
    const done = handlers.onBuild(spot, r.id);
    if (done) hide(); else mark();
    return done;
  }
  onSpritesReady(() => { if (open) paintAll(); });

  function move(dx, dy) {
    const cols = Math.max(1, Math.round(grid.clientWidth / ((cards[0] && cards[0].b.offsetWidth) || 120)) || 1);
    focus = Math.max(0, Math.min(cards.length - 1, focus + dx + dy * cols));
    mark();
  }
  function padAction(a) {
    if (!open) return false;
    const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[a];
    if (d) { move(d[0], d[1]); return true; }
    if (a === 'confirm') { choose(focus); return true; }
    return a !== 'back';
  }
  function onKey(e) {
    if (!open) return;
    if (e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF')) { e.preventDefault(); e.stopPropagation(); return; }
    let used = true;
    switch (e.code) {
      case 'ArrowRight': case 'KeyD': move(1, 0); break;
      case 'ArrowLeft': case 'KeyA': move(-1, 0); break;
      case 'ArrowDown': case 'KeyS': move(0, 1); break;
      case 'ArrowUp': case 'KeyW': move(0, -1); break;
      case 'Enter': case 'Space': case 'KeyF': choose(focus); break;
      case 'Escape': hide(); break;
      default: used = false;
    }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }
  window.addEventListener('keydown', onKey, true);

  /** Open the picker for `s` (a hub-build.js spot) with `cur` (the decoration standing there, or ''). */
  function show(s, cur) {
    if (open || !s) return false;
    open = true; spot = s; current = cur || '';
    banner.style.backgroundImage = `url(${artUrl('title-banner.webp')})`;
    build();
    // the focus starts on the piece standing there, else the first one the hoard can pay for, else the first
    const at = rows.findIndex((r) => r.current), can = rows.findIndex((r) => r.id !== CLEAR && r.unlocked && r.afford);
    focus = at >= 0 ? at : can >= 0 ? can : 0;
    mark();
    overlay.style.display = 'flex';
    if (handlers.onOpen) handlers.onOpen();
    return true;
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
    /** Tests: the cards as {id, name, cost, locked, poor, current}, the spot, the focus. */
    cards() { return cards.map((c) => ({ id: c.r.id, name: c.b.querySelector('.octo-skin-name').textContent, cost: c.r.cost, locked: !c.r.unlocked, poor: c.b.classList.contains('is-poor'), current: c.r.current })); },
    spot() { return spot ? spot.id : ''; }, focus() { return focus; },
    chooseIndex: choose, chooseId(id) { const i = rows.findIndex((r) => r.id === id); if (i < 0) return false; focus = i; return choose(i); },
    pad: padAction,
    padFocus() { return open && cards[focus] ? cards[focus].b : null; },
  };
}
