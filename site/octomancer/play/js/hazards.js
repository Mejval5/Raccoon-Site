// Level hazards (v2, behind ?v2=1): current jet, spike wall, falling rock, electric eel, anemone cluster.
// They come from the pattern matcher (patterns.js + data/patterns.json): level-spawns.js turns a hit into a
// `{type:'hazard', hk, x, y, dx, dy, ...}` record with makeHazardRecord(), and createHazards() runs the
// records the world's chunk carries. Data-oriented: one flat typed array per field, no per-hazard objects.
//
// A*: hazardBlockers(rec) lists the circles a hazard keeps the octopus out of. level-spawns.js hands them to
// pathcheck.js (finalPathOk) and drops hazards until the exit (and shop) is reachable again, so no hazard can
// make a level unsolvable. Jets and eels do not block: a jet only pushes, an eel's ring can be timed.

import { hurtOctopus } from './octopus.js';
import { hasLineOfSight } from './pathfind.js';
import { PK_ROCK, PS_FREE, PS_HELD } from './props.js';

export const HZ_NONE = 0, HZ_JET = 1, HZ_SPIKES = 2, HZ_ROCK = 3, HZ_EEL = 4, HZ_ANEMONE = 5;
export const HAZARD_NAMES = ['', 'jet', 'spikes', 'rock', 'eel', 'anemone'];
export const HZ_CAUSE = ['', 'jet', 'spikes', 'rock', 'eel', 'anemone'];
export const HAZARD_CODE = { jet: HZ_JET, spikes: HZ_SPIKES, rock: HZ_ROCK, eel: HZ_EEL, anemone: HZ_ANEMONE };

// tuning
export const JET_ACC = 17;          // u/s^2 along the stream at the mouth (fades to about half at the far end)
export const JET_HALF_WIDTH = 1.1;  // stream half width
export const JET_MAX_LEN = 7;
export const SPIKE_HALF_LEN = 1.5;  // a spike strip covers 3 tiles
export const SPIKE_REACH = 0.55;    // how far the spikes stand off the face
export const ROCK_SHAKE = 0.45;     // s of rumble before it drops
export const ROCK_GRAVITY = 16;
export const ROCK_MAX_FALL = 11;
export const ROCK_RADIUS = 0.5;
export const ROCK_TRIGGER_HALF = 1.0; // the octopus is "under it" within this sideways distance
export const EEL_SPEED = 1.5;
export const EEL_PERIOD = 3.6;      // s between shocks
export const EEL_CHARGE_AT = 1.4;   // the body crackles from here (0.5 s)...
export const EEL_FIRE_AT = 1.9;     // ...until the ring is released
export const EEL_RING_SPEED = 6;
export const EEL_RING_MAX = 3.0;
export const EEL_HALF_BODY = 0.6;
export const ANEMONE_R = 0.5;

const CAP = 48;

/** Stable journal id for a hazard code ('hazard-jet'). */
export function hazardJournalId(code) { return 'hazard-' + HAZARD_NAMES[code]; }

// ---------------------------------------------------------------- records

/**
 * Build the spawn record for a pattern hit, or null when the surroundings do not fit this hazard (a jet with
 * no room for its stream, a rock with too short a drop, an eel with no shaft to patrol).
 * (x, y) is the anchor cell centre; (dx, dy) the facing away from the surface.
 */
