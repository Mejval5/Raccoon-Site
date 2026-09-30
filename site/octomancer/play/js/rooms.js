// Room bank for the v2 level generator (V2-PLAN 2.2 / M1-2). Data-oriented:
// flat typed arrays indexed by variant, no per-room or per-tile objects.
// loadRoomBank(json) builds cells / markers / edge masks / kinds / weights
// for every allowed flip variant; buildConnTables(bank) adds the pairwise
// connection tables. createRoomBank does both.
//
// Cell codes in bank.cells (y-down, row-major, RC per variant):
//   0 water, 1 rock, 2 quantum (rolled at stamp time), 3 marker (water).
// Room JSON strings: '#' rock, '.' water, '?' quantum, 'P' portal marker,
// 'S' start marker, 'E' exit marker, 'C','N','K','H','Q' special markers.
// Biome-1 rooms (data/biome1-rooms.json) also carry `tags` (start, exit, path-LR, drop,
// landing, side) and anchors: '^' spot under a ceiling, 'v' spot on a floor, '<' spot
// against a wall on its left, '>' against a wall on its right (all water cells).

export const ROOM_W = 10;
export const ROOM_H = 16;
export const RC = ROOM_W * ROOM_H;

export const CELL_WATER = 0, CELL_ROCK = 1, CELL_QUANTUM = 2, CELL_MARKER = 3;
// marker kinds (bank.marker)
export const MK_NONE = 0, MK_START = 1, MK_EXIT = 2, MK_PORTAL = 3, MK_CHEST = 4,
  MK_NEST = 5, MK_CAGE = 6, MK_POOL = 7, MK_TREASURE = 8;
// room kinds (bank.kind): 0 normal, 1 start-only, 2 end-only, 3+ special id
export const KIND_NORMAL = 0, KIND_START = 1, KIND_END = 2, KIND_POOL = 3;
// bank.flags bits
export const FLAG_H = 1, FLAG_V = 2;
// bank.tags bits (biome-1 bank, Spelunky-style room roles; 0 for untagged banks)
export const TAG_START = 1, TAG_EXIT = 2, TAG_PATH = 4, TAG_DROP = 8, TAG_LAND = 16, TAG_SIDE = 32, TAG_SHOP = 64;
const TAG_NAMES = { start: TAG_START, exit: TAG_EXIT, 'path-LR': TAG_PATH, path: TAG_PATH, drop: TAG_DROP, landing: TAG_LAND, side: TAG_SIDE, shop: TAG_SHOP };
// bank.anchors codes: pattern anchors written in room ASCII ('^' 'v' '<' '>'), each a water cell
export const ANCH_NONE = 0, ANCH_UP = 1, ANCH_DOWN = 2, ANCH_LEFT = 3, ANCH_RIGHT = 4;
const ANCHOR_CHARS = { '^': ANCH_UP, v: ANCH_DOWN, '<': ANCH_LEFT, '>': ANCH_RIGHT };

// bank.props codes: shop furniture written in room ASCII ('Y' the shopkeeper's spot, '@' an item pedestal), each a water cell
export const PROP_NONE = 0, PROP_KEEPER = 1, PROP_PEDESTAL = 2;
const PROP_CHARS = { Y: PROP_KEEPER, '@': PROP_PEDESTAL };

const MARKER_CHARS = { S: MK_START, E: MK_EXIT, P: MK_PORTAL, C: MK_CHEST, N: MK_NEST, K: MK_CAGE, H: MK_POOL, Q: MK_TREASURE };
const KIND_NAMES = { room: KIND_NORMAL, start: KIND_START, end: KIND_END, pool: KIND_POOL };

/** Number of variants a room contributes: 1 + h + v + (h and v). */
export function variantCount(flip) {
  const h = flip.indexOf('h') >= 0, v = flip.indexOf('v') >= 0;
  return 1 + (h ? 1 : 0) + (v ? 1 : 0) + (h && v ? 1 : 0);
}

