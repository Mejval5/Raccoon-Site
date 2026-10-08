"""Journal plate for the fish-bone wall (img/journal/prop-fishbone.webp, 256 px): a rounded block of the material the
way the wall bake draws it (silt fill, keyed bone texture, cool tint, dark rim) with a crumbled notch and a few shards.
python journal_fishbone.py  (run from anywhere)"""
import os
from PIL import Image, ImageDraw, ImageFilter

PLAY = os.path.join(os.path.dirname(__file__), '..', '..', 'site', 'octomancer', 'play')
tex = Image.open(os.path.join(PLAY, 'img', 'v2', 'mat-fishbone.webp')).convert('RGBA')
S = 256
block = Image.new('RGBA', (S, S), (68, 70, 78, 255))
t = tex.resize((300, 300), Image.LANCZOS)
block.alpha_composite(t, (-20, -20))
block = Image.alpha_composite(block, Image.new('RGBA', (S, S), (34, 46, 70, 56)))
mask = Image.new('L', (S, S), 0)
d = ImageDraw.Draw(mask)
d.rounded_rectangle((28, 36, 228, 226), radius=26, fill=255)
d.ellipse((170, 20, 250, 100), fill=0)  # a bite crumbled out of one corner
out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
out.paste(block, (0, 0), mask)
rim = mask.filter(ImageFilter.MaxFilter(9))
edge = Image.new('RGBA', (S, S), (24, 28, 38, 255))
base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
base.paste(edge, (0, 0), rim)
base.alpha_composite(out)
dd = ImageDraw.Draw(base)
for (x0, y0, x1, y1) in [(206, 30, 222, 22), (226, 62, 240, 70), (196, 8, 204, 22), (238, 40, 250, 34)]:
    dd.line((x0, y0, x1, y1), fill=(42, 42, 48, 255), width=7)
    dd.line((x0, y0, x1, y1), fill=(201, 194, 168, 255), width=3)
base.save(os.path.join(PLAY, 'img', 'journal', 'prop-fishbone.webp'), quality=90)
print('ok')
