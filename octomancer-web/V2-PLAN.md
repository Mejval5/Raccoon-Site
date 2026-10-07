# Octomancer web v2: design and implementation plan

Owner: Kitty (PM). Status: **draft for Daniel. Nothing is built until Daniel has read it and Fox has validated it.**
Date: 2026-09-30. Inputs: Daniel's direction of 2026-09-30, `TERRAIN-PORT.md` (Beaver), `ARCHITECTURE.md`, the
current code in `site/octomancer/play/js/` (called `play/js/` below). Unity and SmartRooms are read-only references.

## Overview (read this if nothing else)

- **The game becomes a run of 12 levels**, "underwater Spelunky". Each level is a 3x4 grid of rooms (34x68 tiles).
  You arrive at the top, find the exit portal at the bottom, and swim through it to the next, deeper level.
  Every 3 levels is a **depth band** (Shallows, Kelp Caves, Vent Reefs, Abyss) with its own enemy mix, difficulty and tint.
- **Levels come from a JavaScript port of SmartRooms**: flat typed arrays, a room bank built from the 18 Octomancer
  room bitmaps plus a few new special rooms, a Spelunky-style main path, and a pattern table that places
  enemies and foliage by your rules (plants on air/wall edges, tall plants need more air, corner items).
- **Special rooms** (vault, nest, critter den, rest pool, portal niche) sit off the main path.
  **Portals** (the green cells) teleport you to a sealed treasure pocket elsewhere in the same level, and back.
  **Soft quests**: one optional objective per level with a small reward.
- **Combat goes Vampire Survivors**: the octopus attacks automatically. You start with Ink Jet; enemies drop plankton
  (XP); each level-up pauses and offers 1 of 3 cards. 5 weapons (5 levels each) and 7 passives (3 levels each),
  all drawn in code or from art we already ship (ink, bubbles, hearts). Dash and bombs stay.
- **Kept as is**: the Start Game zoom from the title screen, traced outline walls and rim-matched collision, 50 Hz
  physics and swim tuning, mouse, keyboard and touch, audio. All interior rock is bomb-breakable, with a 2-tile
  unbreakable border.
- **7 milestones**, each playable and deployable. M1 to M3 ship behind `?v2=1`; v2 becomes the default at the end
  of M4, once level-ups are in and it is more fun than the endless mode. Rough size: 5-7 weeks of dev-agent work
  after the CEO cuts (section 8).
- **9 questions for Daniel** at the end, each with a default, so work can start before he answers.

## 1. Core loop and run structure

**A run** = 12 levels in 4 bands of 3. Target: 90-150 s per level, so a full run takes 20-30 min and a
first death comes at about 5-10 min.

| Band | Levels | Name | New enemies | Beholder timer | Tint (`decor.js` `depthTint`, keyed by band) |
|---|---|---|---|---|---|
| 1 | 1-3 | Sunlit Shallows | urchin, piranha, crab | 120 s | today's shallow tint |
| 2 | 4-6 | Kelp Caves | + horns, mine, cannon | 100 s | greener, darker |
| 3 | 7-9 | Vent Reefs | + manta; more cannons | 90 s | warm, dim |
| 4 | 10-12 | The Abyss | all, 10% elites | 60 s | darkest |

