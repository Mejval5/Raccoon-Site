# Spells: a brainstorm (2026-10-08)

Status: ideas only, no code. Daniel: "Let's explore the spells. We may be slightly limited in what we can do since we
are running in a browser, but a simpler system could work. For me the hardest part is to make it work in a
Spelunky-style level without pixel simulation, and to not make it super overpowered."

What exists today (spells.js, hotbar.js, main.js): a jar of 3 casts (4 droplets each), full at the start of a dive,
refilled only at the Still Grotto spring, or from corpse leaks with the Siphon Shell. Right click casts the selected
hotbar slot at the cursor, at most 3 tiles out and short of rock (`spellTarget`); phones cast on the octopus. A spell
is a row in `data/spells.json` whose `effect` names a function in the `EFFECTS` table, and a hotbar slot holds an
ARRAY of spell ids. Only Ink Cloud exists: 4 s, radius 2.1, enemies' `lost(e, octo)` goes through `clouds.hides()`.

## 1. Principles

### 1.1 What replaces the pixel simulation

Noita's magic is interesting because the world answers it. We have no per-pixel world, but we have five cheap
"answer channels", and every spell below is built from them. A spell that touches none of them is just a damage
number and should be cut.

| Channel | What the engine already has | How a spell uses it |
|---|---|---|
| **Tile materials** | rock, bedrock, bone, timber, masonry; `breakTile`, `smashTile`, `placeRock`, `touchTile` re-bakes one cell; `MAT_BOMBABLE`, `MAT_BOULDER_BREAKS` tables | per-material reactions: a spell that breaks bone but not rock, softens rock into a new "silt" material, grows a temporary "coral" tile, cracks timber |
| **Props** | bombs, pots, clams, chests, relics, boulders, rubble, finds, the body, push blocks; impulses from blasts (`BLAST_POWER`), bombs roll and settle, blocks crush | spells shove, lift, hold, re-aim or spawn props; the prop then does the killing (a thrown boulder, a pulled bomb, a dropped block) |
| **Currents** | jets with `jetForceAt`, already pushing bodies, corpses and enemies | a spell IS a temporary jet: a current you place; everything that already obeys jets obeys it for free |
| **Creature states** | every enemy has a state machine (piranha windup/lunge, crab pause/snap, manta tell/dive, cannon track/charge), `stun` with knock drift, `lost()` via clouds, tentacle TN_* and clam CL_* states, NPC aggro, shop aggro, a shared damage table | spells poke states: force a lunge early, freeze a timer, extend a stun, flip "lost", wake a clam, set a creature's target to another creature (infighting hook) |
| **Light and sight** | the dim Shallows with `lightR` 4.5 (lantern 8.5), the Beholder's light cone, ink stains on enemies and rock | spells that light, blind, mark, or make the octopus unseen: cheap, atmospheric, strong in a dark biome |

Rule: a spell's description should name the channel. "Pulls every prop within 4 tiles toward the point" is a design;
"deals 12 damage in a cone" is not.

### 1.2 Keeping it from being overpowered

Spelunky's items are strong because they are scarce and double-edged; Noita's wands are strong because you can die
to them. Use both.

- **The jar is the budget.** Three casts per zone, no refill without the Siphon Shell. A spell that costs 1 cast
  must be worth about a bomb; a 2-cast spell must be worth a run-changing moment; a 3-cast spell empties the jar
  (a panic button you can use once per zone). Nothing costs 0.
- **Every spell has a self-risk.** It can hurt or trap the octopus, anger an NPC, break the shop, pull a boulder
  onto you, or wake what was asleep. The body is a physics prop (`PK_BODY`) and the damage table is shared, so this
  mostly comes for free: if the spell shoves props, it shoves you; if it breaks tiles, it breaks the shop frame.
- **No hitscan, no homing, no screen clears.** Everything has travel time, a radius you can see, or a telegraph.
  `killInRadius` exists for the bomb; spells only get `knockInRadius`, `hurt`, state pokes and props.
