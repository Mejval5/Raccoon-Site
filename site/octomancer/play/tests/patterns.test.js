// Round 30 (pattern spawning): the matcher on hand-made grids, the pattern table's shape, caps and the
// 1-1 / 1-2 / 1-3 ramp on real levels, and the A* guarantee for hazards.
import { compilePatterns, matchPatterns, selectSpawns, setPatternTable, getPatternTable, KERNEL, NLEVELS } from '../js/patterns.js';
import { createRoomBank } from '../js/rooms.js';
import { generateLevel, finalPathOk, LEVEL_W, LEVEL_H } from '../js/level.js';
import { buildLevelSpawns, START_SAFE_RADIUS } from '../js/level-spawns.js';
import { hazardBlockers, HAZARD_CODE } from '../js/hazards.js';
import { LOOT_CODE } from '../js/loot.js';
import { createEnemies } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { pathSolvable } from '../js/pathcheck.js';
import { loadBiome1Json } from './biome1.test.js';
import { mulberry32 } from '../js/rng.js';

export async function loadPatternsJson() {
  const res = await fetch('../data/patterns.json');
  return res.json();
}
/** Compile data/patterns.json and register it for level-spawns.js (the game does this in main.js). */
export async function registerPatternTable() {
  const t = compilePatterns(await loadPatternsJson());
  setPatternTable(t);
  return t;
}

/** Grid from rows: '#' rock, anything else water. */
function grid(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  return { tiles, w, h };
}
const one = (p) => compilePatterns({ patterns: [{ id: 'p', kind: 'hazard', spawn: 'anemone', anchor: [2, 2], flips: '', dir: [0, -1], chance: [1], cap: [99], ...p }] });
const hitList = (t, g) => {
  const { hits, n } = matchPatterns(t, g.tiles, g.w, g.h);
  const out = [];
  for (let i = 0; i < n; i++) out.push([hits[i * 3], hits[i * 3 + 1], hits[i * 3 + 2]]);
  return out;
};
/** Brute-force reference for one variant: every kernel cell read the slow way. */
function naiveHits(t, tiles, w, h) {
  const out = new Set();
  for (let v = 0; v < t.nv; v++) {
    for (let oy = -2; oy <= h - 3; oy++) {
      for (let ox = -2; ox <= w - 3; ox++) {
        let ok = true;
        for (let ky = 0; ky < KERNEL && ok; ky++) {
          for (let kx = 0; kx < KERNEL; kx++) {
            const tx = ox + kx, ty = oy + ky;
            const rock = tx < 0 || ty < 0 || tx >= w || ty >= h || tiles[ty * w + tx] !== 0;
            const bit = 1 << (ky * KERNEL + kx);
            if ((t.vRock[v] & bit) && !rock) { ok = false; break; }
            if ((t.vWater[v] & bit) && rock) { ok = false; break; }
          }
        }
        if (!ok) continue;
        const ax = ox + t.vAx[v], ay = oy + t.vAy[v];
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        out.add(v + ',' + ax + ',' + ay);
      }
    }
  }
  return out;
}

