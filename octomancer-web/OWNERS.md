# Octomancer owners board (2026-10-07)

Every request has one Opus owner in its own git worktree. This file lives in the MAIN checkout at
`D:\Projects\Raccoon-Site\octomancer-web\OWNERS.md` (read and write it by that absolute path, not
your worktree copy). Read it when you start and before you merge master. Append, never rewrite
someone else's lines.

## Owners and what they touch

| Owner | Request | Main files / systems |
|---|---|---|
| Round 44 (workflow) | Transition stutter, whirlpool entry first pass | main.js transition, portal-draw.js |
| Ragdoll | Death ragdoll, camera, death panel out of the way | octopus body physics, ui death screen |
| Combat and spells | Fish juice, Siphon Shell, rest grotto, Ink Jet (left click), Ink Cloud (right click), bomb (middle), dash (Shift/Space), hotbar and inventory | input.js, autofire.js, spells, HUD, items |
| Foliage | Unity per-plant offsets and randomizer, all original foliage types | decor.js, decor-draw.js, foliage data, patterns.json (foliage rows) |
| Placeholder art | Replace code-drawn stand-ins, natural replacement for chests, audit flashy UI | NPC/prop/item sprites, img/v2, journal plates |
| Damage model | Spikes impale, one-hit knockback, incapacitation, up-only jets with spikes, clams with pearls, tentacles, killable NPCs and Marlo's harpoon, physics corpses, shell value styles, splat | enemies.js, hazards.js, props corpses, patterns.json (hazard rows) |
| Shop and shopkeeper | Destructible shop, buff brutal shopkeeper, Spelunky aggro | shop.js, shopkeeper AI, run state aggro flag |
| Buried treasure | Shells always visible in rock, items and rare shells only with Sea-glass Goggles | per-tile treasure data, goggles item |
| Materials | Indestructible rock, main terrain, destructible blocks, wooden platforms, wall traps, pushable blocks, shop frame; Spelunky edge layering | tile material ids, wall rendering, level data chars |
| Backrooms (doc only) | Brainstorm BACKROOMS.md | no code |
| Portal entry (after round 44) | Unity MoveOctoToExit: physics off, spin 720/s, shrink, centred fade | main.js exit, portal-draw.js |

## Known overlaps and agreed interfaces

- Ragdoll body: Ragdoll owner exposes enter-limp(duration, cause) and exit; Damage model reuses it for incapacitation, impalement and splat.
- Corpses: Damage model exposes onCorpse(x, y, kind); Combat uses it for the juice leak (collectible only with the Siphon Shell).
- NPC aggro: Damage model owns NPC health and aggro for Marlo, Quill, Pip and the pool host. Shop owner owns the shopkeeper and the run-wide shop aggro flag; Damage model calls the shop owner's aggro hook when a shopkeeper is hurt.
- Shells: Damage model owns shell value styles (cowrie, conch, nautilus, pearl). Buried treasure uses those sprites; Materials draws embedded treasure through the treasure owner's per-tile hook.
- Patterns table: Foliage owns foliage rows; Damage model owns hazard and enemy rows; keep rows in separate blocks to ease merges.
- Shop structure: Materials provides the shop frame material (timber, masonry); Shop owner makes it breakable and wires aggro to damage of it.
- Art rule for everyone: natural fantasy (clams, coral, kelp, bone, stone, bioluminescence); no gold, coins, sparkles or glossy mobile UI.
- Before finishing: merge master into your branch, resolve conflicts preserving everyone's work, rerun all tests.

## Notes from owners (append below: date, owner, what you exposed or changed that others need)

