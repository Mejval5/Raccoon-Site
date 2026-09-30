// Soft quests (round 22, behind ?v2=1). Each Shallows level rolls one quest from data/quests.json:
//   rescue     a lost critter sits in a side pocket off the main route; touch it and it follows your trail,
//              bring it to the exit
//   vault      a sealed rock pocket (level.js carvePockets) holds a cache; bomb the rock open and take it
//   untouched  reach the exit without losing a heart
//   pest       kill N piranhas (extra piranhas are placed for it)
// Completing one pays shells (the currency) and writes a journal entry (main.js does both).
//
// planQuest is a pure function of the final level + seed, so the hub sign can preview level 1-1's quest
// exactly. Object placement uses the A* lattice (pathcheck.js): only spots the octopus can really swim to.
// Data-oriented: quest rows are plain data, the runtime state is one flat record.

import { mulberry32, hashSeed } from './rng.js';
import { createPathGrid, findPath, reachableNodes, reachedNear } from './pathcheck.js';

export const Q_RESCUE = 1, Q_VAULT = 2, Q_UNTOUCHED = 3, Q_PEST = 4;
const KINDS = { rescue: Q_RESCUE, vault: Q_VAULT, untouched: Q_UNTOUCHED, pest: Q_PEST };
export const ST_ACTIVE = 0, ST_DONE = 1, ST_FAILED = 2;

const TRAIL = 64;            // octopus positions kept (one per fixed step)
const CRITTER_LAG = 22;      // steps behind the octopus (about 0.45 s)
const TOUCH_R = 1.1;         // octopus centre to critter / cache centre
const MIN_START_DIST = 9;

/** @param {{quests:any[]}} json */
export function parseQuests(json) {
  const rows = json.quests.map((q) => {
    if (!KINDS[q.kind]) throw new Error('quest ' + q.id + ': unknown kind ' + q.kind);
    return { ...q, kindId: KINDS[q.kind], weight: q.weight === undefined ? 1 : q.weight, reward: q.reward | 0, count: q.count | 0 };
  });
  return { rows, byId: new Map(rows.map((r, i) => [r.id, i])) };
}

export async function fetchQuests(url = 'data/quests.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('quests.json ' + res.status);
  return parseQuests(await res.json());
}

/** Inside a room rect grown by a margin (the shop room and the calm tiles around it). */
function inRect(x, y, r, m = 4) { return !!r && x >= r.x0 - m && x < r.x1 + m && y >= r.y0 - m && y < r.y1 + m; }

/**
 * Pick and place this level's quest. Returns a plan
 *   {qi, kindId, id, name, reward, count, hud, done, journal, pos: Float32Array [x0,y0,...]}
 * (pos: the critter, the vault cache, or the extra piranhas, in world units) or null without quest rows.
 * @param {{tiles:Uint8Array,w?:number,h?:number,startX:number,startY:number,exitX:number,exitY:number,shop?:any,pockets?:Int16Array,nPockets?:number}} level
 */
