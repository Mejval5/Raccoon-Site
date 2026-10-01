// v2 spawn adapter (V2-PLAN M1-5, behind ?v2=1). Runs today's endless-mode
// spawn tagging (gen.js: plankton swarms, shells, enemy slots tagged by
// placement) over the whole 34x68 generated level instead of one 32x24
// chunk, and returns the same `spawns` list format enemies.js / pickups.js /
// decor.js already consume. Rules:
//   - only water tiles reachable from the start marker S get anything;
//   - nothing within START_SAFE_RADIUS (7) tiles of S;
//   - nothing in rock (shells sit on a floor tile in open water: the level
//     has no sealed soft-rock pockets, so the endless "shell behind soft
//     rock" trick does not apply);
//   - never in the 2-tile border.

import { mulberry32, hashSeed } from './rng.js';
import { LEVEL_W as W, LEVEL_H as H, BORDER, finalPathOk } from './level.js';
import { getPatternTable, matchPatterns, selectSpawns } from './patterns.js';
import { makeHazardRecord, hazardBlockers } from './hazards.js';
import { makeLootRecord, RELIC_CHANCE } from './loot.js';

export const START_SAFE_RADIUS = 7;
// Things that hurt from a distance stay out of reach of an idle octopus at the start: a cannon shot flies
// CANNON_RANGE (10) tiles and a manta drops from 8, so they keep 12 tiles from the start; hazards keep 10
// (the jet's stream is up to 7 long and an eel's ring 3).
export const RANGED_START_KEEP_OUT = 12;
export const HAZARD_START_KEEP_OUT = 10;
export const ENEMY_START_KEEP_OUT = 9; // every enemy (a piranha notices at 6 and starts 0.05 off its cell)
// A patroller walks its whole row (piranha, crab: wall to wall; manta: 5 tiles either side), so what counts is how
// near that stretch comes to the start: never inside its notice range (piranha 6, manta 8), plus a margin.
const PATROL_CLEAR = { piranha: 7.6, crab: 3, manta: 9 };
const PATROL_REACH = { piranha: 5, crab: 99, manta: 5 }; // piranha: enemies.js PIRANHA_PATROL_RANGE
// r35: how close a patrol stretch may come to the shop room and to the exit ring (a piranha that notices from 6 tiles,
// a manta that dives), and the least gap between two enemies' spawn cells
const PATROL_SHOP_CLEAR = { piranha: 6.5, crab: 3, manta: 6 };
const PATROL_EXIT_CLEAR = { piranha: 5, crab: 2, manta: 5 };
export const ENEMY_MIN_GAP = 2.5;

function idx(x, y) { return y * W + x; }

function floodReachable(tiles, sx, sy) {
  const reached = new Uint8Array(tiles.length);
  if (tiles[idx(sx, sy)] !== 0) return reached;
  const stack = [idx(sx, sy)];
  reached[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i / W) | 0;
    if (x + 1 < W && !reached[i + 1] && tiles[i + 1] === 0) { reached[i + 1] = 1; stack.push(i + 1); }
    if (x > 0 && !reached[i - 1] && tiles[i - 1] === 0) { reached[i - 1] = 1; stack.push(i - 1); }
    if (y + 1 < H && !reached[i + W] && tiles[i + W] === 0) { reached[i + W] = 1; stack.push(i + W); }
    if (y > 0 && !reached[i - W] && tiles[i - W] === 0) { reached[i - W] = 1; stack.push(i - W); }
  }
  return reached;
}

