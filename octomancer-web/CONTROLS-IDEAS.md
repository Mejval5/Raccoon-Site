# Controls, movement set and actions (brainstorm, 2026-10-08)

Status: brainstorm only, no code. Daniel wants to talk before anything is built. Read with `BACKROOMS.md` (entry
needs an interact key), `SPELLS-IDEAS.md` (the spell button), V2-PLAN 15-16 and `VIBE-REVIEW.md` point 2 (the bomb).

What exists today (from `js/input.js`, `octopus.js`, `props.js`, `bomb.js`, `touch-ui.js`):
- Free 2D swim (WASD / arrows / stick), drag 2, idle sink 0.35 u/s^2, max 6 u/s, body rotates to the swim direction.
- Dash: impulse 20 along the facing, cooldown 0.6 s, wall recoil; dash presses are the "struggle" while a tentacle holds you.
- Ink Jet (left click at the cursor, J/K along the facing, touch auto-aim), Spell (right click, F/C), Bomb (middle click
  at the cursor, B/X along the swim direction, else a short toss forward and down), hotbar (wheel, Q/E, 1-9), inventory (Tab/I).
- Bombs are props: thrown at 9 u/s plus your own velocity, grace 0.35 s, then drag 5 in open water, restitution 0.5,
  roll drag 2.5, fuse 2.5 s, blast radius 2.5 that also hurts you. They stick to a ceiling only if thrown up hard.
- There is no interact verb at all. Everything is contact: shop wares are bought by swimming onto the pedestal, the relic is
  lifted by touch, Pip's cage breaks with a dash or a bomb, NPCs talk when you come near, a relic is handed to Quill by
  standing beside him. Nothing can be carried in a tentacle; `run.items` is a flat list of passives.
- Phones: a floating stick on the left half, a 2x2 block bottom right: Jet | Dash on the bottom row, Spell | Bomb above.

## 1. The verb set of an underwater octopus, against Spelunky's

| Spelunky verb | What it does there | Octomancer today | Gap |
|---|---|---|---|
| Walk / run | horizontal travel, momentum | swim (8 directions, drag) | none; swimming is walk + jump + climb in one |
| Jump | reach a ledge, dodge, the core timing skill | swim up, dash | none, but jumping's *commitment* is gone: you can always correct. The dash is the only committed move. Keep it precious. |
| Crouch | duck a shot, pick up, drop down through a platform | nothing | the pick-up anchor is missing. Underwater there is no "down" to press against: pressing S is just swimming down. |
| Whip | melee, breaks pots, the free attack | Ink Jet (ranged, cooldown, will get slower and rarer) | the jet is becoming a limited resource like Spelunky's *bombs*, not its whip. Something free and short must take the whip's role: the dash (no damage, invincible) half does, a **tentacle grab** would do the rest. |
| Bomb | carve, kill, the resource | bomb (floaty, bouncy, hurts you) | fit is poor (section 3) |
| Rope | vertical travel | not needed (you swim) | none. Its *resource* role is free for something else: a dropped jelly-lantern, a marker, nothing. |
| Use / interact (up, or the item button) | enter a door, buy, talk, open the back layer | contact only | **the big gap**: doors, back rooms, altars, talking on purpose, buying on purpose |
| Pick up / throw (crouch + button, throw with the same button) | carry pots, rocks, bombs, corpses, idols, people; throw them | nothing | **the second big gap**: carry is what makes the altar, the pots, the idols and "throw a corpse at the shopkeeper" possible |
| Climb / hang | ledges, ropes, vines | swim | none |

So the set an octopus needs is: **swim, dash, grab (pick up / throw / interact), jet, spell, bomb, hotbar.** Swimming
absorbs four of Spelunky's verbs; two are missing and both are "a hand". An octopus has eight. The design question is
only which button the hand goes on, and whether pick-up and interact are the same hand.

Ground rules I kept for every scheme below:
- One button does pick-up, carry-throw and interact, like Spelunky's single "use" button. Fewer buttons on phones,
  and the context (a door, a pot, an NPC, nothing) decides.
- No crouch. Pick-up is by **reach**: the thing nearest the octopus inside a tentacle's length (about 1.2 tiles) is
  the grab target, shown with a faint curl of tentacle toward it (the "I could grab that" tell).
