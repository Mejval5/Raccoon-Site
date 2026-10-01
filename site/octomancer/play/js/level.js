// v2 level generator (V2-PLAN 2.3, M1-3): a pure function of (runSeed, levelIndex).
// Steps 1 (plan), 3 (fill), 4 (stamp) and 5 (guarantee); specials (step 2) and
// spawns (step 6) come in later milestones. Flat typed arrays only: no classes,
// no per-tile objects. Not wired into the running game yet (M1-4).
//
// Geometry: 3x4 rooms of 10x16 plus a 2-tile border = 34x68 tiles.
// Tile codes: 0 water, 1 rock. Bombs must call isBedrock(x, y) (never breakable).

import { mulberry32, hashSeed2 } from './rng.js';
import {
  ROOM_W, ROOM_H, RC, CELL_ROCK, CELL_QUANTUM, FLAG_H,
  MK_START, MK_EXIT, MK_NONE, KIND_NORMAL,
  TAG_START, TAG_EXIT, TAG_PATH, TAG_DROP, TAG_LAND, TAG_SHOP, PROP_KEEPER, PROP_PEDESTAL,
  ANCH_UP, ANCH_DOWN, ANCH_LEFT, ANCH_RIGHT,
} from './rooms.js';
import { createPathGrid, findPath, reachableNodes, reachedNear } from './pathcheck.js';

export const ROOMS_X = 3, ROOMS_Y = 4, BORDER = 2;
export const LEVEL_W = ROOMS_X * ROOM_W + 2 * BORDER; // 34
export const LEVEL_H = ROOMS_Y * ROOM_H + 2 * BORDER; // 68
export const NROOMS = ROOMS_X * ROOMS_Y;
export const MAX_ATTEMPTS = 10;
export const STOP_ROLL = 0.25;
export const MAX_ANCHORS = 128;
/** r37 set-piece room kinds (level.setPieces): the room ids 'b1-set-wreck' / '-garden' / '-gauntlet'. */
export const SET_WRECK = 1, SET_GARDEN = 2, SET_GAUNTLET = 3, SET_POOL = 4; // r39: 'b1-set-pool' is the Challenge Pool's room (pool.js)
const SET_KIND = { wreck: SET_WRECK, garden: SET_GARDEN, gauntlet: SET_GAUNTLET, pool: SET_POOL };
export const MAX_POCKETS = 2;
export const SHOP_CHANCE = 0.58; // chance a level asks for a shop room (about 1 in 2 get one once placement and the A* check are through)

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
  const { V, kind, marker, weight, connR, connD, connL, hasR, hasD, hasL, tags, tagged } = bank;
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
      } else if (tagged ? !(tags[a] & TAG_START) : marker[a] === MK_NONE) continue;
      if (tagged) {
        // Spelunky flow: a start room, then path/drop/landing rooms, then an exit room.
        // Going down needs a DROP (or the start room); arriving from above needs a LANDING or DROP.
        const tg = tags[a];
        const enteredDown = prevDir === DIR_D;
        if (tg & TAG_EXIT) { if (!(enteredDown || prevDir >= 0)) continue; _cand2[nEnd++] = a; continue; }
        if (prev >= 0 && !(tg & (TAG_PATH | TAG_DROP | TAG_LAND))) continue;
        if (enteredDown && !(tg & (TAG_LAND | TAG_DROP))) continue;
        const go = (canR && hasR[a]) || (canL && hasL[a]) || (canD && hasD[a] && (tg & (TAG_DROP | TAG_START)));
        if (go) _cand[nGo++] = a;
        continue;
      }
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
    const dropOk = !tagged || (tags[a] & (TAG_DROP | TAG_START));
    const wR = canR && hasR[a] ? 1 : 0, wL = canL && hasL[a] ? 1 : 0, wD = canD && hasD[a] && dropOk ? 2 : 0;
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
  const { V, kind, weight, connR, connD, connL, connU, tags, tagged } = bank;
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
      if (tagged && (tags[a] & (TAG_START | TAG_EXIT | TAG_SHOP))) continue; // markers only in the start and end rooms; shops are placed on purpose
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

