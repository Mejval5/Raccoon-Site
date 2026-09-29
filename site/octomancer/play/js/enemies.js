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
//
// M6 (2021 creatures, `OldAssets/.../NPC.old/`): spiked mine (`NPC8`), crabs
// (`CrabFlatten`/`CrabFlatten2`), spike horns (`NPC6`), manta (`NPC10` +
// `NPC10Ball`). OVERNIGHT.md §4 M6.

import {
  URCHIN_RADIUS, PIRANHA_RADIUS, PIRANHA_PATROL_SPEED, PIRANHA_CHASE_SPEED,
  PIRANHA_CHASE_RANGE, CANNON_RADIUS, CANNON_RANGE, CANNON_FIRE_PERIOD,
  CANNON_SHOT_SPEED, CANNON_SHOT_RADIUS, BEHOLDER_SPAWN_TIME,
  BEHOLDER_SPAWN_HEIGHT, BEHOLDER_RADIUS, BEHOLDER_SPEED, BEHOLDER_SPEED_RAMP,
  DASH_KILL_SPEED, ENEMY_MIN_DEPTH,
  MINE_RADIUS, MINE_BLAST_RADIUS, MINE_ARM_TIME, MINE_BOB_AMPLITUDE, MINE_BOB_SPEED,
  CRAB_RADIUS, CRAB_SPEED_SLOW, CRAB_SPEED_FAST,
  HORNS_RADIUS,
  MANTA_RADIUS, MANTA_SPEED, MANTA_PATROL_RANGE, MANTA_SINE_AMPLITUDE, MANTA_SINE_FREQ,
  MANTA_DROP_PERIOD, MANTA_RANGE, MANTA_BALL_SPEED, MANTA_BALL_RADIUS,
} from './config.js';
import { hurtOctopus, killOctopus } from './octopus.js';
import { resolveCircleVsGrid } from './physics.js';
import { hasLineOfSight, findSmoothPath, resetPathBudget } from './pathfind.js';

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Round-6 task 5 (NIGHT-LOG.md): "give moving enemies (piranha, crab, manta,
// Beholder) the same wall collision as the octopus so they never overlap
// rock". `resolveCircleVsGrid` (physics.js) is exactly the octopus's own
// per-substep collision resolver; enemies move at low enough speed (no dash)
// that a single resolve per fixed step (no sub-stepping) is enough to keep
// them out of rock without tunnelling.
function collideWithWalls(e, world) {
  resolveCircleVsGrid(e, { isSolid: (tx, ty) => world.isSolid(tx, ty) });
}

// Round-7 fix (Daniel's screenshot review round 6, item 3: "piranhas stack
// into a double-decker"). The old flat 0.55-tile minimum was tuned to the
// enemies' small physics collision radii (PIRANHA_RADIUS=0.4 etc, used for
// octopus-contact damage only), not their much bigger drawn sprites -- a
// piranha's art reads about 1.8 tiles long (enemy-draw.js's own round-2 note
// on the Unity collider it was matched to), so two chasing piranhas could sit
// well inside 0.55 tiles of each other and overlap by more than half their
// length. Each kind now carries its own approximate visual half-extent
// (`ENEMY_SEP_HALF_EXTENT`, tiles) and a pair's minimum separation is the SUM
// of the two half-extents -- close to the sprite's own footprint -- instead
// of one fixed constant for every kind. Kinds not listed keep the old
// half-extent (0.275, i.e. the previous 0.55 split evenly).
const ENEMY_MIN_SEP_DEFAULT_HALF = 0.275;
const ENEMY_SEP_HALF_EXTENT = {
  piranha: 0.68, // two piranhas -> 1.36 tiles apart, inside the review's suggested 1.2-1.5 range
  crab: 0.45,
  manta: 0.55,
};
function sepHalfExtent(kind) { return ENEMY_SEP_HALF_EXTENT[kind] ?? ENEMY_MIN_SEP_DEFAULT_HALF; }

/** Cheap O(n^2) pairwise separation pass (enemy counts per chunk are small,
 * single digits) -- pushes any two moving enemies that drifted closer than
 * the sum of their visual half-extents back out along the line between them,
 * split evenly. */
