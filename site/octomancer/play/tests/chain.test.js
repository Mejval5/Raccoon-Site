// Chain reactions (2026-10-08, Daniel: "chain reactions - oh yeah!"): chain.js + creature-rules.js TRIGGERS through the real
// systems (bombs on props, hazards, creatures, loot, fragile tiles) on hand-made worlds, wired the way main.js wires them.
//  - the table: every trigger source is a damage source, every target kind has an adapter, every delay is 0.1-0.3 s
//  - every link type: a bomb sets off bombs, boulders, clams, tentacles, eels, pots, fragile tiles, jets, traps; a landing
//    boulder sets off a bomb / a clam and shakes a boulder loose; a snap and a chained shock jump to their neighbours
//  - a chain of 3+ bombs reads (each link 0.1-0.3 s after the last), the cap, the per-step budget, no loop, the off-screen rule
import { TRIGGERS, TRIGGER_SOURCES, TRIGGER_TARGET_NAMES, SOURCES, triggerReach } from '../js/creature-rules.js';
import { createChain, CHAIN_MAX_LINKS, CHAIN_BUDGET, CHAIN_MAX_DEPTH } from '../js/chain.js';
import { createDamage } from '../js/damage.js';
import { createBombs } from '../js/bomb.js';
import { createProps } from '../js/props.js';
import { createHazards, makeHazardRecord, HZ_ROCK, EEL_FIRE_AT, JET_SURGE_T } from '../js/hazards.js';
import { createCreatures, CR_GCLAM, CR_TENTACLE, CL_OPEN, CL_SNAP, CL_SHUT, TN_DORMANT, TN_WAKE } from '../js/creatures.js';
import { createLoot, LK_POT, LK_CLAM, LK_CHEST, TRAP_SPIKES, ST_INTACT } from '../js/loot.js';
import { createOctopus } from '../js/octopus.js';
import { MAT_BONE, MAT_TIMBER, MAT_BOULDER_BREAKS } from '../js/materials.js';
import { resetGameView, setGameView } from '../js/cull.js';
import { BOMB_RADIUS } from '../js/config.js';

const DT = 0.02;

/** A world from rows: '#' rock, 'B' bone, '=' timber; breakTile (bombs), smashTile (fragile), placeRock (landed boulders). */
function fakeWorld(rows) {
  const h = rows.length, w = rows[0].length, tiles = new Uint8Array(w * h);
  const M = { '#': 1, B: MAT_BONE, '=': MAT_TIMBER };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = M[rows[y][x]] || 0;
  const border = (x, y) => x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1;
  const world = {
    w, h, width: w, height: h, tiles,
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
    breakTile(x, y) { x = Math.floor(x); y = Math.floor(y); if (border(x, y) || !tiles[y * w + x]) return false; tiles[y * w + x] = 0; return true; },
    smashTile(x, y) { x = Math.floor(x); y = Math.floor(y); if (border(x, y) || !MAT_BOULDER_BREAKS[tiles[y * w + x]]) return false; tiles[y * w + x] = 0; return true; },
    placeRock(x, y) { if (tiles[y * w + x] !== 0) return false; tiles[y * w + x] = 1; return true; },
  };
  return world;
}
const room = (w, h) => Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));

