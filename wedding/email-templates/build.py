# -*- coding: utf-8 -*-
"""
Generates the four RSVP email template options (+ yes/no variants), the two
decorative PNGs and the review sheet index.html. Run:  python build.py
Everything is written next to this script.
"""
import html
import math
import os

from PIL import Image, ImageDraw

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- palette
NIGHT = "#0b0d1a"
GROUND = "#140f22"
PLUM = "#3b2a4a"
PLUM2 = "#5a3552"
MAUVE = "#a0506a"
ROSE = "#d9707a"
CORAL = "#eb8f6a"
APRICOT = "#f5a55a"
PEACH = "#f8c07e"
PAPER = "#f6efe4"
PAPER2 = "#efe4d2"
INK = "#2b2230"
INK2 = "#5c4a56"
GOLD = "#e2b45f"
GOLD_DEEP = "#7a5213"
WINE = "#5a1420"
LINK_PAPER = "#6a3b12"

SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif"
LABEL = "'Josefin Sans',Arial,Helvetica,sans-serif"
BODY = "Nunito,Arial,Helvetica,sans-serif"

INVITE_URL = "https://raccoon.website/svatba/"
EMAIL_A = "necesal.daniel@gmail.com"
EMAIL_B = "terezasancova1999@gmail.com"

FONT_LINK = (
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500"
    "&family=Josefin+Sans:wght@600&family=Nunito:wght@400;700&display=swap"
)


def esc(s):
    return html.escape(str(s), quote=True)


def nl2br(escaped):
    return escaped.replace("\n", "<br>")


# ---------------------------------------------------------------- sample data
GUEST_YES = {
    "name": "Jana Nováková",
    "email": "jana@example.com",
    "attending": "yes",
    "party": "Petr",
    "accommodation": "yes",
    "note": "Can we bring our dog?",
    "lang": "en",
}
GUEST_NO = dict(GUEST_YES, attending="no", party="", accommodation="", note="")

COUPLE_YES = {
    "name": "Jana Nováková",
    "email": "jana@example.com",
    "attending": "yes",
    "party": "Petr",
    "accommodation": "yes",
    "note": "Můžeme vzít psa?",
    "lang": "en",
    "time": "29. 9. 2026 1:18:22",
}
COUPLE_NO = dict(COUPLE_YES, attending="no", party="", accommodation="", note="Moc gratulujeme, bohužel jsme ten víkend v zahraničí.")

# English guest copy, mirrors GUEST_COPY.en in functions/lib/rsvp.js
EN = {
    "subject": "Thank you for your RSVP – Tereza & Daniel's wedding",
    "greeting": lambda name: f"Dear {name},",
    "introYes": "Thank you so much for your reply! We are thrilled that you will celebrate with us.",
    "introNo": "Thank you for letting us know. We are sorry you can't make it – you will be missed.",
    "when": ("When", "Saturday 19 June 2027"),
    "where": ("Where", "Stodola v Meruňkovém sadu, Dolní Kounice"),
    "whereSub": "a barn in an apricot orchard, South Moravia, Czech Republic",
    "inviteLead": "You can find the invitation with all the details here:",
    "inviteButton": "Open the invitation",
    "contact": lambda a, b: f"If anything changes, just write to us at {a} or {b} (or simply reply to this email).",
    "closingYes": "We can't wait to see you!",
    "closingNo": "With love,",
    "recapTitle": "Your reply",
    "labels": {
        "name": "Name",
        "attending": "Attending",
        "party": "Coming with you",
        "accommodation": "Help with accommodation",
        "note": "Questions",
    },
    "attendingValue": lambda yes: "yes, I'll be there" if yes else "sadly, I can't make it",
    "accommodationValue": lambda a: {"yes": "yes", "no": "no"}.get(a, "not sure yet"),
    # small additions for the designed templates
    "kickerYes": "Thank you for your RSVP",
    "kickerNo": "Thank you for letting us know",
    "preheaderYes": lambda name: f"We are thrilled – see you on 19 June 2027 in the apricot orchard.",
    "preheaderNo": lambda name: f"You will be missed. Thank you for telling us.",
    "footerNote": "You are receiving this because you replied on our invitation page.",
}


def contact_html(copy, link_color):
    a, b = EMAIL_A, EMAIL_B
    s = esc(copy["contact"](a, b))
    link = lambda addr: (
        f'<a href="mailto:{addr}" style="color:{link_color};text-decoration:underline;'
        f'text-decoration-color:{GOLD};font-weight:700;">{addr}</a>'
    )
    return s.replace(a, link(a)).replace(b, link(b))


def recap_rows(data, copy):
    yes = data["attending"] == "yes"
    rows = [
        (copy["labels"]["name"], data["name"]),
        (copy["labels"]["attending"], copy["attendingValue"](yes)),
        (copy["labels"]["party"], data["party"] or "—"),
    ]
    if data["accommodation"]:
        rows.append((copy["labels"]["accommodation"], copy["accommodationValue"](data["accommodation"])))
    rows.append((copy["labels"]["note"], data["note"] or "—"))
    return rows


# ---------------------------------------------------------------- shared head
def head(title, preheader, lang="en", extra_css="", body_bg=GROUND):
    return f"""<!DOCTYPE html>
<html lang="{lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if !mso]><!--><link href="{FONT_LINK}" rel="stylesheet"><!--<![endif]-->
<style>
  :root {{ color-scheme: light dark; supported-color-schemes: light dark; }}
  body {{ margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }}
  table {{ border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }}
  img {{ border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }}
  a[x-apple-data-detectors] {{ color:inherit !important; text-decoration:none !important; }}
  @media only screen and (max-width:620px) {{
    .w-full {{ width:100% !important; max-width:100% !important; }}
    .p-sm {{ padding-left:22px !important; padding-right:22px !important; }}
    .p-xs {{ padding-left:8px !important; padding-right:8px !important; }}
    .h-sm {{ font-size:36px !important; line-height:40px !important; }}
    .h2-sm {{ font-size:30px !important; line-height:36px !important; }}
    .stack {{ display:block !important; width:100% !important; box-sizing:border-box; }}
    .stack-gap {{ padding-top:18px !important; }}
    .center-sm {{ text-align:center !important; }}
  }}
{extra_css}
</style>
</head>
<body style="margin:0;padding:0;background-color:{body_bg};word-break:normal;" bgcolor="{body_bg}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:{body_bg};">{esc(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
"""


