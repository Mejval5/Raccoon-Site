// Round 46: foliage from the original's FoliageItems (data/foliage.json, js/foliage.js). Every kind has its art, the
// placement is deterministic per seed, no two neighbours on a rim are the same kind, every base sits on its floor,
// ceiling or wall rim (on the tile grid and on the drawn, smoothed outline), and nothing grows on an enemy, hazard,
// loot anchor, the shop or a portal.
import { compileFoliage, setFoliageTable, placeFoliage, SURF_FLOOR, SURF_CEIL, SURF_WALL, SURF_HOVER, MIN_SINK } from '../js/foliage.js';
import { createLevelWorld } from '../js/world-v2.js';

function segDist(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L)) : 0;
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}
const same = (a, b) => a.n === b.n && ['kind', 'x', 'y', 'scale', 'flip', 'phase'].every((f) => a[f].slice(0, a.n).every((v, i) => v === b[f][i]));

export async function runFoliageTests(assert) {
  const json = await (await fetch('../data/foliage.json')).json();
  const T = compileFoliage(json);
  setFoliageTable(T);
  // ---- the table ----
  {
    let missing = 0;
    for (let k = 0; k < T.n; k++) if (!T.ext[k] && !(T.sw[k] > 0 && T.sh[k] > 0)) missing++;
    const plants = json.kinds.filter((r) => ['floor', 'ceiling', 'wall', 'hover'].includes(r.surf) && r.pattern !== '-').length;
    assert(`foliage: ${T.n} kinds in the table (${plants} original FG foliage items), every one has its art on the sheet or its own image (${missing} missing)`, missing === 0 && plants >= 12);
    const units = json.kinds.find((r) => r.id === 'plant1');
    assert('foliage: FoliagePlant1 keeps its Unity numbers (PositionOffset 0,-0.58, RandomOffsetRangeX -0.25..0.25, SpawnChance 0.8, MaxSpawned 3)',
      units.pos[1] === -0.58 && units.rx[0] === -0.25 && units.rx[1] === 0.25 && units.chance === 0.8 && units.max === 3);
  }
  // ---- determinism ----
  {
    const w1 = createLevelWorld(3, 1), c1 = w1.residentChunks()[0].chunk;
    const a = placeFoliage(T, c1, w1.width, w1.height, 0, c1.salt), b = placeFoliage(T, c1, w1.width, w1.height, 0, c1.salt);
    const w2 = createLevelWorld(3, 1), c2 = w2.residentChunks()[0].chunk;
    const c = placeFoliage(T, c2, w2.width, w2.height, 0, c2.salt);
    const w3 = createLevelWorld(4, 1), c3 = w3.residentChunks()[0].chunk;
    const d = placeFoliage(T, c3, w3.width, w3.height, 0, c3.salt);
    assert(`foliage: the same seed gives the same layout (${a.n} instances, twice and from a fresh world), another seed a different one`, same(a, b) && same(a, c) && !same(a, d));
  }
  // ---- 200 levels: rims, neighbours, keep-outs, variety ----
  {
    let n = 0, offRim = 0, offOutline = 0, sinkBad = 0, twins = 0, kept = 0, levels = 0, worstOutline = 0, kindsPerLevel = 0;
    const used = new Set(), bySurf = [0, 0, 0, 0];
    let example = '';
    for (let seed = 1; seed <= 67; seed++) for (let lvl = 0; lvl < 3; lvl++) {
      const world = createLevelWorld(seed, lvl), chunk = world.residentChunks()[0].chunk, W = world.width, H = world.height;
      const rock = (x, y) => x < 0 || y < 0 || x >= W || y >= H || chunk.tiles[y * W + x] !== 0;
      const F = placeFoliage(T, chunk, W, H, 0, chunk.salt);
      levels++;
      const kinds = new Set();
      const at = new Map();
      for (let i = 0; i < F.n; i++) {
        n++; used.add(F.kind[i]); kinds.add(F.kind[i]); bySurf[F.surf[i]]++;
        const s = F.surf[i], x = F.x[i], y = F.y[i], cx = F.cx[i], cy = F.cy[i];
        // the rim point the base hangs from, and the check that it is a real ledge at that x (or y)
        let rx, ry, ok;
        if (s === SURF_FLOOR || s === SURF_CEIL) {
          ry = s === SURF_FLOOR ? cy : cy + 1; rx = x;
          const tx = Math.floor(x);
          ok = rock(tx, cy) && !rock(tx, s === SURF_FLOOR ? cy - 1 : cy + 1);
          const sink = s === SURF_FLOOR ? y - cy : cy + 1 - y;
          if (sink < MIN_SINK - 1e-4 || sink > 0.5) sinkBad++;
        } else if (s === SURF_WALL) {
          const d = F.nx[i] < 0 ? 1 : -1; rx = d > 0 ? cx : cx + 1; ry = y;
          const ty = Math.floor(y);
          ok = rock(cx, ty) && !rock(cx - d, ty);
          const sink = (x - rx) * d;
          if (sink < MIN_SINK - 1e-4 || sink > 0.5) sinkBad++;
        } else { ok = !rock(Math.floor(x), Math.floor(y)) && rock(cx, cy); rx = ry = null; } // the fish hovers in the water under its rock
        if (!ok) { offRim++; if (!example) example = `seed ${seed} level ${lvl + 1} ${T.ids[F.kind[i]]} at ${x.toFixed(2)},${y.toFixed(2)}`; }
        if (rx !== null) {
          let best = 9;
          for (const sg of world.wallSegmentsNear(rx, ry, 1)) best = Math.min(best, segDist(rx, ry, sg));
          if (best > worstOutline) worstOutline = best;
          if (best > 0.25) offOutline++;
        }
        // keep-outs: enemies, hazards, loot (a tile round them), the shop stall, the exit ring, the pool pedestal
        for (const sp of chunk.spawns) {
          if (sp.type !== 'enemy-slot' && sp.type !== 'hazard' && sp.type !== 'loot') continue;
          if (Math.abs(Math.floor(sp.x) - cx) <= 1 && Math.abs(Math.floor(sp.y) - cy) <= 1) kept++;
        }
        const nf = chunk.plantFree;
        if (nf && cx >= nf.x0 && cx < nf.x1 && cy >= nf.y0 && cy < nf.y1) kept++;
        if (chunk.plantKeepOut.some((r) => cx >= r.x0 && cx < r.x1 && cy >= r.y0 && cy < r.y1)) kept++;
        const key = (s === SURF_HOVER ? SURF_CEIL : s) * 10 + (s === SURF_WALL ? (F.nx[i] < 0 ? 1 : 2) : 0);
        at.set(key + ':' + cx + ',' + cy, i);
      }
      // neighbours on the same rim
      for (let i = 0; i < F.n; i++) {
        const s = F.surf[i], key = (s === SURF_HOVER ? SURF_CEIL : s) * 10 + (s === SURF_WALL ? (F.nx[i] < 0 ? 1 : 2) : 0);
        const nb = s === SURF_WALL ? at.get(key + ':' + F.cx[i] + ',' + (F.cy[i] + 1)) : at.get(key + ':' + (F.cx[i] + 1) + ',' + F.cy[i]);
        if (nb === undefined) continue;
        if (F.kind[nb] === F.kind[i] || (F.scale[nb] === F.scale[i] && Math.abs((F.x[nb] - F.cx[nb]) - (F.x[i] - F.cx[i])) < 1e-6)) twins++;
      }
      kindsPerLevel += kinds.size;
    }
    assert(`foliage: ${levels} levels, ${(n / levels).toFixed(0)} plants per level (floor ${(bySurf[0] / levels).toFixed(0)}, ceiling ${(bySurf[1] / levels).toFixed(0)}, wall ${(bySurf[2] / levels).toFixed(0)}, fish ${(bySurf[3] / levels).toFixed(1)}), ${used.size} kinds used, ${(kindsPerLevel / levels).toFixed(1)} per level`,
      n / levels > 90 && used.size >= 13 && kindsPerLevel / levels >= 9 && bySurf[2] > 0);
    assert(`foliage: every base is on its rock tile's rim with water on its open side (${offRim} off${example ? ', first ' + example : ''}) and sunk ${MIN_SINK}-0.5 tiles (${sinkBad} not)`, offRim === 0 && sinkBad === 0);
    assert(`foliage: every rim point is on the drawn (smoothed) outline within 0.25 tiles (${offOutline} not, worst ${worstOutline.toFixed(2)})`, offOutline === 0);
    assert(`foliage: no two neighbours on a rim share a kind or a scale and offset (${twins})`, twins === 0);
    assert(`foliage: nothing grows within a tile of an enemy, hazard or loot anchor, in the shop, the exit ring or the pool room (${kept})`, kept === 0);
  }
}
