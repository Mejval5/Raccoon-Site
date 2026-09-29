"use strict";

/**
 * Pure helpers for the wedding RSVP endpoint. No firebase imports here on
 * purpose so this file can be unit tested without the Firebase SDKs.
 */

const crypto = require("node:crypto");

// SHA-256 hex of the invite token. The raw token itself must never appear
// in this repository — only this hash.
const TOKEN_SHA256 =
  "9d8e254a008ba12ca209ab49dbdede7cf80c5c181b6070e9b64babc604f0de97";

const COUPLE_EMAILS = [
  "necesal.daniel@gmail.com",
  "terezasancova1999@gmail.com",
];

// Who gets the "new RSVP" notification. Only Daniel while the invitation is still being tested;
// add "terezasancova1999@gmail.com" back (or use COUPLE_EMAILS) before the invite link goes out.
const NOTIFY_EMAILS = ["necesal.daniel@gmail.com"];

const ALLOWED_ORIGINS = [
  "https://raccoon.website",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8082",
];

const INVITE_URL = "https://raccoon.website/svatba/";

// Absolute URLs the decorative Guest-A hero images are hosted at (site/svatba/email/).
// Gmail strips data: URIs, so these must be real hosted files, not inlined.
const EMAIL_IMAGE_BASE = "https://raccoon.website/svatba/email/";
const HILLS_URL = `${EMAIL_IMAGE_BASE}hills.png`;
const BLOSSOM_URL = `${EMAIL_IMAGE_BASE}blossom.png`;

// Palette + fonts, lifted straight from site/svatba/svatba.css (see
// wedding/email-templates/NOTES.md for the full rationale).
const NIGHT = "#0b0d1a";
const GROUND = "#140f22";
const PLUM = "#3b2a4a";
const PLUM2 = "#5a3552";
const MAUVE = "#a0506a";
const ROSE = "#d9707a";
const CORAL = "#eb8f6a";
const APRICOT = "#f5a55a";
const PEACH = "#f8c07e";
const PAPER = "#f6efe4";
const PAPER2 = "#efe4d2";
const INK = "#2b2230";
const INK2 = "#5c4a56";
const GOLD = "#e2b45f";
const GOLD_DEEP = "#7a5213";
const WINE = "#5a1420";
const LINK_PAPER = "#6a3b12";

const SERIF_FONT = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const LABEL_FONT = "'Josefin Sans',Arial,Helvetica,sans-serif";
const BODY_FONT = "Nunito,Arial,Helvetica,sans-serif";

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500" +
  "&family=Josefin+Sans:wght@600&family=Nunito:wght@400;700&display=swap";

// Padding appended after the hidden preheader text so Gmail/Outlook don't pull
// in the start of the visible body as a preview continuation.
const PREHEADER_PAD = "&zwnj;&nbsp;".repeat(20);

// Shared <head>...<body> open + hidden preheader, used by both HTML emails.
function emailHead(title, preheader, lang, extraCss, bodyBg) {
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if !mso]><!--><link href="${FONT_LINK}" rel="stylesheet"><!--<![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
  @media only screen and (max-width:620px) {
    .w-full { width:100% !important; max-width:100% !important; }
    .p-sm { padding-left:22px !important; padding-right:22px !important; }
    .p-xs { padding-left:8px !important; padding-right:8px !important; }
    .h-sm { font-size:36px !important; line-height:40px !important; }
    .h2-sm { font-size:30px !important; line-height:36px !important; }
    .stack { display:block !important; width:100% !important; box-sizing:border-box; }
    .stack-gap { padding-top:18px !important; }
    .center-sm { text-align:center !important; }
  }
${extraCss}
</style>
</head>
<body style="margin:0;padding:0;background-color:${bodyBg};word-break:normal;" bgcolor="${bodyBg}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${bodyBg};">${escapeHtml(
    preheader
  )}${PREHEADER_PAD}</div>
`;
}

function containerOpen(bodyBg, pad) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${bodyBg}" class="outer" style="background-color:${bodyBg};">
<tr><td align="center" style="padding:${pad};">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" class="w-full" style="width:600px;max-width:600px;margin:0 auto;border-collapse:separate;border-spacing:0;">
`;
}

