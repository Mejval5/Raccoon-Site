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
//   2. src.octoOnly (the manta's dive slam, the Beholder: only ever the octopus)       -> ignored for creatures
//      (who a creature's attack may reach at all is the INFIGHT table at the end of this file)
//      src.touch and row.touch (an anemone's sting on a piranha, a crab, a clam: touch enemies never hurt each other) -> ignored
//   3. dmg   = (opts dmg, else src.dmg) * row.resist[src] (default 1)
//   4. kill  = row.oneHitSplat and src.crush (a body hit: dash, falling block, boulder, spikes): splat, whatever the hp
//   5. knock = src.knock / row.mass, 0 when the row is anchored (bolted to rock: stunned in place, never thrown)
//   6. stun  = src.stun * row.stunScale, 0 when row.immuneKnockout
// Aggro (the keeper, the NPCs) follows the hit's blame: only a hit the octopus caused turns them on her (byOcto).

import { STUN_S, STUN_KNOCKBACK, HEAVY_HIT_DMG, HEAVY_KNOCKBACK } from './config.js';

// physics kinds: how a body moves when something shoves it
export const PH_SWIM = 'swim';         // free swimmer: thrown by blasts, drifts in jets, flies onto spikes
export const PH_WALK = 'walk';         // walks a floor (crab): thrown sideways only, jets only carry it while knocked out
export const PH_ANCHORED = 'anchored'; // grown on / bolted to rock: never thrown (a stun still lands unless immuneKnockout)
export const PH_NONE = 'none';         // not a body anything can shove (the Beholder, the eel in its shaft)

/**
 * Damage sources. dmg: ink units; crush: a body hit (splats oneHitSplat rows); knock: u/s for mass 1; stun: s of knock-out;
 * impact: only a body that hits it (moving at least IMPACT_SPEED or knocked out) is hurt, one that drifts past is not;
 * blame: who is to blame by default ('octo' her own attack, 'cause' set by the caller, 'none' the world);
 * octoOnly: it only ever reaches the octopus (the manta's dive slam, the Beholder); projectile: it flies and the first body it
 * touches takes it (INFIGHT.projectile);
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
  anemone:  { dmg: 2,  crush: false, knock: 3,  stun: 0,    blame: 'none',  touch: true, octo: { hearts: 1 } },
  // 2026-10-08, enemy infighting (Spelunky style): the creature attacks below reach other creatures too, but ONLY through the
  // deliberate rules of INFIGHT (projectiles hit whatever they touch; a piranha frenzy, a clam's snap, a tentacle's grab and a
  // keeper's claws). A touch attacker never hurts another by touching it: there is no creature-vs-creature contact check.
  // 'cause' blame on a projectile: her fault only when she caused it (the projectile's own flag, or a body she knocked about);
  // 'none': never her fault, so an enemy's attack on a keeper or an NPC never angers them at her.
  shot:     { dmg: 6,  crush: false, knock: 3,  stun: 0.4,  blame: 'cause', projectile: true, octo: { hearts: 1 } },
  harpoon:  { dmg: 8,  crush: false, knock: 6,  stun: 0.4,  blame: 'cause', projectile: true, octo: { hearts: HEAVY_HIT_DMG, knock: HEAVY_KNOCKBACK } },
  thrown:   { dmg: 4,  crush: false, knock: 3,  stun: 0.6,  blame: 'cause', projectile: true, octo: {} },
  claw:     { dmg: 8,  crush: false, knock: 6,  stun: 0,    blame: 'none',  octo: { hearts: 2, knock: 10 } },
  bite:     { dmg: 4,  crush: false, knock: 2,  stun: 0,    blame: 'none',  octo: { hearts: 1 } },
  slam:     { dmg: 4,  crush: false, knock: 4,  stun: STUN_S, blame: 'none', octoOnly: true, octo: { hearts: 1, stun: STUN_S, knock: STUN_KNOCKBACK } },
  snap:     { dmg: 30, crush: true,  knock: 0,  stun: 0,    blame: 'none',  octo: { kill: 'clam' } },
  grab:     { dmg: 20, crush: true,  knock: 0,  stun: 0,    blame: 'none',  octo: { kill: 'eaten' } },
  // spells (SPELLS-PICK.md): Riptide is a jet the octopus made (a push, no damage: it only delivers bodies to what kills them);
  // Anchor is the octopus landing like a falling rock (a body hit: it splats the one-hit kinds, only bumps the rest)
  riptide:  { dmg: 0,  crush: false, knock: 0,  stun: 0,    blame: 'octo',  push: true, octo: {} },
  anchor:   { dmg: 1,  crush: true,  knock: 4,  stun: 0.35, blame: 'octo',  octo: {} },
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
const SHELL = ['ink', 'dash', 'shock', 'anemone', 'shot', 'harpoon', 'thrown', 'claw', 'bite'];

/**
 * The creature table. family: which system holds the body; hp: ink units; mass: knockback divisor; physics: PH_*;
 * flags: oneHitSplat, immuneKnockout, heavy, boss, invulnerable; immune: sources it ignores (with `why`); resist: per-source
 * damage multipliers; shell: sources a shut shell stops; stunScale: multiplies every source's stun; touch: a touch enemy (it
 * hurts by touching; a touch source, the anemone, never hurts it: infighting, Spelunky style).
 */
