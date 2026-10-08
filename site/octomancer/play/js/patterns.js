// Pattern spawning (v2, behind ?v2=1). Spelunky's danger comes from the level itself: each spawn is a
// 5x5 kernel of "needs rock" / "needs water" cells (data/patterns.json). The matcher scans the FINAL level
// tiles once: for every window it builds two 25-bit masks (rock cells, water cells) and tests every pattern
// variant with one AND per mask. Hits become spawn records through selectSpawns (per-level chance, cap,
// spacing and a caller filter). Data-oriented: typed arrays for the compiled table and the hits, plain
// records only for the few spawns that come out.
//
// Kernel glyphs: '#' rock, '.' water, '?' anything. Cells outside the level count as rock.
// Bit (ky*5 + kx) is the kernel cell at column kx, row ky.

export const KERNEL = 5;
export const NLEVELS = 3; // chance / cap columns: Shallows 1-1, 1-2, 1-3 (deeper levels reuse the last)

let table = null;
/** Register the compiled table level-spawns.js uses. */
export function setPatternTable(t) { table = t; }
export function getPatternTable() { return table; }

/** Fetch data/patterns.json (relative to the page) and compile it. */
export async function fetchPatterns(url = 'data/patterns.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('patterns.json ' + res.status);
  return compilePatterns(await res.json());
}

/**
 * Compile the JSON into flat typed arrays, one "variant" per (pattern, allowed flip); a flip that changes
 * nothing (a symmetric kernel) is dropped.
 * @param {{patterns:any[]}} json
 */
export function compilePatterns(json) {
  // 2026-10-08 fragile terrain: kind 'terrain' rows (fish-bone plugs, level.js placeMaterials) are their own small table
  // (t.terrain), never part of the spawn pass
  const all = json.patterns;
  const defs = all.filter((d) => d.kind !== 'terrain');
  const terrainDefs = all.filter((d) => d.kind === 'terrain');
  const n = defs.length;
  const maxV = n * 4;
  const t = {
    n, nv: 0,
    ids: defs.map((d) => d.id), spawn: defs.map((d) => d.spawn), kind: defs.map((d) => d.kind),
    chance: new Float32Array(n * NLEVELS), cap: new Int16Array(n * NLEVELS), sep: new Float32Array(n),
    vRock: new Int32Array(maxV), vWater: new Int32Array(maxV), vPat: new Uint8Array(maxV),
    vAx: new Int8Array(maxV), vAy: new Int8Array(maxV), vDx: new Int8Array(maxV), vDy: new Int8Array(maxV),
    vFlip: new Uint8Array(maxV), // bit 0 = mirrored left-right, bit 1 = mirrored up-down
  };
  let nv = 0;
  for (let p = 0; p < n; p++) {
    const d = defs[p];
    if (!d.rows || d.rows.length !== KERNEL || d.rows.some((r) => r.length !== KERNEL)) throw new Error('pattern ' + d.id + ': rows must be 5x5');
    for (let l = 0; l < NLEVELS; l++) {
      t.chance[p * NLEVELS + l] = d.chance[Math.min(l, d.chance.length - 1)];
      t.cap[p * NLEVELS + l] = d.cap[Math.min(l, d.cap.length - 1)];
    }
    t.sep[p] = d.sep === undefined ? 1.6 : d.sep;
    const fl = d.flips || '';
    const flips = [0];
    if (fl.includes('h')) flips.push(1);
    if (fl.includes('v')) flips.push(2);
    if (fl.includes('h') && fl.includes('v')) flips.push(3);
    const first = nv;
    for (const f of flips) {
      const fh = f & 1, fv = (f >> 1) & 1;
      let rock = 0, water = 0;
      for (let ky = 0; ky < KERNEL; ky++) {
        for (let kx = 0; kx < KERNEL; kx++) {
          const sx = fh ? KERNEL - 1 - kx : kx, sy = fv ? KERNEL - 1 - ky : ky;
          const c = d.rows[sy][sx];
          if (c === '#') rock |= 1 << (ky * KERNEL + kx);
          else if (c === '.') water |= 1 << (ky * KERNEL + kx);
        }
      }
      const ax = fh ? KERNEL - 1 - d.anchor[0] : d.anchor[0], ay = fv ? KERNEL - 1 - d.anchor[1] : d.anchor[1];
      const dx = fh ? -d.dir[0] : d.dir[0], dy = fv ? -d.dir[1] : d.dir[1];
      let dup = false;
      for (let v = first; v < nv; v++) if (t.vRock[v] === rock && t.vWater[v] === water && t.vAx[v] === ax && t.vAy[v] === ay && t.vDx[v] === dx && t.vDy[v] === dy) dup = true;
      if (dup) continue;
      t.vRock[nv] = rock; t.vWater[nv] = water; t.vPat[nv] = p;
      t.vAx[nv] = ax; t.vAy[nv] = ay; t.vDx[nv] = dx; t.vDy[nv] = dy; t.vFlip[nv] = f;
      nv++;
    }
  }
  t.nv = nv;
  t.terrain = terrainDefs.length ? compilePatterns({ patterns: terrainDefs.map((d) => ({ ...d, kind: 'terrain-row' })) }) : null;
  t.terrainDefs = terrainDefs;
  return t;
}

