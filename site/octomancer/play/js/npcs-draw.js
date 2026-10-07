// Drawing for the NPCs that turned on you (npcs.js): the same art as when they were friendly (v2-props-draw.js drawDiver,
// drawCritter, drawCollector, pool-draw.js drawPoolHost) plus an angry look (brows and red pupils), a white flash when hit,
// Marlo's harpoon gun with its dashed sight line while he aims, and the harpoons in flight. Their corpse art is registered
// with corpses-draw.js (registerNpcCorpses). Device pixels, called after the octopus (main.js v2People).

import { drawDiver, drawCritter, drawCollector, drawSpeech, DIVER_SCALE, npcSpriteEyes } from './v2-props-draw.js';
import { drawPoolHost } from './pool-draw.js';
import { talkAlpha } from './speech.js';
import { acquireCanvas, releaseCanvas } from './canvas-pool.js';
import {
  NPC_MARLO, NPC_PIP, NPC_QUILL, NPC_HOST, NPC_IDS, NPC_CAP, NPC_HEAD, NPC_CENTER_DY, AIM_S, WIND_S, ST_AIM, ST_WIND, HARPOON_CAP,
} from './npcs.js';

const TAU = Math.PI * 2;
const INK = '#181012';
const NAMES = ['', 'Marlo', 'Pip', 'Quill', 'The Host'];
let SUIT = '#e0a94a'; // Marlo's sleeve under the gun: the code suit, or (r46) the canvas brown of his sprite
function suitColour() { SUIT = npcSpriteEyes('marlo', 1) ? '#6e5326' : '#e0a94a'; }

/** The angry look drawn over Marlo's visor: pale slanted brows and two red eyes. Origin = his feet; u = his scale. */
function marloFace(g, u, bob) {
  g.save(); g.translate(0, bob); g.lineCap = 'round';
  g.strokeStyle = '#efe0c8'; g.lineWidth = Math.max(1.5, u * 0.045);
  g.beginPath(); g.moveTo(-u * 0.15, -u * 0.935); g.lineTo(u * 0.0, -u * 0.865); g.moveTo(u * 0.21, -u * 0.935); g.lineTo(u * 0.07, -u * 0.865); g.stroke();
  g.fillStyle = '#ff6a4a';
  for (const ex of [-u * 0.06, u * 0.13]) { g.beginPath(); g.ellipse(ex, -u * 0.8, u * 0.05, u * 0.042, 0, 0, TAU); g.fill(); }
  g.restore();
}

/** Marlo's gun: the arm from the shoulder, a wooden stock, a steel barrel and (loaded) the harpoon in it. ang = local angle. */
function marloGun(g, u, ang, loaded, bob) {
  const lw = Math.max(1.5, u * 0.05);
  g.save();
  g.translate(u * 0.24, -u * 0.5 + bob); g.rotate(ang);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = INK;
  // arm to the hand
  g.lineWidth = u * 0.17; g.beginPath(); g.moveTo(0, 0); g.lineTo(u * 0.17, 0); g.stroke();
  g.strokeStyle = SUIT; g.lineWidth = u * 0.11; g.beginPath(); g.moveTo(0, 0); g.lineTo(u * 0.17, 0); g.stroke();
  g.strokeStyle = INK; g.lineWidth = lw;
  if (loaded) { // the harpoon in the barrel: shaft, barbed head
    g.strokeStyle = '#8a6a44'; g.lineWidth = u * 0.05; g.beginPath(); g.moveTo(u * 0.5, 0); g.lineTo(u * 0.82, 0); g.stroke();
    g.fillStyle = '#cfd6dc'; g.strokeStyle = INK; g.lineWidth = lw * 0.8;
    g.beginPath(); g.moveTo(u * 0.98, 0); g.lineTo(u * 0.78, -u * 0.09); g.lineTo(u * 0.82, 0); g.lineTo(u * 0.78, u * 0.09); g.closePath(); g.fill(); g.stroke();
  }
  g.fillStyle = '#7a5a34'; g.beginPath(); g.roundRect(-u * 0.16, -u * 0.06, u * 0.3, u * 0.12, u * 0.03); g.fill(); g.stroke(); // stock
  g.fillStyle = '#56636e'; g.beginPath(); g.roundRect(u * 0.08, -u * 0.05, u * 0.5, u * 0.1, u * 0.03); g.fill(); g.stroke(); // barrel
  g.fillStyle = '#3a444c'; g.fillRect(u * 0.5, -u * 0.05, u * 0.05, u * 0.1);
  g.restore();
}

