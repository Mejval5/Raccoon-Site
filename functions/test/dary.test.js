"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DARY_FROM_DATE,
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
} = require("../lib/dary");

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "fio-transactions.json"),
    "utf8"
  )
);

// --- date helpers ---------------------------------------------------------

test("formatFioDate: converts Fio's ms-since-epoch (Prague local midnight) to rrrr-mm-dd", () => {
  assert.equal(formatFioDate(1788300000000), "2026-09-02");
  assert.equal(formatFioDate(1788386400000), "2026-09-03");
  assert.equal(formatFioDate(1788472800000), "2026-09-04");
  assert.equal(formatFioDate(1788559200000), "2026-09-05");
  assert.equal(formatFioDate(1788645600000), "2026-09-06");
});

test("formatFioDate: null for non-numeric/non-finite input", () => {
  assert.equal(formatFioDate(null), null);
  assert.equal(formatFioDate(undefined), null);
  assert.equal(formatFioDate("2026-09-02"), null);
  assert.equal(formatFioDate(NaN), null);
});

test("todayPragueDate: formats an explicit Date in Europe/Prague", () => {
  // Winter (CET, UTC+1): 2026-01-15T12:00:00Z is still 2026-01-15 in Prague.
  assert.equal(todayPragueDate(new Date("2026-01-15T12:00:00Z")), "2026-01-15");
  // Just after Prague midnight in summer (CEST, UTC+2): 2026-06-01T23:30Z
  // is already 2026-06-02 local time.
  assert.equal(todayPragueDate(new Date("2026-06-01T23:30:00Z")), "2026-06-02");
});

test("fioPeriodsUrl: builds the documented /v1/rest/periods/.../transactions.json URL", () => {
  assert.equal(
    fioPeriodsUrl("tok123", "2026-09-01", "2026-09-10"),
    "https://fioapi.fio.cz/v1/rest/periods/tok123/2026-09-01/2026-09-10/transactions.json"
  );
});

test("isFioTokenConfigured: rejects empty and the 'unset' placeholder", () => {
  assert.equal(isFioTokenConfigured("unset"), false);
  assert.equal(isFioTokenConfigured(""), false);
  assert.equal(isFioTokenConfigured(null), false);
  assert.equal(isFioTokenConfigured(undefined), false);
  assert.equal(isFioTokenConfigured("a".repeat(64)), true);
});

test("DARY_FROM_DATE: matches the contract's fixed sync start date", () => {
  assert.equal(DARY_FROM_DATE, "2026-09-01");
});

// --- Fio JSON parsing (functions/test/fixtures/fio-transactions.json) ----

test("parseFioTransactions: extracts every column from the fixture, including all-null ones", () => {
  const parsed = parseFioTransactions(FIXTURE);
  assert.equal(parsed.length, 5);

  assert.deepEqual(parsed[0], {
    id: 30000000001,
    date: 1788300000000,
    amount: 2000.0,
    currency: "CZK",
    counterAccount: "1234567890",
    counterName: "Jana Nováková",
    message: "Svatebni dar Tereza a Daniel",
    vs: "1996",
  });

  // The interest line (last fixture entry) has every optional column null.
  assert.deepEqual(parsed[4], {
    id: 30000000005,
    date: 1788645600000,
    amount: 3.5,
    currency: "CZK",
    counterAccount: null,
    counterName: null,
    message: null,
    vs: null,
  });
});

test("parseFioTransactions: tolerates a header-only response (no transactionList)", () => {
  assert.deepEqual(parseFioTransactions({ accountStatement: { info: {} } }), []);
  assert.deepEqual(parseFioTransactions({}), []);
  assert.deepEqual(parseFioTransactions(null), []);
});

test("incomingCzkCredits: keeps only positive CZK amounts (excludes debit, non-CZK, interest included)", () => {
  const credits = incomingCzkCredits(parseFioTransactions(FIXTURE));
  const ids = credits.map((c) => c.id);
  // 30000000003 is a CZK debit (fee, negative) -> excluded.
  // 30000000004 is a positive EUR credit -> excluded (wrong currency).
  assert.deepEqual(ids, [30000000001, 30000000002, 30000000005]);
});

test("buildTxDoc: rounds to whole CZK and maps to the svatba-dary-tx doc shape", () => {
  const credits = incomingCzkCredits(parseFioTransactions(FIXTURE));
  const docs = credits.map(buildTxDoc);

  assert.deepEqual(docs[0], {
    amount: 2000,
    date: "2026-09-02",
    counterName: "Jana Nováková",
    counterAccount: "1234567890",
    message: "Svatebni dar Tereza a Daniel",
    vs: "1996",
  });

  // All-null fixture line: amount rounds (3.5 -> 4), everything else "".
  assert.deepEqual(docs[2], {
    amount: 4,
    date: "2026-09-06",
    counterName: "",
    counterAccount: "",
    message: "",
    vs: "",
  });
});

test("end-to-end fixture totals: two gifts (2000 + 1500) plus rounded interest (4) = 3504 CZK", () => {
  const docs = incomingCzkCredits(parseFioTransactions(FIXTURE)).map(buildTxDoc);
  const { total, count } = sumAmounts(docs);
  assert.equal(count, 3);
  assert.equal(total, 3504);
});

// --- totals ----------------------------------------------------------------

test("sumAmounts: sums finite numeric amounts and ignores malformed docs", () => {
  assert.deepEqual(sumAmounts([{ amount: 100 }, { amount: 250 }]), {
    total: 350,
    count: 2,
  });
  assert.deepEqual(sumAmounts([]), { total: 0, count: 0 });
  assert.deepEqual(
    sumAmounts([{ amount: 100 }, { amount: "100" }, {}, { amount: NaN }]),
    { total: 100, count: 1 }
  );
});

