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
import { isBaked, setOctopusSkin, getOctopusSkin } from './octopus-draw.js';
// 2026-10-08 skins: each person gives a look the first time they are rescued or befriended (skins.js, skin-draw.js, skin-gifts.js)
import { getSkins, unlockSkins, getSkin, setSkin as saveSkin } from './save.js';
import { newSkins, earnedSkins, skinById, DEFAULT_SKIN } from './skins.js';
import { createSkinGifts, drawSkinGifts, drawMirrorShell, mirrorPoint, MIRROR_REACH } from './skin-gifts.js';
import { createSkinPicker } from './skin-picker.js';
import { skinSheetStats } from './skin-draw.js';
import { createEnemies, setHpMode } from './enemies.js';
import { createHazards, hazardJournalId, makeHazardRecord } from './hazards.js';
import { drawHazards, drawImpaleOverlay, drawSplatRock } from './hazards-draw.js';
import { createCreatures, creatureJournalId, CREATURE_CODE, CR_GCLAM, CL_OPENING, CL_OPEN, CL_TREMBLE, TN_DORMANT, TN_RETRACT, TN_FED } from './creatures.js';
import { drawCreaturesBack, drawCreaturesFront } from './creatures-draw.js';
import { drawBlocks } from './blocks-draw.js';
import { createLoot, lootJournalId, spreadShells, findSwarmSpots, TRAP_SWARM, LOOT_NAMES, LOOT_CODE as LOOT_CODE_ } from './loot.js';
import { applyCarried, giveItem, itemJournalId, pickupText, itemFromCode } from './items.js';
import { drawLoot, drawLootOne } from './loot-draw.js';
import { createEmbedded, EK_SHELL, EK_BOMB, EK_ITEM, EMBED_SHELLS, shellValue } from './embed.js';
import { drawEmbedded, drawPocketReveal, drawTreasureTile } from './embed-draw.js';
import { MAT_ROCK, MAT_BONE, MAT_BOULDER_BREAKS, setTileDrawHook } from './materials.js';
import { fetchPatterns, setPatternTable } from './patterns.js';
import { fetchFoliage, setFoliageTable } from './foliage.js';
import { createAutofire } from './autofire.js';
import { createBombs, spawnRubble, DROP_BELOW } from './bomb.js';
import { createHand, stepHand, attach as handAttach, stepFlying, updateTarget, phoneHandMode, registerInteract, handPoint, PRI_TALK, PRI_PORTAL, HAND_REACH } from './hand.js';
import { registerHandKinds } from './hand-kinds.js';
import { drawHandTell, drawHeldArm, drawHeldGrip, drawKeeperNotice, drawKeyHint } from './hand-draw.js';
import { drawEnemyOne, drawBombOne } from './enemy-draw.js';
import { drawTrace } from './draw-trace.js';
import { createProps, PROP_NAMES, PK_BLOCK } from './props.js';
import { createRagdoll } from './ragdoll.js';
import { createCorpses, kindName as corpseKindName } from './corpses.js';
import { drawCorpses, drawCorpseOne } from './corpses-draw.js';
import { createParticles } from './particles.js';
import { createUI } from './ui.js';
import { computeScore } from './score.js';
import { SHELL_NAMES, SK_PEARL, SK_MOON, MOON_VALUE, payout } from './shells.js';
import { beholderTiming } from './beholder.js';
import { swimDistance, swiftTarget, createSwift, stepSwift } from './swift.js';
import { mulberry32 } from './rng.js';
import { getJournalStats, saveJournalStats, getStory, addStory, setStory, loadBest, getSettings, setSetting, resetProgress, recordRun, getJournalIds, saveJournalIds, getTutorialDone, setTutorialDone, getHelpDone, setHelpDone, recordDive, getBestRuns, getMeta, getShortcut, setShortcut } from './save.js';
import { summaryRows, summaryHeadline, bestRunLines } from './runstats.js';
import {
  createRun, runEvent, levelSpec, levelTitle, stageLabel, isSafeState, nextDiveSeed, gainShells, endDive, deathTitle, BIOME_LEVELS, BIOME_NAME,
  S_HUB, S_TUTORIAL, S_BIOME, S_END, S_REST, REST_NAME, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, EV_CONTINUE, EV_ENTER_SHORTCUT, SHORTCUT_LEVEL, EV_ENTER_SHORTCUT3, SHORTCUT3_LEVEL,
  EV_ENTER_TUTORIAL, EV_RESTART, EV_LEAVE, diveOpen, canQuickRestart,
} from './run.js';
import { parseAuthoredMap, fetchAuthoredMaps } from './authored.js';
import { createJournal, creatureId, itemId, causeEntryId, ENTRIES, STAT_KILLED, STAT_KILLED_BY, STAT_COLLECTED, STAT_SEEN, STAT_USED, STAT_CARRIED } from './journal.js';
import { carriedJournalIds } from './carried.js';
import { createJournalScreen } from './journal-ui.js';
import { hasLineOfSight } from './pathfind.js';
import { drawV2Marks, drawV2Labels } from './v2-draw.js';
import { resetPortalStates, setPortalHold, portalEnter, portalCenter, portalKey, portalMode, whirlpoolReady } from './portal-draw.js';
import { drawPocketCracks, drawWallCue, drawCritter, drawCage, drawDiver, drawCollector, drawHubLantern, drawSpeech, drawShop, drawRubble, drawDecorBoulders, drawWrecks } from './v2-props-draw.js';
import { generateLevel } from './level.js';
import { buildLevelSpawns } from './level-spawns.js';
import { fetchQuests, planQuest, createQuestState, questUpdate, questOnExit, questBlast, questInk, questSpeaker, hubResidents, hubVisit, collectorArrives, nextStage, DIVER_RUNS, RELICS_NEEDED, Q_RESCUE, Q_VAULT, Q_MEET, ST_ACTIVE, ST_DONE, ST_FAILED as ST_FAILED_Q, questReact } from './quests.js';
import { createPeople, G_ANGRY, G_DEAD } from './people.js';
import { pickOutcome, beatSeed, DUE_REST } from './visitors.js';
import { createIdle, idleStep, idleReact, idleLift } from './idle.js';
import { drawPerson } from './people-draw.js';
import { planPools, createPoolState, poolStep, inPoolRoom, POOL_IDLE_VENT, POOL_COST, POOL_SECONDS, PL_IDLE, PL_ACTIVE, PL_WON } from './pool.js';
import { drawPool, drawPoolHost } from './pool-draw.js';
import { createTalk, say, talkStep, talkAlpha, talking } from './speech.js';
import { ROOM_W, ROOM_H } from './rooms.js';
import { fetchShopItems, createShopState, shopStep, shopBlast, shopWares, keeperSeat, shopKnock, W_SHELF, WARE_R } from './shop.js';
import { createDamage, proxyFamily } from './damage.js';
import { createChain } from './chain.js';
import { drawChain } from './chain-draw.js';
import { TRIGGERS, TRIGGER_TARGET_NAMES as TRIGGER_NAMES_, INFIGHT_KILL } from './creature-rules.js';
import { createInfight } from './infight.js';
import { CREATURES, SOURCES, resolveHit, HAZARD_COOL } from './creature-rules.js';
import { createKeepers, addKeeper, stepKeepers, hitKeeper, hitKeepersAt, keeperFamily, angerAll, exitGuardWaits, guardSpot, KM_CALM, KM_WAIT, KM_ANGRY, KM_DEAD, KEEPER_R, MODE_NAMES } from './shopkeeper.js';
import { drawKeepers, drawLooseWares, drawWare } from './shopkeeper-draw.js';
import { setShopHooks, HIT_INK, HIT_DASH, HIT_BOMB, HIT_HEAVY } from './shop-aggro.js';
import { createTutorialState, tutorialStep, tutorialActed, tutorialRooms, openAllDoors } from './tutorial.js';
import { drawTutorialSigns } from './tutorial-draw.js';
import { drawContactShadows } from './feel-draw.js';
import { OCTO_IDLE_SINK, SHAKE_HURT_PX, HITSTOP_S, SPLAT_SHAKE_PX, SPLAT_HITSTOP, prefersReducedMotion, setMotionSettings, osPrefersReducedMotion } from './config.js';
import { createSettingsPanel } from './settings-ui.js';
import { seedFromText } from './settings.js';
import { HEART_MAX, BOMB_MAX, BOMB_RADIUS, SWIM_MAX_SPEED, TRAIL_BUBBLE_PERIOD_MIN, TRAIL_BUBBLE_PERIOD_MAX, DREAD_RANGE } from './config.js';
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
import { JUICE, juiceStart, juiceCap, castsOf, addJuice, dropCount, castSpell, spellById, createJuiceDrops, createInkClouds, CAST_OK, CAST_EMPTY, resolveSlot, slotPrice, SLOT, START_SPELL } from './spells.js';
import { createSpellFx } from './spell-fx.js';
import { runeForLevel, takeRune, runeName, PICKUP_DWELL, PEDESTAL_R } from './runes.js';
import { drawSpellFx, drawRunePedestal, drawAnchorHeld } from './spell-fx-draw.js';
import { drawJuiceDrops, drawInkClouds } from './spells-draw.js';
import { createInkJet, autoAim, drawReticle, INKJET } from './inkjet.js';
import { resetAmbient, killAmbient, ambientPos, ambientDeadCount, AMBIENT_R } from './ambient.js';
import { CR_DASH } from './fragile.js';
import { createHotbar, selectNext, selectIndex, selectedSpell, selectedIds, moveSlot, swapSlots, castableSpell, castableIndex, isItemId, BOMB_SLOT } from './hotbar.js';
import { createHotbarUI } from './hotbar-ui.js';
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
// ?movetest=1: the hand-made movement test room (data/movement-test.json; tests/movement.test.js and movement-cdp.js swim
// the same room). A safe state (no enemies, no hazards), built like the hub from an authored map, never by the generator.
const MOVETEST = V2 && params.get('movetest') === '1';
let movetestJson = null;
if (MOVETEST) {
  movetestJson = await (await fetch(new URL('../data/movement-test.json', import.meta.url))).json();
  run.state = S_HUB;
}
/** The movement test room as a level: its exit (sealed in rock in the map) is moved off the map, so nothing leads out. */
function movetestLevel() {
  const lv = parseAuthoredMap(movetestJson);
  lv.exitX = lv.exitY = -100;
  return lv;
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
  if (MOVETEST) return createLevelWorld(spec.seed, 0, { level: movetestLevel() });
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
// 2026-10-08, enemy infighting (infight.js, creature-rules.js INFIGHT): the few deliberate creature-vs-creature rules and the
// lure hook, on the same damage entry; the getters follow the current level's corpses and props
const infight = createInfight(damage, { corpses: () => corpses, props: () => props });
if (V2) wireDamage();
// chain reactions (chain.js, creature-rules.js TRIGGERS): one queue of delayed links; its target adapters forward to this level's
// systems (like the damage families), so they are registered once
const chain = createChain();
const chainProxy = (name, get) => ({ name, each(x, y, r, cb) { const a = get(); if (a) a.each(x, y, r, cb); }, fire(i, c) { const a = get(); return a ? a.fire(i, c) : false; } });
const hzTargets = () => hazards.chainA || (hazards.chainA = hazards.chainTargets());
const crTargets = () => creatures.chainA || (creatures.chainA = creatures.chainTargets());
const ltTargets = () => loot.chainA || (loot.chainA = loot.chainTargets());
chain.register(chainProxy('bomb', () => bombs.chainA || (bombs.chainA = bombs.chainTarget())));
chain.register(chainProxy('rock', () => hzTargets()[0]));
chain.register(chainProxy('eel', () => hzTargets()[1]));
chain.register(chainProxy('jet', () => hzTargets()[2]));
chain.register(chainProxy('clam', () => crTargets()[0]));
chain.register(chainProxy('tentacle', () => crTargets()[1]));
chain.register(chainProxy('pot', () => ltTargets()[0]));
chain.register(chainProxy('trap', () => ltTargets()[1]));
chain.register({ // fragile tiles (bone, timber; materials.js MAT_BOULDER_BREAKS): index = ty * width + tx
  name: 'tile',
  each(x, y, r, cb) {
    if (!world.smashTile || !world.tileAt) return;
    const W = world.width, x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= W || Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > r || !MAT_BOULDER_BREAKS[world.tileAt(tx, ty)]) continue;
      cb(ty * W + tx, tx + 0.5, ty + 0.5);
    }
  },
  fire(i) { const W = world.width, tx = i % W, ty = (i - tx) / W; return !!world.smashTile(tx, ty); },
});
/** What a fired link looks and sounds like on top of its target's own reaction (chain-draw.js draws the motes and rings). */
function handleChainEvents() {
  for (const ev of chain.events) {
    sfx.chainTick(ev.depth);
    if (ev.target === 'tile') particles.bombDebris(ev.x, ev.y);
    else if (ev.target === 'jet') for (let k = 0; k < 5; k++) particles.trailBubble(ev.x + (k - 2) * 0.25, ev.y - k * 0.3);
    else if (ev.target === 'rock') particles.bombDebris(ev.x, ev.y - 0.5);
  }
  if (chain.events.length) { handleCreatureEvents(); handleLootEvents(); }
}
// materials: the always-visible basic shells are baked into the main-rock wall cells (the goggles view stays live, drawEmbedded)
if (V2) setTileDrawHook((ctx, tx, ty, mat, px, py, s) => { if (mat === MAT_ROCK) drawTreasureTile(ctx, embedded.data, tx, ty, px, py, s, false); });
let embedBaked = null; // the embedded set whose tiles were last marked for a re-bake
let bombs = createBombs(V2 ? props : null);
let particles = createParticles();
// section 14: fish juice droplets, ink clouds and the ink jet of this level (spells.js, inkjet.js)
let juiceDrops = createJuiceDrops();
let inkClouds = createInkClouds();
let inkJet = createInkJet();
const inkPhys = { props: null, corpses: null }; // what an ink blob shoves (inkjet.js hitPhys); refreshed each step
let inkResident = null; // this step's resident chunks, for the ambient fish the blobs can hit (inkAmbientTargets)

if (V2) enemies.setInkClouds(inkClouds);
// controls 2026-10-08 (V2-PLAN 17): the hand on F (hand.js; the built-in targets are hand-kinds.js, talking is below)
let hand = createHand();
let handTap = false; // test hook __octo.pressHand(): the next step sees one tap of the hand button
let keeperNotice = 0; // s left of the shopkeeper's '!' (he saw a ware knocked off its pedestal)
// SPELLS-PICK.md: the level side of Riptide, Coral Wall, Anchor and the Delayed motes (spell-fx.js); the rune pedestal of this level (runes.js)
let spellFx = createSpellFx({ world, hazards, props, damage: V2 ? damage : null, clouds: inkClouds, infight: V2 ? infight : null });
let runeSpot = null;
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
let levelClock = 0; // the HUD's level clock (s on this level; dive states only; stops with the run clock: pause, death, fades)
let swift = null; // Swift Current (swift.js): this level's target time, earned flag and the moon shell it brought
let questClear = null; // [x, y, ...]: enemies within QUEST_CLEAR_R of these are removed after the level's first enemy update (the encounter, r3: the visitors)
const QUEST_CLEAR_R = 3;
let shopSt = null;
let keepers = createKeepers(); // 2026-10-07: this level's shopkeepers (the stall's, a guard at the exit), shopkeeper.js
let shopBrokenSeen = 0;        // world.shopTilesBroken already answered with aggro
const wareEvents = [];
let poolSts = []; // r39: this level's Challenge Pools (pool.js), one per pool room
let tutState = createTutorialState();
let tutBuys = 0; // wares taken from the tutorial's free stall (its room's goal)
let story = getStory(); // the stage of Marlo, Pip and Quill, relics handed over, pool wagers (save.js): who waits in the hub
let diveStory = { ...story }; // the story as the dive began: people move on between dives, never within one
const diveDone = new Set(); // people whose scene was finished in this dive (nobody appears twice in a dive)
// owners round 3 (quests rework, people.js): meetings owed further down the dive, grudges, and this level's visitors with a reward
const people = createPeople();
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
if (V2 && run.state === S_HUB && !MOVETEST) arriveInHub();

// --- Tutorial unlock (Spelunky style): the hub's dive is sealed by kelp until the tutorial has been finished once ---
let sealBumpAt = -99;   // sim time the octopus last bumped into the kelp (it shivers; the thud and the puff at most every 0.8 s)
let unlockAnim = null;  // the unlock moment after the first finished tutorial: {t, seal, said}; the camera visits the dive while the kelp lets go
const UNLOCK_PAN_S = 0.9, UNLOCK_OPEN_AT = 1.0, UNLOCK_OPEN_S = 1.1, UNLOCK_BACK_AT = 2.5, UNLOCK_END_S = 3.3, UNLOCK_INPUT_S = 2.6;
/** How shut the hub's dive is: 1 sealed, 0 open (in between while the unlock moment plays); 0 outside the hub. */
function hubSeal() {
  if (!V2 || run.state !== S_HUB || MOVETEST) return 0;
  if (unlockAnim) return unlockAnim.seal;
  return diveOpen(run) ? 0 : 1;
}
/** The octopus swam into the sealed dive: pushed back up out of the ring, the kelp shivers. */
function sealedBump(lv) {
  const cx = lv.exitX + 0.5, cy = lv.exitY + 0.5, dx = octo.x - cx;
  octo.vy = Math.min(octo.vy, -3.2);
  octo.vx += Math.sign(dx || 1) * 0.6;
  if (sim.time - sealBumpAt > 0.8) { sfx.thud(); particles.bouncePuff(cx, cy - 0.2, 0, -1); }
  sealBumpAt = sim.time;
}
const smooth01 = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
function stepUnlock(dt) {
  const u = unlockAnim;
  u.t += dt;
  u.seal = 1 - smooth01((u.t - UNLOCK_OPEN_AT) / UNLOCK_OPEN_S);
  if (!u.said && u.t >= UNLOCK_OPEN_AT) {
    u.said = true;
    const lv = world.level, cx = lv.exitX + 0.5, cy = lv.exitY;
    sfx.chime();
    for (let i = 0; i < 5; i++) particles.pickupSparkle(cx - 1 + i * 0.5, cy + 0.3, i % 2 ? '#8fc46a' : '#c8f5e6');
    particles.bouncePuff(cx, cy + 0.5, 0, -1);
    ui.showTitle('The dive is open', '', 2200);
    ui.showToast('Swim to the whirlpool and press F to start a run', 3600);
  }
  if (u.t >= UNLOCK_END_S) unlockAnim = null;
}
/** The unlock moment starts: the octopus is put beside the dive (so the dive is on screen on any display) and waits. */
function startUnlock() {
  run.diveUnlocked = false;
  unlockAnim = { t: 0, seal: 1, said: false };
  const lv = world.level, x = lv.exitX + 2.7, y = lv.exitY - 0.6;
  if (!world.isSolid(x, y)) { octo.x = octo.prevX = x; octo.y = octo.prevY = y; octo.vx = octo.vy = 0; ragdoll.place(octo, props, x, y); }
}
/** The camera leans to the dive during the unlock moment and comes back to the octopus at the end. */
function unlockCameraBias() {
  const u = unlockAnim, lv = world.level;
  const k = u.t < UNLOCK_BACK_AT ? smooth01(u.t / UNLOCK_PAN_S) : 1 - smooth01((u.t - UNLOCK_BACK_AT) / (UNLOCK_END_S - UNLOCK_BACK_AT));
  return { x: lv.exitX + 0.5, y: lv.exitY - 0.5, k: k * 0.7 };
}

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
  onQuickRestart() { quickRestart(); },
  onLeaveTutorial() { leaveTutorial(); },
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

