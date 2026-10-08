// Fragile terrain tests (2026-10-08, fragile.js): the fish-bone block (MAT_BONE) crumbles from a dash, the Ink Jet, a
// cannon shot, a harpoon, a flung prop, a bomb and a boulder, and nothing else breaks that way; generated levels place
// it from the pattern table's 'terrain' rows only where the path never needs it, keep spawns off it and hide finds in it.
import { MAT_ROCK, MAT_BEDROCK, MAT_BONE, MAT_TIMBER, MAT_MASONRY } from '../js/materials.js';
import { CR_DASH, CR_INK, CR_SHOT, CR_PROP, CR_BOMB, CR_BOULDER, crumbleCircle, crumbleAt, DASH_BREAK_SPEED } from '../js/fragile.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createOctopus, stepOctopus } from '../js/octopus.js';
import { createInkJet } from '../js/inkjet.js';
import { createProps, PK_ROCK } from '../js/props.js';
import { generateLevel, finalPathOk, BONE_TERRAIN, LEVEL_W } from '../js/level.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { compilePatterns, getPatternTable, setPatternTable } from '../js/patterns.js';

function handLevel(W, H, paint) {
  const tiles = new Uint8Array(W * H);
  const put = (x, y, m) => { tiles[y * W + x] = m; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) put(x, y, MAT_BEDROCK);
  paint(put);
  return { authored: true, id: 'fragile-test', w: W, h: H, tiles, marks: new Int16Array(48), nMarks: 0, startX: 3, startY: 3, exitX: 4, exitY: 3, prompts: [], spawns: [], nSpawns: 0, fallback: 0, attempts: 0, nAnchors: 0, walls: new Int16Array(0) };
}
/** A corridor rows 4..7 from x 2 to 21, with a wall of `mat` across it at x = 12 (rows 2..9). */
const corridor = (mat) => handLevel(24, 12, (put) => {
  for (let x = 2; x < 22; x++) { put(x, 2, MAT_ROCK); put(x, 3, MAT_ROCK); put(x, 8, MAT_ROCK); put(x, 9, MAT_ROCK); }
  for (let y = 4; y < 8; y++) put(12, y, mat);
});
const STEP = 1 / 60;
const NONE = { move: { x: 0, y: 0 }, dash: { pressed: false } };

