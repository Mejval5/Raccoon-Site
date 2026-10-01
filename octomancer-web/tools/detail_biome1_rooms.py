"""Round 36: Spelunky-like density for the Biome 1 room bank.

Reads biome1-rooms-v1.txt (the 30 round-20 rooms) and biome1-rooms-new.txt (10 hand-drawn rooms added in round 36),
adds interior structure to the old rooms (ledges, pillars, stalactites, alcoves, one-tile slits, small platforms),
about 15% quantum '?' cells (rolled rock / water at level build time, so no two levels repeat) and pattern anchors
on every ledge and alcove, and writes biome1-rooms.txt, which build_biome1_rooms.py turns into the JSON.

Every edit is checked: with every '?' counted as ROCK (the worst roll), the open edge cells and the start / exit /
shop markers must stay connected through 2x2 "fat" water exactly as they were, so a room that was swimmable stays
swimmable whatever the dice say, and the seams between rooms (edge ring) never change.

Deterministic: python octomancer-web/tools/detail_biome1_rooms.py && python octomancer-web/tools/build_biome1_rooms.py
"""
import os, random, sys

here = os.path.dirname(os.path.abspath(__file__))
W, H = 10, 16
ANCH = '^v<>'


def parse(path):
    rooms, cur = [], None
    for line in open(path, encoding='utf8').read().split('\n'):
        line = line.rstrip()
        if line.startswith('//'):
            continue
        if line.startswith('room '):
            hdr = [p.strip() for p in line[5:].split('|')]
            cur = {'hdr': hdr, 'id': hdr[0], 'tags': [t for t in hdr[1].split(',') if t], 'rows': []}
            rooms.append(cur)
        elif cur is not None and line:
            cur['rows'].append(list(line))
    return rooms


def water(g, x, y):
    return 0 <= x < W and 0 <= y < H and g[y][x] not in '#?'


def rock(g, x, y):
    return x < 0 or y < 0 or x >= W or y >= H or g[y][x] == '#'


def fat_cells(g):
    fat = [[False] * W for _ in range(H)]
    for y in range(H - 1):
        for x in range(W - 1):
            if water(g, x, y) and water(g, x + 1, y) and water(g, x, y + 1) and water(g, x + 1, y + 1):
                fat[y][x] = fat[y][x + 1] = fat[y + 1][x] = fat[y + 1][x + 1] = True
    return fat


def terminals(g):
    """Edge cells that are not rock, plus a 3x3 block round every S / E / Y / @ marker."""
    t = set()
    for y in range(H):
        for x in range(W):
            if (x in (0, W - 1) or y in (0, H - 1)) and g[y][x] != '#':
                t.add((x, y))
            if g[y][x] in 'SEY@':
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if 0 <= x + dx < W and 0 <= y + dy < H:
                            t.add((x + dx, y + dy))
    return t


def components(g):
    fat = fat_cells(g)
    comp = {}
    n = 0
    for y in range(H):
        for x in range(W):
            if fat[y][x] and (x, y) not in comp:
                n += 1
                stack = [(x, y)]
                comp[(x, y)] = n
                while stack:
                    cx, cy = stack.pop()
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < W and 0 <= ny < H and fat[ny][nx] and (nx, ny) not in comp:
                            comp[(nx, ny)] = n
                            stack.append((nx, ny))
    return comp


class Checker:
    def __init__(self, g):
        self.terms = terminals(g)
        comp = components(g)
        self.base = {c: comp[c] for c in self.terms if c in comp}
        # two terminals in one component must stay in one
        self.groups = {}
        for c, k in self.base.items():
            self.groups.setdefault(k, []).append(c)

    def ok(self, g):
        comp = components(g)
        for k, cells in self.groups.items():
            ids = set()
            for c in cells:
                if c not in comp:
                    return False
                ids.add(comp[c])
            if len(ids) != 1:
                return False
        return True


def copy(g):
    return [row[:] for row in g]


