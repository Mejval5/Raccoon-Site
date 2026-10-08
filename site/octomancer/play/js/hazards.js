// Level hazards (v2, behind ?v2=1): current jet, spike wall, falling rock, electric eel, anemone cluster.
// They come from the pattern matcher (patterns.js + data/patterns.json): level-spawns.js turns a hit into a
// `{type:'hazard', hk, x, y, dx, dy, ...}` record with makeHazardRecord(), and createHazards() runs the
// records the world's chunk carries. Data-oriented: one flat typed array per field, no per-hazard objects.
//
// A*: hazardBlockers(rec) lists the circles a hazard keeps the octopus out of. level-spawns.js hands them to
// pathcheck.js (finalPathOk) and drops hazards until the exit (and shop) is reachable again, so no hazard can
// make a level unsolvable. Jets and eels do not block: a jet only pushes, an eel's ring can be timed.

import { killOctopus, hitBody } from './octopus.js';
import { octoHit } from './damage.js';
import { IMPACT_SPEED, rowOf, PH_ANCHORED, PH_NONE } from './creature-rules.js';
import { hasLineOfSight } from './pathfind.js';
import { IMPALE_DEPTH } from './config.js';
import { PK_ROCK, PK_BOMB, PK_POT, PK_RELIC, PK_RUBBLE, PK_FIND, PS_FREE, PS_HELD } from './props.js';
import { inCameraView } from './cull.js';

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
export const ROCK_SMASH_SPEED = 4;  // u/s downward at which a falling rock smashes timber or bone under it
export const ROCK_TRIGGER_HALF = 1.0; // the octopus is "under it" within this sideways distance
export const ROCK_CRUSH_SPEED = 1.5;  // u/s: a falling boulder at least this fast crushes enemies and hurts NPCs and shopkeepers it touches
export const SPIKE_KILL_SPEED = IMPACT_SPEED; // u/s: a body this fast (a lunging piranha, a charging keeper), or one knocked out, hits the spikes (creature-rules.js); a calm patrol (crab 2, piranha 4 chase) does not
export const ROCK_HIT_COOL = 1.5;     // s: a falling boulder hits each body once per drop
export const JET_DRIFT = 0.15;        // a free-swimming enemy drifts along a stream at JET_ACC * this (u/s): its own AI still steers
export const EEL_SPEED = 1.5;
export const EEL_PERIOD = 3.6;      // s between shocks
export const EEL_CHARGE_AT = 1.4;   // the body crackles from here (0.5 s)...
export const EEL_FIRE_AT = 1.9;     // ...until the ring is released
export const EEL_RING_SPEED = 6;
export const EEL_RING_MAX = 3.0;
export const EEL_HALF_BODY = 0.6;
export const ANEMONE_R = 0.5;
export const EEL_STUN_S = 1.0;      // V2-PLAN 16: a shock (ring or body) leaves the octopus limp this long
export const SPLAT_MIN_SPEED = 2;   // u/s: a boulder must fall at least this fast to flatten the octopus
export const SPLAT_ABOVE = 0.25;    // tiles: and its centre must be this far above the octopus centre at contact (else it is a side brush)
export const SPLAT_HALF = 0.45;     // tiles: the octopus centre must be this close to the boulder's centre line
export const SPLAT_FULL = 0.96;     // tiles: the body's height before it is squashed (the sprite's world size)
export const SPLAT_THIN = 0.29;     // tiles: the pancake's height (SPLAT_FULL * octopus-draw's 0.3)
export const ROCK_IMPACT_SPEED = 3;  // u/s: a falling boulder that hits something this fast and stops short (its fall speed halves) makes an impact (chain.js: it sets off what it hit)
export const CHAIN_ROCK_SHAKE = 0.2;  // s: a boulder a chain shook loose rumbles this long before it drops (the octopus's own trigger: ROCK_SHAKE)
export const CHAIN_EEL_CHARGE = 0.12; // s: an eel a chain set off crackles this long before its ring goes out
export const JET_SURGE_T = 0.8;       // s: a jet a blast set off surges this long...
export const JET_SURGE_GAIN = 2.2;    // ...pushing up to (1 + this) times as hard (falling off over the surge)
export const PAIR_MIN_CLEAR = 5;    // jet + spikes: least clear rows in the stream, the room to dash sideways out of it
export const PAIR_MAX_CLEAR = 12;   // ...and the farthest a ceiling may be
export const SPIKE_COUNT = 6;       // spikes drawn along a strip (hazards-draw.js); the impaled body hangs between two of them
export const SPIKE_CORNER_INSET = 0.22; // tiles: where a strip ends at a convex rock corner, spikes stop this far short of it

