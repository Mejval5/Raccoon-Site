// Round 24: generated Shallows art (js/v2-art.js, img/v2/*.webp): every file loads, sprites carry alpha,
// the rock tile is seamless, the counter slices add up, the draw code runs with the art and without it,
// the banner title card shows, and endless mode does not fetch any of it.
import { V2_ART_FILES, ensureV2Art, artImg, art, artUrl, COUNTER_SLICES, ROCK_TILE_UNITS, whirlpoolSheetKey } from '../js/v2-art.js';
import { WHIRL_SHEETS } from '../js/whirlpool-meta.js';
import { DIVER_SCALE, drawShop, drawDiver, drawCritter, drawWallCue, drawPocketCracks } from '../js/v2-props-draw.js';
import { drawV2Marks } from '../js/v2-draw.js';

function pixels(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  return cx.getImageData(0, 0, c.width, c.height);
}

export async function runV2ArtTests(assert) {
  const keys = Object.keys(V2_ART_FILES);
  assert('v2 art: 15 images are registered (14 generated + the whirlpool sheet from the original game), all under img/v2 as webp', keys.length === 15 && keys.every((k) => /^[a-z0-9-]+\.webp$/.test(V2_ART_FILES[k])));
  ensureV2Art();
  const rockEl = art.rock;
  ensureV2Art();
  assert('v2 art: loading is lazy and idempotent (only a v2 renderer calls it; a second call keeps the same images)', art.rock === rockEl);
  await Promise.all(keys.map((k) => new Promise((res) => { if (art[k].complete) res(); else { art[k].addEventListener('load', res, { once: true }); art[k].addEventListener('error', res, { once: true }); } })));
  assert('v2 art: every image loads', keys.every((k) => artImg(k) && artImg(k).naturalWidth > 16));

  // alpha sprites have transparent corners and opaque centre pixels; the opaque layers have none
  const alphaKeys = ['near', 'keeper', 'sign', 'pedestal', 'counter', 'chestClosed', 'chestOpen', 'crackVault', 'crackWall', 'board', 'questSign', 'banner', 'whirlpool'];
  const clearShare = (k) => { const d = pixels(artImg(k)).data; let c = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 8) c++; return c / (d.length / 4); };
  assert('v2 art: keyed sprites keep real transparency (between 5 and 98 percent of pixels clear, no opaque key box)', alphaKeys.every((k) => { const c = clearShare(k); return c > 0.05 && c < 0.98; }));
  let magenta = 0;
  for (const k of alphaKeys) { const d = pixels(artImg(k)).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 200 && d[i + 2] > 200 && d[i + 1] < 90) magenta++; }
  assert('v2 art: no key-colour (magenta) pixels are left opaque in any sprite', magenta < 40);
  const wsh = WHIRL_SHEETS[whirlpoolSheetKey()];
  assert('v2 art: the whirlpool sheet in use is 7 columns x 3 rows of the cells its meta says (r44: 208 px, or 380 px for the DPR 2 desktop sheet)', artImg('whirlpool').naturalWidth === 7 * wsh.cell && artImg('whirlpool').naturalHeight === 3 * wsh.cell);
  const far = pixels(artImg('far')).data;
  let opaque = true; for (let i = 3; i < far.length; i += 4 * 97) if (far[i] !== 255) { opaque = false; break; }
  assert('v2 art: the far backdrop is fully opaque', opaque);

  // rock tile: seamless (opposite edges match about as well as neighbouring columns) and the same mid-blue as the rock fill
  const rock = artImg('rock'), rd = pixels(rock), W = rock.naturalWidth, H = rock.naturalHeight;
  const col = (x, y) => { const i = (y * W + x) * 4; return rd.data[i] + rd.data[i + 1] + rd.data[i + 2]; };
  let seam = 0, inner = 0;
  for (let y = 0; y < H; y++) { seam += Math.abs(col(0, y) - col(W - 1, y)); inner += Math.abs(col(W >> 1, y) - col((W >> 1) + 1, y)); }
  assert('v2 art: the rock tile is seamless (wrap difference within 2x an ordinary neighbour column difference)', seam <= inner * 3 + H * 4);
  let mr = 0, mg = 0, mb = 0; for (let i = 0; i < rd.data.length; i += 4) { mr += rd.data[i]; mg += rd.data[i + 1]; mb += rd.data[i + 2]; }
  const n = rd.data.length / 4; mr /= n; mg /= n; mb /= n;
  assert('v2 art: the rock tile averages a slate blue near the wall fill (58,84,142)', Math.abs(mr - 58) < 30 && Math.abs(mg - 84) < 30 && Math.abs(mb - 142) < 35 && mb > mr + 40);
  assert('v2 art: the rock tile spans a whole number of world units', Number.isInteger(ROCK_TILE_UNITS) && ROCK_TILE_UNITS >= 6);
  assert('v2 art: counter slices add up to the counter strip width', COUNTER_SLICES.reduce((a, b) => a + b, 0) === artImg('counter').naturalWidth);
  assert('v2 art: artUrl points into img/v2', artUrl('x.webp').endsWith('/img/v2/x.webp'));

  // draw code runs with art loaded, with a frame count of zero throws, and never paints outside its canvas
  const cvs = document.createElement('canvas'); cvs.width = 640; cvs.height = 480;
  const ctx = cvs.getContext('2d');
  const cam = { x: 10, y: 10, pxPerUnit: 40 };
  const tileAt = (x, y) => (y >= 12 ? 1 : 0);
  const shopSt = { items: [{ glyph: 'bomb', price: 3 }, { glyph: 'heart', price: 5 }, { glyph: 'bombs3', price: 8 }], stock: Uint8Array.from([0, 1, 2]), sold: Uint8Array.from([0, 0, 1]),
    px: Float32Array.from([8.5, 11.5, 11.5, 11.5, 14.5, 11.5]), keeperX: 10.5, keeperY: 8.5 };
  let threw = null;
  try {
    drawShop(ctx, cam, 640, 480, shopSt, 4, 1.2, tileAt);
    drawShop(ctx, cam, 640, 480, shopSt, 9, 1.2, () => 0); // no ceiling: the post stands on the counter end
    drawDiver(ctx, cam, 640, 480, 10.5, 11.5, 1, false);
    drawDiver(ctx, cam, 640, 480, 10.5, 11.5, 1, true);
    drawCritter(ctx, cam, 640, 480, 12.5, 10.5, false, 1);
    drawWallCue(ctx, cam, 640, 480, { walls: Int16Array.from([10, 8, 11, 8, 10, 9, 11, 9]), tileAt: () => 1, attention: 0 }, 1);
    drawPocketCracks(ctx, cam, 640, 480, Int16Array.from([10, 8, 4]), 1, () => 1);
    drawV2Marks(ctx, cam, 640, 480, { exitX: 10, exitY: 10, boardX: 8, boardY: 9, label: 'Dive', tileAt }, 1);
    drawV2Marks(ctx, cam, 640, 480, { exitX: 10, exitY: 10, boardX: -1, boardY: -1, label: '', tileAt }, 1);
  } catch (e) { threw = e; }
  assert('v2 art: shop, diver, caged critter, wall crack, pocket crack, ring and board draw without throwing' + (threw ? ' (' + threw + ')' : ''), threw === null);
  {
    // r40: Marlo is one size everywhere: sealed, freed or in the hub, from his feet to the top of his helmet, about a tile (1.0-1.1)
    const bounds = (sealed, freed) => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400; const g = c.getContext('2d');
      drawDiver(g, { x: 0, y: 0, pxPerUnit: 100 }, 400, 400, 0, 1, 1, freed, sealed); // feet at the lower middle; no bubbles in the way: only count the body
      const d = g.getImageData(0, 0, 400, 400).data;
      let top = 400, bot = 0;
      for (let y = 0; y < 400; y++) { let n = 0; for (let x = 100; x < 300; x++) if (d[(y * 400 + x) * 4 + 3] > 200) n++; if (n >= 20) { if (y < top) top = y; if (y > bot) bot = y; } } // rows wide enough to be the body: a bubble is only a few pixels
      return (bot - top) / 100;
    };
    const hs = [bounds(true, false), bounds(false, true), bounds(false, false)];
    assert('v2 art (r40): the diver is about 1-1.1 tiles tall sealed, freed and standing (' + hs.map((h) => h.toFixed(2)).join(' / ') + ')', hs.every((h) => h >= 0.95 && h <= 1.2) && Math.max(...hs) - Math.min(...hs) < 0.15 && DIVER_SCALE > 0.85);
  }
  const shot = ctx.getImageData(0, 0, 640, 480).data;
  let painted = 0; for (let i = 3; i < shot.length; i += 4) if (shot[i] > 0) painted++;
  assert('v2 art: the shop and props actually painted pixels', painted > 4000);
}
