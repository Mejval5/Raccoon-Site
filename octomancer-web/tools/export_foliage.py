#!/usr/bin/env python3
"""Foliage sheet: every original Octomancer foliage sprite the web game spawns, packed into ONE webp
(site/octomancer/play/assets/foliage.webp), with the cell rects written into the "art" block of
site/octomancer/play/data/foliage.json (the rest of that table is hand-kept: see its _doc).

Offline tool only -- never ships. Reads the octomancer-unity submodule read-only (Milan's FGFoliageTiles plant art
under Assets/Sprites/NPCs and Assets/Sprites/Animations, the BGFoliage rocks/pebbles, Daniel's runes). Sprites keep their
native resolution (they are 50-230 px for about 0.3-1.2 tiles, i.e. already about DPR 2 at the game's tile size);
only the trim and a 2 px gutter change. uNPC20 carries its prefab tint (SpriteRenderer m_Color) baked in.
    python octomancer-web/tools/export_foliage.py [path/to/octomancer-unity]
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UNITY = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "octomancer-unity"
SPR = UNITY / "Assets" / "Sprites"
PLAY = ROOT / "site" / "octomancer" / "play"
DATA = PLAY / "data" / "foliage.json"
OUT = PLAY / "assets" / "foliage.webp"

# key -> (source, tint rgb or None, crop box or None)
SOURCES = {
    "plant5": ("NPCs/Plant5.png", None, None),
    "plant8": ("NPCs/Plant8_2.png", None, None),
    "plant9": ("NPCs/Plant9.png", None, None),
    "plant24": ("NPCs/Plant24.png", None, None),
    "plant12": ("NPCs/Plant12.png", None, None),
    "plant13": ("NPCs/Plant13.png", None, None),
    "plant26": ("Animations/Plant26Animation/Plant26Animation_character_img.png", None, None),
    "plant25": ("NPCs/uNPC25.png", None, None),
    "plant7": ("NPCs/Plant7Tint.png", None, None),
    "greenranha": ("Animations/Greeranha/GreeranhaAnimation_character_img.png", None, "first-band"),
    "rock23": ("NPCs/uNPC23.png", None, None),
    "rock23solo": ("NPCs/uNPC23Solo.png", None, None),
    "plant20": ("NPCs/Greyscaled/uNPC20.png", (0.5235849, 1.0, 0.8867763), None),
    "rune1": ("Runes/Rune1.png", None, None),
    "rune2": ("Runes/Rune2.png", None, None),
    "rune3": ("Runes/Rune3.png", None, None),
    "rune4": ("Runes/Rune4.png", None, None),
    "rune5": ("Runes/Rune5.png", None, None),
    "rune6": ("Runes/Rune6.png", None, None),
}
PAD = 2
SHEET_W = 512


def first_band(im):
    """The top-most connected band of non-empty rows (the Greeranha atlas holds the fish at three sizes, stacked)."""
    a = im.getchannel("A")
    rows = [any(a.getpixel((x, y)) > 8 for x in range(im.width)) for y in range(im.height)]
    y0 = rows.index(True)
    y1 = y0
    while y1 < im.height and rows[y1]:
        y1 += 1
    return im.crop((0, y0, im.width, y1))


def load(key):
    src, tint, crop = SOURCES[key]
    im = Image.open(SPR / src).convert("RGBA")
    if crop == "first-band":
        im = first_band(im)
    im = im.crop(im.getbbox())
    if tint:
        r, g, b, a = im.split()
        r = r.point(lambda v: int(v * tint[0])); g = g.point(lambda v: int(v * tint[1])); b = b.point(lambda v: int(v * tint[2]))
        im = Image.merge("RGBA", (r, g, b, a))
    return im


def main():
    ims = {k: load(k) for k in SOURCES}
    order = sorted(ims, key=lambda k: -ims[k].height)
    rects, x, y, shelf = {}, PAD, PAD, 0
    for k in order:
        im = ims[k]
        if x + im.width + PAD > SHEET_W:
            x, y, shelf = PAD, y + shelf + PAD, 0
        rects[k] = [x, y, im.width, im.height]
        x += im.width + PAD
        shelf = max(shelf, im.height)
    sheet = Image.new("RGBA", (SHEET_W, y + shelf + PAD), (0, 0, 0, 0))
    for k, (rx, ry, w, h) in rects.items():
        sheet.paste(ims[k], (rx, ry))
    sheet.save(OUT, "WEBP", quality=90, method=6)
    # the table is hand-formatted: only the one-line "sheet" and "art" entries are rewritten
    import re
    text = DATA.read_text(encoding="utf-8")
    art = json.dumps({k: rects[k] for k in SOURCES}, separators=(", ", ": "))
    text = re.sub(r'^  "sheet": .*$', f'  "sheet": [{sheet.width}, {sheet.height}],', text, count=1, flags=re.M)
    text = re.sub(r'^  "art": .*$', f'  "art": {art},', text, count=1, flags=re.M)
    json.loads(text)
    DATA.write_text(text, encoding="utf-8")
    print(OUT, sheet.size, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
