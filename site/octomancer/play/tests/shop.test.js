// 2026-10-07: the destructible shop, the buff shopkeeper and Spelunky aggro (shop.js, shopkeeper.js, shop-aggro.js,
// world-v2.js, run.js). Generated Shallows levels with a shop through the real createLevelWorld, the props system and
// the octopus; the keeper's AI in an open test world.
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, generateLevel } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps } from '../js/props.js';
import { createOctopus } from '../js/octopus.js';
import { HEART_MAX, BOMB_RADIUS } from '../js/config.js';
import { parseShopItems, createShopState, shopStep, shopWares, shopBlast, keeperSeat, W_SHELF, W_LOOSE, W_GONE } from '../js/shop.js';
import {
  createKeepers, addKeeper, stepKeepers, hitKeeper, bombKeepers, hitKeepersAt, angerAll, hostileAll, exitGuardWaits, guardSpot,
  KM_CALM, KM_WAIT, KM_ANGRY, KM_DEAD, KEEPER_HP, CLAW_TELL, CLAW_RANGE, HIT_INK, HIT_DASH, HIT_BOMB,
} from '../js/shopkeeper.js';
import { setShopHooks, shopAggro, hitShopkeepersAt, isShopAggro } from '../js/shop-aggro.js';
import { createRun, runEvent, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, S_BIOME, CAUSE_TEXT } from '../js/run.js';
import { causeEntryId } from '../js/journal.js';
import { hasLineOfSight } from '../js/pathfind.js';
import { loadBiome1Json } from './biome1.test.js';

const DT = 0.02;
const OPEN = { isSolid: () => false, tileAt: () => 0, wallSegmentsNear: () => [] }; // open water everywhere

