// M4 scripted checks: score formula and best-score persistence. This page
// never loads main.js, so importing save.js here (a module-level singleton
// elsewhere) can't touch real gameplay state. OVERNIGHT.md §4 M4-1.

import { computeScore } from '../js/score.js';
import { loadBest, recordRun } from '../js/save.js';

export function runScoreTests(assert, approx) {
  // --- score.js: the exact formula from OVERNIGHT.md M4-1 ---
  {
    const s = computeScore(123.6, { plankton: 5, shells: 1 }, 3);
    // depth rounds to 124, +5 (plankton*1) +50 (shell*50) +75 (kills*25)
    assert('computeScore: depth+pickups+kills matches the M4-1 formula (pearls removed round 16)', s === 254);
  }
  {
    const s = computeScore(-5, { plankton: 0, shells: 0 }, 0);
    assert('computeScore: negative depth clamps to 0, not negative score', s === 0);
  }
  {
    const s = computeScore(10.4, { plankton: 0, shells: 0 }, 0);
    assert('computeScore: depth alone rounds to the nearest metre', s === 10);
  }

  // --- save.js: recordRun/loadBest against a fake localStorage, so this
  // test page's own real storage (and any other origin's) is never touched. ---
  const store = new Map();
  const fakeStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  let stubbed = false;
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });
    stubbed = true;
  } catch (e) {
    // Some engines won't let us redefine a host object; fall back to
    // exercising the in-memory path only (still real code, just whatever
    // the real localStorage already holds as the seed).
  }

  const before = loadBest();
  if (stubbed) assert('save.js: starts at best 0 with a fresh store', before.best === 0 && before.runs === 0);

  const afterOne = recordRun(before.best + 50);
  assert('save.js: recordRun raises best when the score beats it', afterOne.best === before.best + 50 && afterOne.runs === before.runs + 1);

  const afterTwo = recordRun(afterOne.best - 40);
  assert('save.js: recordRun does not lower best on a worse run', afterTwo.best === afterOne.best && afterTwo.runs === afterOne.runs + 1);

  if (stubbed) {
    const raw = JSON.parse(fakeStorage.getItem('octomancer.best.v1'));
    assert('save.js: persists {v,best,runs,muted} to storage', raw.v === 1 && raw.best === afterTwo.best && raw.runs === afterTwo.runs);
  }
}