export async function runPatternTests(assert) {
  const json = await loadPatternsJson();
  const table = compilePatterns(json);
  const prev = getPatternTable();

  // ---- the data file ----
  const ENEMY_KINDS = ['piranha', 'crab', 'cannon', 'manta', 'urchin', 'horns'];
  const HAZARD_KINDS = Object.keys(HAZARD_CODE).concat('jetspikes'); // jetspikes = a jet + the spike strip at the end of its stream (V2-PLAN 16)
  let shapeBad = '';
  for (const p of json.patterns) {
    if (!p.id || !['enemy', 'hazard', 'loot', 'decor', 'creature', 'terrain'].includes(p.kind)) shapeBad += ' kind:' + p.id;
    if (p.kind === 'enemy' ? !ENEMY_KINDS.includes(p.spawn) : p.kind === 'hazard' ? !HAZARD_KINDS.includes(p.spawn) : p.kind === 'decor' ? !['foliage', 'rune', 'boulder', 'fossil'].includes(p.spawn) : p.kind === 'creature' ? !['gclam', 'tentacle'].includes(p.spawn) : p.kind === 'terrain' ? !['shortcut', 'plug'].includes(p.spawn) : !Object.keys(LOOT_CODE).includes(p.spawn)) shapeBad += ' spawn:' + p.id;
    if (p.rows.length !== 5 || p.rows.some((r) => !/^[#.?]{5}$/.test(r))) shapeBad += ' rows:' + p.id;
    if (p.rows[p.anchor[1]][p.anchor[0]] !== (p.spawn === 'pocket' || p.spawn === 'rune' || p.spawn === 'fossil' || p.kind === 'terrain' ? '#' : '.')) shapeBad += ' anchor:' + p.id; // a hidden pocket's, a rune's and a fish-bone plug's anchor is a rock tile
    if (p.chance.length !== NLEVELS || p.cap.length !== NLEVELS || p.chance.some((c) => c < 0 || c > 1) || p.cap.some((c) => c < 0 || !Number.isInteger(c))) shapeBad += ' ramp:' + p.id;
  }
  assert('patterns: every entry has a 5x5 kernel, a water anchor, a known spawn and a chance and cap for each of 1-1, 1-2, 1-3' + shapeBad, shapeBad === '');
  const ids = new Set(json.patterns.map((p) => p.spawn));
  assert('patterns: the table covers all six enemies and all five hazards', ENEMY_KINDS.every((k) => ids.has(k)) && HAZARD_KINDS.every((k) => ids.has(k)));

  // ---- compile: masks and flips ----
  {
    const t = one({ rows: ['?????', '?...?', '?...?', '?###?', '?????'], flips: 'hv' });
    // symmetric left-right: h adds nothing new, v does, hv equals v -> 2 variants
    assert(`patterns: a left-right symmetric kernel with flips "hv" compiles to 2 variants (${t.nv})`, t.nv === 2);
    const t2 = one({ rows: ['?#???', '?#.??', '?#.??', '?###?', '?????'], flips: 'hv', dir: [1, 0] });
    assert(`patterns: an asymmetric kernel with flips "hv" compiles to 4 variants (${t2.nv})`, t2.nv === 4);
    assert('patterns: flips mirror the anchor and the facing (wall on the right faces left)', (() => {
      for (let v = 0; v < t2.nv; v++) if (t2.vFlip[v] === 1) return t2.vDx[v] === -1 && t2.vAx[v] === 2;
      return false;
    })());
    const t3 = one({ rows: ['#....', '.....', '..?..', '.....', '....#'] });
    assert('patterns: the need-rock and need-water masks hold one bit per "#" and "." cell', (() => {
      const pop = (n) => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };
      return pop(t3.vRock[0]) === 2 && pop(t3.vWater[0]) === 22 && (t3.vRock[0] & t3.vWater[0]) === 0 && (t3.vRock[0] & 1) === 1 && (t3.vRock[0] >> 24 & 1) === 1;
    })());
  }

  // ---- the matcher on hand-made grids ----
  {
    // an open pool: water x 0..11, y 0..6, two rows of rock under it
    const g = grid(['............', '............', '............', '............', '............', '............', '............', '############', '############']);
    const floor = one({ rows: ['?????', '?...?', '?...?', '?###?', '?????'] });
    const hits = hitList(floor, g);
    const want = []; for (let x = 1; x <= 10; x++) want.push([0, x, 6]);
    assert(`matcher: a floor kernel hits exactly the 10 cells with a full 3-wide floor under them (${hits.length})`,
      hits.length === 10 && want.every((w) => hits.some((h) => h[0] === w[0] && h[1] === w[1] && h[2] === w[2])));
    // the same kernel flipped up-down finds ceilings, and the tile array above sees rows outside as rock
    const ceil = one({ rows: ['?????', '?###?', '?...?', '?...?', '?????'], flips: 'v', dir: [0, 1] });
    const both = hitList(ceil, g);
    const flipped = both.filter((h) => h[0] === 1);
    assert('matcher: the up-down flip of a ceiling kernel finds the same floor cells and faces up',
      flipped.length === 10 && flipped.every((h) => h[2] === 6) && ceil.vDy[1] === -1);
    assert('matcher: the level edge counts as rock (the pool top row is a ceiling for the unflipped kernel)', both.filter((h) => h[0] === 0).length === 10 && both.filter((h) => h[0] === 0).every((h) => h[2] === 0));
    // walls left and right
    const w2 = grid(['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '##########']);
    const wall = one({ rows: ['?????', '?#.??', '?#.??', '?#.??', '?????'], flips: 'h', dir: [1, 0] });
    const wh = hitList(wall, w2);
    const left = wh.filter((h) => wall.vDx[h[0]] === 1), right = wh.filter((h) => wall.vDx[h[0]] === -1);
    assert(`matcher: a wall kernel with an h flip finds both walls (${left.length} left-wall hits facing right, ${right.length} right-wall facing left)`,
      wh.length === 6 && left.length === 3 && right.length === 3 && left.every((h) => h[1] === 1 && h[2] >= 2 && h[2] <= 4) && right.every((h) => h[1] === 8));
    const anyWater = hitList(one({ rows: ['?????', '?????', '??.??', '?????', '?????'] }), g);
    const needBelowRock = hitList(one({ rows: ['?????', '?????', '??.??', '??#??', '?????'] }), g);
    assert('matcher: "?" cells accept rock and water (an anchor-only kernel hits every water cell), and a rock cell below the anchor narrows it to the floor row',
      anyWater.length === 7 * 12 && needBelowRock.length === 12 && needBelowRock.every((h) => h[2] === 6));
  }

  // ---- the fast matcher equals the brute-force reference on real levels ----
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = null;
  {
    let same = 0, total = 0, hitsTotal = 0;
    for (let s = 0; s < 6; s++) {
      const lv = generateLevel(101 + s * 977, s % 3, bank);
      const fast = matchPatterns(table, lv.tiles, lv.w, lv.h);
      const a = new Set();
      for (let i = 0; i < fast.n; i++) a.add(fast.hits[i * 3] + ',' + fast.hits[i * 3 + 1] + ',' + fast.hits[i * 3 + 2]);
      const b = naiveHits(table, lv.tiles, lv.w, lv.h);
      total++; hitsTotal += a.size;
      if (a.size === b.size && fast.n === a.size && [...a].every((k) => b.has(k))) same++;
    }
    assert(`matcher: same hits as a cell-by-cell reference on ${total} real levels (${hitsTotal} hits)`, same === total && hitsTotal > 300);
  }

  // ---- select: cap, chance, spacing, level ramp on a synthetic table ----
  {
    const g = grid(Array.from({ length: 12 }, (_, y) => (y >= 10 ? '#'.repeat(40) : '.'.repeat(40))));
    const t = one({ rows: ['?????', '?...?', '?...?', '?###?', '?????'], cap: [2, 3, 5], chance: [1, 1, 0], sep: 3 });
    const hit = matchPatterns(t, g.tiles, g.w, g.h);
    const run = (lvl, rng = mulberry32(5)) => selectSpawns(t, hit, lvl, rng, (p, x, y) => ({ type: 'x', x, y }));
    const c0 = run(0), c1 = run(1), c2 = run(2), c9 = run(9);
    assert(`select: the per-level cap holds (1-1: ${c0.length}, 1-2: ${c1.length}) and a chance of 0 places nothing (1-3: ${c2.length}); deeper levels reuse the last column (${c9.length})`,
      c0.length === 2 && c1.length === 3 && c2.length === 0 && c9.length === 0);
    const spaced = c1.every((a, i) => c1.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) >= 3));
    assert('select: spawns keep the pattern spacing from each other', spaced);
    const t2 = one({ rows: ['?????', '?...?', '?...?', '?###?', '?????'], cap: [9], chance: [1], sep: 1 });
    const h2 = matchPatterns(t2, g.tiles, g.w, g.h);
    const used = selectSpawns(t2, h2, 0, mulberry32(3), () => null);
    const occ = selectSpawns(t2, h2, 0, mulberry32(3), (p, x, y) => ({ x, y }), [5.5, 9.5, 100]);
    assert('select: a build() that returns null places nothing and a huge occupied spacing blocks the cells', used.length === 0 && occ.every((r) => Math.hypot(r.x - 5.5, r.y - 9.5) >= 100) && occ.length === 0 || occ.length <= 1);
    const a = selectSpawns(t2, h2, 0, mulberry32(11), (p, x, y) => ({ x, y })).map((r) => r.x + ',' + r.y).join(';');
    const b = selectSpawns(t2, h2, 0, mulberry32(11), (p, x, y) => ({ x, y })).map((r) => r.x + ',' + r.y).join(';');
    assert('select: the same rng gives the same spawns', a === b && a.length > 0);
  }

  // ---- real levels: caps, ramp, placement, determinism ----
  setPatternTable(table);
  const SEEDS = 40;
  const perLevel = [[], [], []]; // per level: array of {total, hazards, byId}
  let capBad = '', startBad = 0, rockBad = 0, detBad = 0, calmBad = 0, noKind = 0, bad0 = '';
  const capOf = new Map(json.patterns.map((p) => [p.id, p.cap]));
  for (let s = 0; s < SEEDS; s++) {
    for (let lv = 0; lv < 3; lv++) {
      const seed = 3001 + s * 131;
      const L = generateLevel(seed, lv, bank);
      const spAll = buildLevelSpawns(L, seed, lv).spawns.filter((x) => x.pid);
      const sp = spAll.filter((x) => x.type !== 'decor'); // r36: decor is scenery, it may stand near the start and the shop
      const byId = {};
      let hazards = 0;
      for (const r of spAll) byId[r.pid] = (byId[r.pid] || 0) + 1;
      for (const r of sp) {
        if (r.type === 'hazard') hazards++;
        if (Math.hypot(r.x - (L.startX + 0.5), r.y - (L.startY + 0.5)) < START_SAFE_RADIUS) startBad++;
        if (r.type === 'enemy-slot' && (!r.kind || L.tiles[Math.floor(r.y) * LEVEL_W + Math.floor(r.x)] !== 0)) noKind++;
        if (r.type === 'hazard' && L.tiles[Math.floor(r.y) * LEVEL_W + Math.floor(r.x)] !== 0 && r.hk !== 2 && r.hk !== 1) rockBad++;
        if (L.shop && r.x >= L.shop.x0 - 4.5 && r.x < L.shop.x1 + 4.5 && r.y >= L.shop.y0 - 4.5 && r.y < L.shop.y1 + 4.5) calmBad++;
      }
      for (const id in byId) if (byId[id] > capOf.get(id)[lv]) capBad += ` ${id}@${lv}:${byId[id]}`;
      for (const p of json.patterns) if (p.cap[lv] === 0 && byId[p.id]) bad0 += ` ${p.id}@${lv}`;
      perLevel[lv].push({ total: sp.length, hazards, byId });
      if (s < 5) {
        const again = buildLevelSpawns(L, seed, lv).spawns.filter((x) => x.pid).map((x) => x.pid + x.x + x.y).join();
        if (again !== spAll.map((x) => x.pid + x.x + x.y).join()) detBad++;
      }
    }
  }
  assert('spawns: no pattern exceeds its per-level cap' + capBad, capBad === '');
  assert('spawns: a pattern whose cap is 0 on a level never appears there' + bad0, bad0 === '');
  const avg = (lv, f) => perLevel[lv].reduce((a, r) => a + f(r), 0) / SEEDS;
  const tot = [0, 1, 2].map((l) => avg(l, (r) => r.total)), haz = [0, 1, 2].map((l) => avg(l, (r) => r.hazards));
  assert(`ramp: average spawns per level grow 1-1 < 1-2 < 1-3 (${tot.map((x) => x.toFixed(1)).join(' < ')}); hazards too (${haz.map((x) => x.toFixed(1)).join(' < ')})`,
    tot[0] < tot[1] && tot[1] < tot[2] && haz[0] < haz[1] && haz[1] < haz[2]);
  assert(`ramp: 1-1 already has a few spawns (${tot[0].toFixed(1)}) and at least one hazard type (${haz[0].toFixed(1)})`, tot[0] >= 6 && haz[0] >= 1);
  assert('spawns: nothing within the start safe radius, enemies never in rock, none beside the shop room' + ` (${startBad}/${noKind}/${calmBad})`, startBad === 0 && noKind === 0 && calmBad === 0);
  assert('spawns: same seed and level give the same pattern spawns', detBad === 0);
  assert('spawns: all six enemy kinds and all five hazards turn up across the sample', (() => {
    const seen = new Set();
    for (const lv of perLevel) for (const r of lv) for (const id in r.byId) seen.add(json.patterns.find((p) => p.id === id).spawn);
    return [...ENEMY_KINDS, ...HAZARD_KINDS].every((k) => seen.has(k));
  })());

  // ---- the enemies the pattern names are the enemies that spawn ----
  {
    const L = generateLevel(77, 2, bank);
    const slots = buildLevelSpawns(L, 77, 2).spawns.filter((s) => s.type === 'enemy-slot');
    const en = createEnemies();
    const chunk = { tiles: L.tiles, width: L.w, height: L.h, spawns: slots, salt: 1, noDepthGate: true };
    en.update(0.02, 0, createOctopus(L.exitX + 0.5, L.exitY + 0.5), { isSolid: (x, y) => L.tiles[Math.floor(y) * L.w + Math.floor(x)] !== 0, wallSegmentsNear: undefined }, [{ index: 0, yOffset: 0, chunk }]);
    const kinds = en.all().map((e) => e.kind).sort().join();
    assert(`enemies: each pattern's kind is what spawns (${slots.length} slots, ${en.all().length} enemies)`, slots.length > 0 && kinds === slots.map((s) => s.kind).sort().join());
  }

  // ---- A*: hazards never make the exit (or the shop) unreachable ----
  {
    let checked = 0, failed = 0, blockingSeen = 0;
    for (let s = 0; s < 50; s++) {
      for (let lv = 0; lv < 3; lv++) {
        const seed = 9001 + s * 37;
        const L = generateLevel(seed, lv, bank);
        const bl = [];
        for (const r of buildLevelSpawns(L, seed, lv).spawns) if (r.type === 'hazard') hazardBlockers(r, bl);
        checked++; blockingSeen += bl.length > 0 ? 1 : 0;
        if (!finalPathOk(L.tiles, L.startX, L.startY, L.exitX, L.exitY, L.shop, bl)) failed++;
      }
    }
    assert(`hazards A*: blockers of the placed hazards leave the exit and shop reachable on ${checked} levels (${blockingSeen} have blocking hazards)`, failed === 0 && blockingSeen > 30);
    // a table that tries to put spikes, rocks and anemones everywhere must be pruned back to something solvable
    const flood = compilePatterns({ patterns: [
      { id: 'all-spikes', kind: 'hazard', spawn: 'spikes', anchor: [2, 2], flips: 'h', dir: [1, 0], chance: [1], cap: [200], sep: 1.2, rows: ['?????', '?#...', '?#...', '?#...', '?????'] },
      { id: 'all-anemone', kind: 'hazard', spawn: 'anemone', anchor: [2, 2], flips: '', dir: [0, -1], chance: [1], cap: [200], sep: 1.2, rows: ['?????', '?...?', '?...?', '?###?', '?????'] },
      { id: 'all-rock', kind: 'hazard', spawn: 'rock', anchor: [2, 2], flips: 'h', dir: [0, 1], chance: [1], cap: [200], sep: 1.2, rows: ['?????', '??#??', '?#...', '??...', '??...'] },
    ] });
    setPatternTable(flood);
    let pruned = 0, unsolved = 0, placedTotal = 0;
    for (let s = 0; s < 12; s++) {
      const seed = 555 + s * 17;
      const L = generateLevel(seed, 1, bank);
      const hz = buildLevelSpawns(L, seed, 1).spawns.filter((r) => r.type === 'hazard');
      const bl = []; for (const r of hz) hazardBlockers(r, bl);
      placedTotal += hz.length;
      if (!finalPathOk(L.tiles, L.startX, L.startY, L.exitX, L.exitY, L.shop, bl)) unsolved++;
      const all = matchPatterns(flood, L.tiles, L.w, L.h).n;
      if (hz.length < all) pruned++;
    }
    assert(`hazards A*: even a table that floods the level with blockers ends solvable (${placedTotal} hazards kept over 12 levels)`, unsolved === 0 && placedTotal > 30);
    setPatternTable(table);
    // the blockers really do matter: a blocker across a one-tile corridor fails the same check
    const rows = ['#######', '#S...E#', '#######'];
    const g = grid(rows);
    assert('hazards A*: a spike blocker set across a corridor makes pathSolvable false', pathSolvable(g.tiles, g.w, g.h, 1, 1, 5, 1, {}) && !pathSolvable(g.tiles, g.w, g.h, 1, 1, 5, 1, { blockers: hazardBlockers({ hk: 2, x: 3.5, y: 1.5, dx: 0, dy: -1 }, []) }));
  }

  setPatternTable(prev || table);
}
