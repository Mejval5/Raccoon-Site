// What the octopus carries, as the journal's Carried page shows it (2026-10-08: Tab opens the book on this page).
// Pure data, no DOM: carriedList(state) turns the hotbar, the passive items, the bombs, the Ink Jet and the juice jar into one
// ordered list of cards; describe(card, state) gives a card's name, numbers (its current effect) and how to use it.
// journal-ui.js draws them; tests read them as is.
//
// state = { slots: [{ids}], sel, items: [item ids], bombs, bombMax, juice, cap, perCast, jetCharge?, touch? } (main.js carriedState()).

import { ITEM_DEFS, FLIPPER_MUL, MAGNET_R, LIGHT_BASE, LIGHT_LANTERN, BOMBBAG_BOMBS, SIPHON_R, itemCount } from './items.js';
import { spellById, modById, resolveSlot, JUICE, SLOT } from './spells.js';
import { INKJET } from './inkjet.js';
import { BOMB_RADIUS, BOMB_START } from './config.js';
import { BOMB_FUSE_V2, STICKY_ARM_S } from './bomb.js';
import { SOURCES } from './creature-rules.js';

export const K_SLOT = 'slot', K_JET = 'jet', K_BOMB = 'bomb', K_ITEM = 'item', K_JAR = 'jar';

/** Journal entry of a hotbar slot id (a spell, a rune, or a usable item such as 'bomb'), or null. */
export function slotJournalId(id) {
  const s = spellById(id) || modById(id);
  if (s) return s.journal || null;
  return 'item-' + id;
}

/**
 * The cards of the Carried page, in order: the hotbar slots (1..9), the Ink Jet, the bombs (unless they sit on the hotbar),
 * the fish juice jar, then each carried item once (with its count). Every card has a stable `key` (the page selects by it).
 * @returns {{key:string, kind:string, id:string, journal:string|null, slot:number, ids:string[], count:number}[]}
 */
export function carriedList(state) {
  const out = [];
  const slots = (state && state.slots) || [];
  let bombOnBar = false;
  slots.forEach((s, i) => {
    const ids = s.ids || [];
    const fold = resolveSlot(ids);
    const id = fold ? fold.spell.id : ids[0] || '';
    if (id === 'bomb') bombOnBar = true;
    out.push({ key: 'slot:' + i, kind: K_SLOT, id, journal: slotJournalId(id), slot: i, ids: ids.slice(), count: 1 });
  });
  out.push({ key: 'jet', kind: K_JET, id: 'inkjet', journal: 'item-inkjet', slot: -1, ids: [], count: 1 });
  if (!bombOnBar) out.push({ key: 'bomb', kind: K_BOMB, id: 'bomb', journal: 'item-bomb', slot: -1, ids: [], count: state ? state.bombs | 0 : 0 });
  out.push({ key: 'jar', kind: K_JAR, id: 'juice', journal: 'item-juice', slot: -1, ids: [], count: 1 });
  const seen = new Set();
  for (const id of (state && state.items) || []) {
    if (seen.has(id) || !ITEM_DEFS[id]) continue;
    seen.add(id);
    out.push({ key: 'item:' + id, kind: K_ITEM, id, journal: 'item-' + id, slot: -1, ids: [], count: itemCount(state.items, id) });
  }
  return out;
}

/** Every journal id the octopus carries now (hotbar spells and their runes, items, the Ink Jet, bombs, the jar): what a dive "carried". */
export function carriedJournalIds(state) {
  const ids = new Set();
  for (const c of carriedList(state)) {
    if (c.kind === K_BOMB && !c.count) continue;
    if (c.journal) ids.add(c.journal);
    for (const r of c.ids) { const m = modById(r); if (m && m.journal) ids.add(m.journal); }
  }
  return [...ids];
}

const f1 = (v) => String(Math.round(v * 10) / 10);
const casts = (n) => n + (n === 1 ? ' cast' : ' casts');
// controls 2026-10-08 (V2-PLAN 17): F is the hand; right click / C use the selected hotbar slot; 1-9, Q / E, the wheel pick it
const KEYS = (touch) => ({
  slot: touch ? 'Tap its slot on the bar, then Use (Spell casts your last spell)' : 'Right click or C casts it; pick the slot with 1-9, Q / E or the wheel',
  jet: touch ? 'The Jet button (hold to keep firing)' : 'Left click or J / K (hold to fire on each refill)',
  bomb: touch ? 'Pick the bomb slot, then Use: drops one, or throws a mine along the stick' : 'Right click or C on the bomb slot: on you it drops one, at the cursor it throws a sticky mine. B / X drop one, the middle button throws one',
  item: 'Nothing to press: it works while you carry it',
  jar: touch ? 'Spells drink from it when you cast' : 'Spells drink from it when you cast',
});

