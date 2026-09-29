# Octomancer: Daniel's decisions of 2026-09-29, and the facts the night needs

Beaver (tech lead). Daniel answered the twelve questions from the pre-migration investigation (read-only on both repos, 2,563 images sorted by rule, by eye on contact sheets, and against the scene/prefab GUID graph). The investigation files lived in a session scratchpad that will not survive, so everything the overnight run needs is copied here. `OVERNIGHT.md` applies all of it.

## 1. Decisions

| # | Question | Decision | Why | Applied in OVERNIGHT |
|---|---|---|---|---|
| Q1 | Art list | Beaver amends the art rule now. Excluded: `Background/OverlayNoise.jpg` (iStock photo, Getty licence URL in its XMP), `Background/Stripes.jpg` (microstock vector, IPTC keywords), `Sprites/Portal/**` (nebula renders), `Traps/spikes.png` (3D render). Noise and caustics drawn in code; spikes are Milan's `NPC.old/NPC6` horns or code. | M1-2 as first written shipped a Getty-licensed texture in the first hour. | §2 art rule, M0-3, M1-2 |
| Q2 | Bucket D (unclear provenance) | Daniel reviewed the 77 sampled files: **36 cut** (not original game art, never use), **41 kept** (original game art, usable). The 38 he did not see: skip. Bomb and pearl stay **code-drawn** (their sprites are cut); UI heart, shell, O2, score and the runes are allowed. Lists in §3. | Provenance is weakest in D; Daniel is the only one who knows. | §2 art rule, M0-3, M2-3, M4-1 |
| Q3 | Milan's OK and credit | Build locally, publish nothing tonight. Credit "Art & music: Milan Švancara" in the game and in `web/CREDITS.md`. Milan should still confirm the Beholder (saved in GIMP 2022) and the title-screen cave layers (no source in the Unity repo). | Blocks going live, not the night. | §2, §6 D1/D6 |
| Q4 | Enemies | All of them: urchin, piranha, cannon + shot, Beholder, **plus** the 2021 creatures: crabs, `NPC8` spiked mine, `NPC10` manta; the tentacle (Clamissaint) and the dropper (Acidator) if cheap. Behaviour simple and fun. | More variety is more fun; Milan drew them. | M3 (core four), M6 (2021 creatures) |
| Q5 | Pickups | Code-drawn pearls + drifting glowing plankton. The 2021 shell symbols `Gems/SymbolBlue/Green/Red` (Milan's) are a rare 50-point treasure. | The 2023 pearls are `Misc/coin.png` tinted (Daniel's coin art), and gold uses paid GUI PRO Kit icons. | M2-3, M4-1 |
| Q6 | Octopus | **Bake Milan's real animation** offline (Python, Pillow) to a ~40-frame sprite sheet; eyes separate, code-driven. The code-drawn octopus is only the M1 placeholder. The bake runs early, in the second dev slot during M2. | It is the one thing that makes it look like Octomancer, at the cost of one `drawImage` per frame. | §2, track B |
| Q7 | Music | "Mj and Flûte is Milan's and we ship it." `Mj 362 - Octopus Medles` = in-game loop; `Svancara Strings - Flûte de forêt` = game-over and pause; `Mj - 312 Q` harvested, not used yet. Opus + MP3 fallback ~96 kbps, started only after the first input. `Sounds/Effects/music.wav` (unknown) and every library SFX stay out; SFX synthesised in code (or CC0 with its licence recorded). | Music is most of the mood. | §2 audio, track S |
| Q8 | Dirty checkout | Daniel cleans it before the run. M0-0's clean-tree pre-flight stays. | Two efforts sharing one checkout can commit each other's files. | M0-0 |
| Q9 | Push | No push at all. | Morning review happens locally. | §5 |
| Q10 | Where the game lives | Raccoon-Site `master`, `site/octomancer/play/`. | No repo surgery tonight. | §2, §5 |
| Q11 | Repo end state | Decided after Daniel plays v1. Beaver recommends (b): rename `Mejval5/Octomancer` to `Octomancer-Unity` and archive it; a fresh `Mejval5/Octomancer` holds only the web game (`git subtree split`); remove the site's `octomancer-unity` submodule first. | Paid packs sit in the only content commit, so the old repo can never go public. | §5, §6 D7 |
| Q12 | Harvest | (a): web-ready A art ≤ 40 MB into `octomancer-web/harvest/` with `MANIFEST.md`; the archived Unity repo stays the vault. Still open for Daniel: 2023 screenshots from a build, Plastic SCM history. | Nothing should depend on a Unity checkout afterwards. | M0-3, §6 D8 |
| — | Title page | The Information page redesign is on branch `octomancer-archive` (worktree `D:\Projects\rs-archive`, commit `65a5b2df`), not merged. Its Start Game is a `<button id="octoStartGame" class="octo-menu-item is-disabled" aria-disabled="true">` with a "Work in progress" label and a tap-to-reveal script. The night never touches `site/octomancer/archive/**`, and touches `site/octomancer/index.html` only in M5-1, on top of that redesign. | Avoid conflicting with unmerged work. | §5, M5-1 |

