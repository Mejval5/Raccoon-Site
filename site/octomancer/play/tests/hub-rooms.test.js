// The hub village (hub-rooms.js, data/hub-rooms.json, data/hub.json): rooms locked and unlocked by the quest flags, the seen-open
// bits that keep a room open (save.js story.hubRooms), the seals laid into the map, every room reachable once open (A*, real
// octopus radius), locked rooms shut, the people standing on floors, the furniture on the floor, the kelp curtain's push, and the
// keepsake behind fish bone.
import { parseAuthoredMap } from '../js/authored.js';
import { parseHubRooms, roomStates, applyHubRooms, conditionMet, openMask, roomOf, roomAt, kelpPush, softWalls, ROOMS_KEY, SEAL_KELP } from '../js/hub-rooms.js';
import { createPathGrid, findPath } from '../js/pathcheck.js';
import { MAT_TIMBER, MAT_ROCK, MAT_BONE } from '../js/materials.js';
import { getStory, setStoryExact, _resetForTests } from '../js/save.js';
import { ENTRIES } from '../js/journal.js';
import { ATLAS_HUB_RECTS } from '../js/sprite-atlas-hub.js';
import { ATLAS_RECTS } from '../js/sprite-atlas.js';
import { ATLAS_R3_RECTS } from '../js/sprite-atlas-r3.js';

