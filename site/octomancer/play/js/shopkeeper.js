// Shopkeepers (2026-10-07, Daniel: "the shopkeeper should be super buff and basically shrug off normal hits like in
// Spelunky ... launch the claws very quickly, it should be brutal ... the concept of aggro like in Spelunky").
//
// The hermit-crab keeper is calm while the octopus behaves. Once the run's shop aggro is set (shop-aggro.js: hurting him,
// damaging or bombing his stall, stealing, killing any keeper) every keeper is hostile for the rest of the run:
//   KM_CALM   sits behind the counter (drawn by drawShopArt); a hit or the aggro flag wakes him.
//   KM_WAIT   hostile but at his post (the stall of a later level, or the whirlpool at the exit he waits by); the octopus in
//             sight within WAIT_SIGHT tiles rouses him.
//   KM_ANGRY  pursues through water (line of sight, else a smoothed A* path) and throws his claws: a CLAW_TELL wind-up,
//             then a claw shoots out at CLAW_SPEED along the line to the octopus and is reeled back in. Each hit, claw or
//             body, takes KEEPER_HIT_DMG hearts: one or two hits kill.
//   KM_DEAD   gone (main.js drops his shells).
// He is super buff: KEEPER_HP, and every hit is scaled by its kind (HIT_SCALE): ink jets and dashes barely scratch him and
// hardly move him (KNOCK_SCALE); bombs and heavy hits are what hurt.
//
// Data-oriented: one flat typed array per field, one record per keeper, two claws per keeper (index i * 2 + side).

import { hurtOctopus, killOctopus } from './octopus.js';
import { resolveCircleVsSegments, resolveCircleVsGrid } from './physics.js';
import { hasLineOfSight, findSmoothPath } from './pathfind.js';
import { hashSeed2, mulberry32 } from './rng.js';
import { HIT_INK, HIT_DASH, HIT_BOMB, HIT_HEAVY, octoDashing } from './shop-aggro.js';
import { resolveHit, rowOf } from './creature-rules.js';
import { octoHit } from './damage.js';

export { HIT_INK, HIT_DASH, HIT_BOMB, HIT_HEAVY };
export const KM_CALM = 0, KM_WAIT = 1, KM_ANGRY = 2, KM_DEAD = 3;
export const MODE_NAMES = ['calm', 'wait', 'angry', 'dead'];
export const KEEPER_HP = rowOf('keeper').hp; // creature-rules.js: 40, resists ink and dashes (the table's `resist`)
export const KEEPER_R = 0.75;        // body radius for hits (the drawn crab is about 1.9 tiles wide)
export const KEEPER_WALL_R = 0.6;    // body radius against rock (fits the two-tile passages the octopus swims)
export const KEEPER_SPEED = 6.4;     // u/s pursuit: faster than the octopus swims (6); only a dash gains on him
export const KEEPER_ACCEL = 16;      // u/s^2
export const WAIT_SIGHT = 8;         // tiles: a waiting keeper sees the octopus this far (line of sight)
export const CLAW_TELL = 0.25;       // s of wind-up before a claw flies
export const CLAW_RANGE = 6.5;       // tiles from the shoulder
export const CLAW_SPEED = 24;        // u/s out
export const CLAW_BACK_SPEED = 15;   // u/s reeled back
export const CLAW_COOL = 0.35;       // s after a launch before the next wind-up (the other claw)
export const CLAW_R = 0.42;          // claw tip hit radius
export const SHOULDER_DX = 0.62, SHOULDER_DY = 0.18;
export const KEEPER_HIT_DMG = 2;     // hearts per claw or body hit (HEART_MAX 3: two hits kill, one when hurt already)
export const KEEPER_HIT_KNOCK = 10;  // u/s
export const BOMB_DMG = 30;          // 2026-10-08: the table's bomb (creature-rules.js SOURCES.bomb.dmg) inside the radius; beyond it, to twice the radius, only a shove
export const KNOCK_BASE = 9;         // u/s of knockback for a unit hit (scaled by KNOCK_SCALE)
// 2026-10-08: the old per-HIT_* scales are gone: every hit goes through creature-rules.js (the 'keeper' row: hp 40, mass 1.2,
// resist ink 0.08 / dash 0.25, stunScale 0.6). HIT_* codes stay as the legacy names of four sources:
export const HIT_SOURCE = ['', 'ink', 'dash', 'bomb', 'boulder'];
const SOURCE_HIT = { ink: HIT_INK, dash: HIT_DASH, bomb: HIT_BOMB };
export const GUARD_CHANCE = 0.75;    // a later level of an angry run has a keeper waiting by its exit this often
const REPATH = 0.25;

