// V2-PLAN 16 point 5: friendly NPCs are killable and aggroable (npcs.js) on a fake world: an open box of water with an optional wall.
import { createNpcs, createMoods, resetMoods, NPC_MARLO, NPC_PIP, NPC_QUILL, NPC_HOST, NPC_HP, FL_SEALED, FL_CAGED, FL_FOLLOWING, FL_TALKING, AIM_S, BUMP_MAX } from '../js/npcs.js';
import { isSafeZone, safeZoneHit, resolveHit, SAFE_ZONE } from '../js/creature-rules.js';
import { createOctopus } from '../js/octopus.js';
import { DASH_KILL_SPEED } from '../js/config.js';
import { STEP } from '../js/loop.js';

/** Water everywhere in 0..60 x 0..30 except a wall column at x in [wall0, wall1) (null: no wall). */
function fakeWorld(wall0 = null, wall1 = null) {
  return { isSolid(x, y) { return x < 0 || y < 0 || x >= 60 || y >= 30 || (wall0 !== null && x >= wall0 && x < wall1); } };
}
const LINES = { marlo: { hurt: ['Ow!'], angry: ['Back off!'] }, pip: { hurt: ['Squeak!'] }, quill: { hurt: ['Rude!'] }, host: { hurt: ['Hey!'] } };
function setup(world, opts = {}) {
  const calls = [];
  const sys = createNpcs(world, { moods: opts.moods, hub: !!opts.hub, safe: opts.safe, lines: LINES, onKeeper: (r) => calls.push(r) });
  const octo = createOctopus(opts.ox === undefined ? 10 : opts.ox, opts.oy === undefined ? 15 : opts.oy);
  const evs = [];
  const run = (n, place) => { for (let i = 0; i < n; i++) { if (place) place(); octo.invulnTimer = Math.max(0, octo.invulnTimer - STEP); sys.step(octo, STEP); sys.drain((e) => evs.push(e)); } };
  return { sys, octo, evs, calls, run };
}

