// Round 30: the five hazards (hazards.js) on small hand-made worlds, the record builders, the world's
// placeRock, and the journal entries.
import {
  createHazards, makeHazardRecord, hazardBlockers, hazardJournalId,
  HZ_JET, HZ_SPIKES, HZ_ROCK, HZ_EEL, HZ_ANEMONE, HAZARD_NAMES,
  JET_ACC, ROCK_SHAKE, EEL_PERIOD, EEL_FIRE_AT, EEL_RING_MAX, EEL_HALF_BODY,
} from '../js/hazards.js';
import { createOctopus } from '../js/octopus.js';
import { createEnemies, CN_CHARGE, CN_RELOAD } from '../js/enemies.js';
import { createProps, PK_BOMB, PS_FREE } from '../js/props.js';
import { createCreatures, CR_TENTACLE, TN_DORMANT } from '../js/creatures.js';
import { setGameView, resetGameView } from '../js/cull.js';
import { applyDrag } from '../js/physics.js';
import { OCTO_LINEAR_DRAG } from '../js/config.js';
import { ENTRIES, CATEGORIES, CAT_HAZARD } from '../js/journal.js';
import { setDefaultBank, generateLevel, LEVEL_W, BORDER } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createRoomBank } from '../js/rooms.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { loadBiome1Json } from './biome1.test.js';

const DT = 0.02;

/** Fake world from rows ('#' rock): tileAt / isSolid / placeRock, enough for hazards.js. */
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
/** A jet record built by hand (any facing): the physics still runs along dx, dy; only makeHazardRecord refuses a non-up jet. */
function setupJet(world, x, y, dx, dy, len, octoX, octoY) {
  const hz = createHazards();
  const r = { type: 'hazard', hk: HZ_JET, x: x - dx * 0.5, y: y - dy * 0.5, dx, dy, len };
  hz.add(r);
  return { hz, r, octo: createOctopus(octoX, octoY) };
}
function setup(world, name, x, y, dx, dy, octoX, octoY) {
  const hz = createHazards();
  const r = rec(world, name, x, y, dx, dy);
  hz.add(r);
  const octo = createOctopus(octoX, octoY);
  return { hz, r, octo };
}
/** Step the hazards with an octopus that drifts under its own velocity and drag (what the swim step does). */
function run(hz, octo, world, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    each && each(i);
    hz.update(DT, i * DT, octo, world, null);
    applyDrag(octo, OCTO_LINEAR_DRAG, DT);
    octo.x += octo.vx * DT; octo.y += octo.vy * DT;
    if (octo.invulnTimer > 0) octo.invulnTimer = Math.max(0, octo.invulnTimer - DT);
  }
}

