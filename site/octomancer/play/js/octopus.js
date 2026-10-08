// Octopus body + swim, ported line-for-line from the Unity reference (read
// only): octomancer-unity/Assets/Scripts/Player/SquidMovementScript.cs:98-117
// (Move/JoystickSwim/Rotate/DesiredPushAngle/RotateToDesiredAngle) and the
// SquidSettings.asset values (see config.js). OVERNIGHT.md §2 "Physics" /
// "Octopus body and swim".
//
// Coordinate note: the original works in Unity's y-up world with the
// sprite's local +Y as "forward" (hence the `-90` in DesiredPushAngle and the
// `transform.up` push direction). We use canvas y-down world units instead;
// `angle` below is degrees, 0 = facing up (screen -y), positive = clockwise.
// This is a pure re-basing of the same convention, not a behaviour change:
// facingDir(angle) = (sin(angle), -cos(angle)), which is "up" at angle 0 and
// rotates clockwise, exactly mirroring the original's z-rotation semantics
// in a y-down frame.

import {
  OCTO_MASS, OCTO_LINEAR_DRAG, OCTO_GRAVITY_SCALE, UNITY_GRAVITY, OCTO_RADIUS,
  SWIM_PUSH_FORCE, SWIM_MAX_SPEED, SWIM_TURN_DELAY, SWIM_TURN_SPEED,
  SWIM_REST_ROTATE_CONST, SWIM_JOYSTICK_POWER, SWIM_JOYSTICK_DIVISOR,
  SWIM_ACCEL_CAP_EXP, DASH_IMPULSE, DASH_COOLDOWN, DASH_IFRAMES,
  DASH_RECOIL, DASH_BOUNCE_MIN, DASH_BOUNCE_WINDOW, LAND_SQUASH_MIN,
  HEART_MAX, HURT_INVULN, HURT_KNOCKBACK, HURT_RAGDOLL, DEATH_DURATION,
  BODY_HIT_COOL, BODY_KNOCK, BODY_LIFT, BODY_SPIN,
  BOMB_START, BOMB_MAX,
  HEAVY_HIT_DMG, HEAVY_KNOCKBACK, STUN_S, STUN_KNOCKBACK, STUN_INVULN_EXTRA, STUN_SINK, STUN_DRAG, STUN_BOUNCE, STUN_SPIN, STUN_RECOVER,
} from './config.js';
import { applyImpulse, applyDrag, integrateWithCollision, len, clamp, contact } from './physics.js';
import { dashCrumble } from './fragile.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function createOctopus(x, y) {
  return {
    x, y, prevX: x, prevY: y,
    vx: 0, vy: 0,
    mass: OCTO_MASS,
    radius: OCTO_RADIUS,
    angle: 0, // degrees, 0 = up, clockwise+
    rotateDelay: 0,
    dashCooldown: 0,
    swimming: false,
    dashedThisStep: false, // for tests/juice hooks
    // --- M3: health, bombs (OVERNIGHT.md §4 M3-2) ---
    hearts: HEART_MAX,
    invulnTimer: 0,
    dashInvuln: 0, // s of dash i-frames left (set on the dash's first step): no hurt, no grab; drawn as a faint smear, not a blink
    spikeHelmet: false, // the Urchin Cap (items.js): a dash / ram at speed hurts what it hits (strikes.js)
    hurting: false, // read by octopus-draw.js (Idle4Swirl clip, angry eyes)
    hurtTimer: 0, // "ragdoll spin for 0.4s"
    dead: false,
    deathTimer: 0,
    gameoverEmitted: false,
    // --- ragdoll (V2-PLAN 14): while limp the body is a prop (main.js syncs it, props.js PK_BODY). Death is a limp state
    // that never ends; enterRagdoll(o, seconds, cause) / exitRagdoll(o) are the general form (a short incapacitation). ---
    limp: false,  // no control: the body is thrown about by physics
    limpT: 0,     // s of limp left (Infinity: dead)
    limpCause: '', // why ('death', or a special one such as 'impaled' / 'splat': octopus-draw.js setRagdollPose draws it)
    bodyIdx: -1,  // index of the body in props, -1 = none (endless mode, or not dead)
    spin: 0,      // rad/s, visual roll of the limp body
    hitCool: 0,   // s until the next hit on the body counts
    hitFlash: 0,  // 0..1 white flash of the last hit, decays
    bodyHits: 0,  // hits taken while dead (main.js turns a new one into a puff, a thud and a little shake)
    bombs: BOMB_START,
    // --- carried items (items.js applyCarried sets these; defaults are the plain octopus) ---
    heartMax: HEART_MAX,
    bombMax: BOMB_MAX,
    swimMul: 1,   // flippers: 1.2
    carryMul: 1,  // hand.js: < 1 while something heavy is carried
    shieldHit: null, // hand.js: fn(fromX, fromY, cause) -> true when a carried pot took the hit
    lightR: 0,    // tiles of clear sight in the dim Shallows (0 = no dimming), set by the level
    magnetR: 0,   // shell magnet: pulls shells this close (tiles)
    seeBuried: false, // sea-glass goggles: buried treasure and hidden pockets show through the rock (embed-draw.js)
    // --- game feel (v2 only: main.js sets feel = true and sink) ---
    feel: false,  // turns on the idle sink, the dash recoil and the landing squash
    sink: 0,      // u/s^2 pulling down while not swimming (config OCTO_IDLE_SINK)
    dashT: 0,     // s left in which a wall hit counts as a dash bounce
    airT: 0,      // s since the body last touched a floor
    squash: 0,    // 0..1 landing squash, decays
    landedThisStep: false, bouncedThisStep: false,
    bounceX: 0, bounceY: 0, bounceNx: 0, bounceNy: 0, bounceSpeed: 0, // the last dash bounce: where, wall normal, impact speed
    // --- V2-PLAN 16: damage tiers ---
    stunT: 0,     // s of incapacitation left (limp: no control, sinks, bounces, tumbles); the last STUN_RECOVER of it rights the body
    spin: 0,      // rad/s, visual tumble of a limp body (shared name with the death ragdoll)
    held: 0,      // > 0 while something holds the octopus (a tentacle): no input, no integration; the holder moves it
    struggles: 0, // dash presses made while held (the holder reads and resets it)
    struggledThisStep: false,
    deathStyle: '', // '' | 'impale' (pinned on spike tips) | 'splat' (flattened under a boulder) | 'clam' (shut inside a giant clam) | 'eaten' (pulled into a tentacle's shell)
    pinX: 0, pinY: 0, // where an impaled / splatted / swallowed body stays
    pinAngle: 0,
    flat: 0,      // 0..1 how flat the splat pancake is (hazards.js drives it while the boulder presses down)
    noKill: false, // test hook (main.js godMode): instant deaths are skipped too
    // --- spells (SPELLS-PICK.md): Anchor. While anchorT > 0 the body is a falling rock: it sinks hard, steers a little, cannot
    // dash or swim up, and nothing throws it about (jets, blasts and knocks still hurt, but do not move it). startAnchor sets it.
    anchorT: 0, anchorRest: 0, anchorRestS: 0.4, anchorSink: 16, anchorCap: 12, anchorSteer: 0.4,
    anchorVy: 0, // the fall speed just before this step's collision (main.js: crush and smash on landing)
  };
}

