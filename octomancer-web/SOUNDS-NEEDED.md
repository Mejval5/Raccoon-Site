# Octomancer: sounds needed (brief for a sound designer or an ElevenLabs sound-effects pass)

Written 2026-10-18, after night batch 5 (the sound palette and voice limiter, `play/js/sfx.js`, `audio.js`, `ui-sfx.js`). This
file is a log only: no code reads it. When an asset drop comes in, wiring is mechanical (section 4). Line numbers are
`site/octomancer/play/js/main.js` unless another file is named. They drift; the function or event name is the stable handle.

**The world in one breath.** Octomancer is a small octopus diving through an underwater cave, drawn by Milan in a warm,
hand-inked cartoon style. Everything should sound **wet, close, soft and organic**: water, bubbles, shell, coral, wood, clay,
sand, kelp, fish. No sci-fi, no metal, no electronics, no lasers, no coins, no chimes from a slot machine, no reverb tails
like a cathedral. Underwater means the highs are rolled off, attacks are rounded and things are a little muffled; the
octopus is cute, not gory. The music (Flûte de forêt, Medles) is Milan's and stays as it is.

**Status words.**
- **synth**: has its own synthesized sound today (sfx.js / ui-sfx.js / audio.js). A sample would replace it.
- **placeholder**: makes a sound, but a borrowed one (the generic `chime`, `thud`, `dash`, `hurt`, `slurp` or `inkPuff`).
- **silent**: nothing plays.

**Priority.** A: heard every minute of play. B: heard every run. C: rare (once a run or less).

**Prompt style.** Every prompt is one sentence, ready to paste into a sound-effects generator. They all end on the same
house style, so it can also be appended once: *"underwater, muffled, close, dry, no music, no voice"*.

## 1. Silent today (the gaps), by priority

The IMPROVEMENTS.md item 9 list comes first, then the rest found in the event switches.

