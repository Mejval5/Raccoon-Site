// The tutorial (data/tutorial.json): a row of small authored rooms, each teaching one thing with a safe practice target
// (Spelunky style: signs in the world, learn by doing). Pure functions over plain state, so tests can play it without the page.
//
//   - rooms: {id, rect:[x0,y0,x1,y1] (tiles, inclusive), goal, door?, goalX?, dir?}. A room's coral door (map digits, level.doors)
//     opens once its goal is done, or after DOOR_WAIT_S spent in the room (nobody is stuck on a lesson). Goals:
//     'pass' (crossed goalX going dir), 'bone' (a fish-bone tile in the room broken), 'throw' (something thrown from the hand),
//     'cast' (a spell cast), 'buy' (a ware taken from the stall), 'walls' / 'sticky' (the bomb floor / the sticky-mine wall broken),
//     'exit' (the whirlpool: never 'done' here, diving in finishes the tutorial).
//   - bombs refill to 1 whenever the count hits 0 while a bomb wall (the floor 'W' or the sticky wall 'V') still stands;
//   - a player who idles IDLE_HINT_S seconds while the floor stands gets the bomb hint back and the wall cue pulses harder.

import { BOMB_MAX } from './config.js';
import { makeHazardRecord } from './hazards.js';
import { makeCreatureRecord } from './creatures.js';
import { makeLootRecord } from './loot.js';
import { MAT_BONE } from './materials.js';

export const IDLE_HINT_S = 5;
export const IDLE_SPEED = 0.6;   // u/s: slower than this counts as idle
export const DOOR_WAIT_S = 20;   // s in a room before its door opens anyway
/** The tutorial guarantees at least one bomb while its walls stand: authored-map solvability may count them as passable. */
export const TUTORIAL_BOMBS_GUARANTEED = true;

/**
 * Spawns written by name in tutorial.json become the records the systems spawn from (hazards.js, creatures.js, loot.js,
 * enemies.js 'enemy-slot'). A named spawn that does not fit the map is an authoring error: it throws.
 */
export function expandSpawns(list, tiles, w, h) {
  let seed = 7;
  const rng = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  const out = [];
  for (const s of list) {
    let rec = s;
    if (s.type === 'enemy') rec = { type: 'enemy-slot', kind: s.kind, placement: s.placement || 'open', x: s.x, y: s.y, flatRun: true, wallDir: s.wallDir || 0, nearSideWall: false, mantaFit: false, narrowShaft: false };
    else if (s.type === 'hazard' && s.name) rec = makeHazardRecord(s.name, s.x, s.y, s.dx | 0, s.dy | 0, tiles, w, h);
    else if (s.type === 'creature' && s.name) rec = makeCreatureRecord(s.name, s.x, s.y, s.dx | 0, s.dy | 0, tiles, w, h);
    else if (s.type === 'loot' && s.name) rec = makeLootRecord(s.name, s.x, s.y, s.dx | 0, s.dy === undefined ? -1 : s.dy, rng);
    if (!rec) throw new Error('tutorial spawn does not fit: ' + JSON.stringify(s));
    out.push(rec);
  }
  return out;
}

/** @param {any} [level] the parsed tutorial (authored.js); without rooms only the bomb assists run. */
export function createTutorialState(level = null) {
  const rooms = level && level.rooms ? level.rooms : [];
  const st = {
    idle: 0, hint: false, refills: 0,
    room: -1, maxRoom: -1, roomT: new Float32Array(rooms.length),
    done: new Uint8Array(rooms.length), open: {}, base: rooms.map(() => null), bones: rooms.map(() => -1),
    walls0: -1, sticky0: -1,
  };
  return st;
}

/** Index of the room containing (x, y), or -1. */
export function roomAt(rooms, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (let i = 0; i < rooms.length; i++) { const r = rooms[i].rect; if (tx >= r[0] && tx <= r[2] && ty >= r[1] && ty <= r[3]) return i; }
  return -1;
}

