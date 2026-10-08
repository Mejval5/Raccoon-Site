// The shared damage entry point (2026-10-08, unified creature rules). See creature-rules.js for the table and the rule,
// and octomancer-web/CREATURES.md for the whole picture.
//
// Every system that holds creature bodies registers a FAMILY adapter here (main.js, once per level):
//   enemies.family    enemies.js   piranha, crab, manta, cannon, urchin, horns (the Beholder is invulnerable and not listed)
//   creatures.family  creatures.js giant clam, tentacle
//   npcs.family       npcs.js      Marlo, Pip, Quill, the pool host
//   keeperFamily(k)   shopkeeper.js the shopkeepers
// A family adapter is { name, begin(), count(), view(i, V), apply(i, src, fx, fy, dmg, knockScale, byOcto), push(i, ax, ay, mode),
// setTimers(i, coolUntil, blameUntil) }. view() fills the shared body view V and returns false for a slot that is gone;
// apply() runs creature-rules.js resolveHit for the body's kind and applies the outcome in the family's own records (hp,
// death event and corpse, knock, stun, aggro); it returns the damage dealt (0: ignored).
//
// Sources (hazards.js, bomb.js via main.js, props.js, the Ink Jet, dashes, a spike helmet ...) never special-case a kind: they
// find bodies through this module (blast / circle / each) and hit them with hit(). The octopus is hit through octoHit().

import { rowOf, SOURCES, PH_SWIM, PH_ANCHORED, PH_NONE, HAZARD_COOL, BLAME_S } from './creature-rules.js';
import { hurtOctopus, killOctopus } from './octopus.js';

export const BLAST_REACH = 2; // a bomb shoves out to this many radii (bomb.js BLAST_REACH); damage only inside one radius

/** The shared body view an adapter fills (kind name, centre, radius, velocity, knocked-out seconds, shell shut, timers). */
export function makeView() { return { kind: '', x: 0, y: 0, r: 0, vx: 0, vy: 0, stun: 0, shut: false, cool: 0, blame: 0 }; }

export function createDamage() {
  const fams = [];
  const V = makeView();
  let now = 0;
  let hits = 0; // total hits applied (tests)

  function famOf(name) { for (let k = 0; k < fams.length; k++) if (fams[k].name === name) return fams[k]; return null; }

  /** Apply `src` to body i of family f. byOcto: the octopus is to blame (aggro); undefined = the source's default or the body's blame timer. */
  function hitBody(f, i, src, fx, fy, dmg = -1, knockScale = 1, byOcto = undefined) {
    if (!f.view(i, V)) return 0;
    const s = SOURCES[src];
    if (byOcto === undefined) byOcto = s ? (s.blame === 'octo' || (s.blame !== 'none' && V.blame > now)) : false;
    const dealt = f.apply(i, src, fx, fy, dmg, knockScale, !!byOcto);
    if (dealt !== 0) hits++;
    // a body the octopus knocked about stays her fault for a moment (her bomb throws the keeper onto spikes)
    if (byOcto && s && s.knock > 0 && knockScale > 0) f.setTimers(i, -1, now + BLAME_S);
    return dealt;
  }

  const api = {
    /** Register (or replace, by name) a family adapter. */
    register(f) {
      for (let k = 0; k < fams.length; k++) if (fams[k].name === f.name) { fams[k] = f; return f; }
      fams.push(f); return f;
    },
    unregister(name) { for (let k = fams.length - 1; k >= 0; k--) if (fams[k].name === name) fams.splice(k, 1); },
    families() { return fams; },
    family: famOf,
    /** Advance the clock the cooldowns and blame timers read (once per fixed step). */
    tick(dt) { now += dt; },
    now() { return now; },
    hits() { return hits; },
    view: V,

    /** Hit body i of family `name` with `src` (dmg < 0: the source's own damage). Returns the damage dealt. */
    hit(name, i, src, fx, fy, dmg = -1, knockScale = 1, byOcto = undefined) {
      const f = typeof name === 'string' ? famOf(name) : name;
      if (!f) return 0;
      if (f.begin) f.begin();
      return hitBody(f, i, src, fx, fy, dmg, knockScale, byOcto);
    },

    /**
     * fn(f, i, V) for every live body of every family (V is the shared view: read it, do not keep it). The custom-geometry
     * sources (a spike strip, an eel's ring, a jet stream) use this and then call api.hit / api.push.
     */
    each(fn) {
      for (let k = 0; k < fams.length; k++) {
        const f = fams[k];
        if (f.begin) f.begin();
        const n = f.count();
        for (let i = 0; i < n; i++) if (f.view(i, V)) fn(f, i, V);
      }
    },
    /** Same as hit() for a body found by each() (no begin()). */
    hitFound(f, i, src, fx, fy, dmg = -1, knockScale = 1, byOcto = undefined) { return hitBody(f, i, src, fx, fy, dmg, knockScale, byOcto); },

    /**
     * A bomb at (x, y), radius R: every body whose edge is within R takes the bomb (SOURCES.bomb.dmg); out to BLAST_REACH * R
     * it is only shoved (falling off linearly) and knocked out. Rock still standing between the blast and a body shields it
     * (isSolid optional). Returns the bodies hurt or shoved.
     */
    blast(x, y, R, isSolid = null) {
      const reach = R * BLAST_REACH;
      let n = 0;
      for (let k = 0; k < fams.length; k++) {
        const f = fams[k];
        if (f.begin) f.begin();
        const cnt = f.count();
        for (let i = 0; i < cnt; i++) {
          if (!f.view(i, V)) continue;
          const d = Math.max(0, Math.hypot(V.x - x, V.y - y) - V.r * 0.5);
          if (d > reach) continue;
          if (isSolid && !clearLine(isSolid, x, y, V.x, V.y, V.r * 0.6)) continue;
          if (hitBody(f, i, 'bomb', x, y, d <= R ? -1 : 0, 1 - d / reach, true) !== 0 || d > R) n++;
        }
      }
      return n;
    },

    /**
     * `src` lands on every body overlapping the circle (x, y, r) that is not cooling down from the last hazard hit; a survivor
     * cools down `cool` s (one landing = one hit). byOcto: the octopus caused it (a boulder she set off). Returns the hits.
     */
    circle(src, x, y, r, byOcto = undefined, cool = HAZARD_COOL) {
      let n = 0;
      for (let k = 0; k < fams.length; k++) {
        const f = fams[k];
        if (f.begin) f.begin();
        const cnt = f.count();
        for (let i = 0; i < cnt; i++) {
          if (!f.view(i, V) || V.cool > now) continue;
          if (Math.hypot(V.x - x, V.y - y) >= r + V.r) continue;
          if (hitBody(f, i, src, x, y, -1, 1, byOcto) !== 0) { n++; f.setTimers(i, now + cool, -1); }
        }
      }
      return n;
    },
    /** For each()-found bodies: is it cooling down from a hazard hit? And start its cooldown. */
    cooling(v) { return v.cool > now; },
    cool(f, i, t = HAZARD_COOL) { f.setTimers(i, now + t, -1); },

    /**
     * A current pushes body i (V from each()) with acceleration (ax, ay) for dt: the table decides. A knocked-out body is thrown
     * (its velocity, scaled by mass); a free swimmer drifts along at `drift` of the force (its own AI still steers); a walker
     * on its floor and anything anchored stay put.
     */
    push(f, i, v, ax, ay, dt, drift) {
      const row = rowOf(v.kind);
      if (row.physics === PH_ANCHORED || row.physics === PH_NONE || row.invulnerable) return false;
      const m = row.mass || 1;
      if (v.stun > 0) { f.push(i, ax * dt / m, ay * dt / m, 'knock'); return true; }
      if (row.physics !== PH_SWIM) return false;
      f.push(i, ax * drift * dt / m, ay * drift * dt / m, 'drift');
      return true;
    },
  };
  return api;
}

