// v2 level generator (V2-PLAN 2.3, M1-3): a pure function of (runSeed, levelIndex).
// Steps 1 (plan), 3 (fill), 4 (stamp) and 5 (guarantee); specials (step 2) and
// spawns (step 6) come in later milestones. Flat typed arrays only: no classes,
// no per-tile objects. Not wired into the running game yet (M1-4).
//
// Geometry: 3x4 rooms of 10x16 plus a 2-tile border = 34x68 tiles.
// Tile codes: 0 water, 1 rock. Bombs must call isBedrock(x, y) (never breakable).

import { mulberry32, hashSeed } from './rng.js';
import {
  ROOM_W, ROOM_H, RC, CELL_ROCK, CELL_QUANTUM,
  MK_START, MK_EXIT, MK_NONE, KIND_NORMAL,
} from './rooms.js';

export const ROOMS_X = 3, ROOMS_Y = 4, BORDER = 2;
export const LEVEL_W = ROOMS_X * ROOM_W + 2 * BORDER; // 34
export const LEVEL_H = ROOMS_Y * ROOM_H + 2 * BORDER; // 68
export const NROOMS = ROOMS_X * ROOMS_Y;
export const MAX_ATTEMPTS = 10;
export const STOP_ROLL = 0.25;

// roomRole codes
export const ROLE_FILLER = 0, ROLE_PATH = 1, ROLE_START = 2, ROLE_END = 3;

export function isBedrock(x, y) {
  return x < BORDER || x >= LEVEL_W - BORDER || y < BORDER || y >= LEVEL_H - BORDER;
}

let defaultBank = null;
/** Register the bank generateLevel uses when none is passed. */
export function setDefaultBank(bank) { defaultBank = bank; }

// Scratch buffers reused across calls; every use resets what it reads, so generateLevel stays pure.
const _fat = new Uint8Array(LEVEL_W * LEVEL_H);
const _seen = new Uint8Array(LEVEL_W * LEVEL_H);
const _queue = new Int32Array(LEVEL_W * LEVEL_H);
const _cand = new Int32Array(1024);
const _cand2 = new Int32Array(1024);

// ---------------------------------------------------------------- picks

function pickWeighted(rng, list, n, weight) {
  let total = 0;
  for (let i = 0; i < n; i++) total += weight[list[i]];
  let r = rng() * total;
  for (let i = 0; i < n; i++) {
    r -= weight[list[i]];
    if (r < 0) return list[i];
  }
  return list[n - 1];
}

// ---------------------------------------------------------------- step 1: plan

const DIR_R = 0, DIR_D = 1, DIR_L = 2;

/**
 * BuildMainPath, TopToBottom: start in a random column of row 0, walk Right / Down / Left
 * (never up, never onto a used cell), each room connecting to the previous one. Row 3 stops
 * with a 25% roll or at a dead end (that room becomes the end room). A dead end above
 * row 3 fails the plan. Returns the number of path rooms, or 0 on failure.
 * Fills roomVar (variant per cell, -1 = empty), roomRole and path (cell order).
 */
function planPath(rng, bank, roomVar, roomRole, path) {
  const { V, kind, marker, weight, connR, connD, connL, hasR, hasD, hasL } = bank;
  let cx = Math.floor(rng() * ROOMS_X), cy = 0;
  let prev = -1, prevDir = -1, n = 0;
  for (let guard = 0; guard < NROOMS; guard++) {
    const cell = cy * ROOMS_X + cx;
    const canR = cx < ROOMS_X - 1 && roomVar[cell + 1] < 0;
    const canL = cx > 0 && roomVar[cell - 1] < 0;
    const canD = cy < ROOMS_Y - 1;
    // candidates: normal rooms that connect to the previous room; ends and the start need a marker
    let nGo = 0, nEnd = 0;
    for (let a = 0; a < V; a++) {
      if (kind[a] !== KIND_NORMAL) continue;
      if (prev >= 0) {
        const t = prevDir === DIR_R ? connR : prevDir === DIR_D ? connD : connL;
        if (!t[prev * V + a]) continue;
      } else if (marker[a] === MK_NONE) continue;
      const go = (canR && hasR[a]) || (canD && hasD[a]) || (canL && hasL[a]);
      if (go) _cand[nGo++] = a;
      if (marker[a] !== MK_NONE) _cand2[nEnd++] = a;
    }
    const last = cy === ROOMS_Y - 1;
    let isEnd = false;
    if (last) isEnd = rng() < STOP_ROLL || nGo === 0;
    else if (nGo === 0) return 0;
    if (isEnd && nEnd === 0) return 0;
    const a = isEnd ? pickWeighted(rng, _cand2, nEnd, weight) : pickWeighted(rng, _cand, nGo, weight);
    roomVar[cell] = a;
    roomRole[cell] = prev < 0 ? ROLE_START : isEnd ? ROLE_END : ROLE_PATH;
    path[n++] = cell;
    if (isEnd) return n;
    // direction: down is favoured (weight 2), sides 1 each, only where a neighbour can connect
    const wR = canR && hasR[a] ? 1 : 0, wL = canL && hasL[a] ? 1 : 0, wD = canD && hasD[a] ? 2 : 0;
    let r = rng() * (wR + wL + wD);
    let dir;
    if ((r -= wR) < 0) dir = DIR_R;
    else if ((r -= wD) < 0) dir = DIR_D;
    else dir = DIR_L;
    prev = a; prevDir = dir;
    if (dir === DIR_R) cx++; else if (dir === DIR_L) cx--; else cy++;
  }
  return 0;
}

