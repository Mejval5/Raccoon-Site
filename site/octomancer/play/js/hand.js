// The hand (controls 2026-10-08, V2-PLAN 17, CONTROLS-IDEAS scheme A "the eighth tentacle"). One button (F; on phones the
// Spell button turns into Grab / Throw) does everything a hand does:
//
//   nothing held, press      the best target within HAND_REACH of the octopus is used: an interact target (talk, buy, a
//                            door, an altar ...) or a grabbable thing (pot, clam, corpse, bomb, a stunned creature, a ware),
//                            which is lifted into the tentacles
//   holding, tap             throw it: toward the cursor with a mouse, along the move keys / stick, else forward (throwDir)
//   holding, hold HOLD_DROP_S  drop it gently where the octopus is
//
// Carrying costs: the octopus swims slower (octo.carryMul = the thing's weight), cannot Ink Jet (main.js asks `holding`),
// and only a pot or a clam takes a hit for it (octo.shieldHit, then the pot breaks). A thrown thing hits what it flies into
// through main.js's one damage entry (ctx.thrownHit).
//
// Everything that can be grabbed or used is a PROVIDER in a small registry, so other systems add their own without touching
// this file (back rooms: registerInteract('door', ...), the altar: registerInteract('altar', ...)):
//
//   registerInteract(kind, {
//     priority,                        higher wins when several are in reach (door 30, talk 20, buy 15, things 10)
//     find(octo, reach, ctx)           -> the nearest target of this kind {x, y, ref, label?} or null
//     use(target, octo, ctx)           -> true (done: talked, bought, opened), false / null (nothing happened), or a HELD
//                                         record (it is in the tentacles now):
//                                         { r, weight, shield, speed, dmg, place(x, y, vx, vy), alive(), release(vx, vy, thrown),
//                                           onShield(), tick(octo) (optional; false = let go), impact(how) (optional) }
//   })
//
// Data-oriented where it is hot: the per-step search walks the providers' own arrays; one held record and a small fixed
// list of things in flight.

export const HAND_REACH = 1.2;     // tiles from the octopus's centre to a target
export const HOLD_DROP_S = 0.3;    // holding F this long drops the thing gently instead of throwing it
export const STILL_SPEED = 1.5;    // u/s: below it the phone's Spell button may turn into Grab
export const FLY_MAX_S = 1.5;      // a thrown thing is watched for hits this long ...
export const FLY_MIN_SPEED = 2.5;  // ... or until it is slower than this
export const WALL_SMASH = 3.5;     // u/s lost in one step: it hit something hard (a pot breaks)
export const PRI_DOOR = 30, PRI_TALK = 20, PRI_BUY = 15, PRI_THING = 10;

const providers = []; // [{kind, priority, find, use}]

/** Add (or replace) the provider of `kind`. */
export function registerInteract(kind, provider) {
  unregisterInteract(kind);
  providers.push({ kind, priority: provider.priority || PRI_THING, find: provider.find, use: provider.use });
  providers.sort((a, b) => b.priority - a.priority);
}
export function unregisterInteract(kind) {
  const i = providers.findIndex((p) => p.kind === kind);
  if (i >= 0) providers.splice(i, 1);
}
export function interactKinds() { return providers.map((p) => p.kind); }
/** Tests: forget every provider. */
export function clearInteracts() { providers.length = 0; }

export function createHand() {
  return {
    held: null,          // the HELD record (see above) or null
    heldKind: '',
    target: null,        // the best target in reach this step: {kind, x, y, ref, label, priority}
    down: false, downT: 0, downCarry: false, dropped: false,
    flying: [],          // things thrown: {rec, t, sp}
    events: [],          // {type: 'grab'|'throw'|'drop'|'use'|'shield'|'lost'|'hit', kind, x, y}
    grabs: 0, throws: 0, drops: 0, uses: 0, // counters (tests)
  };
}

/** Where a held thing of radius r sits: in the tentacles under the body (they trail behind the mantle), toward the facing side. */
export function handPoint(octo, r, isSolid = null, out = { x: 0, y: 0 }) {
  const a = (octo.angle || 0) * Math.PI / 180;
  const fx = Math.sin(a), fy = -Math.cos(a); // the mantle's facing; the arms are the other way
  const k = (octo.radius || 0.45) * 0.55 + r * 0.9;
  const side = (octo.handSide !== undefined ? octo.handSide : (octo.throwDir || 1)) * 0.18; // handSide: eases across on a turn (attach)
  let x = octo.x - fx * k + side, y = octo.y - fy * k;
  if (isSolid && isSolid(x, y)) { // in the floor: carry it beside the body instead, else against it
    const sx = octo.x + (octo.throwDir || 1) * (octo.radius * 0.6 + r), sy = octo.y + 0.05;
    if (!isSolid(sx, sy)) { x = sx; y = sy; } else { x = octo.x + (x - octo.x) * 0.3; y = octo.y + (y - octo.y) * 0.3; }
  }
  out.x = x; out.y = y;
  return out;
}

