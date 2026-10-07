// Buried treasure (v2): shells, bombs and now and then a carried item sealed inside solid rock, like the gold and
// gems in Spelunky's walls. Bomb (or otherwise break) the tile and the find drops out as a physics prop that sinks
// and settles (props.js kind PK_FIND); swim into it to take it.
//
// What you see (Daniel, 2026-10-07): the basic currency shells (cowrie, conch) are ALWAYS visible, drawn as part of
// the rock like Spelunky's gold veins: a few small shells peeking out of the tile. The valuable ones (nautilus, pearl),
// bombs and items are invisible without the Sea-glass Goggles (items.js 'goggles'), which show them through the rock
// as soft silhouettes, and the level's other hidden rock pockets too (embed-draw.js).
//
// Data-oriented: planEmbedded() is a pure function of the level tiles and the run seed that returns plain spawn
// records ({type:'embed', x, y, ek, sub}); createEmbedded() keeps the live state in flat typed arrays.
//
// The shell tiers are a data table (EMBED_SHELLS): id, value, weight, whether it is always shown, and which sprite draws
// it. When the currency shells get their own styles, retarget `art` (and `value`) here; nothing else changes.

import { mulberry32, hashSeed2 } from './rng.js';
import { ITEM_IDS } from './items.js';
import { PK_FIND } from './props.js';

export const EK_NONE = 0, EK_SHELL = 1, EK_BOMB = 2, EK_ITEM = 3;
export const EMBED_NAMES = ['', 'shell', 'bomb', 'item'];

/** Shell tiers (sub 1..n for EK_SHELL). shown: a basic shell, always visible in the rock. deep: added to the weight per level below the first (levelIndex 0). */
export const EMBED_SHELLS = [
  null,
  { id: 'cowrie', name: 'Cowrie', value: 1, weight: 52, deep: -2, shown: true, art: 'blue' },
  { id: 'conch', name: 'Conch', value: 2, weight: 30, deep: 0, shown: true, art: 'green' },
  { id: 'nautilus', name: 'Nautilus', value: 4, weight: 12, deep: 1.5, shown: false, art: 'red' },
  { id: 'pearl', name: 'Pearl', value: 8, weight: 6, deep: 1, shown: false, art: 'pearl' },
];

// tuning
export const EMBED_MIN = 6, EMBED_MAX = 12;   // per level: 6-8 on the first, up to 12 deeper down
export const EMBED_ITEM_CHANCE = 0.08;        // a carried item (items.js), picked by EMBED_ITEM_WEIGHT
export const EMBED_BOMB_CHANCE = 0.08;        // one or two bombs
export const EMBED_ITEMS_MAX = 1, EMBED_BOMBS_MAX = 2; // per level (one more item from the third level on); the rest are shells
export const EMBED_GAP = 3;                   // tiles between two buried finds (Chebyshev)
export const EMBED_REACH = 3;                 // a find is at most this many tiles from water the octopus can reach
export const FIND_DELAY = 0.45;               // s a released find cannot be taken, so its fall is seen
export const FIND_R = 0.5;                    // pickup reach beyond the octopus's radius
export const MAGNET_PULL = 7;                 // u/s^2 the shell magnet pulls a loose shell with
/** Item weights inside the rock: the goggles are the find of the walls (one in three items). Other ids weigh 1. */
export const EMBED_ITEM_WEIGHT = { goggles: 3 };

export const ES_BURIED = 0, ES_LOOSE = 1, ES_TAKEN = 2;
export const VIS_NONE = 0, VIS_SHOWN = 1, VIS_FULL = 2; // nothing / shells peeking out of the rock / goggles silhouette

const CAP = 24;

/** Count of finds for a level (levelIndex 0 = the first level of the dive). */
export function embedCount(levelIndex, r) {
  const deeper = Math.max(0, levelIndex);
  return Math.min(EMBED_MAX, EMBED_MIN + Math.min(4, deeper) + Math.floor(r * 3));
}

/** Weighted shell tier for a level (1..4). */
export function rollShellTier(levelIndex, r) {
  const deeper = Math.max(0, levelIndex);
  let total = 0;
  for (let s = 1; s < EMBED_SHELLS.length; s++) total += Math.max(1, EMBED_SHELLS[s].weight + EMBED_SHELLS[s].deep * deeper);
  let u = r * total;
  for (let s = 1; s < EMBED_SHELLS.length; s++) {
    u -= Math.max(1, EMBED_SHELLS[s].weight + EMBED_SHELLS[s].deep * deeper);
    if (u < 0) return s;
  }
  return 1;
}

