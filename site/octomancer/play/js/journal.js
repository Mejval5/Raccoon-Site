// Journal (V2-PLAN section 10; round 38: a book with tabs, the Spelunky 2 way). Entries keyed by id for places,
// creatures and items. An entry is discovered the first time it is seen or visited and
// stays discovered (persisted through save.js). The list screen is journal-ui.js.
//
// Flat data: ENTRIES is plain data, `found` is a Uint8Array indexed like ENTRIES.

export const CAT_PLACE = 'place', CAT_CREATURE = 'creature', CAT_HAZARD = 'hazard', CAT_ITEM = 'item', CAT_LOOT = 'loot', CAT_PERSON = 'person', CAT_PROP = 'prop', CAT_SPELL = 'spell';
export const CATEGORIES = [CAT_PLACE, CAT_PERSON, CAT_CREATURE, CAT_HAZARD, CAT_ITEM, CAT_SPELL, CAT_LOOT, CAT_PROP];
/** The book's tabs (Spelunky 2 journal: Places, People, Bestiary, Items, Traps), each showing some categories. */
export const TABS = []; // filled from data/journal.json: { id, title, cats }
/** Counters per entry (the entry page shows the ones that fit its category). */
export const STAT_SEEN = 0, STAT_KILLED = 1, STAT_KILLED_BY = 2, STAT_COLLECTED = 3, STAT_ANGERED = 4, STAT_USED = 5, STAT_CARRIED = 6, STAT_COUNT = 7;

export const CATEGORY_TITLES = { place: 'Places', creature: 'Creatures', hazard: 'Hazards', item: 'Items', spell: 'Spells and Runes', look: 'Looks', loot: 'Loot and Secrets', person: 'People', prop: 'Props' };

/**
 * The entries are data rows in data/journal.json (round 38): id, category, name, a short description, the art to draw
 * (a real sprite, generated art, an item icon or a code drawing: journal-art.js) and which counters apply. Ids are
 * stable: saves store them. Fetched once when the module loads (every importer is a browser module).
 * Item, spell and rune rows also have `where` (one line: where it is found), shown on the page and, as a tease, on the locked page.
 * A People row also has `story`: {key, lines:[[stage, text]...]}: the questline so far, read from the save's story flags (storyLines).
 * @type {{id:string, cat:string, name:string, text:string, art:any, counters:[string,string][], story:any, where:string|null}[]}
 */
export const ENTRIES = [];
const STAT_KEYS = { seen: STAT_SEEN, killed: STAT_KILLED, killedBy: STAT_KILLED_BY, collected: STAT_COLLECTED, angered: STAT_ANGERED, used: STAT_USED, carried: STAT_CARRIED };
{
  const res = await fetch(new URL('../data/journal.json', import.meta.url));
  if (!res.ok) throw new Error('journal.json ' + res.status);
  const json = await res.json();
  TABS.length = 0;
  for (const t of json.tabs) TABS.push({ id: t.id, title: t.title, cats: t.categories.slice() });
  for (const r of json.entries) {
    const counters = (r.counters || []).filter((c) => STAT_KEYS[c[0]] !== undefined).map((c) => [c[0], String(c[1])]);
    ENTRIES.push({ id: r.id, cat: r.category, name: r.name, text: r.text, art: r.art || null, counters, story: r.story || null, where: r.where || null });
  }
}

const INDEX = new Map(ENTRIES.map((e, i) => [e.id, i]));

/** Journal id for an enemy kind ('urchin' -> 'creature-urchin'), or null for unknown kinds. */
export function creatureId(kind) {
  const id = 'creature-' + kind;
  return INDEX.has(id) ? id : null;
}
/** The entry row for an id, or null. */
export function entryById(id) { const i = INDEX.get(id); return i === undefined ? null : ENTRIES[i]; }
/** Journal id for a pickup type ('shell' -> 'item-shell'), or null. */
export function itemId(type) {
  const id = 'item-' + type;
  return INDEX.has(id) ? id : null;
}

/** Journal id for the thing that killed the octopus (octopus.js `cause`): a creature, a hazard, the bomb or a chest; null if none fits. */
export function causeEntryId(cause) {
  if (cause === 'shot') return 'creature-cannon';
  if (cause === 'bomb') return 'item-bomb';
  if (cause === 'chest') return 'loot-chest';
  if (cause === 'clam') return 'creature-gclam';
  if (cause === 'shopkeeper') return 'person-keeper';
  for (const pre of ['creature-', 'hazard-']) if (INDEX.has(pre + cause)) return pre + cause;
  return null;
}

/** The tab that shows an entry category. */
export function tabOfCat(cat) {
  for (const t of TABS) if (t.cats.includes(cat)) return t.id;
  return TABS[0].id;
}

/**
 * @param {{load:()=>string[], save:(ids:string[])=>void, loadStats?:()=>Record<string, number[]>, saveStats?:(s:Record<string, number[]>)=>void}} store
 *   persistence (save.js in the game, a fake in tests). Stats are optional: without them the counters just stay in memory.
 */
