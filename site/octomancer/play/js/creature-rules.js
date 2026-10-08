// Unified creature rules (2026-10-08, Daniel: "all enemies should have the same treatment in terms of physics, collision,
// damage ... some have immunities to knock-out, some are one-hit splat, some are different, like Spelunky").
//
// ONE table of creatures (CREATURES) and ONE table of damage sources (SOURCES), and one pure rule (resolveHit) that turns
// (creature kind, source) into an outcome. Every system that holds bodies (enemies.js, creatures.js, npcs.js,
// shopkeeper.js) applies hits through its own applyHit(), and applyHit asks resolveHit; damage.js is the shared entry point
// that finds the bodies a hazard or a blast touches and calls them. See octomancer-web/CREATURES.md.
//
// Units: hp and dmg are in "ink units" (one Ink Jet blob = 4). The octopus counts hearts instead, so each source carries its
// own octopus outcome (SOURCES[src].octo) and damage.js octoHit() applies it.
//
// The rule, in order (resolveHit):
//   1. row.invulnerable, or src in row.immune, or (opts.shut and src in row.shell)   -> ignored
//   2. src.octoOnly (a creature's own attack; enemy infighting is queued)             -> ignored for creatures
//   3. dmg   = (opts dmg, else src.dmg) * row.resist[src] (default 1)
//   4. kill  = row.oneHitSplat and src.crush (a body hit: dash, falling block, boulder, spikes): splat, whatever the hp
//   5. knock = src.knock / row.mass, 0 when the row is anchored (bolted to rock: stunned in place, never thrown)
//   6. stun  = src.stun * row.stunScale, 0 when row.immuneKnockout
// Aggro (the keeper, the NPCs) follows the hit's blame: only a hit the octopus caused turns them on her (byOcto).

import { STUN_S, STUN_KNOCKBACK, HEAVY_HIT_DMG, HEAVY_KNOCKBACK, BOMB_RADIUS } from './config.js';

// physics kinds: how a body moves when something shoves it
export const PH_SWIM = 'swim';         // free swimmer: thrown by blasts, drifts in jets, flies onto spikes
export const PH_WALK = 'walk';         // walks a floor (crab): thrown sideways only, jets only carry it while knocked out
export const PH_ANCHORED = 'anchored'; // grown on / bolted to rock: never thrown (a stun still lands unless immuneKnockout)
export const PH_NONE = 'none';         // not a body anything can shove (the Beholder, the eel in its shaft)

/**
 * Damage sources. dmg: ink units; crush: a body hit (splats oneHitSplat rows); knock: u/s for mass 1; stun: s of knock-out;
 * impact: only a body that hits it (moving at least IMPACT_SPEED or knocked out) is hurt, one that drifts past is not;
 * blame: who is to blame by default ('octo' her own attack, 'cause' set by the caller, 'none' the world);
 * octoOnly: today it only ever reaches the octopus (a creature's own attack; the infighting owner lifts this);
 * octo: what it does to the octopus {hearts, knock, stun} or {kill: style}.
 */
