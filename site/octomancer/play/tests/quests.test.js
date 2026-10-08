// Round 22: quests (quests.js), shops (shop.js), the shell currency (run.js, pickups.js) and their
// journal persistence (journal.js + save.js).
import {
  parseQuests, planQuest, questPathFor, createQuestState, questUpdate, questOnExit, questBlast, questSpeaker, eligibleRows, nextStage, hubResidents, hubVisit, collectorArrives,
  RELICS_NEEDED, DIVER_RUNS, Q_RESCUE, Q_VAULT, ST_ACTIVE, ST_DONE,
  Q_MEET, questReact,
} from '../js/quests.js';
import { pickOutcome, beatSeed, owedFrom, findFloorNear, createVisitor, visitorStep, DUE_REST } from '../js/visitors.js';
import { createIdle, idleStep, idleReact, idleLift } from '../js/idle.js';
import { createPeople } from '../js/people.js';
import { NPC_PIP, NPC_MARLO } from '../js/npcs.js';
import { createTalk, say, talking, talkStep, talkAlpha, lineDuration, wrapLines } from '../js/speech.js';
import { parseShopItems, createShopState, shopStep, applyItem, canUse, BUY_R } from '../js/shop.js';
import { createRoomBank } from '../js/rooms.js';
import { generateLevel, setDefaultBank } from '../js/level.js';
import { createPathGrid, reachableNodes, reachedNear, findPath } from '../js/pathcheck.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createRun, runEvent, levelSpec, nextDiveSeed, EV_ENTER_DIVE, EV_EXIT, EV_DEATH } from '../js/run.js';
import { createJournal, ENTRIES, CATEGORIES, CATEGORY_TITLES } from '../js/journal.js';
import { getJournalIds, saveJournalIds, getStory, setStory, addStory, _resetForTests } from '../js/save.js';
import { createPickups } from '../js/pickups.js';
import { createOctopus } from '../js/octopus.js';
import { BOMB_MAX, HEART_MAX } from '../js/config.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

