// Destruction leaves traces (VIBE-REVIEW 3.4): the raw rock a blast uncovers and the silt it stirs up.
//
//   fresh edges  a tile that was just broken (world.breakTile / smashTile -> add) lights the exposed rim of its solid
//                neighbours with a pale raw-stone tint that fades out over FRESH_LIFE seconds, back to the normal rim.
//                A capped ring of (tile, age) entries drawn as thin translucent strokes along the faces that now border
//                open water; nothing is re-baked. Culled to the camera, so a level full of old craters costs nothing.
//   silt haze    a few big, faint, soft blobs hang over a fresh crater for HAZE_LIFE seconds, drifting up and growing.
//                One pre-baked soft sprite, drawImage with a global alpha (no gradient per frame).
//
// Data-oriented, nothing allocated per step or per frame. One instance per level world (world-v2.js owns it).

export const FRESH_LIFE = 24;   // s a broken edge takes to fade back to the normal rim
export const FRESH_CAP = 160;   // tiles remembered; a new one recycles the oldest
export const HAZE_LIFE = 4.5;   // s a haze blob hangs
export const HAZE_CAP = 16;
const FRESH_ALPHA = 0.7;
const DX = [-1, 1, 0, 0], DY = [0, 0, -1, 1];

let hazeSprite = null;
function hazeImage() {
  if (hazeSprite || typeof document === 'undefined') return hazeSprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(176,160,128,1)');
  grad.addColorStop(0.55, 'rgba(176,160,128,0.55)');
  grad.addColorStop(1, 'rgba(176,160,128,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return (hazeSprite = c);
}

export function createFresh() {
  const tx = new Int16Array(FRESH_CAP), ty = new Int16Array(FRESH_CAP), age = new Float32Array(FRESH_CAP);
  const live = new Uint8Array(FRESH_CAP);
  let head = 0, nFresh = 0;
  const hx = new Float32Array(HAZE_CAP), hy = new Float32Array(HAZE_CAP), hr = new Float32Array(HAZE_CAP);
  const hage = new Float32Array(HAZE_CAP), hlife = new Float32Array(HAZE_CAP), hon = new Uint8Array(HAZE_CAP);
  let hhead = 0, nHaze = 0, seed = 12345;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  return {
    /** A tile at (x, y) was just broken. */
    add(x, y) {
      if (!live[head]) nFresh++;
      tx[head] = x; ty[head] = y; age[head] = 0; live[head] = 1;
      head = (head + 1) % FRESH_CAP;
    },
    /** Silt hanging over a crater of `tiles` broken tiles centred on (x, y): 3-5 big faint blobs. */
    haze(x, y, tiles = 8) {
      const n = Math.max(3, Math.min(5, 2 + (tiles >> 2)));
      for (let k = 0; k < n; k++) {
        const i = hhead; hhead = (hhead + 1) % HAZE_CAP;
        if (!hon[i]) nHaze++;
        const a = rnd() * Math.PI * 2, d = rnd() * 1.4;
        hx[i] = x + Math.cos(a) * d; hy[i] = y + Math.sin(a) * d * 0.7;
        hr[i] = 0.9 + rnd() * 0.7; hage[i] = 0; hlife[i] = HAZE_LIFE * (0.75 + rnd() * 0.25); hon[i] = 1;
      }
    },
    update(dt) {
      if (nFresh) for (let i = 0; i < FRESH_CAP; i++) {
        if (!live[i]) continue;
        age[i] += dt;
        if (age[i] >= FRESH_LIFE) { live[i] = 0; nFresh--; }
      }
      if (nHaze) for (let i = 0; i < HAZE_CAP; i++) {
        if (!hon[i]) continue;
        hage[i] += dt;
        if (hage[i] >= hlife[i]) { hon[i] = 0; nHaze--; } else hy[i] -= dt * 0.12;
      }
    },
    /** Pale raw-stone strokes on the solid faces that border a freshly broken tile, then the haze. `tileAt(tx, ty)` is the world's. */
    draw(ctx, camera, cw, ch, tileAt) {
      if (!nFresh && !nHaze) return;
      const ppu = camera.pxPerUnit, hw = cw / 2, hh = ch / 2;
      const vx = cw / ppu / 2 + 1.5, vy = ch / ppu / 2 + 1.5;
      if (nFresh) {
        ctx.save();
        ctx.lineCap = 'round';
        // vibe review of the first pass: a wide wash inset into the rock read as grey bars. Now one pale stroke on the face itself (over
        // the rim, which it tints) and a few fixed pale chips just inside it, like fresh fractured stone.
        ctx.lineWidth = Math.max(1.5, ppu * 0.09);
        const chip = Math.max(1, ppu * 0.07);
        for (let i = 0; i < FRESH_CAP; i++) {
          if (!live[i]) continue;
          const x = tx[i], y = ty[i];
          if (Math.abs(x + 0.5 - camera.x) > vx || Math.abs(y + 0.5 - camera.y) > vy) continue;
          const f = 1 - age[i] / FRESH_LIFE, a = FRESH_ALPHA * f * f;
          ctx.strokeStyle = ctx.fillStyle = `rgba(226,212,180,${a.toFixed(3)})`;
          ctx.beginPath();
          let any = false;
          for (let k = 0; k < 4; k++) {
            const nx = x + DX[k], ny = y + DY[k];
            if (tileAt(nx, ny) === 0) continue;
            const trim = 0.14; // stops short of the corners, where the traced rim rounds off
            let ax, ay, bx, by;
            if (k < 2) { const fx = k === 0 ? x : x + 1; ax = bx = fx; ay = y + trim; by = y + 1 - trim; }
            else { const fy = k === 2 ? y : y + 1; ay = by = fy; ax = x + trim; bx = x + 1 - trim; }
            ctx.moveTo(hw + (ax - camera.x) * ppu, hh + (ay - camera.y) * ppu);
            ctx.lineTo(hw + (bx - camera.x) * ppu, hh + (by - camera.y) * ppu);
            any = true;
            // two chips inside the neighbour, at fixed hashed spots along the face
            for (let c = 0; c < 2; c++) {
              const h = ((nx * 73856093) ^ (ny * 19349663) ^ (c * 83492791)) >>> 0;
              const along = 0.2 + (h % 600) / 1000, depth = 0.1 + ((h >>> 10) % 160) / 1000;
              const px = k < 2 ? (k === 0 ? x - depth : x + 1 + depth) : x + along, py = k < 2 ? y + along : (k === 2 ? y - depth : y + 1 + depth);
              ctx.fillRect(hw + (px - camera.x) * ppu - chip / 2, hh + (py - camera.y) * ppu - chip / 2, chip, chip * 0.7);
            }
          }
          if (any) ctx.stroke();
        }
        ctx.restore();
      }
      if (nHaze) {
        const img = hazeImage();
        if (img) {
          const ga = ctx.globalAlpha;
          for (let i = 0; i < HAZE_CAP; i++) {
            if (!hon[i]) continue;
            if (Math.abs(hx[i] - camera.x) > vx + 2 || Math.abs(hy[i] - camera.y) > vy + 2) continue;
            const t = hage[i] / hlife[i], a = Math.min(1, t * 6) * (1 - t) * 0.2;
            const r = hr[i] * (1 + t * 0.5) * ppu;
            ctx.globalAlpha = a;
            ctx.drawImage(img, hw + (hx[i] - camera.x) * ppu - r, hh + (hy[i] - camera.y) * ppu - r, r * 2, r * 2);
          }
          ctx.globalAlpha = ga;
        }
      }
    },
    count() { return nFresh; },
    hazeCount() { return nHaze; },
    /** Age (s) of the fresh entry for tile (x, y), or -1. */
    ageAt(x, y) { for (let i = 0; i < FRESH_CAP; i++) if (live[i] && tx[i] === x && ty[i] === y) return age[i]; return -1; },
    clear() { live.fill(0); hon.fill(0); nFresh = nHaze = 0; head = hhead = 0; },
  };
}