/** @param {number} cap */
export function createKeepers(cap = 4) {
  return {
    cap, n: 0,
    mode: new Uint8Array(cap), shop: new Uint8Array(cap), // shop: 1 = the stall's own keeper, 0 = a guard at the exit
    x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
    homeX: new Float32Array(cap), homeY: new Float32Array(cap),
    hp: new Float32Array(cap), face: new Int8Array(cap),
    hzCool: new Float64Array(cap), blame: new Float64Array(cap), // damage.js: hazard cooldown and octopus-blame (sim time stamps)
    stun: new Float32Array(cap), flash: new Float32Array(cap), shrug: new Float32Array(cap), roused: new Float32Array(cap),
    tell: new Float32Array(cap), tellSide: new Uint8Array(cap), cool: new Float32Array(cap), nextSide: new Uint8Array(cap),
    pathT: new Float32Array(cap), pathI: new Int16Array(cap), path: new Array(cap).fill(null),
    // claws: index i * 2 + side (0 left, 1 right). cst 0 at the body, 1 flying out, 2 reeled back
    cst: new Uint8Array(cap * 2), cx: new Float32Array(cap * 2), cy: new Float32Array(cap * 2),
    cvx: new Float32Array(cap * 2), cvy: new Float32Array(cap * 2), cd: new Float32Array(cap * 2),
    launches: 0, // claws thrown so far (tests)
    events: [],  // {type:'roused'|'clawTell'|'clawLaunch'|'octoHit'|'hurt'|'killed', i, x, y, ...}, cleared by the owner
  };
}

/** Add a keeper at (x, y). Returns its index, or -1 when full. */
export function addKeeper(k, x, y, mode = KM_CALM, isShop = 1) {
  if (k.n >= k.cap) return -1;
  const i = k.n++;
  k.mode[i] = mode; k.shop[i] = isShop ? 1 : 0;
  k.x[i] = k.homeX[i] = x; k.y[i] = k.homeY[i] = y; k.vx[i] = k.vy[i] = 0;
  k.hp[i] = KEEPER_HP; k.face[i] = -1; k.hzCool[i] = 0; k.blame[i] = 0;
  k.stun[i] = k.flash[i] = k.shrug[i] = k.roused[i] = k.tell[i] = 0; k.cool[i] = 0.3; k.nextSide[i] = 0;
  k.pathT[i] = 0; k.pathI[i] = 0; k.path[i] = null;
  for (let s = 0; s < 2; s++) { k.cst[i * 2 + s] = 0; k.cx[i * 2 + s] = x; k.cy[i * 2 + s] = y; k.cd[i * 2 + s] = 0; }
  return i;
}

/** The claw's shoulder (where it leaves the body and comes back to). */
export function shoulderX(k, i, side) { return k.x[i] + (side ? 1 : -1) * SHOULDER_DX; }
export function shoulderY(k, i) { return k.y[i] + SHOULDER_DY; }

/** Turn every live keeper hostile and hunting now (the aggro moment on this level). */
export function angerAll(k) {
  for (let i = 0; i < k.n; i++) if (k.mode[i] !== KM_DEAD && k.mode[i] !== KM_ANGRY) rouse(k, i);
}
/** A level of an already angry run: every live keeper waits at his post, hostile. */
export function hostileAll(k) {
  for (let i = 0; i < k.n; i++) if (k.mode[i] === KM_CALM) k.mode[i] = KM_WAIT;
}
function rouse(k, i) {
  k.mode[i] = KM_ANGRY; k.roused[i] = 0.7; k.cool[i] = Math.max(k.cool[i], 0.2);
  k.events.push({ type: 'roused', i, x: k.x[i], y: k.y[i] });
}