export function planQuest(level, table, runSeed, levelIndex) {
  if (!table || !table.rows.length) return null;
  const rng = mulberry32(hashSeed(hashSeed(runSeed >>> 0, levelIndex >>> 0), 0x9e57));
  const w = level.w, h = level.h, t = level.tiles;
  let grid = null, reached = null, route = null;
  const ensure = () => {
    if (grid) return;
    grid = createPathGrid(w, h, (x, y) => t[y * w + x] !== 0);
    reached = reachableNodes(grid, level.startX + 0.5, level.startY + 0.5);
    route = findPath(grid, level.startX + 0.5, level.startY + 0.5, level.exitX + 0.5, level.exitY + 0.5);
  };
  const distToRoute = (x, y) => {
    let best = 1e9;
    const p = route ? route.points : null;
    if (!p) return best;
    for (let i = 0; i < p.length; i += 2) { const d = Math.hypot(p[i] - x, p[i + 1] - y); if (d < best) best = d; }
    return best;
  };
  const clear3 = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (t[(y + dy) * w + x + dx] !== 0) return false;
    return true;
  };
  /** water tiles the octopus can reach, at least minStart from the start and inside the border margin */
  const spots = (needClear) => {
    ensure();
    const out = [];
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
      if (t[y * w + x] !== 0 || (needClear && !clear3(x, y))) continue;
      if (inRect(x, y, level.shop)) continue;
      const cx = x + 0.5, cy = y + 0.5;
      if (Math.hypot(cx - level.startX - 0.5, cy - level.startY - 0.5) < MIN_START_DIST) continue;
      if (Math.hypot(cx - level.exitX - 0.5, cy - level.exitY - 0.5) < 5) continue;
      if (!reachedNear(grid, reached, cx, cy, 0.3)) continue;
      out.push(x, y);
    }
    return out;
  };

  const feasible = (row) => {
    switch (row.kindId) {
      case Q_VAULT: {
        if (!(level.nPockets > 0)) return null;
        const px = level.pockets[0], py = level.pockets[1];
        return Float32Array.of(px + 0.5, py + 1.72); // the chest rests on the pocket floor, left cell (shells sit right of it)
      }
      case Q_RESCUE: {
        // the critter needs open water all round (>= 0.8 tiles to rock: the 3x3 block around its tile centre is
        // water), so its fins and halo never touch the wall; tight corners only as a last resort
        let all = spots(true);
        if (!all.length) all = spots(false);
        // a side pocket: prefer spots well off the shortest route, then any spot off it
        for (const minRoute of [4, 2.5, 1.5]) {
          const cand = [];
          for (let i = 0; i < all.length; i += 2) if (distToRoute(all[i] + 0.5, all[i + 1] + 0.5) >= minRoute) cand.push(all[i], all[i + 1]);
          if (cand.length) {
            const k = Math.floor(rng() * (cand.length / 2)) * 2;
            return Float32Array.of(cand[k] + 0.5, cand[k + 1] + 0.5);
          }
        }
        return null;
      }
      case Q_PEST: {
        const n = Math.max(1, row.count);
        const all = spots(true);
        const pick = [];
        for (let tries = 0; tries < 60 && pick.length < n * 2 && all.length; tries++) {
          const k = Math.floor(rng() * (all.length / 2)) * 2;
          const x = all[k], y = all[k + 1];
          let near = false;
          for (let i = 0; i < pick.length; i += 2) if (Math.hypot(pick[i] - x, pick[i + 1] - y) < 5) near = true;
          if (!near) pick.push(x, y);
        }
        if (pick.length < n * 2) return null;
        const pos = new Float32Array(n * 2);
        for (let i = 0; i < n * 2; i += 2) { pos[i] = pick[i] + 0.5; pos[i + 1] = pick[i + 1] + 0.5; }
        return pos;
      }
      default: return new Float32Array(0); // untouched: nothing to place
    }
  };

  const pool = table.rows.map((_, i) => i);
  while (pool.length) {
    let total = 0;
    for (const i of pool) total += table.rows[i].weight;
    let r = rng() * total, k = pool.length - 1;
    for (let j = 0; j < pool.length; j++) { r -= table.rows[pool[j]].weight; if (r < 0) { k = j; break; } }
    const qi = pool[k];
    const row = table.rows[qi];
    const pos = feasible(row);
    if (pos) {
      return {
        qi, kindId: row.kindId, id: row.id, name: row.name, reward: row.reward, count: row.kindId === Q_PEST ? Math.max(1, row.count) : 1,
        hud: row.hud, done: row.done, journal: row.journal, pos,
      };
    }
    pool.splice(k, 1);
  }
  return null;
}

/** Fresh runtime state for a plan (null plan gives null). */
export function createQuestState(plan) {
  if (!plan) return null;
  return {
    plan, status: ST_ACTIVE, progress: 0, goal: plan.count,
    following: false,                       // rescue: the critter has been touched
    cx: plan.kindId === Q_RESCUE ? plan.pos[0] : 0, cy: plan.kindId === Q_RESCUE ? plan.pos[1] : 0,
    collected: false,                       // vault: the cache was taken
    trail: new Float32Array(TRAIL * 2), head: 0, filled: 0,
  };
}

