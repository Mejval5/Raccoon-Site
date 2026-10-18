// Local co-op Phase 2 (octomancer-web/MULTIPLAYER-PLAN.md decisions 5 and 6): ghost.js, the ghost of a dead player. Its float,
// the blow's cooldown and cone, the freeze's charge, cast, cancel and cooldown, the freeze target pick, the bounds; and the
// enemies.js side: a frozen creature holds still and does not bite, a hit still lands, a blow drifts it without a stun.
import { GHOST, createGhost, stepGhost, freezeDone, chargeOf, blowFactor, pickFreeze, clampGhost } from '../js/ghost.js';
import { createEnemies } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { createHazards, makeHazardRecord } from '../js/hazards.js';
import { createCreatures, makeCreatureRecord, TN_GRAB } from '../js/creatures.js';

/** Fake world from rows ('#' rock), enough for hazards.js and creatures.js. */
function fake(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  const world = {
    w, h, tiles, placed: [],
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
    placeRock(x, y) { if (tiles[y * w + x] !== 0) return false; tiles[y * w + x] = 1; world.placed.push([x, y]); return true; },
  };
  return world;
}
const room = (w, h) => Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));

const STEP = 1 / 50;
function run(g, n, mx, my, blow, use) { let blew = 0, cast = 0, cancelled = 0; for (let i = 0; i < n; i++) { stepGhost(g, mx, my, blow, use, STEP); blew += g.blew; cast += g.cast; cancelled += g.cancelled; } return { blew, cast, cancelled }; }

