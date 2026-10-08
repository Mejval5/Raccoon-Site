// Terrain materials (Spelunky-style layered tiles). A level's `tiles` array holds one MATERIAL ID per cell
// (Uint8Array, row-major): 0 is water, anything else is solid, so every `tiles[i] !== 0` solid test keeps working.
//
// Draw order: each material is drawn as if it touched air on every side (inner fill + edge), lowest priority first;
// at a boundary between two materials the higher one's edge lies over the lower one (render.js paintMaterialLayers).
//   bedrock   indestructible, on top of everything (dark basalt with a cold, darker rim)
//   rock      main terrain (navy rock, mint rim)
//   masonry   the shop's stone frame
//   bone      fragile fish-bone blocks (2026-10-08): crumble from a dash, any projectile, a flung prop, a bomb or a boulder (fragile.js)
//   timber    sunken-ship wooden platforms
// Wall traps (hazards) draw before all terrain; pushable blocks are props (props.js PK_BLOCK), not tiles.
//
// Room / map ASCII: '#' rock, 'X' bedrock, 'B' fish-bone block, '=' timber, 'M' masonry, 'O' a pushable block (water cell + prop).

export const MAT_WATER = 0, MAT_ROCK = 1, MAT_BEDROCK = 2, MAT_BONE = 3, MAT_TIMBER = 4, MAT_MASONRY = 5;
export const MAT_COUNT = 6;
export const MAT_NAMES = ['water', 'rock', 'bedrock', 'bone', 'timber', 'masonry'];

/** Draw priority per material id (higher draws on top and owns the shared edge). */
export const MAT_PRIORITY = new Uint8Array([0, 4, 5, 2, 1, 3]);
/** Material ids, lowest priority first (the order render.js bakes the layers in). */
export const MAT_DRAW_ORDER = Uint8Array.from([MAT_TIMBER, MAT_BONE, MAT_MASONRY, MAT_ROCK, MAT_BEDROCK]);

/** A bomb breaks it (everything but bedrock). */
export const MAT_BOMBABLE = new Uint8Array([0, 1, 0, 1, 1, 1]);
/** A falling boulder smashes through it (wooden platforms and bone blocks). */
export const MAT_BOULDER_BREAKS = new Uint8Array([0, 0, 0, 1, 1, 0]);

/** Room ASCII character -> material id (solid chars only). */
export const MAT_CHARS = { '#': MAT_ROCK, X: MAT_BEDROCK, B: MAT_BONE, '=': MAT_TIMBER, M: MAT_MASONRY };
/** Material id -> its room ASCII character (water '.'). */
export const MAT_CHAR_OF = ['.', '#', 'X', 'B', '=', 'M'];
/** Room ASCII for a pushable block (a water cell with a block prop in it). */
export const PUSH_BLOCK_CHAR = 'O';

export function isSolidMat(m) { return m !== MAT_WATER; }

// ---- per-tile draw hook (Buried treasure owner): called by the wall bake for every solid, non-bedrock tile of a cell
// after the main-terrain layer, as fn(ctx, tx, ty, mat, px, py, s): px, py = the tile's top-left in the cell canvas,
// s = canvas px per tile. Call world.touchTile(tx, ty) after changing what a tile shows so its cell is baked again.
let tileDrawHook = null;
export function setTileDrawHook(fn) { tileDrawHook = typeof fn === 'function' ? fn : null; }
export function getTileDrawHook() { return tileDrawHook; }
