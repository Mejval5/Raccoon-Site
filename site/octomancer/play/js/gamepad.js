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
  let padId = '', primaryKeyNow = '', padStillThere = false, lastT = 0, inMenu = false;
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
    // local co-op (players.js): which connected pad is the primary one (today's single pad: the merged snapshot, the menus),
    // and every other connected pad is read on its own (pollOthers): a player's own snapshot, or a free pad that may join
    const want = hooks.primaryKey ? hooks.primaryKey() : undefined;
    const gp = want === undefined ? pickPad(list) : want === '' ? null : padByKey(list, want);
    padStillThere = !!(primaryKeyNow && padByKey(list, primaryKeyNow));
    pollOthers(list, gp, dt);
    pollPrimary(gp, dt, want !== undefined);
  }
  function pollPrimary(gp, dt, chosen = false) {
    if (!gp) {
      if (padId) {
        padId = ''; primaryKeyNow = ''; stats.connected = false; stats.id = '';
        for (const n of NAMES) { was[n] = down[n] = latched[n] = false; }
        releaseGame();
        // co-op: a pad that stops being the primary one (main.js chose another, or none) has not gone away
        if (hooks.onDisconnect && !(chosen && padStillThere)) hooks.onDisconnect();
      }
      return;
    }
    const gkey = keyOf(gp, gp.index | 0);
    if (gkey !== primaryKeyNow) {
      padId = gp.id || 'pad'; primaryKeyNow = gkey; stats.connected = true; stats.id = padId;
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
    if (fresh && typeof dispatchEvent === 'function') dispatchEvent(new Event('octo-padpress')); // night batch 5: audio.js PAD_PRESS, the first one unlocks the AudioContext
    moveOut = moveIn; aimOut = aimIn;
    if (fresh && input.mode() !== 'pad') { if (hooks.beforeMode) hooks.beforeMode(input.mode()); input.setMode('pad'); } // (co-op: main.js notes the scheme it leaves)

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

  // --- local co-op: every connected pad other than the primary one ----------------------------------------------------------
  // A pad bound to a player (hooks.isPlayer(key)) gets its own snapshot (snapshotOf(key), read once per fixed step by main.js);
  // in a menu it moves the cursor like the primary pad and Start / View pause and open the book. A free pad (no player) only
  // reports its presses (hooks.onFree(key, button, info)): A or Start in the pause menu is how it joins. The same rules as the
  // primary pad: what is held when it appears or when a menu opens or closes waits for its release.
  const others = new Map(); // key -> per-pad record
  const FREE_BTNS = ['a', 'start', 'b', 'back', 'up', 'down', 'left', 'right']; // a free pad's presses (co-op polish: the d-pad walks the pause menu)
  function padByKey(list, key) {
    if (!list) return null;
    for (let i = 0; i < list.length; i++) { const g = list[i]; if (g && g.connected !== false && keyOf(g, i) === key) return g; }
    return null;
  }
  function keyOf(g, i) { return String(g.id || 'pad') + '#' + (g.index !== undefined ? g.index : i); }
  function newBtn() { return { pressed: false, held: false, released: false }; }
  function setBtn(b, on) { if (on) { if (!b.held) b.pressed = true; b.held = true; } else { if (b.held) b.released = true; b.held = false; } }
  function otherRec(key, g) {
    const r = { key, id: g.id || 'pad', index: g.index | 0, style: padStyleOf(g.id), down: {}, was: {}, latched: {}, mv: { x: 0, y: 0 }, am: { x: 0, y: 0 }, inMenu: false, menuDir: '', menuHold: 0, menuNext: 0, seen: true,
      snap: { x: 0, y: 0, ax: 0, ay: 0, aimActive: false, dash: newBtn(), attack: newBtn(), use: newBtn(), hand: newBtn(), cycle: 0, select: -1 } };
    for (const n of NAMES) { r.down[n] = btnDown(g, BTN[n]); r.was[n] = r.down[n]; r.latched[n] = r.down[n]; }
    return r;
  }
  function releaseOther(r) { const s = r.snap; setBtn(s.dash, false); setBtn(s.attack, false); setBtn(s.use, false); setBtn(s.hand, false); s.x = s.y = s.ax = s.ay = 0; s.aimActive = false; }
  function pollOthers(list, primary, dt) {
    for (const r of others.values()) r.seen = false;
    if (list) for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (!g || g.connected === false || g === primary) continue;
      const key = keyOf(g, i);
      let r = others.get(key);
      if (!r) { r = otherRec(key, g); others.set(key, r); if (hooks.onOtherConnect) hooks.onOtherConnect(key, r.style); continue; }
      r.seen = true;
      pollOther(r, g, dt);
    }
    for (const [key, r] of others) {
      if (r.seen || (list && padByKey(list, key) && padByKey(list, key) === primary)) { if (!r.seen) others.delete(key); continue; }
      others.delete(key);
      if (hooks.onOtherGone) hooks.onOtherGone(key);
    }
  }
  function pollOther(r, g, dt) {
    const { down, was, latched } = r;
    for (const n of NAMES) { was[n] = down[n]; down[n] = btnDown(g, BTN[n]); if (latched[n] && !down[n]) latched[n] = false; }
    const ed = (n) => down[n] && !was[n] && !latched[n];
    const hd = (n) => down[n] && !latched[n];
    const ax = g.axes || [];
    radialDeadzone(ax[0] || 0, ax[1] || 0, MOVE_DEADZONE, r.mv);
    radialDeadzone(ax[2] || 0, ax[3] || 0, AIM_DEADZONE, r.am);
    const player = !!(hooks.isPlayer && hooks.isPlayer(r.key));
    let fresh = false;
    for (const n of NAMES) if (ed(n)) fresh = true;
    if (fresh && hooks.onOtherActivity) hooks.onOtherActivity(r.key);
    if (!player) { // a free pad: only its presses, for joining from the pause menu
      for (const n of FREE_BTNS) if (ed(n) && hooks.onFree) hooks.onFree(r.key, n, { id: r.id, index: r.index, style: r.style });
      releaseOther(r);
      return;
    }
    if (ed('start') && hooks.onPause) hooks.onPause(r.key);
    if (ed('back') && hooks.onInventory) hooks.onInventory(r.key);
    const menu = !!(hooks.menuActive && hooks.menuActive());
    if (menu !== r.inMenu) {
      r.inMenu = menu;
      for (const n of NAMES) if (down[n]) latched[n] = true;
      releaseOther(r);
      r.menuDir = ''; r.menuHold = 0;
      return;
    }
    if (menu) {
      if (fresh && input.mode() !== 'pad') input.setMode('pad'); // the ring shows for the pad that drives the menu
      const send = (a) => { if (hooks.onMenu) hooks.onMenu(a, r.key); };
      if (ed('a')) send('confirm');
      if (ed('b')) send('back');
      if (ed('lb')) send('tabprev');
      if (ed('rb')) send('tabnext');
      if (ed('x')) send('x');
      if (ed('y')) send('y');
      let d = '';
      if (down.up) d = 'up'; else if (down.down) d = 'down'; else if (down.left) d = 'left'; else if (down.right) d = 'right';
      else { const x = ax[0] || 0, y = ax[1] || 0; if (Math.hypot(x, y) >= MENU_STICK) d = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up'); }
      if (d && latched[d]) { /* held over the switch */ }
      else if (d !== r.menuDir) { r.menuDir = d; r.menuHold = 0; r.menuNext = REPEAT_FIRST; if (d) send(d); }
      else if (d) { r.menuHold += dt; if (r.menuHold >= r.menuNext) { r.menuNext += REPEAT_NEXT; send(d); } }
      return;
    }
    const s = r.snap;
    s.x = r.mv.x; s.y = r.mv.y; s.ax = r.am.x; s.ay = r.am.y; s.aimActive = r.am.x !== 0 || r.am.y !== 0;
    setBtn(s.dash, hd('b') || hd('lt'));
    setBtn(s.attack, hd('rt'));
    setBtn(s.use, hd('rb'));
    setBtn(s.hand, hd('a'));
    if (ed('lb')) s.cycle += 1;
    if (ed('left')) s.cycle -= 1;
    if (ed('right')) s.cycle += 1;
    if (ed('up')) s.select = 0;
  }
  const NOB = { pressed: false, held: false };
  const rd = (b) => ({ pressed: b.pressed, held: b.held });
  /** A player pad's input for one fixed step, in the shape of input.js snapshot() (clears its one-shot edges), or null. */
  function snapshotOf(key) {
    const r = others.get(key);
    if (!r) return null;
    const s = r.snap;
    const out = {
      move: { x: s.x, y: s.y }, aim: { x: s.ax, y: s.ay, active: s.aimActive },
      dash: rd(s.dash), bomb: NOB, pause: NOB, attack: rd(s.attack), spell: NOB, use: rd(s.use), hand: rd(s.hand), inventory: NOB,
      cycle: s.cycle, select: s.select, src: { attack: 'pad', spell: 'touch', bomb: 'pad', use: 'pad' }, mode: 'pad',
    };
    for (const b of [s.dash, s.attack, s.use, s.hand]) { b.pressed = false; b.released = false; }
    s.cycle = 0; s.select = -1;
    return out;
  }

  return {
    poll, frame, snapshotOf,
    /** Local co-op: the connected pads other than the primary one ({key, id, index, style}). */
    others() { return [...others.values()].map((r) => ({ key: r.key, id: r.id, index: r.index, style: r.style })); },
    /** The key (players.js padKey) of the primary pad now, or ''. */
    primaryKey() { return padId ? primaryKeyNow : ''; },
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
