// Best-score persistence. OVERNIGHT.md §2 "Saves":
// localStorage["octomancer.best.v1"] = {v:1, best, runs, muted}, every
// access in try/catch with an in-memory fallback (private browsing, blocked
// storage, etc. must never throw out of this module).

import { defaultSettings, cleanSettings, cleanSetting } from './settings.js';

const KEY = 'octomancer.best.v1';

export const BEST_RUNS_MAX = 5;

function freshMeta() { return { dives: 0, clears: 0, bestDepth: 0, shells: 0, kills: 0, time: 0, deaths: {} }; }
/**
 * Story flags, all flat counters. marlo / pip / quill are the stage of each person (0 = not met): Marlo's stage is the number
 * of runs he was freed in (3 opens the hub shortcut to 1-3), Pip's 1 = freed and living in the hub, Quill's 1 = moved into
 * the hub, 2 = three relics handed over (the lantern). relics = relics carried out through an exit, relicsGiven = handed over
 * to Quill in the hub; said<Name> = the highest stage whose thank-you was spoken in the hub; diverFreed / critterFreed = how
 * many times they were freed (stats); poolPaid / poolWon = Challenge Pool wagers paid and won.
 */
// V2-PLAN 16 (npcs.js): angered<Name> / killed<Name> count the times you turned on / killed Marlo, Pip, Quill or the pool Host (the
// journal's story lines); gone<Name> is how many dive ends they stay away: 2 when killed in a dive, 1 in the hub (setStoryExact lowers it).
const STORY_KEYS = ['diverFreed', 'critterFreed', 'marlo', 'pip', 'quill', 'relics', 'relicsGiven', 'saidMarlo', 'saidPip', 'saidQuill', 'poolPaid', 'poolWon',
  'angeredMarlo', 'angeredPip', 'angeredQuill', 'angeredHost', 'killedMarlo', 'killedPip', 'killedQuill', 'killedHost', 'goneMarlo', 'gonePip', 'goneQuill', 'goneHost'];
function freshStory() { const o = {}; for (const k of STORY_KEYS) o[k] = 0; return o; }
function freshMemory() {
  return { v: 1, best: 0, runs: 0, muted: false, tutorialDone: false, journal: [], bestRuns: [], shortcut: false, meta: freshMeta(), settings: defaultSettings(), journalStats: {}, story: freshStory() };
}

/** @type {ReturnType<typeof freshMemory>} */
let memory = freshMemory();
let loaded = false;

function readFromStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch (e) {
    return null; // private mode / blocked storage / corrupt JSON: keep in-memory only
  }
}

function writeToStorage() {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch (e) {
    // in-memory fallback only; the run still works, just doesn't persist
  }
}

/** Loads the save once (idempotent) and returns the current in-memory copy. */
export function loadBest() {
  if (!loaded) {
    loaded = true;
    const obj = readFromStorage();
    if (obj) {
      memory = {
        v: 1,
        best: Number(obj.best) || 0,
        runs: Number(obj.runs) || 0,
        muted: !!obj.muted,
        tutorialDone: !!obj.tutorialDone,
        journal: Array.isArray(obj.journal) ? obj.journal.filter((id) => typeof id === 'string').slice(0, 1000) : [],
        bestRuns: cleanBestRuns(obj.bestRuns),
        shortcut: !!obj.shortcut,
        meta: cleanMeta(obj.meta),
        settings: cleanSettings(obj.settings),
        journalStats: cleanJournalStats(obj.journalStats),
        story: cleanStory(obj.story),
      };
    }
  }
  return { ...memory, journal: memory.journal.slice(), bestRuns: memory.bestRuns.map((r) => ({ ...r })), meta: { ...memory.meta, deaths: { ...memory.meta.deaths } } };
}

/** Records a finished run's score: bumps `runs`, raises `best` if beaten,
 * persists, and returns the updated save. */
export function recordRun(score) {
  loadBest();
  memory.runs += 1;
  if (score > memory.best) memory.best = score;
  writeToStorage();
  return { ...memory };
}

export function getMuted() {
  return loadBest().muted;
}

export function setMuted(muted) {
  loadBest();
  memory.muted = !!muted;
  writeToStorage();
}

// --- v2 profile (B1-4): journal discoveries and whether the tutorial was played ---

export function getJournalIds() {
  return loadBest().journal;
}

/** Persist the discovered journal entry ids (replaces the stored list). */
export function saveJournalIds(ids) {
  loadBest();
  memory.journal = Array.from(ids).filter((id) => typeof id === 'string');
  writeToStorage();
}

export function getTutorialDone() {
  return loadBest().tutorialDone;
}

export function setTutorialDone(done) {
  loadBest();
  memory.tutorialDone = !!done;
  writeToStorage();
}

/** Test hook: forget the in-memory copy so the next load re-reads localStorage. */
export function _resetForTests() {
  memory = freshMemory();
  loaded = false;
}

// --- v2 run loop and meta (round 33): best runs, the hub shortcut, lifetime stats ---

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

function cleanRun(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    depth: Math.floor(num(r.depth)), shells: Math.floor(num(r.shells)), time: num(r.time), kills: Math.floor(num(r.kills)),
    quests: Math.floor(num(r.quests)), level: Math.floor(num(r.level)), cleared: !!r.cleared,
    cause: typeof r.cause === 'string' ? r.cause : '', seed: Math.floor(num(r.seed)),
  };
}

function cleanBestRuns(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) { const c = cleanRun(r); if (c && c.depth > 0) out.push(c); }
  out.sort(compareRuns);
  return out.slice(0, BEST_RUNS_MAX);
}

