# Octomancer on the web: soft plan

_Status: planned, not started (2026-09-28). The title screen at `/octomancer/` is live with **Start Game** greyed out until this ships._

## Goal

Press **Start Game** on the Octomancer title screen, zoom through Milan's cave into the light, and be swimming as the octopus within a few seconds, on a laptop or a phone. A small but real Octomancer, not a lookalike.

## Approach

- **Pure HTML/CSS/JavaScript**, no Unity and no build step, like the rest of raccoon.website. Canvas 2D rendering, a small hand-written physics layer, a fixed 50 Hz game loop, one input layer for keyboard, mouse and touch, saves in the browser.
- **Port, don't reinvent:** the original Unity project (private, referenced read-only as the `octomancer-unity` submodule on the `octomancer-web` branch) is the source of truth for numbers and behaviour. Levels are tiny pixel maps, so they port directly.
- **Only original art and music** (Daniel's and Milan's). Third-party packs, fonts and sounds from the Unity project never ship; effects are drawn in code, UI is HTML/CSS, sounds are synthesised or CC0.
- **Where it will live:** its own branch of the game repo containing only the web game, served under `/octomancer/play/`.

## v1 scope

The octopus's swim, dash, attack and bomb, breakable walls, the first 4 tutorial levels, the endless procedural dungeon with the Beholder chasing after two minutes, 5 enemies and traps (urchin, spike, cannon, piranha, ice wall), pearls and gold, a simple HUD and pause menu, local saves, music and a handful of sounds.

**Later:** dark levels, the shop and items, the other enemies, grab and throw, the rest of the tutorial, liquids, animated plants and critters.

## Phases

1. **Setup:** the web-only game repo, a skeleton page with the game loop and input, an asset allowlist, and a deploy guard so nothing half-built goes live.
2. **Swimming in a room:** the octopus feels like the original (checked side by side with the Windows build).
3. **Tutorial 1-4.**
4. **Endless mode** with the Beholder.
5. **Start Game handover and polish:** the zoom from the title screen, performance on a mid-range phone, a QA pass, then enable Start Game.

## Budgets

Playable after at most 1.5 MB and 5 MB in total, nothing downloaded before Start Game; about 60 fps on a mid-range phone.

## Open before starting

- Approve the v1 scope.
- Create the web-only branch in the game repo.
- Milan's OK to use his art on the web, and confirming the music is ours.
- A short real-phone test slot at each phase gate.

## Team

Planned with a small agent team: a CEO who validates plans, a project manager and a tech lead who orchestrate, and four developers (gameplay, graphics, platform, QA). The detailed architecture, task breakdown and review are in `ARCHITECTURE.md`, `PLAN.md` and `CEO-REVIEW.md` on the `octomancer-web` branch.
