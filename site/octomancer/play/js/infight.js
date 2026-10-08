// Enemy infighting, the runtime side (2026-10-08, Daniel: "enemy infighting - yes, but Spelunky style: mostly they should ignore
// each other, aside from a few interactions that make sense"). The rules are data in creature-rules.js (INFIGHT, infightReach);
// this module is the one place the systems ask "is there something for me to hit / to hunt", through the shared damage entry
// (damage.js pick / hitPicked / locate) so blame, aggro and immunities stay the creature table's. See CREATURES.md section 4.
//
//   strike(rule, src, x, y, r, selfId, byOcto)  the nearest body touching (x, y, r) that the rule may reach takes `src`
//   projectile(src, x, y, r, shooterId, byOcto)  strike('projectile', ...): a cannon shot, a harpoon, a keeper's claw in flight
//   prey(x, y, range, selfId, los)              a piranha's frenzy target: a bleeding or knocked-out body, or a fresh corpse
//   hunt(rule, x, y, range, selfId, los)        the nearest body the rule may reach (a tentacle's 'free' prey)
//   locate(id)                                  where a hunted body or corpse is now (target), false once it is gone
//   bite(id, x, y, r, selfId)                   a frenzy bite at a lunging piranha's nose: the corpse it hunts, or any prey
//   stepThrown()                                loose props flying at THROWN_SPEED hit the body they touch ('thrown')
//
// The target override hook (for a future Lure spell): setLure(x, y, r, ttl) puts a point of interest in the water; a patrolling
// or lost creature (piranha, crab, manta, a hostile NPC that cannot see the octopus) within r of it swims or walks to it instead
// of its own beat. lureAt(x, y) fills lurePoint with the nearest lure that covers (x, y). Up to LURE_CAP lures at once.
//
// Data-oriented: flat typed arrays for the lures and the corpse bite counters, one reusable target record, no per-step allocation.

import { INFIGHT, infightReach, FRESH_S, CORPSE_BITES, THROWN_SPEED, HAZARD_COOL } from './creature-rules.js';
import { PK_BOMB, PK_POT, PK_CLAM, PK_RELIC, PK_FIND, PS_FREE } from './props.js';

export const LURE_CAP = 4;
export const LURE_R = 10;            // tiles: default reach of a lure
export const LURE_ARRIVE = 0.8;      // tiles: a lured swimmer hovers once it is this close
export const HUNT_SPEED = 0.3;       // u/s: a tentacle strikes at what moves (a calm NPC standing at its post is left alone)
/** Stable ids of fresh corpses (the damage families use the positive enemy ids and -1 .. -299). */
export const corpseId = (i) => -1000 - i;
const isCorpseId = (id) => id <= -1000;
const CORPSE_SLOTS = 64;
const THROWN_KINDS = new Uint8Array(16); THROWN_KINDS[PK_BOMB] = THROWN_KINDS[PK_POT] = THROWN_KINDS[PK_CLAM] = THROWN_KINDS[PK_RELIC] = THROWN_KINDS[PK_FIND] = 1;

/**
 * @param {ReturnType<import('./damage.js').createDamage>} damage the shared damage entry (main.js: the level's families)
 * @param {{corpses?: () => any, props?: () => any}} [opts] getters for the level's corpses system (data, remove) and props
 */
