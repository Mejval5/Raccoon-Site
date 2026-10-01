// Input layer: keyboard + touch + mouse, normalised to one shape for
// gameplay. OVERNIGHT.md §2 "Input": keyboard (arrows/WASD move, Z/Enter/
// Shift dash, Space/X bomb, Esc pause) and touch (floating joystick left
// half, Dash/Bomb buttons bottom-right). Gameplay only ever sees
// {move:{x,y}, dash, bomb, pause} with pressed/held flags.
//
// Round-8 addition (NIGHT-LOG.md item 4): mouse control, the same abstract
// actions as keyboard/touch -- hold the left button to swim toward the
// cursor (thrust scales with distance, like the touch joystick's own
// magnitude), right-click or double-click to dash, middle-click or the
// wheel to drop a bomb. This module only tracks the raw cursor position and
// the one-shot dash/bomb clicks; turning the cursor position into a
// world-space swim direction needs the octopus's current position and the
// camera, neither of which this module knows about, so main.js's step()
// calls `setMouseAim` once per fixed step with the already-computed
// direction (see camera.js's `screenToWorld`).

const MOVE_KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const DASH_KEYS = new Set(['KeyZ', 'Enter', 'ShiftLeft', 'ShiftRight']);
const BOMB_KEYS = new Set(['Space', 'KeyX']);
const PAUSE_KEYS = new Set(['Escape']);

function newButton() {
  return { pressed: false, held: false, released: false };
}

