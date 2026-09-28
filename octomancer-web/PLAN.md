# Octomancer web port: plan

Owner: Otto (PM). Status: **v2 draft, pure HTML/CSS/JS rewrite. Waiting for Wren's validation; no dev work starts before it.** Based on `ARCHITECTURE.md` v2 (Ines). The Unity-spike plan and its CEO review are superseded; Wren's process points are kept where they still apply.
Status words mean exactly this: *todo*, *in progress*, *blocked*, *done, verified*. Unity paths are relative to `octomancer-unity/Assets/`; `play/` means `site/octomancer/play/`.

> **For Ines before I1 starts (found while writing tasks).** ARCHITECTURE §1 quotes the octopus body as mass 1, drag 0.5, gravity scale 1 and a circle of r = 0.4. Those are the **Bomb's** values (`Prefabs/Player/Bomb.prefab:20040-20066`). The octopus is in `Scenes/MainGame.unity`: its Rigidbody2D (`:39451`) has mass **2**, linear drag **2**, gravity scale **0.01**, frozen rotation and continuous collision. Its collider (`:39472`) is a 20-point **PolygonCollider2D** with the "No Friction" material (friction 0, bounciness 0.01). Dash `PushOnceForce: 20` is at `:39526`. Keyboard input also differs from §3. `ProjectSettings/InputManager.asset` sets gravity 5, sensitivity 10 and snap 1, and `PCInputSimulator.cs:45` passes raw `GetAxis`, which is **not normalised**. A keyboard diagonal therefore pushes about 1.7× harder than a straight direction. Please confirm or correct §1/§3; I1-1 and I1-5 are written against the values above.

## 1. Goal and non-goals

**Goal.** A player opens raccoon.website/octomancer/ on a laptop or a normal phone and presses **Start Game**. The cave zooms into the light, and a few seconds later they are swimming the octopus in a small but real Octomancer: 4 tutorial levels, then the endless descent with the Beholder behind them. Keyboard and touch both work, progress is saved locally, and **Exit** zooms back out to the title.

**v1 = ARCHITECTURE §2:**
- the octopus (swim, rotate, dash, attack, bomb, hearts, hurt, death)
- tutorial levels 1-4
- endless mode (room stitcher, A*, pattern placement, Perlin foliage, depth, portal, Beholder after 120 s, death screen)
- 5 traps (SeaUrchin, SpikeTrap, CanonPig/Cannon + angled + projectile, Piranha, IceWall)
- Pearls ×3 and Gold/GoldPile
- HTML HUD and pause menu, local save, one music track and ~10 SFX

**Non-goals for v1:**
- Unity in any form.
- Shop, Game Hub, dark levels, liquids, grab/throw and its puzzles, tutorial L5-L10, the L0 intro.
- Animated plants and critters, gamepad.
- Tablets as a separate target, and PWA/offline.
- The 2021 multiplayer game, and any backend, accounts, ads, analytics or Play Games.

Everything cut here is listed in order in ARCHITECTURE §2 "Later".

## 2. Hard constraints

- **No Unity, no build step, no runtime dependency.** Vanilla ES modules served as-is. JSDoc, no TypeScript, no bundler, no npm at runtime.
  - Offline tools (Python + Pillow, already installed) live in `octomancer-web/tools/` and never ship.
  - PixiJS is only the ARCHITECTURE §3 escape hatch, and Ines must approve it.
- **`octomancer-unity/` is a read-only reference.**
  - Nobody opens it in Unity, edits it, switches its branch or bumps its pointer.
  - Nobody checks out `main` under `site/`.
- **Assets** (ARCHITECTURE §5):
  - Only art and audio made by Milan or Daniel is exported, and only files listed in `octomancer-web/ASSETS.md`. Exporters read only listed paths.
  - Never use a paid pack in any form: GUI PRO Kit, JMO, Unity Particle Pack, Star Pack, Joystick Pack, CreaturePack runtime, Water2D, SmartLighting2D.
  - No `Orange Juice.otf`; UI fonts come from Google Fonts.
  - SFX are synthesised in code or CC0 (Kenney), credited in `CREDITS.md`.
  - Nothing paid, and no `.cs/.meta/.unity/.prefab/.asset` file, is ever placed under `site/`. The deploy guard (M0-5) enforces this.
  - **Nothing under `play/` is deployed publicly until D6 (asset rights) is closed.**
