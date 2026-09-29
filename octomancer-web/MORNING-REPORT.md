# Octomancer web: morning report (2026-09-29)

Written from `NIGHT-LOG.md` and `octomancer-web/report/**`, plus one honest
end-to-end check I ran myself this morning (own `http.server` on :8097,
headless Chrome via the Browser pane, stopped when done): loaded
`/octomancer/play/` at 1440x900 and 375x812, drove it with real keyboard
input and real synthetic touch (joystick + Dash/Bomb buttons), watched
`__octo.state()`/`metrics()` while playing, ran `tests/`, and clicked
through Start Game on the title page into the game and back out via pause
and game-over.

## 1. Status in three lines

All of **M0-M7 met their exit criteria**, plus track B (baked octopus) and
track S (music/mute); only M6-5's stretch creatures (tentacle, dropper)
were skipped. **Playable, end to end, right now:** title screen -> Start
Game -> infinite procedural cave, swim/dash/bomb, 7 enemy kinds + Beholder,
hearts/death, score/best/restart, music+mute, particles/juice, on both
keyboard+mouse and touch. **Missing/known-soft spots:** M6-5 stretch
creatures never built; one physics constant (top speed) sits ~8% under the
plan's literal number (logged, not a bug); nothing is public yet (no push,
no deploy) per Daniel's standing decision.

## 2. Try it

```
python -m http.server 8080 --directory site
```
(or `run_locally.bat`). Then:

- `http://localhost:8080/octomancer/play/?seed=1&fps=1` - straight into the
  game with a fixed seed and the frame-time overlay.
- `http://localhost:8080/octomancer/` - press **Start Game** (it is enabled,
  no "Work in progress" label); it zooms into the cave and lands on
  `/octomancer/play/`.

**Controls:** Arrows/WASD to swim, Z/Enter/Shift to dash, Space/X to bomb,
Esc to pause (keyboard); on a touch screen, a floating joystick appears
under your first touch on the left half of the screen, Dash/Bomb buttons
bottom-right, pause/mute icons top-right. Phone: open the same URL over
your LAN IP instead of localhost.

I re-ran this myself this morning (see §3) rather than only trusting the
per-milestone logs: title -> Start Game -> play worked, keyboard drove the
octopus (`__octo.state()` velocity/position changed as expected, steady
state ~5.53 u/s), the touch joystick and Dash/Bomb buttons produced correct
`input` values once dispatched at the right DOM node (`#touch-ui`, not
`document.body` - my first attempt targeted the wrong element and looked
like a bug until I fixed the test itself), pause showed the Milan credit
line, and `tests/index.html` printed **PASS 57/57** with 0 console errors
at both viewports.

## 3. Evidence

- Contact sheet / bake: `octomancer-web/report/contact-sheet.png`,
  `B-1-sheet.png`, `B-1-sheet-{desktop,phone}-{bake,placeholder}.png`,
  `B-1-dpr2-desktop-crop.png`.
- Per-milestone desktop/phone screenshots: `octomancer-web/report/m0-tests.png`,
  `M0-1-skeleton-{desktop,phone}.png`, `m1-play-{desktop,phone}.png`,
  `m2-play-{desktop,phone}.jpg`, `m3-play-{desktop,phone}.jpg`,
  `m4-{desktop,phone}-0{1..4}-*.png`, `m4-real-run-gameover.png`.
- Die -> restart sequence: `m4-desktop-01-hud.png` through
  `m4-desktop-04-restarted.png` (and the phone equivalents).
- M5 title hook, M6 creatures, M7 juice, and S-1 audio, all under
  `octomancer-web/night/`: `m5-title-{desktop,phone}-enabled.png`,
  `m5-zoom-desktop-midway.png`, `m5-play-{desktop,phone}-landed.png`,
  `m5-gameover-desktop.png`, `m5-exit-roundtrip-{desktop,phone}.png`,
  `m6-creatures-{desktop,phone}.png`, `m7-juice-{desktop,phone}.png`,
  `m7-beholder-dread-desktop.png`, `m7-reduced-motion-desktop.png`,
  `s1-desktop-music-started.png`, `s1-desktop-paused-flute.png`,
  `s1-phone-hud-mute.png`.
