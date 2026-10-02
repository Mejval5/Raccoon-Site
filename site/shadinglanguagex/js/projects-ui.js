// The project parts of the editor header: the Project dropdown (your projects and the
// gallery), the name field and state, + New, examples that start a new project, and the
// read-only view of somebody else's gallery entry with its Remix button.
import { $, ago } from './util.js';
import { esc as escHtml } from './highlight.js';
import { PRESETS } from './presets.js';
import { local, cur, setCurrent, projState, freshName, isPublished } from './projects.js';
import { api } from './api.js';
import { toast } from './log.js';
import { initImagesUI, loadImagesFor, currentFiles } from './images-ui.js';
import { putFile, deleteAllFiles } from './files.js';
import { applyView, lastView, onViewChange } from './preview.js';

const NEW_PROJECT_SRC = '// New project. Declare a material to see it on the preview.\n\nsurfaceshader surface = standard_surface();\nsurface.base_color = color3{0.8, 0.3, 0.2};\n\nmaterial mat = surfacematerial(surface);\n';

let ctx = null;      // { src, doCompile } from app.js
let viewing = null;  // a gallery entry open read-only, or null
export const getViewing = () => viewing;

export function initProjectsUI(c) {
  ctx = c;
  bindHeader();
  bindDropdown();
  initImagesUI({ src: c.src, onChange: () => { syncHeader(); renderMine(); } });
  // each project remembers how it was last looked at
  onViewChange((v) => {
    if (viewing || !cur()) return;
    const p = cur();
    const next = { geo: v.geo, env: v.env, spin: v.spin };
    if (JSON.stringify(p.view) !== JSON.stringify(next)) { p.view = next; local.save(); }
  });
  // deep links: ?g=<gallery id> opens a shared entry, ?p=<project id> one of yours
  const q = new URLSearchParams(location.search);
  if (q.get('g')) openGallery(q.get('g'));
  else { if (q.get('p')) setCurrent(q.get('p')); openLocal(cur().id, false); }
}

// ---------------------------------------------------------------- header
export function syncHeader() {
  const nameEl = $('proj-name'), share = $('share'), del = $('unshare');
  $('projs-cur').textContent = viewing ? `${viewing.name} (gallery)` : cur().name;
  if (viewing) {
    nameEl.value = viewing.name; nameEl.readOnly = true;
    $('proj-state').textContent = `v${viewing.version} by ${viewing.author}`;
    share.hidden = true; del.hidden = true; $('delete-proj').hidden = true;
    return;
  }
  const p = cur();
  nameEl.value = p.name; nameEl.readOnly = false;
  $('proj-state').textContent = projState(p);
  share.hidden = false;
  const upToDate = isPublished(p);
  share.textContent = !p.galleryId ? 'Share' : upToDate && !p.galleryThumb ? 'Add preview' : 'Update gallery';
  share.title = upToDate && !p.galleryThumb ? "Render this project's gallery preview and upload it" : 'Compile, then publish this project to the gallery';
  share.disabled = upToDate && !!p.galleryThumb;
  del.hidden = !p.galleryId;
  $('delete-proj').hidden = false;
}
function setViewing(item) {
  viewing = item;
  ctx.src.ta.readOnly = !!item;
  $('viewbar').hidden = !item;
  if (item) $('viewbar-text').textContent = `Viewing “${item.name}” by ${item.author} from the gallery (read-only)`;
}
function setUrl(param, id) {
  try { history.replaceState(null, '', id ? `${location.pathname}?${param}=${encodeURIComponent(id)}` : location.pathname); } catch { /* sandboxed */ }
}

export function openLocal(id, compile = true) {
  setViewing(null);
  setCurrent(id);
  ctx.src.value = cur().src;
  setUrl('p', id);
  applyView(cur().view || lastView(), { persist: false });
  syncHeader(); renderMine();
  if (!$('list-gal').hidden) renderGalleryList();
  if (compile) ctx.doCompile(true);
  loadImagesFor({ kind: 'local', id }).then(() => syncHeader());
}
export async function openGallery(id) {
  const owned = local.list.find((p) => p.galleryId === id);
  if (owned) { openLocal(owned.id); return; } // your own entry opens your editable copy
  try {
    const item = await api.get(id);
    setViewing(item);
    ctx.src.value = item.src;
    setUrl('g', id);
    if (item.view) applyView(item.view, { persist: false }); // the way its author shared it
    syncHeader(); renderMine(); renderGalleryList();
    ctx.doCompile(true);
    loadImagesFor({ kind: 'gallery', item });
  } catch (e) {
    toast(`Could not open it: ${e.message}`, true);
    if (!cur()) return;
    openLocal(cur().id, false);
  }
}
export function newProject(name, src, view = null) {
  const lv = lastView();
  const p = local.add(freshName(name), src, { view: view || { geo: lv.geo, env: lv.env, spin: lv.spin } });
  openLocal(p.id);
  showSideTab('mine');
  return p;
}

