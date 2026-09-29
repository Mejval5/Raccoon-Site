// Pooled particle system + screen shake for enemy/bomb feedback.
// OVERNIGHT.md §4 M3-3: "particles pooled, 0 allocations per frame". A fixed
// array is pre-allocated once; `spawn()` reuses a dead slot instead of
// pushing, and `update()` mutates in place.

const POOL_SIZE = 256;

export function createParticles() {
  const pool = new Array(POOL_SIZE);
  for (let i = 0; i < POOL_SIZE; i++) {
    pool[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0.1, color: '#fff' };
  }
  let cursor = 0;
  let shake = 0; // current screen-shake magnitude, world units

  function spawnOne(x, y, vx, vy, life, size, color) {
    const p = pool[cursor];
    cursor = (cursor + 1) % POOL_SIZE; // ring buffer: oldest slot is reused first
    p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life; p.size = size; p.color = color;
  }

  return {
    /** Small poof on an enemy death: a burst of short-lived dots. */
    deathPoof(x, y, color = '#cfe8ff') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 1.5 + Math.random() * 1.5;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.35 + Math.random() * 0.15, 0.06, color);
      }
    },
    /** Bomb: an expanding ring look (drawn separately in enemy-draw.js from
     * the bomb list itself) plus rock debris chips. */
    bombDebris(x, y) {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.4 + Math.random() * 0.3, 0.05, '#8a7a6a');
      }
      shakeScreen(0.35);
    },
    /** 0.2s screen shake, skipped entirely under reduced motion (M7 also
     * reads this; wired here since M3 is the first thing that shakes). */
    shakeOffset() {
      if (shake <= 0) return { x: 0, y: 0 };
      const t = performance.now() * 0.05;
      return { x: Math.sin(t) * shake, y: Math.cos(t * 1.3) * shake };
    },
    update(dt) {
      if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
      for (let i = 0; i < POOL_SIZE; i++) {
        const p = pool[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
      }
    },
    pool,
  };

  function shakeScreen(mag) {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) shake = Math.max(shake, mag);
  }
}
