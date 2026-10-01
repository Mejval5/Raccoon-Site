// The gallery API as seen from the page. Live mode talks to the Cloud Function behind
// /api/gallery with the owner cookie; mock mode is a stand-in with the same contract for
// run_locally.bat, where there is no backend. The page switches to the mock on its own
// when /api/gallery is not there, and shows a badge so nobody mistakes it for live data.
//
//   GET    /api/gallery          -> 200 { items: [{ id, name, author, src, nodes, created, updated, version, mine }] }
//   GET    /api/gallery/:id      -> 200 item
//   POST   /api/gallery          { name, author, src, opts }  -> 201 { item } (+ owner cookie) | 422 { error, line }
//   PUT    /api/gallery/:id      { name, src, opts }          -> 200 { item } | 403 | 404 | 422
//   DELETE /api/gallery/:id                                   -> 204 | 403 | 404
//   PUT    /api/gallery/:id/thumb?frames=N  body: WebP/PNG strip -> 200 { item } | 400 | 403
//   GET    /api/gallery/:id/thumb?v=<thumb.v>                    -> the image (cached forever)
//   PUT    /api/gallery/:id/files/:name   body: PNG/JPEG/WebP    -> 200 { item } | 400 | 403 | 409 (exists / too many)
//   DELETE /api/gallery/:id/files/:name                          -> 200 { item }
//   GET    /api/gallery/:id/files/:name?v=<v>                    -> the image (cached forever)
import { readJson, storeGet, storeSet, uid, lineOf } from './util.js';
import { countNodes } from './graph.js';
import { PRESETS } from './presets.js';

const BASE = '/api/gallery';
const listeners = [];
let mode = 'live';
let compileCheck = null; // set by the page: (src, opts) -> { ok, xml } | { ok: false, error }

