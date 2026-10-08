// Carried items (round 32, behind ?v2=1): small passive upgrades kept in `run.items` (a flat array of item ids)
// from level to level of a dive and lost on death. The octopus is rebuilt for every level, so the effects are
// DERIVED from the array: applyCarried(octo, items) sets the octopus fields the rest of the game reads
// (heartMax, bombMax, swimMul, lightR, magnetR, seeBuried, siphonR, spikeHelmet). Nothing else keeps item state.
//
//   flippers         +20% swim speed
//   lantern          a larger light radius (the Shallows are dim, see render.js drawLight)
//   magnet           pulls shells within 3 tiles
//   bombbag          +3 bombs now and +1 max bombs (stacks)
//   heartcontainer   +1 max heart and heals 1 (stacks)
//   goggles          Sea-glass Goggles: see buried treasure and hidden pockets through the rock (embed.js, embed-draw.js)
//   siphon           the Siphon Shell (section 14): drink the fish juice that beaten creatures leak (within 2 tiles)
//   urchincap        the Urchin Cap (spike helmet): a dash / ram at speed hurts what it hits (strikes.js octoRams)
//
// Found in chests and hidden pockets (loot.js) and sold in the shop (data/shop-items.json, effect "carry").

import { HEART_MAX, BOMB_MAX } from './config.js';

export const ITEM_IDS = ['flippers', 'lantern', 'magnet', 'bombbag', 'heartcontainer', 'goggles', 'siphon', 'urchincap'];
export const ITEM_DEFS = {
  flippers: { name: 'Flippers', blurb: '+20% swim speed', max: 1 },
  lantern: { name: 'Lantern', blurb: 'a larger light radius', max: 1 },
  magnet: { name: 'Shell magnet', blurb: 'pulls in shells within 3 tiles', max: 1 },
  bombbag: { name: 'Bomb bag', blurb: '+3 bombs and +1 max bombs', max: 2 },
  heartcontainer: { name: 'Heart container', blurb: '+1 max heart', max: 2 },
  goggles: { name: 'Sea-glass goggles', blurb: 'you see what is buried in the rock', max: 1 },
  siphon: { name: 'Siphon Shell', blurb: 'drink the fish juice beaten creatures leak', max: 1 },
  urchincap: { name: 'Urchin Cap', blurb: 'your dash spikes what it hits', max: 1 },
};

export const FLIPPER_MUL = 1.2;
export const MAGNET_R = 3;
export const LIGHT_BASE = 4.5;      // tiles of clear sight in the dim Shallows
export const LIGHT_LANTERN = 8.5;
export const BOMBBAG_BOMBS = 3;
export const SIPHON_R = 2; // tiles: leaked fish juice this close is drawn in through the Siphon Shell

export function isItem(id) { return Object.prototype.hasOwnProperty.call(ITEM_DEFS, id); }
export function itemCount(items, id) { let n = 0; for (let i = 0; i < items.length; i++) if (items[i] === id) n++; return n; }
export function hasItem(items, id) { return items.indexOf(id) >= 0; }
export function canCarry(items, id) { return isItem(id) && itemCount(items, id) < ITEM_DEFS[id].max; }
/** Journal id of an item ('flippers' -> 'item-flippers'). */
export function itemJournalId(id) { return 'item-' + id; }
/** Item id for a loot code 1..ITEM_IDS.length (0 = none). */
export function itemFromCode(code) { return code > 0 && code <= ITEM_IDS.length ? ITEM_IDS[code - 1] : ''; }

/** Set the derived fields on the octopus from the carried list. Safe to call any time (levels, pickups). */
export function applyCarried(octo, items) {
  octo.heartMax = HEART_MAX + itemCount(items, 'heartcontainer');
  octo.bombMax = BOMB_MAX + itemCount(items, 'bombbag');
  octo.swimMul = hasItem(items, 'flippers') ? FLIPPER_MUL : 1;
  octo.magnetR = hasItem(items, 'magnet') ? MAGNET_R : 0;
  octo.lightR = hasItem(items, 'lantern') ? LIGHT_LANTERN : LIGHT_BASE;
  octo.seeBuried = hasItem(items, 'goggles');
  octo.siphonR = hasItem(items, 'siphon') ? SIPHON_R : 0;
  octo.spikeHelmet = hasItem(items, 'urchincap');
  if (octo.hearts > octo.heartMax) octo.hearts = octo.heartMax;
  if (octo.bombs > octo.bombMax) octo.bombs = octo.bombMax;
}

/** Pick an item up: push it, update the octopus, run its one-off part (bombs, heal). False when it cannot be carried. */
export function giveItem(items, octo, id) {
  if (!canCarry(items, id)) return false;
  items.push(id);
  applyCarried(octo, items);
  if (id === 'bombbag') octo.bombs = Math.min(octo.bombMax, octo.bombs + BOMBBAG_BOMBS);
  else if (id === 'heartcontainer') octo.hearts = Math.min(octo.heartMax, octo.hearts + 1);
  return true;
}

/** One-line pickup text. */
export function pickupText(id) { const d = ITEM_DEFS[id]; return d.name + ': ' + d.blurb; }
