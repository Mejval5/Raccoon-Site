// Round 37: game feel (idle sink, dash recoil, landing squash, shake and hit-stop scale, contact shadows).
import { STEP } from '../js/loop.js';
import { createOctopus, stepOctopus, tryDash } from '../js/octopus.js';
import { OCTO_IDLE_SINK, SHAKE_MAX_PX, SHAKE_HURT_PX, HITSTOP_S, SWIM_MAX_SPEED } from '../js/config.js';
import { createParticles, blastShakePx } from '../js/particles.js';
import { floorBelow, shadowStrength } from '../js/feel-draw.js';

const open = { isSolid: () => false };
const idle = { move: { x: 0, y: 0 }, dash: { pressed: false } };

export function runFeelTests(assert) {
  assert('default idle sink is 0.35 u/s^2', OCTO_IDLE_SINK === 0.35);
  assert('shake, hurt shake and hit-stop constants', SHAKE_MAX_PX === 6 && SHAKE_HURT_PX === 3 && HITSTOP_S === 0.06);

  // sink: drifts down while idle (up to ~0.175 u/s terminal), none without the feel flag
  {
    const o = createOctopus(10, 10); o.feel = true; o.sink = OCTO_IDLE_SINK;
    const p = createOctopus(10, 10); // endless octopus: unchanged
    for (let i = 0; i < 150; i++) { stepOctopus(o, idle, STEP, open); stepOctopus(p, idle, STEP, open); }
    assert('idle octopus sinks slowly (terminal ~0.22 u/s incl. the tiny base gravity)', o.vy > 0.15 && o.vy < 0.26 && o.y - 10 > 0.3);
    assert('octopus without the feel flag sinks only by the old tiny gravity', p.vy < 0.06);
    const q = createOctopus(10, 10); q.feel = true; q.sink = 2;
    for (let i = 0; i < 100; i++) stepOctopus(q, idle, STEP, open);
    const r = createOctopus(10, 10); r.feel = true; r.sink = 0;
    for (let i = 0; i < 100; i++) stepOctopus(r, idle, STEP, open);
    assert('a bigger ?sink value sinks faster, 0 does not', q.vy > r.vy * 3 && r.vy < 0.06);
  }
  // swimming cancels the sink: same top speed with and without it, and swimming up is not held back
  {
    const up = { move: { x: 0, y: -1 }, dash: { pressed: false } };
    const a = createOctopus(10, 50); a.feel = true; a.sink = OCTO_IDLE_SINK;
    const b = createOctopus(10, 50);
    for (let i = 0; i < 100; i++) { stepOctopus(a, up, STEP, open); stepOctopus(b, up, STEP, open); }
    assert('swimming cancels the sink (speed matches the plain octopus)', Math.abs(a.vy - b.vy) < 0.01 && a.vy < -SWIM_MAX_SPEED * 0.8);
  }
  // landing squash: sinks onto a ledge, squashes softly, then rests on it
  {
    const ledge = { isSolid: (tx, ty) => ty >= 14 };
    const o = createOctopus(10, 13.0); o.feel = true; o.sink = OCTO_IDLE_SINK;
    let landed = 0, maxSq = 0;
    for (let i = 0; i < 300; i++) { stepOctopus(o, idle, STEP, ledge); if (o.landedThisStep) landed++; maxSq = Math.max(maxSq, o.squash); }
    assert('lands on the ledge once with a soft squash', landed === 1 && maxSq > 0.3 && maxSq < 0.8);
    assert('rests on the ledge, squash gone', o.y < 14 - o.radius + 0.01 && o.y > 14 - o.radius - 0.05 && o.squash === 0);
    const f = createOctopus(10, 12); f.feel = true; f.sink = OCTO_IDLE_SINK; f.vy = 6;
    let hard = 0;
    for (let i = 0; i < 60; i++) { stepOctopus(f, idle, STEP, ledge); hard = Math.max(hard, f.squash); }
    assert('a hard landing squashes more than a soft one', hard > maxSq && hard <= 1);
  }
  // dash recoil: a dash into a wall bounces back a little
  {
    const wall = { isSolid: (tx) => tx >= 12 };
    const o = createOctopus(10, 10); o.feel = true; o.sink = 0; o.angle = 90; // facing right
    tryDash(o);
    let bounced = 0, vxAfter = 0, hit = null;
    for (let i = 0; i < 40; i++) {
      stepOctopus(o, idle, STEP, wall);
      if (o.bouncedThisStep) { bounced++; vxAfter = o.vx; hit = { x: o.bounceX, nx: o.bounceNx }; }
    }
    assert('dash into a wall bounces exactly once', bounced === 1);
    assert('the recoil points away from the wall with a small speed', vxAfter < 0 && vxAfter > -4);
    assert('the bounce point is on the wall and the normal faces back', hit && Math.abs(hit.x - 12) < 0.2 && hit.nx < -0.9);
    const p = createOctopus(10, 10); p.angle = 90; tryDash(p);
    let pb = 0; for (let i = 0; i < 40; i++) { stepOctopus(p, idle, STEP, wall); if (p.bouncedThisStep) pb++; }
    assert('without the feel flag a dash does not bounce', pb === 0 && p.vx >= -0.01);
    // a slow swim into a wall does not bounce
    const s = createOctopus(10, 10); s.feel = true; const right = { move: { x: 1, y: 0 }, dash: { pressed: false } };
    let sb = 0; for (let i = 0; i < 200; i++) { stepOctopus(s, right, STEP, wall); if (s.bouncedThisStep) sb++; }
    assert('swimming into a wall does not bounce', sb === 0);
  }
  // shake: scaled by distance, never above 6 px, 0.25 s; reduced motion switches it off
  {
    assert('explosion shake is 6 px at point blank, smaller far away, never below 1 px', blastShakePx(0) === 6 && blastShakePx(7) < 4 && blastShakePx(7) > 2.5 && blastShakePx(99) === 1);
    const pt = createParticles();
    pt.blastFeel(5, 5, 0);
    let m = pt.shakePx(), peak = Math.max(Math.abs(m.x), Math.abs(m.y));
    for (let i = 0; i < 50; i++) { m = pt.shakePx(i * 16.7); peak = Math.max(peak, Math.abs(m.x), Math.abs(m.y)); }
    assert('shake stays within 6 px', peak <= 6.001 && peak > 0);
    for (let i = 0; i < 12; i++) pt.update(0.02);
    assert('shake lasts 0.25 s and then is exactly zero', (m = pt.shakePx(), Math.abs(m.x) + Math.abs(m.y) > 0));
    for (let i = 0; i < 2; i++) pt.update(0.02);
    m = pt.shakePx();
    assert('shake is gone after 0.25 s', m.x === 0 && m.y === 0);
    pt.shakeFx(SHAKE_HURT_PX);
    let hp = 0; for (let i = 0; i < 40; i++) { m = pt.shakePx(i * 16.7); hp = Math.max(hp, Math.abs(m.x), Math.abs(m.y)); }
    assert('damage shake peaks at 3 px', hp <= 3.001 && hp > 0);
    const old = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: true });
    try {
      const q = createParticles(); q.blastFeel(5, 5, 0); q.shakeFx(3); q.bouncePuff(1, 1, 1, 0);
      const live = q.pool.filter((p) => p.active && p.color.indexOf('rgba(215') === 0).length;
      const mm = q.shakePx();
      assert('reduced motion: no shake and no bubbles', mm.x === 0 && mm.y === 0 && live === 0);
    } finally { globalThis.matchMedia = old; }
  }
  // contact shadows
  {
    const solid = (tx, ty) => ty >= 10;
    assert('floorBelow finds the first solid row below', floorBelow(solid, 3.4, 8.2, 2.5) === 10 && Number.isNaN(floorBelow(solid, 3.4, 5, 2)));
    assert('shadow is full on contact and gone when high', shadowStrength(0) === 1 && shadowStrength(0.6) === 0 && shadowStrength(0.3) > 0 && shadowStrength(0.3) < 1);
  }
}
