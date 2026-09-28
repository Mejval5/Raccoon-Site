# Octomancer web port: architecture

Owner: Ines (tech lead). Status: kick-off proposal, not yet approved by Daniel. Paths are relative to `octomancer-unity/` unless they start with `site/`.
Measurements come from reading the YAML/meta files. Unity was not opened. Anything marked *(verify)* is an assumption the first spike has to confirm.

## 1. What the game in the repo actually is

**This is not the 2021 multiplayer game on the archive page.** `site/octomancer/archive/` describes cove-building, crystal merging, Firebase multiplayer and leaderboards. None of that code is in this repo. The only traces left are the `StaticKeywords.CrystalNames` array and the unused `AdvertType` enums in `Scripts/StaticScripts/StaticEnums.cs`. The repo is the later single-player spin-off, `com.brotagonists.octomancer.octopus.adventure` (bundleVersion 12, `ProjectSettings/ProjectSettings.asset`). It was last touched in Dec 2023 by commit `a4a0317` ("fix many issues for Windows Build").

- **Scenes:** one. `EditorBuildSettings.asset` lists only `Assets/Scenes/MainGame.unity` (13.7 MB YAML). `TestScene.unity` is not in the build. Inside that scene, "scenes" are enabled/disabled object groups (`SceneObjectsManager`, `SE.Scenes {Loading, Tutorial, LoadedManually}`).
- **Core loop:** you swim an octopus with physics (`Player/SquidMovementScript.cs`, which applies Rigidbody2D impulses from an analog direction). You attack (front/back hitboxes, `Player/PlayerAttack.cs`), dash (`PushEvent`), drop bombs and grab/throw items (`Player/CarryItemLogic.cs`). You avoid or kill traps, collect pearls and reach the exit portal.
- **Modes / progression** (`Tutorial/LevelManager.cs`, one save int `TutorialLevel`):
  1. 11 hand-built tutorial levels (`Prefabs/Levels/Levels/TutorialLevels.asset`). Some use Timeline cinematics (`Level0/1/5.playable`). Death means an instant restart.
  2. The Game Hub (`Game_Hub.prefab`), with a shop that sells items for pearls (`Campaign/ShopLogic.cs`).
  3. An endless procedural "campaign" (`ProceduralLevel.prefab`). Each run stitches 18 pixel-art room textures (10x16 px each) into a 3x3 grid, giving a 30x48 map. `Map/ProceduralMapBuilder.cs` checks the map with A*, turns it into a tilemap, then Perlin-driven generators place foliage, background and traps. Death means the death screen, lost items, and a choice of Restart or Home. After 120 s (`ScriptableObjects/Game/SeerTime.asset`) a Beholder chaser spawns. 4% of levels are "dark" (SmartLighting2D).
- **Content:** 17 trap/enemy prefabs (`Prefabs/Traps/Procedural/`: piranha, tentacle, canon pig, crush block, dropper, electro rock, spike, urchin, gate, ice wall…), 4 item types, liquids (health, lava and oil drops using Water2D metaballs), critters (CreaturePack), and the music track `Sounds/Mj 362 - Octopus Medles.mp3` plus about 30 SFX.
- **Code size:** 241 own C# files, about 15.2k lines (largest folders: UI 2.0k, ScriptableObjectScripts 2.0k, Map 1.7k, TrapBehaviours 1.5k). Water2D adds 30 more files and 7.2k lines of third-party code copied into `Scripts/Water2D`, of which 3k are editor code. **65 own MonoBehaviour/SO scripts are referenced by no scene, prefab or asset** (for example all of `Bonus/`, `CampaignMapLoadManager`, `ClickManager`, most UI animators, the compute-pipeline stack).
- **Architecture style:** ScriptableObject variables and GameEvents (`ScriptableObjectScripts/Events`), singletons (`X.shared`), object pooling, and Odin `SerializedMonoBehaviour` dictionaries in 3 places (`PCInputSimulator`, `ItemManager`, `SceneObjectsManager`).
- **Save:** `DataScripts/LocalUser.cs` writes JSON to `persistentDataPath/SaveData/SquidSave.dat`. It is already offline-only.

**Backend, ads, Play Games: zero code dependency.** A grep of `Assets/Scripts` finds only a commented-out `FirebaseAnalytics.LogEvent` (`Tutorial/LevelManager.cs:184,196`) and an empty `RateUs()`. The remaining dependency is packaging only:
- 13 `com.google.*` tarballs in `Packages/manifest.json` (Firebase 9.0 app/auth/db/firestore/functions/crashlytics/remote-config/analytics, Play core/review/appbundle, EDM)
- `Assets/Plugins/GeneratedLocalRepo/{Firebase,GooglePlayGames}`
- `Assets/Plugins/iOS/Yodo1MasUnityBridge` (a Yodo1 ad SDK bridge, not IronSource)
- `My packages/play-games-plugin-for-unity-0.10.12`

