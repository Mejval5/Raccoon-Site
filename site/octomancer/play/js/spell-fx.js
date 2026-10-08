// The level-side effects of the first spell set (SPELLS-PICK.md): Riptide, Coral Wall, Anchor and the Delayed motes. spells.js
// decides WHAT a cast is (resolveSlot folds the runes into numbers and a price) and pays for it; this module makes it happen in the
// level and keeps what lives on (the coral cells, the motes, the two Riptides). One per level, made by main.js with the level's
// systems. Nothing here special-cases a creature kind: pushes go through the hazard jets (hazards.js, the 'riptide' source) and
// hits through the shared damage entry (damage.js, the 'anchor' source).
//
// Data-oriented: fixed pools of typed arrays, no allocation per step.

import { MAT_CORAL, MAT_WATER, MAT_BOULDER_BREAKS } from './materials.js';
import { startAnchor } from './octopus.js';
import { PK_RUBBLE } from './props.js';
import { EFFECTS, SLOT } from './spells.js';

export const MAX_CORAL = 24;     // live coral cells; a new wall crumbles the oldest to make room
export const MAX_RIPTIDES = 2;   // the newest replaces the oldest
export const MAX_MOTES = SLOT.maxPending; // Delayed casts waiting to go off
export const ANCHOR_CRUSH_SPEED = 6; // u/s: an anchored octopus landing on a body this fast hits it ('anchor': splats the one-hit kinds)
export const ANCHOR_SMASH_SPEED = 4; // u/s: ... and smashes timber, bone or coral under it (hazards.js ROCK_SMASH_SPEED)
const MOTE_DRAG = 1.6;           // 1/s: a Delayed mote drifts to a stop
const MOTE_CARRY = 0.15;         // a jet carries a mote like a free swimmer
const CRUMBLE_WARN = 1.5;        // s before it crumbles: the coral shakes (spells-draw.js)

/**
 * @param {{world:any, hazards:any, props:any, damage:any, clouds:any}} sys the level's systems (props / damage may be null in tests)
 */
