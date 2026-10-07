// Ink Jet: aim, cooldown, range, rock stop, hits and kills, hazard / Beholder immunity, auto-aim. Sync.
import { INKJET, createInkJet, autoAim, drawReticle } from '../js/inkjet.js';
import { createEnemies, setHpMode } from '../js/enemies.js';
import { createAutofire } from '../js/autofire.js';

const STEP = 0.02;
const open = { isSolid: () => false };
const wallAt10 = { isSolid: (x, y) => Math.floor(x) === 10 }; // a one-tile-thick vertical wall
const noHurt = () => {};

function run(jet, world, list, hurt, seconds) {
  let hits = 0, kills = 0, splats = 0;
  for (let t = 0; t < seconds - 1e-9; t += STEP) {
    jet.update(STEP, world, list, hurt);
    hits += jet.events.hits; kills += jet.events.kills; splats += jet.events.nSplat;
  }
  return { hits, kills, splats };
}

export function runInkJetTests(assert) {
  try {
    assert('INKJET tuning: range 6.5, speed 13, damage 4, cooldown 0.42, radius 0.16',
      INKJET.range === 6.5 && INKJET.speed === 13 && INKJET.damage === 4 && INKJET.cooldown === 0.42 && INKJET.radius === 0.16);
    assert('INKJET is frozen', Object.isFrozen(INKJET));

    // aim: velocity is the unit direction toward the cursor, spawn is offset by the owner radius
    {
      const jet = createInkJet();
      const ok = jet.fire(5, 5, 8 - 5, 9 - 5, 0.5); // cursor at (8, 9): direction (0.6, 0.8)
      const d = jet.data;
      assert('fire returns true and spawns one blob', ok && jet.count() === 0 && d.alive[0] === 1);
      assert('blob velocity is the unit direction times speed', Math.abs(d.vx[0] - 0.6 * INKJET.speed) < 1e-3 && Math.abs(d.vy[0] - 0.8 * INKJET.speed) < 1e-3);
      assert('blob starts ownerR along the direction', Math.abs(d.x[0] - 5.3) < 1e-4 && Math.abs(d.y[0] - 5.4) < 1e-4);
      jet.update(STEP, open, [], noHurt);
      assert('count() counts the flying blob', jet.count() === 1);
      jet.clear();
      assert('clear() empties the pool and the cooldown', jet.count() === 0 && jet.cooldown() === 0 && jet.fire(0, 0, 1, 0));
      assert('a zero direction does not fire', !createInkJet().fire(0, 0, 0, 0));
    }

    // cooldown
    {
      const jet = createInkJet();
      assert('first shot fires', jet.fire(0, 0, 1, 0));
      assert('second shot straight away fails', !jet.fire(0, 0, 1, 0));
      for (let i = 0; i < 15; i++) jet.update(STEP, open, [], noHurt); // 0.30 s
      assert('still on cooldown after 0.30 s', !jet.fire(0, 0, 1, 0) && jet.cooldown() > 0.1);
      for (let i = 0; i < 7; i++) jet.update(STEP, open, [], noHurt); // 0.44 s
      assert('fires again after the cooldown', jet.fire(0, 0, 1, 0));
      // holding: call fire every step for 2 s
      const h = createInkJet();
      let shots = 0;
      for (let t = 0; t < 2 - 1e-9; t += STEP) { if (h.fire(0, 0, 1, 0)) shots++; h.update(STEP, open, [], noHurt); }
      assert('holding fire for 2 s gives about 5 shots (' + shots + ')', shots >= 4 && shots <= 6);
    }

    // range
    {
      const jet = createInkJet();
      jet.fire(0, 0, 1, 0, 0);
      let maxX = 0, steps = 0;
      while (jet.count() > 0 || steps === 0) { jet.update(STEP, open, [], noHurt); steps++; if (jet.data.alive[0]) maxX = jet.data.x[0]; if (steps > 200) break; }
      assert('a blob in open water disappears after about the range (' + maxX.toFixed(2) + ' tiles)', jet.count() === 0 && maxX > INKJET.range - 0.5 && maxX <= INKJET.range + 0.01);
      assert('range expiry makes no splat', jet.events.nSplat === 0);
    }

    // rock stop, also through a 1-tile wall, also with a big step
    {
      const jet = createInkJet();
      jet.fire(7, 3, 1, 0, 0.5);
      let stopped = false, passed = false, sx = 0, ns = 0;
      for (let i = 0; i < 60; i++) {
        jet.update(STEP, wallAt10, [], noHurt);
        if (jet.events.nSplat > 0) { stopped = true; sx = jet.events.splat[0]; ns = jet.events.nSplat; }
        if (jet.data.alive[0] && jet.data.x[0] >= 10) passed = true;
      }
      assert('a blob fired at a wall stops with a splat at the wall face (x=' + sx.toFixed(2) + ')', stopped && ns === 1 && sx > 9.7 && sx < 10.0);
      assert('the blob never enters the wall and is gone', !passed && jet.count() === 0);
      const big = createInkJet();
      big.fire(9, 3, 1, 0, 0.5);
      big.update(0.2, wallAt10, [], noHurt); // one huge step: 2.6 tiles
      assert('a huge dt cannot tunnel through a 1-tile wall', big.events.nSplat === 1 && big.events.splat[0] < 10.01 && big.count() === 0);
      const inside = createInkJet();
      inside.fire(9.8, 3, 1, 0, 0.5); // spawn spot (10.3) is rock
      inside.update(STEP, wallAt10, [], noHurt);
      assert('a blob spawned inside rock splats at once', inside.events.nSplat === 1 && inside.count() === 0);
    }

    // hits and kills on enemies with hp
    {
      setHpMode(true);
      const en = createEnemies();
      const p = en.spawnAt('piranha', 6, 0);
      const jet = createInkJet();
      const hurt = (e, d) => en.hurt(e, d);
      const list = en.all();
      jet.fire(0, 0, 1, 0, 0.5);
      let r = run(jet, open, list, hurt, 0.6);
      assert('first blob hits the piranha (hp 6 -> 2), no kill yet', r.hits === 1 && r.kills === 0 && p.hp === 2 && !p.dead);
      assert('the hit leaves a splat', r.splats === 1);
      jet.fire(0, 0, 1, 0, 0.5);
      r = run(jet, open, list, hurt, 0.6);
      assert('second blob kills the piranha and counts a kill', r.hits === 1 && r.kills === 1 && p.dead);

      const en2 = createEnemies();
      const c = en2.spawnAt('crab', 5, 0);
      const jet2 = createInkJet();
      let hitsTotal = 0;
      for (let k = 0; k < 4 && !c.dead; k++) {
        jet2.clear(); jet2.fire(0, 0, 1, 0, 0.5);
        r = run(jet2, open, en2.all(), (e, d) => en2.hurt(e, d), 0.6);
        hitsTotal += r.hits;
      }
      assert('a crab (10 hp) takes 3 hits (' + hitsTotal + ')', hitsTotal === 3 && c.dead);

      // a blob that misses a small enemy off the line does not hurt it; one that grazes does
      const en3 = createEnemies();
      const far = en3.spawnAt('piranha', 5, 2);
      const jet3 = createInkJet();
      jet3.fire(0, 0, 1, 0, 0.5);
      run(jet3, open, en3.all(), (e, d) => en3.hurt(e, d), 0.6);
      assert('a blob passing 2 tiles away misses', far.hp === 6);

      // the dead are skipped
      const en4 = createEnemies();
      const d4 = en4.spawnAt('piranha', 3, 0); d4.dead = true;
      const jet4 = createInkJet();
      jet4.fire(0, 0, 1, 0, 0.5);
      r = run(jet4, open, en4.all(), (e, d) => en4.hurt(e, d), 0.6);
      assert('a dead enemy is not hit', r.hits === 0 && d4.hp === 6);

      // hazards and the Beholder are immune: splat, no damage
      const en5 = createEnemies();
      const u = en5.spawnAt('urchin', 4, 0);
      const jet5 = createInkJet();
      jet5.fire(0, 0, 1, 0, 0.5);
      r = run(jet5, open, en5.all(), (e, d) => en5.hurt(e, d), 0.6);
      assert('an urchin has no hp, the blob splats on it, it stays alive', u.hp === undefined && !u.dead && r.hits === 0 && r.splats === 1);
      const en6 = createEnemies();
      const hn = en6.spawnAt('horns', 4, 0);
      const jet6 = createInkJet();
      jet6.fire(0, 0, 1, 0, 0.5);
      r = run(jet6, open, en6.all(), (e, d) => en6.hurt(e, d), 0.6);
      assert('horns are immune: splat, alive, no hp change', hn.hp === undefined && !hn.dead && r.hits === 0 && r.kills === 0 && r.splats === 1);
      const en7 = createEnemies();
      const b = en7.spawnAt('beholder', 4, 0);
      const jet7 = createInkJet();
      jet7.fire(0, 0, 1, 0, 0.5);
      r = run(jet7, open, en7.all(), (e, d) => en7.hurt(e, d), 0.6);
      assert('the Beholder is not damaged or killed, the blob splats on it', !b.dead && b.hp === undefined && r.hits === 0 && r.kills === 0 && r.splats === 1);

      // autoAim
      const en8 = createEnemies();
      const octo = { x: 0, y: 0 };
      const near = en8.spawnAt('piranha', 3, 0);
      en8.spawnAt('crab', 5, 4);
      let a = autoAim(octo, en8.all(), open.isSolid, 1);
      assert('autoAim picks the nearest enemy with hp', Math.abs(a.x - 1) < 1e-6 && Math.abs(a.y) < 1e-6);
      near.dead = true;
      a = autoAim(octo, en8.all(), open.isSolid, 1);
      assert('autoAim skips dead and picks the next', Math.abs(a.x - 5 / Math.hypot(5, 4)) < 1e-6 && Math.abs(a.y - 4 / Math.hypot(5, 4)) < 1e-6);
      const en9 = createEnemies();
      en9.spawnAt('piranha', 4, 0);
      const wall = { isSolid: (x, y) => Math.floor(x) === 2 };
      a = autoAim(octo, en9.all(), wall.isSolid, -1);
      assert('autoAim ignores an enemy behind a wall and falls back to facing', a.x === -1 && a.y === 0);
      const en10 = createEnemies();
      en10.spawnAt('urchin', 2, 0); en10.spawnAt('horns', 0, 2); en10.spawnAt('beholder', 3, 3);
      a = autoAim(octo, en10.all(), open.isSolid, 1);
      assert('autoAim ignores urchins, horns and the Beholder', a.x === 1 && a.y === 0);
      const en11 = createEnemies();
      en11.spawnAt('piranha', 9, 0);
      a = autoAim(octo, en11.all(), open.isSolid, 1);
      assert('autoAim ignores an enemy beyond the range', a.x === 1 && a.y === 0);

      // autofire keeps working through the module
      const en12 = createEnemies();
      const target = en12.spawnAt('piranha', 4, 0);
      const af = createAutofire();
      const octo2 = { x: 0, y: 0, dead: false };
      for (let t = 0; t < 2; t += STEP) af.update(STEP, octo2, open, { live: () => en12.all(), hurt: (e, d) => en12.hurt(e, d) });
      assert('autofire spike still shoots and kills a piranha (shots ' + af.stats.shots + ')', target.dead && af.stats.kills === 1 && af.stats.hits === 2 && af.stats.shots >= 2);
    }

    // draw and reticle run without error and the draw culls off-screen blobs
    {
      let calls = 0;
      const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls++; }), set: (t, k, v) => { t[k] = v; return true; } });
      const jet = createInkJet();
      jet.fire(0, 0, 1, 0, 0.5); jet.update(STEP, open, [], noHurt);
      jet.draw(ctx, { x: 0, y: 0, pxPerUnit: 40 }, 800, 600, 1);
      const onScreen = calls;
      calls = 0;
      jet.draw(ctx, { x: 500, y: 500, pxPerUnit: 40 }, 800, 600, 1);
      assert('draw paints a visible blob and culls one far off screen', onScreen > 0 && calls === 0);
      calls = 0; drawReticle(ctx, 100, 100, 40, 1.5);
      assert('drawReticle draws', calls > 0);
    }
  } finally {
    setHpMode(false); // module-level global: do not leak into the other test files
  }
}
