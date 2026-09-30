// Physics & swim constants, ported from the Unity reference (read-only,
// octomancer-unity/). Every constant below cites its source line so a later
// dev can re-check the port. OVERNIGHT.md §2 "Physics" / "Octopus body and
// swim".

// octomancer-unity/Assets/Scenes/MainGame.unity:39451-39466 (Octopus Rigidbody2D)
export const OCTO_MASS = 2;
export const OCTO_LINEAR_DRAG = 2;
export const OCTO_GRAVITY_SCALE = 0.01;
// Unity's default global gravity is -9.81 (y-up). We use y-down canvas
// coordinates, so "down" is +y; gravity is scaled by OCTO_GRAVITY_SCALE and
// is small enough (~0.098 u/s^2) to be barely noticeable underwater, as in
// the original.
export const UNITY_GRAVITY = 9.81;

// Collider: 20-point polygon at MainGame.unity:39472, fitted here to a circle.
export const OCTO_RADIUS = 0.45;

// octomancer-unity/Assets/ScriptableObjects/Player/Variables/Octopus Movement/SquidSettings.asset
export const SWIM_PUSH_FORCE = 80; // octopusPushForce
export const SWIM_MAX_SPEED = 6; // maxSpeed
export const SWIM_TURN_DELAY = 0.5; // octopusTurnDelay (s)
export const SWIM_TURN_SPEED = 450; // octopusTurnSpeed (deg/s)
export const SWIM_REST_ROTATE_CONST = 10; // octopusRotateToRestConstant
export const SWIM_JOYSTICK_POWER = 0.5; // joystickPower
export const SWIM_JOYSTICK_DIVISOR = 2; // joystickDivisor
export const SWIM_ACCEL_CAP_EXP = 10; // Move(): Mathf.Pow(v/max, 10)

// MainGame.unity:39526 (PushOnceForce on the octopus's push-event listener)
export const DASH_IMPULSE = 20;
// Tonight's deviation (OVERNIGHT.md M1-1): the original dash has no cooldown
// of its own (gated by a coroutine/animation in the full game); we add a
// flat 0.6s cooldown so keyboard/touch dash-spam does not read as free
// invincibility-by-speed. Tunable; logged in NIGHT-LOG.md.
export const DASH_COOLDOWN = 0.6;

// World / tiles: 1 tile = 1 world unit (OVERNIGHT.md §2 "Physics"/"Camera").
export const TILE_SIZE = 1;

// Camera: at least 18x24 world units visible, per
// octomancer-unity/Assets/Scripts/Camera/CameraPos.cs:137-148.
export const CAMERA_MIN_WIDTH = 18;
export const CAMERA_MIN_HEIGHT = 24;
// Round-3 fix (Daniel's screenshot review: "on desktop the camera shows
// about 39 tiles across, so the octopus is about 2% of screen width,
// against about 6% in the promo frames -- everything reads tiny and
// empty"). `CAMERA_MIN_WIDTH`/`CAMERA_MIN_HEIGHT` only ever guarantee a
// FLOOR on visible extent (CameraPos.GetCamSizeDefault's own "never less,
// extra shown on the other axis for off-ratio screens" behaviour) -- on a
// wide/short desktop viewport the height requirement dominates and the
// width shown balloons far past 18. Cap the width actually shown instead,
// so a wide viewport shows more of the level's HEIGHT rather than an
// ever-wider slice of it, matching the video's tighter framing.
export const CAMERA_MAX_WIDTH = 20;
// Round-4 fix (Daniel's screenshot review round 3: "phone framing is too
// zoomed out -- about 18 tiles across at 375x812, the octopus reads tiny").
// `CAMERA_MIN_WIDTH` (18) is a landscape-tuned floor; on a narrow PORTRAIT
// viewport (canvasH > canvasW, i.e. every phone in its normal orientation)
// the height requirement (`CAMERA_MIN_HEIGHT`=24) already yields plenty of
// zoom on its own -- using the much smaller `CAMERA_MIN_WIDTH_PORTRAIT`
// instead of 18 for the width floor lets that height constraint actually
// bind (its own `Math.min` already picks whichever constraint is tighter),
// landing close to the target ~10-11 tiles across instead of stretching wide
// to satisfy an 18-tile width floor no phone screen needs.
export const CAMERA_MIN_WIDTH_PORTRAIT = 11;