// ---------------------------------------------------------------- shop, pockets, final check

/**
 * Turn one filler cell into a shop room: a 'shop'-tagged variant that shares an open seam with at least
 * one PATH neighbour (so the shop hangs off the main route, never on it). Uses its own rng so levels
 * without a shop keep exactly the tiles they had before. Returns the cell, or -1.
 */
function placeShop(srng, bank, roomVar, roomRole) {
  const { V, tags, connR, connL, connD, connU } = bank;
  const pairs = [];
  for (let cell = 0; cell < NROOMS; cell++) {
    if (roomRole[cell] !== ROLE_FILLER) continue;
    const cx = cell % ROOMS_X, cy = (cell / ROOMS_X) | 0;
    const pathAt = (c) => roomRole[c] !== ROLE_FILLER;
    const nL = cx > 0 && pathAt(cell - 1) ? roomVar[cell - 1] : -1;
    const nR = cx < ROOMS_X - 1 && pathAt(cell + 1) ? roomVar[cell + 1] : -1;
    const nU = cy > 0 && pathAt(cell - ROOMS_X) ? roomVar[cell - ROOMS_X] : -1;
    const nD = cy < ROOMS_Y - 1 && pathAt(cell + ROOMS_X) ? roomVar[cell + ROOMS_X] : -1;
    for (let a = 0; a < V; a++) {
      if (!(tags[a] & TAG_SHOP)) continue;
      if ((nL >= 0 && connR[nL * V + a]) || (nR >= 0 && connL[nR * V + a]) ||
          (nU >= 0 && connD[nU * V + a]) || (nD >= 0 && connU[nD * V + a])) pairs.push(cell, a);
    }
  }
  if (!pairs.length) return -1;
  const k = Math.floor(srng() * (pairs.length / 2)) * 2;
  roomVar[pairs[k]] = pairs[k + 1];
  return pairs[k];
}

/** Shop layout in level tile coords from the placed room's props: keeper, 3 pedestals (left to right), room rect. */
function readShop(bank, roomVar, cell) {
  const ox = BORDER + (cell % ROOMS_X) * ROOM_W, oy = BORDER + ((cell / ROOMS_X) | 0) * ROOM_H;
  const src = roomVar[cell] * RC;
  let kx = -1, ky = -1;
  const ped = [];
  for (let i = 0; i < RC; i++) {
    const p = bank.props[src + i];
    if (!p) continue;
    const x = ox + (i % ROOM_W), y = oy + ((i / ROOM_W) | 0);
    if (p === PROP_KEEPER) { kx = x; ky = y; } else if (p === PROP_PEDESTAL) ped.push([x, y]);
  }
  if (kx < 0 || ped.length < 3) return null;
  ped.sort((a, b) => a[0] - b[0]);
  const px = new Int16Array(6);
  for (let i = 0; i < 3; i++) { px[i * 2] = ped[i][0]; px[i * 2 + 1] = ped[i][1]; }
  return { cell, kx, ky, px, x0: ox, y0: oy, x1: ox + ROOM_W, y1: oy + ROOM_H };
}

/** 4-neighbour water flood from a tile (fresh array; used once per attempt). */
function floodWater(tiles, sx, sy) {
  const seen = new Uint8Array(LEVEL_W * LEVEL_H);
  const q = new Int32Array(LEVEL_W * LEVEL_H);
  let qh = 0, qt = 0;
  const s = sy * LEVEL_W + sx;
  if (tiles[s] !== 0) return seen;
  q[qt++] = s; seen[s] = 1;
  while (qh < qt) {
    const i = q[qh++], x = i % LEVEL_W;
    if (i >= LEVEL_W && !seen[i - LEVEL_W] && tiles[i - LEVEL_W] === 0) { seen[i - LEVEL_W] = 1; q[qt++] = i - LEVEL_W; }
    if (i + LEVEL_W < tiles.length && !seen[i + LEVEL_W] && tiles[i + LEVEL_W] === 0) { seen[i + LEVEL_W] = 1; q[qt++] = i + LEVEL_W; }
    if (x > 0 && !seen[i - 1] && tiles[i - 1] === 0) { seen[i - 1] = 1; q[qt++] = i - 1; }
    if (x < LEVEL_W - 1 && !seen[i + 1] && tiles[i + 1] === 0) { seen[i + 1] = 1; q[qt++] = i + 1; }
  }
  return seen;
}

