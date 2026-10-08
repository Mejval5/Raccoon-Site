// Movement test harness (2026-10-08, "the octopus gets stuck in corners when just swimming"). Swims the octopus through the
// hand-made movement test room (data/movement-test.json, the same room ?movetest=1 opens in the game) with the REAL input
// snapshot (input.js override), the real swim (octopus.js, v2 feel: idle sink, squash), the real wall collision (world-v2.js's
// traced + smoothed outline, physics.js) and the real props (pushable blocks), at the fixed 50 Hz step. Never a dash.
// Not shipped: tests only. tests/movement.test.js asserts on what these return; node can run them too (no DOM needed).
import { parseAuthoredMap } from '../js/authored.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createLoop, STEP } from '../js/loop.js';
import { PK_BLOCK } from '../js/props.js';
import { createBotSim, tick } from './bot.js';

const DIRS = 8;
const STALL_MOVE = 0.03;   // tiles moved in the last STALL_WINDOW steps below which a held stick counts as stalled
const STALL_WINDOW = 20;
const PEN_TOL = 0.06;      // how far the body may sit inside the drawn rim (the resolver's leftover) before it counts as in rock

/** The room as a v2 world (the same createLevelWorld real levels use, from an authored map: never the generator). */
export function createMoveWorld(json) {
  return createLevelWorld(1, 0, { level: parseAuthoredMap(json) });
}

/** A bot sim (tests/bot.js: real input, swim, props) in the room, with the room's pushable blocks placed. */
export function createMoveSim(world, x, y) {
  const sim = createBotSim(world);
  for (const s of world.level.spawns) if (s.type === 'block') sim.props.add(PK_BLOCK, s.x, s.y);
  // let the blocks settle on their floors before anything swims
  for (let i = 0; i < 25; i++) sim.props.step(STEP, world, null);
  place(sim, x, y);
  return sim;
}

export function place(sim, x, y) {
  const o = sim.octo;
  o.x = o.prevX = x; o.y = o.prevY = y; o.vx = o.vy = 0; o.angle = 0; o.squash = 0; o.airT = 0;
}

/** Distance from (x, y) to the nearest wall: the drawn rim (outline segments) or a pushable block's box. */
export function clearance(sim, x, y) {
  const world = sim.world;
  let best = 9;
  for (const s of world.wallSegmentsNear(x, y, 1.6)) {
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1, l2 = ex * ex + ey * ey;
    let t = l2 > 1e-12 ? ((x - s.x1) * ex + (y - s.y1) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - s.x1 - ex * t, y - s.y1 - ey * t);
    if (d < best) best = d;
  }
  const d = sim.props.data;
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || d.kind[i] !== PK_BLOCK) continue;
    const r = d.radius[i];
    const qx = Math.max(Math.abs(x - d.x[i]) - r, 0), qy = Math.max(Math.abs(y - d.y[i]) - r, 0);
    const inside = Math.abs(x - d.x[i]) < r && Math.abs(y - d.y[i]) < r;
    const db = inside ? 0 : Math.hypot(qx, qy);
    if (db < best) best = db;
  }
  return world.isSolid(x, y) ? 0 : best;
}

/** Could the body stand at (x, y)? */
export function fits(sim, x, y, slack = 0.01) { return clearance(sim, x, y) >= sim.octo.radius + slack; }

/** Is any direction within `cone` radians of angle `a` open for a short move from (x, y)? */
function openWithin(sim, x, y, a, cone, step = 0.25) {
  for (let k = -6; k <= 6; k++) {
    const b = a + (cone * k) / 6;
    if (fits(sim, x + Math.cos(b) * step, y + Math.sin(b) * step, 0.005)) return true;
  }
  return false;
}

/** Per-step health of the body: not inside rock, no deeper than PEN_TOL inside the rim. Returns '' or what is wrong. */
export function bodyFault(sim) {
  const o = sim.octo;
  if (sim.world.isSolid(o.x, o.y)) return 'centre inside rock';
  const c = clearance(sim, o.x, o.y);
  if (c < o.radius - PEN_TOL) return 'sunk ' + (o.radius - c).toFixed(3) + ' into the wall';
  return '';
}

/** Open cells whose centre the body fits on and that lie within `near` of a wall (where snags happen). */
export function wallCells(sim, near = 1.6) {
  const w = sim.world, out = [];
  for (let ty = 2; ty < w.height - 2; ty++) for (let tx = 2; tx < w.width - 2; tx++) {
    if (w.tileAt(tx, ty) !== 0) continue;
    const x = tx + 0.5, y = ty + 0.5, c = clearance(sim, x, y);
    if (c >= sim.octo.radius + 0.02 && c < near) out.push({ x, y });
  }
  return out;
}

