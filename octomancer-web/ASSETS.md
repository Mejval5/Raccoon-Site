# Octomancer play/assets — shipped file ledger

Every file under `site/octomancer/play/assets/` must have a row here.
The dev deletes anything under `play/` that is not listed (OVERNIGHT.md §2).

| play/assets file | source (octomancer-unity/) | owner |
|---|---|---|
| `assets/tiles/tile-0.webp` (unused as of round-7 fix pass -- walls now fill/stroke one traced-and-smoothed outline per chunk instead of per-tile art, render.js's `traceWallOutlines`) | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\0.png` | Milan Švancara |
| `assets/tiles/tile-1.webp` (unused as of round-7 fix pass -- walls now fill/stroke one traced-and-smoothed outline per chunk instead of per-tile art, render.js's `traceWallOutlines`) | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\1.png` | Milan Švancara |
| `assets/tiles/tile-2-2.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\2-2.png` | Milan Švancara |
| `assets/tiles/tile-2-3.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\2-3.png` | Milan Švancara |
| `assets/tiles/tile-2-4.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\2-4.png` | Milan Švancara |
| `assets/tiles/tile-2.webp` (unused as of round-7 fix pass -- walls now fill/stroke one traced-and-smoothed outline per chunk instead of per-tile art, render.js's `traceWallOutlines`) | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\2.png` | Milan Švancara |
| `assets/tiles/tile-2A.webp` (unused as of round-7 fix pass -- walls now fill/stroke one traced-and-smoothed outline per chunk instead of per-tile art, render.js's `traceWallOutlines`) | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\2A.png` | Milan Švancara |
| `assets/tiles/tile-3-2.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\3-2.png` | Milan Švancara |
| `assets/tiles/tile-3.webp` (unused as of round-7 fix pass -- walls now fill/stroke one traced-and-smoothed outline per chunk instead of per-tile art, render.js's `traceWallOutlines`) | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\3.png` | Milan Švancara |
| `assets/tiles/tile-4-2.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\4-2.png` | Milan Švancara |
| `assets/tiles/tile-4-3.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\4-3.png` | Milan Švancara |
| `assets/tiles/tile-4-4.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\4-4.png` | Milan Švancara |
| `assets/tiles/tile-4-5.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\4-5.png` | Milan Švancara |
| `assets/tiles/tile-4.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\4.png` | Milan Švancara |
| `assets/tiles/tile-5.webp` (unused as of round-7 fix pass -- walls now fill/stroke one traced-and-smoothed outline per chunk instead of per-tile art, render.js's `traceWallOutlines`) | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\5.png` | Milan Švancara |
| `assets/tiles/tile-6.webp` | `octomancer-unity\Assets\Sprites\Tiles\TilesetMilan\6.png` | Milan Švancara |
| `assets/bg-cave.webp` | `site/img/octomancer/cave-bg.webp` (already shipped on the title screen; itself sourced from `octomancer-unity\Assets\Sprites\Background\` per `octomancer-web/harvest/MANIFEST.md`, bucket A). Visual pass (this session): replaces `bg-far.webp` (removed), which was BGFar.png tiled every 40 world units — too bright/saturated and showed a stippled circle-pattern texture plus a visible seam at the tile boundary. Drawn once in world space near the surface instead of tiled, so Start Game's zoom also lands on the same art. | Milan Švancara |
| `assets/plant1.webp` | `octomancer-unity\Assets\Sprites\Background\Plant1.png` | Milan Švancara |
| `assets/plant2.webp` | `octomancer-unity\Assets\Sprites\Background\Plant2.png` | Milan Švancara |
| `assets/foliage.webp` (round 46, one 512x378 sheet, cells in `play/data/foliage.json` "art", built by `tools/export_foliage.py`) | FGFoliageTiles plants `Assets\Sprites\NPCs\{Plant5,Plant8_2,Plant9,Plant24,Plant12,Plant13,uNPC25,Plant7Tint}.png`, `Assets\Sprites\Animations\Plant26Animation\Plant26Animation_character_img.png`, the Greenranha fish (top band of `Assets\Sprites\Animations\Greeranha\GreeranhaAnimation_character_img.png`); BGFoliage `Assets\Sprites\NPCs\{uNPC23,uNPC23Solo}.png`, `Assets\Sprites\NPCs\Greyscaled\uNPC20.png` (its prefab tint baked in) | Milan Švancara |
| `assets/foliage.webp` (same sheet) | `Assets\Sprites\Runes\Rune1-6.png` | Daniel Necesal (bucket D, kept) |
| `assets/bubble-bubble3.webp` | `octomancer-unity\Assets\Sprites\Elements (Bubbles, flames...)\Bubble3.png` | Milan Švancara |
| `assets/bubble-bubblepop.webp` | `octomancer-unity\Assets\Sprites\Elements (Bubbles, flames...)\BubblePop.png` | Milan Švancara |
| `assets/bubble-bubblesingle.webp` | `octomancer-unity\Assets\Sprites\Elements (Bubbles, flames...)\BubbleSingle.png` | Milan Švancara |
| `assets/bubble-bubblestream.webp` | `octomancer-unity\Assets\Sprites\Elements (Bubbles, flames...)\BubbleStream.png` | Milan Švancara |
| `assets/shell-blue.webp` | `octomancer-unity\Assets\Sprites\Gems\SymbolBlue.png` | Milan Švancara |
| `assets/shell-green.webp` | `octomancer-unity\Assets\Sprites\Gems\SymbolGreen.png` | Milan Švancara |
| `assets/shell-red.webp` | `octomancer-unity\Assets\Sprites\Gems\SymbolRed.png` | Milan Švancara |
| `assets/ui-heart.webp` | `octomancer-unity\Assets\Sprites\UI\Heart.png` | Milan Švancara |
| `assets/octopus.webp` | Baked by `web/tools/bake_creature.py` from `octomancer-unity\Assets\Sprites\Animations\Octopus\OctoRemasteredExport_character_data.creature_pack.bytes` (deformed mesh per clip keyframe) warped against `octomancer-unity\Assets\Sprites\Animations\Octopus\OctoRemasteredExport2_character_img.png` (body triangles + eye-state rects, all from the same atlas). Track B, OVERNIGHT.md §2/§3, DECISIONS §4. | Milan Švancara (bake tool: this session) |
| `assets/octopus.json` | Generated by the same bake (cell layout, clip frame ranges, per-frame per-eye centroid/angle/scale anchors). No original art of its own. | this session |

| `assets/enemy-urchin.webp` | `octomancer-unity\Assets\Sprites\NPCs\NPC25.png` | Milan Švancara |
| `assets/enemy-piranha.webp` | `octomancer-unity\Assets\Sprites\NPCs\NPC21.png` | Milan Švancara |
| `assets/enemy-cannon.webp` | `octomancer-unity\Assets\Sprites\NPCs\NPC30.png` | Milan Švancara |
| `assets/enemy-shot.webp` | `octomancer-unity\Assets\Sprites\NPCs\NPC32Ball.png` | Milan Švancara |
| `assets/enemy-beholder-0.webp` through `-5.webp` | `octomancer-unity\Assets\Sprites\NPCs\Beholder\Beholder_000{01,09,17,25,33,41}.png` (every 4th of the M0-3 harvest's every-2nd set, downscaled to 128px tall — `web/tools/export_m3_assets.py`) | Milan Švancara |
| `assets/enemy-crab-slow.webp` | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NPC.old\CrabFlatten.png` (cropped) | Milan Švancara |
| `assets/enemy-crab-fast.webp` | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NPC.old\CrabFlatten2.png` (cropped, the faster variant) | Milan Švancara |
| `assets/enemy-manta.webp` | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NPC.old\NPC10.png` (cropped) | Milan Švancara |
| `assets/enemy-manta-ball.webp` | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NPC.old\NPC10Ball.png` (cropped) | Milan Švancara |
| `assets/enemy-horns.webp` | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NPC.old\NPC6.png` (cropped; `NPC6_2` unused tonight) | Milan Švancara |

| `assets/critter-fish.webp` | `octomancer-unity\Assets\Sprites\NPCs\Critters\Critter1Fish\Critter1_character_img.png` (cropped, `web/tools/export_alive_assets.py`) | Milan Švancara |
| `assets/critter-jelly.webp` | `octomancer-unity\Assets\Sprites\NPCs\Critters\Critter4JellyFish\Critter4Export_character_img.png` (cropped) | Milan Švancara |
| `assets/critter-snail.webp` | `octomancer-unity\Assets\Sprites\NPCs\Critters\Critter5Snail\Critter5_character_img.png` (cropped) | Milan Švancara |
| `assets/decor-eye.webp` (unused as of round-6 fix pass) | `octomancer-unity\Assets\Sprites\Background\Eye.png` (cropped) | Milan Švancara |
| `assets/decor-eyeblue.webp` (unused as of round-6 fix pass) | `octomancer-unity\Assets\Sprites\Background\EyeBlue.png` (cropped) | Milan Švancara |
| `assets/decor-rune1.webp`, `-rune3.webp`, `-rune5.webp` | `octomancer-unity\Assets\Sprites\Runes\Rune{1,3,5}.png` (bucket D, kept; cropped) | Milan Švancara |
| `assets/decor-bush2.webp` | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NeutralPlants.old\Bush2.png` (bucket D, kept; cropped) | Milan Švancara |
| `assets/decor-bushmini.webp` (unused as of round-7 fix pass -- the source export itself is a soft, edgeless glow blob with no plant outline to preserve, not fixable by removing a draw-time filter) | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NeutralPlants.old\BushMini.png` (bucket D, kept; cropped) | Milan Švancara |

No noise, vignette, spikes or portal files are shipped as images: those are
code-drawn or excluded (OVERNIGHT.md §2, DECISIONS §1 Q1). The bomb, its fuse
spark, the explosion ring and debris particles are code-drawn (M3-3).

## Audio (`play/audio/`, track S)

| play/audio file | source (octomancer-unity/) | owner |
|---|---|---|
| `audio/medles.opus`, `audio/medles.mp3` | `octomancer-unity\Assets\Sounds\Mj 362 - Octopus Medles.mp3`, encoded by `web/tools/encode_music.py` (ffmpeg, libopus/libmp3lame, 96kbps) | Milan Švancara |
| `audio/flute.opus`, `audio/flute.mp3` | `octomancer-unity\Assets\Sounds\Svancara Strings - Flûte de forêt.wav`, encoded by `web/tools/encode_music.py` | Milan Švancara |
| `../data/rooms.json` (level data, at `play/data/`, not `play/assets/`: the 18 room bitmaps as plain JSON strings, rock/water/portal cells only, no image shipped) | `octomancer-unityAssetsSpritesTilemapWorldGenRooms0-15.png`, `Building.png`, `Pool.png`, exported by `octomancer-web/tools/export_rooms.py` | Milan Švancara (level art) |

`Mj -  312 Q.mp3` stays harvested-only, not shipped (DECISIONS §1 Q7).
Dash/hurt/bomb SFX are synthesised in code (`play/js/sfx.js`, plain
oscillators + filtered noise, no samples): nothing from `Sounds/Effects/` or
`Sounds/*.wav` library SFX ships.

## Generated v2 art (`play/img/v2/`, round 24, behind `?v2=1`)

All rows: **generated, Milan style**. Made with the openai-image-gen skill (`image.py edit`, model gpt-image-2, `-i` a contact sheet of Milan's sprites (`enemy-urchin`, `enemy-crab-slow`, `shell-blue`, ...) as the style reference, plus the game's own wall screenshot or cave backdrop where noted), quality medium, 11 images generated in total (limit 12). The API refused `--background transparent` for this model, so every sprite was generated on a flat magenta (#FF00FF) background and keyed to alpha in Pillow (`despill` on the soft edge), then cropped, resized and saved as webp. No text is baked into any image: words ("SHOP", "Journal", "Quests", the level name) are drawn by the code over the plain art.

| file | what | notes |
|---|---|---|
| `img/v2/shallows-rock.webp` | Shallows rock tile, 512 px = 9 world units | generated from the wall fill crop; made seamless with an offset cross-blend; drawn under the traced mint rim |
| `img/v2/shallows-far.webp` | backdrop layer 1, distant misty cave | multiplied over the water gradient, parallax 0.12, mirrored tiling |
| `img/v2/shallows-near.webp` | backdrop layer 2, nearer kelp / coral / root silhouettes (keyed) | multiplied, parallax 0.30, mirrored tiling |
| `img/v2/exit-ring.webp` | glowing portal ring lying on the floor | exit ring as is; the hub dive ring is the same file hue-rotated once on load |
| `img/v2/shop-keeper.webp` | hermit-crab shopkeeper | second generation, from the stall sheet as reference 2 |
| `img/v2/shop-sign.webp`, `shop-pedestal.webp`, `shop-counter.webp` | hanging sign, stone pedestal, counter strip (left cap, stretchable middle, right cap) | cut from one stall sheet (keeper, counter, 3 pedestals, sign) |
| ~~`img/v2/chest-closed.webp`, `chest-open.webp`~~ | treasure chest (removed in round 46: replaced by the giant clam in `sprites.webp`, Daniel's natural-fantasy rule) | |
| `img/v2/crack-vault.webp` | crack web over the rock of a sealed vault pocket | |
| `img/v2/crack-wall.webp` | tall crack for the tutorial bomb wall | repeated and flipped down the wall |
| `img/v2/hub-board.webp`, `hub-questsign.webp` | wall-mounted notice board and the quest signpost (with a painted "!") | one sheet, split |
| `img/v2/title-banner.webp` | ribbon behind the level title card | |
| `img/v2/item-goggles.webp` | Sea-glass Goggles (carried item): sea-glass lenses in kelp rims, braided kelp strap | buried-treasure round, 2026-10-07: one `edit` call (gpt-image-2, medium), `-i` a contact sheet of shell-blue, enemy-urchin, enemy-crab-slow, critter-snail, enemy-piranha, critter-jelly; magenta keyed by `octomancer-web/tools/export_goggles.py`, 192 px wide. Drawn by `items-draw.js drawItemIcon('goggles')` (HUD, shop pedestal, journal, rock silhouette) |

Image budget: rock 1, backdrops 2, ring 1, stall 1, keeper 1, chest 1, vault crack 1, wall crack 1, boards 1, banner 1 = 11 (all medium; no separate low drafts were made to stay under 12, the four failed `--background transparent` calls never reached the model).

## Sprite atlas (`play/img/v2/sprites.webp` + `play/js/sprite-atlas.js`, round 46 art pass)

One packed 1024 x 725 atlas (213 KB, decoded once by `js/sprites.js`), built by `octomancer-web/tools/export_r46_sprites.py` from
Milan's harvested art and from five generated sheets kept as sources in `octomancer-web/art-src/r46/`. Generated rows: made with the
openai-image-gen skill (`image.py edit`, gpt-image-2, quality medium, `-i` a contact sheet of Milan's sprites: piranha, crab, urchin,
Clamissaint, NPC20, cannon, FishGreen, NPC10, NPC26); the API refuses `--background transparent`, so each sheet was made on flat
magenta (#FF00FF) or green (#00FF00), keyed to alpha and despilled in the export tool. 5 images generated in total (no drafts).
Sized for DPR 2 at the game's desktop scale (144 device px per tile).

| atlas sprite | what | source | owner |
|---|---|---|---|
| `quill` | Quill the collector (sea-glass monocle drawn in code) | `harvest/Assets/Sprites/IntroScreen/OctoBG1.webp`, hue-rotated to purple, desaturated | Milan Švancara |
| `pip` | Pip, the caged critter | `harvest/Assets/Sprites/IntroScreen/FishGreen.webp` | Milan Švancara |
| `pipMama` | Pip's mother | `harvest/Assets/Sprites/IntroScreen/FishYellow.webp`, warmed to orange | Milan Švancara |
| `host` | the Challenge Pool host | `harvest/Assets/Sprites/IntroScreen/SeaHorse.webp` | Milan Švancara |
| `heart` | heart pickup | `harvest/D-kept/Assets/Sprites/UI/Heart.webp` | Milan Švancara |
| `heartcontainer` | heart container item | Milan's UI Heart inside his `Elements/BubbleSingle.webp`, composed by the tool | Milan Švancara |
| `marlo`, `marloWave`, `tank` | Marlo the diver standing / waving, his air tank | `art-src/r46/gen01-marlo.webp` | generated, Milan style |
| `clamShut`, `clamOpen`, `pot`, `clam`, `idol` | the giant clam (replaces the chest), amphora, scallop, the stone octopus idol (the relic) | `art-src/r46/gen02-loot.webp` | generated, Milan style |
| `cage`, `cageOpen`, `stone` | Pip's driftwood-and-bone cage whole / broken, the pool's rune stone (replaces the die) | `art-src/r46/gen03-cage.webp` | generated, Milan style |
| `flippers`, `lantern`, `magnet`, `bombbag` | item icons (the magnet is a lodestone, the lantern a snail shell, the bag woven kelp) | `art-src/r46/gen04-items.webp` | generated, Milan style |
| `eel`, `spines`, `vent`, `anemone` | electric eel, urchin-spine strip (spike wall), rock chimney (current jet), anemone cluster | `art-src/r46/gen05-hazards.webp` | generated, Milan style |

`img/journal/place-shop.webp`, `place-wreck.webp`, `place-pool.webp` were re-shot from the game in round 46 (no shop word, no chest, no die).
