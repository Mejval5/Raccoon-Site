"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LIMITS,
  newOwnerToken,
  ownerHash,
  readOwnerToken,
  ownerCookie,
  isOwner,
  validateSubmission,
  docToItem,
  normalizeGalleryPath,
  rateLimitState,
  thumbInfo,
  validateThumb,
  filesInfo,
  validateFile,
  fileDocId,
} = require("../lib/gallery");
const { compileCheck, countNodes } = require("../lib/slx-compile");

test("owner token round trip through the cookie", () => {
  const token = newOwnerToken();
  const cookie = ownerCookie(token);
  assert.match(cookie, /^__session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/gallery/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(ownerCookie(token, { secure: false }), /Secure/);
  const header = `other=1; ${cookie.split(";")[0]}; x=y`;
  assert.equal(readOwnerToken(header), token);
  assert.equal(readOwnerToken("other=1"), null);
  assert.equal(readOwnerToken(undefined), null);
});

test("isOwner compares hashes, never raw tokens", () => {
  const token = newOwnerToken();
  const doc = { ownerHash: ownerHash(token) };
  assert.equal(isOwner(token, doc), true);
  assert.equal(isOwner(newOwnerToken(), doc), false);
  assert.equal(isOwner(null, doc), false);
  assert.equal(isOwner(token, {}), false);
  assert.equal(ownerHash("short"), null);
});

test("validateSubmission trims, limits and requires fields", () => {
  const ok = validateSubmission({ name: "  My shader ", author: "Dan", src: "float x = 1;", opts: { reduceGraph: false, bogus: 1 } });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data, { name: "My shader", author: "Dan", src: "float x = 1;", opts: { reduceGraph: false } });
  assert.equal(validateSubmission(null).ok, false);
  assert.equal(validateSubmission({ author: "a", src: "x" }).error, "name is required");
  assert.equal(validateSubmission({ name: "n", src: "x" }).error, "author is required");
  assert.equal(validateSubmission({ name: "n", author: "a", src: "   " }).error, "src is required");
  assert.match(validateSubmission({ name: "n", author: "a", src: "x".repeat(LIMITS.src + 1) }).error, /over/);
  assert.equal(validateSubmission({ name: "x".repeat(100), author: "a", src: "x" }).data.name.length, LIMITS.name);
  const upd = validateSubmission({ name: "n", src: "x" }, { update: true });
  assert.equal(upd.ok, true);
  assert.equal("author" in upd.data, false);
  assert.equal(validateSubmission({ name: "a\u0000b", author: "c", src: "x" }).data.name, "ab");
});

test("docToItem hides the owner hash and marks the caller's own entries", () => {
  const token = newOwnerToken();
  const doc = { name: "n", author: "a", src: "s", nodes: 3, created: 1000, updated: { toMillis: () => 2000 }, version: 2, ownerHash: ownerHash(token) };
  const mine = docToItem("id1", doc, token);
  assert.deepEqual(mine, { id: "id1", name: "n", author: "a", src: "s", nodes: 3, created: 1000, updated: 2000, version: 2, mine: true, thumb: null, files: [] });
  assert.deepEqual(docToItem("id1", { ...doc, thumb: { v: 5, frames: 24, extra: 1 } }, null).thumb, { v: 5, frames: 24 });
  assert.equal(docToItem("id1", doc, null).mine, false);
  assert.equal("ownerHash" in mine, false);
});

test("normalizeGalleryPath accepts the rewrite and the direct function URL", () => {
  assert.equal(normalizeGalleryPath("/api/gallery"), "/");
  assert.equal(normalizeGalleryPath("/api/gallery/"), "/");
  assert.equal(normalizeGalleryPath("/gallery"), "/");
  assert.equal(normalizeGalleryPath("/api/gallery/abc_12-x"), "/abc_12-x");
  assert.equal(normalizeGalleryPath("/gallery/abc"), "/abc");
  assert.equal(normalizeGalleryPath("/api/gallery/a/b"), null);
  assert.equal(normalizeGalleryPath("/api/gallery/../x"), null);
  assert.equal(normalizeGalleryPath("/x/y"), null);
  // at the function's own URL the first segment is the entry id
  assert.equal(normalizeGalleryPath("/abc"), "/abc");
  assert.equal(normalizeGalleryPath("/api/gallery/abc/thumb"), "/abc/thumb");
  assert.equal(normalizeGalleryPath("/gallery/abc/thumb/"), "/abc/thumb");
  assert.equal(normalizeGalleryPath("/api/gallery/abc/other"), null);
  assert.equal(normalizeGalleryPath("/api/gallery/abc/files/background.png"), "/abc/files/background.png");
  assert.equal(normalizeGalleryPath("/gallery/abc/files/Albedo_2.JPG/"), "/abc/files/Albedo_2.JPG");
  assert.equal(normalizeGalleryPath("/api/gallery/abc/files/../x.png"), null);
  assert.equal(normalizeGalleryPath("/api/gallery/abc/files/a/b.png"), null);
});

