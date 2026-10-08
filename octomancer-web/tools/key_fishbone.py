"""Key the magenta out of the generated fish-bone texture, despill, make it seamless (offset copy laid under the
original, the original faded out towards the edges), and save a 512 px webp with alpha. python key.py in.png out.webp"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255.0
r, g, b = im[..., 0], im[..., 1], im[..., 2]
# magenta-ness: how far R and B sit above G
mag = np.clip(np.minimum(r, b) - g, 0, 1)
alpha = 1.0 - np.clip((mag - 0.12) / 0.25, 0, 1)
# despill: pull R and B down to at most G + a little where magenta bleeds in
spill = np.clip(np.minimum(r, b) - g, 0, 1)
r2 = r - spill * 1.0
b2 = b - spill * 1.0
rgb = np.stack([r2, g, b2], -1)
# shrink alpha one pixel to drop the magenta fringe, soften
a_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
alpha = np.asarray(a_img).astype(np.float32) / 255.0
H, W = alpha.shape
rgba = np.concatenate([rgb, alpha[..., None]], -1)
# seamless: B = A rolled by half; out = A (alpha * w) over B; w is 0 at the tile edges, 1 inside
B = np.roll(np.roll(rgba, H // 2, 0), W // 2, 1)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
d = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / W
w = np.clip((d - 0.06) / 0.12, 0, 1)
w = w * w * (3 - 2 * w)
aA = rgba[..., 3] * w
aB = B[..., 3]
aO = aA + aB * (1 - aA)
cO = (rgba[..., :3] * aA[..., None] + B[..., :3] * (aB * (1 - aA))[..., None]) / np.maximum(aO, 1e-4)[..., None]
out = np.concatenate([cO, aO[..., None]], -1)
img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA').resize((512, 512), Image.LANCZOS)
img.save(dst, quality=88, method=6)
# a 2x2 tiling preview over a dark fill, to check the seams
prev = Image.new('RGBA', (1024, 1024), (46, 52, 60, 255))
for oy in (0, 512):
    for ox in (0, 512):
        prev.alpha_composite(img, (ox, oy))
prev.convert('RGB').save(dst.rsplit('.', 1)[0] + '-tiled.png')
print('ok', img.size)