| # | event id | where it fires | trigger | len | priority |
|---|---|---|---|---|---|
| 1 | `pickups:shell` | pickups loop ~1070 (`pickups.events`) | a loose shell picked up (most common pickup) | 0.08 s | A |
| 2 | `pickups:plankton` | pickups loop ~1070 | a juice mote / plankton picked up | 0.1 s | A |
| 3 | `enemyKilled` | enemy events loop ~1174 | a fish / crab / manta / urchin / cannon dies | 0.3 s | A |
| 4 | `creatures:snap` (clam snap) | handleCreatureEvents ~3034 | a giant clam slams shut | 0.25 s | A |
| 5 | `creatures:grab` (tentacle grab) | handleCreatureEvents ~3035 | a cave tentacle seizes the octopus | 0.4 s | B |
| 6 | piranha bite | enemies.js ~1072 (`octoHit(.., 'bite')`) | a piranha / crab / horns bites her (only the generic `hurt` plays) | 0.15 s | A |
| 7 | manta slam | enemies.js ~1071 (`MA_DIVE`) | a manta's dive slam stuns her | 0.35 s | B |
| 8 | `shotFired` (cannon shot) | enemies.js ~779, not handled in main.js | a cannon shell fires its pellet | 0.3 s | B |
| 9 | `shotHit` | enemy events loop ~1173 | a cannon pellet hits a creature or her | 0.15 s | B |
| 10 | octopus stunned | octopus.js `stunOctopus` (from slam / shot) | she is dazed for a moment | 0.6 s | B |
| 11 | death by clam | creatures.js ~252 (`killOctopus(.., 'clam')`) | the clam shuts on her | 0.6 s | C |
| 12 | `creatures:eaten` (swallowed) | creatures.js ~474 (`'eaten'`) | the tentacle pulls her into its maw | 0.8 s | C |
| 13 | death by harpoon | npcs.js harpoon hit on the octopus | an angry person's harpoon kills her | 0.5 s | C |
| 14 | corpse landing | corpses.js settle (no event yet) | a body thumps onto the floor (cap: 1 per 0.15 s) | 0.2 s | A |
| 15 | portal whoosh | `beginEntry` ~897 / `finishPortal` ~3571 | she swims into the whirlpool / a door ring | 1.2 s | B |
| 16 | `keeper:roused` (shopkeeper aggro) | handleKeeperEvents ~3765 | the shopkeeper turns hostile | 0.8 s | B |
| 17 | `keeper:clawTell` | handleKeeperEvents ~3765 | the keeper rears back before a claw | 0.4 s | C |
| 18 | push block | props.js block slide (no event yet) | a stone block scrapes along the floor (loop while moving) | loop | B |
| 19 | `creatures:wake` / `tremble` / `strike` | creatures.js (events not handled) | a clam or tentacle stirs, quivers, lunges | 0.3 s | B |
| 20 | `creatures:killed` | handleCreatureEvents ~3027 | a clam / tentacle / eel / anemone dies | 0.4 s | B |
| 21 | `creatures:release` | handleCreatureEvents ~3039 | the tentacle lets her go | 0.3 s | B |
| 22 | `creatures:bonk` | handleCreatureEvents ~3040 | she bumps a closed clam | 0.1 s | A |
| 23 | `creatures:pearl` | handleCreatureEvents ~3020 | a pearl taken from an open clam | 0.4 s | B |
| 24 | `grabCreature` | handleCreatureEvents ~3033 | a tentacle seizes another creature | 0.3 s | C |
| 25 | `frenzyBite` | drainInfight ~3519 | piranhas tear at another creature | 0.15 s | B |
| 26 | `hazards:rockFall` | hazards.js (not handled) | a boulder breaks loose and starts to fall | 0.6 s | B |
| 27 | `hazards:rockLanded` | hazards loop ~1107 | a boulder lands | 0.4 s | B |
| 28 | `hazards:surge` | hazards.js jet surge (not handled) | a vent jet blasts a current | 0.8 s | B |
| 29 | `hazardHurt` (anemone / urchin sting) | hazards loop ~1110 | a sting (only the generic `hurt`) | 0.15 s | B |
| 30 | octopus wall bounce | step ~1093 (`bouncedThisStep`) | a fast dash bounces off rock | 0.12 s | A |
| 31 | ink blob hit | stepInkJet ~1201 (`inkJet.events.hits`) | an ink blob hits a creature | 0.1 s | A |
| 32 | ink blob splat on rock | stepInkJet ~1200 (`nSplat`) | an ink blob splats on a wall | 0.08 s | A |
| 33 | bomb placed / thrown | `placeBomb` ~1196 | she drops or throws a bomb | 0.15 s | A |
| 34 | bomb fuse | bomb.js (fuse 1.6 s) | a lit fuse fizzing (loop while lit) | loop | A |
| 35 | sticky mine clings | bomb.js `BM_STICKY` cling | an urchin-mine sticks to rock or a creature | 0.12 s | B |
| 36 | `loot:chaseStart` | loot.js (not handled) | the relic chase rock starts rolling | 1.0 s | C |
| 37 | `loot:chaseEnd` | handleLootEvents ~3137 | the chase rumble stops (toast only) | 0.6 s | C |
| 38 | `loot:pocket` | handleLootEvents ~3119 | a hidden pocket bursts open | 0.3 s | B |
| 39 | `shop:poor` | onShopEvent ~4211 | she cannot afford a ware | 0.2 s | B |
| 40 | `shop:full` | shop.js (not handled) | her hands / slots are full | 0.2 s | C |
| 41 | `shop:knocked` / `fell` | onShopEvent ~4194 | a ware knocked off its pedestal / falls | 0.2 s | C |
| 42 | `keeper:hurt` / `killed` | handleKeeperEvents ~3765 | the shopkeeper is hurt / dies | 0.3 s | C |
| 43 | `npc:angered` | onNpcEvent ~2622 | a person turns angry | 0.5 s | B |
| 44 | `npc:killed` | onNpcEvent ~2631 | a person dies | 0.4 s | C |
| 45 | `npc:harpoonHit` | onNpcEvent ~2644 | a harpoon thunks into rock or a body | 0.15 s | B |
| 46 | talk / dialogue line | hand 'talk', `say()` | a person speaks a line (a soft murmur, not words) | 0.3 s | A |
| 47 | `pool:lost` | onPoolEvent ~3909 | the wager is lost | 0.6 s | C |
| 48 | `spellfx:coralGrow` | handleSpellFxEvents ~1398 | Coral spell: coral grows | 0.5 s | B |
| 49 | `spellfx:coralCrumble` | handleSpellFxEvents ~1399 | the coral crumbles | 0.4 s | B |
| 50 | `spellfx:moteFire` | handleSpellFxEvents ~1400 | a delayed mote fires | 0.15 s | B |
| 51 | `spellfx:lure` / `lureGone` | handleSpellFxEvents ~1403 | a Lure appears / fades | 0.5 s | C |
| 52 | `spellfx:riptide` | handleSpellFxEvents ~1404 | a riptide current | 0.6 s | C |
| 53 | co-op leave | `removeSlot` ~1959 | a player removed / pad unplugged | 0.4 s | C |
| 54 | ghost rise | `stepGhostOf` ~2130 (`createGhost`) | a dead player's ghost rises | 1.0 s | B |
| 55 | ghost freeze charge | `stepGhostOf` / `ghostFreeze` ~2190 | the ghost charges its freeze (loop while charging) | loop | B |
| 56 | exit pull | `stepPull` ~2017 | the others are drawn to the whirlpool (loop) | loop | C |
| 57 | hub room opens | `villageArrived` ~4087 | a room opens: someone moved in | 1.0 s | C |
| 58 | hub build placing | (hub building not landed yet) | a piece placed in the hub | 0.3 s | C |
| 59 | sign unfolds | signs.js / render pass (open sign) | a sign board unfolds when she is near | 0.3 s | A |
| 60 | altar hollow lights | altar.js tier up | a hollow on the altar lights | 0.6 s | C |
| 61 | `altar:anger` | altar-level.js ~141 | the altar is bombed or given a person | 1.2 s | C |
| 62 | level fade / transition | `beginEntry` ~897, `ensureFade` ~2378 | the screen fades between levels | 1.0 s | B |
| 63 | level title | `showLevelTitle` ~2519 | the level banner shows ("Shallows 1-2") | 1.5 s | B |
| 64 | game over sting | step ~1215 (`gameover` event) | the death screen comes up | 2.0 s | B |
| 65 | biome cleared sting | `ui.showEnd` ~2549 | the clear screen | 2.5 s | C |
| 66 | journal open / close | `openInventory` / `closeInventory` (Tab, View) | the book opens or shuts | 0.4 s | B |
| 67 | pause open / close (keyboard) | `applyPaused` ~720 (Esc, Start) | the pause menu opens / closes (mouse and pad already click) | 0.2 s | B |
| 68 | hotbar cycle | input `cycle` / `select` (Q/E, wheel, LB) | the selected slot moves | 0.05 s | A |
| 69 | toast | `ui.showToast` | a line of text appears | 0.1 s | B |
| 70 | ambient cave bed | (none) | a quiet water bed under the music | loop | A |
| 71 | piranha lunge | enemies.js ~740 (`PIRANHA_WINDUP`) | a piranha winds up and lunges | 0.2 s | B |
| 72 | crab pinch | enemies.js ~839 | a crab pinches her (only the generic `hurt`) | 0.12 s | B |
| 73 | manta tell | enemies.js `MANTA_TELL` | the manta rears up before diving | 0.5 s | C |
| 74 | urchin pulse | enemies.js `URCHIN_PULSE_PERIOD` | an urchin's spines bristle | 0.3 s | C |
| 75 | entry (arrive) | stepEntry (r45 scripted entry) | she arrives in a level out of the vortex | 0.8 s | B |
| 76 | ambient: hub village | (none) | the hub's water bed | loop | B |
| 77 | ambient: Still Grotto | (none) | the rest level's water bed | loop | C |

## 2. Every sound event, by area

Columns: id, where, trigger, status, length, character, priority, prompt. The silent rows above appear again here in their
area with their prompt.

