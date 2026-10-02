// Previews of your own projects, kept in this browser so "My projects" in the gallery shows
// them like shared entries. The editor renders one quietly a few seconds after a successful
// compile; the gallery renders any that are missing or out of date. Nothing is uploaded.
import { renderPreviewSprite } from './preview-sprite.js';
import { listFiles } from './files.js';

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('mxsl-previews', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('previews');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('previews', mode);
    const req = fn(t.objectStore('previews'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const getLocalPreview = (projectId) => tx('readonly', (s) => s.get(projectId)).catch(() => null);
export const saveLocalPreview = (projectId, rec) => tx('readwrite', (s) => s.put(rec, projectId));
export const deleteLocalPreview = (projectId) => tx('readwrite', (s) => s.delete(projectId)).catch(() => {});

// What a preview depends on: the program, its images and how it is viewed.
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export function previewSig(p, view = p.view) {
  const v = view ? `${view.geo}|${view.env}|${view.spin}` : 'default';
  return hashStr(`${p.src}\u0000${p.filesSig || ''}\u0000${v}`);
}

// Renders and stores a project's preview, one at a time (they share one render thread).
let chain = Promise.resolve();
export function renderLocalPreview(p, view) {
  const job = chain.then(async () => {
    const sig = previewSig(p, view);
    const { blob, frames } = await renderPreviewSprite(p.src, { reduceGraph: true }, { files: await listFiles(p.id), view, timeoutMs: 60000 });
    const rec = { blob, frames, sig, at: Date.now() };
    await saveLocalPreview(p.id, rec);
    return rec;
  });
  chain = job.catch(() => {});
  return job;
}

// Editor: after a compile succeeds and the code has been still for a few seconds, refresh the
// project's saved preview if it is out of date. Typing again before then cancels the wait.
let timer = 0;
export function scheduleLocalPreview(getProject, getView, delayMs = 4000) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const p = getProject();
    if (!p || document.hidden) return;
    const view = getView();
    const saved = await getLocalPreview(p.id);
    if (saved?.sig === previewSig(p, view)) return;
    try { await renderLocalPreview(p, view); } catch (e) { console.info(`[preview] ${p.name}: ${e.message}`); }
  }, delayMs);
}