The ad and IronSource code sits in `OldAssets/` (269 MB, outside `Assets/`), so Unity never compiles it and it is dead.

**Controls in HEAD are keyboard/gamepad only.** `GameManagers/PCInputSimulator.cs` is the only thing that drives movement. The mapping from `InputManager.asset`:

| Action | Keys |
|---|---|
| Move | arrows / WASD |
| Attack | X or PgUp |
| Dash | Z or Enter |
| Bomb | `\` or Space |
| Grab | LShift or PgDn |

`UI/Input/SquidJoystick.cs` and the Joystick Pack exist, but neither is in `MainGame.unity`, in either commit. **Touch controls have to be built in both approaches.** The playfield is portrait-first (UI reference 1000x2000, portrait-only autorotate). `Camera/CameraPos.cs` already re-fits the camera to any aspect and re-creates the background RenderTexture when the screen resizes.

## 2. The two approaches for this codebase

### (A) Unity WebGL: upgrade to 6000.3, strip, build into `site/octomancer/play/`

**Hard blockers found in the code (both are fixable):**
1. **Compute shaders run at runtime.** `PatternGenerator.GetPerlinNoise()` and `BackgroundGenerator.GetPerlinNoise()` dispatch `Shaders/My shaders/Compute Shader/PerlinComputeShader.compute` through `PerlinProcessorCustomSize` and then `ReadPixels`. `EnemyGenerator` derives from `PatternGenerator`, so trap placement depends on it too. WebGL2 has no compute shaders. The fix is to port the roughly 40-line fbm HLSL to C# on the CPU (the maps are only 30x48 px). Relying on Unity's WebGPU backend instead would narrow browser support for one noise texture.
2. **Geometry shader.** SmartLighting2D's `Resources/Shaders/Internal/LightShadow/LegacyGPU.shader` uses `#pragma geometry`, which WebGL doesn't support. Switch the plugin to a non-geometry shadow mode. Only dark levels (4%) are affected.

**Other work:**
- **Remove:** all Google/Firebase packages, `GeneratedLocalRepo`, `Plugins/iOS`, the `ide.vscode` package (not in Unity 6), `collab-proxy`, `recorder`, `android-logcat`, `mobile.notifications`, `visualscripting`, and the FunkyCode demo `Resources/` folders. Resources always ship, and these add 43 images (including a 2048x1344 floor texture) and a car.wav.
- **Upgrade:** Cinemachine 2.8.9 to 2.10.x (stay on CM2), PostProcessing to 3.4+, 2D Animation. TMP folds into ugui 2.0 automatically.
- **Odin 3.1:** needs a Unity-6-compatible Odin, which means re-downloading it under Daniel's license. The alternative is replacing the 3 Odin dictionaries with plain serialized lists and re-wiring them.
- **Frame rate:** `GeneralSettings.Awake` sets `Application.targetFrameRate = 300`. On WebGL anything other than -1 swaps requestAnimationFrame for a timer loop, so this must be -1 under `UNITY_WEBGL`.
- **Save:** File IO on WebGL lands in IDBFS. Confirm Unity 6 flushes it to IndexedDB on its own *(verify)*. If not, add a 5-line `FS.syncfs` jslib or move the save to PlayerPrefs.
- **Performance:** there are 7 cameras in the scene: a full-resolution ARGB32 background RenderTexture (`Map/BackgroundCameraLogic.cs`), Water2D metaball cameras, and lighting. Physics2D and the job-based `LiquidCustomSimulation` run on the main thread, because WebGL has no threads and Burst doesn't apply. Mitigations: cap `devicePixelRatio` (about 1.5 on mobile), render the background RT at half resolution, and profile on a mid-range Android phone and an iPhone.

**Load size (estimate):**
- About 335 textures actually used, 89 megapixels after the existing max-size clamps. 316 of them import at max 2048, and many item sprites are 1024².
  - As DXT5/ETC2 that is about 90 MB of GPU memory, about 40 MB as ASTC 6x6, and 356 MB if a phone falls back to RGBA32.
  - **Mobile needs an ASTC build and desktop a DXT build**, with the loader picking one by `WEBGL_compressed_texture_astc`. Without that, an iPhone risks running out of memory.
