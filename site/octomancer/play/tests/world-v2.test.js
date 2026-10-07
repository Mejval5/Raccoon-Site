// M1-4 / M1-5 tests (world-v2.js, level-spawns.js, render.js band cache):
// single-level world, bombs vs the border, band retracing, the wall-band ring,
// and the spawn adapter (nothing in rock, nothing within 7 tiles of the start).
import { MAT_BEDROCK } from '../js/materials.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, LEVEL_W, LEVEL_H, isBedrock } from '../js/level.js';
import { createLevelWorld, wallBandWindow, START_SAFE_RADIUS } from '../js/world-v2.js';
import { createPickups } from '../js/pickups.js';
import { createEnemies } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { loadRoomsJson } from './rooms.test.js';

function reachable(world, sx, sy) {
  const seen = new Uint8Array(LEVEL_W * LEVEL_H);
  const stack = [sy * LEVEL_W + sx];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % LEVEL_W, y = (i / LEVEL_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= LEVEL_W || ny >= LEVEL_H) continue;
      const j = ny * LEVEL_W + nx;
      if (seen[j] || world.tileAt(nx, ny) !== 0) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  return seen;
}

export async function runWorldV2Tests(assert) {
  setDefaultBank(createRoomBank(await loadRoomsJson()));
  const SEEDS = [1, 7, 42, 1234, 99991];

  // ---- band window: on screen + one each side, never the whole level ----
  {
    let worst = 0, bad = 0, n = 0;
    for (const rows of [5, 7, 11]) {
      const count = Math.ceil(LEVEL_H / rows);
      for (const view of [12.5, 24]) {
        for (let cy = view / 2; cy <= LEVEL_H - view / 2; cy += 0.37) {
          const w = wallBandWindow(cy - view / 2, cy + view / 2, rows, count);
          const vis = w.visTo - w.visFrom + 1, keep = w.keepTo - w.keepFrom + 1;
          worst = Math.max(worst, keep - vis);
          if (keep > vis + 2 || (vis === 1 && keep > 3)) bad++;
          n++;
        }
      }
    }
    assert(`v2 bands: cached bands never exceed on-screen + 2, and 3 when one band is on screen (${n} camera positions)`, bad === 0 && worst <= 2);
  }

  // ---- renderer wall cache stays inside the ring while the camera dives ----
  {
    // render.js pulls in octopus-draw.js, which loads its sprite sheet relative to the page at import time;
    // this test page has none, so import it with that one load parked (the game page is unaffected).
    const realFetch = window.fetch, RealImage = window.Image;
    window.fetch = (u, ...a) => (String(u).includes('octopus.json') ? new Promise(() => {}) : realFetch(u, ...a));
    window.Image = function () { return {}; };
    const { createRenderer } = await import('../js/render.js');
    window.fetch = realFetch; window.Image = RealImage;
    const canvas = document.createElement('canvas');
    canvas.width = 375; canvas.height = 812;
    const world = createLevelWorld(42, 0);
    const { canvasPoolStats } = await import('../js/canvas-pool.js');
    const live0 = canvasPoolStats().live;
    const renderer = createRenderer(canvas.getContext('2d'), world);
    const octo = createOctopus(world.startX, world.startY);
    let maxLive = 0, ok = true;
    for (let y = world.startY; y < LEVEL_H - 3; y += 1.5) {
      octo.x = octo.prevX = 10; octo.y = octo.prevY = y;
      renderer.render(canvas.width, canvas.height, octo, 1, 0, 1, {
        resident: world.residentChunks(), pickups: [], bubbles: [], critters: [], depth: y, enemies: [], shots: [], bombs: [],
        particles: null, shakeOffset: null, dreadLevel: 0, extraDraw: null,
      });
      const halfH = canvas.height / 2 / renderer.camera.pxPerUnit;
      const w = wallBandWindow(renderer.camera.y - halfH, renderer.camera.y + halfH, world.bandRows, world.bandCount());
      const vis = w.visTo - w.visFrom + 1;
      const live = renderer.wallBandStats().live;
      maxLive = Math.max(maxLive, live);
      if (live > vis + 2) ok = false;
    }
    assert(`v2 render: live wall bands <= on screen + 2 through a full dive (max ${maxLive} of ${world.bandCount()})`, ok && maxLive < world.bandCount());
    // r43: the wall art is cells (a band cut into columns), the deep rock bakes in steps, and nothing is bigger than the screen
    octo.x = octo.prevX = 10; octo.y = octo.prevY = 30;
    const frame = () => renderer.render(canvas.width, canvas.height, octo, 1, 0, 1, {
      resident: world.residentChunks(), pickups: [], bubbles: [], critters: [], depth: 30, enemies: [], shots: [], bombs: [],
      particles: null, shakeOffset: null, dreadLevel: 0, extraDraw: null,
    });
    let frames = 0;
    // frames with a pause between them: the plant images (the deep rock's foliage) load between tasks
    while (!(renderer.ready() && renderer.canvasStats().deepStage >= 3) && frames < 200) { frame(); frames++; await new Promise((r) => setTimeout(r, 8)); }
    const cs = renderer.canvasStats();
    assert(`v2 render r43: the first view is baked in ${frames} frames (ready, deep rock done)`, renderer.ready() && cs.deepStage >= 3 && frames < 200);
    assert(`v2 render r43: no wall canvas is wider or taller than the screen (${cs.maxW}x${cs.maxH} px of ${canvas.width}x${canvas.height})`, cs.maxW <= canvas.width && cs.maxH <= canvas.height);
    assert(`v2 render r43: the canvases for a 375x812 screen stay small (${(cs.bytes / 1048576).toFixed(1)} MB, ${cs.cells} cells at ${cs.bake} px/unit)`, cs.bytes < 14 * 1048576 && cs.cells >= 2);
    renderer.dispose();
    assert('v2 render r43: dispose gives every canvas back (none left in use)', canvasPoolStats().live === live0 && renderer.canvasStats().n === 0);
    const w2 = createLevelWorld(43, 0);
    const before = canvasPoolStats();
    const r2 = createRenderer(canvas.getContext('2d'), w2);
    let f2 = 0;
    const o2 = createOctopus(w2.startX, w2.startY);
    while (!r2.ready() && f2 < 60) { r2.render(canvas.width, canvas.height, o2, 1, 0, 1, { resident: w2.residentChunks(), pickups: [], bubbles: [], critters: [], depth: 0, enemies: [], shots: [], bombs: [], particles: null, shakeOffset: null, dreadLevel: 0, extraDraw: null }); f2++; }
    const after = canvasPoolStats();
    assert(`v2 render r43: the next level reuses the pooled canvases (${after.reuseCount - before.reuseCount} reused, ${((after.allocatedBytes - before.allocatedBytes) / 1048576).toFixed(1)} MB new)`, after.reuseCount > before.reuseCount);
    r2.dispose();
  }

  for (const seed of SEEDS) {
    const world = createLevelWorld(seed, 0);
    assert(`v2 world s${seed}: 34x68 level, camera bounds are the level`, world.width === 34 && world.height === 68 && world.residentChunkCount() === 1);
    assert(`v2 world s${seed}: exit reachable from the start`, reachable(world, world.level.startX, world.level.startY)[world.level.exitY * LEVEL_W + world.level.exitX] === 1);

    // ---- bombs: any interior rock, never the border; retrace only nearby bands ----
    for (let b = 0; b < world.bandCount(); b++) world.getWallOutline(b);
    const t0 = world.outlineTraces;
    let bx = -1, by = -1;
    for (let y = 30; y < 38 && bx < 0; y++) for (let x = 6; x < 28; x++) if (world.tileAt(x, y) === 1) { bx = x; by = y; break; }
    if (bx >= 0) {
      assert(`v2 bombs s${seed}: interior rock is breakable`, world.isBreakable(bx, by) && world.breakTile(bx, by) === true && world.tileAt(bx, by) === 0);
      for (let b = 0; b < world.bandCount(); b++) world.getWallOutline(b);
      assert(`v2 bombs s${seed}: breaking one tile retraces at most 2 bands (${world.outlineTraces - t0})`, world.outlineTraces - t0 >= 1 && world.outlineTraces - t0 <= 2);
    }
    let borderBroken = 0, interiorLeft = 0;
    for (let y = -1; y <= LEVEL_H; y++) for (let x = -1; x <= LEVEL_W; x++) world.breakTile(x, y);
    for (let y = 0; y < LEVEL_H; y++) {
      for (let x = 0; x < LEVEL_W; x++) {
        const v = world.tileAt(x, y);
        if (isBedrock(x, y) && v !== MAT_BEDROCK) borderBroken++;
        if (!isBedrock(x, y) && v !== 0 && v !== MAT_BEDROCK) interiorLeft++; // materials: bedrock outcrops stay too
      }
    }
    assert(`v2 bombs s${seed}: breaking every tile leaves the whole border (and the bedrock outcrops) and clears the interior`, borderBroken === 0 && interiorLeft === 0);
    assert(`v2 bombs s${seed}: border still collides once the interior is gone`, world.isSolid(0.5, 30) && world.isSolid(33.5, 30) && world.isSolid(10, 0.5) && world.isSolid(10, 67.5) && !world.isSolid(10, 30));
  }

  // ---- spawn adapter: nothing in rock, nothing near the start ----
  {
    let checked = 0, inRock = 0, nearStart = 0, inBorder = 0, badAnchor = 0;
    const kinds = new Set();
    for (const seed of SEEDS) {
      for (let lvl = 0; lvl < 12; lvl++) {
        const world = createLevelWorld(seed, lvl);
        const sx = world.startX, sy = world.startY;
        const resident = world.residentChunks();
        const octo = createOctopus(world.exitX, world.exitY);
        const pickups = createPickups();
        pickups.update(0.02, 0, octo, resident, world);
        const enemies = createEnemies();
        enemies.update(0.02, 0, octo, world, resident);
        const items = [
          ...pickups.visible(resident).map((p) => ({ x: p.baseX !== undefined ? p.baseX : p.x, y: p.baseY !== undefined ? p.baseY : p.y, what: p.type })),
          // spawn positions (an enemy's first step may already nudge it, so compare where it was placed)
          ...enemies.all().map((e) => ({ x: e.baseX !== undefined ? e.baseX : e.x, y: e.baseY !== undefined ? e.baseY : e.y, what: e.kind, isEnemy: true })),
        ];
        for (const it of items) {
          checked++;
          if (it.isEnemy) kinds.add(it.what);
          const tx = Math.floor(it.x), ty = Math.floor(it.y);
          if (world.tileAt(tx, ty) !== 0) inRock++;
          if (isBedrock(tx, ty)) inBorder++;
          if (Math.hypot(it.x - sx, it.y - sy) < START_SAFE_RADIUS) nearStart++;
        }
        for (const s of resident[0].chunk.spawns) {
          if (s.type !== 'enemy-slot') continue;
          const tx = Math.floor(s.x), ty = Math.floor(s.y);
          if (s.placement === 'floor' && world.tileAt(tx, ty + 1) === 0) badAnchor++;
          if (s.placement === 'ceiling' && world.tileAt(tx, ty - 1) === 0) badAnchor++;
          if (s.placement === 'wall' && world.tileAt(tx - 1, ty) === 0 && world.tileAt(tx + 1, ty) === 0) badAnchor++;
        }
      }
    }
    assert(`v2 spawns: ${checked} enemies and pickups over 60 levels, none in rock`, checked > 500 && inRock === 0);
    assert('v2 spawns: none in the border', inBorder === 0);
    assert(`v2 spawns: none within ${START_SAFE_RADIUS} tiles of the start marker`, nearStart === 0);
    assert('v2 spawns: enemy slots sit against the surface their placement names', badAnchor === 0);
    assert(`v2 spawns: several enemy kinds appear (${[...kinds].join(',')})`, kinds.size >= 3);
  }
}