/** Largest sealed water cavity (tiles) that fillSealedHoles turns back into rock. */
export const MAX_SEALED_HOLE = 3;

/**
 * r40: water components of MAX_SEALED_HOLE tiles or fewer that the start's water cannot reach are filled with rock.
 * They read as teal holes with a glowing rim in the wall (like the removed 'hole' sprite). The vault pockets
 * (carvePockets, 2x2) are kept. Rock only gets added, and only inside water the start cannot reach, so the
 * route, the shop and the pattern anchors (all reachable water) never change.
 */
export function fillSealedHoles(tiles, sx, sy, pockets, nPockets) {
  const W = LEVEL_W, H = LEVEL_H;
  const reached = floodWater(tiles, sx, sy);
  const seen = new Uint8Array(W * H);
  const comp = new Int32Array(MAX_SEALED_HOLE + 1);
  const stack = new Int32Array(W * H);
  let filled = 0;
  for (let i0 = 0; i0 < W * H; i0++) {
    if (tiles[i0] !== 0 || reached[i0] || seen[i0]) continue;
    let n = 0, sp = 0, keep = false;
    stack[sp++] = i0; seen[i0] = 1;
    while (sp > 0) {
      const i = stack[--sp], x = i % W, y = (i / W) | 0;
      if (n <= MAX_SEALED_HOLE) comp[n] = i;
      n++;
      for (let k = 0; k < (nPockets || 0); k++) if (x >= pockets[k * 3] && x < pockets[k * 3] + 2 && y >= pockets[k * 3 + 1] && y < pockets[k * 3 + 1] + 2) keep = true;
      if (y > 0 && !seen[i - W] && tiles[i - W] === 0) { seen[i - W] = 1; stack[sp++] = i - W; }
      if (y + 1 < H && !seen[i + W] && tiles[i + W] === 0) { seen[i + W] = 1; stack[sp++] = i + W; }
      if (x > 0 && !seen[i - 1] && tiles[i - 1] === 0) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x + 1 < W && !seen[i + 1] && tiles[i + 1] === 0) { seen[i + 1] = 1; stack[sp++] = i + 1; }
    }
    if (n <= MAX_SEALED_HOLE && !keep) { for (let k = 0; k < n; k++) tiles[comp[k]] = 1; filled += n; }
  }
  return filled;
}

function rockBlock(tiles, x, y) {
  for (let yy = y - 2; yy <= y + 3; yy++) for (let xx = x - 2; xx <= x + 3; xx++) if (tiles[yy * LEVEL_W + xx] === 0) return false;
  return true;
}

/**
 * Sealed 2x2 water pockets inside thick rock (a 6x6 block of rock around each: two tiles of it on every
 * side), each with a 2-wide reachable open spot three tiles from it on at least one side, so one bomb from
 * that spot cracks a channel in. They hold shells (level-spawns.js) and are the vault of the vault quest.
 * out: x, y (top-left of the 2x2) and the entrance side (ANCH_* code) per pocket. Returns the count.
 */