/** Hurt the octopus (contact damage): knockback away from (fromX,fromY), 1s
 * invulnerability, 0.4s ragdoll/angry state. A no-op while already
 * invulnerable or dead (OVERNIGHT.md M3-2: "no second loss within 1s").
 * A dead octopus: the hit lands on its body instead (V2-PLAN 14 hitBody).
 * V2-PLAN 16: `opts` {dmg (hearts, default 1), knock (u/s, default HURT_KNOCKBACK), stun (s of incapacitation, default 0)}. */
export function hurtOctopus(o, fromX, fromY, cause, opts = null) {
  if (o.dead) return hitBody(o, fromX, fromY); // V2-PLAN 14: the dead body takes the hit (a knock and a flash)
  if (o.invulnTimer > 0 || o.dashInvuln > 0 || o.sealed || o.safe) return false; // o.safe: the hub village (main.js). r45: sealed = going into a whirlpool (main.js beginEntry): nothing hurts it
  // controls 2026-10-08: a carried pot or clam takes the hit instead and breaks (hand.js sets o.shieldHit while it holds one)
  if (o.shieldHit && o.shieldHit(fromX, fromY, cause)) { o.invulnTimer = Math.max(o.invulnTimer, HURT_INVULN * 0.5); return false; }
  const dmg = opts && opts.dmg !== undefined ? opts.dmg : 1;
  const knock = opts && opts.knock !== undefined ? opts.knock : HURT_KNOCKBACK;
  const stun = opts && opts.stun ? opts.stun : 0;
  o.cause = cause || 'unknown'; // what last hurt it: the death screen names the killer (run.js CAUSE_TEXT)
  o.hearts = Math.max(o.practice ? 1 : 0, o.hearts - dmg); // the tutorial's practice rooms (main.js octo.practice): the last heart stays
  let dx = o.x - fromX, dy = o.y - fromY;
  let d = len(dx, dy);
  if (d < 1e-4) { dx = 0; dy = -1; d = 1; }
  // a strong knockback first cancels any velocity INTO the hit (one that only added to it could be swum through)
  const along = (o.vx * dx + o.vy * dy) / d;
  if (along < 0) { o.vx -= (dx / d) * along; o.vy -= (dy / d) * along; }
  // applyImpulse divides by mass, so scale by mass here to get a flat knock u/s velocity change regardless of body mass.
  if (!(o.anchorT > 0)) applyImpulse(o, (dx / d) * knock * o.mass, (dy / d) * knock * o.mass); // Anchor: hurt, but not thrown
  o.invulnTimer = HURT_INVULN;
  o.hurting = true;
  o.hurtTimer = HURT_RAGDOLL;
  if (stun > 0) {
    o.stunT = Math.max(o.stunT, stun);
    o.invulnTimer = Math.max(o.invulnTimer, stun + STUN_INVULN_EXTRA);
    o.hurtTimer = Math.max(o.hurtTimer, stun);
    o.spin = (dx >= 0 ? 1 : -1) * STUN_SPIN;
    o.swimming = false;
  }
  if (o.hearts <= 0) killOctopus(o);
  return true;
}

