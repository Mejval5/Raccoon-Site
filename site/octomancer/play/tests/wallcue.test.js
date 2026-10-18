// Night batch 8 (2026-10-18): the "breakable here" mark is painted cracks baked into the rock, not a pale box.
// drawCrackTile is the bake hook (render.js paintMaterialCell via materials.js setTileDrawHook): charcoal fractures with a
// faint chip edge, clipped to the barrier's own tiles; the tutorial walls add a small ochre cave-painting bomb. drawWallCue
// (live, every frame) only lets a few grains of silt fall: no fill, no clip, no image. Offscreen canvases only.
import { drawWallCue, drawCrackTile, paintCrackCue, fractureLines } from '../js/v2-props-draw.js';
import { MAT_ROCK, MAT_BONE } from '../js/materials.js';

const PPU = 40;

/** A tutorial-like bomb floor: rows 8-9, x 4..15, water above and below. */
function floorLevel() {
  const walls = [];
  for (let y = 8; y < 10; y++) for (let x = 4; x < 16; x++) walls.push(x, y);
  const solid = (x, y) => (y >= 8 && y < 10 && x >= 0 && x < 20) || y < 2 || y >= 16 || x < 1 || x >= 19;
  return { walls: Int16Array.from(walls), tileAt: (x, y) => (solid(x, y) ? MAT_ROCK : 0) };
}

/** Bake every tile of the level the way render.js does: each solid tile, in a canvas at PPU px per tile. */
function bake(level, tileAt, W, H, tiles) {
  const c = document.createElement('canvas'); c.width = W * PPU; c.height = H * PPU;
  const g = c.getContext('2d');
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const m = tileAt(tx, ty);
    if (m !== 0 && (!tiles || tiles(tx, ty))) drawCrackTile(g, level, tileAt, tx, ty, tx * PPU, ty * PPU, PPU);
  }
  return g;
}

function stats(g, x0, y0, w, h) {
  const d = g.getImageData(x0, y0, w, h).data;
  let painted = 0, line = 0, lineRgb = 0, outA = 0, outN = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a > 0) painted++;
    if (a >= 0.5) { line++; lineRgb += (d[i] + d[i + 1] + d[i + 2]) / 3; } else { outA += a; outN++; }
  }
  return { painted, line, lineRgb: line ? lineRgb / line : 0, outMean: outN ? outA / outN : 0, n: d.length / 4 };
}

