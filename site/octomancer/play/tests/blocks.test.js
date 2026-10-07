// Pushable blocks (props.js PK_BLOCK): axis-aligned squares that rest on tile tops, stack, are shoved along a floor by a
// swimming octopus, fall when their floor goes, crush what they land on, and are placed by buildLevelSpawns without ever
// making a level unsolvable.
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, generateLevel, finalPathOk, LEVEL_W, LEVEL_H } from '../js/level.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { hazardBlockers } from '../js/hazards.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps, PK_BLOCK, PK_BOMB, PS_REST } from '../js/props.js';
import { createEnemies } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { mulberry32 } from '../js/rng.js';
import { loadRoomsJson } from './rooms.test.js';

const DT = 0.02;
const R = 0.47;

/** A custom level from a tile function: fn(x, y) true = rock. The 2-tile border is rock (bedrock) too. */
function room(w, h, fn) {
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = (x < 2 || y < 2 || x >= w - 2 || y >= h - 2 || fn(x, y)) ? 1 : 0;
  return createLevelWorld(1, 0, { level: { tiles, w, h, startX: 4, startY: 4, exitX: -1, exitY: -1, spawns: [], walls: [] } });
}
function run(props, world, n, octo = null, enemies = null) { for (let i = 0; i < n; i++) props.step(DT, world, octo, enemies); }
/** Does the box overlap rock (edge contact does not count)? */
function inRock(world, x, y, r = R) {
  const e = 0.01;
  for (let ty = Math.floor(y - r + e); ty <= Math.floor(y + r - e); ty++) for (let tx = Math.floor(x - r + e); tx <= Math.floor(x + r - e); tx++) if (world.tileAt(tx, ty) !== 0) return true;
  return false;
}
/** Is the octopus circle clear of the block box? */
function octoClear(octo, d, i) {
  const px = Math.max(d.x[i] - d.radius[i], Math.min(d.x[i] + d.radius[i], octo.x)), py = Math.max(d.y[i] - d.radius[i], Math.min(d.y[i] + d.radius[i], octo.y));
  return Math.hypot(octo.x - px, octo.y - py) >= octo.radius - 1e-3;
}

