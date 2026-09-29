"use strict";

/**
 * Pure helpers for the wedding gift-total ("dary") feature. No firebase
 * imports here on purpose so this file can be unit tested without the
 * Firebase SDKs (mirrors the rsvp.js / mail-retry.js pattern).
 *
 * Fio bank "periods" JSON column mapping is taken from the official
 * "FIO API BANKOVNICTVÍ" PDF (https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf),
 * verze 1.9 (16. 10. 2025), §5.3.1.6 "JSON", table "Struktura TransactionList":
 *   Column22 = ID pohybu, Column0 = Datum, Column1 = Objem, Column14 = Měna,
 *   Column2 = Protiúčet, Column10 = Název protiúčtu, Column3 = Kód banky,
 *   Column12 = Název banky, Column4 = KS, Column5 = VS, Column6 = SS,
 *   Column7 = Uživatelská identifikace, Column16 = Zpráva pro příjemce,
 *   Column8 = Typ pohybu, Column9 = Provedl, Column18 = Upřesnění,
 *   Column25 = Komentář, Column26 = BIC, Column17 = ID pokynu,
 *   Column27 = Reference plátce.
 * The response shape is `{ accountStatement: { info: {...}, transactionList:
 * { transaction: [ { column22: { value, name, id }, ... } ] } } }`; any
 * column may be `null` when Fio has nothing to report for it. "Datum" is
 * milliseconds since epoch representing local midnight in Europe/Prague
 * (CET/CEST) time, NOT UTC midnight - see formatFioDate below.
 */

const crypto = require("node:crypto");

const FIO_COLUMN = {
  ID_POHYBU: "column22",
  DATUM: "column0",
  OBJEM: "column1",
  MENA: "column14",
  PROTIUCET: "column2",
  NAZEV_PROTIUCTU: "column10",
  ZPRAVA_PRO_PRIJEMCE: "column16",
  VS: "column5",
};

// First day the wedding gift account is watched from (see DARY-CONTRACT.md).
// Using the "periods" endpoint with a fixed `from` date (rather than
// "/last/") keeps every sync idempotent: it always re-fetches the same
// window and we upsert by Fio's own unique movement id.
const DARY_FROM_DATE = "2026-09-01";

function fioColumnValue(transaction, key) {
  const col = transaction && transaction[key];
  if (!col || typeof col !== "object") return null;
  return col.value === undefined ? null : col.value;
}

// rrrr-mm-dd formatter in the Europe/Prague timezone. Fio's "Datum" column
// (and the `to` date for the periods URL) are local Prague dates; naively
// doing `new Date(ms).toISOString().slice(0,10)` would be off by one day
// whenever Prague's local midnight falls after 22:00 UTC (i.e. all of
// CET/CEST), so every date in this module goes through Intl with an
// explicit timeZone instead.
const PRAGUE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Formats a Fio "Datum" column value (ms since epoch) as rrrr-mm-dd in
// Europe/Prague. Returns null for anything that isn't a finite number.
function formatFioDate(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return PRAGUE_DATE_FORMATTER.format(new Date(ms));
}

// Today's date (Europe/Prague) as rrrr-mm-dd, for the Fio "periods" `to`
// date. `now` defaults to the current time; passing it explicitly makes the
// function testable without mocking the clock.
function todayPragueDate(now) {
  return PRAGUE_DATE_FORMATTER.format(now instanceof Date ? now : new Date());
}

// https://fioapi.fio.cz/v1/rest/periods/{token}/{from}/{to}/transactions.json
function fioPeriodsUrl(token, fromDate, toDate) {
  return `https://fioapi.fio.cz/v1/rest/periods/${encodeURIComponent(
    token
  )}/${fromDate}/${toDate}/transactions.json`;
}

// True only for a plausible configured Fio token: the deployer sets the
// secret to the literal string "unset" until the real 64-char token exists.
function isFioTokenConfigured(token) {
  return typeof token === "string" && token !== "" && token !== "unset";
}

// Parses a Fio "periods" JSON response body into a flat array of raw
// transactions (every column value pulled out; still includes debits,
// non-CZK lines, fees, interest, etc. - filtering happens in
// incomingCzkCredits). Returns [] for a header-only response (no
// movements in the requested window).
function parseFioTransactions(body) {
  const list =
    body &&
    body.accountStatement &&
    body.accountStatement.transactionList &&
    body.accountStatement.transactionList.transaction;
  if (!Array.isArray(list)) return [];
  return list.map((t) => ({
    id: fioColumnValue(t, FIO_COLUMN.ID_POHYBU),
    date: fioColumnValue(t, FIO_COLUMN.DATUM),
    amount: fioColumnValue(t, FIO_COLUMN.OBJEM),
    currency: fioColumnValue(t, FIO_COLUMN.MENA),
    counterAccount: fioColumnValue(t, FIO_COLUMN.PROTIUCET),
    counterName: fioColumnValue(t, FIO_COLUMN.NAZEV_PROTIUCTU),
    message: fioColumnValue(t, FIO_COLUMN.ZPRAVA_PRO_PRIJEMCE),
    vs: fioColumnValue(t, FIO_COLUMN.VS),
  }));
}