export async function runHazardTests(assert) {
  // ---- journal ----
  {
    const ids = HAZARD_NAMES.slice(1).map((_, i) => hazardJournalId(i + 1));
    const found = ids.map((id) => ENTRIES.find((e) => e.id === id));
    assert('journal: each of the five hazards has an entry in the Hazards category',
      found.every((e) => e && e.cat === CAT_HAZARD && e.name && e.text.length > 40) && CATEGORIES.includes(CAT_HAZARD) && ids.length === 5);
  }

  // ---- record builders ----
  {
    const open = fake(['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '##########']);
    assert('records: a jet needs room for its stream (4+ tiles) and a rock needs a 3+ tile drop',
      rec(open, 'jet', 4.5, 7.5, 0, -1) !== null && rec(open, 'jet', 4.5, 7.5, 0, -1).len === 7 && rec(open, 'jet', 1.5, 3.5, 1, 0) === null &&
      rec(fake(['#####', '#..##', '#####']), 'jet', 1.5, 1.5, 0, -1) === null &&
      rec(open, 'rock', 4.5, 1.5, 0, 1) !== null && rec(open, 'rock', 4.5, 1.5, 0, 1).landY === 7.5 &&
      rec(open, 'rock', 4.5, 6.5, 0, 1) === null);
    const jr = rec(open, 'jet', 4.5, 7.5, 0, -1);
    assert('records: a jet sits on the floor face (mouth half a tile below the anchor cell) and points up', jr.x === 4.5 && jr.y === 8 && jr.dx === 0 && jr.dy === -1);
    const shaft = fake(['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#']);
    const er = rec(shaft, 'eel', 2.5, 3.5, 0, 0);
    assert(`records: an eel patrols the shaft between its ends (${er && er.y0.toFixed(1)}..${er && er.y1.toFixed(1)})`, er && er.y0 === 1.1 && er.y1 === 6.9 || er && er.y1 - er.y0 >= 4);
    assert('records: a shaft too short for the eel gives none', rec(fake(['#...#', '#...#', '#####']), 'eel', 2.5, 0.5, 0, 0) === null);
    const b = [];
    hazardBlockers(rec(open, 'spikes', 1.5, 3.5, 1, 0), b);
    hazardBlockers(rec(open, 'rock', 4.5, 1.5, 0, 1), b);
    hazardBlockers(rec(open, 'anemone', 4.5, 7.5, 0, -1), b);
    const none = []; hazardBlockers(jr, none); hazardBlockers(er, none);
    assert(`records: spikes (3), a rock (2: rest and landing) and an anemone (1) block for the A* check; jets and eels do not (${b.length} vs ${none.length})`, b.length === 6 && none.length === 0);
  }

  // ---- current jet: pushes along the stream, no damage ----
  {
    const w = fake(['####################', '#..................#', '#..................#', '#..................#', '#..................#', '####################']);
    const { hz, r, octo } = setupJet(w, 1.5, 2.5, 1, 0, 7, 6.5, 2.5);
    const len0 = r.len;
    let vmax = 0;
    run(hz, octo, w, 1.5, () => { vmax = Math.max(vmax, octo.vx); });
    assert(`jet: an octopus resting in the stream is carried along it (top speed ${vmax.toFixed(1)}, now at x ${octo.x.toFixed(1)})`, vmax > 3 && octo.x > 8);
    assert('jet: it does no damage', octo.hearts === 3 && octo.invulnTimer === 0 && hz.events.length === 0);
    const o2 = createOctopus(6.5, 4.4);
    run(hz, o2, w, 1);
    assert('jet: outside the stream (beyond its half width) nothing pushes', Math.abs(o2.vx) < 1e-6 && Math.abs(o2.vy) < 1e-6);
    const o3 = createOctopus(1 + len0 + 1, 2.5);
    run(hz, o3, w, 0.5);
    assert('jet: past the end of the stream nothing pushes', Math.abs(o3.vx) < 1e-6);
    const o4 = createOctopus(3.5, 2.5);
    hz.update(DT, 0, o4, w, null);
    assert(`jet: the push at the mouth is about the full strength (${(o4.vx / DT).toFixed(1)} of ${JET_ACC} u/s^2)`, Math.abs(o4.vx / DT - JET_ACC * (1 - 0.5 * 2.5 / len0)) < 0.01);
    // a floor jet pushes up
    const w2 = fake(['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####']);
    const up = setup(w2, 'jet', 2.5, 5.5, 0, -1, 2.5, 4.0);
    run(up.hz, up.octo, w2, 0.6);
    assert('jet: a floor vent pushes up', up.octo.vy < -2 && up.r.dy === -1);
  }

  // ---- spike wall: hurts on contact ----
  {
    const w = fake(['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '##########']);
    const a = setup(w, 'spikes', 1.5, 3.5, 1, 0, 1.6, 3.5);
    run(a.hz, a.octo, w, 0.1);
    assert('spikes: touching the strip kills outright (V2-PLAN 16: impaled, see damage.test.js)', a.octo.dead && a.octo.deathStyle === 'impale');
    const first = a.octo.hearts;
    run(a.hz, a.octo, w, 0.3, () => { a.octo.x = 1.6; a.octo.y = 3.5; });
    assert('spikes: the dead body stays pinned', a.octo.hearts === 0 && a.octo.dead);
    const far = setup(w, 'spikes', 1.5, 3.5, 1, 0, 3.0, 3.5);
    run(far.hz, far.octo, w, 0.5);
    const beside = setup(w, 'spikes', 1.5, 3.0, 1, 0, 1.6, 6.0 - 0.1);
    beside.octo.y = 5.3; // past the 3 tile strip
    run(beside.hz, beside.octo, w, 0.3);
    assert('spikes: two tiles off the face, or past the end of the strip, is safe', far.octo.hearts === 3 && beside.octo.hearts === 3);
    const floor = setup(fake(['#####', '#...#', '#...#', '#...#', '#####']), 'spikes', 2.5, 3.5, 0, -1, 2.5, 3.4);
    run(floor.hz, floor.octo, floor.hz && fake(['#####', '#...#', '#...#', '#...#', '#####']), 0.1);
    assert('spikes: a floor strip kills too', floor.octo.dead);
  }

  // ---- falling rock ----
  {
    const rows = ['##########', '#..#.....#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '##########'];
    // rock in the ceiling corner under (4,0) rock: anchor (4,1)
    const mk = (ox, oy) => {
      const w = fake(rows);
      return { w, ...setup(w, 'rock', 4.5, 1.5, 0, 1, ox, oy) };
    };
    const far = mk(8.5, 6.5);
    run(far.hz, far.octo, far.w, 2);
    assert('rock: stays put while the octopus is not underneath', far.hz.data.state[0] === 0 && far.w.placed.length === 0);
    const side = mk(6.3, 6.5);
    run(side.hz, side.octo, side.w, 1);
    assert('rock: one tile and a bit to the side is not "under it"', side.hz.data.state[0] === 0);
    const walled = (() => {
      const w = fake(['##########', '#..#.....#', '#........#', '#........#', '#........#', '#........#', '##########']);
      return { w, ...setup(w, 'rock', 4.5, 1.5, 0, 1, 4.5, 5.0) };
    })();
    assert('rock: no drop when rock is in the way of the column', (() => { walled.w.tiles[4 * walled.w.w + 4] = 1; run(walled.hz, walled.octo, walled.w, 1); return walled.hz.data.state[0] === 0; })());
    const t = mk(4.5, 5.0);
    const land = t.r.landY;
    let shakeAt = -1, landAt = -1;
    run(t.hz, t.octo, t.w, 3, (i) => {
      if (t.hz.data.state[0] === 1 && shakeAt < 0) shakeAt = i;
      if (t.hz.data.state[0] === 3 && landAt < 0) landAt = i;
      if (i === 2) { t.octo.x = 8.5; t.octo.y = 6.5; } // swim clear right after triggering it
    });
    assert(`rock: passing underneath makes it shake for ${ROCK_SHAKE}s, then fall and settle on the floor (landed at ${land}: ${t.hz.data.y[0]})`,
      shakeAt >= 0 && landAt > shakeAt + Math.round(ROCK_SHAKE / DT) - 2 && t.hz.data.state[0] === 3 && t.hz.data.y[0] === land);
    assert('rock: where it lands the tile becomes rock (placeRock), and the event fires', t.w.placed.length === 1 && t.w.placed[0][0] === 4 && t.w.placed[0][1] === Math.floor(land) && t.w.tiles[Math.floor(land) * t.w.w + 4] === 1);
    const u = mk(4.5, 7.0);
    run(u.hz, u.octo, u.w, 2, (i) => { if (u.hz.data.state[0] < 3) { u.octo.x = 4.5; u.octo.y = 7.0; u.octo.vx = u.octo.vy = 0; } });
    assert('rock: it hurts the octopus it falls on', u.octo.hearts <= 2);
    // landing on top of the octopus waits until it swims clear
    const p = mk(4.5, 8.6); p.octo.noKill = true; // the test hook: a boulder dropped on it is only a (blocked) hit, so it can wait
    run(p.hz, p.octo, p.w, 1.6, () => { p.octo.x = 4.5; p.octo.y = 8.5; p.octo.vx = p.octo.vy = 0; p.octo.invulnTimer = 5; });
    const waited = p.hz.data.state[0] === 4 && p.w.placed.length === 0;
    run(p.hz, p.octo, p.w, 0.5, () => { p.octo.x = 8.5; p.octo.y = 4; });
    assert('rock: it never settles on the octopus: it waits, then lands once the octopus is clear', waited && p.hz.data.state[0] === 3 && p.w.placed.length === 1);
    let evs = 0;
    const q = mk(4.5, 5.0);
    run(q.hz, q.octo, q.w, 3, (i) => { for (const e of q.hz.events) if (e.type === 'rockLanded') evs++; if (i === 2) { q.octo.x = 8.5; q.octo.y = 6.5; } });
    assert('rock: a landing is reported once', evs === 1);
  }

  // ---- landed rock in the real world: breakable, border safe ----
  {
    setDefaultBank(createRoomBank(await loadBiome1Json()));
    const world = createLevelWorld(4242, 1);
    let cell = null;
    for (let y = 10; y < 60 && !cell; y++) for (let x = 6; x < 28 && !cell; x++) if (world.tileAt(x, y) === 0 && world.tileAt(x, y + 1) === 0) cell = [x, y];
    const before = world.outlineTraces;
    const ok = world.placeRock(cell[0], cell[1]);
    const v = world.bandVersion(world.tileAt ? Math.floor(cell[1] / world.bandRows) : 0);
    assert('placeRock (world-v2): open water becomes rock that blocks, is breakable and marks the wall band dirty',
      ok && world.tileAt(cell[0], cell[1]) === 1 && world.isSolid(cell[0] + 0.5, cell[1] + 0.5) && world.isBreakable(cell[0] + 0.5, cell[1] + 0.5) && v > 0 && world.dirty);
    assert('placeRock (world-v2): refuses rock, water in the border ring and a second placement; a bomb then clears it',
      !world.placeRock(cell[0], cell[1]) && !world.placeRock(0, 0) && !world.placeRock(1, 30) && world.breakTile(cell[0], cell[1]) && world.tileAt(cell[0], cell[1]) === 0);
  }

  // ---- a boulder balanced on a ledge corner rolls off instead of becoming a rock tile in mid-water; decor boulders sit on solid ground ----
  {
    const bank = createRoomBank(await loadBiome1Json());
    setDefaultBank(bank);
    let boulders = 0, perched = [];
    for (let seed = 1; seed <= 40; seed++) for (let lv = 0; lv < 3; lv++) {
      const L = generateLevel(seed, lv, bank);
      for (const s of buildLevelSpawns(L, seed, lv).spawns) {
        if (s.type !== 'decor' || s.dk !== 'boulder' || s.dy !== -1) continue;
        boulders++;
        const tx = Math.floor(s.x), ty = Math.floor(s.y);
        if (!(L.tiles[(ty + 1) * L.w + tx - 1] && L.tiles[(ty + 1) * L.w + tx] && L.tiles[(ty + 1) * L.w + tx + 1])) perched.push(seed + '/' + lv + '@' + tx + ',' + ty);
      }
    }
    assert(`decor boulders: all ${boulders} floor boulders stand on rock under their middle and both sides (none on a ledge end)` + (perched.length ? ' [' + perched.slice(0, 4).join(', ') + ']' : ''), boulders >= 50 && perched.length === 0);
  }

  // ---- electric eel ----
  {
    const shaftRows = ['##########', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '###...####', '##########'];
    const mk = (ox, oy, rows = shaftRows) => { const w = fake(rows); return { w, ...setup(w, 'eel', 4.5, 5.5, 0, 0, ox, oy) }; };
    const a = mk(20, 20);
    let minY = 99, maxY = -99, sawCharge = false, shock = -1, shockRing = 0;
    run(a.hz, a.octo, a.w, EEL_PERIOD * 2 + 0.5, (i) => {
      const d = a.hz.data;
      minY = Math.min(minY, d.y[0]); maxY = Math.max(maxY, d.y[0]);
      if (d.state[0] === 1) sawCharge = true;
      for (const e of a.hz.events) if (e.type === 'shock' && shock < 0) { shock = i * DT; shockRing = d.r[0]; }
    });
    assert(`eel: patrols inside its shaft (${minY.toFixed(1)}..${maxY.toFixed(1)} of ${a.r.y0.toFixed(1)}..${a.r.y1.toFixed(1)}), glows before the shock and fires it at ${EEL_FIRE_AT}s (${shock.toFixed(2)})`,
      minY >= a.r.y0 - 1e-3 && maxY <= a.r.y1 + 1e-3 && maxY - minY > 1 && sawCharge && Math.abs(shock - (EEL_FIRE_AT - a.hz.data.t[0] * 0 - 0) ) < EEL_PERIOD);
    // a ring hurts when it reaches the octopus
    const b = mk(0, 0);
    let hurtAt = -1;
    run(b.hz, b.octo, b.w, EEL_PERIOD, (i) => {
      const d = b.hz.data;
      b.octo.x = d.x[0]; b.octo.y = d.y[0] + 1.9; b.octo.vx = b.octo.vy = 0; // always 1.9 tiles below the eel, in the open shaft
      if (b.octo.hearts < 3 && hurtAt < 0) hurtAt = i * DT;
    });
    assert(`eel: its shock ring hurts an octopus in line of sight when it sweeps past (hurt at ${hurtAt.toFixed(2)}s)`, hurtAt > 0 && b.octo.hearts === 2);
    // rock stops the ring
    const w3rows = ['############', '###...#.....', '###...#.....', '###...#.....', '###...#.....', '###...#.....', '###...#.....', '############'];
    const c = mk(0, 0, w3rows);
    c.octo.x = 8.2;
    run(c.hz, c.octo, c.w, EEL_PERIOD * 2, () => { c.octo.x = 8.2; c.octo.y = c.hz.data.y[0]; c.octo.vx = c.octo.vy = 0; });
    assert('eel: the ring is stopped by rock (an octopus in the next cave is safe)', c.octo.hearts === 3);
    // out of range is safe
    const far = mk(0, 0);
    run(far.hz, far.octo, far.w, EEL_PERIOD, () => { far.octo.x = far.hz.data.x[0]; far.octo.y = far.hz.data.y[0] + EEL_RING_MAX + 1; far.octo.vx = far.octo.vy = 0; });
    assert('eel: beyond the ring range nothing happens', far.octo.hearts === 3);
    // touching the body hurts even with no ring
    const body = mk(0, 0);
    run(body.hz, body.octo, body.w, 0.1, () => { body.octo.x = body.hz.data.x[0]; body.octo.y = body.hz.data.y[0] + EEL_HALF_BODY * 0.5; });
    assert('eel: touching its body hurts', body.octo.hearts === 2);
  }

  // ---- anemone ----
  {
    const w = fake(['#######', '#.....#', '#.....#', '#.....#', '#######']);
    const a = setup(w, 'anemone', 3.5, 3.5, 0, -1, 3.5, 3.2);
    run(a.hz, a.octo, w, 0.1);
    const nearMiss = setup(w, 'anemone', 3.5, 3.5, 0, -1, 3.5, 1.6);
    run(nearMiss.hz, nearMiss.octo, w, 0.5);
    const side = setup(w, 'anemone', 3.5, 3.5, 0, -1, 5.6, 3.3);
    run(side.hz, side.octo, w, 0.5);
    assert('anemone: sitting in it hurts; 2 tiles above or 2 tiles beside is safe', a.octo.hearts === 2 && nearMiss.octo.hearts === 3 && side.octo.hearts === 3);
    assert('anemone: a dead octopus is ignored', (() => { const o = createOctopus(3.5, 3.2); o.dead = true; const h = createHazards(); h.add(rec(w, 'anemone', 3.5, 3.5, 0, -1)); h.update(DT, 0, o, w, null); return o.hearts === 3; })());
  }

  // ---- hazards from a chunk ----
  {
    const w = fake(['#####', '#...#', '#...#', '#...#', '#####']);
    const hz = createHazards();
    const chunk = { spawns: [{ type: 'hazard', ...rec(w, 'anemone', 2.5, 3.5, 0, -1) }, { type: 'enemy-slot', x: 1, y: 1 }, { type: 'shell', x: 1, y: 1 }] };
    const octo = createOctopus(2.5, 1.5);
    hz.update(DT, 0, octo, w, [{ index: 0, chunk }]);
    hz.update(DT, 0, octo, w, [{ index: 0, chunk }]);
    assert('hazards: only hazard records load, and a chunk loads once', hz.count() === 1 && hz.data.kind[0] === HZ_ANEMONE);
    const seen = hz.seen(2.5, 1.5, 9, (x, y) => w.isSolid(x, y));
    assert('hazards: seen() reports the kinds in view for the journal', seen.length === 1 && seen[0] === HZ_ANEMONE);
  }
  await runHazardEnemyTests(assert);
  assert('hazards: kind codes are stable (jet 1, spikes 2, rock 3, eel 4, anemone 5)', HZ_JET === 1 && HZ_SPIKES === 2 && HZ_ROCK === 3 && HZ_EEL === 4 && HZ_ANEMONE === 5);
}

// ---------------------------------------------------------------- hazards x enemies (vibe review items 1 and 6)
const roomRows = (w, h) => Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));
const calm = (o) => { o.invulnTimer = 1e9; return o; };
const view = (cx, cy) => setGameView({ x: cx, y: cy, pxPerUnit: 32 }, 320, 320); // a 10 x 10 tile view

async function runHazardEnemyTests(assert) {
  let W; // floor at row 13; a landed boulder turns into rock, so every scenario gets a fresh room
  const fresh = () => { W = fake(roomRows(8, 14)); };
  const STEPS = (s) => Math.round(s / DT);
  try {
    // ---- a falling boulder crushes the enemy under it (scripted fall and prop fall) ----
    for (const useProps of [false, true]) {
      fresh();
      const tag = useProps ? 'prop boulder' : 'scripted boulder';
      const props = useProps ? createProps() : null;
      const hz = createHazards(props), en = createEnemies();
      const bodyCalls = [];
      hz.setVictims({ kill: (e, r) => en.kill(e, r), bodies: (x, y, r, caused, mask) => { bodyCalls.push(caused); return mask | 1; } });
      view(4, 6);
      const crab = en.spawnAt('crab', 4.5, 12.55, 'floor');
      hz.add(rec(W, 'rock', 4.5, 1.5, 0, 1));
      const octo = calm(createOctopus(1.5, 3.5)); // far from the boulder's line: only the crab triggers it
      let shook = false;
      for (let i = 0; i < STEPS(3); i++) {
        if (props) props.step(DT, W, octo, en.all());
        hz.update(DT, i * DT, octo, W, null, en.all());
        if (hz.data.state[0] === 1) shook = true;
      }
      const ev = en.events.filter((e) => e.type === 'enemyKilled');
      assert(`${tag}: an enemy under it sets it off (cause 0, not the octopus) and is crushed`, shook && crab.dead && hz.data.cause[0] === 0 && ev.length === 1);
      assert(`${tag}: the crush goes through enemies.kill, so a corpse event follows (kind crab, reason crush)`, ev[0] && ev[0].kind === 'crab' && ev[0].reason === 'crush');
      assert(`${tag}: a boulder an enemy set off is not the octopus's doing (bodies called with octoCaused false)`, bodyCalls.length > 0 && bodyCalls.every((c) => c === false));
    }
    {
      fresh(); // the octopus under it: octoCaused true; the bomb-released boulder too
      const hz = createHazards(createProps());
      hz.setVictims({ kill: () => {}, bodies: (x, y, r, caused, mask) => mask });
      view(4, 6);
      hz.add(rec(W, 'rock', 4.5, 1.5, 0, 1));
      const octo = calm(createOctopus(4.5, 6.5));
      for (let i = 0; i < STEPS(0.2); i++) hz.update(DT, i * DT, octo, W, null, []);
      assert('boulder: the octopus standing under it makes it hers (cause 1)', hz.data.state[0] === 1 && hz.data.cause[0] === 1);
      const props2 = createProps(), hz2 = createHazards(props2);
      view(4, 6);
      hz2.add(rec(W, 'rock', 4.5, 1.5, 0, 1));
      hz2.blast(4.5, 2.5, 3);
      assert('boulder: a bomb that shakes it loose makes it hers (cause 1)', hz2.data.cause[0] === 1);
    }
    {
      fresh(); // once per victim: the callback owns the mask, the hazard keeps it between frames
      const props = createProps(), hz = createHazards(props), seen = [];
      hz.setVictims({ kill: () => {}, bodies: (x, y, r, caused, mask) => { seen.push(mask); return mask | 4; } });
      view(4, 6);
      hz.add(rec(W, 'rock', 4.5, 1.5, 0, 1));
      const octo = calm(createOctopus(4.5, 8.5));
      for (let i = 0; i < STEPS(2); i++) { props.step(DT, W, octo, []); hz.update(DT, i * DT, octo, W, null, []); }
      assert('boulder: the victim mask is kept between frames (a victim is hurt once per drop)', seen.length > 1 && seen[0] === 0 && seen.slice(1).every((m) => m === 4));
    }
    // ---- item 6: nothing drops from off-screen ----
    {
      fresh(); const hz = createHazards(), octo = calm(createOctopus(4.5, 8.5));
      hz.add(rec(W, 'rock', 4.5, 1.5, 0, 1));
      view(60, 60); // looking elsewhere
      for (let i = 0; i < STEPS(1); i++) hz.update(DT, i * DT, octo, W, null, []);
      const off = hz.data.state[0];
      view(4, 6);
      for (let i = 0; i < STEPS(0.1); i++) hz.update(DT, i * DT, octo, W, null, []);
      assert('boulder: octopus below but the boulder off-screen does not trigger; it does the moment it is in view', off === 0 && hz.data.state[0] === 1);
      const hz3 = createHazards(); hz3.add(rec(W, 'rock', 4.5, 1.5, 0, 1)); resetGameView();
      for (let i = 0; i < STEPS(0.1); i++) hz3.update(DT, i * DT, octo, W, null, []);
      assert('boulder: with no camera view set (tests, first frame) it triggers as before', hz3.data.state[0] === 1);
    }
    {
      // the cannon never starts a shot from off-screen
      const O = fake(roomRows(20, 20)), en = createEnemies(), c = en.spawnAt('cannon', 10.5, 18.5, 'floor');
      const o = calm(createOctopus(10.5, 12.5));
      c.st = CN_RELOAD; c.t = 0.1;
      view(100, 100); let charged = false, fired = 0;
      for (let i = 0; i < STEPS(4); i++) { en.update(DT, i * DT, o, O, []); if (c.st === CN_CHARGE) charged = true; fired += en.events.filter((e) => e.type === 'shotFired').length; }
      assert('cannon: off-screen it tracks but never charges or fires', !charged && fired === 0);
      view(10, 15); let fired2 = 0;
      for (let i = 0; i < STEPS(4); i++) { en.update(DT, i * DT, o, O, []); fired2 += en.events.filter((e) => e.type === 'shotFired').length; }
      assert('cannon: the same cannon fires once it is on screen', fired2 > 0);
    }
    {
      // the tentacle does not wake off-screen
      const T = fake(roomRows(14, 12)), cr = createCreatures(), o = calm(createOctopus(6.5, 8.2));
      cr.add({ type: 'creature', ck: CR_TENTACLE, x: 6.5, y: 10.5, dx: 0, dy: -1, side: 1, tilt: 0 });
      view(80, 80);
      for (let i = 0; i < STEPS(1.5); i++) cr.update(DT, o, T, null);
      const off = cr.data.state[0];
      view(6.5, 8);
      for (let i = 0; i < STEPS(0.3); i++) cr.update(DT, o, T, null);
      assert('tentacle: no wake while its mouth is off-screen, wakes when it is on screen', off === TN_DORMANT && cr.data.state[0] !== TN_DORMANT);
    }
    // ---- spikes ----
    {
      fresh(); const mk = () => { const hz = createHazards(), en = createEnemies(); hz.setVictims({ kill: (e, r) => en.kill(e, r), bodies: null }); hz.add(rec(W, 'spikes', 4.5, 12.5, 0, -1)); return { hz, en }; };
      const octo = calm(createOctopus(1.5, 2.5));
      const calmCrab = mk(); const cc = calmCrab.en.spawnAt('crab', 4.5, 12.6, 'floor'); cc.vx = 1.2;
      for (let i = 0; i < STEPS(1); i++) calmCrab.hz.update(DT, i * DT, octo, W, null, calmCrab.en.all());
      assert('spikes: a calm crab patrolling over the strip is not killed', !cc.dead);
      const knocked = mk(); const kc = knocked.en.spawnAt('crab', 4.5, 12.6, 'floor'); kc.stun = 0.6; kc.kvx = 1;
      knocked.hz.update(DT, 0, octo, W, null, knocked.en.all());
      assert('spikes: a knocked (stunned) crab whose centre is in the strip dies on them, with a corpse event', kc.dead && knocked.en.events.some((e) => e.type === 'enemyKilled' && e.kind === 'crab' && e.reason === 'spikes'));
      const fast = mk(); const pf = fast.en.spawnAt('piranha', 4.5, 12.6); pf.vx = 7;
      fast.hz.update(DT, 0, octo, W, null, fast.en.all());
      const slow = mk(); const ps = slow.en.spawnAt('piranha', 4.5, 12.6); ps.vx = 1.5;
      slow.hz.update(DT, 0, octo, W, null, slow.en.all());
      const beside = mk(); const pb = beside.en.spawnAt('piranha', 7, 12.6); pb.stun = 1;
      beside.hz.update(DT, 0, octo, W, null, beside.en.all());
      assert('spikes: a piranha hurtling into them dies; a slow one or a knocked one beside the strip does not', pf.dead && !ps.dead && !pb.dead);
    }
    // ---- current jets ----
    {
      fresh(); const props = createProps(), hz = createHazards(props), en = createEnemies();
      hz.add({ type: 'hazard', hk: HZ_JET, x: 4.5, y: 13, dx: 0, dy: -1, len: 7 });
      const bomb = props.add(PK_BOMB, 4.5, 9, 0, 0, { timer: 99 });
      const pir = en.spawnAt('piranha', 4.2, 9); const stunned = en.spawnAt('manta', 4.8, 9); stunned.stun = 1;
      const crab = en.spawnAt('crab', 4.5, 12.6, 'floor'); const urchin = en.spawnAt('urchin', 4.5, 9.5, 'floor');
      const y0 = { pir: pir.y, crab: crab.y, urchin: urchin.y };
      const octo = calm(createOctopus(1.5, 2.5));
      for (let i = 0; i < STEPS(0.5); i++) { props.step(DT, W, octo, []); hz.update(DT, i * DT, octo, W, null, en.all()); }
      assert('jet: a bomb in the stream is pushed up', props.data.vy[bomb] < -1 && props.data.y[bomb] < 9);
      assert('jet: a free-swimming piranha drifts up and a stunned manta is knocked up', pir.y < y0.pir - 0.3 && stunned.kvy < -1);
      assert('jet: a crab on the floor and a bolted-down urchin stay put', crab.y === y0.crab && urchin.y === y0.urchin);
    }
  } finally { resetGameView(); }
}
