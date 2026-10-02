// Share / Update gallery / Remove from gallery. A project has to compile before it goes up,
// and the server compiles it again before storing it. After a share or an update this browser
// renders the gallery preview (a turntable sprite) and uploads it with the entry.
import { $, lineOf, storeGet, storeSet } from './util.js';
import { local, cur } from './projects.js';
import { api } from './api.js';
import { toast } from './log.js';
import { syncHeader, renderMine, renderGalleryList, showSideTab } from './projects-ui.js';
import { renderPreviewSprite } from './preview-sprite.js';
import { listFiles, filesSignature } from './files.js';
import { getView } from './preview.js';

// The mode and toggles saved with the entry (the camera only matters for the preview image).
const entryView = () => { const v = getView(); return { geo: v.geo, env: v.env, spin: v.spin }; };

let ctx = null; // { src, engine, currentOptions }

export async function compileCheck(src, opts) {
  try { const r = await ctx.engine.call('compile', { src, opts }); return { ok: true, xml: r.xml }; }
  catch (e) { return { ok: false, error: (e && (e.error || e.message)) || 'Unknown error' }; }
}

export function initShare(c) {
  ctx = c;
  api.configure({ compileCheck });
  $('share').addEventListener('click', onShare);
  $('share-form').addEventListener('submit', onSubmit);
  $('unshare').addEventListener('click', onUnshare);
}

function refresh() { syncHeader(); renderMine(); if (!$('list-gal').hidden) renderGalleryList(); }

// Makes the gallery entry's images match the project's. The server never overwrites an image,
// so a removed or replaced one is deleted there first, then the new one uploaded.
async function syncFiles(p) {
  const id = p.galleryId;
  const item = await api.get(id);
  const mine = await listFiles(p.id);
  const uploaded = { ...(p.galleryFileAdded || {}) };
  for (const r of item.files || []) {
    const k = r.name.toLowerCase();
    const l = mine.find((f) => f.name.toLowerCase() === k);
    if (!l || uploaded[k] !== l.added) { await api.deleteFile(id, r.name); delete uploaded[k]; }
  }
  for (const l of mine) {
    const k = l.name.toLowerCase();
    if (uploaded[k] === l.added && (item.files || []).some((r) => r.name.toLowerCase() === k)) continue;
    await api.uploadFile(id, l.name, l.blob);
    uploaded[k] = l.added;
  }
  p.galleryFileAdded = uploaded;
  p.galleryFilesSig = filesSignature(mine);
  local.save();
}

// Renders and uploads the preview for p's gallery entry. Sharing has already succeeded at this
// point, so a failure here only costs the preview (the gallery then offers to render it live).
async function attachPreview(p) {
  const id = p.galleryId;
  const src = p.src;
  $('proj-state').textContent = 'rendering the gallery preview…';
  try {
    // exactly what the preview shows now: its mode, environment, spin and camera angle
    const { blob, frames } = await renderPreviewSprite(src, ctx.currentOptions(), { files: await listFiles(p.id), view: getView() });
    await api.uploadThumb(id, blob, frames);
    if (p.galleryId === id && p.galleryVersionSrc === src) { p.galleryThumb = true; local.save(); }
    toast(`Gallery preview uploaded (${Math.round(blob.size / 1024)} KB).`);
  } catch (e) {
    toast(`Shared, but the preview could not be made: ${e.message}`, true);
  }
  refresh();
}

async function onShare() {
  const p = cur();
  const btn = $('share');
  btn.disabled = true; btn.textContent = 'Compiling…';
  const c = await compileCheck(p.src, ctx.currentOptions());
  if (!c.ok) {
    syncHeader();
    ctx.src.setBadLine(lineOf(c.error));
    toast('It has to compile before it can be shared. Fix the error in the log first.', true);
    return;
  }
  if (p.galleryId) {
    const srcChanged = p.src !== p.galleryVersionSrc;
    const filesChanged = (p.filesSig || '') !== (p.galleryFilesSig || '');
    btn.textContent = srcChanged || filesChanged ? 'Updating…' : 'Rendering…';
    try {
      if (srcChanged) {
        await api.update(p.galleryId, { name: p.name, src: p.src, opts: ctx.currentOptions(), view: entryView() });
        p.galleryVersionSrc = p.src; p.galleryThumb = false; local.save();
      }
      if (filesChanged) { await syncFiles(p); p.galleryThumb = false; local.save(); }
      if (srcChanged || filesChanged) toast('Gallery entry updated. Rendering its preview…');
      await attachPreview(p);
    } catch (e) {
      if (e.status === 404) { p.galleryId = null; p.galleryVersionSrc = null; local.save(); toast('That entry is gone from the gallery. Share it again to republish.', true); }
      else if (e.status === 403) { p.galleryId = null; p.galleryVersionSrc = null; local.save(); toast('This browser no longer owns that entry (the cookie is gone). Share it again as a new one.', true); }
      else if (e.status === 422) { ctx.src.setBadLine(e.line); toast(`The server could not compile it: ${e.message}`, true); }
      else toast(`Update failed: ${e.message}`, true);
    }
    refresh();
    return;
  }
  syncHeader();
  $('share-name').value = p.name;
  $('share-author').value = storeGet('mxsl-author') || '';
  $('share-err').hidden = true;
  $('dlg-share').showModal();
}

async function onSubmit(e) {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const p = cur();
  const go = $('share-go');
  go.disabled = true; go.textContent = 'Sharing…';
  try {
    const name = $('share-name').value.trim(), author = $('share-author').value.trim();
    const { item } = await api.create({ name, author, src: p.src, opts: ctx.currentOptions(), view: entryView() });
    storeSet('mxsl-author', author);
    Object.assign(p, { name, galleryId: item.id, galleryVersionSrc: p.src, galleryFileAdded: {}, galleryFilesSig: '' });
    local.save();
    $('dlg-share').close();
    try { await syncFiles(p); }
    catch (err) { toast(`Shared, but its images could not be uploaded: ${err.message}`, true); }
    toast(api.mode === 'mock' ? 'Shared to the mock gallery in this browser. Rendering its preview…' : 'Shared. Rendering its gallery preview…');
    refresh();
    await attachPreview(p);
    showSideTab('gal');
    $('projs').open = true;
  } catch (err) {
    const box = $('share-err');
    box.hidden = false;
    box.textContent = err.status === 422 ? `The server could not compile it:\n${err.message}` : err.message;
    if (err.status === 422) ctx.src.setBadLine(err.line);
  } finally { go.disabled = false; go.textContent = 'Share'; }
}

async function onUnshare() {
  const p = cur();
  if (!p.galleryId) return;
  const dlg = $('dlg-unshare');
  dlg.showModal();
  // Listen to the form, not the dialog's close event: Chrome does not always fire close for a
  // method="dialog" submission. Escape fires cancel.
  const answer = await new Promise((resolve) => {
    dlg.querySelector('form').addEventListener('submit', (e) => resolve(e.submitter?.value), { once: true });
    dlg.addEventListener('cancel', () => resolve('cancel'), { once: true });
  });
  if (answer !== 'ok') return;
  try {
    await api.remove(p.galleryId);
    toast('Removed from the gallery. Your local copy is untouched.');
  } catch (e) {
    if (e.status !== 404) { toast(`Could not remove it: ${e.message}`, true); return; }
  }
  Object.assign(p, { galleryId: null, galleryVersionSrc: null, galleryThumb: false, galleryFileAdded: {}, galleryFilesSig: '' });
  local.save();
  refresh();
}