## 2. Asset facts

- **Buckets:** A Milan's art 810 (277 in `Assets/`, 533 in `OldAssets/`, 483 of those 2021 background animation frames); B Daniel's additions 152; C third party 1,486; D unclear 115 (now resolved by §3).
- **A, the useful part:** `Tiles/TilesetMilan` (31 wall-edge masks), `Background/` BGFar, BGFar2, BGCombined, Eye×3, Hole×2, Plant1/2, Tilemap.png; `Animations/Octopus` (Creature), 9 plant animations, Acidator, Greeranha, Clamissaint; `NPCs/` 31 creatures, 47 Beholder frames (256 px), 10 critters, 15 greyscaled; `Elements (Bubbles…)` bubbles + Whirlpool (26); `Gems/` BeholderJar + 3 shell symbols (130 px); `IntroScreen/`, `Misc/loadingScreen.jpeg`, `AppLogo/` (17); `Totem/` (6); `OldAssets/Sprites/NPCs/NPC.old/Old/NPC.old/` (21: crabs, urchin, horns, mine, manta, anemones); `OldAssets/Sprites/Character` (2020 octopus).
- **Enemy art** (paths under `octomancer-unity/`):

| Enemy | File(s) | Size |
|---|---|---|
| Urchin | `Assets/Sprites/NPCs/NPC25.png` | 126×118 |
| Piranha | `Assets/Sprites/NPCs/NPC21.png` (+ `SidePiranha.png`, 256², 268 KB) | 204×128 |
| Cannon + shot | `NPCs/NPC30.png`, `NPCs/NPC32Ball.png` | 112×130, 94×92 |
| Beholder | `NPCs/Beholder/Beholder_00000-45.png` | 252×256 |
| Crabs | `OldAssets/Sprites/NPCs/NPC.old/Old/NPC.old/CrabFlatten.png`, `CrabFlatten2.png` | 1000² canvas each, crop |
| Spiked mine | `…/NPC.old/NPC8.png` | 1000², crop |
| Manta + its ball | `…/NPC.old/NPC10.png`, `NPC10Ball.png` | 1000², crop |
| Spike horns (trap) | `…/NPC.old/NPC6.png`, `NPC6_2.png` | 1000², crop |
| Tentacle (stretch) | `Assets/Sprites/Animations/Clamissaint/Clamissaint0001-0031.png` (16 unique frames) | 1280×720 each |
| Dropper (stretch) | `Assets/Sprites/Animations/Acidator/AcidatorAnimation_character_data.bytes` (msgpack Creature data, looks like the same pack format; verify before relying on it) + `AcidatorAnimation_character_img2.png`; shot `AcidatorPoop.png` or `NPCs/NPC31Ball.png` | 1024² atlas |

- **Not usable:** pearls are `Misc/coin.png` tinted (`Prefabs/Currencies/Pearl*.prefab`); Gold, GoldPile, WallGold, Diamond, ShinyGem use GUI PRO Kit icons; ElectroRock, IceWall, Gate, GameButton, Cable, PushableBlock, CrushBlock use B art.
- **Screenshots:** everything existing is from the 2021 multiplayer era (`site/img/octomancer/**`); no 2023 screenshot or build exists anywhere.
- **Audio** (`Assets/Sounds/`): `Mj 362 - Octopus Medles.mp3` 78 s, 192 kbps, 1.9 MB (the 2023 in-game track); `Mj -  312 Q.mp3` (two spaces) 66 s, 1.6 MB; `Svancara Strings - Flûte de forêt.wav` 69 s, 12 MB. `ffmpeg` 7.1 with libopus and libmp3lame is at `D:\Program Files\ffmpeg-7.1-full_build\bin\ffmpeg.exe`.
- **Title page, not merged:** see the last row of §1.
- **gh CLI** gets 404 on `Mejval5/Octomancer`; only SSH works. Irrelevant tonight (no pushes).

