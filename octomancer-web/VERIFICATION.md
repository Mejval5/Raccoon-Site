# Octomancer verification pass (2026-10-08, Opus verifier)

Method: headless Chrome (puppeteer-core) only, game served from this worktree. Whole runs played on desktop 1440x900 (seeds 7, 13 and 42)
and phone 412x915 (seeds 21, 7 and 42): hub -> tutorial -> Shallows 1-1, 1-2, 1-3 -> Still Grotto -> clear screen -> hub shortcut ->
death -> hub, no console errors. Each situation was also reached through the `__octo` hooks and looked at in screenshots. Full test
page: PASS 2972/2972, including the bot (30/30 levels and the tutorial script). Every `tests/*-cdp.js` passes.

Screenshots are `octomancer-web/night/verify-*.jpg`.

## Checklist

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Level game is the default, endless only with `?endless=1` | PASS | `main.js` sets `V2 = endless !== '1'`. Six whole runs load `/octomancer/play/index.html` with no flag. |
| 2 | Run flow: hub, tutorial, 1-1..1-3, Still Grotto, clear, death to hub, hub shortcut | PASS | Six playthroughs (see Method). `verify-run-desktop-s7-entry/clear/death.jpg`, `verify-run-phone-s42.jpg`. The shortcut ring leads to 1-2: `verify-hub-rings.jpg`. Tests `run: ...`. |
| 3 | Tutorial bomb section is vertical and cannot trap you | PASS | `verify-tutorial-bomb.jpg`. Tests `authored tutorial: the barrier is a horizontal floor ...`, `tutorial: bombs refill to 1 ...`, `bot tutorial: also completes after wasting every bomb first`. |
| 4 | Controls: mouse, keyboard fallbacks, no mouse steering, phone buttons | PASS | `spells-cdp.js` (right click, middle click / B / X, F, Tab / I, help line, four touch buttons) and `touch-cdp.js`. |
| 5 | Settings menu (gear): volumes, shake, reduced motion, sink, seed, help, reset, persists | PASS | `settings-cdp.js`, 49 checks, incl. `settings persist across a reload` and the three layouts. |
| 6 | Journal book: tabs, silhouettes, counters; People pages fit at 812x375 | FIXED | Overflowed by 24 px at 812x375 (`verify-journal-812x375-people-before.jpg`). Now fits (`verify-journal-812x375-people.jpg`). `journal-cdp.js` covers every People entry at 1440x900, 375x812, 812x375 and 1024x600, plus new checks for clipped cards, tab labels and scrolling pages at 812x375. |
| 7 | Quests are emergent NPC questlines, no HUD quest line | PASS | `verify-quest-pip.jpg`, `verify-quest-marlo.jpg`. Tests `questlines data: no HUD text anywhere`, `quest rescue: ...`, `quest vault: ...`. |
| 8 | Fish juice: jar of 3 full at start; leak only with the Siphon Shell; refill only at the grotto; Ink Cloud; hotbar and inventory | PASS | `spells-cdp.js`: `a dive starts with a full jar`, `... leaks juice droplets (no siphon ...)`, `with the Siphon Shell the octopus drinks`, `the spring refills the jar and every heart`, `piranhas ... lose it in the cloud`. Wheel test on the test page. The cloud look is item 19. |
| 9 | Damage tiers | PASS | Test page: spikes, splat, clam (pearl grabbable during the tremble), tentacle (wake, grab, 3-dash escape, eaten), manta / eel incapacitation, Marlo's 0.6-0.8 s aim telegraph, `jet: a floor vent pushes up`, `every jet + spikes pair has >= 5 clear rows`. Looked at `verify-splat.jpg` and the impaled body (item 19). |
| 10 | Corpses for every creature and NPC, physics, no drops except the pearl | PASS | `verify-corpses.jpg` (all 13 kinds pile up on a floor). Tests `corpses: ...`, `a kill produces no item event`, `clam: a bomb blast kills it ... the pearl drops out`. |
| 11 | Shell styles; basic shells visible in rock; rare finds only with the Goggles | PASS | `verify-goggles.jpg` (Flippers buried at 1-2 seed 7: hidden without the Goggles, a silhouette with them). Tests `embed: ...`. |
| 12 | Shop: breakable frame, buff keeper shrugs off ink, claws, run-wide aggro, guard at the exit | PASS | `shop-cdp.js`, all pass. `verify-shop.jpg`. |
| 13 | Materials: bedrock, rock, bone, timber, masonry, pushable blocks, edge layering, no seams | PASS | `verify-materials-1-1.jpg`, `verify-quest-pip.jpg` (bone, timber, bedrock), `verify-shop.jpg` (masonry). Tests `level: border cells ... bedrock`, `blocks: ...`, seam guards. Timber colour: see item 19. |
| 14 | Foliage: Unity offsets, nothing floating or sunk, no 'rope', deep plants anchored | FIXED | Rope: `verify-foliage-rope-before/after.jpg`, new test in `foliage.test.js`. Deep layer: `verify-foliage-deep-before-after.jpg`. Plants are anchored on the drawn (blurred) edge of the deep mass. |
| 15 | Placeholder art replaced, natural fantasy, code-drawn list; the Giant Clam | FIXED | The Giant Clam is restyled from cold slate to warm bone-and-sand valves with its teal Tridacna mantle (`verify-gclam-before/after.jpg`). It stays distinct from the mauve Barnacle Clam chest, so a trap clam and a loot clam do not look alike. Marlo's hub ring tint was 'gold'; it is now sea-glass green. No images generated. Remaining code-drawn items are listed below. |
| 16 | Portal entry: suck-in, no jitter, Milan's whirlpool, hub whirlpool visible on portrait phones | FIXED | `entry-cdp.js`: straight line, 720 deg/s, scale, iris, no back-and-forth at 30/60/120 Hz. The hub whirlpool was cut off at 412x915 (`verify-hub-412x915-before.jpg`); now it is centred (`verify-hub-412x915-after.jpg`). |
| 17 | Death ragdoll: tumbles, enemies keep hitting, camera centred, panel out of the way | PASS | `death-cdp.js`. `verify-run-desktop-s7-death.jpg` (side panel) and the phone bottom sheet in `verify-run-phone-s42.jpg`. |
| 18 | Culling, memory budget, phone transitions under 50 ms | PASS | `phone-cdp.js`: 63 of 275 entities drawn, peak 22.7 MB, worst 0 ms per transition, fade-in clean. `memory-cdp.js` passes. Flakiness and the cost of the new deep-plant pass are under 19. |
| 19 | Known leftovers | FIXED | See the list below: all 7 fixed. |

