// Controller Phase 1 (octomancer-web/CONTROLLER-PLAN.md): which key, button or stick does an action, per input scheme, as a
// short label ('F', 'LMB', 'A', 'RT' ...) and a small icon drawn in code (a ring or cap with a letter, Milan-style muted
// colours on dark ink, no gloss). Everything that names a control goes through here so it can follow the active scheme:
// the bottom-left controls line now (ui.js), signs, cave paintings and object prompts in Phase 2B.
//
//   glyph(action, scheme, style?) -> { label, kind, tint, text, draw(ctx, x, y, r) }   (null for an action the scheme lacks)
//   controlsLine(scheme, style?)  -> { text, parts: [{ name, glyphs: [glyph ...], note }] }
//   drawGlyph(ctx, g, x, y, r)    -> draws g centred at (x, y), r = the icon's half height in px
//
// scheme: 'keyboard' | 'mouse' | 'pad' | 'touch' (input.mode()), or 'desktop' (Phase 2B: signs and paintings, which must not
// flip between F and MMB as the player alternates keys and clicks: the one keyboard+mouse set, each action on its usual
// key or button first: F, LMB, RMB, Space ...); style: 'xbox' | 'ps' for a pad (input.padStyle()).
// Actions: move aim dash attack use hand cycle prev next select inventory pause bomb confirm back.
//
// Phase 2B: drawGlyph takes an optional `look` (fill, line, text, key, face tints) so the same glyphs can be burnt into a
// wooden sign (LOOK_WOOD) or painted on the rock in ochre and charcoal (LOOK_PAINT) instead of the HUD's dark ink.

const INK0 = 'rgba(14, 30, 34, 0.82)';  // the icon's fill: the HUD's dark sea ink
const BONE = '#e6ddc9', BONE0 = BONE;    // letters and plain rims: old bone
const SEA0 = '#9fd8c4';                  // the HUD's pale sea green
// face buttons, muted to stones and weed rather than toy colours
const TINT = { a: '#8fbf8a', b: '#c98f7c', x: '#88a7c9', y: '#c9bb8c' };

