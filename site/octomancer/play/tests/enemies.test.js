// M3 scripted checks: urchin damage + invuln timing, dash-kills-piranha,
// bomb clears soft rock + hurts the octopus, Beholder spawn/kill, and the
// generator's enemy-free first 40 units. OVERNIGHT.md §3 M3 exit criteria.

import { createOctopus, stepOctopus, hurtOctopus } from '../js/octopus.js';
import { createEnemies } from '../js/enemies.js';
import { createBombs } from '../js/bomb.js';
import { generateChunk } from '../js/gen.js';

const OPEN_GRID = { isSolid: () => false, breakTile() {} };

function makeBombWorld() {
  const tiles = new Map(); // "x,y" -> 2 (soft rock)
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) tiles.set(`${x},${y}`, 2);
  return {
    isSolid(tx, ty) { const v = tiles.get(`${Math.floor(tx)},${Math.floor(ty)}`); return v === 1 || v === 2; },
    breakTile(tx, ty) { const k = `${tx},${ty}`; if (tiles.get(k) === 2) tiles.set(k, 0); },
    tiles,
  };
}

export function runEnemyTests(assert, approx) {
  // --- Hurt/invuln timing (the mechanism urchin/piranha contact calls) ---
  {
    const o = createOctopus(0, 0);
    hurtOctopus(o, 1, 0);
    const afterFirst = o.hearts;
    assert('hurtOctopus: first hit takes exactly 1 heart', afterFirst === 2);
    for (let i = 0; i < 40; i++) stepOctopus(o, { move: { x: 0, y: 0 }, dash: { pressed: false } }, 0.02, OPEN_GRID); // 0.8s
    hurtOctopus(o, 1, 0);
    assert('hurtOctopus: no second loss within 1s of invulnerability', o.hearts === afterFirst);
    for (let i = 0; i < 15; i++) stepOctopus(o, { move: { x: 0, y: 0 }, dash: { pressed: false } }, 0.02, OPEN_GRID); // +0.3s = 1.1s total
    hurtOctopus(o, 1, 0);
    assert('hurtOctopus: hits again once the 1s invuln has elapsed', o.hearts === afterFirst - 1);
  }

  // --- 0 hearts -> dead ---
  {
    const o = createOctopus(0, 0);
    o.hearts = 1;
    hurtOctopus(o, 1, 0);
    assert('hurtOctopus: hearts reaching 0 sets dead', o.hearts === 0 && o.dead === true);
  }

  // --- Urchin: static contact damage, immune to dash-through ---
  {
    const o = createOctopus(5, 5);
    o.vx = 9; o.vy = 0; // well above DASH_KILL_SPEED
    const enemies = createEnemies();
    const u = enemies.spawnAt('urchin', 5.1, 5);
    enemies.update(0.02, 0, o, OPEN_GRID, []);
    assert('urchin: contact damages the octopus once', o.hearts === 2);
    assert('urchin: a dash-speed hit does not kill it (bombs only)', u.dead === false);
  }

  // --- Piranha: dash-through at >=8 u/s kills it, no damage taken ---
  {
    const o = createOctopus(5, 5);
    o.vx = 9; o.vy = 0;
    const enemies = createEnemies();
    const p = enemies.spawnAt('piranha', 5.1, 5);
    enemies.update(0.02, 0, o, OPEN_GRID, []);
    assert('piranha: dash contact at >=8u/s kills it', p.dead === true);
    assert('piranha: a dash-kill does not also hurt the octopus', o.hearts === 3);
  }

  // --- Piranha: ordinary (non-dash) contact hurts the octopus, does not kill it ---
  {
    const o = createOctopus(5, 5); // vx=vy=0, well under DASH_KILL_SPEED
    const enemies = createEnemies();
    const p = enemies.spawnAt('piranha', 5.1, 5);
    enemies.update(0.02, 0, o, OPEN_GRID, []);
    assert('piranha: slow contact hurts the octopus instead of dying', o.hearts === 2 && p.dead === false);
  }

  // --- Bomb: clears soft rock within r2.5, leaves rock outside it, hurts the octopus inside ---
  {
    const world = makeBombWorld();
    const o = createOctopus(0, 0); // sitting on the bomb
    const enemies = createEnemies();
    const bombs = createBombs();
    assert('bomb.place: consumes one from stock', bombs.place(o, 0, 0) === true && o.bombs === 2);
    for (let i = 0; i < 80; i++) bombs.update(0.02, world, o, enemies); // > BOMB_FUSE (1.5s)
    let cleared = 0;
    for (const v of world.tiles.values()) if (v === 0) cleared++;
    assert('bomb: clears at least one soft-rock tile within its radius', cleared > 0);
    assert('bomb: leaves rock outside radius 2.5 untouched', world.tiles.get('3,3') === 2);
    assert('bomb: hurts the octopus if it is still inside the blast', o.hearts === 2);
  }

  // --- Bomb: kills enemies within radius (Beholder excluded, tested separately) ---
  {
    const world = makeBombWorld();
    const o = createOctopus(20, 20); // far away, not hurt by this one
    const enemies = createEnemies();
    const u = enemies.spawnAt('urchin', 1, 0);
    const bombs = createBombs();
    bombs.place(o, 0, 0);
    for (let i = 0; i < 80; i++) bombs.update(0.02, world, o, enemies);
    assert('bomb: kills an enemy caught in the blast radius', u.dead === true);
  }

  // --- Beholder: enters at 2:30 on 1-1 (beholder.js), touch kills regardless of invulnerability ---
  {
    const o = createOctopus(5, 5);
    const enemies = createEnemies();
    enemies.update(0.02, 149.9, o, OPEN_GRID, []);
    assert('Beholder: does not exist before 2:30', enemies.beholder() === null);
    enemies.update(0.02, 150, o, OPEN_GRID, []);
    assert('Beholder: appears at 2:30', enemies.beholder() !== null);
    const b = enemies.beholder();
    b.x = o.x; b.y = o.y; // force contact
    enemies.update(0.02, 150.02, o, OPEN_GRID, []);
    assert('Beholder: touch kills the octopus on contact', o.dead === true);
  }

  // --- Beholder: immune to bombs ---
  {
    const world = makeBombWorld();
    const o = createOctopus(20, 20);
    const enemies = createEnemies();
    enemies.update(0.02, 150, o, OPEN_GRID, []); // spawn it
    const b = enemies.beholder();
    b.x = 0; b.y = 0;
    const bombs = createBombs();
    bombs.place(o, 0, 0);
    for (let i = 0; i < 80; i++) bombs.update(0.02, world, o, enemies);
    assert('Beholder: a bomb does not kill it', b.dead === false);
  }

  // --- Mines were removed (Daniel): none ever spawns, at any seed or depth ---
  {
    let sawMine = false, total = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const enemies = createEnemies();
      const spawns = [];
      for (let i = 0; i < 60; i++) {
        const placement = ['open', 'floor', 'ceiling', 'wall'][i % 4];
        spawns.push({ type: 'enemy-slot', x: i, y: 40 + i * 7, placement, flatRun: true });
      }
      const o = createOctopus(20, 20);
      enemies.update(0.02, 0, o, makeBombWorld(), [{ index: seed, yOffset: seed * 300, chunk: { spawns } }]);
      for (const e of enemies.all()) { total++; if (e.kind === 'mine') sawMine = true; }
    }
    assert('no mine ever spawns across seeds and depths', total > 0 && !sawMine);
  }

  // --- M6-3 Crab: never walks off a ledge, turns at the edge instead ---
  {
    // A floor world with solid ground under x in [-3,3] only (a ledge at x=3).
    const tiles = new Map();
    for (let y = -1; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const ground = y === 1 && x >= -3 && x <= 3;
        tiles.set(`${x},${y}`, ground ? 1 : 0);
      }
    }
    const world = {
      isSolid(tx, ty) { const v = tiles.get(`${Math.floor(tx)},${Math.floor(ty)}`); return v === 1; },
      breakTile() {},
    };
    const enemies = createEnemies();
    const c = enemies.spawnAt('crab', 0, 0, 'floor');
    const o = createOctopus(20, 20);
    for (let i = 0; i < 3000; i++) enemies.update(0.02, i * 0.02, o, world, []); // 60s
    assert('crab: never walks off its ledge in 60s', c.x >= -3.5 && c.x <= 3.5);
  }

  // --- M6-3 Crab: dies to a dash, contact hurts otherwise ---
  {
    const world = { isSolid: () => false, breakTile() {} };
    const enemies = createEnemies();
    const o = createOctopus(5, 5);
    o.vx = 9; o.vy = 0;
    const c = enemies.spawnAt('crab', 5.1, 5, 'floor');
    enemies.update(0.02, 0, o, world, []);
    assert('crab: dash-speed contact kills it', c.dead === true);
  }

  // --- M6-3 Horns: static trap, contact hurts, immune to dash and bombs ---
  {
    const world = makeBombWorld();
    const enemies = createEnemies();
    const o = createOctopus(5, 5);
    o.vx = 9; o.vy = 0;
    const h = enemies.spawnAt('horns', 5.1, 5, 'floor');
    enemies.update(0.02, 0, o, world, []);
    assert('horns: contact damages the octopus', o.hearts === 2);
    assert('horns: a dash-speed hit does not kill it', h.dead === false);
    const n = enemies.killInRadius(5.1, 5, 3);
    assert('horns: immune to bomb blasts too', h.dead === false);
  }

  // (round 35: the manta no longer drops balls; its dive pattern is tested in enemies-r35.test.js)

  // --- M6-4 Manta: dies to a dash ---
  {
    const world = { isSolid: () => false, breakTile() {} };
    const enemies = createEnemies();
    const o = createOctopus(5, 5);
    o.vx = 9; o.vy = 0;
    const m = enemies.spawnAt('manta', 5.1, 5, 'open');
    enemies.update(0.02, 0, o, world, []);
    assert('manta: dash-speed contact kills it', m.dead === true);
  }

  // --- Generator: enemy-free first 40 units ---
  {
    let violations = 0, slotsSeen = 0;
    for (let ci = 0; ci < 3; ci++) {
      const c = generateChunk(1, ci, 16);
      for (const s of c.spawns) {
        if (s.type !== 'enemy-slot') continue;
        slotsSeen++;
        if (ci * 24 + s.y < 40) violations++;
      }
    }
    assert(`generator: enemy-free first 40 units (${slotsSeen} slots checked)`, violations === 0);
  }
}
