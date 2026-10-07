// V2-PLAN 16 (traps and the octopus's death looks): spikes impale outright, one hit knocks back hard, an eel shock and a
// manta dive incapacitate, current jets push only up, a jet may be paired with a ceiling spike strip (with room to dash out),
// and a boulder falling on the octopus flattens it. Tiny fake worlds, plus a scan of generated levels.
import {
  createHazards, makeHazardRecord, hazardBlockers, jetForceAt, jetSpikeClearance, PAIR_MIN_CLEAR,
  HZ_JET, HZ_SPIKES, HZ_ROCK, EEL_STUN_S, SPLAT_THIN,
} from '../js/hazards.js';
import { createOctopus, stepOctopus, hurtOctopus } from '../js/octopus.js';
import { createEnemies, MA_DIVE, MA_GLIDE } from '../js/enemies.js';
import { createProps } from '../js/props.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, generateLevel, finalPathOk, LEVEL_W, LEVEL_H } from '../js/level.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { createParticles } from '../js/particles.js';
import { drawOctopus, isBaked } from '../js/octopus-draw.js';
import { IMPALE_DEPTH, STUN_S, HURT_KNOCKBACK, SPLAT_SHAKE_PX, SHAKE_MAX_PX } from '../js/config.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

const DT = 0.02;
const NO_INPUT = { move: { x: 0, y: 0 }, dash: { pressed: false, held: false } };

/** Fake world from rows ('#' rock): tileAt / isSolid / placeRock, enough for hazards.js and the octopus step. */
function fake(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  const world = {
    w, h, tiles, placed: [],
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
    placeRock(x, y) { if (tiles[y * w + x] !== 0) return false; tiles[y * w + x] = 1; world.placed.push([x, y]); return true; },
  };
  return world;
}
const rec = (world, name, x, y, dx = 0, dy = 0) => makeHazardRecord(name, x, y, dx, dy, world.tiles, world.w, world.h);
/** The game's order: the octopus steps, then the hazards. */
function sim(hz, octo, world, seconds, input = NO_INPUT, each = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    each && each(i);
    stepOctopus(octo, input, DT, world);
    hz.update(DT, i * DT, octo, world, null);
  }
}
const box = (w, h, inner = () => false) => {
  const rows = [];
  for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += (x === 0 || y === 0 || x === w - 1 || y === h - 1 || inner(x, y)) ? '#' : '.'; rows.push(r); }
  return fake(rows);
};
/** A grid world for enemies.js (it only needs isSolid / breakTile). */
const grid = (fn) => ({ isSolid: (x, y) => fn(Math.floor(x), Math.floor(y)), breakTile() {} });

