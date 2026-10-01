// Pooled particle system + screen shake for enemy/bomb feedback, plus the
// M7-1 juice effects (dash ink, pickup sparkle, speed-scaled bubble trail):
// OVERNIGHT.md §4 M3-3: "particles pooled, 0 allocations per frame". A fixed
// array is pre-allocated once; `spawn()` reuses a dead slot instead of
// pushing, and `update()` mutates in place.

import { prefersReducedMotion, shakeEnabled, SHAKE_MAX_PX, SHAKE_DURATION } from './config.js';

const POOL_SIZE = 256;

export function createParticles() {
  const pool = new Array(POOL_SIZE);
  for (let i = 0; i < POOL_SIZE; i++) {
    pool[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0.1, color: '#fff' };
  }
  let cursor = 0;
  let shake = 0; // current screen-shake magnitude, world units (endless)
  let fxAmp = 0, fxT = 0, fxDur = SHAKE_DURATION; // v2 feel shake: peak amplitude (px), time left (s) and the duration it was started with

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
    /** A bomb going off: rock chips plus bright sparks, and a shake that grows as the blast gets near the octopus. */
    blastBurst(x, y, fromOcto = 0) {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.4 + Math.random() * 0.3, 0.05, '#8a7a6a');
      }
      // a few bright sparks with the chips (the blast itself is drawn by enemy-draw.js drawBlast)
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 4;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.25 + Math.random() * 0.2, 0.07, i % 2 ? '#ffe46a' : '#fff6c0');
      }
      shakeScreen(0.1 + 0.3 * Math.max(0, 1 - fromOcto / 14)); // a bigger shake the nearer the blast is to the octopus
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
    /** v2 (game feel): a big explosion's debris and bubbles, and a pixel shake scaled by how far the blast is from the octopus (max SHAKE_MAX_PX). */
    blastFeel(x, y, fromOcto = 0) {
      for (let i = 0; i < 14; i++) { // heavier rock chips, thrown wider and slower to settle
        const a = Math.random() * Math.PI * 2, speed = 1.5 + Math.random() * 3.5;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed - 0.8, 0.5 + Math.random() * 0.4, 0.07 + Math.random() * 0.04, i % 3 ? '#8a7a6a' : '#5f5348');
      }
      if (!prefersReducedMotion()) {
        for (let i = 0; i < 16; i++) { // bubbles boiling up from the blast
          const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
          spawnOne(x + Math.cos(a) * r, y + Math.sin(a) * r, (Math.random() - 0.5) * 1.2, -0.8 - Math.random() * 1.4, 0.7 + Math.random() * 0.7, 0.04 + Math.random() * 0.05, 'rgba(215,240,255,0.6)');
        }
      }
      this.shakeFx(blastShakePx(fromOcto), SHAKE_DURATION);
    },
    /** v2: a puff where a dash hit a wall, thrown out along the wall normal: 13 bright dust puffs plus 3 rock chips. */
    bouncePuff(x, y, nx, ny) {
      if (prefersReducedMotion()) return;
      const base = Math.atan2(ny, nx);
      for (let i = 0; i < 13; i++) {
        const a = base + (Math.random() - 0.5) * 2.0, speed = 0.9 + Math.random() * 1.9;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.38 + Math.random() * 0.3, 0.09 + Math.random() * 0.06, i % 2 ? 'rgba(232,220,196,0.92)' : 'rgba(245,250,255,0.9)');
      }
      for (let i = 0; i < 3; i++) { // rock chips knocked off the wall
        const a = base + (Math.random() - 0.5) * 1.5, speed = 2 + Math.random() * 2;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed - 0.5, 0.35 + Math.random() * 0.2, 0.05, i % 2 ? '#8a7a6a' : '#5f5348');
      }
    },
    /** v2: shake the screen by up to `px` pixels for `dur` s (fades out linearly over `dur`). Ignored under reduced motion or with shake off. */
    shakeFx(px, dur = SHAKE_DURATION) {
      if (prefersReducedMotion() || !shakeEnabled() || px <= 0) return;
      const cur = fxT > 0 ? fxAmp * (fxT / fxDur) : 0;
      if (px >= cur) { fxAmp = Math.min(px, SHAKE_MAX_PX); fxT = dur; fxDur = dur; }
    },
    /** v2: the current shake offset in screen pixels (|x|, |y| <= SHAKE_MAX_PX). */
    shakePx() {
      if (fxT <= 0) return { x: 0, y: 0 };
      const k = fxAmp * (fxT / fxDur), t = performance.now() * 0.06;
      return { x: Math.sin(t) * k, y: Math.cos(t * 1.37) * k };
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
      if (fxT > 0) fxT = Math.max(0, fxT - dt);
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
    if (!prefersReducedMotion() && shakeEnabled()) shake = Math.max(shake, mag);
  }
}

/** Explosion shake in px for a blast `dist` tiles from the octopus: 6 px point blank, fading to 1 px at 14 tiles. */
export function blastShakePx(dist) {
  return SHAKE_MAX_PX * Math.max(1 / SHAKE_MAX_PX, 1 - Math.max(0, dist) / 14);
}