def fixed_mask(g):
    fx = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            ch = g[y][x]
            if x in (0, W - 1) or y in (0, H - 1):
                fx[y][x] = True
            if ch == 'E':
                # the exit ring drops down the water column under the marker to the first floor: keep that column (and a
                # tile either side) as it is, or the ring could land in a crevice no one can swim into
                yy = y
                while yy < H and g[yy][x] != '#':
                    for dx in (-1, 0, 1):
                        if 0 <= x + dx < W:
                            fx[yy][x + dx] = True
                    yy += 1
                for dx in (-1, 0, 1):
                    for dy in (0, 1):
                        if 0 <= x + dx < W and yy + dy < H:
                            fx[yy + dy][x + dx] = True
            if ch not in '#.?':
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        if 0 <= x + dx < W and 0 <= y + dy < H and (ch in 'SEY@' or max(abs(dx), abs(dy)) <= 1):
                            fx[y + dy][x + dx] = True
    return fx


def try_apply(g, cells, ch, chk, fx):
    """Set `cells` to ch on a copy; accept when none is fixed and the rooms stays connected."""
    for x, y in cells:
        if not (0 <= x < W and 0 <= y < H) or fx[y][x]:
            return None
    n = copy(g)
    for x, y in cells:
        n[y][x] = ch
    return n if chk.ok(n) else None


def all_water(g, x0, y0, x1, y1):
    return all(water(g, x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1))


def all_rock(g, x0, y0, x1, y1):
    return all(rock(g, x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1))


def add_platforms(g, rng, chk, fx, want):
    for _ in range(60):
        if want <= 0:
            break
        w = rng.choice((3, 3, 4))
        x, y = rng.randint(2, W - 2 - w), rng.randint(3, H - 5)
        # clear water round it: 2 above and below, 1 to each side (a fat-water margin so the way past stays open)
        if not all_water(g, x - 1, y - 2, x + w, y + 3):
            continue
        n = try_apply(g, [(x + i, y + j) for i in range(w) for j in range(2)], '#', chk, fx)
        if n:
            g[:] = n
            want -= 1


def add_ledges(g, rng, chk, fx, want):
    for _ in range(80):
        if want <= 0:
            break
        y = rng.randint(3, H - 5)
        side = rng.choice((-1, 1))
        x = 1 if side == 1 else W - 2  # the wall face's water column
        L = rng.choice((2, 3))
        # a face of rock at the wall (x-side), two rows tall, and open water out to the stub's end + 2 rows round it
        if not (rock(g, x - side, y) and rock(g, x - side, y + 1)):
            continue
        xs = [x + side * k for k in range(L)]
        x0, x1 = min(xs), max(xs)
        if not all_water(g, x0, y - 2, x1 + (1 if side == 1 else 0), y + 3):
            continue
        n = try_apply(g, [(xx, yy) for xx in xs for yy in (y, y + 1)], '#', chk, fx)
        if n:
            g[:] = n
            want -= 1


def add_pillars(g, rng, chk, fx, want):
    for _ in range(80):
        if want <= 0:
            break
        up = rng.random() < 0.6
        x = rng.randint(2, W - 4)
        hgt = rng.choice((2, 3, 3))
        # find a floor (up) or ceiling (down) to stand on
        col = [(y, g[y][x]) for y in range(2, H - 2)]
        ys = [y for y, _ in col if water(g, x, y) and water(g, x + 1, y) and (rock(g, x, y + 1) if up else rock(g, x, y - 1)) and (rock(g, x + 1, y + 1) if up else rock(g, x + 1, y - 1))]
        if not ys:
            continue
        y = rng.choice(ys)
        rows = [y - k for k in range(hgt)] if up else [y + k for k in range(hgt)]
        if not all_water(g, x - 1, min(rows) - (1 if up else 0), x + 2, max(rows) + (0 if up else 1)):
            continue
        n = try_apply(g, [(x + i, yy) for i in (0, 1) for yy in rows], '#', chk, fx)
        if n:
            g[:] = n
            want -= 1