const CONTAINER_CLOSE = `</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;

// Bulletproof-ish pill button: the td carries the colour, the anchor carries padding.
// `label` must already be HTML-escaped by the caller.
function buttonHtml(href, label, opts) {
  const o = opts || {};
  const bg = o.bg || WINE;
  const fg = o.fg || PAPER;
  const radius = o.radius || "999px";
  const border = o.border || "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
<tr><td bgcolor="${bg}" style="background-color:${bg};border-radius:${radius};${border}mso-padding-alt:14px 30px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${LABEL_FONT};font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${fg};text-decoration:none;border-radius:${radius};line-height:16px;">${label}</a>
</td></tr></table>`;
}

const SIGNATURE_HTML = `<span style="font-family:${SERIF_FONT};font-size:28px;line-height:34px;font-style:italic;color:${INK};">Tereza <span style="font-style:normal;color:${GOLD_DEEP};">&amp;</span> Daniel</span>`;

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

// Disallows all C0 control chars + DEL, including \n and \t (single-line
// fields like name/email must not contain any of these).
const CONTROL_STRICT_RE = /[\u0000-\u001f\u007f]/;

// Disallows all C0 control chars + DEL EXCEPT \t (\u0009) and \n (\u000a),
// for multi-line fields (party/note) that may legitimately contain those.
const CONTROL_LOOSE_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function sha256Hex(str) {
  return crypto.createHash("sha256").update(String(str), "utf8").digest("hex");
}

function verifyToken(token) {
  if (typeof token !== "string") return false;
  if (token.length === 0 || token.length > 200) return false;
  const candidate = Buffer.from(sha256Hex(token), "hex");
  const expected = Buffer.from(TOKEN_SHA256, "hex");
  if (candidate.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(candidate, expected);
  } catch (e) {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(escaped) {
  return escaped.replace(/\n/g, "<br>");
}

function isHoneypot(body) {
  if (body === null || typeof body !== "object") return false;
  const w = body.website;
  if (typeof w === "string") return w.trim().length > 0;
  return Boolean(w);
}

function fail() {
  return { ok: false, error: "invalid" };
}

function validateRsvp(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return fail();
  }

  // name — required, 2-120 chars after trim, no control chars.
  if (typeof body.name !== "string") return fail();
  const name = body.name.trim();
  if (name.length < 2 || name.length > 120) return fail();
  if (CONTROL_STRICT_RE.test(name)) return fail();

  // email — optional; "" when absent.
  let email = "";
  if (body.email !== undefined && body.email !== null) {
    if (typeof body.email !== "string") return fail();
    email = body.email.trim();
    if (email.length > 0) {
      if (email.length > 200) return fail();
      if (CONTROL_STRICT_RE.test(email)) return fail();
      if (!EMAIL_RE.test(email)) return fail();
    }
  }

  // attending — required, "yes" | "no".
  if (typeof body.attending !== "string") return fail();
  const attending = body.attending.trim();
  if (attending !== "yes" && attending !== "no") return fail();

  // party — optional, <=300 chars, multi-line allowed.
  let party = "";
  if (body.party !== undefined && body.party !== null) {
    if (typeof body.party !== "string") return fail();
    party = body.party.trim();
    if (party.length > 300) return fail();
    if (CONTROL_LOOSE_RE.test(party)) return fail();
  }

  // accommodation — "yes" | "no" | "" (missing -> "").
  let accommodation = "";
  if (
    body.accommodation !== undefined &&
    body.accommodation !== null &&
    body.accommodation !== ""
  ) {
    if (typeof body.accommodation !== "string") return fail();
    const acc = body.accommodation.trim();
    if (acc !== "yes" && acc !== "no" && acc !== "") return fail();
    accommodation = acc;
  }

  // note — optional, <=1000 chars, multi-line allowed.
  let note = "";
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return fail();
    note = body.note.trim();
    if (note.length > 1000) return fail();
    if (CONTROL_LOOSE_RE.test(note)) return fail();
  }

  // lang — "cs" | "en" | "fr", lenient default to "cs".
  let lang = "cs";
  if (body.lang !== undefined && body.lang !== null) {
    if (typeof body.lang !== "string") return fail();
    const trimmed = body.lang.trim();
    lang = trimmed === "en" || trimmed === "fr" ? trimmed : "cs";
  }

  return {
    ok: true,
    data: { name, email, attending, party, accommodation, note, lang },
  };
}