- **Budgets** (measured with `?fps=1` and the network panel):

  | Budget | Target |
  |---|---|
  | Before Start | 0 bytes downloaded |
  | To playable | ≤ 1.5 MB transferred (JS, level-1 atlas, SFX) |
  | Total v1 | ≤ 5 MB; music streams and is excluded |
  | Frame on a mid-range phone | 60 fps median: frame ≤ 16.7 ms, p95 ≤ 25 ms; sim ≤ 2 ms per step, render ≤ 8 ms |
  | Frame work in the agent pane at 375x812 (no CPU throttle available) | ≤ 4 ms median, so a ~4× slower phone still fits 16.7 ms |
  | Desktop at DPR 2 | ≥ 60 fps |
  | Allocation | none per frame in the hot loop |

- **Time to play (named targets).**
  - From the title page: Start pressed → octopus under control ≤ **2.5 s** on Chrome "Fast 4G" and ≤ **6 s** on "Slow 4G". The 1.2 s zoom covers most of it.
  - Warm cache: ≤ **1 s** after the zoom ends.
  - Direct visit to `/octomancer/play/`: ≤ 3 s on Fast 4G.
  - How it is measured: `performance.mark('octo:start')` → `'octo:playable'`. Agents record transferred bytes plus the unthrottled time. Daniel does the throttled runs in real Chrome DevTools, because the pane cannot throttle.
- **Cross-platform matrix now:**

  | Who | Environment | Input | Viewports |
  |---|---|---|---|
  | Agents, every task | Chromium pane, desktop | mouse + keyboard | 1920x1080, 1366x768 |
  | Agents, every task | Chromium pane, mobile emulation | touch | 375x812 and 812x375 |
  | Daniel, at each iteration gate (~15 min checklist by Reef, over LAN `http://<PC-IP>:8080`) | real Android Chrome, iPhone Safari, Firefox desktop | as the device allows | as the device allows |

  - Daniel's run is reported, not gated, in M0. It is **gated from I1 on**.
  - The pane's emulated touch arrives as mouse-type pointer events. Multi-touch is therefore tested with synthetic `PointerEvent`s (`pointerType:'touch'`, two `pointerId`s) from `play/tests/touch-sim.js`. Real multi-touch is Daniel's.
- **Honest copy.**
  - Start Game stays a disabled `<span>` until I4.
  - `play/index.html` carries `noindex` until v1 ships.
  - The title's meta/OG text (`site/octomancer/index.html:7-9`, "the archived 2021…") is fixed in I4 to name the game Start actually launches (D9).
- **Process.**
  - Ines reviews every task before it counts as *done, verified*.
  - Nobody commits unless Otto asks.
  - Every task that touches the game states how it is checked on desktop **and** in mobile emulation.
  - Each ported system names its Unity source file in a comment at the top.

## 3. Milestones

| | Outcome | Exit criteria | Verified on desktop / mobile |
|---|---|---|---|
| **M0 Setup** (1 session) | `play/` exists as the game repo. A skeleton page runs a 50 Hz loop on a canvas with input stubs. The deploy guard is live. | `/octomancer/play/` loads with no console errors. The guard blocks a planted `.cs`. `destroy()` leaves 0 listeners. Pushing and the submodule are done or waiting only on D2. | Reef: 1920x1080 keyboard; 375x812 and 812x375 emulated |
| **I1 Swimming in a room** (the feel) | In the Level01 room, the octopus swims, turns, rests and dashes with the original maths. Real walls, camera follow, keyboard and touch. | Physics and swim tests green. Frame work ≤ 4 ms median at 375x812. ≤ 600 KB transferred. **Daniel's feel check**: side by side with his Windows build, "feels like Octomancer", or a short list of differences Ines accepts. | Keyboard at 1920x1080 and 1366x768. Emulated touch in both orientations plus synthetic multi-touch. Daniel on Android, iPhone and Firefox. |
| **I2 Tutorial 1-4** | A new player learns move, collect, attack, ice wall, urchin and cannon, then leaves each level through the portal. HUD, pause and save work. | All 4 levels finish on keyboard and on touch alone. Death and restart work. Reloading resumes at the right level. HUD and touch buttons clear the safe areas. | Same matrix, plus a reload test and pause on tab hide |
| **I3 Endless + Beholder** | After tutorial 4, endless levels are generated: all 5 traps, gold, bombs, depth counter, portal, Beholder at 120 s, death screen. | 200 generated seeds are all connected (A*) with safe start and exit radii. 10 minutes of play without errors. Budgets hold at depth 10+. | Same matrix; a 10-minute soak on Daniel's phones |
| **I4 Handover + perf + QA** | Start Game zooms into the game and Exit zooms back out. Audio, final assets and v1 is ready to ship. | ≤ 1.5 MB to playable and ≤ 5 MB total. The frame budget is met on Daniel's Android. Time-to-play targets are met. No "broken" bugs. D6 is closed. Wren approves. Daniel deploys. | Full matrix and Daniel's device run on a Firebase preview channel |

