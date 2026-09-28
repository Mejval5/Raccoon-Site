"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COUPLE_EMAILS,
  NOTIFY_EMAILS,
  INVITE_URL,
  sha256Hex,
  verifyToken,
  escapeHtml,
  validateRsvp,
  isHoneypot,
  buildCoupleEmail,
  buildGuestEmail,
} = require("../lib/rsvp");

function validBody(overrides) {
  return Object.assign(
    {
      token: "irrelevant-for-validateRsvp",
      name: "Jana Nováková",
      email: "jana@example.com",
      attending: "yes",
      party: "Jana + Petr, děti Anna a Jakub",
      accommodation: "yes",
      note: "Bezlepková dieta",
      lang: "cs",
      website: "",
    },
    overrides || {}
  );
}

test("validateRsvp: valid payload has expected shape, trims, and excludes token/website", () => {
  const result = validateRsvp(validBody({ name: "  Jana Nováková  " }));
  assert.equal(result.ok, true);
  assert.deepEqual(
    Object.keys(result.data).sort(),
    ["name", "email", "attending", "party", "accommodation", "note", "lang"].sort()
  );
  assert.equal(result.data.name, "Jana Nováková");
  assert.equal(result.data.token, undefined);
  assert.equal(result.data.website, undefined);
});

test("validateRsvp: missing name is invalid", () => {
  const body = validBody();
  delete body.name;
  const result = validateRsvp(body);
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid");
});

test("validateRsvp: too-short name is invalid", () => {
  const result = validateRsvp(validBody({ name: "J" }));
  assert.equal(result.ok, false);
});

test("validateRsvp: bad email is invalid", () => {
  const result = validateRsvp(validBody({ email: "not-an-email" }));
  assert.equal(result.ok, false);
});

test("validateRsvp: empty email is allowed", () => {
  const result = validateRsvp(validBody({ email: "" }));
  assert.equal(result.ok, true);
  assert.equal(result.data.email, "");
});

test("validateRsvp: missing email defaults to empty string", () => {
  const body = validBody();
  delete body.email;
  const result = validateRsvp(body);
  assert.equal(result.ok, true);
  assert.equal(result.data.email, "");
});

test("validateRsvp: bad attending is invalid", () => {
  const result = validateRsvp(validBody({ attending: "maybe" }));
  assert.equal(result.ok, false);
});

test("validateRsvp: note at max size (1000) is ok, oversize (1001) is invalid", () => {
  const okResult = validateRsvp(validBody({ note: "a".repeat(1000) }));
  assert.equal(okResult.ok, true);

  const tooLong = validateRsvp(validBody({ note: "a".repeat(1001) }));
  assert.equal(tooLong.ok, false);
});

test("validateRsvp: oversize party is invalid", () => {
  const result = validateRsvp(validBody({ party: "a".repeat(301) }));
  assert.equal(result.ok, false);
  const ok = validateRsvp(validBody({ party: "a".repeat(300) }));
  assert.equal(ok.ok, true);
});

test("validateRsvp: bad accommodation is invalid", () => {
  const result = validateRsvp(validBody({ accommodation: "definitely" }));
  assert.equal(result.ok, false);
});

test("validateRsvp: non-object bodies are invalid", () => {
  assert.equal(validateRsvp(null).ok, false);
  assert.equal(validateRsvp([]).ok, false);
  assert.equal(validateRsvp("hello").ok, false);
  assert.equal(validateRsvp(42).ok, false);
  assert.equal(validateRsvp(undefined).ok, false);
});

test("validateRsvp: non-string field types are invalid", () => {
  assert.equal(validateRsvp(validBody({ name: 123 })).ok, false);
  assert.equal(validateRsvp(validBody({ email: 123 })).ok, false);
  assert.equal(validateRsvp(validBody({ attending: true })).ok, false);
  assert.equal(validateRsvp(validBody({ party: 5 })).ok, false);
  assert.equal(validateRsvp(validBody({ accommodation: 1 })).ok, false);
  assert.equal(validateRsvp(validBody({ note: {} })).ok, false);
  assert.equal(validateRsvp(validBody({ lang: 7 })).ok, false);
});

