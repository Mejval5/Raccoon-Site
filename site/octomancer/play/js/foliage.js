// Foliage placement (Daniel: "when spawning foliage, you need to add some horizontal or vertical offset... specific
// offsets per each plant", and "I had way more types of foliage"). The table is data/foliage.json: one row per original
// FoliageItem (octomancer-unity FGFoliageTiles / BGFoliage), with its PositionOffset, RandomOffsetRange, SpawnChance,
// MaxSpawned, FailChance and FoliageRandomizer values, plus the web fields that say where its art touches the rock.
//
// How the original placed them (PatternGenerator.cs): every pattern (floor, ceiling, wall) listed its items; each item
// regenerated a Perlin texture and took the matching cells (shuffled) whose noise was at least its SpawnChance, until
// MaxSpawned x the level's DynamicDensity, then put the item at the cell centre + PositionOffset (mirrored with the pattern's
// flip) + a random offset in RandomOffsetRangeX/Y. So each plant kind grows in its own noisy patches, at its own depth and
// with its own jitter. This does the same per level, deterministic per seed (the level's salt), on the anchor cells
// decor.js already validates (floor, ceiling and pattern-table clusters, keep-outs for enemies, hazards, loot, the shop,
// the exit ring and portals), plus side-wall anchors for the wall kinds. On top of the original:
//   - a kind never repeats on the cell next to one of its own on the same surface (neighbours never look identical);
//   - every instance gets its own small scale variation, mirror and sway phase;
//   - the jitter along the rim is clamped to the ledge span, and the depth into the rock to [MIN_SINK, half the art],
//     so a base never leaves its ledge or floats.
//
// Coordinates: web tiles, y DOWN (Unity y is up: a negative Unity PositionOffset.y on a floor plant = deeper into the
// floor). Placement is struct-of-arrays (`placeFoliage` returns typed arrays); render.js draws it.

import { mulberry32 } from './rng.js';
import { findPlantAnchors, findClusterMates, findWallAnchors, plantBlockedBySlot } from './decor.js';

export const SURF_FLOOR = 0, SURF_CEIL = 1, SURF_WALL = 2, SURF_HOVER = 3, SURF_EMBED = 4, SURF_RUNE = 5;
const SURF = { floor: SURF_FLOOR, ceiling: SURF_CEIL, wall: SURF_WALL, hover: SURF_HOVER, embed: SURF_EMBED, rune: SURF_RUNE };
export const BASE_BOTTOM = 0, BASE_TOP = 1, BASE_RIGHT = 2;
const BASE = { bottom: BASE_BOTTOM, top: BASE_TOP, right: BASE_RIGHT };
export const MIN_SINK = 0.06; // a base is always at least this far inside the rock (the wall bake covers it)
const NOISE_CELL = 5; // tiles per Perlin lattice cell (patches a few plants wide)

let table = null;
export function setFoliageTable(t) { table = t; }
export function getFoliageTable() { return table; }
export async function fetchFoliage(url = 'data/foliage.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('foliage.json ' + res.status);
  return compileFoliage(await res.json());
}

