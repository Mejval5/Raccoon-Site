# Creatures: one table, one damage entry

2026-10-08. Daniel asked: "spikes don't hurt shopkeepers - why? Unless there's a good reason, all enemies should have the same
treatment in terms of physics, collision, damage, etc. Of course some have immunities to knock-out, some are one-hit splat,
some are different, like Spelunky."

This file has three parts: the audit (what the code did before and why the shopkeeper ignored spikes), the new rules (the
table and the one rule), and how other owners use them.

Code:

- `site/octomancer/play/js/creature-rules.js` has the data: `CREATURES` (one row per kind), `SOURCES` (one row per damage
  source) and `resolveHit(kind, src, dmg, shut)`, the rule.
- `site/octomancer/play/js/damage.js` is the shared entry point. It holds a `createDamage()` registry of body families and
  the helpers `hit`, `blast`, `circle`, `each` and `push`. `octoHit(o, src, ...)` is the octopus's side.
- Each system applies the outcome to its own records through one function: `enemies.applyHit`,
  `creatures.applyHit`, `npcs.applyHit` and `shopkeeper.js applyKeeperHit`. Each system also exposes a family adapter:
  `enemies.family`, `creatures.family()`, `npcs.family` and `keeperFamily(k)`.
- `main.js` registers the four families once through `proxyFamily`, which always forwards to the current level's systems. It
  then hands the entry to `hazards.setDamage`, `props.setDamage`, `loot.setDamage` and `bombs.update(..., damage)`.
- Tests are in `tests/creature-rules.test.js`. It checks a matrix of 270 kind x source cells through the real systems, the
  shopkeeper on spikes, and consistency regressions.

## 1. Audit: what happened before (master at 412743ba)

Every hazard picked its own victims by hand. Each one had its own list of who it reached, and each list held different
systems:

| Source | Code | Who it reached |
|---|---|---|
| Spikes | `hazards.js spikeEnemies` | **Only the enemy list** (`enemies.all()`), and only enemies with `e.moving` that were not immune and not the Beholder. Octopus: impaled. |
| Boulder | `hazards.js crushUnder` and an injected `bodyHit` (`main.js boulderBodies`) | Enemies (killed), NPCs (4 dmg), keepers (10 dmg as HIT_HEAVY). Clams and tentacles were not reached: the boulder fell through them. |
| Falling block | `props.js crushEnemies` | Only enemies. NPCs, keepers and creatures were not reached. |
| Bomb | `bomb.js` plus three calls in `main.js` | Four separate rules. Enemies: `killInRadius` killed everything inside R that was not immune, and `knockInRadius` shoved anything with `moving` or of kind `cannon` out to 2R. Keepers: `bombKeepers`, 26 dmg falling off to 0 at 2R. NPCs: `npcs.blast`, 6 dmg falling off to 0 at R, and rock between shielded them (only NPCs had this). Creatures: `creatures.blast` killed inside R + 0.5, whatever their hp. |
| Jets | `hazards.js jetsPush` | Enemies by name (`'piranha'`, `'manta'` drift), stunned enemies, props, corpses, the octopus. NPCs and keepers were not reached. |
| Eel shock, anemone | `hazards.js` | **Only the octopus.** |
| Ink Jet | `main.js inkHurt` | Each system through its own function. This already worked for everyone. |
| Dash | each system | Enemies: `dashKillable` was a hard-coded flag per kind. NPCs: 2 dmg. Keeper: 1 x 0.5. Creatures: nothing. |
| Chest spike burst, trap rock (`loot.js`) | `loot.js` | **Only the octopus.** |
| Cannon shot, harpoon, claws, bites | each system | Only the octopus. This is still true; enemy infighting is queued and will change it. |

