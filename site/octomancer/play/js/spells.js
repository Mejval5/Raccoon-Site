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

// ------------------------------------------------------------------------------------------ rune modifiers (SPELLS-PICK.md section 2)
/** Slot rules: maxMods, radiusClamp, durationClamp, castLock (s), maxPending (Delayed motes), phoneAim (tiles ahead). */
export const SLOT = Object.freeze({ ...json.slot });
/** The modifier rows (`kind: "mod"`): Heavy, Delayed, Lingering. They sit in a hotbar slot's id list after the spell. */
export const MODS = (json.mods || []).map((m) => Object.freeze({ ...m }));
const MOD_BY_ID = new Map(MODS.map((m) => [m.id, m]));
export function modById(id) { return MOD_BY_ID.get(id) || null; }
export function isMod(id) { return MOD_BY_ID.has(id); }
/** A rune row of either kind (a spell or a modifier), for the journal and the pedestals. */
export function runeRow(id) { return BY_ID.get(id) || MOD_BY_ID.get(id) || null; }
/** Whether modifier `modId` changes `spellId` (Heavy and Lingering are greyed on Anchor: it has no size and its time is its own). */
export function modApplies(spellId, modId) { const s = spellById(spellId); return !!s && !!modById(modId) && Array.isArray(s.uses) && s.uses.includes(modId); }

const clampTo = (v, r) => (v < r[0] ? r[0] : v > r[1] ? r[1] : v);
/**
 * Fold a slot's id list (one spell, then up to SLOT.maxMods modifiers) into the numbers a cast uses and its whole-cast price.
 * Returns { spell, mods (the ids that apply), greyed (the ids that do not), price (casts, a whole number, never below 1),
 * radius, length, cells, duration, power, delay, permanent } or null when the list holds no spell. Pure: tests read it as is.
 */
export function resolveSlot(ids) {
  const list = typeof ids === 'string' ? [ids] : ids || [];
  let spell = null;
  for (const id of list) { const s = spellById(id); if (s) { spell = s; break; } }
  if (!spell) return null;
  const mods = [], greyed = [];
  let rm = 1, dm = 1, pm = 1, delay = spell.delay || 0, price = spell.cost, lingering = false;
  for (const id of list) {
    const m = modById(id);
    if (!m) continue;
    if (mods.length >= SLOT.maxMods || !modApplies(spell.id, id)) { greyed.push(id); continue; }
    mods.push(id);
    rm *= m.radiusMul || 1; dm *= m.durationMul || 1; pm *= m.powerMul || 1;
    delay += m.delayAdd || 0; price += m.cost || 0;
    if (id === 'lingering') lingering = true;
  }
  rm = clampTo(rm, SLOT.radiusClamp); dm = clampTo(dm, SLOT.durationClamp);
  return {
    spell, mods, greyed,
    price: Math.max(1, Math.round(price)),
    radius: (spell.radius || 0) * rm,
    length: (spell.length || 0) * rm,
    cells: Math.max(1, Math.round((spell.cells || 1) * rm)),
    duration: (spell.duration || 0) * dm,
    power: (spell.power || 1) * pm,
    drift: spell.drift || 0,
    delay,
    permanent: lingering && spell.effect === 'coral', // Lingering Coral Wall lasts the level
  };
}
/** A slot's price in casts (0 when it holds no spell). */
export function slotPrice(ids) { const r = resolveSlot(ids); return r ? r.price : 0; }

export const CAST_OK = 1, CAST_EMPTY = 0, CAST_NONE = -1, CAST_BUSY = 2;
/**
 * What each spell `effect` does with the folded slot `p` (resolveSlot) at ctx's point. ctx = {clouds, fx, x, y, vx, vy, dirX, dirY}:
 * fx is the level's spell effects (spell-fx.js; absent in old tests, then only the cloud works). Returns true if it happened.
 */
