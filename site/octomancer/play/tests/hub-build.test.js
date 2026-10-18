// Hub building (octomancer-web/HUB-BUILDING.md): the hoard banked on a clear and on a death, the unlock tiers, the catalogue and
// which pieces fit which spot, the spots laid into the hub map (on real ceilings, floors and walls, inside their rooms), the
// build decision, the pile's stages, the summary row, and the save round-trip (hoard and build survive a reload, junk cleaned).
import { parseAuthoredMap } from '../js/authored.js';
import { parseHubRooms, roomStates, applyHubRooms } from '../js/hub-rooms.js';
import { parseHubBuild, tierOf, pileStage, fitsSpot, decorFor, decoState, pickerRows, decideBuild, placeSpots, spotAt, spotPoint, builtPieces, SPOT_TYPES, CLEAR } from '../js/hub-build.js';
import { ARTS, artOf } from '../js/hub-build-draw.js';
import { createRun, runEvent, gainShells, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, S_END, BIOME_LEVELS, DEATH_BANK, bankedShells } from '../js/run.js';
import { recordDive, getHoard, bankShells, spendHoard, getHubBuild, setHubPiece, resetProgress, _resetForTests } from '../js/save.js';
import { summaryRows } from '../js/runstats.js';
import { ENTRIES } from '../js/journal.js';
import { ATLAS_RECTS } from '../js/sprite-atlas.js';
import { ATLAS_HUB_RECTS } from '../js/sprite-atlas-hub.js';
import { ATLAS_BUILD_RECTS } from '../js/sprite-atlas-build.js';

const KEY = 'octomancer.best.v1';

