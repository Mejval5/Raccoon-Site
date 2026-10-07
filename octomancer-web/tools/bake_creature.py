"""Octomancer web: octopus sprite-sheet bake (OVERNIGHT.md track B, DECISIONS §4).

Offline-only tool (never ships). Reads Milan's Creature-pack animation data for
the octopus (a plain msgpack blob Unity's Creature plugin loads at runtime) and
its 1000x1000 atlas, and bakes three clips (Swim05, Idle4, Idle4Swirl-as-hurt)
to a body sprite sheet, plus three eye-state sprites (open/closed/angry) cut
straight from the same atlas, plus a JSON describing cell layout, clip frame
ranges and per-frame per-eye anchors (centroid/angle/scale, per the recipe).

No Creature runtime code, no mesh at runtime: the game only ever does a
handful of `drawImage` calls against the baked sheet (see octopus-draw.js).

Usage:
    python bake_creature.py \
        --pack <creature_pack.bytes> --atlas <atlas.png> --json <character_data.json> \
        --out-sheet <play/assets/octopus.webp> --out-json <play/assets/octopus.json>

Pack layout (msgpack, no `msgpack` package installed -> hand-rolled reader):
v[1] = flat clip-range index list [start0,end0,start1,end1,...] into v.
v[2] = 1200 triangle indices (400 triangles, 3 each).
v[3] = 534 floats, rest points (267 verts, x,y, y-up).
v[4] = 534 floats, UVs (u,v in 0..1, pixel = u*W, v*H, not flipped).
A clip at v[s] is: name (str), then groups of four
(time, points[534], [], []) until the range end.

Regions (from the .json's mesh.regions): TextureMesh0 (body) points 0-222,
triangle-indices 0-1043; EyeRight points 223-244, indices 1044-1121; EyeLeft
points 245-266, indices 1122-1199. We only ever warp body triangles
(index < 1044); eye variants are cut straight from the atlas (uv_swap_items
is empty, so open/closed/angry live at separate atlas rects, found here by
scanning the atlas's alpha channel for the eye-pair row bands).
"""
import argparse
import json
import struct
import sys
import time

from PIL import Image


# ---------------------------------------------------------------------------
# Minimal msgpack reader (Beaver's bake_probe.py, DECISIONS-2026-09-29.md §4).
# ---------------------------------------------------------------------------
def unpack(b, i=0):
    t = b[i]
    if t <= 0x7f:
        return t, i + 1
    if 0x80 <= t <= 0x8f:
        return _map(b, i + 1, t & 15)
    if 0x90 <= t <= 0x9f:
        return _arr(b, i + 1, t & 15)
    if 0xa0 <= t <= 0xbf:
        n = t & 31
        return b[i + 1:i + 1 + n].decode('utf8', 'replace'), i + 1 + n
    if t >= 0xe0:
        return t - 256, i + 1
    if t == 0xc0:
        return None, i + 1
    if t == 0xc2:
        return False, i + 1
    if t == 0xc3:
        return True, i + 1
    if t in (0xc4, 0xc5, 0xc6):  # bin 8/16/32 (some foliage packs carry one)
        w = {0xc4: 1, 0xc5: 2, 0xc6: 4}[t]
        n = int.from_bytes(b[i + 1:i + 1 + w], 'big')
        return bytes(b[i + 1 + w:i + 1 + w + n]), i + 1 + w + n
    if t == 0xca:
        return struct.unpack('>f', b[i + 1:i + 5])[0], i + 5
    if t == 0xcb:
        return struct.unpack('>d', b[i + 1:i + 9])[0], i + 9
    if t == 0xcc:
        return b[i + 1], i + 2
    if t == 0xcd:
        return struct.unpack('>H', b[i + 1:i + 3])[0], i + 3
    if t == 0xce:
        return struct.unpack('>I', b[i + 1:i + 5])[0], i + 5
    if t == 0xd0:
        return struct.unpack('>b', b[i + 1:i + 2])[0], i + 2
    if t == 0xd1:
        return struct.unpack('>h', b[i + 1:i + 3])[0], i + 3
    if t == 0xd2:
        return struct.unpack('>i', b[i + 1:i + 5])[0], i + 5
    if t == 0xd9:
        n = b[i + 1]
        return b[i + 2:i + 2 + n].decode('utf8', 'replace'), i + 2 + n
    if t == 0xda:
        n = struct.unpack('>H', b[i + 1:i + 3])[0]
        return b[i + 3:i + 3 + n].decode(), i + 3 + n
    if t == 0xdc:
        n = struct.unpack('>H', b[i + 1:i + 3])[0]
        return _arr(b, i + 3, n)
    if t == 0xdd:
        n = struct.unpack('>I', b[i + 1:i + 5])[0]
        return _arr(b, i + 5, n)
    if t == 0xde:
        n = struct.unpack('>H', b[i + 1:i + 3])[0]
        return _map(b, i + 3, n)
    raise ValueError(hex(t))


