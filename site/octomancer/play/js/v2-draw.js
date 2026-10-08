// v2 world markers drawn in code (no new art this round): the glowing exit / dive ring and
// the hub's journal board. Called from render.js through its `extraDraw` hook, in device
// pixels, after enemies and bombs and before the octopus.

import { artImg } from './v2-art.js';
import { drawWhirlpoolCode, drawWhirlpoolSprite, portalPlace, portalFrame, portalTouch, portalKey, idleHeightPx, PORTAL_SQUASH, PORTAL_SEAT } from './portal-draw.js';
import { visibleAt, cullFlags, cullView } from './cull.js';

const TAU = Math.PI * 2;

// r44: the keyboard hint (bottom-left, desktop input only) as a rectangle in canvas pixels, or null when it is not shown (touch devices
// never show it). The old rule guessed it from window.devicePixelRatio (3 on a phone, but the canvas is capped at 1.5) and applied it
// on touch screens too, so the hub's 'Dive' label was always hidden on a phone. Read from the element, at most twice a second.
let hintCache = { at: -1e9, rect: null };
function hintRect(canvas, now) {
  if (now - hintCache.at > 500) {
    hintCache.at = now; hintCache.rect = null;
    try {
      const el = document.querySelector('.octo-controls-help');
      if (el && canvas.clientWidth > 0) {
        const cs = getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
          const r = el.getBoundingClientRect(), k = canvas.width / canvas.clientWidth, c = canvas.getBoundingClientRect();
          hintCache.rect = { x0: (r.left - c.left) * k - 8, y0: (r.top - c.top) * k - 8, x1: (r.right - c.left) * k + 8, y1: (r.bottom - c.top) * k + 8 };
        }
      }
    } catch (e) { /* no DOM: no hint */ }
  }
  return hintCache.rect;
}
const inRect = (r, x, y) => !!r && x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;

/** Labels of the portals found by drawV2Marks this frame; drawV2Labels draws them after the octopus. */
const pendingLabels = [];
/** r42: the portal names (the hub's 'Dive' label, the shortcut signs), drawn after the octopus so it never hides them. */
export function drawV2Labels() { for (const f of pendingLabels) f(); pendingLabels.length = 0; }

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {number} cw canvas width (px)
 * @param {number} ch canvas height (px)
 * @param {{exitX:number, exitY:number, boardX:number, boardY:number, label:string}} m tile coords; boardX < 0 means none
 * @param {number} time seconds
 */
