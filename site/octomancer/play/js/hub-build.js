// Hub building (octomancer-web/HUB-BUILDING.md, Daniel 2026-10-18): the shells carried out of every run are banked into a hoard
// (save.js), and the hoard pays for decorations on marked spots in the hub. Purely decorative: nothing here changes gameplay.
// Pure data and geometry (no DOM, no drawing): the catalogue (data/hub-build.json), the unlock tiers, which pieces fit which
// spot, the picker's rows, the spots laid into the hub level, and the build decision. main.js wires it in, hub-build-draw.js
// draws it, build-picker.js is the picker.

import { conditionMet } from './hub-rooms.js';

export const SPOT_TYPES = ['hook', 'niche', 'ledge', 'plaza', 'mural'];
export const OUTLINE_NEAR = 3; // tiles: an empty spot's chalk outline shows when an octopus is this close
export const TALLY_NEAR = 2.5; // tiles: the tally stone shows the count this close
export const SPOT_REACH = 1.5; // tiles from the octopus to a spot's touch point for the hand
export const CLEAR = 'clear'; // the picker's Clear row

/** @param {any} json data/hub-build.json */
export function parseHubBuild(json) {
  const decor = (json.decor || []).map((d) => ({ ...d, fits: d.fits || [], cost: d.cost | 0, tier: d.tier | 0 }));
  return { tiers: json.tiers || [0], pile: json.pile || [1], decor, byId: new Map(decor.map((d) => [d.id, d])) };
}

export async function fetchHubBuild(url = new URL('../data/hub-build.json', import.meta.url).href) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('hub-build.json: ' + res.status);
  return parseHubBuild(await res.json());
}

/** The highest tier unlocked by `lifetime` banked shells. */
export function tierOf(table, lifetime) {
  let t = 0;
  for (let i = 0; i < table.tiers.length; i++) if ((lifetime | 0) >= table.tiers[i]) t = i;
  return t;
}

/** The pile's stage (0 = the empty stone ring, 1..5) for a hoard balance. */
export function pileStage(table, shells) {
  let s = 0;
  for (let i = 0; i < table.pile.length; i++) if ((shells | 0) >= table.pile[i]) s = i + 1;
  return s;
}

/** Does a decoration fit a spot? */
export function fitsSpot(deco, spot) { return !!deco && !!spot && deco.fits.includes(spot.type); }

/** Every decoration that fits spot type `type`, in catalogue order. */
export function decorFor(table, type) { return table.decor.filter((d) => d.fits.includes(type)); }

/**
 * A decoration's state for the picker: {unlocked, lock ('' | 'tier' | 'need'), afford, missing (shells short), toTier (more
 * lifetime shells to bank for its tier)}. `ctx` = hub-rooms.js conditionMet's {story, stat}.
 */
export function decoState(table, deco, hoard, ctx) {
  const life = hoard.lifetime | 0, have = hoard.shells | 0;
  const tierAt = table.tiers[deco.tier] | 0;
  const tierOk = life >= tierAt;
  const needOk = !deco.need || conditionMet(deco.need, ctx || {});
  const unlocked = tierOk && needOk;
  return { unlocked, lock: !tierOk ? 'tier' : !needOk ? 'need' : '', afford: have >= deco.cost, missing: Math.max(0, deco.cost - have), toTier: Math.max(0, tierAt - life) };
}

/**
 * The picker's rows for a spot: the fitting decorations (each {id, name, cost, deco, current, ...decoState}), and a Clear row
 * ({id: 'clear', cost: 0}) first when something stands on the spot.
 */
export function pickerRows(table, spot, current, hoard, ctx) {
  const rows = [];
  if (current) rows.push({ id: CLEAR, name: 'Clear', cost: 0, deco: null, current: false, unlocked: true, lock: '', afford: true, missing: 0, toTier: 0 });
  for (const d of decorFor(table, spot.type)) rows.push({ id: d.id, name: d.name, cost: d.cost, deco: d, current: d.id === current, ...decoState(table, d, hoard, ctx) });
  return rows;
}

/**
 * Decide a build: {ok, cost, reason}. `decoId` 'clear' clears the spot (free, no refund). reason: 'unknown' | 'fit' | 'tier' |
 * 'need' | 'shells' | 'same'. Pure: main.js spends (save.js spendHoard) and stores (setHubPiece) when ok.
 */
