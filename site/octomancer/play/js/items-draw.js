// Code-drawn icons for the carried items (round 32): used by the HUD (small canvases), the shop pedestals and the
// hidden-pocket items. drawItemIcon(ctx, id, cx, cy, r) draws inside a circle of radius r around (cx, cy).

const TAU = Math.PI * 2;

function outline(ctx, r, fill, stroke) {
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1.2, r * 0.16); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}

export function drawItemIcon(ctx, id, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  if (id === 'flippers') {
    // a pair of fins: two leaf shapes side by side
    outline(ctx, r, '#3fc7d9', '#0b3a48');
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.15, r * 0.85);
      ctx.bezierCurveTo(s * r * 0.95, r * 0.45, s * r * 1.05, -r * 0.55, s * r * 0.45, -r * 0.9);
      ctx.bezierCurveTo(s * r * 0.15, -r * 0.55, s * r * 0.05, r * 0.1, s * r * 0.15, r * 0.85);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.6); ctx.lineTo(-r * 0.4, r * 0.35); ctx.moveTo(r * 0.45, -r * 0.6); ctx.lineTo(r * 0.4, r * 0.35); ctx.stroke();
  } else if (id === 'lantern') {
    // a small lantern: ring on top, glass body with a flame
    const g = ctx.createRadialGradient(0, r * 0.1, r * 0.05, 0, r * 0.1, r * 1.1);
    g.addColorStop(0, 'rgba(255,240,160,0.9)'); g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, r * 0.1, r * 1.1, 0, TAU); ctx.fill();
    outline(ctx, r, '#ffd868', '#4a3208');
    ctx.beginPath(); ctx.roundRect(-r * 0.52, -r * 0.4, r * 1.04, r * 1.1, r * 0.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b4a12';
    ctx.fillRect(-r * 0.62, -r * 0.55, r * 1.24, r * 0.2); ctx.fillRect(-r * 0.62, r * 0.62, r * 1.24, r * 0.2);
    ctx.strokeStyle = '#4a3208'; ctx.beginPath(); ctx.arc(0, -r * 0.72, r * 0.3, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.ellipse(0, r * 0.18, r * 0.16, r * 0.3, 0, 0, TAU); ctx.fill();
  } else if (id === 'magnet') {
    // a horseshoe magnet: red arch, pale tips
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#0b1a2a'; ctx.lineWidth = r * 0.78;
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.55, Math.PI, TAU); ctx.lineTo(r * 0.55, r * 0.6); ctx.moveTo(-r * 0.55, -r * 0.05); ctx.lineTo(-r * 0.55, r * 0.6); ctx.stroke();
    ctx.strokeStyle = '#e0453c'; ctx.lineWidth = r * 0.56;
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.55, Math.PI, TAU); ctx.lineTo(r * 0.55, r * 0.35); ctx.moveTo(-r * 0.55, -r * 0.05); ctx.lineTo(-r * 0.55, r * 0.35); ctx.stroke();
    ctx.fillStyle = '#e8eef4'; ctx.strokeStyle = '#0b1a2a'; ctx.lineWidth = Math.max(1, r * 0.1);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(s * r * 0.55 - r * 0.28, r * 0.35, r * 0.56, r * 0.4); ctx.fill(); ctx.stroke(); }
  } else if (id === 'bombbag') {
    // a drawstring pouch with a small bomb in front
    outline(ctx, r, '#b88a52', '#3a2410');
    ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.55); ctx.bezierCurveTo(-r * 1.1, -r * 0.05, -r * 0.95, r * 0.85, 0, r * 0.85);
    ctx.bezierCurveTo(r * 0.95, r * 0.85, r * 1.1, -r * 0.05, r * 0.3, -r * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a6030'; ctx.beginPath(); ctx.roundRect(-r * 0.42, -r * 0.78, r * 0.84, r * 0.3, r * 0.1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#26303a'; ctx.strokeStyle = '#0b1218';
    ctx.beginPath(); ctx.arc(0, r * 0.28, r * 0.36, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.18, r * 0.12, 0, TAU); ctx.fill();
  } else if (id === 'heartcontainer') {
    // a heart in a glass vial
    outline(ctx, r, 'rgba(210,235,255,0.35)', '#9fc4e0');
    ctx.beginPath(); ctx.roundRect(-r * 0.78, -r * 0.8, r * 1.56, r * 1.65, r * 0.5); ctx.fill(); ctx.stroke();
    outline(ctx, r * 0.8, '#ff5a6e', '#5a0f1c');
    const k = r * 0.62;
    ctx.beginPath(); ctx.moveTo(0, k * 0.95);
    ctx.bezierCurveTo(-k * 1.5, -k * 0.05, -k * 0.85, -k * 1.1, 0, -k * 0.4);
    ctx.bezierCurveTo(k * 0.85, -k * 1.1, k * 1.5, -k * 0.05, 0, k * 0.95);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-k * 0.45, -k * 0.3, k * 0.17, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
