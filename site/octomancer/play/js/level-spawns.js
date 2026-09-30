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
import { LEVEL_W as W, LEVEL_H as H, BORDER } from './level.js';

export const START_SAFE_RADIUS = 7;

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
  const openCells = [];
  for (let y = BORDER; y < H - BORDER; y++) {
    for (let x = BORDER + 1; x < W - BORDER - 1; x++) {
      if (t[idx(x, y)] === 0 && reached[idx(x, y)] && farFromStart(x, y) && !inShop(x, y)) openCells.push([x, y]);
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

  // Enemy slots, tagged by placement exactly as gen.js does.
  const depthBonus = Math.min(3, Math.floor((levelIndex >>> 0) / 4));
  const slotCount = 16 + depthBonus * 3 + Math.floor(rng() * 8);
  const MIN_ENEMY_SEP = 1.6;
  const placed = [];
  for (let i = 0; i < slotCount; i++) {
    const [x, y] = pick(openCells);
    if (placed.some((p) => Math.hypot(x - p.x, y - p.y) < MIN_ENEMY_SEP)) continue;
    let placement = 'open';
    if (solidAt(t, x, y + 1)) placement = 'floor';
    else if (solidAt(t, x, y - 1)) placement = 'ceiling';
    else if (solidAt(t, x - 1, y) || solidAt(t, x + 1, y)) placement = 'wall';
    let flatRun = true, wallDir = 0;
    if (placement !== 'open') {
      const wallOnRight = solidAt(t, x + 1, y);
      const [ax, ay] = placement === 'floor' ? [x, y + 1] : placement === 'ceiling' ? [x, y - 1]
        : (wallOnRight ? [x + 1, y] : [x - 1, y]);
      if (placement === 'wall') wallDir = wallOnRight ? 1 : -1;
      if (isThinSurface(t, ax, ay)) placement = 'open';
      else flatRun = !isCornerAnchor(t, ax, ay);
    }
    if (placement === 'open' && !hasOpenClearance(t, x, y, 1)) continue;
    const nearSideWall = (placement === 'floor' || placement === 'ceiling')
      && (solidAt(t, x - 1, y) || solidAt(t, x + 1, y));
    let mantaFit = true;
    for (let dy = -2; dy <= 2 && mantaFit; dy++) for (let dx = -1; dx <= 1; dx++) if (solidAt(t, x + dx, y + dy)) { mantaFit = false; break; }
    const narrowShaft = solidAt(t, x - 1, y) && solidAt(t, x + 1, y);
    spawns.push({ type: 'enemy-slot', placement, x: x + 0.5, y: y + 0.5, flatRun, wallDir, nearSideWall, mantaFit, narrowShaft });
    placed.push({ x, y });
  }
  return { spawns, openCells: openCells.length };
}
