// Chain reactions (2026-10-08, Daniel: "chain reactions - oh yeah!"). Spelunky style: a bomb going off sets off the bombs in its
// radius, shakes boulders loose, makes clams snap, wakes tentacles, makes eels discharge, bursts pots, shatters fragile tiles,
// surges jets and springs traps; a boulder that lands sets off what it lands on; a snap or a shock jumps to its neighbours.
//
// WHAT sets off WHAT is data: creature-rules.js TRIGGERS (per source, the target kinds and their reach). This module is the
// queue between "something went off here" (emit) and "this target goes off now" (the target adapter's fire):
//   - every link waits a short delay (the source row's [near, far] range, 0.1-0.3 s) so the chain reads one link at a time;
//   - each link draws a spark from its source to its target while it waits, and a ring when the target goes off (chain-draw.js);
//   - caps: a chain has at most CHAIN_MAX_LINKS links and CHAIN_MAX_DEPTH generations, a target is set off at most once per
//     chain (no loops), at most CHAIN_BUDGET links fire per step (the rest wait their turn) and the queue holds CHAIN_QUEUE;
//   - off-screen rule: a chain that started off screen never sets off anything off screen (cull.js inCameraView).
//
// TARGET ADAPTERS (registered by main.js, one per target kind, the same idea as damage.js families):
//   { name, each(x, y, r, cb), fire(i, ctx) }
//   each() calls cb(i, tx, ty) for every target of its kind within r of (x, y) that can be set off right now;
//   fire() sets target i off (ctx: { chain, depth, byOcto, x, y, sx, sy }) and returns true when it did something.
// A target that goes off and is itself a source (a bomb exploding, a boulder landing, a clam snapping, an eel shocking) carries
// ctx.chain / ctx.depth and hands them back to emit() when it happens, so the next generation joins the same chain.
//
// Data-oriented: the queue, the chains, the visited set and the flashes are flat typed arrays; no allocation per link.

import { TRIGGERS, TRIGGER_SOURCES, TRIGGER_TARGET_NAMES, triggerReach } from './creature-rules.js';
import { inCameraView } from './cull.js';

export const CHAIN_QUEUE = 48;      // pending links at most (more are dropped and counted)
export const CHAIN_BUDGET = 6;      // links that may fire in one fixed step (the rest wait: the frame time stays flat)
export const CHAIN_MAX_LINKS = 24;  // links one chain may queue in all
export const CHAIN_MAX_DEPTH = 8;   // generations (a bomb that sets off a bomb that sets off ...)
export const CHAIN_SLOTS = 16;      // chains alive at once (a slot is reused round robin)
export const CHAIN_VISITS = 192;    // visited (chain, target) pairs remembered
export const CHAIN_FLASH = 24;      // rings drawn at once
export const CHAIN_FLASH_T = 0.3;   // s a ring shows
export const CHAIN_SCREEN_MARGIN = 0.5; // tiles: "on screen" is the camera view widened this much

const SRC_CODE = {}; TRIGGER_SOURCES.forEach((s, k) => { SRC_CODE[s] = k; });

