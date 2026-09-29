# Octomancer art sort

Straight from OVERNIGHT.md §2's art rule and DECISIONS-2026-09-29.md §2-3 (Q1,
Q2). No re-sorting from scratch: this is a restatement in one place, plus the
one-line reason for each bucket, for M0-3(a).

## Use (bucket A, confirmed by Daniel)

Milan's original game art, code and music. Paths under `octomancer-unity/`.

| Path | Reason |
|---|---|
| `Assets/Sprites/Tiles/TilesetMilan/` | Milan's wall-edge tileset; the cave walls. |
| `Assets/Sprites/Background/{BGFar,BGFar2,BGCombined,Eye,EyeBlue,EyeBlue2,Hole01,Hole02,Plant1,Plant2}.png` | Milan's background layers and plants. |
| `Assets/Sprites/Animations/Octopus/` (atlas + `creature_pack.bytes` + `.json`) | Milan's real octopus animation; baked offline only (track B), never a runtime mesh. |
| `Assets/Sprites/Animations/Plant{12,13,24,25,26,5,7,8,9}Animation/` | Milan's plant animation sheets. |
| `Assets/Sprites/Animations/Acidator/` | Milan's dropper enemy (M6 stretch). |
| `Assets/Sprites/Animations/Clamissaint/` | Milan's tentacle enemy (M6 stretch); every 2nd frame harvested. |
| `Assets/Sprites/NPCs/**` (NPC20-32 and their Balls, SidePiranha, Beholder frames, Critters) | Milan's enemy art. |
| `OldAssets/Sprites/NPCs/NPC.old/Old/NPC.old/` (crabs, `NPC6`/`NPC6_2` horns, `NPC8` mine, `NPC10` manta + `NPC10Ball`, `NPC11`) | Milan's 2021 creatures Daniel asked to bring back (M6). |
| `Assets/Sprites/Elements (Bubbles…)` Bubble\*, Whirlpool | Milan's bubble/vent art. |
| `Assets/Sprites/Gems/Symbol{Blue,Green,Red}` | Milan's rare-shell treasure symbols. |
| `Assets/Sprites/IntroScreen/`, `Assets/Sprites/Misc/loadingScreen.jpeg` | Milan's title/loading art (reference for M5). |
| `site/img/octomancer/**` | Already web-ready site art from the same source. |

## Also usable (bucket D, kept by Daniel; DECISIONS §3, 41 files)

Provenance confirmed by Daniel from the contact sheet as original game art.

| Path | Reason |
|---|---|
| `Assets/Sprites/UI/{Heart,Shell,O2,Score,Options,Repeat,"Repeat 1",Back,"Back 1",Edit,Attack,Attack2,Plant1,Plant2,"Refresh copy",XThick,XThin,uNPC26}.png` | Milan's HUD/menu icons, kept. |
| `Assets/Sprites/UI/AttackRewards/{Selector,WhiteWheel}.png` | Kept UI art. |
| `Assets/Sprites/Runes/Rune1-6.png` | Kept, usable as rune/treasure dressing. |
| `Assets/Sprites/CampaignMap/{TokenBlue,TokenGrey,Trench1}.png` | Kept, original art. |
| `Assets/Sprites/Misc/Hands.PNG` | Kept. |
| `OldAssets/Sprites/Background/{LightRays,WhiteTop}.png` | Kept 2021 background layers (LightRays usable for Beholder dread juice, M7). |
| `OldAssets/Sprites/NPCs/NPC.old/Old/NeutralPlants.old/{Bush2,Bush5,BushMini,Plant1}.png` + `Animations/Bush1.CreaExport/Bush1_character_img.png` | Kept 2021 bushes/plants. |
| `OldAssets/Sprites/Old/old.UI/{StaminaBar,button1}.png` | Kept UI art. |
| `OldAssets/Sprites/Old/old.UI/menu.png` | Kept art, but **never show its text** (crude joke line baked into the image). |
| `OldAssets/Sprites/118174937_328766718316661_572932149976816982_n.png` | Kept, original art (social/misc asset). |

## Never

| Path / pattern | Reason |
|---|---|
| The 36 bucket-D files Daniel cut (Sigils, Splat, `Misc/Bomb*`, Hand 1-3, Skull, Wood, Shark, every `Portal/**` image, `Traps/LavaPool.png`, `Traps/spikes.png`, `UI/Pearl.png` + 7 other UI icons) | Daniel reviewed and rejected: not original game art or not wanted. |
| The 38 unseen bucket-D files | Daniel has not reviewed them; skip until he does (D2). |
| `Background/OverlayNoise.jpg` | iStock photo (Getty licence URL in its XMP) — third-party, paid. |
| `Background/Stripes.jpg` | Microstock vector (IPTC keywords) — third-party. |
| `Sprites/Portal/**` | Nebula renders, third-party. |
| `Traps/spikes.png` | 3D render, third-party; spikes are Milan's `NPC6` horns or code instead. |
| Daniel's own additions (ice, electro rock + its eye, buttons, gates, pushable/debug tiles, `coin`/`Coin`/`GoldMist`, generated vignettes/UI shapes, dice) | Not Milan's art; the design intentionally drops these systems. |
| Paid/third-party packs (`GUI PRO Kit`, `Andtech`, `Effects/**`, `Plugins/**`, Joystick Pack, the three Kenney UI files, `Fonts/Orange Juice.otf`, `Bg_template.jpg`) | Licensed to the original project, not to the web port; never even as redraw reference. |
| Any `Sounds/` file other than the two encoded tracks (Medles in play, Flûte on game-over/pause) | Unknown or library-licensed audio; SFX are synthesised in code instead. |

## Drawn in code (Milan's palette, sampled from his tiles/background)

Noise, caustics, vignette, bomb, pearls, plankton, explosion, particles. Spikes:
Milan's `NPC6` horns where an enemy is needed, otherwise code.

## Credit

"Art & music: Milan Švancara" on the pause and game-over overlays and in
`octomancer-web/CREDITS.md`.