**Inside a level:** arrive through the entry portal in the start room (top row). Explore, fight and collect; do the
level's quest if you want to. The Beholder appears at the start room when the band's timer runs out, like Spelunky's
ghost, and chases in a straight line (today's code). Swim into the exit portal in the end room (bottom row), then a
0.8 s swim-down fade. The next level is generated during the fade.

**What carries between levels:** hearts (current and max), weapons and passives with their levels, XP and player
level, bombs, shells and score. Nothing heals by itself between levels. Rest pools and rewards do.

**Death:** the existing 1 s ink burst, then a run summary (level reached, score, build, quests done, seed) with
**Restart** (new seed) and **Exit**. No continues.

**Winning:** swimming out of level 12 shows a "you reached the bottom" summary with the same buttons.

**Score** (`score.js`): 250 per level exited, 100 per quest, 5 per kill, 50 per shell kept at the end. Kept light.

**Meta progression:** stats only. The save (`save.js`, key bumped to `octomancer.save.v2`) stores best score,
deepest level, runs, runs won and quests done. No codex, no permanent power-ups (question Q3).

## 2. Level generation

### 2.1 Geometry (derived for whole levels)

- `ROOM_W = 10`, `ROOM_H = 16`: the Octomancer room size, so its 18 PNGs import unchanged.
- `ROOMS_X = 3`, `ROOMS_Y = 4`, `BORDER = 2` on all four sides.
- **`LEVEL_W = 3*10 + 2*2 = 34`**, `LEVEL_H = 4*16 + 2*2 = 68`. This keeps Daniel's 34 width.
  - 4 rows instead of Unity's 3 gives a real descent: about 3 screens tall on a phone, 2.5 on desktop.
  - 3 columns keeps the level at 1.5-3 screen widths.
- Border: `isBedrock(x, y) = x < 2 || x >= 32 || y < 2 || y >= 66`. Bombs never break it. Every other rock tile is breakable (Unity rule).
- Tile codes: `0` water, `1` rock. The soft-rock code `2` goes away (it has no tint since round 17), and bombs call
  `isBedrock` instead.

### 2.2 Data layout (no classes, no per-tile objects)

Built once at load from `play/data/rooms.json` and `play/data/patterns.json`, read-only after that. Per level:

```
bank.cells Uint8Array(V*160)  // y-down; 0 water,1 rock,2 quantum,3 marker; V = variants after flips
bank.marker Uint8Array(V)     // marker kind: 0 none, S start, E exit, P portal, C chest, N nest, K cage, H pool, Q treasure pocket
bank.markerXY Uint8Array(V*2)
bank.maskU/maskD Uint16Array(V), bank.maskL/maskR Uint16Array(V)  // all edge cells counted (fixes the size-1 quirk)
bank.kind Uint8Array(V)       // 0 normal,1 start,2 end,3+ special id;  bank.weight Float32Array(V)
bank.connR/connD Uint8Array(V*V)
level.tiles Uint8Array(34*68)       // the only terrain array; outline.js / physics / render read it as today
level.roomVar Uint16Array(12), level.roomRole Uint8Array(12)   // path, filler, start, end, special id
level.marks Int16Array(3*16)        // x, y, kind for every marker in the level
level.nb Uint32Array(34*68)         // 5x5 rock word per cell for pattern matching
level.occ Uint8Array(34*68)         // occupancy: one spawn per cell, plus the enemy separation radius
level.spawnX/spawnY Float32Array(256), level.spawnKind Uint16Array(256), level.spawnLayer Uint8Array(256), level.nSpawns
```

Pattern and spawn tables use the `pat.*` / `sp.*` layout from `TERRAIN-PORT.md` section 4. The only change: `maxPerChunk`
becomes `maxPerLevel`, and a `bandMask` byte is added.

### 2.3 Generator (`play/js/level.js`, a pure function of `(runSeed, levelIndex)`)

`generateLevel(seed, levelIndex, bank, tables)`:

1. **Plan.** Seed = `hashSeed(runSeed, levelIndex)`. The start cell is a random column in row 0.
   `BuildMainPath` works as in SmartRooms (TopToBottom: Right, Down, Left; next room picked from
   `connR`/`connD` with the previous room), ending in row 3 with a 25% stop roll or at a dead end. The end room is
   compatible with the entry side. A dead end above row 3 fails the attempt.
2. **Specials.** Place the level's quest room first as a **mandatory** special. It goes in a free cell that
   neighbours the path and connects to it (`SpawnSpecialRooms`); if that fails, the attempt restarts. Then up to 1
   optional special from the band's table. Max 2 specials per level.
3. **Fill.** Empty cells get a random variant that connects to at least one neighbour (fewer sealed rooms than
   `FillEmptyTilesWithRandom`).
4. **Stamp** rooms into `level.tiles`, roll Quantum cells, and write the border. Then run `shaveNubsAndSmallIslands`
   (kept; it only turns rock into water).
5. **Guarantee** (all on the 34x68 grid, 4-neighbour BFS):
   - **Swim path.** The exit marker can be reached from the start marker **without bombs**. The search uses
     "fat water": a water cell counts only if it belongs to some 2x2 all-water block, so the smoothed outline can
     never pinch the path shut.
   - **Specials.** Every special room's marker can be reached from the path. Vault plugs (`v` cells) count as water,
     because the player always holds at least 1 bomb or can find one (below).
   - **Start.** The start marker has 3x3 water clearance.
   - **Retries.** Up to 10 salted re-rolls. The last resort is the existing 2-wide `carvePath` corridor from start to
     exit, so a level can never be unsolvable. Target: fallback rate < 1%.
6. **Spawns** (the pattern engine, section 4 and M7):
   - build `nb`, then match every pattern with bit tests
   - per spawn row, in shuffled order: Perlin density test, cap, then fail roll
   - **Quirk fixed:** a location is consumed only when something spawns on it, and `occ` blocks stacking.
   - safe radius 7 tiles from start, 4 from exit and portals (Unity `SafeDistanceStart/Exit`)
7. **Bomb floor:** if the level has a vault and the bomb pattern placed no bomb bag on the path side of the plug,
   add one bomb pickup in a path room.

**Budget:** `generateLevel` p95 < 8 ms on desktop (so about 30 ms on a phone), measured over 1000 levels x 3 seeds.
It runs during the 0.8 s transition, together with the outline trace and the wall-cache build for the bands in
and next to the first camera view. The transition budget on a phone is the whole 0.8 s, so the accept test is
"no frame over 50 ms during the fade at 375x812", not the generator alone. Today's `world.js` retraces a whole
32x24 chunk after a bomb; on a 34x68 level the retrace must be limited to the affected band, not the level.

### 2.4 Room bank

- **v1 bank:** the 18 Octomancer rooms (`octo-0..15`, `Building`, `Pool`) in all flip variants. Rooms with a solid
  bottom (0, 2, Building) can only be filler or entry-only rooms.
  - The exporter is Beaver's snippet in `TERRAIN-PORT.md` §4, saved as `octomancer-web/tools/export_rooms.py`.
  - The output is JSON strings. No Unity file goes under `site/`, and `rooms.json` gets an `ASSETS.md` row, because
    the bitmaps are Daniel's level art under `Sprites/Tilemap/**`.
- **New templates**, authored as JSON strings, H-flippable, about 4 of each, following
  `reference/design/terrain-modules.png`: LR corridor, LRD drop, LRU landing, crossroads, overhang, dead end.
- **Special templates** (new, one marker each):

| Special | Marker | Base | What is inside | Quest link |
|---|---|---|---|---|
| Vault | `C` + `v` plug | sealed room, 2-tile plug | chest (pick 1 of 3 items) | "Crack the vault" |
| Nest | `N` | open cave | nest core with 10 hp per band level; spawns 2 enemies every 4 s until destroyed; drops chest | "Clear the nest" |
| Critter den | `K` | pocket behind cracked rock | caged critter (existing fish, jelly or snail art); touch to free; it follows you to the exit | "Rescue the critter" |
| Rest pool | `H` | `Pool.png` | heal 1 heart, once | none |
| Portal niche | `P` | green-marker rooms | bonus portal (2.5) | none |
| Treasure pocket | `Q` | sealed 1-room pocket | the far end of a bonus portal: chest + return portal; placed only when the level has a portal niche | none |

Cut by the CEO review (section 8): the **Trader** (`Building.png`, shell economy). `Building.png` stays in the
bank as a normal room. Shells stay as rare pickups worth score.

Optional-special odds per level (in the band table): portal 40%, rest pool 35%, vault 25% (when the
vault is not the quest room).

### 2.5 Portals

- **Entry and exit portals** are the start and end rooms' green markers (Unity `MakeStartTile`/`MakeEndTile`). The exit is the only way down.
- **Bonus portal** (portal-niche room, and the reward for some quests):
  - It teleports you to the level's **treasure pocket**: a sealed one-room special elsewhere in the same level
    (no water path in or out; bombs can still crack it, which is fine). Inside: a chest and a return portal.
  - The return portal puts you back at the bonus portal, which then closes.
  - Nothing leaves memory, no second level, and the Beholder timer keeps running (that is the price of the detour).
  - Only one portal pair per level. The "Beat the Beholder" reward opens a portal next to the exit to the same pocket
    if the level has one, otherwise it drops a chest.
  - The separate bonus grotto (own level, challenge wave) is deferred: same player value, about a milestone of
    work and a level-swap in memory on phones. See Q2.
- Art: the portal is drawn in code (bubble swirl plus glow), unless Milan's `Sprites/Portal` frames are
  confirmed in `ASSETS.md` (Magpie checks in M2).

### 2.6 Quests

- **Per level**, the generator picks 1 quest from the band's pool and makes its room mandatory. The quest is optional
  for the player, and the HUD shows it as one line.

  | Quest | Placement | Done when | Reward |
  |---|---|---|---|
  | Rescue the critter | critter den | the freed critter reaches the exit with you | chest |
  | Clear the nest | nest | nest core destroyed | chest + 10 XP |
  | Crack the vault | vault | vault chest opened | (the chest itself) + 1 heart |
  | Untouched | none | exit reached with no damage taken in the level | heal 1 + 2 bombs |
  | Beat the Beholder | none | exit reached before the Beholder appears | bonus portal opens next to the exit |

- **Per run** quests are cut (CEO review, section 8): a second bookkeeping layer for one +1 heart. Can return later as data.
- **The freed critter follows the octopus's recorded trail** (a ring buffer of recent positions, about 1.5 s back),
  with no pathfinding. It cannot get stuck where the octopus was not. It takes no damage from enemies and cannot
  die; the quest fails only if you exit without it (it is lost when it is more than 12 tiles behind at the exit).
- Quest rewards also add score (section 1). A failed quest has no penalty.

## 3. Combat and items

**Principles:**
- Attacks fire by themselves at the nearest enemy **in line of sight**: a tile-grid ray (DDA over `level.tiles`)
  from the octopus to the candidate hits no rock. Projectiles die on rock. Without this, Ink Jet shoots walls and
  the auto-attack looks broken in a cave. Nothing new to press, so touch controls stay joystick + Dash + Bomb.
- Global stats (damage, area, cooldown, amount) apply to every weapon, which is what makes items stack and synergise.
- Slots: 4 weapons + 4 passives. You start with **Ink Jet L1**.
- **The cave must stay dangerous no matter the build.** Auto-fire clears anything that swims at you; what keeps a
  run tense is what it cannot clear: the Beholder clock, cannon fire from cover, mines and urchins in the
  narrow bits, and the choice between farming XP and diving. See Q7 (hazard enemies without HP).

### 3.1 Weapons (5 levels each; numbers go to `config.js` and are tunable)

| Weapon | Level 1 | L2 / L3 / L4 / L5 | Art |
|---|---|---|---|
| Ink Jet | 1 ink blob at the nearest enemy, range 6, dmg 4, cd 1.0 s, speed 10 | +1 blob / dmg +2 / cd -20% / +1 blob, pierce 1 | code-drawn ink blob and trail (death-ink style) |
| Bubble Ring | 2 bubbles orbit at r 1.4, dmg 3, same enemy hit at most every 0.5 s | +1 bubble / dmg +2 / r +0.4 / +1 bubble, knockback | `bubble-bubblesingle.webp` |
| Tentacle Whip | front+back sweep (the original attack: dmg 4, 0.75 s), here dmg 6, reach 1.6, cd 1.4 s | dmg +3 / reach +0.4 / cd -20% / full 360 sweep | code arc in tentacle colour |
| Ink Cloud | every 3.5 s a cloud r 1.5 for 2.5 s: 2 dmg per 0.5 s tick, enemies slowed 40% | r +0.4 / +1 s / dmg +1 / second cloud on the nearest enemy | code ink particles (capped, section 4) |
| Shock Pulse | every 4 s a ring r 2.5: dmg 5, stun 0.6 s | r +0.5 / dmg +3 / cd -20% / r +1.0 | code electric ring |

Cut by the CEO review (section 8): **Bubble Torpedo** (homing steering plus a pop area is the most code and the most
per-frame work for the least new feel; Ink Jet already covers "shoot the thing") and the Shock Pulse L5 chain
(replaced by a plain radius step). Both can return later as data plus one function each.

**Kept actions:**
- Dash: today's impulse and cooldown. It hits for dmg 8 above `DASH_KILL_SPEED`.
- Bomb: today's fuse and radius. It breaks rock and deals dmg 30 to enemies, and killed mines chain-explode.
- No weapon breaks rock (it keeps the level readable). Bombs are the digging tool.

### 3.2 Passives (3 levels each)

| Passive | Per level | Art |
|---|---|---|
| Heart Coral | +1 max heart and heal 1 (max 6 hearts) | `ui-heart.webp` |
| Big Ink Sac | area +15% | code |
| Siphon | cooldowns -8% | code |
| Venom | damage +15% | code |
| Eight Arms | +1 amount (blobs, bubbles, clouds) at L1 and L3; L2 projectile speed +20% | code |
| Mucus Magnet | pickup pull radius +40% (base `PLANKTON_PULL_RADIUS` 1.0) | code |
| Bomb Bag | +1 max bomb and +2 bombs now; at L3 a bomb regrows every 40 s | existing bomb sprite |

Cut by the CEO review (section 8): **Shell Guard** (a block-and-recharge state machine plus HUD state for one
passive) and the three **evolutions** (a second offer path through chests). Shells stay as score pickups.
Evolutions are the first thing to add back if the game ships and people play past level 8.

### 3.3 Drops and XP

- **Plankton = XP.** Every kill drops plankton: 1 XP, elites 5, nest core 10. Plankton swarms placed in the level
  still exist and give 1 XP per dot. The existing `pickups.js` pull and collect code is reused.
  At most 60 loose XP dots. Past the cap, new XP merges into the nearest dot (as in VS).
- **XP to next level:** 5, then +3 per level (5, 8, 11, 14, ...). About 3 level-ups in level 1 and about 2 per level
  later. Tuned in M4.
- **Other drops per kill:** heart 2% (only when hurt), bomb 3%. Shells stay rare level spawns, worth score (Q4).
- **Chests** come from vaults, nests, treasure pockets and quests. A chest offers 1 of 3 cards, weighted toward
  owned items (VS style). It is the same overlay as a level-up, so it costs no new UI.

### 3.4 Level-up flow (touch first)

1. The XP bar fills and the sim pauses. Rendering continues dimmed, and a short synth chime plays.
2. An HTML overlay (`ui.js`) shows 3 cards. Each card has an icon, a name, "Lv 2 -> 3" or NEW, and a one-line effect.
   - Portrait: cards stack vertically, full width, at least 72 px tall. Landscape and desktop: one row.
   - Taps are ignored for the first 0.35 s, and until every touch has been lifted once, so the thumb on the
     joystick cannot pick a card by accident.
   - Input: tap or click picks the card. Keys 1/2/3, or arrows + Enter/Space, also work.
3. Queued level-ups show one after another. Pause, blur and `visibilitychange` keep the overlay open.
4. When everything is maxed, the cards offer heal 1, +2 bombs or +25 score.
5. The HUD adds an XP bar, the player level, small weapon icons, the level and band name, and the quest line.

## 4. Enemies

**Existing kinds** (`enemies.js`) keep their behaviour and art, plus the following.

**New for v2:**
- **Hit points.** Today every kill is one hit. Kinds get hit points, a white hit-flash and a small knockback. Contact
  damage stays at 1 heart.
- **Scaling.** HP scales with depth: `hp * (1 + 0.12 * levelIndex)`.
- **Elites** (band 4, 10% of spawns): x3 hp, 5 XP, drawn with a tint.
- **Spatial grid.** A uniform grid of 4x4-tile buckets over the level serves auto-targeting, separation and weapon
  hits in O(n). Max 40 live enemies and 64 live projectiles, all pooled.
- **Effect caps (phone budget).** At most 128 live effect particles (ink trails, cloud puffs, hit flashes) in one
  pool; past the cap the oldest is recycled. Ink Cloud is drawn as at most 12 puffs per cloud. Off-screen
  projectiles and particles are simulated but not drawn. This is a hard rule for M3-1, checked by the profiler.

**Spawning by pattern** (replaces `pickKind` slot tagging; `bandMask` limits each row to its bands):

| Kind | Kernel (y-down, `A` anchor, `#` rock, `.` water) | Bands | HP | XP |
|---|---|---|---|---|
| urchin | Pattern01 `#` / `A` / `_`, MirrorY (floor or ceiling) | 1-4 | 8 | 1 |
| crab | floor run `AAA` over `###` | 1-4 | 10 | 2 |
| piranha | LongHorizontal cut to 6 water cells, MirrorX | 1-4 | 6 | 1 |
| horns | floor or ceiling run of 2, MirrorY | 2-4 | 12 | 2 |
| mine | 3x3 open water | 2-4 | 4 | 1 |
| cannon | PatternCannon inner corner, MirrorXY; not at a concave corner (the round-11 rule) | 2-4 | 14 | 3 |
| manta | 5x3 open water | 3-4 | 16 | 3 |
| Beholder | per-level timer (section 1) | all | cannot be killed; slowed by Ink Cloud, stunned by Shock Pulse | 0 |

**Per-level budget:** band 1: 10, band 2: 14, band 3: 18, band 4: 22 placed enemies, plus nests.

**Trickle** (keeps XP flowing, VS feel): every 10 s (band 4: 6 s), 1-3 piranhas spawn in open water 12-16 tiles from
the octopus, out of view, with at most 6 trickle enemies alive.

The emitted spawn fields (`placement`, `wallDir`, `flatRun`, `nearSideWall`) are derived from the kernel, so the
existing enemy constructors keep working.

## 5. Milestones and tasks

**Rules for every task:**
- **Before dev starts:** Fox validates this plan. Beaver reviews every change.
- **Tests:** unit tests in `play/tests/` pass (existing ones updated, not deleted).
- **Manual check:** on desktop 1920x1080 and on mobile emulation 375x812 (plus 812x375 landscape), with keyboard,
  mouse and touch.
- **Performance:** `?fps=1` within the `PLAN.md` budgets (median frame work at most 4 ms in the pane).
- **Visual tasks** end with the Opus screenshot review.
- **QA:** Owl tests each milestone.
- **Deploy:** merged to master; pushing master deploys it automatically (see `CLAUDE.md`).
- **Hard rules:** the Unity project and SmartRooms are read-only. Nothing paid and no Unity file goes into `site/`.
  New exported art gets an `ASSETS.md` row.

**Sizes:** S up to half a day, M 1-2 days, L 3-4 days.

### M1: SmartRooms level generator with today's gameplay (behind `?v2=1`)

- **M1-0** (Otter, S, first task of the milestone): **combat feel spike.** In today's endless mode, behind
  `?auto=1`: enemies get the section 4 hit points, and Ink Jet L1 auto-fires at the nearest enemy in line of
  sight. Throwaway quality, no art, no tests beyond "does not crash". Purpose: Daniel plays it for 5 minutes on
  his phone in week 1 and says whether auto-attack in this cave feels right, before M3 is built on it.
  Accept: Daniel's feel verdict written into `PLAN.md`. If the verdict is "no", M3 and M4 are re-planned before M2 starts.
- **M1-1** (Badger, S): `tools/export_rooms.py` writes `play/data/rooms.json` from the 18 room PNGs
  (`Sprites/Tilemap/WorldGen/Rooms/`, thresholds `ProceduralMapBuilder.cs:594`); add an `ASSETS.md` row.
  Accept: 18 rooms of 10x16; green pixels become `P`; the file is plain JSON strings.
- **M1-2** (Otter, M): `play/js/rooms.js`, `loadRoomBank` + `buildConnTables`, as in 2.2. Read SmartRooms
  `GenTile.cs:34-90` and `SmartLevelGenerator.cs:1009-1100`.
  Accept (`rooms.test.js`): variant count = sum of the allowed flips; `maskU(octo-0)` = cols 2-7; an H flip equals
  the hand-mirrored rows; `connR[a][b] == connL[b][a]`.
- **M1-3** (Otter, L): `play/js/level.js`, `generateLevel` steps 1, 3, 4 and 5 (no specials yet). Read
  `SmartLevelGenerator.cs:319-654, 1236-1365`.
  Accept (`level.test.js`):
  - 5 seeds x 1000 levels are all solvable by the fat-water BFS
  - same seed gives the same level
  - border cells are rock
  - fallback rate < 1%
  - p95 < 8 ms
- **M1-4** (Badger, M): `world.js` single-level mode: `level.tiles` replaces the chunk ring buffer; outline traced
  once; bombs use `isBedrock` and retrace only the affected band; camera clamped to 34x68. `render.js` wall cache
  split into 512 px bands, **cached only for the band on screen and one on each side** (the ring-buffer idea kept
  at band level). A whole-level cache at phone DPR is tens of MB of canvas and is the most likely way to crash a
  low-end phone tab.
  Accept:
  - `?v2=1` plays a full level on desktop and at 375x812
  - no visible seams
  - bombs open interior rock but never the border; a bomb causes no frame over 16 ms at 375x812
  - at most 3 wall-cache bands live at any time (assert in a test)
  - frame work within budget
- **M1-5** (Otter, S): an adapter that feeds today's enemy, plankton and shell placement from the whole level
  (the existing tagging run over 34x68).
  Accept: enemies, pickups and the Beholder behave as in endless mode; no spawn in rock; none within 7 tiles of the start.
- **M1-6** (Owl, S): QA pass plus the Opus visual review of 3 seeds, phone and desktop.

### M2: exit portal, next level, depth bands, pattern engine for enemies

- **M2-1** (Otter, M): start and end markers, entry and exit portals, the 0.8 s transition, `levelIndex` 0-11,
  carry-over state (section 1), and a win screen after level 12.
  Accept: 12 levels in a row with a debug skip key; state carries over; next-level gen stays hidden in the fade;
  no frame over 50 ms during the fade at 375x812 (generator + outline + first wall-cache bands together).
- **M2-2** (Magpie, S): portal drawn in code (swirl + glow), after checking whether Milan's `Sprites/Portal` art is
  confirmed. Accept: Opus review; it reads clearly on a phone.
- **M2-3** (Otter, M): `play/js/patterns.js`: `compilePatterns`, `buildNeighbourWords`, `matchPattern`,
  `selectSpawns`, with the quirk fix and the occupancy mask (`TERRAIN-PORT.md` §5 step 7).
  Accept (`patterns.test.js`, tiny hand grids):
  - a sprout needs 1 water above it; kelp needs 3
  - mirrors work; off-map counts as rock
  - two items that share a pattern both spawn (quirk fixed)
  - scan < 1 ms per level
- **M2-4** (Otter, M): the enemy spawn table of section 4 (`play/data/patterns.json`), band masks, per-level budgets,
  safe radii, and the per-level Beholder timer. Retire the M1-5 adapter for enemies.
  Accept: `enemies.test.js` passes; per-kind counts stay within caps; band 1 has no cannons or mantas.
- **M2-5** (Magpie, S): `depthTint` keyed by band, plus the band name shown on arrival.
  Accept: Opus review of one screenshot per band.
- **M2-6** (Owl, S): QA of a full 12-level run, on desktop and on phone emulation.

### M3: auto attack and the first weapons (still behind `?v2=1`)

- **M3-1** (Beaver design, Otter build, M): `play/js/combat.js`: weapon state as flat arrays, a pooled projectile
  store (64), the spatial bucket grid, enemy hp, hit flash, knockback, and the global stat block.
  Accept: 40 enemies + 64 projectiles at 375x812 within budget; zero allocations per frame in the profiler.
- **M3-2** (Otter, M): Ink Jet, Bubble Ring and Tentacle Whip at L1-5 with section 3.1's numbers; dash and bomb
  damage; mine chain.
  Accept: unit tests for targeting, cooldown and pierce; each weapon can be forced with a debug key.
- **M3-3** (Otter, S): kills drop plankton XP; XP counter and bar (no level-up yet); drop caps and merging.
  Accept: 60-dot cap holds; the pull still works on touch.
- **M3-4** (Magpie, M): code-drawn ink blob, whip arc and hit flash, and bubble art for the ring.
  Accept: Opus review; readable at phone scale; no overdraw spike.
- **M3-5** (Badger, S): quiet, rate-limited synth SFX for fire, hit and pickup in `sfx.js`; the trickle spawner hook.
  Accept: no audio clipping with 3 weapons firing; mute works.
- **M3-6** (Owl, S): QA of M3 on desktop and phone emulation. The go/no-go on the default moves to M4-7: without
  level-ups, auto-attack is only "less to press", and that is not the comparison Daniel should judge on.

### M4: items and level-up (v2 becomes the default at the end)

- **M4-1** (Badger, M): the level-up overlay of section 3.4, including the touch lockout, key and mouse input,
  and queued picks.
  Accept: picked by tap at 375x812 and 812x375, by keys, and by mouse; no accidental pick while the joystick is held.
- **M4-2** (Otter, S): Ink Cloud and Shock Pulse. Accept: as M3-2.
- **M4-3** (Otter, M): the 7 passives and the offer weighting (new versus owned, full slots, all maxed).
  Accept: tests for the stat maths and for offers never showing a maxed item.
- **M4-4** (Otter, S): chests and the drop table (hearts, bombs).
  Accept: a chest offers 3 cards from the same flow.
- **M4-5** (Magpie, S): card icons (existing sprites or code) and the HUD row of weapon icons.
  Accept: Opus review; nothing overlaps in the safe areas.
- **M4-6** (Badger, S): save v2 with migration from `octomancer.best.v1`.
  Accept: an old save loads; private mode still works.
- **M4-7** (Kitty + Owl, S): go/no-go for making v2 the default, with Daniel's verdict. On go, the endless code
  path is removed in a follow-up S task at the start of M5.

### M5: special rooms and portals

- **M5-1** (Beaver, M): author the new normal and special room templates in `rooms.json` (section 2.4).
  Accept: every template parses; each special connects to at least one normal variant.
- **M5-2** (Otter, M): `generateLevel` step 2 (mandatory and optional specials), step 7 (bomb floor), and the
  reachability checks for specials.
  Accept: 5000 levels with every special's marker reachable; the vault plug is the only way in.
- **M5-3** (Otter, M): vault, rest pool and nest behaviour.
  Accept: each works in a debug-forced level, on desktop and on touch.
- **M5-4** (Otter, S): bonus portal and treasure pocket (section 2.5): teleport, chest, return portal, portal closes.
  Accept: the pocket is unreachable by the fat-water BFS from the path; teleport works on touch; a bomb into the
  pocket wall does not break anything.
- **M5-5** (Owl, S): QA plus an Opus review of every special room.

### M6: quests

- **M6-1** (Otter, M): quest pick per level, a mandatory quest room, the done and failed states, rewards.
  Accept: every quest type can be forced and completed; a failed quest has no penalty.
- **M6-2** (Otter, S): critter den: cage, freeing, and the trail follower (existing critter art, section 2.6).
  Accept: the critter follows around corners by the trail alone, never enters rock, and does not block the octopus.
- **M6-3** (Badger, S): quest line in the HUD, a toast on completion, and quests on the run summary.
  Accept: readable at 375x812.
- **M6-4** (Owl, S): QA of a full run with every quest seen at least once.

### M7: foliage pattern table and polish

- **M7-1** (Magpie, M): match each promo-still foliage type (sprouts, hanging leaf chains, tall kelp, yellow
  tendril anemones, pink coral stubs, grey cracked boulders, acid puddles) to Milan's harvested art
  (`harvest/Assets/Sprites/Animations/Plant{5,7,8,9,12,13,24,25,26}*`, `AcidatorPoop`, the 2021 bushes). Bake the
  frames with `tools/bake_creature.py` and add `ASSETS.md` rows. A type with no Milan source is drawn in code and flagged to Daniel.
  Accept: Opus side-by-side with `site/img/octomancer/video/` and `reference/design/foliage-props.png`.
- **M7-2** (Otter, M): foliage rows in `patterns.json` using Daniel's rules:
  - sprouts: floor, 1 water above
  - kelp: floor, `airUp` 3
  - leaf chains: ceiling, 2+ water below
  - anemones: ceiling corner, MirrorX
  - coral stubs: floor inner corner
  - boulders: WideVertical
  - acid puddles: floor basin

  `decor.js` `findPlantAnchors` and `findWallCritters` then read layer-0 spawns (`TERRAIN-PORT.md` §5 step 9).
  Accept (`decor.test.js`): no decor overlaps an enemy; the vine-only cluster rule still holds.
- **M7-3** (Badger, M): phone performance pass. Cap decor draws per band of the screen, DPR step-down check, and a
  10-minute autoplay soak.
  Accept: p95 frame within budget at 375x812; no long frames at level load.
- **M7-4** (Otter, S): balance pass on HP, XP curve, drop rates and band budgets, from 5 recorded runs.
  Accept: the first death comes at level 3-5 for a new player; a good run reaches level 12.
- **M7-5** (Owl + Kitty, S): release candidate QA and a go/no-go note to Daniel.

## 6. Open questions for Daniel (work starts on the defaults)

| # | Question | Default |
|---|---|---|
| Q1 | Run length: 12 levels in 4 bands, ending with a win screen? | Yes. An endless "Abyss loop" after level 12 can come later. |
| Q2 | What a bonus portal does | A teleport to a sealed treasure pocket in the same level (chest, return portal). The separate bonus grotto with a challenge wave is deferred; a shortcut that skips a level fights the build-up of items. Daniel's call: the pocket ships first either way. |
| Q3 | Meta progression between runs | Stats only. No codex, no permanent power-ups. |
| Q4 | Shells: keep them in at all, now that the trader is cut? | Yes, as rare pickups worth 50 score each. Milan's art, cheap, and they give the bomb a second reason (shells in rock). |
| Q5 | Keep the Beholder as a per-level timer (120 / 100 / 90 / 60 s by band)? | Yes. It is Octomancer's identity and Spelunky's ghost. |
| Q6 | Foliage types that have no Milan art (if M7-1 finds any) | Draw them in code in Milan's palette, and show them to Daniel before they ship. |
| Q7 | Should urchins, cannons and mines be **hazards** (no HP, no XP, cannot be shot) rather than enemies? | Yes for urchins and mines; cannons keep HP 14 but sit at inner corners where line of sight is short. Reason: auto-fire must not be able to make the cave itself safe. Daniel's call, because it changes the feel he asked for. |
| Q8 | Does code-drawn VFX (ink blobs, whip arc, shock ring, portal swirl, hit flash) count as allowed under "only Milan's art"? | Yes: it is not third-party art, and the death-ink burst is already drawn in code. Anything that reads as a "sprite" (a creature, a plant, a prop) still has to be Milan's. |
| Q9 | Trader cut (shell shop in `Building.png`) | Cut for v2. The room stays in the bank as a normal room. Daniel's call if he wants the shop back, because `Building.png` is his own design for it. |

After Daniel's answers and Fox's validation, `PLAN.md` gets a short v2 section and a task table that points here.

## 7. Size after cuts

Removed: Bubble Torpedo, Shock Pulse chain, Shell Guard, evolutions, trader, bonus grotto (own level), per-run
quest, codex. Added: M1-0 combat spike (S), line-of-sight targeting, effect caps, band-ring wall cache. Net effect:
M4-2 M to S, M5-3 stays M with less in it, M5-4 M to S, M6-1 stays M with less in it; the stretch is gone.
Rough size moves from 6-8 to 5-7 weeks. The generator and combat core are untouched by the cuts.

## 8. CEO review (Fox, 2026-09-30)

**Verdict: approved with changes.** The changes are already in the text above; every cut is marked "Cut by the CEO
review" where it applies, so Kitty can revert any single one with a search.

What I changed and why:

1. **Combat is validated in week 1, not week 4 (M1-0).** The generator is a port of Daniel's own code; the risk is
   whether auto-fire feels right in a cave. A throwaway spike on today's endless mode answers that for half a day.
2. **v2 becomes the default at the end of M4, not M3 (M3-6, M4-7).** Auto-attack without level-ups is not the
   thing Daniel should compare against endless mode.
3. **Scope cuts (section 7).** Six systems out, none of which change what a player sees in the first 10 minutes.
   Evolutions are the first to come back if people play past level 8.
4. **Bonus grotto replaced by an in-level treasure pocket (2.5, M5-4).** Same reward, no second level in memory,
   no timer pause, an M task becomes an S. Portals are kept as Daniel asked.
5. **Three phone risks got hard rules.** Wall cache limited to a 3-band ring (M1-4); a fade budget of "no frame
   over 50 ms" that covers gen + outline + first bands together (M2-1); a 128-particle pool and 64-projectile
   pool with off-screen skip (section 4). Bomb retrace limited to the band (2.3).
6. **Line-of-sight targeting (3).** Without it the first thing Daniel sees is ink hitting walls.
7. **Critter follower uses the octopus's trail, no pathfinding (2.6, M6-2).** Same charm, a tenth of the bugs.
8. **Three questions added (Q7, Q8, Q9).** They are Daniel's, not the team's: hazards without HP changes the
   feel he asked for; code-drawn VFX touches his "only Milan's art" rule; the trader is his own room design.

Blocking concerns (must be answered before the named task starts, not before M1):

- **Q7 before M3-2.** If urchins and mines stay XP piñatas, the balance pass in M7-4 will find the cave is only
  dangerous because of the Beholder timer, and that is a one-note game. I want Daniel's answer, not the default.
- **M1-4 wall-cache memory before M1-4 starts.** Badger should measure the per-band canvas size at DPR 2 and 3
  and write the number into the task. If a 512 px band at DPR 3 is more than ~6 MB, use 256 px bands.
- **M1-0 verdict before M2 starts.** A "no" from Daniel here re-plans M3 and M4; that is cheap in week 1 and
  expensive in week 4.

Not blocking, but named: the XP curve (5, +3) and per-level enemy budgets (10 to 22) are guesses. That is fine,
they are data, but M7-4 needs the five recorded runs to be real runs on a phone, not desktop.

## 9. Daniel's answers (2026-09-30)

Q7 hazards: yes (urchins are hazards; cannons keep HP). Mines are removed from the game entirely (Daniel: ugly, urchins cover it). Q1: 12 levels with a win screen. Q2: the treasure pocket. The M1-0 combat spike runs first. Q3-Q6, Q8 and Q9 go ahead on their defaults unless Daniel says otherwise.
Daniel is away tonight (2026-09-30) and delegated decisions: the spike ships behind ?auto=1 and M1 proceeds behind ?v2=1; his feel verdict is still needed before M2.

## 10. Re-scope: Biome 1 scaffolding first (Daniel, 2026-09-30)

Daniel: SmartRooms' rooms and visuals are only a demo, so take its code and concepts, not its content. The model is Spelunky 2. Build the scaffolding for the first biome, get it running, and only then add enemies, visuals and so on. Assets come from image generation (openai-image-gen), in Milan's style.

Scope of B1 (this replaces the order of M2-M7 until B1 runs):
- **B1-1 Run flow state machine** (`js/run.js`, flat state): `hub -> tutorial -> biome1 L1 -> L2 -> L3 -> biome-end screen`. Death returns you to the hub. Each state is a generated or authored level loaded through the single-level world from M1-4. Level transitions use a short fade.
- **B1-2 Room templates as data** (`play/data/biome1-rooms.json`), in the Spelunky style: ASCII rows (`#` rock, `.` water, `S` start, `E` exit, `?` a 50% "quantum" tile, `^`/`v`/`<`/`>` pattern anchors), tagged by type (path LR, drop, landing, side, start, exit). 20-30 hand-authored 10x16 rooms for biome 1; the Octomancer PNG rooms stay only as a fallback bank.
- **B1-3 Hub and tutorial as authored maps** (`hub.json`, `tutorial.json`): the hub is one screen with an entrance to the dive and a journal board. The tutorial is a short authored level with prompts: swim, dash, bomb a wall, reach the exit.
- **B1-4 Journal scaffolding** (`js/journal.js`, save.js): discovered entries keyed by id for places, creatures and items, persisted, with a simple list screen opened from the hub. The content fills in later.
- **B1-5 Biome 1 art pass** (after B1-1..4 run): generate the biome-1 tile set and backdrop with openai-image-gen in Milan's style, using his sprites as edit references, low/medium quality, few images.
- Enemies, combat (M3/M4), specials, quests and foliage patterns come after B1 runs end to end.

## 11. Spelunky 2 gap: top 5 scheduled (2026-09-30, rounds 24-28)

1. Biome 1 art pass (generated, Milan style, at most 12 images).
2. Traps and hazards placed by the pattern table: current jet, spike wall, falling rock, electric eel, anemone cluster; existing enemies placed by patterns with a ramp over 1-1..1-3.
3. Loot and secrets: breakable clams and pots, hidden rock pockets with a cue, chests (some trapped), relic pedestal with a chase.
4. Carried items: flippers, lantern, shell magnet, bomb bag, heart container; found, bought, kept between levels, lost on death.
5. Run loop and meta: death and clear screens with stats, best runs, level title cards, seeded runs, hub shortcut to 1-2 after one clear, journal stats page.

Deferred until Daniel's auto-fire verdict: combat (M3/M4). After these five: biome 2 (Kelp Caves) with its own bank, enemies and rules.

Note (2026-09-30, late): rounds 24-28 delivered only item 1 (art pass) plus polish; items 2-5 were never seen by the fixer because the workflow replaced the todo with review issues after round 1. The script now carries one mandatory feature per round. Items 2-5 relaunched as rounds 29-32.

## 12. Vertical slice on biome 1 (Daniel, 2026-10-01; rounds 33-36)

Daniel: it does not feel like Spelunky yet; enemies are buggy, levels lack detail, bombs should have gravity, more physics sim. Scheduled, one per round: physics props (bombs sink, bounce, roll; pots, clams, chests, relic and falling rocks as bodies; explosion impulses; rubble), enemy fixes from Owl's QA-ENEMIES.md plus readable telegraphed patterns, level detail (reworked rooms, more quantum tiles, 10 new rooms with 3 set pieces, 2x props, background detail), game feel (shake, hit-stop, dash recoil, tunable idle sink via ?sink=). The auto-fire verdict and biome 2 wait until the slice feels right.

## 13. Daniel's corrections (2026-10-01): default mode, settings menu, journal and quests the Spelunky way

- `?v2=1` is gone: `/octomancer/play/` is the level game; `?endless=1` keeps the old endless mode until it is deleted.
- **Settings menu (top right):** a gear button next to pause and mute opens one panel: music and SFX volume, reduced motion, screen shake on/off, control scheme help, octopus sink strength (slider, replaces `?sink=`), seed for the next run (replaces `?seed=`), language later. Persisted in save.js. All debug URL params stay only for tests.
- **Journal, as in Spelunky 2:** not a list. A book with tabs: Places, Bestiary, Items, Traps, People. Each entry is locked (silhouette with '???') until first encountered, then shows art (the actual sprite), a name, a 2-line description, and counters (seen, killed / killed by, collected). A Progress page: completion %, deaths, best depth, play time. Opened from the hub board and from the pause menu. Entry discovery toast stays but smaller.
- **Quests, as in Spelunky 2:** no HUD "Quest:" line and no random per-level objective. Quests are emergent NPC questlines found in the levels, chained across levels and runs, never explained up front:
  - *The Stranded Diver* (1-1 or 1-2): an NPC behind rock asks for a way out; bomb him free and he appears in the hub with a small reward each run he is freed; free him 3 runs and he opens a shortcut.
  - *The Caged Critter*: a cage with a critter; break it open and the critter follows you; bring it to the exit for a shell reward and it joins the hub.
  - *The Collector*: an NPC who wants 3 relics across runs; each delivered relic unlocks a journal entry and finally a lantern at the hub.
  - *The Challenge Pool*: a wager room (pay 5 shells): survive 20 s of hazards for a prize.
  - *The Altar*: sacrifice an item or a stunned enemy for a random boon.
  The shop and the "Untouched" style bonuses go away as quests; "Untouched" becomes a journal stat. Quest state lives in save.js (per run and across runs) as flat flags.

- **Status (round 38, second pass):** settings menu built. The journal is a real book (two parchment pages, bookmark tabs, locked silhouettes, per-entry counters, a Progress spread; data in `data/journal.json`). Quests are named NPC questlines (Marlo, Pip, Quill the Collector) with staged speech bubbles, chains across levels and runs and a changing hub. The Challenge Pool and the Altar are still open.

- **Status (round 39):** the questlines follow the Spelunky 2 model. No HUD line anywhere (the `.octo-hud-quest` element is gone), no per-level objective, no hub sign: everything is in-world (an NPC's speech bubble, the hub's residents) and in the journal's People pages (each shows the questline so far). Built: *the Stranded Diver* (Marlo: sealed in rock on 1-1 or 1-2, bomb him free; he stands in the hub from the next run; freed in three different runs he opens a second hub ring to Shallows 1-3), *the Caged Critter* (Pip: a cage on a floor, only a dash or a bomb breaks it, he trails you, 8 shells at the exit, then he swims in the hub), *the Collector* (Quill: moves into the hub after your first dive; each relic carried out through an exit and handed over unlocks a Shelf Piece journal entry; three give his lantern, lit in the hub and carried on every dive), *the Challenge Pool* (a set-piece room `b1-set-pool`: pay 5 shells at the pedestal, survive 20 s of falling rocks over two vents, take the chest for 14 shells). Cut: *the Altar* (optional in this plan). Quest state is flat counters in save.js (`marlo`, `pip`, `quill`, `relics`, `relicsGiven`, `diverFreed`, `critterFreed`, `poolPaid`, `poolWon`, `said<Name>`).

## 14. Queued after round 44 (Daniel, 2026-10-07)

- **Death ragdoll, the Spelunky way:** on death the octopus goes limp (eyes closed, tentacles slack) and becomes a physics body that sinks, bounces, rolls and gets shoved by blasts and currents; enemies keep attacking it with hit flashes and knockback; the camera stays centred on it; the death screen appears after about 1.5 s as a side panel (desktop) or bottom sheet (phone) with a light tint and a clear area around the body, which keeps simulating behind it.
  - **Status (2026-10-08, Ragdoll owner):** built. The limp body is a props.js body (`PK_BODY` = 9, `js/ragdoll.js` syncs it with the octopus record); X eyes, one splayed swim frame, white hit flash, roll spin. Enemies (piranha, crab, cannon, manta, Beholder) and hazards (jets, spikes, anemones, eels, falling rocks, chest spikes, bombs) keep targeting the dead body; a hit is a knock and a flash, at most one per 0.3 s; a flung corpse never dash-kills. The camera frames the body in the free part of the screen (`camera.js updateDeathCamera`). The death screen comes at 1.5 s: a side panel (desktop) or a fixed-height bottom sheet (phones; columns in landscape) over a 0.3-alpha tint with a clear hole around the body; toasts and hints hide. General API: `enterRagdoll(o, seconds, cause)`, `exitRagdoll(o)`, `killOctopus(o, cause, pose)`, `setRagdollPose(cause, draw)`. Tests: `tests/ragdoll.test.js`, `tests/death-cdp.js`.
- **Fish juice (decided 2026-10-07):** shells stay shop money; juice comes from kills and pays for spells. Spells have their own button (dash stays free; phones get a third button; mobile is not the focus). The first and starting spell is Ink Cloud (1 cast, 4 s cloud, enemies inside lose track of you), jar of 3 casts, 1 cast at run start, spell slot ready for rune spells later. Original brainstorm: a magical currency from kills (droplets pulled to the octopus, a jar in the HUD) spent on spells found as runes or bought. Open questions: keep shells alongside it or replace them; spell on its own button or replacing dash; which first spells (Ink Cloud, Tentacle Grab, Bubble Shield, Riptide, Coral Wall, Blink, Fish Familiar).

## 15. Controls and combat (Daniel, 2026-10-07)

Desktop: WASD/arrows move; left click = Ink Jet attack toward the mouse (primary action, cooldown, hold to repeat); right click = cast the selected spell; middle click = bomb toward the cursor; Shift/Space = dash. Pure mouse steering is removed. Keyboard fallbacks J/K ink jet, F spell, B/X bomb. Phones: joystick plus attack (auto-aim), spell, bomb and dash buttons.
Inventory: a hotbar of spells and active items with the juice jar (wheel, 1-9, Q/E to switch) and an inventory panel (Tab/I). Data-driven so Noita-style spell crafting can be added later (slots hold arrays of spell ids). Owned by the combat-and-spells owner together with fish juice and Ink Cloud.

Juice economy (Daniel, 2026-10-07): corpses leak juice, but it is collectible only with a carried passive item found in the first zone (a 'Siphon Shell', like Spelunky's Kapala and blood). Otherwise juice and hearts refill only at the end of each zone, in a rest grotto with a spring (like Noita's Holy Mountain). Runs start with a full jar. Also queued with its own owner: treasure embedded in rock walls, visible only with Sea-glass Goggles (Spelunky's Spectacles).

- **Status (2026-10-08, combat and spells branch):** built. Controls as above (no mouse steering; J/K, F, B/X, Q/E, 1-9, Tab/I keyboard alternatives; a 2x2 Jet/Spell/Bomb/Dash touch block, the Jet auto-aims). Ink Jet (inkjet.js, enemies have hp in v2; urchin, horns and the Beholder are immune). Ink Cloud (spells.json row; 4 s; piranhas abort and wander, cannons cannot aim through it, crabs stop snapping, mantas sweep past; the Beholder is not fooled). Hotbar (slots hold arrays of spell ids) with the juice jar and an inventory panel (pauses, reorders). Juice: a jar of 3 casts, full at the start of a dive; corpses leak a cloudy trickle that dissolves, drinkable only with the Siphon Shell (lies on one Shallows level per dive near its start, also sold at stalls); the Still Grotto after Shallows 1-3 has a spring that refills hearts and juice and a stall. The leak comes from the enemy's death spot through main.js bodyJuice(), to be retargeted to onCorpse when physics corpses land.

Portal entry (Daniel, 2026-10-07): match Unity's LevelPlayMode.AnimateOctopus/MoveOctoToExit exactly: on reaching the exit, pause physics for the octopus (velocity 0, collider off, idle animation, no input), then for 1.5 s move it toward the exit centre at OctopusAnimWinSpeed = 1 tile/s, rotate at OctopusAnimWinRotationSpeed = 720 deg/s (clockwise), scale *= (1 - 0.5*dt) per frame, while TransitionEffect.FadeoutAt(exit) runs a black-hole fade centred on the exit; then hide the octopus and finish the level. Current build jitters because physics keeps running while a hold pulls it. Scheduled for an owner right after round 44 lands (same code).
## 16. Damage model, the Spelunky way (Daniel, 2026-10-07)

Traps and creatures are told apart by how they hurt, not only by how they look. Every hazard and enemy has one tier:

| Thing | Tier | Why |
|---|---|---|
| Spike strip (trap) | **instant**: impaled, the body stays skewered on the tips | a trap you can read from afar; Spelunky's spikes |
| Hanging boulder landing on the octopus | **instant**: splat, flattened under it (hit-stop, heavy shake, ink and goo, chunks stick) | the rumble and dust are the warning |
| Giant clam snapping shut with the octopus inside | **instant** | it opens, a pearl glints, the shell trembles 0.5 s first |
| Tentacle grab not broken in time | **instant** (pulled into its shell) | the grab itself can be escaped |
| Beholder | **instant** (unchanged) | the level clock |
| Manta dive slam | **incapacitation** (1 heart, about 1.25 s limp) | a heavy body falling on you knocks you out |
| Electric eel shock | **incapacitation** (1 heart, about 1 s limp) | a shock paralyses |
| Tentacle grab | **held**: no control, dragged to the shell, dies unless it breaks free (3 dash struggles, ink hits on the tentacle, or a bomb) | the grab before the kill |
| Piranha, crab, urchin, horned growth, cannon shot, anemone, trapped-chest spikes, relic and pool chase stones, Pip / Quill / pool host bites | **one hit**: 1 heart, strong knockback (9 u/s) | creatures that bite or sting |
| Marlo's harpoon (aggroed) | **heavy hit**: 2 hearts, 13 u/s knockback, after a 0.7 s aim line | a weapon, telegraphed |
| Current jet | no damage; pushes **up only** | paired with ceiling spikes only where 5+ tiles of clear water leave room to dash out |

Incapacitation: the octopus loses control, the body goes limp (sinks, bounces off rock, tumbles), rights itself in the last 0.35 s, then has 0.5 s of grace. Chosen for the manta slam (a heavy body), the eel (a shock) and the tentacle (held, not limp). Ordinary bites stay one hit so most fights keep their pace.

Also in this pass: giant clams (pearl = 30, the top currency find), Milan's Clamissaint as the tentacle (dormant until you come near), killable and aggroable NPCs (Marlo with a harpoon gun; Pip, Quill and the pool host bite; a killed person is gone until the end of the next dive, Marlo's 1-3 shortcut with him; the shopkeeper belongs to the Shop owner and our hits call `shopAggro`), physics corpses for every enemy and person (no drops from enemies; `setCorpseHook` lets fish juice leak from them), and currency shells by value: cowrie 1, conch 5, nautilus 15, pearl 30.