test("validateRsvp: lenient lang defaults to cs for missing/unknown values, accepts en and fr", () => {
  const body1 = validBody();
  delete body1.lang;
  assert.equal(validateRsvp(body1).data.lang, "cs");

  const body2 = validBody({ lang: "de" });
  assert.equal(validateRsvp(body2).data.lang, "cs");

  const body3 = validBody({ lang: "en" });
  assert.equal(validateRsvp(body3).data.lang, "en");

  const body4 = validBody({ lang: "fr" });
  assert.equal(validateRsvp(body4).data.lang, "fr");

  const body5 = validBody({ lang: "  fr  " });
  assert.equal(validateRsvp(body5).data.lang, "fr");
});

test("isHoneypot: detects a filled website field", () => {
  assert.equal(isHoneypot({ website: "" }), false);
  assert.equal(isHoneypot({ website: "   " }), false);
  assert.equal(isHoneypot({ website: "http://spam.example" }), true);
  assert.equal(isHoneypot({ website: 1 }), true);
  assert.equal(isHoneypot({}), false);
});

test("sha256Hex: matches known vector for 'abc'", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("verifyToken: rejects wrong, empty, and non-string tokens", () => {
  assert.equal(verifyToken("wrong"), false);
  assert.equal(verifyToken(""), false);
  assert.equal(verifyToken(null), false);
  assert.equal(verifyToken(undefined), false);
  assert.equal(verifyToken(123), false);
  assert.equal(verifyToken("a".repeat(201)), false);
});

test(
  "verifyToken: accepts the real invite token (from env)",
  { skip: !process.env.SVATBA_TEST_TOKEN },
  () => {
    assert.equal(verifyToken(process.env.SVATBA_TEST_TOKEN), true);
  }
);

test("escapeHtml: escapes the five special characters", () => {
  assert.equal(
    escapeHtml(`<script>alert("x's & y")</script>`),
    "&lt;script&gt;alert(&quot;x&#39;s &amp; y&quot;)&lt;/script&gt;"
  );
  assert.equal(escapeHtml(42), "42");
});

test("buildCoupleEmail: goes to both couple addresses, subject reflects attending", () => {
  const dataYes = validateRsvp(validBody({ attending: "yes" })).data;
  const emailYes = buildCoupleEmail(dataYes, {
    createdAt: new Date("2026-01-01T12:00:00Z"),
    ip: "1.2.3.4",
    userAgent: "test-agent",
  });
  assert.deepEqual(emailYes.to, NOTIFY_EMAILS);
  assert.match(emailYes.message.subject, /přijde\)$/);
  assert.equal(emailYes.replyTo, dataYes.email);

  const dataNo = validateRsvp(validBody({ attending: "no", email: "" })).data;
  const emailNo = buildCoupleEmail(dataNo, {
    createdAt: new Date("2026-01-01T12:00:00Z"),
    ip: "1.2.3.4",
    userAgent: "test-agent",
  });
  assert.match(emailNo.message.subject, /nepřijde\)$/);
  assert.equal(emailNo.replyTo, undefined);
});

test("buildCoupleEmail: escapes a malicious name/note in HTML", () => {
  const data = validateRsvp(
    validBody({
      name: "Jana <b>",
      note: `He said "hi" <script>alert(1)</script>`,
    })
  ).data;
  const email = buildCoupleEmail(data, {
    createdAt: new Date(),
    ip: "",
    userAgent: "",
  });
  assert.equal(email.message.html.includes("<script>"), false);
  assert.match(email.message.html, /&lt;script&gt;/);
  assert.match(email.message.html, /&quot;hi&quot;/);
});

test("buildGuestEmail: null when no email given", () => {
  const data = validateRsvp(validBody({ email: "" })).data;
  assert.equal(buildGuestEmail(data), null);
});

test("buildGuestEmail: CS version contains date, invite link, both couple addresses", () => {
  const data = validateRsvp(validBody({ lang: "cs", email: "jana@example.com" }))
    .data;
  const email = buildGuestEmail(data);
  assert.deepEqual(email.to, ["jana@example.com"]);
  assert.equal(email.replyTo, COUPLE_EMAILS.join(", "));
  assert.match(email.message.text, /19\. 6\. 2027/);
  assert.ok(email.message.text.includes(INVITE_URL));
  for (const addr of COUPLE_EMAILS) {
    assert.ok(email.message.text.includes(addr));
  }
});

test("buildGuestEmail: EN version contains English date format", () => {
  const data = validateRsvp(
    validBody({ lang: "en", email: "jana@example.com" })
  ).data;
  const email = buildGuestEmail(data);
  assert.match(email.message.text, /19 June 2027/);
  assert.equal(email.replyTo, COUPLE_EMAILS.join(", "));
});