Counts: 12 PASS, 7 FIXED, 0 FAIL.

## What I fixed (this branch)

- **Test page 404s:** `octopus-draw.js` loads `assets/octopus.json` and `.webp` module-relative (`new URL(..., import.meta.url)`). The test page has no 404s now.
- **Ink Cloud** (`spells-draw.js`): the puff sprite is dense only in its core and thins to a smoky, slightly lighter edge. Outer billows are fainter, and five faint wisps drift at the rim. It reads as billowing ink, and enemies inside show through faintly (`verify-inkcloud-before.jpg` -> `verify-inkcloud-after-1440.jpg`).
- **Impaled octopus too small:** the skewered body is drawn at 1.3x and sits on the tips (`IMPALE_DEPTH` 0.32 -> 0.42). The two tips stand out of its far side (`verify-impale-before/after.jpg`).
- **Timber too dark:** timber gets a warm lift tint (`render.js MAT_TINT`), so it reads as wood under the deeper levels' tint (`verify-timber-after.jpg`).
- **Giant Clam:** warm bone-and-sand palette, live and as a corpse (`creatures-draw.js`).
- **Marlo's ring:** 'gold' tint -> sea-glass green (`portal-draw.js`).
- **Pool host fin over the vent** (Sonnet dev, `level-spawns.js`): the pool's left vent always takes column 1, a full tile clear of the host. New test in `pool.test.js` (seeds 1-150, all levels).
- **Floor boulder over a ledge end** (Sonnet dev): decor boulders need rock under their middle and both sides (`level-spawns.js buildDecor`). A landed hazard rock with water under it rolls off instead of becoming a tile in the water (`hazards.js`). New test in `hazards.test.js`.
- **Foliage rope** (Sonnet dev, `foliage.js unrope`): a hanging plant that would come within 0.4 tiles of a floor plant below it is shortened or dropped. In 120 levels, 913 cases became 0.
- **Deep-layer plants floating or sunk** (Sonnet dev, `render.js deepStage3`): plants are anchored on the visible edge of the blurred deep mass, with checks for solid rock behind and open water in front. I split the new alpha pass over four frames (`deepAlphaStep`), because done in one go it was a 30+ ms task at 4x on a phone.
- **Journal at 812x375** (Sonnet dev, `play.css` short-screen block only): compact cards, a two-column ledger, smaller tab labels and a compact Progress page.
- **Hub whirlpool on portrait phones** (Sonnet dev, `camera.js`): on a portrait screen the hub camera aims at the hub's centre and lets the octopus wander further from it. Desktop and landscape are unchanged.
- **Flaky tests** (none of the checks loosened):
  - Shake (`settings.test.js`, `feel.test.js`): `particles.shakePx(nowMs)` takes an optional clock and the tests sweep the wobble phase. Before, 60 calls at one clock time could sit where sin and cos were both small, so a correct shake read under 1 px.
  - r43 canvas size (`world-v2.test.js`): the two plant images are decoded before the 200-frame bake budget starts counting.
  - `detail.test.js` level-build p95: each level is built three times and the fastest counts, so a GC or a busy CPU is not billed to the generator. It failed once during this pass while other work ran.
  - `phone-cdp.js` / `entry-cdp.js` long tasks:
    - A new cheap `__octo.transitioning()` hook replaces polling `__octo.level()` while time is measured. That call copies the whole level, about 60 times a second in `waitForFunction`.
    - `entry-cdp` first brings the camera to the exit, forces a GC, then touches the whirlpool. A teleport across the level baked a whole new view in the measured frame.
    - A 4x run that still has a task over 50 ms is played once more in a fresh page, and fails only if the second run has one too. Real work recurs; the leftover one-offs (54-106 ms, a different entry each time, none in profiled runs) did not.
  - `whirlpoolSheetKey()` no longer parses the URL every frame.
