# QA-ENEMIES: enemy and hazard bug list (Owl)

Tested: committed HEAD dd2bde47 (a clean `git archive` copy served read-only on port 5871; the dev round's uncommitted
edits to enemies.js, with knockback and stun, were NOT tested). Headless Chrome via puppeteer-core, `?v2=1&at=1|2|3`,
seeds 1-7, desktop 1440x900 and phone 375x812 (plus 812x375), real rAF frames, 20 s observation per level (18 levels
desktop, 4 phone). Screenshots are in `octomancer-web/night/`, prefix `qa-enemies-`. Console: no errors from the game
(one stray 404 on one phone load, not enemy related). Background tab: sim pauses and resumes cleanly (OK).
File names below are in `site/octomancer/play/js/`. Line numbers are HEAD.

Clean (looked for, not found): enemy centre in rock (0 of 120+ tracked), upside-down or floating static enemies (scan of
21 levels), spawn within 8 of the player start, enemy-on-hazard overlap, dash-kill (works, peak 15 u/s for ~0.3 s),
bomb kills (crab, urchin die, horns immune), eel telegraph and ring (glow 0.6 s, ring reads fine), jet, spikes, anemone.

## BROKEN (6)

### B1  Piranhas never patrol: 53 of 84 are frozen against a wall rim  [worst Spelunky-feel hit]
- Kind/where: piranha, every seed/level. Seed 1 at=1: #1 (29.6,52.5), #3 (5.4,27.5), #8 (27.4,10.5), #9, #6; seed 2 at=1 five of six.
- What: patrol dir is only flipped when the point 0.55 ahead is solid, but wall collision stops the 3-sample hull
  (nose at 0.85, radius 0.52) about 1.4 tiles from the rim, so it never "sees" the wall. vx is zeroed by the resolver
  (`vx=0` or 0.003 in the log) and it hangs in place, nose to the rock, for the whole level. They then only wake when you
  come within 6. 63% of piranhas are furniture, the rest swim wall to wall at a constant 2.5 u/s.
- Repro: `?v2=1&at=1&seed=1`, wait 4 s, read piranha id 1: x stays 29.63, vx 0, dir 1. Screenshot `qa-enemies-piranha-pinned-s1.png`
  (piranha top right, idle at the rock). Phone: identical (sim is viewport independent).
- Cause: enemies.js:404-405 (probe `radius+0.15`) vs enemies.js:84-95 (`collidePiranhaWithWalls` hull, 0.85+0.52).
  Probe should use the hull (nose + 0.52) and look at the rim, not a tile centre.

### B2  Beholder spawns in rock or outside the level and sits frozen forever
- Kind/where: beholder, spawn at 120 s sim time. Seed 3 at=1, octo y=9: beholder at (6.5,-2.9), above the grid, v=0 for 12 s+.
  Octo at (20,45): frozen at (20.5,25.9). Octo at (27,60): frozen at (27,41.1). Only octo at (7,30) worked (reached it in 4 s).
  Two of three test spots (plus the start spot) = it never comes.
- What: spawn is `octo.y - 20`, `x = octo.x`, with no solid check. A* returns null when the start tile is solid,
  so it aims straight, wall collision pushes it back, net velocity 0. The run's pressure clock does nothing.
- Repro: `__octo.step(5900)` then `teleport(20,45)` (or just reset and play 2 min), watch `__octo.state().beholder`. Screenshots
  `qa-enemies-beholder-20-45.png`, `-27-60.png`, `-spawn.png`.
- Cause: enemies.js:511-517 (spawn point), pathfind.js:38 (`isSolid(start)` returns null, no recovery). Needs: spawn at the nearest
  open cell off-screen, and a fallback when A* has no start.

