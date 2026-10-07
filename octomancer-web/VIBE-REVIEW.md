# Vibe review: Spelunky + Noita

Reviewer: Opus game-feel pass, 2026-10-08. Read-only. Played headless with the `__octo` hooks (puppeteer, fixed 50 Hz steps, frame captures):
hub, tutorial, Shallows 1-1..1-3, Still Grotto and end on seeds 101 and 7 at 1440x900 and seed 23 at 412x915. Systems were provoked on seeds 101 and 23:
a bomb by a crab, a bomb into a crab/piranha group, theft from the stall, an inked Marlo, a spike impale, a boulder splat, a tentacle grab, the ink jet and the ink cloud, a push block, and the death ragdoll.
All shots are in `octomancer-web/night/vibe-*.png`, with contact sheets in `vibe-sheet-*.png` and crops in `vibe-zoom-*.png`.
Audio was muted in the headless runs, so nothing here judges sound.

## 1. Verdict

The bones are right. The **actors** are already Spelunky: the hermit-crab shopkeeper, Marlo's harpoon, the tentacle shell, the boulder pancake and the spike impale all read well and are funny.
What is missing is the **connective tissue**. The world mostly reacts to the octopus and hardly ever to itself, and the destruction is clean instead of messy.
So the game reads as "a Spelunky cast in a tidy level" more than "a world that can go wrong on its own".

- **Spelunky: 6/10.** Readable, deadly set pieces and an angry shopkeeper who claws you to death in 1.2 s are on target. But hazards only hurt the player, so the chain-reaction comedy is rare, and every level has the same 34x68 shape.
- **Noita: 3/10.** Bombs carve rock and corpses and rubble are physical, but the terrain re-skins to a neat mint outline at once, the rubble fades in seconds, and the main attack is a pea-shooter. Nothing burns, spreads, stains or lingers.

## 2. Already delivers the vibe (keep)

- **The shopkeeper.** A hermit crab with telescoping claws, a clear "You wrecked his stall. The shopkeeper is coming for you" toast, and a lethal, fair chase. Even a stray blast near the stall set him off in the corpse test, which is a true emergent moment (`vibe-sheet-shop.png`, `vibe-zoom-shop-claw.png`, `vibe-sheet-corpses.png`).
- **Marlo's harpoon tell.** The dashed aim line, then the shot: you see it coming and still have to move (`vibe-sheet-marlo.png`). The "Ow! What was that for?!" bark gives anger a face.
- **The death gags.** The splat pancake (`vibe-zoom-splat.png`), the X-eyes impale with the body pinned on the spikes while the jet bubbles past (`vibe-zoom-impale.png`), and the tentacle wrapping and swallowing the octopus (`vibe-sheet-tentacle.png`). These are the Spelunky "ha, got me" moments.
- **The ragdoll and run summary.** The body tumbles and sinks for about 2 s before the panel. The panel names the killer ("Taken by the Shopkeeper in Shallows 1-1") and gives the seed (`vibe-sheet-death.png`, `vibe-zoom-shop-death.png`).
- **The ink cloud.** A big, dark, organic cloud; the octopus dims and closes its eyes inside it (`vibe-zoom-ink.png`, bottom right). It reads as magic with a cost (the jar) and fits the creature.
- **Physical stuff.** Bombs sink, bounce and roll off ledges. Corpses flip, drift and leak juice droplets. Wares fall off a broken pedestal and become stealable loot (`vibe-sheet-corpses.png`, `vibe-shop-s101-1-desktop-01-loose.png`).
- **Art direction.** Milan's sprites (crab, urchin, manta, Marlo, shell stall) sit well on the teal water with the light shafts and fish silhouettes. Keep it.

## 3. Top 10 vibe breakers (ranked by impact)

