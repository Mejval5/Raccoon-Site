// Input layer: keyboard + mouse + touch, normalised to one shape for gameplay. Gameplay only ever sees the snapshot:
// {move:{x,y}, dash, bomb, pause, attack, spell, use, hand, inventory (buttons with pressed/held/released), cycle, select,
// src, mode}.
//
// Controls (Daniel, 2026-10-08, V2-PLAN section 17 "the eighth tentacle"):
//   keyboard  WASD / arrows move; Space or Shift dash (Z and Enter still dash too: they confirm the end screens);
//             F the hand (grab / pick up / talk / buy; tap again to throw, hold to drop gently); J or K ink jet (the
//             facing direction); C use the selected hotbar slot (cast a spell, drop a bomb); B or X drop a bomb;
//             Q / E previous / next hotbar slot; 1-9 pick a hotbar slot; Tab or I the inventory; Esc pause.
//   mouse     left button ink jet toward the cursor (held: auto-repeat), right button use the selected hotbar slot toward
//             the cursor (a spell casts, a bomb is thrown), middle button the hand (as F: grab / talk / buy, again to throw
//             at the cursor, hold to drop; Daniel 2026-10-08: bombs only from their hotbar slot), wheel previous /
//             next hotbar slot. No steering with the mouse.
//   touch     stick on the left half; Jet (auto-aims), Dash, Use (the selected slot) and Spell (it turns into Grab /
//             Throw when something is in reach) buttons bottom right (touch-ui.js).
// `src` says where the last attack / spell / use / bomb press came from ('mouse' | 'key' | 'touch'), so main.js knows
// whether to aim at the cursor, along the facing / swim direction, or at the nearest enemy.

const MOVE_KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const DASH_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'KeyZ', 'Enter']);
const BOMB_KEYS = new Set(['KeyB', 'KeyX']);
const ATTACK_KEYS = new Set(['KeyJ', 'KeyK']);
const USE_KEYS = new Set(['KeyC']);
const HAND_KEYS = new Set(['KeyF']);
const INVENTORY_KEYS = new Set(['Tab', 'KeyI']);
const PAUSE_KEYS = new Set(['Escape']);
const CYCLE_KEYS = { KeyQ: -1, KeyE: 1 };
/** 'Digit1'..'Digit9' and the numpad -> hotbar slot 0..8. */
function slotOfKey(code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : -1;
}
const WHEEL_STEP = 100; // px of wheel delta per hotbar step (one notch of a mouse wheel; a trackpad needs a longer swipe)

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
/** A button read for one snapshot: pressed this step or held. */
function read(...bs) {
  let pressed = false, held = false;
  for (const b of bs) { pressed = pressed || b.pressed; held = held || b.held; }
  return { pressed, held };
}

