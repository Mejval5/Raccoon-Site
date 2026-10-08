// Corpses (v2, V2-PLAN 16): what a dead enemy or NPC leaves behind. A limp body that sinks, bounces off the traced
// wall segments, tumbles, settles and sleeps, and fades away about 25 s after it came to rest. Enemies drop NO items.
// Data-oriented: one typed array per field and a small CAP (the oldest corpse goes when the pool is full).
//
//   add(kind, x, y, vx, vy, face) -> index   a new corpse (kind is the enemy / NPC name: 'piranha', 'gclam', 'npc-pip')
//   update(dt, world, hazardsData)           one fixed step: water gravity and drag, walls, jets, sleep, fade
//   blast(x, y, R)                           radial shove, wakes sleepers (same falloff as props.blast)
//   setCorpseHook(fn)                        fn(x, y, kind, index) once per new corpse (the fish juice leaks through it)
//
// The octopus never collides with a corpse: it is scenery with physics, not a prop.

import { resolveCircleVsSegments, resolveCircleVsGrid, contact } from './physics.js';
import * as hazardsMod from './hazards.js';

export const CAP = 24;
export const CS_FREE = 0, CS_REST = 1, CS_CARRY = 2; // CS_CARRY: in the octopus's hand (hand.js moves it; no physics, no fading)
export const GRAV = 3;        // u/s^2 sink acceleration (terminal sink speed = GRAV / DRAG, about 1.9 u/s)
export const DRAG = 1.6;      // 1/s
export const RESTITUTION = 0.35;
export const ROLL_FRICTION = 1.3; // 1/s tangential damping while touching
export const LIFE_AFTER_REST = 25, FADE_TIME = 2, MAX_AGE = 120; // s
const BOUNCE_MIN = 0.9, BOUNCE_FULL = 2.5; // u/s impact speed: below BOUNCE_MIN nothing bounces, above the sum the full restitution
const SLEEP_SPEED = 0.12, SLEEP_TIME = 0.45, STICK_SPEED = 0.3, STICK_SLOPE = 0.3;
const MAX_SPEED = 12;
export const BLAST_POWER = 11;
const JET_ACC_FALLBACK = 17, JET_HALF_WIDTH_FALLBACK = 1.1; // hazards.js updateJet, used when jetForceAt is not exported

/** Body radius per kind (tiles); anything else (an NPC, a new creature) uses RADIUS_DEFAULT. */
export const KIND_RADIUS = {
  piranha: 0.45, crab: 0.4, 'crab-fast': 0.4, manta: 0.6, urchin: 0.42, cannon: 0.45, horns: 0.35, gclam: 0.9, tentacle: 0.6,
};
const RADIUS_DEFAULT = 0.5;
export function corpseRadius(kind) { return KIND_RADIUS[kind] !== undefined ? KIND_RADIUS[kind] : RADIUS_DEFAULT; }

// kinds are stored as small ids (a registry grows as new names appear)
const kindNames = [''];
const kindIds = new Map();
export function kindId(name) {
  let id = kindIds.get(name);
  if (id === undefined) { id = kindNames.length; kindNames.push(name); kindIds.set(name, id); }
  return id;
}
export function kindName(id) { return kindNames[id] || ''; }
/** An NPC corpse ('npc-*', a standing figure) comes to rest lying on its side, not upright. */
function isNpcKind(id) { return (kindNames[id] || '').startsWith('npc-'); }

let hook = null;
/** fn(x, y, kind, index) is called once for every corpse that is added (null clears it). */
export function setCorpseHook(fn) { hook = typeof fn === 'function' ? fn : null; }

const B = { x: 0, y: 0, vx: 0, vy: 0, radius: 0 }; // scratch body for the wall resolvers

