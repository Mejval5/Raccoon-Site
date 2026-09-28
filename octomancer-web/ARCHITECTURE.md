# Octomancer web port: architecture

Owner: Beaver (tech lead). Status: **v2, pure HTML/JS rewrite**, waiting for Daniel on §8. Paths are relative to `octomancer-unity/Assets/` unless they start with `site/`, `octomancer-web/` or `ProjectSettings/`.
**Rejected: Unity WebGL (former option A). Daniel decided on 2026-09-28 that no Unity stays in the stack.** `PLAN.md` and `CEO-REVIEW.md` describe that rejected approach and need to be redone.

## 1. What the original is (the reference we port from)

- **This is the single-player spin-off** `com.brotagonists.octomancer.octopus.adventure` (2023). It is not the 2021 multiplayer game on the archive page, whose code is not in the repo. There is one scene, `Scenes/MainGame.unity`. There is no backend: the only Firebase call is commented out (`Scripts/Tutorial/LevelManager.cs:184,196`). The save is local JSON (`Scripts/DataScripts/LocalUser.cs`).
- **Flow** (`Scripts/Tutorial/LevelManager.cs:66-73`, one save int `TutorialLevel`):
  1. 11 tutorial levels (`Prefabs/Levels/Levels/TutorialLevels.asset`)
  2. Game Hub (`Game_Hub.prefab`)
  3. Endless procedural levels
  Death in the endless mode shows Restart or Home (`RestartGame`/`GoHome`, `:115-130`). 4% of levels with `CanBeDark` are dark (`:85`).
- **Levels are pixel maps, so they are easy to port.** A pixel with max channel ≤ 0.2 is a breakable wall tile. Padding outside the map is unbreakable (`Scripts/Map/TilemapLevelBuilder.cs:95-118`).
  - Tutorial shapes: `Sprites/Tilemap/Levels/Level01-12.png`, 10x16 px each.
  - Hub: `Sprites/Tilemap/GameHub/Main.png`, 20x32 px.
  - Endless: 18 room PNGs in `Sprites/Tilemap/WorldGen/Rooms/` (10x16 px) are rotated, matched by edge, walked into a 3x3 grid (`Scripts/Map/ProceduralMapBuilder.cs:36-50, 420-485`) and checked with A*. The result is a 30x48 map.
  - Traps and pickups are placed by 3x3-ish mask PNGs (`Sprites/MatchingPatterns/*.png`, `Scripts/Map/FoliageGeneration/PatternGenerator.cs`), with safe radii around start and exit (`EnemyGenerator.cs`). Spawn rules live in `ScriptableObjects/ProceduralSpawnRules/LevelAll/`:
    - 7 enemies: Cannon, CannonAngle, ElectroRock, Piranha, Slapper, SpikeTrap, Urchin
    - 11 pickups/props: Pearl ×3 colours, Gold, GoldPile, WallGold…, WallBombBag, BeholderJar, LavaPool, Shop
  - The Perlin noise the generators use is roughly 40 lines of fbm (`Shaders/My shaders/Compute Shader/PerlinComputeShader.compute`). It ports to JS directly.
- **Tutorial contents** (prefab instances per level, from the YAML):

  | Level | Contents |
  |---|---|
  | L0 | Timeline intro only |
  | L1 | Pearls, hand hints |
  | L2 | Ice walls, CanonPig, maze |
  | L3 | Urchins, CanonPig |
  | L4–L6 | Ice walls, cannons, urchins |
  | L5_1 | Shop, pearl colours |
  | L7 | Muscle |
  | L8 | Tentacle, Piranha |
  | L9–L10 | PushableBlock, GameButton, Cable, Gate |

  Timeline cinematics: `Level0/1/5.playable`.
- **Movement is simple, tunable maths, not heavy physics.**
  - The octopus is a `Rigidbody2D`: mass 1, linear drag 0.5, gravity scale 1 at −9.81, one `CircleCollider2D` r = 0.4 (`Prefabs/Player/*.prefab:20040-20066`). It runs at a 50 Hz fixed step (`ProjectSettings/TimeManager.asset`).
  - Swimming (`Scripts/Player/SquidMovementScript.cs:98-117`) is a speed-capped steering impulse. Its numbers come from `ScriptableObjects/Player/Variables/Octopus Movement/SquidSettings.asset`: push 80, maxSpeed 6, turn 450°/s, turnDelay 0.5, rest-rotate 10, joystick curve `j·|j|^0.5/2`.
  - Rotation is set by code, not by physics.
  - Dash = impulse 20 along facing (`MainGame.unity:39526`).
  - Attack = front/back hitboxes, damage 4, 0.75 s (`Scripts/Player/PlayerAttack.cs`).
  - Bomb = 4 s fuse, range 2, damage 4 (`Scripts/Player/Bomb.cs`). It breaks tiles and gold.
  - Beholder = straight-line chaser (`Scripts/Player/EyeChaser.cs`, 32 lines). It spawns after 120 s (`ScriptableObjects/Game/SeerTime.asset`).
