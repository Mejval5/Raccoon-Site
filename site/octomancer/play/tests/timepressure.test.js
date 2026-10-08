// Time pressure (2026-10-08): the Beholder as Spelunky's ghost (beholder.js: warning, entry off screen, a slow drift
// through rock, a kill on touch, safe rooms exempt) and the Swift Current bonus (swift.js: target time, the moon shell,
// the journal count that survives a reload).
import {
  beholderTiming, beholderSpeed, planBeholderEntry, BEHOLDER_SPAWN_DIST, BEHOLDER_MIN_DIST, BEHOLDER_DRIFT_MAX,
} from '../js/beholder.js';
import { createEnemies } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { SWIM_MAX_SPEED } from '../js/config.js';
import { createRun, isSafeState, S_HUB, S_TUTORIAL, S_REST, S_BIOME } from '../js/run.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, LEVEL_W, LEVEL_H } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { loadRoomsJson } from './rooms.test.js';
import { swimDistance, swiftTarget, swiftLabel, createSwift, stepSwift, swiftOpen, SWIFT_NEAR, SWIFT_MIN, SWIFT_MAX } from '../js/swift.js';
import { SK_MOON, SK_PEARL, SHELL_VALUE, SHELL_NAMES, MOON_VALUE } from '../js/shells.js';
import { createPickups } from '../js/pickups.js';
import { createJournal, itemId, STAT_COLLECTED, ENTRIES } from '../js/journal.js';
import { getJournalIds, saveJournalIds, getJournalStats, saveJournalStats, recordDive, getMeta, _resetForTests } from '../js/save.js';
import { statsRows } from '../js/runstats.js';

const DT = 0.02;
const OPEN = { isSolid: () => false };

/** A walled box world: solid outside [0,w)x[0,h) and wherever `solid(x, y)` says. */
function box(w, h, solid = () => false) {
  return { width: w, height: h, isSolid: (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx < 0 || ty < 0 || tx >= w || ty >= h || solid(tx, ty); } };
}

