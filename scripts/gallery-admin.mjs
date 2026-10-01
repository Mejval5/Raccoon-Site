#!/usr/bin/env node
// Admin tasks for the ShadingLanguageX gallery, using the admin key in .gallery-admin-key
// (the same value as the Firebase secret GALLERY_ADMIN_KEY). The key stays in this script:
// it is sent only to the gallery API, never to a web page.
//
//   node scripts/gallery-admin.mjs list                  entries, and which have no preview
//   node scripts/gallery-admin.mjs previews [ids...]     render and upload missing previews
//   node scripts/gallery-admin.mjs delete <id>           remove an entry
//
// Options: --api <origin> (default https://raccoon.website, e.g. http://localhost:5000 for the
// emulator), --all (re-render every preview, not only missing ones), --timeout <seconds> per
// shader (default 300).
//
// "previews" needs a browser with a GPU: it serves the site on http://localhost:41095 plus a
// small render page, which you open in Chrome or Edge. The page renders each shader with the
// gallery's own preview code and hands the image back here; this script uploads it.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const API = opt('--api', 'https://raccoon.website').replace(/\/$/, '');
const TIMEOUT_S = Number(opt('--timeout', '300'));
const ALL = flag('--all');
const [cmd, ...rest] = args;

const keyFile = path.join(ROOT, '.gallery-admin-key');
const KEY = process.env.GALLERY_ADMIN_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '');
if (!KEY && cmd !== 'list') { console.error('No admin key: create .gallery-admin-key (see the README).'); process.exit(1); }

async function api(method, p, { body, type } = {}) {
  const res = await fetch(`${API}/api/gallery${p}`, {
    method,
    headers: { 'X-Admin-Key': KEY || '', ...(type ? { 'Content-Type': type } : {}) },
    body,
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${data?.error || text}`);
  return data;
}

async function list() {
  const { items } = await api('GET', '');
  for (const it of items) console.log(`${it.thumb ? 'preview ' : 'MISSING '} ${it.id}  ${String(it.nodes ?? '?').padStart(5)} nodes  ${it.name} (${it.author})${it.files?.length ? `  images: ${it.files.map((f) => f.name).join(', ')}` : ''}`);
  return items;
}

async function previews(ids) {
  const { items } = await api('GET', '');
  let jobs = items.filter((it) => (ids.length ? ids.includes(it.id) : ALL || !it.thumb));
  // Small shaders first: a heavy one that never finishes must not hold up the rest.
  jobs.sort((a, b) => (a.nodes ?? 1e9) - (b.nodes ?? 1e9));
  if (!jobs.length) { console.log('Every entry already has a preview.'); return; }
  console.log(`${jobs.length} to render: ${jobs.map((j) => j.name).join(', ')}`);
  const results = new Map();
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.data': 'application/octet-stream', '.rgbe': 'application/octet-stream' };
  const done = () => results.size === jobs.length;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/__admin/render.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(renderPage()); return; }
      if (url.pathname === '/__admin/jobs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ timeoutMs: TIMEOUT_S * 1000, jobs: jobs.map(({ id, name, src, nodes, files }) => ({ id, name, src, nodes, files: files || [] })) }));
        return;
      }
      // an entry's images, fetched from the API for the render page (it cannot reach the API itself)
      const fm = /^\/__admin\/files\/([\w-]+)\/(.+)$/.exec(url.pathname);
      if (fm) {
        const job = jobs.find((j) => j.id === fm[1]);
        const f = job?.files?.find((x) => x.name === decodeURIComponent(fm[2]));
        if (!f) { res.writeHead(404); res.end(); return; }
        const r = await fetch(`${API}/api/gallery/${job.id}/files/${encodeURIComponent(f.name)}?v=${f.v}`);
        res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' });
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      const m = /^\/__admin\/(thumb|fail)\/([\w-]+)$/.exec(url.pathname);
      if (m && req.method === 'POST') {
        const chunks = []; for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks);
        const job = jobs.find((j) => j.id === m[2]);
        if (!job) { res.writeHead(404); res.end(); return; }
        let result;
        if (m[1] === 'thumb') {
          try {
            await api('PUT', `/${job.id}/thumb?frames=${url.searchParams.get('frames')}`, { body, type: req.headers['content-type'] });
            result = `uploaded (${Math.round(body.length / 1024)} KB)`;
          } catch (e) { result = `upload failed: ${e.message}`; }
        } else result = `not rendered: ${body.toString('utf8')}`;
        results.set(job.id, result);
        console.log(`${job.name}: ${result}`);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result }));
        if (done()) { console.log('All done.'); setTimeout(() => process.exit(0), 300); }
        return;
      }
      // everything else: the static site, so the page can import the gallery's own modules
      const file = path.join(ROOT, 'site', decodeURIComponent(url.pathname));
      if (!file.startsWith(path.join(ROOT, 'site')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  server.listen(41095, '127.0.0.1', () => console.log('Open http://localhost:41095/__admin/render.html in Chrome or Edge to render them.'));
}

function renderPage() {
  return `<!doctype html><meta charset="utf-8"><title>Gallery previews (admin)</title>
<style>body{font:14px system-ui;margin:24px;background:#161b26;color:#d8dee9}li{margin:4px 0}.ok{color:#8fd694}.bad{color:#f07178}</style>
<h1 style="font-size:18px">Rendering gallery previews</h1><p>Keep this tab in front until it says done.</p><ol id="log"></ol>
<script type="module">
import { renderPreviewSprite } from '/shadinglanguagex/js/preview-sprite.js';
const log = (t, cls = '') => { const li = document.createElement('li'); li.textContent = t; li.className = cls; document.getElementById('log').appendChild(li); return li; };
const { jobs, timeoutMs } = await (await fetch('/__admin/jobs')).json();
for (const job of jobs) {
  const li = log(job.name + ' (' + (job.nodes ?? '?') + ' nodes): rendering…');
  try {
    const files = [];
    for (const f of job.files) {
      const r = await fetch('/__admin/files/' + job.id + '/' + encodeURIComponent(f.name));
      if (r.ok) files.push({ name: f.name, blob: await r.blob() });
    }
    const { blob, frames } = await renderPreviewSprite(job.src, { reduceGraph: true }, { timeoutMs, files });
    const r = await (await fetch('/__admin/thumb/' + job.id + '?frames=' + frames, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })).json();
    li.textContent = job.name + ': ' + r.result; li.className = r.result.startsWith('uploaded') ? 'ok' : 'bad';
  } catch (e) {
    await fetch('/__admin/fail/' + job.id, { method: 'POST', body: e.message });
    li.textContent = job.name + ': ' + e.message; li.className = 'bad';
  }
}
log('done', 'ok');
</script>`;
}

if (cmd === 'list') await list();
else if (cmd === 'previews') await previews(rest);
else if (cmd === 'delete' && rest[0]) { await api('DELETE', `/${rest[0]}`); console.log(`deleted ${rest[0]}`); }
else { console.log('usage: node scripts/gallery-admin.mjs list | previews [ids...] [--all] | delete <id>   [--api <origin>] [--timeout <s>]'); process.exitCode = 1; }
