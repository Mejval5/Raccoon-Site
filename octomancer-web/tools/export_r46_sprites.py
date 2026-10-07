"""Round 46 art pass: build play/img/v2/sprites.webp (one packed atlas) and play/js/sprite-atlas.js (its rect table).

Sources:
  * Milan's own art from octomancer-web/harvest/ (Quill = OctoBG1 recoloured, Pip = FishGreen, Pip's mother = FishYellow
    recoloured, the pool host = SeaHorse, the heart = UI/Heart, the bubble = Elements/BubbleSingle);
  * generated sheets, "generated, Milan style", in octomancer-web/art-src/r46/*.webp (made with the openai-image-gen skill on
    a flat magenta or green background; keyed to alpha here, cut into sprites by empty rows/columns).
Every sprite is sized for its on-screen size at DPR 2 (ppu 144 device px on a 1440 px desktop window). Run from the repo root:
    python octomancer-web/tools/export_r46_sprites.py
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
HARV = os.path.join(ROOT, 'octomancer-web', 'harvest')
SRC = os.path.join(ROOT, 'octomancer-web', 'art-src', 'r46')
PLAY = os.path.join(ROOT, 'site', 'octomancer', 'play')


def key_and_cut(path):
    """A generated sheet -> its sprites (RGBA, trimmed), top-to-bottom then left-to-right."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    corner = im[:8, :8].reshape(-1, 3).mean(0)
    magenta = corner[0] > 180 and corner[2] > 180 and corner[1] < 90
    m = (np.minimum(R, B) - G) if magenta else (G - np.maximum(R, B))
    alpha = 1 - np.clip((m - 70.0) / 130.0, 0, 1)
    spill = np.clip((m - 20) / 180, 0, 1)
    out = im.copy()
    if magenta:
        cap = G + 20
        out[..., 0] = np.where(spill > 0, np.minimum(R, cap + (R - cap) * (1 - spill)), R)
        out[..., 2] = np.where(spill > 0, np.minimum(B, cap + (B - cap) * (1 - spill)), B)
    else:
        cap = np.maximum(R, B) + 10
        out[..., 1] = np.where(spill > 0, np.minimum(G, cap + (G - cap) * (1 - spill)), G)
    edge = (alpha > 0.02) & (alpha < 0.98)
    out[edge] = out[edge] * 0.55  # the soft rim goes towards the dark outline: no light halo on the dark water
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    mask = alpha > 0.5

    def spans(occ, gap=30):
        res, i, n = [], 0, len(occ)
        while i < n:
            if not occ[i]:
                i += 1; continue
            j = i
            while j < n:
                if occ[j]:
                    j += 1; continue
                k = j
                while k < n and not occ[k]:
                    k += 1
                if k - j >= gap or k == n:
                    break
                j = k
            res.append((i, j)); i = j
        return res

    boxes = []

    def cut(y0, y1, x0, x1, axis, depth=0):
        sub = mask[y0:y1, x0:x1]
        occ = (sub.sum(1) > 2) if axis == 0 else (sub.sum(0) > 0)
        sp = spans(occ)
        if len(sp) == 1 and depth > 0:
            a, b = sp[0]
            other = (sub.sum(0) > 0) if axis == 0 else (sub.sum(1) > 2)
            if len(spans(other)) == 1:
                boxes.append((y0 + a, y0 + b, x0, x1) if axis == 0 else (y0, y1, x0 + a, x0 + b)); return
        for a, b in sp:
            if axis == 0: cut(y0 + a, y0 + b, x0, x1, 1, depth + 1)
            else: cut(y0, y1, x0 + a, x0 + b, 0, depth + 1)

    cut(0, mask.shape[0], 0, mask.shape[1], 0)
    boxes.sort(key=lambda r: (round(r[0] / 300), r[2]))
    pieces = []
    for (y0, y1, x0, x1) in boxes:
        if (x1 - x0) * (y1 - y0) < 3000: continue
        img = Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')
        pieces.append(img.crop(img.getbbox()))
    return pieces


