// Back rooms (Spelunky 2's back layer; octomancer-web/BACKROOMS.md version A, CONTROLS-IDEAS.md section 5): a kelp curtain
// over a dark niche on a floor of the level. F (the hand's 'backdoor' interact) takes the octopus through it into a small
// grotto drawn OVER the level, which stays frozen and dimmed behind it; F at the curtain inside brings her back to the same
// spot. One grotto in about half of the generated levels, never in the hub, the tutorial or the rest grotto.
//
// Where the grotto lives: an annex of the same tile grid, below the level's bottom bedrock behind a SEAM of bedrock (so physics,
// bombs, props, loot and creatures need nothing new, BACKROOMS.md 4.1), shown as an overlay (main.js: the camera is clamped
// to the grotto's box and the frozen front is drawn round it). The annex rows are bedrock except for the box, so they cost
// nothing to simulate; the grotto's things (loot, the giant clam, an eel, a piranha, loose shells) are only spawned on the
// first entry (main.js), so a level whose grotto is never entered runs exactly as one without.
//
// Pure functions of (level, its spawns, runSeed, levelIndex): gen-worker.js adds the annex before the quest planner's path
// data is made (so its tile checksum matches), world-v2.js does it for a level built on the main thread. A seed's front
// layout and its spawns are unchanged by it (its own hashSeed2 stream, run after buildLevelSpawns).

import { mulberry32, hashSeed2 } from './rng.js';
import { MAT_ROCK, MAT_BEDROCK, MAT_TIMBER, MAT_BONE } from './materials.js';
import { tileGrid, reachableNodes, reachedNear, findPath } from './pathcheck.js';
import { makeCreatureRecord } from './creatures.js';
import { makeHazardRecord } from './hazards.js';
import { LK_POT, LK_CHEST } from './loot.js';
import { ITEM_IDS } from './items.js';
import { SK_COWRIE, SK_CONCH, SK_NAUTILUS } from './shells.js';

export const BACK_CHANCE = 0.5;   // a generated level gets a grotto this often (when a door spot fits)
export const BACK_SEAM = 8;        // bedrock rows between the level's bottom and the grotto (no blast, shock or sight crosses it)
export const BACK_BOTTOM = 2;      // bedrock rows under the grotto
export const BOX_W = 16, BOX_H = 10; // the grotto's box in tiles (its rock walls included): smaller than a desktop view (20 x 12.5)
export const DOOR_REACH = 1.25;    // tiles from the curtain's middle within which F goes through
export const DOOR_START_CLEAR = 6, DOOR_EXIT_CLEAR = 5, DOOR_ROUTE_MAX = 4, DOOR_SPAWN_CLEAR = 2.5;

// The grottos (16 x 10; the spring sits in a basin two tiles deep, like the rest grotto's). '#' rock, 'X' bedrock, '=' timber, 'B' fish bone, '.' water,
// 'D' the curtain back out (on the floor), 'S' a spring (heals one heart, else fills one cast), 'G' a giant clam with its pearl,
// 'C' a barnacle clam (the chest) with shells and often an item, 'p' a pot, 's' a loose shell, 'e' an eel's patrol,
// 'f' a piranha. Every marker is reachable from 'D' (backroom.test.js).
export const BACK_ROOMS = [
  { id: 'spring', name: 'quiet', rows: [
    '################',
    '#####....#######',
    '###..........###',
    '##............##',
    '#..s.......s...#',
    '#.....###......#',
    '#.D..p.........#',
    '########..S..###',
    '########.....###',
    '################',
  ] },
  { id: 'pearl', name: 'the pearl', rows: [
    '################',
    '###.....########',
    '##..........####',
    '#.............##',
    '#..##..........#',
    '#..............#',
    '#........s.....#',
    '#.D....G.....C.#',
    '################',
    '################',
  ] },
  { id: 'den', name: 'the eel den', rows: [
    '################',
    '##...######...##',
    '#.............##',
    '#...........f..#',
    '#.....BBB..e...#',
    '#......B.......#',
    '#..............#',
    '#.D..p.......C.#',
    '################',
    '################',
  ] },
];
const MAT_OF = { '#': MAT_ROCK, X: MAT_BEDROCK, '=': MAT_TIMBER, B: MAT_BONE };

/**
 * Where the curtain goes on the front layer: a floor tile with water above it and a flat floor three wide, that the start can
 * swim to and that lies within DOOR_ROUTE_MAX tiles of the start -> exit route (never off the solvable path), clear of the start,
 * the exit, the shop, the set pieces, the sealed pockets and every spawn that is not a shell. Null when nothing fits.
 * @param {any} level a generated level (level.js) before the annex
 * @param {any[]} spawns its spawn list (level-spawns.js)
 */