function accommodationLabelCs(acc) {
  if (acc === "yes") return "ano";
  if (acc === "no") return "ne";
  return "nevím";
}

function accommodationLabelEn(acc) {
  if (acc === "yes") return "yes";
  if (acc === "no") return "no";
  return "not sure yet";
}

function accommodationLabelFr(acc) {
  if (acc === "yes") return "oui";
  if (acc === "no") return "non";
  return "je ne sais pas encore";
}

function langLabelCs(lang) {
  if (lang === "en") return "angličtina";
  if (lang === "fr") return "francouzština";
  return "čeština";
}

// Accommodation phrasing for the couple notification only (design A: "Night
// notification"). The guest-facing recap keeps the plain ano/ne/nevím wording
// from accommodationLabelCs above.
function coupleAccommodationLabel(acc) {
  if (acc === "yes") return "chce pomoct s ubytováním";
  if (acc === "no") return "ubytování neřeší";
  return "";
}

function coupleSubject(data) {
  const attendingWord = data.attending === "yes" ? "přijde" : "nepřijde";
  return `Svatba – odpověď: ${data.name} (${attendingWord})`;
}

function couplePreheader(data) {
  const yes = data.attending === "yes";
  const bits = [`${data.name} ${yes ? "přijde" : "nepřijde"}`];
  if (data.party) bits.push(`s sebou: ${data.party}`);
  if (data.accommodation) bits.push(coupleAccommodationLabel(data.accommodation));
  if (data.note) bits.push(`Dotaz: ${data.note}`);
  return bits.join(" · ");
}

// mailto: reply link. The subject only ever contains ASCII/no HTML-special
// characters, so a straight %20-for-space swap (matching the design source)
// is enough; the guest's address is still HTML-escaped by the caller.
const COUPLE_REPLY_SUBJECT = "Re:%20svatba%20Terezy%20a%20Daniela";

function mailtoReplyHref(email) {
  return `mailto:${escapeHtml(email)}?subject=${COUPLE_REPLY_SUBJECT}`;
}

