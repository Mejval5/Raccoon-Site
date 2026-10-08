// Octopus skins (2026-10-08, Daniel: "each NPC also gives a skin when rescued for the first time"; Spelunky 2's roster of rescued
// characters, here the octopus's looks). Cosmetic only: a skin recolours Milan's baked octopus (skin-draw.js builds one tinted sheet
// per skin, once, offscreen), may lay a pattern on the mantle and may add a small accessory sprite at the head / eye anchors of
// octopus.json. Each person gives theirs the first time they are rescued or befriended; the look is picked at the mirror shell in
// the hub (F) or in Settings, and kept in the save (save.js getSkins / setSkin).
//
// This module is pure data and rules (no DOM): the table, which skins a story has earned, and the unlock bookkeeping.

/**
 * body: the colour the octopus's base pink (#c05060) becomes; the sheet keeps its own light and shade (a pixel's brightness
 * relative to the base pink scales the new colour). pattern: {kind: 'scales' | 'quill' | 'rings', color, alpha} drawn on the
 * mantle in head space (follows the eyes frame by frame). acc: {sprite (skin-atlas.js), at: 'brow' | 'rightEye' | 'crown',
 * w: width in open-eye widths, dx, dy: offset in eye spacings (dy up), rot: radians}.
 * npc: whose skin it is (quests.json npcs id); give: the trinket line the person says; hint: the locked journal page's tease.
 */
export const SKINS = [
  { id: 'classic', npc: '', name: 'Reef Pink', body: null, journal: 'look-classic',
    text: "Milan's octopus as the reef made it: coral pink, ink-dark rims.", hint: '' },
  { id: 'marlo', npc: 'marlo', name: "Diver's Goggles", body: '#4d7f86', journal: 'look-marlo',
    pattern: null, acc: { sprite: 'accGoggles', at: 'brow', w: 2.45, dx: 0, dy: 0.88, rot: 0 },
    give: 'Here, my spare goggles. Sea-glass, they never fog.',
    text: "Marlo's spare sea-glass goggles, worn up on the brow, on a deep tide-pool teal.", hint: 'A diver stuck in the rock would be grateful.' },
  { id: 'pip', npc: 'pip', name: "Pip's Scales", body: '#9aa64a', journal: 'look-pip',
    pattern: { kind: 'scales', color: '#4f6a2a', alpha: 0.75 }, acc: null,
    give: 'Squeak! (Pip rubs a few of its old scales off on you.)',
    text: 'Green-yellow with the fish-scale spots of a certain small critter.', hint: 'Something small waits in a cage.' },
  { id: 'quill', npc: 'quill', name: "Quill's Ink", body: '#6c4f8a', journal: 'look-quill',
    pattern: { kind: 'quill', color: '#24123a', alpha: 0.85 }, acc: { sprite: 'accMonocle', at: 'rightEye', w: 1.1, dx: 0, dy: 0, rot: 0 },
    give: 'A spare monocle. Every collector should own two.',
    text: 'Ink-violet with quill strokes, and a monocle for squinting at relics.', hint: 'A collector of old things moves into the hub.' },
  { id: 'host', npc: 'host', name: "The Host's Hat", body: '#b06a4a', journal: 'look-host',
    pattern: { kind: 'rings', color: '#5e2c1c', alpha: 0.7 }, acc: { sprite: 'accTophat', at: 'crown', w: 1.95, dx: 0.12, dy: 1.3, rot: -0.14 },
    give: 'A winner needs a hat. Wear it at my pool!',
    text: "Sea-horse rust with ring marks, under the pool host's kelp top hat.", hint: 'Win a wager at a Challenge Pool.' },
];
export const SKIN_IDS = SKINS.map((s) => s.id);
export const DEFAULT_SKIN = 'classic';
const BY_ID = new Map(SKINS.map((s) => [s.id, s]));
export function skinById(id) { return BY_ID.get(id) || BY_ID.get(DEFAULT_SKIN); }
export function isSkinId(id) { return BY_ID.has(id); }

/**
 * The skins this story has earned (save.js story counters): Marlo freed once, Pip freed from his cage, Quill met (talked to in the
 * hub, met on a dig, or a relic handed over), the pool host after your first won wager. Always includes the default.
 */
export function earnedSkins(story) {
  const s = story || {};
  const out = [DEFAULT_SKIN];
  if ((s.diverFreed | 0) > 0 || (s.marlo | 0) >= 1) out.push('marlo');
  if ((s.critterFreed | 0) > 0 || (s.pip | 0) >= 1) out.push('pip');
  if ((s.digQuill | 0) > 0 || (s.saidQuill | 0) >= 1 || (s.relicsGiven | 0) > 0) out.push('quill');
  if ((s.poolWon | 0) > 0 || (s.host | 0) >= 1) out.push('host');
  return out;
}

/** The skins earned by `story` but not yet in `unlocked` (in table order): each is a first-time gift (the in-world moment). */
export function newSkins(story, unlocked) {
  const have = new Set(unlocked || []);
  return earnedSkins(story).filter((id) => !have.has(id));
}

/** The picker / journal rows: every skin with `unlocked` and `current` flags. */
export function skinRows(unlocked, current) {
  const have = new Set(unlocked || []);
  have.add(DEFAULT_SKIN);
  return SKINS.map((s) => ({ ...s, unlocked: have.has(s.id), current: s.id === current }));
}
