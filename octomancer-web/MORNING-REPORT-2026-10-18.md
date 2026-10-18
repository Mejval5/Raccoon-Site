# Morning report, 2026-10-18

Everything below is live at https://raccoon.website/octomancer/play/. Master passes 3846/3846 tests with the bot, and every `tests/*-cdp.js` passes (a few time out under machine load and pass alone). The last deploy succeeded.

## Shipped overnight

**Co-op, finished to spec**
- **Ghosts.** A dead player rises as a translucent ghost in their colour one second after dying. It floats through rock, can't be hurt or grab, and the camera ignores it. Blow (jet button) nudges enemies, pots, bombs and bodies in a cone. Freeze (use button): hold 2.5 s for a ring in your colour, release to freeze the nearest creature within 4 tiles for 3 s, then 10 s cooldown. Revive at the next level or on reaching the Still Grotto with 2 hearts; floating into the spring revives on the spot.
- **Polish.** The bottom-left line shows the scheme of the last player who pressed, with their colour dot; it retires per scheme, not for good. Hints over portals, wares, curtains and signs follow the player nearest them. Join is explicit: Start on a free pad, or A / Enter on the focused "Add player" line; A elsewhere is a menu press. Back rooms wait for the party ("Gather the party" on the curtain). The Carried page speaks pad to pad players. The first-join red flash is gone; boulders hit every octopus under them; a held octopus can't be grabbed twice.

**Night batch, all 8 items (from `IMPROVEMENTS.md`)**
1. **Sign boards** are drawn above the actors and placed so they never cover their target, any octopus or the HUD. On phones they rise over the rock on a long cord.
2. **Menus** restyled in the journal's parchment and sea-ink (no mint pills, no iOS switches). The phone death sheet no longer cuts the time. "Exit" is now "Leave the game", last, with a Yes/Stay question. The duplicate "Levels reached" row is gone.
3. **HUD strips** never wrap; the jar icon replaces "ink"; the shell count sits in the clock row in co-op; a heart loss pulses the strip; journal tab labels fit their tabs.
4. **Impact pass:** blast hit-stop (0.05 s point-blank, fading to nothing at 10 tiles), 9 px blast shake, 5 px hurt shake, a pale after-image on every kill, pickup pop, and pad rumble (off with screen shake off or reduced motion).
5. **Sound:** every beep is now a synthesized bubble, wood or water sound; a 24-voice limiter with per-sound cooldowns; menu ticks and knocks; effects duck on pause, music ducks on death. Pad-only players now unlock audio on their first button.
6. **Controls line** is one line under 110 characters on desktop; "Journal" replaces "Inventory"; stale key names in code are gone.
7. **Text pass** over all data files: signs under 160 characters and two sentences, "whirlpool" everywhere, no "treasure", "biome" or "loot", Title Case ware names, new death titles ("Snapped shut", "Held under").
8. **Painted cracks** on every breakable tile (tutorial floor and wall, pocket walls, the hub's bone wall), baked once per level.

## Decisions I made for you (change any)
- Back rooms take the whole party; they are never off in co-op.
- Freeze doesn't work on the giant clam, the tentacle or the Beholder.
- A freeze that finds nothing costs only the charge, not the cooldown.
- Primary buttons use the journal's parchment, not the darker sea-glass fill.
- Hit-stop stays on when screen shake is off; only reduced motion removes it.
- The controls line retires per scheme, counted across runs, so an old save gets the pad line back.
- Any connected pad can drive the pause menu; only Start or the Add line makes it join.
- On phones in co-op the hourglass is hidden to make room for the shell count.

## Please try on real hardware (headless Chrome can't)
- Pad deadzones (0.2 move, 0.3 aim) and the 32° auto-aim cone.
- Rumble strengths, and whether a real pad press unlocks audio in Chrome.
- Speaker levels of the new chime, hurt, dash and menu sounds.
- The 9 px blast shake and the blast freeze (a 10-bomb chain adds about 0.5 s of freeze).
- Two pads plus keyboard joining and leaving from the pause menu.

## Morning picks still open (`IMPROVEMENTS.md` 9–18)
9. Wire the silent events to sounds: clam snap, tentacle grab, bites, slams, cannon, harpoon, corpse landing, portal whoosh, push block.
11. Co-op: pausing with Esc while a pad plays, then joining a second pad, may bind P1 to the keyboard. The new join rule changed this path; verify.
12. Phones show no touch buttons until the first touch.
13. The world's outer frame reads as a UI border (flat cobble band and a black line).
14. Arriving at the Still Grotto, the octopus sits in the top-left ceiling notch.
15. Death to panel: accept a restart from 0.6 s, cap the dark hold at 1.2 s.
16. Co-op camera: no look-ahead, and the frame uses the target zoom while it eases. Also: "Gather the party" can sit off-screen past the zoom cap.
17. Particle draw does a save/restore per particle.
18. The bomb icon is still a glossy black ball with a yellow spark; repaint in Milan's line style.

Also still open from before: freezing a tentacle that holds a teammate; the carved-face pushable block still reads as a skull; per-player skins at the mirror; enemy scaling for 3–4 players; true split-screen as a Settings toggle.

## Flakes seen tonight
Load timeouts under parallel load in `entry`, `held`, `hub`, `journal`, `restart`, `timepressure`, `coop`; the phone 4x-CPU 50 ms task check in `entry-cdp`; the level-build p95 timing in the unit page. All pass when run alone. Run the cdp scripts one at a time.
