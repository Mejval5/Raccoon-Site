// Floating touch joystick (left half of the screen) + Jet/Dash/Use/Spell buttons
// (bottom-right, inside safe areas). Pointer Events, touch-action:none.
// Controls appear on first touch, hide on first keyboard input.
// OVERNIGHT.md §2 "Input", M0-2.

const MM_TO_PX = 96 / 25.4; // CSS px per mm at 96 CSS dpi
const STICK_RADIUS_MM = 12;

/**
 * @param root the #touch-ui layer (holds the Dash / Bomb buttons and the stick; it has pointer-events:none, only its
 *   children take events)
 * @param input the input layer
 * @param field the element touches land on for the floating stick (the game canvas). #touch-ui sits over the canvas
 *   but ignores pointers, so every touch goes to the canvas: the stick's listeners must be there, not on `root`.
 */
export function createTouchUI(root, input, field = root) {
  const stickRadius = STICK_RADIUS_MM * MM_TO_PX;
  let visible = false;

  const base = document.createElement('div');
  base.className = 'octo-stick-base';
  const nub = document.createElement('div');
  nub.className = 'octo-stick-nub';
  // The action buttons, bottom right in a 2 x 2 block (the stick owns the left half): Dash | Jet on the bottom row, Use | Spell
  // above. Jet (the ink jet) sits in the corner, under the thumb. `btn` is the input.touch button each one presses.
  // Controls 2026-10-08 (V2-PLAN 17): Use uses the selected hotbar slot (a spell casts, the bomb drops, or is thrown along the
  // held stick); Spell casts the selected / last spell and MORPHS into the hand (Grab / Talk / Throw, input.touch.hand) while
  // something is in reach and the octopus is nearly still, or something is carried (setHand).
  const BUTTONS = [
    { id: 'octo-dash-btn', label: 'Dash', btn: 'dash', col: 1, row: 0 },
    { id: 'octo-attack-btn', label: 'Jet', btn: 'attack', col: 0, row: 0 },
    { id: 'octo-use-btn', label: 'Use', btn: 'use', col: 1, row: 1 },
    { id: 'octo-spell-btn', label: 'Spell', btn: 'spell', col: 0, row: 1 },
  ];
  const HAND_LABEL = { grab: 'Grab', use: 'Talk', throw: 'Throw', enter: 'Enter' };
  const btnEls = BUTTONS.map((b) => {
    const e = document.createElement('div');
    e.className = 'octo-btn' + (b.btn === 'spell' ? ' octo-btn-spell' : '');
    e.id = b.id;
    e.textContent = b.label;
    return e;
  });
  const spellBtn = btnEls[3];

  for (const el of [base, nub, ...btnEls]) {
    el.style.display = 'none';
    root.appendChild(el);
  }

  function sizeStick(el, r) {
    el.style.width = el.style.height = r * 2 + 'px';
    el.style.marginLeft = el.style.marginTop = -r + 'px';
  }
  sizeStick(base, stickRadius);
  sizeStick(nub, stickRadius * 0.5);

  function layoutButtons() {
    const btnSize = 60, gap = 12;
    const safeR = 16; // extra margin beyond env() safe area, in px
    BUTTONS.forEach((b, i) => {
      const e = btnEls[i];
      e.style.width = e.style.height = btnSize + 'px';
      e.style.right = `calc(env(safe-area-inset-right, 0px) + ${safeR + b.col * (btnSize + gap)}px)`;
      e.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${safeR + b.row * (btnSize + gap)}px)`;
    });
  }
  layoutButtons();
  window.addEventListener('resize', layoutButtons);

  function show() {
    if (visible) return;
    visible = true;
    for (const e of btnEls) e.style.display = 'flex';
  }
  function hide() {
    visible = false;
    for (const el of [base, nub, ...btnEls]) el.style.display = 'none';
  }
  let handMode = '', useMode = '';
  const pressedBtn = new Map(); // pointerId -> the input.touch button it pressed (the Spell button may morph meanwhile)
  /** '' (a Spell button), 'grab', 'use' or 'throw' (the hand). */
  function setHand(mode) {
    mode = mode || '';
    if (mode === handMode) return;
    handMode = mode;
    spellBtn.textContent = mode ? HAND_LABEL[mode] : 'Spell';
    spellBtn.classList.toggle('octo-btn-hand', !!mode);
    spellBtn.dataset.hand = mode;
  }
  /** What the Use button does now: 'spell' | 'bomb' (its label). */
  function setUse(mode) {
    if (mode === useMode) return;
    useMode = mode;
    btnEls[2].textContent = mode === 'bomb' ? 'Bomb' : 'Use';
    btnEls[2].dataset.use = mode;
  }
  let spellReady = null;
  /** Whether the jar holds a cast for the selected spell (the Spell button is dimmed when it does not). */
  function setSpell(ready) {
    if (ready !== spellReady) { spellReady = ready; spellBtn.classList.toggle('is-empty', !ready); }
  }

  let stickPointerId = null;
  let originX = 0, originY = 0;

  function stickStart(x, y) {
    if (x > window.innerWidth / 2) return false; // left half only
    originX = x; originY = y;
    base.style.left = x + 'px';
    base.style.top = y + 'px';
    nub.style.left = x + 'px';
    nub.style.top = y + 'px';
    base.style.display = 'block';
    nub.style.display = 'block';
    return true;
  }
  function stickMove(x, y) {
    let dx = x - originX, dy = y - originY;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, stickRadius);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    nub.style.left = originX + nx * clamped + 'px';
    nub.style.top = originY + ny * clamped + 'px';
    input.touch.x = len > 0 ? nx * (clamped / stickRadius) : 0;
    input.touch.y = len > 0 ? ny * (clamped / stickRadius) : 0;
    input.touch.active = true;
  }
  function stickEnd() {
    base.style.display = 'none';
    nub.style.display = 'none';
    input.touch.x = 0;
    input.touch.y = 0;
    input.touch.active = false;
  }

  function pressBtn(el, btn) {
    el.classList.add('is-active');
    if (!btn.held) btn.pressed = true;
    btn.held = true;
  }
  function releaseBtn(el, btn) {
    el.classList.remove('is-active');
    btn.held = false;
  }

  // Touch only (a mouse or pen on the canvas is the mouse controls' business). The buttons are children of `root` (so
  // their events bubble to it); everything else lands on `field`. The same handlers serve both.
  function capture(el, id) { try { el.setPointerCapture(id); } catch (err) { /* a synthetic pointer cannot be captured */ } }
  function onDown(e) {
    if (e.pointerType !== 'touch') return;
    // no compatibility mouse events afterwards: they would switch the input mode to 'mouse' and hide these controls
    if (e.cancelable) e.preventDefault();
    show();
    input.setMode('touch');
    const bi = btnEls.indexOf(e.target);
    if (bi >= 0) {
      const name = bi === 3 && handMode ? 'hand' : BUTTONS[bi].btn;
      pressedBtn.set(e.pointerId, name);
      pressBtn(btnEls[bi], input.touch[name]); capture(btnEls[bi], e.pointerId); return;
    }
    if (stickPointerId === null && stickStart(e.clientX, e.clientY)) {
      stickPointerId = e.pointerId;
      capture(e.target, e.pointerId);
    }
  }
  function onMove(e) {
    if (e.pointerId === stickPointerId) stickMove(e.clientX, e.clientY);
  }
  function endPointer(e) {
    if (e.pointerId === stickPointerId) { stickEnd(); stickPointerId = null; }
    const bi = btnEls.indexOf(e.target);
    if (bi >= 0) { const name = pressedBtn.get(e.pointerId) || BUTTONS[bi].btn; pressedBtn.delete(e.pointerId); releaseBtn(btnEls[bi], input.touch[name]); }
  }
  for (const el of field === root ? [root] : [root, field]) {
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', endPointer, { passive: true });
    el.addEventListener('pointercancel', endPointer, { passive: true });
  }

  input.onModeChange((mode) => { if (mode === 'keyboard' || mode === 'mouse') hide(); });

  return { show, hide, setSpell, setHand, setUse, handMode: () => handMode };
}
