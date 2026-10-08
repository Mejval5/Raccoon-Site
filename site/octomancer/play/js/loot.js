// Loot and secrets (v2, behind ?v2=1): breakable clams and pots, hidden pockets inside rock, chests (some
// trapped) and a relic with a falling-rock chase. Placement comes from the pattern table (data/patterns.json,
// kind "loot"): level-spawns.js turns a hit into a `{type:'loot', lk, x, y, ...}` record with makeLootRecord(),
// and createLoot() runs the records the world's chunk carries. Data-oriented: one flat typed array per field.
//
// Rules
//   clam / pot   break when the octopus touches them at dash speed or a bomb goes off within the blast radius;
//                drop 1-3 shells.
//   pocket       a rock tile with a faint cue (hairline crack, glint) holding 2-3 shells or an item (bomb / heart);
//                it is revealed when a bomb breaks the tile.
//   chest        opens on touch, 4-6 shells; 30% are trapped: a spike burst (hurts close by, after a short rattle)
//                or a swarm of 3 piranhas. At most 3 per level (the pattern table caps it).
//   relic        on a pedestal in 1 in 3 levels, worth 25 shells; taking it starts a 10 s chase of falling rocks
//                (each one shows a dust warning at the ceiling, then drops).
// Nothing here blocks the octopus, so none of it can make a level unsolvable.

import { addBomb } from './octopus.js';
import { octoHit } from './damage.js';
import { hasLineOfSight } from './pathfind.js';
import { DASH_KILL_SPEED, HEART_MAX, BOMB_RADIUS } from './config.js';
import { ITEM_IDS, itemFromCode } from './items.js';
import { PK_POT, PK_CLAM, PK_CHEST, PK_RELIC, PK_ROCK, PS_FREE, PS_HELD, PS_CARRY, PROP_RADIUS } from './props.js';

const PROP_KIND = [0, PK_CLAM, PK_POT, PK_CHEST, 0, PK_RELIC]; // loot kind -> props.js kind (pockets are rock tiles)

export const LK_NONE = 0, LK_CLAM = 1, LK_POT = 2, LK_CHEST = 3, LK_POCKET = 4, LK_RELIC = 5;
export const LOOT_NAMES = ['', 'clam', 'pot', 'chest', 'pocket', 'relic'];
export const LOOT_CODE = { clam: LK_CLAM, pot: LK_POT, chest: LK_CHEST, pocket: LK_POCKET, relic: LK_RELIC };

export const TRAP_NONE = 0, TRAP_SPIKES = 1, TRAP_SWARM = 2;
export const POCKET_SHELLS = 0, POCKET_BOMB = 1, POCKET_HEART = 2, POCKET_ITEM = 3;

// states
export const ST_INTACT = 0, ST_DONE = 1, ST_RATTLE = 2, ST_BURST = 3;

// tuning
export const TRAP_CHANCE = 0.3;
export const RELIC_CHANCE = 1 / 3;
export const CHEST_ITEM_CHANCE = 0.3;   // a chest also holds a carried item (items.js)
export const POCKET_ITEM_CHANCE = 0.25;  // a hidden pocket holds a carried item instead of shells / a bomb / a heart
export const RELIC_SHELLS = 25;
export const CHASE_SECONDS = 10;
export const CHEST_SHELLS_MIN = 4, CHEST_SHELLS_MAX = 6;
export const SPIKE_RATTLE = 0.35;   // s between opening a spike-trapped chest and the burst
export const SPIKE_BURST_TIME = 0.5;
export const SPIKE_RADIUS = 1.5;    // tiles: the burst hurts inside this
export const SWARM_SIZE = 3;
export const CLAM_R = 0.42, POT_R = 0.38, CHEST_R = 0.6, RELIC_R = 0.6, ITEM_R = 0.55;
const ROCK_INTERVAL = 0.85;         // s between chase rocks
const ROCK_WARN = 0.55;             // s of dust at the ceiling before a rock drops
const ROCK_GRAV = 16, ROCK_MAXV = 11, ROCK_RADIUS = 0.45;
const CAP = 64, ROCK_CAP = 16, ITEM_CAP = 16;

