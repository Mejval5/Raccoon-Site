// 2026-10-08: the journal's Carried page (carried.js + journal-ui.js) and the unlock collection: every item, spell and rune in the
// code has a journal entry with a hint, the numbers come from the game's own constants, hotbar swaps, discoveries persist.
import { ENTRIES, createJournal, TABS, STAT_USED, STAT_CARRIED, STAT_COLLECTED, STAT_COUNT, CATEGORY_TITLES } from '../js/journal.js';
import { ITEM_IDS, ITEM_DEFS, FLIPPER_MUL } from '../js/items.js';
import { SPELLS, MODS, START_SPELL } from '../js/spells.js';
import { RUNE_SPELLS, RUNE_MODS } from '../js/runes.js';
import { INKJET } from '../js/inkjet.js';
import { createHotbar, addSpell, swapSlots, selectIndex } from '../js/hotbar.js';
import { carriedList, carriedJournalIds, describe, entryNumbers, entryUse, slotJournalId, K_SLOT, K_JET, K_BOMB, K_ITEM, K_JAR } from '../js/carried.js';
import { createJournalScreen } from '../js/journal-ui.js';
import { hasArt } from '../js/journal-art.js';

export async function runCarriedTests(assert) {
  const byId = new Map(ENTRIES.map((e) => [e.id, e]));
  // ---------------------------------------------------------------- coverage: every id in the code has a page
  const shop = await (await fetch(new URL('../data/shop-items.json', import.meta.url))).json();
  const need = [];
  for (const id of ITEM_IDS) need.push(['item ' + id, 'item-' + id, 'item']);
  for (const s of SPELLS) need.push(['spell ' + s.id, s.journal, 'spell']);
  for (const m of MODS) need.push(['rune ' + m.id, m.journal, 'spell']);
  for (const id of RUNE_SPELLS.concat(RUNE_MODS, [START_SPELL])) need.push(['pedestal rune ' + id, slotJournalId(id), 'spell']);
  for (const it of shop.items) need.push(['shop row ' + it.id, it.journal, 'item']);
  for (const id of ['item-inkjet', 'item-bomb', 'item-juice']) need.push([id, id, 'item']);
  const missing = need.filter(([, jid, cat]) => !jid || !byId.has(jid) || byId.get(jid).cat !== cat).map((x) => x[0] + ' -> ' + x[1]);
  assert('collection: every item (items.js), spell and rune (spells.json), pedestal rune, shop row and the Ink Jet / bombs / jar has a journal entry of the right category' + (missing.length ? ' [' + missing.join(', ') + ']' : ''), missing.length === 0 && need.length >= ITEM_IDS.length + SPELLS.length + MODS.length + 3);
  const carriedIds = new Set(need.map((x) => x[1]));
  const noHint = [...carriedIds].filter((id) => byId.has(id) && !(byId.get(id).where && byId.get(id).where.length > 10 && byId.get(id).where.length <= 80));
  assert('collection: each of those pages has a one-line hint where it is found (shown on the locked page)' + (noHint.length ? ' [' + noHint.join(', ') + ']' : ''), noHint.length === 0);
  const noArt = [...carriedIds].filter((id) => !hasArt(id));
  assert('collection: each of those pages has a picture (and so a silhouette)' + (noArt.length ? ' [' + noArt.join(', ') + ']' : ''), noArt.length === 0);
  const items = TABS.find((t) => t.id === 'items');
  assert('collection: items, spells and runes are on the Items tab, the spell section is titled Spells and Runes', items.cats.includes('item') && items.cats.includes('spell') && CATEGORY_TITLES.spell === 'Spells and Runes');
  const counted = ['item-flippers', 'spell-riptide', 'rune-heavy', 'item-inkjet'].every((id) => byId.get(id).counters.some((c) => c[0] === 'carried'));
  assert('collection: carried things count runs carried; spells count casts, runes their finds', counted && byId.get('spell-riptide').counters.some((c) => c[0] === 'used') && byId.get('rune-heavy').counters.some((c) => c[0] === 'collected') && byId.get('item-flippers').counters.some((c) => c[0] === 'collected'));

  // ---------------------------------------------------------------- the carried list and its numbers
  const hb = createHotbar();
  addSpell(hb, 'riptide'); hb.slots[1].ids.push('heavy');
  const st = { slots: hb.slots, sel: 1, items: ['flippers', 'bombbag', 'bombbag'], bombs: 4, bombMax: 7, juice: 8, cap: 12, perCast: 4, touch: false };
  const list = carriedList(st);
  assert('carried: hotbar slots first, then the Ink Jet, bombs and the jar, then each item once', list.map((c) => c.key).join() === 'slot:0,slot:1,jet,bomb,jar,item:flippers,item:bombbag' && list[6].count === 2);
  assert('carried: kinds and journal ids', list[0].kind === K_SLOT && list[0].journal === 'spell-ink-cloud' && list[2].kind === K_JET && list[2].journal === 'item-inkjet' && list[3].kind === K_BOMB && list[4].kind === K_JAR && list[5].kind === K_ITEM && list[5].journal === 'item-flippers');
  const ids = carriedJournalIds(st);
  assert('carried: what a dive carried includes the runes set in a slot and every item', ['spell-ink-cloud', 'spell-riptide', 'rune-heavy', 'item-inkjet', 'item-bomb', 'item-juice', 'item-flippers', 'item-bombbag'].every((i) => ids.includes(i)));
  assert('carried: no bombs on hand is not counted as carrying bombs', !carriedJournalIds({ ...st, bombs: 0 }).includes('item-bomb'));
  const row = (d, k) => (d.numbers.find((r) => r[0] === k) || [])[1] || '';
  const jet = describe(list[2], st);
  assert('carried: Ink Jet reads "1 shot / ' + INKJET.cooldown + ' s" and tells its keys', row(jet, 'Fire rate') === '1 shot / ' + (Math.round(INKJET.cooldown * 10) / 10) + ' s' && /Left click/.test(jet.use) && /Jet button/.test(describe(list[2], { ...st, touch: true }).use));
  const fl = describe(list[5], st);
  assert('carried: Flippers reads +' + Math.round((FLIPPER_MUL - 1) * 100) + '% swim speed, works while carried', row(fl, 'Swim speed') === '+' + Math.round((FLIPPER_MUL - 1) * 100) + '%' && /carry/.test(fl.use));
  const bag = describe(list[6], st);
  assert('carried: a stack shows its count in the name and the numbers', bag.name.endsWith('x2') && bag.short === ITEM_DEFS.bombbag.name && row(bag, 'Max bombs').startsWith('+2'));
  const rip = describe(list[1], st);
  assert('carried: a spell slot shows the rune-folded price in casts and juice, its size and each rune', rip.name === 'Riptide + Heavy' && row(rip, 'Cost') === '2 casts (8 juice)' && /tiles long/.test(row(rip, 'Current')) && row(rip, 'Heavy rune').length > 3 && rip.slot === 2 && rip.selected);
  const cloud = describe(list[0], st);
  assert('carried: the Ink Cloud slot costs 1 cast and says no runes are set', row(cloud, 'Cost') === '1 cast (4 juice)' && /none set/.test(row(cloud, 'Runes')) && !cloud.selected);
  assert('carried: bombs and the jar show what is on hand', row(describe(list[3], st), 'Carried') === '4 of 7' && row(describe(list[4], st), 'In the jar') === '2 of 3 casts');
  const onBar = carriedList({ ...st, slots: hb.slots.concat([{ ids: ['bomb'] }]) });
  assert('carried: bombs on the hotbar (the controls branch) are a slot, not a second card', onBar.filter((c) => c.journal === 'item-bomb').length === 1 && onBar.find((c) => c.journal === 'item-bomb').kind === K_SLOT);
  assert('collection: entry pages have numbers and a use line from the same tables', entryNumbers('item-flippers').length === 1 && entryNumbers('item-inkjet')[0][1].includes('1 shot') && entryNumbers('rune-heavy').some((r) => r[0] === 'Size') && entryNumbers('spell-lure').length >= 2 && entryUse('spell-lure', false).length > 5 && entryNumbers('creature-crab').length === 0);

  // ---------------------------------------------------------------- hotbar swap
  const h2 = createHotbar(); addSpell(h2, 'riptide'); addSpell(h2, 'lure'); selectIndex(h2, 2);
  assert('hotbar swap: slots 0 and 2 trade places, the selection stays on the same spell', swapSlots(h2, 0, 2) && h2.slots[0].ids[0] === 'lure' && h2.slots[2].ids[0] === 'ink-cloud' && h2.sel === 0);
  assert('hotbar swap: bad indexes are refused', !swapSlots(h2, 1, 1) && !swapSlots(h2, 0, 3) && !swapSlots(h2, -1, 0));

  // ---------------------------------------------------------------- counters persist (7 per entry) and old saves migrate
  let saved = null, savedIds = [];
  const store = { load: () => savedIds, save: (a) => { savedIds = a; }, loadStats: () => saved || { 'spell-riptide': [0, 0, 0, 9, 0], 'item-bomb': [0, 0, 1, 4, 0], 'item-shell': [0, 0, 0, 3, 0] }, saveStats: (s) => { saved = s; } };
  const j = createJournal(store);
  assert('journal migration: an old 5-counter save moves spell casts and bomb throws from collected to used', STAT_COUNT === 7 && j.stat('spell-riptide', STAT_USED) === 9 && j.stat('spell-riptide', STAT_COLLECTED) === 0 && j.stat('item-bomb', STAT_USED) === 4 && j.stat('item-bomb', STAT_COLLECTED) === 0 && j.stat('item-shell', STAT_COLLECTED) === 3);
  j.discover('item-flippers'); j.bump('item-flippers', STAT_CARRIED); j.bump('item-inkjet', STAT_USED, 3); j.flush();
  const j2 = createJournal(store);
  assert('journal: discoveries, runs carried and uses persist through the store', j2.has('item-flippers') && j2.stat('item-flippers', STAT_CARRIED) === 1 && j2.stat('item-inkjet', STAT_USED) === 3 && saved['item-flippers'].length === 7 && j2.stat('spell-riptide', STAT_USED) === 9);

  // ---------------------------------------------------------------- the book: Carried first, details, swap by keys
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:800px;visibility:hidden';
  document.body.appendChild(root);
  const hb3 = createHotbar(); addSpell(hb3, 'riptide'); addSpell(hb3, 'lure');
  const swaps = [];
  const st3 = () => ({ slots: hb3.slots, sel: hb3.sel, items: ['flippers'], bombs: 3, bombMax: 5, juice: 12, cap: 12, perCast: 4, touch: false });
  const jb = createJournal({ load: () => ['item-flippers'], save() {} });
  const book = createJournalScreen(root, jb, { getCarried: st3, onSwap: (a, b) => { swaps.push([a, b]); swapSlots(hb3, a, b); }, onSelectSlot: (i) => selectIndex(hb3, i) });
  try {
    book.show();
    const tabs = [...root.querySelectorAll('.octo-bk-tab')].filter((b) => b.style.display !== 'none').map((b) => b.dataset.tab);
    assert('book: the first bookmark is Carried and the book opens on it', tabs[0] === 'carried' && book.tab() === 'carried' && tabs.length === TABS.length + 1);
    const keys = [...root.querySelectorAll('.octo-bk-ccard')].map((c) => c.dataset.id);
    assert('book: the Carried grid shows every carried thing', keys.join() === 'slot:0,slot:1,slot:2,jet,bomb,jar,item:flippers');
    book.select('jet');
    const right = () => root.querySelector('.octo-bk-right').textContent;
    assert('book: highlighting the Ink Jet shows its name, numbers and keys', /Ink Jet/.test(right()) && /1 shot \//.test(right()) && /How:/.test(right()));
    const key = (code) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    key('ArrowRight');
    assert('book: the right arrow moves the highlight to the next card', book.entry() === 'bomb');
    key('ArrowUp');
    assert('book: the up arrow moves a row up (onto a hotbar slot)', book.entry().startsWith('slot:'));
    book.select('slot:0'); key('Enter');
    assert('book: Enter on a slot picks it up for a swap', book.page().pick === 0 && root.querySelector('.octo-bk-ccard.is-picked').dataset.id === 'slot:0');
    key('ArrowRight'); key('ArrowRight'); key('Enter');
    assert('book: Enter on another slot swaps the two (the highlight follows the moved spell)', swaps.length === 1 && swaps[0][0] === 0 && swaps[0][1] === 2 && hb3.slots[2].ids[0] === 'ink-cloud' && book.entry() === 'slot:2' && book.page().pick === -1);
    root.querySelector('.octo-bk-act-left').click();
    assert('book: the move-left button on a slot page swaps it with its neighbour', swaps.length === 2 && hb3.slots[1].ids[0] === 'ink-cloud');
    key('KeyE');
    assert('book: E turns to the next bookmark', book.tab() === TABS[0].id);
    book.showEntry('item-magnet');
    const locked = root.querySelector('.octo-bk-entry');
    assert('book: an undiscovered item page is a silhouette with ??? and the hint where it is found', locked.classList.contains('is-locked') && /\?\?\?/.test(locked.textContent) && locked.textContent.includes(byId.get('item-magnet').where));
    book.showEntry('item-flippers');
    const found = root.querySelector('.octo-bk-entry');
    assert('book: a discovered item page shows name, numbers, where found and its counters', !found.classList.contains('is-locked') && found.classList.contains('has-facts') && /Flippers/.test(found.textContent) && /\+20%/.test(found.textContent) && /Found:/.test(found.textContent) && /Runs carried/.test(found.textContent));
    book.showEntry('spell-riptide');
    assert('book: the Items tab starts a new page for its spells, titled Spells and Runes', root.querySelector('.octo-bk-left .octo-bk-title').textContent === 'Spells and Runes');
  } finally { book.hide(); root.remove(); }
}