export const CREATURES = {
  piranha:  { family: 'enemy', hp: 6,  mass: 1,   physics: PH_SWIM, oneHitSplat: true, touch: true },
  crab:     { family: 'enemy', hp: 10, mass: 1.2, physics: PH_WALK, oneHitSplat: true, touch: true },
  manta:    { family: 'enemy', hp: 16, mass: 1.5, physics: PH_SWIM, oneHitSplat: true, touch: true },
  cannon:   { family: 'enemy', hp: 14, mass: 3,   physics: PH_ANCHORED },
  urchin:   { family: 'enemy', hp: 10, mass: 3,   physics: PH_ANCHORED, immuneKnockout: true, touch: true, immune: ['ink', 'dash'],
              why: 'all spines: an ink blob splats off it and a dash into it hurts the octopus instead (Daniel Q7: a hazard to avoid, not to shoot); it has no behaviour to knock out, it only pulses' },
  horns:    { family: 'enemy', hp: 0,  mass: 9,   physics: PH_ANCHORED, immuneKnockout: true, touch: true, invulnerable: true,
              why: 'a spike growth of the rock itself: part of the wall, it only goes when its rock is bombed away' },
  beholder: { family: 'enemy', hp: 0,  mass: 9,   physics: PH_NONE, immuneKnockout: true, invulnerable: true, boss: true,
              why: "the level's clock (Spelunky's ghost): nothing stops it, it only says leave now" },
  eel:      { family: 'hazard', hp: 0, mass: 9,   physics: PH_NONE, immuneKnockout: true, invulnerable: true,
              why: 'a trap of its shaft (journal: hazard), like an arrow trap; the shaft is the danger (proposal: killable once it has corpse art)' },
  gclam:    { family: 'creature', hp: 18, mass: 9, physics: PH_ANCHORED, immuneKnockout: true, touch: true, shell: SHELL,
              why: 'grown onto the floor: never thrown, no knock-out (its snap runs on its own clock); shut, its shell stops ink, dashes, shocks, stings and shots' },
  tentacle: { family: 'creature', hp: 14, mass: 9, physics: PH_ANCHORED, immuneKnockout: true, touch: true, shell: SHELL,
              why: 'its shell is grown into the rock: never thrown, no knock-out; curled up in its shell (dormant, retracting, fed) the shell stops what a shut clam stops' },
  marlo:    { family: 'npc', hp: 6, mass: 1,   physics: PH_SWIM },
  pip:      { family: 'npc', hp: 2, mass: 0.6, physics: PH_SWIM },
  quill:    { family: 'npc', hp: 4, mass: 1.2, physics: PH_SWIM },
  host:     { family: 'npc', hp: 5, mass: 1,   physics: PH_SWIM },
  keeper:   { family: 'keeper', hp: 40, mass: 1.2, physics: PH_SWIM, heavy: true, stunScale: 0.6, resist: { ink: 0.08, dash: 0.25, riptide: 0.5 },
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
  if (s.touch && row.touch) { o.ignore = true; o.why = 'touch vs touch'; return o; } // infighting: a touch attacker never hurts a touch enemy
  const res = row.resist && row.resist[src] !== undefined ? row.resist[src] : 1;
  o.dmg = Math.max(0, (dmg >= 0 ? dmg : s.dmg) * res);
  o.kill = !!(row.oneHitSplat && s.crush);
  o.knock = row.physics === PH_ANCHORED || row.physics === PH_NONE ? 0 : s.knock / (row.mass || 1);
  o.stun = row.immuneKnockout ? 0 : s.stun * (row.stunScale !== undefined ? row.stunScale : 1);
  return o;
}

/** How strongly a push source (a jet, a Riptide) moves `kind`: its resist entry for that source (the keeper rides a Riptide at half force), else 1. */
export function pushScale(kind, src) { const r = rowOf(kind); return r.resist && r.resist[src] !== undefined ? r.resist[src] : 1; }

/** Does `kind` take anything at all from `src` (ignoring a shell's state)? For tests, the journal and the docs. */
export function affects(kind, src) { return !resolveHit(kind, src).ignore; }

// ---------------------------------------------------------------------------------------------------------------------------
// Enemy infighting (2026-10-08, Daniel: "enemy infighting - yes, but Spelunky style: mostly they should ignore each other, aside
// from a few interactions that make sense (e.g. projectiles just hit anything, but touch enemies don't hurt other touch enemies
// generally)"). See octomancer-web/CREATURES.md section 4; the runtime side is infight.js.
//
// THE DEFAULT: creatures ignore each other. Nothing checks creature-vs-creature contact, so a piranha swimming into a crab, an
// urchin, horns, an anemone or a shut clam is only pushed apart (enemies.js separateEnemies), never hurt.
// THE EXCEPTIONS are this table and nothing else. Each rule names its attacker (`by`; '' = whoever fired it), the sources it
// hits with, and who it may reach (`reach`): 'any' every body but the attacker itself; 'prey' a bleeding body (hp below full),
// a knocked-out one, or a fresh corpse; 'free' a body that can be moved (it swims or walks and is not invulnerable).
// ---------------------------------------------------------------------------------------------------------------------------
export const INFIGHT = {
  projectile: { by: '',         src: ['shot', 'harpoon', 'thrown', 'ink'], reach: 'any',
                why: 'a cannon shot, a harpoon, a thrown bomb or pot and an ink blob fly until they hit something: the first body they touch takes the hit, whoever it is (never the shooter)' },
  frenzy:     { by: 'piranha',  src: ['bite'], reach: 'prey',
                why: 'piranhas smell blood: one bites anything bleeding, knocked out or freshly dead, so one hurt fish draws the school (a feeding frenzy); a healthy creature is left alone' },
  snap:       { by: 'gclam',    src: ['snap'], reach: 'any',
                why: 'a giant clam snaps on whatever swims into its open mouth: a creature swimming in sets the snap off, and anything in the mouth when the lid slams is crushed' },
  grab:       { by: 'tentacle', src: ['grab'], reach: 'free',
                why: 'a tentacle grabs any creature it can reach (the octopus first), crushes it and pulls back into its shell' },
  claw:       { by: 'keeper',   src: ['claw'], reach: 'any',
                why: "an angry shopkeeper's claws fly at the octopus and hit anything in the way" },
};
export const INFIGHT_RULES = Object.keys(INFIGHT);
/** Kill reasons an infighting attack leaves on a death event: not the octopus's kill (no score, no journal kill, no dive kill). */
export const INFIGHT_KILL = { shot: 1, harpoon: 1, claw: 1, bite: 1, snap: 1, grab: 1 };

export const FRENZY_R = 6;        // tiles: how far a patrolling piranha smells blood (it still needs a clear line)
export const FRESH_S = 8;         // s: a corpse younger than this is a fresh corpse for the frenzy
export const CORPSE_BITES = 3;    // frenzy bites that strip a fresh corpse (it is gone)
export const THROWN_SPEED = 6;    // u/s: a loose prop (bomb, pot, clam, relic, find) flying at least this fast hits the body it touches

/** Can `rule`'s attack reach a body of `kind`? wounded: its hp is below full; stun: knocked-out seconds; corpse: a fresh corpse. */
export function infightReach(rule, kind, wounded = false, stun = 0, corpse = false) {
  const r = INFIGHT[rule];
  if (!r) return false;
  if (r.reach === 'any') return !corpse;
  if (r.reach === 'prey') return corpse || !!wounded || stun > 0;
  if (r.reach === 'free') { const row = rowOf(kind); return !corpse && !row.invulnerable && (row.physics === PH_SWIM || row.physics === PH_WALK); }
  return false;
}