- Carrying costs something, as in Spelunky: a carried thing is in front of you (it takes the hits meant for you only
  if it is a pot or a block; a corpse or an NPC does not shield), you cannot Ink Jet while carrying a heavy thing, and
  a dash with a heavy thing drops it.
- Throwing uses the aim already used for bombs: at the cursor with the mouse, along the stick / move keys otherwise,
  a short toss forward if idle. Throw speed by weight: pot and rock 9 u/s, corpse 7, block and body 5. Thrown things
  hurt what they hit (1 heart to an enemy, breaks a pot) the Spelunky way, so a corpse is also ammunition.

## 2. Three complete control schemes

### Scheme A: "The eighth tentacle" (add one button, change nothing else)

Desktop: WASD/arrows swim; **E = grab / use** (mouse button 4 as well, where it exists); Shift/Space dash; left click
Ink Jet; right click spell; middle click bomb; Tab/I inventory; J/K, F/C, B/X stay as fallbacks. One conflict: **E is
the hotbar's "next"**. Move hotbar cycling to Q/R (the wheel and 1-9 stay) and give E to the hand.

How pick-up works: tap E near a grabbable thing to pick it up (it snaps to a point 0.6 tiles ahead of the beak, rotates
with you). Tap E again to throw (aim as bombs do). Hold E 0.3 s to drop it gently instead (the altar wants gently).
Near a door with nothing in hand: E enters. Near an NPC with nothing in hand: E talks (opens the next line of the
bubble, or hands over the relic). Near a pedestal: E buys. The priority when several things are in reach: door > NPC >
pot/corpse/rock > nothing.

What it costs: one more key for the desktop player (seven actions plus hotbar); the hotbar loses E. On phones a **fifth
button** or a context swap (see phone layout). It changes nothing that works today.

Phone: the 2x2 block becomes a 2x3 or the Grab button *replaces Spell when a grab target is in reach* (the Spell button
morphs: icon and label change to a tentacle curl; while carrying it reads "Throw"). I prefer the morph: four buttons
stay four. Risk: a spell cast you wanted turns into a grab because a pot drifted close. Mitigation: the morph only
happens for pots, corpses, doors and NPCs when the octopus is nearly still (speed < 1.5 u/s); at speed the button
stays Spell.

### Scheme B: "Dash is the hand" (merge grab into dash, no new button)

Desktop: WASD swim; **Space/Shift = dash, and a dash *into* a grabbable thing grabs it** (the dash already does no
damage and gives invincibility in the new tuning, so a dash that ends on a pot, corpse or block clamps onto it instead
of bouncing). While carrying, **the dash button throws** (a dash forward and the thing leaves your tentacles at the end
of it, 9 u/s plus your speed). **E = use** only (doors, talk, buy, drop gently): a pure interact key, no pick-up on it.
Hotbar moves to Q/R and the wheel.

How pick-up works without crouch: nothing to learn; "dash at it" is already how you break the cage and knock wares off.
A dash that passes *through* a thing (speed > 8, the old dash-kill threshold) does not grab, so the fast dodge dash stays
a dodge; a dash that *ends* within reach of it (the drag has slowed you below 4 u/s) grabs. In practice: a short dash
toward a pot = pick it up; a long dash = fly past.

What it costs: the dash loses its purity. A dash to escape a piranha that happens to end on a corpse leaves you holding
a corpse and unable to jet. The invincibility window and the grab overlap in a confusing way. And "throw = dash" means
you cannot throw without moving. Phone: no new button at all (Dash is grab/throw, and E becomes a small "Use" prompt
that appears over the door / NPC itself, tapped in place, as mobile games do).

### Scheme C: "Hold to hold" (one hand button, hold-to-carry, tap-to-use; bombs are carried things)

Desktop: WASD swim; Shift/Space dash; left click Ink Jet; right click spell; **E (and mouse 4) = hand**; **the bomb is
no longer its own action: B/X or middle click *draws* a bomb into the hand** (it is a lit, carried thing: fuse starts
on draw, Spelunky-style), and the hand button throws or drops it. Hotbar Q/R, wheel, 1-9; Tab/I inventory.

