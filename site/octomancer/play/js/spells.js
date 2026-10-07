// Fish juice and spells (V2-PLAN section 14). Shells stay the shop money; fish juice ("blended up fishes") drops from kills
// and pays for spells. A beaten creature's body leaks a little of it, a cloudy trickle that dissolves after a few seconds; only the
// Siphon Shell (a carried item, items.js: octo.siphonR) lets the octopus drink it. Without it the jar is refilled only by the spring
// in the rest grotto at the end of the zone, so a run starts with a full jar. The juice lives in the run (`run.juice`, in droplets): it is kept from level to level and reset by
// a death or a new dive. The jar holds `jarCasts` casts of `perCast` droplets each. Spells are data rows in
// data/spells.json; the run carries one equipped spell (`run.spell`, an id) and a cast runs the row's `effect` from the
// EFFECTS table below, so a rune spell later is a new row plus (if it does something new) one new effect.
//
// Data-oriented: droplets and ink clouds are fixed pools of typed arrays (struct of arrays), no allocation per frame.

const res = await fetch(new URL('../data/spells.json', import.meta.url));
if (!res.ok) throw new Error('spells.json ' + res.status);
const json = await res.json();

/** Juice tuning: perCast, jarCasts, startCasts, dropMin, dropMax, pullSpeed, collectR, pickupDelay, life (s a leaked droplet lasts before it dissolves). */
export const JUICE = Object.freeze({ ...json.juice });
/** The spell rows (data/spells.json). */
export const SPELLS = json.spells.map((s) => Object.freeze({ ...s }));
const BY_ID = new Map(SPELLS.map((s) => [s.id, s]));
/** Tests only: add a spell row (e.g. a second spell, to check hotbar switching); returns a function that removes it again. */
export function registerSpellForTest(row) {
  const r = Object.freeze({ ...row });
  SPELLS.push(r); BY_ID.set(r.id, r);
  return () => { const i = SPELLS.indexOf(r); if (i >= 0) SPELLS.splice(i, 1); BY_ID.delete(r.id); };
}
/** The spell every run starts with equipped. */
export const START_SPELL = json.start;
export function spellById(id) { return BY_ID.get(id) || null; }

// ------------------------------------------------------------------------------------------ the jar (pure, on the run)
/** Droplets the jar holds when full. */
export function juiceCap() { return JUICE.jarCasts * JUICE.perCast; }
/** Droplets a run starts with (a full jar: refills are rare). */
export function juiceStart() { return Math.min(juiceCap(), JUICE.startCasts * JUICE.perCast); }
/** Whole casts in the jar. */
export function castsOf(juice) { return Math.floor(juice / JUICE.perCast); }
/** The jar is full: droplets stay where they are until there is room again. */
export function jarFull(run) { return run.juice >= juiceCap(); }
/** Pour droplets into the run's jar (capped); returns how many went in. */
export function addJuice(run, n) {
  const room = Math.max(0, juiceCap() - run.juice);
  const k = Math.max(0, Math.min(room, n | 0));
  run.juice += k;
  return k;
}
/** How many droplets a kill drops (dropMin..dropMax), from a hash of the level seed and the kill number: replays match. */
export function dropCount(seed, killIndex) {
  let h = Math.imul((killIndex + 7) >>> 0, 2246822519) ^ Math.imul(seed >>> 0, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 668265263) >>> 0;
  const u = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  return JUICE.dropMin + Math.min(JUICE.dropMax - JUICE.dropMin, Math.floor(u * (JUICE.dropMax - JUICE.dropMin + 1)));
}

export const CAST_OK = 1, CAST_EMPTY = 0, CAST_NONE = -1;
/** What each spell `effect` does. `ctx` = {clouds, x, y, vx, vy}. Returns true if it happened. */
const EFFECTS = {
  cloud(spell, ctx) { return ctx.clouds.puff(ctx.x, ctx.y, ctx.vx, ctx.vy, spell) >= 0; },
};
/**
 * Cast a spell (the hotbar's selected one) out of the run's jar: CAST_OK (paid and done), CAST_EMPTY (not enough juice:
 * the jar shakes) or CAST_NONE (no such spell). `ctx` is what the effects need ({clouds, x, y, vx, vy}).
 */
export function castSpell(run, spellId, ctx) {
  const spell = spellById(spellId);
  if (!spell || !EFFECTS[spell.effect]) return CAST_NONE;
  const price = spell.cost * JUICE.perCast;
  if (run.juice < price) return CAST_EMPTY;
  if (!EFFECTS[spell.effect](spell, ctx)) return CAST_NONE;
  run.juice -= price;
  return CAST_OK;
}

// ------------------------------------------------------------------------------------------ droplets
export const MAX_DROPS = 64;
const DROP_DRAG = 3.2;   // 1/s, the pop out of a kill slows down
const DROP_SINK = 0.35;  // u/s^2, a resting droplet settles slowly
const DROP_BOB = 0.5;    // u/s cap of the sink