## 4. Tasks

### M0 setup (all *todo*)

| id | Task | Owner | Size | Deps | Acceptance + how verified |
|---|---|---|---|---|---|
| M0-1 | Create the game repo **locally**: `git init -b web site/octomancer/play`, with `.gitignore`, `LICENSE` (placeholder "All rights reserved", see D8), `CREDITS.md` and the folders `js/{game,render,physics,input,audio,ui}`, `assets/levels`, `tests`. It has no remote yet, so it is orphan by construction. | Tide | S | – | `git -C site/octomancer/play status` shows branch `web` with no parent history. `octomancer-unity/` is untouched (`git -C octomancer-unity status` is clean, still on `main`). |
| M0-2 | Skeleton page and loop. `play/index.html` has a full-viewport canvas, `100dvh`, `touch-action:none`, no scroll or pinch zoom, and `noindex`. `js/main.js` exports `mount(container,{audioContext,onExit})` and `destroy()`. `js/game/loop.js`: rAF with a fixed 0.02 s accumulator, at most 5 steps per frame, an interpolation alpha, long-frame clamp, and pause on `visibilitychange` and `blur`. `js/render/render.js`: backing store × min(DPR,2) on desktop and × min(DPR,1.5) on touch, re-sized on resize. A `?fps=1` overlay shows median, p95, steps per frame and sim/render ms. A dev listener counter backs the `destroy()` check. The demo is a ball bouncing in a box. | Tide | M | M0-1 | In the pane at 1920x1080 and 375x812 the ball moves smoothly and the overlay reads ~60 fps. Switching tabs pauses the loop (steps counter frozen). `mount → destroy → mount` three times leaves 0 listeners and 0 canvases (console check). No console errors. |
| M0-3 | Input layer stub `js/input/input.js`. Per-step state is `move {x,y}` plus `attack/dash/bomb/grab` with `pressed/held/released` flags and `pause`. The keyboard table from ARCHITECTURE §1 plus Esc = pause is wired. Touch and pointer are empty adapters with the final API. A `?debug=input` overlay shows the state. | Tide | S | M0-2 | Desktop: every key in the table shows in the overlay and `pressed` lasts exactly one step. Emulated mobile: the page loads and the stubs throw no errors. |
| M0-4 | `octomancer-web/ASSETS.md`: a table with columns exported file, source path, owner, confirmed (y/pending) and licence, empty rows plus the §5 folder statuses copied from ARCHITECTURE. Also `octomancer-web/tools/allowlist.py`, which reads ASSETS.md and refuses any source path not listed. | Coral | S | – | `python tools/allowlist.py <unlisted path>` exits 1 and a listed path exits 0. Ines reviews the columns. |
| M0-5 | Deploy guard **(needs D3)**. Add ARCHITECTURE §4's `hosting.ignore` patterns to `firebase.json`. Add a `hosting.predeploy` check `octomancer-web/tools/check_site.py` that fails if any `.cs/.meta/.unity/.prefab/.asset` file or `Assets/` folder exists under `site/`, or if the `play` checkout's HEAD tree contains `Assets/` or `ProjectSettings/`. It checks the tree because submodules sit on a detached HEAD, so a branch-name check would fail every time. | Tide | S | M0-1 | Planting `play/x.cs` makes the script exit 1. The clean tree exits 0. Nobody runs `firebase deploy`. |
| M0-6 | Publish the repo **(needs D2, Daniel runs or OKs each step)**. (a) `git -C site/octomancer/play remote add origin git@github.com:Mejval5/Octomancer.git`. (b) Daniel pushes `web`. (c) `git submodule add -b web git@github.com:Mejval5/Octomancer.git site/octomancer/play`, which reuses the existing repo, so nothing from `main` is fetched. Tide writes the exact commands; Daniel commits `.gitmodules`. | Tide + Daniel | S | M0-1, D2 | `git submodule status` lists two entries. `.gitmodules` has `branch = web`. `git -C site/octomancer/play ls-tree -r --name-only HEAD` shows only web files. **Until D2 the repo stays local and work is not blocked.** |
| M0-7 | M0 check. The matrix rows for agents. Title page unchanged. Guard test. Skeleton transfer size recorded. Daniel's device checklist written (LAN URL, what to open, what to report). | Reef | S | M0-2..5 | A short report in the task. Daniel's checklist is saved as `octomancer-web/DEVICE-CHECKLIST.md`. |