**1. Hazards and enemies ignore each other.**
- *Saw:* a falling boulder passes the wall urchin with no reaction (`vibe-zoom-splat.png`). In `hazards.js`, spikes, boulders, jets and eels only test the octopus, and nothing hurts NPCs either. Only push blocks crush enemies (`props.js crushEnemies`).
- *Why it matters:* Spelunky's stories come from "the arrow trap killed the shopkeeper". Today every hazard is a player-only trap.
- *Fix:* reuse the existing kill paths, all S:
  - A falling boulder (`updateRockProp`, state 2, speed above 1.5) calls `enemies.kill` / `npcs.hurt` on anything under it, like `crushEnemies` does.
  - Spikes kill a knocked-back enemy whose centre enters the spike strip (blast knockback already throws crabs).
  - Jets apply `jetForceAt` to moving enemies, as `corpses.js` already does for bodies.
  - An enemy can trigger a boulder (the same line test with the enemy instead of the octopus).

**2. The bomb's lethal radius doesn't match what it draws.**
- *Saw:* the crab sat inside the yellow rays and survived, stunned (`vibe-bomb-s101-1-desktop-135.png`; kill radius 2.5 tiles, rays reach about 3.2).
- *Saw:* a bomb dropped by floating enemies sank about 5 tiles during its 2.5 s fuse and killed nothing. Next to a ledge it rolled off first (`vibe-bomb-s101-1-desktop-122.png`).
- *Why it matters:* "fair but deadly" needs the picture to be the rule.
- *Fix:*
  - Draw the shock ring at exactly `BOMB_RADIUS` and keep the rays inside it.
  - Cut `BOMB_FUSE_V2` to about 1.8 s, or raise the bomb's drag (`DRAG[1]` 1.6 to about 2.6) so it settles near where it was thrown.
  - Flash the lethal circle on the floor for the last 0.4 s of the fuse.

**3. The explosion and stun read as a cartoon mobile game.**
- *Saw:* a flat yellow and white sunburst disc with gold rays, and yellow 4-point stars circling stunned crabs (`vibe-bomb-s101-1-desktop-126.png`).
- *Why it matters:* it breaks Daniel's "no sparkles, no glossy" rule and doesn't feel underwater.
- *Fix (particles.js `blastBurst` / `blastFeel` and the stun draw):*
  - Make the blast a white-blue bubble burst plus a brown silt puff that lingers 2-3 s.
  - Use a pale shock ring, with orange kept only for a 2-frame core flash.
  - Replace the stun stars with a few rising bubbles or a small swirl.

**4. Destruction is too clean.**
- *Saw:* the blast hole re-traces at once into a smooth rounded mint-rimmed shape, and the chips have vanished 4 s later (`vibe-bomb-s101-1-desktop-320.png`).
- *Why it matters:* Noita's joy is the mess you leave behind. Here the level looks freshly generated after every bomb.
- *Fix:*
  - Rubble (`PK_RUBBLE`) rests and stays for the level, capped at about 60 and recycling the oldest.
  - Newly exposed tiles get a darker or "fresh rock" rim tint for the level.
  - A silt haze hangs over the crater for a few seconds.
  - All of these are cheap and bake-friendly.

**5. The ink jet is a pea-shooter.**
- *Saw:* one small dark ball every 0.42 s with no visible stream; a crab took 3 hits over about 1.2 s (`vibe-zoom-inkjet.png`, `vibe-ink-s23-1-desktop-*.png`). Its splats on walls disappear.
- *Why it matters:* "magic that feels powerful" starts with the button you press most.
- *Fix (feedback only):*
  - Make the blob about 1.5x bigger, with a 3-blob stream per shot.
  - Splats leave ink stains on rock and enemies that fade over about 10 s.
  - Add a small knockback and a 30 ms hit-stop on hit (the `hitStop` event exists).
  - Optionally cut `INKJET.damage` hits-to-kill for crabs to 2.

**6. Threats can start off-screen.**
- *Saw:* before the splat, the boulder that killed me was only half visible at the top edge (`vibe-zoom-splat-before.png`). On a phone the camera shows even less above.
- *Why it matters:* deaths have to feel like your fault.
- *Fix:*
  - Trigger the boulder only once its tile is inside the view (`cullView` exists), or trickle dust or pebbles down its column 0.5 s before the 0.45 s shake.
  - Same rule for the tentacle wake (4.5 tiles is fine) and for cannons.

