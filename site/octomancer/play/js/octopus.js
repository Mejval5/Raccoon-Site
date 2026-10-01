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
  SWIM_ACCEL_CAP_EXP, DASH_IMPULSE, DASH_COOLDOWN,
  HEART_MAX, HURT_INVULN, HURT_KNOCKBACK, HURT_RAGDOLL, DEATH_DURATION,
  BOMB_START, BOMB_MAX,
} from './config.js';
import { applyImpulse, applyDrag, integrateWithCollision, len, clamp } from './physics.js';

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
    hurting: false, // read by octopus-draw.js (Idle4Swirl clip, angry eyes)
    hurtTimer: 0, // "ragdoll spin for 0.4s"
    dead: false,
    deathTimer: 0,
    gameoverEmitted: false,
    bombs: BOMB_START,
    // --- carried items (items.js applyCarried sets these; defaults are the plain octopus) ---
    heartMax: HEART_MAX,
    bombMax: BOMB_MAX,
    swimMul: 1,   // flippers: 1.2
    lightR: 0,    // tiles of clear sight in the dim Shallows (0 = no dimming), set by the level
    magnetR: 0,   // shell magnet: pulls shells this close (tiles)
  };
}

/** Hurt the octopus (contact damage): knockback away from (fromX,fromY), 1s
 * invulnerability, 0.4s ragdoll/angry state. A no-op while already
 * invulnerable or dead (OVERNIGHT.md M3-2: "no second loss within 1s"). */
export function hurtOctopus(o, fromX, fromY) {
  if (o.invulnTimer > 0 || o.dead) return false;
  o.hearts = Math.max(0, o.hearts - 1);
  const dx = o.x - fromX, dy = o.y - fromY;
  const d = len(dx, dy) || 1;
  // applyImpulse divides by mass, so scale by mass here to get a flat
  // HURT_KNOCKBACK u/s velocity change regardless of body mass.
  applyImpulse(o, (dx / d) * HURT_KNOCKBACK * o.mass, (dy / d) * HURT_KNOCKBACK * o.mass);
  o.invulnTimer = HURT_INVULN;
  o.hurting = true;
  o.hurtTimer = HURT_RAGDOLL;
  if (o.hearts <= 0) killOctopus(o);
  return true;
}

/** Instant kill (Beholder touch): bypasses invulnerability entirely. */
export function killOctopus(o) {
  if (o.dead) return;
  o.hearts = 0;
  o.dead = true;
  o.deathTimer = DEATH_DURATION;
  o.swimming = false;
}

/** Try to place a bomb: consumes one from the stock. Returns true if placed. */
export function tryUseBomb(o) {
  if (o.bombs <= 0 || o.dead) return false;
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
  const mul = o.swimMul || 1;
  const moveForce = joy.mag * SWIM_PUSH_FORCE * mul * dt;

  const speed = len(o.vx, o.vy);
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

  if (o.invulnTimer > 0) o.invulnTimer = Math.max(0, o.invulnTimer - dt);
  if (o.hurtTimer > 0) { o.hurtTimer = Math.max(0, o.hurtTimer - dt); if (o.hurtTimer === 0) o.hurting = false; }
  if (o.dead) {
    // Death: limp tentacles / fading, no input, 1s ink burst then `gameover`
    // (M4 wires the real overlay; main.js's __octo state exposes the flag).
    if (o.deathTimer > 0) o.deathTimer = Math.max(0, o.deathTimer - dt);
    applyDrag(o, OCTO_LINEAR_DRAG, dt);
    integrateWithCollision(o, dt, grid);
    return;
  }

  const joy = joystickCurve(input.move);
  o.swimming = joy.mag >= 0.01;

  rotate(o, joy, dt, true);
  if (o.swimming) move(o, joy, dt);

  if (o.dashCooldown > 0) o.dashCooldown = Math.max(0, o.dashCooldown - dt);
  if (input.dash && input.dash.pressed) tryDash(o);

  // Gravity (negligible at scale 0.01, kept for fidelity: MainGame.unity octopus
  // rigidbody gravityScale). y-down world: gravity pulls toward +y.
  o.vy += UNITY_GRAVITY * OCTO_GRAVITY_SCALE * dt;

  applyDrag(o, OCTO_LINEAR_DRAG, dt);

  integrateWithCollision(o, dt, grid);
}
