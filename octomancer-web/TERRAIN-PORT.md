# Terrain port: SmartRooms rooms + pattern spawner for the web game

Owner: Beaver (tech lead). Status: plan, not yet started. Date: 2026-09-30.
Decision (Daniel, via coordinator): the web generator becomes a JavaScript port of Daniel's own **SmartRooms**
package, data-oriented (flat typed arrays, no per-tile objects, pure functions of `(seed, chunkIndex)`).
The Octomancer Unity pipeline is kept below as background, because its room PNGs and pattern kernels are
the best starting data for the Octomancer look.

Sources (read-only):
- SmartRooms: `D:\Projects\SmartRooms` (commit 7f11130), clone in the session scratchpad `refs/SmartRooms`.
  Paths below are relative to `Assets/Plugins/SmartRooms/Scripts/` unless they start with `Assets/` or `Settings/`.
- Octomancer: `octomancer-unity/Assets/...` (submodule).
- Web game: `site/octomancer/play/js/{gen,world,decor,outline}.js`.

## 0. Background: what the Octomancer Unity game actually does

Correction to the brief: in the shipped Octomancer, **terrain is not made from noise**. Noise only gates
foliage and enemy density.
- `Scripts/Map/ProceduralMapBuilder.cs` builds every procedural level from **hand-painted room bitmaps**:
  `ScriptableObjects/Map/Variables/RoomsHolder.asset` lists 18 PNGs in `Sprites/Tilemap/WorldGen/Rooms/`
  (`0..15.png`, `Building.png`, `Pool.png`), each **10x16 px, 1 px = 1 tile**, colours black = rock, white = water,
  pure green = portal marker (`FindPortal`, :586-613). The level is a **3x3 grid of rooms = 30x48 tiles**
  (`MakeOutputTexture`, :227-249).
- Room variants: every room gets 4 variants (none, H flip, V flip, HV) unconditionally (`RotateRooms`, :273-292).
  Rooms connect on a side if at least one pair of facing edge pixels is empty in both (`TilesConnect`, :342-388).
- Path: start room at random column, row y=0; walk Right/Top/Left only (`Directions`, :515-531), picking a random
  room that has some connecting neighbour on the side it came from (`GetPossibleTiles`, :495-513). Stops when stuck
  in row y=2. Last placed room = end room; empty cells get a random room (`BuildLevel`, :420-483). Unity y is up,
  so the path climbs in texture space; our game descends, so we mirror (SmartRooms calls this `TopToBottom`).
- Validation: 4-neighbour search over the 30x48 texture from start portal to end portal, air = max channel > 0.2,
  capped at 5000 iterations; on failure the whole level regenerates (`CreateMap`, :36-50; `RunAStar`, :77-110).
- Tiles: max channel <= 0.2 becomes `SquidTile`; a 1-tile padding ring becomes `SquidTileUnbreak`
  (`TilemapLevelBuilder.cs` `BuildTilemap`, :93-117; `Padding: 1` in `Scenes/MainGame.unity`). **Every interior rock
  tile is breakable** by its `destroyDamage` types (`Scripts/Map/TileLogic.cs`, `OnDamageTaken`); there are no
  separate soft-rock pockets.
- Portals: start and finish portals sit at the green-marker centroid of the start and end rooms (`MakeStartTile`/
  `MakeEndTile`, :180-225). `Building.png` (shop) and `Pool.png` are also rooms and also have green markers.
- The compute stack `ScriptableObjects/Map/Shaders/ComputePipelines/Map/CSPTilemapStack.asset` is
  BlackPadding -> UpscaleTilemap -> Rounding (`radius: 15`) -> Outline: it **renders** the tilemap look. It does not generate terrain.
  Our traced outline (`outline.js`) is the equivalent and stays.