export async function runHubRoomsTests(assert) {
  const hubJson = await (await fetch('../data/hub.json')).json();
  const table = parseHubRooms(await (await fetch('../data/hub-rooms.json')).json());
  const NPC_ROOMS = table.rooms.filter((r) => r.npc);
  const build = (story, stat = () => 0) => {
    const lv = parseAuthoredMap(hubJson);
    applyHubRooms(lv, table, roomStates(table, { story, stat }));
    return lv;
  };
  const isOpen = (lv, id) => lv.village.find((r) => r.id === id).open;
  const ALL = { marlo: 3, pip: 2, quill: 2, host: 1 };
  const keeperBought = (id, s) => (id === 'person-keeper' && s === 'collected' ? 1 : 0);

  assert('hub rooms: one room per person (Marlo, Pip, Quill, the host, the keeper), each with an anchor, a door, a seal, a journal place and a moved-in line',
    ['marlo', 'pip', 'quill', 'host', 'keeper'].every((n) => { const r = table.byNpc.get(n); return r && r.anchor && r.door && r.seal && r.journal && r.moved; }) && NPC_ROOMS.length === 5);
  assert('hub rooms: every room\'s journal place exists (category place, with a where hint), and the hidden hollow too',
    [...NPC_ROOMS.map((r) => r.journal), 'place-hollow'].every((id) => { const e = ENTRIES.find((x) => x.id === id); return e && e.cat === 'place' && e.where; }));
  assert('hub rooms: every furnishing sprite exists in an atlas', table.rooms.every((r) => r.furnish.every((f) => !f.sprite || ATLAS_HUB_RECTS[f.sprite] || ATLAS_RECTS[f.sprite] || ATLAS_R3_RECTS[f.sprite]))
    && [table.target.sprite, table.keepsake.sprite].every((n) => ATLAS_HUB_RECTS[n]));
  assert('hub rooms: the skins mirror shell stands in the wardrobe alcove (A), its base on the floor', (() => {
    const lv = parseAuthoredMap(hubJson);
    return lv.mirror && Math.floor(lv.mirror.x) === lv.wardrobeX && lv.mirror.y === lv.wardrobeY + 1 && lv.tiles[lv.mirror.y * lv.w + lv.wardrobeX] !== 0;
  })());

  // --- locked / unlocked by the quest flags ---
  const fresh = build({});
  assert('hub rooms: a fresh save has every person\'s room locked (the plaza is always open)', NPC_ROOMS.every((r) => !isOpen(fresh, r.id)) && isOpen(fresh, 'plaza'));
  const m1 = build({ marlo: 1 });
  assert('hub rooms: Marlo freed once opens only his workshop', isOpen(m1, 'workshop') && !isOpen(m1, 'grotto') && !isOpen(m1, 'nook') && !isOpen(m1, 'arena') && !isOpen(m1, 'den'));
  assert('hub rooms: Pip, Quill and the host open their own rooms', isOpen(build({ pip: 1 }), 'nook') && isOpen(build({ quill: 1 }), 'grotto') && isOpen(build({ host: 1 }), 'arena') && !isOpen(build({ host: 0, pip: 1 }), 'arena'));
  assert('hub rooms: the keeper\'s den opens after a first purchase (journal person-keeper collected)', !isOpen(build({}), 'den') && isOpen(build({}, keeperBought), 'den'));
  assert('hub rooms: conditions read story counters and journal stats', conditionMet({ story: 'marlo', min: 2 }, { story: { marlo: 2 } }) && !conditionMet({ story: 'marlo', min: 2 }, { story: { marlo: 1 } })
    && conditionMet({ journal: 'x', stat: 'seen', min: 1 }, { story: {}, stat: () => 1 }) && conditionMet(null, {}));

  // --- persistence: a room seen open stays open ---
  const st = roomStates(table, { story: { quill: 1 } });
  const mask = openMask(st);
  const grotto = table.byId.get('grotto');
  assert('hub rooms: the open mask holds the grotto (and the plaza) bit', (mask & grotto.bit) !== 0 && (mask & table.byId.get('workshop').bit) === 0);
  assert('hub rooms: a room open for the first time is new, and not new once its bit is stored', st.find((s) => s.room.id === 'grotto').isNew && !roomStates(table, { story: { quill: 1, [ROOMS_KEY]: mask } }).find((s) => s.room.id === 'grotto').isNew);
  assert('hub rooms: a room once seen open stays open when its person is gone (quill back to 0, the bit kept)', isOpen(build({ quill: 0, [ROOMS_KEY]: mask }), 'grotto'));
  {
    const mem = new Map();
    const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    let stubbed = false;
    try { Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true }); stubbed = true; } catch (e) { /* engine refuses */ }
    if (stubbed) {
      _resetForTests();
      setStoryExact(ROOMS_KEY, mask); setStoryExact('hubSecret', 1); setStoryExact('hubPractice', 2);
      _resetForTests();
      const s2 = getStory();
      assert('hub rooms save: hubRooms, hubSecret and hubPractice persist across a reload (save.js story)', s2[ROOMS_KEY] === mask && s2.hubSecret === 1 && s2.hubPractice === 2);
      _resetForTests();
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
    }
  }

  // --- the seals in the map ---
  const door = (lv, id) => lv.village.find((r) => r.id === id).doors;
  const tilesOf = (lv, d) => { const out = []; for (let i = 0; i < d.length; i += 2) out.push(lv.tiles[d[i + 1] * lv.w + d[i]]); return out; };
  assert('hub rooms: a locked workshop is boarded up (timber door tiles), a locked den is rubble (rock), a locked grotto keeps its kelp door open water',
    tilesOf(fresh, door(fresh, 'workshop')).every((t) => t === MAT_TIMBER) && tilesOf(fresh, door(fresh, 'den')).every((t) => t === MAT_ROCK) && tilesOf(fresh, door(fresh, 'grotto')).every((t) => t === 0));
  const full = build({ ...ALL }, keeperBought);
  assert('hub rooms: with everyone home every door is open water', NPC_ROOMS.every((r) => tilesOf(full, door(full, r.id)).every((t) => t === 0)));

  // --- reachability (A*, the real octopus radius) ---
  const pathTo = (lv, x, y, extraWall = null) => {
    const wall = new Uint8Array(lv.w * lv.h);
    if (extraWall) for (let i = 0; i < extraWall.length; i += 2) wall[extraWall[i + 1] * lv.w + extraWall[i]] = 1;
    const grid = createPathGrid(lv.w, lv.h, (tx, ty) => lv.tiles[ty * lv.w + tx] !== 0 || wall[ty * lv.w + tx] === 1);
    return findPath(grid, lv.startX + 0.5, lv.startY + 0.5, x + 0.5, y + 0.5) !== null;
  };
  const P = full.points;
  assert('hub rooms: everyone home, every room anchor is reachable from the start (A*)', full.village.every((r) => pathTo(full, r.ax, r.ay)));
  assert('hub rooms: the rings, the wardrobe alcove and the practice target are reachable (A*)',
    pathTo(full, full.exitX, full.exitY) && pathTo(full, full.tutorialX, full.tutorialY) && pathTo(full, full.shortcutX, full.shortcutY) && pathTo(full, full.shortcut3X, full.shortcut3Y)
    && pathTo(full, P.A[0], P.A[1]) && pathTo(full, P.G[0], P.G[1]));
  const bone = []; for (let i = 0; i < full.tiles.length; i++) if (full.tiles[i] === MAT_BONE) bone.push(i % full.w, Math.floor(i / full.w));
  assert('hub rooms: the keepsake (y) is sealed by fish bone (unreachable while it stands) and reachable once it crumbles', bone.length >= 4 && !pathTo(full, P.y[0], P.y[1]) && (() => {
    const lv = build({ ...ALL }, keeperBought);
    for (let i = 0; i < bone.length; i += 2) lv.tiles[bone[i + 1] * lv.w + bone[i]] = 0;
    return pathTo(lv, P.y[0], P.y[1]);
  })());
  assert('hub rooms: on a fresh save the dive, the tutorial ring and the empty rooms (nook, arena) are reachable; the boarded workshop, the rubble den and the kelp-curtained grotto are not',
    pathTo(fresh, fresh.exitX, fresh.exitY) && pathTo(fresh, fresh.tutorialX, fresh.tutorialY) && pathTo(fresh, roomOf(fresh, 'pip').ax, roomOf(fresh, 'pip').ay) && pathTo(fresh, roomOf(fresh, 'host').ax, roomOf(fresh, 'host').ay)
    && !pathTo(fresh, roomOf(fresh, 'marlo').ax, roomOf(fresh, 'marlo').ay) && !pathTo(fresh, roomOf(fresh, 'keeper').ax, roomOf(fresh, 'keeper').ay)
    && !pathTo(fresh, roomOf(fresh, 'quill').ax, roomOf(fresh, 'quill').ay, softWalls(fresh)) && softWalls(fresh).length > 0 && softWalls(full).length === 0);

  // --- people and furniture placement ---
  const solid = (lv, x, y) => lv.tiles[y * lv.w + x] !== 0;
  assert('hub rooms: every standing person\'s anchor is open water with a floor right under it (Pip swims)',
    full.village.filter((r) => r.room.npc && r.room.npc !== 'pip').every((r) => !solid(full, r.ax, r.ay) && !solid(full, r.ax, r.ay - 1) && solid(full, r.ax, r.ay + 1)));
  assert('hub rooms: Pip\'s anchor has open water about it to swim in', (() => { const r = roomOf(full, 'pip'); for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (solid(full, r.ax + dx, r.ay + dy)) return false; return true; })());
  let bad = '';
  for (const r of full.village) for (const f of r.room.furnish) {
    if (!f.sprite || f.dy !== Math.round(f.dy)) continue; // floor pieces only (whole-tile dy)
    const x = Math.floor(r.ax + 0.5 + f.dx), y = r.ay + f.dy;
    if (!solid(full, x, y) || solid(full, x, y - 1)) bad += ` ${r.id}:${f.sprite}`;
  }
  assert('hub rooms: every floor furnishing stands on a floor tile with water above' + bad, bad === '');
  assert('hub rooms: roomAt finds the workshop at Marlo\'s spot and nothing in the dive chamber', roomAt(full, roomOf(full, 'marlo').ax + 0.5, roomOf(full, 'marlo').ay + 0.5).id === 'workshop' && roomAt(full, full.exitX + 0.5, full.exitY - 1) === null);
  assert('hub rooms: plant keep-outs cover the furniture', Array.isArray(full.keepOut) && full.keepOut.length >= full.village.length);

  // --- the kelp curtain pushes back while the grotto is locked ---
  const g = fresh.village.find((r) => r.seal === SEAL_KELP);
  const o = { x: g.dx0 + 0.5, y: g.dy0 + 1.5, vx: -3, vy: 0 };
  const pushed = kelpPush(fresh, o);
  const away = { x: g.dx1 + 4, y: g.dy0 + 1.5, vx: -3, vy: 0 };
  const o2 = { x: g.dx0 + 0.5, y: g.dy0 + 1.5, vx: -3, vy: 0 };
  assert('hub rooms: the locked kelp curtain pushes the octopus back out (away from the room), not when it is away, and not once the room is open',
    pushed && Math.sign(o.vx) === Math.sign(g.ax < g.dx0 ? 1 : -1) && !kelpPush(fresh, away) && !kelpPush(build({ quill: 1 }), o2));
}