test("buildGuestEmail: FR version has subject, French date, venue, and escapes input", () => {
  const data = validateRsvp(
    validBody({
      lang: "fr",
      email: "jana@example.com",
      name: `Eve <img src=x onerror="alert(1)">`,
      party: "<b>bold</b>\nsecond line",
      note: `<script>alert('x')</script>`,
    })
  ).data;
  const email = buildGuestEmail(data);
  assert.equal(email.message.subject, "Merci pour votre réponse – mariage de Tereza et Daniel");
  assert.match(email.message.text, /samedi 19 juin 2027/);
  assert.ok(
    email.message.text.includes(
      "Stodola v Meruňkovém sadu, Dolní Kounice (une grange dans un verger d'abricotiers)"
    )
  );
  assert.ok(email.message.text.includes(INVITE_URL));
  assert.equal(email.replyTo, COUPLE_EMAILS.join(", "));
  for (const addr of COUPLE_EMAILS) {
    assert.ok(email.message.text.includes(addr));
    assert.ok(email.message.html.includes(`mailto:${addr}`));
  }
  assert.equal(email.message.html.includes("<script>"), false);
  assert.equal(email.message.html.includes("<img"), false);
  assert.equal(email.message.html.includes("<b>bold"), false);
  assert.match(email.message.html, /&lt;b&gt;bold&lt;\/b&gt;<br>second line/);

  // Narrow no-break space (U+202F) before French double punctuation.
  assert.ok(email.message.text.includes("réponse !"));
});

test("buildGuestEmail: FR copy uses 'oui, je serai là' / the decline wording", () => {
  const yes = buildGuestEmail(
    validateRsvp(validBody({ lang: "fr", attending: "yes" })).data
  ).message;
  const no = buildGuestEmail(
    validateRsvp(validBody({ lang: "fr", attending: "no" })).data
  ).message;
  assert.match(yes.text, /Présence : oui, je serai là/);
  assert.match(no.text, /Présence : malheureusement, je ne pourrai pas venir/);
});

test("buildGuestEmail: 'no' answers still carry date, venue, link and contacts (CS, EN and FR)", () => {
  const dateRe = { cs: /19\. 6\. 2027/, en: /19 June 2027/, fr: /19 juin 2027/ };
  for (const lang of ["cs", "en", "fr"]) {
    const data = validateRsvp(
      validBody({ lang, attending: "no", email: "jana@example.com" })
    ).data;
    const { message } = buildGuestEmail(data);
    assert.match(message.text, dateRe[lang]);
    // The venue keeps its Czech proper name in every language.
    assert.ok(message.text.includes("Stodola v Meruňkovém sadu, Dolní Kounice"));
    assert.ok(message.text.includes(INVITE_URL));
    assert.ok(message.html.includes(INVITE_URL));
    for (const addr of COUPLE_EMAILS) {
      assert.ok(message.text.includes(addr));
      assert.ok(message.html.includes(`mailto:${addr}`));
    }
  }
});

test("buildGuestEmail: venue rename — no lang uses the old 'Zahrada' name any more", () => {
  for (const lang of ["cs", "en", "fr"]) {
    const data = validateRsvp(
      validBody({ lang, attending: "yes", email: "jana@example.com" })
    ).data;
    const { message } = buildGuestEmail(data);
    assert.equal(message.text.includes("Zahrada v Meruňkovém sadu"), false);
    assert.ok(message.text.includes("Stodola v Meruňkovém sadu, Dolní Kounice"));
  }
});

test("buildGuestEmail: CS copy uses the formal form and matches the form wording", () => {
  const yes = buildGuestEmail(
    validateRsvp(validBody({ lang: "cs", attending: "yes" })).data
  ).message;
  const no = buildGuestEmail(
    validateRsvp(validBody({ lang: "cs", attending: "no" })).data
  ).message;
  assert.match(yes.text, /Účast: přijdu/);
  assert.match(no.text, /Účast: bohužel nepřijdu/);
  assert.match(yes.html, /19\. 6\. 2027/);
  assert.equal(/\(a\)/.test(yes.text + no.text), false);
});

test("buildGuestEmail: escapes user input in HTML (name, party, note)", () => {
  for (const lang of ["cs", "en", "fr"]) {
    const data = validateRsvp(
      validBody({
        lang,
        name: `Eve <img src=x onerror="alert(1)">`,
        party: "<b>bold</b>\nsecond line",
        note: `<script>alert('x')</script>`,
      })
    ).data;
    const { html } = buildGuestEmail(data).message;
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes("<b>bold"), false);
    assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;<br>second line/);
  }
});