/** V2-PLAN 16 incapacitation: one heart (dmg) and `dur` s of no control, the body limp (sinks, bounces off rock, tumbles). */
export function stunOctopus(o, fromX, fromY, cause, dur = STUN_S, dmg = 1, knock = STUN_KNOCKBACK) {
  return hurtOctopus(o, fromX, fromY, cause, { dmg, knock, stun: dur });
}

/** V2-PLAN 16 heavy hit (a harpoon): HEAVY_HIT_DMG hearts and a big knockback. */
export function heavyHitOctopus(o, fromX, fromY, cause) {
  return hurtOctopus(o, fromX, fromY, cause, { dmg: HEAVY_HIT_DMG, knock: HEAVY_KNOCKBACK });
}

/**
 * Instant kill (Beholder touch, spikes, a boulder, a clam): bypasses hearts and invulnerability entirely.
 * `style` (V2-PLAN 16): '' (the plain death), 'impale' / 'splat' / 'clam' / 'eaten' pin the body at (px, py) with `angle`
 * (degrees, 0 = up) and it stays there: no drift, no ragdoll. Returns true when it killed.
 * r45: nothing kills it while sealed (going into a whirlpool).
 */
export function killOctopus(o, cause, style = '', px = NaN, py = NaN, angle = NaN) {
  if (o.dead) { hitBody(o, o.x, o.y + 0.3); return false; } // V2-PLAN 14: already dead: a hit on the body
  if (o.sealed || o.safe) return false; // o.safe: the hub village, where nothing hurts (main.js stepV2)
  if (o.noKill && style) return false; // test hook: scripted playthroughs (godMode) are not killed by traps either
  if (cause) o.cause = cause;
  o.hearts = 0;
  o.dead = true;
  o.deathTimer = DEATH_DURATION;
  o.swimming = false;
  o.stunT = 0; o.held = 0;
  if (style) {
    o.deathStyle = style;
    o.pinX = Number.isFinite(px) ? px : o.x; o.pinY = Number.isFinite(py) ? py : o.y;
    o.pinAngle = Number.isFinite(angle) ? angle : o.angle;
    o.x = o.prevX = o.pinX; o.y = o.prevY = o.pinY; o.angle = o.pinAngle;
    o.vx = o.vy = 0; o.spin = 0;
  }
  // V2-PLAN 14: dead is limp for good; a plain death becomes the ragdoll body (ragdoll.js), a pinned one (style) stays put
  enterRagdoll(o, Infinity, style || 'death');
  return true;
}

