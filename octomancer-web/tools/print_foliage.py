import json, sys
d = json.load(open(sys.argv[1]))
for gen in ('foreground', 'background'):
    for p in d[gen]:
        print('==', gen, p['name'], 'h', p['hFlip'], 'v', p['vFlip'])
        for r in (p['grid'] or []):
            print('   |' + r + '|')
        for it in p['items']:
            print('  ', it['name'], 'pos', it['PositionOffset'], 'rx', it['RandomOffsetRangeX'], 'ry', it['RandomOffsetRangeY'], 'rot', it['RotationOffset'], 'fx', it['FlipOnX'], 'fy', it['FlipOnY'], 'ch', it['SpawnChance'], 'max', it['MaxSpawned'], 'edge', it['DontSpawnOnEdge'], 'fail', it['FailChance'])
            print('      ', {k: it.get(k) for k in ('randomizeScale', 'scalePct', 'randomizeRotation', 'maxDegree', 'rootScale', 'rootRotZ', 'sprites', 'prefab')})
            for b in it.get('worldBoxes', []):
                print('         box', b)