test("buildCoupleEmail: omits the Ubytování row when accommodation is '', keeps it for yes/no", () => {
  const withEmpty = validateRsvp(validBody({ accommodation: "" })).data;
  const emailEmpty = buildCoupleEmail(withEmpty, {
    createdAt: new Date(),
    ip: "",
    userAgent: "",
  });
  assert.equal(emailEmpty.message.text.includes("Ubytování"), false);

  for (const acc of ["yes", "no"]) {
    const withAcc = validateRsvp(validBody({ accommodation: acc })).data;
    const emailAcc = buildCoupleEmail(withAcc, {
      createdAt: new Date(),
      ip: "",
      userAgent: "",
    });
    assert.match(emailAcc.message.text, /Ubytování:/);
  }
});

test("buildCoupleEmail: uses 'Dotazy' as the note row label", () => {
  const data = validateRsvp(validBody({ note: "Nějaká otázka" })).data;
  const email = buildCoupleEmail(data, {
    createdAt: new Date(),
    ip: "",
    userAgent: "",
  });
  assert.match(email.message.text, /Dotazy: Nějaká otázka/);
  assert.equal(email.message.text.includes("Poznámka"), false);
});

test("buildGuestEmail: omits the accommodation recap row when accommodation is '', keeps it for yes/no", () => {
  const accLabel = {
    cs: "Ubytování",
    en: "Help with accommodation",
    fr: "Aide pour l'hébergement",
  };
  for (const lang of ["cs", "en", "fr"]) {
    const withEmpty = validateRsvp(
      validBody({ lang, accommodation: "", email: "jana@example.com" })
    ).data;
    const messageEmpty = buildGuestEmail(withEmpty).message;
    assert.equal(messageEmpty.text.includes(accLabel[lang]), false);

    for (const acc of ["yes", "no"]) {
      const withAcc = validateRsvp(
        validBody({ lang, accommodation: acc, email: "jana@example.com" })
      ).data;
      const messageAcc = buildGuestEmail(withAcc).message;
      assert.ok(messageAcc.text.includes(`${accLabel[lang]}${lang === "fr" ? " " : ""}:`));
    }
  }
});

test("buildGuestEmail: note recap label is 'Dotazy'/'Questions' (not 'Poznámka'/'Note'/'Remarque')", () => {
  const labels = { cs: "Dotazy", en: "Questions", fr: "Questions" };
  for (const lang of ["cs", "en", "fr"]) {
    const data = validateRsvp(
      validBody({ lang, note: "Something", email: "jana@example.com" })
    ).data;
    const { text } = buildGuestEmail(data).message;
    assert.match(text, new RegExp(`${labels[lang]}${lang === "fr" ? " " : ""}: Something`));
    assert.equal(text.includes("Poznámka"), false);
    assert.equal(/\bNote:/.test(text), false);
    assert.equal(text.includes("Remarque"), false);
  }
});

// --- ALTCHA captcha helpers (functions/lib/captcha.js) -------------------
//
// The frontend widget (npm "altcha" 3.x) speaks altcha-lib's v2 (default)
// protocol: a challenge is `{ parameters, signature }` and the solved
// payload it submits is base64(`{ challenge: { parameters, signature },
// solution: { counter, derivedKey, time } }`).

const {
  MAX_ALTCHA_PAYLOAD_LENGTH,
  isValidAltchaField,
  isValidChallengeParameters,
  isValidSolution,
  decodeAltchaPayload,
  captchaReplayId,
} = require("../lib/captcha");

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

const VALID_PARAMETERS = {
  algorithm: "PBKDF2/SHA-256",
  nonce: "a".repeat(32),
  salt: "b".repeat(32),
  cost: 5000,
  keyLength: 32,
  keyPrefix: "00",
  expiresAt: Math.floor(Date.now() / 1000) + 900,
};

const VALID_PAYLOAD_OBJ = {
  challenge: {
    parameters: VALID_PARAMETERS,
    signature: "c".repeat(64),
  },
  solution: {
    counter: 1234,
    derivedKey: "d".repeat(64),
    time: 12.5,
  },
};