/** Build the variant arrays from parsed rooms.json (an array of rooms). */
export function loadRoomBank(rooms) {
  let V = 0;
  for (const r of rooms) V += variantCount(r.flip || '');
  const cells = new Uint8Array(V * RC);
  const marker = new Uint8Array(V);
  const markerXY = new Uint8Array(V * 2);
  const maskU = new Uint16Array(V), maskD = new Uint16Array(V);
  const maskL = new Uint16Array(V), maskR = new Uint16Array(V);
  const kind = new Uint8Array(V);
  const weight = new Float32Array(V);
  const base = new Uint16Array(V);
  const flags = new Uint8Array(V);
  const tags = new Uint8Array(V);
  const anchors = new Uint8Array(V * RC);
  const props = new Uint8Array(V * RC);
  const tagged = rooms.some((r) => r.tags);
  const ids = new Array(V);

  let v = 0;
  for (let ri = 0; ri < rooms.length; ri++) {
    const r = rooms[ri];
    if (r.cells.length !== ROOM_H) throw new Error('room ' + r.id + ' must have ' + ROOM_H + ' rows');
    const flip = r.flip || '';
    const fh = flip.indexOf('h') >= 0, fv = flip.indexOf('v') >= 0;
    const list = [0];
    if (fh) list.push(FLAG_H);
    if (fv) list.push(FLAG_V);
    if (fh && fv) list.push(FLAG_H | FLAG_V);
    for (const fl of list) {
      const o = v * RC;
      let mk = 0, sx = 0, sy = 0, sn = 0;
      for (let y = 0; y < ROOM_H; y++) {
        const row = r.cells[fl & FLAG_V ? ROOM_H - 1 - y : y];
        if (row.length !== ROOM_W) throw new Error('room ' + r.id + ' row width must be ' + ROOM_W);
        for (let x = 0; x < ROOM_W; x++) {
          const ch = row[fl & FLAG_H ? ROOM_W - 1 - x : x];
          let c = CELL_WATER;
          if (ANCHOR_CHARS[ch] !== undefined) {
            let code = ANCHOR_CHARS[ch];
            if (fl & FLAG_H && code >= ANCH_LEFT) code = code === ANCH_LEFT ? ANCH_RIGHT : ANCH_LEFT;
            if (fl & FLAG_V && code <= ANCH_DOWN) code = code === ANCH_UP ? ANCH_DOWN : ANCH_UP;
            anchors[o + y * ROOM_W + x] = code;
          } else if (PROP_CHARS[ch] !== undefined) {
            props[o + y * ROOM_W + x] = PROP_CHARS[ch];
          } else if (ch === '#') c = CELL_ROCK;
          else if (ch === '?') c = CELL_QUANTUM;
          else if (MARKER_CHARS[ch] !== undefined) {
            c = CELL_MARKER;
            mk = MARKER_CHARS[ch]; sx += x; sy += y; sn++;
          }
          cells[o + y * ROOM_W + x] = c;
        }
      }
      marker[v] = mk;
      if (sn) { markerXY[v * 2] = Math.round(sx / sn); markerXY[v * 2 + 1] = Math.round(sy / sn); }
      // all edge cells count (fixes the size-1 quirk); quantum counts as open
      let mu = 0, md = 0, ml = 0, mr = 0;
      for (let x = 0; x < ROOM_W; x++) {
        if (cells[o + x] !== CELL_ROCK) mu |= 1 << x;
        if (cells[o + (ROOM_H - 1) * ROOM_W + x] !== CELL_ROCK) md |= 1 << x;
      }
      for (let y = 0; y < ROOM_H; y++) {
        if (cells[o + y * ROOM_W] !== CELL_ROCK) ml |= 1 << y;
        if (cells[o + y * ROOM_W + ROOM_W - 1] !== CELL_ROCK) mr |= 1 << y;
      }
      maskU[v] = mu; maskD[v] = md; maskL[v] = ml; maskR[v] = mr;
      kind[v] = KIND_NAMES[r.kind || 'room'] || 0;
      weight[v] = r.weight === undefined ? 1 : r.weight;
      base[v] = ri; flags[v] = fl; ids[v] = r.id;
      let tg = 0;
      for (const name of r.tags || []) {
        if (!TAG_NAMES[name]) throw new Error('room ' + r.id + ' has unknown tag ' + name);
        tg |= TAG_NAMES[name];
      }
      tags[v] = tg;
      v++;
    }
  }
  return { V, cells, marker, markerXY, maskU, maskD, maskL, maskR, kind, weight, base, flags, ids, tags, anchors, props, tagged, nRooms: rooms.length };
}

/** Pairwise tables: connX[a*V+b] = 1 when room b, placed on side X of room a, shares an open edge cell. */
export function buildConnTables(bank) {
  const { V, maskU, maskD, maskL, maskR } = bank;
  // A tagged bank needs two adjacent open cells on the shared edge, so the seam is a
  // 2-wide opening (the swim path is judged on 2x2 "fat" water).
  const open = bank.tagged ? (m) => (m & (m >> 1)) !== 0 : (m) => m !== 0;
  const connR = new Uint8Array(V * V), connL = new Uint8Array(V * V);
  const connD = new Uint8Array(V * V), connU = new Uint8Array(V * V);
  // hasX[a] = number of rooms that can sit on side X of a (0 means that side is a dead end)
  const hasR = new Uint8Array(V), hasL = new Uint8Array(V), hasD = new Uint8Array(V), hasU = new Uint8Array(V);
  for (let a = 0; a < V; a++) {
    for (let b = 0; b < V; b++) {
      const i = a * V + b;
      if (open(maskR[a] & maskL[b])) { connR[i] = 1; hasR[a]++; }
      if (open(maskL[a] & maskR[b])) { connL[i] = 1; hasL[a]++; }
      if (open(maskD[a] & maskU[b])) { connD[i] = 1; hasD[a]++; }
      if (open(maskU[a] & maskD[b])) { connU[i] = 1; hasU[a]++; }
    }
  }
  bank.connR = connR; bank.connL = connL; bank.connD = connD; bank.connU = connU;
  bank.hasR = hasR; bank.hasL = hasL; bank.hasD = hasD; bank.hasU = hasU;
  return bank;
}

export function createRoomBank(rooms) {
  return buildConnTables(loadRoomBank(rooms));
}

/** Fetch rooms.json (relative to the page) and build the bank. */
export async function fetchRoomBank(url = 'data/rooms.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('rooms.json ' + res.status);
  return createRoomBank(await res.json());
}

/** Fetch the biome-1 rooms and build that bank, with the Octomancer PNG rooms as its fallback bank. */
export async function fetchBiome1Bank(url = 'data/biome1-rooms.json', fallbackUrl = 'data/rooms.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('biome1-rooms.json ' + res.status);
  const bank = createRoomBank(await res.json());
  bank.fallbackBank = await fetchRoomBank(fallbackUrl);
  return bank;
}
