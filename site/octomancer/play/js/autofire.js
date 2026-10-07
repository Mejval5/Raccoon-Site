// ?auto=1 spike: auto-fires the Ink Jet (inkjet.js) at the nearest targetable enemy in line of sight.
// Hazards (urchin, horns) and the Beholder have no hp, so autoAim never picks them and blobs do not hurt them.
import { INKJET, createInkJet, autoAimTarget } from './inkjet.js';

export const INK_RANGE = INKJET.range;
export const INK_DAMAGE = INKJET.damage;
export const INK_COOLDOWN = INKJET.cooldown;
export const INK_SPEED = INKJET.speed;

export function createAutofire() {
  const jet = createInkJet();
  const stats = { shots: 0, hits: 0, kills: 0 };
  let solid = null, solidWorld = null;
  let hurtFn = null, hurtEnemies = null;

  function update(dt, octo, world, enemies) {
    if (solidWorld !== world) { solidWorld = world; solid = (tx, ty) => world.isSolid(tx, ty); }
    if (hurtEnemies !== enemies) { hurtEnemies = enemies; hurtFn = (e, d) => enemies.hurt(e, d); }
    const list = enemies.live();
    // Fire only when something is in reach: the spike never shoots at empty water.
    if (!octo.dead) {
      const t = autoAimTarget(octo, list, solid);
      if (t && jet.fire(octo.x, octo.y, t.x - octo.x, t.y - octo.y, 0)) stats.shots++;
    }
    jet.update(dt, world, list, hurtFn);
    stats.hits += jet.events.hits; stats.kills += jet.events.kills;
  }

  function draw(ctx, camera, worldToScreen, canvasW, canvasH) { jet.draw(ctx, camera, canvasW, canvasH); }

  return { update, draw, stats };
}
