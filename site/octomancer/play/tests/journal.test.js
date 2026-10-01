// B1-4 journal tests (journal.js + save.js persistence).
import { createJournal, ENTRIES, CATEGORIES, TABS, creatureId, itemId, causeEntryId, tabOfCat, completion, percent, counterRows, STAT_SEEN, STAT_KILLED, STAT_KILLED_BY, STAT_COLLECTED } from '../js/journal.js';
import { artList, hasArt, FN } from '../js/journal-art.js';
import { ITEM_DEFS } from '../js/items.js';
import { getJournalStats, saveJournalStats, getJournalIds, saveJournalIds, getTutorialDone, setTutorialDone, _resetForTests } from '../js/save.js';

export async function runJournalTests(assert) {
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
  assert('journal: list(cat) marks found and unfound entries', list.length === ENTRIES.filter((e) => e.cat === 'creature').length && list.filter((e) => e.found).length === 1 && list.find((e) => e.id === 'creature-urchin').found);

  // --- round 38: tabs, art, counters ---
  assert('journal tabs: Places, People, Bestiary, Items, Traps, and every category is on a tab', TABS.map((t) => t.title).join() === 'Places,People,Bestiary,Items,Traps' && CATEGORIES.every((c) => TABS.some((t) => t.cats.includes(c))));
  assert('journal tabs: every entry is on exactly one tab and tabOfCat agrees', ENTRIES.every((e) => TABS.filter((t) => t.cats.includes(e.cat)).length === 1 && TABS.find((t) => t.id === tabOfCat(e.cat)).cats.includes(e.cat)));
  assert('journal art: every entry has a picture (sprite, generated art, item icon or code drawing)', ENTRIES.every((e) => hasArt(e.id)));
  {
    // every sprite a row references exists: the image files load (HTTP 200), the item icons are real items, the code drawings are defined
    const bad = [];
    const checked = new Map();
    for (const { id, art } of artList()) {
      if (art.img) {
        if (!checked.has(art.img)) { const r = await fetch(art.img); checked.set(art.img, r.ok); }
        if (!checked.get(art.img)) bad.push(id + ' img');
      } else if (art.item) { if (!ITEM_DEFS[art.item]) bad.push(id + ' item'); }
      else if (art.fn) { if (typeof FN[art.fn] !== 'function') bad.push(id + ' fn'); }
      else bad.push(id + ' empty');
    }
    assert('journal art: every sprite referenced by journal.json exists (files load, item icons and code drawings are defined)' + (bad.length ? ' [' + bad.join(', ') + ']' : ''), bad.length === 0 && checked.size >= 15);
  }
  assert('journal data: every row has id, category, name, a short text (two lines) and counters from the known set', ENTRIES.every((e) => e.id && e.cat && e.name && e.text.length > 20 && e.text.length <= 130 && e.counters.length >= 1 && e.counters.every(([k, l]) => ['seen', 'killed', 'killedBy', 'collected'].includes(k) && l)));
  assert('journal data: seeded with every place (hub, training cave, Shallows, stall, wreck, garden, gauntlet), enemy, trap, item, prop and the four people',
    ['place-hub', 'place-tutorial', 'place-shallows', 'place-shop', 'place-wreck', 'place-garden', 'place-gauntlet', 'creature-fish', 'hazard-anemone', 'item-heartcontainer', 'loot-relic', 'prop-rune', 'prop-fossil', 'prop-weed', 'prop-boulder', 'person-diver', 'person-critter', 'person-keeper', 'person-collector'].every((i) => ids.includes(i)));
  assert('journal: the old quest entries are gone, four people took their place', !ENTRIES.some((e) => e.id.startsWith('quest-')) && ENTRIES.filter((e) => e.cat === 'person').length === 4);
  {
    // lock / unlock: everything starts locked, the first encounter unlocks exactly that entry and no other
    const jl = createJournal({ load: () => [], save() {} });
    assert('journal lock: a fresh journal has every entry locked', jl.count() === 0 && jl.list().every((e) => !e.found));
    jl.discover('creature-crab');
    assert('journal lock: meeting the crab unlocks the crab only', jl.has('creature-crab') && jl.count() === 1 && !jl.has('creature-piranha') && jl.list('creature').filter((e) => e.found).length === 1);
    const crab = jl.list('creature').find((e) => e.id === 'creature-crab');
    assert('journal counters: a creature shows Seen / Killed / Killed by, a hazard Seen / Killed by, a place Visited, a person Met / Helped',
      counterRows(crab).map((r) => r[0]).join() === 'Seen,Killed,Killed by' && counterRows(jl.list('hazard')[0]).map((r) => r[0]).join() === 'Seen,Killed by' &&
      counterRows(jl.list('place')[0]).map((r) => r[0]).join() === 'Visited' && counterRows(jl.list('person')[0]).map((r) => r[0]).join() === 'Met,Helped');
    // completion math: percentages per tab and overall are floor(100 * found / total); 100% only when everything is found
    const c0 = completion(jl);
    assert('journal completion: one of N entries found is floor(100/N)% overall, the Bestiary tab shows its share', c0.found === 1 && c0.total === ENTRIES.length && c0.pct === Math.floor(100 / ENTRIES.length) && c0.tabs.find((t) => t.id === 'bestiary').pct === Math.floor(100 / jl.tabList('bestiary').length));
    for (const e of ENTRIES) jl.discover(e.id);
    const c1 = completion(jl);
    assert('journal completion: everything found is 100% overall and on every tab, and the tab totals add up to the entries', c1.pct === 100 && c1.tabs.every((t) => t.pct === 100) && c1.tabs.reduce((a, t) => a + t.total, 0) === ENTRIES.length);
    assert('journal completion: percent() handles 0 / 0, 1 / 3 and 2 / 3', percent(0, 0) === 0 && percent(1, 3) === 33 && percent(2, 3) === 66 && percent(3, 3) === 100);
  }
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
    {
      // counters persist in save.js (one flat [seen, killed, killedBy, collected] array per entry) and come back through a journal
      const j4 = createJournal({ load: getJournalIds, save: saveJournalIds, loadStats: getJournalStats, saveStats: saveJournalStats });
      j4.bump('creature-crab', STAT_SEEN, 12); j4.bump('creature-crab', STAT_KILLED, 4); j4.bump('creature-crab', STAT_KILLED_BY); j4.flush();
      _resetForTests();
      assert('journal save: counters persist across a reload as flat arrays', JSON.stringify(getJournalStats()['creature-crab']) === '[12,4,1,0]');
      const j5 = createJournal({ load: getJournalIds, save: saveJournalIds, loadStats: getJournalStats, saveStats: saveJournalStats });
      assert('journal save: a journal built on save.js restores Seen 12 / Killed 4 / Killed by 1 and the entry is unlocked', j5.stat('creature-crab', STAT_SEEN) === 12 && j5.stat('creature-crab', STAT_KILLED) === 4 && j5.stat('creature-crab', STAT_KILLED_BY) === 1 && j5.has('creature-crab'));
      j5.bump('creature-crab', STAT_SEEN); j5.flush(); _resetForTests();
      assert('journal save: further counts add to the stored ones', getJournalStats()['creature-crab'][0] === 13);
      _resetForTests();
    }
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
