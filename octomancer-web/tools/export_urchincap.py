"""Key the generated Urchin Cap (on flat magenta) into the item sprite.

    python export_urchincap.py <generated.png> <site/octomancer/play/img/v2/item-urchincap.webp>
"""
import sys
from PIL import Image
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
m = np.clip((np.minimum(r, b) - g - 40) / 120.0, 0, 1)  # magenta-ness: high r and b, low g
spill = np.clip(np.minimum(r, b) - g, 0, None) * m       # pull the magenta out of edge pixels
im[..., 0] = np.clip(r - spill, 0, 255)
im[..., 2] = np.clip(b - spill, 0, 255)
im[..., 3] = (1 - m) * 255
out = Image.fromarray(im.astype(np.uint8), 'RGBA')
out = out.crop(out.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
w = 192
out = out.resize((w, round(out.height * w / out.width)), Image.LANCZOS)
out.save(dst, 'WEBP', quality=90, method=6)
print(out.size)
