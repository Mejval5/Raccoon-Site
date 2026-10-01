// The log under the editors, and the toast at the bottom of the page.
const logEl = document.getElementById('log');

// cls: 'm' muted, 'o' ok, 'e' error, 'p' print() output. With a line and an editor the
// entry becomes a link that jumps to that line.
export function log(text, cls = 'm', line = 0, editor = null) {
  if (!logEl) return;
  const d = document.createElement('div');
  d.className = cls;
  if (line && editor) {
    const a = document.createElement('a');
    a.textContent = text;
    a.addEventListener('click', () => editor.goToLine(line));
    d.appendChild(a);
  } else d.textContent = text;
  logEl.appendChild(d);
  while (logEl.childElementCount > 200) logEl.firstElementChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}
export const clearLog = () => { if (logEl) logEl.textContent = ''; };

let toastTimer = 0;
export function toast(text, isErr = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.hidden = false;
  t.classList.toggle('e', isErr);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