export const SOURCES = {
  bomb:     { dmg: 30, crush: false, knock: 12, stun: 0.9,  blame: 'octo',  octo: { hearts: 1 } },
  boulder:  { dmg: 20, crush: true,  knock: 6,  stun: 0.35, blame: 'cause', octo: { hearts: 1, kill: 'splat' } },
  spikes:   { dmg: 20, crush: true,  knock: 6,  stun: 0,    blame: 'cause', impact: true, octo: { kill: 'impale' } },
  block:    { dmg: 20, crush: true,  knock: 3,  stun: 0.35, blame: 'cause', octo: { hearts: 1 } },
  jet:      { dmg: 0,  crush: false, knock: 0,  stun: 0,    blame: 'none',  push: true, octo: {} },
  ink:      { dmg: 4,  crush: false, knock: 0.5, stun: 0,   blame: 'octo',  octo: {} },
  dash:     { dmg: 2,  crush: true,  knock: 1,  stun: 0,    blame: 'octo',  octo: {} },
  trap:     { dmg: 6,  crush: false, knock: 4,  stun: 0,    blame: 'cause', octo: { hearts: 1 } },
  shock:    { dmg: 2,  crush: false, knock: 2,  stun: 1.0,  blame: 'none',  octo: { hearts: 1, stun: 1.0, knock: STUN_KNOCKBACK } },
  anemone:  { dmg: 2,  crush: false, knock: 3,  stun: 0,    blame: 'none',  octo: { hearts: 1 } },
  shot:     { dmg: 4,  crush: false, knock: 2,  stun: 0,    blame: 'none',  octoOnly: true, octo: { hearts: 1 } },
  harpoon:  { dmg: 8,  crush: false, knock: 6,  stun: 0,    blame: 'none',  octoOnly: true, octo: { hearts: HEAVY_HIT_DMG, knock: HEAVY_KNOCKBACK } },
  claw:     { dmg: 8,  crush: false, knock: 6,  stun: 0,    blame: 'none',  octoOnly: true, octo: { hearts: 2, knock: 10 } },
  bite:     { dmg: 4,  crush: false, knock: 2,  stun: 0,    blame: 'none',  octoOnly: true, octo: { hearts: 1 } },
  slam:     { dmg: 4,  crush: false, knock: 4,  stun: STUN_S, blame: 'none', octoOnly: true, octo: { hearts: 1, stun: STUN_S, knock: STUN_KNOCKBACK } },
  snap:     { dmg: 30, crush: true,  knock: 0,  stun: 0,    blame: 'none',  octoOnly: true, octo: { kill: 'clam' } },
  grab:     { dmg: 0,  crush: false, knock: 0,  stun: 0,    blame: 'none',  octoOnly: true, octo: { kill: 'eaten' } },
  beholder: { dmg: 999, crush: true, knock: 0,  stun: 0,    blame: 'none',  octoOnly: true, octo: { kill: '' } },
};
export const SOURCE_NAMES = Object.keys(SOURCES);
/** A body at least this fast (u/s), or one knocked out, hits spikes (a crab walking by at 2, a piranha chasing at 4 do not). */
export const IMPACT_SPEED = 5;
/** s an impact hazard (spikes, a boulder, an anemone) leaves a survivor alone, so one landing is one hit. */
export const HAZARD_COOL = 0.6;
/** s the octopus stays to blame for a body she knocked about (a bomb throws the keeper onto spikes: her fault). */
export const BLAME_S = 2;

// the sources a shut shell (a giant clam, a tentacle curled in its shell) stops
const SHELL = ['ink', 'dash', 'shock', 'anemone', 'shot', 'harpoon', 'claw', 'bite'];

/**
 * The creature table. family: which system holds the body; hp: ink units; mass: knockback divisor; physics: PH_*;
 * flags: oneHitSplat, immuneKnockout, heavy, boss, invulnerable; immune: sources it ignores (with `why`); resist: per-source
 * damage multipliers; shell: sources a shut shell stops; stunScale: multiplies every source's stun.
 */
