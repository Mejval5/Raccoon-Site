# Backrooms: a second layer behind the level (brainstorm)

Status: brainstorm only, 2026-10-07. Nothing here is scheduled. Daniel: "I also want to add the concept of a
backroom with a separate level. I really like that idea, but for now we can avoid it; brainstorm if it's worth
it and how to add it."

History: V2-PLAN 2.5 and Fox's review (section 8, point 4) cut "the separate bonus grotto (own level)" in favour
of an in-level treasure pocket reached by a bonus portal: same reward, no second level in memory. This note asks
whether a real back layer is now worth more than that pocket, and how to build it cheaply.

## 1. What Spelunky 2's back layer adds

- **Curiosity.** A door in the wall is a question. Every level has a few, and you never know if it is a
  closet with a pot or a whole second area.
- **Risk and reward in your hands.** Going back costs time (the ghost timer keeps running) and exposes you to
  a new, cramped space with its own enemies. Skipping it is always allowed.
- **Secrets that need knowledge.** Some doors are hidden or locked (the Udjat eye, keys, the drill, Vlad's
  cape). Players learn them across runs; the second visit feels like mastery.
- **Special places and people.** The Black Market, Tusk's palace, the vaults, the Tun shop, the Hired Hand
  cells, Waddler's storage. Questlines lean on them because a separate room is a natural stage.
- **Pacing.** A quiet, small room in the middle of a hard level is a breather, and a change of mood (other
  palette, other music).
- **A sense of depth in the world.** The level stops being one sheet of rock; there is something behind it.

What Octomancer already covers:

| Spelunky value         | Octomancer today                                                          |
|------------------------|---------------------------------------------------------------------------|
| Curiosity, small secret| Sealed rock pockets with a crack cue (level.js `carvePockets`, 2 shells)  |
| Hidden loot            | Buried treasure in walls, visible with Sea-glass Goggles (queued)         |
| Special room as stage  | Shop stall, Challenge Pool set piece, Marlo's rock, Pip's cage            |
| Breather               | Zone-end rest grotto with a spring (queued, section 15)                   |
| Special trader         | None (trader was cut in section 7)                                        |
| Different mood         | None inside a level: one palette, one backdrop per biome                  |

So Octomancer needs only part of it. Curiosity and loot are already served by pockets and goggles; the shop is
already a stage. What is genuinely missing is **(a) a place that feels like "elsewhere"** (other mood, a held
breath), **(b) a stage for rare NPCs and a black-market trader**, and **(c) a reason for juice and spells to
matter in a tight space** (a short fight or a puzzle). With three levels per zone and a 30 MB canvas budget on
phones, it must stay small: one back area per level at most, one or two rooms in size.

## 2. Five underwater versions

All follow the art rule (natural fantasy: clams, coral, kelp, bone, stone, bioluminescence; no gold, coins or
gloss). The entry is always a visible, readable shape in the front layer, never a menu.

**A. Air-pocket grotto behind a kelp curtain** (the "quiet" one)
- Entry cue: a dense kelp curtain in a wall niche, swaying against the current; bubbles leak out of it.
- Inside: a small cave with an air pocket at the top (the water line shimmers), glow-worms, a resting
  NPC or a small spring that refills one heart or one juice cast (not both, not the full rest grotto).
- Risk: almost none; it costs time on the Beholder clock.
- Reward: a heal, a journal entry (Places), sometimes Marlo or another NPC with a line of a questline.

**B. Sunken wreck interior** (the "loot" one)
- Entry cue: a broken hull rib and a dark hatch in the rock (bone-and-timber, weathered, not shiny). Matches
  the existing `SET_WRECK` set piece, which then gets a door.
- Inside: two rooms of narrow corridors, pots and clams, one trapped chest, eels in the walls, a crab nest.
- Risk: a real fight in tight quarters; spikes and falling planks.
- Reward: an item chest (flippers, bomb bag) plus shells; best spot for a relic for Quill.

**C. Vault behind a cracked wall** (the "knowledge" one)
- Entry cue: a pale, veined slab in the wall, only visible with Sea-glass Goggles, or a crack you can bomb.
- Inside: a single sealed room with a pedestal and a guardian (a stone-shelled crab that wakes when you lift
  the relic). Spelunky's vault with a Tusk-like twist.
- Risk: the guardian; a timed collapse once the pedestal is empty.
- Reward: a guaranteed carried item or rune spell; makes the Goggles feel essential.

**D. Hidden trader's cave** (the "Black Market" one)
- Entry cue: a ring of bioluminescent lanterns (jellies on stalks) around a narrow tunnel; a hermit crab
  shell sign. Only on 1-2 or 1-3, about one run in four.
- Inside: an old hermit trader with rare stock (Siphon Shell, rune spells, a heart container) at high shell
  prices, and juice-for-item trades. Same aggro rules as the shop: steal or hit and he and his guards hunt you.
