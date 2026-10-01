// The Images panel in the editor: a project's images that its shader samples with
// image("name.png"). Add (picker or drop onto the editor), remove, see which ones the shader
// uses. At most MAX_FILES per project; an image of the same name must be removed before a new
// one can take its place. A gallery entry you are viewing shows its images read-only.
import { $ } from './util.js';
import { esc } from './highlight.js';
import { toast } from './log.js';
import { api } from './api.js';
import { local, cur } from './projects.js';
import { listFiles, putFile, deleteFile, prepareImage, referencedImages, resolveFile, filesSignature, MAX_FILES, MAX_BYTES } from './files.js';
import { setPreviewImages } from './preview.js';

let ctx = null;          // { src, onChange } from projects-ui
let files = [];          // the open project's (or viewed entry's) images
let owner = null;        // { kind: 'local', id } or { kind: 'gallery', item }
let thumbUrls = [];
export const currentFiles = () => files;

export function initImagesUI(c) {
  ctx = c;
  $('images').addEventListener('click', openDialog);
  $('img-add').addEventListener('click', () => $('img-input').click());
  $('img-input').addEventListener('change', async (e) => { await addFiles([...e.target.files]); e.target.value = ''; });
  $('dlg-images').addEventListener('close', () => { for (const u of thumbUrls) URL.revokeObjectURL(u); thumbUrls = []; });
  // drop images onto the editor or the panel
  for (const el of [$('ed-src'), $('dlg-images')]) {
    el.addEventListener('dragover', (e) => { if (canEdit() && hasFiles(e)) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', async (e) => {
      el.classList.remove('drop');
      if (!canEdit() || !hasFiles(e)) return;
      e.preventDefault();
      await addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
      if (!$('dlg-images').open) openDialog();
    });
  }
}
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const canEdit = () => owner?.kind === 'local';

// Loads the images for the project or gallery entry now open, and hands them to the preview.
export async function loadImagesFor(o) {
  owner = o;
  try {
    files = o.kind === 'local' ? await listFiles(o.id) : await api.fetchFiles(o.item);
  } catch { files = []; }
  if (o.kind === 'local') remember();
  syncButton();
  await setPreviewImages(files);
}

// Keeps the project's image fingerprint current, so the editor can tell when the gallery copy
// is behind (projects.js compares it with the one recorded at the last share).
function remember() {
  const p = local.byId(owner.id);
  if (!p) return;
  const sig = filesSignature(files);
  if (p.filesSig !== sig) { p.filesSig = sig; local.save(); }
}

function syncButton() {
  const b = $('images');
  b.textContent = files.length ? `Images (${files.length})` : 'Images';
  b.hidden = owner?.kind !== 'local' && !files.length;
}

async function addFiles(list) {
  if (!canEdit() || !list.length) return;
  const errors = [];
  for (const f of list) {
    if (files.length >= MAX_FILES) { errors.push(`${f.name}: this project already has ${MAX_FILES} images; remove one first`); continue; }
    let img;
    try { img = await prepareImage(f); } catch (e) { errors.push(e.message); continue; }
    if (files.some((x) => x.name.toLowerCase() === img.name.toLowerCase())) { errors.push(`there is already an image called ${img.name}; remove it first`); continue; }
    await putFile(owner.id, img);
    files = await listFiles(owner.id);
  }
  await changed();
  showErrors(errors);
}

async function removeFile(name) {
  if (!canEdit()) return;
  await deleteFile(owner.id, name);
  files = await listFiles(owner.id);
  await changed();
  toast(`Removed ${name}.`);
}

async function changed() {
  const p = local.byId(owner.id);
  if (p) { p.updated = Date.now(); remember(); }
  syncButton();
  renderList();
  ctx.onChange?.();
  await setPreviewImages(files);
}

function showErrors(errors) {
  const box = $('img-err');
  box.hidden = !errors.length;
  box.textContent = errors.join('\n');
}

function openDialog() {
  showErrors([]);
  renderList();
  $('dlg-images').showModal();
}

function renderList() {
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls = [];
  const editable = canEdit();
  const used = referencedImages(ctx.src.value);
  const missing = used.filter((n) => !resolveFile(files, n));
  $('img-title').textContent = editable ? `Images for “${cur()?.name || 'project'}”` : `Images of “${owner?.item?.name || 'this entry'}”`;
  $('img-count').textContent = `${files.length} of ${MAX_FILES} · up to ${Math.round(MAX_BYTES / 1024)} KB each`;
  $('img-add').hidden = !editable;
  $('img-add').disabled = files.length >= MAX_FILES;
  $('img-add').textContent = files.length >= MAX_FILES ? 'Remove one to add another' : '+ Add images';
  $('img-drop').hidden = !editable;
  const host = $('img-list');
  host.textContent = '';
  if (!files.length) host.innerHTML = `<li class="img-empty">${editable ? 'No images yet. Add PNG, JPG or WebP files, or drop them onto the editor.' : 'This entry has no images.'}</li>`;
  for (const f of files) {
    const url = URL.createObjectURL(f.blob);
    thumbUrls.push(url);
    const isUsed = used.some((n) => resolveFile([f], n));
    const li = document.createElement('li');
    li.className = 'img-row';
    li.innerHTML = `<img src="${url}" alt="">
      <div class="img-info"><div class="img-name">${esc(f.name)}</div>
      <div class="img-meta">${Math.round(f.size / 1024)} KB · <span class="${isUsed ? 'ok' : ''}">${isUsed ? 'used by the shader' : 'not used yet'}</span></div></div>
      <button class="img-copy" title="Copy the image() call for this file">Copy image()</button>
      ${editable ? '<button class="img-del">Remove</button>' : ''}`;
    li.querySelector('.img-copy').addEventListener('click', async () => {
      const snippet = `image("${f.name}", texcoord = texcoord())`;
      try { await navigator.clipboard.writeText(snippet); toast(`Copied ${snippet}`); } catch { toast(snippet); }
    });
    li.querySelector('.img-del')?.addEventListener('click', () => removeFile(f.name));
    host.appendChild(li);
  }
  const miss = $('img-missing');
  miss.hidden = !missing.length;
  miss.textContent = missing.length ? `The shader asks for ${missing.map((n) => `"${n}"`).join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not here yet: it shows a checker instead.` : '';
}