/**
 * 2026-10-08, the one way a keeper takes a hit: creature-rules.js resolveHit('keeper', src) (dmg < 0: the source's own; the
 * row's resist makes ink and dashes barely scratch him), a knock away from (fromX, fromY) scaled by knockScale, a stun for
 * the heavy ones. SHOPKEEPER RULE (Spelunky): anything may hurt him, but only a hit the octopus is to blame for (byOcto) rouses
 * him and angers the run; the others are marked quiet (main.js handleKeeperEvents skips shopAggro for them). A shove with no
 * damage (the outer ring of a blast) is not a hurt at all. Returns the damage dealt.
 */
export function applyKeeperHit(k, i, src, fromX, fromY, dmg = -1, knockScale = 1, byOcto = true) {
  if (i < 0 || i >= k.n || k.mode[i] === KM_DEAD) return 0;
  const o = resolveHit('keeper', src, dmg);
  if (o.ignore) return 0;
  const dealt = o.dmg, kick = o.knock * Math.max(0, knockScale), stun = knockScale > 0 ? o.stun : 0;
  let dx = k.x[i] - fromX, dy = k.y[i] - fromY;
  const d = Math.hypot(dx, dy);
  if (d < 1e-4) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
  k.vx[i] += dx * kick; k.vy[i] += dy * kick;
  if (stun > 0 || dealt >= 5) { k.stun[i] = Math.max(k.stun[i], stun); k.flash[i] = 0.3; k.tell[i] = 0; }
  else if (dealt > 0) k.shrug[i] = 0.35; // the hit glances off: a little shudder, nothing more
  if (dealt <= 0) return 0;
  k.hp[i] -= dealt;
  const kind = SOURCE_HIT[src] || HIT_HEAVY;
  k.events.push({ type: 'hurt', i, kind, src, dmg: dealt, x: k.x[i], y: k.y[i], quiet: !byOcto });
  if (k.hp[i] <= 0) {
    k.hp[i] = 0; k.mode[i] = KM_DEAD; k.tell[i] = 0;
    for (let s = 0; s < 2; s++) k.cst[i * 2 + s] = 0;
    k.events.push({ type: 'killed', i, x: k.x[i], y: k.y[i], shop: k.shop[i], src, quiet: !byOcto });
  } else if (byOcto && k.mode[i] !== KM_ANGRY) rouse(k, i);
  return dealt;
}

/** Legacy name: hit keeper i with a HIT_* kind (ink, dash, bomb, heavy = a boulder) for `dmg` before his resistance; the octopus's doing. */
export function hitKeeper(k, i, kind, dmg, fromX, fromY) {
  return applyKeeperHit(k, i, HIT_SOURCE[kind] || 'boulder', fromX, fromY, dmg, 1, true);
}

/** The damage.js family adapter for a keepers record. */
export function keeperFamily(k) {
  return {
    name: 'keeper',
    count() { return k.n; },
    view(i, V) {
      if (k.mode[i] === KM_DEAD) return false;
      V.kind = 'keeper'; V.x = k.x[i]; V.y = k.y[i]; V.r = KEEPER_R; V.vx = k.vx[i]; V.vy = k.vy[i]; V.stun = k.stun[i];
      V.shut = false; V.cool = k.hzCool[i]; V.blame = k.blame[i];
      return true;
    },
    apply(i, src, fx, fy, dmg, knockScale, byOcto) { return applyKeeperHit(k, i, src, fx, fy, dmg, knockScale, byOcto); },
    push(i, ax, ay, mode) { if (mode === 'knock') { k.vx[i] += ax; k.vy[i] += ay; } else { k.x[i] += ax; k.y[i] += ay; } },
    setTimers(i, cool, blame) { if (cool >= 0) k.hzCool[i] = cool; if (blame >= 0) k.blame[i] = blame; },
  };
}

/** Every keeper whose body overlaps the circle (x, y, r) takes the hit. Returns the total damage dealt. */
export function hitKeepersAt(k, x, y, r, kind, dmg, fromX = x, fromY = y) {
  let total = 0;
  for (let i = 0; i < k.n; i++) {
    if (k.mode[i] === KM_DEAD) continue;
    if (Math.hypot(k.x[i] - x, k.y[i] - y) > r + KEEPER_R) continue;
    total += hitKeeper(k, i, kind, dmg, fromX, fromY);
  }
  return total;
}

