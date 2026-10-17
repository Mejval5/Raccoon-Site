// Local co-op, Phase 1 (octomancer-web/MULTIPLAYER-PLAN.md): the roster of up to four players, which device drives whom, the
// per-device run records that bring a player back as they left, the four colours, and the small pure helpers the world
// systems and the shared camera use. No DOM, no game state: main.js owns the octopi and calls in here.
//
// One device = one player. The keyboard and the mouse are one device ('keyboard'); a pad is `padKey(gamepad.id, index)`.
// Solo is the roster with one entry whose device is ANY (null): every device drives player 1, exactly as before co-op existed.
// When a second device joins, player 1 is bound to the device it last used.

export const MAX_PLAYERS = 4;
export const KEYBOARD = 'keyboard';
export const ANY = null;

/**
 * The four player colours (Milan's palette, natural: a reef red, a tide-pool teal, a sandstone ochre, a sea-slug violet).
 * `body` is the colour the octopus's base pink becomes through the skins tint path (skin-draw.js); P1 has none: it keeps the
 * look the player wears (today's red by default). `ui` is the colour of the HUD strip, the pause-menu dot and the name tag.
 */
export const PLAYER_COLOURS = [
  { id: 'red', name: 'Red', body: null, ui: '#c05060', dark: '#904050' },
  { id: 'teal', name: 'Teal', body: '#3f8f88', ui: '#4fa39b', dark: '#2e6a64' },
  { id: 'ochre', name: 'Ochre', body: '#b98a3c', ui: '#c99a4a', dark: '#8a672c' },
  { id: 'violet', name: 'Violet', body: '#7d5aa0', ui: '#9474b4', dark: '#5c4276' },
];

/** The roster key of a pad: its id plus its index (two pads of the same make are two players). */
export function padKey(id, index) { return String(id || 'pad') + '#' + (index | 0); }
export function isPadDevice(dev) { return typeof dev === 'string' && dev !== KEYBOARD; }

/** Base stats of a freshly joined player (plan decision 3): 3 hearts, 3 bombs, a full jar, Ink Jet + Ink Cloud, bombs in slot 1. */
export const JOIN_HEARTS = 3;
export const JOIN_BOMBS = 3;
/** Hearts a player who was out (dead) comes back with on the next level (plan decision 6). */
export const REVIVE_HEARTS = 2;

/** A new roster: slot 0 is player 1, on ANY device (solo). */
export function createRoster() {
  return { slots: [{ slot: 0, device: ANY, joinedAt: 0 }, null, null, null], records: new Map(), joins: 0 };
}

/** The players in slot order. */
export function activePlayers(r) { const out = []; for (const p of r.slots) if (p) out.push(p); return out; }
export function playerCount(r) { let n = 0; for (const p of r.slots) if (p) n++; return n; }
export function isSolo(r) { return playerCount(r) <= 1; }
/** The player a device drives, or null. ANY (solo player 1) owns every device. */
export function playerOfDevice(r, dev) {
  for (const p of r.slots) if (p && (p.device === dev || p.device === ANY)) return p;
  return null;
}
/** Whether `dev` is already someone's device in its own right (not just through solo ANY). */
export function deviceTaken(r, dev) { for (const p of r.slots) if (p && p.device === dev) return true; return false; }

/**
 * A device joins (pause menu: A on a pad, Enter on the keyboard). Solo player 1 is bound to `p1Device` first (the device it last
 * used). The newcomer takes the slot of its own record when that slot is free (its colour comes back with it), else the lowest
 * free slot. Returns {player, record} (record: the restored run record, or null for a fresh player), or null when the roster
 * is full or the device already plays.
 */
export function joinDevice(r, dev, p1Device = KEYBOARD) {
  if (dev === ANY || deviceTaken(r, dev)) return null;
  const solo = activePlayers(r);
  if (solo.length === 1 && solo[0].device === ANY) {
    if (p1Device === dev) return null; // that is player 1's own device: nothing to join
    solo[0].device = p1Device;
  }
  if (playerCount(r) >= MAX_PLAYERS) return null;
  const rec = r.records.get(dev) || null;
  let slot = rec && !r.slots[rec.slot] ? rec.slot : -1;
  if (slot < 0) for (let i = 0; i < MAX_PLAYERS; i++) if (!r.slots[i]) { slot = i; break; }
  if (slot < 0) return null;
  const p = { slot, device: dev, joinedAt: ++r.joins };
  r.slots[slot] = p;
  if (rec) r.records.delete(dev);
  return { player: p, record: rec };
}

/**
 * A player leaves (pause menu Remove, or their pad unplugged). `record` is what they carried (hearts, bombs, juice, hotbar,
 * items, dead), kept under their device for the rest of the run. The last player cannot leave. When one player remains, the
 * game is solo again: that player's device goes back to ANY.
 */