/** Item code (1-based index into ITEM_IDS, the loot item code) by EMBED_ITEM_WEIGHT. */
export function rollItemCode(r) {
  let total = 0;
  for (const id of ITEM_IDS) total += EMBED_ITEM_WEIGHT[id] || 1;
  let u = r * total;
  for (let i = 0; i < ITEM_IDS.length; i++) {
    u -= EMBED_ITEM_WEIGHT[ITEM_IDS[i]] || 1;
    if (u < 0) return i + 1;
  }
  return ITEM_IDS.length;
}

/** Whether a find is a basic shell (always visible in the rock). */
export function isShownFind(ek, sub) { return ek === EK_SHELL && !!EMBED_SHELLS[sub] && EMBED_SHELLS[sub].shown; }

/** What shows of a buried find: a basic shell always peeks out (VIS_SHOWN); the rest only with the goggles (VIS_FULL). */
export function embedVisibility(ek, sub, goggles) {
  if (isShownFind(ek, sub)) return VIS_SHOWN;
  return goggles ? VIS_FULL : VIS_NONE;
}

/** The value of a shell tier (1 for anything unknown). */
export function shellValue(sub) { return EMBED_SHELLS[sub] ? EMBED_SHELLS[sub].value : 1; }

/**
 * Choose the buried finds of a generated level. Pure: the same tiles, seed and level give the same list.
 * @param {Uint8Array} tiles 0 water, 1 main rock (only main rock holds finds), other ids other materials
 * @param {number} W @param {number} H @param {number} border the indestructible frame (never used)
 * @param {Uint8Array} reached water the octopus can reach from the start (1)
 * @param {(x:number,y:number)=>boolean} blocked tiles that must stay plain (shop, quest vault walls, other spawns)
 * @returns {{type:'embed',x:number,y:number,ek:number,sub:number}[]}
 */
export function planEmbedded(tiles, W, H, border, reached, blocked, runSeed, levelIndex) {
  const rng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0xe3bed));
  const want = embedCount(levelIndex, rng());
  // distance (Chebyshev, up to EMBED_REACH) from each rock tile to reachable water
  const near = new Uint8Array(W * H);
  const cand = [];
  for (let y = border; y < H - border; y++) {
    for (let x = border; x < W - border; x++) {
      const i = y * W + x;
      if (tiles[i] !== 1 || blocked(x, y)) continue; // main terrain rock only (materials: MAT_ROCK = 1)
      let best = 0;
      for (let r = 1; r <= EMBED_REACH && !best; r++) {
        for (let oy = -r; oy <= r && !best; oy++) for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (reached[yy * W + xx]) { best = r; break; }
        }
      }
      if (!best) continue;
      near[i] = best;
      cand.push(i);
    }
  }
  const out = [];
  const taken = [];
  const itemsMax = EMBED_ITEMS_MAX + (levelIndex >= 2 ? 1 : 0);
  let nItems = 0, nBombs = 0;
  for (let tries = 0; tries < want * 12 && out.length < want && cand.length; tries++) {
    const k = Math.floor(rng() * cand.length);
    const i = cand[k];
    cand[k] = cand[cand.length - 1]; cand.pop();
    const x = i % W, y = (i / W) | 0;
    let ok = true;
    for (let t = 0; t < taken.length; t += 2) if (Math.max(Math.abs(taken[t] - x), Math.abs(taken[t + 1] - y)) < EMBED_GAP) { ok = false; break; }
    if (!ok) continue;
    taken.push(x, y);
    const r = rng();
    let ek = EK_SHELL, sub = 0;
    const r2 = rng(); // always drawn, so a capped roll does not shift the stream
    if (r < EMBED_ITEM_CHANCE && nItems < itemsMax) { ek = EK_ITEM; sub = rollItemCode(r2); nItems++; }
    else if (r >= EMBED_ITEM_CHANCE && r < EMBED_ITEM_CHANCE + EMBED_BOMB_CHANCE && nBombs < EMBED_BOMBS_MAX) { ek = EK_BOMB; sub = r2 < 0.3 ? 2 : 1; nBombs++; }
    else sub = rollShellTier(levelIndex, r2);
    out.push({ type: 'embed', x: x + 0.5, y: y + 0.5, ek, sub });
  }
  return out;
}