### Octopus

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| `audio.setSwimIntensity` | step ~1125 | swimming, every step (loop, gain by speed) | synth | loop | soft water rush that rises with speed | A | A gentle continuous rush of water past a small swimming octopus, rising and falling smoothly, underwater, muffled, close, dry, no music, no voice. |
| `sfx.dash` | step ~1042 | a dash | synth | 0.17 s | water shoved aside, quick whoosh | A | A quick soft whoosh of water pushed aside by a small octopus darting forward, underwater, muffled, close, dry, no music, no voice. |
| `sfx.hurt` | step ~1078 | she loses a heart | synth | 0.25 s | muffled low thump and a few bubbles | A | A muffled cartoon bump on a soft rubbery body followed by three tiny escaping bubbles, underwater, muffled, close, dry, no music, no voice. |
| `sfx.thud` (body hit) | step ~1083 | her dead body is hit | synth | 0.13 s | soft low thump | B | A soft low thump against a limp rubbery body, underwater, muffled, close, dry, no music, no voice. |
| octopus wall bounce | step ~1093 | a fast dash bounces off rock | silent | 0.12 s | rubbery boing off stone, small | A | A small rubbery bounce of a soft body off smooth stone, underwater, muffled, close, dry, no music, no voice. |
| octopus stunned | octopus.js `stunOctopus` | dazed by slam or shot | silent | 0.6 s | woozy wobble with a bubble trill | B | A short woozy wobble with a thin trill of bubbles as a little octopus is dazed, cartoon, underwater, muffled, close, dry, no music, no voice. |
| death (generic) | step ~1078 (hearts to 0) | she dies (any cause; only `hurt` plays) | placeholder | 0.8 s | deflating sigh of bubbles, soft sink | B | A soft deflating sigh of bubbles as a small cartoon octopus goes limp and sinks, gentle not gory, underwater, muffled, close, dry, no music, no voice. |
| `sfx.splat` | hazards loop ~1114 | a boulder flattens her | synth | 0.5 s | heavy thud, wet squish, crackles | C | A heavy stone thud with a wet cartoon squish and a few pebbles settling, underwater, muffled, close, dry, no music, no voice. |
| `sfx.impale` | hazards loop ~1111 | skewered on spikes | synth | 0.25 s | sharp prick and a wet thunk | C | A sharp prick into a soft body and a short wet thunk, cartoon not gory, underwater, muffled, close, dry, no music, no voice. |
| `sfx.zap` | hazards loop ~1112 | an eel shocks her | synth | 0.3 s | buzzy crackle falling away | B | A short organic crackling buzz like an eel's shock, fizzing out, not electronic, underwater, muffled, close, dry, no music, no voice. |
| `pickups:shell` | pickups loop ~1070 | a shell picked up | silent (`sfx.shell` exists, unwired) | 0.08 s | tiny shell click, climbs on a run | A | A tiny bright click of two small seashells tapping together, underwater, muffled, close, dry, no music, no voice. |
| `pickups:plankton` | pickups loop ~1070 | a juice mote picked up | silent | 0.1 s | soft bubbly gulp | A | A tiny soft bubbly gulp as a glowing speck of plankton is swallowed, underwater, muffled, close, dry, no music, no voice. |
| `sfx.slurp` (juice into jar) | stepJuice ~1529 | fish juice drops reach the jar | synth | 0.12 s | quick rising slurp | A | A quick little rising slurp of liquid into a clay jar, underwater, muffled, close, dry, no music, no voice. |

### Combat (ink, hand, spells)

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| `sfx.inkJet` | stepV2 ~1419 | the Ink Jet fires | synth | 0.09 s | short wet squirt | A | A short wet squirt of thick ink pushed out of a small nozzle, underwater, muffled, close, dry, no music, no voice. |
| ink blob hit | stepInkJet ~1201 | a blob hits a creature | silent | 0.1 s | soft wet slap | A | A soft wet splat of ink slapping onto a fish's side, underwater, muffled, close, dry, no music, no voice. |
| ink blob splat on rock | stepInkJet ~1200 | a blob splats on rock | silent | 0.08 s | tiny damp pat | A | A tiny damp pat of ink hitting stone, underwater, muffled, close, dry, no music, no voice. |
| `sfx.inkPuff` (Ink Cloud) | castSelected ~1375 | the Ink Cloud spell | synth | 0.45 s | low soft puff of ink | B | A low soft puff as a cloud of ink blooms out, underwater, muffled, close, dry, no music, no voice. |
| spell cast (other spells) | castSelected ~1375 | any other spell cast | placeholder (`chime`) | 0.3 s | a warm, breathy bubble swell | A | A warm swell of rising bubbles with a faint hum of kelp magic, natural not sparkly, underwater, muffled, close, dry, no music, no voice. |
| `sfx.emptyJar` | castSelected ~1381 | a cast with too little juice | synth | 0.2 s | two hollow knocks on an empty clay jar | A | Two hollow knocks on an empty clay jar, underwater, muffled, close, dry, no music, no voice. |
| `hand:grab` | hand events ~1448 | she picks a thing up with a tentacle | placeholder (`thud`) | 0.12 s | soft suction grip | A | A soft little suction-cup pop as a tentacle grips something, underwater, muffled, close, dry, no music, no voice. |
| `hand:throw` | hand events ~1449 | she throws it | placeholder (`dash`) | 0.15 s | flick of water | A | A quick flick of water as a small object is tossed, underwater, muffled, close, dry, no music, no voice. |
| `hand:drop` | hand events ~1450 | she sets it down | placeholder (`thud`) | 0.1 s | soft set-down on sand | A | A soft set-down of a small object on sand, underwater, muffled, close, dry, no music, no voice. |
| `hand:shield` | hand events ~1451 | a carried pot takes a hit for her | placeholder (`thud`) | 0.2 s | clay knock, crack | B | A dull knock on a clay pot that cracks a little, underwater, muffled, close, dry, no music, no voice. |
| `hand:hit` | hand events ~1452 | a thrown thing hits | placeholder (`thud`) | 0.12 s | soft impact | A | A soft rounded impact of a thrown object hitting a body, underwater, muffled, close, dry, no music, no voice. |
| `spellfx:anchorCrush` / `anchorSmash` | handleSpellFxEvents ~1401 | the Anchor lands / smashes | placeholder (`thud`) | 0.4 s | heavy stone drop into sand | B | A heavy stone anchor dropping into sand with a deep soft boom, underwater, muffled, close, dry, no music, no voice. |
| `spellfx:coralGrow` | handleSpellFxEvents ~1398 | coral grows | silent | 0.5 s | crackling, creaking growth | B | Coral growing in a quick crackling creak like twigs stretching, underwater, muffled, close, dry, no music, no voice. |
| `spellfx:coralCrumble` | handleSpellFxEvents ~1399 | the coral crumbles | silent | 0.4 s | brittle crumble | B | Brittle coral crumbling into sand, underwater, muffled, close, dry, no music, no voice. |
| `spellfx:moteFire` | handleSpellFxEvents ~1400 | a delayed mote fires | silent | 0.15 s | soft glowing pop | B | A soft pop of a glowing plankton mote bursting, underwater, muffled, close, dry, no music, no voice. |
| `spellfx:lure` / `lureGone` | handleSpellFxEvents ~1403 | a Lure appears / fades | silent | 0.5 s | low gentle hum that blooms / fades | C | A low gentle bioluminescent hum blooming in the water, underwater, muffled, close, dry, no music, no voice. |
| `spellfx:riptide` | handleSpellFxEvents ~1404 | a riptide current | silent | 0.6 s | swirling rush | C | A short swirling rush of current pulling sideways, underwater, muffled, close, dry, no music, no voice. |