export function removePlayer(r, slot, record = null) {
  const p = r.slots[slot];
  if (!p || playerCount(r) <= 1) return null;
  r.slots[slot] = null;
  if (record && p.device !== ANY) r.records.set(p.device, { ...record, slot });
  const left = activePlayers(r);
  if (left.length === 1) left[0].device = ANY;
  return p;
}

/** A new dive (or the hub): every left player's record is forgotten (plan decision 4: records last for the run). */
export function clearRecords(r) { r.records.clear(); }

// --- the world's view of the players ---------------------------------------------------------------------------------------

/** An octopus that can be chased, aimed at and followed by the camera: alive, not in a whirlpool. */
export function targetable(o) { return !!o && !o.dead && !o.hidden && !o.sealed && !o.out; }

/**
 * The octopus a creature at (x, y) goes for: with one octopus (solo) always that one, exactly as before; else the nearest one
 * that can be targeted, or the nearest of all when none can (every body is a dead body: enemies knock them about as before).
 * `list` is an octopus or an array of them.
 */
export function pickTarget(list, x, y) {
  if (!Array.isArray(list)) return list;
  if (list.length === 1) return list[0];
  let best = null, bd = Infinity, any = null, ad = Infinity;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o || o.out) continue;
    const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
    if (d < ad) { ad = d; any = o; }
    if (targetable(o) && d < bd) { bd = d; best = o; }
  }
  return best || any || list[0];
}
/** The first octopus that can be targeted (the lead), else the first one: for the few things that need one octopus for the
 *  whole system rather than per creature (where the Beholder comes in from). Solo: always that octopus. */
export function leadOf(list) {
  if (!Array.isArray(list)) return list;
  if (list.length === 1) return list[0];
  for (let i = 0; i < list.length; i++) if (targetable(list[i])) return list[i];
  return list[0];
}
/**
 * The octopus list as an array without allocating: a single octopus is put in `one` (a module's own reusable 1-slot array).
 * Usage at the top of an update: `const octos = octoList(octoArg, ONE);` with `const ONE = [null];` at module level.
 */
export function octoList(list, one = [null]) {
  if (Array.isArray(list)) return list;
  one[0] = list;
  return one;
}

// --- the shared camera (plan decision 1) -------------------------------------------------------------------------------------
export const ZOOM_CAP = 1.6;     // at most 1.6x the solo view's width and height
export const FRAME_MARGIN = 3.5; // tiles kept around the outermost players

/**
 * Where the shared camera looks and how far it zooms out. `pts` = [{x, y}] of the players it frames (live, not ghosts), `halfW`,
 * `halfH` = the solo view's half size in world units, `leader` = index into pts of the leader (the one nearest the exit, or in
 * the hub the last one who moved). Returns {x, y, zoom, capped}: zoom >= 1 is the factor the view grows by; past ZOOM_CAP the
 * camera follows the leader at the cap (`capped`), the others may be off screen until they catch up.
 */
export function cameraFrame(pts, halfW, halfH, leader = 0, cap = ZOOM_CAP, margin = FRAME_MARGIN) {
  if (!pts.length) return { x: 0, y: 0, zoom: 1, capped: false };
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, zoom: 1, capped: false };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const needW = (x1 - x0) / 2 + margin, needH = (y1 - y0) / 2 + margin;
  const zoom = Math.max(1, needW / halfW, needH / halfH);
  if (zoom <= cap) return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom, capped: false };
  // past the cap: the leader stays framed; the camera leans toward the others as far as the capped view still holds the leader
  const L = pts[Math.max(0, Math.min(pts.length - 1, leader))];
  const hw = halfW * cap - margin, hh = halfH * cap - margin;
  const cx = Math.max(L.x - hw, Math.min(L.x + hw, (x0 + x1) / 2));
  const cy = Math.max(L.y - hh, Math.min(L.y + hh, (y0 + y1) / 2));
  return { x: cx, y: cy, zoom: cap, capped: true };
}

/** The leader: the player nearest the exit (squared straight-line distance), or `fallback` when there is no exit. */
export function leaderIndex(pts, exitX, exitY, fallback = 0) {
  if (!(exitX >= 0) || !pts.length) return Math.max(0, Math.min(pts.length - 1, fallback));
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) { const d = (pts[i].x - exitX) ** 2 + (pts[i].y - exitY) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

// --- the exit pull (plan decision 8) ---------------------------------------------------------------------------------------
export const PULL_S = 3;
/** Where a pulled octopus is after `t` of the PULL_S pull from (x0, y0) toward (tx, ty): an ease-in current, there at the end. */
export function pullPos(x0, y0, tx, ty, t, out = { x: 0, y: 0 }) {
  const u = Math.max(0, Math.min(1, t / PULL_S)), k = u * u * (3 - 2 * u);
  out.x = x0 + (tx - x0) * k; out.y = y0 + (ty - y0) * k;
  return out;
}
