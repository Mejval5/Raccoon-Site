// Materials tests (materials.js, rooms.js mats, level.js placeMaterials, world-v2.js layers, render.js paintMaterialCell):
// material ids round-trip from room / map ASCII, the draw order at every boundary pair (pixels of the real wall bake on a
// hand-made grid), bedrock survives bombs, bombs / boulders break what they should, and no seam inside a material.
import {
  MAT_WATER, MAT_ROCK, MAT_BEDROCK, MAT_BONE, MAT_TIMBER, MAT_MASONRY, MAT_CHARS, MAT_CHAR_OF, MAT_PRIORITY, MAT_DRAW_ORDER,
  MAT_NAMES, setTileDrawHook, MAT_CORAL,
} from '../js/materials.js';
import { createRoomBank, ROOM_W, ROOM_H, RC, CELL_ROCK } from '../js/rooms.js';
import { parseAuthoredMap } from '../js/authored.js';
import { generateLevel, setDefaultBank, LEVEL_W, LEVEL_H, BORDER } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps } from '../js/props.js';
import { createBombs } from '../js/bomb.js';
import { createOctopus } from '../js/octopus.js';
import { artImg, ensureV2Art } from '../js/v2-art.js';

const PAIRS = [];
// the generated materials only: coral (6) is grown by a spell, drawn lowest by priority (the draw-order test below); adding its pairs would move
// every pair down the sheet onto other texture spots, and the dark fish-bone and bedrock rims are too alike to sample there
for (let a = 0; a < MAT_DRAW_ORDER.length; a++) for (let b = a + 1; b < MAT_DRAW_ORDER.length; b++) if (MAT_DRAW_ORDER[a] !== 6 && MAT_DRAW_ORDER[b] !== 6) PAIRS.push([MAT_DRAW_ORDER[a], MAT_DRAW_ORDER[b]]); // [lower, higher]

/** A small authored-style level (bedrock border) with `paint(put)` filling the inside. */
function handLevel(W, H, paint) {
  const tiles = new Uint8Array(W * H);
  const put = (x, y, m) => { tiles[y * W + x] = m; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) put(x, y, MAT_BEDROCK);
  paint(put);
  return { authored: true, id: 'mat-test', w: W, h: H, tiles, marks: new Int16Array(48), nMarks: 0, startX: 3, startY: 3, exitX: 4, exitY: 3, prompts: [], spawns: [], nSpawns: 0, fallback: 0, attempts: 0, nAnchors: 0, walls: new Int16Array(0) };
}

