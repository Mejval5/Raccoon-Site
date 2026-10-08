// Round 3 art pass: the second atlas (img/v2/sprites-r3.webp, js/sprite-atlas-r3.js) and the code drawing it replaces (giant clam,
// tentacle limb, juice beads, ink puffs, bomb, spell icons, jar, tutorial bomb marker). Each changed draw function runs on a real
// canvas before the atlas is ready (the code fallback; this test is registered first in index.html so nothing has asked for a
// sprite yet) and after it.
import { ATLAS_R3_RECTS, ATLAS_R3_META } from '../js/sprite-atlas-r3.js';
import { ATLAS_RECTS } from '../js/sprite-atlas.js';
import { ensureSprites, spritesReady, onSpritesReady, spriteRect, spriteMeta, spriteAspect } from '../js/sprites.js';
import { createCreatures, makeCreatureRecord, CR_TENTACLE, TN_REACH } from '../js/creatures.js';
import { drawCreaturesBack, drawCreaturesFront, drawClamIcon, drawPearlIcon, drawStripAlong } from '../js/creatures-draw.js';
import { drawCorpses } from '../js/corpses-draw.js';
import { kindId } from '../js/corpses.js';
import { createJuiceDrops, createInkClouds } from '../js/spells.js';
import { drawJuiceDrops, drawInkClouds } from '../js/spells-draw.js';
import { drawBombs } from '../js/enemy-draw.js';
import { drawBombItem } from '../js/loot-draw.js';
import { drawWallCue, itemGlyph } from '../js/v2-props-draw.js';
import { drawSpellIcon, drawJarIcon, drawBombSlotIcon } from '../js/spell-icons.js';

const NAMES = ['gclamCup', 'gclamLid', 'gclamCavity', 'gclamPearl', 'tentLimb', 'juiceDrop0', 'juiceDrop1', 'juiceDrop2', 'juiceDrop3',
  'inkPuff0', 'inkPuff1', 'inkPuff2', 'inkPuff3', 'bomb', 'bombHot', 'bombMark', 'iconInkCloud', 'iconJar'];
const W = 480, H = 360;

function canvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
function painted(c) { const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }
function run(fn) { const c = canvas(); let err = null; try { fn(c.getContext('2d')); } catch (e) { err = e; } return { err, n: err ? 0 : painted(c) }; }
/** A context that counts drawImage calls. */
function counting(g) {
  const o = { drew: 0 };
  o.ctx = new Proxy(g, { get(t, k) { const v = t[k]; if (k === 'drawImage') return (...a) => { o.drew++; return v.apply(t, a); }; return typeof v === 'function' ? v.bind(t) : v; }, set(t, k, v) { t[k] = v; return true; } });
  return o;
}

const CAM = { x: 0, y: 0, pxPerUnit: 60 };
const w2s = (cam, cw, ch, x, y) => ({ x: cw / 2 + (x - cam.x) * cam.pxPerUnit, y: ch / 2 + (y - cam.y) * cam.pxPerUnit });

/** Every changed draw function, one case each: [name, (ctx) => void]. */
function cases() {
  const w = 14, h = 10, tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = 1;
  const cr = createCreatures();
  cr.add(makeCreatureRecord('gclam', 7.5, 8.5, 0, -1, tiles, w, h));
  cr.add(makeCreatureRecord('tentacle', 4.5, 1.5, 0, 1, tiles, w, h));
  const d = cr.data;
  let tent = -1;
  for (let i = 0; i < d.n; i++) if (d.kind[i] === CR_TENTACLE) tent = i;
  d.state[tent] = TN_REACH; d.tipx[tent] = d.mx[tent] + 2; d.tipy[tent] = d.my[tent] + 2.5;
  const cam = { x: 6, y: 5, pxPerUnit: 40 };
  const drops = createJuiceDrops(); drops.spawn(0, 0, 4, 1);
  for (let i = 0; i < 20; i++) drops.update(0.02, { x: 50, y: 50, dead: false }, { isSolid: () => false, tileAt: () => 0 }, 99);
  const clouds = createInkClouds(); clouds.puff(0, 0, 0, 0, { duration: 5, radius: 1.6, drift: 0 }); clouds.data.age[0] = 1;
  const cd = { live: 1, n: 2, cap: 2, alive: [1, 1], x: [-1, 1], y: [0, 0], kind: [kindId('gclam'), kindId('tentacle')], rot: [0, 1.2], face: [1, -1], restT: [0, 0] };
  const bomb = (burn) => ({ x: 0, y: 0, rot: 0.6, exploded: false, fuse: 1.5 * (1 - burn), fuse0: 1.5 });
  const cue = { walls: Int16Array.from([10, 8, 11, 8, 10, 9, 11, 9]), tileAt: () => 1, attention: 0.5 };
  return [
    ['clam back (cavity, pearl)', (g) => drawCreaturesBack(g, cam, W, H, d, 1)],
    ['clam front (cup, lid) and tentacle', (g) => drawCreaturesFront(g, cam, W, H, d, 1, { x: 6, y: 5, held: 0, dead: false, deathStyle: '' })],
    ['tentacle limb', (g) => drawCreaturesBack(g, { x: d.mx[tent], y: d.my[tent], pxPerUnit: 40 }, W, H, d, 1)],
    ['clam and pearl icons', (g) => { g.translate(100, 100); g.scale(60, 60); drawClamIcon(g); g.translate(2, 0); drawPearlIcon(g); }],
    ['clam and tentacle corpses', (g) => drawCorpses(g, CAM, W, H, cd, 1)],
    ['juice drops', (g) => drawJuiceDrops(g, CAM, W, H, drops.data, 1)],
    ['ink clouds (both passes)', (g) => { drawInkClouds(g, CAM, W, H, clouds.data, 1, 0); drawInkClouds(g, CAM, W, H, clouds.data, 1, 1); }],
    ['bomb (fresh, burning, nearly gone)', (g) => { for (const b of [0, 0.5, 0.95]) drawBombs(g, CAM, w2s, W, H, [bomb(b)], 1); }],
    ['bomb item', (g) => drawBombItem(g, 100, 100, 60)],
    ['bomb glyphs', (g) => { itemGlyph(g, 'bomb', 100, 100, 20, 1); itemGlyph(g, 'bombs3', 200, 100, 20, 1); }],
    ['bomb slot icon', (g) => drawBombSlotIcon(g, 40, 40, 30)],
    ['spell icons (ink cloud, unknown)', (g) => { drawSpellIcon(g, 'ink-cloud', 40, 40, 30); drawSpellIcon(g, 'nope', 120, 40, 30); }],
    ['jar icon', (g) => { drawJarIcon(g, 10, 10, 40, 64, 0.5, 3); drawJarIcon(g, 70, 10, 40, 64, 0, 0); }],
    ['tutorial bomb marker', (g) => drawWallCue(g, { x: 10.5, y: 8.5, pxPerUnit: 40 }, W, H, cue, 1)],
  ];
}

