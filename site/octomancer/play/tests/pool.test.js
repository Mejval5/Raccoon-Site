// Round 39: the Challenge Pool (pool.js, the 'b1-set-pool' room), Marlo's hub ring to 1-3 (run.js), and the removal of the HUD quest line.
import { createRoomBank, ROOM_W, ROOM_H } from '../js/rooms.js';
import { setDefaultBank, generateLevel, SET_POOL } from '../js/level.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { planPool, planPools, createPoolState, poolStep, inPoolRoom, POOL_COST, POOL_SECONDS, POOL_PRIZE, PL_IDLE, PL_ACTIVE, PL_WON, PL_LOST, PL_DONE } from '../js/pool.js';
import { createPathGrid, reachableNodes, reachedNear } from '../js/pathcheck.js';
import { createLoot, LK_CHEST } from '../js/loot.js';
import { createRun, runEvent, levelSpec, stageLabel, EV_ENTER_DIVE, EV_ENTER_SHORTCUT3, EV_EXIT, SHORTCUT3_LEVEL, S_HUB, S_BIOME, S_END } from '../js/run.js';
import { parseAuthoredMap } from '../js/authored.js';
import { createUI } from '../js/ui.js';
import { createOctopus } from '../js/octopus.js';
import { ENTRIES } from '../js/journal.js';
import { drawSpeech } from '../js/v2-props-draw.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

