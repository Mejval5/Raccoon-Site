// The offering altar (CONTROLS-IDEAS.md section 4, Spelunky's Kali altar, natural fantasy): an old stone slab with a carved
// octopus and three spiral hollows. Bodies laid or thrown on it are taken under; what it eats adds to its FAVOUR, and the
// three hollows light up one by one (the only cue: no numbers). Each lit hollow pays once: a heart, the jar, an item.
// Offering a person (a person's body, or a stunned shopkeeper carried there alive) or a bomb going off by it ANGERS it: the
// hollows go a dull rust red, it spits out piranhas and it takes nothing more on this level.
//
// Pure rules and state here (no DOM, no world): main.js places one altar on some Shallows levels (findAltarSpot), calls
// stepAltar every step with the live corpses / enemies / keepers, altarBlast for every explosion, and pays the events.
// The altar is not a tile: it stands on the floor as scenery, so the level's A* check is unchanged.

import { CS_CARRY } from './corpses.js';
import { registerInteract, PRI_THING } from './hand.js';

export const ALTAR_W = 3.0;          // tiles: the drawn width (the sprite is 322 x 200, so about 1.86 tall)
export const ZONE_HALF = 1.35;       // tiles either side of the centre where a body counts as "on" it
export const ZONE_UP = 2.4;          // tiles above the floor
export const SIGN_R = 3.6;           // the first-meeting sign's prompt shows this close
export const OFFER_DWELL = 0.15;     // s a body must stay in the zone (a fast throw straight through still counts on its way down)

/** Favour per body (the creature table's names; corpses of ambient fish are too small to count). */
export const OFFER = {
  piranha: 1, crab: 1, 'crab-fast': 2, urchin: 1, horns: 1, eel: 2, manta: 2, cannon: 2, gclam: 3, tentacle: 3,
};
export const LIVE_BONUS = 1;         // a stunned creature carried there alive is worth one more (Spelunky)
/** The three hollows: lit at this much favour, and what each pays once. */
export const TIERS = [{ at: 2, gift: 'heart' }, { at: 5, gift: 'juice' }, { at: 9, gift: 'item' }];
export const ANGER_SPAWN = { kind: 'piranha', n: 2 };
/** Items the altar may hand over at the third hollow (one not yet carried, seeded per altar). */
export const ALTAR_ITEMS = ['siphon', 'goggles', 'urchincap', 'heartcontainer', 'flippers', 'lantern', 'magnet', 'bombbag'];

export function isPersonKind(kind) { return kind === 'keeper' || (typeof kind === 'string' && kind.startsWith('npc-')); }
/** Favour a body of `kind` is worth (live: carried there stunned). 0 = too small to count (it is still taken). */
export function offerValue(kind, live = false) {
  if (!kind || kind.startsWith('ambient-')) return 0;
  const v = OFFER[kind] !== undefined ? OFFER[kind] : 1;
  return v + (live ? LIVE_BONUS : 0);
}
/** How many hollows are lit at `favour`. */
export function tierOf(favour) { let t = 0; for (const r of TIERS) if (favour >= r.at) t++; return t; }

/** A new altar standing on the floor at (x, floorY) (x = centre). `sign`: the first one ever met carries a sign. */
export function createAltar(x, floorY, sign = false, seed = 0) {
  return {
    x, y: floorY, sign, seed: seed >>> 0,
    favour: 0, tier: 0, angry: false, why: '',
    offerings: 0,
    glow: [0, 0, 0],   // drawn brightness of each hollow (eases toward lit / unlit)
    gulp: 0,           // 1 -> 0 after something is taken (the basin clouds, bubbles rise)
    rage: 0,           // 1 -> 0 after it is angered (the silt burst)
    dwell: new Map(),  // body key -> s in the zone
    seen: new Set(),   // scratch: keys in the zone this step (kept, so a step allocates nothing)
    events: [],        // {type: 'offer', kind, value, live} | {type: 'gift', gift, tier} | {type: 'anger', why}
  };
}

export function inZone(a, x, y) {
  return Math.abs(x - a.x) <= ZONE_HALF && y <= a.y + 0.1 && y >= a.y - ZONE_UP;
}

