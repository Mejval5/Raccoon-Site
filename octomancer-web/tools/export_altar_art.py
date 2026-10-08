"""Offering altar: build play/img/v2/altar.webp (one sprite) and print the anchors used by play/js/altar-draw.js.

Generated, Milan style (openai-image-gen skill, gpt-image-2, quality medium, edit with a contact sheet of the hub / r46 stone
sprites as reference) in octomancer-web/art-src/altar/gen01-altar.webp, on flat magenta, keyed like export_hub_art.py.
Run from the repo root:
    python octomancer-web/tools/export_altar_art.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'octomancer-web', 'art-src', 'altar', 'gen01-altar.webp')
OUT = os.path.join(ROOT, 'site', 'octomancer', 'play', 'img', 'v2', 'altar.webp')
H = 200
HOLLOWS = [(475, 668), (762, 668), (1052, 668)]  # centres of the three carved hollows in the source sheet
BASIN = (762, 440)


def key_magenta(path):
    """Same key as export_hub_art.py: flat magenta -> alpha, the soft rim darkened, despilled."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    m = np.minimum(R, B) - G
    alpha = 1 - np.clip((m - 70.0) / 130.0, 0, 1)
    spill = np.clip((m - 20) / 180, 0, 1)
    out = im.copy()
    cap = G + 20
    out[..., 0] = np.where(spill > 0, np.minimum(R, cap + (R - cap) * (1 - spill)), R)
    out[..., 2] = np.where(spill > 0, np.minimum(B, cap + (B - cap) * (1 - spill)), B)
    edge = (alpha > 0.02) & (alpha < 0.98)
    out[edge] = out[edge] * 0.55
    return np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)


g = key_magenta(SRC)
full = Image.fromarray(g, 'RGBA')
bb = full.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
cut = full.crop(bb)
img = cut.resize((round(cut.width * H / cut.height), H), Image.LANCZOS)
a = np.asarray(img).astype(np.float32)  # leftover pink pulled back to grey-green
bad = (a[..., 0] > a[..., 1] + 25) & (a[..., 2] > a[..., 1] + 25) & (a[..., 3] > 0) & (a[..., 1] < 90)
a[..., 0] = np.where(bad, a[..., 1] + 10, a[..., 0]); a[..., 2] = np.where(bad, a[..., 1] + 10, a[..., 2])
Image.fromarray(a.astype(np.uint8), 'RGBA').save(OUT, 'WEBP', quality=90, method=6, alpha_quality=90)
w, h = bb[2] - bb[0], bb[3] - bb[1]
print('size', img.size, os.path.getsize(OUT), 'bytes')
print('hollows', [(round((x - bb[0]) / w, 3), round((y - bb[1]) / h, 3)) for x, y in HOLLOWS], 'r', round(95 / h, 3))
print('basin', (round((BASIN[0] - bb[0]) / w, 3), round((BASIN[1] - bb[1]) / h, 3)))
