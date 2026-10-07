"""Key, crop and export the Sea-glass Goggles sprite (generated, Milan style).

Source: one openai-image-gen `edit` call (gpt-image-2, quality medium) with a contact sheet of Milan's sprites
(shell-blue, enemy-urchin, enemy-crab-slow, critter-snail, enemy-piranha, critter-jelly) as `-i`, on a flat magenta
background (the model refuses `--background transparent`). This keys the magenta to alpha with a despill on the soft
edge, crops to the opaque box and writes site/octomancer/play/img/v2/item-goggles.webp (192 px wide).

usage: python export_goggles.py <generated.png>
"""
import sys
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'site' / 'octomancer' / 'play' / 'img' / 'v2' / 'item-goggles.webp'
WIDTH = 192


def key_magenta(im):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # how magenta: red and blue high, green low
            m = min(r, b) - g
            if m > 120:
                px[x, y] = (0, 0, 0, 0)
            elif m > 40:
                k = (m - 40) / 80.0  # 0 keep .. 1 gone
                na = int(a * (1 - k))
                # despill: pull the red / blue excess back down to the green level
                ex = int(m * k)
                px[x, y] = (max(0, r - ex), g, max(0, b - ex), na)
    return im


def main(src):
    im = key_magenta(Image.open(src))
    box = im.getbbox()
    im = im.crop(box)
    h = round(im.height * WIDTH / im.width)
    im = im.resize((WIDTH, h), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, 'WEBP', quality=90, method=6)
    print(OUT, im.size)


if __name__ == '__main__':
    main(sys.argv[1])
