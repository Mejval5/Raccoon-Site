// Best-score persistence. OVERNIGHT.md §2 "Saves":
// localStorage["octomancer.best.v1"] = {v:1, best, runs, muted}, every
// access in try/catch with an in-memory fallback (private browsing, blocked
// storage, etc. must never throw out of this module).

const KEY = 'octomancer.best.v1';

/** @type {{v:1, best:number, runs:number, muted:boolean, tutorialDone:boolean, journal:string[]}} */
let memory = { v: 1, best: 0, runs: 0, muted: false, tutorialDone: false, journal: [] };
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
      };
    }
  }
  return { ...memory, journal: memory.journal.slice() };
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
  memory = { v: 1, best: 0, runs: 0, muted: false, tutorialDone: false, journal: [] };
  loaded = false;
}
