// The rest grotto (data/rest.json): the parser's spring and shop markers, reachability for the real octopus, and the spring drawing.
import { parseAuthoredMap } from '../js/authored.js';
import { drawSpring, springReach } from '../js/spring-draw.js';
import { cullReset } from '../js/cull.js';

/** Generic 4-neighbour BFS over "fat" water (2x2 blocks) on a w x h grid (the 0.45-radius octopus fits a 2x2 block). */
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

function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push(k); return k === 'createRadialGradient' || k === 'createLinearGradient' ? grad : undefined; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

export async function runRestTests(assert) {
  const restJson = await (await fetch('../data/rest.json')).json();
  const rest = parseAuthoredMap(restJson);
  const T = (x, y) => rest.tiles[y * rest.w + x];

  assert(`rest grotto: ${rest.w}x${rest.h}, about 40-48 wide and 22-26 high`, rest.w >= 40 && rest.w <= 48 && rest.h >= 22 && rest.h <= 26);
  assert('rest grotto: has a start in the top-left quarter and an exit towards the far right', rest.startX < rest.w / 4 && rest.startY < rest.h / 3 && rest.exitX > rest.w * 0.75);
  assert('rest grotto: has a spring (tile centre coordinates, on a water tile)', rest.springX > 0 && rest.springY > 0 && T(Math.floor(rest.springX), Math.floor(rest.springY)) === 0 && rest.springX % 1 === 0.5);
  assert('rest grotto: the spring sits right above the floor (rock below it)', (() => {
    const x = Math.floor(rest.springX); let y = Math.floor(rest.springY);
    for (let d = 0; d < 3; d++, y++) if (T(x, y + 1) !== 0) return true;
    return false;
  })());
  const sh = rest.shop;
  assert('rest grotto: has a shop with a keeper and three pedestals', !!sh && sh.px.length === 6 && sh.kx > 0);
  assert('rest grotto: the pedestals are on one floor row, left to right, with the keeper beside them on that row', sh.px[1] === sh.px[3] && sh.px[3] === sh.px[5] && sh.px[0] < sh.px[2] && sh.px[2] < sh.px[4] && sh.ky === sh.px[1] && (sh.kx < sh.px[0] || sh.kx > sh.px[4]));
  assert('rest grotto: keeper and pedestals stand on water tiles with rock beneath', (() => {
    const pts = [[sh.kx, sh.ky], [sh.px[0], sh.px[1]], [sh.px[2], sh.px[3]], [sh.px[4], sh.px[5]]];
    return pts.every(([x, y]) => T(x, y) === 0 && T(x, y + 1) === 1);
  })());
  assert('rest grotto: pedestals are at least 2 tiles apart (room for the octopus between them)', sh.px[2] - sh.px[0] >= 2 && sh.px[4] - sh.px[2] >= 2);
  const reach = (x, y) => fatReach(rest.tiles, rest.w, rest.h, rest.startX, rest.startY, x, y);
  assert('rest grotto: start reaches the spring without bombs', reach(Math.floor(rest.springX), Math.floor(rest.springY)));
  assert('rest grotto: start reaches the keeper and every pedestal without bombs', reach(sh.kx, sh.ky) && reach(sh.px[0], sh.px[1]) && reach(sh.px[2], sh.px[3]) && reach(sh.px[4], sh.px[5]));
  assert('rest grotto: start reaches the exit ring without bombs', reach(rest.exitX, rest.exitY));
  assert('rest grotto: no bomb walls, no enemies, no hazards', rest.walls.length === 0 && !rest.spawns.some((s) => s.type === 'enemy-slot'));
  assert('rest grotto: one prompt with desktop and touch text', rest.prompts.length === 1 && rest.prompts[0].title === 'A quiet grotto' && rest.prompts[0].desktop && rest.prompts[0].touch && rest.prompts[0].r > 0);

  // the other authored maps are untouched by the new markers
  const hub = parseAuthoredMap(await (await fetch('../data/hub.json')).json());
  const tut = parseAuthoredMap(await (await fetch('../data/tutorial.json')).json());
  assert('rest grotto: hub and tutorial still parse with no spring and no shop', hub.springX === -1 && hub.springY === -1 && hub.shop === null && tut.springX === -1 && tut.shop === null && hub.exitX >= 0 && tut.walls.length > 0);
  let threw = false;
  try { parseAuthoredMap({ id: 'x', rows: ['####', '#SK#', '#.E#', '####'] }); } catch (e) { threw = true; }
  assert('rest grotto: a keeper without three pedestals is rejected', threw);

  // spring reach
  const sx = rest.springX, sy = rest.springY;
  assert('spring: reach is true at the centre and within a tile, false 2 tiles away', springReach(sx, sy, sx, sy) && springReach(sx + 0.8, sy - 0.5, sx, sy) && !springReach(sx + 2, sy, sx, sy) && !springReach(sx, sy - 2, sx, sy));

  // drawing
  const cam = { x: sx, y: sy, pxPerUnit: 50 };
  cullReset();
  const c1 = recCtx();
  let ok = true;
  try { drawSpring(c1, cam, 800, 600, sx, sy, 1.3, false); } catch (e) { ok = false; }
  assert('spring: drawSpring does not throw and draws strokes and fills', ok && c1.calls.length > 20 && c1.calls.includes('stroke') && c1.calls.includes('fill'));
  const c2 = recCtx();
  try { drawSpring(c2, cam, 800, 600, sx, sy, 1.3, true); } catch (e) { ok = false; }
  assert('spring: once drunk from it is calmer (fewer bubbles) but still drawn', ok && c2.calls.length > 20 && c2.calls.filter((k) => k === 'arc').length < c1.calls.filter((k) => k === 'arc').length);
  const c3 = recCtx();
  drawSpring(c3, { x: sx + 80, y: sy, pxPerUnit: 50 }, 800, 600, sx, sy, 1.3, false);
  assert('spring: far off screen draws nothing', c3.calls.length === 0);
  cullReset();
}