**Why the shopkeeper ignored spikes.** The shopkeepers are not in `enemies.js`. They are flat arrays in `shopkeeper.js`.
Spikes only looped over `enemyList` (`hazards.js spikeEnemies`), so a keeper could never be found by them. The boulder had
an extra injected callback (`bodyHit`) that added NPCs and keepers by hand. Spikes, jets, blocks, eels and anemones never
got one. It was not an explicit "skip the keeper" rule: the hazards had an implicit allow-list ("whatever is in the enemy
list"), and the keeper was never on it.

Other inconsistencies found:

1. **NPCs got angry at the world.** Any damage, even from a boulder that a crab set off, turned an NPC hostile and failed its
   encounter. The keeper already had a "quiet" rule for this case. NPCs did not.
2. **Bombs used four different rules.** A piranha anywhere inside the radius died, but Marlo half a radius away took 3 of his
   6 hp. The keeper took damage out to twice the radius. Only NPCs were shielded by rock.
3. **Boulders and blocks passed through creatures.** A clam or a tentacle under a boulder survived, and so did the keeper and
   NPCs under a falling block.
4. **Jets named kinds.** `'piranha'` and `'manta'` were hard-coded instead of "free swimmer". The crab, urchin and cannon were
   excluded by name in a comment.
5. **Kind checks repeated in many places.** `e.kind !== 'beholder'`, `e.immune` and `dashKillable` literals appeared across
   hazards.js, props.js and enemies.js. Separately, an urchin was not stunned by a blast while a cannon was. Both are bolted
   down, and no reason was written down.
6. **Boulders only noticed enemies.** A boulder dropped for a passing enemy (the `moving` flag), but never for a hostile NPC
   or an angry keeper.

## 2. The rules now

**Units.** hp and dmg are in ink units: one Ink Jet blob does 4. The octopus counts hearts, so each source also has its own
octopus outcome (`SOURCES[src].octo`).

**The rule** (`resolveHit`), in order:

1. The hit is **ignored** in any of these cases: the row is `invulnerable`; the source is in `row.immune`; the shell is shut
   and the source is in `row.shell`; or the source is `octoOnly` (a creature's own attack, which only reaches the octopus
   until infighting lands).
2. **dmg** = the source's dmg (or the caller's, for example an ink blob's own damage) x `row.resist[src]` (default 1).
3. **kill** happens when the row is `oneHitSplat` and the source is a body hit (`crush`: dash, falling block, boulder,
   spikes). The body is splatted whatever its hp, like a Spelunky spider. Otherwise it dies when dmg >= hp.
4. **knock** = `src.knock / row.mass`, or 0 for an anchored body (bolted to rock: stunned in place, never thrown). A walker
   (crab) is thrown sideways only.
5. **stun** (knock-out) = `src.stun x row.stunScale`, or 0 when the row has `immuneKnockout`.

**Blame and aggro, the same for the keeper and every NPC.** Any source may hurt them. Only a hit the octopus is to blame for
rouses them and angers the run (`byOcto`). Her own attacks (bomb, ink, dash) are always her fault. A boulder is her fault when
she set it off or her bomb released it. A body she knocked about stays her fault for 2 s (`BLAME_S`), so a keeper her bomb
throws onto spikes is her fault, but a keeper who charges onto spikes on his own is not. A shove with no damage (the outer
ring of a blast) is not a hurt and angers nobody.

**Impact hazards.** Spikes hurt a body that hits them: one moving at least `IMPACT_SPEED` (5 u/s), or one that is knocked out.
A crab walking by at 2 u/s or a piranha chasing at 4 is not hurt. An angry keeper charging at 6.4 u/s is. The octopus is the
exception and dies on any touch (the impale). Spikes, boulders, blocks, shocks and anemones hit each body once per landing
(`HAZARD_COOL`, boulders 1.5 s).

**Shared geometry.** Every hazard finds bodies through the entry: `blast` (bombs; rock still standing shields every family),
`circle` (boulders, traps), `each` (spike strips, eel rings, anemones, jets, falling blocks) and `push` (jets: a knocked-out
body is thrown, a free swimmer drifts, a walker or an anchored body stays put).

### The creature table

| Kind | Family | hp | Mass | Physics | Flags | Immune / resist |
|---|---|---|---|---|---|---|
| piranha | enemy | 6 | 1 | swim | oneHitSplat | - |
| crab | enemy | 10 | 1.2 | walk | oneHitSplat | - |
| manta | enemy | 16 | 1.5 | swim | oneHitSplat | - |
| cannon | enemy | 14 | 3 | anchored | - | - |
| urchin | enemy | 10 | 3 | anchored | immuneKnockout | ink, dash |
| horns | enemy | - | 9 | anchored | invulnerable | everything |
| beholder | enemy | - | 9 | none | invulnerable, boss | everything |
| eel | hazard | - | 9 | none | invulnerable | everything |
| gclam | creature | 18 | 9 | anchored | immuneKnockout, shell | shut: ink, dash, shock, anemone, projectiles |
| tentacle | creature | 14 | 9 | anchored | immuneKnockout, shell | same, while curled in its shell |
| marlo | npc | 6 | 1 | swim | - | - |
| pip | npc | 2 | 0.6 | swim | - | - |
| quill | npc | 4 | 1.2 | swim | - | - |
| host | npc | 5 | 1 | swim | - | - |
| keeper | keeper | 40 | 1.2 | swim | heavy, stunScale 0.6 | resist ink x0.08, dash x0.25 |
| octopus | octo | 3 hearts | 1 | swim | - | (see the octo column below) |

### The source table

| Source | dmg | Body hit (crush) | Knock | Stun | Default blame | To the octopus |
|---|---|---|---|---|---|---|
| bomb | 30 inside R, a shove out to 2R | - | 12 | 0.9 | octo | 1 heart |
| boulder | 20 | yes | 6 | 0.35 | cause | splat from above, else 1 heart |
| spikes | 20 (impact only) | yes | 6 | - | cause | impaled |
| block | 20 | yes | 3 | 0.35 | cause | 1 heart |
| jet | 0 (push) | - | - | - | none | push |
| ink | 4 | - | 0.5 | - | octo | (her own) |
| dash | 0 (Actions tuning: a bare dash only gives the octopus i-frames) | - | - | - | octo | (her own) |
| helmet (the Urchin Cap's ram) | 2 | yes | 1 | - | octo | (her own) |
| trap (chest burst) | 6 | - | 4 | - | cause | 1 heart |
| shock (eel) | 2 | - | 2 | 1.0 | none | 1 heart + 1 s limp |
| anemone | 2 | - | 3 | - | none | 1 heart |
| shot, harpoon, claw, bite, slam, snap, grab, beholder | octoOnly for now | | | | | 1, 2, 2, 1, 1 + stun, clam, eaten, death |

### What changed in play (each change follows from the table)

- **The keeper and the spikes:** spikes now hurt him (20 of his 40 hp) and throw him off. Two landings kill him. It is quiet
  unless the octopus is to blame.
- **The keeper and boulders:** 20 instead of 10. **The keeper and bombs:** 30 inside the radius instead of 26 falling off,
  and only a shove beyond the radius. Two close bombs still kill him.
- **Falling blocks** now crush keepers, NPCs, clams and tentacles too, not only enemies. **Boulders** now also crush clams and
  tentacles.
- **Bombs and NPCs:** the bomb now kills any NPC inside its radius, the same as a fish. Before, it did 6 falling off to 0.
  A sealed or caged NPC is still shielded, with 1 s of grace after being freed. Rock shields every family now, not only NPCs.
- **NPCs and blame:** an NPC hurt by something the octopus did not cause stays calm. Before, any hurt turned it hostile.
- **Jets** carry hostile NPCs and keepers like any free swimmer. Mass now scales the drift and the knock (a manta drifts 2/3
  as far as a piranha).
- **Eel shocks and anemones** reach every body: a knock-out where the table allows it, 2 dmg.
- **Boulders** drop for any roaming body (an angry keeper, a hostile NPC), not only enemies. A calm, still body does not set
  them off.
- **Chest spike bursts and trap rocks** hit nearby creatures too.

### Immunity reasons (also in the table's `why` fields)

- **Urchin:** it is all spines. An ink blob splats off it, and a dash into it hurts the octopus instead (Daniel Q7: a hazard
  to avoid, not to shoot). It has no behaviour to knock out; it only pulses.
- **Horns:** a spike growth of the rock itself, part of the wall. It only goes when its rock is bombed away.
- **Beholder:** the level's clock (Spelunky's ghost). Nothing stops it; it only says "leave now".
- **Eel:** a trap of its shaft (the journal files it as a hazard), like an arrow trap: the shaft is the danger.
  *Proposal:* make it killable by bombs and boulders once it has corpse art.
- **Giant clam and tentacle:** grown onto the rock, so they are never thrown and never knocked out. A shut shell stops ink,
  dashes, shocks, stings and shots. A bomb, a boulder or a block still breaks it.
- **Keeper:** super buff, like Spelunky's shopkeeper. Ink and dashes barely scratch him (x0.08, x0.25); bombs, boulders, blocks
  and spikes really hurt.

## 3. For the other owners

- **Add a creature:** add a row to `CREATURES`. Its system's `applyHit` must call `resolveHit(kind, src, dmg, shut)` and apply
  the outcome. Add a family adapter (`name, begin?, count, view(i, V), apply(i, src, fx, fy, dmg, knockScale, byOcto),
  push(i, ax, ay, mode), setTimers(i, coolUntil, blameUntil)`) and register it in main.js with `proxyFamily`. An unknown kind
  gets a plain one-hit swimmer row, so a new creature is never silently immune.
- **Add or retune a source:** edit `SOURCES`. A hazard finds bodies with `damage.each / circle / blast` and hits them with
  `damage.hitFound / hit`. It never checks a kind.
- **Actions tuning (done, 2026-10-08):** `SOURCES.dash` is `dmg 0, crush false`; the new `helmet` source (`dmg 2, crush
  true, knock 1`, the old dash) is what the Urchin Cap's ram deals. The contact checks in `enemies.update`, `npcs.step` and
  `stepKeepers` ask `strikes.js octoRams(octo)` (cap worn and at ram speed) and hit with `'helmet'` through each system's
  `applyHit`; during the dash i-frames (`octoPhasing`) a contact does nothing to either side. `dashKillable(kind)` now reads
  the `helmet` immunity (the urchin is immune to it, the keeper resists it x0.25). The Ink Jet is unchanged in the table
  (`ink`); it also breaks pots, clams and cages and kills the ambient fish (`ambient.js`), which are not creatures.
- **Time pressure (the Beholder):** its row is `invulnerable, boss`. Its touch goes through `octoHit(o, 'beholder', ...)`
  (a plain kill). If it should start hurting creatures it meets, drop `octoOnly` from `SOURCES.beholder` and call
  `damage.circle('beholder', x, y, r, false)` from its step.
- **Chain reactions and enemy infighting (queued):** drop `octoOnly` from `shot`, `harpoon`, `claw`, `bite`, `slam`, `snap`
  and `grab`, and route each attack through `damage.circle / hit` with the attacker's position. Blame stays 'none', so
  creatures fighting each other never anger a keeper. A corpse thrown by a blast could become a `block`-like source.
- **Test hooks:** `__octo.creatureRules()`, `__octo.resolveHit(kind, src)`, `__octo.damageHit(family, i, src, dmg, byOcto)`
  and `__octo.damageBodies()`.