export async function runDamageTests(assert) {
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);

  // ---- spikes: instant impalement ----
  {
    const w = box(10, 9);
    const hz = createHazards(); hz.add(rec(w, 'spikes', 1.5, 4.5, 1, 0)); // strip on the left wall, face at x = 1
    const o = createOctopus(1.7, 4.6); o.invulnTimer = 5; // full hearts AND invulnerable
    sim(hz, o, w, 0.1);
    assert('spikes: touching the strip kills through full hearts and invulnerability', o.dead && o.hearts === 0 && o.cause === 'spikes');
    assert(`spikes: the body is pinned ${IMPALE_DEPTH} past the face, on the gap between the two spikes nearest the touch point (4.6 -> 4.5), deathStyle impale`,
      o.deathStyle === 'impale' && Math.abs(o.pinX - (1 + IMPALE_DEPTH)) < 1e-6 && Math.abs(o.pinY - 4.5) < 0.01 && o.x === o.pinX && o.y === o.pinY);
    assert('spikes: the head points away from the wall (belly to the face)', Math.abs(((o.pinAngle % 360) + 360) % 360 - 90) < 20);
    let moved = false;
    for (let i = 0; i < 100; i++) { stepOctopus(o, NO_INPUT, DT, w); hz.update(DT, 0, o, w, null); if (o.x !== o.pinX || o.y !== o.pinY || o.vx !== 0) moved = true; }
    assert('spikes: it stays pinned over 100 steps', !moved && o.x === o.pinX && o.y === o.pinY);
    const evs = createHazards(); evs.add(rec(w, 'spikes', 1.5, 4.5, 1, 0));
    const o2 = createOctopus(1.7, 4.5); evs.update(DT, 0, o2, w, null);
    const ev = evs.events.find((e) => e.type === 'impaled');
    assert('spikes: the impaled event carries the pin point and the face normal', ev && Math.abs(ev.x - (1 + IMPALE_DEPTH)) < 1e-6 && ev.dx === 1 && ev.dy === 0);
    const o3 = createOctopus(1.7, 4.5); o3.noKill = true;
    const h3 = createHazards(); h3.add(rec(w, 'spikes', 1.5, 4.5, 1, 0)); h3.update(DT, 0, o3, w, null);
    assert('spikes: godMode (noKill) is not killed', !o3.dead && o3.hearts === 3);
    const off = createOctopus(1.7, 4.5 + 1.5 + 0.45 * 0.3 + 0.2), h4 = createHazards(); h4.add(rec(w, 'spikes', 1.5, 4.5, 1, 0)); h4.update(DT, 0, off, w, null);
    assert('spikes: beyond the end of the strip is safe (the hit box ends where the drawn tips end)', !off.dead);
    const far = createOctopus(1.0 + 0.55 + 0.45 * 0.5 + 0.1, 4.5), h5 = createHazards(); h5.add(rec(w, 'spikes', 1.5, 4.5, 1, 0)); h5.update(DT, 0, far, w, null);
    assert('spikes: just off the tips is safe, the tips themselves are what kill', !far.dead);
    const ceil = fake(['#####', '#...#', '#...#', '#...#', '#...#', '#####']);
    const hc = createHazards(); hc.add(rec(ceil, 'spikes', 2.5, 1.5, 0, 1)); const oc = createOctopus(2.5, 1.7);
    hc.update(DT, 0, oc, ceil, null);
    assert('spikes: a ceiling strip impales downward (the head points down, away from the rock)', oc.dead && Math.abs(Math.abs(oc.pinAngle) - 180) < 25 && oc.pinY > 1.0);
  }

  // ---- one hit + strong knockback ----
  {
    const o = createOctopus(5, 5);
    hurtOctopus(o, 3, 5, 'piranha');
    assert(`one hit: one heart and a knock of >= 8 u/s away from the source (vx ${o.vx.toFixed(1)}, HURT_KNOCKBACK ${HURT_KNOCKBACK})`, o.hearts === 2 && o.vx >= 8 && o.stunT === 0);
    const o2 = createOctopus(5, 5); o2.vx = -6; // swimming into it
    hurtOctopus(o2, 3, 5, 'crab');
    assert('one hit: a swimmer heading into the source is thrown back out, not just slowed', o2.vx >= 8);
  }

  // ---- incapacitation: eel shock and manta slam ----
  {
    const shaft = fake(['##########', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '##########']);
    const hz = createHazards(); const i = hz.add(rec(shaft, 'eel', 4.5, 5.5, 0, 0));
    const o = createOctopus(4.5, hz.data.y[i] + 0.3);
    hz.update(DT, 0, o, shaft, null); // the body touches it
    assert(`eel: contact is a shock: one heart, stunT ${o.stunT.toFixed(2)} (~${EEL_STUN_S}), a shocked event`, o.hearts === 2 && Math.abs(o.stunT - EEL_STUN_S) < 1e-6 && hz.events.some((e) => e.type === 'shocked'));
    let limp = 0, free = -1;
    const right = { move: { x: 1, y: 0 }, dash: { pressed: false, held: false } };
    for (let k = 0; k < 120; k++) {
      stepOctopus(o, right, DT, shaft);
      if (o.swimming && free < 0) free = k; else if (free < 0) limp++;
    }
    assert(`eel: inputs are ignored for ~${EEL_STUN_S} s (${limp} steps = ${(limp * DT).toFixed(2)} s), then control returns`, Math.abs(limp * DT - EEL_STUN_S) <= 0.06 && free >= 0 && o.stunT === 0);
    // manta: dive contact stuns (STUN_S), gliding contact is a plain hit
    const world = grid((x, y) => x < 1 || x >= 40 || y >= 30 || y < 1);
    for (const [st, label] of [[MA_DIVE, 'dive'], [MA_GLIDE, 'glide']]) {
      const en = createEnemies(); const m = en.spawnAt('manta', 20, 10, 'open');
      const oc = createOctopus(20, 10.5);
      m.st = st; m.t = 5; m.tx = 0; m.ty = 1; m.cool = 5;
      en.update(DT, 0, oc, world, [], null);
      if (label === 'dive') assert(`manta: contact during the dive stuns for ${STUN_S} s and costs a heart (stunT ${oc.stunT.toFixed(2)}, hearts ${oc.hearts})`, Math.abs(oc.stunT - STUN_S) < 0.05 && oc.hearts === 2);
      else assert('manta: gliding contact stays a one-hit with knockback (no stun)', oc.stunT === 0 && oc.hearts === 2 && Math.abs(oc.vy) + Math.abs(oc.vx) > 5);
    }
  }

  // ---- jets: only up ----
  {
    const w = box(12, 14);
    let nonNull = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [1, 1], [-1, -1], [0, 0], [0, -2]]) if (rec(w, 'jet', 5.5, 7.5, dx, dy)) nonNull++;
    const up = rec(w, 'jet', 5.5, 12.5, 0, -1);
    assert('jets: makeHazardRecord returns null for every facing but straight up', nonNull === 0 && up && up.dy === -1 && up.dx === 0);
    const hz = createHazards(); const i = hz.add(up);
    const f = jetForceAt(hz.data, i, 5.5, 10);
    assert('jets: jetForceAt gives the upward acceleration in the stream, 0 outside it', f && f.fx === 0 && f.fy < -8 && jetForceAt(hz.data, i, 9.5, 10) === 0 && jetForceAt(hz.data, i, 5.5, 2) === 0);
    const hzs = createHazards(); const sp = hzs.add(rec(w, 'spikes', 1.5, 5.5, 1, 0));
    assert('jets: jetForceAt of a non-jet is 0', jetForceAt(hzs.data, sp, 2, 5) === 0);
  }

  // ---- jet + spike pairing ----
  {
    const gridOf = (rows) => fake(rows);
    const wall = (n) => { const r = ['#########']; for (let k = 0; k < n; k++) r.push('#.......#'.slice(0, 9)); r.push('#########'); return r; };
    const g4 = gridOf(wall(4)), g5 = gridOf(wall(5)), g6 = gridOf(wall(6));
    const c4 = jetSpikeClearance(g4.tiles, g4.w, g4.h, 4, 4), c5 = jetSpikeClearance(g5.tiles, g5.w, g5.h, 4, 5);
    assert(`pairing: clearance counts the clear rows up to a flat ceiling (4 rows -> ${c4}, 5 rows -> ${c5})`, c4 === 4 && c5 === 5 && PAIR_MIN_CLEAR === 5);
    assert('pairing: 4 rows is too tight (no pair), 5 rows pairs, 6 pairs', rec(g4, 'jetspikes', 4.5, 4.5, 0, -1) === null && rec(g5, 'jetspikes', 4.5, 5.5, 0, -1) && rec(g6, 'jetspikes', 4.5, 6.5, 0, -1));
    const p = rec(g5, 'jetspikes', 4.5, 5.5, 0, -1);
    assert('pairing: the jet streams up (len = clearance) and the strip hangs on the ceiling facing down', p.hk === HZ_JET && p.dy === -1 && p.len === 5 && p.pair.hk === HZ_SPIKES && p.pair.dy === 1 && p.pair.dx === 0 && p.pair.y === 1.5 && p.pair.x === 4.5);
    const bumpy = gridOf(['#########', '#...#...#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########']); // the ceiling above column 3..5 is not flat
    assert('pairing: no flat ceiling over the three stream columns gives -1 and no pair', jetSpikeClearance(bumpy.tiles, bumpy.w, bumpy.h, 4, 6) === -1 && rec(bumpy, 'jetspikes', 4.5, 6.5, 0, -1) === null);
    const tall = gridOf((() => { const r = ['#########']; for (let k = 0; k < 14; k++) r.push('#.......#'); r.push('#########'); return r; })());
    assert('pairing: a ceiling more than 12 rows up is -1', jetSpikeClearance(tall.tiles, tall.w, tall.h, 4, 14) === -1);
    const narrow = gridOf(['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#####']);
    assert('pairing: a shaft with no open water beside the stream gives no pair (nowhere to dash out)', rec(narrow, 'jetspikes', 2.5, 6.5, 0, -1) === null);
    const hz = createHazards(); hz.add(p); hz.add(p.pair);
    assert('pairing: the strip is an A* blocker, the jet is not', hazardBlockers(p.pair).length === 3 && hazardBlockers(p).length === 0);
  }

  // ---- generated levels: jets up only, pairs are roomy, the exit stays reachable ----
  {
    let jets = 0, wrongWay = 0, pairs = 0, badPair = 0, badPath = 0, orphan = 0, levels = 0, withPair = 0;
    for (let seed = 1; seed <= (pairs ? 10 : 40); seed++) for (let lv = 0; lv < 3; lv++) { // 10 seeds; pairs are rare, so keep looking up to seed 40 until one shows
      const L = generateLevel(seed, lv, bank);
      const sp = buildLevelSpawns(L, seed, lv).spawns;
      levels++;
      const hz = sp.filter((r) => r.type === 'hazard');
      for (const r of hz) if (r.hk === HZ_JET) { jets++; if (r.dy !== -1 || r.dx !== 0) wrongWay++; }
      const ids = new Map();
      for (const r of hz) if (r.pairId) ids.set(r.pairId, (ids.get(r.pairId) || 0) + 1);
      let any = false;
      for (const r of hz) {
        if (!r.pairId) continue;
        if (ids.get(r.pairId) !== 2) orphan++;
        if (r.hk !== HZ_JET) continue;
        pairs++; any = true;
        const clear = jetSpikeClearance(L.tiles, LEVEL_W, LEVEL_H, Math.floor(r.x), Math.floor(r.y) - 1);
        if (clear < PAIR_MIN_CLEAR || r.len !== clear) badPair++;
      }
      if (any) withPair++;
      const bl = []; for (const r of hz) hazardBlockers(r, bl);
      if (!finalPathOk(L.tiles, L.startX, L.startY, L.exitX, L.exitY, L.shop, bl)) badPath++;
    }
    assert(`generated: no jet faces anywhere but up (${jets} jets over ${levels} levels, ${wrongWay} wrong)`, jets > 0 && wrongWay === 0);
    assert(`generated: every jet + spikes pair has >= ${PAIR_MIN_CLEAR} clear rows (${pairs} pairs in ${withPair} levels, ${badPair} bad, ${orphan} unpaired halves)`, pairs >= 1 && badPair === 0 && orphan === 0);
    assert(`generated: finalPathOk still passes with every hazard in place (${badPath} bad)`, badPath === 0);
  }

  // ---- splat: a boulder dropped on the octopus ----
  {
    const rows = ['##########', '#..#.....#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '##########'];
    const mk = (ox, oy) => { const w = fake(rows); const hz = createHazards(); const i = hz.add(rec(w, 'rock', 4.5, 1.5, 0, 1)); return { w, hz, i, o: createOctopus(ox, oy) }; };
    const a = mk(4.5, 7.0);
    const events = [];
    sim(a.hz, a.o, a.w, 3, NO_INPUT, () => { if (a.hz.data.state[a.i] < 2) { a.o.x = 4.5; a.o.y = 7.0; a.o.vx = a.o.vy = 0; } });
    // (collect events in a second run below; here the end state)
    assert('splat: the boulder landing on the octopus kills it as a splat (deathStyle, cause rock)', a.o.dead && a.o.deathStyle === 'splat' && a.o.cause === 'rock' && a.o.hearts === 0);
    assert(`splat: the pancake is fully flat (flat ${a.o.flat.toFixed(2)}) and lies on the floor under the boulder`, a.o.flat === 1 && Math.abs(a.o.pinY - (a.hz.data.b[a.i] - SPLAT_THIN / 2)) < 0.02 && Math.abs(a.o.pinX - a.hz.data.x[a.i]) < 0.05);
    assert('splat: the boulder did NOT become a rock tile (it stays a resting boulder)', a.w.placed.length === 0 && a.w.tileAt(4, Math.floor(a.hz.data.a[a.i])) === 0 && a.hz.data.state[a.i] === 6);
    const b = mk(4.5, 7.0); let splats = 0, flatPath = [];
    sim(b.hz, b.o, b.w, 3, NO_INPUT, () => { for (const e of b.hz.events) if (e.type === 'splat') splats++; if (b.hz.data.state[b.i] < 2) { b.o.x = 4.5; b.o.y = 7.0; b.o.vx = b.o.vy = 0; } if (b.o.dead) flatPath.push(b.o.flat); });
    assert('splat: one splat event, and flat only ever rises', splats === 1 && flatPath.every((v, k) => k === 0 || v >= flatPath[k - 1] - 1e-9));
    const c = mk(5.3, 5.0); // under the edge of the fall line: the boulder only clips its side
    sim(c.hz, c.o, c.w, 3, NO_INPUT, () => { if (c.hz.data.state[c.i] < 2) { c.o.x = 5.3; c.o.y = 5.0; c.o.vx = c.o.vy = 0; } });
    assert(`splat: a side brush is only one hit (hearts ${c.o.hearts}, dead ${c.o.dead})`, !c.o.dead && c.o.hearts === 2);
    const d = mk(4.5, 7.0); d.o.noKill = true;
    sim(d.hz, d.o, d.w, 3, NO_INPUT, () => { if (d.hz.data.state[d.i] < 2) { d.o.x = 4.5; d.o.y = 7.0; d.o.vx = d.o.vy = 0; } });
    assert('splat: godMode (noKill) is only hit, never flattened', !d.o.dead);
  }
  {
    // the real thing: the boulder is a prop (props.js) hanging from the ceiling tile
    const tiles = new Uint8Array(30 * 30);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) tiles[y * 30 + x] = (x < 2 || y < 2 || x >= 28 || y >= 28 || y < 8 || y >= 26) ? 1 : 0;
    const world = createLevelWorld(1, 0, { level: { tiles, w: 30, h: 30, startX: 4, startY: 4, exitX: -1, exitY: -1, spawns: [], walls: [] } });
    const props = createProps(); const hz = createHazards(props);
    const i = hz.add(makeHazardRecord('rock', 17.5, 8.5, 0, 1, world.level.tiles, world.level.w, world.level.h));
    const o = createOctopus(17.5, 24.5);
    let splatEv = null;
    for (let k = 0; k < 300; k++) {
      if (!o.dead) { o.x = 17.5; o.y = 24.5; o.vx = o.vy = 0; }
      stepOctopus(o, NO_INPUT, DT, world); props.step(DT, world, o, []); hz.update(DT, k * DT, o, world, null);
      for (const e of hz.events) if (e.type === 'splat') splatEv = e;
    }
    assert('splat (props): the hanging boulder falls on the octopus and flattens it', o.dead && o.deathStyle === 'splat' && o.flat === 1 && splatEv);
    assert('splat (props): the boulder is still a prop on the pancake and no rock tile was made', world.tileAt(17, 25) === 0 && hz.data.state[i] === 6 && hz.data.pid[i] >= 0 && Math.abs(o.pinX - hz.data.x[i]) < 0.1);
    assert('splat (props): the pancake lies at the floor, the boulder rests on top of it', o.pinY > hz.data.y[i] + 0.2 && o.pinY < 26 - 0.05);
  }

  // ---- the death looks draw (octopus-draw.js): a limp body holds still, a pancake is wide and thin ----
  {
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 240;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const draw = (o) => {
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 240, 240);
      c.translate(120, 120); c.scale(100, 100);
      drawOctopus(c, o);
      const px = c.getImageData(0, 0, 240, 240).data; let x0 = 999, x1 = -1, y0 = 999, y1 = -1, n = 0, sum = 0;
      for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) { const a = px[(y * 240 + x) * 4 + 3]; if (a > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); n++; sum += px[(y * 240 + x) * 4] + x * 7 + y * 13; } }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1, n, sum };
    };
    const base = () => ({ radius: 0.45, swimming: false, dashCooldown: 0, hurting: false, dead: false, deathStyle: '', flat: 0, stunT: 0, held: 0, __t: 0, __speed: 0 });
    const flat = Object.assign(base(), { dead: true, deathStyle: 'splat', flat: 1 }), norm = base();
    const f = draw(flat), n = draw(norm);
    assert(`octopus draw: the splat pancake is wide and thin (${f.w}x${f.h} px against ${n.w}x${n.h} for the live body)`, f.w > f.h * 1.8 && f.h < n.h * 0.55 && f.w > n.w * 1.3);
    const s1 = Object.assign(base(), { stunT: 1, hurting: true, __t: 0.1 }), s2 = Object.assign(base(), { stunT: 1, hurting: true, __t: 0.37 });
    const a = draw(s1), b = draw(s2);
    assert('octopus draw: a stunned body is held on one frame (the same picture at two times), an idle one is not required to be', !isBaked() || (a.sum === b.sum && a.n === b.n));
    const imp = draw(Object.assign(base(), { dead: true, deathStyle: 'impale' }));
    assert('octopus draw: the impaled and stunned looks draw something', imp.n > 100 && a.n > 100);
  }

  // ---- particles: splat gore sticks to rock; the splat shake may exceed the usual cap ----
  {
    const p = createParticles();
    p.splatBurst(10, 10);
    const sticky = p.pool.filter((q) => q.active && q.sticky);
    assert(`splat fx: 6-10 sticky chunks (${sticky.length}) plus ink and goo`, sticky.length >= 6 && sticky.length <= 10 && p.pool.filter((q) => q.active).length > sticky.length);
    const wall = (x, y) => y > 11; // a floor at y = 11
    for (let k = 0; k < 120; k++) p.update(DT, wall);
    const stuck = sticky.filter((q) => q.active && q.stuck);
    assert(`splat fx: chunks that hit rock stay put (${stuck.length} stuck) and keep for a few seconds`, stuck.length >= 1 && stuck.every((q) => q.life > 0.5 && q.vx === 0 && q.y <= 12.2));
    p.shakeFx(SPLAT_SHAKE_PX, 0.5, SPLAT_SHAKE_PX);
    let peak = 0; for (let k = 0; k < 5; k++) { const s = p.shakePx(); peak = Math.max(peak, Math.abs(s.x), Math.abs(s.y)); }
    const q = createParticles(); q.shakeFx(SPLAT_SHAKE_PX, 0.5); const s2 = q.shakePx();
    assert(`splat fx: the shake has its own cap (${SPLAT_SHAKE_PX} px) above the normal ${SHAKE_MAX_PX} px; the default cap still holds`, SPLAT_SHAKE_PX > SHAKE_MAX_PX && Math.max(Math.abs(s2.x), Math.abs(s2.y)) <= SHAKE_MAX_PX + 1e-9);
  }
}