export const CREATURES = {
  piranha:  { family: 'enemy', hp: 6,  mass: 1,   physics: PH_SWIM, oneHitSplat: true },
  crab:     { family: 'enemy', hp: 10, mass: 1.2, physics: PH_WALK, oneHitSplat: true },
  manta:    { family: 'enemy', hp: 16, mass: 1.5, physics: PH_SWIM, oneHitSplat: true },
  cannon:   { family: 'enemy', hp: 14, mass: 3,   physics: PH_ANCHORED },
  urchin:   { family: 'enemy', hp: 10, mass: 3,   physics: PH_ANCHORED, immuneKnockout: true, immune: ['ink', 'dash'],
              why: 'all spines: an ink blob splats off it and a dash into it hurts the octopus instead (Daniel Q7: a hazard to avoid, not to shoot); it has no behaviour to knock out, it only pulses' },
  horns:    { family: 'enemy', hp: 0,  mass: 9,   physics: PH_ANCHORED, immuneKnockout: true, invulnerable: true,
              why: 'a spike growth of the rock itself: part of the wall, it only goes when its rock is bombed away' },
  beholder: { family: 'enemy', hp: 0,  mass: 9,   physics: PH_NONE, immuneKnockout: true, invulnerable: true, boss: true,
              why: "the level's clock (Spelunky's ghost): nothing stops it, it only says leave now" },
  eel:      { family: 'hazard', hp: 0, mass: 9,   physics: PH_NONE, immuneKnockout: true, invulnerable: true,
              why: 'a trap of its shaft (journal: hazard), like an arrow trap; the shaft is the danger (proposal: killable once it has corpse art)' },
  gclam:    { family: 'creature', hp: 18, mass: 9, physics: PH_ANCHORED, immuneKnockout: true, shell: SHELL,
              why: 'grown onto the floor: never thrown, no knock-out (its snap runs on its own clock); shut, its shell stops ink, dashes, shocks, stings and shots' },
  tentacle: { family: 'creature', hp: 14, mass: 9, physics: PH_ANCHORED, immuneKnockout: true, shell: SHELL,
              why: 'its shell is grown into the rock: never thrown, no knock-out; curled up in its shell (dormant, retracting, fed) the shell stops what a shut clam stops' },
  marlo:    { family: 'npc', hp: 6, mass: 1,   physics: PH_SWIM },
  pip:      { family: 'npc', hp: 2, mass: 0.6, physics: PH_SWIM },
  quill:    { family: 'npc', hp: 4, mass: 1.2, physics: PH_SWIM },
  host:     { family: 'npc', hp: 5, mass: 1,   physics: PH_SWIM },
  keeper:   { family: 'keeper', hp: 40, mass: 1.2, physics: PH_SWIM, heavy: true, stunScale: 0.6, resist: { ink: 0.08, dash: 0.25 },
              why: 'super buff (Spelunky shopkeeper): ink and dashes barely scratch him, bombs, boulders and spikes really hurt' },
  octopus:  { family: 'octo', hp: 3, mass: 1, physics: PH_SWIM },
};
export const CREATURE_KINDS = Object.keys(CREATURES);

/** The table row of a kind (an unknown kind gets a plain one-hit swimmer, so a new creature is never silently immune). */
const DEFAULT_ROW = { family: 'enemy', hp: 4, mass: 1, physics: PH_SWIM, oneHitSplat: true };
export function rowOf(kind) { return CREATURES[kind] || DEFAULT_ROW; }

/** Can this kind be killed by a dash (a body hit) at all: oneHitSplat and not immune to it. */
export function dashKillable(kind) { const r = rowOf(kind); return !!r.oneHitSplat && !r.invulnerable && !(r.immune && r.immune.includes('dash')); }

/** The reusable outcome resolveHit fills (never keep a reference across calls). */
export const OUTCOME = { ignore: false, dmg: 0, kill: false, knock: 0, stun: 0, why: '' };

/**
 * The one rule: what `src` does to a body of `kind`. dmg: base damage override (an Ink Jet blob's own damage, a falloff),
 * negative = the source's own; shut: the body's shell is closed right now. Fills and returns OUTCOME.
 */
export function resolveHit(kind, src, dmg = -1, shut = false) {
  const o = OUTCOME, row = rowOf(kind), s = SOURCES[src];
  o.ignore = false; o.dmg = 0; o.kill = false; o.knock = 0; o.stun = 0; o.why = '';
  if (!s) { o.ignore = true; o.why = 'unknown source'; return o; }
  if (row.invulnerable) { o.ignore = true; o.why = 'invulnerable'; return o; }
  if (row.immune && row.immune.includes(src)) { o.ignore = true; o.why = 'immune'; return o; }
  if (shut && row.shell && row.shell.includes(src)) { o.ignore = true; o.why = 'shell'; return o; }
  if (s.octoOnly && row.family !== 'octo') { o.ignore = true; o.why = 'octopus only'; return o; }
  const res = row.resist && row.resist[src] !== undefined ? row.resist[src] : 1;
  o.dmg = Math.max(0, (dmg >= 0 ? dmg : s.dmg) * res);
  o.kill = !!(row.oneHitSplat && s.crush);
  o.knock = row.physics === PH_ANCHORED || row.physics === PH_NONE ? 0 : s.knock / (row.mass || 1);
  o.stun = row.immuneKnockout ? 0 : s.stun * (row.stunScale !== undefined ? row.stunScale : 1);
  return o;
}

/** Does `kind` take anything at all from `src` (ignoring a shell's state)? For tests, the journal and the docs. */
export function affects(kind, src) { return !resolveHit(kind, src).ignore; }