def container_open(body_bg, pad="28px 12px"):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="{body_bg}" class="outer" style="background-color:{body_bg};">
<tr><td align="center" style="padding:{pad};">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" class="w-full" style="width:600px;max-width:600px;margin:0 auto;border-collapse:separate;border-spacing:0;">
"""


CONTAINER_CLOSE = """</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
"""


def button(href, label, bg=WINE, fg=PAPER, radius="999px", border=""):
    """Bulletproof-ish pill button: td carries the colour, a carries padding."""
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
<tr><td bgcolor="{bg}" style="background-color:{bg};border-radius:{radius};{border}mso-padding-alt:14px 30px;">
<a href="{href}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:{LABEL};font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:{fg};text-decoration:none;border-radius:{radius};line-height:16px;">{label}</a>
</td></tr></table>"""


def gold_divider(width=170, color=GOLD, dot=GOLD):
    """hairline · blossom-dots · hairline, all with plain table cells (no images)."""
    side = (width - 50) // 2
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
<tr>
<td width="{side}" style="width:{side}px;border-top:1px solid {color};font-size:0;line-height:0;">&nbsp;</td>
<td width="50" align="center" style="width:50px;padding:0 6px;font-size:0;line-height:0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td width="4" height="4" bgcolor="{dot}" style="width:4px;height:4px;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
    <td width="6" style="font-size:0;line-height:0;">&nbsp;</td>
    <td width="7" height="7" bgcolor="{dot}" style="width:7px;height:7px;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
    <td width="6" style="font-size:0;line-height:0;">&nbsp;</td>
    <td width="4" height="4" bgcolor="{dot}" style="width:4px;height:4px;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>
