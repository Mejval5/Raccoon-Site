// Controller Phase 1: a focus cursor for HTML menus, driven by the pad (gamepad.js onMenu). It walks the visible buttons,
// switches and sliders of the menu main.js names (pause, settings, the death and clear screens, the tutorial offer):
// d-pad / left stick move it to the nearest control that way, left / right on a slider change its value, A clicks, B is
// the menu's own back. The focused control wears `.octo-pad-focus` (play.css): a quiet sea-glass ring, the same colour as
// the selected hotbar slot. The mouse and keyboard keep working on the same menus as before; the ring shows only while
// the pad drives.

const FOCUSABLE = 'button, input[type="range"]';

/** A control that can take the focus: shown, not disabled, with a size (display:none parents give 0 x 0). */
function usable(e) {
  if (e.disabled) return false;
  if (e.closest('[hidden]')) return false;
  const r = e.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(e);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}
/** Where the ring goes: a slider rings its whole settings row (label, value and track), anything else itself. */
export function ringOf(e) {
  return e && e.tagName === 'INPUT' && e.closest ? e.closest('.octo-set-row') || e : e;
}
export function menuItems(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter(usable);
}

/**
 * The control to go to from rect `from` in direction (dx, dy): the one whose centre lies that way, scored by the distance
 * along the direction plus twice the sideways gap between the boxes (so a control straight down beats one down and far right). Pure on
 * rects so tests can feed it boxes. Returns the index in `rects`, or -1.
 */
export function pickNeighbour(from, rects, dx, dy, skip = -1) {
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
  let best = -1, bestS = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === skip) continue;
    const r = rects[i];
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const vx = cx - fx, vy = cy - fy;
    const along = vx * dx + vy * dy;
    if (along <= 2) continue;
    // sideways: the gap between the two boxes across the direction (0 when they overlap, Phase 2A: so the small Random button
    // under the right end of a wide slider is "straight down" from it, not beaten by a centred button further on)
    const side = dy ? Math.max(0, r.left - (from.left + from.width), from.left - (r.left + r.width))
      : Math.max(0, r.top - (from.top + from.height), from.top - (r.top + r.height));
    const s = along + side * 2;
    if (s < bestS) { bestS = s; best = i; }
  }
  return best;
}

/**
 * A menu (opts.current()) is { root, back?, first?, pad?, focus? }. Phase 2A: a screen with its own selection (the journal's
 * grid, the looks picker) gives `pad(action)`, which gets every pad action first and returns true when it used it, and
 * `focus()`, the element its selection is on now: the ring goes there instead of to a control the generic cursor picked.
 * An action the screen leaves (returns false) falls through to the generic cursor (B: the menu's back).
 * @param {{ current: () => ({ root: Element, back?: () => void, first?: Element, pad?: (a: string) => boolean, focus?: () => Element | null } | null), padMode: () => boolean }} opts
 */
export function createMenuNav(opts) {
  let focused = null, root = null;

  function clear() {
    if (focused) ringOf(focused).classList.remove('octo-pad-focus');
    focused = null;
  }
  function setFocus(e) {
    if (focused === e) { if (e && opts.padMode()) ringOf(e).classList.add('octo-pad-focus'); return; }
    clear();
    focused = e;
    if (!e) return;
    if (opts.padMode()) ringOf(e).classList.add('octo-pad-focus');
    try { e.focus({ preventScroll: true }); } catch (err) { /* old browsers */ }
    if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /** Make sure the focus is on a control of the open menu (the menu changed, or a control vanished). */
  function sync() {
    const m = opts.current();
    if (!m) { if (root) { root = null; clear(); } return null; }
    if (m.root !== root) { root = m.root; clear(); }
    if (m.focus) { // the screen keeps its own selection: the ring follows it
      const f = m.focus();
      if (f) { setFocus(f); return { m, items: null }; }
    }
    const items = menuItems(m.root);
    const act = document.activeElement;
    // the menu moved the browser focus itself (the settings reset confirm, a click): the ring goes with it
    if (focused && act !== focused && act && act !== document.body && items.includes(act)) { setFocus(act); return { m, items }; }
    if (focused && items.includes(focused)) { if (opts.padMode()) ringOf(focused).classList.add('octo-pad-focus'); return { m, items }; }
    const first = (m.first && items.includes(m.first) && m.first) || (act && items.includes(act) && act) || items[0] || null;
    setFocus(first);
    return { m, items };
  }
  function step(dir) {
    let s = sync();
    if (s && !s.items) s = { m: s.m, items: menuItems(s.m.root) };
    if (!s || !focused) return;
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    if (focused.tagName === 'INPUT' && focused.type === 'range' && dx) { // a slider: left / right change it
      const st = Number(focused.step) || 1, v = Number(focused.value) + dx * st;
      const nv = Math.min(Number(focused.max), Math.max(Number(focused.min), v));
      if (nv !== Number(focused.value)) {
        focused.value = String(nv);
        focused.dispatchEvent(new Event('input', { bubbles: true }));
        focused.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    const rects = s.items.map((e) => e.getBoundingClientRect());
    const at = s.items.indexOf(focused);
    if (at < 0) { if (s.items[0]) setFocus(s.items[0]); return; }
    let i = pickNeighbour(rects[at], rects, dx, dy, at);
    if (i < 0 && dy) i = at + dy >= 0 && at + dy < s.items.length ? at + dy : -1; // nothing that way on screen: the list order
    if (i >= 0) setFocus(s.items[i]);
  }

  return {
    /** A pad action from gamepad.js. Returns true when a menu took it. */
    handle(action) {
      const s = sync();
      if (!s) return false;
      if (s.m.pad && s.m.pad(action)) { sync(); return true; }
      if (action === 'confirm') { if (focused) focused.click(); sync(); return true; }
      if (action === 'back') { if (s.m.back) s.m.back(); sync(); return true; }
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') { step(action); return true; }
      return true; // tabprev / tabnext / x / y on a menu without them: nothing
    },
    sync,
    /** The pad stopped driving (a key or click): the ring goes, the browser focus stays. */
    hideRing() { if (focused) ringOf(focused).classList.remove('octo-pad-focus'); },
    focused() { return focused; },
  };
}
