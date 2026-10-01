// Images a project's shader samples with image("name.png"). In this browser they live in
// IndexedDB next to the project (localStorage is far too small); shared projects upload them
// with the entry. Same rules as the server: at most MAX_FILES per project, MAX_BYTES each,
// PNG/JPEG/WebP, and a name is never overwritten: remove the old image first.

export const MAX_FILES = 4;
export const MAX_BYTES = 1000 * 1024;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}\.(png|jpe?g|webp)$/i;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('mxsl-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('files', mode);
    const store = t.objectStore('files');
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}
const key = (projectId, name) => `${projectId}/${name.toLowerCase()}`;

// [{ name, blob, type, size, added }] for one project, sorted by name.
export async function listFiles(projectId) {
  const range = IDBKeyRange.bound(`${projectId}/`, `${projectId}/￿`);
  const rows = await tx('readonly', (s) => s.getAll(range));
  return (rows || []).sort((a, b) => a.name.localeCompare(b.name));
}
export async function putFile(projectId, file) {
  await tx('readwrite', (s) => s.put(file, key(projectId, file.name)));
}
export async function deleteFile(projectId, name) {
  await tx('readwrite', (s) => s.delete(key(projectId, name)));
}
export async function deleteAllFiles(projectId) {
  for (const f of await listFiles(projectId)) await deleteFile(projectId, f.name);
}
export async function copyFiles(fromId, toId) {
  for (const f of await listFiles(fromId)) await putFile(toId, { ...f, added: Date.now() });
}

// Turns a name into one the server accepts: no paths, safe characters, a matching extension.
export function cleanName(name, type) {
  const base = String(name).split(/[\\/]/).pop().replace(/\.[^.]*$/, '');
  const stem = base.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[^A-Za-z0-9]+/, '').slice(0, 55) || 'image';
  return `${stem}.${TYPES[type] || 'png'}`;
}

/**
 * Prepares a dropped or picked file for a project: decodes it, scales it down when it is
 * bigger than needed, and re-encodes when it is not PNG/JPEG/WebP or too large.
 * @returns {Promise<{name, blob, type, size, added}>}
 */
export async function prepareImage(file) {
  let blob = file, type = file.type;
  if (!TYPES[type] || blob.size > MAX_BYTES) {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name} is not an image this browser can read`); }
    for (const maxSide of [2048, 1536, 1024, 768, 512]) {
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      blob = await c.convertToBlob({ type: 'image/webp', quality: 0.85 });
      if (blob.type !== 'image/webp') blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      if (blob.size <= MAX_BYTES) break;
    }
    bmp.close();
    type = blob.type;
    if (blob.size > MAX_BYTES) throw new Error(`${file.name} is still over ${Math.round(MAX_BYTES / 1024)} KB after shrinking`);
  }
  const name = NAME_RE.test(file.name) && TYPES[type] === file.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg') ? file.name : cleanName(file.name, type);
  return { name, blob, type, size: blob.size, added: Date.now() };
}

// The project file a shader's image("…") refers to: the same file name (any folder, any case),
// else the same name without its extension, so "textures\\albedo.tif" finds albedo.png.
export function resolveFile(files, requested) {
  const want = String(requested).split(/[\\/]/).pop().toLowerCase();
  if (!want) return null;
  const stem = (n) => n.toLowerCase().replace(/\.[^.]*$/, '');
  return files.find((f) => f.name.toLowerCase() === want) || files.find((f) => stem(f.name) === stem(want)) || null;
}

// Which image names a program asks for, in order of appearance.
export function referencedImages(src) {
  const names = [];
  for (const m = /image\s*\(\s*"([^"]+)"|file\s*=\s*"([^"]+)"/g; ;) {
    const r = m.exec(src);
    if (!r) break;
    names.push(r[1] || r[2]);
  }
  return [...new Set(names)];
}

// A stable fingerprint of a project's images, to tell whether the gallery copy is current.
export const filesSignature = (files) => files.map((f) => `${f.name.toLowerCase()}:${f.size}:${f.added}`).sort().join('|');
