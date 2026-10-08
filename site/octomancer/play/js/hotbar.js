// Spell hotbar (pure data, no DOM). Every slot holds an ARRAY of spell ids (the cast order) so Noita-style crafting can
// later put several spells into one slot; for now a slot always holds exactly one id. `sel` indexes the selected slot.
// 2026-10-08 (controls, V2-PLAN 17): a slot can also hold a usable ITEM (HOTBAR_ITEMS, e.g. 'bomb': a stack whose count
// lives on the octopus). Right click / C / the Use button uses the selected slot: a spell casts, an item is used.
// `lastSpell` remembers the last spell slot that was selected (the phone's Spell button casts it while an item is picked).

import { START_SPELL } from './spells.js';

export const MAX_SLOTS = 9;
export const BOMB_SLOT = 'bomb';
/** Ids that are items, not spells (main.js knows how to use each). */
export const HOTBAR_ITEMS = new Set([BOMB_SLOT]);
export function isItemId(id) { return HOTBAR_ITEMS.has(id); }

export function createHotbar(spellIds = [START_SPELL]) {
  return { slots: spellIds.slice(0, MAX_SLOTS).map((id) => ({ ids: [id] })), sel: 0, lastSpell: 0 };
}

function noteSpell(hb) { const s = hb.slots[hb.sel]; if (s && s.ids.length && !isItemId(s.ids[0])) hb.lastSpell = hb.sel; }

/** The slot the phone's Spell button casts: the selected slot when it is a spell, else the last spell slot picked, else the first spell; -1 when none. */
export function castableIndex(hb) {
  const ok = (i) => { const s = hb.slots[i]; return !!(s && s.ids.length && !isItemId(s.ids[0])); };
  if (ok(hb.sel)) return hb.sel;
  if (ok(hb.lastSpell | 0)) return hb.lastSpell | 0;
  for (let i = 0; i < hb.slots.length; i++) if (ok(i)) return i;
  return -1;
}
/** The first id of castableIndex's slot, or null. */
export function castableSpell(hb) { const i = castableIndex(hb); return i < 0 ? null : hb.slots[i].ids[0]; }

/** Make sure item `id` has a slot (appended at the end); returns its index, or -1 when the bar is full. */
export function ensureSlot(hb, id) {
  for (let i = 0; i < hb.slots.length; i++) if (hb.slots[i].ids.indexOf(id) >= 0) return i;
  if (hb.slots.length >= MAX_SLOTS) return -1;
  hb.slots.push({ ids: [id] });
  return hb.slots.length - 1;
}

/** Step the selection by dir (+1 / -1) with wrap-around; returns the new selection. */
export function selectNext(hb, dir) {
  const n = hb.slots.length;
  if (n === 0) return hb.sel;
  hb.sel = (((hb.sel + (dir < 0 ? -1 : 1)) % n) + n) % n;
  noteSpell(hb);
  return hb.sel;
}

/** Select slot i (0-based); false and no change when it does not exist. */
export function selectIndex(hb, i) {
  if (!Number.isInteger(i) || i < 0 || i >= hb.slots.length) return false;
  hb.sel = i;
  noteSpell(hb);
  return true;
}

export function selectedIds(hb) {
  const s = hb.slots[hb.sel];
  return s ? s.ids : [];
}

/** The first spell of the selected slot (the one a cast fires for now), or null. */
export function selectedSpell(hb) {
  const ids = selectedIds(hb);
  return ids.length ? ids[0] : null;
}

/** Reorder: slot `from` goes to index `to`. The selection stays on the same slot object, wherever it lands. */
export function moveSlot(hb, from, to) {
  const n = hb.slots.length;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n || from === to) return false;
  const picked = hb.slots[hb.sel], lastPicked = hb.slots[hb.lastSpell | 0];
  const [s] = hb.slots.splice(from, 1);
  hb.slots.splice(to, 0, s);
  hb.sel = hb.slots.indexOf(picked);
  hb.lastSpell = Math.max(0, hb.slots.indexOf(lastPicked));
  return true;
}

/** A new slot at the end; false when the bar is full or the spell is already on it. */
export function addSpell(hb, id) {
  if (hb.slots.length >= MAX_SLOTS) return false;
  for (const s of hb.slots) if (s.ids.indexOf(id) >= 0) return false;
  hb.slots.push({ ids: [id] });
  return true;
}

/** Swap slots a and b (the journal's Carried page: drag one onto another, or pick one and then the other). The selection stays on the same slot object. */
export function swapSlots(hb, a, b) {
  const n = hb.slots.length;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) return false;
  const picked = hb.slots[hb.sel], last = hb.lastSpell !== undefined ? hb.slots[hb.lastSpell | 0] : null;
  const t = hb.slots[a]; hb.slots[a] = hb.slots[b]; hb.slots[b] = t;
  hb.sel = hb.slots.indexOf(picked);
  if (last) hb.lastSpell = Math.max(0, hb.slots.indexOf(last)); // the controls branch's "last spell slot" follows its slot too
  return true;
}

/** Short string that changes whenever the slots, their order or the selection change. */
export function hotbarKey(hb) {
  return hb.sel + ':' + hb.slots.map((s) => s.ids.join('+')).join(',');
}
