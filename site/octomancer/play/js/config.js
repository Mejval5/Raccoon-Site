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

// Sub-step when |v|*dt > r/2 (OVERNIGHT.md §2 "Physics").
export const SUBSTEP_RADIUS_FACTOR = 0.5;
export const MAX_SUBSTEPS = 8;
