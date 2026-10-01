// Floating touch joystick (left half of the screen) + Dash/Bomb buttons
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
  const dashBtn = document.createElement('div');
  dashBtn.className = 'octo-btn';
  dashBtn.id = 'octo-dash-btn';
  dashBtn.textContent = 'Dash';
  const bombBtn = document.createElement('div');
  bombBtn.className = 'octo-btn';
  bombBtn.id = 'octo-bomb-btn';
  bombBtn.textContent = 'Bomb';

  for (const el of [base, nub, dashBtn, bombBtn]) {
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
    const btnSize = 64;
    const safeR = 16; // extra margin beyond env() safe area, in px
    dashBtn.style.width = dashBtn.style.height = btnSize + 'px';
    bombBtn.style.width = bombBtn.style.height = btnSize + 'px';
    dashBtn.style.right = `calc(env(safe-area-inset-right, 0px) + ${safeR + btnSize + 16}px)`;
    dashBtn.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${safeR}px)`;
    bombBtn.style.right = `calc(env(safe-area-inset-right, 0px) + ${safeR}px)`;
    bombBtn.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${safeR}px)`;
  }
  layoutButtons();
  window.addEventListener('resize', layoutButtons);

  function show() {
    if (visible) return;
    visible = true;
    dashBtn.style.display = 'flex';
    bombBtn.style.display = 'flex';
  }
  function hide() {
    visible = false;
    for (const el of [base, nub, dashBtn, bombBtn]) el.style.display = 'none';
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
    if (e.target === dashBtn) { pressBtn(dashBtn, input.touch.dash); capture(dashBtn, e.pointerId); return; }
    if (e.target === bombBtn) { pressBtn(bombBtn, input.touch.bomb); capture(bombBtn, e.pointerId); return; }
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
    if (e.target === dashBtn) releaseBtn(dashBtn, input.touch.dash);
    if (e.target === bombBtn) releaseBtn(bombBtn, input.touch.bomb);
  }
  for (const el of field === root ? [root] : [root, field]) {
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', endPointer, { passive: true });
    el.addEventListener('pointercancel', endPointer, { passive: true });
  }

  input.onModeChange((mode) => { if (mode === 'keyboard' || mode === 'mouse') hide(); });

  return { show, hide };
}
