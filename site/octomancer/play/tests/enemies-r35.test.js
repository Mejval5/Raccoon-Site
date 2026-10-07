// Round 35: enemy patterns with telegraphs (piranha, crab, cannon, manta, urchin, horns, eel, Beholder), the bugs
// from octomancer-web/QA-ENEMIES.md as regressions, the round-34 review fixes (idle toss, bomb on the head, bombs
// stick to ceilings, blast reaches hanging rocks, rubble spread, enemies push bombs, one hit per falling rock,
// touch controls on the canvas, blast and stun drawing), and spawn rules over generated levels.
import {
  createEnemies, PS_PATROL, PS_WINDUP, PS_LUNGE, PS_RECOVER, CS_WALK, CS_PAUSE, CS_SNAP, CS_COOL,
  CN_TRACK, CN_CHARGE, CN_RELOAD, MA_GLIDE, MA_TELL, MA_DIVE, MA_RISE,
  PIRANHA_WINDUP, PIRANHA_LUNGE_SPEED, PIRANHA_RECOVER, CRAB_PAUSE, CRAB_SNAP, CANNON_WINDUP, CANNON_RELOAD, MANTA_TELL, URCHIN_PULSE_PERIOD, HIT_STOP,
} from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, LEVEL_W, LEVEL_H } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps, PK_BOMB, PK_RUBBLE, PS_HELD, PS_FREE } from '../js/props.js';
import { createBombs, spawnRubble, IDLE_TOSS_X, IDLE_TOSS_Y } from '../js/bomb.js';
import { createHazards, makeHazardRecord, EEL_CHARGE_AT, EEL_FIRE_AT, HZ_EEL } from '../js/hazards.js';
import { buildLevelSpawns, ENEMY_MIN_GAP } from '../js/level-spawns.js';
import { drawEnemies, drawBombs } from '../js/enemy-draw.js';
import { createTouchUI } from '../js/touch-ui.js';
import { createInput } from '../js/input.js';
import { mulberry32 } from '../js/rng.js';
import { loadRoomsJson } from './rooms.test.js';

const DT = 0.02;
const OPEN = { isSolid: () => false, breakTile() {} };
function calm(o) { o.invulnTimer = 1e9; return o; }
/** A grid world from a solid test; resolveCircleVsGrid collides against it (no wall segments). */
const grid = (fn) => ({ isSolid: (x, y) => fn(Math.floor(x), Math.floor(y)), breakTile() {} });

function room(w, h, fn) {
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = (x < 2 || y < 2 || x >= w - 2 || y >= h - 2 || fn(x, y)) ? 1 : 0;
  return createLevelWorld(1, 0, { level: { tiles, w, h, startX: 4, startY: 4, exitX: -1, exitY: -1, spawns: [], walls: [] } });
}

/** Run `secs` of enemy updates, calling cb(i, enemy-list) after each step. */
function runEnemies(en, o, world, secs, cb, t0 = 0, props = null) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) { en.update(DT, t0 + i * DT, o, world, [], props); if (cb) cb(i); }
}

/** Recording canvas context: any method call is logged, properties can be set. */
function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push(k); return k === 'createRadialGradient' || k === 'createLinearGradient' ? grad : undefined; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const CAM = { x: 0, y: 0, pxPerUnit: 50 };
const w2s = (cam, cw, ch, x, y) => ({ x: cw / 2 + (x - cam.x) * cam.pxPerUnit, y: ch / 2 + (y - cam.y) * cam.pxPerUnit });

