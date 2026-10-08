// Ambush creature drawing (creatures.js): the giant clam (code-drawn, two valves that turn about a hinge) and the tentacle
// (Milan's Clamissaint shell, baked by octomancer-web/tools/bake_clamissaint.py; the limb that has to reach any point is drawn in code).
// drawCreaturesBack() runs before the octopus (the clam's cavity and pearl, the shell and limb), drawCreaturesFront() after it
// (the clam's front wall and lid, the tentacle wrapped round the octopus, a shell that holds a body). Both cull off-screen ones.
// Look: dark outline (#181012, 0.06 tile), flat fills with one shade tone, soft muted colours, nothing glossy.

import {
  CR_GCLAM, CR_TENTACLE, CL_TREMBLE,
  TN_DORMANT, TN_WAKE, TN_REACH, TN_STRIKE, TN_GRAB, TN_STUN, TN_FED,
  CLAM_TREMBLE_T, TENT_WAKE_T, TENT_SHELL_LEN, PEARL_R,
} from './creatures.js';
import { prefersReducedMotion } from './config.js';
import { visibleAt, cullFlags, cullView } from './cull.js';
import { setCorpseArt } from './corpses-draw.js';

const TAU = Math.PI * 2;
const INK = '#181012';
const LW = 0.06;

function loadImage(name) { const im = new Image(); im.src = new URL('../assets/' + name, import.meta.url).href; return im; }
const shellImg = loadImage('enemy-tentacle.webp');
const ready = (im) => im.complete && im.naturalWidth > 0;
// the shell crop and where its parts sit, as fractions of it (octomancer-web/tools/bake_clamissaint.py writes the same numbers to enemy-tentacle.json)
const SH_W = 231, SH_H = 177, MOUTH_U = 0.803, MOUTH_V = 0.4689;
const EYES = [[0.381, 0.7006, 0.0736], [0.5974, 0.709, 0.0952]];

// ---------------------------------------------------------------- giant clam

const RIM_Y = -0.4, RX = 0.92, RY = 0.13;       // the rim ellipse of the shut shell (tile units, origin on the floor under the middle)
const LID_MAX = 45 * Math.PI / 180;             // how far the lid swings open about its hinge
// verification 2026-10-08: warm bone-and-sand valves (Milan's clam palette) instead of cold slate, so it sits with the painted
// sprites; the teal Tridacna mantle and no barnacles keep it apart from the mauve Barnacle Clam (the chest)
const SHELL = '#b9ab8f', SHELL_LIGHT = '#e3d7bb', SHELL_DARK = '#7f705a', SAND = '#efe3c6';
const FRILL = '#4fae9f', FRILL_2 = '#9a7cc4', CAVITY = '#3a2f4c';

/** The lower half of the rim ellipse: the front lip. */
function frontLip(c) { c.ellipse(0, RIM_Y, RX, RY, 0, 0, Math.PI, false); }

/** The cup's cavity (the inside seen over the front lip), drawn behind the octopus. `limp` greys it for the corpse. */
function drawCavity(c, limp) {
  c.beginPath(); c.ellipse(0, RIM_Y, RX - 0.02, RY, 0, 0, TAU);
  c.fillStyle = limp ? '#4a4452' : CAVITY; c.fill();
  // the mantle: a frilled band along the back edge, teal with violet spots
  c.beginPath(); c.ellipse(0, RIM_Y, RX - 0.02, RY, 0, Math.PI, TAU, false);
  c.strokeStyle = limp ? '#6c7a7a' : FRILL; c.lineWidth = 0.075; c.stroke();
  c.fillStyle = limp ? '#7a7490' : FRILL_2;
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k + 0.5) / 9 * Math.PI;
    c.beginPath(); c.arc(Math.cos(a) * (RX - 0.05), RIM_Y + Math.sin(a) * (RY - 0.01), 0.027, 0, TAU); c.fill();
  }
}

