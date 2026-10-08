"""Build site/octomancer/play/data/hub.json and tutorial.json (authored ASCII maps).

Legend: '#' rock, '.' water, 'S' start, 'E' exit (the dive entrance in the hub),
'L' Quill's perch (hub only; the journal board 'J' was removed 2026-10-08), 'Q' quest sign (hub only), 'W' a breakable wall tile (rock; the tutorial bomb wall).
Everything is rock outside the carved shapes; a 2 tile bedrock border is kept by the loader.
Run: python octomancer-web/tools/build_authored_maps.py
"""
import json, math, os

out_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'site', 'octomancer', 'play', 'data'))


def grid(w, h):
    return [['#'] * w for _ in range(h)]


def ellipse(g, cx, cy, rx, ry):
    for y in range(len(g)):
        for x in range(len(g[0])):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                g[y][x] = '.'


def rect(g, x0, y0, x1, y1, ch='.'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = ch


def border(g):
    h, w = len(g), len(g[0])
    for y in range(h):
        for x in range(w):
            if x < 2 or y < 2 or x >= w - 2 or y >= h - 2:
                g[y][x] = '#'


def shave(g):
    # fill water cells with 3+ rock sides (one-cell tips of ellipses), keep markers
    h, w = len(g), len(g[0])
    for _ in range(3):
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if g[y][x] != '.':
                    continue
                n = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if g[y + dy][x + dx] in '#W')
                if n >= 3:
                    g[y][x] = '#'


def rows(g):
    return [''.join(r) for r in g]


# ---------------------------------------------------------------- hub 34 x 24
hub = grid(34, 24)
ellipse(hub, 16.5, 10.2, 14.6, 7.8)
rect(hub, 0, 16, 33, 23, '#')            # flat floor at row 16
# the dive well: a shaft under the middle of the floor ending in a small pool
rect(hub, 15, 16, 18, 20)
rect(hub, 14, 19, 19, 21)
# stalactites and floor mounds (all at least 2 thick)
rect(hub, 9, 3, 10, 6, '#')
rect(hub, 23, 3, 24, 5, '#')
rect(hub, 7, 14, 10, 15, '#'); rect(hub, 8, 13, 9, 13, '#')
rect(hub, 24, 14, 28, 15, '#'); rect(hub, 25, 13, 27, 13, '#')
# alcove on the left with a rock lip
rect(hub, 4, 9, 5, 13)
border(hub)
shave(hub)
hub[12][9] = 'L'      # Quill's perch, above the left mound (the journal board beside it was removed 2026-10-08)
hub[12][26] = 'Q'      # quest sign, standing on top of the right mound in open water (round 23)
hub[12][22] = 'S'
hub[21][16] = 'E'     # the dive entrance, ring on the floor of the well
hub_json = {
    'id': 'hub', 'name': 'The Hub', 'rows': rows(hub),
    'prompts': [
        {'x': 19, 'y': 12, 'r': 10, 'title': 'Welcome to the Shallows',
         'desktop': 'Swim into the glowing ring in the floor to dive. Press Tab or I (or open the pause menu) to read your journal.',
         'touch': 'Swim into the glowing ring in the floor to dive. Tap pause, then Journal, to read your journal.'},
    ],
    'spawns': [{'type': 'plankton-swarm', 'x': 26.5, 'y': 9.5, 'count': 6}],
}

# ---------------------------------------------------------------- tutorial 64 x 24
tut = grid(64, 24)
ellipse(tut, 11.5, 12.5, 9.8, 7.5)          # A: start cave
rect(tut, 18, 11, 34, 14)                   # B: dash corridor
ellipse(tut, 36.5, 12.5, 5.5, 7.0)          # C: the cave in front of the bomb wall
ellipse(tut, 47.5, 12.5, 6.5, 7.0)          # D: the cave behind it
rect(tut, 52, 11, 58, 14)                   # E: last corridor
ellipse(tut, 59.5, 12.5, 3.2, 4.2)          # F: exit cave
# pillars (2x2 or bigger) so the caves are not empty rooms
rect(tut, 8, 9, 9, 11, '#'); rect(tut, 14, 14, 16, 16, '#')
rect(tut, 25, 11, 26, 12, '#'); rect(tut, 29, 13, 30, 14, '#')
rect(tut, 34, 16, 36, 17, '#'); rect(tut, 47, 5, 49, 7, '#'); rect(tut, 46, 17, 48, 19, '#')
# the bomb wall: two thick, floor to ceiling
rect(tut, 40, 2, 41, 21, '#')
for y in range(6, 19):
    tut[y][40] = 'W'; tut[y][41] = 'W'
border(tut)
shave(tut)
tut[13][5] = 'S'
tut[12][60] = 'E'
tut_json = {
    'id': 'tutorial', 'name': 'Tutorial', 'rows': rows(tut),
    'prompts': [
        {'x': 7, 'y': 12.5, 'r': 7, 'title': 'Swim',
         'desktop': 'Use WASD or the arrow keys, or hold the mouse button to swim toward the cursor.',
         'touch': 'Touch and drag on the left of the screen to swim.'},
        {'x': 25, 'y': 12.5, 'r': 7, 'title': 'Dash',
         'desktop': 'Press Z, Shift or Enter, or right-click, for a burst of speed.',
         'touch': 'Tap the Dash button for a burst of speed.'},
        {'x': 35.5, 'y': 12.5, 'r': 5.6, 'title': 'Bomb the wall', 'refillBomb': True,
         'desktop': 'This wall is in the way. Swim up to it and place a bomb: Space or X, or middle-click. Then swim away, the blast hurts you too.',
         'touch': 'This wall is in the way. Swim up to it and tap Bomb, then swim away: the blast hurts you too.'},
        {'x': 52, 'y': 12.5, 'r': 8, 'title': 'The exit',
         'desktop': 'Swim into the glowing ring to finish the tutorial.',
         'touch': 'Swim into the glowing ring to finish the tutorial.'},
    ],
    'spawns': [{'type': 'plankton-swarm', 'x': 29.5, 'y': 12.5, 'count': 6},
               {'type': 'plankton-swarm', 'x': 47.5, 'y': 11.5, 'count': 7}],
}

for name, data in (('hub', hub_json), ('tutorial', tut_json)):
    width = len(data['rows'][0])
    assert all(len(r) == width for r in data['rows']), name
    with open(os.path.join(out_dir, name + '.json'), 'w', encoding='utf8') as f:
        json.dump(data, f, indent=1)
    print(name, width, 'x', len(data['rows']))