/** Flatten the JSON rows into typed arrays (index = kind). */
export function compileFoliage(json) {
  const rows = json.kinds, n = rows.length, sm = json.sizeMul || 1;
  const t = {
    n, ids: rows.map((r) => r.id), unity: rows.map((r) => r.unity), sheet: json.sheet, capScale: json.capScale || 1,
    ext: rows.map((r) => (r.art && r.art[0] === '@' ? r.art.slice(1) : null)), // a separate image (plant1 / plant2)
    surf: new Uint8Array(n), base: new Uint8Array(n), mirror: new Uint8Array(n),
    sx: new Float32Array(n), sy: new Float32Array(n), sw: new Float32Array(n), sh: new Float32Array(n), // sheet cell
    w: new Float32Array(n), h: new Float32Array(n), // drawn size in tiles at scale 1 (w = 0: from the image's aspect)
    sink: new Float32Array(n), rx0: new Float32Array(n), rx1: new Float32Array(n), ry0: new Float32Array(n), ry1: new Float32Array(n),
    chance: new Float32Array(n), max: new Float32Array(n), capAbs: new Float32Array(n), fail: new Float32Array(n), noEdge: new Uint8Array(n),
    vary0: new Float32Array(n), vary1: new Float32Array(n), sway: new Float32Array(n), rot: new Float32Array(n),
    rand0: new Float32Array(n), rand1: new Float32Array(n), randRot: new Float32Array(n), maxTiles: new Float32Array(n), alpha: new Float32Array(n),
    bySurf: [[], [], [], [], [], []],
  };
  for (let k = 0; k < n; k++) {
    const r = rows[k];
    t.surf[k] = SURF[r.surf]; t.base[k] = BASE[r.base || 'bottom']; t.mirror[k] = r.mirror ? 1 : 0;
    const cell = json.art && json.art[r.art];
    if (cell) { t.sx[k] = cell[0]; t.sy[k] = cell[1]; t.sw[k] = cell[2]; t.sh[k] = cell[3]; }
    if (r.h) { t.h[k] = r.h; t.w[k] = 0; } else { t.w[k] = r.size[0] * sm; t.h[k] = r.size[1] * sm; }
    t.sink[k] = r.sink; t.rx0[k] = r.rx[0]; t.rx1[k] = r.rx[1]; t.ry0[k] = r.ry[0]; t.ry1[k] = r.ry[1];
    t.chance[k] = r.chance; t.max[k] = r.max; t.capAbs[k] = r.capAbs || 0; // capAbs: a web cap per level instead of max x density (the little fish) t.fail[k] = r.fail || 0; t.noEdge[k] = r.noEdge ? 1 : 0;
    t.vary0[k] = r.vary ? r.vary[0] : 1; t.vary1[k] = r.vary ? r.vary[1] : 1; t.sway[k] = r.sway || 0; t.rot[k] = (r.rot || 0) * Math.PI / 180;
    t.rand0[k] = r.rand ? r.rand[0] / 100 : 1; t.rand1[k] = r.rand ? r.rand[1] / 100 : 1; t.randRot[k] = r.rand ? r.rand[2] * Math.PI / 180 : 0;
    t.maxTiles[k] = r.maxTiles || 0; t.alpha[k] = r.alpha === undefined ? 1 : r.alpha;
    t.bySurf[t.surf[k]].push(k);
  }
  return t;
}

/** The original's DynamicDensity: (w / 10 + h / 16) / 2 (PatternGenerator.CalculateDensityOverride). */
export function dynamicDensity(w, h) { return (w / 10 + h / 16) / 2; }