/** Feed it one body. Returns the events it caused (also pushed onto a.events). */
export function offer(a, kind, live = false) {
  const out = [];
  if (a.angry) return out;
  if (isPersonKind(kind)) { anger(a, 'person', out); return out; }
  const v = offerValue(kind, live);
  a.offerings++; a.gulp = 1;
  const ev = { type: 'offer', kind, value: v, live: !!live };
  out.push(ev); a.events.push(ev);
  if (v > 0) {
    a.favour += v;
    while (a.tier < TIERS.length && a.favour >= TIERS[a.tier].at) {
      const g = { type: 'gift', gift: TIERS[a.tier].gift, tier: a.tier + 1 };
      a.tier++;
      out.push(g); a.events.push(g);
    }
  }
  return out;
}

/** Anger it (why: 'person' | 'bomb'); once is enough. */
export function anger(a, why, out = null) {
  if (a.angry) return false;
  a.angry = true; a.why = why; a.rage = 1;
  const ev = { type: 'anger', why };
  a.events.push(ev); if (out) out.push(ev);
  return true;
}

/** A blast at (x, y) of radius r: within reach of the stone, it is angry. */
export function altarBlast(a, x, y, r) {
  if (!a || a.angry) return false;
  const cy = a.y - 0.9;
  const dx = Math.max(0, Math.abs(x - a.x) - ALTAR_W * 0.5), dy = Math.max(0, Math.abs(y - cy) - 0.9);
  if (Math.hypot(dx, dy) > r) return false;
  return anger(a, 'bomb');
}

/** Which item the third hollow hands over: the first of a seeded order not yet carried (canCarry(id)), or null. */
export function altarItem(a, canCarry) {
  const ids = ALTAR_ITEMS.slice();
  let h = (a.seed ^ 0x51a7) >>> 0;
  for (let i = ids.length - 1; i > 0; i--) {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    const j = h % (i + 1); const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
  }
  for (const id of ids) if (canCarry(id)) return id;
  return null;
}

function dwellOk(a, key, dt) {
  const t = (a.dwell.get(key) || 0) + dt;
  a.dwell.set(key, t);
  return t >= OFFER_DWELL;
}

/**
 * One step. `live` = { corpses (corpses.js system), kindName(id), enemies: [records], keepers (shopkeeper.js arrays),
 * keeperDead: KM_DEAD }; any may be missing. Bodies resting or falling in the zone (not in the octopus's tentacles) are
 * taken: corpses are removed, a stunned creature vanishes (e.dead, no corpse), a stunned keeper is taken (anger).
 * Returns this step's events (a.events, cleared at the start).
 */
export function stepAltar(a, dt, live = {}) {
  a.events.length = 0;
  for (let k = 0; k < 3; k++) {
    const want = a.angry ? 0.75 : (k < a.tier ? 1 : 0);
    a.glow[k] += (want - a.glow[k]) * Math.min(1, dt * 2.5);
  }
  a.gulp = Math.max(0, a.gulp - dt * 0.8);
  a.rage = Math.max(0, a.rage - dt * 0.6);
  if (a.angry) return a.events;
  const seen = a.seen; seen.clear();
  const c = live.corpses;
  if (c) {
    const d = c.data;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.state[i] === CS_CARRY || !inZone(a, d.x[i], d.y[i])) continue;
      const key = 'c' + d.seq[i];
      seen.add(key);
      if (!dwellOk(a, key, dt)) continue;
      const kind = live.kindName ? live.kindName(d.kind[i]) : '';
      c.remove(i);
      offer(a, kind, false);
      if (a.angry) break;
    }
  }
  if (!a.angry && live.enemies) {
    for (const e of live.enemies) {
      if (e.dead || e.ghost || e.carried || !(e.stun > 0) || !inZone(a, e.x, e.y)) continue;
      const key = 'e' + (e.id !== undefined ? e.id : e.kind + e.x.toFixed(1));
      seen.add(key);
      if (!dwellOk(a, key, dt)) continue;
      e.dead = true; // taken whole: no corpse, no kill event
      offer(a, e.kind, true);
    }
  }
  const k = live.keepers;
  if (!a.angry && k) {
    for (let i = 0; i < k.n; i++) {
      if (k.mode[i] === live.keeperDead || k.carried === i || !(k.stun[i] > 0) || !inZone(a, k.x[i], k.y[i])) continue;
      k.mode[i] = live.keeperDead; k.hp[i] = 0;
      offer(a, 'keeper', true);
      break;
    }
  }
  if (a.dwell.size) for (const key of a.dwell.keys()) if (!seen.has(key)) a.dwell.delete(key);
  return a.events;
}

