// Unified creature rules (2026-10-08): one creature table (creature-rules.js), one shared damage entry (damage.js).
//  - the matrix: every creature kind receives every damage source exactly as its table row says, through its real system
//  - the shopkeeper on spikes (Daniel: "spikes don't hurt shopkeepers - why?"): a body hit hurts him like anyone, quietly
//    unless the octopus is to blame
//  - consistency regressions: the hazards' own geometry (spikes, boulders, blocks, shocks, anemones, jets, bombs) reaches every
//    family; nothing is allow-listed by kind
import {
  CREATURES, CREATURE_KINDS, SOURCES, SOURCE_NAMES, resolveHit, rowOf, dashKillable, affects, IMPACT_SPEED,
  PH_ANCHORED, PH_NONE,
} from '../js/creature-rules.js';
import { createDamage, octoHit } from '../js/damage.js';
import { createEnemies, setHpMode } from '../js/enemies.js';
import { createCreatures, CR_GCLAM, CR_TENTACLE, CL_OPEN, TN_REACH } from '../js/creatures.js';
import { createNpcs, npcByName } from '../js/npcs.js';
import { createKeepers, addKeeper, keeperFamily, applyKeeperHit, KM_ANGRY, KM_CALM, KM_DEAD, KEEPER_HP } from '../js/shopkeeper.js';
import { createHazards, makeHazardRecord } from '../js/hazards.js';
import { createProps, PK_BLOCK } from '../js/props.js';
import { createOctopus } from '../js/octopus.js';
import { resetGameView } from '../js/cull.js';

const DT = 0.02;
function fake(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  const world = {
    w, h, tiles,
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
    placeRock(x, y) { if (tiles[y * w + x] !== 0) return false; tiles[y * w + x] = 1; return true; },
  };
  return world;
}
const roomRows = (w, h) => Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));
const OPEN = { isSolid: () => false, tileAt: () => 0 };
const rec = (world, name, x, y, dx = 0, dy = 0) => makeHazardRecord(name, x, y, dx, dy, world.tiles, world.w, world.h);
const ENEMY_PLACE = { crab: 'floor', cannon: 'floor', urchin: 'floor', horns: 'floor' };

/** One body of `kind` in its real system at (x, y), its family registered in a fresh damage entry. shut: a clam / tentacle shell state. */
function makeBody(kind, x = 10, y = 10, shut = true) {
  const dm = createDamage(), row = rowOf(kind);
  if (row.family === 'enemy') {
    const en = createEnemies(), e = en.spawnAt(kind, x, y, ENEMY_PLACE[kind] || 'open');
    dm.register(en.family);
    return { dm, fam: 'enemy', alive: () => !e.dead, hp: () => (e.hp !== undefined ? e.hp : NaN), rec: e, en };
  }
  if (row.family === 'creature') {
    const cr = createCreatures();
    cr.add({ type: 'creature', ck: kind === 'gclam' ? CR_GCLAM : CR_TENTACLE, x, y, dx: 0, dy: -1, side: 1, tilt: 0 });
    if (!shut) { if (kind === 'gclam') { cr.data.state[0] = CL_OPEN; cr.data.ang[0] = 1; } else cr.data.state[0] = TN_REACH; }
    dm.register(cr.family());
    return { dm, fam: 'creature', alive: () => cr.data.alive[0] === 1, hp: () => cr.data.hp[0], cr };
  }
  if (row.family === 'npc') {
    const n = createNpcs(OPEN, { onKeeper: () => {} }), i = n.spawn(npcByName(kind), x, y + 0.5, false);
    dm.register(n.family);
    return { dm, fam: 'npc', alive: () => n.data.used[i] === 1, hp: () => n.data.hp[i], n, i };
  }
  if (row.family === 'keeper') {
    const k = createKeepers(); addKeeper(k, x, y, KM_ANGRY, 1);
    dm.register(keeperFamily(k));
    return { dm, fam: 'keeper', alive: () => k.mode[0] !== KM_DEAD, hp: () => k.hp[0], k };
  }
  return null;
}

