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
  // A preview is one WebP (or PNG, for Safari) sprite strip, frames side by side. Firestore documents top out
  // at 1 MiB, so the image (stored as bytes, no base64) stays well under that.
  thumbBytes: 600 * 1024,
  thumbFramesMax: 64,
  // Images a shader samples with image("name.png"): a few per entry, each in its own document.
  fileBytes: 1000 * 1024,
  filesMax: 4,
};

// Image file names: a plain name with an image extension, no paths. Matched case-insensitively.
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}\.(png|jpe?g|webp)$/i;

const OPTION_KEYS = ["reduceGraph", "errorOnMissingGlobals", "errorOnUnusedGlobals"];
const VIEW_GEOS = ["sphere", "plane", "knot", "screen"];

// How the entry is meant to be looked at: { geo, env, spin }, or null when not given.
function cleanView(v) {
  if (!v || typeof v !== "object" || !VIEW_GEOS.includes(v.geo)) return null;
  return { geo: v.geo, env: v.env !== false, spin: v.spin !== false };
}

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
  const data = { name, src, opts: cleanOptions(body.opts), view: cleanView(body.view) };
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
    thumb: thumbInfo(doc.thumb),
    files: filesInfo(doc.files),
    view: cleanView(doc.view),
  };
}

// [{ name, type, size, v }] of an entry's images; v changes with every upload of that name.
function filesInfo(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((f) => f && typeof f.name === "string" && typeof f.v === "number")
    .map((f) => ({ name: f.name, type: f.type || "", size: f.size || 0, v: f.v }));
}

function imageMime(buf) {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * Checks an uploaded image for an entry: safe name, PNG/JPEG/WebP content (by its bytes, not the
 * header the browser sent), size limit, at most LIMITS.filesMax images per entry, and no existing
 * image of the same name: an image is never overwritten, it has to be removed first.
 * @returns {{ok: true, mime: string} | {ok: false, error: string}}
 */
function validateFile(buf, name, existing = []) {
  if (typeof name !== "string" || !FILE_NAME_RE.test(name)) return { ok: false, error: "file name must be letters, digits, _ . - and end in .png, .jpg or .webp" };
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { ok: false, error: "empty file" };
  if (buf.length > LIMITS.fileBytes) return { ok: false, error: `image is over ${Math.round(LIMITS.fileBytes / 1024)} KB` };
  const mime = imageMime(buf);
  if (!mime) return { ok: false, error: "image must be PNG, JPEG or WebP" };
  const files = filesInfo(existing);
  if (files.some((f) => f.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `there is already an image called ${name}; remove it first` };
  if (files.length >= LIMITS.filesMax) return { ok: false, error: `at most ${LIMITS.filesMax} images per project; remove one first` };
  return { ok: true, mime };
}

// One Firestore document per image; the name is case-insensitive.
function fileDocId(entryId, name) {
  return `${entryId}__${name.toLowerCase()}`;
}

// { v, frames } of the stored preview, or null. v changes with every upload, so the
// image URL /api/gallery/<id>/thumb?v=<v> can be cached forever.
function thumbInfo(t) {
  if (!t || typeof t !== "object" || typeof t.v !== "number") return null;
  const frames = Number.isInteger(t.frames) ? t.frames : 1;
  return { v: t.v, frames };
}

/**
 * Checks an uploaded preview: a WebP (RIFF....WEBP) or PNG file within the size limit, and a
 * sane frame count. @returns {{ok: true, frames: number, mime: string} | {ok: false, error: string}}
 */
function validateThumb(buf, framesParam) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { ok: false, error: "empty image" };
  if (buf.length > LIMITS.thumbBytes) return { ok: false, error: `preview is over ${Math.round(LIMITS.thumbBytes / 1024)} KB` };
  const isWebp = buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  const isPng = buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isWebp && !isPng) return { ok: false, error: "preview must be a WebP or PNG image" };
  const frames = Number(framesParam);
  if (!Number.isInteger(frames) || frames < 1 || frames > LIMITS.thumbFramesMax) {
    return { ok: false, error: `frames must be 1-${LIMITS.thumbFramesMax}` };
  }
  return { ok: true, frames, mime: isWebp ? "image/webp" : "image/png" };
}

function toMillis(v) {
  if (typeof v === "number") return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
}

// The function answers both through the hosting rewrite (/api/gallery/...) and at its own
// URL (/gallery/...). Returns "/" for the collection, "/<id>" for one entry, "/<id>/thumb"
// for its preview image, "/<id>/files/<name>" for one of its images, null otherwise.
function normalizeGalleryPath(p) {
  let s = typeof p === "string" ? p : "/";
  s = s.replace(/^\/api\/gallery(?=\/|$)/, "").replace(/^\/gallery(?=\/|$)/, "");
  if (s === "" || s === "/") return "/";
  const m = /^\/([A-Za-z0-9_-]{1,64})(?:(\/thumb)|\/files\/([A-Za-z0-9][A-Za-z0-9_.-]{0,63}))?\/?$/.exec(s);
  if (!m) return null;
  if (m[3]) return m[3].includes("..") ? null : `/${m[1]}/files/${m[3]}`;
  return `/${m[1]}${m[2] || ""}`;
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
  cleanView,
  validateSubmission,
  docToItem,
  normalizeGalleryPath,
  rateLimitState,
  thumbInfo,
  validateThumb,
  filesInfo,
  validateFile,
  fileDocId,
  imageMime,
};
