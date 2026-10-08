// NPC questlines (round 39, the Spelunky 2 way). People, not objectives: Marlo the stranded diver, Pip the caged critter
// and Quill the collector (plus the Challenge Pool, pool.js). They are found in the levels, speak when you come near
// (meet, ask), react when you help (help, thank) and move their story forward one stage at a time across levels and runs
// (save.js story flags: `story[npc]` is the stage). Nothing is announced or listed: no HUD line, the only words are an NPC's
// speech bubble and the journal's People pages.
// data/quests.json holds the people (hub lines per stage) and the encounter rows (npc, stage range, levels, chance, kind, lines).
//   vault   (Marlo)   sealed in a rock pocket (level.js carvePockets): bomb it open and swim in. Free him in three different
//                     runs (stage 1, 2, 3) and he opens the hub shortcut to Shallows 1-3.
//   rescue  (Pip)     a cage on the floor: break it with a dash or a bomb, the critter follows your trail, bring it to the
//                     exit (8 shells); it then lives in the hub.
//   Quill   (hub)     moves in after your first dive; each relic carried out through an exit and handed over unlocks a
//                     journal entry, three give the lantern. Out on a dig in the levels now and then (a meet row).
//   meet    (Pip, Quill) someone standing (or swimming) in a side cave: swim up to them.
// Owners round 3 (quests rework): nobody vanishes after you help them. A freed Marlo swims out and stays; a freed Pip follows you
// (outcome role 'follow') or stays and swims about his open cage ('stay'). They face the octopus, glance about, jump at a blast
// (idle.js) and thank you. Each row has seeded OUTCOMES (pickOutcome in visitors.js, chosen in planQuest): a reward now, nothing
// now ('just vibing'), a meeting later in the dive (visitors.js owedFrom) or a gift in the hub for the next dive (table.gifts).
// planQuest is a pure function of the final level + seed + story. Spots use the A* lattice (pathcheck.js): only places
// the octopus can really swim to, never inside a set-piece room or the shop, and clear of the level's other spawns.
// Data-oriented: rows are plain data, the runtime state is one flat record.

import { mulberry32, hashSeed2 } from './rng.js';
import { tileGrid, findPath, reachableNodes, reachedNear } from './pathcheck.js';
import { ROOM_W, ROOM_H } from './rooms.js';
import { createTalk, say, talkStep } from './speech.js';
import { DASH_KILL_SPEED } from './config.js';
import { createIdle, idleStep, idleReact } from './idle.js';
import { pickOutcome, beatSeed } from './visitors.js';

export const Q_RESCUE = 1, Q_VAULT = 2, Q_MEET = 3;
const KINDS = { rescue: Q_RESCUE, vault: Q_VAULT, meet: Q_MEET };
export const ST_ACTIVE = 0, ST_DONE = 1, ST_FAILED = 2; // failed: the person was turned on (npcs.js); no reward, no stage up
export const RELICS_NEEDED = 3;           // relics Quill wants (story.relics counts the ones carried out through an exit)
export const DIVER_RUNS = 3;              // runs in which Marlo must be freed before he opens the hub shortcut to 1-3
export const CAGE_BREAK_R = 1.3;         // octopus centre to the cage centre for a dash to break it
export const CAGE_BLAST_R = 2.6;         // a bomb this close to the cage breaks it

const TRAIL = 64;            // octopus positions kept (one per fixed step)
const CRITTER_LAG = 22;      // steps behind the octopus (about 0.45 s)
export const FREE_R = 2.0;   // r40: Marlo is freed when his pocket is open (clear water between you) and the octopus is this close to him
const SWIM_SPEED = 1.5, SINK_SPEED = 1.3;
const SWIM_MAX = 4;          // s he swims towards the octopus before he settles where he is
export const MEET_TOUCH_R = 1.7; // meet: octopus centre to the person's centre to talk
const CHAT_R = 3.2, CHAT_S = 10; // after helping: an idle line when you swim up again after a quiet spell
const MEET_R = 8.5;          // an NPC speaks up when the octopus is this close
const ASK_AGAIN_R = 3.5, ASK_AGAIN_S = 12;
const MIN_START_DIST = 9;
const AVOID_R = 2.4;         // tiles to any other spawn (chest, pot, enemy slot, hazard)
const STEP = 0.02;