def add_alcoves(g, rng, chk, fx, want):
    for _ in range(120):
        if want <= 0:
            break
        x, y = rng.randint(2, W - 3), rng.randint(3, H - 4)
        if not water(g, x, y):
            continue
        d = rng.choice(((1, 0), (-1, 0), (0, 1), (0, -1)))
        depth = 2
        along = (0, 1) if d[0] else (1, 0)
        span = rng.choice((1, 2))
        cells = []
        for k in range(1, depth + 1):
            for s in range(span):
                cells.append((x + d[0] * k + along[0] * s, y + d[1] * k + along[1] * s))
        # the notch sits in solid rock: every cell is rock now, two more cells in line behind it are rock, and the cells
        # beside it (along the notch's width) are rock, so what is left round it is at least two thick
        if not all(rock(g, cx, cy) for cx, cy in cells):
            continue
        bx, by = x + d[0] * (depth + 2), y + d[1] * (depth + 2)
        if not (rock(g, bx, by) and rock(g, bx - d[0], by - d[1])):
            continue
        sides_ok = True
        for cx, cy in cells:
            for ax, ay in ((along[0], along[1]), (-along[0], -along[1])):
                nx, ny = cx + ax, cy + ay
                if (nx, ny) not in cells and not rock(g, nx, ny):
                    sides_ok = False
        if not sides_ok:
            continue
        n = try_apply(g, cells, '.', chk, fx)
        if n:
            g[:] = n
            want -= 1


def add_slits(g, rng, chk, fx, want):
    """A one-tile crevice, 3 deep, in thick rock below a ceiling or above a floor (rock two cells thick each side)."""
    for _ in range(120):
        if want <= 0:
            break
        x, y = rng.randint(3, W - 4), rng.randint(3, H - 4)
        if not water(g, x, y):
            continue
        d = rng.choice(((0, 1), (0, -1)))
        cells = [(x + d[0] * k, y + d[1] * k) for k in range(1, 4)]
        if not all(rock(g, cx, cy) for cx, cy in cells):
            continue
        if not all(rock(g, cx + s, cy) for cx, cy in cells for s in (-2, -1, 1, 2)):
            continue
        if not rock(g, x + d[0] * 5, y + d[1] * 5):
            continue
        n = try_apply(g, cells, '.', chk, fx)
        if n:
            g[:] = n
            want -= 1


def add_bumps(g, rng, chk, fx, want):
    """Rough the rims: 2-3 wide, 1 high bumps on floors and ceilings, 1 wide, 2 high bumps on wall faces, and 2x2
    steps in the corners where a floor meets a wall. Each one needs open water round it."""
    for _ in range(300):
        if want <= 0:
            break
        kind = rng.choice(('floor', 'floor', 'ceil', 'ceil', 'wall', 'step'))
        x, y = rng.randint(1, W - 2), rng.randint(2, H - 3)
        if not water(g, x, y):
            continue
        cells = None
        if kind == 'floor' and rock(g, x, y + 1):
            w = rng.choice((2, 3))
            cells = [(x + i, y) for i in range(w)]
            if not all(water(g, cx, cy) and g[cy + 1][cx] == '#' for cx, cy in cells) or not all_water(g, x, y - 2, x + w - 1, y - 1):
                cells = None
        elif kind == 'ceil' and rock(g, x, y - 1):
            w = rng.choice((2, 3))
            cells = [(x + i, y) for i in range(w)]
            if not all(water(g, cx, cy) and g[cy - 1][cx] == '#' for cx, cy in cells) or not all_water(g, x, y + 1, x + w - 1, y + 2):
                cells = None
        elif kind == 'wall' and (rock(g, x - 1, y) or rock(g, x + 1, y)):
            dx = -1 if rock(g, x - 1, y) else 1
            cells = [(x, y), (x, y + 1)]
            if not all(water(g, cx, cy) and g[cy][cx + dx] == '#' for cx, cy in cells) or not all_water(g, x - (0 if dx < 0 else 2), y, x + (2 if dx < 0 else 0), y + 1):
                cells = None
        elif kind == 'step' and rock(g, x, y + 1) and (rock(g, x - 1, y) or rock(g, x + 1, y)):
            dx = -1 if rock(g, x - 1, y) else 1
            cells = [(x, y), (x - dx * 1, y), (x, y - 1), (x - dx * 1, y - 1)]
            if not all(water(g, cx, cy) for cx, cy in cells) or not all_water(g, x - 2, y - 3, x + 2, y - 2):
                cells = None
        if not cells:
            continue
        n = try_apply(g, cells, '#', chk, fx)
        if n:
            g[:] = n
            want -= 1


