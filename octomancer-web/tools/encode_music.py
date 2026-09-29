#!/usr/bin/env python3
"""Encode Milan's two music tracks to small web audio (OVERNIGHT.md §2 Audio,
track S). Offline tool only -- never ships (§2 "Offline tools ... never ship").

Inputs (octomancer-unity/Assets/Sounds/, DECISIONS-2026-09-29.md §2):
  - "Mj 362 - Octopus Medles.mp3"          -> play/audio/medles.{opus,mp3}
  - "Svancara Strings - Flûte de forêt.wav" -> play/audio/flute.{opus,mp3}

Both to Ogg Opus 96 kbps and MP3 96 kbps (the page picks one with
`canPlayType`); target ~0.9 MB each per OVERNIGHT.md §2.

Usage: python encode_music.py
Requires ffmpeg with libopus + libmp3lame (D:\\Program Files\\ffmpeg-7.1-full_build\\bin\\ffmpeg.exe).
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FFMPEG = r"D:\Program Files\ffmpeg-7.1-full_build\bin\ffmpeg.exe"
UNITY_SOUNDS = REPO / "octomancer-unity" / "Assets" / "Sounds"
OUT_DIR = REPO / "site" / "octomancer" / "play" / "audio"

TRACKS = [
    # (source filename under UNITY_SOUNDS, output basename)
    ("Mj 362 - Octopus Medles.mp3", "medles"),
    ("Svancara Strings - Flûte de forêt.wav", "flute"),
]


def encode(src: Path, dest_base: Path):
    dest_base.parent.mkdir(parents=True, exist_ok=True)
    opus = dest_base.with_suffix(".opus")
    mp3 = dest_base.with_suffix(".mp3")
    subprocess.run(
        [FFMPEG, "-y", "-i", str(src), "-vn", "-c:a", "libopus", "-b:a", "96k", str(opus)],
        check=True,
    )
    subprocess.run(
        [FFMPEG, "-y", "-i", str(src), "-vn", "-c:a", "libmp3lame", "-b:a", "96k", str(mp3)],
        check=True,
    )
    return opus, mp3


def main():
    if not Path(FFMPEG).exists():
        print(f"ffmpeg not found at {FFMPEG}", file=sys.stderr)
        sys.exit(1)
    for filename, base in TRACKS:
        src = UNITY_SOUNDS / filename
        if not src.exists():
            print(f"missing source: {src}", file=sys.stderr)
            sys.exit(1)
        opus, mp3 = encode(src, OUT_DIR / base)
        for f in (opus, mp3):
            kb = f.stat().st_size / 1024
            print(f"{f.relative_to(REPO)}: {kb:.0f} KB")


if __name__ == "__main__":
    main()
