// Round-6 task 2 (NIGHT-LOG.md): "the octopus gets stuck in concave wall
// corners and only a dash frees it: fix collision so it slides along walls
// and can always swim away ... add a test that swims into many corner
// shapes and escapes without dashing."
import { STEP } from '../js/loop.js';
import { createOctopus, stepOctopus } from '../js/octopus.js';
import { OCTO_RADIUS } from '../js/config.js';

/** Builds a tiny solid-tile grid from an ASCII map ('#' solid, '.' open),
 * row 0 at the top -- lets each corner shape below be spelled out visually. */
function gridFromRows(rows) {
  const h = rows.length, w = rows[0].length;
  return {
    isSolid(tx, ty) {
      const x = Math.floor(tx), y = Math.floor(ty);
      if (x < 0 || x >= w || y < 0 || y >= h) return true; // outside the map = solid, keep the test bounded
      return rows[y][x] === '#';
    },
  };
}

export function runCornerTests(assert, approx) {
  // A handful of concave-corner shapes an octopus can get wedged into: a
  // plain right-angle inside corner, a narrower notch, a 3-tile pocket, and
  // a dead-end nub -- each with the octopus spawned already touching both
  // walls, deep in the corner, same as the stuck-in-place bug report.
  const shapes = {
    'right-angle corner': {
      rows: [
        '#####',
        '#....',
        '#....',
        '#....',
        '#....',
      ],
      start: { x: 1.35, y: 1.35 }, // just off the inner corner at (1,1)
    },
    'narrow notch (1-tile pocket)': {
      rows: [
        '#####',
        '#.###',
        '#....',
        '#....',
        '#....',
      ],
      start: { x: 1.5, y: 2.35 },
    },
    'deep pocket (3 walls)': {
      rows: [
        '#####',
        '#####',
        '##.##',
        '##.##',
        '#....',
      ],
      start: { x: 2.5, y: 2.5 },
    },
    'peninsula tip / nub': {
      // An upside-down T: a horizontal bar with a single-tile stem hanging
      // down from its middle -- the pocket beside the stem, under the bar,
      // is a concave corner from two directions at once (solid above AND
      // solid to one side).
      rows: [
        '.....',
        '.###.',
        '..#..',
        '.....',
        '.....',
      ],
      start: { x: 1.6, y: 2.35 }, // wedged left of the stem, under the bar
    },
    'zig-zag corridor bend': {
      rows: [
        '##...',
        '##.##',
        '....#',
        '.##.#',
        '.##..',
      ],
      start: { x: 2.35, y: 1.35 },
    },
  };

  for (const [name, { rows, start }] of Object.entries(shapes)) {
    const grid = gridFromRows(rows);
    const o = createOctopus(start.x, start.y);
    // A steady push toward open water/away from the corner -- roughly "down
    // and right", the general direction open water lies in every shape
    // above -- held for up to 4 simulated seconds. No dash input at all:
    // the whole point is that ordinary swim thrust alone must be enough.
    const input = { move: { x: 0.8, y: 0.8 }, dash: { pressed: false } };
    let escaped = false;
    let minDistFromStart = 0;
    for (let i = 0; i < Math.round(4 / STEP); i++) {
      stepOctopus(o, input, STEP, grid);
      const movedDist = Math.hypot(o.x - start.x, o.y - start.y);
      if (movedDist > minDistFromStart) minDistFromStart = movedDist;
      // "Escaped" = moved at least 1.5 tiles from the wedge point, well past
      // where it started, while never ending up with its centre inside a
      // solid tile (no tunnelling through the corner to get there).
      if (movedDist > 1.5 && !grid.isSolid(o.x, o.y)) { escaped = true; break; }
    }
    assert(`corner escape (${name}): swims >=1.5 tiles away within 4s, no dash (best ${minDistFromStart.toFixed(2)})`, escaped);
    assert(`corner escape (${name}): never ends up with its centre inside solid rock`, !grid.isSolid(o.x, o.y));
  }

  // Regression check: a single flat wall (no second contact) still only
  // cancels the velocity component INTO the wall and keeps the tangential
  // (along-the-wall) component -- the combined-normal rewrite in physics.js
  // must not have broken the plain one-wall slide the octopus already had.
  {
    const grid = { isSolid: (tx, ty) => Math.floor(ty) === 5 }; // a flat floor at y=5..6
    const o = createOctopus(5, 4.7);
    o.vx = 3; o.vy = 2; // moving right and down, into the floor
    const before = { vx: o.vx, vy: o.vy };
    stepOctopus(o, { move: { x: 0, y: 0 }, dash: { pressed: false } }, STEP, grid);
    assert('single flat wall: tangential (x) velocity is not zeroed by a floor contact', Math.abs(o.vx) > 0.1);
    assert('single flat wall: normal (y, downward) velocity is stopped', o.vy <= 0.01);
  }
}
