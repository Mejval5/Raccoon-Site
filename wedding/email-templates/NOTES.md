# RSVP e-mail templates – design notes

Four options (two per e-mail) for the wedding RSVP flow, matched to the invitation
site (`site/svatba/`). Open `index.html` for the side-by-side review sheet (600 px,
with a 375 px toggle; each guest template is also shown in its "not attending" mood,
each couple template in its "nepřijde" mood).

Files: `guest-a.html`, `guest-b.html`, `couple-a.html`, `couple-b.html` (+ `*-no.html`
variants of each), `hills.png`, `blossom.png`, `build.py` (the Python generator that
produced everything – handy as a reference when porting, the HTML is plain string
templates), `shots/` (headless-Chrome renders).

Sample data used: name "Jana Nováková", e-mail jana@example.com, party "Petr",
accommodation "yes", note "Can we bring our dog?" / "Můžeme vzít psa?", lang en,
time "29. 9. 2026 1:18:22".

## Shared technical contract (all four)

- Table layout, every style inline. One small `<style>` block only for: font reset,
  a 620 px media query (`.w-full`, `.p-sm`, `.stack`, `.h-sm`) and a
  `prefers-color-scheme: dark` tweak. `color-scheme` / `supported-color-schemes` meta
  present. Hidden preheader `<div>` as the first body child.
- 600 px centred container (`width="600"` + `max-width:600px`, Outlook ghost table),
  fluid to 320 px. Verified in Chrome at 600 and 375 px (via the review sheet).
- Fonts via Google Fonts `<link>` (Cormorant Garamond 500/italic, Josefin Sans 600,
  Nunito 400/700), wrapped in `<!--[if !mso]><!-->`. Stacks:
  `'Cormorant Garamond',Georgia,'Times New Roman',serif` /
  `'Josefin Sans',Arial,Helvetica,sans-serif` / `Nunito,Arial,Helvetica,sans-serif`.
- Every gradient cell has `bgcolor` + `background-color` fallbacks. Buttons are
  td-with-bgcolor + padded `<a>` (works in Outlook, rounded elsewhere).
  Tables that carry rounded borders use `border-collapse:separate` inline, otherwise
  the radius is dropped.
- No JS, no SVG, no external CSS. All text is real text.
- Palette straight from `svatba.css`: night #0b0d1a, ground #140f22, plum #3b2a4a,
  #5a3552, #a0506a, rose #d9707a, #eb8f6a, apricot #f5a55a, #f8c07e, paper #f6efe4,
  paper-2 #efe4d2, ink #2b2230, ink-2 #5c4a56, gold #e2b45f, gold-deep #7a5213,
  wine #5a1420 (buttons), links on paper #6a3b12 underlined in gold (site rule).
- Dark mode: dark clients (Gmail app) invert light areas; paper->dark with light ink
  is fine, gold-deep/wine keep contrast. Apple Mail honours the media query, which
  only swaps the outer background of the light templates to night (so the paper card
  floats on the night ground, exactly like the site) and lifts footer text to a
  light grey. Guest A / Couple A already have dark chrome and need no tweak.
- Text alternatives: the existing `text` parts of both builders stay as they are.

## Images (only Guest A uses any)

- `hills.png` 1200x220, shown at 600x110: sunset horizon with three hill layers and
  the orchard treeline (with a few apricot dots). Its top row continues the hero's
  coral->apricot strip, its bottom row is ground #140f22, so it sits seamlessly.
