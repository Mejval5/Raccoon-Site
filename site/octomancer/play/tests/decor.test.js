// Wall-critter decor tests (Otter's "alive pass", this session --
// NIGHT-LOG.md): density per chunk, determinism, and that critters are
// non-hostile (no collision/damage hooks -- they carry no radius or
// contactDamage field the way enemies do, so they can never block or block
// the generator's guaranteed path).
import { createDecor } from '../js/decor.js';
import { generateChunk } from '../js/gen.js';

export function runDecorTests(assert, approx) {
  const chunkW = 32, chunkH = 24;

  // --- Density: many chunks should carry a good number of wall critters,
  // clearly more than "a couple of plants" (Daniel: "a lot more critters on
  // the walls"). ---
  {
    let counts = [];
    for (let seed = 1; seed <= 15; seed++) {
      const decor = createDecor(chunkW, chunkH);
      const chunk = generateChunk(seed, 0, 16);
      const resident = [{ index: 0, yOffset: 0, chunk }];
      decor.update(0.02, resident);
      counts.push(decor.visibleCritters(resident).length);
    }
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    assert(`decor: wall critters average >= 5 per chunk (got ${avg.toFixed(2)}, samples ${JSON.stringify(counts)})`, avg >= 5);
  }

  // --- Determinism: same chunk data -> identical critter list every time. ---
  {
    const chunk = generateChunk(42, 0, 16);
    const resident = [{ index: 0, yOffset: 0, chunk }];
    const d1 = createDecor(chunkW, chunkH);
    d1.update(0.02, resident);
    const a = d1.visibleCritters(resident);
    const d2 = createDecor(chunkW, chunkH);
    d2.update(0.02, resident);
    const b = d2.visibleCritters(resident);
    let identical = a.length === b.length;
    if (identical) {
      for (let i = 0; i < a.length; i++) {
        if (a[i].kind !== b[i].kind || a[i].x !== b[i].x || a[i].y !== b[i].y) { identical = false; break; }
      }
    }
    assert('decor: same chunk data produces an identical critter list', identical);
  }

  // --- Non-hostile: critter entries carry no collision/damage fields, so
  // they can never block the generator's guaranteed path or hurt the
  // octopus the way an enemy-slot spawn can. ---
  {
    const chunk = generateChunk(7, 0, 16);
    const resident = [{ index: 0, yOffset: 0, chunk }];
    const decor = createDecor(chunkW, chunkH);
    decor.update(0.02, resident);
    const critters = decor.visibleCritters(resident);
    const clean = critters.every((c) => c.radius === undefined && c.contactDamage === undefined);
    assert(`decor: wall critters (${critters.length} checked) carry no collision/damage fields`, clean);
  }

  // --- Critters despawn with their chunk, same as bubbles/enemies. ---
  {
    const chunk = generateChunk(3, 0, 16);
    const decor = createDecor(chunkW, chunkH);
    decor.update(0.02, [{ index: 0, yOffset: 0, chunk }]);
    assert('decor: critters present while the chunk is resident', decor.visibleCritters([{ index: 0, yOffset: 0, chunk }]).length > 0);
    decor.update(0.02, []); // chunk no longer resident
    assert('decor: critters gone once the chunk is evicted', decor.visibleCritters([]).length === 0);
  }
}
