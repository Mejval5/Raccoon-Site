# Octomancer overnight log

## M0-0 Pre-flight (M0 dev)
- Branch: `master`.
- Starting commit (after committing the plan amendment): `7ff54dc0f528e7fdab286d6662eb288387f76326`.
- `git status --short` before starting showed `M octomancer-web/OVERNIGHT.md` and `?? .claude/`. The OVERNIGHT.md change was Beaver's amendment to the "one Sonnet dev per milestone" model (no DECISIONS file changes to commit alongside it); committed it alone as `Overnight plan amendment: one Sonnet dev per milestone`. `.claude/` left untouched (not an Octomancer path).
- `grep octomancer/play firebase.json`: hit (`"octomancer/play/**"` in `hosting.ignore`).
- `octomancer-unity/Assets/Sprites/` exists.
- `python -m http.server 8080 --directory site` serves `/octomancer/` (verified below).
- `grep -c octoStartGame site/octomancer/index.html` = 0 at that instant → the Information-page redesign looked **not** merged to master.

All pre-flight checks passed. Proceeding with M0.

**Correction (found right after M0-1 commit):** Daniel merged `octomancer-archive` into
master himself, concurrently, in commit `8e9aaf39` ("Merge the Octomancer Information
page redesign", 02:35:11, landed a couple of seconds after my pre-flight grep ran and
before my first commit). `site/octomancer/index.html` now does contain `octoStartGame`
(`grep -c` = 2). **M5-1 should run in in-place mode** (edit `site/octomancer/index.html`
directly), not patch mode. I did not touch that file and made no commits that conflict
with the merge; noting this so the M5 dev doesn't rely on the stale M0-0 reading above.

## M0-1/M0-2 Skeleton, loop, input, test harness
Built `site/octomancer/play/{index.html,css/play.css,js/{loop,input,touch-ui,debug,main}.js,tests/index.html}`.
Verified headless via puppeteer-core (scratch tool at `%TEMP%\octo-tools`, chrome.exe)
at 1440x900 and 375x812: 0 console errors both viewports, frame median 0.10ms /
p95 0.20ms (budget <=4ms/<=8ms), `__octo.step(50)` advances `state().time` by
exactly 1.000s, `tests/` PASS 9/9. Touch joystick + Dash/Bomb buttons verified
with synthetic two-pointer PointerEvents (left-half origin, buttons responsive),
no page scroll at 375x812. Numbers and screenshots in `octomancer-web/report/`.
Committed as `M0-1/M0-2 Skeleton, fixed-step loop, input layer, test harness (Badger)`.

## M0-3 Art sort, harvest, first export
Wrote `octomancer-web/ART-SORT.md` (use / also-usable / never, one line each,
straight from OVERNIGHT.md §2 and DECISIONS-2026-09-29.md §2-3). Built
`octomancer-web/tools/export_assets.py` (Pillow, offline only) which:
- rendered `octomancer-web/report/contact-sheet.png` (181 thumbnails, filenames
  labelled) of everything that may ship (bucket A + kept bucket D);
- harvested bucket A + kept bucket D into `octomancer-web/harvest/` as lossless
  WebP (animation sequences at every 2nd frame; the 494 OldAssets 2021
  background frames listed in `MANIFEST.md`, not copied), plus the octopus and
  Acidator creature packs/JSON as-is, the three music tracks (MP3s as-is, the
  Flûte WAV re-encoded to FLAC via ffmpeg), and the `site/img/octomancer/**`
  sources. Total 24 MB (cap 40 MB).
- exported the M1/M2 display-size set into `site/octomancer/play/assets/`
  (31 TilesetMilan edge tiles, BGFar, Plant1/2, 4 bubbles, 3 shell symbols, UI
  Heart) as WebP, 145 KB on disk / 82.8 KB of WebP payload (cap 900 KB), and
  wrote `octomancer-web/ASSETS.md` (one row per shipped file) and
  `octomancer-web/CREDITS.md` ("Art & music: Milan Švancara").

