// Enemy + bomb art and particle rendering. OVERNIGHT.md §4 M3-3.
// Urchin/piranha/cannon/shot/Beholder are Milan's sprites, exported to
// display size in play/assets/ (web/ASSETS.md has the source rows); the bomb
// itself, its fuse spark, the explosion ring and debris are code-drawn
// (OVERNIGHT.md §2 art rule: "Drawn in code ... bomb ... explosion,
// particles").

const ASSET = (name) => new URL(`../assets/${name}`, import.meta.url).href;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const urchinImg = loadImage(ASSET('enemy-urchin.webp'));
const piranhaImg = loadImage(ASSET('enemy-piranha.webp'));
const cannonImg = loadImage(ASSET('enemy-cannon.webp'));
const shotImg = loadImage(ASSET('enemy-shot.webp'));
const beholderFrames = [0, 1, 2, 3, 4, 5].map((i) => loadImage(ASSET(`enemy-beholder-${i}.webp`)));

function ready(img) { return img.complete && img.naturalWidth > 0; }

/** Draw one image centered at world (x,y), sized to `worldSize` units tall
 * (width follows the image's own aspect ratio), tinted red briefly on hit. */
function drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, img, x, y, worldSize, angle, hitFlash) {
  if (!ready(img)) return;
  const s = worldToScreen(camera, canvasW, canvasH, x, y);
  const h = worldSize * camera.pxPerUnit;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.translate(s.x, s.y);
  if (angle) ctx.rotate(angle);
  if (hitFlash > 0) {
    ctx.filter = `brightness(${1 + hitFlash * 2}) saturate(${1 - hitFlash * 0.6})`;
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export function drawEnemies(ctx, camera, worldToScreen, canvasW, canvasH, enemies, shots, time) {
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.kind === 'urchin') {
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, urchinImg, e.x, e.y, 0.9, 0, e.hitFlash);
    } else if (e.kind === 'piranha') {
      const angle = e.vx || e.vy ? Math.atan2(e.vy, e.vx) : 0;
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, piranhaImg, e.x, e.y, 0.7, angle, e.hitFlash);
    } else if (e.kind === 'cannon') {
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, cannonImg, e.x, e.y, 0.9, 0, e.hitFlash);
    } else if (e.kind === 'beholder') {
      const frame = beholderFrames[Math.floor(time * 8) % beholderFrames.length];
      const pulse = 1 + Math.sin(time * 6) * 0.04;
      drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, frame, e.x, e.y, 1.6 * pulse, 0, 0);
      // Dread: a soft light cone toward the octopus grows as it nears (M7
      // will tune this further; a first cut lands here since the Beholder is
      // brand-new this milestone).
    }
  }
  for (const s of shots) {
    if (s.dead) continue;
    const angle = Math.atan2(s.vy, s.vx);
    drawSprite(ctx, camera, worldToScreen, canvasW, canvasH, shotImg, s.x, s.y, 0.4, angle, 0);
  }
}

/** Code-drawn bomb: a dark shell with a lit fuse spark; once exploded, an
 * expanding ring shockwave for its brief lingering frame. */
export function drawBombs(ctx, camera, worldToScreen, canvasW, canvasH, bombs, time) {
  for (const b of bombs) {
    const s = worldToScreen(camera, canvasW, canvasH, b.x, b.y);
    const r = camera.pxPerUnit * 0.32;
    if (!b.exploded) {
      ctx.save();
      ctx.fillStyle = '#20262c';
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0a0d10';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Fuse spark: blinks faster as the fuse runs down.
      const blinkRate = 4 + (1 - b.fuse) * 8;
      const lit = Math.sin(time * blinkRate * Math.PI) > 0;
      ctx.fillStyle = lit ? '#ffd94a' : '#a05a1a';
      ctx.beginPath(); ctx.arc(s.x, s.y - r * 1.1, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      const t = b.age / 0.4; // 0..1 over the lingering window
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = '#ffdca0';
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, camera.pxPerUnit * 2.5 * Math.min(1, t * 2.2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawParticles(ctx, camera, worldToScreen, canvasW, canvasH, particlePool) {
  for (const p of particlePool) {
    if (!p.active) continue;
    const s = worldToScreen(camera, canvasW, canvasH, p.x, p.y);
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const r = p.size * camera.pxPerUnit * alpha;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
