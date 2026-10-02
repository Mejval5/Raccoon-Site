// Editor page entry: wires the editors, the compiler and the preview together.
import { highlightMxsl, highlightXml } from './highlight.js';
import { Editor } from './editor.js';
import { log, clearLog, logStatus } from './log.js';
import { renderGraph } from './graph.js';
import { $, storeGet, storeSet, lineOf, errText } from './util.js';
import { engine } from './engine.js';
import { pv, initPreview, schedulePreview, resizePreview, getView } from './preview.js';
import { cur } from './projects.js';
import { initProjectsUI, getViewing } from './projects-ui.js';
import { scheduleLocalPreview } from './local-previews.js';
import { initShare } from './share.js';

const src = new Editor($('ed-src'), highlightMxsl);
const out = new Editor($('ed-out'), highlightXml);

function currentOptions() {
  return { reduceGraph: $('opt-reduce').checked, errorOnMissingGlobals: $('opt-missing').checked, errorOnUnusedGlobals: $('opt-unused').checked };
}
function showXml(xml) {
  renderGraph(xml);
  schedulePreview(xml);
}

// ---------------------------------------------------------------- compile
// latest-wins scheduling: one compile in flight, newest request queued, stale results dropped
let compileSeq = 0, inFlight = false, queued = null;
function doCompile(manual) {
  if (!engine.mode) return;
  queued = { manual, seq: ++compileSeq, src: src.value, opts: currentOptions() };
  setBusy(true);
  if (!inFlight) pump();
}
function setBusy(on) {
  $('compile').textContent = on ? 'Compiling...' : 'Compile ->';
  logStatus('compile', on ? 'Compiling…' : '', 'busy');
}
async function pump() {
  if (!queued) { setBusy(false); return; }
  const job = queued;
  queued = null;
  inFlight = true;
  logStatus('compile', 'Compiling…', 'busy'); // the previous result may have cleared the log
  try {
    const r = await engine.call('compile', { src: job.src, opts: job.opts });
    if (job.seq === compileSeq) showCompiled(r);
  } catch (r) {
    if (job.seq === compileSeq) showCompileError(r, job.manual);
  }
  inFlight = false;
  pump();
}
function showCompiled(r) {
  // once the code has been still for a few seconds, refresh this project's saved preview
  scheduleLocalPreview(() => (getViewing() ? null : cur()), getView);
  clearLog();
  src.setBadLine(0);
  out.setBadLine(0);
  out.value = r.xml;
  showXml(r.xml);
  for (const p of r.prints || []) log(p, 'p');
  log(`Compiled in ${r.ms.toFixed(0)} ms on the ${engine.mode} -> ${r.xml.length.toLocaleString()} characters of MaterialX`, 'o');
  $('mtlx-hint').textContent = 'edit and decompile back';
}
function showCompileError(r, manual) {
  clearLog();
  for (const p of r.prints || []) log(p, 'p');
  const msg = errText(r);
  const ln = lineOf(msg);
  src.setBadLine(ln);
  log(`Compile failed: ${msg}`, 'e', ln, src);
  if (!manual) $('mtlx-hint').textContent = 'showing the last successful compile';
}
async function doDecompile() {
  if (!engine.mode) return;
  clearLog();
  const xml = out.value;
  try {
    const r = await engine.call('decompile', { xml });
    out.setBadLine(0);
    compileSeq++; // a compile still in flight must not overwrite the decompiled source
    src.value = r.slx;
    src.setBadLine(0);
    showXml(xml);
    log(`Decompiled in ${r.ms.toFixed(0)} ms. The MXSL pane now holds the decompiler's output.`, 'o');
  } catch (r) {
    const msg = errText(r);
    const ln = lineOf(msg);
    out.setBadLine(ln);
    log(`Decompile failed: ${msg}`, 'e', ln, out);
  }
}
async function doRoundTrip() {
  if (!engine.mode) return;
  clearLog();
  log('Checking round trip...', 'm');
  const opts = currentOptions();
  let a, slx, b;
  try { a = (await engine.call('compile', { src: src.value, opts })).xml; } catch (e) { clearLog(); log(`Step 1 of 3, compile failed: ${errText(e)}`, 'e', lineOf(errText(e)), src); return; }
  try { slx = (await engine.call('decompile', { xml: a })).slx; } catch (e) { clearLog(); log(`Step 2 of 3, decompiling the output failed: ${errText(e)}`, 'e'); return; }
  try { b = (await engine.call('compile', { src: slx, opts })).xml; } catch (e) { clearLog(); log(`Step 3 of 3, recompiling the decompiled MXSL failed: ${errText(e)}`, 'e'); log('Decompiled source that failed:', 'm'); log(slx, 'm'); return; }
  clearLog();
  out.value = a;
  showXml(a);
  if (a === b) { log('Round trip is stable: compile -> decompile -> compile produced identical MaterialX.', 'o'); return; }
  const norm = (x) => x.split('\n').map((l) => l.trim()).sort().join('\n');
  if (norm(a) === norm(b)) { log('Round trip is stable up to node order: same nodes and connections, emitted in a different order.', 'o'); return; }
  const la = a.split('\n'), lb = b.split('\n');
  let i = 0;
  while (i < la.length && la[i] === lb[i]) i++;
  log(`Round trip differs. First difference at MaterialX line ${i + 1}:`, 'e');
  log(`  first:  ${(la[i] ?? '<end>').trim()}`, 'm');
  log(`  second: ${(lb[i] ?? '<end>').trim()}`, 'm');
  log(`Sizes: ${a.length} vs ${b.length} characters.`, 'm');
}

