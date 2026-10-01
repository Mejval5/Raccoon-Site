"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { createChallenge, verifySolution, randomInt } = require("altcha-lib");
const { deriveKey } = require("altcha-lib/algorithms/pbkdf2");

const {
  ALLOWED_ORIGINS,
  NOTIFY_EMAILS,
  verifyToken,
  isHoneypot,
  validateRsvp,
  buildCoupleEmail,
  buildGuestEmail,
} = require("./lib/rsvp");

const { decodeAltchaPayload, captchaReplayId } = require("./lib/captcha");
const { shouldRetry, rsvpDataFromDoc, toDate, pendingMails } = require("./lib/mail-retry");
const {
  DARY_FROM_DATE,
  todayPragueDate,
  fioPeriodsUrl,
  isFioTokenConfigured,
  parseFioTransactions,
  incomingCzkCredits,
  buildTxDoc,
  computeState,
  validateCash,
  parseCookie,
  timingSafeEqualString,
  normalizeDaryPath,
} = require("./lib/dary");

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const ALTCHA_HMAC_KEY = defineSecret("ALTCHA_HMAC_KEY");
const FIO_TOKEN = defineSecret("FIO_TOKEN");
const DARY_ADMIN_KEY = defineSecret("DARY_ADMIN_KEY");

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

// ---------------------------------------------------------------------------
// Wedding gift total ("dary"): darySync pulls incoming CZK credits from the
// Fio banka API into Firestore every 10 minutes; the `dary` HTTP function
// serves the shared live total to the invitation page and a small admin API
// (cash envelopes, bank payment list, manual sync) to Daniel's admin page.
// ---------------------------------------------------------------------------

const DARY_STATE_REF = () => getDb().collection("svatba-dary").doc("state");
const FIO_ALERT_SUBJECT = "Svatba – Fio token nefunguje";
const FIO_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Recomputes svatba-dary/state's totals from the current tx + cash
// collections and merges them (plus any extra fields, e.g. tokenOk/
// lastError/lastSyncAt) into the state doc. Returns the totals that were
// written so callers can hand them straight back in an HTTP response.
async function recomputeDaryState(database, extra) {
  const [bankSnap, cashSnap] = await Promise.all([
    database.collection("svatba-dary-tx").get(),
    database.collection("svatba-dary-cash").get(),
  ]);
  const totals = computeState(
    bankSnap.docs.map((d) => d.data()),
    cashSnap.docs.map((d) => d.data())
  );
  await DARY_STATE_REF().set(
    { ...totals, updatedAt: FieldValue.serverTimestamp(), ...(extra || {}) },
    { merge: true }
  );
  return totals;
}

// Emails Daniel that the Fio token looks broken, at most once per 24h
// (tracked by state.lastAlertAt), reusing the same sendEmail()/transport as
// the RSVP flow.
async function maybeAlertFioTokenBroken(message) {
  const stateRef = DARY_STATE_REF();
  const snap = await stateRef.get();
  const lastAlertAt = snap.exists ? snap.data().lastAlertAt : null;
  const lastAlertMs =
    lastAlertAt && typeof lastAlertAt.toMillis === "function"
      ? lastAlertAt.toMillis()
      : 0;
  if (Date.now() - lastAlertMs < FIO_ALERT_COOLDOWN_MS) return;

  try {
    await sendEmail({
      to: NOTIFY_EMAILS.slice(),
      message: {
        subject: FIO_ALERT_SUBJECT,
        text: [
          message,
          "",
          "Fio token je platný nejvýše 180 dní a pravděpodobně vypršel nebo byl odvolán.",
          "Obnovte ho v internetovém bankovnictví (Nastavení -> API) a nastavte nový:",
          "",
          "  firebase functions:secrets:set FIO_TOKEN",
          "",
          "a poté znovu nasaďte funkce (firebase deploy --only functions).",
        ].join("\n"),
      },
    });
  } catch (err) {
    console.error("dary token alert email error", err);
  }
  await stateRef.set({ lastAlertAt: FieldValue.serverTimestamp() }, { merge: true });
}

