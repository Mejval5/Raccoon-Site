// Journal (V2-PLAN section 10, B1-4), behind ?v2=1. Entries keyed by id for places,
// creatures and items. An entry is discovered the first time it is seen or visited and
// stays discovered (persisted through save.js). The list screen is journal-ui.js.
//
// Flat data: ENTRIES is plain data, `found` is a Uint8Array indexed like ENTRIES.

export const CAT_PLACE = 'place', CAT_CREATURE = 'creature', CAT_HAZARD = 'hazard', CAT_ITEM = 'item', CAT_LOOT = 'loot', CAT_QUEST = 'quest';
export const CATEGORIES = [CAT_PLACE, CAT_CREATURE, CAT_HAZARD, CAT_ITEM, CAT_LOOT, CAT_QUEST];
export const CATEGORY_TITLES = { place: 'Places', creature: 'Creatures', hazard: 'Hazards', item: 'Items', loot: 'Loot and Secrets', quest: 'Quests' };

/** Seed content; the art and longer text come later. Ids are stable: saves store them. */
export const ENTRIES = [
  { id: 'place-hub', cat: CAT_PLACE, name: 'The Hub',
    text: 'A quiet cave where every dive begins. The ring in the floor leads down, and the board on the wall keeps this journal.' },
  { id: 'place-tutorial', cat: CAT_PLACE, name: 'The Training Cave',
    text: 'A short cave that teaches swimming, dashing and bombing. It ends in a ring that leads on to the Shallows.' },
  { id: 'place-shallows', cat: CAT_PLACE, name: 'The Shallows',
    text: 'The first biome: sunlit caves of winding tunnels, ledges and shafts. Find the ring at the bottom of each level to swim deeper.' },
  { id: 'place-shop', cat: CAT_PLACE, name: 'The Shell Stall',
    text: 'A keeper with three pedestals, tucked into a side cave. Swim onto an item to buy it with shells.' },

  { id: 'creature-urchin', cat: CAT_CREATURE, name: 'Urchin',
    text: 'A spiny ball that sits still on the rock. It never chases you, but touching it hurts.' },
  { id: 'creature-piranha', cat: CAT_CREATURE, name: 'Piranha',
    text: 'A fast fish that patrols and gives chase when it spots you. A dash straight through one is enough to beat it.' },
  { id: 'creature-crab', cat: CAT_CREATURE, name: 'Crab',
    text: 'Scuttles along the rock, floor and ceiling alike. Keep your distance.' },
  { id: 'creature-horns', cat: CAT_CREATURE, name: 'Horned Growth',
    text: 'Hard spikes that grow from the ceiling. They do not move, so swim around them.' },
  { id: 'creature-manta', cat: CAT_CREATURE, name: 'Manta',
    text: 'A broad ray that glides through open water and spits at you. It needs wide caves.' },
  { id: 'creature-cannon', cat: CAT_CREATURE, name: 'Cannon',
    text: 'A fixed turret grown into the wall. It fires slow shots along its line of sight.' },
  { id: 'creature-beholder', cat: CAT_CREATURE, name: 'The Beholder',
    text: 'It comes for anyone who lingers too long in one level, and it does not stop.' },

  { id: 'hazard-jet', cat: CAT_HAZARD, name: 'Current Jet',
    text: 'A vent in the rock that blasts water along a line of bubbles. It does no harm, but it will carry you wherever it points.' },
  { id: 'hazard-spikes', cat: CAT_HAZARD, name: 'Spike Wall',
    text: 'A strip of hard spikes set into the rock face. Touching it hurts, so keep a body length away.' },
  { id: 'hazard-rock', cat: CAT_HAZARD, name: 'Loose Rock',
    text: 'A boulder wedged in a ledge that drops when something swims underneath. It hurts on the way down, then settles as ordinary rock that a bomb will clear.' },
  { id: 'hazard-eel', cat: CAT_HAZARD, name: 'Electric Eel',
    text: 'It patrols a narrow shaft. The body glows just before it lets out a ring of shock that spreads through open water; rock stops it.' },
  { id: 'hazard-anemone', cat: CAT_HAZARD, name: 'Anemone Cluster',
    text: 'Soft pink fronds that sway on the cave floor. They sting on contact, so swim over them, not through them.' },

  { id: 'item-plankton', cat: CAT_ITEM, name: 'Plankton',
    text: 'Glowing drifts of tiny life. Collect it for score.' },
  { id: 'item-shell', cat: CAT_ITEM, name: 'Shell',
    text: 'A rare find, often tucked away on the cave floor. Worth a lot of score.' },
  { id: 'item-bomb', cat: CAT_ITEM, name: 'Bomb',
    text: 'Place one and swim clear: after a short fuse it breaks nearby rock and hurts anything close, you included.' },
  { id: 'item-heart', cat: CAT_ITEM, name: 'Heart',
    text: 'Sold at the Shell Stall. Restores one heart, up to your maximum.' },
  { id: 'item-bombpack', cat: CAT_ITEM, name: 'Bomb Pack',
    text: 'Sold at the Shell Stall. Three bombs in one bundle, up to the most you can carry.' },

  { id: 'loot-clam', cat: CAT_LOOT, name: 'Clam',
    text: 'A sleeping clam with something shiny inside. A dash straight through it, or a bomb, cracks it open and sends shells tumbling out.' },
  { id: 'loot-pot', cat: CAT_LOOT, name: 'Clay Pot',
    text: 'An old pot left on the cave floor. It shatters to a dash or a blast, and there are always a few shells in the pieces.' },
  { id: 'loot-chest', cat: CAT_LOOT, name: 'Chest',
    text: 'Swim into a chest to open it: a small pile of shells. Not every one is honest, and some bite back with spikes or a swarm of piranhas.' },
  { id: 'loot-pocket', cat: CAT_LOOT, name: 'Hidden Pocket',
    text: 'A rock tile with a hairline crack or a faint glint, hollow inside. Bomb it from the nearest cave and see what was tucked away.' },
  { id: 'loot-relic', cat: CAT_LOOT, name: 'The Relic',
    text: 'A golden idol on a pedestal, worth twenty-five shells. The moment you lift it the ceiling starts to come down, for about ten seconds: keep moving.' },

  { id: 'quest-rescue', cat: CAT_QUEST, name: 'Rescue the Lost Critter',
    text: 'A small creature is stranded in a side pocket. Touch it and it follows your trail: bring it to the exit.' },
  { id: 'quest-vault', cat: CAT_QUEST, name: 'Crack the Vault',
    text: 'A cache is sealed inside a pocket of rock. Bomb it open from the nearest cave and swim in.' },
  { id: 'quest-untouched', cat: CAT_QUEST, name: 'Untouched',
    text: 'Reach the exit without losing a single heart.' },
  { id: 'quest-pest', cat: CAT_QUEST, name: 'Pest Control',
    text: 'Piranhas have moved in. Dash through or blast enough of them to clear the level.' },
];

