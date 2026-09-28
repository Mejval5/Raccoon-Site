"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { createChallenge, verifySolution, randomInt } = require("altcha-lib");
const { deriveKey } = require("altcha-lib/algorithms/pbkdf2");

const {
  ALLOWED_ORIGINS,
  verifyToken,
  isHoneypot,
  validateRsvp,
  buildCoupleEmail,
  buildGuestEmail,
} = require("./lib/rsvp");

const { decodeAltchaPayload, captchaReplayId } = require("./lib/captcha");
const { shouldRetry, rsvpDataFromDoc, toDate, pendingMails } = require("./lib/mail-retry");

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const ALTCHA_HMAC_KEY = defineSecret("ALTCHA_HMAC_KEY");

const SMTP_USER = "necesal.daniel@gmail.com";
const FROM = "Tereza & Daniel <necesal.daniel@gmail.com>";

// ALTCHA proof-of-work challenge tuning (see https://altcha.org). The
// frontend widget is altcha-lib v2's default protocol (algorithm/cost/
// counter below match altcha-lib's own README example, which the widget's
// bundled PBKDF2/SHA-256 worker solves in well under the ~0.5-2s target on
// a mid phone once its work is spread across a few worker threads).
const ALTCHA_ALGORITHM = "PBKDF2/SHA-256";
// Lighter than altcha-lib's README example (5000 / 5000-10000, ~10 s on one core): the page is already
// gated by the invite token, so the captcha only has to make scripted spam expensive, and guests on
// older phones should not wait. About 6x less work: roughly 1-3 s on a phone.
const ALTCHA_COST = 2000;
const ALTCHA_COUNTER_MIN = 2000;
const ALTCHA_COUNTER_MAX = 4000;
const ALTCHA_CHALLENGE_TTL_MS = 15 * 60 * 1000;

// Values GMAIL_APP_PASSWORD may hold before the real Gmail app password has
// been provisioned. "unset" is the literal placeholder the deployer uses.
function isMailPassConfigured(pass) {
  return typeof pass === "string" && pass !== "" && pass !== "unset";
}

class MailNotConfiguredError extends Error {
  constructor() {
    super("smtp-not-configured");
    this.name = "MailNotConfiguredError";
  }
}

let db = null;
let FieldValue = null;

function getDb() {
  if (!db) {
    const { initializeApp, getApps } = require("firebase-admin/app");
    const { getFirestore, FieldValue: FV } = require("firebase-admin/firestore");
    if (getApps().length === 0) {
      initializeApp();
    }
    db = getFirestore();
    FieldValue = FV;
  }
  return db;
}

let transport = null;

function getTransport() {
  if (!isMailPassConfigured(GMAIL_APP_PASSWORD.value())) {
    throw new MailNotConfiguredError();
  }
  if (!transport) {
    const nodemailer = require("nodemailer");
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: GMAIL_APP_PASSWORD.value() },
    });
  }
  return transport;
}

async function sendEmail(email) {
  const t = getTransport();
  await t.sendMail({
    from: FROM,
    to: email.to.join(", "),
    replyTo: email.replyTo,
    subject: email.message.subject,
    text: email.message.text,
    html: email.message.html,
  });
}