/** @param {{npcs:any[], quests:any[]}} json */
export function parseQuests(json) {
  const gifts = []; // every `next` of an outcome: story giftX = its index + 1
  const outs = (list, npc, where) => (list || []).map((o) => {
    if (!o.id) throw new Error(where + ': an outcome without an id');
    const out = { ...o, weight: o.weight === undefined ? 1 : +o.weight, lines: (o.lines || []).slice(), now: o.now || null, later: o.later || null, next: o.next || null, role: o.role || '', giftId: 0 };
    if (out.next) { gifts.push({ npc, lines: (out.next.lines || []).slice(), boon: out.next.boon || {} }); out.giftId = gifts.length; }
    return out;
  });
  const npcs = json.npcs.map((n) => ({ ...n, hub: n.hub || {}, thanks: n.thanks || {}, chat: n.chat || [], react: n.react || [], outcomes: outs(n.outcomes, n.id, 'npc ' + n.id) }));
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const rows = json.quests.map((q) => {
    if (!KINDS[q.kind]) throw new Error('quest ' + q.id + ': unknown kind ' + q.kind);
    if (!npcById.has(q.npc)) throw new Error('quest ' + q.id + ': unknown npc ' + q.npc);
    return {
      ...q, kindId: KINDS[q.kind], weight: 1, reward: q.reward | 0, count: 1, need: q.need | 0, max: q.max === undefined ? q.need | 0 : q.max | 0,
      levels: (q.levels || [0, 1, 2]).slice(), chance: q.chance === undefined ? 0.35 : q.chance, lines: q.lines || {}, variant: q.variant || '',
      stage: q.stage !== false, outcomes: outs(q.outcomes, q.npc, 'quest ' + q.id),
    };
  });
  return { rows, byId: new Map(rows.map((r, i) => [r.id, i])), npcs, npcById, gifts };
}

export async function fetchQuests(url = 'data/quests.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('quests.json ' + res.status);
  return parseQuests(await res.json());
}

/** Inside a room rect grown by a margin (the shop room and the calm tiles around it). */
function inRect(x, y, r, m = 4) { return !!r && x >= r.x0 - m && x < r.x1 + m && y >= r.y0 - m && y < r.y1 + m; }
/** Inside any set-piece room (wreck, garden, gauntlet): they are scenery of their own and a cage would overlap the hull. */
function inSetPiece(level, x, y) {
  const sp = level.setPieces, n = level.nSetPieces | 0;
  for (let i = 0; i < n; i++) if (x >= sp[i * 4] - 1 && x <= sp[i * 4] + ROOM_W && y >= sp[i * 4 + 1] - 1 && y <= sp[i * 4 + 1] + ROOM_H) return true;
  return false;
}

/** Rows that can happen on this level for this story: the person's stage is within the row's range and the level is listed. */
export function eligibleRows(table, story, levelIndex) {
  return table.rows.filter((r) => { const st = story && story[r.npc] !== undefined ? story[r.npc] | 0 : 0; return st >= r.need && st <= r.max && r.levels.includes(levelIndex); });
}

/**
 * Pick and place this level's encounter. Returns a plan
 *   {qi, kindId, id, npc, name, title, reward, count, need, max, lines, done, journal, variant, floorY, pos: Float32Array [x, y]}
 * (pos: the centre of the cage / tank / person / pocket cache, in world units; floorY: the floor line it rests on,
 * 0 for the vault) or null: nothing eligible, the roll failed or no spot fits.
 * @param {{tiles:Uint8Array,w?:number,h?:number,startX:number,startY:number,exitX:number,exitY:number,shop?:any,pockets?:Int16Array,nPockets?:number,setPieces?:Int16Array,nSetPieces?:number}} level
 * @param {Record<string, number>} story the stage of every person (save.js getStory)
 * @param {ArrayLike<number>} [avoid] x, y pairs of the level's other spawns
 */
function tileSum(t) { let s = 0; for (let i = 0; i < t.length; i++) s = (s * 31 + t[i] + i) >>> 0; return s; }
/**
 * vibe fixes: the path data planQuest needs (the lattice reachable from the start, the start -> exit route) as plain typed arrays.
 * gen-worker.js computes it next to the level (level.questPath) so the main thread does not: planQuest was a 5-50 ms piece of one
 * warm frame at 4x on a phone (a task over 50 ms during the transition, a music stutter). `sum` identifies the tiles it was made for.
 */
