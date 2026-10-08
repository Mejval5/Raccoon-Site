// The offering altar on a level (altar.js rules, altar-draw.js art): placement, the per-step offering check, what each
// lit hollow pays, the anger, the first-meeting sign and its prompt. main.js only calls into this (setup / step / blast /
// draw / prompt) through `g`, a small object of getters and actions it owns, so the altar stays out of main.js's way.
//
//   g = { world(), octo(), run(), corpses(), kindName(id), enemies(), keepers(), keeperDead,
//         found(id) -> journal entry already discovered, discover(id), bump(id, stat), statCollected, statAngered,
//         toast(text, ms), heal() -> true if a heart was healed, jarFull() -> bool, fillJar(), canCarry(id), giveItem(id) -> bool,
//         itemName(id), spawnEnemy(kind, x, y), puff(x, y, colour), bubble(x, y), shake(px), chime(), thud(),
//         avoid(x, y) -> true when another set piece / hazard / the shop / the exit is too close, forced -> ?altar=1 }

import { createAltar, stepAltar, altarBlast, findAltarSpot, altarLevel, altarItem, ANGER_SPAWN, SIGN_R } from './altar.js';
import { drawAltar } from './altar-draw.js';
import { drawTutorialSigns } from './tutorial-draw.js';
import { MAT_ROCK, MAT_BEDROCK } from './materials.js';

export const ALTAR_JOURNAL = 'place-altar';
const SEE_R = 9; // tiles: met (journal) this close