/**
 * The hand kind 'keeper': a STUNNED shopkeeper can be lifted like a stunned creature (heavy: he is buff), so he can be carried
 * to the altar alive (which angers it). env = { keepers() -> the live arrays, keeperDead }.
 */
export function registerKeeperGrab(env) {
  registerInteract('keeper', {
    priority: PRI_THING,
    find(octo, reach) {
      const k = env.keepers();
      if (!k || !k.n) return null;
      let best = -1, bd = reach;
      for (let i = 0; i < k.n; i++) {
        if (k.mode[i] === env.keeperDead || !(k.stun[i] > 0)) continue;
        const d = Math.hypot(k.x[i] - octo.x, k.y[i] - octo.y) - 0.3;
        if (d < bd) { bd = d; best = i; }
      }
      return best < 0 ? null : { x: k.x[best], y: k.y[best], ref: best };
    },
    use(t) {
      const k = env.keepers(), i = t.ref;
      k.carried = i;
      const pos = { x: 0, y: 0, vx: 0, vy: 0 };
      return {
        r: 0.5, weight: 0.45, shield: false, speed: 6, dmg: 4, keeper: i,
        place(x, y, vx, vy) { k.x[i] = x; k.y[i] = y; k.vx[i] = vx; k.vy[i] = vy; },
        alive() { return k.mode[i] !== env.keeperDead; },
        tick() { if (!(k.stun[i] > 0)) { if (k.carried === i) k.carried = -1; return false; } return true; }, // he comes to and shakes free
        release(vx, vy) { if (k.carried === i) k.carried = -1; k.vx[i] = vx; k.vy[i] = vy; k.stun[i] = Math.max(k.stun[i], 0.5); },
        pos() { pos.x = k.x[i]; pos.y = k.y[i]; pos.vx = k.vx[i]; pos.vy = k.vy[i]; return pos; },
        bounce(f) { k.vx[i] *= f; k.vy[i] *= f; },
      };
    },
  });
}

/**
 * A floor for the altar: open water reachable from (sx, sy) by a flood, three tiles of floor under it, three tiles wide and
 * three tall of water above it, between dMin and dMax tiles from the start. `avoid(x, y)` -> true rejects a centre (other set
 * pieces, the shop, the exit). `floorOk(tx, ty)` (optional) -> false rejects a floor tile (altar-level.js: natural stone only, never
 * a timber plank or fish bone that may break away under it). `half` = floor tiles either side of the centre tile (2: room
 * for a sign beside it). Returns {x, y} (centre x, the floor's y) or null. isSolid(x, y) in world units.
 */
export function findAltarSpot(isSolid, sx, sy, dMin = 10, dMax = 40, avoid = null, cap = 20000, floorOk = null, half = 1) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  const K = 8192, key = (x, y) => (x + 1024) * K + (y + 1024); // numeric keys: no string garbage on a phone
  const seen = new Set([key(sx, sy)]), qx = [sx], qy = [sy];
  const open = (x, y) => !isSolid(x + 0.5, y + 0.5);
  for (let qi = 0; qi < qx.length && qi < cap; qi++) {
    const x = qx[qi], y = qy[qi];
    const d = Math.hypot(x - sx, y - sy);
    if (d >= dMin && d <= dMax) {
      let ok = true;
      for (let dx = -half; dx <= half && ok; dx++) {
        if (!isSolid(x + dx + 0.5, y + 1.5) || (floorOk && !floorOk(x + dx, y + 1)) || !open(x + dx, y) || !open(x + dx, y - 1) || !open(x + dx, y - 2)) ok = false;
      }
      if (ok && !(avoid && avoid(x + 0.5, y + 1))) return { x: x + 0.5, y: y + 1 };
    }
    if (d > dMax) continue;
    for (let n = 0; n < 4; n++) {
      const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0), ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
      const k = key(nx, ny);
      if (seen.has(k) || !open(nx, ny)) continue;
      seen.add(k); qx.push(nx); qy.push(ny);
    }
  }
  return null;
}

/** Does this level of the dive get an altar? One level in a dive, seeded, about 3 dives in 4. */
export function altarLevel(diveSeed, firstLevel, lastLevel) {
  let h = ((diveSeed >>> 0) ^ 0xa17a2) >>> 0;
  h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0); h = (h ^ (h >>> 13)) >>> 0;
  if (h % 4 === 3) return -1;
  return firstLevel + ((h >>> 3) % (lastLevel - firstLevel + 1));
}
