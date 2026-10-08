# Octomancer: where we stand (2026-10-08)

Live at https://raccoon.website/octomancer/play/ (the old endless mode is at `?endless=1`).
Master passes 3035/3035 tests, the bot completes 30/30 levels, and the phone memory and transition checks pass.

## What is done

**Run structure (Spelunky 2 shape)**
- Hub, a tutorial (vertical bomb section), Shallows 1-1 to 1-3, the Still Grotto rest room, then a clear screen. Death sends you back to the hub, and a hub shortcut opens after a clear.
- Levels are built by a SmartRooms-style generator: hand-written rooms, an A* solvability check on the final map, and pattern-table spawning.
- Five terrain materials with Spelunky-style edge layering:
  - basalt bedrock (unbreakable)
  - rock
  - bone blocks
  - sunken timber
  - shop masonry

  There are also pushable blocks.
- Every original foliage kind from the Unity project, using your per-plant offsets and jitter. Nothing floats or makes a grid.
- Buried treasure: cowries and conches show in the rock. Nautiluses, pearls and items are only visible with the Sea-glass Goggles.

**Danger (Spelunky damage model)**
- Instant deaths:
  - spikes impale
  - boulders splat you flat
  - giant clams snap shut (you can grab the pearl if your timing is good)
  - tentacles wake, grab and kill unless you break free
- A manta slam or eel shock knocks you limp for about a second. Everything else costs a heart and knocks you back.
- Jets only push up. They pair with spikes only where there are at least 5 tiles to dash through.
- Hazards hit enemies too: boulders crush them, spikes catch knocked-back enemies, jets push them.
- Every creature and NPC leaves a physics corpse. Nothing drops loot except special finds (the pearl).
- NPCs have health and can be angered. Marlo aims a visible line, then fires a harpoon.
- The shop breaks like any other wall. The shopkeeper shrugs off ink, throws claws brutally, and stays angry for the rest of the dive (one may guard the exit).
- On death the octopus goes limp and tumbles, enemies keep hitting it, the camera stays on it, and the panel sits to the side. The death title names the cause (Impaled, Crushed, Shopkeeper's justice, and so on).

**Combat and magic**
- WASD/arrows move. Left click fires the Ink Jet at the cursor, right click casts the spell, middle click throws a bomb, and Shift/Space dashes.
- Phones get a joystick plus four buttons.
- Fish juice: a jar holds 3 casts and is full at the start of a run. Corpses leak juice, but you can only drink it with the Siphon Shell. Without it, juice and hearts refill only at the zone-end rest grotto.
- Ink Cloud is the first spell: enemies lose track of you inside it.
- A hotbar and an inventory panel. Each slot holds a list of spells, so Noita-style crafting can be added later.

**Feel and look**
- Bombs:
  - sink, bounce and roll, and settle near where they are thrown
  - the blast is drawn at its true radius
  - natural silt-and-bubble explosions with lasting rubble and raw broken edges
- Ink Jet splashes and stains, screen shake and hit-stop, dash recoil.
- The portal entry matches your Unity sequence: physics off, spin, shrink, and an iris fade, all on Milan's whirlpool animation.
- Placeholder art is replaced with Milan's own sprites or generated ones in his style:
  - the chest is now a barnacle clam
  - the relic is a stone idol
  - the shop sign is a painted shell
  - no gold, sparkles or glossy UI
- A Settings menu (gear, top right), a Spelunky-style journal book, and quiet HUD toasts.

**Phones**
- About 20 MB of canvas memory at peak, under 10 MB new per level change.
- No main-thread task over 50 ms during transitions in clean runs (the test fails if 2 of 3 runs hitch).
- Off-screen culling ported from your AnimationLOD, so roughly 1 in 4 entities is drawn.

## What verification found

- Six full runs (3 seeds, desktop and phone) checked against 19 agreed items: 12 passed and 7 were fixed. Details are in `VERIFICATION.md`.
- A vibe review against Spelunky and Noita (`VIBE-REVIEW.md`) scored Spelunky 6/10 and Noita 3/10 before the fixes. The set pieces worked, but the world did not react to itself.
- I fixed 9 of its top 10 points. The fixes were small changes to existing systems: hazards hitting enemies, honest bombs, natural explosions, lasting destruction, a wetter ink jet, no off-screen ambushes, less clutter, named deaths, and placement outliers.

## Decisions I made

- The giant clam enemy got its own warm, sandy look, so a killer clam doesn't read as the barnacle-clam treasure.
- The rest-grotto keeper stays calm even when the dive is angry, because the grotto is a safe zone. Tell me if you want him hostile.
- When a boulder hurts the shopkeeper, he only turns on you if you caused the fall.
- The stutter test is stricter: it fails if 2 of 3 runs hitch, not only all 3. That uncovered two real causes, which are fixed (image decode in a frame, and quest pathfinding on the main thread).
- I deferred "every level is the same box": level-shape variety is design work, so it is in the proposals.

## Known small leftovers

- Some things are still drawn in code rather than painted: the giant clam, the tentacle limb, juice droplets, the Ink Cloud, the bomb, the hotbar icons and the tutorial bomb marker.
- The controls line retires after two levels, but not per control used.
- Spikes don't hurt the shopkeeper. A boulder set off by an enemy still angers the NPC it hits.
- Phone transitions still hitch occasionally under 4x CPU throttle (1 run in 7).

## Proposals (pick any; nothing here is started)

**Most vibe for the effort**
1. **Chain reactions (S):** blasts set off other bombs, boulders, eels and clams. This is the cheapest path to Spelunky chaos.
2. **Enemy infighting (S-M):** piranhas bite whatever bleeds (corpses, stunned crabs, angry NPCs), and cannon shots hurt enemies.
3. **Level shape variety (M):** more room templates per biome, non-rectangular levels, vertical shafts and wide caverns.
4. **Time pressure (S):** the Beholder shadow creeps in after about 3 minutes on a level. The dread audio already exists.

**Noita side**
5. **Ink as a material (M):** a cheap coarse fluid layer. Ink lingers, diffuses, blinds enemies, shows currents and settles.
6. **Silt and sand tiles (M):** they collapse and pour when undermined, burying enemies or loot.
7. **More spells and spell crafting (M-L):** two or three more spells (Riptide, Bubble Shield, Tentacle Grab) and Noita-style modifiers in the slot lists that already exist.

**Exploration and secrets**
8. **Back rooms (M):** a kelp-curtain grotto and a wreck interior as an annex behind a bedrock seam, from `BACKROOMS.md`.
9. **Secret rooms (M):** behind cracked walls with a draft of bubbles as the tell.
10. **Offering altar (M):** feed it corpses, or a shopkeeper, for a favour, or anger it.

**Content**
11. **Biome 2, Kelp Caves (L):** its own room bank, materials, enemies and a rest grotto.
12. **Bioluminescent hazards (M):** they light dark levels and sting when hit.

My suggestion for the next step: 1, 2 and 4 together (all small, and they make the existing systems collide more), then 3, then Biome 2.