export async function runNpcTests(assert) {
  // ---- health pools ----
  assert('health pools differ per NPC (Marlo 6, Pip 2, Quill 4, host 5)', NPC_HP[NPC_MARLO] === 6 && NPC_HP[NPC_PIP] === 2 && NPC_HP[NPC_QUILL] === 4 && NPC_HP[NPC_HOST] === 5);
  {
    const t = setup(fakeWorld());
    const hps = [NPC_MARLO, NPC_PIP, NPC_QUILL, NPC_HOST].map((w, k) => { t.sys.place(w, 30 + k * 3, 15); return t.sys.data.hp[t.sys.find(w, 0)]; });
    assert('a placed NPC starts with its own pool', hps.join() === '6,2,4,5');
  }

  // ---- blasts ----
  {
    const t = setup(fakeWorld(24, 26));
    t.sys.place(NPC_QUILL, 22, 15.65); t.sys.place(NPC_PIP, 28, 15); // quill on the near side of the wall, pip behind it
    t.run(1, () => { t.sys.place(NPC_QUILL, 22, 15.65); t.sys.place(NPC_PIP, 28, 15); });
    const hit = t.sys.blast(20.5, 15, 2.5);
    t.sys.drain((e) => t.evs.push(e));
    const q = t.sys.list().find((n) => n.who === 'quill' && !n.dead), p = t.sys.list().find((n) => n.who === 'pip');
    assert('a blast hurts and angers a calm NPC (inside its radius it kills: one angered and one killed event)', hit === 1 && !q && t.evs.filter((e) => e.type === 'angered' && e.name === 'quill').length === 1 && t.evs.some((e) => e.type === 'killed' && e.name === 'quill'));
    // 2026-10-08 (unified creature rules): a bomb is the same for everyone: inside its radius it kills any NPC, as it kills any fish;
    // out to twice the radius it only shoves (no damage, no anger)
    assert('a bomb kills an NPC inside its radius; beyond it only shoves (no hurt, no anger)', (() => { const s = setup(fakeWorld()); s.sys.place(NPC_MARLO, 20, 15.55); s.sys.place(NPC_QUILL, 24.2, 15.65); s.sys.blast(20, 15, 2.5); const l = s.sys.list(); const m = l.find((n) => n.who === 'marlo' && !n.dead), qq = l.find((n) => n.who === 'quill'); return m === undefined && s.sys.moods.dead[NPC_MARLO] === 1 && qq && qq.hp === 4 && !qq.hostile; })());
    assert('a blast through rock does not hurt (the wall shields Pip)', p.hp === 2 && !p.hostile);
    t.sys.blast(29.5, 15, 2.5); // same side, but the wall is not between this blast and Pip
    assert('a blast on the open side does', t.sys.moods.dead[NPC_PIP] === 1 || t.sys.list().find((n) => n.who === 'pip').hostile);
  }

  // ---- Marlo sealed in his pocket ----
  {
    const t = setup(fakeWorld());
    const place = (fl) => () => t.sys.place(NPC_MARLO, 20, 15.55, 0, fl);
    t.run(1, place(FL_SEALED));
    t.sys.blast(20, 15, 2.5); t.sys.hit(20, 15, 1, 5, 'ink');
    const m0 = t.sys.list().find((n) => n.who === 'marlo');
    assert('Marlo is immune while sealed in the rock (a bomb frees him, never hurts him)', m0.hp === 6 && !m0.hostile);
    t.run(1, place(0)); // freed
    t.sys.blast(20, 15, 2.5);
    assert('and for 1 s after he is freed', t.sys.list().find((n) => n.who === 'marlo').hp === 6);
    t.run(55, place(0));
    t.sys.blast(20, 15, 2.5);
    const m1 = t.sys.list().find((n) => n.who === 'marlo');
    assert('after that a blast kills him (or hurts him)', m1 === undefined || m1.hp < 6);
  }
  {
    const t = setup(fakeWorld(), { ox: 20, oy: 15 });
    t.sys.place(NPC_PIP, 20, 15, 0, FL_CAGED); t.sys.step(t.octo, STEP);
    assert('a caged Pip cannot be hurt by a blast', t.sys.blast(20, 15, 2.5) === 0 && t.sys.list()[0].hp === 2);
  }

  // ---- hostile Marlo: aim, harpoon, hit ----
  {
    const t = setup(fakeWorld(), { ox: 10, oy: 15 });
    t.sys.spawn(NPC_MARLO, 17, 15.55, true);
    let aimFirst = -1, aimSteps = 0, shot = -1, shotsSeen = 0, hearts0 = t.octo.hearts, hitStep = -1;
    for (let i = 0; i < 400; i++) {
      t.run(1);
      const m = t.sys.list().find((n) => n.who === 'marlo');
      if (m.state === 'aim') { if (aimFirst < 0) aimFirst = i; aimSteps++; }
      if (shot < 0 && t.sys.harpoonList().length) { shot = i; }
      if (shot >= 0 && t.octo.hearts < hearts0 && hitStep < 0) hitStep = i;
      if (hitStep >= 0) break;
    }
    const telegraph = aimSteps * STEP;
    assert('hostile Marlo shows the aim telegraph for 0.6-0.8 s before the harpoon spawns', aimFirst >= 0 && telegraph >= 0.6 && telegraph <= 0.8 && shot >= aimFirst + Math.round(AIM_S / STEP) - 1);
    assert('the harpoon flies (fast, toward the octopus) and the hit costs 2 hearts', hitStep > shot && hearts0 - t.octo.hearts === 2 && t.octo.cause === 'harpoon');
    assert('the harpoon is gone after the hit', t.sys.harpoonList().length === 0);
    assert('Marlo keeps his distance (4-7 tiles)', (() => { const m = t.sys.list().find((n) => n.who === 'marlo'); const d = Math.hypot(m.x - t.octo.x, m.cy - t.octo.y); return d > 3.5 && d < 7.2; })());
  }
  {
    // reload: a second shot only after 1.6 s
    const t = setup(fakeWorld(), { ox: 10, oy: 15 }); t.octo.invulnTimer = 0;
    t.sys.spawn(NPC_MARLO, 17, 15.55, true);
    const shots = [];
    for (let i = 0; i < 600; i++) { t.run(1); t.octo.hearts = 3; t.octo.invulnTimer = 5; t.sys.drain(() => {}); const e = t.evs.filter((x) => x.type === 'harpoon'); if (e.length > shots.length) shots.push(i); }
    assert('Marlo fires again only after the reload (at least 1.6 s + the aim)', shots.length >= 2 && (shots[1] - shots[0]) * STEP >= 1.6 + AIM_S - 0.1);
  }
  {
    const t = setup(fakeWorld(24, 26), { ox: 10, oy: 15 });
    t.sys.spawn(NPC_MARLO, 30, 15.55, true);
    let aimed = 0, spawned = 0;
    for (let i = 0; i < 400; i++) { t.run(1); if (t.sys.list()[0].state === 'aim') aimed++; if (t.evs.some((e) => e.type === 'harpoon')) spawned++; }
    assert('no aim and no shot without a clear line (a wall between)', aimed === 0 && spawned === 0 && t.octo.hearts === 3);
  }

  // ---- melee: Pip, Quill, host ----
  for (const [who, name, cause] of [[NPC_PIP, 'pip', 'pip'], [NPC_QUILL, 'quill', 'quill'], [NPC_HOST, 'host', 'host']]) {
    const t = setup(fakeWorld(), { ox: 10, oy: 15 });
    t.sys.spawn(who, 16, 15.7, true);
    let windAt = -1, lungeAt = -1, biteAt = -1, h0 = t.octo.hearts;
    for (let i = 0; i < 500 && biteAt < 0; i++) {
      t.run(1);
      const m = t.sys.list()[0];
      if (m.state === 'wind' && windAt < 0) windAt = i;
      if (m.state === 'lunge' && lungeAt < 0) lungeAt = i;
      if (t.octo.hearts < h0) biteAt = i;
    }
    assert(`${name}: chases, winds up for 0.35 s, then lunges and bites for one heart`, windAt >= 0 && lungeAt - windAt >= 16 && lungeAt - windAt <= 19 && biteAt >= lungeAt && h0 - t.octo.hearts === 1 && t.octo.cause === cause);
  }

  // ---- death ----
  {
    const t = setup(fakeWorld());
    t.sys.place(NPC_PIP, 20, 15);
    t.sys.hurt(NPC_PIP, 1); t.sys.drain((e) => t.evs.push(e));
    t.sys.hurt(NPC_PIP, 5); t.sys.drain((e) => t.evs.push(e));
    t.run(3);
    const k = t.evs.filter((e) => e.type === 'killed');
    assert('killing an NPC emits one killed event {kind, x, y, vx, vy, face} and no drop', k.length === 1 && k[0].kind === 'npc-pip' && 'x' in k[0] && 'vy' in k[0] && 'face' in k[0] && !t.evs.some((e) => e.type === 'drop' || e.type === 'shells'));
    assert('the dead NPC is gone, the mood record says dead, the owner may not place it again', t.sys.list().every((n) => n.who !== 'pip' || n.dead) && t.sys.moods.dead[NPC_PIP] === 1 && t.sys.place(NPC_PIP, 20, 15) === false);
    assert('a hurt line is spoken on a hit (before the death)', LINES.pip.hurt.length === 1);
  }
  {
    const t = setup(fakeWorld());
    t.sys.place(NPC_QUILL, 20, 15.65);
    t.sys.hurt(NPC_QUILL, 1);
    assert('a hit makes a hurt line show in the NPC speech bubble', t.sys.talks[t.sys.find(NPC_QUILL, 0)].text === 'Rude!');
  }

  // ---- aggro persists across levels of a dive, resets for a new dive ----
  {
    const moods = createMoods();
    const a = setup(fakeWorld(), { moods });
    a.sys.place(NPC_HOST, 30, 16, 0);
    a.sys.hurt(NPC_HOST, 1);
    const b = setup(fakeWorld(), { moods }); // the next level of the same dive
    const placed = b.sys.place(NPC_HOST, 30, 16, 0);
    assert('aggro persists into the next level of the dive: the host is hostile there at once and the owner cannot draw it', placed === false && b.sys.list()[0].hostile && b.sys.list()[0].hp === NPC_HP[NPC_HOST] - 1);
    resetMoods(moods);
    const c = setup(fakeWorld(), { moods });
    assert('a new dive resets the mood record: calm again, full health', c.sys.place(NPC_HOST, 30, 16, 0) === true && !c.sys.list()[0].hostile && c.sys.list()[0].hp === NPC_HP[NPC_HOST]);
  }

  // ---- safe zones (2026-10-18, Daniel: "In the hub everyone should be invincible; you can only knock them around") ----
  assert('safe zones are keyed on the level: the hub and the rest grotto, not a dive level or the tutorial', isSafeZone('hub') && isSafeZone('rest') && !isSafeZone('biome') && !isSafeZone('tutorial') && !isSafeZone(''));
  assert('safeZoneHit: a bomb on Marlo deals nothing, kills nothing, stuns nothing, still shoves', (() => { const o = safeZoneHit(resolveHit('marlo', 'bomb')); return o.dmg === 0 && !o.kill && o.stun === 0 && o.knock >= SAFE_ZONE.knockMin; })());
  {
    const harmed = (t) => t.evs.some((e) => e.type === 'hurt' || e.type === 'angered' || e.type === 'killed');
    const calm = (t, who) => { const n = t.sys.list().find((m) => m.who === who); return !!n && !n.dead && !n.hostile && n.hp === NPC_HP[NPC_MARLO]; };
    for (const zone of ['hub', 'rest']) {
      const mk = () => { const t = setup(fakeWorld(), { hub: zone === 'hub', safe: true, ox: 10, oy: 15 }); t.who = NPC_MARLO; t.spot = () => t.sys.place(NPC_MARLO, 20, 15.55); t.spot(); return t; };
      // the Ink Jet, 20 times
      const t = mk();
      let pushed = 0;
      for (let k = 0; k < 20; k++) { t.sys.hit(19.6, 15, 0.2, 4, 'ink'); t.sys.drain((e) => t.evs.push(e)); t.run(3, t.spot); pushed = Math.max(pushed, Math.hypot(t.sys.offset(NPC_MARLO).x, t.sys.offset(NPC_MARLO).y)); }
      assert(`${zone}: 20 Ink Jet hits on Marlo: no damage, no anger, no death`, calm(t, 'marlo') && !harmed(t), JSON.stringify(t.sys.list()));
      assert(`${zone}: ... but every hit pushes him off his spot (never further than BUMP_MAX)`, pushed > 0.1 && pushed <= BUMP_MAX + 1e-6 && t.sys.offset(NPC_MARLO).x >= 0, pushed);
      assert(`${zone}: ... and he says a bumped line (not once per hit)`, t.evs.filter((e) => e.type === 'bumped').length >= 1 && t.evs.filter((e) => e.type === 'bumped').length <= 3);
      t.run(150, t.spot);
      assert(`${zone}: ... then springs back to his spot`, Math.hypot(t.sys.offset(NPC_MARLO).x, t.sys.offset(NPC_MARLO).y) < 0.05);
      // a bomb going off on him
      const b = mk();
      const hurtN = b.sys.blast(20, 15, 2.5); b.sys.drain((e) => b.evs.push(e)); b.run(2, b.spot);
      assert(`${zone}: a bomb blast on Marlo: alive, calm, full health, still pushed`, hurtN === 0 && calm(b, 'marlo') && !harmed(b) && Math.hypot(b.sys.offset(NPC_MARLO).x, b.sys.offset(NPC_MARLO).y) > 0.02);
      // a thrown prop (INFIGHT.projectile) and a dash (with and without the Urchin Cap), through the family adapter
      const th = mk();
      const dealt = th.sys.family.apply(th.sys.find(NPC_MARLO, 0), 'thrown', 18, 14.9, -1, 1, true); th.sys.drain((e) => th.evs.push(e)); th.run(2, th.spot);
      assert(`${zone}: a thrown pot: no damage, no anger, pushed away from it`, dealt === 0 && calm(th, 'marlo') && !harmed(th) && th.sys.offset(NPC_MARLO).x > 0.02);
      for (const cap of [false, true]) {
        const ds = mk();
        ds.octo.x = 19.5; ds.octo.y = 15; ds.octo.vx = 15; ds.octo.vy = 0; ds.octo.dashedThisStep = true; ds.octo.spikeHelmet = cap;
        ds.sys.step(ds.octo, STEP); ds.sys.drain((e) => ds.evs.push(e)); ds.run(2, ds.spot);
        assert(`${zone}: a dash into Marlo${cap ? ' with the Urchin Cap' : ''}: no damage, no anger, he is bumped`, calm(ds, 'marlo') && !harmed(ds) && ds.evs.some((e) => e.type === 'bumped'));
      }
      // the damage-entry sources (spikes, a boulder, Anchor) and the test hook
      const h = mk();
      for (const src of ['spikes', 'boulder', 'anchor', 'harpoon', 'claw', 'bite', 'shock', 'snap', 'grab']) h.sys.family.apply(h.sys.find(NPC_MARLO, 0), src, 20, 16, -1, 1, true);
      h.sys.hurt(NPC_MARLO, 99); h.sys.drain((e) => h.evs.push(e));
      assert(`${zone}: no source of the table hurts, angers or kills anyone in a safe zone`, calm(h, 'marlo') && !harmed(h));
      // a jet, a Riptide, a ghost's blow: a push that never carries him out of his room
      const j = mk();
      for (let k = 0; k < 200; k++) { j.sys.family.push(j.sys.find(NPC_MARLO, 0), 0.6, 0, 'drift'); j.sys.family.push(j.sys.find(NPC_MARLO, 0), 3, 0, 'knock'); j.run(1, j.spot); }
      const far = Math.hypot(j.sys.offset(NPC_MARLO).x, j.sys.offset(NPC_MARLO).y);
      j.run(150, j.spot);
      assert(`${zone}: a long push (a jet, a Riptide) moves him at most BUMP_MAX off his spot, and he comes back`, far > 0.3 && far <= BUMP_MAX + 1e-6 && Math.hypot(j.sys.offset(NPC_MARLO).x, j.sys.offset(NPC_MARLO).y) < 0.05, far);
      // the octopus: nothing a person does reaches her (a grudge from the dive keeps away instead of attacking)
      const g = setup(fakeWorld(), { hub: zone === 'hub', safe: true, ox: 10, oy: 15 });
      g.sys.spawn(NPC_MARLO, 15, 15.55, true); g.sys.spawn(NPC_PIP, 12, 15, true); g.sys.spawn(NPC_QUILL, 11, 15.65, true);
      g.run(300);
      assert(`${zone}: someone already angry (a dive's grudge) keeps away: no harpoon, no bite`, g.octo.hearts === 3 && g.sys.harpoonList().length === 0 && g.sys.list().every((n) => n.state === 'flee' || n.state === 'calm'));
      g.sys.hurt(NPC_QUILL, 9); g.sys.drain((e) => g.evs.push(e));
      assert(`${zone}: ... and cannot be killed either`, !g.evs.some((e) => e.type === 'killed'));
    }
  }

  // ---- dash ----
  {
    const t0 = setup(fakeWorld(), { ox: 20, oy: 15 }); // Actions tuning: a bare dash hurts nobody
    t0.sys.place(NPC_QUILL, 20.2, 15.65);
    t0.octo.dashedThisStep = true; t0.octo.vx = DASH_KILL_SPEED + 6; t0.octo.vy = 0; t0.sys.place(NPC_QUILL, 20.2, 15.65, 0, 0); t0.sys.step(t0.octo, STEP);
    assert('a dash without the Urchin Cap neither hurts nor angers', t0.sys.list()[0].hp === 4 && !t0.sys.list()[0].hostile);
    const t = setup(fakeWorld(), { ox: 20, oy: 15 });
    t.octo.spikeHelmet = true;
    const fast = () => { t.octo.vx = DASH_KILL_SPEED + 6; t.octo.vy = 0; };
    t.sys.place(NPC_QUILL, 20.2, 15.65);
    t.octo.dashedThisStep = true; fast(); t.sys.place(NPC_QUILL, 20.2, 15.65, 0, 0); t.sys.step(t.octo, STEP);
    let q = t.sys.list()[0];
    assert('a dash at speed hurts (2) and angers', q.hp === 2 && q.hostile);
    t.octo.dashedThisStep = false; fast(); t.sys.step(t.octo, STEP); t.sys.step(t.octo, STEP);
    assert('at most once per dash', t.sys.list()[0].hp === 2);
    const t2 = setup(fakeWorld(), { ox: 20, oy: 15 });
    t2.octo.dashedThisStep = true; t2.octo.vx = 15; t2.octo.spikeHelmet = true;
    t2.sys.place(NPC_PIP, 20.2, 15, 0, FL_FOLLOWING); t2.sys.step(t2.octo, STEP);
    t2.sys.place(NPC_PIP, 20.2, 15, 0, FL_CAGED); t2.sys.step(t2.octo, STEP);
    assert('Pip cannot be dash-hit while he follows you or while caged', t2.sys.list()[0].hp === 2 && !t2.sys.list()[0].hostile);
    const t3 = setup(fakeWorld(), { ox: 20, oy: 15 }); // solo / co-op dives are unchanged: ink still hurts and angers a person in a level
    t3.sys.place(NPC_MARLO, 20.2, 15.55, 0, 0);
    t3.sys.hit(20, 15, 1, 1, 'ink');
    assert('in a dive level ink (the Ink Jet hook) does hurt and anger them', t3.sys.list()[0].hp === 5 && t3.sys.list()[0].hostile);
  }

  // ---- the shopkeeper is not ours ----
  {
    const t = setup(fakeWorld(), { ox: 40, oy: 5 });
    t.sys.setKeeper(20, 15);
    t.sys.blast(19, 15, 2.5);
    t.sys.hit(20, 15, 0.5, 1, 'ink');
    t.octo.x = 20; t.octo.y = 15; t.octo.vx = DASH_KILL_SPEED + 4; t.octo.dashedThisStep = true; t.octo.spikeHelmet = true; t.sys.step(t.octo, STEP);
    assert('a blast, an ink hit and a dash at the keeper each call shopAggro (nothing else)', t.calls.join() === 'bomb,ink,dash' && t.sys.list().length === 0);
    const t2 = setup(fakeWorld(24, 26), { ox: 40, oy: 5 });
    t2.sys.setKeeper(28, 15); t2.sys.blast(20, 15, 3);
    assert('rock between the blast and the keeper shields him', t2.calls.length === 0);
  }
}
