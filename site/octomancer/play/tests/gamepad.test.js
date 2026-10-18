// Controller Phase 1 (octomancer-web/CONTROLLER-PLAN.md): gamepad.js (deadzones, the mapping into the input snapshot, the last
// device wins, menus and the latch), glyphs.js (labels per scheme, the controls line, every icon draws), inkjet.js coneAim
// (the pad's light auto-aim) and menu-nav.js (spatial focus moves, sliders, confirm / back).
import { createInput } from '../js/input.js';
import { createGamepad, radialDeadzone, padStyleOf, pickPad, fakePad, MOVE_DEADZONE, AIM_DEADZONE } from '../js/gamepad.js';
import { glyph, glyphs, controlsLine, drawGlyph, PAD_MAP } from '../js/glyphs.js';
import { coneAim } from '../js/inkjet.js';
import { createMenuNav, pickNeighbour } from '../js/menu-nav.js';

export async function runGamepadTests(assert, approx) {
  // --- deadzones
  {
    const o = radialDeadzone(0.15, 0.1, MOVE_DEADZONE);
    assert('pad: a stick inside the 0.2 radial deadzone reads 0', o.x === 0 && o.y === 0);
    const f = radialDeadzone(1, 0, MOVE_DEADZONE);
    assert('pad: full tilt reads 1', approx(f.x, 1) && f.y === 0);
    const h = radialDeadzone(0.6, 0, MOVE_DEADZONE);
    assert('pad: the deadzone is rescaled (0.6 -> 0.5)', approx(h.x, 0.5, 1e-9));
    const d = radialDeadzone(0.7, 0.7, MOVE_DEADZONE);
    assert('pad: the deadzone is radial (a diagonal keeps its direction, capped at 1)', approx(d.x, d.y) && Math.hypot(d.x, d.y) <= 1 + 1e-9);
    const a = radialDeadzone(0.28, 0, AIM_DEADZONE);
    assert('pad: the aim stick has the wider 0.3 deadzone', a.x === 0 && AIM_DEADZONE === 0.3 && MOVE_DEADZONE === 0.2);
  }
  // --- which pad, which glyphs
  assert('pad: a DualSense id gets PlayStation glyphs', padStyleOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)') === 'ps');
  assert('pad: an Xbox id gets Xbox glyphs', padStyleOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)') === 'xbox');
  {
    const odd = { id: 'odd', connected: true, mapping: '', buttons: [], axes: [] }, std = fakePad({}, 1);
    assert('pad: the standard-mapped pad is preferred', pickPad([null, odd, std]) === std && pickPad([odd]) === odd && pickPad([null, null]) === null);
  }

  // --- the pad into the snapshot
  {
    const input = createInput();
    let state = null;
    const modes = [], menus = [];
    let pauses = 0, invs = 0, discs = 0, menuOn = false;
    input.onModeChange((m) => modes.push(m));
    const pad = createGamepad(input, {
      getPads: () => [state ? fakePad(state) : null],
      menuActive: () => menuOn,
      onMenu: (a) => menus.push(a),
      onPause: () => pauses++,
      onInventory: () => invs++,
      onDisconnect: () => discs++,
    });
    const poll = (st, n = 1, dt = 1 / 60) => { state = st; for (let i = 0; i < n; i++) pad.poll(dt); };
    poll({});
    assert('pad: plugging in alone does not change the input mode', input.mode() === '' && modes.length === 0 && pad.connected());
    poll({ lx: 1 });
    let s = input.snapshot();
    assert('pad: the left stick swims and switches the mode to pad (modechange fires)', approx(s.move.x, 1) && s.mode === 'pad' && modes[modes.length - 1] === 'pad');
    poll({ rx: -1 });
    s = input.snapshot();
    assert('pad: the right stick is the aim {x, y, active}', s.aim.active && approx(s.aim.x, -1) && s.move.x === 0);
    poll({ rx: 0.2 });
    assert('pad: an aim stick at rest is not active', !input.snapshot().aim.active);
    poll({ rt: 1 }); s = input.snapshot();
    assert('pad: RT is the ink jet (src pad)', s.attack.pressed && s.attack.held && s.src.attack === 'pad');
    poll({ rt: 1 }); s = input.snapshot();
    assert('pad: RT held stays held without a second press (auto-repeat in main.js)', !s.attack.pressed && s.attack.held);
    poll({ rt: 0.3 }); s = input.snapshot();
    assert('pad: a trigger under half way is up', !s.attack.held);
    poll({ rb: true }); s = input.snapshot();
    assert('pad: RB uses the selected slot (src pad, a bomb too)', s.use.pressed && s.src.use === 'pad');
    poll({}); poll({ lb: true }); s = input.snapshot();
    assert('pad: LB is the hand (2026-10-18)', s.hand.pressed && s.hand.held && s.cycle === 0);
    poll({ lb: true }, 5); s = input.snapshot();
    assert('pad: LB held stays the hand, and never steps the hotbar', !s.hand.pressed && s.hand.held && s.cycle === 0);
    poll({}); input.snapshot(); poll({ a: true }); s = input.snapshot();
    assert('pad: A is still a second hand button in play', s.hand.pressed && s.hand.held);
    poll({ lb: true, a: true }); s = input.snapshot();
    assert('pad: LB and A together are one held hand (no second press)', !s.hand.pressed && s.hand.held);
    poll({}); poll({ b: true }); s = input.snapshot();
    assert('pad: B dashes', s.dash.pressed);
    poll({}); poll({ lt: 0.9 }); s = input.snapshot();
    assert('pad: LT dashes too', s.dash.pressed);
    poll({}); input.snapshot();
    poll({}); poll({ left: true }); s = input.snapshot();
    assert('pad: d-pad left steps back', s.cycle === -1);
    poll({}); poll({ right: true }); s = input.snapshot();
    assert('pad: d-pad right steps on', s.cycle === 1);
    poll({}); poll({ up: true }); s = input.snapshot();
    assert('pad: d-pad up picks the bomb slot (slot 0)', s.select === 0);
    poll({}); poll({ start: true }, 10); poll({}); poll({ back: true }, 3);
    assert('pad: Start pauses once per press, View opens the inventory once', pauses === 1 && invs === 1);

    // a key flips the scheme back; a fresh pad press takes it again
    input.setMode('keyboard');
    poll({ back: true });
    assert('pad: a key sets the mode back to keyboard (holding a pad button does not take it back)', input.mode() === 'keyboard' && modes[modes.length - 1] === 'keyboard');
    poll({}); poll({ x: true });
    assert('pad: a fresh press takes it back', input.mode() === 'pad');

    // menus
    poll({});
    menuOn = true; poll({}); // the switch poll
    poll({ a: true }); poll({ a: true }); poll({ lb: true }); poll({ b: true }); s = input.snapshot();
    assert('pad: in a menu A confirms, LB turns a tab back and B goes back; gameplay sees nothing', menus.includes('confirm') && menus.includes('tabprev') && menus.includes('back') && !s.hand.held && !s.dash.held);
    menus.length = 0;
    poll({ down: true }); poll({ down: true }, 20, 1 / 60); // ~0.35 s: the first repeat is at 0.38 s
    const before = menus.filter((m) => m === 'down').length;
    poll({ down: true }, 12, 1 / 60);
    const after = menus.filter((m) => m === 'down').length;
    assert('pad: a held menu direction moves once, then repeats', before === 1 && after > 1, `${before} ${after}`);
    menus.length = 0;
    poll({ ly: -0.9 }); poll({ ly: -0.9 });
    assert('pad: the left stick moves a menu focus too', menus.length === 1 && menus[0] === 'up');
    // the latch: A held when the menu closes does nothing in play until let go
    poll({ a: true });
    menuOn = false; poll({ a: true }); poll({ a: true }, 3); s = input.snapshot();
    assert('pad: a button held over the menu -> play switch waits for its release', !s.hand.held && !s.hand.pressed);
    poll({}); poll({ a: true }); s = input.snapshot();
    assert('pad: after the release it works again', s.hand.pressed);
    poll({});

    // unplug
    state = null; pad.poll();
    assert('pad: unplugging is reported once and clears the sticks', discs === 1 && !pad.connected() && input.pad.x === 0);
    pad.poll();
    assert('pad: no second disconnect', discs === 1);
    // a trigger resting half down when the pad appears is not a press
    poll({ rt: 0.8 }); s = input.snapshot();
    assert('pad: a trigger already down when the pad appears does not fire', !s.attack.held);
  }
  // a DualSense restyles the scheme
  {
    const input = createInput();
    const modes = [];
    input.onModeChange((m) => modes.push(m));
    let st = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)' };
    const pad = createGamepad(input, { getPads: () => [fakePad(st)] });
    pad.poll(); st = { ...st, a: true }; pad.poll();
    assert('pad: a DualSense sets padStyle ps', input.padStyle() === 'ps' && input.mode() === 'pad');
    st = { a: true }; pad.poll(); // an Xbox pad replaces it while in pad mode: modechange fires again for the new glyphs
    assert('pad: another make of pad re-fires modechange', input.padStyle() === 'xbox' && modes.filter((m) => m === 'pad').length === 2);
  }

  // --- glyphs
  assert('glyph: the hand is LB on a pad, L1 on a DualSense, F on the keyboard, MMB with a mouse', glyph('hand', 'pad').label === 'LB' && glyph('hand', 'pad', 'ps').label === 'L1' && glyph('hand', 'keyboard').label === 'F' && glyph('hand', 'mouse').label === 'MMB');
  assert('glyph: the hand lists LB then A on a pad (L1 then Cross)', glyphs('hand', 'pad').map((g) => g.label).join() === 'LB,A' && glyphs('hand', 'pad', 'ps').map((g) => g.label).join() === 'L1,Cross');
  assert('glyph: the hotbar is the d-pad only on a pad (no LB)', glyphs('cycle', 'pad').map((g) => g.label).join() === 'D-pad left / right' && glyph('next', 'pad').label === 'D-pad right' && glyph('prev', 'pad').label === 'D-pad left');
  assert('glyph: menus keep A confirm, B back, LB / RB tabs', glyph('confirm', 'pad').label === 'A' && glyph('back', 'pad').label === 'B' && glyph('tabprev', 'pad').label === 'LB' && glyph('tabnext', 'pad').label === 'RB');
  assert('glyph: the ink jet is RT / R2 / J / LMB', glyph('attack', 'pad').label === 'RT' && glyph('attack', 'pad', 'ps').label === 'R2' && glyph('attack', 'keyboard').label === 'J' && glyph('attack', 'mouse').label === 'LMB');
  assert('glyph: dash lists B and LT on a pad', glyphs('dash', 'pad').map((g) => g.label).join() === 'B,LT');
  assert('glyph: pause is Menu / Options, inventory View / Create', glyph('pause', 'pad').label === 'Menu' && glyph('pause', 'pad', 'ps').label === 'Options' && glyph('inventory', 'pad').label === 'View' && glyph('inventory', 'pad', 'ps').label === 'Create');
  assert('glyph: an unknown action has no glyph', glyph('fly', 'pad') === null && glyph('fly', 'keyboard') === null);
  assert('glyph: glyphs are cached (no allocation per call)', glyph('hand', 'pad') === glyph('hand', 'pad'));
  {
    const pl = controlsLine('pad');
    const kl = controlsLine('keyboard'), ml = controlsLine('mouse');
    assert('controlsLine: the pad line has its parts and glyphs (no key names)', pl.scheme === 'pad' && pl.parts.length === 9 && /Hand LB/.test(pl.text) && /Bar D-pad left \/ right/.test(pl.text) && /Journal View/.test(pl.text) && !/WASD/.test(pl.text));
    assert('controlsLine: keyboard and mouse share the desktop line (Hand F, Jet LMB, Journal Tab)', kl.text === ml.text && /Hand F/.test(kl.text) && /Jet LMB/.test(kl.text) && /Journal Tab/.test(kl.text) && kl.parts.length === 0);
    assert('controlsLine: touch has no line', controlsLine('touch').text === '');
    // IMPROVEMENTS.md 6: no stale key names in code ("Inventory: Tab" is the journal, "B/X drops one" is gone, "Ink Jet" everywhere)
    const srcs = await Promise.all(['glyphs', 'settings', 'carried', 'hotbar-ui', 'inventory-ui', 'signs'].map((f) => fetch(new URL('../js/' + f + '.js', import.meta.url)).then((r) => r.text()).then((t) => [f, t])));
    const stale = srcs.filter(([, t]) => /Inventory: Tab|B\/X drops|Ink jet/.test(t)).map(([f]) => f);
    assert('key names: no "Inventory: Tab", "B/X drops" or "Ink jet" left in glyphs, settings, carried, hotbar-ui, inventory-ui, signs', stale.length === 0, stale.join());
    assert('controlsLine: a DualSense line uses its names', /Hand Cross/.test(controlsLine('pad', 'ps').text));
    // IMPROVEMENTS.md 6: one short line per scheme, essentials only
    assert('controlsLine: the desktop and pad lines are at most 110 characters, no bracketed notes', [kl, pl, controlsLine('pad', 'ps')].every((l) => l.text.length <= 110 && !/[()]/.test(l.text)), [kl, pl].map((l) => l.text.length).join(' / '));
  }
  {
    let ok = true;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
    const c = cv.getContext('2d');
    const all = new Set();
    for (const sch of ['pad', 'keyboard', 'mouse', 'touch']) for (const st of ['xbox', 'ps']) for (const a of Object.keys(PAD_MAP)) for (const g of glyphs(a, sch, st)) all.add(g);
    try { for (const g of all) { drawGlyph(c, g, 32, 16, 9); g.draw(c, 32, 16, 6); } } catch (e) { ok = false; }
    assert(`glyph: every icon draws (${all.size} glyphs)`, ok && all.size > 25);
  }

  // --- the pad's light auto-aim
  {
    const octo = { x: 0, y: 0 };
    const open = () => false;
    const foe = (x, y) => ({ x, y, hp: 1 });
    let d = coneAim(octo, [foe(4, 1)], open, { x: 1, y: 0 }, Math.cos(0.56));
    assert('coneAim: a creature ahead inside the cone bends the aim onto it', approx(Math.atan2(d.y, d.x), Math.atan2(1, 4), 1e-6));
    d = coneAim(octo, [foe(-4, 0)], open, { x: 1, y: 0 }, Math.cos(0.56));
    assert('coneAim: never behind (the facing stays)', approx(d.x, 1) && approx(d.y, 0));
    d = coneAim(octo, [foe(2, 3)], open, { x: 1, y: 0 }, Math.cos(0.56));
    assert('coneAim: not far to the side either', approx(d.x, 1));
    d = coneAim(octo, [foe(4, 0)], () => true, { x: 2, y: 0 }, Math.cos(0.56));
    assert('coneAim: not through rock (unit facing back)', approx(d.x, 1) && approx(d.y, 0));
    d = coneAim(octo, [foe(6, 0.5), foe(3, -0.4)], open, { x: 1, y: 0 }, Math.cos(0.56));
    assert('coneAim: the nearest one wins', approx(Math.atan2(d.y, d.x), Math.atan2(-0.4, 3), 1e-6));
    d = coneAim(octo, [{ x: 3, y: 0, hp: 1, ambient: true }, { x: 3, y: 0, hp: 1, dead: true }], open, { x: 0, y: -1 }, Math.cos(0.56));
    assert('coneAim: background fish and the dead are ignored', approx(d.y, -1));
  }

  // --- menu-nav
  {
    const R = (l, t, w = 100, h = 40) => ({ left: l, top: t, width: w, height: h });
    const col = [R(0, 0), R(0, 60), R(0, 120)];
    assert('menu-nav: down from the top goes to the next one down', pickNeighbour(col[0], col, 0, 1, 0) === 1);
    assert('menu-nav: nothing above the top', pickNeighbour(col[0], col, 0, -1, 0) === -1);
    const grid = [R(0, 0), R(200, 0), R(0, 60), R(200, 300)];
    assert('menu-nav: straight down beats down-and-far-right', pickNeighbour(grid[0], grid, 0, 1, 0) === 2);
    assert('menu-nav: right goes right', pickNeighbour(grid[0], grid, 1, 0, 0) === 1);

    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;width:300px;';
    const clicks = [];
    let backs = 0;
    const mk = (t) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'display:block;width:200px;height:30px;margin:4px'; b.onclick = () => clicks.push(t); root.appendChild(b); return b; };
    const b1 = mk('one'), b2 = mk('two');
    const hidden = mk('hidden'); hidden.style.display = 'none';
    const rng = document.createElement('input'); rng.type = 'range'; rng.min = '0'; rng.max = '1'; rng.step = '0.1'; rng.value = '0.5'; rng.style.cssText = 'display:block;width:200px;height:20px';
    let inputs = 0; rng.addEventListener('input', () => inputs++);
    root.appendChild(rng);
    document.body.appendChild(root);
    let open = true, padMode = true;
    const nav = createMenuNav({ current: () => (open ? { root, back: () => backs++ } : null), padMode: () => padMode });
    nav.sync();
    assert('menu-nav: the first control takes the focus, with the ring', nav.focused() === b1 && b1.classList.contains('octo-pad-focus'));
    nav.handle('down');
    assert('menu-nav: down moves the focus and the ring', nav.focused() === b2 && !b1.classList.contains('octo-pad-focus') && b2.classList.contains('octo-pad-focus'));
    nav.handle('down');
    assert('menu-nav: hidden controls are skipped', nav.focused() === rng);
    nav.handle('right');
    assert('menu-nav: right on a slider raises it one step (and fires input)', approx(Number(rng.value), 0.6, 1e-9) && inputs === 1 && nav.focused() === rng);
    nav.handle('left'); nav.handle('left');
    assert('menu-nav: left lowers it', approx(Number(rng.value), 0.4, 1e-9));
    nav.handle('up'); nav.handle('confirm');
    assert('menu-nav: A clicks the focused control', clicks.join() === 'two');
    nav.handle('back');
    assert('menu-nav: B is the menu\'s back', backs === 1);
    padMode = false; nav.hideRing();
    assert('menu-nav: the ring goes when the pad stops driving', !document.querySelector('.octo-pad-focus'));
    open = false;
    assert('menu-nav: no menu, no taking', nav.handle('confirm') === false && clicks.length === 1);
    root.remove();
  }

  // --- menu-nav, Phase 2A: overlap counts as straight; a screen with its own selection; the browser focus moved by the menu
  {
    const R = (l, t, w = 100, h = 40) => ({ left: l, top: t, width: w, height: h });
    // a wide slider, a small button under its right end, a wide button far below: down goes to the small one
    const rs = [R(0, 0, 400, 30), R(330, 100, 70, 40), R(0, 300, 400, 40)];
    assert('menu-nav: a small control under the end of a wide one is straight down from it', pickNeighbour(rs[0], rs, 0, 1, 0) === 1);
    assert('menu-nav: and up from it is the wide one', pickNeighbour(rs[1], rs, 0, -1, 1) === 0);

    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;width:300px;';
    const cards = [];
    for (let i = 0; i < 3; i++) { const b = document.createElement('button'); b.textContent = 'c' + i; b.style.cssText = 'display:inline-block;width:60px;height:30px'; root.appendChild(b); cards.push(b); }
    document.body.appendChild(root);
    let sel = 0, backs = 0;
    const seen = [];
    const own = { root, back: () => backs++, pad: (a) => { seen.push(a); if (a === 'right') { sel = Math.min(2, sel + 1); return true; } if (a === 'back' && sel > 0) { sel = 0; return true; } return a === 'tabnext'; }, focus: () => cards[sel] };
    const nav = createMenuNav({ current: () => own, padMode: () => true });
    nav.sync();
    assert('menu-nav: a screen with its own selection gets the ring on its focus()', nav.focused() === cards[0] && cards[0].classList.contains('octo-pad-focus'));
    nav.handle('right');
    assert("menu-nav: the screen's pad() takes the action and the ring follows its selection", sel === 1 && nav.focused() === cards[1] && !cards[0].classList.contains('octo-pad-focus'));
    nav.handle('tabnext'); nav.handle('x');
    assert('menu-nav: every action goes to pad() first (tabnext, x)', seen.includes('tabnext') && seen.includes('x'));
    nav.handle('back');
    assert('menu-nav: a back the screen uses does not close it', backs === 0 && sel === 0 && nav.focused() === cards[0]);
    nav.handle('back');
    assert("menu-nav: a back it leaves falls through to the menu's back", backs === 1);
    // the screen rebuilt its cards: the ring moves to the new element on the next sync
    const fresh = document.createElement('button'); fresh.textContent = 'new'; root.replaceChild(fresh, cards[0]); cards[0] = fresh;
    nav.sync();
    assert('menu-nav: a rebuilt selection gets the ring again', fresh.classList.contains('octo-pad-focus'));
    root.remove();

    // a generic menu that moves the browser focus itself (the settings reset confirm): the ring goes with it
    const r2 = document.createElement('div');
    r2.style.cssText = 'position:fixed;left:0;top:0;width:300px;';
    const a = document.createElement('button'), b = document.createElement('button');
    a.textContent = 'a'; b.textContent = 'b'; a.style.cssText = b.style.cssText = 'display:block;width:100px;height:30px';
    r2.append(a, b); document.body.appendChild(r2);
    const nav2 = createMenuNav({ current: () => ({ root: r2 }), padMode: () => true });
    nav2.sync();
    b.focus();
    nav2.sync();
    assert('menu-nav: focus() moved by the menu takes the ring along', nav2.focused() === b && b.classList.contains('octo-pad-focus') && !a.classList.contains('octo-pad-focus'));
    r2.remove();
  }
}