test("computeState: combines bank + cash docs into the svatba-dary/state shape", () => {
  const state = computeState(
    [{ amount: 2000 }, { amount: 1500 }],
    [{ amount: 500 }]
  );
  assert.deepEqual(state, {
    bankTotal: 3500,
    bankCount: 2,
    cashTotal: 500,
    cashCount: 1,
    total: 4000,
  });
});

test("computeState: empty collections give an all-zero state", () => {
  assert.deepEqual(computeState([], []), {
    bankTotal: 0,
    bankCount: 0,
    cashTotal: 0,
    cashCount: 0,
    total: 0,
  });
});

// --- admin cash validation ---------------------------------------------

test("validateCash: valid payload trims note and keeps the integer amount", () => {
  const result = validateCash({ amount: 5000, note: "  Od babičky  " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { amount: 5000, note: "Od babičky" });
});

test("validateCash: amount must be an integer between 1 and 10_000_000", () => {
  assert.equal(validateCash({ amount: 0 }).ok, false);
  assert.equal(validateCash({ amount: -5 }).ok, false);
  assert.equal(validateCash({ amount: 1.5 }).ok, false);
  assert.equal(validateCash({ amount: 10000001 }).ok, false);
  assert.equal(validateCash({ amount: 1 }).ok, true);
  assert.equal(validateCash({ amount: 10000000 }).ok, true);
  assert.equal(validateCash({ amount: "100" }).ok, false);
  assert.equal(validateCash({}).ok, false);
});

test("validateCash: note is optional, <=200 chars, no control characters", () => {
  assert.equal(validateCash({ amount: 100 }).ok, true);
  assert.equal(validateCash({ amount: 100 }).data.note, "");
  assert.equal(validateCash({ amount: 100, note: "a".repeat(200) }).ok, true);
  assert.equal(validateCash({ amount: 100, note: "a".repeat(201) }).ok, false);
  assert.equal(validateCash({ amount: 100, note: "bad\u0000note" }).ok, false);
  assert.equal(validateCash({ amount: 100, note: 5 }).ok, false);
});

test("validateCash: non-object bodies are invalid", () => {
  assert.equal(validateCash(null).ok, false);
  assert.equal(validateCash([]).ok, false);
  assert.equal(validateCash("hello").ok, false);
  assert.equal(validateCash(undefined).ok, false);
});

// --- cookie parsing (invite cookie for GET /api/dary) ---------------------

test("parseCookie: extracts one cookie's value from a Cookie header", () => {
  assert.equal(parseCookie("svatba=abc123; other=x", "svatba"), "abc123");
  assert.equal(parseCookie("other=x; svatba=abc123", "svatba"), "abc123");
  assert.equal(parseCookie("svatba=abc123", "svatba"), "abc123");
  assert.equal(parseCookie("other=x", "svatba"), null);
  assert.equal(parseCookie("", "svatba"), null);
  assert.equal(parseCookie(undefined, "svatba"), null);
  assert.equal(parseCookie(null, "svatba"), null);
});

test("parseCookie: decodes percent-encoded values and tolerates whitespace", () => {
  assert.equal(parseCookie("svatba=a%20b", "svatba"), "a b");
  assert.equal(parseCookie("  svatba = raw%2Btoken ; foo=bar", "svatba"), "raw+token");
});

// --- admin key comparison ------------------------------------------------

test("timingSafeEqualString: true only for an exact, non-empty match", () => {
  assert.equal(timingSafeEqualString("secret-key", "secret-key"), true);
  assert.equal(timingSafeEqualString("secret-key", "wrong-key"), false);
  assert.equal(timingSafeEqualString("", ""), false);
  assert.equal(timingSafeEqualString("", "secret-key"), false);
  assert.equal(timingSafeEqualString("secret-key", ""), false);
  assert.equal(timingSafeEqualString(null, "secret-key"), false);
  assert.equal(timingSafeEqualString("secret-key", undefined), false);
  assert.equal(timingSafeEqualString("short", "much-longer-secret"), false);
});

// --- path routing (rewrite vs. direct Cloud Functions URL) ---------------

test("normalizeDaryPath: strips the /api/dary rewrite prefix", () => {
  assert.equal(normalizeDaryPath("/api/dary"), "/");
  assert.equal(normalizeDaryPath("/api/dary/"), "/");
  assert.equal(normalizeDaryPath("/api/dary/admin"), "/admin");
  assert.equal(normalizeDaryPath("/api/dary/admin/cash"), "/admin/cash");
  assert.equal(normalizeDaryPath("/api/dary/admin/cash/abc123"), "/admin/cash/abc123");
});

test("normalizeDaryPath: leaves a direct Cloud Functions URL path untouched", () => {
  assert.equal(normalizeDaryPath("/"), "/");
  assert.equal(normalizeDaryPath("/admin"), "/admin");
  assert.equal(normalizeDaryPath("/admin/"), "/admin");
  assert.equal(normalizeDaryPath("/admin/cash"), "/admin/cash");
  assert.equal(normalizeDaryPath("/admin/cash/abc123"), "/admin/cash/abc123");
});

test("normalizeDaryPath: defaults to root for empty/missing input", () => {
  assert.equal(normalizeDaryPath(""), "/");
  assert.equal(normalizeDaryPath(undefined), "/");
  assert.equal(normalizeDaryPath(null), "/");
});
