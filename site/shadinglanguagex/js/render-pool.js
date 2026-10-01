// A pool of render threads (render-worker.js) with a priority queue. Jobs are keyed, so the
// same program queued twice renders once; the queue is re-sorted every time a thread frees
// up, with the caller's priority function (distance from the viewport on the gallery page).
export function createPool({ size = 5, thumb = 256, onChange = () => {} } = {}) {
  const pool = {
    size: Math.max(1, Math.min(size, (navigator.hardwareConcurrency || 4) - 1)),
    threads: [], queue: [], seq: 0, started: false,
    get booting() { return !this.started || this.threads.some((t) => t.state === 'boot'); },
    get busy() { return this.threads.filter((t) => t.state !== 'idle' && t.state !== 'boot' && t.state !== 'dead').length; },
    get dead() { return this.threads.length > 0 && this.threads.every((t) => t.state === 'dead'); },

    start() {
      if (this.started) return;
      this.started = true;
      for (let i = 0; i < this.size; i++) {
        const th = { n: i + 1, state: 'boot', job: null, done: 0, error: '' };
        try {
          th.worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
        } catch (e) {
          th.state = 'dead'; th.error = e.message;
          this.threads.push(th);
          continue;
        }
        th.worker.onmessage = (e) => this.onMessage(th, e.data);
        th.worker.onerror = (e) => {
          th.error = e.message || 'thread failed to load';
          th.state = 'dead';
          this.releaseGpu(th);
          if (th.job) { th.job.resolve({ ok: false, stage: 'crash', error: th.error }); th.job = null; }
          onChange(); this.pump();
        };
        th.worker.postMessage({ op: 'init', args: { size: thumb } });
        this.threads.push(th);
      }
      onChange();
    },

    // One GPU slot: the GPU process compiles shaders on a single thread it shares with
    // painting the page, so threads render their frames one after another.
    gpuHolder: null, gpuWaiters: [],
    grantGpu() {
      if (this.gpuHolder || !this.gpuWaiters.length) return;
      const th = this.gpuWaiters.shift();
      this.gpuHolder = th;
      th.state = 'gpu';
      th.worker.postMessage({ op: 'gpu-grant' });
      onChange();
    },
    releaseGpu(th) {
      if (this.gpuHolder === th) this.gpuHolder = null;
      this.gpuWaiters = this.gpuWaiters.filter((t) => t !== th);
      this.grantGpu();
    },

    onMessage(th, d) {
      if (d.op === 'ready') {
        th.state = d.ok ? 'idle' : 'dead';
        if (!d.ok) th.error = d.error;
        onChange(); this.pump();
        return;
      }
      if (d.op === 'gpu-request') {
        th.state = 'wait';
        this.gpuWaiters.push(th);
        this.grantGpu();
        onChange();
        return;
      }
      const job = th.job;
      th.job = null; th.state = 'idle'; th.done++;
      this.releaseGpu(th);
      if (job) job.resolve({ ...d, thread: th.n });
      onChange(); this.pump();
    },

    // Returns the same promise for a key that is already queued or running.
    run(key, args, priority, onStart) {
      const running = this.threads.find((t) => t.job?.key === key)?.job;
      if (running) return running.promise;
      const queued = this.queue.find((j) => j.key === key);
      if (queued) { queued.priority = priority; return queued.promise; }
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      this.queue.push({ key, args, priority, onStart, resolve, promise });
      this.pump();
      return promise;
    },

    // Drops a job that has not started; a running one finishes on its own.
    cancel(key) {
      const i = this.queue.findIndex((j) => j.key === key);
      if (i >= 0) { const [j] = this.queue.splice(i, 1); j.resolve({ cancelled: true }); onChange(); }
    },

    pump() {
      for (const th of this.threads) {
        if (th.state !== 'idle' || !this.queue.length) continue;
        this.queue.sort((a, b) => a.priority() - b.priority());
        const job = this.queue.shift();
        th.job = job; th.state = 'busy';
        th.worker.postMessage({ id: ++this.seq, op: 'render', args: job.args });
        job.onStart?.(th.n);
      }
      onChange();
    },
  };
  return pool;
}
