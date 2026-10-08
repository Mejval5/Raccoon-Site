// Rewards now or later (owners round 3, quests rework), the Spelunky 2 way: a person you helped sometimes pays at once, sometimes
// just thanks you ("just vibing"), and sometimes turns up again a level or two further down the same dive, waiting near the exit or
// in the rest grotto, with a reward. Some leave a gift in the hub for the next dive (save.js story `giftX`, applied as `boonX`).
// The outcomes are rows in data/quests.json (see its _doc); this module picks one (seeded), turns a `later` into an owed meeting
// for the dive, finds the meeting spot and runs the visitor: greet as you come near, hand over the reward when you swim up.
// An angered or killed person remembers it for the rest of the dive (main.js `diveGrudge`): no reward, they come back hostile.
// Data-oriented: plain records, no DOM, no Math.random.

import { mulberry32, hashSeed2 } from './rng.js';
import { createTalk, say, talkStep } from './speech.js';
import { createIdle, idleStep } from './idle.js';

export const GREET_R = 7;     // the visitor calls out when the octopus is this close
export const GIVE_R = 1.8;    // octopus centre to the visitor's centre to take the reward
const CHAT_R = 3.2, CHAT_S = 10;
/** Due level of a meeting in the rest grotto (one past the last Shallows level). */
export const DUE_REST = 99;

function nameHash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/** Seed for a person's beat: the dive seed, the level and who it is (and a salt for the beat). */
export function beatSeed(diveSeed, level, npc, salt = 0) { return hashSeed2(hashSeed2(diveSeed >>> 0, (level | 0) + 1), (nameHash(npc) + salt) >>> 0); }

/** Pick one outcome by weight with a seeded roll; null for an empty list. */
export function pickOutcome(outcomes, seed) {
  if (!outcomes || !outcomes.length) return null;
  const rng = mulberry32(seed >>> 0);
  let total = 0;
  for (const o of outcomes) total += Math.max(0, o.weight === undefined ? 1 : +o.weight);
  if (total <= 0) return outcomes[0];
  let r = rng() * total;
  for (const o of outcomes) { r -= Math.max(0, o.weight === undefined ? 1 : +o.weight); if (r < 0) return o; }
  return outcomes[outcomes.length - 1];
}

/**
 * A `later` of an outcome, met on level `level` of a dive of `lastLevel` levels: when and where the person comes back.
 * {npc, variant, name, due, where, lines, reward} with due = a level number, or DUE_REST for the rest grotto (asked for, or past
 * the last level when the dive has a grotto). Null when the dive ends before it (no grotto).
 */
export function owedFrom(npc, name, later, level, seed, lastLevel, hasRest) {
  if (!later) return null;
  const rng = mulberry32((seed ^ 0x51ed) >>> 0);
  const a = (later.after && later.after[0]) | 0 || 1, b = Math.max(a, (later.after && later.after[1]) | 0 || a);
  let due = later.where === 'rest' ? DUE_REST : (level | 0) + a + Math.floor(rng() * (b - a + 1));
  if (due !== DUE_REST && due > lastLevel) due = hasRest ? DUE_REST : -1;
  if (due === DUE_REST && !hasRest) return null;
  if (due < 0) return null;
  return {
    npc: later.npc || npc, variant: later.variant || '', name: later.name || name, due, where: due === DUE_REST ? 'rest' : (later.where || 'exit'),
    lines: (later.lines || []).slice(), reward: later.reward || null, from: npc, metAt: level | 0,
  };
}

/**
 * A free floor spot near (x0, y0): a water tile with rock under it and `clearH` rows of open water over it (and beside it), between
 * rmin and rmax tiles away, found by a flood through the water from (x0, y0) (so it is reachable from there). `bad(x, y)` vetoes a tile.
 * Returns {x, y: the floor line} or null.
 * @param {(x:number,y:number)=>boolean} isSolid world units
 */
export function findFloorNear(isSolid, x0, y0, rmin, rmax, clearH = 2, bad = null) {
  const sx = Math.floor(x0), sy = Math.floor(y0);
  const rock = (x, y) => isSolid(x + 0.5, y + 0.5);
  const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
  let best = null, bestD = Infinity;
  const want = (rmin + rmax) * 0.5;
  for (let qi = 0; qi < q.length && qi < 2500; qi++) {
    const [x, y] = q[qi];
    const d = Math.hypot(x - sx, y - sy);
    if (d >= rmin && d <= rmax && rock(x, y + 1) && rock(x - 1, y + 1) && rock(x + 1, y + 1)) {
      let open = true;
      for (let dy = 0; dy < clearH && open; dy++) for (let dx = -1; dx <= 1; dx++) if (rock(x + dx, y - dy)) { open = false; break; }
      if (open && !(bad && bad(x + 0.5, y + 0.5))) {
        const score = Math.abs(d - want);
        if (score < bestD) { bestD = score; best = { x: x + 0.5, y: y + 1 }; }
      }
    }
    if (d > rmax) continue;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = nx + ',' + ny;
      if (seen.has(k) || rock(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return best;
}

/** Swimmers hover (Pip and his mother); the others stand on the floor. */
export function isSwimmer(npc) { return npc === 'pip'; }

/**
 * A person waiting with a reward. `spot` = {x, y floor line}. `chat`: idle lines once the reward is handed over.
 * x, y: the anchor (feet for standers, the centre for swimmers); cx, cy: the body centre.
 */
export function createVisitor(owed, spot, chat = [], seed = 0) {
  const swim = isSwimmer(owed.npc);
  const y = swim ? spot.y - 0.75 : spot.y;
  return {
    owed, npc: owed.npc, variant: owed.variant, name: owed.name, x: spot.x, y, floorY: spot.y, swim,
    cy: swim ? y : y - 0.6, greeted: false, gave: false, lastSay: -99, clock: 0, chat, chatN: 0,
    talk: createTalk(), idle: createIdle(seed),
  };
}

/** One step. Returns 'give' on the step the reward is handed over (once), else ''. */
export function visitorStep(v, octo, dt) {
  v.clock += dt;
  idleStep(v.idle, v.x, v.cy, octo, dt);
  let ev = '';
  if (!octo.dead) {
    const d = Math.hypot(octo.x - v.x, octo.y - v.cy);
    const lines = v.owed.lines;
    if (!v.greeted && d < GREET_R) { v.greeted = true; v.lastSay = v.clock; if (lines.length) say(v.talk, [lines[0]]); }
    if (!v.gave && d < GIVE_R) {
      v.gave = true; v.greeted = true; v.lastSay = v.clock;
      v.talk.q.length = 0; v.talk.left = 0; v.talk.text = '';
      say(v.talk, lines.length > 1 ? lines.slice(1) : ['Here. For you.']);
      ev = 'give';
    } else if (v.gave && d < CHAT_R && !v.talk.text && !v.talk.q.length && v.clock - v.lastSay > CHAT_S && v.chat.length) {
      v.lastSay = v.clock; say(v.talk, [v.chat[v.chatN++ % v.chat.length]]);
    }
  }
  talkStep(v.talk, dt);
  return ev;
}

/** Human words for a reward (the speech and the journal never show numbers on a HUD line; this is for tests and logs). */
export function rewardText(r) {
  if (!r) return '';
  if (r.shells) return r.shells + ' shells';
  if (r.bombs) return r.bombs + ' bombs';
  if (r.hearts) return r.hearts + ' heart';
  if (r.juice) return r.juice + ' juice';
  if (r.item) return r.item;
  return '';
}