// Couple notification, design A ("Night notification"): a dark status card —
// sunset-sky header + "PŘIJDE" pill for a yes, cold-dusk header + "NEPŘIJDE"
// pill for a no — then a clean paper body with the answer rows, the note as
// a quoted block, and a reply-by-email button. Czech only, as today. IP and
// user agent are intentionally no longer shown (see NOTES.md / task brief).
function buildCoupleEmail(data, meta) {
  const yes = data.attending === "yes";
  const verb = yes ? "přijde" : "nepřijde";
  const subject = coupleSubject(data);
  const preheader = couplePreheader(data);

  const timeStr = meta.createdAt.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
  });

  let hdrBg;
  let hdrGrad;
  let pillHtml;
  if (yes) {
    hdrBg = MAUVE;
    hdrGrad = `linear-gradient(150deg,${PLUM} 0%,${MAUVE} 45%,${ROSE} 75%,${APRICOT} 100%)`;
    pillHtml =
      `<span style="display:inline-block;padding:9px 18px;border-radius:999px;background-color:${APRICOT};color:#2b1706;font-family:${LABEL_FONT};font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;line-height:16px;mso-padding-alt:0;">` +
      `&#10003;&nbsp; Přijde</span>`;
  } else {
    hdrBg = PLUM;
    hdrGrad = `linear-gradient(150deg,${NIGHT} 0%,${PLUM} 55%,${WINE} 100%)`;
    pillHtml =
      `<span style="display:inline-block;padding:8px 18px;border-radius:999px;background-color:${WINE};border:1px solid ${ROSE};color:${PAPER};font-family:${LABEL_FONT};font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;line-height:16px;">` +
      `&#215;&nbsp; Nepřijde</span>`;
  }

  const partyLineHtml = data.party
    ? `<p style="margin:14px 0 0;font-family:${SERIF_FONT};font-style:italic;font-size:22px;line-height:28px;color:${PAPER};">s&nbsp;sebou bere: <span style="font-style:normal;color:${GOLD};">${escapeHtml(
        data.party
      )}</span></p>`
    : "";

  let html = emailHead(subject, preheader, "cs", "", NIGHT);
  html += containerOpen(NIGHT, "28px 12px");

  html += `
<tr><td bgcolor="${hdrBg}" class="p-sm" style="background-color:${hdrBg};background-image:${hdrGrad};padding:34px 36px 30px;border-radius:8px 8px 0 0;">
  <p style="margin:0 0 16px;font-family:${LABEL_FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${PAPER};line-height:16px;">Nová odpověď na pozvánku</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>${pillHtml}</td></tr></table>
  <h1 class="h-sm" style="margin:16px 0 0;font-family:${SERIF_FONT};font-weight:500;font-size:42px;line-height:48px;color:${PAPER};">${escapeHtml(
    data.name
  )} <span style="font-style:italic;">${verb}</span></h1>
  ${partyLineHtml}
</td></tr>
<tr><td bgcolor="${PAPER}" class="p-sm" style="background-color:${PAPER};padding:24px 36px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
`;

  const row = (label, valueHtml, last) => {
    const border = last ? "" : `border-bottom:1px solid ${PAPER2};`;
    return `    <tr>
      <td valign="top" width="30%" style="width:30%;padding:12px 12px 12px 0;${border}font-family:${LABEL_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${GOLD_DEEP};line-height:22px;">${label}</td>
      <td valign="top" style="padding:12px 0;${border}font-family:${BODY_FONT};font-size:16px;line-height:22px;color:${INK};">${valueHtml}</td>
    </tr>
`;
  };

  const emailHtml = data.email
    ? `<a href="${mailtoReplyHref(data.email)}" style="color:${LINK_PAPER};text-decoration:underline;text-decoration-color:${GOLD};font-weight:700;">${escapeHtml(
        data.email
      )}</a>`
    : "—";
  html += row("E-mail", emailHtml);
  html += row("Doprovod", data.party ? escapeHtml(data.party) : "—");
  if (data.accommodation) {
    html += row(
      "Ubytování",
      `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:${PEACH};color:#2b1706;font-size:14px;font-weight:700;line-height:20px;">${escapeHtml(
        coupleAccommodationLabel(data.accommodation)
      )}</span>`
    );
  }
  html += row("Jazyk", escapeHtml(langLabelCs(data.lang)));
  html += row("Čas", escapeHtml(timeStr), true);
  html += "  </table>\n";

  if (data.note) {
    html += `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
    <tr><td bgcolor="${PAPER2}" style="background-color:${PAPER2};border-left:3px solid ${GOLD};padding:14px 18px;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 4px;font-family:${LABEL_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${GOLD_DEEP};line-height:14px;">Dotazy</p>
      <p style="margin:0;font-family:${SERIF_FONT};font-style:italic;font-size:20px;line-height:27px;color:${INK};">„${nl2br(
    escapeHtml(data.note)
  )}“</p>
    </td></tr>
  </table>
`;
  } else {
    html += `
  <p style="margin:12px 0 0;font-family:${BODY_FONT};font-size:14px;line-height:20px;color:${INK2};">Bez dotazů.</p>
`;
  }

  const ctaHtml = data.email
    ? buttonHtml(mailtoReplyHref(data.email), "Odpovědět e-mailem")
    : "";
  html += `
</td></tr>
<tr><td bgcolor="${PAPER}" class="p-sm" style="background-color:${PAPER};padding:22px 36px 32px;border-radius:0 0 8px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding:0 18px 0 0;">${ctaHtml}</td>
    <td style="font-family:${LABEL_FONT};font-size:12px;letter-spacing:1px;text-transform:uppercase;line-height:16px;"><a href="${INVITE_URL}" style="color:${LINK_PAPER};text-decoration:underline;text-decoration-color:${GOLD};">Pozvánka</a></td>
  </tr></table>
</td></tr>
<tr><td align="center" style="padding:22px 24px 0;text-align:center;">
  <p style="margin:0 0 4px;font-family:${SERIF_FONT};font-size:20px;letter-spacing:3px;color:${GOLD};line-height:24px;">T &amp; D</p>
  <p style="margin:0;font-family:${BODY_FONT};font-size:12px;line-height:18px;color:#8f86a0;">Odpověď z formuláře na raccoon.website/svatba. Odpovědí na tento e-mail píšete přímo hostovi.</p>
</td></tr>
`;
  html += CONTAINER_CLOSE;

  const textLines = [
    `${data.name} ${verb}`,
    ...(data.party ? [`s sebou bere: ${data.party}`] : []),
    "",
    `E-mail: ${data.email || "—"}`,
    `Doprovod: ${data.party || "—"}`,
    ...(data.accommodation
      ? [`Ubytování: ${coupleAccommodationLabel(data.accommodation)}`]
      : []),
    `Jazyk: ${langLabelCs(data.lang)}`,
    `Čas: ${timeStr}`,
    "",
    data.note ? `Dotazy: ${data.note}` : "Bez dotazů.",
    "",
    ...(data.email ? [`Odpovědět e-mailem: ${data.email}`] : []),
    `Pozvánka: ${INVITE_URL}`,
  ];
  const text = textLines.join("\n");

  const email = {
    to: NOTIFY_EMAILS.slice(),
    message: { subject, text, html },
  };
  if (data.email) {
    email.replyTo = data.email;
  }
  return email;
}