### Creatures: fish (enemies.js)

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| piranha bite | enemies.js ~1072 | a piranha / crab / horns bites her | silent (generic `hurt`) | 0.15 s | quick toothy snap | A | A quick small toothy snap of a fish's jaws, cartoon, underwater, muffled, close, dry, no music, no voice. |
| piranha lunge | enemies.js ~740 (`PIRANHA_WINDUP`) | a piranha winds up and lunges | silent | 0.2 s | tail flick swish | B | A sharp little tail-flick swish of a fish lunging, underwater, muffled, close, dry, no music, no voice. |
| crab pinch | enemies.js ~839 | a crab pinches her | silent (generic `hurt`) | 0.12 s | chitin click-pinch | B | A dry chitin click of a small crab claw pinching, underwater, muffled, close, dry, no music, no voice. |
| manta slam | enemies.js ~1071 | a manta's dive slam | silent | 0.35 s | broad wing whump | B | A broad soft whump of a manta ray's wings slapping down through water, underwater, muffled, close, dry, no music, no voice. |
| manta tell | enemies.js `MANTA_TELL` | the manta rears up before diving | silent | 0.5 s | rising flap | C | A slow rising flap of wide fins before a dive, underwater, muffled, close, dry, no music, no voice. |
| `shotFired` (cannon) | enemies.js ~779 | a cannon shell fires | silent | 0.3 s | hollow shell pop, a puff | B | A hollow pop of a spiral shell spitting a pellet with a puff of water, no gunpowder, underwater, muffled, close, dry, no music, no voice. |
| `shotHit` | enemy events ~1173 | a pellet hits | silent | 0.15 s | small stony tap | B | A small stony tap of a pellet hitting, underwater, muffled, close, dry, no music, no voice. |
| urchin pulse | enemies.js `URCHIN_PULSE_PERIOD` | an urchin's spines bristle | silent | 0.3 s | prickly rustle | C | A prickly rustle of sea-urchin spines bristling, underwater, muffled, close, dry, no music, no voice. |
| `enemyKilled` | enemy events ~1174 | a fish dies | silent | 0.3 s | soft pop and a little flutter | A | A soft cartoon pop and a brief flutter of fins as a little fish is knocked out, gentle, underwater, muffled, close, dry, no music, no voice. |
| corpse landing | corpses.js settle | a body lands on the floor | silent | 0.2 s | soft flop on sand | A | A soft wet flop of a small fish body landing on sand, underwater, muffled, close, dry, no music, no voice. |
| `frenzyBite` | drainInfight ~3519 | piranhas tear at a creature | silent | 0.15 s | flurry of tiny snaps | B | A quick flurry of tiny fish-jaw snaps, cartoon, underwater, muffled, close, dry, no music, no voice. |

### Creatures: clams, tentacles, eels, anemones (creatures.js)

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| `creatures:snap` (clam) | handleCreatureEvents ~3034 | a giant clam slams shut | silent | 0.25 s | heavy shell clack, a gust of bubbles | A | A heavy clack of a giant clam shell snapping shut with a gust of bubbles, underwater, muffled, close, dry, no music, no voice. |
| `creatures:bonk` | handleCreatureEvents ~3040 | she bumps a closed clam | silent | 0.1 s | knuckle tap on shell | A | A light knuckle tap on a thick closed seashell, underwater, muffled, close, dry, no music, no voice. |
| `creatures:pearl` | handleCreatureEvents ~3020 | a pearl taken | silent | 0.4 s | smooth roll and a soft pearl click | B | A smooth pearl rolling out of a shell with a soft round click, underwater, muffled, close, dry, no music, no voice. |
| death by clam | creatures.js ~252 | the clam shuts on her | silent | 0.6 s | clack then muffled squeeze | C | A big shell clacking shut followed by a muffled squeeze and a few bubbles, cartoon, underwater, muffled, close, dry, no music, no voice. |
| `creatures:wake` / `tremble` / `strike` | creatures.js | a clam or tentacle stirs, quivers, lunges | silent | 0.3 s | creak of shell or a slithering stir | B | A low creak and slithery stir of a sea creature waking, underwater, muffled, close, dry, no music, no voice. |
| `creatures:grab` (tentacle) | handleCreatureEvents ~3035 | a tentacle seizes her | silent | 0.4 s | slimy wrap and suction | B | A slimy wrapping squeeze of a big tentacle with suction pops, underwater, muffled, close, dry, no music, no voice. |
| `creatures:release` | handleCreatureEvents ~3039 | the tentacle lets go | silent | 0.3 s | unpeeling suction, bubbles | B | A tentacle unpeeling with a few suction pops and a burst of bubbles, underwater, muffled, close, dry, no music, no voice. |
| `creatures:eaten` | creatures.js ~474 | swallowed by the tentacle's maw | silent | 0.8 s | deep gulp, slow | C | A deep slow cartoon gulp from a large cave creature, underwater, muffled, close, dry, no music, no voice. |
| `grabCreature` | handleCreatureEvents ~3033 | a tentacle seizes another creature | silent | 0.3 s | wrap and squeeze | C | A quick slimy wrap and squeeze around a small fish, underwater, muffled, close, dry, no music, no voice. |
| `creatures:killed` | handleCreatureEvents ~3027 | a clam / tentacle / eel / anemone dies | silent | 0.4 s | sagging sigh, shell settling | B | A sagging sigh of a big sea creature going still, shell settling on sand, underwater, muffled, close, dry, no music, no voice. |
| `hazardHurt` (anemone / urchin sting) | hazards loop ~1110 | a sting | silent (generic `hurt`) | 0.15 s | prickly sting | B | A small prickly sting from an anemone's tendrils, underwater, muffled, close, dry, no music, no voice. |

