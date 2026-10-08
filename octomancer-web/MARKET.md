# Octomancer: how to get it to market (and get paid)

Author: Fox (CEO). Date: 2026-10-08. Status: strategy doc for Daniel, no code. Written after reading `HANDOVER.md`,
`V2-PLAN.md`, `VIBE-REVIEW.md`, `CONTROLS-IDEAS.md`, `SPELLS-PICK.md`, `CREDITS.md`, `ASSETS.md`, the Unity repo's
`LICENSE` and `README.md`, and the live game. Every external fact below carries its source and the date I checked it
(all checks 2026-10-08). Anything I could not confirm against a primary source is marked **[unverified]**. Nothing in
section 6 is legal or tax advice; it is a map of what to ask a professional.

## 0. Executive summary (one screen)

**The short answer: yes, an HTML game can sell on Steam, and it is not weird.** CrossCode (NW.js, Very Positive, 10k+
reviews), OMORI (RPG Maker MV = NW.js, 97% of 54k reviews), Vampire Survivors (Phaser in a wrapper until Aug 2023,
after it had already sold millions) and every RPG Maker MV/MZ game on Steam ship exactly this way: Chromium in a box
plus a small Steamworks binding. The player never knows. What Steam needs from us is an `.exe`, controller support,
and a store page, not an engine.

**The plan I recommend, in one line:** web stays the free prototype and the marketing funnel; Steam (via Electron +
steamworks.js) is the product people pay for; no engine change unless a measurable gate says so.

1. **Phase 0 (now to ~Jan 2027): prove fun on the web.** Keep building on raccoon.website, mirror the build on
   itch.io (free, pay-what-you-want, AI-tagged). Measure plays, retention, run length. Cost: $0.
2. **Phase 1 (~Feb to May 2027): Steam page + demo.** Pay the $100 Steam Direct fee, make a Coming Soon page early
   (it needs 2+ weeks live before release and the fee needs 21 days), ship the Electron build as the demo, enter Steam
   Next Fest (next editions: Feb 2027, June 2027; one fest per game, ever). Gate to continue: **2,000+ wishlists**
   after the page launch, 7,000 before the Early Access launch.
3. **Phase 2 (~late 2027): Early Access at $7.99-9.99** with 2 biomes, all 5 spells, gamepad, achievements, cloud
   saves, Deck playable. Gate: 7k+ wishlists and 80%+ positive demo reviews.
4. **Phase 3 (2028): 1.0** with 4 biomes; ports only if 1.0 clears ~5,000 sales.

**Realistic money.** The median Steam game in 2025 grossed about $249 and 66% earned under $1,000; a game that
reaches 7k wishlists and converts at the 2025 median (0.15 first-week sales per wishlist) sells ~1,000 copies in week
one, ~$7k gross at $9.99, ~$4k net of Steam's 30%, refunds (~10%) and VAT. That is the floor of "it worked". The
upside case (a Next Fest top-5% demo, 20k+ wishlists, 90%+ reviews) is 5-20k copies and $30-120k gross. Plan the
budget on the floor, not the upside.

**Three biggest risks.** (1) Art rights: Milan's art and music, and the generated sprites in his style, have no written
commercial agreement; without one nothing can be sold. (2) Discoverability: 20k games shipped on Steam in 2025; a web
game with no store page builds no wishlists, and wishlists are the only lever a solo dev has. (3) Daniel's time: a
Steam launch is 3-6 months of marketing work that agents cannot do for him (trailer, posts, replying to players).

**Decisions that are Daniel's, not the team's:** the Milan agreement and revenue split; whether generated art ships
in the paid product (I say yes with disclosure, and replace the hero assets over time); the game's price; whether to
form a company before Early Access; the name (keep "Octomancer", file nothing yet). Defaults in section 8.

---

## 1. Can an HTML5 game ship on Steam today? Yes. How.

### 1.1 The wrapper

Steam sells executables; we give it one by bundling the page with a browser engine.

