// B1-2 biome-1 room bank tests: parsing (tags, markers, anchors), per-room solvability,
// and 5 x 1000 generated levels through generateLevel with this bank.
import {
  createRoomBank, ROOM_W, ROOM_H, RC, CELL_ROCK, MK_START, MK_EXIT,
  TAG_START, TAG_EXIT, TAG_PATH, TAG_DROP, TAG_LAND, TAG_SIDE, ANCH_UP, ANCH_DOWN, ANCH_LEFT, ANCH_RIGHT,
} from '../js/rooms.js';
import { generateLevel, fatWaterSolvable, isBedrock, LEVEL_W, LEVEL_H, BORDER } from '../js/level.js';
import { loadRoomsJson } from './rooms.test.js';

export async function loadBiome1Json() {
  const res = await fetch('../data/biome1-rooms.json');
  return res.json();
}

const ALLOWED = new Set('#.SE?^v<>Y@XB=MO'.split('')); // materials: X bedrock, B bone, = timber, M masonry, O a pushable block
const TAGS = ['start', 'exit', 'path-LR', 'drop', 'landing', 'side', 'shop'];

/** Fat-water BFS inside one room's raw cells (rock = '#' or '?', everything else water). */
function roomReach(rows, from, to) {
  const W = ROOM_W, H = ROOM_H;
  const water = (x, y) => x >= 0 && x < W && y >= 0 && y < H && rows[y][x] !== '#' && rows[y][x] !== '?';
  const fat = new Uint8Array(W * H);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    if (water(x, y) && water(x + 1, y) && water(x, y + 1) && water(x + 1, y + 1)) {
      fat[y * W + x] = fat[y * W + x + 1] = fat[(y + 1) * W + x] = fat[(y + 1) * W + x + 1] = 1;
    }
  }
  const seen = new Uint8Array(W * H), q = [];
  for (let i = 0; i < W * H; i++) if (fat[i] && from(i % W, (i / W) | 0)) { seen[i] = 1; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % W, y = (i / W) | 0;
    if (to(x, y)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const ni = ny * W + nx;
      if (fat[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni); }
    }
  }
  return false;
}

