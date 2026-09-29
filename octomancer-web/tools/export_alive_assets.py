#!/usr/bin/env python3
"""Wall-critters/decor pass (Otter, dev-otter role): export a handful more
allowlisted sprites (ART-SORT.md bucket A + kept bucket D) into play/assets/
so the dungeon walls can carry idle non-hostile decoration -- snails, a
small reef fish, a jellyfish, background eyes, wall holes, runes, and a
couple of the kept 2021 bushes -- alongside the existing enemies and plants.

Offline tool only -- never ships. Reads octomancer-web/harvest/ (read-only)
and writes into site/octomancer/play/assets/. Run from the repo root:
    python octomancer-web/tools/export_alive_assets.py
"""
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HARVEST = ROOT / "octomancer-web" / "harvest"
PLAY_ASSETS = ROOT / "site" / "octomancer" / "play" / "assets"

PAD = 4


def export(src, dst_name, target_h):
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - PAD); y0 = max(0, y0 - PAD)
    x1 = min(im.width, x1 + PAD); y1 = min(im.height, y1 + PAD)
    cropped = im.crop((x0, y0, x1, y1))
    scale = target_h / cropped.height
    sized = cropped.resize((max(1, round(cropped.width * scale)), target_h), Image.LANCZOS)
    dst = PLAY_ASSETS / dst_name
    sized.save(dst, "WEBP", quality=90, method=6)
    print(dst, sized.size, os.path.getsize(dst))


def main():
    PLAY_ASSETS.mkdir(parents=True, exist_ok=True)
    A = HARVEST / "Assets" / "Sprites"
    D = HARVEST / "D-kept"

    export(A / "NPCs" / "Critters" / "Critter1Fish" / "Critter1_character_img.webp", "critter-fish.webp", 44)
    export(A / "NPCs" / "Critters" / "Critter4JellyFish" / "Critter4Export_character_img.webp", "critter-jelly.webp", 52)
    export(A / "NPCs" / "Critters" / "Critter5Snail" / "Critter5_character_img.webp", "critter-snail.webp", 34)

    export(A / "Background" / "Eye.webp", "decor-eye.webp", 44)
    export(A / "Background" / "EyeBlue.webp", "decor-eyeblue.webp", 44)
    export(A / "Background" / "Hole01.webp", "decor-hole1.webp", 60)
    export(A / "Background" / "Hole02.webp", "decor-hole2.webp", 60)

    export(D / "Assets" / "Sprites" / "Runes" / "Rune1.webp", "decor-rune1.webp", 40)
    export(D / "Assets" / "Sprites" / "Runes" / "Rune3.webp", "decor-rune3.webp", 40)
    export(D / "Assets" / "Sprites" / "Runes" / "Rune5.webp", "decor-rune5.webp", 40)

    export(D / "OldAssets" / "Sprites" / "NPCs" / "NPC.old" / "Old" / "NeutralPlants.old" / "Bush2.webp", "decor-bush2.webp", 56)
    export(D / "OldAssets" / "Sprites" / "NPCs" / "NPC.old" / "Old" / "NeutralPlants.old" / "BushMini.webp", "decor-bushmini.webp", 40)


if __name__ == "__main__":
    main()