/**
 * Sweep: from every wall cell, hold each of 8 stick directions (magnitude `mag`) for 1.2 s from rest. A stall (moved < 0.03
 * in the last 0.4 s) is a SNAG when the walls leave an opening within 70 degrees of the stick (so the octopus should have
 * slid that way). Also counts body faults and jitter (the body reversing every other step without getting anywhere).
 */
export function sweep(sim, mag = 1, steps = 60, cells = null, leave = true) {
  const snags = [], faults = [], stuck = [];
  let runs = 0, leaves = 0;
  for (const c of cells || wallCells(sim)) {
    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * Math.PI * 2, mx = Math.cos(a) * mag, my = Math.sin(a) * mag;
      place(sim, c.x, c.y);
      const hist = [];
      let fault = '';
      for (let i = 0; i < steps; i++) {
        tick(sim, mx, my);
        hist.push(sim.octo.x, sim.octo.y);
        if (!fault) fault = bodyFault(sim);
      }
      runs++;
      const o = sim.octo, n = hist.length / 2, j = n - 1 - STALL_WINDOW;
      const moved = Math.hypot(hist[(n - 1) * 2] - hist[j * 2], hist[(n - 1) * 2 + 1] - hist[j * 2 + 1]);
      if (fault) faults.push({ x: c.x, y: c.y, deg: k * 45, fault });
      if (moved < STALL_MOVE && openWithin(sim, o.x, o.y, a, (70 * Math.PI) / 180)) snags.push({ x: c.x, y: c.y, deg: k * 45, at: [+o.x.toFixed(2), +o.y.toFixed(2)], v: +Math.hypot(o.vx, o.vy).toFixed(4) });
      if (!leave || moved >= STALL_MOVE) continue;
      // pressed into the wall and stopped: now swim away (back, and both ways along it). Wherever it is open right next
      // to the body, 0.6 s of stick must carry it 0.15 tiles that way.
      const st = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, angle: o.angle, sq: o.squash, air: o.airT };
      for (const turn of [180, 90, -90]) {
        const b = a + (turn * Math.PI) / 180, ux = Math.cos(b), uy = Math.sin(b);
        if (!fits(sim, st.x + ux * 0.3, st.y + uy * 0.3, 0.005)) continue;
        o.x = o.prevX = st.x; o.y = o.prevY = st.y; o.vx = st.vx; o.vy = st.vy; o.angle = st.angle; o.squash = st.sq; o.airT = st.air;
        for (let i = 0; i < 30; i++) tick(sim, ux * mag, uy * mag);
        leaves++;
        const along = (o.x - st.x) * ux + (o.y - st.y) * uy;
        if (along < 0.15) stuck.push({ x: c.x, y: c.y, pressDeg: k * 45, leaveDeg: (k * 45 + turn + 360) % 360, at: [+st.x.toFixed(2), +st.y.toFixed(2)], along: +along.toFixed(3) });
      }
    }
  }
  return { runs, leaves, snags, faults, stuck };
}

/**
 * Rest and leave: drop the body on every floor cell (and into every pit and corner), let it sink and settle for `restS` s
 * (the idle sink presses it into the floor, the drag bleeds off its speed), then hold each of 8 directions for 1 s. Any
 * direction that is open right next to the body must carry it at least 0.2 tiles that way. This is the "stuck in a corner
 * until I dash" report: a settled body had no thrust at all.
 */
export function restAndLeave(sim, restS = 8, mag = 1, cells = null) {
  const fails = [];
  let runs = 0, spots = 0;
  const w = sim.world;
  const list = cells || wallCells(sim).filter((c) => w.isSolid(c.x, c.y + 1) || w.isSolid(c.x - 1, c.y + 1) || w.isSolid(c.x + 1, c.y + 1));
  for (const c of list) {
    place(sim, c.x, c.y);
    for (let i = 0; i < Math.round(restS / STEP); i++) tick(sim, 0, 0);
    const o = sim.octo, rest = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, angle: o.angle, sq: o.squash, air: o.airT };
    spots++;
    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
      if (!fits(sim, rest.x + ux * 0.3, rest.y + uy * 0.3, 0.005)) continue; // blocked that way: nothing to expect
      o.x = o.prevX = rest.x; o.y = o.prevY = rest.y; o.vx = rest.vx; o.vy = rest.vy; o.angle = rest.angle; o.squash = rest.sq; o.airT = rest.air;
      for (let i = 0; i < 50; i++) tick(sim, ux * mag, uy * mag);
      runs++;
      const along = (o.x - rest.x) * ux + (o.y - rest.y) * uy;
      if (along < 0.2) fails.push({ x: c.x, y: c.y, rest: [+rest.x.toFixed(2), +rest.y.toFixed(2)], deg: k * 45, along: +along.toFixed(3), restSpeed: Math.hypot(rest.vx, rest.vy) });
    }
  }
  return { spots, runs, fails };
}

