// V2-PLAN 16: corpses (js/corpses.js). Every enemy kind killed by a bomb or a dash leaves exactly one corpse and no item,
// a corpse sinks, bounces once, settles, is shoved by a blast, lifted by a jet, fades out, and the pool is capped.
import { createCorpses, setCorpseHook, CS_REST, CS_FREE, CAP, LIFE_AFTER_REST, kindName, corpseRadius } from '../js/corpses.js';
import { createEnemies } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { createPickups } from '../js/pickups.js';
import { DASH_KILL_SPEED } from '../js/config.js';

const DT = 0.02;
// a flat floor at y = 10 as one wall segment; rock below it
const FLOOR = [{ x1: -50, y1: 10, x2: 100, y2: 10 }];
const world = { isSolid: (x, y) => y > 10, tileAt: (x, y) => (y >= 10 ? 1 : 0), wallSegmentsNear: () => FLOOR };

function run(c, n, hd = null) { for (let i = 0; i < n; i++) c.update(DT, world, hd); }

export async function runCorpseTests(assert) {
  // ---- every enemy kind: one corpse, no item ----
  {
    const kinds = ['piranha', 'crab', 'manta', 'urchin', 'cannon'];
    let oneEach = 0, payloadOk = 0, dashed = 0, noItems = 0;
    for (const how of ['bomb', 'dash']) {
      for (const kind of kinds) {
        const en = createEnemies(), c = createCorpses();
        const e = en.spawnAt(kind, 5, 5, kind === 'crab' || kind === 'cannon' ? 'floor' : 'open');
        const o = createOctopus(5, 5); o.invulnTimer = 1e9;
        if (how === 'bomb') en.killInRadius(5, 5, 2);
        else {
          if (!e.dashKillable) continue; // urchin and cannon only die to bombs
          o.vx = DASH_KILL_SPEED + 4; o.vy = 0;
          en.update(DT, 0, o, { isSolid: () => false, breakTile() {} }, [], null);
          dashed++;
        }
        const evs = en.events.filter((ev) => ev.type === 'enemyKilled');
        if (evs.length === 1) {
          const ev = evs[0];
          if (typeof ev.vx === 'number' && typeof ev.vy === 'number' && (ev.face === 1 || ev.face === -1)) payloadOk++;
          c.add(ev.kind, ev.x, ev.y, ev.vx, ev.vy, ev.face);
        }
        if (c.count() === 1) oneEach++;
        // the pickups system gets no shell from a kill (main.js no longer drops one): the event list holds nothing else
        if (!en.events.some((ev) => ev.type === 'shell' || ev.type === 'drop')) noItems++;
      }
    }
    assert(`corpses: each of piranha, crab, manta, urchin, cannon killed by a bomb (5) and the three dash-killable ones by a dash (${dashed}) leaves exactly one corpse (${oneEach}/${5 + dashed})`, oneEach === 5 + dashed);
    assert(`corpses: the kill event carries vx, vy and face for the corpse (${payloadOk}/${5 + dashed})`, payloadOk === 5 + dashed);
    assert('corpses: a kill produces no item event', noItems === 5 + dashed);
    // main.js must not pay a kill out in shells any more
    let src = '';
    try { src = await (await fetch('../js/main.js')).text(); } catch { src = ''; }
    assert('corpses: main.js has no kill-drops-shell code left', src.length > 1000 && !/killDropRoll/.test(src) && !/dropShell\(ev\.x, ev\.y\)/.test(src));
    // a loose pickups system never gains a shell from a corpse
    const pk = createPickups();
    assert('corpses: dropShell is not used for kills (a new pickups system holds no shell)', pk.totals.shells === 0 && pk.visible([]).length === 0);
  }

  // ---- sink, bounce, settle, fade ----
  {
    const c = createCorpses();
    const i = c.add('piranha', 5, 4, 0, 0, 1);
    const d = c.data;
    const y0 = d.y[i];
    run(c, 10);
    assert('corpses: a corpse sinks (water gravity, not a free fall)', d.y[i] > y0 + 0.05 && d.vy[i] > 0 && d.vy[i] < 2.2);
    // thrown down onto the floor fast: vy flips sign once on the impact
    const j = c.add('crab', 20, 6, 0, 6, 1);
    let flips = 0, prev = d.vy[j], bounceVy = 0;
    for (let n = 0; n < 150; n++) { c.update(DT, world, null); if (prev > 0.2 && d.vy[j] < -0.2) { flips++; bounceVy = d.vy[j]; } prev = d.vy[j]; }
    assert(`corpses: a hard impact bounces it once (vy flips sign ${flips} time, rebound ${bounceVy.toFixed(2)} u/s)`, flips === 1 && bounceVy > -3.5);
    run(c, 400);
    assert('corpses: it settles and falls asleep on the floor (state rest), not inside rock', d.state[i] === CS_REST && d.state[j] === CS_REST && d.y[i] < 10 && d.y[i] > 9.3 && !world.isSolid(d.x[j], d.y[j]));
    // fades out about 25 s after settling
    const restAt = d.restT[i];
    run(c, Math.round((LIFE_AFTER_REST - 3 - d.restT[i]) / DT));
    assert('corpses: it is still lying there 3 s before the end', c.count() === 2 && c.alphaOf(i) === 1);
    run(c, Math.round(2 / DT));
    const a = c.alphaOf(i);
    assert(`corpses: it fades over the last 2 s (alpha ${a.toFixed(2)})`, a < 1 && a > 0 && restAt >= 0);
    run(c, Math.round(2 / DT));
    assert('corpses: and is gone after the timeout', c.count() === 0);
  }

  // ---- a blast shoves it, even a sleeper ----
  {
    const c = createCorpses(), d = c.data;
    const i = c.add('manta', 10, 9.3, 0, 0, 1);
    run(c, 200);
    const x0 = d.x[i];
    assert('corpses: (setup) the corpse is asleep before the blast', d.state[i] === CS_REST);
    c.blast(8, 9.5, 2.5);
    assert('corpses: a blast wakes it and gives it a shove away from the centre', d.state[i] === CS_FREE && d.vx[i] > 3);
    run(c, 60);
    assert(`corpses: it ends up further from the blast (${d.x[i].toFixed(1)} vs ${x0.toFixed(1)})`, d.x[i] > x0 + 0.5);
    const k = c.add('crab', 40, 9.5, 0, 0, 1);
    c.blast(10, 9.5, 2.5);
    assert('corpses: a blast far away leaves it alone', d.vx[k] === 0);
  }

  // ---- a jet lifts it ----
  {
    const c = createCorpses(), d = c.data;
    // a jet in the floor at x = 30, pointing up, 6 tiles long (the hazards.data fields the jet maths reads)
    const hd = { n: 1, kind: Uint8Array.of(1), x: Float32Array.of(30), y: Float32Array.of(10), dx: Float32Array.of(0), dy: Float32Array.of(-1), len: Float32Array.of(6), pool: Uint8Array.of(0) };
    const i = c.add('piranha', 30, 9.4, 0, 0, 1);
    run(c, 150);
    const y0 = d.y[i];
    run(c, 100, hd);
    assert(`corpses: a corpse over a current jet is lifted (y ${d.y[i].toFixed(1)} vs ${y0.toFixed(1)}), also one that was asleep`, d.y[i] < y0 - 2);
    const j = c.add('crab', 60, 9.4, 0, 0, 1);
    run(c, 100, hd);
    assert('corpses: one outside the stream is not moved by it', Math.abs(d.x[j] - 60) < 0.05);
  }

  // ---- the cap ----
  {
    const c = createCorpses(), d = c.data;
    for (let n = 0; n < CAP + 8; n++) c.add('urchin', n, 5, 0, 0, 1);
    let minX = 1e9;
    for (let n = 0; n < d.n; n++) if (d.alive[n]) minX = Math.min(minX, d.x[n]);
    assert(`corpses: the pool holds at most ${CAP} (${c.count()}) and the oldest 8 were dropped (oldest left x ${minX})`, c.count() === CAP && minX === 8);
  }

  // ---- hook, radii ----
  {
    const calls = [];
    setCorpseHook((x, y, kind, idx) => calls.push([x, y, kind, idx]));
    const c = createCorpses();
    const i = c.add('gclam', 3, 4, 0, 0, -1);
    c.add('npc-pip', 5, 6, 0, 0, 1);
    setCorpseHook(null);
    c.add('crab', 7, 8, 0, 0, 1);
    assert('corpses: the hook gets (x, y, kind, index) once per new corpse and not after it is cleared', calls.length === 2 && calls[0][0] === 3 && calls[0][1] === 4 && calls[0][2] === 'gclam' && calls[0][3] === i && calls[1][2] === 'npc-pip');
    assert('corpses: kind names and radii (piranha 0.45, gclam 0.9, an npc 0.5)', kindName(c.data.kind[i]) === 'gclam' && corpseRadius('piranha') === 0.45 && corpseRadius('gclam') === 0.9 && corpseRadius('npc-marlo') === 0.5 && c.data.face[i] === -1);
  }
}
