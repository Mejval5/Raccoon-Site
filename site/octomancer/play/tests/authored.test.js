// B1-3 authored maps (hub.json, tutorial.json): parsing, solvability, the bomb wall, and the
// single-level world built from an authored level.
import { parseAuthoredMap, MK_BOARD, MK_SIGN, MK_SHORTCUT, MK_SHORTCUT3, MK_TUTORIAL } from '../js/authored.js';
import { createLevelWorld } from '../js/world-v2.js';

/** Generic 4-neighbour BFS over "fat" water (2x2 blocks) on a w x h grid. */
function fatReach(tiles, w, h, sx, sy, ex, ey) {
  const fat = new Uint8Array(w * h);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x;
    if (!tiles[i] && !tiles[i + 1] && !tiles[i + w] && !tiles[i + w + 1]) fat[i] = fat[i + 1] = fat[i + w] = fat[i + w + 1] = 1;
  }
  const s = sy * w + sx, e = ey * w + ex;
  if (!fat[s] || !fat[e]) return false;
  const seen = new Uint8Array(w * h), q = [s];
  seen[s] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    if (i === e) return true;
    const x = i % w;
    for (const n of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (n >= 0 && n < w * h && fat[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return false;
}

export async function runAuthoredTests(assert) {
  const hubJson = await (await fetch('../data/hub.json')).json();
  const tutJson = await (await fetch('../data/tutorial.json')).json();
  const hub = parseAuthoredMap(hubJson), tut = parseAuthoredMap(tutJson);

  // --- hub ---
  assert(`authored hub: ${hub.w}x${hub.h}, one or two screens (34 wide, at most 2x24 tall)`, hub.w === 34 && hub.h >= 20 && hub.h <= 48);
  assert('authored hub: has a start, a dive entrance (E) and a journal board (J)', hub.startX >= 0 && hub.exitX >= 0 && hub.boardX >= 0);
  assert('authored hub: the dive entrance is below the start, at the bottom of a shaft (swim down into it)', hub.exitY > hub.startY + 4);
  assert('authored hub: marks list holds start, exit, board, the resident anchor (Q: no sign is drawn), the two shortcut rings (R, and the T of Marlo) and the tutorial ring (U)', (() => {
    const kinds = []; for (let k = 0; k < hub.nMarks; k++) kinds.push(hub.marks[k * 3 + 2]);
    return kinds.length === 7 && kinds.includes(MK_BOARD) && kinds.includes(MK_SIGN) && kinds.includes(MK_SHORTCUT) && kinds.includes(MK_SHORTCUT3) && kinds.includes(MK_TUTORIAL);
  })());
  assert('authored hub: the tutorial ring (U) lies on a floor near the start, reachable without bombs, not under the start (an idle octopus sinks straight down) and away from the dive',
    hub.tutorialX >= 0 && hub.tiles[(hub.tutorialY + 1) * hub.w + hub.tutorialX] !== 0 && fatReach(hub.tiles, hub.w, hub.h, hub.startX, hub.startY, hub.tutorialX, hub.tutorialY)
    && Math.abs(hub.tutorialX - hub.startX) >= 2 && hub.tutorialY < hub.exitY && Math.hypot(hub.tutorialX - hub.startX, hub.tutorialY - hub.startY) < 8);
  assert('authored hub: sealed-dive prompts (when: sealed) and the welcome for an open dive (when: open)', hub.prompts.some((p) => p.when === 'sealed') && hub.prompts.some((p) => p.when === 'open'));
  assert('authored hub: start reaches the dive entrance without bombs', fatReach(hub.tiles, hub.w, hub.h, hub.startX, hub.startY, hub.exitX, hub.exitY));
  assert('authored hub: start reaches the journal board without bombs', fatReach(hub.tiles, hub.w, hub.h, hub.startX, hub.startY, hub.boardX, hub.boardY));
  assert('authored hub: start reaches both shortcut rings (R and the T of Marlo) without bombs, three tiles or more apart', fatReach(hub.tiles, hub.w, hub.h, hub.startX, hub.startY, hub.shortcutX, hub.shortcutY) && fatReach(hub.tiles, hub.w, hub.h, hub.startX, hub.startY, hub.shortcut3X, hub.shortcut3Y) && Math.abs(hub.shortcut3X - hub.exitX) >= 3 && Math.abs(hub.shortcutX - hub.exitX) >= 3);
  assert('authored hub: no wall tiles, no enemies (safe state)', hub.walls.length === 0 && !hub.spawns.some((s) => s.type === 'enemy-slot'));
  assert('authored hub: has a welcome prompt', hub.prompts.length >= 1 && hub.prompts.every((p) => p.title && p.desktop && p.touch && p.r > 0));

  // --- tutorial ---
  assert(`authored tutorial: ${tut.w}x${tut.h}, a short authored level`, tut.w >= 40 && tut.w <= 100 && tut.h >= 20);
  const kinds = tut.prompts.map((p) => p.title.toLowerCase());
  assert('authored tutorial: prompts for swim, dash, ink, grab, bomb, sticky mine, spells, shop, spikes, boulders, clams and the dive, each with desktop and touch text',
    ['swim', 'dash', 'ink', 'grab', 'bomb', 'sticky', 'spells', 'shop', 'spikes', 'boulders', 'clams', 'dive'].every((k) => kinds.some((t) => t.includes(k))) && tut.prompts.every((p) => p.desktop && p.touch));
  assert('authored tutorial: every prompt has a short sign label and a sign standing on rock (in water, floor under it)',
    tut.prompts.every((p) => p.label && p.label.length <= 8 && p.sign && tut.tiles[p.sign[1] * tut.w + p.sign[0]] === 0 && tut.tiles[(p.sign[1] + 1) * tut.w + p.sign[0]] !== 0));
  assert('authored tutorial: the touch texts never name keys or mouse buttons', tut.prompts.every((p) => !/WASD|Space|Shift|left click|right click|middle click|press [A-Z]\b|\bTab\b/i.test(p.touch)));
  assert('authored tutorial: every room holds a prompt, and the rooms are listed in play order with one door each for ink, hand, cloud and shop', (() => {
    const inRect = (r, x, y) => x >= r[0] && x <= r[2] + 1 && y >= r[1] && y <= r[3] + 1;
    const ids = tut.rooms.map((r) => r.id).join(',');
    return ids === 'swim,ink,hand,bomb,sticky,cloud,shop,hazards,exit' && tut.rooms.every((r) => tut.prompts.some((p) => inRect(r.rect, p.x, p.y)))
      && tut.rooms.filter((r) => r.door).map((r) => r.goal).join(',') === 'bone,throw,cast,buy' && Object.keys(tut.doors).length === 4;
  })());
  assert('authored tutorial: bomb prompt names C (drop), B / X (quick bomb) and the touch Bomb button; the sticky prompt the right click', (() => {
    const b = tut.prompts.find((p) => p.title.toLowerCase().includes('bomb')), st = tut.prompts.find((p) => p.title.toLowerCase().includes('sticky'));
    return /press C/.test(b.desktop) && /B or X/.test(b.desktop) && /tap Bomb/.test(b.touch) && /right click/.test(st.desktop) && /tap Bomb/.test(st.touch);
  })());
  assert('authored tutorial: the dive prompt names F, the Beholder, the Swift Current and the journal', (() => {
    const d = tut.prompts.find((p) => p.title === 'Dive');
    return /press F/.test(d.desktop) && /Beholder/.test(d.desktop) && /Swift Current/.test(d.desktop) && /Tab/.test(d.desktop) && /journal/.test(d.touch);
  })());
  const clear = (base, lists) => { const t = base.slice(); for (const l of lists) for (let i = 0; i < l.length; i += 2) t[l[i + 1] * tut.w + l[i]] = 0; return t; };
  const doorLists = Object.values(tut.doors);
  assert('authored tutorial: the exit is NOT reachable without bombing the walls (doors open)', !fatReach(clear(tut.tiles, doorLists), tut.w, tut.h, tut.startX, tut.startY, tut.exitX, tut.exitY));
  assert('authored tutorial: nor with the walls gone while the doors are shut', !fatReach(clear(tut.tiles, [tut.walls, tut.sticky]), tut.w, tut.h, tut.startX, tut.startY, tut.exitX, tut.exitY));
  const cleared = clear(tut.tiles, [tut.walls, tut.sticky, ...doorLists]);
  assert('authored tutorial: once the walls and the doors are open the exit is reachable', fatReach(cleared, tut.w, tut.h, tut.startX, tut.startY, tut.exitX, tut.exitY));
  assert('authored tutorial: each door alone shuts the way (any one door closed: no exit)', Object.keys(tut.doors).every((k) =>
    !fatReach(clear(tut.tiles, [tut.walls, tut.sticky, ...Object.entries(tut.doors).filter(([n]) => n !== k).map(([, l]) => l)]), tut.w, tut.h, tut.startX, tut.startY, tut.exitX, tut.exitY)));
  assert('authored tutorial: the hazard gallery is sealed (no spike, boulder or clam can be reached with everything open)', tut.spawns.filter((s) => (s.type === 'hazard' && s.hk !== 1) || s.type === 'creature').every((s) =>
    !fatReach(cleared, tut.w, tut.h, tut.startX, tut.startY, Math.floor(s.x), Math.floor(s.y)) && s.x < 19));
  assert('authored tutorial: two urchins close the dash gap (one on its floor, one on its ceiling), a piranha in the spell room, pots in the ink and hand rooms', (() => {
    const en = tut.spawns.filter((s) => s.type === 'enemy-slot');
    const roomOf = (s) => tut.rooms.findIndex((r) => s.x >= r.rect[0] && s.x < r.rect[2] + 1 && s.y >= r.rect[1] && s.y < r.rect[3] + 1);
    const pots = tut.spawns.filter((s) => s.type === 'loot');
    return en.filter((e) => e.kind === 'urchin').length === 2 && en.some((e) => e.kind === 'piranha' && tut.rooms[roomOf(e)].id === 'cloud')
      && pots.some((s) => tut.rooms[roomOf(s)].id === 'ink') && pots.filter((s) => tut.rooms[roomOf(s)].id === 'hand').length >= 2;
  })());
  assert('authored tutorial: a free stall (one keeper, three pedestals) in the shop room', !!tut.shop && tut.shop.kx >= tut.rooms[6].rect[0] && tut.shop.kx <= tut.rooms[6].rect[2]);
  assert('authored tutorial: the barrier is a horizontal floor, two rows thick, spanning the shaft (bombs sink, so it is dropped on, not thrown at)', (() => {
    const ys = new Set(), xs = new Set(); for (let i = 0; i < tut.walls.length; i += 2) { xs.add(tut.walls[i]); ys.add(tut.walls[i + 1]); }
    return ys.size === 2 && xs.size >= 6 && tut.walls.length / 2 === ys.size * xs.size;
  })());
  assert('authored tutorial: the floor has water above it (the bomb room) and water below it (the way on), and rock either side', (() => {
    let ok = true;
    const T = (x, y) => tut.tiles[y * tut.w + x] !== 0;
    const ys = [...new Set(Array.from(tut.walls).filter((_, i) => i % 2))], y0 = Math.min(...ys), y1 = Math.max(...ys);
    const xs = Array.from(tut.walls).filter((_, i) => i % 2 === 0), x0 = Math.min(...xs), x1 = Math.max(...xs);
    for (let x = x0; x <= x1; x++) if (T(x, y0 - 1) || T(x, y1 + 1)) ok = false;
    if (!T(x0 - 1, y0) || !T(x0 - 1, y1) || !T(x1 + 1, y0) || !T(x1 + 1, y1)) ok = false;
    return ok;
  })());
  assert('authored tutorial: with the doors open the start reaches the bomb prompt area; with them shut it does not', (() => {
    const p = tut.prompts.find((q) => q.title.toLowerCase().includes('bomb'));
    return fatReach(clear(tut.tiles, doorLists), tut.w, tut.h, tut.startX, tut.startY, Math.floor(p.x), Math.floor(p.y)) && !fatReach(tut.tiles, tut.w, tut.h, tut.startX, tut.startY, Math.floor(p.x), Math.floor(p.y));
  })());

  // --- map validation ---
  let threw = false;
  try { parseAuthoredMap({ id: 'x', rows: ['####', '#S.#', '#.E#', '####'] }); } catch (e) { threw = true; }
  assert('authored: a map with an open cell in the border is rejected', (() => { try { parseAuthoredMap({ id: 'y', rows: ['#####', '#S..#', '#..E#', '#####'] }); return false; } catch (e) { return true; } })() || threw);
  assert('authored: a map without S is rejected', (() => { try { parseAuthoredMap({ id: 'z', rows: ['######', '######', '##.E##', '######', '######', '######'] }); return false; } catch (e) { return true; } })());

  // --- world from an authored level ---
  const w = createLevelWorld(1, 0, { level: parseAuthoredMap(tutJson) });
  assert('authored world: takes the map size (not 34x68) and reports authored', w.width === tut.w && w.height === tut.h && w.authored === true);
  assert('authored world: start and exit come from the map', Math.abs(w.startX - (tut.startX + 0.5)) < 1e-9 && w.reachedExit(tut.exitX + 0.5, tut.exitY + 0.5) && !w.reachedExit(tut.startX, tut.startY));
  const wx = tut.walls[0], wy = tut.walls[1];
  assert('authored world: a bomb breaks a wall tile', w.isSolid(wx, wy) && w.breakTile(wx, wy) === true && !w.isSolid(wx, wy));
  assert('authored world: the border is unbreakable', w.breakTile(0, 5) === false && w.breakTile(tut.w - 1, 5) === false && w.breakTile(10, 0) === false && w.breakTile(10, tut.h - 1) === false);
  assert('authored world: a bombed level does not leak into a fresh parse', parseAuthoredMap(tutJson).tiles[wy * tut.w + wx] === 1);
  assert('authored world: outline bands cover the whole map height', w.bandCount() * w.bandRows >= tut.h && !!w.getWallOutline(0));
  assert('authored world: authored spawns are handed to the chunk (named ones made into enemy, hazard, creature and loot records)', w.residentChunks()[0].chunk.spawns.length === tut.spawns.length
    && ['enemy-slot', 'hazard', 'creature', 'loot', 'plankton-swarm'].every((k) => tut.spawns.some((s) => s.type === k)) && tut.spawns.every((s) => s.type !== 'enemy'));
  assert('authored: a named spawn that does not fit the map is refused', (() => { try { parseAuthoredMap({ id: 'q', rows: ['######', '######', '##S.##', '##.E##', '######', '######'], spawns: [{ type: 'hazard', name: 'rock', x: 2.5, y: 2.5 }] }); return false; } catch (e) { return true; } })());
}
