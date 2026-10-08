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
import { createOctopus, stepOctopus, killOctopus, addBomb } from './octopus.js';
import { createRenderer } from './render.js';
import { screenToWorld, worldToScreen } from './camera.js';
import { drawBlackHole, farCorner } from './blackhole.js';
import { createPickups } from './pickups.js';
import { createDecor } from './decor.js';
import { isBaked } from './octopus-draw.js';
import { createEnemies, setHpMode } from './enemies.js';
import { createHazards, hazardJournalId } from './hazards.js';
import { drawHazards, drawImpaleOverlay, drawSplatRock } from './hazards-draw.js';
import { createCreatures, creatureJournalId, CREATURE_CODE, CR_GCLAM, CL_OPENING, CL_OPEN, CL_TREMBLE, TN_DORMANT, TN_RETRACT, TN_FED } from './creatures.js';
import { drawCreaturesBack, drawCreaturesFront } from './creatures-draw.js';
import { drawBlocks } from './blocks-draw.js';
import { createLoot, lootJournalId, spreadShells, findSwarmSpots, TRAP_SWARM, LOOT_NAMES } from './loot.js';
import { applyCarried, giveItem, itemJournalId, pickupText, itemFromCode } from './items.js';
import { drawLoot } from './loot-draw.js';
import { createEmbedded, EK_SHELL, EK_BOMB, EK_ITEM, EMBED_SHELLS, shellValue } from './embed.js';
import { drawEmbedded, drawPocketReveal, drawTreasureTile } from './embed-draw.js';
import { MAT_ROCK, setTileDrawHook } from './materials.js';
import { fetchPatterns, setPatternTable } from './patterns.js';
import { fetchFoliage, setFoliageTable } from './foliage.js';
import { createAutofire } from './autofire.js';
import { createBombs, IDLE_TOSS_X, IDLE_TOSS_Y } from './bomb.js';
import { createProps, PROP_NAMES, PK_BLOCK } from './props.js';
import { createRagdoll } from './ragdoll.js';
import { createCorpses, kindName as corpseKindName } from './corpses.js';
import { drawCorpses } from './corpses-draw.js';
import { createParticles } from './particles.js';
import { createUI } from './ui.js';
import { computeScore } from './score.js';
import { SHELL_NAMES, SK_PEARL, payout } from './shells.js';
import { mulberry32 } from './rng.js';
import { getJournalStats, saveJournalStats, getStory, addStory, setStory, loadBest, getSettings, setSetting, resetProgress, recordRun, getJournalIds, saveJournalIds, getTutorialDone, setTutorialDone, getHelpDone, setHelpDone, recordDive, getBestRuns, getMeta, getShortcut, setShortcut } from './save.js';
import { summaryRows, summaryHeadline, bestRunLines } from './runstats.js';
import {
  createRun, runEvent, levelSpec, levelTitle, stageLabel, isSafeState, nextDiveSeed, gainShells, endDive, deathTitle, BIOME_LEVELS, BIOME_NAME,
  S_HUB, S_TUTORIAL, S_BIOME, S_END, S_REST, REST_NAME, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, EV_CONTINUE, EV_ENTER_SHORTCUT, SHORTCUT_LEVEL, EV_ENTER_SHORTCUT3, SHORTCUT3_LEVEL,
} from './run.js';
import { parseAuthoredMap, fetchAuthoredMaps } from './authored.js';
import { createJournal, creatureId, itemId, causeEntryId, ENTRIES, STAT_KILLED, STAT_KILLED_BY, STAT_COLLECTED, STAT_SEEN } from './journal.js';
import { createJournalScreen } from './journal-ui.js';
import { hasLineOfSight } from './pathfind.js';
import { drawV2Marks, drawV2Labels } from './v2-draw.js';
import { resetPortalStates, setPortalHold, portalEnter, portalCenter, portalKey, portalMode, whirlpoolReady } from './portal-draw.js';
import { drawPocketCracks, drawWallCue, drawCritter, drawCage, drawDiver, drawCollector, drawHubLantern, drawSpeech, drawShop, drawRubble, drawDecorBoulders, drawWrecks } from './v2-props-draw.js';
import { generateLevel } from './level.js';
import { buildLevelSpawns } from './level-spawns.js';
import { fetchQuests, planQuest, createQuestState, questUpdate, questOnExit, questBlast, questSpeaker, hubResidents, hubVisit, collectorArrives, nextStage, DIVER_RUNS, RELICS_NEEDED, Q_RESCUE, Q_VAULT, ST_ACTIVE } from './quests.js';
import { planPools, createPoolState, poolStep, inPoolRoom, POOL_IDLE_VENT, POOL_COST, POOL_SECONDS, PL_IDLE, PL_ACTIVE, PL_WON } from './pool.js';
import { drawPool, drawPoolHost } from './pool-draw.js';
import { createTalk, say, talkStep, talkAlpha, talking } from './speech.js';
import { ROOM_W, ROOM_H } from './rooms.js';
import { fetchShopItems, createShopState, shopStep, shopBlast, shopWares, keeperSeat } from './shop.js';
import { createDamage, proxyFamily } from './damage.js';
import { CREATURES, SOURCES, resolveHit } from './creature-rules.js';
import { createKeepers, addKeeper, stepKeepers, hitKeeper, hitKeepersAt, keeperFamily, angerAll, exitGuardWaits, guardSpot, KM_CALM, KM_WAIT, KM_ANGRY, KM_DEAD, KEEPER_R, MODE_NAMES } from './shopkeeper.js';
import { drawKeepers, drawLooseWares } from './shopkeeper-draw.js';
import { setShopHooks, HIT_INK, HIT_DASH, HIT_BOMB, HIT_HEAVY } from './shop-aggro.js';
import { createTutorialState, tutorialStep, tutorialActed } from './tutorial.js';
import { drawContactShadows } from './feel-draw.js';
import { OCTO_IDLE_SINK, SHAKE_HURT_PX, HITSTOP_S, SPLAT_SHAKE_PX, SPLAT_HITSTOP, prefersReducedMotion, setMotionSettings, osPrefersReducedMotion } from './config.js';
import { createSettingsPanel } from './settings-ui.js';
import { seedFromText } from './settings.js';
import { HEART_MAX, BOMB_RADIUS, SWIM_MAX_SPEED, TRAIL_BUBBLE_PERIOD_MIN, TRAIL_BUBBLE_PERIOD_MAX, DREAD_RANGE } from './config.js';
import { createAudio } from './audio.js';
import { createSfx } from './sfx.js';
import { canvasPoolStats, markAllocation, pixelRatioCap, drainCanvasPool } from './canvas-pool.js';
import { cullStats, visibleAt, cullFlags, cullView, setGameView } from './cull.js';
import { createNpcs, createMoods, resetMoods, npcByName, NPC_MARLO, NPC_PIP, NPC_QUILL, NPC_HOST, NPC_IDS, FL_SEALED, FL_CAGED, FL_FOLLOWING, FL_TALKING } from './npcs.js';
import { drawNpcs, registerNpcCorpses } from './npcs-draw.js';
import { setCorpseArt } from './corpses-draw.js';
import { questFail } from './quests.js';
import { setStoryExact } from './save.js';
import { STAT_ANGERED } from './journal.js';
import { JUICE, juiceStart, juiceCap, castsOf, addJuice, dropCount, castSpell, spellById, createJuiceDrops, createInkClouds, CAST_OK, CAST_EMPTY } from './spells.js';
import { drawJuiceDrops, drawInkClouds } from './spells-draw.js';
import { createInkJet, autoAim, drawReticle, INKJET } from './inkjet.js';
import { createHotbar, selectNext, selectIndex, selectedSpell, moveSlot } from './hotbar.js';
import { createHotbarUI } from './hotbar-ui.js';
import { createInventoryUI } from './inventory-ui.js';
import { drawItemIcon } from './items-draw.js';
import { drawSpring, springReach } from './spring-draw.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const touchRoot = document.getElementById('touch-ui');
const debugEl = document.getElementById('debug-overlay');
const hudEl = document.getElementById('hud');

const params = new URLSearchParams(location.search);
// without ?seed= every page load gets its own run seed, so the first dive of a session is not always the same three levels
// (v2 only: endless keeps its fixed default seed)
const initialSeed = Number(params.get('seed')) || (params.get('endless') !== '1' ? ((Math.random() * 4294967296) >>> 0) : 0) || 1;
// v2 feel: the octopus sink strength comes from the settings menu; ?sink=<u/s^2> stays as a test override (junk or out of range: ignored)
const SINK_PARAM = (() => { const v = params.get('sink'); const n = v === null || v === '' ? NaN : Number(v); return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null; })();
let sinkNow = SINK_PARAM !== null ? SINK_PARAM : getSettings().sink;
// M1-0 combat spike: ?auto=1 turns on enemy hp and Ink Jet auto-fire (js/autofire.js).
const AUTO = params.get('auto') === '1';
// v2 (section 14): the ink jet is the octopus's attack, so creatures have hit points (urchins, horns and the Beholder have none)
if (AUTO || params.get('endless') !== '1') setHpMode(true);
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
setFoliageTable(await fetchFoliage()); // r46: every original foliage kind, its offsets and spawn rules (data/foliage.json)
if (V2) {
  setDefaultBank(await fetchBiome1Bank());
  setPatternTable(await fetchPatterns());
  authoredJson = await fetchAuthoredMaps();
  questTable = await fetchQuests();
  shopItems = await fetchShopItems();
  run = createRun(initialSeed, { tutorialDone: getTutorialDone(), shortcut: getShortcut(), shortcut3: getStory().marlo >= DIVER_RUNS, juiceStart: juiceStart(), rest: true });
  run.nextSeed = seedFromText(getSettings().seed); // the seed typed in the settings menu for the next dive (null = random)
  const at = params.get('at');
  if (at === 'tutorial') run.state = S_TUTORIAL;
  else if (at === 'end') run.state = S_END;
  else if (at === '1' || at === '2' || at === '3') { run.state = S_BIOME; run.level = Number(at); run.juice = run.juiceStart; }
}
/**
 * r43: the same world as makeWorld, built in three tasks (generate the level, place its spawns, assemble the world) with a
 * timeout between them, so a transition never does all of it in one go. `done(world)` gets the result. Hub and tutorial are
 * authored maps and take one step.
 */
// r43: the generator worker (gen-worker.js). Created on first use; if it cannot start or fails, the same steps run here.
let genWorker = null, genWorkerBad = false, genId = 0;
const genPending = new Map();
const DATA_BASE = new URL('../data/', import.meta.url).href;
function getGenWorker() {
  if (genWorker || genWorkerBad || typeof Worker === 'undefined') return genWorker;
  try {
    genWorker = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
    genWorker.onmessage = (e) => { const cb = genPending.get(e.data.id); genPending.delete(e.data.id); if (cb) cb(e.data); };
    genWorker.onerror = () => { genWorkerBad = true; genWorker = null; for (const cb of genPending.values()) cb({ error: 'worker' }); genPending.clear(); };
  } catch (err) { genWorkerBad = true; genWorker = null; }
  return genWorker;
}
/** Ask the worker for a generated level + spawns; `cb(result | null)` (null: no worker, or it failed: do it here). */
function generateInWorker(spec, cb) {
  const w = getGenWorker();
  if (!w) { cb(null); return; }
  const id = ++genId;
  const timer = setTimeout(() => { if (genPending.delete(id)) cb(null); }, 4000);
  genPending.set(id, (r) => { clearTimeout(timer); cb(r.error ? null : r); });
  w.postMessage({ id, seed: spec.seed, levelIndex: spec.levelIndex, dataBase: DATA_BASE });
}
if (V2 && typeof window !== 'undefined') setTimeout(() => { const w = getGenWorker(); if (w) w.postMessage({ id: 0, dataBase: DATA_BASE }); }, 1500); // load the banks in the worker while the page is idle
const stepLog = []; // r43: {step, ms} of each transition step, for __octo.stepLog()
function timed(name, fn) { const t0 = performance.now(); const r = fn(); stepLog.push({ step: name, at: Math.round(t0), ms: +(performance.now() - t0).toFixed(1) }); if (stepLog.length > 60) stepLog.shift(); return r; }
function makeWorldSteps(done) {
  const spec = levelSpec(run);
  if (!V2 || spec.kind !== 'generated') { setTimeout(() => done(timed('authored world', () => makeWorld(0))), 0); return; }
  generateInWorker(spec, (r) => {
    if (r) { setTimeout(() => done(timed('world', () => createLevelWorld(spec.seed, spec.levelIndex, { generated: r.level, spawnInfo: r.spawnInfo }))), 0); return; }
    stagedOnThread();
  });
  function stagedOnThread() {
  let generated = null, spawnInfo = null;
  setTimeout(() => {
    generated = timed('generate', () => generateLevel(spec.seed, spec.levelIndex));
    setTimeout(() => {
      spawnInfo = timed('spawns', () => buildLevelSpawns(generated, spec.seed, spec.levelIndex));
      setTimeout(() => done(timed('world', () => createLevelWorld(spec.seed, spec.levelIndex, { generated, spawnInfo }))), 0);
    }, 0);
  }, 0);
  }
}
function makeWorld(runSeed) {
  if (!V2) return createWorld(runSeed);
  const spec = levelSpec(run);
  if (spec.kind === 'hub') return createLevelWorld(spec.seed, 0, { level: parseAuthoredMap(authoredJson.hub) });
  if (spec.kind === 'tutorial') return createLevelWorld(spec.seed, 0, { level: parseAuthoredMap(authoredJson.tutorial) });
  if (spec.kind === 'rest') return createLevelWorld(spec.seed, 0, { level: parseAuthoredMap(authoredJson.rest) });
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
  const cap = dprForcedDown ? 1 : Math.min(pixelRatioCap(), isCoarsePointer() ? 1.5 : 2); // r43: 2, or 1.5 on a phone / a device with 4 GB or less
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
  hotbarUI.setCompact(mode === 'touch'); // phones: the small bar at the top (the buttons own the bottom right, the stick the left)
});