// Incoming CZK credits only: amount > 0 and currency === "CZK". Everything
// else (debits/fees, other currencies, outgoing payments) never becomes
// part of the wedding gift total.
function incomingCzkCredits(transactions) {
  return transactions.filter(
    (t) =>
      t.currency === "CZK" && typeof t.amount === "number" && t.amount > 0
  );
}

// The Firestore doc shape stored at svatba-dary-tx/{fioMovementId} (minus
// createdAt, which the caller stamps with FieldValue.serverTimestamp() only
// the first time a movement id is seen). Amounts are rounded to whole CZK
// per the shared contract ("amounts are integer CZK").
function buildTxDoc(t) {
  return {
    amount: Math.round(t.amount),
    date: formatFioDate(t.date),
    counterName: t.counterName || "",
    counterAccount: t.counterAccount || "",
    message: t.message || "",
    vs: t.vs === null || t.vs === undefined ? "" : String(t.vs),
  };
}

// Sums a list of stored amounts (bank tx docs or cash docs) into
// { total, count }, ignoring anything without a finite numeric amount.
function sumAmounts(docs) {
  let total = 0;
  let count = 0;
  for (const doc of docs || []) {
    const amount = doc && doc.amount;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      total += Math.round(amount);
      count += 1;
    }
  }
  return { total, count };
}

// Combines bank + cash sums into the svatba-dary/state totals fields.
function computeState(bankDocs, cashDocs) {
  const bank = sumAmounts(bankDocs);
  const cash = sumAmounts(cashDocs);
  return {
    bankTotal: bank.total,
    bankCount: bank.count,
    cashTotal: cash.total,
    cashCount: cash.count,
    total: bank.total + cash.total,
  };
}

function fail(error) {
  return { ok: false, error };
}

// Disallows all C0 control chars + DEL (same policy as rsvp.js's
// CONTROL_STRICT_RE for single-line fields).
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

// POST /api/dary/admin/cash body validation: amount integer 1..10_000_000,
// note optional and <=200 chars.
function validateCash(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return fail("invalid");
  }
  if (typeof body.amount !== "number" || !Number.isInteger(body.amount)) {
    return fail("invalid");
  }
  if (body.amount < 1 || body.amount > 10000000) return fail("invalid");

  let note = "";
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return fail("invalid");
    note = body.note.trim();
    if (note.length > 200) return fail("invalid");
    if (CONTROL_RE.test(note)) return fail("invalid");
  }

  return { ok: true, data: { amount: body.amount, note } };
}

// Parses the raw `Cookie` request header for one cookie's value (or null
// if absent/malformed). Mirrors what a browser sends: "a=1; b=2".
function parseCookie(header, name) {
  if (typeof header !== "string" || header.length === 0) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch (e) {
        return value;
      }
    }
  }
  return null;
}

// Constant-time string comparison for the admin API's X-Admin-Key header
// (mirrors verifyToken's use of crypto.timingSafeEqual in rsvp.js).
function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || b.length === 0) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (e) {
    return false;
  }
}

// Strips an optional "/api/dary" prefix (present when the request arrives
// through the Firebase Hosting rewrite) so the same routing logic works
// whether the function is reached via the rewrite (path "/api/dary/admin")
// or its own Cloud Functions URL directly, as the admin page does from
// localhost (path "/admin"). A trailing slash is also collapsed so
// "/admin/" behaves like "/admin".
function normalizeDaryPath(path) {
  let p = typeof path === "string" && path.length > 0 ? path : "/";
  if (p === "/api/dary") {
    p = "/";
  } else if (p.startsWith("/api/dary/")) {
    p = p.slice("/api/dary".length);
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

module.exports = {
  DARY_FROM_DATE,
  FIO_COLUMN,
  formatFioDate,
  todayPragueDate,
  fioPeriodsUrl,
  isFioTokenConfigured,
  parseFioTransactions,
  incomingCzkCredits,
  buildTxDoc,
  sumAmounts,
  computeState,
  validateCash,
  parseCookie,
  timingSafeEqualString,
  normalizeDaryPath,
};