function cleanMeta(m) {
  const out = freshMeta();
  if (!m || typeof m !== 'object') return out;
  out.dives = Math.floor(num(m.dives)); out.clears = Math.floor(num(m.clears)); out.bestDepth = Math.floor(num(m.bestDepth));
  out.shells = Math.floor(num(m.shells)); out.kills = Math.floor(num(m.kills)); out.time = num(m.time);
  if (m.deaths && typeof m.deaths === 'object') {
    for (const k of Object.keys(m.deaths).slice(0, 64)) { const n = Math.floor(num(m.deaths[k])); if (n > 0) out.deaths[k] = n; }
  }
  return out;
}

/** Best first: deeper, then more shells, then faster. */
export function compareRuns(a, b) { return b.depth - a.depth || b.shells - a.shells || a.time - b.time; }

/**
 * Insert a finished dive into a best-runs list (top BEST_RUNS_MAX by depth, then shells, then time; an equal older
 * run keeps its place). Pure: returns {list, rank} where rank is the new run's index in the list or -1.
 */
export function insertBestRun(list, entry, max = BEST_RUNS_MAX) {
  const all = list.concat([entry]);
  const order = all.map((r, i) => i).sort((i, j) => compareRuns(all[i], all[j]) || i - j);
  const top = order.slice(0, max);
  return { list: top.map((i) => all[i]), rank: top.indexOf(all.length - 1) };
}

/**
 * Record a finished dive (run.js endDive summary: a death or a biome clear). Updates the best-runs list and the
 * lifetime stats, persists, and returns {rank, bestRuns} (rank -1 when it did not make the top list).
 */
export function recordDive(sum) {
  loadBest();
  const entry = cleanRun(sum) || cleanRun({ depth: 1 });
  const res = insertBestRun(memory.bestRuns, entry);
  memory.bestRuns = res.list;
  const m = memory.meta;
  m.dives++;
  if (entry.cleared) m.clears++;
  if (entry.depth > m.bestDepth) m.bestDepth = entry.depth;
  m.shells += entry.shells; m.kills += entry.kills; m.time += entry.time;
  if (!entry.cleared) { const k = entry.cause || 'unknown'; m.deaths[k] = (m.deaths[k] || 0) + 1; }
  writeToStorage();
  return { rank: res.rank, bestRuns: res.list.map((r) => ({ ...r })) };
}

export function getBestRuns() { return loadBest().bestRuns; }
export function getMeta() { return loadBest().meta; }
export function getShortcut() { return loadBest().shortcut; }

/** The hub shortcut ring to Shallows 1-2: unlocked once the biome has been cleared (never locked again). */
export function setShortcut(on) {
  loadBest();
  memory.shortcut = !!on;
  writeToStorage();
}

// --- settings (round 38): the settings menu's values, applied by main.js the moment they change ---

/** A copy of all settings (musicVol, sfxVol, shake, reducedMotion (null = follow the OS), sink, seed text). */
export function getSettings() { return { ...loadBest().settings }; }

/** Set one setting (cleaned to its range), persist, return the stored value. Unknown keys are ignored. */
export function setSetting(key, value) {
  loadBest();
  const v = cleanSetting(key, value);
  if (v === undefined) return undefined;
  memory.settings[key] = v;
  writeToStorage();
  return v;
}

/** Reset progress: best score, runs, journal, best runs, shortcut, lifetime stats and the tutorial flag. Settings and mute stay. */
export function resetProgress() {
  loadBest();
  const keep = { muted: memory.muted, settings: memory.settings };
  memory = { ...freshMemory(), ...keep };
  writeToStorage();
}

// --- journal counters and story flags (round 38) ---

function cleanJournalStats(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(raw).slice(0, 1000)) {
    const a = raw[id];
    if (!Array.isArray(a)) continue;
    out[String(id)] = [0, 1, 2, 3, 4].map((k) => Math.floor(num(a[k])));
  }
  return out;
}
function cleanStory(raw) {
  const out = freshStory();
  if (raw && typeof raw === 'object') for (const k of STORY_KEYS) out[k] = Math.floor(num(raw[k]));
  // a save from before the questlines: someone freed earlier is a person met (stage 1), already thanked
  if (out.diverFreed > 0 && !out.marlo) { out.marlo = Math.min(3, out.diverFreed); out.saidMarlo = out.marlo; }
  if (out.critterFreed > 0 && !out.pip) { out.pip = 1; out.saidPip = 1; }
  return out;
}

/** Per-entry counters of the journal: {entryId: [seen, killed, killedBy, collected]}. */
export function getJournalStats() { return loadBest().journalStats; }
export function saveJournalStats(stats) {
  loadBest();
  memory.journalStats = cleanJournalStats(stats);
  writeToStorage();
}

/** Story flags of the questlines (see STORY_KEYS): stages of Marlo, Pip and Quill, relics delivered, thank-yous spoken, pool wagers. */
export function getStory() { return { ...loadBest().story }; }
/** Add one to a story counter (a key of STORY_KEYS); returns the new value (0 for an unknown key). */
export function addStory(key) {
  loadBest();
  if (!STORY_KEYS.includes(key)) return 0;
  memory.story[key]++;
  writeToStorage();
  return memory.story[key];
}
/** Set a story counter to exactly `n` (may lower it: the 'gone' counters count down); returns the stored value. */
export function setStoryExact(key, n) {
  loadBest();
  if (!STORY_KEYS.includes(key)) return 0;
  memory.story[key] = Math.floor(num(n));
  writeToStorage();
  return memory.story[key];
}
/** Set a story counter to `n` (never lowers it); returns the stored value. */
export function setStory(key, n) {
  loadBest();
  if (!STORY_KEYS.includes(key)) return 0;
  memory.story[key] = Math.max(memory.story[key], Math.floor(num(n)));
  writeToStorage();
  return memory.story[key];
}