def _arr(b, i, n):
    out = []
    for _ in range(n):
        v, i = unpack(b, i)
        out.append(v)
    return out, i


def _map(b, i, n):
    out = {}
    for _ in range(n):
        k, i = unpack(b, i)
        v, i = unpack(b, i)
        out[k] = v
    return out, i


def load_clips(pack_bytes):
    v, _ = unpack(pack_bytes)
    idx = v[2]
    r = v[1]
    clips = {}
    for k in range(0, len(r) - 1, 2):
        s0, e0 = r[k], r[k + 1]
        if not isinstance(v[s0], str):
            continue
        name = v[s0]
        frames = []
        j = s0 + 1
        while j + 1 <= e0 and isinstance(v[j], float):
            t_, pts = v[j], v[j + 1]
            frames.append((t_, pts))
            j += 4
        clips[name] = frames
    return clips, idx


# ---------------------------------------------------------------------------
# Geometry helpers.
# ---------------------------------------------------------------------------
# The .json's mesh.regions gives start_index/end_index as *positions within
# the flat 1200-entry triangle-index array* (v[2]), not vertex ids -- there
# are only 267 vertices total, so an "end_index" of 1043/1121/1199 can only
# be a position. TextureMesh0 (body) = positions 0-1043 (348 triangles);
# EyeRight = 1044-1121 (26 triangles); EyeLeft = 1122-1199 (26 triangles).
# (An earlier version of this tool compared *vertex ids* to 1044 instead,
# which is always true since vertex ids only run 0-266 -- that silently drew
# every eye triangle onto the body sheet too, using its tiny eye-region UVs
# warped as if they were body UVs, which is exactly the stray dark patch
# seen over the eye sockets in the first DPR2 screenshot. Fixed here.)
BODY_TRI_POSITION_END = 1044  # position in the flat idx array, exclusive.
EYE_R_PT = (223, 244)
EYE_L_PT = (245, 266)


def pt(points, i):
    return points[2 * i], points[2 * i + 1]


def triangles(idx):
    """Returns (position, (i0,i1,i2)) so callers can tell which mesh region
    a triangle belongs to from its position in the flat array."""
    return [(i, (idx[i], idx[i + 1], idx[i + 2])) for i in range(0, len(idx), 3)]


def solve_affine(src_tri, dst_tri):
    """Solve the 6 affine coeffs mapping dst pixel -> src pixel (PIL AFFINE
    wants the inverse transform, i.e. dst->src), given 3 point pairs."""
    (x0, y0), (x1, y1), (x2, y2) = dst_tri
    (u0, v0), (u1, v1), (u2, v2) = src_tri
    # Solve for (a,b,c) with u = a*x + b*y + c, similarly for v.
    denom = (x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1))
    if abs(denom) < 1e-9:
        return None
    def solve(u0, u1, u2):
        a = (u0 * (y1 - y2) - u1 * (y0 - y2) + u2 * (y0 - y1)) / denom
        b = (x0 * (u1 - u2) - x1 * (u0 - u2) + x2 * (u0 - u1)) / denom
        c = (x0 * (y1 * u2 - y2 * u1) - x1 * (y0 * u2 - y2 * u0) + x2 * (y0 * u1 - y1 * u0)) / denom
        return a, b, c
    a, b, c = solve(u0, u1, u2)
    d, e, f = solve(v0, v1, v2)
    return (a, b, c, d, e, f)