test("isValidAltchaField: type and size checks", () => {
  assert.equal(isValidAltchaField(b64(VALID_PAYLOAD_OBJ)), true);
  assert.equal(isValidAltchaField(""), false);
  assert.equal(isValidAltchaField(undefined), false);
  assert.equal(isValidAltchaField(null), false);
  assert.equal(isValidAltchaField(123), false);
  assert.equal(isValidAltchaField({}), false);
  assert.equal(isValidAltchaField("a".repeat(MAX_ALTCHA_PAYLOAD_LENGTH)), true);
  assert.equal(isValidAltchaField("a".repeat(MAX_ALTCHA_PAYLOAD_LENGTH + 1)), false);
});

test("isValidChallengeParameters: requires algorithm/nonce/salt/cost/keyLength/keyPrefix", () => {
  assert.equal(isValidChallengeParameters(VALID_PARAMETERS), true);
  assert.equal(isValidChallengeParameters(null), false);
  assert.equal(isValidChallengeParameters([]), false);
  for (const field of ["algorithm", "nonce", "salt", "keyPrefix"]) {
    assert.equal(
      isValidChallengeParameters({ ...VALID_PARAMETERS, [field]: 123 }),
      false
    );
  }
  for (const field of ["cost", "keyLength"]) {
    assert.equal(
      isValidChallengeParameters({ ...VALID_PARAMETERS, [field]: "5000" }),
      false
    );
    assert.equal(
      isValidChallengeParameters({ ...VALID_PARAMETERS, [field]: NaN }),
      false
    );
  }
  // Extra/optional fields (data, keySignature, memoryCost...) are fine.
  assert.equal(
    isValidChallengeParameters({ ...VALID_PARAMETERS, data: { a: 1 }, keySignature: "x" }),
    true
  );
});

test("isValidSolution: requires numeric counter and string derivedKey", () => {
  assert.equal(isValidSolution(VALID_PAYLOAD_OBJ.solution), true);
  assert.equal(isValidSolution(null), false);
  assert.equal(isValidSolution({ counter: "1", derivedKey: "a" }), false);
  assert.equal(isValidSolution({ counter: 1, derivedKey: 2 }), false);
  assert.equal(isValidSolution({ counter: NaN, derivedKey: "a" }), false);
  // `time` is optional.
  assert.equal(isValidSolution({ counter: 1, derivedKey: "a" }), true);
});

test("decodeAltchaPayload: decodes a well-formed v2 payload and rejects malformed ones", () => {
  const decoded = decodeAltchaPayload(b64(VALID_PAYLOAD_OBJ));
  assert.deepEqual(decoded, VALID_PAYLOAD_OBJ);

  // Not valid base64 JSON.
  assert.equal(decodeAltchaPayload("not-base64-json!!"), null);
  // Valid base64, but not JSON.
  assert.equal(
    decodeAltchaPayload(Buffer.from("plain text").toString("base64")),
    null
  );
  // Valid JSON, but not an object / missing challenge or solution.
  assert.equal(decodeAltchaPayload(b64([1, 2, 3])), null);
  assert.equal(decodeAltchaPayload(b64("hello")), null);
  assert.equal(decodeAltchaPayload(b64({ solution: VALID_PAYLOAD_OBJ.solution })), null);
  assert.equal(
    decodeAltchaPayload(b64({ challenge: VALID_PAYLOAD_OBJ.challenge })),
    null
  );
  // Missing/mistyped challenge.signature or parameters.
  assert.equal(
    decodeAltchaPayload(
      b64({
        challenge: { parameters: VALID_PARAMETERS, signature: 123 },
        solution: VALID_PAYLOAD_OBJ.solution,
      })
    ),
    null
  );
  assert.equal(
    decodeAltchaPayload(
      b64({
        challenge: { parameters: { ...VALID_PARAMETERS, cost: "bad" }, signature: "c".repeat(64) },
        solution: VALID_PAYLOAD_OBJ.solution,
      })
    ),
    null
  );
  // Mistyped solution.
  assert.equal(
    decodeAltchaPayload(
      b64({ challenge: VALID_PAYLOAD_OBJ.challenge, solution: { counter: "1", derivedKey: "a" } })
    ),
    null
  );
  // Type/size gate rejects before we even try to decode.
  assert.equal(decodeAltchaPayload(""), null);
  assert.equal(decodeAltchaPayload(undefined), null);
  assert.equal(decodeAltchaPayload("x".repeat(MAX_ALTCHA_PAYLOAD_LENGTH + 1)), null);
});

