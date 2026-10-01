// A plain textarea with a highlighted <pre> drawn underneath it and a line-number gutter.
// The textarea stays transparent, so typing, selection and the caret are all native.
export class Editor {
  constructor(root, highlighter) {
    this.ta = root.querySelector('textarea');
    this.pre = root.querySelector('pre');
    this.gutter = root.querySelector('.gutter');
    this.highlighter = highlighter;
    this.badLine = 0;
    this.lines = 0;
    this.ta.addEventListener('input', () => this.render());
    this.ta.addEventListener('scroll', () => this.sync());
    this.ta.addEventListener('keydown', (e) => this.onKey(e));
  }
  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.ta.scrollTop = 0; this.render(); }
  onKey(e) {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !this.ta.readOnly) {
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
    }
  }
  setBadLine(n) { this.badLine = n; this.render(); }
  render() {
    const src = this.ta.value;
    let html = this.highlighter(src);
    if (this.badLine > 0) {
      const parts = html.split('\n');
      if (parts[this.badLine - 1] !== undefined) parts[this.badLine - 1] = `<span class="badline">${parts[this.badLine - 1] || ' '}</span>`;
      html = parts.join('\n');
    }
    this.pre.innerHTML = html + '\n';
    const n = src.split('\n').length;
    if (n !== this.lines || this.gutter.dataset.bad !== String(this.badLine)) {
      let g = '';
      for (let i = 1; i <= n; i++) g += i === this.badLine ? `<div class="bad">${i}</div>` : `<div>${i}</div>`;
      this.gutter.innerHTML = g + '<div></div>';
      this.lines = n;
      this.gutter.dataset.bad = String(this.badLine);
    }
    this.sync();
  }
  sync() {
    this.pre.scrollTop = this.ta.scrollTop;
    this.pre.scrollLeft = this.ta.scrollLeft;
    this.gutter.scrollTop = this.ta.scrollTop;
  }
  goToLine(n) {
    const lines = this.ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    this.ta.focus();
    this.ta.setSelectionRange(pos, pos + (lines[n - 1] || '').length);
    this.ta.scrollTop = Math.max(0, (n - 4) * 20);
  }
}