/** The leaked droplets of one level. With the Siphon Shell, `update` pulls the ones within octo.siphonR to the octopus and drinks them on touch. */
export function createJuiceDrops() {
  const d = {
    n: MAX_DROPS, live: 0,
    x: new Float32Array(MAX_DROPS), y: new Float32Array(MAX_DROPS), vx: new Float32Array(MAX_DROPS), vy: new Float32Array(MAX_DROPS),
    age: new Float32Array(MAX_DROPS), ph: new Float32Array(MAX_DROPS), alive: new Uint8Array(MAX_DROPS),
  };
  // leaking bodies: a beaten creature's body leaks its juice as a slow trickle (Daniel: the world feels alive, nothing pops out)
  const LEAKS = 16;
  const lk = { x: new Float32Array(LEAKS), y: new Float32Array(LEAKS), left: new Uint8Array(LEAKS), t: new Float32Array(LEAKS), gap: new Float32Array(LEAKS) };
  let cursor = 0, rng = 12345, leakNext = 0;
  const rnd = () => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return rng / 4294967296; };
  /** `collected` this step (droplets that went into the jar), and the spots (x, y pairs) for the sparkle. */
  const events = { collected: 0, xy: new Float32Array(MAX_DROPS * 2), n: 0 };
  return {
    data: d,
    events,
    /** A body at (x, y) leaks `n` droplets, one every `secs / n` s (the first one at once). */
    leak(x, y, n, secs = 2.4) {
      let i = leakNext; // all busy: the oldest-started slot is reused
      for (let j = 0; j < LEAKS; j++) if (!lk.left[j]) { i = j; break; }
      leakNext = (i + 1) % LEAKS;
      lk.x[i] = x; lk.y[i] = y; lk.left[i] = Math.max(1, n | 0); lk.t[i] = 0; lk.gap[i] = secs / Math.max(1, n);
    },
    /** Droplets still to leak out of bodies. */
    leaks() { let k = 0; for (let j = 0; j < LEAKS; j++) k += lk.left[j]; return k; },
    /** Put `n` droplets at (x, y) with a gentle drift (`pop` 1 = a burst outwards, 0 = a slow ooze). The oldest droplet is reused when the pool is full. */
    spawn(x, y, n, pop = 1) {
      for (let k = 0; k < n; k++) {
        let i = -1;
        for (let j = 0; j < MAX_DROPS; j++) { const c = (cursor + j) % MAX_DROPS; if (!d.alive[c]) { i = c; break; } }
        if (i < 0) i = cursor;
        cursor = (i + 1) % MAX_DROPS;
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, sp = pop * (1.6 + rnd() * 1.6) + (1 - pop) * (0.25 + rnd() * 0.35);
        if (!d.alive[i]) d.live++;
        d.alive[i] = 1; d.x[i] = x + (rnd() - 0.5) * 0.2; d.y[i] = y + (rnd() - 0.5) * 0.2;
        d.vx[i] = Math.cos(a) * sp; d.vy[i] = Math.sin(a) * sp; d.age[i] = 0; d.ph[i] = rnd() * 6.283;
      }
    },
    /**
     * One fixed step. `room` = droplets the jar can still take (0: a full jar neither pulls nor takes any). Only an octopus with the
     * Siphon Shell (octo.siphonR > 0) pulls droplets in within that reach and drinks them; for anyone else they just dissolve.
     */
    update(dt, octo, world, room) {
      events.collected = 0; events.n = 0;
      for (let j = 0; j < LEAKS; j++) {
        if (!lk.left[j]) continue;
        lk.t[j] -= dt;
        if (lk.t[j] <= 0) { this.spawn(lk.x[j], lk.y[j] - 0.1, 1, 0); lk.left[j]--; lk.t[j] = lk.gap[j]; }
      }
      if (!d.live) return;
      const mR = octo.siphonR || 0, reach = mR > 0 ? octo.radius + JUICE.collectR : -1;
      for (let i = 0; i < MAX_DROPS; i++) {
        if (!d.alive[i]) continue;
        d.age[i] += dt;
        if (d.age[i] >= JUICE.life) { d.alive[i] = 0; d.live--; continue; } // dissolved into the water
        const dx = octo.x - d.x[i], dy = octo.y - d.y[i], dist = Math.hypot(dx, dy);
        const ready = d.age[i] >= JUICE.pickupDelay && !octo.dead && room - events.collected > 0;
        if (ready && dist < reach) {
          d.alive[i] = 0; d.live--;
          if (events.n < MAX_DROPS) { events.xy[events.n * 2] = d.x[i]; events.xy[events.n * 2 + 1] = d.y[i]; events.n++; }
          events.collected++;
          continue;
        }
        if (ready && dist < mR && dist > 1e-4) {
          // pulled in: faster the closer it is
          const k = JUICE.pullSpeed * (0.45 + 0.55 * (1 - dist / mR));
          const blend = Math.min(1, dt * 9);
          d.vx[i] += ((dx / dist) * k - d.vx[i]) * blend;
          d.vy[i] += ((dy / dist) * k - d.vy[i]) * blend;
        } else {
          const f = Math.exp(-DROP_DRAG * dt);
          d.vx[i] *= f; d.vy[i] = Math.min(DROP_BOB, d.vy[i] * f + DROP_SINK * dt);
        }
        const nx = d.x[i] + d.vx[i] * dt, ny = d.y[i] + d.vy[i] * dt;
        if (!world.isSolid(nx, ny)) { d.x[i] = nx; d.y[i] = ny; }
        else if (!world.isSolid(nx, d.y[i])) { d.x[i] = nx; d.vy[i] = 0; }
        else if (!world.isSolid(d.x[i], ny)) { d.y[i] = ny; d.vx[i] = 0; }
        else { d.vx[i] = 0; d.vy[i] = 0; }
      }
    },
    count() { return d.live; },
  };
}

