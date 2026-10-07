// Shops (round 22, behind ?v2=1). A shop room (level.js, 'shop' tag) has a keeper and three item
// pedestals. Swim onto a pedestal with enough shells to buy what stands on it. The currency is SHELLS.
// Items are data rows in data/shop-items.json (effect 'bombs' or 'heart', an amount, a price), so more
// can be added later without touching code.
//
// Flat state: one small record per shop; the wallet lives in the run (run.shells), passed in and returned.
//
// 2026-10-07 (destructible shop, Spelunky aggro): the stall is ordinary breakable rock now. Each ware stands on its
// pedestal (W_SHELF) only while the tile under the pedestal stands and no blast or dash knocks it off; then it becomes a
// physics pickup (W_LOOSE, a props.js body) that sinks and rolls. Picking a loose ware up without paying for it is stealing
// ('stolen' event; main.js calls shopAggro('theft')). While the keepers are hostile or this one is dead (st.free) every
// ware is free for the taking.

import { mulberry32, hashSeed2 } from './rng.js';
import { BOMB_MAX, HEART_MAX } from './config.js';
import { octoDashing } from './shop-aggro.js';
import { canCarry, giveItem, isItem } from './items.js';
import { PK_POT } from './props.js';

export const BUY_R = 0.9;         // octopus centre to pedestal centre
export const SHOP_SLOTS = 3;
export const W_SHELF = 0, W_LOOSE = 1, W_GONE = 2; // where a ware is: on its pedestal, a loose physics body, sold or taken
export const WARE_R = 0.3;        // a loose ware's body radius
export const GRAB_R = 0.85;       // octopus centre to a loose ware: picked up
export const KNOCK_R = 1.4;       // blast radii: a ware on its pedestal within this many is knocked off
export const GRAB_GRACE = 0.6;    // s after a dash knocked a ware off before it can be picked up (it flies clear first)

/** Where the keeper sits on the counter: centred between the two pedestals around his spot, on the floor (drawShopArt draws him there). */
export function keeperSeat(shop) {
  let x = shop.kx + 0.5;
  for (let i = 0; i < 2; i++) {
    const a = shop.px[i * 2] + 0.5, b = shop.px[i * 2 + 2] + 0.5;
    if (x >= a && x <= b) { x = (a + b) / 2; break; }
  }
  return { x, y: Math.floor(shop.px[1]) + 1 - 0.72 };
}

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
  // a one-of item the player already carries is not offered again
  let order = items.map((_, i) => i).filter((i) => items[i].effect !== 'carry' || canCarry(owned, items[i].item));
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
    ware: new Uint8Array(SHOP_SLOTS),          // W_SHELF / W_LOOSE / W_GONE
    pid: new Int16Array(SHOP_SLOTS).fill(-1),  // props.js body of a loose ware
    pedGone: new Uint8Array(SHOP_SLOTS),       // the pedestal fell with its floor
    grab: new Float32Array(SHOP_SLOTS),        // s before a knocked-off ware can be picked up
    stolen: 0,                                 // wares taken without paying on this level
    free: false,                               // the keepers are hostile or this one is dead: wares cost nothing
    keeperIdx: -1,                             // his record in main.js's shopkeepers (shopkeeper.js)
    keeperCalm: true,                          // the keeper sits behind the counter (drawShopArt draws him; shopkeeper-draw.js otherwise)
  };
}

export const FLINCH_S = 0.5;
/**
 * A blast at (x, y) with radius r: a keeper within 3 radii flinches (returns true when he did). With `props`, every ware
 * still on its pedestal within KNOCK_R radii is knocked off and thrown away from the blast (see shopWares for the events).
 */
export function shopBlast(st, x, y, r, props = null) {
  if (!st) return false;
  if (props) {
    for (let i = 0; i < SHOP_SLOTS; i++) {
      if (st.ware[i] !== W_SHELF || st.sold[i]) continue;
      const wx = st.px[i * 2], wy = st.px[i * 2 + 1], d = Math.hypot(wx - x, wy - y);
      if (d > r * KNOCK_R) continue;
      const f = 7 * (1 - d / (r * KNOCK_R)) + 2, nx = d > 1e-3 ? (wx - x) / d : 0, ny = d > 1e-3 ? (wy - y) / d : -1;
      looseWare(st, props, i, nx * f, ny * f - 2.5);
    }
  }
  if (Math.hypot(st.keeperX - x, st.keeperY - y) > r * 3) return false;
  st.flinch = FLINCH_S;
  return true;
}

