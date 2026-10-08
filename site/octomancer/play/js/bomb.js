// Bombs: thrown or dropped by the octopus on the `bomb` action, fuse, then an explosion that breaks rock, kills
// enemies, and hurts the octopus too if it is still inside the blast. OVERNIGHT.md §4 M3-2.
//
// Two modes:
//   createBombs()        legacy / endless: a bomb stays where it was placed and goes off after BOMB_FUSE.
//   createBombs(props)   v2: every bomb is a rigid body in the props system (props.js). It is thrown with the
//                        octopus's velocity plus an impulse along `aim`, sinks, bounces, rolls (the octopus can push
//                        it) and goes off after BOMB_FUSE_V2. The explosion keeps the old damage and rock breaking,
//                        and adds a radial impulse on props, enemies (knockback + a brief stun) and the octopus,
//                        and 4-8 rubble props where rock was blown away.

import { BOMB_FUSE, BOMB_RADIUS } from './config.js';
import { tryUseBomb } from './octopus.js';
import { octoHit } from './damage.js';
import { PK_BOMB, PK_RUBBLE, PROP_RADIUS, THROW_SPEED } from './props.js';

export const BOMB_FUSE_V2 = 2.5;
export const BLAST_REACH = 2;          // knockback reaches this many blast radii
export const OCTO_BLAST_IMPULSE = 7;   // u/s at the centre of the blast, falling off linearly
export const ENEMY_BLAST_IMPULSE = 12;
export const ENEMY_STUN = 0.9;         // s
export const RUBBLE_MIN = 4, RUBBLE_MAX = 8;
// no aim direction (Space / X with no move key, the Bomb button with no stick): a short toss forward and a little
// down, along the last swim direction, never up onto the octopus's own head
export const IDLE_TOSS_X = 0.25, IDLE_TOSS_Y = 0.2;

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/** Rubble from the rock tiles a blast removed: 4-8 chips that fly out from the blast, sink, settle and fade. */
export function spawnRubble(props, tiles, nTiles, bx, by, rand = Math.random) {
  if (!props || nTiles <= 0) return 0;
  const n = Math.min(RUBBLE_MAX, Math.max(RUBBLE_MIN, nTiles));
  let made = 0;
  for (let k = 0; k < n; k++) {
    const t = Math.floor((k + rand() * 0.999) * nTiles / n) % nTiles;
    // each chip starts at its own spot inside the removed tile (+-0.35) and leaves at its own angle and speed
    const x = tiles[t * 2] + 0.5 + (rand() - 0.5) * 0.7, y = tiles[t * 2 + 1] + 0.5 + (rand() - 0.5) * 0.7;
    const a = Math.atan2(y - by, x - bx) + (rand() - 0.5) * 1.3;
    const sp = 1.5 + rand() * 4.5;
    const r = 0.1 + rand() * 0.08;
    if (props.add(PK_RUBBLE, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 1, { radius: r }) >= 0) made++;
  }
  return made;
}