- `blossom.png` 216x216 RGBA, shown at 54x54: the site's five-petal apricot blossom
  (cream #fdf6ec petals with a gold edge, apricot centre).
- Both are decorative (`alt=""`, `display:block`); with images off the hero simply
  ends with the coral/apricot band on the night ground and the card follows – the
  design stays complete.
- Before use they must be hosted at `https://raccoon.website/svatba/email/hills.png`
  and `.../email/blossom.png` and the `src` attributes changed from relative to those
  absolute URLs. (No base64: Gmail ignores data URIs.)

## Guest A – "Sunset hero"  (`guest-a.html`)

Concept: the invitation's own hero, rebuilt for e-mail. Plum->rose sky gradient with
the blossom, a Josefin kicker ("Thank you for your RSVP"), "Tereza & Daniel" in
Cormorant italic with the gold upright ampersand, the "—— Nečesalovi ——" family line,
date and venue. A coral->apricot band and the hills strip form the horizon; the
letter sits on a cream card with a gold-deep hairline border floating on the night
ground, then a paper-2 "Your reply" recap and a small night footer with the T & D
monogram. Closest match to the website; warmest option.

Dynamic parts (from `buildGuestMessage(data, copy)`):
- kicker: new copy key, yes/no variant (`kickerYes`/`kickerNo`) – add to `GUEST_COPY`.
- preheader: new copy key, yes/no variant; short (one sentence).
- `copy.greeting(data.name)`, `introYes`/`introNo`, `closingYes`/`closingNo`.
- When/Where two-column block: `copy.when`, `copy.where`. I split the English venue
  into name + a small grey sub-line ("a barn in an apricot orchard, ...") – either add
  a `whereSub` key or keep the one long string in the value cell; both fit.
- Button label "Open the invitation": new copy key (`inviteButton`); the URL is also
  printed as a plain link under it (kept from the current mail, good for
  copy/paste and text-only clients).
- Contact sentence: `copy.contact(a, b)` with the two addresses linked exactly as the
  current `contactHtml` does (escape, then replace).
- Recap rows: same `recap` array as today (name / attending / party / optional
  accommodation / note); `nl2br(escapeHtml(value))` for the value cell. Labels are
  Josefin small caps, values Nunito.
- Footer note ("You are receiving this because you replied...") – new copy key.
- Hero text (names, family line, date, venue) is static in all three languages.

## Guest B – "Letterpress stationery"  (`guest-b.html`)

Concept: a wedding card, not a web page. Paper-2 surround with a tiny letter-spaced
line "Tereza & Daniel · 19. 6. 2027", then one cream card inside a double gold rule
(gold-deep outer, gold inner – the site's `.paper` treatment), a circled T&D
monogram, kicker, the greeting as a big italic headline, centred body copy,
hairline-and-dots dividers (the site's card divider, built from table cells), WHEN /
WHERE as centred stationery lines, the wine button, and a large italic signature.
The recap is a perforated ticket stub: a dashed gold-deep top rule on paper-2, with
italic Cormorant labels. Zero images, so it looks identical everywhere and never
depends on hosting.

Dynamic parts: identical set to Guest A (kicker, preheader, greeting, intro,
when/where (+ optional whereSub), inviteLead/button, contact with linked addresses,
closing, recap rows, footer note). Only the markup differs; the recap uses the same
`recap` array, rendered as italic label / Nunito value rows.

## Couple A – "Night notification"  (`couple-a.html`)

Concept: a status card Daniel can read from the Gmail preview. Dark card on the night
ground. The header cell is the sunset sky (plum->rose->apricot gradient, `bgcolor`
#a0506a) for a **yes** and a cold dusk (night->plum->wine, `bgcolor` #3b2a4a) for a
**no**; a pill states "✓ PŘIJDE" (apricot, dark text) or "× NEPŘIJDE" (wine, rose
border). Headline in Cormorant 42 px: "Jana Nováková *přijde*", and when there is a
party a second line "s sebou bere: Petr" in gold. Paper body: E-mail (mailto, and it
is also the reply-to), Doprovod, Ubytování (as a peach chip, only when set), Jazyk,
Čas; the note as a quote block with a gold left rule; then "Odpovědět e-mailem"
(wine button, `mailto:` to the guest with a Re: subject) and a "Pozvánka" text link.
IP and user agent dropped, as asked.

Dynamic parts (from `buildCoupleEmail(data, meta)`):
- `attending` drives: header `bgcolor` + gradient, pill colour/text/glyph, verb
  (přijde/nepřijde) in the headline and subject.
- `data.name` (headline), `data.party` (second header line + Doprovod row, "—" when
  empty), `data.email` (row link + button + `replyTo`; omit the button and show "—"
  when empty), `data.accommodation` (row only when non-empty; labels
  "chce pomoct s ubytováním" / "ubytování neřeší" – adjust to taste, the current
  `accommodationLabelCs` "ano/ne" also works), `data.note` (quote block, or the
  "Bez dotazů." line), `langLabelCs(data.lang)`, `timeStr`.
- Preheader: "<name> přijde · s sebou: <party> · <accommodation> · Dotaz: <note>"
  (skip empty parts).
- Suggested subject stays "Svatba – odpověď: <name> (přijde|nepřijde)"; optionally
  append "+ <party>".
- Static: kicker "Nová odpověď na pozvánku", footer line.

## Couple B – "Guest-book ledger"  (`couple-b.html`)

Concept: the RSVP as an entry in a paper guest book. Cream card with a gold-deep
border and a 6 px coloured top rule (apricot for yes, wine for no); top row has the
small "Svatební odpověď / time · language" meta on the left and a rubber-stamp box
(3 px double border, letter-spaced "PŘIJDE" in gold-deep or "NEPŘIJDE" in wine) on
the right. Headline "Jana Nováková *přijde*" with the verb coloured to match the
stamp, sub-line "a s sebou bere Petr." / "bez doprovodu." / "Tentokrát to nevyjde."
Then a hairline ledger (Účast, E-mail, Doprovod, Ubytování when set, Jazyk, Čas), the
note as a pull quote with a big gold „ mark, and the wine "Odpovědět" button plus
"Pozvánka" link. Lighter and more editorial than A; the answer is readable from the
stamp alone.

Dynamic parts: same data as Couple A. `attending` drives the top-rule colour, stamp
colour/text, headline verb + colour, sub-line and the Účast row ("ano, přijde" /
"ne, nepřijde"). `party` drives the sub-line and the Doprovod row; `email`,
`accommodation`, `note`, `lang`, `timeStr` as in A. Preheader/subject as in A.

## Porting hints

- The generator is `build.py`; each template is one function that returns a string.
  The row/quote/button helpers map one-to-one onto small JS helpers next to the
  existing `row()` / `mailto()` in `functions/lib/rsvp.js`.
- Keep `escapeHtml` on every user field and `nl2br` on party/note (multi-line).
- Guest copy for cs/fr: only the new keys need translating (kicker yes/no,
  preheader yes/no, inviteButton, footerNote, optional whereSub).
- Because the guest `name` is the full name, the greeting reads "Dear Jana Nováková,"
  – consider greeting with the first token only in en/fr (cs uses "Milí naši,").
