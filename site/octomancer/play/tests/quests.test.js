// Round 22: quests (quests.js), shops (shop.js), the shell currency (run.js, pickups.js) and their
// journal persistence (journal.js + save.js).
import {
  parseQuests, planQuest, createQuestState, questOnKill, questOnHurt, questUpdate, questOnExit, questHudText, questSignText,
  Q_RESCUE, Q_VAULT, Q_UNTOUCHED, Q_PEST, ST_ACTIVE, ST_DONE, ST_FAILED,
} from '../js/quests.js';
import { parseShopItems, createShopState, shopStep, applyItem, canUse, BUY_R } from '../js/shop.js';
import { createRoomBank } from '../js/rooms.js';
import { generateLevel, setDefaultBank } from '../js/level.js';
import { createPathGrid, reachableNodes, reachedNear, findPath } from '../js/pathcheck.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createRun, runEvent, levelSpec, nextDiveSeed, EV_ENTER_DIVE, EV_EXIT, EV_DEATH } from '../js/run.js';
import { createJournal, ENTRIES, CATEGORIES, CATEGORY_TITLES } from '../js/journal.js';
import { getJournalIds, saveJournalIds, _resetForTests } from '../js/save.js';
import { createPickups } from '../js/pickups.js';
import { createOctopus } from '../js/octopus.js';
import { BOMB_MAX, HEART_MAX } from '../js/config.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