**7. HUD and text clutter over the play field.**
- *Saw:*
  - A permanent two-line controls string bottom-left on desktop.
  - A "Journal: X" toast at every level start (Clam, Cave Weed, Rune Carving, Manta).
  - A large level banner with the seed over the top third.
  - On a phone the hint panels cover the upper third (`vibe-tour-s101-desktop-2-1-1.png`, `vibe-sheet-phone.png`).
- *Why it matters:* Spelunky shows almost nothing; the world is the UI.
- *Fix:*
  - Hide the controls line once the tutorial is done (it can stay in the pause menu).
  - Show the journal toast only for a new discovery, for 2 s.
  - Shrink the banner and fade it after 1.5 s; put the seed on the pause screen only.

**8. Every level is the same box, and the rock is one flat material.**
- *Saw:* 34x68 tiles on every seed and level. The terrain is mostly flat navy masses with the same mint rim; bone and timber are rare (`vibe-tour-s101-desktop-3-1-2-mid.png`, `vibe-tour-s7-desktop-*`).
- *Why it matters:* "every run different" is weaker when the silhouette and texture repeat.
- *Fix (tuning):*
  - Raise the bone and timber share in `patterns.js` / the room bank.
  - Let 1-3 sometimes be wider or shallower, and vary the rock tint slightly with depth.
  - Put the existing bedrock or masonry in a few room variants.

**9. Cause-blind death title.**
- *Saw:* "The dark took you" for the shopkeeper's claws and for a crab alike (`vibe-zoom-shop-death.png`).
- *Why it matters:* the death recap is part of the joke.
- *Fix:*
  - Titles per cause: "Flattened" (rock), "Skewered" (spikes), "Swallowed" (tentacle), "Shopkeeper's justice", "Harpooned by Marlo".
  - Freeze the death frame behind the panel instead of the live sinking view. Strings only, S.

**10. Placement and art outliers.**
- *Saw:*
  - A push block wedged in a dead-end notch against a wall, so pushing does nothing (`vibe-block-s23-1-desktop-060.png`).
  - The block's carved face is yellow-gold, which goes against the no-gold look.
  - Some buried-treasure marks in rock render as flat stamped icons ("X", a fish skeleton, "V") rather than hand-drawn fossils (`vibe-tour-s101-desktop-3-1-2-mid.png`).
- *Fix:*
  - Spawn blocks only where at least one side has 2+ free tiles and a drop.
  - Recolour the block to grey-green stone or coral.
  - Draw the treasure hints as faint outlined fossils or shells in Milan's line style.

## 4. New feature ideas (max 8)

1. **Chain reactions.** Blasts set off other bombs and hazards: a boulder releases, an eel shocks, a clam snaps. (S)
2. **Enemy infighting.** Piranhas bite whatever bleeds (corpses, stunned crabs, an angry NPC); the cannon's shots hurt enemies. (S-M)
3. **Ink as a material.** Ink lingers as a slow-diffusing stain field that blinds enemies, shows currents (jets) and settles on the floor. This is the Noita fluid layer, kept cheap on a coarse grid. (M)
4. **Silt and sand tiles** that collapse and pour when undermined, burying enemies or loot. (M)
5. **Bioluminescent hazards** that light the dark and burst into a stinging glow when hit: a lantern that is also a trap. (M)
6. **Ghost / time pressure.** A slow dread (Beholder shadow) after about 3 min per level, so runs keep pace like Spelunky's ghost. (S, the dread audio exists)
7. **Secret rooms** behind cracked walls with a tiny tell (a draft of bubbles), holding a rare relic or a trapped NPC. (M)
8. **Sacrifice / offering altar** (a giant clam idol): feed it corpses or a shopkeeper for a favour, or anger it. (M)
