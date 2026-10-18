// Pushable blocks (props.js PK_BLOCK): axis-aligned squares that rest on tile tops, stack, are shoved along a floor by a
// swimming octopus, fall when their floor goes, crush what they land on, and are placed by buildLevelSpawns without ever
// making a level unsolvable.
import { createDamage } from '../js/damage.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, generateLevel, finalPathOk, LEVEL_W, LEVEL_H } from '../js/level.js';
import { buildLevelSpawns, blockCanMove } from '../js/level-spawns.js';
import { hazardBlockers } from '../js/hazards.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps, PK_BLOCK, PK_BOMB, PS_REST, BLOCK_BLAST_CARRY } from '../js/props.js';
import { STEP } from '../js/loop.js';
import { updateCamera } from '../js/camera.js';
import { createBotSim, tick } from './bot.js';
import { place } from './movement.js';
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

  // ---- 2026-10-18 Spelunky rules: support, the 1/16 snap on losing it, a straight fall, no sideways carry, the grid on landing ----
  {
    // support: anything under any part of the footprint holds it; nothing under the whole footprint does not
    const world = room(40, 26, (x, y) => (x < 20 ? y >= 14 : y >= 20));
    const props = createProps(), d = props.data;
    const a = props.add(PK_BLOCK, 20 + R - 0.05, 13.5), b = props.add(PK_BLOCK, 30.5, 13.5); // a: 0.05 of it over the ledge; b: over open water
    d.y[a] = d.y[b] = 14 - R;
    assert('blocks: support: a block with 0.05 of its bottom over the ledge is held up, one over open water is not',
      props.blockSupported(a, world) === true && props.blockSupported(b, world) === false);
    run(props, world, 80);
    assert(`blocks: ... the held one stays on the ledge (x ${d.x[a].toFixed(3)}, bottom ${(d.y[a] + R).toFixed(3)})`, Math.abs(d.y[a] + R - 14) < 0.02 && Math.abs(d.x[a] - (20 + R - 0.05)) < 1e-4);
  }
  {
    // pushed off a one-tile ledge by the real swim (bot sim): the moment it loses support its sideways speed is gone and x is on
    // the 1/16 grid; it falls straight down that column and lands on the tile grid in the next column, x 20.5
    const world = room(40, 26, (x, y) => (x < 20 ? y >= 14 : y >= 15));
    const sim = createBotSim(world), d = sim.props.data;
    const i = sim.props.add(PK_BLOCK, 17.5, 13.5);
    for (let k = 0; k < 40; k++) sim.props.step(STEP, world, null);
    place(sim, 15, 13.5);
    let lostAt = null, fallXs = new Set(), carry = 0, n = 0;
    for (; n < 400 && d.state[i] !== PS_REST || n < 60; n++) {
      const was = d.grounded[i];
      tick(sim, d.x[i] < 20.5 && !lostAt ? 1 : 0, 0);
      if (was && !d.grounded[i] && !lostAt) lostAt = { x: d.x[i], vx: d.vx[i] };
      if (lostAt && !d.grounded[i]) { fallXs.add(d.x[i]); if (d.vx[i] !== 0) carry++; }
    }
    assert(`blocks: losing support: sideways speed 0 and x on the 1/16 grid (x ${lostAt && lostAt.x}, vx ${lostAt && lostAt.vx})`, !!lostAt && lostAt.vx === 0 && Math.abs(lostAt.x * 16 - Math.round(lostAt.x * 16)) < 1e-4);
    assert(`blocks: ... it falls straight down (${fallXs.size} distinct x in the air, ${carry} steps with sideways speed)`, fallXs.size === 1 && carry === 0);
    assert(`blocks: ... and lands in the next column on the tile grid (x ${d.x[i]}, bottom ${(d.y[i] + R).toFixed(3)} vs 15)`, d.x[i] === 20.5 && Math.abs(d.y[i] + R - 15) < 0.02 && d.state[i] === PS_REST);
  }
  {
    // Daniel's wedge: off the ledge onto a lower floor with a 1-wide hole right under the next column; it drops into the hole
    const world = room(40, 30, (x, y) => (x < 20 ? y >= 14 : x === 20 ? y >= 24 : y >= 18));
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 17.5, 13.5);
    run(props, world, 40);
    const octo = createOctopus(15, 13.5);
    for (let n = 0; n < 300; n++) { octo.vx = d.x[i] < 20.6 ? 3 : 0; octo.vy = 0; octo.x += octo.vx * DT; props.step(DT, world, octo); }
    assert(`blocks: pushed off a ledge above a 1-wide hole it drops into the hole, never wedged on its lip (x ${d.x[i]}, bottom ${(d.y[i] + R).toFixed(3)} vs 24)`, d.x[i] === 20.5 && Math.abs(d.y[i] + R - 24) < 0.02 && d.state[i] === PS_REST);
    // and slid across a 1-wide hole in its own floor it drops in, as in Spelunky
    const w2 = room(40, 26, (x, y) => (x === 22 ? y >= 18 : y >= 14));
    const p2 = createProps(), e = p2.data;
    const j = p2.add(PK_BLOCK, 18.5, 13.5);
    run(p2, w2, 40);
    const o2 = createOctopus(16, 13.5);
    for (let n = 0; n < 320; n++) { o2.vx = 3; o2.vy = 0; o2.x += o2.vx * DT; if (e.y[j] > 14) o2.x = Math.min(o2.x, 21); p2.step(DT, w2, o2); }
    assert(`blocks: shoved over a 1-wide hole in its floor it drops in (x ${e.x[j]}, bottom ${(e.y[j] + R).toFixed(3)} vs 18)`, e.x[j] === 22.5 && Math.abs(e.y[j] + R - 18) < 0.02);
  }
  {
    // no sideways carry in the air: a block thrown sideways falls straight; a blast is the one explicit carry, capped
    const world = room(40, 26, (x, y) => y >= 20);
    const props = createProps(), d = props.data;
    const i = props.add(PK_BLOCK, 10.3, 6, 4, 0);
    let xs = new Set();
    for (let n = 0; n < 200; n++) { props.step(DT, world, null); if (!d.grounded[i]) xs.add(d.x[i]); }
    assert(`blocks: no sideways carry: a block given vx 4 in open water falls straight and lands on the grid (x ${d.x[i]}, ${xs.size} x in the air)`, xs.size === 1 && d.x[i] === 10.5);
    const k = props.add(PK_BLOCK, 20.5, 19.5);
    run(props, world, 40);
    props.blast(19.2, 19.6, 1.5);
    const vx0 = d.vx[k];
    let maxVx = 0;
    for (let n = 0; n < 300; n++) { props.step(DT, world, null); maxVx = Math.max(maxVx, Math.abs(d.vx[k])); }
    assert(`blocks: a blast is the one carry: capped (vx ${vx0.toFixed(2)}, max ${maxVx.toFixed(2)} <= ${BLOCK_BLAST_CARRY}), and it ends on the tile grid (x ${d.x[k]})`,
      vx0 > 0 && maxVx <= BLOCK_BLAST_CARRY + 1e-6 && d.x[k] * 2 === Math.round(d.x[k] * 2) && !inRock(world, d.x[k], d.y[k]));
  }
  {
    // steady push with the real swim: once in contact the block slides at exactly BLOCK_PUSH_SPEED, the octopus keeps its speed
    // (no stop-go), and the camera (camera.js updateCamera at 60 Hz on the interpolated position) never reverses or jumps
    const world = room(60, 30, (x, y) => y >= 14);
    const sim = createBotSim(world), d = sim.props.data;
    const i = sim.props.add(PK_BLOCK, 20.5, 13.5);
    for (let k = 0; k < 40; k++) sim.props.step(STEP, world, null);
    place(sim, 17, 13.5);
    const o = sim.octo, cam = {};
    let acc = 0, last = null, contactF = -1, worstDv = 0, worstBv = 0, back = 0, maxD = 0, prevVx = null;
    for (let f = 0; f < 60 * 6; f++) {
      acc += 1 / 60;
      while (acc >= STEP) {
        tick(sim, 1, 0); acc -= STEP;
        if (contactF < 0 && d.vx[i] > 0) contactF = f;
        if (contactF >= 0 && f > contactF + 6) { worstBv = Math.max(worstBv, Math.abs(d.vx[i] - 1.6)); if (prevVx !== null) worstDv = Math.max(worstDv, Math.abs(o.vx - prevVx)); }
        prevVx = o.vx;
      }
      const a = acc / STEP;
      updateCamera(cam, 1440, 900, o.prevX + (o.x - o.prevX) * a, o.prevY + (o.y - o.prevY) * a, 60, 30, 1 / 60, o.vx, o.vy);
      if (last !== null && contactF >= 0 && f > contactF + 45) { const dc = cam.x - last; if (dc < -1e-6) back++; maxD = Math.max(maxD, Math.abs(dc)); }
      last = cam.x;
    }
    assert(`blocks: pushed by the real swim the block slides at a steady speed (worst |vx - 1.6| ${worstBv.toFixed(4)}) and the octopus speed does not stop-go (worst step change ${worstDv.toFixed(4)})`, contactF >= 0 && worstBv < 1e-4 && worstDv < 0.05);
    assert(`blocks: ... the camera follows smoothly while pushing (${back} frames moving back, worst per-frame move ${maxD.toFixed(4)} vs swim ${(5.5 / 60).toFixed(4)})`, back === 0 && maxD <= 5.5 / 60);
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
    const en = createEnemies(), dm = createDamage();
    dm.register(en.family); props.setDamage(dm); // 2026-10-08: blocks crush creature bodies through the shared damage entry
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
    run(props, world, 700); // the bomb now sinks slowly (settling drag), so give it time
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

  // ---- r-vibefix: no block is wedged: every one has a push side (open pusher tile, open target tile, and room to slide or a drop) ----
  {
    const T = new Uint8Array(LEVEL_W * LEVEL_H); // a unit check of the rule on a hand-made strip
    for (let x = 0; x < LEVEL_W; x++) T[(10) * LEVEL_W + x] = 1;       // floor at y = 10
    for (let y = 0; y < LEVEL_H; y++) { T[y * LEVEL_W + 3] = 1; T[y * LEVEL_W + 8] = 1; } // walls at x = 3 and 8
    T[10 * LEVEL_W + 3] = 1;
    assert('blocks: blockCanMove: a block in a 4-wide dead end (x 4..7) can slide, one jammed in a corner cannot',
      blockCanMove(T, 5, 9) === true && blockCanMove(T, 4, 9) === false && blockCanMove(T, 7, 9) === false);
    T[9 * LEVEL_W + 7] = 1; // a 3-wide pocket (x 4..6): a block in the middle has only one free tile each side
    const cramped = blockCanMove(T, 5, 9);
    T[10 * LEVEL_W + 6] = 0; // a hole in the floor beside it: it can be pushed into the drop
    assert('blocks: blockCanMove: a block in a 3-wide pocket cannot slide, but can once there is a drop beside it', cramped === false && blockCanMove(T, 5, 9) === true);
    let n = 0, wedged = [], levels = 0;
    for (let seed = 1; seed <= 150; seed++) for (let lv = 0; lv < 3; lv++) {
      const level = generateLevel(seed, lv);
      levels++;
      for (const s of buildLevelSpawns(level, seed, lv).spawns) {
        if (s.type !== 'block') continue;
        n++;
        if (!blockCanMove(level.tiles, Math.floor(s.x), Math.floor(s.y))) wedged.push(seed + '/' + lv);
      }
    }
    assert(`blocks: all ${n} blocks over ${levels} levels (seeds 1-150) have a free push side` + (wedged.length ? ' [' + wedged.slice(0, 5).join(', ') + ']' : ''), n >= 40 && wedged.length === 0);
  }
}