Octomancer pattern spawner (`Scripts/Map/FoliageGeneration/PatternGenerator.cs`; `EnemyGenerator.cs` subclasses it):
kernel = small PNG; per pixel alpha < 0.5 = don't care, max channel < 0.5 = rock, else water (:254-264); off-map
reads as rock (:266-277). The kernel's bottom-left sits on the scanned cell; the spawn goes to the kernel centre +
`PositionOffset` + random offset (:176-190). Flips: H/V flippable patterns scan once per allowed mirror (:75-112).
Density: per item a Perlin texture (`ScriptableObjects/PerlinNoise/PerlinFG.asset`: octaves 1, lacunarity 1.63,
gain 0.341, value -0.11, amplitude 3.36, frequency 2.18, power 2, random offset) must be `>= SpawnChance` at the
cell (:279-287), and the count is capped by `MaxSpawned * CustomDensityOverride` (:135). Scene values
(`MainGame.unity`): enemy generator DynamicDensity 0, override 1, `SafeDistanceStart 7`, `SafeDistanceExit 4`;
foliage generator DynamicDensity 1, so override = (30/10 + 48/16)/2 = 3 (:52-57); background generator override 16.

Kernels (`Sprites/MatchingPatterns/`, top row first, `#` rock, `.` water, `_` any) and what uses them:

| Kernel | Shape | Flips | Items (MaxSpawned, SpawnChance) |
|---|---|---|---|
| Pattern02 1x3 | `.` `.` `#` (floor, 2 water above) | H | Plant12/13/26 (5, 0.7), Greenranha (5, 0.65) |
| Pattern01 1x3 | `#` `.` `_` (rock above one water) | H / V | Plant5/8/9/24 (5, 0.4), Plant1 (3, 0.8), Plant2 (3, 0.7); Urchin (10, 0.6) and SpikeTrap (10, 0.6) use the V-flippable copy |
| Pattern03 3x1 | `_.#` (water beside a wall) | H | Plant25 (15, 0.9), Plant7 (5, 0.7) |
| Pattern04 2x2 | `##` / `..` (ceiling 2 wide) | H | Critter1/2/4/7 (5, 0.65) |
| Pattern05 2x2 | `.#` / `.#` (wall 2 tall) | H | Critter6 (5, 0.65) |
| PatternCannon 3x3 | `_#_` / `#..` / `_._` (inner corner) | H+V / H | Cannon, CannonAngle (5, 0.9); Slapper (5, 0.9, rot 22.72) |
| WideVertical 2x3 | `##` / `..` / `..` | none | ElectroRock (4, 0.6) |
| LongHorizontal 10x1 | `#.........` | H | Piranha (10, 0.6) |
| PoolPattern 8x4 | walled basin | none | LavaPool (99) |
| Wall 1x1 | `#` | none | WallGold, WallGoldPile, WallBombBag |

Excluded from the port: coins and pearls (Gold, GoldPile, WallGold, WallGoldPile, Pearl*), per Daniel.
Background layer (`FoliageGeneration/BackgroundGenerator.cs`): no kernel; `PerlinBG` values sorted high to low,
take the top `MaxSpawned * 16` per item (:73-107). Runes, holes and eyes; several were already removed from the web build by Daniel's reviews.

## 1. How SmartRooms works

**Rooms are painted tilemaps, frozen to arrays.** A room prefab has `Structure` (Grid + Tilemap) + `SmartRoom`.
In the editor, `Structure.SaveCurrentLayout` (Palette/Structure.cs:235-253) snapshots the tilemap inside
`GetStructureBounds` (:258-265) into `TileBase[] _layout`, **row-major, bottom row first**, size from a
`Vector2IntVariable` asset (`Settings/RoomSize[16,9].asset` = 16x9 for the demo). Null = air. `SmartRoom` adds
`_entrancePosition` (the start/exit marker cell). Per structure: `_horizontallyFlippable` (default true),
`_verticallyFlippable`, `_substructuresChance` (default 50), `_weight` (default 1), child substructures.
In the prefab YAML this is literal: `_layout:` is a list of `{fileID: 0}` (air) or a tile-asset GUID.

**Level style** (Levels/LevelStyle.cs:28-39; demo `Settings/LevelStyle.asset`): `LevelTileSize` 4x4 rooms,
`BuildModeDirection` 0 = TopToBottom, lists `Rooms` (4), `StartRooms` (3), `EndRooms` (3), `SpecialRooms`
(3 configs: two in group "shop", one "bigger", `mandatory 0`, `spawnChance 100`), and `SpawnableObjectPatterns`.

**Generation** (Generator/SmartLevelGenerator.cs), up to `_maxAttempts = 10` (:51) of `GenerateLoop` (:319-364):
1. `FlipRooms` / `FlipStructureData` (:1132-1234): expand each room into its allowed mirror variants; the layout is
   physically mirrored (Utils/StructureUtils.cs) and the entrance mirrored with it.