/** Stable journal id for a loot code ('loot-clam'). */
export function lootJournalId(code) { return 'loot-' + LOOT_NAMES[code]; }

/**
 * Build the spawn record for a pattern hit. (x, y) is the anchor cell centre (for a pocket: the rock tile's
 * centre), (dx, dy) the facing away from the surface. `rng` decides drops, traps and pocket contents.
 * `relicOk` says whether this level has a relic. Null when the hit is not usable.
 */
export function makeLootRecord(name, x, y, dx, dy, rng, relicOk = true) {
  const lk = LOOT_CODE[name];
  if (!lk) return null;
  const rec = { type: 'loot', lk, x, y, dx, dy, n: 0, aux: 0, item: 0 };
  if (lk === LK_CLAM || lk === LK_POT) rec.n = 1 + Math.floor(rng() * 3);
  else if (lk === LK_CHEST) {
    rec.n = CHEST_SHELLS_MIN + Math.floor(rng() * (CHEST_SHELLS_MAX - CHEST_SHELLS_MIN + 1));
    if (rng() < TRAP_CHANCE) rec.aux = rng() < 0.5 ? TRAP_SPIKES : TRAP_SWARM;
    if (rng() < CHEST_ITEM_CHANCE) rec.item = 1 + Math.floor(rng() * ITEM_IDS.length);
  } else if (lk === LK_POCKET) {
    const r = rng();
    if (r < 0.6) { rec.aux = POCKET_SHELLS; rec.n = 2 + Math.floor(rng() * 2); }
    else rec.aux = r < 0.85 ? POCKET_BOMB : POCKET_HEART;
    if (rng() < POCKET_ITEM_CHANCE) { rec.aux = POCKET_ITEM; rec.n = 0; rec.item = 1 + Math.floor(rng() * ITEM_IDS.length); }
  } else if (lk === LK_RELIC) {
    if (!relicOk) return null;
    rec.n = RELIC_SHELLS;
  }
  return rec;
}

/**
 * Where n dropped shells start and how they pop: a small arc around (x, y), each with an upward-and-outward
 * velocity (vx, vy in u/s) so they scatter ~0.6 tile before they settle, and are not collected the same frame.
 * `isSolid(x, y)` (optional) keeps them out of rock: a spot in rock falls back to just above the break point.
 */
export function spreadShells(n, x, y, isSolid = null) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i - (n - 1) / 2;
    let px = x + side * 0.3, py = y - 0.15 - (i % 2) * 0.12;
    if (isSolid && isSolid(px, py)) { px = x; py = y - 0.3; }
    if (isSolid && isSolid(px, py)) { px = x; py = y; }
    out.push({ x: px, y: py, vx: side * 1.5 + (i % 2 ? 0.3 : -0.3) * (n === 1 ? 2 : 1), vy: -2.3 - (i % 2) * 0.7 });
  }
  return out;
}

/**
 * Spots in clear water above a chest for its swarm: each spot has the sprite's whole length (about +-1.2 tiles)
 * in open water, the spots are at least 0.9 tile apart vertically (or 1.4 sideways) and as close to the chest as
 * possible. Passes relax the half length (1.2, 0.8, 0.4) when the chest sits in a narrow dip; whatever is left
 * over goes straight above the chest. Returns [{x, y}] (n of them).
 */
export function findSwarmSpots(isSolid, x, y, n) {
  const out = [];
  const clearRow = (cx, cy, half) => {
    for (let dx = -half; dx <= half + 1e-6; dx += 0.4) if (isSolid(cx + dx, cy) || isSolid(cx + dx, cy - 0.4) || isSolid(cx + dx, cy + 0.4)) return false;
    return true;
  };
  const apart = (cx, cy) => { for (const p of out) if (Math.abs(p.y - cy) < 0.9 && Math.abs(p.x - cx) < 1.4) return false; return true; };
  for (const half of [1.2, 0.8, 0.4]) {
    for (let up = 1.5; up <= 7 && out.length < n; up += 0.45) {
      for (const off of [0, -0.7, 0.7, -1.4, 1.4]) {
        if (out.length >= n) break;
        const cx = x + off, cy = y - up;
        if (clearRow(cx, cy, half) && apart(cx, cy)) out.push({ x: cx, y: cy });
      }
    }
    if (out.length >= n) break;
  }
  for (let k = out.length; k < n; k++) out.push({ x, y: y - 1.2 - 0.9 * k });
  return out;
}

