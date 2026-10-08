// Drawing a calm person who stays about (owners round 3, quests rework): Marlo after you freed him, Pip about his open cage, Quill
// on a dig, the pool host, and the visitors who come back later in the dive (Pip's mother too). One entry point over the existing
// drawings (v2-props-draw.js, pool-draw.js): it faces them (`face` +1 right, -1 left: every sprite is painted facing right, as
// npcs-draw.js assumes) and lifts them for the jump at a nearby blast (idle.js idleLift).

import { drawDiver, drawCritter, drawCollector } from './v2-props-draw.js';
import { drawPoolHost } from './pool-draw.js';

/**
 * @param {string} npc 'marlo' | 'pip' | 'quill' | 'host'
 * @param {number} x, y the anchor: the feet (Marlo), the floor line (Quill, the host), the centre (Pip)
 * @param {{lantern?:boolean, wave?:boolean}} [opt]
 */
export function drawPerson(ctx, camera, cw, ch, npc, variant, x, y, time, face = 1, lift = 0, opt = {}) {
  const ppu = camera.pxPerUnit, ay = y - lift;
  const sx0 = cw / 2 + (x - camera.x) * ppu, sy0 = ch / 2 + (ay - camera.y) * ppu;
  if (sx0 < -ppu * 4 || sx0 > cw + ppu * 4 || sy0 < -ppu * 4 || sy0 > ch + ppu * 5) return;
  if (npc === 'host') { drawPoolHost(ctx, camera, cw, ch, { plan: { x: x + 1.7, floorY: ay - 1 }, state: 0 }, time, x + face); return; }
  ctx.save();
  if (face < 0) { ctx.translate(sx0, sy0); ctx.scale(-1, 1); ctx.translate(-sx0, -sy0); }
  if (npc === 'marlo') drawDiver(ctx, camera, cw, ch, x, ay, time, !!opt.wave, false); // waves while he talks
  else if (npc === 'quill') drawCollector(ctx, camera, cw, ch, x, ay, time, !!opt.lantern, lift < 0.05);
  else drawCritter(ctx, camera, cw, ch, x, ay, true, time, 0, variant || '');
  ctx.restore();
}
