// The Challenge Pool (round 39, V2-PLAN section 13): a wager room. A round basin ('b1-set-pool' in the room bank, a path-LR room
// like the other set pieces) with a pedestal on a plinth in the middle and two floor vents. Swim onto the pedestal with
// POOL_COST shells and the water rumbles: for POOL_SECONDS rocks come down from the ceiling over you (loot.js startChase, the
// same falling rocks as the relic's) while the vents push you about. Stay in the room until it stops and a chest rises on the
// pedestal; open it for POOL_PRIZE shells. Leave the room (or let the rumble run out elsewhere) and the wager is lost.
// Nothing is explained on screen: the pedestal shows its price like a shop item, and an arc of pips burns down while it runs.
//
// Data-oriented: planPool is a pure function of the final level; the state is one flat record, poolStep returns events.

import { ROOM_W, ROOM_H } from './rooms.js';
import { SET_POOL } from './level.js';

export const POOL_COST = 5;
export const POOL_SECONDS = 20;
export const POOL_PRIZE = 14;
export const POOL_IDLE_VENT = 0.2; // r40: the room's vents blow at this fraction of a jet's force until a wager runs (an idle octopus used to be pushed to the ceiling)
export const PAY_R = 0.9;      // octopus centre to the pedestal centre
export const CHEST_PR = 0.8;   // octopus centre to the chest centre
export const RISE_S = 1.0;        // s the prize chest takes to rise out of the pedestal before it can be opened
const LEAVE_GRACE = 2.0;       // s outside the room (a jet can shove you out) before the wager is lost

export const PL_IDLE = 0, PL_ACTIVE = 1, PL_WON = 2, PL_LOST = 3, PL_DONE = 4;

/**
 * Where this level's pool is: {x0, y0, x, y, floorY} (the room's top-left tile, the pedestal centre and the plinth top) or null
 * when the level has no pool room.
 * @param {{tiles:Uint8Array,w:number,h:number,setPieces?:Int16Array,nSetPieces?:number}} level
 */
export function planPool(level) { const all = planPools(level); return all.length ? all[0] : null; }

/** Every pool room of the level (the bank may place two): the plan of each. */
export function planPools(level) {
  const out = [];
  const n = level.nSetPieces | 0;
  for (let i = 0; i < n; i++) {
    if (level.setPieces[i * 4 + 2] !== SET_POOL) continue;
    const x0 = level.setPieces[i * 4], y0 = level.setPieces[i * 4 + 1];
    const cx = x0 + ROOM_W / 2; // the plinth is two tiles wide at columns 4 and 5: its middle is the room's middle
    let fy = -1;
    for (let y = y0 + 5; y < y0 + ROOM_H - 2 && fy < 0; y++) if (level.tiles[y * level.w + (x0 + 4)] !== 0) fy = y;
    if (fy < 0) continue;
    out.push({ x0, y0, x: cx, y: fy - 0.5, floorY: fy });
  }
  return out;
}

/** Fresh state for a plan (null gives null). `chest` is where the prize chest stands once the wager is won. */
export function createPoolState(plan) {
  if (!plan) return null;
  return { plan, state: PL_IDLE, t: 0, outside: 0, poor: 0, seen: false, chestOpen: 0, flash: 0, rise: 0, hostOff: 0 };
}

/** Is a point inside the pool's room (a small margin round it)? */
export function inPoolRoom(plan, x, y, m = 0.5) { return x >= plan.x0 - m && x < plan.x0 + ROOM_W + m && y >= plan.y0 - m && y < plan.y0 + ROOM_H + m; }

/**
 * One fixed step. Returns a list of events (usually empty):
 *   {type:'paid', cost}         the wager was paid (main.js takes the shells and starts the rocks: loot.startChase)
 *   {type:'poor'}               stepped on the pedestal without the shells (a short flash of the price, no text)
 *   {type:'won'}                the rumble ended with the octopus inside: the chest appears
 *   {type:'lost'}               left the room during the wager
 *   {type:'prize', shells, x, y} the chest was opened
 */
export function poolStep(st, octo, shells, dt) {
  const ev = [];
  if (!st || octo.dead) return ev;
  const p = st.plan;
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt);
  if (st.poor > 0) st.poor = Math.max(0, st.poor - dt);
  if (inPoolRoom(p, octo.x, octo.y, 0)) st.seen = true;
  switch (st.state) {
    case PL_IDLE:
      if (st.hostOff) break; // the host is hostile, dead or gone (npcs.js): nobody takes the wager
      if (Math.hypot(octo.x - p.x, octo.y - p.y) < PAY_R) {
        if (shells >= POOL_COST) { st.state = PL_ACTIVE; st.t = POOL_SECONDS; st.outside = 0; ev.push({ type: 'paid', cost: POOL_COST }); }
        else if (st.poor <= 0) { st.poor = 1.6; st.flash = 0.5; ev.push({ type: 'poor' }); }
      }
      break;
    case PL_ACTIVE:
      st.t = Math.max(0, st.t - dt);
      if (inPoolRoom(p, octo.x, octo.y)) st.outside = 0; else st.outside += dt;
      if (st.outside > LEAVE_GRACE) { st.state = PL_LOST; ev.push({ type: 'lost' }); break; }
      if (st.t <= 0) { st.state = PL_WON; st.rise = RISE_S; ev.push({ type: 'won' }); }
      break;
    case PL_WON:
      if (st.rise > 0) { st.rise = Math.max(0, st.rise - dt); break; }
      if (Math.hypot(octo.x - p.x, octo.y - (p.y - 0.15)) < CHEST_PR) { st.state = PL_DONE; st.chestOpen = 1; ev.push({ type: 'prize', shells: POOL_PRIZE, x: p.x, y: p.y - 0.4 }); }
      break;
    default: break;
  }
  return ev;
}