let timer = 0;
src.ta.addEventListener('input', () => {
  if (!$('auto').checked) return;
  clearTimeout(timer);
  timer = setTimeout(() => doCompile(false), 350);
});
src.ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doCompile(true); } });
out.ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doDecompile(); } });
$('compile').addEventListener('click', () => doCompile(true));
$('decompile').addEventListener('click', doDecompile);
$('roundtrip').addEventListener('click', doRoundTrip);
for (const id of ['opt-reduce', 'opt-missing', 'opt-unused']) $(id).addEventListener('change', () => doCompile(true));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(out.value); log('Copied the MaterialX to the clipboard.', 'o'); }
  catch { out.ta.focus(); out.ta.select(); log('Clipboard access was blocked. The text is selected, press Ctrl+C.', 'm'); }
});
$('download').addEventListener('click', () => {
  const name = (cur()?.name || 'shader').replace(/[^\w.-]+/g, '_') + '.mtlx';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.value], { type: 'application/xml' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  log(`Saved ${name}.`, 'o');
});

// ---------------------------------------------------------------- theme
const prefersDark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() { document.documentElement.dataset.theme = $('opt-dark').checked ? 'dark' : 'light'; storeSet('slx-playground-theme', document.documentElement.dataset.theme); }
const savedTheme = storeGet('slx-playground-theme');
$('opt-dark').checked = savedTheme ? savedTheme === 'dark' : prefersDark.matches;
applyTheme();
$('opt-dark').addEventListener('change', applyTheme);

// ---------------------------------------------------------------- projects and sharing
out.ta.value = '';
out.render();
initProjectsUI({ src, doCompile });
initShare({ src, engine, currentOptions });

// ---------------------------------------------------------------- right pane tabs
function showTab(which) {
  const preview = which === 'preview';
  $('tab-preview').setAttribute('aria-selected', String(preview));
  $('tab-xml').setAttribute('aria-selected', String(!preview));
  $('view-preview').hidden = !preview;
  $('ed-out').hidden = preview;
  $('ed-out').closest('.pane').classList.toggle('tab-preview', preview);
  if (preview) resizePreview(); else out.render();
  pv.dirty = true;
}
$('tab-preview').addEventListener('click', () => showTab('preview'));
$('tab-xml').addEventListener('click', () => showTab('xml'));
showTab('preview');

// ---------------------------------------------------------------- boot
try {
  await engine.start();
  $('boot').remove();
  log(`Compiler ready on the ${engine.mode}.`, 'o');
  doCompile(true);
  initPreview();
} catch (e) {
  $('boot-msg').textContent = `The compiler could not start in this browser: ${errText(e)}. It needs WebAssembly and module workers.`;
}