| Wrapper | What it is | Verdict for us |
|---|---|---|
| **Electron** | Chromium + Node in one binary; one known browser version on every machine | **Use this.** Predictable canvas/WebGL behaviour, the Steam overlay works, steamworks.js supports it, the Phaser team publishes a current Electron-to-Steam guide (phaser.io, Mar 2025). Cost: 80-150 MB installer (capgo.app comparison, 2025). |
| **NW.js** | Same idea, older project; what RPG Maker MV/MZ and CrossCode use | Fine, but CrossCode's Steam Deck thread (2022) shows controller bugs tied to the bundled Chromium version; updates are slower than Electron's. Second choice. |
| **Tauri** | Uses the OS webview (WebView2 / WKWebView / WebKitGTK); ~1 MB binary | **No.** Three rendering engines to test, Steam overlay does not work through WebView2 (MicrosoftEdge/WebView2Feedback discussion #4019, Tauri issue #6196), and WebKitGTK on Linux is reported as poor for games and broke one itch.io dev's demo even under Proton (itch.io post 16353658). Steam Deck is Linux. |
| **Neutralinojs** | Lightweight, also OS webview | Same objections as Tauri, smaller community, no Steamworks binding I could find. **No.** |
| **Capacitor** | Mobile: wraps the page in an Android/iOS WebView | Only for Google Play / App Store, see section 2.5. Not for Steam. |

### 1.2 Steamworks from JavaScript

- **steamworks.js** (npm, MIT, Rust-based): achievements, cloud, overlay, stats, the usual. Last push April 2026,
  607 stars, 52 open issues [third-party index, **[unverified]** date]. The README's Electron recipe turns on
  `nodeIntegration` and turns off `contextIsolation` in the renderer, or you keep all Steam calls in the main process
  and talk over IPC (what the Drawize dev did with Greenworks; drawize.com blog). Beaver's call; the IPC route is cleaner.
- **greenworks**: the older binding (Electron 1.0+, Steam SDK 1.62 per its README); its own replacement author says it
  is unmaintained. Fallback only.
- Steam must be running for either to work; the game should also run without Steam (itch build).

### 1.3 What we get and what it costs

- **Achievements, stats, cloud saves:** all exposed by steamworks.js. Our save is already a small JSON in
  `localStorage` (`save.js`); cloud is "write the same JSON through Steam Cloud". Small.
- **Controller:** the one real piece of new work. Today the game has keyboard, mouse and touch (`input.js`,
  `touch-ui.js`). Steam Deck and most Steam players expect a gamepad. The browser Gamepad API
  (`navigator.getGamepads()`) is what Electron-on-Deck devs use (brainhub.eu write-up); the Deck shows up as a standard
  XInput pad. Budget: one dev round for a pad scheme plus glyphs, driven by the controls decision in `CONTROLS-IDEAS.md`.
- **Steam Deck Verified** (partner.steamgames.com/doc/steamdeck/compat, fetched 2026-10-08): full controller support by
  default, correct glyphs for the active device, on-screen keyboard if we ever ask for text (the seed field), run at
  1280x800 or 1280x720, smallest text 9 px (12 recommended) at 800p, 30 fps at 800p default, no "unsupported OS"
  warnings, no launcher. A native Linux Electron build skips Proton entirely. Our fixed 50 Hz sim and 20 MB canvas
  budget on phones say 800p at 30+ fps is not the problem; the pad and the text sizes are. I could not find a
  published Deck Verified result for any Electron/NW.js game (the Steam pages I fetched for CrossCode and OMORI did
  not expose the badge to the fetcher) **[unverified]**; target "Playable" first, "Verified" later.
- **File size:** the game is 8 MB on disk (265 files, ~25k lines of JS). The Steam build will be the Electron runtime
  plus that: expect 100-170 MB installed. Nobody cares at that size.
- **Mac:** Electron Mac builds must be signed and notarized with a Developer ID (electron.build/docs/notarization),
  which means the $99/yr Apple Developer Program. Skip Mac at Early Access; add it at 1.0 if the Apple account exists
  for iOS anyway.
- **Known HTML5 games that did well on Steam:** CrossCode (NW.js; 400k+ copies by 2020 per the Deck13 console
  announcement; Very Positive 93% of 10,262 reviews on 2026-10-08), OMORI (RPG Maker MV, NW.js; Overwhelmingly
  Positive 97% of 54,507), The Coffin of Andy and Leyley (RPG Maker MV; ~2.5M copies estimated by vaporlens.app
  **[unverified estimate]**), Vampire Survivors (Phaser in a wrapper from its Dec 2021 Early Access at $3 until the
  Aug 2023 Unity switch, by which point it had sold millions; gamingonlinux.com 2023-07), Cookie Clicker (Steam Sept
  2021, $4.99, 60k concurrent players at launch; Playsaurus press release; its packaging is **[unverified]**).

### 1.4 The real downsides vs Unity/Godot (be honest)

1. **No console path.** Nintendo does not support HTML5/JS on Switch; CrossCode's Switch port was a rewrite
   (devs: "a LOT of things have to be reprogrammed", html5gamedevs 2019). PlayStation/Xbox are the same. If consoles
   ever matter, that is a port, see section 4.
2. **Performance ceiling.** Canvas 2D at 50 Hz with hundreds of entities is fine today (bot clears 30/30 levels, no
   >50 ms tasks in clean runs); a Noita-style pixel simulation would not be. The design in `VIBE-REVIEW.md` and
   `SPELLS-PICK.md` deliberately stays coarse (tile-scale Coral Wall, no fluid sim), which is the right call for this
   engine.
3. **Anti-cheat / tamper:** the JS ships readable. For a single-player roguelite with a local leaderboard that is
   irrelevant. If a global leaderboard is ever added, it must be server-validated or purely for fun.
4. **Steam "it's just a web game" stigma.** Real in forum comments, invisible in sales (see the list above). The
   store page never mentions the engine.
5. **Three Chromium quirks a year.** Electron updates can change audio autoplay rules, gamepad mapping or canvas
   behaviour. Pin the Electron version per release and test on the Deck.

---

## 2. Other storefronts and channels

### 2.1 itch.io (do this in Phase 0)

- Default revenue share 10%, adjustable 0-100% by the seller; payment-processor fee ~2.9% + $0.30 on top
  (itch.io/docs/creators/payments, fetched 2026-10-08). Pay-what-you-want: any price is a minimum, "$0 or donate" asks
  before download (itch.io/docs/creators/pricing).
- Hosts HTML5 games in the browser, so our build runs there unchanged. itch.io also lets us hand out Steam keys later.
- **Generative-AI disclosure is mandatory** since Nov 2024: a yes/no field on the project page; "yes" adds an
  "AI-Generated" tag, untagged AI content can be delisted (gamingonlinux.com 2024-11; itch.io posts). We have
  generated sprites, so we tag. Expect some players to filter us out; that is the price.
- Vampire Survivors' path (free web build on itch.io March 2021, Steam Early Access Dec 2021) is the model: the web
  version is the demo everyone can share, Steam is where money is.
- Jams: a Ludum Dare or a themed jam entry built from our engine is cheap marketing, but only if Daniel has a weekend.

### 2.2 Web portals (ads money, with strings)

| Portal | Terms I could confirm | Strings | Fit |
|---|---|---|---|
| **Poki** | Two deals: **web exclusive** (default 5 years; Discord and YouTube Playables count as "web"; Steam, mobile stores and consoles are excluded) or **non-exclusive flat fee** with no revenue share (developers.poki.com/guide/revenue-deal-types, fetched 2026-10-08). Split not published; an older sdk.poki.com page said 100% on traffic you bring, 50% on traffic Poki brings **[unverified]**. Third parties cite a < 8 MB initial download rule **[unverified]**. | Exclusivity would end the raccoon.website and itch.io builds for 5 years. | **No** while the web build is our funnel. Revisit a non-exclusive flat fee after 1.0 only. |
| **CrazyGames** | Initial load <= 50 MB, total <= 250 MB, <= 1,500 files; Basic Launch (no SDK, no money, they watch retention) then Full Launch with their SDK and their ads only; IAP invite-only via Xsolla (docs.crazygames.com/requirements, fetched 2026-10-08). No exclusivity requirement on the page; third parties cite 50-70% ad share and a EUR 100 Tipalti payout minimum **[unverified]**. | Must work with AdBlock; their SDK in the build. | **Maybe, in Phase 0 as a traffic experiment**: Basic Launch costs nothing and tells us retention against thousands of other games. Ads money will be small (a niche roguelite is not a Poki-style casual hit). |
| **Newgrounds** | Ad revenue share, $50 payout minimum, Supporter-funded pool; share not published (construct.net forum quoting Newgrounds; cinevva guide 2026) **[unverified %]**. | None real. | Cheap to post; nostalgia audience likes exactly this kind of game. Low priority. |
| **GamePix / GameDistribution / Playgama** | GamePix ~45% to the dev (dealroom profile) **[unverified]**; GameDistribution 50-70% minus the host site's cut **[unverified]**. | Their SDK, their ads. | Skip. Volume of pennies, and they syndicate the game to sites we do not control. |

Rule for all portals: **ads only on portal builds, never on raccoon.website, itch.io or Steam.** That respects the "no
flashy mobile monetization" rule and keeps our own build clean.

### 2.3 Steam (the main store)

- **$100 USD per app**, non-refundable, recouped from the first payout after $1,000 adjusted gross
  (partner.steamgames.com/doc/gettingstarted/appfee). **21-day wait** from paying to being allowed to release; store
  page and build reviews take 1-5 days each; the first titles need a Coming Soon page visible for **at least two
  weeks** before release (partner.steamgames.com/doc/gettingstarted/onboarding). Tax interview (W-8BEN for a Swiss
  resident), 2-7 business days to verify (partner.steamgames.com/doc/finance/taxfaq).
- **Revenue share 30%** (25% above $10M, 20% above $50M; widely reported, I did not fetch Valve's own page
  **[unverified wording]**). Valve collects and remits VAT where it must; our share is computed on revenue net of VAT.
- **Demos** can have their own store page since July 2024, with a prominent link back to the main game; a demo
  release can trigger the wishlist e-mail (partner.steamgames.com/doc/store/application/demos; e-mail trigger
  **[unverified]**).
- **Early Access rules** (partner.steamgames.com/doc/store/earlyaccess, fetched 2026-10-08): not for prototypes
  ("if you're still working out what makes the game fun, it's probably too early"); must be playable and have a
  gameplay trailer; price cannot exceed any other store; no permanent discount; after a price rise, 30 days before any
  discount; must answer the EA questionnaire (why, how long, what differs at 1.0, what is in it now, pricing, community).
- **Steam Next Fest**: Oct 19-26 2026 (registration closed Aug 31, demo due Sep 21); one fest per game, ever; game
  must be unreleased and have a public page and a live demo (partner.steamgames.com Next Fest docs; third-party
  guides for the exact dates). **We missed October 2026; February 2027 is the first realistic one, June 2027 the safe one.**

### 2.4 Epic, GOG, Microsoft Store

- **Epic Games Store**: 12% cut, $100 per game self-publishing fee (pcgamesinsider.biz 2023); Wikipedia says 0% under
  $1M since June 2025 **[unverified]**. Epic requires achievements and a few store features; traffic for small indies is
  thin. Do it at 1.0 for the 12% if the build already exists; not before.
- **GOG**: curated, DRM-free, 30% historically; sold to co-founder Kiciński in Dec 2025, terms since **[unverified]**.
  Submit at 1.0 if they want it; do not plan around it.
- **Microsoft Store (PC)**: 12% since 2021 (pcgamesinsider.biz). Needs an MSIX package of the Electron build; small
  audience. Optional at 1.0.
- **Consoles**: only via a native port and a publisher or porting house; see section 4. Not before 1.0 has numbers.

### 2.5 Google Play and the App Store (phones)

The game already runs on phones; that is our unusual strength. But paid mobile premium is a hard sell and F2P with ads
or IAP is exactly what Daniel ruled out.

- **Google Play**: $25 one-time registration; 15% on the first $1M per year (Google 2021 policy; a 2026
  restructuring into "service fee + billing fee" for US/UK/EEA is reported by secondary sources **[unverified]**).
  Capacitor wraps the page in the Android System WebView; performance "varies by device" (capgo.app) and our 20 MB
  canvas budget was tuned for exactly that, so a Capacitor build is plausible. Daniel has shipped here before
  (`com.brotagonists.octomancer`, now 404), so the account may still exist.
- **App Store**: $99/yr; Small Business Program 15% under $1M. **Guideline 4.2 (minimum functionality)** rejects
  "a website in a shell"; games that use native plugins (haptics, Game Center, IAP, offline) pass in practice
  (mobiloud, superappp 2026 guides; not Apple's own text, **[unverified]**). A TWA/PWA is not accepted on iOS at all.
- **Recommendation:** phones stay a **free web build** (raccoon.website, itch.io) through Phase 2. A paid
  **premium Android/iOS build at $3.99-4.99 via Capacitor** is a Phase 3 option only if Steam proves demand; no ads, no
  IAP, ever, in our own builds. That keeps the natural-fantasy rule intact and avoids building a shop we do not want.

---

## 3. Business models that fit (and which to avoid)

The game: a Spelunky 2 + Noita-flavoured underwater roguelite, 20-30 min runs, permadeath, no meta-currency, art rule
"clams, coral, kelp, bioluminescence; no coins, gold, sparkles, chests or flashy UI". Models that fit a run-based
premium game and that rule:

| Model | Fit | Notes |
|---|---|---|
| **Premium on Steam, $7.99-9.99 EA, $12.99-14.99 at 1.0** | **Core.** | Comparable: Spelunky 2 $19.99, Noita $19.99, Vampire Survivors $3->$4.99, Dome Keeper $17.99, Coffin $11.99. We start below Noita (one biome at EA) and raise at 1.0, which Steam allows and which rewards early buyers. Under $10 converts better (GameDiscoverCo Oct 2025: 0.15x median overall, 0.10x above $10). |
| **Free web build + paid Steam** | **Core.** | The Vampire Survivors funnel. The web build is a *demo-sized game*, not the full game: Shallows (biome 1) free forever on the web; biomes 2-4, spells 3-5, the journal completion and daily seeds in the paid build. Decide the cut line before the Steam page goes up. |
| **Demo on Steam + Next Fest** | **Core.** | The Electron build of the free web content, with achievements wired so the demo feels real. |
| **Early Access** | **Yes, once rule 1.4 of Valve's own page is met**: fun proven, 2 biomes, a trailer. EA refund rates run higher (median 12.4% vs 8% for 1.0 launches; GameDiscoverCo survey) and EA burns the one Popular Upcoming slot, so do not enter EA with under ~7k wishlists. |
| **Soundtrack DLC / supporter pack** | **Yes, at 1.0, only with Milan's agreement.** | Milan's two tracks plus whatever he writes next as a $2.99 OST; a "Reef Supporter" pack with a wallpaper and the journal as a PDF. No in-game cosmetics for money (that would need a shop UI we do not want). |
| **Patreon / Ko-fi** | **Ko-fi link on the web build, yes; Patreon, no.** | A tip jar costs nothing. Patreon implies monthly content promises Daniel cannot keep with a day job. |
| **Publisher** | **Not now.** | Publishers want 30-50% for marketing and porting; with an $0 budget and a web demo, we have nothing to negotiate with. If a Next Fest demo lands in the top 5% (13k+ wishlists), publishers will e-mail us; then we talk. Porting houses (for consoles) only after 1.0 sales justify it. |
| **Grants** | **Pro Helvetia: apply in 2027. Czech fund: 2027 at the earliest.** | Pro Helvetia's game funding sits under Design / "Game Design": Emerging Talents Production Grant up to CHF 50k matching, Post-Production grant up to CHF 20k; applicants must be Swiss citizens or permanent residents with their primary place of work in Switzerland, at least 50% of the team (prohelvetia.ch + sgda.ch + aggregator listings; the 50% rule is **[unverified]**). Daniel is resident in Switzerland today; the move to Brno would end eligibility, so the window is before the move. The Czech State Audiovisual Fund supports games since 1 Jan 2025 as **investment grants with a profit share**, first game calls planned May 2027 with 30M CZK (12M development, 18M production; cc.cz and mediaguru.cz reporting the fund's 2027 plan) **[dates may slip]**. "Adequately co-funded" and "fair working conditions" are Pro Helvetia conditions, which means a budget and a written Milan agreement before applying. |
| **Ads** | **Portal builds only** (section 2.2). | Never in our own builds. |

**Avoid:** F2P with IAP (needs a shop, coins, timers: everything the art rule bans; and it is a full-time live-ops
job), subscriptions, NFTs/crypto (Steam bans them anyway), paid cosmetics, loot boxes, "pay to unlock the octopus",
exclusive portal deals, a Kickstarter (a campaign is a second full-time job and our audience is zero today), and
Early Access as a crowdfunding substitute (Valve's page says so explicitly).

---

## 4. Engine strategy: stay, move, or hybrid

### 4.1 Stay in HTML/JS

Pros: it exists and works (3,035 tests, bot 30/30, phones verified); zero build step; Daniel's AI team is productive in
it; the web build is a free marketing asset nobody with a Unity game has; Electron gets us to Steam in days of work,
not months. Cons: no consoles; canvas 2D performance ceiling; the Electron download weight; Chromium drift.

### 4.2 Move to Unity or Godot after the concept is proven

- **What transfers:** every data table (`spells.json`, `patterns.json`, `rooms.json`, `journal.json`, enemy and
  material tables), the room bank and the SmartRooms generator logic (it is pure functions over typed arrays, which
  ports almost line for line to C# or GDScript), the design (V2-PLAN, SPELLS-PICK, CONTROLS-IDEAS), the art pipeline
  outputs (atlases, baked octopus frames, WebP sources), the music, the tuning numbers, the tests as specifications.
- **What does not:** ~25k lines of gameplay, physics, rendering and UI JS; the traced-outline wall renderer; the
  touch UI; the headless puppeteer test harness; the deploy pipeline. One Phaser-to-Godot devlog puts a far smaller
  game at "three or four months of work part-time" and a 6x bigger web build afterwards (itch.io devlog 842664).
  Reasonable estimate for us: **2-4 months of agent-dev calendar time plus Daniel's review time, and a long tail of
  "it felt different" bugs**, because feel (swim drag, dash, 50 Hz tuning) is the thing a port loses first.
- **Unity specifics:** Daniel knows it (the original is Unity), his old project is a reference, Unity has the best
  console paths. Downsides: the Runtime Fee saga, a closed engine, a slower agent loop (compiles, editor state), and
  the old project's third-party asset licences (GUI PRO Kit, Getty texture) which we already had to exclude once.
- **Godot specifics:** open, MIT, GodotSteam plugin for Steam, console ports through W4 Games or a porting partner
  (paid). Lighter than Unity for a 2D game, and the agent loop is better (plain-text scenes). If we ever port, Godot.

### 4.3 Hybrid (recommended)

Web = free prototype + funnel; Electron = Steam product; port = only for consoles, only after 1.0 sells.

**Decision point for a port: after 1.0 on Steam, and only if** (a) 1.0 clears 5,000 paid copies in its first 3
months, (b) a publisher or porting house offers to fund or do the port, or (c) a console platform holder invites
us. Below that, consoles would not repay a 2-4 month port, and Steam + web is the whole market.

**Decision point to stop:** if the Steam page sits under 1,000 wishlists three months after launch and the Next Fest
demo gains under 500, the market has answered. Keep the web game as a portfolio piece and a hobby, do not spend
on Early Access.

---

## 5. Marketing and market entry for a solo dev with a day job

### 5.1 The hook

"**Spelunky meets Noita, underwater. You are the octopus.**" Three words a streamer can say. Sub-hooks that are already
true in the build: the angry hermit-crab shopkeeper, death gags (Impaled, Flattened, Swallowed, Shopkeeper's justice),
corpses that leak juice you drink to cast, Coral Wall and Riptide changing the level. Every GIF should show the world
reacting to itself (chain reactions, infighting), because that is what the vibe review said was missing and what
reads in 3 seconds on a phone.

### 5.2 Steam page early, wishlists always

- Open the Coming Soon page at the **start** of Phase 1, not when the demo is ready. The first two weeks after a page
  goes live are a benchmark: Chris Zukowski's tiers are 100 wishlists (Bronze), 500 (Silver), 1,200 (Gold), 7,000
  (Diamond); "games with strong commercial potential usually gather more than 150 in those first two weeks"
  (howtomarketagame.com benchmarks, 2026 archive). Under ~1,000 a page is "invisible after day 2"; above ~2,000 the
  algorithm starts helping (presskit.gg summarising Zukowski's Feb 2025 survey **[secondary]**).
- **7,000 wishlists** is the rule of thumb for the Popular Upcoming widget at launch (howtomarketagame.com). Treat it
  as the EA gate.
- Capsule art matters more than the trailer. Milan should paint the capsule (octopus, shopkeeper, coral); if he
  cannot, this is the one thing worth paying a human artist for (USD 300-800 is typical) **[unverified range]**.

### 5.3 Next Fest and the demo

- Feb 2026 survey: the median demo gained ~806 wishlists (182 self-reported devs, HTMAG), top 5% ~13,500; GameDiscoverCo
  estimates ~200 across all 3,500+ demos. Pre-fest wishlists predict fest results (Spearman 0.825 in that survey).
  So: build wishlists for 3+ months *before* the fest, do not expect the fest to build them.
- Demo = the free web content in Electron, plus 3-5 achievements, plus a "wishlist" button on the death screen (the
  overlay can open the store page). Keep the demo up permanently after the fest; separate demo page on.

### 5.4 Channels Daniel can actually sustain (pick three)

1. **Short video**: one 10-20 s clip a week from the headless capture tools we already have (`night/` screenshots,
   puppeteer runs): TikTok, YouTube Shorts, X/Bluesky, with "Spelunky meets Noita underwater" in the caption. The
   agents can cut clips; Daniel posts.
2. **Reddit**: r/roguelites, r/IndieDev, r/WebGames, r/spelunky and r/noita only when there is a genuine comparison
   to show (those two subs hate ads). One post per milestone, with a playable link, which is our edge: nobody else
   can say "play it in your browser now".
3. **Devlog**: itch.io devlog or a monthly post on raccoon.website, reusing the team's own docs (the vibe review, the
   spell design) which are unusually honest and readable. That is content.
4. Later: streamers and curators via Keymailer or a hand-written list (small Spelunky/Noita streamers, 1-10k viewers;
   the big ones ignore e-mail). Steam Curator Connect at EA launch.

### 5.5 Competitive landscape

- Underwater is a trend, not a graveyard: Dave the Diver 10M+ copies (Mintrocket, 2026), Dredge 1M+ (Black Salt,
  2023-24). Both are cosy fishing; nobody owns "underwater Spelunky".
- 2026 underwater roguelites in flight: Dive or Die: Children of Rain (2D Lovecraftian, July/Aug 2026), DEEP DIVER
  (Q3 2026), The Subminer (Yogscast), Pieces of the Deep. No sales data yet for any; watch their review counts.
- Spelunky-likes and Noita-likes: Spelunky 2 ~1.57M and Noita ~2.2M (third-party estimates **[unverified]**).
  Roguelike is crowded: 1,562 games tagged Roguelike released on Steam in 2025 (SteamDB via Destructoid). Vampire
  Survivors' arc (free web -> $3 EA -> millions) is the one to copy; the roguelite breakouts of 2025 (CloverPit 750k,
  Ball x Pit 300k in 5 days) all had a demo, a hook and Next Fest.

### 5.6 Numbers to plan with (sources above)

| Item | Number | Source |
|---|---|---|
| Steam releases 2025 | 20,282; 608 reached 1,000 reviews (3%) | HTMAG via secondary **[unverified]** |
| Median Steam game gross, 2025 | ~$249; 66% under $1,000 | VG Insights / Alinea via ziva.sh, fungies.io |
| First-week sales per wishlist (25k+ WL games) | median 0.15x; 0.10x if priced over $10; 10x spread | GameDiscoverCo, Oct 2025 |
| Refunds | median ~9.5%, avg 10.8%; EA median 12.4% | GameDiscoverCo dev survey 2024/25 |
| Steam cut | 30% to $10M | widely reported |
| Steam Direct | $100, recouped at $1,000 gross | Valve docs |
| Next Fest median wishlist gain | ~800 (survey) / ~200 (all demos) | HTMAG Feb 2026 / GameDiscoverCo |
| Popular Upcoming threshold | ~7,000 wishlists | HTMAG |

Worked floor case: 7,000 wishlists at launch x 0.15 = ~1,050 first-week copies at $9.99 = ~$10.5k gross; minus VAT
(~15% blended), 30% Steam, 10% refunds, ~30% US withholding avoided via treaty: **~$5-6k to Daniel in week one**, and
first week is typically 30-50% of year one. That is a nice hobby income, not a job. The job case needs 20k+ wishlists.

---

## 6. Legal and practical

### 6.1 Art and music rights with Milan (blocker number one)

- Today: `CREDITS.md` says "Art & music: Milan Švancara"; the Unity repo `LICENSE` is Daniel's own dual licence over
  the *code* and explicitly carves out assets; `DECISIONS-2026-09-29.md` Q3 says "Milan should still confirm" two
  assets. The original shipped under a joint name ("Brotagonists" on Google Play), which suggests an old informal
  partnership and **no written agreement**. Nothing can be sold until that exists.
- What the agreement needs (plain English, 2 pages, both sign): (1) Milan grants Daniel (or the company) an
  exclusive, worldwide, perpetual licence to use, adapt and sell the listed art and music in Octomancer and its
  marketing, on all platforms, including derivative works made "in his style"; (2) a revenue share on net receipts
  (my default: **15-25% of net** to Milan if he keeps contributing new art and the capsule, 10% if he does not; paid
  quarterly with a simple statement) or a flat buyout if he prefers; (3) credit wording; (4) the OST as a separate
  item with its own split (50/50 is normal); (5) what happens if either walks away (licence survives, share continues);
  (6) explicit consent to generated art trained on nothing but used alongside his, and to Steam/itch AI disclosure
  naming the approach. Get a lawyer to read it once (CHF 500-1,000 **[unverified]**); it is the best money in the plan.
- Every shipped file is already traced to a source and owner in `ASSETS.md`; attach that ledger to the agreement.

### 6.2 Generated art

- Our generated sprites were made with OpenAI image models from contact sheets of Milan's own sprites. OpenAI's
  terms assign output rights to the user "to the extent permitted by law"; US Copyright Office guidance is that
  purely AI-generated images are not copyrightable; outputs are not exclusive (terms.law summaries; OpenAI terms not
  fetched **[unverified wording]**). Practical meaning: we may sell them, we cannot stop others from copying them, and
  Milan's hand-drawn work is the only art we truly own. Over time, replace the hero assets (shopkeeper, Marlo, the
  clam, item icons) with Milan's own, keep generated work for textures and background layers.
- **Steam** requires a yes/no gen-AI disclosure for content that ships and is consumed by players; the text appears on
  the store page; the early-2026 rewrite exempts code assistants and dev tools (Valve's partner page as reported by
  VGC, tbreak; **[the January 2026 date is unverified]**). We answer yes, pre-generated, and list what: "some sprites and
  textures were generated from the artist's own work as a style reference and hand-corrected". Honest and short.
- **itch.io** mandatory tag (section 2.1). **CrazyGames/Poki**: no published AI policy found **[unverified]**.
- The code was written by AI agents. Steam does not require disclosing that any more; itch.io's tag has a "code"
  category. Daniel's call; I would tick it on itch.io, it costs nothing.

### 6.3 The name "Octomancer"

- Steam search for "octomancer" returns 0 results; itch.io search finds none; the old Play listing
  (`com.brotagonists.octomancer`) is gone and `octomancer.com` no longer resolves (all 2026-10-08). So the name is
  free on the stores we care about, and Daniel has prior use since 2023. I did **not** run USPTO/EUIPO/IPO CH searches
  **[unverified]**; do a free TMview search (tmdn.org) before the Steam page goes up, and look for "Octo"-prefixed
  marks in class 9/41 (the Octonaut -> Takotan rename happened over "Octonauts", delistedgames.com).
- Registering a mark: Swiss IPI ~CHF 550, EUIPO EUR 850, in one class. Not worth it before 7k wishlists; worth it
  before 1.0. Re-register `octomancer.com` now if it is free (CHF 15/yr) and point it at the play page.

### 6.4 Company vs sole trader (high level, not advice)

- **Switzerland, now:** a sole proprietorship (Einzelfirma) needs no capital; Steam payouts are self-employment
  income; VAT registration is required at **CHF 100k worldwide turnover** (magicheidi.ch guides; FTA is the source).
  Below that, no VAT. Steam/itch handle consumer VAT for their sales anyway. A GmbH (CHF 20k capital) only makes sense
  with a publisher deal or a grant that requires a legal entity (Pro Helvetia funds individuals too). **Default: sole
  trader, declare the income, file the W-8BEN on Steam, talk to an accountant once before the first payout.**
- **Czechia, after the move:** OSVČ (živnost) with the flat-tax regime (paušální daň) up to CZK 2M income if not a
  VAT payer, which removes most filing (idoklad.cz, podnikatel.cz, 2026). Czech tax residents are taxed on worldwide
  income, so Steam money follows Daniel. The Czech fund wants a Czech entity or OSVČ; check when the call text exists.
- Both countries have US tax treaties; without the treaty form Valve withholds 30% on US sales.
- The `relocation-czechia` skill has the salary and residency material; this doc only adds the game-income angle.

### 6.5 Practical

- A separate e-mail and a press kit page on raccoon.website (`/octomancer/press/`): logo, 6 screenshots, 3 GIFs, the
  hook, Milan's credit, the AI disclosure, contact. Half a day for an agent.
- Privacy: the game stores nothing server-side today. Keep it that way through EA; a leaderboard would add GDPR work.
- Age rating: Steam's questionnaire; IARC for Google Play; the game is cartoon violence, likely PEGI 7/12.

---

## 7. Roadmap with gates

| Phase | When | Build | Cost (cash) | Daniel's time | Measure | Gate to next |
|---|---|---|---|---|---|---|
| **0. Web prototype** | now to ~Jan 2027 | V2 features in flight (chain reactions, infighting, 5 spells, controls, time pressure), Shallows polished; itch.io page (free, PWYW, AI tag); Ko-fi link; CrazyGames Basic Launch as a retention probe | $0 | 1-2 h/week reviews | plays/week, % reaching 1-3, median run length, D1/D7 return (a tiny anonymous beacon or itch analytics), itch comments | Milan agreement signed; 100+ organic plays/week with D7 >= 10%; Fox and Daniel agree the loop is fun |
| **1. Steam page + demo** | ~Feb to May 2027 | Electron build via steamworks.js; gamepad + glyphs; achievements; capsule by Milan; trailer (30-60 s); Coming Soon page; demo page; Next Fest June 2027 (register by its deadline, usually ~2 months before) | $100 Steam + ~$0-800 capsule + domain | 3-4 h/week for 4 months (posts, trailer review, replying) | wishlists (2-week benchmark, then weekly), demo DAU, demo median playtime, Next Fest wishlist gain, demo review % | >= 2,000 wishlists by fest; >= 800 gained in fest; demo reviews >= 80% positive. **If < 1,000 wishlists 3 months after page launch: stop at Phase 1.** |
| **2. Early Access** | ~Q4 2027 | 2 biomes, 5 spells + 3 runes, back rooms, Deck Playable, cloud saves, 10+ achievements, Linux build, $7.99-9.99 | $0 (+ lawyer CHF 500-1,000 for the Milan agreement if not yet done; Pro Helvetia application before the move) | 4-6 h/week for launch month, then 2 h | first-week units vs wishlists (target >= 0.10x), refund % (< 12%), review % (>= 85%), median playtime (> 2 h), wishlist growth after launch | >= 5,000 units in 3 months and >= 85% positive -> fund 1.0 at full pace; 1,000-5,000 -> finish 1.0 slowly; < 1,000 -> finish a small 1.0 and stop |
| **3. 1.0 and ports** | 2028 | 4 biomes, bosses or the Beholder finale, OST DLC, price to $12.99-14.99 (30+ days before any discount), Epic/GOG/MS Store from the same build; Capacitor premium mobile if demand; Godot port only on the section 4.3 triggers | $99/yr Apple if mobile/Mac; port only if funded | launch month heavy, then maintenance | lifetime units, platform mix, Deck share, press/streamer pickup | n/a |

Timeline caveat: the team ships fast but Daniel's review time is the bottleneck; every date above assumes about one
reviewed merge round per week. If that drops, slide the phases, do not skip the gates.

**The three biggest risks, with mitigations**
1. **Rights.** No signed Milan agreement by the end of Phase 0 means no Phase 1. Mitigation: draft it this month; the
   `relocation-czechia`/legal budget line covers one lawyer hour.
2. **Nobody sees it.** Mitigation: the page goes up early, the web link is used as the lead in every post (our edge),
   Next Fest is treated as a deadline for wishlist building, not as the plan.
3. **Daniel's time.** Mitigation: agents prepare clips, posts, press kit and replies as drafts; Daniel approves in
   batches; a hard rule of "3 channels, one post a week" and nothing more.

Smaller risks: Electron/Chromium drift (pin versions, Deck test before every release); generated-art backlash on
itch.io and Reddit (disclose, replace hero assets with Milan's); the roguelike tag crowd (1,562 in 2025) means the hook
must be visible in the capsule; Pro Helvetia eligibility ends with the move to Brno (apply first).

---

## 8. Decisions for Daniel (recommended default in bold)

1. **Engine.** Stay HTML/JS + Electron for Steam, no Unity/Godot before 1.0 sells 5k. -> **Stay.**
2. **Milan agreement.** Revenue share or buyout; how much. -> **Share, 15-25% of net while he contributes, written
   and signed before the Steam page exists; OST 50/50.**
3. **Generated art in the paid product.** Ship with disclosure, or replace everything first. -> **Ship with
   disclosure; replace hero assets with Milan's over Phases 1-2.**
4. **The free cut line.** What stays free on the web forever. -> **Shallows (biome 1) + 2 spells free on web and as the
   Steam demo; everything deeper is paid.**
5. **Price.** -> **$7.99 EA, $12.99 at 1.0; regional pricing by Steam's defaults.**
6. **Mobile.** Free web only, or a paid Capacitor build. -> **Free web through Phase 2; paid premium Capacitor build
   is a Phase 3 option; never ads or IAP in our builds.**
7. **Portals.** -> **CrazyGames Basic Launch as a data probe in Phase 0, no exclusivity anywhere, no Poki.**
8. **Next Fest edition.** Feb 2027 (tight) or June 2027 (safe). -> **June 2027**, Feb only if Phase 0 gates are met
   by December and the Electron build with gamepad exists by January.
9. **Legal entity.** -> **Sole trader in Switzerland now; revisit (OSVČ or s.r.o.) at the move; GmbH only for a
   publisher or grant that needs it.**
10. **Name.** -> **Keep "Octomancer"; TMview search now; re-register octomancer.com now; register the mark before 1.0.**
11. **Grants.** -> **Apply to Pro Helvetia (Game Design, Emerging Talents) before the move, with the Milan
    agreement and the Steam page as the "project"; watch the Czech fund's May 2027 call.**
12. **Stop rule.** -> **Under 1,000 wishlists 3 months after the page, or under 500 from Next Fest: no Early
    Access; the web game stays a free hobby project.**

---

### Source list (checked 2026-10-08)

Valve: partner.steamgames.com/doc/gettingstarted/appfee, /gettingstarted/onboarding, /store/earlyaccess,
/steamdeck/compat, /store/application/demos, /finance/taxfaq, /marketing/upcoming_events/nextfest. Steam store search
and the CrossCode / OMORI store pages. itch.io/docs/creators/payments and /pricing; itch.io AI-tag announcements
(gamingonlinux.com 2024-11). developers.poki.com/guide/revenue-deal-types. docs.crazygames.com/requirements/intro.
GameDiscoverCo wishlist-conversion report (Oct 2025) and refund survey; howtomarketagame.com benchmark archive (2026)
and Next Fest surveys (Feb 2025, Feb 2026) via presskit.gg; ziva.sh and fungies.io for 2025 median revenue (citing
VG Insights / Alinea); Destructoid for SteamDB roguelike counts. npmjs.com/package/steamworks.js; greenworks README;
phaser.io Electron-to-Steam guide (Mar 2025); drawize.com Electron+Greenworks write-up; brainhub.eu Electron on Deck;
MicrosoftEdge/WebView2Feedback #4019 and itch.io post 16353658 on Tauri; capgo.app wrapper comparison. gamingonlinux
(Vampire Survivors engine switch, 2023-07), Playsaurus press release (Cookie Clicker), RPGSite (CrossCode 400k),
vaporlens.app estimates (Coffin, Spelunky 2, Noita; unverified). Mintrocket announcements (Dave the Diver), Black Salt
anniversary post (Dredge). Epic self-publishing (pcgamesinsider.biz 2023), Microsoft 12% (pcgamesinsider.biz),
Wikipedia (Epic 0% under $1M, unverified), CD Projekt (GOG sale, Dec 2025). Google Play/App Store fee guides (2026,
secondary), Apple 4.2 commentary (secondary). cc.cz, mediaguru.cz, cms.law (Czech Audiovisual Fund), prohelvetia.ch,
sgda.ch, fundsforngos aggregator (Pro Helvetia; residency rule unverified). magicheidi.ch (Swiss VAT), idoklad.cz and
podnikatel.cz (paušální daň 2026). terms.law summaries of OpenAI output terms (unverified wording). Local:
`octomancer-unity/LICENSE`, `README.md`, `octomancer-web/*.md`, `site/octomancer/play/` (8 MB, 265 files).
