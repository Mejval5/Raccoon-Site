#!/usr/bin/env python3
"""Extract the original Octomancer foreground-foliage setup (FGFoliageTiles + BGFoliage) from the Unity project.

Offline tool only -- never ships. Reads the octomancer-unity submodule (read-only) and prints, per FoliagePattern,
its matching-pattern grid (rows top to bottom, '#' rock, '.' air, ' ' don't care; Unity texture rows are bottom-up)
and per FoliageItem its offsets/chances, the prefab's FoliageRandomizer values, root scale and sprite path.
    python octomancer-web/tools/extract_foliage.py [path/to/octomancer-unity] > out.json
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UNITY = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "octomancer-unity"
ASSETS = UNITY / "Assets"

GUID = {}
for meta in ASSETS.rglob("*.meta"):
    try:
        m = re.search(r"^guid: ([0-9a-f]{32})", meta.read_text(encoding="utf-8", errors="ignore"), re.M)
    except OSError:
        continue
    if m:
        GUID[m.group(1)] = meta.with_suffix("")


def read(p):
    return p.read_text(encoding="utf-8", errors="ignore")


def vec(text, key):
    m = re.search(rf"^\s*{key}: \{{x: ([-\d.e]+), y: ([-\d.e]+)", text, re.M)
    return [float(m.group(1)), float(m.group(2))] if m else None


def num(text, key):
    m = re.search(rf"^\s*{key}: ([-\d.e]+)", text, re.M)
    return float(m.group(1)) if m else None


def ref(text, key):
    m = re.search(rf"{key}: \{{fileID: -?\d+, guid: ([0-9a-f]{{32}})", text.replace("\n    ", " "))
    return m.group(1) if m else None


RANDOMIZER = next(g for g, p in GUID.items() if p.name == "FoliageRandomizer.cs")


def prefab_info(path):
    t = read(path)
    docs = re.split(r"^--- ", t, flags=re.M)
    info = {"prefab": str(path.relative_to(ASSETS)).replace("\\", "/")}
    for d in docs:
        if f"guid: {RANDOMIZER}" in d:
            info["randomizeScale"] = bool(num(d, "RandomizeScale"))
            info["scalePct"] = vec(d, "ScaleChangeInPercent")
            info["randomizeRotation"] = bool(num(d, "RandomizeRotation"))
            info["maxDegree"] = num(d, "MaxDegreeChange")
    sprites = []
    for d in docs:
        if d.startswith("!u!212 "):  # SpriteRenderer
            g = ref(d, "m_Sprite")
            if g and g in GUID:
                sprites.append(str(GUID[g].relative_to(ASSETS)).replace("\\", "/"))
    info["sprites"] = sprites
    # root transform: the Transform with m_Father fileID 0
    for d in docs:
        if d.startswith("!u!4 ") and re.search(r"m_Father: \{fileID: 0\}", d):
            m = re.search(r"m_LocalScale: \{x: ([-\d.e]+), y: ([-\d.e]+)", d)
            if m:
                info["rootScale"] = [float(m.group(1)), float(m.group(2))]
            m = re.search(r"m_LocalRotation: \{x: [-\d.e]+, y: [-\d.e]+, z: ([-\d.e]+), w: ([-\d.e]+)", d)
            if m:
                import math
                info["rootRotZ"] = round(math.degrees(2 * math.atan2(float(m.group(1)), float(m.group(2)))), 2)
    # child transforms (sprite offset inside prefab)
    kids = []
    for d in docs:
        if d.startswith("!u!4 ") and not re.search(r"m_Father: \{fileID: 0\}", d):
            p = re.search(r"m_LocalPosition: \{x: ([-\d.e]+), y: ([-\d.e]+)", d)
            s = re.search(r"m_LocalScale: \{x: ([-\d.e]+), y: ([-\d.e]+)", d)
            if p:
                kids.append({"pos": [float(p.group(1)), float(p.group(2))], "scale": [float(s.group(1)), float(s.group(2))] if s else None})
    info["children"] = kids
    info["worldBoxes"] = world_bbox(path)
    return info


def world_bbox(path):
    """World-space bbox (Unity units, y up, relative to the prefab root's origin, root scale/rotation applied) of every
    enabled SpriteRenderer and Creature-pack mesh in the prefab: where the drawn art sits relative to the spawn point."""
    import math
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from bake_creature import unpack
    t = read(path)
    docs = {}
    for d in re.split(r"^--- ", t, flags=re.M)[1:]:
        m = re.match(r"!u!(\d+) &(-?\d+)", d)
        if m:
            docs[m.group(2)] = (int(m.group(1)), d)
    tf_of_go = {}
    for fid, (cls, d) in docs.items():
        if cls == 4:
            g = re.search(r"m_GameObject: \{fileID: (-?\d+)", d).group(1)
            tf_of_go[g] = fid

    def tf(fid):
        d = docs[fid][1]
        p = re.search(r"m_LocalPosition: \{x: ([-\d.e]+), y: ([-\d.e]+)", d)
        s = re.search(r"m_LocalScale: \{x: ([-\d.e]+), y: ([-\d.e]+)", d)
        r = re.search(r"m_LocalRotation: \{x: [-\d.e]+, y: [-\d.e]+, z: ([-\d.e]+), w: ([-\d.e]+)", d)
        f = re.search(r"m_Father: \{fileID: (-?\d+)", d).group(1)
        ang = 2 * math.atan2(float(r.group(1)), float(r.group(2))) if r else 0
        return (float(p.group(1)), float(p.group(2))), (float(s.group(1)), float(s.group(2))), ang, f

    def to_world(fid, x, y, include_root_pos=False):
        while fid and fid != "0":
            (px, py), (sx, sy), ang, father = tf(fid)
            x, y = x * sx, y * sy
            c, s_ = math.cos(ang), math.sin(ang)
            x, y = x * c - y * s_, x * s_ + y * c
            if father != "0" or include_root_pos:
                x, y = x + px, y + py
            fid = father
        return x, y

    boxes = []
    go_active = {}
    for fid, (cls, d) in docs.items():
        if cls == 1:
            go_active[fid] = "m_IsActive: 1" in d
    for fid, (cls, d) in docs.items():
        go = re.search(r"m_GameObject: \{fileID: (-?\d+)", d)
        if not go or not go_active.get(go.group(1), True):
            continue
        tfid = tf_of_go.get(go.group(1))
        pts = []
        if cls == 212 and "m_Enabled: 1" in d:
            g = ref(d, "m_Sprite")
            if g not in GUID:
                continue
            meta = read(Path(str(GUID[g]) + ".meta"))
            ppu = num(meta, "spritePixelsToUnits") or 100
            piv = vec(meta, "spritePivot") or [0.5, 0.5]
            w, h = Image.open(GUID[g]).size
            for cx, cy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                pts.append(((cx - piv[0]) * w / ppu, (cy - piv[1]) * h / ppu))
            kind = "sprite:" + GUID[g].name
        elif cls == 114 and "creaturePackBytes" in d:
            g = ref(d, "creaturePackBytes")
            if g not in GUID:
                continue
            v, _ = unpack(GUID[g].read_bytes())
            rest = v[3]
            xs, ys = rest[0::2], rest[1::2]
            pts = [(min(xs), min(ys)), (max(xs), min(ys)), (min(xs), max(ys)), (max(xs), max(ys))]
            kind = "creature:" + GUID[g].name
            # the pack asset sits on its own object; the mesh renders on the object holding the CreaturePackRenderer,
            # which references this asset -- use that object's transform when there is one
            for fid2, (cls2, d2) in docs.items():
                if cls2 == 114 and re.search(rf"fileID: {fid}\b", d2) and "creaturePackBytes" not in d2:
                    go2 = re.search(r"m_GameObject: \{fileID: (-?\d+)", d2).group(1)
                    if go_active.get(go2, True):
                        tfid = tf_of_go.get(go2, tfid)
                    break
        else:
            continue
        wp = [to_world(tfid, x, y) for x, y in pts]
        boxes.append({"art": kind, "x0": round(min(p[0] for p in wp), 3), "x1": round(max(p[0] for p in wp), 3),
                      "y0": round(min(p[1] for p in wp), 3), "y1": round(max(p[1] for p in wp), 3)})
    return boxes


def pattern_grid(path):
    im = Image.open(path).convert("RGBA")
    rows = []
    for y in range(im.height):  # image row 0 is the top (Unity GetPixel y=0 is the bottom)
        r = ""
        for x in range(im.width):
            px = im.getpixel((x, y))
            r += " " if px[3] < 128 else ("#" if max(px[:3]) < 128 else ".")
        rows.append(r)
    return rows


def item(guid):
    p = GUID[guid]
    t = read(p)
    out = {"name": p.stem}
    for k in ("PositionOffset", "RandomOffsetRangeX", "RandomOffsetRangeY"):
        out[k] = vec(t, k)
    for k in ("RotationOffset", "FlipOnX", "FlipOnY", "SpawnChance", "MaxSpawned", "DontSpawnOnEdge", "IgnoreSafeAreas", "FailChance"):
        out[k] = num(t, k)
    pooled = ref(t, "FoliageObject")
    if pooled in GUID:
        pt = read(GUID[pooled])
        pg = ref(pt, "objectToPool")
        if pg in GUID:
            out.update(prefab_info(GUID[pg]))
    return out


def generator(path):
    t = read(path)
    pats = []
    for g in re.findall(r"- \{fileID: 11400000, guid: ([0-9a-f]{32})", t):
        pt = read(GUID[g])
        mp = ref(pt, "MatchingPattern")
        pats.append({
            "name": GUID[g].stem,
            "hFlip": bool(num(pt, "HorizontallyFlippable")), "vFlip": bool(num(pt, "VerticallyFlippable")),
            "grid": pattern_grid(GUID[mp]) if mp in GUID else None,
            "items": [item(i) for i in re.findall(r"- \{fileID: 11400000, guid: ([0-9a-f]{32})", pt.split("FoliageItems:")[1])],
        })
    return pats


SO = ASSETS / "ScriptableObjects"
print(json.dumps({
    "foreground": generator(SO / "FGFoliageTiles" / "Foreground01.asset"),
    "background": generator(SO / "BGFoliage" / "Background01.asset"),
}, indent=1))
