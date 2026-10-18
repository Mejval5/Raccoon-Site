# Local co-op, up to 4 players: plan (2026-10-17)

Daniel's brief: any plugged-in controller can play solo. Players are added and removed in the pause menu, up to 4, on pads or the keyboard. Joining mid-level is allowed; a player who leaves and comes back gets their state restored (alive with their hearts, or back as a ghost if they died). Dead players become Spelunky-style ghosts: a soft push blow and a slow, long-charge freeze. Each player has a colour from a 4-colour palette now and a skin later. Easier to join than Spelunky.

## Decisions made (change any)

1. **Camera: shared, Spelunky style, first.** One camera frames every live player, zooming out as they spread (cap about 1.6x the solo view). Past the cap the camera follows the leader (the player nearest the exit or, in the hub, the last one who moved) and the others are off-screen until they catch up. True split-screen (2 halves / 4 quadrants) is phase 3, as a Settings toggle: it multiplies the draw cost and the game must run on weak machines.
2. **One device = one player.** Keyboard+mouse count as one device. Pad identity is `gamepad.id + index`; the keyboard is `'keyboard'`. Solo: whichever device moves first drives player 1; the other pad is idle until someone joins. In solo play the game behaves exactly as today.
3. **Joining:** Pause → "Add player: press A on a pad or Enter on the keyboard". The device that presses claims the next free slot. The new player spawns beside a live player with base stats (3 hearts, 3 bombs, full jar, Ink Jet + Ink Cloud, bombs in slot 1). No popup in the world: the pause menu is already a menu.
4. **Leaving:** pause menu → player row → Remove (or the device unplugs: that removes the player and pauses). The run keeps a record per device: hearts, juice, bombs, hotbar, items, alive/ghost, and the colour. Re-adding the same device within the run restores it. A different device re-added gets a fresh player.
5. **Death:** a dead player becomes a ghost at once (no corpse-carry wait). The ghost floats through everything, cannot be hurt, cannot pick up or buy. Blow (jet button): a soft push on creatures, bodies, bombs and items in a short cone. Freeze (use button, held about 2.5 s to charge, with a visible charge ring): the nearest creature in reach freezes for about 3 s. The ghost's cooldown on freeze is about 10 s.
6. **Revive:** every live player entering the next level revives the ghosts at the start, with 2 hearts. Zone-end rest grotto revives too. No coffins for now.
7. **Game over:** when every player is a ghost. Then the death screen as today, naming the last cause.
8. **Exit:** when one player is in the whirlpool and presses the hand, a 3-second pull starts: the other live players are drawn to the whirlpool from anywhere on the level (a current, Spelunky's "the others are pulled along"). Ghosts come along for free.
9. **Shared things:** the run timer, the Beholder clock, shopkeeper anger, quests, journal stats (credited to whoever did it), and the score. Per player: hearts, juice, bombs, hotbar, items, skin.
10. **No enemy scaling for the demo.** Four octopi are stronger than one; the Beholder clock and shared anger are the only pressure. Revisit after play.
11. **Colours:** P1 keeps today's red; P2 teal, P3 ochre, P4 violet, from Milan's palette, applied through the skins tint path (`skin-draw.js wornColors`). The mirror picks a skin per player later.
12. **HUD:** one compact strip per player along the top, in the player's colour: hotbar + hearts/juice/bombs, scaled down when 3 or 4 play. The solo layout is unchanged. The bottom-left controls line shows the scheme of the player who last pressed something, with their colour dot.
13. **Mouse:** belongs to the keyboard player only. A pad player aims with the stick.
14. **Tutorial and hub:** goals count any player. The hub village stays a safe zone for all.

## Holes closed by Daniel (2026-10-17)

- **Friendly fire:** bombs and thrown things hurt teammates; the Ink Jet and spells do not.
- **Rest grotto:** refills everyone fully.
- **"The octopus"** for NPC lines, quests and the altar: whoever triggers it; altar favour is shared.
- **Mouse:** keyboard+mouse is one player. The mouse and Esc still work for menus (pause, settings, journal) even when no keyboard player has joined.
- **Camera:** no split screen for now (rendering cost). Shared camera, zoom out up to 1.6x, then follow the main player.

## Phases

**Phase 1: roster and sim (one Opus owner).** The playable co-op demo.
- `js/players.js`: roster of up to 4, device binding, per-device run records, colours, join/leave/restore.
- Sim: `octo` becomes `players[i].octo`; everything that reads the single octopus (hand, inkjet, spells, bombs, hazards, infight lure, camera, journal credit, tutorial goals, portals, shop, altar, back rooms) is made per-player or picks the right player. The solo path must stay bit-identical for the bot and the existing tests.
- Input: `input.js` and `gamepad.js` produce one snapshot per device; a device not bound to a player is ignored in play but can join in the pause menu.
- Camera: shared frame + zoom cap + leader rule (decision 1).
- Pause menu: player rows (colour, device glyph, hearts or "ghost"), Add player, Remove. Pad and keyboard navigable (menu-nav.js).
- HUD strips per player; octopus tint per player; the exit pull.
- Game over when all are dead. Death is a plain "limp and wait" until phase 2 brings ghosts: a dead player's octopus ragdolls and they are out until the next level, where they revive.
- Tests: `tests/coop.test.js` for roster/restore logic; `tests/coop-cdp.js` with two stubbed pads plus keyboard: join in pause, both move, one dies, next level revives, leave and re-add restores hearts.

**Phase 2: ghosts (one owner, after phase 1). Built 2026-10-17, see OWNERS.md.** Ghost float, blow, charged freeze, the charge ring, revive at next level, ghost does not count for the camera. Art: a translucent pale octopus with the player's colour in the eyes, drawn in code from the existing sprite (tint + alpha), no new images.

**Phase 3: options.** True split-screen toggle, per-player skins at the mirror, enemy scaling, friendly-fire setting.

## Demo definition

Two pads plugged in. Pad A plays solo from the hub. Pause, pad B presses A, player 2 appears beside player 1 in teal with their own HUD strip. Both play the tutorial and 1-1 with the shared camera. Player 2 dies, is out, revives on 1-2. Pause → Remove player 2 → pause → Add again: player 2 is back with the hearts they had. Keyboard can join as player 3 the same way.