function bindHeader() {
  // edits save to the current project
  let saveTimer = 0;
  ctx.src.ta.addEventListener('input', () => {
    if (viewing) return;
    const p = cur();
    p.src = ctx.src.value; p.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { local.save(); renderMine(); }, 300);
    syncHeader();
  });
  $('proj-name').addEventListener('change', () => {
    if (viewing) return;
    const p = cur();
    p.name = $('proj-name').value.trim() || 'untitled';
    p.updated = Date.now(); local.save(); syncHeader(); renderMine();
  });
  $('proj-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.currentTarget.blur(); });
  $('new-proj').addEventListener('click', () => newProject('untitled', NEW_PROJECT_SRC));
  $('delete-proj').addEventListener('click', deleteCurrent);
  $('remix').addEventListener('click', async () => {
    if (!viewing) return;
    const images = currentFiles(); // the viewed entry's images come along
    const p = newProject(`${viewing.name} remix`, viewing.src, viewing.view || null);
    for (const f of images) await putFile(p.id, { name: f.name, blob: f.blob, type: f.type, size: f.size, added: Date.now() });
    if (images.length) await loadImagesFor({ kind: 'local', id: p.id });
    toast(images.length ? `Copied into your projects with its ${images.length} image${images.length > 1 ? 's' : ''}. Edit away.` : 'Copied into your projects. Edit away.');
  });
  // examples start a new project instead of overwriting the current one
  const sel = $('preset');
  for (const [name] of PRESETS) { const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o); }
  sel.value = '';
  sel.addEventListener('change', () => {
    const p = PRESETS.find(([n]) => n === sel.value);
    sel.value = '';
    if (p) newProject(p[0].replace(/\.mxsl$/, ''), p[1]);
  });
}

// Deletes the open project from this browser. A gallery entry it was shared to stays up:
// the dialog says so, and Unshare is the way to take that down first.
async function deleteCurrent() {
  if (viewing) return;
  const p = cur();
  const dlg = $('dlg-delete');
  $('delete-title').textContent = `Delete “${p.name}”?`;
  $('delete-text').textContent = p.galleryId
    ? 'It is removed from this browser and cannot be brought back. Its gallery entry stays up, and this browser can no longer update it; press Unshare first to take that down too.'
    : 'It is removed from this browser and cannot be brought back.';
  dlg.showModal();
  const answer = await new Promise((resolve) => {
    dlg.querySelector('form').addEventListener('submit', (e) => resolve(e.submitter?.value), { once: true });
    dlg.addEventListener('cancel', () => resolve('cancel'), { once: true });
  });
  if (answer !== 'ok') return;
  await deleteAllFiles(p.id).catch(() => {});
  local.remove(p.id);
  if (!local.list.length) local.add('untitled', NEW_PROJECT_SRC);
  openLocal(local.sorted()[0].id);
  toast(`Deleted “${p.name}”.`);
}

// ---------------------------------------------------------------- dropdown
const projs = () => $('projs');
export function closeProjs() { projs().open = false; }
function bindDropdown() {
  const d = projs();
  d.addEventListener('toggle', () => { if (d.open) { renderMine(); if (!$('list-gal').hidden) renderGalleryList(); } });
  document.addEventListener('click', (e) => { if (d.open && !d.contains(e.target)) closeProjs(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.open) { closeProjs(); d.querySelector('summary').focus(); } });
  $('tab-mine').addEventListener('click', () => showSideTab('mine'));
  $('tab-gal').addEventListener('click', () => showSideTab('gal'));
  $('api-reset')?.addEventListener('click', async () => {
    const { mockServer } = await import('./api.js');
    await mockServer.reset();
    for (const p of local.list) if (p.galleryId) { p.galleryId = null; p.galleryVersionSrc = null; }
    local.save();
    if (viewing) openLocal(cur().id); else { syncHeader(); renderMine(); }
    if (!$('list-gal').hidden) renderGalleryList();
  });
  api.onRequest(({ method, path, status, ms }) => {
    const el = $('api-log');
    if (!el) return;
    const row = document.createElement('div');
    row.className = status && status >= 400 ? 's4' : 's2';
    row.textContent = `${method.padEnd(6)} ${path.replace(/[\w-]{12,}$/, (x) => x.slice(0, 5) + '…')} ${status || ''} ${ms.toFixed(0)}ms`;
    el.prepend(row);
    while (el.childElementCount > 30) el.lastElementChild.remove();
  });
}
export function showSideTab(which) {
  $('tab-mine').setAttribute('aria-selected', String(which === 'mine'));
  $('tab-gal').setAttribute('aria-selected', String(which === 'gal'));
  $('list-mine').hidden = which !== 'mine';
  $('list-gal').hidden = which !== 'gal';
  if (which === 'gal') renderGalleryList();
}
function item(name, metaHtml, current, onClick) {
  const b = document.createElement('button');
  b.className = 'pitem';
  b.setAttribute('aria-current', String(current));
  b.innerHTML = `<span class="nm">${escHtml(name)}</span><span class="meta">${metaHtml}</span>`;
  b.addEventListener('click', () => { closeProjs(); onClick(); });
  return b;
}
export function renderMine() {
  const host = $('list-mine');
  host.textContent = '';
  for (const p of local.sorted()) {
    const st = projState(p);
    const badge = !p.galleryId ? '' : st.includes('changes') ? '<span class="badge mine">changed</span>' : '<span class="badge pub">shared</span>';
    host.appendChild(item(p.name, `${ago(p.updated)} ${badge}`, !viewing && p.id === cur().id, () => openLocal(p.id)));
  }
}
export async function renderGalleryList() {
  const host = $('list-gal');
  host.innerHTML = '<div class="side-empty">Loading the gallery…</div>';
  try {
    const { items } = await api.list();
    host.textContent = '';
    if (!items.length) { host.innerHTML = '<div class="side-empty">Nothing shared yet. Be the first: press Share on one of your projects.</div>'; return; }
    for (const it of items) {
      const mine = it.mine ? '<span class="badge mine">yours</span>' : '';
      const current = viewing?.id === it.id || (!viewing && cur().galleryId === it.id);
      host.appendChild(item(it.name, `${escHtml(it.author)} · ${ago(it.updated)}${it.nodes ? ` · ${it.nodes} nodes` : ''} ${mine}`, current, () => openGallery(it.id)));
    }
  } catch (e) { host.innerHTML = `<div class="side-empty">Could not load the gallery: ${escHtml(e.message)}</div>`; }
}