- **Scarcity instead of cooldowns.** Avoid per-spell cooldowns (hard to read on a phone). The jar is the cooldown.
  One exception: a short global 0.4 s cast lock so a scroll-wheel player cannot chain three casts in one frame.
- **Immunities stay.** Urchin, horns and the Beholder are immune to ink; the shopkeeper shrugs off ink. Spells
  respect the same table (Unified creature rules owner). The Beholder is never fooled, pushed or stopped.
- **Juice is also loot.** A spell that spawns a corpse-eating fish or kills a shopkeeper makes juice only with the
  Siphon Shell, so the Siphon stays the engine of a "spell build" and a run without it stays a 3-cast run.
- **Phones:** every spell must work cast-on-self (no cursor) and never need a held button. Effects are cheap:
  typed-array pools like the clouds (MAX 4-8), no per-frame allocation, no new canvases.

## 2. Spell ideas

Costs are in casts (1 cast = 4 droplets). Size is implementation effort (S: a row plus one effect using existing
calls; M: a new small system like the clouds; L: new materials, AI or art). Phone cost is per-frame work.

### Movement

1. **Riptide.** A 5-tile current from the cast point in the aim direction for 3 s (a temporary `HZ_JET` record
   with `jetForceAt`, any direction, not up-only). Everything that obeys jets rides it: the octopus (fast escape
   or a launch up a shaft), enemies, corpses, bombs and pots, the dead body. Risk: it also carries you into spikes,
   and carries a lit bomb back at you. Cost 1. S. Phone: one more jet record, nothing new.
2. **Blink.** Teleport up to 3 tiles toward the cursor, only into water (`isSolid` check along the line, stop at
   the last free cell). Leaves a small ink puff at the origin (0.8 s hide). Risk: it does not check hazards, so you
   can blink into a spike strip or a clam mouth; and the octopus arrives with its velocity, so a blink mid-dash
   keeps the dash. Cost 1. S. Phone: cast-on-self blinks in the facing direction.
3. **Anchor.** The octopus becomes heavy for 2 s: sinks fast, cannot be pushed by jets, knockback or blasts,
   crushes enemies it lands on like a push block (`crushEnemies`), and smashes timber and bone under it like a
   boulder (`smashTile`). Risk: you cannot dash or swim up; land on spikes and you are impaled. Cost 1. S-M.
4. **Slipstream.** For 5 s the octopus leaves a trail of 6 small clouds (the Ink Cloud pool, radius 0.7, 1.2 s
   each), so chasers lose you while you move. Risk: the trail marks your path for the Beholder (it hunts the newest
   cloud) and you spend the cloud pool, so a real Ink Cloud cast during it fails. Cost 1. S.

### Control

5. **Ink Cloud** (exists). Keep as the baseline: 4 s, enemies lose track. Add two small reactions: a bomb that
   explodes inside a cloud blows the cloud out (no hide), and a jet blows a cloud along it (the clouds already
   drift; add the jet force). Cost 1. S.
6. **Tentacle Grab.** A tentacle shoots 3 tiles to the cursor; the first enemy, prop or corpse hit is pulled to
   the octopus and held 1.5 s (set `stun`, set its position each step), then released with the octopus's velocity.
   This is the "pick up and throw" verb for creatures: pull a crab onto spikes, a bomb out of a pot pile, a
   shopkeeper's ware off the pedestal (theft: `shopAggro`). Risk: pulling a lit bomb or an urchin brings it to
   your face; a pulled piranha bites when the hold ends. Cost 1. M. Phone: auto-aims like the Ink Jet.
7. **Lure.** A glowing fish-shaped light at the cast point for 5 s. Enemies whose `lost()` is true, or who are
   patrolling, chase the lure instead of the octopus (their target becomes the lure point). A cannon aims at it.
   Risk: it gathers a crowd right where you put it, and it wakes dormant tentacles and clams in its light.
   Cost 1. M (a "target override" in the enemy AI; later reused by infighting). Phone: a 1-tile light, cheap.
