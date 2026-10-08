"""Round 3 art pass: build play/img/v2/sprites-r3.webp (one packed atlas) and play/js/sprite-atlas-r3.js (rects + anchors).

Paints the last code-drawn leftovers: the giant clam enemy (cup, lid, cavity, pearl: the lid still turns about the hinge in
code), the tentacle limb (Milan's own limb from Clamissaint frame 0025, unbent into a straight strip that the code bends
along its curve), juice droplets, ink-cloud puffs, the bomb (a volcanic nodule, cool and about-to-burst), the tutorial bomb
marker (a carved glyph), and the Ink Cloud and jar icons.

Sources:
  * Milan's Clamissaint frames in octomancer-web/harvest/Assets/Sprites/Animations/Clamissaint (the limb strip);
  * generated sheets, "generated, Milan style", in octomancer-web/art-src/r3/*.webp (openai-image-gen skill, gpt-image-2,
    quality medium, edit with a contact sheet of Milan's sprites; the API refuses transparent backgrounds, so they are on
    flat magenta (#FF00FF), keyed and despilled here, or on flat green (#00FF00) for the translucent ink, unmixed here).
Sized for DPR 2 at the game's desktop scale (144 device px per tile). Run from the repo root:
    python octomancer-web/tools/export_r3_art.py
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
HARV = os.path.join(ROOT, 'octomancer-web', 'harvest')
SRC = os.path.join(ROOT, 'octomancer-web', 'art-src', 'r3')
PLAY = os.path.join(ROOT, 'site', 'octomancer', 'play')


def key_magenta(path):
    """A generated sheet on flat magenta -> RGBA with the key removed, the soft rim darkened (no light halo), despilled."""
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


def unmix_green(path):
    """A translucent dark subject on flat green: alpha from how far a pixel is from the key, colour unmixed from the key."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    m = G - np.maximum(R, B)                          # 255 on the key, about -19 on the ink
    a = np.clip((255.0 - m) / 274.0, 0, 1)
    a = np.clip((a - 0.06) / 0.94, 0, 1)              # webp noise on the key -> 0
    K = np.array([0, 255, 0], np.float32)
    col = (im - (1 - a[..., None]) * K) / np.maximum(a[..., None], 1e-3)
    col = np.clip(col, 0, 255)
    col[..., 1] = np.minimum(col[..., 1], np.maximum(col[..., 0], col[..., 2]))  # no green left in the ink
    ink = np.array([34, 24, 58], np.float32)            # thin wisps take the ink's own violet, not a grey-blue fringe
    k = np.clip(a / 0.6, 0, 1)[..., None]
    col = ink + (col - ink) * k
    return np.dstack([col, a * 255]).astype(np.uint8)


def crop(rgba, box, thr=8):
    img = Image.fromarray(rgba[box[1]:box[3], box[0]:box[2]], 'RGBA')
    a = img.getchannel('A').point(lambda v: 255 if v > thr else 0)
    return img.crop(a.getbbox())


def fit(img, w=None, h=None):
    k = (w / img.width) if w else (h / img.height)
    return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)


def tone(img, mask_fn, val=1.0, sat=1.0):
    """Scale value / saturation of the pixels mask_fn(rgb) picks."""
    a = np.asarray(img).astype(np.float32)
    rgb = a[..., :3]
    sel = mask_fn(rgb)
    grey = rgb.mean(-1, keepdims=True)
    adj = (grey + (rgb - grey) * sat) * val
    a[..., :3] = np.where(sel[..., None], adj, rgb)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


S, META = {}, {}

# ---------------------------------------------------------------- giant clam (gen01): cup, lid, cavity, pearl
g1 = key_magenta(os.path.join(SRC, 'gen01-gclam.webp'))
cup = crop(g1, (40, 240, 760, 430))
lid = crop(g1, (760, 160, 1490, 420))
cav = crop(g1, (40, 610, 800, 840))
pearl = crop(g1, (830, 680, 970, 810))