/** The best target in reach (priority first, then distance), or null. */
export function findTarget(octo, ctx, reach = HAND_REACH) {
  let best = null, bestP = -1, bestD = 1e9;
  for (let k = 0; k < providers.length; k++) {
    const p = providers[k];
    if (p.priority < bestP) break; // sorted: nothing later can beat what we have
    let t = null;
    try { t = p.find(octo, reach, ctx); } catch (err) { t = null; }
    if (!t) continue;
    const d = Math.hypot(t.x - octo.x, t.y - octo.y);
    if (d > reach + 1e-6) continue;
    if (p.priority > bestP || d < bestD) { best = t; best.kind = p.kind; best.priority = p.priority; bestP = p.priority; bestD = d; }
  }
  return best;
}

function setCarry(hand, octo) {
  const h = hand.held;
  octo.carryMul = h ? (h.weight || 0.8) : 1;
  octo.shieldHit = h && h.shield ? (fx, fy, cause) => shieldHit(hand, octo) : null;
}

function shieldHit(hand, octo) {
  const h = hand.held;
  if (!h || !h.shield) return false;
  hand.events.push({ type: 'shield', kind: hand.heldKind, x: octo.x, y: octo.y });
  hand.held = null; hand.heldKind = '';
  if (h.onShield) h.onShield();
  setCarry(hand, octo);
  return true;
}

/** Use the current target (press with nothing held). */
export function handUse(hand, octo, ctx) {
  const t = hand.target || findTarget(octo, ctx);
  if (!t) return false;
  const p = providers.find((q) => q.kind === t.kind);
  if (!p) return false;
  const r = p.use(t, octo, ctx);
  if (!r) return false;
  if (r === true) { hand.uses++; hand.events.push({ type: 'use', kind: t.kind, x: t.x, y: t.y }); return true; }
  hand.held = r; hand.heldKind = t.kind; hand.grabs++;
  hand.events.push({ type: 'grab', kind: t.kind, x: t.x, y: t.y });
  setCarry(hand, octo);
  octo.handSide = octo.throwDir || 1;
  attach(hand, octo, ctx);
  return true;
}

/** Throw what is held along (dx, dy) (any length; normalised here). */
export function handThrow(hand, octo, dx, dy, ctx) {
  const h = hand.held;
  if (!h) return false;
  let l = Math.hypot(dx, dy);
  if (l < 1e-6) { dx = octo.throwDir || 1; dy = -0.15; l = Math.hypot(dx, dy); }
  dx /= l; dy /= l;
  const sp = h.speed || 8;
  const vx = dx * sp + (octo.vx || 0) * 0.5, vy = dy * sp + (octo.vy || 0) * 0.5;
  // it leaves from the side of the body it is thrown to (if that is water), so a throw up does not start under the octopus
  const off = (octo.radius || 0.45) + (h.r || 0.3) * 0.7;
  let x = octo.x + dx * off, y = octo.y + dy * off;
  const solid = ctx && ctx.isSolid;
  if (solid && solid(x, y)) { const p = handPoint(octo, h.r || 0.3, solid); x = p.x; y = p.y; }
  h.place(x, y, vx, vy);
  h.release(vx, vy, true);
  hand.held = null; hand.heldKind = ''; hand.throws++;
  hand.events.push({ type: 'throw', kind: '', x, y });
  hand.flying.push({ rec: h, t: 0, sp: Math.hypot(vx, vy), dmg: h.dmg || 4 });
  if (hand.flying.length > 6) hand.flying.shift();
  setCarry(hand, octo);
  return true;
}

/** Let go gently: it sinks from the hand point with the octopus's own drift. */
export function handDrop(hand, octo, ctx) {
  const h = hand.held;
  if (!h) return false;
  const p = handPoint(octo, h.r || 0.3, ctx && ctx.isSolid);
  h.place(p.x, p.y, (octo.vx || 0) * 0.3, (octo.vy || 0) * 0.3 + 0.3);
  h.release((octo.vx || 0) * 0.3, (octo.vy || 0) * 0.3 + 0.3, false);
  hand.held = null; hand.heldKind = ''; hand.drops++;
  hand.events.push({ type: 'drop', kind: '', x: p.x, y: p.y });
  setCarry(hand, octo);
  return true;
}

