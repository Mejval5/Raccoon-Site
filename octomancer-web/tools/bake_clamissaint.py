"""Octomancer web: bake Milan's Clamissaint (the tentacle ambusher) for creatures-draw.js.

Offline-only tool (never ships). Reads the 16 exported frames of Assets/Sprites/Animations/Clamissaint (1280x720 each) and
writes into play/assets/:
  enemy-tentacle.webp       the dormant shell (frame 0001, its tentacle tucked inside the dark mouth), cropped to its bbox.
                            The limb that reaches out of the mouth is drawn in code (it has to reach any point).
  enemy-tentacle-card.webp  the rising frame (0007), cropped, for the journal card.
  enemy-tentacle.json       {w, h, mouth: [u, v], eyes: [[u, v], [u, v]], eyeR: [r, r]} in fractions of the shell crop, so
                            the code knows where the limb leaves the shell and where the eyes sit (it lids them when dormant).

Usage: python bake_clamissaint.py [--src <frames dir>] [--out <play/assets dir>]
"""
import argparse
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))

# measured on a 4x enlargement of frame 0001 cropped at (405, 420)
MOUTH_PX = (191.5, 89.0)           # centre of the dark opening, in that crop's pixels
EYES_PX = [(94.0, 130.0), (144.0, 131.5)]
EYE_R_PX = [17.0, 22.0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.join(ROOT, 'octomancer-web', 'harvest', 'Assets', 'Sprites', 'Animations', 'Clamissaint'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'site', 'octomancer', 'play', 'assets'))
    a = ap.parse_args()

    def frame(n):
        return Image.open(os.path.join(a.src, 'Clamissaint%04d.webp' % n)).convert('RGBA')

    shell = frame(1)
    bb = shell.getchannel('A').getbbox()
    shell = shell.crop(bb)
    w, h = shell.size
    shell.save(os.path.join(a.out, 'enemy-tentacle.webp'), 'WEBP', lossless=True, quality=100, method=6)

    card = frame(7)
    card = card.crop(card.getchannel('A').getbbox())
    card.save(os.path.join(a.out, 'enemy-tentacle-card.webp'), 'WEBP', lossless=True, quality=100, method=6)

    ox, oy = 405 - bb[0], 420 - bb[1]  # the measuring crop's origin relative to the shell crop
    info = {
        'w': w, 'h': h,
        'mouth': [round((MOUTH_PX[0] + ox) / w, 4), round((MOUTH_PX[1] + oy) / h, 4)],
        'eyes': [[round((x + ox) / w, 4), round((y + oy) / h, 4)] for x, y in EYES_PX],
        'eyeR': [round(r / w, 4) for r in EYE_R_PX],
    }
    with open(os.path.join(a.out, 'enemy-tentacle.json'), 'w') as f:
        json.dump(info, f)
    for n in ('enemy-tentacle.webp', 'enemy-tentacle-card.webp', 'enemy-tentacle.json'):
        print(n, os.path.getsize(os.path.join(a.out, n)), 'bytes')
    print(info)


if __name__ == '__main__':
    main()
