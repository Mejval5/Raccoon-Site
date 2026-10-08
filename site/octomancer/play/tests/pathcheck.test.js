// Round 22: the A* reachability check (pathcheck.js), the final-level check inside generateLevel,
// authored maps (hub, tutorial), the tutorial assists, and scripted A*-following bot runs through the real
// input + physics: hub -> tutorial -> Shallows 1-1..1-3 across 10 seeds.
import { createPathGrid, findPath, reachableNodes, reachedNear, pathSolvable, segmentFree, PATH_MARGIN } from '../js/pathcheck.js';
import { OCTO_RADIUS } from '../js/config.js';
import { parseAuthoredMap, authoredSolvable } from '../js/authored.js';
import { createRoomBank, TAG_SHOP, CELL_ROCK, ROOM_W, ROOM_H, RC } from '../js/rooms.js';
import { generateLevel, finalPathOk, setDefaultBank, LEVEL_W, LEVEL_H, fatWaterSolvable, BORDER } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createRun, runEvent, levelSpec, EV_ENTER_DIVE, EV_EXIT } from '../js/run.js';
import { createTutorialState, tutorialStep, tutorialActed, tutorialRooms, IDLE_HINT_S, TUTORIAL_BOMBS_GUARANTEED, DOOR_WAIT_S } from '../js/tutorial.js';
import { STEP } from '../js/loop.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';
import { createBotSim, tick, follow, wait } from './bot.js';

/** Build a tiny map from rows ('#' rock) and test pathSolvable between two marked cells. */
function solvable(rows, opts) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  let sx = 0, sy = 0, ex = 0, ey = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x];
    if (c === '#') tiles[y * w + x] = 1;
    if (c === 'S') { sx = x; sy = y; }
    if (c === 'E') { ex = x; ey = y; }
  }
  return pathSolvable(tiles, w, h, sx, sy, ex, ey, opts);
}