// --- the pad: Xbox names; the PlayStation set maps onto them
const PAD_XBOX = {
  a: { label: 'A', kind: 'face', tint: TINT.a }, b: { label: 'B', kind: 'face', tint: TINT.b },
  x: { label: 'X', kind: 'face', tint: TINT.x }, y: { label: 'Y', kind: 'face', tint: TINT.y },
  lb: { label: 'LB', kind: 'bumper' }, rb: { label: 'RB', kind: 'bumper' }, lt: { label: 'LT', kind: 'trigger' }, rt: { label: 'RT', kind: 'trigger' },
  back: { label: 'View', kind: 'small', sym: 'view' }, start: { label: 'Menu', kind: 'small', sym: 'menu' },
  ls: { label: 'LS', kind: 'stick' }, rs: { label: 'RS', kind: 'stick' },
  up: { label: 'D-pad up', kind: 'dpad', arm: 'up' }, down: { label: 'D-pad down', kind: 'dpad', arm: 'down' },
  left: { label: 'D-pad left', kind: 'dpad', arm: 'left' }, right: { label: 'D-pad right', kind: 'dpad', arm: 'right' },
  lr: { label: 'D-pad left / right', kind: 'dpad', arm: 'lr' },
};
const PAD_PS = {
  ...PAD_XBOX,
  a: { label: 'Cross', kind: 'face', tint: '#93aed0', sym: 'cross' }, b: { label: 'Circle', kind: 'face', tint: '#c98f7c', sym: 'circle' },
  x: { label: 'Square', kind: 'face', tint: '#c49bb8', sym: 'square' }, y: { label: 'Triangle', kind: 'face', tint: '#8fbfa8', sym: 'triangle' },
  lb: { label: 'L1', kind: 'bumper' }, rb: { label: 'R1', kind: 'bumper' }, lt: { label: 'L2', kind: 'trigger' }, rt: { label: 'R2', kind: 'trigger' },
  back: { label: 'Create', kind: 'small', sym: 'create' }, start: { label: 'Options', kind: 'small', sym: 'menu' },
  ls: { label: 'L', kind: 'stick' }, rs: { label: 'R', kind: 'stick' },
};
/** Which pad button(s) each action is on (the first is the one a prompt shows). Mirrors gamepad.js. */
export const PAD_MAP = {
  move: ['ls'], aim: ['rs'], attack: ['rt'], use: ['rb'], hand: ['a'], dash: ['b', 'lt'],
  cycle: ['lb', 'lr'], prev: ['left'], next: ['lb'], select: ['up'], bomb: ['up'], inventory: ['back'], pause: ['start'],
  confirm: ['a'], back: ['b'],
};
// --- keyboard and mouse (one desktop scheme: the line lists both, a prompt shows the scheme's own)
const KEY_MAP = {
  move: ['WASD'], dash: ['Space'], attack: ['J'], use: ['C'], hand: ['F'], cycle: ['Q', 'E'], prev: ['Q'], next: ['E'],
  select: ['1'], bomb: ['B'], inventory: ['Tab'], pause: ['Esc'], confirm: ['Enter'], back: ['Esc'], aim: [],
};
const MOUSE_MAP = { attack: ['LMB'], use: ['RMB'], hand: ['MMB'], cycle: ['Wheel'], aim: ['Cursor'] };
// Phase 2B: the desktop set for signs and paintings ('m:' = a mouse button), the usual one first
const DESKTOP_MAP = {
  move: ['WASD'], aim: ['m:Cursor'], attack: ['m:LMB', 'J'], use: ['m:RMB', 'C'], hand: ['F', 'm:MMB'], dash: ['Space', 'Shift'],
  cycle: ['Q', 'E', 'm:Wheel'], prev: ['Q'], next: ['E'], select: ['1-9'], bomb: ['B', 'X'], inventory: ['Tab', 'I'], pause: ['Esc'],
  confirm: ['Enter'], back: ['Esc'],
};
/** The scheme signs and paintings use for an input mode: 'pad', 'touch', else 'desktop' (keyboard and mouse are one set there). */
export function signScheme(mode) { return mode === 'pad' ? 'pad' : mode === 'touch' ? 'touch' : 'desktop'; }
const TOUCH_MAP = {
  move: ['Stick'], dash: ['Dash'], attack: ['Jet'], use: ['Use'], hand: ['Grab'], cycle: ['Bar'], select: ['Bar'], bomb: ['Use'],
  inventory: ['Pause'], pause: ['Pause'], confirm: ['Tap'], back: ['Tap'],
};

/** A key cap or mouse glyph for a literal key name ('J', 'K', 'Shift', 'LMB' ...): sign text names a second key with {key:J}. */
export function keyGlyph(k) { return /^(LMB|RMB|MMB|Wheel|Cursor)$/.test(k) ? cached('mouse:' + k, mouseDef(k)) : cached('key:' + k, keyDef(k)); }
function make(def) {
  const g = { label: def.label, kind: def.kind, tint: def.tint || BONE, sym: def.sym || '', arm: def.arm || '', text: def.label };
  g.draw = (ctx, x, y, r) => drawGlyph(ctx, g, x, y, r);
  return g;
}
const cache = new Map();
function cached(key, def) {
  let g = cache.get(key);
  if (!g) { g = make(def); cache.set(key, g); }
  return g;
}
function keyDef(k) { return { label: k, kind: k.length > 2 ? 'wide' : 'key' }; }
function mouseDef(k) { return { label: k, kind: 'mouse', arm: k === 'LMB' ? 'l' : k === 'RMB' ? 'r' : k === 'MMB' || k === 'Wheel' ? 'm' : '' }; }

/** Every glyph of `action` in `scheme` (a pad lists its alternatives, e.g. dash: B and LT). */
export function glyphs(action, scheme, style = 'xbox') {
  if (scheme === 'pad') {
    const set = style === 'ps' ? PAD_PS : PAD_XBOX;
    return (PAD_MAP[action] || []).map((b) => cached('pad:' + style + ':' + b, set[b]));
  }
  if (scheme === 'touch') return (TOUCH_MAP[action] || []).map((k) => cached('touch:' + k, { label: k, kind: 'wide' }));
  if (scheme === 'desktop') return (DESKTOP_MAP[action] || []).map((k) => (k.startsWith('m:') ? cached('mouse:' + k.slice(2), mouseDef(k.slice(2))) : cached('key:' + k, keyDef(k))));
  const out = [];
  if (scheme === 'mouse') for (const k of MOUSE_MAP[action] || []) out.push(cached('mouse:' + k, mouseDef(k)));
  for (const k of KEY_MAP[action] || []) out.push(cached('key:' + k, keyDef(k)));
  if (scheme !== 'mouse') for (const k of MOUSE_MAP[action] || []) out.push(cached('mouse:' + k, mouseDef(k)));
  return out;
}
/** The one glyph a prompt shows for `action` (null when the scheme has none). */
export function glyph(action, scheme, style = 'xbox') {
  return glyphs(action, scheme, style)[0] || null;
}

