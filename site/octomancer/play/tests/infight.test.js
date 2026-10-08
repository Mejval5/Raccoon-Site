// Enemy infighting, Spelunky style (2026-10-08, Daniel: "mostly they should ignore each other, aside from a few interactions that
// make sense (e.g. projectiles just hit anything, but touch enemies don't hurt other touch enemies generally)").
//  - the table: INFIGHT rules each carry a reason; only the manta's slam and the Beholder stay octopus-only
//  - projectiles (shot, harpoon, thrown, claw in flight) vs every creature kind, through the real systems and the table
//  - no contact damage between touch enemies (piranha, crab, manta, urchin, horns, anemone, clam)
//  - each deliberate interaction: piranha frenzy (bleeding, knocked out, fresh corpse), clam snap, tentacle grab, keeper claws,
//    a thrown bomb, with the right blame (an enemy's attack never angers an NPC or the keeper; her own throw does)
//  - the target override hook (setLure) for a future Lure spell
import {
  CREATURES, CREATURE_KINDS, SOURCES, INFIGHT, INFIGHT_RULES, INFIGHT_KILL, infightReach, resolveHit, rowOf, FRESH_S, CORPSE_BITES,
} from '../js/creature-rules.js';
import { createDamage } from '../js/damage.js';
import { createInfight, LURE_R } from '../js/infight.js';
import { createEnemies, setHpMode, PS_PATROL } from '../js/enemies.js';
import { createCreatures, CR_GCLAM, CR_TENTACLE, CL_OPEN, CL_TREMBLE, TN_REACH } from '../js/creatures.js';
import { createNpcs, npcByName } from '../js/npcs.js';
import { createKeepers, addKeeper, keeperFamily, stepKeepers, KM_ANGRY, KM_CALM, KEEPER_HP } from '../js/shopkeeper.js';
import { createHazards } from '../js/hazards.js';
import { createProps, PK_BOMB } from '../js/props.js';
import { createCorpses } from '../js/corpses.js';
import { createOctopus } from '../js/octopus.js';
import { resetGameView } from '../js/cull.js';

