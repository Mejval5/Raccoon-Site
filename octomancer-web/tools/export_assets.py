#!/usr/bin/env python3
"""M0-3: art sort, harvest, and first play/assets export.

Offline tool only -- never ships. Reads octomancer-unity/ (read-only) and
site/img/octomancer/ (read-only), and writes:
  - octomancer-web/report/contact-sheet.png   (everything that may ship)
  - octomancer-web/harvest/<tree>/... + MANIFEST.md   (A + kept-D at full res)
  - site/octomancer/play/assets/*.webp   (M1/M2 display-size set)
  - octomancer-web/ASSETS.md, octomancer-web/CREDITS.md

Run from the repo root: `python octomancer-web/tools/export_assets.py`.
See OVERNIGHT.md §2 art rule and §4 M0-3, and DECISIONS-2026-09-29.md §2-3.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
UNITY = ROOT / "octomancer-unity" / "Assets" / "Sprites"
OLD = ROOT / "octomancer-unity" / "OldAssets" / "Sprites"
SITE_IMG = ROOT / "site" / "img" / "octomancer"
WEB = ROOT / "octomancer-web"
HARVEST = WEB / "harvest"
REPORT = WEB / "report"
PLAY_ASSETS = ROOT / "site" / "octomancer" / "play" / "assets"
FFMPEG = r"D:\Program Files\ffmpeg-7.1-full_build\bin\ffmpeg.exe"

HARVEST_CAP_MB = 40
PLAY_ASSETS_CAP_KB = 900

# ---------------------------------------------------------------------------
# Bucket A ("use") -- OVERNIGHT.md §2 art rule, bucket A.
# Each entry: (dest-relative path under harvest/, source Path, note).
# Sequences take every 2nd frame per M0-3(c); "every 2nd" means index 0,2,4...
# ---------------------------------------------------------------------------

def every2(paths):
    return paths[::2]


def glob_sorted(base, pattern):
    return sorted(base.glob(pattern))


A_ITEMS = []  # (rel_dest, src_path)

def add(rel, src):
    if src.exists():
        A_ITEMS.append((rel, src))
    else:
        print(f"MISSING (skipped): {src}")

# Tiles
for p in glob_sorted(UNITY, "Tiles/TilesetMilan/*.png"):
    add(f"Assets/Sprites/Tiles/TilesetMilan/{p.name}", p)

# Background
for name in ["BGFar.png", "BGFar2.png", "BGCombined.png", "Eye.png", "EyeBlue.png",
             "EyeBlue2.png", "Hole01.png", "Hole02.png", "Plant1.png", "Plant2.png"]:
    add(f"Assets/Sprites/Background/{name}", UNITY / "Background" / name)

# Octopus creature pack (baked offline only, never at runtime as mesh)
for name in ["OctoRemasteredExport2_character_img.png",
             "OctoRemasteredExport_character_data.creature_pack.bytes",
             "OctoRemasteredExport_character_data.json"]:
    add(f"Assets/Sprites/Animations/Octopus/{name}", UNITY / "Animations" / "Octopus" / name)

# 9 plant animations (one sheet png each)
for d in ["Plant12Animation", "Plant13Animation", "Plant24Animation", "Plant25Animation",
          "Plant26Animation", "Plant5Animation", "Plant7Animation", "Plant8Animation",
          "Plant9Animation"]:
    for p in glob_sorted(UNITY, f"Animations/{d}/*.png"):
        add(f"Assets/Sprites/Animations/{d}/{p.name}", p)

# Acidator (dropper, stretch M6) + Clamissaint (tentacle, stretch M6)
for name in ["AcidatorAnimation_character_img2.png", "AcidatorAnimation_character_data.bytes",
             "AcidatorPoop.png"]:
    add(f"Assets/Sprites/Animations/Acidator/{name}", UNITY / "Animations" / "Acidator" / name)
clam_frames = glob_sorted(UNITY, "Animations/Clamissaint/Clamissaint0*.png")
for p in every2(clam_frames):
    add(f"Assets/Sprites/Animations/Clamissaint/{p.name}", p)

# NPCs 20-32 + balls + SidePiranha
for name in ["NPC20.png", "NPC21.png", "NPC22.png", "NPC23.png", "NPC23Mini.png",
             "NPC24.png", "NPC24Ball.png", "NPC25.png", "NPC26.png", "NPC27.png",
             "NPC30.png", "NPC31.png", "NPC31Ball.png", "NPC32.png", "NPC32Ball.png",
             "SidePiranha.png"]:
    add(f"Assets/Sprites/NPCs/{name}", UNITY / "NPCs" / name)
# Beholder frames, every 2nd
beholder_frames = glob_sorted(UNITY, "NPCs/Beholder/*.png")
for p in every2(beholder_frames):
    add(f"Assets/Sprites/NPCs/Beholder/{p.name}", p)
# Critters -- primary atlas per folder
for name in ["FishieAnim_character_img.png", "Critter1_character_img.png",
             "Critter2_character_img.png", "Critter4Export_character_img.png",
             "Critter5_character_img.png"]:
    hits = list((UNITY / "NPCs" / "Critters").glob(f"*/{name}"))
    for p in hits:
        add(f"Assets/Sprites/NPCs/Critters/{p.parent.name}/{p.name}", p)

# Elements: bubbles + whirlpool
for name in ["Bubble3.png", "BubblePop.png", "BubbleSingle.png", "BubbleStream.png"]:
    add(f"Assets/Sprites/Elements/{name}", UNITY / "Elements (Bubbles, flames...)" / name)
whirl_frames = glob_sorted(UNITY, "Elements (Bubbles, flames...)/Whirlpool/*.png")
for p in every2(whirl_frames):
    add(f"Assets/Sprites/Elements/Whirlpool/{p.name}", p)

# Gems (rare shell treasure)
for name in ["SymbolBlue.png", "SymbolGreen.png", "SymbolRed.png"]:
    add(f"Assets/Sprites/Gems/{name}", UNITY / "Gems" / name)

# Intro screen + loading screen
for p in glob_sorted(UNITY, "IntroScreen/*.png"):
    add(f"Assets/Sprites/IntroScreen/{p.name}", p)
add("Assets/Sprites/Misc/loadingScreen.jpeg", UNITY / "Misc" / "loadingScreen.jpeg")

# OldAssets 2021 creatures actually used tonight (M3/M6): crabs, horns, mine, manta+ball, NPC11
for name in ["CrabFlatten.png", "CrabFlatten2.png", "NPC6.png", "NPC6_2.png", "NPC8.png",
             "NPC10.png", "NPC10Ball.png", "NPC11.png"]:
    add(f"OldAssets/Sprites/NPCs/NPC.old/Old/NPC.old/{name}",
        OLD / "NPCs" / "NPC.old" / "Old" / "NPC.old" / name)

# site/img/octomancer sources (screenshots etc, already web-ready)
for p in sorted(SITE_IMG.glob("*.webp")):
    add(f"site-img/{p.name}", p)

# OldAssets 2021 background frames: listed, not copied (483 frames per DECISIONS §2).
OLD_BG_FRAMES = sorted((OLD / "Background").rglob("*.png")) if (OLD / "Background").exists() else []

# ---------------------------------------------------------------------------
# Bucket D, kept (41 files) -- DECISIONS-2026-09-29.md §3.
# ---------------------------------------------------------------------------
D_KEPT = [
    "Assets/Sprites/CampaignMap/TokenBlue.png",
    "Assets/Sprites/CampaignMap/TokenGrey.png",
    "Assets/Sprites/CampaignMap/Trench1.png",
    "Assets/Sprites/Misc/Hands.PNG",
    "Assets/Sprites/Runes/Rune1.png",
    "Assets/Sprites/Runes/Rune2.png",
    "Assets/Sprites/Runes/Rune3.png",
    "Assets/Sprites/Runes/Rune4.png",
    "Assets/Sprites/Runes/Rune5.png",
    "Assets/Sprites/Runes/Rune6.png",
    "Assets/Sprites/UI/Attack.png",
    "Assets/Sprites/UI/Attack2.png",
    "Assets/Sprites/UI/Back.png",
    "Assets/Sprites/UI/Back 1.png",
    "Assets/Sprites/UI/Edit.png",
    "Assets/Sprites/UI/Heart.png",
    "Assets/Sprites/UI/O2.png",
    "Assets/Sprites/UI/Options.png",
    "Assets/Sprites/UI/Plant1.png",
    "Assets/Sprites/UI/Plant2.png",
    "Assets/Sprites/UI/Refresh copy.png",
    "Assets/Sprites/UI/Repeat.png",
    "Assets/Sprites/UI/Repeat 1.png",
    "Assets/Sprites/UI/Score.png",
    "Assets/Sprites/UI/Shell.png",
    "Assets/Sprites/UI/XThick.png",
    "Assets/Sprites/UI/XThin.png",
    "Assets/Sprites/UI/uNPC26.png",
    "Assets/Sprites/UI/AttackRewards/Selector.png",
    "Assets/Sprites/UI/AttackRewards/WhiteWheel.png",
    "OldAssets/Sprites/118174937_328766718316661_572932149976816982_n.png",
    "OldAssets/Sprites/Background/LightRays.png",
    "OldAssets/Sprites/Background/WhiteTop.png",
    "OldAssets/Sprites/NPCs/NPC.old/Old/NeutralPlants.old/Bush2.png",
    "OldAssets/Sprites/NPCs/NPC.old/Old/NeutralPlants.old/Bush5.png",
    "OldAssets/Sprites/NPCs/NPC.old/Old/NeutralPlants.old/BushMini.png",
    "OldAssets/Sprites/NPCs/NPC.old/Old/NeutralPlants.old/Plant1.png",
    "OldAssets/Sprites/NPCs/NPC.old/Old/NeutralPlants.old/Animations/Bush1.CreaExport/Bush1_character_img.png",
    "OldAssets/Sprites/Old/old.UI/StaminaBar.png",
    "OldAssets/Sprites/Old/old.UI/button1.png",
    "OldAssets/Sprites/Old/old.UI/menu.png",  # usable, but never show its text (crude joke line)
]

UNITY_ROOT = ROOT / "octomancer-unity"
for rel in D_KEPT:
    src = UNITY_ROOT / rel
    if not src.exists():
        print(f"MISSING (skipped): {src}")

# ---------------------------------------------------------------------------
# "Never" filenames -- must be 0 hits anywhere under play/ or harvest/.
# ---------------------------------------------------------------------------
NEVER_NAMES = [
    "OverlayNoise.jpg", "Stripes.jpg", "spikes.png", "LavaPool.png",
    "Sigil", "Splat.png", "Bomb.png", "BombBag.png", "BombOverlay.png",
    "Hand.png", "Hand2.png", "Hand3.png", "Skull.png", "Wood.jpg", "Shark.png",
    "Pearl.png", "coin.png", "Coin.png", "GoldMist.png", "ComingSoon.png",
    "Mana.png", "compass.png", "crystal08.png", "lock.png", "WheelOfFortune.png",
    "screw.png",
]


def main():
    do_contact_sheet = "--no-contact-sheet" not in sys.argv
    do_harvest = "--no-harvest" not in sys.argv
    do_playassets = "--no-play-assets" not in sys.argv

    REPORT.mkdir(parents=True, exist_ok=True)
    HARVEST.mkdir(parents=True, exist_ok=True)
    PLAY_ASSETS.mkdir(parents=True, exist_ok=True)

    print(f"Bucket A items: {len(A_ITEMS)}")
    print(f"OldAssets background frames (listed, not copied): {len(OLD_BG_FRAMES)}")

    if do_contact_sheet:
        build_contact_sheet()
    if do_harvest:
        build_harvest()
    if do_playassets:
        build_play_assets()
    write_credits()


def is_image(p: Path):
    return p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".gif")


def build_contact_sheet():
    thumbs = []
    all_sources = list(A_ITEMS) + [(f"D-kept/{rel}", UNITY_ROOT / rel) for rel in D_KEPT if (UNITY_ROOT / rel).exists()]
    for rel, src in all_sources:
        if not is_image(src):
            continue
        try:
            im = Image.open(src).convert("RGBA")
        except Exception as e:
            print(f"contact sheet: could not open {src}: {e}")
            continue
        im.thumbnail((96, 96))
        thumbs.append((rel, im))

    if not thumbs:
        print("contact sheet: nothing to draw")
        return

    cols = 12
    cell_w, cell_h = 110, 128
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (10, 20, 30))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 9)
    except Exception:
        font = ImageFont.load_default()

    for i, (rel, im) in enumerate(thumbs):
        col, row = i % cols, i // cols
        x, y = col * cell_w, row * cell_h
        ox = x + (cell_w - im.width) // 2
        oy = y + (cell_h - 96 - im.height) // 2 + 4
        sheet.paste(im, (ox, oy), im if im.mode == "RGBA" else None)
        label = Path(rel).name
        if len(label) > 16:
            label = label[:14] + "…"
        draw.text((x + 4, y + cell_h - 20), label, fill=(200, 230, 220), font=font)

    out = REPORT / "contact-sheet.png"
    sheet.save(out)
    print(f"contact sheet: {out} ({len(thumbs)} images, {sheet.width}x{sheet.height})")


def build_harvest():
    manifest_lines = [
        "# Octomancer harvest manifest",
        "",
        "Generated by `octomancer-web/tools/export_assets.py`. Bucket A + kept bucket D",
        "art at full resolution (lossless WebP where smaller), the Creature packs and",
        "atlases/JSON as-is, the three music tracks, and the `site/img/octomancer/**`",
        "sources. OldAssets 2021 background animation frames (483) are listed, not",
        "copied, per OVERNIGHT.md M0-3(c).",
        "",
        "| dest | source | owner |",
        "|---|---|---|",
    ]
    total_bytes = 0
    cap_bytes = HARVEST_CAP_MB * 1024 * 1024
    listed_only = []

    for rel, src in A_ITEMS:
        owner = "Milan Švancara (bucket A)"
        dest = HARVEST / rel
        if is_image(src) and src.suffix.lower() != ".webp":
            dest = dest.with_suffix(".webp")
        size = harvest_one(src, dest, total_bytes, cap_bytes, listed_only, rel, owner)
        total_bytes += size
        rec_dest = dest.relative_to(HARVEST) if size >= 0 else None
        manifest_lines.append(
            f"| {rec_dest if size >= 0 else '(listed only, over cap)'} | `{src.relative_to(ROOT)}` | {owner} |"
        )

    for rel in D_KEPT:
        src = UNITY_ROOT / rel
        if not src.exists():
            continue
        owner = "Daniel Necesal (bucket D, kept)"
        dest_rel = f"D-kept/{rel}"
        dest = HARVEST / dest_rel
        if is_image(src) and src.suffix.lower() != ".webp":
            dest = dest.with_suffix(".webp")
        size = harvest_one(src, dest, total_bytes, cap_bytes, listed_only, dest_rel, owner)
        total_bytes += size
        manifest_lines.append(
            f"| {dest.relative_to(HARVEST) if size >= 0 else '(listed only, over cap)'} | `{src.relative_to(ROOT)}` | {owner} |"
        )

    # Music: MP3s as-is, WAV as FLAC.
    sounds = UNITY_ROOT / "Assets" / "Sounds"
    music_specs = [
        ("Mj 362 - Octopus Medles.mp3", "audio/Mj 362 - Octopus Medles.mp3", None),
        ("Mj -  312 Q.mp3", "audio/Mj -  312 Q.mp3", None),
        ("Svancara Strings - Flûte de forêt.wav", "audio/Svancara Strings - Flûte de forêt.flac", "flac"),
    ]
    for name, dest_rel, conv in music_specs:
        src = sounds / name
        if not src.exists():
            print(f"MISSING music (skipped): {src}")
            continue
        dest = HARVEST / dest_rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if conv == "flac":
            ok = ffmpeg_to_flac(src, dest)
            size = dest.stat().st_size if ok and dest.exists() else 0
        else:
            shutil.copy2(src, dest)
            size = dest.stat().st_size
        total_bytes += size
        manifest_lines.append(f"| {dest_rel} | `{src.relative_to(ROOT)}` | Milan Švancara (music) |")

    manifest_lines.append("")
    manifest_lines.append(f"OldAssets 2021 background frames (listed, not copied): {len(OLD_BG_FRAMES)} files under "
                           f"`octomancer-unity/OldAssets/Sprites/Background/`.")
    manifest_lines.append("")
    manifest_lines.append(f"**Total harvested: {total_bytes / (1024*1024):.2f} MB (cap {HARVEST_CAP_MB} MB).**")
    if listed_only:
        manifest_lines.append("")
        manifest_lines.append("Over cap, listed only (not copied):")
        for rel in listed_only:
            manifest_lines.append(f"- {rel}")

    (HARVEST / "MANIFEST.md").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")
    print(f"harvest total: {total_bytes / (1024*1024):.2f} MB")


def harvest_one(src, dest, total_so_far, cap_bytes, listed_only, rel, owner):
    if total_so_far >= cap_bytes:
        listed_only.append(rel)
        return -1
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        if is_image(src) and src.suffix.lower() != ".webp":
            im = Image.open(src)
            im.save(dest, "WEBP", lossless=True, quality=100, method=6)
        else:
            shutil.copy2(src, dest)
    except Exception as e:
        print(f"harvest: failed {src}: {e}")
        listed_only.append(rel)
        return -1
    return dest.stat().st_size


def ffmpeg_to_flac(src, dest):
    if not os.path.exists(FFMPEG):
        print(f"ffmpeg not found at {FFMPEG}, skipping flac conversion of {src.name}")
        return False
    try:
        subprocess.run([FFMPEG, "-y", "-i", str(src), str(dest)], check=True,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception as e:
        print(f"ffmpeg failed for {src}: {e}")
        return False


# ---------------------------------------------------------------------------
# M1/M2 display-size export into play/assets/.
# ---------------------------------------------------------------------------
PLAY_SET = [
    ("tiles", "Tiles/TilesetMilan/*.png"),
]

def build_play_assets():
    assets_rows = []

    def export(name_prefix, src, max_dim=None, quality=90):
        try:
            im = Image.open(src).convert("RGBA")
        except Exception as e:
            print(f"play/assets: could not open {src}: {e}")
            return
        if max_dim and max(im.size) > max_dim:
            im.thumbnail((max_dim, max_dim))
        out_name = f"{name_prefix}.webp"
        out = PLAY_ASSETS / out_name
        out.parent.mkdir(parents=True, exist_ok=True)
        im.save(out, "WEBP", quality=quality, method=6)
        assets_rows.append((f"assets/{out_name}", src.relative_to(ROOT), "Milan Švancara"))

    # Tileset edges -- keep native size, these are small tile masks.
    for p in glob_sorted(UNITY, "Tiles/TilesetMilan/*.png"):
        export(f"tiles/tile-{p.stem}", p)

    # Background
    export("bg-far", UNITY / "Background" / "BGFar.png", max_dim=1024, quality=82)
    export("plant1", UNITY / "Background" / "Plant1.png", max_dim=256)
    export("plant2", UNITY / "Background" / "Plant2.png", max_dim=256)

    # Bubbles
    for name in ["Bubble3", "BubblePop", "BubbleSingle", "BubbleStream"]:
        export(f"bubble-{name.lower()}", UNITY / "Elements (Bubbles, flames...)" / f"{name}.png", max_dim=128)

    # Shell symbols (rare treasure)
    for name, tag in [("SymbolBlue", "blue"), ("SymbolGreen", "green"), ("SymbolRed", "red")]:
        export(f"shell-{tag}", UNITY / "Gems" / f"{name}.png", max_dim=96)

    # HUD heart
    export("ui-heart", UNITY / "UI" / "Heart.png", max_dim=128)

    write_assets_md(assets_rows)

    total = sum(f.stat().st_size for f in PLAY_ASSETS.rglob("*.webp"))
    print(f"play/assets total: {total / 1024:.1f} KB (cap {PLAY_ASSETS_CAP_KB} KB)")


def write_assets_md(rows):
    lines = [
        "# Octomancer play/assets — shipped file ledger",
        "",
        "Every file under `site/octomancer/play/assets/` must have a row here.",
        "The dev deletes anything under `play/` that is not listed (OVERNIGHT.md §2).",
        "",
        "| play/assets file | source (octomancer-unity/) | owner |",
        "|---|---|---|",
    ]
    for dest, src, owner in rows:
        lines.append(f"| `{dest}` | `{src}` | {owner} |")
    lines.append("")
    lines.append("No noise, vignette, spikes or portal files are shipped as images: those are")
    lines.append("code-drawn or excluded (OVERNIGHT.md §2, DECISIONS §1 Q1).")
    (WEB / "ASSETS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_credits():
    text = (
        "# Octomancer credits\n\n"
        "Art & music: Milan Švancara\n\n"
        "Additional UI art and generated textures: Daniel Necesal / code.\n\n"
        "Game code: written for the web port, this overnight run.\n\n"
        "Original game: Octomancer (Unity), `Mejval5/Octomancer`.\n"
    )
    (WEB / "CREDITS.md").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