// --- the bottom-left line
const PAD_LINE = [
  ['Swim', 'move'], ['Aim', 'aim'], ['Ink jet', 'attack'], ['Use slot', 'use'], ['Hand', 'hand', 'hold drops'],
  ['Dash', 'dash'], ['Hotbar', 'cycle'], ['Bombs', 'select'], ['Inventory', 'inventory'], ['Pause', 'pause'],
];
// the desktop line names keys and buttons in words (the long-standing text; spells-cdp checks it)
const DESKTOP_TEXT = 'Swim: WASD/arrows | Dash: Space/Shift | Hand: F or middle-click (grab, talk, buy; again throws, hold drops) | Ink jet: left-click or J/K | Use slot: right-click or C (bombs: pick their slot; B/X drops one) | Hotbar: wheel, Q/E, 1-9 | Inventory: Tab/I';
const DESKTOP_TEXT_V1 = 'Swim: WASD/arrows | Dash: Space/Shift | Bomb: B/X';

/**
 * The bottom-left controls line for a scheme. `parts` is what ui.js lays out with icons (pad); `text` is the same line as
 * plain words. Desktop (keyboard or mouse) keeps its words-only line: it lists both devices.
 */
export function controlsLine(scheme, style = 'xbox', v2 = true) {
  if (scheme === 'pad') {
    const parts = PAD_LINE.map(([name, action, note]) => ({ name, glyphs: glyphs(action, 'pad', style), note: note || '' }));
    const text = parts.map((p) => p.name + ': ' + p.glyphs.map((g) => g.label).join('/') + (p.note ? ' (' + p.note + ')' : '')).join(' | ');
    return { scheme, text, parts };
  }
  if (scheme === 'touch') return { scheme, text: '', parts: [] };
  return { scheme: 'keyboard', text: v2 ? DESKTOP_TEXT : DESKTOP_TEXT_V1, parts: [] };
}

// --- drawing (canvas 2D; no images, no gradients, no shadows)
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function letter(ctx, s, x, y, px, col) {
  ctx.fillStyle = col;
  ctx.font = '700 ' + Math.max(6, Math.round(px)) + 'px Quicksand, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y + px * 0.05);
}
/** How wide a glyph draws at half height r (px), so a line of them can be laid out. */
export function glyphWidth(g, r) {
  switch (g.kind) {
    case 'face': case 'stick': case 'dpad': return 2 * r;
    case 'mouse': return 1.5 * r;
    case 'bumper': case 'trigger': return 2.7 * r;
    case 'small': return 2.2 * r;
    case 'wide': return Math.max(2, 0.62 * g.label.length + 0.9) * r;
    default: return 2 * r;
  }
}
/**
 * Looks (Phase 2B): fill = the icon's body, line = rims and outlines, text = letters and marks, key = a key cap's rim,
 * faces = the face buttons' rim colours by label (else the glyph's own tint), rough = a second offset stroke (a painted hand).
 */
