// Gallery page: every shared project (or your own) as a card that compiles and renders a
// spinning preview on the render threads as it scrolls into view.
import { $, ago, readJson } from './util.js';
import { esc } from './highlight.js';
import { toast } from './log.js';
import { api } from './api.js';
import { local } from './projects.js';
import { createPool } from './render-pool.js';

const THUMB = 256, FRAMES = 24, FPS = 16;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const supported = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined';

const gv = { source: 'gallery', cards: new Map(), visible: new Set(), io: null, raf: 0, last: 0, frame: 0 };
const cache = new Map(); // hash -> render result (frames kept only while a card showing it is visible)
const pool = createPool({ size: 5, thumb: THUMB, onChange: renderThreads });

// ---------------------------------------------------------------- thread meter
function renderThreads() {
  const host = $('gv-threads');
  const n = pool.threads.length || pool.size;
  let html = '';
  for (let i = 0; i < n; i++) {
    const th = pool.threads[i];
    const st = th ? th.state : 'boot';
    const tip = !th ? 'starting' : { busy: `thread ${th.n}: compiling`, wait: `thread ${th.n}: waiting for the GPU`, gpu: `thread ${th.n}: rendering on the GPU`, dead: `thread ${th.n}: ${th.error}`, boot: `thread ${th.n}: loading the engines` }[st] || `thread ${th.n}: idle, ${th.done} rendered`;
    html += `<span class="thread ${st}" title="${esc(tip)}"></span>`;
  }
  const label = !supported ? 'previews need OffscreenCanvas (Chrome, Edge, Firefox 105+, Safari 17+)'
    : pool.dead ? `render threads failed: ${pool.threads[0].error}`
    : pool.booting ? 'starting render threads' : `${pool.busy} of ${n} threads busy${pool.queue.length ? `, ${pool.queue.length} queued` : ''}`;
  host.innerHTML = `${html}<span class="tlabel">${esc(label)}</span>`;
}

// ---------------------------------------------------------------- cards
// Short line on the card; the full breakdown goes in the tooltip.
function fmtStats(r) {
  const work = (r.ms.compile || 0) + (r.ms.gen || 0) + (r.ms.gpu || 0);
  const text = `${r.nodes} nodes · ${(work / 1000).toFixed(1)} s on thread ${r.thread}`;
  const parts = [];
  if (r.ms.compile != null) parts.push(`mxsl -> MaterialX ${r.ms.compile.toFixed(0)} ms`);
  if (r.ms.gen != null) parts.push(`MaterialX -> GLSL ${r.ms.gen.toFixed(0)} ms`);
  if (r.ms.gpu != null) parts.push(`GPU compile + first frame ${r.ms.gpu.toFixed(0)} ms`);
  if (r.ms.wait > 50) parts.push(`waited ${r.ms.wait.toFixed(0)} ms for the GPU slot`);
  return { text, title: parts.join('\n') };
}
function makeCard(item) {
  const el = document.createElement('article');
  el.className = 'gcard';
  const openHref = item.local ? `../?p=${encodeURIComponent(item.id)}` : `../?g=${encodeURIComponent(item.id)}`;
  el.innerHTML = `
    <a class="thumb" href="${openHref}" aria-label="Open ${esc(item.name)} in the editor"><canvas width="${THUMB}" height="${THUMB}"></canvas><span class="tstat">${supported ? 'waiting to scroll into view' : 'open to preview'}</span></a>
    <div class="gbody">
      <div class="gname" title="${esc(item.name)}">${esc(item.name)}</div>
      <div class="gmeta">${item.local ? 'your project' : esc(item.author)} · ${ago(item.updated)}${item.nodes ? ` · ${item.nodes} nodes` : ''}${!item.local && item.mine ? ' <span class="badge mine">yours</span>' : ''}</div>
    </div>
    <div class="gacts">
      <a class="btn" href="${openHref}">${item.local || item.mine ? 'Edit' : 'Open'}</a>
      ${item.local ? '' : '<button class="remix">Remix</button>'}
    </div>`;
  const card = { el, item, key: item.key, canvas: el.querySelector('canvas'), stat: el.querySelector('.tstat'), hash: hashStr(item.src), pending: false };
  card.ctx = card.canvas.getContext('2d');
  el.querySelector('.remix')?.addEventListener('click', () => {
    const p = local.add(`${item.name} remix`, item.src);
    toast('Copied into your projects. Opening the editor…');
    setTimeout(() => { location.href = `../?p=${encodeURIComponent(p.id)}`; }, 400);
  });
  el.dataset.key = item.key;
  return card;
}
function drawFrame(card, i) {
  const r = cache.get(card.hash);
  if (!r?.frames?.length) return;
  card.ctx.drawImage(r.frames[i % r.frames.length], 0, 0, THUMB, THUMB);
}
function showResult(card, r) {
  if (r.ok) {
    const s = fmtStats(r);
    card.el.classList.remove('bad');
    card.stat.textContent = s.text;
    card.el.querySelector('.thumb').title = s.title;
    drawFrame(card, gv.frame);
    return;
  }
  card.el.classList.add('bad');
  card.ctx.clearRect(0, 0, THUMB, THUMB);
  const why = { compile: 'does not compile', shader: 'shader generation failed', gpu: 'the GPU rejected the shader', empty: 'nothing to preview', crash: 'render thread crashed' }[r.stage] || 'failed';
  card.stat.textContent = r.error ? `${why}: ${r.error.slice(0, 160)}` : why;
}
function request(card) {
  if (!supported || pool.dead) return;
  const r = cache.get(card.hash);
  if (r && (!r.ok || r.frames.length === FRAMES)) { showResult(card, r); return; }
  if (r?.frames?.length) drawFrame(card, 0); // evicted to one frame: show it while the turntable re-renders
  if (card.pending) return;
  card.pending = true;
  card.stat.textContent = 'queued';
  const priority = () => (gv.visible.has(card.key) ? 0 : 1e6) + Math.abs(card.el.getBoundingClientRect().top);
  const onStart = (n) => { for (const c of gv.cards.values()) if (c.hash === card.hash) c.stat.textContent = `rendering on thread ${n}…`; };
  pool.run(card.hash, { src: card.item.src, opts: { reduceGraph: true }, frames: FRAMES }, priority, onStart).then((res) => {
    card.pending = false;
    if (res.cancelled) { card.stat.textContent = 'waiting to scroll into view'; return; }
    if (cache.get(card.hash) !== res) { // several cards can show one program
      const old = cache.get(card.hash);
      if (old?.frames) for (const f of old.frames) f.close();
      cache.set(card.hash, res);
    }
    for (const c of gv.cards.values()) if (c.hash === card.hash) showResult(c, res);
    if (!gv.visible.has(card.key)) evict(card);
    animate();
  });
}
// Off-screen cards keep one frame so they still show something, and re-render on return.
function evict(card) {
  const r = cache.get(card.hash);
  if (!r?.frames || r.frames.length <= 1) return;
  if ([...gv.visible].some((k) => gv.cards.get(k)?.hash === card.hash)) return;
  for (const f of r.frames.slice(1)) f.close();
  r.frames = r.frames.slice(0, 1);
}
function onIntersect(entries) {
  for (const e of entries) {
    const card = gv.cards.get(e.target.dataset.key);
    if (!card) continue;
    if (e.isIntersecting) { gv.visible.add(card.key); request(card); }
    else { gv.visible.delete(card.key); if (card.pending) pool.cancel(card.hash); else evict(card); }
  }
  renderThreads();
  animate();
}
function animate() {
  if (gv.raf) return;
  const step = (t) => {
    gv.raf = 0;
    if (!gv.visible.size) return;
    if ($('gv-spin').checked && !reduceMotion && t - gv.last > 1000 / FPS) {
      gv.last = t; gv.frame++;
      for (const k of gv.visible) { const c = gv.cards.get(k); if (c && !c.pending) drawFrame(c, gv.frame); }
    }
    gv.raf = requestAnimationFrame(step);
  };
  gv.raf = requestAnimationFrame(step);
}