function separateEnemies(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead || !a.moving) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead || !b.moving) continue;
      const minSep = sepHalfExtent(a.kind) + sepHalfExtent(b.kind);
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= minSep || d < 1e-6) continue;
      const push = (minSep - d) / 2;
      const nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
    }
  }
}

/** A* chase step shared by the Beholder and a spotted piranha (round-6 task
 * 5): recomputes a smoothed path a few times a second (`REPATH_INTERVAL`,
 * staggered per-enemy by its own id so many chasers don't all recompute on
 * the same step), steers toward the next waypoint, and falls back to a
 * direct line whenever that line already has clear line-of-sight (cheaper
 * than a search, and reads identically). Keeps the original's
 * always-closing-distance feel: `speed` is whatever the caller already
 * computed (ramped for the Beholder, constant for a piranha), this only
 * changes the STEERING direction, never whether the chaser is closing in.
 */
const REPATH_INTERVAL = 0.25; // seconds
function chaseWithPath(e, world, targetX, targetY, speed, dt) {
  if (e.pathTimer === undefined) { e.pathTimer = (e.id % 7) * 0.03; e.path = null; e.pathIndex = 0; }
  const isSolid = (tx, ty) => world.isSolid(tx, ty);
  e.pathTimer -= dt;
  const directClear = hasLineOfSight(isSolid, e.x, e.y, targetX, targetY);
  if (directClear) {
    e.path = null;
  } else if (e.pathTimer <= 0 || !e.path || e.pathIndex >= e.path.length) {
    e.pathTimer = REPATH_INTERVAL;
    const p = findSmoothPath(isSolid, e.x, e.y, targetX, targetY);
    if (p && p.length) { e.path = p; e.pathIndex = 0; }
  }
  let aimX = targetX, aimY = targetY;
  if (!directClear && e.path && e.path.length) {
    // Advance past any waypoint already reached (or already behind us, if
    // the chaser overshot it a little).
    while (e.pathIndex < e.path.length - 1 && dist(e.x, e.y, e.path[e.pathIndex].x, e.path[e.pathIndex].y) < 0.35) {
      e.pathIndex++;
    }
    const wp = e.path[Math.min(e.pathIndex, e.path.length - 1)];
    aimX = wp.x; aimY = wp.y;
  }
  const dx = aimX - e.x, dy = aimY - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * speed;
  e.vy = (dy / d) * speed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

/** Deterministic per-chunk RNG (same tiny LCG pattern as pickups.js), used
 * only to pick which enemy kind fills each generator-tagged slot so the same
 * seed always spawns the same enemies. */
function makeRng(seedSalt) {
  let m = seedSalt >>> 0 || 1;
  return () => { m = (m * 1664525 + 1013904223) >>> 0; return m / 4294967296; };
}

// Round-4 fix (Daniel's screenshot review round 3: "ceiling crabs render
// upside down and float -- the original never had ceiling crabs"). Crabs are
// floor-only now, matching the Unity original (`CrabFlatten`/`CrabFlatten2`
// walk the floor, never the ceiling); `horns` stays available on both floor
// and ceiling, but only on a "flat run" anchor (gen.js's `flatRun`, set
// false at convex ceiling/floor corners) -- Daniel's review: "horns at
// convex ceiling corners hang in open water below the rim".
function pickKind(placement, depth, rng, flatRun) {
  const candidates = [];
  if (placement === 'open') {
    candidates.push('piranha');
    if (depth > 60) candidates.push('mine');
    if (depth > 100) candidates.push('manta');
  } else {
    candidates.push('urchin');
    // Round-6 fix (reviewer leftover, NIGHT-LOG.md task 6: "floor
    // enemies/decor must not hang past convex corners -- need full flat
    // support under the sprite"). `crab` is ~0.7 world units (over half a
    // tile) wide and walks -- unlike `horns`, which was already flatRun-only
    // since round-4, a crab anchored right at a convex floor corner used to
    // spawn with its far side hanging past the rim into open water before
    // its very first patrol step ever turned it around.
    if (placement === 'floor' && flatRun) candidates.push('crab');
    if ((placement === 'floor' || placement === 'ceiling') && flatRun) candidates.push('horns');
  }
  if (depth > 80 && (placement === 'floor' || placement === 'wall')) candidates.push('cannon');
  if (candidates.length > 1) return candidates[Math.floor(rng() * candidates.length)];
  return candidates[0];
}

let nextId = 1;

function makeEnemy(kind, x, y, chunkIndex, placement, wallDir = 0) {
  // `moving`: round-6 task 5 -- which kinds get grid collision + the
  // minimum-separation pass (`collideWithWalls`/`separateEnemies` below).
  // Static emplacements (urchin/cannon/horns/mine) stay exactly as they
  // were: anchored by decor.js/gen.js's own surface placement, no physics.
  const base = {
    id: nextId++, kind, x, y, prevX: x, prevY: y, vx: 0, vy: 0, dead: false,
    chunkIndex, placement, wallDir, hitFlash: 0, moving: false,
  };
  if (kind === 'urchin') {
    return { ...base, radius: URCHIN_RADIUS, contactDamage: true, dashKillable: false };
  }
  if (kind === 'piranha') {
    return {
      ...base, radius: PIRANHA_RADIUS, contactDamage: true, dashKillable: true, moving: true,
      dir: Math.random() < 0.5 ? -1 : 1, chasing: false,
    };
  }
  if (kind === 'cannon') {
    return { ...base, radius: CANNON_RADIUS, contactDamage: false, dashKillable: false, cooldown: CANNON_FIRE_PERIOD * Math.random() };
  }
  if (kind === 'mine') {
    return {
      ...base, radius: MINE_RADIUS, contactDamage: false, dashKillable: false,
      state: 'idle', armTimer: 0, baseY: y, spawnTime: null,
    };
  }
  if (kind === 'crab') {
    const fast = Math.random() < 0.4;
    return {
      ...base, radius: CRAB_RADIUS, contactDamage: true, dashKillable: true, moving: true,
      dir: Math.random() < 0.5 ? -1 : 1, speed: fast ? CRAB_SPEED_FAST : CRAB_SPEED_SLOW,
      variant: fast ? 'fast' : 'slow',
    };
  }
  if (kind === 'horns') {
    return { ...base, radius: HORNS_RADIUS, contactDamage: true, dashKillable: false, immune: true };
  }
  if (kind === 'manta') {
    return {
      ...base, radius: MANTA_RADIUS, contactDamage: true, dashKillable: true, moving: true,
      dir: Math.random() < 0.5 ? -1 : 1, baseX: x, baseY: y, spawnTime: null,
      dropCooldown: MANTA_DROP_PERIOD,
    };
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
      const kind = pickKind(s.placement, wy, rng, s.flatRun !== false);
      list.push(makeEnemy(kind, s.x, wy, index, s.placement, s.wallDir || 0));
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
      // Round-6 task 5: "once they spot the player", chase with A* instead
      // of a straight line, same as the Beholder -- keeps the original's
      // always-closing chase speed, just routed around rock.
      chaseWithPath(e, world, octo.x, octo.y, PIRANHA_CHASE_SPEED, dt);
    } else {
      e.path = null; // drop any stale chase path once it stops chasing
      e.vx = e.dir * PIRANHA_PATROL_SPEED;
      e.vy = 0;
      // Turn around at a wall or the edge of open water ahead.
      const aheadX = e.x + e.dir * (e.radius + 0.15);
      if (world.isSolid(aheadX, e.y)) e.dir *= -1;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    collideWithWalls(e, world);
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

  function updateCrab(e, dt, world) {
    const groundDy = e.placement === 'ceiling' ? -1 : 1;
    const step = e.dir * e.speed * dt;
    e.x += step;
    const aheadX = e.x + e.dir * (e.radius + 0.15);
    if (world.isSolid(aheadX, e.y)) {
      // Wall ahead: undo the step and turn around.
      e.x -= step;
      e.dir *= -1;
    } else if (!world.isSolid(aheadX, e.y + groundDy)) {
      // No ledge/ceiling ahead: turn around before walking off it.
      e.dir *= -1;
    }
    e.vx = e.dir * e.speed;
    // Round-6 task 5: same grid collision as every other moving enemy --
    // mostly a no-op here (the ahead-checks above already keep a crab off
    // rock along its own walk direction) but also catches the perpendicular
    // axis (e.g. a bomb/mine reshaping the floor out from under it).
    collideWithWalls(e, world);
  }

  function updateManta(e, dt, time, octo, world) {
    if (e.spawnTime === null) e.spawnTime = time; // start the sine at 0 offset, not a random phase
    e.x += e.dir * MANTA_SPEED * dt;
    // Wide back-and-forth patrol around its spawn point (the "wide sine"
    // glide), so it stays somewhere a diving octopus will pass, rather than
    // drifting off in one direction forever.
    if (Math.abs(e.x - e.baseX) > MANTA_PATROL_RANGE) e.dir *= -1;
    e.y = e.baseY + Math.sin((time - e.spawnTime) * MANTA_SINE_FREQ) * MANTA_SINE_AMPLITUDE;
    e.vx = e.dir * MANTA_SPEED;
    // Round-6 task 5: the manta spawns in open water but its sine glide can
    // carry it into a wall it patrolled toward; bounce off rock the same way
    // the octopus does rather than overlapping it.
    collideWithWalls(e, world);
    if (world.isSolid(e.x + Math.sign(e.dir || 1) * (e.radius + 0.1), e.y)) e.dir *= -1;
    const d = dist(e.x, e.y, octo.x, octo.y);
    if (d < MANTA_RANGE) {
      e.dropCooldown -= dt;
      if (e.dropCooldown <= 0) {
        e.dropCooldown = MANTA_DROP_PERIOD;
        const dx = octo.x - e.x, dy = octo.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        shots.push({
          x: e.x, y: e.y, vx: (dx / len) * MANTA_BALL_SPEED, vy: (dy / len) * MANTA_BALL_SPEED,
          radius: MANTA_BALL_RADIUS, dead: false,
        });
        events.push({ type: 'shotFired', kind: 'manta' });
      }
    }
  }

  function armMine(e) {
    if (e.dead || e.state !== 'idle') return;
    e.state = 'armed';
    e.armTimer = MINE_ARM_TIME;
  }

  /** Mine explosion: same shape as a bomb (breaks soft rock in a radius,
   * hurts the octopus if still inside, kills non-immune enemies in range),
   * plus chaining: any other idle mine caught in the blast arms too, so two
   * mines next to each other both eventually go off. */
  function explodeMine(e, world, octo) {
    e.state = 'exploded';
    e.dead = true;
    events.push({ type: 'mineExploded', x: e.x, y: e.y });
    const minTx = Math.floor(e.x - MINE_BLAST_RADIUS), maxTx = Math.floor(e.x + MINE_BLAST_RADIUS);
    const minTy = Math.floor(e.y - MINE_BLAST_RADIUS), maxTy = Math.floor(e.y + MINE_BLAST_RADIUS);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (dist(tx + 0.5, ty + 0.5, e.x, e.y) <= MINE_BLAST_RADIUS) world.breakTile(tx, ty);
      }
    }
    if (!octo.dead && dist(octo.x, octo.y, e.x, e.y) <= MINE_BLAST_RADIUS + octo.radius) {
      hurtOctopus(octo, e.x, e.y);
    }
    for (const other of allEnemies()) {
      if (other.dead || other === e || other.immune) continue;
      if (dist(other.x, other.y, e.x, e.y) > MINE_BLAST_RADIUS) continue;
      if (other.kind === 'mine') armMine(other);
      else killEnemy(other, 'mine');
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

  function updateBeholder(dt, octo, time, hurtFn, world) {
    if (!beholder && time >= BEHOLDER_SPAWN_TIME) {
      beholder = {
        id: nextId++, kind: 'beholder', x: octo.x, y: octo.y - BEHOLDER_SPAWN_HEIGHT,
        prevX: octo.x, prevY: octo.y - BEHOLDER_SPAWN_HEIGHT,
        vx: 0, vy: 0, radius: BEHOLDER_RADIUS, dead: false, spawnedAt: time, moving: true,
      };
      events.push({ type: 'beholderSpawned', x: beholder.x, y: beholder.y });
    }
    if (!beholder) return;
    beholder.prevX = beholder.x; beholder.prevY = beholder.y;
    const aliveFor = time - beholder.spawnedAt;
    const speed = BEHOLDER_SPEED + BEHOLDER_SPEED_RAMP * (aliveFor / 10);
    // Round-6 task 5: the Beholder used to "ignore rock" entirely (a
    // straight-line homing chase, EyeChaser.cs). It now collides with the
    // grid like every other moving enemy, so a straight line alone would let
    // it get stuck on the far side of a wall from the octopus -- chase with
    // the same A*-on-the-grid path the piranha uses, keeping the same
    // always-closing speed ramp.
    chaseWithPath(beholder, world, octo.x, octo.y, speed, dt);
    collideWithWalls(beholder, world);
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

      // Round-6 task 3 (render interpolation) + task 5 (A* budget): snapshot
      // last step's position before anything moves, and give every chaser
      // this step's share of the shared pathfinding node budget.
      resetPathBudget();
      for (const e of allEnemies()) { e.prevX = e.x; e.prevY = e.y; }

      const octoSpeed = Math.hypot(octo.vx, octo.vy);
      for (const e of allEnemies()) {
        if (e.dead) continue;
        if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (e.kind === 'piranha') updatePiranha(e, dt, octo, world);
        else if (e.kind === 'cannon') updateCannon(e, dt, octo, world);
        else if (e.kind === 'crab') updateCrab(e, dt, world);
        else if (e.kind === 'manta') updateManta(e, dt, time, octo, world);

        if (e.kind === 'mine') {
          if (e.spawnTime === null) e.spawnTime = time; // start the bob at 0 offset
          e.y = e.baseY + Math.sin((time - e.spawnTime) * MINE_BOB_SPEED) * MINE_BOB_AMPLITUDE;
          const touching = !octo.dead && dist(e.x, e.y, octo.x, octo.y) < e.radius + octo.radius;
          if (touching && e.state === 'idle') armMine(e);
          if (e.state === 'armed') {
            e.armTimer -= dt;
            if (e.armTimer <= 0) explodeMine(e, world, octo);
          }
          continue;
        }

        if (!e.contactDamage) continue;
        if (!octo.dead && dist(e.x, e.y, octo.x, octo.y) < e.radius + octo.radius) {
          if (e.dashKillable && octoSpeed >= DASH_KILL_SPEED) {
            killEnemy(e, 'dash');
          } else {
            hurtOctopus(octo, e.x, e.y);
          }
        }
      }
      separateEnemies(allEnemies());
      // Prune dead enemies out of their chunk lists (dash/bomb kills).
      for (const [ci, list] of byChunk) {
        const filtered = list.filter((e) => !e.dead);
        if (filtered.length !== list.length) byChunk.set(ci, filtered);
      }

      updateShots(dt, octo, world, hurtOctopus);
      updateBeholder(dt, octo, time, hurtOctopus, world);
    },

    /** Kill every enemy (not the Beholder or an immune trap) within `radius`
     * of (x,y) - used by bomb.js. A mine in range arms instead of dying
     * outright, so its own blast (with chaining) fires a beat later.
     * Returns the count killed. */
    killInRadius(x, y, radius) {
      let n = 0;
      for (const e of allEnemies()) {
        if (e.dead) continue;
        if (dist(e.x, e.y, x, y) > radius) continue;
        if (e.kind === 'mine') { armMine(e); continue; }
        if (e.immune) continue;
        killEnemy(e, 'bomb'); n++;
      }
      for (const [ci, list] of byChunk) {
        const filtered = list.filter((e) => !e.dead);
        if (filtered.length !== list.length) byChunk.set(ci, filtered);
      }
      return n;
    },

    /** Test/debug hook (`__octo.spawn`): force-spawn one enemy at (x,y), not
     * tied to any chunk (never despawns from chunk eviction). */
    spawnAt(kind, x, y, placement) {
      if (kind === 'beholder') {
        beholder = {
          id: nextId++, kind: 'beholder', x, y, prevX: x, prevY: y, vx: 0, vy: 0,
          radius: BEHOLDER_RADIUS, dead: false, spawnedAt: 0, moving: true,
        };
        return beholder;
      }
      const e = makeEnemy(kind, x, y, -1, placement || 'open');
      const list = byChunk.get(-1) || [];
      list.push(e);
      byChunk.set(-1, list);
      return e;
    },

    count() { return allEnemies().length + shots.length + (beholder ? 1 : 0); },
  };
}