/**
 * @param {ReturnType<import('./props.js').createProps>|null} props v2: clams, pots, chests, the relic and the chase
 *   rocks are rigid bodies in the props system (sink, settle, roll, get pushed by blasts). They start attached to the
 *   rock they sit on and let go when it is bombed away. Null keeps the old static behaviour (tests, endless).
 */
export function createLoot(props = null) {
  const d = {
    n: 0,
    kind: new Uint8Array(CAP), state: new Uint8Array(CAP),
    x: new Float32Array(CAP), y: new Float32Array(CAP), dx: new Float32Array(CAP), dy: new Float32Array(CAP),
    count: new Uint8Array(CAP), aux: new Uint8Array(CAP), item: new Uint8Array(CAP), t: new Float32Array(CAP),
    pid: new Int32Array(CAP).fill(-1), chk: new Uint8Array(CAP), // prop index (props.js), support not yet checked
    // items out of hidden pockets (bomb / heart)
    ni: 0, ikind: new Uint8Array(ITEM_CAP), iid: new Uint8Array(ITEM_CAP), ix: new Float32Array(ITEM_CAP), iy: new Float32Array(ITEM_CAP), itaken: new Uint8Array(ITEM_CAP),
    // chase rocks
    nr: 0, rstate: new Uint8Array(ROCK_CAP), rx: new Float32Array(ROCK_CAP), ry: new Float32Array(ROCK_CAP),
    rt: new Float32Array(ROCK_CAP), rv: new Float32Array(ROCK_CAP), rpid: new Int32Array(ROCK_CAP).fill(-1),
    chase: 0, chaseSpawn: 0, rockSeq: 0,
  };
  const events = [];
  const loaded = new Set();

  function add(rec) {
    if (d.n >= CAP) return -1;
    const i = d.n++;
    d.kind[i] = rec.lk; d.state[i] = ST_INTACT;
    d.x[i] = rec.x; d.y[i] = rec.y; d.dx[i] = rec.dx || 0; d.dy[i] = rec.dy || 0;
    d.count[i] = rec.n || 0; d.aux[i] = rec.aux || 0; d.item[i] = rec.item || 0; d.t[i] = 0;
    d.pid[i] = -1; d.chk[i] = 0;
    if (props && PROP_KIND[rec.lk]) {
      const k = PROP_KIND[rec.lk];
      const pid = props.add(k, rec.x, rec.y, 0, 0, { radius: PROP_RADIUS[k], ref: i });
      if (pid >= 0) {
        d.pid[i] = pid; d.chk[i] = 1;
        // attached to the rock it sits on (the cell behind it); a record with no facing sits on the floor
        const fx = rec.dx || 0, fy = rec.dx || rec.dy ? rec.dy || 0 : -1;
        props.hold(pid, Math.floor(rec.x) - fx, Math.floor(rec.y) - fy);
      }
    }
    return i;
  }

  function dropProp(i) { if (props && d.pid[i] >= 0) { props.remove(d.pid[i]); d.pid[i] = -1; } }

  function breakObject(i, how) {
    d.state[i] = ST_DONE;
    if (d.kind[i] === LK_CLAM || d.kind[i] === LK_POT) dropProp(i);
    events.push({ type: 'break', lk: d.kind[i], x: d.x[i], y: d.y[i], shells: d.count[i], how });
  }

  function addItem(kind, x, y, id = 0) {
    if (d.ni >= ITEM_CAP) return;
    const i = d.ni++;
    d.ikind[i] = kind; d.iid[i] = id; d.ix[i] = x; d.iy[i] = y; d.itaken[i] = 0;
  }

  function startChase(seconds = CHASE_SECONDS) {
    d.chase = seconds; d.chaseSpawn = 0.5; d.rockSeq = 0;
    events.push({ type: 'chaseStart', seconds });
  }

  function hashf(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

  /** Props are the truth for where clams, pots, chests and the relic are: copy it in (and stand a let-go prop upright). */
  function syncProps(world) {
    const pd = props.data;
    for (let i = 0; i < d.n; i++) {
      const pid = d.pid[i];
      if (pid < 0) continue;
      if (d.chk[i]) { // first look at the support: a record whose rock is already gone starts falling
        d.chk[i] = 0;
        if (pd.state[pid] === PS_HELD && world.tileAt(pd.sx[pid], pd.sy[pid]) === 0) props.release(pid);
      }
      d.x[i] = pd.x[pid]; d.y[i] = pd.y[pid];
      if (pd.state[pid] !== PS_HELD && (d.dx[i] !== 0 || d.dy[i] !== -1)) { d.dx[i] = 0; d.dy[i] = -1; }
    }
  }

  function updateChase(dt, octo, world) {
    if (d.chase > 0) {
      d.chase = Math.max(0, d.chase - dt);
      d.chaseSpawn -= dt;
      if (d.chaseSpawn <= 0 && !octo.dead) {
        d.chaseSpawn = ROCK_INTERVAL;
        // a rock over where the octopus is heading, dropped from the first ceiling above it
        const k = d.rockSeq++;
        const cx = octo.x + octo.vx * 0.5 + (hashf(k * 7 + 1) - 0.5) * 2.8;
        const tx = Math.floor(cx);
        let ty = Math.floor(octo.y), top = -1;
        for (let n = 0; n < 12 && ty >= 0; n++, ty--) if (world.tileAt(tx, ty) !== 0) { top = ty; break; }
        if (top >= 0 && d.nr < ROCK_CAP) {
          const i = d.nr++;
          d.rstate[i] = 1; d.rx[i] = tx + 0.5; d.ry[i] = top + 1.5; d.rt[i] = ROCK_WARN; d.rv[i] = 0; d.rpid[i] = -1;
        }
      }
      if (d.chase === 0) events.push({ type: 'chaseEnd' });
    }
    // rocks: warn (1), fall (2); removed when landed
    for (let i = 0; i < d.nr; i++) {
      if (d.rstate[i] === 1) {
        d.rt[i] -= dt;
        if (d.rt[i] <= 0) {
          d.rstate[i] = 2;
          if (props) { d.rpid[i] = props.add(PK_ROCK, d.rx[i], d.ry[i], 0, 0.5, { radius: ROCK_RADIUS }); d.rt[i] = 5; }
        }
      } else if (d.rstate[i] === 2 && props) {
        // a rigid body: sinks fast, may bounce and get shoved; lands when it rests on something
        const pid = d.rpid[i];
        if (pid < 0) { d.rstate[i] = 3; continue; }
        const pd = props.data;
        d.rx[i] = pd.x[pid]; d.ry[i] = pd.y[pid]; d.rt[i] -= dt;
        if (Math.hypot(d.rx[i] - octo.x, d.ry[i] - octo.y) < ROCK_RADIUS + octo.radius * 0.85 && Math.hypot(pd.vx[pid], pd.vy[pid]) > 1.5) {
          if (octoHit(octo, 'boulder', d.rx[i], d.ry[i], 'rock')) events.push({ type: 'hurt', x: d.rx[i], y: d.ry[i] });
        }
        if (dmg && Math.hypot(pd.vx[pid], pd.vy[pid]) > 1.5) dmg.circle('boulder', d.rx[i], d.ry[i], ROCK_RADIUS, true, 1.5); // her trap: every creature it lands on too
        if ((pd.grounded[pid] && Math.hypot(pd.vx[pid], pd.vy[pid]) < 1.5) || pd.state[pid] !== PS_FREE || d.rt[i] <= 0) {
          events.push({ type: 'rockLanded', x: d.rx[i], y: d.ry[i] + ROCK_RADIUS });
          props.remove(pid); d.rpid[i] = -1; d.rstate[i] = 3;
        }
      } else if (d.rstate[i] === 2) {
        d.rv[i] = Math.min(ROCK_MAXV, d.rv[i] + ROCK_GRAV * dt);
        d.ry[i] += d.rv[i] * dt;
        if (Math.hypot(d.rx[i] - octo.x, d.ry[i] - octo.y) < ROCK_RADIUS + octo.radius * 0.85) {
          if (octoHit(octo, 'boulder', d.rx[i], d.ry[i], 'rock')) events.push({ type: 'hurt', x: d.rx[i], y: d.ry[i] });
        }
        if (dmg) dmg.circle('boulder', d.rx[i], d.ry[i], ROCK_RADIUS, true, 1.5);
        if (world.tileAt(Math.floor(d.rx[i]), Math.floor(d.ry[i] + ROCK_RADIUS)) !== 0) {
          events.push({ type: 'rockLanded', x: d.rx[i], y: d.ry[i] + ROCK_RADIUS });
          d.rstate[i] = 3;
        }
      }
    }
    let w = 0;
    for (let i = 0; i < d.nr; i++) {
      if (d.rstate[i] === 3) continue;
      if (w !== i) { d.rstate[w] = d.rstate[i]; d.rx[w] = d.rx[i]; d.ry[w] = d.ry[i]; d.rt[w] = d.rt[i]; d.rv[w] = d.rv[i]; d.rpid[w] = d.rpid[i]; }
      w++;
    }
    d.nr = w;
  }

  let dmg = null; // 2026-10-08: the shared damage entry (damage.js): a trap's rock and spike burst hit every creature body too
  return {
    /** main.js: the shared damage entry (damage.js); null: the traps only reach the octopus. */
    setDamage(dm) { dmg = dm || null; },
    data: d,
    events,
    add,
    count() { return d.n; },
    chaseLeft() { return d.chase; },
    /** r39: the Challenge Pool's wager runs the relic's falling rocks for `seconds`; stopChase ends it (the wager was lost). */
    startChase(seconds) { startChase(seconds); },
    stopChase() { d.chase = 0; },
    /** Events since the last call (main.js reacts to them), cleared. */
    takeEvents() { return events.splice(0, events.length); },

    /** Break clam / pot record i (thrown into something, or it took a hit for the octopus: how = 'throw' | 'shield'). */
    smash(i, how = 'throw') { if (i >= 0 && i < d.n && d.state[i] === ST_INTACT && (d.kind[i] === LK_CLAM || d.kind[i] === LK_POT)) { if (props && d.pid[i] >= 0) { d.x[i] = props.data.x[d.pid[i]]; d.y[i] = props.data.y[d.pid[i]]; } breakObject(i, how); return true; } return false; },
    /** A bomb went off at (x, y): clams and pots in the blast break. (Pockets are rock tiles: bomb.js breaks them.) */
    explode(x, y, r = BOMB_RADIUS) {
      for (let i = 0; i < d.n; i++) {
        if (d.state[i] !== ST_INTACT || (d.kind[i] !== LK_CLAM && d.kind[i] !== LK_POT)) continue;
        if (Math.hypot(d.x[i] - x, d.y[i] - y) <= r) breakObject(i, 'bomb');
      }
    },

    /** One fixed step (after the octopus moved). Picks up the loot records of every resident chunk once. */
    update(dt, octo, world, resident) {
      if (resident) {
        for (const { index, chunk } of resident) {
          if (loaded.has(index)) continue;
          loaded.add(index);
          for (const s of chunk.spawns) if (s.type === 'loot') add(s);
        }
      }
      if (props) syncProps(world);
      const speed = Math.hypot(octo.vx, octo.vy);
      for (let i = 0; i < d.n; i++) {
        const k = d.kind[i], st = d.state[i];
        if (k === LK_POCKET) {
          if (st === ST_INTACT && world.tileAt(Math.floor(d.x[i]), Math.floor(d.y[i])) === 0) {
            d.state[i] = ST_DONE;
            if (d.aux[i] === POCKET_SHELLS) events.push({ type: 'pocket', x: d.x[i], y: d.y[i], shells: d.count[i], item: 0 });
            else { addItem(d.aux[i], d.x[i], d.y[i], d.item[i]); events.push({ type: 'pocket', x: d.x[i], y: d.y[i], shells: 0, item: d.aux[i] }); }
          }
          continue;
        }
        if (octo.dead) continue;
        const near = Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y);
        if (k === LK_CLAM || k === LK_POT) {
          const carried = props && d.pid[i] >= 0 && props.data.state[d.pid[i]] === PS_CARRY; // in the octopus's hand (hand.js): a dash does not break it
          if (st === ST_INTACT && !carried && near < (k === LK_CLAM ? CLAM_R : POT_R) + octo.radius * 0.85 && speed >= DASH_KILL_SPEED) breakObject(i, 'dash');
        } else if (k === LK_CHEST) {
          if (st === ST_INTACT && near < CHEST_R + octo.radius * 0.5) {
            d.state[i] = ST_DONE;
            events.push({ type: 'chest', x: d.x[i], y: d.y[i], shells: d.count[i], trap: d.aux[i], carry: itemFromCode(d.item[i]) });
            if (d.aux[i] === TRAP_SPIKES) { d.state[i] = ST_RATTLE; d.t[i] = SPIKE_RATTLE; }
            else if (d.aux[i] === TRAP_SWARM) events.push({ type: 'trap', trap: TRAP_SWARM, x: d.x[i], y: d.y[i] - 0.3, n: SWARM_SIZE });
          }
        } else if (k === LK_RELIC) {
          if (st === ST_INTACT && near < RELIC_R + octo.radius * 0.5) {
            d.state[i] = ST_DONE; dropProp(i);
            events.push({ type: 'relic', x: d.x[i], y: d.y[i], shells: d.count[i] });
            startChase();
          }
        }
      }
      // spike traps: rattle, then burst
      for (let i = 0; i < d.n; i++) {
        if (d.kind[i] !== LK_CHEST) continue;
        if (d.state[i] === ST_RATTLE) {
          d.t[i] -= dt;
          if (d.t[i] <= 0) {
            d.state[i] = ST_BURST; d.t[i] = SPIKE_BURST_TIME;
            events.push({ type: 'trap', trap: TRAP_SPIKES, x: d.x[i], y: d.y[i] });
            if (Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < SPIKE_RADIUS + octo.radius * 0.5) {
              if (octoHit(octo, 'trap', d.x[i], d.y[i], 'chest')) events.push({ type: 'hurt', x: d.x[i], y: d.y[i] });
            }
            if (dmg) dmg.circle('trap', d.x[i], d.y[i], SPIKE_RADIUS - 0.5, true); // the burst reaches every creature close by too (she opened it)
          }
        } else if (d.state[i] === ST_BURST) {
          d.t[i] -= dt;
          if (d.t[i] <= 0) d.state[i] = ST_DONE;
        }
      }
      // items from pockets
      for (let i = 0; i < d.ni; i++) {
        if (d.itaken[i] || octo.dead) continue;
        if (Math.hypot(d.ix[i] - octo.x, d.iy[i] - octo.y) >= ITEM_R + octo.radius * 0.6) continue;
        if (d.ikind[i] === POCKET_HEART) { if (octo.hearts >= (octo.heartMax || HEART_MAX)) continue; octo.hearts++; }
        else if (d.ikind[i] === POCKET_BOMB) addBomb(octo);
        d.itaken[i] = 1;
        events.push({ type: 'item', item: d.ikind[i], x: d.ix[i], y: d.iy[i], carry: d.ikind[i] === POCKET_ITEM ? itemFromCode(d.iid[i]) : '' });
      }
      updateChase(dt, octo, world);
    },

    /** Loot codes within `range` of (x,y) with a clear line, for journal sightings (pockets count once revealed). */
    seen(x, y, range, isSolid) {
      const out = [];
      for (let i = 0; i < d.n; i++) {
        if (d.kind[i] === LK_POCKET && d.state[i] === ST_INTACT) continue;
        if (Math.hypot(d.x[i] - x, d.y[i] - y) < range && hasLineOfSight(isSolid, x, y, d.x[i], d.y[i])) out.push(d.kind[i]);
      }
      return out;
    },
  };
}
