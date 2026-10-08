// V2-PLAN 14: the death ragdoll, the Spelunky way. A limp (or dead) octopus is a physics prop (props.js PK_BODY) that
// sinks, bounces, rolls, sleeps and never ends inside rock; enemies, hazards and blasts keep hitting the dead body (a flash
// and a knock, no damage); the death camera frames the body in the part of the screen the death panel leaves free.
// The general limp state (enterRagdoll / exitRagdoll, a cause that picks the pose) is what short incapacitations reuse.
import { createOctopus, stepOctopus, killOctopus, hurtOctopus, enterRagdoll, exitRagdoll, hitBody } from '../js/octopus.js';
import { createProps, PK_BODY, PS_REST } from '../js/props.js';
import { createRagdoll } from '../js/ragdoll.js';
import { createEnemies, PS_LUNGE } from '../js/enemies.js';
import { createHazards, HZ_JET, HZ_ANEMONE } from '../js/hazards.js';
import { createBombs } from '../js/bomb.js';
import { updateDeathCamera, createCamera } from '../js/camera.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { mulberry32 } from '../js/rng.js';
import { BODY_KNOCK, BODY_HIT_COOL, DEATH_DURATION, OCTO_IDLE_SINK } from '../js/config.js';
import { loadBiome1Json } from './biome1.test.js';
import { loadRoomsJson } from './rooms.test.js';

const DT = 0.02;
const IDLE = { move: { x: 0, y: 0 }, dash: { pressed: false, held: false } };
const grid = (fn) => ({ isSolid: (x, y) => fn(Math.floor(x), Math.floor(y)), tileAt: (x, y) => (fn(x, y) ? 1 : 0), breakTile() {} });
const noEnemies = { killInRadius() { return 0; } };

/** One step of the dead / limp body the way main.js runs it (octopus, ragdoll, props, then whatever shoves it). */
function bodyStep(o, rd, props, world, after = null) {
  stepOctopus(o, IDLE, DT, world);
  rd.update(o, props);
  rd.sync(o, props);
  props.step(DT, world, o);
  rd.sync(o, props, DT);
  if (after) after();
  rd.sync(o, props);
}