function carvePockets(tiles, reached, prng, out, shop) {
  const W = LEVEL_W;
  const cand = [];
  const R = (x, y) => reached[y * W + x] === 1;
  for (let y = BORDER + 2; y <= LEVEL_H - BORDER - 4; y++) {
    for (let x = BORDER + 2; x <= W - BORDER - 4; x++) {
      if (!rockBlock(tiles, x, y)) continue;
      // never beside the shop: bombing a vault must not open the stall's floor
      if (shop && x + 4 > shop.x0 - 3 && x - 3 < shop.x1 + 3 && y + 4 > shop.y0 - 3 && y - 3 < shop.y1 + 3) continue;
      let side = 0;
      if (x - 3 >= 0 && R(x - 3, y) && R(x - 3, y + 1)) side = ANCH_LEFT;
      else if (x + 4 < W && R(x + 4, y) && R(x + 4, y + 1)) side = ANCH_RIGHT;
      else if (y - 3 >= 0 && R(x, y - 3) && R(x + 1, y - 3)) side = ANCH_UP;
      else if (y + 4 < LEVEL_H && R(x, y + 4) && R(x + 1, y + 4)) side = ANCH_DOWN;
      if (side) cand.push(x, y, side);
    }
  }
  let n = 0;
  const want = 1 + (prng() < 0.45 ? 1 : 0);
  for (let tries = 0; tries < 12 && n < want && cand.length; tries++) {
    const k = Math.floor(prng() * (cand.length / 3)) * 3;
    const x = cand[k], y = cand[k + 1], side = cand[k + 2];
    cand.splice(k, 3);
    let near = false;
    for (let i = 0; i < n; i++) if (Math.abs(out[i * 3] - x) < 8 && Math.abs(out[i * 3 + 1] - y) < 8) near = true;
    if (near || !rockBlock(tiles, x, y)) continue;
    tiles[y * W + x] = tiles[y * W + x + 1] = tiles[(y + 1) * W + x] = tiles[(y + 1) * W + x + 1] = 0;
    out[n * 3] = x; out[n * 3 + 1] = y; out[n * 3 + 2] = side;
    n++;
  }
  return n;
}

/**
 * The A* check (pathcheck.js) on the FINAL tiles of a level: the exit trigger is reachable from the start
 * for a body of the octopus's real radius, and, when there is a shop, its keeper and every pedestal are
 * reachable too. `blockers` (hazards.js hazardBlockers) are circles the body must keep out of. Returns true when the level is fine.
 */