2. `GenerateFreeTilesSide` (Generator/Tiles/GenTile.cs:34-90): one bitmask per side, bit i = edge cell i is air.
   Quirk: the loops run to `size - 1`, so the last cell of each edge is never counted.
3. `ConnectTiles` (:1009-1049): for every tile and side, the list of tiles whose opposite mask ANDs non-zero
   (`TilesConnect`, :1091-1100). A room never neighbours its own layout unless `_sameRoomTileNeighbor` (:44).
4. `BuildMainPath` (:539-626): start cell = random column on the top row (`GetStartTilePosition`, ~:464); from a
   start-room tile, repeatedly pick a random tile from `prevTile.roomTiles[lastDir]` that can continue into a free
   grid side (`GetPossibleTiles`, :843-867); allowed moves for TopToBottom are Right, Down, Left (:955-965). In the
   bottom row it stops on a dead end or a `_randomStopChance = 25`% roll (:45); a dead end elsewhere fails the
   attempt. `GenerateExit` (:628-654) puts an end room, compatible with the entry side, in the cell the walk would enter next.
5. `SpawnSpecialRooms` (:743-815): shuffled cells; a special room goes into a free neighbour cell it connects to,
   one per id; mandatory ones take priority and their failure restarts the attempt; optional child room.
6. `FillEmptyTilesWithRandom` (:726-741): uniform random room in every empty cell (no connection check).
7. `WriteGenTileToLayout` + `SpawnSubstructure` (:656-724): stamp rooms, then with `substructuresChance`% stamp
   one weighted-random substructure over the room at its offset (mirrored with the room).
8. `TryToCompleteLevel` (:1236-1365): 4-neighbour search from start entrance to end entrance over air (null
   `TileBase`), 5000-iteration cap. Any non-null tile counts as solid here, including Quantum tiles.

**QuantumTile** (Palette/QuantumTile.cs:29-44): a tile that instantiates its GameObject with probability
`_firstGameObjectChance`, else `_secondGameObject` (null in the demo, i.e. no block). Demo: `QuantumGoldAndGreenTile` 50%,
`QuantumEyeTile` 25%. So a Quantum cell is "maybe rock", rolled at spawn time, and the path check treats it as rock.
**SmartTile** (Palette/SmartTile.cs): a tile whose GameObject is the real block; sprite hidden at runtime.
**TileStyleLogic** (Tiles/TileStyleLogic.cs:153-224): each block enables its top/bottom/left/right border sprite
where the neighbour is empty or has a different style GUID, and right/bottom/corner shadows. Not ported: our traced
outline already does this job. **BorderGenerator** (Generator/BorderGenerator.cs:38-142): 1-row floor and
ceiling (`_floorAndCeilingThickness = 1`), a 1-tile ring of `SurroundingTile`, and 20-unit sprite panels. Ours: the
`BORDER` columns. **BackgroundGenerator** (Generator/BackgroundGenerator.cs): one stretched sprite. Not ported.