export async function runRagdollTests(assert) {
  const bank = createRoomBank(await loadBiome1Json());
  bank.fallbackBank = createRoomBank(await loadRoomsJson());
  setDefaultBank(bank);

  // ---- the limp state: a timed incapacitation ends by itself, death never does; the cause names the pose ----
  {
    const world = grid((x, y) => y >= 12 || x < 0 || x >= 30);
    const o = createOctopus(10, 6); o.feel = true; o.sink = OCTO_IDLE_SINK;
    enterRagdoll(o, 1.2, 'stun');
    const swim = { move: { x: 1, y: 0 }, dash: { pressed: true, held: true } };
    let steps = 0, movedByInput = false;
    while (o.limp && steps < 200) { const vx = o.vx; stepOctopus(o, swim, DT, world); if (o.limp && (o.vx > vx + 0.05 || o.dashedThisStep)) movedByInput = true; steps++; }
    assert(`ragdoll: a 1.2 s limp ends by itself (${(steps * DT).toFixed(2)} s) and ignores swim and dash meanwhile`, !o.limp && Math.abs(steps * DT - 1.2) < 0.05 && !movedByInput && o.limpCause === '');
    stepOctopus(o, swim, DT, world);
    assert('ragdoll: ... after which the octopus swims again', o.swimming);
    enterRagdoll(o, 0.5, 'stun'); enterRagdoll(o, 0.2, 'impaled');
    assert('ragdoll: entering again while limp keeps the longer time and takes the new cause', o.limpT === 0.5 && o.limpCause === 'impaled');
    exitRagdoll(o);
    assert('ragdoll: exitRagdoll gives control back at once', !o.limp && o.limpT === 0);
    const d = createOctopus(5, 5); killOctopus(d, 'crab');
    assert('ragdoll: death is limp for good (cause "death", the 1.5 s wait before the death screen)', d.dead && d.limp && d.limpT === Infinity && d.limpCause === 'death' && d.deathTimer === DEATH_DURATION && DEATH_DURATION === 1.5);
    exitRagdoll(d);
    assert('ragdoll: ... and exitRagdoll cannot revive the dead', d.limp && d.dead);
    const s = createOctopus(5, 5); killOctopus(s, 'rock', 'splat');
    assert('ragdoll: a special death passes its own pose (splat) while the death screen keeps the killer', s.limpCause === 'splat' && s.cause === 'rock');
    const sp = createProps(), srd = createRagdoll();
    srd.update(s, sp);
    assert('ragdoll: ... and a pinned death (skewered, flattened: V2-PLAN 16) gets no ragdoll body and takes no hits', s.bodyIdx === -1 && sp.count() === 0 && !hitBody(s, s.x - 1, s.y));
  }

  // ---- hits on the dead body: a knock, a flash, no damage, one per BODY_HIT_COOL ----
  {
    const o = createOctopus(10, 10); killOctopus(o, 'piranha');
    o.vx = o.vy = 0;
    const ok1 = hurtOctopus(o, 9, 10, 'crab');
    assert(`ragdoll: a hit on the dead body knocks it away (vx ${o.vx.toFixed(2)}), flashes it, keeps the killer and the hearts`, ok1 && o.vx > BODY_KNOCK * 0.9 && o.vy < 0 && o.hitFlash === 1 && o.cause === 'piranha' && o.hearts === 0 && o.bodyHits === 1);
    const ok2 = hurtOctopus(o, 11, 10, 'crab');
    let t = 0; while (o.hitCool > 0) { stepOctopus(o, IDLE, DT, grid(() => false)); t += DT; }
    const ok3 = hitBody(o, 10, 11);
    assert(`ragdoll: a second hit within ${BODY_HIT_COOL} s does not count, the next one after does (${t.toFixed(2)} s)`, !ok2 && ok3 && o.bodyHits === 2);
    killOctopus(o, 'beholder');
    assert('ragdoll: the Beholder touching the dead body is a hit too, not a second death', o.cause === 'piranha' && o.bodyHits === 2 /* still cooling */ && o.dead);
  }

  // ---- the body on generated levels: it moves, never ends inside rock, and settles (many seeds) ----
  {
    const rng = mulberry32(4242);
    let bodies = 0, inRock = 0, settled = 0, moved = 0, maxStep = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const lvl of [1, 2, 3]) {
        const world = createLevelWorld(seed * 7919, lvl);
        for (let k = 0; k < 3; k++) {
          let x = 0, y = 0, tries = 0;
          do { x = 2 + rng() * (world.width - 4); y = 2 + rng() * ((world.level.back ? world.level.back.frontH : world.height) - 4); tries++; } // the front rows (not a back room's annex)
          while (tries < 200 && (world.isSolid(x, y) || world.isSolid(x, y + 0.5) || world.isSolid(x + 0.5, y) || world.isSolid(x - 0.5, y) || world.isSolid(x, y - 0.5)));
          if (tries >= 200) continue;
          bodies++;
          const o = createOctopus(x, y); o.feel = true; o.sink = OCTO_IDLE_SINK;
          o.vx = (rng() - 0.5) * 12; o.vy = (rng() - 0.5) * 12;
          killOctopus(o, 'test');
          const props = createProps(), rd = createRagdoll();
          let bad = false, px = o.x, py = o.y;
          for (let s = 0; s < 1500; s++) { // 6 s of hits, then 24 s of quiet (some levels have long shafts to sink down)
            // the world keeps hitting it for the first 6 s: a knock from a random side every 1.5 s
            const kick = s < 300 && s % 75 === 30;
            bodyStep(o, rd, props, world, kick ? () => { o.hitCool = 0; hitBody(o, o.x + (rng() - 0.5), o.y + (rng() - 0.5)); } : null);
            if (world.isSolid(o.x, o.y)) bad = true;
            maxStep = Math.max(maxStep, Math.hypot(o.x - px, o.y - py)); px = o.x; py = o.y;
          }
          if (bad) inRock++;
          if (Math.hypot(o.x - x, o.y - y) > 0.3) moved++;
          if (props.data.state[o.bodyIdx] === PS_REST) settled++;
        }
      }
    }
    assert(`ragdoll: ${bodies} bodies on 90 generated levels: none is ever inside rock (${inRock})`, bodies > 200 && inRock === 0);
    assert(`ragdoll: ... every one moves (sinks, bounces, rolls): ${moved}/${bodies}`, moved === bodies);
    assert(`ragdoll: ... and comes to rest once nothing hits it any more: ${settled}/${bodies} asleep after 24 s of quiet`, settled === bodies);
    assert(`ragdoll: ... without a teleport (largest step ${maxStep.toFixed(2)} tiles)`, maxStep < 0.6);
  }

  // ---- the body is a prop: it bounces off a wall, rolls down a slope, and a recovered octopus loses it ----
  {
    const wall = grid((x, y) => y >= 14 || x < 1 || x >= 10);
    const o = createOctopus(5, 8); o.feel = true; killOctopus(o, 'test');
    const props = createProps(), rd = createRagdoll();
    o.vx = 10;
    let minVx = 0;
    for (let s = 0; s < 60; s++) { bodyStep(o, rd, props, wall); minVx = Math.min(minVx, o.vx); }
    assert(`ragdoll: thrown at a wall it bounces back (min vx ${minVx.toFixed(2)})`, minVx < -0.5 && props.data.kind[o.bodyIdx] === PK_BODY);
    // a smooth 30 degree ramp descending to the right (x 2..12), then a flat floor, as wall segments (what the outline hands the physics)
    const yEnd = 6 + 10 * Math.tan(Math.PI / 6);
    const segs = [{ x1: 2, y1: 6, x2: 12, y2: yEnd }, { x1: 12, y1: yEnd, x2: 40, y2: yEnd }];
    const lineY = (x) => (x < 12 ? 6 + (x - 2) * Math.tan(Math.PI / 6) : yEnd);
    const world = { isSolid: (x, y) => y > lineY(x), tileAt: (x, y) => (y + 0.5 > lineY(x + 0.5) ? 1 : 0), wallSegmentsNear: () => segs };
    const o2 = createOctopus(4.5, 3); o2.feel = true; enterRagdoll(o2, 6, 'stun');
    const p2 = createProps(), rd2 = createRagdoll();
    for (let s = 0; s < 260; s++) bodyStep(o2, rd2, p2, world);
    assert(`ragdoll: dropped on a slope it rolls down it (x ${o2.x.toFixed(2)} from 4.5) and turns as it rolls (${o2.angle.toFixed(0)} deg)`, o2.x > 7.5 && o2.limp && Math.abs(o2.angle) > 20);
    for (let s = 0; s < 60; s++) bodyStep(o2, rd2, p2, world);
    assert('ragdoll: the stun ends, the body prop is removed and the octopus is where the body was', !o2.limp && o2.bodyIdx === -1 && p2.count() === 0 && !world.isSolid(o2.x, o2.y));
  }

  // ---- enemies keep attacking the dead body ----
  {
    // a piranha with the body in sight lunges at it and bites
    const world = grid((x, y) => y >= 12 || y < 0 || x < 0 || x >= 40);
    const o = createOctopus(14, 8); killOctopus(o, 'test');
    const en = createEnemies();
    const p = en.spawnAt('piranha', 9, 8, 'open'); p.dir = 1; p.baseX = 9; p.baseY = 8; p.t = 0;
    let lunged = false;
    for (let s = 0; s < 250 && o.bodyHits === 0; s++) { en.update(DT, 0, o, world, []); if (p.st === PS_LUNGE) lunged = true; o.x = 14; o.y = 8; }
    assert(`ragdoll: a piranha still lunges at the dead body and bites it (${o.bodyHits} hit)`, lunged && o.bodyHits > 0);
    // a crab walks up and snaps
    const o2 = createOctopus(12, 11.5); killOctopus(o2, 'test');
    const en2 = createEnemies();
    const c = en2.spawnAt('crab', 10, 11.5, 'floor'); c.dir = 1;
    for (let s = 0; s < 300 && o2.bodyHits === 0; s++) { en2.update(DT, 0, o2, world, []); o2.x = 12; o2.y = 11.5; }
    assert(`ragdoll: a crab snaps at the dead body (${o2.bodyHits} hit)`, o2.bodyHits > 0);
    // a cannon fires at it
    const o3 = createOctopus(20, 6); killOctopus(o3, 'test');
    const en3 = createEnemies();
    en3.spawnAt('cannon', 20, 11.5, 'floor');
    let shots = 0;
    for (let s = 0; s < 300 && o3.bodyHits === 0; s++) { en3.update(DT, 0, o3, world, []); shots = Math.max(shots, en3.shots().length); o3.x = 20; o3.y = 6; }
    assert(`ragdoll: a cannon still aims and fires at the dead body, and the shot hits (${o3.bodyHits})`, shots > 0 && o3.bodyHits > 0);
    // a dashing corpse kills nothing
    const o4 = createOctopus(20, 6); killOctopus(o4, 'test'); o4.vx = 20;
    const en4 = createEnemies();
    const u = en4.spawnAt('piranha', 20.3, 6, 'open');
    en4.update(DT, 0, o4, world, []);
    assert('ragdoll: a flung body never dash-kills an enemy (it is hit instead)', !u.dead && o4.bodyHits === 1);
  }

  // ---- hazards and blasts still shove and hit it ----
  {
    const world = grid((x, y) => y >= 14 || y < 0 || x < 0 || x >= 40);
    const o = createOctopus(10, 8); killOctopus(o, 'test'); o.vx = o.vy = 0;
    const hz = createHazards(null);
    hz.add({ type: 'hazard', hk: HZ_JET, x: 10, y: 13.5, dx: 0, dy: -1, len: 8 });
    hz.update(DT, 0, o, world, null);
    assert(`ragdoll: a current jet shoves the dead body (vy ${o.vy.toFixed(3)})`, o.vy < -0.05);
    const o2 = createOctopus(20, 13); killOctopus(o2, 'test');
    hz.add({ type: 'hazard', hk: HZ_ANEMONE, x: 20, y: 13.4 });
    hz.update(DT, 0, o2, world, null);
    assert('ragdoll: an anemone stings the dead body (a hit, no damage)', o2.bodyHits === 1 && o2.hearts === 0 && hz.events.some((e) => e.type === 'hazardHurt'));
    // a bomb next to the body: the blast throws it clear
    const props = createProps(), rd = createRagdoll(), bombs = createBombs(props);
    const o3 = createOctopus(25, 12.5); o3.feel = true;
    bombs.place(o3, 24.4, 12.6, null, { pinned: true });
    killOctopus(o3, 'test');
    let maxSpeed = 0;
    for (let s = 0; s < 200; s++) { bodyStep(o3, rd, props, world, () => bombs.update(DT, world, o3, noEnemies)); maxSpeed = Math.max(maxSpeed, Math.hypot(o3.vx, o3.vy)); }
    assert(`ragdoll: a bomb blast throws the dead body (top speed ${maxSpeed.toFixed(1)} u/s, now at x ${o3.x.toFixed(1)} from 25)`, maxSpeed > 5 && o3.x > 25.8 && o3.bodyHits >= 1 && !world.isSolid(o3.x, o3.y));
  }

  // ---- the death camera: the body stays in the free part of the screen, centred there when it can be ----
  {
    const layouts = [
      ['1440x900 side panel', 1440, 900, { x0: 0, y0: 56, x1: 1038, y1: 900 }],
      ['412x915 bottom sheet', 412 * 2.625, 915 * 2.625, { x0: 0, y0: 56 * 2.625, x1: 412 * 2.625, y1: 477 * 2.625 }],
      ['915x412 bottom sheet', 915 * 2.625, 412 * 2.625, { x0: 0, y0: 56 * 2.625, x1: 915 * 2.625, y1: 198 * 2.625 }],
    ];
    const rng = mulberry32(7);
    for (const [name, W, H, rect] of layouts) {
      let outside = 0, frames = 0, worstCentre = 0;
      for (let run = 0; run < 40; run++) {
        const cam = createCamera();
        const ww = 36, wh = 60; // a level's size
        let bx = 1.5 + rng() * (ww - 3), by = 1.5 + rng() * (wh - 3);
        let vx = (rng() - 0.5) * 16, vy = (rng() - 0.5) * 16;
        // eases from the live camera for 1.5 s (not strict), then the panel is up (strict)
        for (let f = 0; f < 240; f++) {
          bx = Math.max(1.5, Math.min(ww - 1.5, bx + vx / 60)); by = Math.max(1.5, Math.min(wh - 1.5, by + vy / 60));
          vx *= 0.97; vy *= 0.97;
          const strict = f >= 90;
          updateDeathCamera(cam, W, H, bx, by, ww, wh, 1 / 60, rect, strict);
          if (!strict) continue;
          frames++;
          const sx = W / 2 + (bx - cam.x) * cam.pxPerUnit, sy = H / 2 + (by - cam.y) * cam.pxPerUnit;
          const r = 0.5 * cam.pxPerUnit;
          if (sx - r < rect.x0 || sx + r > rect.x1 || sy - r < rect.y0 || sy + r > rect.y1) outside++;
        }
      }
      // tracking: a still body in mid level ends in the middle of the free rect
      const cam = createCamera();
      for (let f = 0; f < 120; f++) updateDeathCamera(cam, W, H, 18, 30, 36, 60, 1 / 60, rect, f > 60);
      const sx = W / 2 + (18 - cam.x) * cam.pxPerUnit, sy = H / 2 + (30 - cam.y) * cam.pxPerUnit;
      worstCentre = Math.hypot(sx - (rect.x0 + rect.x1) / 2, sy - (rect.y0 + rect.y1) / 2);
      assert(`ragdoll camera ${name}: the body never leaves the free part of the screen once the panel is up (${outside} of ${frames} frames out)`, outside === 0);
      assert(`ragdoll camera ${name}: a body in mid level sits in the middle of the free part (${worstCentre.toFixed(1)} px off)`, worstCentre < 3);
    }
  }
}