// v2 journal (B1-4): entries persisted through save.js; the book opens from Tab / I, the pause menu and Settings (the hub board is gone, 2026-10-08).
const journal = createJournal({ load: getJournalIds, save: saveJournalIds, loadStats: getJournalStats, saveStats: saveJournalStats });
const seenDive = new Set(); // entry ids already counted as seen in this dive / hub visit
const journalScreen = createJournalScreen(hudEl, journal, {
  onClose() { if (inventoryOpen) { inventoryOpen = false; applyPaused(); } syncModal(); },
  onOpen() { ui.setPrompt(null); noteCarried(); journal.flush(); syncModal(); },
  getStats() { return { meta: getMeta(), bestRuns: getBestRuns() }; },
  getStory() { return getStory(); },
  reducedMotion: prefersReducedMotion,
  // 2026-10-08: the Carried page (Tab / I): what the octopus carries now, and the hotbar order (drag or pick-and-swap there)
  getCarried() { return V2 && run ? carriedState() : null; },
  onSwap(a, b) { if (V2 && run) swapSlots(hotbar(), a, b); },
  onSelectSlot(i) { if (V2 && run) selectIndex(hotbar(), i); },
});
/** A full-screen panel is open: the HUD row (hearts, stats) hides under it. */
function syncModal() { hudEl.classList.toggle('octo-modal-open', settingsOpen || journalScreen.isOpen() || inventoryOpen || looksOpen); }
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
  onOpenLooks() { settingsPanel.hide(); openLooks(); },
});
// section 14: the hotbar (spells, bombs, the juice jar) and the inventory panel (Tab / I, pauses the game)
const hotbarUI = createHotbarUI(hudEl, { onSelect(i) { if (V2) selectIndex(hotbar(), i); } });
if (!V2) hotbarUI.setVisible(false);
hotbarUI.setCompact(isCoarsePointer());
// 2026-10-08: Tab / I open the journal on its Carried page (journal-ui.js) and pause the game; Tab, I, Esc or Close shut it.
// `inventoryOpen` = the book was opened that way (it pauses; the pause menu's book is opened while already paused).
let inventoryOpen = false;
/** What the octopus carries, for the Carried page (carried.js). */
function carriedState() {
  const m = input.mode() || (matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');
  return { ...hotbarState(), items: run.items.slice(), touch: m === 'touch' };
}
function hotbarState() {
  const hb = hotbar();
  return { slots: hb.slots, sel: hb.sel, spellName: (id) => { const r = spellById(id); return r ? r.name : id; }, bombs: octo.bombs, bombMax: octo.bombMax, juice: run.juice, cap: juiceCap(), perCast: JUICE.perCast, jetCharge: inkJet.charge() };
}
function openInventory() {
  if (!V2 || inventoryOpen || octo.dead || transitioning || settingsPanel.isOpen() || ui.isEndShown()) return false;
  if (journalScreen.isOpen()) journalScreen.setTab('carried'); else journalScreen.show('carried');
  inventoryOpen = true; ui.setPrompt(null);
  applyPaused(); syncModal();
  return true;
}
function closeInventory() {
  if (!inventoryOpen && !journalScreen.isOpen()) return false;
  journalScreen.hide(); // its onClose clears inventoryOpen and unpauses
  inventoryOpen = false; applyPaused(); syncModal();
  return true;
}
// --- 2026-10-08 skins: the looks the octopus can wear. A person's look unlocks the first time they are rescued or befriended
// (skins.js earnedSkins, from the story counters); the gift moment (skin-gifts.js) flies their trinket over, then 'New look: ...'.
// The look is picked at the hub's mirror shell (F) or Settings > Looks (skin-picker.js) and kept in the save.
const skinGifts = createSkinGifts();
let looksOpen = false;
const lookJournal = (id) => skinById(id).journal;
if (getSkins() === null) unlockSkins(earnedSkins(story)); // a save from before skins: what its story earned, quietly
for (const id of getSkins()) journal.discover(lookJournal(id));
setOctopusSkin(getSkin());
const looksPicker = createSkinPicker(hudEl, {
  getUnlocked: () => getSkins() || [DEFAULT_SKIN],
  getCurrent: () => getSkin(),
  onWear(id) { setOctopusSkin(saveSkin(id)); sfx.chime(); },
  onOpen() { looksOpen = true; ui.setPrompt(null); applyPaused(); syncModal(); },
  onClose() { looksOpen = false; applyPaused(); syncModal(); },
});
function openLooks() {
  if (!V2 || looksOpen || transitioning || ui.isEndShown()) return false;
  if (journalScreen.isOpen()) journalScreen.hide();
  looksPicker.show();
  return true;
}
/** A person at (x, y) may have just earned the octopus their look: give each new one (their line said through `talk`). */
function checkSkins(x, y, talk) {
  if (!V2 || MOVETEST) return [];
  const nu = newSkins(story, getSkins());
  if (!nu.length) return nu;
  unlockSkins(nu);
  for (const id of nu) {
    const sk = skinById(id);
    if (talk && sk.give) say(talk, [sk.give]);
    skinGifts.give(id, x === undefined ? octo.x : x, y === undefined ? octo.y - 1.2 : y);
  }
  return nu;
}
/** Per step: the trinkets in flight; one that lands is the toast and the journal page. */
function stepSkinGifts() {
  for (const id of skinGifts.step(STEP)) {
    const sk = skinById(id);
    sfx.chime();
    ui.showToast('New look: ' + sk.name + '. Wear it at the mirror shell in the hub', 3400, true);
    discover(lookJournal(id));
  }
}
// "Runs carried": every journal id carried in a dive counts once for that dive (and carrying a thing discovers it).
let carriedDive = null;
const carriedIds = new Set();
let carriedTick = 0;
function noteCarried() {
  if (!V2 || !run || MOVETEST) return;
  if (!skinGifts.busy()) checkSkins(); // skins: a story change that did not come through a person's scene (e.g. an old save's late counter)
  const inDive = run.state === S_BIOME || run.state === S_REST;
  if (inDive && carriedDive !== run.dive) { carriedDive = run.dive; carriedIds.clear(); }
  for (const id of carriedJournalIds(carriedState())) {
    if (inDive && !carriedIds.has(id)) { carriedIds.add(id); journal.bump(id, STAT_CARRIED); }
    if (journal.discover(id)) announceJournal();
  }
}
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
  if (!MOVETEST) discover(run.state === S_HUB ? 'place-hub' : run.state === S_TUTORIAL ? 'place-tutorial' : run.state === S_BIOME ? 'place-shallows' : run.state === S_REST ? 'place-rest' : null);
}