/**
 * The tour: swim the room's waypoint route (json.tour, tile units) the way a player steers, the stick pointed straight at the
 * next waypoint (magnitude `mag`), each leg within a time budget (its length at a quarter of the stick's top speed, plus 2 s).
 * A waypoint [x, y, s] with a third number is a rest: once there the stick is let go for s seconds (the body sinks and settles
 * into whatever corner it is in), then the tour swims on from there. `hz` > 0 runs it through the real fixed-step loop
 * (loop.js manualFrames) at that display rate, the stick read once per frame like the game does.
 * Returns {ok, leg, reason, steps, fault, jitter}.
 */
export function tour(sim, route, mag = 1, hz = 0) {
  const o = sim.octo;
  place(sim, route[0][0], route[0][1]);
  let leg = 1, legSteps = 0, steps = 0, fault = '', jitter = 0, worstJitter = 0, budget = 0, rest = 0, stick = { x: 0, y: 0 };
  let px = o.x, py = o.y, pdx = 0, pdy = 0, done = false, failed = '';
  const speed = 5.5 * Math.sqrt(mag) / Math.SQRT2; // the swim's top speed at this stick (joystick curve mag^0.5)
  const legBudget = (l) => Math.round((Math.hypot(route[l][0] - route[l - 1][0], route[l][1] - route[l - 1][1]) / (speed * 0.25) + 2) / STEP);
  budget = legBudget(1);
  const aim = () => {
    if (rest > 0) { stick = { x: 0, y: 0 }; return; }
    const tx = route[leg][0] - o.x, ty = route[leg][1] - o.y, tl = Math.hypot(tx, ty) || 1;
    stick = { x: (tx / tl) * mag, y: (ty / tl) * mag };
  };
  const nextLeg = () => {
    leg++; legSteps = 0;
    if (leg >= route.length) done = true; else budget = legBudget(leg);
  };
  /** After each fixed step: body health, jitter, waypoint reached / rest over / leg out of time. */
  const after = () => {
    steps++;
    if (!fault) fault = bodyFault(sim);
    // jitter: the body reversing direction step after step with real steps both ways (a collision fight, not a slide)
    const dx = o.x - px, dy = o.y - py;
    if (dx * pdx + dy * pdy < 0 && Math.hypot(dx, dy) > 0.01 && Math.hypot(pdx, pdy) > 0.01) jitter++;
    else jitter = Math.max(0, jitter - 0.25);
    if (jitter > worstJitter) worstJitter = jitter;
    pdx = dx; pdy = dy; px = o.x; py = o.y;
    if (fault) { done = true; failed = 'fault: ' + fault + ' at ' + o.x.toFixed(2) + ',' + o.y.toFixed(2); return; }
    if (rest > 0) { if (--rest === 0) nextLeg(); return; }
    legSteps++;
    if (Math.hypot(o.x - route[leg][0], o.y - route[leg][1]) < 0.45) {
      const s = route[leg][2] || 0;
      if (s > 0) rest = Math.round(s / STEP); else nextLeg();
    } else if (legSteps > budget) {
      done = true; failed = 'leg ' + leg + ' (to ' + route[leg][0] + ',' + route[leg][1] + ') timed out at ' + o.x.toFixed(2) + ',' + o.y.toFixed(2);
    }
  };
  if (!hz) {
    while (!done) { aim(); tick(sim, stick.x, stick.y); after(); }
  } else {
    // through the real loop at a display rate: steps happen inside manualFrames, the stick is re-aimed once per frame
    const loop = createLoop(() => { if (!done) { tick(sim, stick.x, stick.y); after(); } }, () => {});
    const frameMs = 1000 / hz;
    for (let f = 0; f < 400000 && !done; f++) { aim(); loop.manualFrames(1, frameMs); }
    if (!done) failed = 'never finished';
  }
  return { ok: !failed, leg, reason: failed, steps, fault, jitter: +worstJitter.toFixed(2) };
}