/**
 * A family adapter that forwards to whatever getFam() returns now (null: no bodies). main.js registers these once, so a new
 * level's enemies / creatures / NPCs / keepers are picked up without registering again.
 */
export function proxyFamily(name, getFam) {
  let cur = null;
  return {
    name,
    begin() { cur = getFam() || null; if (cur && cur.begin) cur.begin(); },
    count() { return cur ? cur.count() : 0; },
    view(i, V) { return cur ? cur.view(i, V) : false; },
    apply(i, src, fx, fy, dmg, knockScale, byOcto) { return cur ? cur.apply(i, src, fx, fy, dmg, knockScale, byOcto) : 0; },
    push(i, ax, ay, mode) { if (cur) cur.push(i, ax, ay, mode); },
    setTimers(i, cool, blame) { if (cur) cur.setTimers(i, cool, blame); },
  };
}

/** Open water from (x0, y0) to within `skip` of (x1, y1) (the endpoints themselves are not tested: a body on a wall). isSolid takes world coordinates. */
function clearLine(isSolid, x0, y0, x1, y1, skip) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), n = Math.ceil(L / 0.2);
  for (let k = 1; k < n; k++) {
    if ((n - k) * (L / n) < skip) break;
    if (isSolid(x0 + dx * k / n, y0 + dy * k / n)) return false;
  }
  return true;
}

/**
 * The octopus's side of the same entry: what SOURCES[src].octo says (hearts, knock, stun), through octopus.js. A source whose
 * octopus outcome is a styled kill (spikes 'impale', a boulder 'splat', a clam, a tentacle) needs its own pin geometry: those
 * callers use killOctopus themselves; this handles a plain kill (kill: '') and every hearts outcome.
 * Returns true when it hurt (or killed) her.
 */
export function octoHit(o, src, fx, fy, cause = src) {
  const s = SOURCES[src];
  if (!s) return false;
  const oc = s.octo;
  if (oc.kill === '') return killOctopus(o, cause);
  if (!oc.hearts) return false;
  const opts = OCTO_OPTS;
  opts.dmg = oc.hearts; opts.knock = oc.knock; opts.stun = oc.stun || 0;
  return hurtOctopus(o, fx, fy, cause, opts.knock === undefined ? { dmg: opts.dmg, stun: opts.stun } : opts);
}
const OCTO_OPTS = { dmg: 1, knock: undefined, stun: 0 };