export function questPathFor(level) {
  const w = level.w, h = level.h, t = level.tiles;
  const grid = tileGrid(t, w, h, null); // r44: the level's cached lattice (generateLevel / buildLevelSpawns just built it for these tiles)
  const reached = reachableNodes(grid, level.startX + 0.5, level.startY + 0.5);
  const route = findPath(grid, level.startX + 0.5, level.startY + 0.5, level.exitX + 0.5, level.exitY + 0.5);
  return { nx: grid.nx, ny: grid.ny, reached, route: route ? route.points : null, sum: tileSum(t) };
}

export function planQuest(level, table, runSeed, levelIndex, story = {}, avoid = null) {
  if (!table || !table.rows.length) return null;
  const rng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0x9e57));
  const w = level.w, h = level.h, t = level.tiles;
  let grid = null, reached = null, route = null;
  const ensure = () => {
    if (grid) return;
    const qp = level.questPath && level.questPath.sum === tileSum(t) ? level.questPath : questPathFor(level); // the worker's copy, when the tiles still match
    grid = { nx: qp.nx, ny: qp.ny }; reached = qp.reached; route = qp.route ? { points: qp.route } : null;
  };
  const distToRoute = (x, y) => {
    let best = 1e9;
    const p = route ? route.points : null;
    if (!p) return best;
    for (let i = 0; i < p.length; i += 2) { const d = Math.hypot(p[i] - x, p[i + 1] - y); if (d < best) best = d; }
    return best;
  };
  const rock = (x, y) => t[y * w + x] !== 0;
  const nearSpawn = (x, y) => {
    if (!avoid) return false;
    for (let i = 0; i < avoid.length; i += 2) if (Math.hypot(avoid[i] - x, avoid[i + 1] - y) < AVOID_R) return true;
    return false;
  };
  /**
   * Floor spots: a water tile with rock under it and under both neighbours (a flat 3-wide floor), open water in the 3x3
   * above it (a cage 1.3 tiles wide never touches a wall), reachable, out of the shop, the set pieces and the start / exit.
   * @param {number} clearH rows of open water needed above the floor tile (including its own)
   */
  const spotCache = [];
  const floorSpots = (clearH) => {
    if (spotCache[clearH]) return spotCache[clearH]; // the same for every row tried (vibe fixes: it was recomputed per row)
    ensure();
    const out = spotCache[clearH] = [];
    for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
      if (rock(x, y) || !rock(x, y + 1) || !rock(x - 1, y + 1) || !rock(x + 1, y + 1)) continue;
      let open = true;
      for (let dy = 0; dy < clearH && open; dy++) for (let dx = -1; dx <= 1; dx++) if (rock(x + dx, y - dy)) { open = false; break; }
      if (!open) continue;
      if (inRect(x, y, level.shop) || inSetPiece(level, x, y)) continue;
      const cx = x + 0.5, cy = y + 0.5;
      if (Math.hypot(cx - level.startX - 0.5, cy - level.startY - 0.5) < MIN_START_DIST) continue;
      if (Math.hypot(cx - level.exitX - 0.5, cy - level.exitY - 0.5) < 5) continue;
      if (nearSpawn(cx, cy)) continue;
      if (!reachedNear(grid, reached, cx, cy, 0.3)) continue;
      out.push(x, y);
    }
    return out;
  };

  /** Where this row's thing goes, or null. Floor kinds return [x, y centre, floorY]. */
  const feasible = (row) => {
    switch (row.kindId) {
      case Q_VAULT: {
        if (!(level.nPockets > 0)) return null;
        const px = level.pockets[0], py = level.pockets[1];
        return Float32Array.of(px + 0.5, py + 1.72, 0); // the cache rests on the pocket floor, left cell (shells sit right of it)
      }
      default: {
        // prefer spots well off the shortest route (a side cave), then any spot off it
        for (const clearH of [3, 2]) {
          const all = floorSpots(clearH);
          if (!all.length) continue;
          for (const minRoute of [4, 2.5, 1.5]) {
            const cand = [];
            for (let i = 0; i < all.length; i += 2) if (distToRoute(all[i] + 0.5, all[i + 1] + 0.5) >= minRoute) cand.push(all[i], all[i + 1]);
            if (cand.length) {
              const k = Math.floor(rng() * (cand.length / 2)) * 2;
              const floorY = cand[k + 1] + 1, off = 0.55;
              return Float32Array.of(cand[k] + 0.5, floorY - off, floorY);
            }
          }
        }
        return null;
      }
    }
  };

  // eligible rows in a seeded order; the first one whose roll passes and that fits wins (one encounter per level at most)
  const pool = eligibleRows(table, story, levelIndex);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
  for (const row of pool) {
    const roll = rng();
    if (roll >= row.chance) continue;
    const found = feasible(row);
    if (!found) continue;
    const npc = table.npcById.get(row.npc);
    const outcome = pickOutcome(row.outcomes, beatSeed(runSeed, levelIndex, row.npc));
    return {
      qi: table.byId.get(row.id), kindId: row.kindId, id: row.id, npc: row.npc, name: npc.name, title: npc.title, reward: row.reward, count: 1,
      need: row.need, max: row.max, lines: row.lines, done: row.done || '', journal: row.journal || npc.journal || '', variant: row.variant,
      floorY: found[2], pos: Float32Array.of(found[0], found[1]),
      outcome, role: (outcome && outcome.role) || 'follow', stage: row.stage !== false, chat: npc.chat || [], react: npc.react || [],
    };
  }
  return null;
}