/** Ware i leaves its pedestal as a physics body with velocity (vx, vy). */
function looseWare(st, props, i, vx, vy) {
  const pid = props.add(PK_POT, st.px[i * 2], st.px[i * 2 + 1] - 0.15, vx, vy, { radius: WARE_R });
  if (pid < 0) return false;
  st.ware[i] = W_LOOSE; st.pid[i] = pid;
  return true;
}

/**
 * One fixed step of the wares (v2, with the props system), in this order:
 *   - a pedestal whose floor tile is gone falls and drops its ware ('fell');
 *   - a dash (octoDashing) through a ware on its pedestal knocks it off, flying along the dash ('knocked'): no purchase;
 *   - a loose ware the octopus touches is taken: paid for when the keeper is calm and the wallet allows ('bought', like a
 *     pedestal), otherwise grabbed without paying ('stolen': main.js angers the keepers unless st.free).
 * Events are pushed onto `out` and returned.
 */
export function shopWares(st, props, world, octo, inv = [], out = [], shells = 0, dt = 0.02) {
  if (!st || !props) return out;
  const d = props.data;
  const dashing = octoDashing(octo);
  for (let i = 0; i < SHOP_SLOTS; i++) {
    if (st.grab[i] > 0) st.grab[i] = Math.max(0, st.grab[i] - dt);
    if (!st.pedGone[i] && world.tileAt(Math.floor(st.px[i * 2]), Math.floor(st.px[i * 2 + 1]) + 1) === 0) {
      st.pedGone[i] = 1;
      if (st.ware[i] === W_SHELF && !st.sold[i]) looseWare(st, props, i, 0, 0.5);
      out.push({ type: 'fell', slot: i, x: st.px[i * 2], y: st.px[i * 2 + 1] });
    }
    if (st.ware[i] === W_SHELF && !st.sold[i] && dashing && Math.hypot(octo.x - st.px[i * 2], octo.y - st.px[i * 2 + 1]) < BUY_R + 0.15) {
      if (looseWare(st, props, i, octo.vx * 0.55, octo.vy * 0.55 - 2)) {
        st.grab[i] = GRAB_GRACE;
        octo.vx *= 0.3; octo.vy *= 0.3; octo.dashT = 0; // the ware took the dash's momentum: the octopus stops at the stall, not in the keeper
        out.push({ type: 'knocked', slot: i, x: st.px[i * 2], y: st.px[i * 2 + 1] });
      }
    }
    if (st.ware[i] !== W_LOOSE) continue;
    const pid = st.pid[i];
    if (pid < 0 || !d.alive[pid]) { st.ware[i] = W_GONE; st.pid[i] = -1; continue; }
    if (octo.dead || st.grab[i] > 0 || Math.hypot(octo.x - d.x[pid], octo.y - d.y[pid]) > GRAB_R) continue;
    const item = st.items[st.stock[i]];
    if (!canUse(item, octo, inv)) continue; // nothing it could use: it stays where it lies
    const pay = !st.free && shells >= item.price;
    applyItem(item, octo, inv);
    props.remove(pid);
    st.ware[i] = W_GONE; st.pid[i] = -1;
    if (pay) { st.sold[i] = 1; shells -= item.price; out.push({ type: 'bought', slot: i, item, price: item.price, shells }); continue; }
    st.stolen++;
    out.push({ type: 'stolen', slot: i, item, x: octo.x, y: octo.y, free: st.free });
  }
  return out;
}

/** World position of ware i (on its pedestal, or its loose body), or null when it is gone. */
export function warePos(st, props, i) {
  if (st.ware[i] === W_GONE || st.sold[i]) return null;
  if (st.ware[i] === W_LOOSE && props && st.pid[i] >= 0) return { x: props.data.x[st.pid[i]], y: props.data.y[st.pid[i]] };
  return { x: st.px[i * 2], y: st.px[i * 2 + 1] };
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
    if (st.sold[i] || (st.ware && st.ware[i] !== W_SHELF)) continue;
    if (Math.hypot(octo.x - st.px[i * 2], octo.y - st.px[i * 2 + 1]) > BUY_R) continue;
    if (st.ware && octoDashing(octo)) continue; // a dash knocks the ware off instead (shopWares)
    const item = st.items[st.stock[i]];
    if (st.free) {
      // the keeper is hostile or dead: nobody is minding the stall
      if (!canUse(item, octo, inv)) continue;
      applyItem(item, octo, inv);
      st.ware[i] = W_GONE; st.stolen++;
      return { type: 'stolen', slot: i, item, price: 0, shells, free: true };
    }
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
    if (st.ware) st.ware[i] = W_GONE;
    return { type: 'bought', slot: i, item, price: item.price, shells: shells - item.price };
  }
  return null;
}
