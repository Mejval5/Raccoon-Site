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
          if (ch === '#') c = CELL_ROCK;
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
      v++;
    }
  }
  return { V, cells, marker, markerXY, maskU, maskD, maskL, maskR, kind, weight, base, flags, ids, nRooms: rooms.length };
}

/** Pairwise tables: connX[a*V+b] = 1 when room b, placed on side X of room a, shares an open edge cell. */
export function buildConnTables(bank) {
  const { V, maskU, maskD, maskL, maskR } = bank;
  const connR = new Uint8Array(V * V), connL = new Uint8Array(V * V);
  const connD = new Uint8Array(V * V), connU = new Uint8Array(V * V);
  // hasX[a] = number of rooms that can sit on side X of a (0 means that side is a dead end)
  const hasR = new Uint8Array(V), hasL = new Uint8Array(V), hasD = new Uint8Array(V), hasU = new Uint8Array(V);
  for (let a = 0; a < V; a++) {
    for (let b = 0; b < V; b++) {
      const i = a * V + b;
      if (maskR[a] & maskL[b]) { connR[i] = 1; hasR[a]++; }
      if (maskL[a] & maskR[b]) { connL[i] = 1; hasL[a]++; }
      if (maskD[a] & maskU[b]) { connD[i] = 1; hasD[a]++; }
      if (maskU[a] & maskD[b]) { connU[i] = 1; hasU[a]++; }
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