// ------------------------------------------------------------------------------------------ ink clouds
export const MAX_CLOUDS = 4;
const CLOUD_GROW = 0.25;  // s, the puff swells to full size
const CLOUD_THIN = 0.6;   // s, the last part of its life it thins out (and stops hiding)

/** The ink clouds of one level: puffed by Ink Cloud, they drift a little, fade over their duration and hide the octopus. */
export function createInkClouds() {
  const c = {
    n: MAX_CLOUDS, live: 0,
    x: new Float32Array(MAX_CLOUDS), y: new Float32Array(MAX_CLOUDS), vx: new Float32Array(MAX_CLOUDS), vy: new Float32Array(MAX_CLOUDS),
    age: new Float32Array(MAX_CLOUDS), dur: new Float32Array(MAX_CLOUDS), r: new Float32Array(MAX_CLOUDS), seed: new Float32Array(MAX_CLOUDS),
    alive: new Uint8Array(MAX_CLOUDS),
  };
  let count = 0;
  /** The radius that hides right now (0 when gone or thinned out). */
  function hideR(i) {
    if (!c.alive[i]) return 0;
    const a = c.age[i], left = c.dur[i] - a;
    if (left <= CLOUD_THIN * 0.5) return 0;
    return c.r[i] * Math.min(1, 0.55 + 0.45 * a / CLOUD_GROW);
  }
  return {
    data: c,
    /** Puff a cloud at (x, y); `vx, vy` (the caster's velocity) nudges its drift. Returns the slot. */
    puff(x, y, vx, vy, spell) {
      let i = -1, oldest = -1, oldAge = -1;
      for (let j = 0; j < MAX_CLOUDS; j++) { if (!c.alive[j]) { i = j; break; } if (c.age[j] > oldAge) { oldAge = c.age[j]; oldest = j; } }
      if (i < 0) i = oldest; else c.live++;
      const drift = spell.drift || 0;
      const sp = Math.hypot(vx, vy), k = sp > 1e-3 ? Math.min(1, sp / 6) * drift / sp : 0;
      c.alive[i] = 1; c.x[i] = x; c.y[i] = y; c.vx[i] = vx * k; c.vy[i] = vy * k - drift * 0.5;
      c.age[i] = 0; c.dur[i] = spell.duration; c.r[i] = spell.radius; c.seed[i] = (count++ * 2.39996) % 6.283;
      return i;
    },
    update(dt) {
      if (!c.live) return;
      for (let i = 0; i < MAX_CLOUDS; i++) {
        if (!c.alive[i]) continue;
        c.age[i] += dt;
        if (c.age[i] >= c.dur[i]) { c.alive[i] = 0; c.live--; continue; }
        c.x[i] += c.vx[i] * dt; c.y[i] += c.vy[i] * dt;
        const f = Math.exp(-0.35 * dt); c.vx[i] *= f; c.vy[i] *= f;
      }
    },
    /** Whether (px, py) is inside a cloud. */
    inside(px, py) {
      if (!c.live) return false;
      for (let i = 0; i < MAX_CLOUDS; i++) { const r = hideR(i); if (r > 0 && Math.hypot(px - c.x[i], py - c.y[i]) < r) return true; }
      return false;
    },
    /**
     * Whether a creature at (ex, ey) has lost the octopus at (ox, oy): the octopus is inside a cloud, or the line between
     * them passes through one (the creature itself in a cloud included).
     */
    hides(ex, ey, ox, oy) {
      if (!c.live) return false;
      const sx = ox - ex, sy = oy - ey, l2 = sx * sx + sy * sy;
      for (let i = 0; i < MAX_CLOUDS; i++) {
        const r = hideR(i);
        if (r <= 0) continue;
        let t = l2 > 1e-9 ? ((c.x[i] - ex) * sx + (c.y[i] - ey) * sy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ex + sx * t - c.x[i], qy = ey + sy * t - c.y[i];
        if (qx * qx + qy * qy < r * r) return true;
      }
      return false;
    },
    count() { return c.live; },
  };
}
