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
// Actions tuning (2026-10-08): a dash is invincible from its first frame for this long (i-frames, octopus.js `dashInvuln`).
// It no longer hurts anything by itself: ramming damage comes from the Urchin Cap item (strikes.js).
export const DASH_IFRAMES = 0.3;

// World / tiles: 1 tile = 1 world unit (OVERNIGHT.md §2 "Physics"/"Camera").
export const TILE_SIZE = 1;

// Game feel (round 37, v2 only: the octopus carries `feel = true`, endless never sets it).
/** Slow sink of the octopus while it is NOT swimming, u/s^2 (drag 2 makes the terminal speed half of it). Swimming cancels it. ?sink=<value> overrides. */
export const OCTO_IDLE_SINK = 0.35;
export const SHAKE_MAX_PX = 6;      // explosion shake at point blank
export const SHAKE_HURT_PX = 3;     // shake on taking damage
export const SHAKE_DURATION = 0.25; // s
export const HITSTOP_S = 0.06;      // s the sim freezes on damage and on dash kills
export const DASH_RECOIL = 3;       // u/s kicked back off a wall after a dash hits it
export const DASH_BOUNCE_MIN = 3.5; // u/s: a dash faster than this that hits a wall bounces (drag 2 slows a dash to ~3 u/s after 3.5 tiles)
export const DASH_BOUNCE_WINDOW = 0.35; // s after a dash in which a wall hit counts as a dash bounce
export const LAND_SQUASH_MIN = 0.08; // u/s of landing speed that squashes the body

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
export const HURT_KNOCKBACK = 9; // u/s, away from the hurt source (V2-PLAN 16: one hit = one heart plus a strong knockback; was 6)
// --- V2-PLAN 16, damage tiers ---
// instant: spikes (impaled, pinned on the tips), a falling boulder (splat, flattened under it), a giant clam's snap, the
//          Beholder, a tentacle that finishes its pull; hearts and invulnerability are ignored
// one hit: one heart, a strong knockback (HURT_KNOCKBACK) and HURT_INVULN of invulnerability
// heavy:   a harpoon: HEAVY_HIT_DMG hearts and HEAVY_KNOCKBACK
// incapacitation: one heart and STUN_S of no control: the body goes limp (sinks, bounces off rock, tumbles), then recovers
export const HEAVY_HIT_DMG = 2;
export const HEAVY_KNOCKBACK = 13; // u/s
export const STUN_S = 1.25;        // s of lost control (Daniel: about 1-1.5 s)
export const STUN_INVULN_EXTRA = 0.5; // s of invulnerability after the octopus gets control back
export const STUN_SINK = 2.6;      // u/s^2: the limp body sinks like a dropped thing
export const STUN_DRAG = 1.8;      // 1/s: a little less drag than a swimming octopus, so a slam carries it into the rock
export const STUN_KNOCKBACK = 6;   // u/s: the knock of an incapacitating hit (the limp body drifts further than a swimming one)
export const STUN_BOUNCE = 0.45;   // restitution off rock while limp
export const STUN_SPIN = 6;        // rad/s of tumble at the hit, decays
export const STUN_RECOVER = 0.35;  // s at the end of a stun in which the body rights itself (still no control)
export const IMPALE_DEPTH = 0.42;  // tiles: how far past the spike face the skewered body's centre sits
export const SPLAT_HITSTOP = 0.14; // s the sim freezes on a splat
export const SPLAT_SHAKE_PX = 13;  // px of screen shake on a splat (above SHAKE_MAX_PX on purpose)
export const HURT_RAGDOLL = 0.4; // s, "the original's ragdoll spin"
export const DEATH_DURATION = 1.5; // s of ragdoll before the death screen (gameover event) slides in
// death ragdoll (V2-PLAN 14): the dead octopus is a physics body (props.js PK_BODY); enemies and hazards keep hitting it
export const BODY_HIT_COOL = 0.3;  // s between two hits that count on the dead body (a piranha resting on it does not buzz)
export const BODY_KNOCK = 5.5;     // u/s velocity change of a hit, away from the source
export const BODY_LIFT = 1.4;      // u/s extra upward kick of a hit, so the body hops instead of grinding the floor
export const BODY_SPIN = 9;        // rad/s of spin a hit adds

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
export const CANNON_RANGE = 8; // r35: within a phone view; it needs a clear line, a 0.6 s glow, then a 2 s reload
export const CANNON_FIRE_PERIOD = 2.6; // glow 0.6 + reload 2.0 (enemies.js has the two parts)
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

/** Player settings that the whole game reads (js/settings.js writes them; defaults: follow the OS, shake on).
 * `reduced` is null (follow prefers-reduced-motion) or a boolean the player chose; `shake` switches screen shake alone. */
const motion = { reduced: null, shake: true };
export function setMotionSettings(reduced, shake) { motion.reduced = reduced === null || reduced === undefined ? null : !!reduced; motion.shake = !!shake; }
export function shakeEnabled() { return motion.shake; }

/** The OS preference alone, ignoring the player's setting (the settings panel shows it as the default). */
let reducedMql = null, reducedFn = null; // r43: one MediaQueryList (its .matches is live); a matchMedia() call per use cost 44 ms over 4 transitions at 4x throttle
export function osPrefersReducedMotion() {
  if (typeof matchMedia !== 'function') return false;
  if (!reducedMql || reducedFn !== matchMedia) { reducedFn = matchMedia; reducedMql = matchMedia('(prefers-reduced-motion: reduce)'); }
  return reducedMql.matches;
}

/** One `matchMedia` query, reused by every M7 juice effect (and the M3
 * screen shake) so a single OS/browser setting turns off all of the
 * decorative motion at once (OVERNIGHT.md M7-1: "every effect respects
 * prefers-reduced-motion"). The player's settings-menu choice wins over the OS value.
 * Guarded for environments without `matchMedia`
 * (the `tests/` harness), where it safely reads as "no preference". */
export function prefersReducedMotion() {
  return motion.reduced !== null ? motion.reduced : osPrefersReducedMotion();
}