function hash3(a, b, c) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Value noise in [0,1) (the stand-in for the original's per-item Perlin texture): smooth patches NOISE_CELL tiles wide. */
export function patchNoise(seed, k, x, y) {
  const gx = x / NOISE_CELL, gy = y / NOISE_CELL, ix = Math.floor(gx), iy = Math.floor(gy);
  let fx = gx - ix, fy = gy - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const s = (seed ^ Math.imul(k + 1, 0x9e3779b1)) | 0;
  const a = hash3(ix, iy, s), b = hash3(ix + 1, iy, s), c = hash3(ix, iy + 1, s), d = hash3(ix + 1, iy + 1, s);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/**
 * Place the foliage of one chunk (a v2 level is one chunk). Returns struct-of-arrays:
 *   kind, surf; x, y = the base point (local tiles, y down, inside the rock by the kind's sink); nx, ny = the surface
 *   normal (out of the rock into the water); cx, cy = the anchor cell (the rock tile); scale, phase, flip; support = the
 *   rock tile index (the plant goes when a bomb removes it).
 * @param {ReturnType<typeof compileFoliage>} T
 */
export function placeFoliage(T, chunk, W, H, chunkIndex, seed) {
  const c = createFoliageCandidates(chunk, W, H, chunkIndex);
  while (!stepFoliageCandidates(c, Infinity));
  return placeFoliageCells(T, chunk, W, H, c.cand, seed);
}

/**
 * The anchor cells, gathered in steps (render.js spreads the cluster mates over a few frames, as before):
 * cand = [surface, rock x, rock y, dir]* (dir: wall side, +1 = rock to the right of the water).
 */
export function createFoliageCandidates(chunk, W, H, chunkIndex) {
  const c = { chunk, W, H, cand: [], seen: new Set(), anchors: findPlantAnchors(chunk, W, H, chunkIndex), extra: [], next: 0, done: false };
  for (const a of findWallAnchors(chunk, W, H, chunkIndex)) addCand(c, SURF_WALL, a.tx, a.ty, a.dir);
  // the original filled every matching cell its noise allowed; the web's vine anchors are sparser (one tall vine per
  // few cells), so the small kinds get a second, independent set of floor and ceiling cells (same room-to-grow and
  // enemy-reach rules as decor.js's anchors)
  const T = (x, y) => x < 0 || y < 0 || x >= W || y >= H || chunk.tiles[y * W + x] !== 0;
  for (let y = 2; y < H - 2; y++) for (let x = 1; x < W - 1; x++) {
    if (!T(x, y)) continue;
    const g = Math.floor(hash3(x, y, chunkIndex * 31 + 7) * 12);
    if (!T(x, y - 1) && !T(x, y - 2) && g < 4 && !(chunk.v2 && plantBlockedBySlot(chunk, x, y, false))) c.extra.push(SURF_FLOOR, x, y, 0);
    else if (!T(x, y + 1) && !T(x, y + 2) && g >= 9 && !(chunk.v2 && plantBlockedBySlot(chunk, x, y, true))) c.extra.push(SURF_CEIL, x, y, 0);
  }
  return c;
}
function addCand(c, s, x, y, d) {
  const key = ((s * 4 + d + 1) * c.H + y) * c.W + x;
  if (c.seen.has(key) || !naturalStone(c.chunk.tiles[y * c.W + x]) || keptOut(c.chunk, x, y)) return;
  c.seen.add(key); c.cand.push(s, x, y, d);
}
/** Plants grow on the main terrain only: material id 1 (MAT_ROCK) or 2 (MAT_BEDROCK, the same stone made unbreakable), never on
 * the Materials owner's bone blocks (3), timber platforms (4) or the shop's masonry (5). Today every rock tile is 1. */
export function naturalStone(m) { return m === 1 || m === 2; }

/** One rule for every cell (anchors and cluster mates alike): nothing within a tile of an enemy, hazard or loot anchor,
 * nothing in the shop stall or a keep-out (exit ring, shortcut, journal board, pool pedestal, a quest's cage). */
export function keptOut(chunk, tx, ty) {
  const nf = chunk.plantFree;
  if (nf && tx >= nf.x0 && tx < nf.x1 && ty >= nf.y0 && ty < nf.y1) return true;
  const pf = chunk.plantKeepOut;
  if (pf) for (const r of pf) if (tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1) return true;
  if (chunk.spawns) for (const s of chunk.spawns) {
    if (s.type !== 'enemy-slot' && s.type !== 'hazard' && s.type !== 'loot') continue;
    if (Math.abs(Math.floor(s.x) - tx) <= 1 && Math.abs(Math.floor(s.y) - ty) <= 1) return true;
  }
  return false;
}

/** Work through the anchors (and their cluster mates) for up to `ms` milliseconds; true once all are in. */
export function stepFoliageCandidates(c, ms) {
  const t0 = performance.now();
  while (c.next < c.anchors.length) {
    const a = c.anchors[c.next++];
    addCand(c, a.onCeiling ? SURF_CEIL : SURF_FLOOR, a.tx, a.ty, 0);
    if (!a.onCeiling) for (const m of findClusterMates(c.chunk, c.W, c.H, a.tx, a.ty, false, a.hash)) addCand(c, SURF_FLOOR, a.tx + m.dx, a.ty, 0);
    if (performance.now() - t0 > ms) break;
  }
  if (c.next >= c.anchors.length && c.extra) { for (let i = 0; i < c.extra.length; i += 4) addCand(c, c.extra[i], c.extra[i + 1], c.extra[i + 2], c.extra[i + 3]); c.extra = null; }
  c.done = c.next >= c.anchors.length;
  return c.done;
}

/** Choose a kind, an offset, a scale and a mirror for every candidate cell (seeded). */
export function placeFoliageCells(T, chunk, W, H, cand, seed) {
  const tiles = chunk.tiles;
  const rock = (x, y) => x < 0 || y < 0 || x >= W || y >= H || tiles[y * W + x] !== 0;
  const rng = mulberry32((seed ^ 0xf011a9e) >>> 0);
  const nc = cand.length / 4;
  // the original shuffles its valid locations; so does this (seeded)
  const order = new Int32Array(nc);
  for (let i = 0; i < nc; i++) order[i] = i;
  for (let i = nc - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = order[i]; order[i] = order[j]; order[j] = tmp; }

  const dens = dynamicDensity(W, H) * T.capScale;
  const count = new Int16Array(T.n);
  const cap = new Float32Array(T.n);
  for (let k = 0; k < T.n; k++) cap[k] = T.capAbs[k] > 0 ? T.capAbs[k] : T.max[k] * dens;
  // the kind on each (surface, cell) so far: -1 none. Walls keep left and right faces apart.
  const placed = new Int16Array(W * H * 4).fill(-1);
  const slot = (s, x, y, d) => ((s === SURF_WALL ? (d > 0 ? 2 : 3) : s) * H + y) * W + x;
  const out = {
    n: 0, kind: new Uint8Array(nc), surf: new Uint8Array(nc), x: new Float32Array(nc), y: new Float32Array(nc),
    nx: new Int8Array(nc), ny: new Int8Array(nc), cx: new Int16Array(nc), cy: new Int16Array(nc),
    scale: new Float32Array(nc), phase: new Float32Array(nc), flip: new Uint8Array(nc), support: new Int32Array(nc),
  };
  const kindsFor = (s) => (s === SURF_CEIL ? T.bySurf[SURF_CEIL].concat(T.bySurf[SURF_HOVER]) : T.bySurf[s]);
  const kindLists = [kindsFor(SURF_FLOOR), kindsFor(SURF_CEIL), kindsFor(SURF_WALL)];
  for (let oi = 0; oi < nc; oi++) {
    const i = order[oi], s = cand[i * 4], tx = cand[i * 4 + 1], ty = cand[i * 4 + 2], d = cand[i * 4 + 3];
    // the kinds already on this rim within two cells either side: none of them repeats here, so a run of cells cycles
    // through at least three kinds instead of alternating two
    let ex0 = -1, ex1 = -1, ex2 = -1, ex3 = -1;
    for (let o = -2; o <= 2; o++) {
      if (!o) continue;
      const ax = s === SURF_WALL ? tx : tx + o, ay = s === SURF_WALL ? ty + o : ty;
      if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
      const v = placed[slot(s, ax, ay, d)];
      if (v < 0) continue;
      if (ex0 < 0) ex0 = v; else if (ex1 < 0) ex1 = v; else if (ex2 < 0) ex2 = v; else ex3 = v;
    }
    const banned = (k) => k === ex0 || k === ex1 || k === ex2 || k === ex3 || count[k] >= cap[k];
    // pick: every kind of this surface under its cap and not banned; the one whose noise clears its SpawnChance by the
    // most (plus a little per-cell chance) wins: the original's per-item Perlin threshold, so kinds grow in patches. With
    // none clear, a weighted pick by how often the kind clears it at all (1 - SpawnChance), so the anchor set still
    // fills -- but a third of those cells stay bare, the gaps the original's threshold leaves between patches.
    const list = kindLists[s];
    let best = -1, bestScore = -1e9, wsum = 0;
    for (const k of list) {
      if (banned(k)) continue;
      const score = patchNoise(seed, k, tx, ty) - T.chance[k] + 0.3 * rng();
      if (score > bestScore) { bestScore = score; best = k; }
      wsum += 1 - T.chance[k];
    }
    if (best < 0) continue;
    let k = best;
    if (bestScore < 0) {
      if (rng() < 0.33) continue;
      let r = rng() * wsum; k = -1;
      for (const kk of list) {
        if (banned(kk)) continue;
        r -= 1 - T.chance[kk]; k = kk; if (r <= 0) break;
      }
    }
    if (k < 0 || rng() * 100 < T.fail[k]) continue;
    if (T.noEdge[k] && (tx <= 0 || ty <= 0 || tx >= W - 1 || ty >= H - 1)) continue;
    const scale = T.vary0[k] + (T.vary1[k] - T.vary0[k]) * rng();
    const jx = T.rx0[k] + (T.rx1[k] - T.rx0[k]) * rng(), jy = T.ry0[k] + (T.ry1[k] - T.ry0[k]) * rng();
    const flip = rng() < 0.5 ? 1 : 0;
    const phase = rng() * Math.PI * 2;
    const ks = T.surf[k];
    let bx, by, nx = 0, ny = 0;
    // half the art's footprint along the rim (its base is narrower than the leaves: a third of the width), plus room for
    // the smoothed rim's rounded corner at a ledge end
    const artW = T.w[k] > 0 ? T.w[k] : T.h[k] * 0.3;
    const foot = Math.min(0.42, 0.18 + artW * scale * 0.15);
    if (s === SURF_WALL) {
      // the rim runs vertically: Unity's y jitter slides along it, its x (none of the wall items has any) would push in
      let y0 = ty, y1 = ty;
      while (y0 - 1 >= 0 && rock(tx, y0 - 1) && !rock(tx - d, y0 - 1)) y0--;
      while (y1 + 1 < H && rock(tx, y1 + 1) && !rock(tx - d, y1 + 1)) y1++;
      const lo = y0 + foot, hi = y1 + 1 - foot;
      by = lo <= hi ? Math.min(hi, Math.max(lo, ty + 0.5 - jy)) : (y0 + y1 + 1) / 2; // Unity y up: -jy
      const sink = clampSink(T.sink[k] + jx, T, k, scale);
      const face = d > 0 ? tx : tx + 1;
      bx = face + d * sink; nx = -d;
    } else {
      const up = s === SURF_FLOOR; // floor: water above the rock tile; ceiling: water below
      const wy = up ? ty - 1 : ty + 1;
      let x0 = tx, x1 = tx;
      while (x0 - 1 >= 0 && rock(x0 - 1, ty) && !rock(x0 - 1, wy)) x0--;
      while (x1 + 1 < W && rock(x1 + 1, ty) && !rock(x1 + 1, wy)) x1++;
      const lo = x0 + foot, hi = x1 + 1 - foot;
      const dx = flip ? -jx : jx; // a mirrored placement mirrors its offset (the original's PositionOffset.x * flipAxis.x)
      bx = lo <= hi ? Math.min(hi, Math.max(lo, tx + 0.5 + dx)) : (x0 + x1 + 1) / 2;
      if (ks === SURF_HOVER) { // a small fish under the ceiling: the original's 0.5 below the rim, +- its y range
        by = ty + 1 + 0.5 - jy;
      } else {
        // Unity y up: on a floor a negative y offset goes deeper, on a ceiling a positive one does
        const sink = clampSink(T.sink[k] + (up ? -jy : jy), T, k, scale);
        by = up ? ty + sink : ty + 1 - sink;
      }
      ny = up ? -1 : 1;
    }
    const o = out.n++;
    out.kind[o] = k; out.surf[o] = ks; out.x[o] = bx; out.y[o] = by; out.nx[o] = nx; out.ny[o] = ny;
    out.cx[o] = tx; out.cy[o] = ty; out.scale[o] = scale; out.phase[o] = phase; out.flip[o] = flip; out.support[o] = ty * W + tx;
    placed[slot(s, tx, ty, d)] = k;
    count[k]++;
  }
  return out;
}

/** How far into the rock the base goes: the kind's sink (with its random part), never less than MIN_SINK and never more
 * than half the drawn art (so a short plant is not swallowed by the rim). */
function clampSink(v, T, k, scale) {
  const len = (T.base[k] === BASE_RIGHT ? (T.w[k] || T.h[k]) : T.h[k]) * scale;
  return Math.max(MIN_SINK, Math.min(v, len * 0.45));
}

/**
 * The rock-face decor of the background generator (BackgroundPattern1): crystals, pebbles and the six rune carvings,
 * picked for a rune or fossil cell from decor.js. Returns {kind, scale, rot}: the FoliageRandomizer's scale (clamped
 * to maxTiles so it stays on its rock) and rotation, around the prefab's own rotation. `u1..u3` are uniform [0,1).
 */
export function pickEmbedded(T, surf, u0, u1, u2, u3) {
  const list = T.bySurf[surf];
  if (!list.length) return null;
  let wsum = 0;
  for (const k of list) wsum += 1 - T.chance[k] + 1e-6;
  let r = u0 * wsum, k = list[list.length - 1];
  for (const kk of list) { r -= 1 - T.chance[kk] + 1e-6; if (r <= 0) { k = kk; break; } }
  let scale = T.rand0[k] + (T.rand1[k] - T.rand0[k]) * u1;
  if (T.maxTiles[k] > 0) scale = Math.min(scale, T.maxTiles[k] / Math.max(T.w[k], T.h[k]));
  const rot = T.rot[k] + (u2 * 2 - 1) * T.randRot[k];
  return { kind: k, scale, rot, flip: u3 < 0.5 };
}