</td>
<td width="{side}" style="width:{side}px;border-top:1px solid {color};font-size:0;line-height:0;">&nbsp;</td>
</tr></table>"""


def signature(color_names=INK, amp=GOLD_DEEP, size=28):
    return (
        f'<span style="font-family:{SERIF};font-size:{size}px;line-height:{size + 6}px;font-style:italic;color:{color_names};">'
        f'Tereza <span style="font-style:normal;color:{amp};">&amp;</span> Daniel</span>'
    )


# ================================================================ GUEST A
# "Sunset hero": the website's hero (sky gradient, hills strip, names) on top,
# a paper card floating on the night ground below.
def guest_a(data, copy=EN):
    yes = data["attending"] == "yes"
    kicker = copy["kickerYes"] if yes else copy["kickerNo"]
    preheader = (copy["preheaderYes"] if yes else copy["preheaderNo"])(data["name"])
    intro = copy["introYes"] if yes else copy["introNo"]
    closing = copy["closingYes"] if yes else copy["closingNo"]
    rows = recap_rows(data, copy)

    dark_css = """  @media (prefers-color-scheme: dark) {
    .paper-card { border-color: #9a7a3a !important; }
  }"""
    out = head(copy["subject"], preheader, "en", dark_css, body_bg=GROUND)
    out += container_open(GROUND, pad="0 0 28px")

    # --- hero: sky gradient with the names in the plum part of the sky
    out += f"""
<tr><td bgcolor="{PLUM2}" align="center" class="p-sm" style="background-color:{PLUM2};background-image:linear-gradient(180deg,{PLUM} 0%,{PLUM2} 28%,{MAUVE} 58%,{ROSE} 84%,{CORAL} 100%);padding:38px 32px 22px;text-align:center;">
  <img src="blossom.png" width="54" height="54" alt="" style="display:block;margin:0 auto 14px;width:54px;height:54px;">
  <p style="margin:0 0 12px;font-family:{LABEL};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:{PAPER};line-height:16px;">{esc(kicker)}</p>
  <h1 class="h-sm" style="margin:0;font-family:{SERIF};font-weight:500;font-style:italic;font-size:48px;line-height:52px;color:{PAPER};">Tereza <span style="font-style:normal;color:{GOLD};">&amp;</span> Daniel</h1>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 0;">
    <tr>
      <td width="28" style="width:28px;border-top:1px solid {GOLD};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;font-family:{SERIF};font-style:italic;font-size:20px;line-height:24px;color:{GOLD};">Nečesalovi</td>
      <td width="28" style="width:28px;border-top:1px solid {GOLD};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
  <p style="margin:14px 0 4px;font-family:{SERIF};font-size:24px;line-height:28px;letter-spacing:1px;color:{PAPER};">19. 6. 2027</p>
  <p style="margin:0;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{PAPER};line-height:18px;">Stodola v&nbsp;Meruňkovém sadu &nbsp;·&nbsp; Dolní Kounice</p>
</td></tr>
<tr><td bgcolor="{CORAL}" style="background-color:{CORAL};background-image:linear-gradient(180deg,{CORAL} 0%,{APRICOT} 100%);height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td bgcolor="{GROUND}" style="background-color:{GROUND};font-size:0;line-height:0;"><img src="hills.png" width="600" height="110" alt="" style="display:block;width:100%;max-width:600px;height:auto;"></td></tr>
"""

    # --- paper card
    out += f"""
<tr><td style="padding:6px 16px 0;" class="p-xs">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="paper-card" style="border:1px solid {GOLD_DEEP};border-radius:6px;border-collapse:separate;border-spacing:0;">
  <tr><td bgcolor="{PAPER}" class="p-sm" style="background-color:{PAPER};padding:36px 40px 12px;border-radius:6px 6px 0 0;">
    <p style="margin:0 0 14px;font-family:{SERIF};font-style:italic;font-size:26px;line-height:32px;color:{INK};">{esc(copy["greeting"](data["name"]))}</p>
    <p style="margin:0 0 22px;font-family:{BODY};font-size:16px;line-height:26px;color:{INK};">{esc(intro)}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid {GOLD};border-bottom:1px solid {GOLD};">
    <tr>
      <td class="stack" width="42%" valign="top" style="width:42%;padding:16px 16px 16px 0;">
        <p style="margin:0 0 6px;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">{esc(copy["when"][0])}</p>
        <p style="margin:0;font-family:{SERIF};font-size:21px;line-height:26px;color:{INK};">{esc(copy["when"][1])}</p>
      </td>
      <td class="stack stack-gap" width="58%" valign="top" style="width:58%;padding:16px 0;">
        <p style="margin:0 0 6px;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">{esc(copy["where"][0])}</p>
        <p style="margin:0;font-family:{SERIF};font-size:21px;line-height:26px;color:{INK};">{esc(copy["where"][1])}</p>
        <p style="margin:4px 0 0;font-family:{BODY};font-size:13px;line-height:19px;color:{INK2};">{esc(copy["whereSub"])}</p>
      </td>
    </tr>
    </table>

    <p style="margin:24px 0 14px;font-family:{BODY};font-size:16px;line-height:26px;color:{INK};">{esc(copy["inviteLead"])}</p>
    <div style="margin:0 0 10px;">{button(INVITE_URL, esc(copy["inviteButton"]))}</div>
    <p style="margin:0 0 22px;font-family:{BODY};font-size:13px;line-height:20px;color:{INK2};"><a href="{INVITE_URL}" style="color:{LINK_PAPER};text-decoration:underline;text-decoration-color:{GOLD};">{INVITE_URL}</a></p>

    <p style="margin:0 0 22px;font-family:{BODY};font-size:16px;line-height:26px;color:{INK};">{contact_html(copy, LINK_PAPER)}</p>

    <p style="margin:0 0 4px;font-family:{BODY};font-size:16px;line-height:26px;color:{INK};">{esc(closing)}</p>
    <p style="margin:0 0 20px;">{signature()}</p>
  </td></tr>
  <tr><td bgcolor="{PAPER2}" class="p-sm" style="background-color:{PAPER2};padding:22px 40px 26px;border-top:1px solid {GOLD};border-radius:0 0 6px 6px;">
    <p style="margin:0 0 12px;font-family:{LABEL};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">{esc(copy["recapTitle"])}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
"""
    for label, value in rows:
        out += f"""    <tr>
      <td valign="top" width="38%" style="width:38%;padding:6px 12px 6px 0;font-family:{LABEL};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:{GOLD_DEEP};line-height:20px;">{esc(label)}</td>
      <td valign="top" style="padding:6px 0;font-family:{BODY};font-size:15px;line-height:20px;color:{INK};">{nl2br(esc(value))}</td>
    </tr>
"""
    out += f"""    </table>
  </td></tr>
  </table>
</td></tr>

<tr><td align="center" style="padding:30px 24px 8px;text-align:center;">
  <p style="margin:0 0 6px;font-family:{SERIF};font-size:22px;letter-spacing:3px;color:{GOLD};line-height:26px;">T &amp; D</p>
  <p style="margin:0 0 8px;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;line-height:16px;"><a href="{INVITE_URL}" style="color:{PAPER};text-decoration:none;">raccoon.website/svatba</a></p>
  <p style="margin:0;font-family:{BODY};font-size:12px;line-height:18px;color:#b9aebf;">{esc(copy["footerNote"])}</p>
</td></tr>
"""
    out += CONTAINER_CLOSE
    return out


# ================================================================ GUEST B
# "Letterpress stationery": one cream card with a double gold rule, monogram,
# centred typography, a perforated ticket-stub recap. No images at all.
def guest_b(data, copy=EN):
    yes = data["attending"] == "yes"
    kicker = copy["kickerYes"] if yes else copy["kickerNo"]
    preheader = (copy["preheaderYes"] if yes else copy["preheaderNo"])(data["name"])
    intro = copy["introYes"] if yes else copy["introNo"]
    closing = copy["closingYes"] if yes else copy["closingNo"]
    rows = recap_rows(data, copy)

    dark_css = f"""  @media (prefers-color-scheme: dark) {{
    body, .outer {{ background-color:{GROUND} !important; }}
    .dm-text {{ color:#c9bfcf !important; }}
    .dm-gold {{ color:{GOLD} !important; }}
  }}"""
    out = head(copy["subject"], preheader, "en", dark_css, body_bg=PAPER2)
    out += container_open(PAPER2, pad="28px 12px")

    out += f"""
<tr><td align="center" style="padding:0 0 18px;text-align:center;">
  <p class="dm-gold" style="margin:0;font-family:{LABEL};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:{GOLD_DEEP};line-height:16px;">Tereza &amp; Daniel &nbsp;·&nbsp; 19. 6. 2027</p>
</td></tr>

<tr><td bgcolor="{PAPER}" style="background-color:{PAPER};border:1px solid {GOLD_DEEP};padding:6px;border-radius:4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid {GOLD};border-radius:2px;border-collapse:separate;border-spacing:0;">
  <tr><td align="center" class="p-sm" style="padding:40px 48px 8px;text-align:center;">

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;border-collapse:separate;border-spacing:0;">
      <tr><td width="56" height="56" align="center" valign="middle" style="width:56px;height:56px;border:1px solid {GOLD};border-radius:50%;font-family:{SERIF};font-style:italic;font-size:19px;line-height:56px;color:{GOLD_DEEP};">T&amp;D</td></tr>
    </table>

    <p style="margin:0 0 10px;font-family:{LABEL};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:{GOLD_DEEP};line-height:16px;">{esc(kicker)}</p>
    <h1 class="h2-sm" style="margin:0 0 18px;font-family:{SERIF};font-weight:500;font-style:italic;font-size:34px;line-height:40px;color:{INK};">{esc(copy["greeting"](data["name"]))}</h1>
    <p style="margin:0 0 26px;font-family:{BODY};font-size:16px;line-height:26px;color:{INK};">{esc(intro)}</p>

    {gold_divider(190)}

    <p style="margin:26px 0 4px;font-family:{LABEL};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">{esc(copy["when"][0])}</p>
    <p style="margin:0 0 20px;font-family:{SERIF};font-size:26px;line-height:32px;color:{INK};">{esc(copy["when"][1])}</p>
    <p style="margin:0 0 4px;font-family:{LABEL};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">{esc(copy["where"][0])}</p>
    <p style="margin:0 0 2px;font-family:{SERIF};font-style:italic;font-size:24px;line-height:30px;color:{INK};">{esc(copy["where"][1])}</p>
    <p style="margin:0 0 26px;font-family:{BODY};font-size:13px;line-height:19px;color:{INK2};">{esc(copy["whereSub"])}</p>

    {gold_divider(190)}

    <p style="margin:26px 0 14px;font-family:{BODY};font-size:16px;line-height:26px;color:{INK};">{esc(copy["inviteLead"])}</p>
    <div style="margin:0 0 10px;">{button(INVITE_URL, esc(copy["inviteButton"]))}</div>
    <p style="margin:0 0 26px;font-family:{BODY};font-size:13px;line-height:20px;"><a href="{INVITE_URL}" style="color:{LINK_PAPER};text-decoration:underline;text-decoration-color:{GOLD};">{INVITE_URL}</a></p>

    <p style="margin:0 0 26px;font-family:{BODY};font-size:15px;line-height:24px;color:{INK};">{contact_html(copy, LINK_PAPER)}</p>

    <p style="margin:0 0 6px;font-family:{SERIF};font-style:italic;font-size:19px;line-height:26px;color:{INK2};">{esc(closing)}</p>
    <p style="margin:0 0 30px;">{signature(size=32)}</p>
  </td></tr>

  <tr><td bgcolor="{PAPER2}" class="p-sm" style="background-color:{PAPER2};border-top:1px dashed #b98a3a;padding:20px 48px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td colspan="2" style="padding:0 0 10px;font-family:{LABEL};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">{esc(copy["recapTitle"])}</td></tr>
"""
    for label, value in rows:
        out += f"""      <tr>
        <td valign="top" width="40%" style="width:40%;padding:5px 12px 5px 0;font-family:{SERIF};font-style:italic;font-size:17px;line-height:22px;color:{INK2};">{esc(label)}</td>
        <td valign="top" style="padding:5px 0;font-family:{BODY};font-size:15px;line-height:22px;color:{INK};">{nl2br(esc(value))}</td>
      </tr>
"""
    out += f"""    </table>
  </td></tr>
  </table>
</td></tr>

<tr><td align="center" style="padding:22px 24px 0;text-align:center;">
  <p style="margin:0 0 6px;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;line-height:16px;"><a class="dm-gold" href="{INVITE_URL}" style="color:{GOLD_DEEP};text-decoration:none;">raccoon.website/svatba</a></p>
  <p class="dm-text" style="margin:0;font-family:{BODY};font-size:12px;line-height:18px;color:{INK2};">{esc(copy["footerNote"])}</p>
</td></tr>
"""
    out += CONTAINER_CLOSE
    return out


# ================================================================ COUPLE helpers (Czech)
def lang_cs(lang):
    return {"en": "angličtina", "fr": "francouzština"}.get(lang, "čeština")


def acc_cs(acc):
    return {"yes": "chce pomoct s ubytováním", "no": "ubytování neřeší"}.get(acc, "")


def couple_subject(data):
    return f"Svatba – odpověď: {data['name']} ({'přijde' if data['attending'] == 'yes' else 'nepřijde'})"


def couple_preheader(data):
    yes = data["attending"] == "yes"
    bits = [f"{data['name']} {'přijde' if yes else 'nepřijde'}"]
    if data["party"]:
        bits.append(f"s sebou: {data['party']}")
    if data["accommodation"]:
        bits.append(acc_cs(data["accommodation"]))
    if data["note"]:
        bits.append(f"Dotaz: {data['note']}")
    return " · ".join(bits)


def mailto_reply(data):
    subj = html.escape("Re: svatba Terezy a Daniela")
    return f"mailto:{data['email']}?subject={subj.replace(' ', '%20')}"


# ================================================================ COUPLE A
# "Night notification": dark card, the header is the sunset sky for a yes and
# a cold dusk for a no, with a big status pill; paper body with clean rows.
def couple_a(data):
    yes = data["attending"] == "yes"
    if yes:
        hdr_bg, hdr_grad = MAUVE, f"linear-gradient(150deg,{PLUM} 0%,{MAUVE} 45%,{ROSE} 75%,{APRICOT} 100%)"
        pill = f'<span style="display:inline-block;padding:9px 18px;border-radius:999px;background-color:{APRICOT};color:#2b1706;font-family:{LABEL};font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;line-height:16px;mso-padding-alt:0;">&#10003;&nbsp; Přijde</span>'
        verb = "přijde"
    else:
        hdr_bg, hdr_grad = PLUM, f"linear-gradient(150deg,{NIGHT} 0%,{PLUM} 55%,{WINE} 100%)"
        pill = f'<span style="display:inline-block;padding:8px 18px;border-radius:999px;background-color:{WINE};border:1px solid {ROSE};color:{PAPER};font-family:{LABEL};font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;line-height:16px;">&#215;&nbsp; Nepřijde</span>'
        verb = "nepřijde"

    out = head(couple_subject(data), couple_preheader(data), "cs", "", body_bg=NIGHT)
    out += container_open(NIGHT, pad="28px 12px")

    party_line = ""
    if data["party"]:
        party_line = f'<p style="margin:14px 0 0;font-family:{SERIF};font-style:italic;font-size:22px;line-height:28px;color:{PAPER};">s&nbsp;sebou bere: <span style="font-style:normal;color:{GOLD};">{esc(data["party"])}</span></p>'

    out += f"""
<tr><td bgcolor="{hdr_bg}" class="p-sm" style="background-color:{hdr_bg};background-image:{hdr_grad};padding:34px 36px 30px;border-radius:8px 8px 0 0;">
  <p style="margin:0 0 16px;font-family:{LABEL};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{PAPER};line-height:16px;">Nová odpověď na pozvánku</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>{pill}</td></tr></table>
  <h1 class="h-sm" style="margin:16px 0 0;font-family:{SERIF};font-weight:500;font-size:42px;line-height:48px;color:{PAPER};">{esc(data["name"])} <span style="font-style:italic;">{verb}</span></h1>
  {party_line}
</td></tr>
<tr><td bgcolor="{PAPER}" class="p-sm" style="background-color:{PAPER};padding:24px 36px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
"""

    def row(label, value_html, last=False):
        border = "" if last else f"border-bottom:1px solid {PAPER2};"
        return f"""    <tr>
      <td valign="top" width="30%" style="width:30%;padding:12px 12px 12px 0;{border}font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{GOLD_DEEP};line-height:22px;">{label}</td>
      <td valign="top" style="padding:12px 0;{border}font-family:{BODY};font-size:16px;line-height:22px;color:{INK};">{value_html}</td>
    </tr>
"""

    email_html = (
        f'<a href="{mailto_reply(data)}" style="color:{LINK_PAPER};text-decoration:underline;text-decoration-color:{GOLD};font-weight:700;">{esc(data["email"])}</a>'
        if data["email"] else "—"
    )
    out += row("E-mail", email_html)
    out += row("Doprovod", esc(data["party"]) if data["party"] else "—")
    if data["accommodation"]:
        out += row(
            "Ubytování",
            f'<span style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:{PEACH};color:#2b1706;font-size:14px;font-weight:700;line-height:20px;">{esc(acc_cs(data["accommodation"]))}</span>',
        )
    out += row("Jazyk", esc(lang_cs(data["lang"])))
    out += row("Čas", esc(data["time"]), last=True)
    out += "  </table>\n"

    if data["note"]:
        out += f"""
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
    <tr><td bgcolor="{PAPER2}" style="background-color:{PAPER2};border-left:3px solid {GOLD};padding:14px 18px;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 4px;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">Dotazy</p>
      <p style="margin:0;font-family:{SERIF};font-style:italic;font-size:20px;line-height:27px;color:{INK};">„{nl2br(esc(data["note"]))}“</p>
    </td></tr>
  </table>
"""
    else:
        out += f"""
  <p style="margin:12px 0 0;font-family:{BODY};font-size:14px;line-height:20px;color:{INK2};">Bez dotazů.</p>
"""

    cta = ""
    if data["email"]:
        cta = button(mailto_reply(data), "Odpovědět e-mailem")
    out += f"""
</td></tr>
<tr><td bgcolor="{PAPER}" class="p-sm" style="background-color:{PAPER};padding:22px 36px 32px;border-radius:0 0 8px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding:0 18px 0 0;">{cta}</td>
    <td style="font-family:{LABEL};font-size:12px;letter-spacing:1px;text-transform:uppercase;line-height:16px;"><a href="{INVITE_URL}" style="color:{LINK_PAPER};text-decoration:underline;text-decoration-color:{GOLD};">Pozvánka</a></td>
  </tr></table>
</td></tr>
<tr><td align="center" style="padding:22px 24px 0;text-align:center;">
  <p style="margin:0 0 4px;font-family:{SERIF};font-size:20px;letter-spacing:3px;color:{GOLD};line-height:24px;">T &amp; D</p>
  <p style="margin:0;font-family:{BODY};font-size:12px;line-height:18px;color:#8f86a0;">Odpověď z formuláře na raccoon.website/svatba. Odpovědí na tento e-mail píšete přímo hostovi.</p>
</td></tr>
"""
    out += CONTAINER_CLOSE
    return out


# ================================================================ COUPLE B
# "Guest-book ledger": cream stationery with a coloured top rule, a rubber
# stamp PŘIJDE / NEPŘIJDE in the corner and a hairline ledger of the answers.
def couple_b(data):
    yes = data["attending"] == "yes"
    stamp_color = GOLD_DEEP if yes else WINE
    accent = APRICOT if yes else WINE
    stamp_text = "Přijde" if yes else "Nepřijde"

    dark_css = f"""  @media (prefers-color-scheme: dark) {{
    body, .outer {{ background-color:{GROUND} !important; }}
    .dm-text {{ color:#c9bfcf !important; }}
    .dm-gold {{ color:{GOLD} !important; }}
  }}"""
    out = head(couple_subject(data), couple_preheader(data), "cs", dark_css, body_bg=PAPER2)
    out += container_open(PAPER2, pad="28px 12px")

    if yes:
        headline = f'{esc(data["name"])} <span style="font-style:italic;color:{GOLD_DEEP};">přijde</span>'
        sub = (
            f'a s&nbsp;sebou bere <span style="font-style:italic;color:{INK};">{esc(data["party"])}</span>.'
            if data["party"] else "bez doprovodu."
        )
    else:
        headline = f'{esc(data["name"])} <span style="font-style:italic;color:{WINE};">bohužel nepřijde</span>'
        sub = "Tentokrát to nevyjde."

    out += f"""
<tr><td bgcolor="{accent}" style="background-color:{accent};height:6px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
<tr><td bgcolor="{PAPER}" class="p-sm" style="background-color:{PAPER};border:1px solid {GOLD_DEEP};border-top:0;padding:30px 44px 36px;border-radius:0 0 4px 4px;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td valign="middle" style="font-family:{LABEL};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{GOLD_DEEP};line-height:16px;">Svatební odpověď<br><span style="color:{INK2};letter-spacing:1px;text-transform:none;font-family:{BODY};font-size:12px;">{esc(data["time"])} &nbsp;·&nbsp; {esc(lang_cs(data["lang"]))}</span></td>
      <td valign="middle" align="right" style="text-align:right;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>
          <td style="border:3px double {stamp_color};padding:8px 14px;font-family:{LABEL};font-size:14px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:{stamp_color};line-height:16px;white-space:nowrap;">{stamp_text}</td>
        </tr></table>
      </td>
    </tr>
  </table>

  <h1 class="h-sm" style="margin:26px 0 6px;font-family:{SERIF};font-weight:500;font-size:40px;line-height:46px;color:{INK};">{headline}</h1>
  <p style="margin:0 0 26px;font-family:{SERIF};font-size:22px;line-height:28px;color:{INK2};">{sub}</p>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid {GOLD};">
"""

    def ledger(label, value_html):
        return f"""    <tr>
      <td valign="top" width="34%" style="width:34%;padding:11px 12px 11px 0;border-bottom:1px solid #e6d5b3;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{GOLD_DEEP};line-height:22px;">{label}</td>
      <td valign="top" style="padding:11px 0;border-bottom:1px solid #e6d5b3;font-family:{BODY};font-size:16px;line-height:22px;color:{INK};">{value_html}</td>
    </tr>
"""

    email_html = (
        f'<a href="{mailto_reply(data)}" style="color:{LINK_PAPER};text-decoration:underline;text-decoration-color:{GOLD};font-weight:700;">{esc(data["email"])}</a>'
        if data["email"] else "—"
    )
    out += ledger("Účast", f'<strong style="color:{stamp_color};">{"ano, přijde" if yes else "ne, nepřijde"}</strong>')
    out += ledger("E-mail", email_html)
    out += ledger("Doprovod", esc(data["party"]) if data["party"] else "—")
    if data["accommodation"]:
        out += ledger("Ubytování", esc(acc_cs(data["accommodation"])))
    out += ledger("Jazyk", esc(lang_cs(data["lang"])))
    out += ledger("Čas", esc(data["time"]))
    out += "  </table>\n"

    if data["note"]:
        out += f"""
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;">
    <tr>
      <td valign="top" width="34" style="width:34px;font-family:{SERIF};font-size:56px;line-height:40px;color:{GOLD};">&#8222;</td>
      <td valign="top" style="padding-top:6px;">
        <p style="margin:0 0 4px;font-family:{LABEL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{GOLD_DEEP};line-height:14px;">Dotazy</p>
        <p style="margin:0;font-family:{SERIF};font-style:italic;font-size:22px;line-height:30px;color:{INK};">{nl2br(esc(data["note"]))}</p>
      </td>
    </tr>
  </table>
"""
    else:
        out += f'  <p style="margin:18px 0 0;font-family:{BODY};font-size:14px;line-height:20px;color:{INK2};">Bez dotazů.</p>\n'

    cta = button(mailto_reply(data), "Odpovědět") if data["email"] else ""
    out += f"""
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr>
    <td style="padding:0 18px 0 0;">{cta}</td>
    <td style="font-family:{LABEL};font-size:12px;letter-spacing:1px;text-transform:uppercase;line-height:16px;"><a href="{INVITE_URL}" style="color:{LINK_PAPER};text-decoration:underline;text-decoration-color:{GOLD};">Pozvánka</a></td>
  </tr></table>
</td></tr>
<tr><td align="center" style="padding:22px 24px 0;text-align:center;">
  <p class="dm-gold" style="margin:0 0 4px;font-family:{SERIF};font-size:20px;letter-spacing:3px;color:{GOLD_DEEP};line-height:24px;">T &amp; D</p>
  <p class="dm-text" style="margin:0;font-family:{BODY};font-size:12px;line-height:18px;color:{INK2};">Odpověď z formuláře na raccoon.website/svatba. Odpovědí na tento e-mail píšete přímo hostovi.</p>
</td></tr>
"""
    out += CONTAINER_CLOSE
    return out


# ================================================================ images (Pillow)
def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient_color(stops, t):
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t0 <= t <= t1:
            return lerp(hexrgb(c0), hexrgb(c1), (t - t0) / (t1 - t0) if t1 > t0 else 0)
    return hexrgb(stops[-1][1])


def make_hills(path, W=1200, H=220, S=2):
    """Sunset horizon strip: apricot sky + glow, three hill layers, apricot trees.
    Top row is CORAL->APRICOT (continues the hero), bottom row is GROUND."""
    w, h = W * S, H * S
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    sky = [(0.0, APRICOT), (0.30, PEACH), (0.55, "#fbd39a"), (1.0, PEACH)]
    for y in range(h):
        d.line([(0, y), (w, y)], fill=gradient_color(sky, y / (h - 1)))

    # sun glow near the horizon
    glow = Image.radial_gradient("L").resize((int(w * 0.8), int(h * 0.9)))
    glow = glow.point(lambda v: int((255 - v) * 0.55))
    glow_layer = Image.new("RGB", glow.size, hexrgb("#ffe4b8"))
    img.paste(glow_layer, (int(w * 0.1), int(h * 0.05)), glow)

    def ridge(base, waves, y_end=h):
        pts = []
        for x in range(0, w + 1, 4 * S):
            y = base
            for amp, period, phase in waves:
                y += amp * math.sin(2 * math.pi * x / period + phase)
            pts.append((x, y))
        pts += [(w, y_end), (0, y_end)]
        return pts

    d.polygon(ridge(h * 0.36, [(h * 0.07, w * 0.55, 0.8), (h * 0.03, w * 0.21, 2.1)]), fill=hexrgb("#7d5a72"))
    d.polygon(ridge(h * 0.52, [(h * 0.08, w * 0.62, 2.6), (h * 0.03, w * 0.17, 0.4)]), fill=hexrgb("#4c3450"))

    near_base = h * 0.70
    near_waves = [(h * 0.07, w * 0.7, 1.4), (h * 0.02, w * 0.19, 3.0)]
    d.polygon(ridge(near_base, near_waves), fill=hexrgb("#1e1526"))

    def ridge_y(x, base, waves):
        return base + sum(a * math.sin(2 * math.pi * x / p + ph) for a, p, ph in waves)

    def tree(x, y, size, color, fruit=False):
        # forked trunk + clumpy canopy, like the site's <symbol id="sv-tree-a">
        tw = max(2, int(size * 0.07))
        d.line([(x, y), (x, y - size * 0.45)], fill=color, width=tw)
        d.line([(x, y - size * 0.25), (x - size * 0.16, y - size * 0.45)], fill=color, width=tw)
        d.line([(x, y - size * 0.3), (x + size * 0.17, y - size * 0.5)], fill=color, width=tw)
        for cx, cy, r in [(-0.13, -0.6, 0.25), (0.13, -0.62, 0.27), (0, -0.8, 0.25), (0.22, -0.48, 0.18), (-0.22, -0.46, 0.17)]:
            d.ellipse([x + cx * size - r * size, y + cy * size - r * size, x + cx * size + r * size, y + cy * size + r * size], fill=color)
        if fruit:
            for fx, fy in [(-0.06, -0.72), (0.15, -0.58), (0.04, -0.86)]:
                r = size * 0.028
                d.ellipse([x + fx * size - r, y + fy * size - r, x + fx * size + r, y + fy * size + r], fill=hexrgb("#f5a55a"))

    # small tree row along the near ridge
    x = -20 * S
    i = 0
    while x < w + 60 * S:
        size = (26 + (i % 3) * 7) * S
        tree(x, ridge_y(x, near_base, near_waves) + 3 * S, size, hexrgb("#2a1f38"))
        x += (52 + (i % 4) * 9) * S
        i += 1

    # ground fade to page colour
    fade_from = int(h * 0.80)
    for y in range(fade_from, h):
        t = (y - fade_from) / (h - fade_from)
        d.line([(0, y), (w, y)], fill=lerp(hexrgb("#1e1526"), hexrgb(GROUND), t))
    d.rectangle([0, h - 2 * S, w, h], fill=hexrgb(GROUND))

    # foreground orchard, bigger, a few ripening apricots
    x = 10 * S
    i = 0
    while x < w + 40 * S:
        size = (44 + (i % 3) * 10) * S
        tree(x, h - 6 * S, size, hexrgb(GROUND), fruit=(i % 2 == 0))
        x += (66 + (i % 3) * 14) * S
        i += 1

    img = img.resize((W, H), Image.LANCZOS)
    img.save(path, optimize=True)


def make_blossom(path, size=216, S=4):
    """Five-petal apricot blossom: cream petals with a thin gold edge, apricot centre."""
    w = size * S
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = w / 2
    petal_len, petal_wid, dist = w * 0.30, w * 0.20, w * 0.22
    stroke = 2 * S

    def petal(k, shrink):
        a = -math.pi / 2 + k * 2 * math.pi / 5
        px, py = cx + dist * math.cos(a), cy + dist * math.sin(a)
        pts = []
        for j in range(72):
            t = 2 * math.pi * j / 72
            ex, ey = (petal_len - shrink) * math.cos(t), (petal_wid - shrink) * math.sin(t)
            rx = ex * math.cos(a) - ey * math.sin(a)
            ry = ex * math.sin(a) + ey * math.cos(a)
            pts.append((px + rx, py + ry))
        return pts

    # gold silhouette first, then the cream petals inset by the stroke: the gold
    # only survives around the union, so overlapping petals show no fold lines.
    for k in range(5):
        d.polygon(petal(k, 0), fill=hexrgb(GOLD) + (255,))
    for k in range(5):
        d.polygon(petal(k, stroke), fill=hexrgb("#fdf6ec") + (255,))
    r = w * 0.13
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hexrgb(APRICOT) + (255,))
    for k in range(8):
        a = k * 2 * math.pi / 8 + 0.3
        sx, sy = cx + r * 0.62 * math.cos(a), cy + r * 0.62 * math.sin(a)
        sr = w * 0.018
        d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=hexrgb("#e07b39") + (255,))
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, optimize=True)


# ================================================================ review sheet
def index_html(templates):
    """templates: list of (file, title, concept, group)."""
    cards = []
    embeds = ""
    for i, (fname, title, concept, group) in enumerate(templates):
        with open(os.path.join(OUT, fname), encoding="utf-8") as f:
            src = f.read()
        embeds += f'<script type="text/plain" id="src-{i}">{src.replace("</script", "<\\/script")}</script>\n'
        cards.append(f"""
<article class="card" data-group="{group}">
  <header><h3>{esc(title)}</h3><p>{esc(concept)}</p><a href="{fname}" target="_blank">open {fname}</a></header>
  <div class="frame"><iframe title="{esc(title)}" data-src="src-{i}" scrolling="no"></iframe></div>
</article>""")
    grid = lambda a, b: "".join(cards[a:b])
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RSVP email templates – review</title>
<style>
  body {{ margin:0; background:#1b1526; color:#f6efe4; font-family: Nunito, system-ui, sans-serif; }}
  .top {{ padding:28px 32px 8px; }}
  h1 {{ font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 500; font-size: 38px; margin:0 0 6px; }}
  h1 span {{ color:#e2b45f; font-style:normal; }}
  .top p {{ margin:0 0 14px; color:#c9bfcf; max-width:80ch; }}
  .controls {{ display:flex; gap:10px; flex-wrap:wrap; }}
  .controls button {{ background:transparent; color:#f6efe4; border:1px solid rgba(226,180,95,.5); border-radius:999px; padding:8px 16px; cursor:pointer; font: inherit; }}
  .controls button[aria-pressed="true"] {{ background:#e2b45f; color:#2b1706; }}
  h2 {{ font-family: 'Josefin Sans', Arial, sans-serif; font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#e2b45f; margin:34px 32px 12px; }}
  .grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(620px, 1fr)); gap:24px; padding:0 32px 40px; }}
  .card {{ background:#0f0c18; border:1px solid rgba(226,180,95,.25); border-radius:10px; overflow:hidden; }}
  .card header {{ padding:14px 18px 12px; border-bottom:1px solid rgba(226,180,95,.2); }}
  .card h3 {{ margin:0 0 4px; font-family:'Cormorant Garamond', Georgia, serif; font-size:24px; font-weight:500; }}
  .card header p {{ margin:0 0 6px; color:#c9bfcf; font-size:14px; line-height:1.4; }}
  .card header a {{ color:#e2b45f; font-size:12px; }}
  .frame {{ padding:18px; display:flex; justify-content:center; background:#2a2236; }}
  iframe {{ width:600px; border:0; background:transparent; display:block; box-shadow:0 20px 50px rgba(0,0,0,.5); transition: width .2s; }}
  body.phone iframe {{ width:375px; }}
  @media (max-width: 700px) {{ .grid {{ grid-template-columns:1fr; padding:0 12px 40px; }} iframe {{ width:100%; }} }}
</style>
</head>
<body>
<div class="top">
  <h1>Tereza <span>&amp;</span> Daniel · RSVP e-mail templates</h1>
  <p>Two concepts per e-mail. Guest templates are shown for both answers (attending / not attending), couple templates too, so yes vs no can be judged at a glance. Everything is table-based, inline-styled, 600px, fluid to 320px. Toggle the width to preview the phone layout.</p>
  <div class="controls">
    <button type="button" data-w="desktop" aria-pressed="true">600 px</button>
    <button type="button" data-w="phone" aria-pressed="false">375 px (phone)</button>
  </div>
</div>

<h2>1 · Guest confirmation — attending</h2>
<div class="grid">{grid(0, 2)}</div>
<h2>2 · Guest confirmation — not attending (same templates, short variant text)</h2>
<div class="grid">{grid(2, 4)}</div>
<h2>3 · Couple notification — přijde</h2>
<div class="grid">{grid(4, 6)}</div>
<h2>4 · Couple notification — nepřijde</h2>
<div class="grid">{grid(6, 8)}</div>

{embeds}
<script>
  // Inline each template via srcdoc (same origin) so the iframes can size to content.
  document.querySelectorAll('iframe[data-src]').forEach(function (f) {{
    f.addEventListener('load', function () {{
      try {{ f.style.height = (Math.ceil(f.contentDocument.body.getBoundingClientRect().height) + 2) + 'px'; }} catch (e) {{ f.style.height = '1400px'; }}
    }});
    f.srcdoc = document.getElementById(f.dataset.src).textContent;
  }});
  if (location.hash === '#phone') {{
    document.body.classList.add('phone');
    document.querySelectorAll('.controls button').forEach(function (x) {{ x.setAttribute('aria-pressed', x.dataset.w === 'phone' ? 'true' : 'false'); }});
  }}
  document.querySelectorAll('.controls button').forEach(function (b) {{
    b.addEventListener('click', function () {{
      document.querySelectorAll('.controls button').forEach(function (x) {{ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }});
      document.body.classList.toggle('phone', b.dataset.w === 'phone');
      setTimeout(function () {{
        document.querySelectorAll('iframe[data-src]').forEach(function (f) {{
          try {{ f.style.height = (Math.ceil(f.contentDocument.body.getBoundingClientRect().height) + 2) + 'px'; }} catch (e) {{}}
        }});
      }}, 250);
    }});
  }});
</script>
</body>
</html>
"""


def write(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


if __name__ == "__main__":
    make_hills(os.path.join(OUT, "hills.png"))
    make_blossom(os.path.join(OUT, "blossom.png"))

    write("guest-a.html", guest_a(GUEST_YES))
    write("guest-a-no.html", guest_a(GUEST_NO))
    write("guest-b.html", guest_b(GUEST_YES))
    write("guest-b-no.html", guest_b(GUEST_NO))
    write("couple-a.html", couple_a(COUPLE_YES))
    write("couple-a-no.html", couple_a(COUPLE_NO))
    write("couple-b.html", couple_b(COUPLE_YES))
    write("couple-b-no.html", couple_b(COUPLE_NO))

    templates = [
        ("guest-a.html", "Guest A · Sunset hero", "The invitation's hero as an e-mail: sky gradient, names with the gold ampersand, a horizon strip of hills and apricot trees, then a paper card floating on the night ground.", "guest"),
        ("guest-b.html", "Guest B · Letterpress stationery", "A single cream card with a double gold rule and T&D monogram, centred stationery typography, and the reply recap as a perforated ticket stub. No images at all.", "guest"),
        ("guest-a-no.html", "Guest A · not attending", "Same template; kicker, intro and closing switch to the 'no' copy, recap shows the answer.", "guest-no"),
        ("guest-b-no.html", "Guest B · not attending", "Same template; kicker, intro and closing switch to the 'no' copy, recap shows the answer.", "guest-no"),
        ("couple-a.html", "Couple A · Night notification", "Dark card: the header is the sunset sky for a yes (cold dusk for a no) with a status pill, the name and verb as the headline; clean paper rows, note as a quote, one reply button.", "couple"),
        ("couple-b.html", "Couple B · Guest-book ledger", "Cream stationery with a coloured top rule and a double-lined rubber stamp PŘIJDE / NEPŘIJDE; the answers as a hairline ledger, the note as a pull quote.", "couple"),
        ("couple-a-no.html", "Couple A · nepřijde", "Header turns to night/plum/wine, pill becomes wine with ×; party line disappears.", "couple-no"),
        ("couple-b-no.html", "Couple B · nepřijde", "Top rule and stamp turn wine; headline verb in wine.", "couple-no"),
    ]
    write("index.html", index_html(templates))
    print("ok")