export const api = {
  get mode() { return mode; },
  onRequest(cb) { listeners.push(cb); },
  configure(o) { if (o.compileCheck) compileCheck = o.compileCheck; if (o.mode) setMode(o.mode); },
  list() { return req('GET', BASE); },
  get(id) { return req('GET', `${BASE}/${id}`); },
  create(p) { return req('POST', BASE, p); },
  update(id, p) { return req('PUT', `${BASE}/${id}`, p); },
  remove(id) { return req('DELETE', `${BASE}/${id}`); },

  // Uploads a preview sprite strip (frames side by side) for an entry this browser owns.
  async uploadThumb(id, blob, frames) {
    if (mode === 'mock') return req('PUT', `${BASE}/${id}/thumb`, { dataUrl: await blobToDataUrl(blob), frames });
    const t0 = performance.now();
    const res = await fetch(`${BASE}/${id}/thumb?frames=${frames}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
    const data = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
    notify('PUT', `${BASE}/${id}/thumb`, res.status, performance.now() - t0);
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  },
  // Images the shader samples with image("name.png"). Never overwritten: delete, then upload.
  async uploadFile(id, name, blob) {
    if (mode === 'mock') return req('PUT', `${BASE}/${id}/files/${encodeURIComponent(name)}`, { dataUrl: await blobToDataUrl(blob), type: blob.type, size: blob.size });
    const t0 = performance.now();
    const res = await fetch(`${BASE}/${id}/files/${encodeURIComponent(name)}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
    const data = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
    notify('PUT', `${BASE}/${id}/files/${name}`, res.status, performance.now() - t0);
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  },
  deleteFile(id, name) { return req('DELETE', `${BASE}/${id}/files/${encodeURIComponent(name)}`); },
  fileUrl(item, file) {
    if (mode === 'mock') return storeGet(`mxsl-mock-file-${item.id}-${file.name.toLowerCase()}`);
    return `${BASE}/${encodeURIComponent(item.id)}/files/${encodeURIComponent(file.name)}?v=${file.v}`;
  },
  // [{ name, blob, type, size }] of a gallery entry's images, for previews and remixes.
  async fetchFiles(item) {
    const out = [];
    for (const f of item?.files || []) {
      const url = this.fileUrl(item, f);
      if (!url) continue;
      try { const blob = await (await fetch(url)).blob(); out.push({ name: f.name, blob, type: blob.type, size: blob.size }); } catch { /* skip */ }
    }
    return out;
  },

  // Where an entry's stored preview lives, or null when it has none.
  thumbUrl(item) {
    if (!item?.thumb) return null;
    if (mode === 'mock') return storeGet(`mxsl-mock-thumb-${item.id}`);
    return `${BASE}/${encodeURIComponent(item.id)}/thumb?v=${item.thumb.v}`;
  },
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function setMode(m) {
  mode = m;
  document.documentElement.dataset.api = m;
  for (const el of document.querySelectorAll('[data-api-badge]')) el.hidden = m !== 'mock';
}

class ApiError extends Error {
  constructor(status, data) { super(data?.error || `HTTP ${status}`); this.status = status; this.line = data?.line || 0; }
}

async function req(method, path, body) {
  const t0 = performance.now();
  let status, data;
  if (mode === 'live') {
    let res;
    try {
      res = await fetch(path, {
        // always ask the server: share and image sync decide from what is stored right now
        method, credentials: 'include', cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (!navigator.onLine) throw new Error('You are offline.');
      return fallback(method, path, body, t0, `network error: ${e.message}`);
    }
    // a static server answers 404 (GET) or 501/405 (POST) with text/html: no backend here, use the mock
    const isJson = (res.headers.get('content-type') || '').includes('json');
    if (!isJson && [404, 405, 501].includes(res.status)) return fallback(method, path, body, t0, `no /api on this server (${res.status})`);
    status = res.status;
    data = status === 204 ? null : await res.json().catch(() => ({ error: `${status} ${res.statusText}` }));
    // A first share hands back the owner token: Hosting does not pass the server's Set-Cookie
    // through, so the page sets the cookie. Hosting does forward "__session" on later requests.
    if (data && data.ownerToken) {
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `__session=${encodeURIComponent(data.ownerToken)}; Max-Age=31536000; Path=/api/gallery; SameSite=Strict${secure}`;
      delete data.ownerToken;
    }
  } else {
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 280)); // pretend network
    [status, data] = await mock.handle(method, path, body);
  }
  notify(method, path, status, performance.now() - t0);
  if (status >= 400) throw new ApiError(status, data);
  return data;
}
function fallback(method, path, body, t0, why) {
  if (mode === 'mock') throw new Error(why);
  console.warn(`Gallery API unavailable (${why}); using the in-browser mock.`);
  setMode('mock');
  notify('MOCK', '(switched: ' + why + ')', 0, performance.now() - t0);
  return req(method, path, body);
}
function notify(method, path, status, ms) { for (const cb of listeners) cb({ method, path, status, ms }); }

// ---------------------------------------------------------------- mock server
// Lives in localStorage; "owner" is a random token in storage standing in for the cookie.
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const mock = {
  dbKey: 'mxsl-mock-db',
  owner() { let t = storeGet('mxsl-mock-owner'); if (!t) { t = uid() + uid(); storeSet('mxsl-mock-owner', t); } return t; },
  load() { return readJson(this.dbKey, null); },
  save(db) { storeSet(this.dbKey, JSON.stringify(db)); },
  async reset() { storeSet(this.dbKey, 'null'); return this.seed(); },
  async seed() {
    const db = { items: {} };
    const who = ['example-bot', 'demo-seed'];
    let t = Date.now() - PRESETS.length * 86400000;
    for (const [i, [name, code]] of PRESETS.entries()) {
      const id = uid();
      db.items[id] = { id, name: name.replace(/\.mxsl$/, ''), author: who[i % 2], src: code, nodes: null, created: t, updated: t, version: 1, ownerHash: 'seed' };
      t += 86400000;
    }
    this.save(db);
    return db;
  },
  async pub(it) { const { ownerHash, ...rest } = it; return { thumb: null, files: [], ...rest, mine: ownerHash === await sha256(this.owner()) }; },
  async handle(method, path, body) {
    const db = this.load() || await this.seed();
    const fm = /^\/api\/gallery\/([\w-]+)\/files\/(.+)$/.exec(path);
    if (fm) {
      const [, fid, rawName] = fm;
      const name = decodeURIComponent(rawName);
      const it = db.items[fid];
      if (!it) return [404, { error: 'not found' }];
      if (it.ownerHash !== await sha256(this.owner())) return [403, { error: 'this browser does not own that entry' }];
      const files = it.files || [];
      const k = `mxsl-mock-file-${fid}-${name.toLowerCase()}`;
      if (method === 'PUT') {
        if (files.some((f) => f.name.toLowerCase() === name.toLowerCase())) return [409, { error: `there is already an image called ${name}; remove it first` }];
        if (files.length >= 4) return [409, { error: 'at most 4 images per project; remove one first' }];
        storeSet(k, body.dataUrl);
        it.files = [...files, { name, type: body.type, size: body.size, v: Date.now() }];
      } else if (method === 'DELETE') {
        storeSet(k, '');
        it.files = files.filter((f) => f.name.toLowerCase() !== name.toLowerCase());
      } else return [405, { error: 'method not allowed' }];
      this.save(db);
      return [200, { item: await this.pub(it) }];
    }
    const m = /^\/api\/gallery(?:\/([\w-]+))?(\/thumb)?$/.exec(path);
    if (!m) return [404, { error: 'not found' }];
    const id = m[1];
    if (m[2]) {
      const it = db.items[id];
      if (!it) return [404, { error: 'not found' }];
      if (it.ownerHash !== await sha256(this.owner())) return [403, { error: 'this browser does not own that entry' }];
      storeSet(`mxsl-mock-thumb-${id}`, body.dataUrl);
      it.thumb = { v: Date.now(), frames: body.frames };
      this.save(db);
      return [200, { item: await this.pub(it) }];
    }
    if (method === 'GET' && !id) {
      const items = [];
      for (const it of Object.values(db.items).sort((a, b) => b.updated - a.updated)) items.push(await this.pub(it));
      return [200, { items }];
    }
    const it = id && db.items[id];
    if (method === 'GET') return it ? [200, await this.pub(it)] : [404, { error: 'not found' }];
    const clean = (v, max) => String(v ?? '').trim().slice(0, max);
    const check = async (src) => {
      if (!compileCheck) return { ok: true, xml: '' };
      return compileCheck(src, body.opts || {});
    };
    if (method === 'POST' && !id) {
      const name = clean(body.name, 60), author = clean(body.author, 40), src = String(body.src ?? '');
      if (!name || !author || !src.trim()) return [400, { error: 'name, author and src are required' }];
      if (src.length > 50000) return [413, { error: 'source is over 50 000 characters' }];
      const c = await check(src);
      if (!c.ok) return [422, { error: c.error, line: lineOf(c.error) }];
      const newId = uid(), now = Date.now();
      db.items[newId] = { id: newId, name, author, src, nodes: countNodes(c.xml), created: now, updated: now, version: 1, ownerHash: await sha256(this.owner()) };
      this.save(db);
      return [201, { item: await this.pub(db.items[newId]) }];
    }
    if (!it) return [404, { error: 'not found' }];
    if (it.ownerHash !== await sha256(this.owner())) return [403, { error: 'this browser does not own that entry' }];
    if (method === 'PUT') {
      const src = String(body.src ?? '');
      const c = await check(src);
      if (!c.ok) return [422, { error: c.error, line: lineOf(c.error) }];
      if (src !== it.src) { it.thumb = null; storeSet(`mxsl-mock-thumb-${id}`, ''); }
      Object.assign(it, { src, name: clean(body.name, 60) || it.name, nodes: countNodes(c.xml), updated: Date.now(), version: it.version + 1 });
      this.save(db);
      return [200, { item: await this.pub(it) }];
    }
    if (method === 'DELETE') { delete db.items[id]; storeSet(`mxsl-mock-thumb-${id}`, ''); this.save(db); return [204, null]; }
    return [405, { error: 'method not allowed' }];
  },
};
export const mockServer = mock;
