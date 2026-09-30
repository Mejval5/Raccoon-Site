"""Build site/octomancer/play/data/biome1-rooms.json from biome1-rooms.txt."""
import json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
lines = open(os.path.join(here, 'biome1-rooms.txt'), encoding='utf8').read().split('\n')
rooms, cur = [], None


def flush():
    global cur
    if cur:
        if len(cur['cells']) != 16 or any(len(r) != 10 for r in cur['cells']):
            sys.exit('bad room %s rows=%d widths=%s' % (cur['id'], len(cur['cells']), [len(r) for r in cur['cells']]))
        rooms.append(cur)
    cur = None


for line in lines:
    line = line.rstrip()
    if line.startswith('//'):
        continue
    if line.startswith('room '):
        flush()
        rid, tags, flip, weight = [p.strip() for p in line[5:].split('|')]
        cur = {'id': rid, 'w': 10, 'h': 16, 'flip': '' if flip == 'none' else flip, 'weight': float(weight),
               'kind': 'room', 'tags': [t for t in tags.split(',') if t], 'cells': []}
    elif cur is not None and line:
        cur['cells'].append(line)
flush()
out = os.path.normpath(os.path.join(here, '..', '..', 'site', 'octomancer', 'play', 'data', 'biome1-rooms.json'))
json.dump(rooms, open(out, 'w', encoding='utf8'), indent=1)
print(len(rooms), 'rooms ->', out)
