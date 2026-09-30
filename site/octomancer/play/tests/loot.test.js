// Round 31: loot and secrets (js/loot.js) on small hand-made worlds, the placement through the pattern table on
// real levels, the journal entries, and the round-30 fix that nothing can hurt an idle octopus at the start.
import {
  createLoot, makeLootRecord, spreadShells, lootJournalId, LOOT_NAMES,
  LK_CLAM, LK_POT, LK_CHEST, LK_POCKET, LK_RELIC,
  TRAP_SPIKES, TRAP_SWARM, POCKET_SHELLS, POCKET_BOMB, POCKET_HEART,
  SPIKE_RATTLE, SPIKE_RADIUS, RELIC_SHELLS, CHASE_SECONDS, ST_DONE,
} from '../js/loot.js';
import { createOctopus } from '../js/octopus.js';
import { createBombs } from '../js/bomb.js';
import { createEnemies } from '../js/enemies.js';
import { createHazards } from '../js/hazards.js';
import { createLevelWorld } from '../js/world-v2.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { generateLevel, setDefaultBank, LEVEL_W, LEVEL_H } from '../js/level.js';
import { createRoomBank } from '../js/rooms.js';
import { ENTRIES, CATEGORIES, CAT_LOOT } from '../js/journal.js';
import { DASH_KILL_SPEED, BOMB_RADIUS, HEART_MAX } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { drawLoot } from '../js/loot-draw.js';
import { drawHazards } from '../js/hazards-draw.js';
import { loadBiome1Json } from './biome1.test.js';

const DT = 0.02;

/** Fake world from rows ('#' rock): tileAt / isSolid / breakTile, enough for loot.js and bomb.js. */
function fake(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  const world = {
    w, h, tiles,
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
    breakTile(x, y) { x = Math.floor(x); y = Math.floor(y); if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1 || tiles[y * w + x] === 0) return false; tiles[y * w + x] = 0; return true; },
  };
  return world;
}
const ROOM = ['####################', '#..................#', '#..................#', '#..................#', '#..................#', '#..................#', '#..................#', '####################'];
const rng = (seed = 5) => mulberry32(seed);
const rec = (name, x, y, seed = 5, relic = true) => makeLootRecord(name, x, y, 0, -1, rng(seed), relic);
function setup(name, x, y, ox, oy, seed = 5, mod = null) {
  const world = fake(ROOM);
  const loot = createLoot();
  const r = rec(name, x, y, seed);
  if (mod) mod(r);
  loot.add(r);
  const octo = createOctopus(ox, oy);
  return { world, loot, octo, r };
}
function steps(s, n, each) {
  const evs = [];
  for (let i = 0; i < n; i++) {
    each && each(i);
    s.loot.update(DT, s.octo, s.world, null);
    for (const e of s.loot.takeEvents()) evs.push(e);
    if (s.octo.invulnTimer > 0) s.octo.invulnTimer = Math.max(0, s.octo.invulnTimer - DT);
  }
  return evs;
}

