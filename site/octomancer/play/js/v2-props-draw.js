// Code-drawn placeholders for the round-22 v2 props (the art comes later): the tutorial's bomb-wall cue,
// the hub quest sign, the shop (keeper, plinths, item icons, prices), the rescue critter and the vault
// cache. Called from main.js's extraDraw hook after enemies and bombs, before the octopus. Device pixels.

const TAU = Math.PI * 2;
const INK = '#3a2410';

const shellImg = new Image();
shellImg.src = './assets/shell-blue.webp';

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

function itemGlyph(ctx, glyph, x, y, r, time) {
  if (glyph === 'heart') heartGlyph(ctx, x, y, r);
  else if (glyph === 'bombs3') {
    bombGlyph(ctx, x - r * 0.95, y + r * 0.2, r * 0.62, time);
    bombGlyph(ctx, x + r * 0.95, y + r * 0.2, r * 0.62, time + 1);
    bombGlyph(ctx, x, y - r * 0.15, r * 0.72, time + 2);
  } else bombGlyph(ctx, x, y, r * 0.85, time);
}

/** Deterministic irregular crack polylines through the tile box (x0,y0,w,h): downward wanderers with side branches. */
function makeCracks(x0, y0, w, hgt, count, vertical = true) {
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
      if (rnd() < 0.45) branches.push([...put(pa, pb), ...put(pa + (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.5), pb + 0.2 + rnd() * 0.5)]);
    }
    cracks.push({ pts, branches });
  }
  return cracks;
}