export function pickDoor(level, spawns, rng) {
  const W = level.w, H = level.h, t = level.tiles;
  const T = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? MAT_BEDROCK : t[y * W + x]);
  const grid = tileGrid(t, W, H, null);
  const sx = level.startX + 0.5, sy = level.startY + 0.5, ex = level.exitX + 0.5, ey = level.exitY + 0.5;
  const reached = reachableNodes(grid, sx, sy);
  const route = findPath(grid, sx, sy, ex, ey);
  if (!route) return null;
  const pts = route.points;
  const routeDist = (x, y) => { let b = 1e9; for (let i = 0; i < pts.length; i += 2) { const d = Math.hypot(pts[i] - x, pts[i + 1] - y); if (d < b) b = d; } return b; };
  const shop = level.shop;
  const sp = level.setPieces, nsp = level.nSetPieces | 0;
  const near = [];
  for (const s of spawns || []) if (s.type !== 'shell' && !(s.type === 'decor' && s.dk !== 'boulder' && s.dk !== 'wreck')) near.push(s.x, s.y);
  const stone = (m) => m === MAT_ROCK || m === MAT_BEDROCK;
  const cands = [];
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    if (T(x, y) !== 0 || T(x, y - 1) !== 0 || T(x - 1, y) !== 0 && T(x + 1, y) !== 0) continue;
    if (!stone(T(x - 1, y + 1)) || !stone(T(x, y + 1)) || !stone(T(x + 1, y + 1))) continue; // a flat floor of rock under the curtain (not a plank or bone)
    const cx = x + 0.5, cy = y + 0.5;
    if (Math.hypot(cx - sx, cy - sy) < DOOR_START_CLEAR || Math.hypot(cx - ex, cy - ey) < DOOR_EXIT_CLEAR) continue;
    if (shop && x >= shop.x0 - 2 && x < shop.x1 + 2 && y >= shop.y0 - 2 && y < shop.y1 + 2) continue;
    let bad = false;
    for (let i = 0; i < nsp && !bad; i++) if (x >= sp[i * 4] - 1 && x <= sp[i * 4] + 10 && y >= sp[i * 4 + 1] - 1 && y <= sp[i * 4 + 1] + 16) bad = true;
    for (let i = 0; i < (level.nPockets | 0) && !bad; i++) if (Math.abs(level.pockets[i * 3] - x) < 4 && Math.abs(level.pockets[i * 3 + 1] - y) < 4) bad = true;
    for (let i = 0; i < near.length && !bad; i += 2) if (Math.hypot(near[i] - cx, near[i + 1] - cy) < DOOR_SPAWN_CLEAR) bad = true;
    if (bad) continue;
    if (!reachedNear(grid, reached, cx, cy - 0.2, 0.75)) continue;
    const rd = routeDist(cx, cy);
    if (rd > DOOR_ROUTE_MAX) continue;
    const niche = T(x - 1, y) !== 0 || T(x + 1, y) !== 0 ? 0 : 1.5; // a curtain against a wall reads as a way in
    cands.push([rd * 0.5 + niche + rng() * 2.5, x, y]);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a[0] - b[0]);
  return { x: cands[0][1], y: cands[0][2] };
}

/**
 * Roll and add this level's back room (in place). Sets `level.back` (null: none) and `level.backTried`; when there is one,
 * `level.tiles` / `level.h` grow by the annex (the front rows stay as they were), and the curtains' and the spring's
 * surroundings join `level.keepOut` (no plants over them).
 * level.back = { kind, name, doorX, doorY (front curtain tile), retX, retY (the curtain inside), x0, y0, x1, y1 (the box,
 * tiles [x0, x1) x [y0, y1)), cutY (where the overlay's window ends: a little of the floor under the lowest water), frontH (the front's height: the camera's region there), spring: {x, y} | null, spawns: [...] }
 */
export function addBackRoom(level, spawns, runSeed, levelIndex, chance = BACK_CHANCE) {
  if (!level || !level.tiles) return null;
  if (level.backTried) return level.back || null;
  level.backTried = true; level.back = null;
  if (level.fallback) return null;
  const rng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0xbac4));
  if (rng() >= chance) return null;
  const room = BACK_ROOMS[Math.floor(rng() * BACK_ROOMS.length)];
  const door = pickDoor(level, spawns, rng);
  if (!door) return null;
  return attachBackRoom(level, room, door, rng);
}