def bbox(points_xy):
    xs = [p[0] for p in points_xy]
    ys = [p[1] for p in points_xy]
    return min(xs), min(ys), max(xs), max(ys)


def render_body_frame(atlas, atlas_w, atlas_h, uvs, tris, points, to_px, size_px, supersample):
    """Render one body-only frame into an RGBA image of size_px^2, warping
    each body triangle from its atlas UV rect to its deformed position
    (already transformed to pixel space by `to_px`), masked to the triangle
    polygon and clipped to that triangle's own bounding box (not the whole
    canvas -- DECISIONS §4's own perf warning)."""
    hi = size_px * supersample
    out = Image.new('RGBA', (hi, hi), (0, 0, 0, 0))
    for (i0, i1, i2) in tris:
        # `tris` is already filtered to body-only triangles by the caller
        # (by their *position* in the flat index array, see BODY_TRI_POSITION_END).
        v0, v1, v2 = i0, i1, i2
        src = [pt(uvs, v0), pt(uvs, v1), pt(uvs, v2)]
        src_px = [(u * atlas_w, v * atlas_h) for (u, v) in src]
        dst_world = [pt(points, v0), pt(points, v1), pt(points, v2)]
        dst_px = [to_px(x, y, supersample) for (x, y) in dst_world]
        pad = int(2 * supersample) + 2
        x0, y0, x1, y1 = bbox(dst_px)
        x0 = max(0, int(x0) - pad); y0 = max(0, int(y0) - pad)
        x1 = min(hi, int(x1) + pad); y1 = min(hi, int(y1) + pad)
        if x1 <= x0 or y1 <= y0:
            continue
        local_dst = [(x - x0, y - y0) for (x, y) in dst_px]
        coeffs = solve_affine(src_px, local_dst)
        if coeffs is None:
            continue
        try:
            warped = atlas.transform((x1 - x0, y1 - y0), Image.AFFINE, coeffs, Image.BILINEAR)
        except Exception:
            continue
        # Grow the mask polygon ~1.5px (supersampled) against seams between
        # neighbouring triangles (DECISIONS §4's own recipe note); the affine
        # fill is already solved from the true triangle, so this just
        # extrapolates the texture a hair beyond it to close hairline gaps.
        cxp = sum(p[0] for p in local_dst) / 3
        cyp = sum(p[1] for p in local_dst) / 3
        grow = 1.5 * supersample
        dilated = []
        for (px_, py_) in local_dst:
            dx, dy = px_ - cxp, py_ - cyp
            d = (dx * dx + dy * dy) ** 0.5
            if d < 1e-6:
                dilated.append((px_, py_))
            else:
                dilated.append((px_ + dx / d * grow, py_ + dy / d * grow))
        mask = Image.new('L', (x1 - x0, y1 - y0), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).polygon(dilated, fill=255)
        out.paste(warped, (x0, y0), Image.composite(mask, Image.new('L', mask.size, 0), mask))
    if supersample > 1:
        out = out.resize((size_px, size_px), Image.LANCZOS)
    return out