// --- Simulation state ---
let seed = initialSeed;
let world = makeWorld(seed);
let octo = createOctopus(world.startX, world.startY);
if (V2) { octo.feel = true; octo.sink = sinkNow; }
if (V2) applyCarried(octo, run.items);
let renderer = createRenderer(ctx, world);
let pickups = createPickups();
let decor = createDecor(world.width, world.chunkHeight);
let enemies = createEnemies();
const blockChunks = new Set(); // chunks whose 'block' spawns are already props
let props = createProps(); // v2: rigid bodies (bombs, loot, falling rocks, rubble); idle in endless mode
let corpses = createCorpses(); // v2: what dead enemies and NPCs leave behind (sinks, settles, fades; no item drops)
let hazards = createHazards(V2 ? props : null);
if (V2) enemies.setHazardData(hazards.data);
let creatures = createCreatures(); // v2: the giant clam and the tentacle (creatures.js)
let loot = createLoot(V2 ? props : null);
let embedded = createEmbedded(V2 ? props : null); // buried treasure (embed.js)
// 2026-10-08: the shared damage entry (damage.js, creature-rules.js); see wireDamage
const damage = createDamage();
damage.register(proxyFamily('enemy', () => enemies.family));
damage.register(proxyFamily('creature', () => creatures.dmgFam || (creatures.dmgFam = creatures.family(() => octo))));
damage.register(proxyFamily('npc', () => (npcs ? npcs.family : null)));
damage.register(proxyFamily('keeper', () => (V2 && run && run.state === S_BIOME ? keepers.dmgFam || (keepers.dmgFam = keeperFamily(keepers)) : null)));
if (V2) wireDamage();
// materials: the always-visible basic shells are baked into the main-rock wall cells (the goggles view stays live, drawEmbedded)
if (V2) setTileDrawHook((ctx, tx, ty, mat, px, py, s) => { if (mat === MAT_ROCK) drawTreasureTile(ctx, embedded.data, tx, ty, px, py, s, false); });
let embedBaked = null; // the embedded set whose tiles were last marked for a re-bake
let bombs = createBombs(V2 ? props : null);
let particles = createParticles();
// section 14: fish juice droplets, ink clouds and the ink jet of this level (spells.js, inkjet.js)
let juiceDrops = createJuiceDrops();
let inkClouds = createInkClouds();
let inkJet = createInkJet();
if (V2) enemies.setInkClouds(inkClouds);
let lastAim = { x: 1, y: 0 }; // the facing direction for the J / K ink jet: the last swim direction
let slurpCool = 0; // s until the next slurp sound may play (many droplets in one step make one sound)
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
let keepers = createKeepers(); // 2026-10-07: this level's shopkeepers (the stall's, a guard at the exit), shopkeeper.js
let shopBrokenSeen = 0;        // world.shopTilesBroken already answered with aggro
const wareEvents = [];
let poolSts = []; // r39: this level's Challenge Pools (pool.js), one per pool room
let tutState = createTutorialState();
let story = getStory(); // the stage of Marlo, Pip and Quill, relics handed over, pool wagers (save.js): who waits in the hub
let diveStory = { ...story }; // the story as the dive began: people move on between dives, never within one
const diveDone = new Set(); // people whose scene was finished in this dive (nobody appears twice in a dive)
let relicHeld = false; // a relic was lifted on this level: carried out through the exit it counts for Quill
const hubTalk = { talk: createTalk(), who: '', cool: {}, visits: {}, undo: [] }; // what a hub resident is saying now
// V2-PLAN 16 point 5 (npcs.js): the friendly NPCs can be hurt, killed and turned against you. npcMoods is the per-dive record of who
// turned on you (reset when a dive starts or the hub is entered); the story counters goneX / killedX / angeredX outlive the dive.
const npcMoods = createMoods();
let npcs = null; // this level's NPC slots (setupLevelExtras)
const capName = (id) => id.charAt(0).toUpperCase() + id.slice(1);
const npcGone = (id) => (story['gone' + capName(id)] | 0) > 0; // killed: absent until the end of the next dive
const PERSON_ENTRY = ['', 'person-diver', 'person-critter', 'person-collector', 'person-host'];
/** Back in the hub: the Collector moves in after the first dive; Marlo's ring exists once he was freed in three runs. */
function arriveInHub() {
  const key = collectorArrives(story, getMeta().dives);
  if (key) { setStory(key, 1); story = getStory(); }
  run.shortcut3 = story.marlo >= DIVER_RUNS && !npcGone('marlo'); // killing Marlo closes his ring for a run
}
if (V2 && run.state === S_HUB) arriveInHub();

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
  onToggleSettings() { settingsPanel.toggle(); },
  onOpenJournal() { if (settingsPanel.isOpen()) settingsPanel.hide(); journalScreen.show(); },
});
if (getHelpDone()) ui.retireControlsHelp(); // finished two levels in an earlier visit: the controls line stays away (Settings lists the controls)

// v2 journal (B1-4): entries persisted through save.js; the list screen opens from the hub board.
const journal = createJournal({ load: getJournalIds, save: saveJournalIds, loadStats: getJournalStats, saveStats: saveJournalStats });
const seenDive = new Set(); // entry ids already counted as seen in this dive / hub visit
const journalScreen = createJournalScreen(hudEl, journal, {
  onClose() { boardCooldown = true; syncModal(); },
  onOpen() { ui.setPrompt(null); journal.flush(); syncModal(); },
  getStats() { return { meta: getMeta(), bestRuns: getBestRuns() }; },
  getStory() { return getStory(); },
  reducedMotion: prefersReducedMotion,
});
/** A full-screen panel is open: the HUD row (hearts, stats) hides under it. */
function syncModal() { hudEl.classList.toggle('octo-modal-open', settingsOpen || journalScreen.isOpen() || inventoryOpen); }
// settings menu (round 38): every change applies at once and is persisted by save.js
function applySetting(key, v) {
  switch (key) {
    case 'musicVol': audio.setMusicVolume(v); break;
    case 'sfxVol': audio.setSfxVolume(v); break;
    case 'shake': case 'reducedMotion': { const st = getSettings(); setMotionSettings(st.reducedMotion, st.shake); break; }
    case 'sink': if (SINK_PARAM === null) { sinkNow = v; if (V2) octo.sink = v; } break;
    case 'seed': if (V2) run.nextSeed = seedFromText(v); break;
    default: break;
  }
}
{ const st = getSettings(); setMotionSettings(st.reducedMotion, st.shake); audio.setMusicVolume(st.musicVol); audio.setSfxVolume(st.sfxVol); }
let settingsOpen = false;
const settingsPanel = createSettingsPanel(hudEl, {
  getAll() { const st = getSettings(); if (SINK_PARAM !== null) st.sink = SINK_PARAM; return st; },
  set(key, value) { const v = setSetting(key, value); applySetting(key, v); return v; },
  osReducedMotion: osPrefersReducedMotion,
  inputMode() { return input.mode() || (matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard'); },
  onOpen() { settingsOpen = true; ui.setPrompt(null); applyPaused(); syncModal(); },
  onClose() { settingsOpen = false; applyPaused(); syncModal(); },
  onResetProgress() { resetProgress(); setTimeout(() => location.reload(), 700); },
  onOpenJournal() { settingsPanel.hide(); journalScreen.show(); },
});
// section 14: the hotbar (spells, bombs, the juice jar) and the inventory panel (Tab / I, pauses the game)
const hotbarUI = createHotbarUI(hudEl, { onSelect(i) { if (V2) selectIndex(hotbar(), i); } });
if (!V2) hotbarUI.setVisible(false);
hotbarUI.setCompact(isCoarsePointer());
let inventoryOpen = false;
function inventoryState() {
  return { ...hotbarState(), items: run.items.slice(), spellRow: spellById, touch: input.mode() === 'touch' };
}
function hotbarState() {
  const hb = hotbar();
  return { slots: hb.slots, sel: hb.sel, spellName: (id) => { const r = spellById(id); return r ? r.name : id; }, bombs: octo.bombs, bombMax: octo.bombMax, juice: run.juice, cap: juiceCap(), perCast: JUICE.perCast };
}
const inventoryUI = createInventoryUI(hudEl, {
  onClose() { closeInventory(); },
  onMove(from, to) { moveSlot(hotbar(), from, to); inventoryUI.refresh(inventoryState()); },
  onSelect(i) { selectIndex(hotbar(), i); inventoryUI.refresh(inventoryState()); },
});
function openInventory() {
  if (!V2 || inventoryOpen || octo.dead || transitioning || settingsPanel.isOpen() || journalScreen.isOpen() || ui.isEndShown()) return false;
  inventoryOpen = true; ui.setPrompt(null);
  inventoryUI.show(inventoryState());
  applyPaused(); syncModal();
  return true;
}
function closeInventory() {
  if (!inventoryOpen) return false;
  inventoryOpen = false;
  inventoryUI.hide();
  applyPaused(); syncModal();
  return true;
}
let boardCooldown = false; // after closing the journal, swim away from the board before it can open again
// Journal toasts are rare and small: only a genuinely new entry (journal.discover is true once per entry) and never a prop
// (plants, weeds, boulders, carvings: discovered quietly). Discoveries within JOURNAL_BATCH_MS become one toast.
const JOURNAL_BATCH_MS = 1800, JOURNAL_TOAST_MS = 2000;
let journalBatch = [], journalBatchTimer = 0;
function announceJournal() {
  for (const id of journal.takeNew()) {
    const e = ENTRIES.find((x) => x.id === id);
    if (e && e.cat !== 'prop') journalBatch.push(e.name.split(',')[0]);
  }
  if (!journalBatch.length || journalBatchTimer) return;
  journalBatchTimer = setTimeout(() => {
    journalBatchTimer = 0;
    const names = journalBatch; journalBatch = [];
    if (!names.length) return;
    ui.showToast('Journal: ' + (names.length > 2 ? names.length + ' new entries' : names.join(', ')), JOURNAL_TOAST_MS, true, true); // queued: never replaces a pickup / shop toast
  }, JOURNAL_BATCH_MS);
}
/** An entry was met: its seen counter goes up once per dive (or hub visit), and a first meeting writes the entry. */
function discover(id) {
  if (!id) return;
  if (!seenDive.has(id)) { seenDive.add(id); journal.bump(id, STAT_SEEN); }
  if (journal.discover(id)) announceJournal();
}
window.addEventListener('pagehide', () => journal.flush());
function discoverStatePlace() {
  discover(run.state === S_HUB ? 'place-hub' : run.state === S_TUTORIAL ? 'place-tutorial' : run.state === S_BIOME ? 'place-shallows' : run.state === S_REST ? 'place-rest' : null);
}

// Manual (Esc/button) and automatic (hidden tab/blur) pause are tracked
// separately and combined, so a window focus event can never silently
// override a pause the player asked for.
let manualPaused = false;
let autoPaused = false;
function applyPaused() {
  const wasPaused = loop.paused;
  const isPaused = manualPaused || autoPaused || settingsOpen || inventoryOpen;
  const showOverlay = isPaused && !settingsOpen && !inventoryOpen; // the settings panel and the inventory are their own overlays
  if (isPaused === wasPaused) { if (showOverlay) ui.showPause(); else ui.hidePause(); return; }
  loop.setPaused(isPaused);
  if (isPaused) { if (showOverlay) ui.showPause(); else ui.hidePause(); window.dispatchEvent(new CustomEvent('pause')); }
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
  if (e.code === 'Escape' && settingsPanel.isOpen()) { settingsPanel.hide(); return; }
  if (e.code === 'Escape' && inventoryOpen) { closeInventory(); return; }
  // Tab / I: the inventory (handled here, not in step(): the game is paused while it is open, so step() never runs then)
  if ((e.code === 'Tab' || e.code === 'KeyI') && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && V2) {
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (!typing) { e.preventDefault(); if (inventoryOpen) closeInventory(); else openInventory(); }
    return;
  }
  if (e.code === 'Escape' && V2 && journalScreen.isOpen()) { journalScreen.hide(); return; }
  if (e.code !== 'Escape' || octo.dead) return;
  manualPaused = !manualPaused;
  applyPaused();
});

const autoDive = { path: [], recalc: 0 };

// r45: entering a whirlpool, as the original does it (octomancer-unity LevelPlayMode.AnimateOctopus / MoveOctoToExit, values from
// MainGame.unity). On the touch the octopus leaves the simulation: no swimming, no velocity, no collision, no idle sink, nothing can hurt
// or push it (octo.sealed; stepOctopus is not called). For ENTRY_S = 1.5 s only this script moves it: towards the whirlpool's centre at
// OctopusAnimWinSpeed = 1 tile/s along the line it started on (it stops within 0.1 of the centre), turning at OctopusAnimWinRotationSpeed
// = 720 deg/s (Unity's z goes down: clockwise on screen) and its scale multiplied by (1 - 0.5 dt) each step (0.47 at the end). The
// whirlpool plays Milan's Bounce and the swallow meanwhile (portal-draw.js), and the black hole (blackhole.js) closes on the whirlpool
// over the same 1.5 s. Then the octopus is hidden and the level changes (v2Event), under the already dark screen.
// The pose is kept as this step's and the last step's values (x, y, turn, scale), and render.js draws it interpolated between them, so it
// moves evenly at any display rate; the round-44 version fought the swim physics every step (stepOctopus moved and collided the body,
// then the entry put it back), which is what made it shake.
const NO_PRESS = { pressed: false, held: false };
const NO_INPUT = { move: { x: 0, y: 0 }, dash: NO_PRESS, bomb: NO_PRESS, pause: NO_PRESS, attack: NO_PRESS, spell: NO_PRESS, inventory: NO_PRESS, cycle: 0, select: -1, src: { attack: 'key', spell: 'key', bomb: 'key' }, mode: 'keyboard' };
const ENTRY_S = 1.5;                 // Unity: animationTime = realtimeSinceStartup + 1.5
const ENTRY_SPEED = 1;               // OctopusAnimWinSpeed, tiles per second
const ENTRY_SPIN = 720;              // OctopusAnimWinRotationSpeed, degrees per second
const ENTRY_STOP = 0.1;              // it stops moving this close to the centre
const ENTRY_SHRINK = 0.5;            // localScale *= 1 - 0.5 * dt
let entry = null; // the pose and the sequence's clock while it runs (also octo.entry, which render.js draws from)
let entryLog = null; // test hook: the last entry's timing and every step's pose
let lastIrisR = -1; // test hook: the black hole's dark radius in px at the last frame drawn
let octoPhysSteps = 0; // test hook: how many times stepOctopus has run
function beginEntry(ev, tx, ty) {
  if (entry || transitioning) return;
  const c = portalCenter(world.tileAt, tx, ty);
  const dx = c.x - octo.x, dy = c.y - octo.y, d = Math.hypot(dx, dy);
  entry = {
    ev, cx: c.x, cy: c.y, dirX: d > 1e-6 ? dx / d : 0, dirY: d > 1e-6 ? dy / d : 0, t: 0,
    x: octo.x, y: octo.y, px: octo.x, py: octo.y, rot: octo.angle, prot: octo.angle, sc: 1, psc: 1, wall: performance.now(),
  };
  octo.entry = entry; octo.sealed = true;
  octo.vx = octo.vy = 0; octo.swimming = false; octo.dashT = 0; octo.squash = 0; octo.hurting = false; octo.hurtTimer = 0; octo.invulnTimer = 0;
  octo.dashedThisStep = octo.bouncedThisStep = octo.landedThisStep = false;
  hitStop = 0;
  portalEnter(portalKey(tx, ty), sim.time, ENTRY_S);
  pinEntry();
  entryLog = { start: entry.wall, simStart: sim.time, ev, fadeAt: 0, simFade: 0, cx: c.x, cy: c.y, poses: [[0, entry.x, entry.y, entry.rot, 1]], physAtStart: octoPhysSteps, physAtEnd: -1 };
}
/** Write the scripted pose into the octopus (this step's and the last step's, for the interpolated draw) and keep it still. */
function pinEntry() {
  const e = entry;
  octo.x = e.x; octo.y = e.y; octo.prevX = e.px; octo.prevY = e.py;
  octo.vx = octo.vy = 0;
  octo.angle = ((e.rot % 360) + 360) % 360;
}
function stepEntry(dt) {
  const e = entry;
  e.px = e.x; e.py = e.y; e.prot = e.rot; e.psc = e.sc;
  e.t += dt;
  const dist = Math.hypot(e.cx - e.x, e.cy - e.y);
  if (dist > ENTRY_STOP) { const f = Math.min(dist, ENTRY_SPEED * dt); e.x += f * e.dirX; e.y += f * e.dirY; }
  e.rot += ENTRY_SPIN * dt;
  e.sc *= 1 - ENTRY_SHRINK * dt;
  pinEntry();
  if (entryLog) entryLog.poses.push([e.t, e.x, e.y, e.rot, e.sc]);
}
/** After the whole step: put the pose back in case anything (a prop, a jet, a blast) touched the body, and end the sequence on time. */
function endOfStepEntry() {
  if (!entry) return;
  pinEntry();
  if (entry.t < ENTRY_S - 1e-6) return;
  const ev = entry.ev;
  entry = null; octo.entry = null;
  octo.hidden = true; octo.angle = 0; // Unity: rotation back to identity, the octopus set inactive
  if (entryLog) { entryLog.fadeAt = performance.now(); entryLog.simFade = sim.time; entryLog.physAtEnd = octoPhysSteps; }
  // the black hole has closed: the dark screen comes on at once (no second fade from the picture), then the transition runs as before
  const fade = ensureFade();
  fade.style.transition = 'none';
  const changed = v2Event(ev);
  void fade.offsetWidth;
  fade.style.transition = `opacity ${FADE_MS}ms ease`;
  if (!changed || !transitioning) { octo.hidden = false; octo.sealed = false; } // no level change after all (the end screen, or a refused event): the octopus is back
}

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
    const off = { pressed: false, held: false };
    snap = { move: { x: dx, y: dy }, dash: off, bomb: off, pause: off, attack: off, spell: off, inventory: off, cycle: 0, select: -1, src: { attack: 'key', spell: 'key', bomb: 'key' }, mode: 'keyboard' };
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
      return;
    }
    if (!V2) return; // endless: the world stops under the game-over card
    // v2 (V2-PLAN 14): the world keeps running behind the death panel; the body bounces about until the player chooses
  }
  // hit-stop: a dash kill freezes the whole sim for 60 ms (the enemy's white ghost stays on screen)
  if (hitStop > 0) { if (entry) hitStop = 0; else { hitStop = Math.max(0, hitStop - dt); return; } } // r45: never during the entry, which runs on its own clock
  octo.noKill = godMode; // test hook: traps that kill outright (spikes, a boulder) are skipped too
  if (godMode && !octo.dead) { octo.invulnTimer = Math.max(octo.invulnTimer, 0.5); octo.noBlink = true; } // test hook: no hurt flicker, so the body never looks see-through in screenshots
  if (V2 && (run.state === S_BIOME || run.state === S_REST) && !octo.dead) run.dive.time += dt; // the run summary's clock
  if (entry || octo.hidden) snap = NO_INPUT; // r45: the octopus is going into a whirlpool: no swimming, dashing, bombs or spells
  if (V2) { // the way a no-direction bomb throw goes: the last swim direction
    if (Math.abs(snap.move.x) > 0.25) octo.throwDir = snap.move.x > 0 ? 1 : -1;
    else if (Math.abs(octo.vx) > 1) octo.throwDir = octo.vx > 0 ? 1 : -1;
  }
  if (Math.hypot(snap.move.x, snap.move.y) > 0.25) { const l = Math.hypot(snap.move.x, snap.move.y); lastAim = { x: snap.move.x / l, y: snap.move.y / l }; }
  if (entry) stepEntry(dt); // r45: the scripted entry instead of the swim physics
  else if (!octo.hidden) { octoPhysSteps++; stepOctopus(octo, snap, dt, world); }
  if (V2) updateRagdoll();
  if (V2 && !octo.dead && !entry && !octo.hidden) stepCombat(snap, dt);
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
  if (V2 && !octo.dead) { stepV2(snap); stepNpcs(); }
  const resident = world.residentChunks();
  pickups.update(dt, sim.time, octo.dead ? NOBODY : octo, resident, world); // a dead body collects nothing
  for (const ev of pickups.events) {
    const color = ev.type === 'shell' ? '#e8f1e4' : '#9dffd8'; // r46: pale, natural specks, no gold
    particles.pickupSparkle(ev.x, ev.y, color);
    if (V2) { discover(itemId(ev.type)); journal.bump(itemId(ev.type), STAT_COLLECTED); if (ev.type === 'shell') { gainShells(run, ev.value || 1); const kid = itemId(SHELL_NAMES[ev.sk]); if (kid) { discover(kid); journal.bump(kid, STAT_COLLECTED); } } }
  }
  if (octo.hearts < prevHearts) {
    sfx.hurt();
    if (V2) { particles.shakeFx(SHAKE_HURT_PX); if (!prefersReducedMotion()) hitStop = Math.max(hitStop, HITSTOP_S); }
  }
  if (octo.bodyHits !== prevBodyHits) { // the dead body took a hit (V2-PLAN 14): a puff, a thud, a little shake (none with reduced motion)
    prevBodyHits = octo.bodyHits;
    particles.deathPoof(octo.x, octo.y, '#ffd9e0'); sfx.thud(); particles.shakeFx(SHAKE_HURT_PX * 0.5, 0.12);
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
  const enemyAll = V2 ? enemies.all() : null; // one list for the props step and the hazards below (boulders, spikes, jets read enemies)
  if (V2) { addBlocks(world.residentChunks()); syncBody(); props.step(dt, world, octo, enemyAll); syncBody(dt); } // sink, bounce, roll; hazards, loot and bombs read their bodies from here
  if (V2) damage.tick(dt);
  if (V2) corpses.update(dt, world, hazards.data);
  if (V2 && run.state === S_BIOME && keepers.n) stepKeepers(keepers, dt, octo, world);
  if (V2 && !isSafeState(run)) {
    hazards.update(dt, sim.time, octo, world, resident);
    for (const ev of hazards.events) {
      if (ev.type === 'rockLanded') particles.bombDebris(ev.x, ev.y);
      else if (ev.type === 'hazardHurt') particles.deathPoof(ev.x, ev.y, ev.kind === 4 ? '#fff58a' : '#cfe8ff');
      else if (ev.type === 'impaled') { particles.deathPoof(ev.x, ev.y, '#150d1c'); particles.shakeFx(5, 0.22); sfx.impale(); } // V2-PLAN 16: skewered, an ink puff and a small shake
      else if (ev.type === 'shocked') { particles.shockSparks(ev.x, ev.y); sfx.zap(); } // eel: yellow sparks
      else if (ev.type === 'splat') { // a boulder flattens the octopus: gore, the heaviest shake in the game and a freeze on the impact
        particles.splatBurst(ev.x, ev.y); particles.shakeFx(SPLAT_SHAKE_PX, 0.55, SPLAT_SHAKE_PX); sfx.splat();
        if (!prefersReducedMotion()) hitStop = Math.max(hitStop, SPLAT_HITSTOP);
      }
    }
  }
  if (V2 && !isSafeState(run)) { handleCreatureEvents(); creatures.update(dt, octo, world, resident); handleCreatureEvents(); } // first what the hazards and blocks did to them this step
  if (V2 && !isSafeState(run)) { loot.update(dt, octo, world, resident); handleLootEvents(); embedded.update(dt, octo, world, resident); handleEmbedEvents(); bakeEmbedded(); }
  if (autofire) autofire.update(dt, octo, world, enemies);
  // M7-2: continuous swim-whoosh and Beholder-drone levels, driven every
  // step (a no-op until the first input creates the audio nodes).
  const beholder = enemies.beholder();
  dreadLevel = beholder ? Math.max(0, 1 - Math.hypot(beholder.x - octo.x, beholder.y - octo.y) / DREAD_RANGE) : 0;
  if (!transitioning) { // r41: nothing new starts while one level is being torn down
    audio.setSwimIntensity(Math.hypot(octo.vx, octo.vy) / SWIM_MAX_SPEED);
    audio.setBeholderDread(dreadLevel);
  }
  bombs.update(dt, world, octo, V2 ? damage : enemies); // v2: the shared damage entry hits every creature body by the table
  if (world.fresh) world.fresh.update(dt);
  blastLog.length = 0;
  if (V2) { // the ink jet after the enemies' own step: its kills join this step's enemy events below
    inkJet.update(dt, world, inkTargets(), inkHurt); // enemies, plus the shopkeepers (ink barely scratches them, and angers them)
    for (let i = 0; i < inkJet.events.nSplat; i++) particles.inkSplat(inkJet.events.splat[i * 2], inkJet.events.splat[i * 2 + 1], inkJet.events.splatDir[i * 2], inkJet.events.splatDir[i * 2 + 1], inkJet.events.splatOn[i] === 1);
    if (inkJet.events.hits && !prefersReducedMotion()) hitStop = Math.max(hitStop, 0.03); // a hair of freeze on an ink hit
    if (inkJet.events.nSplat) inkSplatPeople(); // V2-PLAN 16: a blob that splats on a calm person hurts and angers them
    inkClouds.update(dt);
    stepJuice(dt);
  }
  for (const ev of bombs.events) {
    if (ev.type !== 'exploded') continue;
    blastLog.push(ev.x, ev.y);
    const bd = Math.hypot(ev.x - octo.x, ev.y - octo.y);
    particles.blastBurst(ev.x, ev.y, bd); sfx.bomb();
    if (V2 && world.fresh && ev.tiles > 0) world.fresh.haze(ev.x, ev.y, ev.tiles); // the silt that hangs over the crater afterwards
    if (V2) particles.blastFeel(ev.x, ev.y, bd);
    if (V2 && shopSt) shopBlast(shopSt, ev.x, ev.y, BOMB_RADIUS, props);
    // 2026-10-08: the creatures, NPCs and keepers already took the blast inside bombs.update (damage.js blast, by the creature table)
    if (V2 && run.state === S_BIOME && world.inShop && world.inShop(ev.x, ev.y)) shopAggro('shop'); // a bomb going off inside the stall
    if (V2 && npcs) npcs.drain(onNpcEvent);
    if (V2 && !isSafeState(run)) {
      loot.explode(ev.x, ev.y, BOMB_RADIUS); handleLootEvents(); hazards.blast(ev.x, ev.y, BOMB_RADIUS * 2);
      for (let i = 0; i < creatures.data.n; i++) creatures.releaseNear(i, ev.x, ev.y, BOMB_RADIUS, octo); // a tentacle lets a held octopus go
      handleCreatureEvents(); if (quest) questBlast(quest, ev.x, ev.y, BOMB_RADIUS);
    }
  }
  for (const ev of enemies.events) {
    if (ev.type === 'hitStop') { if (!(V2 && prefersReducedMotion())) hitStop = Math.max(hitStop, ev.dur); continue; }
    if (ev.type !== 'enemyKilled') continue;
    particles.deathPoof(ev.x, ev.y); runKills++;
    if (V2) addCorpseFromEvent(ev); // V2-PLAN 16: a kill leaves a body, never an item
    if (V2 && !isSafeState(run)) {
      run.dive.kills++;
      bodyJuice(ev.x, ev.y, ev.kind, dropCount(seed, runKills)); // V2-PLAN 16: no item drops from enemies; the body leaks juice
      journal.bump(creatureId(ev.kind), STAT_KILLED);
    }
  }
  if (V2 && run.state === S_BIOME) {
    if ((world.shopTilesBroken | 0) !== shopBrokenSeen) { shopBrokenSeen = world.shopTilesBroken | 0; shopAggro('shop'); } // his stall was damaged
    handleKeeperEvents();
  }
  // blasts shove the corpses (the ones this very blast made too, so they are thrown, not just dropped)
  if (V2) for (let i = 0; i < blastLog.length; i += 2) corpses.blast(blastLog[i], blastLog[i + 1], BOMB_RADIUS);
  particles.update(dt, solidForSight);
  if (snap.bomb.pressed) {
    const aim = V2 ? bombAim(snap) : null;
    let bx = octo.x, by = octo.y;
    if (aim) { // starts half a tile out along the throw, unless that is rock
      const al = Math.hypot(aim.x, aim.y) || 1, ux = aim.x / al, uy = aim.y / al;
      if (!world.isSolid(octo.x + ux * 0.5, octo.y + uy * 0.5)) { bx += ux * 0.5; by += uy * 0.5; }
    }
    if (bombs.place(octo, bx, by, aim) && V2) { discover('item-bomb'); journal.bump('item-bomb', STAT_COLLECTED); tutorialActed(tutState); }
  }

  if (V2) syncBody(); // blasts and jets after the props step reached the octopus record: hand them to the body
  endOfStepEntry(); // r45: the entry's pose wins over anything that touched the body this step; the level changes here when it is over

  const depth = Math.max(0, world.depth() - world.startY);
  if (!octo.dead) liveScore = computeScore(depth, pickups.totals, runKills); // a sinking corpse scores no depth

  if (octo.dead && !octo.gameoverEmitted && octo.deathTimer === 0) {
    octo.gameoverEmitted = true;
    const rec = recordRun(liveScore);
    bestScore = rec.best;
    ui.showGameOver(liveScore, bestScore, V2 ? deathDetail() : undefined);
    window.dispatchEvent(new CustomEvent('gameover', { detail: { time: sim.time, score: liveScore, best: bestScore } }));
  }
}
// --- V2-PLAN 14: the ragdoll (js/ragdoll.js): a limp or dead octopus is a physics body the world keeps throwing about
const NOBODY = { x: -1e6, y: -1e6, vx: 0, vy: 0, radius: 0, magnetR: 0, dead: true }; // what pickups see once the octopus is dead
let prevBodyHits = 0;
let ragdoll = createRagdoll();
function updateRagdoll() {
  ragdoll.update(octo, props);
  // dead: the death screen is laid out now (invisible) so the camera frames the body before the panel shows
  if (octo.dead && !octo.deathLaidOut) { octo.deathLaidOut = true; if (!ui.isGameOverShown()) ui.prepareGameOver(); }
}
function syncBody(dt = 0) { ragdoll.sync(octo, props, dt); }