/** A bomb blast at (bx, by) with radius R, by the table's rule (damage.js blast): inside R the bomb, out to 2R a shove. Returns the total dealt. */
export function bombKeepers(k, bx, by, R) {
  let total = 0;
  for (let i = 0; i < k.n; i++) {
    if (k.mode[i] === KM_DEAD) continue;
    const d = Math.max(0, Math.hypot(k.x[i] - bx, k.y[i] - by) - KEEPER_R * 0.5);
    if (d >= R * 2) continue;
    total += applyKeeperHit(k, i, 'bomb', bx, by, d <= R ? -1 : 0, 1 - d / (R * 2), true);
  }
  return total;
}

/** The keeper hits the octopus: KEEPER_HIT_DMG hearts and a hard knock (works with or without hurtOctopus's opts). */
export function keeperStrike(o, x, y) {
  const before = o.hearts;
  if (!octoHit(o, 'claw', x, y, 'shopkeeper')) return false; // creature-rules.js SOURCES.claw: KEEPER_HIT_DMG hearts, KEEPER_HIT_KNOCK
  const want = Math.max(0, before - KEEPER_HIT_DMG);
  if (!o.dead && o.hearts > want) { o.hearts = want; if (want <= 0) killOctopus(o, 'shopkeeper'); }
  return true;
}

// scratch body for the wall resolver (no allocation on the hot path)
const B = { x: 0, y: 0, vx: 0, vy: 0, radius: KEEPER_WALL_R };

function collide(k, i, world) {
  B.x = k.x[i]; B.y = k.y[i]; B.vx = k.vx[i]; B.vy = k.vy[i]; B.radius = KEEPER_WALL_R;
  if (typeof world.wallSegmentsNear === 'function') resolveCircleVsSegments(B, world.wallSegmentsNear(B.x, B.y, B.radius));
  else resolveCircleVsGrid(B, { isSolid: (tx, ty) => world.isSolid(tx, ty) });
  k.x[i] = B.x; k.y[i] = B.y; k.vx[i] = B.vx; k.vy[i] = B.vy;
}

/** Steer keeper i toward (tx, ty): straight when the whole body has a clear line, else along a smoothed A* path. */
function steer(k, i, world, tx, ty, dt, out) {
  const isSolid = (x, y) => world.isSolid(x, y);
  const x = k.x[i], y = k.y[i];
  let clear = hasLineOfSight(isSolid, x, y, tx, ty);
  if (clear) {
    const dx = tx - x, dy = ty - y, l = Math.hypot(dx, dy) || 1, nx = -dy / l * KEEPER_WALL_R, ny = dx / l * KEEPER_WALL_R;
    clear = hasLineOfSight(isSolid, x + nx, y + ny, tx + nx, ty + ny) && hasLineOfSight(isSolid, x - nx, y - ny, tx - nx, ty - ny);
  }
  k.pathT[i] -= dt;
  let ax = tx, ay = ty;
  if (clear) k.path[i] = null;
  else {
    if (k.pathT[i] <= 0 || !k.path[i] || k.pathI[i] >= k.path[i].length) {
      k.pathT[i] = REPATH;
      const p = findSmoothPath(isSolid, x, y, tx, ty);
      if (p && p.length) { k.path[i] = p; k.pathI[i] = 0; }
    }
    const p = k.path[i];
    if (p && p.length) {
      while (k.pathI[i] < p.length - 1 && Math.hypot(p[k.pathI[i]].x - x, p[k.pathI[i]].y - y) < 0.45) k.pathI[i]++;
      const wp = p[Math.min(k.pathI[i], p.length - 1)];
      ax = wp.x; ay = wp.y;
    }
  }
  const dx = ax - x, dy = ay - y, l = Math.hypot(dx, dy) || 1;
  out.x = dx / l; out.y = dy / l;
}
const DIR = { x: 0, y: 0 };

/**
 * One fixed step of every keeper and claw. Hits on the octopus go through keeperStrike (cause 'shopkeeper');
 * a dash into a keeper glances off him (HIT_DASH) and bounces the octopus back.
 */
