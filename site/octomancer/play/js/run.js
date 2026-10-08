// v2 run flow (V2-PLAN section 10, B1-1), behind ?v2=1. A tiny flat state machine, no DOM:
//
//   hub -> biome1 L1 -> L2 -> L3 -> [rest grotto] -> end screen -> hub
//   hub -> tutorial -> hub (Spelunky style: the tutorial is its own place, entered from its ring in the hub)
//   (the rest grotto, section 14: a calm room with a spring that refills hearts and juice and a stall; on when createRun gets rest:true)
//   death anywhere returns to the hub; EV_RESTART (the death screen's / pause menu's 'Restart run') starts a fresh dive at
//   Shallows 1-1 straight away, with exactly the resets a hub visit and a new dive would do.
//
// The dive whirlpool stays sealed until the tutorial has been finished once (the save remembers it); the tutorial stays
// replayable from the hub. main.js owns the fade and loads whatever levelSpec() asks for.

import { hashSeed2 } from './rng.js';

export const S_HUB = 0, S_TUTORIAL = 1, S_BIOME = 2, S_END = 3, S_REST = 4;
export const STATE_NAMES = ['hub', 'tutorial', 'biome1', 'end', 'rest'];
export const REST_NAME = 'The Still Grotto';
export const BIOME_LEVELS = 3;
export const BIOME_NAME = 'Shallows';

export const EV_ENTER_DIVE = 1, EV_EXIT = 2, EV_DEATH = 3, EV_CONTINUE = 4;
/** Hub shortcut ring (unlocked by clearing the biome once): the dive starts at Shallows 1-2. */
export const EV_ENTER_SHORTCUT = 5;
export const SHORTCUT_LEVEL = 2;
/** r39: Marlo's ring in the hub (he was freed in three runs): the dive starts at Shallows 1-3. */
export const EV_ENTER_SHORTCUT3 = 6;
export const SHORTCUT3_LEVEL = 3;
/** The hub's tutorial ring: the tutorial (always open; finishing it opens the dive). */
export const EV_ENTER_TUTORIAL = 7;
/** Quick restart (Spelunky): from a dive (dead or alive) straight into a fresh dive at Shallows 1-1, skipping the hub. */
export const EV_RESTART = 8;
/** Leave the tutorial from the pause menu without finishing it: back to the hub. */
export const EV_LEAVE = 9;

/** Why the octopus died: what hurtOctopus / killOctopus were told (octopus.js `cause`) -> text for the death screen. */
export const CAUSE_TEXT = {
  piranha: 'a piranha', crab: 'a crab', urchin: 'an urchin', horns: 'horned growth', manta: 'a manta',
  shot: 'a stray shot', bomb: 'its own bomb', beholder: 'the Beholder', spikes: 'a spike wall', rock: 'a falling rock',
  eel: 'an electric eel', anemone: 'an anemone', clam: 'a giant clam', tentacle: 'a tentacle', jet: 'a current jet', chest: 'a trapped chest', shopkeeper: 'the Shopkeeper', unknown: 'the dark',
  harpoon: "Marlo's harpoon", pip: "Pip's bite", quill: "Quill's bite", host: "the pool host's bite", block: 'a falling block',
};

/** The same causes as capitalised nouns, for list rows (the journal stats page: 'Piranha', 'Spike wall'). */
export const CAUSE_NAME = {
  piranha: 'Piranha', crab: 'Crab', urchin: 'Urchin', horns: 'Horned growth', manta: 'Manta',
  shot: 'Stray shot', bomb: 'Own bomb', beholder: 'Beholder', spikes: 'Spike wall', rock: 'Falling rock',
  eel: 'Electric eel', anemone: 'Anemone', clam: 'Giant clam', tentacle: 'Tentacle', jet: 'Current jet', chest: 'Trapped chest', shopkeeper: 'Shopkeeper', unknown: 'The dark',
  harpoon: 'Harpoon', pip: 'Pip', quill: 'Quill', host: 'Pool host', block: 'Falling block',
};

/** The death screen's title per cause (Spelunky style). 'The dark took you' stays for the Beholder and for unknown causes. */
export const DEATH_TITLE = {
  piranha: 'Shredded by a piranha', crab: 'Pinched', urchin: 'Spined', horns: 'Gored', manta: 'Rammed by a manta',
  shot: 'Shot', bomb: 'Blown up by your own bomb', beholder: 'The dark took you', spikes: 'Impaled', rock: 'Crushed',
  eel: 'Shocked', anemone: 'Stung', clam: 'Clammed', tentacle: 'Swallowed', jet: 'Swept away', chest: 'A trapped chest',
  shopkeeper: "Shopkeeper's justice", unknown: 'The dark took you',
  harpoon: 'Harpooned', pip: 'Bitten', quill: 'Bitten', host: 'Bitten', block: 'Crushed',
};
export function deathTitle(cause) { return DEATH_TITLE[cause] || DEATH_TITLE.unknown; }

