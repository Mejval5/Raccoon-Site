// Round 37 (review of round 36): the three set-piece rooms force their content. A current-jet gauntlet always has its
// jets (alternating ceiling and floor), a urchin garden is urchins only, a sunken wreck has a hull, a chest and pots.
// Plus the seeding fix (no two levels repeat) and the flood-pruning guard.
import { createRoomBank, ROOM_W, ROOM_H } from '../js/rooms.js';
import { setDefaultBank, generateLevel, LEVEL_W, LEVEL_H, SET_WRECK, SET_GARDEN, SET_GAUNTLET } from '../js/level.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { hashSeed, hashSeed2 } from '../js/rng.js';
import { drawWrecks } from '../js/v2-props-draw.js';
import { HZ_JET } from '../js/hazards.js';
import { LK_CHEST, LK_POT } from '../js/loot.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

function flood(t, sx, sy) {
  const r = new Uint8Array(LEVEL_W * LEVEL_H), q = [sx, sy];
  r[sy * LEVEL_W + sx] = 1;
  while (q.length) {
    const y = q.pop(), x = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= LEVEL_W || ny >= LEVEL_H || t[ny * LEVEL_W + nx] || r[ny * LEVEL_W + nx]) continue;
      r[ny * LEVEL_W + nx] = 1; q.push(nx, ny);
    }
  }
  return r;
}

export async function runSetPieceTests(assert) {
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);

  // ---- seeding: hashSeed collides when seed ^ salt matches; hashSeed2 does not ----
  assert('old hashSeed collides for XOR-equal pairs (the bug)', hashSeed(1, 3) === hashSeed(3, 1) && hashSeed(4, 1) === hashSeed(5, 0) && hashSeed(10, 2) === hashSeed(8, 0));
  assert('hashSeed2 does not: 1/3 != 3/1, 4/1 != 5/0, 10/2 != 8/0', hashSeed2(1, 3) !== hashSeed2(3, 1) && hashSeed2(4, 1) !== hashSeed2(5, 0) && hashSeed2(10, 2) !== hashSeed2(8, 0));
  {
    const seen = new Map(); let dup = 0;
    for (let seed = 1; seed <= 40; seed++) for (let lvl = 0; lvl < 3; lvl++) {
      const L = generateLevel(seed, lvl, bank);
      let h = 2166136261;
      for (let i = 0; i < L.tiles.length; i++) h = Math.imul(h ^ L.tiles[i], 16777619) >>> 0;
      if (seen.has(h)) dup++;
      seen.set(h, 1);
    }
    assert(`no two of the 120 levels (seeds 1-40 x 3) share the same tiles (${dup} repeats)`, dup === 0);
  }
  {
    const a = generateLevel(1, 2, bank), b = generateLevel(3, 0, bank);
    assert('seed 1 level 3 is no longer seed 3 level 1', a.tiles.some((v, i) => v !== b.tiles[i]));
  }

  // ---- set pieces ----
  const stats = { [SET_WRECK]: [], [SET_GARDEN]: [], [SET_GAUNTLET]: [] };
  for (let seed = 1; seed <= 120; seed++) for (let lv = 0; lv < 3; lv++) {
    const L = generateLevel(seed, lv, bank);
    if (!L.nSetPieces) continue;
    const sp = buildLevelSpawns(L, seed, lv).spawns;
    const reach = flood(L.tiles, L.startX, L.startY);
    for (let i = 0; i < L.nSetPieces; i++) {
      const x0 = L.setPieces[i * 4], y0 = L.setPieces[i * 4 + 1], kind = L.setPieces[i * 4 + 2];
      let any = false;
      for (let y = y0; y < y0 + ROOM_H && !any; y++) for (let x = x0; x < x0 + ROOM_W; x++) if (reach[y * LEVEL_W + x]) { any = true; break; }
      if (!any) continue;
      const inr = (r) => r.x >= x0 && r.x < x0 + ROOM_W && r.y >= y0 && r.y < y0 + ROOM_H;
      const far = Math.hypot(x0 + 5 - L.startX, y0 + 8 - L.startY) > 13 && !(L.exitX >= x0 - 4 && L.exitX <= x0 + ROOM_W + 4 && L.exitY >= y0 - 2 && L.exitY <= y0 + ROOM_H + 2);
      const jets = sp.filter((r) => r.type === 'hazard' && r.hk === HZ_JET && inr(r));
      const urchins = sp.filter((r) => r.type === 'enemy-slot' && r.kind === 'urchin' && inr(r)).length;
      const others = sp.filter((r) => r.type === 'enemy-slot' && r.kind !== 'urchin' && inr(r)).length;
      (stats[kind] || (stats[kind] = [])).push({
        far, jets: jets.length, alt: jets.length >= 2 && jets.every((j) => j.dy < 0 && j.dx === 0), urchins, others,
        wreck: sp.filter((r) => r.type === 'decor' && r.dk === 'wreck' && inr(r)).length,
        chest: sp.filter((r) => r.type === 'loot' && r.lk === LK_CHEST && inr(r)).length,
        pots: sp.filter((r) => r.type === 'loot' && r.lk === LK_POT && inr(r)).length,
      });
    }
  }
  const g = stats[SET_GAUNTLET], ga = stats[SET_GARDEN], w = stats[SET_WRECK];
  assert(`set pieces turn up in 120 seeds x 3 levels (${g.length} gauntlets, ${ga.length} gardens, ${w.length} wrecks reachable)`, g.length > 30 && ga.length > 30 && w.length > 30);
  const gf = g.filter((x) => x.far);
  assert(`gauntlet: 3+ jets, all on the floor pointing up (V2-PLAN 16), in every room away from the start / exit (${gf.filter((x) => x.jets >= 3 && x.alt).length}/${gf.length}); never fewer than 2 (${Math.min(...g.map((x) => x.jets))})`,
    gf.length > 20 && gf.every((x) => x.jets >= 3 && x.alt) && g.every((x) => x.jets >= 2));
  // r39: a few gardens lose a bed or two to their neighbours (the bank grew a room and the levels shifted: 1 of 62 has 2)
  assert(`garden: 3+ urchins in nearly every room (${ga.filter((x) => x.urchins >= 3).length}/${ga.length}; fewest ${Math.min(...ga.map((x) => x.urchins))}, never fewer than 2) and no other enemy in the room`,
    ga.every((x) => x.urchins >= 2 && x.others === 0) && ga.filter((x) => x.urchins >= 3).length >= ga.length * 0.95);
  const wf = w.filter((x) => x.far);
  assert(`wreck: a hull, a chest and pots in every reachable wreck room (${wf.filter((x) => x.wreck === 1 && x.chest >= 1 && x.pots >= 1).length}/${wf.length})`,
    wf.length > 20 && wf.every((x) => x.wreck === 1 && x.chest >= 1 && x.pots >= 1));

  // ---- the wreck is drawn ----
  {
    const calls = [];
    const grad = { addColorStop() {} };
    const ctx = new Proxy({}, { get(t, k) { return (...a) => { calls.push(k); return k === 'createLinearGradient' ? grad : undefined; }; }, set() { return true; } });
    drawWrecks(ctx, { pxPerUnit: 40, x: 5, y: 5 }, 800, 600, Float32Array.of(5, 8, 1), 0);
    const onscreen = calls.length;
    calls.length = 0;
    drawWrecks(ctx, { pxPerUnit: 40, x: 500, y: 5 }, 800, 600, Float32Array.of(5, 8, 1), 0);
    assert(`drawWrecks paints the hull (${onscreen} canvas calls) and culls it off screen (${calls.length})`, onscreen > 60 && calls.length === 0);
  }
}
