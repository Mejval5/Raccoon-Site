// B1-4 journal tests (journal.js + save.js persistence).
import { createJournal, ENTRIES, CATEGORIES, TABS, creatureId, itemId, causeEntryId, tabOfCat, STAT_SEEN, STAT_KILLED, STAT_KILLED_BY, STAT_COLLECTED } from '../js/journal.js';
import { ART_IDS, hasArt } from '../js/journal-art.js';
import { getJournalIds, saveJournalIds, getTutorialDone, setTutorialDone, _resetForTests } from '../js/save.js';

export function runJournalTests(assert) {
  // --- data ---
  const ids = ENTRIES.map((e) => e.id);
  assert('journal: entry ids are unique and every entry has a name, text and known category',
    new Set(ids).size === ids.length && ENTRIES.every((e) => e.name && e.text && CATEGORIES.includes(e.cat)));
  assert('journal: seeded with the hub, tutorial and Shallows places',
    ['place-hub', 'place-tutorial', 'place-shallows'].every((i) => ids.includes(i)));
  assert('journal: seeded with every creature in the game (urchin, piranha, crab, horns, manta, cannon, beholder)',
    ['urchin', 'piranha', 'crab', 'horns', 'manta', 'cannon', 'beholder'].every((k) => creatureId(k) && ids.includes(creatureId(k))));
  assert('journal: seeded with plankton, shell and bomb items', ['plankton', 'shell', 'bomb'].every((k) => itemId(k)));
  assert('journal: unknown kinds map to null', creatureId('unicorn') === null && itemId('sword') === null);

  // --- discovery with a fake store ---
  let saved = ['place-hub', 'bogus-id'];
  let saves = 0;
  const store = { load: () => saved, save: (list) => { saved = list; saves++; } };
  const j = createJournal(store);
  assert('journal: loads saved ids and ignores unknown ones', j.count() === 1 && j.has('place-hub') && !j.has('bogus-id'));
  assert('journal: first discovery returns true and persists', j.discover('creature-urchin') === true && saves === 1 && saved.includes('creature-urchin'));
  assert('journal: a second discovery of the same entry returns false and does not save again', j.discover('creature-urchin') === false && saves === 1);
  assert('journal: unknown ids are ignored', j.discover('nope') === false && j.count() === 2);
  assert('journal: takeNew returns the newly found ids once', (() => { const n = j.takeNew(); return n.length === 1 && n[0] === 'creature-urchin' && j.takeNew().length === 0; })());
  const j2 = createJournal(store);
  assert('journal: a new journal over the same store restores the discoveries', j2.has('place-hub') && j2.has('creature-urchin') && j2.count() === 2);
  const list = j2.list('creature');
  assert('journal: list(cat) marks found and unfound entries', list.length === 7 && list.filter((e) => e.found).length === 1 && list.find((e) => e.id === 'creature-urchin').found);

  // --- round 38: tabs, art, counters ---
  assert('journal tabs: Places, People, Bestiary, Items, Traps, and every category is on a tab', TABS.map((t) => t.title).join() === 'Places,People,Bestiary,Items,Traps' && CATEGORIES.every((c) => TABS.some((t) => t.cats.includes(c))));
  assert('journal tabs: every entry is on exactly one tab and tabOfCat agrees', ENTRIES.every((e) => TABS.filter((t) => t.cats.includes(e.cat)).length === 1 && TABS.find((t) => t.id === tabOfCat(e.cat)).cats.includes(e.cat)));
  assert('journal art: every entry has a picture (sprite, generated art, item icon or code drawing)', ENTRIES.every((e) => hasArt(e.id)) && ART_IDS.every((id) => ENTRIES.some((e) => e.id === id)));
  assert('journal: the old quest entries are gone, three people took their place', !ENTRIES.some((e) => e.id.startsWith('quest-')) && ENTRIES.filter((e) => e.cat === 'person').length === 3);
  assert('journal: death causes map to entries (creature, hazard, bomb, chest, cannon shot)', causeEntryId('crab') === 'creature-crab' && causeEntryId('spikes') === 'hazard-spikes' && causeEntryId('eel') === 'hazard-eel' && causeEntryId('bomb') === 'item-bomb' && causeEntryId('chest') === 'loot-chest' && causeEntryId('shot') === 'creature-cannon' && causeEntryId('unknown') === null);
  {
    let savedStats = null, ss = 0;
    const store2 = { load: () => [], save() {}, loadStats: () => ({ 'item-shell': [0, 0, 0, 5], 'nope': [1, 1, 1, 1] }), saveStats: (st) => { savedStats = st; ss++; } };
    const jj = createJournal(store2);
    assert('journal stats: counters load, unknown ids are ignored, a counter implies the entry is found', jj.stat('item-shell', STAT_COLLECTED) === 5 && jj.has('item-shell') && !jj.has('nope'));
    jj.bump('creature-crab', STAT_KILLED); jj.bump('creature-crab', STAT_KILLED, 2); jj.bump('creature-crab', STAT_SEEN); jj.bump('creature-crab', STAT_KILLED_BY); jj.bump('bogus', STAT_SEEN); jj.bump('creature-crab', 9);
    assert('journal stats: bump adds, nothing is written until flush', jj.stat('creature-crab', STAT_KILLED) === 3 && jj.stat('creature-crab', STAT_SEEN) === 1 && ss === 0);
    jj.flush(); jj.flush();
    assert('journal stats: flush writes only the entries with counters, once', ss === 1 && JSON.stringify(savedStats['creature-crab']) === '[1,3,1,0]' && savedStats['item-shell'][3] === 5 && !('creature-urchin' in savedStats));
    assert('journal stats: list() carries the counters', jj.list('creature').find((e) => e.id === 'creature-crab').stats.join() === '1,3,1,0');
    assert('journal stats: tabList and tabProgress follow the tab', jj.tabList('traps').length === 5 && jj.tabProgress('items').found === 1 && jj.tabProgress('items').total === jj.tabList('items').length);
  }

  // --- save.js round trip through a fake localStorage ---
  const mem = new Map();
  const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stubbed = false;
  try { Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true }); stubbed = true; } catch (e) { /* engine refuses */ }
  if (stubbed) {
    _resetForTests();
    assert('journal save: empty at first, tutorial not done', getJournalIds().length === 0 && getTutorialDone() === false);
    saveJournalIds(['place-hub', 'item-shell']);
    setTutorialDone(true);
    _resetForTests(); // forget memory: the next load must come from storage
    assert('journal save: discovered ids persist across a reload', JSON.stringify(getJournalIds()) === JSON.stringify(['place-hub', 'item-shell']));
    assert('journal save: the tutorial flag persists', getTutorialDone() === true);
    const j3 = createJournal({ load: getJournalIds, save: saveJournalIds });
    j3.discover('creature-crab');
    _resetForTests();
    assert('journal save: a journal built on save.js keeps new discoveries', getJournalIds().includes('creature-crab') && getJournalIds().includes('item-shell'));
    mem.set('octomancer.best.v1', '{not json');
    _resetForTests();
    assert('journal save: corrupt storage falls back to an empty journal', getJournalIds().length === 0);
    mem.set('octomancer.best.v1', JSON.stringify({ v: 1, best: 5, runs: 1, journal: [3, 'place-hub'] }));
    _resetForTests();
    assert('journal save: an old save without journal fields loads, non-string ids are dropped', JSON.stringify(getJournalIds()) === JSON.stringify(['place-hub']) && getTutorialDone() === false);
    _resetForTests();
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
    _resetForTests();
  }
}