// ---------------------------------------------------------------- step 3: fill

function fillEmpty(rng, bank, roomVar) {
  const { V, kind, weight, connR, connD, connL, connU } = bank;
  for (let cell = 0; cell < NROOMS; cell++) {
    if (roomVar[cell] >= 0) continue;
    const cx = cell % ROOMS_X, cy = (cell / ROOMS_X) | 0;
    const nL = cx > 0 ? roomVar[cell - 1] : -1;
    const nR = cx < ROOMS_X - 1 ? roomVar[cell + 1] : -1;
    const nU = cy > 0 ? roomVar[cell - ROOMS_X] : -1;
    const nD = cy < ROOMS_Y - 1 ? roomVar[cell + ROOMS_X] : -1;
    let n = 0, nAny = 0;
    for (let a = 0; a < V; a++) {
      if (kind[a] !== KIND_NORMAL) continue;
      _cand2[nAny++] = a;
      // connects to at least one placed neighbour (fewer sealed rooms)
      if ((nL >= 0 && connR[nL * V + a]) || (nR >= 0 && connL[nR * V + a]) ||
          (nU >= 0 && connD[nU * V + a]) || (nD >= 0 && connU[nD * V + a])) _cand[n++] = a;
    }
    roomVar[cell] = n > 0 ? pickWeighted(rng, _cand, n, weight) : pickWeighted(rng, _cand2, nAny, weight);
  }
}

// ---------------------------------------------------------------- step 4: stamp

function stampRooms(rng, bank, roomVar, tiles) {
  const { cells } = bank;
  for (let cell = 0; cell < NROOMS; cell++) {
    const ox = BORDER + (cell % ROOMS_X) * ROOM_W;
    const oy = BORDER + ((cell / ROOMS_X) | 0) * ROOM_H;
    const src = roomVar[cell] * RC;
    for (let y = 0; y < ROOM_H; y++) {
      const drow = (oy + y) * LEVEL_W + ox;
      const srow = src + y * ROOM_W;
      for (let x = 0; x < ROOM_W; x++) {
        const c = cells[srow + x];
        tiles[drow + x] = c === CELL_ROCK ? 1 : c === CELL_QUANTUM ? (rng() < 0.5 ? 1 : 0) : 0;
      }
    }
  }
  // border: 2 tiles of indestructible rock on every side
  for (let y = 0; y < LEVEL_H; y++) {
    for (let x = 0; x < LEVEL_W; x++) if (isBedrock(x, y)) tiles[y * LEVEL_W + x] = 1;
  }
}

