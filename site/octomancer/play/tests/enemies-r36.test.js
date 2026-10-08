// Round 36: the round-35 review fixes. Patrollers turn at a static enemy (no more pinned crabs / piranhas), a
// patroller never spawns boxed in, a pocket entrance stays clear of enemies, the pocket crack is a short zig-zag,
// the dash-kill ghost has no wind-up cue, and two lunging piranhas never share space.
import { createEnemies, PS_LUNGE, PS_WINDUP, PS_PATROL } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { buildLevelSpawns, POCKET_KEEP_OUT, PATROL_MIN_TRAVEL } from '../js/level-spawns.js';
import { drawEnemies } from '../js/enemy-draw.js';
import { makeZigCrack } from '../js/v2-props-draw.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

const DT = 0.02;
const OPEN = { isSolid: () => false, breakTile() {} };
const calm = (o) => { o.invulnTimer = 1e9; return o; };
function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push(k); return k === 'createRadialGradient' || k === 'createLinearGradient' ? grad : undefined; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const w2s = (cam, cw, ch, x, y) => ({ x: cw / 2 + (x - cam.x) * cam.pxPerUnit, y: ch / 2 + (y - cam.y) * cam.pxPerUnit });
/** A grid world from a solid test (resolveCircleVsGrid collides against it). */
const grid = (fn) => ({ isSolid: (x, y) => fn(Math.floor(x), Math.floor(y)), breakTile() {} });

