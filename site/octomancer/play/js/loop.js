// Fixed 50 Hz accumulator loop (dt 0.02, the original's step), max 5 steps per
// frame, interpolated render, pause on visibilitychange/blur.
// OVERNIGHT.md §2 "Loop".

export const STEP = 0.02; // seconds, 50 Hz
const MAX_STEPS = 5;

/**
 * @param {(dt:number)=>void} step  advance simulation by one fixed dt
 * @param {(alpha:number, frameMs:number)=>void} render  draw with interpolation alpha in [0,1)
 */
export function createLoop(step, render) {
  let acc = 0;
  let last = 0;
  let running = false;
  let paused = false;
  let rafId = 0;
  let stepCount = 0;
  let drawCount = 0;
  const frameTimes = []; // rolling window of frame durations (ms), for metrics
  const MAX_SAMPLES = 240;

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (paused) { last = now; return; }
    if (!last) last = now;
    const frameStart = performance.now();
    let dtMs = now - last;
    last = now;
    // Guard against huge gaps (tab was frozen, debugger paused, etc).
    if (dtMs > 250) dtMs = 250;
    acc += dtMs / 1000;

    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      step(STEP);
      acc -= STEP;
      steps++;
      stepCount++;
    }
    // If we hit the step cap, drop the remaining backlog instead of a
    // spiral of death.
    if (steps === MAX_STEPS) acc = 0;

    const alpha = acc / STEP;
    render(alpha, dtMs);
    drawCount++;

    const frameMs = performance.now() - frameStart;
    frameTimes.push(frameMs);
    if (frameTimes.length > MAX_SAMPLES) frameTimes.shift();
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function setPaused(p) {
    paused = !!p;
    if (!paused) last = 0; // avoid a giant dt on resume
  }

  /** Advance the simulation exactly n fixed steps, synchronously, no rendering. */
  function manualStep(n) {
    for (let i = 0; i < n; i++) {
      step(STEP);
      stepCount++;
    }
  }

  function metrics() {
    const sorted = frameTimes.slice().sort((a, b) => a - b);
    const pick = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
    return {
      stepCount,
      drawCount,
      frameMsMedian: pick(0.5),
      frameMsP95: pick(0.95),
      samples: sorted.length,
      paused,
      running,
    };
  }

  // Hidden-tab/blur pausing is driven from main.js (M4-1), which also owns
  // manual (Esc/button) pause and needs the two combined without one
  // silently overriding the other (e.g. a focus event must not resume a
  // manually-paused game). See main.js's `applyPaused()`.

  return { start, stop, setPaused, manualStep, metrics, get paused() { return paused; }, get stepCount() { return stepCount; }, get drawCount() { return drawCount; } };
}