export async function runShopTests(assert) {
  setDefaultBank(createRoomBank(await loadBiome1Json()));
  const rows = parseShopItems(await (await fetch('../data/shop-items.json')).json());

  // generated levels with a shop
  const shops = [];
  for (let s = 1; shops.length < 6 && s < 200; s++) { const L = generateLevel(s, s % 3); if (L.shop) shops.push({ seed: s, idx: s % 3 }); }
  assert(`shop: found ${shops.length} generated levels with a shop`, shops.length >= 4);

  // ---- the stall is breakable world ----
  {
    let ok = 0, counted = 0;
    for (const { seed, idx } of shops) {
      const w = createLevelWorld(seed, idx), sh = w.level.shop;
      const fx = sh.px[2], fy = sh.px[3] + 1; // the floor tile under the middle pedestal
      const solidBefore = w.tileAt(fx, fy) !== 0, breakable = w.isBreakable(fx + 0.5, fy + 0.5);
      const broke = w.breakTile(fx, fy);
      if (solidBefore && breakable && broke && w.tileAt(fx, fy) === 0) ok++;
      if (w.shopTilesBroken === 1 && w.inShop(fx, fy)) counted++;
    }
    assert(`shop: the floor under a pedestal breaks like any rock (${ok}/${shops.length}) and is counted as shop damage (${counted})`, ok === shops.length && counted === shops.length);
    const w = createLevelWorld(shops[0].seed, shops[0].idx);
    assert('shop: the 2-tile border stays unbreakable', !w.breakTile(0, 5) && !w.isBreakable(0.5, 5.5));
  }

  // ---- a ware whose floor goes falls, becomes a physics pickup, and picking it up is stealing ----
  {
    const { seed, idx } = shops[0];
    const w = createLevelWorld(seed, idx), props = createProps();
    const st = createShopState(w.level.shop, rows, seed, idx, []);
    const octo = createOctopus(w.startX, w.startY);
    octo.hearts = 1; octo.bombs = 0; // whatever is on the shelf is of use to it
    const i = 1, px = st.px[i * 2], py = st.px[i * 2 + 1];
    w.breakTile(Math.floor(px), Math.floor(py) + 1);
    const evs = shopWares(st, props, w, octo, [], []);
    const pid = st.pid[i];
    assert('shop: its floor gone, the pedestal falls and its ware becomes a loose prop', evs.some((e) => e.type === 'fell' && e.slot === i) && st.ware[i] === W_LOOSE && pid >= 0 && props.data.alive[pid] === 1 && st.pedGone[i] === 1);
    for (let n = 0; n < 50; n++) props.step(DT, w, null);
    assert(`shop: the loose ware sinks into the hole (${py.toFixed(2)} -> ${props.data.y[pid].toFixed(2)})`, props.data.y[pid] > py + 0.4);
    // swimming onto the empty pedestal buys nothing
    octo.x = px; octo.y = py;
    assert('shop: an empty pedestal sells nothing', shopStep(st, octo, 99, DT, []) === null);
    octo.x = props.data.x[pid]; octo.y = props.data.y[pid];
    const ev2 = shopWares(st, props, w, octo, [], []);
    const stolen = ev2.find((e) => e.type === 'stolen');
    assert('shop: touching the loose ware takes it without paying: a "stolen" event (main.js angers the keepers)', !!stolen && stolen.slot === i && !stolen.free && st.ware[i] === W_GONE && !props.data.alive[pid] && st.stolen === 1);
  }

  // ---- a dash through a ware knocks it off (no purchase); a loose ware is paid for when the wallet allows, else stolen ----
  {
    const { seed, idx } = shops[3 % shops.length];
    const w = createLevelWorld(seed, idx), props = createProps();
    const st = createShopState(w.level.shop, rows, seed, idx, []);
    const octo = createOctopus(st.px[0] - 0.5, st.px[1]);
    octo.hearts = 1; octo.bombs = 0;
    octo.vx = 11; octo.vy = 0; // a dash
    const bought = shopStep(st, octo, 99, DT, []);
    const ev = shopWares(st, props, w, octo, [], [], 99, DT);
    const pid = st.pid[0];
    assert('shop: a dash through a ware knocks it off its pedestal, flying, and buys nothing', bought === null && ev.some((e) => e.type === 'knocked' && e.slot === 0) && st.ware[0] === W_LOOSE && props.data.vx[pid] > 3 && st.sold[0] === 0);
    octo.vx = 0;
    const ev2 = shopWares(st, props, w, octo, [], [], 99, DT);
    assert('shop: a knocked-off ware cannot be grabbed in the same breath (it flies clear first)', !ev2.some((e) => e.type === 'stolen' || e.type === 'bought'));
    for (let n = 0; n < 40; n++) { props.step(DT, w, null); shopWares(st, props, w, { x: -99, y: -99, vx: 0, vy: 0, dead: false, hearts: 1, bombs: 0 }, [], [], 99, DT); }
    octo.x = props.data.x[pid]; octo.y = props.data.y[pid];
    const ev3 = shopWares(st, props, w, octo, [], [], 99, DT);
    const b = ev3.find((e) => e.type === 'bought');
    assert('shop: with the shells in hand and the keeper calm, picking the loose ware up pays for it', !!b && b.shells === 99 - b.price && st.sold[0] === 1 && st.stolen === 0);
  }

  // ---- a blast knocks the wares off their pedestals; a blast far away does not ----
  {
    const { seed, idx } = shops[1];
    const w = createLevelWorld(seed, idx), props = createProps();
    const st = createShopState(w.level.shop, rows, seed, idx, []);
    shopBlast(st, st.px[0] - 20, st.px[1] - 20, BOMB_RADIUS, props);
    assert('shop: a far blast leaves the wares on their pedestals', Array.from(st.ware).every((v) => v === W_SHELF));
    shopBlast(st, st.px[0], st.px[1] - 1, BOMB_RADIUS, props);
    const pid = st.pid[0];
    assert('shop: a blast beside a pedestal throws its ware off, flying', st.ware[0] === W_LOOSE && pid >= 0 && Math.hypot(props.data.vx[pid], props.data.vy[pid]) > 2);
  }

  // ---- an angry stall: wares are free ----
  {
    const { seed, idx } = shops[2];
    const w = createLevelWorld(seed, idx);
    const st = createShopState(w.level.shop, rows, seed, idx, []);
    st.free = true;
    const octo = createOctopus(st.px[0], st.px[1]);
    octo.hearts = 1; octo.bombs = 0;
    const ev = shopStep(st, octo, 0, DT, []);
    assert('shop: with the keeper hostile, a ware is taken for nothing (no shells)', ev && ev.type === 'stolen' && ev.free && st.ware[0] === W_GONE && !st.sold[0]);
  }

  // ---- the keeper seat sits on the counter between two pedestals ----
  {
    const sh = createLevelWorld(shops[0].seed, shops[0].idx).level.shop;
    const s = keeperSeat(sh);
    assert('shop: the keeper sits on the stall floor, between two pedestals', s.y < sh.px[1] + 1 && s.y > sh.px[1] && s.x > sh.px[0] && s.x < sh.px[4] + 1);
  }

  // ---- the keeper is super buff: ink and dashes barely scratch him, bombs hurt ----
  {
    const k = createKeepers();
    const i = addKeeper(k, 10, 10, KM_ANGRY, 1);
    const ink = hitKeeper(k, i, HIT_INK, 4, 7, 10); // an Ink Jet hit (autofire INK_DAMAGE)
    const knock = Math.hypot(k.vx[i], k.vy[i]);
    assert(`keeper: an ink jet barely hurts him (${ink.toFixed(2)} of ${KEEPER_HP} hp) and hardly moves him (${knock.toFixed(2)} u/s)`, ink > 0 && ink < 0.5 && knock < 0.5);
    let inkHits = 0; const k2 = createKeepers(); addKeeper(k2, 0, 0, KM_ANGRY);
    while (k2.mode[0] !== KM_DEAD && inkHits < 1000) { hitKeeper(k2, 0, HIT_INK, 4, -1, 0); inkHits++; }
    assert(`keeper: it takes ${inkHits} ink jet hits to kill him`, inkHits >= 100);
    k.vx[i] = k.vy[i] = 0;
    const dash = hitKeeper(k, i, HIT_DASH, 1, 9, 10);
    assert(`keeper: a dash glances off (${dash.toFixed(2)} hp, ${Math.hypot(k.vx[i], k.vy[i]).toFixed(2)} u/s knock)`, dash > 0 && dash <= 0.5 && Math.hypot(k.vx[i], k.vy[i]) < 1);
    const k3 = createKeepers(); addKeeper(k3, 0, 0, KM_ANGRY);
    const b1 = bombKeepers(k3, 0.3, 0.4, BOMB_RADIUS);
    assert(`keeper: a bomb at his feet really hurts (${b1.toFixed(1)} hp), stuns and throws him`, b1 > 18 && k3.stun[0] > 0 && Math.hypot(k3.vx[0], k3.vy[0]) > 4);
    let bombs = 1; while (k3.mode[0] !== KM_DEAD && bombs < 10) { bombKeepers(k3, k3.x[0] + 0.3, k3.y[0] + 0.4, BOMB_RADIUS); bombs++; }
    assert(`keeper: ${bombs} close bombs kill him`, bombs >= 2 && bombs <= 3 && k3.events.some((e) => e.type === 'killed'));
    const far = createKeepers(); addKeeper(far, 0, 0, KM_CALM);
    assert('keeper: a blast beyond twice the radius does not touch him', bombKeepers(far, 0, BOMB_RADIUS * 2 + 1, BOMB_RADIUS) === 0 && far.mode[0] === KM_CALM);
    const calm = createKeepers(); addKeeper(calm, 0, 0, KM_CALM);
    hitKeepersAt(calm, 0.5, 0, 0.2, HIT_INK, 4);
    assert('keeper: any hit wakes a calm keeper (he turns on the octopus)', calm.mode[0] === KM_ANGRY && calm.events.some((e) => e.type === 'hurt') && calm.events.some((e) => e.type === 'roused'));
  }

  // ---- brutal: claws thrown after a ~0.25 s tell, quick, two hits kill ----
  {
    const k = createKeepers();
    addKeeper(k, 10, 10, KM_ANGRY, 1);
    k.cool[0] = 0;
    const octo = createOctopus(14, 10); // 4 tiles away, in reach
    octo.feel = false;
    let tellAt = -1, launchAt = -1, hitAt = -1, t = 0;
    const start = octo.hearts;
    for (let n = 0; n < 150 && hitAt < 0; n++) {
      octo.x = 14; octo.y = 10; octo.vx = octo.vy = 0; // holds still
      stepKeepers(k, DT, octo, OPEN); t += DT;
      for (const e of k.events) {
        if (e.type === 'clawTell' && tellAt < 0) tellAt = t;
        if (e.type === 'clawLaunch' && launchAt < 0) launchAt = t;
        if (e.type === 'octoHit' && hitAt < 0) hitAt = t;
      }
      k.events.length = 0;
    }
    const tell = launchAt - tellAt;
    assert(`keeper: the claw flies ${tell.toFixed(2)} s after its wind-up starts (tell ${CLAW_TELL} s)`, tellAt >= 0 && Math.abs(tell - CLAW_TELL) <= DT * 1.5);
    assert(`keeper: the claw crosses 4 tiles and hits in ${(hitAt - launchAt).toFixed(2)} s`, hitAt > 0 && hitAt - launchAt <= 0.2);
    assert(`keeper: one claw hit takes two hearts (${start} -> ${octo.hearts}), cause 'shopkeeper'`, start === HEART_MAX && octo.hearts === HEART_MAX - 2 && octo.cause === 'shopkeeper');
    octo.invulnTimer = 0;
    let killed = false;
    for (let n = 0; n < 200 && !killed; n++) { octo.x = 14; octo.y = 10; octo.invulnTimer = Math.min(octo.invulnTimer, 0); stepKeepers(k, DT, octo, OPEN); killed = octo.dead; }
    assert('keeper: the second hit kills', killed && octo.cause === 'shopkeeper');
    // a second claw follows fast: the launches come at most CLAW_TELL + cool apart
    const k2 = createKeepers(); addKeeper(k2, 0, 0, KM_ANGRY); k2.cool[0] = 0;
    const o2 = createOctopus(5, 0); o2.invulnTimer = 99;
    const launches = [];
    for (let n = 0; n < 100; n++) { o2.x = 5; o2.y = 0; stepKeepers(k2, DT, o2, OPEN); for (const e of k2.events) if (e.type === 'clawLaunch') launches.push(n * DT); k2.events.length = 0; }
    const gap = launches.length > 1 ? launches[1] - launches[0] : 99;
    assert(`keeper: claws come every ${gap.toFixed(2)} s (${launches.length} in 2 s)`, launches.length >= 3 && gap <= 0.7);
    // out of reach: he chases instead, fast
    const k3 = createKeepers(); addKeeper(k3, 0, 0, KM_ANGRY);
    const o3 = createOctopus(20, 0); o3.invulnTimer = 99;
    for (let n = 0; n < 50; n++) { o3.x = 20; o3.y = 0; stepKeepers(k3, DT, o3, OPEN); }
    assert(`keeper: an angry keeper pursues (moved ${k3.x[0].toFixed(1)} tiles in 1 s)`, k3.x[0] > 3.5);
    // a calm keeper does nothing to a nearby octopus; a waiting one wakes when he sees it
    const kc = createKeepers(); addKeeper(kc, 0, 0, KM_CALM); addKeeper(kc, 30, 0, KM_WAIT);
    const oc = createOctopus(2, 0);
    for (let n = 0; n < 100; n++) { oc.x = 2; oc.y = 0; stepKeepers(kc, DT, oc, OPEN); }
    assert('keeper: a calm keeper never attacks', oc.hearts === HEART_MAX && kc.launches === 0 && kc.mode[0] === KM_CALM);
    assert('keeper: a waiting keeper stays at his post while the octopus is out of sight range', kc.mode[1] === KM_WAIT && Math.abs(kc.x[1] - 30) < 0.01);
    oc.x = 25;
    stepKeepers(kc, DT, oc, OPEN);
    assert('keeper: a waiting keeper rouses when the octopus comes into sight', kc.mode[1] === KM_ANGRY);
    angerAll(kc);
    assert('keeper: angerAll turns every live keeper on the octopus', kc.mode[0] === KM_ANGRY);
    const kh = createKeepers(); addKeeper(kh, 0, 0, KM_CALM); hostileAll(kh);
    assert('keeper: in an angry run a stall keeper starts hostile at his post', kh.mode[0] === KM_WAIT);
  }

  // ---- aggro lives in the run: across levels, reset by a new dive and by death ----
  {
    const run = createRun(5, { tutorialDone: true });
    runEvent(run, EV_ENTER_DIVE);
    assert('aggro: a new dive starts with calm keepers', run.state === S_BIOME && run.shopAggro === false);
    run.shopAggro = true; run.shopAggroWhy = 'theft';
    runEvent(run, EV_EXIT); runEvent(run, EV_EXIT);
    assert('aggro: it persists across the levels of the dive', run.level === 3 && run.shopAggro === true && run.shopAggroWhy === 'theft');
    runEvent(run, EV_DEATH);
    assert('aggro: death ends the dive and the aggro', run.shopAggro === false);
    run.shopAggro = true; runEvent(run, EV_ENTER_DIVE);
    assert('aggro: the next dive starts calm again', run.shopAggro === false);
  }

  // ---- the shared hooks other modules call ----
  {
    let why = '', hits = 0;
    setShopHooks({ aggro: (r) => { why = r; return true; }, hit: (x, y, r, kind, dmg) => { hits += dmg; return dmg * 0.1; }, angry: () => why !== '' });
    const a = shopAggro('npc');
    const h = hitShopkeepersAt(1, 2, 0.5, HIT_BOMB, 10);
    assert('hooks: shopAggro(reason) and hitShopkeepersAt reach the registered handlers', a === true && why === 'npc' && hits === 10 && h === 1 && isShopAggro());
    setShopHooks({});
    assert('hooks: with no handlers they are harmless no-ops', shopAggro('x') === false && hitShopkeepersAt(0, 0, 1, HIT_INK, 1) === 0 && !isShopAggro());
  }

  // ---- an angry keeper may wait at the next level's exit ----
  {
    let yes = 0;
    for (let s = 0; s < 400; s++) if (exitGuardWaits(s * 7919, s % 3)) yes++;
    assert(`guard: about three levels in four of an angry run have a keeper at the exit (${yes}/400)`, yes > 250 && yes < 350);
    let found = 0, good = 0;
    for (let s = 1; s <= 12; s++) {
      const w = createLevelWorld(s, 1), L = w.level, p = guardSpot(w.tileAt, L.exitX, L.exitY);
      if (!p) continue;
      found++;
      const solid = (x, y) => w.tileAt(x, y) !== 0;
      if (!w.isSolid(p.x, p.y) && Math.hypot(p.x - (L.exitX + 0.5), p.y - (L.exitY + 0.5)) <= 4.5 && hasLineOfSight(solid, p.x, p.y, L.exitX + 0.5, L.exitY + 0.5)) good++;
    }
    assert(`guard: a spot by the exit whirlpool in open water, in sight of it (${good}/${found} of 12 levels)`, found >= 9 && good === found);
  }

  // ---- journal and death screen ----
  assert('journal: dying to a keeper names him and counts on his People entry', causeEntryId('shopkeeper') === 'person-keeper' && /Shopkeeper/.test(CAUSE_TEXT.shopkeeper));
  assert('shop: claw reach is a real threat across a room', CLAW_RANGE >= 6);
}