def find_eye_variant_rects(atlas_rgba):
    """Scan the atlas's alpha channel for the eye-pair row bands (body sits
    at low x, eye variants stack vertically at higher x -- see the contact
    print in web/report/B-1-sheet.png). Returns
    {state: {'left': (x0,y0,x1,y1), 'right': (...)}}. Hand-verified against
    this atlas (OctoRemasteredExport2_character_img.png, 1000x1000): open at
    rows ~21-80, closed (blink) at rows ~324-343, angry at rows ~401-435, each
    a left/right pair split around x~300-320."""
    import numpy as np
    a = np.array(atlas_rgba)
    alpha = a[:, :, 3]

    def band_rects(y0, y1):
        sub = alpha[y0:y1 + 1, :]
        colmax = sub.max(axis=0)
        cols = [c for c in range(len(colmax)) if colmax[c] > 10]
        if not cols:
            return None
        # Group into contiguous column runs (gap > 3px starts a new run).
        # The 'open' band's y-range also grazes the top of the head dome's
        # silhouette at low x (bug found tonight: a DPR2 screenshot showed a
        # big pink wedge standing in for the left eye), so a band can contain
        # more than the expected 2 blobs. The atlas is laid out body-at-low-x,
        # eyes-at-higher-x (this file's own docstring), so whatever the count,
        # the two RIGHTMOST runs are always the eye pair; drop any extra runs
        # to their left as the intruding body silhouette.
        runs = []
        cur = [cols[0]]
        for c in cols[1:]:
            if c - cur[-1] <= 3:
                cur.append(c)
            else:
                runs.append(cur)
                cur = [c]
        runs.append(cur)
        if len(runs) > 2:
            runs = runs[-2:]
        elif len(runs) < 2:
            return None
        left_cols, right_cols = runs[0], runs[1]
        def tight(cols_sub):
            x0, x1 = min(cols_sub), max(cols_sub)
            sub2 = alpha[y0:y1 + 1, x0:x1 + 1]
            rows = [r for r in range(sub2.shape[0]) if sub2[r, :].max() > 10]
            return (x0, y0 + min(rows), x1 + 1, y0 + max(rows) + 1)
        return {'left': tight(left_cols), 'right': tight(right_cols)}

    return {
        'open': band_rects(20, 82),
        'closed': band_rects(322, 345),
        'angry': band_rects(399, 437),
    }


