// Octomancer play: wires input -> octopus -> camera -> render for the fixed
// M1 test cave. OVERNIGHT.md §2, M1-3.
import { createLoop, STEP } from './loop.js';
import { createInput } from './input.js';
import { createTouchUI } from './touch-ui.js';
import { createDebugOverlay } from './debug.js';
import { createTestCave } from './world.js';
import { createOctopus, stepOctopus } from './octopus.js';
import { createRenderer } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const touchRoot = document.getElementById('touch-ui');
const debugEl = document.getElementById('debug-overlay');
const hudEl = document.getElementById('hud');

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
let world = createTestCave();
let octo = createOctopus(world.startX, world.startY);
const renderer = createRenderer(ctx, world);

const sim = {
  time: 0,
  lastInput: { move: { x: 0, y: 0 }, dash: { pressed: false, held: false }, bomb: { pressed: false, held: false }, pause: { pressed: false, held: false } },
};

// HUD placeholder (M4 builds the real HUD); shows the octopus is alive here.
hudEl.innerHTML = '<div id="hud-placeholder" style="position:absolute;left:calc(12px + var(--safe-l));top:calc(8px + var(--safe-t));color:#baffea;font:600 13px \'Quicksand\',sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);">Octomancer &mdash; swim test</div>';

function step(dt) {
  sim.time += dt;
  const snap = input.snapshot();
  sim.lastInput = snap;
  stepOctopus(octo, snap, dt, world);
}

function render(alpha, frameMs) {
  const w = canvas.width, h = canvas.height;
  renderer.render(w, h, octo, alpha, sim.time);
  debug.tick();
}

const loop = createLoop(step, render);
const debug = createDebugOverlay(debugEl, { loop, input });

loop.start();

// --- Mandatory test hooks (OVERNIGHT.md §2 "Test hooks") ---
window.__octo = {
  state() {
    return {
      time: sim.time,
      input: sim.lastInput,
      octopus: { x: octo.x, y: octo.y, vx: octo.vx, vy: octo.vy, angle: octo.angle, swimming: octo.swimming },
    };
  },
  step(n) {
    loop.manualStep(n || 1);
    return sim.time;
  },
  input(actions) {
    input.setOverride(actions || null);
  },
  reset(seed) {
    world = createTestCave();
    octo = createOctopus(world.startX, world.startY);
    sim.time = 0;
    return seed;
  },
  metrics() {
    return { ...loop.metrics(), simTime: sim.time, octoSpeed: Math.hypot(octo.vx, octo.vy) };
  },
  spawn(kind, x, y) {
    // No enemies yet (M3). Stub kept so scripted tests can call it early.
    return { kind, x, y, spawned: false, reason: 'not implemented before M3' };
  },
  autoDive(on) {
    // No infinite world yet (M2). Stub.
    return { autoDive: !!on, implemented: false };
  },
};