/** v2: the way a bomb is thrown. Mouse: toward the cursor; touch / keyboard: along the stick or move keys (unit
 * vector); with no direction a short toss forward (the last swim direction) and a little down, never up. */
function bombAim(snap) {
  if (snap.src && snap.src.bomb === 'mouse' && input.mouse.seen) {
    const w = screenToWorld(renderer.camera, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
    const dx = w.x - octo.x, dy = w.y - octo.y, l = Math.hypot(dx, dy);
    if (l > 0.4) return { x: dx / l, y: dy / l };
  }
  const m = snap.move, l = Math.hypot(m.x, m.y);
  if (l > 0.25) return { x: m.x / l, y: m.y / l };
  return { x: (octo.throwDir || 1) * IDLE_TOSS_X, y: IDLE_TOSS_Y };
}
// --- section 14: the ink jet, spells, the hotbar and fish juice ---
/** The run's hotbar (a new dive or a death starts a fresh one with the starting spell). */
function hotbar() { if (!run.hotbar) run.hotbar = createHotbar(); return run.hotbar; }
/** The cursor as a world point, or null when the mouse has not been seen. */
function cursorWorld() {
  if (!input.mouse.seen) return null;
  return screenToWorld(renderer.camera, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
}
const SPELL_REACH = 3; // tiles: a spell aimed with the mouse lands at the cursor, at most this far out (and short of rock)
/** Where a spell goes: toward the cursor (mouse), else on the octopus. */
function spellTarget(snap) {
  const w = snap.src && snap.src.spell === 'mouse' ? cursorWorld() : null;
  if (!w) return { x: octo.x, y: octo.y };
  const dx = w.x - octo.x, dy = w.y - octo.y, d = Math.hypot(dx, dy);
  if (d < 1e-3) return { x: octo.x, y: octo.y };
  const reach = Math.min(d, SPELL_REACH), ux = dx / d, uy = dy / d;
  let x = octo.x, y = octo.y;
  for (let t = 0.2; t <= reach + 1e-6; t += 0.2) { // march out and stop short of the first rock
    const nx = octo.x + ux * t, ny = octo.y + uy * t;
    if (world.isSolid(nx, ny)) break;
    x = nx; y = ny;
  }
  return { x, y };
}
/** One step of the octopus's own actions: hotbar switching, the ink jet, casting the selected spell. */
function stepCombat(snap, dt) {
  const hb = hotbar();
  if (snap.select >= 0) selectIndex(hb, snap.select);
  for (let k = snap.cycle | 0; k !== 0; k -= Math.sign(k)) selectNext(hb, Math.sign(k));
  if (snap.attack.held || snap.attack.pressed) { // pressed too: a quick tap (key down and up between two steps) still fires
    let dir = lastAim;
    const src = snap.src ? snap.src.attack : 'key';
    if (src === 'mouse') { const w = cursorWorld(); if (w && Math.hypot(w.x - octo.x, w.y - octo.y) > 0.3) dir = { x: w.x - octo.x, y: w.y - octo.y }; }
    else if (src === 'touch') dir = autoAim(octo, enemies.all(), solidForSight, lastAim.x >= 0 ? 1 : -1);
    if (src === 'touch' && dir.y === 0 && Math.abs(lastAim.y) > 0.5) dir = lastAim; // nothing to aim at: the facing direction, up or down too
    if (inkJet.fire(octo.x, octo.y, dir.x, dir.y, octo.radius + 0.1)) { sfx.inkJet(); runStats.shots++; }
  }
  if (snap.spell.pressed) {
    const id = selectedSpell(hb);
    const at = spellTarget(snap);
    const r = castSpell(run, id, { clouds: inkClouds, x: at.x, y: at.y, vx: octo.vx, vy: octo.vy });
    if (r === CAST_OK) {
      const row = spellById(id);
      sfx.inkPuff();
      runStats.spellsCast++;
      if (row && row.journal) { discover(row.journal); journal.bump(row.journal, STAT_COLLECTED); }
    } else if (r === CAST_EMPTY) { hotbarUI.shakeJar(); sfx.emptyJar(); runStats.empty++; }
  }
}
/**
 * A beaten creature's body leaks its fish juice: a slow trickle of droplets from where it died (nothing pops out of it).
 * The one place juice enters a level: retarget it to the physics corpse's own hook (onCorpse) once corpses exist.
 */
function bodyJuice(x, y, kind, n) { juiceDrops.leak(x, y, n); }
/** Fish juice droplets: pulled in within JUICE.magnetR, poured into the jar on touch (a full jar leaves them be). */
function stepJuice(dt) {
  slurpCool = Math.max(0, slurpCool - dt);
  juiceDrops.update(dt, octo, world, juiceCap() - run.juice);
  const ev = juiceDrops.events;
  if (!ev.collected) return;
  addJuice(run, ev.collected);
  for (let i = 0; i < ev.n; i++) particles.pickupSparkle(ev.xy[i * 2], ev.xy[i * 2 + 1], '#a98ad8');
  if (slurpCool <= 0) { sfx.slurp(); slurpCool = 0.09; }
  discover('item-juice'); journal.bump('item-juice', STAT_COLLECTED);
}
const runStats = { shots: 0, spellsCast: 0, empty: 0 }; // test hook counters (__octo.combat())

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
let perfCheckAt = 0;
function checkPerfStepDown() {
  if (dprForcedDown) return;
  // four times a second is plenty for a 2 s window: metrics() copies and sorts the frame times, which every frame was a steady cost
  // and garbage on a slow phone (verification 2026-10-08 profile)
  const t = performance.now();
  if (t - perfCheckAt < 250) return;
  perfCheckAt = t;
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
    warmOnly: holdDark, warmGroup: holdDark ? warmPhase() : 0, // behind the dark screen: a set-up frame, a frame of the simulation's first run, then one group of the scene, in turn
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
    preWallDraw: V2 ? v2PreWall : null,
    dreadLevel,
    extraDraw: V2 ? v2Extra : (autofire ? autofire.draw : null),
    postOctoDraw: V2 ? v2People : null,
    followBias: V2 && run.state === S_BIOME && !octo.dead ? poolCameraBias() : null,
    deathFocus: V2 && octo.dead ? deathFocus(w, h) : null,
    lightR: V2 && run.state === S_BIOME ? octo.lightR : 0,
  });
  setGameView(renderer.camera, w, h); // gameplay checks (a boulder falls, a tentacle wakes, a cannon charges) only while the threat is on screen
  if (V2 && octo.dead) { // the clear hole in the death tint follows the body
    const a = octo.prevX + (octo.x - octo.prevX) * alpha, b = octo.prevY + (octo.y - octo.prevY) * alpha;
    const p = worldToScreen(renderer.camera, w, h, a, b);
    ui.setDeathFocus(p.x / dpr, p.y / dpr, renderer.camera.pxPerUnit * 1.6 / dpr);
  }
  if (entry && !holdDark) { // r45: the black hole closes on the whirlpool, on the entry's clock (interpolated like the octopus)
    const c = worldToScreen(renderer.camera, w, h, entry.cx, entry.cy);
    if (!entry.far) entry.far = farCorner(w, h, c.x, c.y);
    lastIrisR = drawBlackHole(ctx, w, h, c.x, c.y, Math.max(0, entry.t - STEP + alpha * STEP), ENTRY_S, entry.far);
  }
  ui.updateHud({
    hearts: octo.hearts, heartMax: octo.heartMax,
    bombs: octo.bombs,
    depth: Math.round(depth), score: liveScore, best: bestScore,
    stage: V2 ? hudStage : undefined, // r44: frozen at the fade, updated when the new level is built
    shells: V2 ? run.shells : undefined,
    items: V2 ? run.items : undefined,
  });
  if (V2) {
    hotbarUI.update(hotbarState());
    const row = spellById(selectedSpell(hotbar()));
    touchUI.setSpell(!!row && run.juice >= row.cost * JUICE.perCast);
  }
  debug.tick();
}

