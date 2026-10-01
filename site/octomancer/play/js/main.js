// Octomancer play: wires input -> octopus -> world -> camera -> render.
// OVERNIGHT.md §2, M1-3, M2-2 (the fixed M1 test cave is replaced by the
// infinite chunk-streaming world here).
import { createLoop, STEP } from './loop.js';
import { createInput } from './input.js';
import { createTouchUI } from './touch-ui.js';
import { createDebugOverlay } from './debug.js';
import { createWorld } from './world.js';
import { createLevelWorld } from './world-v2.js';
import { fetchBiome1Bank } from './rooms.js';
import { setDefaultBank } from './level.js';
import { createOctopus, stepOctopus, killOctopus } from './octopus.js';
import { createRenderer } from './render.js';
import { screenToWorld } from './camera.js';
import { createPickups } from './pickups.js';
import { createDecor } from './decor.js';
import { isBaked } from './octopus-draw.js';
import { createEnemies, setHpMode } from './enemies.js';
import { createHazards, hazardJournalId } from './hazards.js';
import { drawHazards } from './hazards-draw.js';
import { createLoot, lootJournalId, spreadShells, findSwarmSpots, TRAP_SWARM, LOOT_NAMES } from './loot.js';
import { applyCarried, giveItem, itemJournalId, pickupText } from './items.js';
import { drawLoot } from './loot-draw.js';
import { fetchPatterns, setPatternTable } from './patterns.js';
import { createAutofire } from './autofire.js';
import { createBombs, IDLE_TOSS_X, IDLE_TOSS_Y } from './bomb.js';
import { createProps, PROP_NAMES } from './props.js';
import { createParticles } from './particles.js';
import { createUI } from './ui.js';
import { computeScore } from './score.js';
import { loadBest, recordRun, getJournalIds, saveJournalIds, getTutorialDone, setTutorialDone, recordDive, getBestRuns, getMeta, getShortcut, setShortcut } from './save.js';
import { summaryRows, summaryHeadline, bestRunLines } from './runstats.js';
import {
  createRun, runEvent, levelSpec, levelTitle, stageLabel, isSafeState, nextDiveSeed, gainShells, endDive, BIOME_LEVELS, BIOME_NAME,
  S_HUB, S_TUTORIAL, S_BIOME, S_END, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, EV_CONTINUE, EV_ENTER_SHORTCUT, SHORTCUT_LEVEL,
} from './run.js';
import { parseAuthoredMap, fetchAuthoredMaps } from './authored.js';
import { createJournal, creatureId, itemId, ENTRIES } from './journal.js';
import { createJournalScreen } from './journal-ui.js';
import { hasLineOfSight } from './pathfind.js';
import { drawV2Marks } from './v2-draw.js';
import { drawPocketCracks, drawWallCue, drawQuestSign, drawCritter, drawVaultCache, drawShop, drawRubble, drawDecorBoulders, drawWrecks } from './v2-props-draw.js';
import { generateLevel } from './level.js';
import {
  fetchQuests, planQuest, createQuestState, questOnKill, questOnHurt, questUpdate, questOnExit, questHudText, questSignText,
  Q_RESCUE, Q_VAULT, Q_PEST, ST_DONE, ST_FAILED,
} from './quests.js';
import { fetchShopItems, createShopState, shopStep } from './shop.js';
import { createTutorialState, tutorialStep, tutorialActed } from './tutorial.js';
import { drawContactShadows } from './feel-draw.js';
import { OCTO_IDLE_SINK, SHAKE_HURT_PX, HITSTOP_S, prefersReducedMotion } from './config.js';
import { HEART_MAX, BOMB_RADIUS, SWIM_MAX_SPEED, TRAIL_BUBBLE_PERIOD_MIN, TRAIL_BUBBLE_PERIOD_MAX, DREAD_RANGE } from './config.js';
import { createAudio } from './audio.js';
import { createSfx } from './sfx.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const touchRoot = document.getElementById('touch-ui');
const debugEl = document.getElementById('debug-overlay');
const hudEl = document.getElementById('hud');

const params = new URLSearchParams(location.search);
// without ?seed= every page load gets its own run seed, so the first dive of a session is not always the same three levels
// (v2 only: endless keeps its fixed default seed)
const initialSeed = Number(params.get('seed')) || (params.get('endless') !== '1' ? ((Math.random() * 4294967296) >>> 0) : 0) || 1;
// v2 feel: ?sink=<u/s^2> tunes the idle sink of the octopus (0 = none); junk or negative falls back to the default
const SINK = (() => { const v = params.get('sink'); const n = v === null || v === '' ? NaN : Number(v); return Number.isFinite(n) && n >= 0 && n <= 5 ? n : OCTO_IDLE_SINK; })();
const SEEDED = params.has('seed'); // a seeded run: the level title card shows the seed
// M1-0 combat spike: ?auto=1 turns on enemy hp and Ink Jet auto-fire (js/autofire.js).
const AUTO = params.get('auto') === '1';
if (AUTO) setHpMode(true);
let autofire = AUTO ? createAutofire() : null;
// V2-PLAN M1-4/M1-5 and section 10: ?v2=1 plays the Biome 1 run (hub -> tutorial ->
// Shallows 1-1..1-3 -> end screen, js/run.js) through the single-level world
// (world-v2.js) instead of the endless chunk stream. Without the flag nothing below
// changes. ?at=hub|tutorial|1|2|3|end starts at a given state (tests, review).
const V2 = params.get('endless') !== '1'; // v2 (levels) is the game; ?endless=1 keeps the old endless mode
let authoredJson = null;
let run = null;
let questTable = null;
let shopItems = [];
if (V2) {
  setDefaultBank(await fetchBiome1Bank());
  setPatternTable(await fetchPatterns());
  authoredJson = await fetchAuthoredMaps();
  questTable = await fetchQuests();
  shopItems = await fetchShopItems();
  run = createRun(initialSeed, { tutorialDone: getTutorialDone(), shortcut: getShortcut() });
  const at = params.get('at');
  if (at === 'tutorial') run.state = S_TUTORIAL;
  else if (at === 'end') run.state = S_END;
  else if (at === '1' || at === '2' || at === '3') { run.state = S_BIOME; run.level = Number(at); }
}
function makeWorld(runSeed) {
  if (!V2) return createWorld(runSeed);
  const spec = levelSpec(run);
  if (spec.kind === 'hub') return createLevelWorld(spec.seed, 0, { level: parseAuthoredMap(authoredJson.hub) });
  if (spec.kind === 'tutorial') return createLevelWorld(spec.seed, 0, { level: parseAuthoredMap(authoredJson.tutorial) });
  return createLevelWorld(spec.seed, spec.levelIndex);
}

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

