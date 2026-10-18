# Hub building: the hoard and the village you decorate (2026-10-18)

Daniel's brief: "a meta concept for the gameplay ... not powers per se, it's more of 'what to do with the resources gathered in
the runs'. Each run you keep the shells ... and then in the hub you can rebuild the hub with decorations. It's purely decorative
but gives it more personality and long-term engagement."

Nothing here touches gameplay: no stats, no powers, no new paths, no collisions. Decorations are drawn props.

## 1. The hoard

- At the end of every run the shells you **carry** (the wallet, `run.shells`, after anything you bought) are banked into a
  persistent hoard. Cleared, died, or restarted from the pause menu: all the same, everything carried is banked.
  - Death keeps all shells too (Daniel's call). **Tuning knob:** `DEATH_BANK` in `play/js/run.js` (1 = all; 0.5 would
    keep half on a death).
- `run.js endDive` puts `banked` in the run summary; `save.js recordDive` banks it (the one place every finished dive passes
  through). The pause menu's alive restart is not a recorded dive, so `main.js quickRestart` banks it directly.
- Save: `hoard: { shells, lifetime }`. `shells` is the spendable balance, `lifetime` only ever grows (unlock tiers).
  Later resources go in the same object (`HOARD_KEYS` in save.js: add `pearls`, `moonShells`, `driftwood` there; a missing
  key reads 0, so old saves need nothing).
- Co-op shares one hoard (there is one wallet per run already).

## 2. Seeing the balance (diegetic)

- No HUD number. A **shell pile** stands on the plaza floor right of the shaft (`hub.json build.pile`), on a ring of stones.
  It grows through 5 stages with the balance: 1+, 20+, 60+, 150+, 350+ shells (`PILE_STAGES`). 0 = the empty stone ring.
- Beside it a small **carved tally stone**. Within 2.5 tiles its count is written on it as an anchored tag
  (`drawAnchorTag`, like the mirror's): "312 shells in the hoard".
- The run summary (death and clear screens) gains one row: **Banked: N shells** (`runstats.js summaryRows`, shown through
  `ui.js summaryDisplayRows`).

## 3. Build spots

`hub.json` `build.spots`: 13 marked spots. Types:

| type | where | count |
|---|---|---|
| `hook` | a point on a ceiling; the piece hangs from it | 4 (2 plaza, Pip's nook, the arena) |
| `niche` | a wall face (`side` left/right = where the rock is) | 4 (2 in the shaft, the workshop, the grotto) |
| `ledge` | a floor point, small pieces | 3 (2 in the dive chamber, the den) |
| `plaza` | the plaza floor, big pieces | 1 |
| `mural` | a back-wall rectangle in the plaza | 1 |

A spot with `room` (one per NPC room) exists only once that room is open (hub-rooms.js village state). An empty spot shows a
faint chalk outline only when an octopus is within 3 tiles.

## 4. Building

- The hand (F / middle click; the pad's hand button) at a spot opens the **build picker** (`build-picker.js`, built on the
  looks picker's panel and cards): the decorations that fit that spot type, each with its shell cost, plus **Clear** (free, no
  refund) when something stands there. A / Enter / click builds and closes; B / Esc closes. The d-pad / arrows browse.
- Building over a piece replaces it at full price, no refund.
- Tiers unlock by `hoard.lifetime`: 0, 50, 150, 400. A locked card is a silhouette with "???" and how many more shells must be
  banked. A card you cannot afford is dimmed and says how many shells are missing.
- Plaques also need their person (the same conditions that open their room).

## 5. Catalogue (23 pieces)

Art: Milan's sprites and the foliage sheet first, code drawing second, three generated pieces (openai-image-gen, his style,
`octomancer-web/art-src/hub-build/gen01.webp`, `tools/export_build_art.py` -> `img/v2/sprites-build.webp`).

| id | name | fits | cost | tier (lifetime) | art |
|---|---|---|---|---|---|
| lantern | Shell lantern | hook | 10 | 0 | `hangingLamp` on a rope, warm glow |
| planter | Kelp planter | ledge, plaza | 15 | 0 | `pot` + foliage kelp |
| coral | Coral cluster | ledge, niche | 20 | 0 | foliage brain coral + green balls |
| anemones | Anemone bed | ledge, plaza | 20 | 0 | `anemone` x2 |
| mosaic-fish | Mosaic: fish school | mural | 25 | 0 | shell mosaic, code |
| plaque-marlo / -pip / -quill / -host / -keeper | (Name)'s plaque | niche, ledge | 25 | 0 + their quest | carved slab, code + portrait relief |
| glowjar | Glow jar | hook, niche, ledge | 30 | 50 | code, bioluminescent |
| fan | Sea fan | niche, ledge | 30 | 50 | code |
| bell | Bell shell | hook | 35 | 50 | conch shell asset, mouth down |
| bench | Driftwood bench | plaza | 40 | 50 | generated `driftBench` |
| mosaic-octopus | Mosaic: octopus | mural | 45 | 50 | shell mosaic |
| chimes | Sea-glass chimes | hook | 55 | 150 | code |
| net | Net with glass floats | hook | 60 | 150 | generated `floatNet` |
| anchor | Old anchor | plaza, ledge | 70 | 150 | generated `anchor` |
| mosaic-whirl | Mosaic: whirlpool | mural | 70 | 150 | shell mosaic |
| garden | Coral garden | plaza | 80 | 150 | foliage + `anemone` + `stone` |
| lanterns | Lantern string | hook | 90 | 400 | three `hangingLamp`s |
| idol | Stone idol | plaza, ledge | 100 | 400 | `idol` on a slab |
| mosaic-village | Mosaic: the village | mural | 120 | 400 | shell mosaic |

Every spot type has at least one tier-0 piece. Filling all 13 spots with the dearest fitting pieces costs about 1000 shells; a
typical clear banks 30 to 80.

## 6. Persistence

- Save: `hubBuild: { spotId: decoId }`. The hub rebuilds from it on every load and hub visit. Unknown ids (an old catalogue)
  are kept in the save but not drawn.
- `resetProgress` clears both the hoard and the build.

## 7. Journal

- Places: **Your Village** (`place-village`, counter "Pieces built"), found on the first build.
- The very first build gets a toast "Built: Shell lantern" (an event toast, shown at once); later builds only chime.

## 8. Performance

Each piece is painted once into a small canvas per zoom (`hub-build-draw.js`, like the cave painting) and blitted while on
screen; hanging pieces sway the blit, lights add one cached glow sprite. At most 2 new paintings a frame (a hub arrival never
paints them all in one task); the pile and the tally stone keep one canvas each for good (death-perf-cdp counts canvases).
Measured in `tests/hub-build-cdp.js` (render only, 1440x900, three hub views summed): 1.58 to 2.45 ms with 0 pieces and
1.59 to 2.16 ms with all 13 built, over several runs; the difference (-0.1 to +0.02 ms a frame) is inside the noise.

## Holes and open questions for Daniel

- The pause menu's restart banks too (it is the end of a run). Leaving the tutorial banks nothing (it is not a run).
- Spending is in the hub only; shops in the dive still use the run wallet, which starts at 0 as before. Nothing lets you take
  hoard shells into a dive (that would be a power).
- The pile sits where the plaza's kelp nest was; the nest moved out (it was the only free floor near the start).
- Pearls / moon shells: the schema is open, but nothing banks them yet.
- No refunds by design; a misclick costs shells. If that feels harsh, refund half on Clear (`CLEAR_REFUND`).
- Ports 65900+ from the brief do not exist (max 65535); tests used 65490.