/** Grow the level by the annex holding `room` (one of BACK_ROOMS) and wire the curtain at `door` to it. Returns level.back. */
export function attachBackRoom(level, room, door, rng = mulberry32(1)) {
  const W = level.w, H0 = level.h, H = H0 + BACK_SEAM + BOX_H + BACK_BOTTOM;
  const tiles = new Uint8Array(W * H);
  tiles.set(level.tiles.subarray(0, W * H0));
  tiles.fill(MAT_BEDROCK, W * H0);
  const x0 = Math.floor((W - BOX_W) / 2), y0 = H0 + BACK_SEAM;
  const spawns = [];
  let retX = -1, retY = -1, spring = null;
  for (let ry = 0; ry < BOX_H; ry++) {
    const row = room.rows[ry];
    for (let rx = 0; rx < BOX_W; rx++) {
      const c = row[rx];
      tiles[(y0 + ry) * W + x0 + rx] = MAT_OF[c] !== undefined ? MAT_OF[c] : 0;
    }
  }
  // markers after the tiles, so the record builders see the finished room
  for (let ry = 0; ry < BOX_H; ry++) {
    const row = room.rows[ry];
    for (let rx = 0; rx < BOX_W; rx++) {
      const c = row[rx], tx = x0 + rx, ty = y0 + ry, cx = tx + 0.5, cy = ty + 0.5;
      if (c === 'D') { retX = tx; retY = ty; }
      else if (c === 'S') spring = { x: cx, y: cy + 0.02 };
      else if (c === 'G') { const r = makeCreatureRecord('gclam', cx, cy, 0, -1, tiles, W, H); if (r) spawns.push(r); }
      else if (c === 'e') { const r = makeHazardRecord('eel', cx, cy, 0, 0, tiles, W, H); if (r) spawns.push(r); }
      else if (c === 'f') spawns.push({ type: 'enemy-slot', kind: 'piranha', placement: 'open', x: cx, y: cy });
      else if (c === 'p') spawns.push({ type: 'loot', lk: LK_POT, x: cx, y: cy, dx: 0, dy: -1, n: 1 + Math.floor(rng() * 3), aux: 0, item: 0 });
      else if (c === 'C') spawns.push({ type: 'loot', lk: LK_CHEST, x: cx, y: cy, dx: 0, dy: -1, n: 4 + Math.floor(rng() * 3), aux: 0, item: rng() < 0.6 ? 1 + Math.floor(rng() * ITEM_IDS.length) : 0 });
      else if (c === 's') { const r = rng(); spawns.push({ type: 'shell', x: cx, y: cy, sk: r < 0.2 ? SK_NAUTILUS : r < 0.55 ? SK_CONCH : SK_COWRIE }); }
    }
  }
  let lowWater = y0;
  for (let ry = 0; ry < BOX_H; ry++) for (let rx = 0; rx < BOX_W; rx++) if (tiles[(y0 + ry) * W + x0 + rx] === 0) lowWater = y0 + ry;
  level.tiles = tiles; level.h = H;
  const keep = level.keepOut || (level.keepOut = []);
  keep.push({ x0: door.x - 1, x1: door.x + 2, y0: door.y - 2, y1: door.y + 1 }, { x0: retX - 1, x1: retX + 2, y0: retY - 2, y1: retY + 1 });
  if (spring) keep.push({ x0: Math.floor(spring.x) - 3, x1: Math.floor(spring.x) + 4, y0: Math.floor(spring.y) - 1, y1: Math.floor(spring.y) + 2 });
  level.back = {
    kind: room.id, name: room.name, doorX: door.x, doorY: door.y, retX, retY,
    x0, y0, x1: x0 + BOX_W, y1: y0 + BOX_H, cutY: Math.min(y0 + BOX_H - 0.35, lowWater + 1.65), frontH: H0, spring, spawns,
  };
  return level.back;
}

/** Whether world point (x, y) is inside the back room's box. */
export function inBackBox(back, x, y) { return !!back && x >= back.x0 && x < back.x1 && y >= back.y0 && y < back.y1; }

/** The point F aims at for a curtain on tile (tx, ty): its middle, a little above the floor tile's centre. */
export function curtainPoint(tx, ty, out = { x: 0, y: 0 }) { out.x = tx + 0.5; out.y = ty + 0.05; return out; }

/** The camera's region for where the octopus is: the back room's box inside, else the front (its rows above the seam). */
export function cameraRegion(back, inside, W, out = { x0: 0, y0: 0, x1: 0, y1: 0 }) {
  if (inside) { out.x0 = back.x0; out.y0 = back.y0; out.x1 = back.x1; out.y1 = back.y1; }
  else { out.x0 = 0; out.y0 = 0; out.x1 = W; out.y1 = back.frontH; }
  return out;
}
