// V2-PLAN 16: the giant clam and the tentacle (creatures.js) on small hand-made worlds, the pattern placement on real levels,
// the journal entries and the corpse art.
import {
  createCreatures, makeCreatureRecord, creatureJournalId,
  CR_GCLAM, CR_TENTACLE, CL_SHUT, CL_OPENING, CL_OPEN, CL_TREMBLE, CL_SNAP,
  TN_DORMANT, TN_WAKE, TN_REACH, TN_STRIKE, TN_GRAB, TN_STUN, TN_FED,
  CLAM_TREMBLE_T, CLAM_OPEN_T, TENT_FLING, TENT_REGRAB_CD,
} from '../js/creatures.js';
import { createOctopus, stepOctopus } from '../js/octopus.js';
import { PEARL_VALUE } from '../js/shells.js';
import { ENTRIES } from '../js/journal.js';
import { hasCorpseArt } from '../js/corpses-draw.js';
import '../js/creatures-draw.js'; // registers the corpse art
import { getPatternTable, setPatternTable, compilePatterns } from '../js/patterns.js';
import { createRoomBank } from '../js/rooms.js';
import { generateLevel, finalPathOk, LEVEL_W, LEVEL_H } from '../js/level.js';
import { buildLevelSpawns, HAZARD_START_KEEP_OUT } from '../js/level-spawns.js';
import { CAUSE_TEXT, CAUSE_NAME } from '../js/run.js';
import { causeEntryId } from '../js/journal.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadPatternsJson } from './patterns.test.js';

const DT = 0.02;
const NOIN = { move: { x: 0, y: 0 }, dash: { pressed: false, held: false }, bomb: { pressed: false, held: false } };
const DASH = { move: { x: 0, y: 0 }, dash: { pressed: true, held: true }, bomb: { pressed: false, held: false } };

/** Fake world from rows ('#' rock): tileAt / isSolid, enough for creatures.js and the octopus step. */
function fake(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  const world = {
    w, h, tiles,
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
  };
  return world;
}
const room = (w, h) => Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));

/** Step creatures and the octopus together; `each(i, t)` runs before each step and may set input / move the octopus. Returns the events seen. */
function run(cr, octo, world, seconds, each) {
  const n = Math.round(seconds / DT), seen = [];
  for (let i = 0; i < n; i++) {
    const input = (each && each(i, i * DT)) || NOIN;
    stepOctopus(octo, input, DT, world);
    cr.update(DT, octo, world, null);
    for (const ev of cr.events) seen.push({ ...ev, step: i });
  }
  return seen;
}