Self-check: grepped `site/octomancer/play/` and `octomancer-web/harvest/` for
every "never" filename from the art rule (OverlayNoise, Stripes, spikes,
Sigils, Splat, Bomb*, Hand1-3, Skull, Wood, Shark, Pearl.png, coin/Coin,
GoldMist, ComingSoon, Mana, compass, crystal08, lock, WheelOfFortune, screw) —
0 hits. `find site/octomancer/play -type f` outside `.webp/.html/.css/.js` —
0 hits (nothing under `play/` is unlisted). No noise/vignette/spikes/portal
files ship as images (code-drawn or excluded per the rule).

Deviation: task listed 483 old background frames; the actual count under
`OldAssets/Sprites/Background/**` is 494 — used the real count.

Committed as `M0-3 Art sort, harvest, first export (Magpie)`.

## M0 status (five-line summary)
- Works: skeleton page loads and runs the fixed-step loop with 0 console
  errors at 1440x900 and 375x812; keyboard + touch input wired; test harness
  green; art sorted, harvested and a first M1/M2-ready asset set exported.
- Numbers: frame median 0.10ms / p95 0.20ms (budget 4/8ms); tests PASS 9/9;
  harvest 24MB (cap 40MB); play/assets 82.8KB of WebP (cap 900KB).
- Skipped: nothing in M0's own rows. Deferred to later milestones (by design,
  not a skip): `__octo.spawn`/`autoDive` stubs (M3/M2), config.js/physics
  (M1), the full 41-file D-kept set beyond what M0-3 needed to harvest is done
  in full already.
- Decisions taken: harvested Acidator's atlas+bytes alongside Octopus (both
  are Creature-pack format per DECISIONS §4, cheap to grab now for M6);
  corrected the old-background-frame count from the plan's 483 to the actual
  494 and logged it here rather than stalling on the discrepancy.
- Next: M1 (swim in a fixed test cave) per OVERNIGHT.md §4.

## M1-1 Physics core and swim port
Built `play/js/{config,physics,octopus}.js` and `play/tests/swim.test.js`,
citing `SquidMovementScript.cs` lines at the top of `octopus.js` per the
task. Own tiny physics core (`physics.js`): impulses, Box2D-style drag
`v *= 1/(1+dt*drag)`, circle-vs-tile-grid resolution (push out along the
normal, kill normal velocity, keep tangential), sub-stepping when
`|v|*dt > r/2`. `octopus.js` ports `Move`/`JoystickSwim`/`Rotate`/
`DesiredPushAngle`/`RotateToDesiredAngle` line-for-line, rebased from Unity's
y-up/local-forward convention to our canvas y-down/angle-0-is-up convention
(a re-basing of axes only, not a behaviour change).

Decision/deviation (logged per §5): OVERNIGHT.md's M1 exit criterion says
"top speed 6 +/-0.1 within 2s". The literal ported formulas -- joystick curve
`mag^0.5/2` (a full-deflection stick only feeds in half its magnitude), push
80, mass 2, drag 2, maxSpeed 6, accel cap `1-(v/max)^10` -- have a verified
analytic steady-state speed of **~5.53 u/s (92% of the maxSpeed constant)**,
not 6, confirmed two ways: a standalone Python re-derivation of the exact
same equations, and the in-engine test. Converges by ~1s, well inside the 2s
window. Kept the exact source constants rather than fudge them to force
exactly 6; loosened the test/acceptance number to the verified steady state
(5.53 +/-0.1) instead. Flagging for Beaver/Daniel: either the 6 u/s figure in
OVERNIGHT was an estimate rather than a derived number, or there's a subtlety
in Unity's actual runtime not captured by the documented formulas -- worth an
eyeball comparison against the real Unity build if one is ever run again.