// Guest confirmation copy. Czech uses the formal/plural "vy" form throughout
// (works for one guest or a whole family and needs no gendered verb forms).
const GUEST_COPY = {
  cs: {
    subject: "Děkujeme za odpověď – svatba Terezy a Daniela",
    greeting: () => "Milí naši,",
    introYes:
      "moc děkujeme za odpověď! Máme obrovskou radost, že s námi budete slavit.",
    introNo:
      "moc děkujeme za odpověď. Je nám líto, že tentokrát nemůžete přijít – budete nám chybět.",
    when: ["Kdy", "sobota 19. 6. 2027"],
    where: ["Kde", "Stodola v Meruňkovém sadu, Dolní Kounice"],
    inviteLead: "Pozvánku se všemi podrobnostmi najdete tady:",
    contact: (a, b) =>
      `Pokud se něco změní, napište nám na ${a} nebo ${b} (nebo prostě odpovězte na tento e-mail).`,
    closingYes: "Těšíme se na vás!",
    closingNo: "Srdečně zdraví",
    colon: ":",
    recapTitle: "Vaše odpověď",
    // Design A ("Sunset hero") copy — see wedding/email-templates/NOTES.md.
    kickerYes: "Děkujeme za vaši odpověď",
    kickerNo: "Děkujeme, že jste nám dali vědět",
    preheaderYes: () =>
      "Máme radost – uvidíme se 19. 6. 2027 v meruňkovém sadu.",
    preheaderNo: () => "Budete nám chybět. Děkujeme, že jste nám dali vědět.",
    inviteButton: "Otevřít pozvánku",
    footerNote:
      "Tento e-mail vám přišel, protože jste odpověděli na naší pozvánkové stránce.",
    labels: {
      name: "Jméno",
      attending: "Účast",
      party: "Kdo přijde s vámi",
      accommodation: "Ubytování",
      note: "Dotazy",
    },
    attendingValue: (yes) => (yes ? "přijdu" : "bohužel nepřijdu"),
    accommodationValue: accommodationLabelCs,
  },
  en: {
    subject: "Thank you for your RSVP – Tereza & Daniel's wedding",
    greeting: (name) => `Dear ${name},`,
    introYes:
      "Thank you so much for your reply! We are thrilled that you will celebrate with us.",
    introNo:
      "Thank you for letting us know. We are sorry you can't make it – you will be missed.",
    when: ["When", "Saturday 19 June 2027"],
    where: ["Where", "Stodola v Meruňkovém sadu, Dolní Kounice"],
    whereSub: "a barn in an apricot orchard, South Moravia, Czech Republic",
    inviteLead: "You can find the invitation with all the details here:",
    contact: (a, b) =>
      `If anything changes, just write to us at ${a} or ${b} (or simply reply to this email).`,
    closingYes: "We can't wait to see you!",
    closingNo: "With love,",
    colon: ":",
    recapTitle: "Your reply",
    // Design A ("Sunset hero") copy — see wedding/email-templates/NOTES.md.
    kickerYes: "Thank you for your RSVP",
    kickerNo: "Thank you for letting us know",
    preheaderYes: () =>
      "We are thrilled – see you on 19 June 2027 in the apricot orchard.",
    preheaderNo: () => "You will be missed. Thank you for telling us.",
    inviteButton: "Open the invitation",
    footerNote:
      "You are receiving this because you replied on our invitation page.",
    labels: {
      name: "Name",
      attending: "Attending",
      party: "Coming with you",
      accommodation: "Help with accommodation",
      note: "Questions",
    },
    attendingValue: (yes) => (yes ? "yes, I'll be there" : "sadly, I can't make it"),
    accommodationValue: accommodationLabelEn,
  },
  fr: {
    subject: "Merci pour votre réponse – mariage de Tereza et Daniel",
    greeting: (name) => `Bonjour ${name},`,
    introYes:
      "Merci beaucoup pour votre réponse ! Nous sommes ravis que vous soyez avec nous pour fêter ce jour.",
    introNo:
      "Merci pour votre réponse. Nous sommes tristes de ne pas vous avoir parmi nous cette fois-ci – vous nous manquerez.",
    when: ["Quand", "samedi 19 juin 2027"],
    where: ["Où", "Stodola v Meruňkovém sadu, Dolní Kounice"],
    whereSub: "une grange dans un verger d'abricotiers",
    inviteLead: "Vous trouverez l'invitation avec tous les détails ici :",
    contact: (a, b) =>
      `Si quelque chose change, écrivez-nous à ${a} ou ${b} (ou répondez simplement à cet e-mail).`,
    closingYes: "Nous avons hâte de vous voir !",
    closingNo: "Bien à vous,",
    colon: " :",
    recapTitle: "Votre réponse",
    // Design A ("Sunset hero") copy — see wedding/email-templates/NOTES.md.
    kickerYes: "Merci pour votre réponse",
    kickerNo: "Merci de nous avoir prévenus",
    preheaderYes: () =>
      "Nous sommes ravis – à bientôt le 19 juin 2027 dans le verger d'abricotiers.",
    preheaderNo: () => "Vous nous manquerez. Merci de nous avoir prévenus.",
    inviteButton: "Ouvrir l'invitation",
    footerNote:
      "Vous recevez cet e-mail car vous avez répondu sur notre page d'invitation.",
    labels: {
      name: "Nom",
      attending: "Présence",
      party: "Qui vous accompagne",
      accommodation: "Aide pour l'hébergement",
      note: "Questions",
    },
    attendingValue: (yes) =>
      yes ? "oui, je serai là" : "malheureusement, je ne pourrai pas venir",
    accommodationValue: accommodationLabelFr,
  },
};