/**
 * Live buried finds of the current level.
 * @param {ReturnType<import('./props.js').createProps>|null} props the physics props (null: a released find stays put)
 */
export function createEmbedded(props = null) {
  const d = {
    n: 0,
    tx: new Int16Array(CAP), ty: new Int16Array(CAP), ek: new Uint8Array(CAP), sub: new Uint8Array(CAP),
    state: new Uint8Array(CAP), pid: new Int32Array(CAP).fill(-1),
    byTile: new Map(), // tile key (ty * 4096 + tx) -> find index, for per-tile drawing (embedAt)
    x: new Float32Array(CAP), y: new Float32Array(CAP), delay: new Float32Array(CAP), seed: new Float32Array(CAP),
  };
  const events = [];
  let loaded = false;

  function add(rec) {
    if (d.n >= CAP) return -1;
    const i = d.n++;
    d.tx[i] = Math.floor(rec.x); d.ty[i] = Math.floor(rec.y); d.ek[i] = rec.ek; d.sub[i] = rec.sub;
    d.state[i] = ES_BURIED; d.pid[i] = -1; d.x[i] = rec.x; d.y[i] = rec.y; d.delay[i] = 0;
    d.seed[i] = ((d.tx[i] * 73856093) ^ (d.ty[i] * 19349663)) >>> 0 & 1023;
    d.byTile.set(d.ty[i] * 4096 + d.tx[i], i);
    return i;
  }

  function release(i) {
    d.state[i] = ES_LOOSE;
    d.delay[i] = FIND_DELAY;
    // a small pop up and to one side, then it sinks (props.js)
    const side = (d.seed[i] & 1) ? 1 : -1;
    if (props) d.pid[i] = props.add(PK_FIND, d.x[i], d.y[i], side * 0.8, -1.6, { ref: i });
    events.push({ type: 'released', i, ek: d.ek[i], sub: d.sub[i], x: d.x[i], y: d.y[i] });
  }

  return {
    data: d,
    add,
    count() { return d.n; },
    takeEvents() { return events.splice(0, events.length); },

    /** One fixed step: load the level's records once, release finds whose tile is gone, move and collect loose ones. */
    update(dt, octo, world, resident) {
      if (!loaded && resident) {
        loaded = true;
        for (const { chunk } of resident) for (const s of chunk.spawns) if (s.type === 'embed') add(s);
      }
      for (let i = 0; i < d.n; i++) {
        const st = d.state[i];
        if (st === ES_BURIED) {
          if (world.tileAt(d.tx[i], d.ty[i]) === 0) release(i);
          continue;
        }
        if (st !== ES_LOOSE) continue;
        const pid = d.pid[i];
        if (props && pid >= 0) {
          const pd = props.data;
          d.x[i] = pd.x[pid]; d.y[i] = pd.y[pid];
          // the shell magnet tugs loose shells along (as it does the other shells)
          if (d.ek[i] === EK_SHELL && octo.magnetR > 0 && !octo.dead) {
            const dx = octo.x - d.x[i], dy = octo.y - d.y[i], m = Math.hypot(dx, dy);
            if (m < octo.magnetR && m > 1e-4) { props.wake(pid); pd.vx[pid] += dx / m * MAGNET_PULL * dt; pd.vy[pid] += dy / m * MAGNET_PULL * dt; }
          }
        }
        if (d.delay[i] > 0) { d.delay[i] = Math.max(0, d.delay[i] - dt); continue; }
        if (octo.dead) continue;
        if (Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < FIND_R + octo.radius * 0.7) {
          d.state[i] = ES_TAKEN;
          if (props && pid >= 0) { props.remove(pid); d.pid[i] = -1; }
          events.push({ type: 'take', i, ek: d.ek[i], sub: d.sub[i], x: d.x[i], y: d.y[i] });
        }
      }
    },

    /** Finds still in the rock (tests, review). */
    buried() { let n = 0; for (let i = 0; i < d.n; i++) if (d.state[i] === ES_BURIED) n++; return n; },
  };
}

/** Index of the still-buried find in tile (tx, ty), or -1 (the per-tile draw hook's lookup). */
export function embedAt(d, tx, ty) {
  const i = d.byTile.get(ty * 4096 + tx);
  return i !== undefined && d.state[i] === ES_BURIED ? i : -1;
}

export { EMBED_SHELLS as SHELL_TIERS };