def add_anchors(g, fx):
    """'v' on top of each ledge / platform / pillar (its middle cell), '^' under each overhang, and an anchor facing the
    back wall inside each alcove. A water cell with a definite rock cell on the side it points at."""
    out = []
    # runs of water cells with rock below (floor runs) bounded by an edge of the run at row y: a ledge / platform top
    def runs(vertical_dir):
        res = []
        for y in range(1, H - 1):
            x = 1
            while x < W - 1:
                if water(g, x, y) and rock(g, x, y + vertical_dir) and g[y + vertical_dir][x] == '#':
                    x0 = x
                    while x < W - 1 and water(g, x, y) and g[y + vertical_dir][x] == '#' and rock(g, x, y + vertical_dir):
                        x += 1
                    res.append((x0, x - 1, y))
                else:
                    x += 1
        return res
    for vd, code in ((1, 'v'), (-1, '^')):
        for x0, x1, y in runs(vd):
            ln = x1 - x0 + 1
            if ln < 2 or ln > 5:
                continue  # the whole floor / ceiling is not a ledge
            # it is a ledge when the cell past either end of the run is water at the rock row's level (the rock stops)
            ry = y + vd
            end_open = water(g, x0 - 1, ry) or water(g, x1 + 1, ry)
            if not end_open:
                continue
            x = (x0 + x1) // 2
            if fx[y][x] or g[y][x] != '.':
                continue
            out.append((x, y, code))
    # alcoves: a water cell with rock on three sides
    for y in range(2, H - 2):
        for x in range(2, W - 2):
            if g[y][x] != '.' or fx[y][x]:
                continue
            r = [rock(g, x + 1, y), rock(g, x - 1, y), rock(g, x, y + 1), rock(g, x, y - 1)]
            if sum(r) == 3 and all(g[yy][xx] == '#' for (xx, yy), q in zip(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)), r) if q):
                # an anchor points at rock: the open side is the one we are NOT pointing at; point at the back wall
                if not r[0]:
                    code = '<'   # open to the right: back wall is on the left
                elif not r[1]:
                    code = '>'   # open to the left: back wall on the right
                elif not r[2]:
                    code = '^'   # open below: back wall above
                else:
                    code = 'v'   # open above: back wall below
                out.append((x, y, code))
    return out


def fuzz(g, rng, chk, fx, target, water_ok=True):
    """Quantum cells on rock / water boundaries (interior cells only)."""
    n = 0
    cands = []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if fx[y][x] or g[y][x] not in '#.':
                continue
            nb = [g[y][x + 1], g[y][x - 1], g[y + 1][x], g[y - 1][x]]
            # rock cells only where the rock is already ragged (a corner or a bump: 2+ open sides, or 4+ open of the 8 round
            # it), so thick rock stays whole (the sealed vault pockets need solid 6x6 blocks); water cells next to rock
            # are free (a quantum cell there rolls to rock half the time and adds rock)
            open8 = sum(1 for ddy in (-1, 0, 1) for ddx in (-1, 0, 1) if (ddx or ddy) and 0 <= x + ddx < W and 0 <= y + ddy < H and g[y + ddy][x + ddx] not in '#?')
            n4 = sum(1 for c in nb if c not in '#?')
            boundary = (g[y][x] == '#' and (n4 >= 2 or open8 >= 4)) or (water_ok and g[y][x] == '.' and any(g[y + ddy][x + ddx] == '#' for ddy in (-2, -1, 0, 1, 2) for ddx in (-2, -1, 0, 1, 2) if 0 <= x + ddx < W and 0 <= y + ddy < H))
            if boundary:
                cands.append((x, y))
    rng.shuffle(cands)
    for x, y in cands:
        if n >= target:
            break
        # keep a rock cell's quantum cells apart a little so a single roll cannot hollow a whole wall
        if any(g[y + dy][x + dx] == '?' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < W and 0 <= y + dy < H) and rng.random() < 0.2:
            continue
        if g[y][x] == '#':
            g[y][x] = '?'
            n += 1
        else:
            g[y][x] = '?'
            if chk.ok(g):
                n += 1
            else:
                g[y][x] = '.'
    return n