/** The systems of one level wired like main.js: damage entry, chain adapters, and one fixed step in main.js's order. */
export function scene(rows, octoAt = [1.5, 1.5]) {
  resetGameView();
  const world = fakeWorld(rows);
  const props = createProps(), dm = createDamage(), chain = createChain();
  const bombs = createBombs(props), hz = createHazards(props), cr = createCreatures(), loot = createLoot(props);
  const octo = createOctopus(octoAt[0], octoAt[1]); octo.noKill = true; octo.invulnTimer = 1e9;
  dm.register(cr.family(() => octo)); hz.setDamage(dm); props.setDamage(dm); loot.setDamage(dm);
  chain.register(bombs.chainTarget());
  const [rock, eel, jet] = hz.chainTargets(); chain.register(rock); chain.register(eel); chain.register(jet);
  const [clam, tent] = cr.chainTargets(); chain.register(clam); chain.register(tent);
  const [pot, trap] = loot.chainTargets(); chain.register(pot); chain.register(trap);
  chain.register({
    name: 'tile',
    each(x, y, r, cb) {
      for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h || Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > r || !MAT_BOULDER_BREAKS[world.tileAt(tx, ty)]) continue;
        cb(ty * world.w + tx, tx + 0.5, ty + 0.5);
      }
    },
    fire(i) { const tx = i % world.w; return world.smashTile(tx, (i - tx) / world.w); },
  });
  const log = { exploded: [], landed: [], impacts: [], shocks: [], snaps: [], links: [], wakes: [], breaks: [], traps: [], time: 0 };
  const sc = { world, props, dm, chain, bombs, hz, cr, loot, octo, log, step, run, bomb, until };
  function onCreature() {
    for (const ev of cr.events) {
      if (ev.type === 'snap') { log.snaps.push({ i: ev.i, t: log.time, chain: ev.chain, far: ev.far }); chain.emit('snap', ev.x, ev.y - 0.4, ev.chain >= 0 ? ev : null, false, { target: 'clam', i: ev.i }); }
      if (ev.type === 'wake') log.wakes.push({ t: log.time });
    }
    cr.events.length = 0;
  }
  function onLoot() { for (const ev of loot.takeEvents()) { if (ev.type === 'break') log.breaks.push({ t: log.time, how: ev.how }); if (ev.type === 'trap') log.traps.push({ t: log.time, trap: ev.trap }); } }
  function step() {
    log.time += DT;
    props.step(DT, world, octo, []);
    dm.tick(DT);
    hz.update(DT, log.time, octo, world, null);
    for (const ev of hz.events) {
      if (ev.type === 'rockLanded') log.landed.push({ i: ev.i, t: log.time, chain: ev.chain });
      if (ev.type === 'rockImpact') { log.impacts.push({ i: ev.i, t: log.time, chain: ev.chain }); chain.emit('boulder', ev.x, ev.y, ev.chain >= 0 ? ev : null, ev.byOcto); }
      if (ev.type === 'shock') { log.shocks.push({ i: ev.i, t: log.time, chain: ev.chain }); chain.emit('shock', ev.x, ev.y, ev.chain >= 0 ? ev : null, false, { target: 'eel', i: ev.i }); }
    }
    onCreature(); cr.update(DT, octo, world, null); onCreature();
    loot.update(DT, octo, world, null); onLoot();
    chain.step(DT);
    for (const ev of chain.events) log.links.push({ ...ev, t: log.time });
    onCreature(); onLoot();
    bombs.update(DT, world, octo, dm);
    for (const ev of bombs.events) {
      if (ev.type !== 'exploded') continue;
      log.exploded.push({ id: ev.id, t: log.time, chain: ev.chain, depth: ev.depth });
      loot.explode(ev.x, ev.y, BOMB_RADIUS); onLoot();
      chain.emit('bomb', ev.x, ev.y, ev.chain >= 0 ? ev : null, true);
    }
  }
  function run(seconds) { const n = Math.round(seconds / DT); for (let k = 0; k < n; k++) step(); }
  function until(fn, seconds) { const n = Math.round(seconds / DT); for (let k = 0; k < n; k++) { if (fn()) return true; step(); } return fn(); }
  function bomb(x, y, fuse = 5) { bombs.place(octo, x, y, null, { pinned: true, fuse, free: true }); const l = bombs.list(); return l[l.length - 1].id; }
  return sc;
}
export const hzRec = (sc, name, x, y, dx = 0, dy = 0) => makeHazardRecord(name, x, y, dx, dy, sc.world.tiles, sc.world.w, sc.world.h);

