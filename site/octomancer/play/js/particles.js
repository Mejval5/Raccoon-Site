// Pooled particle system + screen shake for enemy/bomb feedback, plus the
// M7-1 juice effects (dash ink, pickup sparkle, speed-scaled bubble trail):
// OVERNIGHT.md §4 M3-3: "particles pooled, 0 allocations per frame". A fixed
// array is pre-allocated once; `spawn()` reuses a dead slot instead of
// pushing, and `update()` mutates in place.

import { prefersReducedMotion } from './config.js';

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
    /** M7-1: a small ink puff kicked out behind the octopus on dash, in the
     * direction it dashed from (opposite `angle`). Skipped under reduced
     * motion like the rest of the pool's decorative bursts. */
    dashInk(x, y, angleRad) {
      if (prefersReducedMotion()) return;
      const back = angleRad + Math.PI;
      for (let i = 0; i < 6; i++) {
        const a = back + (Math.random() - 0.5) * 1.1;
        const speed = 0.6 + Math.random() * 1.2;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.3 + Math.random() * 0.25, 0.09, 'rgba(20,15,30,0.75)');
      }
    },
    /** M7-1: a bright sparkle on any pickup (plankton/shell), colour
     * matching what was collected. */
    pickupSparkle(x, y, color = '#dff3ff') {
      if (prefersReducedMotion()) return;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.4;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.2 + Math.random() * 0.15, 0.045, color);
      }
    },
    /** M7-1: bubble trail scaled by speed - one small rising mote behind the
     * octopus, called at a rate `main.js` scales with how fast it's moving
     * (`TRAIL_BUBBLE_PERIOD_*` in config.js), so a fast dive leaves a denser
     * trail than a gentle drift. */
    trailBubble(x, y) {
      if (prefersReducedMotion()) return;
      spawnOne(x, y, (Math.random() - 0.5) * 0.2, -0.4 - Math.random() * 0.3, 0.5 + Math.random() * 0.3, 0.035, 'rgba(210,240,255,0.55)');
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
    if (!prefersReducedMotion()) shake = Math.max(shake, mag);
  }
}