def interior_cells():
    return (W - 2) * (H - 2)


OFF = set(filter(None, os.environ.get('DETAIL_OFF', '').split(',')))


def process(room, rng, structure):
    g = room['rows']
    if 'shop' in room['tags']:
        return
    chk = Checker(g)
    fx = fixed_mask(g)
    # the shaft rooms keep their clean 3-4 wide walls: the electric-eel pattern needs a straight 3-wide shaft
    shaft = 'shaft' in room['id'] or 'chimney' in room['id']
    if structure and not shaft:
        open_cells = sum(1 for y in range(2, H - 2) for x in range(2, W - 2) if water(g, x, y))
        before = sum(row.count('#') for row in g)
        if 'platforms' not in OFF: add_platforms(g, rng, chk, fx, rng.choice((2, 2, 3)) if open_cells > 40 else 1)
        if 'pillars' not in OFF: add_pillars(g, rng, chk, fx, rng.choice((2, 2, 3)))
        if 'ledges' not in OFF: add_ledges(g, rng, chk, fx, rng.choice((2, 3, 3)))
        if 'alcoves' not in OFF: add_alcoves(g, rng, chk, fx, rng.choice((3, 4, 4)))
        if 'slits' not in OFF: add_slits(g, rng, chk, fx, rng.choice((1, 2, 2)))
        if 'bumps' not in OFF: add_bumps(g, rng, chk, fx, rng.choice((5, 6, 7, 8)))
        room['delta'] = sum(row.count('#') for row in g) - before
    fx = fixed_mask(g)
    for x, y, code in add_anchors(g, fx):
        if g[y][x] == '.':
            g[y][x] = code
    fx = fixed_mask(g)  # anchors (and the rock they point at) are now protected
    if 'fuzz' not in OFF:
        fuzz(g, rng, chk, fx, round(interior_cells() * 0.15), water_ok=not shaft)


def write(rooms, path, header):
    with open(path, 'w', encoding='utf8') as f:
        f.write(header)
        for r in rooms:
            f.write('room ' + ' | '.join(r['hdr']) + '\n')
            for row in r['rows']:
                f.write(''.join(row) + '\n')
            f.write('\n')


def main():
    old = parse(os.path.join(here, 'biome1-rooms-v1.txt'))
    new = parse(os.path.join(here, 'biome1-rooms-new.txt'))
    out = []
    for i, r in enumerate(old):
        process(r, random.Random(1000 + i), structure=True)
        print(r['id'], r.get('delta'))
        out.append(r)
    for i, r in enumerate(new):
        process(r, random.Random(5000 + i), structure=False)
        out.append(r)
    header = ("// Biome 1 (Shallows) room bank source (generated by detail_biome1_rooms.py from biome1-rooms-v1.txt + biome1-rooms-new.txt;\n"
              "// edit those two, not this file). One block per room, 16 rows of 10 chars.\n"
              "// Header line: room <id> | tags (comma) | flip (h, v, hv or none) | weight\n"
              "// Rows: '#' rock, '.' water, 'S' start, 'E' exit, 'Y' shopkeeper and '@' pedestal (shop rooms), '?' 50% rock, and anchors '^' 'v' '<' '>'\n"
              "// (a water cell touching rock above / below / left / right).\n"
              "// Build: python octomancer-web/tools/build_biome1_rooms.py\n\n")
    write(out, os.path.join(here, 'biome1-rooms.txt'), header)
    q = sum(row.count('?') for r in out for row in r['rows'])
    print(len(out), 'rooms,', q, 'quantum cells (%.1f per room)' % (q / len(out)))


if __name__ == '__main__':
    main()