/** Fresh runtime state for a plan (null plan gives null). */
export function createQuestState(plan) {
  if (!plan) return null;
  return {
    plan, status: ST_ACTIVE, progress: 0, goal: plan.count,
    following: false,                       // rescue: the cage is broken, the critter trails the octopus (role 'follow')
    staying: false,                         // rescue: the cage is broken, the critter stays and swims about it (role 'stay')
    paid: false,                            // main.js paid the outcome (payQuest)
    idle: createIdle(plan.pos[0] || 0),     // facing, glances, the jump at a blast (idle.js)
    settled: false, swimT: 0, chatN: 0,     // vault: he swam out and stands (or hovers) where he stopped
    brokenBy: '',                           // rescue: 'dash' or 'bomb'
    cx: plan.pos[0], cy: plan.pos[1],        // rescue: the critter; vault: the diver (he swims out of the pocket once freed)
    wx: 0, wy: 0,                           // vault: where he swims to first (beside the octopus when it freed him)
    collected: false,                       // vault: freed
    trail: new Float32Array(TRAIL * 2), head: 0, filled: 0,
    clock: 0, met: false, helped: false, lastAsk: -99, leave: 0,
    talk: createTalk(),
  };
}

/** The person turned hostile (npcs.js) or died: the encounter ends with no reward and no stage up. Returns true when it was still running. */
export function questFail(st) {
  if (!st || st.status !== ST_ACTIVE) return false;
  st.status = ST_FAILED; st.leave = 0;
  st.talk.q.length = 0; st.talk.left = 0; st.talk.text = '';
  return true;
}

function finish(st) { if (st.status !== ST_ACTIVE) return false; st.status = ST_DONE; return true; }

/** The NPC's position, where the speech bubble hangs: [x, y of the head]. */
export function questSpeaker(st) {
  const p = st.plan;
  if (p.kindId === Q_VAULT) return [st.cx + 0.1, st.cy - 1.0];
  if (p.kindId === Q_MEET && p.npc !== 'pip') return [st.cx, p.floorY - 1.45];
  return [st.cx, st.cy - (p.variant === 'mama' ? 0.95 : 0.7)];
}

function speak(st, key) { const l = st.plan.lines[key]; if (l) say(st.talk, [l]); }
/** The thank-you scene: help, thank, then what the chosen outcome says. */
function thankScene(st) {
  st.talk.q.length = 0; st.talk.left = 0; st.talk.text = '';
  speak(st, 'help'); speak(st, 'thank');
  if (st.plan.outcome) say(st.talk, st.plan.outcome.lines);
}
/** Where the person's body centre is (what faces the octopus and reacts to blasts). */
function bodyOf(st) { return st.plan.kindId === Q_VAULT ? [st.cx, st.cy - 0.33] : [st.cx, st.cy]; }
/** A bomb went off at (x, y): the person (once out of the rock / the cage, or standing about) jumps and shouts. */
export function questReact(st, x, y) {
  if (!st || st.status === ST_FAILED) return false;
  const p = st.plan;
  if (p.kindId === Q_VAULT && !st.collected) return false;
  if (p.kindId === Q_RESCUE && !st.following && !st.staying) return false;
  const [bx, by] = bodyOf(st);
  return idleReact(st.idle, st.talk, p.react, x, y, bx, by);
}

