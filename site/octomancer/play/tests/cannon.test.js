// The cannon fish (Daniel, 2026-10-18: "this guy should turn and shoot from its mouth, not have a bazooka"; the Unity
// original had a squish before the strike). Facing clamp, lip side, mouth point, shot spawn, the squash pose, no barrel.
import {
  createEnemies, cannonFacing, cannonMouth, cannonBody, cannonLip, CN_CHARGE, CN_RELOAD, CANNON_ARC, CANNON_WINDUP, CANNON_RECOIL,
  CANNON_SEAT, CANNON_MOUTH_ALONG, CANNON_MOUTH_SIDE,
} from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { drawEnemies, cannonPose } from '../js/enemy-draw.js';
import { resetGameView } from '../js/cull.js';

const DT = 0.02;
const OPEN = { isSolid: () => false, breakTile() {} };
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };

export async function runCannonTests(assert) {
  resetGameView();
  // ---- the facing clamp: never into its own rock
  {
    const out = Math.PI; // a wall fish, rock on its right, facing left
    assert('cannon facing: inside its half plane the facing is kept', Math.abs(angDiff(cannonFacing(out, Math.PI - 0.5), Math.PI - 0.5)) < 1e-9);
    assert('cannon facing: a facing into its rock is clamped to the edge of the half plane',
      Math.abs(angDiff(cannonFacing(out, 0.2), out - CANNON_ARC)) < 1e-9 && Math.abs(angDiff(cannonFacing(out, -0.2), out + CANNON_ARC)) < 1e-9);
    let worst = 0;
    for (let a = -Math.PI; a < Math.PI; a += 0.05) for (const o of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) worst = Math.max(worst, Math.abs(angDiff(cannonFacing(o, a), o)));
    assert(`cannon facing: over every angle and every surface it stays within ${CANNON_ARC.toFixed(2)} rad of its normal (worst ${worst.toFixed(3)})`, worst <= CANNON_ARC + 1e-9);
  }
  // ---- the lip curls away from the rock
  {
    const en = createEnemies();
    const w = en.spawnAt('cannon', 0, 0, 'wall', 1); // rock on the right: faces left
    let ok = true;
    for (let a = w.out - CANNON_ARC; a <= w.out + CANNON_ARC; a += 0.1) {
      w.lip = cannonLip(w, a, w.lip);
      const sideX = -Math.sin(a) * w.lip, sideY = Math.cos(a) * w.lip; // the lip side (the art's right, rotated and mirrored)
      if (sideX * Math.cos(w.out) + sideY * Math.sin(w.out) < -0.5) ok = false; // curls back toward the rock (more than half)
    }
    assert('cannon lip: a wall fish never curls its lip into its own rock at any facing', ok);
    const lipRest = cannonLip(w, w.out, -1), restSideY = Math.cos(w.out) * lipRest;
    assert('cannon lip: a wall fish at rest curls its lip up', restSideY < 0);
    const f = en.spawnAt('cannon', 5, 0, 'floor'); const l0 = f.lip;
    assert('cannon lip: a floor fish looking straight up keeps its lip side (no flicker)', cannonLip(f, f.out, l0) === l0 && cannonLip(f, f.out + 0.05, l0) === l0);
  }
  // ---- the mouth point
  {
    const en = createEnemies();
    const c = en.spawnAt('cannon', 3, 4, 'floor'); c.aim = -Math.PI / 2; c.lip = 1;
    const P = cannonMouth(c, { x: 0, y: 0 });
    // body seated CANNON_SEAT down into its floor; mouth CANNON_MOUTH_ALONG up; the lip side (the art's right) looking up is +x
    assert(`cannon mouth: a floor fish looking up has its mouth above its seated body, to its lip side (${P.x.toFixed(3)}, ${P.y.toFixed(3)})`,
      Math.abs(P.x - (3 + CANNON_MOUTH_SIDE)) < 1e-9 && Math.abs(P.y - (4 + CANNON_SEAT - CANNON_MOUTH_ALONG)) < 1e-9);
    c.lip = -1; cannonMouth(c, P);
    assert('cannon mouth: mirrored, the mouth moves to the other side', Math.abs(P.x - (3 - CANNON_MOUTH_SIDE)) < 1e-9);
    const w = en.spawnAt('cannon', 0, 0, 'wall', 1); w.aim = Math.PI + 0.6; w.lip = cannonLip(w, w.aim, 1);
    cannonMouth(w, P); const B = cannonBody(w, { x: 0, y: 0 });
    const along = (P.x - B.x) * Math.cos(w.aim) + (P.y - B.y) * Math.sin(w.aim);
    assert(`cannon mouth: turned up-left, the mouth is ${CANNON_MOUTH_ALONG} tiles out along its facing (${along.toFixed(3)})`, Math.abs(along - CANNON_MOUTH_ALONG) < 1e-9 && P.x < B.x && P.y < B.y);
  }
  // ---- the shot is spat from the mouth, along the facing; the charge timing is unchanged
  {
    const en = createEnemies();
    const c = en.spawnAt('cannon', 0, 0, 'wall', 1); c.st = CN_RELOAD; c.t = 0.05;
    const o = createOctopus(-4, -3); o.invulnTimer = 1e9;
    let shot = null, mouth = null, charge = 0, sqMax = 0, kickAt = -1;
    for (let i = 0; i < 400 && !shot; i++) {
      en.update(DT, i * DT, o, OPEN, [], null);
      if (c.st === CN_CHARGE) { charge++; sqMax = Math.max(sqMax, c.sq); }
      if (en.shots().length) { shot = en.shots()[0]; mouth = cannonMouth(c, { x: 0, y: 0 }); kickAt = c.kick; }
    }
    assert('cannon spit: it fires at an octopus up and to the left', !!shot);
    if (shot) {
      const d = Math.hypot(shot.x - shot.vx * DT - mouth.x, shot.y - shot.vy * DT - mouth.y); // the shot has had its first step
      assert(`cannon spit: the shot starts at its mouth (${d.toFixed(3)} tiles off)`, d < 1e-6);
      assert('cannon spit: the shot flies along the fish\'s facing', Math.abs(angDiff(Math.atan2(shot.vy, shot.vx), c.aim)) < 1e-9);
      assert(`cannon spit: the squish runs the whole ${CANNON_WINDUP} s charge (${(charge * DT).toFixed(2)} s, squash up to ${sqMax.toFixed(2)})`, Math.abs(charge * DT - CANNON_WINDUP) < 0.03 && sqMax > 0.9);
      assert('cannon spit: the recoil starts on the spit and the squash is let go', kickAt === CANNON_RECOIL && c.sq === 0);
    }
  }
  // ---- the pose: squish while charging, snap long on the spit, settle back
  {
    const P = { along: 1, across: 1, shift: 0 };
    cannonPose({ sq: 0, kick: 0 }, P);
    assert('cannon pose: at rest it is its own shape', P.along === 1 && P.across === 1 && P.shift === 0);
    cannonPose({ sq: 1, kick: 0 }, P);
    assert('cannon pose: fully charged it is squashed to half along its facing, 1.25x across, its back still on its rock',
      Math.abs(P.along - 0.5) < 1e-9 && Math.abs(P.across - 1.25) < 1e-9 && Math.abs(P.shift + 0.225) < 1e-9);
    cannonPose({ sq: 0, kick: CANNON_RECOIL - 0.04 }, P);
    assert('cannon pose: just after the spit it snaps long (stretched along, thin across)', P.along > 1.2 && P.across < 0.75 && P.shift > 0);
    cannonPose({ sq: 0, kick: 0.001 }, P);
    assert('cannon pose: at the end of the recoil it is back to its own shape', Math.abs(P.along - 1) < 0.01 && Math.abs(P.across - 1) < 0.01);
  }
  // ---- no barrel: the draw is a sprite and (just after a spit) a few bubbles; no rects, no gradients
  {
    const calls = [];
    const ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; return () => { calls.push(k); return { addColorStop() {} }; }; }, set(t, k, v) { t[k] = v; return true; } });
    const en = createEnemies(); const c = en.spawnAt('cannon', 0, 0, 'floor'); c.st = CN_CHARGE; c.tell = c.sq = 0.7;
    const c2 = en.spawnAt('cannon', 3, 0, 'floor'); c2.kick = CANNON_RECOIL - 0.1; c2.mx = 3; c2.my = -0.3; c2.fa = -1.2;
    drawEnemies(ctx, { x: 0, y: 0, pxPerUnit: 50 }, (cam, cw, ch, x, y) => ({ x: cw / 2 + x * 50, y: ch / 2 + y * 50 }), 800, 600, en.all(), [], 1, 1);
    assert('cannon draw: no barrel and no glow (no rect, no gradient)', !calls.some((k) => k === 'rect' || k === 'fillRect' || k === 'createRadialGradient'));
    assert('cannon draw: the spit puff draws a few bubbles', calls.filter((k) => k === 'arc').length >= 4);
  }
}