export async function runCreatureTests(assert) {
  // ---- journal, causes, corpse art ----
  {
    const g = ENTRIES.find((e) => e.id === creatureJournalId(CR_GCLAM)), t = ENTRIES.find((e) => e.id === creatureJournalId(CR_TENTACLE));
    const p = ENTRIES.find((e) => e.id === 'item-pearl');
    assert('journal: the giant clam and the tentacle have bestiary entries and the pearl an item entry',
      g && t && p && g.cat === 'creature' && t.cat === 'creature' && p.cat === 'item' && g.text.length > 40 && t.text.length > 40);
    assert('causes: clam and tentacle have death-screen text and journal links',
      CAUSE_TEXT.clam === 'a giant clam' && CAUSE_TEXT.tentacle === 'a tentacle' && CAUSE_NAME.clam === 'Giant clam' && CAUSE_NAME.tentacle === 'Tentacle' &&
      causeEntryId('clam') === 'creature-gclam' && causeEntryId('tentacle') === 'creature-tentacle');
    assert('corpses: both kinds register their art', hasCorpseArt('gclam') && hasCorpseArt('tentacle'));
  }

  // ---- records ----
  {
    const w = fake(room(14, 10));
    const cl = makeCreatureRecord('gclam', 7.5, 8.5, 0, -1, w.tiles, w.w, w.h);
    const bad = makeCreatureRecord('gclam', 7.5, 3.5, 0, -1, w.tiles, w.w, w.h);
    assert('records: a clam needs three flat floor cells under it and water above', cl && cl.ck === CR_GCLAM && cl.dy === -1 && bad === null);
    const wide = fake(['#####', '#...#', '#...#', '#...#', '#####']);
    const t1 = makeCreatureRecord('tentacle', 2.5, 3.5, 0, -1, wide.tiles, wide.w, wide.h);
    const t2 = makeCreatureRecord('tentacle', 2.5, 1.5, 0, 1, wide.tiles, wide.w, wide.h);
    const t3 = makeCreatureRecord('tentacle', 1.5, 2.5, 1, 0, wide.tiles, wide.w, wide.h);
    const t4 = makeCreatureRecord('tentacle', 2.5, 2.5, 0, -1, wide.tiles, wide.w, wide.h);
    assert('records: a tentacle needs rock behind its anchor (floor, ceiling, wall)', t1 && t2 && t3 && !t4 && t1.ck === CR_TENTACLE);
  }

  // ---- giant clam ----
  {
    const w = fake(room(14, 10)); // floor line at y = 9, anchor cell (7, 8): the clam sits at x 7.5
    const rec = makeCreatureRecord('gclam', 7.5, 8.5, 0, -1, w.tiles, w.w, w.h);
    const mk = (ox, oy) => { const cr = createCreatures(); cr.add(rec); return { cr, octo: createOctopus(ox, oy), d: cr.data }; };
    // cycle timing, octopus above the shell (near, outside the mouth)
    {
      const { cr, octo, d } = mk(7.5, 5.0);
      const at = {}; let last = -1;
      run(cr, octo, w, 14, (i, t) => { if (d.state[0] !== last) { last = d.state[0]; if (at[last] === undefined) at[last] = t; } return null; });
      const shut = at[CL_OPENING], open = at[CL_OPEN] - at[CL_OPENING], openFor = at[CL_TREMBLE] - at[CL_OPEN], tremble = at[CL_SNAP] - at[CL_TREMBLE];
      assert(`clam: shut about 2.5-3.5 s, then opens in 0.45 s (${shut.toFixed(2)} s, ${open.toFixed(2)} s)`, shut >= 2.5 - 0.03 && shut <= 3.5 + 0.03 && Math.abs(open - 0.45) < 0.05);
      assert(`clam: open 2 s, then a telegraph of at least 0.4 s (${openFor.toFixed(2)} s, ${tremble.toFixed(2)} s) before the snap`, Math.abs(openFor - CLAM_OPEN_T) < 0.05 && tremble >= 0.4 && Math.abs(tremble - CLAM_TREMBLE_T) < 0.05);
      assert('clam: a snap with nobody in the mouth hurts nobody', octo.hearts === 3 && !octo.dead);
    }
    // rests shut when the octopus is far
    {
      const wide = fake(room(40, 10));
      const c2 = createCreatures(); c2.add(rec);
      const o2 = createOctopus(25, 5);
      run(c2, o2, wide, 12);
      assert('clam: while the octopus is more than 9 tiles away it rests shut', c2.data.state[0] === CL_SHUT && c2.data.ang[0] === 0);
    }
    // the snap kills an octopus in the mouth
    {
      const w2 = fake(room(14, 10));
      const { cr, octo, d } = mk(7.5, 5.0);
      let ev = [];
      ev = ev.concat(run(cr, octo, w2, 8, (i) => { if (d.state[0] === CL_OPEN && !octo.dead) { octo.x = octo.prevX = 7.7; octo.y = octo.prevY = 8.2; } return null; }));
      const snap = ev.find((e) => e.type === 'snap' && e.kill);
      assert('clam: the snap with the octopus centre in the mouth kills it (cause clam, deathStyle clam)', snap && octo.dead && octo.deathStyle === 'clam' && octo.cause === 'clam');
      assert('clam: the dead body stays pinned inside the shell', Math.abs(octo.x - 7.5) < 0.4 && octo.y > 8.3 && octo.y < 9 && d.fed[0] === 1);
    }
    // just outside the mouth: survives, and the shut shell only bonks (no damage)
    {
      const w2 = fake(room(14, 10));
      const { cr, octo, d } = mk(7.5, 5.0);
      run(cr, octo, w2, 6, (i) => { if (d.state[0] === CL_OPEN || d.state[0] === CL_TREMBLE) { octo.x = octo.prevX = 7.5 + 1.15; octo.y = octo.prevY = 8.2; } return null; });
      assert('clam: an octopus just outside the mouth is not caught', !octo.dead && octo.hearts === 3);
      const o2 = createOctopus(7.5, 8.4);
      const c2 = createCreatures(); c2.add(rec);
      const ev = run(c2, o2, w2, 0.2);
      assert(`clam: a shut shell bonks the octopus out without damage (y ${o2.y.toFixed(2)}, vy ${o2.vy.toFixed(1)})`, o2.hearts === 3 && o2.y < 8.2 - 0.36 + 0.01 && !o2.dead && ev.length === 0);
      const o3 = createOctopus(7.5 + 0.9, 8.3); o3.vx = -5;
      const c3 = createCreatures(); c3.add(rec);
      run(c3, o3, w2, 0.3);
      assert('clam: diving into the side of a shut shell pushes the octopus out sideways, unhurt', o3.hearts === 3 && Math.abs(o3.x - 7.5) >= 0.95 && o3.vx > 0);
    }
    // the pearl: one grab while open
    {
      const w2 = fake(room(14, 10));
      const { cr, octo, d } = mk(7.5, 5.0);
      const ev = run(cr, octo, w2, 7, (i) => {
        if (d.state[0] === CL_OPEN && d.t[0] > 0.3 && d.t[0] < 0.4) { octo.x = octo.prevX = 7.5; octo.y = octo.prevY = 8.35; }
        else if (d.state[0] === CL_OPEN && d.t[0] >= 0.4) { octo.x = octo.prevX = 7.5; octo.y = octo.prevY = 5.0; }
        return null;
      });
      const pearls = ev.filter((e) => e.type === 'pearl');
      assert(`clam: touching the pearl while open gives exactly one pearl worth ${PEARL_VALUE}`, pearls.length === 1 && pearls[0].value === PEARL_VALUE && d.pearl[0] === 0);
      assert('clam: after the pearl is gone it still snaps (and the octopus is out of the way)', ev.some((e) => e.type === 'snap') && !octo.dead);
    }
    // trembling still allows the grab
    {
      const w2 = fake(room(14, 10));
      const { cr, octo, d } = mk(7.5, 5.0);
      const ev = run(cr, octo, w2, 7, (i) => { if (d.state[0] === CL_TREMBLE && d.t[0] < 0.1) { octo.x = octo.prevX = 7.5; octo.y = octo.prevY = 8.35; } else if (d.state[0] === CL_TREMBLE) { octo.x = octo.prevX = 7.5; octo.y = octo.prevY = 5; } return null; });
      assert('clam: the pearl can be taken during the tremble too', ev.filter((e) => e.type === 'pearl').length === 1);
    }
    // bomb
    {
      const w2 = fake(room(14, 10));
      const { cr, octo, d } = mk(7.5, 3.0);
      run(cr, octo, w2, 0.1);
      const n = cr.blast(7.5, 7.0, 2.5, octo);
      const ev = cr.events.slice();
      const k = ev.find((e) => e.type === 'killed');
      assert('clam: a bomb blast kills it: a killed event (kind gclam, with velocity and face) and the pearl drops out', n === 1 && k && k.kind === 'gclam' && typeof k.vx === 'number' && typeof k.face === 'number' && ev.some((e) => e.type === 'pearlDrop') && d.alive[0] === 0);
      const { cr: c2, octo: o2, d: d2 } = mk(7.5, 5.0);
      run(c2, o2, w2, 4, (i) => { if (d2.state[0] === CL_OPEN && d2.t[0] < 0.4) { o2.x = o2.prevX = 7.5; o2.y = o2.prevY = 8.35; } else if (d2.state[0] === CL_OPEN) { o2.x = o2.prevX = 7.5; o2.y = o2.prevY = 5; } return null; });
      c2.events.length = 0;
      c2.blast(7.5, 7.0, 2.5, o2);
      assert('clam: a bomb after the pearl was taken kills it with no pearl drop', c2.events.some((e) => e.type === 'killed') && !c2.events.some((e) => e.type === 'pearlDrop'));
      assert('clam: a blast out of range does nothing', (() => { const { cr: c3 } = mk(7.5, 3); return c3.blast(1.5, 1.5, 2.5, null) === 0 && c3.data.alive[0] === 1; })());
    }
    // ink
    {
      const w2 = fake(room(14, 10));
      const { cr, octo, d } = mk(7.5, 3.0);
      run(cr, octo, w2, 0.1);
      const shutHits = cr.hit(7.5, 8.0, 0.4, 5, 'ink', octo);
      let openHits = 0, killed = false;
      run(cr, octo, w2, 5, () => {
        if (d.state[0] === CL_OPEN && d.alive[0]) { openHits += cr.hit(7.5, 8.2, 0.3, 6, 'ink', octo); }
        if (cr.events.some((e) => e.type === 'killed')) killed = true;
        return null;
      });
      assert(`clam: ink does nothing to a shut shell (${shutHits}) but hurts it while open (hp 18: three 6-damage hits kill, ${openHits} hits)`, shutHits === 0 && openHits === 3 && d.alive[0] === 0);
    }
  }

  // ---- tentacle ----
  {
    const w = fake(room(12, 12)); // floor at y = 11, the shell sits at anchor cell (6, 10)
    const rec = makeCreatureRecord('tentacle', 6.5, 10.5, 0, -1, w.tiles, w.w, w.h);
    rec.tilt = 0;
    const mk = (ox, oy) => { const cr = createCreatures(); cr.add(rec); return { cr, octo: createOctopus(ox, oy), d: cr.data }; };
    const stay = (octo, x, y) => () => { octo.x = octo.prevX = x; octo.y = octo.prevY = y; octo.vx = octo.vy = 0; return null; };
    // dormant: never hurts or grabs
    {
      const { cr, octo, d } = mk(6.5, 3.0); // 7+ tiles above the mouth
      const ev = run(cr, octo, w, 6, stay(octo, 6.5, 3.0));
      assert('tentacle: dormant while the octopus is far; it never hurts or grabs', d.state[0] === TN_DORMANT && octo.hearts === 3 && octo.held === 0 && ev.length === 0);
    }
    // wakes when near, touching the awake limb does not hurt
    {
      const { cr, octo, d } = mk(6.5, 7.6); // about 2.4 tiles from the mouth
      let woke = -1;
      run(cr, octo, w, 1.4, (i) => { if (woke < 0 && d.state[0] === TN_WAKE) woke = i * DT; octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 7.6; octo.vx = octo.vy = 0; return null; });
      assert(`tentacle: wakes when the octopus comes near with a clear line (woke at ${woke.toFixed(2)} s, now state ${d.state[0]})`, woke >= 0 && woke < 0.1 && (d.state[0] === TN_WAKE || d.state[0] === TN_REACH));
      assert('tentacle: waking and reaching do no damage', octo.hearts === 3 && octo.held === 0);
    }
    // behind rock: no wake without a line
    {
      const wall = fake(['############', '#..........#', '#....#######', '#....#.....#', '#....#.....#', '############']);
      const r2 = { type: 'creature', ck: CR_TENTACLE, x: 6.5, y: 4.5, dx: 0, dy: -1, side: 1, tilt: 0 };
      const cr = createCreatures(); cr.add(r2);
      const octo = createOctopus(2.5, 3.0);
      run(cr, octo, wall, 3, stay(octo, 2.5, 3.0));
      assert('tentacle: no wake through rock (no clear line)', cr.data.state[0] === TN_DORMANT);
    }
    // strike -> grab -> drag -> eaten
    {
      const { cr, octo, d } = mk(6.5, 8.2); // about 2 tiles from the mouth
      const log = []; let last = -1, grabAt = -1, y0 = 0, y1 = 0;
      const ev = run(cr, octo, w, 6, (i, t) => {
        if (d.state[0] !== last) { last = d.state[0]; log.push(last); }
        if (octo.held > 0) { if (grabAt < 0) { grabAt = t; y0 = octo.y; } if (t >= grabAt + 0.7 && !y1) y1 = octo.y; return null; }
        if (!octo.dead) { octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 8.2; octo.vx = octo.vy = 0; }
        return null;
      });
      assert(`tentacle: wake, reach, strike, grab in order (${log.join('>')})`, log.slice(1, 5).join() === [TN_WAKE, TN_REACH, TN_STRIKE, TN_GRAB].join());
      assert('tentacle: the strike grabbed (a grab event, octo.held set, struggles reset)', ev.some((e) => e.type === 'grab') && grabAt > 2.0 && grabAt < 2.7);
      assert(`tentacle: while held the octopus is dragged towards the shell (y ${y0.toFixed(2)} -> ${y1.toFixed(2)})`, y1 > y0 + 0.5);
      assert('tentacle: not broken free in time, the octopus is eaten (deathStyle eaten, cause tentacle)', octo.dead && octo.deathStyle === 'eaten' && octo.cause === 'tentacle' && d.state[0] === TN_FED && ev.some((e) => e.type === 'eaten'));
    }
    // a miss: the octopus leaves during the strike
    {
      const { cr, octo, d } = mk(6.5, 8.2);
      let moved = false;
      const ev = run(cr, octo, w, 5, () => {
        if (d.state[0] === TN_STRIKE && !moved) { moved = true; octo.x = octo.prevX = 2.0; octo.y = octo.prevY = 3.0; }
        if (!moved) { octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 8.2; }
        octo.vx = octo.vy = 0;
        return null;
      });
      assert('tentacle: a missed strike grabs nothing, retracts and re-arms later', moved && !ev.some((e) => e.type === 'grab') && octo.held === 0 && octo.hearts === 3 && (d.state[0] === TN_DORMANT || d.cd[0] > 0 || d.state[0] === TN_WAKE));
    }
    // three dash struggles free the octopus
    {
      const { cr, octo, d } = mk(6.5, 8.2);
      let grabT = -1, presses = 0, relT = -1, afterGrab = 0;
      const ev = run(cr, octo, w, 12, (i, t) => {
        if (octo.held > 0 && grabT < 0) grabT = t;
        if (grabT >= 0 && relT < 0 && octo.held === 0 && presses === 3) relT = t;
        if (octo.held > 0 && presses < 3 && t >= grabT + 0.3 + presses * 0.2) { presses++; return DASH; }
        if (grabT < 0) { octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 8.2; octo.vx = octo.vy = 0; }
        else if (relT >= 0 && t < relT + TENT_REGRAB_CD - 0.1) { // keep the octopus right beside the mouth: it must not be grabbed again
          afterGrab++; octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 8.2; octo.vx = octo.vy = 0;
        }
        return null;
      });
      const rel = ev.find((e) => e.type === 'release');
      const grabs = ev.filter((e) => e.type === 'grab' && e.step * DT < relT + TENT_REGRAB_CD - 0.1).length;
      assert('tentacle: three dash presses while held free the octopus (held 0, a release event)', presses === 3 && rel && rel.step * DT - grabT < 1.2 && relT >= 0);
      assert(`tentacle: after the release it cannot grab again for ${TENT_REGRAB_CD} s even with the octopus beside it (${grabs} grab, ${afterGrab} steps held there)`, grabs === 1 && afterGrab > 100);
      // the fling and the stun, checked separately
      const t2 = mk(6.5, 8.2);
      let g2 = false, p2 = 0, flung = 0, stunState = -1;
      run(t2.cr, t2.octo, w, 6, (i, t) => {
        if (t2.octo.held > 0) { g2 = true; if (p2 < 3 && t2.d.t[0] > 0.2 + p2 * 0.15) { p2++; return DASH; } }
        else if (!g2) { t2.octo.x = t2.octo.prevX = 6.5; t2.octo.y = t2.octo.prevY = 8.2; t2.octo.vx = t2.octo.vy = 0; }
        if (g2 && p2 === 3 && !flung && t2.octo.held === 0) { flung = Math.hypot(t2.octo.vx, t2.octo.vy); stunState = t2.d.state[0]; }
        return null;
      });
      assert(`tentacle: the release flings the octopus away from the shell at about ${TENT_FLING} u/s (${flung.toFixed(1)}) and the tentacle is stunned (state ${stunState})`, flung > TENT_FLING - 2.5 && stunState === TN_STUN && t2.octo.y < 8.2);
      // and after 3 s it can grab again
      const t3 = mk(6.5, 8.2);
      let g3 = false, p3 = 0, relAt = -1, wokeAgain = -1;
      run(t3.cr, t3.octo, w, 9, (i, t) => {
        if (t3.octo.held > 0) { g3 = true; if (p3 < 3 && t3.d.t[0] > 0.2 + p3 * 0.15) { p3++; return DASH; } }
        else if (!g3 || relAt >= 0) { t3.octo.x = t3.octo.prevX = 6.5; t3.octo.y = t3.octo.prevY = 8.2; t3.octo.vx = t3.octo.vy = 0; }
        if (g3 && p3 === 3 && relAt < 0 && t3.octo.held === 0) relAt = t;
        if (relAt >= 0 && wokeAgain < 0 && t3.d.state[0] === TN_WAKE) wokeAgain = t - relAt;
        return null;
      });
      assert(`tentacle: it wakes again only once the ${TENT_REGRAB_CD} s are over (${wokeAgain.toFixed(2)} s after the release)`, wokeAgain >= TENT_REGRAB_CD - 0.05 && wokeAgain < TENT_REGRAB_CD + 0.3);
    }
    // ink damage frees it too
    {
      const { cr, octo, d } = mk(6.5, 8.2);
      let hits = 0;
      const ev = run(cr, octo, w, 6, (i, t) => {
        if (octo.held > 0 && hits < 3 && d.t[0] > 0.2 + hits * 0.1) { hits += cr.hit(octo.x, octo.y, 0.4, 2, 'ink', octo) ? 1 : 0; return null; }
        if (!octo.held && !hits) { octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 8.2; octo.vx = octo.vy = 0; }
        return null;
      });
      assert(`tentacle: ink hits summing 6 damage on it free the octopus (${hits} hits, hp ${d.hp[0]})`, hits === 3 && ev.some((e) => e.type === 'release') && !octo.dead && d.hp[0] === 8);
    }
    // bomb: kills it and frees a held octopus
    {
      const { cr, octo, d } = mk(6.5, 8.2);
      let did = false;
      run(cr, octo, w, 6, () => {
        if (octo.held > 0 && !did) { did = true; cr.blast(6.5, 9.5, 2.5, octo); }
        if (!did) { octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 8.2; octo.vx = octo.vy = 0; }
        return null;
      });
      assert('tentacle: a bomb while it holds the octopus kills the tentacle and lets go', did && octo.held === 0 && d.alive[0] === 0 && !octo.dead);
      const { cr: c2, d: d2 } = mk(6.5, 3.0);
      const n = c2.blast(6.5, 8.0, 2.5, null);
      const kev = c2.events.find((e) => e.type === 'killed');
      assert('tentacle: a bomb in range kills a dormant one (killed event kind tentacle)', n === 1 && kev && kev.kind === 'tentacle' && d2.alive[0] === 0);
    }
    // a held octopus never ends up inside rock
    {
      const tight = fake(['########', '#......#', '#......#', '#.####.#', '#......#', '########']);
      const r = { type: 'creature', ck: CR_TENTACLE, x: 6.5, y: 4.5, dx: 0, dy: -1, side: 1, tilt: 0 };
      const cr = createCreatures(); cr.add(r);
      const octo = createOctopus(6.5, 2.2);
      let bad = 0;
      run(cr, octo, tight, 5, (i) => { if (octo.held > 0 && tight.isSolid(octo.x, octo.y)) bad++; if (!octo.held && !octo.dead) { octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 2.2; octo.vx = octo.vy = 0; } return null; });
      assert('tentacle: the drag keeps the octopus out of rock', bad === 0);
    }
    // the god-mode hook (styled kills refused): it lets go instead of dragging forever
    {
      const { cr, octo, d } = mk(6.5, 8.2);
      octo.noKill = true;
      const ev = run(cr, octo, w, 4.5, (i) => { if (!octo.held) { octo.x = octo.prevX = 6.5; octo.y = octo.prevY = 8.2; octo.vx = octo.vy = 0; } return null; });
      assert('tentacle: a refused kill (godMode) releases the octopus instead of dragging it for ever', !octo.dead && ev.some((e) => e.type === 'release') && !ev.some((e) => e.type === 'eaten') && d.alive[0] === 1);
    }
  }

  // ---- generated levels ----
  {
    let table = getPatternTable();
    const own = !table;
    if (own) { table = compilePatterns(await loadPatternsJson()); setPatternTable(table); }
    const bank = createRoomBank(await loadBiome1Json());
    bank.fallbackBank = null;
    let clams = 0, tents = 0, badSurface = 0, badStart = 0, badShop = 0, badExit = 0, badPath = 0, badSet = 0, badCap = 0, perKind = { gclam: 0, tentacle: 0 };
    for (let s = 0; s < 10; s++) {
      for (let lv = 0; lv < 3; lv++) {
        const seed = 5101 + s * 211;
        const L = generateLevel(seed, lv, bank);
        const spawns = buildLevelSpawns(L, seed, lv).spawns.filter((r) => r.type === 'creature');
        const solid = (x, y) => x < 0 || y < 0 || x >= LEVEL_W || y >= LEVEL_H || L.tiles[y * LEVEL_W + x] !== 0;
        if (spawns.length > 16) badCap++;
        for (const r of spawns) {
          const cx = Math.floor(r.x), cy = Math.floor(r.y);
          if (r.ck === CR_GCLAM) { clams++; for (let i = -1; i <= 1; i++) if (!solid(cx + i, cy + 1) || solid(cx + i, cy) || solid(cx + i, cy - 1)) badSurface++; }
          else { tents++; if (solid(cx, cy) || !solid(cx - r.dx, cy - r.dy)) badSurface++; }
          if (Math.hypot(r.x - (L.startX + 0.5), r.y - (L.startY + 0.5)) < HAZARD_START_KEEP_OUT) badStart++;
          if (L.shop && r.x >= L.shop.x0 - 4.5 && r.x < L.shop.x1 + 4.5 && r.y >= L.shop.y0 - 4.5 && r.y < L.shop.y1 + 4.5) badShop++;
          if (L.exitX !== undefined && Math.hypot(r.x - L.exitX - 0.5, r.y - L.exitY - 0.5) < 3) badExit++;
          for (let i = 0; i < (L.nSetPieces || 0); i++) { const x0 = L.setPieces[i * 4], y0 = L.setPieces[i * 4 + 1]; if (r.x >= x0 && r.x < x0 + 11 && r.y >= y0 && r.y < y0 + 11) badSet++; }
        }
        if (!finalPathOk(L.tiles, L.startX, L.startY, L.exitX, L.exitY, L.shop, [])) badPath++;
        perKind.gclam += spawns.filter((r) => r.ck === CR_GCLAM).length; perKind.tentacle += spawns.filter((r) => r.ck === CR_TENTACLE).length;
      }
    }
    assert(`levels: 30 generated levels place clams (${clams}) and tentacles (${tents}) only on valid surfaces`, clams > 3 && tents > 2 && badSurface === 0);
    assert('levels: creatures stay out of the start area, the shop, the exit ring and the set pieces; the path stays solvable', badStart === 0 && badShop === 0 && badExit === 0 && badSet === 0 && badPath === 0 && badCap === 0);
    if (own) setPatternTable(null);
  }
}