/** V2-PLAN 14: the part of the canvas (device px) the death panel leaves free, below the HUD row: the camera frames the
 * body there. `strict` once the panel shows. */
const HUD_ROW_CSS = 56;
function deathFocus(w, h) {
  const r = ui.gameOverPanelRect();
  if (!r) return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x0 = 0, y0 = HUD_ROW_CSS, x1 = vw, y1 = vh;
  if (r.width < vw * 0.8) x1 = Math.max(vw * 0.3, r.left - 8); // a side panel
  else y1 = Math.max(y0 + 80, r.top - 8);                      // a bottom sheet
  return { x0: x0 * dpr, y0: y0 * dpr, x1: x1 * dpr, y1: y1 * dpr, strict: ui.isGameOverShown() };
}

let hudStage = V2 ? stageLabel(run) : undefined;
const loop = createLoop(step, render);
const debug = createDebugOverlay(debugEl, { loop, input });

loop.start();
if (V2) showLevelTitle(); // the first level's title card

function resetWorld(newSeed, prebuilt = null, deferExtras = false) {
  // r41: tear the old level down first (every baked canvas, every synthesised sound), then build the new one: the two are never alive together
  timed('r:dispose', () => { sfx.stopAll(); renderer.dispose(); });
  if (V2) hudStage = stageLabel(run);
  resetPortalStates(); // r43: the tinted portal frames of the level that is going
  seed = V2 ? levelSpec(run).seed : newSeed;
  world = prebuilt || makeWorld(seed); // r43: a transition builds the world in an earlier task (during the fade-out)
  octo = createOctopus(world.startX, world.startY);
  if (V2) { octo.feel = true; octo.sink = sinkNow; }
  if (V2) applyCarried(octo, run.items);
  timed('r:renderer', () => { renderer = createRenderer(ctx, world); });
  timed('r:objects', () => {
    pickups = createPickups();
    decor = createDecor(world.width, world.chunkHeight);
    enemies = createEnemies();
    props = createProps();
    blockChunks.clear();
    corpses = createCorpses();
    hazards = createHazards(V2 ? props : null);
    if (V2) enemies.setHazardData(hazards.data);
    creatures = createCreatures();
    loot = createLoot(V2 ? props : null);
    if (V2) wireDamage();
    embedded = createEmbedded(V2 ? props : null);
    if (AUTO) autofire = createAutofire();
    bombs = createBombs(V2 ? props : null);
    particles = createParticles();
    juiceDrops = createJuiceDrops();
    inkClouds = createInkClouds();
    inkJet = createInkJet();
    if (V2) enemies.setInkClouds(inkClouds);
  });
  sim.time = 0;
  entry = null;
  keepers = createKeepers(); shopBrokenSeen = 0; // the old level's keepers never step in the new world (setupLevelExtras places this level's)
  runKills = 0;
  liveScore = 0;
  trailTimer = 0;
  hitStop = 0;
  dreadLevel = 0;
  prevHearts = octo.hearts;
  prevBodyHits = 0;
  ragdoll = createRagdoll();
  ui.hideGameOver();
  ui.hideEnd();
  ui.setPrompt(null);
  // r44: a transition runs the level's extras (quest plan, shop, pools) in a later frame behind the dark screen (warmSim) and shows the title card when the screen is back
  if (V2 && deferExtras) extrasPending = true;
  else if (V2) { timed('r:extras', () => setupLevelExtras()); timed('r:title', () => showLevelTitle()); }
}

// --- v2 run flow (js/run.js): fade, level loading, hub board, prompts, journal discoveries ---
let transitioning = false;
let holdFrame = 0;
let lastDark = null; // {start, end} (performance.now) of the last transition's dark part: the event until the screen starts to fade in
let holdDark = false; // r43: the new level is being baked behind the dark screen: render only sets it up, draws nothing
const FADE_MS = 320;
const GENERATE_AT_MS = 80;     // r43: when, after the fade starts, the next level is generated
const WARM_FRAMES = 18;        // r44: warm frames behind the dark screen before the fade-in (set-up, simulation and every group of the scene at least once, in turn)
let warmGroupN = 0, warmSimN = 0, extrasPending = false;
const WARM_SIM_STAGES = 7;
function runPendingExtras() { if (extrasPending) { extrasPending = false; timed('extras', () => setupLevelExtras()); } }
/** r44: what the next frame behind the dark screen does: 0 = a piece of the renderer's set-up, -1 = one module's first update (see warmSim), 1..5 = draw one group of the scene. */
function warmPhase() {
  const ph = holdFrame++ % 3;
  if (ph === 0) return 0;
  if (ph === 1) { warmSim(warmSimN++); return -1; }
  return 1 + (warmGroupN++ % 5);
}
/** r44: the first update of each simulation module (enemy spawning from the slots, decor chunks, props, hazards, loot, bombs) is the cold path that made the first steps of a
 *  level 15-25 ms at 4x on a phone. Run each once behind the dark screen, one per frame, with a time step too small to move anything. */
function warmSim(n) {
  const dt = 0.001, resident = world.residentChunks();
  try {
    switch (n) {
      case 0: runPendingExtras(); break;
      case 1: world.update(octo.y); pickups.update(dt, sim.time, octo, resident, world); break;
      case 2: decor.update(dt, resident); break;
      case 3: enemies.update(dt, V2 && isSafeState(run) ? 0 : sim.time, octo, world, resident, V2 ? props : null); break;
      case 4: if (V2) { addBlocks(resident); props.step(dt, world, octo, enemies.all()); } break;
      case 5: if (V2 && !isSafeState(run)) { hazards.update(dt, sim.time, octo, world, resident); loot.update(dt, octo, world, resident); loot.takeEvents(); } break;
      case 6: bombs.update(dt, world, octo, enemies); break;
      default: break;
    }
  } catch (e) { /* a warm-up only: never stops a level from starting */ }
}
const FADE_IN_MAX_MS = 2500;  // r43: the longest the screen stays dark waiting for the first view to bake
let fadeEl = null;
function ensureFade() {
  if (!fadeEl) {
    fadeEl = document.createElement('div');
    fadeEl.id = 'octo-fade';
    fadeEl.style.cssText = `position:fixed;inset:0;background:#04121c;opacity:0;pointer-events:none;z-index:30;transition:opacity ${FADE_MS}ms ease`;
    document.body.appendChild(fadeEl);
    void fadeEl.offsetWidth; // r44: flush the opacity-0 style, or the first fade-out has no start state and cuts straight to black
    void getComputedStyle(fadeEl).opacity;
  }
  return fadeEl;
}
if (V2) ensureFade(); // r44: made at startup, long before the first dive

/** Apply a run event; on a state change fade out, load the next level, fade in. */
function v2Event(ev) {
  if (!V2 || transitioning) return false;
  const prevState = run.state;
  const carry = { hearts: octo.hearts, bombs: octo.bombs };
  if (!runEvent(run, ev)) return false;
  if (!(prevState === S_BIOME && run.state === S_BIOME)) seenDive.clear();
  if (prevState === S_BIOME && (run.levelsCleared >= 2 || run.state === S_END)) { setHelpDone(true); ui.retireControlsHelp(); } // two levels done: the controls line goes for good
  if (prevState === S_BIOME && (run.state === S_HUB || run.state === S_END)) endOfDiveNpcs(); // the dive ended: whoever was killed has one dive less to stay away
  if (!(prevState === S_BIOME && run.state === S_BIOME)) resetMoods(npcMoods); // a new dive or the hub: everybody is calm again
  timed('save', () => { journal.flush(); if (prevState === S_TUTORIAL && ev === EV_EXIT) setTutorialDone(true); });
  if (run.state === S_END) {
    // the dive is over: record it, unlock the hub shortcut (persisted), show the summary
    const res = recordDive(run.last);
    setShortcut(true);
    showEndScreen(res.rank);
    return true;
  }
  transitioning = true;
  const darkStart = performance.now();
  markAllocation(); // r43: __octo.memory().allocatedMB counts what this transition creates
  audio.setSwimIntensity(0); audio.setBeholderDread(0); sfx.hold(true); // r41: the loops fade out with the screen and no new effect starts; whatever is left is stopped when the level is torn down (resetWorld)
  const fade = ensureFade();
  fade.style.opacity = '1';
  // r43: the work is spread over separate tasks. 1) the fade starts, 2) a few frames later the next level is generated (while the
  // screen goes dark and the music plays on), 3) at the end of the fade the old level is torn down and the new one's objects are
  // made, 4) the walls and the deep rock bake a little each frame behind the dark screen, and 5) the screen fades in when the
  // first view is ready (at the latest after FADE_IN_MAX_MS). No task here does generation, baking and starting together.
  let nextWorld = null;
  setTimeout(() => { if (transitioning) makeWorldSteps((w) => { nextWorld = w; }); }, GENERATE_AT_MS);
  const proceed = () => {
    if (!nextWorld) { setTimeout(proceed, 10); return; } // the generation is still running in its own tasks
    if (run.state === S_BIOME && prevState !== S_BIOME) { diveStory = { ...story }; diveDone.clear(); } // a new dive: the story as it stands now
    timed('arrive', () => { if (run.state === S_HUB) arriveInHub(); });
    timed('reset', () => resetWorld(0, nextWorld, true));
    if ((run.state === S_BIOME || run.state === S_REST) && prevState === S_BIOME) { octo.hearts = carry.hearts; octo.bombs = carry.bombs; prevHearts = octo.hearts; }
    timed('discover', () => discoverStatePlace());
    if (run.state === S_BIOME && prevState !== S_BIOME && story.quill >= 2 && !run.items.includes('lantern') && giveItem(run.items, octo, 'lantern')) discover('item-lantern'); // Quill's lantern: no words
    timed('restart event', () => window.dispatchEvent(new CustomEvent('restart')));
    const t0 = performance.now();
    holdDark = true;
    warmGroupN = 0; warmSimN = 0;
    setPortalHold(true); // the portals' Rise starts when the screen is back, not behind the dark screen
    holdFrame = 0;
    const fadeIn = () => {
      // r44: also not before every group of the scene has been drawn once behind the dark screen (holdFrame counts the warm frames:
      // a set-up frame, then groups 1..5 in turn). Otherwise the first visible frame is the first time the portals, people, octopus
      // and particles run their cold paths, which was an 85 ms task during the fade-in on a phone.
      if ((!renderer.ready() || holdFrame < WARM_FRAMES || warmGroupN < 5 || warmSimN < WARM_SIM_STAGES || !whirlpoolReady()) && performance.now() - t0 < FADE_IN_MAX_MS) { setTimeout(fadeIn, 30); return; }
      holdDark = false;
      runPendingExtras(); // (normally done in the first warm frames; only a slow bake that hit the time limit gets here with it pending)
      showLevelTitle();
      setPortalHold(false);
      lastDark = { start: darkStart, end: performance.now() }; // the dark part of the transition, for the tests
      fade.style.opacity = '0';
      sfx.hold(false);
      setTimeout(() => { transitioning = false; }, FADE_MS);
    };
    setTimeout(fadeIn, 30);
  };
  setTimeout(proceed, FADE_MS);
  return true;
}

/** Level title card at each level start: "Shallows 1-2", plus the seed only when the run is seeded on purpose (?seed= or a seed typed in the settings). */
function showLevelTitle() {
  if (V2 && run.state === S_REST) return; // the grotto's own prompt says what it is (a title card would cover it)
  const t = levelTitle(run, !!Number(params.get('seed')) || (run.nextSeed !== null && run.nextSeed !== undefined));
  if (t) ui.showTitle(t.text, t.sub, 1500);
}

/** Run summary shown on the death and biome-clear screens: stats, best runs (this run highlighted), the shortcut note. */
function summaryDetail(sum, rank) {
  return {
    title: sum.cleared ? BIOME_NAME + ' cleared' : deathTitle(sum.cause),
    headline: summaryHeadline(sum),
    rows: summaryRows(sum, true),
    best: bestRunLines(getBestRuns()),
    rank: rank === undefined ? -1 : rank,
    note: sum.shortcutNew ? 'Shortcut unlocked: a new ring in the hub leads to ' + BIOME_NAME + ' 1-' + SHORTCUT_LEVEL : '',
  };
}

