// Pooled particle system + screen shake for enemy/bomb feedback, plus the
// M7-1 juice effects (dash ink, pickup sparkle, speed-scaled bubble trail):
// OVERNIGHT.md §4 M3-3: "particles pooled, 0 allocations per frame". A fixed
// array is pre-allocated once; `spawn()` reuses a dead slot instead of
// pushing, and `update()` mutates in place.

import { prefersReducedMotion, shakeEnabled, SHAKE_MAX_PX, SHAKE_DURATION } from './config.js';
import { offScreenFar } from './cull.js';

const POOL_SIZE = 256;
const INK_COLOR = '#150d1c';
const GOO_COLORS = ['#c0485e', '#e0607a'];

export function createParticles() {
  const pool = new Array(POOL_SIZE);
  for (let i = 0; i < POOL_SIZE; i++) {
    pool[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0.1, color: '#fff', cv: 1, sticky: false, stuck: false };
  }
  let cursor = 0;
  let shake = 0; // current screen-shake magnitude, world units (endless)
  let fxAmp = 0, fxT = 0, fxDur = SHAKE_DURATION; // v2 feel shake: peak amplitude (px), time left (s) and the duration it was started with

  function spawnOne(x, y, vx, vy, life, size, color) {
    if (offScreenFar(x, y, 2)) return null; // r43: nothing is spawned far off screen (AnimationLOD: the particles are switched off with the renderer)
    const p = pool[cursor];
    cursor = (cursor + 1) % POOL_SIZE; // ring buffer: oldest slot is reused first
    p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life; p.size = size; p.color = color; p.sticky = false; p.stuck = false;
    return p;
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
    /** Section 14: an ink jet blob bursting on rock or a creature: a few dark droplets. */
    inkSplat(x, y) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, speed = 0.6 + Math.random() * 1.3;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.25 + Math.random() * 0.15, 0.05 + Math.random() * 0.03, i & 1 ? 'rgba(26,16,48,0.85)' : 'rgba(58,42,92,0.8)');
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
    /** v2: shake the screen by up to `px` pixels for `dur` s (fades out linearly over `dur`). Ignored under reduced motion or with shake off.
     * `max` caps the peak (SHAKE_MAX_PX by default; a splat passes its own bigger one). */
    shakeFx(px, dur = SHAKE_DURATION, max = SHAKE_MAX_PX) {
      if (prefersReducedMotion() || !shakeEnabled() || px <= 0) return;
      const cur = fxT > 0 ? fxAmp * (fxT / fxDur) : 0;
      if (px >= cur) { fxAmp = Math.min(px, max); fxT = dur; fxDur = dur; }
    },
    /**
     * V2-PLAN 16: a body flattened by a boulder at (x, y): a burst of dark ink and pink-red goo, and `chunks` bits of octopus that
     * fly out and STICK where they hit rock (update(dt, isSolid) stops a sticky chunk in the first solid tile and keeps it
     * a few seconds). Under reduced motion the chunks are simply left lying around the spot, nothing flies.
     */
    splatBurst(x, y, chunks = 8) {
      const calm = prefersReducedMotion();
      if (!calm) {
        for (let i = 0; i < 40; i++) { // ink and goo, thrown mostly sideways along the floor and up
          const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7, speed = 1.5 + Math.random() * 5;
          spawnOne(x + (Math.random() - 0.5) * 0.5, y, Math.cos(a) * speed, Math.sin(a) * speed * 0.8, 0.45 + Math.random() * 0.5, 0.035 + Math.random() * 0.05, i % 3 ? INK_COLOR : GOO_COLORS[i % 2]);
        }
      }
      const n = Math.max(6, Math.min(10, chunks));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.9, speed = 3 + Math.random() * 5;
        const p = spawnOne(x + (calm ? (i - n / 2) * 0.15 : 0), y, calm ? 0 : Math.cos(a) * speed, calm ? 0 : Math.sin(a) * speed, 4 + Math.random() * 1.5, 0.055 + Math.random() * 0.045, i % 2 ? '#c05060' : '#904050');
        if (p) { p.sticky = true; p.stuck = calm; }
      }
    },
    /** V2-PLAN 16: a shock on the octopus: short yellow-white sparks flung out and a small twitch of the screen. */
    shockSparks(x, y) {
      if (prefersReducedMotion()) return;
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 4;
        spawnOne(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.18 + Math.random() * 0.22, 0.045 + Math.random() * 0.03, i % 3 ? '#fff58a' : '#ffffe6');
      }
      this.shakeFx(2.5, 0.18);
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
    /** @param {(tx:number,ty:number)=>boolean} [isSolid] tile test (world points): sticky chunks stop where they enter rock */
    update(dt, isSolid = null) {
      if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
      if (fxT > 0) fxT = Math.max(0, fxT - dt);
      for (let i = 0; i < POOL_SIZE; i++) {
        const p = pool[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        if (p.sticky) {
          if (p.stuck) continue;
          const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
          if (isSolid && isSolid(nx, ny)) { p.stuck = true; p.vx = p.vy = 0; p.life = Math.min(p.life, 3 + (i % 5) * 0.2); continue; } // stays where it hit, a few seconds
          p.x = nx; p.y = ny;
          p.vx *= 0.97; p.vy = p.vy * 0.97 + 15 * dt; // a heavy chunk: it arcs down fast (no floaty bits hanging in the water)
          continue;
        }
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
