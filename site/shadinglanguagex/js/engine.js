// The compiler as seen from the page: call('compile', ...) / call('decompile', ...).
// Preferred: mxslc in a Web Worker (compile-worker.js). Fallback: the same module on the
// main thread if workers are unavailable.
import { errText, libFile } from './util.js';

let printSink = null;

export const engine = {
  worker: null, seq: 0, waiters: new Map(), local: null, mode: '',
  call(op, args) {
    if (this.worker) {
      const id = ++this.seq;
      return new Promise((resolve, reject) => {
        this.waiters.set(id, { resolve, reject });
        this.worker.postMessage({ id, op, args });
      });
    }
    return Promise.resolve().then(() => this.runLocal(op, args));
  },
  runLocal(op, args) {
    const m = this.local, prints = [];
    printSink = prints;
    const t0 = performance.now();
    try {
      if (op === 'compile') {
        const o = new m.CompileOptions();
        Object.assign(o, args.opts);
        try { return { xml: m.compileSlxToMtlx(args.src, o), prints, ms: performance.now() - t0 }; } finally { o.delete(); }
      }
      return { slx: m.decompileMtlxToSlx(args.xml), prints, ms: performance.now() - t0 };
    } catch (e) {
      throw { error: errText(e), prints };
    } finally { printSink = null; }
  },
  onMessage(e) {
    const { id, ok } = e.data;
    const w = this.waiters.get(id);
    if (!w) return;
    this.waiters.delete(id);
    if (ok) w.resolve(e.data); else w.reject(e.data);
  },
  async start() {
    try {
      const w = new Worker(new URL('./compile-worker.js', import.meta.url), { type: 'module' });
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker did not start')), 30000);
        w.onerror = (ev) => { clearTimeout(timer); reject(new Error(ev.message || 'worker failed to load')); };
        w.onmessage = (ev) => { if (ev.data && ev.data.op === 'ready') { clearTimeout(timer); ev.data.ok ? resolve() : reject(new Error(ev.data.error)); } };
      });
      w.postMessage({ op: 'init' });
      await ready;
      w.onmessage = (ev) => this.onMessage(ev);
      w.onerror = null;
      this.worker = w;
      this.mode = 'background thread';
      return;
    } catch (e) {
      console.warn('mxslc worker unavailable, compiling on the main thread:', e);
    }
    const { default: Mxslc } = await import('../lib/JsMxslc.js');
    this.local = await Mxslc({
      locateFile: libFile,
      print: (s) => { if (s && printSink) printSink.push(s); },
      printErr: (s) => console.warn(s),
    });
    this.mode = 'main thread';
  },
};