export function makeHazardRecord(name, x, y, dx, dy, tiles, w, h) {
  const water = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && tiles[ty * w + tx] === 0;
  const cx = Math.floor(x), cy = Math.floor(y);
  const code = HAZARD_CODE[name];
  if (!code) return null;
  if (code === HZ_JET) {
    let L = 0;
    while (L < JET_MAX_LEN && water(cx + dx * L, cy + dy * L)) L++;
    if (L < 4) return null;
    return { type: 'hazard', hk: code, x: x - dx * 0.5, y: y - dy * 0.5, dx, dy, len: L }; // x, y = the mouth on the wall face
  }
  if (code === HZ_SPIKES) return { type: 'hazard', hk: code, x, y, dx, dy, len: 3 };
  if (code === HZ_ROCK) {
    let ly = cy;
    while (water(cx, ly + 1)) ly++;
    if (ly - cy < 3) return null;
    return { type: 'hazard', hk: code, x, y, dx: 0, dy: 1, len: 1, landY: ly + 0.5 };
  }
  if (code === HZ_EEL) {
    const open = (ty) => water(cx - 1, ty) && water(cx, ty) && water(cx + 1, ty);
    let top = cy, bot = cy;
    while (cy - top < 6 && open(top - 1)) top--;
    while (bot - cy < 6 && open(bot + 1)) bot++;
    const y0 = top + 0.5 + EEL_HALF_BODY, y1 = bot + 0.5 - EEL_HALF_BODY;
    if (y1 - y0 < 1.5) return null;
    return { type: 'hazard', hk: code, x, y: Math.min(y1, Math.max(y0, y)), dx: 0, dy: 0, len: 1, y0, y1 };
  }
  return { type: 'hazard', hk: code, x, y, dx: 0, dy: -1, len: 1 }; // anemone
}

/** Circles {x,y,r} the octopus must keep out of for the A* check (blocking hazards only). */
export function hazardBlockers(rec, out = []) {
  if (rec.hk === HZ_SPIKES) {
    const tx = -rec.dy, ty = rec.dx;
    for (let i = -1; i <= 1; i++) out.push({ x: rec.x + tx * i - rec.dx * 0.15, y: rec.y + ty * i - rec.dy * 0.15, r: 0.35 });
  } else if (rec.hk === HZ_ROCK) {
    out.push({ x: rec.x, y: rec.y, r: 0.5 }, { x: rec.x, y: rec.landY, r: 0.55 });
  } else if (rec.hk === HZ_ANEMONE) {
    out.push({ x: rec.x, y: rec.y + 0.05, r: 0.55 });
  }
  return out;
}

// ---------------------------------------------------------------- runtime

/**
 * @param {ReturnType<import('./props.js').createProps>|null} props v2: a falling rock is a rigid body (props.js)
 *   hanging from its ceiling tile; it drops when the octopus passes under it OR when that tile is bombed away,
 *   sinks fast, bounces a little and turns into rock where it comes to rest. Null keeps the old scripted fall.
 */