**Pattern spawner** (Generator/SpawnableObjectPatternGenerator.cs + Patterns/*):
- `SpawningPattern` (Patterns/SpawningPattern.cs): a list of `(dx, dy)` offsets from the anchor cell, each with a
  state `Tile = 1` (rock) or `Air = 2` (water); anything else = don't care (:20-25, generator :400-408). The anchor
  itself is only checked if `(0,0)` is listed. `RuleTransform`: Fixed, MirrorX, MirrorY, MirrorXY (:142-164).
- Map snapshot: rock = cell has an instantiated GameObject (`CacheMap`, :135-146), so a Quantum roll that produced
  nothing counts as water here. Off-map = rock (:410-418).
- Scan: every cell, once per allowed mirror, offsets negated per mirrored axis (:196-239, :364-398);
  `ObjectPattern.UniquePositions` (default true) dedups by position.
- Per `SpawnableObject` (Patterns/SpawnableObject.cs:14-28: offset, random X/Y range, rotation, FlipOnX/Y,
  `SpawnChance` %, `MaxSpawned`, `DontSpawnOnEdge`, `FailChance` %): in shuffled order, visit shuffled matches;
  spawn if a Perlin texture sample at a random per-object offset is `< SpawnChance/100` (:420-432) and the count
  is under `MaxSpawned * density` (:241-266); then a `FailChance` roll (:275-279).
- Quirk, line 264: every visited location is removed whether or not it spawned, so as written only the first
  object in the shuffled list of a pattern gets locations. Octomancer's version never removes, so items can stack.
  Port rule (recommended): remove a location only when something spawns on it, plus a per-chunk occupancy mask.
- Demo patterns (`Settings/Patterns/`): Ground `(0,0)=Air,(0,-1)=Tile` Fixed; Ceiling `(0,0)=Air,(0,1)=Tile`;
  Wall `(1,0)=Tile,(0,0)=Air` MirrorX; Corner `(1,0)=Tile,(0,1)=Tile,(0,0)=Air` MirrorXY, UniquePositions 0.
  Demo plants: SpawnChance 58, MaxSpawned 500, FailChance 45, offset y +-0.5, random x +-0.3.
- Determinism: `Unity.Mathematics.Random` seeded from `_seed` (:183-189); the spawner has its own stream.

Why SmartRooms over Octomancer's builder: same room-bitmap idea, but the path uses real per-side connection
lists (`prevTile.roomTiles[lastDir]`) where Octomancer only checks that some compatible room exists; it also has
start/end/special rooms, substructures, Quantum tiles and a cleaner pattern data model.

## 2. Diff: our current generator vs SmartRooms

| Topic | Ours now | SmartRooms / Octomancer |
|---|---|---|
| Shape source | random fill 0.45 + 2 CA passes + carved 2-3 wide path (`gen.js` `generateChunk`, `smooth`, `carvePath`) | authored room templates on a grid |
| Unit | chunk 32x24, BORDER 2 | room 10x16 (Octomancer) / 16x9 (demo); level 3x3 or 4x4 rooms |
| Purity | chunk k needs chunk k-1's `exitCol` (`createGenerator` is sequential) | whole level per seed |
| Descent guarantee | carved path + `isTopToBottomConnected` | path through connecting rooms + search, retry |
| Soft rock | sealed pockets >= 4 cells become tile 2 | Octomancer: all interior rock breakable; SmartRooms: none |
| Enemies | random open cells tagged floor/ceiling/wall/open, >= depth 40, 5-11 per chunk | kernel patterns, safe radius 7 (start) / 4 (exit) |
| Decor | `decor.js` hash-picked anchors (`findPlantAnchors`, `findWallCritters`, `findVents`) | kernel patterns + Perlin density + caps |
| Start | `carveStartPool` punches a pool into chunk 0 (`world.js` :144) | start room with entrance marker |

## 3. Mapping onto endless vertical streaming

- **One chunk = one room row.** `ROOM_W = 10`, `ROOM_H = 16` (Octomancer's own room size, so its 18 PNGs import
  unchanged), `ROOMS_X = 3`. `CHUNK_H = 16`; `CHUNK_W = 3*10 + 2*BORDER`, which is 34 with BORDER 2. Keeping 32 needs
  BORDER 1, which is the Unity value (`Padding: 1`). Decide by the camera test in step 1; the rest of this plan does not depend on it.
- **Pure door contract instead of a sequential `entryCol`.** For every boundary b (between rows b and b+1),
  `door(seed, b) = { room: hash % 3, span: 2 cells }` from `hashSeed(seed, b)`. Row k's entry = `door(k-1)`
  (row 0: the start room), exit = `door(k)`. Row k is then a pure function of `(seed, k)` and depends on no other chunk.
- **Row path (Spelunky within one row):** walk from the entry room toward the exit room (Left/Right moves only,
  then Down). Each path room gets a required-sides mask (U from entry, D at exit, L/R along the walk). Candidates:
  template variants whose side masks contain the door span and AND non-zero with the neighbours already chosen
  in the row (SmartRooms `TilesConnect`). Off-path rooms: random like `FillEmptyTilesWithRandom`, but only from
  variants that AND non-zero with at least one neighbour, so we get fewer sealed rooms.
- **Guarantee:** after stamping, force the door span open on the top row (entry) and bottom row (exit) of the
  row, then BFS from the entry door to the exit door (512-cell grid). On failure, re-roll with a salted sub-seed up
  to 10 times (the `_maxAttempts` value). Last resort: the existing `carvePath` corridor, so a chunk can never be blocked.
- **Budget:** plan about 3 rooms x ~100 variants, stamp 544 cells, Quantum roll, BFS 544, pattern scan
  544 cells x ~15 patterns x <= 4 mirrors as bit tests. Expected well under 1 ms. Hard gate: p95 < 5 ms in test.

## 4. Data layout (JS)

All built once at load from `rooms.json` / `patterns.json`, then read-only. No classes, no per-tile objects.

```
// Room bank (V = number of variants after flips)
ROOM_W=10, ROOM_H=16, RC=160
bank.cells   Uint8Array(V*RC)  // y-down, row-major. 0 water,1 rock,2 soft,3 quantum,4 portal,5 start
bank.qChance Uint8Array(V*RC)  // 0-100, only where cells==3 (per-template Quantum chance)
bank.maskU/D Uint16Array(V)    // bit x = edge cell open (all 10 cells, fixes the size-1 quirk)
bank.maskL/R Uint16Array(V)    // bit y = edge cell open (16 bits)
bank.flags   Uint8Array(V)     // 1 start,2 end,4 special,8 hFlipped,16 vFlipped
bank.weight  Float32Array(V); bank.base Uint16Array(V)  // source template id
bank.connR   Uint8Array(V*V)   // 1 if maskR[a] & maskL[b]; same for connD (maskD[a] & maskU[b])
bank.subs    Int16Array        // [templ, offX, offY, w, h, cellStart] rows; subCells Uint8Array
// Row plan (per chunk, pure)
plan.variant Uint16Array(3); plan.sides Uint8Array(3) // bits U=1 D=2 L=4 R=8
// Chunk output (unchanged contract for outline.js / world.js / physics)
tiles Uint8Array(CHUNK_W*CHUNK_H) // 0 water, 1 rock, 2 soft
// Pattern table (P rows; kernels fit a 5x5 window, anchor at centre, bit=(dx+2)+(dy+2)*5, y-down)
pat.needRock Uint32Array(P*4); pat.needAir Uint32Array(P*4) // per mirror 0 none,1 X,2 Y,3 XY (precomputed)
pat.mirrors  Uint8Array(P)     // bitset of allowed mirrors
pat.unique   Uint8Array(P)
// Spawn table (S rows, grouped by pattern via pat.first/pat.count)
sp.kind Uint16Array  sp.layer Uint8Array (0 decor,1 enemy,2 trap,3 portal)
sp.chance Uint8Array sp.fail Uint8Array sp.maxPerChunk Uint8Array
sp.offX/offY/randX0/randX1/randY0/randY1/rot Float32Array
sp.flipX/flipY/noEdge/ignoreSafe Uint8Array
sp.airUp Uint8Array            // required water cells above anchor, derived from the kernel (Daniel's tall-plant rule)
```

Matching: per chunk build `nb[i]` (Uint32Array, 25-bit rock word of the 5x5 window; out of chunk = rock, the
SmartRooms rule), then `(nb & needRock) === needRock && (nb & needAir) === 0`. Density: a seeded value noise
`noise2(seed ^ kindSalt, x, worldY)` compared with `chance/100` (the SmartRooms comparison). It is continuous across seams because it
uses world y. `maxPerChunk` = Octomancer `MaxSpawned * override / 3` (one row of a 3-row level). An occupancy mask
`Uint8Array(CHUNK_W*CHUNK_H)` stops stacking and keeps `MIN_ENEMY_SEP`.

Daniel's rules as patterns (y-down, rows top to bottom, anchor `A` = the water cell the item stands in):
- short sprout (1 water above): `.` / `A` / `#`. Tall kelp (3 water above): `.` `.` `.` / `A` / `#`, `airUp=3`.
- ceiling vine: `#` / `A` / `.`. Wall plant (MirrorX): `A#`. Inner-corner cluster (MirrorX): `.` `.` / `A#` / `##`.
- ceiling-corner anemone (MirrorX): `##` / `A#`. Boulder / ElectroRock: WideVertical. Cannon: PatternCannon (MirrorXY).
- Urchin / SpikeTrap: Pattern01 (MirrorY). Piranha: LongHorizontal (MirrorX). Trap alcove: room-template marker (section 6).

Room JSON authoring format (one string per row, top row first, y-down):
`{"id":"stepped-1","cells":["##......##", ... 16 rows],"flip":"h","weight":1,"kind":"room|start|end|special",
"quantum":{"?":50},"subs":[...]}` with `#` rock, `.` water, `s` soft, `?` quantum, `P` portal, `S` start.

Export of the Octomancer rooms (Pillow; texture row 0 is the bottom, so iterate y from top):
```
from PIL import Image; import json, sys
def cell(p):
    r, g, b, a = [v / 255 for v in p]
    if g > .8 and r < .2 and b < .2 and a > .8: return 'P'
    return '#' if max(r, g, b) <= .2 else '.'
out = []
for n in [str(i) for i in range(16)] + ['Building', 'Pool']:
    im = Image.open(f'{sys.argv[1]}/{n}.png').convert('RGBA'); w, h = im.size
    out.append({'id': 'octo-' + n, 'cells': [''.join(cell(im.getpixel((x, y))) for x in range(w)) for y in range(h - 1, -1, -1)]})
json.dump(out, open(sys.argv[2], 'w'), indent=1)
```
(Thresholds from `ProceduralMapBuilder.cs:594` and `TilemapLevelBuilder.cs:104`.)
SmartRooms prefabs export the same way from YAML: for each document with `_layout:`, map `{fileID: 0}` to air and a GUID
to its tile-asset name through the `.meta` files, take the size from the `_size` asset's `Value`, and flip rows.
The session's `scratchpad/tools/export_rooms.py` already does this and printed all 17 demo structures. It goes
into `octomancer-web/tools/` only if we ever need them.

## 5. Port plan (small steps, each testable)

Every step keeps the `generateChunk` return shape `{tiles, spawns, exitCol, width, height}`, keeps
`outline.js` (`traceOutlineLoops`, `chaikinSmoothLoop`, `loopsToSegments`) as the only source of wall art and collision,
and keeps `world.js` `shaveChunkSeam` + `shaveNubsAndSmallIslands` (they only turn rock into water, so they can
only add connectivity). Tests live in `site/octomancer/play/tests/`. Visual steps end with the Opus screenshot review.

1. **Geometry constants.** Add `ROOM_W/ROOM_H/ROOMS_X` to `gen.js`, set `CHUNK_H = 16` and `CHUNK_W` (34, or 32 with
   BORDER 1). Nothing else changes yet. Tests: existing `gen.test.js`, `world.test.js` and `outline.test.js` still
   pass; new `world.test.js` case: the camera shows the full width at 375 px and at desktop size.
2. **Room data + importer.** `octomancer-web/tools/export_rooms.py` produces `play/data/rooms.json` from the 18
   Octomancer PNGs. New `js/rooms.js`: `loadRoomBank(json)` builds `bank.*` with flips and masks, and
   `buildConnTables(bank)`. Tests `rooms.test.js`: 18 templates of 10x16; the variant count equals the sum of allowed flips;
   `maskU` of `octo-0` = cols 2-7; the H-flip of `octo-4` equals the hand-mirrored rows; `connR` is symmetric with `connL`.
3. **Pure door contract + row plan.** `doorAt(seed, b)`, `planRow(seed, k, bank)` returning `plan.variant/sides`.
   Tests: same inputs give the same plan; `planRow(k)` entry equals `doorAt(k-1)`; every path pair has `connR`=1; the exit
   variant has the door bits in `maskD`; plan time < 0.2 ms.
4. **Stamp + Quantum + guarantee.** `stampRow(plan, bank, rng, tiles)`, `rollQuantum`, `openDoor(tiles, door, edge)`,
   `rowConnected(tiles, entry, exit)` (reuse `floodFillReachable`), retry loop, `carvePath` fallback. `generateChunk`
   drops its `entryCol` parameter; `createGenerator` stays for callers but no longer carries state. Tests:
   `isTopToBottomConnected` for 5 seeds x 2000 chunks; seam test: the bottom door of chunk k lines up with the top door of k+1
   after `shaveChunkSeam`; `generateChunk(seed,k)` equals the result of generating chunks 0..k in order; fallback rate < 1%.
5. **Soft rock.** Default: keep today's rule (tile 2 = sealed pockets >= 4 cells), plus `s` cells from templates.
   Decision for Daniel: Unity made all interior rock breakable. Tests: bombs still open every tile-2 cell; tiles in the
   BORDER columns are never 2.
6. **Start / home base / portals.** Row 0 uses `start` templates (from `S` or `P` markers, like `SmartRoom._entrancePosition`) and
   replaces `carveStartPool`. Portals and shop are `special` templates with a `P` marker, placed like
   `SpawnSpecialRooms` (one per id, `spawnChance`). Tests: the octopus spawn cell is water with a 3x3 water clearance; no enemy
   within 7 tiles of the start marker or 4 of a portal (Unity `SafeDistanceStart/Exit`).
7. **Pattern engine.** New `js/patterns.js`: `compilePatterns(json)` (mirrors precomputed),
   `buildNeighbourWords(tiles, W, H, out)`, `matchPattern(p, nb, out)`, `selectSpawns(seed, k, matches, sp, occ)`.
   Tests `patterns.test.js` on tiny hand grids: a sprout matches only with 1 water above; tall kelp needs 3; a ceiling vine
   hangs under rock; a wall plant mirrors; an inner corner matches both mirrors; an off-chunk cell counts as rock; the count is <= `maxPerChunk`;
   the result is deterministic; the scan takes < 1 ms per chunk.
8. **Enemies through patterns.** Replace the `enemy-slot` block in `generateChunk` with pattern spawns
   (layer 1/2) from the section 0 table (minus coins and pearls). Keep emitting `placement`, `wallDir`, `flatRun` and
   `nearSideWall` derived from the kernel so `enemies.js` `pickKind` keeps working. Tests: `enemies.test.js` still passes;
   no enemy in rock; per-kind counts are within the caps; the first chunk is enemy-free.
9. **Decor through patterns.** `decor.js`: `findPlantAnchors` and `findWallCritters` read the chunk's layer-0 spawns
   instead of hashing tiles; `findVents`, `findClusterMates` and `depthTint` stay. Tests: `decor.test.js` updated; no decor
   overlaps an enemy cell; the vine-only cluster rule (commit cb1827f0) still holds.
10. **Perf + soak.** Bench test: 1000 chunks x 3 seeds, p95 `generateChunk` < 5 ms, max < 12 ms, measured in the
    browser test page; a 30-minute autoplay dive at 50 Hz has no long frames from generation. Then QA (Owl) on
    desktop and mobile, and an Opus visual review against the store screenshots.

## 6. Room templates to author

The SmartRooms demo rooms (16x9 platformer rooms with ladders and platforms, `Prefabs/Rooms/*`) do not fit a
swimming descent. The 18 Octomancer PNGs do fit (10x16, stepped walls, 2-8 wide openings). Their edges (from the PNGs):
tops open in cols 2-7 (0-3), 5-9 (4-6), all (7-9); several bottoms are fully rock (0, 2; Building), so they can only be
off-path or entry-only rooms. `Pool` is open at the bottom. They are the v1 bank.

To reach the store look (wide stepped caves, square-ish rooms, ledges) and the design sheet
`reference/design/terrain-modules.png`, author about 4 variants of each (H-flippable):
- **LR corridor** (module 4), **LRD drop** (module 1 wide stepped descent, module 3 narrow shaft), **LRU landing**
  (module 2 square room with ledge), **LRUD crossroads** (module 6 floating island), **dead end + trap alcove** (module 5,
  off-path; alcove marked for Urchin/SpikeTrap), **overhang** (module 7, ceiling-vine kernel), **portal niche**
  (module 8, special, `P` marker), **start/home** (the "Welcome home" ledge in `store-base.png`).
Modules 9 (coral stub) and 10 (boulder) are pattern spawns, not rooms. The design sheets are layout references only.
Shipped art stays Daniel's and Milan's.

## 7. Open decisions (for Daniel)

1. All interior rock breakable (Unity) or keep the soft-pocket rule? (step 5)
2. What a portal does in an endless dive, and how often (special-room `spawnChance`). Not found in the Unity code for endless play.
3. CHUNK_W 34 (BORDER 2) or 32 (BORDER 1, the Unity value).
4. The SmartRooms line-264 location-consumption quirk: port it as written, or remove a location only when it spawns (recommended)?
