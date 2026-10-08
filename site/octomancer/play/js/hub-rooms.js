// The hub village's rooms (Daniel 2026-10-08, after Spelunky 2's Base Camp): one room per person you have helped, built into the
// authored hub map (data/hub.json) and described by data/hub-rooms.json. A room is locked (sealed by a kelp curtain, planks or
// rubble, or simply empty) until its person's questline says otherwise, then furnished and lived in. Pure data and geometry
// here (no DOM, no drawing): main.js wires it in, hub-rooms-draw.js draws it.
//
// Persistence: a room once seen open stays open (save.js story.hubRooms, bit i = room i of the table), even if the condition
// that opened it later goes away (a person away for a dive after being killed).

import { MAT_TIMBER, MAT_ROCK } from './materials.js';

export const SEAL_KELP = 'kelp', SEAL_PLANKS = 'planks', SEAL_RUBBLE = 'rubble', SEAL_EMPTY = 'empty';
const SEAL_MAT = { planks: MAT_TIMBER, rubble: MAT_ROCK };
export const ROOMS_KEY = 'hubRooms';

/** @param {any} json data/hub-rooms.json */
export function parseHubRooms(json) {
  const rooms = (json.rooms || []).map((r, i) => ({
    ...r, bit: 1 << i, furnish: r.furnish || [], lines: r.lines || [], area: r.area || [-4, -4, 4, 0],
  }));
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const byNpc = new Map(rooms.map((r) => [r.npc, r]));
  return { rooms, byId, byNpc, wardrobe: json.wardrobe || null, target: json.target || null, keepsake: json.keepsake || null };
}

export async function fetchHubRooms(url = new URL('../data/hub-rooms.json', import.meta.url).href) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('hub-rooms.json: ' + res.status);
  return parseHubRooms(await res.json());
}

/**
 * Does the room's condition hold? `ctx` = { story, stat(entryId, statName) -> number }.
 * {story: key, min} reads a story counter, {journal: id, stat, min} a journal counter.
 */
export function conditionMet(cond, ctx) {
  if (!cond) return true;
  const min = cond.min === undefined ? 1 : cond.min;
  if (cond.story) return ((ctx.story && ctx.story[cond.story]) | 0) >= min;
  if (cond.journal) return ((ctx.stat ? ctx.stat(cond.journal, cond.stat || 'seen') : 0) | 0) >= min;
  return false;
}

/**
 * Every room's state for this story: [{room, open, isNew}]. open = the condition holds or the room was seen open before
 * (the bit in story.hubRooms); isNew = open now but never seen open (main.js shows the 'moved in' line and sets the bit).
 */
export function roomStates(table, ctx) {
  const seen = (ctx.story && ctx.story[ROOMS_KEY]) | 0;
  return table.rooms.map((room) => {
    const was = (seen & room.bit) !== 0;
    const open = was || conditionMet(room.unlock, ctx);
    return { room, open, isNew: open && !was };
  });
}

/** The bit mask of the open rooms (to store in story.hubRooms). */
export function openMask(states) { let m = 0; for (const s of states) if (s.open) m |= s.room.bit; return m; }

/**
 * Lay the rooms into a freshly parsed hub level (authored.js; before the world is built): locked plank and rubble doors become
 * solid, and `level.village` gets each room's geometry and state:
 * {id, room, open, seal, ax, ay (anchor tile), x0, y0, x1, y1 (area, inclusive tiles), doors: [x, y, ...], dx0, dy0, dx1, dy1 (door rect)}.
 * Also adds plant keep-outs around the furniture (level.keepOut, read by world-v2.js); `aspect(name)` = a sprite's width / height.
 */
