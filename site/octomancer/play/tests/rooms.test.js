// M1-2 room bank tests (rooms.js). Loads the shipped data/rooms.json.
import { createRoomBank, variantCount, ROOM_W, ROOM_H, RC, FLAG_H, FLAG_V, MK_PORTAL, KIND_POOL, CELL_ROCK } from '../js/rooms.js';

export async function loadRoomsJson() {
  const res = await fetch('../data/rooms.json');
  return res.json();
}

export async function runRoomTests(assert, approx) {
  const rooms = await loadRoomsJson();
  const bank = createRoomBank(rooms);
  const V = bank.V;

  assert('rooms: 18 rooms of 10x16 in rooms.json',
    rooms.length === 18 && rooms.every(r => r.cells.length === ROOM_H && r.cells.every(s => s.length === ROOM_W)));
  let expectV = 0;
  for (const r of rooms) expectV += variantCount(r.flip);
  assert(`rooms: variant count ${V} = sum of allowed flips ${expectV}`, V === expectV && bank.cells.length === V * RC);
  assert('rooms: per-room flips none/H/V/HV give 1/2/2/4 variants',
    variantCount('') === 1 && variantCount('h') === 2 && variantCount('v') === 2 && variantCount('hv') === 4);

  const idx = (id, fl) => { for (let v = 0; v < V; v++) if (bank.ids[v] === id && bank.flags[v] === fl) return v; return -1; };
  const o0 = idx('octo-0', 0);
  assert('rooms: maskU(octo-0) = columns 2-7', bank.maskU[o0] === 0b11111100);
  assert('rooms: octo-0 bottom edge is solid (maskD = 0)', bank.maskD[o0] === 0);

  // an H flip equals the hand-mirrored rows; same for V
  const rowsOf = (v) => {
    const out = [];
    for (let y = 0; y < ROOM_H; y++) {
      let s = '';
      for (let x = 0; x < ROOM_W; x++) s += bank.cells[v * RC + y * ROOM_W + x] === CELL_ROCK ? '#' : '.';
      out.push(s);
    }
    return out;
  };
  const strip = (s) => s.replace(/P/g, '.');
  let hOk = true, vOk = true;
  for (const r of rooms) {
    const h = idx(r.id, FLAG_H), vv = idx(r.id, FLAG_V);
    const hand = r.cells.map(s => strip(s).split('').reverse().join(''));
    const rh = rowsOf(h);
    for (let y = 0; y < ROOM_H; y++) if (rh[y] !== hand[y]) hOk = false;
    const handV = r.cells.map(strip).reverse();
    const rv = rowsOf(vv);
    for (let y = 0; y < ROOM_H; y++) if (rv[y] !== handV[y]) vOk = false;
  }
  assert('rooms: H flip equals the hand-mirrored rows (all rooms)', hOk);
  assert('rooms: V flip equals the hand-reversed rows (all rooms)', vOk);

  // connection tables are symmetric across sides
  let symOk = true, symD = true;
  for (let a = 0; a < V; a++) for (let b = 0; b < V; b++) {
    if (bank.connR[a * V + b] !== bank.connL[b * V + a]) symOk = false;
    if (bank.connD[a * V + b] !== bank.connU[b * V + a]) symD = false;
  }
  assert('rooms: connR[a][b] == connL[b][a]', symOk);
  assert('rooms: connD[a][b] == connU[b][a]', symD);
  // definition check on a few pairs
  let defOk = true;
  for (let a = 0; a < V; a += 7) for (let b = 0; b < V; b += 5) {
    if ((bank.connR[a * V + b] === 1) !== ((bank.maskR[a] & bank.maskL[b]) !== 0)) defOk = false;
    if ((bank.connD[a * V + b] === 1) !== ((bank.maskD[a] & bank.maskU[b]) !== 0)) defOk = false;
  }
  assert('rooms: conn tables follow maskR&maskL and maskD&maskU', defOk);

  // markers: green pixels became portal markers with the centroid recorded
  let mkOk = true;
  for (let v = 0; v < V; v++) {
    if (bank.marker[v] !== MK_PORTAL) mkOk = false;
    const mx = bank.markerXY[v * 2], my = bank.markerXY[v * 2 + 1];
    if (mx >= ROOM_W || my >= ROOM_H || bank.cells[v * RC + my * ROOM_W + mx] === CELL_ROCK) mkOk = false;
  }
  assert('rooms: every variant has a portal marker on a non-rock cell', mkOk);
  const pv = idx('octo-Pool', 0);
  assert('rooms: Pool is tagged as the pool special kind', bank.kind[pv] === KIND_POOL && bank.kind[o0] === 0);
  assert('rooms: an H flip mirrors the marker x (octo-1)',
    bank.markerXY[idx('octo-1', FLAG_H) * 2] === ROOM_W - 1 - bank.markerXY[idx('octo-1', 0) * 2]);
  assert('rooms: weights are set', bank.weight.every(w => w > 0));
}