### Hazards and terrain

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| `hazards:rockFall` | hazards.js | a boulder breaks loose | silent | 0.6 s | grinding crack then a rumble | B | A stone cracking loose from a cave ceiling with a short low rumble, underwater, muffled, close, dry, no music, no voice. |
| `hazards:rockLanded` | hazards loop ~1107 | a boulder lands | silent | 0.4 s | deep stone thud into silt | B | A deep heavy stone thud into silt, underwater, muffled, close, dry, no music, no voice. |
| `hazards:surge` | hazards.js | a vent jet surges | silent | 0.8 s | bubbling rush from a vent | B | A rushing surge of bubbles from a seabed vent, underwater, muffled, close, dry, no music, no voice. |
| `sfx.crunch` | handleCrumbles ~1253 | fish-bone block crumbles | synth | 0.15 s | dry bony crunch, crumbs | B | A dry brittle crunch of old fish bones crumbling, underwater, muffled, close, dry, no music, no voice. |
| push block | props.js block slide | a stone block scrapes along (loop) | silent | loop | low stone scrape on sand | B | A slow low scrape of a stone block sliding over sand, underwater, muffled, close, dry, no music, no voice. |
| `sealedBump` | sealedBump ~489 | she bumps the sealed hub exit | placeholder (`thud`) | 0.15 s | soft bump on kelp curtain | C | A soft muffled bump against a thick curtain of kelp, underwater, muffled, close, dry, no music, no voice. |

### Loot and props

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| `sfx.chime` (pickup bubble-pop) | many: loot, embed, rune, quest, skins, shop (about 35 sites) | a good thing happened | synth | 0.15 s | soft bubble-pop | A | A soft round bubble pop with a small second bubble after it, pleasant, underwater, muffled, close, dry, no music, no voice. |
| `sfx.potBreak` (`loot:break`) | handleLootEvents ~3102 | a clay pot breaks | synth | 0.2 s | dull clay knock then shatter | A | A dull clay knock then a soft shatter of a small pot, underwater, muffled, close, dry, no music, no voice. |
| `loot:chest` | handleLootEvents ~3107 | a chest opens | placeholder (`chime`) | 0.5 s | wooden lid creak and a puff | B | A waterlogged wooden chest lid creaking open with a puff of silt, underwater, muffled, close, dry, no music, no voice. |
| `loot:trap` (spike / dart trap) | handleLootEvents ~3117 | a chest trap springs | placeholder (`hurt`) | 0.3 s | wooden snap, a spring of spines | B | A wooden snap of a trap springing with a rattle of spines, underwater, muffled, close, dry, no music, no voice. |
| `loot:pocket` | handleLootEvents ~3119 | a hidden pocket bursts | silent | 0.3 s | rock pops, shells spill | B | A small rock pocket popping open and shells spilling out, underwater, muffled, close, dry, no music, no voice. |
| `loot:item` | handleLootEvents ~3127 | an item picked up | placeholder (`chime`) | 0.3 s | rounder pickup, a little swell | B | A warm rounded pickup sound with a little swell of bubbles, underwater, muffled, close, dry, no music, no voice. |
| `loot:relic` | handleLootEvents ~3132 | a relic taken | placeholder (`chime`) | 0.8 s | deep hollow, ancient | C | A deep hollow resonance of an ancient stone relic lifted, soft, underwater, muffled, close, dry, no music, no voice. |
| `loot:chaseStart` | loot.js | the relic chase rock rolls | silent | 1.0 s | big rolling rumble | C | A big round stone starting to roll through a cave with a growing rumble, underwater, muffled, close, dry, no music, no voice. |
| `loot:chaseEnd` | handleLootEvents ~3137 | the rumble stops | silent | 0.6 s | rumble settling | C | A rolling rumble settling into stillness, underwater, muffled, close, dry, no music, no voice. |
| `embed:released` / `take` | handleEmbedEvents ~3089 / ~3094 | a buried find drops out / taken | placeholder (`chime`) | 0.3 s | stone loosening, a pop | B | A small stone loosening from a wall with a pop of silt, underwater, muffled, close, dry, no music, no voice. |
| `takeCarried` | takeCarried ~3067 | a carried item / spell picked up | placeholder (`chime`) | 0.3 s | rounder pickup | B | A warm rounded pickup sound with a little swell of bubbles, underwater, muffled, close, dry, no music, no voice. |
| `tryTakeRune` | tryTakeRune ~3434 | a rune taken | placeholder (`chime`) | 0.6 s | low glowing hum | C | A low glowing hum of a carved rune stone waking, underwater, muffled, close, dry, no music, no voice. |
| `earnSwift` | earnSwift ~3455 | the Swift Current bonus | placeholder (`chime`) | 0.5 s | quick current swirl | C | A quick bright swirl of current rushing past, underwater, muffled, close, dry, no music, no voice. |

