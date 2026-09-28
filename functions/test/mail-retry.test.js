"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_RETRY_ATTEMPTS,
  isTestEntry,
  shouldRetry,
  rsvpDataFromDoc,
  toDate,
  pendingMails,
} = require("../lib/mail-retry");
const { buildCoupleEmail, buildGuestEmail, NOTIFY_EMAILS } = require("../lib/rsvp");

const stored = {
  name: "Jana Nováková",
  email: "jana@example.com",
  attending: "yes",
  party: "Petr",
  accommodation: "yes",
  note: "",
  lang: "en",
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0",
  mailError: "smtp-not-configured",
};

test("pendingMails: an RSVP stored before the password was set needs both emails", () => {
  assert.deepEqual(pendingMails(stored), { couple: true, guest: true });
});

test("pendingMails: already-sent emails are never sent twice", () => {
  assert.deepEqual(pendingMails({ ...stored, coupleMailSentAt: new Date() }), { couple: false, guest: true });
  assert.deepEqual(pendingMails({ ...stored, guestMailSentAt: new Date() }), { couple: true, guest: false });
});

test("pendingMails: no guest email when the guest left no address", () => {
  assert.deepEqual(pendingMails({ ...stored, email: "" }), { couple: true, guest: false });
});

test("isTestEntry / shouldRetry: test RSVPs are skipped", () => {
  const testDoc = { ...stored, name: "Testovací host (Claude)" };
  assert.equal(isTestEntry(testDoc), true);
  assert.equal(shouldRetry(testDoc), false);
  assert.equal(shouldRetry(stored), true);
});

test("shouldRetry: gives up after the attempt cap", () => {
  assert.equal(shouldRetry({ ...stored, mailAttempts: MAX_RETRY_ATTEMPTS - 1 }), true);
  assert.equal(shouldRetry({ ...stored, mailAttempts: MAX_RETRY_ATTEMPTS }), false);
});

test("rsvpDataFromDoc: rebuilds exactly the validated RSVP fields, ignoring metadata", () => {
  assert.deepEqual(rsvpDataFromDoc(stored), {
    name: "Jana Nováková",
    email: "jana@example.com",
    attending: "yes",
    party: "Petr",
    accommodation: "yes",
    note: "",
    lang: "en",
  });
});

test("rsvpDataFromDoc: tolerates missing or odd fields", () => {
  assert.deepEqual(rsvpDataFromDoc({ name: "A B", attending: "maybe", lang: "de", accommodation: "x" }), {
    name: "A B",
    email: "",
    attending: "no",
    party: "",
    accommodation: "",
    note: "",
    lang: "cs",
  });
});

test("toDate: Firestore Timestamp, Date, or fallback", () => {
  const d = new Date("2026-09-29T10:00:00Z");
  const now = new Date("2026-09-30T00:00:00Z");
  assert.equal(toDate({ toDate: () => d }, now), d);
  assert.equal(toDate(d, now), d);
  assert.equal(toDate(undefined, now), now);
});

test("the rebuilt data produces the same couple and guest emails as the live handler", () => {
  const data = rsvpDataFromDoc(stored);
  const couple = buildCoupleEmail(data, { createdAt: new Date(), ip: stored.ip, userAgent: stored.userAgent });
  assert.deepEqual(couple.to, NOTIFY_EMAILS);
  assert.match(couple.message.subject, /Jana Nováková/);
  const guest = buildGuestEmail(data);
  assert.deepEqual(guest.to, ["jana@example.com"]);
});
