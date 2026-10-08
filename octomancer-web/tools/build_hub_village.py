"""Build site/octomancer/play/data/hub.json: the hub as a cave village (72 x 44, about 2 x 2 screens at 1440 x 900).

Layout (Spelunky 2 Base Camp idea): a central plaza with the start and the Tutorial ring on a stone stage, a shaft down
to the dive chamber (the dive whirlpool E and the 1-2 shortcut ring R), and one room per person off the plaza:
  (R sits right of the dive E, T in Marlo's workshop)
  upper left   Quill's collection grotto   (door 'q', a kelp curtain while locked)
  upper right  Marlo's diving-bell workshop (door 'm', boarded up with timber while locked; his 1-3 ring T inside)
  lower left   Pip's family nook            (door 'p', open: an empty shell house until Pip moves in)
  lower right  the host's little arena      (door 'h', open: a dusty arena with the Ink Jet practice target G)
  bottom left  the shopkeeper's off-duty den (door 'k', rubble while locked), off the dive chamber
  a fish-bone wall (B) on the dive chamber's right hides a small hollow with a keepsake (y); 'L' is Quill's perch on the plaza floor
  the wardrobe alcove (A) beside the plaza floor (the skins owner hooks the picker there)
Room anchors (where the person stands): 'w' Marlo, 'n' Pip, 'g' Quill, 'r' host, 'd' keeper, 'z' the plaza. Doors, anchors, A, G and y
are water tiles; the loader (authored.js) lists them in level.points. data/hub-rooms.json says which door belongs to whom.
Run: python octomancer-web/tools/build_hub_village.py
"""
import json, os

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'site', 'octomancer', 'play', 'data', 'hub.json'))
W, H = 72, 44
g = [['#'] * W for _ in range(H)]


def ellipse(cx, cy, rx, ry, ch='.'):
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                g[y][x] = ch


def rect(x0, y0, x1, y1, ch='.'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = ch


def put(x, y, ch):
    assert g[y][x] in '.', (x, y, ch, g[y][x])
    g[y][x] = ch


# --- the plaza (start, tutorial stage) ---
ellipse(36, 12.5, 13.5, 7.6)
rect(22, 19, 50, 21, '#')           # its floor
rect(27, 15, 31, 18, '#')           # the stone stage under the Tutorial ring
rect(27, 14, 30, 14, '#')
rect(41, 4, 44, 6, '.')             # a little skylight chimney (plants hang in it)
# --- the shaft and the dive chamber ---
rect(34, 19, 38, 27)
ellipse(36, 31.5, 10.5, 5)
rect(27, 30, 45, 35)
rect(22, 36, 50, 41, '#')           # chamber floor
# --- Quill's grotto, upper left ---
ellipse(11.5, 8, 7.5, 4.2)
rect(6, 6, 17, 11)
rect(4, 12, 20, 13, '#')
rect(17, 8, 24, 11)                 # corridor to the plaza
# --- Marlo's workshop, upper right ---
ellipse(60.5, 8, 7.5, 4.2)
rect(54, 6, 66, 11)
rect(51, 12, 67, 13, '#')
rect(47, 8, 55, 11)
# --- Pip's nook, lower left ---
ellipse(12, 27.5, 8.5, 4.6)
rect(6, 25, 18, 30)
rect(4, 31, 21, 33, '#')
rect(19, 16, 26, 18)                # down from the plaza's lower left
rect(18, 19, 22, 26)
rect(17, 24, 20, 27)
# --- the host's arena, lower right ---
ellipse(60, 26.5, 8.5, 4.6)
rect(53, 24, 66, 29)
rect(50, 30, 67, 33, '#')
rect(48, 16, 53, 19)                # down from the plaza's lower right
rect(50, 19, 54, 26)
rect(52, 24, 55, 27)
# --- the keeper's den, bottom left, off the dive chamber ---
rect(10, 35, 21, 39)
ellipse(15.5, 37, 6.5, 3.2)
rect(21, 33, 27, 35)                # corridor from the chamber
rect(10, 40, 22, 41, '#')
# --- the fish-bone hollow, off the chamber's right ---
rect(48, 32, 51, 35)
rect(46, 33, 47, 35, 'B')
# --- the wardrobe alcove beside the plaza floor ---
rect(44, 16, 47, 18)

# markers
put(36, 10, 'S')
put(29, 13, 'U')                    # on the stage
put(36, 35, 'E')
put(41, 35, 'R')
put(36, 18, 'Q')                    # the plaza spot (residents without a room)
put(33, 18, 'z')                    # the plaza's own furnishings (lamps, pots)
put(46, 18, 'A')
for y in range(8, 12):
    for x in (19, 20): g[y][x] = 'q'
    for x in (50, 51): g[y][x] = 'm'
for y in range(23, 26):
    for x in (18, 19): g[y][x] = 'p'
    for x in (53, 54): g[y][x] = 'h'
for y in range(33, 36):
    for x in (22, 23): g[y][x] = 'k'
put(62, 11, 'T')
put(57, 11, 'w')                    # room anchors (lowercase: digits are the tutorial's coral doors)
put(12, 27, 'n')
put(10, 11, 'g')
put(62, 29, 'r')
put(15, 39, 'd')
put(57, 29, 'G')
put(50, 35, 'y')                    # the keepsake behind the fish bone
put(39, 18, 'L')                    # Quill's perch (authored.js quillX): where he stands while his grotto is not open

# the bedrock border stays rock
for y in range(H):
    for x in range(W):
        if x < 2 or y < 2 or x >= W - 2 or y >= H - 2:
            assert g[y][x] == '#', ('border', x, y)

with open(OUT, encoding='utf-8') as f:
    old = json.load(f)
hub = {
    'id': 'hub',
    'name': 'The Hub',
    'rows': [''.join(r) for r in g],
    'prompts': [
        {'x': 36, 'y': 12, 'r': 9, 'when': 'sealed', 'title': 'Welcome to the village',
         'desktop': 'The dive is sealed with kelp until you finish the tutorial. Its ring is on the stone stage to your left: swim to it and press F.',
         'touch': 'The dive is sealed with kelp until you finish the tutorial. Its ring is on the stone stage to your left: swim to it and tap Enter.'},
        {'x': 36, 'y': 33, 'r': 5, 'when': 'sealed', 'title': 'Sealed by kelp',
         'desktop': 'The kelp holds the dive shut. Finish the tutorial (the ring up on the stage) and it opens for good.',
         'touch': 'The kelp holds the dive shut. Finish the tutorial (the ring up on the stage) and it opens for good.'},
        {'x': 36, 'y': 12, 'r': 9, 'when': 'open', 'title': 'Welcome to the village',
         'desktop': 'The dive whirlpool is down the shaft: press F in it to dive. Press Tab or I for your journal. The people you help move into the empty rooms.',
         'touch': 'The dive whirlpool is down the shaft: tap Enter in it to dive. Tap pause, then Journal, for your journal. The people you help move into the empty rooms.'},
    ],
    'mirror': {'x': 46.5, 'y': 19},  # the skins owner's mirror shell (skin-picker.js): in the wardrobe alcove A, base on the floor
    'spawns': [
        {'type': 'plankton-swarm', 'x': 40.5, 'y': 9.5, 'count': 6},
        {'type': 'plankton-swarm', 'x': 36.5, 'y': 31.5, 'count': 5},
        {'type': 'block', 'x': 40.5, 'y': 18.5},
        {'type': 'block', 'x': 15.5, 'y': 30.5},
    ],
}
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(hub, f, indent=1)
    f.write('\n')
print('\n'.join(hub['rows']))
