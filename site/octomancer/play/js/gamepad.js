// Controller Phase 1 (octomancer-web/CONTROLLER-PLAN.md): the gamepad, read once per display frame from navigator.getGamepads()
// (the "standard" mapping Chrome and Edge give Xbox and DualSense pads), turned into the same input snapshot the keyboard,
// mouse and touch write (input.js). Gameplay never reads the pad itself.
//
// Mapping (Xbox names; a DualSense shows its own glyphs, glyphs.js):
//   left stick   swim                       right stick  aim (`snap.aim`, active past its deadzone)
//   RT           ink jet (held: auto-repeat) RB           use the selected hotbar slot (spell, bomb throw / drop)
//   A            the hand (grab, talk, buy, throw; hold = drop)
//   B or LT      dash                       LB           next hotbar slot
//   d-pad < >    previous / next slot       d-pad up     the bomb slot
//   View (Back)  journal / inventory        Menu (Start) pause
// In a menu (pause, settings, the death and clear screens: main.js says which) the pad drives menu-nav.js instead:
// d-pad or left stick moves the focus, A confirms, B goes back; gameplay sees nothing until every button held over the
// switch is let go (so the A that picked "Restart run" does not grab something in the new level).
//
// Deadzones are radial and rescaled (a stick just past the edge reads ~0, full tilt reads 1): 0.2 for the move stick, 0.3
// for the aim stick. The last device used wins: a pad press or a stick leaving its deadzone sets the input mode to 'pad'
// (input.setMode, which fires `modechange`); a key or click sets it back (input.js).
//
// The poll runs once per display frame from loop.js's frame callback (paused or not: Start still has to unpause and the
// d-pad still has to move through the pause menu), not in the fixed step and not on a second requestAnimationFrame.

export const MOVE_DEADZONE = 0.2;
export const AIM_DEADZONE = 0.3;
export const TRIGGER_DOWN = 0.5;   // an analogue trigger counts as pressed past this
const MENU_STICK = 0.5;            // the left stick moves a menu focus past this tilt
const REPEAT_FIRST = 0.38;         // s before a held direction repeats in a menu
const REPEAT_NEXT = 0.13;          // s between repeats

// standard-mapping button indices (https://w3c.github.io/gamepad/#remapping)
export const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15 };
const NAMES = Object.keys(BTN);

/**
 * Radial deadzone, rescaled: |v| < dz reads 0, then (|v| - dz) / (1 - dz) along the same direction, capped at 1.
 * Writes {x, y} into `out` and returns it.
 */
export function radialDeadzone(x, y, dz, out = { x: 0, y: 0 }) {
  const m = Math.hypot(x, y);
  if (!(m > dz)) { out.x = 0; out.y = 0; return out; }
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  out.x = x * k; out.y = y * k;
  return out;
}

/** 'ps' for a PlayStation pad (DualSense / DualShock), else 'xbox' (Xbox and anything else: A B X Y is the common naming). */
export function padStyleOf(id) {
  return /054c|dualsense|dualshock|playstation/i.test(id || '') ? 'ps' : 'xbox';
}

function btnDown(gp, i) {
  const b = gp.buttons && gp.buttons[i];
  if (!b) return false;
  if (typeof b === 'number') return b > TRIGGER_DOWN;
  return i === BTN.lt || i === BTN.rt ? (b.value > TRIGGER_DOWN || (b.pressed && b.value === undefined)) : !!b.pressed;
}

/** The pad to read: the first connected one with the standard mapping, else the first connected one at all. */
export function pickPad(list) {
  if (!list) return null;
  let any = null;
  for (let i = 0; i < list.length; i++) {
    const gp = list[i];
    if (!gp || gp.connected === false) continue;
    if (gp.mapping === 'standard') return gp;
    if (!any) any = gp;
  }
  return any;
}