const CAP = 48;
const RAD2DEG = 180 / Math.PI;
const span = { lo: 0, hi: 0 };
let spanWorld = null;
const spanSolid = (a, b) => spanWorld.isSolid(a + 0.5, b + 0.5);
const jetOut = { fx: 0, fy: 0 };

/**
 * The acceleration (u/s^2) hazard `i` (a jet) puts on a body at (x, y), or 0 when it is not in the stream. Lets props and
 * corpses ride the same current as the octopus. The returned object is shared: read it before the next call.
 */
export function jetForceAt(d, i, x, y) {
  if (d.kind[i] !== HZ_JET) return 0;
  const dx = d.dx[i], dy = d.dy[i];
  const rx = x - d.x[i], ry = y - d.y[i];
  const s = rx * dx + ry * dy, l = -rx * dy + ry * dx;
  if (s < 0 || s > d.len[i] || Math.abs(l) > JET_HALF_WIDTH) return 0;
  const f = JET_ACC * (d.pool[i] ? d.gain : 1) * (1 - 0.5 * s / d.len[i]) * (d.surge && d.surge[i] > 0 ? 1 + JET_SURGE_GAIN * Math.min(1, d.surge[i] / JET_SURGE_T) : 1); // a surge (chain.js); hand-made data has none
  jetOut.fx = dx * f; jetOut.fy = dy * f;
  return jetOut;
}

/**
 * The stretch of a spike strip that carries spikes, along its tangent: the nominal half length, pulled in at a convex
 * rock corner. (wx, wy) = the hazard's anchor cell centre. isSolid takes tile coordinates. The hit test and the drawing share it.
 */
export function spikeSpan(dx, dy, wx, wy, isSolid, out) {
  let lo = -SPIKE_HALF_LEN, hi = SPIKE_HALF_LEN;
  if (isSolid) {
    const tx = -dy, ty = dx;
    if (!isSolid(Math.floor(wx - dx - tx * 2), Math.floor(wy - dy - ty * 2))) lo += SPIKE_CORNER_INSET;
    if (!isSolid(Math.floor(wx - dx + tx * 2), Math.floor(wy - dy + ty * 2))) hi -= SPIKE_CORNER_INSET;
  }
  out.lo = lo; out.hi = hi;
  return out;
}

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
  if (name === 'jetspikes') return makeJetSpikes(x, y, tiles, w, h);
  const code = HAZARD_CODE[name];
  if (!code) return null;
  if (code === HZ_JET) {
    if (dx !== 0 || dy !== -1) return null; // V2-PLAN 16: a current jet only ever pushes UP
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

/**
 * Clear water rows between a floor jet's mouth and the flat ceiling above it, over the 3 columns of its stream
 * (tx-1..tx+1). (tx, ty) is the water cell standing on the floor; the row ty counts. -1 when the ceiling is not
 * flat (the columns do not stop together) or lies more than PAIR_MAX_CLEAR rows up.
 */
export function jetSpikeClearance(tiles, w, h, tx, ty) {
  const solid = (x, y) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] !== 0;
  for (let rows = 0; rows <= PAIR_MAX_CLEAR; rows++) {
    const y = ty - rows;
    const a = solid(tx - 1, y), b = solid(tx, y), c = solid(tx + 1, y);
    if (a || b || c) return a && b && c && rows > 0 ? rows : -1;
  }
  return -1;
}