// ---------------------------------------------------------------- grid
async function loadGrid() {
  const grid = $('gv-grid');
  if (!gv.io) gv.io = new IntersectionObserver(onIntersect, { rootMargin: '150px 0px' });
  gv.io.disconnect();
  gv.visible.clear();
  gv.cards.clear();
  let items;
  if (gv.source === 'mine') {
    items = local.sorted().map((p) => ({ ...p, local: true, key: 'l:' + p.id }));
  } else {
    grid.innerHTML = '<p class="gv-empty">Loading the gallery…</p>';
    try { items = (await api.list()).items.map((it) => ({ ...it, key: 'g:' + it.id })); }
    catch (e) { grid.innerHTML = `<p class="gv-empty">Could not load the gallery: ${esc(e.message)}</p>`; return; }
  }
  const q = $('gv-search').value.trim().toLowerCase();
  if (q) items = items.filter((it) => it.name.toLowerCase().includes(q) || (it.author || '').toLowerCase().includes(q));
  $('gv-count').textContent = `${items.length} ${items.length === 1 ? 'project' : 'projects'}`;
  grid.textContent = '';
  if (!items.length) {
    grid.innerHTML = `<p class="gv-empty">${q ? 'Nothing matches that search.' : gv.source === 'mine' ? 'No projects yet. Press + New in the editor.' : 'Nothing shared yet. Open a project in the editor and press Share.'}</p>`;
    return;
  }
  for (const it of items) {
    const card = makeCard(it);
    gv.cards.set(card.key, card);
    grid.appendChild(card.el);
    const r = cache.get(card.hash);
    if (r) showResult(card, r);
    gv.io.observe(card.el);
  }
}

for (const b of document.querySelectorAll('#gv-source button')) {
  b.addEventListener('click', () => {
    gv.source = b.dataset.src;
    for (const o of document.querySelectorAll('#gv-source button')) o.setAttribute('aria-selected', String(o === b));
    try { history.replaceState(null, '', gv.source === 'mine' ? '#mine' : location.pathname); } catch { /* sandboxed */ }
    loadGrid();
  });
}
let searchTimer = 0;
$('gv-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadGrid, 200); });
$('gv-spin').checked = !reduceMotion;
$('gv-spin').addEventListener('change', animate);

if (location.hash === '#mine') document.querySelector('#gv-source [data-src="mine"]').click();
else loadGrid();
if (supported) pool.start(); else renderThreads();
