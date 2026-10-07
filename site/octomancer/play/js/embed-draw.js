// Drawing for buried treasure (embed.js) and what the Sea-glass Goggles reveal. Called from main.js's v2 draw hook,
// in device pixels, after the walls and before the octopus.
//
//   buried basic shell   (cowrie, conch) ALWAYS visible: two or three small shells peeking out of the rock, set in
//                        dark sockets, like Spelunky's gold veins
//   buried, the rest     (nautilus, pearl, bombs, items) nothing without the goggles; with them a soft pale
//                        silhouette with a faint halo, through the rock
//   loose                the find itself (shell sprite, pearl, bomb, item icon) where its physics prop is
//   drawPocketReveal     with the goggles: the contents of the hidden one-tile pockets (loot.js) as silhouettes, and a
//                        soft rim around each sealed vault hollow (level.js carvePockets)
//
// Both return counts of what they drew ({shown, full, loose} / {pockets, vaults}), which the tests read.
//
// Per-tile hook (for a terrain materials pass that draws tile by tile): drawTreasureTile(ctx, d, tx, ty, x0, y0, ppu,
// goggles) draws whatever is buried in tile (tx, ty) into the tile's screen square (x0, y0, ppu px wide); returns the
// VIS_* code it drew (VIS_NONE when there is nothing there). Call it for main-rock tiles only. When that pass draws the
// buried finds itself, call drawEmbedded with opts.buried = false so only the loose ones are drawn here; when it bakes
// only the always-visible shells (goggles = false in the hook), pass opts.shown = false instead so the goggles
// silhouettes stay live.

import {
  EK_SHELL, EK_BOMB, EK_ITEM, ES_BURIED, ES_LOOSE, EMBED_SHELLS, VIS_NONE, VIS_SHOWN, VIS_FULL, embedVisibility, embedAt,
} from './embed.js';
import { itemFromCode } from './items.js';
import { drawItemIcon } from './items-draw.js';
import { drawBombItem, drawHeartItem } from './loot-draw.js';
import { LK_POCKET, ST_INTACT, POCKET_SHELLS, POCKET_BOMB, POCKET_HEART, POCKET_ITEM } from './loot.js';
import { visibleAt, cullFlags, cullView } from './cull.js';

const TAU = Math.PI * 2;
const SIL_COLOR = '#d6f1e8';   // pale sea-glass
const SIL_ALPHA = 0.5;
const HALO = 'rgba(190,232,220,';
const SOCKET = 'rgba(8,16,22,0.5)'; // the dark hollow a shell sits in

// the currency shell sprites (same files render.js uses); a tier's `art` names one, 'pearl' is drawn in code
const SHELL_FILES = { blue: 'shell-blue.webp', green: 'shell-green.webp', red: 'shell-red.webp' };
const shellImgs = {};
function shellImg(art) {
  if (!SHELL_FILES[art] || typeof Image === 'undefined') return null;
  let img = shellImgs[art];
  if (!img) { img = shellImgs[art] = new Image(); img.src = new URL('../assets/' + SHELL_FILES[art], import.meta.url).href; }
  return img.complete && img.naturalWidth ? img : null;
}

function drawPearl(ctx, x, y, r) {
  // a matte pearl: soft off-white with a faint warm shade, no shine
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#f6f1e6'); g.addColorStop(1, '#c9c0ae');
  ctx.fillStyle = g; ctx.strokeStyle = '#4a4436'; ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
}

/** The find itself at (x, y) (device px), `ppu` px per tile. */
export function drawFind(ctx, ek, sub, x, y, ppu) {
  if (ek === EK_SHELL) {
    const tier = EMBED_SHELLS[sub] || EMBED_SHELLS[1];
    if (tier.art === 'pearl') { drawPearl(ctx, x, y, 0.17 * ppu); return; }
    const img = shellImg(tier.art);
    const size = ppu * (sub >= 3 ? 0.7 : 0.6);
    if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    else drawPearl(ctx, x, y, 0.15 * ppu);
  } else if (ek === EK_BOMB) {
    drawBombItem(ctx, x - (sub > 1 ? 0.12 * ppu : 0), y, ppu);
    if (sub > 1) drawBombItem(ctx, x + 0.16 * ppu, y + 0.06 * ppu, ppu);
  } else if (ek === EK_ITEM) drawItemIcon(ctx, itemFromCode(sub), x, y, 0.3 * ppu);
}