export async function runChainTests(assert0) {
  const assert = (n, c, x = '') => assert0(c ? n : n + (x ? ' [' + x + ']' : ''), !!c); // the detail only on a failure
  // ---- the table ----
  {
    const srcOk = TRIGGER_SOURCES.every((s) => SOURCES[s]);
    const tgtOk = TRIGGER_SOURCES.every((s) => Object.keys(TRIGGERS[s].sets).every((t) => TRIGGER_TARGET_NAMES.includes(t)) && (!TRIGGERS[s].idle || Object.keys(TRIGGERS[s].idle).every((t) => TRIGGER_TARGET_NAMES.includes(t))));
    const delOk = TRIGGER_SOURCES.every((s) => TRIGGERS[s].delay[0] >= 0.1 && TRIGGERS[s].delay[1] <= 0.3 && TRIGGERS[s].delay[0] <= TRIGGERS[s].delay[1]);
    assert('chain table: every trigger source is a creature-rules SOURCES row, every target a TRIGGER_TARGETS kind', srcOk && tgtOk);
    assert('chain table: every link waits 0.1-0.3 s (the chain reads)', delOk);
    const sc = scene(room(8, 6));
    const reg = sc.chain.targets();
    assert('chain: every target kind has an adapter in the main.js-style wiring', TRIGGER_TARGET_NAMES.every((n, k) => reg[k] && reg[k].name === n));
    assert('chain table: a spontaneous snap or eel shock only reaches bombs (a periodic creature never keeps its neighbours ticking)',
      triggerReach('snap', 'clam', true) === 0 && triggerReach('snap', 'clam', false) > 0 && triggerReach('shock', 'eel', true) === 0 && triggerReach('shock', 'eel', false) > 0 && triggerReach('shock', 'bomb', true) > 0);
  }

  // ---- a chain of 4 bombs ----
  {
    const sc = scene(room(30, 10));
    const ids = [sc.bomb(4, 8.5, 0.05), sc.bomb(6, 8.5), sc.bomb(8, 8.5), sc.bomb(10, 8.5)];
    sc.run(2);
    const ex = ids.map((id) => sc.log.exploded.find((e) => e.id === id));
    const all = ex.every(Boolean);
    const gaps = all ? ex.slice(1).map((e, k) => +(e.t - ex[k].t).toFixed(3)) : [];
    const chainId = all ? ex[1].chain : -1;
    assert(`bomb chain: 4 bombs in a row all go off, one after the other (gaps ${gaps.join(', ')} s)`, all && gaps.every((g) => g >= 0.1 - 1e-6 && g <= 0.3 + DT + 1e-6));
    assert('bomb chain: the 2nd..4th belong to one chain, 3 generations deep', all && chainId >= 0 && ex.slice(1).every((e) => e.chain === chainId) && ex[3].depth >= 3);
    const info = sc.chain.chainInfo(chainId);
    assert('bomb chain: chainInfo counts its links and started on screen', info && info.fired >= 3 && info.onScreen);
  }

  // ---- a bomb sets off every target kind in its reach ----
  {
    // a low room (floor row 7): the bomb at (17, 5); everything sits in its shove ring (BOMB_RADIUS 2.0 .. 4.0 tiles; tiles and
    // traps 3.2), out of the blast (controls 2026-10-08: the blast is 2.0, so the scene is laid out tighter than for 2.5)
    const rows = room(34, 8);
    rows[3] = rows[3].slice(0, 14) + '==' + rows[3].slice(16); // a timber beam (14..15, 3)
    rows[2] = rows[2].slice(0, 18) + 'B' + rows[2].slice(19);  // a bone block (18, 2)
    const sc = scene(rows);
    const bx = 17, by = 5;
    const rk = sc.hz.add(hzRec(sc, 'rock', 16.5, 1.5));
    const eel = sc.hz.add(hzRec(sc, 'eel', 20.5, 3.5));
    const jet = sc.hz.add(hzRec(sc, 'jet', 13.5, 6.5, 0, -1));
    sc.cr.add({ type: 'creature', ck: CR_GCLAM, x: 14.5, y: 6.5, dx: 0, dy: -1, side: 1, tilt: 0 }); sc.cr.data.state[0] = CL_OPEN; sc.cr.data.ang[0] = 1; sc.cr.data.t[0] = 0;
    sc.cr.add({ type: 'creature', ck: CR_TENTACLE, x: 20.6, y: 6.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    sc.loot.add({ lk: LK_POT, x: 19.6, y: 6.5, dx: 0, dy: -1, n: 2 });
    sc.loot.add({ lk: LK_CLAM, x: 15.3, y: 6.5, dx: 0, dy: -1, n: 2 });
    sc.loot.add({ lk: LK_CHEST, x: 18.8, y: 6.5, dx: 0, dy: -1, n: 4, aux: TRAP_SPIKES });
    sc.octo.x = 10; sc.octo.y = 2; // near enough that the clam stays open (6 tiles), out of the blast (7.6)
    const ok = [rk, eel, jet].every((i) => i >= 0);
    sc.bomb(bx, by, 0.05);
    sc.run(0.06); // the bomb went off
    const t0 = sc.log.exploded.length ? sc.log.exploded[0].t : -1;
    let sawSurge = false, sawRockShake = false, eelAt = -1;
    for (let k = 0; k < 30; k++) { sc.step(); sawSurge ||= sc.hz.data.surge[jet] > 0; sawRockShake ||= sc.hz.data.state[rk] >= 1; if (eelAt < 0 && sc.log.shocks.length) eelAt = sc.log.time - t0; }
    const tgts = new Set(sc.log.links.map((l) => l.target));
    assert('bomb -> hanging boulder: its support is shaken, it rumbles and drops', ok && t0 > 0 && sawRockShake && tgts.has('rock'), [...tgts].join(','));
    assert('bomb -> eel: it discharges early (within half a second, not at its own time)', eelAt > 0 && eelAt < 0.5, 'shock at ' + eelAt);
    assert('bomb -> jet: it surges', sawSurge && tgts.has('jet'));
    assert('bomb -> giant clam: the open clam snaps', sc.log.snaps.some((s) => s.i === 0) && tgts.has('clam'));
    assert('bomb -> tentacle: the dormant tentacle wakes', sc.log.wakes.length >= 1 && tgts.has('tentacle'));
    assert('bomb -> pot and loot clam: both burst (how: chain)', sc.log.breaks.filter((b) => b.how === 'chain').length === 2 && tgts.has('pot'), JSON.stringify(sc.log.breaks));
    assert('bomb -> trapped chest: the trap springs, the chest stays shut and safe', sc.log.traps.length === 1 && sc.loot.data.state[2] === ST_INTACT && sc.loot.data.aux[2] === 0 && tgts.has('trap'));
    assert('bomb -> fragile tiles: the bone block and the timber beam in the shove ring shatter', sc.world.tileAt(18, 2) === 0 && sc.world.tileAt(14, 3) === 0 && sc.world.tileAt(15, 3) === 0 && tgts.has('tile'));
    const first = sc.log.links.filter((l) => l.depth === 1).map((l) => l.t - t0);
    assert('bomb links: each target went off 0.1-0.3 s after the blast (plus the per-step budget)', first.length >= 9 && first.every((t) => t >= 0.1 - DT && t <= 0.3 + DT * 3), first.map((t) => t.toFixed(2)).join(','));
    sc.run(2.5);
    assert('bomb -> boulder: the boulder it shook loose hits the floor, and its impact joins the chain', sc.log.impacts.length === 1 && sc.log.impacts[0].chain >= 0, JSON.stringify(sc.log.impacts));
  }

  // ---- a landing boulder sets off what it lands on, and shakes a boulder near by loose ----
  {
    const sc = scene(room(20, 7)); // a low cave: the ceiling is 4 tiles over the floor
    const r1 = sc.hz.add(hzRec(sc, 'rock', 6.5, 1.5)), r2 = sc.hz.add(hzRec(sc, 'rock', 8.5, 1.5)), r3 = sc.hz.add(hzRec(sc, 'rock', 15.5, 1.5));
    const id = sc.bomb(6.5, 5.5, 99); // r1 comes down on it
    sc.hz.trigger(r1, null); // set off by hand (the octopus's own trigger is the same state change)
    sc.until(() => sc.log.impacts.length >= 1, 3);
    sc.run(0.6);
    const b = sc.log.exploded.find((e) => e.id === id);
    assert('boulder -> bomb: a boulder landing on a lit bomb sets it off', !!b);
    assert('boulder -> boulder: the landing shakes the boulder 2 tiles away loose, not the one 9 tiles away', sc.hz.data.state[r2] >= 1 && sc.hz.data.state[r3] === 0);
    // no bomb this time: the boulder hits the floor right beside a giant clam (a bomb there would have killed the clam first)
    const s2 = scene(room(20, 7), [17.5, 1.5]);
    const q1 = s2.hz.add(hzRec(s2, 'rock', 6.5, 1.5));
    s2.cr.add({ type: 'creature', ck: CR_GCLAM, x: 4.4, y: 5.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    s2.hz.trigger(q1, null);
    s2.until(() => s2.log.impacts.length >= 1, 3);
    s2.run(0.5);
    assert('boulder -> clam: the clam beside where it came down snaps', s2.log.snaps.length >= 1 && s2.log.links.some((l) => l.target === 'clam'), JSON.stringify(s2.log.snaps));
  }

  // ---- a snapping clam startles its neighbour; a spontaneous snap does not ----
  {
    const sc = scene(room(20, 8));
    sc.cr.add({ type: 'creature', ck: CR_GCLAM, x: 5.5, y: 6.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    sc.cr.add({ type: 'creature', ck: CR_GCLAM, x: 7.5, y: 6.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    sc.chain.emit('snap', 5.5, 6.5, null, false, { target: 'clam', i: 0 }); // spontaneous (at the octopus)
    sc.run(0.5);
    const quiet = sc.log.snaps.length === 0;
    sc.chain.emit('bomb', 3.5, 3.5, null, true); // a blast 3.9 tiles from clam 0 and 5.3 from clam 1 (out of its reach)
    sc.run(1);
    const s0 = sc.log.snaps.find((s) => s.i === 0), s1 = sc.log.snaps.find((s) => s.i === 1);
    assert('snap: a clam snapping at the octopus (spontaneous) does not set its neighbour off', quiet);
    assert('snap -> clam: a clam a chain made snap startles the clam beside it, a link later', !!s0 && !!s1 && s1.t - s0.t >= 0.1 && s1.t - s0.t <= 0.35, JSON.stringify(sc.log.snaps));
  }

  // ---- a thrown prop (infighting's 'thrown' hit) smacking a clam makes it snap; a bomb right there stays lit ----
  {
    const sc = scene(room(16, 8));
    sc.cr.add({ type: 'creature', ck: CR_GCLAM, x: 6.5, y: 6.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    const id = sc.bomb(7.2, 6.4, 99);
    sc.chain.emit('thrown', 6.5, 6.3, null, false); // where infight.js reports the hit
    sc.run(0.4);
    assert('thrown -> clam: a thrown thing smacking a giant clam makes it snap, once', sc.log.snaps.filter((x) => x.i === 0).length === 1);
    // the bomb beside the clam does go off, but a link later, from the SNAP (depth 2), never straight from the thrown hit
    assert('thrown: it never sets off a bomb itself (a thrown bomb would set itself off); the snap it caused may',
      triggerReach('thrown', 'bomb') === 0 && !sc.log.links.some((l) => l.target === 'bomb' && l.depth === 1) && sc.log.exploded.some((e) => e.id === id && e.depth === 2));
  }

  // ---- a chained eel shock jumps to the next eel; its own periodic shock does not; any shock sets off a bomb ----
  {
    const sc = scene(room(24, 12));
    const e1 = sc.hz.add(hzRec(sc, 'eel', 5.5, 5.5)), e2 = sc.hz.add(hzRec(sc, 'eel', 8.5, 5.5));
    sc.hz.data.t[e1] = EEL_FIRE_AT - 0.05; sc.hz.data.t[e2] = 0.0; // e1 shocks on its own almost at once
    const id = sc.bomb(5.5, 7.5, 99);
    sc.run(0.5);
    const own = sc.log.shocks.filter((s) => s.i === e1).length, other = sc.log.shocks.filter((s) => s.i === e2).length;
    assert('shock: an eel\'s own shock does not make its neighbour discharge', own === 1 && other === 0);
    assert('shock -> bomb: an eel\'s shock sets off a lit bomb it reaches', sc.log.exploded.some((e) => e.id === id));
    // now e1 is set off by a chain (a far bomb): its shock is chained, so e2 follows
    const sc2 = scene(room(24, 12));
    const a = sc2.hz.add(hzRec(sc2, 'eel', 5.5, 5.5)), b = sc2.hz.add(hzRec(sc2, 'eel', 8.5, 5.5));
    sc2.hz.data.t[a] = 0; sc2.hz.data.t[b] = 0;
    sc2.chain.emit('bomb', 1.5, 5.5, null, true); // 4 tiles from a, 7 from b: only a is in reach
    sc2.run(1);
    const sa = sc2.log.shocks.find((s) => s.i === a), sb = sc2.log.shocks.find((s) => s.i === b);
    assert('shock -> eel: an eel a chain set off passes its shock to the next eel', !!sa && !!sb && sb.t > sa.t && sa.chain >= 0 && sb.chain === sa.chain);
  }

  // ---- the cap, the budget, no loop ----
  {
    const sc = scene(room(40, 24));
    for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) sc.bomb(4 + x * 1.5, 4 + y * 1.5, x === 0 && y === 0 ? 0.05 : 99);
    let maxPending = 0;
    for (let k = 0; k < 250; k++) { sc.step(); maxPending = Math.max(maxPending, sc.chain.queue.n); }
    const chains = new Map();
    for (const e of sc.log.exploded) if (e.chain >= 0) chains.set(e.chain, (chains.get(e.chain) || 0) + 1);
    const st = sc.chain.stats;
    const perChainOk = [...chains.keys()].every((c) => { const i = sc.chain.chainInfo(c); return !i || i.links <= CHAIN_MAX_LINKS; });
    assert(`cap: a 40-bomb pile: no chain queues more than ${CHAIN_MAX_LINKS} links, none goes deeper than ${CHAIN_MAX_DEPTH}`, perChainOk && st.maxDepth <= CHAIN_MAX_DEPTH && (st.capped > 0 || sc.log.exploded.length <= CHAIN_MAX_LINKS + 1), JSON.stringify({ exploded: sc.log.exploded.length, capped: st.capped, maxDepth: st.maxDepth }));
    assert(`budget: at most ${CHAIN_BUDGET} links fire in one step`, st.maxFiredPerStep <= CHAIN_BUDGET && st.maxFiredPerStep >= 1);
    assert('cap: the queue drains (the chain ends)', sc.chain.queue.n === 0 && maxPending > 0);
    // no loop: two clams and two eels side by side, set off by a chain: each goes off once in that chain, and the chain ends
    const s2 = scene(room(24, 12));
    s2.cr.add({ type: 'creature', ck: CR_GCLAM, x: 6.5, y: 10.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    s2.cr.add({ type: 'creature', ck: CR_GCLAM, x: 8.5, y: 10.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    const ea = s2.hz.add(hzRec(s2, 'eel', 6.5, 5.5)), eb = s2.hz.add(hzRec(s2, 'eel', 9.5, 5.5));
    s2.hz.data.t[ea] = 0; s2.hz.data.t[eb] = 0;
    const c0 = s2.chain.emit('bomb', 7.5, 7.5, null, true);
    s2.run(3);
    const linksOfC0 = s2.log.links.filter((l) => l.chain === c0);
    const keys = linksOfC0.map((l) => l.target + ':' + Math.round(l.x * 2) + ',' + Math.round(l.y * 2));
    assert('no loop: in one chain every clam and eel goes off once, and the chain stops', keys.length === new Set(keys).size && keys.length >= 4 && s2.chain.queue.n === 0, keys.join(' '));
  }

  // ---- the off-screen rule ----
  {
    const sc = scene(room(60, 12));
    const cam = { x: 10, y: 6, pxPerUnit: 40 }; // view 16 x 10 tiles: x 2..18
    setGameView(cam, 640, 400);
    const on = sc.bomb(16, 9.5, 99), off = sc.bomb(19.5, 9.5, 99); // 19.5 is off screen (> 18.5 with the margin)
    sc.chain.emit('bomb', 17.5, 9.5, null, true); // started on screen: it may reach the bomb off screen
    sc.run(0.5);
    assert('off-screen: a chain that started on screen sets off a bomb just off screen', sc.log.exploded.some((e) => e.id === off) && sc.log.exploded.some((e) => e.id === on));
    const s2 = scene(room(60, 12));
    setGameView(cam, 640, 400);
    const far1 = s2.bomb(40, 9.5, 99), near = s2.bomb(17.5, 9.5, 99);
    s2.chain.emit('bomb', 41.5, 9.5, null, true); // started off screen: the bomb next to it (off screen) stays put
    s2.chain.emit('bomb', 19.4, 9.5, null, true); // started off screen: a target ON screen may still go off (within the 2.0 bomb reach)
    s2.run(0.5);
    assert('off-screen: a chain that started off screen sets off nothing off screen', !s2.log.exploded.some((e) => e.id === far1) && s2.chain.stats.offscreen >= 1);
    assert('off-screen: ... but it may set off a target on screen', s2.log.exploded.some((e) => e.id === near));
    resetGameView();
  }

  // ---- states the adapters refuse ----
  {
    const sc = scene(room(16, 8));
    sc.cr.add({ type: 'creature', ck: CR_GCLAM, x: 5.5, y: 6.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    sc.cr.data.state[0] = CL_SNAP;
    const t1 = sc.cr.trigger(0, null);
    sc.cr.data.state[0] = CL_SHUT;
    const t2 = sc.cr.trigger(0, null);
    sc.cr.add({ type: 'creature', ck: CR_TENTACLE, x: 10.5, y: 6.5, dx: 0, dy: -1, side: 1, tilt: 0 });
    const t3 = sc.cr.trigger(1, null), st3 = sc.cr.data.state[1];
    const t4 = sc.cr.trigger(1, null);
    assert('adapters: a clam already snapping is not set off again; a shut one clacks; a tentacle wakes once',
      !t1 && t2 && sc.cr.data.state[0] === CL_SNAP && t3 && st3 === TN_WAKE && !t4, JSON.stringify({ t1, t2, t3, t4 }));
    const jet = sc.hz.add(hzRec(sc, 'jet', 8.5, 6.5, 0, -1));
    sc.hz.trigger(jet, null);
    const s0 = sc.hz.data.surge[jet];
    sc.run(JET_SURGE_T + 0.1);
    assert('adapters: a jet surge runs out', s0 > 0 && sc.hz.data.surge[jet] === 0);
    assert('adapters: the tentacle the chain woke curls back up (the octopus is not there)', sc.cr.data.state[1] !== TN_WAKE);
  }
}
