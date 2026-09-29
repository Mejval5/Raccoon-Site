// Octomancer play: wires input -> octopus -> world -> camera -> render.
// OVERNIGHT.md §2, M1-3, M2-2 (the fixed M1 test cave is replaced by the
// infinite chunk-streaming world here).
import { createLoop, STEP } from './loop.js';
import { createInput } from './input.js';
import { createTouchUI } from './touch-ui.js';
import { createDebugOverlay } from './debug.js';
import { createWorld } from './world.js';
import { createOctopus, stepOctopus, killOctopus } from './octopus.js';
import { createRenderer } from './render.js';
import { createPickups } from './pickups.js';
import { createDecor } from './decor.js';
import { CHUNK_H, CHUNK_W } from './gen.js';
import { isBaked } from './octopus-draw.js';
import { createEnemies } from './enemies.js';
import { createBombs } from './bomb.js';
import { createParticles } from './particles.js';
import { createUI } from './ui.js';
import { computeScore } from './score.js';
import { loadBest, recordRun } from './save.js';
import { HEART_MAX, SWIM_MAX_SPEED, TRAIL_BUBBLE_PERIOD_MIN, TRAIL_BUBBLE_PERIOD_MAX, DREAD_RANGE } from './config.js';
import { createAudio } from './audio.js';
import { createSfx } from './sfx.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const touchRoot = document.getElementById('touch-ui');
const debugEl = document.getElementById('debug-overlay');
const hudEl = document.getElementById('hud');

const params = new URLSearchParams(location.search);
const initialSeed = Number(params.get('seed')) || 1;