// Same tests gen.js uses, over the level grid (out of range = solid / not open).
function solidAt(t, x, y) { return x < 0 || x >= W || y < 0 || y >= H || t[idx(x, y)] !== 0; }
function isThinSurface(t, x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  let n = 0;
  if (y - 1 < 0 || t[idx(x, y - 1)] === 0) n++;
  if (y + 1 >= H || t[idx(x, y + 1)] === 0) n++;
  if (x - 1 < 0 || t[idx(x - 1, y)] === 0) n++;
  if (x + 1 >= W || t[idx(x + 1, y)] === 0) n++;
  return n >= 3;
}
function isCornerAnchor(t, ax, ay) {
  if (ax - 1 < 0 || ax + 1 >= W) return true;
  return t[idx(ax - 1, ay)] === 0 || t[idx(ax + 1, ay)] === 0;
}
function hasOpenClearance(t, x, y, r) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || t[idx(nx, ny)] !== 0) return false;
    }
  }
  return true;
}

/** Distance from (sx, sy) to the stretch of water cells a patroller on row `ty` can walk, `reach` tiles either side of `tx`. */
function patrolDistance(t, tx, ty, reach, sx, sy) {
  let xl = tx, xr = tx;
  while (tx - xl < reach && xl - 1 >= 0 && t[idx(xl - 1, ty)] === 0) xl--;
  while (xr - tx < reach && xr + 1 < W && t[idx(xr + 1, ty)] === 0) xr++;
  const nx = Math.max(xl, Math.min(xr + 1, sx));
  return Math.hypot(nx - sx, ty + 0.5 - sy);
}

/** Distance from the stretch of water cells a patroller on row `ty` can walk (`reach` tiles either side of `tx`) to the point (px, py). */
function stretchToPoint(t, tx, ty, reach, px, py) {
  let xl = tx, xr = tx;
  while (tx - xl < reach && xl - 1 >= 0 && t[idx(xl - 1, ty)] === 0) xl--;
  while (xr - tx < reach && xr + 1 < W && t[idx(xr + 1, ty)] === 0) xr++;
  return Math.hypot(Math.max(xl, Math.min(xr + 1, px)) - px, ty + 0.5 - py);
}
/** Distance from that stretch to the rectangle [x0, x1) x [y0, y1). */
function stretchToBox(t, tx, ty, reach, x0, y0, x1, y1) {
  let xl = tx, xr = tx;
  while (tx - xl < reach && xl - 1 >= 0 && t[idx(xl - 1, ty)] === 0) xl--;
  while (xr - tx < reach && xr + 1 < W && t[idx(xr + 1, ty)] === 0) xr++;
  const dx = Math.max(x0 - (xr + 1), xl - x1, 0), dy = Math.max(y0 - (ty + 1), ty - y1, 0);
  return Math.hypot(dx, dy);
}

/**
 * The `enemy-slot` record for an enemy pattern hit: placement from the facing (floor / ceiling / wall / open),
 * plus the flags gen.js tagged its slots with. Null when the surface is too thin to hold the enemy.
 */
function makeEnemySlot(t, kind, x, y, dx, dy) {
  let placement = 'open', wallDir = 0;
  if (dy < 0) placement = 'floor'; else if (dy > 0) placement = 'ceiling'; else if (dx !== 0) { placement = 'wall'; wallDir = -dx; }
  let flatRun = true;
  if (placement !== 'open') {
    const [ax, ay] = placement === 'floor' ? [x, y + 1] : placement === 'ceiling' ? [x, y - 1] : [x - dx, y];
    if (isThinSurface(t, ax, ay)) return null;
    flatRun = !isCornerAnchor(t, ax, ay);
  }
  const nearSideWall = (placement === 'floor' || placement === 'ceiling') && (solidAt(t, x - 1, y) || solidAt(t, x + 1, y));
  if (kind === 'cannon' && nearSideWall) return null; // a round body at a concave corner reads half buried
  if ((kind === 'crab' || kind === 'horns') && !flatRun) return null;
  let mantaFit = true;
  for (let yy = -2; yy <= 2 && mantaFit; yy++) for (let xx = -1; xx <= 1; xx++) if (solidAt(t, x + xx, y + yy)) { mantaFit = false; break; }
  const narrowShaft = solidAt(t, x - 1, y) && solidAt(t, x + 1, y);
  return { type: 'enemy-slot', kind, placement, x: x + 0.5, y: y + 0.5, flatRun, wallDir, nearSideWall, mantaFit, narrowShaft };
}