/**
 * One fixed step after the octopus moved: speech (meet and ask as you come near), the touch that frees / collects /
 * meets, and the trail of the follower. Returns true when this completed the encounter without the exit (vault, meet).
 * @param {{isSolid:(x:number,y:number)=>boolean}} world
 */
export function questUpdate(st, octo, world, dt = STEP) {
  if (!st) return false;
  st.clock += dt;
  const done = questStep(st, octo, world, dt);
  talkStep(st.talk, dt);
  return done;
}

/** Clear water along the segment (the pocket is open: nothing solid between the two points). */
function clearBetween(world, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2));
  for (let i = 0; i <= n; i++) if (world.isSolid(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
  return true;
}

/** The freed diver swims up beside the octopus, then sinks to the floor under him (weighted boots) and stays there. */
function swimOut(st, world, dt) {
  const free = (x, y) => !world.isSolid(x, y - 0.8) && !world.isSolid(x, y) && !world.isSolid(x, y + 0.2);
  st.swimT += dt;
  const dx = st.wx - st.cx, dy = st.wy - st.cy, d = Math.hypot(dx, dy);
  if (d > 0.15 && st.swimT < SWIM_MAX) {
    const nx = st.cx + dx / d * SWIM_SPEED * dt, ny = st.cy + dy / d * SWIM_SPEED * dt;
    if (free(nx, ny)) { st.cx = nx; st.cy = ny; return; } // blocked: slide along one axis
    if (free(nx, st.cy)) { st.cx = nx; return; }
    if (free(st.cx, ny)) { st.cy = ny; return; }
  }
  // then sink until the feet (cy + 0.22) touch rock; after a long drop (or none possible) he simply hovers where he is
  const ny = st.cy + SINK_SPEED * dt;
  if (st.swimT < SWIM_MAX + 6 && !world.isSolid(st.cx, ny + 0.24) && free(st.cx, ny)) st.cy = ny;
  else st.settled = true;
}

/** Pip after the cage broke when he chose to stay: lazy loops round his open cage. */
function wander(st, world, dt) {
  const hx = st.plan.pos[0], hy = st.plan.pos[1] - 0.35, t = st.clock;
  let tx = hx + Math.cos(t * 0.8) * 1.1, ty = hy - 0.4 + Math.sin(t * 1.6) * 0.35;
  if (world.isSolid(tx, ty)) { tx = hx; ty = hy - 0.4; }
  const k = Math.min(1, dt * 2.5), nx = st.cx + (tx - st.cx) * k, ny = st.cy + (ty - st.cy) * k;
  if (!world.isSolid(nx, ny)) { st.cx = nx; st.cy = ny; }
}

/** The critter trails the octopus by CRITTER_LAG steps (role 'follow'). */
function follow(st, octo, world) {
  const lag = Math.min(CRITTER_LAG, st.filled);
  const i = (st.head - lag + TRAIL * 2) % TRAIL;
  let tx = st.trail[i * 2], ty = st.trail[i * 2 + 1];
  // keep beside the octopus, not inside it, and never on its centre: if the wanted point is solid, pick the
  // free spot around the octopus (8 directions, 0.95-1.1 tiles) closest to the trail point
  const dx = tx - octo.x, dy = ty - octo.y, dd = Math.hypot(dx, dy);
  if (dd < 0.95) { const ux = dd > 1e-3 ? dx / dd : -0.7, uy = dd > 1e-3 ? dy / dd : 0.7; tx = octo.x + ux * 0.95; ty = octo.y + uy * 0.95; }
  if (world.isSolid(tx, ty)) {
    const want = { x: tx, y: ty };
    let best = null, bd = Infinity;
    for (const r of [0.95, 1.1]) {
      for (let a = 0; a < 8; a++) {
        const px = octo.x + Math.cos(a * Math.PI / 4) * r, py = octo.y + Math.sin(a * Math.PI / 4) * r;
        if (world.isSolid(px, py)) continue;
        const ddd = Math.hypot(px - want.x, py - want.y);
        if (ddd < bd) { bd = ddd; best = [px, py]; }
      }
    }
    if (best) { tx = best[0]; ty = best[1]; } else { tx = st.cx; ty = st.cy; }
  }
  const nx2 = st.cx + (tx - st.cx) * 0.3, ny2 = st.cy + (ty - st.cy) * 0.3;
  if (!world.isSolid(nx2, ny2)) { st.cx = nx2; st.cy = ny2; }
}

function questStep(st, octo, world, dt) {
  const k = st.plan.kindId;
  if (k === Q_RESCUE) {
    st.trail[st.head * 2] = octo.x; st.trail[st.head * 2 + 1] = octo.y;
    st.head = (st.head + 1) % TRAIL;
    if (st.filled < TRAIL) st.filled++;
  }
  if (st.status === ST_FAILED) return false; // npcs.js has taken the person over (angry or dead)
  const [bx, by] = bodyOf(st);
  idleStep(st.idle, bx, by, octo, dt);
  const d = Math.hypot(octo.x - st.cx, octo.y - st.cy);
  if (!st.helped) {
    if (!st.met && d < MEET_R) { st.met = true; st.lastAsk = st.clock; speak(st, 'meet'); speak(st, 'ask'); }
    else if (st.met && d < ASK_AGAIN_R && !st.talk.text && !st.talk.q.length && st.clock - st.lastAsk > ASK_AGAIN_S) { st.lastAsk = st.clock; speak(st, 'ask'); }
  } else if (st.talk.text || st.talk.q.length) st.lastAsk = st.clock; // the quiet spell starts when the scene is over
  else if (d < CHAT_R && !octo.dead && st.clock - st.lastAsk > CHAT_S && st.plan.chat && st.plan.chat.length) {
    st.lastAsk = st.clock; say(st.talk, [st.plan.chat[st.chatN++ % st.plan.chat.length]]);
  }
  let done = false;
  if (k === Q_RESCUE) {
    if (st.following) follow(st, octo, world);
    else if (st.staying) wander(st, world, dt);
    // the cage is shut: only a dash into it breaks it (a bomb: questBlast). Swimming against it does nothing.
    else if (st.status === ST_ACTIVE && d < CAGE_BREAK_R && Math.hypot(octo.vx || 0, octo.vy || 0) >= DASH_KILL_SPEED) done = breakCage(st, 'dash');
  } else if (k === Q_VAULT) {
    if (st.collected) { if (!st.settled) swimOut(st, world, dt); }
    // r40: freed only when the pocket is open (clear water from the octopus to him) and the octopus is within about 2 tiles
    else if (st.status === ST_ACTIVE && d < FREE_R && clearBetween(world, octo.x, octo.y, st.cx, st.cy)) {
      st.collected = true; st.helped = true; st.lastAsk = st.clock;
      thankScene(st);
      // he first swims up beside the octopus (above it and a little aside, so he is not on top of it), then settles
      st.wx = octo.x + (st.cx < octo.x ? -0.6 : 0.6); st.wy = world.isSolid(octo.x, octo.y - 1.1) ? octo.y : octo.y - 1.1;
      done = finish(st);
    }
  } else if (k === Q_MEET && st.status === ST_ACTIVE && d < MEET_TOUCH_R && !octo.dead) {
    st.helped = true; st.met = true; st.lastAsk = st.clock;
    thankScene(st);
    done = finish(st);
  }
  return done;
}

/** The octopus reached the exit. Returns true when this completed the encounter (the follower came along). */
export function questOnExit(st) {
  if (!st || st.status !== ST_ACTIVE) return false;
  if (st.plan.kindId === Q_RESCUE) return st.following ? finish(st) : false;
  return false;
}

/** The cage broke: help, thank and the outcome's words. Role 'follow': the critter trails you to the exit (paid there);
 *  'stay': it stays and swims about the open cage, and the encounter is done at once. Returns true when that finished it. */
function breakCage(st, how) {
  st.helped = true; st.brokenBy = how; st.lastAsk = st.clock;
  if (st.plan.role === 'stay') st.staying = true; else st.following = true;
  thankScene(st);
  return st.staying ? finish(st) : false;
}

/** A bomb went off at (x, y) with radius r: a shut cage within CAGE_BLAST_R of it breaks. Returns true when it did. */
export function questBlast(st, x, y, r = 0) {
  if (!st || st.status !== ST_ACTIVE || st.plan.kindId !== Q_RESCUE || st.following || st.staying) return false;
  if (Math.hypot(st.cx - x, st.cy - y) > Math.max(CAGE_BLAST_R, r)) return false;
  breakCage(st, 'bomb');
  talkStep(st.talk, 0); // the first line shows at once
  return true;
}

export const CAGE_INK_R = 0.9; // an Ink Jet blob that splats this close to the cage centre breaks it (Actions tuning)
/** An Ink Jet blob splatted at (x, y): a shut cage it hit breaks, as a dash or a bomb would. Returns true when it did. */
export function questInk(st, x, y) {
  if (!st || st.status !== ST_ACTIVE || st.plan.kindId !== Q_RESCUE || st.following || st.staying) return false;
  if (Math.hypot(st.cx - x, st.cy - y) > CAGE_INK_R) return false;
  breakCage(st, 'ink');
  talkStep(st.talk, 0);
  return true;
}

/** Stage of a person after an encounter row completes: one up, never past the row's last eligible stage + 1, never back. */
export function nextStage(current, row) { return Math.max(current | 0, Math.min((current | 0) + 1, (row.max | 0) + 1)); }

// ---- the hub: who stands where, and what they say --------------------------------------------------------------

/**
 * The hub residents for this story: [{id, stage, name}] in table order, only people who have been met (stage >= 1).
 * Slots are spots of the hub (main.js maps an id to a position).
 */
export function hubResidents(table, story) {
  const out = [];
  for (const n of table.npcs) { const stage = (story[n.id] | 0); if (stage >= 1) out.push({ id: n.id, stage, name: n.name }); }
  return out;
}

/** Quill moves into the hub after the player's first dive. Returns the story key to set (or '' when nothing changes). */
export function collectorArrives(story, dives) { return (story.quill | 0) === 0 && dives >= 1 ? 'quill' : ''; }

function capName(id) { return id.charAt(0).toUpperCase() + id.slice(1); }

/**
 * What a resident says when the octopus swims up to them, as data: {lines, set:[[key, value]...], discover:[ids]}.
 *  - Quill with a relic in hand (story.relics > story.relicsGiven): he takes it, says the line for that relic, the journal
 *    gets that relic's entry (loot-relic-N); the third relic moves him to stage 2 (the lantern).
 *  - the first visit after a stage was reached (story['said<Name>'] < stage): the thank-you, then the stage's lines;
 *  - later visits: one line at a time, rotating.
 * Hub lines may use {n} (relics handed over) and {left}.
 */
export function hubVisit(table, story, id, visit = 0) {
  const npc = table.npcById.get(id);
  const out = { lines: [], set: [], discover: [] };
  if (!npc) return out;
  let stage = story[id] | 0;
  const given = story.relicsGiven | 0;
  const fill = (str) => str.replace('{n}', String(Math.min(given, RELICS_NEEDED))).replace('{left}', String(Math.max(0, RELICS_NEEDED - given)));
  if (npc.journal) out.discover.push(npc.journal);
  if (id === 'quill' && (story.relics | 0) > given && given < RELICS_NEEDED) {
    const n = given + 1;
    out.lines.push((npc.relics && npc.relics[n - 1]) || 'A relic. Thank you.');
    out.set.push(['relicsGiven', n]);
    out.discover.push('loot-relic-' + n);
    if (n >= RELICS_NEEDED) { stage = 2; out.set.push(['quill', 2]); }
    return out;
  }
  const key = 'said' + capName(id);
  const pending = (story[key] | 0) < stage;
  if (pending && npc.thanks[stage]) out.lines.push(fill(npc.thanks[stage]));
  // a gift promised in a level (an outcome's `next`): handed over now, applied when the next dive starts (save.js boonX)
  const gk = 'gift' + capName(id), gift = table.gifts && table.gifts[(story[gk] | 0) - 1];
  if (gift) {
    for (const l of gift.lines) out.lines.push(fill(l));
    out.set.push([gk, 0]);
    for (const b of ['bombs', 'shells', 'juice']) if (gift.boon[b] > 0) out.set.push(['boon' + capName(b), (story['boon' + capName(b)] | 0) + (gift.boon[b] | 0)]);
    out.gift = gift;
    if (pending) out.set.push([key, stage]);
    return out;
  }
  const pool = npc.hub[stage] || [];
  if (pool.length) {
    // the first visit tells the whole stage; later visits one line at a time, rotating
    if (pending || visit === 0) for (const l of pool) out.lines.push(fill(l));
    else out.lines.push(fill(pool[visit % pool.length]));
  }
  if (pending) out.set.push([key, stage]);
  return out;
}