export async function runHubBuildTests(assert) {
  const hubJson = await (await fetch('../data/hub.json')).json();
  const rooms = parseHubRooms(await (await fetch('../data/hub-rooms.json')).json());
  const T = parseHubBuild(await (await fetch('../data/hub-build.json')).json());
  const ALL = { marlo: 3, pip: 2, quill: 2, host: 1 };
  const level = (story, stat = () => 0) => { const lv = parseAuthoredMap(hubJson); applyHubRooms(lv, rooms, roomStates(rooms, { story, stat })); placeSpots(lv, hubJson.build); return lv; };
  const ctxAll = { story: ALL, stat: (id, s) => (id === 'person-keeper' && s === 'collected' ? 1 : 0) };

  // --- the catalogue ---
  assert('hub build: about 20 decorations (20-26), ids unique', T.decor.length >= 20 && T.decor.length <= 26 && T.byId.size === T.decor.length);
  assert('hub build: every cost is 10-120 shells, every tier 0-3, every piece fits at least one spot type', T.decor.every((d) => d.cost >= 10 && d.cost <= 120 && d.tier >= 0 && d.tier <= 3 && d.fits.length && d.fits.every((f) => SPOT_TYPES.includes(f))));
  assert('hub build: tiers unlock at 0, 50, 150, 400 banked shells', JSON.stringify(T.tiers) === '[0,50,150,400]');
  assert('hub build: every spot type has a tier-0 piece with no other condition (a first build is always possible)', SPOT_TYPES.every((t) => decorFor(T, t).some((d) => d.tier === 0 && !d.need)));
  assert('hub build: every tier has pieces', [0, 1, 2, 3].every((k) => T.decor.some((d) => d.tier === k)));
  assert('hub build: a plaque for each person (Marlo, Pip, Quill, the host, the keeper), each behind its person', ['marlo', 'pip', 'quill', 'host', 'keeper'].every((w) => { const d = T.byId.get('plaque-' + w); return d && d.need && d.hint && d.art === 'plaque' && d.who === w; }));
  assert('hub build: every piece has its art (hub-build-draw.js ARTS); mosaics have a motif', T.decor.every((d) => artOf(d) && (d.art !== 'mosaic' || d.motif)));
  assert('hub build: hanging arts hang (anchor at the top, a rope), floor arts stand (anchor at the base)', T.decor.every((d) => { const a = artOf(d); if (a.mural) return d.fits.every((f) => f === 'mural'); return d.fits.includes('hook') ? a.ay === 0 && a.rope > 0 : a.ay === 1; }));
  const sprites = new Set([...Object.keys(ATLAS_RECTS), ...Object.keys(ATLAS_HUB_RECTS), ...Object.keys(ATLAS_BUILD_RECTS)]);
  assert('hub build: the generated pieces (bench, anchor, net) are in the build atlas', ['driftBench', 'anchor', 'floatNet'].every((n) => ATLAS_BUILD_RECTS[n]) && ['pot', 'anemone', 'idol', 'stone', 'hangingLamp'].every((n) => sprites.has(n)));
  assert('hub build: nothing glossy (no gold, coins or sparkles in the names)', T.decor.every((d) => !/gold|coin|sparkl|gem|treasure/i.test(d.name)));
  void ARTS;

  // --- fit per spot type ---
  const spot = (type) => ({ id: 'x', type, x: 0, y: 0, open: true });
  assert('hub build: a lantern fits a hook, not a floor; a bench fits the plaza only; a mosaic only the mural', fitsSpot(T.byId.get('lantern'), spot('hook')) && !fitsSpot(T.byId.get('lantern'), spot('ledge')) && decorFor(T, 'plaza').some((d) => d.id === 'bench') && T.byId.get('bench').fits.join() === 'plaza' && decorFor(T, 'mural').every((d) => d.art === 'mosaic'));
  assert('hub build: each spot type offers 3+ pieces', SPOT_TYPES.every((t) => decorFor(T, t).length >= 3));

  // --- tiers and the picker's rows ---
  assert('hub build: tierOf 0 / 49 / 50 / 149 / 150 / 400 / 9999', [0, 49, 50, 149, 150, 400, 9999].map((n) => tierOf(T, n)).join() === '0,0,1,1,2,3,3');
  const poor = { shells: 12, lifetime: 60 };
  let st = decoState(T, T.byId.get('bench'), poor, ctxAll);
  assert('hub build: tier 1 is unlocked at 60 lifetime but the bench (40) is too dear with 12 shells', st.unlocked && !st.afford && st.missing === 28);
  st = decoState(T, T.byId.get('net'), poor, ctxAll);
  assert('hub build: tier 2 is locked at 60 lifetime, 90 more to bank', !st.unlocked && st.lock === 'tier' && st.toTier === 90);
  st = decoState(T, T.byId.get('plaque-pip'), { shells: 99, lifetime: 999 }, { story: {}, stat: () => 0 });
  assert('hub build: a plaque stays locked until its person is helped (lock "need")', !st.unlocked && st.lock === 'need');
  assert('hub build: the keeper\'s plaque opens with a purchase (the den\'s condition)', decoState(T, T.byId.get('plaque-keeper'), { shells: 99, lifetime: 999 }, ctxAll).unlocked);
  let rows = pickerRows(T, spot('hook'), '', poor, ctxAll);
  assert('hub build: an empty hook lists the hanging pieces, no Clear row', rows.length === decorFor(T, 'hook').length && !rows.some((r) => r.id === CLEAR) && rows[0].id === 'lantern' && rows[0].afford);
  rows = pickerRows(T, spot('hook'), 'lantern', poor, ctxAll);
  assert('hub build: a built spot lists Clear first (free) and marks the piece standing there', rows[0].id === CLEAR && rows[0].cost === 0 && rows.find((r) => r.id === 'lantern').current);

  // --- the build decision ---
  const H = { shells: 100, lifetime: 200 };
  assert('hub build: decideBuild ok for an affordable, unlocked, fitting piece (its cost)', JSON.stringify(decideBuild(T, spot('hook'), 'lantern', '', H, ctxAll)) === JSON.stringify({ ok: true, cost: 10, reason: '' }));
  assert('hub build: refused: does not fit / unknown / same piece / too dear / tier', decideBuild(T, spot('ledge'), 'lantern', '', H, ctxAll).reason === 'fit' && decideBuild(T, spot('hook'), 'nope', '', H, ctxAll).reason === 'unknown'
    && decideBuild(T, spot('hook'), 'lantern', 'lantern', H, ctxAll).reason === 'same' && decideBuild(T, spot('hook'), 'net', '', { shells: 20, lifetime: 200 }, ctxAll).reason === 'shells' && decideBuild(T, spot('hook'), 'lanterns', '', H, ctxAll).reason === 'tier');
  assert('hub build: Clear is free on a built spot and refused on an empty one', decideBuild(T, spot('hook'), CLEAR, 'bell', H, ctxAll).ok && decideBuild(T, spot('hook'), CLEAR, 'bell', H, ctxAll).cost === 0 && !decideBuild(T, spot('hook'), CLEAR, '', H, ctxAll).ok);
  assert('hub build: replacing a piece costs the new piece\'s full price (no refund)', decideBuild(T, spot('hook'), 'bell', 'lantern', H, ctxAll).cost === 35);

  // --- the pile ---
  assert('hub build: the pile has 5 stages over the balance (0 = the empty ring)', [0, 1, 19, 20, 59, 60, 149, 150, 349, 350, 5000].map((n) => pileStage(T, n)).join() === '0,1,1,2,2,3,3,4,4,5,5');

  // --- the spots in the hub map ---
  const lv = level(ALL, ctxAll.stat), B = lv.build;
  const solid = (x, y) => lv.tiles[Math.floor(y) * lv.w + Math.floor(x)] !== 0;
  assert('hub build: about 12 spots (11-14), ids unique, every type present', B.spots.length >= 11 && B.spots.length <= 14 && new Set(B.spots.map((s) => s.id)).size === B.spots.length && SPOT_TYPES.every((t) => B.spots.some((s) => s.type === t)));
  const bad = [];
  for (const s of B.spots) {
    let ok = true;
    if (s.type === 'hook') ok = solid(s.x, s.y - 0.5) && !solid(s.x, s.y + 0.5) && !solid(s.x, s.y + 1.5) && !solid(s.x, s.y + 2.2);
    else if (s.type === 'ledge' || s.type === 'plaza') { const half = s.type === 'plaza' ? 0.9 : 0.4; ok = [-half, 0, half].every((d) => solid(s.x + d, s.y + 0.5) && !solid(s.x + d, s.y - 0.5) && !solid(s.x + d, s.y - 1.2)); }
    else if (s.type === 'niche') { const d = s.side === 'right' ? 1 : -1; ok = solid(s.x + d * 0.5, s.y) && solid(s.x + d * 0.5, s.y - 0.5) && solid(s.x + d * 0.5, s.y + 0.5) && !solid(s.x - d * 0.5, s.y) && !solid(s.x - d * 1.2, s.y); }
    else if (s.type === 'mural') { for (let y = s.y - s.h / 2; y <= s.y + s.h / 2; y += 0.5) for (let x = s.x - s.w / 2; x <= s.x + s.w / 2; x += 0.5) if (solid(x, y)) ok = false; }
    if (!ok) bad.push(s.id);
  }
  assert('hub build: every spot sits on its surface (a hook on a ceiling, a ledge on a floor with water above, a niche on a wall, the mural in open water)', !bad.length, bad.join());
  assert('hub build: the pile and the tally stone stand on the plaza floor', [B.pile, B.tally].every((p) => solid(p.x, p.y + 0.5) && !solid(p.x, p.y - 0.5)));
  const inRoom = B.spots.filter((s) => s.room);
  assert('hub build: one spot inside each NPC room (in its area)', ['workshop', 'grotto', 'nook', 'arena', 'den'].every((id) => { const s = inRoom.find((q) => q.room === id), r = lv.village.find((v) => v.id === id); return s && r && s.x >= r.x0 - 0.5 && s.x <= r.x1 + 1.5 && s.y >= r.y0 - 0.5 && s.y <= r.y1 + 1.5; }));
  assert('hub build: with every room open, every spot is open', B.spots.every((s) => s.open));
  const fresh = level({}).build;
  assert('hub build: a fresh save: the room spots are closed, the plaza ones open', fresh.spots.every((s) => s.open === !s.room));
  assert('hub build: the spots and the pile keep plants off (keepOut)', lv.keepOut.some((k) => k.x0 <= B.pile.x && k.x1 >= B.pile.x && k.y0 <= B.pile.y && k.y1 >= B.pile.y));
  const s0 = B.spots[0], p0 = spotPoint(s0);
  assert('hub build: spotAt finds a spot from its touch point, not from far away, not a closed one', spotAt(B, p0.x, p0.y).id === s0.id && spotAt(B, p0.x + 6, p0.y + 6) === null && fresh.spots.filter((s) => s.room).every((s) => { const p = spotPoint(s); const f = spotAt(fresh, p.x, p.y); return !f || f.id !== s.id; }));
  const pieces = builtPieces(T, B, { 'plaza-hook-w': 'lantern', 'plaza-floor': 'lantern', 'nook-hook': 'bell', 'ghost-spot': 'bench', 'plaza-mural': 'gone-id' });
  assert('hub build: only known pieces that fit their spot are drawn', pieces.map((p) => p.spot.id + ':' + p.deco.id).sort().join() === 'nook-hook:bell,plaza-hook-w:lantern');

  // --- banking and the save ---
  let stored = null, canStore = true;
  try { stored = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch (e) { canStore = false; }
  if (canStore) {
    try {
      _resetForTests();
      assert('hub build save: a fresh save has an empty hoard and no build', JSON.stringify(getHoard()) === '{"shells":0,"lifetime":0}' && JSON.stringify(getHubBuild()) === '{}');
      // a cleared dive banks what it carries (after spending)
      const run = createRun(5, { tutorialDone: true, rest: false });
      runEvent(run, EV_ENTER_DIVE);
      gainShells(run, 40); run.shells -= 15; // a purchase
      for (let i = 0; i < BIOME_LEVELS; i++) runEvent(run, EV_EXIT);
      assert('hub build: a clear ends the dive with banked = the shells carried (25)', run.state === S_END && run.last.banked === 25);
      recordDive(run.last);
      assert('hub build: recordDive banks a clear into the hoard (balance and lifetime)', getHoard().shells === 25 && getHoard().lifetime === 25);
      // a death keeps everything too (Daniel: DEATH_BANK 1)
      const r2 = createRun(6, { tutorialDone: true });
      runEvent(r2, EV_ENTER_DIVE); gainShells(r2, 33);
      runEvent(r2, EV_DEATH, 'crab');
      assert('hub build: a death banks the carried shells too (DEATH_BANK = 1)', DEATH_BANK === 1 && r2.last.banked === 33 && r2.shells === 0);
      recordDive(r2.last);
      assert('hub build: the death is banked: 58 in the hoard', getHoard().shells === 58 && getHoard().lifetime === 58);
      assert('hub build: bankedShells never banks a negative wallet', bankedShells({ shells: -4 }, true) === 0);
      assert('hub build: the summary shows "Banked: N shells" as a row', summaryRows(r2.last).some(([k, v]) => k === 'Banked' && v === '33 shells') && summaryRows({ ...r2.last, banked: 1 }).some(([k, v]) => k === 'Banked' && v === '1 shell'));
      // spending
      assert('hub build save: spendHoard refuses more than the balance', spendHoard(59) === false && getHoard().shells === 58);
      assert('hub build save: spendHoard takes from the balance, never from lifetime', spendHoard(20) === true && getHoard().shells === 38 && getHoard().lifetime === 58);
      setHubPiece('plaza-hook-w', 'lantern'); setHubPiece('nook-hook', 'bell'); setHubPiece('nook-hook', null); setHubPiece('bad id!', 'x');
      bankShells(7);
      _resetForTests(); // forget memory: read back from storage
      assert('hub build save: the hoard and the build survive a reload', getHoard().shells === 45 && getHoard().lifetime === 65 && JSON.stringify(getHubBuild()) === '{"plaza-hook-w":"lantern"}');
      // junk
      localStorage.setItem(KEY, JSON.stringify({ v: 1, hoard: { shells: -5, lifetime: 'x', pearls: 3 }, hubBuild: { 'ok-spot': 'bench', 'BAD': 'x', 'n': 7, 'x': 'no spaces' } }));
      _resetForTests();
      assert('hub build save: junk is cleaned on load (negative / text counts, bad ids)', JSON.stringify(getHoard()) === '{"shells":0,"lifetime":0}' && JSON.stringify(getHubBuild()) === '{"ok-spot":"bench"}');
      localStorage.setItem(KEY, JSON.stringify({ v: 1, best: 3 }));
      _resetForTests();
      assert('hub build save: an old save (no hoard) starts with an empty hoard', getHoard().shells === 0 && JSON.stringify(getHubBuild()) === '{}');
      bankShells(10); setHubPiece('plaza-floor', 'bench');
      resetProgress();
      assert('hub build save: Reset progress clears the hoard and the build', getHoard().lifetime === 0 && JSON.stringify(getHubBuild()) === '{}');
    } finally {
      try { if (stored === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, stored); } catch (e) { /* */ }
      _resetForTests();
    }
  }

  // --- the journal ---
  const e = ENTRIES.find((x) => x.id === 'place-village');
  assert('hub build: the journal has "Your Village" under Places, counting pieces built', e && e.cat === 'place' && e.name === 'Your Village' && e.where);
}
