// Player settings (round 38): one flat table of definitions, no DOM and no storage. save.js persists the values,
// settings-ui.js draws the panel from SETTING_DEFS, main.js applies a change the moment it happens.
//
// Values: music / SFX volume (0..1), screen shake on/off, reduced motion (null = follow the OS, else the player's
// choice), octopus sink strength (0..2 u/s^2), and the seed of the next run ('' = random).

import { OCTO_IDLE_SINK } from './config.js';

export const SEED_MAX = 4294967295;

/** @type {{key:string, kind:'range'|'toggle'|'seed', label:string, def:any, min?:number, max?:number, step?:number, hint?:string}[]} */
export const SETTING_DEFS = [
  { key: 'musicVol', kind: 'range', label: 'Music volume', def: 1, min: 0, max: 1, step: 0.05 },
  { key: 'sfxVol', kind: 'range', label: 'Sound effects volume', def: 1, min: 0, max: 1, step: 0.05 },
  { key: 'shake', kind: 'toggle', label: 'Screen shake', def: true },
  { key: 'reducedMotion', kind: 'toggle', label: 'Reduced motion', def: null, hint: 'Fewer particles, bubbles and hit pauses. Starts from your system setting.' },
  { key: 'sink', kind: 'range', label: 'Octopus sink', def: OCTO_IDLE_SINK, min: 0, max: 2, step: 0.05, hint: 'How fast you drift down when you stop swimming. 0 = float.' },
  { key: 'seed', kind: 'seed', label: 'Seed for the next dive', def: '', hint: 'Blank = a random dive. The same number gives the same levels.' },
];

const BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key, d]));

/** Controls help per input method, shown in the panel (the on-screen hint at the bottom left uses the keyboard / mouse lines). */
export const CONTROLS_HELP = [
  { id: 'keyboard', title: 'Keyboard', lines: ['Swim: WASD or the arrow keys', 'Dash: Space or Shift', 'Hand: F grabs what is in reach, talks, buys; F again throws it, hold F to put it down', 'Ink jet: J or K (the way you face)', 'Use the selected hotbar slot: C (cast the spell, drop a bomb)', 'Drop a bomb: B or X', 'Hotbar: Q / E or 1-9', 'Inventory: Tab or I', 'Pause: Esc'] },
  { id: 'mouse', title: 'Mouse', lines: ['Ink jet: left button, at the cursor (hold to keep squirting)', 'Use the selected hotbar slot: right button (a spell toward the cursor; a bomb thrown at the cursor sticks where it lands, on the octopus it drops)', 'Quick bomb: middle button, at the cursor', 'Throw what you hold: F, toward the cursor', 'Hotbar: the wheel'] },
  { id: 'touch', title: 'Touch', lines: ['Swim: drag on the left half of the screen', 'Jet, Dash, Use and Spell: the buttons at the bottom right (Jet aims at the nearest creature; Use uses the selected hotbar slot)', 'Hand: when you hover still next to something, Spell turns into Grab or Talk; while you carry, it reads Throw', 'Bombs: Use drops one under you, or throws a sticky one the way the stick points', 'Hotbar: tap a slot on the bar at the top', 'Pause and settings: the buttons at the top right'] },
];

export function settingDef(key) { return BY_KEY.get(key) || null; }

/** Round to the slider step so a stored 0.30000000000000004 reads 0.3. */
function snap(def, v) {
  const k = def.step ? Math.round((v - def.min) / def.step) * def.step + def.min : v;
  return Math.min(def.max, Math.max(def.min, Math.round(k * 1e4) / 1e4));
}

/** Clean one value for a definition; junk falls back to the default. */
export function cleanSetting(key, v) {
  const def = BY_KEY.get(key);
  if (!def) return undefined;
  if (def.kind === 'range') {
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    return Number.isFinite(n) ? snap(def, n) : def.def;
  }
  if (def.kind === 'toggle') {
    if (v === null || v === undefined) return def.def;
    return !!v;
  }
  return cleanSeedText(v);
}

/** Seed text: digits only, at most 10, at most SEED_MAX, no leading zeros ('' = random). */
export function cleanSeedText(v) {
  let t = String(v === null || v === undefined ? '' : v).replace(/\D/g, '').slice(0, 10).replace(/^0+(?=\d)/, '');
  if (t !== '' && Number(t) > SEED_MAX) t = String(SEED_MAX);
  return t;
}

/** The seed number for a stored text, or null for blank (random). */
export function seedFromText(t) {
  const c = cleanSeedText(t);
  return c === '' ? null : Number(c);
}

export function defaultSettings() {
  const out = {};
  for (const d of SETTING_DEFS) out[d.key] = d.def;
  return out;
}

/** Whole settings object from storage: every known key cleaned, unknown keys dropped. */
export function cleanSettings(raw) {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;
  for (const d of SETTING_DEFS) if (d.key in raw) out[d.key] = cleanSetting(d.key, raw[d.key]);
  return out;
}
