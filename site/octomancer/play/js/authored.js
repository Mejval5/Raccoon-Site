// Authored maps (V2-PLAN section 10, B1-3): the hub and the tutorial are ASCII maps in
// data/hub.json and data/tutorial.json, turned into the same level shape generateLevel
// returns (tiles + start / exit + marks), at any size. Behind ?v2=1.
//
// Rows: '#' rock, '.' water, 'S' start, 'E' exit (in the hub: the dive entrance),
// 'J' journal board, 'Q' the hub residents' anchor (no sign is drawn any more: Marlo stands there, Pip swims beside it), 'R' shortcut ring to Shallows 1-2 (hub; drawn once unlocked), 'T' Marlo's shortcut ring to Shallows 1-3 (hub; r39), 'W' a bomb-breakable wall tile (rock like any other interior rock).
// Rest grotto (data/rest.json, end of the zone): 'H' the spring's centre (level.springX / springY, tile centre, -1 when absent),
// 'K' the shop keeper's tile and three 'P' the pedestal tiles (level.shop = { kx, ky, px:Int16Array(6) } like level.js, null when absent;
// pedestals sorted left to right). All of them are water tiles; the floor under them is rock, as in a generated shop room.
// Materials (materials.js): 'X' bedrock, 'B' bone block, '=' timber, 'M' masonry. The 2-tile border is written as rock
// and becomes bedrock (the world treats it as unbreakable).

import { MK_START, MK_EXIT } from './rooms.js';
import { createPathGrid, findPath } from './pathcheck.js';
import { MAT_CHARS, MAT_ROCK, MAT_BEDROCK } from './materials.js';

export const MK_BOARD = 9, MK_SIGN = 10, MK_SHORTCUT = 11, MK_SHORTCUT3 = 12;
export const AUTHORED_BORDER = 2;

/**
 * @param {{id:string, name?:string, rows:string[], prompts?:any[], spawns?:any[]}} json
 */
export function parseAuthoredMap(json) {
  const rows = json.rows;
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const marks = new Int16Array(3 * 16);
  const walls = [];
  let nMarks = 0, sx = -1, sy = -1, ex = -1, ey = -1, bx = -1, by = -1, qx = -1, qy = -1, rx = -1, ry = -1, tx3 = -1, ty3 = -1, hx = -1, hy = -1, kx = -1, ky = -1;
  const ped = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error('map ' + json.id + ' row ' + y + ' has width ' + rows[y].length + ', expected ' + w);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      let t = 0;
      if (MAT_CHARS[ch] !== undefined) t = MAT_CHARS[ch];
      else if (ch === 'W') { t = MAT_ROCK; walls.push(x, y); }
      else if (ch === 'S') { sx = x; sy = y; marks[nMarks * 3] = x; marks[nMarks * 3 + 1] = y; marks[nMarks * 3 + 2] = MK_START; nMarks++; }
      else if (ch === 'E') { ex = x; ey = y; marks[nMarks * 3] = x; marks[nMarks * 3 + 1] = y; marks[nMarks * 3 + 2] = MK_EXIT; nMarks++; }
      else if (ch === 'J') { bx = x; by = y; marks[nMarks * 3] = x; marks[nMarks * 3 + 1] = y; marks[nMarks * 3 + 2] = MK_BOARD; nMarks++; }
      else if (ch === 'Q') { qx = x; qy = y; marks[nMarks * 3] = x; marks[nMarks * 3 + 1] = y; marks[nMarks * 3 + 2] = MK_SIGN; nMarks++; }
      else if (ch === 'R') { rx = x; ry = y; marks[nMarks * 3] = x; marks[nMarks * 3 + 1] = y; marks[nMarks * 3 + 2] = MK_SHORTCUT; nMarks++; }
      else if (ch === 'T') { tx3 = x; ty3 = y; marks[nMarks * 3] = x; marks[nMarks * 3 + 1] = y; marks[nMarks * 3 + 2] = MK_SHORTCUT3; nMarks++; }
      else if (ch === 'H') { hx = x; hy = y; }
      else if (ch === 'K') { kx = x; ky = y; }
      else if (ch === 'P') ped.push([x, y]);
      else if (ch !== '.') throw new Error('map ' + json.id + ': unknown character ' + ch);
      tiles[y * w + x] = t;
    }
  }
  if (sx < 0) throw new Error('map ' + json.id + ' has no S');
  if (ex < 0) throw new Error('map ' + json.id + ' has no E');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < AUTHORED_BORDER || y < AUTHORED_BORDER || x >= w - AUTHORED_BORDER || y >= h - AUTHORED_BORDER) {
      if (tiles[y * w + x] === 0) throw new Error('map ' + json.id + ': border must be rock at ' + x + ',' + y);
      tiles[y * w + x] = MAT_BEDROCK;
    }
  }
  let shop = null;
  if (kx >= 0 && ped.length === 3) {
    ped.sort((a, b) => a[0] - b[0]);
    const px = new Int16Array(6);
    for (let i = 0; i < 3; i++) { px[i * 2] = ped[i][0]; px[i * 2 + 1] = ped[i][1]; }
    shop = { kx, ky, px };
  } else if (kx >= 0 || ped.length) throw new Error('map ' + json.id + ': a shop needs one K and three P');
  return {
    authored: true, id: json.id, name: json.name || json.id, w, h, tiles, marks, nMarks,
    startX: sx, startY: sy, exitX: ex, exitY: ey, boardX: bx, boardY: by, signX: qx, signY: qy, shortcutX: rx, shortcutY: ry, shortcut3X: tx3, shortcut3Y: ty3,
    springX: hx >= 0 ? hx + 0.5 : -1, springY: hy >= 0 ? hy + 0.5 : -1, shop,
    walls: Int16Array.from(walls), // x,y pairs of the bomb wall tiles
    prompts: json.prompts || [], spawns: json.spawns || [],
    nSpawns: 0, fallback: 0, attempts: 0, nAnchors: 0,
  };
}

/** Fetch hub.json, tutorial.json and rest.json (raw; call parseAuthoredMap per load so a bombed map starts fresh). */
export async function fetchAuthoredMaps(base = 'data/') {
  const [hub, tut, rest] = await Promise.all([fetch(base + 'hub.json'), fetch(base + 'tutorial.json'), fetch(base + 'rest.json')]);
  if (!hub.ok || !tut.ok || !rest.ok) throw new Error('authored maps: ' + hub.status + '/' + tut.status + '/' + rest.status);
  return { hub: await hub.json(), tutorial: await tut.json(), rest: await rest.json() };
}

/**
 * A* check for an authored map (pathcheck.js, real octopus radius): the exit trigger is reachable from S.
 * Bomb-wall tiles count as passable only when `bombsGuaranteed` (the tutorial refills bombs, tutorial.js).
 */
export function authoredSolvable(map, bombsGuaranteed = false) {
  const wall = new Uint8Array(map.w * map.h);
  if (bombsGuaranteed) for (let i = 0; i < map.walls.length; i += 2) wall[map.walls[i + 1] * map.w + map.walls[i]] = 1;
  const grid = createPathGrid(map.w, map.h, (x, y) => map.tiles[y * map.w + x] !== 0 && !wall[y * map.w + x]);
  return findPath(grid, map.startX + 0.5, map.startY + 0.5, map.exitX + 0.5, map.exitY + 0.5) !== null;
}
