// 2026-10-18: the manta is a glider (CREATURES.md "Manta"). It loops slowly on smooth curves and ignores the octopus; only
// when she passes underneath does it bank (a 0.6 s hover with a growing shadow), slam straight down through where she was,
// rest stunned on the floor for 1.5 s (harmless, grabbable) and lift off again. Gliding contact never bites.
import { STUN_S } from '../js/config.js';
import {
  createEnemies, MA_GLIDE, MA_TELL, MA_DIVE, MA_REST, MA_RISE, MANTA_TELL, MANTA_REST, MANTA_TURN, MANTA_NOTICE, MANTA_UNDER,
} from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { rowOf } from '../js/creature-rules.js';

const DT = 0.02;
const grid = (fn) => ({ isSolid: (x, y) => fn(Math.floor(x), Math.floor(y)), breakTile() {} });
/** A 30 x 14 room: rock at x < 1, x >= 30, y < 1, y >= 14. */
const ROOM = grid((x, y) => x < 1 || x >= 30 || y < 1 || y >= 14);
const pin = (o, x, y) => { o.x = o.prevX = x; o.y = o.prevY = y; o.vx = o.vy = 0; };

export async function runMantaTests(assert) {
  // ---- the full cycle: glide -> bank (tell) -> dive -> rest -> lift-off -> glide, against a floor ----
  {
    const o = createOctopus(15.5, 10); o.invulnTimer = 1e9;
    const en = createEnemies(); const m = en.spawnAt('manta', 12, 6, 'open'); m.cool = 0;
    const seq = [m.st], dur = {}; let restStunned = true, restMoved = 0, restX = 0, restY = 0, diveVy = 0, slams = 0, floorY = 0;
    for (let i = 0; i < 700; i++) {
      pin(o, 15.5, 10);
      en.update(DT, i * DT, o, ROOM, [], null);
      for (const ev of en.events) if (ev.type === 'mantaSlam') { slams++; floorY = ev.y; }
      if (seq[seq.length - 1] !== m.st) { seq.push(m.st); if (m.st === MA_REST) { restX = m.x; restY = m.y; } }
      dur[m.st] = (dur[m.st] || 0) + DT;
      if (m.st === MA_REST) { if (!(m.stun > 0)) restStunned = false; restMoved = Math.max(restMoved, Math.hypot(m.x - restX, m.y - restY)); }
      if (m.st === MA_DIVE) diveVy = Math.max(diveVy, m.vy);
      if (seq.length >= 6) break;
    }
    assert(`manta: glide -> bank -> dive -> rest -> lift-off -> glide (${seq.join(',')})`, seq.slice(0, 6).join() === [MA_GLIDE, MA_TELL, MA_DIVE, MA_REST, MA_RISE, MA_GLIDE].join());
    assert(`manta: the bank is a ${MANTA_TELL} s hover (${(dur[MA_TELL] || 0).toFixed(2)} s)`, Math.abs((dur[MA_TELL] || 0) - MANTA_TELL) < 0.05);
    assert(`manta: it rests ${MANTA_REST} s on the floor (${(dur[MA_REST] || 0).toFixed(2)} s), stunned and still (moved ${restMoved.toFixed(3)})`, Math.abs((dur[MA_REST] || 0) - MANTA_REST) < 0.06 && restStunned && restMoved < 0.01);
    assert(`manta: the slam is a fast straight dive down (vy ${diveVy.toFixed(1)}) that lands on the floor with one silt puff (y ${floorY.toFixed(2)})`, diveVy > 6 && slams === 1 && floorY > 13.3 && floorY < 14.2);
  }
  // ---- the slam lands on the octopus's position at the end of the tell: contact knocks her limp (STUN_S), one heart ----
  {
    const o = createOctopus(15.5, 10);
    const en = createEnemies(); const m = en.spawnAt('manta', 15, 6, 'open'); m.cool = 0;
    let st = -1, h0 = o.hearts;
    for (let i = 0; i < 400 && st < 0; i++) {
      if (o.stunT <= 0) pin(o, 15.5, 10);
      en.update(DT, i * DT, o, ROOM, [], null);
      if (o.stunT > 0) st = m.st;
    }
    assert(`manta: the dive slams the octopus beneath it limp for ${STUN_S} s and costs one heart (stunT ${o.stunT.toFixed(2)}, hearts ${h0} -> ${o.hearts})`, st === MA_DIVE && Math.abs(o.stunT - STUN_S) < 0.05 && o.hearts === h0 - 1);
  }
  // ---- it dives only at an octopus below it and in range ----
  for (const [label, ox, oy] of [['above it', 15, 2.5], ['too far below', 15, 6 + MANTA_NOTICE + 1.3 + 0.6], ['off to the side', 24.2, 9]]) {
    const o = createOctopus(ox, oy); o.invulnTimer = 1e9;
    const room = grid((x, y) => x < 1 || x >= 30 || y < 1 || y >= 20);
    const en = createEnemies(); const m = en.spawnAt('manta', 15, 6, 'open'); m.cool = 0;
    let banked = false;
    for (let i = 0; i < 1000; i++) { pin(o, ox, oy); en.update(DT, i * DT, o, room, [], null); if (m.st !== MA_GLIDE) banked = true; }
    assert(`manta: no bank and no dive at an octopus ${label} (${ox}, ${oy}; loop x ${(15 - m.ax).toFixed(1)}..${(15 + m.ax).toFixed(1)})`, !banked);
  }
  {
    // and it does at one just under its loop, as it passes over
    const o = createOctopus(15, 11); o.invulnTimer = 1e9;
    const en = createEnemies(); const m = en.spawnAt('manta', 15, 6, 'open'); m.cool = 0;
    let banked = -1;
    for (let i = 0; i < 1000 && banked < 0; i++) { pin(o, 15, 11); en.update(DT, i * DT, o, ROOM, [], null); if (m.st === MA_TELL) banked = i; }
    assert(`manta: an octopus passing ${(11 - 6)} tiles under it (within ${MANTA_UNDER} sideways) sets the bank off`, banked >= 0);
  }
  // ---- gliding: it never bites, and it only ever turns on smooth curves ----
  {
    const o = createOctopus(15, 6);
    const en = createEnemies(); const m = en.spawnAt('manta', 15, 6, 'open');
    const h0 = o.hearts; let maxTurn = 0, last = NaN, x0 = 99, x1 = -99, y0 = 99, y1 = -99, notGlide = 0;
    for (let i = 0; i < 1500; i++) {
      pin(o, m.x + 0.3, m.y - 0.2); o.invulnTimer = 0; o.dashInvuln = 0; // right on its back, above it: in contact, never under it
      en.update(DT, i * DT, o, ROOM, [], null);
      if (m.st !== MA_GLIDE) notGlide++;
      const h = Math.atan2(m.vy, m.vx);
      if (!Number.isNaN(last)) { let d = Math.abs(h - last); if (d > Math.PI) d = 2 * Math.PI - d; maxTurn = Math.max(maxTurn, d / DT); }
      last = h; x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y);
    }
    assert(`manta: an octopus touching a gliding manta for 30 s is never bitten (hearts ${h0} -> ${o.hearts}, stunT ${o.stunT})`, o.hearts === h0 && o.stunT === 0 && notGlide === 0);
    assert(`manta: it glides a wide loop (x ${x0.toFixed(1)}..${x1.toFixed(1)}, y ${y0.toFixed(1)}..${y1.toFixed(1)}) and never turns faster than ${MANTA_TURN} rad/s in open water (max ${maxTurn.toFixed(2)})`, x1 - x0 > 7 && y1 - y0 > 1.5 && maxTurn <= MANTA_TURN + 0.01);
  }
  // ---- resting on the floor it is harmless and vulnerable: no contact damage, grabbable, killed by a hit; health unchanged ----
  {
    const o = createOctopus(15.5, 10); o.invulnTimer = 1e9;
    const en = createEnemies(); const m = en.spawnAt('manta', 15, 6, 'open'); m.cool = 0;
    for (let i = 0; i < 500 && m.st !== MA_REST; i++) { pin(o, 15.5, 10); en.update(DT, i * DT, o, ROOM, [], null); }
    const resting = m.st === MA_REST;
    pin(o, m.x, m.y - 0.1); o.invulnTimer = 0; o.stunT = 0; const h0 = o.hearts;
    for (let i = 0; i < 20; i++) { o.invulnTimer = 0; pin(o, m.x, m.y - 0.1); en.update(DT, i * DT, o, ROOM, [], null); }
    assert(`manta: resting on the floor it does not hurt an octopus lying on it (hearts ${h0} -> ${o.hearts})`, resting && o.hearts === h0 && o.stunT === 0);
    assert('manta: resting it is a stunned mover, so the hand can pick it up and jets carry it', m.st === MA_REST && m.stun > 0 && m.moving && !m.dead);
    assert(`manta: health unchanged (${rowOf('manta').hp}), and a resting manta dies to the Ink Jet like any time`, rowOf('manta').hp === 16 && en.applyHit(m, 'ink', m.x, m.y - 1, 99) > 0 && m.dead);
  }
  // ---- ink: an octopus in a cloud is lost; a bank already under way sweeps on without diving ----
  {
    const o = createOctopus(15.5, 10); o.invulnTimer = 1e9;
    const en = createEnemies(); const m = en.spawnAt('manta', 15, 6, 'open'); m.cool = 0;
    let hidden = false, dove = false;
    en.setInkClouds({ hides: () => hidden });
    for (let i = 0; i < 300; i++) {
      pin(o, 15.5, 10);
      en.update(DT, i * DT, o, ROOM, [], null);
      if (m.st === MA_TELL) hidden = true; // she inks mid-bank
      if (m.st === MA_DIVE) dove = true;
    }
    assert('manta: ink during the bank makes it lose her: it glides on, no slam', hidden && !dove && m.st === MA_GLIDE);
  }
}