function finish(st) { if (st.status !== ST_ACTIVE) return false; st.status = ST_DONE; return true; }

/** A creature died. Returns true when this completed the quest (pest control). */
export function questOnKill(st, kind) {
  if (!st || st.status !== ST_ACTIVE || st.plan.kindId !== Q_PEST || kind !== 'piranha') return false;
  st.progress++;
  return st.progress >= st.goal ? finish(st) : false;
}

/** The octopus lost a heart: the Untouched quest fails. */
export function questOnHurt(st) {
  if (st && st.status === ST_ACTIVE && st.plan.kindId === Q_UNTOUCHED) st.status = ST_FAILED;
}

/**
 * One fixed step after the octopus moved: the rescue critter follows the octopus trail once touched, and
 * the vault cache is taken on touch. Returns true when this completed the quest (vault).
 * @param {{isSolid:(x:number,y:number)=>boolean}} world
 */
export function questUpdate(st, octo, world) {
  if (!st || st.status !== ST_ACTIVE) return false;
  const k = st.plan.kindId;
  if (k === Q_RESCUE) {
    st.trail[st.head * 2] = octo.x; st.trail[st.head * 2 + 1] = octo.y;
    st.head = (st.head + 1) % TRAIL;
    if (st.filled < TRAIL) st.filled++;
    if (!st.following) {
      if (Math.hypot(octo.x - st.cx, octo.y - st.cy) < TOUCH_R) st.following = true;
    } else {
      const lag = Math.min(CRITTER_LAG, st.filled);
      const i = (st.head - lag + TRAIL * 2) % TRAIL;
      let tx = st.trail[i * 2], ty = st.trail[i * 2 + 1];
      // keep beside the octopus, not inside it
      const dx = tx - octo.x, dy = ty - octo.y, d = Math.hypot(dx, dy);
      if (d < 0.95) { const ux = d > 1e-3 ? dx / d : -0.7, uy = d > 1e-3 ? dy / d : 0.7; tx = octo.x + ux * 0.95; ty = octo.y + uy * 0.95; }
      if (world.isSolid(tx, ty)) { tx = octo.x; ty = octo.y; }
      st.cx += (tx - st.cx) * 0.3; st.cy += (ty - st.cy) * 0.3;
      if (world.isSolid(st.cx, st.cy)) { st.cx = octo.x; st.cy = octo.y; }
    }
  } else if (k === Q_VAULT && !st.collected) {
    if (Math.hypot(octo.x - st.plan.pos[0], octo.y - st.plan.pos[1]) < TOUCH_R) { st.collected = true; return finish(st); }
  }
  return false;
}

/** The octopus reached the exit. Returns true when this completed the quest (rescue with the critter, untouched). */
export function questOnExit(st) {
  if (!st || st.status !== ST_ACTIVE) return false;
  if (st.plan.kindId === Q_RESCUE) return st.following ? finish(st) : false;
  if (st.plan.kindId === Q_UNTOUCHED) return finish(st);
  return false;
}

/** The HUD line for the quest. */
export function questHudText(st) {
  if (!st) return '';
  const p = st.plan;
  if (st.status === ST_DONE) return 'Quest done: ' + p.name + ', +' + p.reward + ' shells';
  if (st.status === ST_FAILED) return 'Quest failed: ' + p.name;
  switch (p.kindId) {
    case Q_RESCUE: return 'Quest: ' + p.name + (st.following ? ' (it follows you, reach the exit)' : ' (find it)');
    case Q_PEST: return 'Quest: ' + p.name + ' ' + st.progress + '/' + st.goal + ' piranhas';
    case Q_VAULT: return 'Quest: ' + p.name + ' (bomb the sealed rock)';
    default: return 'Quest: ' + p.name + ' (keep every heart)';
  }
}

/** One line for the hub sign: name, what to do, reward. */
export function questSignText(plan) {
  return plan ? plan.name + ': ' + plan.hud + '. Reward ' + plan.reward + ' shells.' : '';
}