function pressButton(btn) {
  if (!btn.held) btn.pressed = true;
  btn.held = true;
}
function releaseButton(btn) {
  if (btn.held) btn.released = true;
  btn.held = false;
}

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    move: { x: 0, y: 0 },
    dash: newButton(),
    bomb: newButton(),
    pause: newButton(),
  };
  // Touch axis is set directly by touch-ui.js (analog), separate from the
  // keyboard's normalised digital vector, then combined in snapshot().
  const touch = { x: 0, y: 0, active: false, dash: newButton(), bomb: newButton() };
  // Mouse: `x`/`y` are the tracked cursor position in canvas BUFFER pixels
  // (device px, matching what render.js's camera works in), `active` is
  // whether the left button is currently held. `aim` is written once per
  // fixed step by main.js (`setMouseAim`, see the module comment above) with
  // the already-normalised-and-thrust-scaled direction toward the cursor.
  const mouse = { x: 0, y: 0, active: false, seen: false };
  let mouseAim = { x: 0, y: 0 };
  let mouseDashPressed = false;
  let mouseBombPressed = false;
  let usingTouch = false;
  let usingKeyboard = false;
  let usingMouse = false;
  const listeners = { modechange: [] };

  function setMode(mode) {
    if (mode === 'touch' && !usingTouch) { usingTouch = true; usingKeyboard = false; usingMouse = false; emit('touch'); }
    if (mode === 'keyboard' && !usingKeyboard) { usingKeyboard = true; usingTouch = false; usingMouse = false; emit('keyboard'); }
    if (mode === 'mouse' && !usingMouse) { usingMouse = true; usingTouch = false; usingKeyboard = false; emit('mouse'); }
  }
  function emit(mode) { for (const fn of listeners.modechange) fn(mode); }
  function onModeChange(fn) { listeners.modechange.push(fn); }

  function keyboardVector() {
    let x = 0, y = 0;
    for (const code of keys) {
      const v = MOVE_KEYS[code];
      if (v) { x += v[0]; y += v[1]; }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.target && e.target.closest && e.target.closest('[data-octo-modal]')) return; // typing in a menu (settings): not game input
    if (MOVE_KEYS[e.code] || DASH_KEYS.has(e.code) || BOMB_KEYS.has(e.code) || PAUSE_KEYS.has(e.code)) {
      setMode('keyboard');
      keys.add(e.code);
      if (DASH_KEYS.has(e.code)) pressButton(state.dash);
      if (BOMB_KEYS.has(e.code)) pressButton(state.bomb);
      if (PAUSE_KEYS.has(e.code)) pressButton(state.pause);
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (DASH_KEYS.has(e.code)) releaseButton(state.dash);
    if (BOMB_KEYS.has(e.code)) releaseButton(state.bomb);
    if (PAUSE_KEYS.has(e.code)) releaseButton(state.pause);
  }
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);

  // --- Mouse (round-8, item 4): hold left = swim toward cursor, right-click
  // or double-click = dash, middle-click or wheel = bomb. Bound to the
  // canvas element (not `window`) so page chrome outside the game never
  // steals a click, except `mousemove`/`mouseup`, tracked on `window` too so
  // dragging the cursor off-canvas while the button is still held doesn't
  // silently freeze the swim direction.
  if (canvas) {
    const toBufferPx = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width > 0 ? canvas.width / rect.width : 1;
      const sy = rect.height > 0 ? canvas.height / rect.height : 1;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        setMode('mouse');
        mouse.active = true;
        const p = toBufferPx(e);
        mouse.x = p.x; mouse.y = p.y; mouse.seen = true;
        e.preventDefault();
      } else if (e.button === 1) {
        setMode('mouse');
        mouseBombPressed = true;
        e.preventDefault();
      } else if (e.button === 2) {
        setMode('mouse');
        mouseDashPressed = true;
        e.preventDefault();
      }
    });
    window.addEventListener('mousemove', (e) => {
      // always tracked (a bomb is thrown toward the cursor even when the swim button is up); `active` still gates swimming
      const p = toBufferPx(e);
      mouse.x = p.x; mouse.y = p.y; mouse.seen = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) mouse.active = false;
    });
    // Double-click also dashes (alongside right-click); most browsers fire
    // this after two 'click's (left button only), so no separate button
    // check is needed the way mousedown's chord dispatch above needs one.
    canvas.addEventListener('dblclick', () => { setMode('mouse'); mouseDashPressed = true; });
    // Right-click is the dash button here, not a context menu.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      setMode('mouse');
      mouseBombPressed = true;
      e.preventDefault();
    }, { passive: false });
  }
  /** Called once per fixed step by main.js (needs the octopus's current
   * position and the camera, neither of which this module has) with the
   * already-normalised, thrust-scaled direction from the octopus toward the
   * tracked cursor position; a no-op while the left button isn't held. */
  function setMouseAim(x, y) { mouseAim = { x, y }; }

  // Test / override hook: __octo.input(actions) merges synthetic actions in
  // for one snapshot. null clears it.
  let override = null;
  function setOverride(actions) { override = actions; }

  /** Called once per fixed step by main.js; returns the frame's input and
   * clears the one-shot `pressed` edges. */
  function snapshot() {
    const kb = keyboardVector();
    const move = usingMouse && mouse.active ? mouseAim
      : usingTouch && touch.active
      ? { x: touch.x, y: touch.y }
      : kb;
    const out = {
      move,
      dash: { pressed: state.dash.pressed || touch.dash.pressed || mouseDashPressed, held: state.dash.held || touch.dash.held },
      bomb: { pressed: state.bomb.pressed || touch.bomb.pressed || mouseBombPressed, held: state.bomb.held || touch.bomb.held },
      pause: { pressed: state.pause.pressed, held: state.pause.held },
      mode: usingTouch ? 'touch' : usingMouse ? 'mouse' : 'keyboard',
    };
    // Clear one-shot edges after reading.
    state.dash.pressed = false; state.bomb.pressed = false; state.pause.pressed = false;
    touch.dash.pressed = false; touch.bomb.pressed = false;
    mouseDashPressed = false; mouseBombPressed = false;

    if (override) {
      const o = override;
      return {
        move: o.move ? { x: o.move.x, y: o.move.y } : out.move,
        dash: o.dash !== undefined ? { pressed: !!o.dash, held: !!o.dash } : out.dash,
        bomb: o.bomb !== undefined ? { pressed: !!o.bomb, held: !!o.bomb } : out.bomb,
        pause: o.pause !== undefined ? { pressed: !!o.pause, held: !!o.pause } : out.pause,
        mode: 'test',
      };
    }
    return out;
  }

  function debugKeys() {
    return Array.from(keys);
  }

  return {
    snapshot,
    setOverride,
    onModeChange,
    mode() { return usingTouch ? "touch" : usingMouse ? "mouse" : usingKeyboard ? "keyboard" : ""; },
    setMode,
    setMouseAim,
    debugKeys,
    // touch-ui.js writes into these directly:
    touch,
    // main.js reads `mouse.active`/`mouse.x`/`mouse.y` each fixed step to
    // compute the world-space aim direction it passes to `setMouseAim`.
    mouse,
  };
}
