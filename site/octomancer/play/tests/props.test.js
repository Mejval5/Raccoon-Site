// Round 34: physics props (js/props.js): bombs, pots, clams, chests, the relic, falling rocks and rubble as rigid
// bodies that sink, bounce, roll and get shoved by blasts, colliding with the same traced wall segments the octopus
// uses. Hand-made rooms through the real createLevelWorld (smoothed outline collision) and 200 random drops on
// generated levels.
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, LEVEL_W, LEVEL_H } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps, PK_BOMB, PK_POT, PK_CLAM, PK_CHEST, PK_RELIC, PK_ROCK, PK_RUBBLE, PS_REST, PS_HELD } from '../js/props.js';
import { createBombs, BOMB_FUSE_V2, spawnRubble } from '../js/bomb.js';
import { createLoot, makeLootRecord } from '../js/loot.js';
import { createHazards, makeHazardRecord } from '../js/hazards.js';
import { createEnemies } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { mulberry32 } from '../js/rng.js';
import { BOMB_RADIUS } from '../js/config.js';
import { loadRoomsJson } from './rooms.test.js';

const DT = 0.02;

/** A custom level from a tile function: fn(x, y) true = rock. The 2-tile border is rock (bedrock) too. */
function room(w, h, fn) {
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = (x < 2 || y < 2 || x >= w - 2 || y >= h - 2 || fn(x, y)) ? 1 : 0;
  return createLevelWorld(1, 0, { level: { tiles, w, h, startX: 4, startY: 4, exitX: -1, exitY: -1, spawns: [], walls: [] } });
}
const noEnemies = { killInRadius() { return 0; } };

function run(props, world, n, octo = null) { for (let i = 0; i < n; i++) props.step(DT, world, octo); }

