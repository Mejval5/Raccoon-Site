// Round 36: level detail. Dense rooms (quantum cells, anchors, structure, ten more rooms), about twice the props and
// decorations per level (pattern-driven clams, pots, foliage clusters, rune carvings and boulders), and the speed
// of building a level.
import { createRoomBank, ROOM_W, ROOM_H } from '../js/rooms.js';
import { setDefaultBank, generateLevel, finalPathOk, LEVEL_W, LEVEL_H } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { createDecor, findPlantAnchors, findClusterMates } from '../js/decor.js';
import { drawDecorBoulders } from '../js/v2-props-draw.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

// what one Shallows level carried before round 36 (30 seeds x 3 levels, round-35 rooms and caps, tests run in node)
const BASE_PROPS = 4.67;      // clams + pots + chests
const BASE_DECOR = 94.9;      // fish and bushes (critters) + hash-gated plant anchors + their cluster mates

function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push(k); return k === 'createRadialGradient' || k === 'createLinearGradient' ? grad : undefined; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

export async function runDetailTests(assert) {
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);

  // ---- counts per level ----
  const SEEDS = 30;
  let fossils = 0, levels = 0, props = 0, decorN = 0, boulders = 0, runes = 0, foliage = 0, decorBad = 0, runeCrit = 0, clams = 0, pots = 0;
  const times = [];
  for (let seed = 1; seed <= SEEDS; seed++) for (let lvl = 0; lvl < 3; lvl++) {
    const t0 = performance.now();
    const world = createLevelWorld(seed, lvl);
    times.push(performance.now() - t0);
    const L = world.level, res = world.residentChunks()[0];
    const sp = res.chunk.spawns;
    levels++;
    for (const s of sp) {
      if (s.type === 'loot' && s.lk >= 1 && s.lk <= 3) { props++; if (s.lk === 1) clams++; if (s.lk === 2) pots++; }
      if (s.type !== 'decor') continue;
      const tx = Math.floor(s.x), ty = Math.floor(s.y);
      if (s.dk === 'wreck') continue; // r37: the wreck set piece stands on the floor line (checked in setpieces.test.js)
      if (s.dk === 'boulder') boulders++;
      if (s.dk === 'foliage') foliage++;
      if (s.dk === 'fossil') { // r37: embedded in thick rock
        fossils++;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (L.tiles[(ty + oy) * L.w + tx + ox] === 0) decorBad++;
        continue;
      }
      if (s.dk === 'rune') {
        runes++;
        if (L.tiles[ty * L.w + tx] === 0 || L.tiles[(ty + s.dy) * L.w + tx + s.dx] !== 0) decorBad++; // on rock, water in front
      } else if (L.tiles[ty * L.w + tx] !== 0 || L.tiles[(ty - s.dy) * L.w + tx] === 0) decorBad++;  // in water, standing on its surface
      if (L.shop && tx >= L.shop.x0 - 5 && tx < L.shop.x1 + 5 && ty >= L.shop.y0 - 5 && ty < L.shop.y1 + 5) decorBad++;
    }
    const decor = createDecor(L.w, L.h); decor.update(0.02, [res]);
    const crit = decor.visibleCritters([res]);
    runeCrit += crit.filter((c) => c.kind.startsWith('rune')).length;
    const plants = findPlantAnchors(res.chunk, L.w, L.h, 0);
    decorN += crit.length + plants.length;
    for (const a of plants) decorN += findClusterMates(res.chunk, L.w, L.h, a.tx, a.ty, a.onCeiling, a.hash).length;
  }
  const pPer = (props + boulders) / levels, dPer = decorN / levels;
  assert(`detail: pattern-placed props per level (clams ${(clams / levels).toFixed(1)}, pots ${(pots / levels).toFixed(1)}, chests, boulders ${(boulders / levels).toFixed(1)}) are about double the round-35 level: ${pPer.toFixed(1)} vs ${BASE_PROPS}`, pPer >= BASE_PROPS * 2);
  assert(`detail: clams, pots and chests alone are at least ${(BASE_PROPS * 1.8).toFixed(1)} per level (${(props / levels).toFixed(1)})`, props / levels >= BASE_PROPS * 1.8);
  assert(`detail: decorations per level (fish, bushes, plants with their cluster mates, rune carvings, foliage clusters) are close to double: ${dPer.toFixed(0)} vs ${BASE_DECOR}`, dPer >= BASE_DECOR * 1.75);
  assert(`detail: ${(runes / levels).toFixed(1)} rune carvings, ${(foliage / levels).toFixed(1)} foliage clusters, ${(boulders / levels).toFixed(1)} boulders per level, all on the right surface and clear of the shop (${decorBad} bad)`, runes / levels > 6 && foliage / levels > 15 && boulders / levels > 3 && decorBad === 0);
  assert(`detail: the rune carvings reach the critter layer (${(runeCrit / levels).toFixed(1)} per level) and sit in their rock tile`, runeCrit / levels > 5);

  // ---- decor never blocks the swim path: it is not in the tile grid and not a hazard blocker ----
  {
    let bad = 0, n = 0;
    for (let seed = 1; seed <= 20; seed++) for (let lvl = 0; lvl < 3; lvl++) {
      const L = generateLevel(seed, lvl, bank);
      const sp = buildLevelSpawns(L, seed, lvl).spawns;
      n++;
      if (!sp.some((s) => s.type === 'decor')) bad++;
      if (!finalPathOk(L.tiles, L.startX, L.startY, L.exitX, L.exitY, L.shop)) bad++;
    }
    assert(`detail: decor is placed on every level (${n}) and the A* path to the exit is still open on each`, bad === 0);
  }

  // ---- boulder drawing ----
  {
    const ctx = recCtx();
    const list = Float32Array.from([10.5, 10.5, -1, 3, 14.5, 10.5, -1, 8]);
    drawDecorBoulders(ctx, { x: 12, y: 10, pxPerUnit: 40 }, 800, 600, list, (x, y) => (y >= 11 ? 1 : 0));
    assert('detail: a boulder pair is drawn per anchor (filled facets and an outline)', ctx.calls.filter((k) => k === 'fill').length >= 20);
    const ctx2 = recCtx();
    drawDecorBoulders(ctx2, { x: 12, y: 10, pxPerUnit: 40 }, 800, 600, list, () => 0);
    assert('detail: a boulder whose rock is gone (bombed) is not drawn', ctx2.calls.filter((k) => k === 'fill').length === 0);
  }

  // ---- level generation time ----
  {
    const t = [];
    // each level is built three times and its fastest build counts: a garbage collection or another tab taking the CPU for one
    // build is noise, not the cost of the level (2026-10-08: the single timing was flaky on a busy machine)
    for (let i = 0; i < 160; i++) {
      let best = Infinity;
      for (let r = 0; r < 3; r++) { const t0 = performance.now(); const L = generateLevel(900 + i, i % 3, bank); buildLevelSpawns(L, 900 + i, i % 3); best = Math.min(best, performance.now() - t0); }
      t.push(best);
    }
    t.sort((a, b) => a - b);
    const p95 = t[Math.floor(t.length * 0.95)], med = t[t.length >> 1];
    times.sort((a, b) => a - b);
    assert(`detail: building a level (generate + spawns) has a p95 under 8 ms (median ${med.toFixed(1)}, p95 ${p95.toFixed(1)}; whole world incl. walls p95 ${times[Math.floor(times.length * 0.95)].toFixed(1)})`, p95 < 8);
  }
}
