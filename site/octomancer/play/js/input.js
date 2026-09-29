// Input layer: keyboard + touch, normalised to one shape for gameplay.
// OVERNIGHT.md §2 "Input": keyboard (arrows/WASD move, Z/Enter/Shift dash,
// Space/X bomb, Esc pause) and touch (floating joystick left half, Dash/Bomb
// buttons bottom-right). Gameplay only ever sees
// {move:{x,y}, dash, bomb, pause} with pressed/held flags. Mouse: menus only.

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

export function createInput() {
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
  let usingTouch = false;
  let usingKeyboard = false;
  const listeners = { modechange: [] };

  function setMode(mode) {
    if (mode === 'touch' && !usingTouch) { usingTouch = true; usingKeyboard = false; emit('touch'); }
    if (mode === 'keyboard' && !usingKeyboard) { usingKeyboard = true; usingTouch = false; emit('keyboard'); }
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

  // Test / override hook: __octo.input(actions) merges synthetic actions in
  // for one snapshot. null clears it.
  let override = null;
  function setOverride(actions) { override = actions; }

  /** Called once per fixed step by main.js; returns the frame's input and
   * clears the one-shot `pressed` edges. */
  function snapshot() {
    const kb = keyboardVector();
    const move = usingTouch && touch.active
      ? { x: touch.x, y: touch.y }
      : kb;
    const out = {
      move,
      dash: { pressed: state.dash.pressed || touch.dash.pressed, held: state.dash.held || touch.dash.held },
      bomb: { pressed: state.bomb.pressed || touch.bomb.pressed, held: state.bomb.held || touch.bomb.held },
      pause: { pressed: state.pause.pressed, held: state.pause.held },
      mode: usingTouch ? 'touch' : 'keyboard',
    };
    // Clear one-shot edges after reading.
    state.dash.pressed = false; state.bomb.pressed = false; state.pause.pressed = false;
    touch.dash.pressed = false; touch.bomb.pressed = false;

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
    setMode,
    debugKeys,
    // touch-ui.js writes into these directly:
    touch,
  };
}