export function decideBuild(table, spot, decoId, current, hoard, ctx) {
  if (decoId === CLEAR) return current ? { ok: true, cost: 0, reason: '' } : { ok: false, cost: 0, reason: 'same' };
  const d = table.byId.get(decoId);
  if (!d) return { ok: false, cost: 0, reason: 'unknown' };
  if (!fitsSpot(d, spot)) return { ok: false, cost: d.cost, reason: 'fit' };
  if (current === decoId) return { ok: false, cost: d.cost, reason: 'same' };
  const st = decoState(table, d, hoard, ctx);
  if (!st.unlocked) return { ok: false, cost: d.cost, reason: st.lock };
  if (!st.afford) return { ok: false, cost: d.cost, reason: 'shells' };
  return { ok: true, cost: d.cost, reason: '' };
}

/**
 * Lay the build spots into a parsed hub level (after hub-rooms.js applyHubRooms, so level.village says which rooms are open):
 * level.build = {pile, tally, spots: [{id, type, x, y, side, w, h, room, open}]}. A room's spot is open only while its room is.
 * Floor pieces keep the plants off their footprint (level.keepOut, read by world-v2.js when the world is built), built or not,
 * so building never changes the plants.
 */
export function placeSpots(level, json) {
  if (!json) { level.build = null; return null; }
  const roomOpen = (id) => { if (!id) return true; const r = (level.village || []).find((v) => v.id === id); return !!(r && r.open); };
  const spots = (json.spots || []).map((s) => ({ id: s.id, type: s.type, x: +s.x, y: +s.y, side: s.side || 'left', w: s.w || 0, h: s.h || 0, room: s.room || '', open: roomOpen(s.room) }));
  level.keepOut = level.keepOut || [];
  const keep = (x, y, half) => level.keepOut.push({ x0: Math.floor(x - half), x1: Math.ceil(x + half), y0: Math.floor(y - 2), y1: Math.ceil(y + 1) });
  for (const s of spots) {
    if (s.type === 'ledge' || s.type === 'plaza') keep(s.x, s.y, s.type === 'plaza' ? 1.6 : 0.9);
    else if (s.type === 'niche') level.keepOut.push({ x0: Math.floor(s.x - 1.5), x1: Math.ceil(s.x + 1.5), y0: Math.floor(s.y - 1), y1: Math.ceil(s.y + 1) });
    else if (s.type === 'hook') level.keepOut.push({ x0: Math.floor(s.x - 0.8), x1: Math.ceil(s.x + 0.8), y0: Math.floor(s.y - 1), y1: Math.ceil(s.y + 1) });
  }
  if (json.pile) keep(json.pile.x, json.pile.y, 1.2);
  if (json.tally) keep(json.tally.x, json.tally.y, 0.5);
  level.build = { pile: json.pile || null, tally: json.tally || null, spots };
  return level.build;
}

/** Where the hand reaches for a spot (and its tag is anchored): just inside the water in front of it. */
export function spotPoint(s) {
  switch (s.type) {
    case 'hook': return { x: s.x, y: s.y + 1.4 };
    case 'niche': return { x: s.x + (s.side === 'right' ? -0.55 : 0.55), y: s.y };
    case 'mural': return { x: s.x, y: s.y };
    default: return { x: s.x, y: s.y - 0.55 };
  }
}

/** How far the hand reaches for a spot (the mural is big: anywhere in front of it). */
export function spotReach(s) { return s.type === 'mural' ? Math.max(1.6, Math.min(s.w, s.h) * 0.6) : SPOT_REACH; }

/** The nearest open spot whose touch point is within reach of (x, y), or null. */
export function spotAt(build, x, y, reach = 0) {
  if (!build) return null;
  let best = null, bd = 1e9;
  for (const s of build.spots) {
    if (!s.open) continue;
    const p = spotPoint(s), d = Math.hypot(x - p.x, y - p.y);
    if (d <= Math.max(reach, spotReach(s)) && d < bd) { bd = d; best = s; }
  }
  return best;
}

/** The ids of the spots the build holds a known decoration on that fits it (what is drawn), as [{spot, deco}]. */
export function builtPieces(table, build, hubBuild) {
  const out = [];
  if (!build) return out;
  for (const s of build.spots) {
    const id = hubBuild[s.id];
    const d = id ? table.byId.get(id) : null;
    if (d && s.open && fitsSpot(d, s)) out.push({ spot: s, deco: d });
  }
  return out;
}