export async function runQuestTests(assert) {
  const table = parseQuests(await (await fetch('../data/quests.json')).json());
  // the carried-item rows (round 32) have their own tests (items.test.js): the stall tests below use the three consumables
  const items = parseShopItems(await (await fetch('../data/shop-items.json')).json()).filter((i) => i.effect !== 'carry');

  // ---- data ----
  assert('quests data: rescue, vault, untouched and pest control, each with a reward, hud text and journal id',
    ['rescue', 'vault', 'untouched', 'pest'].every((id) => table.byId.has(id)) &&
    table.rows.every((r) => r.reward > 0 && r.hud && r.name && r.done && ENTRIES.some((e) => e.id === r.journal)));
  assert('shop data: bomb (3), heart (5) and bomb pack x3 (8) in shop-items.json',
    (() => { const by = Object.fromEntries(items.map((i) => [i.id, i])); return by.bomb.price === 3 && by.bomb.amount === 1 && by.heart.price === 5 && by.bombpack.price === 8 && by.bombpack.amount === 3; })());
  let threw = false;
  try { parseShopItems({ items: [{ id: 'x', price: 0, effect: 'bombs' }] }); } catch (e) { threw = true; }
  assert('shop data: a malformed item is rejected', threw);
  assert('journal: quest category and every shop / quest entry exist', CATEGORIES.includes('quest') && CATEGORY_TITLES.quest === 'Quests' &&
    ['place-shop', 'item-heart', 'item-bombpack', 'quest-rescue', 'quest-vault', 'quest-untouched', 'quest-pest'].every((id) => ENTRIES.some((e) => e.id === id)));

  // ---- placement over generated levels ----
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);
  {
    const kinds = new Set();
    let n = 0, bad = [], same = 0;
    for (let i = 0; i < 300; i++) {
      const seed = 1 + (i % 7) * 977, idx = i % 3;
      const lv = generateLevel(seed, idx, bank);
      const a = planQuest(lv, table, seed, idx), b = planQuest(lv, table, seed, idx);
      n++;
      if (!a) { bad.push('null ' + i); continue; }
      kinds.add(a.id);
      if (a.id === b.id && a.pos.length === b.pos.length && a.pos.every((v, k) => v === b.pos[k])) same++;
      const grid = createPathGrid(lv.w, lv.h, (x, y) => lv.tiles[y * lv.w + x] !== 0);
      const reached = reachableNodes(grid, lv.startX + 0.5, lv.startY + 0.5);
      const route = findPath(grid, lv.startX + 0.5, lv.startY + 0.5, lv.exitX + 0.5, lv.exitY + 0.5);
      const inShop = (x, y) => !!lv.shop && x >= lv.shop.x0 && x < lv.shop.x1 && y >= lv.shop.y0 && y < lv.shop.y1;
      if (a.kindId === Q_RESCUE) {
        const [x, y] = [a.pos[0], a.pos[1]];
        let dr = 1e9; for (let k = 0; k < route.points.length; k += 2) dr = Math.min(dr, Math.hypot(route.points[k] - x, route.points[k + 1] - y));
        if (!reachedNear(grid, reached, x, y, 0.3) || dr < 1.5 || inShop(x, y) || lv.tiles[Math.floor(y) * lv.w + Math.floor(x)] !== 0) bad.push('rescue ' + i);
      } else if (a.kindId === Q_VAULT) {
        const px = lv.pockets[0], py = lv.pockets[1];
        if (!(lv.nPockets > 0) || a.pos[0] < px || a.pos[0] > px + 2 || a.pos[1] < py || a.pos[1] > py + 2) bad.push('vault ' + i);
      } else if (a.kindId === Q_PEST) {
        if (a.pos.length !== 6) bad.push('pest count ' + i);
        for (let k = 0; k < a.pos.length; k += 2) if (!reachedNear(grid, reached, a.pos[k], a.pos[k + 1], 0.3) || inShop(a.pos[k], a.pos[k + 1])) bad.push('pest ' + i);
      }
    }
    assert(`quests: every level rolls a quest, all four kinds appear (${[...kinds].join(', ')}), and it is deterministic (${same}/${n})`, bad.length === 0 && kinds.size === 4 && same === n);
    assert('quests: rescue critters sit in A*-reachable side spots, vault caches inside a pocket, pest piranhas on reachable water' + (bad.length ? ' [' + bad.slice(0, 4).join(', ') + ']' : ''), bad.length === 0);
  }

  {
    // the shop area stays calm: no enemy slot or swarm within 5 tiles of the shop room
    let checked = 0, bad = 0;
    const { buildLevelSpawns } = await import('../js/level-spawns.js');
    for (let i = 0; i < 300 && checked < 60; i++) {
      const lv = generateLevel(1 + i * 13, i % 3, bank);
      if (!lv.shop) continue;
      checked++;
      for (const s of buildLevelSpawns(lv, 1 + i * 13, i % 3).spawns) {
        if (s.type === 'shell') continue;
        if (s.x >= lv.shop.x0 - 4.5 && s.x < lv.shop.x1 + 4.5 && s.y >= lv.shop.y0 - 4.5 && s.y < lv.shop.y1 + 4.5) bad++;
      }
    }
    assert(`shop: no enemy slots or plankton swarms in or beside the shop room (${checked} shops checked)`, checked >= 30 && bad === 0);
  }

  // ---- runtime ----
  const stubWorld = { isSolid: () => false };
  const mk = (kindId, pos) => createQuestState({ qi: 0, kindId, id: 'q', name: 'Q', reward: 4, count: kindId === Q_PEST ? 3 : 1, hud: 'h', done: 'd', journal: 'quest-rescue', pos: pos || new Float32Array(0) });
  {
    const st = mk(Q_RESCUE, Float32Array.of(10.5, 10.5));
    const o = { x: 4, y: 4 };
    questUpdate(st, o, stubWorld);
    assert('quest rescue: the critter waits until touched and the exit does not complete it', !st.following && questOnExit(st) === false && st.status === ST_ACTIVE);
    o.x = 10; o.y = 10;
    questUpdate(st, o, stubWorld);
    assert('quest rescue: touching the critter makes it follow', st.following === true);
    for (let i = 0; i < 40; i++) { o.x = 10 - i * 0.1; o.y = 10; questUpdate(st, o, stubWorld); }
    const d = Math.hypot(st.cx - o.x, st.cy - o.y);
    assert(`quest rescue: it trails the octopus along its path, beside it and not inside it (${d.toFixed(2)} away)`, d > 0.6 && d < 4 && st.cx > o.x);
    assert('quest rescue: reaching the exit with the critter completes it once', questOnExit(st) === true && st.status === ST_DONE && questOnExit(st) === false && questHudText(st).includes('+4 shells'));
    const solidWorld = { isSolid: (x) => x < 0 };
    const st2 = mk(Q_RESCUE, Float32Array.of(1.5, 1.5)); st2.following = true; st2.cx = 1; st2.cy = 1;
    for (let i = 0; i < 30; i++) questUpdate(st2, { x: 1 - i * 0.05, y: 1 }, solidWorld);
    assert('quest rescue: the critter is never left inside rock', !solidWorld.isSolid(st2.cx, st2.cy));
  }
  {
    const st = mk(Q_VAULT, Float32Array.of(20.5, 20.55));
    assert('quest vault: far from the cache nothing happens, touching it completes the quest', questUpdate(st, { x: 15, y: 20 }, stubWorld) === false && questUpdate(st, { x: 20.2, y: 20.6 }, stubWorld) === true && st.status === ST_DONE && st.collected);
    assert('quest vault: completing it twice is impossible', questUpdate(st, { x: 20.2, y: 20.6 }, stubWorld) === false);
  }
  {
    const st = mk(Q_UNTOUCHED);
    assert('quest untouched: the exit completes it', questOnExit(st) === true && st.status === ST_DONE);
    const st2 = mk(Q_UNTOUCHED); questOnHurt(st2);
    assert('quest untouched: losing a heart fails it and the exit no longer completes it', st2.status === ST_FAILED && questOnExit(st2) === false && questHudText(st2).startsWith('Quest failed'));
    const st3 = mk(Q_RESCUE, Float32Array.of(1, 1)); questOnHurt(st3);
    assert('quest untouched: other quests ignore hurt', st3.status === ST_ACTIVE);
  }
  {
    const st = mk(Q_PEST);
    assert('quest pest: only piranha kills count', questOnKill(st, 'crab') === false && st.progress === 0);
    questOnKill(st, 'piranha'); questOnKill(st, 'piranha');
    assert('quest pest: progress shows in the HUD line', questHudText(st).includes('2/3'));
    assert('quest pest: the third piranha completes it, then nothing more counts', questOnKill(st, 'piranha') === true && st.status === ST_DONE && questOnKill(st, 'piranha') === false && st.progress === 3);
  }
  assert('quest sign text names the quest, what to do and the reward', (() => {
    const t = questSignText({ name: 'Untouched', hud: 'Reach the exit without losing a heart', reward: 3 });
    return t.includes('Untouched') && t.includes('Reach the exit') && t.includes('3 shells');
  })());

  // ---- the hub sign previews the quest 1-1 will roll ----
  {
    let match = 0;
    const N = 12;
    for (let seed = 1; seed <= N; seed++) {
      const run = createRun(seed, { tutorialDone: true });
      const ns = nextDiveSeed(run);
      const preview = planQuest(generateLevel(ns, 0), table, ns, 0);
      runEvent(run, EV_ENTER_DIVE);
      const spec = levelSpec(run);
      const w = createLevelWorld(spec.seed, spec.levelIndex);
      const real = planQuest(w.level, table, spec.seed, spec.levelIndex);
      if (spec.seed === ns && preview && real && preview.id === real.id && preview.pos.every((v, k) => v === real.pos[k])) match++;
    }
    assert(`quest sign: the hub previews exactly the quest Shallows 1-1 rolls (${match}/${N} seeds)`, match === N);
  }

  // ---- shop ----
  {
    const shop = { kx: 10, ky: 8, px: Int16Array.of(6, 11, 10, 11, 14, 11) };
    const st = createShopState(shop, items, 1, 0);
    assert('shop: three pedestals stocked from shop-items.json (bomb, heart, bomb pack), prices 3 / 5 / 8', st.stock.length === 3 && Array.from(st.stock, (i) => items[i].id).join() === 'bomb,heart,bombpack' && Array.from(st.stock, (i) => items[i].price).join() === '3,5,8');
    const o = createOctopus(0, 0);
    o.bombs = 1; o.hearts = 2;
    // pedestal 0 = bomb (3), centre (6.5, 11.5)
    o.x = 6.5; o.y = 11.5;
    let ev = shopStep(st, o, 2, 0.02);
    assert('shop: with too few shells nothing is bought and nothing is charged', ev.type === 'poor' && ev.shells === 2 && o.bombs === 1 && st.sold[0] === 0);
    assert('shop: the "not enough shells" message does not repeat every step', shopStep(st, o, 2, 0.02) === null);
    ev = shopStep(st, o, 3, 2);
    assert('shop: with enough shells the bomb is bought: +1 bomb, 3 shells deducted', ev.type === 'bought' && ev.item.id === 'bomb' && ev.shells === 0 && o.bombs === 2 && st.sold[0] === 1);
    assert('shop: a sold pedestal does nothing more', shopStep(st, o, 9, 2) === null && o.bombs === 2);
    o.x = 10.5; o.y = 11.5;
    ev = shopStep(st, o, 12, 2);
    assert('shop: the heart restores one heart (5 shells), up to the max', ev.type === 'bought' && ev.item.id === 'heart' && o.hearts === 3 && ev.shells === 7);
    const st2 = createShopState(shop, items, 1, 0);
    const o2 = createOctopus(0, 0);
    o2.x = 10.5; o2.y = 11.5;
    ev = shopStep(st2, o2, 50, 2);
    assert('shop: full hearts refuses the heart and charges nothing', ev.type === 'full' && st2.sold[1] === 0 && o2.hearts === HEART_MAX);
    o2.x = 14.5; o2.y = 11.5; o2.bombs = 1;
    ev = shopStep(st2, o2, 8, 2);
    assert('shop: the bomb pack gives +3 bombs (8 shells) and never passes the maximum', ev.type === 'bought' && o2.bombs === 4 && ev.shells === 0);
    const o3 = createOctopus(0, 0); o3.bombs = 4;
    applyItem(items.find((i) => i.id === 'bombpack'), o3);
    assert('shop: applyItem caps bombs at BOMB_MAX', o3.bombs === BOMB_MAX && !canUse(items[0], o3));
    o2.x = 0; o2.y = 0;
    assert('shop: away from the pedestals nothing happens', shopStep(st2, o2, 99, 1) === null);
    assert('shop: buying needs swimming onto the pedestal (radius ' + BUY_R + ')', (() => {
      const s3 = createShopState(shop, items, 1, 0), o4 = createOctopus(0, 0); o4.bombs = 0;
      o4.x = 6.5 + BUY_R + 0.1; o4.y = 11.5;
      const far = shopStep(s3, o4, 9, 2);
      o4.x = 6.5 + BUY_R - 0.1;
      const near = shopStep(s3, o4, 9, 2);
      return far === null && near && near.type === 'bought';
    })());
  }
  {
    // with a bigger table only three rows are stocked, picked from the seed
    const many = parseShopItems({ items: [1, 2, 3, 4, 5].map((n) => ({ id: 'i' + n, name: 'I' + n, price: n, effect: 'bombs' })) });
    const st = createShopState({ kx: 1, ky: 1, px: new Int16Array(6) }, many, 5, 1);
    assert('shop: a table with more items stocks three distinct rows', new Set(st.stock).size === 3);
    assert('shop: a level without a shop has no shop state', createShopState(null, items, 1, 0) === null);
  }

  // ---- shells: the run wallet and kill drops ----
  {
    const run = createRun(3, { tutorialDone: true });
    assert('shells: the run starts with 0 shells', run.shells === 0);
    runEvent(run, EV_ENTER_DIVE);
    run.shells = 9;
    runEvent(run, EV_EXIT);
    assert('shells: they carry from one Shallows level to the next', run.shells === 9);
    runEvent(run, EV_DEATH);
    assert('shells: a death returns to the hub and spends the wallet', run.shells === 0);
    run.shells = 4; runEvent(run, EV_ENTER_DIVE);
    assert('shells: a new dive starts with an empty wallet', run.shells === 0);
  }
  {
    const w = createLevelWorld(5, 0);
    const p = createPickups();
    const o = createOctopus(w.startX, w.startY);
    p.update(0.02, 0, o, w.residentChunks(), w);
    const before = p.visible(w.residentChunks()).filter((it) => it.type === 'shell').length;
    const ok = p.dropShell(w.startX + 3, w.startY);
    const after = p.visible(w.residentChunks()).filter((it) => it.type === 'shell').length;
    o.x = w.startX + 3; o.y = w.startY;
    let gotEvent = false;
    for (let i = 0; i < 25; i++) { p.update(0.02, 0.02 * (i + 1), o, w.residentChunks(), w); if (p.events.some((e) => e.type === 'shell')) gotEvent = true; }   // a dropped shell waits 0.35 s before it can be collected
    assert('shells: a drop from a defeated creature appears as a shell pickup and is collected on touch',
      ok && after === before + 1 && gotEvent && p.totals.shells >= 1);
    assert('shells: levels seed shells inside their sealed pockets (2 per pocket)', (() => {
      let pockets = 0, shells = 0;
      for (let i = 0; i < 20; i++) {
        const lw = createLevelWorld(1 + i, 0);
        const lp = createPickups();
        lp.update(0.02, 0, createOctopus(lw.startX, lw.startY), lw.residentChunks(), lw);
        const list = lp.visible(lw.residentChunks()).filter((it) => it.type === 'shell');
        for (let k = 0; k < lw.level.nPockets; k++) {
          pockets++;
          const px = lw.level.pockets[k * 3], py = lw.level.pockets[k * 3 + 1];
          shells += list.filter((s) => s.x >= px && s.x <= px + 2 && s.y >= py && s.y <= py + 2).length;
        }
      }
      return pockets > 0 && shells === pockets * 2;
    })());
  }

  // ---- persistence: quest and shop discoveries live in the journal ----
  {
    const mem = new Map();
    const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    let stubbed = false;
    try { Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true }); stubbed = true; } catch (e) { /* engine refuses */ }
    if (stubbed) {
      _resetForTests();
      const j = createJournal({ load: getJournalIds, save: saveJournalIds });
      assert('quest journal: nothing found at first', !j.has('quest-vault') && !j.has('place-shop'));
      j.discover('quest-vault'); j.discover('place-shop'); j.discover('item-heart');
      _resetForTests();
      const j2 = createJournal({ load: getJournalIds, save: saveJournalIds });
      assert('quest journal: a completed quest, the shop and a bought item survive a reload', j2.has('quest-vault') && j2.has('place-shop') && j2.has('item-heart') && !j2.has('quest-pest'));
      const questRows = j2.list('quest');
      assert('quest journal: the quest category lists all four quests, one found', questRows.length === 4 && questRows.filter((e) => e.found).length === 1);
      _resetForTests();
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
      _resetForTests();
    } else {
      assert('quest journal: persistence (skipped: localStorage cannot be stubbed here)', true);
    }
  }
}