/** Rock to water only: interior tiles with 3+ open sides, then rock islands under 4 tiles. */
export function shaveNubsAndSmallIslands(tiles) {
  const W = LEVEL_W, H = LEVEL_H;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = BORDER; y < H - BORDER; y++) {
      for (let x = BORDER; x < W - BORDER; x++) {
        const i = y * W + x;
        if (tiles[i] === 0) continue;
        if (tiles[i - W] + tiles[i + W] + tiles[i - 1] + tiles[i + 1] <= 1) tiles[i] = 0;
      }
    }
  }
  const MIN_ISLAND = 4;
  _seen.fill(0);
  for (let y = BORDER; y < H - BORDER; y++) {
    for (let x = BORDER; x < W - BORDER; x++) {
      const i0 = y * W + x;
      if (_seen[i0] || tiles[i0] === 0) continue;
      let qh = 0, qt = 0, touches = false;
      _queue[qt++] = i0; _seen[i0] = 1;
      while (qh < qt) {
        const i = _queue[qh++];
        const cx = i % W, cy = (i / W) | 0;
        // a component touching the bedrock ring is part of the big wall
        if (cx === BORDER || cx === W - BORDER - 1 || cy === BORDER || cy === H - BORDER - 1) touches = true;
        let ni = i - W;
        if (!_seen[ni] && tiles[ni] !== 0 && !isBedrock(cx, cy - 1)) { _seen[ni] = 1; _queue[qt++] = ni; }
        ni = i + W;
        if (!_seen[ni] && tiles[ni] !== 0 && !isBedrock(cx, cy + 1)) { _seen[ni] = 1; _queue[qt++] = ni; }
        ni = i - 1;
        if (!_seen[ni] && tiles[ni] !== 0 && !isBedrock(cx - 1, cy)) { _seen[ni] = 1; _queue[qt++] = ni; }
        ni = i + 1;
        if (!_seen[ni] && tiles[ni] !== 0 && !isBedrock(cx + 1, cy)) { _seen[ni] = 1; _queue[qt++] = ni; }
      }
      if (!touches && qt < MIN_ISLAND) for (let k = 0; k < qt; k++) tiles[_queue[k]] = 0;
    }
  }
}

// ---------------------------------------------------------------- step 5: guarantee

/** Water cell belonging to some 2x2 all-water block (so the smoothed outline can't pinch it shut). */
function buildFat(tiles) {
  const W = LEVEL_W, H = LEVEL_H;
  _fat.fill(0);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      if (tiles[i] === 0 && tiles[i + 1] === 0 && tiles[i + W] === 0 && tiles[i + W + 1] === 0) {
        _fat[i] = 1; _fat[i + 1] = 1; _fat[i + W] = 1; _fat[i + W + 1] = 1;
      }
    }
  }
}

/** 4-neighbour BFS over fat water from (sx,sy) to (ex,ey). Needs no bombs. */
export function fatWaterSolvable(tiles, sx, sy, ex, ey) {
  buildFat(tiles);
  const W = LEVEL_W;
  const s = sy * W + sx, e = ey * W + ex;
  if (!_fat[s] || !_fat[e]) return false;
  _seen.fill(0);
  let qh = 0, qt = 0;
  _queue[qt++] = s; _seen[s] = 1;
  while (qh < qt) {
    const i = _queue[qh++];
    if (i === e) return true;
    const x = i % W;
    if (i >= W && _fat[i - W] && !_seen[i - W]) { _seen[i - W] = 1; _queue[qt++] = i - W; }
    if (_fat[i + W] && !_seen[i + W]) { _seen[i + W] = 1; _queue[qt++] = i + W; }
    if (x > 0 && _fat[i - 1] && !_seen[i - 1]) { _seen[i - 1] = 1; _queue[qt++] = i - 1; }
    if (x < W - 1 && _fat[i + 1] && !_seen[i + 1]) { _seen[i + 1] = 1; _queue[qt++] = i + 1; }
  }
  return false;
}

/** 3x3 water clearance around a marker (rock to water, bedrock untouched). */
function carveClearance(tiles, cx, cy) {
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) if (!isBedrock(x, y)) tiles[y * LEVEL_W + x] = 0;
  }
}

const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Last resort: a 2-wide corridor from start to exit (down first, then across). */
function carvePath(tiles, sx, sy, ex, ey) {
  const put = (x, y) => {
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const px = clampInt(x + dx, BORDER, LEVEL_W - BORDER - 1), py = clampInt(y + dy, BORDER, LEVEL_H - BORDER - 1);
      tiles[py * LEVEL_W + px] = 0;
    }
  };
  const x0 = clampInt(sx, BORDER, LEVEL_W - BORDER - 2), x1 = clampInt(ex, BORDER, LEVEL_W - BORDER - 2);
  const y0 = clampInt(sy, BORDER, LEVEL_H - BORDER - 2), y1 = clampInt(ey, BORDER, LEVEL_H - BORDER - 2);
  for (let y = y0; y <= y1; y++) put(x0, y);
  const step = x1 >= x0 ? 1 : -1;
  for (let x = x0; x !== x1 + step; x += step) put(x, y1);
}

// ---------------------------------------------------------------- generateLevel

/**
 * Pure function of (runSeed, levelIndex[, bank]). Returns a fresh level object:
 *   tiles      Uint8Array(34*68)  0 water, 1 rock
 *   roomVar    Uint16Array(12), roomRole Uint8Array(12)   per grid cell, row-major
 *   marks      Int16Array(3*16)   x, y, kind for every marker; nMarks used
 *   startX/startY/exitX/exitY     tile coords of the entry and exit portals
 *   attempts   how many plans were tried; fallback 1 if the carved corridor was needed
 *   nSpawns    0 (spawns arrive with the pattern engine)
 */