function parseRgb(css) { const m = css.match(/\d+/g).map(Number); return [m[0], m[1], m[2]]; }
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export async function runMaterialsTests(assert, bank) {
  // ---- ids and room ASCII ----
  assert('materials: ids 0 water, 1 rock, 2 bedrock, 3 bone, 4 timber, 5 masonry', MAT_WATER === 0 && MAT_ROCK === 1 && MAT_BEDROCK === 2 && MAT_BONE === 3 && MAT_TIMBER === 4 && MAT_MASONRY === 5);
  assert('materials: draw order is coral < timber < bone < masonry < rock < bedrock (bedrock on top; coral only grows from the spell)', MAT_DRAW_ORDER.join() === [MAT_CORAL, MAT_TIMBER, MAT_BONE, MAT_MASONRY, MAT_ROCK, MAT_BEDROCK].join() &&
    MAT_DRAW_ORDER.every((m, k) => k === 0 || MAT_PRIORITY[m] > MAT_PRIORITY[MAT_DRAW_ORDER[k - 1]]));
  assert('materials: every solid char maps to its id and back', Object.keys(MAT_CHARS).every((c) => MAT_CHAR_OF[MAT_CHARS[c]] === c));
  {
    const rows = [];
    for (let y = 0; y < ROOM_H; y++) rows.push(y === 5 ? '#XB=M.....' : y === 9 ? '..MM==BBXX' : y === 15 ? '##########' : y === 0 ? '##########' : y === 7 ? '....S.....' : '#........#');
    const b = createRoomBank([{ id: 'mat-room', cells: rows, flip: 'h', kind: 'room' }]);
    let ok = true;
    for (let v = 0; v < b.V; v++) {
      const hflip = b.flags[v] & 1;
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
        const ch = rows[y][hflip ? ROOM_W - 1 - x : x];
        const i = v * RC + y * ROOM_W + x;
        const want = MAT_CHARS[ch] || 0;
        if ((want ? b.mats[i] : 0) !== want || (want && b.cells[i] !== CELL_ROCK)) ok = false;
      }
    }
    assert('materials: room ASCII round-trips to material ids (plain and mirrored variant, every material marks a rock cell)', ok && b.V === 2);
  }
  {
    const rows = ['##########', '##########', '##.XB=M.##', '##S....E##', '##..BB..##', '##########', '##########'];
    const map = parseAuthoredMap({ id: 'm', rows });
    let back = '';
    for (let y = 0; y < map.h; y++) { for (let x = 0; x < map.w; x++) { const t = map.tiles[y * map.w + x]; back += t === 0 ? rows[y][x] : MAT_CHAR_OF[t]; } back += '\n'; }
    const want = rows.map((r, y) => [...r].map((c, x) => (x < 2 || y < 2 || x >= 8 || y >= 5 ? 'X' : c)).join('')).join('\n') + '\n';
    assert('materials: authored map ASCII round-trips (the border becomes bedrock)', back === want);
  }
  // generated levels: every non-rock material a room asks for is still there (or water where clearance/pockets carved it)
  {
    let checked = 0, bad = 0, seen = new Set(), borderBad = 0;
    for (let s = 0; s < 120; s++) {
      const lv = generateLevel(1000 + s, s % 3, bank);
      if (lv.bankFallback || lv.fallback) continue;
      for (let cell = 0; cell < 12; cell++) {
        const ox = BORDER + (cell % 3) * ROOM_W, oy = BORDER + ((cell / 3) | 0) * ROOM_H, src = lv.roomVar[cell] * RC;
        for (let i = 0; i < RC; i++) {
          const m = bank.mats[src + i];
          if (!m || m === MAT_ROCK || bank.cells[src + i] !== CELL_ROCK) continue;
          const t = lv.tiles[(oy + ((i / ROOM_W) | 0)) * LEVEL_W + ox + (i % ROOM_W)];
          checked++;
          if (t !== m && t !== 0) bad++;
        }
      }
      for (let i = 0; i < lv.tiles.length; i++) seen.add(lv.tiles[i]);
      for (let y = 0; y < LEVEL_H; y++) for (let x = 0; x < LEVEL_W; x++) if ((x < BORDER || y < BORDER || x >= LEVEL_W - BORDER || y >= LEVEL_H - BORDER) && lv.tiles[y * LEVEL_W + x] !== MAT_BEDROCK) borderBad++;
    }
    assert(`materials: 120 generated levels keep every room material cell (${checked} checked) and the border is bedrock`, checked > 20 && bad === 0 && borderBad === 0);
    assert(`materials: generated levels hold every material (seen ${[...seen].sort().map((m) => MAT_NAMES[m]).join(', ')})`, [0, 1, 2, 3, 4, 5].every((m) => seen.has(m)));
  }
  // the materials pass never changes the shape (solid stays solid, water stays water) and shops get a frame
  {
    let framed = 0, shops = 0;
    for (let s = 0; s < 80; s++) {
      const lv = generateLevel(2000 + s, s % 3, bank);
      if (!lv.shop) continue;
      shops++;
      const sh = lv.shop;
      let n = 0;
      for (let y = sh.y0; y < sh.y1; y++) for (let x = sh.x0; x < sh.x1; x++) { const t = lv.tiles[y * LEVEL_W + x]; if (t === MAT_MASONRY || t === MAT_TIMBER) n++; }
      if (n >= 8) framed++;
    }
    assert(`materials: every shop room is framed in masonry and timber (${framed} of ${shops})`, shops > 5 && framed === shops);
  }

  // ---- gameplay: bombs, bedrock, boulders ----
  {
    const lvl = handLevel(16, 12, (put) => {
      for (let x = 2; x < 14; x++) put(x, 8, MAT_ROCK);
      put(6, 7, MAT_BEDROCK); put(7, 7, MAT_ROCK); put(8, 7, MAT_BONE); put(9, 7, MAT_TIMBER); put(5, 7, MAT_MASONRY);
    });
    const w = createLevelWorld(0, 0, { level: lvl });
    assert('materials: bedrock is never breakable (interior bedrock tile too)', !w.isBreakable(6, 7) && w.breakTile(6, 7) === false && w.tileAt(6, 7) === MAT_BEDROCK && w.isBedrock(6, 7));
    assert('materials: rock, bone, timber and masonry are bomb-breakable', [5, 7, 8, 9].every((x) => w.isBreakable(x, 7)));
    assert('materials: a boulder smashes timber and bone but not rock, masonry or bedrock', !w.smashTile(7, 7) && !w.smashTile(5, 7) && !w.smashTile(6, 7) && w.smashTile(8, 7) && w.smashTile(9, 7) && w.tileAt(8, 7) === 0 && w.tileAt(9, 7) === 0);
    // a real bomb going off between bedrock and rock
    const lvl2 = handLevel(16, 12, (put) => { for (let x = 2; x < 14; x++) { put(x, 8, MAT_ROCK); put(x, 9, MAT_ROCK); } put(7, 8, MAT_BEDROCK); put(8, 8, MAT_BEDROCK); put(7, 7, MAT_BEDROCK); });
    const w2 = createLevelWorld(0, 0, { level: lvl2 });
    const props = createProps(), bombs = createBombs(props), octo = createOctopus(13.5, 3.5);
    const enemies = { killInRadius() { return 0; }, knockInRadius() {} };
    octo.bombs = 5;
    bombs.place(octo, 8.5, 7.5, null, { pinned: true });
    for (let k = 0; k < 220; k++) { props.step(0.02, w2, null); bombs.update(0.02, w2, octo, enemies); }
    assert('materials: a bomb next to bedrock leaves every bedrock tile and breaks the rock around it', w2.tileAt(7, 8) === MAT_BEDROCK && w2.tileAt(8, 8) === MAT_BEDROCK && w2.tileAt(7, 7) === MAT_BEDROCK && (w2.tileAt(9, 8) === 0 || w2.tileAt(6, 8) === 0));
  }
  // a falling boulder (hazard rock prop) breaks a timber platform and keeps falling
  {
    const { createHazards, makeHazardRecord } = await import('../js/hazards.js');
    const lvl = handLevel(14, 20, (put) => { for (let x = 2; x < 12; x++) { put(x, 3, MAT_ROCK); put(x, 17, MAT_ROCK); } for (let x = 4; x < 10; x++) put(x, 10, MAT_TIMBER); });
    const w = createLevelWorld(0, 0, { level: lvl });
    const props = createProps(), hz = createHazards(props);
    hz.add(makeHazardRecord('rock', 6.5, 4.5, 0, 1, lvl.tiles, 14, 20));
    const octo = createOctopus(7.4, 8.2); // under the hanging rock, above the platform: it drops
    octo.hearts = 99;
    for (let k = 0; k < 400; k++) { props.step(0.02, w, octo); hz.update(0.02, 0, octo, w, null); octo.x = 7.4; octo.y = 8.2; }
    assert('materials: a falling boulder smashes the timber platform under it', w.tileAt(6, 10) === 0 && w.tileAt(4, 10) === MAT_TIMBER);
  }

  // ---- rendering: draw order at every boundary pair, and no seams ----
  ensureV2Art();
  for (let i = 0; i < 100 && ['rock', 'matBedrock', 'matTimber', 'matMasonry', 'matFishbone'].some((k) => !artImg(k)); i++) await new Promise((r) => setTimeout(r, 30));
  const realFetch = window.fetch;
  window.fetch = (u, ...a) => (String(u).includes('octopus.json') ? new Promise(() => {}) : realFetch(u, ...a));
  const { createRenderer, MATERIAL_STYLE } = await import('../js/render.js');
  window.fetch = realFetch;
  const RIM = MATERIAL_STYLE.MAT_RIM.map((c) => (c ? parseRgb(c) : null));
  {
    // each pair: lower material left (x 4..6), higher right (x 7..9), rows y0..y0+2; water around
    const W = 14, H = 4 + PAIRS.length * 5;
    const lvl = handLevel(W, H, (put) => {
      PAIRS.forEach(([lo, hi], k) => { const y0 = 3 + k * 5; for (let y = y0; y < y0 + 3; y++) { for (let x = 4; x < 7; x++) put(x, y, lo); for (let x = 7; x < 10; x++) put(x, y, hi); } });
    });
    const w = createLevelWorld(0, 0, { level: lvl });
    const view = document.createElement('canvas'); view.width = 18 * 48; view.height = 24 * 48;
    const r = createRenderer(view.getContext('2d'), w);
    const px = (x, y) => {
      const bi = Math.floor(y / w.bandRows), cell = r.debugCell(bi, 0), ci = Math.floor(x / cell.cols);
      const c = ci === 0 ? cell : r.debugCell(bi, ci);
      const d = c.canvas.getContext('2d').getImageData(Math.floor((x - c.x0) * c.s), Math.floor((y - c.y0) * c.s), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    let okAll = true; const notes = [];
    PAIRS.forEach(([lo, hi], k) => {
      const ym = 3 + k * 5 + 1.5;
      const onLo = px(7 - 0.035, ym), onHi = px(7 + 0.035, ym);
      // the boundary carries the HIGHER material's rim on both sides of the line (it overlaps the lower one), not the lower one's
      const ok = dist3(onLo, RIM[hi]) < dist3(onLo, RIM[lo]) && dist3(onLo, RIM[hi]) < 45 && dist3(onHi, RIM[hi]) < 45;
      if (!ok) { okAll = false; notes.push(`${MAT_NAMES[lo]}|${MAT_NAMES[hi]} lo-side ${onLo.slice(0, 3)} rimHi ${RIM[hi]}`); }
    });
    assert(`materials draw order: at all ${PAIRS.length} boundary pairs the higher material's edge overlaps the lower one ${notes.join('; ')}`, okAll);
    const air = px(5.5, 3 + 0 * 5 - 0.6), solidLo = px(5.5, 3 + 0 * 5 + 1.5);
    assert('materials draw order: water stays clear and the lower material is opaque inside', air[3] === 0 && solidLo[3] === 255);
    // the treasure hook runs for non-bedrock solid tiles, after rock and before bedrock
    const calls = [];
    setTileDrawHook((ctx, tx, ty, m) => { calls.push(m); });
    w.touchTile(5, 4);
    r.debugCell(0, 0);
    setTileDrawHook(null);
    assert(`materials: the per-tile draw hook is called for solid non-bedrock tiles of a rebaked cell (${calls.length} calls)`, calls.length > 0 && !calls.includes(MAT_BEDROCK) && !calls.includes(0));
    r.dispose();
  }
  {
    // no seams: on a generated level, along every cell border inside a solid area of one material (a 3x3 block of it),
    // the baked pixels just either side of the border match (no rim, no chunk line)
    let checked = 0, bad = 0, worst = 0;
    for (const seed of [3, 11, 29, 41, 57]) for (const lvi of [0, 1, 2]) {
      const w = createLevelWorld(seed, lvi);
      const view = document.createElement('canvas'); view.width = 412; view.height = 915;
      const r = createRenderer(view.getContext('2d'), w);
      const cols = r.debugCell(0, 0).cols, rows = w.bandRows;
      const same = (x, y) => { const m = w.tileAt(x, y); if (!m) return 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.tileAt(x + dx, y + dy) !== m) return 0; return m; };
      for (let bi = 1; bi < w.bandCount(); bi++) {
        const yb = bi * rows;
        for (let x = 2; x < w.width - 2; x++) {
          if (!same(x, yb) || !same(x, yb - 1)) continue;
          const up = r.debugCell(bi - 1, Math.floor(x / cols)), dn = r.debugCell(bi, Math.floor(x / cols));
          const s = up.s, ix = Math.floor((x + 0.5 - up.x0) * s);
          const a = up.canvas.getContext('2d').getImageData(ix, Math.floor(rows * s) - 1, 1, 1).data;
          const b = dn.canvas.getContext('2d').getImageData(ix, 0, 1, 1).data;
          const d = dist3(a, b);
          checked++; worst = Math.max(worst, d);
          if (d > 60 || a[3] < 255 || b[3] < 255 || dist3(a, RIM[MAT_ROCK]) < 50) bad++;
        }
      }
      r.dispose();
    }
    assert(`materials: no seam across wall-cell borders inside solid material (${checked} border pixels, worst colour step ${worst.toFixed(0)})`, checked > 40 && bad === 0);
  }
}