### Shop and NPCs

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| `shop:bought` | onShopEvent ~4207 | a ware bought | placeholder (`chime`) | 0.4 s | shells counted out, a pleased hum | B | A small handful of seashells clicked onto a wooden counter, underwater, muffled, close, dry, no music, no voice. |
| `shop:stolen` | onShopEvent ~4199 | a ware taken unpaid | placeholder (`chime`) | 0.3 s | furtive grab | C | A quick furtive grab with a guilty little bubble, cartoon, underwater, muffled, close, dry, no music, no voice. |
| `shop:poor` | onShopEvent ~4211 | she cannot afford it | silent | 0.2 s | soft dull "nope" knock | B | A soft dull wooden knock meaning not enough, underwater, muffled, close, dry, no music, no voice. |
| `shop:full` | shop.js | no room to carry | silent | 0.2 s | soft dull knock | C | A soft dull wooden knock, underwater, muffled, close, dry, no music, no voice. |
| `shop:knocked` / `fell` | onShopEvent ~4194 | a ware knocked off its pedestal | silent | 0.2 s | wooden clatter | C | A small wooden object clattering off a stone pedestal, underwater, muffled, close, dry, no music, no voice. |
| `keeper:roused` (aggro) | handleKeeperEvents ~3765 | the shopkeeper turns hostile | silent | 0.8 s | angry crustacean click and a grunt-like bubble | B | An angry clacking of a big lobster's claws with a low bubbling grumble, cartoon, underwater, muffled, close, dry, no music, no voice. |
| `keeper:clawTell` | handleKeeperEvents ~3765 | he rears before a claw | silent | 0.4 s | claws opening | C | A big crustacean claw creaking open, underwater, muffled, close, dry, no music, no voice. |
| `keeper:clawLaunch` | handleKeeperEvents ~3777 | the claw shoots out | placeholder (`dash`) | 0.2 s | fast swish | B | A fast heavy swish of a big claw shooting through water, underwater, muffled, close, dry, no music, no voice. |
| `keeper:octoHit` | handleKeeperEvents ~3779 | the claw hits her | silent (generic `hurt`) | 0.2 s | hard clack | B | A hard clack of a big claw striking, cartoon, underwater, muffled, close, dry, no music, no voice. |
| `keeper:hurt` / `killed` | handleKeeperEvents ~3765 | he is hurt / dies | silent | 0.3 s | shell crack, a groan of bubbles | C | A crack on a big crustacean shell with a groan of bubbles, cartoon, underwater, muffled, close, dry, no music, no voice. |
| `npc:hurt` | onNpcEvent ~2621 | a person is hurt | synth (`hurt`) | 0.25 s | a person's bump | B | A muffled cartoon bump on a soft body, underwater, muffled, close, dry, no music, no voice. |
| `npc:angered` | onNpcEvent ~2622 | a person turns angry | silent | 0.5 s | short angry bubbling huff | B | A short angry bubbling huff, cartoon, no words, underwater, muffled, close, dry, no music. |
| `npc:killed` | onNpcEvent ~2631 | a person dies | silent | 0.4 s | soft sigh of bubbles | C | A soft sad sigh of bubbles, gentle, no words, underwater, muffled, close, dry, no music. |
| `sfx.harpoon` (`npc:harpoon`) | onNpcEvent ~2643 | a harpoon is shot | synth | 0.15 s | hiss through water, launch knock | B | A wooden harpoon hissing through water with a knock as it leaves, underwater, muffled, close, dry, no music, no voice. |
| `npc:harpoonHit` | onNpcEvent ~2644 | it thunks into rock or a body | silent | 0.15 s | wooden thunk | B | A wooden harpoon thunking into stone, underwater, muffled, close, dry, no music, no voice. |
| death by harpoon | npcs.js | the harpoon kills her | silent | 0.5 s | thunk then deflating bubbles | C | A wooden thunk followed by a soft deflating sigh of bubbles, cartoon not gory, underwater, muffled, close, dry, no music, no voice. |
| talk / dialogue line | hand 'talk', `say()` | a person speaks a line | silent | 0.3 s | soft murmur, no words | A | A soft friendly murmur of a small sea creature, no words, underwater, muffled, close, dry, no music. |
| quest paid | payQuest ~3797 | a quest is finished | placeholder (`chime`) | 0.6 s | warm grateful swell | B | A warm grateful swell of bubbles and a soft hum, underwater, muffled, close, dry, no music, no voice. |
| people reward | stepPeople ~3844 | a person hands over a reward | placeholder (`chime`) | 0.4 s | rounder pickup | B | A warm rounded pickup sound with a little swell of bubbles, underwater, muffled, close, dry, no music, no voice. |
| pool wager `paid` / `won` / `prize` | onPoolEvent ~3907 / ~3910 / ~3916 | the ink-pool wager | placeholder (`chime`) | 0.5 s | cheer of bubbles | C | A small happy cheer of bubbles, cartoon, no words, underwater, muffled, close, dry, no music. |
| pool wager `lost` / `poor` | onPoolEvent ~3909 | lost / cannot pay | silent | 0.6 s | deflating wobble | C | A small deflating wobble of disappointment, cartoon, underwater, muffled, close, dry, no music, no voice. |

### Bombs and chain reactions

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| bomb placed / thrown | placeBomb ~1196 | she drops or throws a bomb | silent | 0.15 s | soft heavy plop | A | A soft heavy plop of a round urchin bomb set down on sand, underwater, muffled, close, dry, no music, no voice. |
| bomb fuse | bomb.js | a lit fuse (loop while lit, 1.6 s) | silent | loop | fizzing bubble stream | A | A steady fizzing stream of tiny bubbles like a sputtering fuse underwater, no fire, underwater, muffled, close, dry, no music, no voice. |
| sticky mine clings | bomb.js | the urchin-mine sticks | silent | 0.12 s | prickly stick | B | A small prickly stick of an urchin clinging to rock, underwater, muffled, close, dry, no music, no voice. |
| `sfx.bomb(gain)` (`exploded`) | bomb loop ~1149 | a blast | synth | 0.5 s | deep round boom, roar closing, bubble rush | A | A deep round underwater boom with a closing roar and a rush of bubbles after it, no fire, no debris clatter, muffled, close, dry, no music, no voice. |
| `sfx.chainTick` (`link`) | handleChainEvents ~381 | a chain link goes off (pitch rises with depth) | synth | 0.08 s | hollow wood knock | B | A hollow wooden knock, short and round, underwater, muffled, close, dry, no music, no voice. |

### Portals and transitions

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| portal whoosh | beginEntry ~897 / finishPortal ~3571 | into the whirlpool / door ring | silent | 1.2 s | swirling vortex that draws in | B | A swirling water vortex drawing a small creature in and down, deep and soft, underwater, muffled, close, dry, no music, no voice. |
| entry (arrive) | stepEntry (r45 scripted entry) | she arrives in a level | silent | 0.8 s | vortex releasing | B | A swirling current releasing into calm water, underwater, muffled, close, dry, no music, no voice. |
| level fade | ensureFade ~2378 | the screen fades | silent | 1.0 s | soft low swell | B | A soft low swell of deep water, underwater, muffled, close, dry, no music, no voice. |
| level title | showLevelTitle ~2519 | the level banner | silent | 1.5 s | low hollow drum of a cave | B | A single low hollow knock echoing faintly in a cave, underwater, muffled, close, no music, no voice. |
| unlock moment | stepUnlock ~500 | the hub exit unseals after the tutorial | placeholder (`chime`) | 1.0 s | kelp curtain parting | C | A thick curtain of kelp parting with a long soft rustle, underwater, muffled, close, dry, no music, no voice. |
| tutorial door | openDoor ~3331 | a tutorial door opens | placeholder (`chime`) | 0.6 s | stone grinding open | C | A stone slab grinding open slowly, underwater, muffled, close, dry, no music, no voice. |
| back room hop | backHop ~3278 | into / out of a back grotto | placeholder (`slurp`) | 0.4 s | squeeze through a gap | B | A small soft body squeezing through a narrow rock gap, underwater, muffled, close, dry, no music, no voice. |
| back room spring / leave | stepBack ~3301 | the grotto spring refills | placeholder (`chime`) | 0.8 s | gentle spring bubbling | C | A gentle bubbling spring welling up from the cave floor, underwater, muffled, close, dry, no music, no voice. |
| rest spring | stepRestSpring ~3200 | the Still Grotto spring | placeholder (`chime`) | 1.0 s | warm healing bubble rise | C | A warm rising column of soft healing bubbles, underwater, muffled, close, dry, no music, no voice. |
| siphon | stepSiphon ~2050 | the juice siphon | placeholder (`chime`) | 0.5 s | draining slurp | C | A long draining slurp of liquid through a reed, underwater, muffled, close, dry, no music, no voice. |
| `sfx.dreadSwell` | onBeholderEvent ~3471 | the Beholder is coming | synth | 4.6 s | long low swell | B | A long low ominous swell from the deep, felt more than heard, underwater, muffled, no music, no voice. |
| `sfx.beholderArrive` | onBeholderEvent ~3474 | the Beholder arrives | synth | 2.4 s | deeper quicker swell and a deep sigh | C | A deep quick swell and a vast slow exhale from something huge in the dark, underwater, muffled, no music, no voice. |
| `audio.setBeholderDread` | step ~1126 | Beholder near (loop) | synth | loop | low drone | B | A low steady drone of something huge and near in deep water, underwater, muffled, no music, no voice. |
| game over sting | step ~1215 (`gameover`) | the death screen | silent | 2.0 s | sinking, soft, sad | B | A short soft sinking swell of bubbles drifting down into the dark, sad but gentle, underwater, muffled, no music, no voice. |
| biome cleared sting | ui.showEnd ~2549 | the clear screen | silent | 2.5 s | rising warm bubbles | C | A warm rising rush of bubbles towards the light, triumphant but soft, underwater, muffled, no music, no voice. |