/** Force (u/s^2) of jet i of the hazards data on a point, written into out[0..1]; false when it is outside the stream. */
function jetForce(hd, i, x, y, out) {
  if (typeof hazardsMod.jetForceAt === 'function') {
    const f = hazardsMod.jetForceAt(hd, i, x, y);
    if (!f) return false;
    if (typeof f === 'object') { out[0] = f.fx; out[1] = f.fy; return true; } // the shared {fx, fy} (0 when outside the stream)
    return false;
  }
  const dx = hd.dx[i], dy = hd.dy[i];
  const rx = x - hd.x[i], ry = y - hd.y[i];
  const s = rx * dx + ry * dy, l = -rx * dy + ry * dx;
  const hw = hazardsMod.JET_HALF_WIDTH || JET_HALF_WIDTH_FALLBACK;
  if (s < 0 || s > hd.len[i] || Math.abs(l) > hw) return false;
  const f = (hazardsMod.JET_ACC || JET_ACC_FALLBACK) * (1 - 0.5 * s / hd.len[i]);
  out[0] = dx * f; out[1] = dy * f;
  return true;
}
const jf = [0, 0];

export function createCorpses(cap = CAP) {
  const d = {
    cap, n: 0, live: 0,
    alive: new Uint8Array(cap), kind: new Uint8Array(cap), state: new Uint8Array(cap),
    x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
    radius: new Float32Array(cap),
    rot: new Float32Array(cap), spin: new Float32Array(cap), // radians, rad/s
    face: new Int8Array(cap),
    still: new Float32Array(cap),  // time spent nearly still on something (sleeps after SLEEP_TIME)
    restT: new Float32Array(cap),  // time asleep (the fade clock)
    age: new Float32Array(cap),
    seq: new Float64Array(cap),    // birth order, the oldest goes first when full
    grounded: new Uint8Array(cap),
  };
  let seq = 0, lastVersion = -1, lastNx = 0, lastNy = 0;

  function oldest() {
    let best = -1;
    for (let i = 0; i < d.n; i++) if (d.alive[i] && d.state[i] !== CS_CARRY && (best < 0 || d.seq[i] < d.seq[best])) best = i;
    return best;
  }
  function remove(i) {
    if (i < 0 || i >= d.n || !d.alive[i]) return;
    d.alive[i] = 0; d.live--;
  }

  function add(kind, x, y, vx = 0, vy = 0, face = 1) {
    let i = -1;
    for (let k = 0; k < d.n; k++) if (!d.alive[k]) { i = k; break; }
    if (i < 0 && d.n < cap) i = d.n++;
    if (i < 0) { i = oldest(); remove(i); }
    d.alive[i] = 1; d.live++; d.kind[i] = kindId(kind); d.state[i] = CS_FREE;
    d.x[i] = x; d.y[i] = y; d.vx[i] = vx; d.vy[i] = vy;
    d.radius[i] = corpseRadius(kind);
    d.face[i] = face < 0 ? -1 : 1;
    d.rot[i] = 0;
    // a first tumble from the way it was moving, plus a deterministic kick so a still body does not just sink flat
    const h = Math.sin((seq + 1) * 12.9898 + x * 7.233 + y * 3.17) * 43758.5453;
    const j = h - Math.floor(h) - 0.5;
    d.spin[i] = vx * 0.6 + j * 2.4;
    d.still[i] = 0; d.restT[i] = 0; d.age[i] = 0; d.grounded[i] = 0; d.seq[i] = seq++;
    clampSpeed(i);
    if (hook) hook(x, y, kind, i);
    return i;
  }

  function clampSpeed(i) {
    const s = Math.hypot(d.vx[i], d.vy[i]);
    if (s > MAX_SPEED) { const m = MAX_SPEED / s; d.vx[i] *= m; d.vy[i] *= m; }
  }
  function wake(i) { if (d.alive[i] && d.state[i] === CS_REST) { d.state[i] = CS_FREE; d.still[i] = 0; d.restT[i] = 0; } }

  /** A blast at (x, y) with radius R: every corpse within 2R gets a radial impulse (linear falloff), asleep or not. */
  function blast(x, y, R, power = BLAST_POWER) {
    const reach = R * 2;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.state[i] === CS_CARRY) continue;
      let dx = d.x[i] - x, dy = d.y[i] - y;
      let dist = Math.hypot(dx, dy);
      if (dist > reach) continue;
      if (dist < 1e-4) { dx = 0; dy = -1; dist = 1; } else { dx /= dist; dy /= dist; }
      const f = (1 - Math.min(1, dist / reach)) * power;
      d.state[i] = CS_FREE; d.still[i] = 0; d.restT[i] = 0;
      d.vx[i] += dx * f; d.vy[i] += dy * f - f * 0.15;
      d.spin[i] += dx * f * 0.8;
      clampSpeed(i);
    }
  }

  function collideWorld(i, world) {
    B.x = d.x[i]; B.y = d.y[i]; B.vx = d.vx[i]; B.vy = d.vy[i]; B.radius = d.radius[i];
    contact.hit = 0;
    if (typeof world.wallSegmentsNear === 'function') resolveCircleVsSegments(B, world.wallSegmentsNear(B.x, B.y, B.radius));
    else resolveCircleVsGrid(B, world);
    let touched = false;
    if (contact.hit) {
      touched = true;
      const vn = contact.vn, e = RESTITUTION * Math.min(1, (-vn - BOUNCE_MIN) / BOUNCE_FULL);
      if (-vn > BOUNCE_MIN && e > 0) { B.vx += -e * vn * contact.nx; B.vy += -e * vn * contact.ny; }
      if (contact.ny < -0.3) d.grounded[i] = 1;
      lastNx = contact.nx; lastNy = contact.ny;
    }
    d.x[i] = B.x; d.y[i] = B.y; d.vx[i] = B.vx; d.vy[i] = B.vy;
    return touched;
  }

  /** Nearest open tile centre for a body that ended up inside rock (a bomb filled the tile it slept in). */
  function eject(i, world) {
    const cx = Math.floor(d.x[i]), cy = Math.floor(d.y[i]);
    for (let r = 1; r <= 4; r++) {
      let best = -1, bx = 0, by = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (world.isSolid(cx + dx + 0.5, cy + dy + 0.5)) continue;
          const dd = (cx + dx + 0.5 - d.x[i]) ** 2 + (cy + dy + 0.5 - d.y[i]) ** 2;
          if (best < 0 || dd < best) { best = dd; bx = cx + dx + 0.5; by = cy + dy + 0.5; }
        }
      }
      if (best >= 0) { d.x[i] = bx; d.y[i] = by; d.vx[i] = d.vy[i] = 0; d.state[i] = CS_FREE; d.still[i] = 0; return; }
    }
  }

  function stepOne(i, dt, world, hd) {
    d.vy[i] += GRAV * dt;
    // current jets push up (and along their stream) while the body is inside one
    if (hd) {
      for (let h = 0; h < hd.n; h++) {
        if (hd.kind[h] !== 1) continue; // HZ_JET
        if (jetForce(hd, h, d.x[i], d.y[i], jf)) { d.vx[i] += jf[0] * dt; d.vy[i] += jf[1] * dt; }
      }
    }
    const f = 1 / (1 + dt * DRAG);
    d.vx[i] *= f; d.vy[i] *= f;
    clampSpeed(i);
    d.grounded[i] = 0;
    const speed = Math.hypot(d.vx[i], d.vy[i]), r = d.radius[i];
    let steps = 1;
    if (speed * dt > r * 0.5) steps = Math.min(8, Math.ceil(speed * dt / (r * 0.5)));
    const sub = dt / steps;
    let touched = false;
    for (let s = 0; s < steps; s++) {
      d.x[i] += d.vx[i] * sub; d.y[i] += d.vy[i] * sub;
      if (collideWorld(i, world)) touched = true;
    }
    if (touched) {
      // rolling friction along the surface, and a stick threshold so a slow body on a shallow slope stays put
      const tx = -lastNy, ty = lastNx;
      const vt = d.vx[i] * tx + d.vy[i] * ty;
      const vtN = vt / (1 + dt * ROLL_FRICTION);
      d.vx[i] += (vtN - vt) * tx; d.vy[i] += (vtN - vt) * ty;
      if (Math.hypot(d.vx[i], d.vy[i]) < STICK_SPEED && Math.abs(lastNx) < STICK_SLOPE && lastNy < -0.5) { d.vx[i] = 0; d.vy[i] = 0; }
    }
    // the tumble: on the floor the spin follows the rolling speed, in open water it just fades
    if (d.grounded[i]) d.spin[i] += (d.vx[i] / Math.max(0.2, r) - d.spin[i]) * Math.min(1, 8 * dt);
    else d.spin[i] *= 1 / (1 + dt * 1.2);
    d.rot[i] += d.spin[i] * dt;
    if (touched && Math.hypot(d.vx[i], d.vy[i]) < SLEEP_SPEED) {
      d.still[i] += dt;
      if (d.still[i] >= SLEEP_TIME) { d.state[i] = CS_REST; d.vx[i] = d.vy[i] = 0; d.spin[i] = 0; d.restT[i] = 0; }
    } else d.still[i] = 0;
  }

  /** The alpha a corpse is drawn with (1 until the last FADE_TIME seconds of its rest). */
  function alphaOf(i) {
    const left = LIFE_AFTER_REST - d.restT[i];
    return left >= FADE_TIME ? 1 : Math.max(0, left / FADE_TIME);
  }

  return {
    data: d,
    add, remove, blast, wake, alphaOf,
    /** The hand takes corpse i (it stops simulating until let go). */
    carry(i) { if (d.alive[i]) { d.state[i] = CS_CARRY; d.vx[i] = d.vy[i] = 0; d.restT[i] = 0; d.still[i] = 0; } },
    /** Put a carried corpse at (x, y) with velocity (vx, vy) and turn rot. */
    place(i, x, y, vx = 0, vy = 0, rot = null) { d.x[i] = x; d.y[i] = y; d.vx[i] = vx; d.vy[i] = vy; if (rot !== null) d.rot[i] = rot; },
    /** Let a carried corpse go with velocity (vx, vy) (a throw spins it). */
    release(i, vx = 0, vy = 0) { if (!d.alive[i]) return; d.state[i] = CS_FREE; d.vx[i] = vx; d.vy[i] = vy; d.spin[i] = vx * 0.9; d.still[i] = 0; d.restT[i] = 0; clampSpeed(i); },
    count() { return d.live; },
    clear() { for (let i = 0; i < d.n; i++) d.alive[i] = 0; d.n = 0; d.live = 0; lastVersion = -1; },
    /** One fixed step. `world` is the level world (wallSegmentsNear / isSolid / tileVersion), `hazardsData` is hazards.data. */
    update(dt, world, hazardsData) {
      const v = world.tileVersion;
      if (v !== undefined && v !== lastVersion) {
        if (lastVersion !== -1) for (let i = 0; i < d.n; i++) wake(i);
        lastVersion = v;
      }
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        if (d.state[i] === CS_CARRY) { d.age[i] = Math.min(d.age[i], MAX_AGE * 0.5); continue; } // carried: the hand moves it
        d.age[i] += dt;
        if (d.state[i] === CS_FREE) {
          stepOne(i, dt, world, hazardsData);
        } else {
          d.restT[i] += dt;
          if (d.restT[i] >= LIFE_AFTER_REST) { remove(i); continue; }
          // a jet under a sleeper lifts it again
          if (hazardsData) {
            for (let h = 0; h < hazardsData.n; h++) {
              if (hazardsData.kind[h] === 1 && jetForce(hazardsData, h, d.x[i], d.y[i], jf)) { wake(i); break; }
            }
          }
          // it ends up lying flat (belly up for fish), not at whatever angle it stopped rolling
          // (an NPC is not a fish: it tips over onto its side, to whichever side is nearer, instead of lying upright)
          const lying = isNpcKind(d.kind[i]);
          const target = lying ? Math.round(d.rot[i] / Math.PI - 0.5) * Math.PI + Math.PI / 2 : Math.round(d.rot[i] / (2 * Math.PI)) * 2 * Math.PI;
          d.rot[i] += (target - d.rot[i]) * Math.min(1, (lying ? 2.5 : 4) * dt);
        }
        if (d.age[i] > MAX_AGE) { remove(i); continue; }
        if (d.state[i] !== CS_FREE && world.isSolid(d.x[i], d.y[i])) eject(i, world);
      }
    },
  };
}