/** Numbers for one spell slot (its runes folded in): price, size, time, and what each rune changes. */
function spellNumbers(ids) {
  const p = resolveSlot(ids);
  if (!p) return [];
  const s = p.spell, rows = [];
  rows.push(['Cost', casts(p.price) + ' (' + p.price * JUICE.perCast + ' juice)']);
  if (s.effect === 'cloud') rows.push(['Cloud', 'radius ' + f1(p.radius) + ' tiles, ' + f1(p.duration) + ' s']);
  else if (s.effect === 'riptide') rows.push(['Current', f1(p.length) + ' tiles long, ' + f1(p.duration) + ' s']);
  else if (s.effect === 'coral') rows.push(['Coral', p.cells + ' cells, ' + (p.permanent ? 'for the whole level' : f1(p.duration) + ' s')]);
  else if (s.effect === 'anchor') rows.push(['Sinks', f1(p.duration) + ' s, crushes at ' + (s.crushSpeed || 6) + ' tiles/s']);
  else if (s.effect === 'lure') rows.push(['Lure', f1(p.duration) + ' s, draws creatures from ' + (s.reach || 7) + ' tiles']);
  else if (p.radius) rows.push(['Size', 'radius ' + f1(p.radius) + ' tiles, ' + f1(p.duration) + ' s']);
  if (p.delay > 0) rows.push(['Goes off', f1(p.delay) + ' s after the cast']);
  for (const r of ids) {
    const m = modById(r);
    if (!m) continue;
    rows.push([m.name + ' rune', p.greyed.includes(r) ? 'does nothing on ' + s.name : m.blurb]);
  }
  if (!ids.some((r) => modById(r))) rows.push(['Runes', 'none set (up to ' + SLOT.maxMods + ')']);
  return rows;
}

/** A rune's numbers on their own (the Items tab page of a rune). */
export function runeNumbers(id) {
  const m = modById(id);
  if (!m) return [];
  const rows = [];
  if (m.radiusMul) rows.push(['Size', 'x' + m.radiusMul]);
  if (m.durationMul) rows.push(['Time', 'x' + m.durationMul]);
  if (m.powerMul) rows.push(['Strength', 'x' + m.powerMul]);
  if (m.delayAdd) rows.push(['Delay', '+' + m.delayAdd + ' s']);
  rows.push(['Price', m.cost ? '+' + casts(m.cost) : 'free']);
  return rows;
}

/** An item's current effect as numbers (count = how many are carried). */
export function itemNumbers(id, count = 1) {
  switch (id) {
    case 'flippers': return [['Swim speed', '+' + Math.round((FLIPPER_MUL - 1) * 100) + '%']];
    case 'lantern': return [['Light', f1(LIGHT_BASE) + ' to ' + f1(LIGHT_LANTERN) + ' tiles']];
    case 'magnet': return [['Pulls shells', 'within ' + MAGNET_R + ' tiles']];
    case 'bombbag': return [['Bombs', '+' + BOMBBAG_BOMBS + ' when found'], ['Max bombs', '+' + count + (ITEM_DEFS.bombbag.max > 1 ? ' (carry ' + ITEM_DEFS.bombbag.max + ')' : '')]];
    case 'heartcontainer': return [['Max hearts', '+' + count + ' (carry ' + ITEM_DEFS.heartcontainer.max + ')'], ['Heals', '1 heart when found']];
    case 'goggles': return [['Shows', 'buried finds and pockets']];
    case 'siphon': return [['Drinks juice', 'within ' + SIPHON_R + ' tiles']];
    case 'urchincap': return [['Dash hits', SOURCES.helmet ? SOURCES.helmet.dmg + ' damage' : 'spiked']];
    default: return [];
  }
}

