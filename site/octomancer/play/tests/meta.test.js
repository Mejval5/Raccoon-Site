// Round 33: run loop and meta. Run summary through the run state machine (stats, cause of death, depth, the
// unlocked hub shortcut), best-runs list and lifetime stats persistence (save.js), the level title card,
// the death / biome-clear screens (ui.js), the journal stats page, and the hub shortcut ring.
import {
  createRun, runEvent, levelSpec, levelTitle, gainShells, endDive, stageLabel,
  S_HUB, S_BIOME, S_END, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, EV_CONTINUE, EV_ENTER_SHORTCUT, BIOME_LEVELS, CAUSE_TEXT,
} from '../js/run.js';
import {
  insertBestRun, recordDive, getBestRuns, getMeta, getShortcut, setShortcut, loadBest, _resetForTests, BEST_RUNS_MAX,
} from '../js/save.js';
import { formatTime, depthLabel, summaryRows, summaryHeadline, bestRunLines, statsRows, causeText } from '../js/runstats.js';
import { createUI } from '../js/ui.js';
import { createJournal } from '../js/journal.js';
import { createJournalScreen } from '../js/journal-ui.js';
import { createOctopus, hurtOctopus, killOctopus } from '../js/octopus.js';
import { parseAuthoredMap } from '../js/authored.js';
import { createPathGrid, findPath } from '../js/pathcheck.js';
import { createLevelWorld } from '../js/world-v2.js';
import { drawItemIcon } from '../js/items-draw.js';

const KEY = 'octomancer.best.v1';

function runOf(depth, shells, time = 100) { return { depth, shells, time, kills: 0, quests: 0, level: Math.min(3, depth), cleared: depth > 3, cause: depth > 3 ? '' : 'crab', seed: 1 }; }

