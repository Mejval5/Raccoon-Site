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
import { hurtOctopus, tryUseBomb } from './octopus.js';
import { PK_BOMB, PK_RUBBLE, PROP_RADIUS, THROW_SPEED } from './props.js';

export const BOMB_FUSE_V2 = 2.5;
export const BLAST_REACH = 2;          // knockback reaches this many blast radii
export const OCTO_BLAST_IMPULSE = 7;   // u/s at the centre of the blast, falling off linearly
export const ENEMY_BLAST_IMPULSE = 12;
export const ENEMY_STUN = 0.9;         // s
export const RUBBLE_MIN = 4, RUBBLE_MAX = 8;
const SOFT_TOSS = 0.35;                // fraction of the throw when there is no aim direction

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/** Rubble from the rock tiles a blast removed: 4-8 chips that fly out from the blast, sink, settle and fade. */
export function spawnRubble(props, tiles, nTiles, bx, by, rand = Math.random) {
  if (!props || nTiles <= 0) return 0;
  const n = Math.min(RUBBLE_MAX, Math.max(RUBBLE_MIN, nTiles));
  let made = 0;
  for (let k = 0; k < n; k++) {
    const t = Math.floor((k + rand() * 0.999) * nTiles / n) % nTiles;
    const x = tiles[t * 2] + 0.5, y = tiles[t * 2 + 1] + 0.5;
    let dx = x - bx, dy = y - by;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const sp = 2 + rand() * 3;
    const r = 0.1 + rand() * 0.08;
    if (props.add(PK_RUBBLE, x, y, dx * sp, dy * sp - 1, { radius: r }) >= 0) made++;
  }
  return made;
}

export function createBombs(props = null) {
  /** @type {{x:number,y:number,fuse:number,exploded:boolean,age:number,pid:number}[]} */
  let bombs = [];
  const events = []; // {type:'exploded', x, y}
  const broken = []; // scratch: x,y of each tile a blast removed
  const fuse0 = props ? BOMB_FUSE_V2 : BOMB_FUSE;

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
    enemies.killInRadius(b.x, b.y, r);
    if (props && enemies.knockInRadius) enemies.knockInRadius(b.x, b.y, r * BLAST_REACH, ENEMY_BLAST_IMPULSE, ENEMY_STUN);
    if (!octo.dead && dist(octo.x, octo.y, b.x, b.y) <= r) hurtOctopus(octo, b.x, b.y, 'bomb');
    if (props && !octo.dead) {
      const d = dist(octo.x, octo.y, b.x, b.y), reach = r * BLAST_REACH;
      if (d < reach) {
        const f = (1 - d / reach) * OCTO_BLAST_IMPULSE;
        const nx = d > 1e-4 ? (octo.x - b.x) / d : 0, ny = d > 1e-4 ? (octo.y - b.y) / d : -1;
        octo.vx += nx * f; octo.vy += ny * f;
      }
    }
    if (props) {
      props.blast(b.x, b.y, r);
      spawnRubble(props, broken, nb, b.x, b.y);
    }
    events.push({ type: 'exploded', x: b.x, y: b.y, tiles: nb });
  }

  return {
    events,
    props,
    list() { return bombs; },

    /**
     * Place a bomb if the octopus has one in stock. v2: it starts at (x, y) with the octopus's velocity plus
     * THROW_SPEED along `aim` ({x, y}, unit length; a short vector throws proportionally less), or a soft toss
     * along the octopus's facing when `aim` is null. `opts.pinned` keeps a bomb in place (tests).
     */
    place(octo, x, y, aim = null, opts = null) {
      if (!tryUseBomb(octo)) return false;
      const b = { x, y, fuse: fuse0, fuse0, exploded: false, age: 0, pid: -1, rot: 0 };
      if (props) {
        let ax = 0, ay = 0, power = 1;
        if (aim && (aim.x || aim.y)) { ax = aim.x; ay = aim.y; const l = Math.hypot(ax, ay); if (l > 1) { ax /= l; ay /= l; } power = 1; }
        else if (octo.angle !== undefined) {
          const a = octo.angle * Math.PI / 180;
          ax = Math.sin(a); ay = -Math.cos(a); power = SOFT_TOSS;
        }
        const ovx = octo.vx || 0, ovy = octo.vy || 0;
        b.pid = props.add(PK_BOMB, x, y, ovx + ax * THROW_SPEED * power, ovy + ay * THROW_SPEED * power, { timer: fuse0, grace: 0.35 });
        if (b.pid < 0) { octo.bombs++; return false; }
        if (opts && opts.pinned) props.hold(b.pid, -1, -1);
      }
      bombs.push(b);
      return true;
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
}