export function finalPathOk(tiles, sx, sy, ex, ey, shop, blockers) {
  const grid = createPathGrid(LEVEL_W, LEVEL_H, (x, y) => tiles[y * LEVEL_W + x] !== 0, blockers ? { blockers } : undefined);
  if (!findPath(grid, sx + 0.5, sy + 0.5, ex + 0.5, ey + 0.5)) return false;
  if (shop) {
    const reached = reachableNodes(grid, sx + 0.5, sy + 0.5);
    if (!reachedNear(grid, reached, shop.kx + 0.5, shop.ky + 0.5)) return false;
    for (let i = 0; i < 3; i++) if (!reachedNear(grid, reached, shop.px[i * 2] + 0.5, shop.px[i * 2 + 1] + 0.5)) return false;
  }
  return true;
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
 *   shop       null, or {cell, kx, ky, px:Int16Array(6), x0,y0,x1,y1}: keeper and 3 pedestals in tile coords
 *   pockets    Int16Array(3*2): x, y, entrance side per sealed 2x2 pocket; nPockets used
 */
export function generateLevel(runSeed, levelIndex, bank = defaultBank) {
  if (!bank) throw new Error('generateLevel: no room bank (call setDefaultBank or pass one)');
  const base = hashSeed2(runSeed >>> 0, levelIndex >>> 0);
  const tiles = new Uint8Array(LEVEL_W * LEVEL_H);
  const roomVar = new Uint16Array(NROOMS);
  const roomRole = new Uint8Array(NROOMS);
  const planRole = new Uint8Array(NROOMS);
  const plan = new Int16Array(NROOMS);
  const path = new Uint8Array(NROOMS);
  let sx = 0, sy = 0, ex = 0, ey = 0, attempts = 0, fallback = 0, ok = false, havePlan = false;
  const pockets = new Int16Array(3 * MAX_POCKETS);
  let nPockets = 0, shop = null;
  // a shop in about half the levels of a tagged bank (decided per level, dropped again after 5 failed attempts)
  const wantShop = !!(bank.tagged && bank.tags.some((t) => t & TAG_SHOP)) && mulberry32(hashSeed2(base, 0x5409))() < SHOP_CHANCE;
  const mx = bank.markerXY;
  const cellX = (cell) => BORDER + (cell % ROOMS_X) * ROOM_W;
  const cellY = (cell) => BORDER + ((cell / ROOMS_X) | 0) * ROOM_H;

  for (let att = 0; att < MAX_ATTEMPTS && !ok; att++) {
    attempts = att + 1;
    const rng = mulberry32(hashSeed2(base, att));
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
    shop = null; nPockets = 0;
    let shopCell = -1;
    if (wantShop && att < 5) shopCell = placeShop(mulberry32(hashSeed2(base, 0x5408 + att)), bank, roomVar, roomRole);
    stampRooms(rng, bank, roomVar, tiles);
    const sCell = path[0], eCell = path[n - 1];
    sx = cellX(sCell) + mx[roomVar[sCell] * 2]; sy = cellY(sCell) + mx[roomVar[sCell] * 2 + 1];
    ex = cellX(eCell) + mx[roomVar[eCell] * 2]; ey = cellY(eCell) + mx[roomVar[eCell] * 2 + 1];
    carveClearance(tiles, sx, sy);
    carveClearance(tiles, ex, ey);
    shaveNubsAndSmallIslands(tiles);
    if (shopCell >= 0) shop = readShop(bank, roomVar, shopCell);
    if (bank.tagged) nPockets = carvePockets(tiles, floodWater(tiles, sx, sy), mulberry32(hashSeed2(base, 0x70c4 + att)), pockets, shop);
    // 5. guarantee: exit reachable from start through fat water, no bombs; then the A* check (real octopus
    // radius) on the final tiles, plus the shop's keeper and pedestals when there is a shop
    ok = fatWaterSolvable(tiles, sx, sy, ex, ey) && (shopCell < 0 || shop !== null) && finalPathOk(tiles, sx, sy, ex, ey, shop);
  }

  // The biome bank could not produce a solvable level: use the Octomancer PNG bank instead.
  if (!ok && bank.fallbackBank) {
    const lv = generateLevel(runSeed, levelIndex, bank.fallbackBank);
    lv.bankFallback = 1;
    return lv;
  }

  if (!ok) {
    fallback = 1;
    shop = null; nPockets = 0;
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

  // r40: no 1-3 tile water cavities sealed inside the rock (the final tiles are set by now)
  if (!fallback || havePlan) fillSealedHoles(tiles, sx, sy, pockets, nPockets);

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

  // pattern anchors ('^' 'v' '<' '>' in the room ASCII), kept only where the rock they
  // point at is still there after quantum rolls and shaving
  const anchors = new Int16Array(3 * MAX_ANCHORS);
  let nAnchors = 0;
  if (bank.anchors) {
    for (let cell = 0; cell < NROOMS && nAnchors < MAX_ANCHORS; cell++) {
      const src = roomVar[cell] * RC, ox = cellX(cell), oy = cellY(cell);
      for (let i = 0; i < RC && nAnchors < MAX_ANCHORS; i++) {
        const code = bank.anchors[src + i];
        if (!code) continue;
        const ax = ox + (i % ROOM_W), ay = oy + ((i / ROOM_W) | 0);
        if (tiles[ay * LEVEL_W + ax] !== 0) continue;
        const dx = code === ANCH_LEFT ? -1 : code === ANCH_RIGHT ? 1 : 0;
        const dy = code === ANCH_UP ? -1 : code === ANCH_DOWN ? 1 : 0;
        if (tiles[(ay + dy) * LEVEL_W + ax + dx] === 0) continue;
        anchors[nAnchors * 3] = ax; anchors[nAnchors * 3 + 1] = ay; anchors[nAnchors * 3 + 2] = code;
        nAnchors++;
      }
    }
  }

  // r37: set-piece rooms ('b1-set-wreck' / '-garden' / '-gauntlet' in the biome bank): where they ended up, so the spawn
  // pass can force their content (level-spawns.js). x, y = the room's top-left tile, kind = SET_*, flip bit 0 = mirrored.
  const setPieces = new Int16Array(4 * 6);
  let nSetPieces = 0;
  if (!fallback && bank.ids) {
    for (let cell = 0; cell < NROOMS && nSetPieces < 6; cell++) {
      const id = bank.ids[roomVar[cell]];
      const kind = typeof id === 'string' && id.startsWith('b1-set-') ? SET_KIND[id.slice(7)] : 0;
      if (!kind) continue;
      setPieces[nSetPieces * 4] = cellX(cell); setPieces[nSetPieces * 4 + 1] = cellY(cell);
      setPieces[nSetPieces * 4 + 2] = kind; setPieces[nSetPieces * 4 + 3] = bank.flags[roomVar[cell]] & FLAG_H ? 1 : 0;
      nSetPieces++;
    }
  }

  const inSetPiece = (x, y) => {
    for (let i = 0; i < nSetPieces; i++) if (x >= setPieces[i * 4] - 1 && x <= setPieces[i * 4] + ROOM_W && y >= setPieces[i * 4 + 1] && y < setPieces[i * 4 + 1] + ROOM_H) return true;
    return false;
  };
  // the exit ring lies on the floor: drop the exit cell down the open water column to the first solid tile
  const ey0 = ey;
  while (ey + 1 < LEVEL_H - BORDER && tiles[(ey + 1) * LEVEL_W + ex] === 0) ey++;
  // the ring is ~2.7 tiles wide: slide the exit along its floor run so ex-1..ex+1 all have floor under them (and water beside)
  const ex0 = ex;
  {
    const T = (x, y) => tiles[y * LEVEL_W + x];
    const supported = (x) => x - 1 >= BORDER && x + 1 < LEVEL_W - BORDER &&
      T(x - 1, ey) === 0 && T(x, ey) === 0 && T(x + 1, ey) === 0 &&
      T(x - 1, ey + 1) !== 0 && T(x, ey + 1) !== 0 && T(x + 1, ey + 1) !== 0;
    if (!supported(ex)) {
      // nearest flat 3-tile floor run within a few tiles (same row first, then other heights), still solvable
      const ey1 = ey;
      const cands = [];
      for (let y = ey1 - 10; y <= ey1 + 10; y++) {
        if (y < BORDER + 3 * 16 || y + 1 >= LEVEL_H - BORDER) continue;
        for (let x = Math.max(BORDER + 1, ex0 - 16); x <= Math.min(LEVEL_W - BORDER - 2, ex0 + 16); x++) {
          ey = y;
          if (!supported(x)) continue;
          if (shop && x + 2 > shop.x0 && x - 1 < shop.x1 && y + 2 > shop.y0 && y - 1 < shop.y1) continue;
          if (inSetPiece(x, y)) continue; // r37: the exit ring never slides into a set-piece room (its long flat floor attracts it)
          cands.push([Math.abs(x - ex0) + Math.abs(y - ey1) * 1.5, x, y]);
        }
      }
      cands.sort((p, q) => p[0] - q[0]);
      let best = null;
      for (let k = 0; k < cands.length && k < 6 && !best; k++) {
        const [, x, y] = cands[k];
        if (fatWaterSolvable(tiles, sx, sy, x, y) && finalPathOk(tiles, sx, sy, x, y, shop)) best = [x, y];
      }
      ey = ey1;
      if (best) { ex = best[0]; ey = best[1]; }
    }
  }
  if (ey !== ey0 || ex !== ex0) for (let i = 0; i < nMarks; i++) if (marks[i * 3 + 2] === MK_EXIT && marks[i * 3] === ex0 && marks[i * 3 + 1] === ey0) { marks[i * 3] = ex; marks[i * 3 + 1] = ey; }

  return {
    w: LEVEL_W, h: LEVEL_H, tiles, roomVar, roomRole, marks, nMarks, anchors, nAnchors,
    startX: sx, startY: sy, exitX: ex, exitY: ey, attempts, fallback, bankFallback: 0, nSpawns: 0,
    shop, pockets, nPockets, setPieces, nSetPieces,
  };
}
