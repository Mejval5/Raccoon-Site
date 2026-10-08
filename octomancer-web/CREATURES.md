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
| Cannon shot, harpoon, claws, bites | each system | Only the octopus. Enemy infighting (section 4) changed this: projectiles hit anything, plus a few deliberate rules. |

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
| shot | 6 | - | 3 | 0.4 | cause (projectile) | 1 heart |
| harpoon | 8 | - | 6 | 0.4 | cause (projectile) | 2 hearts, heavy knock |
| thrown (bomb, pot, clam, relic, find at 6+ u/s) | 4 | - | 3 | 0.6 | cause (projectile; her bomb: octo) | - |
| claw (keeper) | 8 | - | 6 | - | none | 2 hearts |
| bite (piranha frenzy) | 4 | - | 2 | - | none | 1 heart |
| snap (giant clam) | 30 | yes | - | - | none | clam (styled kill) |
| grab (tentacle) | 20 | yes | - | - | none | eaten (styled kill) |
| slam, beholder | octoOnly | | | | | 1 heart + stun, death |

Since infighting (section 4) only the manta's dive slam and the Beholder are `octoOnly`; the others reach creatures, but only
through the INFIGHT rules. The anemone is a `touch` source: it never hurts a `touch` row (see section 4).

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
- **Eel shocks and anemones** reach every body: a knock-out where the table allows it, 2 dmg. (Since infighting the anemone no
  longer stings touch enemies: section 4.)
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
- **Chain reactions (queued):** a corpse thrown by a blast could become a `block`-like source. Enemy infighting is done:
  see section 4.
- **Test hooks:** `__octo.creatureRules()`, `__octo.resolveHit(kind, src)`, `__octo.damageHit(family, i, src, dmg, byOcto)`
  and `__octo.damageBodies()`.

## 4. Enemy infighting, Spelunky style (2026-10-08)

Daniel: "enemy infighting - yes, but Spelunky style: mostly they should ignore each other, aside from a few interactions that
make sense (e.g. projectiles just hit anything, but touch enemies don't hurt other touch enemies generally)."

Code: the rules are data at the end of `creature-rules.js` (`INFIGHT`, `infightReach`, `INFIGHT_KILL`, `FRENZY_R`, `FRESH_S`,
`CORPSE_BITES`, `THROWN_SPEED`). The runtime is `js/infight.js` (`createInfight(damage, {corpses, props})`), the one place a
system asks "is there something for me to hit or hunt". It works through the shared damage entry, so immunities, shells, blame
and aggro stay the creature table's. `damage.js` gained `pick` / `hitPicked` / `locate` and two view fields: `id` (enemy
records keep their own id; creatures `-1 - i`, NPCs `-100 - i`, keepers `-200 - i`, fresh corpses `-1000 - i`) and `wound`
(hp below full). main.js creates one runtime, hands it to enemies, creatures, NPCs and `stepKeepers`, steps
`infight.tick` / `stepThrown` and drains `infight.events` for the particles.

**The default: creatures ignore each other.** No code checks creature-against-creature contact. A piranha that swims into a
crab, an urchin or horns is only pushed apart (`separateEnemies`), never hurt. The one hazard that was a touch attacker, the
anemone, is now a `touch` source: it never hurts a `touch` row (piranha, crab, manta, urchin, horns, giant clam, tentacle). It
still stings the keeper, the NPCs and the octopus. Spikes, boulders, blocks, bombs, jets and eel shocks are hazards, not touch
enemies, and keep hitting everyone as in section 2.

**The exceptions: the INFIGHT table.** It holds five rules and nothing else.

| Rule | Attacker | Source | Reaches | What happens |
|---|---|---|---|---|
| projectile | whoever fired it | shot, harpoon, thrown, ink | any body but the shooter | A cannon shot, Marlo's harpoon, a thrown bomb or pot, and an ink blob fly until they hit something. The first body they touch takes the hit, by the table. A spike or a shut shell just stops it. |
| frenzy | piranha | bite | prey: bleeding (hp below full), knocked out, or a fresh corpse (< 8 s) | A patrolling piranha smells blood within 6 tiles (with a clear line), winds up (0.24 s, shorter than for the octopus) and lunges. Its nose bites prey only. Three bites strip a fresh corpse. One hurt fish draws the school. |
| snap | giant clam | snap | anything in the open mouth | A creature swimming into the open mouth sets the snap off at once (the tremble still telegraphs it). The lid crushes everything in the mouth (30, a body hit). |
| grab | tentacle | grab | free bodies (swim or walk, not invulnerable) that move | With the octopus out of reach, a tentacle wakes for a moving creature within 4.5 tiles (on screen, clear line), reaches, strikes and crushes what its tip meets (20, a body hit), then pulls back in (3 s). The octopus always comes first. A calm NPC standing at its post is not prey. |
| claw | shopkeeper | claw | anything in the way | An angry keeper's claws fly at the octopus and hit any other body they meet on the way, then reel back. |

