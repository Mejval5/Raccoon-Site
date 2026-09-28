"use strict";

/**
 * Pure helpers for re-sending RSVP emails that failed (e.g. before the Gmail
 * app password was configured). No firebase imports, so this is unit tested
 * without the Firebase SDKs.
 *
 * Each RSVP document records which emails went out: `coupleMailSentAt` and
 * `guestMailSentAt`. A document still has mail to send while it carries a
 * `mailError`. Older documents (written before these fields existed) have
 * neither timestamp, so both emails count as unsent.
 */

// Test RSVPs created while building the page. They must never email anyone.
const TEST_NAME_MARKER = "(Claude)";

// A broken address would otherwise be retried every run forever.
const MAX_RETRY_ATTEMPTS = 10;

function isTestEntry(doc) {
  return typeof doc.name === "string" && doc.name.includes(TEST_NAME_MARKER);
}

function shouldRetry(doc) {
  const attempts = Number.isInteger(doc.mailAttempts) ? doc.mailAttempts : 0;
  return !isTestEntry(doc) && attempts < MAX_RETRY_ATTEMPTS;
}

// The RSVP fields as validateRsvp() produced them, rebuilt from a stored doc.
function rsvpDataFromDoc(doc) {
  const str = (v) => (typeof v === "string" ? v : "");
  const lang = doc.lang === "en" || doc.lang === "fr" ? doc.lang : "cs";
  return {
    name: str(doc.name),
    email: str(doc.email),
    attending: doc.attending === "yes" ? "yes" : "no",
    party: str(doc.party),
    accommodation: doc.accommodation === "yes" || doc.accommodation === "no" ? doc.accommodation : "",
    note: str(doc.note),
    lang,
  };
}

// Firestore Timestamp, Date, or missing -> Date (falls back to `now`).
function toDate(value, now) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return now;
}

// Which emails a stored RSVP still needs: { couple: bool, guest: bool }.
function pendingMails(doc) {
  const data = rsvpDataFromDoc(doc);
  return {
    couple: !doc.coupleMailSentAt,
    guest: Boolean(data.email) && !doc.guestMailSentAt,
  };
}

module.exports = {
  TEST_NAME_MARKER,
  MAX_RETRY_ATTEMPTS,
  isTestEntry,
  shouldRetry,
  rsvpDataFromDoc,
  toDate,
  pendingMails,
};