- Risk: prices; the aggro if you misbehave.
- Reward: the only way to buy the rarest things; a People entry and a questline hook.

**E. Creature lair** (the "dare" one)
- Entry cue: a skull-shaped coral arch with bones on the sand before it and a low growl in the audio.
- Inside: one bigger creature (a giant moray or an old anglerfish) in a round chamber, plus its hoard.
- Risk: a mini-boss; the door seals until it is beaten or you die.
- Reward: a big juice payout (it leaks juice even without the Siphon Shell), a trophy journal entry, an item.

## 3. Recommendation

**Worth it, but later.** A back layer is the single best "Spelunky feel" feature left after combat, juice and
the rest grotto, and it gives the NPC questlines and a trader a home. It is not worth building now: combat,
juice, Ink Cloud and the rest grotto are not in yet, and every back room design depends on them (C and E need
combat, D needs juice prices, A overlaps the rest grotto).

**When:** after the rest grotto and the first spells ship, and before biome 2. Building it before biome 2 means
biome 2 gets its back rooms from the start instead of a retrofit.

**Smallest version that delivers most of the value:** one door per level at most (about 1 level in 2), leading
to a back area of **one or two rooms**, from a small back-room bank. Ship with only **A (kelp grotto)** and
**B (wreck interior)**, since they need no new systems. Add **D (trader)** as the first follow-up, because it
adds a new kind of reward, and **C** once the Goggles exist. E waits for a boss-capable combat system.

Do not build a full second level with its own world, renderer and entity set. The "annex" approach below gives
the player the same experience (door, fade, different place, come back) at a fraction of the cost.

## 4. How to add it in this codebase

### 4.1 Where the back area lives: an annex in the same tile grid

The cheapest real "second layer" is not a second world. Generate the back area as an **annex below the level's
bottom bedrock**, inside the same `tiles` array:

- `generateLevel` (level.js) keeps building the 3x4 room front (34x68). When a door is rolled, it adds an annex
  of 1x1 or 2x1 rooms (10x16 or 20x16 tiles) under a bedrock seam at least 6 tiles thick. The level becomes,
  for example, 34x92. The annex has no water path to the front; it is reached only by the door.
- Back rooms come from the same bank file with new tags, `back-grotto`, `back-wreck`, `back-trader`,
  `back-vault`, `back-lair` (new bits next to `TAG_SHOP` in rooms.js `TAG_NAMES`), plus a `D` marker for the
  return door. `fillEmpty` and `planPath` already skip special tags; back rooms are never picked for the front.
- The front door is a marker in a front room tagged `back-door` (or placed on a wall niche next to the path
  like the shop placement does with `placeShop`). Its position and the annex's return position go into the
  level object: `level.doorX/doorY`, `level.backX/backY`, `level.annex = {x0, y0, x1, y1, kind}`.
- `world-v2.js` needs almost nothing: bands are per row and only the visible ring is baked (`wallBandWindow`),
  so annex rows cost no canvas memory while you are in the front, and the front costs none while you are in
  the annex. The deep-rock bake (`W * H * 8 px`) grows by the extra rows only, well under 1 MB.
- Bombs, physics, outline tracing, props and loot work unchanged because it is the same grid. The bedrock seam
  must be unbreakable: extend `isBedrock` with the seam rows, like the border and the shop.

Why not a separate world: a second `createLevelWorld` plus renderer means two sets of baked canvases (or a full
dispose and re-bake on every door, which is the 300+ ms dark transition from round 43/44), and `resetWorld`
would have to be split into a per-layer bundle of enemies, props, hazards, loot, pickups and bombs, with all
the main.js glue that reads them. That is the "milestone of work" Fox cut. The annex avoids all of it.

### 4.2 The door and the move between layers

- Walking (swimming) into the door and pressing up/interact (the same input as the shop) starts a **short
  fade**: about 150 ms out, teleport, 150 ms in. No generation, no tear-down, so it is not the level transition
  in `v2Event`; it is a new small `layerHop(toX, toY)` in main.js that fades the existing `fadeEl`, sets the
  octopus position, zeroes its velocity and snaps the camera.
- **Camera:** `camera.js` clamps to world bounds. Add a region rectangle: front = rows above the seam, annex =
  the annex box. The camera clamps to the region the octopus is in, so you never see the seam or the other side.
- **Backdrop and mood:** render.js picks the tint and the music layer from the region (a warm glow for the
  grotto, a cold blue for the vault). Audio swaps a low-pass filter or a different loop.
- The return door in the annex puts you back at the front door. Doors stay open; you can go back and forth.

### 4.3 What runs in the inactive layer

- **Recommendation: frozen, and spawned lazily.** Annex contents (enemies, NPCs, chests) are not spawned at
  level start; `level-spawns.js` keeps them in a separate list, spawned on first entry. After that, entities
  carry a region byte and `update` skips entities outside the octopus's region (like the cull flags in cull.js,
  but for simulation). Coming back finds everything as it was left.