export async function runWallCueTests(assert) {
  // ---- the live cue: silt only, no box ----
  {
    const { walls, tileAt } = floorLevel();
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const g = c.getContext('2d');
    const cam = { x: 10, y: 9, pxPerUnit: PPU };
    let worst = 0;
    for (const t of [0.1, 0.5, 1, 1.7, 2.4, 3.3]) {
      g.clearRect(0, 0, 640, 480);
      drawWallCue(g, cam, 640, 480, { walls, tileAt, attention: 1 }, t);
      const s = stats(g, 320 + (4 - 10) * PPU, 240 + (8 - 9) * PPU, 12 * PPU, 2 * PPU);
      worst = Math.max(worst, s.painted / s.n);
    }
    assert(`wall cue: the live cue paints no box over the barrier (at most ${(worst * 100).toFixed(2)}% of its rect, silt grains only)`, worst < 0.01);
    // a counting context: per frame only a few small arcs, never a fillRect, clip, stroke or image
    const calls = { arc: 0, other: 0 };
    const stub = new Proxy({}, {
      get(_, k) {
        if (k === 'arc') return () => { calls.arc++; };
        if (['fillRect', 'clip', 'stroke', 'drawImage', 'save', 'getImageData', 'createPattern'].includes(k)) return () => { calls.other++; };
        return () => {};
      },
      set() { return true; },
    });
    for (let f = 0; f < 120; f++) drawWallCue(stub, cam, 640, 480, { walls, tileAt, attention: f & 1 }, f / 60);
    assert(`wall cue: per frame only silt arcs (${(calls.arc / 120).toFixed(1)} a frame), no fillRect, clip, stroke or image`, calls.other === 0 && calls.arc / 120 <= 12);
  }

  // ---- the baked cracks: charcoal lines on the barrier, nothing else ----
  {
    const { walls, tileAt } = floorLevel();
    const level = { walls, w: 20, h: 18 };
    const g = bake(level, tileAt, 20, 18);
    const inBar = stats(g, 4 * PPU, 8 * PPU, 12 * PPU, 2 * PPU);
    assert(`wall cue: the barrier carries crack lines (${inBar.line} px of line, ${(inBar.line / inBar.n * 100).toFixed(1)}% of its rect)`, inBar.line > 400 && inBar.line / inBar.n < 0.3);
    assert(`wall cue: the lines are dark charcoal (mean ${inBar.lineRgb.toFixed(0)})`, inBar.lineRgb < 90);
    assert(`wall cue: no tint or box: the mean alpha off the crack lines is ${inBar.outMean.toFixed(3)} (< 0.1)`, inBar.outMean < 0.1);
    const all = stats(g, 0, 0, 20 * PPU, 18 * PPU);
    assert('wall cue: nothing is painted off the barrier\'s own tiles', all.painted === inBar.painted);
    // a pale chip edge exists, but faint (no glow)
    const d = g.getImageData(4 * PPU, 8 * PPU, 12 * PPU, 2 * PPU).data;
    let pale = 0, bright = 0;
    for (let i = 0; i < d.length; i += 4) { const lum = (d[i] + d[i + 1] + d[i + 2]) / 3; if (d[i + 3] > 20 && lum > 120) { pale++; if (d[i + 3] > 170) bright++; } }
    assert(`wall cue: a faint lighter chip edge along the cracks (${pale} px, ${bright} of them strong)`, pale > 30 && bright === 0);
    // the ochre bomb mark at the middle
    const m = g.getImageData(10 * PPU - 8, 9 * PPU - 8, 16, 16).data;
    let ochre = 0; for (let i = 0; i < m.length; i += 4) if (m[i + 3] > 60 && m[i] > m[i + 2] + 30) ochre++;
    assert(`wall cue: an ochre cave-painting bomb sits at the barrier's middle (${ochre} px)`, ochre > 40);
    // deterministic: a rebake (or another session) paints the same fractures
    assert('wall cue: the fractures are deterministic (the same box gives the same strokes)', JSON.stringify(fractureLines(4, 8, 12, 2, true)) === JSON.stringify(fractureLines(4, 8, 12, 2, true)));
    const c3 = document.createElement('canvas'); c3.width = 640; c3.height = 480;
    const g3 = c3.getContext('2d');
    paintCrackCue(g3, { x: 10, y: 9, pxPerUnit: PPU }, 640, 480, walls, tileAt);
    assert('wall cue: paintCrackCue paints the cue for sheets', stats(g3, 0, 0, 640, 480).line > 400);
    // a blown-away tile draws nothing (the bake hook is only called for solid tiles; and a water tile never matches)
    const c4 = document.createElement('canvas'); c4.width = PPU; c4.height = PPU;
    const g4 = c4.getContext('2d');
    drawCrackTile(g4, level, tileAt, 10, 5, 0, 0, PPU);
    assert('wall cue: a tile no crack crosses gets nothing', stats(g4, 0, 0, PPU, PPU).painted === 0);
  }

  // ---- the fracture geometry stays inside its box ----
  {
    let ok = true;
    for (let k = 0; k < 30; k++) {
      const horiz = k & 1, w = horiz ? 3 + k : 2, h = horiz ? 2 : 3 + k;
      const f = fractureLines(k * 7, k * 3, w, h, !!horiz);
      if (!f.strokes.length) ok = false;
      for (const s of f.strokes) if (!s.branch) for (let i = 0; i < s.pts.length; i += 2) {
        if (s.pts[i] < k * 7 || s.pts[i] > k * 7 + w || s.pts[i + 1] < k * 3 || s.pts[i + 1] > k * 3 + h) ok = false;
      }
    }
    assert('wall cue: fracture lines run inside their box (main strokes), every box gets some', ok);
  }

  // ---- the same mark on the hub's fish-bone wall and on a sealed pocket ----
  {
    const bone = (x, y) => x >= 9 && x < 11 && y >= 4 && y < 7;
    const tileAt = (x, y) => (bone(x, y) ? MAT_BONE : y >= 7 || y < 1 || x < 1 || x >= 19 ? MAT_ROCK : 0);
    const hub = { walls: new Int16Array(0), w: 20, h: 10, village: [] };
    const g = bake(hub, tileAt, 20, 10);
    const s = stats(g, 9 * PPU, 4 * PPU, 2 * PPU, 3 * PPU), all = stats(g, 0, 0, 20 * PPU, 10 * PPU);
    assert(`wall cue: the hub's fish-bone wall carries the cracks (${s.line} px) and nothing else does`, s.line > 150 && all.painted === s.painted);
    const notHub = bake({ walls: new Int16Array(0), w: 20, h: 10 }, tileAt, 20, 10);
    assert('wall cue: fish bone in a dive level stays as it is (no cracks outside the hub)', stats(notHub, 0, 0, 20 * PPU, 10 * PPU).painted === 0);
  }
  {
    // a pocket at (8, 4) (2 x 2 water), entrance below (side 2): the crack is in row 6 (the tile row beside it), row 7 stays clean
    const water = (x, y) => (x >= 8 && x < 10 && y >= 4 && y < 6) || y >= 8;
    const tileAt = (x, y) => (water(x, y) ? 0 : MAT_ROCK);
    const lvl = { walls: new Int16Array(0), w: 20, h: 12, nPockets: 1, pockets: Int16Array.from([8, 4, 2]) };
    const g = bake(lvl, tileAt, 20, 12);
    const crack = stats(g, 8 * PPU, 6 * PPU, 2 * PPU, PPU), all = stats(g, 0, 0, 20 * PPU, 12 * PPU);
    assert(`wall cue: a sealed pocket's weak wall gets the same painted crack (${crack.line} px), only in the tile row beside it`, crack.line > 60 && all.painted === crack.painted);
  }
}
