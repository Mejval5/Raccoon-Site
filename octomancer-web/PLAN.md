# Octomancer web port: plan

Owner: Otto (PM). Status: **draft, waiting for Wren's validation. No dev work starts before that.** Based on `ARCHITECTURE.md` (Ines).
Status words mean exactly this: *todo*, *in progress*, *blocked*, *done, verified*.

## 1. Goal and non-goals

**Goal.** A player opens raccoon.website/octomancer/ on a laptop or phone, presses **Start Game**, the cave zooms into the light, and within seconds they are swimming the octopus in the real game: tutorial, hub and shop, endless levels. It works with keyboard, mouse and touch, keeps progress locally, and **Exit** zooms back out to the title menu.

**Non-goals.** No revival of the 2021 multiplayer game (its code is not in the repo), no backend, accounts, leaderboards, ads, analytics or Play Games. No new content or redesign. No JS rewrite unless the spike fails. No app-store builds.

## 2. Hard constraints

- **Verify on this matrix** for every milestone gate. Desktop: Chrome, Firefox (Windows), Safari (macOS if Daniel has one); keyboard + mouse; 1366x768 and 1920x1080. Mobile: a mid-range Android on Chrome and an iPhone on Safari; touch; portrait and landscape; also 375x812 emulated. Plus: slow 4G throttle, tab backgrounded and resumed, `prefers-reduced-motion`.
  Agents test in the Chromium browser pane (desktop + emulated mobile/touch). **Real phones and Safari are tested by Daniel** with Reef's checklist (~20 min per gate).
- **Load budget:** nothing game-related downloads before Start is pressed. First playable ≤ **25 MB** transferred (brotli), target 15 MB. Repeat visit (cached) playable in < 5 s. Median ≥ **30 fps** on the mid-range Android, ≥ 55 fps on desktop. iPhone: 10-minute session without a tab crash.
- **No secrets, no paid source, no loose assets in `site/`.** Only the compiled Unity build (`.wasm/.data/.js`, loader, template) ships under `site/octomancer/play/`. Never copy `.cs`, `.png`, `.mp3`, `.shader`, `.prefab` or package files from the Unity project into `site/`. Reef checks this at every gate.
- **`octomancer-unity/` is read-only**: reference only, never opened in Unity, never edited, pointer not bumped without Daniel.
- **Unity work happens outside the site repo**, in `D:\Projects\Octomancer-web` (see §8). The site repo gets only the build output and HTML/JS glue.
- **Site stays static**: plain HTML/CSS/JS, root-absolute paths, no bundler. The Unity build is produced offline.

## 3. Approach

Follow Ines's recommendation: **(A) Unity WebGL**, gated by a 2-day spike. The game's value is its tuning, animations, liquids and 11 hand-built levels, and only Unity reproduces those faithfully; the known blockers (runtime compute shader, geometry shader) are small and local. It is also the only option that keeps paid assets compiled rather than served loose. One addition to Ines's plan: the spike ships a throwaway **drag-to-swim touch input**, otherwise nobody can move on a phone and the fps kill criterion can't be measured honestly. If the spike fails, we re-plan (B) or the hybrid (Unity as level-data exporter); we don't push on.

## 4. Milestones

| | Outcome | Exit criteria | Verify desktop / mobile |
|---|---|---|---|
| **M0 Spike** (2 days, hard timebox) | Upgraded, stripped project builds to WebGL; we know if (A) is viable | See go/no-go below | Chrome + Firefox desktop by Reef; Android + iPhone by Daniel |
| **M1 Game runs in the browser** | `/octomancer/play/` works standalone: all inputs, within budget, saves persist | Reproducible one-command build; ≤ 25 MB; perf targets met; touch controls; saves survive reload; dark levels render; no blocking console errors | Full matrix; Reef test pass + Daniel device run; Ines size/perf review |
| **M2 Site integration** | Start Game zooms into the game; Exit zooms back out | Menu item enabled; zoom + progress + cross-fade on `octo:ready`; `octo:exit` removes iframe and reverses zoom; Escape does not fight the game; reduced motion = fade | Chrome/Firefox mouse + keyboard; emulated + real phones touch, both orientations |
| **M3 v1 ship** | Live on raccoon.website | Reef regression clean (no "broken" bugs), licensing items D9 closed, Wren milestone review approved, Daniel deploys | Full matrix on the preview channel, then production smoke test |
| **M4 Polish** (optional) | Nicer, not required | Per item | Per item |

