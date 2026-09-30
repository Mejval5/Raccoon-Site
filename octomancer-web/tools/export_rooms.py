"""Export the 18 Octomancer room bitmaps to play/data/rooms.json (M1-1).

Usage: python export_rooms.py [rooms_dir] [out_json]
Defaults: octomancer-unity/Assets/Sprites/Tilemap/WorldGen/Rooms and
site/octomancer/play/data/rooms.json (paths relative to the repo root).

Thresholds follow ProceduralMapBuilder.cs:594 (green portal marker) and
TilemapLevelBuilder.cs:104 (max channel <= 0.2 is rock). Unity textures have
row 0 at the bottom, and our game descends, so the rows are written bottom-first:
JSON row 0 is the bottom row of the PNG. That is the same vertical mirror
SmartRooms calls TopToBottom.

Cells: '#' rock, '.' water, 'P' portal marker (green pixel, counts as water).
Output is plain JSON strings, no Unity file is copied.
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, 'octomancer-unity', 'Assets', 'Sprites', 'Tilemap', 'WorldGen', 'Rooms')
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    ROOT, 'site', 'octomancer', 'play', 'data', 'rooms.json')


def cell(p):
    r, g, b, a = [v / 255 for v in p]
    if g > .8 and r < .2 and b < .2 and a > .8:
        return 'P'
    return '#' if max(r, g, b) <= .2 else '.'


out = []
for n in [str(i) for i in range(16)] + ['Building', 'Pool']:
    im = Image.open(os.path.join(SRC, n + '.png')).convert('RGBA')
    w, h = im.size
    assert (w, h) == (10, 16), (n, w, h)
    cells = [''.join(cell(im.getpixel((x, y))) for x in range(w)) for y in range(h - 1, -1, -1)]
    # kind: Pool.png is reserved for the rest-pool special (M5); the rest are normal rooms.
    out.append({'id': 'octo-' + n, 'w': w, 'h': h, 'flip': 'hv', 'weight': 1,
                'kind': 'pool' if n == 'Pool' else 'room', 'cells': cells})

os.makedirs(os.path.dirname(DST), exist_ok=True)
with open(DST, 'w', newline='\n') as f:
    json.dump(out, f, indent=1)
    f.write('\n')
print('wrote', DST, len(out), 'rooms')
for r in out:
    print(r['id'], 'P=%d' % sum(row.count('P') for row in r['cells']))