8. **Hush.** 3 s during which no creature within 6 tiles can change state: lunges stay wound up, cannons stay
   charging, boulders stay shaking, clams stay open (a frozen `t` in each state machine, and `TN_*`/`CL_*` timers).
   Props keep moving. Risk: it freezes the timers, not the bodies, so a piranha already in its lunge still flies;
   and the Beholder is unaffected. Cost 2. M (one "frozen" flag checked in the update loops).
9. **Brine Spit.** A slow, heavy glob (the Ink Jet with a big radius, 2 tiles/s) that stuns what it hits for 1.5 s
   and coats it (the enemy ink stain). A stunned enemy drifts on knockback and dies on spikes (`SPIKE_KILL_SPEED`
   already treats stunned enemies as killable). Risk: short range, slow, and a stunned shopkeeper is still angry.
   Cost 1. S (inkjet.js with other parameters).

### Terrain

10. **Coral Wall.** Grows a 1x3 column of a new material, "coral" (breakable by bombs and boulders, cannot be
    grown into bedrock, masonry or a creature). Grown at the cursor, snapped to the grid; `placeRock` with the new
    id, `touchTile` re-bakes. Blocks shots, jets and chasers, and gives you a ledge to stand on under a ceiling
    spike. Risk: it can seal you in (bombs fix it), and a wall grown on top of a bomb or boulder launches it.
    Lasts the level. Cost 1. M (one material id, one bake style). Phone: one cell re-bake, same as a bomb.
11. **Erode.** A 3-tile line from the cursor into rock becomes silt: a material that falls when nothing solid is
    under it (a cheap sand: each step, a silt tile with water below moves down one cell; at most one move per
    tile per step, re-bake on landing) and that any body sinks through slowly. Rock, bone and timber erode;
    bedrock and masonry do not. Risk: silt pours onto you and buries you (incapacitation until you dash out),
    and it drops whatever stood on the eroded floor: boulders, blocks, a shop pedestal. Cost 2. L (a new material
    with a step, but no pixel sim: grid moves only). Phone: a few tile moves per step; cap live silt at 40 cells.
12. **Quake.** Every hanging boulder, loose block and shaky ceiling within 6 tiles drops now; timber platforms in
    range crack (`smashTile`) 0.5 s later; pots fall off ledges. Nothing else. Risk: it is a ceiling spell, so
    you are usually under what you drop. Cost 2. S (loop over hazards and props, set the rock state to falling).
13. **Stone Skin.** Target an enemy or NPC within 3 tiles: it turns into a rock tile for 6 s (`placeRock` at its
    cell, the creature is despawned and respawned at the end with `spawnAt`). While stone it is a wall: a step, a
    shield, a bomb target. Bomb the tile and the creature is gone for good (that is the kill path, and it leaves
    a corpse for juice). Risk: it works on Marlo and the shopkeeper, and the shopkeeper remembers. Cost 2. M.

### Summon

14. **Fish Familiar.** A small fish follows you for the level, bites what you Ink Jet (one bite per 1.5 s, 1 enemy
    hp tick), and eats corpses: each corpse eaten refills 1 droplet even without the Siphon Shell. Risk: it is a
    creature on the shared damage table, so spikes, boulders and your own bombs kill it, and piranhas hunt it.
    Cost 2. M (an enemy kind with a follow pattern and no contact damage). Phone: one more enemy.
15. **Decoy Shell.** Drops an octopus-shaped shell (a prop, `PK_POT` physics) that enemies target as if it were
    you for 4 s; it has 3 hits of "hp" and then breaks into rubble. Unlike the Ink Cloud, it works on the cannon
    and on Marlo's aim. Risk: the cannon shots and the harpoon still fly through the level after the decoy breaks.
    Cost 1. S-M (needs the same target override as Lure).