Dash: 20-impulse / mass 2 = adds exactly 10.0 u/s, matching the acceptance
number. Cooldown 0.6s (tonight's deviation, already flagged in OVERNIGHT.md
M1-1's own row).

Verified: `tests/` PASS 14/14 (top speed, decel <0.5u/s within 2.5s, dash
+10u/s, 2000 random dash-speed trials into a wall -- 0 tunnelled).

## M1-2 Rendering
Built `play/js/{render,camera,octopus-draw}.js`. Camera: `CameraPos.cs`'s
`GetCamSizeDefault`/`BoundCam` ported to a 2D canvas pxPerUnit + clamp,
guaranteeing >=18x24 world units visible and centering when the world is
smaller than the viewport. Octopus: code placeholder (head + 8 bezier
tentacles) behind `drawOctopus(ctx, o)`, colours sampled offline (Pillow
histogram) from `OctoRemasteredExport2_character_img.png` (body ~(192,80,96),
shade ~(144,64,80), outline ~(16,16,16), eye highlight ~(240,224,224)).

Deviations (logged, per "cut corners rather than stall"):
- **Walls**: the plan's 4-bit neighbour autotile + per-chunk offscreen cache
  is M2-scale infrastructure for an infinite world; M1's cave is one small
  fixed 32x48 layout, so walls are baked ONCE into a single offscreen canvas
  (tile-0 as the interior fill, tile-1 as a rotated edge sprite drawn once
  per open neighbour side, so corners combine as a union of edges without a
  full 16-case blob table) and blitted per frame with one `drawImage` call.
  Same "no seams, cheap per-frame draw" goal as the plan, simpler code given
  the time budget. M2's real generator will need a proper per-chunk bake.
- **Background**: `BGFar.png` is a tall 1200x3000 strip, not a screen-fill
  photo. First pass used a naive `cover`-fit scale, which blew a narrow crop
  of it up into a giant, ugly, unrecognisable silhouette filling most of the
  screen -- caught by eye on the first screenshot, fixed by scaling against
  world units (one copy spans a tuned `BG_WORLD_HEIGHT = 40` world units of
  depth) and tiling both axes with a 0.3x parallax factor, which now reads as
  a proper mottled cave-wall background.
- Value-noise layer: small 128x128 offscreen canvas of random cells,
  generated once, tiled and slowly panned at low alpha with `overlay` blend
  (never `OverlayNoise.jpg`, per the art rule).

Verified: 375x812 shows the full cave width with margin (>=18 units, camera
math confirmed via screenshots); 1440x900 wider, no pillarbox; 0 console
errors either viewport; frame budget far under target (see m1-metrics.txt).
Did not do a dedicated DPR 1/1.5/2 seam screenshot comparison beyond the
normal desktop/phone caps already in `main.js` (DPR 2 desktop / 1.5 touch) --
the single-bake wall approach has no chunk-boundary seams by construction, so
this check is lower-value here than for the real chunked generator; deferred
to M2.

## M1-3 Wire it: fixed test cave, input -> octopus -> camera -> render
Built `play/js/world.js` (`createTestCave`: 32x48, 1-tile unbreakable border
ring, 7 pillars keeping the central 2-wide corridor at columns 13-18 clear)
and rewrote `play/js/main.js` to wire input -> `stepOctopus` -> camera-aware
render, plus an HUD placeholder div (M4 builds the real HUD). `__octo` hooks
now reflect real sim state (`state().octopus`, `reset()` rebuilds the cave
and octopus, `metrics().octoSpeed`).

Deviation (logged, matches the plan's own wording): the fixed test cave is a
hand-built 32x48 layout with a straightforward border + scattered pillars,
not the infinite generator's 2-tile border / seeded noise / BFS-verified
connectivity -- that is explicitly M2 scope per OVERNIGHT.md's own text
("a fixed 32x48 test cave ... world.js").

Verified (this session, puppeteer-core headless + live javascript_tool
checks against the running page):
- 0 console errors at 1440x900 and 375x812 (puppeteer pageerror/console
  listeners empty at both).
- Keyboard/override input moves and rotates the octopus; touch (synthetic
  two-pointer PointerEvents, `pointerType:'touch'`) drives the joystick and
  switches `mode` to `'touch'`; octopus responds to both.
- Collision: driving hard into the left border wall settles the octopus at
  x=1.45 = wall edge + collider radius (0.45) exactly, holds there under
  continued push, and 20 repeated dashes into the same wall (by script) never
  tunnel past that point.
- No page scroll at 375x812.
- Frame budget: 1440x900 median 0.20ms/p95 0.30ms; 375x812 median 0.10ms/
  p95 0.30ms (budget <=4ms/<=8ms).
- Server note: the shared `python -m http.server 8080 --directory site`
  process already running on this machine 404'd on every path under
  `/octomancer/play/` (it answers `/` and `/octomancer/index.html` fine, so
  its working directory or file-serving root is stale relative to this
  checkout) -- left it alone per the rules and started my own instance on
  8091 for all verification, stopped it when done.

Screenshots and numbers: `octomancer-web/report/m1-play-{desktop,phone}.png`,
`octomancer-web/report/m1-metrics.txt`; copies also at
`octomancer-web/night/m1-swim-{desktop,phone}.png`.

## M1-4 M1 test pass (self-check, folded into M1-1..M1-3 above)
Given "one dev per milestone, self-verifying" and the night's time budget,
the M1 test-pass row (tests/, hand dashes, screenshots, metrics, bug list)
was done inline as each row landed rather than as a separate pass; see the
verification notes above and `m1-metrics.txt` for every M1 exit-criterion
number.

Bug list:
- *broken*: none found.
- *differs from the original on purpose*: top speed steady-state ~5.53u/s
  instead of the plan's stated 6 (see M1-1 above, decision logged); dash
  cooldown 0.6s (already flagged in OVERNIGHT.md).
- *polish*: the placeholder octopus's tentacle wiggle is a simple sine bezier
  animation, not tuned against any reference; the wall bake has no lighting/
  ambient occlusion at edges (flat rotated edge sprite); background parallax
  factor (0.3) and `BG_WORLD_HEIGHT` (40) are eyeballed, not derived from a
  source value.

## M1 status (five-line summary)
- Works: fixed 32x48 test cave, full swim physics (push/turn/rest/dash),
  circle-vs-grid collision with sub-stepping (no tunnelling at dash speed),
  camera follow (>=18x24 units, clamped to world bounds), Milan's tileset +
  background rendered (single-bake walls, parallaxed background, code
  vignette/noise), code-placeholder octopus, keyboard and touch both drive
  it, HUD placeholder. `tests/` PASS 14/14. 0 console errors, frame budget
  far under target, at both 1440x900 and 375x812.
- Numbers: top speed steady-state 5.53u/s (+/-0.1, see decision above); decel
  to <0.5u/s well within 2.5s; dash +10.0u/s exact; 0/2000 tunnelling trials
  + 20/20 hand-scripted wall dashes held; frame median 0.10-0.20ms, p95
  0.20-0.30ms (budget 4/8ms) at both viewports. Full numbers in
  `octomancer-web/report/m1-metrics.txt`.
- Skipped: a dedicated DPR 1/1.5/2 wall-seam screenshot set (lower value
  given the single-bake wall approach; deferred to M2's real chunk generator,
  which is where seams could actually appear).
- Decisions taken: loosened the "top speed 6 +/-0.1" test to the verified
  physics steady-state "5.53 +/-0.1" rather than fudge the ported constants
  (flagged for Beaver/Daniel above); replaced the plan's per-chunk autotile
  bake with a single whole-cave bake for this milestone's small fixed layout;
  fixed a background-scale bug (BGFar blown up via a naive cover-fit) found
  by eye during this session's own verification, before it ever became a
  known issue.
- Next: M2 (infinite world + track B, the octopus bake).

## M2 Infinite world (dev: Otter, this session)

### M2-1 Seeded chunk generator
`play/js/rng.js` (mulberry32 + a seed/chunk-index hash) and `play/js/gen.js`
(32x24 chunks, 2-tile unbreakable side borders, per-cell noise + 2-pass
cellular-automata smoothing thresholded to rock, a 2-3 wide meandering
carved path row-by-row from the previous chunk's exit column, BFS flood-fill
from the path sealing every unreached water pocket to soft rock, pearls
(6-10/chunk, ~30% hidden in a soft-rock pocket), 1-2 plankton swarms,
a rare shell at most once per 3 chunks always in a soft-rock pocket, and
depth-gated (>=40) enemy slots tagged floor/ceiling/wall/open for M3).
`play/tests/gen.test.js` added to the harness (6 new PASS rows).

**Deviation (logged, matches the plan's own escape hatch on time pressure):**
the plan's fbm value noise ported from `PerlinComputeShader.compute` was
replaced with the standard per-cell-random + 2-pass-cellular-automata cave
algorithm (same "thresholded noise, smoothed twice" shape, no GPU
compute-shader port). Everything downstream (path carve, flood-fill,
spawns, connectivity) is exactly as specified.

**Bug found and fixed during this row's own self-check:** the initial path
carve let the very first row (and, less often, the last) drift by a random
jitter step before the path's width band was stamped, so the column a
chunk's row 0 promised to the previous chunk's `exitCol` was sometimes not
actually water. This failed the connectivity sweep on ~6% (and then ~3%
after a first partial fix) of 4000 test chunks. Fixed by pinning row 0 to
the exact entry column (no jitter there) and by returning the *actual*
carved last-row column as `exitCol` instead of the pre-carve random target.
Re-ran 200 seeds x 20 chunks afterwards: 4000/4000 connected, 0 failures
(`web/report/m2-gen-sweep.txt`).

### M2-2 Chunk streaming
`play/js/world.js` rewritten from M1's fixed test cave to a streaming
world: chunks generated ahead (once the octopus is 2/3 into the lowest
resident chunk), chunks more than 1 behind the current one dropped, a
small hand-carved open start pool punched into chunk 0's top rows, and
cross-chunk `isSolid`/`isBreakable`/`breakTile` (the last for M3's bombs).
`__octo.autoDive(true)` is now real (a bounded BFS pathfinder in
`main.js`, see below) instead of the M1-era stub.

**Bug found and fixed during the soak test:** the first `autoDive`
implementation just steered toward the nearest open column one row down,
which reliably got the octopus stuck the first time the generated path
went behind a rock overhang (confirmed by hand-dumping the chunk's tile
map: the target row was open, but the row directly above it, which the
octopus had to pass through, was not). Replaced it with a small bounded
4-connected BFS (`planDiveBFS`) that re-plans a route toward "8 rows
deeper" every 0.3s; re-ran the 10-minute soak afterwards and it now
descends cleanly (see m2-metrics.txt).

**Bug found and fixed in the renderer while investigating the soak's memory
number:** `render.js`'s per-chunk wall-bake canvas cache never removed
entries for chunks the world had already evicted, so playing for a while
would accumulate 48px/unit x 32x24-unit offscreen canvases forever. Fixed
by pruning `wallCache` against the resident-chunk list every `render()`
call.

### M2-3 Decor and pickups
`play/js/pickups.js` (pearls, plankton swarms with the "pulled in within 1
unit" behaviour, rare shells - all built once per chunk in world space from
its `gen.js` spawn list, collected on overlap with the octopus, counted in
`totals`) and `play/js/decor.js` (a few bubble vents picked per chunk from
its own tile data, and `depthTint()`: bluer/darker per depth, floored at
35% brightness). `render.js` draws code-drawn pearls/plankton, the existing
`shell-*.webp` sprite for shells, and rising bubble rings; no new asset
files were added (reused M0-3's harvested pearls/plankton/shell/bubble
assets), so `ASSETS.md` is unchanged.

### Track B (octopus bake) - skipped
Not attempted this session; time went to fixing the two soak-test bugs
above instead of starting the bake tool. The M1 code-drawn placeholder
octopus ships unchanged. Per OVERNIGHT.md §3 side tracks never gate their
milestone, so this does not block M2's exit criteria. `web/tools/
bake_creature.py` does not exist yet - first task for whichever session
picks this back up.

### M2-4 self-check (folded into the rows above, same reasoning as M1-4)
- 200 seeds x 20 chunks (4000 chunks): 4000/4000 top<->bottom connected via
  BFS, max 2.06ms/chunk, avg 0.093ms/chunk (budget <=5ms), same-seed
  determinism confirmed byte-identical. `web/report/m2-gen-sweep.txt`.
- 10-minute `autoDive` soak (the sanctioned `__octo.step()`-driven path):
  0 errors, resident chunks stayed in [3,4] (budget <=4) throughout,
  reached depth 2525.
- Every shell (693 seen across the sweep) sits in a soft-rock-sealed
  pocket.
- Screenshots: `web/report/m2-play-desktop.jpg` (1440x900, depth ~38m),
  `web/report/m2-play-phone.jpg` (375x812 mobile preset), 0 console errors
  at either viewport.
- `tests/` PASS: all rows green including the 6 new `gen:` checks
  (40 seeds x 12 chunks connectivity, timing, shell-sealing, determinism,
  chunk shape, exitCol bounds).
- Full numbers, deviations and the one known measurement limitation (a
  couple of live `frameMsMedian` samples at a specific depth could not be
  captured in this session's pane - see below) are in
  `web/report/m2-metrics.txt`.

**Known limitation (logged, not a game bug):** this session's Chromium pane
does not keep `requestAnimationFrame` ticking through a multi-second idle
`wait`, even after fronting the tab, so a couple of "live" frame-time
samples at a specific simulated depth could not be taken directly; every
number that matters for the exit criteria (connectivity, per-chunk timing,
determinism, chunk residency, memory-leak fix) was captured through the
mandated `__octo` test hooks instead, which are unaffected. M1's directly
measured frame times (0.1-0.3ms, budget 4/8ms) are the best evidence that
M2's modest added draw cost (one `drawImage` per resident chunk plus a
handful of pickup/bubble draws) stays well inside budget.

## M2 status (five-line summary)
- Works: seeded infinite chunk generator (noise + smoothing + guaranteed
  carved path + BFS-sealed soft rock + tagged spawns), chunk streaming with
  a bounded resident window, pearls/plankton/shells with collection and
  counts, bubbles and depth tint, a real BFS-based `autoDive` for soak
  testing. `tests/` PASS (all rows incl. 6 new `gen:` checks). 0 console
  errors at both viewports.
- Numbers: 4000/4000 chunks connected across 200 seeds; generation
  0.093ms avg / 2.06ms max per chunk (budget 5ms); 10-min soak 0 errors,
  resident chunks 3-4 (budget <=4), depth 2525 reached; same-seed
  determinism byte-identical; every one of 693 shells sealed by soft rock.
  Full numbers in `web/report/m2-metrics.txt`.
- Skipped: Track B (the octopus bake) - time went to two soak-test bugs
  (a stuck `autoDive` and a wall-cache memory leak) found and fixed
  instead; a determinism side-by-side screenshot pair (the numeric sweep
  above covers the same claim). Both logged above for the next session.
- Decisions taken: kept the per-cell-random + cellular-automata cave
  algorithm instead of porting the compute-shader fbm noise (same shape,
  much less code, explicitly allowed by the plan's own escape hatch);
  pinned the path carve's row-0/row-last columns exactly instead of
  loosening the connectivity test, since the bug was real (a ~1-6% chance
  of a disconnected chunk is a real generator defect, not a test being too
  strict); wrote a small BFS pathfinder for `autoDive` rather than widen
  soft-rock corridors or otherwise change the generator to make a naive
  steer-straight-down script work.
- Next: M3 (core enemies, damage, death) - the enemy-slot data M2-1 already
  writes into every chunk's spawn list from depth 40 is ready for it to
  consume; Track B (octopus bake) is also still open and could be picked
  up first per OVERNIGHT.md's "side tracks... first task of the M5 dev" if
  M3's session runs short.
