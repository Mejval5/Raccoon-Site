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

import { mulberry32, hashSeed2 } from './rng.js';
import { LEVEL_W as W, LEVEL_H as H, BORDER, finalPathOk, SET_WRECK, SET_GARDEN, SET_GAUNTLET, SET_POOL } from './level.js';
import { getPatternTable, matchPatterns, selectSpawns } from './patterns.js';
import { makeHazardRecord, hazardBlockers } from './hazards.js';
import { makeLootRecord, RELIC_CHANCE, LK_POCKET } from './loot.js';
import { ANCH_UP, ANCH_DOWN, ANCH_LEFT, ANCH_RIGHT, ROOM_W, ROOM_H } from './rooms.js';

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
export const SET_START_KEEP_OUT = 7.5; // r37: set-piece jets and urchins (static: they only matter when swum into) keep this far from the start
export const ENEMY_MIN_GAP = 2.5;
export const DECOR_GAP = 1.4; // r36: tiles decor keeps from any other spawn
export const POCKET_KEEP_OUT = 3; // r36: tiles around a hidden pocket's entrance with no enemy
export const PATROL_MIN_TRAVEL = 1.5; // r36: least centre travel a piranha or crab's free stretch must leave it (a manta also swings up and down: 1)
// half extents of the hulls enemies.js separates (kept in step with ENEMY_SEP_EXTENT there)
// wx = how close to rock it turns round (its probe: enemies.js blockedAhead / mantaFits)
const PATROL_HULL = { piranha: { hx: 0.9, hy: 0.55, wx: 1.4, min: 1.5 }, crab: { hx: 0.45, hy: 0.45, wx: 0.55, min: 1.5 }, manta: { hx: 1.4, hy: 0.4, wx: 1.65, min: 1 } };
const STATIC_HULL = { urchin: { hx: 0.5, hy: 0.5 }, horns: { hx: 0.275, hy: 0.275 }, cannon: { hx: 0.275, hy: 0.275 } };
const STATIC_KINDS = { urchin: 1, horns: 1, cannon: 1 };

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
  const rng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0x5bd1e995));
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
    const prng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0xa77e5));
    const ok = new Uint8Array(W * H);
    for (let i = 0; i < openCells.length; i++) ok[idx(openCells[i][0], openCells[i][1])] = 1;
    const occupied = [];
    for (const s of spawns) if (s.type === 'shell') occupied.push(s.x, s.y, 1.5);
    const lrng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0x100700));
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
    // r37: the set-piece rooms force their content (a gauntlet always has its jets, a garden its urchins, a wreck its
    // hull, chest and pots); everything else the table places keeps its distance from it
    const forced = [];
    const gardens = [];
    const pools = [];
    for (let i = 0; i < (level.nSetPieces || 0); i++) {
      const x0 = level.setPieces[i * 4], y0 = level.setPieces[i * 4 + 1], kind = level.setPieces[i * 4 + 2], flip = level.setPieces[i * 4 + 3];
      const usable = (tx, ty) => tx > x0 && tx < x0 + ROOM_W - 1 && ty >= y0 && ty < y0 + ROOM_H && ok[idx(tx, ty)] && !inShop(tx, ty) && !nearExit(tx, ty);
      // jets and the wreck only need reachable water that is not the shop room itself or the exit ring (enemies keep the full shop calm)
      const usableH = (tx, ty) => tx > x0 && tx < x0 + ROOM_W - 1 && ty >= y0 && ty < y0 + ROOM_H && reached[idx(tx, ty)] && !nearExit(tx, ty) && !(shop && tx >= shop.x0 - 1 && tx <= shop.x1 && ty >= shop.y0 - 1 && ty <= shop.y1);
      const open = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && t[idx(tx, ty)] === 0;
      const clearOfStart = (tx, ty, keep) => Math.hypot(tx + 0.5 - sx, ty + 0.5 - sy) >= keep;
      if (kind === SET_GAUNTLET) {
        // alternating floor / ceiling jets across the tube: floor at 2, ceiling at 5, floor at 8 (mirrored with the room)
        const lanes = [[2, 0], [5, 1], [8, 0]];
        for (const [lx, ceil] of lanes) {
          const cx = flip ? ROOM_W - 1 - lx : lx;
          let rec = null;
          for (const off of [0, 1, -1]) {
            const tx = x0 + cx + off;
            if (tx <= x0 || tx >= x0 + ROOM_W - 1) continue;
            // the cell on the surface: lowest water with rock below (floor jet) / highest with rock above (ceiling jet)
            let ty = -1;
            for (let y = y0 + 5; y <= y0 + 9; y++) { // the tube rows
              if (!open(tx, y)) continue;
              if (ceil ? !open(tx, y - 1) : !open(tx, y + 1)) { ty = y; if (ceil) break; }
            }
            if (ty < 0 || !usableH(tx, ty) || !clearOfStart(tx, ty, SET_START_KEEP_OUT)) continue;
            rec = makeHazardRecord('jet', tx + 0.5, ty + 0.5, 0, ceil ? 1 : -1, t, W, H);
            if (rec) break;
          }
          if (rec) { rec.set = 'gauntlet'; forced.push(rec); occupied.push(rec.x, rec.y, 2); }
        }
      } else if (kind === SET_GARDEN) {
        gardens.push(x0, y0);
        // beds: floor cells (water over rock) between the walls; up to 5 urchins, 2 tiles apart, in a seeded order
        const cand = [];
        for (let ty = y0 + 3; ty < y0 + ROOM_H - 2; ty++) for (let tx = x0 + 1; tx < x0 + ROOM_W - 1; tx++) {
          if (!usable(tx, ty) || !clearOfStart(tx, ty, SET_START_KEEP_OUT)) continue;
          if (!open(tx, ty + 1)) cand.push([tx, ty, 0]);        // on the floor
          else if (!open(tx, ty - 1)) cand.push([tx, ty, 1]);   // hanging from the roof
        }
        const grng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0x6a4d + i));
        for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(grng() * (k + 1)); const tmp = cand[k]; cand[k] = cand[j]; cand[j] = tmp; }
        const taken = [];
        for (const [tx, ty, up] of cand) {
          if (taken.length >= 5) break;
          if (taken.some((q) => Math.hypot(q[0] - tx, q[1] - ty) < 2)) continue;
          const rec = makeEnemySlot(t, 'urchin', tx, ty, 0, up ? 1 : -1) || { type: 'enemy-slot', kind: 'urchin', placement: up ? 'ceiling' : 'floor', x: tx + 0.5, y: ty + 0.5, flatRun: true, wallDir: 0, nearSideWall: false, mantaFit: false, narrowShaft: false };
          rec.set = 'garden'; forced.push(rec); taken.push([tx, ty]); occupied.push(rec.x, rec.y, 1.5);
        }
      } else if (kind === SET_POOL) {
        // r39 Challenge Pool: two floor vents either side of the plinth (they only push); the pedestal, the rocks and the
        // chest are pool.js. No enemy shares the room.
        pools.push(x0, y0);
        // r40: the left vent sits at column 2 or 1, the right one at 7 or 8: column 3 beside the plinth is the host's
        for (const [lx, offs] of [[2, [0, -1]], [7, [0, 1]]]) {
          for (const off of offs) {
            const tx = x0 + lx + off;
            let ty = -1;
            for (let y = y0 + 5; y <= y0 + ROOM_H - 3; y++) if (open(tx, y) && !open(tx, y + 1)) { ty = y; break; }
            if (ty < 0 || !usableH(tx, ty) || !clearOfStart(tx, ty, SET_START_KEEP_OUT)) continue;
            const rec = makeHazardRecord('jet', tx + 0.5, ty + 0.5, 0, -1, t, W, H);
            if (rec) { rec.set = 'pool'; forced.push(rec); occupied.push(rec.x, rec.y, 2); break; }
          }
        }
      } else if (kind === SET_WRECK) {
        // the hull rests on the room's floor (the row above the rock in the middle columns); the hold holds a chest and pots
        const cx = x0 + 5;
        let fy = -1;
        for (let y = y0 + ROOM_H - 2; y > y0 + 4 && fy < 0; y--) if (open(cx, y) && !open(cx, y + 1)) fy = y + 1; // the floor line (top of the rock)
        if (fy < 0) continue;
        if (!usableH(cx, fy - 1)) continue;
        forced.push({ type: 'decor', dk: 'wreck', x: cx, y: fy, dx: flip ? -1 : 1, dy: 0, set: 'wreck' });
        occupied.push(cx, fy - 1, 3);
        const lootAt = [[cx - 0.5 + (flip ? 1 : 0), 'chest'], [cx - 3, 'pot'], [cx + 2.5, 'pot']];
        for (const [lx, name] of lootAt) {
          const tx = Math.floor(lx), ty = fy - 1;
          if (!usableH(tx, ty) || open(tx, ty + 1)) continue;
          const rec = makeLootRecord(name, tx + 0.5, ty + 0.5, 0, -1, lrng, relicOk);
          if (rec) { rec.set = 'wreck'; forced.push(rec); occupied.push(rec.x, rec.y, 1.2); }
        }
      }
    }
    const placed = forced.concat(selectSpawns(table, hit, levelIndex, prng, build, occupied, (p) => table.kind[p] !== 'decor'));
    // A*: blocking hazards must leave the exit (and shop) reachable
    const collect = () => { const b = []; for (const r of placed) if (r.type === 'hazard') hazardBlockers(r, b); return b; };
    // r37: the loop used to stop after 64 drops, which a table flooded with blockers could exhaust (unsolvable level);
    // it now runs until the path is clear, dropping a few at a time when there are many (an A* per drop is slow)
    for (let guard = 0; guard < 400; guard++) {
      const bl = collect();
      if (!bl.length || finalPathOk(t, level.startX, level.startY, level.exitX, level.exitY, level.shop, bl)) break;
      let drop = 0;
      for (const r of placed) if (r.type === 'hazard' && hazardBlockers(r).length) drop++;
      drop = Math.max(1, Math.floor(drop / 8));
      for (let k = placed.length - 1; k >= 0 && drop > 0; k--) {
        if (placed[k].type === 'hazard' && hazardBlockers(placed[k]).length) { placed.splice(k, 1); drop--; }
      }
      if (drop > 0 && !placed.some((r) => r.type === 'hazard' && hazardBlockers(r).length)) break; // nothing left to drop
    }
    // no two enemies spawn on top of each other (or hug each other): drop the later one of a too-close pair
    let kept = [];
    for (const r of placed) {
      if (r.type === 'enemy-slot' && kept.some((k) => k.type === 'enemy-slot' && !(k.set === 'garden' && r.set === 'garden') && Math.hypot(k.x - r.x, k.y - r.y) < ENEMY_MIN_GAP)) continue;
      kept.push(r);
    }
    // r37: a garden holds urchins only: no crab, piranha, cannon or horns inside its walls
    if (gardens.length) {
      kept = kept.filter((r) => {
        if (r.type !== 'enemy-slot' || r.kind === 'urchin') return true;
        for (let g = 0; g < gardens.length; g += 2) if (r.x >= gardens[g] && r.x < gardens[g] + ROOM_W && r.y >= gardens[g + 1] && r.y < gardens[g + 1] + ROOM_H) return false;
        return true;
      });
    }
    // r39: the Challenge Pool's room holds no enemy, trap or loot of its own (only its two vents)
    if (pools.length) {
      kept = kept.filter((r) => {
        if ((r.type !== 'enemy-slot' && r.type !== 'hazard' && r.type !== 'loot') || r.set) return true;
        for (let g = 0; g < pools.length; g += 2) if (r.x >= pools[g] && r.x < pools[g] + ROOM_W && r.y >= pools[g + 1] && r.y < pools[g + 1] + ROOM_H) return false;
        return true;
      });
    }
    // r36: a hidden pocket's entrance (the cell its crack leads to) stays clear of enemies, like other objectives
    const keepOut = [];
    for (let i = 0; i < (level.nPockets || 0); i++) {
      const px = level.pockets[i * 3], py = level.pockets[i * 3 + 1], side = level.pockets[i * 3 + 2];
      keepOut.push(side === ANCH_LEFT ? px - 2.5 : side === ANCH_RIGHT ? px + 4.5 : px + 1, side === ANCH_UP ? py - 2.5 : side === ANCH_DOWN ? py + 4.5 : py + 1);
    }
    for (const r of kept) if (r.type === 'loot' && r.lk === LK_POCKET) keepOut.push(r.x + r.dx * 2, r.y + r.dy * 2);
    if (keepOut.length) {
      kept = kept.filter((r) => {
        if (r.type !== 'enemy-slot') return true;
        for (let i = 0; i < keepOut.length; i += 2) if (Math.hypot(r.x - keepOut[i], r.y - keepOut[i + 1]) < POCKET_KEEP_OUT) return false;
        return true;
      });
    }
    // r36: a patroller must have room to patrol. Its free stretch (rock on either side, and any static enemy standing
    // in the row) has to leave its body at least PATROL_MIN_TRAVEL of centre travel, or it would sit pinned against an
    // urchin / horns / cannon. enemies.js turns at them at run time; this keeps the spawn from starting boxed in.
    {
      const statics = kept.filter((r) => r.type === 'enemy-slot' && STATIC_KINDS[r.kind]);
      kept = kept.filter((r) => {
        if (r.type !== 'enemy-slot' || !PATROL_HULL[r.kind]) return true;
        const hull = PATROL_HULL[r.kind], tx = Math.floor(r.x), ty = Math.floor(r.y), reach = PATROL_REACH[r.kind];
        let xl = tx, xr = tx;
        while (r.x - (xl) < reach && xl - 1 >= 0 && t[idx(xl - 1, ty)] === 0) xl--;
        while (xr + 1 - r.x < reach && xr + 1 < W && t[idx(xr + 1, ty)] === 0) xr++;
        let lo = xl + hull.wx, hi = xr + 1 - hull.wx;
        for (const s of statics) {
          const sh = STATIC_HULL[s.kind];
          if (Math.abs(s.y - r.y) >= hull.hy + sh.hy + 0.3) continue;
          if (s.x >= r.x) hi = Math.min(hi, s.x - hull.hx - sh.hx - 0.4); else lo = Math.max(lo, s.x + hull.hx + sh.hx + 0.4);
        }
        return lo <= r.x && r.x <= hi && hi - lo >= hull.min;
      });
    }
    // r36: decor (foliage clusters, rune carvings, boulders) is its own pass over the same hits, after everything that
    // matters is placed: it is not solid (it can never block the swim path or the A* check), keeps out of the shop and
    // the exit ring, and only keeps a small gap from what is already there. decor.js / v2-props-draw.js draw it.
    {
      const drng = mulberry32(hashSeed2(hashSeed2(runSeed >>> 0, levelIndex >>> 0), 0xdec0a7));
      const occ = [];
      for (const r of kept) occ.push(r.x, r.y, DECOR_GAP);
      for (const s of spawns) if (s.type === 'shell') occ.push(s.x, s.y, DECOR_GAP);
      const buildDecor = (p, x, y, dx, dy) => {
        const tx = Math.floor(x), ty = Math.floor(y), name = table.spawn[p];
        if (tx < BORDER || ty < BORDER || tx >= W - BORDER || ty >= H - BORDER || inShop(tx, ty) || nearExit(tx, ty)) return null;
        if (name === 'rune') { // the anchor is the rock tile carrying the carving, water in front of it
          if (t[idx(tx, ty)] === 0 || t[idx(tx + dx, ty + dy)] !== 0) return null;
        } else if (name === 'fossil') { // r37: a fossil is embedded in thick rock (the whole 3x3 around it is rock)
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (t[idx(tx + ox, ty + oy)] === 0) return null;
        } else if (t[idx(tx, ty)] !== 0) return null; // foliage and boulders stand in water on a surface
        return { type: 'decor', dk: name, x, y, dx, dy };
      };
      for (const r of selectSpawns(table, hit, levelIndex, drng, buildDecor, occ, (p) => table.kind[p] === 'decor')) kept.push(r);
    }
    for (const r of kept) spawns.push(r);
  }
  return { spawns, openCells: openCells.length };
}
