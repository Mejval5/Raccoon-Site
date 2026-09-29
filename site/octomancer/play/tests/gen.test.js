// M2 generator tests: connectivity, determinism, per-chunk timing, shells
// always behind soft rock. OVERNIGHT.md M2-1.
// Kept smaller (40 seeds x 12 chunks) than the full self-check sweep (200x20,
// run separately and recorded in web/report/m2-metrics.txt) so the in-page
// test harness stays fast.
import { createGenerator, isTopToBottomConnected, CHUNK_W, CHUNK_H } from '../js/gen.js';

export function runGenTests(assert, approx) {
  const SEEDS = 40, CHUNKS = 12;
  let connectFails = 0, maxMs = 0, shellsOk = true, shellsSeen = 0;

  for (let seed = 1; seed <= SEEDS; seed++) {
    const gen = createGenerator(seed);
    for (let i = 0; i < CHUNKS; i++) {
      const t0 = performance.now();
      const c = gen.next(i);
      const dt = performance.now() - t0;
      if (dt > maxMs) maxMs = dt;
      if (!isTopToBottomConnected(c.tiles)) connectFails++;
      for (const s of c.spawns) {
        if (s.type !== 'shell') continue;
        shellsSeen++;
        const tx = Math.floor(s.x), ty = Math.floor(s.y);
        // A shell's own cell was carved to soft rock by the generator (it
        // sits IN a sealed pocket); confirm that pocket cell is type 2.
        if (c.tiles[ty * CHUNK_W + tx] !== 2) shellsOk = false;
      }
    }
  }

  assert(`gen: ${SEEDS}x${CHUNKS} chunks all top<->bottom connected`, connectFails === 0);
  assert(`gen: per-chunk time <= 5ms (max seen ${maxMs.toFixed(2)}ms)`, maxMs <= 5);
  assert(`gen: shells (${shellsSeen} seen) always sit in a soft-rock pocket`, shellsOk);

  // Determinism: same seed -> identical bytes.
  const g1 = createGenerator(7), g2 = createGenerator(7);
  let identical = true;
  for (let i = 0; i < 5; i++) {
    const a = g1.next(i).tiles, b = g2.next(i).tiles;
    if (a.length !== b.length) { identical = false; break; }
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { identical = false; break; }
  }
  assert('gen: same seed produces identical chunk bytes', identical);

  // Chunk shape sanity.
  const sample = createGenerator(99).next(0);
  assert('gen: chunk is CHUNK_W x CHUNK_H tiles', sample.tiles.length === CHUNK_W * CHUNK_H);
  assert('gen: exitCol is inside the border', sample.exitCol >= 0 && sample.exitCol < CHUNK_W);
}