export function createHazards(props = null) {
  const d = {
    n: 0,
    kind: new Uint8Array(CAP), state: new Uint8Array(CAP),
    x: new Float32Array(CAP), y: new Float32Array(CAP), dx: new Float32Array(CAP), dy: new Float32Array(CAP), len: new Float32Array(CAP),
    a: new Float32Array(CAP), b: new Float32Array(CAP), // rock: landing y; eel: patrol range y0..y1
    t: new Float32Array(CAP), v: new Float32Array(CAP), r: new Float32Array(CAP), // timer, velocity (rock fall, eel direction), eel ring radius
    x0: new Float32Array(CAP), y0: new Float32Array(CAP), // rest position (rock)
    pid: new Int32Array(CAP).fill(-1), // prop index (rock, v2)
    hit: new Uint8Array(CAP), // rock: it has already hurt the octopus this drop (one hit per rock)
    pool: new Uint8Array(CAP), // jet: one of the Challenge Pool's vents (its push is scaled by poolGain, weak until a wager runs)
  };
  let poolGain = 1;
  const events = []; // {type:'rockLanded'|'rockFall'|'shock'|'hazardHurt', ...}, consumed by main.js each frame
  const loaded = new Set();

  function add(rec) {
    if (d.n >= CAP) return -1;
    const i = d.n++;
    d.kind[i] = rec.hk; d.state[i] = 0;
    d.x[i] = rec.x; d.y[i] = rec.y; d.dx[i] = rec.dx || 0; d.dy[i] = rec.dy || 0; d.len[i] = rec.len || 1;
    d.a[i] = rec.landY !== undefined ? rec.landY : rec.y0 !== undefined ? rec.y0 : 0;
    d.b[i] = rec.y1 !== undefined ? rec.y1 : 0;
    d.t[i] = rec.hk === HZ_EEL ? (i * 0.7) % EEL_PERIOD : 0;
    d.v[i] = rec.hk === HZ_EEL ? (i % 2 ? 1 : -1) * EEL_SPEED : 0;
    d.r[i] = 0; d.x0[i] = rec.x; d.y0[i] = rec.y;
    d.pid[i] = -1; d.hit[i] = 0; d.pool[i] = rec.set === 'pool' ? 1 : 0;
    if (props && rec.hk === HZ_ROCK) {
      const pid = props.add(PK_ROCK, rec.x, rec.y, 0, 0, { radius: ROCK_RADIUS, ref: i });
      if (pid >= 0) { d.pid[i] = pid; props.hold(pid, Math.floor(rec.x), Math.floor(rec.y) - 1); } // hangs from the tile above
    }
    return i;
  }

  function hurt(octo, i, fx, fy) {
    if (hurtOctopus(octo, fx, fy, HZ_CAUSE[d.kind[i]])) { events.push({ type: 'hazardHurt', kind: d.kind[i], x: fx, y: fy }); return true; }
    return false;
  }
  /** A falling rock knocks the octopus sideways, out from under it, never along its own fall line (it used to ride
   * the rock down and get hit again as it settled). The side with open water wins; else away from the rock. */
  function hurtByRock(octo, i, world) {
    if (d.hit[i]) return;
    const rx = d.x[i];
    let side = octo.x >= rx ? 1 : -1;
    if (Math.abs(octo.x - rx) < 0.25 && world && world.isSolid) {
      const l = world.isSolid(octo.x - 1, octo.y), r = world.isSolid(octo.x + 1, octo.y);
      if (l && !r) side = 1; else if (r && !l) side = -1;
    }
    if (hurt(octo, i, octo.x - side, octo.y)) d.hit[i] = 1;
  }

  function updateJet(i, dt, octo) {
    const dx = d.dx[i], dy = d.dy[i];
    const rx = octo.x - d.x[i], ry = octo.y - d.y[i];
    const s = rx * dx + ry * dy, l = -rx * dy + ry * dx;
    if (s < 0 || s > d.len[i] || Math.abs(l) > JET_HALF_WIDTH) return;
    const f = JET_ACC * (d.pool[i] ? poolGain : 1) * (1 - 0.5 * s / d.len[i]);
    octo.vx += dx * f * dt;
    octo.vy += dy * f * dt;
  }

  function updateSpikes(i, octo) {
    const dx = d.dx[i], dy = d.dy[i], tx = -dy, ty = dx;
    const fx = d.x[i] - dx * 0.5, fy = d.y[i] - dy * 0.5; // centre of the face
    const rx = octo.x - fx, ry = octo.y - fy;
    const n = rx * dx + ry * dy, tt = rx * tx + ry * ty;
    if (n > SPIKE_REACH + octo.radius * 0.85 || n < -0.2 || Math.abs(tt) > SPIKE_HALF_LEN + octo.radius * 0.3) return;
    const c = Math.max(-SPIKE_HALF_LEN, Math.min(SPIKE_HALF_LEN, tt));
    hurt(octo, i, fx + tx * c, fy + ty * c);
  }

  function updateRockProp(i, dt, octo, world) {
    const pid = d.pid[i], pd = props.data, st = d.state[i];
    if (st === 0 || st === 1) {
      if (pd.state[pid] !== PS_HELD) { // its ceiling was bombed away: it comes loose now, no warning
        d.state[i] = 2; pd.state[pid] = PS_FREE;
        events.push({ type: 'rockFall', x: d.x[i], y: d.y[i] });
        return;
      }
      if (st === 1) {
        d.t[i] -= dt;
        if (d.t[i] <= 0) { d.state[i] = 2; props.release(pid); pd.vy[pid] = 0.5; }
        return;
      }
      if (octo.dead) return;
      const x = d.x[i], y = d.y[i];
      if (Math.abs(octo.x - x) >= ROCK_TRIGGER_HALF || octo.y <= y + 0.8 || octo.y >= d.a[i] + 1.5) return;
      const tx = Math.floor(x);
      for (let ty = Math.floor(y) + 1; ty <= Math.floor(octo.y); ty++) if (world.tileAt(tx, ty) !== 0) return; // not in line
      d.state[i] = 1; d.t[i] = ROCK_SHAKE;
      events.push({ type: 'rockFall', x, y });
      return;
    }
    if (st !== 2 && st !== 4) return;
    d.x[i] = pd.x[pid]; d.y[i] = pd.y[pid];
    const sp = Math.hypot(pd.vx[pid], pd.vy[pid]);
    if (st === 2 && !octo.dead && sp > 1.5 && Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < ROCK_RADIUS + octo.radius * 0.85) hurtByRock(octo, i, world);
    const landed = (pd.grounded[pid] && sp < 1.5) || pd.state[pid] !== PS_FREE;
    if (!landed) return;
    // never settle on top of the octopus: wait (state 4) until it swims clear
    if (!octo.dead && Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < ROCK_RADIUS + octo.radius + 0.1) { d.state[i] = 4; return; }
    d.state[i] = 3;
    const tx = Math.floor(d.x[i]), ty = Math.floor(d.y[i]);
    props.remove(pid); d.pid[i] = -1;
    if (world.placeRock && world.tileAt(tx, ty) === 0) world.placeRock(tx, ty); // becomes breakable rock where it lands
    events.push({ type: 'rockLanded', x: d.x[i], y: d.y[i] });
  }

  function updateRock(i, dt, octo, world) {
    if (props && d.pid[i] >= 0) { updateRockProp(i, dt, octo, world); return; }
    const st = d.state[i];
    if (st === 0) {
      if (octo.dead) return;
      const x = d.x[i], y = d.y[i];
      if (Math.abs(octo.x - x) >= ROCK_TRIGGER_HALF || octo.y <= y + 0.8 || octo.y >= d.a[i] + 1.5) return;
      const tx = Math.floor(x);
      for (let ty = Math.floor(y) + 1; ty <= Math.floor(octo.y); ty++) if (world.tileAt(tx, ty) !== 0) return; // not in line
      d.state[i] = 1; d.t[i] = ROCK_SHAKE;
      events.push({ type: 'rockFall', x, y });
    } else if (st === 1) {
      d.t[i] -= dt;
      if (d.t[i] <= 0) { d.state[i] = 2; d.v[i] = 0; }
    } else if (st === 2 || st === 4) {
      if (st === 2) {
        d.v[i] = Math.min(ROCK_MAX_FALL, d.v[i] + ROCK_GRAVITY * dt);
        d.y[i] = Math.min(d.a[i], d.y[i] + d.v[i] * dt);
        if (!octo.dead && Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < ROCK_RADIUS + octo.radius * 0.85) hurtByRock(octo, i, world);
      }
      if (d.y[i] >= d.a[i]) {
        // never settle on top of the octopus: wait (state 4) until it swims clear
        if (!octo.dead && Math.hypot(d.x[i] - octo.x, d.a[i] - octo.y) < ROCK_RADIUS + octo.radius + 0.1) { d.state[i] = 4; d.y[i] = d.a[i]; return; }
        d.state[i] = 3; d.y[i] = d.a[i];
        const tx = Math.floor(d.x[i]), ty = Math.floor(d.a[i]);
        if (world.placeRock && world.tileAt(tx, ty) === 0) world.placeRock(tx, ty); // becomes breakable rock where it lands
        events.push({ type: 'rockLanded', x: d.x[i], y: d.a[i] });
      }
    }
  }

  function updateEel(i, dt, octo, world) {
    // patrol the shaft
    const y0 = d.a[i], y1 = d.b[i];
    d.y[i] += d.v[i] * dt;
    if (d.y[i] < y0) { d.y[i] = y0; d.v[i] = Math.abs(d.v[i]); } else if (d.y[i] > y1) { d.y[i] = y1; d.v[i] = -Math.abs(d.v[i]); }
    // shock cycle: idle, charge (glow), release a ring that grows and fades
    const prev = d.t[i];
    d.t[i] = (prev + dt) % EEL_PERIOD;
    const c = d.t[i];
    d.state[i] = c >= EEL_CHARGE_AT && c < EEL_FIRE_AT ? 1 : 0;
    if (prev < EEL_FIRE_AT && c >= EEL_FIRE_AT) { d.r[i] = 0.3; events.push({ type: 'shock', x: d.x[i], y: d.y[i] }); }
    if (d.r[i] > 0) {
      d.r[i] += EEL_RING_SPEED * dt;
      if (d.r[i] > EEL_RING_MAX) d.r[i] = 0;
    }
    if (octo.dead) return;
    const ex = d.x[i], ey = d.y[i];
    const dist = Math.hypot(octo.x - ex, octo.y - ey);
    if (d.r[i] > 0 && Math.abs(dist - d.r[i]) < 0.3 + octo.radius * 0.8 && hasLineOfSight((tx, ty) => world.isSolid(tx, ty), ex, ey, octo.x, octo.y)) hurt(octo, i, ex, ey);
    // the body itself
    const py = Math.max(ey - EEL_HALF_BODY, Math.min(ey + EEL_HALF_BODY, octo.y));
    if (Math.hypot(octo.x - ex, octo.y - py) < 0.3 + octo.radius * 0.8) hurt(octo, i, ex, ey);
  }

  function updateAnemone(i, octo) {
    if (Math.hypot(octo.x - d.x[i], octo.y - (d.y[i] + 0.1)) < ANEMONE_R + octo.radius * 0.6) hurt(octo, i, d.x[i], d.y[i] + 0.3);
  }

  return {
    data: d,
    events,
    /** Add one record directly (tests, debug). Returns its index, or -1 when full. */
    add,
    count() { return d.n; },
    /** r40: the Challenge Pool's vents push with this fraction of a jet's force (weak while the pool is idle, full during a wager). */
    setPoolGain(g) { poolGain = g; },
    /** One fixed step (after the octopus moved). Picks up the hazard records of every resident chunk once. */
    update(dt, time, octo, world, resident) {
      events.length = 0;
      if (resident) {
        for (const { index, chunk } of resident) {
          if (loaded.has(index)) continue;
          loaded.add(index);
          for (const s of chunk.spawns) if (s.type === 'hazard') add(s);
        }
      }
      for (let i = 0; i < d.n; i++) {
        switch (d.kind[i]) {
          case HZ_JET: if (!octo.dead) updateJet(i, dt, octo); break;
          case HZ_SPIKES: if (!octo.dead) updateSpikes(i, octo); break;
          case HZ_ROCK: updateRock(i, dt, octo, world); break;
          case HZ_EEL: updateEel(i, dt, octo, world); break;
          case HZ_ANEMONE: if (!octo.dead) updateAnemone(i, octo); break;
          default: break;
        }
      }
    },
    /** A blast at (x, y): hanging rocks within `reach` (main.js passes the blast's knock reach, 2 radii: the shock, not only
     * their ceiling tile going) come loose. */
    blast(x, y, reach) {
      let n = 0;
      if (!props) return 0;
      for (let i = 0; i < d.n; i++) {
        if (d.kind[i] !== HZ_ROCK || d.pid[i] < 0 || d.state[i] > 1) continue;
        if (Math.hypot(d.x[i] - x, d.y[i] - y) > reach) continue;
        if (props.data.state[d.pid[i]] === PS_HELD) { props.release(d.pid[i]); n++; }
      }
      return n;
    },
    /** Hazard codes within `range` of (x,y) with a clear line (journal sightings). */
    seen(x, y, range, isSolid) {
      const out = [];
      for (let i = 0; i < d.n; i++) {
        if (Math.hypot(d.x[i] - x, d.y[i] - y) < range && hasLineOfSight(isSolid, x, y, d.x[i], d.y[i])) out.push(d.kind[i]);
      }
      return out;
    },
  };
}