export async function runTimePressureTests(assert) {
  // ---------------------------------------------------------------- the clock, per depth
  {
    const t1 = beholderTiming(0), t2 = beholderTiming(1), t3 = beholderTiming(2);
    assert('time pressure: 1-1 warns at 2:00 and the Beholder enters at 2:30 (Spelunky)', t1.warn === 120 && t1.arrive === 150);
    assert('time pressure: deeper levels come sooner (1-2 at 2:20, 1-3 at 2:10), always 30 s of warning',
      t2.arrive === 140 && t3.arrive === 130 && t2.warn === 110 && t3.warn === 100);
    assert('time pressure: it drifts a little faster deeper, and always slower than a plain swim',
      t2.drift > t1.drift && t3.drift > t2.drift && beholderSpeed(t3, 1000) === BEHOLDER_DRIFT_MAX && BEHOLDER_DRIFT_MAX < SWIM_MAX_SPEED && t1.drift < SWIM_MAX_SPEED / 3);
  }

  // ---------------------------------------------------------------- warning and arrival timing
  for (const li of [0, 1, 2]) {
    const tm = beholderTiming(li);
    const o = createOctopus(50, 50);
    const en = createEnemies();
    en.setBeholderTiming(tm);
    const warnAt = [], spawnAt = [];
    let stateBefore = -1, pMid = -1;
    for (let t = 0; t <= tm.arrive + 1; t = Math.round((t + DT) * 1000) / 1000) {
      en.update(DT, t, o, OPEN, []);
      for (const ev of en.events) { if (ev.type === 'beholderWarn') warnAt.push(t); if (ev.type === 'beholderSpawned') spawnAt.push(t); }
      if (Math.abs(t - (tm.warn - 0.5)) < 1e-6) stateBefore = en.beholderWarn().state;
      if (Math.abs(t - (tm.warn + tm.arrive) / 2) < 1e-6) pMid = en.beholderWarn().p;
      o.x = 50; o.y = 50; // keep it still (the Beholder may reach it after the entry)
    }
    assert(`time pressure 1-${li + 1}: calm before the warning, one warning at ${tm.warn} s, one entry at ${tm.arrive} s (got ${warnAt.join()} / ${spawnAt.join()})`,
      stateBefore === 0 && warnAt.length === 1 && Math.abs(warnAt[0] - tm.warn) < DT && spawnAt.length === 1 && Math.abs(spawnAt[0] - tm.arrive) < DT);
    assert(`time pressure 1-${li + 1}: the warning builds through its 30 s (p ${pMid.toFixed(2)} halfway) and reads 'here' after`, Math.abs(pMid - 0.5) < 0.02 && en.beholderWarn().state === 2 && en.beholderWarn().p === 1);
  }

  // ---------------------------------------------------------------- no clock in the hub, tutorial or rest grotto
  {
    let bad = 0;
    for (const st of [S_HUB, S_TUTORIAL, S_REST]) {
      const run = createRun(1, { rest: true }); run.state = st;
      const o = createOctopus(10, 10), en = createEnemies();
      for (let i = 0; i < 400 * 50; i += 10) { // 400 s of play, the way main.js feeds the clock (0 in a safe state)
        en.update(DT, isSafeState(run) ? 0 : i * DT, o, OPEN, []);
        if (en.beholder() || en.beholderWarn().state !== 0 || en.events.length) { bad++; break; }
      }
    }
    const run = createRun(1, {}); run.state = S_BIOME;
    assert('time pressure: hub, tutorial and the rest grotto are safe: no warning and no Beholder after 400 s', bad === 0 && isSafeState({ state: S_REST }) && !isSafeState(run));
  }

  // ---------------------------------------------------------------- never on top of you: entry distance on real levels
  {
    setDefaultBank(createRoomBank(await loadRoomsJson()));
    let total = 0, near = 0, minD = Infinity, onScreen = 0;
    for (const [seed, lvl] of [[3, 0], [7, 1], [11, 2], [6, 0], [42, 1]]) {
      const world = createLevelWorld(seed, lvl);
      for (let y = 1; y < LEVEL_H - 1; y += 3) for (let x = 1; x < LEVEL_W - 1; x += 3) {
        if (world.isSolid(x + 0.5, y + 0.5)) continue;
        for (const pref of [0, 1]) {
          const p = planBeholderEntry(x + 0.5, y + 0.5, world, pref);
          const d = Math.hypot(p.x - x - 0.5, p.y - y - 0.5);
          total++; minD = Math.min(minD, d);
          if (d < BEHOLDER_MIN_DIST) near++;
          // off screen: desktop shows at most 20 tiles across (half 10), a 412x915 phone about 11 x 24.4 (half 12.2)
          if (Math.abs(p.x - x - 0.5) < 10.5 && Math.abs(p.y - y - 0.5) < 12.5) onScreen++;
        }
      }
      // and the live spawn, from a few spots, through the enemies step
      for (const [fx, fy] of [[0.5, 0.2], [0.2, 0.6], [0.8, 0.9]]) {
        let ox = Math.floor(LEVEL_W * fx), oy = Math.floor(LEVEL_H * fy);
        for (let r = 0; r < 12 && world.isSolid(ox + 0.5, oy + 0.5); r++) ox = (ox + 1) % LEVEL_W;
        const o = createOctopus(ox + 0.5, oy + 0.5), en = createEnemies();
        en.update(DT, 150, o, world, []);
        const b = en.beholder();
        total++; const d = b ? Math.hypot(b.x - o.x, b.y - o.y) : 0; minD = Math.min(minD, d);
        if (!b || d < BEHOLDER_MIN_DIST) near++;
      }
    }
    assert(`time pressure: the Beholder never enters within ${BEHOLDER_MIN_DIST} tiles of the octopus and always off screen (${total} entries, ${near} near, closest ${minD.toFixed(4)}, ${onScreen} on screen)`,
      near === 0 && onScreen === 0 && Math.abs(minD - BEHOLDER_SPAWN_DIST) < 0.05); // the live one has drifted one step
  }

  // ---------------------------------------------------------------- the drift: through rock, slow, relentless, a kill on touch
  {
    // a solid wall 6 tiles thick between it and the octopus: no path at all, it comes straight through
    const world = box(60, 30, (x) => x >= 27 && x < 33);
    const o = createOctopus(45.5, 15.5), en = createEnemies();
    const b = en.spawnAt('beholder', 15.5, 15.5); // a test spawn: its ramp starts on its first step
    let t = 0, maxV = 0, crossed = false;
    for (let i = 0; i < 50 * 30 && !o.dead; i++) {
      t += DT; en.update(DT, 150 + t, o, world, []);
      maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
      if (world.isSolid(b.x, b.y)) crossed = true;
      o.invulnTimer = 5; // invulnerability does not save you from it
    }
    assert(`time pressure: it drifts through solid rock (no path needed) and its touch kills through invulnerability (${t.toFixed(1)} s, top speed ${maxV.toFixed(2)} u/s)`,
      crossed && o.dead && o.cause === 'beholder' && maxV <= BEHOLDER_DRIFT_MAX + 1e-6 && t > 30 / BEHOLDER_DRIFT_MAX);
    // a fleeing octopus at swim speed gains on it: it is a timer, not an ambush
    const o2 = createOctopus(30, 15), en2 = createEnemies();
    const b2 = en2.spawnAt('beholder', 13, 15);
    for (let i = 0; i < 50 * 5; i++) { en2.update(DT, 150 + i * DT, o2, OPEN, []); o2.x += SWIM_MAX_SPEED * 0.6 * DT; }
    assert('time pressure: swimming away at 60% speed still outpaces it for a while', !o2.dead && o2.x - b2.x > 17);
  }

  // ---------------------------------------------------------------- Swift Current: target, condition, the moon shell
  {
    const corridor = box(40, 5, (x, y) => y !== 2); // a straight 40-tile tunnel along y = 2
    assert('swift: swim distance is the open-water path length (BFS)', swimDistance(corridor, 1.5, 2.5, 35.5, 2.5) === 34 && swimDistance(corridor, 1.5, 2.5, 1.5, 0.5) === -1);
    const bent = box(20, 20, (x, y) => y === 10 && x < 18); // a wall with a gap at the far right: the path goes round
    assert('swift: the path goes round walls', swimDistance(bent, 2.5, 5.5, 2.5, 15.5) === 2 * 16 + 10);
    assert('swift: the target grows with the distance, rounded up to 5 s, clamped', swiftTarget(10) === SWIFT_MIN && swiftTarget(100) === 55 && swiftTarget(5000) === SWIFT_MAX && swiftTarget(-1) === SWIFT_MAX && swiftTarget(100) % 5 === 0);
    assert('swift: the banner label reads m:ss', swiftLabel(45) === '0:45' && swiftLabel(65) === '1:05');
    // real levels: a target exists and a fair swim (the path at the swim cap) makes it, a slow one does not
    let ok = 0, n = 0;
    for (const [seed, lvl] of [[3, 0], [7, 1], [11, 2], [6, 0]]) {
      const w = createLevelWorld(seed, lvl), L = w.level;
      const d = swimDistance(w, w.startX, w.startY, L.exitX + 0.5, L.exitY + 0.5), tg = swiftTarget(d);
      n++; if (d > 0 && tg >= SWIFT_MIN && tg <= SWIFT_MAX && d / SWIM_MAX_SPEED < tg && d / 1.2 > tg) ok++;
    }
    assert(`swift: every real level has a reachable target a good swim beats and dawdling misses (${ok}/${n})`, ok === n);

    const sw = createSwift(40, 20, 20);
    const o = createOctopus(20 + SWIFT_NEAR + 1, 20);
    assert('swift: not earned while still far from the whirlpool', stepSwift(sw, 10, o) === false && swiftOpen(sw, 10));
    o.x = 20 + SWIFT_NEAR - 0.5;
    assert('swift: earned once on reaching the whirlpool in time', stepSwift(sw, 39.9, o) === true && sw.earned && stepSwift(sw, 40, o) === false && !swiftOpen(sw, 40));
    const late = createSwift(40, 20, 20);
    assert('swift: too late is no bonus', stepSwift(late, 40.1, o) === false && !late.earned && !swiftOpen(late, 40.1));
    const dead = createSwift(40, 20, 20); const od = createOctopus(20, 20); od.dead = true;
    assert('swift: a dead octopus earns nothing', stepSwift(dead, 1, od) === false);

    // the moon shell: the top shell, dropped as a pickup and collected with its kind and value
    assert('swift: the moon shell is the most valuable shell (worth more than a pearl) and has a journal entry',
      SHELL_VALUE[SK_MOON] === MOON_VALUE && MOON_VALUE > SHELL_VALUE[SK_PEARL] && Math.max(...SHELL_VALUE) === MOON_VALUE && itemId(SHELL_NAMES[SK_MOON]) === 'item-moon');
    const w = createLevelWorld(3, 0), pk = createPickups();
    const oc = createOctopus(w.startX, w.startY);
    pk.update(DT, 0, oc, w.residentChunks(), w);
    const it = pk.dropShell(w.startX + 2, w.startY, -4, 0, SK_MOON);
    let got = null;
    for (let i = 0; i < 30; i++) pk.update(DT, i * DT, oc, w.residentChunks(), w); // it pops toward the octopus, then rests
    const moved = it && it.x < w.startX + 2 - 0.3 && !it.collected;
    oc.x = it.x; oc.y = it.y; // swim onto it
    for (let i = 0; i < 5 && !got; i++) { pk.update(DT, 1 + i * DT, oc, w.residentChunks(), w); for (const ev of pk.events) if (ev.type === 'shell' && ev.sk === SK_MOON) got = ev; }
    assert('swift: the dropped moon shell is a live pickup, pops toward the octopus and is collected as a moon shell worth 50', !!it && moved && it.sk === SK_MOON && got && got.value === 50 && it.collected);
  }

  // ---------------------------------------------------------------- the bonus count persists (journal stats and lifetime meta)
  {
    assert('swift journal: entries for the Swift Current (loot, "Earned") and the Moon Shell (item)', (() => {
      const s = ENTRIES.find((e) => e.id === 'loot-swift'), m = ENTRIES.find((e) => e.id === 'item-moon');
      return s && m && s.cat === 'loot' && m.cat === 'item' && s.counters.some((c) => c[0] === 'collected' && c[1] === 'Earned') && m.art && m.art.img === 'assets/shell-moon.webp';
    })());
    const KEY = 'octomancer.best.v1';
    let stored = null, canStore = true;
    try { stored = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch (e) { canStore = false; }
    if (canStore) {
      try {
        _resetForTests();
        const store = { load: getJournalIds, save: saveJournalIds, loadStats: getJournalStats, saveStats: saveJournalStats };
        const j = createJournal(store);
        j.discover('loot-swift'); j.bump('loot-swift', STAT_COLLECTED); j.bump('loot-swift', STAT_COLLECTED); j.bump('item-moon', STAT_COLLECTED);
        j.flush();
        recordDive({ depth: 2, shells: 60, time: 90, kills: 0, quests: 0, level: 2, cleared: false, cause: 'beholder', seed: 1, swift: 2 });
        _resetForTests(); // a reload: everything comes back from storage
        const j2 = createJournal(store);
        const rows = statsRows(getMeta()).rows;
        assert('swift journal: the Earned count and the moon shells survive a reload, and the stats page counts Swift Currents',
          j2.has('loot-swift') && j2.stat('loot-swift', STAT_COLLECTED) === 2 && j2.stat('item-moon', STAT_COLLECTED) === 1 && getMeta().swift === 2 && rows.some((r) => r.join() === 'Swift Currents,2'));
      } finally {
        try { if (stored === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, stored); } catch (e) { /* ignore */ }
        _resetForTests();
      }
    }
  }
}
