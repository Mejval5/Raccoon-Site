# Spells: the pick (2026-10-08, second designer)

Status: decision doc, no code. Read after `SPELLS-IDEAS.md`. Checked against the live code (`spells.js` EFFECTS,
`hazards.js` `jetForceAt`, `world-v2.js` `placeRock` / `smashTile`, `hotbar.js` slot `ids`, `main.js` `spellTarget`),
the round-3 owners (`OWNERS.md`) and the controls brainstorm (`CONTROLS-IDEAS.md`).

## 1. Where I agree and disagree with the brainstorm

Agree, and keep: the five answer channels as the test for a spell (a spell that only deals damage is cut); "the jar is
the budget, no cooldowns" (1 cast is worth a bomb, 2 a run-changing moment, one global 0.4 s cast lock); every spell
has a self-risk that falls out of shared systems; modifiers as seven numbers folded into `params`, two per slot,
clamped; Riptide and Coral Wall, the two best ideas in the doc (each reuses a whole engine system, each is a tool and a
trap, each works cast-on-self); rune pedestals as the main source, Ink Cloud always the start, no menus.

Disagree:
- **Tentacle Grab is out.** It is the planned hand (`CONTROLS-IDEAS.md` scheme A: pick up, carry, throw within 1.2
  tiles) with 3 tiles of reach and a juice price. The controls doc says they differ; I do not buy it: once the hand
  exists, Grab is "the hand, longer", and without the hand it is a worse hand that costs a third of the jar. If range
  ever matters, it is a modifier on the hand. Re-open after the controls talk.
- **Brine Spit is out.** By its own description it is "inkjet.js with other parameters", and the Actions tuning owner is
  making the Ink Jet slow and rare on purpose. Worse, a 1-cast stun is the most overpowered thing you can add on top
  of the coming creature rules: stunned enemies already die on spikes (`SPIKE_KILL_SPEED`), get crushed and drift in
  jets, and with infighting a stunned crab is piranha food. Stun stays a bomb and boulder side effect.
- **Leaky is out.** "Cost -1 cast, min 0.5" breaks the integer jar and hotbar, and Leaky Ink Cloud is a pure discount
  (a cloud cannot hurt the caster): one rune turns 3 clouds into 6. A fourth cast belongs to the Siphon economy.
- **Quake, Pressure Snap, Bloat, Ink Bomb** are out for this pass because chain reactions are coming: dropping every
  boulder or flinging every prop in 4-6 tiles is a screen clear once blasts set off bombs, eels and clams. Ink Bomb
  also duplicates the bomb, which the controls talk is about to redesign.
- **Blink** duplicates the dash (the clean i-frame dodge), **Lantern Pulse** duplicates the Goggles, **Bubble Shield**
  is a heart per cast (3 casts = 3 hearts, strictly better than the 3-cast Mend). Out.
- The brainstorm defers Lure. I pull it forward as the fifth spell, built last: it is the one spell that makes the
  coming infighting legible (gather them, then let them bite each other), and it is the light channel, which the dim
  Shallows and Milan's bioluminescence want.

## 2. The first set

Five spells and three modifiers, in build order. Costs in casts (1 cast = 4 droplets). Phones cast on the octopus or
1.5 tiles along the facing (Q2). Nothing here moves, fools or hurts the Beholder, ever.