exports.rsvp = onRequest(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
    memory: "256MiB",
    secrets: [GMAIL_APP_PASSWORD, ALTCHA_HMAC_KEY],
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }

      if (req.method === "GET" && req.query && req.query.challenge !== undefined) {
        const challenge = await createChallenge({
          algorithm: ALTCHA_ALGORITHM,
          cost: ALTCHA_COST,
          counter: randomInt(ALTCHA_COUNTER_MAX, ALTCHA_COUNTER_MIN),
          deriveKey,
          hmacSignatureSecret: ALTCHA_HMAC_KEY.value(),
          expiresAt: new Date(Date.now() + ALTCHA_CHALLENGE_TTL_MS),
        });
        res.set("Cache-Control", "no-store");
        res.status(200).json(challenge);
        return;
      }

      if (req.method !== "POST") {
        res.set("Allow", "POST, OPTIONS");
        res.status(405).json({ ok: false, error: "method" });
        return;
      }

      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (e) {
          res.status(400).json({ ok: false, error: "invalid" });
          return;
        }
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: "invalid" });
        return;
      }

      if (!verifyToken(body.token)) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }

      if (isHoneypot(body)) {
        res.status(200).json({ ok: true });
        return;
      }

      const altchaPayload = decodeAltchaPayload(body.altcha);
      if (!altchaPayload) {
        res.status(403).json({ ok: false, error: "captcha" });
        return;
      }
      const altchaResult = await verifySolution({
        challenge: altchaPayload.challenge,
        solution: altchaPayload.solution,
        deriveKey,
        hmacSignatureSecret: ALTCHA_HMAC_KEY.value(),
      });
      if (!altchaResult.verified) {
        res.status(403).json({ ok: false, error: "captcha" });
        return;
      }

      const database = getDb();

      const captchaRef = database
        .collection("svatba-captcha")
        .doc(captchaReplayId(altchaPayload));
      try {
        await captchaRef.create({ createdAt: FieldValue.serverTimestamp() });
      } catch (err) {
        if (err && err.code === 6) {
          res.status(403).json({ ok: false, error: "captcha" });
          return;
        }
        throw err;
      }

      const validated = validateRsvp(body);
      if (!validated.ok) {
        res.status(400).json({ ok: false, error: "invalid" });
        return;
      }
      const { data } = validated;

      const forwardedFor = req.get("x-forwarded-for") || "";
      const ip = (forwardedFor.split(",")[0].trim() || req.ip || "").slice(
        0,
        100
      );
      const userAgent = (req.get("user-agent") || "").slice(0, 300);

      const now = new Date();

      const rsvpRef = database.collection("svatba-rsvp").doc();
      await rsvpRef.set({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        ip,
        userAgent,
      });

      let mailErrorRecorded = false;
      async function recordMailError(message) {
        if (mailErrorRecorded) return;
        mailErrorRecorded = true;
        await rsvpRef.update({ mailError: message });
      }

      // Each email that goes out is timestamped on the RSVP; anything that fails keeps a `mailError`
      // and is re-sent by `rsvpMailRetry` below, so a guest's answer never silently goes nowhere.
      const coupleEmail = buildCoupleEmail(data, {
        createdAt: now,
        ip,
        userAgent,
      });
      try {
        await sendEmail(coupleEmail);
        await rsvpRef.update({ coupleMailSentAt: FieldValue.serverTimestamp() });
      } catch (err) {
        console.error("rsvp couple email error", err);
        await recordMailError(
          err instanceof MailNotConfiguredError
            ? "smtp-not-configured"
            : String((err && err.message) || err)
        );
      }

      const guestEmail = buildGuestEmail(data);
      if (guestEmail) {
        try {
          await sendEmail(guestEmail);
          await rsvpRef.update({ guestMailSentAt: FieldValue.serverTimestamp() });
        } catch (err) {
          console.error("rsvp guest email error", err);
          await recordMailError(
            err instanceof MailNotConfiguredError
              ? "smtp-not-configured"
              : String((err && err.message) || err)
          );
        }
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("rsvp handler error", err);
      res.status(500).json({ ok: false, error: "server" });
    }
  }
);

// Every 30 minutes, re-send RSVP emails that failed: the notification to the couple and the guest's
// confirmation, each at most once (tracked by coupleMailSentAt / guestMailSentAt). This also catches
// up every RSVP that arrived before the Gmail app password was set. Test entries are skipped, and an
// RSVP is given up on after MAX_RETRY_ATTEMPTS runs (its mailError stays, so it can be checked by hand).
exports.rsvpMailRetry = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: "Europe/Prague",
    region: "europe-west1",
    memory: "256MiB",
    secrets: [GMAIL_APP_PASSWORD],
  },
  async () => {
    if (!isMailPassConfigured(GMAIL_APP_PASSWORD.value())) {
      console.warn("rsvpMailRetry: GMAIL_APP_PASSWORD not configured, nothing sent");
      return;
    }
    const database = getDb();
    const snapshot = await database
      .collection("svatba-rsvp")
      .where("mailError", ">", "")
      .limit(50)
      .get();

    for (const docSnap of snapshot.docs) {
      const doc = docSnap.data();
      if (!shouldRetry(doc)) continue;

      const data = rsvpDataFromDoc(doc);
      const pending = pendingMails(doc);
      const update = {};
      let error = null;

      if (pending.couple) {
        try {
          await sendEmail(
            buildCoupleEmail(data, {
              createdAt: toDate(doc.createdAt, new Date()),
              ip: doc.ip || "",
              userAgent: doc.userAgent || "",
            })
          );
          update.coupleMailSentAt = FieldValue.serverTimestamp();
        } catch (err) {
          error = String((err && err.message) || err);
        }
      }

      const guestEmail = pending.guest ? buildGuestEmail(data) : null;
      if (guestEmail) {
        try {
          await sendEmail(guestEmail);
          update.guestMailSentAt = FieldValue.serverTimestamp();
        } catch (err) {
          error = error || String((err && err.message) || err);
        }
      }

      update.mailError = error === null ? FieldValue.delete() : error;
      update.mailRetriedAt = FieldValue.serverTimestamp();
      update.mailAttempts = FieldValue.increment(1);
      await docSnap.ref.update(update);
      console.log(`rsvpMailRetry: ${docSnap.id} ${error === null ? "sent" : "failed: " + error}`);
    }
  }
);
