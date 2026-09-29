// Octomancer play: wires input -> octopus -> world -> camera -> render.
// OVERNIGHT.md §2, M1-3, M2-2 (the fixed M1 test cave is replaced by the
// infinite chunk-streaming world here).
import { createLoop, STEP } from './loop.js';
import { createInput } from './input.js';
import { createTouchUI } from './touch-ui.js';
import { createDebugOverlay } from './debug.js';
import { createWorld } from './world.js';
import { createOctopus, stepOctopus } from './octopus.js';
import { createRenderer } from './render.js';
import { createPickups } from './pickups.js';
import { createDecor } from './decor.js';
import { CHUNK_H, CHUNK_W } from './gen.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const touchRoot = document.getElementById('touch-ui');
const debugEl = document.getElementById('debug-overlay');
const hudEl = document.getElementById('hud');

const params = new URLSearchParams(location.search);
const initialSeed = Number(params.get('seed')) || 1;

let dpr = 1;
function isCoarsePointer() {
  return matchMedia('(pointer: coarse)').matches;
}
function resize() {
  const cap = isCoarsePointer() ? 1.5 : 2;
  dpr = Math.min(window.devicePixelRatio || 1, cap);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

const input = createInput();
const touchUI = createTouchUI(touchRoot, input);

// --- Simulation state ---
let seed = initialSeed;
let world = createWorld(seed);
let octo = createOctopus(world.startX, world.startY);
let renderer = createRenderer(ctx, world);
let pickups = createPickups();
let decor = createDecor(CHUNK_W, CHUNK_H);
let autoDiveOn = false;

const sim = {
  time: 0,
  lastInput: { move: { x: 0, y: 0 }, dash: { pressed: false, held: false }, bomb: { pressed: false, held: false }, pause: { pressed: false, held: false } },
};

hudEl.innerHTML = '<div id="hud-placeholder" style="position:absolute;left:calc(12px + var(--safe-l));top:calc(8px + var(--safe-t));color:#baffea;font:600 13px \'Quicksand\',sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);">Octomancer &mdash; seed <span id="hud-seed"></span> &mdash; depth <span id="hud-depth">0</span>m</div>';
const hudSeedEl = document.getElementById('hud-seed');
const hudDepthEl = document.getElementById('hud-depth');
hudSeedEl.textContent = String(seed);

const autoDive = { path: [], recalc: 0 };

function step(dt) {
  sim.time += dt;
  let snap = input.snapshot();
  if (autoDiveOn) {
    // __octo.autoDive(true): a small bounded BFS through the tile grid
    // toward "deeper", re-planned every 0.3s, so the 10-minute soak test
    // actually navigates the generated cave (including overhangs a naive
    // "aim at the nearest open column one row down" got stuck under)
    // instead of just pushing straight down.
    autoDive.recalc -= dt;
    if (autoDive.recalc <= 0 || autoDive.path.length === 0) {
      autoDive.path = planDiveBFS(world, octo.x, octo.y);
      autoDive.recalc = 0.3;
    }
    const wp = autoDive.path[0];
    let dx = 0, dy = 1;
    if (wp) {
      const tx = wp[0] + 0.5, ty = wp[1] + 0.5;
      if (Math.hypot(octo.x - tx, octo.y - ty) < 0.6) autoDive.path.shift();
      dx = clampAxis(tx - octo.x);
      dy = clampAxis(ty - octo.y) || 1;
    }
    snap = { move: { x: dx, y: dy }, dash: { pressed: false, held: false }, bomb: { pressed: false, held: false }, pause: { pressed: false, held: false } };
  }
  sim.lastInput = snap;
  stepOctopus(octo, snap, dt, world);
  world.update(octo.y);
  const resident = world.residentChunks();
  pickups.update(dt, sim.time, octo, resident);
  decor.update(dt, resident);
  if (hudDepthEl) hudDepthEl.textContent = String(Math.max(0, Math.round(world.depth() - world.startY)));
}
function clampAxis(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

/** Bounded 4-connected BFS from the octopus's current tile to the nearest
 * tile at least 8 rows deeper, through non-solid tiles. Returns the path
 * (excluding the start tile) as [tx,ty] pairs, or [] if nothing was found
 * within the search budget (dead end - autoDive falls back to pushing
 * straight down, which is fine: it will simply bump the wall and the next
 * recalc tries again from wherever it ends up). */
function planDiveBFS(world, x, y) {
  const startX = Math.floor(x), startY = Math.floor(y);
  const targetDepth = startY + 8;
  const key = (tx, ty) => `${tx},${ty}`;
  const visited = new Set([key(startX, startY)]);
  const parent = new Map();
  const queue = [[startX, startY]];
  let qi = 0;
  let goal = null;
  const BUDGET = 3000;
  while (qi < queue.length && visited.size < BUDGET) {
    const [cx, cy] = queue[qi++];
    if (cy >= targetDepth) { goal = [cx, cy]; break; }
    // Down first so BFS naturally prefers descending routes at equal cost.
    const neigh = [[cx, cy + 1], [cx - 1, cy], [cx + 1, cy], [cx, cy - 1]];
    for (const [nx, ny] of neigh) {
      const k = key(nx, ny);
      if (visited.has(k) || world.isSolid(nx, ny)) continue;
      visited.add(k);
      parent.set(k, [cx, cy]);
      queue.push([nx, ny]);
    }
  }
  if (!goal) return [];
  const path = [];
  let cur = goal;
  while (cur[0] !== startX || cur[1] !== startY) {
    path.push(cur);
    cur = parent.get(key(cur[0], cur[1]));
    if (!cur) break;
  }
  path.reverse();
  return path;
}

function render(alpha, frameMs) {
  const w = canvas.width, h = canvas.height;
  const resident = world.residentChunks();
  renderer.render(w, h, octo, alpha, sim.time, {
    resident,
    pickups: pickups.visible(resident),
    bubbles: decor.visibleBubbles(resident),
    depth: Math.max(0, world.depth() - world.startY),
  });
  debug.tick();
}

const loop = createLoop(step, render);
const debug = createDebugOverlay(debugEl, { loop, input });

loop.start();

function resetWorld(newSeed) {
  seed = newSeed;
  world = createWorld(seed);
  octo = createOctopus(world.startX, world.startY);
  renderer = createRenderer(ctx, world);
  pickups = createPickups();
  decor = createDecor(CHUNK_W, CHUNK_H);
  sim.time = 0;
  if (hudSeedEl) hudSeedEl.textContent = String(seed);
}

// --- Mandatory test hooks (OVERNIGHT.md §2 "Test hooks") ---
window.__octo = {
  state() {
    return {
      time: sim.time,
      input: sim.lastInput,
      octopus: { x: octo.x, y: octo.y, vx: octo.vx, vy: octo.vy, angle: octo.angle, swimming: octo.swimming },
      depth: Math.max(0, world.depth() - world.startY),
      residentChunks: world.residentChunkCount(),
      pickups: { ...pickups.totals },
    };
  },
  step(n) {
    loop.manualStep(n || 1);
    return sim.time;
  },
  input(actions) {
    input.setOverride(actions || null);
  },
  reset(newSeed) {
    resetWorld(newSeed || Math.floor(Math.random() * 1e9));
    return seed;
  },
  metrics() {
    return {
      ...loop.metrics(),
      simTime: sim.time,
      octoSpeed: Math.hypot(octo.vx, octo.vy),
      residentChunks: world.residentChunkCount(),
      depth: Math.max(0, world.depth() - world.startY),
      pickups: { ...pickups.totals },
    };
  },
  spawn(kind, x, y) {
    // No enemies yet (M3). Stub kept so scripted tests can call it early.
    return { kind, x, y, spawned: false, reason: 'not implemented before M3' };
  },
  autoDive(on) {
    autoDiveOn = !!on;
    return { autoDive: autoDiveOn, implemented: true };
  },
};
