// Round 43: off-screen culling (cull.js), the canvas pool (canvas-pool.js), the wall cells and the staged level build.
// The real-browser side (10 transitions at 412 x 915 / DPR 3 under 4x CPU throttle, long tasks, a culled piranha that keeps
// patrolling and still bites) is tests/phone-cdp.js; these are the parts that need no game page.
import { cullFrame, cullEnd, cullReset, cullFlags, visibleAt, visibleObj, offScreenFar, cullStats, CULL_ON, CULL_OFF } from '../js/cull.js';
import { acquireCanvas, releaseCanvas, drainCanvasPool, canvasPoolStats, markAllocation, pixelRatioCap, canvasBudget } from '../js/canvas-pool.js';
import { createLevelWorld } from '../js/world-v2.js';
import { generateLevel, setDefaultBank } from '../js/level.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { createRoomBank } from '../js/rooms.js';
import { loadRoomsJson } from './rooms.test.js';
import { createParticles } from '../js/particles.js';

export async function runPerf43Tests(assert) {
  // ---- cull.js: AnimationLOD's two thresholds with hysteresis ----
  {
    cullReset();
    const cam = { x: 10, y: 10, pxPerUnit: 50 }; // 500 x 400 px: half extent 5 x 4 units
    cullFrame(cam, 500, 400);
    const fl = cullFlags('t', 4);
    // a thing 5.4 units right of the centre: within 1.1 x 5 = 5.5, so it comes on
    assert('cull: an entity within 1.1 x the camera half-extent comes on', visibleAt(fl, 0, 15.4, 10) === true);
    // 6.4 = 1.28 x: between the two thresholds an entity that is on stays on
    assert('cull: ... and stays on out to 1.3 x (hysteresis)', visibleAt(fl, 0, 16.4, 10) === true);
    assert('cull: beyond 1.3 x it goes off', visibleAt(fl, 0, 16.6, 10) === false);
    assert('cull: back at 1.2 x it is still off (it needs 1.1 x to return)', visibleAt(fl, 0, 16.0, 10) === false);
    assert('cull: within 1.1 x again it returns', visibleAt(fl, 0, 15.4, 10) === true);
    assert('cull: the thresholds are 1.3 and 1.1 (AnimationLOD.cs)', CULL_OFF === 1.3 && CULL_ON === 1.1);
    // the vertical axis uses the vertical half extent (4): 4.5 = 1.125 x is off for an entity that was off, 4.3 on
    const flv = cullFlags('tv', 2);
    assert('cull: the vertical axis has its own half-extent', visibleAt(flv, 0, 10, 14.5) === false && visibleAt(flv, 0, 10, 14.3) === true);
    // a radius widens both thresholds
    const flr = cullFlags('tr', 2);
    assert('cull: an entity\'s own reach widens the box', visibleAt(flr, 0, 17.0, 10, 2) === true && visibleAt(flr, 1, 17.0, 10, 0) === false);
    // objects keep their state in .cv
    const o = { x: 12, y: 10 };
    assert('cull: objects keep the state in .cv', visibleObj(o, o.x, o.y, 0) === true && o.cv === 1);
    o.x = 30;
    assert('cull: ... and go off when far', visibleObj(o, o.x, o.y, 0) === false && o.cv === 0);
    const st = cullStats();
    assert('cull: the frame counts drawn / total entities', st.total > 0 && st.drawn < st.total);
    // far-off effects are not spawned; outside a frame everything is "on screen"
    assert('cull: offScreenFar is true beyond 1.3 x and false inside', offScreenFar(30, 10) === true && offScreenFar(12, 10) === false);
    cullEnd();
    assert('cull: after cullEnd (draw functions called outside the renderer) everything counts as on screen', visibleObj({ x: 99, y: 99 }, 99, 99, 0) === true);
    cullReset();
    assert('cull: reset = no camera, nothing is culled and particles spawn anywhere', offScreenFar(1e6, 1e6) === false);
    // particles: nothing is spawned far from the camera
    const ps = createParticles();
    cullFrame(cam, 500, 400);
    ps.deathPoof(200, 200);
    const farActive = ps.pool.filter((p) => p.active).length;
    ps.deathPoof(10, 10);
    const nearActive = ps.pool.filter((p) => p.active).length - farActive;
    cullEnd(); cullReset();
    assert('cull: particles are not spawned far off screen (0 far, 10 near)', farActive === 0 && nearActive === 10);
  }

  // ---- canvas-pool.js ----
  {
    drainCanvasPool();
    const before = canvasPoolStats();
    const a = acquireCanvas(200, 100);
    assert('pool: acquire gives a canvas of that size', a.width === 200 && a.height === 100);
    a.getContext('2d').fillStyle = '#f00'; a.getContext('2d').fillRect(0, 0, 200, 100);
    releaseCanvas(a);
    const b = acquireCanvas(200, 100);
    assert('pool: a released canvas of the same size is reused, cleared', b === a && b.getContext('2d').getImageData(10, 10, 1, 1).data[3] === 0);
    const bigs = [acquireCanvas(1000, 1000), acquireCanvas(1000, 1000), acquireCanvas(1000, 1000), acquireCanvas(1000, 1000)]; // 4 MB each
    for (const c of bigs) releaseCanvas(c); // the pool keeps at most 12 MB: the fourth does not fit
    const s = canvasPoolStats();
    assert('pool: only what fits the pool budget is kept, the rest is freed at once (size 0)', s.pooledBytes <= 12 * 1048576 && bigs.filter((c) => c.width === 0).length === 1);
    markAllocation();
    const c1 = acquireCanvas(321, 123);
    assert('pool: allocation is counted since markAllocation()', canvasPoolStats().allocatedBytes === 321 * 123 * 4);
    releaseCanvas(c1); releaseCanvas(b);
    drainCanvasPool();
    const after = canvasPoolStats();
    assert('pool: drained, nothing is live or pooled', after.live === before.live && after.pooledBytes === 0);
    const cap = pixelRatioCap(), bud = canvasBudget();
    assert('pool: the pixel ratio cap is 2, or 1.5 on a phone / a small-memory device', cap === 2 || cap === 1.5);
    assert('pool: the canvas budget is the window times the capped ratio', bud.w === Math.ceil(window.innerWidth * bud.dpr) && bud.dpr <= cap);
  }

  // ---- staged build = the one-go build (the generator worker and the main-thread steps must give the same level) ----
  {
    setDefaultBank(createRoomBank(await loadRoomsJson()));
    let same = 0, n = 0;
    for (const [seed, idx] of [[7, 0], [7, 1], [7, 2], [42, 0], [1234, 1]]) {
      const whole = createLevelWorld(seed, idx);
      const level = generateLevel(seed, idx);
      const spawnInfo = buildLevelSpawns(level, seed, idx);
      const staged = createLevelWorld(seed, idx, { generated: level, spawnInfo });
      let eq = whole.width === staged.width && whole.height === staged.height && whole.startX === staged.startX && whole.exitX === staged.exitX;
      for (let y = 0; y < whole.height && eq; y++) for (let x = 0; x < whole.width; x++) if (whole.tileAt(x, y) !== staged.tileAt(x, y)) { eq = false; break; }
      eq = eq && JSON.stringify(whole.residentChunks()[0].chunk.spawns) === JSON.stringify(staged.residentChunks()[0].chunk.spawns);
      n++; if (eq) same++;
    }
    assert(`staged build: generate + spawns + world in separate steps gives the same level as one go (${same}/${n})`, same === n);
  }
}