/**
 * Scan the tiles once. Returns {hits:Int32Array [variant, anchorX, anchorY]*, n}: every place a variant's
 * kernel fits (anchor inside the level). Reuses `hits` when passed one big enough.
 * @param {ReturnType<typeof compilePatterns>} t
 * @param {Uint8Array} tiles 0 water, non-zero rock
 */
export function matchPatterns(t, tiles, w, h, hits = null) {
  const { nv, vRock, vWater, vAx, vAy } = t;
  let buf = hits || new Int32Array(3 * 256), n = 0;
  // r44 perf: the window's water mask rolls one column at a time (shift right, drop the bits that wrapped into the last
  // column, add the new column), so a tile is read 5 times instead of 25; rock is the complement (cells outside the
  // level count as rock). Same masks and the same order of hits as building every window from scratch.
  if (_cols.length < w + 4) _cols = new Int32Array(w + 4);
  const cols = _cols;
  const bk = variantBuckets(t), b0 = bk.bits[0], b1 = bk.bits[1], b2 = bk.bits[2], bStart = bk.start, bList = bk.list;
  for (let oy = -2; oy <= h - 3; oy++) {
    // cols[tx + 2]: the water of column tx over rows oy..oy+4, placed at the kernel's last column (bits ky*5 + 4)
    for (let tx = -2; tx < w + 2; tx++) {
      let c = 0;
      if (tx >= 0 && tx < w) {
        for (let ky = 0; ky < KERNEL; ky++) {
          const ty = oy + ky;
          if (ty >= 0 && ty < h && tiles[ty * w + tx] === 0) c |= 1 << (ky * KERNEL + KERNEL - 1);
        }
      }
      cols[tx + 2] = c;
    }
    let water = 0;
    for (let k = 0; k < KERNEL - 1; k++) water = ((water >>> 1) & NOT_LAST_COL) | cols[k];
    for (let ox = -2; ox <= w - 3; ox++) {
      water = ((water >>> 1) & NOT_LAST_COL) | cols[ox + 2 + KERNEL - 1];
      // only the variants that agree with the window on the key cells, in ascending order (same hits, same order)
      const combo = ((water >>> b0) & 1) | (((water >>> b1) & 1) << 1) | (((water >>> b2) & 1) << 2);
      for (let li = bStart[combo], le = bStart[combo + 1]; li < le; li++) {
        const v = bList[li];
        if ((water & vRock[v]) !== 0 || (water & vWater[v]) !== vWater[v]) continue;
        const ax = ox + vAx[v], ay = oy + vAy[v];
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        if (n + 3 > buf.length) { const nb = new Int32Array(buf.length * 2); nb.set(buf); buf = nb; }
        buf[n++] = v; buf[n++] = ax; buf[n++] = ay;
      }
    }
  }
  return { hits: buf, n: n / 3 };
}
let _cols = new Int32Array(0);
/**
 * r44 perf: the variants split by three key kernel cells (the ones most variants pin to rock or water): for each of the 8
 * water/rock combinations of those cells, the variants that do not contradict it, in ascending order. Built once per table.
 */