export function jetNumbers() {
  return [['Fire rate', '1 shot / ' + f1(INKJET.cooldown) + ' s'], ['Range', f1(INKJET.range) + ' tiles'], ['Damage', String(SOURCES.ink ? SOURCES.ink.dmg : INKJET.damage)]];
}
export function bombNumbers(state) {
  const rows = [['Fuse', f1(BOMB_FUSE_V2) + ' s from the drop'], ['Mine', 'clings, then ' + f1(BOMB_FUSE_V2) + ' s (flies at most ' + f1(STICKY_ARM_S) + ' s)'], ['Blast', f1(BOMB_RADIUS) + ' tiles, deadly to you too']];
  if (state) rows.unshift(['Carried', (state.bombs | 0) + ' of ' + (state.bombMax | 0)]);
  else rows.push(['Start with', String(BOMB_START)]);
  return rows;
}
export function jarNumbers(state) {
  const per = JUICE.perCast, cap = state && state.cap ? state.cap : JUICE.jarCasts * per;
  const rows = [['Holds', casts(Math.round(cap / per)) + ' (' + per + ' juice each)']];
  if (state) rows.unshift(['In the jar', Math.floor((state.juice | 0) / per) + ' of ' + Math.round(cap / per) + ' casts']);
  return rows;
}

/**
 * A card's details for the right page: { name, short (the card's caption: no runes, no count), blurb, numbers: [[label, value]], use (how to use it), slot (1-based or 0), selected }.
 * The long description and the counters come from the card's journal entry (journal-ui.js).
 */
export function describe(card, state) {
  const touch = !!(state && state.touch), k = KEYS(touch);
  const out = { name: '', short: '', blurb: '', numbers: [], use: '', slot: card.slot >= 0 ? card.slot + 1 : 0, selected: !!state && card.slot >= 0 && card.slot === state.sel };
  if (card.kind === K_SLOT) {
    const s = spellById(card.id);
    if (s) {
      const runes = card.ids.filter((r) => modById(r)).map((r) => modById(r).name);
      out.name = s.name + (runes.length ? ' + ' + runes.join(' + ') : ''); out.short = s.name;
      out.blurb = s.blurb || '';
      out.numbers = spellNumbers(card.ids);
      out.use = k.slot;
    } else if (card.id === 'bomb') {
      out.name = 'Bombs'; out.blurb = 'they break rock and hurt anything near, you too';
      out.numbers = bombNumbers(state); out.use = k.bomb;
    } else {
      out.name = (ITEM_DEFS[card.id] && ITEM_DEFS[card.id].name) || card.id; out.use = k.slot;
    }
  } else if (card.kind === K_JET) {
    out.name = 'Ink Jet'; out.blurb = 'one squirt of ink, then the sac refills'; out.numbers = jetNumbers(); out.use = k.jet;
  } else if (card.kind === K_BOMB) {
    out.name = 'Bombs'; out.blurb = 'they break rock and hurt anything near, you too'; out.numbers = bombNumbers(state); out.use = k.bomb;
  } else if (card.kind === K_ITEM) {
    const d = ITEM_DEFS[card.id];
    out.short = d ? d.name : card.id; out.name = out.short + (card.count > 1 ? ' x' + card.count : ''); out.blurb = d ? d.blurb : '';
    out.numbers = itemNumbers(card.id, card.count); out.use = k.item;
  } else if (card.kind === K_JAR) {
    out.name = 'Fish juice'; out.blurb = 'spells drink it; the spring at the end of a zone refills it'; out.numbers = jarNumbers(state); out.use = k.jar;
  }
  if (!out.short) out.short = out.name;
  return out;
}

/** Numbers for an entry page of the collection (Items tab): the same figures, without a carried state. */
export function entryNumbers(journalId) {
  if (!journalId) return [];
  if (journalId === 'item-inkjet') return jetNumbers();
  if (journalId === 'item-bomb') return bombNumbers(null);
  if (journalId === 'item-juice') return jarNumbers(null);
  if (journalId.startsWith('item-')) { const id = journalId.slice(5); if (ITEM_DEFS[id]) return itemNumbers(id, 1); return []; }
  for (const id of ['heavy', 'delayed', 'lingering']) if (modById(id) && modById(id).journal === journalId) return runeNumbers(id);
  if (journalId.startsWith('spell-')) {
    const s = spellById(journalId.slice(6));
    if (s) return spellNumbers([s.id]).filter((r) => r[0] !== 'Runes');
  }
  return [];
}

/** How to use the thing an entry describes (Items tab page), or ''. */
export function entryUse(journalId, touch) {
  const k = KEYS(touch);
  if (journalId === 'item-inkjet') return k.jet;
  if (journalId === 'item-bomb') return k.bomb;
  if (journalId === 'item-juice') return k.jar;
  if (journalId.startsWith('spell-')) return k.slot;
  if (journalId.startsWith('rune-')) return 'Take it from its stone: it sets itself into a spell on your bar';
  if (journalId.startsWith('item-') && ITEM_DEFS[journalId.slice(5)]) return k.item;
  return '';
}