export async function runGhostTests(assert) {
  // --- the float: free movement, a little slower than a live octopus (6 u/s), no collision of its own
  {
    const g = createGhost(10, 10);
    run(g, 100, 1, 0, false, false);
    assert('ghost: the stick floats it (2 s right: about 9 tiles)', g.x > 17 && g.x < 20.5 && Math.abs(g.vx - GHOST.speed) < 0.05);
    assert('ghost: a little slower than a live octopus (top speed under 6 u/s)', GHOST.speed < 6 && GHOST.speed > 4);
    run(g, 100, 0, 0, false, false);
    assert('ghost: it drifts to a stop with the stick let go', Math.abs(g.vx) < 0.01 && Math.abs(g.vy) < 0.01);
    const x = g.x; run(g, 50, -1, 1, false, false);
    assert('ghost: diagonal input is not faster than straight', Math.hypot(g.vx, g.vy) <= GHOST.speed + 1e-6 && g.x < x && g.face === -1);
  }
  // --- blow: one at once, then the 0.6 s cooldown (held: one each refill)
  {
    const g = createGhost(0, 0);
    let r = run(g, 1, 0, 0, true, false);
    assert('ghost: the jet button blows at once', r.blew === 1 && g.puff > 0 && Math.abs(g.blowCd - GHOST.blowCd) < 1e-9);
    r = run(g, 29, 0, 0, true, false);
    assert('ghost: held, no second blow before the cooldown (0.58 s)', r.blew === 0);
    r = run(g, 1, 0, 0, true, false);
    assert('ghost: held, the next blow on the refill (0.6 s)', r.blew === 1);
    assert('ghost: blow cooldown about 0.6 s', Math.abs(GHOST.blowCd - 0.6) < 1e-9);
  }
  // --- the blow cone
  {
    assert('cone: straight ahead in range: a full-ish push', blowFactor(0, 0, 1, 0, 1, 0) > 0.75);
    assert('cone: the far end is softer than the mouth', blowFactor(0, 0, 1, 0, 2.6, 0) < blowFactor(0, 0, 1, 0, 0.8, 0) && blowFactor(0, 0, 1, 0, 2.6, 0) >= 0.5);
    assert('cone: past the range: nothing', blowFactor(0, 0, 1, 0, GHOST.blowRange + 0.5, 0) === 0);
    assert('cone: a big thing whose edge is in range counts', blowFactor(0, 0, 1, 0, GHOST.blowRange + 0.3, 0, 0.5) > 0);
    assert('cone: behind: nothing', blowFactor(0, 0, 1, 0, -1, 0) === 0);
    assert('cone: 60 degrees off the aim: nothing (a short, narrow cone)', blowFactor(0, 0, 1, 0, Math.cos(1.05) * 1.5, Math.sin(1.05) * 1.5) === 0);
    assert('cone: 25 degrees off the aim: inside', blowFactor(0, 0, 1, 0, Math.cos(0.44) * 1.5, Math.sin(0.44) * 1.5) > 0);
    assert('cone: right on top of the ghost: inside', blowFactor(0, 0, 1, 0, -0.1, 0.1) > 0);
  }
  // --- freeze: hold 2.5 s to charge, let go to cast; early let-go cancels; the 10 s cooldown
  {
    const g = createGhost(0, 0);
    let r = run(g, 50, 0, 0, false, true);
    assert('freeze: 1 s held: charging, ring 40% full, nothing cast', g.charging && Math.abs(chargeOf(g) - 0.4) < 0.02 && r.cast === 0);
    r = run(g, 1, 0, 0, false, false);
    assert('freeze: let go early: cancelled, no cast, no cooldown, ring empty', r.cancelled === 1 && r.cast === 0 && g.freezeCd === 0 && chargeOf(g) === 0);
    r = run(g, 125, 0, 0, false, true);
    assert('freeze: 2.5 s held: full charge, still waiting for the release', Math.abs(chargeOf(g) - 1) < 1e-6 && r.cast === 0);
    r = run(g, 50, 0, 0, false, true);
    assert('freeze: held longer: the full charge waits', Math.abs(chargeOf(g) - 1) < 1e-6 && r.cast === 0);
    r = run(g, 1, 0, 0, false, false);
    assert('freeze: let go with a full charge: cast', r.cast === 1 && !g.charging);
    freezeDone(g);
    assert('freeze: a creature froze: the 10 s cooldown', Math.abs(g.freezeCd - GHOST.freezeCd) < 1e-9 && Math.abs(GHOST.freezeCd - 10) < 1e-9);
    r = run(g, 200, 0, 0, false, true);
    assert('freeze: held during the cooldown: no charge', !g.charging && chargeOf(g) === 0 && r.cast === 0);
    r = run(g, 350, 0, 0, false, true);
    assert('freeze: still held as the cooldown ends: no charge until a fresh press', g.freezeCd === 0 && !g.charging);
    run(g, 1, 0, 0, false, false);
    r = run(g, 125, 0, 0, false, true); r = run(g, 1, 0, 0, false, false);
    assert('freeze: after the cooldown a fresh 2.5 s charge casts again', r.cast === 1);
    assert('freeze: charge 2.5 s, freeze 3 s, reach 4 tiles', GHOST.chargeS === 2.5 && GHOST.freezeS === 3 && GHOST.freezeReach === 4);
  }
  // --- the freeze target
  {
    const list = [{ kind: 'piranha', x: 3.5, y: 0 }, { kind: 'crab', x: 2, y: 1 }, { kind: 'beholder', x: 0.5, y: 0 }, { kind: 'piranha', x: 1, y: 0, dead: true }, { kind: 'urchin', x: 0, y: 5 }];
    assert('freeze target: the nearest live creature in reach (not the Beholder, not the dead)', pickFreeze(0, 0, list) === list[1]);
    assert('freeze target: nothing within 4 tiles: none', pickFreeze(20, 20, list) === null);
  }
  // --- bounds
  {
    const g = createGhost(5, 5); g.vx = -3; g.vy = 3;
    clampGhost(g, 6, 0, 10, 4);
    assert('ghost: kept inside the box, the velocity into the edge dropped', g.x === 6 && g.y === 4 && g.vx === 0 && g.vy === 0);
  }
  // --- enemies.js: a frozen piranha holds still and does not bite; a hit lands; it thaws after GHOST.freezeS
  {
    const en = createEnemies();
    const world = { isSolid: () => false, tileAt: () => 0, tileVersion: 0, width: 200, height: 200 };
    const e = en.spawnAt('piranha', 50, 50, 'open');
    const o = createOctopus(50.3, 50);
    const hearts = o.hearts;
    assert('enemies: freeze takes a live piranha', en.freeze(e, GHOST.freezeS) && e.frozen === GHOST.freezeS);
    const x0 = e.x, y0 = e.y;
    for (let i = 0; i < 100; i++) en.update(STEP, 10 + i * STEP, o, world, []);
    assert('enemies: frozen 2 s: it has not moved and has not bitten the octopus touching it', e.x === x0 && e.y === y0 && o.hearts === hearts && e.frozen > 0.9);
    const dealt = en.applyHit(e, 'ink', e.x - 1, e.y, 1);
    assert('enemies: a hit on the frozen creature lands as usual', dealt > 0 && (e.dead || e.hitFlash > 0));
    if (e.dead) { e.dead = false; e.hitFlash = 0; }
    for (let i = 0; i < 60; i++) en.update(STEP, 12 + i * STEP, o, world, []);
    assert('enemies: after 3 s it has thawed', !(e.frozen > 0));
    assert('enemies: the Beholder never freezes', !en.freeze({ kind: 'beholder', x: 0, y: 0 }, 3));
  }
  // --- enemies.js: a blow drifts a piranha with no stun and no damage; an emplacement does not budge
  {
    const en = createEnemies();
    const world = { isSolid: () => false, tileAt: () => 0, tileVersion: 0, width: 200, height: 200 };
    const e = en.spawnAt('piranha', 50, 50, 'open'), twin = en.spawnAt('piranha', 50, 80, 'open'); // the twin is not blown
    const far = createOctopus(150, 150);
    const hp0 = e.hp;
    for (const q of [e, twin]) { q.dir = q.face = 1; q.flipCd = 5; q.t = 5; }
    assert('enemies: a blow nudges a piranha', en.nudge(e, 1, 0, 3));
    const x0 = e.x, t0 = twin.x;
    for (let i = 0; i < 10; i++) en.update(STEP, 10 + i * STEP, far, world, []);
    assert('enemies: blown: it drifts along the blow (beyond its own swim), no stun, no damage', (e.x - x0) - (twin.x - t0) > 0.2 && !(e.stun > 0) && e.hp === hp0);
    const u = en.spawnAt('urchin', 60, 50, 'floor');
    assert('enemies: an urchin on its rock does not budge', !en.nudge(u, 1, 0, 3));
  }
  // --- Phase 1 holes: a boulder hits every octopus under it (one hit each per drop); a held octopus cannot be grabbed again
  {
    const rows = ['##########', '#..#.....#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '##########'];
    const w = fake(rows);
    const hz = createHazards();
    hz.add(makeHazardRecord('rock', 4.5, 1.5, 0, 1, w.tiles, w.w, w.h));
    const a = createOctopus(4.15, 7.0), b = createOctopus(4.85, 7.0), both = [a, b];
    for (let i = 0; i < 100; i++) {
      if (hz.data.state[0] < 3) for (const [o, x] of [[a, 4.15], [b, 4.85]]) { if (!o.dead) { o.x = o.prevX = x; o.y = o.prevY = 7.0; o.vx = o.vy = 0; } }
      hz.update(STEP, i * STEP, both, w, null);
      for (const o of both) if (o.invulnTimer > 0) o.invulnTimer = Math.max(0, o.invulnTimer - STEP);
    }
    assert(`boulder (co-op): it hurts both octopi under it (${a.dead ? 'dead' : a.hearts}, ${b.dead ? 'dead' : b.hearts})`, both.every((o) => o.dead || o.hearts <= 2));
    assert('boulder (co-op): one hit each per drop', both.every((o) => o.dead || o.hearts === 2));
  }
  {
    const w = fake(room(12, 12));
    const rec = makeCreatureRecord('tentacle', 6.5, 10.5, 0, -1, w.tiles, w.w, w.h);
    rec.tilt = 0;
    const cr = createCreatures(); cr.add(rec);
    const held = createOctopus(6.5, 8.2), other = createOctopus(2.5, 1.6), list = [held, other];
    held.held = 1; // another tentacle has this one
    let grabbed = false;
    for (let i = 0; i < 300; i++) {
      held.x = held.prevX = 6.5; held.y = held.prevY = 8.2; held.vx = held.vy = 0; held.held = 1;
      other.x = other.prevX = 2.5; other.y = other.prevY = 1.6; other.vx = other.vy = 0;
      cr.update(STEP, list, w, null);
      if (cr.data.state[0] === TN_GRAB || cr.events.some((e) => e.type === 'grab')) grabbed = true;
    }
    assert('tentacle (co-op): an octopus another tentacle holds is not grabbed a second time', !grabbed);
  }
}