let dpr = 1;
// M7-3 perf pass: "DPR step-down to 1.0 if median > 20ms for 2s". Once
// tripped this stays down for the rest of the run (a device that's this
// slow once will be again); `resize()` re-applies it on every orientation
// change/resize too, not just at the moment it trips.
let dprForcedDown = false;
function isCoarsePointer() {
  return matchMedia('(pointer: coarse)').matches;
}
function resize() {
  const cap = dprForcedDown ? 1 : (isCoarsePointer() ? 1.5 : 2);
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
let enemies = createEnemies();
let bombs = createBombs();
let particles = createParticles();
let autoDiveOn = false;
let runKills = 0; // enemies killed this run, for score (OVERNIGHT.md M4-1)
let trailTimer = 0; // M7-1: bubble-trail spawn accumulator, rate scaled by speed
let dreadLevel = 0; // M7-1/M7-2: Beholder proximity in [0,1], shared by render's dread overlay and audio's drone

// --- Track S: music and code-synth SFX (OVERNIGHT.md §4 S-1) ---
const audio = createAudio();
const sfx = createSfx(audio);
let prevHearts = octo.hearts;
let prevPearls = pickups.totals.pearls;

const sim = {
  time: 0,
  lastInput: { move: { x: 0, y: 0 }, dash: { pressed: false, held: false }, bomb: { pressed: false, held: false }, pause: { pressed: false, held: false } },
};

// --- M4-1: score, game over, restart, best, pause ---
let bestScore = loadBest().best;
let liveScore = 0;

const ui = createUI(hudEl, {
  muted: audio.isMuted(),
  onRestart() {
    ui.hideGameOver();
    resetWorld(Math.floor(Math.random() * 1e9));
    manualPaused = false;
    applyPaused();
    window.dispatchEvent(new CustomEvent('restart'));
  },
  onExit() {
    location.href = '/octomancer/';
  },
  onTogglePause() {
    if (octo.dead) return; // no pausing over the game-over overlay
    manualPaused = !manualPaused;
    applyPaused();
  },
  onToggleMute() {
    return audio.toggleMute();
  },
});

// Manual (Esc/button) and automatic (hidden tab/blur) pause are tracked
// separately and combined, so a window focus event can never silently
// override a pause the player asked for.
let manualPaused = false;
let autoPaused = false;
function applyPaused() {
  const wasPaused = loop.paused;
  const isPaused = manualPaused || autoPaused;
  if (isPaused === wasPaused) { if (isPaused) ui.showPause(); else ui.hidePause(); return; }
  loop.setPaused(isPaused);
  if (isPaused) { ui.showPause(); window.dispatchEvent(new CustomEvent('pause')); }
  else { ui.hidePause(); window.dispatchEvent(new CustomEvent('resume')); }
}
document.addEventListener('visibilitychange', () => { autoPaused = document.hidden; applyPaused(); });
window.addEventListener('blur', () => { autoPaused = true; applyPaused(); });
window.addEventListener('focus', () => { if (!document.hidden) { autoPaused = false; applyPaused(); } });

// Esc toggles pause directly (not routed through step()'s input snapshot:
// the fixed-step loop stops calling step() at all while paused, so a
// pause-driven "unpause" check inside step() would never run again).
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || octo.dead) return;
  manualPaused = !manualPaused;
  applyPaused();
});

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

  // Game-over overlay is up: Enter/Z/Shift (the dash keys) or a tap on
  // "Swim again" restarts; Esc/pause button do nothing there (handled by
  // onTogglePause's own `octo.dead` guard).
  if (octo.dead && octo.deathTimer === 0 && octo.gameoverEmitted) {
    if (snap.dash.pressed) {
      ui.hideGameOver();
      resetWorld(Math.floor(Math.random() * 1e9));
      window.dispatchEvent(new CustomEvent('restart'));
    }
    return;
  }
  stepOctopus(octo, snap, dt, world);
  if (octo.dashedThisStep) {
    sfx.dash();
    particles.dashInk(octo.x, octo.y, (octo.angle * Math.PI) / 180);
  }
  // M7-1: bubble trail scaled by speed - faster swimming spawns bubbles more
  // often (TRAIL_BUBBLE_PERIOD_MIN..MAX in config.js), none at rest.
  if (!octo.dead) {
    const speed = Math.hypot(octo.vx, octo.vy);
    const speedFrac = Math.min(1, speed / SWIM_MAX_SPEED);
    trailTimer -= dt;
    if (speedFrac > 0.05 && trailTimer <= 0) {
      trailTimer = TRAIL_BUBBLE_PERIOD_MAX - (TRAIL_BUBBLE_PERIOD_MAX - TRAIL_BUBBLE_PERIOD_MIN) * speedFrac;
      particles.trailBubble(octo.x, octo.y);
    }
  }
  world.update(octo.y);
  const resident = world.residentChunks();
  pickups.update(dt, sim.time, octo, resident);
  for (const ev of pickups.events) {
    const color = ev.type === 'pearl' ? '#dff3ff' : ev.type === 'shell' ? '#ffe38a' : '#9dffd8';
    particles.pickupSparkle(ev.x, ev.y, color);
  }
  if (pickups.totals.pearls > prevPearls) sfx.pearl();
  prevPearls = pickups.totals.pearls;
  if (octo.hearts < prevHearts) sfx.hurt();
  prevHearts = octo.hearts;
  decor.update(dt, resident);
  enemies.update(dt, sim.time, octo, world, resident);
  // M7-2: continuous swim-whoosh and Beholder-drone levels, driven every
  // step (a no-op until the first input creates the audio nodes).
  audio.setSwimIntensity(Math.hypot(octo.vx, octo.vy) / SWIM_MAX_SPEED);
  const beholder = enemies.beholder();
  dreadLevel = beholder ? Math.max(0, 1 - Math.hypot(beholder.x - octo.x, beholder.y - octo.y) / DREAD_RANGE) : 0;
  audio.setBeholderDread(dreadLevel);
  bombs.update(dt, world, octo, enemies);
  for (const ev of bombs.events) if (ev.type === 'exploded') { particles.bombDebris(ev.x, ev.y); sfx.bomb(); }
  for (const ev of enemies.events) if (ev.type === 'enemyKilled') { particles.deathPoof(ev.x, ev.y); runKills++; }
  particles.update(dt);
  if (snap.bomb.pressed) bombs.place(octo, octo.x, octo.y);

  const depth = Math.max(0, world.depth() - world.startY);
  liveScore = computeScore(depth, pickups.totals, runKills);

  if (octo.dead && !octo.gameoverEmitted && octo.deathTimer === 0) {
    octo.gameoverEmitted = true;
    const rec = recordRun(liveScore);
    bestScore = rec.best;
    ui.showGameOver(liveScore, bestScore);
    window.dispatchEvent(new CustomEvent('gameover', { detail: { time: sim.time, score: liveScore, best: bestScore } }));
  }
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