/** The octopus just died in a dive: close the dive (cause from octopus.js), record it, return the death screen's detail. */
function deathDetail() {
  if (run.state !== S_BIOME && run.state !== S_REST) return undefined;
  const sum = run.dive.over && run.last ? run.last : endDive(run, false, octo.cause);
  journal.bump(causeEntryId(octo.cause), STAT_KILLED_BY);
  journal.flush();
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

/** r40: in an idle pool's room the camera leans towards the pedestal, so it stays in view whatever the vents do. */
function poolCameraBias() {
  for (const ps of poolSts) {
    if (ps.state !== PL_IDLE || !inPoolRoom(ps.plan, octo.x, octo.y, 2)) continue;
    return { x: ps.plan.x, y: ps.plan.y - 1.2, k: 0.55 };
  }
  return null;
}

// --- V2-PLAN 16 point 5: the NPCs can be hurt, killed and turned on you (js/npcs.js, npcs-draw.js) ---
if (V2) registerNpcCorpses(setCorpseArt);
function makeNpcs() {
  const lines = {};
  for (const n of questTable.npcs) lines[n.id] = { hurt: n.hurt || [], angry: n.angry || [] };
  const sys = createNpcs(world, { moods: npcMoods, hub: run.state === S_HUB, lines });
  return sys;
}
/** The hub residents that are here and calm: not killed (gone for a run) and not turned on you. */
function activeResidents() {
  return hubResidents(questTable, story).filter((r) => !npcGone(r.id) && !(npcs && npcs.owns(npcByName(r.id))));
}
let npcTick = 0;
/** Each step after the octopus moved: tell npcs.js where the calm NPCs are, step it, apply what happened. */
function stepNpcs() {
  if (!npcs) return;
  if (run.state === S_BIOME) {
    const q = quest;
    if (q) {
      if (q.plan.kindId === Q_VAULT && (q.status === ST_ACTIVE || (q.collected && q.leave > 0)) && !npcGone('marlo')) npcs.place(NPC_MARLO, q.cx, q.cy + 0.22, 0, q.collected ? 0 : FL_SEALED); // feet; sealed until freed
      else if (q.plan.kindId === Q_RESCUE && q.status === ST_ACTIVE && !npcGone('pip')) npcs.place(NPC_PIP, q.cx, q.cy, 0, q.following ? FL_FOLLOWING : FL_CAGED);
    }
    const hostGone = npcGone('host');
    for (let k = 0; k < poolSts.length; k++) {
      const ps = poolSts[k];
      if (!hostGone) npcs.place(NPC_HOST, ps.plan.x - 1.7, ps.plan.floorY + 1, k, 0);
      ps.hostOff = hostGone || npcs.owns(NPC_HOST) ? 1 : 0; // no host, no wager
      if ((npcTick & 15) === 0 && !hostGone && Math.hypot(octo.x - ps.plan.x, octo.y - ps.plan.y) < 9) discover('person-host');
    }
    npcTick++;
  } else if (run.state === S_HUB && world.level.signX !== undefined && world.level.signX >= 0) {
    const lv = world.level;
    for (const r of activeResidents()) {
      const who = npcByName(r.id), pl = hubPlace(lv, r.id, sim.time);
      npcs.place(who, pl.x, pl.y, 0, hubTalk.who === r.id && talking(hubTalk.talk) ? FL_TALKING : 0);
    }
  }
  npcs.step(octo, STEP);
  npcs.drain(onNpcEvent);
}
/** One thing that happened to an NPC: journal, story counters, the encounter, corpses. */
function onNpcEvent(ev) {
  switch (ev.type) {
    case 'hurt': particles.deathPoof(ev.x, ev.y, '#f4efe4'); sfx.hurt(); break;
    case 'angered': {
      const id = PERSON_ENTRY[ev.who];
      discover(id); journal.bump(id, STAT_ANGERED);
      addStory('angered' + capName(ev.name)); story = getStory();
      if (quest && quest.plan.npc === ev.name) questFail(quest); // the encounter is over: no reward, no stage up
      if (hubTalk.who === ev.name) { hubTalk.talk.q.length = 0; hubTalk.talk.left = 0; hubTalk.talk.text = ''; hubTalk.who = ''; hubTalk.undo = []; }
      break;
    }
    case 'killed': {
      addCorpseFromEvent(ev); // a body, no item drops
      particles.deathPoof(ev.x, ev.y, '#f4efe4');
      journal.bump(PERSON_ENTRY[ev.who], STAT_KILLED);
      addStory('killed' + capName(ev.name));
      setStoryExact('gone' + capName(ev.name), ev.hub ? 1 : 2); // away until the end of the next dive
      story = getStory();
      if (ev.name === 'marlo') run.shortcut3 = false; // his ring to Shallows 1-3 closes for the run
      if (quest && quest.plan.npc === ev.name) questFail(quest);
      break;
    }
    case 'harpoon': sfx.bomb(); break;
    case 'harpoonHit': particles.deathPoof(ev.x, ev.y, ev.rock ? '#d9cdb8' : '#f4efe4'); break;
    default: break;
  }
}
/** A dive ended (a death or a biome clear): whoever was killed has one dive end less to stay away. */
function endOfDiveNpcs() {
  for (const id of ['marlo', 'pip', 'quill', 'host']) { const k = 'gone' + capName(id), n = story[k] | 0; if (n > 0) setStoryExact(k, n - 1); }
  story = getStory();
}

/** v2 per-step logic after the octopus moved: exit, hub board, prompts, sightings. */
function stepV2(snap) {
  const lv = world.level;
  if (entry) return; // r44: the entry sequence owns the octopus
  if (run.state === S_BIOME) {
    if (questUpdate(quest, octo, world, STEP)) payQuest();
    if (quest && quest.met) diveDone.add(quest.plan.npc); // r40: once a person has spoken in a dive they are done for it (at most one cage per dive)
    if (quest && quest.met && !quest.said && quest.plan.journal) { quest.said = true; discover(quest.plan.journal); }
    if (shopSt) shopSt.keeperCalm = shopSt.keeperIdx >= 0 && shopSt.keeperIdx < keepers.n && keepers.mode[shopSt.keeperIdx] === KM_CALM;
    const ev = shopStep(shopSt, octo, run.shells, STEP, run.items);
    if (ev) onShopEvent(ev);
    if (shopSt) { wareEvents.length = 0; for (const we of shopWares(shopSt, props, world, octo, run.items, wareEvents, run.shells, STEP)) onShopEvent(we); }
    if (poolSts.length) {
      hazards.setPoolGain(poolSts.some((ps) => ps.state === PL_ACTIVE) ? 1 : POOL_IDLE_VENT); // r40: the vents only blow weakly until a wager runs
      const busy = poolSts.some((ps) => ps.state === PL_ACTIVE); // one wager at a time
      for (const ps of poolSts) { if (busy && ps.state === PL_IDLE) continue; for (const pe of poolStep(ps, octo, run.shells, STEP)) onPoolEvent(pe, ps); }
    }
    if (shopSt && (seeTick & 15) === 0 && Math.hypot(octo.x - shopSt.keeperX, octo.y - shopSt.keeperY) < 9) { discover('place-shop'); discover('person-keeper'); }
    if ((seeTick & 15) === 4) for (let i = 0; i < keepers.n; i++) if (keepers.mode[i] !== KM_DEAD && Math.hypot(octo.x - keepers.x[i], octo.y - keepers.y[i]) < 9) discover('person-keeper');
    if (siphonSpot && !siphonSpot.taken && Math.hypot(octo.x - siphonSpot.x, octo.y - siphonSpot.y) < 0.8) {
      siphonSpot.taken = true;
      if (giveItem(run.items, octo, 'siphon')) { discover('item-siphon'); journal.bump('item-siphon', STAT_COLLECTED); ui.showToast('Found ' + pickupText('siphon')); }
      particles.pickupSparkle(siphonSpot.x, siphonSpot.y, '#cfe0b0'); sfx.chime();
    }
  }
  if (run.state === S_REST) stepRest();
  if (world.reachedExit(octo.x, octo.y)) {
    if (run.state === S_BIOME && questOnExit(quest)) payQuest();
    if (run.state === S_BIOME && relicHeld) { relicHeld = false; addStory('relics'); story = getStory(); }
    beginEntry(run.state === S_HUB ? EV_ENTER_DIVE : EV_EXIT, lv.exitX, lv.exitY);
    return;
  }
  if (run.state === S_HUB && run.shortcut && lv.shortcutX >= 0 && Math.hypot(octo.x - (lv.shortcutX + 0.5), octo.y - (lv.shortcutY + 0.5)) < 1.2) {
    beginEntry(EV_ENTER_SHORTCUT, lv.shortcutX, lv.shortcutY);
    return;
  }
  if (run.state === S_HUB && run.shortcut3 && lv.shortcut3X >= 0 && Math.hypot(octo.x - (lv.shortcut3X + 0.5), octo.y - (lv.shortcut3Y + 0.5)) < 1.2) {
    beginEntry(EV_ENTER_SHORTCUT3, lv.shortcut3X, lv.shortcut3Y);
    return;
  }
  if (run.state === S_HUB) hubStep(lv);
  if (lv.boardX >= 0) {
    const d = Math.hypot(octo.x - (lv.boardX + 0.5), octo.y - (lv.boardY + 0.5));
    if (d > 2.2) boardCooldown = false;
    else if (d < 1.2 && !boardCooldown) { octo.vx = octo.vy = 0; journalScreen.show(); ui.setPrompt(null); return; }
  }
  if (lv.prompts && lv.prompts.length) {
    let best = null, bd = 1e9;
    // r40: the hub's 'Welcome to the Shallows' panel is for newcomers: gone once the first dive has been cleared
    const welcomed = run.state === S_HUB && (getMeta().clears | 0) >= 1;
    for (const p of welcomed ? [] : lv.prompts) {
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
    for (const ck of creatures.seen(octo.x, octo.y, SEE_RANGE, solidForSight)) discover(creatureJournalId(ck));
  }
  if ((seeTick & 15) === 8 && run.state === S_BIOME) discoverScenery();
  if ((seeTick & 7) === 4 && run.state === S_BIOME) {
    for (const lk of loot.seen(octo.x, octo.y, SEE_RANGE, solidForSight)) discover(lootJournalId(lk));
  }
  if ((seeTick++ & 7) === 0) {
    for (const e of enemies.all()) {
      if (e.dead) continue;
      const id = creatureId(e.kind);
      if (!id || seenDive.has(id)) continue;
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
function shadowPass(c, camera, cw, ch) { drawWrecks(c, camera, cw, ch, decorWrecks(world.level), sim.time); drawContactShadows(c, camera, cw, ch, props.data, enemies.all(), world.isSolid, octo); }
function v2Extra(c, camera, w2s, cw, ch) {
  cullView(camera, cw, ch);
  const lv = world.level;
  drawV2Marks(c, camera, cw, ch, {
    exitX: lv.exitX, exitY: lv.exitY, tileAt: world.tileAt, octoX: octo.x, octoY: octo.y,
    boardX: lv.boardX === undefined ? -1 : lv.boardX, boardY: lv.boardY === undefined ? -1 : lv.boardY,
    label: run.state === S_HUB ? 'Dive' : '',
    shortcutX: run.state === S_HUB && run.shortcut && lv.shortcutX !== undefined ? lv.shortcutX : -1, shortcutY: lv.shortcutY,
    shortcutLabel: BIOME_NAME + ' 1-' + SHORTCUT_LEVEL,
    shortcut3X: run.state === S_HUB && run.shortcut3 && lv.shortcut3X !== undefined ? lv.shortcut3X : -1, shortcut3Y: lv.shortcut3Y,
    shortcut3Label: BIOME_NAME + ' 1-' + SHORTCUT3_LEVEL,
  }, sim.time);
  const t = sim.time;
  if (run.state === S_TUTORIAL && lv.walls && lv.walls.length) {
    drawWallCue(c, camera, cw, ch, { walls: lv.walls, tileAt: world.tileAt, attention: tutState.hint ? 1 : 0 }, t);
  }
  drawRubble(c, camera, cw, ch, props.data);
  if (world.fresh) world.fresh.draw(c, camera, cw, ch, world.tileAt); // raw edges and silt haze over a fresh crater (fresh.js)
  drawCorpses(c, camera, cw, ch, corpses.data, t);
  if (run.state === S_BIOME) {
    if (world.level.nPockets) drawPocketCracks(c, camera, cw, ch, world.level.pockets, world.level.nPockets, world.tileAt);
    drawDecorBoulders(c, camera, cw, ch, decorBoulders(lv), world.tileAt);
    drawEmbedded(c, camera, cw, ch, embedded.data, { goggles: !!octo.seeBuried, tileAt: world.tileAt, shown: false });
    if (octo.seeBuried) drawPocketReveal(c, camera, cw, ch, loot.data, world.level.pockets || null, world.level.nPockets || 0, world.tileAt);
    drawLoot(c, camera, cw, ch, loot.data, t);
    drawCreaturesBack(c, camera, cw, ch, creatures.data, t); // (wall traps draw in v2PreWall, before the terrain)
    if (shopSt && world.level.shop && visibleAt(cullFlags('shop', 1), 0, world.level.shop.kx, world.level.shop.ky, 9)) drawShop(c, camera, cw, ch, shopSt, run.shells, t, world.tileAt);
    if (shopSt) drawLooseWares(c, camera, cw, ch, shopSt, props, t);
    if (keepers.n) drawKeepers(c, camera, cw, ch, keepers, t); // hostile keepers and their claws (under the octopus, like the enemies)
    let pk = 0;
    for (const ps of poolSts) if (visibleAt(cullFlags('pools', 4), pk++ & 3, ps.plan.x, ps.plan.y, 7)) drawPool(c, camera, cw, ch, ps, run.shells, t);
  }
  if (run.state === S_REST) {
    if (restSpring) drawSpring(c, camera, cw, ch, restSpring.x, restSpring.y, t, restSpring.used);
    if (shopSt && visibleAt(cullFlags('shop', 1), 0, world.level.shop.kx, world.level.shop.ky, 9)) drawShop(c, camera, cw, ch, shopSt, run.shells, t, world.tileAt);
  }
  if (siphonSpot && !siphonSpot.taken && visibleAt(cullFlags('siphon', 1), 0, siphonSpot.x, siphonSpot.y, 1)) {
    const ppu = camera.pxPerUnit;
    drawItemIcon(c, 'siphon', cw / 2 + (siphonSpot.x - camera.x) * ppu, ch / 2 + (siphonSpot.y - 0.08 + Math.sin(t * 1.4) * 0.03 - camera.y) * ppu, ppu * 0.36);
  }
  if (autofire) autofire.draw(c, camera, w2s, cw, ch);
  drawJuiceDrops(c, camera, cw, ch, juiceDrops.data, t, JUICE.life);
  inkJet.draw(c, camera, cw, ch, t);
  drawInkClouds(c, camera, cw, ch, inkClouds.data, t, 0); // the thick ink, over the creatures and under the octopus
}
/** Pushable blocks: each resident chunk's 'block' spawns become PK_BLOCK props once. */
function addBlocks(resident) {
  for (const { index, chunk } of resident) {
    if (blockChunks.has(index)) continue;
    blockChunks.add(index);
    for (const s of chunk.spawns) if (s.type === 'block') props.add(PK_BLOCK, s.x, s.y);
  }
}
/** Materials: wall traps (hazards) and pushable blocks draw BEFORE the terrain, so every terrain material's edge overlaps them. */
function v2PreWall(c, camera, cw, ch) {
  drawBlocks(c, camera, cw, ch, props.data); // blocks only exist in generated levels, so no state test
  if (run.state === S_BIOME) drawHazards(c, camera, cw, ch, hazards.data, sim.time, solidForSight);
}
/** r40: people (the hub residents, the diver, the caged critter) and their speech are drawn after the octopus, so it never hides them. */
function v2People(c, camera, w2s, cw, ch) {
  const lv = world.level, t = sim.time;
  drawInkClouds(c, camera, cw, ch, inkClouds.data, t, 1); // a thin veil of it over the octopus: it reads as inside the cloud
  if (input.mode() !== 'touch' && input.mouse.seen && !octo.dead && !holdDark) drawReticle(c, input.mouse.x, input.mouse.y, camera.pxPerUnit, t);
  drawV2Labels(); // r42: the portal names, over the octopus
  if (run.state === S_HUB && lv.signX !== undefined && lv.signX >= 0) drawHubPeople(c, camera, cw, ch, lv, t);
  if (run.state === S_BIOME && !(npcs && (npcs.owns(NPC_HOST) || npcGone('host')))) for (const ps of poolSts) drawPoolHost(c, camera, cw, ch, ps, t, octo.x);
  if (npcs) drawNpcs(c, camera, cw, ch, npcs, t, octo); // the ones that turned on you, their sight lines and the harpoons
  if (run.state === S_BIOME) { // V2-PLAN 16: the skewering spikes show through the body, the boulder sits on the pancake
    if (octo.deathStyle === 'impale') drawImpaleOverlay(c, camera, cw, ch, octo, hazards.data, t, solidForSight);
    drawSplatRock(c, camera, cw, ch, hazards.data, t, octo);
  }
  if (run.state === S_BIOME) drawCreaturesFront(c, camera, cw, ch, creatures.data, t, octo);
  if (run.state === S_BIOME && quest) drawQuestThing(c, camera, cw, ch, t);
}

// --- V2-PLAN 16: ambush creatures (js/creatures.js) ---
let grabCueShown = false; // the 'Dash to break free!' cue shows once per page
function handleCreatureEvents() {
  if (!creatures.events.length) return;
  takeKilledEvents(creatures.events); // corpses
  for (const ev of creatures.events) {
    switch (ev.type) {
      case 'pearl': // taken from the open clam: shells straight into the purse, no sparkle
        gainShells(run, ev.value);
        discover('item-pearl'); journal.bump('item-pearl', STAT_COLLECTED);
        ui.showToast('A pearl! +' + ev.value + ' shells');
        for (let k = 0; k < 3; k++) particles.trailBubble(ev.x + (k - 1) * 0.15, ev.y - k * 0.1);
        break;
      case 'pearlDrop': pickups.dropShell(ev.x, ev.y, 0, -1.2, SK_PEARL); break;
      case 'killed':
        particles.deathPoof(ev.x, ev.y, '#cfe8ff'); runKills++;
        if (!isSafeState(run)) { run.dive.kills++; journal.bump('creature-' + ev.kind, STAT_KILLED); }
        break;
      case 'snap': if (!ev.far) { particles.shakeFx(ev.kill ? 6 : 2.5, 0.25); for (let k = 0; k < 4; k++) particles.trailBubble(ev.x + (k - 1.5) * 0.4, ev.y - 0.5); } break;
      case 'grab':
        particles.shakeFx(3, 0.2);
        if (!grabCueShown) { grabCueShown = true; ui.showToast('Dash to break free!', 1800); }
        break;
      case 'release': particles.shakeFx(2, 0.15); for (let k = 0; k < 4; k++) particles.trailBubble(ev.x + (k - 1.5) * 0.25, ev.y); break;
      case 'bonk': particles.bouncePuff(ev.x, ev.y, 0, -1); break;
      default: break;
    }
  }
  // handled once: a creature can now be hit between its own updates (a boulder, a block, a shock, a bomb, ink: damage.js), and
  // this runs after each of those; without the clear a pearl or a corpse could be taken twice in one step
  creatures.events.length = 0;
}

// --- round 31: loot and secrets (js/loot.js) ---
let payoutCount = 0;
/** n shells worth of loot, paid in natural pieces (a nautilus, conches, cowries) that pop out around (x, y). */
function dropShells(n, x, y) {
  const kinds = payout(n, mulberry32(((seed >>> 0) ^ Math.imul(++payoutCount, 2654435761)) >>> 0));
  const spots = spreadShells(kinds.length, x, y, solidForSight);
  for (let i = 0; i < spots.length; i++) pickups.dropShell(spots[i].x, spots[i].y, spots[i].vx, spots[i].vy, kinds[i]);
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
/** Materials: once a level's buried finds are loaded, their wall cells are baked again so the hook draws the shells in. */
function bakeEmbedded() {
  if (embedBaked === embedded || !world.touchTile) return;
  const d = embedded.data;
  if (!d.n) return;
  embedBaked = embedded;
  for (let i = 0; i < d.n; i++) world.touchTile(d.tx[i], d.ty[i]);
}
/** Buried treasure (embed.js): a find dropped out of broken rock, or was taken. */
function handleEmbedEvents() {
  for (const ev of embedded.takeEvents()) {
    if (ev.type === 'released') {
      discover('loot-buried');
      journal.bump('loot-buried', STAT_COLLECTED);
      continue;
    }
    if (ev.ek === EK_SHELL) {
      const v = shellValue(ev.sub);
      gainShells(run, v);
      discover('item-shell'); journal.bump('item-shell', STAT_COLLECTED);
      particles.pickupSparkle(ev.x, ev.y, '#c8f5e6'); sfx.chime();
      if (v > 1) ui.showToast('A ' + EMBED_SHELLS[ev.sub].name.toLowerCase() + ', +' + v + ' shells');
    } else if (ev.ek === EK_BOMB) {
      for (let k = 0; k < ev.sub; k++) addBomb(octo);
      discover('item-bomb');
      particles.pickupSparkle(ev.x, ev.y, '#cfe8ff'); sfx.chime();
    } else if (ev.ek === EK_ITEM) takeCarried(itemFromCode(ev.sub), ev.x, ev.y);
  }
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
        particles.pickupSparkle(ev.x, ev.y - 0.3, '#c8f5e6'); sfx.chime();
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
        particles.pickupSparkle(ev.x, ev.y, '#c8f5e6'); sfx.chime();
        discover('loot-relic');
        relicHeld = true;
        ui.showToast('Relic taken, +' + ev.shells + ' shells. The ceiling is coming down!', 4200);
        break;
      case 'chaseEnd': ui.showToast('The rumbling stops'); break;
      case 'rockLanded': particles.bombDebris(ev.x, ev.y); break;
      case 'hurt': particles.deathPoof(ev.x, ev.y, '#d9cdb8'); break;
      default: break;
    }
  }
}

// --- V2-PLAN 16: corpses ---
const blastLog = []; // x, y pairs of this step's bomb explosions
/** A kill event {kind, x, y, vx, vy, face} (enemies.js 'enemyKilled', or 'killed' from creatures.js / npcs.js) becomes a corpse. */
function addCorpseFromEvent(ev) {
  if (!V2 || !ev) return -1;
  const kind = ev.kind === 'crab' && ev.variant === 'fast' ? 'crab-fast' : ev.kind;
  return corpses.add(kind, ev.x, ev.y, ev.vx || 0, ev.vy || 0, ev.face || 1);
}
/** Turn every {type:'killed'} entry of another system's events array into a corpse. */
function takeKilledEvents(list) {
  if (list) for (const ev of list) if (ev.type === 'killed') addCorpseFromEvent(ev);
}

// --- section 14: the Siphon Shell's set spot, and the rest grotto at the end of the zone ---
let siphonSpot = null; // {x, y, taken}: the Siphon Shell lying on a floor near the start of one Shallows level per dive
/** The Shallows level of this dive that holds the Siphon Shell: one of the levels the dive actually plays (a shortcut starts later). */
function siphonLevel() {
  const start = Math.max(1, run.dive.startLevel | 0);
  return start + ((run.diveSeed >>> 0) % (BIOME_LEVELS - start + 1));
}
/** A floor spot 3-9 tiles from the start (open water with rock under it), found by a flood from the start; null if none. */
function findFloorSpot() {
  const sx = Math.floor(world.startX), sy = Math.floor(world.startY);
  const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
  for (let qi = 0; qi < q.length && qi < 900; qi++) {
    const [x, y] = q[qi];
    const d = Math.hypot(x - sx, y - sy);
    if (d >= 3 && d <= 9 && world.isSolid(x + 0.5, y + 1.5) && !world.isSolid(x - 0.5, y + 0.5) && !world.isSolid(x + 1.5, y + 0.5) && !world.isSolid(x + 0.5, y - 0.5)) return { x: x + 0.5, y: y + 0.72 };
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = nx + ',' + ny;
      if (seen.has(k) || world.isSolid(nx + 0.5, ny + 0.5) || d > 9) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return null;
}
let restSpring = null; // {x, y, used}: the rest grotto's spring
const restSay = { at: -99 };
/** The rest grotto: swimming into the spring heals every heart and fills the jar (each time you come back to it). */
function stepRest() {
  if (restSpring && springReach(octo.x, octo.y, restSpring.x, restSpring.y)) {
    const healed = octo.hearts < octo.heartMax, filled = run.juice < juiceCap();
    if (healed || filled || !restSpring.used) {
      octo.hearts = octo.heartMax; prevHearts = octo.hearts;
      run.juice = juiceCap();
      restSpring.used = true;
      particles.pickupSparkle(octo.x, octo.y, '#bfe8d8'); particles.pickupSparkle(octo.x, octo.y - 0.3, '#a98ad8');
      sfx.chime();
      if (sim.time - restSay.at > 4) { ui.showToast('The spring heals you and fills your jar'); restSay.at = sim.time; }
      discover('place-rest');
    }
  }
  const ev = shopStep(shopSt, octo, run.shells, STEP, run.items);
  if (ev) onShopEvent(ev);
}

/** Place this level's shop and, about one level in three, an emergent encounter (the caged critter or the stranded diver). */
function setupLevelExtras() {
  quest = null; shopSt = null; poolSts = []; tutState = createTutorialState(); relicHeld = false; siphonSpot = null; restSpring = null;
  npcs = makeNpcs();
  if (run.state === S_REST) {
    const lv = world.level;
    if (lv.springX >= 0) restSpring = { x: lv.springX, y: lv.springY, used: false };
    shopSt = createShopState(lv.shop, shopItems, run.diveSeed, 7, run.items);
  }
  if (run.state === S_BIOME) {
    const spec = levelSpec(run);
    const eligible = { ...diveStory }; for (const id of diveDone) eligible[id] = -1;
    for (const id of ['marlo', 'pip']) if ((diveStory['gone' + capName(id)] | 0) > 0) eligible[id] = -1; // killed in the last dive or this one: not found
    const plan = planQuest(world.level, questTable, spec.seed, spec.levelIndex, eligible, otherSpawns());
    quest = createQuestState(plan);
    if (plan) {
      questClear = { x: plan.pos[0], y: plan.pos[1] };
      if (world.addPlantKeepOut) world.addPlantKeepOut(Math.floor(plan.pos[0]) - 2, Math.floor(plan.pos[1]) - 2, Math.floor(plan.pos[0]) + 3, Math.floor(plan.pos[1]) + 3); // r46: no foliage over the person or the cage
    }
    shopSt = createShopState(world.level.shop, shopItems, spec.seed, spec.levelIndex, run.items);
    poolSts = planPools(world.level).map(createPoolState);
    setupKeepers(spec);
    if (run.level === siphonLevel() && !run.items.includes('siphon')) { const p = findFloorSpot(); if (p) siphonSpot = { x: p.x, y: p.y, taken: false }; }
  }
}

// --- 2026-10-07: shopkeepers and Spelunky aggro (shopkeeper.js, shop-aggro.js) ---
/** This level's keepers: the stall's own (calm, or hostile at his post when the run is angry) and, in an angry run, maybe one waiting by the exit. */
function setupKeepers(spec) {
  keepers = createKeepers();
  shopBrokenSeen = world.shopTilesBroken | 0;
  if (shopSt) {
    const seat = keeperSeat(world.level.shop);
    shopSt.keeperIdx = addKeeper(keepers, seat.x, seat.y, run.shopAggro ? KM_WAIT : KM_CALM, 1);
    shopSt.keeperCalm = !run.shopAggro;
    shopSt.free = run.shopAggro;
  }
  const lv = world.level;
  if (run.shopAggro && exitGuardWaits(spec.seed, spec.levelIndex) && lv.exitX >= 0) {
    const spot = guardSpot(world.tileAt, lv.exitX, lv.exitY);
    if (spot) addKeeper(keepers, spot.x, spot.y, KM_WAIT, 0);
  }
}

/**
 * Spelunky aggro: every shopkeeper turns on the octopus for the rest of the dive (run.shopAggro, kept across levels, reset
 * by a new dive). The keepers on this level come after it at once; the stall's wares cost nothing now.
 * Registered for other modules as shop-aggro.js shopAggro(reason). Returns true when this call angered them.
 */
/**
 * 2026-10-08, unified creature rules: one shared damage entry (damage.js) for every creature body. Its families forward to this
 * level's systems (proxyFamily), so they are registered once; the hazards, props, loot traps and bombs reach the bodies through it.
 */
function wireDamage() {
  hazards.setDamage(damage); props.setDamage(damage); loot.setDamage(damage);
}
function shopAggro(reason) {
  if (!V2 || !run || run.state !== S_BIOME) return false;
  const first = !run.shopAggro;
  run.shopAggro = true;
  angerAll(keepers);
  if (shopSt) { shopSt.free = true; shopSt.keeperCalm = false; }
  if (!first) return false;
  run.shopAggroWhy = String(reason || 'hurt');
  journal.bump('person-keeper', STAT_KILLED); // the entry's "Angered" counter
  discover('person-keeper');
  ui.showToast(reason === 'theft' ? 'Thief! The shopkeeper is coming for you' : reason === 'shop' ? 'You wrecked his stall. The shopkeeper is coming for you' : 'The shopkeeper is furious', 3200);
  return true;
}
setShopHooks({
  aggro: shopAggro,
  hit: (x, y, r, kind, dmg, fx, fy) => (V2 && run && run.state === S_BIOME ? hitKeepersAt(keepers, x, y, r, kind, dmg, fx, fy) : 0),
  angry: () => !!(run && run.shopAggro),
});

// the ink jet's target list: the enemies plus one reusable stand-in per live shopkeeper (inkjet.js reads x, y, radius, hp, dead)
const keeperProxies = [];
function inkTargets() {
  const list = enemies.all();
  if (V2) inkV16Targets(list);
  if (!(run && run.state === S_BIOME) || !keepers.n) return list;
  for (let i = 0; i < keepers.n; i++) {
    if (keepers.mode[i] === KM_DEAD) continue;
    const p = keeperProxies[i] || (keeperProxies[i] = { keeper: true, i: 0, x: 0, y: 0, radius: KEEPER_R, hp: 1, dead: false });
    p.i = i; p.x = keepers.x[i]; p.y = keepers.y[i]; p.hp = keepers.hp[i]; p.dead = false;
    list.push(p);
  }
  return list;
}
function inkHurt(e, d) {
  if (e.v16 === 1) { creatures.hit(e.x, e.y, e.radius, d, 'ink', octo); handleCreatureEvents(); return; }
  if (e.v16 === 2) { if (npcs) { npcs.hit(e.x, e.y, 0.2, d, 'ink'); npcs.drain(onNpcEvent); } return; }
  if (!e.keeper) { enemies.hurt(e, d); return; }
  hitKeeper(keepers, e.i, HIT_INK, d, octo.x, octo.y);
  e.dead = keepers.mode[e.i] === KM_DEAD;
}
// V2-PLAN 16: stand-ins for the ink jet: a giant clam (its open mouth; a shut one only catches the blob), a tentacle (its tip and
// shell) and the people. A stand-in with hp undefined stops a blob without being hurt and is never auto-aimed (calm people,
// shut shells, a dormant tentacle); hostile people and vulnerable creatures carry hp, so inkHurt routes the hit to their system.
const inkV16Pool = [];
let inkV16N = 0;
function inkV16Proxy(kind, x, y, r, hurtable) {
  const p = inkV16Pool[inkV16N] || (inkV16Pool[inkV16N] = { v16: 0, x: 0, y: 0, radius: 0, hp: undefined, dead: false });
  inkV16N++;
  p.v16 = kind; p.x = x; p.y = y; p.radius = r; p.hp = hurtable ? 1 : undefined; p.dead = false;
  return p;
}
function inkSplatPeople() {
  if (!npcs) return;
  const ev = inkJet.events;
  for (let i = 0; i < ev.nSplat; i++) {
    const x = ev.splat[i * 2], y = ev.splat[i * 2 + 1];
    for (let k = 0; k < inkV16N; k++) {
      const p = inkV16Pool[k];
      if (p.v16 !== 2 || p.hp !== undefined || Math.hypot(p.x - x, p.y - y) > p.radius + INKJET.radius + 0.15) continue;
      npcs.hit(p.x, p.y, 0.2, INKJET.damage, 'ink'); npcs.drain(onNpcEvent);
      break;
    }
  }
}
function inkV16Targets(list) {
  inkV16N = 0;
  if (creatures && !isSafeState(run)) {
    const d = creatures.data;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      if (d.kind[i] === CR_GCLAM) {
        const open = d.state[i] === CL_OPEN || d.state[i] === CL_TREMBLE || d.state[i] === CL_OPENING;
        list.push(inkV16Proxy(1, d.x[i], d.fy[i] - 0.45, 0.85, open));
      } else {
        const st = d.state[i], awake = st !== TN_DORMANT && st !== TN_RETRACT && st !== TN_FED;
        list.push(inkV16Proxy(1, d.x[i], d.y[i], 0.5, awake));
        if (awake) list.push(inkV16Proxy(1, d.tipx[i], d.tipy[i], 0.35, true));
      }
    }
  }
  if (npcs) {
    for (const n of npcs.list()) list.push(inkV16Proxy(2, n.x, n.cy, 0.45, n.hostile));
  }
}

/** What the keepers did this step: hits on them anger the run, a dead keeper leaves his shells, claws whoosh. */
function handleKeeperEvents() {
  const evs = keepers.events;
  for (let n = 0; n < evs.length; n++) {
    const ev = evs[n];
    switch (ev.type) {
      case 'hurt':
        if (ev.kind === HIT_BOMB || ev.kind === HIT_HEAVY) particles.deathPoof(ev.x, ev.y, '#f2a66a');
        else particles.bouncePuff(ev.x, ev.y - 0.3, 0, -1); // it glanced off his shell
        if (!ev.quiet) shopAggro('hurt'); // quiet: the octopus is not to blame (a boulder a creature set off, spikes he ran onto: creature-rules.js)
        break;
      case 'killed':
        particles.deathPoof(ev.x, ev.y, '#e8622a'); particles.bombDebris(ev.x, ev.y);
        dropShells(10, ev.x, ev.y);
        if (shopSt && ev.shop) shopSt.free = true;
        run.dive.kills++;
        if (!ev.quiet) shopAggro('kill');
        break;
      case 'clawLaunch': sfx.dash(); break;
      case 'octoHit': particles.shakeFx(SHAKE_HURT_PX * 1.6); break;
      default: break;
    }
  }
  evs.length = 0;
}

/** An encounter ended well: shells, a quiet line, the People entry, and the person's story moves up one stage. */
function payQuest() {
  const p = quest.plan;
  gainShells(run, p.reward);
  run.dive.quests++;
  sfx.chime();
  particles.pickupSparkle(octo.x, octo.y, '#c8f5e6');
  if (p.journal) { discover(p.journal); journal.bump(p.journal, STAT_COLLECTED); }
  setStory(p.npc, nextStage(diveStory[p.npc] | 0, p));
  diveDone.add(p.npc);
  if (p.id === 'marlo-1') {
    addStory('diverFreed');
  } else if (p.id === 'pip-1') addStory('critterFreed');
  story = getStory();
}

/** The Challenge Pool: the wager starts the falling rocks, a won wager raises the chest, a lost one stops the rocks. */
function onPoolEvent(ev, poolSt) {
  switch (ev.type) {
    case 'paid':
      run.shells -= ev.cost;
      loot.startChase(POOL_SECONDS);
      enemies.despawnNear(poolSt.plan.x, poolSt.plan.y, 9); // the wager is rocks and vents only: whatever swam in is gone
      addStory('poolPaid'); story = getStory();
      discover('place-pool'); journal.bump('place-pool', STAT_KILLED);
      sfx.chime(); particles.pickupSparkle(poolSt.plan.x, poolSt.plan.y - 0.6, '#c8f5e6');
      break;
    case 'lost': loot.stopChase(); break;
    case 'won': sfx.chime(); particles.pickupSparkle(poolSt.plan.x, poolSt.plan.y - 0.6, '#c8f5e6'); break;
    case 'prize':
      dropShells(ev.shells, ev.x, ev.y);
      addStory('poolWon'); story = getStory();
      journal.bump('place-pool', STAT_COLLECTED);
      particles.pickupSparkle(ev.x, ev.y, '#c8f5e6'); sfx.chime();
      break;
    default: break;
  }
}

/** x, y of the level's other spawns (enemies, hazards, loot, boulders): an encounter keeps clear of them. */
function otherSpawns() {
  const out = [];
  for (const s of levelSpawns()) if (s.type !== 'shell' && (s.type !== 'decor' || s.dk === 'boulder')) out.push(s.x, s.y);
  return Float32Array.from(out);
}
function levelSpawns() {
  const rc = world.residentChunks()[0];
  return rc && rc.chunk && rc.chunk.spawns ? rc.chunk.spawns : [];
}

const DECOR_JOURNAL = { foliage: 'prop-weed', boulder: 'prop-boulder', rune: 'prop-rune', fossil: 'prop-fossil', wreck: 'place-wreck' };
const SET_JOURNAL = ['', 'place-wreck', 'place-garden', 'place-gauntlet', 'place-pool'];
function critterJournal(kind) {
  if (kind === 'fish') return 'creature-fish';
  if (kind.startsWith('rune')) return 'prop-rune';
  if (kind.startsWith('fossil')) return 'prop-fossil';
  if (kind.startsWith('bush')) return 'prop-bush';
  return null;
}
/** Scenery met within a few tiles: set-piece rooms, decor spawns, wall critters (props, places, ambient fish). */
function discoverScenery() {
  const lv = world.level;
  for (let i = 0; i < (lv.nSetPieces | 0); i++) {
    const x0 = lv.setPieces[i * 4], y0 = lv.setPieces[i * 4 + 1];
    if (octo.x >= x0 && octo.x < x0 + ROOM_W && octo.y >= y0 && octo.y < y0 + ROOM_H) discover(SET_JOURNAL[lv.setPieces[i * 4 + 2]]);
  }
  for (const s of levelSpawns()) {
    if (s.type !== 'decor') continue;
    const dx = s.x - octo.x, dy = s.y - octo.y;
    if (dx * dx + dy * dy < 42) discover(DECOR_JOURNAL[s.dk]);
  }
  for (const c of decor.visibleCritters(world.residentChunks())) {
    const dx = c.x - octo.x, dy = c.y - octo.y;
    if (dx * dx + dy * dy < 36) discover(critterJournal(c.kind));
  }
}

/** What is lying on the level: the sealed diver, the caged critter (resting on the floor); and the speech bubble. */
function drawQuestThing(c, camera, cw, ch, t) {
  cullView(camera, cw, ch);
  const st = quest, p = st.plan;
  const fade = st.status === ST_ACTIVE ? 1 : Math.max(0, Math.min(1, st.leave / 1.2));
  const near = visibleAt(cullFlags('quest', 1), 0, st.cx, st.cy, 4); // r43: the diver / critter / cage far from the camera is not animated or drawn
  switch (near ? p.kindId : -1) {
    case Q_VAULT:
      if (fade > 0 && !(npcs && npcs.owns(NPC_MARLO))) { c.save(); c.globalAlpha = fade; drawDiver(c, camera, cw, ch, st.cx, st.cy + 0.22, t, st.collected, !st.collected); c.restore(); }
      break;
    case Q_RESCUE:
      if (!st.following) drawCritter(c, camera, cw, ch, st.cx, st.cy, false, t, p.floorY, p.variant);
      else {
        drawCage(c, camera, cw, ch, p.pos[0], p.floorY, 1.25, 1.15, true); // the broken cage stays behind, open
        if (st.status === ST_ACTIVE) drawCritter(c, camera, cw, ch, st.cx, st.cy, true, t, 0, p.variant);
      }
      break;
    default: break;
  }
  const sp = questSpeaker(st);
  drawSpeech(c, camera, cw, ch, sp[0], sp[1], st.talk.text, talkAlpha(st.talk), p.name);
}

// --- the hub residents: Marlo on the ledge, Pip swimming about, Quill on the ledge by the board; each speaks when you come near ---
const HUB_TALK_R = 3.4;
const HUB_TALK_CUT = 1.6; // r40: swimming this far beyond HUB_TALK_R cuts a resident's speech
/** Where a resident is: x, y of the feet (or the centre for the swimmers) and the head height for the bubble. */
function hubPlace(lv, id, t, which = 0) {
  switch (id) {
    case 'marlo': return { x: lv.signX + 0.5, y: lv.signY + 1, head: 1.35, fly: false };
    case 'quill': return { x: lv.boardX + 2.3, y: lv.boardY, head: 1.3, fly: false };
    default: return { x: lv.signX - 1.4 - which * 2.2 + Math.sin(t * 0.7 + which) * 0.8, y: lv.signY - 0.7 + Math.sin(t * 1.3 + which * 2) * 0.22, head: which ? 0.95 : 0.7, fly: true };
  }
}

/** Octopus to a resident (the feet-resident's chest, the swimmer's centre). */
function hubDistance(lv, id, t) { const pl = hubPlace(lv, id, t); return Math.hypot(octo.x - pl.x, octo.y - (pl.fly ? pl.y : pl.y - 0.8)); }

function hubStep(lv) {
  if (lv.signX === undefined || lv.signX < 0) return;
  // Quill with a relic in hand to take: whatever he was saying makes way for it as soon as the octopus is beside him
  if ((story.relics | 0) > (story.relicsGiven | 0) && hubTalk.who === 'quill' && talking(hubTalk.talk)) {
    const q = hubPlace(lv, 'quill', sim.time);
    if (Math.hypot(octo.x - q.x, octo.y - (q.y - 0.8)) < HUB_TALK_R && (story.relicsGiven | 0) < RELICS_NEEDED) { hubTalk.talk.q.length = 0; hubTalk.talk.left = 0; hubTalk.talk.text = ''; hubTalk.who = ''; }
  }
  // r40: swim away from the one who is talking and they stop (beyond the talk radius plus a margin), so the nearest resident gets the turn
  if (hubTalk.who && talking(hubTalk.talk) && hubDistance(lv, hubTalk.who, sim.time) > HUB_TALK_R + HUB_TALK_CUT) {
    const who = hubTalk.who;
    hubTalk.talk.q.length = 0; hubTalk.talk.left = 0; hubTalk.talk.text = '';
    hubTalk.visits[who] = Math.max(0, (hubTalk.visits[who] | 0) - 1); // the cut visit does not count: the thank-you is said next time
    for (const [k, old] of hubTalk.undo) setStory(k, old);
    story = getStory();
    hubTalk.cool[who] = sim.time + 3; hubTalk.who = ''; hubTalk.undo = [];
  }
  talkStep(hubTalk.talk, STEP);
  if (!talking(hubTalk.talk) && hubTalk.who) { hubTalk.cool[hubTalk.who] = sim.time + 7; hubTalk.who = ''; hubTalk.undo = []; }
  if (talking(hubTalk.talk)) return;
  const t = sim.time;
  // the nearest resident in range (off their cool-down) takes the turn
  let pick = null, pickD = Infinity, pickHand = false;
  for (const r of activeResidents()) {
    // Quill holding out for a relic is worth a visit at once; anyone else waits out a short cool-down after speaking
    const handOver = r.id === 'quill' && (story.relics | 0) > (story.relicsGiven | 0) && (story.relicsGiven | 0) < RELICS_NEEDED;
    if (!handOver && (hubTalk.cool[r.id] || 0) > t) continue;
    const d = hubDistance(lv, r.id, t);
    if (d > HUB_TALK_R) continue;
    if ((handOver && !pickHand) || (handOver === pickHand && d < pickD)) { pick = r; pickD = d; pickHand = handOver; }
  }
  if (pick) {
    const r = pick;
    const visit = hubTalk.visits[r.id] | 0;
    const v = hubVisit(questTable, story, r.id, visit);
    say(hubTalk.talk, v.lines);
    hubTalk.visits[r.id] = visit + 1; hubTalk.who = r.id;
    hubTalk.undo = v.set.filter(([k]) => k.startsWith('said')).map(([k]) => [k, story[k] | 0]);
    for (const [k, n] of v.set) { setStory(k, n); if (k === 'relicsGiven') journal.bump('person-collector', STAT_COLLECTED); }
    story = getStory();
    for (const id of v.discover) discover(id);
  }
}

function drawHubPeople(c, camera, cw, ch, lv, t) {
  cullView(camera, cw, ch);
  const fl = cullFlags('hubPeople', 8);
  let k = 0;
  for (const r of activeResidents()) {
    const pl = hubPlace(lv, r.id, t);
    if (!visibleAt(fl, k++ & 7, pl.x, pl.y, 3)) continue; // r43: a resident far from the camera is not animated or drawn (its bubble below still is)
    if (r.id === 'marlo') drawDiver(c, camera, cw, ch, pl.x, pl.y, t, true, false);
    else if (r.id === 'quill') drawCollector(c, camera, cw, ch, pl.x, pl.y, t, r.stage >= 2);
    else drawCritter(c, camera, cw, ch, pl.x, pl.y, true, t, 0, '');
  }
  if (hubTalk.who && hubTalk.talk.text) {
    const pl = hubPlace(lv, hubTalk.who, t);
    drawSpeech(c, camera, cw, ch, pl.x, pl.y - pl.head, hubTalk.talk.text, talkAlpha(hubTalk.talk), questTable.npcById.get(hubTalk.who).name);
  }
}

function onShopEvent(ev) {
  if (ev.type === 'fell') { particles.bombDebris(ev.x, ev.y + 0.5); return; }
  if (ev.type === 'knocked') { particles.bouncePuff(ev.x, ev.y, 0, -1); return; }
  if (ev.type === 'stolen') {
    if (ev.item.journal) discover(ev.item.journal);
    sfx.chime();
    if (!ev.free && !run.shopAggro) shopAggro('theft'); // picked up without paying
    else ui.showToast('Took ' + ev.item.name + (ev.item.effect === 'carry' ? ', ' + ev.item.blurb : ''));
    return;
  }
  if (ev.type === 'bought') {
    run.shells = ev.shells;
    ui.showToast('Bought ' + ev.item.name + ' for ' + ev.price + ' shells' + (ev.item.effect === 'carry' ? ', ' + ev.item.blurb : ''));
    sfx.chime();
    particles.pickupSparkle(octo.x, octo.y, '#c8f5e6');
    journal.bump('person-keeper', STAT_COLLECTED);
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
  addCorpse(kind, x, y, vx, vy, face) { return corpses.add(kind, x, y, vx || 0, vy || 0, face || 1); },
  dropShellAt(x, y, sk) { return pickups.dropShell(x, y, 0, 0, sk || 1); },
  giveBombs(n) { octo.bombs = n | 0; return octo.bombs; },
  /** v2: the corpses (kind, position, velocity, state: 'free' | 'rest') for tests and review. */
  corpses() {
    const d = corpses.data, out = [];
    for (let i = 0; i < d.n; i++) if (d.alive[i]) out.push({ i, kind: corpseKindName(d.kind[i]), x: d.x[i], y: d.y[i], vx: d.vx[i], vy: d.vy[i], rot: d.rot[i], state: d.state[i] ? 'rest' : 'free' });
    return out;
  },
  /** Enemies (kind, position, pattern state, telegraph, stun) and shots, for tests and review. */
  enemies() {
    return enemies.all().filter((e) => !e.ghost).map((e) => ({ drawn: e.cv === 1, id: e.id, kind: e.kind, x: e.x, y: e.y, vx: e.vx, vy: e.vy, st: e.st, t: e.t, tell: e.tell, stun: e.stun, placement: e.placement, face: e.face, dir: e.dir, aim: e.aim, dead: e.dead }));
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
  kill(cause, wait = false) {
    // Force game over, for scripted checks of the overlay/restart without
    // waiting on an enemy or the Beholder. `wait`: keep the 1.5 s of ragdoll before the death screen (V2-PLAN 14).
    killOctopus(octo, cause);
    if (!wait) octo.deathTimer = 0; // skip the wait for the test
    return true;
  },
  /** V2-PLAN 14: the dead body (null while alive): position, velocity, angle, hits taken, prop state (0 free, 1 asleep),
   * its screen position and the death panel's rect (CSS px), and whether the death screen shows. */
  body() {
    if (!octo.dead) return null;
    const i = octo.bodyIdx, d = props.data;
    const p = worldToScreen(renderer.camera, canvas.width, canvas.height, octo.x, octo.y);
    return {
      x: octo.x, y: octo.y, vx: octo.vx, vy: octo.vy, angle: octo.angle, hits: octo.bodyHits, idx: i, state: i >= 0 ? d.state[i] : -1,
      inRock: world.isSolid(octo.x, octo.y), screenX: p.x / dpr, screenY: p.y / dpr, rCss: octo.radius * renderer.camera.pxPerUnit / dpr,
      panel: ui.gameOverPanelRect(), shown: ui.isGameOverShown(), viewW: window.innerWidth, viewH: window.innerHeight,
    };
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
    ragdoll.place(octo, props, x, y);
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
  /** Test hook: whether a level transition runs (cheap: level() copies the whole level, which made garbage when a timing test polled it). */
  transitioning() { return !!transitioning; },
  /** v2: journal ids found, open the journal, apply a run event by name (tests, review). */
  journal() { return { found: journal.list().filter((e) => e.found).map((e) => e.id), count: journal.count(), open: journalScreen.isOpen(), tab: journalScreen.tab(), entry: journalScreen.entry() }; },
  openJournal(tab, entry) { journalScreen.show(tab); if (entry) journalScreen.showEntry(entry); return true; },
  journalSet(tab) { journalScreen.setTab(tab); return true; },
  journalPage() { return journalScreen.page(); },
  stat(id, k) { return journal.stat(id, k); },
  closeJournal() { journalScreen.hide(); return true; },
  /** v2: quest / shop / wallet snapshot for tests and review. */
  extras() {
    return {
      shells: run ? run.shells : 0,
      items: run ? run.items.slice() : [],
      quest: quest ? { id: quest.plan.id, status: quest.status, progress: quest.progress, goal: quest.goal, following: quest.following, pos: Array.from(quest.plan.pos) } : null,
      shop: shopSt ? { keeper: [shopSt.keeperX, shopSt.keeperY], px: Array.from(shopSt.px), stock: Array.from(shopSt.stock, (i) => shopSt.items[i].id), sold: Array.from(shopSt.sold), ware: Array.from(shopSt.ware), pid: Array.from(shopSt.pid), pedGone: Array.from(shopSt.pedGone), stolen: shopSt.stolen, free: shopSt.free, keeperCalm: shopSt.keeperCalm, rect: [world.level.shop.x0, world.level.shop.y0, world.level.shop.x1, world.level.shop.y1] } : null,
      shopAggro: run ? { on: run.shopAggro, why: run.shopAggroWhy } : null,
      story: { ...story },
      pool: poolSts.map((ps) => ({ state: ps.state, t: ps.t, x: ps.plan.x, y: ps.plan.y, floorY: ps.plan.floorY, x0: ps.plan.x0, y0: ps.plan.y0, seen: ps.seen })),
      pockets: world.level.nPockets ? Array.from(world.level.pockets) : [],
      hubTalk: { who: hubTalk.who, text: hubTalk.talk.text },
    };
  },
  /** v2: the hazards of this level (kind code, position, state) for tests and review. */
  hazards() {
    const d = hazards.data, out = [];
    for (let i = 0; i < d.n; i++) out.push({ kind: d.kind[i], x: d.x[i], y: d.y[i], dx: d.dx[i], dy: d.dy[i], len: d.len[i], state: d.state[i], a: d.a[i], b: d.b[i], t: d.t[i], r: d.r[i] });
    return out;
  },
  /** v2: the ambush creatures (kind name, position, state, timers) for tests and review. */
  creatures() {
    const d = creatures.data, out = [];
    for (let i = 0; i < d.n; i++) out.push({ i, kind: d.kind[i] === 1 ? 'gclam' : 'tentacle', alive: !!d.alive[i], x: d.x[i], y: d.y[i], dx: d.dx[i], dy: d.dy[i], mx: d.mx[i], my: d.my[i], state: d.state[i], t: d.t[i], cd: d.cd[i], ang: d.ang[i], pearl: d.pearl[i], tipx: d.tipx[i], tipy: d.tipy[i], hp: d.hp[i], fed: d.fed[i] });
    return out;
  },
  /** Test hook: put a creature down (kind 'gclam' | 'tentacle'; (x, y) = the anchor cell centre, (dx, dy) the facing away from its surface). */
  spawnCreature(kind, x, y, dx = 0, dy = -1) {
    if (!CREATURE_CODE[kind]) return -1;
    return creatures.add({ type: 'creature', ck: CREATURE_CODE[kind], x, y, dx, dy, side: 1, tilt: 0 });
  },
  creatureHit(x, y, r, dmg, src) { return creatures.hit(x, y, r, dmg, src, octo); },
  /** v2: the loot of this level (kind name, position, state) for tests and review. */
  loot() {
    const d = loot.data, out = [];
    for (let i = 0; i < d.n; i++) out.push({ kind: LOOT_NAMES[d.kind[i]], x: d.x[i], y: d.y[i], state: d.state[i], count: d.count[i], aux: d.aux[i] });
    return { items: out, chase: loot.chaseLeft(), rocks: d.nr };
  },
  /** V2-PLAN 16: the NPC slots (who, x, y, hp, hostile, dead, state, aim timer ...), the harpoons in flight and the dive's mood record. */
  npcs() { return npcs ? npcs.list() : []; },
  npcHarpoons() { return npcs ? npcs.harpoonList() : []; },
  npcMood() { return { hostile: Array.from(npcMoods.hostile), dead: Array.from(npcMoods.dead), angered: Array.from(npcMoods.angered), hp: Array.from(npcMoods.hp) }; },
  /** Hurt an NPC ('marlo' | 'pip' | 'quill' | 'host') as if by an attack. */
  hitNpc(who, dmg = 1, src = 'test') { if (!npcs) return false; const r = npcs.hurt(npcByName(who), dmg, src); npcs.drain(onNpcEvent); return r; },
  /** Debug: put an NPC in the level; (x, y) is the anchor (feet for marlo / quill / host, the centre for pip). Hostile ones fight at once. */
  spawnNpc(who, x, y, hostile = false) { if (!npcs) return -1; return npcs.spawn(npcByName(who), x, y, !!hostile); },
  /** 2026-10-07: the level's shopkeepers (mode name, position, hp, tell, claws) for tests and review. */
  keepers() {
    const k = keepers, out = [];
    for (let i = 0; i < k.n; i++) out.push({ i, mode: MODE_NAMES[k.mode[i]], shop: k.shop[i] === 1, x: k.x[i], y: k.y[i], vx: k.vx[i], vy: k.vy[i], hp: k.hp[i], tell: k.tell[i], stun: k.stun[i], cool: k.cool[i], claws: [0, 1].map((s) => ({ st: k.cst[i * 2 + s], x: k.cx[i * 2 + s], y: k.cy[i * 2 + s] })) });
    return { list: out, launches: k.launches };
  },
  /** Test hook: anger the shopkeepers as shop-aggro.js shopAggro(reason) would. */
  shopAggro(reason) { return shopAggro(reason || 'test'); },
  /** Test hook: hit keeper i ('ink' | 'dash' | 'bomb' | 'heavy', damage before his resistance); returns the damage dealt. */
  hitKeeper(i, kind, dmg) { return hitKeeper(keepers, i, { ink: HIT_INK, dash: HIT_DASH, bomb: HIT_BOMB, heavy: HIT_HEAVY }[kind] || HIT_INK, dmg, octo.x, octo.y); },
  /** 2026-10-08, unified creature rules: the creature and source tables (creature-rules.js), read-only. */
  creatureRules() { return { creatures: CREATURES, sources: SOURCES }; },
  /** What `src` would do to a body of `kind` (creature-rules.js resolveHit), as a plain object. */
  resolveHit(kind, src, dmg = -1, shut = false) { return { ...resolveHit(kind, src, dmg, shut) }; },
  /** Test / debug hook: hit body i of a damage family ('enemy' | 'creature' | 'npc' | 'keeper') with `src` through the shared
   * entry, from just under it (byOcto: undefined = the source's own blame). Returns the damage dealt. */
  damageHit(family, i, src, dmg = -1, byOcto = undefined) {
    const f = damage.family(family);
    if (!f) return 0;
    if (f.begin) f.begin();
    if (!f.view(i, damage.view)) return 0;
    const r = damage.hit(f, i, src, damage.view.x, damage.view.y + 0.5, dmg, 1, byOcto);
    if (npcs) npcs.drain(onNpcEvent);
    handleCreatureEvents();
    return r;
  },
  /** Test / debug hook: every live body the shared damage entry sees (family, index, kind, position). */
  damageBodies() { const out = []; damage.each((f, i, V) => out.push({ family: f.name, i, kind: V.kind, x: V.x, y: V.y, r: V.r })); return out; },
  /** Test hook: stop / restart the real-time loop without the pause overlay (frame-by-frame captures with stepDraw). */
  freeze(on) { loop.setPaused(!!on); return loop.paused; },
  /** Test hook: n fixed steps, then draw one frame (works while frozen). */
  stepDraw(n) { loop.manualStep(n | 0); render(0, 16); return sim.time; },
  /** Test hook: break a tile as a bomb would (no blast), e.g. the floor under a pedestal. */
  breakTile(tx, ty) { return world.breakTile(tx, ty); },
  /** v2: the buried treasure of this level (embed.js): tile, kind, tier / item code, state (0 buried, 1 loose, 2 taken), position. */
  embedded() {
    const d = embedded.data, out = [];
    for (let i = 0; i < d.n; i++) out.push({ tx: d.tx[i], ty: d.ty[i], ek: d.ek[i], sub: d.sub[i], state: d.state[i], x: d.x[i], y: d.y[i] });
    return { items: out, goggles: !!octo.seeBuried };
  },
  /** Section 14 test hooks: the jar, droplets, clouds, the ink jet, the hotbar and the inventory. */
  juice() {
    const hb = run ? hotbar() : null;
    return {
      juice: run ? run.juice : 0, casts: run ? castsOf(run.juice) : 0, cap: juiceCap(), perCast: JUICE.perCast, drops: juiceDrops.count(), clouds: inkClouds.count(),
      cloudList: Array.from({ length: inkClouds.data.n }, (_, i) => i).filter((i) => inkClouds.data.alive[i]).map((i) => ({ x: inkClouds.data.x[i], y: inkClouds.data.y[i], r: inkClouds.data.r[i], age: inkClouds.data.age[i] })),
      hotbar: hb ? { slots: hb.slots.map((sl) => sl.ids.slice()), sel: hb.sel, spell: selectedSpell(hb) } : null,
      inventory: inventoryOpen, ...runStats, jet: inkJet.count(), jetCooldown: inkJet.cooldown(),
      siphonSpot: siphonSpot ? { ...siphonSpot } : null, siphonLevel: run && run.state === S_BIOME ? siphonLevel() : -1, spring: restSpring ? { ...restSpring } : null, state: run ? run.state : -1,
      hearts: octo.hearts, heartMax: octo.heartMax, siphonR: octo.siphonR || 0,
      dropList: Array.from({ length: juiceDrops.data.n }, (_, i) => i).filter((i) => juiceDrops.data.alive[i]).map((i) => [+juiceDrops.data.x[i].toFixed(2), +juiceDrops.data.y[i].toFixed(2)]), octo: [+octo.x.toFixed(2), +octo.y.toFixed(2)],
    };
  },
  setJuice(n) { if (run) run.juice = Math.max(0, Math.min(juiceCap(), n | 0)); return run ? run.juice : 0; },
  dropJuice(x, y, n) { juiceDrops.spawn(x != null ? x : octo.x, y != null ? y : octo.y, n || 3); return juiceDrops.count(); },
  /** Whether a creature at (x, y) has lost the octopus to an ink cloud. */
  inkHides(x, y) { return inkClouds.hides(x, y, octo.x, octo.y); },
  openInventory() { return openInventory(); },
  closeInventory() { return closeInventory(); },
  /** Test hook: no contact damage while on (scripted whole-run playthroughs). */
  god(on) { godMode = on == null ? !godMode : !!on; return godMode; },
  /** Test hook: set a story flag (save.js STORY_KEYS) as if it had happened; returns the story. */
  setStory(k, n) { if (k) { setStory(k, n); story = getStory(); if (run && run.state === S_HUB) arriveInHub(); } return { ...story }; },
  /** Test hook: carry an item as if it had been found (items.js). */
  giveItem(id) { return run ? giveItem(run.items, octo, id) : false; },
  giveShells(n) { if (run) gainShells(run, n | 0); return run ? run.shells : 0; },
  runEvent(name) {
    const ev = { enter: EV_ENTER_DIVE, exit: EV_EXIT, death: EV_DEATH, continue: EV_CONTINUE, shortcut: EV_ENTER_SHORTCUT, shortcut3: EV_ENTER_SHORTCUT3 }[name];
    return v2Event(ev);
  },
  /** Settings menu: open / close / read (tests, review). */
  settings() { return { open: settingsPanel.isOpen(), values: getSettings(), sink: octo.sink, nextSeed: run ? run.nextSeed : null, bus: audio.busGains(), reduced: prefersReducedMotion() }; },
  openSettings() { settingsPanel.show(); return true; },
  closeSettings() { settingsPanel.hide(); return true; },
  /** r41: memory of this level (the renderer's baked canvases, the JS heap where the browser reports it) and the live synthesised sources. */
  memory() {
    const c = renderer.canvasStats();
    const pm = typeof performance !== 'undefined' && performance.memory ? performance.memory : null;
    const pool = canvasPoolStats(), cs = cullStats(), MB = 1048576;
    return {
      rendererCanvases: c.n, rendererCanvasBytes: c.bytes, heap: pm ? pm.usedJSHeapSize : null, sources: audio.sources().length,
      // r43: canvases = the ones in use (pool.live, plus the page-wide small ones below), canvasMB their size, poolMB the free ones kept for the next level
      canvases: pool.live + pool.shared, canvasMB: +((pool.liveBytes + pool.sharedBytes) / MB).toFixed(2), sharedMB: +(pool.sharedBytes / MB).toFixed(2), poolMB: +(pool.pooledBytes / MB).toFixed(2), pooled: pool.pooled,
      allocatedMB: +(pool.allocatedBytes / MB).toFixed(2), allocated: pool.allocatedCount, reused: pool.reuseCount,
      heapMB: pm ? +(pm.usedJSHeapSize / MB).toFixed(1) : null,
      drawnEntities: cs.drawn, totalEntities: cs.total, setupMaxMs: renderer.timing().warmMax, wallsMaxMs: renderer.timing().wallsMax, bake: c.bake, cells: c.cells, deepStage: c.deepStage,
    };
  },
  /** r43 test hook: a generated level (built by the worker) equals what the main thread generates for the same seed; null in the hub / tutorial. */
  levelMatchesMainThread() {
    const spec = levelSpec(run);
    if (!V2 || spec.kind !== 'generated') return null;
    const lv = generateLevel(spec.seed, spec.levelIndex), t = world.level.tiles;
    for (let i = 0; i < t.length; i++) if (lv.tiles[i] !== t[i]) return false;
    return lv.exitX === world.level.exitX && lv.exitY === world.level.exitY && lv.startX === world.level.startX;
  },
  /** r43 test hook: the duration of each transition step so far (generate, spawns, world, reset). */
  stepLog() { return stepLog.slice(); },
  /** r43 test hook: how many entities of each kind the last frame drew, and whether the first view of the level is baked. */
  renderReady() { return renderer.ready(); },
  /** r43 test hook: when the last transition started and when its screen began to fade back in (performance.now ms). */
  lastTransition() { return lastDark ? { ...lastDark } : null; },
  /** r45 test hook: the entry now ({t, centre, pose, sealed, iris radius}) or null; lastEntry(): the last one's timing and per-step poses. */
  entry() { return entry ? { t: entry.t, cx: entry.cx, cy: entry.cy, x: entry.x, y: entry.y, rot: entry.rot, scale: entry.sc, sealed: !!octo.sealed, hidden: !!octo.hidden, vx: octo.vx, vy: octo.vy, hearts: octo.hearts, iris: lastIrisR } : null; },
  /** r45 test hook: how many times the swim physics (stepOctopus) has run, and what the octopus was last drawn as ({x, y, rot, scale} interpolated, or null if hidden). */
  physSteps() { return octoPhysSteps; },
  drawnOcto() { return octo.__drawn ? { ...octo.__drawn } : null; },
  /** r45 test hook: stop the rAF loop and run n frames of dtMs each synchronously (a display at 1000/dtMs Hz), recording what was drawn each frame; then restart the loop (unless hold). */
  frames(n, dtMs, hold) {
    loop.stop();
    const rec = [];
    try {
      loop.manualFrames(n, dtMs, () => { const d = octo.__drawn; rec.push(d && !octo.hidden ? { ...d, t: entry ? entry.t : -1, iris: lastIrisR } : null); });
    } finally { if (!hold) loop.start(); } // hold: leave the loop stopped (a screenshot of exactly this frame); frames(0) starts it again
    return rec;
  },
  lastEntry() { return entryLog ? { ...entryLog } : null; },
  /** r44 test hook: the exit / dive whirlpool's play state ('appear', 'idle', 'near', 'enter', 'swallow', 'gone'). */
  portalMode() { const lv = world.level; return portalMode(portalKey(lv.exitX, lv.exitY)); },
  /** r41: the live audio sources: synthesised ones (kind, loop) and the music elements. */
  audioSources() { return audio.sources(); },
  /** r41 test hook: play a synthesised effect by name (dash, hurt, chime, bomb). */
  sfx(name) { if (typeof sfx[name] === 'function' && name !== 'stopAll') sfx[name](); return audio.sources().length; },
  audio() {
    return { started: audio.isStarted(), muted: audio.isMuted(), track: audio.currentTrack() };
  },
};
