"use strict";

/**
 * Pure helpers for the ShadingLanguageX gallery (/api/gallery). No firebase imports here so
 * the file can be unit tested without the Firebase SDKs (same pattern as rsvp.js / dary.js).
 *
 * Ownership: there are no accounts. The first successful share sets a random owner token
 * in a cookie; every entry stores the SHA-256 of the token that created it, and only
 * requests carrying that token may update or delete the entry. Firebase Hosting forwards
 * only a cookie named "__session" to functions, hence the name.
 */

const crypto = require("node:crypto");
const { parseCookie, timingSafeEqualString } = require("./dary");

const COOKIE_NAME = "__session";
const COOKIE_PATH = "/api/gallery";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const LIMITS = {
  name: 60,
  author: 40,
  src: 50000,
  listMax: 200,
  sharesPerHour: 20,
};

const OPTION_KEYS = ["reduceGraph", "errorOnMissingGlobals", "errorOnUnusedGlobals"];

function newOwnerToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function ownerHash(token) {
  if (typeof token !== "string" || token.length < 16) return null;
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function readOwnerToken(cookieHeader) {
  const v = parseCookie(cookieHeader, COOKIE_NAME);
  return typeof v === "string" && v.length >= 16 ? v : null;
}

function ownerCookie(token, { secure = true } = {}) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function isOwner(token, doc) {
  const h = ownerHash(token);
  return !!h && typeof doc.ownerHash === "string" && timingSafeEqualString(h, doc.ownerHash);
}

function cleanText(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function cleanOptions(opts) {
  const out = {};
  if (opts && typeof opts === "object") {
    for (const k of OPTION_KEYS) if (typeof opts[k] === "boolean") out[k] = opts[k];
  }
  return out;
}

/**
 * Validates the body of POST (create) or PUT (update: author is not changeable).
 * @returns {{ok: true, data: {name, author?, src, opts}} | {ok: false, error: string}}
 */
function validateSubmission(body, { update = false } = {}) {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const name = cleanText(body.name, LIMITS.name);
  const src = typeof body.src === "string" ? body.src : "";
  if (!name) return { ok: false, error: "name is required" };
  if (!src.trim()) return { ok: false, error: "src is required" };
  if (src.length > LIMITS.src) return { ok: false, error: `source is over ${LIMITS.src.toLocaleString("en")} characters` };
  const data = { name, src, opts: cleanOptions(body.opts) };
  if (!update) {
    const author = cleanText(body.author, LIMITS.author);
    if (!author) return { ok: false, error: "author is required" };
    data.author = author;
  }
  return { ok: true, data };
}

// What the API returns for an entry: everything but the owner hash, plus whether the caller owns it.
function docToItem(id, doc, callerToken) {
  return {
    id,
    name: doc.name,
    author: doc.author,
    src: doc.src,
    nodes: typeof doc.nodes === "number" ? doc.nodes : null,
    created: toMillis(doc.created),
    updated: toMillis(doc.updated),
    version: typeof doc.version === "number" ? doc.version : 1,
    mine: isOwner(callerToken, doc),
  };
}

function toMillis(v) {
  if (typeof v === "number") return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
}

// The function answers both through the hosting rewrite (/api/gallery/...) and at its own
// URL (/gallery/...). Returns "/" for the collection or "/<id>" for one entry, null otherwise.
function normalizeGalleryPath(p) {
  let s = typeof p === "string" ? p : "/";
  s = s.replace(/^\/api\/gallery(?=\/|$)/, "").replace(/^\/gallery(?=\/|$)/, "");
  if (s === "" || s === "/") return "/";
  const m = /^\/([A-Za-z0-9_-]{1,64})\/?$/.exec(s);
  return m ? `/${m[1]}` : null;
}

// Sliding-window share limit kept on one doc per owner: { count, windowStart }.
function rateLimitState(prev, now, limit = LIMITS.sharesPerHour, windowMs = 60 * 60 * 1000) {
  const fresh = !prev || typeof prev.windowStart !== "number" || now - prev.windowStart >= windowMs;
  const count = fresh ? 0 : prev.count || 0;
  if (count >= limit) return { allowed: false, next: prev };
  return { allowed: true, next: { count: count + 1, windowStart: fresh ? now : prev.windowStart } };
}

module.exports = {
  COOKIE_NAME,
  COOKIE_PATH,
  LIMITS,
  OPTION_KEYS,
  newOwnerToken,
  ownerHash,
  readOwnerToken,
  ownerCookie,
  isOwner,
  cleanText,
  cleanOptions,
  validateSubmission,
  docToItem,
  normalizeGalleryPath,
  rateLimitState,
};
