// Test bot for round 22: plays a level headlessly through the REAL input layer (createInput's override
// snapshot), the real octopus swim and the real physics/collision (createLevelWorld's smoothed wall
// outline), following an A* path (pathcheck.js). Not shipped: tests only.
import { createInput } from '../js/input.js';
import { createOctopus, stepOctopus } from '../js/octopus.js';
import { createBombs } from '../js/bomb.js';
import { createProps } from '../js/props.js';
import { STEP } from '../js/loop.js';
import { OCTO_IDLE_SINK } from '../js/config.js';
import { createPathGrid, findPath, segmentFree } from '../js/pathcheck.js';
import { createTutorialState, tutorialStep } from '../js/tutorial.js';

const noEnemies = { killInRadius() { return 0; } };

/** @param {{startX:number,startY:number,width:number,height:number,tileAt:Function,isSolid:Function,update:Function,reachedExit:Function}} world */
export function createBotSim(world, opts = {}) {
  const input = createInput();
  const octo = createOctopus(world.startX, world.startY);
  octo.feel = true; octo.sink = OCTO_IDLE_SINK; // the game's v2 octopus: idle sink, dash recoil, landing squash
  const props = createProps();
  const sim = {
    world, input, octo, props, bombs: createBombs(props), steps: 0, dashes: 0, tutorial: opts.tutorial ? createTutorialState() : null,
    minHearts: octo.hearts, wallIntact: opts.wallIntact || null,
  };
  return sim;
}

/** One fixed step with a move vector and optional dash / bomb presses. Mirrors main.js's step order. */
export function tick(sim, mx, my, act = {}) {
  const { world, octo, input } = sim;
  input.setOverride({ move: { x: mx, y: my }, dash: !!act.dash, bomb: !!act.bomb, hand: !!act.hand });
  const snap = input.snapshot();
  stepOctopus(octo, snap, STEP, world);
  if (octo.dashedThisStep) sim.dashes++;
  world.update(octo.y);
  if (sim.tutorial) tutorialStep(sim.tutorial, octo, sim.wallIntact ? sim.wallIntact() : true, STEP);
  if (sim.onStep) sim.onStep(sim); // e.g. the tutorial's rooms (tutorial.js tutorialRooms) opening their doors
  sim.props.step(STEP, world, octo);
  sim.bombs.update(STEP, world, octo, noEnemies);
  if (snap.bomb.pressed) sim.bombs.place(octo, octo.x, octo.y, act.aim || null); // thrown along act.aim, else a soft toss
  sim.steps++;
  if (octo.hearts < sim.minHearts) sim.minHearts = octo.hearts;
}

/**
 * Daniel 2026-10-08: whirlpools are entered with the hand (F), not by touch. At the exit the bot presses F (through the real
 * input layer) and the press counts when the octopus is inside the whirlpool's trigger then (main.js portalAt: reachedExit).
 */
export function enterExit(sim) {
  const { world, octo, input } = sim;
  tick(sim, 0, 0, { hand: true });
  const snap = input.snapshot(); // (the override repeats: what the step saw)
  const ok = !!snap.hand.pressed && world.reachedExit(octo.x, octo.y);
  tick(sim, 0, 0);
  sim.entered = ok;
  return ok;
}

export function makeGrid(world) {
  return createPathGrid(world.width, world.height, (x, y) => world.tileAt(x, y) !== 0);
}

/**
 * Follow an A* path to within goalR of (gx,gy). Replans every 40 steps and when stuck. Returns
 * {ok, steps, reason}.
 */
export function follow(sim, gx, gy, goalR, maxSteps = 4000, act = null) {
  const { octo, world } = sim;
  let grid = null, path = null, pi = 0, since = 1e9, bestD = 1e9, stall = 0;
  for (let n = 0; n < maxSteps; n++) {
    const dg = Math.hypot(octo.x - gx, octo.y - gy);
    if (dg <= goalR) return { ok: true, steps: n };
    if (octo.dead) return { ok: false, steps: n, reason: 'dead' };
    if (dg < bestD - 0.02) { bestD = dg; stall = 0; } else stall++;
    if (!path || since >= 40 || stall > 150) {
      grid = makeGrid(world);
      path = findPath(grid, octo.x, octo.y, gx, gy, Math.max(0.3, goalR - 0.1));
      pi = 0; since = 0; if (stall > 150) { stall = 0; bestD = 1e9; }
      if (!path) return { ok: false, steps: n, reason: 'no path' };
    }
    since++;
    const P = path.points, np = P.length / 2;
    while (pi < np - 1 && Math.hypot(octo.x - P[pi * 2], octo.y - P[pi * 2 + 1]) < 0.6) pi++;
    let tj = pi;
    for (let j = Math.min(np - 1, pi + 14); j > pi; j--) {
      if (segmentFree(grid, octo.x, octo.y, P[j * 2], P[j * 2 + 1])) { tj = j; break; }
    }
    const tx = P[tj * 2] - octo.x, ty = P[tj * 2 + 1] - octo.y, tl = Math.hypot(tx, ty) || 1;
    tick(sim, tx / tl, ty / tl, act ? act(sim, n) : {});
  }
  return { ok: false, steps: maxSteps, reason: 'timeout' };
}

/** Idle for a number of steps (no input). */
export function wait(sim, steps) { for (let i = 0; i < steps; i++) tick(sim, 0, 0); }