export async function runPoolTests(assert) {
  const biomeJson = await loadBiome1Json();
  const bank = createRoomBank(biomeJson);
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);

  // ---- the room ----
  const room = biomeJson.find((r) => r.id === 'b1-set-pool');
  assert('pool room: b1-set-pool is in the biome bank, tagged path-LR like the other set pieces, 10 x 16 with open left and right seams',
    !!room && room.tags.join() === 'path-LR' && room.cells.length === ROOM_H && room.cells.every((r) => r.length === ROOM_W) && room.cells[6][0] === '.' && room.cells[6][ROOM_W - 1] === '.');
  assert('pool room: a two-tile plinth in the middle of the floor (the pedestal stands on it)', room.cells[11].slice(4, 6) === '##' && room.cells[10].slice(3, 7) === '....');

  // ---- placement over generated levels ----
  const hostVent = [];
  let levels = 0, pools = 0, bad = [], jets = 0, enemiesIn = 0, loneChest = 0;
  for (let seed = 1; seed <= 150; seed++) for (let lv = 0; lv < 3; lv++) {
    const L = generateLevel(seed, lv, bank);
    levels++;
    const plans = planPools(L);
    let nPool = 0;
    for (let i = 0; i < L.nSetPieces; i++) if (L.setPieces[i * 4 + 2] === SET_POOL) nPool++;
    if (plans.length !== nPool) bad.push('missed ' + seed + '/' + lv);
    if ((plans[0] || null) !== null && JSON.stringify(planPool(L)) !== JSON.stringify(plans[0])) bad.push('first ' + seed + '/' + lv);
    const grid = plans.length ? createPathGrid(L.w, L.h, (x, y) => L.tiles[y * L.w + x] !== 0) : null;
    const reached = plans.length ? reachableNodes(grid, L.startX + 0.5, L.startY + 0.5) : null;
    const sp = plans.length ? buildLevelSpawns(L, seed, lv).spawns : [];
    for (const plan of plans) {
      // a pool room cut off from the start (the level's reachable part) is scenery like any unreachable set piece
      let reachableRoom = false;
      for (let yy = plan.y0; yy < plan.y0 + ROOM_H && !reachableRoom; yy++) for (let xx = plan.x0; xx < plan.x0 + ROOM_W; xx++) if (L.tiles[yy * L.w + xx] === 0 && reachedNear(grid, reached, xx + 0.5, yy + 0.5, 0.3)) { reachableRoom = true; break; }
      if (!reachableRoom) continue;
      pools++;
      const T = (x, y) => L.tiles[Math.floor(y) * L.w + Math.floor(x)] !== 0;
      // the pedestal stands on the plinth: rock under it, open water at its own cell and above
      if (!T(plan.x - 0.5, plan.floorY) || !T(plan.x + 0.5, plan.floorY) || T(plan.x, plan.y) || T(plan.x, plan.y - 1) || T(plan.x, plan.y - 2)) bad.push('plinth ' + seed + '/' + lv);
      if (!reachedNear(grid, reached, plan.x, plan.y, 0.3)) bad.push('unreachable ' + seed + '/' + lv);
      const inside = (r) => r.x >= plan.x0 && r.x < plan.x0 + ROOM_W && r.y >= plan.y0 && r.y < plan.y0 + ROOM_H;
      for (const r of sp) {
        if (!inside(r)) continue;
        if (r.type === 'hazard' && r.set === 'pool') { jets++; if (Math.abs(r.x - (plan.x - 1.7)) < 1.4) hostVent.push(seed + '/' + lv); } // the host stands at plan.x - 1.7
        else if (r.type === 'enemy-slot') enemiesIn++;
        else if (r.type === 'hazard' || r.type === 'loot') loneChest++;
      }
    }
  }
  assert(`pool placement: ${pools} of ${levels} levels hold a Challenge Pool, every plinth carries its pedestal and is reachable by A*` + (bad.length ? ' [' + bad.slice(0, 4).join(', ') + ']' : ''), pools >= 20 && bad.length === 0);
  assert('pool placement: no vent stands within 1.4 tiles of the host (his fin overlapped a vent at column 2)' + (hostVent.length ? ' [' + hostVent.slice(0, 4).join(', ') + ']' : ''), hostVent.length === 0);
  assert(`pool placement: its room holds its vents (${jets}) and nothing else: no enemy (${enemiesIn}), trap or loot (${loneChest})`, jets >= pools && jets <= pools * 2 && enemiesIn === 0 && loneChest === 0);

  // ---- the state machine ----
  const plan = { x0: 10, y0: 10, x: 15, y: 20.5, floorY: 21 };
  const near = () => { const o = createOctopus(15, 20.5); return o; };
  {
    const st = createPoolState(plan);
    const o = createOctopus(5, 5);
    assert('pool: idle, nothing happens away from the pedestal', st.state === PL_IDLE && poolStep(st, o, 99, 0.02).length === 0);
    const o2 = near();
    const ev = poolStep(st, o2, POOL_COST - 1, 0.02);
    assert('pool: on the pedestal with too few shells nothing is paid; the price flashes once, without text', ev.length === 1 && ev[0].type === 'poor' && st.state === PL_IDLE && st.flash > 0 && poolStep(st, o2, POOL_COST - 1, 0.02).length === 0);
    const pay = poolStep(st, o2, POOL_COST, 0.02);
    assert(`pool: with ${POOL_COST} shells the wager is paid and the ${POOL_SECONDS} s start`, pay.length === 1 && pay[0].type === 'paid' && pay[0].cost === POOL_COST && st.state === PL_ACTIVE && st.t === POOL_SECONDS);
    assert('pool: it cannot be paid twice', poolStep(st, o2, 99, 0.02).every((e) => e.type !== 'paid'));
    let evs = [];
    for (let i = 0; i < (POOL_SECONDS - 1) * 50; i++) evs.push(...poolStep(st, o2, 0, 0.02));
    assert('pool: still running a second before the end', st.state === PL_ACTIVE && st.t < 1.3 && evs.length === 0);
    for (let i = 0; i < 60; i++) evs.push(...poolStep(st, o2, 0, 0.02));
    assert('pool: surviving the whole wager inside the room wins it (the chest rises)', st.state === PL_WON && evs.filter((e) => e.type === 'won').length === 1);
    const far = createOctopus(12, 17);
    assert('pool: the chest takes a second to rise, even with the octopus standing on it, and then waits for it', st.state === PL_WON && st.rise > 0 && poolStep(st, o2, 0, 0.02).length === 0 && st.state === PL_WON && poolStep(st, far, 0, 0.02).length === 0);
    let take = [];
    for (let i = 0; i < 60 && !take.length; i++) take = poolStep(st, o2, 0, 0.02);
    assert(`pool: opening the chest gives ${POOL_PRIZE} shells once`, take.length === 1 && take[0].type === 'prize' && take[0].shells === POOL_PRIZE && st.state === PL_DONE && poolStep(st, o2, 0, 0.02).length === 0);
    assert('pool: the prize beats the wager (more shells than it cost)', POOL_PRIZE > POOL_COST);
  }
  {
    const st = createPoolState(plan);
    const o = near();
    poolStep(st, o, 9, 0.02);
    o.x = 40; o.y = 40; // out of the room
    let lost = 0;
    for (let i = 0; i < 4 * 50; i++) for (const e of poolStep(st, o, 0, 0.02)) if (e.type === 'lost') lost++;
    assert('pool: leaving the room for good loses the wager (once), and it is not paid again', lost === 1 && st.state === PL_LOST && poolStep(st, near(), 99, 0.02).length === 0);
    const st2 = createPoolState(plan), o2 = near();
    poolStep(st2, o2, 9, 0.02);
    o2.x = 14; o2.y = 5; // shoved above the room for 0.4 s (a vent)
    for (let i = 0; i < 20; i++) poolStep(st2, o2, 0, 0.02);
    o2.x = 15; o2.y = 15;
    for (let i = 0; i < 200; i++) poolStep(st2, o2, 0, 0.02);
    assert('pool: a short push out of the room (a vent) is forgiven', st2.state === PL_ACTIVE && inPoolRoom(plan, 15, 15));
    const dead = near(); dead.dead = true;
    assert('pool: a dead octopus pays nothing', poolStep(createPoolState(plan), dead, 99, 0.02).length === 0);
    assert('pool: no pool in the level, no state', createPoolState(null) === null && poolStep(null, near(), 9, 0.02).length === 0);
  }
  {
    // the rocks are the relic's falling rocks (loot.js), started and stopped by the pool
    const loot = createLoot(null);
    assert('pool rocks: no rocks before the wager', loot.chaseLeft() === 0);
    loot.startChase(POOL_SECONDS);
    assert(`pool rocks: the wager runs the falling rocks for ${POOL_SECONDS} s`, loot.chaseLeft() === POOL_SECONDS && loot.takeEvents().some((e) => e.type === 'chaseStart' && e.seconds === POOL_SECONDS));
    loot.stopChase();
    assert('pool rocks: a lost wager stops them', loot.chaseLeft() === 0);
    loot.startChase();
    assert('pool rocks: the relic keeps its own length', loot.chaseLeft() === 10);
  }

  // ---- Marlo's hub ring ----
  {
    const hub = await (await fetch('../data/hub.json')).json();
    const lv = parseAuthoredMap(hub);
    assert('hub: the map has Marlo\'s ring (T) beside the dive well and the shortcut ring, and no quest sign art', lv.shortcut3X >= 0 && lv.shortcut3Y === lv.exitY && lv.shortcut3X !== lv.shortcutX && lv.shortcut3X !== lv.exitX);
    const r = createRun(3, { tutorialDone: true });
    assert('hub ring: locked until Marlo has been freed in three runs', !runEvent(r, EV_ENTER_SHORTCUT3) && r.state === S_HUB);
    const u = createRun(3, { tutorialDone: true, shortcut3: true });
    assert('hub ring: it starts Shallows 1-3 (one level, then the biome is cleared)', runEvent(u, EV_ENTER_SHORTCUT3) && u.state === S_BIOME && u.level === SHORTCUT3_LEVEL && stageLabel(u) === 'Shallows 1-3' && levelSpec(u).levelIndex === 2);
    runEvent(u, EV_EXIT);
    assert('hub ring: finishing 1-3 clears the biome', u.state === S_END && u.last.cleared);
    assert('hub ring: not before the tutorial', !runEvent(createRun(3, { tutorialDone: false, shortcut3: true }), EV_ENTER_SHORTCUT3));
  }

  // ---- speech bubbles stay inside the safe area (clear of the HUD row and the right-hand button column) ----
  {
    const cw = 375, ch = 812;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    const rects = [], arcs = [];
    const rr = g.roundRect.bind(g); g.roundRect = (...a) => { rects.push(a); return rr(...a); };
    const ar = g.arc.bind(g); g.arc = (...a) => { arcs.push(a); return ar(...a); };
    const cam = { x: 0, y: 0, pxPerUnit: 40 };
    const at = (sx, sy) => { rects.length = 0; arcs.length = 0; drawSpeech(g, cam, cw, ch, (sx - cw / 2) / 40, (sy - ch / 2) / 40, 'Ah, a visitor! Mind the dust.', 1, 'Quill'); return rects.slice(); };
    const mid = at(190, 400);
    assert('speech: a speaker in view gets a bubble inside the screen, below the HUD row (top >= 64)', mid.length === 1 && mid[0][0] >= 8 && mid[0][0] + mid[0][2] <= cw - 8 && mid[0][1] >= 64);
    const topRight = at(350, 120);
    assert('speech: a bubble near the top right stays clear of the pause / mute / gear column (right edge <= width - 62 while above y = 172)', topRight.length === 1 && (topRight[0][1] >= 172 || topRight[0][0] + topRight[0][2] <= cw - 62));
    const top = at(190, 20);
    assert('speech: a speaker above the safe area (under the HUD row) gets an edge arrow, not a clamped bubble', top.length === 0 && arcs.length >= 2);
    const side = at(2, 400), right = at(374, 90);
    assert('speech: a speaker at the left edge gets an arrow, one at the top right edge an arrow below the buttons', side.length === 0 && right.length === 0 && arcs.some((a) => a[1] >= 172 - 1));
  }

  // ---- no quest line in the HUD ----
  {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const ui = createUI(root, { onRestart() {}, onExit() {}, onTogglePause() {}, onEndContinue() {}, muted: true });
    ui.updateHud({ hearts: 3, heartMax: 3, bombs: 1, depth: 10, score: 5, best: 9, stage: 'Shallows 1-2', shells: 4, items: [], quest: 'Quest: kill three', questState: '' });
    assert('hud: there is no quest line any more (no element, and a quest field in the state is ignored)',
      !root.querySelector('.octo-hud-quest') && !/quest/i.test(root.textContent) && !root.querySelector('[class*="quest"]'));
    root.remove();
  }
  assert('journal: the Challenge Pool has its place entry (visited, wagers paid, won)', ENTRIES.some((e) => e.id === 'place-pool' && e.counters.map((c) => c[1]).join() === 'Visited,Wagers paid,Won'));
}
