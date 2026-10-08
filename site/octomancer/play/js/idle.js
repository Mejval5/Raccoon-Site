// How a calm person behaves while you are around (owners round 3, quests rework): Marlo after you dug him out, Pip swimming about
// his open cage, Quill on a dig, the pool host, and anyone who comes back later in the dive with a reward (visitors.js).
// Spelunky 2 style: they stay where they are, face the octopus while it is near, look around when it is not, and jump and shout
// when a bomb goes off close by. Pure data and timers (no DOM, no Math.random): one small record per person.

import { say } from './speech.js';

export const FACE_R = 8;        // the octopus is this close: they face it
export const REACT_R = 7;       // a blast this close makes them jump and shout
const REACT_COOL = 2.5;         // s before the next shout
const LOOK_MIN = 1.8, LOOK_SPAN = 2.2; // s between glances left and right while nobody is near

/** @param {number} [seed] any number: spreads the glances of several people */
export function createIdle(seed = 0) {
  const ph = ((seed * 0.618034) % 1 + 1) % 1;
  return { face: 1, look: LOOK_MIN + ph * LOOK_SPAN, ph, hop: 0, cool: 0, reacts: 0, shout: 0 };
}

/**
 * One step: face the octopus while it is near (a little hysteresis so it does not flicker when right above), glance about otherwise,
 * and let a jump settle. (px, py) the person's centre.
 */
export function idleStep(id, px, py, octo, dt) {
  if (id.hop > 0) id.hop = Math.max(0, id.hop - dt * 2.2);
  if (id.cool > 0) id.cool = Math.max(0, id.cool - dt);
  if (id.shout > 0) id.shout = Math.max(0, id.shout - dt);
  const dx = octo.x - px, dy = octo.y - py;
  if (!octo.dead && dx * dx + dy * dy < FACE_R * FACE_R) {
    if (dx > 0.3) id.face = 1; else if (dx < -0.3) id.face = -1;
    id.look = LOOK_MIN + id.ph * LOOK_SPAN;
    return;
  }
  id.look -= dt;
  if (id.look <= 0) { id.face = -id.face; id.ph = (id.ph + 0.37) % 1; id.look = LOOK_MIN + id.ph * LOOK_SPAN; }
}

/**
 * A bomb went off at (bx, by): within REACT_R the person jumps, turns towards it and (when not already talking) shouts one of
 * `lines` into `talk`. Returns true when it reacted.
 */
export function idleReact(id, talk, lines, bx, by, px, py) {
  const dx = bx - px, dy = by - py;
  if (dx * dx + dy * dy > REACT_R * REACT_R) return false;
  id.hop = 1; id.shout = 0.6;
  if (Math.abs(dx) > 0.2) id.face = dx > 0 ? 1 : -1;
  if (id.cool > 0) return true;
  id.cool = REACT_COOL;
  if (lines && lines.length && talk && !talk.text && !talk.q.length) say(talk, [lines[id.reacts % lines.length]]);
  id.reacts++;
  return true;
}

/** The jump as a height in tiles (0 at rest): a quick hop that lands. */
export function idleLift(id) { return id.hop > 0 ? Math.sin(id.hop * Math.PI) * 0.35 : 0; }