### I1 swimming in a room (all *todo*, starts after M0 is verified)

| id | Task | Owner | Size | Deps | Acceptance + how verified |
|---|---|---|---|---|---|
| I1-1 | Octopus constants in `js/game/octopus-config.js`, each with a source-line comment. Sources: Rigidbody2D `Scenes/MainGame.unity:39451`; PolygonCollider2D `:39472` (fit a circle, report the radius and the error against the polygon); `Materials/Physics/No Friction.physicsMaterial2D`; `ScriptableObjects/Player/Variables/Octopus Movement/SquidSettings.asset`; `PushOnceForce`/`LoseMovementPushFrames` `MainGame.unity:39525-39526`; `ProjectSettings/Physics2DSettings.asset` (g = −9.81); `ProjectSettings/TimeManager.asset` (0.02). | Pike | S | M0 | Ines signs off every number and the circle approximation (see the note at the top). |
| I1-2 | Level exporter `octomancer-web/tools/export_levels.py`. Read `Sprites/Tilemap/Levels/Level01-04.png` through the allowlist. A tile is a wall if its max channel ≤ 0.2; add a 1-tile unbreakable ring (`TilemapLevelBuilder.cs:85-118`, padding 1 and `DefaultOffset (5,8)` from `MainGame.unity:62368`). Flip y (Unity reads bottom-up). Write `play/assets/levels/tutorial-0N.json` as `{w,h,cell:1,tiles:[…]}` (0 empty, 1 breakable, 2 unbreakable). | Tide | S | M0-4 | Level01 gives 12x18 including padding. An ASCII dump matches the PNG side by side. A second run is byte-identical. Unlisted paths are refused. |
| I1-3 | Physics core in `js/physics/` (~300 lines). **Integrator:** semi-implicit Euler with Box2D drag `v *= 1/(1+dt·drag)`, gravity × scale, `impulse(J)` → `v += J/m`. **Circle vs tile grid:** push out along the normal, drop the normal velocity (restitution ≈ 0), keep the tangential velocity (friction 0). Sub-step when `|v|·dt > r/2`. **Circle/AABB overlap** helpers. No allocation per step. Box2D semantics only; no Unity file. | Pike | M | M0-2 | `play/tests/physics.html` runs in the pane and reports green on: free fall matches the analytic value within 1e-6; 1000 random shots at 30 u/s into walls never tunnel; sliding along a wall keeps the tangential speed; drag decay matches the formula. |
| I1-4 | Swim port `js/game/octopus.js`, a line-by-line port of `Scripts/Player/SquidMovementScript.cs:83-174`: `JoystickSwim` curve `j·|j|^0.5/2`, `Move` (acceleration cap `1-(v/max)^10`, perpendicular steering), `DesiredPushAngle`, `Rotate` (turn delay, rest rotate, ragdoll branch stubbed until I2), `RotateToDesiredAngle`. Dash from `PushOctopus` (`:40-48`). `Mathf.LerpAngle/DeltaAngle/Vector2.Angle` are ported exactly in `js/game/unity-math.js`. Draws a placeholder (circle plus facing arrow) until I1-9 lands. | Pike | M | I1-1, I1-3, M0-3 | `play/tests/swim.html` asserts and prints: speed after 2 s of full stick (compare with a hand calculation from the formulas), time to turn 180°, return to rest after 0.5 s idle, dash Δv = 20/mass. Desktop: swims with the keyboard. Emulated mobile: swims with the I1-6 stick. |
| I1-5 | Keyboard axis emulation of Unity `Input.GetAxis`, from `ProjectSettings/InputManager.asset` (Horizontal/Vertical: sensitivity 10, gravity 5, snap 1) and `Scripts/GameManagers/PCInputSimulator.cs:23-47`. **Not normalised on diagonals** (the original's behaviour), unless Ines rules otherwise. Actions use a press threshold of 0.1. | Tide | S | M0-3 | The `?debug=input` overlay shows 0→1 in 0.1 s, 1→0 in 0.2 s, and snap through 0 on reversal. Diagonal magnitude is 1.41. Pike confirms that the swim uses it. |
| I1-6 | Touch controls in `js/input/touch.js` and `js/ui/touch-ui`. **Joystick:** floating on the left half, origin at the first touch, radius ~12 mm (from CSS px), analog output \|v\| ≤ 1. **Buttons:** Attack and Dash bottom right, Bomb above them (Attack and Bomb emit state only until I2/I3). **Behaviour:** controls appear on the first touch and hide on a key press; pointer capture; multi-touch; `pointercancel` and blur reset to 0; safe-area insets. Behaviour reference is `Scripts/Joystick/Joysticks/FloatingJoystick.cs`; **the Joystick Pack is third-party, so nothing is copied from it.** | Tide | L | M0-3 | Emulated 375x812 and 812x375: dragging swims the octopus and the buttons don't overlap the notch. `tests/touch-sim.js` holds the stick while tapping Dash with two touch pointers, and both register in the same step. Desktop: a key press hides the controls. |
| I1-7 | Camera port from `Scripts/Camera/CameraPos.cs` (whole file; framing rule at `:108-147`) and `CameraUltimateFollower.cs`. Shows at least 18×24 world units, clamped to the map, follows the octopus, and reads the interpolated render state. | Pike | M | I1-4 | 375x812 shows the original portrait view. At 1920x1080 and 812x375 the view is wider with no pillarbox. Screenshots of all three go in the task. |
| I1-8 | Wall and background rendering in `js/render/`. Rock texture through the wall mask, following `Shaders/My shaders/Map/SquidTilemap.shader`, with a slow noise overlay (`Sprites/Background/OverlayNoise.jpg`). Pre-composited in 512 px chunks, cached per DPR, re-cached on resize. Static background from `Sprites/Background/`. Only allowlisted files; Coral picks the exact ones and lists them in ASSETS.md as *pending Milan*. | Coral | M | I1-2, M0-4 | No seams at DPR 1, 1.5 and 2. Render ≤ 3 ms at 375x812 (overlay). A side-by-side screenshot against the original (archive page or Daniel's Windows build). Portrait and landscape both look right. |
| I1-9 | **Creature baker spike, hard timebox 2 days.** `octomancer-web/tools/bake_creature.py` renders clips to a WebP sprite sheet plus JSON frame data. Try `Sprites/Animations/Octopus/OctoRemasteredExport_character_data.creature_pack.bytes` first: it is msgpack with pre-deformed points per frame, so we only rasterise triangles with the atlas `OctoRemasteredExport2_character_img.png`. If that fails, skin the `.json` (`mesh/skeleton/animation`). Order: setup pose, `Swim05`, `Idle`. Our code only; nothing from `Plugins/CreaturePack`. | Coral | L | M0-4 | Setup pose and `Swim05` render correctly next to a reference frame (Daniel's build). The sheet at display size is ≤ 250 KB. **At the timebox, take the fallback (ARCHITECTURE §5): a static sprite with code squash and tentacle wobble.** |
| I1-10 | Octopus drawing: swap the placeholder for the baked frames (swim while `Swimming`, idle otherwise) or the fallback sprite. Rotated by physics and interpolated. | Coral | S | I1-4, I1-9 | 60 fps in the overlay at both sizes. The octopus faces the swim direction and matches the original's scale against a tile. |
| I1-11 | I1 test pass. The agent matrix, the gate checklist for Daniel's device run, transfer size, frame work at 375x812, and the bug list split into broken / differs from original / polish. | Reef | M | I1-1..10 | A report with every exit criterion filled, plus Daniel's feel verdict. |

### I2 tutorial 1-4 (outline)

- **Pike**
  - Attack: `Scripts/Player/PlayerAttack.cs`, `SquidAttackLogic.cs`, `PlayerAttackDmg.cs`.
  - Health, hurt knockback and death: `Scripts/Damage/CharacterHealthScript.cs`, `SquidMovementScript.OnHit`, `TriggerDamageHandler.cs`, and the ragdoll rotate branch.
  - IceWall (`Prefabs/Traps/Procedural/IceWall.prefab`).
  - SeaUrchin (`Scripts/TrapBehaviours/Urchin.cs`).
  - CanonPig/Cannon and projectile: `CanonBehaviour.cs`, `ProjectileAttack.cs`, `ScriptableObjects/Traps/Attack/*`.
  - Pearls: `Scripts/Currencies/PearlLogic.cs`, `Prefabs/Currencies/Pearl*.prefab`.
  - Portal and level exit: `Scripts/Tutorial/LevelExit.cs`, `LevelStart.cs`.
  - Tutorial step flow: `Scripts/Tutorial/LevelManager.cs:66-73`.
- **Tide**
  - Entity export from `Prefabs/Levels/Levels/TutorialLevel_1..4.prefab` into the level JSON.
  - Save module: `localStorage["octomancer.save.v1"]` with try/catch and an in-memory fallback; fields from `Scripts/DataScripts/LocalUser.cs`.
  - HTML/CSS HUD (hearts, pearls) and pause menu with safe areas.
  - Hand hints drawn in code.
- **Coral:** exports for traps, pearls, portal and projectiles; code particles for hit, break and shine; HUD icons as CSS/SVG unless a `Sprites/UI` file is confirmed Milan's.
- **Reef:** play all 4 levels on keyboard and on touch only, reload and resume, pause on tab hide.

### I3 endless mode + Beholder (outline)

- **Pike**
  - Generator: `Scripts/Map/ProceduralMapBuilder.cs` (`:36-50, 420-485`, rooms `Sprites/Tilemap/WorldGen/Rooms/`) with the A* check. `PatternGenerator.cs` and `EnemyGenerator.cs` with `Sprites/MatchingPatterns/` and `ScriptableObjects/ProceduralSpawnRules/LevelAll/`. The fbm Perlin from `Shaders/My shaders/Compute Shader/PerlinComputeShader.compute`.
  - The generator is seeded and pure, with a headless test over 200 seeds.
  - SpikeTrap (`SpikeTrapLogic.cs`), Piranha (`Prefabs/Traps/Procedural/Piranha.prefab`, `MoveSideways.cs`, `EnemyAttack.cs`, AABB mover).
  - Bomb: `Scripts/Player/Bomb.cs`, tile breaking via `Scripts/Props/TilemapDestroyer.cs`.
  - Gold: `Scripts/Items/GoldLogic.cs:73-90`.
  - Beholder: `Scripts/Player/EyeChaser.cs`, `ScriptableObjects/Game/SeerTime.asset`.
  - Depth counter, restart and exit: `LevelManager.cs:115-130`.
- **Coral:** room and foliage exports, Beholder and bomb art, explosion particles, wall re-cache on break (only the dirty chunk).
- **Tide:** death screen, depth in the HUD, pools for projectiles and particles, the frame budget at depth 10+.
- **Reef:** 10-minute soak, seed regressions, Daniel's phone soak.

### I4 handover, performance, QA (outline)

- **Tide:** the title handover per ARCHITECTURE §6.
  - Turn the `<span>` at `site/octomancer/index.html:157` into a `<button>`.
  - `pointerdown` warm import, `AudioContext` created on click, then `mount`, and `pushState` so Back and Exit both call `onExit`.
  - The Escape handler at `:164-167` is off while the game is mounted.
  - A zero-listener check after `destroy`.
  - Time-to-play marks.
- **Coral:** the zoom into the light and back (reduced motion: a 0.3 s fade), final WebP atlases at display size, music re-encoded to ~96 kbps (D6/D7).
- **Pike/Tide:** Web Audio SFX synth plus CC0 (D7), mute saved.
- **Tide:** the perf pass against §2 budgets, and the DPR step-down.
- **Otto:** honest title/meta copy (D9) and the ASSETS.md/CREDITS.md close-out.
- **Reef:** full matrix and the Daniel device run on a Firebase preview channel.
- Then Wren's review, and Daniel deploys.

## 5. Decisions for Daniel

Each has a default we use if Daniel hasn't answered by the time it's needed.

**Blocking M0 / I1:**

| # | Decision | Blocks | Default |
|---|---|---|---|
| D1 | Approve the v1 scope (ARCHITECTURE §2) | the plan | Yes. The shop and dark levels come first after v1. |
| D2 | Allow pushes of the orphan `web` branch to the private `Mejval5/Octomancer` and the second submodule at `site/octomancer/play/` | M0-6 only | Yes. Daniel pushes the first commit. Until then the repo stays local and nothing else waits. |
| D3 | Deploy guard in `firebase.json` (`hosting.ignore` plus a predeploy check) | M0-5 | Yes |
| D4 | A 15-minute device run at the end of I1 and at each later gate: his Android, his iPhone and Firefox, over LAN, plus a side-by-side feel check against his Windows build at I1 | I1 exit | His own phones. Otto books the slot before I1 starts. |

**Later (ask now, needed later):**

| # | Decision | Needed by | Default |
|---|---|---|---|
| D5 | UI font | I2 (HUD) | The site's Quicksand plus Fredoka for titles |
| D6 | Asset rights: Milan confirms the "Milan/Daniel" rows and gives his OK for the web; Daniel confirms the 3 music files are his | first public deploy (I4) | Ask Milan **this week**. Until then, export privately, deploy nothing. |
| D7 | SFX source | I4 | Code synth plus Kenney CC0 |
| D8 | Licence of the web game code (`LICENSE` in `web`) | before the repo is ever public | "All rights reserved" |
| D9 | Title and archive copy | I4 | "A small web remake of Octomancer: Octopus Adventure" in the meta/OG text and on the archive page |
| D10 | End state of the repo (rename `main` → `unity-archive`, make `web` the default, drop the `octomancer-unity` submodule) | after v1 | Yes, after v1. The repo stays private. |

## 6. Top 5 risks

| Risk | Mitigation |
|---|---|
| **The swim doesn't feel like Octomancer.** It is the identity, and the architecture already carried the Bomb's body values. | Constants carry source-line comments (I1-1) and Ines signs them off. The swim is ported line by line with exact Unity angle maths. Analytic tests cover speed, turn and dash. The GetAxis ramp is emulated. **Daniel's side-by-side feel check gates I2.** |
| **The Creature baker overruns.** The octopus and plants are mesh animations. | Hard 2-day timebox (I1-9). The `.creature_pack.bytes` has pre-deformed points, so it is rasterise-only. Setup pose comes first. The fallback is ready: a static sprite with code squash and wobble. I1 never waits on it (placeholder first). Plants are post-v1. |
| **Agents can't test real phones, real multi-touch, Safari, Firefox or phone CPU speed.** | Chromium emulation handles layout. Synthetic touch `PointerEvent`s cover multi-touch. The ≤ 4 ms frame-work proxy stands in for CPU. Daniel's 15-minute checklist is a booked gate step from I1 on (D4), not ad hoc. The PixiJS escape hatch covers render if the phone misses budget. |
| **Asset rights or a leak.** Milan doesn't confirm, or paid files land in `site/`. | ASSETS.md allowlist; exporters refuse unlisted paths. The orphan branch shares no history with `main`. Deploy guard plus predeploy check (M0-5). Nothing deploys before D6. Placeholders keep every iteration unblocked. |
| **I3 is the biggest chunk.** Generator, A*, patterns and Perlin mean drift and overrun. | Straight port as seeded pure functions with a 200-seed connectivity test. I3 starts only after I2 is verified. Fallback if it overruns by more than a week: a curated rotation of the 18 rooms with hand-placed traps, which is still endless descent + Beholder. |