test("rateLimitState allows a window of shares and then refuses", () => {
  const now = 1_000_000;
  let st = null;
  for (let i = 0; i < LIMITS.sharesPerHour; i++) {
    const r = rateLimitState(st, now + i);
    assert.equal(r.allowed, true);
    st = r.next;
  }
  assert.equal(rateLimitState(st, now + 100).allowed, false);
  const later = rateLimitState(st, now + 60 * 60 * 1000 + 1);
  assert.equal(later.allowed, true);
  assert.deepEqual(later.next, { count: 1, windowStart: now + 60 * 60 * 1000 + 1 });
});

test("countNodes ignores structure elements", () => {
  const xml = '<?xml version="1.0"?>\n<materialx version="1.39">\n  <standard_surface name="s" type="surfaceshader">\n    <input name="base_color" type="color3" value="1, 0, 0" />\n  </standard_surface>\n  <surfacematerial name="m" type="material">\n    <input name="surfaceshader" type="surfaceshader" nodename="s" />\n  </surfacematerial>\n</materialx>';
  assert.equal(countNodes(xml), 2);
});

test("compileCheck runs the real mxslc build: good and bad programs", async () => {
  const good = await compileCheck("material m = surfacematerial(standard_surface());", { reduceGraph: true });
  assert.equal(good.ok, true);
  assert.match(good.xml, /<materialx/);
  assert.equal(good.nodes, 2);

  const bad = await compileCheck("float x = ;");
  assert.equal(bad.ok, false);
  assert.equal(bad.line, 1);
  assert.match(bad.error, /line 1/i);

  // the second call reuses the loaded module
  const again = await compileCheck("float y = 1.0;\nmaterial m = surfacematerial(standard_surface(base_color = color3{y}));");
  assert.equal(again.ok, true);
});

test("validateThumb accepts small WebP sprites only", () => {
  const webp = (n) => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(n)]);
  assert.deepEqual(validateThumb(webp(100), "24"), { ok: true, frames: 24, mime: "image/webp" });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
  assert.deepEqual(validateThumb(png, "24"), { ok: true, frames: 24, mime: "image/png" });
  assert.equal(validateThumb(webp(100), "0").ok, false);
  assert.equal(validateThumb(webp(100), "65").ok, false);
  assert.equal(validateThumb(webp(100), "x").ok, false);
  assert.match(validateThumb(Buffer.from("GIF89a................"), "1").error, /WebP or PNG/);
  assert.match(validateThumb(webp(700 * 1024), "1").error, /over/);
  assert.equal(validateThumb(Buffer.alloc(0), "1").ok, false);
  assert.equal(validateThumb("not a buffer", "1").ok, false);
  assert.equal(thumbInfo(null), null);
  assert.deepEqual(thumbInfo({ v: 1 }), { v: 1, frames: 1 });
});

test("validateFile: image types by content, size, count, and no overwriting", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(100)]);
  assert.deepEqual(validateFile(png, "background.png"), { ok: true, mime: "image/png" });
  assert.deepEqual(validateFile(jpg, "albedo.jpg"), { ok: true, mime: "image/jpeg" });
  assert.deepEqual(validateFile(webp, "x.webp"), { ok: true, mime: "image/webp" });
  // the bytes decide the type, not the name
  assert.deepEqual(validateFile(jpg, "named-png.png"), { ok: true, mime: "image/jpeg" });
  assert.match(validateFile(Buffer.from("GIF89a....."), "a.png").error, /PNG, JPEG or WebP/);
  assert.match(validateFile(png, "a.gif").error, /file name/);
  assert.match(validateFile(png, "../a.png").error, /file name/);
  assert.match(validateFile(png, "a b.png").error, /file name/);
  assert.match(validateFile(Buffer.alloc(1001 * 1024, 1), "big.png").error, /over/);
  const existing = [1, 2, 3].map((i) => ({ name: `t${i}.png`, v: i }));
  assert.equal(validateFile(png, "t4.png", existing).ok, true);
  assert.match(validateFile(png, "T1.PNG", existing).error, /already.*remove it first/);
  existing.push({ name: "t4.png", v: 4 });
  assert.match(validateFile(png, "t5.png", existing).error, /at most 4.*remove one first/);
  assert.deepEqual(filesInfo([{ name: "a.png", type: "image/png", size: 3, v: 1, extra: 1 }, { bad: 1 }]), [{ name: "a.png", type: "image/png", size: 3, v: 1 }]);
  assert.equal(fileDocId("abc", "Back.PNG"), "abc__back.png");
});
