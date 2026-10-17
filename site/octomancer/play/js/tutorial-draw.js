// The tutorial's signs (data/tutorial.json prompts with `sign: [tx, ty]` and a short `label`): a small wooden plank on a post
// standing on the floor under tile (tx, ty), drawn like the hub's shortcut plank (v2-draw.js). Controller Phase 2B: the sign
// the octopus is near unfolds into a board with the whole text, its controls drawn as the scheme's glyphs (signs-draw.js);
// there is no prompt banner any more. This wrapper picks the near sign itself (the altar's sign uses it).

import { drawSigns } from './signs-draw.js';
import { pickPrompt } from './signs.js';

const DESKTOP = { scheme: 'desktop', style: 'xbox' };

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,pxPerUnit:number}} camera
 * @param {Array<{sign?:number[], label?:string, x:number, y:number, r:number}>} prompts
 * @param {{scheme:string, style:string}} [view] the sign scheme (glyphs.js signScheme) and pad style
 */
export function drawTutorialSigns(ctx, camera, cw, ch, prompts, ox, oy, time, view = DESKTOP) {
  if (!prompts || !prompts.length) return;
  drawSigns(ctx, camera, cw, ch, prompts, pickPrompt(prompts, ox, oy), view || DESKTOP, time);
}