### Hub and village

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| hub room opens | villageArrived ~4087 | a room opens: someone moved in | silent | 1.0 s | wooden door creak, a friendly bubble | C | A small wooden door creaking open with a friendly little bubble, underwater, muffled, close, dry, no music, no voice. |
| hub build placing | (hub building not landed yet) | a piece placed | silent | 0.3 s | wood set on stone | C | A wooden piece set firmly onto stone, underwater, muffled, close, dry, no music, no voice. |
| mirror: wear a look | looks picker onWear ~656 | a look is worn at the mirror shell | placeholder (`chime`) | 0.5 s | shimmer of a pearl mirror | C | A soft pearly shimmer of a seashell mirror, natural not sparkly, underwater, muffled, close, dry, no music, no voice. |
| skin gift | stepSkinGifts ~683 | someone gives her a look | placeholder (`chime`) | 0.6 s | gift unwrap of kelp | C | Kelp wrapping peeled open around a gift, underwater, muffled, close, dry, no music, no voice. |
| hub gift for the next dive | hubStep ~4071 | a person gives a gift | placeholder (`chime`) | 0.4 s | rounder pickup | C | A warm rounded pickup sound with a little swell of bubbles, underwater, muffled, close, dry, no music, no voice. |
| ink practice target hit | hubTargetHit ~4110 / ~4116 | a target hit / round won | placeholder (`thud` / `chime`) | 0.2 s | wooden target knock | B | A hollow knock on a wooden practice target, underwater, muffled, close, dry, no music, no voice. |
| kelp curtain bump | villageStep ~4126 | she bumps the locked curtain | placeholder (`thud`) | 0.15 s | soft kelp bump | C | A soft muffled bump against a thick curtain of kelp, underwater, muffled, close, dry, no music, no voice. |
| keepsake found | villageStep ~4140 | the keepsake in the hollow | placeholder (`chime`) | 0.8 s | small treasure, wooden box | C | A small wooden keepsake box lifted from sand with a soft rattle inside, underwater, muffled, close, dry, no music, no voice. |
| sign unfolds | signs.js (open sign) | a sign board unfolds near her | silent | 0.3 s | soft wooden unfold, paper-like kelp | A | A soft wooden board unfolding with a papery rustle of kelp, underwater, muffled, close, dry, no music, no voice. |
| altar: offering taken | altar-level.js ~122 | an offering is taken | placeholder (`thud`) | 0.6 s | low stone hum swallowing | C | A low stone hum as an old altar swallows an offering, underwater, muffled, close, no music, no voice. |
| altar: hollow lights | altar.js tier | a hollow lights | silent | 0.6 s | soft glow bloom | C | A soft warm bloom like a glowworm lighting in stone, underwater, muffled, close, no music, no voice. |
| altar: gift | altar-level.js ~129 | the altar gives a gift | placeholder (`chime`) | 0.6 s | warm rising swell | C | A warm rising swell of bubbles from old stone, underwater, muffled, close, no music, no voice. |
| `altar:anger` | altar-level.js ~141 | the altar is bombed / given a person | silent | 1.2 s | deep stone groan and rumble | C | A deep angry groan of old stone with a low rumble, underwater, muffled, no music, no voice. |

### Menus and journal

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| `ui.focus` | ui-sfx.js via menu-nav.js | the menu cursor moves | synth | 0.03 s | tiny dry tick, a bead | A | A tiny dry tick of a fingernail on a wooden bead, close, dry, no music, no voice. |
| `ui.confirm` | ui-sfx.js | a button chosen | synth | 0.08 s | round wooden knock | A | A round soft knock on a small wooden block with a faint ring, close, dry, no music, no voice. |
| `ui.back` | ui-sfx.js | back / close | synth | 0.07 s | lower duller knock | A | A lower duller knock on a wooden block, close, dry, no music, no voice. |
| `ui.page` | ui-sfx.js | a journal page / chapter | synth | 0.14 s | leaf turned | B | A soft swish of a large dry leaf being turned, close, dry, no music, no voice. |
| `ui.slider` | ui-sfx.js | a slider notch | synth | 0.02 s | tiny tick, pitch by value | B | A very short tiny wooden tick, close, dry, no music, no voice. |
| journal open / close | openInventory / closeInventory | Tab / View | silent | 0.4 s | a leather book opening / closing | B | A small leather-bound book opening with a soft creak of its spine, close, dry, no music, no voice. |
| pause open / close (keyboard) | applyPaused ~720 | Esc / Start | silent | 0.2 s | soft hush, world held | B | A soft quick hush like water stilling, close, dry, no music, no voice. |
| hotbar cycle | input cycle / select | Q / E, wheel, LB, 1-9 | silent | 0.05 s | tiny shell click | A | A tiny click of a small shell being turned, close, dry, no music, no voice. |
| toast | ui.showToast | a line of text appears | silent | 0.1 s | very soft bubble | B | A very soft single small bubble, close, dry, no music, no voice. |