export const LOOK_HUD = null;
export const LOOK_WOOD = {
  fill: 'rgba(58, 36, 16, 0.10)', line: '#3a2410', text: '#3a2410', key: '#3a2410', rough: 0,
  faces: { A: '#3f5a2a', B: '#7a2e1c', X: '#2c4258', Y: '#7a5a14', Cross: '#2c4258', Circle: '#7a2e1c', Square: '#5c3050', Triangle: '#3f5a2a' },
};
export const LOOK_PAINT = { // red and yellow ochre, charcoal, green earth: what a cave wall was painted with
  fill: 'rgba(176, 98, 52, 0.16)', line: '#9a4a28', text: '#2a2220', key: '#9a4a28', rough: 0.6,
  faces: { A: '#6f7d3c', B: '#a8452e', X: '#4a5866', Y: '#b88a2e', Cross: '#4a5866', Circle: '#a8452e', Square: '#7a4a5e', Triangle: '#6f7d3c' },
};
/** Draw `g` centred at (x, y); r = half the icon's height in px; `look` (optional) repaints it for a sign or a painting. */
export function drawGlyph(ctx, g, x, y, r, look = null) {
  if (look && look.rough) { // a painted hand: a faint second pass, a little off
    ctx.save(); ctx.globalAlpha *= 0.35; drawGlyphOnce(ctx, g, x + r * 0.07 * look.rough, y + r * 0.05 * look.rough, r, look); ctx.restore();
  }
  drawGlyphOnce(ctx, g, x, y, r, look);
}
function drawGlyphOnce(ctx, g, x, y, r, look) {
  const INK = look ? look.fill : INK0, SEA = look ? look.line : SEA0, BONE = look ? look.text : BONE0, KEY = look ? look.key : BONE0;
  const tint = look ? (look.faces && look.faces[g.label]) || look.line : g.tint;
  const lw = Math.max(1, r * (look ? 0.14 : 0.16));
  ctx.save();
  ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const w = glyphWidth(g, r);
  switch (g.kind) {
    case 'face': {
      ctx.fillStyle = INK; ctx.strokeStyle = tint;
      ctx.beginPath(); ctx.arc(x, y, r - lw / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (g.sym) drawPsSymbol(ctx, g.sym, x, y, r * 0.48, look ? BONE : tint, lw);
      else letter(ctx, g.label, x, y, r * 1.15, look ? BONE : tint);
      break;
    }
    case 'stick': {
      ctx.fillStyle = INK; ctx.strokeStyle = SEA;
      ctx.beginPath(); ctx.arc(x, y, r - lw / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      letter(ctx, g.label, x, y, r * (g.label.length > 1 ? 0.78 : 1), BONE);
      break;
    }
    case 'bumper': case 'trigger': {
      const h = 2 * r - lw, top = y - h / 2;
      ctx.fillStyle = INK; ctx.strokeStyle = SEA;
      if (g.kind === 'trigger') { // a trigger: rounded on top like the real one
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + lw / 2, y + h / 2); ctx.lineTo(x - w / 2 + lw / 2, top + h * 0.45);
        ctx.quadraticCurveTo(x - w / 2 + lw / 2, top, x, top); ctx.quadraticCurveTo(x + w / 2 - lw / 2, top, x + w / 2 - lw / 2, top + h * 0.45);
        ctx.lineTo(x + w / 2 - lw / 2, y + h / 2); ctx.closePath();
      } else rrect(ctx, x - w / 2 + lw / 2, top + h * 0.12, w - lw, h * 0.76, h * 0.3);
      ctx.fill(); ctx.stroke();
      letter(ctx, g.label, x, y + (g.kind === 'trigger' ? r * 0.08 : 0), r * 0.9, BONE);
      break;
    }
    case 'small': {
      // View / Menu / Create / Options: a small pill with the button's own mark (two squares, three lines, three rays)
      const h = r * 1.6;
      ctx.fillStyle = INK; ctx.strokeStyle = SEA;
      rrect(ctx, x - w / 2 + lw / 2, y - h / 2, w - lw, h, h / 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = BONE; ctx.lineWidth = Math.max(1, lw * 0.9);
      const u = r * 0.32;
      ctx.beginPath();
      if (g.sym === 'view') { ctx.rect(x - u * 1.25, y - u * 0.9, u * 1.5, u * 1.3); ctx.moveTo(x - u * 0.45, y + u * 0.9); ctx.lineTo(x + u * 1.25, y + u * 0.9); ctx.lineTo(x + u * 1.25, y - u * 0.2); }
      else if (g.sym === 'create') { ctx.moveTo(x, y + u); ctx.lineTo(x, y - u); ctx.moveTo(x - u * 0.9, y + u); ctx.lineTo(x - u * 1.1, y - u * 0.6); ctx.moveTo(x + u * 0.9, y + u); ctx.lineTo(x + u * 1.1, y - u * 0.6); }
      else { for (let k = -1; k <= 1; k++) { ctx.moveTo(x - u * 1.2, y + k * u * 0.8); ctx.lineTo(x + u * 1.2, y + k * u * 0.8); } }
      ctx.stroke();
      break;
    }
    case 'dpad': {
      const a = r * 0.36, L = r - lw / 2;
      ctx.fillStyle = INK; ctx.strokeStyle = SEA;
      ctx.beginPath();
      ctx.moveTo(x - a, y - L); ctx.lineTo(x + a, y - L); ctx.lineTo(x + a, y - a); ctx.lineTo(x + L, y - a); ctx.lineTo(x + L, y + a);
      ctx.lineTo(x + a, y + a); ctx.lineTo(x + a, y + L); ctx.lineTo(x - a, y + L); ctx.lineTo(x - a, y + a); ctx.lineTo(x - L, y + a);
      ctx.lineTo(x - L, y - a); ctx.lineTo(x - a, y - a); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = BONE;
      const arm = (dx, dy) => { // the arm in use, filled in bone
        const cx = x + dx * (L + a) / 2, cy = y + dy * (L + a) / 2, hw = dx ? (L - a) / 2 : a, hh = dy ? (L - a) / 2 : a;
        ctx.fillRect(cx - hw + lw * 0.6, cy - hh + lw * 0.6, 2 * hw - lw * 1.2, 2 * hh - lw * 1.2);
      };
      if (g.arm === 'up') arm(0, -1); else if (g.arm === 'down') arm(0, 1); else if (g.arm === 'left') arm(-1, 0); else if (g.arm === 'right') arm(1, 0);
      else if (g.arm === 'lr') { arm(-1, 0); arm(1, 0); }
      break;
    }
    case 'mouse': {
      const mw = w - lw, mh = 2 * r - lw, left = x - mw / 2, top = y - mh / 2;
      ctx.fillStyle = INK; ctx.strokeStyle = SEA;
      rrect(ctx, left, top, mw, mh, mw / 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, top + mh * 0.42); ctx.lineTo(left + mw, top + mh * 0.42); ctx.moveTo(x, top); ctx.lineTo(x, top + mh * 0.42); ctx.stroke();
      ctx.fillStyle = BONE;
      if (g.arm === 'l') { ctx.beginPath(); ctx.moveTo(x - lw / 2, top + mh * 0.42 - lw / 2); ctx.lineTo(left + lw / 2, top + mh * 0.42 - lw / 2); ctx.quadraticCurveTo(left + lw / 2, top + lw / 2, x - lw / 2, top + lw / 2); ctx.closePath(); ctx.fill(); }
      else if (g.arm === 'r') { ctx.beginPath(); ctx.moveTo(x + lw / 2, top + mh * 0.42 - lw / 2); ctx.lineTo(left + mw - lw / 2, top + mh * 0.42 - lw / 2); ctx.quadraticCurveTo(left + mw - lw / 2, top + lw / 2, x + lw / 2, top + lw / 2); ctx.closePath(); ctx.fill(); }
      else if (g.arm === 'm') { rrect(ctx, x - lw * 0.8, top + mh * 0.1, lw * 1.6, mh * 0.26, lw * 0.8); ctx.fill(); }
      break;
    }
    default: { // a key cap: slightly uneven, like the hand-drawn F over portals (hand-draw.js drawKeyHint)
      const h = 2 * r - lw, left = x - w / 2 + lw / 2;
      ctx.fillStyle = INK; ctx.strokeStyle = KEY;
      rrect(ctx, left, y - h / 2, w - lw, h, r * 0.38); ctx.fill(); ctx.stroke();
      letter(ctx, g.label, x, y, r * (g.label.length > 2 ? 0.8 : 1.05), BONE);
    }
  }
  ctx.restore();
}
function drawPsSymbol(ctx, sym, x, y, s, col, lw) {
  ctx.strokeStyle = col; ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  if (sym === 'cross') { ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); }
  else if (sym === 'circle') ctx.arc(x, y, s, 0, Math.PI * 2);
  else if (sym === 'square') ctx.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
  else { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.75); ctx.lineTo(x - s, y + s * 0.75); ctx.closePath(); }
  ctx.stroke();
}