/** r46: the angry look on a sprite NPC: a red glint in each eye and a dark slanted brow over it. eyes = npcSpriteEyes(...) at (ox, oy). */
function angrySprite(g, eyes, ox, oy, ppu, brow = INK) {
  g.save(); g.lineCap = 'round';
  for (const [ex, ey, er] of eyes) {
    const x = ox + ex, y = oy + ey, r = Math.max(1.5, er * 0.55);
    g.fillStyle = '#d6362c'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const cx = eyes.reduce((a, e) => a + e[0], 0) / eyes.length;
  g.strokeStyle = brow; g.lineWidth = Math.max(1.5, ppu * 0.045);
  g.beginPath();
  for (const [ex, ey, er] of eyes) {
    const inner = ex < cx || eyes.length === 1 ? 1 : -1, w = Math.max(er * 1.3, ppu * 0.06), y = oy + ey - er - ppu * 0.03;
    g.moveTo(ox + ex - inner * w, y - ppu * 0.035); g.lineTo(ox + ex + inner * w, y + ppu * 0.025);
  }
  g.stroke();
  g.restore();
}

function browsRound(g, lx, ly, rx, ry, w, col) { // two slanted brows, outer end up, inner end down
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(lx[0], ly[0]); g.lineTo(lx[1], ly[1]); g.moveTo(rx[0], ry[0]); g.lineTo(rx[1], ry[1]); g.stroke();
}

/** Paint one NPC (the anchor (x, y) in world units) on g with camera cam. `st` = {face, state, t, aimT, aimAng, reload, vx}. */
function paint(g, cam, cw, ch, who, x, y, st, time, lookX) {
  const ppu = cam.pxPerUnit, sx0 = cw / 2 + (x - cam.x) * ppu, sy0 = ch / 2 + (y - cam.y) * ppu;
  g.save();
  if (st.state === ST_WIND) { // rears back from the octopus, shaking
    const k = 1 - Math.max(0, st.t) / WIND_S;
    g.translate(-st.face * ppu * 0.16 * k + Math.sin(time * 70) * ppu * 0.018, 0);
  }
  if (who === NPC_MARLO) {
    const u = ppu * DIVER_SCALE, bob = Math.sin(time * 1.7) * ppu * 0.02;
    suitColour();
    g.translate(sx0, sy0);
    if (st.face < 0) g.scale(-1, 1);
    g.rotate(Math.max(-0.2, Math.min(0.2, st.vx * 0.045)));
    g.translate(-sx0, -sy0);
    drawDiver(g, cam, cw, ch, x, y, time, false, false, true);
    g.save(); g.translate(sx0, sy0);
    const me = npcSpriteEyes('marlo', ppu);
    if (me) angrySprite(g, me, 0, 0, ppu, '#efe0c8'); else marloFace(g, u, bob);
    const down = 0.95, aiming = st.state === ST_AIM;
    let ang = down;
    if (aiming) { const local = st.face >= 0 ? st.aimAng : Math.PI - st.aimAng, k = Math.min(1, st.aimT / 0.16); ang = down + (Math.atan2(Math.sin(local - down), Math.cos(local - down))) * k; }
    marloGun(g, u, ang, st.reload <= 0 || aiming, bob);
    g.restore();
  } else if (who === NPC_PIP) {
    drawCritter(g, cam, cw, ch, x, y, true, time, 0, '');
    const r = ppu * 0.19, cx = sx0, cy = sy0 + Math.sin(time * 3.1 + x) * ppu * 0.06;
    const pe = npcSpriteEyes('pip', ppu);
    if (pe) { angrySprite(g, pe, cx, cy, ppu, '#16301a'); g.restore(); return; }
    g.fillStyle = '#d6362c'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(cx + sd * r * 0.4, cy - r * 0.1, r * 0.13, 0, TAU); g.fill(); }
    browsRound(g, [cx - r * 0.78, cx - r * 0.1], [cy - r * 0.62, cy - r * 0.32], [cx + r * 0.78, cx + r * 0.1], [cy - r * 0.62, cy - r * 0.32], Math.max(1.5, ppu * 0.05), '#0c3a3c');
    g.strokeStyle = '#0c3a3c'; g.lineWidth = Math.max(1.2, ppu * 0.035); g.beginPath(); g.arc(cx, cy + r * 0.62, r * 0.3, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke(); // frown
  } else if (who === NPC_QUILL) {
    drawCollector(g, cam, cw, ch, x, y, time, false);
    const k = ppu * 0.64, bob = Math.sin(time * 1.4) * ppu * 0.02;
    const qe = npcSpriteEyes('quill', ppu);
    if (qe) { angrySprite(g, qe, sx0, sy0 + bob, ppu); g.restore(); return; }
    g.save(); g.translate(sx0, sy0 - k * 1.05 + bob); g.scale(k, k);
    g.fillStyle = '#d6362c'; for (const ex of [-0.22, 0.26]) { g.beginPath(); g.arc(ex, -0.03, 0.09, 0, TAU); g.fill(); }
    browsRound(g, [-0.5, -0.06], [-0.36, -0.2], [0.52, 0.08], [-0.36, -0.2], 0.09, INK);
    g.restore();
  } else if (who === NPC_HOST) {
    drawPoolHost(g, cam, cw, ch, { plan: { x: x + 1.7, floorY: y - 1 }, state: 3 }, time, lookX); // PL_LOST: the frown
    const k = ppu, bob = Math.sin(time * 1.9) * k * 0.025;
    const he = npcSpriteEyes('host', ppu, lookX > x, true);
    if (he) { angrySprite(g, he, sx0, sy0 + bob, ppu); g.restore(); return; }
    g.save(); g.translate(sx0, sy0 + bob);
    g.fillStyle = '#d6362c'; for (const ex of [-0.16, 0.16]) { g.beginPath(); g.arc(ex * k, -k * 0.54, k * 0.05, 0, TAU); g.fill(); }
    browsRound(g, [-0.3 * k, -0.07 * k], [-0.72 * k, -0.63 * k], [0.3 * k, 0.07 * k], [-0.72 * k, -0.63 * k], Math.max(1.5, k * 0.05), '#2a1808');
    g.restore();
  }
  g.restore();
}

/** Paint through a small offscreen canvas so a flat tint can be laid over just the NPC's pixels (the hit flash). */
function paintTinted(ctx, ppu, sx, sy, k, fn) {
  const S = Math.ceil(ppu * 4.4);
  const cv = acquireCanvas(S, S), g = cv.getContext('2d');
  fn(g, { x: 0, y: 0, pxPerUnit: ppu }, S, S);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(255,255,255,${Math.min(1, k).toFixed(3)})`; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(cv, sx - S / 2, sy - S / 2);
  releaseCanvas(cv);
}

/** The hostile NPCs, their sight lines, speech and the harpoons in flight. `sys` = npcs.js createNpcs(); octo for the host's eyes. */
export function drawNpcs(ctx, camera, cw, ch, sys, time, octo) {
  const d = sys.data, ppu = camera.pxPerUnit;
  const ax = (wx) => cw / 2 + (wx - camera.x) * ppu, ay = (wy) => ch / 2 + (wy - camera.y) * ppu;
  for (let i = 0; i < NPC_CAP; i++) {
    if (!d.used[i] || !d.hostile[i]) continue;
    const who = d.who[i], x = d.x[i], y = d.y[i];
    const sx = ax(x), sy = ay(y);
    if (sx < -ppu * 4 || sx > cw + ppu * 4 || sy < -ppu * 4 || sy > ch + ppu * 5) continue;
    const bob = d.state[i] === ST_WIND ? 0 : Math.sin(time * 2.1 + i) * 0.05; // swimming, not planted
    const st = { face: d.face[i] || 1, state: d.state[i], t: d.t[i], aimT: d.aimT[i], aimAng: d.aimAng[i], reload: d.reload[i], vx: d.vx[i] };
    const tint = Math.max(d.flash[i] > 0 ? 0.35 + 0.65 * (d.flash[i] / 0.22) : 0, d.state[i] === ST_WIND ? 0.2 + 0.4 * Math.abs(Math.sin(time * 38)) : 0);
    const lookX = octo ? octo.x : x;
    if (d.state[i] === ST_AIM && who === NPC_MARLO) drawSight(ctx, ppu, sx, sy, d, i, time);
    if (tint > 0.02) paintTinted(ctx, ppu, sx, sy + bob * ppu, tint, (g, cam, w, h) => paint(g, cam, w, h, who, 0, 0, st, time, lookX));
    else paint(ctx, camera, cw, ch, who, x, y + bob, st, time, lookX);
    const tk = sys.talks[i];
    if (tk.text) drawSpeech(ctx, camera, cw, ch, x, y + bob - NPC_HEAD[who], tk.text, talkAlpha(tk), NAMES[who]);
  }
  drawHarpoons(ctx, camera, cw, ch, sys.harpoons, time);
}

/** Marlo's sight: a thin dashed line from his gun toward where he is aiming, brighter as the shot comes. */
function drawSight(ctx, ppu, sx, sy, d, i, time) {
  const face = d.face[i] || 1, ang = d.aimAng[i];
  const shx = sx + face * 0.22 * ppu, shy = sy + (-0.46) * ppu; // shoulder (npcs.js muzzle origin: centre + 0.09)
  const p = Math.min(1, d.aimT[i] / AIM_S), len = Math.max(0, d.aimLen[i] - 0.9);
  if (len <= 0.05) return;
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([ppu * 0.2, ppu * 0.15]); ctx.lineDashOffset = -time * ppu * 1.6;
  ctx.strokeStyle = `rgba(255,${Math.round(150 - 70 * p)},${Math.round(110 - 50 * p)},${(0.22 + 0.68 * p).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.5, ppu * (0.035 + 0.02 * p));
  ctx.beginPath(); ctx.moveTo(shx + c * ppu * 0.9, shy + s * ppu * 0.9); ctx.lineTo(shx + c * ppu * (0.9 + len), shy + s * ppu * (0.9 + len)); ctx.stroke();
  ctx.restore();
}

/** Harpoons: a barbed spear and a thin line trailing behind it. */
export function drawHarpoons(ctx, camera, cw, ch, hp, time) {
  const ppu = camera.pxPerUnit;
  for (let h = 0; h < HARPOON_CAP; h++) {
    if (!hp.on[h]) continue;
    const sx = cw / 2 + (hp.x[h] - camera.x) * ppu, sy = ch / 2 + (hp.y[h] - camera.y) * ppu;
    if (sx < -ppu * 5 || sx > cw + ppu * 5 || sy < -ppu * 5 || sy > ch + ppu * 5) continue;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(hp.ang[h]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the line: pale, wavy, fading with distance
    ctx.strokeStyle = 'rgba(224,216,196,0.55)'; ctx.lineWidth = Math.max(1, ppu * 0.025);
    ctx.beginPath(); ctx.moveTo(-ppu * 0.9, 0);
    for (let k = 1; k <= 8; k++) ctx.lineTo(-ppu * (0.9 + k * 0.28), Math.sin(time * 18 + k * 0.9) * ppu * 0.035 * k * 0.5);
    ctx.stroke();
    // shaft
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, ppu * 0.1); ctx.beginPath(); ctx.moveTo(-ppu * 0.9, 0); ctx.lineTo(ppu * 0.05, 0); ctx.stroke();
    ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = Math.max(1.2, ppu * 0.055); ctx.beginPath(); ctx.moveTo(-ppu * 0.9, 0); ctx.lineTo(ppu * 0.05, 0); ctx.stroke();
    // barbed head
    ctx.fillStyle = '#cfd6dc'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, ppu * 0.04);
    ctx.beginPath(); ctx.moveTo(ppu * 0.3, 0); ctx.lineTo(-ppu * 0.02, -ppu * 0.12); ctx.lineTo(ppu * 0.06, 0); ctx.lineTo(-ppu * 0.02, ppu * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// ---- corpse art ------------------------------------------------------------------------------------------------

/** Register the 'npc-*' corpse kinds with corpses-draw.js: the same art, limp and grey, an X over each eye. */
export function registerNpcCorpses(setCorpseArt) {
  for (let who = 1; who <= 4; who++) {
    setCorpseArt('npc-' + NPC_IDS[who], (ctx, sx, sy, ppu, rot, face, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy); ctx.rotate(rot); if (face < 0) ctx.scale(-1, 1);
      ctx.filter = 'brightness(0.72) saturate(0.55)';
      const cam = { x: 0, y: 0, pxPerUnit: ppu }, ay = -NPC_CENTER_DY[who]; // anchor so the body centre is the origin
      const time = 0;
      if (who === NPC_MARLO) drawDiver(ctx, cam, 0, 0, 0, ay, time, false, false, false);
      else if (who === NPC_PIP) drawCritter(ctx, cam, 0, 0, 0, ay, true, time, 0, '');
      else if (who === NPC_QUILL) drawCollector(ctx, cam, 0, 0, 0, ay, time, false, false);
      else drawPoolHost(ctx, cam, 0, 0, { plan: { x: 1.7, floorY: ay - 1 }, state: 3, noShadow: true }, time, 1.7);
      ctx.filter = 'none';
      // the dead eyes: a dark X over each
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, ppu * 0.03); ctx.lineCap = 'round';
      const se = npcSpriteEyes(['', 'marlo', 'pip', 'quill', 'host'][who], ppu, who === NPC_HOST, true); // r46: on the sprite's eyes
      const eyes = se ? se.map(([ex, ey, er]) => [ex / ppu, ay + ey / ppu, Math.max(0.035, er / ppu * 0.8)])
        : who === NPC_MARLO ? [[-0.046, ay - 0.754, 0.05], [0.11, ay - 0.754, 0.05]]
        : who === NPC_PIP ? [[-0.072, ay - 0.023, 0.04], [0.072, ay - 0.023, 0.04]]
        : who === NPC_QUILL ? [[-0.154, ay - 0.704, 0.07], [0.154, ay - 0.704, 0.07]]
        : [[-0.16, ay - 0.55, 0.05], [0.16, ay - 0.55, 0.05]];
      for (const [ex, ey, er] of eyes) {
        const cx = ex * ppu, cy = ey * ppu, r = er * ppu;
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
      }
      ctx.restore();
    });
  }
}