const _buckets = new WeakMap();
function variantBuckets(t) {
  let bk = _buckets.get(t);
  if (bk && bk.nv === t.nv) return bk;
  const { nv, vRock, vWater } = t;
  const used = [];
  for (let b = 0; b < KERNEL * KERNEL; b++) {
    let c = 0;
    for (let v = 0; v < nv; v++) if (((vRock[v] | vWater[v]) >>> b) & 1) c++;
    used.push([c, b]);
  }
  used.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  const bits = [used[0][1], used[1][1], used[2][1]];
  const start = new Int32Array(9), list = [];
  for (let combo = 0; combo < 8; combo++) {
    start[combo] = list.length;
    for (let v = 0; v < nv; v++) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const isWater = (combo >> k) & 1, m = 1 << bits[k];
        if (isWater ? vRock[v] & m : vWater[v] & m) ok = false;
      }
      if (ok) list.push(v);
    }
  }
  start[8] = list.length;
  bk = { nv, bits, start, list: Int32Array.from(list) };
  _buckets.set(t, bk);
  return bk;
}
let NOT_LAST_COL = (1 << (KERNEL * KERNEL)) - 1; // every kernel bit but the last column's (ky*5 + 4)
for (let ky = 0; ky < KERNEL; ky++) NOT_LAST_COL &= ~(1 << (ky * KERNEL + KERNEL - 1));

/**
 * Turn hits into spawn records for one level. Hits are shuffled with `rng`, then taken in order while the
 * pattern is under its cap for this level, its chance roll passes, it keeps its spacing from everything
 * already placed (`occupied` seeds that list) and `build` accepts it.
 * `build(patternIndex, x, y, dx, dy, flip)` returns the spawn record (x, y = cell centre) or null to reject.
 * Every returned record carries `pid` (pattern id). `filter(patternIndex)` (optional) limits the pass to some patterns.
 * @returns {any[]}
 */
export function selectSpawns(t, hit, levelIndex, rng, build, occupied = null, filter = null) {
  const { hits, n } = hit;
  const lv = Math.min(NLEVELS - 1, Math.max(0, levelIndex | 0));
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
  const count = new Int16Array(t.n);
  const out = [];
  const px = [], py = [], ps = []; // everything placed so far: position + spacing
  if (occupied) for (let i = 0; i < occupied.length; i += 3) { px.push(occupied[i]); py.push(occupied[i + 1]); ps.push(occupied[i + 2]); }
  for (let k = 0; k < n; k++) {
    const i = order[k], v = hits[i * 3];
    const p = t.vPat[v];
    if (filter && !filter(p)) continue; // r36: a pass over one group of patterns (decor runs after everything else)
    if (count[p] >= t.cap[p * NLEVELS + lv]) continue;
    if (rng() >= t.chance[p * NLEVELS + lv]) continue;
    const x = hits[i * 3 + 1] + 0.5, y = hits[i * 3 + 2] + 0.5;
    let near = false;
    for (let j = 0; j < px.length; j++) {
      const s = Math.max(t.sep[p], ps[j]);
      const ddx = x - px[j], ddy = y - py[j];
      if (ddx * ddx + ddy * ddy < s * s) { near = true; break; }
    }
    if (near) continue;
    const rec = build(p, x, y, t.vDx[v], t.vDy[v], t.vFlip[v]);
    if (!rec) continue;
    rec.pid = t.ids[p];
    count[p]++;
    px.push(x); py.push(y); ps.push(t.sep[p]);
    out.push(rec);
  }
  return out;
}
