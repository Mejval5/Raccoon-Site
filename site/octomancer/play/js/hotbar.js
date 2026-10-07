// Spell hotbar (pure data, no DOM). Every slot holds an ARRAY of spell ids (the cast order) so Noita-style crafting can
// later put several spells into one slot; for now a slot always holds exactly one id. `sel` indexes the selected slot.

import { START_SPELL } from './spells.js';

export const MAX_SLOTS = 9;

export function createHotbar(spellIds = [START_SPELL]) {
  return { slots: spellIds.slice(0, MAX_SLOTS).map((id) => ({ ids: [id] })), sel: 0 };
}

/** Step the selection by dir (+1 / -1) with wrap-around; returns the new selection. */
export function selectNext(hb, dir) {
  const n = hb.slots.length;
  if (n === 0) return hb.sel;
  hb.sel = (((hb.sel + (dir < 0 ? -1 : 1)) % n) + n) % n;
  return hb.sel;
}

/** Select slot i (0-based); false and no change when it does not exist. */
export function selectIndex(hb, i) {
  if (!Number.isInteger(i) || i < 0 || i >= hb.slots.length) return false;
  hb.sel = i;
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
  const picked = hb.slots[hb.sel];
  const [s] = hb.slots.splice(from, 1);
  hb.slots.splice(to, 0, s);
  hb.sel = hb.slots.indexOf(picked);
  return true;
}

/** A new slot at the end; false when the bar is full or the spell is already on it. */
export function addSpell(hb, id) {
  if (hb.slots.length >= MAX_SLOTS) return false;
  for (const s of hb.slots) if (s.ids.indexOf(id) >= 0) return false;
  hb.slots.push({ ids: [id] });
  return true;
}

/** Short string that changes whenever the slots, their order or the selection change. */
export function hotbarKey(hb) {
  return hb.sel + ':' + hb.slots.map((s) => s.ids.join('+')).join(',');
}
