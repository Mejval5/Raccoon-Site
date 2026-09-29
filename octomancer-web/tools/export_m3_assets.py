#!/usr/bin/env python3
"""M3-3: export the four core-enemy sprites + a small Beholder frame set from
the M0-3 harvest into play/assets/, at display size.

Offline tool only -- never ships. Reads octomancer-web/harvest/ (already
harvested, read-only per OVERNIGHT.md M0-3) and writes into
site/octomancer/play/assets/. Run from the repo root:
    python octomancer-web/tools/export_m3_assets.py

Beholder: the harvest already kept every 2nd frame (23 of 46); this script
picks every 4th of those (~6 frames) and downscales to 128px tall so the
animation set stays well inside play/assets/'s 900KB budget (OVERNIGHT.md
M0-3 acceptance) -- the full 24-frame harvested set alone is ~1.4MB.
"""
import glob
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HARVEST = ROOT / "octomancer-web" / "harvest" / "Assets" / "Sprites" / "NPCs"
PLAY_ASSETS = ROOT / "site" / "octomancer" / "play" / "assets"


def copy(src, dst_name):
    im = Image.open(src).convert("RGBA")
    dst = PLAY_ASSETS / dst_name
    im.save(dst, "WEBP", lossless=True, quality=90)
    print(dst, im.size, os.path.getsize(dst))


def main():
    PLAY_ASSETS.mkdir(parents=True, exist_ok=True)
    copy(HARVEST / "NPC25.webp", "enemy-urchin.webp")
    copy(HARVEST / "NPC21.webp", "enemy-piranha.webp")
    copy(HARVEST / "NPC30.webp", "enemy-cannon.webp")
    copy(HARVEST / "NPC32Ball.webp", "enemy-shot.webp")

    frames = sorted(glob.glob(str(HARVEST / "Beholder" / "Beholder_000*.webp")))
    picked = frames[::4]
    for i, f in enumerate(picked):
        im = Image.open(f).convert("RGBA")
        scale = 128 / im.height
        im2 = im.resize((round(im.width * scale), 128), Image.LANCZOS)
        dst = PLAY_ASSETS / f"enemy-beholder-{i}.webp"
        im2.save(dst, "WEBP", quality=82, method=6)
        print(dst, im2.size, os.path.getsize(dst))


if __name__ == "__main__":
    main()
