// Share / Update gallery / Remove from gallery. A project has to compile before it goes up,
// and the server compiles it again before storing it.
import { $, lineOf, storeGet, storeSet } from './util.js';
import { local, cur } from './projects.js';
import { api } from './api.js';
import { toast } from './log.js';
import { syncHeader, renderMine, renderGalleryList, showSideTab } from './projects-ui.js';

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
    btn.textContent = 'Updating…';
    try {
      await api.update(p.galleryId, { name: p.name, src: p.src, opts: ctx.currentOptions() });
      p.galleryVersionSrc = p.src; local.save();
      toast('Gallery entry updated.');
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
    const { item } = await api.create({ name, author, src: p.src, opts: ctx.currentOptions() });
    storeSet('mxsl-author', author);
    Object.assign(p, { name, galleryId: item.id, galleryVersionSrc: p.src });
    local.save();
    $('dlg-share').close();
    toast(api.mode === 'mock' ? 'Shared to the mock gallery in this browser.' : 'Shared. This browser can update it later; the key lives in a cookie.');
    refresh();
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
  p.galleryId = null; p.galleryVersionSrc = null; local.save();
  refresh();
}