// Sub-step when |v|*dt > r/2 (OVERNIGHT.md §2 "Physics").
export const SUBSTEP_RADIUS_FACTOR = 0.5;
export const MAX_SUBSTEPS = 8;

// --- M3: health, bombs, enemies (OVERNIGHT.md §4 M3-1/M3-2) ---
export const HEART_MAX = 3;
export const HURT_INVULN = 1.0; // s
export const HURT_KNOCKBACK = 6; // u/s, away from the hurt source
export const HURT_RAGDOLL = 0.4; // s, "the original's ragdoll spin"
export const DEATH_DURATION = 1.0; // s of ink-burst before the gameover event

export const BOMB_START = 3;
export const BOMB_MAX = 5;
// Tonight's deviation from the plan's "4s fuse" default (logged in
// NIGHT-LOG.md): OVERNIGHT.md M3-2 itself calls out 1.5s as the row's own
// number, "deviation from 4 s, noted".
export const BOMB_FUSE = 1.5;
export const BOMB_RADIUS = 2.5;

export const DASH_KILL_SPEED = 8; // u/s: dash-through-piranha kill threshold
export const ENEMY_MIN_DEPTH = 40; // "enemy-free first 40 units" (also gen.js)

export const URCHIN_RADIUS = 0.42;
export const PIRANHA_RADIUS = 0.4;
export const PIRANHA_PATROL_SPEED = 2.5;
export const PIRANHA_CHASE_SPEED = 4;
export const PIRANHA_CHASE_RANGE = 6;
export const CANNON_RADIUS = 0.45;
export const CANNON_RANGE = 10;
export const CANNON_FIRE_PERIOD = 2.5;
export const CANNON_SHOT_SPEED = 5;
export const CANNON_SHOT_RADIUS = 0.25;

export const BEHOLDER_SPAWN_TIME = 120; // s of run time
export const BEHOLDER_SPAWN_HEIGHT = 20; // world units above the octopus
export const BEHOLDER_RADIUS = 0.9;
export const BEHOLDER_SPEED = 4.5; // u/s
export const BEHOLDER_SPEED_RAMP = 0.1; // +u/s per 10s alive

// --- M6: the 2021 creatures (OVERNIGHT.md §4 M6, DECISIONS §2) ---
// Spiked mine was removed (Daniel: ugly, urchins cover the same job).

// Crabs (`CrabFlatten` slow, `CrabFlatten2` fast): walk a ledge, turn at
// edges and walls.
export const CRAB_RADIUS = 0.42;
export const CRAB_SPEED_SLOW = 1.2;
export const CRAB_SPEED_FAST = 2;

// Spike horns (`NPC6`): static trap, immune to dash and bombs.
export const HORNS_RADIUS = 0.4;

// Manta (`NPC10` + `NPC10Ball`): wide sine glide, drops an aimed ball.
export const MANTA_RADIUS = 0.5;
export const MANTA_SPEED = 3; // u/s horizontal glide
export const MANTA_PATROL_RANGE = 5; // u either side of its spawn x, then turns
export const MANTA_SINE_AMPLITUDE = 1.5; // u, vertical sine sway
export const MANTA_SINE_FREQ = 0.7; // rad/s
export const MANTA_DROP_PERIOD = 3; // s between ball drops
export const MANTA_RANGE = 8; // u, must be this close before it drops
export const MANTA_BALL_SPEED = 3; // u/s, aimed at the octopus
export const MANTA_BALL_RADIUS = 0.22;

// --- M7: juice and polish (OVERNIGHT.md §4 M7-1) ---
// Beholder dread: how close (world units) before the vignette pulse and its
// light cone start ramping in, reaching full intensity at touch range.
export const DREAD_RANGE = 15;
// Bubble trail: spawned from the octopus while it pushes, rate and speed
// scaled by how fast it's swimming (OVERNIGHT.md M7-1 "bubble trail scaled
// by speed").
export const TRAIL_BUBBLE_PERIOD_MIN = 0.05; // s between trail bubbles at max speed
export const TRAIL_BUBBLE_PERIOD_MAX = 0.35; // s between trail bubbles near rest

/** One `matchMedia` query, reused by every M7 juice effect (and the M3
 * screen shake) so a single OS/browser setting turns off all of the
 * decorative motion at once (OVERNIGHT.md M7-1: "every effect respects
 * prefers-reduced-motion"). Guarded for environments without `matchMedia`
 * (the `tests/` harness), where it safely reads as "no preference". */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
