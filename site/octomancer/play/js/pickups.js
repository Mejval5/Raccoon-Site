// Pickups: pearls, plankton swarms and rare shells, spawned from each
// chunk's generator output (gen.js `spawns`), collected on overlap with the
// octopus. Score points themselves are wired up properly in M4; this module
// just tracks collection so the counts exist to score from.
// OVERNIGHT.md §2 "World" spawns / M2-3.
//
// All pickup positions are stored in world space (chunk-local spawn.y plus
// that chunk's fixed yOffset), baked in once per chunk the first time it is
// seen, since a chunk's world position never changes after generation.

const COLLECT_RADIUS = 0.55; // world units, added to the octopus's own radius
const PLANKTON_PULL_RADIUS = 1.0; // "pulled in within 1 unit" (OVERNIGHT.md M2-3)
const PLANKTON_PULL_SPEED = 3.0; // u/s, drift-toward speed once inside the pull radius

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Round-11 fix (review round 10 leftover, issue 2: "plankton swarm dots
// drawn inside solid rock / on top of the rim"). The scatter below only ever
// checked the swarm's own centre (`s.x`/`s.y`, baked by gen.js to be open),
// then placed each dot up to 1.6 tiles away from it with no solid check at
// all -- easily far enough to land inside a nearby wall or straddle its rim,
// especially for a swarm anchored close to a cave wall. `planktonSpotOpen`
// rejects a candidate dot whose own tile is solid, or whose tile is solid
// within `PLANKTON_RIM_MARGIN` tiles in any of the 4 axis directions (a
// cheap stand-in for "too close to the traced rim" without needing the
// world's segment outline here, which chunk-build time doesn't have access
// to) -- `buildChunkPickups` below re-rolls a few times and drops the dot
// entirely rather than ever embedding one in rock.
const PLANKTON_SWARM_RADIUS = 1.6; // tiles, matches the original scatter radius
const PLANKTON_RIM_MARGIN = 0.25; // tiles, kept above the idle wobble amplitude (0.12) so a validated spot never wobbles back across the rim
const PLANKTON_PLACEMENT_TRIES = 8;
function planktonSpotOpen(chunk, x, yLocal) {
  const pts = [
    [x, yLocal], [x - PLANKTON_RIM_MARGIN, yLocal], [x + PLANKTON_RIM_MARGIN, yLocal],
    [x, yLocal - PLANKTON_RIM_MARGIN], [x, yLocal + PLANKTON_RIM_MARGIN],
  ];
  for (const [px, py] of pts) {
    const lx = Math.floor(px), ly = Math.floor(py);
    if (lx < 0 || lx >= chunk.width || ly < 0 || ly >= chunk.height) return false; // off this chunk -- unknown, treat as unsafe
    const v = chunk.tiles[ly * chunk.width + lx];
    if (v === 1 || v === 2) return false; // solid (hard or soft rock)
  }
  return true;
}

/** Lazily expands a chunk's raw spawn list (from gen.js) into live, world-
 * space pickup instances the first time that chunk is seen. */
function buildChunkPickups(chunk, yOffset, seedSalt) {
  const items = [];
  let m = seedSalt;
  const rnd = () => { m = (m * 9301 + 49297) % 233280; return m / 233280; };
  for (const s of chunk.spawns) {
    const wy = s.y + yOffset;
    if (s.type === 'pearl') {
      items.push({ type: 'pearl', x: s.x, y: wy, hidden: !!s.hidden, collected: false });
    } else if (s.type === 'shell') {
      // Round-3 fix (Daniel's screenshot review: "a shell is drawn inside
      // plain, uniform solid rock, with nothing marking that rock as
      // breakable" -- shells always spawn in a sealed soft-rock pocket
      // (gen.js), but this used to draw them unconditionally, on top of the
      // still-solid tile, with no `hidden` flag the way pearls already get).
      // `hidden` starts true and is recomputed live in `update()` below from
      // the chunk's own tile data, same idea as a hidden pearl -- so a shell
      // only becomes visible once its pocket is actually bombed open.
      items.push({ type: 'shell', x: s.x, y: wy, hidden: true, collected: false });
    } else if (s.type === 'plankton-swarm') {
      for (let i = 0; i < s.count; i++) {
        let bx = s.x, byLocal = s.y, phase = 0, found = false;
        for (let tries = 0; tries < PLANKTON_PLACEMENT_TRIES; tries++) {
          const a = rnd() * Math.PI * 2;
          const r = rnd() * PLANKTON_SWARM_RADIUS;
          const cx = s.x + Math.cos(a) * r;
          const cyLocal = s.y + Math.sin(a) * r;
          if (planktonSpotOpen(chunk, cx, cyLocal)) { bx = cx; byLocal = cyLocal; phase = a; found = true; break; }
        }
        if (!found) continue; // no open spot near the swarm centre after several tries -- drop it rather than embed it in rock
        const by = byLocal + yOffset;
        items.push({ type: 'plankton', x: bx, y: by, baseX: bx, baseY: by, phase, collected: false });
      }
    }
  }
  return items;
}

export function createPickups() {
  /** @type {Map<number, any[]>} */
  const byChunk = new Map();
  const totals = { pearls: 0, plankton: 0, shells: 0 };
  // M7-1: one 'collected' event per pickup this step, for main.js to spawn a
  // sparkle (particles.js) at the exact pickup spot - cheaper and more
  // precise than diffing `totals` the way S-1's pearl SFX does.
  const events = [];

  function ensureChunk(ci, chunk, yOffset) {
    if (byChunk.has(ci)) return byChunk.get(ci);
    const items = buildChunkPickups(chunk, yOffset, ci * 7919 + 13);
    byChunk.set(ci, items);
    return items;
  }

  return {
    totals,
    /** One fixed step: pull nearby plankton toward the octopus, resolve
     * collection, and drop pickup lists for chunks the world has evicted.
     * `world` is optional (only needed for the solid check below) so any
     * existing caller/test that doesn't pass it keeps working unchanged. */
    update(dt, time, octo, resident, world) {
      events.length = 0;
      const liveChunks = new Set(resident.map((r) => r.index));
      for (const ci of [...byChunk.keys()]) {
        if (!liveChunks.has(ci)) byChunk.delete(ci);
      }
      for (const { index, yOffset, chunk } of resident) {
        const items = ensureChunk(index, chunk, yOffset);
        for (const it of items) {
          if (it.collected) continue;
          if (it.type === 'shell') {
            // Live re-check (not baked in at spawn like a hidden pearl):
            // a shell's own tile starts as soft rock (gen.test.js asserts
            // this) and only turns to water once bombed, so `hidden` can
            // simply track the tile's current value each step.
            const lx = Math.floor(it.x), ly = Math.floor(it.y - yOffset);
            const inChunk = lx >= 0 && lx < chunk.width && ly >= 0 && ly < chunk.height;
            it.hidden = inChunk ? chunk.tiles[ly * chunk.width + lx] === 2 : it.hidden;
          }
          if (it.type === 'plankton') {
            const prevX = it.x, prevY = it.y;
            const d = dist(octo.x, octo.y, it.x, it.y);
            if (d < PLANKTON_PULL_RADIUS && d > 1e-4) {
              const t = Math.min(1, (PLANKTON_PULL_SPEED * dt) / d);
              it.x += (octo.x - it.x) * t;
              it.y += (octo.y - it.y) * t;
            } else {
              it.x = it.baseX + Math.sin(time * 1.3 + it.phase) * 0.12;
              it.y = it.baseY + Math.cos(time * 1.1 + it.phase) * 0.12;
            }
            // Round-11 fix (review round 10 leftover, issue 2's own
            // suggestion: "apply the same check if the plankton idle wobble
            // can move a dot across the rim"). Scripted verification for
            // this round also caught the PULL toward the octopus doing the
            // same thing: a straight line to the octopus with no solid
            // check can cross a thin wall the octopus is diving past on the
            // other side. Both moves are a plain per-step add with no
            // physics -- if the result lands in rock, just undo this step's
            // move rather than run a full resolve for a cosmetic drift.
            // `world` is optional (kept off older callers/tests) so this
            // only activates once main.js passes it through.
            if (world && world.isSolid(it.x, it.y)) { it.x = prevX; it.y = prevY; }
          }
          const d = dist(octo.x, octo.y, it.x, it.y);
          if (d < COLLECT_RADIUS + octo.radius) {
            it.collected = true;
            if (it.type === 'pearl') totals.pearls++;
            else if (it.type === 'shell') totals.shells++;
            else if (it.type === 'plankton') totals.plankton++;
            events.push({ type: it.type, x: it.x, y: it.y });
          }
        }
      }
    },
    events,
    /** Visible, uncollected pickups in world space, for render.js. */
    visible(resident) {
      const out = [];
      for (const { index, yOffset } of resident) {
        const items = byChunk.get(index);
        if (!items) continue;
        for (const it of items) {
          if (it.collected) continue;
          out.push(it);
        }
      }
      return out;
    },
  };
}
