// B1-4 journal tests (journal.js + save.js persistence).
import { createJournal, ENTRIES, CATEGORIES, creatureId, itemId } from '../js/journal.js';
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