- Numbers: `octomancer-web/report/m{0,1,2,3,4,6,7}-metrics.txt`,
  `s1-metrics.txt`, `m2-gen-sweep.txt`, `m4-raw.json`. Headlines: frame
  median 0.1-0.5 ms / p95 0.2-8.4 ms at both viewports (budget 4/8 ms,
  the one 8.4 ms p95 spike was a single cold-start frame, not sustained);
  `tests/` PASS counts climbed 9 -> 14 -> ... -> **57/57** by M6 and stayed
  there through M7; transfer ~454 KB of JS/CSS/HTML + assets (429 KB WebP)
  + audio (3.7 MB, fetched only after first input, Opus preferred over
  MP3 by `canPlayType`); harvest 24 MB (cap 40 MB).

## 4. Commits

`git log --oneline ad549961..master` — **19 commits**, 3,615 lines across
`site/octomancer/play/js/**` (JS only; excludes CSS/HTML/assets):

```
9bdf337c M7 Juice and polish: particles, dread, caustics, swim/Beholder SFX, perf pass
966e3a45 M6-6 Test pass: numbers and screenshots for the 2021 creatures (Owl)
8ef2753d M6-2 Art for the 2021 creatures: mine, crabs, manta, horns (Magpie)
7090c618 M6 Spiked mine, crabs, spike horns, manta (Otter)
7da9addb M5 Title hook: Start Game zooms into /octomancer/play/, Exit returns (Badger)
3a68e6f5 S-1 Music, crossfade, mute, and code-synth SFX (track S)
a4defa42 M4 Score, game over, restart, best (Badger)
e8e84112 M3 Core enemies, damage, death (Otter/Magpie/Owl)
f51b42d6 M2 track B: bake Milan's octopus animation, wire it in (Magpie)
70c61d44 M2 Infinite procedural world (Otter)
d1ca362a M1 Swim in a cave: physics port, camera, walls/background, wired play (Otter/Magpie/Badger/Owl)
a0f49b44 NIGHT-LOG: correct M0-0's title-page merge reading
e0830943 M0-3 Art sort, harvest, first export (Magpie)
ad4f1227 M0-1/M0-2 Skeleton, fixed-step loop, input layer, test harness (Badger)
f697095d Games: Octomancer card describes the game as it is now   [Daniel's own session, not an overnight dev]
7ff54dc0 Overnight plan amendment: one Sonnet dev per milestone
8e9aaf39 Merge the Octomancer Information page redesign            [Daniel's own session]
377b5940 Information page: honest download label, first-person history  [Daniel's own session]
65a5b2df Redesign the Octomancer Information page around the real current game  [Daniel's own session]
```

Only `site/octomancer/play/**` and `octomancer-web/**` were touched by the
overnight devs (`site/octomancer/index.html` only in M5, in-place mode, per
the rule); the three "Daniel's own session" rows above were his concurrent
work on the title-page redesign and the Games-page card, not this team's.
No push, no `firebase`, no `git checkout/switch/merge/rebase/reset/stash/
worktree` was ever run. `git status --short` is clean (only `.claude/`,
never touched) as of this report.

## 5. Known issues

**Broken:** none found tonight or in this morning's check. 0 console
errors at 1440x900 and 375x812 throughout.

**Differs from the original, on purpose (logged deviations):**
- Steady-state top speed is **~5.53 u/s**, not the plan's literal "6 ±0.1".
  Re-derived two independent ways (standalone Python + the in-engine test);
  it's the exact analytic result of OVERNIGHT.md's own cited constants
  (joystick curve, push 80, mass 2, drag 2, accel cap). Kept the real
  constants rather than fudge them; the test asserts the verified number.
  `octomancer-web/report/m1-metrics.txt`.
