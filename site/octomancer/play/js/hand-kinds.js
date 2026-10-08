// The built-in hand targets (hand.js providers), wired to the live level systems through `env`, an object main.js keeps
// current (a new level makes new props, corpses, loot ...):
//
//   env = { props, corpses, enemies, loot, bombs, shopSt, world, run, onShopEvent(ev), canBuy() }
//
//   'pot'     loot pots and clams (props PK_POT / PK_CLAM with a loot record): weight 0.85, a SHIELD (it breaks instead of
//             the octopus being hurt), smashes when thrown into something
//   'bomb'    any bomb lying about or stuck (not one riding a creature): its fuse keeps running in the hand; thrown, it is a
//             sticky urchin-mine; dropped gently, a heavy bomb again
//   'corpse'  a body (corpses.js): weight 0.7, no shield, thrown it is a club (Spelunky)
//   'creature' a STUNNED live enemy (e.stun > 0): weight 0.7; it wriggles free when its stun runs out and reacts as it does
//   'ware'    a shop ware (priority PRI_BUY): F buys it (shop.js shopBuy); a ware it cannot pay for is lifted (unpaid):
//             leaving the stall with it or throwing it is theft
//
// Talking is registered by main.js (it owns the hub residents and the encounters).

import { registerInteract, PRI_THING, PRI_BUY } from './hand.js';
import { PK_POT, PK_CLAM, PK_BOMB, PS_CARRY, PS_HELD } from './props.js';
import { CS_CARRY } from './corpses.js';
import { ST_INTACT, LK_POT, LK_CLAM } from './loot.js';
import { shopNearestWare, shopBuy, shopGrab, shopLetGo, shopCarryOut, W_HELD } from './shop.js';

export const WEIGHT = { pot: 0.85, bomb: 0.9, corpse: 0.7, creature: 0.7, ware: 0.9 };
export const THROW = { pot: 9, bomb: 9, corpse: 8, creature: 8, ware: 9 };
const FAST2 = 3 * 3; // (u/s)^2: something moving faster than this cannot be grabbed (it is in flight)
export const THROWN_DMG = 4; // one Ink Jet blob's worth (inkjet.js INKJET.damage) per thrown thing

/** A held record for prop i of the props system. */
function propHeld(env, i, kind, extra) {
  const props = env.props, d = props.data;
  props.carry(i);
  const pos = { x: 0, y: 0, vx: 0, vy: 0 };
  return Object.assign({
    r: d.radius[i], weight: WEIGHT[kind], shield: false, speed: THROW[kind], dmg: THROWN_DMG, pid: i,
    place(x, y, vx, vy) { props.place(i, x, y, vx, vy); },
    alive() { return d.alive[i] === 1 && (d.state[i] === PS_CARRY || !this.carried); },
    carried: true,
    release(vx, vy) { this.carried = false; props.release(i); d.vx[i] = vx; d.vy[i] = vy; d.grace[i] = 0.2; },
    pos() { pos.x = d.x[i]; pos.y = d.y[i]; pos.vx = d.vx[i]; pos.vy = d.vy[i]; return pos; },
    bounce(f) { d.vx[i] *= f; d.vy[i] *= f; },
  }, extra);
}

function nearestProp(env, octo, reach, ok) {
  const props = env.props;
  if (!props) return null;
  const d = props.data;
  let best = -1, bd = reach;
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || d.state[i] === PS_CARRY || !ok(i, d)) continue;
    if (d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i] > FAST2) continue; // flying past (just thrown): not a target
    const dd = Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) - d.radius[i] * 0.5;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best < 0 ? null : { x: d.x[best], y: d.y[best], ref: best };
}

