// Seeded PRNG, OVERNIGHT.md §2 "World": "Seeded (mulberry32, ?seed=N), pure
// generator, chunk ring buffer. Deterministic: same seed, same cave."
// mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312e
// (public-domain algorithm, re-implemented here, not copied from a library).

/** Returns a function that yields floats in [0,1), deterministic per seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit mix of a base seed and a chunk index, so any chunk's
 * own noise stream can be derived without replaying earlier chunks. */
export function hashSeed(seed, salt) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (salt >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function mix32(h) {
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * v2 seed derivation (round 36). hashSeed above XORs seed and salt before mixing, so any two pairs with the same
 * seed ^ salt give the identical stream (seed 1 level 3 == seed 3 level 1). Here seed and salt are each mixed
 * first and only then combined, so XOR-equal pairs no longer collide. Endless (gen.js) keeps hashSeed unchanged.
 */
export function hashSeed2(seed, salt) {
  const a = mix32((seed + 0x9e3779b9) | 0);
  const b = mix32((salt + 0x632be5ab) | 0);
  return mix32((a ^ Math.imul(b, 0x85ebca6b)) | 0) >>> 0;
}