// Fetches the Fio "periods" JSON for [DARY_FROM_DATE, today], upserts every
// incoming CZK credit into svatba-dary-tx, and recomputes svatba-dary/state.
// Shared between the scheduled darySync trigger and the admin "sync now"
// button, so both paths behave identically (including the 409/401/403/500
// handling below).
async function runDarySync() {
  const database = getDb();
  const token = FIO_TOKEN.value();

  if (!isFioTokenConfigured(token)) {
    await DARY_STATE_REF().set(
      {
        tokenOk: false,
        lastError: "not-configured",
        lastSyncAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const toDate = todayPragueDate();
  const url = fioPeriodsUrl(token, DARY_FROM_DATE, toDate);

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error("darySync fetch error", err);
    await DARY_STATE_REF().set(
      {
        tokenOk: false,
        lastError: String((err && err.message) || err),
        lastSyncAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  if (response.status === 409) {
    // Fio allows only 1 request per 30s per token; just skip this run.
    console.warn("darySync: 409 from Fio (rate limit), skipping this run");
    return;
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 500
  ) {
    await DARY_STATE_REF().set(
      {
        tokenOk: false,
        lastError: `http-${response.status}`,
        lastSyncAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await maybeAlertFioTokenBroken(
      `Fio banka vrátila HTTP ${response.status} při stahování pohybů na svatební účet.`
    );
    return;
  }

  if (!response.ok) {
    await DARY_STATE_REF().set(
      {
        tokenOk: false,
        lastError: `http-${response.status}`,
        lastSyncAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    await DARY_STATE_REF().set(
      {
        tokenOk: false,
        lastError: "invalid-json",
        lastSyncAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const credits = incomingCzkCredits(parseFioTransactions(body));
  if (credits.length > 0) {
    // Only stamp createdAt the first time a movement id is seen (the
    // periods query is idempotent and will keep re-returning old
    // movements), so look up which ids already exist first.
    const existingIds = new Set(
      (await database.collection("svatba-dary-tx").select().get()).docs.map(
        (d) => d.id
      )
    );
    const batch = database.batch();
    for (const credit of credits) {
      if (credit.id === null || credit.id === undefined) continue;
      const id = String(credit.id);
      const ref = database.collection("svatba-dary-tx").doc(id);
      const doc = buildTxDoc(credit);
      if (existingIds.has(id)) {
        batch.set(ref, doc, { merge: true });
      } else {
        batch.set(ref, { ...doc, createdAt: FieldValue.serverTimestamp() });
      }
    }
    await batch.commit();
  }

  await recomputeDaryState(database, {
    tokenOk: true,
    lastError: FieldValue.delete(),
    lastSyncAt: FieldValue.serverTimestamp(),
  });
}

exports.darySync = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "Europe/Prague",
    region: "europe-west1",
    memory: "256MiB",
    secrets: [FIO_TOKEN, GMAIL_APP_PASSWORD],
  },
  async () => {
    await runDarySync();
  }
);

function toIsoOrNull(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function serializeDaryState(data) {
  const d = data || {};
  return {
    bankTotal: typeof d.bankTotal === "number" ? d.bankTotal : 0,
    bankCount: typeof d.bankCount === "number" ? d.bankCount : 0,
    cashTotal: typeof d.cashTotal === "number" ? d.cashTotal : 0,
    cashCount: typeof d.cashCount === "number" ? d.cashCount : 0,
    total: typeof d.total === "number" ? d.total : 0,
    updatedAt: toIsoOrNull(d.updatedAt),
    lastSyncAt: toIsoOrNull(d.lastSyncAt),
    tokenOk: Boolean(d.tokenOk),
    lastError: d.lastError || null,
    lastAlertAt: toIsoOrNull(d.lastAlertAt),
  };
}

function serializeDaryTx(id, data) {
  return {
    id,
    amount: data.amount,
    date: data.date,
    counterName: data.counterName || "",
    counterAccount: data.counterAccount || "",
    message: data.message || "",
    vs: data.vs || "",
    createdAt: toIsoOrNull(data.createdAt),
  };
}

function serializeDaryCash(id, data) {
  return {
    id,
    amount: data.amount,
    note: data.note || "",
    createdAt: toIsoOrNull(data.createdAt),
  };
}

// GET /api/dary                       -> { ok, total, updatedAt } (invite cookie required)
// GET /api/dary/admin                 -> { ok, state, tx, cash }  (X-Admin-Key required)
// POST /api/dary/admin/cash           -> add a cash envelope, recompute, return state
// DELETE /api/dary/admin/cash/{id}    -> delete a cash envelope, recompute, return state
// POST /api/dary/admin/sync           -> run the Fio sync now, return state
//
// Reachable both through the Firebase Hosting rewrites (/api/dary, /api/dary/**)
// and directly at its own Cloud Functions URL (the admin page does this from
// localhost, see DARY-CONTRACT.md) - normalizeDaryPath() makes both work.
exports.dary = onRequest(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
    memory: "256MiB",
    secrets: [DARY_ADMIN_KEY, FIO_TOKEN, GMAIL_APP_PASSWORD],
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }

      const path = normalizeDaryPath(req.path);
      const database = getDb();

      if (path === "/") {
        if (req.method !== "GET") {
          res.set("Allow", "GET, OPTIONS");
          res.status(405).json({ ok: false, error: "method" });
          return;
        }
        // Firebase Hosting strips every cookie except "__session" before a request reaches a function,
        // so the page sends the invite token in X-Svatba-Token. The cookie is still accepted for direct calls.
        const inviteToken = req.get("x-svatba-token") || parseCookie(req.get("cookie"), "svatba");
        if (!verifyToken(inviteToken)) {
          res.status(403).json({ ok: false, error: "forbidden" });
          return;
        }
        const snap = await DARY_STATE_REF().get();
        const data = snap.exists ? snap.data() : {};
        res.set("Cache-Control", "private, max-age=30");
        res.status(200).json({
          ok: true,
          total: typeof data.total === "number" ? data.total : 0,
          updatedAt: toIsoOrNull(data.updatedAt),
        });
        return;
      }

      // Every remaining route is an admin route: require X-Admin-Key.
      const adminKey = req.get("x-admin-key") || "";
      if (!timingSafeEqualString(adminKey, DARY_ADMIN_KEY.value())) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }

      if (path === "/admin" && req.method === "GET") {
        const [stateSnap, txSnap, cashSnap] = await Promise.all([
          DARY_STATE_REF().get(),
          database.collection("svatba-dary-tx").orderBy("createdAt", "desc").get(),
          database.collection("svatba-dary-cash").orderBy("createdAt", "desc").get(),
        ]);
        res.status(200).json({
          ok: true,
          state: serializeDaryState(stateSnap.exists ? stateSnap.data() : {}),
          tx: txSnap.docs.map((d) => serializeDaryTx(d.id, d.data())),
          cash: cashSnap.docs.map((d) => serializeDaryCash(d.id, d.data())),
        });
        return;
      }

      if (path === "/admin/cash" && req.method === "POST") {
        let body = req.body;
        if (typeof body === "string") {
          try {
            body = JSON.parse(body);
          } catch (e) {
            res.status(400).json({ ok: false, error: "invalid" });
            return;
          }
        }
        const validated = validateCash(body);
        if (!validated.ok) {
          res.status(400).json({ ok: false, error: "invalid" });
          return;
        }
        await database.collection("svatba-dary-cash").add({
          amount: validated.data.amount,
          note: validated.data.note,
          createdAt: FieldValue.serverTimestamp(),
        });
        const state = await recomputeDaryState(database);
        res.status(200).json({ ok: true, state: serializeDaryState(state) });
        return;
      }

      if (path.startsWith("/admin/cash/") && req.method === "DELETE") {
        const id = path.slice("/admin/cash/".length);
        if (!id) {
          res.status(400).json({ ok: false, error: "invalid" });
          return;
        }
        await database.collection("svatba-dary-cash").doc(id).delete();
        const state = await recomputeDaryState(database);
        res.status(200).json({ ok: true, state: serializeDaryState(state) });
        return;
      }

      if (path === "/admin/sync" && req.method === "POST") {
        await runDarySync();
        const snap = await DARY_STATE_REF().get();
        res.status(200).json({
          ok: true,
          state: serializeDaryState(snap.exists ? snap.data() : {}),
        });
        return;
      }

      res.status(404).json({ ok: false, error: "not-found" });
    } catch (err) {
      console.error("dary handler error", err);
      res.status(500).json({ ok: false, error: "server" });
    }
  }
);

// ---------------------------------------------------------------------------
// ShadingLanguageX gallery: /api/gallery (see lib/gallery.js for the contract)
//
// GET    /api/gallery          list, newest first         -> { items }
// GET    /api/gallery/:id      one entry                  -> item
// POST   /api/gallery          share  { name, author, src, opts } -> 201 { item } + owner cookie
// PUT    /api/gallery/:id      update { name, src, opts }, owner cookie -> { item }
// DELETE /api/gallery/:id      remove, owner cookie       -> 204
//
// Every POST and PUT is compiled with the real mxslc build first (lib/slx-compile.js); a
// program that does not compile is refused with 422 { error, line } and never stored.
const {
  LIMITS: GALLERY_LIMITS,
  newOwnerToken,
  ownerHash,
  readOwnerToken,
  ownerCookie,
  isOwner,
  validateSubmission,
  docToItem,
  normalizeGalleryPath,
  rateLimitState,
  validateThumb,
} = require("./lib/gallery");
const { compileCheck } = require("./lib/slx-compile");

const GALLERY = "slx-gallery";
const GALLERY_OWNERS = "slx-gallery-owners";
// Preview images live in their own collection so listing the gallery never reads them.
const GALLERY_THUMBS = "slx-gallery-thumbs";

exports.gallery = onRequest(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
    memory: "512MiB",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      const path = normalizeGalleryPath(req.path);
      if (!path) {
        res.status(404).json({ error: "not found" });
        return;
      }
      const database = getDb();
      const col = database.collection(GALLERY);
      const token = readOwnerToken(req.get("cookie"));
      const secure = req.secure || req.get("x-forwarded-proto") === "https";
      const json = (status, body) => { res.set("Cache-Control", "no-store"); res.status(status).json(body); };

      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { json(400, { error: "invalid JSON" }); return; }
      }

      // ---- collection
      if (path === "/") {
        if (req.method === "GET") {
          const snap = await col.orderBy("updated", "desc").limit(GALLERY_LIMITS.listMax).get();
          res.set("Cache-Control", "private, max-age=15");
          res.status(200).json({ items: snap.docs.map((d) => docToItem(d.id, d.data(), token)) });
          return;
        }
        if (req.method !== "POST") {
          res.set("Allow", "GET, POST, OPTIONS");
          json(405, { error: "method not allowed" });
          return;
        }
        const v = validateSubmission(body);
        if (!v.ok) { json(400, { error: v.error }); return; }

        // the first share of this browser mints its owner token
        const ownerToken = token || newOwnerToken();
        const hash = ownerHash(ownerToken);
        const ownerRef = database.collection(GALLERY_OWNERS).doc(hash);
        const now = Date.now();
        const limited = await database.runTransaction(async (tx) => {
          const prev = (await tx.get(ownerRef)).data();
          const r = rateLimitState(prev, now);
          if (!r.allowed) return true;
          tx.set(ownerRef, r.next);
          return false;
        });
        if (limited) { json(429, { error: `at most ${GALLERY_LIMITS.sharesPerHour} shares per hour; try again later` }); return; }

        const c = await compileCheck(v.data.src, v.data.opts);
        if (!c.ok) { json(422, { error: c.error, line: c.line }); return; }

        const doc = {
          name: v.data.name, author: v.data.author, src: v.data.src, opts: v.data.opts,
          nodes: c.nodes, created: now, updated: now, version: 1, ownerHash: hash,
        };
        const ref = await col.add(doc);
        // Firebase Hosting drops Set-Cookie on its way back to the browser (the emulator does,
        // and production is not documented to pass it), so a first share also returns the token
        // in the body and the page sets the __session cookie itself. Direct callers get the header.
        const payload = { item: docToItem(ref.id, doc, ownerToken) };
        if (!token) {
          res.set("Set-Cookie", ownerCookie(ownerToken, { secure }));
          payload.ownerToken = ownerToken;
        }
        json(201, payload);
        return;
      }

      // ---- one entry, or its preview image
      const isThumb = path.endsWith("/thumb");
      const id = path.slice(1).replace(/\/thumb$/, "");
      const ref = col.doc(id);
      const thumbRef = database.collection(GALLERY_THUMBS).doc(id);
      const snap = await ref.get();
      if (!snap.exists) { json(404, { error: "not found" }); return; }
      const doc = snap.data();

      if (isThumb && req.method === "GET") {
        const t = await thumbRef.get();
        if (!t.exists) { json(404, { error: "no preview" }); return; }
        // The page asks for ?v=<upload time>, so a given URL never changes: cache it everywhere.
        res.set("Content-Type", t.data().mime || "image/webp");
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.status(200).send(Buffer.from(t.data().data));
        return;
      }
      if (req.method === "GET") {
        res.set("Cache-Control", "private, max-age=15");
        res.status(200).json(docToItem(id, doc, token));
        return;
      }
      if (!isOwner(token, doc)) { json(403, { error: "this browser does not own that entry" }); return; }

      // PUT /api/gallery/<id>/thumb?frames=24  body: the sprite strip (image/webp or image/png)
      if (isThumb) {
        if (req.method !== "PUT") { res.set("Allow", "GET, PUT, OPTIONS"); json(405, { error: "method not allowed" }); return; }
        const v = validateThumb(req.rawBody, req.query.frames);
        if (!v.ok) { json(400, { error: v.error }); return; }
        const thumb = { v: Date.now(), frames: v.frames };
        await thumbRef.set({ data: req.rawBody, mime: v.mime, bytes: req.rawBody.length, frames: v.frames, updated: thumb.v });
        await ref.update({ thumb });
        json(200, { item: docToItem(id, { ...doc, thumb }, token) });
        return;
      }

      if (req.method === "PUT") {
        const v = validateSubmission(body, { update: true });
        if (!v.ok) { json(400, { error: v.error }); return; }
        const c = await compileCheck(v.data.src, v.data.opts);
        if (!c.ok) { json(422, { error: c.error, line: c.line }); return; }
        // A new program makes the old preview wrong: drop it until the page uploads a new one.
        const srcChanged = v.data.src !== doc.src;
        const patch = { name: v.data.name, src: v.data.src, opts: v.data.opts, nodes: c.nodes, updated: Date.now(), version: (doc.version || 1) + 1 };
        if (srcChanged) patch.thumb = null;
        await ref.update(patch);
        if (srcChanged) await thumbRef.delete();
        json(200, { item: docToItem(id, { ...doc, ...patch }, token) });
        return;
      }
      if (req.method === "DELETE") {
        await ref.delete();
        await thumbRef.delete();
        res.set("Cache-Control", "no-store");
        res.status(204).end();
        return;
      }
      res.set("Allow", "GET, PUT, DELETE, OPTIONS");
      json(405, { error: "method not allowed" });
    } catch (err) {
      console.error("gallery handler error", err);
      res.set("Cache-Control", "no-store");
      res.status(500).json({ error: "server error" });
    }
  }
);