export async function runQuestTests(assert) {
  const table = parseQuests(await (await fetch('../data/quests.json')).json());
  // the carried-item rows (round 32) have their own tests (items.test.js): the stall tests below use the three consumables
  const items = parseShopItems(await (await fetch('../data/shop-items.json')).json()).filter((i) => i.effect !== 'carry');

  // ---- data: named people, chained encounters ----
  assert('questlines data: Marlo, Pip and Quill, each with a People entry, hub lines and a thank-you for every stage they reach',
    ['marlo', 'pip', 'quill'].every((id) => table.npcById.has(id)) && table.npcs.every((n) => n.name && n.title && ENTRIES.some((e) => e.id === n.journal && e.cat === 'person') &&
      Object.keys(n.hub).every((st) => n.thanks[st] && n.hub[st].length > 0)) &&
    ['1', '2', '3'].every((st) => table.npcById.get('marlo').hub[st]) && table.npcById.get('pip').hub['1'] && table.npcById.get('quill').hub['2'] && table.npcById.get('quill').relics.length === RELICS_NEEDED);
  const row = (id) => table.rows.find((r) => r.id === id);
  assert('questlines data (r3): four level encounters (Marlo vault, Pip cage, Pip and Quill met in a side cave), each a spoken scene (meet, ask, help, thank) with at least three outcomes',
    table.rows.map((r) => r.id).sort().join() === 'marlo-1,pip-1,pip-2,quill-dig' && table.rows.every((r) => r.done && r.levels.length >= 1 && r.chance > 0 && r.chance < 1 && ['meet', 'ask', 'help', 'thank'].every((k) => r.lines[k] && r.lines[k].length > 8) && r.outcomes.length >= 3) &&
    row('pip-2').kind === 'meet' && row('quill-dig').kind === 'meet' && row('quill-dig').stage === false && row('marlo-1').stage === true);
  assert('questlines data (r3): rewards vary: every encounter can pay now, pay later in the dive and say nothing ("just vibing" or later only); Marlo and Pip also leave a gift in the hub',
    table.rows.every((r) => r.outcomes.some((o) => o.now) && r.outcomes.some((o) => o.later) && r.outcomes.some((o) => !o.now)) &&
    row('marlo-1').outcomes.some((o) => o.giftId > 0) && row('pip-1').outcomes.some((o) => o.giftId > 0) &&
    row('pip-1').outcomes.find((o) => o.id === 'follow').now.shells === 8 && row('pip-1').outcomes.some((o) => o.role === 'stay'));
  assert('questlines data (r3): the host has his own outcomes for a won wager (tip, owed, vibe, gift) and hub lines; every npc has chat and react lines',
    table.npcById.get('host').outcomes.map((o) => o.id).join() === 'tip,owed,vibe,gift' && table.npcById.get('host').hub['1'].length > 0 &&
    table.npcs.every((n) => n.chat.length >= 2 && n.react.length >= 2) && table.gifts.length === 3 && table.gifts.every((g) => g.lines.length && Object.keys(g.boon).length));
  assert('questlines data: Marlo is met on 1-1 or 1-2 and can be freed in three runs (stages 0..2 each go one up), Pip once in a cage then out exploring; the Pool has no level row',
    row('marlo-1').kind === 'vault' && row('marlo-1').levels.join() === '0,1' && row('marlo-1').need === 0 && row('marlo-1').max === DIVER_RUNS - 1 &&
    row('pip-1').kind === 'rescue' && row('pip-1').max === 0 && row('pip-2').need === 1 && row('pip-2').max === 1 && !table.rows.some((r) => r.npc === 'host'));
  assert('questlines data: no HUD text anywhere', table.rows.every((r) => !r.hud));
  assert('questlines: a person only appears while their stage is in the row\'s range, on the listed levels; Marlo three runs, Pip in a cage once, Quill on digs once he lives in the hub',
    eligibleRows(table, {}, 1).map((r) => r.id).sort().join() === 'marlo-1,pip-1' && eligibleRows(table, {}, 0).map((r) => r.id).sort().join() === 'marlo-1,pip-1' && eligibleRows(table, {}, 2).map((r) => r.id).join() === 'pip-1' &&
    eligibleRows(table, { marlo: 2, pip: 1 }, 1).map((r) => r.id).sort().join() === 'marlo-1,pip-2' && eligibleRows(table, { marlo: 3, pip: 2, quill: 1 }, 1).map((r) => r.id).join() === 'quill-dig' && eligibleRows(table, { marlo: 3, pip: 2, quill: 0 }, 1).length === 0);
  assert('questlines: the stage goes up by one per finished encounter and stops after the last (Marlo 0 -> 1 -> 2 -> 3, Pip 0 -> 1), never back',
    (() => { const r = table.rows.find((x) => x.id === 'marlo-1'), q = table.rows.find((x) => x.id === 'pip-1'); return nextStage(0, r) === 1 && nextStage(1, r) === 2 && nextStage(2, r) === 3 && nextStage(3, r) === 3 && nextStage(0, q) === 1 && nextStage(1, q) === 1; })());
  let threw = false;
  try { parseQuests({ npcs: [], quests: [{ id: 'x', npc: 'nobody', kind: 'meet' }] }); } catch (e) { threw = true; }
  assert('questlines data: a row with an unknown person is rejected', threw);
  assert('shop data: bomb (3), heart (5) and bomb pack x3 (8) in shop-items.json',
    (() => { const by = Object.fromEntries(items.map((i) => [i.id, i])); return by.bomb.price === 3 && by.bomb.amount === 1 && by.heart.price === 5 && by.bombpack.price === 8 && by.bombpack.amount === 3; })());
  threw = false;
  try { parseShopItems({ items: [{ id: 'x', price: 0, effect: 'bombs' }] }); } catch (e) { threw = true; }
  assert('shop data: a malformed item is rejected', threw);
  assert('journal: the People category and every shop / questline entry exist', CATEGORIES.includes('person') && CATEGORY_TITLES.person === 'People' &&
    ['place-shop', 'item-heart', 'item-bombpack', 'person-critter', 'person-diver', 'person-keeper', 'person-collector'].every((id) => ENTRIES.some((e) => e.id === id)));

  // ---- placement over generated levels ----
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);
  {
    const { buildLevelSpawns } = await import('../js/level-spawns.js');
    const stories = [{}, { marlo: 1, pip: 1, quill: 1 }, { marlo: 2 }];
    const kinds = new Set();
    let n = 0, planned = 0, eligible = 0; const bad = [];
    let same = 0;
    for (let i = 0; i < 360; i++) {
      const seed = 1 + (i % 9) * 977 + i, idx = i % 3, story = stories[i % 3];
      const lv = generateLevel(seed, idx, bank);
      const avoid = []; for (const s of buildLevelSpawns(lv, seed, idx).spawns) if (s.type !== 'shell' && (s.type !== 'decor' || s.dk === 'boulder')) avoid.push(s.x, s.y);
      const a = planQuest(lv, table, seed, idx, story, avoid), b = planQuest(lv, table, seed, idx, story, avoid);
      if (i < 60) { // vibe fixes: the worker's precomputed path data (gen-worker.js level.questPath) plans the same; a copy for other tiles is ignored
        const withPath = { ...lv, questPath: questPathFor(lv) }, stale = { ...lv, questPath: { ...questPathFor(lv), sum: 1, reached: new Uint8Array(1) } };
        const c = planQuest(withPath, table, seed, idx, story, avoid), d = planQuest(stale, table, seed, idx, story, avoid);
        const eq = (p, q) => (!p && !q) || (p && q && p.id === q.id && p.pos[0] === q.pos[0] && p.pos[1] === q.pos[1]);
        if (!eq(a, c) || !eq(a, d)) bad.push('questPath ' + i);
      }
      n++;
      if (eligibleRows(table, story, idx).length) eligible++;
      if (!a) { if (b) bad.push('flaky ' + i); continue; }
      planned++;
      kinds.add(a.id);
      if (b && a.id === b.id && a.pos.length === b.pos.length && a.pos.every((v, k) => v === b.pos[k])) same++;
      if (!eligibleRows(table, story, idx).some((r) => r.id === a.id)) bad.push('ineligible ' + i);
      const grid = createPathGrid(lv.w, lv.h, (x, y) => lv.tiles[y * lv.w + x] !== 0);
      const reached = reachableNodes(grid, lv.startX + 0.5, lv.startY + 0.5);
      const route = findPath(grid, lv.startX + 0.5, lv.startY + 0.5, lv.exitX + 0.5, lv.exitY + 0.5);
      const inShop = (x, y) => !!lv.shop && x >= lv.shop.x0 && x < lv.shop.x1 && y >= lv.shop.y0 && y < lv.shop.y1;
      const T = (x, y) => lv.tiles[y * lv.w + x] !== 0;
      if (a.kindId === Q_VAULT) {
        const px = lv.pockets[0], py = lv.pockets[1];
        if (!(lv.nPockets > 0) || a.pos[0] < px || a.pos[0] > px + 2 || a.pos[1] < py || a.pos[1] > py + 2) bad.push('vault ' + i);
      } else {
        const [x, y] = [a.pos[0], a.pos[1]];
        const tx = Math.floor(x), fy = a.floorY;
        let dr = 1e9; for (let k = 0; k < route.points.length; k += 2) dr = Math.min(dr, Math.hypot(route.points[k] - x, route.points[k + 1] - y));
        let near = false; for (let k = 0; k < avoid.length; k += 2) if (Math.hypot(avoid[k] - x, avoid[k + 1] - y) < 2.3) near = true;
        let inSet = false; for (let k = 0; k < lv.nSetPieces; k++) if (x >= lv.setPieces[k * 4] - 1 && x <= lv.setPieces[k * 4] + 10 && y >= lv.setPieces[k * 4 + 1] - 1 && y <= lv.setPieces[k * 4 + 1] + 16) inSet = true;
        // the cage rests on a floor: rock under the tile and both neighbours, the body centre is open water
        const onFloor = Number.isInteger(fy) && T(tx, fy) && T(tx - 1, fy) && T(tx + 1, fy) && !T(tx, fy - 1) && !T(Math.floor(x), Math.floor(y));
        if (!reachedNear(grid, reached, x, fy - 0.5, 0.3) || dr < 1.5 || inShop(x, y) || inSet || near || !onFloor) bad.push(a.id + ' ' + i + (inSet ? ' set' : '') + (near ? ' near' : '') + (onFloor ? '' : ' float'));
      }
    }
    assert(`questlines: every planned encounter is feasible and deterministic (${planned}/${eligible} eligible levels planned, ${same}/${planned} identical on a replan), every questline appears (${[...kinds].join(', ')})` + (bad.length ? ' [' + bad.slice(0, 5).join(', ') + ']' : ''),
      bad.length === 0 && same === planned && kinds.size >= 2 && planned >= eligible * 0.3);
    assert('questlines: cages and people rest on a floor (never hang in open water), keep out of set-piece rooms and the shop, and clear of other spawns', bad.length === 0);
    // a level whose story has nobody eligible never gets an encounter
    let leaked = 0;
    for (let i = 0; i < 40; i++) if (planQuest(generateLevel(7 + i, i % 3, bank), table, 7 + i, i % 3, { marlo: 3, pip: 2, quill: 0 })) leaked++;
    assert('questlines: with Marlo freed three times, Pip out exploring and Quill not yet in the hub, no level holds an encounter', leaked === 0);
    // the first dives meet somebody on most levels, later stages less often
    let first = 0; for (let i = 0; i < 120; i++) if (planQuest(generateLevel(3 + i * 5, 1, bank), table, 3 + i * 5, 1, {})) first++;
    assert(`questlines: Shallows 1-2 holds an encounter on a good share of fresh saves (${first}/120)`, first >= 25 && first <= 110);
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
        if (s.type === 'shell' || s.set) continue; // r37: a set piece next to the shop room keeps its jets, chest and wreck (scenery and static hazards; its enemies still keep the calm)
        if (s.x >= lv.shop.x0 - 4.5 && s.x < lv.shop.x1 + 4.5 && s.y >= lv.shop.y0 - 4.5 && s.y < lv.shop.y1 + 4.5) bad++;
      }
    }
    assert(`shop: no enemy slots or plankton swarms in or beside the shop room (${checked} shops checked)`, checked >= 30 && bad === 0);
  }

  // ---- speech ----
  {
    const t = createTalk();
    say(t, ['Hello there', '', 'Second line']);
    assert('speech: empty lines are skipped, the first line shows on the first step', talking(t) && t.q.length === 2 - 0 && (talkStep(t, 0.02), t.text === 'Hello there' && t.q.length === 1));
    assert('speech: a line fades in, holds and fades out', talkAlpha(t) === 0 && (talkStep(t, 0.05), talkAlpha(t) > 0 && talkAlpha(t) < 1) && (talkStep(t, 0.5), talkAlpha(t) === 1) && (talkStep(t, lineDuration('Hello there') - 0.6), talkAlpha(t) < 1));
    talkStep(t, 1);
    assert('speech: the next line follows the first, then it is quiet', t.text === 'Second line' && (talkStep(t, 10), talkStep(t, 0.02), !talking(t) && t.text === ''));
    assert('speech: longer lines stay up longer (capped), wrapLines breaks at spaces', lineDuration('Hi') < lineDuration('I collect golden relics. Bring me three, and I shall make it worth your while.') && lineDuration('x'.repeat(400)) <= 5.5 &&
      wrapLines('Blow this wall open, would you please', 14).every((r) => r.length <= 14) && wrapLines('Blow this wall open, would you please', 14).join(' ') === 'Blow this wall open, would you please');
  }

  // ---- runtime ----
  const stubWorld = { isSolid: () => false };
  const L = { meet: 'Hello, a visitor', ask: 'Could you help me out', help: 'Thank you so much', thank: 'See you at the hub' };
  const mk = (kindId, pos, extra = {}) => createQuestState({ qi: 0, kindId, id: 'q', npc: 'pip', name: 'Q', reward: 4, count: 1, need: 0, max: 0, lines: L, done: 'd', journal: 'person-critter', variant: '', floorY: pos ? pos[1] + 0.55 : 0, pos: pos || new Float32Array(0), ...extra });
  const run = (st, o, secs, w = stubWorld) => { for (let i = 0; i < secs * 50; i++) questUpdate(st, o, w, 0.02); };
  {
    const st = mk(Q_RESCUE, Float32Array.of(10.5, 10.5));
    const o = { x: 25, y: 10, vx: 0, vy: 0 };
    questUpdate(st, o, stubWorld);
    assert('quest rescue: nobody speaks while you are far away', !st.met && !st.talk.text);
    o.x = 5; o.y = 5;
    questUpdate(st, o, stubWorld);
    assert('quest rescue: the cage is shut and the exit does not complete it', !st.following && questOnExit(st) === false && st.status === ST_ACTIVE);
    assert('quest rescue: coming near (about 8 tiles) it speaks: first the meeting line, then the ask', st.met && st.talk.text === L.meet && st.talk.q[0] === L.ask);
    run(st, o, 3);
    assert('quest rescue: the ask follows the meeting line', st.talk.text === L.ask);
    o.x = 10; o.y = 10;
    questUpdate(st, o, stubWorld);
    assert('quest rescue: swimming against the cage does nothing (it has to be broken)', st.following === false && st.brokenBy === '');
    o.vx = 3; questUpdate(st, o, stubWorld);
    assert('quest rescue: a slow bump does not break it either', st.following === false);
    o.vx = 12; o.x = 11.3; questUpdate(st, o, stubWorld);
    assert('quest rescue: a dash into the cage frees it and it follows; it answers with help, then thank', st.following === true && st.brokenBy === 'dash' && st.talk.text === L.help && st.talk.q[0] === L.thank);
    o.vx = 0;
    for (let i = 0; i < 40; i++) { o.x = 10 - i * 0.1; o.y = 10; questUpdate(st, o, stubWorld); }
    const d = Math.hypot(st.cx - o.x, st.cy - o.y);
    assert(`quest rescue: it trails the octopus along its path, beside it and not inside it (${d.toFixed(2)} away)`, d > 0.6 && d < 4 && st.cx > o.x);
    assert('quest rescue: reaching the exit with the critter completes it once', questOnExit(st) === true && st.status === ST_DONE && questOnExit(st) === false);
    const solidWorld = { isSolid: (x) => x < 0 };
    const st2 = mk(Q_RESCUE, Float32Array.of(1.5, 1.5)); st2.following = true; st2.cx = 1; st2.cy = 1;
    for (let i = 0; i < 30; i++) questUpdate(st2, { x: 1 - i * 0.05, y: 1 }, solidWorld);
    assert('quest rescue: the critter is never left inside rock', !solidWorld.isSolid(st2.cx, st2.cy));
    // asking again: lingering beside the cage repeats the ask after a while, but only once the bubble is quiet
    const st3 = mk(Q_RESCUE, Float32Array.of(30.5, 30.5));
    const o3 = { x: 29, y: 30 };
    run(st3, o3, 30);
    assert('quest rescue: a player who lingers beside the cage hears the ask again', st3.lastAsk > 5);
    // a bomb
    const st4 = mk(Q_RESCUE, Float32Array.of(20.5, 20.5));
    assert('quest rescue: a bomb far away leaves the cage alone', questBlast(st4, 30, 20, 2) === false && !st4.following);
    assert('quest rescue: a bomb beside the cage breaks it (help, thank) and a second blast does nothing', questBlast(st4, 21.5, 21, 2) === true && st4.following && st4.brokenBy === 'bomb' && st4.talk.text === L.help && questBlast(st4, 21.5, 21, 2) === false);
    assert('quest rescue: a blast never touches a vault or a missing scene', questBlast(mk(Q_VAULT, Float32Array.of(5, 5)), 5, 5, 3) === false && questBlast(null, 5, 5, 3) === false);
  }
  {
    const st = mk(Q_VAULT, Float32Array.of(20.5, 20.55), { npc: 'marlo' });
    assert('quest vault: far from the cache nothing happens, near him he calls out (meet, ask) through the rock', questUpdate(st, { x: 15, y: 20 }, stubWorld) === false && st.talk.text === L.meet && st.status === ST_ACTIVE);
    assert('quest vault: touching the cache completes the quest and he says help, then thank', questUpdate(st, { x: 20.2, y: 20.6 }, stubWorld) === true && st.status === ST_DONE && st.collected && st.talk.text === L.help && st.talk.q[0] === L.thank);
    assert('quest vault: completing it twice is impossible', questUpdate(st, { x: 20.2, y: 20.6 }, stubWorld) === false);
    // r40: freed when the pocket is open and the octopus is within about 2 tiles (not only at touch range); a sealed pocket never frees him
    const wall = { isSolid: (x) => x >= 22 && x < 23 };
    const sa = mk(Q_VAULT, Float32Array.of(20.5, 20.55), { npc: 'marlo' });
    assert('quest vault (r40): a sealed pocket (rock between) does not free him even 1.8 tiles away', questUpdate(sa, { x: 22.3, y: 20.5 }, wall) === false && !sa.collected);
    const sb = mk(Q_VAULT, Float32Array.of(20.5, 20.55), { npc: 'marlo' });
    assert('quest vault (r40): beyond about 2 tiles he stays', questUpdate(sb, { x: 22.8, y: 20.5 }, stubWorld) === false && !sb.collected);
    assert('quest vault (r40): open pocket, octopus 1.8 tiles away: freed', questUpdate(sb, { x: 22.3, y: 20.5 }, stubWorld) === true && sb.collected);
    const floor = { isSolid: (x, y) => y >= 24 };
    for (let i = 0; i < 100; i++) questUpdate(sb, { x: 22.3, y: 20.5 }, floor);
    assert('quest vault (r3): after freeing he swims up beside the octopus, not onto it', Math.abs(sb.cx - 22.3) > 0.3 && Math.abs(sb.cx - 22.3) < 1.2 && sb.cy < 20.5);
    for (let i = 0; i < 700; i++) questUpdate(sb, { x: 25, y: 20.5 }, floor);
    assert('quest vault (r3): then he sinks to the floor and stays (never fades: 16 s on he is settled, feet on the rock, still done, facing the octopus)', sb.settled && Math.abs(sb.cy + 0.22 - 24) < 0.1 && sb.status === ST_DONE && sb.idle.face === 1);
  }

  // ---- the hub residents ----
  {
    const story = { marlo: 1, pip: 1, quill: 0, relics: 1, relicsGiven: 0 };
    assert('hub: only people who have been met stand there (stage >= 1), in table order', hubResidents(table, story).map((r) => r.id + r.stage).join() === 'marlo1,pip1');
    assert('hub: Quill moves in after the first dive (and only once)', collectorArrives({ quill: 0 }, 0) === '' && collectorArrives({ quill: 0 }, 1) === 'quill' && collectorArrives({ quill: 1 }, 5) === '');
    const first = hubVisit(table, { marlo: 1, saidMarlo: 0, relicsGiven: 0 }, 'marlo', 0);
    const marlo = table.npcById.get('marlo');
    assert('hub: the first visit after a stage change says the thank-you, then the whole stage, and notes it was said', first.lines[0] === marlo.thanks[1] && first.lines.length === 1 + marlo.hub[1].length && first.set.some(([k, v]) => k === 'saidMarlo' && v === 1) && first.discover.includes('person-diver'));
    const later = hubVisit(table, { marlo: 1, saidMarlo: 1 }, 'marlo', 1), later4 = hubVisit(table, { marlo: 1, saidMarlo: 1 }, 'marlo', 3);
    assert('hub: later visits say one line at a time, rotating, and set nothing', later.lines.length === 1 && later.lines[0] === marlo.hub[1][1] && later4.lines[0] === marlo.hub[1][1] && later.set.length === 0);
    assert('hub: Marlo at stage 3 talks about the ring in the floor', hubVisit(table, { marlo: 3, saidMarlo: 2 }, 'marlo', 0).lines.some((l) => /ring/.test(l)));
    const q0 = hubVisit(table, { quill: 1, saidQuill: 1, relics: 0, relicsGiven: 2 }, 'quill', 1);
    assert('hub: Quill counts the relics handed over: "{n} of 3 so far. {left} to go."', q0.lines.length === 1 && q0.lines[0] === '2 of 3 so far. 1 to go.' && RELICS_NEEDED === 3);
    const r1 = hubVisit(table, { quill: 1, saidQuill: 1, relics: 1, relicsGiven: 0 }, 'quill', 3);
    assert('hub: a relic in hand is handed over at once: his line, the counter, and the first shelf entry unlocks', r1.lines.length === 1 && r1.lines[0] === table.npcById.get('quill').relics[0] && r1.set.some(([k, v]) => k === 'relicsGiven' && v === 1) && r1.discover.includes('loot-relic-1') && !r1.set.some(([k]) => k === 'quill'));
    const r3 = hubVisit(table, { quill: 1, saidQuill: 1, relics: 3, relicsGiven: 2 }, 'quill', 0);
    assert('hub: the third relic unlocks the third entry and moves Quill to stage 2 (the lantern)', r3.set.some(([k, v]) => k === 'relicsGiven' && v === 3) && r3.set.some(([k, v]) => k === 'quill' && v === 2) && r3.discover.includes('loot-relic-3'));
    assert('hub: relics are handed over one per visit, never past three', hubVisit(table, { quill: 2, saidQuill: 2, relics: 5, relicsGiven: 3 }, 'quill', 0).set.every(([k]) => k !== 'relicsGiven'));
    assert('journal: every relic the Collector takes has its own entry', [1, 2, 3].every((n) => ENTRIES.some((e) => e.id === 'loot-relic-' + n)));
  }

  // ---- owners round 3 (quests rework): people stay, thank you, pay now or later ----
  {
    // seeded outcomes: the same seed gives the same outcome, over many seeds every outcome comes up, roughly by weight
    const outs = table.rows.find((r) => r.id === 'marlo-1').outcomes;
    const seen = {};
    for (let s = 0; s < 400; s++) { const o = pickOutcome(outs, beatSeed(s, 1, 'marlo')); seen[o.id] = (seen[o.id] || 0) + 1; }
    assert(`r3 outcomes: seeded and varied (${JSON.stringify(seen)}): every Marlo outcome comes up, the common ones more often`,
      pickOutcome(outs, 12345).id === pickOutcome(outs, 12345).id && outs.every((o) => seen[o.id] > 10) && seen.shells > seen.gift && pickOutcome([], 1) === null);
    // a planned encounter carries its outcome (deterministic per level seed)
    const lvl = generateLevel(77, 0);
    const p1 = planQuest(lvl, { ...table, rows: [{ ...table.rows.find((r) => r.id === 'pip-1'), chance: 1 }] }, 77, 0, {}), p2 = planQuest(lvl, { ...table, rows: [{ ...table.rows.find((r) => r.id === 'pip-1'), chance: 1 }] }, 77, 0, {});
    assert('r3 outcomes: planQuest picks the outcome with the level (the same twice) and its role', !!p1 && p1.outcome && p1.outcome.id === p2.outcome.id && p1.role === (p1.outcome.role || 'follow') && p1.chat.length > 0 && p1.react.length > 0);

    // later: when and where the person comes back
    const later = { after: [1, 2], where: 'exit', lines: ['a', 'b'], reward: { shells: 12 } };
    const dues = new Set(); for (let s = 0; s < 60; s++) dues.add(owedFrom('marlo', 'Marlo', later, 1, s, 3, true).due);
    assert(`r3 later: met on 1-1 he comes back on 1-2 or 1-3 (${[...dues].join()})`, dues.has(2) && dues.has(3) && dues.size === 2);
    const late = owedFrom('marlo', 'Marlo', later, 3, 5, 3, true), none = owedFrom('marlo', 'Marlo', later, 3, 5, 3, false);
    assert('r3 later: past the last level he waits in the rest grotto; with no grotto there is no meeting', late.due === DUE_REST && late.where === 'rest' && none === null);
    const mama = owedFrom('pip', 'Pip', table.rows.find((r) => r.id === 'pip-1').outcomes.find((o) => o.id === 'mama').later, 1, 3, 3, true);
    assert('r3 later: someone else can come instead (Pip\'s mother)', mama.npc === 'pip' && mama.variant === 'mama' && mama.name === "Pip's Mama" && mama.reward.hearts === 1 && mama.from === 'pip');
    const q = owedFrom('quill', 'Quill', table.rows.find((r) => r.id === 'quill-dig').outcomes.find((o) => o.id === 'grotto').later, 1, 3, 3, true);
    assert('r3 later: Quill asks you to the grotto', q.due === DUE_REST && q.reward.juice > 0);

    // the meeting spot: a reachable floor near the exit
    const box = (x, y) => x < 2 || x >= 30 || y < 2 || y >= 20 || (y >= 15 && x < 12);
    const spot = findFloorNear(box, 20.5, 18.5, 2.5, 8, 2);
    assert(`r3 later: the visitor stands on a floor 2.5-8 tiles from the exit (${spot && spot.x}, ${spot && spot.y})`, !!spot && box(spot.x, spot.y + 0.5) && !box(spot.x, spot.y - 0.5) && !box(spot.x, spot.y - 1.5) && Math.hypot(spot.x - 20.5, spot.y - 0.5 - 18.5) <= 8.6);
    assert('r3 later: a veto moves the spot', (() => { const s2 = findFloorNear(box, 20.5, 18.5, 2.5, 8, 2, (x) => Math.abs(x - spot.x) < 2); return !!s2 && Math.abs(s2.x - spot.x) >= 2; })());

    // the visitor: greets as you come near, hands over once when you swim up, stays and chats
    const v = createVisitor(late, { x: 10.5, y: 15 }, ['chat line one', 'chat two']);
    const far = { x: 30, y: 14, dead: false };
    assert('r3 visitor: far away nothing happens', visitorStep(v, far, 0.02) === '' && !v.greeted);
    const nearO = { x: 15, y: 14, dead: false };
    visitorStep(v, nearO, 0.02);
    assert('r3 visitor: coming near (7 tiles) he greets you with the first line and faces you', v.greeted && v.talk.text === 'a' && v.idle.face === 1);
    const atO = { x: 11.3, y: 14.3, dead: false };
    const ev = visitorStep(v, atO, 0.02), said = v.talk.text;
    let again = 0; for (let i = 0; i < 300; i++) if (visitorStep(v, atO, 0.02) === 'give') again++;
    assert('r3 visitor: swimming up to him hands the reward over exactly once, with his other lines', ev === 'give' && again === 0 && v.gave && said === 'b');
    for (let i = 0; i < 800; i++) visitorStep(v, atO, 0.02);
    assert('r3 visitor: he stays and says an idle line after a quiet spell', v.gave && v.chatN >= 1);

    // idle: face, glance, jump at a blast
    const id = createIdle(3);
    idleStep(id, 0, 0, { x: -3, y: 0 }, 0.02);
    const f1 = id.face;
    let flips = 0, last = f1; for (let i = 0; i < 600; i++) { idleStep(id, 0, 0, { x: 50, y: 0 }, 0.02); if (id.face !== last) { flips++; last = id.face; } }
    const tk = createTalk();
    assert(`r3 idle: faces the octopus near, glances about when it is far (${flips} glances in 12 s)`, f1 === -1 && flips >= 3 && flips <= 8);
    assert('r3 idle: a blast close by makes them jump and shout; far away nothing', idleReact(id, tk, ['Whoa!'], 2, 0, 0, 0) && id.hop === 1 && idleLift(id) < 1e-6 && tk.q[0] === 'Whoa!' && !idleReact(createIdle(), createTalk(), ['x'], 20, 0, 0, 0));

    // the rescue that stays: the cage breaks, Pip swims about it and the encounter is done at once
    const stay = { id: 'mama', lines: ['Squee!'], role: 'stay', now: null, later: null };
    const ps = mk(Q_RESCUE, Float32Array.of(20.5, 20.5), { outcome: stay, role: 'stay', chat: ['hi'], react: ['eep'] });
    assert('r3 rescue (stay): a bomb breaks the cage; help, thank, then the outcome line; done at once, not following', questBlast(ps, 21, 20.5, 2) && ps.staying && !ps.following && ps.status === ST_DONE && ps.talk.q.includes('Squee!'));
    let maxD = 0; for (let i = 0; i < 1000; i++) { questUpdate(ps, { x: 26, y: 20, vx: 0, vy: 0 }, stubWorld, 0.02); maxD = Math.max(maxD, Math.hypot(ps.cx - 20.5, ps.cy - 20.5)); }
    assert(`r3 rescue (stay): he swims about his open cage for 20 s (at most ${maxD.toFixed(2)} tiles off) and never leaves`, maxD > 0.3 && maxD < 2.2 && ps.status === ST_DONE);
    assert('r3 rescue (stay): he jumps at a blast once out of the cage', questReact(ps, 22, 20.5) && ps.idle.hop > 0.9);
    // the follower keeps following (paid at the exit)
    const pf = mk(Q_RESCUE, Float32Array.of(20.5, 20.5), { outcome: { id: 'follow', lines: ['I will follow'], role: 'follow' }, role: 'follow' });
    questBlast(pf, 21, 20.5, 2);
    assert('r3 rescue (follow): the cage breaks and he follows; not done until the exit', pf.following && pf.status === ST_ACTIVE && questOnExit(pf) && pf.status === ST_DONE);
    // meet: swim up to the person
    const pm = mk(Q_MEET, Float32Array.of(12.5, 12.45), { npc: 'quill', outcome: { id: 'hint', lines: ['A hint'] } });
    questUpdate(pm, { x: 18, y: 12 }, stubWorld);
    assert('r3 meet: Quill calls out as you come near', pm.met && pm.talk.text === L.meet && pm.status === ST_ACTIVE);
    questUpdate(pm, { x: 13.6, y: 12.3 }, stubWorld);
    assert('r3 meet: swimming up to him finishes the scene (help, thank, outcome) and he stays', pm.status === ST_DONE && pm.talk.text === L.help && pm.talk.q.join('|') === L.thank + '|A hint');

    // hub gifts: kept in the save, handed over by the resident, applied as a boon on the next dive
    const gid = table.rows.find((r) => r.id === 'marlo-1').outcomes.find((o) => o.id === 'gift').giftId;
    const gv = hubVisit(table, { marlo: 1, saidMarlo: 1, giftMarlo: gid, boonBombs: 1 }, 'marlo', 4);
    assert('r3 hub gift: Marlo hands over his gift (his words), the gift is cleared and the bombs wait for the next dive (added up)',
      gid > 0 && gv.gift && gv.lines.some((l) => /next dive/.test(l)) && gv.set.some(([k, n]) => k === 'giftMarlo' && n === 0) && gv.set.some(([k, n]) => k === 'boonBombs' && n === 3));
    assert('r3 hub: the host lives in the hub after a won wager', hubResidents(table, { host: 1 }).map((r) => r.id).join() === 'host' && hubVisit(table, { host: 1, saidHost: 0 }, 'host', 0).lines[0] === table.npcById.get('host').thanks[1]);
  }

  // ---- people.js: owed meetings, grudges, visitors ----
  {
    const ppl = createPeople();
    const box = (x, y) => x < 2 || x >= 40 || y < 2 || y >= 20;
    ppl.owe('marlo', 'Marlo', { after: [1, 1], where: 'exit', lines: ['Hey', 'Here'], reward: { shells: 12 } }, 1, 1, 3, true);
    ppl.owe('pip', 'Pip', { after: [1, 1], where: 'exit', npc: 'pip', variant: 'mama', name: "Pip's Mama", lines: ['Hi'], reward: { hearts: 1 } }, 1, 1, 3, true);
    assert('r3 people: two meetings owed for 1-2, none on 1-1', ppl.owed.length === 2 && ppl.setupLevel(1, { isSolid: box }, { x: 20.5, y: 18.5 }).length === 0 && ppl.owed.length === 2);
    ppl.noteGrudge(NPC_PIP, false);
    const vs = ppl.setupLevel(2, { isSolid: box }, { x: 20.5, y: 18.5 });
    assert('r3 people: on 1-2 both come; the angered one (Pip\'s family) comes back hostile, Marlo calm; they stand apart', vs.length === 2 && ppl.owed.length === 0 &&
      vs.find((v) => v.npc === 'marlo').hostile === false && vs.find((v) => v.npc === 'pip').hostile === true && Math.hypot(vs[0].x - vs[1].x, vs[0].floorY - vs[1].floorY) >= 2.2);
    const gives = ppl.step({ x: vs.find((v) => v.npc === 'marlo').x, y: vs.find((v) => v.npc === 'marlo').cy, dead: false }, 0.02, null);
    assert('r3 people: only the calm one hands over', gives.length === 1 && gives[0].v.npc === 'marlo' && gives[0].reward.shells === 12);
    ppl.owe('marlo', 'Marlo', { after: [1, 1], where: 'exit', lines: ['x'], reward: { shells: 1 } }, 2, 1, 3, true);
    ppl.noteGrudge(NPC_MARLO, true);
    assert('r3 people: a killed person never comes; the log says why', ppl.setupLevel(3, { isSolid: box }, { x: 20.5, y: 18.5 }).length === 0 && ppl.log.some((l) => l.npc === 'marlo' && l.why === 'dead'));
    ppl.newDive();
    assert('r3 people: a new dive forgets the grudges and the meetings', ppl.owed.length === 0 && ppl.grudge.every((g) => g === 0));
  }

  // ---- save.js story flags ----
  {
    const mem = new Map();
    const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    let stubbed = false;
    try { Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true }); stubbed = true; } catch (e) { /* engine refuses */ }
    if (stubbed) {
      _resetForTests();
      const s0 = getStory();
      assert('story: a fresh save has every person at stage 0, no relics, no pool wagers', s0.marlo === 0 && s0.pip === 0 && s0.quill === 0 && s0.relics === 0 && s0.relicsGiven === 0 && s0.poolPaid === 0 && s0.poolWon === 0);
      setStory('marlo', 1); setStory('marlo', 0); addStory('relics'); addStory('relics'); addStory('nonsense');
      _resetForTests();
      const s1 = getStory();
      assert('story: stages and relics persist across a reload; a stage never goes down, unknown keys are ignored', s1.marlo === 1 && s1.relics === 2 && !('nonsense' in s1));
      mem.set('octomancer.best.v1', JSON.stringify({ v: 1, story: { diverFreed: 2, critterFreed: 1 } }));
      _resetForTests();
      const s2 = getStory();
      assert('story: a save from before the questlines puts the people it knows at their stage (Marlo one per run freed, up to 3), already thanked', s2.marlo === 2 && s2.saidMarlo === 2 && s2.pip === 1 && s2.saidPip === 1 && s2.quill === 0);
      // the whole Marlo and Collector chains persist across reloads
      mem.clear();
      for (let r = 0; r < 3; r++) { _resetForTests(); addStory('diverFreed'); setStory('marlo', Math.min(3, getStory().diverFreed)); }
      setStory('quill', 1); addStory('relics'); addStory('relics'); addStory('relicsGiven'); addStory('poolPaid'); addStory('poolWon'); setStory('pip', 1); addStory('critterFreed');
      _resetForTests();
      const s3 = getStory();
      assert('story: Marlo freed in three runs, two relics (one handed over), a pool wager won and Pip freed all persist across a reload',
        s3.marlo === 3 && s3.diverFreed === 3 && s3.quill === 1 && s3.relics === 2 && s3.relicsGiven === 1 && s3.poolPaid === 1 && s3.poolWon === 1 && s3.pip === 1 && s3.critterFreed === 1 &&
        eligibleRows(table, s3, 0).length === 0);
      _resetForTests();
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
      _resetForTests();
    } else {
      assert('story: persistence (skipped: localStorage cannot be stubbed here)', true);
    }
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
      assert('quest journal: nothing found at first', !j.has('person-diver') && !j.has('place-shop'));
      j.discover('person-diver'); j.discover('place-shop'); j.discover('item-heart');
      _resetForTests();
      const j2 = createJournal({ load: getJournalIds, save: saveJournalIds });
      assert('quest journal: a completed quest, the shop and a bought item survive a reload', j2.has('person-diver') && j2.has('place-shop') && j2.has('item-heart') && !j2.has('person-critter'));
      const questRows = j2.list('person');
      assert('quest journal: the People category lists the five people, one found', questRows.length === 5 && questRows.filter((e) => e.found).length === 1);
      _resetForTests();
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
      _resetForTests();
    } else {
      assert('quest journal: persistence (skipped: localStorage cannot be stubbed here)', true);
    }
  }
}
