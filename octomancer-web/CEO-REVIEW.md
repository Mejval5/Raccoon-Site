# CEO review: Octomancer web port, pure HTML/JS plan

Reviewer: Fox. Date: 2026-09-28. Reviewed: `ARCHITECTURE.md` v2 (Beaver), `PLAN.md` v2 (Kitty). Replaces the review of the rejected Unity plan. Spot-checked: Kitty's body values are right (`MainGame.unity:39463-39466` mass 2, drag 2, gravity scale 0.01; `:39526` dash 20); the title page has no zoom today, only parallax, and Start Game is a disabled `<span>` (`site/octomancer/index.html:157`); `firebase.json` deploys all of `site/` with no octomancer ignore.

## Verdict: approved with changes

The direction is right: a small game that is still the real thing (the swim maths, the breakable cave, pearls, portal, endless descent with the Beholder), 1.5 MB to playable instead of 15, no build step, no download before Start, placeholders so no gate waits on Milan. M0 can start now. The changes below land before I1 is signed.

## Required changes

1. **The feel is built on the wrong body (ARCHITECTURE §1 movement bullet, §3 input; PLAN I1-1, I1-4).** §1 still carries the Bomb's values and §3 says diagonals are normalised; both are wrong. Beaver corrects the document itself before I1-1 is signed, since devs read ARCHITECTURE, not Kitty's note. I1-1 adds a corridor test: the fitted circle must pass every gap in Level01-04 that the 20-point polygon passes, or the octopus sticks where the original swims. I1-4's tests add drift at rest (gravity 0.01 means it barely sinks; that is part of the feel).
2. **The handover is the product and it is last (PLAN §4 I4, ARCHITECTURE §6).** Move the title handover to I1 as a Badger task: `pointerdown` warm import, AudioContext in the click, the 1.2 s zoom in, `mount`, Exit and Back zoom out, Escape off while mounted. On production Start Game stays the disabled span until I4; locally it is enabled behind `?play=1`. From I1 on every gate, including Daniel's device run, starts from Start Game on the title page. The zoom is new work, not reuse, so it must not wait until the end to be seen on a phone.
3. **"Nothing deploys before D6" is a promise, not a guard (PLAN §2 assets, M0-5).** `firebase.json` has `public: "site"`; any deploy of the site for another reason ships `play/` with Milan's exported art. M0-5 adds `"octomancer/play/**"` to `hosting.ignore` now. Removing it is the D6 close-out step, and `check_site.py` refuses a deploy with that line missing while `ASSETS.md` has a *pending* row.
4. **No build step means a module waterfall on 4G (PLAN §2 time to play, M0-2, I1-11).** Nested ES imports load one depth level per round trip; four levels on Fast 4G is ~600 ms before any code runs, against a 2.5 s target the agents cannot measure. `play/index.html` lists every module in `<link rel="modulepreload">`, the graph stays flat, and Owl reports request count and import depth with the transfer size at every gate, with a cap of ~25 requests to playable.
5. **Daniel's feel check gates I2 with no slip rule (M I1 exit, D4).** Kitty books the slot before I1 starts, as written. If it slips more than three days, I2 starts on Beaver's sign-off of the analytic swim tests, the feel verdict becomes an I2 exit item, and any "differs from original" list is fixed before I3. The constants are tunable; the calendar is not.

Accepted as written: the v1 cut list and its order, the physics-in-300-lines and Canvas 2D choices with PixiJS only as Beaver's escape hatch, the 2-day Creature timebox with the static-sprite fallback, the 200-seed generator test and the curated-rooms fallback for I3, the orphan `web` branch with the allowlist and predeploy check, the honest-copy rule.

## Decisions to push Daniel on, in order

- **D6 (Milan's OK and the three music files) first.** One message, the longest lead time, and the only decision that can kill the game after it is built. Recommend: send Milan the §5 table this week and get his web-use OK in writing; Daniel confirms the music is his.
- **D4 (device run at each gate).** Book the I1 slot now: his Android, his iPhone, Firefox on his PC, side by side with the Windows build. Fifteen minutes.
- **D1 (v1 scope).** Recommend yes, with the changes above.
- D2, D3, D5, D7, D8, D9: take Kitty's defaults. **D10:** decide after v1, but note now that the orphan tree is clean while the repo's history still holds the paid packages; "only the HTML game" will be true of the tree, not the repo. A public repo means a fresh repo from the `web` branch, never a rename.

## What the player sees first

The cave, Start Game, a 1.2 s zoom into the light, and under three seconds later the octopus swimming in Level 1 under a thumb or the arrow keys, with no progress bar. This plan gets there; with change 2 the team sees it at I1 instead of at the end.
