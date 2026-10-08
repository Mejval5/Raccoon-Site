# Builds site/octomancer/play/data/tutorial.json (the tutorial's rooms): the map is carved room by room, then the rooms,
# prompts (with their world signs) and named spawns are written. Run: python octomancer-web/tools/tutorial_map.py
# Map characters: see js/authored.js ('1'..'9' coral doors, 'W' the bomb floor, 'V' the sticky-mine wall, 'X' bedrock, 'B' fish bone).
import json, sys, os
W, H = 72, 44  # rock under the lower rooms lets a tall phone view centre on them (the camera stops at the level edge)
g = [['#'] * W for _ in range(H)]
def water(x0, y0, x1, y1, ch='.'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = ch
def put(x, y, ch): g[y][x] = ch

# ---------------- top tier (y 5..12), left to right
water(3, 5, 16, 12)            # R1 swim
water(17, 11, 21, 12)          # the urchin gap (2 tall)
water(22, 5, 35, 12)           # R2 ink
water(26, 9, 28, 9, '#')       # a ledge with a pot on it
water(30, 5, 31, 6, 'B')       # fish-bone target hanging from the ceiling
water(36, 9, 36, 12, '1')      # door 1 (coral)
water(37, 5, 50, 12)           # R3 hand
water(47, 11, 48, 12, 'B')     # a fish-bone stump to throw at
water(51, 9, 51, 12, '2')      # door 2
water(52, 5, 69, 12)           # R4 bombs
water(58, 13, 65, 14, 'W')     # the bomb floor
water(58, 15, 65, 24)          # the shaft below it
# ---------------- lower tier (floor y 33), right to left
water(52, 25, 69, 32)          # R4b landing / sticky wall room
water(50, 29, 51, 32, 'V')     # sticky-mine wall
water(34, 24, 49, 32)          # R5 cloud
water(33, 29, 33, 32, '3')     # door 3
water(20, 25, 32, 32)          # R6 shop
water(19, 29, 19, 32, '4')     # door 4
water(7, 29, 18, 32)           # R7 hazard corridor
water(6, 23, 18, 28, 'X')      # bedrock block over it, with three sealed pockets
water(7, 24, 9, 27)            # pocket: dangling boulder
water(11, 26, 13, 27)          # pocket: spikes
water(15, 25, 17, 27)          # pocket: giant clam
water(3, 28, 5, 32); water(6, 29, 6, 32)   # R8 exit
put(6, 10, 'S')
put(4, 32, 'E')
put(21, 32, 'K'); put(24, 32, 'P'); put(27, 32, 'P'); put(30, 32, 'P')
rows = [''.join(r) for r in g]

def P(title, label, x, y, r, sign, desktop, touch, **kw):
    d = {"title": title, "label": label, "x": x, "y": y, "r": r, "sign": sign, "desktop": desktop, "touch": touch}
    d.update(kw); return d

prompts = [
  P("Swim", "Swim", 8, 9, 6.5, [9, 12],
    "WASD or the arrow keys swim. Head right.",
    "Drag anywhere on the left of the screen to swim. Head right."),
  P("Dash", "Dash", 16, 11, 4.5, [15, 12],
    "Space or Shift dashes. Mid-dash nothing can hurt you: get close, then dash through the urchins.",
    "Tap Dash for a burst of speed. Mid-dash nothing can hurt you: get close, then dash through the urchins."),
  P("Ink Jet", "Ink", 28, 9, 7.5, [24, 12],
    "Left click squirts ink at the cursor (J or K: straight ahead). It refills slowly, watch the jet on your bar. Shoot the fish bones to open the coral.",
    "Tap Jet to squirt ink at what is near. It refills slowly, watch the jet on your bar. Shoot the fish bones to open the coral."),
  P("Grab and throw", "Grab", 43, 9, 7.5, [38, 12],
    "F or middle click grabs a pot. Press again to throw it at the cursor, hold to set it down. Throw one at the fish bones. A carried pot takes a hit for you.",
    "Stop next to a pot and tap Grab. Tap Throw to fling it the way you swim. Throw one at the fish bones. A carried pot takes a hit for you."),
  P("Bomb the floor", "Bombs", 61, 9, 8.5, [54, 12],
    "Your bomb is picked on the bar. Over the cracked floor press C (or right click on yourself) to drop it, then swim clear. B or X drops one any time. Outside the tutorial a blast kills you.",
    "Your bomb is picked on the bar. Over the cracked floor tap Bomb to drop it, then swim clear. Outside the tutorial a blast kills you.",
    refillBomb=True),
  P("Sticky mine", "Sticky", 58, 29, 8, [55, 32],
    "Point at the cracked wall and right click: the bomb flies there and sticks to the rock. Then back off.",
    "Hold the stick toward the cracked wall and tap Bomb: the bomb flies there and sticks to the rock. Then back off."),
  P("Spells", "Spells", 42, 28, 8.5, [47, 32],
    "Q, E, the wheel or 1-9 pick a slot on your bar. Pick Ink Cloud and right click or press C: the piranha loses you in the ink. Spells drink fish juice; the jar refills only at the rest grotto, unless you carry the Siphon Shell.",
    "Tap Spell to puff an Ink Cloud: the piranha loses you in the ink. Spells drink fish juice; the jar refills only at the rest grotto, unless you carry the Siphon Shell."),
  P("Shop", "Shop", 26, 29, 7, [32, 32],
    "Swim up to a ware and press F to buy it. Today it is free. In a real shop, carrying off or shooting a ware makes the keeper come for you.",
    "Stop next to a ware and tap Grab to buy it. Today it is free. In a real shop, carrying off or shooting a ware makes the keeper come for you."),
  P("Boulders", "Boulder", 9, 31, 2.0, [8, 32],
    "A boulder drops when you swim under it. Blasts shake them loose too: one thing sets off the next.",
    "A boulder drops when you swim under it. Blasts shake them loose too: one thing sets off the next."),
  P("Spikes", "Spikes", 12.5, 31, 2.2, [12, 32],
    "Spikes kill at once, hearts or not. Look before you sink.",
    "Spikes kill at once, hearts or not. Look before you sink."),
  P("Clams and jets", "Clam", 16.5, 31, 2.2, [17, 32],
    "Giant clams snap on what swims in; tentacles grab and hold (dash to wriggle free). Jets push you up.",
    "Giant clams snap on what swims in; tentacles grab and hold (dash to wriggle free). Jets push you up."),
  P("Dive", "Dive", 5, 30.5, 3.2, [6, 32],
    "Swim to the whirlpool and press F to dive. Below, the Beholder hunts slow divers from about 2:30; be quick for a Swift Current shell. Tab opens your journal, what you carry first.",
    "Swim to the whirlpool and tap Grab to dive. Below, the Beholder hunts slow divers from about 2:30; be quick for a Swift Current shell. Your journal is in the pause menu."),
]
rooms = [
  {"id": "swim", "rect": [3, 5, 21, 12], "goal": "pass", "goalX": 21.5},
  {"id": "ink", "rect": [22, 5, 35, 12], "goal": "bone", "door": 1},
  {"id": "hand", "rect": [37, 5, 50, 12], "goal": "throw", "door": 2},
  {"id": "bomb", "rect": [52, 5, 69, 24], "goal": "walls"},
  {"id": "sticky", "rect": [52, 25, 69, 32], "goal": "sticky"},
  {"id": "cloud", "rect": [34, 24, 49, 32], "goal": "cast", "door": 3},
  {"id": "shop", "rect": [20, 25, 32, 32], "goal": "buy", "door": 4},
  {"id": "hazards", "rect": [7, 29, 18, 32], "goal": "pass", "goalX": 6.5, "dir": -1},
  {"id": "exit", "rect": [3, 28, 6, 32], "goal": "exit"},
]
spawns = [
  {"type": "enemy", "kind": "urchin", "placement": "ceiling", "x": 19.5, "y": 11.5},
  {"type": "enemy", "kind": "urchin", "placement": "floor", "x": 19.5, "y": 12.5},
  {"type": "loot", "name": "pot", "x": 27.5, "y": 8.5},
  {"type": "loot", "name": "pot", "x": 33.5, "y": 12.5},
  {"type": "loot", "name": "pot", "x": 40.5, "y": 12.5},
  {"type": "loot", "name": "pot", "x": 42.5, "y": 12.5},
  {"type": "enemy", "kind": "piranha", "placement": "open", "x": 41.5, "y": 27.5},
  {"type": "hazard", "name": "rock", "x": 8.5, "y": 24.5, "dx": 0, "dy": 1},
  {"type": "creature", "name": "gclam", "x": 16.5, "y": 27.5, "dx": 0, "dy": -1},
  {"type": "hazard", "name": "spikes", "x": 12.5, "y": 27.5, "dx": 0, "dy": -1},
  {"type": "hazard", "name": "jet", "x": 14.5, "y": 32.5, "dx": 0, "dy": -1},
  {"type": "plankton-swarm", "x": 9.5, "y": 7.5, "count": 6},
  {"type": "plankton-swarm", "x": 62.5, "y": 28.5, "count": 7},
]
out = {"id": "tutorial", "name": "Tutorial", "rows": rows, "rooms": rooms, "prompts": prompts, "spawns": spawns}
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'site', 'octomancer', 'play', 'data', 'tutorial.json')
open(dest, 'w', newline='\n').write(json.dumps(out, indent=1) + '\n')