/**
 * Go limp for `seconds` (Infinity = for good, as on death): no swim, no dash, the body becomes a physics prop in v2
 * (main.js), the eyes close and the tentacles hang. `cause` names the pose and effects: 'death' (X eyes), 'stun' (closed
 * eyes), or a special one registered with octopus-draw.js setRagdollPose ('impaled', 'splat', ...). Calling it again while
 * limp extends the time (never shortens it) and replaces the cause.
 */
export function enterRagdoll(o, seconds, cause = 'stun') {
  o.limp = true;
  o.limpT = Math.max(o.limpT || 0, seconds);
  o.limpCause = cause;
  o.swimming = false;
}

/** Back in control (a no-op once dead). main.js removes the body prop on the next step and the octopus swims on from there. */
export function exitRagdoll(o) {
  if (o.dead) return;
  o.limp = false; o.limpT = 0; o.limpCause = '';
  o.spin = 0;
}

/** Something hit the dead body: no damage (it is dead), a knock away from (fromX, fromY) with a little lift, some spin
 * and a white flash. At most one hit per BODY_HIT_COOL. Returns true when the hit counted. */
export function hitBody(o, fromX, fromY) {
  if (!o.dead || o.hitCool > 0 || o.deathStyle) return false; // a pinned body (skewered, flattened: V2-PLAN 16) stays put
  let dx = o.x - fromX, dy = o.y - fromY;
  const d = len(dx, dy);
  if (d < 1e-4) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
  o.vx += dx * BODY_KNOCK;
  o.vy += dy * BODY_KNOCK - BODY_LIFT;
  o.spin += (dx >= 0 ? 1 : -1) * BODY_SPIN;
  o.hitCool = BODY_HIT_COOL;
  o.hitFlash = 1;
  o.bodyHits++;
  return true;
}

/** Is the octopus out of control right now (incapacitated, held, or dead)? */
export function isLimp(o) { return o.dead || o.stunT > 0 || o.held > 0; }

/** Try to place a bomb: consumes one from the stock. Returns true if placed. */
export function tryUseBomb(o) {
  if (o.bombs <= 0 || o.dead || o.limp) return false;
  o.bombs--;
  return true;
}

export function addBomb(o) {
  o.bombs = Math.min(o.bombMax || BOMB_MAX, o.bombs + 1);
}