export async function runEnemyR35Tests(assert) {
  setDefaultBank(createRoomBank(await loadRoomsJson()));
  const rand = Math.random;

  // ================================================================ piranha
  {
    const o = calm(createOctopus(3, 2)); const en = createEnemies(); const p = en.spawnAt('piranha', 0, 0);
    const seq = []; let windSteps = 0, recSteps = 0, tellMax = 0, speedSeen = 0; const lunge = []; let first = true;
    runEnemies(en, o, OPEN, 8, () => {
      if (seq[seq.length - 1] !== p.st) seq.push(p.st);
      if (!first) return;
      if (p.st === PS_WINDUP) { windSteps++; tellMax = Math.max(tellMax, p.tell); }
      if (p.st === PS_LUNGE) { lunge.push([p.x, p.y]); speedSeen = Math.max(speedSeen, Math.hypot(p.vx, p.vy)); }
      if (p.st === PS_RECOVER) recSteps++;
      if (p.st === PS_PATROL && recSteps > 0) first = false;
    });
    assert('piranha: idle drift, then a wind-up, a lunge and a recovery, in that order', seq.slice(0, 4).join() === [PS_PATROL, PS_WINDUP, PS_LUNGE, PS_RECOVER].join());
    assert(`piranha: the wind-up lasts ${PIRANHA_WINDUP} s with a growing tell (${(windSteps * DT).toFixed(2)} s, tell ${tellMax.toFixed(2)})`, Math.abs(windSteps * DT - PIRANHA_WINDUP) <= 0.05 && tellMax > 0.9);
    assert(`piranha: the recovery lasts ${PIRANHA_RECOVER} s (${(recSteps * DT).toFixed(2)} s)`, Math.abs(recSteps * DT - PIRANHA_RECOVER) <= 0.05);
    assert('piranha: the lunge runs at its set speed along a straight line toward where the octopus was', (() => {
      if (lunge.length < 3) return false;
      const [x0, y0] = lunge[0], [x1, y1] = lunge[lunge.length - 1];
      let off = 0; for (const [x, y] of lunge) off = Math.max(off, Math.abs((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / (Math.hypot(x1 - x0, y1 - y0) || 1));
      return Math.abs(speedSeen - PIRANHA_LUNGE_SPEED) < 0.01 && off < 0.02 && (x1 - x0) > 0 && (y1 - y0) > 0;
    })());
  }
  {
    // no notice through rock; a notice needs range
    const o = calm(createOctopus(5, 0)); const en = createEnemies(); const p = en.spawnAt('piranha', 0, 0);
    const walled = grid((x, y) => x === 2);
    let wound = false; runEnemies(en, o, walled, 6, () => { if (p.st === PS_WINDUP || p.st === PS_LUNGE) wound = true; });
    const o2 = calm(createOctopus(14, 0)); const en2 = createEnemies(); const p2 = en2.spawnAt('piranha', 0, 0);
    let far = false; runEnemies(en2, o2, OPEN, 3, () => { if (p2.st === PS_WINDUP) far = true; }); // 14 tiles: its patrol (+-5) never brings it within the notice range (6)
    assert('piranha: it does not notice an octopus behind rock, or one out of range', !wound && !far);
  }
  {
    // QA B1: piranhas used to freeze against a wall rim; they must patrol and turn
    const world = grid((x, y) => x < 0 || x >= 14);
    const o = createOctopus(7, 60); const en = createEnemies();
    const p = en.spawnAt('piranha', 7, 0); const q = en.spawnAt('piranha', 11, 4);
    let minX = 99, maxX = -99, stuck = 0, maxStuck = 0, lastX = p.x, qMin = 99;
    runEnemies(en, o, world, 30, () => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); qMin = Math.min(qMin, q.x);
      stuck = Math.abs(p.x - lastX) < 0.002 ? stuck + DT : 0; maxStuck = Math.max(maxStuck, stuck); lastX = p.x;
    });
    assert(`QA B1: a piranha patrols wall to wall and turns at the rim (x ${minX.toFixed(1)}..${maxX.toFixed(1)}, longest stand-still ${maxStuck.toFixed(2)} s)`, minX < 3.5 && maxX > 10.5 && maxStuck < 0.6);
    assert(`QA B1: a piranha that starts at the rim turns away from it instead of hanging there (min x ${qMin.toFixed(1)})`, qMin < 10.5 && q.x < 12.7);
  }
  {
    // QA B3: no chase through a narrow passage any more (it lunges only in a clear line), and never sits in rock
    const world = grid((x, y) => y < 0 || y > 3 || (x === 5 && y !== 2));
    const o = calm(createOctopus(9, 2.5)); const en = createEnemies(); const p = en.spawnAt('piranha', 1.5, 1.5);
    let inRock = false; runEnemies(en, o, world, 20, () => { if (world.isSolid(p.x, p.y)) inRock = true; });
    assert('QA B3: a piranha near a one-tile gap never ends up inside rock', !inRock);
  }

  // ================================================================ crab
  {
    const floor = grid((x, y) => y >= 1);
    const o = calm(createOctopus(0.9, 0.2)); const en = createEnemies(); const c = en.spawnAt('crab', 0, 0.45, 'floor');
    const seq = [c.st]; let pauseSteps = 0, snapSteps = 0, cycle = 0;
    c.dir = 1;
    runEnemies(en, o, floor, 4, () => {
      if (seq[seq.length - 1] !== c.st) { seq.push(c.st); if (c.st === CS_WALK) cycle++; }
      if (cycle === 0) { if (c.st === CS_PAUSE) pauseSteps++; if (c.st === CS_SNAP) snapSteps++; }
    });
    assert('crab: the octopus within 1.5 tiles makes it pause, snap, then cool down, then walk again', seq.slice(0, 5).join() === [CS_WALK, CS_PAUSE, CS_SNAP, CS_COOL, CS_WALK].join());
    assert(`crab: pause ${CRAB_PAUSE} s, snap ${CRAB_SNAP} s (${(pauseSteps * DT).toFixed(2)} / ${(snapSteps * DT).toFixed(2)})`, Math.abs(pauseSteps * DT - CRAB_PAUSE) <= 0.05 && Math.abs(snapSteps * DT - CRAB_SNAP) <= 0.05);
    const o3 = createOctopus(0.9, 0.2); const en3 = createEnemies(); const c3 = en3.spawnAt('crab', 0, 0.45, 'floor'); c3.dir = 1;
    let hurtAt = -1; runEnemies(en3, o3, floor, 1.5, (i) => { if (hurtAt < 0 && o3.hearts < 3) hurtAt = i * DT; });
    assert(`crab: it hurts the octopus (${hurtAt.toFixed(2)} s in)`, hurtAt >= 0);
  }
  {
    // a resting bomb ahead makes it turn instead of walking through
    const floor = grid((x, y) => y >= 1);
    const props = createProps(); const o = createOctopus(30, 0); const en = createEnemies();
    const c = en.spawnAt('crab', 0, 0.45, 'floor'); c.dir = 1; c.speed = 1.2;
    const b = props.add(PK_BOMB, 2, 0.6, 0, 0, { timer: 99 }); props.hold(b, -5, -5);
    let maxX = -9; runEnemies(en, o, floor, 6, () => { maxX = Math.max(maxX, c.x); }, 0, props);
    assert(`review 7: a crab turns round at a resting bomb instead of walking through it (got to x ${maxX.toFixed(2)}, bomb at 2)`, maxX < 1.25 && c.dir === -1);
    // and a bomb pushed into a moving enemy is shoved out of it
    const p2 = createProps(); const wd = grid(() => false);
    const bb = p2.add(PK_BOMB, 5.1, 5, 0, 0, { timer: 99 });
    const fake = [{ x: 5, y: 5, radius: 0.42, vx: 1, vy: 0, moving: true, dead: false, kind: 'crab' }];
    p2.step(DT, wd, null, fake);
    assert('review 7: a moving enemy and a bomb never overlap (the bomb is pushed out)', Math.hypot(p2.data.x[bb] - 5, p2.data.y[bb] - 5) >= 0.42 + 0.32 + 0.04);
  }

  // ================================================================ cannon
  {
    const o = createOctopus(0, -4); calm(o); const en = createEnemies(); const c = en.spawnAt('cannon', 0, 0, 'floor');
    c.st = CN_RELOAD; c.t = 0.1; // ready almost at once; the octopus is straight above
    const shotsAt = []; let chargeSteps = 0, maxTurn = 0, last = c.aim; let firstCharge = -1;
    runEnemies(en, o, OPEN, 8, (i) => {
      if (en.events.some((e) => e.type === 'shotFired')) shotsAt.push(i * DT);
      if (c.st === CN_CHARGE) { chargeSteps++; if (firstCharge < 0) firstCharge = i * DT; }
      maxTurn = Math.max(maxTurn, Math.abs(c.aim - last)); last = c.aim;
    });
    assert(`cannon: a 0.6 s glow telegraph before each shot (${(chargeSteps / Math.max(1, shotsAt.length) * DT).toFixed(2)} s per shot)`, shotsAt.length >= 2 && Math.abs(chargeSteps / shotsAt.length * DT - CANNON_WINDUP) < 0.08);
    assert(`cannon: 2 s reload between shots (${shotsAt.length >= 2 ? (shotsAt[1] - shotsAt[0]).toFixed(2) : '-'} s apart, 0.6 s of it the glow)`, shotsAt.length >= 2 && Math.abs(shotsAt[1] - shotsAt[0] - (CANNON_RELOAD + CANNON_WINDUP)) < 0.12);
    assert('cannon: the barrel turns slowly (never more than its turn rate per step)', maxTurn <= 1.2 * DT + 1e-9);
  }
  {
    // QA F1: it does not fire the instant the octopus walks into range; it has to turn, then glow
    const en = createEnemies(); const c = en.spawnAt('cannon', 0, 0, 'floor');
    const o = createOctopus(30, -3); // out of range for 12 s: the reload must not run negative
    runEnemies(en, o, OPEN, 12);
    o.x = 0; o.y = -5; calm(o);
    let first = -1; runEnemies(en, o, OPEN, 3, (i) => { if (first < 0 && en.shots().length) first = i * DT; });
    assert(`QA F1: no shot in the first 0.5 s after the octopus enters range (first shot ${first.toFixed(2)} s)`, first >= 0.5);
    assert('QA F1: the reload timer never runs negative while idle', c.t >= -1e-9);
  }
  {
    // QA F2: no firing through rock
    const wall = grid((x, y) => y === -2);
    const o = calm(createOctopus(0, -5)); const en = createEnemies(); en.spawnAt('cannon', 0, 0, 'floor');
    let fired = 0; runEnemies(en, o, wall, 10, () => { fired += en.events.filter((e) => e.type === 'shotFired').length; });
    assert('QA F2: a cannon behind rock never shoots', fired === 0);
    // and a cannon does not aim into its own floor
    const o2 = calm(createOctopus(0, 4)); const en2 = createEnemies(); const c2 = en2.spawnAt('cannon', 0, 0, 'floor');
    runEnemies(en2, o2, OPEN, 6);
    assert('cannon: a floor cannon never turns toward a target below its own surface', Math.sin(c2.aim) <= 0.2);
  }

  // ================================================================ manta
  {
    const o = calm(createOctopus(0.3, 4)); const en = createEnemies(); const m = en.spawnAt('manta', 0, 0, 'open'); m.cool = 0; m.dir = 1;
    const seq = [m.st]; let tellSteps = 0, vyMax = 0, diveStart = null, diveEnd = null, t2 = null;
    runEnemies(en, o, OPEN, 12, (i) => {
      if (seq[seq.length - 1] !== m.st) { seq.push(m.st); if (m.st === MA_DIVE) diveStart = i * DT; if (m.st === MA_RISE && diveStart !== null && diveEnd === null) diveEnd = i * DT; if (m.st === MA_TELL && seq.length > 3 && t2 === null) t2 = i * DT; }
      if (m.st === MA_TELL) tellSteps++;
      if (m.st === MA_DIVE) vyMax = Math.max(vyMax, m.vy);
    });
    assert('manta: glide, then tell, dive, rise and glide again', seq.slice(0, 4).join() === [MA_GLIDE, MA_TELL, MA_DIVE, MA_RISE].join() && seq.includes(MA_GLIDE, 3));
    assert(`manta: a ${MANTA_TELL} s telegraph before the dive (${(tellSteps * DT / Math.max(1, seq.filter((s) => s === MA_TELL).length)).toFixed(2)} s each)`, Math.abs(tellSteps * DT / seq.filter((s) => s === MA_TELL).length - MANTA_TELL) < 0.08);
    assert('manta: the dive is fast and aimed down', vyMax > 5);
    assert('manta: 3 s cooldown between dives', t2 === null || (diveEnd !== null && t2 - diveEnd >= 2.5));
    const o2 = createOctopus(0, -6); const en2 = createEnemies(); const m2 = en2.spawnAt('manta', 0, 0, 'open'); m2.cool = 0;
    let dove = false; runEnemies(en2, o2, OPEN, 8, () => { if (m2.st === MA_TELL || m2.st === MA_DIVE) dove = true; });
    assert('manta: it does not dive at an octopus above it', !dove);
  }
  {
    // QA B4: a manta turns at the side wall instead of freezing against it
    const world = grid((x, y) => x < 0 || x >= 12);
    const o = createOctopus(6, 60); const en = createEnemies(); const m = en.spawnAt('manta', 6.5, 5, 'open');
    let minX = 99, maxX = -99, stuck = 0, maxStuck = 0, lastX = m.x, inRock = false;
    runEnemies(en, o, world, 40, () => {
      minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x);
      stuck = Math.abs(m.x - lastX) < 0.002 ? stuck + DT : 0; maxStuck = Math.max(maxStuck, stuck); lastX = m.x;
      if (m.x - 1.4 < 0 || m.x + 1.4 > 12) inRock = true;
    });
    assert(`QA B4: a manta turns at the wall (x ${minX.toFixed(1)}..${maxX.toFixed(1)}, longest stand-still ${maxStuck.toFixed(2)} s) and its wings never enter rock`, maxStuck < 0.6 && minX < 3 && maxX > 9 && !inRock);
  }

  // ================================================================ urchin, horns, eel
  {
    const o = createOctopus(30, 30); const en = createEnemies();
    const u = en.spawnAt('urchin', 0, 0, 'floor'), h = en.spawnAt('horns', 4, 0, 'floor');
    let uMin = 9, uMax = 0, hMin = 9, hMax = 0;
    runEnemies(en, o, grid(() => false), URCHIN_PULSE_PERIOD, () => { uMin = Math.min(uMin, u.pulse); uMax = Math.max(uMax, u.pulse); hMin = Math.min(hMin, h.radius / h.r0); hMax = Math.max(hMax, h.radius / h.r0); });
    assert(`urchin and horns: a slow spike pulse (pulse ${uMin.toFixed(2)}..${uMax.toFixed(2)}, horns radius x${hMin.toFixed(2)}..${hMax.toFixed(2)} per ${URCHIN_PULSE_PERIOD} s)`, uMin < 0.1 && uMax > 0.9 && hMax - hMin > 0.15 && u.x === 0 && h.x === 4);
  }
  {
    assert(`eel: the crackle before the ring lasts 0.5 s (${(EEL_FIRE_AT - EEL_CHARGE_AT).toFixed(2)})`, Math.abs(EEL_FIRE_AT - EEL_CHARGE_AT - 0.5) < 1e-9);
    const rows = []; for (let y = 0; y < 14; y++) rows.push(y === 0 || y === 13 ? '#'.repeat(10) : '#........#');
    const w = 10, h = 14; const t = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = rows[y][x] === '#' ? 1 : 0;
    const rec = makeHazardRecord('eel', 5.5, 6.5, 0, 0, t, w, h);
    const hz = createHazards(); hz.add(rec);
    const world = { isSolid: (x, y) => t[Math.floor(y) * w + Math.floor(x)] !== 0, tileAt: (x, y) => t[y * w + x] };
    const o = calm(createOctopus(2, 3)); let glowSteps = 0, ringAfter = -1, glowEnd = -1;
    for (let i = 0; i < 400; i++) {
      hz.update(DT, i * DT, o, world, null);
      if (hz.data.state[0] === 1) { glowSteps++; if (ringAfter < 0) glowEnd = i; }
      if (ringAfter < 0 && hz.data.r[0] > 0) ringAfter = i;
    }
    assert(`eel: 0.5 s of crackle (${(glowSteps * DT / 2).toFixed(2)} s per shock) directly before the shock ring`, Math.abs(glowSteps * DT / 2 - 0.5) < 0.06 && ringAfter - glowEnd <= 2);
  }

  // ================================================================ hit-stop, stun, determinism
  {
    const o = createOctopus(5, 5); o.vx = 9; const en = createEnemies(); const p = en.spawnAt('piranha', 5.1, 5);
    en.update(DT, 0, o, OPEN, []);
    const ev = en.events.find((e) => e.type === 'hitStop');
    assert('dash hit: the enemy dies, a 60 ms hit-stop is requested and its white ghost stays on screen', p.dead && ev && Math.abs(ev.dur - HIT_STOP) < 1e-9 && en.all().some((e) => e.ghost && e.kind === 'piranha' && e.hitFlash > 1));
    for (let i = 0; i < 4; i++) en.update(DT, 0, o, OPEN, []);
    assert('dash hit: the ghost is gone after the hit-stop', !en.all().some((e) => e.ghost));
  }
  {
    const o = createOctopus(30, 30); const en = createEnemies();
    const p = en.spawnAt('piranha', 3, 0), c = en.spawnAt('cannon', 5, 0, 'floor'), cr = en.spawnAt('crab', 7, 0.45, 'floor'), u = en.spawnAt('urchin', 9, 0, 'floor');
    en.knockInRadius(4, 0, 6, 12, 0.9);
    assert('blast: a moving enemy is thrown, flashes and is stunned; a bolted-down cannon is stunned; an urchin is untouched',
      p.stun > 0.89 && Math.hypot(p.kvx, p.kvy) > 3 && p.hitFlash > 0 && c.stun > 0.89 && c.kvx === 0 && u.stun === 0 && cr.stun > 0 && cr.kvy === 0 && Math.abs(cr.kvx) > 1);
    const x0 = p.x; runEnemies(en, o, OPEN, 0.5);
    assert('blast: while stunned it drifts and does not act', Math.abs(p.x - x0) > 0.3 && p.st === PS_PATROL && p.tell === 0);
    runEnemies(en, o, OPEN, 0.6);
    assert('blast: after the stun it takes its pattern up again (and the cannon reloads first)', p.stun === 0 && c.stun === 0 && c.st === CN_RELOAD);
    const ctx = recCtx(); p.stun = 0.5; cr.stun = 0.5;
    drawEnemies(ctx, CAM, w2s, 800, 600, en.all(), [], 1.2, 1);
    assert('blast: a stunned enemy is drawn with orbiting stars', ctx.calls.filter((k) => k === 'closePath').length >= 6);
  }
  {
    // F4: nothing consults Math.random: the same spawn always replays the same way
    Math.random = () => { throw new Error('Math.random in enemies'); };
    let ok = true, sig = [];
    try {
      for (let rep = 0; rep < 2; rep++) {
        const o = createOctopus(30, 30); const en = createEnemies(); const world = grid((x, y) => y > 6 || x < -8 || x > 8);
        const a = en.spawnAt('piranha', 1, 3), b = en.spawnAt('crab', -2, 5.5, 'floor'), c = en.spawnAt('manta', 0, 1, 'open');
        runEnemies(en, o, world, 10);
        sig.push([a.x, a.y, a.dir, b.x, b.dir, b.variant, c.x, c.y].map((v) => typeof v === 'number' ? v.toFixed(5) : v).join());
      }
    } catch (e) { ok = false; }
    Math.random = rand;
    assert('QA F4: enemy behaviour is seed-deterministic (no Math.random; two identical spawns end identically)', ok && sig[0] === sig[1]);
  }

  // ================================================================ Beholder spawn, bombs, rocks on real worlds
  {
    // QA B2: spawn at an open cell off screen that is reachable, then home in
    let bad = 0, total = 0, arrived = 0; const badAt = [];
    for (const [seed, lvl] of [[3, 0], [7, 1], [11, 2], [6, 0]]) {
      const world = createLevelWorld(seed, lvl);
      const L = world.level, W = LEVEL_W;
      for (const [fx, fy] of [[0.5, 0.15], [0.5, 0.5], [0.3, 0.8]]) {
        // an open cell near that fraction of the level
        let ox = -1, oy = -1;
        for (let r = 0; r < 20 && ox < 0; r++) for (let dy = -r; dy <= r && ox < 0; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(W * fx) + dx, y = Math.floor(LEVEL_H * fy) + dy;
          let open9 = x > 4 && x < W - 4 && y > 4 && y < LEVEL_H - 4;
          for (let ky = -1; ky <= 1 && open9; ky++) for (let kx = -1; kx <= 1; kx++) if (world.isSolid(x + kx + 0.5, y + ky + 0.5)) { open9 = false; break; }
          if (open9) { ox = x + 0.5; oy = y + 0.5; break; }
        }
        total++;
        const o = createOctopus(ox, oy);
        const en = createEnemies();
        en.update(DT, 119.9, o, world, []); en.update(DT, 120, o, world, []);
        const b = en.beholder();
        if (!b || world.isSolid(b.x, b.y) || Math.hypot(b.x - o.x, b.y - o.y) < 12.9) { bad++; badAt.push(seed + '/' + lvl + '@' + ox + ',' + oy + (b ? ' b' + b.x.toFixed(1) + ',' + b.y.toFixed(1) : '')); continue; }
        let d0 = Math.hypot(b.x - o.x, b.y - o.y), best = d0;
        for (let i = 0; i < 1500; i++) { en.update(DT, 120 + i * DT, o, world, []); best = Math.min(best, Math.hypot(b.x - o.x, b.y - o.y)); if (o.dead) break; }
        if (o.dead || best < d0 - 6) arrived++; else badAt.push('noarrive ' + seed + '/' + lvl + '@' + ox + ',' + oy + ' b' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ' d0 ' + d0.toFixed(1) + ' best ' + best.toFixed(1));
      }
    }
    assert(`QA B2: the Beholder spawns on an open cell at least 13 tiles away and closes in (${total - bad}/${total} valid spawns, ${arrived} arrived${badAt.length ? ', bad ' + badAt.join(' ') : ''})`, bad === 0 && arrived === total);
  }
  {
    // review 2: a throw with no direction goes forward and down, never up, and never rests on the octopus's head
    const world = room(40, 40, (x, y) => y >= 30);
    const props = createProps(); const bombs = createBombs(props); const o = createOctopus(20.5, 12.5);
    o.throwDir = -1; bombs.place(o, 20, 12.7, null);
    const id = bombs.list()[0].pid; const vx = props.data.vx[id], vy = props.data.vy[id];
    assert(`review 2: a no-direction toss goes the last swim direction and down, never up (v ${vx.toFixed(1)}, ${vy.toFixed(1)})`, vx < -1 && vy > 0.5 && Math.abs(Math.abs(vx / vy) - IDLE_TOSS_X / IDLE_TOSS_Y) < 0.01);
    let onHead = false, ends = null;
    for (let i = 0; i < 135; i++) {
      props.step(DT, world, o); bombs.update(DT, world, o, { killInRadius() { return 0; }, knockInRadius() { return 0; } });
      const b = bombs.list()[0]; if (b && !b.exploded && b.y < o.y - 0.2 && Math.abs(b.x - o.x) < 0.8) onHead = true;
      if (b && b.exploded && !ends) ends = [b.x, b.y];
    }
    assert('review 2: the idle octopus never has a bomb sitting on its head, and the bomb goes off away from it', !onHead && ends && Math.hypot(ends[0] - o.x, ends[1] - o.y) > 1);
    // a bomb that did land on the octopus is nudged sideways until it rolls off
    const p2 = createProps(); const o2 = createOctopus(10, 10); const bb = p2.add(PK_BOMB, 10, 10 - 0.78, 0, 0, { timer: 99 });
    for (let i = 0; i < 150; i++) p2.step(DT, world, o2);
    assert(`review 2: a bomb resting on the octopus rolls off it (now ${(p2.data.x[bb] - 10).toFixed(2)} sideways)`, Math.abs(p2.data.x[bb] - 10) > 0.6);
  }
  {
    // review 8: a bomb thrown up against a ceiling sticks to it; its blast frees a hanging rock beside it; a blast within reach frees a rock too
    const world = room(30, 30, (x, y) => y < 8 || y >= 26);
    const props = createProps(); const bombs = createBombs(props); const o = createOctopus(10.5, 20.5);
    bombs.place(o, 15.5, 10.4, { x: 0, y: -1 }); // a throw reaches about 3 tiles up (drag and sink)
    const id = bombs.list()[0].pid; let stuckY = 0, held = false;
    for (let i = 0; i < 100; i++) { props.step(DT, world, null); if (props.data.state[id] === PS_HELD) { held = true; stuckY = props.data.y[id]; break; } }
    for (let i = 0; i < 40; i++) props.step(DT, world, null);
    assert(`review 8: a bomb thrown up at the ceiling sticks to it (y ${stuckY.toFixed(2)} below the ceiling at 8)`, held && props.data.state[id] === PS_HELD && Math.abs(props.data.y[id] - stuckY) < 0.01 && stuckY < 8.6);
    const hz = createHazards(props); const rec = makeHazardRecord('rock', 17.5, 8.5, 0, 1, world.level.tiles, world.level.w, world.level.h);
    const ri = hz.add(rec);
    const en = { killInRadius() { return 0; }, knockInRadius() { return 0; } };
    let fell = false;
    for (let i = 0; i < 200; i++) {
      props.step(DT, world, o); bombs.update(DT, world, o, en);
      hz.update(DT, i * DT, o, world, null);
      if (hz.data.state[ri] >= 2) { fell = true; break; }
    }
    assert('review 8: the blast of a bomb stuck to the ceiling brings the hanging rock beside it down', fell);
    // a blast within reach (but not touching its ceiling tile) frees it with hazards.blast
    const props2 = createProps(); const hz2 = createHazards(props2); const w2 = room(30, 30, (x, y) => y < 8 || y >= 26);
    const r2 = hz2.add(makeHazardRecord('rock', 17.5, 8.5, 0, 1, w2.level.tiles, w2.level.w, w2.level.h));
    const far = hz2.blast(17.5, 18, 4), near = hz2.blast(17.5, 11.5, 4);
    assert('review 8: hazards.blast frees a rock only within reach', far === 0 && near === 1 && props2.data.state[hz2.data.pid[r2]] === PS_FREE);
  }
  {
    // review 4: rubble from one removed tile spreads out
    const props = createProps(); const r = mulberry32(5);
    spawnRubble(props, [10, 10], 1, 10.5, 11.5, r);
    const ids = props.ofKind(PK_RUBBLE, []);
    let minStart = 9, same = 0;
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      minStart = Math.min(minStart, Math.hypot(props.data.x[ids[a]] - props.data.x[ids[b]], props.data.y[ids[a]] - props.data.y[ids[b]]));
      if (Math.abs(props.data.vx[ids[a]] - props.data.vx[ids[b]]) < 0.01 && Math.abs(props.data.vy[ids[a]] - props.data.vy[ids[b]]) < 0.01) same++;
    }
    assert(`review 4: the 4 chips of a one-tile blast start at different spots with different velocities (${ids.length} chips, closest start ${minStart.toFixed(2)})`, ids.length === 4 && minStart > 0.04 && same === 0);
    const world = room(30, 30, (x, y) => y >= 14);
    const p2 = createProps(); spawnRubble(p2, [10, 12], 1, 10.5, 12.5, mulberry32(9));
    for (let i = 0; i < 60; i++) p2.step(DT, world, null);
    const ids2 = p2.ofKind(PK_RUBBLE, []); let minD = 9;
    for (let a = 0; a < ids2.length; a++) for (let b = a + 1; b < ids2.length; b++) minD = Math.min(minD, Math.hypot(p2.data.x[ids2[a]] - p2.data.x[ids2[b]], p2.data.y[ids2[a]] - p2.data.y[ids2[b]]));
    assert(`review 4: settled rubble does not pile onto one point (closest pair ${minD.toFixed(2)})`, ids2.length === 4 && minD > 0.12);
  }
  {
    // QA B5: one hit per falling rock, and the knock is sideways
    const world = room(30, 30, (x, y) => y < 8 || y >= 24);
    const props = createProps(); const hz = createHazards(props);
    const ri = hz.add(makeHazardRecord('rock', 12.5, 8.5, 0, 1, world.level.tiles, world.level.w, world.level.h));
    const o = createOctopus(13.2, 13.5); let vxMax = 0, vyAtHit = 0; let minHearts = 3; // under the rock's edge: a straight hit from above flattens it (damage.test.js), the side brush is one hit
    for (let i = 0; i < 300; i++) {
      const before = o.hearts;
      o.x += o.vx * DT; o.y += o.vy * DT; o.vx *= 0.97; o.vy *= 0.97;
      props.step(DT, world, o); hz.update(DT, i * DT, o, world, null);
      if (o.hearts < before) { vxMax = Math.abs(o.vx); vyAtHit = o.vy; }
      minHearts = Math.min(minHearts, o.hearts);
    }
    assert(`QA B5: a falling rock costs one heart, not two (hearts left ${minHearts})`, minHearts === 2);
    assert(`QA B5: the knock is sideways, out from under it (vx ${vxMax.toFixed(1)}, vy ${vyAtHit.toFixed(1)})`, vxMax > 3 && Math.abs(vyAtHit) < vxMax * 0.5);
  }

  // ================================================================ spawn rules over generated levels
  {
    let enemiesSeen = 0, tooClose = 0, inRock = 0, unsupported = 0, nearStart = 0, shopHits = 0, gaps = 0;
    for (let seed = 1; seed <= 14; seed++) for (let lvl = 0; lvl < 3; lvl++) {
      const world = createLevelWorld(seed, lvl);
      const L = world.level;
      const sp = buildLevelSpawns(L, seed, lvl).spawns.filter((s) => s.type === 'enemy-slot');
      const sx = L.startX + 0.5, sy = L.startY + 0.5;
      for (let i = 0; i < sp.length; i++) {
        const s = sp[i]; enemiesSeen++;
        if (Math.hypot(s.x - sx, s.y - sy) < 7) nearStart++;
        if (world.isSolid(s.x, s.y)) inRock++;
        if (s.placement === 'floor' && !world.isSolid(s.x, s.y + 0.9)) unsupported++;
        if (s.placement === 'ceiling' && !world.isSolid(s.x, s.y - 0.9)) unsupported++;
        if (s.placement === 'wall' && !world.isSolid(s.x + s.wallDir * 0.9, s.y)) unsupported++;
        for (let j = i + 1; j < sp.length; j++) if (Math.hypot(sp[j].x - s.x, sp[j].y - s.y) < ENEMY_MIN_GAP) tooClose++;
        if (L.shop && ['piranha', 'manta'].includes(s.kind)) {
          const sh = L.shop; const dx = Math.max(sh.x0 - s.x, s.x - sh.x1, 0), dy = Math.max(sh.y0 - s.y, s.y - sh.y1, 0);
          if (Math.hypot(dx, dy) < 6.5) shopHits++;
        }
      }
    }
    assert(`spawns (${enemiesSeen} enemies, 14 seeds x 3 levels): none in rock, none floating or unsupported, none within 7 tiles of the start, none closer than ${ENEMY_MIN_GAP} tiles to another`, enemiesSeen > 40 && inRock === 0 && unsupported === 0 && nearStart === 0 && tooClose === 0);
    assert('spawns: no patrolling piranha or manta spawns level with the shop room', shopHits === 0);
  }

  // ================================================================ touch controls and drawing
  {
    // QA / review 1: the stick and buttons listen on the canvas (the #touch-ui layer ignores pointers)
    const root = document.createElement('div'), canvas = document.createElement('div');
    document.body.appendChild(canvas); document.body.appendChild(root);
    const input = createInput(null); const ui = createTouchUI(root, input, canvas);
    const ev = (type, x, y, id = 1, pointerType = 'touch', target = canvas) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y }));
    const dash = root.querySelector('#octo-dash-btn'), bomb = root.querySelector('#octo-bomb-btn');
    ev('pointerdown', 100, 400, 1, 'mouse');
    assert('touch: a mouse pointer on the canvas does not bring up the touch controls', dash.style.display === 'none');
    ev('pointerdown', 100, 400);
    const base = root.querySelector('.octo-stick-base');
    assert('touch: a touch on the canvas shows the stick, the Dash and the Bomb button', base.style.display === 'block' && dash.style.display === 'flex' && bomb.style.display === 'flex');
    ev('pointermove', 100 + 80, 400);
    assert('touch: dragging the stick sets the move vector (full right)', input.touch.active && input.touch.x > 0.95 && Math.abs(input.touch.y) < 0.05);
    bomb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 700 }));
    assert('touch: the Bomb button press reaches the input (one-shot edge)', input.touch.bomb.pressed === true && input.touch.bomb.held === true);
    bomb.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 700 }));
    ev('pointerup', 180, 400);
    assert('touch: letting go of the stick centres it and hides it', !input.touch.active && input.touch.x === 0 && base.style.display === 'none');
    root.remove(); canvas.remove();
  }
  {
    // review 3: the blast is a flash, a fireball, radial sparks and a ring (the old one was a thin ring)
    const ctx = recCtx();
    const b = { x: 0, y: 0, exploded: true, age: 0.05 };
    drawBombs(ctx, CAM, w2s, 800, 600, [b], 1);
    const early = ctx.calls.filter((k) => k === 'stroke').length, arcs = ctx.calls.filter((k) => k === 'arc').length, grads = ctx.calls.filter((k) => k === 'createRadialGradient').length;
    assert(`review 3: the blast draws a flash disc, a fireball, 26 spark lines and a ring (${early} strokes, ${arcs} arcs, ${grads} gradient)`, early >= 27 && arcs >= 3 && grads >= 1);
    const ctx2 = recCtx(); b.age = 0.39; drawBombs(ctx2, CAM, w2s, 800, 600, [b], 1);
    assert('review 3: the blast is drawn through to the end of its 0.4 s window', ctx2.calls.length > 5);
  }
  {
    // telegraphs: the piranha "!" and glow, the cannon's barrel and charge glow, the crab's rear-up
    const ctx = recCtx(); const en = createEnemies(); const o = createOctopus(30, 30);
    const p = en.spawnAt('piranha', 0, 0); p.st = PS_WINDUP; p.tell = 0.6; const c = en.spawnAt('cannon', 3, 0, 'floor'); c.tell = 0.5; c.st = CN_CHARGE;
    drawEnemies(ctx, CAM, w2s, 800, 600, en.all(), [], 2, 1);
    assert('telegraph: a winding-up piranha gets a glow and a "!", a charging cannon a barrel and a muzzle glow', ctx.calls.filter((k) => k === 'createRadialGradient').length >= 3 && ctx.calls.filter((k) => k === 'rect').length >= 1);
  }
}