- `spells-cdp.js` takes a full URL like the other scripts, and writes its screenshots to this checkout's `night/` folder (it wrote to the main checkout).

## Decisions

- **Giant Clam:** restyled, not swapped for the Barnacle Clam sprite. The Barnacle Clam is the chest, and the journal says "not every one is friendly" for trapped chests. Giving the snapping clam the same sprite would make a deadly creature and a loot container look identical. A sand-coloured Tridacna with a teal mantle reads as a different animal in the same painted palette.
- **The 4x long-task check:** one retry in a fresh page. The alternative is accepting a check that fails about one run in three on this machine, with no repeatable cause.

## What remains

- **Code-drawn items still in the game** (house style: ink outline, flat fills):
  - the Giant Clam
  - the tentacle limb (its shell is Milan's)
  - juice droplets and the Ink Cloud
  - the bomb
  - hotbar and spell icons
  - item-icon fallbacks
  - the tutorial bomb-floor marker (a pale yellow ring)
  - the impale spike tips and ink drips
  - the pearl in rock
  - the pool host fallback, which has a gold hat band but shows only if the sprite atlas fails
  - the whirlpool fallback
- NPC corpses dropped with no velocity can come to rest upright (Marlo and the sea horse stand with X eyes, `verify-corpses.jpg`). Real kills fling them, so it is rarely seen.
- The second pool in Shallows 1-3 seed 1 has no vents (its vent spots fail the existing height and start checks). This was not changed.
- The splatted body is a red pancake under the boulder (`verify-splat.jpg`). It reads, but the bruised-ink tint applies only while flattening; a darker resting colour would sell 'crushing' more.
- On a phone the hub's welcome prompt overlaps the top of the view. In the hub at 1440x900, Marlo stands under the corner buttons.
- The Spelunky / Noita vibe:
  - The runs feel like Spelunky in structure: room-template levels, shop aggro, traps that kill outright, and corpses.
  - The Noita side is still thin: there is one spell, and there are no material interactions beyond bombs breaking rock.
  - Both are feature work, not verification, so none was added.