/** The per-dive stats the run summary reports (reset by every dive). */
function newDive(level) {
  return { startLevel: level, reached: level, time: 0, shells: 0, kills: 0, quests: 0, swift: 0, cause: '', over: false }; // swift: Swift Current bonuses earned (swift.js)
}

/** @param {number} seed @param {{tutorialDone?:boolean, shortcut?:boolean, shortcut3?:boolean, juiceStart?:number, rest?:boolean}} [opts] */
export function createRun(seed, opts = {}) {
  return {
    state: S_HUB,
    level: 0,            // 1..BIOME_LEVELS while in the biome, else 0
    seed: seed >>> 0,    // the run seed: every dive derives its own level seed from it
    dives: 0,            // dives started, salts diveSeed
    diveSeed: seed >>> 0,
    nextSeed: null,      // seed typed in the settings menu for the next dive (null = random); the dive's levels come from it exactly
    tutorialDone: !!opts.tutorialDone,
    diveUnlocked: false, // the tutorial was just finished for the first time: the hub plays the unlock moment once (main.js clears it)
    levelsCleared: 0,    // biome levels exited in the current dive
    shells: 0,           // the currency: shells picked up and quest rewards, spent in shops; lost on death
    items: [],           // carried items (items.js): flat array of ids, kept between levels, lost on death
    shopAggro: false,    // Spelunky aggro: the shopkeepers are hostile for the rest of this dive (shop-aggro.js); a new dive resets it
    shopAggroWhy: '',    // what angered them first: 'hurt' | 'shop' | 'theft' | 'kill' | ...
    juice: 0,            // fish juice droplets in the jar (spells.js): kept between levels, reset by a death or a new dive
    juiceStart: opts.juiceStart | 0, // droplets every dive starts with (spells.js juiceStart(): one cast)
    rest: !!opts.rest,   // the zone ends in the rest grotto (S_REST) before the clear screen
    hotbar: null,        // the spell hotbar (hotbar.js), made by main.js; a new dive or a death starts a fresh one
    deaths: 0,
    shortcut3: !!opts.shortcut3, // Marlo's hub ring to Shallows 1-3 (story.marlo >= 3 in save.js)
    shortcut: !!opts.shortcut, // the hub ring to Shallows 1-2: unlocked by finishing the biome once (persisted by save.js)
    dive: newDive(1),    // stats of the current dive
    last: null,          // summary of the dive that just ended (death or biome clear), until the next dive starts
  };
}

/** Earn shells (pickups, quest rewards, relics): the wallet and this dive's "shells collected" stat. */
export function gainShells(run, n) {
  run.shells += n;
  run.dive.shells += n;
}

/**
 * Close the dive and snapshot its stats into run.last (what the death / clear screen shows and save.js records).
 * `depth` ranks runs: the level number reached, or BIOME_LEVELS + 1 for a cleared biome.
 */
export function endDive(run, cleared, cause) {
  const d = run.dive;
  d.over = true;
  if (!cleared) d.cause = cause || 'unknown';
  run.last = {
    cleared: !!cleared,
    level: cleared ? BIOME_LEVELS : run.level || d.reached,
    depth: cleared ? BIOME_LEVELS + 1 : Math.max(1, run.level || d.reached),
    levelsCleared: run.levelsCleared,
    time: d.time, shells: d.shells, kills: d.kills, quests: d.quests, swift: d.swift | 0,
    cause: cleared ? '' : d.cause,
    seed: run.diveSeed, // the dive's own seed: typing it in the settings menu replays the same levels
    shortcutNew: false,
  };
  return run.last;
}

/** A death (or a dropped dive) back to the hub: the dive closes and everything carried is lost. */
function toHub(run, died, cause) {
  if (died) run.deaths++;
  if (died && run.state === S_BIOME && !run.dive.over) endDive(run, false, cause);
  run.state = S_HUB; run.level = 0; run.levelsCleared = 0; run.shells = 0; run.items = [];
  run.shopAggro = false; run.shopAggroWhy = '';
  run.juice = 0; run.hotbar = null;
}

function startDive(run, level = 1, sameSeed = false) {
  if (!sameSeed) run.diveSeed = run.nextSeed !== null && run.nextSeed !== undefined ? run.nextSeed >>> 0 : hashSeed2(run.seed, run.dives);
  run.dives++;
  run.state = S_BIOME;
  run.level = level;
  run.levelsCleared = 0;
  run.shells = 0;
  run.items = [];
  run.shopAggro = false; run.shopAggroWhy = '';
  run.juice = run.juiceStart;
  run.hotbar = null;
  run.dive = newDive(level);
  run.last = null;
}

/**
 * Apply an event (`cause`: EV_DEATH / EV_RESTART, what killed the octopus; `opts.sameSeed`: EV_RESTART replays this dive's seed). Returns true when the state or level changed (the caller then loads
 * levelSpec(run) behind a fade); events that do not apply in the current state return false.
 */