- Exceptions: the Beholder timer keeps running (that is the price of the detour, same as the bonus portal
  rule). If it runs out while you are in the annex, the Beholder appears at the return door, inside.
- Bombs and falling rocks in flight when you leave: let them finish (they are short-lived), or freeze them too.
  Freezing is simpler and nobody will notice.

### 4.4 Memory

- With the annex there is nothing to dispose: the band ring already keeps only the visible bands plus one each
  side. A hop is a camera jump, so the old ring bands go back to the canvas pool (`releaseCanvas`) and the new
  ones are baked behind the 150 ms fade. Check with `__octo.memory()` that `canvasMB` stays under budget after
  ten hops, and that `allocatedMB` per hop is near zero once the pool is warm.
- Bake cost on a hop: two or three bands. If that is more than the fade hides on a phone, pre-bake the annex
  ring when the octopus comes within a few tiles of the door (same idea as the warm frames in `v2Event`).
- If a future back area is ever big (a whole second level), that is the moment to build real world swapping;
  not before.

### 4.5 Generation checks (A*)

- The front path check stays as is: `finalPathOk` / `pathSolvable` from start to exit ignores the annex,
  because the door is optional.
- Add a second check: from the annex return door, every reward marker (chest, pedestal, trader counter) is
  reachable with `fatWaterSolvable`, with the same "carve if not" fallback the front uses.
- The front door must be reachable from the start (flood from `startX/startY` covers it), and must not sit in
  the shop, the start safe radius or a set piece. Drop the door after N failed attempts, as `placeShop` does.
- Determinism: the door roll and the annex rooms come from their own `hashSeed2(base, ...)` stream, so adding
  backrooms does not change the front layout of existing seeds. Seeds stay comparable.

### 4.6 Save and run state

- Nothing new persists mid-level (the game does not save mid-dive). Per dive, the run gets a few flat flags:
  `backSeen`, `backKind`, `traderAggro`. Across runs, `save.js` story counters like the existing ones:
  `backroomsFound`, `vaultsOpened`, `traderMet`, `lairsBeaten`.
- Shop aggro and trader aggro are separate (killing the trader should not make the next shopkeeper hostile,
  unless Daniel wants Spelunky's shared shopkeeper anger).

### 4.7 Journal, quests and buried treasure

- **Journal:** each back-room kind is a Places entry ("Kelp Grotto", "Sunken Hull", "Pale Vault", "Hermit's
  Den", "Moray Lair"), locked until first entered. The trader and the lair creature get People and Bestiary
  entries. Progress page: "Backrooms found" counter.
- **Quests:** the back area is the natural stage for the next questlines. Examples: the hermit trader asks for
  three things across runs and then stocks something unique; Marlo's later stages could move into a grotto;
  Quill's relics become likelier in wrecks and vaults. Keep the Spelunky rule: no HUD line, only speech and the
  journal.
- **Buried treasure and Sea-glass Goggles:** the Goggles reveal vault doors (version C) as well as treasure in
  walls. One item, two uses, and the vault becomes the payoff for finding the Goggles.
- **Existing pockets and bonus portal:** keep the sealed pockets as the small, frequent secret. The planned
  bonus portal to the treasure pocket can be retired or folded into the annex (the portal leads to the annex
  instead of a pocket). Do not ship both a bonus portal and a door in the same level.
- **Rest grotto:** the zone-end rest grotto can reuse the same tech (a 1x1 annex reached at the exit), which
  makes the annex code pay for itself twice.

### 4.8 Rough size

- level.js annex + tags + door placement + checks: M
- main.js `layerHop`, camera region, region-frozen updates, lazy spawns: M
- Back-room bank (8-10 rooms for A and B), door art drawn in code (kelp curtain, hull hatch): S-M
- Trader (D): M on its own (stock, aggro, guards). Vault (C): S after the Goggles. Lair (E): L, needs a boss.

## 5. Open questions for Daniel (recommended default in bold)

1. **Separate world or annex in the same grid?** **Annex** (same experience, no level swap in memory). A real
   second world only if a back area ever needs to be larger than two rooms.
2. **How often is there a door?** **About 1 level in 2, at most one door per level**, never in the tutorial or
   the hub.
3. **Which kinds first?** **Kelp grotto and wreck interior**, then the trader, then the vault with Goggles.
4. **Does the Beholder timer run inside?** **Yes**, and the Beholder can follow you in (it appears at the
   return door).
5. **Locked doors (keys, Goggles) or always open?** **Always open for A and B**; only the vault is hidden
   (Goggles or a bomb crack).
6. **Does the back area get its own music and palette?** **Yes, a tint and a filtered music layer**, no new
   track until biome 2.
7. **What happens to the bonus portal and treasure pocket from V2-PLAN 2.5?** **Keep the small sealed pockets;
   retire the bonus portal** in favour of the door.
8. **Shared aggro between shopkeeper and trader?** **No**, separate.
9. **When?** **After the rest grotto and the first spells, before biome 2.**
