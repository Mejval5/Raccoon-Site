# Octomancer: polish review (2026-10-18, overnight)

**Method.** I played the game headless with puppeteer-core against this worktree (port 64871), using the `__octo` hooks at 1440x900 and 412x915. I covered:
- The hub, on a fresh save and an everyone-home save, with each resident.
- The nine tutorial rooms.
- Shallows 1-1 to 1-3 (seed 5), including the shop, the whirlpool, an altar (`?altar=1`) and a pearl back room.
- The Still Grotto, the clear screen and a death.
- Every journal chapter and Settings.
- The pause menu with two stubbed pads, a pad joining as P2, then co-op play.

There were no console errors on any stop. Three Sonnet reviewers swept the player-facing text, the audio and the game feel. I checked their claims that mattered in the code (cited below).

Screenshots are in `octomancer-web/night/review-*.png` (`-d` is desktop, `-p` is phone).

**Scope.** Polish only: no new systems, no balance or damage changes, no change to the controls or the co-op rules, and no popup boxes. Items 1-3 are real bugs; the rest is polish.

## Night batch (8 owners in parallel)

Each owner has its own files. Shared files are flagged, with the exact part each owner touches:
- **`main.js`** is touched by #1 (one call in the render pass, around line 2558), #4 (the event handlers, lines 960-1110 and the hurt/blast/kill blocks) and #5 (one line where `createMenuNav` is built). The hunks are far apart. Merge order: #4 first, then #1, then #5.
- **`play.css`** is touched by #2 (the panel, button, game-over, clear and settings blocks) and #3 (the HUD, co-op strip and journal-tab blocks). Each owner edits only its own blocks. Merge #2 before #3.

### 1. Open sign boards cover the thing they explain, and the octopus covers their words (bug), S-M
**Wrong now.** The near sign unfolds into a board drawn *before* entities: `main.js:2558` calls `drawSigns` ahead of loot, the shop, creatures and the octopus. The board is also placed on its post with no regard for what is around it. The results:
- **Dash room:** the octopus sits on top of the text, so "Mid-dash" is unreadable (`review-tut-dash-d.png`).
- **Tutorial shop:** a ware on its pedestal is drawn over the sentence (`review-tut-shop-d.png`).
- **Dive sign:** the board hides the whirlpool it describes, and a second sign post behind it (`review-tut-exit-d.png`).
- **Altar:** the board hides the altar, and an eel swims over it (`review-altar-d.png`).

**Fix.**
- Draw the unfolded board (only the near, open one) in the post-octopus pass, so it sits above actors. The far planks stay where they are.
- In `signs.js placeSigns` / the board layout, prefer opening the board upward. Then shift it sideways so its rect avoids:
  - the prompt's target: the whirlpool, the altar, the ware row and the shop rect;
  - a 1.2-tile disc around the octopus;
  - any other post.
- Clamp the board inside the view.

**Files:** `js/signs-draw.js`, `js/signs.js`, `js/main.js` (move one call into `postOctoDraw`), `tests/signs.test.js`.

**Test.**
- `signs.test.js`: for the tutorial, the hub, the grotto and the altar, the open board's rect does not intersect its target rect or the octopus disc.
- `node tests/signs-cdp.js`: still green.
- New frames `night/signs-board-{dash,shop,dive,altar}.png`, checked by eye.

### 2. End screens and menus: phone death sheet truncates, "Exit" leaves the game, glossy mint UI (bug + polish), M
**Wrong now.**
- **Phone death sheet:** the two-column grid wraps "Time (level / run)" onto two lines and cuts the value to "00:02.2 / 0…" (`review-death-p.png`). There is also a large empty gap above the buttons.
- **Exit button:** "Exit" (`ui.js:230`, `main.js:539`) does `location.href = '/octomancer/'` with no confirm and no key hint. It sits one d-pad step from "Back to the hub", so a pad player can leave the page by accident.
- **Glossy styling:** the death, clear, pause and settings panels use bright mint pill buttons and iOS-style switches (`review-clear-d.png`, `review-settings-d.png`, `review-pause-joined-d.png`). That is the "glossy mobile UI" Daniel ruled out, next to a journal that already looks like parchment and teal-ink.
- **Clear screen:** it says "All 3 levels cleared" and then "Levels reached 3 of 3".
- **Settings:** the Controls box is clipped mid-line under the Close button (`review-settings-d.png`).

