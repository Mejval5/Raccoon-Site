// r43: one place for the game's big offscreen canvases (wall cells, the deep-rock bake). Phones run out of GPU memory when every level
// allocates a fresh set (about 15 canvases / 56 MB per transition, freed only when the GC runs), so:
//  - `acquireCanvas(w, h)` reuses a free canvas of exactly that size when there is one (a level's cells are the same size as the last
//    level's), and only creates a new one otherwise;
//  - `releaseCanvas(c)` keeps up to POOL_MAX_BYTES of free canvases for the next level and sets every other one to 0 x 0 at once, which
//    releases the bitmap now, not at the next GC;
//  - `canvasBudget()` is the size rule: no canvas bigger than the screen at the pixel ratio the game renders at.
// Everything is counted, so `__octo.memory()` and the tests can tell what is live, what is pooled and what a transition allocated.

const POOL_MAX_BYTES = 6 * 1048576; // free canvases kept for the next level; the rest are freed on release
const free = new Map(); // 'WxH' -> canvas[]
const live = new Set(); // acquired and not yet released
const shared = new Set(); // long-lived canvases that live outside the pool (the page-wide small textures); counted, never released
let pooledBytes = 0;
let allocatedBytes = 0; // bytes of canvases created (not reused) since the last markAllocation()
let allocatedCount = 0;
let reuseCount = 0;

const bytesOf = (c) => c.width * c.height * 4;
const keyOf = (w, h) => w + 'x' + h;

/** A cleared canvas of exactly `w` x `h` (rounded up to whole pixels), from the pool when one of that size is free. */
export function acquireCanvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  const list = free.get(keyOf(w, h));
  let c = list && list.pop();
  if (c) {
    pooledBytes -= bytesOf(c);
    reuseCount++;
    const g = c.getContext('2d');
    if (g.reset) g.reset(); else { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.clearRect(0, 0, w, h); }
    g.clearRect(0, 0, w, h);
  } else {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    allocatedBytes += w * h * 4; allocatedCount++;
  }
  live.add(c);
  return c;
}

/** Give a canvas back: pooled for the next level while the pool has room, otherwise freed on the spot (size 0 releases the bitmap). */
export function releaseCanvas(c) {
  if (!c) return;
  if (live.has(c)) live.delete(c);
  const b = bytesOf(c);
  if (b > 0 && pooledBytes + b <= POOL_MAX_BYTES) {
    const k = keyOf(c.width, c.height);
    let list = free.get(k);
    if (!list) free.set(k, list = []);
    list.push(c); pooledBytes += b;
  } else { c.width = 0; c.height = 0; }
}

/** Free every pooled canvas now (the page is hidden, or a test wants a clean slate). */
export function drainCanvasPool() {
  for (const list of free.values()) for (const c of list) { c.width = 0; c.height = 0; }
  free.clear(); pooledBytes = 0;
}

/** Note a canvas that lives for the whole page (a texture shared by every level) so the memory report counts it. */
export function sharedCanvas(c) { shared.add(c); return c; }
/** A shared canvas is being thrown away: free it now and stop counting it. */
export function unshareCanvas(c) { if (c) { shared.delete(c); c.width = 0; c.height = 0; } }

/** Start counting allocations from here (the transition's start). */
export function markAllocation() { allocatedBytes = 0; allocatedCount = 0; }

/** Live (in use) and pooled (free, kept for the next level) canvases, and what was created since markAllocation(). */
export function canvasPoolStats() {
  let bytes = 0;
  for (const c of live) bytes += bytesOf(c);
  let pooledN = 0;
  for (const list of free.values()) pooledN += list.length;
  let sharedBytes = 0;
  for (const c of shared) sharedBytes += bytesOf(c);
  return { live: live.size, liveBytes: bytes, shared: shared.size, sharedBytes, pooled: pooledN, pooledBytes, allocatedBytes, allocatedCount, reuseCount };
}

/**
 * The size rule for a canvas that mirrors the screen: the device pixel ratio the game renders at, never above 2 (1.5 on a phone: a
 * touch screen under 500 css px wide, or a device that reports 4 GB of memory or less).
 * @returns {number}
 */
export function pixelRatioCap() {
  if (typeof window === 'undefined') return 1;
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const touch = (nav.maxTouchPoints || 0) > 0;
  const small = touch && Math.min(window.screen ? window.screen.width : 9999, window.innerWidth || 9999) < 500;
  const lowMem = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  return small || lowMem ? 1.5 : 2;
}

/** The largest canvas `{w, h}` the viewport justifies: the window in css px times the capped ratio. */
export function canvasBudget() {
  const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, pixelRatioCap());
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280, h = typeof window !== 'undefined' ? window.innerHeight : 720;
  return { w: Math.ceil(w * dpr), h: Math.ceil(h * dpr), dpr };
}
