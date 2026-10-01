// Small helpers shared by the page modules.
export const $ = (id) => document.getElementById(id);

// localStorage can be missing or throw (private mode, blocked site data): never let that break the page
export function storeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function storeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
export function readJson(k, fallback) { try { return JSON.parse(storeGet(k)) ?? fallback; } catch { return fallback; } }

export function lineOf(msg) { const m = /line (\d+)/i.exec(msg); return m ? +m[1] : 0; }
export function errText(e) { return (e && (e.message || e.error || String(e))) || 'Unknown error'; }

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 12);

export function ago(t) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// Where the WebAssembly builds and environment maps live, relative to the js/ folder.
export const LIB_URL = new URL('../lib/', import.meta.url);
export const libFile = (name) => new URL(name, LIB_URL).href;
