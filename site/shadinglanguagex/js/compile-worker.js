// Compile thread: runs the mxslc WebAssembly build so a ~350 ms compile never blocks typing.
// Messages: { op: 'init' } -> { op: 'ready', ok }, then { id, op: 'compile'|'decompile', args }
// -> { id, ok, xml|slx, prints, ms } or { id, ok: false, error, prints }.
import Mxslc from '../lib/JsMxslc.js';

const libFile = (name) => new URL('../lib/' + name, import.meta.url).href;
let mxc = null;
const prints = [];

self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  if (op === 'init') {
    try {
      mxc = await Mxslc({ locateFile: libFile, print: (s) => { if (s) prints.push(s); }, printErr: () => {} });
      self.postMessage({ op: 'ready', ok: true });
    } catch (err) { self.postMessage({ op: 'ready', ok: false, error: String(err && err.message || err) }); }
    return;
  }
  prints.length = 0;
  const t0 = performance.now();
  try {
    if (op === 'compile') {
      const o = new mxc.CompileOptions();
      Object.assign(o, args.opts);
      try {
        const xml = mxc.compileSlxToMtlx(args.src, o);
        self.postMessage({ id, ok: true, xml, prints: prints.slice(), ms: performance.now() - t0 });
      } finally { o.delete(); }
    } else if (op === 'decompile') {
      const slx = mxc.decompileMtlxToSlx(args.xml);
      self.postMessage({ id, ok: true, slx, prints: prints.slice(), ms: performance.now() - t0 });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err), prints: prints.slice() });
  }
};
