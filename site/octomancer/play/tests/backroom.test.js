// Back rooms (js/backroom.js): the roll, the curtain's spot on the front (reachable, near the solvable route, clear of the
// start, the exit and the shop, on a rock floor), the annex under the level (sealed from the front by bedrock, the front rows
// unchanged, every reward reachable from the curtain inside), determinism, and the world built from it. The real-browser side
// (F through the curtain, the overlay, the lazy spawns, no copies of the screen while outside) is tests/backroom-cdp.js.
import { setDefaultBank, generateLevel, LEVEL_W, LEVEL_H } from '../js/level.js';
import { fetchBiome1Bank } from '../js/rooms.js';
import { fetchPatterns, setPatternTable, getPatternTable } from '../js/patterns.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { addBackRoom, BACK_ROOMS, BOX_W, BOX_H, BACK_SEAM, DOOR_START_CLEAR, DOOR_EXIT_CLEAR, DOOR_ROUTE_MAX, inBackBox, cameraRegion } from '../js/backroom.js';
import { tileGrid, reachableNodes, reachedNear, findPath } from '../js/pathcheck.js';
import { createLevelWorld } from '../js/world-v2.js';
import { MAT_BEDROCK, MAT_ROCK } from '../js/materials.js';

export async function runBackroomTests(assert) {
  setDefaultBank(await fetchBiome1Bank('../data/biome1-rooms.json', '../data/rooms.json'));
  if (!getPatternTable()) setPatternTable(await fetchPatterns('../data/patterns.json'));

  assert('backroom: every grotto is ' + BOX_W + ' x ' + BOX_H + ', rock round its edge, one way out (D)', BACK_ROOMS.every((r) => r.rows.length === BOX_H && r.rows.every((row) => row.length === BOX_W)
    && r.rows[0].split('').every((c) => c === '#') && r.rows.every((row) => row[0] === '#' && row[BOX_W - 1] === '#') && r.rows.join('').split('D').length === 2));

  let n = 0, got = 0, sealed = 0, near = 0, reach = 0, rewards = 0, rewardsOk = 0, frontSame = 0, clear = 0, rockFloor = 0, inBox = 0, det = 0;
  const kinds = {};
  for (let seed = 1; seed <= 40; seed++) for (let li = 0; li < 3; li++) {
    const lv = generateLevel(seed, li);
    const front = lv.tiles.slice();
    const sp = buildLevelSpawns(lv, seed, li);
    const b = addBackRoom(lv, sp.spawns, seed, li);
    n++;
    if (!b) { if (lv.h === LEVEL_H) frontSame++; continue; }
    got++; kinds[b.kind] = (kinds[b.kind] || 0) + 1;
    const W = lv.w, H = lv.h;
    let same = H === LEVEL_H + BACK_SEAM + BOX_H + 2;
    for (let i = 0; i < LEVEL_W * LEVEL_H && same; i++) if (lv.tiles[i] !== front[i]) same = false;
    for (let y = LEVEL_H; y < LEVEL_H + BACK_SEAM && same; y++) for (let x = 0; x < W; x++) if (lv.tiles[y * W + x] !== MAT_BEDROCK) same = false;
    if (same) frontSame++;
    const g = tileGrid(lv.tiles, W, H, null);
    const fromStart = reachableNodes(g, lv.startX + 0.5, lv.startY + 0.5);
    if (!reachedNear(g, fromStart, b.retX + 0.5, b.retY + 0.5, 2)) sealed++;
    if (reachedNear(g, fromStart, b.doorX + 0.5, b.doorY + 0.3, 0.75)) reach++;
    const route = findPath(g, lv.startX + 0.5, lv.startY + 0.5, lv.exitX + 0.5, lv.exitY + 0.5);
    let rd = 1e9; if (route) for (let i = 0; i < route.points.length; i += 2) rd = Math.min(rd, Math.hypot(route.points[i] - b.doorX - 0.5, route.points[i + 1] - b.doorY - 0.5));
    if (rd <= DOOR_ROUTE_MAX + 0.01) near++;
    const dS = Math.hypot(b.doorX - lv.startX, b.doorY - lv.startY), dE = Math.hypot(b.doorX - lv.exitX, b.doorY - lv.exitY);
    const sh = lv.shop, inShop = sh && b.doorX >= sh.x0 - 2 && b.doorX < sh.x1 + 2 && b.doorY >= sh.y0 - 2 && b.doorY < sh.y1 + 2;
    if (dS >= DOOR_START_CLEAR - 0.01 && dE >= DOOR_EXIT_CLEAR - 0.01 && !inShop) clear++;
    if ([-1, 0, 1].every((dx) => { const m = lv.tiles[(b.doorY + 1) * W + b.doorX + dx]; return m === MAT_ROCK || m === MAT_BEDROCK; })) rockFloor++;
    const fromRet = reachableNodes(g, b.retX + 0.5, b.retY + 0.5);
    for (const s of b.spawns) { rewards++; if (reachedNear(g, fromRet, s.x, s.y - 0.3, 1.2)) rewardsOk++; }
    if (b.spring) { rewards++; if (reachedNear(g, fromRet, b.spring.x, b.spring.y - 0.3, 1.2)) rewardsOk++; }
    if (inBackBox(b, b.retX + 0.5, b.retY + 0.5) && b.spawns.every((s) => inBackBox(b, s.x, s.y)) && !inBackBox(b, b.doorX + 0.5, b.doorY + 0.5)) inBox++;
    const lv2 = generateLevel(seed, li), b2 = addBackRoom(lv2, buildLevelSpawns(lv2, seed, li).spawns, seed, li);
    if (b2 && b2.kind === b.kind && b2.doorX === b.doorX && b2.doorY === b.doorY && lv2.tiles.every((v, i) => v === lv.tiles[i])) det++;
  }
  assert(`backroom: about one level in two gets a grotto (${got}/${n})`, got >= n * 0.3 && got <= n * 0.6);
  assert('backroom: every kind of grotto turns up ' + JSON.stringify(kinds), BACK_ROOMS.every((r) => (kinds[r.id] | 0) > 0));
  assert('backroom: the front rows are unchanged and the seam under them is bedrock (levels without one stay 34x68)', frontSame === n);
  assert('backroom: the grotto is sealed off from the front (only the curtain leads in)', sealed === got);
  assert('backroom: the curtain is reachable from the start', reach === got);
  assert(`backroom: the curtain is within ${DOOR_ROUTE_MAX} tiles of the start -> exit route (never off the solvable path)`, near === got);
  assert('backroom: the curtain keeps clear of the start, the exit and the shop', clear === got);
  assert('backroom: the curtain stands on a floor of rock', rockFloor === got);
  assert(`backroom: every reward inside is reachable from the curtain inside (${rewardsOk}/${rewards})`, rewards > 0 && rewardsOk === rewards);
  assert('backroom: the way back and the rewards are in the box, the front curtain is not', inBox === got);
  assert('backroom: the same seed and level give the same grotto', det === got);

  // the hub, the tutorial and fallback levels never get one; the roll is skipped at chance 0; a second call adds nothing
  {
    const lv = generateLevel(2, 0), sp = buildLevelSpawns(lv, 2, 0);
    assert('backroom: chance 0 adds nothing', addBackRoom(lv, sp.spawns, 2, 0, 0) === null && lv.h === LEVEL_H);
    const lv2 = generateLevel(2, 0), b = addBackRoom(lv2, buildLevelSpawns(lv2, 2, 0).spawns, 2, 0, 1), h = lv2.h;
    assert('backroom: a level is extended once only', b && addBackRoom(lv2, [], 2, 0, 1) === b && lv2.h === h);
  }
  // the world: built from the extended level, the camera regions
  {
    let s = 1; while (s < 200) { const w = createLevelWorld(s, 0); if (w.level.back) break; s++; }
    const w = createLevelWorld(s, 0), b = w.level.back;
    assert('backroom: the world spans the annex and its tiles are the level\'s', w.height === w.level.h && w.height > LEVEL_H && w.tileAt(b.retX, b.retY) === 0 && w.tileAt(b.retX, b.retY + 1) !== 0);
    assert('backroom: the seam cannot be bombed', !w.isBreakable(5, LEVEL_H + 2) && !w.breakTile(5, LEVEL_H + 2) && w.tileAt(5, LEVEL_H + 2) === MAT_BEDROCK);
    const fr = cameraRegion(b, false, w.width), bk = cameraRegion(b, true, w.width, {});
    assert('backroom: the camera keeps to the front rows outside and to the box inside', fr.y1 === LEVEL_H && fr.x1 === w.width && bk.x0 === b.x0 && bk.y1 === b.y1 && bk.y0 === b.y0);
    assert('backroom: an authored world never has one', !createLevelWorld(1, 0, { level: { tiles: new Uint8Array(100), w: 10, h: 10, startX: 5, startY: 5, exitX: 5, exitY: 5 } }).level.back);
  }
}