There are no manta shots. The manta has no projectile in the port; its dive slam stays `octoOnly`. The Ink Jet already hit
every family through its own targets. It is listed under `projectile` for completeness.

**Blame.** Projectile sources (`shot`, `harpoon`, `thrown`) have blame `cause`. A hit is her fault only when the projectile says
so: a shot record's `oc` flag (0 today; a future reflect spell sets it), a thrown bomb (she threw it), or the knocked-about
timer from section 2. `claw`, `bite`, `snap` and `grab` have blame `none`. An enemy's attack on Marlo or the keeper hurts him
quietly and never turns him on her. A kill by an infighting attack is not hers. Its death event carries the reason (`bite`,
`shot`, `claw`, `snap`, `grab`, `harpoon`), and main.js gives no score, no dive kill and no journal kill for it. The corpse and
its juice still drop.

**The target override hook (for a future Lure spell).** `infight.setLure(x, y, r = 10, ttl = Infinity)` puts a point of
interest in the water and returns its slot (up to 4 at once; -1 when full). `moveLure(slot, x, y)` moves it, and
`clearLure(slot)` / `clearLure()` removes one or all. A new level clears them. `lureAt(x, y)` fills `lurePoint` with the
nearest lure that covers a point. Who follows it:

- A **patrolling piranha** within r swims to it (A* when the line is blocked) and hovers there instead of its beat.
- A **crab** with the lure about its level (within 3 tiles up or down) walks its ledge toward it and waits under it. Walls and
  ledges still turn it.
- A **manta's** glide line drifts to the lure.
- A **hostile NPC that cannot see the octopus** (Marlo out of sight, Pip / Quill / the host with rock between) swims to it.
- Not the keeper, the clam, the tentacle, the cannon or the static spikes. A creature that sees the octopus still goes for
  her, so a lure draws the patrolling and the lost.

Test hooks: `__octo.setLure(x, y, r, ttl)`, `__octo.clearLure(slot)`, `__octo.lures()`, `__octo.infight()` ({hits, drained}).
`__octo.damageBodies()` also lists `id`, `wound` and `stun` now.