export function registerHandKinds(env) {
  // ---- pots and clams (loot records with a prop)
  registerInteract('pot', {
    priority: PRI_THING,
    find(octo, reach) {
      const loot = env.loot;
      if (!loot || !env.props) return null;
      const ld = loot.data;
      return nearestProp(env, octo, reach, (i, d) => (d.kind[i] === PK_POT || d.kind[i] === PK_CLAM) && d.ref[i] >= 0 && d.ref[i] < ld.n
        && ld.pid[d.ref[i]] === i && ld.state[d.ref[i]] === ST_INTACT && (ld.kind[d.ref[i]] === LK_POT || ld.kind[d.ref[i]] === LK_CLAM));
    },
    use(t) {
      const li = env.props.data.ref[t.ref], loot = env.loot;
      return propHeld(env, t.ref, 'pot', {
        shield: true,
        alive() { return loot.data.state[li] === ST_INTACT && env.props.data.alive[t.ref] === 1; },
        onShield() { loot.smash(li, 'shield'); },
        impact() { loot.smash(li, 'throw'); },
      });
    },
  });

  // ---- bombs
  registerInteract('bomb', {
    priority: PRI_THING,
    find(octo, reach) {
      const bombs = env.bombs;
      if (!bombs || !env.props) return null;
      return nearestProp(env, octo, reach, (i, d) => d.kind[i] === PK_BOMB && !!bombs.byProp(i) && !bombs.byProp(i).stickE);
    },
    use(t) {
      const bombs = env.bombs, b = bombs.byProp(t.ref);
      if (!b) return null;
      b.armed = true; // a mine picked off the wall keeps counting
      return propHeld(env, t.ref, 'bomb', {
        alive() { return !b.exploded && b.pid === t.ref && env.props.data.alive[t.ref] === 1; },
        release(vx, vy, thrown) {
          this.carried = false; env.props.release(t.ref);
          const d = env.props.data; d.vx[t.ref] = vx; d.vy[t.ref] = vy; d.grace[t.ref] = 0.25;
          if (thrown) bombs.makeSticky(b); else bombs.makeHeavy(b);
        },
      });
    },
  });

  // ---- corpses
  registerInteract('corpse', {
    priority: PRI_THING,
    find(octo, reach) {
      const c = env.corpses;
      if (!c) return null;
      const d = c.data;
      let best = -1, bd = reach;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i] || d.state[i] === CS_CARRY || d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i] > FAST2) continue;
        const dd = Math.hypot(d.x[i] - octo.x, d.y[i] - octo.y) - d.radius[i] * 0.5;
        if (dd < bd) { bd = dd; best = i; }
      }
      return best < 0 ? null : { x: d.x[best], y: d.y[best], ref: best };
    },
    use(t) {
      const c = env.corpses, d = c.data, i = t.ref, seq = d.seq[i];
      c.carry(i);
      const pos = { x: 0, y: 0, vx: 0, vy: 0 };
      let carried = true;
      return {
        r: d.radius[i], weight: WEIGHT.corpse, shield: false, speed: THROW.corpse, dmg: THROWN_DMG,
        place(x, y, vx, vy) { c.place(i, x, y, vx, vy); },
        alive() { return d.alive[i] === 1 && d.seq[i] === seq && (!carried || d.state[i] === CS_CARRY); },
        release(vx, vy) { carried = false; c.release(i, vx, vy); },
        pos() { pos.x = d.x[i]; pos.y = d.y[i]; pos.vx = d.vx[i]; pos.vy = d.vy[i]; return pos; },
        bounce(f) { d.vx[i] *= f; d.vy[i] *= f; },
      };
    },
  });

  // ---- stunned live creatures
  registerInteract('creature', {
    priority: PRI_THING,
    find(octo, reach) {
      const en = env.enemies;
      if (!en) return null;
      let best = null, bd = reach;
      for (const e of en.all()) {
        if (e.dead || e.ghost || !(e.stun > 0) || !e.moving || e.kind === 'beholder' || e.carried) continue;
        const dd = Math.hypot(e.x - octo.x, e.y - octo.y) - (e.radius || 0.4) * 0.5;
        if (dd < bd) { bd = dd; best = e; }
      }
      return best ? { x: best.x, y: best.y, ref: best } : null;
    },
    use(t) {
      const e = t.ref;
      e.carried = true; e.kvx = e.kvy = 0;
      const pos = { x: 0, y: 0, vx: 0, vy: 0 };
      let carried = true;
      return {
        r: (e.radius || 0.4) * 0.8, weight: WEIGHT.creature, shield: false, speed: THROW.creature, dmg: THROWN_DMG, enemy: e,
        place(x, y, vx, vy) { e.x = x; e.y = y; if (e.prevX !== undefined) { e.prevX = x; e.prevY = y; } e.vx = vx; e.vy = vy; e.kvx = vx; e.kvy = vy; },
        // it wriggles free when its stun is over (stepKnock picks its pattern up again: it reacts as it would)
        alive() { return !e.dead; },
        tick() { if (e.stun <= 0) { carried = false; e.carried = false; e.kvx = e.kvy = 0; return false; } return true; },
        release(vx, vy) { carried = false; e.carried = false; e.kvx = vx; e.kvy = vy; e.stun = Math.max(e.stun, 0.4); },
        pos() { pos.x = e.x; pos.y = e.y; pos.vx = e.kvx; pos.vy = e.kvy; return pos; },
        bounce(f) { e.kvx *= f; e.kvy *= f; },
      };
    },
  });

  // ---- shop wares: F buys (PRI_BUY: over a pot that happens to lie by the pedestal)
  registerInteract('ware', {
    priority: PRI_BUY,
    find(octo, reach) {
      const st = env.shopSt;
      if (!st || !env.props) return null;
      const w = shopNearestWare(st, env.props, octo.x, octo.y, reach);
      return w ? { x: w.x, y: w.y, ref: w.slot, label: w.shelf ? 'buy' : 'take' } : null;
    },
    use(t, octo) {
      const st = env.shopSt, run = env.run, slot = t.ref;
      const ev = shopBuy(st, slot, octo, run.shells, run.items);
      if (ev.type !== 'grab') { env.onShopEvent(ev); return ev.type === 'bought' || ev.type === 'stolen'; }
      // it cannot be paid for: lift it, unpaid (Spelunky: walking out with it is theft)
      const pid = shopGrab(st, env.props, slot);
      if (pid < 0) return null;
      return propHeld(env, pid, 'ware', {
        alive() { return st.ware[slot] === W_HELD && st.pid[slot] === pid && env.props.data.alive[pid] === 1 || (!this.carried && env.props.data.alive[pid] === 1); },
        tick(o) {
          if (env.world && env.world.inShop && !env.world.inShop(o.x, o.y)) { // carried out of the stall: stolen
            this.carried = false;
            const sev = shopCarryOut(st, env.props, slot, o, run.items);
            if (sev) env.onShopEvent(sev);
            return false;
          }
          return true;
        },
        release(vx, vy, thrown) {
          this.carried = false; env.props.release(pid);
          const d = env.props.data; d.vx[pid] = vx; d.vy[pid] = vy; d.grace[pid] = 0.2;
          const sev = shopLetGo(st, slot, thrown, octo);
          if (sev) env.onShopEvent(sev);
        },
      });
    },
  });
}

/** Is prop i held by something (the hand or a creature)? */
export function propCarried(props, i) { return props.data.state[i] === PS_CARRY; }
export { PS_HELD };