**M0 go/no-go (all must hold, else re-plan):**
1. The project compiles in 6000.3.17f1 and a WebGL build comes out of one batch command within 2 days.
2. Desktop Chrome and Firefox: loads, a tutorial level is playable with the keyboard, and an endless level can be reached (save edit or debug skip). No console error that blocks play.
3. Mid-range Android, Chrome: median ≥ 30 fps over 60 s swimming in an endless level (DPR cap 1.5 and half-res background RT allowed).
4. iPhone Safari, ASTC build: 10 minutes of play without a reload or crash.
5. Reported, not gated: build size per variant, load time on Wi-Fi, CPU-vs-GPU Perlin match.
*Borderline (25–29 fps, or one crash with a clear cause):* Ines names the fix and its cost; Wren may grant **one** extra day. Otherwise no-go.

## 5. Tasks

Rules: every task is reviewed by Ines before it counts as *done, verified*. The Unity project is `D:\Projects\Octomancer-web` (branch `web`), abbreviated **OW**. Nobody commits unless Otto asks.

### M0 spike (all *todo*)

| id | Task | Owner | Size | Deps | Acceptance and how verified |
|---|---|---|---|---|---|
| S1 | Clone the repo to OW (`git clone D:\Projects\Raccoon-Site\octomancer-unity D:\Projects\Octomancer-web`), create branch `web`, set `origin` to `git@github.com:Mejval5/Octomancer.git`. | Tide | S | D1 | `git -C OW branch` shows `* web`; `git -C octomancer-unity status` is clean. |
| S2 | In OW, strip before upgrading: remove the packages and folders listed in ARCHITECTURE §2A "Remove" (Google/Firebase, `GeneratedLocalRepo`, `Plugins/iOS`, ide.vscode, collab-proxy, recorder, android-logcat, mobile.notifications, visualscripting, FunkyCode demo `Resources/`). | Tide | S | S1 | `grep com.google Packages/manifest.json` is empty; listed folders gone; diff reviewed by Ines. |
| S3 | First batch import into 6000.3.17f1 with `-accept-apiupdate` (§8). Bump Cinemachine to 2.10.x, PostProcessing 3.4+, 2D Animation to the 6000.3 default. Keep in-repo Odin 3.1. | Tide | M | S2 | Import finishes; log saved under `OW/Logs/`; list of compile errors handed to S4. |
| S4 | Fix compile errors until the log has no `error CS`. If Odin 3.1 won't compile after 2 h, apply fallback D3 (attribute shim + convert the 3 dictionaries to serialized lists, values copied from the YAML). Timebox: 1 day. | Tide (Pike for gameplay files) | L | S3 | Clean batch import log; Ines reviews every non-trivial change. |
| S5 | Port the fbm Perlin in `PerlinComputeShader.compute` to C# on the CPU, used by `PatternGenerator` and `BackgroundGenerator` under `UNITY_WEBGL` (or always). Add an editor test that compares CPU and GPU output for 3 seeds in batch mode. | Pike | M | S1 | Test passes within a stated tolerance; generated map screenshots match side by side on desktop. |
| S6 | `GeneralSettings.Awake`: `targetFrameRate = -1` under `UNITY_WEBGL`. If dark levels break the build or render, disable them under `UNITY_WEBGL` for the spike only (fixed properly in T6). | Pike | S | S4 | Code reviewed; build runs. |
| S7 | Spike-only input: on WebGL, touch-drag anywhere sets the swim direction (vector from touch start), tap = attack. Feeds the same path as `PCInputSimulator`. Marked `// SPIKE` for removal. | Pike | S | S4 | Emulated 375x812 touch in the browser pane: octopus swims and attacks. |
| S8 | Build script `OW/Assets/Editor/WebGL/OctoWebBuild.cs` (not a folder named `Build`, it is gitignored): methods `BuildDxt` and `BuildAstc`, development build, Decompression Fallback, DPR cap 1.5 on mobile, output to `OW/Builds/webgl-dxt` and `webgl-astc`; exits with code 1 on failure. Add an fps overlay (median + p95 frame time) shown with `?fps=1`. | Tide | M | S4 | Both builds produced from the batch command in §8; overlay visible in Chrome. |
| S9 | Half-res background RenderTexture on WebGL (`Map/BackgroundCameraLogic.cs`). | Coral | S | S4 | Visual compare on desktop; fps overlay before/after on emulated mobile. |
| S10 | Spike test pass: desktop Chrome + Firefox (keyboard), emulated mobile; write a 1-page device checklist for Daniel (URL via LAN, what to measure, where to write results). Record sizes, load time, fps, console errors. | Reef | M | S5–S9 | Report in `octomancer-web/SPIKE-REPORT.md` with every go/no-go line filled. |
| S11 | Go/no-go recommendation against §4 criteria, to Otto, Wren and Daniel. | Ines | S | S10 + Daniel's device run | Written verdict with evidence per criterion. |

