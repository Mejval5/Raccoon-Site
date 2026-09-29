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
| `assets/enemy-mine.webp` | `octomancer-unity\OldAssets\Sprites\NPCs\NPC.old\Old\NPC.old\NPC8.png` (1000² canvas cropped to content, `web/tools/export_m6_assets.py`) | Milan Švancara |
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

`Mj -  312 Q.mp3` stays harvested-only, not shipped (DECISIONS §1 Q7).
Dash/hurt/bomb SFX are synthesised in code (`play/js/sfx.js`, plain
oscillators + filtered noise, no samples): nothing from `Sounds/Effects/` or
`Sounds/*.wav` library SFX ships.