16. **Wake the Old One.** Spawn a dormant tentacle (the existing `CR_TENTACLE`) in the nearest wall cell toward the
    cursor. It grabs whatever comes near, including you (3 struggles to escape, as today). A shopkeeper walked
    past it is a shopkeeper eaten, no aggro to you if the altar rule "you did not touch him" is kept. Cost 2. S
    (creature spawn). Risk: obvious.
17. **Bone Bloom.** Target a corpse: it grows into a 1x2 bone-block pillar (`MAT_BONE`, breakable). A corpse
    becomes a step, a shield, a plug for a jet. Risk: none to you directly, but it spends corpses that would have
    leaked juice, and bone pillars block your own escape routes. Cost 1. S.

### Utility

18. **Lantern Pulse.** 3 s of `lightR` 12 and every buried find within 8 tiles shows through the rock (the Goggles
    reveal, time-limited). Marks cracked pocket walls. Risk: it also lights you for everything in range (enemy
    notice ranges doubled while it lasts). Cost 1. S. Phone: it is the existing light pass with a bigger radius.
19. **Siphon Burst.** Every juice droplet and every leaking body within 6 tiles is pulled in and drunk at once,
    Siphon Shell or not. Net positive only near two or more fresh corpses. Risk: pays 1 cast up front; at zero
    corpses it is a loss. Cost 1. S (the drops pool already pulls; set siphonR to 6 for one step).
20. **Mend.** Repairs 1 heart. Costs the whole jar (3 casts). This is the "spend everything to live" button and
    the reason a full jar at the Still Grotto matters. Risk: no juice for the rest of the zone. Cost 3. S.
21. **Bubble Shield.** A 1.3-tile bubble around the octopus for 3 s: absorbs one hit of any tier (a harpoon, a
    bite, a shock), and physically pushes props and enemies out of its radius (so it also shoves a lit bomb away).
    Risk: it pops on the first hit, instant-death tiers excluded (spikes and a boulder still kill: the bubble is
    not a hard shell), and it lifts you (bubbles rise, 1 tile/s), into ceiling spikes if you are careless.
    Cost 1. S-M.

### Risky and chaotic

22. **Ink Bomb.** Throws a bomb (the existing bomb, no bomb needed in the bag) with a 1 s fuse that explodes into a
    4-tile Ink Cloud (the blast at half radius). Terrain breaks, the cloud hides you from what survived. Risk: a
    real blast one tile from you. Cost 1. S (bomb spawn + cloud puff on explode).
23. **Chum.** Pour juice into the water: every piranha and manta within 10 tiles goes berserk for 6 s, attacking
    the nearest body of any kind (enemy, NPC, shopkeeper, corpse) instead of you. The infighting hook in a bottle.
    Risk: "nearest body" is often you; and it empties the pool of patrol fish into one spot. Cost 2. M (needs the
    target override). Phone: no new entities.
24. **Pressure Snap.** All props within 4 tiles get a strong impulse away from the cast point (a blast with no
    terrain damage: `knockInRadius` and the props blast impulse). Boulders fly, bombs fly, the shopkeeper's wares
    fly off the counter (aggro). Risk: whatever you throw can come back off a wall; the dead body too. Cost 1. S.
25. **Bloat.** Target an enemy: it swells for 2 s then bursts as a bomb blast of radius 1.5 (`killInRadius` of
    that size, terrain breaks). A crab becomes a walking bomb. Risk: it keeps walking toward you; and the burst
    counts as your blast for shop and NPC aggro. Cost 2. S.
26. **Borrowed Eyes.** For 4 s you see what the Beholder sees: the level is lit, every enemy is outlined, every
    buried find shown. The Beholder arrives 30 s sooner on this level. Risk: that. Cost 1. S (a time-pressure
    hook once that owner lands).

## 3. Modifiers (Noita-style, in the same slot)

