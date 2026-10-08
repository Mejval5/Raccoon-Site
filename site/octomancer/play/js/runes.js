// Rune pedestals (SPELLS-PICK.md): how the first spell set is found. Each Shallows level of a dive holds one carved stone with a
// rune on it: a new spell (it becomes a hotbar slot) or a modifier (it is set into a slot, at most SLOT.maxMods per slot). Ink Cloud
// is always the start; the rest come in a seeded order per dive, the spells first. Pure data and rules here (no DOM, no world):
// main.js places the pedestal and calls takeRune when the octopus has stayed on it for PICKUP_DWELL s.
//
// One easy-to-retarget pickup: main.js tryTakeRune() is the only caller. When the hand (F, V2-PLAN 17) lands on master, its
// interact verb calls that function instead of the swim-over dwell.

import { spellById, modById, modApplies, SLOT, START_SPELL } from './spells.js';
import { addSpell } from './hotbar.js';

/** Every rune a pedestal may hold, spells before modifiers (the order the seeded shuffle starts from). Lure waits for infighting. */
export const RUNE_SPELLS = ['riptide', 'coral-wall', 'anchor'];
export const RUNE_MODS = ['heavy', 'delayed', 'lingering'];
export const PICKUP_DWELL = 0.5; // s on the pedestal before the rune is taken (a swim past does not take it)
export const PEDESTAL_R = 0.75;  // tiles: the octopus is "on" it this close

export function runeName(id) { const r = spellById(id) || modById(id); return r ? r.name : id; }
export function isSpellRune(id) { return !!spellById(id); }

/** Is rune `id` already on the hotbar (a spell slot, or a modifier set into any slot)? */
export function ownsRune(hb, id) {
  for (const s of hb.slots) if (s.ids.indexOf(id) >= 0) return true;
  return false;
}

function rng(seed) {
  let h = seed >>> 0;
  return () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
}
/**
 * The rune on the next level of the dive with `diveSeed`, or null when the hotbar already holds every rune. The dive's order is
 * a seeded shuffle of the spells followed by a shuffle of the modifiers; a level gives the first rune of that order not yet owned,
 * so a death (a fresh hotbar) starts the order again and two levels never give the same rune.
 */
export function runeForLevel(diveSeed, hb) {
  const r = rng((diveSeed >>> 0) ^ 0x5eed);
  const sh = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; } return b; };
  const order = sh(RUNE_SPELLS).concat(sh(RUNE_MODS));
  for (const id of order) {
    if (ownsRune(hb, id) || id === START_SPELL) continue;
    return id;
  }
  return null;
}

/** The slot a modifier would go into: the selected one when it fits, else the first one that takes it; -1 when none does. */
export function slotForMod(hb, modId) {
  const fits = (s) => {
    const spell = s.ids.find((id) => spellById(id));
    if (!spell || !modApplies(spell, modId) || s.ids.indexOf(modId) >= 0) return false;
    let mods = 0; for (const id of s.ids) if (modById(id)) mods++;
    return mods < SLOT.maxMods;
  };
  if (hb.slots[hb.sel] && fits(hb.slots[hb.sel])) return hb.sel;
  for (let i = 0; i < hb.slots.length; i++) if (fits(hb.slots[i])) return i;
  return -1;
}

/**
 * Take rune `id` onto the hotbar: a spell becomes a new slot (and is selected), a modifier is set into slotForMod's slot.
 * Returns the slot index it went to, or -1 when it cannot be taken (the bar is full, no slot takes the modifier): it stays on its pedestal.
 */
export function takeRune(hb, id) {
  if (spellById(id)) {
    if (!addSpell(hb, id)) return -1;
    hb.sel = hb.slots.length - 1;
    return hb.sel;
  }
  if (!modById(id)) return -1;
  const i = slotForMod(hb, id);
  if (i < 0) return -1;
  hb.slots[i].ids.push(id);
  return i;
}