/** The pearl: soft and milky, a faint highlight that comes and goes (no sparkle). */
function drawPearl(c, glint) {
  const px = 0.02, py = RIM_Y - 0.1;
  const g = c.createRadialGradient(px - 0.04, py - 0.04, 0.01, px, py, PEARL_R);
  g.addColorStop(0, '#f4eee6'); g.addColorStop(1, '#cdc1b6');
  c.beginPath(); c.arc(px, py, PEARL_R, 0, TAU); c.fillStyle = g; c.fill();
  c.lineWidth = 0.035; c.strokeStyle = '#6f6260'; c.stroke();
  if (glint > 0) { // a soft milky patch fading in and out
    const h = c.createRadialGradient(px - 0.05, py - 0.06, 0, px - 0.05, py - 0.06, 0.09);
    h.addColorStop(0, 'rgba(255,255,255,' + (0.55 * glint).toFixed(3) + ')'); h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h; c.beginPath(); c.arc(px - 0.05, py - 0.06, 0.09, 0, TAU); c.fill();
  }
}

const N_RIB = 7, N_PTS = 48;
/** One valve's outer edge as a closed path: points along an arc from the hinge end (-RX) to the front end (+RX) with a scallop at each rib, then back along the front lip. */
function valvePath(c, dir, depth, pw) {
  c.beginPath();
  for (let k = 0; k <= N_PTS; k++) {
    const u = k / N_PTS, a = Math.PI * u;
    const r = Math.pow(Math.sin(a), pw) * depth + 0.035 * Math.abs(Math.sin(a * N_RIB)) * Math.sin(a);
    const x = -RX * Math.cos(a) * (1 + 0.04 * Math.sin(a)), y = RIM_Y + dir * r;
    if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  frontLip(c);
  c.closePath();
}
/** Ribs fan out from the hinge end to the scallops, a dark line with a light one beside it. */
function valveRibs(c, dir, depth, pw, col, light) {
  c.lineCap = 'round';
  for (let k = 0; k < N_RIB; k++) {
    const a = Math.PI * (k + 0.5) / N_RIB;
    const r = Math.pow(Math.sin(a), pw) * depth + 0.035 * Math.sin(a) * 0.9;
    const ex = -RX * Math.cos(a), ey = RIM_Y + dir * r * 0.93;
    const mx = ex * 0.45 - RX * 0.5, my = RIM_Y + dir * r * 0.55;
    c.beginPath(); c.moveTo(-RX * 0.9, RIM_Y + dir * 0.02); c.quadraticCurveTo(mx, my, ex, ey);
    c.strokeStyle = col; c.lineWidth = 0.04; c.stroke();
    c.beginPath(); c.moveTo(-RX * 0.9 + 0.03, RIM_Y + dir * 0.02); c.quadraticCurveTo(mx + 0.03, my, ex + 0.04, ey);
    c.strokeStyle = light; c.lineWidth = 0.025; c.globalAlpha *= 0.55; c.stroke(); c.globalAlpha /= 0.55;
  }
}

/** The cup's outer wall and front lip (in front of the octopus: it swims in over the lip). */
function drawCup(c, limp) {
  valvePath(c, 1, 0.43, 0.6);
  c.fillStyle = limp ? '#8c826f' : SHELL; c.fill();
  c.save(); c.clip();
  c.fillStyle = limp ? '#6d6455' : SHELL_DARK; c.globalAlpha = 0.5; c.fillRect(-1.2, -0.1, 2.4, 0.3); c.globalAlpha = 1;
  valveRibs(c, 1, 0.43, 0.6, limp ? '#5a5246' : SHELL_DARK, limp ? '#b0a690' : SHELL_LIGHT);
  c.fillStyle = limp ? '#8d8a80' : SAND; c.globalAlpha = 0.3; c.beginPath(); c.ellipse(0.1, -0.22, 0.55, 0.05, -0.08, 0, TAU); c.fill(); c.globalAlpha = 1;
  c.restore();
  valvePath(c, 1, 0.43, 0.6);
  c.lineJoin = 'round'; c.lineWidth = LW; c.strokeStyle = INK; c.stroke();
  // the mantle lip on the rim
  c.beginPath(); frontLip(c); c.lineWidth = 0.1; c.strokeStyle = INK; c.stroke();
  c.lineWidth = 0.055; c.strokeStyle = limp ? '#6c7a7a' : FRILL; c.stroke();
}

/** The lid: a ribbed dome that turns about the hinge at the left rim end by `theta` (rad, 0 = shut). */
function drawLid(c, theta, limp) {
  c.save();
  c.translate(-RX, RIM_Y); c.rotate(-theta); c.translate(RX, -RIM_Y);
  valvePath(c, -1, 0.56, 0.7);
  c.fillStyle = limp ? '#8c826f' : SHELL; c.fill();
  c.save(); c.clip();
  c.fillStyle = limp ? '#6d6455' : SHELL_DARK; c.globalAlpha = 0.45; c.beginPath(); c.ellipse(0.2, -0.35, 1.2, 0.14, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
  valveRibs(c, -1, 0.56, 0.7, limp ? '#5a5246' : SHELL_DARK, limp ? '#b0a690' : SHELL_LIGHT);
  c.fillStyle = limp ? '#8d8a80' : SAND; c.globalAlpha = 0.3; c.beginPath(); c.ellipse(-0.1, -0.78, 0.5, 0.05, -0.08, 0, TAU); c.fill(); c.globalAlpha = 1;
  c.restore();
  valvePath(c, -1, 0.56, 0.7);
  c.lineJoin = 'round'; c.lineWidth = LW; c.strokeStyle = INK; c.stroke();
  c.beginPath(); frontLip(c); c.lineWidth = 0.1; c.strokeStyle = INK; c.stroke();
  c.lineWidth = 0.055; c.strokeStyle = limp ? '#6c7a7a' : FRILL; c.stroke();
  c.restore();
}

/** Two limp arm tips of the octopus poking out of the seam at the front end of a shut clam that holds it. */
function drawArmTips(c, t) {
  c.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const sway = Math.sin(t * 1.3 + k * 2) * 0.03;
    const x0 = RX - 0.16, y0 = RIM_Y + 0.02 + k * 0.035;
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(RX + 0.1, y0 - 0.02 + sway, RX + 0.2 + k * 0.05, y0 + 0.12 + k * 0.05 + sway);
    c.lineWidth = 0.17 - k * 0.02; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 0.1 - k * 0.015; c.strokeStyle = k ? '#a8425a' : '#be4e60'; c.stroke();
  }
}

/** Lid angle (rad) and the shell's shiver for clam i. */
function clamPose(d, i, t) {
  let theta = d.ang[i] * LID_MAX, sx = 0;
  if (d.state[i] === CL_TREMBLE) {
    const k = Math.min(1, d.t[i] / CLAM_TREMBLE_T), amp = (prefersReducedMotion() ? 0.35 : 1) * (0.012 + 0.016 * k);
    sx = Math.sin(t * 90) * amp;                 // the whole shell shivers
    theta += Math.sin(t * 55) * (0.05 + 0.07 * k); // and the lid twitches
  } else if (d.state[i] === 2) theta += Math.sin(t * 1.7 + i) * 0.015;
  return { theta: Math.max(0, theta), sx };
}

/** A faint pearl glint now and then: 0..1, about 0.9 s every 4.5 s, offset per clam. */
function glintAt(t, i) { const u = ((t + i * 1.9) % 4.5) / 0.9; return u < 1 ? Math.sin(u * Math.PI) : 0; }

// ---------------------------------------------------------------- tentacle limb

const SEG = 14;
const px = new Float32Array(SEG + 1), py = new Float32Array(SEG + 1), nx = new Float32Array(SEG + 1), ny = new Float32Array(SEG + 1), ww = new Float32Array(SEG + 1);
const PINK = '#d98c8c', PINK_LIGHT = '#eaa8a6', KHAKI = '#b5a487', GREY_OUT = '#2a2630';

/**
 * The limb from base (bx, by) to tip (tx, ty) (tile units, any frame): a tapering ribbon, pink on top, khaki underside with
 * suckers, dark outline. (mdx, mdy) is the way it leaves the shell, `bend` the sideways bow and `slack` how coiled it is.
 */
function drawLimb(c, bx, by, tx, ty, mdx, mdy, bend, w0, w1, limp) {
  let dx = tx - bx, dy = ty - by;
  const D = Math.hypot(dx, dy);
  if (D < 0.05) return;
  const ux = dx / D, uy = dy / D, vx = -uy, vy = ux;
  const c1x = bx + mdx * (0.4 * D + 0.12) + vx * bend * 0.3, c1y = by + mdy * (0.4 * D + 0.12) + vy * bend * 0.3;
  const c2x = tx - ux * 0.35 * D + vx * bend, c2y = ty - uy * 0.35 * D + vy * bend;
  for (let k = 0; k <= SEG; k++) {
    const u = k / SEG, a = (1 - u) * (1 - u) * (1 - u), b = 3 * u * (1 - u) * (1 - u), cc = 3 * u * u * (1 - u), e = u * u * u;
    px[k] = a * bx + b * c1x + cc * c2x + e * tx; py[k] = a * by + b * c1y + cc * c2y + e * ty;
    const tdx = 3 * (1 - u) * (1 - u) * (c1x - bx) + 6 * u * (1 - u) * (c2x - c1x) + 3 * u * u * (tx - c2x);
    const tdy = 3 * (1 - u) * (1 - u) * (c1y - by) + 6 * u * (1 - u) * (c2y - c1y) + 3 * u * u * (ty - c2y);
    const tl = Math.hypot(tdx, tdy) || 1;
    nx[k] = -tdy / tl; ny[k] = tdx / tl;
    ww[k] = w0 + (w1 - w0) * Math.pow(u, 0.8);
  }
  const path = () => {
    c.beginPath();
    c.moveTo(px[0] + nx[0] * ww[0] / 2, py[0] + ny[0] * ww[0] / 2);
    for (let k = 1; k <= SEG; k++) c.lineTo(px[k] + nx[k] * ww[k] / 2, py[k] + ny[k] * ww[k] / 2);
    c.arc(px[SEG], py[SEG], ww[SEG] / 2, Math.atan2(ny[SEG], nx[SEG]), Math.atan2(ny[SEG], nx[SEG]) + Math.PI, false);
    for (let k = SEG; k >= 0; k--) c.lineTo(px[k] - nx[k] * ww[k] / 2, py[k] - ny[k] * ww[k] / 2);
    c.closePath();
  };
  path();
  c.fillStyle = limp ? '#b88a8a' : PINK; c.fill();
  c.save(); c.clip();
  // khaki underside on one edge, a lighter stripe on the other
  c.beginPath();
  for (let k = 0; k <= SEG; k++) c.lineTo(px[k] - nx[k] * ww[k] * 0.62, py[k] - ny[k] * ww[k] * 0.62);
  for (let k = SEG; k >= 0; k--) c.lineTo(px[k] + nx[k] * ww[k] * -0.02, py[k] + ny[k] * ww[k] * -0.02);
  c.closePath(); c.fillStyle = limp ? '#9d9684' : KHAKI; c.fill();
  c.beginPath();
  for (let k = 0; k <= SEG; k++) c.lineTo(px[k] + nx[k] * ww[k] * 0.3, py[k] + ny[k] * ww[k] * 0.3);
  c.strokeStyle = PINK_LIGHT; c.globalAlpha = 0.55; c.lineWidth = Math.max(0.03, w0 * 0.12); c.lineCap = 'round'; c.stroke(); c.globalAlpha = 1;
  c.restore();
  // suckers along the underside
  c.fillStyle = '#e8dcc4'; c.strokeStyle = GREY_OUT; c.lineWidth = 0.02;
  for (let k = 2; k < SEG; k += 2) {
    c.beginPath(); c.arc(px[k] - nx[k] * ww[k] * 0.3, py[k] - ny[k] * ww[k] * 0.3, Math.max(0.02, ww[k] * 0.13), 0, TAU); c.fill(); c.stroke();
  }
  path();
  c.lineJoin = 'round'; c.lineWidth = LW; c.strokeStyle = GREY_OUT; c.stroke();
}

/** Shell sprite with its mouth at the origin, mouth facing +x, scaled to the shell's length in tiles. */
function drawShellSprite(c, open, dizzy, breathe) {
  if (!ready(shellImg)) return;
  const k = TENT_SHELL_LEN / SH_W * (1 + breathe);
  c.save();
  c.scale(k, k);
  c.translate(-MOUTH_U * SH_W, -MOUTH_V * SH_H);
  c.drawImage(shellImg, 0, 0, SH_W, SH_H);
  for (const [u, v, r] of EYES) {
    const ex = u * SH_W, ey = v * SH_H, er = r * SH_W;
    if (dizzy) {
      c.strokeStyle = INK; c.lineWidth = er * 0.28; c.lineCap = 'round';
      c.beginPath(); c.moveTo(ex - er * 0.7, ey - er * 0.7); c.lineTo(ex + er * 0.7, ey + er * 0.7); c.moveTo(ex + er * 0.7, ey - er * 0.7); c.lineTo(ex - er * 0.7, ey + er * 0.7); c.stroke();
    } else if (open < 0.98) {
      // a drooping lid in the shell's own colour over the eye's top part, so it looks asleep
      c.save();
      c.beginPath(); c.arc(ex, ey, er * 1.02, 0, TAU); c.clip();
      const edge = ey - er + 2 * er * (1 - open);
      c.fillStyle = '#4d4648'; c.fillRect(ex - er * 1.2, ey - er * 1.2, er * 2.4, edge - (ey - er * 1.2));
      c.strokeStyle = INK; c.lineWidth = er * 0.22; c.beginPath(); c.moveTo(ex - er * 1.1, edge); c.lineTo(ex + er * 1.1, edge); c.stroke();
      c.restore();
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- the passes

const SWAY = [0.5, 0.45, 0.3, 0.04, 0.1, 0.0, 0.35, 0.0];  // by tentacle state: how much the limb bows sideways
const NATURAL = [1.0, 1.6, 2.6, 3.0, 3.0, 0.9, 1.0, 0.9];   // the limb's natural length: shorter than this and it coils

/** The shell of tentacle i placed at its mouth, facing the way it faces: fn draws in the sprite frame. */
function withShell(c, d, i, fn) {
  c.save();
  c.translate(d.mx[i], d.my[i]);
  c.rotate(Math.atan2(d.mdy[i], d.mdx[i]));
  // the sprite faces +x with its crest on -y: mirror it when facing left so the crest stays on top (straight up or down: by side)
  if (d.mdx[i] < -0.3 || (d.mdx[i] <= 0.3 && d.side[i] < 0)) c.scale(1, -1);
  fn();
  c.restore();
}

function drawTentacleBack(c, d, i, t, front) {
  const st = d.state[i];
  const open = st === TN_DORMANT ? 0.28 : st === TN_WAKE ? 0.28 + 0.72 * Math.min(1, d.t[i] / TENT_WAKE_T) : st === TN_FED ? 0.6 : 1;
  const breathe = (st === TN_DORMANT ? 0.018 : 0.008) * Math.sin(t * 1.6 + i * 2.1);
  if (!front) {
    withShell(c, d, i, () => drawShellSprite(c, open, st === TN_STUN, breathe));
    if (st !== TN_DORMANT) {
      const sway = SWAY[st] * Math.sin(t * (st === TN_REACH ? 3.2 : 2.4) + i * 1.7 + (st === TN_STUN ? 0 : 0.0)) * (st === TN_STUN ? 1.4 : 1);
      const D = Math.hypot(d.tipx[i] - d.mx[i], d.tipy[i] - d.my[i]);
      const slack = Math.max(0, NATURAL[st] - D) * 0.55 * (d.side[i] > 0 ? 1 : -1);
      drawLimb(c, d.mx[i], d.my[i], d.tipx[i], d.tipy[i], d.mdx[i], d.mdy[i], sway + slack, 0.34, st === TN_STRIKE ? 0.1 : 0.14, st === TN_STUN);
    }
  }
}

/** Two coils round the octopus, tightening while it is squeezed. */
function drawWrap(c, d, i, ox, oy, t) {
  const sq = d.squeeze[i], r = 0.56 - 0.14 * sq;
  const jig = (prefersReducedMotion() ? 0.3 : 1) * 0.02 * sq;
  c.save();
  c.translate(ox + Math.sin(t * 40) * jig, oy + Math.cos(t * 37) * jig);
  c.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const a0 = t * 1.2 + k * 3.3, r2 = r + k * 0.04;
    c.beginPath(); c.ellipse(0, k * 0.12 - 0.06, r2, r2 * 0.62, k * 0.5 - 0.25, a0, a0 + 4.1);
    c.lineWidth = 0.26; c.strokeStyle = GREY_OUT; c.stroke();
    c.lineWidth = 0.19; c.strokeStyle = PINK; c.stroke();
    c.lineWidth = 0.07; c.strokeStyle = KHAKI; c.translate(0.0, 0.035); c.stroke(); c.translate(0.0, -0.035);
  }
  c.restore();
}

/**
 * Before the octopus. (ctx in device pixels; data = creatures.data; t = seconds.)
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawCreaturesBack(ctx, camera, cw, ch, d, t) {
  if (!d.n) return;
  const ppu = camera.pxPerUnit;
  cullView(camera, cw, ch);
  const fl = cullFlags('creatures', d.n);
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i]) continue;
    if (!visibleAt(fl, i, d.x[i], d.y[i], d.kind[i] === CR_TENTACLE ? 4.2 : 2.6)) continue;
    ctx.save();
    ctx.translate(cw / 2 - camera.x * ppu, ch / 2 - camera.y * ppu);
    ctx.scale(ppu, ppu);
    if (d.kind[i] === CR_GCLAM) {
      const pose = clamPose(d, i, t);
      ctx.translate(d.x[i] + pose.sx, d.fy[i]);
      if (d.side[i] > 0) ctx.scale(-1, 1);
      drawCavity(ctx, false);
      if (d.pearl[i]) drawPearl(ctx, glintAt(t, i));
    } else if (d.kind[i] === CR_TENTACLE) {
      drawTentacleBack(ctx, d, i, t, false);
    }
    ctx.restore();
  }
}

/**
 * After the octopus: the clam's front wall and lid, the tentacle round a held octopus, and a shell that holds a body.
 * @param {{x:number,y:number,held:number,dead:boolean,deathStyle:string}} octo
 */
export function drawCreaturesFront(ctx, camera, cw, ch, d, t, octo) {
  if (!d.n) return;
  const ppu = camera.pxPerUnit;
  const fl = cullFlags('creatures', d.n);
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || fl[i] !== 1) continue;
    ctx.save();
    ctx.translate(cw / 2 - camera.x * ppu, ch / 2 - camera.y * ppu);
    ctx.scale(ppu, ppu);
    if (d.kind[i] === CR_GCLAM) {
      const pose = clamPose(d, i, t);
      ctx.translate(d.x[i] + pose.sx, d.fy[i]);
      if (d.side[i] > 0) ctx.scale(-1, 1);
      drawCup(ctx, false);
      drawLid(ctx, pose.theta, false);
      if (d.fed[i]) drawArmTips(ctx, t);
    } else {
      const st = d.state[i];
      if (st === TN_GRAB && octo) drawWrap(ctx, d, i, octo.x, octo.y, t);
      else if (st === TN_FED) {
        // the shell over the body it holds, the limb curled round the arms at its mouth
        withShell(ctx, d, i, () => drawShellSprite(ctx, 0.6, false, 0));
        drawLimb(ctx, d.mx[i], d.my[i], d.mx[i] + d.mdx[i] * 0.55 + 0.1, d.my[i] + d.mdy[i] * 0.55, d.mdx[i], d.mdy[i], 0.4 * Math.sin(t * 1.5), 0.3, 0.12, false);
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- icons and corpses

/** Journal / icon drawing of the clam in the unit box [-1, 1] (a touch open, with its pearl). */
export function drawClamIcon(c) {
  c.save(); c.scale(0.95, 0.95); c.translate(0, 0.62); c.lineCap = 'round';
  drawCavity(c, false); drawPearl(c, 0.6); drawCup(c, false); drawLid(c, 0.5, false);
  c.restore();
}

/** The pearl on its own (journal item art), in [-1, 1]. */
export function drawPearlIcon(c) { c.save(); c.scale(2.6, 2.6); c.translate(0, 0.46); drawPearl(c, 0.7); c.restore(); }

function corpseFrame(c, sx, sy, ppu, rot, face, alpha, fn) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(sx, sy); c.rotate(rot); if (face < 0) c.scale(-1, 1);
  c.scale(ppu, ppu);
  fn();
  c.restore();
}

// a clam that was killed lies open with its mantle limp, the lid fallen to one side; the body is centred on its middle
setCorpseArt('gclam', (c, sx, sy, ppu, rot, face, alpha) => corpseFrame(c, sx, sy, ppu, rot, face, alpha, () => {
  c.scale(0.8, 0.8); c.translate(0, 0.38); c.lineCap = 'round';
  drawCavity(c, true); drawCup(c, true); drawLid(c, 1.15, true);
}));

// a tentacle that was killed: the shell on its side, the limb hanging limp out of the mouth, the eyes crossed out
setCorpseArt('tentacle', (c, sx, sy, ppu, rot, face, alpha) => corpseFrame(c, sx, sy, ppu, rot, face, alpha, () => {
  c.translate(-0.39, 0.03);
  if (typeof c.filter === 'string') c.filter = 'brightness(0.72) saturate(0.55)';
  drawShellSprite(c, 0, true, 0);
  drawLimb(c, 0, 0, 0.3, 0.75, 0.5, 0.5, -0.4, 0.32, 0.12, true);
}));