// ---------------------------------------------------------------- chain reactions (2026-10-08, "chain reactions - oh yeah!")
//
// Spelunky-style chains: a source does not only DAMAGE bodies (SOURCES, resolveHit), it can also SET OFF things: a lit bomb, a
// hanging boulder, a giant clam's snap, a tentacle, an eel's shock, a pot or loot clam, a fragile tile, a jet's surge, a
// chest's trap. TRIGGERS says, per source, which TARGET kinds it sets off and how far (tiles); chain.js turns that into a queue
// of delayed links (the chain reads, one link after the other) with a budget, a cap and the off-screen rule. No system checks
// a kind or a source by hand: every link is a row here. See octomancer-web/CREATURES.md, section 4.
//
//   sets:  target kind -> reach in tiles (the target's centre within it, from the source's point)
//   idle:  the targets a SPONTANEOUS event sets off (one not caused by a chain: a clam snapping at the octopus, an eel's own
//          periodic shock). A periodic creature would otherwise keep its neighbours ticking forever. Omitted: same as `sets`.
//   delay: [nearest, farthest] s from the source going off to the target going off (0.1-0.3: each link reads on its own)

/** What a trigger target is and what setting it off does (for the docs, the tests). */
export const TRIGGER_TARGETS = {
  bomb:     { why: 'a lit bomb: its fuse is cut and it goes off at once' },
  rock:     { why: 'a hanging boulder: its support is shaken, it rumbles a moment and drops' },
  clam:     { why: 'a giant clam: it snaps shut (an open one with the octopus in its mouth still kills)' },
  tentacle: { why: 'a dormant tentacle: it wakes and uncoils' },
  eel:      { why: 'an eel: it discharges its shock early' },
  pot:      { why: 'a breakable pot or loot clam: it bursts and spills its shells' },
  tile:     { why: 'a fragile tile (bone, timber: materials.js MAT_BOULDER_BREAKS): it shatters' },
  jet:      { why: 'a current jet: it surges, throwing whatever is in its stream' },
  trap:     { why: 'a trapped chest: its trap springs (spike burst, or the piranha swarm); the chest stays shut and is safe after' },
};
export const TRIGGER_TARGET_NAMES = Object.keys(TRIGGER_TARGETS);

/** Per source (a SOURCES name): which targets it sets off and how far (tiles). */
export const TRIGGERS = {
  // a bomb going off: other bombs inside its blast radius (BOMB_RADIUS), everything else out to the shove ring (2 radii; fragile
  // tiles and traps 1.6 radii)
  bomb:    { delay: [0.12, 0.26], sets: { bomb: BOMB_RADIUS, rock: BOMB_RADIUS * 2, clam: BOMB_RADIUS * 2, tentacle: BOMB_RADIUS * 2, eel: BOMB_RADIUS * 2, pot: BOMB_RADIUS * 2, tile: BOMB_RADIUS * 1.6, jet: BOMB_RADIUS * 2, trap: BOMB_RADIUS * 1.6 } },
  // a falling boulder (a hazard rock, a chase rock) landing: what it lands on, and a shake that loosens boulders near by
  boulder: { delay: [0.1, 0.24], sets: { bomb: 1.3, clam: 2.2, pot: 1.3, rock: 4.5, tile: 1.3, trap: 1.3 } },
  // a giant clam's snap: the slam startles the clams next to it and cracks pots; at the octopus (spontaneous) only a bomb in its mouth
  snap:    { delay: [0.14, 0.28], sets: { clam: 3, pot: 1.6, bomb: 1.6 }, idle: { bomb: 1.6 } },
  // an eel's shock: it jumps to the eels near by, sets off bombs and makes clams flinch; its own periodic shock only reaches bombs
  shock:   { delay: [0.1, 0.22], sets: { eel: 4, bomb: 3, clam: 2.5 }, idle: { bomb: 3 } },
};
export const TRIGGER_SOURCES = Object.keys(TRIGGERS);

/** The reach (tiles) at which `src` sets off `target` (0: it does not). spontaneous: the event was not itself caused by a chain. */
export function triggerReach(src, target, spontaneous = false) {
  const row = TRIGGERS[src];
  if (!row) return 0;
  const set = spontaneous && row.idle ? row.idle : row.sets;
  return set[target] || 0;
}