export function facingDir(angleDeg) {
  const a = angleDeg * DEG2RAD;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/** SquidMovementScript.JoystickSwim(): joystick = joystick * mag^power / divisor. */
function joystickCurve(move) {
  const mag = len(move.x, move.y);
  if (mag < 0.01) return { x: 0, y: 0, mag: 0 };
  const scale = Math.pow(mag, SWIM_JOYSTICK_POWER) / SWIM_JOYSTICK_DIVISOR;
  return { x: move.x * scale, y: move.y * scale, mag: mag * scale };
}

/** SquidMovementScript.DesiredPushAngle(), rebased to our y-down/up-zero frame. */
function desiredPushAngleDeg(joy) {
  if (joy.mag < 1e-9) return 0;
  return Math.atan2(joy.x, -joy.y) * RAD2DEG;
}

function deltaAngle(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function lerpAngleDeg(a, b, t) {
  const d = deltaAngle(b, a);
  return a + d * t;
}

/** SquidMovementScript.RotateToDesiredAngle(). */
function rotateToDesiredAngle(current, desired, angleDiffPow, speedConstant, dt) {
  const angleDiff = Math.abs(deltaAngle(desired, current));
  const percent = Math.min((dt * speedConstant) / Math.pow(angleDiff, angleDiffPow), 1);
  return lerpAngleDeg(current, desired, percent);
}

/** SquidMovementScript.Rotate(). `canMove` stands in for CharacterHealthScript
 * (M1 has no health system yet; always true). */
function rotate(o, joy, dt, canMove = true) {
  o.rotateDelay += dt;
  if (o.swimming) {
    o.rotateDelay = 0;
    o.angle = rotateToDesiredAngle(o.angle, desiredPushAngleDeg(joy), 1, SWIM_TURN_SPEED, dt);
  } else if (!canMove) {
    // Ragdoll branch: stubbed for M1 (no health/knockback system yet).
  } else if (o.rotateDelay > SWIM_TURN_DELAY && Math.abs(o.angle) > 0.001) {
    o.angle = rotateToDesiredAngle(o.angle, 0, 0.5, SWIM_REST_ROTATE_CONST, dt);
  }
  if (Math.abs(o.angle) < 0.01) o.angle = 0;
}

/** SquidMovementScript.Move(). */
function move(o, joy, dt) {
  const angleRad = desiredPushAngleDeg(joy) * DEG2RAD;
  const pushDir = { x: Math.sin(angleRad), y: -Math.cos(angleRad) };
  const mul = (o.swimMul || 1) * (o.carryMul || 1); // controls 2026-10-08: a carried thing weighs the octopus down (hand.js sets carryMul)
  const moveForce = joy.mag * SWIM_PUSH_FORCE * mul * dt;

  const speed = len(o.vx, o.vy);
  // 2026-10-08 movement-test fix (the "stuck in corners until I dash" bug): from (near) rest the formula below has no
  // velocity direction, so velDir is (0,0), theta 0, and the final push is velDir*1 + perp*sin(0) = (0,0): NO thrust at all.
  // In Unity a resting rigidbody never has exactly zero velocity, but here the collision cancels the velocity into a wall
  // exactly, and the idle sink keeps pressing the body into the floor, so an octopus that settles into a floor corner
  // (both components cancelled) or rests on a floor long enough for drag to bring its sideways speed under 1e-6 could not
  // swim in ANY direction until a dash gave it speed again. The limit of the formula as speed -> 0 is the plain push
  // direction (accelPossible is 1 there), so use that.
  if (speed <= 1e-6) { applyImpulse(o, moveForce * pushDir.x, moveForce * pushDir.y); return; }
  const accelPossible = clamp(1 - Math.pow(speed / (SWIM_MAX_SPEED * mul), SWIM_ACCEL_CAP_EXP), 0, 1);

  const velDir = speed > 1e-6 ? { x: o.vx / speed, y: o.vy / speed } : { x: 0, y: 0 };
  // Vector2.Angle: unsigned angle in [0,180] between the two directions; 0 if
  // either vector is ~zero (Unity returns 0 for a zero vector).
  const dot = clamp(pushDir.x * velDir.x + pushDir.y * velDir.y, -1, 1);
  const theta = speed > 1e-6 ? Math.acos(dot) : 0;

  const velDirPushMag = Math.cos(theta);
  const velDirPerpMag = Math.sin(theta);
  const velDirPushMagClamped = clamp(velDirPushMag, -1, accelPossible);

  let perpX = pushDir.x - Math.abs(velDirPushMag) * velDir.x;
  let perpY = pushDir.y - Math.abs(velDirPushMag) * velDir.y;
  const perpLen = len(perpX, perpY) || 1;
  perpX /= perpLen; perpY /= perpLen;

  const finalX = velDir.x * velDirPushMagClamped + perpX * velDirPerpMag;
  const finalY = velDir.y * velDirPushMagClamped + perpY * velDirPerpMag;

  applyImpulse(o, moveForce * finalX, moveForce * finalY);
}

/** Attempt a dash: impulse DASH_IMPULSE along the current facing, gated by a
 * cooldown (tonight's deviation, config.js). Returns true if it fired. */
export function tryDash(o) {
  if (o.dashCooldown > 0) return false;
  const dir = facingDir(o.angle);
  applyImpulse(o, DASH_IMPULSE * dir.x, DASH_IMPULSE * dir.y);
  o.dashCooldown = DASH_COOLDOWN;
  o.dashedThisStep = true;
  o.dashT = DASH_BOUNCE_WINDOW;
  o.dashInvuln = DASH_IFRAMES; // invincible from this very step
  return true;
}

/**
 * Advance the octopus by one fixed step: rotation, swim push, dash cooldown,
 * gravity, drag, then integrate position against the tile grid.
 * @param {ReturnType<typeof createOctopus>} o
 * @param {{move:{x:number,y:number}, dash:{pressed:boolean}}} input
 * @param {number} dt
 * @param {{isSolid:(tx:number,ty:number)=>boolean}} grid
 */
export function stepOctopus(o, input, dt, grid) {
  o.prevX = o.x; o.prevY = o.y;
  o.dashedThisStep = false;
  o.landedThisStep = false; o.bouncedThisStep = false;
  if (o.dashT > 0) o.dashT = Math.max(0, o.dashT - dt);
  if (o.squash > 0) o.squash = Math.max(0, o.squash - dt * 5);

  if (o.invulnTimer > 0) o.invulnTimer = Math.max(0, o.invulnTimer - dt);
  if (o.dashInvuln > 0) o.dashInvuln = Math.max(0, o.dashInvuln - dt); // counted down before tryDash below, so a fresh dash keeps all of it
  if (o.hurtTimer > 0) { o.hurtTimer = Math.max(0, o.hurtTimer - dt); if (o.hurtTimer === 0) o.hurting = false; }
  if (o.hitCool > 0) o.hitCool = Math.max(0, o.hitCool - dt);
  if (o.hitFlash > 0) o.hitFlash = Math.max(0, o.hitFlash - dt * 4);
  if (o.limp && !o.dead) { o.limpT -= dt; if (o.limpT <= 0) exitRagdoll(o); }
  if (o.dead || o.limp) {
    // Limp (V2-PLAN 14): no input. Dead: the 1.5 s of ragdoll before the `gameover` event and the death screen.
    if (o.deathTimer > 0) o.deathTimer = Math.max(0, o.deathTimer - dt);
    if (o.deathStyle) { // V2-PLAN 16: skewered, flattened or swallowed: the body stays where it was pinned (hazards may move the pin)
      o.x = o.pinX; o.y = o.pinY; o.vx = o.vy = 0; o.angle = o.pinAngle;
      return;
    }
    if (o.dead) { o.hurting = false; o.hurtTimer = 0; }
    o.swimming = false;
    // v2: the body is a prop (main.js steps it with the other props and copies it back here)
    if (o.bodyIdx >= 0) return;
    applyDrag(o, OCTO_LINEAR_DRAG, dt);
    if (o.feel && o.sink) o.vy += o.sink * dt;
    integrateWithCollision(o, dt, grid);
    return;
  }
  o.struggledThisStep = false;
  if (o.held > 0) { // V2-PLAN 16: held by a tentacle: the holder moves the body; every dash press is a struggle
    o.swimming = false;
    if (o.dashCooldown > 0) o.dashCooldown = Math.max(0, o.dashCooldown - dt);
    if (input.dash && input.dash.pressed) { o.struggles++; o.struggledThisStep = true; }
    o.angle = (o.angle + o.spin * dt * RAD2DEG) % 360;
    return;
  }
  if (o.stunT > 0) { stepLimp(o, dt, grid); return; }
  if (o.anchorT > 0) { stepAnchor(o, input, dt, grid); return; }

  const joy = joystickCurve(input.move);
  o.swimming = joy.mag >= 0.01;

  rotate(o, joy, dt, true);
  if (o.swimming) move(o, joy, dt);

  if (o.dashCooldown > 0) o.dashCooldown = Math.max(0, o.dashCooldown - dt);
  if (input.dash && input.dash.pressed) tryDash(o);

  // Gravity (negligible at scale 0.01, kept for fidelity: MainGame.unity octopus
  // rigidbody gravityScale). y-down world: gravity pulls toward +y.
  o.vy += UNITY_GRAVITY * OCTO_GRAVITY_SCALE * dt;
  // v2: a slow sink while not swimming, so ledges matter; any swim input cancels it
  if (o.feel && !o.swimming && o.sink) o.vy += o.sink * dt;

  applyDrag(o, OCTO_LINEAR_DRAG, dt);

  if (!o.feel) { integrateWithCollision(o, dt, grid); return; }
  if (o.dashT > 0) dashCrumble(o, dt, grid); else o.crunched = 0; // fish bone in front of a fast dash crumbles (fragile.js): the dash goes through
  const pvx = o.vx, pvy = o.vy, pspeed = len(pvx, pvy);
  contact.hit = 0;
  integrateWithCollision(o, dt, grid);
  // dash bounce: a fast dash that is stopped by a wall kicks back a little off it
  if (o.dashT > 0 && pspeed > DASH_BOUNCE_MIN) {
    const lost = len(pvx - o.vx, pvy - o.vy); // the velocity the wall took away, along its normal
    if (lost > pspeed * 0.45) {
      const nx = (o.vx - pvx) / lost, ny = (o.vy - pvy) / lost; // wall normal (points out of the wall)
      const rc = Math.min(DASH_RECOIL, pspeed * 0.4);
      o.vx += nx * rc; o.vy += ny * rc;
      o.bouncedThisStep = true; o.bounceNx = nx; o.bounceNy = ny; o.bounceSpeed = pspeed;
      o.bounceX = o.x - nx * o.radius; o.bounceY = o.y - ny * o.radius;
      o.dashT = 0;
    }
  }
  // landing: touching a floor after being off the ground squashes the body softly
  const onFloor = contact.hit && contact.ny < -0.5;
  if (onFloor) {
    const impact = Math.max(0, pvy);
    if (o.airT > 0.2 && impact > LAND_SQUASH_MIN) { o.squash = clamp(impact / 1.5, 0.35, 1); o.landedThisStep = true; }
    o.airT = 0;
  } else o.airT += dt;
}

/**
 * Spells, Anchor: become a falling rock for `dur` s (ends early `rest` s after coming to rest on a floor). `p` = {sink (u/s^2),
 * cap (u/s), steer (0..1 of the swim's sideways control), rest}. Any dash in progress is cancelled. Returns false when the body is
 * not in control (dead, limp, held: nothing to anchor).
 */
export function startAnchor(o, dur, p = null) {
  if (o.dead || o.limp || o.held > 0 || o.stunT > 0) return false;
  o.anchorT = dur; o.anchorRest = 0;
  if (p) { o.anchorSink = p.sink; o.anchorCap = p.cap; o.anchorSteer = p.steer; o.anchorRestS = p.rest; }
  o.dashT = 0; o.swimming = false;
  if (o.vy < 0) o.vy *= 0.3; // the upward part of a swim or dash is cut: it drops
  return true;
}

/** One fixed step of an anchored body: no dash, no swim up, a hard sink with a speed cap, a little sideways steering. */
function stepAnchor(o, input, dt, grid) {
  o.anchorT = Math.max(0, o.anchorT - dt);
  if (o.dashCooldown > 0) o.dashCooldown = Math.max(0, o.dashCooldown - dt);
  o.swimming = false;
  const mx = input.move ? clamp(input.move.x, -1, 1) : 0;
  const want = mx * SWIM_MAX_SPEED * (o.swimMul || 1) * o.anchorSteer;
  o.vx += (want - o.vx) * Math.min(1, dt * 6);
  o.vy = Math.min(o.anchorCap, o.vy + o.anchorSink * dt);
  o.anchorVy = o.vy;
  // turn to hang upright, a slight lean with the steering
  o.angle = rotateToDesiredAngle(o.angle, mx * 12, 0.5, SWIM_REST_ROTATE_CONST * 3, dt);
  const pvy = o.vy;
  contact.hit = 0;
  integrateWithCollision(o, dt, grid);
  const onFloor = contact.hit && contact.ny < -0.5;
  if (onFloor) {
    if (pvy > LAND_SQUASH_MIN) { o.squash = clamp(pvy / 6, 0.4, 1); o.landedThisStep = true; }
    o.airT = 0;
  } else o.airT += dt;
  if (onFloor && Math.abs(o.vy) < 0.5) { o.anchorRest += dt; if (o.anchorRest >= o.anchorRestS) o.anchorT = 0; }
  else o.anchorRest = 0;
}

/**
 * V2-PLAN 16 incapacitation: one fixed step of the limp body. No input at all: it sinks (STUN_SINK), drifts with little
 * drag, bounces off rock (STUN_BOUNCE, the impact read back from the collision like the dash bounce) and tumbles; in the
 * last STUN_RECOVER of the stun the tumble stops and the body turns upright again, then control comes back.
 */
function stepLimp(o, dt, grid) {
  o.swimming = false;
  o.stunT = Math.max(0, o.stunT - dt);
  if (o.dashCooldown > 0) o.dashCooldown = Math.max(0, o.dashCooldown - dt);
  if (o.squash > 0) o.squash = Math.max(0, o.squash - dt * 5);
  o.vy += STUN_SINK * dt;
  applyDrag(o, STUN_DRAG, dt);
  const pvx = o.vx, pvy = o.vy, pspeed = len(pvx, pvy);
  integrateWithCollision(o, dt, grid);
  const lost = len(pvx - o.vx, pvy - o.vy);
  if (lost > 0.6 && pspeed > 0.8) { // hit rock: bounce back along the normal, a little spin from the impact
    const nx = (o.vx - pvx) / lost, ny = (o.vy - pvy) / lost;
    o.vx += nx * lost * STUN_BOUNCE; o.vy += ny * lost * STUN_BOUNCE;
    o.spin = -o.spin * 0.6 + (nx * pvy - ny * pvx) * 0.8;
    if (lost > 2.5) { o.bouncedThisStep = true; o.bounceNx = nx; o.bounceNy = ny; o.bounceSpeed = pspeed; o.bounceX = o.x - nx * o.radius; o.bounceY = o.y - ny * o.radius; }
    if (ny < -0.5 && lost > 1.2) { o.squash = Math.min(1, lost / 4); o.landedThisStep = true; }
  }
  if (o.stunT > STUN_RECOVER) {
    o.spin *= Math.exp(-1.2 * dt);
    o.angle = (o.angle + o.spin * dt * RAD2DEG) % 360;
  } else { // right itself
    o.spin = 0;
    const a = ((o.angle % 360) + 540) % 360 - 180;
    o.angle = a * Math.max(0, 1 - dt * 9);
  }
  o.rotateDelay = 0;
}