### M1 game runs in the browser (all *todo*; starts only after a GO)

| id | Task | Owner | Size | Deps | Acceptance and how verified |
|---|---|---|---|---|---|
| T1 | Release build: brotli, hashed names, both variants; `octomancer-web/build.ps1` runs Unity (§8) and copies output to `site/octomancer/play/Build-astc/` and `Build-dxt/`. | Tide | M | S8 | One command from a clean shell produces both; Reef runs it cold. |
| T2 | WebGL template `site/octomancer/play/index.html`: site-styled progress bar, picks ASTC if `WEBGL_compressed_texture_astc` else DXT, DPR cap, full viewport, `touch-action:none`, no page zoom/scroll, safe-area insets. | Tide | M | T1 | Chrome, Firefox, emulated phone: correct variant logged; no scroll or pinch zoom; notch area clear. |
| T3 | `firebase.json` headers from ARCHITECTURE §2A; check with `firebase emulators:start --only hosting` and `curl -I` (single `content-encoding: br`, right content types). | Tide | S | T1 | curl output pasted in the task report; game loads from the emulator. |
| T4 | Texture diet: clamp item sprites to 256–512, crunch where it doesn't hurt, per-platform overrides; delete unused `Resources/`. Report size per variant. | Coral | L | T1 | Each variant ≤ 25 MB brotli; side-by-side screenshots of hub, 3 traps, 2 items show no visible loss at phone and desktop size. |
| T5 | Audio: WAV → Vorbis, sensible quality; music streams. | Coral | S | T1 | Audio size reported; SFX play on desktop and emulated mobile; first-tap audio unlock works on iPhone (Daniel). |
| T6 | SmartLighting2D: switch to a non-geometry shadow mode; remove the S6 dark-level switch. | Coral | M | S6 | A forced dark level renders on Chrome + Firefox and on phones; no shader errors in the console. |
| T7 | Saves: confirm `LocalUser` persists on WebGL (IDBFS). If not, add `FS.syncfs` jslib or move to PlayerPrefs. | Pike | S | T1 | Finish tutorial level 2, reload, resume at level 3; same after closing the tab; Chrome, Firefox, Android, iPhone. |
| T8 | Input abstraction: `PCInputSimulator` reads from a combined source (keyboard + touch) so gameplay sees only move/attack/dash/bomb/grab. Remove S7. | Pike | M | S7 | Keyboard behaviour unchanged (Reef compares to the key table); code reviewed. |
| T9 | Touch controls: floating analog joystick on the left half (existing `Scripts/Joystick/` pack), buttons Attack, Dash, Bomb, Grab on the right; shown after the first touch, hidden after a key press; multitouch (swim + attack together); works portrait and landscape. | Tide | L | T8 | Emulated phone both orientations; Daniel on Android + iPhone: finish tutorial level 1 and one endless room using touch only. |
| T10 | Dead paths: `RateUs`, analytics stubs, `Application.Quit` and any Android-only calls become no-ops on WebGL. | Pike | S | S4 | Grep report; no console errors when pressing every menu button. |
| T11 | Perf pass: fps overlay on the matrix; tune Water2D metaball camera resolution and particle counts only if below target. | Coral | M | T4, T6 | Android median ≥ 30 fps, desktop ≥ 55, iPhone 10 min soak, numbers in the report. |
| T12 | M1 test pass: full matrix, keyboard/mouse/touch, slow 4G, background tab, reduced motion; check `site/` holds no loose source/assets; bug list split into broken / differs from original / polish. | Reef | M | T1–T11 | Report with the matrix filled in; Daniel device checklist done. |
| T13 | M1 gate review: size, perf, cross-platform input. | Ines | S | T12 | Written approve / send back. |