Tests: `tests/infight.test.js` (on the test page) covers the table, projectiles against every creature kind and shell state
(60 cells) plus the real flights (a cannon shot, a harpoon, a keeper's claw, a thrown bomb), no touch damage among seven touch
enemies, an anemone and a clam, the frenzy (a wounded piranha, a knocked-out crab, a fresh and an old corpse), the clam's snap,
the tentacle's grab, blame, and the lure. `node tests/infight-cdp.js <baseUrl> [shotDir]` runs the same in the game and
captures frame sequences of a frenzy and of a cannon shot hitting a creature (desktop and 412x915).

**For the other owners.** A new attack that should reach creatures gets a row in `INFIGHT`, not an ad hoc check. A new
projectile calls `infight.projectile(src, x, y, r, shooterId)` from its flight. A Lure spell calls `setLure` / `moveLure` /
`clearLure`. **Chain reactions:** thrown corpses and impacts that set things off belong to you. A body flung by a blast that
should hit what it lands on can reuse the `thrown` source, or get its own `SOURCES` row.

## 5. Chain reactions (2026-10-08)

Daniel: "chain reactions - oh yeah!" Spelunky style: blasts and impacts set off other things. A source does not only damage
bodies (section 2); it can also **set off** things. That is a second table next to `SOURCES` in `creature-rules.js`:

- `TRIGGER_TARGETS`: what can be set off, and what that does.
- `TRIGGERS`: per source, which targets it sets off and how far (tiles), and the delay range of a link. `idle` is the set a
  spontaneous event uses (a clam snapping at the octopus, an eel's own periodic shock): only bombs, so a periodic creature never
  keeps its neighbours ticking.

| Source (what went off) | Sets off (reach in tiles) | Delay |
|---|---|---|
| bomb (a blast) | bomb R (its radius, `BOMB_RADIUS`), rock, clam, tentacle, eel, pot, jet 2R (the shove ring), tile, trap 1.6R | 0.12-0.26 s |
| boulder (its impact: the first hard stop of a drop) | bomb 1.3, clam 2.2, pot 1.3, tile 1.3, trap 1.3, rock 4.5 (the shake) | 0.10-0.24 s |
| snap (a giant clam) | clam 3, pot 1.6, bomb 1.6; spontaneous: bomb only | 0.14-0.28 s |
| shock (an eel) | eel 4, bomb 3, clam 2.5; spontaneous: bomb only | 0.10-0.22 s |
| thrown (a flung prop hitting a creature, section 4's `thrown` source) | clam 1.2, pot 1.0 (never a bomb: a thrown bomb would set itself off) | 0.10-0.16 s |

| Target | What going off means | Adapter |
|---|---|---|
| bomb | the fuse is cut, it explodes this step; its blast joins the chain | `bombs.chainTarget()` / `bombs.trigger(id, ctx)` |
| rock | a hanging boulder rumbles 0.2 s and drops; its impact joins the chain | `hazards.chainTargets()[0]` |
| eel | it crackles 0.12 s and shocks; the shock joins the chain | `hazards.chainTargets()[1]` |
| jet | it surges 0.8 s (up to 3.2x push), throwing what is in its stream | `hazards.chainTargets()[2]` |
| clam | a giant clam snaps (an open one still catches the octopus in its mouth; a shut one clacks); the snap joins the chain | `creatures.chainTargets()[0]` |
| tentacle | a dormant one wakes and uncoils (and strikes if she is there) | `creatures.chainTargets()[1]` |
| pot | a pot or a loot clam bursts (how 'chain') | `loot.chainTargets()[0]` |
| trap | a trapped chest's trap springs (spike burst through the damage entry, or the swarm); the chest stays shut and safe | `loot.chainTargets()[1]` |
| tile | a fragile tile (`MAT_BOULDER_BREAKS`: bone, timber; new breakable materials join by adding themselves there) shatters | main.js |

**The queue** is `js/chain.js` (`createChain()`): `emit(src, x, y, parent, byOcto, self)` finds the targets through the
adapters and queues one link per target, each due after its delay (nearer = sooner); `step(dt)` fires the due links. Rules:

- **Readable:** every link waits 0.1-0.3 s. While it waits a glowing mote runs from the source to the target along a shallow
  arc and a ring closes on the target; when it fires a ring opens there and a short knock plays (pitch rises with the
  generation). `js/chain-draw.js`, `sfx.chainTick(depth)`.
- **Capped:** at most 24 links per chain, 8 generations, 48 pending links, and 6 links fire per fixed step (the rest wait a
  step). A target goes off at most once per chain (a visited set), so a chain can never loop.
- **Off-screen rule:** a chain that started off screen never sets off anything off screen (`cull.js inCameraView`, 0.5 tile
  margin). A chain started on screen may run on past the edge.
- **Blame:** a chain keeps the blame of what started it (her bomb: hers; a boulder a crab set off: nobody's). A boulder it shakes
  loose carries it, so a keeper it lands on is angered only when she started it.
- **Hooks for other owners:** a new target kind = a row in `TRIGGER_TARGETS`, a reach in the `TRIGGERS` rows and an adapter
  `{ name, each(x, y, r, cb), fire(i, ctx) }` registered in main.js (a proxy, like the damage families). A new source (the hand
  owner's drop bomb or urchin mine, a thrown corpse) = a `TRIGGERS` row and one `chain.emit(src, x, y, parentCtx)` where it goes
  off. The bombs adapter reads `bombs.list()` and `b.id`, so any bomb in that list chains.
- **Test hooks:** `__octo.chain()`, `__octo.chainInfo(id)`, `__octo.chainEmit(src, x, y)`, `__octo.bombAt(x, y, fuse, loose)`,
  `__octo.bombs()`, `__octo.addHazard(name, x, y, dx, dy)`, `__octo.addLoot(name, x, y, trap)`. Tests: `tests/chain.test.js`
  (on the test page), `node tests/chain-cdp.js <baseUrl> [shotDir] [w] [h]`.

What changed in play: a bomb no longer drops every hanging boulder in its reach at once (`hazards.blast`, no longer called by
main.js); each one rumbles and drops as a link. A boulder whose ceiling a bomb removed still falls at once.