export async function runEnemyR36Tests(assert) {
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);

  // ---- a crab in a 2-tile tunnel with an urchin on the ceiling turns round and keeps walking ----
  {
    // floor y >= 6, ceiling y < 4, walls at x < 2 and x >= 18; an urchin hangs on the ceiling at (9.5, 4.5)
    const world = grid((x, y) => x < 2 || x >= 18 || y >= 6 || y < 4);
    const o = calm(createOctopus(30, 30)); const en = createEnemies();
    const urchin = en.spawnAt('urchin', 9.5, 4.5, 'ceiling'); urchin.wallDir = 0;
    const c = en.spawnAt('crab', 13.5, 5.5, 'floor'); c.dir = -1;
    let minX = 99, maxX = -99, crossed = false;
    for (let i = 0; i < 500; i++) { en.update(DT, 0, o, world, [], null); minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); if (c.x < urchin.x) crossed = true; }
    assert(`r36 crab: walks into an urchin hull ahead, turns, and patrols more than a tile (x ${minX.toFixed(2)}..${maxX.toFixed(2)})`, maxX - minX > 1 && !crossed);
  }
  // ---- a piranha under floor horns turns at them ----
  {
    const world = grid((x, y) => x < 1 || x >= 24 || y >= 12 || y < 2);
    const o = calm(createOctopus(30, 30)); const en = createEnemies();
    const horns = en.spawnAt('horns', 12.5, 11.5, 'floor');
    const p = en.spawnAt('piranha', 8.5, 11.4, 'open'); p.dir = 1; p.baseX = 8.5; p.baseY = 11.4;
    let minX = 99, maxX = -99, passed = false;
    for (let i = 0; i < 500; i++) { en.update(DT, 0, o, world, [], null); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); if (p.x > horns.x) passed = true; }
    assert(`r36 piranha: turns at horns ahead instead of hovering against them (x ${minX.toFixed(2)}..${maxX.toFixed(2)})`, maxX - minX > 1.5 && !passed);
  }
  // ---- a manta turns at an urchin in its row ----
  {
    const world = grid((x, y) => x < 1 || x >= 30 || y >= 14 || y < 1);
    const o = calm(createOctopus(40, 40)); const en = createEnemies();
    const u = en.spawnAt('urchin', 16.5, 7.5, 'floor');
    const m = en.spawnAt('manta', 10, 7.5, 'open'); m.dir = 1;
    let minX = 99, maxX = -99;
    for (let i = 0; i < 500; i++) { en.update(DT, 0, o, world, [], null); minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x); }
    assert(`r36 manta: turns at an urchin in its row (x ${minX.toFixed(2)}..${maxX.toFixed(2)}, urchin at ${u.x})`, maxX < u.x && maxX - minX > 1.5);
  }
  // ---- generated levels: octopus parked at the start, nothing patrols pinned ----
  {
    let movers = 0; const pinned = [];
    const seeds = [1, 2, 3, 4, 5, 6, 7, 42];
    for (const seed of seeds) for (let lvl = 0; lvl < 3; lvl++) {
      const world = createLevelWorld(seed, lvl);
      const o = calm(createOctopus(world.level.startX + 0.5, world.level.startY + 0.5));
      const en = createEnemies(); const resident = world.residentChunks();
      const range = new Map();
      for (let i = 0; i < 500; i++) {
        en.update(DT, 0, o, world, resident, null);
        for (const e of en.all()) {
          if (!e.moving || e.kind === 'beholder') continue;
          let r = range.get(e.id); if (!r) { r = { e, x0: e.x, x1: e.x, y0: e.y, y1: e.y }; range.set(e.id, r); }
          r.x0 = Math.min(r.x0, e.x); r.x1 = Math.max(r.x1, e.x); r.y0 = Math.min(r.y0, e.y); r.y1 = Math.max(r.y1, e.y);
        }
      }
      for (const r of range.values()) { movers++; if (r.x1 - r.x0 < 1 && r.y1 - r.y0 < 1) pinned.push(`${r.e.kind}#${r.e.id} s${seed} l${lvl + 1} (${r.e.x.toFixed(1)},${r.e.y.toFixed(1)})`); }
    }
    assert(`r36 patrols: over ${seeds.length * 3} levels x 10 s with the octopus parked, none of ${movers} patrollers stays pinned (moves under 1 tile)${pinned.length ? ' [' + pinned.join(', ') + ']' : ''}`, movers > 20 && pinned.length === 0);
  }
  // ---- spawn rules: patrol room, pocket keep-out ----
  {
    let movers = 0, boxed = 0, nearPocket = 0, pockets = 0;
    for (let seed = 1; seed <= 20; seed++) for (let lvl = 0; lvl < 3; lvl++) {
      const world = createLevelWorld(seed, lvl); const L = world.level;
      const sp = buildLevelSpawns(L, seed, lvl).spawns;
      const en = sp.filter((s) => s.type === 'enemy-slot');
      const statics = en.filter((s) => ['urchin', 'horns', 'cannon'].includes(s.kind));
      for (const m of en) {
        if (!['piranha', 'crab', 'manta'].includes(m.kind)) continue;
        movers++;
        for (const s of statics) if (Math.abs(s.y - m.y) < 0.6 && Math.abs(s.x - m.x) < 1.2) boxed++;
      }
      const keep = [];
      for (let i = 0; i < (L.nPockets || 0); i++) {
        const px = L.pockets[i * 3], py = L.pockets[i * 3 + 1], side = L.pockets[i * 3 + 2];
        keep.push([side === 3 ? px - 2.5 : side === 4 ? px + 4.5 : px + 1, side === 1 ? py - 2.5 : side === 2 ? py + 4.5 : py + 1]);
      }
      for (const l of sp) if (l.type === 'loot' && l.lk === 4) keep.push([l.x + l.dx * 2, l.y + l.dy * 2]);
      pockets += keep.length;
      for (const e of en) for (const [kx, ky] of keep) if (Math.hypot(e.x - kx, e.y - ky) < POCKET_KEEP_OUT) nearPocket++;
    }
    assert(`r36 spawns: no patroller starts inside a static enemy hull (${movers} patrollers), min free stretch ${PATROL_MIN_TRAVEL} tiles`, movers > 20 && boxed === 0);
    assert(`r36 spawns: no enemy within ${POCKET_KEEP_OUT} tiles of a hidden pocket entrance (${pockets} pockets)`, pockets > 5 && nearPocket === 0);
  }
  // ---- pocket crack is short, jagged and stays inside one tile ----
  {
    let ok = true, turns = 0, branch = 0;
    for (const vertical of [true, false]) for (let k = 0; k < 20; k++) {
      const c = makeZigCrack(k * 3 + 1, k * 5 + 2, 1, 1, vertical)[0];
      const xs = [], ys = [];
      for (let i = 0; i < c.pts.length; i += 2) { xs.push(c.pts[i]); ys.push(c.pts[i + 1]); }
      const x0 = k * 3 + 1, y0 = k * 5 + 2;
      if (xs.some((x) => x < x0 || x > x0 + 1) || ys.some((y) => y < y0 || y > y0 + 1)) ok = false;
      const len = vertical ? Math.max(...ys) - Math.min(...ys) : Math.max(...xs) - Math.min(...xs);
      if (len > 0.7 || len < 0.2) ok = false; // short: never the full tile, never a dot
      let dirs = 0;
      for (let i = 1; i < xs.length - 1; i++) { const a = vertical ? xs[i] - xs[i - 1] : ys[i] - ys[i - 1], b = vertical ? xs[i + 1] - xs[i] : ys[i + 1] - ys[i]; if (a * b < 0) dirs++; }
      turns += dirs; branch += c.branches.length;
    }
    assert(`r36 pocket crack: short (0.2-0.7 of a tile), inside its tile, with zig-zag turns (${turns}) and a branch (${branch})`, ok && turns >= 40 && branch >= 40);
  }
  // ---- dash-kill ghost is only a white silhouette ----
  {
    const o = calm(createOctopus(0, 0)); const en = createEnemies();
    const p = en.spawnAt('piranha', 0.5, 0, 'open'); p.st = PS_WINDUP; p.tell = 0.8; p.t = 0.2;
    o.vx = 20; o.vy = 0; o.spikeHelmet = true; // a dash with the Urchin Cap
    en.update(DT, 0, o, OPEN, [], null);
    const ghost = en.all().find((e) => e.ghost);
    assert('r36 ghost: a dash kill leaves a ghost with no wind-up state', !!ghost && ghost.tell === 0 && ghost.st === PS_PATROL);
    const ctx = recCtx();
    drawEnemies(ctx, { x: 0, y: 0, pxPerUnit: 50 }, w2s, 800, 600, en.all(), [], 1, 1);
    assert('r36 ghost: it draws no glow and no "!" (no radial gradient)', ctx.calls.filter((k) => k === 'createRadialGradient').length === 0);
  }
  // ---- two piranhas lunging at the same target never share space ----
  {
    let worst = 0, lunging = 0;
    for (const [dx, dy] of [[0, 0], [0.2, 0], [0.5, 0], [1, 0.3], [0.3, 0.9], [0, 0.4]]) {
      const o = calm(createOctopus(4.5, 1.5)); const en = createEnemies();
      const a = en.spawnAt('piranha', 0, 0), b = en.spawnAt('piranha', -dx, dy); a.t = b.t = 0;
      for (let i = 0; i < 300; i++) {
        en.update(DT, i * DT, o, OPEN, [], null);
        if (a.st === PS_LUNGE && b.st === PS_LUNGE) {
          lunging++;
          const ox = 1.8 - Math.abs(a.x - b.x), oy = 1.1 - Math.abs(a.y - b.y); // sprite boxes 1.8 x 1.1
          if (ox > 0.02 && oy > 0.02) worst = Math.max(worst, Math.min(ox, oy));
        }
      }
    }
    assert(`r36 lunge: two lunging piranhas never overlap (${lunging} steps both lunging, worst overlap ${worst.toFixed(3)})`, lunging > 50 && worst === 0);
  }
}
