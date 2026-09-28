"use strict";

/**
 * Pure helpers for the ALTCHA captcha check on the wedding RSVP endpoint.
 * No firebase or altcha-lib imports here on purpose so this file stays
 * unit-testable without those dependencies (mirrors the rsvp.js pattern).
 *
 * The frontend widget is the official <altcha-widget> (npm package
 * "altcha" 3.x, https://altcha.org), which speaks altcha-lib's v2 (default)
 * protocol: a challenge is `{ parameters, signature }` and the solved
 * payload the widget submits is `{ challenge: { parameters, signature },
 * solution: { counter, derivedKey, time } }`, base64-JSON-encoded as a
 * single string in body.altcha. See altcha-lib's dist/esm/v2/types.d.ts and
 * dist/main/altcha.js (the widget bundle) for the exact shapes.
 */

const { sha256Hex } = require("./rsvp");

const MAX_ALTCHA_PAYLOAD_LENGTH = 4000;

// True only for a plausible ALTCHA payload field: a non-empty string no
// longer than MAX_ALTCHA_PAYLOAD_LENGTH characters.
function isValidAltchaField(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ALTCHA_PAYLOAD_LENGTH
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Shape-checks an ALTCHA v2 challenge's `parameters` object. We deliberately
// do NOT rebuild this object field-by-field and drop unknown keys: altcha-lib's
// verifySolution re-signs the *entire* parameters object it is given (via
// canonicalJSON), so every field the widget echoes back — including ones we
// don't otherwise inspect, like `data` or `keySignature` — must survive
// untouched or the HMAC signature check will fail. This function only
// checks that the fields we rely on on the server are present and typed.
function isValidChallengeParameters(parameters) {
  return (
    isPlainObject(parameters) &&
    typeof parameters.algorithm === "string" &&
    typeof parameters.nonce === "string" &&
    typeof parameters.salt === "string" &&
    typeof parameters.cost === "number" &&
    Number.isFinite(parameters.cost) &&
    typeof parameters.keyLength === "number" &&
    Number.isFinite(parameters.keyLength) &&
    typeof parameters.keyPrefix === "string"
  );
}

function isValidSolution(solution) {
  return (
    isPlainObject(solution) &&
    typeof solution.counter === "number" &&
    Number.isFinite(solution.counter) &&
    typeof solution.derivedKey === "string"
  );
}

// Decodes the base64 JSON ALTCHA v2 payload into the { challenge, solution }
// shape altcha-lib's verifySolution expects. Returns null on any malformed
// input instead of throwing, so callers can treat a decode failure the same
// as a failed verification.
function decodeAltchaPayload(value) {
  if (!isValidAltchaField(value)) return null;

  let json;
  try {
    json = Buffer.from(value, "base64").toString("utf8");
  } catch (e) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    return null;
  }
  if (!isPlainObject(payload)) return null;

  const { challenge, solution } = payload;
  if (
    !isPlainObject(challenge) ||
    typeof challenge.signature !== "string" ||
    !isValidChallengeParameters(challenge.parameters)
  ) {
    return null;
  }
  if (!isValidSolution(solution)) return null;

  return {
    challenge: {
      parameters: challenge.parameters,
      signature: challenge.signature,
    },
    solution: {
      counter: solution.counter,
      derivedKey: solution.derivedKey,
      time: typeof solution.time === "number" ? solution.time : undefined,
    },
  };
}

// Firestore doc id used for the one-time-use replay guard: the sha256 hex
// of the challenge's HMAC signature. Each issued challenge gets a fresh
// random nonce+salt (see index.js), so the signature is unique per
// challenge, and it's exactly the value verifySolution authenticates.
function captchaReplayId(decoded) {
  return sha256Hex(decoded.challenge.signature);
}

module.exports = {
  MAX_ALTCHA_PAYLOAD_LENGTH,
  isValidAltchaField,
  isValidChallengeParameters,
  isValidSolution,
  decodeAltchaPayload,
  captchaReplayId,
};