// silhouettes: the find drawn once into a small canvas and filled with the sea-glass colour (cached per key and size)
const silCache = new Map();
function silhouette(key, ppu, draw) {
  const px = Math.max(8, Math.round(ppu));
  const k = key + '@' + px;
  let c = silCache.get(k);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = c.height = px * 2;
  const g = c.getContext('2d');
  if (!draw(g, px, px, px)) return null; // the sprite is not loaded yet: not cached, a plain blob stands in
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = SIL_COLOR; g.fillRect(0, 0, c.width, c.height);
  if (silCache.size > 64) silCache.clear();
  silCache.set(k, c);
  return c;
}

function findReady(ek, sub) {
  if (ek !== EK_SHELL) return true;
  const tier = EMBED_SHELLS[sub] || EMBED_SHELLS[1];
  return tier.art === 'pearl' || !!shellImg(tier.art);
}

/** A soft silhouette of a find centred on (x, y): halo, then the shape in pale sea-glass. */
function drawSilhouette(ctx, key, x, y, ppu, draw, ready) {
  const halo = ctx.createRadialGradient(x, y, 0.05 * ppu, x, y, 0.55 * ppu);
  halo.addColorStop(0, HALO + '0.24)'); halo.addColorStop(1, HALO + '0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 0.55 * ppu, 0, TAU); ctx.fill();
  const c = ready ? silhouette(key, ppu, draw) : null;
  ctx.globalAlpha = SIL_ALPHA;
  if (c) ctx.drawImage(c, x - c.width / 2, y - c.height / 2);
  else { ctx.fillStyle = SIL_COLOR; ctx.beginPath(); ctx.arc(x, y, 0.16 * ppu, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}

/** Basic shells set into the rock: two or three small ones at hashed spots and angles, each in a dark socket. */
function drawVein(ctx, ek, sub, x0, y0, ppu, seed) {
  const tier = EMBED_SHELLS[sub] || EMBED_SHELLS[1];
  const img = shellImg(tier.art);
  const n = 2 + (seed % 2);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, ppu, ppu); ctx.clip();
  for (let k = 0; k < n; k++) {
    const h1 = ((seed * 31 + k * 97) % 101) / 101, h2 = ((seed * 17 + k * 53) % 89) / 89, h3 = ((seed * 7 + k * 29) % 61) / 61;
    const cx = x0 + (0.22 + h1 * 0.56) * ppu, cy = y0 + (0.22 + h2 * 0.56) * ppu, sz = ppu * (0.3 + h3 * 0.08);
    ctx.fillStyle = SOCKET;
    ctx.beginPath(); ctx.ellipse(cx, cy + sz * 0.08, sz * 0.56, sz * 0.48, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate((h3 - 0.5) * 2.4);
    ctx.globalAlpha = 0.92;
    if (img) ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    else drawPearl(ctx, 0, 0, sz * 0.32);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Per-tile hook: draw the find still buried in tile (tx, ty) into its screen square (x0, y0) of `ppu` px. A basic shell
 * always shows; the rest only with `goggles`. Returns the VIS_* code drawn (VIS_NONE: nothing in this tile, or hidden).
 * @param {ReturnType<import('./embed.js').createEmbedded>['data']} d
 */
export function drawTreasureTile(ctx, d, tx, ty, x0, y0, ppu, goggles) {
  const i = embedAt(d, tx, ty);
  if (i < 0) return VIS_NONE;
  return drawFindInTile(ctx, d, i, x0, y0, ppu, goggles);
}

function drawFindInTile(ctx, d, i, x0, y0, ppu, goggles) {
  const ek = d.ek[i], sub = d.sub[i];
  const vis = embedVisibility(ek, sub, goggles);
  if (vis === VIS_SHOWN) drawVein(ctx, ek, sub, x0, y0, ppu, d.seed[i]);
  else if (vis === VIS_FULL) {
    drawSilhouette(ctx, 'e' + ek + '.' + sub, x0 + ppu / 2, y0 + ppu / 2, ppu, (g, x, y, p) => { drawFind(g, ek, sub, x, y, p); return true; }, findReady(ek, sub));
  }
  return vis;
}

/**
 * @param {ReturnType<import('./embed.js').createEmbedded>['data']} d
 * @param {{goggles:boolean, tileAt:(x:number,y:number)=>number, buried?:boolean, isMainRock?:(x:number,y:number)=>boolean}} opts
 *   buried false: skip the buried finds (a per-tile terrain pass draws them through drawTreasureTile); isMainRock: only
 *   tiles of the main terrain material carry them; shown false: the always-visible basic shells are baked into the walls
 *   by the per-tile hook (materials.js setTileDrawHook), so only the goggles silhouettes and loose finds are drawn live
 */
export function drawEmbedded(ctx, camera, cw, ch, d, opts) {
  const out = { shown: 0, full: 0, loose: 0 };
  const ppu = camera.pxPerUnit;
  const sx = (wx) => cw / 2 + (wx - camera.x) * ppu, sy = (wy) => ch / 2 + (wy - camera.y) * ppu;
  cullView(camera, cw, ch);
  const fl = cullFlags('embed', d.n);
  for (let i = 0; i < d.n; i++) {
    const st = d.state[i];
    if (st !== ES_BURIED && st !== ES_LOOSE) continue;
    if (!visibleAt(fl, i, d.x[i], d.y[i], 1)) continue;
    const ek = d.ek[i], sub = d.sub[i];
    if (st === ES_LOOSE) { drawFind(ctx, ek, sub, sx(d.x[i]), sy(d.y[i]), ppu); out.loose++; continue; }
    if (opts.buried === false) continue;
    if (opts.tileAt && opts.tileAt(d.tx[i], d.ty[i]) === 0) continue; // broken this frame: released next step
    if (opts.isMainRock && !opts.isMainRock(d.tx[i], d.ty[i])) continue;
    if (opts.shown === false && embedVisibility(d.ek[i], d.sub[i], false) === VIS_SHOWN) continue; // baked into the wall by the per-tile hook
    const vis = drawFindInTile(ctx, d, i, sx(d.tx[i]), sy(d.ty[i]), ppu, opts.goggles);
    if (vis === VIS_SHOWN) out.shown++; else if (vis === VIS_FULL) out.full++;
  }
  return out;
}

/**
 * With the goggles: the hidden one-tile pockets' contents (loot.js LK_POCKET) and the sealed vault hollows.
 * @param {ReturnType<import('./loot.js').createLoot>['data']} ld
 * @param {Int16Array|null} vaults level.pockets (x, y, side per 2x2 hollow) @param {number} nVaults
 */
export function drawPocketReveal(ctx, camera, cw, ch, ld, vaults, nVaults, tileAt) {
  const out = { pockets: 0, vaults: 0 };
  const ppu = camera.pxPerUnit;
  const sx = (wx) => cw / 2 + (wx - camera.x) * ppu, sy = (wy) => ch / 2 + (wy - camera.y) * ppu;
  const m = 2 * ppu;
  for (let i = 0; i < ld.n; i++) {
    if (ld.kind[i] !== LK_POCKET || ld.state[i] !== ST_INTACT) continue;
    const x = sx(ld.x[i]), y = sy(ld.y[i]);
    if (x < -m || x > cw + m || y < -m || y > ch + m) continue;
    const aux = ld.aux[i], code = ld.item[i];
    let key, draw;
    if (aux === POCKET_SHELLS) { key = 'p0'; draw = (g, gx, gy, p) => { drawFind(g, EK_SHELL, 1, gx - 0.12 * p, gy, p); drawFind(g, EK_SHELL, 1, gx + 0.14 * p, gy + 0.05 * p, p); return true; }; }
    else if (aux === POCKET_BOMB) { key = 'p1'; draw = (g, gx, gy, p) => { drawBombItem(g, gx, gy, p); return true; }; }
    else if (aux === POCKET_HEART) { key = 'p2'; draw = (g, gx, gy, p) => { drawHeartItem(g, gx, gy, p); return true; }; }
    else if (aux === POCKET_ITEM) { key = 'p3.' + code; draw = (g, gx, gy, p) => { drawItemIcon(g, itemFromCode(code), gx, gy, 0.3 * p); return true; }; }
    else continue;
    drawSilhouette(ctx, key, x, y, ppu, draw, aux !== POCKET_SHELLS || findReady(EK_SHELL, 1));
    out.pockets++;
  }
  for (let i = 0; i < (nVaults || 0); i++) {
    const px = vaults[i * 3], py = vaults[i * 3 + 1];
    // only while it is sealed: some rock is left on all four sides of the hollow
    if (!tileAt(px - 1, py) || !tileAt(px + 2, py) || !tileAt(px, py - 1) || !tileAt(px, py + 2)) continue;
    const x = sx(px + 1), y = sy(py + 1);
    if (x < -m * 2 || x > cw + m * 2 || y < -m * 2 || y > ch + m * 2) continue;
    ctx.save();
    // a soft glow just outside the hollow's rim: a wide faint stroke under a thin one
    ctx.strokeStyle = HALO + '0.12)'; ctx.lineWidth = Math.max(4, ppu * 0.3);
    ctx.beginPath(); ctx.roundRect(x - 1.2 * ppu, y - 1.2 * ppu, 2.4 * ppu, 2.4 * ppu, 0.7 * ppu); ctx.stroke();
    ctx.strokeStyle = HALO + '0.3)'; ctx.lineWidth = Math.max(1.2, ppu * 0.05);
    ctx.stroke();
    ctx.restore();
    out.vaults++;
  }
  return out;
}
