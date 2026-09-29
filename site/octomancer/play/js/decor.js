// Decor: bubbles rising from vents, plants anchored per chunk from the
// chunk's own seeded data, and the depth tint (bluer/darker every 100
// units, never below 35% floor brightness). OVERNIGHT.md §2 "World" / M2-3.

const BUBBLE_RISE_SPEED = 1.4; // u/s
const BUBBLE_LIFETIME = 3.5; // s before a vent's bubble respawns at the bottom

/** Picks a handful of floor cells per chunk to act as bubble vents (cheap,
 * deterministic given the chunk's own tile data - no extra RNG needed). */
function findVents(chunk, yOffset, chunkW, chunkH) {
  const vents = [];
  for (let y = chunkH - 2; y > 0 && vents.length < 3; y--) {
    for (let x = 2; x < chunkW - 2 && vents.length < 3; x++) {
      const i = y * chunkW + x;
      const below = (y + 1) * chunkW + x;
      if (chunk.tiles[i] === 0 && chunk.tiles[below] !== 0 && (x + y) % 7 === 0) {
        vents.push({ x: x + 0.5, y: y + yOffset + 0.9 });
      }
    }
  }
  return vents;
}

export function createDecor(chunkW, chunkH) {
  /** @type {Map<number, {vents:{x:number,y:number}[], bubbles:{x:number,y:number,t:number}[]}>} */
  const byChunk = new Map();

  function ensureChunk(ci, chunk, yOffset) {
    if (byChunk.has(ci)) return byChunk.get(ci);
    const vents = findVents(chunk, yOffset, chunkW, chunkH);
    const bubbles = vents.map((v, i) => ({ x: v.x, y: v.y, t: (i * BUBBLE_LIFETIME) / (vents.length || 1) }));
    const entry = { vents, bubbles };
    byChunk.set(ci, entry);
    return entry;
  }

  return {
    update(dt, resident) {
      const live = new Set(resident.map((r) => r.index));
      for (const ci of [...byChunk.keys()]) if (!live.has(ci)) byChunk.delete(ci);
      for (const { index, yOffset, chunk } of resident) {
        const entry = ensureChunk(index, chunk, yOffset);
        for (const b of entry.bubbles) {
          b.t += dt;
          if (b.t > BUBBLE_LIFETIME) b.t -= BUBBLE_LIFETIME;
        }
      }
    },
    /** Visible bubble instances (world x, world y, rise progress 0..1). */
    visibleBubbles(resident) {
      const out = [];
      for (const { index } of resident) {
        const entry = byChunk.get(index);
        if (!entry) continue;
        for (let i = 0; i < entry.bubbles.length; i++) {
          const b = entry.bubbles[i];
          const vent = entry.vents[i];
          const progress = b.t / BUBBLE_LIFETIME;
          out.push({ x: vent.x + Math.sin(b.t * 2 + i) * 0.15, y: vent.y - progress * BUBBLE_RISE_SPEED * BUBBLE_LIFETIME, alpha: 1 - progress * 0.6 });
        }
      }
      return out;
    },
  };
}

/** Depth tint: bluer and darker every 100 units, floored at 35% brightness.
 * Returns an rgba() overlay to composite over the scene with 'multiply' plus
 * a flat blue wash, cheap and stable at any depth. */
export function depthTint(depth) {
  const t = Math.min(1, depth / 600); // fully saturated by depth 600
  const brightness = Math.max(0.35, 1 - t * 0.65);
  const blue = 40 + t * 60;
  return { brightness, overlay: `rgba(4,10,${Math.round(blue)},${(t * 0.35).toFixed(3)})` };
}
