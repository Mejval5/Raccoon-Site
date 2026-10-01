// Renders the gallery preview for a shared project: a turntable on one render thread, packed
// into a single sprite strip (frames side by side) small enough to upload. The gallery shows
// these stored strips, so visitors never have to compile anyone's shader just to browse.
import { createPool } from './render-pool.js';

const RENDER_SIZE = 200;   // the render thread's canvas
const RENDER_FRAMES = 24;
const MAX_BYTES = 580 * 1024; // the server takes up to 600 KB
// Tried in order until the encoded strip fits: full turntable first, then lighter variants.
const LAYOUTS = [
  { size: 200, frames: 24, quality: 0.72 },
  { size: 176, frames: 24, quality: 0.68 },
  { size: 160, frames: 12, quality: 0.75 },
  { size: 128, frames: 12, quality: 0.7 },
];

let pool = null;

/**
 * @returns {Promise<{blob: Blob, frames: number}>} the encoded strip, WebP where the browser
 * can encode it and PNG otherwise (Safari). Throws with a readable message on failure.
 */
export async function renderPreviewSprite(src, opts, { timeoutMs = 45000 } = {}) {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('this browser cannot render previews off screen');
  pool ??= createPool({ size: 1, thumb: RENDER_SIZE });
  pool.start();
  let timer = 0;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, stage: 'timeout' }), timeoutMs); });
  const res = await Promise.race([pool.run(`share:${Date.now()}`, { src, opts, frames: RENDER_FRAMES }, () => 0), timeout]);
  clearTimeout(timer);
  if (!res.ok) {
    const why = { timeout: `rendering took over ${Math.round(timeoutMs / 1000)} s`, compile: 'it does not compile', shader: 'shader generation failed', gpu: 'the GPU rejected the shader', empty: 'there is nothing to preview', crash: 'the render thread crashed' }[res.stage] || 'rendering failed';
    throw new Error(res.error ? `${why}: ${res.error}` : why);
  }
  try {
    for (const layout of LAYOUTS) {
      const blob = await pack(res.frames, layout);
      if (blob.size <= MAX_BYTES) return { blob, frames: layout.frames };
    }
    throw new Error('the preview is too large to upload');
  } finally {
    for (const f of res.frames) f.close();
  }
}

async function pack(frames, { size, frames: n, quality }) {
  const canvas = new OffscreenCanvas(size * n, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const step = frames.length / n;
  for (let i = 0; i < n; i++) ctx.drawImage(frames[Math.floor(i * step)], i * size, 0, size, size);
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
  if (webp.type === 'image/webp') return webp;
  return canvas.convertToBlob({ type: 'image/png' }); // no WebP encoder in this browser
}
