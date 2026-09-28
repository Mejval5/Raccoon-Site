# CEO review: Octomancer web port plan

Reviewer: Wren. Date: 2026-09-28. Reviewed: `ARCHITECTURE.md` (Ines), `PLAN.md` (Otto). Spot-checked against the Unity repo (one scene in the build, 15 `com.google` packages, `GeneralSettings.cs:33` sets 300 fps, `CSPPerlinComputeShader.compute` drives `PatternGenerator`/`BackgroundGenerator`, one `#pragma geometry` in SmartLighting2D, no joystick in `MainGame.unity`), the installed editors (6000.3.17f1 with WebGL is there, 83 GB free) and the title page (Start Game is a disabled `<span>`; a global Escape handler jumps to `/`). The claims hold. `Mejval5/Octomancer` is private, which closes Ines's biggest licensing worry.

## Verdict: approved with changes

Direction is right: (A) Unity WebGL behind a hard 2-day spike, no rewrite, paid assets stay compiled, nothing downloads before Start. The spike measures the two things that can actually kill this (upgrade swamp, phone performance) and Otto's throwaway touch input (S7) makes the phone number honest. Start S1 now; the changes below do not block M0.

## Required changes

1. **Nobody on the team can run Firefox or Safari, but the plan gates on them.** §2 says agents test in the Chromium pane, yet M0 assigns "Chrome + Firefox desktop by Reef", go/no-go criterion 2 requires Firefox, and T12 lists Firefox and Safari. Change: go/no-go criterion 2 becomes Chrome only; Firefox (2 minutes on Daniel's PC) and Safari move onto Daniel's device checklist (S10) as reported, not gated, until M1, where Firefox becomes a gate on Daniel's run.
2. **"Within seconds" (§1) and "≤ 25 MB" (§2, D7) contradict each other on a phone.** 25 MB on a normal 4G link is 20–30 s of progress bar. Change: the ASTC (mobile) variant ships at **≤ 15 MB** as the M3 gate, DXT ≤ 25 MB; T4's acceptance uses those numbers, and T12 reports first-visit time-to-play on Chrome's "Fast 4G" throttle with a target of ≤ 20 s. Repeat visits stay < 5 s. If the diet can't reach 15 MB, Ines explains why before M3, not after.
3. **The spike must show Daniel what desktop looks like before he decides D6.** The playfield is portrait (1000x2000). "Pillarboxed on desktop" means a phone-shaped strip in the middle of a 1920x1080 screen right after a full-screen cave zoom. `CameraPos.cs` already fits any aspect and the Windows build proved it. Change: S10 adds two 1920x1080 screenshots of the same endless room, pillarboxed and camera-fitted, so D6 is decided on evidence. Wide desktop may still land in M4; it should not be decided blind.
4. **Daniel's device run is on the spike's critical path but has no slot.** S11 depends on it, D4 is unanswered, and the box is 2 days. Change: Otto books Daniel's 30 minutes (Android, iPhone, Firefox) for the end of day 2 before S1 starts, and S10's checklist is written on day 1 so the run is not waiting on Reef. No device run means no go/no-go, and the box does not stretch.
5. **Copy that lies to the player.** `site/octomancer/index.html` (lines 7–9, meta and OG description) says Start Game launches "the archived 2021 underwater arcade/platformer". It will launch the 2023 single-player Octopus Adventure. Fold this into D5 / M2 with the archive line: one honest sentence, both places.

Accepted as written: the kill criteria and the one-day compile timebox (S4), the "one extra day" rule for borderline results, the ban on loose assets in `site/` with Reef's gate check, D1/D3/D8 defaults, and the iframe handover in ARCHITECTURE §2A (it also solves the Escape conflict I verified on the title page).

## Decisions to push Daniel on, in order

- **D4 (phones and 30 min per gate).** Push first: it is the only thing that makes the spike a decision instead of an opinion. Recommend: his own Android and iPhone over LAN, plus Firefox on his PC.
- **D9 (Milan's OK, font, SFX).** Push now, not at M3. It costs one message and it is the only decision that can kill the project after all the work is done. Recommend: ask Milan this week; ship compiled only; swap Orange Juice if it is personal-use only.
- **D6 (desktop framing).** Decide after the S10 screenshots. Recommend: camera-fitted on desktop if the Windows-build fit looks right; otherwise pillarbox for v1 and widen in M4.
- **D7 (budget).** Recommend: accept 15 MB mobile / 25 MB desktop and no download before Start. Prefetch is M4 at most.

D1, D2, D3, D5, D8: take Otto's defaults. They do not need Daniel's time now.

## What the player sees first

The cave, Start Game, a zoom into the light, then a progress bar for 10–20 s on a phone before the real octopus with real Box2D feel and the real tutorial. This plan gets there, and it is the only one of the two that keeps it the real Octomancer; the changes above make sure the wait is measured and honest, and that desktop players get a game and not a strip.
