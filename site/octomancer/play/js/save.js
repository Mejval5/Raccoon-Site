// Best-score persistence. OVERNIGHT.md §2 "Saves":
// localStorage["octomancer.best.v1"] = {v:1, best, runs, muted}, every
// access in try/catch with an in-memory fallback (private browsing, blocked
// storage, etc. must never throw out of this module).

const KEY = 'octomancer.best.v1';

export const BEST_RUNS_MAX = 5;

function freshMeta() { return { dives: 0, clears: 0, bestDepth: 0, shells: 0, kills: 0, deaths: {} }; }
function freshMemory() {
  return { v: 1, best: 0, runs: 0, muted: false, tutorialDone: false, journal: [], bestRuns: [], shortcut: false, meta: freshMeta() };
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
  out.shells = Math.floor(num(m.shells)); out.kills = Math.floor(num(m.kills));
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
  m.shells += entry.shells; m.kills += entry.kills;
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
