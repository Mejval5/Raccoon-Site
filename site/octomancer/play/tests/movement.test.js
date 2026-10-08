// Movement regression suite (2026-10-08). Daniel: "the octopus can still get stuck in corners very often when just swimming,
// then I need to dash to get out. Make a basic movement test environment that is not using the level generator but a
// pre-made room, to ensure no regressions for movement when we touch it."
//
// The room is data/movement-test.json (open it in the game with ?movetest=1). Every check below swims the octopus with the
// real input snapshot, swim, collision and props at 50 Hz (tests/movement.js), never with a dash. Run it after ANY change to
// octopus.js, physics.js, outline.js, world-v2.js's outline or props.js's block pushing.
//
// Root cause found with it: from rest the swim push (octopus.js move()) had no velocity direction to work with and gave NO
// thrust, so a body pressed into a floor corner (both velocity components cancelled by the walls and the idle sink) or left
// resting on a floor for a few seconds could not swim anywhere until a dash gave it speed.
import { STEP } from '../js/loop.js';
import { createOctopus, stepOctopus } from '../js/octopus.js';
import { OCTO_IDLE_SINK, OCTO_RADIUS } from '../js/config.js';
import { MAT_ROCK, MAT_BEDROCK, MAT_BONE, MAT_TIMBER, MAT_MASONRY } from '../js/materials.js';
import { createMoveWorld, createMoveSim, sweep, restAndLeave, tour, wallCells, fits } from './movement.js';

export async function runMovementTests(assert) {
  const json = await (await fetch('../data/movement-test.json')).json();
  const world = createMoveWorld(json);
  const sim = createMoveSim(world, world.startX, world.startY);

  // --- the room itself ---
  const mats = new Set(world.level.tiles);
  assert('movement room: a hand-made map (authored, not generated), 60x40', world.authored && world.width === 60 && world.height === 40);
  assert('movement room: every terrain material is in it (rock, bedrock, bone, timber, masonry)', [MAT_ROCK, MAT_BEDROCK, MAT_BONE, MAT_TIMBER, MAT_MASONRY].every((m) => mats.has(m)));
  assert('movement room: two pushable blocks, each resting against a wall', json.spawns.filter((s) => s.type === 'block').length === 2
    && json.spawns.every((s) => world.isSolid(s.x - 1, s.y) || world.isSolid(s.x + 1, s.y)));
  assert('movement room: the exit is sealed in rock (the room leads nowhere)', ['-1,0', '1,0', '0,-1', '0,1'].every((d) => { const [dx, dy] = d.split(',').map(Number); return world.isSolid(world.level.exitX + dx, world.level.exitY + dy); }));
  assert(`movement room: every tour waypoint is a spot the body fits on (${json.tour.length} waypoints)`, json.tour.every((p) => fits(sim, p[0], p[1], -0.25)));
  const cells = wallCells(sim);
  assert(`movement room: plenty of wall-side cells to sweep (${cells.length})`, cells.length > 600);

  // --- the root cause, in isolation: a body at rest on a floor must swim off it at once ---
  {
    const floor = { isSolid: (tx, ty) => ty >= 10 };
    const o = createOctopus(5, 10 - OCTO_RADIUS); o.feel = true; o.sink = OCTO_IDLE_SINK;
    for (let i = 0; i < 30 / STEP; i++) stepOctopus(o, { move: { x: 0, y: 0 }, dash: { pressed: false } }, STEP, floor); // 30 s at rest
    const y0 = o.y, x0 = o.x, restSpeed = Math.hypot(o.vx, o.vy);
    for (let i = 0; i < 25; i++) stepOctopus(o, { move: { x: 0, y: -1 }, dash: { pressed: false } }, STEP, floor);
    assert(`at rest on a floor for 30 s (speed ${restSpeed.toExponential(1)}), half a second of "up" swims it off (${(y0 - o.y).toFixed(2)} tiles)`, y0 - o.y > 0.5);
    const p = createOctopus(5, 10 - OCTO_RADIUS); p.feel = true; p.sink = OCTO_IDLE_SINK;
    for (let i = 0; i < 25; i++) stepOctopus(p, { move: { x: 1, y: 0 }, dash: { pressed: false } }, STEP, floor);
    assert(`at rest on a floor, half a second of "right" slides along it (${(p.x - x0).toFixed(2)} tiles)`, p.x - x0 > 0.5);
  }

  // --- sweep: from every wall-side cell, each of 8 stick directions, then swim away from wherever it stopped ---
  {
    const s = sweep(sim, 1, 60, cells, true);
    assert(`sweep, full stick: ${s.runs} runs, no snag (stopped though the walls leave a way within 70 deg of the stick)` + (s.snags.length ? ' ' + JSON.stringify(s.snags.slice(0, 3)) : ''), s.snags.length === 0);
    assert(`sweep, full stick: ${s.leaves} swim-aways after pressing into a wall, none stuck` + (s.stuck.length ? ' ' + JSON.stringify(s.stuck.slice(0, 3)) : ''), s.stuck.length === 0 && s.leaves > 1000);
    assert('sweep, full stick: the body never ends up inside rock or sunk into the rim' + (s.faults.length ? ' ' + JSON.stringify(s.faults.slice(0, 3)) : ''), s.faults.length === 0);
    const half = cells.filter((c, i) => i % 3 === 0);
    const h = sweep(sim, 0.5, 60, half, true);
    assert(`sweep, half stick (a third of the cells): ${h.runs} runs, no snag, no stuck swim-away, never in rock` + (h.snags.length + h.stuck.length + h.faults.length ? ' ' + JSON.stringify([...h.snags, ...h.stuck, ...h.faults].slice(0, 3)) : ''), h.snags.length === 0 && h.stuck.length === 0 && h.faults.length === 0);
  }

  // --- rest and leave: settle on every floor cell for 8 s (sink + drag bleed the speed off), then every open direction ---
  {
    const r = restAndLeave(sim, 8, 1);
    assert(`rest and leave: ${r.spots} floor spots x 8 directions (${r.runs} open), every open way swims >= 0.2 tiles in 1 s` + (r.fails.length ? ' ' + JSON.stringify(r.fails.slice(0, 3)) : ''), r.fails.length === 0 && r.spots > 200);
  }

  // --- the tour: steer through every feature like a player, resting in corners, at the fixed step and at 30/60/120 Hz ---
  for (const mag of [1, 0.6]) {
    for (const hz of [0, 30, 60, 120]) {
      const t = tour(createMoveSim(createMoveWorld(json), world.startX, world.startY), json.tour, mag, hz);
      assert(`tour (${json.tour.length} waypoints, stick ${mag}, ${hz ? hz + ' Hz display' : 'fixed steps'}): every leg in its time budget, never in rock, no jitter lock (${t.steps} steps, worst jitter run ${t.jitter})` + (t.ok ? '' : ': ' + t.reason), t.ok && t.jitter < 6);
    }
  }
}