export function stepKeepers(k, dt, octo, world) {
  const isSolid = (x, y) => world.isSolid(x, y);
  for (let i = 0; i < k.n; i++) {
    const m = k.mode[i];
    k.flash[i] = Math.max(0, k.flash[i] - dt); k.shrug[i] = Math.max(0, k.shrug[i] - dt); k.roused[i] = Math.max(0, k.roused[i] - dt);
    if (m === KM_DEAD) continue;
    const ox = octo.x - k.x[i], oy = octo.y - k.y[i], od = Math.hypot(ox, oy);
    if (Math.abs(ox) > 0.3 && m !== KM_CALM) k.face[i] = ox > 0 ? 1 : -1;
    if (m === KM_CALM || m === KM_WAIT) {
      // at his post: settles back to it after a knock
      k.vx[i] *= 1 / (1 + dt * 6); k.vy[i] *= 1 / (1 + dt * 6);
      k.x[i] += k.vx[i] * dt + (k.homeX[i] - k.x[i]) * Math.min(1, dt * 3);
      k.y[i] += k.vy[i] * dt + (k.homeY[i] - k.y[i]) * Math.min(1, dt * 3);
      if (m === KM_WAIT && !octo.dead && od < WAIT_SIGHT && hasLineOfSight(isSolid, k.x[i], k.y[i], octo.x, octo.y)) rouse(k, i);
    } else if (k.stun[i] > 0) {
      // knocked about by a blast: drifts, no attacks
      k.stun[i] = Math.max(0, k.stun[i] - dt);
      const f = 1 / (1 + dt * 3);
      k.vx[i] *= f; k.vy[i] *= f;
      k.x[i] += k.vx[i] * dt; k.y[i] += k.vy[i] * dt;
      collide(k, i, world);
    } else {
      const sees = !octo.dead && od < CLAW_RANGE + 1 && hasLineOfSight(isSolid, k.x[i], k.y[i], octo.x, octo.y);
      if (k.tell[i] > 0) {
        // the wind-up: he plants himself and pulls the claw back
        k.tell[i] -= dt;
        k.vx[i] *= 1 / (1 + dt * 10); k.vy[i] *= 1 / (1 + dt * 10);
        if (k.tell[i] <= 0) {
          k.tell[i] = 0;
          const c = i * 2 + k.tellSide[i];
          if (k.cst[c] === 0 && !octo.dead) {
            const sx = shoulderX(k, i, k.tellSide[i]), sy = shoulderY(k, i);
            // aimed where the octopus will be when the claw gets there (its velocity now), not where it was at the tell's start
            const lead = Math.min(0.35, Math.hypot(octo.x - sx, octo.y - sy) / CLAW_SPEED);
            const ax = octo.x + (octo.vx || 0) * lead - sx, ay = octo.y + (octo.vy || 0) * lead - sy, al = Math.hypot(ax, ay) || 1;
            k.cst[c] = 1; k.cx[c] = sx; k.cy[c] = sy; k.cvx[c] = ax / al * CLAW_SPEED; k.cvy[c] = ay / al * CLAW_SPEED; k.cd[c] = 0;
            k.launches++;
            k.events.push({ type: 'clawLaunch', i, side: k.tellSide[i], x: sx, y: sy });
          }
          k.cool[i] = CLAW_COOL;
        }
      } else {
        k.cool[i] = Math.max(0, k.cool[i] - dt);
        const side = k.cst[i * 2 + k.nextSide[i]] === 0 ? k.nextSide[i] : k.cst[i * 2 + (1 - k.nextSide[i])] === 0 ? 1 - k.nextSide[i] : -1;
        if (sees && k.cool[i] <= 0 && side >= 0 && od < CLAW_RANGE) {
          k.tell[i] = CLAW_TELL; k.tellSide[i] = side; k.nextSide[i] = 1 - side;
          k.events.push({ type: 'clawTell', i, side, x: k.x[i], y: k.y[i] });
        }
        // pursuit
        if (!octo.dead) {
          steer(k, i, world, octo.x, octo.y, dt, DIR);
          const want = od > 1.2 ? KEEPER_SPEED : KEEPER_SPEED * 0.6;
          const dvx = DIR.x * want - k.vx[i], dvy = DIR.y * want - k.vy[i], dl = Math.hypot(dvx, dvy), a = KEEPER_ACCEL * dt;
          if (dl <= a) { k.vx[i] += dvx; k.vy[i] += dvy; } else { k.vx[i] += dvx / dl * a; k.vy[i] += dvy / dl * a; }
        } else { k.vx[i] *= 1 / (1 + dt * 4); k.vy[i] *= 1 / (1 + dt * 4); }
      }
      k.x[i] += k.vx[i] * dt; k.y[i] += k.vy[i] * dt;
      collide(k, i, world);
    }
    // body contact: a dash glances off him; an angry keeper's body hurts
    if (!octo.dead && Math.hypot(octo.x - k.x[i], octo.y - k.y[i]) < KEEPER_R + (octo.radius || 0.45)) {
      if (octoDashing(octo) && k.shrug[i] <= 0) { // once per dash (the shrug lasts longer than the overlap)
        const nx = (octo.x - k.x[i]) / (od || 1), ny = (octo.y - k.y[i]) / (od || 1);
        hitKeeper(k, i, HIT_DASH, 1, octo.x, octo.y);
        const vn = octo.vx * nx + octo.vy * ny;
        if (vn < 0) { octo.vx -= 1.6 * vn * nx; octo.vy -= 1.6 * vn * ny; } // bounced off his shell
      }
      if (k.mode[i] === KM_ANGRY && k.stun[i] <= 0 && keeperStrike(octo, k.x[i], k.y[i])) k.events.push({ type: 'octoHit', i, how: 'body', x: octo.x, y: octo.y });
    }
  }
  // claws
  for (let c = 0; c < k.n * 2; c++) {
    const st = k.cst[c];
    if (st === 0) continue;
    const i = c >> 1, side = c & 1;
    if (k.mode[i] === KM_DEAD) { k.cst[c] = 0; continue; }
    const sx = shoulderX(k, i, side), sy = shoulderY(k, i);
    if (st === 1) {
      k.cx[c] += k.cvx[c] * dt; k.cy[c] += k.cvy[c] * dt;
      k.cd[c] = Math.hypot(k.cx[c] - sx, k.cy[c] - sy);
      if (!octo.dead && Math.hypot(octo.x - k.cx[c], octo.y - k.cy[c]) < CLAW_R + (octo.radius || 0.45)) {
        if (keeperStrike(octo, k.cx[c], k.cy[c] - k.cvy[c] * 0.02)) k.events.push({ type: 'octoHit', i, how: 'claw', x: octo.x, y: octo.y });
        k.cst[c] = 2;
      } else if (k.cd[c] >= CLAW_RANGE || isSolid(k.cx[c], k.cy[c])) k.cst[c] = 2;
    } else {
      const dx = sx - k.cx[c], dy = sy - k.cy[c], d = Math.hypot(dx, dy);
      const step = CLAW_BACK_SPEED * dt;
      if (d <= step + 0.05) { k.cst[c] = 0; k.cx[c] = sx; k.cy[c] = sy; k.cd[c] = 0; }
      else { k.cx[c] += dx / d * step; k.cy[c] += dy / d * step; k.cd[c] = d - step; }
    }
  }
}

/** Whether a later level of an angry run has a keeper waiting by its exit (deterministic per dive seed and level). */
export function exitGuardWaits(seed, levelIndex) {
  return mulberry32(hashSeed2(hashSeed2(seed >>> 0, levelIndex >>> 0), 0x6a7d))() < GUARD_CHANCE;
}

/**
 * Where a guard waits by the exit whirlpool: open water 2-4 tiles to the side of it (or above), with room for his body
 * (the 3x3 around the spot is water) and a straight line to the whirlpool. Returns {x, y} or null.
 */
export function guardSpot(tileAt, ex, ey) {
  const free = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(x + dx, y + dy) !== 0) return false; return true; };
  const solid = (x, y) => tileAt(x, y) !== 0;
  const cands = [[3, 0], [-3, 0], [2, 0], [-2, 0], [3, -1], [-3, -1], [4, 0], [-4, 0], [2, -2], [-2, -2], [0, -3], [3, -2], [-3, -2], [4, -1], [-4, -1], [0, -4]];
  for (const [dx, dy] of cands) {
    const x = ex + dx, y = ey + dy;
    if (free(x, y) && hasLineOfSight(solid, x + 0.5, y + 0.5, ex + 0.5, ey + 0.5)) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}