**Fix.**
- **Phone sheet:**
  - Use a single-column stat list.
  - Split the time into "Level time" and "Run time" rows, with `white-space: nowrap` on values.
  - Pin the buttons under the list.
- **Exit:**
  - Rename it to "Leave the game" and put it last.
  - Make it ask "Leave Octomancer?" with Yes / Stay, reusing the reset confirm pattern from `settings-ui.js`.
  - Keep pad focus off it by default.
- **Restyle in play.css only:**
  - Primary button: a muted sea-glass fill (#3d8c7a) with a dark ink outline, or the journal's parchment button.
  - Secondary buttons: outlined.
  - Switches become a two-state carved pill in the journal palette.
  - No colour change of the panel layout.
- **Clear screen:** drop the duplicate "Levels reached" row.
- **Settings:** give the Controls box its own full height in the scroll flow instead of a fixed clip.

**Files:** `js/ui.js`, `js/settings-ui.js`, `css/play.css` (panel, button, game-over, end and settings blocks).

**Test.**
- `node tests/settings-cdp.js`, `restart-cdp.js`, `pad-ui-cdp.js`, `death-cdp.js` stay green.
- New check in `death-cdp.js` at 412x915: no stat value element has `scrollWidth > clientWidth`, and the Exit button needs a second confirm.
- Frames: `night/panels-{death,clear,pause,settings}-{d,p}.png`.

### 3. HUD strips, vitals and journal tabs (bug + polish), M
**Wrong now.**
- **Phone co-op strips:** they wrap "3 ink" onto two lines (`review-pause-joined-p.png`). The strip writes `p.casts + ' ink'` (`coop-ui.js:106`) where the solo HUD shows the jar icon, and the game calls it "fish juice" everywhere else.
- **Orphan shell count:** in co-op the solo vitals vanish but a lone shell count "0" stays floating under the clock (`review-coop-play-d.png`).
- **Add-player line:** "Add player: press A on a pad or Enter on the keyboard" still offers Enter when the keyboard is already P1.
- **Journal tabs:**
  - The vertical labels "Bestiary", "Controls" and "Progress" run past their tab ends (`review-journal-controls-d.png`, `review-journal-people-p.png`).
  - The Controls tab has no colour (`journal-ui.js:29 TAB_COLORS` has no `controls`).
- **Desktop vitals:** they have no backing, so lamp ropes, plants and props run straight through the heart, bomb and shell numbers (`review-hub-full-marlo-d.png`, `review-tut-exit-d.png`). The phone already has a dark band.
- **Lost hearts:** they show no change beyond the number (`hud-strip.js:237` only toggles `is-low`).

**Fix.**
- **Strips:**
  - Use the jar icon + number (the same `badge` as `hud-strip.js`), with `white-space: nowrap`.
  - Move the shared shell count into the clock row in co-op.
  - List only free devices in the Add line.
- **Journal tabs:**
  - Size the labels to fit: a smaller font or letter-spacing on long labels, or tab height from the label's measured width.
  - Give Controls a muted slate (#9fb3b8).
- **Desktop vitals:** add a soft radial dark backing behind the top-right cluster (CSS gradient, no box edge).
- **Heart loss:** a 0.35 s pulse on the heart badge (scale 1.25 to 1, red tint).

**Files:** `js/coop-ui.js`, `js/hud-strip.js`, `js/journal-ui.js`, `css/play.css` (HUD, strip and journal-tab blocks).

**Test.**
- `node tests/coop-cdp.js` and `hud-cdp.js` at 412x915 and 1440x900:
  - every strip and badge has `scrollHeight <= clientHeight` (no wrap);
  - no orphan shell element in co-op;
  - the Add line omits joined devices.
- `journal-cdp.js`: every tab label fits its tab (`scrollWidth <= clientWidth` on the rotated axis).
- `hud-cdp.js`: the pulse class appears on a heart loss.

### 4. Impact pass: blasts, hurts, kills, shake and rumble, M
**Wrong now.** Facts are from the feel reviewer, checked at `main.js:1028-1040` and `1098-1106`.
- **Blasts:**
  - The bomb blast, the biggest moment, has no hit-stop.
  - Its sound is the same at any distance: `sfx.bomb()` ignores `bd`, which is already computed.
  - The same bomb sound plays for a pot or jar break (`main.js:2843`) and for Marlo's harpoon (`2415`).
- **Hurt:** it reads as a 3 px wobble, the same as minor events (`config.js:47`).
- **Kills:** only dash kills get the white kill flash (`enemies.js:513`). Ink, bomb and boulder kills just switch to the corpse.
- **Shake:**
  - Two shake systems fire per blast (`particles.js:71` `shakeScreen` plus `:146` `shakeFx`).
  - The offset is translated un-rounded (`render.js:1764`).
- **Pickups:** a shell pickup is a 5-speck sparkle and nothing else.
- **Pads:** there is no rumble anywhere (nothing in `gamepad.js`).

**Fix.** Use the numbers proposed by the feel reviewer:
- **Blast:**
  - hit-stop `0.05 * k` (k = the existing blast distance falloff, 0 beyond 10 tiles);
  - point-blank shake 9 px over 0.3 s;
  - `sfx.bomb(gainFromDistance)`;
  - `sfx.potBreak()` and `sfx.harpoon()` stubs for #5 to fill in.
- **Hurt:** 5 px over 0.2 s.
- **Kills:** a 60 ms white flash and 14 enemy-tinted poof specks on every kill, with no extra sim freeze.
- **Shake:** keep one path (drop `shakeScreen` where `shakePx` is used) and round the translate.
- **Pickups:** a 120 ms 1.0 to 1.08 scale pop on the octopus, and 8 specks.
- **Rumble:** a `rumble(padKey, weak, strong, ms)` helper using `vibrationActuator.playEffect('dual-rumble')`:
  - sent only to the affected player's pad, and off when screen shake is off;
  - hurt 0.8/0.4 for 120 ms, blast 1.0/0.6 for 180 ms × k, splat 1/1 for 300 ms, dash kill 0.3/0.6 for 60 ms.

**Files:** `js/main.js` (the event handlers only), `js/particles.js`, `js/config.js`, `js/enemies.js`, `js/gamepad.js`, `js/render.js` (one line).

**Test.**
- `feel.test.js` additions:
  - a blast at 1 tile sets hitStop > 0 and at 12 tiles does not;
  - a hurt shake ≥ 5 px;
  - an ink kill emits the flash;
  - one shake source per blast.
- `pad-cdp.js`: a stubbed pad with a fake `vibrationActuator` records `playEffect` on hurt and none with shake off.
- `settings.test.js`: reduced motion and shake-off still give 0 hit-stop and 0 shake.

### 5. Sound: a natural palette, a voice limiter and menu sounds, M
**Wrong now.** From the audio reviewer, checked against `sfx.js` and `audio.js:180-210`.
- **No menu sounds:** no menu, journal, pause, hotbar or co-op-join sound exists anywhere. Only `main.js` calls `sfx`.
- **One pickup ding for everything:** `chime` (two pure triangles, 660 then 990 Hz) is used for about 35 unrelated events: pickups, buys, casts, quests, the spring. It reads as a mobile-game ding, against the natural-fantasy rule.
- **Beepy synths:** `hurt` (square), `dash` (sawtooth sweep) and `emptyJar` (square) sound like 8-bit placeholders.
- **Nothing limits voices:** `tone()` and `noiseBurst()` make new nodes on every call. A held Ink Jet, a chain reaction or a 4-player blast stacks identical sounds.
- **Pause:** it only swaps the music track. SFX tails ring on, and the swim loop is not silenced.

**Fix (all inside the sound modules).**
- **Natural sounds:**
  - Rebuild `chime` as a soft bubble-pop: a sine blip with a fast upward bend, a little noise and random pitch ±8%.
  - Add `shell` (a short pitch-stepped tick that climbs on consecutive pickups within 0.6 s).
  - Rebuild `hurt` as a muffled low thump plus a short bubble burst, and `dash` as filtered noise.
- **Limits:**
  - A per-name cooldown (40-80 ms).
  - A global cap of about 24 live sources in `track()`, dropping the oldest.
  - Pitch and gain jitter on `inkJet`, `hurt` and `thud`.
- **Menu sounds:** a new `js/ui-sfx.js` gives soft wooden clicks: focus move, confirm, back, page turn and slider tick. `menu-nav.js` calls it (pad and keyboard), and one delegated `click` listener covers mouse clicks on `#hud` buttons.
- **Ducking:**
  - Pause ducks `sfxBus` to 0.3 and stops the swim whoosh.
  - The death screen ducks music to 0.5.
- **Fills #4's stubs:** `bomb(gain)`, `potBreak` and `harpoon`.

**Files:** `js/sfx.js`, `js/audio.js`, new `js/ui-sfx.js`, `js/menu-nav.js`, `js/main.js` (one line: pass `audio` into `createMenuNav`).

**Test.**
- `audio.test.js` (or `feel.test.js`) with a fake AudioContext:
  - 100 `inkJet` calls in one tick start at most the cap;
  - two `chime` calls 10 ms apart start one voice;
  - `pause` sets the sfx bus gain to 0.3;
  - a menu focus move calls `ui-sfx.focus`.
- `pad-ui-cdp.js` stays green. Daniel listens on real speakers in the morning (headless runs are muted).

### 6. The controls line and key names in code (polish, reads as a bug), S
**Wrong now.**
- **Controls line:** the bottom-left line (`glyphs.js:112 DESKTOP_TEXT`) is about 230 characters. At 1440 px it wraps to three lines, low-contrast over dark rock (`review-hub-fresh-d.png`, `review-tut-swim-d.png`). It says "Inventory: Tab/I" for what the game calls the journal, and "(bombs: pick their slot; B/X drops one)".
- **Hard-coded keys elsewhere:** the same stale or hard-coded keys sit in:
  - `settings.js:22` CONTROLS_HELP ("Drop a bomb: B or X", "Inventory: Tab or I");
  - `carried.js:79-81` (a 120-character "How" line; it shows in `review-journal-carried-d.png`);
  - `hotbar-ui.js:69/158` (the Jet tip omits K);
  - `inventory-ui.js:112` (starts lowercase).
- **Inconsistent name:** "Ink jet" is written in some places and "Ink Jet" in others.

**Fix.**
- Make one short line per scheme, under 110 characters, with no notes in brackets: "Swim WASD · Aim mouse · Jet LMB · Use RMB · Hand F · Dash Space · Bar Q/E · Journal Tab · Pause Esc".
- Give the line a soft dark backing behind its text so it reads over rock.
- In the Settings help and the Carried "How" lines, use "Journal" and drop B/X (they stay as working keys, listed once in Settings).
- Use "Ink Jet" everywhere.

**Files:** `js/glyphs.js`, `js/settings.js`, `js/carried.js`, `js/hotbar-ui.js`, `js/inventory-ui.js`.

**Test.**
- `gamepad.test.js` / `signs.test.js`:
  - `controlsLine('desktop').text.length <= 110`;
  - the pad line ≤ 110;
  - no string in these files matches `/Inventory: Tab|B\/X drops|Ink jet/`.
- `hud-cdp.js`: the line's element is one line tall at 1440x900 and 1024x768.

### 7. Player-facing text in data (polish), S-M
**Wrong now.** From the strings reviewer, spot-checked in the shots:
- **Long tutorial signs:**
  - "Bomb the floor": four sentences, hard-coded C, B and X, and "{use} on yourself" (`review-tut-bomb-d.png`).
  - "Dive": garbled last clause, "what you carry first" (`review-tut-exit-d.png`).
  - "Spells": hard-codes C next to `{use}`.
- **Comma splices:** in Dash and Ink Jet.
- **"Ring" vs "whirlpool":** "ring" in the hub welcome, the grotto, Quill and Marlo lines, but "whirlpool" in the HUD and the journal.
- **Banned words and dev wording:**
  - "Buried Treasure" uses the banned word.
  - The Shallows journal page says "biome".
  - The shop sells "Sea-glass goggles" and "Bomb pack", while the journal says "Sea-glass Goggles" and "Bomb Pack".
  - The death cause says "a trapped chest" for what the journal calls a barnacle clam (`run.js:35`).
  - The grotto sign is long, and its touch variant says "tap Enter".
- **Phone text:** the touch tutorial says "tap Bomb", but no button is labelled Bomb.
- **Hub welcome on a phone:** it sends you to "the stone stage to your left", which is off screen (`review-hub-fresh-p.png`).

**Fix.**
- Apply the reviewer's rewrites: short, plain, at most two sentences per sign, every control through a `{token}`.
- Use "whirlpool" everywhere.
- Rename "Buried Treasure" to "Buried in the Rock".
- Title Case for item names in `shop-items.json`.
- "a barnacle clam" / "Snapped shut" for the chest death.
- Touch texts name the real buttons (Use, Grab, Dash, Jet).

**Files:** `data/tutorial.json`, `data/hub.json`, `data/rest.json`, `data/journal.json`, `data/shop-items.json`, `data/quests.json`, `data/hub-rooms.json`, `js/run.js` (CAUSE_TEXT and DEATH_TITLE strings only).

**Test.**
- `signs.test.js`:
  - every prompt's `plainText` ≤ 160 characters and ≤ 2 sentences;
  - no `{key:C}`, `{key:B}` or `{key:X}` in tutorial.json;
  - no `/\bring\b/i` in player text;
  - no `/treasure|biome|loot/i` in journal titles or texts.
- `journal.test.js` coverage passes.
- `node tests/signs-cdp.js` and `tutorial-cdp.js` are green.

### 8. The tutorial's cracked-floor cue is a pale box (polish, art), S
**Wrong now.** The bomb room's breakable floor is marked by a flat translucent pale rectangle over the rock, plus code-drawn cracks and a bomb glyph (`review-tut-bomb-d.png`, `drawWallCue` in `js/v2-props-draw.js`). It reads as a debug highlight, not as part of the cave.

**Fix.**
- Drop the rectangle fill.
- Draw the cracks in the existing ink line style, darker into the rock, with a faint silt dribble falling from them every couple of seconds as the "attention" tell.
- Repaint the bomb glyph as a small charcoal cave-painting mark, the same style as `cave-paint.js`.
- Cache it per wall like the painting.

**Files:** `js/v2-props-draw.js` (drawWallCue only), optionally `js/cave-paint.js` for the shared mark.

**Test.**
- `tutorial-cdp.js` stays green.
- A pixel check in a new `tests/wallcue.test.js` (draw to an offscreen canvas): the mean alpha of the cue's rect outside the crack lines is < 0.1.
- Frames `night/wallcue-{d,p}.png`.

## Morning picks (for Daniel to choose)

9. **Combat and world sounds, wired up (M, after #4 and #5 merge).** These are silent today:
   - clam snap (`main.js:2767`) and tentacle grab (`2771`);
   - piranha bite, manta slam, cannon shot and stun;
   - deaths by clam, being swallowed and the harpoon;
   - corpse landing (capped), the portal whoosh, the shopkeeper's aggro and the push block.

   Files: `main.js` event switches and `sfx.js`. Test: a fake-context count per event.
10. **Pad-only players may get no sound (S, needs a real-pad check).** The AudioContext starts only on keydown, pointerdown or touchstart (`audio.js:184`). `gamepad.js` never calls `start()`. Chrome may not count a pad press as a user gesture, so the fix is "try `ctx.resume()` on the first pad button, and resume on the first real gesture". Files: `gamepad.js`, `audio.js`.
11. **Co-op: who becomes P1 (S, verify first).** In my run, pad A was playing solo. When I pressed Esc on the keyboard and pad B joined, P1 was bound to the *keyboard*, and pad A dropped out (`review-pause-joined-d.png`, `coop()` players `["keyboard", "…#1"]`). A real pad player pauses with Start, so this may only bite mixed setups. Files: `players.js`, `main.js tryJoin`. Test: `coop-cdp.js` with Esc used for the pause.
12. **The phone shows no touch buttons until the first touch (S).** The signs say "tap Use / tap Enter" while no button is on screen (`review-tut-swim-p.png`, `review-hub-fresh-p.png`; `touch-ui.js:154` shows them on the first touch). Show them at load on a coarse-pointer device. Files: `touch-ui.js`. Test: `touch-cdp.js`.
13. **The world's outer frame reads as a UI border (S-M).** At the map edge there is a flat dark cobble band with a hard straight black line, visible on the tutorial's left and right, under 1-1's exit and around the grotto (`review-tut-swim-d.png`, `review-dive-1-1-exit-d.png`, `review-rest-start-d.png`). Blend it with a soft vignette into the bedrock texture and drop the black line. Files: `render.js`. Test: frames plus the existing seam tests.
14. **Arriving at the Still Grotto, the octopus is high in the top-left of the view, tucked into the ceiling notch (S, investigate).** See `review-rest-start-d.png` / `-p.png`. The camera aim or the spawn point there wants a look. Files: `camera.js` or `data/rest.json`.
15. **Death to panel (S).** The 1.5 s ragdoll has no input. The dark hold after a transition can last up to 2.5 s (`main.js:2157`). Accept a restart from 0.6 s, and cap the hold at 1.2 s. Files: `main.js`, `config.js`. Test: `death-cdp.js` and `entry-cdp.js` timings.
16. **Co-op camera (S).**
    - There is no look-ahead in co-op (`camFollow.vx = vy = 0`, `main.js:1955`).
    - The frame is computed for the target zoom while the zoom still eases.
    - Feed the leader's smoothed velocity at 0.5, and frame with the eased zoom.

    Files: `main.js` camera block, `players.js`. Test: `coop-cdp.js` keeps both players in view while spreading.
17. **Particle draw does a `save`/`restore` per particle (S, perf).** See `enemy-draw.js:527-533`. Set alpha and fill directly and restore once. Test: `perf43.test.js` / `death-perf-cdp.js` are unchanged or better.
18. **Code-drawn bomb icon (S, art).** The hotbar and journal bomb is a glossy black ball with a white highlight and a bright yellow spark (`review-journal-carried-d.png`). Repaint it in Milan's line style: matte, ink outline, an ember instead of a yellow star. Use image generation only if a hand tweak fails.

## Not changed and not proposed

- **No floating guidance boxes:** none are left. Speech bubbles and anchored tags are allowed.
- **Signs and the cave painting:** they swap correctly between keyboard, pad and touch.
- **Co-op flows:** join and the per-player HUD work.
- **Journal and Settings:** they open and close cleanly on both screens.
- **TODOs:** the TODO / FIXME / placeholder grep over `js/` found only the hotbar's one-spell-per-slot note and the octopus's M1 fallback, which is intended.
- **Back room:** the pearl grotto's inside shot did not show the octopus (`review-back-inside-d.png`). That is likely my `toCurtain(true)` call landing during the hop fade. It is not counted as a bug; `backroom-cdp.js` covers the hop.