- About 5.4 MB of audio, of which 2.9 MB is WAV that should be recompressed to Vorbis.
- Engine plus code: about 3–5 MB brotli.
- **About 40–60 MB as-is. With a texture diet (clamp items to 256–512, crunch), about 15–25 MB.** That is the target I'd hold us to.

**Firebase Hosting config:** brotli build, names as hashes, then add to `firebase.json` → `hosting.headers`:
```json
{ "source": "/octomancer/play/Build/**/*.br", "headers": [{ "key": "Content-Encoding", "value": "br" }] },
{ "source": "/octomancer/play/Build/**/*.wasm.br", "headers": [{ "key": "Content-Type", "value": "application/wasm" }] },
{ "source": "/octomancer/play/Build/**/*.js.br", "headers": [{ "key": "Content-Type", "value": "application/javascript" }] },
{ "source": "/octomancer/play/Build/**/*.data.br", "headers": [{ "key": "Content-Type", "value": "application/octet-stream" }] },
{ "source": "/octomancer/play/Build/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
```
Check a preview channel with `curl -I` to confirm a single `content-encoding: br` and no double compression *(verify)*. If Hosting misbehaves, fall back to Unity's "Decompression Fallback" (no headers needed, slower start). Local testing needs the Hosting emulator or the fallback, because a plain static server won't send these headers.

**Handover from the HTML menu:**
1. Start Game becomes a `<button>`. On click, CSS zooms the cave layers "into" the light (about 1.2 s) while a full-viewport `<iframe src="/octomancer/play/">` is inserted underneath.
2. The play page is a minimal custom WebGL template. It shows a site-styled progress bar, calls `createUnityInstance` with the DPR cap, and posts `octo:ready` to the parent through a jslib once `LevelManager` has built the first level. The parent then cross-fades.
3. The in-game Exit posts `octo:exit`. The parent removes the iframe, which releases the WebGL context and the heap, something `Quit()` doesn't reliably do, and reverses the zoom.

The iframe also stops Unity's global key capture and the title page's Escape→`/` handler from fighting each other. `/octomancer/play/` still works as a direct link. On iOS, audio starts on the first in-game touch, which the game needs anyway to start moving.

### (B) JS rewrite in `site/octomancer/play/`