### Later milestones (outline)

- **M2 site integration:** jslib bridge posting `octo:ready` (first level built) and `octo:exit` (in-game Exit; navigates to `/octomancer/` when not in an iframe) (Tide). Start Game becomes a `<button>`; CSS zoom into the light (~1.2 s) over a full-viewport iframe to `/octomancer/play/`; cross-fade on ready; reverse zoom and iframe removal on exit (Coral: zoom, Tide: iframe and messages). Escape key: the title handler is ignored while the game is open. Reduced motion: fade instead of zoom. Archive/menu copy line (D5). Reef pass + Daniel device run.
- **M3 v1 ship:** licensing close-out (D9), deploy script and git policy (D8), Firebase preview channel run on the full matrix (Daniel deploys), Wren milestone review, production deploy and smoke test.
- **M4 polish (optional):** gamepad; wider camera on desktop/landscape; prefetch after the menu is idle (if D7 allows); remove Odin if kept; loading-time tricks (smaller first chunk); PWA/offline.

## 6. Open decisions for Daniel

Each has a default we use if Daniel hasn't answered by the time it's needed.

| # | Decision | Blocks | Recommended default |
|---|---|---|---|
| D1 | Where the Unity work lives | **M0 (S1)** | A `web` branch of the private `Mejval5/Octomancer`, worked in a separate clone at `D:\Projects\Octomancer-web`. Push to GitHub only when Daniel says so; submodule pointer stays as is until v1. |
| D2 | Approve approach (A) with the spike and its kill criteria | **M0** | Yes (via Wren's validation of this plan). |
| D3 | Odin: re-download for Unity 6 under Daniel's licence, or remove | M0 only if 3.1 fails | Spike tries the in-repo Odin 3.1; if it fails, remove it (shim + 3 dictionaries to lists). Long term: remove, one fewer paid dependency. |
| D4 | Real-device testing: which Android and iPhone, and Daniel runs the ~20 min checklist at each gate over LAN | **M0 go/no-go** | Daniel's own phones; LAN URL `http://<PC-IP>:8080`; later gates may use a Firebase preview channel that Daniel deploys. |
| D5 | Start Game launches the single-player "Octopus Adventure"; add a line to the archive/menu saying the 2021 multiplayer game is not coming back | M2 | Yes, one neutral sentence on the archive page. |
| D6 | Scope | M1 | Keep tutorial, hub/shop, endless, dark levels, liquids. Drop RateUs and analytics. Portrait playfield pillarboxed on desktop and landscape; wider camera is polish (M4). |
| D7 | Load budget and prefetch policy | M1 | ≤ 25 MB, target 15 MB; no download before Start is pressed. |
| D8 | Build in git or deployed by script | M3 | Build folders gitignored; `build.ps1` + deploy step fills them before `firebase deploy`. Avoids ~20 MB of history per rebuild. |
| D9 | Licensing: Milan's OK for the art on the web; `Orange Juice.otf` licence; SFX provenance; compiled build only | M3 (public deploy) | Ship compiled only; swap the font if it is personal-use only; Daniel asks Milan. |

## 7. Top risks

| Risk | Mitigation |
|---|---|
| Unity 6 upgrade becomes a swamp (Odin, Cinemachine, Water2D, Timeline custom tracks) | Strip before upgrading; 1-day compile timebox inside the 2-day spike; Ines on call; hard no-go instead of drifting. |
| Mobile frame rate (7 cameras, metaball liquids, single-threaded Physics2D) | Measured on a real phone in M0 with the fps overlay; DPR cap, half-res RTs, Water2D tuning in T11. |
| iPhone memory crash / download too big | ASTC variant, texture diet to ≤ 25 MB, 10-minute soak at every gate, no prefetch. |
| Agents can't test real phones or Safari | Chromium emulation for layout and touch; Daniel's short device checklist is a formal gate step, planned, not ad hoc. |
| Paid assets or source leak into the public site | Only compiled output under `site/octomancer/play/`; Reef's gate check for loose files; Unity repo stays private; D9 before public deploy. |

## 8. Tooling notes for devs

- **Editors:** `C:\Program Files\Unity\Hub\Editor\6000.3.16f1` and `6000.3.17f1`, both with WebGL. **Use 6000.3.17f1 only** (6000.0.58f2 is also installed: don't). The project is 2021.3.23f1; the first open upgrades it one way, so never open the submodule.
- **Batch mode only**, one Unity process per project (close the Editor GUI on OW first; a stale `Temp/UnityLockfile` means another instance is open). The log file is the only feedback; the first import can take 30–90 min, run it in the background. Unity must be activated in Unity Hub (Personal); a licence error in the log means ask Daniel.
  ```powershell
  # first import / upgrade
  & "C:\Program Files\Unity\Hub\Editor\6000.3.17f1\Editor\Unity.exe" -batchmode -quit -accept-apiupdate `
    -projectPath "D:\Projects\Octomancer-web" -buildTarget WebGL -logFile "D:\Projects\Octomancer-web\Logs\import.log"
  # build
  & "C:\Program Files\Unity\Hub\Editor\6000.3.17f1\Editor\Unity.exe" -batchmode -quit `
    -projectPath "D:\Projects\Octomancer-web" -buildTarget WebGL `
    -executeMethod OctoWebBuild.BuildAstc -logFile "D:\Projects\Octomancer-web\Logs\build-astc.log"
  ```
  Check the exit code and grep the log for `error CS` and the build result line. Don't add `-nographics` until a build is known to work without it.
- **Serving locally:** a Decompression Fallback build works from `python -m http.server 8080 --bind 0.0.0.0 --directory <build folder>` (phones on the same Wi-Fi use the PC's LAN IP; Windows may ask Daniel to allow it through the firewall). Brotli builds need `firebase emulators:start --only hosting` (the Firebase CLI is installed). `.claude/launch.json` serves `site/` on 8080 for the title screen.
- **Disk:** D: has about 83 GB free; OW plus `Library/` will take several GB.
- **Where the Unity work happens:** recommended a `web` branch of `Mejval5/Octomancer` in the separate clone OW, rather than an untracked copy: it gives Ines reviewable diffs, history and a clean way to bump the submodule later, and the repo is private, so the paid source stays private. Daniel's call (D1).
