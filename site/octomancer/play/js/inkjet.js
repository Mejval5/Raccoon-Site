// Ink Jet: the octopus's basic ranged attack (V2-PLAN 3.1). A short-range stream of ink blobs.
// Data-oriented: one fixed pool of typed arrays, nothing is allocated per shot or per frame.
// Hazards (urchin, horns) and the Beholder have no hp, so a blob only splats on them and does no damage.
//
// Feedback (VIBE-REVIEW 3.5): the drawn blob is DRAW_SCALE times its hit radius and trails a wobbling tail with droplets;
// a hit splats (main.js -> particles.inkSplat with the flight direction); a splat on rock leaves a stain that stays
// SPLAT_LIFE seconds (SPLAT_CAP at once, oldest recycled); a hit enemy gets an `inkStain` timer (STAIN_LIFE) that
// enemy-draw.js paints as dark blotches over its sprite.
//
// Actions tuning (2026-10-08, Daniel: "slow down the shooting of the ink, it should be kind of rare"): ONE shot, then a
// COOLDOWN of 1.5 s, shown as a refilling ink sac on the hotbar (hotbar-ui.js). Chosen over a small recharging reserve:
// a reserve still lets you empty 2-3 blobs in a burst, which is the spam the request wants gone; a single slow shot makes
// every squirt a decision, and holding the button just fires on each refill.
//
// Physics (update's `phys` = {props, corpses}): a blob is a physical projectile. It stops at every solid tile (all terrain
// materials are tiles !== 0, so world.isSolid covers rock, bedrock, bone, timber, masonry); a pushable block stops it dead
// (no push, a block is heavy); any other loose prop (a bomb, pot, rock, find, rubble) and every corpse is shoved along the
// flight (props.nudge / corpses.nudge, INK_PUSH u/s per unit mass) and the blob splats on it; a prop held on its wall stays.
// A creature is hit through the caller's `hurt(e, damage)`, the single damage call site (main.js inkHurt).
import { hasLineOfSight } from './pathfind.js';
import { PK_BLOCK, PK_BODY } from './props.js';
import { crumbleAt, CR_INK } from './fragile.js';
import { cullView, cullFlags, visibleAt } from './cull.js';

export const INKJET = Object.freeze({
  range: 6.5, // tiles a blob flies before it fades
  speed: 13, // tiles/s
  damage: 4,
  cooldown: 1.5, // s between shots (was 0.42): rare and deliberate; holding the button fires on each refill
  radius: 0.16, // tiles (draw + hit)
});

const POOL = 32;
export const INK_PUSH = 4; // u/s a blob gives a unit-mass prop (a bomb) along its flight; heavier props move less
export const INK_PUSH_CORPSE = 3; // u/s a blob gives a corpse
const MAX_SPLAT = 32; // splat points per update (x,y pairs)
const MAX_SUB = 0.08; // longest sub-step in tiles, so a blob cannot skip a wall or a small enemy
const TAU = Math.PI * 2;
const DRAW_SCALE = 1.5; // the drawn blob is this much bigger than its hit radius (a wetter, fatter squirt; the hitbox is unchanged)
export const SPLAT_CAP = 24;  // ink stains on rock kept at once; a new one recycles the oldest
export const SPLAT_LIFE = 8;  // s a stain stays on the rock (it fades over the last SPLAT_FADE)
const SPLAT_FADE = 3;
export const STAIN_LIFE = 4;  // s an enemy stays inked after a hit (enemy-draw.js fades it over the last 1.5)
const MAX_STAINED = 16;