const INDEX = new Map(ENTRIES.map((e, i) => [e.id, i]));

/** Journal id for an enemy kind ('urchin' -> 'creature-urchin'), or null for unknown kinds. */
export function creatureId(kind) {
  const id = 'creature-' + kind;
  return INDEX.has(id) ? id : null;
}
/** Journal id for a pickup type ('shell' -> 'item-shell'), or null. */
export function itemId(type) {
  const id = 'item-' + type;
  return INDEX.has(id) ? id : null;
}

/**
 * @param {{load:()=>string[], save:(ids:string[])=>void}} store persistence (save.js in the game, a fake in tests)
 */
export function createJournal(store) {
  const found = new Uint8Array(ENTRIES.length);
  let count = 0;
  const events = []; // ids discovered since the last takeNew()
  for (const id of store.load()) {
    const i = INDEX.get(id);
    if (i !== undefined && !found[i]) { found[i] = 1; count++; }
  }

  function persist() {
    const ids = [];
    for (let i = 0; i < ENTRIES.length; i++) if (found[i]) ids.push(ENTRIES[i].id);
    store.save(ids);
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
    /** Entries of one category (or all) with a `found` flag, in ENTRIES order. */
    list(cat) {
      const out = [];
      for (let i = 0; i < ENTRIES.length; i++) {
        if (cat && ENTRIES[i].cat !== cat) continue;
        out.push({ ...ENTRIES[i], found: found[i] === 1 });
      }
      return out;
    },
    /** Ids discovered since the last call (main.js turns them into toasts). */
    takeNew() { return events.splice(0, events.length); },
  };
}
