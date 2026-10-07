// r43: off-screen culling, ported from the original game's AnimationLOD.cs (octomancer-unity/Assets/Scripts/Animation/AnimationLOD.cs):
// beyond 1.3 x the camera size the animator, the renderer and the particles are switched off; they come back within 1.1 x. The gap
// between the two is the hysteresis that stops an entity on the border from flickering on and off. Only the DRAWING (and the animation
// state worked out for drawing) stops: physics, AI, collisions and A* never ask this module.
//
// Data-oriented: an entity's state is one byte. Arrays of structs keep it in a Uint8Array (`cullFlags`), indexed like the data;
// objects (enemies, critters, particles) carry it in the `cv` field. `visible*()` returns whether to draw and counts the entity, so
// `cullStats()` can say how many of the entities that were asked about this frame were drawn.

export const CULL_OFF = 1.3; // switch off beyond this many camera half-extents (plus the entity's own radius)
export const CULL_ON = 1.1;  // switch back on within this many

const view = { cx: 0, cy: 0, hw: Infinity, hh: Infinity, on: false, stamp: -1e9 };
const stats = { drawn: 0, total: 0, lastDrawn: 0, lastTotal: 0 };
const flagSets = new Map(); // name -> Uint8Array

/** Set the view the next tests are made against: the camera centre and half-extent in world units. Every draw function that culls
 * calls this with its own (camera, canvasW, canvasH), so it works the same inside the renderer and when called on its own (tests). */
export function cullView(camera, canvasW, canvasH) {
  view.cx = camera.x; view.cy = camera.y;
  view.hw = canvasW / camera.pxPerUnit / 2; view.hh = canvasH / camera.pxPerUnit / 2;
  view.on = true;
  view.stamp = typeof performance !== 'undefined' ? performance.now() : 0;
}

/** Start a frame: the view as above, and the counters of the last frame are kept for cullStats(). */
export function cullFrame(camera, canvasW, canvasH) {
  stats.lastDrawn = stats.drawn; stats.lastTotal = stats.total;
  stats.drawn = 0; stats.total = 0;
  cullView(camera, canvasW, canvasH);
}

/** End of the frame's drawing: draw functions called outside the renderer (tests, tools) see everything as on screen. */
export function cullEnd() { view.on = false; }

/** Back to "everything is on screen" (tests, a level that has no camera yet). */
export function cullReset() { view.hw = view.hh = Infinity; view.on = false; view.stamp = -1e9; stats.drawn = stats.total = stats.lastDrawn = stats.lastTotal = 0; flagSets.clear(); }

/** A reusable byte-per-entity state array of at least `n` entries for the data set `name` (1 = drawn, 0 = culled). */
export function cullFlags(name, n) {
  let f = flagSets.get(name);
  if (!f || f.length < n) {
    const g = new Uint8Array(Math.max(16, n, f ? f.length * 2 : 0));
    if (f) g.set(f);
    flagSets.set(name, f = g);
  }
  return f;
}

function decide(on, x, y, r) {
  if (!view.on) return true;
  const dx = Math.abs(x - view.cx), dy = Math.abs(y - view.cy);
  if (on) return dx <= view.hw * CULL_OFF + r && dy <= view.hh * CULL_OFF + r;
  return dx <= view.hw * CULL_ON + r && dy <= view.hh * CULL_ON + r;
}

/** Whether entity `i` of a flag array (see cullFlags) at world (x, y) with reach `r` should be drawn this frame. */
export function visibleAt(flags, i, x, y, r = 0) {
  const on = decide(flags[i] === 1, x, y, r);
  flags[i] = on ? 1 : 0;
  stats.total++; if (on) stats.drawn++;
  return on;
}

/** The same for an object that keeps its state in `o.cv` (0 / 1). */
export function visibleObj(o, x, y, r = 0) {
  const on = decide(o.cv === 1, x, y, r);
  o.cv = on ? 1 : 0;
  stats.total++; if (on) stats.drawn++;
  return on;
}

/** True when a point is far enough off screen that an effect there (a particle) should not be created at all. */
export function offScreenFar(x, y, r = 0) {
  if (!(view.hw < Infinity) || (typeof performance !== 'undefined' && performance.now() - view.stamp > 500)) return false; // no live camera: spawn
  return Math.abs(x - view.cx) > view.hw * CULL_OFF + r || Math.abs(y - view.cy) > view.hh * CULL_OFF + r;
}

/** {drawn, total}: the entities asked about in the last finished frame. */
export function cullStats() { return { drawn: stats.lastDrawn || stats.drawn, total: stats.lastTotal || stats.total }; }