/**
 * @param {ReturnType<import('./input.js').createInput>} input
 * @param {{
 *   getPads?: () => (Gamepad|null)[],
 *   menuActive?: () => boolean,          // a menu takes the pad (pause, settings, death, clear screens ...)
 *   onMenu?: (action: string) => void,   // 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'tabprev' | 'tabnext' | 'x' | 'y'
 *   onPause?: () => void,                // Start (Menu)
 *   onInventory?: () => void,            // Back (View)
 *   onConnect?: (id: string, style: string) => void,
 *   onDisconnect?: () => void,
 * }} hooks
 */
export function createGamepad(input, hooks = {}) {
  const getPads = hooks.getPads || (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null));
  const down = {};       // this poll's button state by name
  const was = {};        // last poll's
  const latched = {};    // held over a menu <-> game switch: ignored until released
  for (const n of NAMES) { down[n] = was[n] = latched[n] = false; }
  const mv = { x: 0, y: 0 }, am = { x: 0, y: 0 };
  let moveOut = true, aimOut = true; // the sticks were inside their deadzones last poll (a leave sets the mode)
  let padId = '', lastT = 0, inMenu = false;
  let menuDir = '', menuHold = 0, menuNext = 0;
  const stats = { polls: 0, connected: false, id: '', style: 'xbox' };

  const edge = (n) => down[n] && !was[n] && !latched[n]; // went down this poll
  const held = (n) => down[n] && !latched[n];
  function releaseGame() {
    input.padButton('dash', false); input.padButton('attack', false); input.padButton('use', false); input.padButton('hand', false);
    input.pad.x = input.pad.y = input.pad.ax = input.pad.ay = 0; input.pad.aimActive = false;
  }

  function menuDirection(gp) {
    if (down.up) return 'up';
    if (down.down) return 'down';
    if (down.left) return 'left';
    if (down.right) return 'right';
    const x = gp.axes ? gp.axes[0] || 0 : 0, y = gp.axes ? gp.axes[1] || 0 : 0;
    if (Math.hypot(x, y) < MENU_STICK) return '';
    return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
  }

  /** One read of the pad; `dt` in seconds (menu repeat timing). Called from the frame poll, and directly by tests. */
  function poll(dt = 1 / 60) {
    stats.polls++;
    let list = null;
    try { list = getPads(); } catch (e) { list = null; }
    const gp = pickPad(list);
    if (!gp) {
      if (padId) {
        padId = ''; stats.connected = false; stats.id = '';
        for (const n of NAMES) { was[n] = down[n] = latched[n] = false; }
        releaseGame();
        if (hooks.onDisconnect) hooks.onDisconnect();
      }
      return;
    }
    if (gp.id !== padId) {
      padId = gp.id || 'pad'; stats.connected = true; stats.id = padId;
      const style = padStyleOf(gp.id);
      stats.style = style;
      const restyled = input.pad.style !== style;
      input.pad.style = style;
      if (restyled && input.mode() === 'pad') input.setMode('pad', true); // the glyphs change
      // whatever is held at the moment it appears (a trigger resting half down, a stick off-centre) never counts as a press
      for (const n of NAMES) { down[n] = btnDown(gp, BTN[n]); was[n] = down[n]; latched[n] = down[n]; }
      moveOut = aimOut = false;
      if (hooks.onConnect) hooks.onConnect(padId, style);
    }
    for (const n of NAMES) { was[n] = down[n]; down[n] = btnDown(gp, BTN[n]); if (latched[n] && !down[n]) latched[n] = false; }
    const ax = gp.axes || [];
    radialDeadzone(ax[0] || 0, ax[1] || 0, MOVE_DEADZONE, mv);
    radialDeadzone(ax[2] || 0, ax[3] || 0, AIM_DEADZONE, am);
    const moveIn = mv.x !== 0 || mv.y !== 0, aimIn = am.x !== 0 || am.y !== 0;

    // the last device used wins: a fresh press, or a stick leaving its deadzone
    let fresh = (moveIn && !moveOut) || (aimIn && !aimOut);
    for (const n of NAMES) if (down[n] && !was[n] && !latched[n]) fresh = true;
    moveOut = moveIn; aimOut = aimIn;
    if (fresh && input.mode() !== 'pad') input.setMode('pad');

    if (edge('start') && hooks.onPause) hooks.onPause();
    if (edge('back') && hooks.onInventory) hooks.onInventory();

    const menu = !!(hooks.menuActive && hooks.menuActive());
    if (menu !== inMenu) { // switching between a menu and play: what is held now waits for its release
      inMenu = menu;
      for (const n of NAMES) if (down[n]) latched[n] = true;
      releaseGame();
      menuDir = ''; menuHold = 0;
      return;
    }

    if (menu) {
      if (edge('a') && hooks.onMenu) hooks.onMenu('confirm');
      if (edge('b') && hooks.onMenu) hooks.onMenu('back');
      if (edge('lb') && hooks.onMenu) hooks.onMenu('tabprev');
      if (edge('rb') && hooks.onMenu) hooks.onMenu('tabnext');
      if (edge('x') && hooks.onMenu) hooks.onMenu('x'); // Phase 2A: a screen's second and third verbs (the journal's Carried page: X its
      if (edge('y') && hooks.onMenu) hooks.onMenu('y'); // journal page, Y hold the slot)
      const d = menuDirection(gp);
      if (d && latched[d]) { /* a d-pad arm held over the switch */ }
      else if (d !== menuDir) { menuDir = d; menuHold = 0; menuNext = REPEAT_FIRST; if (d && hooks.onMenu) hooks.onMenu(d); }
      else if (d) { menuHold += dt; if (menuHold >= menuNext) { menuNext += REPEAT_NEXT; if (hooks.onMenu) hooks.onMenu(d); } }
      return;
    }

    // --- play: the snapshot
    if (input.mode() === 'pad' || moveIn || aimIn) {
      input.pad.x = mv.x; input.pad.y = mv.y;
      input.pad.ax = am.x; input.pad.ay = am.y; input.pad.aimActive = aimIn;
    }
    input.padButton('dash', held('b') || held('lt'));
    input.padButton('attack', held('rt'));
    input.padButton('use', held('rb'));
    input.padButton('hand', held('a'));
    if (edge('lb')) input.padCycle(1);
    if (edge('left')) input.padCycle(-1);
    if (edge('right')) input.padCycle(1);
    if (edge('up')) input.padSelect(0); // the bomb slot (slot 1 of the bar)
  }

  /** Once per display frame (loop.js everyFrame). */
  function frame(now) {
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    poll(dt);
  }

  return {
    poll, frame,
    connected() { return stats.connected; },
    style() { return input.pad.style; },
    /** Test / debug read: the last poll's buttons, sticks and state. */
    debug() { return { ...stats, inMenu, down: { ...down }, latched: Object.keys(latched).filter((n) => latched[n]), move: { ...mv }, aim: { ...am } }; },
  };
}

// --- test hook support: a fake standard-mapping pad (main.js __octo.pad(state)) ---
/**
 * Build a Gamepad-shaped object from a short state: {lx, ly, rx, ry, a, b, x, y, lb, rb, lt, rt, back, start, up, down,
 * left, right, id}. Trigger values may be numbers (0..1); other buttons booleans.
 */
export function fakePad(state = {}, index = 0) {
  const buttons = [];
  for (const n of NAMES) {
    const v = state[n];
    const val = typeof v === 'number' ? v : v ? 1 : 0;
    buttons[BTN[n]] = { pressed: val > TRIGGER_DOWN || (v === true), touched: val > 0, value: val };
  }
  buttons[16] = { pressed: false, touched: false, value: 0 };
  return {
    id: state.id || 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index, connected: true,
    mapping: 'standard', timestamp: performance.now(),
    axes: [state.lx || 0, state.ly || 0, state.rx || 0, state.ry || 0], buttons,
  };
}