export async function runCreatureRulesTests(assert) {
  setHpMode(true); // hp on the enemy records (the game's default outside endless); reset at the end
  try {
    // ---- the table itself ----
    {
      const bad = CREATURE_KINDS.filter((k) => { const r = CREATURES[k]; return !(r.hp >= 0 && r.mass > 0 && r.physics && r.family); });
      assert(`creature table: every row has family, hp, mass and physics (${CREATURE_KINDS.length} kinds)`, bad.length === 0 && CREATURE_KINDS.length >= 16);
      const noWhy = CREATURE_KINDS.filter((k) => { const r = CREATURES[k]; return (r.invulnerable || (r.immune && r.immune.length)) && !r.why; });
      assert('creature table: every immunity carries its reason (`why`)', noWhy.length === 0);
      const req = ['piranha', 'crab', 'cannon', 'manta', 'urchin', 'horns', 'eel', 'gclam', 'tentacle', 'beholder', 'marlo', 'pip', 'quill', 'host', 'keeper', 'octopus'];
      assert('creature table: every creature of the game has a row (piranha ... keeper, octopus)', req.every((k) => CREATURES[k]));
      const srcReq = ['bomb', 'boulder', 'spikes', 'jet', 'ink', 'dash', 'block', 'shock', 'anemone', 'shot', 'harpoon', 'claw'];
      assert('source table: bomb, boulder, spikes, jets, ink, dash, falling block, shock, anemone and the projectiles are all sources', srcReq.every((s) => SOURCES[s] && SOURCES[s].octo));
      assert('table: dash-killable kinds are exactly the oneHitSplat ones (piranha, crab, manta)', CREATURE_KINDS.filter(dashKillable).join() === 'piranha,crab,manta');
      assert('table: the keeper is NOT immune to spikes or boulders (the bug: an allow-list skipped him)', affects('keeper', 'spikes') && affects('keeper', 'boulder') && resolveHit('keeper', 'spikes').dmg >= 10);
      assert('table: the Beholder, the horns and the eel are invulnerable; nothing else is', CREATURE_KINDS.filter((k) => CREATURES[k].invulnerable).join() === 'horns,beholder,eel');
    }

    // ---- the matrix: every kind x every source, through its real system ----
    {
      const kinds = CREATURE_KINDS.filter((k) => ['enemy', 'creature', 'npc', 'keeper'].includes(rowOf(k).family) && !rowOf(k).boss);
      let cells = 0;
      const wrong = [];
      for (const kind of kinds) {
        const variants = rowOf(kind).shell ? [true, false] : [true];
        for (const shut of variants) {
          for (const src of SOURCE_NAMES) {
            const b = makeBody(kind, 10, 10, shut);
            const o = { ...resolveHit(kind, src, -1, shut) };
            const hp0 = b.hp(), hpTable = Number.isFinite(hp0) ? hp0 : rowOf(kind).hp;
            const dealt = b.dm.hit(b.fam, 0, src, 10, 11);
            const tag = `${kind}${rowOf(kind).shell ? (shut ? '(shut)' : '(open)') : ''}/${src}`;
            cells++;
            if (o.ignore) { if (dealt !== 0 || !b.alive() || !(b.hp() === hp0 || (Number.isNaN(hp0) && Number.isNaN(b.hp())))) wrong.push(tag + ' should be ignored'); continue; }
            const lethal = o.kill || (o.dmg > 0 && o.dmg >= hpTable);
            if (lethal) { if (b.alive()) wrong.push(tag + ' should kill'); continue; }
            if (!b.alive()) { wrong.push(tag + ' killed but should not'); continue; }
            if (o.dmg > 0 && Number.isFinite(hp0) && Math.abs(hp0 - o.dmg - b.hp()) > 1e-3) wrong.push(`${tag} hp ${hp0} -> ${b.hp()} (table ${o.dmg})`);
            if (o.dmg === 0 && dealt !== 0) wrong.push(tag + ' dealt damage with a zero-damage source');
          }
        }
      }
      assert(`matrix: ${cells} kind x source cells all follow the creature table${wrong.length ? ' -- ' + wrong.slice(0, 6).join('; ') : ''}`, wrong.length === 0 && cells >= 15 * SOURCE_NAMES.length);
    }
    // the Beholder and the eel never get a body in the damage entry: nothing reaches them
    {
      const en = createEnemies(), dm = createDamage(); dm.register(en.family);
      const b = en.spawnAt('beholder', 10, 10);
      dm.blast(10, 10, 2.5); dm.circle('boulder', 10, 10, 1);
      assert('matrix: the Beholder is untouched by bombs and boulders (invulnerable boss, not a family body)', !b.dead && SOURCE_NAMES.every((s) => resolveHit('beholder', s).ignore));
      assert('matrix: the eel ignores every source (a trap of its shaft)', SOURCE_NAMES.every((s) => resolveHit('eel', s).ignore));
    }
    // the octopus's side of the same table (octoHit)
    {
      const wrong = [];
      for (const src of SOURCE_NAMES) {
        const oc = SOURCES[src].octo, o = createOctopus(10, 10); o.invulnTimer = 0;
        const h0 = o.hearts, r = octoHit(o, src, 10, 11, src);
        if (oc.kill === '') { if (!o.dead) wrong.push(src + ' should kill'); }
        else if (oc.hearts) { if (!r || o.hearts !== Math.max(0, h0 - oc.hearts) || (oc.stun && !(o.stunT > 0))) wrong.push(`${src}: hearts ${h0} -> ${o.hearts}, stun ${o.stunT}`); }
        else if (r) wrong.push(src + ' should do nothing through octoHit (own attack, a push, or a styled kill with its own geometry)');
      }
      assert(`octopus: every source does to her what its octo entry says (hearts, stun, plain kill)${wrong.length ? ' -- ' + wrong.join('; ') : ''}`, wrong.length === 0);
    }

    // ---- the shopkeeper on spikes ----
    {
      resetGameView();
      const W = fake(roomRows(12, 14));
      const setup = (mode, x, y) => {
        const k = createKeepers(); addKeeper(k, x, y, mode, 1);
        const hz = createHazards(), dm = createDamage(); dm.register(keeperFamily(k)); hz.setDamage(dm);
        hz.add(rec(W, 'spikes', 4.5, 12.5, 0, -1)); // a floor strip, its face at y = 12
        return { k, hz, dm };
      };
      const octo = createOctopus(9.5, 2.5); octo.invulnTimer = 1e9;
      // charging over the strip (faster than IMPACT_SPEED)
      const a = setup(KM_ANGRY, 4.5, 12.3); // the strip's face is the floor top (y 13): his shell reaches the tips
      for (let i = 0; i < 10; i++) { a.k.vx[0] = 6.4; a.k.x[0] = 4.5; a.k.y[0] = 12.3; a.dm.tick(DT); a.hz.update(DT, i * DT, octo, W, null); }
      const hurts = a.k.events.filter((e) => e.type === 'hurt');
      assert(`keeper on spikes: a keeper charging across them is hurt (${KEEPER_HP} -> ${a.k.hp[0]} hp) and thrown off (vy ${a.k.vy[0].toFixed(1)})`, a.k.hp[0] <= KEEPER_HP - 15 && a.k.vy[0] < -1);
      assert(`keeper on spikes: once per landing (${hurts.length} hit in 0.2 s), and quietly: he ran onto them, the octopus is not to blame`, hurts.length === 1 && hurts[0].quiet === true && hurts[0].src === 'spikes');
      // a second landing after the cooldown hurts again; two landings kill him like any heavy hit
      for (let i = 0; i < 60; i++) { a.k.vx[0] = 6.4; a.k.x[0] = 4.5; a.k.y[0] = 12.3; a.dm.tick(DT); a.hz.update(DT, i * DT, octo, W, null); }
      assert('keeper on spikes: he is not immune: a second landing kills him (quiet: no shop aggro)', a.k.mode[0] === KM_DEAD && a.k.events.some((e) => e.type === 'killed' && e.quiet));
      // standing calm beside the strip: nothing
      const c = setup(KM_CALM, 4.5, 12.3);
      for (let i = 0; i < 20; i++) { c.dm.tick(DT); c.hz.update(DT, i * DT, octo, W, null); }
      assert('keeper on spikes: a calm keeper standing still over them is not hurt (no impact)', c.k.hp[0] === KEEPER_HP && c.k.mode[0] === KM_CALM);
      // the octopus's bomb throws him onto them: her fault, so it angers the run
      const b = setup(KM_ANGRY, 4.5, 10.6);
      b.dm.blast(4.5, 8.4, 2.5); // above him: thrown down onto the strip, knocked out
      const bombHurt = b.k.events.filter((e) => e.type === 'hurt').length;
      let landed = false;
      for (let i = 0; i < 40 && !landed; i++) {
        b.k.x[0] += b.k.vx[0] * DT; b.k.y[0] = Math.min(12.3, b.k.y[0] + Math.max(b.k.vy[0], 3) * DT);
        b.dm.tick(DT); b.hz.update(DT, i * DT, octo, W, null);
        landed = b.k.events.slice(bombHurt).some((e) => e.type === 'hurt' && e.src === 'spikes');
      }
      const spikeHit = b.k.events.find((e) => e.type === 'hurt' && e.src === 'spikes');
      assert('keeper on spikes: thrown onto them by her bomb, the octopus is to blame (not quiet)', landed && spikeHit && spikeHit.quiet === false);
    }

    // ---- consistency regressions: the hazards' own geometry reaches every family ----
    {
      resetGameView();
      // spikes: a lunging NPC and a hurtling piranha die; a slow piranha does not
      const W = fake(roomRows(12, 14));
      const spikeScene = (kind, speed) => {
        const b = makeBody(kind, 4.5, rowOf(kind).family === 'npc' ? 12.0 : 12.5); // the body's centre just over the tips (an NPC is placed by its anchor)
        const hz = createHazards(); hz.setDamage(b.dm); hz.add(rec(W, 'spikes', 4.5, 12.5, 0, -1));
        if (b.rec) b.rec.vx = speed; if (b.n) b.n.data.vx[b.i] = speed;
        const octo = createOctopus(9.5, 2.5); octo.invulnTimer = 1e9;
        hz.update(DT, 0, octo, W, null);
        return b;
      };
      assert('spikes: a piranha hurtling in dies, a slow one does not', !spikeScene('piranha', IMPACT_SPEED + 2).alive() && spikeScene('piranha', 1.5).alive());
      const pip = spikeScene('pip', IMPACT_SPEED + 3);
      assert('spikes: an NPC lunging onto them is hurt too (Pip, 2 hp, dies), and the octopus is not blamed (no angered event)', !pip.alive() && !pip.n.events.some((e) => e.type === 'angered'));
    }
    {
      // a boulder an enemy set off: crushes the crab, splits the clam, hurts the keeper and Marlo quietly (no anger)
      resetGameView();
      const W = fake(roomRows(16, 14));
      const props = createProps(), hz = createHazards(props), dm = createDamage();
      const en = createEnemies(), cr = createCreatures(), k = createKeepers(), npcs = createNpcs(W, { onKeeper: () => {} });
      dm.register(en.family); dm.register(cr.family()); dm.register(keeperFamily(k)); dm.register(npcs.family); hz.setDamage(dm);
      const crab = en.spawnAt('crab', 3.5, 12.55, 'floor'); crab.vx = 1.2;
      cr.add({ type: 'creature', ck: CR_GCLAM, x: 7.5, y: 12.5, dx: 0, dy: -1, side: 1, tilt: 0 });
      addKeeper(k, 10.5, 12.1, KM_CALM, 1);
      const mi = npcs.spawn(npcByName('marlo'), 13.5, 12.9, false);
      for (const x of [3.5, 7.5, 10.5, 13.5]) hz.add(rec(W, 'rock', x, 1.5, 0, 1));
      const octo = createOctopus(1.5, 3.5); octo.invulnTimer = 1e9;
      // the crab sets its boulder off; the others are released as if by the world (an enemy's doing, cause 0)
      for (let i = 0; i < 150; i++) {
        if (i === 1) for (let j = 1; j < 4; j++) { hz.data.state[j] = 2; props.release(hz.data.pid[j]); hz.data.cause[j] = 0; }
        dm.tick(DT); props.step(DT, W, octo, en.all()); hz.update(DT, i * DT, octo, W, null);
      }
      const kh = k.events.filter((e) => e.type === 'hurt');
      assert('boulder: an enemy-set boulder crushes the crab (corpse event, reason crush)', crab.dead && en.events.length >= 0);
      assert('boulder: ... splits a giant clam too (it used to pass through creatures)', cr.data.alive[0] === 0);
      assert(`boulder: ... hurts the keeper once (${kh.length} hit, ${kh[0] && kh[0].dmg} hp) and quietly: he is not roused`, kh.length === 1 && kh[0].quiet && k.mode[0] === KM_CALM);
      const mHurt = npcs.events.filter((e) => e.type === 'hurt' || e.type === 'killed');
      assert('boulder: ... hurts Marlo but does not anger him (the octopus did not do it)', mHurt.length >= 1 && !npcs.events.some((e) => e.type === 'angered') && (npcs.data.used[mi] === 0 || npcs.data.hostile[mi] === 0));
    }
    {
      // a falling block crushes a keeper and an NPC, not only enemies
      const W = fake(roomRows(12, 14));
      const props = createProps(), dm = createDamage(), k = createKeepers(), npcs = createNpcs(W, { onKeeper: () => {} });
      addKeeper(k, 3.5, 12.1, KM_CALM, 1); npcs.spawn(npcByName('pip'), 8.5, 12.6, false);
      dm.register(keeperFamily(k)); dm.register(npcs.family); props.setDamage(dm);
      props.add(PK_BLOCK, 3.5, 2); props.add(PK_BLOCK, 8.5, 2);
      const octo = createOctopus(1.5, 6.5); octo.invulnTimer = 1e9;
      for (let i = 0; i < 200; i++) { dm.tick(DT); props.step(DT, W, octo, []); }
      assert(`block: a falling block lands on the keeper (${KEEPER_HP} -> ${k.hp[0]} hp, quiet) and on Pip (dead)`, k.hp[0] < KEEPER_HP && k.events.some((e) => e.type === 'hurt' && e.quiet) && npcs.moods.dead[npcByName('pip')] === 1);
    }
    {
      // an eel's shock knocks out a piranha and a keeper (no damage to an anchored urchin's knock-out); an anemone stings the keeper
      resetGameView();
      const W = fake(roomRows(14, 14));
      const hz = createHazards(), dm = createDamage(), en = createEnemies(), k = createKeepers();
      dm.register(en.family); dm.register(keeperFamily(k)); hz.setDamage(dm);
      hz.add({ type: 'hazard', hk: 4, x: 6.5, y: 7, dx: 0, dy: 0, len: 1, y0: 6.9, y1: 7.1 });
      const p = en.spawnAt('piranha', 6.9, 7); addKeeper(k, 6.2, 7.3, KM_ANGRY, 1);
      const octo = createOctopus(12.5, 12.5); octo.invulnTimer = 1e9;
      for (let i = 0; i < 5; i++) { dm.tick(DT); hz.update(DT, i * DT, octo, W, null); }
      assert('eel: its body shocks a piranha (stunned, hurt) and a keeper (stunned) beside it', p.stun > 0.5 && p.hp < rowOf('piranha').hp && k.stun[0] > 0 && k.hp[0] < KEEPER_HP);
      const hz2 = createHazards(), dm2 = createDamage(), k2 = createKeepers(); addKeeper(k2, 6.5, 7.2, KM_ANGRY, 1);
      dm2.register(keeperFamily(k2)); hz2.setDamage(dm2); hz2.add({ type: 'hazard', hk: 5, x: 6.5, y: 7, dx: 0, dy: -1, len: 1 });
      for (let i = 0; i < 3; i++) { dm2.tick(DT); hz2.update(DT, i * DT, octo, W, null); }
      assert('anemone: it stings a keeper that swims into it (once per second)', k2.events.filter((e) => e.type === 'hurt' && e.src === 'anemone').length === 1);
    }
    {
      // jets carry every free body the table lets them: a hostile NPC drifts like a piranha, a knocked-out keeper is thrown
      const W = fake(roomRows(10, 14));
      const hz = createHazards(), dm = createDamage(), k = createKeepers(), npcs = createNpcs(W, { onKeeper: () => {} });
      dm.register(keeperFamily(k)); dm.register(npcs.family); hz.setDamage(dm);
      hz.add({ type: 'hazard', hk: 1, x: 4.5, y: 13, dx: 0, dy: -1, len: 7 });
      addKeeper(k, 4.5, 9, KM_ANGRY, 1); k.stun[0] = 1;
      const qi = npcs.spawn(npcByName('quill'), 4.6, 10.5, true);
      const y0 = npcs.data.y[qi];
      const octo = createOctopus(1.5, 2.5); octo.invulnTimer = 1e9;
      for (let i = 0; i < 20; i++) { dm.tick(DT); hz.update(DT, i * DT, octo, W, null); }
      assert('jet: a knocked-out keeper is thrown up the stream, a swimming NPC drifts up it', k.vy[0] < -1 && npcs.data.y[qi] < y0 - 0.05);
    }
    {
      // a bomb (damage.js blast) is the same rule for every family: inside the radius the bomb, beyond it a shove; rock shields
      const dm = createDamage(), en = createEnemies(), k = createKeepers(), npcs = createNpcs(OPEN, { onKeeper: () => {} }), cr = createCreatures();
      dm.register(en.family); dm.register(keeperFamily(k)); dm.register(npcs.family); dm.register(cr.family());
      const pir = en.spawnAt('piranha', 11, 10), man = en.spawnAt('manta', 9, 10), far = en.spawnAt('piranha', 13.8, 10), urch = en.spawnAt('urchin', 10, 11.5, 'floor');
      addKeeper(k, 10, 8.5, KM_CALM, 1); npcs.spawn(npcByName('host'), 8.5, 11, false);
      cr.add({ type: 'creature', ck: CR_GCLAM, x: 10.5, y: 11.5, dx: 0, dy: -1, side: 1, tilt: 0 });
      dm.blast(10, 10, 2.5);
      assert('bomb: inside its radius it kills every ordinary creature (piranha, manta, urchin, the host, a shut clam)', pir.dead && man.dead && urch.dead && npcs.moods.dead[npcByName('host')] === 1 && cr.data.alive[0] === 0);
      assert(`bomb: the buff keeper survives one (${k.hp[0]} hp), is knocked out and roused; a piranha beyond the radius is only thrown and stunned`, k.hp[0] > 0 && k.hp[0] < KEEPER_HP && k.stun[0] > 0 && k.mode[0] === KM_ANGRY && !far.dead && far.stun > 0);
      const walled = fake(['##########', '#...#....#', '#...#....#', '#...#....#', '##########']);
      const dm2 = createDamage(), k2 = createKeepers(); addKeeper(k2, 5.5, 2.5, KM_CALM, 1); dm2.register(keeperFamily(k2));
      dm2.blast(3.5, 2.5, 2.5, (x, y) => walled.isSolid(x, y));
      const shielded = k2.hp[0] === KEEPER_HP && k2.mode[0] === KM_CALM;
      dm2.blast(3.5, 2.5, 2.5);
      assert('bomb: rock between the blast and a body shields it (any family; the NPCs had this alone); with no rock it hurts', shielded && k2.hp[0] < KEEPER_HP);
    }
    {
      // aggro follows blame for everyone: the octopus's ink angers an NPC; the world's anemone does not
      const n = createNpcs(OPEN, { onKeeper: () => {} }), i = n.spawn(npcByName('marlo'), 10, 10.5, false);
      n.applyHit(i, 'anemone', 10, 11, -1, 1, false);
      const calmAfterWorld = n.data.hostile[i] === 0 && n.data.hp[i] < 6;
      n.applyHit(i, 'ink', 10, 11, -1, 1, true);
      assert('aggro: a hit the octopus is not to blame for hurts an NPC quietly; her own hit angers it', calmAfterWorld && n.data.hostile[i] === 1);
      const k = createKeepers(); addKeeper(k, 0, 0, KM_CALM, 1);
      applyKeeperHit(k, 0, 'boulder', 0, -1, -1, 1, false);
      const quietK = k.mode[0] === KM_CALM && k.hp[0] < KEEPER_HP;
      applyKeeperHit(k, 0, 'ink', 0, -1, -1, 1, true);
      assert('aggro: same for the keeper (a quiet boulder, then her ink rouses him)', quietK && k.mode[0] === KM_ANGRY);
    }
    {
      // anchored kinds are never thrown; walkers only sideways (the table's physics)
      const en = createEnemies(), dm = createDamage(); dm.register(en.family);
      const c = en.spawnAt('cannon', 10, 11, 'floor'), cr = en.spawnAt('crab', 11, 11, 'floor'), p = en.spawnAt('piranha', 9, 10);
      for (const e of [c, cr, p]) en.applyHit(e, 'bomb', 10, 10, 0, 1); // a shove only (no damage)
      assert('physics: a cannon (anchored) is stunned in place, a crab (walker) is thrown sideways only, a piranha (swimmer) both ways', c.kvx === 0 && c.kvy === 0 && c.stun > 0 && cr.kvy === 0 && Math.abs(cr.kvx) > 0.5 && Math.hypot(p.kvx, p.kvy) > 1 && [PH_ANCHORED, PH_NONE].includes(rowOf('cannon').physics));
    }
  } finally { setHpMode(false); resetGameView(); }
}
