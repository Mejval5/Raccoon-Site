// Settings panel (round 38): one overlay in the HUD layer, built from the SETTING_DEFS table. Styled like the journal
// and death screens (the generated title banner on top, the same panel). Every control applies at once through
// `handlers.set(key, value)`; opening pauses the game (main.js), the gear, Esc and the Close button close it.
// All targets are at least 44 px tall.

import { SETTING_DEFS, CONTROLS_HELP, cleanSeedText } from './settings.js';
import { artUrl } from './v2-art.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} root the #hud element
 * @param {{
 *   getAll: () => Record<string, any>,
 *   set: (key: string, value: any) => any,
 *   osReducedMotion: () => boolean,
 *   inputMode: () => string,
 *   onOpen?: () => void, onClose?: () => void,
 *   onResetProgress?: () => void, onOpenJournal?: () => void,
 * }} handlers
 */
export function createSettingsPanel(root, handlers) {
  const overlay = el('div', 'octo-overlay octo-settings-overlay');
  overlay.dataset.octoModal = '1'; // input.js ignores keys typed in here (arrow keys move sliders, not the octopus)
  overlay.style.display = 'none';
  const panel = el('div', 'octo-overlay-panel octo-settings-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Settings');

  const banner = el('div', 'octo-banner octo-settings-banner');
  banner.style.backgroundImage = `url(${artUrl('title-banner.webp')})`;
  banner.appendChild(el('div', 'octo-banner-text', 'Settings'));
  const body = el('div', 'octo-settings-body');
  const closeBtn = el('button', 'octo-btn-wide octo-settings-close', 'Close');
  closeBtn.type = 'button';
  panel.append(banner, body, closeBtn);
  overlay.appendChild(panel);
  root.appendChild(overlay);

  const ctl = {};
  let open = false;
  // three groups: sound + comfort | swimming + seed | controls + progress. One column on a tall screen; on a short landscape
  // phone the first two sit side by side and the third spans both (css), so little scrolling is needed.
  const colA = el('div', 'octo-set-col'), colB = el('div', 'octo-set-col'), colC = el('div', 'octo-set-col octo-set-wide');
  body.append(colA, colB, colC);
  let cur = colA;

  function heading(text) { cur.appendChild(el('div', 'octo-settings-head', text)); }
  function fmt(def, v) {
    if (def.key === 'sink') return v === 0 ? 'None' : v.toFixed(2);
    return Math.round(v * 100) + '%';
  }

  function buildRange(def) {
    const row = el('div', 'octo-set-row');
    const top = el('div', 'octo-set-top');
    const label = el('label', 'octo-set-label', def.label);
    const out = el('output', 'octo-set-out');
    const input = el('input', 'octo-set-range');
    input.type = 'range'; input.min = String(def.min); input.max = String(def.max); input.step = String(def.step);
    input.id = 'octo-set-' + def.key; label.htmlFor = input.id; input.dataset.setting = def.key;
    input.addEventListener('input', () => {
      const v = handlers.set(def.key, Number(input.value));
      out.textContent = fmt(def, v);
    });
    top.append(label, out);
    row.append(top, input);
    if (def.hint) row.appendChild(el('div', 'octo-set-hint', def.hint));
    cur.appendChild(row);
    ctl[def.key] = { def, row, input, out };
  }

  /** A toggle's shown state: reduced motion with no choice yet follows the OS. */
  function effectiveToggle(def) {
    const v = handlers.getAll()[def.key];
    if (def.key === 'reducedMotion' && (v === null || v === undefined)) return handlers.osReducedMotion();
    return !!v;
  }

  function buildToggle(def) {
    const row = el('div', 'octo-set-row');
    const sw = el('button', 'octo-switch');
    sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.dataset.setting = def.key;
    const label = el('span', 'octo-set-label', def.label);
    const tag = el('span', 'octo-set-tag');
    const knob = el('span', 'octo-switch-knob');
    sw.append(label, tag, knob);
    sw.addEventListener('click', () => {
      handlers.set(def.key, !effectiveToggle(def));
      refresh();
    });
    row.appendChild(sw);
    if (def.hint) row.appendChild(el('div', 'octo-set-hint', def.hint));
    cur.appendChild(row);
    ctl[def.key] = { def, row, sw, tag };
  }

  function buildSeed(def) {
    const row = el('div', 'octo-set-row');
    const label = el('label', 'octo-set-label', def.label);
    const line = el('div', 'octo-set-seedline');
    const input = el('input', 'octo-set-seed');
    input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.spellcheck = false;
    input.maxLength = 10; input.placeholder = 'Random';
    input.id = 'octo-set-' + def.key; label.htmlFor = input.id; input.dataset.setting = def.key;
    const clear = el('button', 'octo-set-clear', 'Random');
    clear.type = 'button';
    input.addEventListener('input', () => {
      const v = handlers.set(def.key, cleanSeedText(input.value));
      if (input.value !== v) input.value = v;
    });
    clear.addEventListener('click', () => { input.value = ''; handlers.set(def.key, ''); });
    line.append(input, clear);
    row.append(label, line);
    if (def.hint) row.appendChild(el('div', 'octo-set-hint', def.hint));
    cur.appendChild(row);
    ctl[def.key] = { def, row, input };
  }

  const byKey = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d]));
  heading('Sound');
  buildRange(byKey.musicVol); buildRange(byKey.sfxVol);
  heading('Comfort');
  buildToggle(byKey.shake); buildToggle(byKey.reducedMotion);
  cur = colB;
  heading('Swimming');
  buildRange(byKey.sink);
  heading('Next dive');
  buildSeed(byKey.seed);

  cur = colC;
  heading('Controls');
  const helpBlocks = {};
  for (const c of CONTROLS_HELP) {
    const box = el('div', 'octo-set-help');
    box.appendChild(el('div', 'octo-set-helptitle', c.title));
    for (const l of c.lines) box.appendChild(el('div', 'octo-set-helpline', l));
    cur.appendChild(box);
    helpBlocks[c.id] = box;
  }

  heading('Progress');
  const journalBtn = el('button', 'octo-btn-wide octo-btn-ghost octo-set-journal', 'Open the journal');
  journalBtn.type = 'button';
  journalBtn.addEventListener('click', () => { if (handlers.onOpenJournal) handlers.onOpenJournal(); });
  cur.appendChild(journalBtn);
  // 2026-10-08 skins: the looks picker (the hub's mirror shell opens the same one)
  if (handlers.onOpenLooks) {
    const looksBtn = el('button', 'octo-btn-wide octo-btn-ghost octo-set-looks', 'Looks');
    looksBtn.type = 'button';
    looksBtn.addEventListener('click', () => handlers.onOpenLooks());
    cur.appendChild(looksBtn);
  }
  const resetRow = el('div', 'octo-set-row octo-set-reset');
  const resetBtn = el('button', 'octo-btn-wide octo-btn-ghost octo-btn-danger', 'Reset progress');
  resetBtn.type = 'button';
  const confirmBox = el('div', 'octo-set-confirm');
  const confirmText = el('div', 'octo-set-confirmtext', '');
  const confirmYes = el('button', 'octo-btn-wide octo-btn-danger-solid', 'Yes, erase it all');
  confirmYes.type = 'button';
  const confirmNo = el('button', 'octo-btn-wide octo-btn-ghost', 'Keep my progress');
  confirmNo.type = 'button';
  confirmBox.append(confirmText, confirmYes, confirmNo);
  resetRow.append(resetBtn, confirmBox);
  cur.appendChild(resetRow);
  const ASK = 'Erase the journal, best runs, stats and the tutorial flag? This cannot be undone. Your settings stay.';
  function showConfirm(on) {
    confirmBox.style.display = on ? '' : 'none';
    resetBtn.style.display = on ? 'none' : '';
    confirmText.textContent = ASK;
    confirmYes.style.display = confirmNo.style.display = '';
    // the confirm is taller than the button it replaced and sits at the end of the scroll body: bring it into view
    if (on) confirmBox.scrollIntoView({ block: 'nearest' });
  }
  resetBtn.addEventListener('click', () => showConfirm(true));
  confirmNo.addEventListener('click', () => showConfirm(false));
  confirmYes.addEventListener('click', () => {
    confirmText.textContent = 'Progress erased.';
    confirmYes.style.display = confirmNo.style.display = 'none';
    if (handlers.onResetProgress) handlers.onResetProgress();
  });

  /** Push the stored values into the controls. */
  function refresh() {
    const all = handlers.getAll();
    for (const k of Object.keys(ctl)) {
      const c = ctl[k];
      if (c.def.kind === 'range') { c.input.value = String(all[k]); c.out.textContent = fmt(c.def, all[k]); }
      else if (c.def.kind === 'seed') { if (document.activeElement !== c.input) c.input.value = all[k]; }
      else {
        const on = effectiveToggle(c.def);
        c.sw.setAttribute('aria-checked', on ? 'true' : 'false');
        c.sw.classList.toggle('is-on', on);
        c.tag.textContent = k === 'reducedMotion' && (all[k] === null || all[k] === undefined) ? 'system' : on ? 'On' : 'Off';
      }
    }
    const mode = handlers.inputMode();
    for (const id of Object.keys(helpBlocks)) helpBlocks[id].classList.toggle('is-current', id === mode);
  }

  function show() {
    if (open) return;
    open = true;
    showConfirm(false);
    if (handlers.onOpen) handlers.onOpen();
    refresh();
    overlay.style.display = 'flex';
    body.scrollTop = 0;
    closeBtn.focus({ preventScroll: true });
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

  return { show, hide, toggle() { if (open) hide(); else show(); }, isOpen() { return open; }, refresh, el: overlay };
}
