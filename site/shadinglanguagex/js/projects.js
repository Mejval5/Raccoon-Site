// Your projects, kept in this browser's localStorage. Each one remembers whether it was
// shared to the gallery (galleryId) and what source was published last (galleryVersionSrc).
import { readJson, storeGet, storeSet, uid } from './util.js';
import { PRESETS } from './presets.js';

export const local = {
  list: readJson('mxsl-projects', []),
  save() { storeSet('mxsl-projects', JSON.stringify(this.list)); },
  add(name, src, extra = {}) {
    const p = { id: uid(), name, src, updated: Date.now(), galleryId: null, galleryVersionSrc: null, ...extra };
    this.list.unshift(p);
    this.save();
    return p;
  },
  byId(id) { return this.list.find((p) => p.id === id); },
  remove(id) { this.list = this.list.filter((p) => p.id !== id); this.save(); },
  sorted() { return [...this.list].sort((a, b) => b.updated - a.updated); },
};

// First visit, or a visitor of the old single-project playground: start from what they had.
if (!local.list.length) {
  const legacy = storeGet('slx-playground-src');
  local.add(legacy ? 'my shader' : 'hello', legacy || PRESETS[0][1]);
}

let curId = storeGet('mxsl-current');
if (!local.byId(curId)) curId = local.list[0].id;
export const cur = () => local.byId(curId);
export function setCurrent(id) {
  if (!local.byId(id)) return;
  curId = id;
  storeSet('mxsl-current', id);
}

export function projState(p) {
  if (!p.galleryId) return 'local only';
  return p.src === p.galleryVersionSrc ? 'shared, up to date' : 'shared, unpublished changes';
}

// A name that does not clash with the other projects: "untitled", "untitled 2", ...
export function freshName(base) {
  const taken = new Set(local.list.map((p) => p.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}
