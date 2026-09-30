// v2 run flow (V2-PLAN section 10, B1-1), behind ?v2=1. A tiny flat state machine, no DOM:
//
//   hub -> tutorial -> biome1 L1 -> L2 -> L3 -> end screen -> hub
//   death anywhere returns to the hub.
//
// The tutorial is played once (the save remembers it); after that the hub entrance goes
// straight to Shallows 1-1. main.js owns the fade and loads whatever levelSpec() asks for.

import { hashSeed } from './rng.js';

export const S_HUB = 0, S_TUTORIAL = 1, S_BIOME = 2, S_END = 3;
export const STATE_NAMES = ['hub', 'tutorial', 'biome1', 'end'];
export const BIOME_LEVELS = 3;
export const BIOME_NAME = 'Shallows';

export const EV_ENTER_DIVE = 1, EV_EXIT = 2, EV_DEATH = 3, EV_CONTINUE = 4;

/** @param {number} seed @param {{tutorialDone?:boolean}} [opts] */
export function createRun(seed, opts = {}) {
  return {
    state: S_HUB,
    level: 0,            // 1..BIOME_LEVELS while in the biome, else 0
    seed: seed >>> 0,    // the run seed: every dive derives its own level seed from it
    dives: 0,            // dives started, salts diveSeed
    diveSeed: seed >>> 0,
    tutorialDone: !!opts.tutorialDone,
    levelsCleared: 0,    // biome levels exited in the current dive
    deaths: 0,
  };
}

function startDive(run) {
  run.diveSeed = hashSeed(run.seed, run.dives++);
  run.state = S_BIOME;
  run.level = 1;
  run.levelsCleared = 0;
}

/**
 * Apply an event. Returns true when the state or level changed (the caller then loads
 * levelSpec(run) behind a fade); events that do not apply in the current state return false.
 */
export function runEvent(run, ev) {
  if (ev === EV_DEATH) {
    run.deaths++;
    run.state = S_HUB; run.level = 0; run.levelsCleared = 0;
    return true;
  }
  switch (run.state) {
    case S_HUB:
      if (ev !== EV_ENTER_DIVE) return false;
      if (run.tutorialDone) startDive(run); else run.state = S_TUTORIAL;
      return true;
    case S_TUTORIAL:
      if (ev !== EV_EXIT) return false;
      run.tutorialDone = true;
      startDive(run);
      return true;
    case S_BIOME:
      if (ev !== EV_EXIT) return false;
      run.levelsCleared++;
      if (run.level < BIOME_LEVELS) run.level++;
      else { run.state = S_END; run.level = 0; }
      return true;
    case S_END:
      if (ev !== EV_CONTINUE) return false;
      run.state = S_HUB; run.level = 0;
      return true;
    default:
      return false;
  }
}

/** What to load for the current state: {kind:'hub'|'tutorial'|'generated'|'end', seed, levelIndex}. */
export function levelSpec(run) {
  switch (run.state) {
    case S_HUB: return { kind: 'hub', seed: run.seed, levelIndex: 0 };
    case S_TUTORIAL: return { kind: 'tutorial', seed: run.seed, levelIndex: 0 };
    case S_BIOME: return { kind: 'generated', seed: run.diveSeed, levelIndex: run.level - 1 };
    default: return { kind: 'end', seed: run.seed, levelIndex: 0 };
  }
}

/** HUD text, e.g. "Hub", "Tutorial", "Shallows 1-2". */
export function stageLabel(run) {
  switch (run.state) {
    case S_HUB: return 'Hub';
    case S_TUTORIAL: return 'Tutorial';
    case S_BIOME: return BIOME_NAME + ' 1-' + run.level;
    default: return BIOME_NAME + ' cleared';
  }
}

/** True while a playable world is loaded (the end screen is an overlay over the last level). */
export function isPlaying(run) { return run.state !== S_END; }
/** Hub and tutorial: no Beholder timer, no enemies. */
export function isSafeState(run) { return run.state === S_HUB || run.state === S_TUTORIAL; }
