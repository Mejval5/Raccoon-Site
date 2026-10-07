// Shops (round 22, behind ?v2=1). A shop room (level.js, 'shop' tag) has a keeper and three item
// pedestals. Swim onto a pedestal with enough shells to buy what stands on it. The currency is SHELLS.
// Items are data rows in data/shop-items.json (effect 'bombs' or 'heart', an amount, a price), so more
// can be added later without touching code. A row with `rare` (0..1) is stocked only in that share of stalls.
//
// Flat state: one small record per shop; the wallet lives in the run (run.shells), passed in and returned.

import { mulberry32, hashSeed2 } from './rng.js';
import { BOMB_MAX, HEART_MAX } from './config.js';
import { canCarry, giveItem, isItem } from './items.js';

export const BUY_R = 0.9;         // octopus centre to pedestal centre
export const SHOP_SLOTS = 3;

/** @param {{items:any[]}} json */
export function parseShopItems(json) {
  for (const it of json.items) {
    const okEffect = it.effect === 'bombs' || it.effect === 'heart' || (it.effect === 'carry' && isItem(it.item));
    if (!it.id || !(it.price > 0) || !okEffect) throw new Error('shop item ' + it.id + ' is malformed');
  }
  return json.items.map((it) => ({ amount: 1, glyph: it.id, ...it }));
}

export async function fetchShopItems(url = 'data/shop-items.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('shop-items.json ' + res.status);
  return parseShopItems(await res.json());
}

/** Whether the item would do anything for this octopus right now (a full stock refuses, nothing is charged). */
export function canUse(item, octo, inv = []) {
  if (item.effect === 'carry') return canCarry(inv, item.item);
  return item.effect === 'bombs' ? octo.bombs < (octo.bombMax || BOMB_MAX) : octo.hearts < (octo.heartMax || HEART_MAX);
}

/** Apply the item to the octopus. Bombs and hearts stop at their maximum. */
export function applyItem(item, octo, inv = []) {
  if (item.effect === 'carry') giveItem(inv, octo, item.item);
  else if (item.effect === 'bombs') octo.bombs = Math.min(octo.bombMax || BOMB_MAX, octo.bombs + item.amount);
  else octo.hearts = Math.min(octo.heartMax || HEART_MAX, octo.hearts + item.amount);
}

/**
 * The stall of one level: which item is on each pedestal (the first three rows, or three picked by seed
 * when the table has more), what has sold, and the last "why not" message.
 * @param {{kx:number,ky:number,px:Int16Array}} shop level.shop
 */
export function createShopState(shop, items, runSeed, levelIndex, owned = []) {
  if (!shop || !items.length) return null;
  // a one-of item the player already carries is not offered again; a row with `rare` (0..1) is only on offer when this
  // stall's roll for it passes (its own stream, so the shuffle below is the same whether it is in or not)
  const rareRng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0x6a7e));
  const rareOk = items.map((it) => { const r = rareRng(); return !(it.rare > 0) || r < it.rare; });
  let order = items.map((_, i) => i).filter((i) => rareOk[i] && (items[i].effect !== 'carry' || canCarry(owned, items[i].item)));
  if (order.length < SHOP_SLOTS) order = items.map((_, i) => i);
  if (order.length > SHOP_SLOTS) {
    const rng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0x5a09));
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
  }
  const stock = new Uint8Array(SHOP_SLOTS);
  for (let i = 0; i < SHOP_SLOTS; i++) stock[i] = order[i % order.length];
  return {
    shop, items, stock,
    sold: new Uint8Array(SHOP_SLOTS),
    px: Float32Array.from({ length: SHOP_SLOTS * 2 }, (_, i) => shop.px[i] + 0.5),
    keeperX: shop.kx + 0.5, keeperY: shop.ky + 0.5,
    msgCooldown: 0,
    flinch: 0, // s left of the keeper's flinch after a blast nearby (shopBlast)
  };
}

export const FLINCH_S = 0.5;
/** A blast at (x, y) with radius r: a keeper within 3 radii flinches. Returns true when it did. */
export function shopBlast(st, x, y, r) {
  if (!st) return false;
  if (Math.hypot(st.keeperX - x, st.keeperY - y) > r * 3) return false;
  st.flinch = FLINCH_S;
  return true;
}

/**
 * One fixed step. Swimming onto a pedestal buys its item when the wallet allows.
 * Returns null, or an event {type:'bought'|'poor'|'full', slot, item, price, shells (wallet after)}.
 */
export function shopStep(st, octo, shells, dt, inv = []) {
  if (!st) return null;
  if (st.msgCooldown > 0) st.msgCooldown = Math.max(0, st.msgCooldown - dt);
  if (st.flinch > 0) st.flinch = Math.max(0, st.flinch - dt);
  for (let i = 0; i < SHOP_SLOTS; i++) {
    if (st.sold[i]) continue;
    if (Math.hypot(octo.x - st.px[i * 2], octo.y - st.px[i * 2 + 1]) > BUY_R) continue;
    const item = st.items[st.stock[i]];
    if (!canUse(item, octo, inv)) {
      if (st.msgCooldown > 0) return null;
      st.msgCooldown = 1.6;
      return { type: 'full', slot: i, item, price: item.price, shells };
    }
    if (shells < item.price) {
      if (st.msgCooldown > 0) return null;
      st.msgCooldown = 1.6;
      return { type: 'poor', slot: i, item, price: item.price, shells };
    }
    applyItem(item, octo, inv);
    st.sold[i] = 1;
    return { type: 'bought', slot: i, item, price: item.price, shells: shells - item.price };
  }
  return null;
}