export function generateLevel(runSeed, levelIndex, bank = defaultBank) {
  if (!bank) throw new Error('generateLevel: no room bank (call setDefaultBank or pass one)');
  const base = hashSeed(runSeed >>> 0, levelIndex >>> 0);
  const tiles = new Uint8Array(LEVEL_W * LEVEL_H);
  const roomVar = new Uint16Array(NROOMS);
  const roomRole = new Uint8Array(NROOMS);
  const planRole = new Uint8Array(NROOMS);
  const plan = new Int16Array(NROOMS);
  const path = new Uint8Array(NROOMS);
  let sx = 0, sy = 0, ex = 0, ey = 0, attempts = 0, fallback = 0, ok = false, havePlan = false;
  const mx = bank.markerXY;
  const cellX = (cell) => BORDER + (cell % ROOMS_X) * ROOM_W;
  const cellY = (cell) => BORDER + ((cell / ROOMS_X) | 0) * ROOM_H;

  for (let att = 0; att < MAX_ATTEMPTS && !ok; att++) {
    attempts = att + 1;
    const rng = mulberry32(hashSeed(base, att));
    // 1. plan (cheap, so a few tries per attempt)
    let n = 0;
    for (let t = 0; t < 4 && n === 0; t++) {
      plan.fill(-1); planRole.fill(ROLE_FILLER);
      n = planPath(rng, bank, plan, planRole, path);
    }
    if (n === 0) continue;
    havePlan = true;
    // 3. fill, 4. stamp + shave
    fillEmpty(rng, bank, plan);
    for (let i = 0; i < NROOMS; i++) { roomVar[i] = plan[i]; roomRole[i] = planRole[i]; }
    stampRooms(rng, bank, roomVar, tiles);
    const sCell = path[0], eCell = path[n - 1];
    sx = cellX(sCell) + mx[roomVar[sCell] * 2]; sy = cellY(sCell) + mx[roomVar[sCell] * 2 + 1];
    ex = cellX(eCell) + mx[roomVar[eCell] * 2]; ey = cellY(eCell) + mx[roomVar[eCell] * 2 + 1];
    carveClearance(tiles, sx, sy);
    carveClearance(tiles, ex, ey);
    shaveNubsAndSmallIslands(tiles);
    // 5. guarantee: exit reachable from start through fat water, no bombs
    ok = fatWaterSolvable(tiles, sx, sy, ex, ey);
  }

  if (!ok) {
    fallback = 1;
    if (!havePlan) {
      // no plan formed at all: one marker room everywhere, start top-left, exit bottom-right
      let a = 0;
      for (let v = 0; v < bank.V; v++) if (bank.kind[v] === KIND_NORMAL && bank.marker[v] !== MK_NONE) { a = v; break; }
      roomRole.fill(ROLE_FILLER);
      for (let i = 0; i < NROOMS; i++) roomVar[i] = a;
      roomRole[0] = ROLE_START; roomRole[NROOMS - 1] = ROLE_END;
      stampRooms(mulberry32(base), bank, roomVar, tiles);
      sx = cellX(0) + mx[a * 2]; sy = cellY(0) + mx[a * 2 + 1];
      ex = cellX(NROOMS - 1) + mx[a * 2]; ey = cellY(NROOMS - 1) + mx[a * 2 + 1];
      carveClearance(tiles, sx, sy);
      carveClearance(tiles, ex, ey);
    }
    carvePath(tiles, sx, sy, ex, ey);
  }

  // marker list: every marker in the level; the start and end rooms' markers become S / E
  const marks = new Int16Array(3 * 16);
  let nMarks = 0;
  for (let cell = 0; cell < NROOMS && nMarks < 16; cell++) {
    const a = roomVar[cell];
    let k = bank.marker[a];
    if (k === MK_NONE) continue;
    if (roomRole[cell] === ROLE_START) k = MK_START;
    else if (roomRole[cell] === ROLE_END) k = MK_EXIT;
    marks[nMarks * 3] = cellX(cell) + mx[a * 2];
    marks[nMarks * 3 + 1] = cellY(cell) + mx[a * 2 + 1];
    marks[nMarks * 3 + 2] = k;
    nMarks++;
  }

  return { tiles, roomVar, roomRole, marks, nMarks, startX: sx, startY: sy, exitX: ex, exitY: ey, attempts, fallback, nSpawns: 0 };
}