export function createBombs(props = null) {
  /** @type {{x:number,y:number,fuse:number,exploded:boolean,age:number,pid:number}[]} */
  let bombs = [];
  const events = []; // {type:'exploded', x, y}
  const broken = []; // scratch: x,y of each tile a blast removed
  const fuse0 = props ? BOMB_FUSE_V2 : BOMB_FUSE;
  let nextId = 1; // chain reactions: a stable id per bomb (the list is filtered every step, so an index would move)

  function explode(b, world, octo, enemies) {
    b.exploded = true;
    b.age = 0;
    const r = BOMB_RADIUS;
    let nb = 0;
    // Break every non-border soft-rock tile in the blast circle.
    const minTx = Math.floor(b.x - r), maxTx = Math.floor(b.x + r);
    const minTy = Math.floor(b.y - r), maxTy = Math.floor(b.y + r);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (dist(tx + 0.5, ty + 0.5, b.x, b.y) > r) continue;
        const was = props && world.tileAt ? world.tileAt(tx, ty) : 0;
        world.breakTile(tx, ty);
        if (props && was !== 0 && world.tileAt(tx, ty) === 0) { broken[nb * 2] = tx; broken[nb * 2 + 1] = ty; nb++; }
      }
    }
    // 2026-10-08: main.js hands over the shared damage entry (damage.js: anything with blast(x, y, r, isSolid)), so every creature
    // body takes the bomb by the creature table; older callers (tests) pass an enemies-like {killInRadius, knockInRadius}
    if (enemies.blast) enemies.blast(b.x, b.y, r, world.isSolid ? (x, y) => world.isSolid(x, y) : null);
    else {
      enemies.killInRadius(b.x, b.y, r);
      if (props && enemies.knockInRadius) enemies.knockInRadius(b.x, b.y, r * BLAST_REACH, ENEMY_BLAST_IMPULSE, ENEMY_STUN);
    }
    if (dist(octo.x, octo.y, b.x, b.y) <= r) octoHit(octo, 'bomb', b.x, b.y, 'bomb'); // dead: a hit on the body (flash, knock)
    if (props) { // the live octopus and the dead body alike (props.blast skips PK_BODY)
      const d = dist(octo.x, octo.y, b.x, b.y), reach = r * BLAST_REACH;
      if (d < reach && !(octo.anchorT > 0)) { // Anchor (spells): a blast still hurts, but does not throw the octopus
        const f = (1 - d / reach) * OCTO_BLAST_IMPULSE;
        const nx = d > 1e-4 ? (octo.x - b.x) / d : 0, ny = d > 1e-4 ? (octo.y - b.y) / d : -1;
        octo.vx += nx * f; octo.vy += ny * f;
      }
    }
    if (props) {
      props.blast(b.x, b.y, r);
      spawnRubble(props, broken, nb, b.x, b.y);
    }
    events.push({ type: 'exploded', x: b.x, y: b.y, tiles: nb, id: b.id, chain: b.chain, depth: b.depth }); // chain.js: the blast joins the chain that set it off
  }

  const api = {
    events,
    props,
    list() { return bombs; },

    /**
     * Place a bomb if the octopus has one in stock. v2: it starts at (x, y) with the octopus's velocity plus
     * THROW_SPEED along `aim` ({x, y}, unit length; a short vector throws proportionally less), or a short toss
     * forward (octo.throwDir, the last swim direction) and a little down when `aim` is null. `opts.pinned` keeps a bomb in place (tests), `opts.fuse` sets its fuse, `opts.free` costs no bomb.
     */
    place(octo, x, y, aim = null, opts = null) {
      if (!(opts && opts.free) && !tryUseBomb(octo)) return false; // opts.free: a test / scripted bomb that costs nothing
      const f0 = opts && opts.fuse > 0 ? opts.fuse : fuse0;
      const b = { x, y, fuse: f0, fuse0: f0, exploded: false, age: 0, pid: -1, rot: 0, id: nextId++, chain: -1, depth: 0, lit: 0 };
      if (props) {
        let ax = 0, ay = 0;
        if (aim && (aim.x || aim.y)) { ax = aim.x; ay = aim.y; const l = Math.hypot(ax, ay); if (l > 1) { ax /= l; ay /= l; } } // a short vector throws proportionally less
        else {
          const f = octo.throwDir || 1;
          ax = f * IDLE_TOSS_X; ay = IDLE_TOSS_Y;
        }
        const ovx = octo.vx || 0, ovy = octo.vy || 0;
        b.pid = props.add(PK_BOMB, x, y, ovx + ax * THROW_SPEED, ovy + ay * THROW_SPEED, { timer: f0, grace: 0.35 });
        if (b.pid < 0) { if (!(opts && opts.free)) octo.bombs++; return false; }
        if (opts && opts.pinned) props.hold(b.pid, -1, -1);
      }
      bombs.push(b);
      return true;
    },

    /**
     * Chain reactions (chain.js): bomb `id` is set off by a link; its fuse is cut and it goes off on this step's update.
     * ctx {chain, depth} is carried to the 'exploded' event so the blast joins the same chain. False when it is gone.
     */
    trigger(id, ctx = null) {
      for (const b of bombs) {
        if (b.id !== id || b.exploded) continue;
        b.fuse = 0; b.lit = 1;
        if (props && b.pid >= 0) props.data.timer[b.pid] = 0;
        b.chain = ctx && ctx.chain >= 0 ? ctx.chain : -1; b.depth = ctx ? ctx.depth | 0 : 0;
        return true;
      }
      return false;
    },
    /** The chain.js target adapter of the live bombs ('bomb'). */
    chainTarget() {
      return {
        name: 'bomb',
        each(x, y, r, cb) { for (const b of bombs) if (!b.exploded && Math.hypot(b.x - x, b.y - y) <= r) cb(b.id, b.x, b.y); },
        fire: (id, ctx) => api.trigger(id, ctx),
      };
    },

    /** One fixed step: tick fuses, explode, break rock, hurt octo, kill enemies via `enemies.killInRadius`.
     * In v2 mode the props system itself is stepped by the caller (main.js) before this. */
    update(dt, world, octo, enemies) {
      events.length = 0;
      if (props) {
        const d = props.data;
        for (const b of bombs) {
          if (b.exploded || b.pid < 0) continue;
          b.x = d.x[b.pid]; b.y = d.y[b.pid]; b.rot = b.x / PROP_RADIUS[PK_BOMB]; // rolls
          d.timer[b.pid] -= dt;
          b.fuse = d.timer[b.pid];
        }
      }
      for (const b of bombs) {
        if (b.exploded) { b.age += dt; continue; }
        if (!props) { b.fuse -= dt; }
        if (b.fuse > 0) continue;
        if (props && b.pid >= 0) { b.x = props.data.x[b.pid]; b.y = props.data.y[b.pid]; props.remove(b.pid); b.pid = -1; }
        explode(b, world, octo, enemies);
      }
      // Bombs linger a moment after exploding (for the death-poof-style
      // particle burst in enemy-draw.js/particles.js), then get dropped.
      bombs = bombs.filter((b) => !(b.exploded && b.age > 0.4));
    },
  };
  return api;
}