export function createJournal(store) {
  const found = new Uint8Array(ENTRIES.length);
  const stats = new Uint32Array(ENTRIES.length * STAT_COUNT); // flat: entry * STAT_COUNT + STAT_*
  let count = 0, dirty = false;
  const events = []; // ids discovered since the last takeNew()
  for (const id of store.load()) {
    const i = INDEX.get(id);
    if (i !== undefined && !found[i]) { found[i] = 1; count++; }
  }
  if (store.loadStats) {
    const saved = store.loadStats() || {};
    for (const id of Object.keys(saved)) {
      const i = INDEX.get(id);
      if (i === undefined || !Array.isArray(saved[id])) continue;
      for (let k = 0; k < STAT_COUNT; k++) stats[i * STAT_COUNT + k] = Math.max(0, Math.floor(Number(saved[id][k]) || 0));
      // 2026-10-08: saves from before STAT_USED counted spell casts and bomb throws as "collected"; they move to "used"
      if (saved[id].length <= STAT_USED && (id === 'item-bomb' || (ENTRIES[i].cat === CAT_SPELL && id.startsWith('spell-')))) {
        stats[i * STAT_COUNT + STAT_USED] = stats[i * STAT_COUNT + STAT_COLLECTED]; stats[i * STAT_COUNT + STAT_COLLECTED] = 0; dirty = true;
      }
      if (!found[i]) { found[i] = 1; count++; } // a counter without a discovery can only come from a hand-edited save: show it
    }
  }

  function persist() {
    const ids = [];
    for (let i = 0; i < ENTRIES.length; i++) if (found[i]) ids.push(ENTRIES[i].id);
    store.save(ids);
  }
  function persistStats() {
    if (!store.saveStats) { dirty = false; return; }
    const out = {};
    for (let i = 0; i < ENTRIES.length; i++) {
      let any = false;
      for (let k = 0; k < STAT_COUNT; k++) if (stats[i * STAT_COUNT + k]) any = true;
      if (any) out[ENTRIES[i].id] = Array.from(stats.subarray(i * STAT_COUNT, i * STAT_COUNT + STAT_COUNT));
    }
    store.saveStats(out);
    dirty = false;
  }

  return {
    /** Mark an entry discovered. Returns true only the first time (unknown ids are ignored). */
    discover(id) {
      const i = INDEX.get(id);
      if (i === undefined || found[i]) return false;
      found[i] = 1; count++;
      events.push(id);
      persist();
      return true;
    },
    has(id) { const i = INDEX.get(id); return i !== undefined && found[i] === 1; },
    count() { return count; },
    total() { return ENTRIES.length; },
    /** Add `n` to one counter of an entry (STAT_*). Persisted by flush() (the game flushes at dive end, on close and on page hide). */
    bump(id, stat, n = 1) {
      const i = INDEX.get(id);
      if (i === undefined || stat < 0 || stat >= STAT_COUNT) return;
      stats[i * STAT_COUNT + stat] += n; dirty = true;
    },
    stat(id, stat) { const i = INDEX.get(id); return i === undefined ? 0 : stats[i * STAT_COUNT + stat]; },
    /** Write pending counter changes to the store. */
    flush() { if (dirty) persistStats(); },
    /** Entries of one category (or all) with a `found` flag and a `stats` array [seen, killed, killedBy, collected, angered, used, carried], in ENTRIES order. */
    list(cat) {
      const out = [];
      for (let i = 0; i < ENTRIES.length; i++) {
        if (cat && ENTRIES[i].cat !== cat) continue;
        out.push({ ...ENTRIES[i], found: found[i] === 1, stats: Array.from(stats.subarray(i * STAT_COUNT, i * STAT_COUNT + STAT_COUNT)) });
      }
      return out;
    },
    /** The entries of one tab (TABS), in book order: the tab's categories one after the other. */
    tabList(tabId) {
      const t = TABS.find((x) => x.id === tabId);
      const out = [];
      if (!t) return out;
      for (const cat of t.cats) for (const e of this.list(cat)) out.push(e);
      return out;
    },
    /** Found / total for one tab. */
    tabProgress(tabId) { const l = this.tabList(tabId); return { found: l.filter((e) => e.found).length, total: l.length }; },
    /** Ids discovered since the last call (main.js turns them into toasts). */
    takeNew() { return events.splice(0, events.length); },
  };
}

/** Whole-number percentage found / total (0 for an empty set); rounds down so 100% only means every entry. */
export function percent(found, total) { return total > 0 ? Math.floor((100 * found) / total) : 0; }

/** Counter rows of an entry as [label, value] pairs, the ones its data row lists (`e.stats` from journal.list). */
export function counterRows(e) {
  return e.counters.map(([key, label]) => [label, e.stats[STAT_KEYS[key]] || 0]);
}

/**
 * The lines of a person's questline reached so far, in order ("story so far", like Spelunky 2's People pages): every line whose
 * stage is at or below the person's counter in the story flags (`flags[story.key]`, 0 when the key is empty or missing).
 */
export function storyLines(e, flags) {
  if (!e || !e.story) return [];
  const n = e.story.key ? Math.max(0, Math.floor(Number(flags && flags[e.story.key]) || 0)) : 0;
  const out = e.story.lines.filter((l) => n >= l[0]).map((l) => l[1]);
  // V2-PLAN 16: lines for what you did to them (`extra`: [flag, text]), shown once the flag counts at least one
  if (e.story.extra) for (const x of e.story.extra) if ((Number(flags && flags[x[0]]) || 0) > 0) out.push(x[1]);
  return out;
}

/** Completion: overall and per tab, from the journal's found counts. {found, total, pct, tabs:[{id, title, found, total, pct}]} */
export function completion(journal) {
  const tabs = TABS.map((t) => { const p = journal.tabProgress(t.id); return { id: t.id, title: t.title, found: p.found, total: p.total, pct: percent(p.found, p.total) }; });
  const found = tabs.reduce((a, t) => a + t.found, 0), total = tabs.reduce((a, t) => a + t.total, 0);
  return { found, total, pct: percent(found, total), tabs };
}
