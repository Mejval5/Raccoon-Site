// Enemies: urchin, piranha, cannon + its shot, and the Beholder chaser.
// OVERNIGHT.md §4 M3-1: "one small behaviour object per kind so M6 only adds
// entries." Spawned from each chunk's `enemy-slot` spawns (gen.js, tagged by
// placement: floor/ceiling/wall/open) via a small depth table, pooled and
// despawned with the chunk that owns them. The Beholder is not chunk-owned:
// it is a single, always-resident chaser that appears once at
// BEHOLDER_SPAWN_TIME.
//
// Sources: `NPC25` (urchin), `NPC21`/`SidePiranha` (piranha),
// `NPC30`+`NPC32Ball` (cannon+shot), `Beholder_*` (46 frames) --
// octomancer-unity/Assets/Sprites/NPCs/**, `unity/Scripts/Player/EyeChaser.cs`
// for the Beholder's straight-line chase. DECISIONS-2026-09-29.md §2.

import {
  URCHIN_RADIUS, PIRANHA_RADIUS, PIRANHA_PATROL_SPEED, PIRANHA_CHASE_SPEED,
  PIRANHA_CHASE_RANGE, CANNON_RADIUS, CANNON_RANGE, CANNON_FIRE_PERIOD,
  CANNON_SHOT_SPEED, CANNON_SHOT_RADIUS, BEHOLDER_SPAWN_TIME,
  BEHOLDER_SPAWN_HEIGHT, BEHOLDER_RADIUS, BEHOLDER_SPEED, BEHOLDER_SPEED_RAMP,
  DASH_KILL_SPEED, ENEMY_MIN_DEPTH,
} from './config.js';
import { hurtOctopus, killOctopus } from './octopus.js';

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/** Deterministic per-chunk RNG (same tiny LCG pattern as pickups.js), used
 * only to pick which enemy kind fills each generator-tagged slot so the same
 * seed always spawns the same enemies. */
function makeRng(seedSalt) {
  let m = seedSalt >>> 0 || 1;
  return () => { m = (m * 1664525 + 1013904223) >>> 0; return m / 4294967296; };
}

function pickKind(placement, depth, rng) {
  const candidates = [];
  if (placement === 'open') candidates.push('piranha');
  else candidates.push('urchin');
  if (depth > 80 && (placement === 'floor' || placement === 'wall')) candidates.push('cannon');
  if (candidates.length > 1 && rng() < 0.35) return candidates[1];
  return candidates[0];
}

let nextId = 1;

function makeEnemy(kind, x, y, chunkIndex, placement) {
  const base = { id: nextId++, kind, x, y, vx: 0, vy: 0, dead: false, chunkIndex, placement, hitFlash: 0 };
  if (kind === 'urchin') {
    return { ...base, radius: URCHIN_RADIUS, contactDamage: true };
  }
  if (kind === 'piranha') {
    return { ...base, radius: PIRANHA_RADIUS, contactDamage: true, dir: Math.random() < 0.5 ? -1 : 1, chasing: false };
  }
  if (kind === 'cannon') {
    return { ...base, radius: CANNON_RADIUS, contactDamage: false, cooldown: CANNON_FIRE_PERIOD * Math.random() };
  }
  return base;
}