### B3  Piranha "chasing" but not moving at narrow gaps and shafts
- Kind/where: piranha, seed 2 at=1, piranha at (24.4,50.5), octo at (24.5,46.5) straight above in a 2-wide shaft (x 24-25).
  `chasing=true`, clear line of sight, v = 0.0003 for 4 s. Also 3 of 10 occluded chases in the A* test failed within 12 s
  (seed 1 #3, seed 2 #3, #5), all tile-connected.
- What: A* plans for a point on tile centres; the body hull is 1.7 x 1.04 with 0.52-radius samples, so it cannot enter any
  passage narrower than about 2.7 tiles. It stops at the mouth, pressing in, looking stuck, not hurting you.
- Repro: seed 2 at=1, `teleport(24.5,46.5)`. Screenshot `qa-enemies-piranha-chase-stuck-s2.png`.
- Cause: enemies.js:84-95 hull vs pathfind.js:34-70 (point A*, no clearance); enemies.js:228-256 `chaseWithPath`.

### B4  Manta freezes at the side wall
- Kind/where: manta, seed 2 at=2 #5 at x=30.2 (level edge rim at 32) for 6 s+; phone seed 2/4 at=2 #12 same x=30.2.
- What: wing sample 1.4 + radius 0.4 reaches the rock before the turn-around probe (1.5, enemies.js:479) fires, so `dir`
  stays +1 while the collision pushes it back; x frozen, y keeps sine-bobbing (vy shows -7.4 from the resolver). Same class as B1.
- Repro: seed 2 at=2, watch manta id 5 after 7 s. Screenshot `qa-enemies-manta-stuck-wall.png`.
- Cause: enemies.js:479 vs enemies.js:109-118.

### B5  Falling rock hits twice for one drop
- Kind/where: rock hazard, seed 2 at=2 at (12.5,55.5), landing y 61.5. Octo stands 2 below it.
- What: hit 1 at t+0.9 s (rumble 0.45 s then fall), knockback is away from the rock = straight down, so the octo rides the
  rock's own path; the second hit lands 1.1 s later (right as invulnerability ends) when it settles. 3 hearts to 1 from one rock.
- Repro: `teleport(12.5,57.5)`, no input, 2.5 s. Screenshot `qa-enemies-rock-s2-2.png`.
- Cause: hazards.js:161 `hurt(... d.x, d.y)` knocks along the fall line; state 4 retry at hazards.js:164-170. One hit per rock, or push sideways.

### B6  Patrolling piranha sweeps through the shop
- Kind/where: piranha #6, seed 4 at=3, row y=24.5 runs x 10 to 30 straight over the shop (keeper 17.5,26.5); it passed at 2 tiles
  and chases the player at the stall. Screenshot `qa-enemies-piranha-in-shop-s4-l3.png`.
- What: the 5-tile calm zone only filters spawn cells; a wall-to-wall patrol is not checked against the shop.
- Cause: level-spawns.js:119-120 (`SHOP_CALM`) and :28-29 (`PATROL_REACH` 99). Check the patrol row against the shop box.

## DIFFERS FROM SPELUNKY / FEEL (6)

### F1  Cannon fires the instant you enter range, no wind-up
- Seed 2 at=2 cannon (15.5,47.5), idle 3.5 s, cooldown -4.2 and falling. Teleport into range: first shot 0.02 s later, hit 0.5 s after.
- Cause: enemies.js:413 decrements `cooldown` forever (also out of range), 329 random start. Clamp at 0 and add a wind-up flash.
  Screenshot `qa-enemies-cannon-instant.png` (also shows B-series overlap, see F3).

### F2  Cannon and manta fire through rock
- Range test is distance only (enemies.js:415, 481); no line-of-sight check, so shots spawn behind a wall and die in it.
  Seed 2 at=2: octo at (9.5,42.5) behind 4 tiles of rock still counts as in range 7.8. Wasted shots, noise, and an
  unfair shot the moment a corner opens.

### F3  Piranha rides inside the octopus, hits every 1.0 s, nothing separates them
- Seed 3 at=1 open-water test: piranha at d=0.23 from octo centre, hits at t=6.06 and 7.06 (exactly HURT_INVULN), then hovers
  at 0.9. No knockback on the enemy in HEAD, no stun, no retreat, no wind-up: a chasing piranha costs about a heart a second.
  Speed 4.0 (patrol 2.5) with a 6-tile notice and zero telegraph (`qa-enemies-piranha-notell.png`). Spelunky equivalents give
  a cue and a flee/recoil beat. Cause: enemies.js:393-398 (no windup state), 569-575 (hurt, no recoil). The dev round's
  `knockInRadius`/`stun` work (not tested) only covers bombs.

### F4  Enemy behaviour is not seed-deterministic
- `Math.random()` for piranha/crab/manta `dir`, crab speed variant and cannon cooldown: enemies.js:325, 329, 332, 335, 345.
  Same seed gives different patrol directions per load, so a seed cannot be replayed or reproduced as a bug report.

### F5  Threat ranges are larger than a phone-landscape view
- 812x375: 20 x 9.2 tiles visible (4.6 up/down). Piranha notice 6, manta 8, cannon 10, rock trigger and jet 7 tiles are off-screen.
  Portrait 375x812: 11.1 x 24 (5.5 left/right). The cannon at 10 tiles shoots a player who cannot see it
  (`qa-enemies-phone-cannon-offscreen.png`). Desktop 20 x 12.5 is fine.

### F6  Static enemies crowd or wall the objective
- Seed 3 at=1 quest "rescue" captive (26.5,37.5): crab within 2.0, horns within 1.4 (at=3 seed 4). Pest-control quest
  target is just the pinned piranha (B1) so it is the easiest kill in the game. Exit ring: piranha 3.6 away (at=3 seed 3).
  level-spawns.js:122 (`nearExit` filter is spawn-cell only).

## POLISH (4)
- P1 Rock telegraph is a 0.045-tile wobble (about 3 px at 72 px per tile) for 0.45 s: hazards-draw.js:178. Easy to miss; add dust or a
  shadow. Not reduced-motion gated either.
- P2 Piranha facing flickers when its vx is near 0 while chasing (9 flips in 6 s, d under 1): enemy-draw.js:166-167 uses
  `vx || dir`; add hysteresis.
- P3 Cannon sprite never turns toward its target or shows a barrel (reads like a pot with an eye): enemy-draw.js:168-182.
- P4 Spike reach is lenient by 0.35 tile (octo at 0.9 from the face, edge inside the spikes, no damage): hazards.js:139.

## What a Spelunky-like version of each enemy would do (one line each)
- Piranha: idle drifting patrol that always turns at rims, flashes eyes and pauses 0.4 s when it notices you, then darts in a
  straight line; recoils after a hit and loses interest after 3 s.
- Crab: slow floor patrol that turns at ledges; stomp-from-above or dash kills it, side touch hurts; antennae pop up when you are within 3.
- Cannon: rotates its barrel to track you, glows 0.6 s, then fires one slow readable shot; only when it has line of sight.
- Manta: slow sine glide that stops, tilts and drops a ball 1 s after a visible tell; never fires through rock.
- Urchin: pure fixed hazard, spikes read at a glance, a bump knockback, no damage when you pass at 1 tile.
- Horns: fixed spike hazard on floor or ceiling, never on your path in a 1-tile corridor.
- Beholder: appears with a 3-4 s warning (sound, vignette, arrow at the screen edge) at the nearest open cell off-screen, then homes.
- Current jet: pulses on a rhythm (1.5 s on, 1 s off) with bubbles marking the stream; never shoves you into spikes.
- Spike wall: static, drawn tips match the hitbox, one hit then brief invulnerability.
- Falling rock: dust and a shadow on the floor for 0.6 s, one hit, lands and stays as rubble you can bomb.
- Electric eel: visible charge glow then a ring you can swim round (as now, works well); eel pauses at each end of its shaft.
- Anemone: static, retracts when you approach slowly, stings only on direct touch.

## Count: 6 broken, 6 feel/differs, 4 polish (16 total)