function strokeCracks(ctx, sx, sy, ppu, cracks) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [lw, style] of [[Math.max(2, ppu * 0.06), 'rgba(12,6,20,0.45)'], [Math.max(1, ppu * 0.022), 'rgba(255,238,205,0.5)']]) {
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
    // cracks run along the line from the entrance towards the pocket
    strokeCracks(ctx, sx, sy, ppu, makeCracks(bx, by, bw, bh, 2, side === 1 || side === 2));
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
  for (let i = 0; i < walls.length; i += 2) {
    const tx = walls[i], ty = walls[i + 1];
    if (open(tx, ty)) continue;
    n++; cx += tx + 0.5; cy += ty + 0.5;
    if (tx < minX) minX = tx; if (tx > maxX) maxX = tx; if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
    const l = open(tx - 1, ty), r = open(tx + 1, ty), u = open(tx, ty - 1), d = open(tx, ty + 1);
    const x = sx(tx), y = sy(ty);
    if (x < -ppu || x > cw + ppu || y < -ppu || y > ch + ppu) continue;
    // the rect grows into neighbouring wall cells (no seams) and stays inset from water faces
    const x0 = x + (l ? inset : -1), x1 = x + ppu - (r ? inset : -1);
    const y0 = y + (u ? inset : -1), y1 = y + ppu - (d ? inset : -1);
    ctx.rect(x0, y0, x1 - x0, y1 - y0); any = true;
  }
  if (any) {
    ctx.clip();
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(255,232,190,${0.01 + 0.012 * pulse + 0.05 * cue.attention})`;
    ctx.fillRect(0, 0, cw, ch);
    // a few irregular cracks running through the whole wall (world space, deterministic)
    strokeCracks(ctx, sx, sy, ppu, makeCracks(minX, minY, maxX - minX + 1, maxY - minY + 1, Math.max(2, Math.round((maxY - minY + 1) / 3))));
  }
  ctx.restore();
  if (!n) return;
  // pulsing bomb marker on the wall's middle, with a ring that grows and fades
  const mx = sx(cx / n), my = sy(cy / n);
  const p = (time * (0.9 + 0.8 * cue.attention)) % 1;
  ctx.strokeStyle = `rgba(255,214,120,${(1 - p) * (0.75 + 0.25 * cue.attention)})`;
  ctx.lineWidth = Math.max(2, ppu * 0.1);
  ctx.beginPath(); ctx.arc(mx, my, ppu * (0.7 + 1.3 * p), 0, TAU); ctx.stroke();
  const s = 1 + 0.08 * Math.sin(time * 5);
  ctx.fillStyle = 'rgba(6,22,34,0.75)';
  ctx.beginPath(); ctx.arc(mx, my, ppu * 0.78 * s, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffd678'; ctx.lineWidth = Math.max(1.5, ppu * 0.07);
  ctx.beginPath(); ctx.arc(mx, my, ppu * 0.78 * s, 0, TAU); ctx.stroke();
  bombGlyph(ctx, mx - ppu * 0.05, my + ppu * 0.08, ppu * 0.38 * s, time);
}

/** The hub's quest sign: a plank on a post with a bobbing "!" over it, like the journal board. */
export function drawQuestSign(ctx, camera, cw, ch, x, y, time) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const bx = sx(x + 0.5), by = sy(y + 0.05); // plank wholly in the water above the floor tile, post reaching down to its top
  const w = ppu * 1.7, h = ppu * 1.15;
  if (bx < -w || bx > cw + w || by < -h * 2 || by > ch + h) return;
  const lw = Math.max(2, ppu * 0.09);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#7a5230'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.roundRect(bx - ppu * 0.09, by, ppu * 0.18, ppu * 1.0, ppu * 0.05); ctx.fill(); ctx.stroke(); // post
  ctx.beginPath(); ctx.roundRect(bx - w / 2, by - h / 2, w, h, ppu * 0.14); ctx.fillStyle = '#9a6a3a'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(bx - w * 0.4, by - h * 0.36, w * 0.8, h * 0.72, ppu * 0.1); ctx.fillStyle = '#f0e0b0'; ctx.fill();
  ctx.lineWidth = Math.max(1, lw * 0.6); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.32))}px Quicksand, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Quests', bx, by);
  const bob = Math.sin(time * 3) * ppu * 0.08;
  label(ctx, '!', bx, by - h * 0.95 + bob, ppu * 0.8, '#ffe38a');
}

/** The rescue critter: a small round friend with fins and eyes; rings ripple out while it waits to be found. */
export function drawCritter(ctx, camera, cw, ch, x, y, following, time) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const bob = Math.sin(time * 3.1 + x) * ppu * 0.06;
  const cx = sx(x), cy = sy(y) + bob, r = ppu * 0.19; // about 0.7x the octopus
  if (cx < -ppu * 3 || cx > cw + ppu * 3 || cy < -ppu * 3 || cy > ch + ppu * 3) return;
  if (!following) {
    const p = (time * 0.7) % 1;
    ctx.strokeStyle = `rgba(157,255,216,${(1 - p) * 0.55})`; ctx.lineWidth = Math.max(1.5, ppu * 0.04);
    ctx.beginPath(); ctx.arc(cx, cy, r * (1.4 + 2.2 * p), 0, TAU); ctx.stroke(); // stays under 0.7 tiles: inside the open water around the critter
  }
  const lw = Math.max(1.5, ppu * 0.06);
  ctx.lineJoin = 'round';
  const flap = Math.sin(time * 9) * 0.25;
  ctx.fillStyle = '#58c8b8'; ctx.strokeStyle = '#0c3a3c'; ctx.lineWidth = lw;
  for (const sd of [-1, 1]) { // fins
    ctx.beginPath(); ctx.ellipse(cx + sd * r * 1.0, cy + r * 0.1, r * 0.5, r * 0.28, sd * (0.6 + flap), 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = '#86e6d2'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#eafffa';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sd * r * 0.38, cy - r * 0.12, r * 0.22, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#0c2a2c';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sd * r * 0.4, cy - r * 0.1, r * 0.1, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#0c3a3c'; ctx.lineWidth = Math.max(1, lw * 0.7);
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.2, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}

/** The vault cache: a small gold chest with a glint, sealed in its pocket until the rock is bombed away. */
export function drawVaultCache(ctx, camera, cw, ch, x, y, time) {
  const { ppu, sx, sy } = view(camera, cw, ch);
  const cx = sx(x), cy = sy(y);
  if (cx < -ppu * 2 || cx > cw + ppu * 2 || cy < -ppu * 2 || cy > ch + ppu * 2) return;
  const w = ppu * 0.8, h = ppu * 0.52, lw = Math.max(1.5, ppu * 0.06);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#c98a2c'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, ppu * 0.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8b04a';
  ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h * 0.42, [ppu * 0.1, ppu * 0.1, 0, 0]); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a2410'; ctx.fillRect(cx - ppu * 0.05, cy - h * 0.1, ppu * 0.1, h * 0.28);
  const g = 0.5 + 0.5 * Math.sin(time * 3);
  ctx.fillStyle = `rgba(255,248,200,${0.5 + 0.4 * g})`;
  const gx = cx + w * 0.3, gy = cy - h * 0.7;
  ctx.beginPath(); ctx.moveTo(gx, gy - ppu * 0.2); ctx.lineTo(gx + ppu * 0.05, gy - ppu * 0.05); ctx.lineTo(gx + ppu * 0.2, gy);
  ctx.lineTo(gx + ppu * 0.05, gy + ppu * 0.05); ctx.lineTo(gx, gy + ppu * 0.2); ctx.lineTo(gx - ppu * 0.05, gy + ppu * 0.05);
  ctx.lineTo(gx - ppu * 0.2, gy); ctx.lineTo(gx - ppu * 0.05, gy - ppu * 0.05); ctx.closePath(); ctx.fill();
}

/**
 * The shop: a hanging SHOP sign, the keeper (a round friendly shell-back critter), a low counter and
 * three plinths each with an item icon and a price tag. A price is red when the player cannot afford it.
 * The sign's ropes run up to the rock ceiling above it (found with tileAt); with no ceiling within reach
 * the sign stands on a post planted on the counter instead.
 * @param {{items:any[], stock:Uint8Array, sold:Uint8Array, px:Float32Array, keeperX:number, keeperY:number}} st
 */
export function drawShop(ctx, camera, cw, ch, st, shells, time, tileAt) {
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
  ctx.fillStyle = '#f6e7b8';
  ctx.font = `700 ${Math.max(11, Math.round(ppu * 0.42))}px Quicksand, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SHOP', kx, signY + ppu * 0.02);

  // keeper: round body, spiral shell on its back, stalk eyes, a smile
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

  // plinths, item icons and prices
  for (let i = 0; i < 3; i++) {
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
    if (sold) { label(ctx, 'SOLD', px, ty, ppu * 0.3, '#c9d3dc'); continue; }
    const afford = shells >= item.price;
    const text = String(item.price);
    ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.36))}px Quicksand, sans-serif`;
    const tw = ctx.measureText(text).width, pw = tw + ppu * 0.75, ph = ppu * 0.44;
    ctx.fillStyle = 'rgba(6,22,34,0.85)'; ctx.strokeStyle = afford ? '#ffe38a' : '#ff8a80'; ctx.lineWidth = Math.max(1.5, ppu * 0.05);
    ctx.beginPath(); ctx.roundRect(px - pw / 2, ty - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
    shellIcon(ctx, px - pw / 2 + ppu * 0.26, ty, ppu * 0.36);
    ctx.fillStyle = afford ? '#ffe38a' : '#ff8a80';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, px + ppu * 0.2, ty + ppu * 0.02);
  }
}