A slot holds `ids: [spellId, mod, mod, ...]`. The first id is the spell; later ids are modifier rows with
`kind: "mod"`. A cast reads the spell row, folds the modifiers into a small `params` object, then runs the effect.
Modifiers only ever change seven numbers and two flags, so no effect needs to know which modifier it is seeing:

`radius, duration, speed, count, delay, power, cost` (multipliers or adds) and `bounce, leaky` (flags).

Each effect declares which of the seven it reads (`uses: ["radius", "duration"]`); the UI greys out a modifier that
changes nothing on this spell. This is what keeps the combinatorics sane: 26 spells x 8 modifiers is not 208 special
cases, it is 26 effects reading 9 fields.

| Modifier | Change | Price | Feel |
|---|---|---|---|
| **Heavy** | radius x1.6, duration x0.6, +1 cast | more juice | one big, short thing |
| **Scatter** | count x3, radius x0.5, power x0.5 | free | three small blinks, three small clouds, three Coral stubs |
| **Delayed** | delay +1.5 s (the cast lands as a glowing mark, then happens) | free | traps: a Delayed Quake under a shopkeeper |
| **Bounce** | the cast travels as a glob that bounces twice off rock before landing (Ink Jet physics) | free | reach around corners, risk it coming back |
| **Leaky** | cost -1 cast (min 0.5: pay 2 droplets), but the effect also hits the caster (the self-risk doubled: Brine Spit stuns you too, Riptide drags you) | cheaper | Noita's "wand that hurts" |
| **Lingering** | duration x2.5, power x0.6 | +1 cast | a Riptide that lasts the fight, a Lure that lasts the level |
| **Twin** | the effect also happens mirrored across the octopus (the opposite direction) | +1 cast | cover your back |
| **Quiet** | enemies do not notice the cast (no wake-ups, no aggro to NPCs if nobody is hit directly) | +1 cast | the stealth build with Stone Skin and Tentacle Grab |
| **Chum-soaked** | anything the spell touches leaks 1 droplet (enemies, props, tiles broken) | +1 cast | the juice-economy modifier; strong with the Siphon Shell |

Rules that keep it from exploding:
- At most two modifiers per slot (the hotbar draws the spell icon with up to two small runes under it).
- Cost never drops under 2 droplets; a Leaky Heavy spell still costs a cast.
- Modifiers with the same field in the same slot multiply, but every multiplied field is clamped (radius 0.5-3x,
  duration 0.4-3x, count 1-3). No field can reach a screen-clear.
- `Delayed` and `Bounce` both change the landing point, so they stack into "bounce, then wait": allowed, it is fun.
- A modifier rune can be moved between slots in the inventory panel (drag), which is the whole crafting UI.
  No wand editor, no spell order puzzles; Noita's depth without Noita's menu.

## 4. Where spells come from, and how many

Spelunky's rule: everything is in the world, nothing is in a menu.