let overBudgetSince = 0; // performance.now() timestamp, 0 = not currently over budget
function checkPerfStepDown() {
  if (dprForcedDown) return;
  const m = loop.metrics();
  if (m.samples < 30) return; // not enough of a window yet to judge
  const now = performance.now();
  if (m.frameMsMedian > 20) {
    if (!overBudgetSince) overBudgetSince = now;
    else if (now - overBudgetSince > 2000) {
      dprForcedDown = true;
      resize();
    }
  } else {
    overBudgetSince = 0;
  }
}

function render(alpha, frameMs) {
  checkPerfStepDown();
  const w = canvas.width, h = canvas.height;
  const resident = world.residentChunks();
  const depth = Math.max(0, world.depth() - world.startY);
  renderer.render(w, h, octo, alpha, sim.time, {
    resident,
    pickups: pickups.visible(resident),
    bubbles: decor.visibleBubbles(resident),
    depth,
    enemies: enemies.all(),
    shots: enemies.shots(),
    bombs: bombs.list(),
    particles: particles.pool,
    shakeOffset: particles.shakeOffset(),
    dreadLevel,
  });
  ui.updateHud({
    hearts: octo.hearts, heartMax: HEART_MAX,
    bombs: octo.bombs, pearls: pickups.totals.pearls,
    depth: Math.round(depth), score: liveScore, best: bestScore,
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
  enemies = createEnemies();
  bombs = createBombs();
  particles = createParticles();
  sim.time = 0;
  runKills = 0;
  liveScore = 0;
  trailTimer = 0;
  dreadLevel = 0;
  prevHearts = octo.hearts;
  prevPearls = pickups.totals.pearls;
  ui.hideGameOver();
}

// --- Mandatory test hooks (OVERNIGHT.md §2 "Test hooks") ---
window.__octo = {
  state() {
    return {
      time: sim.time,
      input: sim.lastInput,
      octopus: {
        x: octo.x, y: octo.y, vx: octo.vx, vy: octo.vy, angle: octo.angle, swimming: octo.swimming,
        hearts: octo.hearts, invulnTimer: octo.invulnTimer, dead: octo.dead, bombs: octo.bombs,
      },
      depth: Math.max(0, world.depth() - world.startY),
      residentChunks: world.residentChunkCount(),
      pickups: { ...pickups.totals },
      enemyCount: enemies.count(),
      beholder: enemies.beholder() ? { x: enemies.beholder().x, y: enemies.beholder().y } : null,
      score: liveScore,
      best: bestScore,
      paused: loop.paused,
      gameOverShown: ui.isGameOverShown(),
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
      octoBaked: isBaked(),
      enemyCount: enemies.count(),
      dpr,
      dprForcedDown,
    };
  },
  spawn(kind, x, y, placement) {
    const e = enemies.spawnAt(kind, x, y, placement);
    return { kind, x, y, spawned: true, id: e.id };
  },
  placeBomb(x, y) {
    return bombs.place(octo, x != null ? x : octo.x, y != null ? y : octo.y);
  },
  autoDive(on) {
    autoDiveOn = !!on;
    return { autoDive: autoDiveOn, implemented: true };
  },
  // --- M4-1: manual test hooks for score/pause/restart, not in the
  // OVERNIGHT.md §2 mandatory list but handy for the same kind of scripted
  // verification (kept minimal, alongside `state()`'s paused/score fields).
  pause(on) {
    manualPaused = on == null ? !manualPaused : !!on;
    applyPaused();
    return loop.paused;
  },
  kill() {
    // Force game over, for scripted checks of the overlay/restart without
    // waiting on an enemy or the Beholder.
    killOctopus(octo);
    octo.deathTimer = 0; // skip the 1s ink-burst wait for the test
    return true;
  },
  restart() {
    resetWorld(Math.floor(Math.random() * 1e9));
    manualPaused = false;
    applyPaused();
    window.dispatchEvent(new CustomEvent('restart'));
    return seed;
  },
  audio() {
    return { started: audio.isStarted(), muted: audio.isMuted(), track: audio.currentTrack() };
  },
};