export function createChain() {
  const Q = CHAIN_QUEUE;
  const q = {
    n: 0,
    tgt: new Uint8Array(Q), idx: new Int32Array(Q), src: new Uint8Array(Q), depth: new Uint8Array(Q), chain: new Int32Array(Q),
    t0: new Float64Array(Q), due: new Float64Array(Q),
    sx: new Float32Array(Q), sy: new Float32Array(Q), tx: new Float32Array(Q), ty: new Float32Array(Q),
  };
  // chains: slot = id % CHAIN_SLOTS
  const ch = { id: new Int32Array(CHAIN_SLOTS).fill(-1), links: new Uint16Array(CHAIN_SLOTS), on: new Uint8Array(CHAIN_SLOTS), octo: new Uint8Array(CHAIN_SLOTS), fired: new Uint16Array(CHAIN_SLOTS), depth: new Uint8Array(CHAIN_SLOTS) };
  let nextId = 0;
  // visited ring: (chain id, target kind, index)
  const vis = { n: 0, w: 0, chain: new Int32Array(CHAIN_VISITS).fill(-1), tgt: new Uint8Array(CHAIN_VISITS), idx: new Int32Array(CHAIN_VISITS) };
  // flashes (a ring where a target went off) for chain-draw.js
  const fl = { n: 0, w: 0, x: new Float32Array(CHAIN_FLASH), y: new Float32Array(CHAIN_FLASH), t: new Float64Array(CHAIN_FLASH), tgt: new Uint8Array(CHAIN_FLASH) };
  const targets = []; // adapters, by target code (TRIGGER_TARGET_NAMES order)
  const TN = TRIGGER_TARGET_NAMES;
  let now = 0;
  const stats = { emitted: 0, queued: 0, fired: 0, dropped: 0, capped: 0, offscreen: 0, deferred: 0, chains: 0, maxDepth: 0, maxFiredPerStep: 0 };
  const events = []; // {type:'link', target, x, y, sx, sy, chain, depth} per fired link (main.js: sound; tests)
  const ctx = { chain: -1, depth: 0, byOcto: false, x: 0, y: 0, sx: 0, sy: 0 };

  function slotOf(id) { const s = id % CHAIN_SLOTS; return ch.id[s] === id ? s : -1; }
  function newChain(x, y, byOcto) {
    const id = nextId++, s = id % CHAIN_SLOTS;
    ch.id[s] = id; ch.links[s] = 0; ch.fired[s] = 0; ch.depth[s] = 0;
    ch.on[s] = inCameraView(x, y, CHAIN_SCREEN_MARGIN) ? 1 : 0;
    ch.octo[s] = byOcto ? 1 : 0;
    stats.chains++;
    return id;
  }
  function visited(id, t, i) {
    for (let k = 0; k < vis.n; k++) if (vis.chain[k] === id && vis.tgt[k] === t && vis.idx[k] === i) return true;
    return false;
  }
  function visit(id, t, i) {
    vis.chain[vis.w] = id; vis.tgt[vis.w] = t; vis.idx[vis.w] = i;
    vis.w = (vis.w + 1) % CHAIN_VISITS; if (vis.n < CHAIN_VISITS) vis.n++;
  }
  function pending(t, i) { for (let k = 0; k < q.n; k++) if (q.tgt[k] === t && q.idx[k] === i) return true; return false; }

  // emit()'s candidate callback reads its state from here (no closure per emit)
  const em = { id: -1, slot: -1, src: 0, depth: 0, x: 0, y: 0, reach: 1, tgt: 0, d0: 0.1, d1: 0.3, n: 0 };
  function candidate(i, tx, ty) {
    const t = em.tgt;
    if (visited(em.id, t, i) || pending(t, i)) return;
    if (!ch.on[em.slot] && !inCameraView(tx, ty, CHAIN_SCREEN_MARGIN)) { stats.offscreen++; return; }
    if (ch.links[em.slot] >= CHAIN_MAX_LINKS) { stats.capped++; return; }
    if (q.n >= Q) { stats.dropped++; return; }
    const k = q.n++;
    const u = Math.min(1, Math.hypot(tx - em.x, ty - em.y) / em.reach);
    q.tgt[k] = t; q.idx[k] = i; q.src[k] = em.src; q.depth[k] = em.depth; q.chain[k] = em.id;
    q.t0[k] = now; q.due[k] = now + em.d0 + (em.d1 - em.d0) * u;
    q.sx[k] = em.x; q.sy[k] = em.y; q.tx[k] = tx; q.ty[k] = ty;
    visit(em.id, t, i);
    ch.links[em.slot]++;
    stats.queued++; em.n++;
  }

  const api = {
    /** Register (or replace, by name) the adapter of a target kind (a TRIGGER_TARGETS name). */
    register(a) {
      const t = TN.indexOf(a.name);
      if (t < 0) throw new Error('chain: unknown target kind ' + a.name);
      targets[t] = a;
      return a;
    },
    /**
     * `src` (a TRIGGERS source) went off at (x, y). parent: the chain it belongs to ({chain, depth} from the ctx its target
     * was fired with; null / chain < 0: it starts a new chain, a spontaneous event). self: { target, i } the thing that went off,
     * so it never sets itself off. Returns the chain id (or -1 when nothing was set off and no chain was made).
     */
    emit(src, x, y, parent = null, byOcto = true, self = null) {
      const row = TRIGGERS[src];
      if (!row) return -1;
      stats.emitted++;
      const spontaneous = !parent || parent.chain === undefined || parent.chain < 0;
      let id = spontaneous ? -1 : parent.chain;
      let slot = id >= 0 ? slotOf(id) : -1;
      if (id >= 0 && slot < 0) { id = -1; } // its slot was reused (a very old chain): it starts again
      const depth = id >= 0 ? (parent.depth | 0) + 1 : 1;
      if (depth > CHAIN_MAX_DEPTH) { stats.capped++; return id; }
      if (id < 0) { id = newChain(x, y, byOcto); slot = id % CHAIN_SLOTS; }
      if (self) { const st = TN.indexOf(self.target); if (st >= 0 && !visited(id, st, self.i)) visit(id, st, self.i); }
      em.id = id; em.slot = slot; em.src = SRC_CODE[src]; em.depth = depth; em.x = x; em.y = y; em.n = 0;
      em.d0 = row.delay[0]; em.d1 = row.delay[1];
      for (let t = 0; t < TN.length; t++) {
        const a = targets[t];
        if (!a) continue;
        const r = triggerReach(src, TN[t], spontaneous);
        if (r <= 0) continue;
        em.tgt = t; em.reach = r;
        a.each(x, y, r, candidate);
      }
      if (depth > ch.depth[slot]) ch.depth[slot] = depth;
      if (depth > stats.maxDepth) stats.maxDepth = depth;
      return id;
    },
    /** One fixed step: the links whose delay is up go off (at most CHAIN_BUDGET; the rest wait for the next step). */
    step(dt) {
      now += dt;
      events.length = 0;
      let fired = 0, w = 0;
      for (let k = 0; k < q.n; k++) {
        if (q.due[k] <= now && fired < CHAIN_BUDGET) {
          fired++;
          const a = targets[q.tgt[k]], id = q.chain[k], slot = slotOf(id);
          ctx.chain = slot >= 0 ? id : -1; ctx.depth = q.depth[k]; ctx.byOcto = slot >= 0 ? ch.octo[slot] === 1 : false;
          ctx.x = q.tx[k]; ctx.y = q.ty[k]; ctx.sx = q.sx[k]; ctx.sy = q.sy[k];
          if (a && a.fire(q.idx[k], ctx)) {
            stats.fired++;
            if (slot >= 0) ch.fired[slot]++;
            fl.x[fl.w] = q.tx[k]; fl.y[fl.w] = q.ty[k]; fl.t[fl.w] = now; fl.tgt[fl.w] = q.tgt[k];
            fl.w = (fl.w + 1) % CHAIN_FLASH; if (fl.n < CHAIN_FLASH) fl.n++;
            events.push({ type: 'link', target: TN[q.tgt[k]], x: q.tx[k], y: q.ty[k], sx: q.sx[k], sy: q.sy[k], chain: id, depth: q.depth[k] });
          }
          continue;
        }
        if (q.due[k] <= now) stats.deferred++;
        if (w !== k) {
          q.tgt[w] = q.tgt[k]; q.idx[w] = q.idx[k]; q.src[w] = q.src[k]; q.depth[w] = q.depth[k]; q.chain[w] = q.chain[k];
          q.t0[w] = q.t0[k]; q.due[w] = q.due[k]; q.sx[w] = q.sx[k]; q.sy[w] = q.sy[k]; q.tx[w] = q.tx[k]; q.ty[w] = q.ty[k];
        }
        w++;
      }
      q.n = w;
      if (fired > stats.maxFiredPerStep) stats.maxFiredPerStep = fired;
    },
    /** Forget everything (a new level). */
    reset() {
      q.n = 0; vis.n = 0; vis.w = 0; vis.chain.fill(-1); fl.n = 0; fl.w = 0; ch.id.fill(-1); events.length = 0;
    },
    /** A chain's numbers (tests): links queued, fired, deepest generation, started on screen. Null once its slot was reused. */
    chainInfo(id) { const s = slotOf(id); return s < 0 ? null : { links: ch.links[s], fired: ch.fired[s], depth: ch.depth[s], onScreen: ch.on[s] === 1, byOcto: ch.octo[s] === 1 }; },
    now() { return now; },
    events,
    stats,
    queue: q,
    flashes: fl,
    targets() { return targets; },
  };
  return api;
}