export async function runPathcheckTests(assert) {
  // ---- the check itself, on tiny hand-made maps ----
  assert(`pathcheck: uses the octopus's real radius (${OCTO_RADIUS}) plus a small margin (${PATH_MARGIN})`, OCTO_RADIUS === 0.45 && PATH_MARGIN > 0 && PATH_MARGIN < 0.05);
  assert('pathcheck: a 1-tile corridor is swimmable (radius 0.45 fits in 1.0)', solvable(['#######', '#S...E#', '#######']));
  assert('pathcheck: a diagonal squeeze between two rocks touching at their corners is NOT swimmable',
    !solvable(['#####', '#S###', '##.##', '###E#', '#####']));
  assert('pathcheck: a walled-off exit is unreachable', !solvable(['#########', '#S..#..E#', '#########']));
  assert('pathcheck: 8-directional moves take a diagonal open field', solvable(['#####', '#S..#', '#...#', '#..E#', '#####']));
  assert('pathcheck: a blocking prop across a 1-wide corridor makes it unsolvable, one beside it does not',
    !solvable(['#######', '#S...E#', '#######'], { blockers: [{ x: 3.5, y: 1.5, r: 0.3 }] }) &&
    solvable(['#########', '#S.....E#', '#.......#', '#########'], { blockers: [{ x: 4.5, y: 1.5, r: 0.3 }] }));
  assert('pathcheck: bomb-wall tiles count as passable only when the caller opens them',
    !solvable(['#######', '#S.#.E#', '#######']) && solvable(['#######', '#S.#.E#', '#######'], { open: (x) => x === 3 }));
  {
    const rows = ['##########', '#S.......#', '#........#', '#.......E#', '##########'];
    const w = rows[0].length, h = rows.length, t = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') t[y * w + x] = 1;
    const grid = createPathGrid(w, h, (x, y) => t[y * w + x] !== 0);
    const p = findPath(grid, 1.5, 1.5, 8.5, 3.5);
    assert('pathcheck: findPath returns world-unit waypoints from the start to the goal radius', !!p && p.points.length >= 4 &&
      Math.hypot(p.points[0] - 1.5, p.points[1] - 1.5) < 0.6 && Math.hypot(p.points[p.points.length - 2] - 8.5, p.points[p.points.length - 1] - 3.5) <= 1.1);
    assert('pathcheck: segmentFree is false through rock and true in open water', segmentFree(grid, 1.5, 1.5, 8.5, 1.5) && !segmentFree(grid, 1.5, 1.5, 1.5, -1));
    const reached = reachableNodes(grid, 1.5, 1.5);
    assert('pathcheck: reachableNodes / reachedNear cover the open room and not the rock', reachedNear(grid, reached, 5.5, 2.5) && !reachedNear(grid, reached, 0.5, 0.5, 0.3));
  }

  // ---- authored maps ----
  const hubJson = await (await fetch('../data/hub.json')).json();
  const tutJson = await (await fetch('../data/tutorial.json')).json();
  const hub = parseAuthoredMap(hubJson), tut = parseAuthoredMap(tutJson);
  assert('A* authored: the hub exit is reachable from the start', authoredSolvable(hub, false));
  assert('A* authored: the hub sign (Q) and journal board are reachable too', (() => {
    const grid = createPathGrid(hub.w, hub.h, (x, y) => hub.tiles[y * hub.w + x] !== 0);
    const r = reachableNodes(grid, hub.startX + 0.5, hub.startY + 0.5);
    return hub.signX >= 0 && reachedNear(grid, r, hub.signX + 0.5, hub.signY + 0.5, 0.75) && reachedNear(grid, r, hub.boardX + 0.5, hub.boardY + 0.5, 0.75);
  })());
  assert('A* authored: the tutorial exit is NOT reachable while the bomb wall stands', !authoredSolvable(tut, false));
  assert('A* authored: the tutorial is solvable once the walls count as passable and the doors are open, and the tutorial guarantees bombs for it',
    TUTORIAL_BOMBS_GUARANTEED && authoredSolvable(tut, true, true) && tut.prompts.some((p) => p.refillBomb));
  assert('A* authored: the tutorial exit is NOT reachable while the coral doors are shut (walls passable)', !authoredSolvable(tut, true, false));
  {
    // the rooms (pure): a goal opens its own door and no other; a door also opens after DOOR_WAIT_S in its room
    const tiles = new Map();
    const tileAt = (x, y) => (tiles.has(x + ',' + y) ? tiles.get(x + ',' + y) : tut.tiles[y * tut.w + x]);
    const st = createTutorialState(tut), acts = { throws: 0, casts: 0, buys: 0 };
    const at = (x, y, n = 1) => { const out = []; for (let i = 0; i < n; i++) out.push(...tutorialRooms(st, tut, { x, y, ...acts, tileAt }, STEP).open); return out; };
    const o0 = at(10, 10, 5);
    const o1 = at(30, 9, 5);
    tiles.set('30,6', 0); // an ink blob crumbled a fish bone
    const o2 = at(30, 9);
    const o3 = at(43, 9, 5); acts.throws++; const o4 = at(43, 9);
    const o5 = at(42, 29, 5); acts.casts++; const o6 = at(42, 29);
    const o7 = at(26, 30, 5); acts.buys++; const o8 = at(26, 30);
    const seq = [o0, o1, o2, o3, o4, o5, o6, o7, o8].map((a) => a.join()).join('|');
    assert('tutorial rooms: nothing opens before a goal; the bone, a throw, a cast and a buy open doors 1, 2, 3 and 4 in turn (' + seq + ')', seq === '||1||2||3||4');
    const sw = createTutorialState(tut);
    const n = Math.round(DOOR_WAIT_S / STEP);
    const early = [], late = [];
    for (let i = 0; i < n - 5; i++) early.push(...tutorialRooms(sw, tut, { x: 43, y: 9, throws: 0, casts: 0, buys: 0, tileAt }, STEP).open);
    for (let i = 0; i < 10; i++) late.push(...tutorialRooms(sw, tut, { x: 43, y: 9, throws: 0, casts: 0, buys: 0, tileAt }, STEP).open);
    assert('tutorial rooms: a door opens after ' + DOOR_WAIT_S + ' s in its room without the goal, not before', !early.length && late.join() === '2');
  }

  // ---- tutorial assists (pure) ----
  {
    const st = createTutorialState();
    const o = { bombs: 0, vx: 0, vy: 0 };
    assert('tutorial: bombs refill to 1 when the count hits 0 while the wall stands', tutorialStep(st, o, true, 0.02) === true && o.bombs === 1);
    o.bombs = 0;
    assert('tutorial: no refill once the wall is gone', tutorialStep(st, o, false, 0.02) === false && o.bombs === 0);
    o.bombs = 2; o.vx = 0; o.vy = 0;
    const st2 = createTutorialState();
    for (let i = 0; i < Math.round(IDLE_HINT_S / 0.02) - 2; i++) tutorialStep(st2, o, true, 0.02);
    const before = st2.hint;
    for (let i = 0; i < 6; i++) tutorialStep(st2, o, true, 0.02);
    assert('tutorial: the bomb hint comes back after the player idles about 5 s', before === false && st2.hint === true);
    o.vx = 3;
    tutorialStep(st2, o, true, 0.02);
    assert('tutorial: moving clears the hint and the idle clock', st2.hint === false && st2.idle === 0);
    o.vx = 0;
    for (let i = 0; i < 300; i++) tutorialStep(st2, o, true, 0.02);
    tutorialActed(st2);
    assert('tutorial: placing a bomb clears the hint', st2.hint === false && st2.idle === 0);
  }

  // ---- generated levels: the A* check ran on the final tiles ----
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);
  {
    const SEEDS = [1, 42, 1234, 99991, 0xC0FFEE], N = 400;
    let total = 0, aStarBad = 0, fatBad = 0, shops = 0, shopBad = 0, pocketLv = 0, pocketBad = 0, viaPng = 0, carved = 0;
    for (const seed of SEEDS) {
      for (let i = 0; i < N; i++) {
        const lv = generateLevel(seed, i, bank);
        total++;
        if (lv.bankFallback) viaPng++;
        if (lv.fallback) carved++;
        if (!finalPathOk(lv.tiles, lv.startX, lv.startY, lv.exitX, lv.exitY, lv.shop)) aStarBad++;
        if (!fatWaterSolvable(lv.tiles, lv.startX, lv.startY, lv.exitX, lv.exitY)) fatBad++;
        if (lv.shop) {
          shops++;
          const grid = createPathGrid(LEVEL_W, LEVEL_H, (x, y) => lv.tiles[y * LEVEL_W + x] !== 0);
          const r = reachableNodes(grid, lv.startX + 0.5, lv.startY + 0.5);
          let ok = reachedNear(grid, r, lv.shop.kx + 0.5, lv.shop.ky + 0.5);
          for (let k = 0; k < 3; k++) ok = ok && reachedNear(grid, r, lv.shop.px[k * 2] + 0.5, lv.shop.px[k * 2 + 1] + 0.5);
          // off the main path: neither the start nor the exit is inside the shop room
          const inShop = (x, y) => x >= lv.shop.x0 && x < lv.shop.x1 && y >= lv.shop.y0 && y < lv.shop.y1;
          if (!ok || inShop(lv.startX, lv.startY) || inShop(lv.exitX, lv.exitY)) shopBad++;
        }
        if (lv.nPockets > 0) {
          pocketLv++;
          // every pocket is a sealed 2x2 of water inside a 6x6 block of rock, with a reachable spot beside it
          const grid = createPathGrid(LEVEL_W, LEVEL_H, (x, y) => lv.tiles[y * LEVEL_W + x] !== 0);
          const r = reachableNodes(grid, lv.startX + 0.5, lv.startY + 0.5);
          for (let k = 0; k < lv.nPockets; k++) {
            const px = lv.pockets[k * 3], py = lv.pockets[k * 3 + 1];
            let ringRock = true;
            for (let y = py - 2; y <= py + 3; y++) for (let x = px - 2; x <= px + 3; x++) {
              const inside = x >= px && x <= px + 1 && y >= py && y <= py + 1;
              if (inside ? lv.tiles[y * LEVEL_W + x] !== 0 : lv.tiles[y * LEVEL_W + x] === 0) ringRock = false;
            }
            if (!ringRock || reachedNear(grid, r, px + 1, py + 1, 1.2)) pocketBad++;
          }
        }
      }
    }
    assert(`A* levels: all ${total} generated Shallows levels pass the A* check on their final tiles`, aStarBad === 0);
    assert('A* levels: the A* check never disagrees with the 2x2 water guarantee', fatBad === 0);
    assert(`A* levels: no level needed the carved-corridor fallback or the PNG bank (carved ${carved}, png ${viaPng})`, carved === 0 && viaPng <= total * 0.005);
    assert(`shop: appears in about 1 of 2 levels (${(100 * shops / total).toFixed(0)}%), off the main path, keeper and pedestals A*-reachable`, shops / total > 0.35 && shops / total < 0.65 && shopBad === 0);
    assert(`pockets: ${(100 * pocketLv / total).toFixed(0)}% of levels have a sealed rock pocket, each inside 2 tiles of rock and unreachable until bombed`, pocketLv / total > 0.8 && pocketBad === 0);
    assert('shop rooms: the bank has 3 shop rooms (6 variants), tagged shop, with keeper and 3 pedestals in every variant', (() => {
      let variants = 0, bad = 0;
      for (let v = 0; v < bank.V; v++) {
        if (!(bank.tags[v] & TAG_SHOP)) continue;
        variants++;
        let keepers = 0, ped = 0;
        for (let i = 0; i < RC; i++) { const p = bank.props[v * RC + i]; if (p === 1) keepers++; if (p === 2) ped++; }
        if (keepers !== 1 || ped !== 3) bad++;
      }
      return variants === 6 && bad === 0;
    })());
  }

  // ---- bot runs through the real input + physics ----
  const BOT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  {
    // hub: start to the dive ring
    const w = createLevelWorld(1, 0, { level: parseAuthoredMap(hubJson) });
    const sim = createBotSim(w);
    const r = follow(sim, w.exitX, w.exitY, 1.0, 3000);
    assert('bot hub: swims from the start to the dive ring using real input and physics', r.ok && w.reachedExit(sim.octo.x, sim.octo.y));
  }
  {
    // the scripted tutorial through its rooms: swim, dash through the urchin gap, the room goals open the coral doors (the ink,
    // the throw, the cast and the buy are stood in for here: tests/tutorial-cdp.js does them for real in the game), bomb the
    // floor (with the bombs wasted first in two runs), throw a sticky mine at the wall, reach the exit
    const results = [];
    for (let rep = 0; rep < 3; rep++) {
      const w = createLevelWorld(1, 0, { level: parseAuthoredMap(tutJson) });
      const lv = w.level;
      const intact = (l) => { for (let i = 0; i < l.length; i += 2) if (w.tileAt(l[i], l[i + 1]) !== 0) return true; return false; };
      const sim = createBotSim(w, { tutorial: true, wallIntact: () => intact(lv.walls) || intact(lv.sticky) });
      const rooms = createTutorialState(lv), acts = { throws: 0, casts: 0, buys: 0 }, opened = [];
      sim.onStep = (s) => {
        for (const d of tutorialRooms(rooms, lv, { x: s.octo.x, y: s.octo.y, ...acts, tileAt: w.tileAt }, STEP).open) {
          opened.push(d); const l = lv.doors[d]; for (let i = 0; i < l.length; i += 2) w.breakTile(l[i], l[i + 1]);
        }
      };
      const out = { rep };
      let r = follow(sim, 16.9, 11.6, 0.4, 2500);
      out.toDash = r.ok;
      tick(sim, 1, 0, { dash: true });
      for (let i = 0; i < 40; i++) tick(sim, 1, 0);
      out.dashed = sim.dashes >= 1 && rooms.done[0] === 1;
      r = follow(sim, 30.6, 9.6, 0.5, 2500);
      out.shutAtInk = r.ok && opened.length === 0;
      w.crumbleTile(30, 6); for (let i = 0; i < 5; i++) tick(sim, 0, 0);       // the ink blob's work
      r = follow(sim, 41.5, 11, 0.6, 2500); acts.throws++; for (let i = 0; i < 5; i++) tick(sim, 0, 0); // a pot thrown
      out.door12 = r.ok && opened.join() === '1,2';
      if (rep === 1) { sim.octo.bombs = 0; }                // wasted every bomb: the tutorial refills one
      if (rep === 2) { for (let i = 0; i < 4; i++) { sim.octo.bombs = 0; tick(sim, 0, 0); } } // spam-empty it
      r = follow(sim, 61.5, 11.4, 0.3, 2500);
      out.atWall = r.ok; out.bombsAtWall = sim.octo.bombs;
      let bombsPlaced = 0;
      for (let attempt = 0; attempt < 3 && floorBlocking(w); attempt++) {
        follow(sim, 61.5, 11.4, 0.3, 1200);
        for (let i = 0; i < 35; i++) tick(sim, 0, 0);        // settle: a bomb inherits the octopus velocity
        tick(sim, 0, 0, { bomb: true }); bombsPlaced++;       // dropped: it sinks onto the floor
        follow(sim, 54.5, 8.5, 0.8, 600);                     // swim clear
        for (let i = 0; i < 260 && sim.bombs.list().length; i++) tick(sim, 0, 0);
      }
      out.bombsPlaced = bombsPlaced;
      r = follow(sim, 55.5, 31, 0.5, 3000);
      out.inSticky = r.ok;
      let mines = 0;
      for (let attempt = 0; attempt < 3 && rooms.done[4] !== 1; attempt++) {
        follow(sim, 55.5, 31, 0.5, 600);
        for (let i = 0; i < 20; i++) tick(sim, 0, 0);
        tick(sim, 0, 0, { bomb: true, aim: { x: -1, y: 0 } }); mines++; // a sticky mine thrown at the wall
        follow(sim, 62.5, 28.5, 0.8, 600);
        for (let i = 0; i < 300 && sim.bombs.list().length; i++) tick(sim, 0, 0);
      }
      out.mines = mines; out.sticky = rooms.done[4] === 1;
      r = follow(sim, 44.5, 30.5, 0.6, 2500); acts.casts++; for (let i = 0; i < 5; i++) tick(sim, 0, 0); // an Ink Cloud
      r = follow(sim, 28.5, 31, 0.6, 2500); acts.buys++; for (let i = 0; i < 5; i++) tick(sim, 0, 0);   // a ware taken
      out.doors = opened.join();
      r = follow(sim, w.exitX, w.exitY, 1.05, 4000);
      out.exit = r.ok && w.reachedExit(sim.octo.x, sim.octo.y);
      out.hearts = sim.minHearts;
      results.push(out);
    }
    assert('bot tutorial: swims, dashes through the gap, the goals open doors 1-4 in order, bombs the floor, sticks a mine on the wall, reaches the exit (' + results.map((o) => o.bombsPlaced + ' bomb(s), ' + o.mines + ' mine(s)').join('; ') + ') ' + (results.every((o) => o.exit) ? '' : JSON.stringify(results)),
      results.every((o) => o.toDash && o.dashed && o.shutAtInk && o.door12 && o.atWall && o.inSticky && o.sticky && o.doors === '1,2,3,4' && o.exit && o.bombsPlaced >= 1));
    assert('bot tutorial: also completes after wasting every bomb first (refill: had ' + results.map((o) => o.bombsAtWall).join('/') + ' at the wall)', results[1].exit && results[2].exit && results[1].bombsAtWall >= 1 && results[2].bombsAtWall >= 1);
    assert('bot tutorial: the bot survives the blasts (swims clear before they go off)', results.every((o) => o.hearts === 3));
  }
  {
    // r41: the floor can be broken from the side approach too (thrown from the room's side) and from straight above
    const out = [];
    // controls 2026-10-08: an aimed bomb is a sticky mine (it clings to the first rock: thrown flat it would stick to the far wall),
    // a plain one is dropped straight down
    for (const [name, sx, sy, aim] of [['thrown down and right from the side', 56.5, 11.5, { x: 1, y: 0.6 }], ['thrown right and down from higher up', 56.5, 10.5, { x: 1, y: 0.75 }], ['thrown straight down', 62.0, 10.5, { x: 0, y: 1 }], ['dropped from above', 61.5, 11.5, null]]) {
      const w = createLevelWorld(1, 0, { level: parseAuthoredMap(tutJson) });
      const sim = createBotSim(w, { tutorial: true, wallIntact: () => true });
      sim.octo.x = sim.octo.prevX = sx; sim.octo.y = sim.octo.prevY = sy;
      for (let i = 0; i < 25; i++) tick(sim, 0, 0);
      tick(sim, 0, 0, { bomb: true, aim });
      for (let i = 0; i < 300 && (sim.bombs.list().length || i < 5); i++) tick(sim, 0, 0);
      out.push({ name, open: !floorBlocking(w) });
    }
    assert('tutorial floor: a bomb dropped or thrown from the side or from above breaks through (' + out.map((o) => o.name + ' ' + (o.open ? 'yes' : 'NO')).join(', ') + ')', out.every((o) => o.open));
  }
  {
    // hub -> tutorial -> Shallows 1-1..1-3, generated levels across 10 seeds
    let ran = 0, done = 0, fails = [];
    for (const seed of BOT_SEEDS) {
      const run = createRun(seed, { tutorialDone: true });
      runEvent(run, EV_ENTER_DIVE);
      for (let k = 0; k < 3; k++) {
        const spec = levelSpec(run);
        const w = createLevelWorld(spec.seed, spec.levelIndex);
        const sim = createBotSim(w);
        const r = follow(sim, w.exitX, w.exitY, 1.05, 5000);
        ran++;
        if (r.ok && w.reachedExit(sim.octo.x, sim.octo.y)) done++; else fails.push(seed + '/1-' + (k + 1) + ':' + r.reason);
        runEvent(run, EV_EXIT);
      }
    }
    assert(`bot Shallows: the A*-following bot completes ${done}/${ran} generated levels (1-1..1-3 x ${BOT_SEEDS.length} seeds) with real input and physics` + (fails.length ? ' [' + fails.join(', ') + ']' : ''), done === ran);
  }
}

function floorBlocking(w) {
  // true while no octopus-wide way leads from the bomb room down through its floor into the shaft
  const grid = createPathGrid(w.width, w.height, (x, y) => w.tileAt(x, y) !== 0);
  return !findPath(grid, 61.5, 10.5, 61.5, 18.5);
}
