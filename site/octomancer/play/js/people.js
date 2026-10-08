// The dive's people beyond this level's encounter (owners round 3, quests rework): who owes you a meeting further down the dive,
// who holds a grudge, and the visitors waiting on this level (near the exit, or in the rest grotto) with a reward. main.js owns
// one of these for the whole session: newDive() when a dive starts, setupLevel() when a level is built, step() each fixed step
// (it returns the reward hand-overs to apply), react() for a blast, place() for npcs.js (so a visitor can be hurt and angered).
//
// Grudges (Spelunky): an angered person stays angry for the rest of the dive, a killed one stays dead. Their owed meetings pay
// nothing: a killed person never comes; an angered one comes back hostile (npcs.js takes it over: Marlo with his harpoon).
// Data-oriented: plain records, no DOM, no Math.random.

import { owedFrom, createVisitor, visitorStep, findFloorNear, DUE_REST } from './visitors.js';
import { idleReact } from './idle.js';
import { npcByName } from './npcs.js';

export const G_NONE = 0, G_ANGRY = 1, G_DEAD = 2;
/** npcs.js slot index of the visitors (0 = the encounter's person, 0.. = the pool hosts). */
export const VISITOR_IDX = 5;
const NEAR_EXIT = [2.5, 8], NEAR_SPRING = [3, 10];

export function createPeople() {
  const P = {
    owed: [],                       // meetings still to come this dive: owedFrom() records
    grudge: new Uint8Array(5),      // by npcs.js id: G_ANGRY / G_DEAD for the rest of the dive
    visitors: [],                   // this level's: createVisitor() records (+ who, idx, hostile)
    log: [],                        // owed meetings kept / missed this dive, for tests and review
  };

  /** A dive starts: no meetings owed, nobody angry. */
  P.newDive = () => { P.owed.length = 0; P.grudge.fill(0); P.visitors.length = 0; P.log.length = 0; };

  /** npcs.js: someone was angered / killed (not in the hub: a hub quarrel is forgotten when the dive starts). */
  P.noteGrudge = (who, killed) => { if (who > 0 && who < 5) P.grudge[who] = Math.max(P.grudge[who], killed ? G_DEAD : G_ANGRY); };

  /** Owe a meeting: an outcome's `later`, met on `level` (a run.level). Returns the record or null (no room left in the dive). */
  P.owe = (npc, name, later, level, seed, lastLevel, hasRest) => {
    const o = owedFrom(npc, name, later, level, seed, lastLevel, hasRest);
    if (o) P.owed.push(o);
    return o;
  };

  /**
   * A level was built. `due` = run.level in the Shallows, DUE_REST in the rest grotto. Meetings due here become visitors at a
   * floor spot near the exit / the spring (`anchor` {x, y}); a killed person's meeting is dropped. `bad(x, y)` vetoes a spot
   * (the shop, the encounter). Returns the visitors.
   * @param {{isSolid:(x:number,y:number)=>boolean}} world
   */
  P.setupLevel = (due, world, anchor, bad = null, chatOf = () => []) => {
    P.visitors.length = 0;
    if (!anchor) return P.visitors;
    for (let k = P.owed.length - 1; k >= 0; k--) {
      const o = P.owed[k];
      if (o.due !== due) continue;
      P.owed.splice(k, 1);
      const who = npcByName(o.npc);
      const grudge = who > 0 ? P.grudge[who] : 0;
      if (grudge === G_DEAD) { P.log.push({ npc: o.npc, due, kept: false, why: 'dead' }); continue; }
      const [r0, r1] = due === DUE_REST ? NEAR_SPRING : NEAR_EXIT;
      const taken = P.visitors;
      const veto = (x, y) => (bad && bad(x, y)) || taken.some((v) => Math.hypot(v.x - x, v.floorY - y) < 2.2);
      const spot = findFloorNear(world.isSolid, anchor.x, anchor.y, r0, r1, 2, veto) || findFloorNear(world.isSolid, anchor.x, anchor.y, 1.5, r1 + 4, 2, veto);
      if (!spot) { P.log.push({ npc: o.npc, due, kept: false, why: 'nospot' }); continue; }
      const v = createVisitor(o, spot, o.variant ? [] : chatOf(o.npc), k + due);
      v.who = who; v.idx = VISITOR_IDX + taken.length; v.hostile = grudge === G_ANGRY;
      P.visitors.push(v);
      P.log.push({ npc: o.npc, due, kept: !v.hostile, why: v.hostile ? 'angry' : 'waiting' });
    }
    return P.visitors;
  };

  /** Tell npcs.js where the visitors are (each step). An angry one is created hostile and npcs.js moves it from then on. */
  P.place = (npcs) => {
    for (const v of P.visitors) {
      if (v.who <= 0) continue;
      if (v.hostile && npcs.owns(v.who) && npcs.find(v.who, v.idx) >= 0) continue;
      npcs.place(v.who, v.x, v.y, v.idx, 0);
    }
  };

  /** One step: the calm visitors greet and hand over. Returns the hand-overs [{v, reward, x, y}] (main.js applies them). */
  P.step = (octo, dt, npcs) => {
    const out = [];
    for (const v of P.visitors) {
      if (v.hostile || (npcs && npcs.owns(v.who))) continue;
      if (visitorStep(v, octo, dt) === 'give') out.push({ v, reward: v.owed.reward, x: v.x, y: v.cy });
    }
    return out;
  };

  /** A blast at (x, y): calm visitors close by jump and shout. */
  P.react = (x, y, reactOf, npcs) => {
    for (const v of P.visitors) if (!v.hostile && !(npcs && npcs.owns(v.who))) idleReact(v.idle, v.talk, reactOf(v.npc), x, y, v.x, v.cy);
  };

  /** Plain snapshot (tests, review). */
  P.snapshot = (npcs) => ({
    owed: P.owed.map((o) => ({ npc: o.npc, variant: o.variant, due: o.due, where: o.where, reward: o.reward, from: o.from, metAt: o.metAt })),
    grudge: Array.from(P.grudge),
    visitors: P.visitors.map((v) => ({ npc: v.npc, variant: v.variant, name: v.name, x: v.x, y: v.y, cy: v.cy, floorY: v.floorY, greeted: v.greeted, gave: v.gave, hostile: v.hostile || !!(npcs && npcs.owns(v.who)), face: v.idle.face, text: v.talk.text })),
    log: P.log.slice(),
  });
  return P;
}