export function runEvent(run, ev, cause, opts) {
  if (ev === EV_DEATH) {
    toHub(run, true, cause);
    return true;
  }
  if (ev === EV_RESTART) {
    // `cause` set: the octopus died (the death screen's button); none: the pause menu, alive (the dive is dropped, not a death)
    if (run.state !== S_BIOME && run.state !== S_REST) return false;
    toHub(run, !!cause, cause); // exactly what the death and the hub visit do ...
    startDive(run, 1, !!(opts && opts.sameSeed)); // ... then what the hub's dive whirlpool does (a seeded run replays its dive seed)
    return true;
  }
  switch (run.state) {
    case S_HUB:
      if (ev === EV_ENTER_SHORTCUT) {
        if (!run.shortcut || !run.tutorialDone) return false;
        startDive(run, SHORTCUT_LEVEL);
        return true;
      }
      if (ev === EV_ENTER_SHORTCUT3) {
        if (!run.shortcut3 || !run.tutorialDone) return false;
        startDive(run, SHORTCUT3_LEVEL);
        return true;
      }
      if (ev === EV_ENTER_TUTORIAL) { run.state = S_TUTORIAL; return true; }
      if (ev !== EV_ENTER_DIVE) return false;
      if (!run.tutorialDone) return false; // the dive is sealed until the tutorial has been finished once
      startDive(run);
      return true;
    case S_TUTORIAL:
      if (ev === EV_LEAVE) { run.state = S_HUB; return true; }
      if (ev !== EV_EXIT) return false;
      if (!run.tutorialDone) run.diveUnlocked = true; // first finish: the hub shows the dive opening
      run.tutorialDone = true;
      run.state = S_HUB; run.level = 0;
      return true;
    case S_BIOME:
      if (ev !== EV_EXIT) return false;
      run.levelsCleared++;
      if (run.level < BIOME_LEVELS) { run.level++; if (run.level > run.dive.reached) run.dive.reached = run.level; }
      else if (run.rest) { run.state = S_REST; } // the zone's last level: rest first (run.level stays the last level)
      else {
        const sum = endDive(run, true);
        sum.shortcutNew = !run.shortcut; // first clear: the hub ring unlocks
        run.shortcut = true;
        run.state = S_END; run.level = 0;
        run.shopAggro = false; run.shopAggroWhy = ''; // the dive is over: the next one starts with calm keepers
      }
      return true;
    case S_REST: {
      if (ev !== EV_EXIT) return false;
      const sum = endDive(run, true);
      sum.shortcutNew = !run.shortcut;
      run.shortcut = true;
      run.state = S_END; run.level = 0;
      return true;
    }
    case S_END:
      if (ev !== EV_CONTINUE) return false;
      run.state = S_HUB; run.level = 0;
      return true;
    default:
      return false;
  }
}

/** The seed the NEXT dive will use (the hub sign previews that dive's first quest with it). */
export function nextDiveSeed(run) { return run.nextSeed !== null && run.nextSeed !== undefined ? run.nextSeed >>> 0 : hashSeed2(run.seed, run.dives); }

/** What to load for the current state: {kind:'hub'|'tutorial'|'generated'|'end', seed, levelIndex}. */
export function levelSpec(run) {
  switch (run.state) {
    case S_HUB: return { kind: 'hub', seed: run.seed, levelIndex: 0 };
    case S_TUTORIAL: return { kind: 'tutorial', seed: run.seed, levelIndex: 0 };
    case S_BIOME: return { kind: 'generated', seed: run.diveSeed, levelIndex: run.level - 1 };
    case S_REST: return { kind: 'rest', seed: run.diveSeed, levelIndex: 0 };
    default: return { kind: 'end', seed: run.seed, levelIndex: 0 };
  }
}

/**
 * The level title card for the current state: {text, sub} ("Shallows 1-2", plus "Seed 42" for a seeded run),
 * or null where no card is shown (hub, tutorial, end screen).
 */
export function levelTitle(run, seeded = false) {
  if (run.state !== S_BIOME) return null;
  return { text: stageLabel(run), sub: seeded ? 'Seed ' + run.diveSeed : '' };
}

/** HUD text, e.g. "Hub", "Tutorial", "Shallows 1-2". */
export function stageLabel(run) {
  switch (run.state) {
    case S_HUB: return 'Hub';
    case S_TUTORIAL: return 'Tutorial';
    case S_BIOME: return BIOME_NAME + ' 1-' + run.level;
    case S_REST: return REST_NAME;
    default: return BIOME_NAME + ' cleared';
  }
}

/** True while a playable world is loaded (the end screen is an overlay over the last level). */
export function isPlaying(run) { return run.state !== S_END; }
/** The hub's dive whirlpool is open (the tutorial has been finished once). */
export function diveOpen(run) { return !!run.tutorialDone; }
/** 'Restart run' applies: in a dive (a Shallows level or the rest grotto). */
export function canQuickRestart(run) { return run.state === S_BIOME || run.state === S_REST; }

/** Hub, tutorial and the rest grotto: no Beholder timer, no enemies. */
export function isSafeState(run) { return run.state === S_HUB || run.state === S_TUTORIAL || run.state === S_REST; }
