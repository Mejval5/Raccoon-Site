// v2 props: generated Milan-style art (round 24, js/v2-art.js) with the round-22 code drawings as the fallback
// while an image has not loaded: the tutorial's bomb-wall cue,
// the hub quest sign, the shop (keeper, plinths, item icons, prices), the rescue critter and the vault
// cache. Called from main.js's extraDraw hook after enemies and bombs, before the octopus. Device pixels.

import { artImg, COUNTER_SLICES } from './v2-art.js';
import { isItem } from './items.js';
import { drawItemIcon } from './items-draw.js';
import { FN } from './journal-art.js';
import { wrapLines } from './speech.js';
import { visibleAt, cullFlags, cullView } from './cull.js';
import { drawSprite, spriteRect } from './sprites.js';

const TAU = Math.PI * 2;
const INK = '#3a2410';

const shellImg = new Image();
shellImg.src = new URL('../assets/shell-blue.webp', import.meta.url).href;

function view(camera, cw, ch) {
  const ppu = camera.pxPerUnit;
  return { ppu, sx: (wx) => cw / 2 + (wx - camera.x) * ppu, sy: (wy) => ch / 2 + (wy - camera.y) * ppu };
}

function label(ctx, text, x, y, px, fill, stroke = 'rgba(4,20,34,0.85)') {
  ctx.font = `700 ${Math.max(9, Math.round(px))}px Quicksand, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2.5, px * 0.28);
  ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

/** Rubble props (props.js): small grey-brown chips that tumble down and fade out over their last 0.8 s. */
export function drawRubble(ctx, camera, cw, ch, d) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  cullView(camera, cw, ch);
  const fl = cullFlags('rubble', d.n);
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || d.kind[i] !== 7) continue;
    if (!visibleAt(fl, i, d.x[i], d.y[i], 2)) continue; // r43
    const x = sx(d.x[i]), y = sy(d.y[i]);
    const a = Math.min(1, d.timer[i] / 0.8);
    const r = Math.max(1.5, d.radius[i] * ppu * 1.25);
    const rot = d.x[i] * 3 + i;
    ctx.globalAlpha = a;
    ctx.fillStyle = i % 3 === 0 ? '#8d7c6a' : i % 3 === 1 ? '#6f6153' : '#a08e79';
    ctx.strokeStyle = 'rgba(30,22,16,0.8)'; ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const an = rot + k * (TAU / 5), rr = r * (0.7 + 0.5 * (((i * 7 + k * 13) % 5) / 5));
      if (k === 0) ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function bombGlyph(ctx, x, y, r, time) {
  ctx.fillStyle = '#26303a'; ctx.strokeStyle = '#0b1218'; ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.beginPath(); ctx.moveTo(x + r * 0.55, y - r * 0.7); ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.2, x + r * 1.15, y - r * 1.05); ctx.stroke();
  const tw = 0.6 + 0.4 * Math.sin(time * 14);
  ctx.fillStyle = `rgba(255,${170 + Math.round(60 * tw)},60,${0.7 + 0.3 * tw})`;
  ctx.beginPath(); ctx.arc(x + r * 1.15, y - r * 1.05, r * (0.22 + 0.08 * tw), 0, TAU); ctx.fill();
}

function heartGlyph(ctx, x, y, r) {
  ctx.fillStyle = '#ff5a6e'; ctx.strokeStyle = '#5a0f1c'; ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.85);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.8, y - r * 1.05, x, y - r * 0.35);
  ctx.bezierCurveTo(x + r * 0.8, y - r * 1.05, x + r * 1.5, y - r * 0.1, x, y + r * 0.85);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.arc(x - r * 0.45, y - r * 0.25, r * 0.16, 0, TAU); ctx.fill();
}

function shellIcon(ctx, x, y, size) {
  if (shellImg.complete && shellImg.naturalWidth) ctx.drawImage(shellImg, x - size / 2, y - size / 2, size, size);
  else { ctx.fillStyle = '#7fc4ff'; ctx.beginPath(); ctx.arc(x, y, size * 0.4, 0, TAU); ctx.fill(); }
}

export function itemGlyph(ctx, glyph, x, y, r, time) {
  if (isItem(glyph)) drawItemIcon(ctx, glyph, x, y, r * 1.15);
  else if (glyph === 'heart') heartGlyph(ctx, x, y, r);
  else if (glyph === 'bombs3') {
    bombGlyph(ctx, x - r * 0.95, y + r * 0.2, r * 0.62, time);
    bombGlyph(ctx, x + r * 0.95, y + r * 0.2, r * 0.62, time + 1);
    bombGlyph(ctx, x, y - r * 0.15, r * 0.72, time + 2);
  } else bombGlyph(ctx, x, y, r * 0.85, time);
}

/** Deterministic irregular crack polylines through the tile box (x0,y0,w,h): downward wanderers with side branches. */
function makeCracks(x0, y0, w, hgt, count, vertical = true, branchChance = 0.45) {
  let seed = (x0 * 374761393 + y0 * 668265263) >>> 0;
  const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (seed >>> 8) / 16777216; };
  const cracks = [];
  for (let k = 0; k < count; k++) {
    // vertical: cracks run down the box; otherwise they run across it (x and y swapped while building)
    const A = vertical ? w : hgt, B = vertical ? hgt : w;
    let pa = 0.25 + rnd() * (A - 0.5), pb = (k + rnd() * 0.6) * (B / count);
    const pts = [], branches = [];
    const put = (a, b) => (vertical ? [x0 + a, y0 + b] : [x0 + b, y0 + a]);
    pts.push(...put(pa, pb));
    const len = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < len; j++) {
      pa = Math.min(A - 0.05, Math.max(0.05, pa + (rnd() - 0.5) * 0.9));
      pb += 0.35 + rnd() * 0.75;
      pts.push(...put(pa, pb));
      if (rnd() < branchChance) branches.push([...put(pa, pb), ...put(pa + (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.5), pb + 0.2 + rnd() * 0.5)]);
    }
    cracks.push({ pts, branches });
  }
  return cracks;
}

/** r36: one short zig-zag crack (4-5 hard turns, a side branch) inside the tile box, along its long axis; never reaches the box edge. */
export function makeZigCrack(x0, y0, w, hgt, vertical) {
  let seed = (x0 * 374761393 + y0 * 668265263 + 17) >>> 0;
  const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (seed >>> 8) / 16777216; };
  const A = vertical ? w : hgt, B = vertical ? hgt : w;   // across, along
  const put = (a, b) => (vertical ? [x0 + a, y0 + b] : [x0 + b, y0 + a]);
  let pa = A * (0.35 + rnd() * 0.3), pb = B * 0.2;
  const pts = [...put(pa, pb)], branches = [];
  const turns = 4 + Math.floor(rnd() * 2);
  for (let j = 0; j < turns; j++) {
    pa = Math.min(A * 0.9, Math.max(A * 0.1, pa + (j % 2 ? 1 : -1) * (0.22 + rnd() * 0.2)));
    pb += B * (0.45 / turns) + rnd() * 0.06;
    pts.push(...put(pa, pb));
    if (j === 1) branches.push([...put(pa, pb), ...put(pa + (rnd() < 0.5 ? -1 : 1) * (0.22 + rnd() * 0.12), pb + 0.14 + rnd() * 0.1)]);
  }
  return [{ pts, branches }];
}

function strokeCracks(ctx, sx, sy, ppu, cracks, soft = false) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // soft: a thin crack in a darker shade of the rock, no bright edge (the vault wall: cracked rock, not a shatter mark)
  const passes = soft
    ? [[Math.max(1.2, ppu * 0.035), 'rgba(18,40,50,0.55)']]
    : [[Math.max(2, ppu * 0.06), 'rgba(12,6,20,0.45)'], [Math.max(1, ppu * 0.022), 'rgba(255,238,205,0.5)']];
  for (const [lw, style] of passes) {
    ctx.strokeStyle = style; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const c of cracks) {
      ctx.moveTo(sx(c.pts[0]), sy(c.pts[1]));
      for (let i = 2; i < c.pts.length; i += 2) ctx.lineTo(sx(c.pts[i]), sy(c.pts[i + 1]));
      for (const b of c.branches) { ctx.moveTo(sx(b[0]), sy(b[1])); ctx.lineTo(sx(b[2]), sy(b[3])); }
    }
    ctx.stroke();
  }
}

/**
 * Crack marks on the two rock tiles between a sealed pocket and the spot you bomb it from (same crack style as
 * the tutorial wall), so a bombable pocket reads as a weak wall instead of a lit window. Standing rock only.
 * @param {Int16Array} pockets x, y, entrance side (ANCH_*) per pocket
 */
export function drawPocketCracks(ctx, camera, cw, ch, pockets, n, tileAt) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const inset = Math.max(3, ppu * 0.12);
  for (let i = 0; i < n; i++) {
    const px = pockets[i * 3], py = pockets[i * 3 + 1], side = pockets[i * 3 + 2];
    // the two rock tiles on the entrance side (columns for left/right, rows for up/down)
    let bx, by, bw, bh;
    if (side === 3) { bx = px - 2; by = py; bw = 2; bh = 2; }
    else if (side === 4) { bx = px + 2; by = py; bw = 2; bh = 2; }
    else if (side === 1) { bx = px; by = py - 2; bw = 2; bh = 2; }
    else { bx = px; by = py + 2; bw = 2; bh = 2; }
    const x = sx(bx), y = sy(by);
    if (x < -ppu * 3 || x > cw + ppu * 3 || y < -ppu * 3 || y > ch + ppu * 3) continue;
    ctx.save();
    ctx.beginPath();
    for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) {
      if (tileAt(bx + dx, by + dy) === 0) continue;
      const l = tileAt(bx + dx - 1, by + dy) === 0, r = tileAt(bx + dx + 1, by + dy) === 0;
      const u = tileAt(bx + dx, by + dy - 1) === 0, d = tileAt(bx + dx, by + dy + 1) === 0;
      const x0 = sx(bx + dx) + (l ? inset : -1), x1 = sx(bx + dx + 1) - (r ? inset : -1);
      const y0 = sy(by + dy) + (u ? inset : -1), y1 = sy(by + dy + 1) - (d ? inset : -1);
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.clip();
    // r36: a short jagged crack with a branch, kept inside the tile NEXT TO the pocket (the far end of the two-tile
    // box). It used to run the whole box and end on the ground the entrance stands on, so over a hanging urchin or
    // horns it read as a rope holding it. The crack box is the tile beside the pocket; the entrance tile stays clean.
    let cx0 = bx, cy0 = by, cw0 = bw, ch0 = bh;
    if (side === 3) { cx0 = bx + 1; cw0 = 1; } else if (side === 4) { cx0 = bx; cw0 = 1; }
    else if (side === 1) { cy0 = by + 1; ch0 = 1; } else { cy0 = by; ch0 = 1; }
    strokeCracks(ctx, sx, sy, ppu, makeZigCrack(cx0, cy0, cw0, ch0, side === 1 || side === 2), true);
    ctx.restore();
  }
}

/**
 * The tutorial's bomb wall: a lighter tint, code-drawn crack lines and a pulsing bomb marker, so the wall
 * reads as "breakable" instead of plain rock. Wall tiles that are already gone are skipped.
 * @param {{walls:Int16Array, tileAt:(x:number,y:number)=>number, attention:number}} cue attention 0..1 (idle hint: pulse harder)
 */
export function drawWallCue(ctx, camera, cw, ch, cue, time) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const walls = cue.walls;
  const open = (x, y) => cue.tileAt(x, y) === 0;
  let n = 0, cx = 0, cy = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const inset = Math.max(3, ppu * 0.12); // keep the green rim of the water faces visible
  // one clip over the standing wall cells (inset from water faces), so the tint stays a faint hint and the rim shows
  ctx.save();
  ctx.beginPath();
  let any = false;
  // r41: the barrier is a floor (wider than tall) or a wall (taller than wide); the cracks run across the water-facing cells either way
  let wMinX = 1e9, wMaxX = -1e9, wMinY = 1e9, wMaxY = -1e9;
  for (let i = 0; i < walls.length; i += 2) { wMinX = Math.min(wMinX, walls[i]); wMaxX = Math.max(wMaxX, walls[i]); wMinY = Math.min(wMinY, walls[i + 1]); wMaxY = Math.max(wMaxY, walls[i + 1]); }
  const horiz = wMaxX - wMinX > wMaxY - wMinY;
  const crackRects = []; // cells that border water along the passage: cracks stay on the barrier, never on the rock around it
  let cMinY = 1e9, cMaxY = -1e9, cMinX = 1e9, cMaxX = -1e9;
  for (let i = 0; i < walls.length; i += 2) {
    const tx = walls[i], ty = walls[i + 1];
    if (open(tx, ty)) continue;
    n++; cx += tx + 0.5; cy += ty + 0.5;
    if (tx < minX) minX = tx; if (tx > maxX) maxX = tx; if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
    const l = open(tx - 1, ty), r = open(tx + 1, ty), u = open(tx, ty - 1), d = open(tx, ty + 1);
    if (horiz ? (u || d) : (l || r)) { if (ty < cMinY) cMinY = ty; if (ty > cMaxY) cMaxY = ty; if (tx < cMinX) cMinX = tx; if (tx > cMaxX) cMaxX = tx; }
    const x = sx(tx), y = sy(ty);
    if (x < -ppu || x > cw + ppu || y < -ppu || y > ch + ppu) continue;
    // the rect grows into neighbouring wall cells (no seams) and stays inset from water faces
    const x0 = x + (l ? inset : -1), x1 = x + ppu - (r ? inset : -1);
    const y0 = y + (u ? inset : -1), y1 = y + ppu - (d ? inset : -1);
    ctx.rect(x0, y0, x1 - x0, y1 - y0); any = true;
    if (horiz ? (u || d) : (l || r)) crackRects.push(x0, y0, x1 - x0, y1 - y0);
  }
  if (any) {
    ctx.clip();
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(255,232,190,${0.01 + 0.012 * pulse + 0.05 * cue.attention})`;
    ctx.fillRect(0, 0, cw, ch);
    const crackImg = artImg('crackWall');
    ctx.restore(); ctx.save();
    ctx.beginPath();
    for (let k = 0; k < crackRects.length; k += 4) ctx.rect(crackRects[k], crackRects[k + 1], crackRects[k + 2], crackRects[k + 3]);
    ctx.clip();
    if (!crackRects.length) { /* nothing borders water: no cracks */ }
    else if (crackImg) {
      // generated crack sprite, repeated down the wall in 4 tile segments (alternate flips and sway), inside the clip
      const segH = 4, segW = segH * (crackImg.naturalWidth / crackImg.naturalHeight);
      ctx.globalAlpha = 0.9;
      if (horiz) {
        // a floor: the (tall) crack sprite lies on its side, repeated along the floor
        const mid = (cMinY + cMaxY + 1) / 2;
        for (let k = 0, x = cMinX; x < cMaxX + 1; x += segH - 0.2, k++) {
          const flip = k & 1, jy = ((k * 7) % 5 - 2) * 0.12;
          ctx.save();
          ctx.translate(sx(x), sy(mid + jy));
          ctx.rotate(-Math.PI / 2);
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(crackImg, -segW * ppu / 2, 0, segW * ppu, segH * ppu);
          ctx.restore();
        }
      } else {
        const mid = (cMinX + cMaxX + 1) / 2;
        for (let k = 0, y = cMinY; y < cMaxY + 1; y += segH - 0.2, k++) {
          const flip = k & 1, jx = ((k * 7) % 5 - 2) * 0.18;
          ctx.save();
          ctx.translate(sx(mid + jx), sy(y));
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(crackImg, -segW * ppu / 2, 0, segW * ppu, segH * ppu);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    } else {
      // a few irregular cracks running through the whole wall (world space, deterministic)
      strokeCracks(ctx, sx, sy, ppu, makeCracks(cMinX, cMinY, cMaxX - cMinX + 1, cMaxY - cMinY + 1, Math.max(2, Math.round((horiz ? cMaxX - cMinX + 1 : cMaxY - cMinY + 1) / 3)), !horiz));
    }
  }
  ctx.restore();
  if (!n) return;
  // pulsing bomb marker on the wall's middle, with a ring that grows and fades
  const mx = sx(cx / n), my = sy(cy / n);
  const p = (time * (0.9 + 0.8 * cue.attention)) % 1;
  ctx.strokeStyle = `rgba(255,214,120,${(1 - p) * (0.75 + 0.25 * cue.attention)})`;
  ctx.lineWidth = Math.max(2, ppu * 0.1);
  ctx.beginPath(); ctx.arc(mx, my, ppu * (0.4 + 0.4 * p), 0, TAU); ctx.stroke(); // the ring stays inside the 2 tile thick barrier
  const s = 1 + 0.08 * Math.sin(time * 5);
  ctx.fillStyle = 'rgba(6,22,34,0.75)';
  ctx.beginPath(); ctx.arc(mx, my, ppu * 0.6 * s, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffd678'; ctx.lineWidth = Math.max(1.5, ppu * 0.07);
  ctx.beginPath(); ctx.arc(mx, my, ppu * 0.6 * s, 0, TAU); ctx.stroke();
  bombGlyph(ctx, mx - ppu * 0.04, my + ppu * 0.06, ppu * 0.3 * s, time);
}

/**
 * Pip (round 38): a small round friend with fins and eyes. Caged until you touch it: the cage RESTS ON THE FLOOR (a base
 * plank with feet, bars, a lid), the critter sits inside it; once free it just swims. (x, y) is the critter's centre,
 * `cageFloor` the floor line the cage stands on (0 = no cage). variant 'mama' is the big orange mother.
 */
export function drawCritter(ctx, camera, cw, ch, x, y, following, time, cageFloor = 0, variant = '') {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const mama = variant === 'mama';
  const caged = !following && cageFloor > 0;
  const bob = Math.sin(time * 3.1 + x) * ppu * (caged ? 0.025 : 0.06);
  const cx = sx(x), cy = sy(y) + bob, r = ppu * (mama ? 0.27 : 0.19); // Pip is about 0.7x the octopus
  if (cx < -ppu * 3 || cx > cw + ppu * 3 || cy < -ppu * 3 || cy > ch + ppu * 3) return;
  const lw = Math.max(1.5, ppu * 0.06);
  ctx.lineJoin = 'round';
  // r46: Milan's own fish (FishGreen; the mother is his FishYellow, warmed to orange): a bob and a little fin-flap tilt
  if (spriteRect(mama ? 'pipMama' : 'pip')) {
    const tilt = Math.sin(time * (caged ? 2.4 : 4.2) + x) * (caged ? 0.05 : 0.1);
    if (caged) drawCage(ctx, camera, cw, ch, x, cageFloor, mama ? 1.7 : 1.25, mama ? 1.55 : 1.15, false); // the back of the cage
    drawSprite(ctx, mama ? 'pipMama' : 'pip', cx, cy, r * 3.2, 0, 0.5, 0.5, tilt);
    if (caged) { // the front bars, see-through enough that Pip reads behind them
      ctx.save(); ctx.globalAlpha = 0.5;
      drawCage(ctx, camera, cw, ch, x, cageFloor, mama ? 1.7 : 1.25, mama ? 1.55 : 1.15, false);
      ctx.restore();
    }
    return;
  }
  const flap = Math.sin(time * 9) * 0.25;
  const body = mama ? '#f2b08e' : '#86e6d2', fin = mama ? '#d9805e' : '#58c8b8', edge = mama ? '#5a2a1c' : '#0c3a3c';
  ctx.fillStyle = fin; ctx.strokeStyle = edge; ctx.lineWidth = lw;
  for (const sd of [-1, 1]) { // fins
    ctx.beginPath(); ctx.ellipse(cx + sd * r * 1.0, cy + r * 0.1, r * 0.5, r * 0.28, sd * (0.6 + flap), 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = body; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#eafffa';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sd * r * 0.38, cy - r * 0.12, r * 0.22, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#0c2a2c';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sd * r * 0.4, cy - r * 0.1, r * 0.1, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, lw * 0.7);
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.2, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  if (caged) drawCage(ctx, camera, cw, ch, x, cageFloor, mama ? 1.7 : 1.25, mama ? 1.55 : 1.15, false);
}

/** A cage resting on the floor line `floorY` (world units): base plank on two feet, vertical bars, a lid. w, h in tiles. */
export function drawCage(ctx, camera, cw, ch, x, floorY, w, h, open) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const cx = sx(x), fy = sy(floorY);
  if (cx < -ppu * 3 || cx > cw + ppu * 3 || fy < -ppu * 3 || fy > ch + ppu * 4) return;
  if (spriteRect(open ? 'cageOpen' : 'cage')) { // r46: driftwood planks and whale-bone bars lashed with kelp (generated, Milan style)
    ctx.fillStyle = 'rgba(6,14,22,0.3)'; ctx.beginPath(); ctx.ellipse(cx, fy - 1, w * ppu * 0.53, ppu * 0.07, 0, 0, TAU); ctx.fill();
    drawSprite(ctx, open ? 'cageOpen' : 'cage', cx, fy + ppu * 0.03, w * ppu * (open ? 245 / 250 : 1), h * ppu);
    return;
  }
  const hw = w * ppu / 2, hh = h * ppu, lw = Math.max(1.5, ppu * 0.05);
  const feet = ppu * 0.07, top = fy - feet - hh;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // soft contact shadow
  ctx.fillStyle = 'rgba(6,14,22,0.3)'; ctx.beginPath(); ctx.ellipse(cx, fy - 1, hw * 1.05, ppu * 0.07, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3d2c18'; // two feet on the floor
  for (const sd of [-1, 1]) ctx.fillRect(cx + sd * hw * 0.78 - ppu * 0.05, fy - feet, ppu * 0.1, feet);
  if (!open) {
    ctx.strokeStyle = '#7e5c30'; ctx.lineWidth = lw;
    ctx.beginPath();
    const n = Math.max(4, Math.round(w * 3.4));
    for (let i = 0; i <= n; i++) { const bx = cx - hw + (2 * hw) * i / n; ctx.moveTo(bx, top); ctx.lineTo(bx, fy - feet); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,170,0.35)'; ctx.lineWidth = Math.max(1, ppu * 0.02);
    ctx.beginPath(); ctx.moveTo(cx - hw + lw, top); ctx.lineTo(cx - hw + lw, fy - feet); ctx.stroke();
  } else {
    ctx.strokeStyle = '#7e5c30'; ctx.lineWidth = lw; // the open cage: two posts and the lid, the door swung aside
    ctx.beginPath(); ctx.moveTo(cx - hw, top); ctx.lineTo(cx - hw, fy - feet); ctx.moveTo(cx + hw, top); ctx.lineTo(cx + hw, fy - feet); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + hw, top + hh * 0.15); ctx.lineTo(cx + hw + ppu * 0.28, top + hh * 0.45); ctx.stroke();
    // the broken bars: stubs standing from the base and hanging from the lid, with jagged tips (a dash or a blast snapped them)
    ctx.strokeStyle = '#7e5c30'; ctx.lineWidth = Math.max(1, lw * 0.8);
    ctx.beginPath();
    const nb = Math.max(3, Math.round(w * 2.4));
    for (let i = 1; i < nb; i++) {
      const bx = cx - hw + (2 * hw) * i / nb, up = hh * (0.18 + 0.1 * ((i * 7) % 3)), dn = hh * (0.12 + 0.08 * ((i * 5) % 3));
      ctx.moveTo(bx, fy - feet); ctx.lineTo(bx, fy - feet - up); ctx.lineTo(bx + ppu * 0.03, fy - feet - up - ppu * 0.05);
      ctx.moveTo(bx + ppu * 0.04, top); ctx.lineTo(bx + ppu * 0.04, top + dn); ctx.lineTo(bx - ppu * 0.02, top + dn + ppu * 0.04);
    }
    ctx.stroke();
  }
  // lid and base plank
  ctx.fillStyle = '#5a4020'; ctx.strokeStyle = '#2a1808'; ctx.lineWidth = Math.max(1, lw * 0.7);
  ctx.beginPath(); ctx.roundRect(cx - hw - ppu * 0.05, top - ppu * 0.07, 2 * hw + ppu * 0.1, ppu * 0.1, ppu * 0.03); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(cx - hw - ppu * 0.05, fy - feet - ppu * 0.08, 2 * hw + ppu * 0.1, ppu * 0.1, ppu * 0.03); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/**
 * Marlo, the diver (round 38). (x, y) is where his feet are, in world units. `sealed`: stuck in the rock pocket, small,
 * arms at his sides and bubbles from his helmet; otherwise he stands on a floor, planted, with an idle bob of the upper body
 * and one arm waving when `freed`.
 */
/** Marlo's size: his helmet top is 1.14 u above his feet, so about 1.05 tiles tall. */
export const DIVER_SCALE = 0.92;
export function drawDiver(ctx, camera, cw, ch, x, y, time, freed = false, sealed = false, skipFrontArm = false) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const cx = sx(x), cy = sy(y);
  if (cx < -ppu * 2 || cx > cw + ppu * 2 || cy < -ppu * 3 || cy > ch + ppu * 2) return;
  if (spriteRect('marlo')) { // r46: generated, Milan style; one size everywhere, feet planted, a breath, a rocking wave when free
    const u = ppu * DIVER_SCALE, hgt = u * 1.2, waving = freed && !sealed;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 1 + Math.sin(time * 1.7) * 0.012);
    drawSprite(ctx, waving ? 'marloWave' : 'marlo', 0, 0, 0, hgt, 0.5, 1, waving ? Math.sin(time * 5) * 0.04 : 0);
    ctx.restore();
    if (sealed || freed) diverBubbles(ctx, cx, cy, u, time, sealed);
    return;
  }
  const lw = Math.max(1.5, ppu * 0.055);
  const bob = Math.sin(time * 1.7) * ppu * 0.02;
  const u = ppu * DIVER_SCALE; // r40: one size everywhere (sealed, freed, in the hub)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // legs / flippers: planted, they do not bob
  ctx.fillStyle = '#b87a2a'; ctx.strokeStyle = '#2a1808'; ctx.lineWidth = lw;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * u * 0.13, -u * 0.12, u * 0.1, u * 0.14, sd * 0.12, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.translate(0, bob);
  // body
  ctx.fillStyle = '#e0a94a';
  ctx.beginPath(); ctx.roundRect(-u * 0.27, -u * 0.62, u * 0.54, u * 0.52, u * 0.16); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a4f14'; ctx.fillRect(-u * 0.27, -u * 0.34, u * 0.54, u * 0.07);
  // arms: at his sides while sealed, one waving when free
  const wave = freed ? Math.sin(time * 6) * 0.35 : 0;
  const arm = (x0, y0, x1, y1) => {
    ctx.strokeStyle = '#2a1808'; ctx.lineWidth = u * 0.17; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#e0a94a'; ctx.lineWidth = u * 0.11; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  if (sealed && !freed) { arm(-u * 0.24, -u * 0.5, -u * 0.31, -u * 0.18); arm(u * 0.24, -u * 0.5, u * 0.31, -u * 0.18); }
  else {
    arm(-u * 0.24, -u * 0.5, -u * 0.46, -u * (freed ? 0.78 : 0.3) + wave * u * 0.2);
    if (!skipFrontArm) arm(u * 0.24, -u * 0.5, u * 0.36, -u * 0.22); // npcs-draw.js holds his harpoon gun with that arm instead
  }
  // helmet
  ctx.strokeStyle = '#2a1808'; ctx.lineWidth = lw;
  ctx.fillStyle = '#c9d6df'; ctx.beginPath(); ctx.arc(0, -u * 0.82, u * 0.32, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#26465f'; ctx.beginPath(); ctx.ellipse(u * 0.03, -u * 0.82, u * 0.2, u * 0.17, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-u * 0.05, -u * 0.88, u * 0.045, 0, TAU); ctx.fill();
  // bubbles from the helmet
  ctx.restore();
  if (sealed || freed) diverBubbles(ctx, cx, cy + bob, u, time, sealed);
}

/** Bubbles rising from Marlo's helmet; (cx, cy) are his feet in device px, u his size unit. */
function diverBubbles(ctx, cx, cy, u, time, sealed) {
  ctx.strokeStyle = 'rgba(215,242,255,0.8)'; ctx.lineWidth = Math.max(1, u * 0.025);
  for (let i = 0; i < 3; i++) {
    const ph = (time * 0.6 + i / 3) % 1;
    ctx.beginPath(); ctx.arc(cx + u * (0.18 + Math.sin(ph * 6 + i) * 0.05), cy - u * (1.25 + ph * (sealed ? 0.45 : 0.7)), u * (0.04 + 0.04 * ph), 0, TAU); ctx.stroke();
  }
}

/**
 * r46: where the eyes are on the NPC sprites (sprites.js), so the hostile look and the corpse X-eyes (npcs-draw.js) sit on them.
 * Returns [[dx, dy, r], ...] in device px from the NPC's drawing anchor (Marlo: his feet; Pip: his centre; Quill and the pool host:
 * the floor line they stand on), unflipped unless `flip`; null while the atlas has not loaded (the code drawings are in use).
 * `lost`: the pool host's drooping pose (state PL_LOST: smaller, leaning 0.12 rad).
 */
export function npcSpriteEyes(who, ppu, flip = false, lost = true) {
  const m = flip ? -1 : 1;
  if (who === 'marlo') {
    if (!spriteRect('marlo')) return null;
    const h = ppu * DIVER_SCALE * 1.2, w = h * 103 / 160;
    return [[m * (0.397 - 0.5) * w, -(1 - 0.357) * h, 0.06 * w], [m * (0.604 - 0.5) * w, -(1 - 0.359) * h, 0.06 * w]];
  }
  if (who === 'pip') {
    if (!spriteRect('pip')) return null;
    const w = ppu * 0.19 * 3.2, h = w * 75 / 90;
    return [[m * (0.699 - 0.5) * w, (0.468 - 0.5) * h, 0.12 * w]];
  }
  if (who === 'quill') {
    if (!spriteRect('quill')) return null;
    const h = ppu * QUILL_H, w = h * 158 / 190, top = -h + ppu * 0.04;
    return [[m * (0.318 - 0.5) * w, top + 0.494 * h, 0.12 * w], [m * (0.587 - 0.5) * w, top + 0.557 * h, 0.085 * w]];
  }
  if (who === 'host') {
    if (!spriteRect('host')) return null;
    const h = ppu * (lost ? 1.08 : 1.15), w = h * 87 / 176, rot = lost ? 0.12 : 0, c = Math.cos(rot), s = Math.sin(rot);
    return [[0.39, 0.26], [0.46, 0.25]].map(([fx, fy]) => {
      const x = m * (fx - 0.5) * w, y = -(1 - fy) * h;
      return [x * c - y * s, x * s + y * c - ppu * 0.08, 0.035 * w];
    });
  }
  return null;
}

/** r46: Quill's height in tiles (his sprite; the old drawing was about 1.05). */
export const QUILL_H = 1.2;

/** Quill, the collector: a fussy old octopus with a monocle, standing on the floor line `floorY` at x. `lantern`: his glowing lantern beside him (the last stage). */
export function drawCollector(ctx, camera, cw, ch, x, floorY, time, lantern = false, shadow = true) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const cx = sx(x), fy = sy(floorY);
  if (cx < -ppu * 3 || cx > cw + ppu * 3 || fy < -ppu * 3 || fy > ch + ppu * 4) return;
  const k = ppu * 0.64, bob = Math.sin(time * 1.4) * ppu * 0.02;
  if (shadow) { ctx.fillStyle = 'rgba(6,14,22,0.3)'; ctx.beginPath(); ctx.ellipse(cx, fy - 1, k * 0.95, ppu * 0.08, 0, 0, TAU); ctx.fill(); } // no floor shadow under a corpse
  if (spriteRect('quill')) { // r46: Milan's intro-screen octopus (OctoBG1) in Quill's purple, a slow bob and a sea-glass monocle
    const hgt = ppu * QUILL_H, wid = hgt * 158 / 190, top = fy - hgt + ppu * 0.04 + bob;
    if (lantern) drawHubLantern(ctx, cx + wid * 0.85, fy, ppu, time); // first: its glow is behind him, not a haze over him
    ctx.save();
    ctx.translate(cx, fy + ppu * 0.04);
    ctx.scale(1 + Math.sin(time * 1.4) * 0.012, 1 - Math.sin(time * 1.4) * 0.012);
    drawSprite(ctx, 'quill', 0, bob, 0, hgt);
    ctx.restore();
    const mx = cx - wid / 2 + wid * 0.587, my = top + hgt * 0.557, mr = wid * 0.11;
    ctx.fillStyle = 'rgba(190,235,225,0.22)'; ctx.strokeStyle = '#1c1426'; ctx.lineWidth = Math.max(1.5, ppu * 0.035);
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineWidth = Math.max(1, ppu * 0.015); // the cord
    ctx.beginPath(); ctx.moveTo(mx + mr * 0.7, my + mr * 0.7); ctx.quadraticCurveTo(mx + mr * 1.6, my + mr * 2.6, mx + mr * 0.4, my + mr * 3.4); ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(cx, fy - k * 1.05 + bob); ctx.scale(k, k);
  FN.collector(ctx);
  ctx.restore();
  if (lantern) drawHubLantern(ctx, cx + k * 1.35, fy, ppu, time);
}

/** A lantern standing on the floor with a warm glow (Quill's reward in the hub). */
export function drawHubLantern(ctx, cx, fy, ppu, time) {
  const flick = 0.85 + 0.15 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
  const gy = fy - ppu * 0.38;
  const g = ctx.createRadialGradient(cx, gy, 0, cx, gy, ppu * 2.2);
  g.addColorStop(0, `rgba(255,214,120,${0.55 * flick})`); g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, gy, ppu * 2.2, 0, TAU); ctx.fill();
  drawItemIcon(ctx, 'lantern', cx, fy - ppu * 0.32, ppu * 0.36);
}

/** Marlo's air tank: a dented green cylinder with a valve (lying on the floor, trailing the octopus, or standing in the hub). (x, y) is its centre. */
export function drawTank(ctx, camera, cw, ch, x, y, time, floorShadow = false) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const cx = sx(x), cy = sy(y) + Math.sin(time * 2.2 + x) * ppu * (floorShadow ? 0 : 0.04);
  if (cx < -ppu * 2 || cx > cw + ppu * 2 || cy < -ppu * 2 || cy > ch + ppu * 2) return;
  const lw = Math.max(1.5, ppu * 0.045);
  if (floorShadow) { ctx.fillStyle = 'rgba(6,14,22,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + ppu * 0.36, ppu * 0.28, ppu * 0.06, 0, 0, TAU); ctx.fill(); }
  if (drawSprite(ctx, 'tank', cx, cy + ppu * 0.37, 0, ppu * 0.76)) return; // r46: generated, Milan style
  ctx.save(); ctx.translate(cx, cy); ctx.lineJoin = 'round';
  ctx.strokeStyle = '#13301f'; ctx.lineWidth = lw;
  ctx.fillStyle = '#4c9a63';
  ctx.beginPath(); ctx.roundRect(-ppu * 0.17, -ppu * 0.26, ppu * 0.34, ppu * 0.62, ppu * 0.15); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7ec48f'; ctx.fillRect(-ppu * 0.1, -ppu * 0.2, ppu * 0.05, ppu * 0.46);
  ctx.fillStyle = '#2f6b44'; ctx.fillRect(-ppu * 0.17, ppu * 0.0, ppu * 0.34, ppu * 0.05); // band
  ctx.strokeStyle = '#13301f'; ctx.beginPath(); ctx.moveTo(ppu * 0.02, -ppu * 0.12); ctx.lineTo(ppu * 0.09, -ppu * 0.05); ctx.lineTo(ppu * 0.03, ppu * 0.03); ctx.stroke(); // the dent
  ctx.fillStyle = '#c9b06a'; ctx.beginPath(); ctx.roundRect(-ppu * 0.06, -ppu * 0.38, ppu * 0.12, ppu * 0.14, ppu * 0.03); ctx.fill(); ctx.stroke(); // valve
  ctx.restore();
}

/**
 * A speech bubble over an NPC: parchment, an ink outline and a tail down to (x, y) (the head, world units). `name` is
 * the speaker in small type above the text. Clamped to the screen so a line near an edge stays readable.
 */
export function drawSpeech(ctx, camera, cw, ch, x, y, text, alpha, name = '') {
  if (!text || alpha <= 0.01) return;
  const { ppu, sx, sy } = view(camera, cw, ch);
  const ax = sx(x), ay = sy(y);
  const k = ctx.canvas && ctx.canvas.clientWidth ? ctx.canvas.width / ctx.canvas.clientWidth : 1; // device px per css px: the type stays readable on a phone
  // the safe area keeps a bubble clear of the HUD row (hearts / stats) and of the pause, mute and gear buttons in the top right
  const safeT = 64 * k, safeR = 62 * k, btnB = 172 * k, edge = 8 * k;
  if (ax < -ppu * 12 || ax > cw + ppu * 12 || ay < -ppu * 12 || ay > ch + ppu * 12) return;
  // a speaker outside the safe area (off screen, or under the HUD): a small edge arrow towards them instead of a clamped bubble
  if (ax < edge || ax > cw - edge || ay < safeT || ay > ch - edge) { drawSpeechArrow(ctx, cw, ch, ax, ay, alpha, k, safeT, safeR, btnB); return; }
  const px = Math.round(k * Math.max(13, Math.min(17, ppu / k * 0.26))), pad = Math.round(px * 0.6);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${px}px Quicksand, sans-serif`;
  const rows = wrapLines(text, 24);
  const nameH = name ? Math.round(px * 0.85) : 0;
  let wMax = 0;
  for (const r of rows) wMax = Math.max(wMax, ctx.measureText(r).width);
  const bw = Math.max(wMax, name ? ctx.measureText(name).width * 0.85 : 0) + pad * 2, lh = Math.round(px * 1.25), bh = rows.length * lh + pad * 2 + nameH;
  const tail = Math.round(px * 0.7);
  const by = Math.max(safeT, ay - ppu * 0.1 - tail - bh);
  let bx = ax - bw / 2; bx = Math.max(edge, Math.min((by < btnB ? cw - safeR : cw - edge) - bw, bx));
  ctx.lineJoin = 'round'; ctx.lineWidth = 2 * k;
  ctx.fillStyle = 'rgba(252,246,226,0.97)'; ctx.strokeStyle = '#3a2a1b';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10 * k);
  const tx = Math.max(bx + 14 * k, Math.min(bx + bw - 14 * k, ax));
  ctx.moveTo(tx - 7 * k, by + bh); ctx.lineTo(ax, Math.max(by + bh + 2, ay - ppu * 0.08)); ctx.lineTo(tx + 7 * k, by + bh);
  ctx.fill(); ctx.stroke();
  // erase the outline under the tail's base so the bubble and tail read as one shape
  ctx.fillStyle = 'rgba(252,246,226,0.97)'; ctx.fillRect(tx - 6 * k, by + bh - 1.5 * k, 12 * k, 3 * k);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let ty = by + pad;
  if (name) { ctx.font = `700 ${Math.round(px * 0.85)}px Quicksand, sans-serif`; ctx.fillStyle = '#a8412c'; ctx.fillText(name, bx + bw / 2, ty + nameH / 2); ty += nameH; ctx.font = `700 ${px}px Quicksand, sans-serif`; }
  ctx.fillStyle = '#2a1d12';
  for (const r of rows) { ctx.fillText(r, bx + bw / 2, ty + lh / 2); ty += lh; }
  ctx.restore();
}

/** A small speech-bubble badge on the edge of the safe area, with a pointer towards a speaker that is off screen. */
function drawSpeechArrow(ctx, cw, ch, ax, ay, alpha, k, safeT, safeR, btnB) {
  const r = 13 * k, m = r + 10 * k;
  const minX = m, maxX = cw - safeR - r, minY = safeT + r, maxY = ch - m;
  // clamp to the safe rect; the right edge column sits below the buttons
  let ex = Math.max(minX, Math.min(maxX, ax)), ey = Math.max(minY, Math.min(maxY, ay));
  if (ax > cw - safeR && ey < btnB + r) ey = Math.min(maxY, btnB + r);
  const ang = Math.atan2(ay - ey, ax - ex);
  ctx.save();
  ctx.globalAlpha = alpha * 0.95;
  ctx.lineJoin = 'round'; ctx.lineWidth = 2 * k; ctx.strokeStyle = '#3a2a1b'; ctx.fillStyle = 'rgba(252,246,226,0.97)';
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1d12';
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(ex + i * 5 * k, ey, 1.8 * k, 0, TAU); ctx.fill(); }
  // the pointer
  ctx.fillStyle = 'rgba(252,246,226,0.97)';
  ctx.beginPath();
  ctx.moveTo(ex + Math.cos(ang - 0.45) * r * 1.05, ey + Math.sin(ang - 0.45) * r * 1.05);
  ctx.lineTo(ex + Math.cos(ang) * (r + 9 * k), ey + Math.sin(ang) * (r + 9 * k));
  ctx.lineTo(ex + Math.cos(ang + 0.45) * r * 1.05, ey + Math.sin(ang + 0.45) * r * 1.05);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** r46: a price as a shell and a number in plain sand-coloured type (no pill, no gold); muted brick red when it is too dear. */
function priceTag(ctx, px, ty, price, afford, ppu) {
  const text = String(price);
  ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.36))}px Quicksand, sans-serif`;
  const tw = ctx.measureText(text).width, w = tw + ppu * 0.42;
  ctx.globalAlpha = afford ? 1 : 0.75;
  shellIcon(ctx, px - w / 2 + ppu * 0.15, ty, ppu * 0.34);
  ctx.globalAlpha = 1;
  label(ctx, text, px - w / 2 + ppu * 0.36 + tw / 2, ty + ppu * 0.02, ppu * 0.36, afford ? '#f1e4c3' : '#d98c78', 'rgba(20,14,10,0.85)');
}

/**
 * The shop: a hanging sign with a painted shell (r46: was the word SHOP), the keeper (a round friendly shell-back critter), a low
 * counter and three plinths each with an item icon and a price (a shell and a number, r46: no pill). A price is red when the player cannot afford it.
 * The sign's ropes run up to the rock ceiling above it (found with tileAt); with no ceiling within reach
 * the sign stands on a post planted on the counter instead.
 * @param {{items:any[], stock:Uint8Array, sold:Uint8Array, px:Float32Array, keeperX:number, keeperY:number}} st
 */
export function drawShop(ctx, camera, cw, ch, st, shells, time, tileAt) {
  if (artImg('keeper') && artImg('sign') && artImg('pedestal') && artImg('counter')) { drawShopArt(ctx, camera, cw, ch, st, shells, time, tileAt); return; }
  const { ppu, sx, sy } = view(camera, cw, ch);
  const kx = sx(st.keeperX), ky = sy(st.keeperY);
  if (kx < -ppu * 8 || kx > cw + ppu * 8 || ky < -ppu * 8 || ky > ch + ppu * 8) return;
  const lw = Math.max(1.5, ppu * 0.06);
  ctx.lineJoin = 'round';

  // counter: a plank along the floor under the plinths
  const floorY = sy(Math.floor(st.px[1]) + 1);
  const cxL = sx(st.px[0] - 1.1), cxR = sx(st.px[4] + 1.1);
  ctx.fillStyle = '#7a5230'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.roundRect(cxL, floorY - ppu * 0.2, cxR - cxL, ppu * 0.2, ppu * 0.06); ctx.fill(); ctx.stroke();

  // sign
  const signY = ky - ppu * 1.75;
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, lw * 0.8);
  let ceil = null; // world y of the first solid tile's underside above the sign, at both rope columns
  if (tileAt) {
    const sy0 = st.keeperY - 1.75;
    for (let dy = 0; dy < 6 && ceil === null; dy++) {
      const ty = Math.floor(sy0 - 0.3) - dy;
      if (tileAt(Math.floor(st.keeperX - 0.6), ty) !== 0 && tileAt(Math.floor(st.keeperX + 0.6), ty) !== 0) ceil = ty + 1;
      else if (tileAt(Math.floor(st.keeperX - 0.6), ty) !== 0 || tileAt(Math.floor(st.keeperX + 0.6), ty) !== 0) break;
    }
  }
  if (ceil !== null) {
    const topY = sy(ceil) - 1;
    ctx.beginPath(); ctx.moveTo(kx - ppu * 0.6, signY - ppu * 0.3); ctx.lineTo(kx - ppu * 0.6, topY);
    ctx.moveTo(kx + ppu * 0.6, signY - ppu * 0.3); ctx.lineTo(kx + ppu * 0.6, topY); ctx.stroke();
  } else {
    ctx.fillStyle = '#7a5230'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.roundRect(kx - ppu * 0.09, signY, ppu * 0.18, floorY - ppu * 0.2 - signY, ppu * 0.04); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#9a6a3a'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.roundRect(kx - ppu * 0.95, signY - ppu * 0.3, ppu * 1.9, ppu * 0.6, ppu * 0.1); ctx.fill(); ctx.stroke();
  shellIcon(ctx, kx, signY, ppu * 0.5); // r46: a shell painted on the plank, not a word

  // keeper: round body, spiral shell on its back, stalk eyes, a smile (only while he sits calm behind the counter)
  if (st.keeperCalm !== false) drawFallbackKeeper(ctx, kx, ky, ppu, lw, time);
  for (let i = 0; i < 3; i++) {
    if ((st.pedGone && st.pedGone[i]) || (st.ware && st.ware[i] !== 0 && !st.sold[i])) continue;
    drawFallbackPlinth(ctx, st, i, sx, sy, ppu, lw, time, shells);
  }
}

function drawFallbackKeeper(ctx, kx, ky, ppu, lw, time) {
  const bob = Math.sin(time * 1.6) * ppu * 0.07;
  const by = ky + bob, r = ppu * 0.55;
  ctx.strokeStyle = '#4a2410'; ctx.lineWidth = lw;
  ctx.fillStyle = '#e88a4a';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(kx + sd * r * 1.05, by + r * 0.35, r * 0.45, r * 0.26, sd * 0.5, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(kx, by + r * 0.1, r * 1.0, r * 0.85, 0, 0, TAU); ctx.fillStyle = '#f2a66a'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c8763a';
  ctx.beginPath(); ctx.arc(kx + r * 0.35, by - r * 0.55, r * 0.62, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#7a3a18'; ctx.lineWidth = Math.max(1, lw * 0.7);
  ctx.beginPath(); ctx.arc(kx + r * 0.35, by - r * 0.55, r * 0.36, 0.2, 4.6); ctx.arc(kx + r * 0.35, by - r * 0.55, r * 0.14, 0, 4); ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(kx + sd * r * 0.38, by - r * 0.12, r * 0.24, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#20120a';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(kx + sd * r * 0.4 + r * 0.04, by - r * 0.1, r * 0.11, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#4a2410'; ctx.lineWidth = Math.max(1, lw * 0.8);
  ctx.beginPath(); ctx.arc(kx, by + r * 0.28, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}

function drawFallbackPlinth(ctx, st, i, sx, sy, ppu, lw, time, shells) {
  {
    const item = st.items[st.stock[i]];
    const px = sx(st.px[i * 2]), py = sy(st.px[i * 2 + 1]);
    const base = sy(Math.floor(st.px[i * 2 + 1]) + 1) - ppu * 0.2;
    ctx.fillStyle = '#8a8f98'; ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(px - ppu * 0.42, base); ctx.lineTo(px - ppu * 0.3, base - ppu * 0.32); ctx.lineTo(px + ppu * 0.3, base - ppu * 0.32); ctx.lineTo(px + ppu * 0.42, base); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b4bac4'; ctx.fillRect(px - ppu * 0.3, base - ppu * 0.32, ppu * 0.6, ppu * 0.07);
    const sold = st.sold[i] === 1;
    const iy = py - ppu * 0.2 + Math.sin(time * 2.2 + i * 1.7) * ppu * 0.05;
    if (!sold) itemGlyph(ctx, item.glyph, px, iy - ppu * 0.2, ppu * 0.36, time + i);
    const ty = py - ppu * 1.15;
    if (sold) { label(ctx, 'SOLD', px, ty, ppu * 0.3, '#c9d3dc'); return; }
    if (st.free) return;
    priceTag(ctx, px, ty, item.price, shells >= item.price, ppu);
  }
}

// ---- the generated shop stall (round 24) ----
const CNT_SRC_H = 181, CNT_TOP = 49, CNT_FOOT = 176; // counter strip: sprite height, y of the counter's top face and of its foot
const CNT_SCALE = 0.0035;                              // tiles per source pixel: the body is about 0.45 tile tall
const SIGN_ROPE = 0.16;                                // rope x of the sign sprite, from each side (fraction of its width)
const SIGN_W = 2.6, KEEPER_W = 1.5, PED_W = 0.8;       // tiles

/** Clip to the floor columns (world x from x0 to x1, the floor row fy) that are still rock; false (and no clip) when all stand. */
function clipToFloor(ctx, sx, sy, x0, x1, fy, tileAt, ppu) {
  const a = Math.floor(x0), b = Math.floor(x1);
  let gone = false;
  for (let tx = a; tx <= b; tx++) if (tileAt(tx, fy) === 0) { gone = true; break; }
  if (!gone) return false;
  ctx.save();
  ctx.beginPath();
  for (let tx = a; tx <= b; tx++) if (tileAt(tx, fy) !== 0) ctx.rect(sx(tx) - 0.5, sy(fy) - ppu * 3, ppu + 1, ppu * 4);
  ctx.clip();
  return true;
}

function drawShopArt(ctx, camera, cw, ch, st, shells, time, tileAt) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  // the keeper (and the sign over it) stands centred in the gap between the two pedestals that bracket its
  // spot, so its sprite clears both plinths (the room art puts the keeper only 1 tile from each)
  let keeperWX = st.keeperX;
  for (let i = 0; i < 2; i++) {
    const a = st.px[i * 2], b = st.px[i * 2 + 2];
    if (st.keeperX >= a && st.keeperX <= b) { keeperWX = (a + b) / 2; break; }
  }
  const kx = sx(keeperWX);
  const floorTop = Math.floor(st.px[1]) + 1;           // world y of the stall floor's surface
  if (kx < -ppu * 8 || kx > cw + ppu * 8 || sy(floorTop) < -ppu * 8 || sy(floorTop) > ch + ppu * 8) return;
  const lw = Math.max(1.5, ppu * 0.06);
  ctx.lineJoin = 'round';
  const gp = ppu * CNT_SCALE;

  // counter strip: left cap, stretched middle, right cap, foot on the floor
  const counter = artImg('counter');
  const xL = sx(st.px[0] - 1.1), xR = sx(st.px[4] + 1.1);
  const cy0 = sy(floorTop) - CNT_FOOT * gp;            // dest y of the strip's top
  const [lw0, mw0, rw0] = COUNTER_SLICES;
  const capL = lw0 * gp, capR = rw0 * gp;
  // 2026-10-07: the stall breaks like any rock; the counter stays only over floor tiles that still stand
  const clipped = tileAt ? clipToFloor(ctx, sx, sy, st.px[0] - 1.1, st.px[4] + 1.1, floorTop, tileAt, ppu) : false;
  ctx.drawImage(counter, 0, 0, lw0, CNT_SRC_H, xL, cy0, capL, CNT_SRC_H * gp);
  ctx.drawImage(counter, lw0, 0, mw0, CNT_SRC_H, xL + capL - 0.5, cy0, xR - xL - capL - capR + 1, CNT_SRC_H * gp);
  ctx.drawImage(counter, lw0 + mw0, 0, rw0, CNT_SRC_H, xR - capR, cy0, capR, CNT_SRC_H * gp);
  if (clipped) ctx.restore();
  const counterTopY = cy0 + CNT_TOP * gp;

  // keeper: sits behind / on the counter between the first two pedestals
  const keeper = artImg('keeper');
  const kw = ppu * KEEPER_W, kh = kw * (keeper.naturalHeight / keeper.naturalWidth);
  const fl = st.flinch > 0 ? st.flinch / 0.5 : 0; // blast nearby: a quick duck and shudder
  const bob = Math.sin(time * 1.6) * ppu * 0.035 + fl * ppu * 0.12;
  const kBottom = counterTopY + ppu * 0.06 + bob;
  const shud = fl > 0 ? Math.sin(time * 70) * fl * ppu * 0.07 : 0;
  const khh = kh * (1 - fl * 0.08);
  if (st.keeperCalm !== false) ctx.drawImage(keeper, kx - kw / 2 + shud, kBottom - khh, kw, khh); // an angry or dead keeper is drawn by shopkeeper-draw.js

  // sign: hangs from ropes that reach the rock ceiling above it; with no ceiling in reach it stands on a
  // post at the counter's left END (never behind the keeper)
  const sign = artImg('sign');
  const sw = ppu * SIGN_W, sh = sw * (sign.naturalHeight / sign.naturalWidth);
  const signCy = kBottom - kh - sh * 0.5 - ppu * 0.25;
  const sTop = signCy - sh / 2;
  const ropeDx = sw * (0.5 - SIGN_ROPE);
  let ceil = null;
  if (tileAt) {
    const wx0 = keeperWX - ropeDx / ppu, wx1 = keeperWX + ropeDx / ppu;
    const wy = camera.y + (sTop - ch / 2) / ppu;       // world y of the sign's top
    for (let dy = 0; dy < 7 && ceil === null; dy++) {
      const ty = Math.floor(wy - 0.1) - dy;
      const a = tileAt(Math.floor(wx0), ty) !== 0, b = tileAt(Math.floor(wx1), ty) !== 0;
      if (a && b) ceil = ty + 1;
      else if (a || b) break;
    }
  }
  let signX = kx;
  if (ceil !== null) {
    const topY = sy(ceil) - 1;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, ppu * 0.1);
    ctx.beginPath(); ctx.moveTo(kx - ropeDx, sTop + ppu * 0.1); ctx.lineTo(kx - ropeDx, topY); ctx.moveTo(kx + ropeDx, sTop + ppu * 0.1); ctx.lineTo(kx + ropeDx, topY); ctx.stroke();
    ctx.strokeStyle = '#b98b4a'; ctx.lineWidth = Math.max(1.5, ppu * 0.055);
    ctx.beginPath(); ctx.moveTo(kx - ropeDx, sTop + ppu * 0.1); ctx.lineTo(kx - ropeDx, topY); ctx.moveTo(kx + ropeDx, sTop + ppu * 0.1); ctx.lineTo(kx + ropeDx, topY); ctx.stroke();
    ctx.drawImage(sign, kx - sw / 2, sTop, sw, sh);
  } else {
    // post planted on the left end of the counter; the sign (ropes cropped off) rests on top of it
    signX = xL + capL * 0.5 + sw * 0.5 - ppu * 0.3;
    const px0 = xL + capL * 0.5 + ppu * 0.15, postTop = counterTopY - ppu * 2.75;
    ctx.fillStyle = '#8a5a32'; ctx.strokeStyle = '#2a170a'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.roundRect(px0 - ppu * 0.09, postTop, ppu * 0.18, counterTopY - postTop + ppu * 0.05, ppu * 0.04); ctx.fill(); ctx.stroke();
    const cropY = sign.naturalHeight * 0.2, dh = sh * 0.8;
    ctx.drawImage(sign, 0, cropY, sign.naturalWidth, sign.naturalHeight - cropY, signX - sw / 2, postTop - dh + ppu * 0.12, sw, dh);
    signX = signX;
  }
  shellIcon(ctx, signX, ceil !== null ? signCy + sh * 0.04 : (counterTopY - ppu * 2.75) - sh * 0.4 + ppu * 0.12, ppu * 0.55); // r46: a shell painted on the plank, not a word

  // pedestals, item icons and prices
  const ped = artImg('pedestal');
  const pw = ppu * PED_W, phh = pw * (ped.naturalHeight / ped.naturalWidth);
  for (let i = 0; i < 3; i++) {
    const item = st.items[st.stock[i]];
    const px = sx(st.px[i * 2]), py = sy(st.px[i * 2 + 1]);
    const pBottom = counterTopY + ppu * 0.1;
    if (st.pedGone && st.pedGone[i]) continue; // its floor was blown away: the pedestal fell (a loose ware is drawn by drawLooseWares)
    ctx.drawImage(ped, px - pw / 2, pBottom - phh, pw, phh);
    const sold = st.sold[i] === 1;
    const iy = pBottom - phh - ppu * 0.36 + Math.sin(time * 2.2 + i * 1.7) * ppu * 0.05;
    if (!sold && st.ware && st.ware[i] !== 0) continue; // knocked off or taken: an empty pedestal
    if (!sold) itemGlyph(ctx, item.glyph, px, iy, ppu * 0.36, time + i);
    const ty = iy - ppu * 0.72;
    if (sold) { label(ctx, 'SOLD', px, ty, ppu * 0.3, '#c9d3dc'); continue; }
    if (st.free) continue; // nobody minds the stall now: no prices
    priceTag(ctx, px, ty, item.price, shells >= item.price, ppu);
  }
}

/**
 * r36: decor boulders from the pattern table (a small boulder with a smaller one beside it, each sunk about a third into
 * the rock under it). They are scenery, not solid, and not a hazard: smaller and rounder than the falling rock, and
 * gone when the tile under them is bombed away.
 * @param {Float32Array} list x, y (anchor cell centre), dy (-1 floor, +1 ceiling), seed per boulder
 */
export function drawDecorBoulders(ctx, camera, cw, ch, list, tileAt) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  cullView(camera, cw, ch);
  const fb = cullFlags('boulders', list.length >> 2);
  for (let i = 0; i < list.length; i += 4) {
    const x = list[i], y = list[i + 1], dy = list[i + 2], seed = list[i + 3];
    if (!visibleAt(fb, i >> 2, x, y, 2)) continue; // r43
    const px = sx(x), py = sy(y);
    if (tileAt(Math.floor(x), Math.floor(y) - dy) === 0) continue; // its rock was bombed away
    const R = ppu * (0.3 + 0.05 * ((seed * 7) % 3));
    const rimY = py - dy * 0.5 * ppu;      // the rock face under (over) the cell
    drawDecorRock(ctx, px, rimY, R, seed, dy);
    const side = seed % 2 ? 1 : -1, r2 = R * 0.62;
    if (tileAt(Math.floor(x + side * 0.9), Math.floor(y) - dy) !== 0 && tileAt(Math.floor(x + side * 0.9), Math.floor(y)) === 0) {
      drawDecorRock(ctx, px + side * R * 1.25, rimY, r2, seed + 3, dy);
    }
  }
}

function hash01(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

/**
 * r37: a harmless decor rock: round, smooth, pale grey-blue with a moss patch and a sand skirt, half buried in the
 * rock face under it. Deliberately nothing like the dark, faceted, cracked hazard rock (hazards-draw.js drawBoulder).
 * (x, rimY) is where it meets the rock face; dy -1 stands on a floor, +1 hangs from a ceiling.
 */
export function drawDecorRock(ctx, x, rimY, R, seed, dy) {
  ctx.save();
  ctx.translate(x, rimY);
  ctx.scale(1, -dy); // local +y is into the rock
  // only the part on the water side of the face shows (it is half buried)
  ctx.beginPath(); ctx.rect(-R * 2.4, -R * 2.4, R * 4.8, R * 2.4 + R * 0.04); ctx.clip();
  const N = 9, cy = -R * 0.42;
  const px = new Array(N), py = new Array(N);
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU, r = R * (0.92 + hash01(seed * 7 + k) * 0.16);
    px[k] = Math.cos(a) * r * 1.12; py[k] = cy + Math.sin(a) * r * 0.86;
  }
  const path = () => { // a smooth closed blob through the midpoints
    ctx.beginPath();
    ctx.moveTo((px[0] + px[N - 1]) / 2, (py[0] + py[N - 1]) / 2);
    for (let k = 0; k < N; k++) { const k2 = (k + 1) % N; ctx.quadraticCurveTo(px[k], py[k], (px[k] + px[k2]) / 2, (py[k] + py[k2]) / 2); }
    ctx.closePath();
  };
  const g = ctx.createRadialGradient(-R * 0.35, cy - R * 0.4, R * 0.1, 0, cy, R * 1.25);
  g.addColorStop(0, '#b3c5cf'); g.addColorStop(0.55, '#7f95a4'); g.addColorStop(1, '#465a6c');
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1, R * 0.07); ctx.strokeStyle = 'rgba(32,48,64,0.55)'; ctx.stroke();
  // moss on the shoulder (or a barnacle crust, by seed)
  ctx.save(); path(); ctx.clip();
  const moss = seed % 3 !== 0;
  ctx.fillStyle = moss ? 'rgba(96,142,88,0.8)' : 'rgba(214,218,204,0.7)';
  for (let k = 0; k < 4; k++) {
    const a = -2.2 + k * 0.55 + hash01(seed + k) * 0.3, rr = R * (0.2 + hash01(seed * 3 + k) * 0.16);
    ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.66, rr, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(235,245,250,0.3)'; // a soft highlight
  ctx.beginPath(); ctx.ellipse(-R * 0.35, cy - R * 0.38, R * 0.3, R * 0.16, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
  // the sand skirt where it sinks into the rock
  ctx.fillStyle = 'rgba(196,178,128,0.92)'; ctx.strokeStyle = 'rgba(120,104,70,0.6)'; ctx.lineWidth = Math.max(1, R * 0.05);
  ctx.beginPath();
  ctx.moveTo(-R * 1.35, R * 0.05);
  ctx.quadraticCurveTo(-R * 0.95, -R * 0.2, -R * 0.45, -R * 0.12);
  ctx.quadraticCurveTo(0, -R * 0.2, R * 0.5, -R * 0.1);
  ctx.quadraticCurveTo(R * 1.0, -R * 0.22, R * 1.4, R * 0.05);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/**
 * r37: the sunken wreck of the wreck set-piece room: a ship lying on the floor with a broken hold (the chest sits in
 * it), a leaning mast with a tattered sail and loose planks. Scenery, drawn behind the enemies and the octopus.
 * @param {Float32Array} list x, y (the floor line under the middle of the room), flip (+1 bow right, -1 bow left) per wreck
 */
export function drawWrecks(ctx, camera, cw, ch, list, time) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  cullView(camera, cw, ch);
  const fw = cullFlags('wrecks', list.length / 3);
  for (let i = 0; i < list.length; i += 3) {
    if (!visibleAt(fw, i / 3, list[i], list[i + 1], 7)) continue; // r43
    const px = sx(list[i]), py = sy(list[i + 1]), flip = list[i + 2] < 0 ? -1 : 1;
    drawWreck(ctx, px, py, ppu, flip, time);
  }
}

function drawWreck(ctx, px, py, u, flip, time) {
  ctx.save();
  ctx.translate(px, py + u * 0.1);
  ctx.scale(flip * u, u);
  const lw = 0.06;
  // floor shadow
  ctx.fillStyle = 'rgba(6,12,20,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 0.22, 0, 0, TAU); ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // loose planks on the seabed
  ctx.fillStyle = '#5a3e27'; ctx.strokeStyle = '#26180e'; ctx.lineWidth = lw;
  for (const [x, y, w, a] of [[-4.3, -0.08, 1.3, 0.12], [3.9, -0.1, 1.1, -0.1], [-3.0, -0.05, 0.8, -0.2]]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.rect(-w / 2, -0.07, w, 0.14); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // mast (leans a little), behind the hull
  ctx.strokeStyle = '#26180e'; ctx.fillStyle = '#6b4a2f';
  ctx.beginPath(); ctx.moveTo(-0.12, -1.5); ctx.lineTo(-0.5, -5.1); ctx.lineTo(-0.34, -5.12); ctx.lineTo(0.1, -1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  // yard and the tattered sail
  ctx.save(); ctx.translate(-0.42, -4.5); ctx.rotate(-0.09);
  ctx.fillStyle = 'rgba(186,196,186,0.72)'; ctx.strokeStyle = 'rgba(60,70,64,0.8)'; ctx.lineWidth = lw * 0.8;
  ctx.beginPath();
  ctx.moveTo(-1.45, 0.03); ctx.lineTo(1.35, 0.03);
  ctx.lineTo(1.2, 0.55); ctx.lineTo(1.0, 0.4); ctx.lineTo(0.85, 1.05); ctx.lineTo(0.55, 0.75); ctx.lineTo(0.3, 1.3); ctx.lineTo(0.0, 0.85);
  ctx.lineTo(-0.35, 1.2); ctx.lineTo(-0.7, 0.7); ctx.lineTo(-1.0, 0.95); ctx.lineTo(-1.2, 0.45); ctx.lineTo(-1.45, 0.6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // two holes and seams
  ctx.fillStyle = 'rgba(20,40,50,0.55)';
  ctx.beginPath(); ctx.ellipse(0.55, 0.3, 0.14, 0.1, 0.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-0.7, 0.28, 0.1, 0.13, -0.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(70,80,74,0.5)'; ctx.beginPath(); ctx.moveTo(-0.3, 0.05); ctx.lineTo(-0.35, 1.05); ctx.moveTo(0.3, 0.05); ctx.lineTo(0.28, 1.1); ctx.stroke();
  // the yard itself
  ctx.fillStyle = '#6b4a2f'; ctx.strokeStyle = '#26180e'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.rect(-1.55, -0.07, 3.0, 0.14); ctx.fill(); ctx.stroke();
  ctx.restore();
  // rigging
  ctx.strokeStyle = 'rgba(40,28,18,0.7)'; ctx.lineWidth = lw * 0.5;
  ctx.beginPath(); ctx.moveTo(-0.48, -5.0); ctx.lineTo(3.3, -1.95); ctx.moveTo(-0.48, -5.0); ctx.lineTo(-3.2, -2.2); ctx.stroke();
  // hull: stern castle, bowed belly, high bow with a bowsprit
  const hullPath = () => {
  ctx.beginPath();
  ctx.moveTo(-3.7, -2.45);                  // stern top
  ctx.lineTo(-2.7, -2.45); ctx.lineTo(-2.55, -1.85); // castle step
  ctx.lineTo(-1.2, -1.75);
  ctx.lineTo(-0.7, -1.45); ctx.lineTo(-0.2, -1.8); ctx.lineTo(0.5, -1.35); ctx.lineTo(1.1, -1.75); // broken deck edge
  ctx.lineTo(3.2, -1.95); ctx.lineTo(4.7, -2.35);          // bow and bowsprit
  ctx.lineTo(3.4, -1.0);
  ctx.quadraticCurveTo(2.4, -0.05, 0.6, 0);                // bow to keel
  ctx.lineTo(-1.8, 0);
  ctx.quadraticCurveTo(-3.3, -0.1, -3.85, -1.2);           // keel up to the stern
  ctx.closePath();
  };
  hullPath();
  const g = ctx.createLinearGradient(0, -2.5, 0, 0);
  g.addColorStop(0, '#7a5636'); g.addColorStop(1, '#43301f');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#26180e'; ctx.lineWidth = lw * 1.4; ctx.stroke();
  // plank lines following the belly
  ctx.strokeStyle = 'rgba(30,20,12,0.6)'; ctx.lineWidth = lw * 0.7;
  for (const k of [0.3, 0.62]) {
    ctx.beginPath(); ctx.moveTo(-3.75 + k * 0.5, -2.2 + k * 1.6);
    ctx.quadraticCurveTo(0, k * 0.2 + 0.05, 3.9 - k * 0.8, -1.7 + k * 1.2); ctx.stroke();
  }
  // the hold: a dark gash in the deck, with ribs (the chest sits here)
  ctx.fillStyle = 'rgba(12,8,6,0.82)';
  ctx.beginPath(); ctx.moveTo(-1.6, -1.74); ctx.lineTo(-0.7, -1.45); ctx.lineTo(-0.2, -1.8); ctx.lineTo(0.5, -1.35); ctx.lineTo(1.1, -1.75);
  ctx.lineTo(1.6, -0.5); ctx.lineTo(0.9, -0.2); ctx.lineTo(-0.8, -0.2); ctx.lineTo(-1.5, -0.6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5b3f27'; ctx.lineWidth = lw * 1.6;
  for (const x of [-1.2, -0.4, 0.4, 1.2]) { ctx.beginPath(); ctx.moveTo(x, -1.6 + Math.abs(x) * 0.1); ctx.lineTo(x * 0.9, -0.25); ctx.stroke(); }
  // portholes
  for (const [x, y] of [[-2.8, -1.1], [-2.0, -0.9], [2.1, -0.95], [2.9, -1.15]]) {
    ctx.fillStyle = '#1a110b'; ctx.strokeStyle = '#8a6a43'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(x, y, 0.15, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // water tint, barnacles and a few weed strands
  ctx.save(); hullPath(); ctx.clip();
  ctx.fillStyle = 'rgba(20,80,86,0.22)';
  ctx.fillRect(-3.9, -2.5, 8.7, 2.5);
  ctx.restore();
  ctx.fillStyle = 'rgba(200,215,200,0.55)';
  for (const [x, y] of [[-3.2, -0.5], [-1.5, -0.12], [0.8, -0.1], [2.6, -0.45], [3.3, -0.8]]) { ctx.beginPath(); ctx.arc(x, y, 0.06, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgba(70,150,100,0.8)'; ctx.lineWidth = lw * 1.3;
  for (const [x, y, h] of [[-3.0, -2.4, 0.9], [3.1, -1.95, 0.8], [-1.9, -1.8, 0.7]]) {
    const sw = Math.sin(time * 1.6 + x) * 0.12;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw, y - h / 2, x + sw * 1.6, y - h); ctx.stroke();
  }
  ctx.restore();
}