export async function runBlocksTests(assert) {
  setDefaultBank(createRoomBank(await loadRoomsJson()));

  // ---- a dropped block settles on the floor, bottom on the tile top ----
  {
    const world = room(30, 22, (x, y) => y >= 14);
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 10.5, 6);
    run(props, world, 300);
    assert(`blocks: a dropped block sleeps (PS_REST) with its bottom on the tile top (bottom ${(d.y[i] + R).toFixed(3)} vs 14)`, d.state[i] === PS_REST && Math.abs(d.y[i] + R - 14) < 0.02);
    assert('blocks: ... never overlapping rock, and not rotated or drifting sideways', !inRock(world, d.x[i], d.y[i]) && Math.abs(d.x[i] - 10.5) < 1e-4);
  }

  // ---- two blocks stack ----
  {
    const world = room(30, 22, (x, y) => y >= 14);
    const props = createProps(), d = props.data;
    const a = props.add(PK_BLOCK, 10.5, 9), b = props.add(PK_BLOCK, 10.5, 3);
    run(props, world, 400);
    assert(`blocks: two blocks stack (lower bottom ${(d.y[a] + R).toFixed(3)}, upper sits ${(d.y[a] - d.y[b]).toFixed(3)} above it)`, Math.abs(d.y[a] + R - 14) < 0.02 && Math.abs(d.y[a] - d.y[b] - 2 * R) < 0.02);
    assert('blocks: ... and both fall asleep', d.state[a] === PS_REST && d.state[b] === PS_REST);
  }

  // ---- a swimming octopus shoves a block along the floor; it stops when the octopus stops ----
  {
    const world = room(40, 22, (x, y) => y >= 14);
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 14.5, 13.5);
    run(props, world, 60);
    const octo = createOctopus(12, 13.5);
    let clear = true;
    for (let n = 0; n < 80; n++) { octo.vx = 3; octo.vy = 0; octo.x += octo.vx * DT; props.step(DT, world, octo); if (!octoClear(octo, d, i)) clear = false; }
    const pushed = d.x[i] - 14.5;
    assert(`blocks: swimming into a block shoves it along the floor (moved ${pushed.toFixed(2)} tiles, speed ${d.vx[i].toFixed(2)})`, pushed > 1.2 && pushed < 80 * DT * 1.7 && d.vx[i] <= 1.65);
    assert('blocks: ... and the octopus never ends inside it while pushing, unhurt (shoving is not a crush)', clear && octo.hearts === createOctopus(0, 0).hearts);
    octo.vx = 0;
    run(props, world, 40, octo);
    const x1 = d.x[i];
    run(props, world, 60, octo);
    assert(`blocks: it stops when the octopus stops (slid ${(x1 - 14.5 - pushed).toFixed(2)} tiles after, then ${(d.x[i] - x1).toFixed(3)})`, Math.abs(d.x[i] - x1) < 0.005 && x1 - 14.5 - pushed < 0.3 && d.state[i] === PS_REST);
    assert('blocks: ... still resting on the floor', Math.abs(d.y[i] + R - 14) < 0.02);
  }

  // ---- pushed off a ledge: falls and lands on the lower floor ----
  {
    const world = room(40, 26, (x, y) => (x < 20 ? y >= 14 : y >= 20));
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 17.5, 13.5);
    run(props, world, 60);
    const octo = createOctopus(15, 13.5);
    let n = 0;
    for (; n < 300 && d.y[i] < 18; n++) { octo.vx = 3; octo.vy = 0; octo.x += octo.vx * DT; props.step(DT, world, octo); if (d.x[i] > 21.2) octo.vx = 0; }
    octo.vx = 0; octo.x = 5; octo.y = 5;
    run(props, world, 200, octo);
    assert(`blocks: pushed off a ledge it falls and lands on the lower floor (x ${d.x[i].toFixed(2)}, bottom ${(d.y[i] + R).toFixed(3)} vs 20)`, d.x[i] > 20.4 && Math.abs(d.y[i] + R - 20) < 0.02 && d.state[i] === PS_REST && !inRock(world, d.x[i], d.y[i]));
  }

  // ---- it cannot be pushed into rock: the next column must be free ----
  {
    const world = room(30, 22, (x, y) => y >= 14 || x >= 20);
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 18.5, 13.5);
    run(props, world, 60);
    const octo = createOctopus(15, 13.5);
    for (let n = 0; n < 200; n++) { octo.vx = 3; octo.x += octo.vx * DT; props.step(DT, world, octo); }
    assert(`blocks: pushed against a wall it stops flush (right edge ${(d.x[i] + R).toFixed(3)} vs 20)`, d.x[i] + R <= 20.001 && d.x[i] + R > 19.97 && octoClear(octo, d, i));
  }

  // ---- the octopus is solid to a block from every side (never ends inside it) ----
  {
    const world = room(30, 26, (x, y) => y >= 14);
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 12.5, 13.5);
    run(props, world, 60);
    let bad = 0, total = 0;
    const rand = mulberry32(5);
    for (const [ox, oy, vx, vy] of [[9, 13.2, 4, 0], [16, 13.2, -4, 0], [12.5, 8, 0, 5], [9, 10, 3, 3], [16, 10, -3, 3]]) {
      const octo = createOctopus(ox, oy);
      for (let n = 0; n < 100; n++) {
        octo.vx = vx + (rand() - 0.5); octo.vy = vy; octo.x += octo.vx * DT; octo.y += octo.vy * DT;
        if (octo.y > 13.5) octo.y = 13.5; // (the floor stops it)
        props.step(DT, world, octo);
        total++; if (!octoClear(octo, d, i)) bad++;
      }
    }
    assert(`blocks: swimming into a block from the left, the right, above and the diagonals never ends inside it (${bad} of ${total} steps)`, bad === 0);
    // the octopus standing on top: held up by the block, not sunk into it
    const octo = createOctopus(d.x[i], d.y[i] - R - 0.2);
    for (let n = 0; n < 60; n++) { octo.vy = 2; octo.y += octo.vy * DT; props.step(DT, world, octo); }
    assert(`blocks: the octopus can rest on top of a block (y ${octo.y.toFixed(2)}, block top ${(d.y[i] - R).toFixed(2)})`, octoClear(octo, d, i) && octo.y < d.y[i] - R);
  }

  // ---- the floor under a block goes: it falls ----
  {
    const world = room(30, 22, (x, y) => y >= 14);
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 10.5, 13.5);
    run(props, world, 60);
    const y0 = d.y[i];
    world.breakTile(10, 14);
    run(props, world, 100);
    assert(`blocks: a block whose floor tile is bombed away falls into the hole (y ${y0.toFixed(2)} -> ${d.y[i].toFixed(2)})`, Math.abs(d.y[i] - y0 - 1) < 0.02 && d.state[i] === PS_REST);
    // and a block sitting on it comes down too when the one beneath is pushed away
    const w2 = room(40, 22, (x, y) => y >= 14);
    const p2 = createProps(), e = p2.data;
    const lo = p2.add(PK_BLOCK, 14.5, 13.5), hi = p2.add(PK_BLOCK, 14.5, 12.5);
    run(p2, w2, 100);
    const octo = createOctopus(12.5, 13.5);
    for (let n = 0; n < 120; n++) { octo.vx = 3; octo.vy = 0; octo.x += octo.vx * DT; p2.step(DT, w2, octo); }
    assert(`blocks: a block on top of one that is shoved away comes down to the floor (upper bottom ${(e.y[hi] + R).toFixed(2)}, lower x moved ${(e.x[lo] - 14.5).toFixed(2)})`, e.x[lo] > 15.5 && Math.abs(e.y[hi] + R - 14) < 0.02 && !inRock(w2, e.x[hi], e.y[hi]));
  }

  // ---- a fast-falling block hurts an octopus under it, and kills an enemy ----
  {
    const world = room(30, 26, (x, y) => y >= 20);
    const props = createProps();
    const octo = createOctopus(10.5, 19.4);
    const en = createEnemies();
    const crab = en.spawnAt('crab', 20.5, 19.5, 'floor');
    props.add(PK_BLOCK, 10.5, 3);
    props.add(PK_BLOCK, 20.5, 3);
    const hearts = octo.hearts;
    run(props, world, 220, octo, en.all());
    assert(`blocks: a block falling on the octopus hurts it once (hearts ${hearts} -> ${octo.hearts}, cause ${octo.cause})`, octo.hearts === hearts - 1 && octo.cause === 'block');
    assert('blocks: ... and one landing on a crab kills it', crab.dead === true);
  }

  // ---- other props: a bomb is pushed out of a block, not through it ----
  {
    const world = room(30, 22, (x, y) => y >= 14);
    const props = createProps(), d = props.data;
    const blk = props.add(PK_BLOCK, 10.5, 13.5);
    const bomb = props.add(PK_BOMB, 10.5, 8);
    run(props, world, 200);
    assert(`blocks: a bomb dropped on a block rests on top of it (bomb y ${d.y[bomb].toFixed(2)}, block top ${(d.y[blk] - R).toFixed(2)})`, d.y[bomb] < d.y[blk] - R && d.y[bomb] > d.y[blk] - R - 0.5 && !inRock(world, d.x[blk], d.y[blk]));
  }

  // ---- 200 random drops on 4 generated levels never end inside rock ----
  {
    const rand = mulberry32(77);
    let bad = 0, total = 0;
    for (const seed of [1, 7, 42, 1234]) {
      const world = createLevelWorld(seed, 0);
      const props = createProps(256), d = props.data;
      const ids = [];
      for (let n = 0; n < 50; n++) {
        let x, y, tries = 0;
        do { x = 3 + rand() * (LEVEL_W - 6); y = 3 + rand() * (LEVEL_H - 6); tries++; } while (world.isSolid(x, y) && tries < 200);
        if (world.isSolid(x, y)) continue;
        const i = props.add(PK_BLOCK, x, y, (rand() - 0.5) * 6, (rand() - 0.5) * 6);
        if (i >= 0) ids.push(i);
      }
      run(props, world, 250);
      for (const i of ids) {
        total++;
        if (inRock(world, d.x[i], d.y[i]) || d.x[i] < 0 || d.x[i] > LEVEL_W || d.y[i] < 0 || d.y[i] > LEVEL_H) bad++;
      }
    }
    assert(`blocks: ${total} random drops (random velocities, blocks among blocks) on 4 generated levels never end inside rock after 5 s (${bad} bad)`, total >= 190 && bad === 0);
  }

  // ---- spawns: every block on a reachable water tile with rock under it, and the level stays solvable with them as blockers ----
  {
    let nBlocks = 0, bad = 0, unsolvable = 0, levels = 0, tooMany = 0, near = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const level = generateLevel(seed, seed % 3);
      const { spawns } = buildLevelSpawns(level, seed, seed % 3);
      levels++;
      const reached = new Uint8Array(level.tiles.length), stack = [level.startY * LEVEL_W + level.startX];
      reached[stack[0]] = 1;
      while (stack.length) {
        const c = stack.pop(), x = c % LEVEL_W, y = (c / LEVEL_W) | 0;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= LEVEL_W || ny >= LEVEL_H) continue;
          const ni = ny * LEVEL_W + nx;
          if (!reached[ni] && level.tiles[ni] === 0) { reached[ni] = 1; stack.push(ni); }
        }
      }
      const blockers = [];
      let here = 0;
      for (const s of spawns) {
        if (s.type === 'hazard') hazardBlockers(s, blockers);
        if (s.type !== 'block') continue;
        here++; nBlocks++;
        const tx = Math.floor(s.x), ty = Math.floor(s.y);
        if (level.tiles[ty * LEVEL_W + tx] !== 0 || !reached[ty * LEVEL_W + tx] || level.tiles[(ty + 1) * LEVEL_W + tx] === 0 || level.tiles[(ty - 1) * LEVEL_W + tx] !== 0) bad++;
        if (Math.hypot(s.x - (level.startX + 0.5), s.y - (level.startY + 0.5)) < 9 || Math.hypot(s.x - (level.exitX + 0.5), s.y - (level.exitY + 0.5)) < 4) near++;
      }
      if (here > 2) tooMany++;
      for (const s of spawns) if (s.type === 'block') blockers.push({ x: s.x, y: s.y, r: 0.75 });
      if (!finalPathOk(level.tiles, level.startX, level.startY, level.exitX, level.exitY, level.shop, blockers)) unsolvable++;
    }
    assert(`blocks: ${nBlocks} blocks over ${levels} seeds are all on reachable floor water (${bad} bad), none within 9 of the start or 4 of the exit (${near}), at most 2 a level (${tooMany})`, nBlocks >= 15 && bad === 0 && near === 0 && tooMany === 0);
    assert(`blocks: the exit and shop stay reachable with every block as a blocker circle (${unsolvable} unsolvable of ${levels})`, unsolvable === 0);
  }
}