export function createAltarLevel(g) {
  const self = {
    altar: null,
    sign: null,     // [{sign: [tx, ty], label, x, y, r}] for drawTutorialSigns, or null
    met: false,
    gifts: [],      // what it has paid this level (tests)
    /** A new level: maybe place this dive's altar. `levelNum` = run.level, first / last = the dive's Shallows levels. */
    setup(levelNum, first, last, seed) {
      self.altar = null; self.sign = null; self.met = false; self.gifts = [];
      if (levelNum < 0) return null;
      const run = g.run();
      const lvl = g.forced ? levelNum : altarLevel(run.diveSeed >>> 0, first, last);
      if (lvl !== levelNum) return null;
      const w = g.world();
      const stone = (tx, ty) => { const m = w.tileAt(tx, ty); return m === MAT_ROCK || m === MAT_BEDROCK; }; // natural stone only
      const solid = (x, y) => w.isSolid(x, y);
      const isNew = !g.found(ALTAR_JOURNAL);
      const signed = (x, y) => g.avoid(x, y) || !signSpot(x, y); // the first one ever met: a floor with room for its sign
      const p = (isNew && findAltarSpot(solid, w.startX, w.startY, 10, 60, signed, 20000, stone))
        || findAltarSpot(solid, w.startX, w.startY, 10, 60, g.avoid, 20000, stone);
      if (!p) return null;
      return self.place(p.x, p.y, seed);
    },
    /** Put the altar with its centre at x on the floor y (tests move it next to the octopus). */
    place(x, y, seed = 0) {
      const first = !g.found(ALTAR_JOURNAL);
      self.altar = createAltar(x, y, first, seed);
      self.gifts = [];
      self.sign = null;
      self.met = false;
      if (first) self.sign = signFor(x, y);
      const w = g.world();
      if (w.addPlantKeepOut) w.addPlantKeepOut(Math.floor(x) - 2, Math.floor(y) - 3, Math.floor(x) + 3, Math.floor(y) + 1); // no foliage over the stone
      return self.altar;
    },
    step(dt) {
      const a = self.altar;
      if (!a) return;
      const o = g.octo();
      if (!self.met && Math.hypot(o.x - a.x, o.y - a.y) < SEE_R) { self.met = true; g.discover(ALTAR_JOURNAL); }
      const evs = stepAltar(a, dt, { corpses: g.corpses(), kindName: g.kindName, enemies: g.enemies(), keepers: g.keepers(), keeperDead: g.keeperDead });
      for (const ev of evs) handle(ev);
    },
    blast(x, y, r) {
      const a = self.altar;
      if (a && altarBlast(a, x, y, r)) for (const ev of a.events.splice(0)) handle(ev);
    },
    draw(ctx, camera, cw, ch, t) {
      const a = self.altar;
      if (!a) return;
      drawAltar(ctx, camera, cw, ch, a, t);
      if (self.sign) { const o = g.octo(); drawTutorialSigns(ctx, camera, cw, ch, self.sign, o.x, o.y, t); }
    },
    /** The first-meeting prompt {title, desktop, touch} while the octopus is by the sign's altar, or null. */
    prompt() {
      const a = self.altar;
      if (!a || !self.sign) return null;
      const o = g.octo();
      if (Math.hypot(o.x - a.x, o.y - (a.y - 1)) > SIGN_R) return null;
      if (a.angry) return { title: 'The altar is angry', desktop: 'It will take nothing more here.', touch: 'It will take nothing more here.' };
      return {
        title: 'An offering altar',
        desktop: 'Lay a body on the stone: grab it with F or middle click, then drop or throw it here. Each hollow that lights is a gift. Never a person, never a bomb.',
        touch: 'Lay a body on the stone: Grab it, then drop or Throw it here. Each hollow that lights is a gift. Never a person, never a bomb.',
      };
    },
    snapshot() {
      const a = self.altar;
      return a ? { x: a.x, y: a.y, favour: a.favour, tier: a.tier, angry: a.angry, why: a.why, offerings: a.offerings, sign: !!self.sign, glow: a.glow.slice(), gifts: self.gifts.slice() } : null;
    },
  };

  /** A plank beside the stone where the floor carries one (left first), else none (the prompt still shows). */
  function signSpot(x, y) {
    const w = g.world();
    for (const dx of [-2, 2, -3, 3]) {
      const tx = Math.floor(x + dx), ty = Math.floor(y) - 1;
      if (w.isSolid(tx + 0.5, ty + 1.5) && !w.isSolid(tx + 0.5, ty + 0.5) && !w.isSolid(tx + 0.5, ty - 0.5)) return [tx, ty];
    }
    return null;
  }
  function signFor(x, y) {
    const s = signSpot(x, y);
    return [s ? { sign: s, label: 'Offerings', x, y: y - 1, r: SIGN_R } : { x, y: y - 1, r: SIGN_R }];
  }

  function handle(ev) {
    const a = self.altar;
    const cy = a.y - 1.2;
    if (ev.type === 'offer') {
      g.bump(ALTAR_JOURNAL, g.statCollected);
      g.bubble(a.x, cy); g.bubble(a.x - 0.3, cy + 0.1); g.bubble(a.x + 0.3, cy);
      g.thud();
      if (ev.value === 0) g.toast('The altar takes it, but it is not enough', 1800);
    } else if (ev.type === 'gift') {
      self.gifts.push(ev.gift);
      g.chime();
      if (ev.gift === 'heart') {
        if (g.heal()) g.toast('The altar is pleased: a heart', 2400);
        else { g.fillJar(); g.toast('The altar is pleased: fish juice', 2400); }
      } else if (ev.gift === 'juice') {
        if (!g.jarFull()) { g.fillJar(); g.toast('The altar is pleased: the jar fills', 2400); }
        else { g.heal(); g.toast('The altar is pleased', 2400); }
      } else if (ev.gift === 'item') {
        const id = altarItem(a, g.canCarry);
        if (id && g.giveItem(id)) g.toast('The altar gives you the ' + g.itemName(id), 3200);
        else { g.heal(); g.fillJar(); g.toast('The altar is pleased: you feel whole', 2600); }
      }
    } else if (ev.type === 'anger') {
      g.bump(ALTAR_JOURNAL, g.statAngered);
      g.toast(ev.why === 'bomb' ? 'You bombed the altar. It is angry!' : 'A person on the altar! It is angry!', 3000);
      g.shake(8);
      g.puff(a.x, cy, '#7a5a44'); g.puff(a.x - 0.8, cy + 0.3, '#6b4c3a'); g.puff(a.x + 0.8, cy + 0.3, '#6b4c3a');
      for (let i = 0; i < ANGER_SPAWN.n; i++) g.spawnEnemy(ANGER_SPAWN.kind, a.x + (i - (ANGER_SPAWN.n - 1) / 2) * 0.9, a.y - 2.5);
    }
  }
  return self;
}