export function createInkJet() {
  const data = {
    x: new Float32Array(POOL), y: new Float32Array(POOL),
    vx: new Float32Array(POOL), vy: new Float32Array(POOL),
    life: new Float32Array(POOL), // seconds of flight left
    alive: new Uint8Array(POOL),
  };
  // splat: x, y pairs; splatDir: the blob's flight direction (unit) at the hit; splatOn: 1 on a creature, 0 on rock
  const events = {
    hits: 0, kills: 0, pushes: 0, blocked: 0, nSplat: 0, nProp: 0, propHit: new Int32Array(MAX_SPLAT), // propHit: props hit this step (main.js: a pot or clam breaks)
    splat: new Float32Array(MAX_SPLAT * 2),
    splatDir: new Float32Array(MAX_SPLAT * 2), splatOn: new Uint8Array(MAX_SPLAT),
  };
  const flags = cullFlags('inkjet', POOL);
  // stains on rock (a fixed ring) and the enemies currently inked (their `inkStain` timer is counted down here)
  const sx = new Float32Array(SPLAT_CAP), sy = new Float32Array(SPLAT_CAP);
  const sdx = new Float32Array(SPLAT_CAP), sdy = new Float32Array(SPLAT_CAP);
  const sage = new Float32Array(SPLAT_CAP), son = new Uint8Array(SPLAT_CAP);
  let shead = 0, nStains = 0;
  const stained = new Array(MAX_STAINED).fill(null);
  let nStained = 0;
  let cd = 0;
  let n = 0;

  function splat(x, y, dx, dy, onCreature) {
    if (events.nSplat < MAX_SPLAT) {
      const k = events.nSplat++;
      events.splat[k * 2] = x; events.splat[k * 2 + 1] = y;
      events.splatDir[k * 2] = dx; events.splatDir[k * 2 + 1] = dy; events.splatOn[k] = onCreature ? 1 : 0;
    }
    if (!onCreature) addStain(x, y, dx, dy);
  }

  /** A stain that stays on the rock for a while (SPLAT_LIFE); past SPLAT_CAP the oldest is recycled. */
  function addStain(x, y, dx, dy) {
    const i = shead; shead = (shead + 1) % SPLAT_CAP;
    if (!son[i]) nStains++;
    sx[i] = x; sy[i] = y; sdx[i] = dx; sdy[i] = dy; sage[i] = 0; son[i] = 1;
  }

  /** Ink on a creature: a timer painted as dark blotches over its sprite (enemy-draw.js reads inkStain and inkHits). */
  function stain(e) {
    if (typeof e.kind !== 'string') return; // not a drawn enemy (a stand-in for a shopkeeper, a creature)
    if (!(e.inkStain > 0)) {
      if (nStained >= MAX_STAINED) return;
      stained[nStained++] = e;
      e.inkHits = 0;
    }
    e.inkStain = STAIN_LIFE;
    if (e.inkHits < 6) e.inkHits++;
  }

  function fire(ox, oy, dx, dy, ownerR = 0.5) {
    if (cd > 0) return false;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return false;
    dx /= len; dy /= len;
    let i = 0;
    while (i < POOL && data.alive[i]) i++;
    if (i === POOL) return false; // pool full (cannot happen at this cooldown and range)
    data.x[i] = ox + dx * ownerR; data.y[i] = oy + dy * ownerR;
    data.vx[i] = dx * INKJET.speed; data.vy[i] = dy * INKJET.speed;
    data.life[i] = INKJET.range / INKJET.speed;
    data.alive[i] = 1;
    cd = INKJET.cooldown;
    return true;
  }

  /** The first loose prop or corpse the blob at (x, y) touches: shove it and return true (the blob splats). */
  function hitPhys(phys, x, y, ux, uy) {
    const R = INKJET.radius;
    const P = phys.props;
    if (P) {
      const d = P.data;
      for (let j = 0; j < d.n; j++) {
        if (!d.alive[j]) continue;
        const k = d.kind[j];
        if (k === PK_BODY) continue;
        const dx = d.x[j] - x, dy = d.y[j] - y, rr = d.radius[j] + R;
        if (k === PK_BLOCK) { // a box: blocked
          if (Math.abs(dx) < rr && Math.abs(dy) < rr) { events.blocked++; return true; }
          continue;
        }
        if (dx * dx + dy * dy > rr * rr) continue;
        if (P.nudge(j, ux, uy, INK_PUSH)) events.pushes++;
        if (events.nProp < MAX_SPLAT) events.propHit[events.nProp++] = j;
        return true;
      }
    }
    const C = phys.corpses;
    if (C) {
      const d = C.data;
      for (let j = 0; j < d.n; j++) {
        if (!d.alive[j]) continue;
        const dx = d.x[j] - x, dy = d.y[j] - y, rr = d.radius[j] + R;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (C.nudge(j, ux, uy, INK_PUSH_CORPSE)) events.pushes++;
        return true;
      }
    }
    return false;
  }

  function update(dt, world, list, hurt, phys = null) {
    events.hits = 0; events.kills = 0; events.pushes = 0; events.blocked = 0; events.nSplat = 0; events.nProp = 0;
    if (cd > 0) cd -= dt;
    n = 0;
    if (nStains) for (let i = 0; i < SPLAT_CAP; i++) if (son[i] && (sage[i] += dt) >= SPLAT_LIFE) { son[i] = 0; nStains--; }
    for (let k = 0; k < nStained;) { // count the inked enemies down; drop the faded and the dead
      const e = stained[k];
      if (e.dead || (e.inkStain -= dt) <= 0) { e.inkStain = 0; stained[k] = stained[--nStained]; stained[nStained] = null; } else k++;
    }
    const R = INKJET.radius;
    for (let i = 0; i < POOL; i++) {
      if (!data.alive[i]) continue;
      // A spawn spot inside rock splats on the first sub-step below, at the blob's own position.
      const step = Math.min(dt, data.life[i]);
      const dist = Math.hypot(data.vx[i], data.vy[i]) * step;
      const subs = Math.max(1, Math.ceil(dist / MAX_SUB));
      const sdt = step / subs;
      let done = false;
      for (let s = 0; s < subs && !done; s++) {
        const px = data.x[i], py = data.y[i];
        const x = px + data.vx[i] * sdt, y = py + data.vy[i] * sdt;
        if (world.isSolid(x, y)) { // splat at the last free spot, so it sits on the wall face
          crumbleAt(world, x, y, CR_INK); // a fish-bone block crumbles under the blob (fragile.js); the blob is spent either way
          const sp = Math.hypot(data.vx[i], data.vy[i]) || 1;
          splat(px, py, data.vx[i] / sp, data.vy[i] / sp, false); data.alive[i] = 0; done = true; break;
        }
        data.x[i] = x; data.y[i] = y;
        for (let j = 0; j < list.length; j++) {
          const e = list[j];
          if (e.dead || e.ghost) continue;
          const rr = (e.radius || 0.4) + R, ex = e.x - x, ey = e.y - y;
          if (ex * ex + ey * ey > rr * rr) continue;
          if (e.hp !== undefined) {
            hurt(e, INKJET.damage);
            events.hits++;
            if (e.dead) events.kills++;
          }
          if (!e.dead) stain(e);
          const sp = Math.hypot(data.vx[i], data.vy[i]) || 1;
          splat(x, y, data.vx[i] / sp, data.vy[i] / sp, true); data.alive[i] = 0; done = true; break;
        }
        if (!done && phys) {
          const sp = Math.hypot(data.vx[i], data.vy[i]) || 1, ux = data.vx[i] / sp, uy = data.vy[i] / sp;
          if (hitPhys(phys, x, y, ux, uy)) { splat(x, y, ux, uy, true); data.alive[i] = 0; done = true; }
        }
      }
      if (done) continue;
      data.life[i] -= dt;
      if (data.life[i] <= 1e-6) { data.alive[i] = 0; continue; }
      n++;
    }
  }

  function draw(ctx, camera, canvasW, canvasH) {
    if (n === 0 && nStains === 0) return;
    cullView(camera, canvasW, canvasH);
    const ppu = camera.pxPerUnit;
    const r = Math.max(3.5, INKJET.radius * DRAW_SCALE * ppu);
    const hw = canvasW / 2, hh = canvasH / 2;
    if (nStains) drawStains(ctx, camera, ppu, hw, hh, r);
    ctx.lineWidth = Math.max(1, r * 0.2);
    for (let i = 0; i < POOL; i++) {
      if (!data.alive[i]) continue;
      if (!visibleAt(flags, i, data.x[i], data.y[i], 0.6)) continue;
      const bx = hw + (data.x[i] - camera.x) * ppu, by = hh + (data.y[i] - camera.y) * ppu;
      const sp = Math.hypot(data.vx[i], data.vy[i]) || 1;
      const ux = data.vx[i] / sp, uy = data.vy[i] / sp; // flight direction
      const ph = data.life[i] * 46; // wobble phase: tied to the blob's remaining flight, so it needs no clock
      const tl = r * 3.6; // tail length in px
      const w1 = Math.sin(ph) * r * 0.7;
      // Tail: a wobbling tapered wedge from the blob back along its path (a squirt of ink, not a rigid dart).
      ctx.fillStyle = 'rgba(26,16,48,0.55)';
      ctx.beginPath();
      ctx.moveTo(bx - uy * r * 0.85, by + ux * r * 0.85);
      ctx.quadraticCurveTo(bx - ux * tl * 0.55 - uy * (w1 + r * 0.4), by - uy * tl * 0.55 + ux * (w1 + r * 0.4), bx - ux * tl - uy * w1 * 1.3, by - uy * tl + ux * w1 * 1.3);
      ctx.quadraticCurveTo(bx - ux * tl * 0.55 - uy * (w1 - r * 0.4), by - uy * tl * 0.55 + ux * (w1 - r * 0.4), bx + uy * r * 0.85, by - ux * r * 0.85);
      ctx.closePath(); ctx.fill();
      // Droplets pinched off behind the tail, drifting side to side.
      ctx.fillStyle = 'rgba(26,16,48,0.8)';
      for (let k = 1; k <= 3; k++) {
        const back = r * (3.3 + 1.35 * k), side = Math.sin(ph + k * 1.9) * r * (0.3 + 0.12 * k), dr = r * (0.46 - 0.09 * k);
        ctx.beginPath(); ctx.arc(bx - ux * back - uy * side, by - uy * back + ux * side, dr, 0, TAU); ctx.fill();
      }
      // Body: slightly stretched along the flight direction, with a small soft highlight.
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = '#1a1030'; ctx.strokeStyle = '#0b0618';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.92, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(150,130,200,0.45)';
      ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 0.3, r * 0.35, r * 0.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  /** Ink stains on rock: a flat blotch spread across the surface the blob hit, two satellite dots, fading out. */
  function drawStains(ctx, camera, ppu, hw, hh, r) {
    const vx = hw / ppu + 1, vy = hh / ppu + 1;
    ctx.fillStyle = '#1a1030';
    for (let i = 0; i < SPLAT_CAP; i++) {
      if (!son[i]) continue;
      if (Math.abs(sx[i] - camera.x) > vx || Math.abs(sy[i] - camera.y) > vy) continue;
      const left = SPLAT_LIFE - sage[i];
      ctx.globalAlpha = 0.82 * (left >= SPLAT_FADE ? 1 : left / SPLAT_FADE);
      const px = hw + (sx[i] - camera.x) * ppu, py = hh + (sy[i] - camera.y) * ppu;
      const dx = sdx[i], dy = sdy[i]; // flight direction; the blotch is long across it
      ctx.beginPath(); ctx.ellipse(px, py, r * 0.6, r * 1.15, Math.atan2(dy, dx), 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(px - dy * r * 1.7, py + dx * r * 1.7, r * 0.3, 0, TAU);
      ctx.moveTo(px + dy * r * 1.45 + dx * r * 0.4 + r * 0.22, py - dx * r * 1.45 + dy * r * 0.4);
      ctx.arc(px + dy * r * 1.45 + dx * r * 0.4, py - dx * r * 1.45 + dy * r * 0.4, r * 0.22, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return {
    data, events, fire, update, draw, addStain,
    cooldown() { return cd > 0 ? cd : 0; },
    /** 0..1: how full the ink sac is (1 = a shot is ready). The hotbar draws it. */
    charge() { return cd > 0 ? 1 - cd / INKJET.cooldown : 1; },
    count() { return n; },
    /** Ink stains on rock right now (tests, perf). */
    stainCount() { return nStains; },
    /** Enemies currently inked. */
    stainedCount() { return nStained; },
    clear() {
      data.alive.fill(0); n = 0; cd = 0; events.hits = events.kills = events.pushes = events.blocked = events.nSplat = 0;
      son.fill(0); nStains = 0; shead = 0;
      for (let k = 0; k < nStained; k++) { stained[k].inkStain = 0; stained[k] = null; }
      nStained = 0;
    },
  };
}

/** The nearest living enemy with hp, within range and in line of sight of the octopus, or null. */
export function autoAimTarget(octo, list, isSolid) {
  let best = null, bestD = INKJET.range * INKJET.range;
  for (let j = 0; j < list.length; j++) {
    const e = list[j];
    if (e.dead || e.ghost || e.hp === undefined || e.ambient) continue; // never auto-aim at a harmless background fish
    const dx = e.x - octo.x, dy = e.y - octo.y, d2 = dx * dx + dy * dy;
    if (d2 >= bestD) continue;
    if (!hasLineOfSight(isSolid, octo.x, octo.y, e.x, e.y)) continue;
    best = e; bestD = d2;
  }
  return best;
}

/** Unit aim vector {x, y}: at the nearest targetable enemy, else straight ahead along `facing`. */
export function autoAim(octo, list, isSolid, facing) {
  const e = autoAimTarget(octo, list, isSolid);
  if (e) {
    const dx = e.x - octo.x, dy = e.y - octo.y, d = Math.hypot(dx, dy);
    if (d > 1e-6) return { x: dx / d, y: dy / d };
  }
  return { x: facing >= 0 ? 1 : -1, y: 0 };
}

/** A small, quiet aim reticle: a thin broken ring in ink-blue and pale sea-green at a screen point (canvas px). */
export function drawReticle(ctx, sx, sy, ppu, time) {
  const r = 0.35 * ppu * (1 + Math.sin(time * 2.2) * 0.05);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, ppu * 0.04); ctx.lineCap = 'round';
  const rot = time * 0.4;
  for (let k = 0; k < 4; k++) {
    const a = rot + k * (TAU / 4);
    ctx.strokeStyle = k % 2 ? '#9fd8c4' : '#6f86d6';
    ctx.beginPath(); ctx.arc(sx, sy, r, a, a + TAU / 4 - 0.7); ctx.stroke();
  }
  ctx.restore();
}