## 3. Bucket D verdicts (Daniel, from the contact sheet)

Paths relative to `octomancer-unity/`.

**Cut, never use (36):** `Assets/Sprites/Elements (Bubbles, flames...)/Sigils/*` (Bug, Dragon, Fire, Grass, Ice, Rock Sigil), `Elements (Bubbles, flames...)/Splat.png`; `Misc/Bomb.png`, `BombBag.png`, `BombOverlay.png`, `Hand.png`, `Hand2.png`, `Hand3.png`, `Skull.png`, `Wood.jpg`; `NPCs/Characters/Shark.png`; `Portal/Portal 4, 7, 10, 13, 16, 19.png` and `Portal/Stars/star (1), (2), (6), (13).png`; `Traps/LavaPool.png`, `Traps/spikes.png`; `UI/AttackRewards/WheelOfFortune.png`, `UI/AttackRewards/screw.png`, `UI/ComingSoon.png`, `UI/Currencies/Mana.png`, `UI/Pearl.png`, `UI/compass.png`, `UI/crystal08.png`, `UI/lock.png`.

**Kept, original game art (41):** `Assets/Sprites/CampaignMap/TokenBlue.png`, `TokenGrey.png`, `Trench1.png`; `Misc/Hands.PNG`; `Runes/Rune1-6.png`; `UI/Attack.png`, `Attack2.png`, `Back.png`, `Back 1.png`, `Edit.png`, `Heart.png` (112×80), `O2.png`, `Options.png`, `Plant1.png`, `Plant2.png`, `Refresh copy.png`, `Repeat.png`, `Repeat 1.png`, `Score.png`, `Shell.png` (87×81), `XThick.png`, `XThin.png`, `uNPC26.png`; `UI/AttackRewards/Selector.png`, `WhiteWheel.png`; `OldAssets/Sprites/118174937_328766718316661_572932149976816982_n.png`; `OldAssets/Sprites/Background/LightRays.png` (1200×3000), `WhiteTop.png`; `OldAssets/Sprites/NPCs/NPC.old/Old/NeutralPlants.old/Bush2.png`, `Bush5.png`, `BushMini.png`, `Plant1.png`, `Animations/Bush1.CreaExport/Bush1_character_img.png`; `OldAssets/Sprites/Old/old.UI/StaminaBar.png`, `button1.png`, `menu.png` (usable, but it carries a crude joke line: never show its text).

**Unseen (the other 38 D files): skip.**

## 4. The octopus bake recipe (track B)

**Inputs** (`octomancer-unity/Assets/Sprites/Animations/Octopus/`): `OctoRemasteredExport_character_data.creature_pack.bytes` (656 KB, what the game loads) and `OctoRemasteredExport2_character_img.png` (1000² atlas, 61 KB: body with tentacles, 3 eye pairs, closed eyes, angry eyes). The `.json` is only needed for region names.

**Pack layout** (plain msgpack; `msgpack` is not installed, so use the 40-line reader below): the top level is a list `v` of 992 items. `v[1]` = flat list of clip ranges `[start0, end0, start1, end1, …]` indexing into `v`; `v[2]` = 1,200 triangle indices (400 triangles); `v[3]` = 534 floats, rest points (267 vertices, x,y, y up); `v[4]` = 534 floats, UVs (u,v in 0..1, **not** flipped: pixel = `u*W, v*H`). A clip at `v[s]` is its name (string), then groups of four: `time (float), points (534 floats, already deformed), [], []`, until the range end. 18 clips, keys every 2 frames: `Swim05` (13 keys, t 0-22), `Swim05Extra` (19, 0-35), `Swim05Origin`, `Swim05OriginExtra`, `Idle`, `Idle4` (12, 0-20), `Idle4Blink`, `Idle4BlinkDouble`, `Idle4BlinkSingleEye`, `Idle4Eyetilt`, `Idle4Headtilt`, `Idle4Headshake`, `Idle4Swirl` (17, 0-30), `Idle5`, `Idle5Rotation` (17, 0-30), `IdleShake`, `IdleBlink`, `IdleWave1`.