- **Renderer:** PixiJS v8 as an ES module from jsdelivr (WebGL, batching, filters, no build step). Canvas2D can't do the metaball/threshold liquids, the see-through tilemap shader (`My shaders/Map/SquidTilemap.shader`) or hundreds of particles at phone DPR. Raw WebGL is too much hand-work.
- **Physics:** the whole feel is Box2D (Unity's Physics2D): impulses, drag, pushable/crush blocks, projectiles, liquid balls. **Planck.js** is a Box2D port, pure JS and loadable as an ES module. It is the only way to get close with the same tuning numbers.
- **Must be reimplemented:** game loop, pause and state; event bus and pooling (trivial in JS); the map generator (room textures → A* → tiles → Perlin foliage/background/traps, a straight port); the player (movement model, attack, dash, bomb, carry/throw, health, knockback/ragdoll); 17 traps; items and the shop; the Beholder; liquids; dark mode (replaced by a radial-darkness overlay); 11 tutorial levels plus the hub, including 3 Timeline cinematics as scripted sequences; HUD, death and loading screens; sound; save to localStorage; keyboard, touch and gamepad input.
- **Can be simplified:** SmartLighting2D becomes an overlay. CreaturePack critters become sprite-sheet loops. Cartoon FX and UIParticle become Pixi particles. Cinemachine becomes a clamp-follow camera, which is what `CameraPos.BoundCam` already does. Drop the 7-camera render-texture stack.
- **Asset pipeline:** a Python/Pillow script driven by a dependency walk (I already have the list of files `MainGame.unity` pulls in). It reads each `.png.meta` for sprite rects and pivots, resizes to display size, packs WebP atlases plus JSON, and converts audio to mp3/ogg.
- **Level data:** prefab YAML with nested prefab overrides is painful to parse. A small Unity editor exporter is simpler, but it means opening the project in Unity 6 anyway.

### Side by side

| | (A) Unity WebGL | (B) JS rewrite |
|---|---|---|
| Effort | ~14 tasks, **8–15 dev-days**. Main uncertainty: the upgrade and Odin. | ~50 tasks, **35–55 dev-days**. Main uncertainty: physics feel and tutorial levels. |
| Fidelity | ~100%: same code, content and animations (possible small Physics2D drift across versions) | 70–85%: "the same game" but re-tuned, and animations re-authored |
| First load | 15–25 MB after texture diet (40–60 MB naive), plus wasm start-up | ~5–10 MB WebP/audio + ~0.7 MB libs |
| Cross-platform risk | Medium-high: iOS Safari memory, mobile GPU fill-rate, two texture builds | Low-medium: plain WebGL via Pixi, small memory |
| Maintainability (static site) | Opaque binary; changes need Unity 6. The site stays static, the build happens offline. | Readable ES modules in `site/`, no bundler; a large new codebase in the site repo |
| Licensing | Compiled build = the same as the shipped APK | Loose PNG/MP3 from paid packs at public URLs (see §4) |

## 3. Recommendation

**Go with (A), gated by a 2-day spike.**

Why: the game's value is in the content and its tuning: Box2D parameters, 31 animator controllers, particle prefabs, metaball liquids, and 11 hand-placed tutorial levels. Only Unity can read those faithfully. The code-side blockers are two small, local fixes. (B) spends five times the effort to land at "close". A compiled build also keeps us on the right side of the Asset Store EULA.

**Spike (T0), timeboxed at 2 days:** open a copy in 6000.3, strip the plugins, port the Perlin to CPU, set targetFrameRate -1, and make a WebGL dev build. Then play it on an Android Chrome phone, an iPhone in Safari, and desktop Firefox.

**Kill criteria:** it doesn't compile after 2 days, or below 30 fps on the mid-range phone after the DPR cap and half-resolution background RT, or an iPhone tab crash with the ASTC build. If any of these hits, we come back and re-plan (B), or a hybrid that keeps Unity only as the level-data exporter.

**Decisions that belong to Daniel:**
1. **Which game Start Game launches.** The only code we have is the single-player "Octopus Adventure". The multiplayer game on the archive page can't be revived from this repo. Do the menu and archive copy need a line about that?
2. A vs B, and whether to accept the spike and its kill criteria.
3. **Where the Unity work lives.** The submodule is read-only for us, so it needs either a `web` branch in `Mejval5/Octomancer` with a bumped submodule pointer, or a separate copy.
4. **The Odin licence.** Either Daniel re-downloads Odin for Unity 6, or we remove Odin.
5. Whether the ~20 MB build is committed under `site/octomancer/play/Build` (it grows repo history on every rebuild) or deployed by a script from an ignored folder.
6. **Load budget and mobile-data policy.** Is 15–25 MB acceptable? Do we prefetch on the title page, or only after Start is tapped (my preference)?
7. **Scope.** Keep tutorial, hub, endless, dark levels and liquids? Drop RateUs and analytics? Keep portrait-letterboxed on desktop, or widen the camera, which already works per the Windows build?
8. The licensing items below, including Milan's and Wren's sign-off on putting the game art on the web.

## 4. Surprises

- **Licensing:**
  - The Unity repo contains paid Asset Store packages: Odin Inspector, DOTween Pro, SmartLighting2D, Water2D (also copied into `Scripts/Water2D`), TrueShadow, CreaturePack, QHierarchy, GUI PRO Kit Casual Game, and JMO Cartoon FX. The root `LICENSE` offers MIT for "the software excluding Unity assets".
  - The Asset Store EULA allows these inside a compiled product and forbids redistributing their source or files. **If `Mejval5/Octomancer` is public, that is already a problem.** I couldn't confirm its visibility: `gh` can't resolve it from this machine.
  - For (B), 13 GUI PRO Kit icons, the Cartoon FX/Unity particle-pack textures, and the Water2D sprites would need replacing with own art.
  - The fonts need checking: `Assets/Fonts/Orange Juice.otf` (used in the UI) is, as far as I know, free for personal use only. `consola.ttf` (Microsoft) is committed but not used.
  - The SFX names look like library packs ("Bloody punches 2", "Human Water Land 4", mixkit). Their provenance is unknown and needs checking before loose files are served.
- **Runtime compute shaders and a geometry shader** in the level and light pipeline (see §2A). The compute stack also over-dispatches: `numthreads(25,25)` against `threadGroups = 8`.
- **No touch input wired in HEAD** (see §1), even though the game shipped on Android.
- **Dead weight:**
  - `OldAssets/` (269 MB: old ad scripts, the IronSource SDK, 606 old sprites)
  - `TestScene.unity` (13 MB)
  - 65 unreferenced scripts, and the orphan `Assets/Scripts/SquidLogic.meta` with no folder behind it
  - About 1,500 of the ~1,870 images in `Assets/` never reach the build
- Someone once set WebGL defines and texture entries (`ProjectSettings.asset`: WebGL scripting defines, 16 MB memory, gzip). Those are Unity-2021 era values; use the 6000.3 defaults instead.