export function createEnemies() {
  /** @type {Map<number, any[]>} enemies grouped by owning chunk index */
  const byChunk = new Map();
  const spawnedChunks = new Set();
  /** @type {any[]} */
  let shots = [];
  let beholder = null;
  const events = []; // consumed by main.js each frame: {type:'enemyKilled'|'shotFired', ...}

  function spawnFromSlots(index, chunk, yOffset) {
    if (spawnedChunks.has(index)) return;
    spawnedChunks.add(index);
    const rng = makeRng(index * 104729 + 7);
    const list = [];
    for (const s of chunk.spawns) {
      if (s.type !== 'enemy-slot') continue;
      const wy = s.y + yOffset;
      if (wy < ENEMY_MIN_DEPTH) continue;
      const kind = pickKind(s.placement, wy, rng);
      list.push(makeEnemy(kind, s.x, wy, index, s.placement));
    }
    if (list.length) byChunk.set(index, list);
  }

  function allEnemies() {
    const out = [];
    for (const list of byChunk.values()) out.push(...list);
    return out;
  }

  function killEnemy(e, reason) {
    if (e.dead) return;
    e.dead = true;
    events.push({ type: 'enemyKilled', kind: e.kind, x: e.x, y: e.y, reason });
  }

  function updatePiranha(e, dt, octo, world) {
    const dToOcto = dist(e.x, e.y, octo.x, octo.y);
    e.chasing = dToOcto < PIRANHA_CHASE_RANGE;
    if (e.chasing) {
      const dx = octo.x - e.x, dy = octo.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (dx / d) * PIRANHA_CHASE_SPEED;
      e.vy = (dy / d) * PIRANHA_CHASE_SPEED;
    } else {
      e.vx = e.dir * PIRANHA_PATROL_SPEED;
      e.vy = 0;
      // Turn around at a wall or the edge of open water ahead.
      const aheadX = e.x + e.dir * (e.radius + 0.15);
      if (world.isSolid(aheadX, e.y)) e.dir *= -1;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  function updateCannon(e, dt, octo, world) {
    e.cooldown -= dt;
    const d = dist(e.x, e.y, octo.x, octo.y);
    if (e.cooldown <= 0 && d < CANNON_RANGE) {
      const dx = octo.x - e.x, dy = octo.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      shots.push({
        x: e.x, y: e.y, vx: (dx / len) * CANNON_SHOT_SPEED, vy: (dy / len) * CANNON_SHOT_SPEED,
        radius: CANNON_SHOT_RADIUS, dead: false,
      });
      e.cooldown = CANNON_FIRE_PERIOD;
    }
  }

  function updateShots(dt, octo, world, hurtFn) {
    for (const s of shots) {
      if (s.dead) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (world.isSolid(s.x, s.y)) { s.dead = true; continue; }
      if (dist(s.x, s.y, octo.x, octo.y) < s.radius + octo.radius) {
        hurtFn(octo, s.x, s.y);
        s.dead = true;
      }
    }
    shots = shots.filter((s) => !s.dead);
  }

  function updateBeholder(dt, octo, time, hurtFn) {
    if (!beholder && time >= BEHOLDER_SPAWN_TIME) {
      beholder = {
        id: nextId++, kind: 'beholder', x: octo.x, y: octo.y - BEHOLDER_SPAWN_HEIGHT,
        vx: 0, vy: 0, radius: BEHOLDER_RADIUS, dead: false, spawnedAt: time,
      };
      events.push({ type: 'beholderSpawned', x: beholder.x, y: beholder.y });
    }
    if (!beholder) return;
    const aliveFor = time - beholder.spawnedAt;
    const speed = BEHOLDER_SPEED + BEHOLDER_SPEED_RAMP * (aliveFor / 10);
    const dx = octo.x - beholder.x, dy = octo.y - beholder.y;
    const d = Math.hypot(dx, dy) || 1;
    beholder.vx = (dx / d) * speed;
    beholder.vy = (dy / d) * speed;
    beholder.x += beholder.vx * dt; // "ignores rock": no grid collision
    beholder.y += beholder.vy * dt;
    if (!octo.dead && dist(beholder.x, beholder.y, octo.x, octo.y) < beholder.radius + octo.radius) {
      killOctopus(octo);
    }
  }

  return {
    events,
    /** All resident enemies plus the Beholder (if spawned), for rendering. */
    all() { return beholder ? [...allEnemies(), beholder] : allEnemies(); },
    shots() { return shots; },
    beholder() { return beholder; },

    /** One fixed step. */
    update(dt, time, octo, world, resident) {
      events.length = 0;
      const liveChunks = new Set(resident.map((r) => r.index));
      for (const { index, yOffset, chunk } of resident) spawnFromSlots(index, chunk, yOffset);
      for (const ci of [...byChunk.keys()]) {
        // -1 holds test/debug spawns from __octo.spawn(), never chunk-owned.
        if (ci !== -1 && !liveChunks.has(ci)) byChunk.delete(ci); // despawn with the chunk
      }

      const octoSpeed = Math.hypot(octo.vx, octo.vy);
      for (const e of allEnemies()) {
        if (e.dead) continue;
        if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (e.kind === 'piranha') updatePiranha(e, dt, octo, world);
        else if (e.kind === 'cannon') updateCannon(e, dt, octo, world);

        if (!e.contactDamage) continue;
        if (!octo.dead && dist(e.x, e.y, octo.x, octo.y) < e.radius + octo.radius) {
          if (e.kind === 'piranha' && octoSpeed >= DASH_KILL_SPEED) {
            killEnemy(e, 'dash');
          } else {
            hurtOctopus(octo, e.x, e.y);
          }
        }
      }
      // Prune dead enemies out of their chunk lists (dash/bomb kills).
      for (const [ci, list] of byChunk) {
        const filtered = list.filter((e) => !e.dead);
        if (filtered.length !== list.length) byChunk.set(ci, filtered);
      }

      updateShots(dt, octo, world, hurtOctopus);
      updateBeholder(dt, octo, time, hurtOctopus);
    },

    /** Kill every enemy (not the Beholder, which is immune) within `radius`
     * of (x,y) - used by bomb.js. Returns the count killed. */
    killInRadius(x, y, radius) {
      let n = 0;
      for (const e of allEnemies()) {
        if (e.dead) continue;
        if (dist(e.x, e.y, x, y) <= radius) { killEnemy(e, 'bomb'); n++; }
      }
      for (const [ci, list] of byChunk) {
        const filtered = list.filter((e) => !e.dead);
        if (filtered.length !== list.length) byChunk.set(ci, filtered);
      }
      return n;
    },

    /** Test/debug hook (`__octo.spawn`): force-spawn one enemy at (x,y), not
     * tied to any chunk (never despawns from chunk eviction). */
    spawnAt(kind, x, y) {
      if (kind === 'beholder') {
        beholder = { id: nextId++, kind: 'beholder', x, y, vx: 0, vy: 0, radius: BEHOLDER_RADIUS, dead: false, spawnedAt: 0 };
        return beholder;
      }
      const e = makeEnemy(kind, x, y, -1, 'open');
      const list = byChunk.get(-1) || [];
      list.push(e);
      byChunk.set(-1, list);
      return e;
    },

    count() { return allEnemies().length + shots.length + (beholder ? 1 : 0); },
  };
}