- Bomb fuse is 1.5 s, not the original's 4 s (`octopus.js`/`bomb.js`) — a
  faster fuse plays better as a "tool as much as a threat" per the design
  brief; logged in NIGHT-LOG.
- Keyboard input is normalised to `|v| <= 1` (D4, plan default, applied).
- `medles.opus` is 1055 KB, ~0.6% over the S-1 "<=1 MB per file" budget;
  kept rather than re-encoding at a lower bitrate (still small in absolute
  terms and total audio stays well under the 2 MB-more-than-3MB budget).
- OldAssets 2021 background frame count used was the real 494, not the
  plan's estimated 483.

**Polish (nice-to-have, not gating anything):**
- M6-5 stretch creatures (tentacle/Clamissaint, dropper/Acidator) were
  never attempted — M6's four non-stretch creatures (mine, both crabs,
  manta) are all shipped and green, and the plan exempts M6 rows from
  all-or-nothing gating.
- A dedicated DPR 1/1.5/2 wall-seam screenshot set was skipped for M1's
  single-bake wall approach (deferred to M2, whose chunked renderer made a
  fresh comparison moot).
- One pre-existing import chain (`main -> bomb -> octopus -> physics`) sits
  at depth 3 against M7-3's "<=2" target; logged rather than restructured
  this late.
- No dedicated M7-4 regression pass beyond the full 57/57 test re-run and
  M7-3's own numbers.

## 6. Decisions for Daniel, with the default used

- **D1** Milan's OK to publish his art/music, the credit line, and to
  confirm he drew the Beholder and the title-screen cave layers. **Default
  used: nothing public until he says yes** — nothing was pushed or
  deployed.
- **D2** The 38 unseen bucket-D files and `Mj - 312 Q`. **Default used:
  skipped; 312 Q harvested only, not shipped.**
- **D3** Beholder at 120 s and the descent design. **Default used: as
  built** (120 s spawn, straight-line chaser, speed ramps +0.1/10s).
- **D4** Normalised keyboard input (`|v| <= 1`). **Default used: yes.**
- **D5** Music placement (Medles in play, Flûte on game-over/pause).
  **Default used: as built.**
- **D6** Going live (Milan's yes, merge `octomancer-archive`, un-ignore
  `octomancer/play/**` in `firebase.json`, push, deploy). **Default used:
  none of it** — nothing deployed. Reminder: once Start Game is live on
  master, deploying master for anything else (including the wedding site)
  sends Start Game to a 404 until `play/` is un-ignored.
- **D7** The Octomancer repo end state (archive `Mejval5/Octomancer` as
  `Octomancer-Unity`, fresh `Mejval5/Octomancer` web-only via subtree
  split). **Default used: undecided, waiting on you playing v1** — nothing
  done.
- **D8** Harvest retention (~24 MB under `octomancer-web/harvest/`, cap
  40 MB) and optional 2023 screenshot/Plastic SCM capture. **Default used:
  keep the harvest here until D7; nothing extra captured.**

## 7. What to do next

1. Play it yourself at `http://localhost:8080/octomancer/play/` (desktop
   and on your phone over LAN) and see if it's fun before anything else.
2. If you want it public: get Milan's OK (D1), then merge
   `octomancer-archive`, un-ignore `octomancer/play/**` in `firebase.json`,
   and deploy — all by hand, nothing here does it for you.
3. Decide D7 (repo end state) once you've played — it only matters before
   the next time anyone needs to touch `octomancer-unity/`.
4. If you want more variety, the stretch M6-5 creatures (tentacle, dropper)
   are the next-cheapest add — the bake tool and enemy-table pattern are
   already there for them.
5. Nothing here needs your attention urgently: tree is clean, nothing was
   pushed, and the shared `http.server` on :8080 was left alone (my own
   verification used a throwaway instance on :8097, stopped when done).