export async function runMetaTests(assert) {
  // --- best-runs list: top 5 by depth, then shells, then time ---
  {
    let list = [];
    for (const r of [runOf(2, 10), runOf(3, 5), runOf(2, 30), runOf(4, 1), runOf(1, 99), runOf(3, 20)]) list = insertBestRun(list, r).list;
    assert('meta: best runs are capped at 5', list.length === BEST_RUNS_MAX && BEST_RUNS_MAX === 5);
    assert('meta: best runs sort by depth, then shells', list.map((r) => r.depth + ':' + r.shells).join() === '4:1,3:20,3:5,2:30,2:10');
    const res = insertBestRun(list, runOf(1, 500));
    assert('meta: a run below the list does not enter it (rank -1)', res.rank === -1 && res.list.length === 5);
    const res2 = insertBestRun(list, runOf(3, 20));
    assert('meta: an equal older run keeps its place; the new one ranks after it', res2.rank === 2 && res2.list[1].shells === 20);
    const res3 = insertBestRun(list, runOf(5, 0));
    assert('meta: a cleared run ranks first and pushes the last one out', res3.rank === 0 && res3.list.length === 5 && res3.list[4].shells === 30);
    assert('meta: time breaks a full tie (faster first)', insertBestRun([runOf(2, 5, 90)], runOf(2, 5, 60)).rank === 0);
  }

  // --- persistence: best runs, lifetime stats and the shortcut survive a reload (real localStorage, restored after) ---
  let stored = null, canStore = true;
  try { stored = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch (e) { canStore = false; }
  if (canStore) {
    try {
      _resetForTests();
      assert('meta save: starts empty, shortcut locked', getBestRuns().length === 0 && getShortcut() === false && getMeta().dives === 0);
      const r1 = recordDive({ ...runOf(2, 12, 75), kills: 3, cause: 'piranha' });
      recordDive({ ...runOf(3, 4, 120), kills: 1, cause: 'piranha' });
      recordDive({ ...runOf(4, 40, 300), kills: 9, cleared: true, cause: '' });
      recordDive({ ...runOf(1, 2, 20), cause: 'eel' });
      assert("meta save: recordDive returns the new run's rank", r1.rank === 0);
      setShortcut(true);
      _resetForTests(); // forget memory: the next read must come from storage
      const best = getBestRuns(), meta = getMeta();
      assert('meta save: best runs persist across a reload, best first', best.length === 4 && best[0].depth === 4 && best[1].depth === 3 && best[3].depth === 1);
      assert('meta save: lifetime stats persist (runs, best depth, total shells, kills)', meta.dives === 4 && meta.clears === 1 && meta.bestDepth === 4 && meta.shells === 58 && meta.kills === 13);
      assert('meta save: deaths by cause persist (clears are not deaths)', meta.deaths.piranha === 2 && meta.deaths.eel === 1 && !('' in meta.deaths) && Object.keys(meta.deaths).length === 2);
      assert('meta save: the unlocked shortcut persists', getShortcut() === true);
      for (let i = 0; i < 8; i++) recordDive(runOf(1, i));
      _resetForTests();
      assert('meta save: the stored list never exceeds 5', getBestRuns().length === 5 && getMeta().dives === 12);
      // corrupt and hostile data
      localStorage.setItem(KEY, JSON.stringify({ v: 1, best: 3, bestRuns: [{ depth: 'x' }, null, { depth: 2, shells: -4, time: 'a' }, 7], shortcut: 'yes', meta: { dives: -3, deaths: { crab: 'many', eel: 2 } } }));
      _resetForTests();
      assert('meta save: junk best runs and stats are cleaned on load', getBestRuns().length === 1 && getBestRuns()[0].shells === 0 && getMeta().dives === 0 && getMeta().deaths.eel === 2 && !('crab' in getMeta().deaths) && getShortcut() === true);
      localStorage.setItem(KEY, '{broken');
      _resetForTests();
      assert('meta save: corrupt storage falls back to defaults', getBestRuns().length === 0 && getShortcut() === false);
      // an old save (before this round) keeps its endless best and gets empty meta
      localStorage.setItem(KEY, JSON.stringify({ v: 1, best: 9, runs: 2, journal: ['place-hub'] }));
      _resetForTests();
      assert('meta save: an old save loads with empty meta and keeps its best', loadBest().best === 9 && getBestRuns().length === 0 && getMeta().dives === 0 && getShortcut() === false);
    } finally {
      try { if (stored === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, stored); } catch (e) { /* ignore */ }
      _resetForTests();
    }
  }

  // --- run state machine: stats, cause of death, depth, clear, shortcut ---
  {
    const r = createRun(5, { tutorialDone: true });
    assert('run meta: a new run has no summary and the shortcut locked', r.last === null && r.shortcut === false);
    assert('run meta: the shortcut ring does nothing while locked', !runEvent(r, EV_ENTER_SHORTCUT) && r.state === S_HUB);
    runEvent(r, EV_ENTER_DIVE);
    gainShells(r, 7); r.dive.kills += 2; r.dive.quests++; r.dive.time += 61.4;
    runEvent(r, EV_EXIT);
    r.dive.kills++;
    gainShells(r, 3);
    r.shells -= 4; // spending in the shop does not reduce shells collected
    const before = r.deaths;
    assert('run meta: death returns to the hub', runEvent(r, EV_DEATH, 'eel') && r.state === S_HUB && r.deaths === before + 1);
    const d = r.last;
    assert('run meta: the death summary has depth (level reached), cause, stats',
      d && !d.cleared && d.depth === 2 && d.level === 2 && d.cause === 'eel' && d.shells === 10 && d.kills === 3 && d.quests === 1 && Math.abs(d.time - 61.4) < 1e-9 && d.levelsCleared === 1);
    assert('run meta: the wallet is lost on death but the summary keeps shells collected', r.shells === 0 && d.shells === 10);
    assert('run meta: the level title for a hub is none', levelTitle(r) === null);
    runEvent(r, EV_ENTER_DIVE);
    assert('run meta: a new dive clears the summary and resets the stats', r.last === null && r.dive.kills === 0 && r.dive.shells === 0 && r.dive.time === 0 && r.dive.reached === 1);
    // a summary closed early (the death screen does this) is not overwritten by the later event
    const first = endDive(r, false, 'bomb');
    runEvent(r, EV_DEATH, 'urchin');
    assert('run meta: the cause from the death screen is kept when the event repeats', r.last === first && r.last.cause === 'bomb');
    runEvent(r, EV_ENTER_DIVE); runEvent(r, EV_DEATH);
    assert('run meta: an unknown cause reads as the dark', r.last.cause === 'unknown' && causeText('unknown') === CAUSE_TEXT.unknown);

    // a full clear: depth beyond the last level, shortcut unlocks (and only announces itself once)
    const c = createRun(6, { tutorialDone: true });
    runEvent(c, EV_ENTER_DIVE);
    for (let i = 0; i < BIOME_LEVELS; i++) { c.dive.time += 30; runEvent(c, EV_EXIT); }
    assert('run meta: clearing the biome ends the dive with a cleared summary', c.state === S_END && c.last.cleared && c.last.depth === BIOME_LEVELS + 1 && c.last.level === BIOME_LEVELS && c.last.cause === '' && c.last.levelsCleared === BIOME_LEVELS && c.last.time === 90);
    assert('run meta: the first clear unlocks the shortcut and says so', c.shortcut === true && c.last.shortcutNew === true);
    runEvent(c, EV_CONTINUE);
    assert('run meta: the summary stays until the next dive starts', c.state === S_HUB && c.last && c.last.cleared);
    assert('run meta: the shortcut ring now starts Shallows 1-2', runEvent(c, EV_ENTER_SHORTCUT) && c.state === S_BIOME && c.level === 2 && stageLabel(c) === 'Shallows 1-2' && levelSpec(c).levelIndex === 1 && c.last === null);
    assert('run meta: a shortcut dive starts with fresh items, shells and stats', c.items.length === 0 && c.shells === 0 && c.dive.startLevel === 2 && c.dive.reached === 2);
    runEvent(c, EV_DEATH, 'crab');
    assert('run meta: dying right after the shortcut ranks by the level reached (2)', c.last.depth === 2 && c.last.level === 2);
    runEvent(c, EV_ENTER_SHORTCUT);
    runEvent(c, EV_EXIT); runEvent(c, EV_EXIT);
    assert('run meta: a shortcut run clears after two exits, and the second clear does not announce the unlock again', c.state === S_END && c.last.cleared && c.last.shortcutNew === false);
    // the shortcut only exists in the hub, and only after the tutorial
    const t = createRun(8, { tutorialDone: false, shortcut: true });
    assert('run meta: no shortcut before the tutorial is done', !runEvent(t, EV_ENTER_SHORTCUT) && t.state === S_HUB);
    const p = createRun(9, { tutorialDone: true, shortcut: true });
    runEvent(p, EV_ENTER_DIVE);
    assert('run meta: the shortcut event is ignored inside a dive', !runEvent(p, EV_ENTER_SHORTCUT) && p.level === 1);
  }

  // --- death -> save -> reload -> shortcut: the whole loop through run.js and save.js ---
  if (canStore) {
    try {
      localStorage.removeItem(KEY);
      _resetForTests();
      let run = createRun(11, { tutorialDone: true, shortcut: getShortcut() });
      runEvent(run, EV_ENTER_DIVE);
      for (let i = 0; i < BIOME_LEVELS; i++) runEvent(run, EV_EXIT);
      recordDive(run.last); setShortcut(true); // what main.js does when the clear screen opens
      _resetForTests();
      run = createRun(12, { tutorialDone: true, shortcut: getShortcut() });
      assert('loop: after a reload the unlocked shortcut works in a new run', run.shortcut === true && runEvent(run, EV_ENTER_SHORTCUT) && run.level === 2);
      runEvent(run, EV_DEATH, 'manta');
      recordDive(run.last);
      assert('loop: the death is on the best-runs list under the clear, and in the stats', getBestRuns().length === 2 && getBestRuns()[0].cleared && getBestRuns()[1].cause === 'manta' && getMeta().deaths.manta === 1 && getMeta().clears === 1);
    } finally {
      try { if (stored === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, stored); } catch (e) { /* ignore */ }
      _resetForTests();
    }
  }

  // --- level title card through the state machine ---
  {
    const r = createRun(42, { tutorialDone: true });
    assert('title: no card in the hub', levelTitle(r) === null);
    runEvent(r, EV_ENTER_DIVE);
    const seq = [levelTitle(r).text];
    runEvent(r, EV_EXIT); seq.push(levelTitle(r).text);
    runEvent(r, EV_EXIT); seq.push(levelTitle(r).text);
    assert('title: each level start has its card ("Shallows 1-1", 1-2, 1-3)', seq.join() === 'Shallows 1-1,Shallows 1-2,Shallows 1-3');
    assert('title: the dive seed shows when asked (always, in the game)', levelTitle(r, true).sub === 'Seed ' + r.diveSeed && levelTitle(r, false).sub === '');
    runEvent(r, EV_EXIT);
    assert('title: no card on the clear screen', r.state === S_END && levelTitle(r) === null);
    assert('title: no card in the tutorial', levelTitle(createRun(1, { tutorialDone: false })) === null);
  }

  // --- text helpers ---
  {
    assert('runstats: formatTime', formatTime(0) === '0:00' && formatTime(75.9) === '1:15' && formatTime(600) === '10:00' && formatTime(-3) === '0:00');
    assert('runstats: depthLabel', depthLabel(1) === 'Shallows 1-1' && depthLabel(3) === 'Shallows 1-3' && depthLabel(4) === 'Cleared');
    const dead = { cleared: false, level: 3, depth: 3, time: 125, shells: 18, kills: 4, quests: 1, cause: 'piranha', seed: 77 };
    const rows = summaryRows(dead);
    assert('runstats: the summary lists levels, time, shells, kills, quests and the cause of death',
      rows.map((x) => x[0]).join() === 'Levels reached,Time,Shells,Kills,People helped,Cause of death' && rows[0][1] === '3 of 3' && rows[1][1] === '2:05' && rows[5][1] === 'a piranha');
    assert('runstats: a seeded summary adds the seed', summaryRows(dead, true).at(-1).join() === 'Seed,77');
    assert('runstats: headline names the killer and the level', summaryHeadline(dead) === 'Taken by a piranha in Shallows 1-3');
    assert('runstats: a cleared summary says Cleared', summaryRows({ ...dead, cleared: true, depth: 4, cause: '' }).at(-1).join() === 'Result,Cleared');
    assert('runstats: best run lines', bestRunLines([runOf(4, 40, 300), runOf(2, 5, 61)]).join('|') === '1. Cleared, 40 shells, 5:00|2. Shallows 1-2, 5 shells, 1:01');
    const st = statsRows({ dives: 5, clears: 1, bestDepth: 4, shells: 120, kills: 33, deaths: { eel: 1, crab: 3, bomb: 3 } });
    assert('runstats: stats page rows (runs, best depth, total shells) and deaths most first',
      st.rows[0].join() === 'Runs,5' && st.rows[2].join() === 'Best depth,Cleared' && st.rows[3].join() === 'Total shells,120' && st.deaths.map((x) => x.join(':')).join() === 'Own bomb:3,Crab:3,Electric eel:1');
  }

  // --- cause of death comes from the thing that hurt the octopus ---
  {
    const o = createOctopus(5, 5);
    hurtOctopus(o, 4, 5, 'eel');
    assert('cause: a hurt records what hurt it', o.cause === 'eel' && !o.dead);
    o.invulnTimer = 0; o.hearts = 1;
    hurtOctopus(o, 4, 5, 'piranha');
    assert('cause: the killing blow names the killer', o.dead && o.cause === 'piranha');
    const b = createOctopus(5, 5);
    killOctopus(b, 'beholder');
    assert('cause: killOctopus takes a cause too', b.dead && b.cause === 'beholder');
    const u = createOctopus(5, 5); u.hearts = 1;
    hurtOctopus(u, 4, 5);
    assert('cause: a hurt with no cause reads unknown', u.dead && u.cause === 'unknown');
  }

  // --- the screens (ui.js): death and clear carry the run summary, the banner art and the best runs ---
  {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const ui = createUI(root, { onRestart() {}, onExit() {}, onTogglePause() {}, onEndContinue() {}, muted: true });
    const dead = { cleared: false, level: 2, depth: 2, time: 83, shells: 9, kills: 2, quests: 1, cause: 'crab', seed: 3 };
    const list = [runOf(4, 40, 300), runOf(2, 9, 83)];
    const detail = { title: 'The dark took you', headline: summaryHeadline(dead), rows: summaryRows(dead), best: bestRunLines(list), rank: 1, note: '' };
    ui.showGameOver(0, 0, detail);
    const ov = root.querySelector('.octo-gameover-overlay');
    const txt = ov.textContent;
    assert('death screen: shown with title, headline and every stat row', ui.isGameOverShown() && txt.includes('The dark took you') && txt.includes('Taken by a crab in Shallows 1-2')
      && txt.includes('Levels reached') && txt.includes('1:23') && txt.includes('Shells') && txt.includes('Kills') && txt.includes('People helped') && txt.includes('Cause of death') && txt.includes('a crab'));
    assert('death screen: uses the generated banner art', /title-banner\.webp/.test(ov.querySelector('.octo-banner').style.backgroundImage));
    const lis = ov.querySelectorAll('.octo-summary-bestrun');
    assert('death screen: lists the best runs and marks this one', lis.length === 2 && lis[1].classList.contains('is-new') && !lis[0].classList.contains('is-new'));
    assert('death screen: the endless score lines are hidden in a dive', ov.querySelector('.octo-overlay-score').style.display === 'none');
    ui.hideGameOver();
    ui.showGameOver(12, 30);
    assert('death screen: without a summary (endless) it shows the plain score', ov.querySelector('.octo-overlay-score').style.display !== 'none' && ov.querySelector('.octo-summary').style.display === 'none' && ov.textContent.includes('Score 12'));
    ui.hideGameOver();
    const win = { ...dead, cleared: true, level: 3, depth: 4, cause: '', shortcutNew: true };
    ui.showEnd('Shallows cleared', 'x', { title: 'Shallows cleared', headline: summaryHeadline(win), rows: summaryRows(win), best: bestRunLines(list), rank: 0, note: 'Shortcut unlocked: a new ring in the hub leads to Shallows 1-2' });
    const eo = root.querySelector('.octo-end-overlay');
    assert('clear screen: shown with the stats, the best runs and the shortcut note', ui.isEndShown() && eo.textContent.includes('Shallows cleared') && eo.textContent.includes('All 3 levels cleared')
      && eo.textContent.includes('Result') && eo.querySelectorAll('.octo-summary-bestrun').length === 2 && eo.textContent.includes('Shortcut unlocked'));
    ui.hideEnd();
    assert('clear screen: hides again', !ui.isEndShown());
    ui.showTitle('Shallows 1-2', 'Seed 42');
    assert('title card: shows the stage name and the seed', ui.titleShown() && ui.titleContent().text === 'Shallows 1-2' && ui.titleContent().sub === 'Seed 42');
    ui.showTitle('Shallows 1-3');
    assert('title card: no seed line when unseeded', ui.titleContent().sub === '');
    // toasts: a queued journal line waits behind a pickup toast instead of replacing it (round 32 review: 'Bought ...' vanished)
    const toast = root.querySelector('.octo-toast');
    ui.showToast('Bought Lantern for 10 shells, a larger light radius');
    ui.showToast('New journal entry: Lantern', 2400, true);
    assert('toast: a queued journal toast does not replace the pickup toast', toast.textContent.startsWith('Bought Lantern') && toast.style.display !== 'none');
    ui.showToast('Found Bomb bag: +3 bombs');
    assert('toast: a plain toast still replaces the current one', toast.textContent.startsWith('Found Bomb bag'));
    // HUD: stacked items draw once with a badge, and sit on their own row
    ui.updateHud({ hearts: 3, heartMax: 4, bombs: 7, depth: 0, score: 1234, best: 0, stage: 'Shallows 1-2', shells: 23, items: ['flippers', 'lantern', 'magnet', 'bombbag', 'bombbag', 'heartcontainer', 'heartcontainer'], quest: '', questState: '' });
    const icons = root.querySelectorAll('.octo-hud-item');
    assert('HUD: a stacked item is one icon (7 carried, 5 icons)', icons.length === 5 && root.querySelector('.octo-hud-items').parentElement === root.querySelector('.octo-hud-bar'));
    assert('HUD: the item row is not inside the stat row', !root.querySelector('.octo-hud-stats').contains(root.querySelector('.octo-hud-items')));
    root.remove();
  }

  // --- journal book (round 38): a two-page spread, bookmark tabs, locked silhouettes, entry pages with counters, a Progress page ---
  {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const saved = {};
    const j = createJournal({ load: () => ['creature-urchin', 'place-hub'], save() {}, loadStats: () => ({ 'creature-urchin': [3, 2, 1, 0] }), saveStats(st) { Object.assign(saved, st); } });
    const meta = { dives: 6, clears: 1, bestDepth: 4, shells: 77, kills: 21, time: 754, deaths: { crab: 2, eel: 3 } };
    const scr = createJournalScreen(root, j, { getStats: () => ({ meta, bestRuns: [runOf(4, 30, 200)] }) });
    scr.show();
    assert('journal book: bookmark tabs for Places, People, Bestiary, Items, Traps and Progress, Places open first', [...root.querySelectorAll('.octo-bk-tab')].map((b) => b.dataset.tab).join() === 'places,people,bestiary,items,traps,progress' && scr.tab() === 'places');
    assert('journal book: two facing pages (a grid page and an entry page) with a spine between them', !!root.querySelector('.octo-bk-left') && !!root.querySelector('.octo-bk-right') && !!root.querySelector('.octo-bk-spine') && !!root.querySelector('.octo-bk-ribbon'));
    assert('journal book: the left page header counts found / total of the tab', /\d+ \/ \d+/.test(root.querySelector('.octo-bk-left .octo-bk-count').textContent));
    scr.setTab('bestiary');
    const pg = scr.page();
    const cards = root.querySelectorAll('.octo-bk-card');
    const known = root.querySelector('.octo-bk-card[data-id="creature-urchin"]'), locked = root.querySelector('.octo-bk-card[data-id="creature-crab"]');
    assert('journal book: the Bestiary page is a grid of cards (one page of them), with art on each', cards.length === Math.min(pg.perPage, j.tabList('bestiary').length) && root.querySelectorAll('.octo-bk-left canvas').length === cards.length);
    assert('journal book: a found creature shows its name, an unfound one is a silhouette with ???', !!known && !!locked && known.textContent.includes('Urchin') && !known.classList.contains('is-locked') && locked.classList.contains('is-locked') && locked.textContent.includes('???') && !locked.textContent.includes('Crab'));
    known.click();
    const page = root.querySelector('.octo-bk-entry');
    assert('journal book: picking a card shows the entry on the right page: art, name, text and the counters (Dives met in 3, Killed 2, Killed by 1)',
      !!page && scr.entry() === 'creature-urchin' && page.textContent.includes('Urchin') && page.textContent.includes('Dives met in3') && page.textContent.includes('Killed2') && page.textContent.includes('Killed by1') && page.querySelector('canvas') !== null);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    assert('journal book: the down arrow selects the next entry, a locked one shows ??? and no description', scr.entry() === 'creature-piranha' && root.querySelector('.octo-bk-entry').textContent.includes('???') && root.querySelector('.octo-bk-entry').classList.contains('is-locked') && !root.querySelector('.octo-bk-entry .octo-bk-ledger'));
    scr.showEntry('place-hub');
    assert('journal book: showEntry jumps to the right tab', scr.tab() === 'places' && scr.entry() === 'place-hub');
    const before = scr.page();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    assert('journal book: the right arrow key turns the page (next grid page or the next tab)', scr.page().tab !== before.tab || scr.page().page !== before.page);
    scr.setTab('items');
    assert('journal book: Items shows items, loot and props together (more than one page of them)', j.tabList('items').length >= 15 && scr.page().pages * scr.page().perPage >= j.tabList('items').length);
    scr.turn(1);
    assert('journal book: turning the page moves through the tab (or on to the next)', scr.page().page === 1 || scr.tab() === 'traps');
    scr.setTab('progress');
    const t = root.querySelector('.octo-bk-spread').textContent;
    assert('journal book: Progress has completion %, deaths, best depth, play time, shells collected, runs', t.includes('Completion') && /\d+%/.test(t) && t.includes('Deaths5') && t.includes('Best depthCleared') && t.includes('Play time12:34') && t.includes('Shells collected77') && t.includes('Runs6'));
    assert('journal book: Progress lists deaths by cause (most first, as nouns) and the best runs', t.indexOf('Electric eel') > 0 && t.indexOf('Electric eel') < t.indexOf('Crab') && !/an? (crab|electric eel|piranha)/i.test(t) && t.includes('1. Cleared, 30 shells, 3:20'));
    {
      const pp = scr.page(), nextB = root.querySelector('.octo-bk-turn[aria-label="Next page"]'), lab = root.querySelector('.octo-bk-pagelabel').textContent;
      assert('journal book (r39): in the two-page spread Progress is one spread (the next arrow is disabled, the label has no 1/2); one page at a time it is two pages',
        pp.mode === 'spread' ? (pp.pages === 1 && nextB.disabled && !/\d\/\d/.test(lab) && scr.turn(1) === false && scr.page().tab === 'progress') : pp.pages === 2);
    }
    scr.hide();
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    createJournalScreen(root2, j, {});
    assert('journal book: no Progress tab without a stats source', root2.querySelector('.octo-bk-tab[data-tab="progress"]').style.display === 'none');
    root.remove(); root2.remove();
  }

  // --- hub shortcut ring: an R marker in the authored hub, reachable, beside the dive ring ---
  {
    const hubJson = await (await fetch('../data/hub.json')).json();
    const hub = parseAuthoredMap(hubJson);
    assert('hub shortcut: the hub has an R marker next to the dive ring', hub.shortcutX >= 0 && Math.abs(hub.shortcutY - hub.exitY) <= 1 && hub.shortcutX - hub.exitX >= 3 && hub.shortcutX - hub.exitX <= 6);
    const grid = createPathGrid(hub.w, hub.h, (x, y) => hub.tiles[y * hub.w + x] !== 0);
    assert('hub shortcut: reachable from the start (A*, real octopus radius)', findPath(grid, hub.startX + 0.5, hub.startY + 0.5, hub.shortcutX + 0.5, hub.shortcutY + 0.5) !== null);
    const w = createLevelWorld(1, 0, { level: parseAuthoredMap(hubJson) });
    assert('hub shortcut: the world carries the marker', w.level.shortcutX === hub.shortcutX);
    const gen = createLevelWorld(3, 0);
    assert('hub shortcut: generated levels have none', !(gen.level.shortcutX >= 0));
  }

  // --- item icons (round 32 review): flippers are warm, not water-cyan; the bomb bag draws ---
  {
    let ok = true;
    for (const id of ['flippers', 'lantern', 'magnet', 'bombbag', 'heartcontainer']) {
      try { const c = document.createElement('canvas'); c.width = 40; c.height = 40; drawItemIcon(c.getContext('2d'), id, 20, 20, 15); } catch (e) { ok = false; }
    }
    assert('items: all five icons draw', ok);
    const fl = document.createElement('canvas'); fl.width = 40; fl.height = 40;
    drawItemIcon(fl.getContext('2d'), 'flippers', 20, 20, 15);
    const d = fl.getContext('2d').getImageData(0, 0, 40, 40).data;
    let r = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; b += d[i + 2]; n++; }
    assert('items: the flippers fill is warm (red above blue), not water-cyan', n > 100 && r / n > b / n + 40);
  }
}