export async function runBiome1Tests(assert, approx) {
  const rooms = await loadBiome1Json();
  const bank = createRoomBank(rooms);
  bank.fallbackBank = createRoomBank(await loadRoomsJson());

  // --- r40: no 1-3 tile water cavity sealed off from the start's water (outside the 2x2 vault pockets) ---
  {
    let bad = 0, seenN = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (let lvl = 1; lvl <= 3; lvl++) {
        const lv = generateLevel(seed * 7 + 3, lvl, bank);
        const t = lv.tiles, W = LEVEL_W, H = LEVEL_H;
        const reach = new Uint8Array(W * H), st = [lv.startY * W + lv.startX];
        reach[st[0]] = 1;
        while (st.length) { const i = st.pop(), x = i % W; for (const n of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) { if (n < 0 || n >= W * H || reach[n] || t[n] !== 0) continue; reach[n] = 1; st.push(n); } }
        const seen = new Uint8Array(W * H);
        for (let i0 = 0; i0 < W * H; i0++) {
          if (t[i0] !== 0 || reach[i0] || seen[i0]) continue;
          const comp = [i0]; seen[i0] = 1;
          for (let k = 0; k < comp.length; k++) { const j = comp[k], x = j % W; for (const n of [j - W, j + W, x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1]) { if (n < 0 || n >= W * H || seen[n] || t[n] !== 0) continue; seen[n] = 1; comp.push(n); } }
          seenN++;
          if (comp.length <= 3) bad++;
        }
      }
    }
    assert('biome1 (r40): no level has a sealed water cavity of 3 tiles or fewer (900 levels, ' + seenN + ' larger sealed caves kept)', bad === 0);
  }

  // --- parsing ---
  assert(`biome1: ${rooms.length} rooms (r36: 30 + 10 new, 36-45) of 10x16`,
    rooms.length >= 36 && rooms.length <= 45 && rooms.every((r) => r.cells.length === ROOM_H && r.cells.every((s) => s.length === ROOM_W)));
  assert('biome1: ids are unique', new Set(rooms.map((r) => r.id)).size === rooms.length);
  assert('biome1: only # . S E ? ^ v < > Y @ and the material chars X B = M O appear in the ASCII', rooms.every((r) => r.cells.every((s) => [...s].every((c) => ALLOWED.has(c)))));
  assert('biome1: every room has at least one known tag', rooms.every((r) => r.tags && r.tags.length > 0 && r.tags.every((t) => TAGS.includes(t))));
  const count = (t) => rooms.filter((r) => r.tags.includes(t)).length;
  assert('biome1: enough rooms of each tag (3 start, 3 exit, 4 path-LR, 4 drop, 4 landing, 6 side)',
    count('start') >= 3 && count('exit') >= 3 && count('path-LR') >= 4 && count('drop') >= 4 && count('landing') >= 4 && count('side') >= 6);
  assert('biome1: tagged bank, one tag byte per variant, flips multiply variants', bank.tagged === true && bank.tags.length === bank.V && bank.V > rooms.length);
  const flat = (r) => r.cells.join('');
  assert('biome1: S only in start rooms (exactly one), E only in exit rooms (exactly one)', rooms.every((r) => {
    const s = (flat(r).match(/S/g) || []).length, e = (flat(r).match(/E/g) || []).length;
    return r.tags.includes('start') ? s === 1 && e === 0 : r.tags.includes('exit') ? e === 1 && s === 0 : s === 0 && e === 0;
  }));
  let markerBad = 0;
  for (let v = 0; v < bank.V; v++) {
    const t = bank.tags[v];
    if ((t & TAG_START) && bank.marker[v] !== MK_START) markerBad++;
    if ((t & TAG_EXIT) && bank.marker[v] !== MK_EXIT) markerBad++;
    if (!(t & (TAG_START | TAG_EXIT)) && bank.marker[v] !== 0) markerBad++;
  }
  assert('biome1: variant markers match the start / exit tags', markerBad === 0);

  // anchors: every anchor is a water cell touching rock on the side it points at (all flips)
  let anchors = 0, anchorBad = 0;
  const D = { [ANCH_UP]: [0, -1], [ANCH_DOWN]: [0, 1], [ANCH_LEFT]: [-1, 0], [ANCH_RIGHT]: [1, 0] };
  for (let v = 0; v < bank.V; v++) {
    for (let i = 0; i < RC; i++) {
      const a = bank.anchors[v * RC + i];
      if (!a) continue;
      anchors++;
      const x = i % ROOM_W, y = (i / ROOM_W) | 0, nx = x + D[a][0], ny = y + D[a][1];
      if (bank.cells[v * RC + i] === CELL_ROCK) anchorBad++;
      if (nx < 0 || nx >= ROOM_W || ny < 0 || ny >= ROOM_H || bank.cells[v * RC + ny * ROOM_W + nx] !== CELL_ROCK) anchorBad++;
    }
  }
  assert(`biome1: ${anchors} anchors (all flips) sit on water next to the rock they point at`, anchors > 40 && anchorBad === 0);

  // r36 level detail: every non-shop room has interior structure, anchors and quantum cells; three set pieces exist
  {
    const plain = rooms.filter((r) => !r.tags.includes('shop'));
    const interior = (r, f) => { let n = 0; for (let y = 1; y < ROOM_H - 1; y++) for (let x = 1; x < ROOM_W - 1; x++) if (f(r.cells[y][x])) n++; return n; };
    const qFrac = plain.reduce((a, r) => a + interior(r, (c) => c === '?'), 0) / (plain.length * (ROOM_W - 2) * (ROOM_H - 2));
    assert(`biome1 r36: about 15% of the interior cells are quantum '?' (${(qFrac * 100).toFixed(1)}%, 11-20%), so no two levels repeat`, qFrac > 0.11 && qFrac < 0.2);
    assert('biome1 r36: every non-shop room has quantum cells and at least one pattern anchor (the hand-built set pieces are used as drawn)', plain.filter((r) => !r.id.startsWith('b1-set-')).every((r) => interior(r, (c) => c === '?') >= 2 && /[\^v<>]/.test(r.cells.join(''))));
    const ids = rooms.map((r) => r.id);
    assert('biome1 r36: the three set pieces (sunken wreck, urchin garden, current-jet gauntlet) are in the bank', ['b1-set-wreck', 'b1-set-garden', 'b1-set-gauntlet'].every((i) => ids.includes(i)));
    const detailed = plain.filter((r) => !/shaft|chimney|set-/.test(r.id)); // the set pieces are drawn by hand; the clean-walled shaft rooms keep the 3-wide shafts the eel pattern needs
    const withStructure = detailed.filter((r) => {
      // interior structure: rock cells inside the room that touch water on two or more sides (ledges, pillars, bumps, platforms)
      let n = 0;
      for (let y = 2; y < ROOM_H - 2; y++) for (let x = 2; x < ROOM_W - 2; x++) {
        if (!'#XB=M'.includes(r.cells[y][x])) continue;
        let open = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ('.^v<>SEO'.includes(r.cells[y + dy][x + dx])) open++;
        if (open >= 2) n++;
      }
      return n >= 1;
    }).length;
    assert(`biome1 r36: ${withStructure} of ${detailed.length} non-shop, non-shaft rooms have ledges, pillars, bumps or platforms inside`, withStructure === detailed.length);
  }

  // open fraction: caves, not open fields
  let rock = 0;
  for (let i = 0; i < bank.cells.length; i++) if (bank.cells[i] === CELL_ROCK) rock++;
  const bankRock = rock / bank.cells.length;
  assert(`biome1: bank is ${(bankRock * 100).toFixed(0)}% rock (45-65%)`, bankRock > 0.45 && bankRock < 0.65);

  // per-room solvability in the room's own cells, by role
  const openL = (rows) => (x, y) => x === 0 && rows[y][x] !== '#';
  let roomBad = [];
  for (const r of rooms) {
    const rows = r.cells;
    const left = (x) => x === 0, right = (x) => x === ROOM_W - 1, top = (x, y) => y === 0, bot = (x, y) => y === ROOM_H - 1;
    const anyEdge = (x, y) => x === 0 || x === ROOM_W - 1 || y === 0 || y === ROOM_H - 1;
    const tg = r.tags;
    if (tg.includes('path-LR') && !roomReach(rows, (x) => left(x), (x) => right(x))) roomBad.push(r.id + ' L->R');
    if (tg.includes('drop') && !roomReach(rows, (x, y) => anyEdge(x, y) && !bot(x, y), bot)) roomBad.push(r.id + ' ->bottom');
    if (tg.includes('landing') && !roomReach(rows, top, (x, y) => left(x) || right(x))) roomBad.push(r.id + ' top->side');
    if (tg.includes('start')) {
      const s = rows.findIndex((row) => row.includes('S')), sx = rows[s].indexOf('S');
      if (!roomReach(rows, (x, y) => Math.abs(x - sx) <= 1 && Math.abs(y - s) <= 1, (x, y) => anyEdge(x, y) && x !== sx)) roomBad.push(r.id + ' S->edge');
    }
    if (tg.includes('exit')) {
      const s = rows.findIndex((row) => row.includes('E')), sx = rows[s].indexOf('E');
      if (!roomReach(rows, (x, y) => Math.abs(x - sx) <= 1 && Math.abs(y - s) <= 1, (x, y) => top(x, y) || (anyEdge(x, y) && x !== sx))) roomBad.push(r.id + ' E->edge');
    }
  }
  assert('biome1: every path / drop / landing / start / exit room is swimmable inside (2x2 fat water)' + (roomBad.length ? ' [' + roomBad.join(', ') + ']' : ''), roomBad.length === 0);

  // connection tables: symmetric, and a seam is at least 2 cells wide
  const V = bank.V;
  let sym = true, wide = true;
  for (let a = 0; a < V; a += 3) for (let b = 0; b < V; b++) {
    if (bank.connR[a * V + b] !== bank.connL[b * V + a]) sym = false;
    if (bank.connD[a * V + b] !== bank.connU[b * V + a]) sym = false;
    if (bank.connR[a * V + b]) { const m = bank.maskR[a] & bank.maskL[b]; if (!(m & (m >> 1))) wide = false; }
    if (bank.connD[a * V + b]) { const m = bank.maskD[a] & bank.maskU[b]; if (!(m & (m >> 1))) wide = false; }
  }
  assert('biome1: connection tables are symmetric and every seam is 2+ cells wide', sym && wide);

  // --- 5 x 1000 generated levels ---
  const SEEDS = [1, 42, 1234, 99991, 0xC0FFEE], N = 1000;
  let total = 0, unsolved = 0, carved = 0, viaPng = 0, borderBad = 0, clearBad = 0, markBad = 0, rowBad = 0;
  let anchorLvBad = 0, anchorLv = 0, rockSum = 0, sealedStart = 0;
  for (const seed of SEEDS) {
    for (let i = 0; i < N; i++) {
      const lv = generateLevel(seed, i, bank);
      total++;
      if (lv.fallback) carved++;
      if (lv.bankFallback) viaPng++;
      if (!fatWaterSolvable(lv.tiles, lv.startX, lv.startY, lv.exitX, lv.exitY)) unsolved++;
      const t = lv.tiles;
      let r = 0;
      for (let y = 0; y < LEVEL_H; y++) for (let x = 0; x < LEVEL_W; x++) {
        const v = t[y * LEVEL_W + x];
        if (v > 5) borderBad++;
        if (isBedrock(x, y) && v !== 2) borderBad++;
        if (!isBedrock(x, y)) r += v;
      }
      rockSum += r / ((LEVEL_W - 2 * BORDER) * (LEVEL_H - 2 * BORDER));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (t[(lv.startY + dy) * LEVEL_W + lv.startX + dx] !== 0) clearBad++;
      }
      let ns = 0, ne = 0;
      for (let k = 0; k < lv.nMarks; k++) {
        const mx = lv.marks[k * 3], my = lv.marks[k * 3 + 1], mk = lv.marks[k * 3 + 2];
        if (t[my * LEVEL_W + mx] !== 0) markBad++;
        if (mk === MK_START) ns++;
        if (mk === MK_EXIT) ne++;
      }
      if (ns !== 1 || ne !== 1) markBad++;
      if (lv.startY >= BORDER + ROOM_H || lv.exitY < BORDER + 3 * ROOM_H) rowBad++;
      for (let k = 0; k < lv.nAnchors; k++) {
        const ax = lv.anchors[k * 3], ay = lv.anchors[k * 3 + 1], code = lv.anchors[k * 3 + 2];
        anchorLv++;
        const d = D[code];
        if (t[ay * LEVEL_W + ax] !== 0 || t[(ay + d[1]) * LEVEL_W + ax + d[0]] === 0) anchorLvBad++;
      }
    }
  }
  assert(`biome1: ${total} generated levels are all solvable without bombs (fat-water BFS)`, unsolved === 0);
  assert(`biome1: carved-corridor fallback under 1% (${carved}) and PNG-bank fallback under 1% (${viaPng})`, carved / total < 0.01 && viaPng / total < 0.01);
  assert('biome1: bedrock border intact (material 2) and tiles are only material ids 0-5', borderBad === 0);
  assert('biome1: 3x3 water clearance at every start marker', clearBad === 0);
  assert('biome1: exactly one start and one exit marker per level, on water', markBad === 0);
  assert('biome1: start is in the top row of rooms, exit in the bottom row', rowBad === 0);
  assert(`biome1: level anchors (${anchorLv}) still touch the rock they point at`, anchorLv > total && anchorLvBad === 0);
  const meanRock = rockSum / total;
  assert(`biome1: levels average ${(meanRock * 100).toFixed(0)}% rock (42-62%), caves not open fields`, meanRock > 0.42 && meanRock < 0.62);

  // determinism
  const a = generateLevel(7, 3, bank), b = generateLevel(7, 3, bank);
  let same = true;
  for (let i = 0; i < a.tiles.length; i++) if (a.tiles[i] !== b.tiles[i]) same = false;
  assert('biome1: generateLevel is deterministic for (seed, level)', same && a.startX === b.startX && a.exitY === b.exitY);
  const c = generateLevel(7, 4, bank);
  let diff = false;
  for (let i = 0; i < a.tiles.length; i++) if (a.tiles[i] !== c.tiles[i]) diff = true;
  assert('biome1: different level indexes differ', diff);

  // variety: many different room variants appear across levels
  const seenVar = new Set();
  for (let i = 0; i < 200; i++) { const lv = generateLevel(5, i, bank); for (const v of lv.roomVar) seenVar.add(bank.ids[v]); }
  assert(`biome1: ${seenVar.size} of ${rooms.length} rooms are used across 200 levels`, seenVar.size >= rooms.length - 2);

  // PNG bank fallback: a bank that cannot plan a path (only side rooms) hands over to its fallbackBank
  const sideOnly = createRoomBank(rooms.filter((r) => r.tags.includes('side')));
  sideOnly.fallbackBank = bank.fallbackBank;
  const fb = generateLevel(3, 0, sideOnly);
  assert('biome1: an unplayable bank falls back to the Octomancer PNG rooms, still solvable',
    fb.bankFallback === 1 && fatWaterSolvable(fb.tiles, fb.startX, fb.startY, fb.exitX, fb.exitY));
}
