// M1's fixed test cave: 32x48 tiles, 1-tile unbreakable border ring, a few
// pillars, a 2-wide corridor guaranteed open top to bottom. OVERNIGHT.md §2
// "World" / M1-3 ("a fixed 32x48 test cave in world.js").
//
// Deviation (logged in NIGHT-LOG.md): the full infinite generator (2-tile
// borders, seeded noise, BFS-verified connectivity) is M2 work; this is a
// small hand-built layout just for swim/collision/camera testing.

export const WORLD_W = 32;
export const WORLD_H = 48;

export function createTestCave() {
  const tiles = new Uint8Array(WORLD_W * WORLD_H); // 0 = water, 1 = rock

  function set(x, y, v) {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return;
    tiles[y * WORLD_W + x] = v;
  }
  function get(x, y) {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return 1; // outside = solid
    return tiles[y * WORLD_W + x];
  }

  // 1-tile unbreakable border ring.
  for (let x = 0; x < WORLD_W; x++) { set(x, 0, 1); set(x, WORLD_H - 1, 1); }
  for (let y = 0; y < WORLD_H; y++) { set(0, y, 1); set(WORLD_W - 1, y, 1); }

  // A handful of pillars, kept clear of the central 2-wide corridor
  // (columns 14-17) so the cave is always traversable top to bottom.
  const pillars = [
    { x: 4, y: 8, w: 3, h: 3 },
    { x: 22, y: 10, w: 4, h: 2 },
    { x: 6, y: 20, w: 2, h: 4 },
    { x: 20, y: 24, w: 3, h: 3 },
    { x: 9, y: 30, w: 4, h: 2 },
    { x: 23, y: 34, w: 3, h: 4 },
    { x: 5, y: 40, w: 3, h: 2 },
  ];
  for (const p of pillars) {
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        if (x >= 13 && x <= 18) continue; // keep the corridor clear
        set(x, y, 1);
      }
    }
  }

  const startX = WORLD_W / 2;
  const startY = 4;

  return {
    width: WORLD_W,
    height: WORLD_H,
    tiles,
    isSolid(tx, ty) { return get(tx, ty) === 1; },
    startX, startY,
  };
}
