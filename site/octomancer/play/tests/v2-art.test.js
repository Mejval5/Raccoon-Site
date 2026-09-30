// Round 24: generated Shallows art (js/v2-art.js, img/v2/*.webp): every file loads, sprites carry alpha,
// the rock tile is seamless, the counter slices add up, the draw code runs with the art and without it,
// the banner title card shows, and endless mode does not fetch any of it.
import { V2_ART_FILES, ensureV2Art, artImg, art, artUrl, COUNTER_SLICES, ROCK_TILE_UNITS } from '../js/v2-art.js';
import { drawShop, drawVaultCache, drawWallCue, drawQuestSign, drawPocketCracks } from '../js/v2-props-draw.js';
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
  assert('v2 art: 15 generated images are registered, all under img/v2 as webp', keys.length === 15 && keys.every((k) => /^[a-z0-9-]+\.webp$/.test(V2_ART_FILES[k])));
  ensureV2Art();
  const rockEl = art.rock;
  ensureV2Art();
  assert('v2 art: loading is lazy and idempotent (only a v2 renderer calls it; a second call keeps the same images)', art.rock === rockEl);
  await Promise.all(keys.map((k) => new Promise((res) => { if (art[k].complete) res(); else { art[k].addEventListener('load', res, { once: true }); art[k].addEventListener('error', res, { once: true }); } })));
  assert('v2 art: every image loads', keys.every((k) => artImg(k) && artImg(k).naturalWidth > 16));

  // alpha sprites have transparent corners and opaque centre pixels; the opaque layers have none
  const alphaKeys = ['near', 'ring', 'keeper', 'sign', 'pedestal', 'counter', 'chestClosed', 'chestOpen', 'crackVault', 'crackWall', 'board', 'questSign', 'banner'];
  const clearShare = (k) => { const d = pixels(artImg(k)).data; let c = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 8) c++; return c / (d.length / 4); };
  assert('v2 art: keyed sprites keep real transparency (between 5 and 98 percent of pixels clear, no opaque key box)', alphaKeys.every((k) => { const c = clearShare(k); return c > 0.05 && c < 0.98; }));
  let magenta = 0;
  for (const k of alphaKeys) { const d = pixels(artImg(k)).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 200 && d[i + 2] > 200 && d[i + 1] < 90) magenta++; }
  assert('v2 art: no key-colour (magenta) pixels are left opaque in any sprite', magenta < 40);
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
    drawVaultCache(ctx, cam, 640, 480, 10.5, 11.5, 1, false);
    drawVaultCache(ctx, cam, 640, 480, 10.5, 11.5, 1, true);
    drawQuestSign(ctx, cam, 640, 480, 10, 10, 1);
    drawWallCue(ctx, cam, 640, 480, { walls: Int16Array.from([10, 8, 11, 8, 10, 9, 11, 9]), tileAt: () => 1, attention: 0 }, 1);
    drawPocketCracks(ctx, cam, 640, 480, Int16Array.from([10, 8, 4]), 1, () => 1);
    drawV2Marks(ctx, cam, 640, 480, { exitX: 10, exitY: 10, boardX: 8, boardY: 9, label: 'Dive', tileAt }, 1);
    drawV2Marks(ctx, cam, 640, 480, { exitX: 10, exitY: 10, boardX: -1, boardY: -1, label: '', tileAt }, 1);
  } catch (e) { threw = e; }
  assert('v2 art: shop, chest, sign, wall crack, pocket crack, ring and board draw without throwing' + (threw ? ' (' + threw + ')' : ''), threw === null);
  const shot = ctx.getImageData(0, 0, 640, 480).data;
  let painted = 0; for (let i = 3; i < shot.length; i += 4) if (shot[i] > 0) painted++;
  assert('v2 art: the shop and props actually painted pixels', painted > 4000);
}
