# Controller support: plan (2026-10-17)

Daniel's rule: mouse+keyboard and controller are both first-class, natively. Phone is secondary: keep it working, don't design for it.

## Where we stand

`js/input.js` already turns keyboard, mouse and touch into one snapshot (`move`, `dash`, `attack`, `use`, `hand`, `cycle`, `select`, `src`, `mode`) and fires a `modechange` event. Gameplay reads only the snapshot. The gaps for a pad:

1. **Aim.** Mouse aims at the cursor; keyboard aims along the facing. A pad needs a right-stick aim vector, with soft auto-aim when the stick is idle.
2. **Every menu and screen is mouse-only:** pause, settings, journal (Tab), inventory, death and clear screens, shop ware prompts, the hub mirror / skin picker, the hotbar.
3. **Every piece of text names a key:** the bottom-left controls line, the nine tutorial rooms, the F hints over portals and wares, settings Help, NPC lines, the altar sign.
4. **Nothing can test a pad in headless Chrome** unless `navigator.getGamepads` is stubbed.

## Control scheme on a pad (Spelunky/Noita hybrid)

| Action | Keyboard+mouse | Pad (Xbox names; PlayStation glyphs mapped) |
|---|---|---|
| Swim | WASD | Left stick |
| Aim | cursor | Right stick (idle: facing / swim direction, with light auto-aim at the nearest target in a cone) |
| Ink Jet | LMB / J K | RT (held: auto-repeat) |
| Use slot (spell / bomb throw) | RMB / C | RB |
| Hand (grab, talk, buy, throw, hold = drop) | F / MMB | LB (hold = drop); A also works in play. Prompts name LB |
| Dash | Space / Shift | B or LT |
| Hotbar prev / next | Q E / wheel | D-pad left-right, d-pad up = bomb slot |
| Journal / inventory | Tab / I | Back (View) |
| Pause | Esc | Start (Menu) |
| Menus | mouse | D-pad / left stick to move, A confirm, B back, bumpers for tabs |

2026-10-18 (Daniel: "LB should grab on controller so I can throw while aiming"): the hand moved from A to LB so the right thumb can stay on the aim stick through a grab and a throw. A stays a second hand button in play; LB no longer steps the hotbar (the d-pad does). Menus are unchanged: A confirms, B backs, LB / RB turn the journal's chapters. Co-op ghosts are unchanged.

Deadzone 0.2 radial, aim stick 0.3. Rumble is a nice-to-have (Phase 3). No remapping UI for the demo.

Scheme detection: the last device used wins (`mode` becomes `'pad'` when any pad input passes the deadzone, `'keyboard'`/`'mouse'` on a key or click). Every piece of UI text re-renders on `modechange`.

## Text in the world, not over it (Daniel, 2026-10-17)

No floating popup boxes for guidance (the hub "Welcome to the village" box is out). Guidance is diegetic: a wooden sign, a cave painting written on the rock tiles, or a prompt anchored to the object itself (drawn at the portal, ware or altar, moving with the camera). The bottom-left controls line is the single HUD exception, and it shows the active scheme's glyphs. Signs and paintings re-render their glyphs on scheme change too.

## Phases

**Phase 1: foundation (one Opus owner, Badger-type work).** Playable demo target.
- `js/gamepad.js`: polls `navigator.getGamepads()` once per frame, standard mapping, deadzones, `connected`/`disconnected`, writes into the input snapshot: `move`, `aim {x,y,active}`, all buttons, `cycle`, `select`, `src = 'pad'`, `mode = 'pad'`.
- `main.js`: aim resolution for `src === 'pad'` (aim stick, else facing + auto-aim cone).
- `js/glyphs.js`: `glyph(action, scheme)` returns a short label (`F`, `LMB`, `A`, `RT`…) and a small drawn or sprite icon; `controlsLine(scheme)` builds the bottom-left line. The line switches on `modechange`. Milan-style, no glossy icons: simple ring-and-letter glyphs drawn in code.
- Pause/Start and a minimal "menu cursor": D-pad/stick + A/B works on the pause menu, settings, death and clear screens (these are the ones a demo hits).
- Test hook `__octo.pad(state)` that injects a fake gamepad, and `tests/pad-cdp.js` that plays a level with it (move, aim, jet, bomb, hand, dash, pause).

**Phase 2 (two owners in parallel, after Phase 1 merges).**
- **2A: every screen on a pad.** Journal (tabs by bumpers, pages by stick), inventory and hotbar reordering, the shop (ware prompts), the skin mirror, the hub NPC talk, the end screens, settings sliders. A focus ring visible but quiet (the same teal border as the selected hotbar slot).
- **2B: controls tutorial and scheme-aware text.** Replace every popup prompt (tutorial rooms, hub welcome, altar, portal and ware hints) with in-world signs, cave paintings on tiles, or prompts anchored to the object. All of them go through `glyph()` and re-render on scheme change. The tutorial's first room is a cave-painting wall of the current scheme. A "Controls" journal page shows the full map for the active scheme.

**Phase 3 (optional polish).** Rumble on hits/bombs, remap UI in settings, pad-driven cursor for touch-only screens if any remain.

## Demo definition

With a pad plugged in, from a fresh page load: navigate the hub, enter the tutorial on A, play all nine rooms using only the pad, dive, clear 1-1, die, restart from the death screen, all without touching the mouse. The bottom-left line shows pad glyphs the moment the pad is touched and keyboard ones when a key is pressed.

## Testing

Headless Chrome has no pads: tests stub `navigator.getGamepads` via `page.evaluateOnNewDocument` and drive `__octo.pad(...)`. Real-pad checks are Daniel's (Xbox and DualSense on Chrome and Edge).