export async function runPropsTests(assert) {
  setDefaultBank(createRoomBank(await loadRoomsJson()));

  // ---- a bomb dropped on a slope rolls downhill and ends lower ----
  {
    // a smooth 30 degree ramp descending to the right (x 2..12), then a flat floor, as wall segments (what the wall
    // outline hands the physics); rock is below the line
    const yEnd = 6 + 10 * Math.tan(Math.PI / 6);
    const segs = [{ x1: 2, y1: 6, x2: 12, y2: yEnd }, { x1: 12, y1: yEnd, x2: 40, y2: yEnd }];
    const lineY = (x) => (x < 12 ? 6 + (x - 2) * Math.tan(Math.PI / 6) : yEnd);
    const world = { isSolid: (x, y) => y > lineY(x), tileAt: (x, y) => (y + 0.5 > lineY(x + 0.5) ? 1 : 0), wallSegmentsNear: () => segs };
    const props = createProps();
    const i = props.add(PK_BOMB, 5, 3, 0, 0);
    const d = props.data;
    run(props, world, 150);
    const landedY = d.y[i];
    run(props, world, 1000);
    assert(`props: a bomb dropped on a slope ends lower (y ${d.y[i].toFixed(2)} vs ${landedY.toFixed(2)} where it landed) and to the downhill side (x ${d.x[i].toFixed(2)} vs 5)`, d.y[i] > landedY + 1.5 && d.x[i] > 11);
    assert('props: ... and comes to rest (asleep) at the bottom, not inside rock', d.state[i] === PS_REST && !world.isSolid(d.x[i], d.y[i]));
    // on the tile-built slope of a generated cave it also ends up lower or equal, never higher
    const stairs = room(30, 22, (x, y) => y >= Math.min(16, 8 + Math.max(0, x - 6)));
    const p2 = createProps();
    const j = p2.add(PK_BOMB, 8.95, 4, 0, 0);
    run(p2, stairs, 500);
    assert(`props: on a stair-step slope it ends lower and downhill too (x ${p2.data.x[j].toFixed(2)}, y ${p2.data.y[j].toFixed(2)})`, p2.data.y[j] > 9.7 && p2.data.x[j] > 9.2);
  }

  // ---- a bomb thrown at a wall bounces back ----
  {
    const world = room(30, 22, (x, y) => y >= 14 || x >= 9);
    const props = createProps(), bombs = createBombs(props);
    const octo = createOctopus(5.5, 8.5);
    octo.vx = 1; octo.vy = 0;
    const placed = bombs.place(octo, 5.5, 8.5, { x: 1, y: 0 });
    assert('bomb: thrown with the octopus velocity plus an impulse along the aim', placed && Math.abs(props.data.vx[0] - 10) < 1e-4);
    octo.vx = 0; octo.x = 3; octo.y = 3; // out of the way
    let maxX = 0, bounced = false;
    for (let n = 0; n < 120; n++) {
      props.step(DT, world, octo); bombs.update(DT, world, octo, noEnemies);
      const b = bombs.list()[0];
      if (!b || b.exploded) break;
      maxX = Math.max(maxX, b.x);
      if (props.data.vx[0] < -0.5 && maxX > 7.5) bounced = true;
    }
    assert(`bomb: thrown at a wall it bounces back (reached x ${maxX.toFixed(2)} of a wall at 9, then moved away)`, bounced && maxX < 9);
  }

  // ---- the fuse: 2.5 s, the bomb sinks meanwhile, then it explodes (and not before) ----
  {
    const world = room(30, 30, (x, y) => y >= 24);
    const props = createProps(), bombs = createBombs(props);
    const octo = createOctopus(25, 5);
    bombs.place(octo, 10.5, 4.5, null);
    const y0 = props.data.y[0];
    let t = 0, boomAt = -1;
    for (let n = 0; n < 200; n++) {
      props.step(DT, world, octo); bombs.update(DT, world, octo, noEnemies);
      t += DT;
      if (bombs.events.length) { boomAt = t; break; }
    }
    assert(`bomb: explodes on a ${BOMB_FUSE_V2} s fuse (went off at ${boomAt.toFixed(2)} s)`, Math.abs(boomAt - BOMB_FUSE_V2) < 0.06);
    const b = bombs.list()[0];
    assert('bomb: it sank before it went off (gravity)', b.y > y0 + 1.5);
  }

  // ---- bombs get pushed by the octopus while rolling ----
  {
    const world = room(30, 22, (x, y) => y >= 14);
    const props = createProps();
    const i = props.add(PK_BOMB, 12, 13.55, 0, 0, { grace: 0 });
    run(props, world, 60);
    const x0 = props.data.x[i];
    const octo = createOctopus(10.4, 13.5); octo.vx = 4; octo.vy = 0;
    for (let n = 0; n < 40; n++) { props.step(DT, world, octo); octo.x += octo.vx * DT; }
    assert(`props: a swimming octopus pushes a bomb along (moved ${(props.data.x[i] - x0).toFixed(2)} tiles, vx ${props.data.vx[i].toFixed(1)})`, props.data.x[i] > x0 + 0.6 && props.data.vx[i] > 1);
    const other = props.add(PK_POT, 20, 13.55, 0, 0);
    run(props, world, 60);
    const px = props.data.x[other];
    const o2 = createOctopus(18.9, 13.5); o2.vx = 4;
    for (let n = 0; n < 15; n++) { props.step(DT, world, o2); o2.x += o2.vx * DT; }
    assert('props: only bombs are pushed by the octopus (a pot stays)', Math.abs(props.data.x[other] - px) < 1e-6);
  }

  // ---- props rest on rock, do not sink through it, and keep apart from each other ----
  {
    const world = room(24, 20, (x, y) => y >= 14);
    const props = createProps();
    const ids = [PK_POT, PK_CLAM, PK_CHEST, PK_RELIC].map((k, n) => props.add(k, 10 + n * 0.1, 4 + n * 1.2, 0, 0));
    run(props, world, 400);
    const d = props.data;
    let ok = true;
    for (const i of ids) if (world.isSolid(d.x[i], d.y[i]) || d.y[i] > 14.01) ok = false;
    assert('props: a pot, clam, chest and relic dropped together all settle on the floor (none through it)', ok && ids.every((i) => d.state[i] === PS_REST));
    let overlap = 0;
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const dd = Math.hypot(d.x[ids[a]] - d.x[ids[b]], d.y[ids[a]] - d.y[ids[b]]);
      overlap = Math.max(overlap, d.radius[ids[a]] + d.radius[ids[b]] - dd);
    }
    assert(`props: circle separation keeps them apart (worst overlap ${overlap.toFixed(3)} tile)`, overlap < 0.08);
  }

  // ---- a chest loses its support and falls when the rock below is bombed ----
  {
    const world = room(30, 24, (x, y) => (y >= 9 && y <= 10) || y >= 21);
    const props = createProps(), bombs = createBombs(props), loot = createLoot(props);
    loot.add(makeLootRecord('chest', 10.5, 8.5, 0, -1, mulberry32(3)));
    const octo = createOctopus(24.5, 6.5);
    run(props, world, 5); loot.update(DT, octo, world, null);
    const y0 = loot.data.y[0];
    for (let i = 0; i < 100; i++) { props.step(DT, world, octo); loot.update(DT, octo, world, null); }
    assert('chest: sits on its floor tile (attached, not sinking) while the rock is there', Math.abs(loot.data.y[0] - y0) < 1e-6 && props.data.state[loot.data.pid[0]] === PS_HELD);
    octo.bombs = 3;
    bombs.place(octo, 10.5, 10, null, { pinned: true }); // a bomb inside the floor, right under it
    for (let i = 0; i < 300; i++) { // 2.5 s fuse, then the fall
      props.step(DT, world, octo); bombs.update(DT, world, octo, noEnemies); loot.update(DT, octo, world, null);
      loot.takeEvents();
    }
    const y1 = loot.data.y[0];
    assert(`chest: the floor under it was bombed away, so it fell (y ${y0.toFixed(2)} -> ${y1.toFixed(2)})`, y1 > y0 + 3 && !world.isSolid(loot.data.x[0], y1));
  }

  // ---- explosion impulse moves a nearby prop (and the octopus, and an enemy) ----
  {
    const world = room(30, 22, (x, y) => y >= 14);
    const props = createProps(), bombs = createBombs(props);
    const pot = props.add(PK_POT, 12.5, 13.62, 0, 0);
    run(props, world, 60);
    assert('props: the pot has settled before the blast', props.data.state[pot] === PS_REST);
    const octo = createOctopus(20, 5); octo.bombs = 1;
    bombs.place(octo, 9.5, 12.6, null, { pinned: true });
    let moved = false;
    for (let i = 0; i < 160; i++) {
      props.step(DT, world, octo); bombs.update(DT, world, octo, noEnemies);
      if (bombs.events.length) { moved = props.data.vx[pot] > 1.5; break; }
    }
    assert(`props: an explosion pushes a nearby prop away (pot vx ${props.data.vx[pot].toFixed(1)})`, moved);
    // the octopus
    const w2 = room(30, 22, () => false), p2 = createProps(), b2 = createBombs(p2);
    const o2 = createOctopus(13.5, 10); o2.bombs = 1; o2.invulnTimer = 5;
    b2.place(o2, 10.5, 10, null, { pinned: true });
    for (let i = 0; i < 160 && !b2.events.length; i++) { p2.step(DT, w2, o2); b2.update(DT, w2, o2, noEnemies); }
    assert(`bomb: the blast also shoves the octopus (vx ${o2.vx.toFixed(1)})`, o2.vx > 2);
    // an enemy: knocked away and stunned, harmless while stunned
    const w3 = room(30, 22, () => false), p3 = createProps(), b3 = createBombs(p3), en = createEnemies();
    const o3 = createOctopus(25, 18); o3.bombs = 1;
    const pir = en.spawnAt('piranha', 14.5, 10);
    b3.place(o3, 10.5, 10, null, { pinned: true });
    en.update(DT, 0, o3, w3, []); // (the piranha is parked until the blast: only the props and the bomb run)
    for (let i = 0; i < 160 && !b3.events.length; i++) { p3.step(DT, w3, o3); b3.update(DT, w3, o3, en); }
    assert('bomb: a piranha outside the kill radius but inside the blast reach is knocked back and stunned', !pir.dead && pir.stun > 0.5 && pir.kvx > 1);
    const x0 = pir.x;
    for (let i = 0; i < 20; i++) en.update(DT, 0, o3, w3, []);
    assert('enemies: the stunned piranha drifts away with the blast, then recovers', pir.x > x0 + 0.3 && pir.stun < 0.9);
    o3.x = pir.x; o3.y = pir.y;
    o3.hearts = 3; o3.invulnTimer = 0;
    pir.stun = 0.5;
    en.update(DT, 0, o3, w3, []);
    assert('enemies: a stunned enemy does not hurt the octopus', o3.hearts === 3);
  }

  // ---- rubble: 4-8 chips per blast, sink, settle, fade after 3 s; the octopus ignores them ----
  {
    const world = room(30, 22, (x, y) => y >= 12);
    const props = createProps(), bombs = createBombs(props);
    const octo = createOctopus(20, 6); octo.bombs = 1;
    bombs.place(octo, 8.5, 11.4, null, { pinned: true });
    let evs = 0;
    for (let i = 0; i < 160 && !evs; i++) { props.step(DT, world, octo); bombs.update(DT, world, octo, noEnemies); evs = bombs.events.length; }
    const ru = props.ofKind(PK_RUBBLE);
    assert(`rubble: a blast that removes rock spawns 4-8 rubble props (${ru.length})`, ru.length >= 4 && ru.length <= 8);
    const y0 = ru.map((i) => props.data.y[i]);
    run(props, world, 50);
    const moved = ru.filter((i, n) => props.data.y[i] > y0[n] + 0.05).length;
    assert('rubble: chips sink and settle (they are free bodies)', moved >= 1 && ru.every((i) => !world.isSolid(props.data.x[i], props.data.y[i])));
    // the octopus swims through the pile: no push either way
    const o2 = createOctopus(props.data.x[ru[0]], props.data.y[ru[0]]); o2.vx = 3; o2.vy = 0;
    const vx0 = o2.vx;
    props.step(DT, world, o2);
    assert('rubble: no collision with the octopus (its velocity is untouched)', o2.vx === vx0);
    run(props, world, 160);
    assert('rubble: all of it fades away after about 3 s', props.ofKind(PK_RUBBLE).length === 0);
    assert('rubble: none when no rock was removed', spawnRubble(props, [], 0, 0, 0) === 0 && props.ofKind(PK_RUBBLE).length === 0);
  }

  // ---- a falling rock (hazard) is a body hanging from its ceiling tile: bomb the ceiling and it drops ----
  {
    const world = room(30, 26, (x, y) => y >= 20 || (y >= 6 && y <= 8 && x < 20));
    const props = createProps(), haz = createHazards(props), bombs = createBombs(props);
    const tiles = new Uint8Array(30 * 26);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 30; x++) tiles[y * 30 + x] = world.tileAt(x, y);
    const rec = makeHazardRecord('rock', 10.5, 9.5, 0, 1, tiles, 30, 26);
    haz.add(rec);
    const octo = createOctopus(25, 12); octo.bombs = 2;
    for (let i = 0; i < 40; i++) { props.step(DT, world, octo); haz.update(DT, 0, octo, world, null); }
    assert('rock: hangs from its ceiling while nothing happens (held, not falling)', haz.data.state[0] === 0 && props.data.state[haz.data.pid[0]] === PS_HELD);
    bombs.place(octo, 10.5, 7, null, { pinned: true }); // inside the ceiling slab above it
    let fell = false, landed = false;
    for (let i = 0; i < 400; i++) {
      props.step(DT, world, octo); bombs.update(DT, world, octo, noEnemies); haz.update(DT, 0, octo, world, null);
      if (haz.data.state[0] === 2) fell = true;
      if (haz.data.state[0] === 3) { landed = true; break; }
    }
    assert('rock: with its ceiling bombed away it drops by itself', fell && landed);
    assert('rock: it lands on the floor and turns into rock there', world.tileAt(10, 19) === 1 || world.tileAt(10, 18) === 1);
  }

  // ---- loot as props: attached while its rock stands; a broken clam is gone ----
  {
    const world = room(30, 22, (x, y) => y >= 14);
    const props = createProps(), loot = createLoot(props);
    loot.add(makeLootRecord('clam', 8.5, 13.5, 0, -1, mulberry32(2)));
    loot.add(makeLootRecord('pot', 12.5, 13.5, 0, -1, mulberry32(2)));
    const octo = createOctopus(24, 5);
    for (let i = 0; i < 50; i++) { props.step(DT, world, octo); loot.update(DT, octo, world, null); }
    assert('loot: clams and pots are props, attached to the floor they sit on', props.count() === 2 && loot.data.pid[0] >= 0 && loot.data.y[0] === 13.5);
    loot.explode(8.5, 13.5, BOMB_RADIUS);
    loot.update(DT, octo, world, null);
    assert('loot: a broken clam leaves the props system', props.count() === 1 && loot.data.pid[0] === -1);
  }

  // ---- falling chase rocks are props too: they sink, hit the floor and are removed ----
  {
    const world = room(30, 16, (x, y) => y >= 12);
    const props = createProps(), loot = createLoot(props);
    loot.add(makeLootRecord('relic', 15.5, 11.5, 0, -1, mulberry32(4), true));
    const octo = createOctopus(15.5, 11.4);
    let evs = [];
    for (let i = 0; i < 40; i++) { props.step(DT, world, octo); loot.update(DT, octo, world, null); evs = evs.concat(loot.takeEvents()); }
    assert('relic: touching it starts the chase and the relic prop is released', evs.some((e) => e.type === 'relic') && loot.chaseLeft() > 0 && props.ofKind(PK_RELIC).length === 0);
    octo.x = 15.5; octo.y = 11.4;
    let rocks = 0, landed = 0;
    for (let i = 0; i < 300; i++) {
      props.step(DT, world, octo); loot.update(DT, octo, world, null);
      rocks = Math.max(rocks, props.ofKind(PK_ROCK).length);
      for (const e of loot.takeEvents()) if (e.type === 'rockLanded') landed++;
      octo.invulnTimer = 5;
    }
    assert(`relic chase: rocks are physics bodies (up to ${rocks} at once) that land and are cleaned up (${landed} landed)`, rocks >= 1 && landed >= 1);
  }

  // ---- 200 random drops on generated levels: nothing ends inside rock after 5 s ----
  {
    const rand = mulberry32(99);
    const kinds = [PK_BOMB, PK_POT, PK_CLAM, PK_CHEST, PK_RELIC, PK_ROCK, PK_RUBBLE];
    let bad = 0, total = 0, asleep = 0, drops = 0;
    for (const seed of [1, 7, 42, 1234]) {
      const world = createLevelWorld(seed, 0);
      const props = createProps(256);
      const ids = [];
      for (let n = 0; n < 50; n++) {
        let x, y, tries = 0;
        do { x = 3 + rand() * (LEVEL_W - 6); y = 3 + rand() * (LEVEL_H - 6); tries++; } while (world.isSolid(x, y) && tries < 200);
        if (world.isSolid(x, y)) continue;
        const k = kinds[Math.floor(rand() * kinds.length)];
        const i = props.add(k, x, y, (rand() - 0.5) * 6, (rand() - 0.5) * 6, k === PK_RUBBLE ? { timer: 99 } : null);
        if (i >= 0) { ids.push(i); drops++; }
      }
      run(props, world, 250);
      for (const i of ids) {
        total++;
        if (world.isSolid(props.data.x[i], props.data.y[i]) || props.data.x[i] < 0 || props.data.x[i] > LEVEL_W || props.data.y[i] < 0 || props.data.y[i] > LEVEL_H) bad++;
        if (props.data.state[i] === PS_REST) asleep++;
      }
    }
    assert(`props: ${drops} random drops (all kinds, random velocities) on 4 generated levels never end inside rock after 5 s (${bad} bad of ${total})`, drops >= 190 && bad === 0);
    assert(`props: most of them have settled to rest after 5 s (${asleep} of ${total})`, asleep > total * 0.6);
  }

  // ---- data-oriented: flat typed arrays, a free list reuses slots ----
  {
    const props = createProps(8);
    const d = props.data;
    assert('props: SoA of typed arrays (x, y, vx, vy, radius, kind, state, timer)', ['x', 'y', 'vx', 'vy', 'radius', 'timer'].every((k) => d[k] instanceof Float32Array) && d.kind instanceof Uint8Array && d.state instanceof Uint8Array);
    const a = props.add(PK_POT, 5, 5), b = props.add(PK_POT, 6, 5);
    props.remove(a);
    assert('props: a freed slot is reused and the count is right', props.add(PK_CLAM, 7, 5) === a && props.count() === 2 && b !== a);
    let full = 0;
    for (let n = 0; n < 20; n++) if (props.add(PK_POT, 1, 1) < 0) full++;
    assert('props: a full system refuses instead of growing', full > 0 && props.count() === 8);
  }
}