| # | Spell | Cost | Channel | Numbers |
|---|---|---|---|---|
| 1 | **Ink Cloud** (exists) | 1 | sight | radius 2.1, 4 s, drift 0.25; max 4 live |
| 2 | **Riptide** | 1 | currents | a current 5 tiles long, half-width 1.1 (the jet's), from the cast point in the aim direction, 3 s (0.3 s swell, 0.5 s fade), force 0.8 x `JET_ACC`; max 2 live, the newest replaces the oldest |
| 3 | **Coral Wall** | 1 | tiles | a column of 3 cells of new material `MAT_CORAL`, bottom cell at the target cell, grown upward over 0.4 s; crumbles on its own after 25 s (Q1); max 24 live cells |
| 4 | **Anchor** | 1 | props + tiles | self only, 2.0 s (ends early 0.4 s after you come to rest): sink 16 u/s^2, cap 12 u/s, steering 40 %, no dash, no swim-up; immune to jet, blast and knock impulses (not to damage) |
| 5 | **Lure** | 1 | light + creature states | a bioluminescent lure at the cast point, 6 s, light radius 2.5; the 6 nearest patrolling or `lost()` creatures within 7 tiles target the point; 0.6 s grace before it attracts; max 1 live |

**Ink Cloud.** Two reactions make it part of the system: a jet or Riptide carries a cloud along the stream (add
`jetForceAt` to the drift) and a blast inside a cloud blows it out. Immunities from the creature-rules table.

**Riptide.** A temporary `HZ_JET` record, any direction (today's jets are up-only by level design; the hazard code has
`dx, dy`). Everything that obeys jets rides it for free: the octopus, enemies, corpses, bombs, pots, boulders, the
ragdoll body, droplets, ink clouds. Rooted creatures (tentacle, clam, cannon) and the keeper (half force) are not
moved; the Beholder is not. It does not stun, so the current alone kills nothing: an enemy dies only when it is
delivered to spikes at `SPIKE_KILL_SPEED`, into a clam, under a boulder or next to a lit bomb. That keeps it honest with
chain reactions: a delivery system whose cargo is already priced. Drawback: it pushes you too, it carries a lit bomb
back out of a hole toward you, and it blows the juice you wanted to drink out of reach. Why it earns the slot: the most
Spelunky-like spell this engine can have, the level answers it wherever there is a prop, and it is the smallest effect.

**Coral Wall.** Cells grow only into water, never on the level border, inside the shop rect or inside a live jet stream
(jets precompute `len`), and never on a cell a body overlaps (octopus, enemy, NPC, keeper, prop): such cells are
skipped, and if none can grow the cast fails without spending juice. `MAT_CORAL` is bomb-breakable and boulder-smashed
like bone, bare of foliage, drawn with the bone bake tinted coral until Art paints it. It blocks shots, jets, chasers
and your own Ink Jet, gives a ledge under a ceiling spike, and a Riptide into a Coral Wall is a trap you built. A wall
grown over a lit bomb skips the bomb's cell and grows above it: the blast then has a roof. Drawback: it seals you in
(bombs fix it), it blocks your own escape, and a crumbling wall drops what sat on it. Why it earns the slot: the first
spell that leaves the level changed, at tile scale, the Noita feeling Daniel can have without a pixel simulation.

**Anchor.** The octopus becomes a falling rock for 2 s. Landing on an enemy at 6 u/s or more kills it through the crush
path pushable blocks use (`enemies.kill(e, 'crush')`); landing on timber or bone at `ROCK_SMASH_SPEED` smashes the tile
(`world.smashTile`). It does not crush the keeper or an NPC: a `HIT_HEAVY` on the keeper (aggro), a 1-heart hit on an
NPC, both through the creature-rules table. Blasts and knockback still cost hearts but do not move you, so it is also
the answer to "a jet keeps throwing me into the spikes". Drawback: fully committed: no dash, no swim-up, spikes below
impale you, a boulder above still splats you, the timber you smash drops what stood on it onto you. Why it earns the
slot: with the dash turned into a pure i-frame dodge the game loses its only committed move; Anchor gives it back as a
spell, needs no aim on a phone, and costs one cast for one positional kill, a bomb's price without the terrain damage.

**Lure.** The infighting owner's target override, exposed as a point. The lure drifts with jets (a Riptide carries it),
the cannon aims at it, it wakes dormant tentacles and clams inside its light, a blast on it ends it. Creatures
mid-attack, rooted kinds, the keeper, NPCs and the Beholder ignore it. Drawback: it gathers a crowd where you put it, on
a phone where you stand (hence the 0.6 s grace). With infighting live, a crowd around the lure plus one bleeding body is
a feeding frenzy: the intended payoff, still priced at a cast plus a kill. Why it earns the slot: the only spell on the
light channel, it fits the art rule, and it turns infighting into something the player sets up instead of only watches.

**Modifiers** (rows with `kind: "mod"` in the same slot list; at most two per slot; price is added to the spell's):

| Modifier | Change | Price | Reads on | Notes |
|---|---|---|---|---|
| **Heavy** | radius x1.6, duration x0.6 | +1 cast | Ink Cloud, Riptide (width 1.1 -> 1.76, length 5 -> 8), Coral Wall (3 -> 5 cells), Lure (light 2.5 -> 4) | greyed on Anchor |
| **Delayed** | the cast lands as a drifting bioluminescent mote, the effect fires 1.5 s later at that point | free | all five | traps: Delayed Coral Wall behind a chasing crab, Delayed Riptide at a doorway, Delayed Anchor for a timed drop |
| **Lingering** | duration x2.5, power x0.6 | +1 cast | Ink Cloud 10 s, Riptide 7.5 s at 0.48 x `JET_ACC`, Coral Wall lasts the level, Lure 15 s | built third, only if the rune UI is cheap; greyed on Anchor |

Rules: a slot's price is a whole number of casts, never below 1; fields clamp (radius 0.5-3x, duration 0.4-3x); Heavy plus Lingering in one slot is allowed and costs 3 casts, the whole jar, which is the point.

## 3. Dependencies, so the build can be ordered

- **Controls talk (Daniel first).** Decides: (a) the phone Spell button, which scheme A morphs into Grab when a thing
  is in reach (cast-on-self needs the "nearly still" rule so casts are not swallowed); (b) rune pickup by contact or by
  the interact key; (c) whether a carried bomb (scheme C) rides a Riptide; (d) hotbar keys (Q/E -> Q/R). None of it
  touches the spell rows or effects, so those can be built before the talk; pickup verb, phone aim and key tests wait.
- **Unified creature rules (running).** Owns the immunity table every spell reads (who a Riptide moves, who a Lure
  attracts, whom Anchor crushes), the shared crush path, and the keeper's heavy-hit handling. Riptide, Coral Wall and
  Anchor should be built on its branch or after it merges, never against today's per-kind code.
- **Chain reactions and infighting (queued after creature rules).** Lure needs the target override; Riptide carrying
  a bomb into a clam needs chain reactions to be honest. Build Lure as the last spell, on the infighting owner's API.
- **Actions tuning (running).** Dash becomes i-frames only: Anchor must cancel and forbid the dash; the Ink Jet gets
  rarer: no spell may be a jet variant (that is why Brine Spit is out).
- **Time pressure and Art (running).** The Beholder is immune to all five (it may hunt the newest Lure as a tell);
  the Ink Cloud is being painted now, the other four need art (section 4).

Order: Riptide, Coral Wall, Anchor (after creature rules) -> pedestals, Heavy, Delayed -> controls-dependent parts -> Lure -> Lingering.

## 4. Implementation brief (one Opus owner, Sonnet devs for art plumbing and tests)

Data: `play/data/spells.json` gets rows `riptide`, `coral-wall`, `anchor`, `lure` (`effect`, `cost`, `radius`, `duration`,
`delay`, `power`, `uses`, `journal`, `blurb`, `self: true` for Anchor) and a `mods` array (`heavy`, `delayed`, `lingering`:
`kind: "mod"`, multipliers, adds, `cost`); `journal.json`: 4 spell and 3 rune entries; `patterns.json`: a `rune` pedestal row.

Code: `js/spells.js`: `resolveSlot(ids)` folds mod rows into `params` and an integer price; `castSpell(run, ids, ctx)`
takes the slot's id list (today it takes one id); a `pending` pool (max 4) for Delayed, ticked from `update`; the 0.4 s
cast lock; EFFECTS `riptide`, `coral`, `anchor`, `lure`. `js/hazards.js`: `addTempJet(x, y, dx, dy, len, gain, ttl)`
writing into the existing `HZ_JET` pool (cap 48) with a new `ttl` array and per-record `gain`; `jetForceAt` unchanged;
`hazards-draw.js` draws the stream in any direction. `js/materials.js`: `MAT_CORAL = 6` in `MAT_BOMBABLE`,
`MAT_BOULDER_BREAKS`, `MAT_PRIORITY`, `MAT_DRAW_ORDER`, bake style; `js/world-v2.js`: `placeTile(tx, ty, mat)`
generalising `placeRock`, `inJet(tx, ty)`; a small `js/coral.js` pool (24 cells, ttl, crumble -> `breakTile`, fresh
edges, rubble). `js/octopus.js`: `o.anchorT` (no dash, no swim-up, sink override); `hazards.js` `updateJet`, `props.js`
`blast` and `hurtOctopus` knock check it; landing crush via `props.js` `setEnemyKiller` / `enemies.kill(e, 'crush')`
and `world.smashTile`. `js/enemies.js` (or `creatures.js` after the rules merge): `setLure(x, y, r, until)`, read
where `lost(e, octo)` is read. `js/spells-draw.js`: stream, coral growth, anchor pose, lure glow, the Delayed mote.
`js/spell-icons.js`: four icons, three runes, code-drawn until Art paints them. `hotbar-ui.js` / `inventory-ui.js`:
slot price in casts, up to two runes under an icon; v1 attaches a picked rune to the selected slot, drag comes later.
`js/level-spawns.js` + `js/pickups.js`: the rune pedestal (sprite `stone` exists), contact pickup with a 0.5 s dwell.

Tests (`tests/spells.test.js`, `tests/hotbar.test.js`, bot, phone checks): price folding and the whole-cast floor; Riptide
moves a corpse and a prop, not a rooted creature, and expires; Coral Wall skips occupied, border, shop and jet cells,
refuses a blocked cast for free, crumbles at 25 s with a rebake; Anchor ignores jet and blast impulses, crushes at >= 6
u/s, smashes timber, cannot dash; Lure retargets a piranha, never the Beholder or keeper; Delayed fires at 1.5 s; bot 30/30.

Art (Milan's style, no sparkles): a coral tile bake, a lure (glowing anglerfish bulb on a stalk), a riptide bubble
stream, an anchored pose, four icons, three rune glyphs, a pedestal alcove. Waits for the controls talk: the pickup
verb, the phone aim rule, the Spell-button morph, the hotbar keys.

## 5. Three questions for Daniel (default in bold)

1. Coral Wall: crumbles after 25 s, or lasts the level and we trust bombs to fix a sealed-in octopus? **25 s;**
   Lingering makes it permanent for +1 cast.
2. Phone aim: cast on the octopus only, or 1.5 tiles along the facing for Riptide, Coral Wall and Lure? **Along the
   facing;** Anchor and Ink Cloud on self.
3. Lure now with a cheap "lost enemies wander to the light" stub, or wait for the infighting owner's target override?
   **Wait;** ship four spells first, Lure lands with infighting in the same round.