How pick-up works: **hold** E to keep a thing in your tentacles; **release** to let go where you are (it drops, sinks).
**Tap** E while nothing is held = use (door, talk, buy). **Tap E while holding = throw** ... that conflicts with
release-to-drop, so: holding E keeps it; pressing the *throw* input (left click / J-K, the jet button, which cannot fire
while carrying anyway) throws it at the cursor / along the facing. So: hold E = carry, release E = drop, click = throw.
Auto-grab variant: swimming into a pot or corpse with E held grabs it, so a player can "sweep" through a room collecting.

What it costs: holding a key while swimming on a keyboard is fine (Shift was held for run in Spelunky); on phones
"hold a button while steering with the stick" is the worst pattern we have, and it burns the thumb that wanted to dash.
It also folds the bomb into the hand, which is good for feel (you see the fuse burning in your tentacles, you can
*drop* it, Spelunky's most-used bomb move) but it is the biggest code change. Phone: Grab button replaces Bomb in the
block (Bomb moves to the hotbar as a slot you pick, then the Grab button draws it). Four buttons: Jet | Dash, Spell |
Grab. Holding Grab = carry; tap = use / throw.

### Scheme summary

| | A: eighth tentacle | B: dash is the hand | C: hold to hold |
|---|---|---|---|
| New desktop keys | E (hotbar to Q/R) | E as use only | E (hold), bomb moves into the hand |
| Pick-up gesture | tap E near it | short dash into it | hold E (or sweep with E held) |
| Throw | tap E again | dash button | jet button while carrying |
| Drop gently | hold E | tap E (use) | release E |
| Phone buttons | 4, Spell morphs to Grab/Throw in reach | 4, Use prompt over the object | 4, Grab replaces Bomb |
| Code cost | M (carry system + input + touch morph) | M (carry + dash state machine) | L (carry + bombs reworked into carry) |
| Risk | morph mis-taps on phones | dash gets muddy | hold-on-phone fatigue |

## 3. Bombs redesigned

Why the current bomb fails: it is light (sink 3 vs the 16 of a rock), bouncy (restitution 0.5, highest of all props), has
a long fuse (2.5 s) and a big self-hurting blast (2.5 tiles). Thrown at the floor it bounces back up toward you and
rolls off the ledge; dropped idle it drifts 1.3 tiles before going off, and in the tutorial's vertical bomb floor and on
1-2 (the sealed vault channels and Marlo's rock need a bomb *on a wall*) the only reliable placement is to hover over the
spot and hope. Spelunky's rules that make bombs work: short fuse (about 2.6 s but the bomb *stays where it lands*), a
bomb that rests, a blast that is honest, and a cheap way to put it exactly where you stand (drop) as well as throw it.

Four alternatives, any two can coexist as different items:

**3.1 Urchin mine (sticky).** Thrown like today, but it *clings to the first surface it touches* (rock, a block, an
enemy, a corpse, the shopkeeper) and then counts a 1.5 s fuse. No bounce, no roll. Thrown into open water it drifts
slowly until it meets something, fuse paused until it sticks (cap 4 s, then it fizzles). Makes 1-2 completable
because "throw at the wall" always puts the blast on the wall. It is the most octopus-y (a spiny thing, Milan can paint
it), and sticking to a crab is a Spelunky "sticky bomb" moment. Cost: S (a prop state PS_HELD on contact already exists
for clams on walls).

**3.2 Dropped weight (sink-straight-down).** Not thrown at all. B drops it under you; it is heavy (sink like a rock,
16 u/s^2, drag 1.45, restitution 0.1) so it lands on the floor beneath you within half a second and sits still; fuse
2 s. For walls you throw it with the hand (scheme A/C) or dash-push it. Makes 1-2 completable because the tutorial's
floor is bombed by floating over it and pressing B, every time. Cost: S (numbers in props.js plus an `IDLE_TOSS` of 0).
Weakest for side walls unless combined with carry.

**3.3 Short-fuse snap-shell.** Keep the throw, cut the fuse to 1.2 s, cut restitution to 0.1 and the sink to the rock's,
blast radius 2.0. It goes off roughly where it first lands. The least new behaviour, no new tells; it is the Vibe
review's own fix pushed further. Makes 1-2 completable in most cases but a bomb that lands on a slope still creeps.
Cost: XS.

**3.4 Tentacle-placed charge.** With the hand button near a wall you *plant* a charge on the wall tile you are touching
(the octopus hugs the wall for 0.4 s, the charge is drawn in the rock face), fuse 1.5 s, then you swim off. No throw,
no physics at all; a planted charge cannot miss. Spelunky's "bomb the wall next to you" at its most deliberate. It needs
the interact verb (section 2), which is the argument for doing controls first. Makes 1-2 trivially completable. Cost:
S once the hand exists.

**3.5 (bonus) Bomb in the hand.** Scheme C: draw a bomb into the tentacles, the fuse runs, drop it (release) exactly
where you are, or throw it. This is Spelunky's actual model and the one players already know. Combine with 3.1 or 3.3
for the thrown case.

Recommendation: **3.2 drop as the default B press, plus 3.1 sticky when thrown with an aim** (middle click / stick
held): one item, two behaviours by how you press, both honest. Then 3.4 for free once the hand exists. Fuse 1.6 s, blast
2.0 drawn at true radius, restitution 0.1, no roll. Chain reactions (blasts set off other mines) stay on the list.

## 4. The offering altar: corpse-carry or juice?

**Juice offering.** Swim to the altar, press use, pay one cast of juice (or a shell tier), get a boon. Pros: works with
no carry system, fits the economy that already exists, an altar on every level is cheap. Cons: it is a shop with a
different coat of paint. No physical comedy, no "I dragged this crab across the level for you". Spelunky's Kali works
because you *carry* the sacrifice, and the thing you carry can be a live shopkeeper.

**Corpse carry.** Pick up a corpse (every creature and NPC already leaves a physics corpse, `corpses.js`), carry it
(slower, no jet), drop it on the altar's slab. The altar glows, pulls the body under, and pays by what it ate: piranha
1 favour, crab 2, a stunned live enemy 3 (Spelunky's live-sacrifice bonus), an NPC 5 and a bad-luck curse for the
rest of the dive, the shopkeeper 8. Favours: 1 = heal a heart, 2 = +1 bomb, 3 = a cast of juice and a rune, 5 = an
item from the altar's shelf (Spelunky's Kapala moment: the Siphon Shell could live here instead of on the floor).

**Recommendation: corpse carry**, and accept juice as a *second* input ("pour the jar on the altar" for a small
favour) only if Daniel wants an altar on levels before the carry exists. The altar is the single best reason to build
carry at all; without it carry is only pots. With carry: the altar also takes pots (nothing), the relic (Quill is
furious), a live Pip (dark), and a lit bomb (it explodes, the altar is angry; Spelunky does this too).

Where: one altar per zone at most, in a back room (`BACKROOMS.md` version A's grotto is the natural place), or as a
set piece on 1-2 or 1-3. Shape: a stone slab with a mouth, bioluminescent veins that brighten per offering. Natural
fantasy rule: no gold, no sparkles; the "accepted" tell is the veins pulsing and the water above the slab clouding.

## 5. Back-room entry: the interact key, door tells, overlay

- **Key:** the hand/use button (E on desktop, the morphed button or an in-world prompt on phones). Pressing it with
  nothing in hand while inside the door's trigger box (about 1x1.5 tiles in front of the door) starts the hop. Swimming
  *up* into the door as an alternative (Spelunky's up-to-enter)? No: up is just swimming here, and a player will enter
  doors by accident. E only, and a 0.2 s hold on phones to avoid mis-taps.
- **Door tells:** always readable in the front layer. A kelp curtain in a niche with bubbles leaking (grotto), a dark
  hull hatch with a loose plank swinging (wreck), a pale veined slab only visible with goggles (vault). When the
  octopus is in the trigger box, the tentacle curl tell points at it and a small glyph (the use key's icon) fades in
  over the door, not in the HUD. Spelunky shows nothing, but Spelunky has one input for doors everywhere; our player
  needs the glyph the first few times. It can retire like the controls line.
- **Overlay, as Daniel wants it:** the back room is drawn *over* the level as a layer, not in an annex row-band below
  (`BACKROOMS.md` 4.1 proposed an annex under the bedrock; Daniel prefers an overlaid layer). Concretely: the back
  room's tiles are a small separate grid (10x16 or 20x16) with its own bake, drawn full-screen over a darkened,
  blurred copy of the front layer (the front stays frozen in place behind it, so the player feels it is "right behind
  the wall"). The camera clamps to the small grid. Entities carry a layer byte; `update` skips the other layer. The hop
  is a 150 ms fade, a camera snap and a layer switch, no generation. Returning fades the overlay out and the front
  layer resumes. Memory: one extra small grid and two or three baked bands, well under 1 MB.
- **What the key does elsewhere, so it feels like one verb:** talk (advance a bubble, accept Marlo's thanks, hand
  Quill the relic on purpose instead of by proximity), buy at a pedestal (instead of swim-onto; this also fixes
  accidental purchases when fleeing through a stall), open the chest (clam) you are beside (instead of a dash), ring
  the pool's pedestal, plant a charge (3.4), offer at the altar. Every contact-triggered interaction today becomes an
  E press; dash keeps its physical effects (knocking wares off, breaking the cage).

## 6. Recommendation

**Scheme A ("the eighth tentacle"), with bombs 3.2 + 3.1 and the altar on corpse carry.**

Why A: it is the only scheme that adds the two missing verbs with one key and leaves every current control exactly
where Daniel's hands already are (left/right/middle click, Shift/Space, B). B muddies the dash just as the dash is
being made the clean invincible dodge; C is the best feel on desktop but hold-to-carry is wrong for the stick-plus-
buttons phone layout, and it reworks bombs at the same time as controls. A keeps the phone at four buttons through the
Spell-to-Grab morph, and if the morph proves confusing in testing the fallback is a fifth small button, which is still
fine on a phone in landscape. The hotbar moving from Q/E to Q/R (plus wheel and 1-9) is the only thing a current player
has to relearn, and few use Q/E.

Order of building (each its own owner, after the talk): (1) the carry system and the hand key (pots, corpses, rocks,
blocks; throw; the tell), (2) bombs 3.2 + 3.1, with the tutorial text updated, (3) the use verb on doors, NPCs, pedestals
and chests, (4) the altar, (5) back rooms as the overlay. (1) and (2) are independent and can run in parallel.

### Questions for Daniel (default in bold)

1. One button for pick-up, throw and interact, or interact separate from pick-up? **One button (E), context decides;**
   door > NPC > thing.
2. Which scheme? **A.** B only if you want zero new buttons; C only if the "bomb in the tentacles" feel matters more
   than the phone.
3. Hotbar keys: move Q/E to Q/R to free E, or put the hand on F and the spell on R? **Q/R for the hotbar, E is the
   hand, F stays the spell fallback.** (If you'd rather keep E for the hotbar: hand = F, spell = C/R.)
4. Phones: morph the Spell button into Grab when something is in reach, or add a fifth button? **Morph, only when
   nearly still;** fifth button as the fallback after testing.
5. Bombs: drop-under-you by default and sticky when aimed (3.2 + 3.1), or just the short-fuse heavy tweak (3.3)?
   **3.2 + 3.1.** 3.3 is the one-hour fallback if you want level 2 fixed before the controls land.
6. Does a carried pot or block shield you from a hit? **Yes (it breaks instead), corpses and NPCs do not.**
7. Can you carry a live stunned enemy or NPC (Spelunky's live sacrifice), or only corpses? **Yes, while stunned;**
   it wriggles free when the stun ends.
8. Altar: corpse carry, juice, or both? **Corpse carry;** juice pour as a small second input only if you want altars
   before carry exists.
9. Back-room entry: E only, or also swim-up into the door? **E only,** with a fading glyph over the door.
10. Should buying and relic hand-over move from contact to E as well? **Yes,** so a fleeing octopus never buys by
    accident and Quill's hand-over is deliberate; a dash still knocks wares off.
11. Ink Jet while carrying: blocked, or allowed with light things (pot, rock)? **Blocked while carrying anything;** the
    trade-off is the point.
12. Tentacle grab as a spell (SPELLS-IDEAS) and the hand as a control: are they the same thing? **No:** the hand is free
    and short (1.2 tiles); a Tentacle Grab spell pulls from range and costs juice.
