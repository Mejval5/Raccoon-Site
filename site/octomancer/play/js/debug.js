// ?fps=1 overlay (median/p95 frame ms, step ms, draw count) and
// ?debug=input overlay (every key currently held). OVERNIGHT.md §2 "Test hooks".

export function createDebugOverlay(el, { loop, input }) {
  const params = new URLSearchParams(location.search);
  const showFps = params.get('fps') === '1';
  const showInput = params.get('debug') === 'input';
  if (!showFps && !showInput) return { tick() {} };

  el.setAttribute('aria-hidden', 'false');

  function tick() {
    const lines = [];
    if (showFps) {
      const m = loop.metrics();
      lines.push(`frame median ${m.frameMsMedian.toFixed(2)}ms p95 ${m.frameMsP95.toFixed(2)}ms`);
      lines.push(`steps ${m.stepCount} draws ${m.drawCount}`);
    }
    if (showInput) {
      lines.push(`keys: ${input.debugKeys().join(' ') || '(none)'}`);
      const snap = input.snapshot ? null : null; // snapshot is consumed by main; read raw touch instead
      lines.push(`touch: x=${input.touch.x.toFixed(2)} y=${input.touch.y.toFixed(2)} active=${input.touch.active}`);
      lines.push(`dash held=${input.touch.dash.held} bomb held=${input.touch.bomb.held}`);
    }
    el.textContent = lines.join('\n');
  }

  return { tick };
}