// Guest confirmation, design A ("Sunset hero"): the invitation's own hero —
// sky gradient, blossom, names, hills strip — sitting above a paper card
// (greeting, when/where, invite button, contact, closing, reply recap) that
// floats on the night ground. See wedding/email-templates/NOTES.md for the
// full design rationale and wedding/email-templates/build.py (guest_a) for
// the reference implementation this mirrors.
function buildGuestMessage(data, copy) {
  const isYes = data.attending === "yes";
  const [a, b] = COUPLE_EMAILS;
  const kicker = isYes ? copy.kickerYes : copy.kickerNo;
  const preheader = (isYes ? copy.preheaderYes : copy.preheaderNo)(data.name);
  const greeting = copy.greeting(data.name);
  const intro = isYes ? copy.introYes : copy.introNo;
  const contact = copy.contact(a, b);
  const closing = isYes ? copy.closingYes : copy.closingNo;
  const recap = [
    [copy.labels.name, data.name],
    [copy.labels.attending, copy.attendingValue(isYes)],
    [copy.labels.party, data.party || "—"],
    ...(data.accommodation
      ? [[copy.labels.accommodation, copy.accommodationValue(data.accommodation)]]
      : []),
    [copy.labels.note, data.note || "—"],
  ];

  // ---- plain text ---------------------------------------------------------
  const whereLine = copy.whereSub
    ? `${copy.where[0]}${copy.colon} ${copy.where[1]} (${copy.whereSub})`
    : `${copy.where[0]}${copy.colon} ${copy.where[1]}`;
  const text = [
    greeting,
    "",
    intro,
    "",
    `${copy.when[0]}${copy.colon} ${copy.when[1]}`,
    whereLine,
    "",
    copy.inviteLead,
    INVITE_URL,
    "",
    contact,
    "",
    closing,
    "Tereza & Daniel",
    "",
    "---",
    `${copy.recapTitle}${copy.colon}`,
    ...recap.map(([label, value]) => `${label}${copy.colon} ${value}`),
    "",
    copy.footerNote,
  ].join("\n");

  // ---- html -----------------------------------------------------------------
  const mailtoLink = (addr) =>
    `<a href="mailto:${addr}" style="color:${LINK_PAPER};text-decoration:underline;text-decoration-color:${GOLD};font-weight:700;">${addr}</a>`;
  // The contact sentence is built from constants only (both couple addresses);
  // escape it first, then link the two known addresses within it.
  const contactHtml = escapeHtml(contact)
    .split(a)
    .join(mailtoLink(a))
    .split(b)
    .join(mailtoLink(b));

  const darkCss = `  @media (prefers-color-scheme: dark) {
    .paper-card { border-color: #9a7a3a !important; }
  }`;

  let html = emailHead(copy.subject, preheader, data.lang, darkCss, GROUND);
  html += containerOpen(GROUND, "0 0 28px");

  html += `
<tr><td bgcolor="${PLUM2}" align="center" class="p-sm" style="background-color:${PLUM2};background-image:linear-gradient(180deg,${PLUM} 0%,${PLUM2} 28%,${MAUVE} 58%,${ROSE} 84%,${CORAL} 100%);padding:38px 32px 22px;text-align:center;">
  <img src="${BLOSSOM_URL}" width="54" height="54" alt="" style="display:block;margin:0 auto 14px;width:54px;height:54px;">
  <p style="margin:0 0 12px;font-family:${LABEL_FONT};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:${PAPER};line-height:16px;">${escapeHtml(
    kicker
  )}</p>
  <h1 class="h-sm" style="margin:0;font-family:${SERIF_FONT};font-weight:500;font-style:italic;font-size:48px;line-height:52px;color:${PAPER};">Tereza <span style="font-style:normal;color:${GOLD};">&amp;</span> Daniel</h1>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 0;">
    <tr>
      <td width="28" style="width:28px;border-top:1px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;font-family:${SERIF_FONT};font-style:italic;font-size:20px;line-height:24px;color:${GOLD};">Nečesalovi</td>
      <td width="28" style="width:28px;border-top:1px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
  <p style="margin:14px 0 4px;font-family:${SERIF_FONT};font-size:24px;line-height:28px;letter-spacing:1px;color:${PAPER};">19. 6. 2027</p>
  <p style="margin:0;font-family:${LABEL_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${PAPER};line-height:18px;">Stodola v&nbsp;Meruňkovém sadu &nbsp;·&nbsp; Dolní Kounice</p>
</td></tr>
<tr><td bgcolor="${CORAL}" style="background-color:${CORAL};background-image:linear-gradient(180deg,${CORAL} 0%,${APRICOT} 100%);height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td bgcolor="${GROUND}" style="background-color:${GROUND};font-size:0;line-height:0;"><img src="${HILLS_URL}" width="600" height="110" alt="" style="display:block;width:100%;max-width:600px;height:auto;"></td></tr>
`;

  html += `
<tr><td style="padding:6px 16px 0;" class="p-xs">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="paper-card" style="border:1px solid ${GOLD_DEEP};border-radius:6px;border-collapse:separate;border-spacing:0;">
  <tr><td bgcolor="${PAPER}" class="p-sm" style="background-color:${PAPER};padding:36px 40px 12px;border-radius:6px 6px 0 0;">
    <p style="margin:0 0 14px;font-family:${SERIF_FONT};font-style:italic;font-size:26px;line-height:32px;color:${INK};">${escapeHtml(
    greeting
  )}</p>
    <p style="margin:0 0 22px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${INK};">${escapeHtml(
    intro
  )}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${GOLD};border-bottom:1px solid ${GOLD};">
    <tr>
      <td class="stack" width="42%" valign="top" style="width:42%;padding:16px 16px 16px 0;">
        <p style="margin:0 0 6px;font-family:${LABEL_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${GOLD_DEEP};line-height:14px;">${escapeHtml(
    copy.when[0]
  )}</p>
        <p style="margin:0;font-family:${SERIF_FONT};font-size:21px;line-height:26px;color:${INK};">${escapeHtml(
    copy.when[1]
  )}</p>
      </td>
      <td class="stack stack-gap" width="58%" valign="top" style="width:58%;padding:16px 0;">
        <p style="margin:0 0 6px;font-family:${LABEL_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${GOLD_DEEP};line-height:14px;">${escapeHtml(
    copy.where[0]
  )}</p>
        <p style="margin:0;font-family:${SERIF_FONT};font-size:21px;line-height:26px;color:${INK};">${escapeHtml(
    copy.where[1]
  )}</p>
        ${
          copy.whereSub
            ? `<p style="margin:4px 0 0;font-family:${BODY_FONT};font-size:13px;line-height:19px;color:${INK2};">${escapeHtml(
                copy.whereSub
              )}</p>`
            : ""
        }
      </td>
    </tr>
    </table>

    <p style="margin:24px 0 14px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${INK};">${escapeHtml(
    copy.inviteLead
  )}</p>
    <div style="margin:0 0 10px;">${buttonHtml(
      INVITE_URL,
      escapeHtml(copy.inviteButton)
    )}</div>
    <p style="margin:0 0 22px;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${INK2};"><a href="${INVITE_URL}" style="color:${LINK_PAPER};text-decoration:underline;text-decoration-color:${GOLD};">${INVITE_URL}</a></p>

    <p style="margin:0 0 22px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${INK};">${contactHtml}</p>

    <p style="margin:0 0 4px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${INK};">${escapeHtml(
    closing
  )}</p>
    <p style="margin:0 0 20px;">${SIGNATURE_HTML}</p>
  </td></tr>
  <tr><td bgcolor="${PAPER2}" class="p-sm" style="background-color:${PAPER2};padding:22px 40px 26px;border-top:1px solid ${GOLD};border-radius:0 0 6px 6px;">
    <p style="margin:0 0 12px;font-family:${LABEL_FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${GOLD_DEEP};line-height:14px;">${escapeHtml(
    copy.recapTitle
  )}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
`;

  for (const [label, value] of recap) {
    html += `    <tr>
      <td valign="top" width="38%" style="width:38%;padding:6px 12px 6px 0;font-family:${LABEL_FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${GOLD_DEEP};line-height:20px;">${escapeHtml(
      label
    )}</td>
      <td valign="top" style="padding:6px 0;font-family:${BODY_FONT};font-size:15px;line-height:20px;color:${INK};">${nl2br(
      escapeHtml(value)
    )}</td>
    </tr>
`;
  }

  html += `    </table>
  </td></tr>
  </table>
</td></tr>

<tr><td align="center" style="padding:30px 24px 8px;text-align:center;">
  <p style="margin:0 0 6px;font-family:${SERIF_FONT};font-size:22px;letter-spacing:3px;color:${GOLD};line-height:26px;">T &amp; D</p>
  <p style="margin:0 0 8px;font-family:${LABEL_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;line-height:16px;"><a href="${INVITE_URL}" style="color:${PAPER};text-decoration:none;">raccoon.website/svatba</a></p>
  <p style="margin:0;font-family:${BODY_FONT};font-size:12px;line-height:18px;color:#b9aebf;">${escapeHtml(
    copy.footerNote
  )}</p>
</td></tr>
`;
  html += CONTAINER_CLOSE;

  return { subject: copy.subject, text, html };
}

function guestCopyFor(lang) {
  if (lang === "en") return GUEST_COPY.en;
  if (lang === "fr") return GUEST_COPY.fr;
  return GUEST_COPY.cs;
}

function buildGuestEmail(data) {
  if (!data.email) return null;
  const copy = guestCopyFor(data.lang);
  return {
    to: [data.email],
    replyTo: COUPLE_EMAILS.join(", "),
    message: buildGuestMessage(data, copy),
  };
}

module.exports = {
  TOKEN_SHA256,
  COUPLE_EMAILS,
  NOTIFY_EMAILS,
  ALLOWED_ORIGINS,
  INVITE_URL,
  sha256Hex,
  verifyToken,
  escapeHtml,
  validateRsvp,
  isHoneypot,
  buildCoupleEmail,
  buildGuestEmail,
};