export const EFFECTS = {
  cloud(p, ctx) { return ctx.clouds.puff(ctx.x, ctx.y, ctx.vx, ctx.vy, p) >= 0; },
  riptide(p, ctx) { return !!ctx.fx && ctx.fx.riptide(ctx.x, ctx.y, ctx.dirX, ctx.dirY, p); },
  coral(p, ctx) { return !!ctx.fx && ctx.fx.coral(ctx.x, ctx.y, p); },
  anchor(p, ctx) { return !!ctx.fx && ctx.fx.anchor(p); },
};
/**
 * Cast a hotbar slot (its id list, or one spell id) out of the run's jar: CAST_OK (paid and done), CAST_EMPTY (not enough juice:
 * the jar shakes), CAST_NONE (no such spell, or the effect could not happen: nothing is paid) or CAST_BUSY (the 0.4 s cast lock;
 * only when ctx.now is given). A slot with Delayed is paid now and goes off later (ctx.fx.defer).
 */
export function castSpell(run, ids, ctx) {
  const p = resolveSlot(ids);
  if (!p || !EFFECTS[p.spell.effect]) return CAST_NONE;
  if (ctx.now !== undefined && run.castLockUntil !== undefined && ctx.now < run.castLockUntil) return CAST_BUSY;
  const price = p.price * JUICE.perCast;
  if (run.juice < price) return CAST_EMPTY;
  const ok = p.delay > 0 && ctx.fx ? ctx.fx.defer(p, ctx) : EFFECTS[p.spell.effect](p, ctx);
  if (!ok) return CAST_NONE;
  run.juice -= price;
  if (ctx.now !== undefined) run.castLockUntil = ctx.now + SLOT.castLock;
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
    update(dt, octo, world, room, force = null) { // force(x, y): the current at a point (jets, Riptides) carries droplets too
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
        if (d.age[i] >= JUICE.life || world.isSolid(d.x[i], d.y[i])) { d.alive[i] = 0; d.live--; continue; } // dissolved into the water (or leaked into rock)
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
        if (force) { const fo = force(d.x[i], d.y[i]); if (fo) { d.vx[i] += fo.fx * 0.3 * dt; d.vy[i] += fo.fy * 0.3 * dt; } }
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
const CLOUD_CARRY = 0.15; // a jet or a Riptide carries a cloud at this fraction of its push (hazards.js JET_DRIFT, a free swimmer's)
const CLOUD_BLOWN = 0.35; // s a cloud a blast reached takes to thin away

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
    /**
     * One step. `force(x, y)` (optional) is the current at a point (hazards.js forceAt: jets and Riptides, u/s^2, or null): a
     * stream carries a cloud along at CLOUD_CARRY of its push (SPELLS-PICK: jets carry the cloud).
     */
    update(dt, force = null) {
      if (!c.live) return;
      for (let i = 0; i < MAX_CLOUDS; i++) {
        if (!c.alive[i]) continue;
        c.age[i] += dt;
        if (c.age[i] >= c.dur[i]) { c.alive[i] = 0; c.live--; continue; }
        if (force) { const f = force(c.x[i], c.y[i]); if (f) { c.vx[i] += f.fx * CLOUD_CARRY * dt; c.vy[i] += f.fy * CLOUD_CARRY * dt; } }
        c.x[i] += c.vx[i] * dt; c.y[i] += c.vy[i] * dt;
        const f = Math.exp(-0.35 * dt); c.vx[i] *= f; c.vy[i] *= f;
      }
    },
    /** A blast at (x, y) with radius R blows out every cloud it reaches (SPELLS-PICK: a blast inside a cloud clears it): it thins away in CLOUD_BLOWN s. Returns how many. */
    blast(x, y, R) {
      let n = 0;
      if (!c.live) return 0;
      for (let i = 0; i < MAX_CLOUDS; i++) {
        if (!c.alive[i] || Math.hypot(c.x[i] - x, c.y[i] - y) > R + c.r[i] * 0.5) continue;
        const end = c.age[i] + CLOUD_BLOWN;
        if (end < c.dur[i]) { c.dur[i] = end; n++; }
        // pushed outward a little as it goes
        const dx = c.x[i] - x, dy = c.y[i] - y, d = Math.hypot(dx, dy) || 1;
        c.vx[i] += dx / d * 3; c.vy[i] += dy / d * 3;
      }
      return n;
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
