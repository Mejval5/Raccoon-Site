"""Round 46: the before/after sheet of every replaced item at in-game scale (desktop, ppu 72), each pair next to the octopus and a
piranha at the same scale. Inputs are the gallery figures (tests/art-gallery.html, octomancer-web/night/r46-art/{before,after}-*.png)
and in-game crops (game-{before,after}-*-dpr1.png). Output: octomancer-web/night/r46-art/before-after.webp"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = os.path.join(ROOT, 'octomancer-web', 'night', 'r46-art')
PLAY = os.path.join(ROOT, 'site', 'octomancer', 'play')
PPU = 72

hub = Image.open(os.path.join(D, 'game-after-hub-dpr1.png')).convert('RGB')
octo = hub.crop((690, 408, 752, 480))                          # the octopus in the hub screenshot, at ppu 72
pir = Image.open(os.path.join(PLAY, 'assets', 'enemy-piranha.webp')).convert('RGBA')
pir = pir.resize((round(1.15 * PPU), round(1.15 * PPU * pir.height / pir.width)), Image.LANCZOS)

GAL = ['quill-collector-', 'quill-lantern', 'marlo-hub-freed-', 'marlo-sealed-', 'pip-caged', 'pip-free-broken-cage', 'pip-mama-caged', 'marlo-tank',
       'pool-host-die-idle-', 'pool-wager-on-', 'pool-prize-won-', 'clam-pot', 'chest-closed-open', 'chest-trap-rattle-burst', 'relic-on-pedestal',
       'hidden-pocket-cue', 'pocket-bomb-heart-item', 'items-pocket-size-r-0-3-', 'items-hud-r-15-px-', 'spike-wall-floor-', 'current-jet',
       'eel-calm-charging-', 'anemone']
GAME = ['hub-quill', 'shop', 'pool', 'chest', 'relic', 'jet', 'spikes', 'eel', 'anemone', 'clam', 'pot']
pairs = [(n, os.path.join(D, 'before-' + n + '.png'), os.path.join(D, 'after-' + n + '.png')) for n in GAL]
pairs += [('in game: ' + n, os.path.join(D, 'game-before-' + n + '-dpr1.png'), os.path.join(D, 'game-after-' + n + '-dpr1.png')) for n in GAME]
pairs.append(('journal plates', os.path.join(D, 'before-journal-plates.png'), os.path.join(D, 'after-journal-plates.png')))
# r46 x damage model: hostile and corpse looks exist only after the art pass (shown alone)
for n in ['hostile-marlo-aiming-pip', 'hostile-quill-host', 'corpses-marlo-pip-quill-host-']:
    pairs.append(('after only: ' + n, None, os.path.join(D, 'after-' + n + '.png')))
pairs = [p for p in pairs if (p[1] is None or os.path.exists(p[1])) and os.path.exists(p[2])]

REF_W = 100
blocks = []
for name, b, a in pairs:
    ai = Image.open(a).convert('RGB'); bi = Image.open(b).convert('RGB') if b else Image.new('RGB', (1, ai.height), (14, 28, 40))
    w = REF_W + bi.width + ai.width + 16
    h = max(bi.height, ai.height, octo.height + pir.height + 10) + 22
    blk = Image.new('RGB', (w, h), (14, 28, 40))
    dr = ImageDraw.Draw(blk)
    dr.text((4, 3), name + '   (left: before, right: after; octopus and piranha at the same scale)', fill=(240, 230, 200))
    blk.paste(octo, (8, 22))
    blk.paste(pir, (8, 22 + octo.height + 8), pir)
    blk.paste(bi, (REF_W, 22)); blk.paste(ai, (REF_W + bi.width + 8, 22))
    blocks.append(blk)

W = max(1500, max(b.width for b in blocks))
x = y = rh = 0
pos = []
for blk in blocks:
    if x and x + blk.width > W:
        x, y, rh = 0, y + rh + 6, 0
    pos.append((x, y)); x += blk.width + 6; rh = max(rh, blk.height)
sheet = Image.new('RGB', (W, y + rh), (6, 12, 18))
for blk, p in zip(blocks, pos):
    sheet.paste(blk, p)
out = os.path.join(D, 'before-after.webp')
sheet.save(out, quality=88, method=6)
print(out, sheet.size, len(blocks), 'pairs')