export function drawV2Marks(ctx, camera, cw, ch, m, time) {
  const ppu = camera.pxPerUnit;
  const sx = (wx) => cw / 2 + (wx - camera.x) * ppu;
  const sy = (wy) => ch / 2 + (wy - camera.y) * ppu;

  // --- portals (the exit, the hub's dive well, the shortcut rings): Milan's Whirlpool animation (portal-draw.js), lying in the floor ---
  // The portal is drawn here (before the octopus); its label is queued and drawn by drawV2Labels, after the octopus.
  pendingLabels.length = 0;
  const water = (px, py) => { // is the screen point in an open water tile?
    const tx = Math.floor(camera.x + (px - cw / 2) / ppu), ty = Math.floor(camera.y + (py - ch / 2) / ppu);
    return m.tileAt ? m.tileAt(tx, ty) === 0 : true;
  };
  cullView(camera, cw, ch);
  const pf = cullFlags('portals', 8);
  let pi = 0;
  function ring(tx, ty, label, tint, plank) {
    const key = portalKey(tx, ty);
    portalTouch(key, time); // r44: the portal 'appears' (its Rise starts) when the level does, wherever the camera is
    if (!visibleAt(pf, pi++ & 7, tx + 0.5, ty + 0.5, 4)) return; // r43: a portal far from the camera is not animated or drawn
    const pl = m.tileAt ? portalPlace(m.tileAt, tx, ty) : { flat: false, w: 2, cx: tx + 0.5, floorY: ty + 1, cy: ty + 0.5 };
    const wpx = pl.w * ppu, ex = sx(pl.cx);
    const hIdle = idleHeightPx(wpx, pl.flat ? PORTAL_SQUASH : 1); // the idle whirlpool's visible height
    const floorPx = sy(pl.floorY);
    // r44: every frame is seated by its own visible bottom: on the floor line (lying) or on the bottom of the upright idle one
    const seatY = pl.flat ? floorPx + ppu * PORTAL_SEAT : sy(pl.cy) + hIdle / 2;
    const cy = seatY - hIdle / 2; // the centre of the idle whirlpool
    const d = m.octoX === undefined ? 99 : Math.hypot(m.octoX - (tx + 0.5), m.octoY - (ty + 0.5));
    const frame = portalFrame(key, time, d < 2.0, d > 3.2);
    const spriteTint = tint === 'violet' ? 'warm' : tint === 'amber' ? 'gold' : 'none';
    if (!drawWhirlpoolSprite(ctx, ex, seatY, wpx, pl.flat ? PORTAL_SQUASH : 1, frame, spriteTint)) {
      // the sheet has not loaded: the code-drawn whirlpool, as a fallback
      const r = ppu * 1.45;
      drawWhirlpoolCode(ctx, ex, cy, pl.flat ? r : r * 0.8, time, { tint, flat: pl.flat, phase: tx * 0.7 });
    } else {
      // bubbles rising from the pool, only through water tiles
      ctx.save();
      ctx.lineWidth = Math.max(1, ppu * 0.03);
      for (let i = 0; i < 6; i++) {
        const p = (time * 0.35 + i / 6 + tx * 0.13) % 1;
        const bx = ex + Math.sin(i * 2.7 + tx) * wpx * 0.36 + Math.sin(time * 2 + i) * ppu * 0.05;
        const by = cy - p * ppu * 1.7;
        if (!water(bx, by)) continue;
        ctx.globalAlpha = Math.min(1, p * 6) * (1 - p) * 0.7;
        ctx.fillStyle = 'rgba(200,235,250,0.25)'; ctx.strokeStyle = 'rgba(225,245,255,0.9)';
        ctx.beginPath(); ctx.arc(bx, by, ppu * (0.045 + 0.05 * ((i * 7) % 5) / 5), 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    if (tx === m.exitX && ty === m.exitY && m.seal > 0) drawKelpSeal(ctx, ex, floorPx, wpx, ppu, m.seal, time - (m.sealWobble || -99), time, tx);
    if (!label || !(ex > 0 && ex < cw && cy > 0 && cy < ch)) return;
    const hr = hintRect(ctx.canvas, performance.now());
    const topY = cy - hIdle / 2;  // the rim of the whirlpool
    pendingLabels.push(() => {
      if (plank) {
        // r44: the shortcut ring's name on a small wooden sign (65% of the old size) directly ABOVE its own ring, like the Dive label
        // (beside the ring, both signs leaned in towards the Dive well and it was unclear which ring each one named); a short post
        // runs from the plank down to just above the rim
        const S = 0.65;
        const ph = ppu * 0.56 * S, signY = topY - ppu * 0.3 - ph / 2;
        ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.32 * S))}px Quicksand, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width, pw = tw + ppu * 0.5 * S;
        const inHint = inRect(hr, ex, signY);
        if (!inHint && signY - ph / 2 > 0 && ex > -pw && ex < cw + pw) {
          ctx.lineJoin = 'round';
          const postW = Math.max(2, ppu * 0.1 * S), postTop = signY + ph / 2 - 1, postBot = topY + ppu * 0.04;
          ctx.fillStyle = '#6b4a22'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = Math.max(1, ppu * 0.04);
          ctx.fillRect(ex - postW / 2, postTop, postW, postBot - postTop);
          ctx.strokeRect(ex - postW / 2, postTop, postW, postBot - postTop);
          ctx.lineWidth = Math.max(2, ppu * 0.07 * S); ctx.fillStyle = '#c99a5a';
          ctx.beginPath(); ctx.roundRect(ex - pw / 2, signY - ph / 2, pw, ph, ppu * 0.1 * S); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#3a2410'; ctx.fillText(label, ex, signY + 1);
        }
      } else {
        const ly = topY - ppu * 0.32; // just above the whirlpool's rim
        const inHint = inRect(hr, ex, ly);
        if (!inHint && ly > 0) {
          ctx.font = `700 ${Math.max(11, Math.round(ppu * 0.4))}px Quicksand, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(4,20,34,0.8)';
          ctx.strokeText(label, ex, ly);
          ctx.fillStyle = '#ffe9a8';
          ctx.fillText(label, ex, ly);
        }
      }
    });
  }

  // the hub's dive is sealed by kelp until the tutorial has been finished (m.seal 1 -> 0 while it opens): a plank says why
  const sealed = m.seal > 0.97;
  ring(m.exitX, m.exitY, sealed ? (m.sealLabel || '') : m.label, 'green', sealed);
  if (m.tutorialX >= 0 && m.tutorialX !== undefined) ring(m.tutorialX, m.tutorialY, m.tutorialLabel || 'Tutorial', 'teal', true);
  if (m.shortcutX >= 0) ring(m.shortcutX, m.shortcutY, m.shortcutLabel || '', 'violet', true);
  if (m.shortcut3X >= 0) ring(m.shortcut3X, m.shortcut3Y, m.shortcut3Label || '', 'amber', true);

  // --- journal board: a wooden plank hung on the rock face, outlined like the sprites ---
  if (m.boardX >= 0) {
    const bx = sx(m.boardX + 0.5), by0 = sy(m.boardY + 1);  // by0 = ledge floor line; the board stands on it, inside the 1-tile ledge
    let by = by0 - ppu * 0.6;
    const w = ppu * 1.7, h = ppu * 1.2;
    const boardImg = artImg('board');
    if (boardImg && bx > -w && bx < cw + w && by > -h && by < ch + h) {
      // generated notice board (Milan style); the word goes on a small plaque under it
      const dw = ppu * 1.0, dh = dw * (boardImg.naturalHeight / boardImg.naturalWidth);
      by = by0 - dh / 2;
      ctx.drawImage(boardImg, bx - dw / 2, by - dh / 2, dw, dh);
      ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.3))}px Quicksand, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, ppu * 0.1); ctx.lineJoin = 'round'; ctx.strokeStyle = '#3a2410';
      ctx.strokeText('Journal', bx, by - dh / 2 - ppu * 0.2);
      ctx.fillStyle = '#f6e7b8'; ctx.fillText('Journal', bx, by - dh / 2 - ppu * 0.2);
    } else if (bx > -w && bx < cw + w && by > -h && by < ch + h) {
      const lw = Math.max(2, ppu * 0.09);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(bx - w * 0.3, by - h / 2); ctx.lineTo(bx, by - h / 2 - ppu * 0.3); ctx.lineTo(bx + w * 0.3, by - h / 2); ctx.stroke();
      const rr = ppu * 0.14;
      const rect = (x, y, ww, hh) => { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, rr); };
      rect(bx - w / 2, by - h / 2, w, h);
      ctx.fillStyle = '#9a6a3a'; ctx.fill();
      ctx.strokeStyle = '#3a2410'; ctx.stroke();
      rect(bx - w * 0.4, by - h * 0.36, w * 0.8, h * 0.72);
      ctx.fillStyle = '#f0e0b0'; ctx.fill();
      ctx.lineWidth = Math.max(1, lw * 0.6); ctx.stroke();
      ctx.fillStyle = 'rgba(58,36,16,0.28)';
      ctx.fillRect(bx - w / 2 + lw, by + h / 2 - ppu * 0.12, w - lw * 2, ppu * 0.1);
      ctx.fillStyle = '#3a2410';
      ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.32))}px Quicksand, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Journal', bx, by - h * 0.06);
      ctx.fillStyle = 'rgba(58,36,16,0.5)';
      ctx.fillRect(bx - w * 0.28, by + h * 0.16, w * 0.56, Math.max(1, ppu * 0.04));
    }
  }
}

/**
 * The kelp that seals the hub's dive until the tutorial is done: thick strands rooted along the floor, leaning across each
 * other into a woven net over the whirlpool. `seal` 1 = shut; towards 0 the strands fall apart to the sides and fade (the
 * unlock moment). `since` = seconds since the octopus last bumped into it (a shiver), `time` the clock for the sway.
 */
function drawKelpSeal(ctx, ex, floorPx, wpx, ppu, seal, since, time, salt) {
  const n = 10, span = wpx * 1.05, open = 1 - seal;
  const shiver = since >= 0 && since < 0.7 ? Math.sin(since * 38) * (0.7 - since) * 0.2 : 0;
  ctx.save();
  ctx.globalAlpha = Math.min(1, seal * 1.6);
  ctx.lineJoin = 'round';
  const ow = Math.max(1.5, ppu * 0.035);
  const P = 9, xs = new Float32Array(P * 2), ys = new Float32Array(P * 2);
  /** One tapered kelp blade along a quadratic curve from its root (bx, by): filled, outlined dark like the sprites. */
  function blade(bx, by, cx, cy, tx, ty, w, fill) {
    for (let k = 0; k < P; k++) {
      const t = k / (P - 1), it = 1 - t;
      const x = it * it * bx + 2 * it * t * cx + t * t * tx, y = it * it * by + 2 * it * t * cy + t * t * ty;
      const dx = 2 * it * (cx - bx) + 2 * t * (tx - cx), dy = 2 * it * (cy - by) + 2 * t * (ty - cy), dl = Math.hypot(dx, dy) || 1;
      const half = w * (1 - t * 0.85) * (0.75 + 0.25 * Math.sin(t * 9 + salt)) / 2; // tapers to a point, a little wavy
      xs[k] = x - dy / dl * half; ys[k] = y + dx / dl * half;
      xs[P * 2 - 1 - k] = x + dy / dl * half; ys[P * 2 - 1 - k] = y - dx / dl * half;
    }
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
    for (let k = 1; k < P * 2; k++) ctx.lineTo(xs[k], ys[k]);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = '#163319'; ctx.lineWidth = ow; ctx.stroke();
  }
  for (let j = 0; j < n; j++) {
    const i = j % 2 ? n - 1 - (j >> 1) : j >> 1; // outer blades first, the middle ones on top
    const u = i / (n - 1) - 0.5;                 // -0.5 .. 0.5 across the ring
    const side = u < 0 ? -1 : 1;
    // shut: the blades lean across each other (every other one the other way) into a woven lattice over the whirlpool;
    // opening: each falls back to its own side and fades
    const lean = (i % 2 ? 0.5 : -0.5) - u * 0.5;
    const a = lean * seal + open * 1.4 * side + Math.sin(time * 1.3 + i * 1.7 + salt) * 0.05 + shiver * (i % 2 ? 1 : -1);
    const len = ppu * (1.25 + 0.25 * ((i * 5 + salt) % 3) / 2) * (1 - open * 0.3);
    const bx = ex + u * span, by = floorPx + ppu * 0.08;
    const tx = bx + Math.sin(a) * len, ty = by - Math.cos(a) * len;
    const cx = bx + Math.sin(a * 0.5) * len * 0.5 + Math.sin(time * 1.1 + i) * ppu * 0.04, cy = by - len * 0.6;
    blade(bx, by, cx, cy, tx, ty, ppu * (0.3 - 0.05 * (i % 2)), i % 2 ? '#4d8a3e' : '#6c9e43');
    // a leaf off each blade, half way up
    const lx = (bx + 2 * cx + tx) / 4, ly = (by + 2 * cy + ty) / 4, d = i % 2 ? 1 : -1, la = a + d * 1.0, ll = ppu * 0.45;
    blade(lx, ly, lx + Math.sin(la) * ll * 0.5, ly - Math.cos(la) * ll * 0.3, lx + Math.sin(la) * ll, ly - Math.cos(la) * ll * 0.75, ppu * 0.2, '#7fae4c');
  }
  ctx.restore();
}