export async function runFragileTests(assert, bank) {
  // ---- the world API ----
  {
    const lvl = handLevel(16, 12, (put) => { put(5, 6, MAT_ROCK); put(6, 6, MAT_BONE); put(7, 6, MAT_TIMBER); put(8, 6, MAT_MASONRY); put(9, 6, MAT_BEDROCK); put(10, 6, MAT_BONE); put(11, 6, MAT_BONE); });
    const w = createLevelWorld(0, 0, { level: lvl });
    const only = [5, 7, 8, 9].every((x) => !w.crumbleTile(x, 6, CR_INK)) && !w.crumbleTile(0, 0, CR_INK) && !w.crumbleTile(4, 4, CR_INK);
    assert('fragile: only fish bone crumbles from a light hit (rock, timber, masonry, bedrock, water and the border stay)', only && w.tileAt(5, 6) === MAT_ROCK && w.tileAt(7, 6) === MAT_TIMBER);
    const ok = w.crumbleTile(6, 6, CR_INK) && w.tileAt(6, 6) === 0;
    const log = w.takeCrumbles();
    assert('fragile: crumbleTile turns fish bone to water and logs [tx, ty, cause]', ok && log.join() === [6, 6, CR_INK].join() && w.takeCrumbles().length === 0);
    w.breakTile(10, 6); w.smashTile(11, 6); w.breakTile(5, 6);
    const log2 = w.takeCrumbles();
    assert('fragile: a bomb and a boulder breaking fish bone log it too (rock does not)', log2.join() === [10, 6, CR_BOMB, 11, 6, CR_BOULDER].join());
  }
  // ---- dash ----
  {
    const run = (mat, dash) => {
      const w = createLevelWorld(0, 0, { level: corridor(mat) });
      const o = createOctopus(9.5, 6); o.feel = true; o.angle = 90; // facing right (+x)
      let broke = 0;
      for (let k = 0; k < 90; k++) {
        stepOctopus(o, k === 0 && dash ? { move: { x: 1, y: 0 }, dash: { pressed: true } } : { move: { x: k < 30 ? 1 : 0, y: 0 }, dash: { pressed: false } }, STEP, w);
        broke += o.crunched || 0;
      }
      return { w, o, broke, log: w.takeCrumbles() };
    };
    const d = run(MAT_BONE, true);
    const through = d.w.tileAt(12, 5) === 0 && d.w.tileAt(12, 6) === 0;
    assert(`fragile: a dash crumbles the fish-bone wall in front of it and swims through (x ${d.o.x.toFixed(2)}, ${d.broke} broken)`, through && d.o.x > 12.6 && d.broke >= 1 && d.log.length >= 3 && d.log[2] === CR_DASH);
    const s = run(MAT_BONE, false);
    assert('fragile: plain swimming into fish bone does not break it', s.w.tileAt(12, 5) === MAT_BONE && s.w.tileAt(12, 6) === MAT_BONE && s.o.x < 12);
    const r = run(MAT_ROCK, true);
    assert('fragile: a dash into rock does not break it (the old bounce)', r.w.tileAt(12, 5) === MAT_ROCK && r.w.tileAt(12, 6) === MAT_ROCK && r.o.x < 12);
    assert('fragile: the dash break threshold is above a plain swim', DASH_BREAK_SPEED >= 3);
  }
  // ---- Ink Jet ----
  {
    const shoot = (mat) => {
      const w = createLevelWorld(0, 0, { level: corridor(mat) });
      const jet = createInkJet();
      jet.fire(8.5, 5.5, 1, 0, 0);
      for (let k = 0; k < 120; k++) jet.update(STEP, w, [], () => {});
      return w;
    };
    const wb = shoot(MAT_BONE), wr = shoot(MAT_ROCK);
    assert('fragile: an Ink Jet blob crumbles the fish-bone tile it splats on, and not rock', wb.tileAt(12, 5) === 0 && wb.tileAt(12, 6) === MAT_BONE && wr.tileAt(12, 5) === MAT_ROCK);
  }
  // ---- projectiles through the shared helper (cannon shot, harpoon) ----
  {
    const w = createLevelWorld(0, 0, { level: corridor(MAT_BONE) });
    assert('fragile: crumbleAt (cannon shot, harpoon) breaks fish bone and reports it; rock and water report false', crumbleAt(w, 12.3, 4.5, CR_SHOT) && w.tileAt(12, 4) === 0 && !crumbleAt(w, 10.5, 5.5, CR_SHOT) && !crumbleAt(w, 5.5, 2.5, CR_SHOT));
    const back = crumbleCircle(w, 11.7, 6.5, 0.45, CR_DASH, -1, 0);
    const n = crumbleCircle(w, 11.7, 6.5, 0.45, CR_DASH, 1, 0);
    assert('fragile: crumbleCircle breaks only the tiles it touches ahead of its direction', back === 0 && n === 1 && w.tileAt(12, 6) === 0 && w.tileAt(12, 7) === MAT_BONE && w.tileAt(12, 5) === MAT_BONE);
  }
  // ---- a flung prop ----
  {
    const fling = (speed) => {
      const w = createLevelWorld(0, 0, { level: corridor(MAT_BONE) });
      const props = createProps();
      props.add(PK_ROCK, 10, 6, speed, 0);
      for (let k = 0; k < 60; k++) props.step(STEP, w, null);
      return w;
    };
    const fast = fling(12), slow = fling(2);
    const fastBroke = [4, 5, 6, 7].some((y) => fast.tileAt(12, y) === 0);
    assert('fragile: a prop slammed into fish bone breaks it; a slow one rests against it', fastBroke && [4, 5, 6, 7].every((y) => slow.tileAt(12, y) === MAT_BONE));
  }
  // ---- generated levels ----
  if (!bank || typeof bank === 'function') { // one.html passes approx: build the bank here
    const { createRoomBank } = await import('../js/rooms.js');
    bank = createRoomBank(await (await fetch('../data/biome1-rooms.json')).json());
  }
  {
    const own = !getPatternTable();
    if (own) setPatternTable(compilePatterns(await (await fetch('../data/patterns.json')).json()));
    const json = await (await fetch('../data/patterns.json')).json();
    const rows = json.patterns.filter((p) => p.kind === 'terrain');
    assert(`fragile: data/patterns.json 'terrain' rows equal level.js BONE_TERRAIN (${rows.length} rows)`, rows.length > 0 && JSON.stringify(rows) === JSON.stringify(BONE_TERRAIN));
    let levels = 0, plugs = 0, badPlug = 0, pathBad = 0, onBone = 0, finds = 0, findBad = 0;
    for (let s = 0; s < 30; s++) {
      const lv = generateLevel(7000 + s, s % 3, bank);
      if (lv.fallback || lv.bankFallback) continue;
      levels++;
      for (let k = 0; k < lv.bonePlugs.length; k += 2) { plugs++; if (lv.tiles[lv.bonePlugs[k + 1] * LEVEL_W + lv.bonePlugs[k]] !== MAT_BONE) badPlug++; }
      if (!finalPathOk(lv.tiles, lv.startX, lv.startY, lv.exitX, lv.exitY, lv.shop)) pathBad++;
      const { spawns } = buildLevelSpawns(lv, 7000 + s, s % 3);
      for (const r of spawns) {
        const tx = Math.floor(r.x), ty = Math.floor(r.y);
        if (r.type === 'embed') { if (lv.tiles[ty * LEVEL_W + tx] === MAT_BONE) { finds++; if (r.sub < 1) findBad++; } continue; }
        if (r.type !== 'enemy-slot' && r.type !== 'hazard' && r.type !== 'loot' && r.type !== 'decor') continue;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (lv.tiles[(ty + oy) * LEVEL_W + tx + ox] === MAT_BONE) { onBone++; oy = 2; break; }
      }
    }
    assert(`fragile: generated levels get fish-bone plugs from the pattern table (${plugs} in ${levels} levels)`, levels > 20 && plugs >= levels);
    assert('fragile: every plug anchor is fish bone and the start-to-exit path (bone solid) still passes', badPlug === 0 && pathBad === 0);
    assert(`fragile: no enemy, trap, loot or decor rests against fish bone (${onBone})`, onBone === 0);
    assert(`fragile: some plugs hide a find (${finds} in fish bone)`, finds > 0 && findBad === 0);
    if (own) setPatternTable(null);
  }
}
