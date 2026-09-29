// Octomancer play skeleton: canvas, fixed-step loop, input, test hooks.
// M0 has no game yet -- this wires the foundations M1+ builds on.
import { createLoop, STEP } from './loop.js';
import { createInput } from './input.js';
import { createTouchUI } from './touch-ui.js';
import { createDebugOverlay } from './debug.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const touchRoot = document.getElementById('touch-ui');
const debugEl = document.getElementById('debug-overlay');

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

// --- Minimal simulation state for M0 (no gameplay yet) ---
const sim = {
  time: 0,
  lastInput: { move: { x: 0, y: 0 }, dash: { pressed: false, held: false }, bomb: { pressed: false, held: false }, pause: { pressed: false, held: false } },
};

function step(dt) {
  sim.time += dt;
  sim.lastInput = input.snapshot();
}

function render(alpha, frameMs) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a1c2a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `${16 * dpr}px 'Quicksand', sans-serif`;
  ctx.fillText('Octomancer — foundations (M0)', 16 * dpr, 64 * dpr);
  debug.tick();
}

const loop = createLoop(step, render);
const debug = createDebugOverlay(debugEl, { loop, input });

loop.start();

// --- Mandatory test hooks (OVERNIGHT.md §2 "Test hooks") ---
window.__octo = {
  state() {
    return { time: sim.time, input: sim.lastInput };
  },
  step(n) {
    loop.manualStep(n || 1);
    return sim.time;
  },
  input(actions) {
    input.setOverride(actions || null);
  },
  reset(seed) {
    sim.time = 0;
    return seed;
  },
  metrics() {
    return { ...loop.metrics(), simTime: sim.time };
  },
  spawn(kind, x, y) {
    // No enemies yet (M3). Stub kept so scripted tests can call it early.
    return { kind, x, y, spawned: false, reason: 'not implemented before M3' };
  },
  autoDive(on) {
    // No world yet (M2). Stub.
    return { autoDive: !!on, implemented: false };
  },
};
