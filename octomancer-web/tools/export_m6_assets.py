#!/usr/bin/env python3
"""M6-2: export the 2021-creature sprites (spiked mine, both crabs, manta +
its ball, spike horns) from the M0-3 harvest into play/assets/, cropped to
their content and sized for display.

Offline tool only -- never ships. Reads octomancer-web/harvest/ (already
harvested per M0-3, read-only) and writes into site/octomancer/play/assets/.
Run from the repo root:
    python octomancer-web/tools/export_m6_assets.py

Sources are all 1000x1000 canvases with the actual art in a small corner
(OVERNIGHT.md M6 art note: "crop each 1000^2 canvas to its content and export
at display size"); this crops to each image's alpha bounding box (+ a few px
padding) before downscaling.
"""
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HARVEST = ROOT / "octomancer-web" / "harvest" / "OldAssets" / "Sprites" / "NPCs" / "NPC.old" / "Old" / "NPC.old"
PLAY_ASSETS = ROOT / "site" / "octomancer" / "play" / "assets"

PAD = 6


def export(src_name, dst_name, target_h):
    im = Image.open(HARVEST / src_name).convert("RGBA")
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
    export("NPC8.png".replace(".png", ".webp"), "enemy-mine.webp", 128)
    export("CrabFlatten.webp", "enemy-crab-slow.webp", 96)
    export("CrabFlatten2.webp", "enemy-crab-fast.webp", 96)
    export("NPC10.webp", "enemy-manta.webp", 110)
    export("NPC10Ball.webp", "enemy-manta-ball.webp", 48)
    export("NPC6.webp", "enemy-horns.webp", 128)


if __name__ == "__main__":
    main()