test("decodeAltchaPayload: preserves every field of challenge.parameters untouched", () => {
  // verifySolution re-signs the *whole* parameters object; dropping or
  // renaming a field here would silently break every real verification.
  const withExtras = {
    challenge: {
      parameters: { ...VALID_PARAMETERS, data: { foo: "bar" }, keySignature: "abc" },
      signature: "c".repeat(64),
    },
    solution: VALID_PAYLOAD_OBJ.solution,
  };
  const decoded = decodeAltchaPayload(b64(withExtras));
  assert.deepEqual(decoded.challenge.parameters, withExtras.challenge.parameters);
});

test("captchaReplayId: sha256 hex of the challenge's HMAC signature", () => {
  const id = captchaReplayId(VALID_PAYLOAD_OBJ);
  assert.equal(id, sha256Hex(VALID_PAYLOAD_OBJ.challenge.signature));
  assert.match(id, /^[0-9a-f]{64}$/);
  // Different signature -> different id (no accidental collisions).
  const otherId = captchaReplayId({
    ...VALID_PAYLOAD_OBJ,
    challenge: { ...VALID_PAYLOAD_OBJ.challenge, signature: "e".repeat(64) },
  });
  assert.notEqual(id, otherId);
});

test("ALTCHA v2 round trip: createChallenge -> solveChallenge -> verifySolution (altcha-lib default export)", async () => {
  let altcha;
  let deriveKey;
  try {
    altcha = require("altcha-lib");
    ({ deriveKey } = require("altcha-lib/algorithms/pbkdf2"));
  } catch (e) {
    return; // altcha-lib not installed in this environment; skip.
  }
  if (typeof altcha.solveChallenge !== "function") {
    return; // no solver available in this version; skip per task instructions.
  }

  const hmacSignatureSecret = "test-hmac-key";
  // Small cost/range so the test itself stays fast; production uses the
  // library's documented defaults (see index.js: cost 5000, counter 5000-10000).
  const makeChallenge = (expiresAt) =>
    altcha.createChallenge({
      algorithm: "PBKDF2/SHA-256",
      cost: 200,
      counter: altcha.randomInt(150, 50),
      deriveKey,
      hmacSignatureSecret,
      expiresAt,
    });

  const challenge = await makeChallenge(new Date(Date.now() + 15 * 60 * 1000));
  const solution = await altcha.solveChallenge({ challenge, deriveKey });
  assert.ok(solution, "expected the challenge to be solvable");

  const payloadField = b64({
    challenge: { parameters: challenge.parameters, signature: challenge.signature },
    solution,
  });

  // Our pure decode helper accepts the widget's base64 JSON payload...
  const decoded = decodeAltchaPayload(payloadField);
  assert.deepEqual(decoded.challenge.parameters, challenge.parameters);
  assert.equal(decoded.challenge.signature, challenge.signature);
  assert.equal(decoded.solution.counter, solution.counter);
  assert.equal(decoded.solution.derivedKey, solution.derivedKey);

  // ...and altcha-lib verifies the solved payload against the same key.
  const verified = await altcha.verifySolution({
    challenge: decoded.challenge,
    solution: decoded.solution,
    deriveKey,
    hmacSignatureSecret,
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.expired, false);

  // A wrong HMAC key must not verify.
  const verifiedWrongKey = await altcha.verifySolution({
    challenge: decoded.challenge,
    solution: decoded.solution,
    deriveKey,
    hmacSignatureSecret: "wrong-key",
  });
  assert.equal(verifiedWrongKey.verified, false);

  // A tampered parameter (signature no longer matches) must not verify.
  const tampered = await altcha.verifySolution({
    challenge: {
      parameters: { ...decoded.challenge.parameters, cost: 1 },
      signature: decoded.challenge.signature,
    },
    solution: decoded.solution,
    deriveKey,
    hmacSignatureSecret,
  });
  assert.equal(tampered.verified, false);
  assert.equal(tampered.invalidSignature, true);

  // Expiry is checked by default.
  const expiredChallenge = await makeChallenge(new Date(Date.now() - 1000));
  const expiredSolution = await altcha.solveChallenge({
    challenge: expiredChallenge,
    deriveKey,
  });
  const verifiedExpired = await altcha.verifySolution({
    challenge: expiredChallenge,
    solution: expiredSolution,
    deriveKey,
    hmacSignatureSecret,
  });
  assert.equal(verifiedExpired.verified, false);
  assert.equal(verifiedExpired.expired, true);
});
