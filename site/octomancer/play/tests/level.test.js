// M1-3 level generator tests (level.js): solvability by the fat-water BFS,
// determinism, border, fallback rate and speed.
import { MAT_BEDROCK, MAT_COUNT } from '../js/materials.js';
import { createRoomBank, MK_START, MK_EXIT } from '../js/rooms.js';
import {
  generateLevel, fatWaterSolvable, isBedrock, LEVEL_W, LEVEL_H, NROOMS, BORDER,
} from '../js/level.js';
import { loadRoomsJson } from './rooms.test.js';
import { portalPlace, PORTAL_SQUASH } from '../js/portal-draw.js';

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function runLevelTests(assert, approx) {
  const bank = createRoomBank(await loadRoomsJson());
  const SEEDS = [1, 42, 1234, 99991, 0xC0FFEE], LEVELS = 1000;

  assert('level: size is 34x68', LEVEL_W === 34 && LEVEL_H === 68);

  let unsolved = 0, borderBad = 0, fallbacks = 0, total = 0, badCode = 0, clearBad = 0, markBad = 0, cornerBad = 0;
  for (const seed of SEEDS) {
    for (let i = 0; i < LEVELS; i++) {
      const lv = generateLevel(seed, i, bank);
      total++;
      if (lv.fallback) fallbacks++;
      if (!fatWaterSolvable(lv.tiles, lv.startX, lv.startY, lv.exitX, lv.exitY)) unsolved++;
      const t = lv.tiles;
      for (let y = 0; y < LEVEL_H; y++) {
        for (let x = 0; x < LEVEL_W; x++) {
          const v = t[y * LEVEL_W + x];
          if (v >= MAT_COUNT) badCode++;
          if (isBedrock(x, y) && v !== MAT_BEDROCK) borderBad++;
        }
      }
      // 3x3 water clearance at the start marker
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (t[(lv.startY + dy) * LEVEL_W + lv.startX + dx] !== 0) clearBad++;
      }
      // marker list has exactly one start and one exit, on water, at the reported spots
      let ns = 0, ne = 0;
      for (let k = 0; k < lv.nMarks; k++) {
        const mx = lv.marks[k * 3], my = lv.marks[k * 3 + 1], mk = lv.marks[k * 3 + 2];
        if (t[my * LEVEL_W + mx] !== 0) markBad++;
        if (mk === MK_START) { ns++; if (mx !== lv.startX || my !== lv.startY) markBad++; }
        if (mk === MK_EXIT) { ne++; if (mx !== lv.exitX || my !== lv.exitY) markBad++; }
      }
      if (ns !== 1 || ne !== 1) markBad++;
      // start is in the top row of rooms, exit in the bottom row
      if (lv.startY >= BORDER + 16 || lv.exitY < BORDER + 3 * 16) cornerBad++;
    }
  }
  assert(`level: ${SEEDS.length} seeds x ${LEVELS} levels all solvable by the fat-water BFS (${total} checked)`, unsolved === 0);
  assert('level: border cells (2 tiles on every side) are all bedrock', borderBad === 0);
  assert('level: tiles only hold material ids (0 water .. 5 masonry)', badCode === 0);
  assert('level: start marker has 3x3 water clearance', clearBad === 0);
  assert('level: marker list has one start and one exit on water', markBad === 0);
  assert('level: start in the top room row, exit in the bottom room row', cornerBad === 0);
  const rate = fallbacks / total;
  // round 26: the exit ring is ~2.7 tiles wide, so the floor under ex-1..ex+1 must be solid (where a run exists)
  let ringBad = 0, ringTotal = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const lv = generateLevel(seed, 0, bank);
    if (lv.fallback) continue;
    ringTotal++;
    const T = (x, y) => lv.tiles[y * LEVEL_W + x];
    for (let dx = -1; dx <= 1; dx++) if (T(lv.exitX + dx, lv.exitY + 1) === 0) { ringBad++; break; }
  }
  assert(`level: exit ring has floor under its full width (${ringBad}/${ringTotal} bad, <= 10%)`, ringBad <= ringTotal * 0.1);
  // r44: the exit whirlpool sits in the open floor span and never over rock: a flat floor at least 3 tiles wide with water above it, and the
  // drawn footprint (width 1.2 x the idle one at its widest, height PORTAL_SQUASH of that, resting on the floor line) covers water only
  {
    let flatBad = 0, overlapBad = 0, n = 0, flatFirst = '', overlapFirst = '';
    for (let seed = 1; seed <= 300; seed++) {
      const lv = generateLevel(seed, 0, bank);
      if (lv.fallback) continue;
      n++;
      const T = (x, y) => (x < 0 || y < 0 || x >= LEVEL_W || y >= LEVEL_H ? 1 : lv.tiles[y * LEVEL_W + x]);
      let ok = true;
      for (let dx = -1; dx <= 1; dx++) if (T(lv.exitX + dx, lv.exitY) !== 0 || T(lv.exitX + dx, lv.exitY + 1) === 0) ok = false;
      if (!ok) { flatBad++; flatFirst = flatFirst || `seed ${seed}`; }
      const pl = portalPlace((x, y) => T(Math.floor(x), Math.floor(y)), lv.exitX, lv.exitY);
      // sample points inside the drawn ellipse (the idle frame; the Bounce frames are up to 1.2 x as wide): all in water, the floor line rock
      const rx = pl.w * 1.1 / 2, ry = rx * PORTAL_SQUASH;
      let hit = !pl.flat;
      for (let fx = -1; fx <= 1 && !hit; fx += 0.25) {
        const x = pl.cx + fx * rx;
        if (T(Math.floor(x), pl.floorY) === 0) hit = true;
        for (let dy = -0.8; dy <= 0.8 && !hit; dy += 0.4) {
          if (fx * fx + dy * dy > 0.81) continue; // outside the ellipse
          if (T(Math.floor(x), Math.floor(pl.floorY - ry + dy * ry)) !== 0) hit = true;
        }
      }
      if (hit) { overlapBad++; overlapFirst = overlapFirst || `seed ${seed}`; }
    }
    assert(`level: the exit stands on a flat floor 3+ tiles wide (${flatBad}/${n} not; ${flatFirst})`, flatBad <= n * 0.02);
    assert(`level: the exit whirlpool's footprint covers water only, resting on rock (${overlapBad}/${n} not; ${overlapFirst})`, overlapBad <= n * 0.02);
  }
  assert(`level: fallback rate ${(rate * 100).toFixed(2)}% < 1%`, rate < 0.01);

  // determinism and purity
  const a = generateLevel(7, 3, bank);
  generateLevel(8, 9, bank); // an unrelated call in between must not matter
  const b = generateLevel(7, 3, bank);
  assert('level: same seed and index give the same level',
    sameBytes(a.tiles, b.tiles) && sameBytes(a.roomVar, b.roomVar) && sameBytes(a.marks, b.marks) &&
    a.startX === b.startX && a.exitY === b.exitY);
  const c = generateLevel(7, 4, bank), d = generateLevel(8, 3, bank);
  assert('level: a different level index or run seed gives a different level',
    !sameBytes(a.tiles, c.tiles) && !sameBytes(a.tiles, d.tiles));
  assert('level: roomVar and roomRole cover all 12 cells', a.roomVar.length === NROOMS && a.roomRole.length === NROOMS);

  // last resort: rooms that can never connect still give a solvable level (carved corridor)
  const rock = Array.from({ length: 16 }, (_, y) => (y === 8 ? '####P#####' : '##########'));
  const dead = createRoomBank([{ id: 'rock', flip: '', weight: 1, kind: 'room', cells: rock }]);
  const fb = generateLevel(5, 5, dead);
  assert('level: forced fallback flags the level and carves a solvable corridor',
    fb.fallback === 1 && fatWaterSolvable(fb.tiles, fb.startX, fb.startY, fb.exitX, fb.exitY));
  let borderOk = true;
  for (let y = 0; y < LEVEL_H; y++) for (let x = 0; x < LEVEL_W; x++) if (isBedrock(x, y) && fb.tiles[y * LEVEL_W + x] !== MAT_BEDROCK) borderOk = false;
  assert('level: the fallback corridor leaves the border intact', borderOk);

  // speed: p95 under 8 ms over 3 seeds x 1000 levels
  const times = new Float64Array(3000);
  let n = 0;
  for (const seed of SEEDS.slice(0, 3)) {
    for (let i = 0; i < 1000; i++) {
      const t0 = performance.now();
      generateLevel(seed + 1000, i, bank);
      times[n++] = performance.now() - t0;
    }
  }
  times.sort();
  const p95 = times[Math.floor(n * 0.95)];
  assert(`level: p95 ${p95.toFixed(2)} ms < 8 ms (max ${times[n - 1].toFixed(2)} ms)`, p95 < 8);
  window.__levelP95 = p95; window.__levelFallbackRate = rate;
}
