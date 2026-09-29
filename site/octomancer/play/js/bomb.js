// Bombs: placed at the octopus's position on the `bomb` action, fuse, then
// an explosion that breaks soft rock, kills enemies, and hurts the octopus
// too if it is still inside the blast. OVERNIGHT.md §4 M3-2.

import { BOMB_FUSE, BOMB_RADIUS } from './config.js';
import { hurtOctopus, tryUseBomb } from './octopus.js';

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function createBombs() {
  /** @type {{x:number,y:number,fuse:number,exploded:boolean,age:number}[]} */
  let bombs = [];
  const events = []; // {type:'exploded', x, y}

  return {
    events,
    list() { return bombs; },

    /** Place a bomb at (x,y) if the octopus has one in stock. */
    place(octo, x, y) {
      if (!tryUseBomb(octo)) return false;
      bombs.push({ x, y, fuse: BOMB_FUSE, exploded: false, age: 0 });
      return true;
    },

    /** One fixed step: tick fuses, explode, break rock, hurt octo, kill
     * enemies via `enemies.killInRadius`. */
    update(dt, world, octo, enemies) {
      events.length = 0;
      for (const b of bombs) {
        if (b.exploded) { b.age += dt; continue; }
        b.fuse -= dt;
        if (b.fuse > 0) continue;
        b.exploded = true;
        b.age = 0;
        // Break every non-border soft-rock tile in the blast circle.
        const minTx = Math.floor(b.x - BOMB_RADIUS), maxTx = Math.floor(b.x + BOMB_RADIUS);
        const minTy = Math.floor(b.y - BOMB_RADIUS), maxTy = Math.floor(b.y + BOMB_RADIUS);
        for (let ty = minTy; ty <= maxTy; ty++) {
          for (let tx = minTx; tx <= maxTx; tx++) {
            if (dist(tx + 0.5, ty + 0.5, b.x, b.y) <= BOMB_RADIUS) world.breakTile(tx, ty);
          }
        }
        enemies.killInRadius(b.x, b.y, BOMB_RADIUS);
        if (!octo.dead && dist(octo.x, octo.y, b.x, b.y) <= BOMB_RADIUS) {
          hurtOctopus(octo, b.x, b.y);
        }
        events.push({ type: 'exploded', x: b.x, y: b.y });
      }
      // Bombs linger a moment after exploding (for the death-poof-style
      // particle burst in enemy-draw.js/particles.js), then get dropped.
      bombs = bombs.filter((b) => !(b.exploded && b.age > 0.4));
    },
  };
}