const HP = { x: 0, y: 0 };
const SIDE_EASE = 0.2; // per step (-1 .. 1): a turn moves the held thing across in 10 steps
/** Keep the held thing in the tentacles (call after the physics of the step) and watch what is in flight. */
export function attach(hand, octo, ctx) {
  const h = hand.held;
  if (h) {
    if (!h.alive() || (h.tick && h.tick(octo) === false) || octo.dead) {
      if (h.alive() && octo.dead) h.release(octo.vx || 0, octo.vy || 0, false); // it falls out of a dead octopus's arms
      hand.events.push({ type: 'lost', kind: hand.heldKind, x: octo.x, y: octo.y });
      hand.held = null; hand.heldKind = '';
      setCarry(hand, octo);
    } else {
      // the side it is carried on follows the facing, eased over ~0.2 s: a turn swings it across instead of snapping it
      const dir = octo.throwDir || 1, s = octo.handSide === undefined ? dir : octo.handSide;
      octo.handSide = Math.abs(dir - s) <= SIDE_EASE ? dir : s + Math.sign(dir - s) * SIDE_EASE;
      handPoint(octo, h.r || 0.3, ctx && ctx.isSolid, HP);
      h.place(HP.x, HP.y, octo.vx || 0, octo.vy || 0);
    }
  }
}

/** Thrown things: a hit on a creature (ctx.thrownHit, the one damage entry) or a hard stop ends the flight. */
export function stepFlying(hand, dt, ctx) {
  const f = hand.flying;
  for (let k = f.length - 1; k >= 0; k--) {
    const it = f[k], h = it.rec;
    it.t += dt;
    if (!h.alive() || !h.pos) { f.splice(k, 1); continue; }
    const p = h.pos();
    const sp = Math.hypot(p.vx, p.vy);
    let done = it.t > FLY_MAX_S || sp < FLY_MIN_SPEED;
    if (!done && ctx && ctx.thrownHit && ctx.thrownHit(p.x, p.y, (h.r || 0.3) + 0.1, p.vx, p.vy, it.dmg, h)) {
      hand.events.push({ type: 'hit', kind: '', x: p.x, y: p.y });
      if (h.impact) h.impact('hit');
      if (h.bounce) h.bounce(-0.3);
      done = true;
    } else if (!done && it.sp - sp > WALL_SMASH && it.t > 0.04) {
      if (h.impact) h.impact('wall');
      done = true;
    }
    it.sp = sp;
    if (done) f.splice(k, 1);
  }
}

/**
 * One step of the hand's button. `btn` = the snapshot's {pressed, held}. `aim` = the throw direction (or null: forward).
 * Call with ctx = { isSolid, thrownHit, ... (passed on to the providers) }.
 */
export function stepHand(hand, octo, btn, dt, aim, ctx) {
  hand.events.length = 0;
  if (octo.dead || octo.stunT > 0 || octo.held > 0 || octo.sealed) { hand.down = false; return; }
  if (btn.pressed && !hand.down) {
    hand.down = true; hand.downT = 0; hand.dropped = false; hand.downCarry = !!hand.held;
    if (!hand.held) handUse(hand, octo, ctx);
  }
  if (hand.down) {
    hand.downT += dt;
    if (hand.downCarry && !hand.dropped && hand.held && hand.downT >= HOLD_DROP_S) { handDrop(hand, octo, ctx); hand.dropped = true; }
    if (!btn.held) {
      hand.down = false;
      if (hand.downCarry && !hand.dropped && hand.held) handThrow(hand, octo, aim ? aim.x : 0, aim ? aim.y : 0, ctx);
    }
  }
}

/** The target for the tell and the phone button (call once per step; null while holding). */
export function updateTarget(hand, octo, ctx) {
  hand.target = hand.held || octo.dead ? null : findTarget(octo, ctx);
  return hand.target;
}

/** What the phone's Spell button should read: 'throw' while holding, 'grab' / 'use' when a target is in reach and the octopus is nearly still, else ''. */
export function phoneHandMode(hand, octo) {
  if (hand.held) return 'throw';
  if (!hand.target || Math.hypot(octo.vx || 0, octo.vy || 0) >= STILL_SPEED) return '';
  return hand.target.priority > PRI_THING ? 'use' : 'grab';
}