def rim_row(img, top):
    """The row (fraction of the height) through the middle of the teal mantle lip along the straight edge."""
    a = np.asarray(img).astype(np.int32)
    teal = (a[..., 1] > a[..., 0] + 30) & (a[..., 2] > a[..., 0] + 10) & (a[..., 3] > 200)
    rows = np.where(teal.sum(1) > img.width * 0.3)[0]
    r = rows[:len(rows) // 2 + 1].mean() if top else rows[len(rows) // 2:].mean()
    return round(float(r) / img.height, 4)


CLAM_W = 288   # 1.84 tiles (2 * RX) + outline at 144 px per tile, plus a little
S['gclamCup'] = fit(cup, w=CLAM_W)
S['gclamLid'] = fit(lid, w=CLAM_W)
S['gclamCavity'] = fit(cav, w=CLAM_W)
S['gclamPearl'] = fit(pearl, w=56)
META['gclamCup'] = {'rimV': rim_row(S['gclamCup'], True)}
META['gclamLid'] = {'rimV': rim_row(S['gclamLid'], False)}

# ---------------------------------------------------------------- tentacle limb (Milan, Clamissaint 0025, unbent)


def limb_strip():
    im = np.asarray(Image.open(os.path.join(HARV, 'Assets', 'Sprites', 'Animations', 'Clamissaint', 'Clamissaint0025.webp')).convert('RGBA')).astype(np.float32)[415:603, 411:843]
    im[..., :3] *= im[..., 3:4] / 255
    a = im[..., 3]
    h, w = a.shape

    def samp(SX, SY):
        x0 = np.floor(SX).astype(int); y0 = np.floor(SY).astype(int); fx = SX - x0; fy = SY - y0
        out = np.zeros(SX.shape + (4,), np.float32)
        for dy in (0, 1):
            for dx in (0, 1):
                xx, yy = x0 + dx, y0 + dy
                ok = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
                wgt = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * ok
                out += im[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)] * wgt[..., None]
        return out
    xs, cs = [], []
    for x in range(232, 412):
        ya = np.where(a[:, x] > 128)[0]; xs.append(x); cs.append((ya.min() + ya.max()) / 2)
    p = np.polyfit(xs, cs, 4)                                      # the limb's centre line
    X = np.linspace(196, 450, 3000); Y = np.polyval(p, X)
    s = np.concatenate([[0], np.cumsum(np.hypot(np.diff(X), np.diff(Y)))])
    N = int(s[-1]); su = np.linspace(0, s[-1], N)
    cx = np.interp(su, s, X); cy = np.interp(su, s, Y)
    tx = np.gradient(cx); ty = np.gradient(cy); tl = np.hypot(tx, ty); tx /= tl; ty /= tl
    v = np.arange(120) - 60 + 0.5
    out = samp(cx[None, :] - ty[None, :] * v[:, None], cy[None, :] + tx[None, :] * v[:, None])
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 0, out[..., :3] * 255 / np.maximum(al, 1e-3), 0)
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')
    img = img.crop((20, 0, img.width, img.height))                 # the base end that was under the shell's lip
    return img.crop(img.getchannel('A').point(lambda q: 255 if q > 8 else 0).getbbox())


S['tentLimb'] = limb_strip()       # base on the left, rounded tip on the right; native size (about 64 px across at 0.34 tile)

# ---------------------------------------------------------------- bomb and the tutorial marker (gen02)
g2 = key_magenta(os.path.join(SRC, 'gen02-bomb.webp'))
bomb = crop(g2, (40, 240, 470, 750))
hot = crop(g2, (540, 240, 970, 750))
mark = crop(g2, (1030, 290, 1470, 745))
# the glow in the cracks: dull it (Daniel: natural, nothing flashy)
hot = tone(hot, lambda c: (c[..., 0] > 150) & (c[..., 0] - c[..., 2] > 90), val=0.82, sat=0.7)
S['bomb'] = fit(bomb, h=128)
S['bombHot'] = fit(hot, h=128)
S['bombMark'] = fit(mark, h=192)