const DT = 1 / 60;
function fake(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  const world = {
    w, h, tiles, width: w, height: h,
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
  };
  return world;
}
const room = (w, h) => fake(Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#')));
const OPEN = { isSolid: () => false, tileAt: () => 0 };
const PLACE = { crab: 'floor', cannon: 'floor', urchin: 'floor', horns: 'floor' };

/** A level in miniature: every family registered in one damage entry, an infight runtime on it, the systems wired. */
function makeLevel(world = OPEN) {
  const dm = createDamage(), en = createEnemies(), cr = createCreatures(), k = createKeepers(), npcs = createNpcs(world, { onKeeper: () => {} });
  const corpses = createCorpses(), props = createProps();
  dm.register(en.family); dm.register(cr.family()); dm.register(npcs.family); dm.register(keeperFamily(k));
  const inf = createInfight(dm, { corpses: () => corpses, props: () => props });
  en.setInfight(inf); cr.setInfight(inf); npcs.setInfight(inf);
  return { dm, en, cr, k, npcs, corpses, props, inf, world };
}
/** One fixed step of the systems that act (enemies, creatures, NPCs, keepers), the clocks, the corpses, thrown props. */
function stepLevel(L, octo, n = 1) {
  for (let s = 0; s < n; s++) {
    L.dm.tick(DT); L.inf.tick(DT);
    L.en.update(DT, 0, octo, L.world, [], null);
    L.inf.stepThrown();
    L.corpses.update(DT, L.world, null);
    L.cr.update(DT, octo, L.world, null);
    L.npcs.step(octo, DT);
    stepKeepers(L.k, DT, octo, L.world, L.inf);
    for (const ev of L.en.events) if (ev.type === 'enemyKilled') L.killed.push(ev);
    for (const ev of L.cr.events) if (ev.type === 'killed') L.killed.push(ev);
  }
}
/** A body of `kind` in level L at (x, y): returns accessors over its real record. */
function addBody(L, kind, x, y, openShell = true) {
  const row = rowOf(kind);
  if (row.family === 'enemy') { const e = L.en.spawnAt(kind, x, y, PLACE[kind] || 'open'); return { id: e.id, alive: () => !e.dead, hp: () => e.hp, rec: e }; }
  if (row.family === 'creature') {
    const i = L.cr.add({ type: 'creature', ck: kind === 'gclam' ? CR_GCLAM : CR_TENTACLE, x, y, dx: 0, dy: -1, side: 1, tilt: 0 });
    if (openShell) { if (kind === 'gclam') { L.cr.data.state[i] = CL_OPEN; L.cr.data.ang[i] = 1; } else L.cr.data.state[i] = TN_REACH; }
    const cy = kind === 'gclam' ? L.cr.data.y[i] : L.cr.data.y[i];
    return { alive: () => L.cr.data.alive[i] === 1, hp: () => L.cr.data.hp[i], i, cx: L.cr.data.x[i], cy };
  }
  if (row.family === 'npc') { const i = L.npcs.spawn(npcByName(kind), x, y + 0.5, false); return { alive: () => L.npcs.data.used[i] === 1, hp: () => L.npcs.data.hp[i], i }; }
  if (row.family === 'keeper') { const i = addKeeper(L.k, x, y, KM_CALM, 1); return { alive: () => L.k.mode[i] !== 3, hp: () => L.k.hp[i], i }; }
  return null;
}
const farOcto = () => { const o = createOctopus(200, 200); o.invulnTimer = 1e9; return o; };

export async function runInfightTests(assert) {
  setHpMode(true);
  resetGameView();
  try {
    // ---- the table ----
    {
      assert(`infight table: ${INFIGHT_RULES.length} deliberate rules (projectile, frenzy, snap, grab, claw), each with its reason`,
        INFIGHT_RULES.join() === 'projectile,frenzy,snap,grab,claw' && INFIGHT_RULES.every((r) => INFIGHT[r].why && INFIGHT[r].src.every((s) => SOURCES[s])));
      const octoOnly = Object.keys(SOURCES).filter((s) => SOURCES[s].octoOnly);
      assert('infight table: only the manta\'s dive slam and the Beholder stay octopus-only', octoOnly.join() === 'slam,beholder');
      assert('infight table: shot, harpoon and thrown are projectiles; an enemy attack is never her fault by default', ['shot', 'harpoon', 'thrown'].every((s) => SOURCES[s].projectile && SOURCES[s].blame === 'cause') && ['claw', 'bite', 'snap', 'grab'].every((s) => SOURCES[s].blame === 'none'));
      assert('infight reach: frenzy = bleeding, knocked out or a fresh corpse; a healthy body is left alone',
        infightReach('frenzy', 'crab', true) && infightReach('frenzy', 'crab', false, 0.5) && infightReach('frenzy', '', false, 0, true) && !infightReach('frenzy', 'crab') && !infightReach('frenzy', 'keeper'));
      assert('infight reach: a grab takes free swimmers and walkers, never an anchored or invulnerable body',
        infightReach('grab', 'piranha') && infightReach('grab', 'crab') && infightReach('grab', 'keeper') && infightReach('grab', 'marlo') && !infightReach('grab', 'urchin') && !infightReach('grab', 'gclam') && !infightReach('grab', 'horns'));
      const touch = CREATURE_KINDS.filter((k) => CREATURES[k].touch);
      assert(`touch enemies (${touch.join(', ')}): the anemone's sting never hurts them; it still stings the keeper and the NPCs`,
        ['piranha', 'crab', 'manta', 'urchin', 'horns', 'gclam'].every((k) => touch.includes(k)) && touch.every((k) => resolveHit(k, 'anemone').ignore) && !resolveHit('keeper', 'anemone').ignore && !resolveHit('marlo', 'anemone').ignore);
      assert('infight kills are not hers (no score / journal kill): shot, harpoon, claw, bite, snap, grab', ['shot', 'harpoon', 'claw', 'bite', 'snap', 'grab'].every((s) => INFIGHT_KILL[s]) && !INFIGHT_KILL.bomb && !INFIGHT_KILL.ink && !INFIGHT_KILL.thrown);
    }

    // ---- projectiles vs every creature kind ----
    {
      const kinds = CREATURE_KINDS.filter((k) => ['enemy', 'creature', 'npc', 'keeper'].includes(rowOf(k).family) && !rowOf(k).boss);
      const wrong = [];
      let cells = 0;
      for (const src of ['shot', 'harpoon', 'thrown', 'claw']) {
        for (const kind of kinds) {
          for (const open of rowOf(kind).shell ? [true, false] : [true]) {
            const L = makeLevel(); L.killed = [];
            const b = addBody(L, kind, 10, 10, open);
            const V = L.dm.view;
            let bx = 10, by = 10;
            L.dm.each((f, i, v) => { bx = v.x; by = v.y; });
            const hp0 = b.hp(), shut = !open && !!rowOf(kind).shell;
            const o = { ...resolveHit(kind, src, -1, shut) };
            const r = src === 'claw' ? L.inf.strike('claw', 'claw', bx, by, 0.3, -999) : L.inf.projectile(src, bx, by, 0.3, -999);
            cells++;
            const tag = `${src}->${kind}${rowOf(kind).shell ? (open ? '(open)' : '(shut)') : ''}`;
            if (r < 0) { wrong.push(tag + ' not touched'); continue; }
            const lethal = !o.ignore && (o.kill || (o.dmg > 0 && o.dmg >= (Number.isFinite(hp0) ? hp0 : rowOf(kind).hp)));
            if (o.ignore) { if (r !== 0 || !b.alive()) wrong.push(tag + ' should stop but do nothing'); }
            else if (lethal) { if (b.alive()) wrong.push(tag + ' should kill'); }
            else if (!b.alive() || (Number.isFinite(hp0) && Math.abs(hp0 - o.dmg - b.hp()) > 1e-3)) wrong.push(`${tag} hp ${hp0}->${b.hp()} (table ${o.dmg})`);
            void V;
          }
        }
      }
      assert(`projectiles: shot, harpoon, thrown and a claw in flight hit every creature kind exactly as the table says (${cells} cells)${wrong.length ? ' -- ' + wrong.slice(0, 5).join('; ') : ''}`, wrong.length === 0 && cells >= 4 * 15);
      const L = makeLevel(); L.killed = [];
      const p = L.en.spawnAt('piranha', 10, 10);
      assert('projectiles: a shot never hits its own shooter', L.inf.projectile('shot', 10, 10, 0.3, p.id) === -1 && !p.dead);
      assert('projectiles: nothing there, nothing hit', L.inf.projectile('shot', 30, 30, 0.3, 0) === -1);
    }
    // the real flights: a cannon shot, Marlo's harpoon, a keeper's claw, a thrown bomb
    {
      const L = makeLevel(room(24, 14)); L.killed = [];
      const can = L.en.spawnAt('cannon', 4, 12.4, 'floor');
      const p = L.en.spawnAt('piranha', 9, 12.4); p.stun = 5; // knocked out on the shot's line
      const octo = farOcto();
      L.en.shots().push({ x: 4.5, y: 12.4, vx: 5, vy: 0, radius: 0.25, dead: false, owner: can.id, oc: 0 });
      stepLevel(L, octo, 80);
      assert('cannon shot: it flies past its own cannon and hits the fish in its way (6 dmg kills a piranha), then it is gone', p.dead && !can.dead && L.en.shots().length === 0 && L.killed.some((e) => e.kind === 'piranha' && e.reason === 'shot'));
    }
    {
      const L = makeLevel(room(24, 14)); L.killed = [];
      const mi = L.npcs.spawn(npcByName('marlo'), 4, 8, true);
      const crab = L.en.spawnAt('crab', 9, 12.6, 'floor');
      const h = L.npcs.harpoons; h.on[0] = 1; h.x[0] = 5; h.y[0] = 12.4; h.vx[0] = 13; h.vy[0] = 0; h.ang[0] = 0; h.life[0] = 2; h.owner[0] = -100 - mi;
      const octo = farOcto();
      const hp0 = crab.hp;
      stepLevel(L, octo, 30);
      assert(`harpoon: Marlo's harpoon hits a crab in its way (${hp0} -> ${crab.dead ? 'dead' : crab.hp}) and stops there`, (crab.dead || crab.hp < hp0) && h.on[0] === 0);
    }
    {
      const L = makeLevel(room(24, 14)); L.killed = [];
      addKeeper(L.k, 4, 8, KM_ANGRY, 1);
      const p = L.en.spawnAt('piranha', 7.2, 8.2); p.st = PS_PATROL; p.t = 99; // it never notices: it only sits in the line
      const octo = createOctopus(10, 8.2); octo.invulnTimer = 1e9; octo.hearts = 99;
      stepLevel(L, octo, 60);
      const ni = L.npcs.spawn(npcByName('quill'), 7.2, 8.7, false); // a calm NPC in the way next
      L.k.cool[0] = 0;
      stepLevel(L, octo, 60);
      assert('keeper claws: his claw hits the piranha in its way (claw 8 > its 6 hp)', p.dead && L.killed.some((e) => e.reason === 'claw'));
      const quillHurt = L.npcs.data.hp[ni] < rowOf('quill').hp || L.npcs.data.used[ni] === 0;
      assert('keeper claws: a calm NPC in the way is hurt, but quietly: an enemy\'s attack never turns it on her', quillHurt && L.npcs.data.hostile[ni] === 0);
    }
    {
      const L = makeLevel(room(24, 14)); L.killed = [];
      const p = L.en.spawnAt('piranha', 10, 8); p.st = PS_PATROL; p.t = 99;
      const b = L.props.add(PK_BOMB, 8, 8, 0, 0, { grace: 0.35 }); L.props.data.vx[b] = 9; L.props.data.vy[b] = 0; L.props.data.timer[b] = 99;
      const octo = farOcto();
      for (let s = 0; s < 30; s++) { L.props.step(DT, L.world, octo, []); stepLevel(L, octo, 1); }
      assert(`thrown: a bomb thrown into a piranha hits it (6 -> ${p.hp}, knocked out) and bounces off`, p.hp === rowOf('piranha').hp - SOURCES.thrown.dmg && L.props.data.vx[b] < 3);
      const L2 = makeLevel(room(24, 14));
      const k = addKeeper(L2.k, 10, 8, KM_CALM, 1);
      const b2 = L2.props.add(PK_BOMB, 8, 8, 0, 0, { grace: 0.35 }); L2.props.data.vx[b2] = 9; L2.props.data.timer[b2] = 99;
      for (let s = 0; s < 30; s++) { L2.dm.tick(DT); L2.props.step(DT, L2.world, octo, []); L2.inf.stepThrown(); }
      assert('thrown: her bomb thrown at a calm keeper is her doing: it hurts and rouses him (Spelunky)', L2.k.hp[k] < KEEPER_HP && L2.k.events.some((e) => e.type === 'hurt' && !e.quiet));
      const L3 = makeLevel(room(24, 14));
      const p3 = L3.en.spawnAt('piranha', 10, 8); p3.st = PS_PATROL; p3.t = 99;
      const b3 = L3.props.add(PK_BOMB, 9.2, 8); L3.props.data.vx[b3] = 2; L3.props.data.timer[b3] = 99;
      for (let s = 0; s < 30; s++) { L3.dm.tick(DT); L3.props.step(DT, L3.world, octo, []); L3.inf.stepThrown(); }
      assert('thrown: a bomb drifting slowly into a fish is not a throw (no hit)', p3.hp === rowOf('piranha').hp);
    }
    // blame: an enemy's shot never angers an NPC; a shot the octopus caused does
    {
      const L = makeLevel(); L.killed = [];
      const i = L.npcs.spawn(npcByName('marlo'), 10, 10.5, false);
      L.inf.projectile('shot', 10, 10, 0.3, 0);
      const quiet = L.npcs.data.hostile[i] === 0 && L.npcs.data.hp[i] < rowOf('marlo').hp;
      const L2 = makeLevel(); const j = L2.npcs.spawn(npcByName('quill'), 10, 10.5, false);
      L2.inf.projectile('shot', 10, 9.85, 0.3, 0, true);
      assert('blame: a cannon shot hurts a calm NPC quietly; a shot she is to blame for (a future reflect) turns it on her', quiet && L2.npcs.data.hostile[j] === 1);
    }

    // ---- no touch damage between touch enemies ----
    {
      const W = room(30, 14), L = makeLevel(W); L.killed = [];
      const hz = createHazards(); hz.setDamage(L.dm);
      hz.add({ type: 'hazard', hk: 5, x: 12.5, y: 12.5, dx: 0, dy: -1, len: 1 }); // an anemone on the floor
      const list = [
        L.en.spawnAt('piranha', 8, 11.5), L.en.spawnAt('crab', 9, 12.6, 'floor'), L.en.spawnAt('urchin', 10, 12.6, 'floor'),
        L.en.spawnAt('horns', 11, 12.6, 'floor'), L.en.spawnAt('piranha', 12.2, 12.2), L.en.spawnAt('manta', 16, 6), L.en.spawnAt('crab', 13, 12.6, 'floor'),
      ];
      L.cr.add({ type: 'creature', ck: CR_GCLAM, x: 20.5, y: 12.5, dx: 0, dy: -1, side: 1 });
      const octo = farOcto();
      for (let s = 0; s < 300; s++) { stepLevel(L, octo, 1); hz.update(DT, s * DT, octo, W, null); }
      const hurt = list.filter((e) => e.dead || (e.hp !== undefined && e.hp < e.maxHp));
      assert(`touch enemies: piranhas, crabs, an urchin, horns, a manta, an anemone and a clam side by side for 5 s: nobody hurt (${hurt.map((e) => e.kind).join(',') || 'none'})`, hurt.length === 0 && L.cr.data.alive[0] === 1 && L.cr.data.hp[0] === rowOf('gclam').hp);
    }

    // ---- the frenzy ----
    {
      const L = makeLevel(room(30, 14)); L.killed = [];
      const a = L.en.spawnAt('piranha', 8, 7), b = L.en.spawnAt('piranha', 13, 7);
      const healthy = L.en.spawnAt('crab', 18, 12.6, 'floor');
      const octo = farOcto();
      stepLevel(L, octo, 60);
      const calm = !a.dead && !b.dead && a.hp === a.maxHp && b.hp === b.maxHp && !healthy.dead && healthy.hp === healthy.maxHp;
      L.dm.hit('enemy', L.dm.pick(b.x, b.y, 0.1) ? L.dm.picked.i : 0, 'ink', b.x - 1, b.y); // ink wounds b (it bleeds)
      let t = 0;
      while (!b.dead && t < 8) { stepLevel(L, octo, 1); t += DT; }
      assert(`frenzy: healthy piranhas ignore each other and the crab; one wounded by ink is torn apart by the other (${t.toFixed(1)} s)`, calm && b.dead && L.killed.some((e) => e.kind === 'piranha' && e.reason === 'bite') && a.frenzy > 0 && healthy.hp === healthy.maxHp);
      // a knocked-out crab is prey too
      const L2 = makeLevel(room(30, 14)); L2.killed = [];
      const p2 = L2.en.spawnAt('piranha', 8, 11), c2 = L2.en.spawnAt('crab', 11, 12.6, 'floor');
      stepLevel(L2, octo, 30);
      c2.stun = 3;
      let t2 = 0; while (c2.hp === c2.maxHp && !c2.dead && t2 < 4) { stepLevel(L2, octo, 1); t2 += DT; }
      assert(`frenzy: a knocked-out crab is bitten (${c2.maxHp} -> ${c2.dead ? 'dead' : c2.hp} in ${t2.toFixed(1)} s)`, c2.dead || c2.hp < c2.maxHp);
      void p2;
    }
    {
      // a fresh corpse is stripped in CORPSE_BITES bites; a stale one is ignored
      const L = makeLevel(room(30, 14)); L.killed = [];
      L.en.spawnAt('piranha', 8, 7); L.en.spawnAt('piranha', 16, 7);
      const ci = L.corpses.add('crab', 12, 8, 0, 0, 1);
      const octo = farOcto();
      let t = 0, bites = 0;
      while (L.corpses.data.alive[ci] && t < 10) { stepLevel(L, octo, 1); t += DT; for (const ev of L.inf.events) if (ev.type === 'frenzyBite') bites++; L.inf.events.length = 0; }
      assert(`frenzy: a fresh corpse draws the piranhas and is gone after ${CORPSE_BITES} bites (${bites} bites, ${t.toFixed(1)} s)`, !L.corpses.data.alive[ci] && bites === CORPSE_BITES);
      const L2 = makeLevel(room(30, 14)); L2.killed = [];
      const p = L2.en.spawnAt('piranha', 9, 7);
      const c2 = L2.corpses.add('crab', 12, 8, 0, 0, 1); L2.corpses.data.age[c2] = FRESH_S + 1;
      stepLevel(L2, octo, 240);
      assert('frenzy: an old corpse is left alone', L2.corpses.data.alive[c2] === 1 && L2.inf.corpseBites(c2) === 0 && !(p.frenzy > 0));
    }

    // ---- the clam's snap ----
    {
      const W = room(20, 14), L = makeLevel(W); L.killed = [];
      L.cr.add({ type: 'creature', ck: CR_GCLAM, x: 10.5, y: 12.5, dx: 0, dy: -1, side: 1 });
      L.cr.data.state[0] = CL_OPEN; L.cr.data.ang[0] = 1; L.cr.data.t[0] = 0;
      const octo = createOctopus(10.5, 6); octo.invulnTimer = 1e9; // near enough to keep it cycling, not in the mouth
      const p = L.en.spawnAt('piranha', 10.5, 12.4); p.stun = 3; // knocked out, sinking into the open mouth
      stepLevel(L, octo, 2);
      const triggered = L.cr.data.state[0] === CL_TREMBLE;
      stepLevel(L, octo, 40);
      assert('clam: a creature in its open mouth sets the snap off at once (tremble) and the lid crushes it', triggered && p.dead && L.killed.some((e) => e.reason === 'snap') && !octo.dead);
      const L2 = makeLevel(W);
      L2.cr.add({ type: 'creature', ck: CR_GCLAM, x: 10.5, y: 12.5, dx: 0, dy: -1, side: 1 });
      L2.cr.data.state[0] = CL_OPEN; L2.cr.data.ang[0] = 1; L2.cr.data.t[0] = 0;
      const ki = addKeeper(L2.k, 10.5, 12.3, KM_CALM, 1);
      stepLevel(L2, octo, 45);
      assert(`clam: the snap bites the keeper too (${KEEPER_HP} -> ${L2.k.hp[ki]}), quietly`, L2.k.hp[ki] === KEEPER_HP - SOURCES.snap.dmg && L2.k.mode[ki] === KM_CALM);
    }

    // ---- the tentacle's grab ----
    {
      const W = room(24, 14), L = makeLevel(W); L.killed = [];
      L.cr.add({ type: 'creature', ck: CR_TENTACLE, x: 10.5, y: 12.5, dx: 0, dy: -1, side: 1, tilt: 0 });
      const p = L.en.spawnAt('piranha', 11.5, 10); // it patrols past the shell
      const octo = farOcto();
      let t = 0; while (!p.dead && t < 15) { stepLevel(L, octo, 1); t += DT; }
      assert(`tentacle: with the octopus away it grabs a passing piranha (${t.toFixed(1)} s) and crushes it`, p.dead && L.killed.some((e) => e.reason === 'grab') && L.cr.data.alive[0] === 1);
      const L2 = makeLevel(W);
      L2.cr.add({ type: 'creature', ck: CR_TENTACLE, x: 10.5, y: 12.5, dx: 0, dy: -1, side: 1, tilt: 0 });
      const mi = L2.npcs.spawn(npcByName('marlo'), 12, 11.5, false); // a calm NPC at his post does not move
      stepLevel(L2, octo, 300);
      assert('tentacle: it strikes at what moves: a calm NPC standing at his post is left alone', L2.npcs.data.used[mi] === 1 && L2.npcs.data.hp[mi] === rowOf('marlo').hp);
      const L3 = makeLevel(W);
      L3.cr.add({ type: 'creature', ck: CR_TENTACLE, x: 10.5, y: 12.5, dx: 0, dy: -1, side: 1, tilt: 0 });
      L3.en.spawnAt('piranha', 11.5, 10);
      const o3 = createOctopus(12, 10.5); o3.invulnTimer = 1e9;
      let grabbed = false; for (let s = 0; s < 360 && !grabbed; s++) { stepLevel(L3, o3, 1); grabbed = o3.held > 0; }
      assert('tentacle: the octopus comes first: with her in reach it grabs her, not the fish', grabbed);
    }

    // ---- the target override hook (setLure) ----
    {
      const L = makeLevel(room(40, 16)); L.killed = [];
      const p = L.en.spawnAt('piranha', 8, 6), crab = L.en.spawnAt('crab', 8, 14.6, 'floor'), manta = L.en.spawnAt('manta', 26, 6);
      const octo = farOcto();
      const slot = L.inf.setLure(20, 12, 14);
      const d0 = Math.hypot(p.x - 20, p.y - 12), m0 = Math.abs(manta.baseX - 20);
      stepLevel(L, octo, 60 * 9);
      const dp = Math.hypot(p.x - 20, p.y - 12);
      assert(`lure: a patrolling piranha swims to it (${d0.toFixed(1)} -> ${dp.toFixed(1)} tiles) and stays`, slot >= 0 && dp < 1.5);
      assert(`lure: a crab walks its floor toward it (x 8 -> ${crab.x.toFixed(1)}), a manta's glide line moves to it (${m0.toFixed(1)} -> ${Math.abs(manta.baseX - 20).toFixed(1)})`, crab.x > 14 && Math.abs(manta.baseX - 20) < m0 - 3);
      L.inf.clearLure(slot);
      const px = p.x; stepLevel(L, octo, 120);
      assert('lure: cleared, the piranha patrols again from where it is', L.inf.lures().length === 0 && Math.abs(p.x - px) > 0.5);
      const s2 = L.inf.setLure(5, 5, LURE_R, 0.5); stepLevel(L, octo, 40);
      assert('lure: one with a time to live runs out by itself', s2 >= 0 && L.inf.lures().length === 0);
      for (let k = 0; k < 4; k++) L.inf.setLure(k, k);
      assert('lure: up to 4 at once (a fifth is refused)', L.inf.setLure(9, 9) === -1 && L.inf.lures().length === 4);
    }
    {
      // a hostile NPC that lost the octopus (rock between) swims to a lure; one that sees her keeps after her
      const W = fake([
        '##############################',
        '#.............#..............#',
        '#.............#..............#',
        '#.............#..............#',
        '#.............#..............#',
        '#............................#',
        '#............................#',
        '##############################',
      ]);
      const L = makeLevel(W); L.killed = [];
      const i = L.npcs.spawn(npcByName('quill'), 6, 3, true);
      const octo = createOctopus(25, 2.5); octo.invulnTimer = 1e9;
      L.inf.setLure(4, 6, 12);
      stepLevel(L, octo, 60 * 4);
      const d = Math.hypot(L.npcs.data.x[i] - 4, L.npcs.data.y[i] - 0.65 - 6);
      assert(`lure: a hostile NPC that cannot see the octopus swims to it (${d.toFixed(1)} tiles away)`, d < 2);
    }
  } finally {
    setHpMode(false);
  }
}