- **Camera** (`Scripts/Camera/CameraPos.cs:108-147`): shows at least 18×24 world units minus padding, whichever is larger for the aspect, and is clamped to the map. **This already solves desktop framing.** Landscape shows more width, with no pillarbox.
- **Controls in HEAD** are keyboard only (`Scripts/GameManagers/PCInputSimulator.cs`, `InputManager.asset`):

  | Action | Keys |
  |---|---|
  | Move | arrows / WASD |
  | Attack | X / PgUp |
  | Dash | Z / Enter |
  | Bomb | `\` / Space |
  | Grab | LShift / PgDn |

  No touch input is wired into the scene (the Joystick Pack is unused).
- **The octopus and the plants are Creature (Kestrel Moon) mesh animations, not sprite sheets.**
  - Octopus: `Sprites/Animations/Octopus/OctoRemasteredExport_character_data.json` has 267 points, 400 triangles, 18 bones and 18 clips (`Swim05`, `Idle`, `IdleBlink`…), on a 1000² atlas of 61 KB.
  - The same format is used for 9 animated plants and 2 critters.
  - The art and the animation data are ours. The runtime (`Plugins/CreaturePack`) is not.

## 2. v1 scope: "a small game" that is still Octomancer

The identity is the physics swim, the breakable cave, pearls, the portal and the endless descent with the Beholder behind you. v1 keeps exactly that and cuts everything that needs a subsystem of its own.

**v1 (ships):**
- **Octopus.** A one-to-one port of the swim, rotate, dash and attack maths above, with the same numbers. Bomb with tile breaking. Hearts, hurt knockback and death.
- **Tutorial, 4 levels.** Built from `Level01-04.png` and the positions in `TutorialLevel_1..4.prefab`. They teach move and collect, attack an ice wall, avoid an urchin, and dodge a cannon. Hand hints are drawn in code. No Timeline intro.
- **Endless mode.**
  - A straight port of the room stitcher, A* check, pattern placement and Perlin foliage, using the 18 room PNGs and the mask PNGs.
  - Depth counter, portal to the next level, Beholder after 120 s.
  - Death screen with Restart or Exit.
- **Enemies and traps, 5:**
  - SeaUrchin (static)
  - SpikeTrap (static, timed)
  - CanonPig/Cannon with the angled variant and projectile
  - Piranha (patrol and chase)
  - IceWall (breakable block)
- **Pickups:** Pearl (3 colours) and Gold/GoldPile, which bombs crack (`Scripts/Items/GoldLogic.cs:73-90`).
- **UI.** A HUD (hearts, pearls, bombs, depth) and a pause menu (Resume / Restart / Exit), all HTML/CSS over the canvas.
- **Save.** Tutorial step, best depth, total pearls, mute.
- **Audio.** One music track and about 10 SFX.

**Later (in the order I'd take it):**
1. Dark levels. A radial darkness overlay is cheap and replaces SmartLighting2D.
2. Shop and the 4 items: Compass, Shield, Heart, BombBag (`Scripts/Campaign/ShopLogic.cs`, prices 250–1000 in `ScriptableObjects/Items/Buyable/`). This includes the pearl economy between runs and the Game Hub as a level.
3. ElectroRock, Slapper/Tentacle, Muscle, Dropper, CrushBlock, BubblePusher.
4. Grab/throw (`Scripts/Player/CarryItemLogic.cs`), PushableBlock, GameButton, Cable and Gate, which gives tutorial L9–L10.
5. Tutorial L5–L8, L5_1 and the L0 intro as a scripted sequence.
6. Liquids: health, lava and oil drops, lava pool (Water2D metaballs), redone as blurred-circle blobs.
7. Animated plants and critters (the Creature bake from §3). Gamepad.

**Iterations for 4 devs:**
- **I1:** loop, input with touch, tiles and collision, swim port, camera, octopus sprite.
- **I2:** tutorial 1–4, attack, pickups, HUD, save.
- **I3:** endless generator, the 5 traps, bombs, Beholder, death screen.
- **I4:** title handover, audio, asset pass, perf pass on phones.

## 3. Tech stack (no build step)

- **Language.** Vanilla ES modules served as-is: `<script type="module">`, relative imports, no bundler, no transpile, no npm at runtime. Target the evergreen browsers of the last 2 years: Chrome, Safari 16.4+, Firefox. JSDoc types, no TypeScript.
- **Renderer: Canvas 2D, no library.**
  - Why: v1 draws one cached tile layer, about 50–100 sprites and ≤ 300 particles. Canvas 2D does that well on phones. It is also what the title screen already uses, and it brings no 200 KB dependency or WebGL context-loss handling.
  - Walls use the tilemap-shader look (a rock texture seen through the wall mask, `Shaders/My shaders/Map/SquidTilemap.shader`). They are pre-composited once per level into offscreen canvases in 512-px chunks, masked with `source-in`, with a slowly scrolling noise overlay.
  - Everything draws through one `render/` module.
  - **Escape hatch:** if the mid-range phone misses the budget in §7 after chunk caching, swap `render/` for PixiJS v8 as one pinned, vendored ESM file (`vendor/pixi-8.x.min.mjs`). No CDN at runtime, so a CDN outage can't break the game.
- **Physics: our own, about 300 lines. No Box2D and no Planck.js.**
  - We need a semi-implicit Euler integrator with Box2D's drag (`v *= 1/(1+dt·drag)`), gravity and impulses (`v += J/m`). That is enough to port `SquidMovementScript.Move()` line by line with the same numbers.
  - Collisions:
    - circle against the tile grid: push out along the contact normal and remove the normal velocity, restitution 0 as in Box2D's default
    - circle/AABB overlap tests for hitboxes, triggers, pickups and projectiles
    - an AABB-against-grid mover for piranhas and bombs
  - Nothing in v1 needs stacking, joints or rotation dynamics. PushableBlock (later) is an AABB mover pushed by the player.
- **Loop.**
  - `requestAnimationFrame` with a fixed 50 Hz accumulator (dt = 0.02, the original's step, so the tuning holds), at most 5 steps per frame.
  - Render interpolates between the previous and current state, so 60/120 Hz screens don't judder.
  - Pause on `visibilitychange` and on blur. Clamp long frames.
- **Input.** `input.js` exposes per-step state: `move` (a vector, |v| ≤ 1) and `attack`/`dash`/`bomb`/`grab` with pressed/held/released. Gameplay never touches a DOM event.
  - **Keyboard:** the table in §1, plus Escape = pause.
  - **Touch** (Pointer Events, `touch-action:none`, multi-touch):
    - a floating joystick on the left half: its origin is the first touch, its radius about 12 mm
    - Attack and Dash buttons bottom-right, Bomb above them
    - on-screen controls appear on the first touch and hide on a key press
  - **Mouse:** menus only.
  - **Gamepad:** later, as the same interface.
  - The joystick is analog and goes through the original `j·|j|^0.5/2` curve. Keyboard diagonals are normalised to 1 *(verify what `Input.GetAxis` gave in the original)*.
- **Audio.**
  - Web Audio. One `AudioContext` is created or resumed inside the Start Game click, which unlocks iOS with no extra tap.
  - SFX are decoded `AudioBuffer`s through one gain bus. Music is an `<audio>` element (streamed, looped) routed through the same context.
  - Format: mp3 (everywhere). Mute is saved.
- **Saves.** `localStorage["octomancer.save.v1"]`, JSON with `{v:1, tutorialStep, bestDepth, pearls, muted}`. Every access is wrapped in try/catch, with an in-memory fallback (private mode, blocked storage). There is a `v` field for migrations.

## 4. Repo layout

- **Now.** The submodule `octomancer-unity/` (repo root, outside `site/`) stays on `main` as the **read-only Unity reference**.
- **The game lives on a new orphan branch `web` in `Mejval5/Octomancer`.** Orphan means its history shares no objects with `main`, so the paid files are never in that branch.
  - It is mounted into the site as a **second submodule** of the same repo at `site/octomancer/play/`, with `branch = web`.
  - Devs commit the game there. The site repo only bumps the pointer.
  - The existing `raccoon-site` launch config serves `site/`, so the game runs at `/octomancer/play/` with no copy step.
  - The web branch tree is exactly what ships:
    - `index.html`, the standalone page
    - `js/` (`main.js` exports `mount`/`destroy`, then `game/`, `render/`, `physics/`, `input/`, `audio/`, `ui/`)
    - `assets/`, containing web-ready art, audio and `levels/*.json`
    - `LICENSE` and `CREDITS.md`
- **Tools and provenance stay in the site repo**, not in the deployed tree:
  - `octomancer-web/tools/` holds the Python/Pillow exporters: level PNG + prefab YAML → JSON, allowlisted sprites → resized WebP atlases, and the Creature JSON → baked sprite frames.
  - `octomancer-web/ASSETS.md` lists every exported file with its source path and owner.
  - Exporters read only paths listed in `ASSETS.md`.
- **Reading the Unity code:**
  - open `octomancer-unity/` directly
  - or run `git -C site/octomancer/play show main:Assets/Scripts/Player/SquidMovementScript.cs` (same repo, other branch)
  - Nobody checks out `main` under `site/`.
- **Deploy guard.** Three layers:
  1. The Firebase `hosting.ignore` already drops `**/.*`, which covers the submodule's `.git` file.
  2. Add `"**/*.meta"`, `"**/*.cs"`, `"**/*.unity"`, `"**/*.prefab"`, `"**/*.asset"`, `"**/Assets/**"`.
  3. Add a `hosting.predeploy` check that fails the deploy if any of those exist under `site/`, or if `site/octomancer/play` is not on `web`. A silent ignore would hide a wrong checkout.
- **End state:**
  - Remove the `octomancer-unity` submodule from the site repo.
  - In `Mejval5/Octomancer`, rename `main` → `unity-archive`, make `web` the default branch, and optionally rename it to `main`.
  - **The paid packages stay in that repo's history on `unity-archive`, so the repo must stay private.** If Daniel ever wants the game repo public, push only the orphan `web` branch to a fresh repo. That is clean because the branch shares no history.

## 5. Asset rules (hard)

**Only art and audio Daniel or Milan made may leave the private repo.** Everything else is redrawn, written in code, or replaced with CC0/OFL. Any file not listed in `ASSETS.md` does not ship.

| Folder | Status | v1 use |
|---|---|---|
| `Sprites/Animations/Octopus`, `Sprites/Tiles/TilesetMilan`, `Sprites/Tilemap/**`, `Sprites/Traps`, `Sprites/Animations/{Piranha,Canon,Traps,Projectiles}`, `Sprites/NPCs` (incl. Beholder, Critters art), `Sprites/Portal`, `Sprites/Background`, `Sprites/Elements (Bubbles…)`, `Sprites/Gems`, `Sprites/MatchingPatterns`, `Sprites/Misc` (Bomb, coin) | Milan / Daniel *(Milan confirms the list)* | Export, resized to display size, as WebP |
| `Sprites/UI` (Heart, Pearl, Coin…) | Probably Milan, **mixed with kit derivatives** *(verify each file)* | Only files confirmed, otherwise CSS/SVG |
| `Sprites/GUI PRO Kit - Casual Game` (245 MB) | Paid, third party | None. UI is HTML/CSS |
| `Effects/JMO Assets` (Cartoon FX), `Effects/EffectExamples` (Unity Particle Pack), `Effects/msVFX_Free Smoke…`, `Sprites/Andtech` (Star Pack) | Third party | None. Hit, break, explosion, bubbles and shine become code particles |
| `Plugins/CreaturePack` (runtime), `Plugins/Water2D` + `Scripts/Water2D`, `Plugins/FunkyCode` (SmartLighting2D), `Plugins/TrueShadow`, `Plugins/Sirenix` (Odin), `Plugins/Demigiant`/`DOTween` (Pro), `Plugins/QHierarchy`, `Prefabs/Joystick Pack` | Third-party code, paid or licensed | None. We reimplement, and we read Creature data with our own baker |
| `Fonts/Orange Juice.otf` | Personal-use licence | None → Google Fonts |
| `Fonts/Cookie.ttf`, `NotoSansJP` | OFL | Via Google Fonts, not the files |
| `Fonts/consola.ttf` | Microsoft | None |
| `Sounds/Effects/*`, `Sounds/Click/*`, `Sounds/ESM_*` | **Unknown or third party.** Library packs and clips of unclear provenance; none can ship. | None. v1 SFX are a small Web Audio synth in code plus CC0 (Kenney) credited in `CREDITS.md` |
| `Sounds/Mj 362 - Octopus Medles.mp3`, `Mj - 312 Q.mp3`, `Svancara Strings - Flûte de forêt.wav` | Probably own compositions *(Daniel confirms)* | Music, re-encoded to ~96 kbps mp3 |

The octopus and plants are exported by baking Creature clips into sprite frames with our own Python baker. It reads the mesh, skinning and per-frame data from the JSON: Milan's data, none of Kestrel Moon's code. Fallback if the baker overruns 2 days: a static octopus sprite with code-driven squash and tentacle wobble.

## 6. Handover from the title screen

**Same page, dynamic import. No iframe and no navigation.**
1. Start Game becomes a `<button>`.
2. `pointerdown` starts `import('/octomancer/play/js/main.js')` and level-1 asset fetches. The click then creates the `AudioContext` and zooms the title canvas into the light (about 1.2 s, reduced motion: 0.3 s fade).
3. `mount(container, {audioContext, onExit})` builds the level during the zoom, and the game canvas fades in over it.
4. `history.pushState({octo:'play'})`, so the browser/Android back button and in-game Exit both call `onExit`.
5. `onExit` reverses the zoom, then calls `destroy()`. `destroy()` stops the loop, removes every listener, closes audio and releases the canvases. A dev check asserts no listeners remain.
6. While the game is mounted, the title page's Escape→`/` handler is off. Escape pauses the game instead.

`/octomancer/play/index.html` mounts the same module standalone, for dev and direct links.

Why not the iframe I recommended for Unity:
- The reasons were Unity's wasm heap and its global key capture. Neither applies now.
- An iframe would also lose the iOS audio unlock from the Start tap.
- Navigation would break the continuous zoom.

## 7. Performance and cross-platform budget

- **First playable after Start:** ≤ 1.5 MB transferred. That is JS, the level-1 atlas and SFX (JS is served raw; Firebase compresses text).
- **Full v1:** ≤ 5 MB. Music streams and is not in the first-playable number.
- **Nothing downloads before Start.** Warming on hover/pointerdown is allowed.
- **Frame, mid-range phone** (Pixel 6a / Galaxy A5x class):
  - 60 fps target, median frame ≤ 16.7 ms, p95 ≤ 25 ms
  - sim ≤ 2 ms per 50 Hz step, render ≤ 8 ms
  - desktop: ≥ 60 fps at DPR 2
  - no per-frame allocation in the hot loop: pools for particles and projectiles
- **DPR:** backing store = CSS size × min(DPR, 2) on desktop and × min(DPR, 1.5) on touch devices. Dynamic step-down to 1.0 if the median frame is > 20 ms over 2 s. Walls are cached per DPR and re-cached on resize.
- **Orientation:** no lock and no rotate prompt. The `CameraPos` rule (min 18×24 world units) gives portrait phones the original view and landscape/desktop a wider one. Safe-area insets for the HUD and touch buttons. `100dvh`, no page scroll or pinch zoom while the game is mounted.
- **Measured with** a `?fps=1` overlay (median, p95, draw calls) in the Chromium pane at 375×812 and 1920×1080. Real Android, iPhone and Firefox are run by Daniel at each gate.

## 8. Decisions still for Daniel

| # | Decision | Recommended default |
|---|---|---|
| 1 | Approve the v1 scope in §2 (4 tutorial levels, endless, 5 traps, no shop, hub, liquids or dark levels) | Yes. The shop and dark levels come first after v1 |
| 2 | Create the orphan branch `web` in `Mejval5/Octomancer` and allow pushes to it, plus the second submodule at `site/octomancer/play/` | Yes. Daniel pushes the first empty commit, devs work locally until then |
| 3 | Asset ownership: Milan confirms the "Milan/Daniel" rows in §5 and his OK for web use; Daniel confirms the three music files are his | Ask Milan this week. Until then, devs use placeholder shapes, which doesn't block I1–I2 |
| 4 | SFX source | Code-synth plus Kenney CC0. Original SFX only where provenance is proven |
| 5 | UI font | The site's Quicksand plus one Google display face for titles, for example Fredoka *(Daniel picks)* |
| 6 | Deploy guard (`hosting.ignore` + predeploy check) in `firebase.json` | Yes |
| 7 | Title and archive copy: the meta/OG text says Start Game launches "the archived 2021" game (`site/octomancer/index.html:7-9`) | One honest line: "a small web remake of Octomancer: Octopus Adventure" |