const input = createInput(canvas);
const touchUI = createTouchUI(touchRoot, input, canvas); // the canvas takes the touches (#touch-ui ignores them), so the stick listens there
// Round-8 item 4: the on-screen keyboard/mouse controls hint (ui.js) only
// makes sense on a desktop-style input; hide it on the first touch, show it
// again if the player switches back to keyboard/mouse.
input.onModeChange((mode) => {
  if (mode === 'touch') ui.hideControlsHelp();
  else ui.showControlsHelp();
});

// --- Simulation state ---
let seed = initialSeed;
let world = makeWorld(seed);
let octo = createOctopus(world.startX, world.startY);
if (V2) { octo.feel = true; octo.sink = SINK; }
if (V2) applyCarried(octo, run.items);
let renderer = createRenderer(ctx, world);
let pickups = createPickups();
let decor = createDecor(world.width, world.chunkHeight);
let enemies = createEnemies();
let props = createProps(); // v2: rigid bodies (bombs, loot, falling rocks, rubble); idle in endless mode
let hazards = createHazards(V2 ? props : null);
let loot = createLoot(V2 ? props : null);
let bombs = createBombs(V2 ? props : null);
let particles = createParticles();
let autoDiveOn = false;
let godMode = false; // test hook only (__octo.god): scripted playthroughs ignore enemy contact
let runKills = 0; // enemies killed this run, for score (OVERNIGHT.md M4-1)
let trailTimer = 0; // M7-1: bubble-trail spawn accumulator, rate scaled by speed
let hitStop = 0; // s left of the dash-kill freeze
let dreadLevel = 0; // M7-1/M7-2: Beholder proximity in [0,1], shared by render's dread overlay and audio's drone

// --- Track S: music and code-synth SFX (OVERNIGHT.md §4 S-1) ---
const audio = createAudio();
const sfx = createSfx(audio);
let prevHearts = octo.hearts;
// v2 (round 22): this level's quest and shop, the tutorial assists, and the hub sign's quest preview
let quest = null;
let questClear = null; // {x, y}: enemies within QUEST_CLEAR_R of it are removed after the level's first enemy update
const QUEST_CLEAR_R = 3;
let shopSt = null;
let tutState = createTutorialState();
let hubQuestPlan = null;

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
    if (V2) { v2Event(EV_DEATH); return; }
    resetWorld(Math.floor(Math.random() * 1e9));
    manualPaused = false;
    applyPaused();
    window.dispatchEvent(new CustomEvent('restart'));
  },
  onEndContinue() { v2Event(EV_CONTINUE); },
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

// v2 journal (B1-4): entries persisted through save.js; the list screen opens from the hub board.
const journal = createJournal({ load: getJournalIds, save: saveJournalIds });
const journalScreen = createJournalScreen(hudEl, journal, { onClose() { boardCooldown = true; }, onOpen() { ui.setPrompt(null); }, getStats() { return { meta: getMeta(), bestRuns: getBestRuns() }; } });
let boardCooldown = false; // after closing the journal, swim away from the board before it can open again
function announceJournal() {
  for (const id of journal.takeNew()) {
    const e = ENTRIES.find((x) => x.id === id);
    if (e) ui.showToast('New journal entry: ' + e.name, 2400, true); // queued: never replaces a pickup / shop toast
  }
}
function discover(id) { if (id && journal.discover(id)) announceJournal(); }
function discoverStatePlace() {
  discover(run.state === S_HUB ? 'place-hub' : run.state === S_TUTORIAL ? 'place-tutorial' : run.state === S_BIOME ? 'place-shallows' : null);
}

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
let keyboardSeen = false;
window.addEventListener('keydown', () => { keyboardSeen = true; });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && V2 && journalScreen.isOpen()) { journalScreen.hide(); return; }
  if (e.code !== 'Escape' || octo.dead) return;
  manualPaused = !manualPaused;
  applyPaused();
});

const autoDive = { path: [], recalc: 0 };

// Round-8 item 4: mouse aim. `input.mouse.x/y` are the raw tracked cursor
// position (canvas buffer px, set by input.js's own listeners); turning
// that into the octopus's swim direction needs the octopus's current
// position and the camera, so it's computed here each fixed step (not in
// input.js, which has neither) and handed back via `setMouseAim`.
const MOUSE_FULL_THRUST_DIST = 3; // world units: cursor this far (or further) from the octopus is full thrust, closer scales down

