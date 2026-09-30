// v2 world markers drawn in code (no new art this round): the glowing exit / dive ring and
// the hub's journal board. Called from render.js through its `extraDraw` hook, in device
// pixels, after enemies and bombs and before the octopus.

const TAU = Math.PI * 2;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {number} cw canvas width (px)
 * @param {number} ch canvas height (px)
 * @param {{exitX:number, exitY:number, boardX:number, boardY:number, label:string}} m tile coords; boardX < 0 means none
 * @param {number} time seconds
 */
export function drawV2Marks(ctx, camera, cw, ch, m, time) {
  const ppu = camera.pxPerUnit;
  const sx = (wx) => cw / 2 + (wx - camera.x) * ppu;
  const sy = (wy) => ch / 2 + (wy - camera.y) * ppu;

  // --- exit ring: soft glow plus three slowly turning ellipses ---
  const ex = sx(m.exitX + 0.5), ey = sy(m.exitY + 0.5);
  if (ex > -ppu * 3 && ex < cw + ppu * 3 && ey > -ppu * 3 && ey < ch + ppu * 3) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
    const r = ppu * (1.0 + 0.08 * pulse);
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 2.1);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.5, 'rgba(160,255,235,0.3)');
    g.addColorStop(1, 'rgba(90,230,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ex, ey, r * 2.1, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(2, ppu * 0.09);
    for (let i = 0; i < 3; i++) {
      const a = time * (0.7 + i * 0.25) + i * 1.3;
      const rx = r * (1 - i * 0.2), ry = r * (0.45 + 0.4 * Math.abs(Math.cos(a))) * (1 - i * 0.15);
      // dark under-stroke so the ring reads against the bright water, then a white core
      ctx.lineWidth = Math.max(4, ppu * 0.15);
      ctx.strokeStyle = 'rgba(8,70,84,0.55)';
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, a, 0, TAU); ctx.stroke();
      ctx.lineWidth = Math.max(2, ppu * 0.08);
      ctx.strokeStyle = `rgba(255,255,255,${0.98 - i * 0.15})`;
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, a, 0, TAU); ctx.stroke();
    }
    if (m.label) {
      ctx.font = `700 ${Math.max(11, Math.round(ppu * 0.4))}px Quicksand, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,20,34,0.8)';
      ctx.strokeText(m.label, ex, ey - r * 1.9);
      ctx.fillStyle = '#baffea';
      ctx.fillText(m.label, ex, ey - r * 1.9);
    }
  }

  // --- journal board: a wooden plank on the wall ---
  if (m.boardX >= 0) {
    const bx = sx(m.boardX + 0.5), by = sy(m.boardY + 0.5 - 0.15);
    const w = ppu * 2.0, h = ppu * 1.35;
    if (bx > -w && bx < cw + w && by > -h && by < ch + h) {
      ctx.fillStyle = '#7a5530';
      ctx.fillRect(bx - w / 2, by - h / 2, w, h);
      ctx.strokeStyle = '#3a2410';
      ctx.lineWidth = Math.max(2, ppu * 0.07);
      ctx.strokeRect(bx - w / 2, by - h / 2, w, h);
      ctx.fillStyle = '#e9d6a4';
      ctx.fillRect(bx - w * 0.42, by - h * 0.38, w * 0.84, h * 0.76);
      ctx.fillStyle = '#3a2410';
      ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.34))}px Quicksand, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Journal', bx, by - h * 0.05);
      ctx.fillStyle = 'rgba(58,36,16,0.5)';
      ctx.fillRect(bx - w * 0.3, by + h * 0.18, w * 0.6, Math.max(1, ppu * 0.04));
      ctx.fillRect(bx - w * 0.3, by + h * 0.28, w * 0.45, Math.max(1, ppu * 0.04));
    }
  }
}