function countSolid(list, tileAt) { let n = 0; for (let i = 0; i < list.length; i += 2) if (tileAt(list[i], list[i + 1]) !== 0) n++; return n; }
function countBone(rect, tileAt) { let n = 0; for (let y = rect[1]; y <= rect[3]; y++) for (let x = rect[0]; x <= rect[2]; x++) if (tileAt(x, y) === MAT_BONE) n++; return n; }

/**
 * One fixed step of the rooms. `s` = {x, y, throws, casts, buys, tileAt}: the octopus and the running counters of the hand,
 * the spells and the stall. Returns {open: door numbers to open now, entered: a room reached for the first time or -1}.
 */
export function tutorialRooms(st, level, s, dt) {
  const rooms = level.rooms || [];
  const res = { open: [], entered: -1 };
  if (st.walls0 < 0) { st.walls0 = countSolid(level.walls || [], s.tileAt); st.sticky0 = countSolid(level.sticky || [], s.tileAt); }
  const cur = roomAt(rooms, s.x, s.y);
  st.room = cur;
  if (cur > st.maxRoom) { st.maxRoom = cur; res.entered = cur; }
  if (cur >= 0) {
    st.roomT[cur] += dt;
    if (!st.base[cur]) st.base[cur] = { throws: s.throws, casts: s.casts, buys: s.buys };
  }
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (st.bones[i] < 0 && r.goal === 'bone') st.bones[i] = countBone(r.rect, s.tileAt);
    if (!st.done[i]) {
      const b = st.base[i];
      let ok = false;
      if (r.goal === 'pass') ok = !!b && ((r.dir || 1) > 0 ? s.x > r.goalX : s.x < r.goalX); // b: been in the room
      else if (r.goal === 'bone') ok = countBone(r.rect, s.tileAt) < st.bones[i];
      else if (r.goal === 'throw') ok = !!b && s.throws > b.throws;
      else if (r.goal === 'cast') ok = !!b && s.casts > b.casts;
      else if (r.goal === 'buy') ok = !!b && s.buys > b.buys;
      else if (r.goal === 'walls') ok = countSolid(level.walls || [], s.tileAt) < st.walls0;
      else if (r.goal === 'sticky') ok = countSolid(level.sticky || [], s.tileAt) < st.sticky0;
      if (ok) st.done[i] = 1;
    }
    if (r.door && !st.open[r.door] && (st.done[i] || st.roomT[i] >= DOOR_WAIT_S)) { st.open[r.door] = 1; res.open.push(r.door); }
  }
  return res;
}

/** Replays after the first finish: every door starts open (skip to any lesson). Returns the door numbers. */
export function openAllDoors(st, level) {
  const out = [];
  for (const r of level.rooms || []) if (r.door && !st.open[r.door]) { st.open[r.door] = 1; out.push(r.door); }
  return out;
}

/**
 * One fixed step in the tutorial's bomb assist.
 * @param {{bombs:number, vx:number, vy:number}} octo
 * @param {boolean} wallIntact any bomb-wall tile still solid
 * @param {boolean} [hintWall] the wall the idle hint is about (the bomb floor) still stands
 * @returns {boolean} true when a bomb was refilled this step
 */
export function tutorialStep(st, octo, wallIntact, dt, hintWall = wallIntact) {
  let refilled = false;
  if (wallIntact && octo.bombs < 1 && BOMB_MAX >= 1) { octo.bombs = 1; st.refills++; refilled = true; }
  const speed = Math.hypot(octo.vx, octo.vy);
  if (!hintWall || speed >= IDLE_SPEED) { st.idle = 0; st.hint = false; }
  else { st.idle += dt; if (st.idle >= IDLE_HINT_S) st.hint = true; }
  return refilled;
}

/** Placing a bomb counts as doing something: the hint goes away and the idle clock restarts. */
export function tutorialActed(st) { st.idle = 0; st.hint = false; }