function step(dt) {
  sim.time += dt;
  if (input.mouse.active) {
    const worldAim = screenToWorld(renderer.camera, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
    const dx = worldAim.x - octo.x, dy = worldAim.y - octo.y;
    const dist = Math.hypot(dx, dy);
    const thrust = Math.min(1, dist / MOUSE_FULL_THRUST_DIST);
    input.setMouseAim(dist > 1e-4 ? (dx / dist) * thrust : 0, dist > 1e-4 ? (dy / dist) * thrust : 0);
  }
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

  // v2 states that freeze the simulation: the fade between levels, the journal, the end screen.
  if (V2) {
    if (ui.isEndShown()) { if (snap.dash.pressed) v2Event(EV_CONTINUE); return; }
    if (transitioning || journalScreen.isOpen()) return;
  }

  // Game-over overlay is up: Enter/Z/Shift (the dash keys) or a tap on
  // "Swim again" restarts; Esc/pause button do nothing there (handled by
  // onTogglePause's own `octo.dead` guard).
  if (octo.dead && octo.deathTimer === 0 && octo.gameoverEmitted) {
    if (snap.dash.pressed) {
      ui.hideGameOver();
      if (V2) { v2Event(EV_DEATH); return; }
      resetWorld(Math.floor(Math.random() * 1e9));
      window.dispatchEvent(new CustomEvent('restart'));
    }
    return;
  }
  // hit-stop: a dash kill freezes the whole sim for 60 ms (the enemy's white ghost stays on screen)
  if (hitStop > 0) { hitStop = Math.max(0, hitStop - dt); return; }
  if (godMode && !octo.dead) octo.invulnTimer = Math.max(octo.invulnTimer, 0.5);
  if (V2 && run.state === S_BIOME && !octo.dead) run.dive.time += dt; // the run summary's clock
  if (V2) { // the way a no-direction bomb throw goes: the last swim direction
    if (Math.abs(snap.move.x) > 0.25) octo.throwDir = snap.move.x > 0 ? 1 : -1;
    else if (Math.abs(octo.vx) > 1) octo.throwDir = octo.vx > 0 ? 1 : -1;
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
  if (V2 && !octo.dead) stepV2(snap);
  const resident = world.residentChunks();
  pickups.update(dt, sim.time, octo, resident, world);
  for (const ev of pickups.events) {
    const color = ev.type === 'shell' ? '#ffe38a' : '#9dffd8';
    particles.pickupSparkle(ev.x, ev.y, color);
    if (V2) { discover(itemId(ev.type)); if (ev.type === 'shell') gainShells(run, 1); }
  }
  if (octo.hearts < prevHearts) {
    sfx.hurt();
    if (V2) { questOnHurt(quest); particles.shakeFx(SHAKE_HURT_PX); if (!prefersReducedMotion()) hitStop = Math.max(hitStop, HITSTOP_S); }
  }
  if (V2 && octo.bouncedThisStep) { particles.bouncePuff(octo.bounceX, octo.bounceY, octo.bounceNx, octo.bounceNy); particles.shakeFx(1.5, 0.12); }
  prevHearts = octo.hearts;
  decor.update(dt, resident);
  // v2 hub and tutorial: no enemies, and the Beholder timer never runs
  enemies.update(dt, V2 && isSafeState(run) ? 0 : sim.time, octo, world, resident, V2 ? props : null);
  if (questClear) { // enemies spawn on the first update: keep the quest objective clear of them (silently)
    enemies.despawnNear(questClear.x, questClear.y, QUEST_CLEAR_R);
    questClear = null;
  }
  if (V2) props.step(dt, world, octo, enemies.all()); // sink, bounce, roll; hazards, loot and bombs read their bodies from here
  if (V2 && !isSafeState(run)) {
    hazards.update(dt, sim.time, octo, world, resident);
    for (const ev of hazards.events) {
      if (ev.type === 'rockLanded') particles.bombDebris(ev.x, ev.y);
      else if (ev.type === 'hazardHurt') particles.deathPoof(ev.x, ev.y, ev.kind === 4 ? '#fff58a' : '#cfe8ff');
    }
  }
  if (V2 && !isSafeState(run)) { loot.update(dt, octo, world, resident); handleLootEvents(); }
  if (autofire) autofire.update(dt, octo, world, enemies);
  // M7-2: continuous swim-whoosh and Beholder-drone levels, driven every
  // step (a no-op until the first input creates the audio nodes).
  audio.setSwimIntensity(Math.hypot(octo.vx, octo.vy) / SWIM_MAX_SPEED);
  const beholder = enemies.beholder();
  dreadLevel = beholder ? Math.max(0, 1 - Math.hypot(beholder.x - octo.x, beholder.y - octo.y) / DREAD_RANGE) : 0;
  audio.setBeholderDread(dreadLevel);
  bombs.update(dt, world, octo, enemies);
  for (const ev of bombs.events) {
    if (ev.type !== 'exploded') continue;
    const bd = Math.hypot(ev.x - octo.x, ev.y - octo.y);
    particles.blastBurst(ev.x, ev.y, bd); sfx.bomb();
    if (V2) particles.blastFeel(ev.x, ev.y, bd);
    if (V2 && !isSafeState(run)) { loot.explode(ev.x, ev.y, BOMB_RADIUS); handleLootEvents(); hazards.blast(ev.x, ev.y, BOMB_RADIUS * 2); }
  }
  for (const ev of enemies.events) {
    if (ev.type === 'hitStop') { if (!(V2 && prefersReducedMotion())) hitStop = Math.max(hitStop, ev.dur); continue; }
    if (ev.type !== 'enemyKilled') continue;
    particles.deathPoof(ev.x, ev.y); runKills++;
    if (V2 && !isSafeState(run)) {
      run.dive.kills++;
      // kills drop shells (about 2 in 3) and count for the pest-control quest
      if (killDropRoll(runKills) < 0.67) pickups.dropShell(ev.x, ev.y);
      if (questOnKill(quest, ev.kind)) payQuest();
    }
  }
  particles.update(dt);
  if (snap.bomb.pressed) {
    const aim = V2 ? bombAim(snap) : null;
    let bx = octo.x, by = octo.y;
    if (aim) { // starts half a tile out along the throw, unless that is rock
      const al = Math.hypot(aim.x, aim.y) || 1, ux = aim.x / al, uy = aim.y / al;
      if (!world.isSolid(octo.x + ux * 0.5, octo.y + uy * 0.5)) { bx += ux * 0.5; by += uy * 0.5; }
    }
    if (bombs.place(octo, bx, by, aim) && V2) { discover('item-bomb'); tutorialActed(tutState); }
  }

  const depth = Math.max(0, world.depth() - world.startY);
  liveScore = computeScore(depth, pickups.totals, runKills);

  if (octo.dead && !octo.gameoverEmitted && octo.deathTimer === 0) {
    octo.gameoverEmitted = true;
    const rec = recordRun(liveScore);
    bestScore = rec.best;
    ui.showGameOver(liveScore, bestScore, V2 ? deathDetail() : undefined);
    window.dispatchEvent(new CustomEvent('gameover', { detail: { time: sim.time, score: liveScore, best: bestScore } }));
  }
}
/** v2: the way a bomb is thrown. Mouse: toward the cursor; touch / keyboard: along the stick or move keys (unit
 * vector); with no direction a short toss forward (the last swim direction) and a little down, never up. */
function bombAim(snap) {
  if (snap.mode === 'mouse' && input.mouse.seen) {
    const w = screenToWorld(renderer.camera, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
    const dx = w.x - octo.x, dy = w.y - octo.y, l = Math.hypot(dx, dy);
    if (l > 0.4) return { x: dx / l, y: dy / l };
  }
  const m = snap.move, l = Math.hypot(m.x, m.y);
  if (l > 0.25) return { x: m.x / l, y: m.y / l };
  return { x: (octo.throwDir || 1) * IDLE_TOSS_X, y: IDLE_TOSS_Y };
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
  renderer.render(w, h, octo, alpha, sim.time, frameMs / 1000, {
    resident,
    pickups: pickups.visible(resident),
    bubbles: decor.visibleBubbles(resident),
    critters: decor.visibleCritters(resident),
    depth,
    enemies: enemies.all(),
    shots: enemies.shots(),
    bombs: bombs.list(),
    particles: particles.pool,
    shakeOffset: particles.shakeOffset(),
    shakePx: V2 ? scalePx(particles.shakePx(), dpr) : null,
    preEnemyDraw: V2 && run.state === S_BIOME ? shadowPass : null,
    dreadLevel,
    extraDraw: V2 ? v2Extra : (autofire ? autofire.draw : null),
    lightR: V2 && run.state === S_BIOME ? octo.lightR : 0,
  });
  ui.updateHud({
    hearts: octo.hearts, heartMax: octo.heartMax,
    bombs: octo.bombs,
    depth: Math.round(depth), score: liveScore, best: bestScore,
    stage: V2 ? stageLabel(run) : undefined,
    shells: V2 ? run.shells : undefined,
    items: V2 ? run.items : undefined,
    quest: V2 && loot.chaseLeft() > 0 ? 'Run! The ceiling is falling: ' + Math.ceil(loot.chaseLeft()) + 's' : V2 && quest ? questHudText(quest) : '',
    questState: V2 && loot.chaseLeft() > 0 ? 'failed' : V2 && quest ? (quest.status === ST_DONE ? 'done' : quest.status === ST_FAILED ? 'failed' : '') : '',
  });
  debug.tick();
}

const loop = createLoop(step, render);
const debug = createDebugOverlay(debugEl, { loop, input });

loop.start();
if (V2) showLevelTitle(); // the first level's title card

function resetWorld(newSeed) {
  seed = V2 ? levelSpec(run).seed : newSeed;
  world = makeWorld(seed);
  octo = createOctopus(world.startX, world.startY);
  if (V2) { octo.feel = true; octo.sink = SINK; }
  if (V2) applyCarried(octo, run.items);
  renderer = createRenderer(ctx, world);
  pickups = createPickups();
  decor = createDecor(world.width, world.chunkHeight);
  enemies = createEnemies();
  props = createProps();
  hazards = createHazards(V2 ? props : null);
  loot = createLoot(V2 ? props : null);
  if (AUTO) autofire = createAutofire();
  bombs = createBombs(V2 ? props : null);
  particles = createParticles();
  sim.time = 0;
  runKills = 0;
  liveScore = 0;
  trailTimer = 0;
  hitStop = 0;
  dreadLevel = 0;
  prevHearts = octo.hearts;
  ui.hideGameOver();
  ui.hideEnd();
  ui.setPrompt(null);
  if (V2) setupLevelExtras();
  if (V2) showLevelTitle();
}

// --- v2 run flow (js/run.js): fade, level loading, hub board, prompts, journal discoveries ---
let transitioning = false;
const FADE_MS = 320;
let fadeEl = null;
function ensureFade() {
  if (!fadeEl) {
    fadeEl = document.createElement('div');
    fadeEl.id = 'octo-fade';
    fadeEl.style.cssText = `position:fixed;inset:0;background:#04121c;opacity:0;pointer-events:none;z-index:30;transition:opacity ${FADE_MS}ms ease`;
    document.body.appendChild(fadeEl);
  }
  return fadeEl;
}

/** Apply a run event; on a state change fade out, load the next level, fade in. */
function v2Event(ev) {
  if (!V2 || transitioning) return false;
  const prevState = run.state;
  const carry = { hearts: octo.hearts, bombs: octo.bombs };
  if (!runEvent(run, ev)) return false;
  if (prevState === S_TUTORIAL && ev === EV_EXIT) setTutorialDone(true);
  if (run.state === S_END) {
    // the dive is over: record it, unlock the hub shortcut (persisted), show the summary
    const res = recordDive(run.last);
    setShortcut(true);
    showEndScreen(res.rank);
    return true;
  }
  transitioning = true;
  const fade = ensureFade();
  fade.style.opacity = '1';
  setTimeout(() => {
    resetWorld(0);
    if (run.state === S_BIOME && prevState === S_BIOME) { octo.hearts = carry.hearts; octo.bombs = carry.bombs; prevHearts = octo.hearts; }
    discoverStatePlace();
    window.dispatchEvent(new CustomEvent('restart'));
    fade.style.opacity = '0';
    setTimeout(() => { transitioning = false; }, FADE_MS);
  }, FADE_MS);
  return true;
}

/** Level title card at each level start: "Shallows 1-2", plus the seed on a seeded run (?seed=). */
function showLevelTitle() {
  const t = levelTitle(run, SEEDED);
  if (t) ui.showTitle(t.text, t.sub);
}

/** Run summary shown on the death and biome-clear screens: stats, best runs (this run highlighted), the shortcut note. */
function summaryDetail(sum, rank) {
  return {
    title: sum.cleared ? BIOME_NAME + ' cleared' : 'The dark took you',
    headline: summaryHeadline(sum),
    rows: summaryRows(sum, SEEDED),
    best: bestRunLines(getBestRuns()),
    rank: rank === undefined ? -1 : rank,
    note: sum.shortcutNew ? 'Shortcut unlocked: a new ring in the hub leads to ' + BIOME_NAME + ' 1-' + SHORTCUT_LEVEL : '',
  };
}

/** The octopus just died in a dive: close the dive (cause from octopus.js), record it, return the death screen's detail. */
function deathDetail() {
  if (run.state !== S_BIOME) return undefined;
  const sum = run.dive.over && run.last ? run.last : endDive(run, false, octo.cause);
  return summaryDetail(sum, recordDive(sum).rank);
}

/** The biome-clear screen. `rank` is the finished run's place in the best-runs list (undefined: not recorded here). */
function showEndScreen(rank) {
  const sum = run.last || endDive(run, true); // ?at=end has no real dive behind it
  ui.showEnd(BIOME_NAME + ' cleared', summaryHeadline(sum), summaryDetail(sum, rank));
}

const SEE_RANGE = 9; // tiles: a creature this close in line of sight counts as seen
let seeTick = 0;
function wallIntact(lv) {
  for (let i = 0; i < lv.walls.length; i += 2) if (world.tileAt(lv.walls[i], lv.walls[i + 1]) !== 0) return true;
  return false;
}
const solidForSight = (tx, ty) => world.isSolid(tx, ty);

/** v2 per-step logic after the octopus moved: exit, hub board, prompts, sightings. */
function stepV2(snap) {
  const lv = world.level;
  if (run.state === S_BIOME) {
    if (questUpdate(quest, octo, world)) payQuest();
    const ev = shopStep(shopSt, octo, run.shells, STEP, run.items);
    if (ev) onShopEvent(ev);
    if (shopSt && (seeTick & 15) === 0 && Math.hypot(octo.x - shopSt.keeperX, octo.y - shopSt.keeperY) < 9) discover('place-shop');
  }
  if (world.reachedExit(octo.x, octo.y)) {
    if (run.state === S_BIOME && questOnExit(quest)) payQuest();
    v2Event(run.state === S_HUB ? EV_ENTER_DIVE : EV_EXIT);
    return;
  }
  if (run.state === S_HUB && run.shortcut && lv.shortcutX >= 0 && Math.hypot(octo.x - (lv.shortcutX + 0.5), octo.y - (lv.shortcutY + 0.5)) < 1.2) {
    v2Event(EV_ENTER_SHORTCUT);
    return;
  }
  if (lv.signX !== undefined && lv.signX >= 0) {
    const d = Math.hypot(octo.x - (lv.signX + 0.5), octo.y - (lv.signY + 0.5));
    if (d < 2.6) { ui.setPrompt('Quest board: next dive', hubQuestPlan ? questSignText(hubQuestPlan) : 'No quest yet.'); return; }
  }
  if (lv.boardX >= 0) {
    const d = Math.hypot(octo.x - (lv.boardX + 0.5), octo.y - (lv.boardY + 0.5));
    if (d > 2.2) boardCooldown = false;
    else if (d < 1.2 && !boardCooldown) { octo.vx = octo.vy = 0; journalScreen.show(); ui.setPrompt(null); return; }
  }
  if (lv.prompts && lv.prompts.length) {
    let best = null, bd = 1e9;
    for (const p of lv.prompts) {
      const d = Math.hypot(octo.x - p.x, octo.y - p.y);
      if (d < p.r && d < bd) { best = p; bd = d; }
    }
    const touchy = snap.mode === 'touch' || (!keyboardSeen && snap.mode === 'keyboard' && isCoarsePointer());
    // tutorial: bombs never run out while the wall stands, and an idle player gets the bomb hint back
    if (run.state === S_TUTORIAL) {
      tutorialStep(tutState, octo, wallIntact(lv), STEP);
      if (tutState.hint) { const bp = lv.prompts.find((p) => p.refillBomb); if (bp) best = bp; }
    }
    ui.setPrompt(best ? best.title : null, best ? (touchy ? best.touch : best.desktop) : '');
  } else ui.setPrompt(null);
  if ((seeTick & 7) === 0 && run.state === S_BIOME) {
    for (const hk of hazards.seen(octo.x, octo.y, SEE_RANGE, solidForSight)) discover(hazardJournalId(hk));
  }
  if ((seeTick & 7) === 4 && run.state === S_BIOME) {
    for (const lk of loot.seen(octo.x, octo.y, SEE_RANGE, solidForSight)) discover(lootJournalId(lk));
  }
  if ((seeTick++ & 7) === 0) {
    for (const e of enemies.all()) {
      if (e.dead) continue;
      const id = creatureId(e.kind);
      if (!id || journal.has(id)) continue;
      if (Math.hypot(e.x - octo.x, e.y - octo.y) < SEE_RANGE && hasLineOfSight(solidForSight, octo.x, octo.y, e.x, e.y)) discover(id);
    }
  }
}

// r36: the level's decor boulders (pattern table), flattened once per level: x, y, dy, seed
let boulderLevel = null, boulderList = null;
function decorBoulders(lv) {
  if (boulderLevel === lv) return boulderList;
  boulderLevel = lv;
  const out = [];
  const chunk = world.residentChunks()[0] && world.residentChunks()[0].chunk;
  if (chunk && chunk.spawns) for (const s of chunk.spawns) if (s.type === 'decor' && s.dk === 'boulder') out.push(s.x, s.y, s.dy, (Math.floor(s.x) * 7 + Math.floor(s.y) * 13) % 97);
  boulderList = Float32Array.from(out);
  return boulderList;
}

// r37: the wreck set piece's hull(s): x, y (floor line), flip per wreck
let wreckLevel = null, wreckList = null;
function decorWrecks(lv) {
  if (wreckLevel === lv) return wreckList;
  wreckLevel = lv;
  const out = [];
  const chunk = world.residentChunks()[0] && world.residentChunks()[0].chunk;
  if (chunk && chunk.spawns) for (const s of chunk.spawns) if (s.type === 'decor' && s.dk === 'wreck') out.push(s.x, s.y, s.dx);
  wreckList = Float32Array.from(out);
  return wreckList;
}

function scalePx(p, k) { return p.x === 0 && p.y === 0 ? p : { x: p.x * k, y: p.y * k }; }
function shadowPass(c, camera, cw, ch) { drawWrecks(c, camera, cw, ch, decorWrecks(world.level), sim.time); drawContactShadows(c, camera, cw, ch, props.data, enemies.all(), world.isSolid); }
function v2Extra(c, camera, w2s, cw, ch) {
  const lv = world.level;
  drawV2Marks(c, camera, cw, ch, {
    exitX: lv.exitX, exitY: lv.exitY, tileAt: world.tileAt,
    boardX: lv.boardX === undefined ? -1 : lv.boardX, boardY: lv.boardY === undefined ? -1 : lv.boardY,
    label: run.state === S_HUB ? 'Dive' : '',
    shortcutX: run.state === S_HUB && run.shortcut && lv.shortcutX !== undefined ? lv.shortcutX : -1, shortcutY: lv.shortcutY,
    shortcutLabel: BIOME_NAME + ' 1-' + SHORTCUT_LEVEL,
  }, sim.time);
  const t = sim.time;
  if (run.state === S_TUTORIAL && lv.walls && lv.walls.length) {
    drawWallCue(c, camera, cw, ch, { walls: lv.walls, tileAt: world.tileAt, attention: tutState.hint ? 1 : 0 }, t);
  }
  if (lv.signX !== undefined && lv.signX >= 0) drawQuestSign(c, camera, cw, ch, lv.signX, lv.signY, t);
  drawRubble(c, camera, cw, ch, props.data);
  if (run.state === S_BIOME) {
    if (world.level.nPockets) drawPocketCracks(c, camera, cw, ch, world.level.pockets, world.level.nPockets, world.tileAt);
    drawDecorBoulders(c, camera, cw, ch, decorBoulders(lv), world.tileAt);
    drawLoot(c, camera, cw, ch, loot.data, t);
    drawHazards(c, camera, cw, ch, hazards.data, t, solidForSight);
    if (shopSt) drawShop(c, camera, cw, ch, shopSt, run.shells, t, world.tileAt);
    if (quest && quest.status === 0 && quest.plan.kindId === Q_RESCUE) drawCritter(c, camera, cw, ch, quest.cx, quest.cy, quest.following, t);
    if (quest && quest.plan && quest.plan.kindId === Q_VAULT) drawVaultCache(c, camera, cw, ch, quest.plan.pos[0], quest.plan.pos[1], t, quest.collected);
  }
  if (autofire) autofire.draw(c, camera, w2s, cw, ch);
}

// --- round 31: loot and secrets (js/loot.js) ---
function dropShells(n, x, y) {
  for (const p of spreadShells(n, x, y, solidForSight)) pickups.dropShell(p.x, p.y, p.vx, p.vy);
}
/** A carried item found in a chest or pocket: take it (journal, toast); a repeat of a one-of item turns into shells. */
function takeCarried(id, x, y) {
  if (!id) return;
  if (giveItem(run.items, octo, id)) {
    discover(itemJournalId(id));
    ui.showToast('Found ' + pickupText(id));
  } else {
    gainShells(run, 3);
    ui.showToast('Already carried: +3 shells');
  }
  particles.pickupSparkle(x, y, '#fff2a0'); sfx.chime();
}
function handleLootEvents() {
  for (const ev of loot.takeEvents()) {
    switch (ev.type) {
      case 'break':
        particles.bombDebris(ev.x, ev.y); sfx.bomb();
        dropShells(ev.shells, ev.x, ev.y);
        discover(lootJournalId(ev.lk));
        break;
      case 'chest':
        particles.pickupSparkle(ev.x, ev.y - 0.3, '#ffe38a'); sfx.chime();
        dropShells(ev.shells, ev.x, ev.y - 0.4);
        discover('loot-chest');
        if (ev.carry) takeCarried(ev.carry, ev.x, ev.y - 0.3);
        if (ev.trap) ui.showToast('It was trapped!');
        break;
      case 'trap':
        if (ev.trap === TRAP_SWARM) {
          // the swarm bursts out in clear water above the chest, not inside the dip's rock
          for (const p of findSwarmSpots(solidForSight, ev.x, ev.y + 0.3, ev.n)) enemies.spawnAt('piranha', p.x, p.y, 'open', 0);
        } else { particles.bombDebris(ev.x, ev.y); sfx.hurt(); }
        break;
      case 'pocket':
        particles.bombDebris(ev.x, ev.y);
        if (ev.shells) dropShells(ev.shells, ev.x, ev.y);
        discover('loot-pocket');
        ui.showToast('A hidden pocket!');
        break;
      case 'item':
        if (ev.carry) { takeCarried(ev.carry, ev.x, ev.y); break; }
        particles.pickupSparkle(ev.x, ev.y, ev.item === 2 ? '#ff8a9a' : '#cfe8ff'); sfx.chime();
        discover('item-' + (ev.item === 2 ? 'heart' : 'bomb'));
        break;
      case 'relic':
        gainShells(run, ev.shells);
        particles.pickupSparkle(ev.x, ev.y, '#ffe38a'); sfx.chime();
        discover('loot-relic');
        ui.showToast('Relic taken, +' + ev.shells + ' shells. The ceiling is coming down!', 4200);
        break;
      case 'chaseEnd': ui.showToast('The rumbling stops'); break;
      case 'rockLanded': particles.bombDebris(ev.x, ev.y); break;
      case 'hurt': particles.deathPoof(ev.x, ev.y, '#d9cdb8'); break;
      default: break;
    }
  }
}

// --- round 22: quests, shops, shells ---
function killDropRoll(n) {
  let h = Math.imul((n + 1) >>> 0, 2654435761) ^ Math.imul(seed >>> 0, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Roll and place this level's quest and shop (Shallows levels only) and refresh the hub sign preview. */
function setupLevelExtras() {
  quest = null; shopSt = null; tutState = createTutorialState(); hubQuestPlan = null;
  if (run.state === S_BIOME) {
    const spec = levelSpec(run);
    const plan = planQuest(world.level, questTable, spec.seed, spec.levelIndex);
    quest = createQuestState(plan);
    if (plan && (plan.kindId === Q_RESCUE || plan.kindId === Q_VAULT)) questClear = { x: plan.pos[0], y: plan.pos[1] };
    if (plan && plan.kindId === Q_PEST) for (let i = 0; i < plan.pos.length; i += 2) enemies.spawnAt('piranha', plan.pos[i], plan.pos[i + 1], 'open', 0);
    shopSt = createShopState(world.level.shop, shopItems, spec.seed, spec.levelIndex, run.items);
  } else if (run.state === S_HUB) {
    // the sign shows the quest of the next dive's first level: the same plan that level will roll
    const ns = nextDiveSeed(run);
    hubQuestPlan = planQuest(generateLevel(ns, 0), questTable, ns, 0);
  }
}

function payQuest() {
  const p = quest.plan;
  gainShells(run, p.reward);
  run.dive.quests++;
  ui.showToast('Quest complete: ' + p.name + ', +' + p.reward + ' shells');
  sfx.chime();
  particles.pickupSparkle(octo.x, octo.y, '#ffe38a');
  if (p.journal) discover(p.journal);
}

function onShopEvent(ev) {
  if (ev.type === 'bought') {
    run.shells = ev.shells;
    ui.showToast('Bought ' + ev.item.name + ' for ' + ev.price + ' shells' + (ev.item.effect === 'carry' ? ', ' + ev.item.blurb : ''));
    sfx.chime();
    particles.pickupSparkle(octo.x, octo.y, '#ffe38a');
    if (ev.item.journal) discover(ev.item.journal); // after the toast: the journal line queues behind 'Bought ...'
  } else if (ev.type === 'poor') {
    ui.showToast(ev.item.name + ' costs ' + ev.price + ' shells, you have ' + ev.shells);
  } else {
    ui.showToast(ev.item.effect === 'carry' ? 'You cannot carry more of those' : ev.item.effect === 'heart' ? 'Your hearts are already full' : 'You cannot carry more bombs');
  }
}

if (V2) {
  ui.setGameOverLabels('The dark took you', 'Back to the hub');
  setupLevelExtras();
  discoverStatePlace();
  if (run.state === S_END) showEndScreen();
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
        heartMax: octo.heartMax, bombMax: octo.bombMax, swimMul: octo.swimMul, lightR: octo.lightR, magnetR: octo.magnetR,
      },
      depth: Math.max(0, world.depth() - world.startY),
      residentChunks: world.residentChunkCount(),
      // Round-8 item 5: exposed for the look-ahead camera's own real-rAF-
      // frame verification (see NIGHT-LOG.md); harmless outside tests.
      camera: { x: renderer.camera.x, y: renderer.camera.y, ppu: renderer.camera.pxPerUnit },
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
  spawn(kind, x, y, placement, wallDir) {
    const e = enemies.spawnAt(kind, x, y, placement, wallDir);
    return { kind, x, y, spawned: true, id: e.id };
  },
  placeBomb(x, y, ax, ay) {
    return bombs.place(octo, x != null ? x : octo.x, y != null ? y : octo.y, ax || ay ? { x: ax || 0, y: ay || 0 } : null);
  },
  /** v2: the physics props (kind name, position, velocity, state) for tests and review. */
  props() {
    const d = props.data, out = [];
    for (let i = 0; i < d.n; i++) if (d.alive[i]) out.push({ i, kind: PROP_NAMES[d.kind[i]], x: d.x[i], y: d.y[i], vx: d.vx[i], vy: d.vy[i], r: d.radius[i], state: d.state[i], timer: d.timer[i] });
    return out;
  },
  /** Enemies (kind, position, pattern state, telegraph, stun) and shots, for tests and review. */
  enemies() {
    return enemies.all().filter((e) => !e.ghost).map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, vx: e.vx, vy: e.vy, st: e.st, t: e.t, tell: e.tell, stun: e.stun, placement: e.placement, face: e.face, dir: e.dir, aim: e.aim, dead: e.dead }));
  },
  shots() { return enemies.shots().map((s) => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy })); },
  auto() { return autofire ? { ...autofire.stats } : null; },
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
  kill(cause) {
    // Force game over, for scripted checks of the overlay/restart without
    // waiting on an enemy or the Beholder.
    killOctopus(octo, cause);
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
  /** Debug: place the octopus (tests, screenshots). */
  teleport(x, y) {
    octo.x = octo.prevX = x; octo.y = octo.prevY = y; octo.vx = octo.vy = 0;
    return { x, y };
  },
  /** v2 only: level info for tests/review. */
  level() {
    if (!V2) return null;
    const l = world.level;
    return {
      levelIndex: levelSpec(run).levelIndex, seed, startX: world.startX, startY: world.startY, exitX: world.exitX, exitY: world.exitY,
      w: world.width, h: world.height, run: { ...run }, stage: stageLabel(run), boardX: world.level.boardX === undefined ? -1 : world.level.boardX, boardY: world.level.boardY === undefined ? -1 : world.level.boardY,
      prompts: world.level.prompts || [], walls: world.level.walls ? Array.from(world.level.walls) : [], transitioning,
      tiles: Array.from(l.tiles), setPieces: l.setPieces ? Array.from(l.setPieces.subarray(0, (l.nSetPieces || 0) * 4)) : [], fallback: l.fallback, bankFallback: l.bankFallback || 0,
      bands: renderer.wallBandStats(), bandRows: world.bandRows, bandCount: world.bandCount(), journalOpen: journalScreen.isOpen(), endShown: ui.isEndShown(),
    };
  },
  /** v2: journal ids found, open the journal, apply a run event by name (tests, review). */
  journal() { return { found: journal.list().filter((e) => e.found).map((e) => e.id), count: journal.count(), open: journalScreen.isOpen() }; },
  openJournal() { journalScreen.show(); return true; },
  closeJournal() { journalScreen.hide(); return true; },
  /** v2: quest / shop / wallet snapshot for tests and review. */
  extras() {
    return {
      shells: run ? run.shells : 0,
      items: run ? run.items.slice() : [],
      quest: quest ? { id: quest.plan.id, status: quest.status, progress: quest.progress, goal: quest.goal, following: quest.following, pos: Array.from(quest.plan.pos), hud: questHudText(quest) } : null,
      shop: shopSt ? { keeper: [shopSt.keeperX, shopSt.keeperY], px: Array.from(shopSt.px), stock: Array.from(shopSt.stock, (i) => shopSt.items[i].id), sold: Array.from(shopSt.sold) } : null,
      signQuest: hubQuestPlan ? hubQuestPlan.id : null,
      pockets: world.level.nPockets ? Array.from(world.level.pockets) : [],
    };
  },
  /** v2: the hazards of this level (kind code, position, state) for tests and review. */
  hazards() {
    const d = hazards.data, out = [];
    for (let i = 0; i < d.n; i++) out.push({ kind: d.kind[i], x: d.x[i], y: d.y[i], dx: d.dx[i], dy: d.dy[i], len: d.len[i], state: d.state[i], a: d.a[i], b: d.b[i], t: d.t[i], r: d.r[i] });
    return out;
  },
  /** v2: the loot of this level (kind name, position, state) for tests and review. */
  loot() {
    const d = loot.data, out = [];
    for (let i = 0; i < d.n; i++) out.push({ kind: LOOT_NAMES[d.kind[i]], x: d.x[i], y: d.y[i], state: d.state[i], count: d.count[i], aux: d.aux[i] });
    return { items: out, chase: loot.chaseLeft(), rocks: d.nr };
  },
  /** Test hook: no contact damage while on (scripted whole-run playthroughs). */
  god(on) { godMode = on == null ? !godMode : !!on; return godMode; },
  /** Test hook: carry an item as if it had been found (items.js). */
  giveItem(id) { return run ? giveItem(run.items, octo, id) : false; },
  giveShells(n) { if (run) gainShells(run, n | 0); return run ? run.shells : 0; },
  runEvent(name) {
    const ev = { enter: EV_ENTER_DIVE, exit: EV_EXIT, death: EV_DEATH, continue: EV_CONTINUE, shortcut: EV_ENTER_SHORTCUT }[name];
    return v2Event(ev);
  },
  audio() {
    return { started: audio.isStarted(), muted: audio.isMuted(), track: audio.currentTrack() };
  },
};