def eye_anchor(points, lo, hi):
    """Per DECISIONS §4: centroid, angle (first point -> centroid), scale vs
    a rest frame (scale is filled in by the caller, which knows the rest
    distance)."""
    xs, ys = [], []
    for i in range(lo, hi + 1):
        x, y = pt(points, i)
        xs.append(x); ys.append(y)
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    fx, fy = pt(points, lo)
    dist = ((fx - cx) ** 2 + (fy - cy) ** 2) ** 0.5
    angle = __import__('math').atan2(fy - cy, fx - cx)
    return cx, cy, angle, dist


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack', required=True)
    ap.add_argument('--atlas', required=True)
    ap.add_argument('--json', required=True, help='character_data.json (region names only)')
    ap.add_argument('--out-sheet', required=True)
    ap.add_argument('--out-json', required=True)
    ap.add_argument('--cell', type=int, default=160)
    ap.add_argument('--supersample', type=int, default=2)
    ap.add_argument('--collider-radius', type=float, default=0.45)
    args = ap.parse_args()

    t_start = time.time()

    pack_bytes = open(args.pack, 'rb').read()
    clips_raw, idx = load_clips(pack_bytes)
    tris = triangles(idx)
    body_tris = [t for (pos, t) in tris if pos < BODY_TRI_POSITION_END]

    atlas = Image.open(args.atlas).convert('RGBA')
    atlas_w, atlas_h = atlas.size

    # We need one shared UV array -- reuse the FIRST frame's own UVs. The pack
    # actually stores UVs at v[4]; re-derive via load_clips's `v` (kept local
    # to that function), so re-unpack once more here for v[3]/v[4].
    v, _ = unpack(pack_bytes)
    uvs = v[4]

    want = [
        ('swim', 'Swim05'),
        ('idle', 'Idle4'),
        ('hurt', 'Idle4Swirl'),
    ]
    frame_points = {}  # clip key -> list of points arrays
    for key, clip_name in want:
        frames = clips_raw[clip_name]
        frame_points[key] = [p for (_t, p) in frames]
        print(f'{clip_name}: {len(frames)} keyframes')

    # Rest reference for eye "scale vs rest": Idle4's first keyframe.
    rest_points = frame_points['idle'][0]
    _, _, _, rest_dist_r = eye_anchor(rest_points, *EYE_R_PT)
    _, _, _, rest_dist_l = eye_anchor(rest_points, *EYE_L_PT)

    # Global bbox (mesh space) across every point of every used frame, body +
    # eye regions, so one shared transform places every frame consistently
    # (no per-frame rescale jitter) and eye anchors line up with the body.
    all_xy = []
    for pts_list in frame_points.values():
        for points in pts_list:
            for i in range(267):
                all_xy.append(pt(points, i))
    minx, miny, maxx, maxy = bbox(all_xy)
    span = max(maxx - minx, maxy - miny)
    cx_mesh = (minx + maxx) / 2
    cy_mesh = (miny + maxy) / 2

    margin_frac = 0.92  # leave ~4% margin each side
    S = (args.cell * margin_frac) / span  # px (at 1x) per mesh unit

    def to_px(x, y, supersample=1):
        # y-up mesh space -> y-down pixel space, centered in the cell.
        px = (args.cell / 2) + (x - cx_mesh) * S
        py = (args.cell / 2) - (y - cy_mesh) * S
        return px * supersample, py * supersample

    # Body radius estimate for the octopus-transform-scale report: the
    # mantle/head is the tight point cluster near the body centroid; the
    # tentacle tips are the long-distance outliers. No numeric scale field
    # was found on the Octopus GameObject or its child transforms in
    # MainGame.unity (all m_LocalScale 1,1,1 -- checked all 3 direct
    # children); used the median point-to-centroid distance of the BODY
    # region in the Idle4 rest frame as the head-radius estimate instead
    # (logged as a deviation in NIGHT-LOG.md).
    body_pts_rest = [pt(rest_points, i) for i in range(0, 223)]
    bcx = sum(p[0] for p in body_pts_rest) / len(body_pts_rest)
    bcy = sum(p[1] for p in body_pts_rest) / len(body_pts_rest)
    dists = sorted(((p[0] - bcx) ** 2 + (p[1] - bcy) ** 2) ** 0.5 for p in body_pts_rest)
    head_radius_mesh = dists[len(dists) // 2]  # median
    mesh_units_to_world = args.collider_radius / head_radius_mesh
    cell_world_size = args.cell / S * mesh_units_to_world

    print(f'global mesh bbox span={span:.3f}, S={S:.2f}px/unit, '
          f'headRadiusMesh(median)={head_radius_mesh:.3f}, '
          f'meshUnitsToWorld={mesh_units_to_world:.4f}, cellWorldSize={cell_world_size:.3f}')

    # --- Bake body frames into one horizontal sheet ---------------------
    order = []
    clip_ranges = {}
    frame_offset = 0
    for key, _name in want:
        n = len(frame_points[key])
        clip_ranges[key] = {'start': frame_offset, 'count': n}
        for p in frame_points[key]:
            order.append((key, p))
        frame_offset += n
    total_frames = len(order)

    sheet_w = args.cell * total_frames
    sheet = Image.new('RGBA', (sheet_w, args.cell), (0, 0, 0, 0))
    eye_anchors = {key: [] for key, _ in want}
    for i, (key, points) in enumerate(order):
        frame_img = render_body_frame(atlas, atlas_w, atlas_h, uvs, body_tris, points, to_px,
                                       args.cell, args.supersample)
        sheet.paste(frame_img, (i * args.cell, 0), frame_img)

        rcx, rcy, rangle, rdist = eye_anchor(points, *EYE_R_PT)
        lcx, lcy, langle, ldist = eye_anchor(points, *EYE_L_PT)
        rpx, rpy = to_px(rcx, rcy)
        lpx, lpy = to_px(lcx, lcy)
        eye_anchors[key].append({
            'right': {'x': round(rpx, 2), 'y': round(rpy, 2),
                      'angle': round(-rangle, 4), 'scale': round(rdist / rest_dist_r, 4)},
            'left': {'x': round(lpx, 2), 'y': round(lpy, 2),
                     'angle': round(-langle, 4), 'scale': round(ldist / rest_dist_l, 4)},
        })
        print(f'  frame {i + 1}/{total_frames} ({key}) baked')

    # --- Eye variant sprites, cut straight from the atlas ----------------
    rects = find_eye_variant_rects(atlas)
    eye_sprite_imgs = {}
    eye_sheet_x = sheet_w
    eye_meta = {}
    pad = 2
    ex = eye_sheet_x
    max_eye_h = 0
    tmp_sprites = []
    for state, sides in rects.items():
        for side in ('left', 'right'):
            x0, y0, x1, y1 = sides[side]
            crop = atlas.crop((x0, y0, x1, y1))
            tmp_sprites.append((state, side, crop))
            max_eye_h = max(max_eye_h, crop.size[1])
    eye_sheet = Image.new('RGBA', (sum(c.size[0] + pad for (_s, _sd, c) in tmp_sprites), max_eye_h), (0, 0, 0, 0))
    cursor = 0
    eye_rect_meta = {}
    for state, side, crop in tmp_sprites:
        w, h = crop.size
        eye_sheet.paste(crop, (cursor, 0), crop)
        eye_rect_meta.setdefault(state, {})[side] = {
            'x': eye_sheet_x + cursor, 'y': 0, 'w': w, 'h': h,
        }
        cursor += w + pad

    full_sheet = Image.new('RGBA', (sheet_w + eye_sheet.size[0], max(args.cell, max_eye_h)), (0, 0, 0, 0))
    full_sheet.paste(sheet, (0, 0), sheet)
    full_sheet.paste(eye_sheet, (sheet_w, 0), eye_sheet)

    # Eye-rest mesh-space bbox size (for runtime world sizing) -- rest frame,
    # per side.
    def region_bbox_size(points, lo, hi):
        xs = [pt(points, i)[0] for i in range(lo, hi + 1)]
        ys = [pt(points, i)[1] for i in range(lo, hi + 1)]
        return max(xs) - min(xs), max(ys) - min(ys)

    eye_r_w, eye_r_h = region_bbox_size(rest_points, *EYE_R_PT)
    eye_l_w, eye_l_h = region_bbox_size(rest_points, *EYE_L_PT)

    full_sheet.save(args.out_sheet, quality=80, method=6)

    out_json = {
        'note': 'Baked offline by bake_creature.py from OctoRemasteredExport '
                'creature-pack data; never loads the Creature runtime.',
        'cellSize': args.cell,
        'cellWorldSize': round(cell_world_size, 4),
        'meshUnitsToWorld': round(mesh_units_to_world, 6),
        'colliderRadius': args.collider_radius,
        'headRadiusMeshMethod': 'median body-point distance to body centroid, Idle4 rest frame '
                                 '(no numeric scale field found on the Octopus transform or its '
                                 'children in MainGame.unity; all m_LocalScale 1,1,1)',
        'frameCount': total_frames,
        'clips': clip_ranges,
        'eyeAnchors': eye_anchors,
        'eyeRestSize': {
            'right': {'meshW': round(eye_r_w, 4), 'meshH': round(eye_r_h, 4)},
            'left': {'meshW': round(eye_l_w, 4), 'meshH': round(eye_l_h, 4)},
        },
        'eyeSprites': eye_rect_meta,
    }
    with open(args.out_json, 'w') as f:
        json.dump(out_json, f, indent=1)

    elapsed = time.time() - t_start
    import os
    sheet_kb = os.path.getsize(args.out_sheet) / 1024
    print(f'Done in {elapsed:.1f}s. Sheet {full_sheet.size} = {sheet_kb:.1f} KB -> {args.out_sheet}')
    if elapsed > 60:
        print('WARNING: exceeded the 60s bake budget (OVERNIGHT.md M2 track B).', file=sys.stderr)
    if sheet_kb > 200:
        print('WARNING: sheet exceeds the 200 KB budget.', file=sys.stderr)


if __name__ == '__main__':
    main()