export async function runArtR3Tests(assert) {
  // the names and rects
  const names = Object.keys(ATLAS_R3_RECTS), rects = Object.values(ATLAS_R3_RECTS);
  const missing = NAMES.filter((n) => !ATLAS_R3_RECTS[n]);
  assert('art r3: every sprite the code asks for is in ATLAS_R3_RECTS' + (missing.length ? ' [' + missing.join(', ') + ']' : ''), missing.length === 0);
  assert('art r3: every rect lies inside the 1024 x 585 atlas', rects.every(([x, y, w, h]) => x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1024 && y + h <= 585));
  let overlap = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) overlap++;
  }
  assert('art r3: no two rects overlap (' + names.length + ' sprites)', overlap === 0);
  assert('art r3: no name is in both atlases', names.every((n) => !ATLAS_RECTS[n]));
  const m = ATLAS_R3_META;
  assert('art r3: meta for gclamCup, gclamLid, bomb, bombHot and iconJar',
    m.gclamCup && m.gclamLid && m.bomb && m.bombHot && m.iconJar && m.bomb.ru > 0 && m.iconJar.u1 > m.iconJar.u0 && m.iconJar.v1 > m.iconJar.v0 && spriteMeta('bomb') === m.bomb && spriteMeta('nope') === null);
  assert('art r3: spriteAspect knows names of both atlases', Math.abs(spriteAspect('iconJar') - 80 / 128) < 1e-9 && spriteAspect('quill') > 0 && spriteAspect('nope') === 1);

  // before the atlas is ready: every function draws its code version
  const wasReady = spritesReady();
  const before = cases().map(([name, fn]) => [name, run(fn)]);
  assert('art r3: before the atlas is ready no sprite is drawable' + (wasReady ? ' (already loaded by an earlier test)' : ''), wasReady || (!spriteRect('gclamCup') && !spriteRect('bomb')));
  for (const [name, r] of before) assert(`art r3: ${name} runs without throwing and paints (code fallback)` + (r.err ? ' [' + r.err + ']' : ''), !r.err && r.n > 0);

  // after: both atlases ready
  ensureSprites();
  const ready = await new Promise((res) => { const t = setTimeout(() => res(false), 8000); onSpritesReady(() => { clearTimeout(t); res(true); }); });
  assert('art r3: onSpritesReady fires once both atlases are ready', ready && spritesReady() && !!spriteRect('quill') && !!spriteRect('gclamCup'));
  let calls = 0; onSpritesReady(() => { calls++; });
  assert('art r3: a listener added after ready is called at once', calls === 1);
  const after = cases().map(([name, fn]) => [name, run(fn)]);
  for (const [name, r] of after) assert(`art r3: ${name} runs without throwing and paints with the atlas` + (r.err ? ' [' + r.err + ']' : ''), !r.err && r.n > 0);

  // the sprites reach the canvas
  {
    const o = counting(canvas().getContext('2d'));
    drawBombItem(o.ctx, 100, 100, 60);
    assert('art r3: the bomb item is one drawImage from the atlas', o.drew === 1);
  }
  // the strip helper: one drawImage per segment
  {
    const o = counting(canvas().getContext('2d'));
    const n = 12, xs = new Float32Array(n + 1), ys = new Float32Array(n + 1), ws = new Float32Array(n + 1).fill(0.3);
    for (let k = 0; k <= n; k++) { xs[k] = 100 + k * 10; ys[k] = 100 + Math.sin(k / 3) * 10; }
    const ok = drawStripAlong(o.ctx, xs, ys, ws, n);
    assert(`art r3: drawStripAlong draws one drawImage per segment (${o.drew} for ${n})`, ok === true && o.drew === n);
  }
}