export async function runLootTests(assert) {
  // ---- records ----
  {
    let clamOk = 0, potOk = 0, chestShells = 0, traps = 0, chests = 0, potShellsSeen = new Set();
    const r = rng(11);
    for (let i = 0; i < 400; i++) {
      const c = makeLootRecord('clam', 1.5, 1.5, 0, -1, r), p = makeLootRecord('pot', 1.5, 1.5, 0, -1, r), ch = makeLootRecord('chest', 1.5, 1.5, 0, -1, r);
      if (c.n >= 1 && c.n <= 3) clamOk++;
      if (p.n >= 1 && p.n <= 3) potOk++;
      potShellsSeen.add(p.n);
      if (ch.n >= 4 && ch.n <= 6) chestShells++;
      chests++; if (ch.aux !== 0) traps++;
    }
    assert('loot records: clams and pots drop 1-3 shells, every count turns up', clamOk === 400 && potOk === 400 && potShellsSeen.size === 3);
    assert('loot records: chests hold 4-6 shells and about 30% are trapped (' + traps + '/' + chests + ')', chestShells === 400 && traps > 80 && traps < 160);
    const kinds = new Set(); const r2 = rng(3);
    for (let i = 0; i < 200; i++) { const t = makeLootRecord('chest', 1.5, 1.5, 0, -1, r2); if (t.aux) kinds.add(t.aux); }
    assert('loot records: a trap is either a spike burst or a piranha swarm', kinds.has(TRAP_SPIKES) && kinds.has(TRAP_SWARM) && kinds.size === 2);
    const pk = new Set(); const r3 = rng(4);
    for (let i = 0; i < 200; i++) { const t = makeLootRecord('pocket', 1.5, 1.5, -1, 0, r3); pk.add(t.aux); if (t.aux === POCKET_SHELLS && (t.n < 2 || t.n > 3)) pk.add(-1); }
    assert('loot records: a pocket holds shells or an item (bomb or heart)', pk.has(POCKET_SHELLS) && pk.has(POCKET_BOMB) && pk.has(POCKET_HEART) && !pk.has(-1));
    assert('loot records: no relic record on a level without one; a relic is worth 25', makeLootRecord('relic', 1.5, 1.5, 0, -1, rng(), false) === null && makeLootRecord('relic', 1.5, 1.5, 0, -1, rng(), true).n === RELIC_SHELLS && RELIC_SHELLS === 25);
    assert('loot records: shells drop spread out, n positions each', spreadShells(3, 5, 5).length === 3 && new Set(spreadShells(3, 5, 5).map((p) => p.x)).size === 3);
  }

  // ---- clams and pots: break by dash or bomb ----
  {
    for (const name of ['clam', 'pot']) {
      const s = setup(name, 6.5, 6.5, 6.5, 6.5);
      s.octo.vx = 2;
      const slow = steps(s, 10);
      assert(`${name}: swimming into it slowly does nothing`, slow.length === 0 && s.loot.data.state[0] === 0);
      s.octo.vx = DASH_KILL_SPEED + 3; s.octo.vy = 0;
      const ev = steps(s, 1);
      assert(`${name}: a dash through it breaks it and drops ${s.r.n} shell(s) (1-3)`, ev.length === 1 && ev[0].type === 'break' && ev[0].shells === s.r.n && s.r.n >= 1 && s.r.n <= 3 && s.loot.data.state[0] === ST_DONE && ev[0].how === 'dash');
      assert(`${name}: once broken it stays broken`, steps(s, 5).length === 0);
    }
    const b = setup('clam', 6.5, 6.5, 2.5, 2.5);
    b.loot.explode(6.5 + BOMB_RADIUS + 0.5, 6.5);
    assert('clam: a bomb outside the blast radius leaves it', b.loot.takeEvents().length === 0);
    b.loot.explode(6.5 + BOMB_RADIUS - 0.5, 6.5);
    const evs = b.loot.takeEvents();
    assert('clam: a bomb inside the blast radius breaks it (shells drop)', evs.length === 1 && evs[0].type === 'break' && evs[0].how === 'bomb' && evs[0].shells >= 1);
    // through the real bomb module
    const w = fake(ROOM), loot = createLoot(), bombs = createBombs();
    loot.add(rec('pot', 10.5, 6.5));
    const o = createOctopus(3.5, 3.5);
    bombs.place(o, 9.5, 6.5);
    for (let i = 0; i < 90; i++) {
      bombs.update(DT, w, o, { killInRadius() { return 0; } });
      for (const ev of bombs.events) if (ev.type === 'exploded') loot.explode(ev.x, ev.y, BOMB_RADIUS);
    }
    assert('pot: a real bomb explosion (bomb.js) breaks it', loot.takeEvents().some((e) => e.type === 'break' && e.lk === LK_POT));
    const dead = setup('clam', 6.5, 6.5, 6.5, 6.5); dead.octo.vx = 12; dead.octo.dead = true;
    assert('clam: a dead octopus breaks nothing', steps(dead, 3).length === 0);
  }

  // ---- chests ----
  {
    const plain = setup('chest', 6.5, 6.5, 6.5, 6.5, 5, (r) => { r.aux = 0; r.n = 5; });
    const ev = steps(plain, 3);
    assert('chest: swimming into it opens it once for its shells (4-6)', ev.filter((e) => e.type === 'chest').length === 1 && ev[0].shells === 5 && ev.every((e) => e.type === 'chest') && plain.octo.hearts === 3);
    const far = setup('chest', 6.5, 6.5, 12.5, 6.5, 5, (r) => { r.aux = 0; });
    assert('chest: stays shut while nobody touches it', steps(far, 20).length === 0 && far.loot.data.state[0] === 0);

    // spike trap: rattle, then a burst that hurts whoever is still close
    const sp = setup('chest', 6.5, 6.5, 6.5, 6.5, 5, (r) => { r.aux = TRAP_SPIKES; r.n = 4; });
    const e1 = steps(sp, 1);
    assert('trap (spikes): opening it does not hurt at once (a short rattle first)', e1.some((e) => e.type === 'chest' && e.trap === TRAP_SPIKES) && sp.octo.hearts === 3 && sp.loot.data.state[0] === 2);
    const e2 = steps(sp, Math.ceil(SPIKE_RATTLE / DT) + 2);
    assert('trap (spikes): the burst costs a heart when the octopus stays put', e2.some((e) => e.type === 'trap' && e.trap === TRAP_SPIKES) && sp.octo.hearts === 2 && e2.some((e) => e.type === 'hurt'));
    steps(sp, 40);
    assert('trap (spikes): the burst ends and the chest is spent', sp.loot.data.state[0] === ST_DONE);
    const esc = setup('chest', 6.5, 6.5, 6.5, 6.5, 5, (r) => { r.aux = TRAP_SPIKES; });
    steps(esc, 1);
    esc.octo.x = 6.5 + SPIKE_RADIUS + 1.2;
    const e3 = steps(esc, Math.ceil(SPIKE_RATTLE / DT) + 4);
    assert('trap (spikes): swimming clear during the rattle avoids the burst', e3.some((e) => e.type === 'trap') && esc.octo.hearts === 3);

    // piranha swarm
    const sw = setup('chest', 6.5, 6.5, 6.5, 6.5, 5, (r) => { r.aux = TRAP_SWARM; });
    const e4 = steps(sw, 2);
    const trap = e4.find((e) => e.type === 'trap');
    assert('trap (swarm): opening it asks for a swarm of 3 piranhas at the chest', trap && trap.trap === TRAP_SWARM && trap.n === 3 && Math.abs(trap.x - 6.5) < 1 && sw.octo.hearts === 3);
    // the swarm is three real piranhas
    const en = createEnemies();
    for (let k = 0; k < trap.n; k++) en.spawnAt('piranha', trap.x + (k - 1) * 0.6, trap.y, 'open', 0);
    assert('trap (swarm): the enemies module spawns them as piranhas', en.all().filter((e) => e.kind === 'piranha').length === 3);
  }

  // ---- hidden pocket: a rock tile with loot, revealed by a bomb ----
  {
    const rows = ['####################', '#..####............#', '#..####............#', '#..####............#', '#..####............#', '####################'];
    for (const [content, label] of [[POCKET_SHELLS, 'shells'], [POCKET_BOMB, 'a bomb'], [POCKET_HEART, 'a heart']]) {
      const world = fake(rows), loot = createLoot(), bombs = createBombs();
      const r = makeLootRecord('pocket', 5.5, 2.5, -1, 0, rng(2));
      r.aux = content; r.n = content === POCKET_SHELLS ? 3 : 0;
      loot.add(r);
      const octo = createOctopus(2.5, 2.5);
      octo.hearts = content === POCKET_HEART ? 1 : HEART_MAX;
      const b0 = octo.bombs;
      let evs = [];
      for (let i = 0; i < 20; i++) { loot.update(DT, octo, world, null); evs = evs.concat(loot.takeEvents()); }
      assert(`pocket (${label}): sealed rock stays hidden until something breaks it`, evs.length === 0 && loot.data.state[0] === 0 && world.tileAt(5, 2) === 1);
      octo.bombs = Math.max(octo.bombs, 1);
      bombs.place(octo, 3.5, 2.5);
      for (let i = 0; i < 90; i++) { bombs.update(DT, world, { ...octo, x: 0, y: 0, dead: true }, { killInRadius() { return 0; } }); loot.update(DT, octo, world, null); evs = evs.concat(loot.takeEvents()); }
      const pk = evs.find((e) => e.type === 'pocket');
      assert(`pocket (${label}): a bomb from the nearby cave (2 tiles away) breaks the tile and reveals ${label}`, world.tileAt(5, 2) === 0 && pk && (content === POCKET_SHELLS ? pk.shells === 3 : pk.item === content));
      if (content !== POCKET_SHELLS) {
        octo.x = 5.5; octo.y = 2.5;
        const before = [octo.bombs, octo.hearts];
        loot.update(DT, octo, world, null);
        const it = loot.takeEvents().find((e) => e.type === 'item');
        assert(`pocket (${label}): swimming onto the item takes it`, it && it.item === content && (content === POCKET_BOMB ? octo.bombs === before[0] + 1 : octo.hearts === before[1] + 1));
      }
    }
    const full = setup('pocket', 5.5, 2.5, 5.5, 2.5, 5, (r) => { r.aux = POCKET_HEART; });
    full.world.tiles[2 * full.world.w + 5] = 0;
    steps(full, 2);
    assert('pocket: a heart is left lying while the hearts are full', full.loot.data.itaken[0] === 0 && full.octo.hearts === HEART_MAX);
  }

  // ---- relic and the rock chase ----
  {
    const s = setup('relic', 6.5, 6.5, 12.5, 4.5);
    assert('relic: nothing happens while nobody takes it', steps(s, 30).length === 0 && s.loot.chaseLeft() === 0);
    s.octo.x = 6.5; s.octo.y = 6.5;
    const first = steps(s, 1);
    const relic = first.find((e) => e.type === 'relic');
    assert('relic: taking it pays 25 shells and starts a 10 second chase', relic && relic.shells === 25 && first.some((e) => e.type === 'chaseStart') && Math.abs(s.loot.chaseLeft() - CHASE_SECONDS) < 0.05 && CHASE_SECONDS === 10);
    assert('relic: it can only be taken once', steps(s, 5).every((e) => e.type !== 'relic'));
    let spawned = 0, landed = 0, hurt = 0, maxRocks = 0, warned = 0;
    const evs = [];
    let t = 0;
    while (s.loot.chaseLeft() > 0 && t < 12) {
      for (const e of steps(s, 1, () => { s.octo.x = 6.5; s.octo.y = 6.5; s.octo.vx = s.octo.vy = 0; })) evs.push(e);
      const d = s.loot.data;
      maxRocks = Math.max(maxRocks, d.nr);
      for (let i = 0; i < d.nr; i++) if (d.rstate[i] === 1) warned++;
      t += DT;
    }
    landed = evs.filter((e) => e.type === 'rockLanded').length; hurt = evs.filter((e) => e.type === 'hurt').length;
    assert(`relic chase: rocks fall for about 10 s (ran ${t.toFixed(1)} s, ${landed} landed, ${hurt} hit an octopus that stood still, peak ${maxRocks} in the air)`, t >= 9.8 && t <= 10.3 && landed >= 5 && maxRocks >= 1 && hurt >= 1);
    assert('relic chase: each rock shows a warning (dust at the ceiling) before it drops', warned > 10);
    assert('relic chase: the octopus lost hearts to the rocks it ignored', s.octo.hearts < 3);
    assert('relic chase: the end is announced', evs.some((e) => e.type === 'chaseEnd') || s.loot.takeEvents().some((e) => e.type === 'chaseEnd'));
    steps(s, 120);
    assert('relic chase: no new rocks after it ends, and none left flying', s.loot.data.nr === 0 && s.loot.chaseLeft() === 0);
    // a moving octopus can dodge: sideways at swim speed
    const m = setup('relic', 6.5, 6.5, 6.5, 6.5);
    steps(m, 1);
    let dir = 1;
    steps(m, Math.round(10 / DT), (i) => { m.octo.vx = dir * 3; m.octo.x += dir * 3 * DT; if (m.octo.x > 16) dir = -1; if (m.octo.x < 3) dir = 1; m.octo.y = 6.5; });
    assert('relic chase: rocks fall where the octopus is heading and only tiles of open water land them (no tile changes)', m.world.tiles.every((v, i) => v === fake(ROOM).tiles[i]));
  }

  // ---- chunk loading and sightings ----
  {
    const w = fake(ROOM);
    const loot = createLoot();
    const chunk = { spawns: [{ type: 'loot', ...rec('clam', 4.5, 6.5) }, { type: 'enemy-slot', x: 1, y: 1 }, { type: 'hazard', hk: 5, x: 1, y: 1 }] };
    const octo = createOctopus(4.5, 4.5);
    loot.update(DT, octo, w, [{ index: 0, chunk }]);
    loot.update(DT, octo, w, [{ index: 0, chunk }]);
    assert('loot: only loot records load, and a chunk loads once', loot.count() === 1 && loot.data.kind[0] === LK_CLAM);
    const seen = loot.seen(4.5, 4.5, 9, (x, y) => w.isSolid(x, y));
    assert('loot: seen() reports the kinds in view for the journal', seen.length === 1 && seen[0] === LK_CLAM);
    const hidden = createLoot(); hidden.add(makeLootRecord('pocket', 4.5, 4.5, -1, 0, rng()));
    assert('loot: an unrevealed pocket is not reported as seen', hidden.seen(3, 3, 9, () => false).length === 0);
  }

  // ---- journal ----
  {
    const ids = ['clam', 'pot', 'chest', 'pocket', 'relic'].map((n) => 'loot-' + n);
    const found = ids.map((id) => ENTRIES.find((e) => e.id === id));
    assert('journal: clam, pot, chest, hidden pocket and relic each have an entry in a Loot category',
      found.every((e) => e && e.cat === CAT_LOOT && e.name && e.text.length > 40) && CATEGORIES.includes(CAT_LOOT) && [1, 2, 3, 4, 5].every((c) => lootJournalId(c) === ids[c - 1]) && LOOT_NAMES.length === 6);
  }

  // ---- placement on real levels (pattern table) ----
  setDefaultBank(createRoomBank(await loadBiome1Json()));
  {
    const NS = 30;
    const tot = { clam: 0, pot: 0, chest: 0, pocket: 0, relic: 0 };
    let maxChest = 0, relicLevels = 0, levels = 0, tileBad = 0, pocketBad = 0, trapped = 0, chests = 0, startBad = 0, unbrokenPocket = 0;
    const perLvl = [0, 0, 0];
    for (let s = 0; s < NS; s++) {
      for (let lv = 0; lv < 3; lv++) {
        const seed = 7001 + s * 53;
        const L = generateLevel(seed, lv);
        const sp = buildLevelSpawns(L, seed, lv).spawns.filter((r) => r.type === 'loot');
        levels++;
        let c = 0, rel = 0;
        for (const r of sp) {
          const name = LOOT_NAMES[r.lk];
          tot[name]++;
          const tx = Math.floor(r.x), ty = Math.floor(r.y);
          const t = L.tiles[ty * LEVEL_W + tx];
          if (name === 'pocket') {
            const wx = tx + r.dx * 2, wy = ty + r.dy * 2;
            if (t === 0 || L.tiles[wy * LEVEL_W + wx] !== 0) pocketBad++;
          } else if (t !== 0 || L.tiles[(ty + 1) * LEVEL_W + tx] === 0) tileBad++;
          if (Math.hypot(r.x - L.startX - 0.5, r.y - L.startY - 0.5) < 7) startBad++;
          if (name === 'chest') { c++; chests++; if (r.aux) trapped++; }
          if (name === 'relic') rel++;
        }
        perLvl[lv] += sp.length;
        maxChest = Math.max(maxChest, c);
        if (rel) relicLevels++;
        if (rel > 1) tileBad++;
      }
    }
    assert(`placement: every kind turns up across ${levels} levels (${JSON.stringify(tot)})`, Object.values(tot).every((n) => n > 0));
    assert(`placement: at most 3 chests in a level (max ${maxChest})`, maxChest <= 3);
    assert(`placement: a relic in about 1 in 3 levels (${relicLevels}/${levels}) and never two`, relicLevels / levels > 0.15 && relicLevels / levels < 0.45);
    assert(`placement: clams, pots, chests and the relic stand on a floor in open water; a pocket is a rock tile with water 2 tiles away (${tileBad}/${pocketBad})`, tileBad === 0 && pocketBad === 0);
    assert(`placement: loot stays out of the start safe radius (${startBad}); about 30% of chests are trapped (${trapped}/${chests})`, startBad === 0 && (chests < 10 || (trapped / chests > 0.12 && trapped / chests < 0.5)));
    assert(`placement: deterministic per seed and level`, (() => {
      const L = generateLevel(7001, 2);
      const a = buildLevelSpawns(L, 7001, 2).spawns.filter((r) => r.type === 'loot').map((r) => r.lk + ':' + r.x + ',' + r.y + ',' + r.n + ',' + r.aux).join(';');
      const b = buildLevelSpawns(L, 7001, 2).spawns.filter((r) => r.type === 'loot').map((r) => r.lk + ':' + r.x + ',' + r.y + ',' + r.n + ',' + r.aux).join(';');
      return a === b && a.length > 0;
    })());
  }


  // ---- drawing: every loot kind and state, and the hazard fixes (eel ring clipped at rock, spike plate inset) ----
  {
    const calls = { lineTo: 0, rect: 0 };
    const grad = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : (...a) => { if (k in calls) calls[k]++; t.last = [k, a]; }),
      set: () => true,
    });
    const cam = { x: 6.5, y: 4.5, pxPerUnit: 60 };
    let threw = '';
    try {
      const l = createLoot();
      for (const n of ['clam', 'pot', 'chest', 'pocket', 'relic']) l.add(makeLootRecord(n, 6.5, 4.5, 0, -1, rng(), true));
      l.add({ ...makeLootRecord('chest', 7.5, 4.5, 0, -1, rng()), aux: TRAP_SPIKES });
      drawLoot(ctx, cam, 800, 600, l.data, 1);
      l.data.state[5] = 2; drawLoot(ctx, cam, 800, 600, l.data, 1); l.data.state[5] = 3; l.data.t[5] = 0.3; drawLoot(ctx, cam, 800, 600, l.data, 1);
      l.data.ni = 2; l.data.ikind[0] = 1; l.data.ikind[1] = 2; l.data.ix[0] = l.data.ix[1] = 6.5; l.data.iy[0] = l.data.iy[1] = 4.5;
      l.data.nr = 2; l.data.rstate[0] = 1; l.data.rt[0] = 0.3; l.data.rstate[1] = 2; l.data.rx[0] = l.data.rx[1] = 6.5; l.data.ry[0] = l.data.ry[1] = 4;
      drawLoot(ctx, cam, 800, 600, l.data, 2);
    } catch (e) { threw = String(e); }
    assert('draw: every loot kind, trap state, item and chase rock draws without error' + threw, threw === '');
    // eel ring: rows of rock on the right of the eel stop the ring there
    const rows = ['##########', '#........#', '#........#', '#...#..###', '#........#', '##########'];
    const hz = createHazards();
    hz.add({ type: 'hazard', hk: 4, x: 4.5, y: 2.5, dx: 0, dy: 0, len: 1, y0: 1.6, y1: 3.4 });
    hz.data.r[0] = 1.6;
    const solid = (x, y) => x < 0 || y < 0 || x >= 10 || y >= 6 || rows[y][x] === '#';
    const moves = [];
    const rec2 = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : (...a) => { moves.push([k, a]); }), set: () => true });
    drawHazards(rec2, { x: 4.5, y: 2.5, pxPerUnit: 50 }, 600, 400, hz.data, 1, solid);
    const count = (arr) => arr.filter((m) => m[0] === 'moveTo').length;
    const clipped = count(moves);
    moves.length = 0;
    drawHazards(rec2, { x: 4.5, y: 2.5, pxPerUnit: 50 }, 600, 400, hz.data, 1, () => false);
    assert(`draw: the eel ring breaks into pieces where rock stands in its way (${clipped} pieces with rock vs ${count(moves)} without)`, clipped > count(moves));
    // spike strip at a convex corner: the plate is inset
    const plates = [];
    const rec3 = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : (...a) => { if (k === 'rect') plates.push(a); }), set: () => true });
    const hz2 = createHazards(); hz2.add({ type: 'hazard', hk: 2, x: 2.5, y: 2.5, dx: 0, dy: -1, len: 3 });
    const floorRock = (x, y) => y >= 3 && x >= 1 && x < 4; // rock under the strip, ending exactly at both ends (a ledge)
    drawHazards(rec3, { x: 2.5, y: 2.5, pxPerUnit: 100 }, 600, 400, hz2.data, 0, (x, y) => floorRock(x, y));
    const snug = [];
    const rec4 = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : (...a) => { if (k === 'rect') snug.push(a); }), set: () => true });
    drawHazards(rec4, { x: 2.5, y: 2.5, pxPerUnit: 100 }, 600, 400, hz2.data, 0, (x, y) => y >= 3);
    assert(`draw: a spike plate that ends at a convex ledge corner is shorter than one on continuous rock (${plates[0] && plates[0][3].toFixed(0)} vs ${snug[0] && snug[0][3].toFixed(0)} px)`, plates.length === 1 && snug.length === 1 && plates[0][3] < snug[0][3] - 30);
  }

  // ---- round-30 fix: an idle octopus at the start keeps all its hearts for 5 s on every Shallows level ----
  {
    const SEEDS = 14;
    let bad = '', sims = 0;
    for (let s = 0; s < SEEDS; s++) {
      for (let lv = 0; lv < 3; lv++) {
        const seed = 13 + s * 97;
        const world = createLevelWorld(seed, lv);
        const octo = createOctopus(world.startX, world.startY);
        const en = createEnemies(), hz = createHazards(), loot = createLoot();
        const res = world.residentChunks();
        for (let i = 0; i < 250; i++) {
          en.update(DT, i * DT, octo, world, res);
          hz.update(DT, i * DT, octo, world, res);
          loot.update(DT, octo, world, res);
          if (octo.invulnTimer > 0) octo.invulnTimer = Math.max(0, octo.invulnTimer - DT);
        }
        sims++;
        if (octo.hearts !== 3) bad += ` seed${seed}/1-${lv + 1}:${octo.hearts}`;
      }
    }
    assert(`start: an idle octopus keeps 3 hearts for 5 s on every Shallows level (${sims} levels)` + bad, bad === '');
  }
}