export function applyHubRooms(level, table, states, aspect = null) {
  const pts = level.points || {};
  level.village = [];
  level.keepOut = level.keepOut || [];
  for (const st of states) {
    const r = st.room, a = pts[r.anchor];
    if (!a) continue;
    const ax = a[0], ay = a[1];
    const doors = pts[r.door] ? pts[r.door].slice() : [];
    let dx0 = 1e9, dy0 = 1e9, dx1 = -1e9, dy1 = -1e9;
    for (let i = 0; i < doors.length; i += 2) { dx0 = Math.min(dx0, doors[i]); dx1 = Math.max(dx1, doors[i]); dy0 = Math.min(dy0, doors[i + 1]); dy1 = Math.max(dy1, doors[i + 1]); }
    const rec = {
      id: r.id, room: r, open: st.open, isNew: st.isNew, seal: r.seal || SEAL_EMPTY, ax, ay,
      x0: ax + r.area[0], y0: ay + r.area[1], x1: ax + r.area[2], y1: ay + r.area[3], doors, dx0, dy0, dx1, dy1,
    };
    if (!st.open && SEAL_MAT[rec.seal] !== undefined) for (let i = 0; i < doors.length; i += 2) level.tiles[doors[i + 1] * level.w + doors[i]] = SEAL_MAT[rec.seal];
    level.village.push(rec);
    // no plants over the furniture or on the person's spot (the walls and the ceiling keep theirs)
    level.keepOut.push({ x0: ax - 1, x1: ax + 2, y0: ay - 2, y1: ay + 2 });
    for (const f of r.furnish) {
      if (!f.sprite || f.h === undefined) continue;
      const half = f.h * (aspect ? aspect(f.sprite) : 1.5) / 2 + 0.5, fx = ax + f.dx, fy = ay + f.dy;
      level.keepOut.push({ x0: Math.floor(fx - half), x1: Math.ceil(fx + half), y0: Math.floor(fy - f.h - 0.5), y1: Math.ceil(fy + 1) });
    }
  }
  const keep = (ch, rx, up) => { const p = pts[ch]; if (p) level.keepOut.push({ x0: p[0] - rx, x1: p[0] + rx + 1, y0: p[1] - up, y1: p[1] + 2 }); };
  keep('A', 2, 2); keep('G', 1, 2); keep('y', 2, 2);
  return level.village;
}

/** The room record of a person in this level (or null). */
export function roomOf(level, npc) {
  if (!level.village) return null;
  for (const r of level.village) if (r.room.npc === npc) return r;
  return null;
}

/** The room whose area holds the point (or null). */
export function roomAt(level, x, y) {
  if (!level.village) return null;
  for (const r of level.village) if (x >= r.x0 && x < r.x1 + 1 && y >= r.y0 && y < r.y1 + 1) return r;
  return null;
}

/**
 * A locked kelp curtain is soft: the octopus can nose into it but is pushed back out the way it came (towards the side of the
 * door away from the room's anchor). Returns true when it pushed.
 */
export function kelpPush(level, o) {
  if (!level.village) return false;
  for (const r of level.village) {
    if (r.open || r.seal !== SEAL_KELP || !r.doors.length) continue;
    const m = 0.45;
    if (o.x < r.dx0 - m || o.x > r.dx1 + 1 + m || o.y < r.dy0 - m || o.y > r.dy1 + 1 + m) continue;
    const out = r.ax < r.dx0 ? 1 : -1; // the room lies left of the door: push right
    const edge = out > 0 ? r.dx1 + 1 + m + 0.02 : r.dx0 - m - 0.02;
    if ((edge - o.x) * out > 0) {
      o.vx = out * Math.max(2.4, Math.abs(o.vx) * 0.5);
      if (Math.abs(edge - o.x) > 0.9) o.x = edge - out * 0.9; // never far inside, even after a dash
    }
    return true;
  }
  return false;
}

/** The tiles a locked room seals off (to treat as walls for a reachability check): [x, y, ...] of kelp doors. */
export function softWalls(level) {
  const out = [];
  if (level.village) for (const r of level.village) if (!r.open && r.seal === SEAL_KELP) out.push(...r.doors);
  return out;
}