def hue(img, shift, sat=1.0, val=1.0):
    """Rotate the hue of an RGBA image (0..1 of the circle), scale saturation and value."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255
    hsv = np.asarray(img.convert('RGB').convert('HSV')).astype(np.float32)
    hsv[..., 0] = (hsv[..., 0] + shift * 255) % 255
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    rgb = np.asarray(Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255
    return Image.fromarray((np.dstack([rgb, a[..., 3:]]) * 255).astype(np.uint8), 'RGBA')


def milan(rel):
    im = Image.open(os.path.join(HARV, rel)).convert('RGBA')
    return im.crop(im.getbbox())


def fit(img, w=None, h=None):
    """Scale to width w or height h (never up past the source), Lanczos."""
    k = (w / img.width) if w else (h / img.height)
    k = min(k, 1.0)
    return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)


marlo = key_and_cut(os.path.join(SRC, 'gen01-marlo.webp'))      # idle, waving, tank
loot = key_and_cut(os.path.join(SRC, 'gen02-loot.webp'))        # giant clam shut, giant clam open, amphora, small clam, idol
cage = key_and_cut(os.path.join(SRC, 'gen03-cage.webp'))        # cage, broken cage, standing stone
items = key_and_cut(os.path.join(SRC, 'gen04-items.webp'))      # flippers, lantern, lodestone, bomb bag
haz = key_and_cut(os.path.join(SRC, 'gen05-hazards.webp'))      # eel, spine strip, vent, anemone
assert len(marlo) == 3 and len(loot) == 5 and len(cage) == 3 and len(items) == 4 and len(haz) == 4, (len(marlo), len(loot), len(cage), len(items), len(haz))

S = {}
k = 160 / marlo[0].height                                          # Marlo: about 1.1 tiles tall; both poses at one scale
S['marlo'] = fit(marlo[0], h=160)
S['marloWave'] = marlo[1].resize((round(marlo[1].width * k), 160), Image.LANCZOS)
S['tank'] = fit(marlo[2], h=110)
k = 170 / loot[1].width                                            # the giant clam, shut and open at one scale
S['clamShut'] = loot[0].resize((round(loot[0].width * k), round(loot[0].height * k)), Image.LANCZOS)
S['clamOpen'] = loot[1].resize((170, round(loot[1].height * k)), Image.LANCZOS)
S['pot'] = fit(loot[2], h=120)
S['clam'] = fit(loot[3], w=120)
S['idol'] = fit(loot[4], h=140)
k = 250 / cage[0].width                                            # the cage, whole and broken at one scale
S['cage'] = cage[0].resize((250, round(cage[0].height * k)), Image.LANCZOS)
S['cageOpen'] = cage[1].resize((round(cage[1].width * k), round(cage[1].height * k)), Image.LANCZOS)
S['stone'] = fit(cage[2], h=130)
for name, im in zip(['flippers', 'lantern', 'magnet', 'bombbag'], items):
    S[name] = fit(im, w=160) if im.width >= im.height else fit(im, h=160)
S['eel'] = fit(haz[0], h=240)
S['spines'] = fit(haz[1], w=432)
S['vent'] = fit(haz[2], h=130)
S['anemone'] = fit(haz[3], w=170)
# Milan's own art
S['quill'] = fit(hue(milan('Assets/Sprites/IntroScreen/OctoBG1.webp'), 0.76, 0.45, 0.88), h=190)
S['pip'] = milan('Assets/Sprites/IntroScreen/FishGreen.webp')
S['pipMama'] = hue(milan('Assets/Sprites/IntroScreen/FishYellow.webp'), -0.07, 1.0, 1.0)
S['host'] = fit(milan('Assets/Sprites/IntroScreen/SeaHorse.webp'), h=176)
heart = milan('D-kept/Assets/Sprites/UI/Heart.webp')
bubble = milan('Assets/Sprites/Elements/BubbleSingle.webp')
# the heart container: Milan's heart inside Milan's bubble
hc = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
b = bubble.resize((160, round(bubble.height * 160 / bubble.width)), Image.LANCZOS)
h = fit(heart, w=100)
hc.alpha_composite(h, ((160 - h.width) // 2, (160 - h.height) // 2 + 4))
hc.alpha_composite(b.crop((0, 0, 160, min(160, b.height))), (0, (160 - min(160, b.height)) // 2))
S['heartcontainer'] = hc.crop(hc.getbbox())
S['heart'] = fit(heart, w=100)

# shelf packing, tallest first, into a 1024 wide sheet
order = sorted(S, key=lambda n: -S[n].height)
W, PAD = 1024, 2
x = y = row_h = 0
rects = {}
for n in order:
    im = S[n]
    if x + im.width + PAD > W:
        x, y, row_h = 0, y + row_h + PAD, 0
    rects[n] = [x, y, im.width, im.height]
    x += im.width + PAD
    row_h = max(row_h, im.height)
H = y + row_h
sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for n, (rx, ry, rw, rh) in rects.items():
    sheet.alpha_composite(S[n], (rx, ry))
out = os.path.join(PLAY, 'img', 'v2', 'sprites.webp')
sheet.save(out, quality=88, method=6, alpha_quality=90)
js = os.path.join(PLAY, 'js', 'sprite-atlas.js')
with open(js, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Generated by octomancer-web/tools/export_r46_sprites.py: the rects [x, y, w, h] of img/v2/sprites.webp. Do not edit.\n')
    f.write('export const ATLAS_RECTS = ' + json.dumps(rects, separators=(',', ':')).replace('],"', '],\n  "').replace('{"', '{\n  "').replace(']}', '],\n}') + ';\n')
print('sheet', W, H, os.path.getsize(out), 'bytes')
for n in order: print(n, rects[n])
