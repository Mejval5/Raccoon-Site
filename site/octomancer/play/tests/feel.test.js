// Round 37: game feel (idle sink, dash recoil, landing squash, shake and hit-stop scale, contact shadows).
import { STEP } from '../js/loop.js';
import { createOctopus, stepOctopus, tryDash } from '../js/octopus.js';
import { OCTO_IDLE_SINK, SHAKE_MAX_PX, SHAKE_HURT_PX, SHAKE_HURT_S, HITSTOP_S, SWIM_MAX_SPEED, BLAST_SHAKE_S, KILL_FLASH_S, KILL_POOF_N, PICKUP_SPECKS, RUMBLE, RUMBLE_GAIN, RUMBLE_MAX_MS, setMotionSettings } from '../js/config.js';
import { createParticles, blastShakePx, blastHitStop, blastFalloff, blastGain } from '../js/particles.js';
import { createEnemies, setHpMode } from '../js/enemies.js';
import { createGamepad, fakePad, fakeRumbleLog } from '../js/gamepad.js';
import { floorBelow, shadowStrength } from '../js/feel-draw.js';

const open = { isSolid: () => false };
const idle = { move: { x: 0, y: 0 }, dash: { pressed: false } };

export function runFeelTests(assert) {
  assert('default idle sink is 0.35 u/s^2', OCTO_IDLE_SINK === 0.35);
  assert('shake, hurt shake and hit-stop constants (impact pass: 9 px blast over 0.3 s, 5 px over 0.2 s hurt)', SHAKE_MAX_PX === 9 && SHAKE_HURT_PX === 5 && SHAKE_HURT_S === 0.2 && HITSTOP_S === 0.06 && BLAST_SHAKE_S === 0.3);

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
  // shake: scaled by distance, never above 9 px, 0.3 s; reduced motion switches it off
  {
    assert('explosion shake is 9 px at point blank, smaller far away, never below 1 px', blastShakePx(0) === 9 && blastShakePx(7) < 6 && blastShakePx(7) > 3.5 && blastShakePx(99) === 1);
    const pt = createParticles();
    pt.blastFeel(5, 5, 0);
    let m = pt.shakePx(), peak = Math.max(Math.abs(m.x), Math.abs(m.y));
    for (let i = 0; i < 50; i++) { m = pt.shakePx(i * 16.7); peak = Math.max(peak, Math.abs(m.x), Math.abs(m.y)); }
    assert('shake stays within 9 px', peak <= 9.001 && peak > 0);
    for (let i = 0; i < 14; i++) pt.update(0.02);
    assert('a blast shake still runs at 0.28 s', (m = pt.shakePx(), Math.abs(m.x) + Math.abs(m.y) > 0));
    for (let i = 0; i < 2; i++) pt.update(0.02);
    m = pt.shakePx();
    assert('shake is gone after 0.3 s', m.x === 0 && m.y === 0);
    // the wobble's phase is the time passed in, so the peak is read exactly where sin = 1 (no sampling, no clock)
    const PEAK_MS = Math.PI / 2 / 0.06;
    pt.shakeFx(SHAKE_HURT_PX, SHAKE_HURT_S);
    const hx = pt.shakePx(PEAK_MS).x;
    assert('hurt shake: 5 px at its start (>= 5 px, never above)', hx >= 4.999 && hx <= 5.001, String(hx));
    for (let i = 0; i < 5; i++) pt.update(0.02);
    assert('hurt shake: half strength after 0.1 s', Math.abs(pt.shakePx(PEAK_MS).x - 2.5) < 0.01);
    for (let i = 0; i < 6; i++) pt.update(0.02);
    assert('hurt shake: gone after 0.2 s', pt.shakePx(PEAK_MS).x === 0);
    const b9 = createParticles(); b9.blastFeel(5, 5, 0);
    assert('blast shake: 9 px point blank', Math.abs(b9.shakePx(PEAK_MS).x - 9) < 1e-6);
    const old = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: true });
    try {
      const q = createParticles(); q.blastFeel(5, 5, 0); q.shakeFx(3); q.bouncePuff(1, 1, 1, 0);
      const live = q.pool.filter((p) => p.active && p.color.indexOf('rgba(215') === 0).length;
      const mm = q.shakePx();
      assert('reduced motion: no shake and no bubbles', mm.x === 0 && mm.y === 0 && live === 0);
    } finally { globalThis.matchMedia = old; }
  }
  // impact pass (IMPROVEMENTS.md 2026-10-18 #4): blast hit-stop and loudness, one shake path, the kill flash, the pickup pop, rumble
  {
    setMotionSettings(false, true);
    assert('blast hit-stop: point blank 0.05 s, at 1 tile > 0, at 12 tiles none (k = 0 from 10 tiles on)', Math.abs(blastHitStop(0) - 0.05) < 1e-9 && blastHitStop(1) > 0.04 && blastHitStop(12) === 0 && blastFalloff(10) === 0 && blastFalloff(12) === 0);
    assert('blast hit-stop: a sliver under 10 ms is skipped (it would still freeze a whole step)', blastHitStop(9) === 0 && blastHitStop(7) > 0);
    assert('blast loudness: 1 point blank, quieter far away, never under 0.25', blastGain(0) === 1 && blastGain(8) < 0.7 && blastGain(8) > 0.6 && blastGain(40) === 0.25);
    const q = createParticles();
    q.blastBurst(5, 5, 0); q.blastFeel(5, 5, 0); // what main.js calls for one blast
    const so = q.shakeOffset(), sp = q.shakePx(Math.PI / 2 / 0.06);
    assert('one shake source per blast: the old world-unit shake stays still, the pixel shake moves', so.x === 0 && so.y === 0 && sp.x > 8.9);
    q.bombDebris(5, 5);
    assert('one shake source: a pot or rock break does not start the old shake either', q.shakeOffset().x === 0 && q.shakeOffset().y === 0);
    // kill poof: 14 specks in the creature's tint
    const k = createParticles(); k.killPoof(5, 5, 'crab');
    const kp = k.pool.filter((p) => p.active);
    assert('kill poof: 14 specks, most in the crab tint, the rest pale', kp.length === KILL_POOF_N && kp.filter((p) => p.color === '#c98466').length >= 9);
    const pp = createParticles(); pp.pickupPop(5, 5, '#e8f1e4');
    assert('pickup: 8 specks', pp.pool.filter((p) => p.active).length === PICKUP_SPECKS);
    // the kill flash: an ink kill leaves a pale after-image for 60 ms with no hit-stop; a dash kill keeps its white one
    setHpMode(true);
    try {
      const en = createEnemies(); const pir = en.spawnAt('piranha', 5, 5); const o = { x: 40, y: 40, vx: 0, vy: 0, radius: 0.5, hearts: 3, dead: false };
      en.hurt(pir, 999);
      const ghost = en.all().find((e) => e.ghost && e.kind === 'piranha');
      const evs = en.events.map((e) => e.type);
      assert('ink kill: the flash (a pale ghost, weaker than the dash kill white) and no hit-stop event', pir.dead && ghost && ghost.hitFlash >= 0.2 && ghost.hitFlash < 1 && Math.abs(ghost.t - KILL_FLASH_S) < 1e-9 && evs.includes('enemyKilled') && !evs.includes('hitStop'));
      const OPEN = { isSolid: () => false, tileAt: () => 0, isBreakable: () => false };
      for (let i = 0; i < 3; i++) en.update(0.02, 0, o, OPEN, []);
      assert('ink kill: the flash is gone after 60 ms of sim', !en.all().some((e) => e.ghost));
    } finally { setHpMode(false); }
    // rumble: a fake pad's actuator records each effect; the cap holds; shake off or reduced motion sends nothing
    fakeRumbleLog.length = 0;
    const fp = fakePad({}, 0), key = String(fp.id) + '#0';
    const gp = createGamepad({ pad: { x: 0, y: 0 }, padButton() {}, padCycle() {}, padSelect() {}, mode: () => 'pad', setMode() {} }, { getPads: () => [fp] });
    assert('rumble: hurt reaches the pad, scaled by the 0.7 cap', gp.rumble(key, ...RUMBLE.hurt) && fakeRumbleLog.length === 1 && fakeRumbleLog[0].type === 'dual-rumble' && Math.abs(fakeRumbleLog[0].weakMagnitude - 0.8 * RUMBLE_GAIN) < 1e-9 && fakeRumbleLog[0].duration === 120);
    assert('rumble: a weaker effect does not cut off a stronger one still playing', !gp.rumble(key, 0.1, 0.1, 60) && fakeRumbleLog.length === 1);
    gp.rumble(key, 1, 1, 5000);
    const last = fakeRumbleLog[fakeRumbleLog.length - 1];
    assert('rumble: never above the cap or longer than 300 ms', last.strongMagnitude <= RUMBLE_GAIN + 1e-9 && last.duration === RUMBLE_MAX_MS);
    assert('rumble: no pad key (keyboard player) sends nothing', !gp.rumble('', 1, 1, 100));
    const n0 = fakeRumbleLog.length;
    setMotionSettings(false, false);
    const offShake = gp.rumble(key, 1, 1, 300);
    setMotionSettings(true, true);
    const offReduced = gp.rumble(key, 1, 1, 300);
    setMotionSettings(null, true);
    assert('rumble: off with screen shake off and with reduced motion', !offShake && !offReduced && fakeRumbleLog.length === n0);
  }
  // contact shadows
  {
    const solid = (tx, ty) => ty >= 10;
    assert('floorBelow finds the first solid row below', floorBelow(solid, 3.4, 8.2, 2.5) === 10 && Number.isNaN(floorBelow(solid, 3.4, 5, 2)));
    assert('shadow is full on contact and gone when high', shadowStrength(0) === 1 && shadowStrength(0.6) === 0 && shadowStrength(0.3) > 0 && shadowStrength(0.3) < 1);
  }
}