export function createInput(canvas) {
  const keys = new Set();
  const kb = { dash: newButton(), bomb: newButton(), pause: newButton(), attack: newButton(), use: newButton(), hand: newButton(), inventory: newButton() };
  // Touch: the stick axis and the buttons are written directly by touch-ui.js.
  // `spell` casts the selected (or last) spell, `use` uses the selected hotbar slot, `hand` is the Spell button morphed into Grab / Throw.
  const touch = { x: 0, y: 0, active: false, dash: newButton(), bomb: newButton(), spell: newButton(), attack: newButton(), use: newButton(), hand: newButton() };
  // Mouse: `x`/`y` are the tracked cursor position in canvas BUFFER pixels (device px, what the camera works in).
  const mouse = { x: 0, y: 0, seen: false, attack: newButton(), use: newButton(), hand: newButton() };
  let cycle = 0, wheelAcc = 0, select = -1;
  const src = { attack: 'key', spell: 'key', bomb: 'key', use: 'key' };
  let usingTouch = false, usingKeyboard = false, usingMouse = false;
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

  function isGameKey(code) {
    return !!MOVE_KEYS[code] || DASH_KEYS.has(code) || BOMB_KEYS.has(code) || PAUSE_KEYS.has(code) || ATTACK_KEYS.has(code)
      || USE_KEYS.has(code) || HAND_KEYS.has(code) || INVENTORY_KEYS.has(code) || CYCLE_KEYS[code] !== undefined || slotOfKey(code) >= 0;
  }
  function onKeyDown(e) {
    if (e.repeat) { if (isGameKey(e.code)) e.preventDefault(); return; }
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (t && t.closest && t.closest('[data-octo-modal]') && (typing || !INVENTORY_KEYS.has(e.code))) return; // a menu has focus: not game input (Tab / I still close the inventory)
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser shortcuts (Ctrl+F, Alt+Tab ...) stay the browser's
    if (!isGameKey(e.code)) return;
    setMode('keyboard');
    keys.add(e.code);
    if (DASH_KEYS.has(e.code)) pressButton(kb.dash);
    if (BOMB_KEYS.has(e.code)) { pressButton(kb.bomb); src.bomb = 'key'; }
    if (PAUSE_KEYS.has(e.code)) pressButton(kb.pause);
    if (ATTACK_KEYS.has(e.code)) { pressButton(kb.attack); src.attack = 'key'; }
    if (USE_KEYS.has(e.code)) { pressButton(kb.use); src.use = 'key'; }
    if (HAND_KEYS.has(e.code)) pressButton(kb.hand);
    if (INVENTORY_KEYS.has(e.code)) pressButton(kb.inventory);
    if (CYCLE_KEYS[e.code] !== undefined) cycle += CYCLE_KEYS[e.code];
    const slot = slotOfKey(e.code);
    if (slot >= 0) select = slot;
    e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (DASH_KEYS.has(e.code) && ![...DASH_KEYS].some((k) => keys.has(k))) releaseButton(kb.dash);
    if (BOMB_KEYS.has(e.code)) releaseButton(kb.bomb);
    if (PAUSE_KEYS.has(e.code)) releaseButton(kb.pause);
    if (ATTACK_KEYS.has(e.code) && ![...ATTACK_KEYS].some((k) => keys.has(k))) releaseButton(kb.attack);
    if (USE_KEYS.has(e.code)) releaseButton(kb.use);
    if (HAND_KEYS.has(e.code)) releaseButton(kb.hand);
    if (INVENTORY_KEYS.has(e.code)) releaseButton(kb.inventory);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    // a key held while the window loses focus never gets its keyup: drop everything
    window.addEventListener('blur', () => { keys.clear(); for (const b of Object.values(kb)) releaseButton(b); releaseButton(mouse.attack); releaseButton(mouse.use); releaseButton(mouse.hand); });
  }

  // --- Mouse: buttons on the canvas (page chrome outside the game never takes a click), the cursor tracked on window.
  if (canvas) {
    const toBufferPx = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width > 0 ? canvas.width / rect.width : 1;
      const sy = rect.height > 0 ? canvas.height / rect.height : 1;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };
    const track = (e) => { const p = toBufferPx(e); mouse.x = p.x; mouse.y = p.y; mouse.seen = true; };
    canvas.addEventListener('mousedown', (e) => {
      track(e);
      if (e.button === 0) { setMode('mouse'); pressButton(mouse.attack); src.attack = 'mouse'; e.preventDefault(); }
      else if (e.button === 1) { setMode('mouse'); pressButton(mouse.hand); e.preventDefault(); } // the hand, as F
      else if (e.button === 2) { setMode('mouse'); pressButton(mouse.use); src.use = 'mouse'; e.preventDefault(); }
    });
    window.addEventListener('mousemove', track);
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) releaseButton(mouse.attack);
      else if (e.button === 1) releaseButton(mouse.hand);
      else if (e.button === 2) releaseButton(mouse.use);
    });
    // the right button uses the selected slot: never the browser's context menu over the game
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // the wheel steps through the hotbar (one step per notch)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      wheelAcc += d;
      while (wheelAcc >= WHEEL_STEP) { cycle++; wheelAcc -= WHEEL_STEP; }
      while (wheelAcc <= -WHEEL_STEP) { cycle--; wheelAcc += WHEEL_STEP; }
    }, { passive: false });
  }

  // Test / override hook: __octo.input(actions) replaces the actions it names, for every snapshot until cleared (null).
  let override = null;
  function setOverride(actions) { override = actions; }

  /** Called once per fixed step by main.js; returns the step's input and clears the one-shot `pressed` edges. */
  function snapshot() {
    const move = usingTouch && touch.active ? { x: touch.x, y: touch.y } : keyboardVector();
    const out = {
      move,
      dash: read(kb.dash, touch.dash),
      bomb: read(kb.bomb, touch.bomb),
      pause: read(kb.pause),
      attack: read(kb.attack, touch.attack, mouse.attack),
      spell: read(touch.spell),
      use: read(kb.use, touch.use, mouse.use),
      hand: read(kb.hand, touch.hand, mouse.hand),
      inventory: read(kb.inventory),
      cycle, select,
      src: { attack: touch.attack.pressed || touch.attack.held ? 'touch' : src.attack, spell: 'touch', bomb: touch.bomb.pressed ? 'touch' : src.bomb, use: touch.use.pressed ? 'touch' : src.use },
      mode: usingTouch ? 'touch' : usingMouse ? 'mouse' : 'keyboard',
    };
    for (const b of [kb.dash, kb.bomb, kb.pause, kb.attack, kb.use, kb.hand, kb.inventory, touch.dash, touch.bomb, touch.spell, touch.attack, touch.use, touch.hand, mouse.attack, mouse.use, mouse.hand]) { b.pressed = false; b.released = false; }
    cycle = 0; select = -1;

    if (override) {
      const o = override;
      const btn = (v, d) => (v !== undefined ? { pressed: !!v, held: !!v } : d);
      return {
        move: o.move ? { x: o.move.x, y: o.move.y } : out.move,
        dash: btn(o.dash, out.dash),
        bomb: btn(o.bomb, out.bomb),
        pause: btn(o.pause, out.pause),
        attack: btn(o.attack, out.attack),
        spell: btn(o.spell, out.spell),
        use: btn(o.use, out.use),
        hand: btn(o.hand, out.hand),
        inventory: btn(o.inventory, out.inventory),
        cycle: o.cycle !== undefined ? o.cycle | 0 : out.cycle,
        select: o.select !== undefined ? o.select | 0 : out.select,
        src: o.src ? { ...out.src, ...o.src } : out.src,
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
    mode() { return usingTouch ? 'touch' : usingMouse ? 'mouse' : usingKeyboard ? 'keyboard' : ''; },
    setMode,
    debugKeys,
    // touch-ui.js writes into these directly:
    touch,
    // main.js reads the cursor (mouse.x / mouse.y, canvas buffer px) to aim the ink jet, the used slot, the bomb and a throw
    mouse,
  };
}