- **Rune pedestals (main source).** A carved rune stone (the pool's rune-stone sprite exists) on a pedestal in a
  small alcove, 1 per level in about 2 of 3 levels, never two of the same spell in a zone. Touch it to take it;
  the spell goes to a new hotbar slot. Pedestal alcoves can be guarded (a dormant tentacle beside it, a clam under
  it) or trapped (the pedestal's floor is timber over spikes). The rune rooms are rows in the room bank, so the
  generator places them like the shop.
- **Shops.** 1 rune per stall at 12-20 shells, next to the bomb bag and the Siphon. Stealing it works as today.
- **NPC rewards.** The Quests rework owner is building "reward now or later": Marlo's third rescue gives a rune,
  Quill gives a modifier rune for the second relic, Pip's cage sometimes holds a rune instead of Pip.
- **Back rooms.** The vault (BACKROOMS.md C) guarantees a rune; the trader (D) sells modifiers only, which makes
  the trader worth finding; the lair (E) drops a 2-cast spell.
- **Modifier runes** are rarer than spells: about 1 per zone in the world, 1 in the trader, 1 from Quill.
- **The Still Grotto** could sell a reroll: pay 10 shells and the keeper swaps one of your runes for a random
  other, so a bad pick is not a dead run.

How many a run should offer: about **3-4 spells and 1-2 modifiers per zone** found, of which a player keeps 2-3
on the hotbar (the bar can hold 9, but with 3 casts a zone more than 3 spells is choice without juice). A full
three-zone run sees 8-10 runes and ends with 4-5 on the bar. That is enough that two runs differ and few enough
that each find is a decision ("do I swap Riptide for Tentacle Grab?"). The starting spell stays Ink Cloud, always.

Discovery goes in the journal's Items tab (silhouette until found), the first touch shows a 2 s toast with the
blurb, and nothing else explains anything. Players learn Leaky by casting it.

## 5. Recommended first set

Four spells plus Ink Cloud, and three modifiers, chosen so each one touches a different answer channel, all are
S or S-M in this engine, all work on a phone with cast-on-self, and every pair has a reason to be in the same bar.

| Spell | Channel | Why it is in the first set |
|---|---|---|
| **Ink Cloud** (exists) | sight | the baseline; the bomb-in-cloud and jet-moves-cloud reactions make it part of the system |
| **Riptide** (1) | currents | the most Spelunky-like: it moves everything, it is a tool and a trap, it reuses jets wholesale. The level answers it everywhere there is a prop |
| **Tentacle Grab** (6) | props + creatures | the missing verb: pick up and throw a creature. It makes spikes, clams and bombs into your weapons and theft into a spell. The octopus doing octopus things |
| **Coral Wall** (10) | tiles | the first spell that leaves the level changed, which is the Noita feeling at tile scale: a bridge, a plug, a shield, a seal. Pairs with bombs |
| **Brine Spit** (9) | creature states | a cheap stun that turns the shared damage table into a kill tool (stunned enemies die on spikes, drift in jets, get crushed), and the obvious Leaky victim |

Modifiers: **Heavy** (one dial everyone understands, makes every spell a different spell), **Delayed** (traps and
setups: a Delayed Coral Wall under a chasing crab, a Delayed Riptide at a doorway) and **Leaky** (the cheap-but-
dangerous one that gives the jar a fourth cast at a price; it is the modifier that teaches "spells cut both ways").

Pairs that should feel great: Riptide + Coral Wall (a current into a wall is a trap you built); Tentacle Grab +
Brine Spit (stun, grab, throw onto spikes); Ink Cloud + Delayed (puff, wait, the cloud lands where the chase will
be); Riptide + a lit bomb (the Spelunky "oh no" moment); Heavy Coral Wall (a 3x3 plug that seals a shop door with
the shopkeeper inside, until he breaks it).

Deferred on purpose: Erode (L, needs the silt material; do it with the "silt and sand tiles" proposal, not here),
Chum and Lure (need the target override; do them right after enemy infighting lands, since they are the same code),
Mend (decide with Daniel whether a heal spell belongs in a Spelunky damage model at all), Borrowed Eyes (waits for
the time-pressure owner), Stone Skin (fun, but it touches every creature's despawn/respawn and should wait for the
Unified creature rules).

Open questions for Daniel (recommended default in bold):
1. Modifiers at all in the first pass, or spells only? **Spells first, modifiers one round later**, the data shape is ready.
2. Does a rune pedestal cost anything? **No, but it can be guarded or trapped.**
3. Phone casting: cast-on-self only, or a short aim in the facing direction? **Facing direction for Riptide, Grab and Wall; on self for the rest.**
4. Can a spell hurt the shopkeeper without aggro (Delayed, Quiet)? **Direct hits always aggro; a prop the spell moved does not** (same rule as the boulder).
5. Hotbar size with 3 casts: keep 9 slots? **Keep 9, but the inventory shows casts remaining next to each so the budget is visible.**
