#!/usr/bin/env python3
"""Round 42: Milan Svancara's Whirlpool sprite animation (octomancer-unity, read-only) -> one webp sheet.

Frame order and fps come from the .anim files (the guids of the sprite keys, mapped through the .png.meta files):
  Whirlpool1.anim        idle loop    5 frames, 12 fps (WhirlpoolAnimation1..5), loops
  Whirlpool1Bounce.anim  bounce      10 frames, 12 fps (WhirlpoolBounce1..10), loops (played once when the octopus enters)
  Whirlpool1Rise.anim    rise         6 frames, 12 fps (WhirlpoolRise0..5), no loop
All sprites share one scale (100 px per unit) and a centre pivot, so each frame is pasted centred in a square cell.
SCALE 0.30: the idle whirlpool (557 px wide in the source) becomes ~167 px = 2.3 tiles at 72 px tiles.
Offline tool only. Run from the repo root:  python octomancer-web/tools/export_whirlpool.py
"""
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "octomancer-unity" / "Assets" / "Sprites" / "Elements (Bubbles, flames...)" / "Whirlpool"
DST = ROOT / "site" / "octomancer" / "play" / "img" / "v2" / "whirlpool-sheet.webp"
SCALE, CELL, COLS = 0.30, 208, 7


def guid_map():
    m = {}
    for meta in SRC.glob("*.png.meta"):
        g = re.search(r"^guid: (\w+)", meta.read_text(), re.M).group(1)
        m[g] = meta.name[:-9]
    return m


def frames(anim, g2n):
    txt = (SRC / anim).read_text()
    block = txt.split("m_PPtrCurves:")[1].split("m_SampleRate")[0]
    return [g2n[g] for g in re.findall(r"time: [\d.]+\n\s+value: \{fileID: \d+, guid: (\w+)", block)]


def main():
    g2n = guid_map()
    seqs = [("idle", "Whirlpool1.anim"), ("bounce", "Whirlpool1Bounce.anim"), ("rise", "Whirlpool1Rise.anim")]
    names = []
    for key, a in seqs:
        f = frames(a, g2n)
        print(key, f)
        names += f
    rows = (len(names) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for i, n in enumerate(names):
        im = Image.open(SRC / (n + ".png")).convert("RGBA")
        im = im.resize((round(im.width * SCALE), round(im.height * SCALE)), Image.LANCZOS)
        cx, cy = (i % COLS) * CELL + CELL // 2, (i // COLS) * CELL + CELL // 2
        sheet.alpha_composite(im, (cx - im.width // 2, cy - im.height // 2))
    sheet.save(DST, "WEBP", quality=80, method=6)
    print(DST, sheet.size, DST.stat().st_size)


if __name__ == "__main__":
    main()