/**
 * @param {{tiles:Uint8Array, startX:number, startY:number}} level from generateLevel
 * @returns {{spawns: any[], openCells: number}}
 */
export function buildLevelSpawns(level, runSeed, levelIndex) {
  const t = level.tiles;
  const rng = mulberry32(hashSeed(hashSeed(runSeed >>> 0, levelIndex >>> 0), 0x5bd1e995));
  const reached = floodReachable(t, level.startX, level.startY);
  const safe = START_SAFE_RADIUS;
  const sx = level.startX + 0.5, sy = level.startY + 0.5;
  const farFromStart = (x, y) => Math.hypot(x + 0.5 - sx, y + 0.5 - sy) >= safe;

  // the shop room stays calm: no enemies, swarms or loose shells inside it or near it
  const shop = level.shop;
  const SHOP_CALM = 5; // tiles around the shop room where nothing spawns, so patrols do not drift in
  const inShop = (x, y) => !!shop && x >= shop.x0 - SHOP_CALM && x < shop.x1 + SHOP_CALM && y >= shop.y0 - SHOP_CALM && y < shop.y1 + SHOP_CALM;
  // nothing static sits inside the exit ring (about 2.7 tiles wide) or right against it
  const nearExit = (x, y) => level.exitX !== undefined && Math.abs(x - level.exitX) <= 3 && y >= level.exitY - 3 && y <= level.exitY + 1;
  const openCells = [];
  for (let y = BORDER; y < H - BORDER; y++) {
    for (let x = BORDER + 1; x < W - BORDER - 1; x++) {
      if (t[idx(x, y)] === 0 && reached[idx(x, y)] && farFromStart(x, y) && !inShop(x, y) && !nearExit(x, y)) openCells.push([x, y]);
    }
  }
  const spawns = [];
  // sealed rock pockets (level.js carvePockets) hold two shells in their right column; the vault quest
  // rests its cache on the floor of the left cell
  for (let i = 0; i < (level.nPockets || 0); i++) {
    const px = level.pockets[i * 3], py = level.pockets[i * 3 + 1];
    spawns.push({ type: 'shell', x: px + 1.5, y: py + 1.5 }, { type: 'shell', x: px + 1.5, y: py + 0.6 }); // right column: the vault chest takes the bottom-left
  }
  if (!openCells.length) return { spawns, openCells: 0 };
  const pick = (list) => list[Math.floor(rng() * list.length)];

  // Plankton swarms: pickups.js scatters each one within 1.6 tiles of its
  // centre (and skips spots inside chunk.exclude), so centres only need to
  // be open water.
  const swarmCount = 3 + Math.floor(rng() * 3); // about 3 chunks' worth of area
  for (let i = 0; i < swarmCount; i++) {
    const c = pick(openCells);
    spawns.push({ type: 'plankton-swarm', x: c[0] + 0.5, y: c[1] + 0.5, count: 5 + Math.floor(rng() * 8) });
  }

  // Shells: one per few rooms, on a floor tile in open water.
  const floorCells = openCells.filter(([x, y]) => t[idx(x, y + 1)] !== 0);
  const shellCount = floorCells.length ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < shellCount; i++) {
    const c = pick(floorCells);
    spawns.push({ type: 'shell', x: c[0] + 0.5, y: c[1] + 0.5 });
  }

  // Enemies and hazards: the pattern table (data/patterns.json, patterns.js) is matched once over the final
  // tiles; hits become spawns under each pattern's per-level chance and cap (the 1-1 / 1-2 / 1-3 ramp). Enemies
  // keep the `enemy-slot` record the rest of the game reads (now with the `kind` the pattern names); hazards are
  // `hazard` records (hazards.js). Blocking hazards are then checked with the A* pass and dropped, newest first,
  // until the exit (and the shop) stay reachable.
  const table = getPatternTable();
  if (table) {
    const hit = matchPatterns(table, t, W, H);
    const prng = mulberry32(hashSeed(hashSeed(runSeed >>> 0, levelIndex >>> 0), 0xa77e5));
    const ok = new Uint8Array(W * H);
    for (let i = 0; i < openCells.length; i++) ok[idx(openCells[i][0], openCells[i][1])] = 1;
    const occupied = [];
    for (const s of spawns) if (s.type === 'shell') occupied.push(s.x, s.y, 1.5);
    const lrng = mulberry32(hashSeed(hashSeed(runSeed >>> 0, levelIndex >>> 0), 0x100700));
    const relicOk = lrng() < RELIC_CHANCE; // a relic in 1 in 3 levels
    const build = (p, x, y, dx, dy) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      const kind = table.kind[p], name = table.spawn[p];
      const fromStart = Math.hypot(x - sx, y - sy);
      if (kind === 'loot') {
        if (name === 'pocket') {
          // the anchor is a rock tile inside the level border; the water it can be bombed from is 2 tiles towards dir
          if (tx < BORDER || ty < BORDER || tx >= W - BORDER || ty >= H - BORDER || t[idx(tx, ty)] === 0) return null;
          const wx = tx + dx * 2, wy = ty + dy * 2;
          if (wx < 0 || wy < 0 || wx >= W || wy >= H || !ok[idx(wx, wy)] || fromStart < safe || inShop(tx, ty)) return null;
          return makeLootRecord(name, x, y, dx, dy, lrng);
        }
        if (!ok[idx(tx, ty)]) return null;
        return makeLootRecord(name, x, y, dx, dy, lrng, relicOk);
      }
      if (!ok[idx(tx, ty)]) return null;
      if (kind === 'hazard') {
        if (fromStart < HAZARD_START_KEEP_OUT) return null;
        return makeHazardRecord(name, x, y, dx, dy, t, W, H);
      }
      if (fromStart < ((name === 'cannon' || name === 'manta') ? RANGED_START_KEEP_OUT : ENEMY_START_KEEP_OUT)) return null;
      if (PATROL_CLEAR[name] && patrolDistance(t, tx, ty, PATROL_REACH[name], sx, sy) < PATROL_CLEAR[name]) return null;
      if (PATROL_SHOP_CLEAR[name] && shop && stretchToBox(t, tx, ty, PATROL_REACH[name], shop.x0, shop.y0, shop.x1, shop.y1) < PATROL_SHOP_CLEAR[name]) return null;
      if (PATROL_EXIT_CLEAR[name] && level.exitX !== undefined && stretchToPoint(t, tx, ty, PATROL_REACH[name], level.exitX + 0.5, level.exitY + 0.5) < PATROL_EXIT_CLEAR[name]) return null;
      return makeEnemySlot(t, name, tx, ty, dx, dy);
    };
    const placed = selectSpawns(table, hit, levelIndex, prng, build, occupied);
    // A*: blocking hazards must leave the exit (and shop) reachable
    const collect = () => { const b = []; for (const r of placed) if (r.type === 'hazard') hazardBlockers(r, b); return b; };
    for (let guard = 0; guard < 64; guard++) {
      const bl = collect();
      if (!bl.length || finalPathOk(t, level.startX, level.startY, level.exitX, level.exitY, level.shop, bl)) break;
      let k = placed.length - 1;
      while (k >= 0 && !(placed[k].type === 'hazard' && hazardBlockers(placed[k]).length)) k--;
      if (k < 0) break;
      placed.splice(k, 1);
    }
    // no two enemies spawn on top of each other (or hug each other): drop the later one of a too-close pair
    const kept = [];
    for (const r of placed) {
      if (r.type === 'enemy-slot' && kept.some((k) => k.type === 'enemy-slot' && Math.hypot(k.x - r.x, k.y - r.y) < ENEMY_MIN_GAP)) continue;
      kept.push(r);
    }
    for (const r of kept) spawns.push(r);
  }
  return { spawns, openCells: openCells.length };
}