**Regions** (from the JSON `mesh.regions`): `TextureMesh0` = body, points 0-222, indices 0-1043; `EyeRight` = points 223-244, indices 1044-1121; `EyeLeft` = points 245-266, indices 1122-1199. `uv_swap_items` is empty, so the eye variants (closed, angry, other pairs) are separate atlas rects: find them by eye in the atlas and record the rects.

**Recipe:** for each frame, warp every body triangle (indices < 1044) from atlas UVs to the frame's points with an affine map (Pillow `Image.transform(..., Image.AFFINE, ...)`), masked by the triangle polygon grown by 1 px against seams. **Warp only the triangle's bounding box**, not the whole canvas (the proof took 80 s for 18 frames doing full-canvas warps). Render at 2x and downscale for anti-aliasing. For each eye region record per frame: centroid, angle (first point to centroid), scale vs rest. Interpolate linearly between keys to get the frame count you need.

**Proof-of-concept code** (Beaver's `bake_probe.py`, no Creature code; it rendered real Swim05 and Idle4Blink frames):

```python
import struct
def unpack(b, i=0):
    t=b[i]
    if t<=0x7f: return t,i+1
    if 0x80<=t<=0x8f: return _map(b,i+1,t&15)
    if 0x90<=t<=0x9f: return _arr(b,i+1,t&15)
    if 0xa0<=t<=0xbf: n=t&31; return b[i+1:i+1+n].decode('utf8','replace'),i+1+n
    if t>=0xe0: return t-256,i+1
    if t==0xc0: return None,i+1
    if t==0xc2: return False,i+1
    if t==0xc3: return True,i+1
    if t==0xca: return struct.unpack('>f',b[i+1:i+5])[0],i+5
    if t==0xcb: return struct.unpack('>d',b[i+1:i+9])[0],i+9
    if t==0xcc: return b[i+1],i+2
    if t==0xcd: return struct.unpack('>H',b[i+1:i+3])[0],i+3
    if t==0xce: return struct.unpack('>I',b[i+1:i+5])[0],i+5
    if t==0xd0: return struct.unpack('>b',b[i+1:i+2])[0],i+2
    if t==0xd1: return struct.unpack('>h',b[i+1:i+3])[0],i+3
    if t==0xd2: return struct.unpack('>i',b[i+1:i+5])[0],i+5
    if t==0xd9: n=b[i+1]; return b[i+2:i+2+n].decode('utf8','replace'),i+2+n
    if t==0xda: n=struct.unpack('>H',b[i+1:i+3])[0]; return b[i+3:i+3+n].decode(),i+3+n
    if t==0xdc: n=struct.unpack('>H',b[i+1:i+3])[0]; return _arr(b,i+3,n)
    if t==0xdd: n=struct.unpack('>I',b[i+1:i+5])[0]; return _arr(b,i+5,n)
    if t==0xde: n=struct.unpack('>H',b[i+1:i+3])[0]; return _map(b,i+3,n)
    raise ValueError(hex(t))
def _arr(b,i,n):
    out=[]
    for _ in range(n): v,i=unpack(b,i); out.append(v)
    return out,i
def _map(b,i,n):
    out={}
    for _ in range(n): k,i=unpack(b,i); v,i=unpack(b,i); out[k]=v
    return out,i

v,_=unpack(open(PACK,'rb').read())
idx,pts,uvs=v[2],v[3],v[4]
clips={}; r=v[1]
for k in range(0,len(r)-2,2):
    s0,e0=r[k],r[k+1]
    if not isinstance(v[s0],str): continue
    frames=[]; j=s0+1
    while j+1<=e0 and isinstance(v[j],float):
        frames.append((v[j],v[j+1])); j+=4
    clips[v[s0]]=frames
# per triangle: src = uv*atlas size, dst = (cx + x*S, cy - y*S); solve the affine dst->src
# (a,b,c,d,e,f) and atlas.transform(size, Image.AFFINE, (a,b,c,d,e,f), Image.BILINEAR),
# paste through a polygon mask of dst.
```

The same format covers Greeranha, Acidator, the 9 plant animations, 5 critters and the 2021 octopus (`NPCs/AnimationOcto/Chobotnicka`), so the tool should take the pack, atlas and clip list as arguments.