/** A floor jet whose stream rises to a ceiling spike strip. The jet record carries the strip as `pair` (level-spawns.js tags both with a shared pairId); null when the spot does not fit. */
function makeJetSpikes(x, y, tiles, w, h) {
  const tx = Math.floor(x), ty = Math.floor(y);
  const water = (cx, cy) => cx >= 0 && cy >= 0 && cx < w && cy < h && tiles[cy * w + cx] === 0;
  if (!water(tx, ty) || water(tx, ty + 1)) return null; // a water cell with floor under it
  const clear = jetSpikeClearance(tiles, w, h, tx, ty);
  if (clear < PAIR_MIN_CLEAR) return null;
  // room to dash sideways out of the stream: 2 open columns on one side for most of the height
  let side = 0;
  for (let r = 0; r < clear; r++) {
    const yy = ty - r;
    if ((water(tx - 2, yy) && water(tx - 3, yy)) || (water(tx + 2, yy) && water(tx + 3, yy))) side++;
  }
  if (side < Math.ceil(clear * 0.6)) return null;
  const topY = ty - clear + 1; // the highest water row; the ceiling is the row above it
  const jet = { type: 'hazard', hk: HZ_JET, x: tx + 0.5, y: ty + 1, dx: 0, dy: -1, len: clear };
  const spikes = { type: 'hazard', hk: HZ_SPIKES, x: tx + 0.5, y: topY + 0.5, dx: 0, dy: 1, len: 3 };
  jet.pair = spikes;
  return jet;
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
    gain: 1, // the pool vents' current push scale (setPoolGain), read by jetForceAt
    cause: new Uint8Array(CAP), // rock: 1 = the octopus caused the fall (stood under it, or bombed it loose); 0 = an enemy or nothing did
    pool: new Uint8Array(CAP), // jet: one of the Challenge Pool's vents (its push is scaled by poolGain, weak until a wager runs)
    // chain reactions (chain.js): the chain a rock / eel was set off by (-1: none) and its generation; a jet's surge timer
    chain: new Int32Array(CAP).fill(-1), cdepth: new Uint8Array(CAP), surge: new Float32Array(CAP),
    imp: new Uint8Array(CAP), // rock: its impact (chain.js) has happened this drop
  };
  const events = []; // {type:'rockLanded'|'rockFall'|'shock'|'hazardHurt', ...}, consumed by main.js each frame
  const loaded = new Set();
  // 2026-10-08: every creature body (enemies, clams and tentacles, NPCs, shopkeepers) is reached through the shared damage entry
  // (damage.js, injected by main.js; null in tests that only drive the octopus). No kind is special-cased here: the creature
  // table (creature-rules.js) says what spikes, a boulder, a jet, a shock or an anemone does to each.
  let dmg = null;

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
    d.pid[i] = -1; d.hit[i] = 0; d.cause[i] = 0; d.pool[i] = rec.set === 'pool' ? 1 : 0;
    d.chain[i] = -1; d.cdepth[i] = 0; d.surge[i] = 0; d.imp[i] = 0;
    if (props && rec.hk === HZ_ROCK) {
      const pid = props.add(PK_ROCK, rec.x, rec.y, 0, 0, { radius: ROCK_RADIUS, ref: i });
      if (pid >= 0) { d.pid[i] = pid; props.hold(pid, Math.floor(rec.x), Math.floor(rec.y) - 1); } // hangs from the tile above
    }
    return i;
  }

  // the creature-table source of each hazard kind (what it does to the octopus and to every creature)
  const HZ_SOURCE = ['', 'jet', 'spikes', 'boulder', 'shock', 'anemone'];
  function hurt(octo, i, fx, fy) {
    if (octoHit(octo, HZ_SOURCE[d.kind[i]], fx, fy, HZ_CAUSE[d.kind[i]])) { events.push({ type: 'hazardHurt', kind: d.kind[i], x: fx, y: fy }); return true; }
    return false;
  }
  /** V2-PLAN 16: a shock (ring or body) is an incapacitation: one heart, EEL_STUN_S of limp body (creature-rules.js SOURCES.shock). */
  function shockOcto(octo, i, fx, fy) {
    if (octoHit(octo, 'shock', fx, fy, HZ_CAUSE[d.kind[i]])) {
      events.push({ type: 'hazardHurt', kind: d.kind[i], x: fx, y: fy }, { type: 'shocked', x: octo.x, y: octo.y });
    }
  }
  /** A boulder coming down on the octopus (fast, its centre above) flattens it: the body is pinned under the rock and the death is instant. */
  function trySplat(i, octo, world, vy) {
    if (vy < SPLAT_MIN_SPEED || octo.y - d.y[i] < SPLAT_ABOVE || Math.abs(octo.x - d.x[i]) > SPLAT_HALF) return false; // from above and under the boulder, else it is a side brush
    let floorTop = Math.floor(octo.y) + 1; // the first rock under the octopus: the pancake lies on it
    for (let k = 0; k < 8 && world.tileAt(Math.floor(octo.x), floorTop) === 0; k++) floorTop++;
    d.b[i] = floorTop; d.t[i] = 0;
    if (!killOctopus(octo, 'rock', 'splat', octo.x, octo.y, 0)) return false;
    d.state[i] = 5; d.hit[i] = 1;
    octo.flat = 0.75; // already crushed on the impact frame (the hit-stop holds it on screen)
    events.push({ type: 'splat', x: octo.x, y: Math.min(octo.y, d.y[i] + ROCK_RADIUS), rockX: d.x[i], rockY: d.y[i] });
    return true;
  }
  /** One step of a splat: the rock keeps falling, the body is carried under it and gets squashed between it and the floor; at rest it is a pancake. */
  function stepSplat(i, dt, octo) {
    d.t[i] += dt;
    const resting = d.state[i] === 6;
    const avail = d.b[i] - (d.y[i] + ROCK_RADIUS); // room left between the boulder's underside and the floor
    const phys = 1 - (avail - SPLAT_THIN) / (SPLAT_FULL - SPLAT_THIN);
    const hit = Math.min(0.7, 0.7 * d.t[i] / 0.08); // the impact itself squashes it at once
    octo.flat = resting ? Math.min(1, octo.flat + dt * 5) : Math.max(octo.flat, Math.min(1, Math.max(0, phys)), hit);
    const thick = SPLAT_FULL + (SPLAT_THIN - SPLAT_FULL) * octo.flat;
    octo.pinX += (d.x[i] - octo.pinX) * Math.min(1, dt * 14);
    octo.pinY = Math.min(d.y[i] + ROCK_RADIUS + thick / 2, d.b[i] - thick / 2);
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

  /** A creature body that moves about (not anchored to rock), and is moving now or knocked out: it sets a boulder off. */
  const roams = (V) => { const ph = rowOf(V.kind).physics; return ph !== PH_ANCHORED && ph !== PH_NONE && (V.stun > 0 || Math.hypot(V.vx, V.vy) > 0.2); };
  const lineClear = (world, tx, y0, y1) => { for (let ty = y0; ty <= y1; ty++) if (world.tileAt(tx, ty) !== 0) return false; return true; };

  const trig = { x: 0, y: 0, bottom: 0, tx: 0, ya: 0, world: null, who: 0 };
  const trigBody = (f, k, V) => {
    if (trig.who || !roams(V) || Math.abs(V.x - trig.x) >= ROCK_TRIGGER_HALF || V.y <= trig.y + 0.8 || V.y >= trig.bottom) return;
    if (lineClear(trig.world, trig.tx, trig.ya, Math.floor(V.y))) trig.who = 2;
  };
  /**
   * Does something stand under rock i, in line, close enough to set it off? The octopus does (cause 1), and so does any creature
   * that roams (cause 0: a boulder a creature triggered never angers a shopkeeper or an NPC). Item 6: only while the boulder is inside the camera
   * view, so nothing drops from off-screen. True when it was triggered (the shake starts).
   */
  function underRock(i, octo, world) {
    const x = d.x[i], y = d.y[i];
    if (!inCameraView(x, y)) return false;
    const tx = Math.floor(x), ya = Math.floor(y) + 1, bottom = d.a[i] + 1.5;
    let who = 0;
    if (Math.abs(octo.x - x) < ROCK_TRIGGER_HALF && octo.y > y + 0.8 && octo.y < bottom && lineClear(world, tx, ya, Math.floor(octo.y))) who = 1;
    else if (dmg) {
      trig.x = x; trig.y = y; trig.bottom = bottom; trig.tx = tx; trig.ya = ya; trig.world = world; trig.who = 0;
      dmg.each(trigBody);
      who = trig.who;
    }
    if (!who) return false;
    d.state[i] = 1; d.t[i] = ROCK_SHAKE; d.cause[i] = who === 1 ? 1 : 0;
    events.push({ type: 'rockFall', x, y });
    return true;
  }

  /**
   * A boulder falling faster than ROCK_CRUSH_SPEED crushes what it touches, once per victim per drop: every creature body through
   * the shared damage entry (creature-rules.js 'boulder': a oneHitSplat kind is splatted, the rest take its damage; a corpse
   * for any kill). SHOPKEEPER / NPC RULE: it may hurt them, but it only angers them when the octopus caused the fall (d.cause:
   * she stood under it, or her bomb released it). A boulder a creature set off hurts quietly.
   */
  function crushUnder(i, x, y, speed) {
    if (speed <= ROCK_CRUSH_SPEED || !dmg) return;
    dmg.circle('boulder', x, y, ROCK_RADIUS, d.cause[i] === 1, ROCK_HIT_COOL);
  }

  /**
   * Spikes hurt any body that hits them: knocked out onto them or hurtling in (SPIKE_KILL_SPEED); one that merely walks or swims
   * by does not. The table decides the rest (a oneHitSplat kind dies, the keeper takes a heavy hit and is thrown off, an
   * anchored or invulnerable one is never touched). Blame: the octopus only when she knocked the body about (damage.js blame).
   */
  // the each() callbacks read the hazard they test from these (no closure per hazard per step)
  let cbI = 0, cbLo = 0, cbHi = 0, cbRing = 0, cbWorld = null;
  const cbSolid = (tx, ty) => cbWorld.isSolid(tx, ty);
  const spikeBody = (f, k, V) => {
    const i = cbI, dx = d.dx[i], dy = d.dy[i], tx = -dy, ty = dx, fx = d.x[i] - dx * 0.5, fy = d.y[i] - dy * 0.5;
    const rx = V.x - fx, ry = V.y - fy;
    if (rx > 3 || rx < -3 || ry > 3 || ry < -3) return;
    const n = rx * dx + ry * dy, tt = rx * tx + ry * ty;
    if (n > SPIKE_REACH + V.r * 0.5 || n < -0.2 || tt > cbHi || tt < cbLo) return; // the body's edge must reach the tips, its centre over the strip
    if (dmg.cooling(V) || !(V.stun > 0 || Math.hypot(V.vx, V.vy) >= SPIKE_KILL_SPEED)) return;
    if (dmg.hitFound(f, k, 'spikes', fx + tx * tt, fy + ty * tt) !== 0) dmg.cool(f, k);
  };
  function spikeBodies(i, world) {
    spanWorld = world; const sp = spikeSpan(d.dx[i], d.dy[i], d.x[i], d.y[i], world && world.isSolid ? spanSolid : null, span);
    cbI = i; cbLo = sp.lo; cbHi = sp.hi;
    dmg.each(spikeBody);
  }

  /** An eel's shock (ring or body) and an anemone's sting reach every creature body too (the table: a stun where it can be knocked out). */
  const shockBody = (f, k, V) => {
    if (dmg.cooling(V)) return;
    const ex = d.x[cbI], ey = d.y[cbI];
    let hit = false;
    if (cbRing > 0) hit = Math.abs(Math.hypot(V.x - ex, V.y - ey) - cbRing) < 0.3 + V.r * 0.8 && hasLineOfSight(cbSolid, ex, ey, V.x, V.y);
    if (!hit) { const py = Math.max(ey - EEL_HALF_BODY, Math.min(ey + EEL_HALF_BODY, V.y)); hit = Math.hypot(V.x - ex, V.y - py) < 0.3 + V.r * 0.8; }
    if (hit && dmg.hitFound(f, k, 'shock', ex, ey) !== 0) dmg.cool(f, k, EEL_PERIOD * 0.5);
  };
  function shockBodies(i, world, ring) { cbI = i; cbRing = ring; cbWorld = world; dmg.each(shockBody); }
  const stingBody = (f, k, V) => {
    const ax = d.x[cbI], ay = d.y[cbI] + 0.1;
    if (dmg.cooling(V) || Math.hypot(V.x - ax, V.y - ay) >= ANEMONE_R + V.r * 0.6) return;
    if (dmg.hitFound(f, k, 'anemone', ax, ay + 0.2) !== 0) dmg.cool(f, k, 1);
  };
  function stingBodies(i) { cbI = i; dmg.each(stingBody); }

  /** Current jets also carry what is loose: every creature body the table lets them (damage.js push: a knocked-out body is thrown,
   * a free swimmer drifts, a walker on its floor and anything anchored stay put) and the light props (bombs, rubble, finds, pots, relics). */
  let jetI = 0, jetDt = 0;
  const jetBody = (f, k, V) => {
    const fo = jetForceAt(d, jetI, V.x, V.y);
    if (fo) dmg.push(f, k, V, fo.fx, fo.fy, jetDt, JET_DRIFT);
  };
  function jetsPush(dt) {
    const pd = props ? props.data : null;
    for (let i = 0; i < d.n; i++) {
      if (d.kind[i] !== HZ_JET) continue;
      if (dmg) { jetI = i; jetDt = dt; dmg.each(jetBody); }
      if (pd) {
        for (let k = 0; k < pd.n; k++) {
          if (!pd.alive[k] || pd.state[k] !== PS_FREE) continue;
          const pk = pd.kind[k];
          if (pk !== PK_BOMB && pk !== PK_RUBBLE && pk !== PK_FIND && pk !== PK_POT && pk !== PK_RELIC) continue;
          const f = jetForceAt(d, i, pd.x[k], pd.y[k]);
          if (!f) continue;
          pd.vx[k] += f.fx * dt; pd.vy[k] += f.fy * dt;
        }
      }
    }
  }

  function updateJet(i, dt, octo) {
    const f = jetForceAt(d, i, octo.x, octo.y);
    if (!f) return;
    octo.vx += f.fx * dt;
    octo.vy += f.fy * dt;
  }

  /** V2-PLAN 16: the spikes kill outright. Touching the strip pins the body on the tips (IMPALE_DEPTH past the face), belly to the face. */
  function updateSpikes(i, octo, world) {
    const dx = d.dx[i], dy = d.dy[i], tx = -dy, ty = dx;
    const fx = d.x[i] - dx * 0.5, fy = d.y[i] - dy * 0.5; // centre of the face
    const rx = octo.x - fx, ry = octo.y - fy;
    const n = rx * dx + ry * dy, tt = rx * tx + ry * ty;
    spanWorld = world; const sp = spikeSpan(dx, dy, d.x[i], d.y[i], world && world.isSolid ? spanSolid : null, span);
    // the tips are what hurts: the body's edge (a little soft) must reach them, along and across the strip
    if (n > SPIKE_REACH + octo.radius * 0.5 || n < -0.2 || tt > sp.hi + octo.radius * 0.3 || tt < sp.lo - octo.radius * 0.3) return;
    // the body hangs on the gap between two spikes, so two tips go through it (the drawn strip has SPIKE_COUNT spikes)
    const gap = (sp.hi - sp.lo) / SPIKE_COUNT;
    const c = sp.lo + gap * Math.max(1, Math.min(SPIKE_COUNT - 1, Math.round((tt - sp.lo) / gap)));
    const px = fx + tx * c + dx * IMPALE_DEPTH, py = fy + ty * c + dy * IMPALE_DEPTH;
    // belly to the face: the head points away from the rock, with a little lean towards the side it hit
    const ang = Math.atan2(dx, -dy) * RAD2DEG + (c / SPIKE_HALF_LEN) * 16 * (dy !== 0 ? 1 : -1);
    if (octo.dead) { // V2-PLAN 14: a corpse thrown onto the spikes is knocked off them (a hit on the body), not skewered
      if (hitBody(octo, fx + tx * c, fy + ty * c)) events.push({ type: 'hazardHurt', kind: d.kind[i], x: fx + tx * c, y: fy + ty * c });
      return;
    }
    if (killOctopus(octo, HZ_CAUSE[d.kind[i]], 'impale', px, py, ang)) events.push({ type: 'impaled', x: px, y: py, dx, dy });
  }

  function updateRockProp(i, dt, octo, world) {
    const pid = d.pid[i], pd = props.data, st = d.state[i];
    if (st === 0 || st === 1) {
      if (pd.state[pid] !== PS_HELD) { // its ceiling was bombed away: it comes loose now, no warning
        d.state[i] = 2; pd.state[pid] = PS_FREE; d.cause[i] = 1; // only the octopus's bombs dig the ceiling out
        events.push({ type: 'rockFall', x: d.x[i], y: d.y[i] });
        return;
      }
      if (st === 1) {
        d.t[i] -= dt;
        if (d.t[i] <= 0) { d.state[i] = 2; props.release(pid); pd.vy[pid] = 0.5; }
        return;
      }
      underRock(i, octo, world);
      return;
    }
    if (st !== 2 && st !== 4 && st !== 5 && st !== 6) return;
    d.x[i] = pd.x[pid]; d.y[i] = pd.y[pid];
    const sp = Math.hypot(pd.vx[pid], pd.vy[pid]);
    if (st === 6) { stepSplat(i, dt, octo); return; } // resting on the pancake: the boulder stays a prop, never a rock tile
    if (st === 2 && sp > 1.5 && Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < ROCK_RADIUS + octo.radius * 0.85) {
      if (octo.dead || !trySplat(i, octo, world, pd.vy[pid])) hurtByRock(octo, i, world);
    }
    if (st === 2) crushUnder(i, d.x[i], d.y[i], sp);
    // chain.js: the first hard stop of a drop (on the floor, on a bomb, on a clam) is its impact: it sets off what it hit
    if (st === 2) {
      const vy = pd.vy[pid], pv = d.v[i];
      if (!d.imp[i] && pv > ROCK_IMPACT_SPEED && vy < pv * 0.45) impact(i);
      d.v[i] = vy;
    }
    // materials: a falling boulder smashes through a wooden platform or a bone block it hits (and keeps falling)
    if (st === 2 && world.smashTile && pd.vy[pid] > ROCK_SMASH_SPEED) {
      const tx = Math.floor(d.x[i]), ty = Math.floor(d.y[i] + ROCK_RADIUS + 0.05 + pd.vy[pid] * 0.04); // looks one or two steps ahead: the wall resolver stops it at contact
      if (world.smashTile(tx, ty)) { pd.vy[pid] *= 0.7; events.push({ type: 'tileSmashed', x: tx + 0.5, y: ty + 0.5 }); }
    }
    const landed = (pd.grounded[pid] && sp < 1.5) || pd.state[pid] !== PS_FREE;
    if (d.state[i] === 5) { // splatting: carry the body down with the boulder
      if (landed) d.state[i] = 6;
      stepSplat(i, dt, octo);
      return;
    }
    if (!landed) return;
    // never settle on top of the octopus: wait (state 4) until it swims clear
    if (Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < ROCK_RADIUS + octo.radius + 0.1) { d.state[i] = 4; return; }
    const tx = Math.floor(d.x[i]), ty = Math.floor(d.y[i]);
    // a boulder balanced on a ledge corner (its middle over the drop) must not turn into a rock tile hanging in the water: it
    // rolls off instead, towards the middle of the cell it is in, and settles lower down
    if (world.tileAt && world.tileAt(tx, ty) === 0 && world.tileAt(tx, ty + 1) === 0) {
      const dir = tx + 0.5 - d.x[i];
      pd.vx[pid] = (dir < 0 ? -1 : 1) * Math.max(1, Math.abs(dir) * 4); pd.vy[pid] = Math.max(pd.vy[pid], 0.3); pd.grounded[pid] = 0;
      return;
    }
    d.state[i] = 3;
    props.remove(pid); d.pid[i] = -1;
    if (world.placeRock && world.tileAt(tx, ty) === 0) world.placeRock(tx, ty); // becomes breakable rock where it lands
    events.push({ type: 'rockLanded', x: d.x[i], y: d.y[i], i, chain: d.chain[i], depth: d.cdepth[i], byOcto: d.cause[i] === 1 });
  }

  /** A falling boulder's impact (once per drop): chain.js sets off what it hit; a boulder a chain shook loose carries that chain. */
  function impact(i) {
    d.imp[i] = 1;
    events.push({ type: 'rockImpact', x: d.x[i], y: d.y[i], i, chain: d.chain[i], depth: d.cdepth[i], byOcto: d.cause[i] === 1 });
  }

  function updateRock(i, dt, octo, world) {
    if (props && d.pid[i] >= 0) { updateRockProp(i, dt, octo, world); return; }
    const st = d.state[i];
    if (st === 0) {
      underRock(i, octo, world);
    } else if (st === 1) {
      d.t[i] -= dt;
      if (d.t[i] <= 0) { d.state[i] = 2; d.v[i] = 0; }
    } else if (st === 6) {
      stepSplat(i, dt, octo);
    } else if (st === 2 || st === 4 || st === 5) {
      if (st === 2 || st === 5) {
        d.v[i] = Math.min(ROCK_MAX_FALL, d.v[i] + ROCK_GRAVITY * dt);
        d.y[i] = Math.min(d.a[i], d.y[i] + d.v[i] * dt);
        if (st === 2 && Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) < ROCK_RADIUS + octo.radius * 0.85) {
          if (octo.dead || !trySplat(i, octo, world, d.v[i])) hurtByRock(octo, i, world);
        }
        if (st === 2) crushUnder(i, d.x[i], d.y[i], d.v[i]);
      }
      if (d.state[i] === 5) { // splatting: the boulder carries the body down and stays where it lands (no rock tile)
        stepSplat(i, dt, octo);
        if (d.y[i] >= d.a[i]) d.state[i] = 6;
        return;
      }
      if (d.y[i] >= d.a[i] && !d.imp[i] && d.v[i] > ROCK_IMPACT_SPEED) impact(i);
      if (d.y[i] >= d.a[i]) {
        // never settle on top of the octopus: wait (state 4) until it swims clear
        if (Math.hypot(d.x[i] - octo.x, d.a[i] - octo.y) < ROCK_RADIUS + octo.radius + 0.1) { d.state[i] = 4; d.y[i] = d.a[i]; return; }
        d.state[i] = 3; d.y[i] = d.a[i];
        const tx = Math.floor(d.x[i]), ty = Math.floor(d.a[i]);
        if (world.placeRock && world.tileAt(tx, ty) === 0) world.placeRock(tx, ty); // becomes breakable rock where it lands
        events.push({ type: 'rockLanded', x: d.x[i], y: d.a[i], i, chain: d.chain[i], depth: d.cdepth[i], byOcto: d.cause[i] === 1 });
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
    if (prev < EEL_FIRE_AT && c >= EEL_FIRE_AT) { // chain.js: a shock a chain set off carries that chain on (and the eel forgets it)
      d.r[i] = 0.3; events.push({ type: 'shock', x: d.x[i], y: d.y[i], i, chain: d.chain[i], depth: d.cdepth[i] });
      d.chain[i] = -1; d.cdepth[i] = 0;
    }
    if (d.r[i] > 0) {
      d.r[i] += EEL_RING_SPEED * dt;
      if (d.r[i] > EEL_RING_MAX) d.r[i] = 0;
    }
    const ex = d.x[i], ey = d.y[i];
    const dist = Math.hypot(octo.x - ex, octo.y - ey);
    if (d.r[i] > 0 && Math.abs(dist - d.r[i]) < 0.3 + octo.radius * 0.8 && hasLineOfSight((tx, ty) => world.isSolid(tx, ty), ex, ey, octo.x, octo.y)) shockOcto(octo, i, ex, ey);
    // the body itself
    const py = Math.max(ey - EEL_HALF_BODY, Math.min(ey + EEL_HALF_BODY, octo.y));
    if (Math.hypot(octo.x - ex, octo.y - py) < 0.3 + octo.radius * 0.8) shockOcto(octo, i, ex, ey);
    if (dmg) shockBodies(i, world, d.r[i]);
  }

  function updateAnemone(i, octo) {
    if (Math.hypot(octo.x - d.x[i], octo.y - (d.y[i] + 0.1)) < ANEMONE_R + octo.radius * 0.6) hurt(octo, i, d.x[i], d.y[i] + 0.3);
    if (dmg) stingBodies(i);
  }

  return {
    data: d,
    events,
    /** Add one record directly (tests, debug). Returns its index, or -1 when full. */
    add,
    count() { return d.n; },
    /** r40: the Challenge Pool's vents push with this fraction of a jet's force (weak while the pool is idle, full during a wager). */
    setPoolGain(g) { d.gain = g; },
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
          case HZ_JET: if (d.surge[i] > 0) d.surge[i] = Math.max(0, d.surge[i] - dt); updateJet(i, dt, octo); break; // the dead body too (V2-PLAN 14): jets shove it, spikes and anemones hit it
          case HZ_SPIKES: updateSpikes(i, octo, world); if (dmg) spikeBodies(i, world); break;
          case HZ_ROCK: updateRock(i, dt, octo, world); break;
          case HZ_EEL: updateEel(i, dt, octo, world); break;
          case HZ_ANEMONE: updateAnemone(i, octo); break;
          default: break;
        }
      }
      if (dmg || props) jetsPush(dt);
    },
    /** main.js wires the shared damage entry in (damage.js createDamage with every family registered); null: only the octopus. */
    setDamage(dm) { dmg = dm || null; },
    /** A blast at (x, y): hanging rocks within `reach` (main.js passes the blast's knock reach, 2 radii: the shock, not only
     * their ceiling tile going) come loose. */
    blast(x, y, reach) {
      let n = 0;
      if (!props) return 0;
      for (let i = 0; i < d.n; i++) {
        if (d.kind[i] !== HZ_ROCK || d.pid[i] < 0 || d.state[i] > 1) continue;
        if (Math.hypot(d.x[i] - x, d.y[i] - y) > reach) continue;
        if (props.data.state[d.pid[i]] === PS_HELD) { props.release(d.pid[i]); d.cause[i] = 1; n++; } // her bomb
      }
      return n;
    },
    /**
     * Chain reactions (chain.js): set hazard i off. A hanging boulder rumbles CHAIN_ROCK_SHAKE and drops; an eel crackles
     * CHAIN_EEL_CHARGE and shocks; a jet surges JET_SURGE_T. ctx {chain, depth, byOcto} rides along to the boulder's landing and
     * the eel's shock. False when it cannot go off now (already falling, already shocking).
     */
    trigger(i, ctx = null) {
      if (i < 0 || i >= d.n) return false;
      const k = d.kind[i];
      if (k === HZ_ROCK) {
        if (d.state[i] !== 0) return false;
        if (props && d.pid[i] >= 0 && props.data.state[d.pid[i]] !== PS_HELD) return false;
        d.state[i] = 1; d.t[i] = CHAIN_ROCK_SHAKE; d.cause[i] = ctx && ctx.byOcto ? 1 : 0;
      } else if (k === HZ_EEL) {
        if (d.t[i] >= EEL_FIRE_AT - CHAIN_EEL_CHARGE && d.t[i] < EEL_FIRE_AT) { /* about to shock anyway: it joins the chain */ }
        else if (d.r[i] > 0) return false; // its ring is still out
        else d.t[i] = EEL_FIRE_AT - CHAIN_EEL_CHARGE;
      } else if (k === HZ_JET) {
        d.surge[i] = JET_SURGE_T;
        events.push({ type: 'surge', x: d.x[i] + d.dx[i] * 0.6, y: d.y[i] + d.dy[i] * 0.6, i });
        return true;
      } else return false;
      d.chain[i] = ctx && ctx.chain >= 0 ? ctx.chain : -1; d.cdepth[i] = ctx ? ctx.depth | 0 : 0;
      if (k === HZ_ROCK) events.push({ type: 'rockFall', x: d.x[i], y: d.y[i], i });
      return true;
    },
    /** The chain.js target adapters: 'rock' (hanging boulders), 'eel', 'jet' (the nearest point of its stream). */
    chainTargets() {
      const api = this;
      const adapter = (name, hk, test) => ({
        name,
        each(x, y, r, cb) {
          for (let i = 0; i < d.n; i++) {
            if (d.kind[i] !== hk || !test(i)) continue;
            let px = d.x[i], py = d.y[i];
            if (hk === HZ_JET) { // the stream is a segment from the mouth along (dx, dy)
              const s = Math.max(0, Math.min(d.len[i], (x - px) * d.dx[i] + (y - py) * d.dy[i]));
              px += d.dx[i] * s; py += d.dy[i] * s;
            }
            if (Math.hypot(px - x, py - y) <= r) cb(i, px, py);
          }
        },
        fire: (i, ctx) => api.trigger(i, ctx),
      });
      return [
        adapter('rock', HZ_ROCK, (i) => d.state[i] === 0 && (!props || d.pid[i] < 0 || props.data.state[d.pid[i]] === PS_HELD)),
        adapter('eel', HZ_EEL, (i) => d.r[i] <= 0),
        adapter('jet', HZ_JET, (i) => d.surge[i] <= 0),
      ];
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