export function createSpellFx(sys) {
  const { world, hazards } = sys;
  const props = sys.props || null, damage = sys.damage || null, infight = sys.infight || null;
  // ---- coral cells
  const co = {
    n: MAX_CORAL, live: 0,
    tx: new Int16Array(MAX_CORAL), ty: new Int16Array(MAX_CORAL),
    state: new Uint8Array(MAX_CORAL), // 0 free, 1 growing (not solid yet), 2 grown (a MAT_CORAL tile)
    t: new Float32Array(MAX_CORAL),   // s until it grows (state 1) / s it has stood (state 2)
    life: new Float32Array(MAX_CORAL), // s it stands before it crumbles (Infinity: Lingering, the whole level)
    born: new Uint32Array(MAX_CORAL),
  };
  let serial = 0;
  // ---- Delayed motes
  const mo = {
    n: MAX_MOTES, live: 0,
    x: new Float32Array(MAX_MOTES), y: new Float32Array(MAX_MOTES), vx: new Float32Array(MAX_MOTES), vy: new Float32Array(MAX_MOTES),
    t: new Float32Array(MAX_MOTES), delay: new Float32Array(MAX_MOTES), dx: new Float32Array(MAX_MOTES), dy: new Float32Array(MAX_MOTES),
    self: new Uint8Array(MAX_MOTES), alive: new Uint8Array(MAX_MOTES), p: new Array(MAX_MOTES).fill(null),
  };
  // ---- Riptides: hazard indices, oldest first
  const rip = new Int32Array(MAX_RIPTIDES).fill(-1);
  /** Things main.js turns into particles and sounds: {type:'coralGrow'|'coralCrumble'|'moteFire'|'anchorCrush'|'anchorSmash'|'riptide', x, y}. */
  const events = [];
  let octo = null; // the octopus record (set by update; Anchor and self casts read it)
  const stats = { riptides: 0, coralCells: 0, crumbled: 0, motes: 0, anchors: 0, crushes: 0, smashes: 0, lures: 0 };

  // ---------------------------------------------------------------- Coral Wall
  /** Something sits in cell (tx, ty): the octopus, a creature body, a prop (rubble excepted: it is pushed out). */
  const occ = { tx: 0, ty: 0, hit: false };
  const occBody = (f, k, V) => { if (!occ.hit && circleInCell(V.x, V.y, V.r * 0.8, occ.tx, occ.ty)) occ.hit = true; };
  function occupied(tx, ty) {
    if (octo && !octo.hidden && circleInCell(octo.x, octo.y, octo.radius * 0.9, tx, ty)) return true;
    if (damage) { occ.tx = tx; occ.ty = ty; occ.hit = false; damage.each(occBody); if (occ.hit) return true; }
    if (props) {
      const d = props.data;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i] || d.kind[i] === PK_RUBBLE) continue;
        if (circleInCell(d.x[i], d.y[i], d.radius[i] * 0.9, tx, ty)) return true;
      }
    }
    return false;
  }
  /** Can coral grow in (tx, ty) right now: open water, not the level border, not the shop, not a live jet stream, nothing in it. */
  function canGrow(tx, ty) {
    if (tx <= 0 || ty <= 0 || tx >= world.width - 1 || ty >= world.height - 1) return false;
    if (world.tileAt(tx, ty) !== MAT_WATER) return false;
    if (world.isBedrock && world.isBedrock(tx, ty)) return false;
    if (world.inShop && world.inShop(tx + 0.5, ty + 0.5)) return false;
    if (hazards && hazards.inJet && hazards.inJet(tx, ty)) return false;
    for (let i = 0; i < MAX_CORAL; i++) if (co.state[i] === 1 && co.tx[i] === tx && co.ty[i] === ty) return false;
    return !occupied(tx, ty);
  }
  function freeCoralSlot() {
    let oldest = -1, ob = 0xffffffff;
    for (let i = 0; i < MAX_CORAL; i++) { if (!co.state[i]) return i; if (co.born[i] < ob) { ob = co.born[i]; oldest = i; } }
    crumble(oldest); // the oldest cell goes first
    return oldest;
  }
  function crumble(i) {
    if (co.state[i] === 2 && world.tileAt(co.tx[i], co.ty[i]) === MAT_CORAL) {
      world.breakTile(co.tx[i], co.ty[i]);
      events.push({ type: 'coralCrumble', x: co.tx[i] + 0.5, y: co.ty[i] + 0.5 });
      stats.crumbled++;
    }
    if (co.state[i]) co.live--;
    co.state[i] = 0;
  }
  /**
   * A column of p.cells coral cells, the bottom one at the cell holding (x, y), grown upward over p.grow s. Cells that cannot grow
   * (something in them, the shop, a jet) are skipped and the column goes on above them; rock above ends it. False (and free) when
   * not one cell can grow.
   */
  function coral(x, y, p) {
    const tx = Math.floor(x), ty0 = Math.floor(y);
    const want = p.cells, grow = p.spell.grow || 0.4;
    const cells = [];
    // the column spans `want` rows up from the target (from the row above it when the target itself is rock: aimed at a floor);
    // a cell that cannot grow is skipped but still counts, so a wall over a lit bomb is a roof above it; rock above ends it
    let start = ty0;
    if (world.tileAt(tx, ty0) !== MAT_WATER) start = ty0 - 1;
    for (let ty = start; ty > start - want && ty > 0; ty--) {
      if (world.tileAt(tx, ty) !== MAT_WATER) break;
      if (canGrow(tx, ty)) cells.push(ty);
    }
    if (!cells.length) return false;
    const life = p.permanent ? Infinity : p.duration;
    for (let k = 0; k < cells.length; k++) {
      const i = freeCoralSlot();
      co.state[i] = 1; co.tx[i] = tx; co.ty[i] = cells[k]; co.t[i] = grow * (k + 1) / cells.length; co.life[i] = life; co.born[i] = serial++;
      co.live++;
    }
    stats.coralCells += cells.length;
    return true;
  }
  function stepCoral(dt) {
    if (!co.live) return;
    for (let i = 0; i < MAX_CORAL; i++) {
      const s = co.state[i];
      if (!s) continue;
      if (s === 1) {
        co.t[i] -= dt;
        if (co.t[i] > 0) continue;
        const tx = co.tx[i], ty = co.ty[i];
        // grows only if it still can (a body swam in meanwhile: that cell is skipped)
        if (world.tileAt(tx, ty) !== MAT_WATER || occupied(tx, ty) || !world.placeTile || !world.placeTile(tx, ty, MAT_CORAL)) { co.state[i] = 0; co.live--; continue; }
        if (props) clearRubble(tx, ty);
        co.state[i] = 2; co.t[i] = 0;
        events.push({ type: 'coralGrow', x: tx + 0.5, y: ty + 0.5 });
        continue;
      }
      // grown: a bomb or a boulder may have broken it already
      if (world.tileAt(co.tx[i], co.ty[i]) !== MAT_CORAL) { co.state[i] = 0; co.live--; continue; }
      co.t[i] += dt;
      if (co.t[i] >= co.life[i]) crumble(i);
    }
  }
  function clearRubble(tx, ty) {
    const d = props.data;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.kind[i] !== PK_RUBBLE) continue;
      if (Math.floor(d.x[i]) === tx && Math.floor(d.y[i]) === ty) { d.y[i] = ty - d.radius[i] - 0.02; d.vy[i] = -1; } // pushed up out of it
    }
  }

  // ---------------------------------------------------------------- Riptide
  function riptide(x, y, dx, dy, p) {
    let l = Math.hypot(dx, dy);
    if (l < 1e-4) { dx = 1; dy = 0; l = 1; }
    dx /= l; dy /= l;
    if (world.isSolid(x, y)) return false;
    // the stream runs out at the first rock along its line
    let len = 0;
    const L = p.length || 5;
    while (len < L && !world.isSolid(x + dx * (len + 0.25), y + dy * (len + 0.25))) len += 0.25;
    if (len < 0.75) return false;
    const life = p.duration, sp = p.spell;
    // the newest replaces the oldest
    let slot = -1;
    for (let k = 0; k < MAX_RIPTIDES; k++) if (!hazards.tempAlive(rip[k])) { slot = k; break; }
    if (slot < 0) { hazards.endTempJet(rip[0]); for (let k = 1; k < MAX_RIPTIDES; k++) rip[k - 1] = rip[k]; slot = MAX_RIPTIDES - 1; }
    const i = hazards.addTempJet(x, y, dx, dy, len, p.radius, p.power, life, Math.min(sp.swell || 0.3, life * 0.3), Math.min(sp.fade || 0.5, life * 0.4));
    if (i < 0) return false;
    rip[slot] = i;
    stats.riptides++;
    events.push({ type: 'riptide', x, y });
    return true;
  }

  // ---------------------------------------------------------------- Anchor
  function anchor(p) {
    if (!octo) return false;
    const sp = p.spell;
    if (!startAnchor(octo, p.duration, { sink: sp.sink, cap: sp.cap, steer: sp.steer, rest: sp.rest })) return false;
    stats.anchors++;
    return true;
  }
  /** After the octopus moved: an anchored body that lands hard crushes what it lands on and smashes a soft tile under it. */
  const crushCirc = { n: 0 };
  function stepAnchorLanding() {
    if (!octo || !(octo.anchorT > 0) || octo.dead) return;
    const v = octo.anchorVy;
    if (v >= ANCHOR_CRUSH_SPEED && damage) {
      const n = damage.circle('anchor', octo.x, octo.y + octo.radius * 0.6, octo.radius * 0.7, true, 1.0);
      if (n) { stats.crushes += n; events.push({ type: 'anchorCrush', x: octo.x, y: octo.y + octo.radius }); }
      crushCirc.n = n;
    }
    if (v >= ANCHOR_SMASH_SPEED && octo.landedThisStep) {
      const fy = Math.floor(octo.y + octo.radius + 0.12);
      for (const fx of [Math.floor(octo.x), Math.floor(octo.x - octo.radius * 0.6), Math.floor(octo.x + octo.radius * 0.6)]) {
        if (!MAT_BOULDER_BREAKS[world.tileAt(fx, fy)]) continue;
        if (world.smashTile(fx, fy)) { stats.smashes++; events.push({ type: 'anchorSmash', x: fx + 0.5, y: fy + 0.5 }); octo.vy = Math.max(octo.vy, v * 0.6); break; }
      }
    }
  }

  // ---------------------------------------------------------------- Lure
  // A bioluminescent bulb at the cast point, on the infighting owner's target override (infight.js setLure): patrolling or lost
  // piranhas, crabs, mantas and hostile NPCs within `reach` go to it instead of their beat. Rooted kinds, the keeper and the Beholder
  // never read it (their own code does not ask). It attracts only after a short grace, drifts with jets and Riptides, a blast ends it.
  const lu = { on: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, grace: 0.6, light: 2.5, reach: 7, slot: -1 };
  function endLure() {
    if (lu.slot >= 0 && infight) infight.clearLure(lu.slot);
    lu.on = 0; lu.slot = -1;
  }
  function lure(x, y, p) {
    if (!infight || world.isSolid(x, y)) return false;
    endLure(); // at most one: the newest replaces it
    lu.on = 1; lu.x = x; lu.y = y; lu.vx = 0; lu.vy = 0; lu.t = 0; lu.life = p.duration;
    lu.grace = p.spell.grace || 0.6; lu.light = p.radius; lu.reach = p.spell.reach || 7; // Heavy widens the light (2.5 -> 4), not the pull
    stats.lures++;
    events.push({ type: 'lure', x, y });
    return true;
  }
  function stepLure(dt) {
    if (!lu.on) return;
    lu.t += dt;
    if (lu.t >= lu.life) { endLure(); return; }
    const f = hazards && hazards.forceAt ? hazards.forceAt(lu.x, lu.y) : null;
    if (f) { lu.vx += f.fx * MOTE_CARRY * dt; lu.vy += f.fy * MOTE_CARRY * dt; }
    const k = Math.exp(-MOTE_DRAG * dt); lu.vx *= k; lu.vy *= k;
    const nx = lu.x + lu.vx * dt, ny = lu.y + lu.vy * dt;
    if (!world.isSolid(nx, ny)) { lu.x = nx; lu.y = ny; } else { lu.vx = lu.vy = 0; }
    if (lu.t >= lu.grace) {
      if (lu.slot < 0) lu.slot = infight.setLure(lu.x, lu.y, lu.reach, lu.life - lu.t);
      else infight.moveLure(lu.slot, lu.x, lu.y);
    }
  }

  // ---------------------------------------------------------------- Delayed motes
  /** A Delayed cast: a mote drifts off from the cast point (a self spell follows the octopus) and the effect goes off 1.5 s later there. */
  function defer(p, ctx) {
    let i = -1;
    for (let k = 0; k < MAX_MOTES; k++) if (!mo.alive[k]) { i = k; break; }
    if (i < 0) return false;
    mo.alive[i] = 1; mo.live++;
    mo.x[i] = ctx.x; mo.y[i] = ctx.y; mo.vx[i] = (ctx.vx || 0) * 0.35; mo.vy[i] = (ctx.vy || 0) * 0.35;
    mo.dx[i] = ctx.dirX || 1; mo.dy[i] = ctx.dirY || 0; mo.t[i] = 0; mo.delay[i] = p.delay;
    mo.self[i] = p.spell.self ? 1 : 0; mo.p[i] = p;
    stats.motes++;
    return true;
  }
  const fireCtx = { clouds: null, fx: null, x: 0, y: 0, vx: 0, vy: 0, dirX: 1, dirY: 0 };
  function stepMotes(dt) {
    if (!mo.live) return;
    for (let i = 0; i < MAX_MOTES; i++) {
      if (!mo.alive[i]) continue;
      mo.t[i] += dt;
      if (mo.self[i] && octo) { mo.x[i] = octo.x; mo.y[i] = octo.y - 0.7; }
      else {
        const f = hazards && hazards.forceAt ? hazards.forceAt(mo.x[i], mo.y[i]) : null;
        if (f) { mo.vx[i] += f.fx * MOTE_CARRY * dt; mo.vy[i] += f.fy * MOTE_CARRY * dt; }
        const k = Math.exp(-MOTE_DRAG * dt); mo.vx[i] *= k; mo.vy[i] *= k;
        const nx = mo.x[i] + mo.vx[i] * dt, ny = mo.y[i] + mo.vy[i] * dt;
        if (!world.isSolid(nx, ny)) { mo.x[i] = nx; mo.y[i] = ny; } else { mo.vx[i] = mo.vy[i] = 0; }
      }
      if (mo.t[i] < mo.delay[i]) continue;
      const p = mo.p[i];
      mo.alive[i] = 0; mo.live--; mo.p[i] = null;
      fireCtx.clouds = sys.clouds; fireCtx.fx = api; fireCtx.x = mo.x[i]; fireCtx.y = mo.y[i];
      fireCtx.vx = mo.vx[i]; fireCtx.vy = mo.vy[i]; fireCtx.dirX = mo.dx[i]; fireCtx.dirY = mo.dy[i];
      EFFECTS[p.spell.effect](p, fireCtx);
      events.push({ type: 'moteFire', x: mo.x[i], y: mo.y[i] });
    }
  }

  const api = {
    coralData: co, moteData: mo, events, stats,
    riptide, coral, anchor, lure, defer, lureData: lu,
    /** A blast at (x, y), radius R, ends a Lure it reaches. */
    blast(x, y, R) { if (lu.on && Math.hypot(lu.x - x, lu.y - y) <= R + 0.3) { endLure(); events.push({ type: 'lureGone', x, y }); return true; } return false; },
    /** Is the Lure attracting now (past its grace)? */
    lureLive() { return lu.on === 1 && lu.slot >= 0; },
    canGrow,
    /** One fixed step (after the octopus and the hazards moved). */
    update(dt, o) {
      events.length = 0;
      octo = o;
      stepMotes(dt);
      stepLure(dt);
      stepCoral(dt);
      stepAnchorLanding();
    },
    /** For the octopus before the first update (casts in the same step). */
    setOcto(o) { octo = o; },
    /** Seconds before a grown coral cell crumbles (Infinity: lasts the level), -1 when cell i is not grown. */
    coralLeft(i) { return co.state[i] === 2 ? co.life[i] - co.t[i] : -1; },
    coralCount() { let n = 0; for (let i = 0; i < MAX_CORAL; i++) if (co.state[i] === 2) n++; return n; },
    riptideCount() { let n = 0; for (let k = 0; k < MAX_RIPTIDES; k++) if (hazards.tempAlive(rip[k])) n++; return n; },
    moteCount() { return mo.live; },
    CRUMBLE_WARN,
  };
  return api;
}

/** Does the circle (x, y, r) overlap tile (tx, ty)? */
function circleInCell(x, y, r, tx, ty) {
  const cx = x < tx ? tx : x > tx + 1 ? tx + 1 : x, cy = y < ty ? ty : y > ty + 1 ? ty + 1 : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}
