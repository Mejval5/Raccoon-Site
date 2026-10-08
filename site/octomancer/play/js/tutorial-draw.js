// The tutorial's signs (data/tutorial.json prompts with `sign: [tx, ty]` and a short `label`): a small wooden plank on a post
// standing on the floor under tile (tx, ty), drawn like the hub's shortcut plank (v2-draw.js). The sign whose prompt is
// showing (the octopus within its radius) leans in a little and is lit; the words themselves are in the prompt banner.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {Array<{sign?:number[], label?:string, x:number, y:number, r:number}>} prompts
 */
export function drawTutorialSigns(ctx, camera, cw, ch, prompts, ox, oy, time) {
  if (!prompts || !prompts.length) return;
  const ppu = camera.pxPerUnit;
  ctx.save();
  ctx.font = `700 ${Math.max(10, Math.round(ppu * 0.27))}px Quicksand, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  let best = -1, bd = 1e9;
  for (let i = 0; i < prompts.length; i++) { const p = prompts[i], d = Math.hypot(ox - p.x, oy - p.y); if (d < p.r && d < bd) { bd = d; best = i; } }
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    if (!p.sign || !p.label) continue;
    const bx = cw / 2 + (p.sign[0] + 0.5 - camera.x) * ppu;
    const floor = ch / 2 + (p.sign[1] + 1 - camera.y) * ppu;
    if (bx < -ppu * 2 || bx > cw + ppu * 2 || floor < -ppu * 2 || floor > ch + ppu * 3) continue;
    const lit = i === best;
    const tw = ctx.measureText(p.label).width, pw = tw + ppu * 0.36, ph = ppu * 0.42;
    const signY = floor - ppu * 0.78;
    const sway = Math.sin(time * 1.1 + i * 1.9) * 0.02 + (lit ? 0.05 : 0);
    // the post
    const postW = Math.max(2, ppu * 0.08);
    ctx.fillStyle = '#6b4a22'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = Math.max(1, ppu * 0.03);
    ctx.fillRect(bx - postW / 2, signY, postW, floor - signY);
    ctx.strokeRect(bx - postW / 2, signY, postW, floor - signY);
    // the plank
    ctx.save();
    ctx.translate(bx, signY);
    ctx.rotate(sway);
    if (lit) { ctx.shadowColor = 'rgba(190, 255, 220, 0.75)'; ctx.shadowBlur = ppu * 0.35; }
    ctx.fillStyle = lit ? '#d9ad6c' : '#b98a4f';
    ctx.lineWidth = Math.max(2, ppu * 0.05);
    ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ppu * 0.08); ctx.fill();
    ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = '#3a2410';
    ctx.fillText(p.label, 0, 1);
    ctx.restore();
  }
  ctx.restore();
}