def bomb_meta(img):
    """Body centre and radius (fractions of width / height) and the fuse tip, from the alpha: the body is the widest blob."""
    a = np.asarray(img)[..., 3] > 128
    rows = a.sum(1)
    body = np.where(rows > rows.max() * 0.55)[0]
    cy = (body.min() + body.max()) / 2
    r = rows.max() / 2
    cols = np.where(a[body.min():body.max()].any(0))[0]
    cx = (cols.min() + cols.max()) / 2
    top = np.where(a.any(1))[0].min()
    tipx = np.where(a[top + 2])[0].mean()
    return {'cu': round(cx / img.width, 4), 'cv': round(cy / img.height, 4), 'ru': round(r / img.width, 4),
            'tipU': round(float(tipx) / img.width, 4), 'tipV': round((top + 4) / img.height, 4)}


META['bomb'] = bomb_meta(S['bomb'])
META['bombHot'] = bomb_meta(S['bombHot'])

# ---------------------------------------------------------------- droplets, Ink Cloud icon, jar (gen03)
g3 = key_magenta(os.path.join(SRC, 'gen03-icons.webp'))
for i, box in enumerate([(180, 140, 380, 320), (510, 110, 700, 330), (800, 110, 1050, 330), (1160, 130, 1360, 320)]):
    S['juiceDrop%d' % i] = fit(crop(g3, box), h=64)
S['iconInkCloud'] = fit(crop(g3, (220, 450, 720, 900)), h=128)
jar = crop(g3, (870, 430, 1200, 910))
# the glass: its pale inside becomes see-through so the code's liquid shows behind it (highlights stay a bit stronger)
ja = np.asarray(jar).astype(np.float32)
lum = ja[..., :3].mean(-1)
sat = ja[..., :3].max(-1) - ja[..., :3].min(-1)
glass = (ja[..., 3] > 200) & (lum > 120) & (sat < 45)
ja[..., 3] = np.where(glass, 255 * np.clip(0.22 + (lum - 175) / 80 * 0.6, 0.22, 0.85), ja[..., 3])
jar = Image.fromarray(ja.astype(np.uint8), 'RGBA')
S['iconJar'] = fit(jar, h=128)
# the liquid box inside the glass (fractions), measured on the 128 px sprite: below the shoulder, inside the side walls
META['iconJar'] = {'u0': 0.05, 'u1': 0.89, 'v0': 0.36, 'v1': 0.92}

# ---------------------------------------------------------------- ink cloud puffs (gen04, translucent)
g4 = unmix_green(os.path.join(SRC, 'gen04-ink.webp'))
for i, box in enumerate([(0, 0, 768, 512), (768, 0, 1536, 512), (0, 512, 768, 1024), (768, 512, 1536, 1024)]):
    pc = crop(g4, box, thr=10)
    side = max(pc.width, pc.height)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.alpha_composite(pc, ((side - pc.width) // 2, (side - pc.height) // 2))
    S['inkPuff%d' % i] = fit(sq, w=224)

# ---------------------------------------------------------------- pack
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
out = os.path.join(PLAY, 'img', 'v2', 'sprites-r3.webp')
sheet.save(out, quality=88, method=6, alpha_quality=90)
js = os.path.join(PLAY, 'js', 'sprite-atlas-r3.js')


def dump(d):
    return '{\n' + ''.join('  %s: %s,\n' % (json.dumps(k), json.dumps(v, separators=(',', ':'))) for k, v in d.items()) + '}'


with open(js, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Generated by octomancer-web/tools/export_r3_art.py: the rects [x, y, w, h] of img/v2/sprites-r3.webp and anchors. Do not edit.\n')
    f.write('export const ATLAS_R3_RECTS = ' + dump(rects) + ';\n')
    f.write('export const ATLAS_R3_META = ' + dump(META) + ';\n')
print('sheet', W, H, os.path.getsize(out), 'bytes')
for n in order: print(n, rects[n], META.get(n, ''))