// Manual (Esc/button) and automatic (hidden tab/blur) pause are tracked
// separately and combined, so a window focus event can never silently
// override a pause the player asked for.
let manualPaused = false;
let autoPaused = false;
function applyPaused() {
  const wasPaused = loop.paused;
  const isPaused = manualPaused || autoPaused || settingsOpen || inventoryOpen || looksOpen;
  const showOverlay = isPaused && !settingsOpen && !inventoryOpen && !looksOpen; // (the looks picker too) // the settings panel and the inventory are their own overlays
  if (showOverlay && V2) ui.setPauseActions(canQuickRestart(run) && !octo.dead && !transitioning, run.state === S_TUTORIAL && !transitioning); // Restart run in a dive, Leave the tutorial in it
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
    if (!typing) { e.preventDefault(); if (inventoryOpen || journalScreen.isOpen()) closeInventory(); else openInventory(); }
    return;
  }
  if (e.code === 'Escape' && V2 && journalScreen.isOpen()) { journalScreen.hide(); return; }
  if (V2 && ui.isOfferShown()) { // the first launch's tutorial offer: Enter / Space = yes, Esc = no
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); ui.answerOffer(true); }
    else if (e.code === 'Escape') { e.preventDefault(); ui.answerOffer(false); }
    return;
  }
  if (V2 && (e.code === 'KeyR' || e.code === 'KeyH') && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (!typing && quickKey(e.code === 'KeyR')) { e.preventDefault(); return; }
  }
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
  octo.vx = octo.vy = 0; octo.swimming = false; octo.dashT = 0; octo.squash = 0; octo.hurting = false; octo.hurtTimer = 0; octo.invulnTimer = 0; octo.dashInvuln = 0;
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
  if (handTap) { handTap = false; snap = { ...snap, hand: { pressed: true, held: false } }; } // __octo.pressHand(): one tap of F (tests)
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
    if (transitioning || journalScreen.isOpen() || ui.isOfferShown()) return;
  }

  // Game-over overlay is up: Enter/Z/Shift (the dash keys) or a tap on
  // "Swim again" restarts; Esc/pause button do nothing there (handled by
  // onTogglePause's own `octo.dead` guard).
  if (octo.dead && octo.deathTimer === 0 && octo.gameoverEmitted) {
    if (snap.dash.pressed) {
      if (V2) { if (canQuickRestart(run)) quickRestart(); else { ui.hideGameOver(); v2Event(EV_DEATH); } return; } // v2: Enter / Space / Shift = 'Restart run' (R too, keydown)
      ui.hideGameOver();
      resetWorld(Math.floor(Math.random() * 1e9));
      window.dispatchEvent(new CustomEvent('restart'));
      return;
    }
    if (!V2) return; // endless: the world stops under the game-over card
    // v2 (V2-PLAN 14): the world keeps running behind the death panel; the body bounces about until the player chooses
  }
  // hit-stop: a dash kill freezes the whole sim for 60 ms (the enemy's white ghost stays on screen)
  if (hitStop > 0) { if (entry) hitStop = 0; else { hitStop = Math.max(0, hitStop - dt); return; } } // r45: never during the entry, which runs on its own clock
  octo.bombNoKill = V2 && !!run && run.state === S_TUTORIAL; // the tutorial's bomb floor never kills (a heart at most); everywhere else a blast does
  octo.practice = octo.bombNoKill; // the tutorial's practice rooms: a hurt never takes the last heart (octopus.js hurtOctopus)
  octo.noKill = godMode; // test hook: traps that kill outright (spikes, a boulder) are skipped too
  if (godMode && !octo.dead) { octo.invulnTimer = Math.max(octo.invulnTimer, 0.5); octo.noBlink = true; } // test hook: no hurt flicker, so the body never looks see-through in screenshots
  if (V2 && (run.state === S_BIOME || run.state === S_REST) && !octo.dead) { run.dive.time += dt; levelClock += dt; } // the run summary's clock and the HUD's level clock
  if (V2 && unlockAnim) { stepUnlock(dt); if (unlockAnim && unlockAnim.t < UNLOCK_INPUT_S) snap = NO_INPUT; } // the dive's unlock moment: the camera visits it, the octopus waits
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
    if (V2) { discover(itemId(ev.type)); journal.bump(itemId(ev.type), STAT_COLLECTED); if (ev.type === 'shell') { gainShells(run, ev.value || 1); const kid = itemId(SHELL_NAMES[ev.sk]); if (kid) { discover(kid); journal.bump(kid, STAT_COLLECTED); } if (ev.sk === SK_MOON) ui.showToast('A moon shell, +' + ev.value + ' shells'); } }
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
    for (let k = 0; k < questClear.length; k += 2) enemies.despawnNear(questClear[k], questClear[k + 1], QUEST_CLEAR_R);
    questClear = null;
  }
  const enemyAll = V2 ? enemies.all() : null; // one list for the props step and the hazards below (boulders, spikes, jets read enemies)
  if (V2) { addBlocks(world.residentChunks()); syncBody(); props.step(dt, world, octo, enemyAll); syncBody(dt); } // sink, bounce, roll; hazards, loot and bombs read their bodies from here
  if (V2) { damage.tick(dt); infight.tick(dt); }
  if (V2 && liveWorld()) infight.stepThrown(); // INFIGHT.projectile: a thrown bomb or a flung pot hits the creature it meets
  if (V2) corpses.update(dt, world, hazards.data);
  if (V2 && !entry && !octo.hidden) stepHandWorld(dt); // the held thing follows the tentacles; thrown things hit what they meet
  if (V2 && run.state === S_BIOME && keepers.n) stepKeepers(keepers, dt, octo, world, infight);
  if (V2 && liveWorld()) {
    hazards.update(dt, sim.time, octo, world, resident);
    for (const ev of hazards.events) {
      if (ev.type === 'rockLanded') particles.bombDebris(ev.x, ev.y);
      else if (ev.type === 'rockImpact') chain.emit('boulder', ev.x, ev.y, ev.chain >= 0 ? ev : null, ev.byOcto); // chain.js: what it hit goes off
      else if (ev.type === 'shock') chain.emit('shock', ev.x, ev.y, ev.chain >= 0 ? ev : null, false, { target: 'eel', i: ev.i });
      else if (ev.type === 'hazardHurt') particles.deathPoof(ev.x, ev.y, ev.kind === 4 ? '#fff58a' : '#cfe8ff');
      else if (ev.type === 'impaled') { particles.deathPoof(ev.x, ev.y, '#150d1c'); particles.shakeFx(5, 0.22); sfx.impale(); } // V2-PLAN 16: skewered, an ink puff and a small shake
      else if (ev.type === 'shocked') { particles.shockSparks(ev.x, ev.y); sfx.zap(); } // eel: yellow sparks
      else if (ev.type === 'splat') { // a boulder flattens the octopus: gore, the heaviest shake in the game and a freeze on the impact
        particles.splatBurst(ev.x, ev.y); particles.shakeFx(SPLAT_SHAKE_PX, 0.55, SPLAT_SHAKE_PX); sfx.splat();
        if (!prefersReducedMotion()) hitStop = Math.max(hitStop, SPLAT_HITSTOP);
      }
    }
  }
  if (V2) { spellFx.update(dt, octo); handleSpellFxEvents(); } // Delayed motes, coral growing and crumbling, an Anchor landing
  if (V2 && liveWorld()) { handleCreatureEvents(); creatures.update(dt, octo, world, resident); handleCreatureEvents(); } // first what the hazards and blocks did to them this step
  if (V2 && liveWorld()) { loot.update(dt, octo, world, resident); handleLootEvents(); embedded.update(dt, octo, world, resident); handleEmbedEvents(); bakeEmbedded(); }
  if (autofire) autofire.update(dt, octo, world, enemies);
  // M7-2: continuous swim-whoosh and Beholder-drone levels, driven every
  // step (a no-op until the first input creates the audio nodes).
  const beholder = enemies.beholder();
  dreadLevel = beholder ? Math.max(0, 1 - Math.hypot(beholder.x - octo.x, beholder.y - octo.y) / DREAD_RANGE) : 0;
  if (!transitioning) { // r41: nothing new starts while one level is being torn down
    audio.setSwimIntensity(Math.hypot(octo.vx, octo.vy) / SWIM_MAX_SPEED);
    audio.setBeholderDread(Math.max(dreadLevel, warnDrone()));
  }
  if (V2 && liveWorld()) { chain.step(dt); handleChainEvents(); } // chain.js: links due now go off (a bomb set off here explodes just below)
  bombs.update(dt, world, octo, V2 ? damage : enemies); // v2: the shared damage entry hits every creature body by the table
  if (world.fresh) world.fresh.update(dt);
  blastLog.length = 0;
  if (V2) { // the ink jet after the enemies' own step: its kills join this step's enemy events below
    inkPhys.props = props; inkPhys.corpses = corpses; inkResident = resident;
    inkJet.update(dt, world, inkTargets(), inkHurt, inkPhys); // enemies, plus the shopkeepers (ink barely scratches them, and angers them)
    for (let i = 0; i < inkJet.events.nSplat; i++) particles.inkSplat(inkJet.events.splat[i * 2], inkJet.events.splat[i * 2 + 1], inkJet.events.splatDir[i * 2], inkJet.events.splatDir[i * 2 + 1], inkJet.events.splatOn[i] === 1);
    if (inkJet.events.hits && !prefersReducedMotion()) hitStop = Math.max(hitStop, 0.03); // a hair of freeze on an ink hit
    if (inkJet.events.nSplat) inkSplatPeople(); // V2-PLAN 16: a blob that splats on a calm person hurts and angers them
    if (inkJet.events.nSplat && shopSt) inkSplatWares(); // Daniel 2026-10-08: shooting a ware off its pedestal is theft
    if (quest && inkJet.events.nSplat) for (let i = 0; i < inkJet.events.nSplat; i++) questInk(quest, inkJet.events.splat[i * 2], inkJet.events.splat[i * 2 + 1]); // a caged critter's cage breaks
    if (inkJet.events.nProp && liveWorld()) { // a blob that hits a pot or a clam breaks it, as a dash or a blast would
      let broke = false;
      for (let i = 0; i < inkJet.events.nProp; i++) broke = loot.hitProp(inkJet.events.propHit[i], 'ink') || broke;
      if (broke) handleLootEvents();
    }
    inkClouds.update(dt, currentAt);
    stepJuice(dt);
  }
  for (const ev of bombs.events) {
    if (ev.type !== 'exploded') continue;
    blastLog.push(ev.x, ev.y);
    if (V2) { inkClouds.blast(ev.x, ev.y, BOMB_RADIUS); spellFx.blast(ev.x, ev.y, BOMB_RADIUS); } // SPELLS-PICK: a blast blows an ink cloud out and ends a Lure
    const bd = Math.hypot(ev.x - octo.x, ev.y - octo.y);
    particles.blastBurst(ev.x, ev.y, bd); sfx.bomb();
    if (V2 && world.fresh && ev.tiles > 0) world.fresh.haze(ev.x, ev.y, ev.tiles); // the silt that hangs over the crater afterwards
    if (V2) particles.blastFeel(ev.x, ev.y, bd);
    if (V2 && shopSt) { const before = shelfWares(); shopBlast(shopSt, ev.x, ev.y, BOMB_RADIUS, props); if (shelfWares() < before) wareKnocked(world.inShop && world.inShop(ev.x, ev.y) ? 'shop' : 'theft'); } // controls 2026-10-08: blasting a ware off is theft
    // 2026-10-08: the creatures, NPCs and keepers already took the blast inside bombs.update (damage.js blast, by the creature table)
    if (V2 && run.state === S_BIOME && world.inShop && world.inShop(ev.x, ev.y)) shopAggro('shop'); // a bomb going off inside the stall
    if (V2 && npcs) npcs.drain(onNpcEvent);
    if (V2 && liveWorld()) {
      loot.explode(ev.x, ev.y, BOMB_RADIUS); handleLootEvents();
      chain.emit('bomb', ev.x, ev.y, ev.chain >= 0 ? ev : null, true); // chain.js: the bombs, boulders, clams, eels, pots ... it sets off (replaces hazards.blast)
      for (let i = 0; i < creatures.data.n; i++) creatures.releaseNear(i, ev.x, ev.y, BOMB_RADIUS, octo); // a tentacle lets a held octopus go
      handleCreatureEvents(); if (quest) questBlast(quest, ev.x, ev.y, BOMB_RADIUS);
    }
    if (V2 && quest && quest.status === ST_DONE && !quest.paid) payQuest(); // r3: a bomb broke a cage whose critter stays
    if (V2 && (run.state === S_BIOME || run.state === S_REST)) peopleReact(ev.x, ev.y); // r3: the people about jump and shout
  }
  for (const ev of enemies.events) {
    if (ev.type === 'beholderWarn' || ev.type === 'beholderSpawned') { onBeholderEvent(ev); continue; }
    if (ev.type === 'hitStop') { if (!(V2 && prefersReducedMotion())) hitStop = Math.max(hitStop, ev.dur); continue; }
    if (ev.type === 'shotHit') { particles.deathPoof(ev.x, ev.y, '#f4efe4'); continue; } // a cannon shot hit another creature (INFIGHT.projectile)
    if (ev.type !== 'enemyKilled') continue;
    // enemy infighting: a kill by another creature's attack (a frenzy bite, a shot, a claw, a snap, a grab) is not hers: no score, no journal kill
    const hers = !INFIGHT_KILL[ev.reason];
    particles.deathPoof(ev.x, ev.y); if (hers) runKills++;
    if (V2) addCorpseFromEvent(ev); // V2-PLAN 16: a kill leaves a body, never an item
    if (V2 && !isSafeState(run)) {
      if (hers) run.dive.kills++;
      bodyJuice(ev.x, ev.y, ev.kind, dropCount(seed, runKills)); // V2-PLAN 16: no item drops from enemies; the body leaks juice
      if (hers) journal.bump(creatureId(ev.kind), STAT_KILLED);
    }
  }
  if (V2 && run.state === S_BIOME) {
    if ((world.shopTilesBroken | 0) !== shopBrokenSeen) { shopBrokenSeen = world.shopTilesBroken | 0; shopAggro('shop'); } // his stall was damaged
    handleKeeperEvents();
  }
  if (V2) drainInfight();
  // blasts shove the corpses (the ones this very blast made too, so they are thrown, not just dropped)
  if (V2) for (let i = 0; i < blastLog.length; i += 2) corpses.blast(blastLog[i], blastLog[i + 1], BOMB_RADIUS);
  if (V2) handleCrumbles(dt);
  particles.update(dt, solidForSight);
  if (snap.bomb.pressed && !octo.dead && !entry && !octo.hidden) placeBomb(snap, snap.src ? snap.src.bomb : 'key'); // B / X: the keyboard quick bomb (dropped)

  if (V2) syncBody(); // blasts and jets after the props step reached the octopus record: hand them to the body
  endOfStepEntry(); // r45: the entry's pose wins over anything that touched the body this step; the level changes here when it is over

  const depth = Math.max(0, world.depth() - world.startY);
  if (!octo.dead) liveScore = computeScore(depth, pickups.totals, runKills); // a sinking corpse scores no depth

  if (octo.dead && !octo.gameoverEmitted && octo.deathTimer === 0) {
    octo.gameoverEmitted = true;
    const rec = recordRun(liveScore);
    bestScore = rec.best;
    if (V2) { const q = canQuickRestart(run); ui.setGameOverLabels('The dark took you', q ? 'Restart run' : 'Back to the hub', q ? 'Back to the hub' : undefined); } // the tutorial: back to the hub only
    ui.showGameOver(liveScore, bestScore, V2 ? deathDetail() : undefined);
    window.dispatchEvent(new CustomEvent('gameover', { detail: { time: sim.time, score: liveScore, best: bestScore } }));
  }
}
// --- fragile terrain (fragile.js): fish-bone tiles broken this step by a dash, a projectile, a flung prop, a bomb or a
// boulder: bone shards that bounce and fade, a puff of silt that hangs, one crunch per step; a dash through gets a hair
// of freeze and a small shake. A buried find in the tile drops out by itself (embed.js sees the tile gone).
let crunchCool = 0;
function handleCrumbles(dt) {
  if (!world.takeCrumbles) return;
  crunchCool = Math.max(0, crunchCool - dt);
  const c = world.takeCrumbles();
  if (!c.length) return;
  let dash = false;
  const sp = Math.hypot(octo.vx, octo.vy) || 1;
  for (let k = 0; k < c.length; k += 3) {
    const x = c[k] + 0.5, y = c[k + 1] + 0.5, isDash = c[k + 2] === CR_DASH;
    if (isDash) dash = true;
    particles.boneShards(x, y, isDash ? octo.vx / sp : 0, isDash ? octo.vy / sp : 0);
  }
  if (world.fresh) world.fresh.haze(c[0] + 0.5, c[1] + 0.5, 1); // one light haze per step, not per tile
  if (crunchCool <= 0) { sfx.crunch(dash); crunchCool = 0.06; }
  if (dash) { particles.shakeFx(2, 0.12); if (!prefersReducedMotion()) hitStop = Math.max(hitStop, 0.035); }
  if (!isSafeState(run)) { discover('prop-fishbone'); for (let k = 0; k < c.length; k += 3) journal.bump('prop-fishbone', STAT_KILLED); }
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

/** Controls 2026-10-08 (V2-PLAN 17): a bomb used with no aim is DROPPED straight down (keyboard B / X / C; a click with the cursor
 * on the octopus; the phone with the stick at rest); an aimed one is an urchin-mine thrown at the cursor (mouse) or along the
 * stick (touch). Returns the unit aim, or null for a drop. */
const DROP_CURSOR_R = 1.0; // tiles: a click this close to the octopus drops the bomb instead of throwing it
function bombAim(snap, src) {
  if (src === 'mouse' && input.mouse.seen) {
    const w = screenToWorld(renderer.camera, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
    const dx = w.x - octo.x, dy = w.y - octo.y, l = Math.hypot(dx, dy);
    return l > DROP_CURSOR_R ? { x: dx / l, y: dy / l } : null;
  }
  if (src === 'touch' || src === 'test') {
    const m = snap.move, l = Math.hypot(m.x, m.y);
    if (l > 0.5) return { x: m.x / l, y: m.y / l };
  }
  return null;
}
/** Drop or throw a bomb (the quick bomb, or the bomb slot used from the hotbar). */
function placeBomb(snap, src) {
  if (!V2) { bombs.place(octo, octo.x, octo.y, null); return; }
  const aim = bombAim(snap, src);
  let bx = octo.x, by = octo.y;
  if (aim) { // starts half a tile out along the throw, unless that is rock
    if (!world.isSolid(octo.x + aim.x * 0.5, octo.y + aim.y * 0.5)) { bx += aim.x * 0.5; by += aim.y * 0.5; }
  } else if (!world.isSolid(octo.x, octo.y + DROP_BELOW)) by += DROP_BELOW; // dropped from the tentacles, under the body
  if (bombs.place(octo, bx, by, aim)) { discover('item-bomb'); journal.bump('item-bomb', STAT_USED); tutorialActed(tutState); }
  else if (octo.bombs <= 0) hotbarUI.shakeSlot(BOMB_SLOT);
}
/** The way a thrown thing goes: at the cursor with a mouse, along the move keys / stick, else forward (null). */
function throwAim(snap) {
  if (snap.mode !== 'touch' && input.mode() !== 'touch' && input.mouse.seen) { // anyone who uses the mouse aims throws with it (F is a key)
    const w = cursorWorld();
    if (w && Math.hypot(w.x - octo.x, w.y - octo.y) > 0.3) return { x: w.x - octo.x, y: w.y - octo.y };
  }
  const m = snap.move;
  if (Math.hypot(m.x, m.y) > 0.25) return { x: m.x, y: m.y };
  return null;
}
// --- section 14: the ink jet, spells, the hotbar and fish juice ---
/** The run's hotbar (a new dive or a death starts a fresh one with the starting spell). */
function hotbar() { if (!run.hotbar) run.hotbar = createHotbar([START_SPELL, BOMB_SLOT]); return run.hotbar; } // controls 2026-10-08: bombs are a hotbar stack
/** The cursor as a world point, or null when the mouse has not been seen. */
function cursorWorld() {
  if (!input.mouse.seen) return null;
  return screenToWorld(renderer.camera, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
}
const SPELL_REACH = 3; // tiles: a spell aimed with the mouse lands at the cursor, at most this far out (and short of rock)
/** Where a spell goes: toward the cursor (mouse), else on the octopus. */
function spellTarget(src) {
  const w = src === 'mouse' ? cursorWorld() : null;
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
const castCtx = { clouds: null, fx: null, x: 0, y: 0, vx: 0, vy: 0, dirX: 1, dirY: 0, now: 0 };
/**
 * Cast the selected hotbar slot (its spell and runes). Where it lands (SPELLS-PICK / V2-PLAN 17): with the mouse at the cursor
 * (short of rock, within SPELL_REACH) and along the line to it; with keys or on a phone, 'ahead' spells (Riptide, Coral Wall)
 * land SLOT.phoneAim tiles along the facing and 'self' ones (Ink Cloud, Anchor) on the octopus. Returns the cast result.
 */
function castSelected(snap, forceAt = null, src = null, slotIds = null) {
  // controls 2026-10-08: right click / C / Use pass their source; the phone's Spell button passes the castable slot's ids
  if (src === null) src = snap.src ? snap.src.spell : 'key';
  const ids = slotIds || selectedIds(hotbar());
  const p = resolveSlot(ids);
  if (!p) return -1;
  const sp = p.spell;
  // the hub, the tutorial and the rest grotto: no currents or coral (their hazards do not run); a cloud and an Anchor are harmless there
  if (isSafeState(run) && (sp.effect === 'riptide' || sp.effect === 'coral' || sp.effect === 'lure')) { ui.showToast(sp.name + ' stirs nothing here', 1400); return -1; }
  const mouse = src === 'mouse' ? cursorWorld() : null;
  let at, dx = lastAim.x, dy = lastAim.y;
  if (forceAt) at = forceAt;
  else if (sp.self) at = { x: octo.x, y: octo.y };
  else if (mouse) { at = spellTarget(src); const ex = mouse.x - octo.x, ey = mouse.y - octo.y, l = Math.hypot(ex, ey); if (l > 0.2) { dx = ex / l; dy = ey / l; } }
  else if (sp.aim === 'ahead') at = aheadOf(dx, dy, SLOT.phoneAim);
  else at = { x: octo.x, y: octo.y };
  castCtx.clouds = inkClouds; castCtx.fx = spellFx; castCtx.x = at.x; castCtx.y = at.y; castCtx.vx = octo.vx; castCtx.vy = octo.vy;
  castCtx.dirX = dx; castCtx.dirY = dy; castCtx.now = sim.time;
  spellFx.setOcto(octo);
  const r = castSpell(run, ids, castCtx);
  if (r === CAST_OK) {
    if (sp.effect === 'cloud') sfx.inkPuff(); else sfx.chime();
    if (sp.effect === 'anchor') particles.shakeFx(1.2, 0.1);
    runStats.spellsCast++;
    runStats.byEffect[sp.effect] = (runStats.byEffect[sp.effect] | 0) + 1;
    if (sp.journal) { discover(sp.journal); journal.bump(sp.journal, STAT_USED); }
    for (const m of p.mods) { discover('rune-' + m); journal.bump('rune-' + m, STAT_USED); }
  } else if (r === CAST_EMPTY) { hotbarUI.shakeJar(); ui.shakeJar(); sfx.emptyJar(); runStats.empty++; }
  else if (r === -1 && sp.effect === 'coral') runStats.refused++; // no cell could grow: nothing was paid
  return r;
}
/** `d` tiles along (ux, uy) from the octopus, stopping short of the first rock. */
function aheadOf(ux, uy, d) {
  const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
  let x = octo.x, y = octo.y;
  for (let t = 0.25; t <= d + 1e-6; t += 0.25) { const nx = octo.x + ux * t, ny = octo.y + uy * t; if (world.isSolid(nx, ny)) break; x = nx; y = ny; }
  return { x, y };
}
/** The current (jets and Riptides) at a point, or null: ink clouds, juice droplets and Delayed motes ride it. */
function currentAt(x, y) { return hazards.forceAt ? hazards.forceAt(x, y) : null; }
/** spell-fx.js events: coral growing and crumbling, a mote going off, an Anchor crushing or smashing. */
const crumbleTile = [0, 0];
function handleSpellFxEvents() {
  for (const ev of spellFx.events) {
    if (ev.type === 'coralGrow') particles.pickupSparkle(ev.x, ev.y + 0.3, '#ffb49a');
    else if (ev.type === 'coralCrumble') { particles.bombDebris(ev.x, ev.y); crumbleTile[0] = Math.floor(ev.x); crumbleTile[1] = Math.floor(ev.y); spawnRubble(props, crumbleTile, 1, ev.x, ev.y - 0.5); }
    else if (ev.type === 'moteFire') particles.pickupSparkle(ev.x, ev.y, '#9dffd8');
    else if (ev.type === 'anchorCrush') { particles.shakeFx(4, 0.2); sfx.thud(); }
    else if (ev.type === 'anchorSmash') { particles.bombDebris(ev.x, ev.y); particles.shakeFx(3, 0.18); sfx.thud(); }
    else if (ev.type === 'lure' || ev.type === 'lureGone') particles.pickupSparkle(ev.x, ev.y, '#c8ffd8');
    else if (ev.type === 'riptide') { for (let i = 0; i < 4; i++) particles.trailBubble(ev.x + (i - 1.5) * 0.15, ev.y); }
  }
}
/** One step of the octopus's own actions: hotbar switching, the ink jet, casting the selected spell. */
function stepCombat(snap, dt) {
  const hb = hotbar();
  if (snap.select >= 0) selectIndex(hb, snap.select);
  for (let k = snap.cycle | 0; k !== 0; k -= Math.sign(k)) selectNext(hb, Math.sign(k));
  if (!hand.held && (snap.attack.held || snap.attack.pressed)) { // pressed too: a quick tap (key down and up between two steps) still fires; no ink while carrying
    let dir = lastAim;
    const src = snap.src ? snap.src.attack : 'key';
    if (src === 'mouse') { const w = cursorWorld(); if (w && Math.hypot(w.x - octo.x, w.y - octo.y) > 0.3) dir = { x: w.x - octo.x, y: w.y - octo.y }; }
    else if (src === 'touch') dir = autoAim(octo, enemies.all(), solidForSight, lastAim.x >= 0 ? 1 : -1);
    if (src === 'touch' && dir.y === 0 && Math.abs(lastAim.y) > 0.5) dir = lastAim; // nothing to aim at: the facing direction, up or down too
    if (inkJet.fire(octo.x, octo.y, dir.x, dir.y, octo.radius + 0.1)) { sfx.inkJet(); runStats.shots++; if (V2) journal.bump('item-inkjet', STAT_USED); }
  }
  // right click / C / the Use button: the selected slot (a spell casts, the bomb is dropped or thrown)
  if (snap.use && snap.use.pressed) {
    const id = selectedSpell(hb), src = snap.src ? snap.src.use : 'key';
    runStats.uses++;
    if (id === BOMB_SLOT) placeBomb(snap, src);
    else if (id && !isItemId(id)) castSelected(snap, null, src);
  }
  // the phone's Spell button: the selected spell slot, or the last spell slot picked while an item is selected
  if (snap.spell.pressed) { const ci = castableIndex(hb); if (ci >= 0) castSelected(snap, null, snap.src && snap.src.spell === 'mouse' ? 'mouse' : 'touch', hb.slots[ci].ids); }
  // F (the phone's morphed Spell button): grab, throw, drop, talk, buy
  if (snap.hand) { stepHand(hand, octo, snap.hand, dt, throwAim(snap), handCtx); takeHandEvents(); }
}
// --- controls 2026-10-08 (V2-PLAN 17): the hand ---
const handCtx = {
  isSolid: (x, y) => world.isSolid(x, y),
  thrownHit: (x, y, r, vx, vy, dmg, rec) => thrownHit(x, y, r, vx, vy, dmg, rec),
};
/** After the physics of the step: the held thing in the tentacles, thrown things in flight, the target for the tell. */
function stepHandWorld(dt) {
  if (keeperNotice > 0) keeperNotice = Math.max(0, keeperNotice - dt);
  handAttach(hand, octo, handCtx);
  stepFlying(hand, dt, handCtx);
  takeHandEvents();
  updateTarget(hand, octo, handCtx);
}
function takeHandEvents() {
  for (const ev of hand.events) {
    if (ev.type === 'grab') { particles.trailBubble(ev.x, ev.y); sfx.thud(); }
    else if (ev.type === 'throw') sfx.dash();
    else if (ev.type === 'drop') sfx.thud();
    else if (ev.type === 'shield') { particles.deathPoof(ev.x, ev.y, '#d9c6a8'); sfx.thud(); particles.shakeFx(SHAKE_HURT_PX * 0.5, 0.12); }
    else if (ev.type === 'hit') { particles.deathPoof(ev.x, ev.y, '#e8e0d0'); sfx.thud(); }
  }
  hand.events.length = 0;
}
/**
 * Thrown things (hand.js) hit through the shared damage entry (damage.js, CREATURES.md): the first body of any family the thing
 * at (x, y) radius r overlaps takes SOURCES.thrown (the table decides dmg, immunity, knock and stun; the octopus is to blame).
 * A ware still on its pedestal is knocked off first (theft). A thrown creature never hits itself (its body sits exactly at (x, y)).
 */
const TH = { f: null, i: -1 };
function thrownHit(x, y, r, vx, vy, dmg, rec) {
  if (shopSt && shopKnock(shopSt, props, x, y, r, vx, vy)) { wareKnocked(); return true; }
  TH.f = null; TH.i = -1;
  const now = damage.now();
  damage.each((f, i, V) => {
    if (TH.f || V.cool > now) return; // cooling from a hit (infight.stepThrown may have hit it with this same flying pot)
    const d = Math.hypot(V.x - x, V.y - y);
    if (d >= r + V.r || (rec && rec.enemy && d < 1e-3)) return;
    TH.f = f; TH.i = i;
  });
  if (!TH.f) return false;
  const sp = Math.hypot(vx, vy) || 1;
  damage.hitFound(TH.f, TH.i, 'thrown', x - vx / sp, y - vy / sp, -1, 1, true); // her throw: her doing
  TH.f.setTimers(TH.i, now + HAZARD_COOL, -1);
  handleCreatureEvents(); if (npcs) npcs.drain(onNpcEvent); handleKeeperEvents();
  runStats.thrownHits++;
  return true;
}
/** How many wares still stand on their pedestals. */
function shelfWares() { let n = 0; if (shopSt) for (let i = 0; i < shopSt.ware.length; i++) if (shopSt.ware[i] === W_SHELF && !shopSt.sold[i]) n++; return n; }
/** The octopus knocked a ware off its pedestal (ink, a throw, a blast, a dash): the keeper notices, and it is theft. */
function wareKnocked(reason = 'theft') {
  if (V2 && run && run.state === S_TUTORIAL) { ui.showToast('In a real shop that is theft: the keeper would come for you', 2600); return; }
  if (!V2 || !run || run.state !== S_BIOME) return;
  keeperNotice = 0.9;
  runStats.knocked++;
  shopAggro(reason);
}
/** An ink blob that splatted on a ware's stand-in knocks the ware off. */
function inkSplatWares() {
  const ev = inkJet.events;
  for (let i = 0; i < ev.nSplat; i++) {
    if (ev.splatOn[i] !== 1) continue;
    const x = ev.splat[i * 2], y = ev.splat[i * 2 + 1];
    if (shopKnock(shopSt, props, x, y, INKJET.radius + 0.15, ev.splatDir[i * 2] * 6, ev.splatDir[i * 2 + 1] * 6)) wareKnocked();
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
  juiceDrops.update(dt, octo, world, juiceCap() - run.juice, currentAt);
  const ev = juiceDrops.events;
  if (!ev.collected) return;
  addJuice(run, ev.collected);
  for (let i = 0; i < ev.n; i++) particles.pickupSparkle(ev.xy[i * 2], ev.xy[i * 2 + 1], '#a98ad8');
  if (slurpCool <= 0) { sfx.slurp(); slurpCool = 0.09; }
  discover('item-juice'); journal.bump('item-juice', STAT_COLLECTED);
}
const runStats = { shots: 0, spellsCast: 0, empty: 0, fish: 0, refused: 0, byEffect: {}, uses: 0, thrownHits: 0, knocked: 0 }; // test hook counters (__octo.combat())

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

let deathTintA = 0; // fade-in of the death tint (0..1)
const deathTintLook = { x: 0, y: 0, hole: 0, outer: 0, alpha: 0 }; // what the last frame drew (CSS px), for __octo.deathTint()
function render(alpha, frameMs) {
  checkPerfStepDown();
  const w = canvas.width, h = canvas.height;
  const resident = world.residentChunks();
  const depth = Math.max(0, world.depth() - world.startY);
  const hv = heldViewFor(alpha), hh = hv ? hand.held : null;
  renderer.render(w, h, octo, alpha, sim.time, frameMs / 1000, {
    skipEnemy: hh && hh.enemy ? hh.enemy : null, skipBomb: hh && hh.bomb ? hh.bomb : null, // the held thing is drawn after the octopus (drawHeld)
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
    beholderWarn: V2 && isSafeState(run) ? null : enemies.beholderWarn(),
    extraDraw: V2 ? v2Extra : (autofire ? autofire.draw : null),
    postOctoDraw: V2 ? v2People : null,
    followBias: V2 && run.state === S_BIOME && !octo.dead ? poolCameraBias() : V2 && unlockAnim ? unlockCameraBias() : null,
    deathFocus: V2 && octo.dead ? deathFocus(w, h) : null,
    lightR: V2 && run.state === S_BIOME ? octo.lightR : 0,
  });
  if (drawTrace.on) traceHeldFrame();
  setGameView(renderer.camera, w, h); // gameplay checks (a boulder falls, a tentacle wakes, a cannon charges) only while the threat is on screen
  if (V2 && octo.dead) { // the clear hole in the death tint follows the body
    const a = octo.prevX + (octo.x - octo.prevX) * alpha, b = octo.prevY + (octo.y - octo.prevY) * alpha;
    const p = worldToScreen(renderer.camera, w, h, a, b);
    // The light tint with a clear hole around the body is drawn here on the game canvas: as a CSS radial gradient
    // moved every frame it forced a full-screen repaint per frame and dropped the death screen to ~8 fps.
    if (ui.gameOverPanelRect()) {
      deathTintA = Math.min(1, deathTintA + frameMs / 400);
      const hole = renderer.camera.pxPerUnit * 1.6;
      const g = ctx.createRadialGradient(p.x, p.y, hole, p.x, p.y, hole * 2.6);
      g.addColorStop(0, 'rgba(4, 12, 18, 0)');
      g.addColorStop(1, `rgba(4, 12, 18, ${(0.3 * deathTintA).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      deathTintLook.x = p.x / dpr; deathTintLook.y = p.y / dpr; deathTintLook.hole = hole / dpr; deathTintLook.outer = hole * 2.6 / dpr; deathTintLook.alpha = 0.3 * deathTintA;
    } else deathTintA = 0;
  } else deathTintA = 0;
  if (!deathTintA) deathTintLook.alpha = 0;
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
    juice: V2 ? run.juice : 0, cap: V2 ? juiceCap() : 0, perCast: JUICE.perCast,
    levelTime: V2 && (run.state === S_BIOME || run.state === S_REST) ? levelClock : null, // the clocks show in a dive only
    runTime: V2 ? run.dive.time : 0,
    swift: V2 && run.state === S_BIOME && swift ? swift : null,
  });
  if (V2) {
    hotbarUI.update(hotbarState());
    if (++carriedTick % 30 === 0 && !transitioning) noteCarried(); // about twice a second: a new carried thing is discovered and counted for this dive
    const ci = castableIndex(hotbar());
    const price = ci >= 0 ? slotPrice(hotbar().slots[ci].ids) : 0;
    touchUI.setSpell(price > 0 && run.juice >= price * JUICE.perCast);
    touchUI.setHand(octo.dead ? '' : phoneHandMode(hand, octo)); // the Spell button turns into Grab / Use / Throw
    touchUI.setUse(selectedSpell(hotbar()) === BOMB_SLOT ? 'bomb' : 'spell');
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

let hudStage = V2 ? (MOVETEST ? 'Test room' : stageLabel(run)) : undefined;
const loop = createLoop(step, render);
const debug = createDebugOverlay(debugEl, { loop, input });

loop.start();

function resetWorld(newSeed, prebuilt = null, deferExtras = false) {
  // r41: tear the old level down first (every baked canvas, every synthesised sound), then build the new one: the two are never alive together
  timed('r:dispose', () => { sfx.stopAll(); renderer.dispose(); });
  if (V2) hudStage = MOVETEST ? 'Test room' : stageLabel(run);
  resetPortalStates(); // r43: the tinted portal frames of the level that is going
  seed = V2 ? levelSpec(run).seed : newSeed;
  world = prebuilt || makeWorld(seed); // r43: a transition builds the world in an earlier task (during the fade-out)
  octo = createOctopus(world.startX, world.startY);
  hand = createHand(); keeperNotice = 0; // whatever was in the tentacles stays behind
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
    chain.reset(); // its links point at the old level's things
    embedded = createEmbedded(V2 ? props : null);
    if (AUTO) autofire = createAutofire();
    bombs = createBombs(V2 ? props : null);
    particles = createParticles();
    juiceDrops = createJuiceDrops();
    inkClouds = createInkClouds();
    inkJet = createInkJet();
    resetAmbient(); // the background fish inked on the last level
    if (V2) enemies.setInkClouds(inkClouds);
    spellFx = createSpellFx({ world, hazards, props, damage: V2 ? damage : null, clouds: inkClouds, infight: V2 ? infight : null });
  });
  sim.time = 0;
  levelClock = 0;
  entry = null;
  unlockAnim = null; sealBumpAt = -99;
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

// --- v2 run flow (js/run.js): fade, level loading, prompts, journal discoveries ---
let transitioning = false;
let holdFrame = 0;
let lastDark = null; // {start, end} (performance.now) of the last transition's dark part: the event until the screen starts to fade in
let holdDark = false; // r43: the new level is being baked behind the dark screen: render only sets it up, draws nothing
const FADE_MS = 320;
const GENERATE_AT_MS = 80;     // r43: when, after the fade starts, the next level is generated
const WARM_FRAMES = 18;        // r44: warm frames behind the dark screen before the fade-in (set-up, simulation and every group of the scene at least once, in turn)
let warmGroupN = 0, warmSimN = 0, extrasPending = false;
const WARM_SIM_STAGES = 8;
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
      case 5: if (V2 && liveWorld()) { hazards.update(dt, sim.time, octo, world, resident); loot.update(dt, octo, world, resident); loot.takeEvents(); } break;
      case 6: bombs.update(dt, world, octo, enemies); break;
      case 7: if (V2) { updateTarget(hand, octo, handCtx); hotbarUI.update(hotbarState()); } break; // controls 2026-10-08: the hand's target search and the hotbar (bomb stack) of the new run
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

/** The world's hazards, creatures and loot run: a dive, and the tutorial's practice rooms (no Beholder clock there). */
function liveWorld() { return !isSafeState(run) || run.state === S_TUTORIAL; }
/** Apply a run event; on a state change fade out, load the next level, fade in. */
function v2Event(ev, cause) {
  if (!V2 || transitioning) return false;
  const prevState = run.state;
  const carry = { hearts: octo.hearts, bombs: octo.bombs };
  if (!runEvent(run, ev, cause, { sameSeed: ev === EV_RESTART && seededRun() })) return false;
  // Quick restart (EV_RESTART): the dive ends and a new one starts with no hub in between. Everything below that a death -> hub ->
  // dive does happens here too, in the same order (tests/restart-cdp.js compares the two).
  const quick = ev === EV_RESTART;
  const sameDive = prevState === S_BIOME && run.state === S_BIOME && !quick;
  if (!sameDive) seenDive.clear();
  if (prevState === S_BIOME && (run.levelsCleared >= 2 || run.state === S_END)) { setHelpDone(true); ui.retireControlsHelp(); } // two levels done: the controls line goes for good
  if (prevState === S_BIOME && (run.state === S_HUB || run.state === S_END || quick)) endOfDiveNpcs(); // the dive ended: whoever was killed has one dive less to stay away
  if (!sameDive) resetMoods(npcMoods); // a new dive or the hub: everybody is calm again
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
    const newDive = run.state === S_BIOME && (prevState !== S_BIOME || quick);
    timed('arrive', () => { if (run.state === S_HUB || quick) arriveInHub(); }); // a quick restart passes through the hub unseen
    if (newDive) { diveStory = { ...story }; diveDone.clear(); people.newDive(); } // a new dive: the story as it stands now
    timed('reset', () => resetWorld(0, nextWorld, true));
    if ((run.state === S_BIOME || run.state === S_REST) && prevState === S_BIOME && !quick) { octo.hearts = carry.hearts; octo.bombs = carry.bombs; prevHearts = octo.hearts; }
    if (run.state === S_HUB && run.diveUnlocked) startUnlock(); // the first finished tutorial: the octopus comes out beside the dive and the kelp lets go
    timed('discover', () => discoverStatePlace());
    if (newDive && story.quill >= 2 && !run.items.includes('lantern') && giveItem(run.items, octo, 'lantern')) { discover('item-lantern'); journal.bump('item-lantern', STAT_COLLECTED); } // Quill's lantern: no words
    if (newDive) applyBoons(); // gifts handed over in the hub (people of the last runs)
    if (newDive) journal.bump(lookJournal(getSkin()), STAT_USED); // skins: the Looks page counts the dives worn
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

/**
 * Quick restart (Spelunky): from the death screen (R, Enter, Space / Shift, or 'Restart run') or the pause menu in a dive, a fresh
 * dive at Shallows 1-1 starts at once, no hub. A death was already recorded when the death screen came up (deathDetail); from the
 * pause menu the octopus is alive and the dropped dive is not a death and is not recorded.
 */
function quickRestart() {
  if (!V2 || transitioning || entry || !canQuickRestart(run)) return false;
  const died = !!octo.dead;
  if (died && !octo.gameoverEmitted) return false; // the 1.5 s before the death screen: the death is not recorded yet
  ui.hideGameOver();
  manualPaused = false; applyPaused();
  return v2Event(EV_RESTART, died ? (octo.cause || 'unknown') : '');
}
/** The pause menu's 'Leave the tutorial': back to the hub, the tutorial not finished. */
function leaveTutorial() {
  if (!V2 || transitioning || run.state !== S_TUTORIAL) return false;
  manualPaused = false; applyPaused();
  return v2Event(EV_LEAVE);
}
/** R / H pressed: R = Restart run (death screen or pause menu, in a dive), H = Back to the hub (death screen). True when handled. */
function quickKey(isR) {
  if (transitioning) return false;
  const deathUp = octo.dead && octo.gameoverEmitted && ui.isGameOverShown();
  const pauseUp = manualPaused && loop.paused && !settingsOpen && !inventoryOpen && !journalScreen.isOpen();
  if (isR) return (deathUp || pauseUp) && canQuickRestart(run) ? quickRestart() : false;
  if (!deathUp) return false;
  ui.hideGameOver();
  return v2Event(EV_DEATH);
}

/** A seeded run (?seed= or a seed typed in the settings): the title card shows the dive seed and a quick restart replays it. */
function seededRun() { return !!Number(params.get('seed')) || (run.nextSeed !== null && run.nextSeed !== undefined); }

/** Level title card at each level start: "Shallows 1-2", plus the seed only when the run is seeded on purpose (?seed= or a seed typed in the settings). */
function showLevelTitle() {
  if (V2 && run.state === S_REST) return; // the grotto's own prompt says what it is (a title card would cover it)
  const t = levelTitle(run, seededRun());
  if (t) ui.showTitle(t.text, t.sub, 1500); // the Swift Current target sits next to the clock on the HUD strip now
}

/** Run summary shown on the death and biome-clear screens: stats, best runs (this run highlighted), the shortcut note. */
function summaryDetail(sum, rank) {
  return {
    title: sum.cleared ? BIOME_NAME + ' cleared' : deathTitle(sum.cause),
    headline: summaryHeadline(sum),
    rows: summaryRows({ ...sum, levelTime: levelClock }, true), // the clocks as the HUD showed them
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
function stickyIntact(lv) {
  const l = lv.sticky || [];
  for (let i = 0; i < l.length; i += 2) if (world.tileAt(l[i], l[i + 1]) !== 0) return true;
  return false;
}
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
  sys.setInfight(infight); // enemy infighting: harpoons hit any creature; lures
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
  if (run.state === S_REST) people.place(npcs); // r3: someone waiting in the grotto with a reward (or a grudge)
  if (run.state === S_BIOME) {
    const q = quest;
    if (q && q.status !== ST_FAILED_Q) { // r3: after you help them they stay in the level (and can still be hurt)
      if (q.plan.kindId === Q_VAULT && !npcGone('marlo')) npcs.place(NPC_MARLO, q.cx, q.cy + 0.22, 0, q.collected ? 0 : FL_SEALED); // feet; sealed until freed
      else if (q.plan.kindId === Q_RESCUE && !npcGone('pip')) npcs.place(NPC_PIP, q.cx, q.cy, 0, q.following ? FL_FOLLOWING : q.staying ? 0 : FL_CAGED);
      else if (q.plan.kindId === Q_MEET && !npcGone(q.plan.npc)) npcs.place(npcByName(q.plan.npc), q.cx, q.plan.npc === 'pip' ? q.cy : q.plan.floorY, 0, 0);
    }
    people.place(npcs);
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
      if (!ev.hub) people.noteGrudge(ev.who, false); // r3: angry for the rest of the dive (owed meetings come back hostile)
      if (hubTalk.who === ev.name) { hubTalk.talk.q.length = 0; hubTalk.talk.left = 0; hubTalk.talk.text = ''; hubTalk.who = ''; hubTalk.undo = []; }
      break;
    }
    case 'killed': {
      addCorpseFromEvent(ev); // a body, no item drops
      particles.deathPoof(ev.x, ev.y, '#f4efe4');
      if (!INFIGHT_KILL[ev.src]) journal.bump(PERSON_ENTRY[ev.who], STAT_KILLED); // killed by another creature (infighting): not hers
      addStory('killed' + capName(ev.name));
      setStoryExact('gone' + capName(ev.name), ev.hub ? 1 : 2); // away until the end of the next dive
      story = getStory();
      if (ev.name === 'marlo') run.shortcut3 = false; // his ring to Shallows 1-3 closes for the run
      if (quest && quest.plan.npc === ev.name) questFail(quest);
      if (!ev.hub) people.noteGrudge(ev.who, true); // r3: dead for the rest of the dive (owed meetings never come)
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

/** v2 per-step logic after the octopus moved: exit, hub residents, prompts, sightings. */
function stepV2(snap) {
  const lv = world.level;
  stepSkinGifts();
  if (entry) return; // r44: the entry sequence owns the octopus
  if (run.state === S_BIOME) {
    questUpdate(quest, octo, world, STEP);
    if (quest && quest.status === ST_DONE && !quest.paid) payQuest(); // r3: freed, cage broken (and staying), or met: the outcome now
    if (quest && quest.met) diveDone.add(quest.plan.npc); // r40: once a person has spoken in a dive they are done for it (at most one cage per dive)
    if (quest && quest.met && !quest.said && quest.plan.journal) { quest.said = true; discover(quest.plan.journal); }
    if (shopSt) shopSt.keeperCalm = shopSt.keeperIdx >= 0 && shopSt.keeperIdx < keepers.n && keepers.mode[shopSt.keeperIdx] === KM_CALM;
    const ev = shopStep(shopSt, octo, run.shells, STEP, run.items, false); // controls 2026-10-08: buying is F (hand-kinds.js 'ware')
    if (ev) onShopEvent(ev);
    if (shopSt) { wareEvents.length = 0; for (const we of shopWares(shopSt, props, world, octo, run.items, wareEvents, run.shells, STEP, false)) onShopEvent(we); }
    if (poolSts.length) {
      hazards.setPoolGain(poolSts.some((ps) => ps.state === PL_ACTIVE) ? 1 : POOL_IDLE_VENT); // r40: the vents only blow weakly until a wager runs
      const busy = poolSts.some((ps) => ps.state === PL_ACTIVE); // one wager at a time
      for (const ps of poolSts) { if (busy && ps.state === PL_IDLE) continue; for (const pe of poolStep(ps, octo, run.shells, STEP)) onPoolEvent(pe, ps); }
    }
    if (shopSt && (seeTick & 15) === 0 && Math.hypot(octo.x - shopSt.keeperX, octo.y - shopSt.keeperY) < 9) { discover('place-shop'); discover('person-keeper'); }
    if ((seeTick & 15) === 4) for (let i = 0; i < keepers.n; i++) if (keepers.mode[i] !== KM_DEAD && Math.hypot(octo.x - keepers.x[i], octo.y - keepers.y[i]) < 9) discover('person-keeper');
    tryTakeRune();
    if (siphonSpot && !siphonSpot.taken && Math.hypot(octo.x - siphonSpot.x, octo.y - siphonSpot.y) < 0.8) {
      siphonSpot.taken = true;
      if (giveItem(run.items, octo, 'siphon')) { discover('item-siphon'); journal.bump('item-siphon', STAT_COLLECTED); ui.showToast('Found ' + pickupText('siphon')); }
      particles.pickupSparkle(siphonSpot.x, siphonSpot.y, '#cfe0b0'); sfx.chime();
    }
  }
  if (run.state === S_REST) stepRest();
  if (run.state === S_TUTORIAL) stepTutorial();
  if (run.state === S_BIOME || run.state === S_REST) stepPeople();
  if (run.state === S_BIOME && swift && stepSwift(swift, sim.time, octo)) earnSwift();
  const sealedHere = run.state === S_HUB && !MOVETEST && hubSeal() > 0;
  if (sealedHere && world.reachedExit(octo.x, octo.y)) sealedBump(lv); // the kelp holds the dive shut: bounced back up, the plank and the prompt say why
  // Daniel 2026-10-08: a whirlpool is entered only with the hand (F, the middle click, the phone's Enter): the 'portal'
  // interact kind below (portalAt / enterPortal). Swimming into one only shows the tell and the key hint.
  if (entry) return;
  if (run.state === S_HUB) hubStep(lv);
  if (lv.prompts && lv.prompts.length) {
    let best = null, bd = 1e9;
    // r40: the hub's 'Welcome to the Shallows' panel is for newcomers: gone once the first dive has been cleared
    const welcomed = run.state === S_HUB && !MOVETEST && (getMeta().clears | 0) >= 1;
    const open = run.state !== S_HUB || MOVETEST || diveOpen(run);
    for (const p of lv.prompts) {
      if (p.when === 'sealed' ? open : p.when === 'open' ? (!open || welcomed) : welcomed) continue; // hub: sealed-dive prompts until the tutorial is done, the welcome after
      const d = Math.hypot(octo.x - p.x, octo.y - p.y);
      if (d < p.r && d < bd) { best = p; bd = d; }
    }
    const touchy = snap.mode === 'touch' || (!keyboardSeen && snap.mode === 'keyboard' && isCoarsePointer());
    // tutorial: bombs never run out while the wall stands, and an idle player gets the bomb hint back
    if (run.state === S_TUTORIAL) {
      const floorUp = wallIntact(lv);
      tutorialStep(tutState, octo, floorUp || stickyIntact(lv), STEP, floorUp);
      const inBombRoom = lv.rooms && lv.rooms[tutState.room] && lv.rooms[tutState.room].goal === 'walls';
      if (tutState.hint && inBombRoom) { const bp = lv.prompts.find((p) => p.refillBomb); if (bp) best = bp; }
    }
    // controls 2026-10-08: at the tutorial's bomb floor the bomb is picked on the hotbar once, so Use / right click / C drop one
    if (best && best.refillBomb && !tutState.bombPicked) { tutState.bombPicked = true; const hb = hotbar(), bi = hb.slots.findIndex((sl) => sl.ids[0] === BOMB_SLOT); if (bi >= 0) selectIndex(hb, bi); }
    // Daniel 2026-10-08: bombs kill outright (not in the tutorial, which only costs a heart): while one of ours is lit there, the prompt says get clear
    if (run.state === S_TUTORIAL && bombs.list().some((b) => !b.exploded && Math.hypot(b.x - octo.x, b.y - octo.y) < 4)) {
      best = { title: 'Swim away!', desktop: 'It goes off in a moment. Get more than two tiles away: outside the tutorial a bomb blast kills you.', touch: 'It goes off in a moment. Get more than two tiles away: outside the tutorial a bomb blast kills you.' };
    }
    if (!best && run.state === S_HUB && lv.mirror && !looksOpen) { // skins: the mirror shell says what it is when you are beside it
      const mp = mirrorPoint(lv.mirror);
      if (Math.hypot(octo.x - mp.x, octo.y - mp.y) < 2.2) best = { title: 'The mirror shell', desktop: 'Press F to change your look.', touch: 'Stay still beside it and tap Use to change your look.' };
    }
    if (unlockAnim) best = null; // the unlock moment speaks for itself (the title card)
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
    label: run.state === S_HUB ? 'Dive' : '',
    shortcutX: run.state === S_HUB && run.shortcut && lv.shortcutX !== undefined ? lv.shortcutX : -1, shortcutY: lv.shortcutY,
    shortcutLabel: BIOME_NAME + ' 1-' + SHORTCUT_LEVEL,
    shortcut3X: run.state === S_HUB && run.shortcut3 && lv.shortcut3X !== undefined ? lv.shortcut3X : -1, shortcut3Y: lv.shortcut3Y,
    shortcut3Label: BIOME_NAME + ' 1-' + SHORTCUT3_LEVEL,
    tutorialX: run.state === S_HUB && !MOVETEST && lv.tutorialX !== undefined ? lv.tutorialX : -1, tutorialY: lv.tutorialY, tutorialLabel: 'Tutorial',
    seal: run.state === S_HUB && !MOVETEST ? hubSeal() : 0, sealWobble: sealBumpAt, sealLabel: 'Finish the tutorial first',
  }, sim.time);
  const t = sim.time;
  if (run.state === S_TUTORIAL) {
    if (lv.walls && lv.walls.length) drawWallCue(c, camera, cw, ch, { walls: lv.walls, tileAt: world.tileAt, attention: tutState.hint ? 1 : 0 }, t);
    if (lv.sticky && lv.sticky.length) drawWallCue(c, camera, cw, ch, { walls: lv.sticky, tileAt: world.tileAt, attention: 0 }, t);
    drawTutorialSigns(c, camera, cw, ch, lv.prompts, octo.x, octo.y, t);
    drawLoot(c, camera, cw, ch, loot.data, t);
    drawCreaturesBack(c, camera, cw, ch, creatures.data, t);
    if (shopSt) { drawShop(c, camera, cw, ch, shopSt, run.shells, t, world.tileAt); drawLooseWares(c, camera, cw, ch, shopSt, props, t); }
  }
  drawRubble(c, camera, cw, ch, props.data);
  if (world.fresh) world.fresh.draw(c, camera, cw, ch, world.tileAt); // raw edges and silt haze over a fresh crater (fresh.js)
  const hh = heldView ? hand.held : null; // the held thing is skipped here and drawn after the octopus (drawHeld)
  drawCorpses(c, camera, cw, ch, corpses.data, t, hh && hh.ci !== undefined ? hh.ci : -1);
  if (run.state === S_BIOME) {
    if (world.level.nPockets) drawPocketCracks(c, camera, cw, ch, world.level.pockets, world.level.nPockets, world.tileAt);
    drawDecorBoulders(c, camera, cw, ch, decorBoulders(lv), world.tileAt);
    drawEmbedded(c, camera, cw, ch, embedded.data, { goggles: !!octo.seeBuried, tileAt: world.tileAt, shown: false });
    if (octo.seeBuried) drawPocketReveal(c, camera, cw, ch, loot.data, world.level.pockets || null, world.level.nPockets || 0, world.tileAt);
    drawLoot(c, camera, cw, ch, loot.data, t, hh && hh.li !== undefined ? hh.li : -1);
    drawCreaturesBack(c, camera, cw, ch, creatures.data, t); // (wall traps draw in v2PreWall, before the terrain)
    if (shopSt && world.level.shop && visibleAt(cullFlags('shop', 1), 0, world.level.shop.kx, world.level.shop.ky, 9)) drawShop(c, camera, cw, ch, shopSt, run.shells, t, world.tileAt);
    if (shopSt) drawLooseWares(c, camera, cw, ch, shopSt, props, t, hh && hh.slot !== undefined ? hh.slot : -1);
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
  if (runeSpot && !runeSpot.taken && visibleAt(cullFlags('rune', 1), 0, runeSpot.x, runeSpot.y, 1.5)) drawRunePedestal(c, camera, cw, ch, runeSpot, t);
  if (autofire) autofire.draw(c, camera, w2s, cw, ch);
  drawSpellFx(c, camera, cw, ch, spellFx, octo, t);
  drawJuiceDrops(c, camera, cw, ch, juiceDrops.data, t, JUICE.life);
  inkJet.draw(c, camera, cw, ch, t);
  drawInkClouds(c, camera, cw, ch, inkClouds.data, t, 0); // the thick ink, over the creatures and under the octopus
  if (!octo.dead && !octo.hidden && !entry) { // controls 2026-10-08: the tentacle curl toward what F would take, the arm round what it holds
    // the octopus's drawn (interpolated) position: the arm and the held thing move with the body, not with the 50 Hz steps
    const hv = heldView;
    if (hand.held) { if (hv && hv.rigid) drawHeldArm(c, camera, cw, ch, hv.ox, hv.oy, hv.x, hv.y, hand.held.r || 0.3, t); }
    else if (hand.target) {
      drawHandTell(c, camera, cw, ch, octo.x, octo.y, hand.target.x, hand.target.y, t, hand.target.priority > 10);
      if (hand.target.kind === 'portal' && input.mode() !== 'touch') drawKeyHint(c, camera, cw, ch, hand.target.x, hand.target.y - 1.45, 'F', t); // (phones: the Spell button reads Enter)
    }
  }
}
// --- controls 2026-10-08: what the hand holds is drawn ON TOP of the octopus (Daniel: "when you grab something ... it must be
// on top"), and rigidly in its tentacles (Daniel: "the grabbed item jitters as we move"). Its own system skips it in the normal
// pass (before the octopus) and v2People draws it once after the octopus through that system's draw-one function. It is drawn
// where the hand point is for the octopus's DRAWN pose (interpolated position, its angle): the systems keep it at the hand
// point of the 50 Hz step position, and some copy it a step late (loot, bombs), so drawing it there beat against the
// interpolated body at 30 / 60 / 120 Hz. The draw call is shifted by (hand point - where the system would draw it).
let heldView = null; // this frame's {ox, oy (the drawn octopus), x, y (the drawn hand point), rigid}, or null: nothing held
const HV = { ox: 0, oy: 0, x: 0, y: 0, rigid: false, alpha: 1 };
const HV_POSE = { x: 0, y: 0, angle: 0, radius: 0.45, throwDir: 1, handSide: 1 };
const HV_SYS = { x: 0, y: 0 };
let heldLast = null; // test hook: what drawHeld drew last frame
function heldViewFor(alpha) {
  heldView = null;
  const h = hand && hand.held;
  if (!V2 || !h) return null;
  HV.alpha = alpha;
  HV.ox = octo.prevX + (octo.x - octo.prevX) * alpha; HV.oy = octo.prevY + (octo.y - octo.prevY) * alpha;
  HV.rigid = !octo.dead && !octo.hidden && !entry;
  if (HV.rigid) {
    HV_POSE.x = HV.ox; HV_POSE.y = HV.oy; HV_POSE.angle = octo.angle; HV_POSE.radius = octo.radius; HV_POSE.throwDir = octo.throwDir; HV_POSE.handSide = octo.handSide;
    handPoint(HV_POSE, h.r || 0.3, handCtx.isSolid, HV);
  }
  return (heldView = HV);
}
/** Where the held thing's own system would draw it this frame (out), or null. */
function heldSysPos(h, alpha, out) {
  if (h.li !== undefined) { if (h.li < 0 || h.li >= loot.data.n) return null; out.x = loot.data.x[h.li]; out.y = loot.data.y[h.li]; }
  else if (h.ci !== undefined) { out.x = corpses.data.x[h.ci]; out.y = corpses.data.y[h.ci]; }
  else if (h.enemy) { const e = h.enemy, px = e.prevX === undefined ? e.x : e.prevX, py = e.prevY === undefined ? e.y : e.prevY; out.x = px + (e.x - px) * alpha; out.y = py + (e.y - py) * alpha; }
  else if (h.bomb) { out.x = h.bomb.x; out.y = h.bomb.y; }
  else if (h.slot !== undefined) { const p = shopSt ? shopSt.pid[h.slot] : -1; if (p < 0) return null; out.x = props.data.x[p]; out.y = props.data.y[p]; }
  else return null;
  return out;
}
function drawHeld(c, camera, w2s, cw, ch, t) {
  heldLast = null;
  const hv = heldView, h = hv ? hand.held : null;
  if (!h) return;
  const sys = heldSysPos(h, hv.alpha, HV_SYS);
  if (!sys) return;
  const dx = hv.rigid ? hv.x - sys.x : 0, dy = hv.rigid ? hv.y - sys.y : 0, ppu = camera.pxPerUnit;
  c.save();
  c.translate(dx * ppu, dy * ppu);
  if (h.li !== undefined) drawLootOne(c, camera, cw, ch, loot.data, h.li, t);
  else if (h.ci !== undefined) drawCorpseOne(c, camera, cw, ch, corpses.data, h.ci, t);
  else if (h.enemy) drawEnemyOne(c, camera, w2s, cw, ch, h.enemy, t, hv.alpha);
  else if (h.bomb) drawBombOne(c, camera, w2s, cw, ch, h.bomb, t);
  else if (h.slot !== undefined && shopSt) drawWare(c, camera, cw, ch, shopSt, props, h.slot, t);
  c.restore();
  if (hv.rigid) drawHeldGrip(c, camera, cw, ch, hv.ox, hv.oy, hv.x, hv.y, h.r || 0.3, t); // the arm's grip over the thing
  heldLast = { x: sys.x + dx, y: sys.y + dy, sx: sys.x, sy: sys.y, ox: hv.ox, oy: hv.oy, wall: hv.rigid && handPoint(HV_POSE, h.r || 0.3, null, HV_SYS).x !== hv.x }; // wall: carried beside the body (the hand point is in rock)
}
/** Test hook (drawTrace on): did this frame draw the held thing once, after the octopus? */
let heldTrace = null;
function traceHeldFrame() {
  const L = drawTrace.log, h = hand.held;
  let kind = '', ref = null;
  if (h) {
    if (h.li !== undefined) { kind = 'loot'; ref = h.li; } else if (h.ci !== undefined) { kind = 'corpse'; ref = h.ci; }
    else if (h.enemy) { kind = 'enemy'; ref = h.enemy; } else if (h.bomb) { kind = 'bomb'; ref = h.bomb; } else if (h.slot !== undefined) { kind = 'ware'; ref = h.slot; }
  }
  let octoAt = -1, before = 0, after = 0;
  for (let k = 0; k < L.length; k += 2) {
    if (L[k] === 'octo') { if (octoAt < 0) octoAt = k; continue; }
    if (L[k] === kind && L[k + 1] === ref) { if (octoAt < 0) before++; else after++; }
  }
  heldTrace = { held: hand.heldKind || '', kind, octo: octoAt >= 0, before, after };
  L.length = 0;
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
  const mr = run.state === S_HUB ? world.level.mirror : null;
  if (mr) drawMirrorShell(c, camera, cw, ch, mr.x, mr.y, !!(hand.target && hand.target.kind === 'mirror'));
  drawBlocks(c, camera, cw, ch, props.data); // blocks only exist in generated levels, so no state test
  if (run.state === S_BIOME || run.state === S_TUTORIAL) drawHazards(c, camera, cw, ch, hazards.data, sim.time, solidForSight);
}
/** r40: people (the hub residents, the diver, the caged critter) and their speech are drawn after the octopus, so it never hides them. */
function v2People(c, camera, w2s, cw, ch) {
  const lv = world.level, t = sim.time;
  drawAnchorHeld(c, camera, cw, ch, octo, t); // Anchor: the iron the octopus clutches, over its body
  drawHeld(c, camera, w2s, cw, ch, t); // what the hand holds: over the body, gripped by its arm
  drawInkClouds(c, camera, cw, ch, inkClouds.data, t, 1); // a thin veil of it over the octopus: it reads as inside the cloud
  if (run.state === S_BIOME || run.state === S_TUTORIAL) drawChain(c, camera, cw, ch, chain); // chain reactions: the motes running link to link and the rings where they land, over the blasts
  if (input.mode() !== 'touch' && input.mouse.seen && !octo.dead && !holdDark) drawReticle(c, input.mouse.x, input.mouse.y, camera.pxPerUnit, t);
  drawV2Labels(); // r42: the portal names, over the octopus
  if (run.state === S_HUB && lv.signX !== undefined && lv.signX >= 0) drawHubPeople(c, camera, cw, ch, lv, t);
  if (skinGifts.busy()) drawSkinGifts(c, camera, cw, ch, skinGifts, octo, t);
  if (run.state === S_BIOME && !(npcs && (npcs.owns(NPC_HOST) || npcGone('host')))) for (const ps of poolSts) drawPoolHost(c, camera, cw, ch, ps, t, octo.x);
  if (npcs) drawNpcs(c, camera, cw, ch, npcs, t, octo); // the ones that turned on you, their sight lines and the harpoons
  if (run.state === S_BIOME || run.state === S_TUTORIAL) { // V2-PLAN 16: the skewering spikes show through the body, the boulder sits on the pancake
    if (octo.deathStyle === 'impale') drawImpaleOverlay(c, camera, cw, ch, octo, hazards.data, t, solidForSight);
    drawSplatRock(c, camera, cw, ch, hazards.data, t, octo);
  }
  if (run.state === S_BIOME || run.state === S_TUTORIAL) drawCreaturesFront(c, camera, cw, ch, creatures.data, t, octo);
  if (run.state === S_BIOME && quest) drawQuestThing(c, camera, cw, ch, t);
  if (run.state === S_BIOME || run.state === S_REST) drawPeopleExtras(c, camera, cw, ch, t);
  if (keeperNotice > 0 && shopSt && shopSt.keeperIdx >= 0 && shopSt.keeperIdx < keepers.n) drawKeeperNotice(c, camera, cw, ch, keepers.x[shopSt.keeperIdx], keepers.y[shopSt.keeperIdx] - 1.3, keeperNotice / 0.9, t);
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
      case 'killed': {
        const hers = !INFIGHT_KILL[ev.reason]; // enemy infighting: a kill by another creature is not hers
        particles.deathPoof(ev.x, ev.y, '#cfe8ff'); if (hers) runKills++;
        if (hers && !isSafeState(run)) { run.dive.kills++; journal.bump('creature-' + ev.kind, STAT_KILLED); }
        break;
      }
      case 'grabCreature': particles.deathPoof(ev.x, ev.y, '#b0304a'); particles.shakeFx(2, 0.15); break; // INFIGHT.grab
      case 'snap': chain.emit('snap', ev.x, ev.y - 0.4, ev.chain >= 0 ? ev : null, false, { target: 'clam', i: ev.i }); if (!ev.far) { particles.shakeFx(ev.kill ? 6 : 2.5, 0.25); for (let k = 0; k < 4; k++) particles.trailBubble(ev.x + (k - 1.5) * 0.4, ev.y - 0.5); } break;
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
    discover(itemJournalId(id)); journal.bump(itemJournalId(id), STAT_COLLECTED);
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
      case 'rockLanded': particles.bombDebris(ev.x, ev.y); chain.emit('boulder', ev.x, ev.y - 0.45, null, true); break; // a chase rock (her relic) sets off what it lands on
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
function findFloorSpot(dMin = 3, dMax = 9, avoid = null) {
  const sx = Math.floor(world.startX), sy = Math.floor(world.startY);
  const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
  const cap = dMax > 9 ? 4000 : 900;
  for (let qi = 0; qi < q.length && qi < cap; qi++) {
    const [x, y] = q[qi];
    const d = Math.hypot(x - sx, y - sy);
    if (d >= dMin && d <= dMax && world.isSolid(x + 0.5, y + 1.5) && !world.isSolid(x - 0.5, y + 0.5) && !world.isSolid(x + 1.5, y + 0.5) && !world.isSolid(x + 0.5, y - 0.5)
      && !(avoid && Math.hypot(x + 0.5 - avoid.x, y + 0.72 - avoid.y) < 3) && !(world.inShop && world.inShop(x + 0.5, y + 0.5))) return { x: x + 0.5, y: y + 0.72 };
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = nx + ',' + ny;
      if (seen.has(k) || world.isSolid(nx + 0.5, ny + 0.5) || d > dMax) continue;
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
  const ev = shopStep(shopSt, octo, run.shells, STEP, run.items, false); // controls 2026-10-08: buying is F
  if (ev) onShopEvent(ev);
}

// --- the tutorial's rooms (tutorial.js, data/tutorial.json): coral doors that open on each room's goal, a free stall ---
function setupTutorial() {
  const lv = world.level;
  tutBuys = 0;
  if (lv.shop) { shopSt = createShopState(lv.shop, shopItems, 7, 0, run.items); shopSt.free = true; } // a free stall: F takes a ware, nobody minds
  run.juice = Math.max(run.juice, juiceCap()); // a full jar for the Ink Cloud room
  if (run.tutorialDone) for (const d of openAllDoors(tutState, lv)) openDoor(d, false); // a replay: every door open, skip to any lesson
}
/** Break door `d`'s coral (with crumbs and a chime when `fx`). */
function openDoor(d, fx) {
  const list = world.level.doors && world.level.doors[d];
  if (!list) return;
  for (let i = 0; i < list.length; i += 2) {
    const x = list[i], y = list[i + 1];
    if (world.breakTile(x, y) && fx) { particles.bombDebris(x + 0.5, y + 0.5); crumbleTile[0] = x; crumbleTile[1] = y; spawnRubble(props, crumbleTile, 1, x + 0.5, y); }
  }
  if (fx) { sfx.chime(); particles.shakeFx(1.5, 0.15); }
}
/** One step of the tutorial's rooms: goals open doors, a new room tops up the hearts, the jar never runs dry, the stall works. */
function stepTutorial() {
  const lv = world.level;
  const r = tutorialRooms(tutState, lv, { x: octo.x, y: octo.y, throws: hand.throws, casts: runStats.spellsCast, buys: tutBuys, tileAt: world.tileAt }, STEP);
  for (const d of r.open) openDoor(d, true);
  if (r.entered > 0 && !octo.dead && octo.hearts < octo.heartMax) { octo.hearts = octo.heartMax; prevHearts = octo.hearts; } // each room starts with full hearts
  if (castsOf(run.juice) < 1) run.juice = juiceCap(); // practice: the jar refills (in a dive it only does at the rest grotto)
  const ev = shopStep(shopSt, octo, run.shells, STEP, run.items, false);
  if (ev) onShopEvent(ev);
  if (shopSt) { wareEvents.length = 0; for (const we of shopWares(shopSt, props, world, octo, run.items, wareEvents, run.shells, STEP, false)) onShopEvent(we); }
}

/** Place this level's shop and, about one level in three, an emergent encounter (the caged critter or the stranded diver). */
function setupLevelExtras() {
  quest = null; shopSt = null; poolSts = []; tutState = createTutorialState(run.state === S_TUTORIAL ? world.level : null); relicHeld = false; siphonSpot = null; restSpring = null; swift = null; runeSpot = null;
  npcs = makeNpcs();
  if (run.state === S_BIOME || run.state === S_REST) for (let w = 1; w < 5; w++) { // r3: a grudge lasts the whole dive (the grotto too)
    if (people.grudge[w] === G_ANGRY) npcMoods.hostile[w] = 1;
    else if (people.grudge[w] === G_DEAD) { npcMoods.hostile[w] = 1; npcMoods.dead[w] = 1; }
  }
  if (run.state === S_TUTORIAL) setupTutorial();
  if (run.state === S_REST) {
    const lv = world.level;
    if (lv.springX >= 0) restSpring = { x: lv.springX, y: lv.springY, used: false };
    shopSt = createShopState(lv.shop, shopItems, run.diveSeed, 7, run.items);
    setupPeople();
  }
  if (run.state === S_BIOME) {
    const spec = levelSpec(run);
    const eligible = { ...diveStory }; for (const id of diveDone) eligible[id] = -1;
    for (const id of ['marlo', 'pip', 'quill']) if ((diveStory['gone' + capName(id)] | 0) > 0 || people.grudge[npcByName(id)]) eligible[id] = -1; // killed in the last dive or angered / killed in this one: not found
    const plan = planQuest(world.level, questTable, spec.seed, spec.levelIndex, eligible, otherSpawns());
    quest = createQuestState(plan);
    if (plan) {
      questClear = [plan.pos[0], plan.pos[1]];
      if (world.addPlantKeepOut) world.addPlantKeepOut(Math.floor(plan.pos[0]) - 2, Math.floor(plan.pos[1]) - 2, Math.floor(plan.pos[0]) + 3, Math.floor(plan.pos[1]) + 3); // r46: no foliage over the person or the cage
    }
    shopSt = createShopState(world.level.shop, shopItems, spec.seed, spec.levelIndex, run.items);
    poolSts = planPools(world.level).map(createPoolState);
    for (const ps of poolSts) { ps.talk = createTalk(); ps.idle = createIdle(ps.plan.x); ps.outcome = ''; } // r3: the host speaks after a won wager
    setupKeepers(spec);
    setupTimePressure(spec);
    setupPeople();
    if (run.level === siphonLevel() && !run.items.includes('siphon')) { const p = findFloorSpot(); if (p) siphonSpot = { x: p.x, y: p.y, taken: false }; }
    placeRunePedestal();
  }
}
/** SPELLS-PICK: this level's rune pedestal: the next rune of the dive's order on a floor 8-22 tiles from the start (never the Siphon Shell's spot). */
function placeRunePedestal() {
  runeSpot = null;
  if (MOVETEST) return;
  const id = runeForLevel((run.diveSeed >>> 0) + 977 * (run.level | 0), hotbar());
  if (!id) return;
  const p = findFloorSpot(8, 22, siphonSpot);
  if (p) runeSpot = { x: p.x, y: p.y, id, taken: false, dwell: 0, refusedAt: -99 };
}
/**
 * The one rune pickup (retarget it to the hand's F verb when that lands): staying on the pedestal PICKUP_DWELL s takes the rune.
 * `now` skips the dwell (an interact key). Returns true when it was taken.
 */
function tryTakeRune(now = false) {
  if (!runeSpot || runeSpot.taken) return false;
  const on = Math.hypot(octo.x - runeSpot.x, octo.y - (runeSpot.y - 0.35)) < PEDESTAL_R;
  runeSpot.dwell = on ? runeSpot.dwell + STEP : 0;
  if (!on || (!now && runeSpot.dwell < PICKUP_DWELL)) return false;
  const slot = takeRune(hotbar(), runeSpot.id);
  if (slot < 0) {
    if (sim.time - runeSpot.refusedAt > 3) { ui.showToast('No spell on your bar can take the ' + runeName(runeSpot.id) + ' rune', 2200); runeSpot.refusedAt = sim.time; }
    return false;
  }
  runeSpot.taken = true;
  const id = runeSpot.id, row = spellById(id);
  if (row) { discover(row.journal); journal.bump(row.journal, STAT_COLLECTED); } else { discover('rune-' + id); journal.bump('rune-' + id, STAT_COLLECTED); }
  ui.showToast(row ? 'A rune: ' + row.name + ' (right click / F)' : 'A rune: ' + runeName(id) + ', set into ' + runeName(hotbar().slots[slot].ids[0]), 2600, false, true);
  particles.pickupSparkle(runeSpot.x, runeSpot.y - 0.4, '#9dffd8'); sfx.chime();
  return true;
}

// --- 2026-10-08: time pressure (beholder.js) and the Swift Current bonus (swift.js) ---
/** This level's Beholder clock (sooner deeper down) and its Swift Current target from the swim distance to the whirlpool. */
function setupTimePressure(spec) {
  enemies.setBeholderTiming(beholderTiming(spec.levelIndex));
  const lv = world.level;
  if (lv.exitX < 0) return;
  const ex = lv.exitX + 0.5, ey = lv.exitY + 0.5;
  swift = createSwift(swiftTarget(swimDistance(world, world.startX, world.startY, ex, ey)), ex, ey);
}
/** In time: the current brings a moon shell up out of the whirlpool toward the octopus; a quiet toast and a journal count. */
function earnSwift() {
  const dx = octo.x - swift.exitX, dy = octo.y - swift.exitY, d = Math.hypot(dx, dy) || 1;
  swift.shell = pickups.dropShell(swift.exitX, swift.exitY, dx / d * 7, dy / d * 7, SK_MOON) || null;
  if (!swift.shell) paySwiftShell(); // no level chunk to drop into (never in a real level): straight into the purse
  run.dive.swift = (run.dive.swift | 0) + 1;
  discover('loot-swift'); journal.bump('loot-swift', STAT_COLLECTED);
  for (let i = 0; i < 6; i++) particles.trailBubble(swift.exitX + (i - 2.5) * 0.15, swift.exitY);
  sfx.chime();
  ui.showToast('Swift Current: the tide brings up a moon shell', 2600, false, true);
}
/** Diving in without the moon shell: it comes along anyway (paid once). */
function paySwiftShell() {
  if (!swift || !swift.earned || swift.paid) return;
  if (swift.shell && swift.shell.collected) return;
  swift.paid = true;
  if (swift.shell) swift.shell.collected = true;
  gainShells(run, MOON_VALUE);
  discover('item-moon'); journal.bump('item-moon', STAT_COLLECTED);
}
/** The Beholder's warning and entry: a quiet toast, the swell, a small shake when it comes. */
function onBeholderEvent(ev) {
  if (V2 && isSafeState(run)) return;
  if (ev.type === 'beholderWarn') {
    sfx.dreadSwell();
    if (V2) ui.showToast('The water turns cold. Something is watching.', 3000, false, true);
  } else {
    sfx.beholderArrive();
    particles.shakeFx(2.5, 0.5);
    if (V2) discover('creature-beholder');
  }
}
/** The drone under the warning: it swells as the Beholder's entry nears and holds while it is here. */
function warnDrone() {
  if (V2 && isSafeState(run)) return 0;
  const w = enemies.beholderWarn();
  return w.state === 1 ? 0.12 + 0.33 * w.p : w.state === 2 ? 0.3 : 0;
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
/** What the creatures did to each other this step (infight.js): a red puff per frenzy bite, a puff where a thrown thing hit. */
let infightLog = 0;
function drainInfight() {
  const evs = infight.events;
  for (let n = 0; n < evs.length; n++) {
    const ev = evs[n];
    if (ev.type === 'frenzyBite') { particles.deathPoof(ev.x, ev.y, '#a3263a'); if (ev.gone) particles.deathPoof(ev.x, ev.y - 0.2, '#d8485a'); }
    else if (ev.src === 'thrown') { particles.bouncePuff(ev.x, ev.y, 0, -1); chain.emit('thrown', ev.x, ev.y, null, false); } // chain.js: the clam it smacked snaps (TRIGGERS.thrown)
    infightLog++;
  }
  evs.length = 0;
}
function wireDamage() {
  hazards.setDamage(damage); props.setDamage(damage); loot.setDamage(damage);
  enemies.setInfight(infight); creatures.setInfight(infight); infight.clearLure(); // a new level: the old level's lures are gone
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

// controls 2026-10-08 (V2-PLAN 17): what F does besides grabbing. The things to grab and the shop are hand-kinds.js; talking
// (F next to someone: the next line now, or a hub resident's turn at once) is here, where the hub and the encounters live.
/**
 * The whirlpool the octopus is in (within PORTAL_R of its centre), or null: the level exit (the hub's dive), the hub's Tutorial
 * ring and its shortcut rings. {ev, tx, ty, x, y}. The sealed dive answers null (the kelp bounces her back on touch instead).
 */
const PORTAL_R = 1.2;
function portalAt(o) {
  if (!V2 || !run || entry || transitioning || octo.hidden || octo.dead) return null;
  const lv = world.level;
  const near = (tx, ty) => tx !== undefined && tx >= 0 && Math.hypot(o.x - (tx + 0.5), o.y - (ty + 0.5)) < PORTAL_R;
  const hub = run.state === S_HUB;
  if (world.reachedExit(o.x, o.y) && !(hub && !MOVETEST && hubSeal() > 0)) return { ev: hub ? EV_ENTER_DIVE : EV_EXIT, tx: lv.exitX, ty: lv.exitY, x: lv.exitX + 0.5, y: lv.exitY + 0.5 };
  if (hub && !MOVETEST && !unlockAnim && near(lv.tutorialX, lv.tutorialY)) return { ev: EV_ENTER_TUTORIAL, tx: lv.tutorialX, ty: lv.tutorialY, x: lv.tutorialX + 0.5, y: lv.tutorialY + 0.5 };
  if (hub && run.shortcut && near(lv.shortcutX, lv.shortcutY)) return { ev: EV_ENTER_SHORTCUT, tx: lv.shortcutX, ty: lv.shortcutY, x: lv.shortcutX + 0.5, y: lv.shortcutY + 0.5 };
  if (hub && run.shortcut3 && near(lv.shortcut3X, lv.shortcut3Y)) return { ev: EV_ENTER_SHORTCUT3, tx: lv.shortcut3X, ty: lv.shortcut3Y, x: lv.shortcut3X + 0.5, y: lv.shortcut3Y + 0.5 };
  return null;
}
/** The hand used on a whirlpool: pay what leaving pays, then the Unity-style entry (beginEntry, unchanged). */
function enterPortal(p) {
  if (p.ev === EV_EXIT && run.state === S_BIOME) {
    paySwiftShell();
    if (questOnExit(quest)) payQuest();
    if (relicHeld) { relicHeld = false; addStory('relics'); story = getStory(); }
  }
  beginEntry(p.ev, p.tx, p.ty);
  return true;
}
const handEnv = {
  get props() { return props; }, get corpses() { return corpses; }, get enemies() { return enemies; },
  get loot() { return V2 && run && (run.state === S_BIOME || run.state === S_TUTORIAL) ? loot : null; }, get bombs() { return bombs; },
  get shopSt() { return shopSt; }, get world() { return world; }, get run() { return run; },
  onShopEvent(ev) { onShopEvent(ev); },
};
if (V2) {
  registerHandKinds(handEnv);
  registerInteract('mirror', { // skins: the hub's mirror shell opens the looks picker
    priority: PRI_TALK + 1,
    find(o, reach) {
      const m = run && run.state === S_HUB ? world.level.mirror : null;
      if (!m) return null;
      const p = mirrorPoint(m);
      return Math.hypot(o.x - p.x, o.y - p.y) <= Math.max(reach, MIRROR_REACH) ? { x: p.x, y: p.y, ref: 'mirror', label: 'looks' } : null;
    },
    use() { return openLooks(); },
  });
  registerInteract('portal', { // Daniel 2026-10-08: whirlpools on F only; a portal beats anything else in reach
    priority: PRI_PORTAL,
    find(o) { const p = portalAt(o); return p ? { x: p.x, y: p.y, ref: p } : null; },
    use(t) { const p = portalAt(octo); return p ? enterPortal(p) : false; },
  });
  registerInteract('talk', {
    priority: PRI_TALK,
    find(o, reach) {
      if (!run) return null;
      if (run.state === S_HUB && world.level.signX !== undefined && world.level.signX >= 0) {
        let best = null, bd = reach;
        for (const r of activeResidents()) {
          const pl = hubPlace(world.level, r.id, sim.time), y = pl.fly ? pl.y : pl.y - 0.8;
          const d = Math.hypot(o.x - pl.x, o.y - y);
          if (d <= bd) { bd = d; best = { x: pl.x, y, ref: r.id }; }
        }
        return best;
      }
      if (run.state === S_BIOME && quest && quest.talk && talking(quest.talk) && Math.hypot(o.x - quest.cx, o.y - quest.cy) <= reach) return { x: quest.cx, y: quest.cy, ref: '' };
      return null;
    },
    use(t) {
      const tk = t.ref ? hubTalk.talk : quest.talk;
      if (t.ref && hubTalk.who !== t.ref) { // a hub resident who is not speaking: their turn now
        if (talking(tk)) { tk.q.length = 0; tk.left = 0; tk.text = ''; hubTalk.who = ''; }
        hubTalk.cool[t.ref] = 0;
        return true;
      }
      if (!talking(tk)) return false;
      tk.left = Math.min(tk.left, 1e-4); talkStep(tk, 1e-3); // the next line (or the end of it)
      return true;
    },
  });
}

// the ink jet's target list: the enemies plus one reusable stand-in per live shopkeeper (inkjet.js reads x, y, radius, hp, dead)
const keeperProxies = [];
const wareProxies = [];
function inkTargets() {
  const list = enemies.all();
  if (V2) inkV16Targets(list);
  if (V2 && shopSt && run.state === S_BIOME) { // a ware on its pedestal stops a blob (it has no hp: inkSplatWares knocks it off)
    for (let i = 0; i < shopSt.ware.length; i++) {
      if (shopSt.ware[i] !== W_SHELF || shopSt.sold[i]) continue;
      const p = wareProxies[i] || (wareProxies[i] = { ware: true, slot: 0, x: 0, y: 0, radius: WARE_R, hp: undefined, dead: false });
      p.slot = i; p.x = shopSt.px[i * 2]; p.y = shopSt.px[i * 2 + 1] - 0.15;
      list.push(p);
    }
  }
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
  if (e.v16 === 3) { inkAmbient(e); return; }
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
    for (const n of npcs.list()) if (!n.dead) list.push(inkV16Proxy(2, n.x, n.cy, 0.45, n.hostile));
  }
  inkAmbientTargets(list);
}

// Actions tuning: the harmless background fish (ambient.js) as ink targets, at the spot they are drawn: decor.js's open-water
// critters and the foliage's hover fish (the little greenranha). Built only while a blob is in flight; never auto-aimed.
const ambPool = [], hoverOut = [];
function ambProxy(n, kind, bx, by, phase, t, reduced) {
  const p = ambPool[n] || (ambPool[n] = { v16: 3, ambient: true, kind: '', bx: 0, by: 0, x: 0, y: 0, radius: 0, hp: 1, dead: false });
  p.kind = kind; p.bx = bx; p.by = by; p.radius = AMBIENT_R[kind]; p.hp = 1; p.dead = false;
  ambientPos(kind, bx, by, phase, t, reduced, p);
  return p;
}
function inkAmbientTargets(list) {
  if (!inkResident || !inkJet.data.alive.some((a) => a === 1)) return;
  const t = sim.time, reduced = prefersReducedMotion();
  let n = 0;
  for (const c of decor.visibleCritters(inkResident)) if (c.kind === 'fish') list.push(ambProxy(n++, 'fish', c.x, c.y, c.phase, t, reduced));
  const m = renderer.hoverFish ? renderer.hoverFish(inkResident, hoverOut) : 0;
  for (let i = 0; i < m; i++) list.push(ambProxy(n++, 'greenranha', hoverOut[i].x, hoverOut[i].y, hoverOut[i].phase, t, reduced));
}
/** A blob hit a background fish: it dies, Spelunky style (struck off the level, a small belly-up corpse sinks). */
function inkAmbient(p) {
  killAmbient(p.bx, p.by);
  p.dead = true;
  if (V2) corpses.add('ambient-' + p.kind, p.x, p.y, 0, 0.5, 1);
  particles.deathPoof(p.x, p.y, '#cfe8a0');
  runStats.fish = (runStats.fish || 0) + 1;
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
        if (!INFIGHT_KILL[ev.src]) run.dive.kills++;
        if (!ev.quiet) shopAggro('kill');
        break;
      case 'clawLaunch': sfx.dash(); break;
      case 'clawHit': particles.bouncePuff(ev.x, ev.y, 0, -1); break; // INFIGHT.claw: it hit something in the way
      case 'octoHit': particles.shakeFx(SHAKE_HURT_PX * 1.6); break;
      default: break;
    }
  }
  evs.length = 0;
}

/**
 * An encounter ended well (owners round 3: freed, the cage broken, met, or the follower brought to the exit): the outcome picked
 * in planQuest happens. `now` is given at once (shells drop from the person, or straight into the wallet at the exit); `later`
 * becomes a meeting further down the dive (people.js); `next` a gift waiting in the hub. The person's story moves up one stage
 * (unless the row says `stage: false`), the People entry counts it. Called once per encounter (quest.paid).
 */
function payQuest() {
  if (!quest || quest.paid) return;
  quest.paid = true;
  const p = quest.plan, o = p.outcome;
  run.dive.quests++;
  sfx.chime();
  if (p.reward > 0) gainShells(run, p.reward); // an old row with a flat reward
  if (o && o.now) giveReward(o.now, quest.cx, quest.cy - 0.3, p.kindId === Q_RESCUE && quest.following);
  else particles.pickupSparkle(quest.cx, quest.cy - 0.5, '#c8f5e6');
  if (o && o.later) people.owe(p.npc, p.name, o.later, run.level, beatSeed(run.diveSeed, run.level, p.npc, 7), BIOME_LEVELS, !!run.rest);
  if (o && o.giftId) { setStoryExact('gift' + capName(p.npc), o.giftId); }
  if (p.journal) { discover(p.journal); journal.bump(p.journal, STAT_COLLECTED); }
  if (p.stage) setStory(p.npc, nextStage(diveStory[p.npc] | 0, p));
  diveDone.add(p.npc);
  if (p.id === 'marlo-1') addStory('diverFreed');
  else if (p.id === 'pip-1') addStory('critterFreed');
  else if (p.id === 'pip-2') addStory('explorePip');
  else if (p.npc === 'quill') addStory('digQuill');
  story = getStory();
  checkSkins(quest.cx, quest.cy - 0.1, quest.talk); // skins: their look, the first time
}

/**
 * A person hands something over: {shells}, {bombs}, {hearts}, {juice} or {item}. Shells drop out of them as real shells to pick up
 * (`direct`: straight into the wallet, e.g. at the exit); the rest goes to the octopus at once with a sparkle.
 */
function giveReward(r, x, y, direct = false) {
  if (!r) return;
  if (r.shells > 0) { if (direct) gainShells(run, r.shells | 0); else dropShells(r.shells | 0, x, y); }
  if (r.bombs > 0) octo.bombs = Math.min(octo.bombMax || BOMB_MAX, octo.bombs + (r.bombs | 0));
  if (r.hearts > 0) { octo.hearts = Math.min(octo.heartMax, octo.hearts + (r.hearts | 0)); prevHearts = octo.hearts; }
  if (r.juice > 0) run.juice = Math.min(juiceCap(), run.juice + (r.juice | 0));
  if (r.item) takeCarried(r.item, x, y);
  particles.pickupSparkle(octo.x, octo.y, '#c8f5e6');
  if (!r.shells) particles.pickupSparkle(x, y, '#bfe8d8');
}

/** Gifts handed over in the hub (save.js boonX): applied when a dive starts, then cleared. */
function applyBoons() {
  const b = story.boonBombs | 0, s = story.boonShells | 0, j = story.boonJuice | 0;
  if (!b && !s && !j) return;
  if (b) octo.bombs = Math.min(octo.bombMax || BOMB_MAX, octo.bombs + b);
  if (s) gainShells(run, s);
  if (j) run.juice = Math.min(juiceCap(), run.juice + j);
  for (const k of ['boonBombs', 'boonShells', 'boonJuice']) setStoryExact(k, 0);
  story = getStory();
}

/** Per step in a level or the grotto: the visitors greet you and hand over what they kept for you; the pool hosts talk. */
function stepPeople() {
  for (const g of people.step(octo, STEP, npcs)) {
    giveReward(g.reward, g.x, g.y - 0.2);
    sfx.chime();
    const v = g.v;
    addStory('later' + capName(v.owed.from));
    if (v.variant === 'mama') addStory('mamaPip');
    const ent = questTable.npcById.get(v.owed.from);
    if (ent && ent.journal) { discover(ent.journal); journal.bump(ent.journal, STAT_COLLECTED); }
    story = getStory();
  }
  for (const ps of poolSts) {
    if (!ps.talk) continue;
    talkStep(ps.talk, STEP);
    idleStep(ps.idle, ps.plan.x - 1.7, ps.plan.floorY + 0.5, octo, STEP);
  }
}

/** A blast at (x, y): the person of this level's encounter, the visitors and the pool hosts close by jump and shout. */
function peopleReact(x, y) {
  if (quest) questReact(quest, x, y);
  const reactOf = (id) => { const n = questTable.npcById.get(id); return n ? n.react : []; };
  people.react(x, y, reactOf, npcs);
  if (npcs && !npcs.owns(NPC_HOST)) for (const ps of poolSts) if (ps.idle) idleReact(ps.idle, ps.talk, reactOf('host'), x, y, ps.plan.x - 1.7, ps.plan.floorY + 0.5);
}

/** The host after a won wager (owners round 3): his outcome (a tip now, a debt paid further down, nothing, or a gift in the hub). */
function hostWin(ps) {
  const host = questTable.npcById.get('host');
  if (!host || !ps.talk || (npcs && npcs.owns(NPC_HOST))) return;
  const o = pickOutcome(host.outcomes, beatSeed(run.diveSeed, run.level, 'host', (story.poolWon | 0) + 3));
  if (!o) return;
  ps.talk.q.length = 0; ps.talk.left = 0; ps.talk.text = '';
  say(ps.talk, o.lines);
  if (o.now) giveReward(o.now, ps.plan.x - 1.7, ps.plan.floorY + 0.3);
  if (o.later) people.owe('host', host.name, o.later, run.level, beatSeed(run.diveSeed, run.level, 'host', 11), BIOME_LEVELS, !!run.rest);
  if (o.giftId) setStoryExact('giftHost', o.giftId);
  if ((story.host | 0) < 1) setStory('host', 1); // he moves into the hub after your first win
  ps.outcome = o.id;
  story = getStory();
  checkSkins(ps.plan.x - 1.7, ps.plan.floorY - 0.4, ps.talk); // skins: the host's hat after the first won wager
}

/** This level's visitors: meetings owed for this level (or the grotto), placed near the exit (or the spring). */
function setupPeople() {
  const lv = world.level;
  const due = run.state === S_REST ? DUE_REST : run.level;
  const anchor = run.state === S_REST ? (restSpring ? { x: restSpring.x, y: restSpring.y - 1 } : { x: lv.startX + 0.5, y: lv.startY + 0.5 }) : (lv.exitX >= 0 ? { x: lv.exitX + 0.5, y: lv.exitY + 0.5 } : null);
  const sh = lv.shop, qp = quest ? quest.plan.pos : null;
  const bad = (x, y) => (sh && x >= sh.x0 - 2 && x < sh.x1 + 2 && y >= sh.y0 - 2 && y < sh.y1 + 2) || (qp && Math.hypot(qp[0] - x, qp[1] - y) < 3);
  const chatOf = (id) => { const n = questTable.npcById.get(id); return n ? n.chat : []; };
  for (const v of people.setupLevel(due, world, anchor, bad, chatOf)) {
    if (world.addPlantKeepOut) world.addPlantKeepOut(Math.floor(v.x) - 2, Math.floor(v.floorY) - 3, Math.floor(v.x) + 3, Math.floor(v.floorY) + 1);
    (questClear || (questClear = [])).push(v.x, v.cy);
  }
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
      hostWin(poolSt);
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
  if (world.tileAt) { // fish bone (fragile.js): met when within 4 tiles
    const ox = Math.floor(octo.x), oy = Math.floor(octo.y);
    for (let ty = oy - 4; ty <= oy + 4; ty++) for (let tx = ox - 4; tx <= ox + 4; tx++) if (world.tileAt(tx, ty) === MAT_BONE) { discover('prop-fishbone'); ty = oy + 5; break; }
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
  const who = npcByName(p.npc), owned = !!(npcs && npcs.owns(who));
  const near = visibleAt(cullFlags('quest', 1), 0, st.cx, st.cy, 4); // r43: the diver / critter / cage far from the camera is not animated or drawn
  const face = st.idle.face, lift = idleLift(st.idle);
  switch (near ? p.kindId : -1) {
    case Q_VAULT: // r3: once freed he stays (stands where he settled), faces you and waves while he talks
      if (owned) break;
      if (!st.collected) drawDiver(c, camera, cw, ch, st.cx, st.cy + 0.22, t, false, true);
      else drawPerson(c, camera, cw, ch, 'marlo', '', st.cx, st.cy + 0.22, t, face, lift, { wave: !!st.talk.text });
      break;
    case Q_RESCUE:
      if (!st.following && !st.staying) { if (!owned) drawCritter(c, camera, cw, ch, st.cx, st.cy, false, t, p.floorY, p.variant); }
      else {
        drawCage(c, camera, cw, ch, p.pos[0], p.floorY, 1.25, 1.15, true); // the broken cage stays behind, open
        if (!owned) drawPerson(c, camera, cw, ch, 'pip', p.variant, st.cx, st.cy, t, face, lift);
      }
      break;
    case Q_MEET:
      if (!owned) drawPerson(c, camera, cw, ch, p.npc, p.variant, st.cx, p.npc === 'pip' ? st.cy : p.floorY, t, face, lift, { lantern: p.npc === 'quill' && (story.quill | 0) >= 2 });
      break;
    default: break;
  }
  if (owned) return; // npcs-draw.js draws an angry person and its words
  const sp = questSpeaker(st);
  drawSpeech(c, camera, cw, ch, sp[0], sp[1] - lift, st.talk.text, talkAlpha(st.talk), p.name);
}

/** r3: the visitors waiting with a reward (near the exit, in the grotto) and the pool hosts' words after a won wager. */
function drawPeopleExtras(c, camera, cw, ch, t) {
  for (const v of people.visitors) {
    if (v.hostile || (npcs && npcs.owns(v.who))) continue;
    const lift = idleLift(v.idle);
    drawPerson(c, camera, cw, ch, v.npc, v.variant, v.x, v.y, t, v.idle.face, lift, { wave: !!v.talk.text });
    const head = v.npc === 'pip' ? (v.variant === 'mama' ? 0.95 : 0.7) : v.npc === 'marlo' ? 1.35 : 1.45;
    if (v.talk.text) drawSpeech(c, camera, cw, ch, v.x, v.y - head - lift, v.talk.text, talkAlpha(v.talk), v.name);
  }
  if (run.state === S_BIOME && !(npcs && npcs.owns(NPC_HOST))) for (const ps of poolSts) {
    if (ps.talk && ps.talk.text) drawSpeech(c, camera, cw, ch, ps.plan.x - 1.7, ps.plan.floorY + 1 - 1.3, ps.talk.text, talkAlpha(ps.talk), 'The Host');
  }
}

// --- the hub residents: Marlo on the ledge, Pip swimming about, Quill on the left ledge ('L'); each speaks when you come near ---
const HUB_TALK_R = 3.4;
const HUB_TALK_CUT = 1.6; // r40: swimming this far beyond HUB_TALK_R cuts a resident's speech
/** Where a resident is: x, y of the feet (or the centre for the swimmers) and the head height for the bubble. */
function hubPlace(lv, id, t, which = 0) {
  switch (id) {
    case 'marlo': return { x: lv.signX + 0.5, y: lv.signY + 1, head: 1.35, fly: false };
    case 'quill': return { x: lv.quillX + 0.3, y: lv.quillY + 1, head: 1.3, fly: false };
    case 'host': return { x: lv.signX + 4.5, y: lv.signY + 1, head: 1.3, fly: false }; // r3: on the little ledge right of Marlo, after your first won wager
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
    for (const [k, n] of v.set) { if (/^(gift|boon)/.test(k)) setStoryExact(k, n); else setStory(k, n); if (k === 'relicsGiven') journal.bump('person-collector', STAT_COLLECTED); }
    if (v.gift) { sfx.chime(); particles.pickupSparkle(octo.x, octo.y, '#c8f5e6'); } // r3: a gift for the next dive
    story = getStory();
    for (const id of v.discover) discover(id);
    { const pl = hubPlace(lv, r.id, sim.time); checkSkins(pl.x, pl.fly ? pl.y : pl.y - 1, hubTalk.talk); } // skins: Quill's welcome
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
    else if (r.id === 'host') drawPerson(c, camera, cw, ch, 'host', '', pl.x, pl.y, t, octo.x >= pl.x ? 1 : -1, 0);
    else drawCritter(c, camera, cw, ch, pl.x, pl.y, true, t, 0, '');
  }
  if (hubTalk.who && hubTalk.talk.text) {
    const pl = hubPlace(lv, hubTalk.who, t);
    drawSpeech(c, camera, cw, ch, pl.x, pl.y - pl.head, hubTalk.talk.text, talkAlpha(hubTalk.talk), questTable.npcById.get(hubTalk.who).name);
  }
}

function onShopEvent(ev) {
  if (ev.type === 'fell') { particles.bombDebris(ev.x, ev.y + 0.5); return; }
  if (ev.type === 'knocked') { particles.bouncePuff(ev.x, ev.y, 0, -1); if (ev.by) wareKnocked(); return; } // a dash knocked it off: theft
  if (ev.type === 'stolen' || ev.type === 'bought') { if (run.state === S_TUTORIAL) tutBuys++; }
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
  ui.setGameOverLabels('The dark took you', 'Restart run', 'Back to the hub');
  // the tutorial is offered at launch until it has been finished once (the dive stays sealed until then); ?at= and the test room skip it
  if (run.state === S_HUB && !MOVETEST && !run.tutorialDone && !params.get('at') && params.get('offer') !== '0') {
    ui.showOffer('New to the Shallows?', 'The dive is sealed with kelp until you finish the tutorial: a few small caves that teach swimming, dashing, ink, the hand, bombs, spells, the shop and the dangers below. You can replay it from its ring in the hub.',
      'Play the tutorial', 'Look around the hub first', (yes) => { if (yes) v2Event(EV_ENTER_TUTORIAL); });
  }
  setupLevelExtras();
  showLevelTitle(); // the first level's title card (after the extras: it carries the Swift Current target)
  discoverStatePlace();
  if (run.state === S_END) showEndScreen();
}

// --- Mandatory test hooks (OVERNIGHT.md §2 "Test hooks") ---
window.__octo = {
  /** Skins (2026-10-08): unlocked, worn, the sheet being built / kept, gifts in flight, the picker. */
  skins() { return { unlocked: getSkins(), current: getSkin(), drawn: getOctopusSkin(), sheet: skinSheetStats(), gifts: skinGifts.list.map((g) => ({ id: g.id, t: g.t, done: g.done })), open: looksPicker.isOpen(), cards: looksPicker.cards(), mirror: world.level.mirror || null }; },
  wearSkin(id) { const r = saveSkin(id); setOctopusSkin(r); return r; },
  openLooks() { return openLooks(); },
  closeLooks() { looksPicker.hide(); return true; },
  looksWear(i) { return looksPicker.wearIndex(i); },
  checkSkins(x, y) { return checkSkins(x, y); },
  /** Controls 2026-10-08: the hand: what is held, the target in reach, counters, the swim weight and the phone button's mode. */
  /** Test hook: one tap of F on the next step (grab, talk, buy, or enter the whirlpool the octopus is in). */
  pressHand() { handTap = true; return true; },
  hand() {
    const t = hand.target;
    const hp = hand.held && hand.held.pos ? hand.held.pos() : null;
    return { held: hand.heldKind || '', heldAt: hp ? { x: hp.x, y: hp.y } : null, target: t ? { kind: t.kind, x: t.x, y: t.y } : null, grabs: hand.grabs, throws: hand.throws, drops: hand.drops, uses: hand.uses,
      carryMul: octo.carryMul, shield: !!octo.shieldHit, phone: phoneHandMode(hand, octo), flying: hand.flying.length, reach: HAND_REACH, keeperNotice };
  },
  /** Test hook: draw one frame with the draw order traced; returns {held, kind, octo, before, after}: how often the held thing was
   * drawn before and after the octopus (it must be 0 and 1). */
  heldDrawOrder() { drawTrace.on = true; drawTrace.log.length = 0; heldTrace = null; try { render(1, 16); } finally { drawTrace.on = false; drawTrace.log.length = 0; } return heldTrace; },
  /** Test hook: stop the loop and run n frames of dtMs each (a 1000/dtMs Hz display), recording per frame where the held thing
   * was drawn {x, y}, where its system had it {sx, sy} and the drawn octopus {ox, oy}; then restart the loop. circleS > 0: the
   * move stick turns a full circle every circleS seconds of frames (it swims in a circle). */
  /** Test hook: keep a held stunned creature stunned for s more seconds (so a long capture does not end with it wriggling free). */
  heldStun(s) { const e = hand.held && hand.held.enemy; if (e) e.stun = Math.max(e.stun, s); return !!e; },
  heldFrames(n, dtMs, circleS = 0) {
    loop.stop();
    const rec = [];
    try {
      loop.manualFrames(n, dtMs, (i) => {
        rec.push(heldLast ? { ...heldLast, angle: octo.angle, side: octo.handSide } : null);
        if (circleS > 0) { const a = (i + 1) * dtMs / 1000 / circleS * Math.PI * 2; input.setOverride({ move: { x: Math.cos(a), y: Math.sin(a) } }); }
        else if (circleS < 0) input.setOverride({ move: { x: 1, y: 0.25 } }); // straight on, slightly down
      });
    } finally { if (circleS) input.setOverride(null); loop.start(); }
    return rec;
  },
  /** Test hook: stun every moving enemy within r of (x, y) for s seconds (as a blast does, without the push). */
  stunNear(x, y, r, s = 1) { return enemies.knockInRadius(x, y, r, 0, s); },
  /** Test hook: a loot pot / clam on the floor at (x, y) ('pot' | 'clam'); returns its record index. */
  addLoot(kind, x, y, shells = 2) { return loot.add({ lk: kind === 'clam' ? 1 : 2, x, y, dx: 0, dy: 0, n: shells }); },
  /** Test hook: the bombs in play (position, mode 0 plain / 1 heavy / 2 sticky, prop state, armed, fuse, stuck to a creature). */
  bombsLive() {
    const d = props.data;
    return bombs.list().filter((b) => !b.exploded && b.pid >= 0).map((b) => ({ x: b.x, y: b.y, vx: d.vx[b.pid], vy: d.vy[b.pid], mode: d.mode[b.pid], state: d.state[b.pid], armed: b.armed, fuse: b.fuse, stuck: !!d.stuck[b.pid], onCreature: !!b.stickE }));
  },
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
  /** Time pressure test hooks: set the level clock (seconds on this level), read the Beholder's clock / warning and the Swift Current state. */
  tileAt(tx, ty) { return world.tileAt(tx, ty); },
  setLevelTime(t) { sim.time = +t || 0; return sim.time; },
  /** The one-line HUD strip (hud-strip.js): what it shows, and the clocks behind it (s). `setClocks` moves the level / run clocks. */
  hud() { return { ...ui.hudRead(), levelClock, runClock: run.dive.time }; },
  setClocks(level, total) { levelClock = +level || 0; run.dive.time = +total || 0; return { levelClock, runClock: run.dive.time }; },
  timePressure() {
    const w = enemies.beholderWarn(), tm = enemies.beholderTiming(), b = enemies.beholder();
    return { time: sim.time, warn: { state: w.state, p: w.p, dx: w.dx, dy: w.dy }, timing: { ...tm }, beholder: b ? { x: b.x, y: b.y } : null, safe: isSafeState(run),
      swift: swift ? { target: swift.target, earned: swift.earned, paid: swift.paid, exitX: swift.exitX, exitY: swift.exitY, shell: swift.shell ? { x: swift.shell.x, y: swift.shell.y, collected: swift.shell.collected } : null } : null };
  },
  giveBombs(n) { octo.bombs = n | 0; return octo.bombs; },
  /** v2: the corpses (kind, position, velocity, state: 'free' | 'rest') for tests and review. */
  corpses() {
    const d = corpses.data, out = [];
    for (let i = 0; i < d.n; i++) if (d.alive[i]) out.push({ i, kind: corpseKindName(d.kind[i]), x: d.x[i], y: d.y[i], vx: d.vx[i], vy: d.vy[i], rot: d.rot[i], state: d.state[i] ? 'rest' : 'free' });
    return out;
  },
  /** Enemies (kind, position, pattern state, telegraph, stun) and shots, for tests and review. */
  enemies() {
    return enemies.all().filter((e) => !e.ghost).map((e) => ({ drawn: e.cv === 1, id: e.id, kind: e.kind, x: e.x, y: e.y, vx: e.vx, vy: e.vy, st: e.st, t: e.t, tell: e.tell, stun: e.stun, placement: e.placement, face: e.face, dir: e.dir, aim: e.aim, dead: e.dead, tg: e.tg || 0, frenzy: e.frenzy || 0 }));
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
  /** The death tint drawn on the game canvas last frame (CSS px): the clear hole's centre and radius, where it reaches full
   * strength (outer) and its strongest alpha; alpha 0 when no tint is drawn. Read instead of the canvas pixels: a getImageData
   * on the game canvas could switch it to software rendering. */
  deathTint() { return { ...deathTintLook }; },
  /** The tutorial's rooms: the room the octopus is in, goals done, doors opened (and how many coral tiles each still has), the prompt shown. */
  tutorial() {
    const lv = world.level, rooms = lv.rooms || [];
    const doors = {};
    for (const [k, l] of Object.entries(lv.doors || {})) { let n = 0; for (let i = 0; i < l.length; i += 2) if (world.tileAt(l[i], l[i + 1]) !== 0) n++; doors[k] = n; }
    const pe = document.querySelector('.octo-prompt');
    return {
      state: run.state, tutorial: run.state === S_TUTORIAL, room: tutState.room, roomId: tutState.room >= 0 && rooms[tutState.room] ? rooms[tutState.room].id : '',
      rooms: rooms.map((r, i) => ({ id: r.id, goal: r.goal, door: r.door || 0, done: !!(tutState.done && tutState.done[i]), t: tutState.roomT ? tutState.roomT[i] : 0 })),
      open: { ...tutState.open }, doors, buys: tutBuys, throws: hand.throws, casts: runStats.spellsCast, hearts: octo.hearts, bombs: octo.bombs, juice: run.juice,
      prompt: pe && pe.offsetParent !== null ? pe.textContent : '', practice: !!octo.practice,
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
      w: world.width, h: world.height, run: { ...run }, stage: stageLabel(run), quillX: world.level.quillX === undefined ? -1 : world.level.quillX, quillY: world.level.quillY === undefined ? -1 : world.level.quillY, signX: world.level.signX === undefined ? -1 : world.level.signX, signY: world.level.signY === undefined ? -1 : world.level.signY,
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
  /** The Carried page: select a card by key (slot:N, jet, bomb, jar, item:ID); the carried state as the page sees it; journal counters of an entry. */
  journalSelect(id) { journalScreen.select(id); return journalScreen.entry(); },
  carried() { return run ? carriedState() : null; },
  journalStats(id) { return [0, 1, 2, 3, 4, 5, 6].map((k) => journal.stat(id, k)); },
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
  /** Chain reactions (chain.js): its stats, the pending links and the TRIGGERS table. */
  chain() {
    const q = chain.queue, links = [];
    for (let k = 0; k < q.n; k++) links.push({ target: TRIGGER_NAMES_[q.tgt[k]], i: q.idx[k], due: q.due[k] - chain.now(), depth: q.depth[k], chain: q.chain[k], sx: q.sx[k], sy: q.sy[k], tx: q.tx[k], ty: q.ty[k] });
    return { stats: { ...chain.stats }, now: chain.now(), links, triggers: TRIGGERS };
  },
  chainInfo(id) { return chain.chainInfo(id); },
  /** Test hook: `src` (a TRIGGERS source) goes off at (x, y) as a new chain; returns its id. */
  chainEmit(src, x, y, byOcto = true) { return chain.emit(src, x, y, null, byOcto); },
  /** Test hook: a lit bomb at (x, y) with `fuse` s, pinned in place unless `loose`, costing nothing. Returns its id (or -1). */
  bombAt(x, y, fuse = 2.5, loose = false) {
    if (!bombs.place(octo, x, y, null, { pinned: !loose, fuse, free: true })) return -1;
    const b = bombs.list()[bombs.list().length - 1];
    if (b.pid >= 0) { props.data.vx[b.pid] = 0; props.data.vy[b.pid] = 0; } // set down, not tossed
    return b.id;
  },
  bombs() { return bombs.list().map((b) => ({ id: b.id, x: b.x, y: b.y, fuse: b.fuse, exploded: b.exploded, chain: b.chain, depth: b.depth })); },
  /** Test hook: put a hazard down by name ('rock', 'eel', 'jet', ...) at the anchor cell (x, y), facing (dx, dy), from this level's tiles. */
  addHazard(name, x, y, dx = 0, dy = 0) {
    const lv = world.level; const rec = makeHazardRecord(name, x, y, dx, dy, lv.tiles, world.width, world.height);
    return rec ? hazards.add(rec) : -1;
  },
  /** Test hook: put loot down ('pot' | 'clam' | 'chest'), held on the cell under it; trap: 0 none, 1 spikes, 2 swarm (a chest). */
  addLoot(name, x, y, trap = 0) { return loot.add({ lk: LOOT_CODE_[name], x, y, dx: 0, dy: -1, n: 2, aux: trap, item: 0 }); },
  /** v2: the loot of this level (kind name, position, state) for tests and review. */
  loot() {
    const d = loot.data, out = [];
    for (let i = 0; i < d.n; i++) out.push({ kind: LOOT_NAMES[d.kind[i]], x: d.x[i], y: d.y[i], state: d.state[i], count: d.count[i], aux: d.aux[i] });
    return { items: out, chase: loot.chaseLeft(), rocks: d.nr };
  },
  /** Actions tuning test hook: put a clam or pot ('clam' | 'pot') holding `n` shells at (x, y); returns its loot index. */
  spawnLoot(kind, x, y, n = 2) { return loot.add({ lk: LOOT_NAMES.indexOf(kind), x, y, n }); },
  /** Test hook: is world point (x, y) solid rock? */
  isSolid(x, y) { return world.isSolid(x, y); },
  /** Actions tuning test hook: fire the Ink Jet from the octopus along (dx, dy) (cooldown applies); true when it fired. */
  fireInk(dx, dy) { return inkJet.fire(octo.x, octo.y, dx, dy, octo.radius + 0.1); },
  /** Actions tuning test hook: the live background fish ({kind, x, y} where they are drawn now) and how many were inked. */
  ambientFish() {
    const save = inkResident, list = [];
    inkResident = world.residentChunks();
    const alive = inkJet.data.alive, was = alive[0];
    alive[0] = 1; inkAmbientTargets(list); alive[0] = was; // build the list as if a blob were flying
    inkResident = save;
    return { fish: list.map((p) => ({ kind: p.kind, x: p.x, y: p.y })), killed: ambientDeadCount(), stats: runStats.fish };
  },
  /** V2-PLAN 16: the NPC slots (who, x, y, hp, hostile, dead, state, aim timer ...), the harpoons in flight and the dive's mood record. */
  npcs() { return npcs ? npcs.list() : []; },
  npcHarpoons() { return npcs ? npcs.harpoonList() : []; },
  npcMood() { return { hostile: Array.from(npcMoods.hostile), dead: Array.from(npcMoods.dead), angered: Array.from(npcMoods.angered), hp: Array.from(npcMoods.hp) }; },
  /** Hurt an NPC ('marlo' | 'pip' | 'quill' | 'host') as if by an attack. */
  hitNpc(who, dmg = 1, src = 'test') { if (!npcs) return false; const r = npcs.hurt(npcByName(who), dmg, src); npcs.drain(onNpcEvent); return r; },
  /** Debug: put an NPC in the level; (x, y) is the anchor (feet for marlo / quill / host, the centre for pip). Hostile ones fight at once. */
  spawnNpc(who, x, y, hostile = false) { if (!npcs) return -1; return npcs.spawn(npcByName(who), x, y, !!hostile); },
  /** r3 (quests rework): owed meetings, grudges, this level's visitors, and the encounter's person (where, facing, words, outcome). */
  people() {
    const q = quest;
    return {
      ...people.snapshot(npcs),
      quest: q ? { id: q.plan.id, npc: q.plan.npc, kind: q.plan.kindId, status: q.status, paid: q.paid, outcome: q.plan.outcome ? q.plan.outcome.id : '', role: q.plan.role, following: q.following, staying: q.staying, collected: q.collected, settled: q.settled, helped: q.helped, cx: q.cx, cy: q.cy, floorY: q.plan.floorY, pos: Array.from(q.plan.pos), face: q.idle.face, hop: q.idle.hop, text: q.talk.text, queued: q.talk.q.slice() } : null,
      hosts: poolSts.map((ps) => ({ x: ps.plan.x - 1.7, floorY: ps.plan.floorY + 1, text: ps.talk ? ps.talk.text : '', outcome: ps.outcome || '' })),
      level: run.level, state: run.state,
    };
  },
  /**
   * Test hook (r3): put this level's encounter `rowId` (data/quests.json) in place now, with outcome `outcomeId` (default: the seeded one).
   * Returns the plan's position or null when the level has no spot for it.
   */
  forceQuest(rowId, outcomeId) {
    if (!questTable || run.state !== S_BIOME) return null;
    const row = questTable.rows.find((r) => r.id === rowId);
    if (!row) return null;
    const one = { ...questTable, rows: [{ ...row, chance: 1, levels: [0, 1, 2, 3, 4], need: 0, max: 99 }] };
    const plan = planQuest(world.level, one, levelSpec(run).seed, levelSpec(run).levelIndex, {}, otherSpawns());
    if (!plan) return null;
    plan.max = row.max; plan.need = row.need;
    if (outcomeId) { const o = row.outcomes.find((x) => x.id === outcomeId); if (o) { plan.outcome = o; plan.role = o.role || 'follow'; } }
    quest = createQuestState(plan);
    if (npcs) npcs.remove(npcByName(plan.npc), 0);
    return { x: plan.pos[0], y: plan.pos[1], floorY: plan.floorY, outcome: plan.outcome ? plan.outcome.id : '' };
  },
  /** Test hook (r3): owe a meeting as if `npc`'s outcome `outcomeId` (of row `rowId`, or the host's) had happened on this level. */
  owe(rowId, outcomeId) {
    const row = rowId === 'host' ? { npc: 'host', outcomes: questTable.npcById.get('host').outcomes } : questTable.rows.find((r) => r.id === rowId);
    const o = row && row.outcomes.find((x) => x.id === outcomeId);
    if (!o || !o.later) return null;
    return people.owe(row.npc, questTable.npcById.get(row.npc).name, o.later, run.level, beatSeed(run.diveSeed, run.level, row.npc, 7), BIOME_LEVELS, !!run.rest);
  },
  /** Test hook (r3): the host's outcome after a won wager, as if the first pool of this level paid out. */
  hostWin(outcomeId) {
    const ps = poolSts[0];
    if (!ps) return null;
    if (outcomeId) { const host = questTable.npcById.get('host'), keep = host.outcomes; host.outcomes = keep.filter((o) => o.id === outcomeId); try { hostWin(ps); } finally { host.outcomes = keep; } }
    else hostWin(ps);
    return ps.outcome;
  },
  /** Test hook (r3): a blast's reactions only (no damage): the people about jump and shout. */
  reactAt(x, y) { peopleReact(x, y); return true; },
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
  damageBodies() { const out = []; damage.each((f, i, V) => out.push({ family: f.name, i, kind: V.kind, x: V.x, y: V.y, r: V.r, id: V.id, wound: V.wound, stun: V.stun })); return out; },
  /** Enemy infighting (infight.js): the target override hook a future Lure spell uses. setLure returns the slot (-1: full). */
  setLure(x, y, r, ttl) { return infight.setLure(x, y, r, ttl); },
  clearLure(slot = -1) { infight.clearLure(slot); },
  lures() { return infight.lures(); },
  /** Enemy infighting: creature-vs-creature hits so far and the events drained (frenzy bites, thrown hits ...). */
  infight() { return { hits: infight.hits(), drained: infightLog }; },
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
  /** SPELLS-PICK test hooks: the spell effects of this level, the rune pedestal, a rune straight onto the bar, a cast at a point. */
  spells() {
    const co = spellFx.coralData, mo = spellFx.moteData, hd = hazards.data;
    const cells = []; for (let i = 0; i < co.n; i++) if (co.state[i]) cells.push({ tx: co.tx[i], ty: co.ty[i], state: co.state[i], left: spellFx.coralLeft(i) });
    const rips = []; for (let i = 0; i < hd.n; i++) if (hd.temp[i] && hd.kind[i] === 1) rips.push({ x: hd.x[i], y: hd.y[i], dx: hd.dx[i], dy: hd.dy[i], len: hd.len[i], hw: hd.hw[i], pw: hd.pw[i], age: hd.t[i], life: hd.v[i] });
    const motes = []; for (let i = 0; i < mo.n; i++) if (mo.alive[i]) motes.push({ x: mo.x[i], y: mo.y[i], t: mo.t[i], delay: mo.delay[i] });
    const hb = hotbar();
    return { stats: { ...spellFx.stats }, cells, coral: spellFx.coralCount(), riptides: rips, motes, anchorT: octo.anchorT, anchorVy: octo.anchorVy,
      rune: runeSpot ? { ...runeSpot } : null, slots: hb.slots.map((sl) => sl.ids.slice()), sel: hb.sel, price: slotPrice(selectedIds(hb)), lock: run.castLockUntil || 0, now: sim.time };
  },
  /** Put rune `id` straight onto the hotbar (as a pedestal would); returns the slot or -1. */
  giveRune(id) { return takeRune(hotbar(), id); },
  /** Replace the bar with these slots (arrays of ids) and select `sel` (tests). */
  setSlots(slots, sel = 0) { const hb = hotbar(); hb.slots = slots.map((ids) => ({ ids: ids.slice() })); hb.sel = Math.max(0, Math.min(hb.slots.length - 1, sel)); return hb.slots.length; },
  /** Cast the selected slot as the keyboard does, or at world point (x, y) along (dx, dy) when given. Returns the cast result (1 ok, 0 empty, -1 none, 2 locked). */
  cast(x, y, dx, dy) {
    if (dx !== undefined) lastAim = { x: dx, y: dy };
    return castSelected({ src: { spell: 'key' } }, x !== undefined && x !== null ? { x, y } : null);
  },
  /** Is the world point (x, y) rock (tests stage spells in open water)? */
  isSolid(x, y) { return world.isSolid(x, y); },
  /** Move this level's rune pedestal next to (x, y) (tests and screenshots). */
  placeRuneAt(x, y, id) { runeSpot = { x, y, id: id || (runeSpot && runeSpot.id) || runeForLevel(run.diveSeed >>> 0, hotbar()) || 'riptide', taken: false, dwell: 0, refusedAt: -99 }; return { ...runeSpot }; },
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
    const ev = { enter: EV_ENTER_DIVE, exit: EV_EXIT, death: EV_DEATH, continue: EV_CONTINUE, shortcut: EV_ENTER_SHORTCUT, shortcut3: EV_ENTER_SHORTCUT3, tutorial: EV_ENTER_TUTORIAL, leave: EV_LEAVE }[name];
    if (name === 'restart') return quickRestart();
    return v2Event(ev);
  },
  /** Tutorial unlock / quick restart test hooks: the hub's seal (1 shut .. 0 open), the unlock moment, the offer and the buttons shown. */
  hubSeal() { return { seal: hubSeal(), open: diveOpen(run), tutorialDone: run.tutorialDone, savedDone: getTutorialDone(), unlock: unlockAnim ? { t: unlockAnim.t, seal: unlockAnim.seal } : null, offer: ui.isOfferShown(), bumpAt: sealBumpAt, tutorialX: world.level.tutorialX, tutorialY: world.level.tutorialY }; },
  answerOffer(yes) { ui.answerOffer(yes); return ui.isOfferShown(); },
  uiButtons() { return ui.buttons(); },
  /** Everything a new dive starts from (what a hub visit and the dive whirlpool reset), to compare a quick restart with death -> hub -> dive. */
  runSnapshot() {
    const hb = run.hotbar;
    return {
      state: run.state, level: run.level, levelsCleared: run.levelsCleared, shells: run.shells, items: run.items.slice(), shopAggro: run.shopAggro, shopAggroWhy: run.shopAggroWhy,
      juice: run.juice, juiceStart: run.juiceStart, deaths: run.deaths, dive: { ...run.dive }, last: run.last, nextSeed: run.nextSeed,
      hotbar: hb ? { slots: hb.slots.slice(), sel: hb.sel } : null,
      octo: { hearts: octo.hearts, heartMax: octo.heartMax, bombs: octo.bombs, bombMax: octo.bombMax, dead: !!octo.dead, swimMul: octo.swimMul, lightR: octo.lightR, magnetR: octo.magnetR, spikeHelmet: !!octo.spikeHelmet, seeBuried: !!octo.seeBuried },
      time: sim.time, beholder: enemies.beholderTiming ? { ...enemies.beholderTiming() } : null, beholderOut: !!enemies.beholder(),
      moods: JSON.parse(JSON.stringify(npcMoods)), seenDive: seenDive.size, diveDone: diveDone.size, diveStory: { ...diveStory }, story: { ...story },
      people: { owed: people.owed.length, grudge: Array.from(people.grudge), visitors: people.visitors.length },
      paused: loop.paused, gameOver: ui.isGameOverShown(), transitioning: !!transitioning, stage: stageLabel(run),
    };
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
      skinMB: +((skinSheetStats().bytes + skinSheetStats().previewBytes) / MB).toFixed(2), skinSheets: skinSheetStats().sheets, // skins: the worn look's tinted sheet + the picker previews
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