export function createInfight(damage, opts = {}) {
  const getCorpses = opts.corpses || (() => null);
  const getProps = opts.props || (() => null);
  const lure = { on: new Uint8Array(LURE_CAP), x: new Float32Array(LURE_CAP), y: new Float32Array(LURE_CAP), r: new Float32Array(LURE_CAP), ttl: new Float64Array(LURE_CAP) };
  const lurePoint = { x: 0, y: 0, r: 0, slot: -1 };
  const target = { kind: 0, id: 0, x: 0, y: 0, r: 0, name: '' }; // kind 0 none, 1 a body, 2 a fresh corpse
  const cBites = new Uint8Array(CORPSE_SLOTS), cSeq = new Float64Array(CORPSE_SLOTS).fill(-1);
  const events = []; // {type:'infight', rule, src, x, y, kind, dealt} | {type:'frenzyBite', x, y, kind, gone}; main.js drains it
  let hits = 0;

  // the reach tests of the table, one closure per rule (no allocation per call)
  const reachTest = {};
  for (const rule of Object.keys(INFIGHT)) reachTest[rule] = (V) => infightReach(rule, V.kind, V.wound === 1, V.stun, false);
  let losFn = null, losX = 0, losY = 0, curTest = null;
  const testWithLos = (V) => curTest(V) && (!losFn || losFn(losX, losY, V.x, V.y));
  let huntBase = null, huntMin2 = 0;
  const huntTest = (V) => huntBase(V) && V.vx * V.vx + V.vy * V.vy >= huntMin2;

  function corpsesData() { const c = getCorpses(); return c ? c.data || c : null; }
  function freshBites(d, i) { if (cSeq[i] !== d.seq[i]) { cSeq[i] = d.seq[i]; cBites[i] = 0; } return cBites[i]; }

  /** The nearest fresh corpse within range of (x, y) (edge distance), with a clear line; -1 when none. */
  function freshCorpse(x, y, range, los) {
    const d = corpsesData();
    if (!d) return -1;
    let best = -1, bd = Infinity;
    for (let i = 0; i < d.n && i < CORPSE_SLOTS; i++) {
      if (!d.alive[i] || d.age[i] >= FRESH_S) continue;
      const dd = Math.hypot(d.x[i] - x, d.y[i] - y) - d.radius[i];
      if (dd > range || dd >= bd) continue;
      if (los && !los(x, y, d.x[i], d.y[i])) continue;
      best = i; bd = dd;
    }
    return best;
  }
  function setTargetCorpse(d, i) { target.kind = 2; target.id = corpseId(i); target.x = d.x[i]; target.y = d.y[i]; target.r = d.radius[i]; target.name = 'corpse'; }
  function setTargetPicked() { const P = damage.picked; target.kind = 1; target.id = P.id; target.x = P.x; target.y = P.y; target.r = P.r; target.name = P.kind; }

  const api = {
    events, target, lurePoint,
    hits() { return hits; },

    /** One fixed step: the lures' clocks. */
    tick(dt) {
      for (let k = 0; k < LURE_CAP; k++) if (lure.on[k] && (lure.ttl[k] -= dt) <= 0) lure.on[k] = 0;
    },

    // ------------------------------------------------------------------ the target override hook (a future Lure spell)
    /** A point of interest at (x, y): patrolling or lost creatures within r swim / walk to it for ttl s. Returns its slot (-1: full). */
    setLure(x, y, r = LURE_R, ttl = Infinity) {
      for (let k = 0; k < LURE_CAP; k++) {
        if (lure.on[k]) continue;
        lure.on[k] = 1; lure.x[k] = x; lure.y[k] = y; lure.r[k] = r; lure.ttl[k] = ttl;
        return k;
      }
      return -1;
    },
    /** Move a lure (a bait that drifts). */
    moveLure(slot, x, y) { if (slot >= 0 && slot < LURE_CAP && lure.on[slot]) { lure.x[slot] = x; lure.y[slot] = y; } },
    /** Remove one lure, or every lure (slot < 0). */
    clearLure(slot = -1) { if (slot < 0) lure.on.fill(0); else if (slot < LURE_CAP) lure.on[slot] = 0; },
    /** The nearest active lure whose reach covers (x, y): fills lurePoint and returns true. */
    lureAt(x, y) {
      let best = -1, bd = Infinity;
      for (let k = 0; k < LURE_CAP; k++) {
        if (!lure.on[k]) continue;
        const dd = Math.hypot(lure.x[k] - x, lure.y[k] - y);
        if (dd <= lure.r[k] && dd < bd) { best = k; bd = dd; }
      }
      if (best < 0) return false;
      lurePoint.x = lure.x[best]; lurePoint.y = lure.y[best]; lurePoint.r = lure.r[best]; lurePoint.slot = best;
      return true;
    },
    /** Snapshot of the active lures (tests, the debug overlay). */
    lures() { const out = []; for (let k = 0; k < LURE_CAP; k++) if (lure.on[k]) out.push({ slot: k, x: lure.x[k], y: lure.y[k], r: lure.r[k], ttl: lure.ttl[k] }); return out; },

    // ------------------------------------------------------------------ attacks
    /**
     * The nearest body touching the circle (x, y, r), not `selfId`, that INFIGHT[rule] may reach takes `src` (byOcto: undefined
     * = the source's own blame). Returns -1 when nothing was touched, else the damage dealt (0: it touched a body that shrugged
     * it off, an invulnerable spike or a shut shell: a projectile still stops there).
     */
    strike(rule, src, x, y, r, selfId = 0, byOcto = undefined) {
      curTest = reachTest[rule]; losFn = null;
      if (!curTest || !damage.pick(x, y, r, selfId, curTest)) return -1;
      const P = damage.picked, kind = P.kind, px = P.x, py = P.y;
      const dealt = damage.hitPicked(src, x - (px - x) * 0.01, y - (py - y) * 0.01, -1, 1, byOcto);
      hits++;
      events.push({ type: 'infight', rule, src, x, y, kind, dealt });
      return dealt;
    },
    /**
     * Every body (not selfId) whose centre is inside the box [x0, x1] x [y0, y1] and that `rule` may reach: with src, each takes
     * it (a clam's snap); with src '' they are only counted (something swam into the open mouth). Returns the count.
     */
    box(rule, src, x0, y0, x1, y1, selfId = 0) {
      const test = reachTest[rule];
      if (!test) return 0;
      let n = 0;
      damage.each((f, i, V) => {
        if (V.id === selfId || V.x < x0 || V.x > x1 || V.y < y0 || V.y > y1 || !test(V)) return;
        n++;
        if (!src) return;
        const kind = V.kind, bx = V.x, by = V.y;
        const dealt = damage.hitFound(f, i, src, bx, by + 0.5);
        hits++;
        events.push({ type: 'infight', rule, src, x: bx, y: by, kind, dealt });
      });
      return n;
    },
    /** A projectile (shot, harpoon, a claw in flight) at (x, y) with radius r: the first body it touches takes it. */
    projectile(src, x, y, r, shooterId = 0, byOcto = undefined) { return api.strike('projectile', src, x, y, r, shooterId, byOcto); },

    // ------------------------------------------------------------------ hunting
    /** A frenzy target for a piranha at (x, y): the nearest bleeding or knocked-out body, or fresh corpse, in range (los(x0, y0, x1, y1) optional). Fills target. */
    prey(x, y, range, selfId = 0, los = null) {
      target.kind = 0;
      curTest = reachTest.frenzy; losFn = los; losX = x; losY = y;
      const found = damage.pick(x, y, range, selfId, testWithLos);
      losFn = null;
      const ci = freshCorpse(x, y, found ? Math.min(range, damage.picked.d) : range, los);
      const d = corpsesData();
      if (ci >= 0) { setTargetCorpse(d, ci); return true; }
      if (found) { setTargetPicked(); return true; }
      return false;
    },
    /**
     * The nearest body INFIGHT[rule] may reach within range that moves at least minSpeed u/s (a tentacle: 'grab', free swimmers
     * and walkers that move; a calm NPC standing at its post is not prey). Fills target.
     */
    hunt(rule, x, y, range, selfId = 0, los = null, minSpeed = HUNT_SPEED) {
      target.kind = 0;
      huntBase = reachTest[rule]; huntMin2 = minSpeed * minSpeed;
      curTest = huntBase ? huntTest : null;
      losFn = los; losX = x; losY = y;
      const found = !!curTest && damage.pick(x, y, range, selfId, testWithLos);
      losFn = null;
      if (found) setTargetPicked();
      return found;
    },
    /** Where body or corpse `id` is now (fills target); false once it is dead, gone, or (a corpse) no longer fresh. */
    locate(id) {
      if (isCorpseId(id)) {
        const d = corpsesData(), i = -1000 - id;
        if (!d || i >= d.n || !d.alive[i] || d.age[i] >= FRESH_S + 2) { target.kind = 0; return false; }
        setTargetCorpse(d, i); return true;
      }
      if (!damage.locate(id)) { target.kind = 0; return false; }
      const V = damage.view;
      target.kind = 1; target.id = id; target.x = V.x; target.y = V.y; target.r = V.r; target.name = V.kind;
      return true;
    },
    /** A frenzy bite at a lunging piranha's nose (x, y, r): the corpse `id` when it hunts one, else any prey it touches. True when it bit. */
    bite(id, x, y, r, selfId = 0) {
      if (isCorpseId(id)) {
        const d = corpsesData(), i = -1000 - id, c = getCorpses();
        if (!d || i >= d.n || !d.alive[i] || Math.hypot(d.x[i] - x, d.y[i] - y) > r + d.radius[i]) return false;
        const n = freshBites(d, i) + 1;
        cBites[i] = n;
        const dx = d.x[i] - x, dy = d.y[i] - y, l = Math.hypot(dx, dy) || 1;
        d.vx[i] += dx / l * 1.5; d.vy[i] += dy / l * 1.5; d.spin[i] += (dx >= 0 ? 1 : -1) * 3;
        if (d.state[i] !== 0 && c && c.wake) c.wake(i);
        const gone = n >= CORPSE_BITES;
        events.push({ type: 'frenzyBite', x: d.x[i], y: d.y[i], kind: 'corpse', gone });
        if (gone && c && c.remove) c.remove(i);
        hits++;
        return true;
      }
      const dealt = api.strike('frenzy', 'bite', x, y, r, selfId);
      if (dealt < 0) return false;
      events.push({ type: 'frenzyBite', x, y, kind: damage.picked.kind, gone: false });
      return true;
    },
    /** Bites taken out of corpse slot i so far (tests). */
    corpseBites(i) { const d = corpsesData(); return d && i < CORPSE_SLOTS ? freshBites(d, i) : 0; },

    // ------------------------------------------------------------------ thrown things
    /** Loose props (a thrown bomb, a pot, a clam, the relic, a find) flying at THROWN_SPEED or more hit the body they touch and bounce off. */
    stepThrown() {
      const p = getProps();
      if (!p) return 0;
      const d = p.data;
      let n = 0;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i] || d.state[i] !== PS_FREE || !THROWN_KINDS[d.kind[i]]) continue;
        const vx = d.vx[i], vy = d.vy[i];
        if (vx * vx + vy * vy < THROWN_SPEED * THROWN_SPEED) continue;
        const now = damage.now();
        curTest = coolTest; coolNow = now;
        if (!damage.pick(d.x[i], d.y[i], d.radius[i], 0, coolTest)) continue;
        const P = damage.picked, f = P.f, bi = P.i, bx = P.x, by = P.y, kind = P.kind;
        // a bomb is only ever in the water because she threw it (or dropped it): her doing; anything else: the knocked-about rule
        const dealt = damage.hitPicked('thrown', d.x[i], d.y[i], -1, 1, d.kind[i] === PK_BOMB ? true : undefined);
        f.setTimers(bi, now + HAZARD_COOL, -1);
        // it bounces off the body
        let nx = d.x[i] - bx, ny = d.y[i] - by; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const vn = vx * nx + vy * ny;
        if (vn < 0) { d.vx[i] = (vx - 1.5 * vn * nx) * 0.6; d.vy[i] = (vy - 1.5 * vn * ny) * 0.6; }
        hits++; n++;
        events.push({ type: 'infight', rule: 'projectile', src: 'thrown', x: d.x[i], y: d.y[i], kind, dealt });
      }
      return n;
    },
  };
  let coolNow = 0;
  const coolTest = (V) => V.cool <= coolNow && reachTest.projectile(V);
  return api;
}
