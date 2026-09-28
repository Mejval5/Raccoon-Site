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

function buildCoupleEmail(data, meta) {
  const attendingWord = data.attending === "yes" ? "přijde" : "nepřijde";
  const subject = `Svatba – odpověď: ${data.name} (${attendingWord})`;

  const timeStr = meta.createdAt.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
  });

  const rows = [
    ["Jméno", data.name],
    ["E-mail", data.email || "—"],
    ["Přijde", data.attending === "yes" ? "ano" : "ne"],
    ["Doprovod", data.party || "—"],
    ...(data.accommodation
      ? [["Ubytování", accommodationLabelCs(data.accommodation)]]
      : []),
    ["Dotazy", data.note || "—"],
    ["Jazyk", langLabelCs(data.lang)],
    ["Čas", timeStr],
    ["IP", meta.ip || "—"],
    ["Prohlížeč", meta.userAgent || "—"],
  ];

  const htmlRows = rows
    .map(([label, value]) => {
      const escapedValue = nl2br(escapeHtml(value));
      return (
        `<tr>` +
        `<td style="padding:6px 12px;border:1px solid #ddd;background:#f6efe4;font-weight:bold;white-space:nowrap;">${escapeHtml(
          label
        )}</td>` +
        `<td style="padding:6px 12px;border:1px solid #ddd;">${escapedValue}</td>` +
        `</tr>`
      );
    })
    .join("");

  const html =
    `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2b2b2b;">` +
    htmlRows +
    `</table>`;

  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

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
    where: [
      "Where",
      "Stodola v Meruňkovém sadu, Dolní Kounice (a barn in an apricot orchard, South Moravia, Czech Republic)",
    ],
    inviteLead: "You can find the invitation with all the details here:",
    contact: (a, b) =>
      `If anything changes, just write to us at ${a} or ${b} (or simply reply to this email).`,
    closingYes: "We can't wait to see you!",
    closingNo: "With love,",
    colon: ":",
    recapTitle: "Your reply",
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
    where: [
      "Où",
      "Stodola v Meruňkovém sadu, Dolní Kounice (une grange dans un verger d'abricotiers)",
    ],
    inviteLead: "Vous trouverez l'invitation avec tous les détails ici :",
    contact: (a, b) =>
      `Si quelque chose change, écrivez-nous à ${a} ou ${b} (ou répondez simplement à cet e-mail).`,
    closingYes: "Nous avons hâte de vous voir !",
    closingNo: "Bien à vous,",
    colon: " :",
    recapTitle: "Votre réponse",
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

function buildGuestMessage(data, copy) {
  const isYes = data.attending === "yes";
  const [a, b] = COUPLE_EMAILS;
  const greeting = copy.greeting(data.name);
  const intro = isYes ? copy.introYes : copy.introNo;
  const contact = copy.contact(a, b);
  const closing = isYes ? copy.closingYes : copy.closingNo;
  const details = [copy.when, copy.where];
  const recap = [
    [copy.labels.name, data.name],
    [copy.labels.attending, copy.attendingValue(isYes)],
    [copy.labels.party, data.party || "—"],
    ...(data.accommodation
      ? [[copy.labels.accommodation, copy.accommodationValue(data.accommodation)]]
      : []),
    [copy.labels.note, data.note || "—"],
  ];

  const text = [
    greeting,
    "",
    intro,
    "",
    ...details.map(([label, value]) => `${label}${copy.colon} ${value}`),
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
  ].join("\n");

  const row = (label, valueHtml) =>
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;vertical-align:top;white-space:nowrap;">${escapeHtml(
      label
    )}</td><td style="padding:4px 0;">${valueHtml}</td></tr>`;
  const mailto = (addr) =>
    `<a href="mailto:${addr}" style="color:#a4501c;">${addr}</a>`;
  // The contact sentence is built from constants only; link the addresses.
  const contactHtml = escapeHtml(contact)
    .replace(a, mailto(a))
    .replace(b, mailto(b));

  const html =
    `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.5;background:#f6efe4;padding:24px;color:#3b2a2a;max-width:560px;">` +
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse;margin:8px 0 16px;">` +
    details.map(([label, value]) => row(label, escapeHtml(value))).join("") +
    `</table>` +
    `<p>${escapeHtml(copy.inviteLead)}<br><a href="${INVITE_URL}" style="color:#a4501c;">${INVITE_URL}</a></p>` +
    `<p>${contactHtml}</p>` +
    `<p>${escapeHtml(closing)}<br>Tereza &amp; Daniel</p>` +
    `<hr style="border:none;border-top:1px solid #e2b45f;margin:20px 0 8px;">` +
    `<p style="font-size:13px;color:#6b5a4a;margin:0 0 4px;">${escapeHtml(copy.recapTitle)}</p>` +
    `<table style="border-collapse:collapse;font-size:13px;color:#6b5a4a;">` +
    recap.map(([label, value]) => row(label, nl2br(escapeHtml(value)))).join("") +
    `</table>` +
    `</div>`;

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
