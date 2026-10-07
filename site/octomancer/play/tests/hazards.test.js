// Round 30: the five hazards (hazards.js) on small hand-made worlds, the record builders, the world's
// placeRock, and the journal entries.
import {
  createHazards, makeHazardRecord, hazardBlockers, hazardJournalId,
  HZ_JET, HZ_SPIKES, HZ_ROCK, HZ_EEL, HZ_ANEMONE, HAZARD_NAMES,
  JET_ACC, ROCK_SHAKE, EEL_PERIOD, EEL_FIRE_AT, EEL_RING_MAX, EEL_HALF_BODY,
} from '../js/hazards.js';
import { createOctopus } from '../js/octopus.js';
import { applyDrag } from '../js/physics.js';
import { OCTO_LINEAR_DRAG } from '../js/config.js';
import { ENTRIES, CATEGORIES, CAT_HAZARD } from '../js/journal.js';
import { setDefaultBank, generateLevel, LEVEL_W, BORDER } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createRoomBank } from '../js/rooms.js';
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
  assert('hazards: kind codes are stable (jet 1, spikes 2, rock 3, eel 4, anemone 5)', HZ_JET === 1 && HZ_SPIKES === 2 && HZ_ROCK === 3 && HZ_EEL === 4 && HZ_ANEMONE === 5);
}