### Co-op and ghosts

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| co-op join | tryJoin ~1951 | a pad joins as a player | placeholder (`chime`) | 0.6 s | friendly double bubble, a hello | B | A friendly little double bubble like a hello, cartoon, underwater, muffled, close, dry, no music, no voice. |
| co-op leave | removeSlot ~1959 | a player removed / unplugged | silent | 0.4 s | falling double bubble, a goodbye | C | A small falling double bubble like a goodbye, cartoon, underwater, muffled, close, dry, no music, no voice. |
| exit pull | startPull ~2014 / stepPull ~2017 | the others drawn to the whirlpool (loop) | placeholder (`slurp` at start) | loop | soft current drawing | C | A soft steady current drawing things toward a whirlpool, underwater, muffled, close, dry, no music, no voice. |
| ghost rise | stepGhostOf ~2130 | a dead player's ghost rises | silent | 1.0 s | airy rising wisp | B | An airy soft rising wisp of a friendly little ghost leaving a body, gentle, underwater, muffled, no music, no voice. |
| ghost blow | ghostBlow ~2187 | the ghost blows a current | placeholder (`inkPuff`) | 0.4 s | breathy puff | B | A breathy cartoon puff of a ghost blowing a gust through water, underwater, muffled, close, dry, no music, no voice. |
| ghost freeze charge | stepGhostOf / ghostFreeze ~2190 | the ghost charges its freeze (loop) | silent | loop | rising crystalline cold hush (not glassy) | B | A slowly rising cold hush like frost spreading on still water, soft, not glassy, underwater, muffled, no music, no voice. |
| ghost freeze cast | ghostFreeze ~2194 | the freeze goes off | placeholder (`chime`) | 0.5 s | frosty crackle | B | A short frosty crackle as cold water stiffens, soft, underwater, muffled, close, dry, no music, no voice. |
| revive | reviveGhost ~2211 | a ghost is revived | placeholder (`chime`) | 0.8 s | warm swell, a breath back | B | A warm rising swell and a little gasp of bubbles as a friend comes back, cartoon, underwater, muffled, no music, no voice. |

### Ambience and music cues

| event id | where | trigger | status | len | character | pri | prompt |
|---|---|---|---|---|---|---|---|
| music: Flûte de forêt | audio.js | in play | Milan's track (keep) | loop | - | A | (do not generate) |
| music: Medles | audio.js | pause, game over, tab hidden | Milan's track (keep) | loop | - | B | (do not generate) |
| ambient cave bed | (none yet) | always, under the music, very low | silent | loop 30-60 s | far-off water movement, slow drips, distant bubbles | A | A calm far-off underwater cave ambience with slow drips and distant bubbles, seamless loop, no music, no voice. |
| ambient: hub village | (none yet) | in the hub | silent | loop 30-60 s | the cave bed plus soft creaks of wooden huts | B | A calm underwater village ambience with soft creaks of wooden huts and gentle bubbles, seamless loop, no music, no voice. |
| ambient: Still Grotto | (none yet) | the rest level | silent | loop 30-60 s | stiller, a spring trickling | C | A very still underwater grotto with a small spring trickling, seamless loop, no music, no voice. |

## 3. Counts

Counted from the section 2 tables (one row per event; the two music tracks are not counted as events to make).

- **147 rows** in section 2, of which 2 are Milan's music tracks: **145 sound events.**
- **Silent: 77** (section 1; the same rows appear in section 2).
- **Synthesized today: 26** (own sound in sfx.js / ui-sfx.js / audio.js, including the swim and drone loops).
- **Placeholder (borrowed sound): 42** (the generic chime, thud, dash, hurt, slurp or inkPuff standing in; the chime row
  alone covers about 35 call sites).

## 4. Delivery format and wiring notes

**Files.**
- Mono, 44.1 kHz, Ogg Opus (`.ogg`, 64-96 kbps) with a WebM/Opus or MP3 fallback only if asked; the game already picks
  Opus over MP3 for the music (`audio.js pickExt`).
- Trimmed: no silence before the attack (under 5 ms), tail faded to true zero, no clicks. Loops cut on a zero crossing and
  seamless (say "loop" in the file name).
- Peak -3 dBFS, no limiting pumping; one-shots normalised to the loudness targets below, not all to the same peak.
- Name: `play/audio/sfx/<event-id>[-<n>].ogg`, for example `clam-snap-1.ogg`, `clam-snap-2.ogg`. Give 2-4 variants for every
  A-priority sound so repeats do not sound identical (the game will pick one at random and still add its own ±5% pitch).
- Size: keep the whole effects set under about 1.5 MB; most one-shots are 3-15 KB each at these lengths.

**Loudness targets** (short-term LUFS of the sound itself, relative to the music at full volume, which sits near -16 LUFS):
- Constant or very frequent (swim loop, ambient bed, focus tick, hotbar, shell pickup, ink jet): -30 to -26 LUFS.
- Ordinary feedback (pickups, hand, hits, menu confirm, creature sounds): -24 to -20 LUFS.
- Big moments (bomb point blank, splat, Beholder, clam snap on her, portal): -18 to -14 LUFS. The bomb is scaled down by
  distance in code (`sfx.bomb(gain)`), so deliver it at point-blank loudness.
- Stings (game over, cleared, level title) sit under the music: -22 to -18 LUFS.

**Voice limiter (already in code; samples go through the same gate).**
- 24 world voices and 4 menu voices play at once; past that the voice nearest its end is cut with a 12 ms fade. A sample
  plays on one voice, so a sample is cheaper than the layered synths it replaces.
- Per-event cooldown (a repeat sooner than this is dropped), in `sfx.js COOL` / `ui-sfx.js UI_COOL`: chime 60 ms, shell
  40 ms, inkJet 60 ms, inkPuff 80 ms, hurt 80 ms, thud 60 ms, dash 60 ms, slurp 50 ms, emptyJar 80 ms, chainTick 40 ms,
  crunch 40 ms, bomb 50 ms, potBreak 50 ms, harpoon 60 ms, splat 80 ms, impale 80 ms, zap 60 ms, dread swells 1 s; menu focus
  30 ms, confirm / back 60 ms, page 100 ms, slider 35 ms. New events default to 50 ms; suggested: clam snap 80, enemy killed
  40, corpse landing 150, bite 60, ink hit 40, ink splat 40, bomb place 80, sign unfold 250, talk 120.
- While the AudioContext is suspended (before the first real gesture) nothing plays, samples included.
- Pause ducks the effects to 0.3 and stops the swim loop; menu sounds are on their own bus and are not ducked. The death
  screen ducks the music to 0.5.

**Wiring a drop (mechanical).** For each file: decode once into an `AudioBuffer` on the first input (never before: nothing
audio is fetched before the first input), keep them in a map by event id, and in sfx.js replace the event's synth layers with
one buffer layer on a pooled voice (`audio.voice()`, the same `play(name, ...)` gate). Silent events get one line at their
handler in main.js (`sfx.<id>()`), which is morning pick 9. A test with the fake AudioContext (`tests/audio.test.js`)
counts one start per event.
