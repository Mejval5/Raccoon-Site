// Bombs: thrown or dropped by the octopus on the `bomb` action, fuse, then an explosion that breaks rock, kills
// enemies, and hurts the octopus too if it is still inside the blast. OVERNIGHT.md §4 M3-2.
//
// Two modes:
//   createBombs()        legacy / endless: a bomb stays where it was placed and goes off after BOMB_FUSE.
//   createBombs(props)   v2: every bomb is a rigid body in the props system (props.js). Controls 2026-10-08 (V2-PLAN 17,
//                        CONTROLS-IDEAS 3.1 + 3.2), one item with two behaviours by how it is used:
//                          - no aim (B / X, C or right click with the cursor on the octopus, the Use button with no
//                            stick): DROPPED, a heavy bomb straight down under the octopus that sinks like a rock, never
//                            bounces or rolls and sits where it lands; the fuse (BOMB_FUSE_V2) runs from the drop.
//                          - aimed (right / middle click at the cursor, the stick held, a bomb thrown from the hand):
//                            an URCHIN-MINE that flies on and clings to the first rock, push block or creature it meets;
//                            the fuse starts when it clings (or after STICKY_ARM_S of flight, whatever comes first).
//                        The explosion breaks rock (tile centres within BOMB_RADIUS, the radius that is drawn), kills
//                        enemies there, and adds a radial impulse on props, enemies (knockback + a brief stun) and the
//                        octopus, and 4-8 rubble props where rock was blown away.

import { BOMB_FUSE, BOMB_RADIUS } from './config.js';
import { hurtOctopus, tryUseBomb } from './octopus.js';
import { PK_BOMB, PK_RUBBLE, PROP_RADIUS, THROW_SPEED, BM_PLAIN, BM_HEAVY, BM_STICKY, PS_HELD, PS_CARRY } from './props.js';

export const BOMB_FUSE_V2 = 1.6;
export const STICKY_ARM_S = 2.0;       // a mine that met nothing in this long arms anyway (it goes off where it drifted)
export const DROP_SPEED = 1.5;         // u/s straight down: a dropped bomb leaves the tentacles already sinking
export const DROP_BELOW = 0.35;        // tiles under the octopus's centre it starts (if that is water)
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
    if (dist(octo.x, octo.y, b.x, b.y) <= r) hurtOctopus(octo, b.x, b.y, 'bomb'); // dead: a hit on the body (flash, knock)
    if (props) { // the live octopus and the dead body alike (props.blast skips PK_BODY)
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
     * Place a bomb if the octopus has one in stock. v2: `aim` null = DROPPED (heavy, straight down from (x, y), no
     * sideways speed); `aim` {x, y} = an URCHIN-MINE thrown from (x, y) with the octopus's velocity plus THROW_SPEED along
     * aim (unit length; a shorter vector throws proportionally less). `opts.pinned` keeps a bomb in place (tests),
     * `opts.free` places one without using a bomb from the stock (tests).
     */
    place(octo, x, y, aim = null, opts = null) {
      if (!(opts && opts.free) && !tryUseBomb(octo)) return false;
      const b = { x, y, fuse: fuse0, fuse0, exploded: false, age: 0, pid: -1, rot: 0, armed: true, flight: 0, stickE: null, ox: 0, oy: 0, sticky: false };
      if (props) {
        if (aim && (aim.x || aim.y)) {
          let ax = aim.x, ay = aim.y; const l = Math.hypot(ax, ay); if (l > 1) { ax /= l; ay /= l; } // a short vector throws proportionally less
          const ovx = octo.vx || 0, ovy = octo.vy || 0;
          b.pid = props.add(PK_BOMB, x, y, ovx + ax * THROW_SPEED, ovy + ay * THROW_SPEED, { timer: fuse0, grace: 0.35, mode: BM_STICKY });
          b.armed = false; b.sticky = true;
        } else {
          b.pid = props.add(PK_BOMB, x, y, 0, DROP_SPEED, { timer: fuse0, grace: 0.35, mode: BM_HEAVY });
        }
        if (b.pid < 0) { if (!(opts && opts.free)) octo.bombs++; return false; }
        if (opts && opts.pinned) props.hold(b.pid, -1, -1);
      }
      bombs.push(b);
      return true;
    },

    /** The bomb record riding on prop `pid`, or null (the hand picks bombs up by their prop). */
    byProp(pid) { for (const b of bombs) if (b.pid === pid && !b.exploded) return b; return null; },
    /** The hand threw bomb `b`: it is a sticky mine now (a running fuse keeps running). */
    makeSticky(b) {
      if (!props || !b || b.pid < 0) return;
      props.data.mode[b.pid] = BM_STICKY; props.data.stuck[b.pid] = 0; b.sticky = true; b.stickE = null; b.flight = 0;
    },
    /** The hand let bomb `b` go gently: a heavy bomb again. */
    makeHeavy(b) { if (props && b && b.pid >= 0) { props.data.mode[b.pid] = BM_HEAVY; b.stickE = null; } },

    /** One fixed step: tick fuses, explode, break rock, hurt octo, kill enemies via `enemies.killInRadius`.
     * In v2 mode the props system itself is stepped by the caller (main.js) before this. */
    update(dt, world, octo, enemies) {
      events.length = 0;
      if (props) {
        const d = props.data;
        const list = enemies && enemies.all ? enemies.all() : null;
        for (const b of bombs) {
          if (b.exploded || b.pid < 0) continue;
          const p = b.pid;
          // a mine in flight clings to the first creature it touches (and rides on it until it dies)
          if (b.sticky && !b.stickE && d.mode[p] === BM_STICKY && d.state[p] !== PS_HELD && d.state[p] !== PS_CARRY && !d.stuck[p] && list) {
            for (let k = 0; k < list.length; k++) {
              const e = list[k];
              if (e.dead || e.ghost || e.kind === 'beholder') continue;
              if (Math.hypot(e.x - d.x[p], e.y - d.y[p]) < (e.radius || 0.4) + d.radius[p]) { b.stickE = e; b.ox = d.x[p] - e.x; b.oy = d.y[p] - e.y; props.carry(p); d.stuck[p] = 1; break; }
            }
          }
          if (b.stickE) {
            if (b.stickE.dead) { b.stickE = null; d.mode[p] = BM_HEAVY; props.release(p); }
            else props.place(p, b.stickE.x + b.ox, b.stickE.y + b.oy, b.stickE.vx || 0, b.stickE.vy || 0);
          }
          b.x = d.x[p]; b.y = d.y[p]; b.rot = d.mode[p] === BM_PLAIN ? b.x / PROP_RADIUS[PK_BOMB] : b.rot; // a plain bomb rolls; a heavy one or a mine does not
          if (!b.armed) { b.flight += dt; if (d.stuck[p] || b.flight >= STICKY_ARM_S) b.armed = true; }
          if (b.armed) d.timer[p] -= dt;
          b.fuse = d.timer[p];
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
