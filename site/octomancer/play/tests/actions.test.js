// Actions tuning (2026-10-08): the Ink Jet is rare and physical, the dash is invincible but harmless, the Urchin Cap
// brings the body damage back. Sync except the hotbar DOM check.
import { INKJET, INK_PUSH, createInkJet } from '../js/inkjet.js';
import { createLevelWorld } from '../js/world-v2.js';
import { MAT_ROCK, MAT_BEDROCK, MAT_BONE, MAT_TIMBER, MAT_MASONRY, MAT_NAMES } from '../js/materials.js';
import { createProps, PK_BOMB, PK_POT, PK_ROCK, PK_BLOCK, PK_CLAM, PS_REST } from '../js/props.js';
import { createCorpses, CS_REST } from '../js/corpses.js';
import { createEnemies, setHpMode } from '../js/enemies.js';
import { createOctopus, stepOctopus, hurtOctopus } from '../js/octopus.js';
import { DASH_IFRAMES, DASH_KILL_SPEED } from '../js/config.js';
import { ITEM_IDS, ITEM_DEFS, giveItem, applyCarried } from '../js/items.js';
import { octoRams, octoPhasing, RAM_SPEED } from '../js/strikes.js';
import { createHotbarUI } from '../js/hotbar-ui.js';
import { createQuestState, questInk, Q_RESCUE, CAGE_INK_R } from '../js/quests.js';
import { killAmbient, isAmbientDead, resetAmbient, ambientPos } from '../js/ambient.js';
import { createLoot, LK_POT } from '../js/loot.js';
import { pierces, PIERCE_KINDS } from '../js/creature-rules.js';

const DT = 0.02;
const OPEN = { isSolid: () => false, breakTile() {} };
const noHurt = () => {};

/** A bedrock-bordered level, `paint(put)` fills the inside (as materials.test.js). */
function handLevel(W, H, paint) {
  const tiles = new Uint8Array(W * H);
  const put = (x, y, m) => { tiles[y * W + x] = m; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) put(x, y, MAT_BEDROCK);
  paint(put);
  return { authored: true, id: 'act-test', w: W, h: H, tiles, marks: new Int16Array(48), nMarks: 0, startX: 3, startY: 3, exitX: 4, exitY: 3, prompts: [], spawns: [], nSpawns: 0, fallback: 0, attempts: 0, nAnchors: 0, walls: new Int16Array(0) };
}

/** Run the jet for `s` seconds; sums the per-step events. */
function fly(jet, world, list, hurt, phys, s) {
  const sum = { hits: 0, pushes: 0, blocked: 0, splats: 0, lastSplatX: NaN, maxX: 0 };
  for (let t = 0; t < s - 1e-9; t += DT) {
    jet.update(DT, world, list, hurt, phys);
    const e = jet.events;
    sum.hits += e.hits; sum.pushes += e.pushes; sum.blocked += e.blocked; sum.splats += e.nSplat;
    if (e.nSplat) sum.lastSplatX = e.splat[0];
    for (let i = 0; i < jet.data.alive.length; i++) if (jet.data.alive[i]) sum.maxX = Math.max(sum.maxX, jet.data.x[i]);
  }
  return sum;
}
const anyAlive = (jet) => jet.data.alive.some((a) => a === 1);

export async function runActionsTests(assert) {
  // ================================================================ Ink Jet: rare
  assert('ink: one shot per 1.5 s (rare and deliberate)', INKJET.cooldown === 1.5);

  // ================================================================ Ink Jet vs every terrain material (the real v2 world)
  {
    const bad = [];
    for (const m of [MAT_ROCK, MAT_BEDROCK, MAT_TIMBER, MAT_MASONRY]) {
      const w = createLevelWorld(0, 0, { level: handLevel(30, 12, (put) => { for (let y = 2; y < 10; y++) put(15, y, m); }) });
      const jet = createInkJet();
      jet.fire(10, 6.5, 1, 0, 0);
      const r = fly(jet, w, [], noHurt, { props: createProps(), corpses: createCorpses() }, 1);
      if (!(r.splats === 1 && !anyAlive(jet) && r.lastSplatX < 15 && r.lastSplatX > 14.6 && jet.stainCount() === 1)) bad.push(MAT_NAMES[m] + ' x=' + r.lastSplatX);
    }
    assert('ink: a blob stops and stains at the face of rock, bedrock, timber and masonry' + (bad.length ? ' [' + bad.join(', ') + ']' : ''), bad.length === 0);
    // fish bone is strong (creature-rules.js PIERCE): the tile crumbles, the blob splashes there (no stain: the rock is gone) and stops, one tile per shot
    const w = createLevelWorld(0, 0, { level: handLevel(30, 12, (put) => { for (let y = 2; y < 10; y++) put(15, y, MAT_BONE); }) });
    const jet = createInkJet();
    jet.fire(10, 6.5, 1, 0, 0);
    let maxX = 0, pierced = 0, splats = 0;
    for (let t = 0; t < 1 - 1e-9; t += DT) { jet.update(DT, w, [], noHurt, { props: createProps(), corpses: createCorpses() }); pierced += jet.events.pierced; splats += jet.events.nSplat; if (jet.data.alive[0]) maxX = jet.data.x[0]; }
    assert('pierce: a blob crumbles one fish-bone tile, splashes once and stops there (' + maxX.toFixed(2) + ')', w.tileAt(15, 6) === 0 && w.tileAt(15, 5) === MAT_BONE && pierced === 0 && splats === 1 && maxX < 16 && jet.stainCount() === 0);
  }

  // ================================================================ Ink Jet vs props, blocks, corpses
  {
    const props = createProps(), d = props.data;
    const bomb = props.add(PK_BOMB, 10, 5);
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    const r = fly(jet, OPEN, [], noHurt, { props, corpses: createCorpses() }, 0.6);
    assert('ink: a blob hits a bomb, shoves it along the flight and splats (no stain on rock)', r.pushes === 1 && r.splats === 1 && !anyAlive(jet) && d.vx[bomb] > INK_PUSH * 0.9 && Math.abs(d.vy[bomb]) < 1e-6 && jet.stainCount() === 0);
  }
  {
    const props = createProps(), d = props.data;
    const pot = props.add(PK_POT, 10, 5), rock = props.add(PK_ROCK, 10, 8);
    d.state[pot] = PS_REST; d.vx[pot] = 0;
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    fly(jet, OPEN, [], noHurt, { props, corpses: null }, 0.6);
    run2(jet);
    function run2(j) { j.update(1.6, OPEN, [], noHurt, null); } // cool down
    jet.fire(6, 8, 1, 0, 0);
    fly(jet, OPEN, [], noHurt, { props, corpses: null }, 0.6);
    assert('ink: a sleeping pot wakes and is nudged; a heavy rock moves less than the pot', d.state[pot] !== PS_REST && d.vx[pot] > 0 && d.vx[rock] > 0 && d.vx[rock] < d.vx[pot]);
  }
  {
    const props = createProps(), d = props.data;
    const blk = props.add(PK_BLOCK, 10.5, 5.5);
    const jet = createInkJet();
    jet.fire(6, 5.5, 1, 0, 0);
    const r = fly(jet, OPEN, [], noHurt, { props, corpses: null }, 0.8);
    assert('ink: a pushable block stops the blob dead and does not budge', r.blocked === 1 && r.splats === 1 && !anyAlive(jet) && d.vx[blk] === 0 && r.lastSplatX < 10.5 - d.radius[blk] + 0.05);
    const clam = props.add(PK_CLAM, 10, 9); props.hold(clam, 10, 10);
    const j2 = createInkJet(); j2.fire(6, 9, 1, 0, 0);
    const r2 = fly(j2, OPEN, [], noHurt, { props, corpses: null }, 0.8);
    assert('pierce: a loot clam held on its wall takes the blob (one splash) and stays put; the blob flies on past it', r2.splats === 1 && d.vx[clam] === 0 && j2.events.pierced === 0 && r2.maxX > 11);
  }
  {
    const corpses = createCorpses(), c = corpses.data;
    const k = corpses.add('piranha', 10, 5, 0, 0, 1);
    c.state[k] = CS_REST; c.vx[k] = 0; c.vy[k] = 0;
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    const r = fly(jet, OPEN, [], noHurt, { props: createProps(), corpses }, 0.6);
    assert('pierce: a corpse is woken and pushed along the flight, once, and the blob flies on past it', r.pushes === 1 && r.splats === 1 && c.state[k] !== CS_REST && c.vx[k] > 2 && r.maxX > 11);
  }
  {
    // the blob moves the bomb for real: the props step carries the shove through the level's physics
    const w = createLevelWorld(0, 0, { level: handLevel(30, 12, (put) => { for (let x = 2; x < 28; x++) put(x, 9, MAT_ROCK); }) });
    const props = createProps(), d = props.data;
    const bomb = props.add(PK_BOMB, 12, 8.6);
    for (let i = 0; i < 60; i++) props.step(DT, w, null, null); // settle on the floor
    const x0 = d.x[bomb];
    const jet = createInkJet();
    jet.fire(8, d.y[bomb], 1, 0, 0);
    fly(jet, w, [], noHurt, { props, corpses: null }, 0.5);
    for (let i = 0; i < 25; i++) props.step(DT, w, null, null);
    assert('ink: in the real world a shot bomb rolls away along the floor (' + (d.x[bomb] - x0).toFixed(2) + ' tiles)', d.x[bomb] - x0 > 0.3 && !w.isSolid(d.x[bomb], d.y[bomb]));
  }
  {
    // creatures are hurt through the one hurt callback (main.js inkHurt), once per blob
    setHpMode(true);
    const en = createEnemies();
    const p = en.spawnAt('piranha', 10, 5, 'open');
    let calls = 0;
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    fly(jet, OPEN, en.all(), (e, dmg) => { calls++; en.hurt(e, dmg); }, { props: createProps(), corpses: createCorpses() }, 0.6);
    assert('ink: a creature is hurt through the shared hurt entry exactly once', calls === 1 && p.hp < 6);
    setHpMode(false); // module-level global: do not leak
  }

  // ================================================================ Pierce (2026-10-18): weak targets let the blob through
  {
    // two pots and a background fish in a row: all three take the blob, it flies on with its direction, speed and damage
    const props = createProps(), loot = createLoot(props);
    const l1 = loot.add({ lk: LK_POT, x: 8, y: 5, n: 1 }), l2 = loot.add({ lk: LK_POT, x: 9.5, y: 5, n: 1 });
    const fish = { ambient: true, kind: 'fish', x: 11, y: 5, radius: 0.3, hp: 1, dead: false };
    let fishHits = 0;
    const dmgSeen = [];
    const hurt = (e, dmg) => { dmgSeen.push(dmg); if (e === fish) { fishHits++; e.hp = 0; e.dead = true; } };
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    const vx0 = jet.data.vx[0];
    let broke = 0, pierced = 0, splats = 0, maxX = 0, bent = false;
    for (let t = 0; t < 0.8; t += DT) {
      jet.update(DT, OPEN, [fish], hurt, { props, corpses: createCorpses() });
      for (let k = 0; k < jet.events.nProp; k++) if (loot.hitProp(jet.events.propHit[k], 'ink')) broke++;
      pierced += jet.events.pierced; splats += jet.events.nSplat;
      if (jet.data.alive[0]) { maxX = jet.data.x[0]; if (jet.data.vy[0] !== 0 || jet.data.vx[0] !== vx0) bent = true; }
    }
    assert('pierce: a blob through two pots and a background fish breaks both pots, kills the fish with the full damage and flies on to its range (' + maxX.toFixed(2) + ')',
      broke === 2 && loot.data.state[l1] === 1 && loot.data.state[l2] === 1 && fish.dead && fishHits === 1 && dmgSeen.length === 1 && dmgSeen[0] === INKJET.damage && pierced === 3 && splats === 3 && maxX > 6 + INKJET.range - 0.5);
    assert('pierce: the blob keeps its direction and speed through the weak targets', !bent);
  }
  {
    // pot, then a piranha: the pot breaks, the piranha takes the full blob and stops it
    setHpMode(true);
    const props = createProps(), loot = createLoot(props), en = createEnemies();
    loot.add({ lk: LK_POT, x: 8, y: 5, n: 1 });
    const p = en.spawnAt('piranha', 10, 5, 'open'), hp0 = p.hp;
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    let broke = 0, stopX = NaN, hurts = 0;
    for (let t = 0; t < 0.8; t += DT) {
      const was = anyAlive(jet);
      jet.update(DT, OPEN, en.all(), (e, dmg) => { hurts++; en.hurt(e, dmg); }, { props, corpses: null });
      for (let k = 0; k < jet.events.nProp; k++) if (loot.hitProp(jet.events.propHit[k], 'ink')) broke++;
      if (was && !anyAlive(jet) && jet.events.nSplat) stopX = jet.events.splat[(jet.events.nSplat - 1) * 2];
    }
    assert('pierce: a blob through a pot into a piranha breaks the pot, hurts the piranha by the full ' + INKJET.damage + ' and stops on it (x ' + stopX + ')',
      broke === 1 && hurts === 1 && hp0 - p.hp === INKJET.damage && stopX > 9 && stopX < 10.2);
    setHpMode(false);
  }
  {
    // the same weak target is hit once per blob: a pot it overlaps for several sub-steps (nobody breaks it here), a corpse
    const props = createProps(), d = props.data, corpses = createCorpses();
    const pot = props.add(PK_POT, 8, 5);
    const k = corpses.add('piranha', 9.5, 5, 0, 0, 1);
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    let reports = 0, pierced = 0, pushes = 0;
    for (let t = 0; t < 0.8; t += DT) { jet.update(DT, OPEN, [], noHurt, { props, corpses }); reports += jet.events.nProp; pierced += jet.events.pierced; pushes += jet.events.pushes; }
    assert('pierce: one blob hits a pot it overlaps for several sub-steps once, and a corpse once (' + reports + ' reports, ' + pierced + ' pierced, ' + pushes + ' pushes)', reports === 1 && pierced === 2 && pushes === 2 && d.alive[pot] === 1 && corpses.data.vx[k] > 0);
    // a stand-in fish that does not die (a stub hurt): still only one hurt call per blob
    const fish = { ambient: true, kind: 'fish', x: 8, y: 5, radius: 0.5, hp: 1, dead: false };
    let calls = 0;
    const j2 = createInkJet(); j2.fire(6, 5, 1, 0, 0);
    for (let t = 0; t < 0.8; t += DT) j2.update(DT, OPEN, [fish], () => { calls++; }, null);
    const once = calls;
    j2.update(1.6, OPEN, [], noHurt, null); j2.fire(6, 5, 1, 0, 0); // a second blob may hit it again
    for (let t = 0; t < 0.8; t += DT) j2.update(DT, OPEN, [fish], () => { calls++; }, null);
    assert('pierce: a weak creature the blob overlaps for several steps is hurt once per blob (' + once + ', then ' + calls + ')', once === 1 && calls === 2);
  }
  {
    // strong targets still stop it: a bomb, a hp-less hazard stand-in (a pushable block and a creature: above)
    const props = createProps();
    props.add(PK_BOMB, 8, 5);
    const jet = createInkJet(); jet.fire(6, 5, 1, 0, 0);
    const r = fly(jet, OPEN, [], noHurt, { props, corpses: null }, 0.6);
    const hz = { kind: 'urchin', x: 8, y: 7, radius: 0.4, dead: false };
    const j2 = createInkJet(); j2.fire(6, 7, 1, 0, 0);
    const r2 = fly(j2, OPEN, [hz], noHurt, null, 0.6);
    assert('pierce: a bomb and a hazard (no hp) still stop the blob', r.splats === 1 && r.maxX < 8 && r2.splats === 1 && r2.maxX < 8);
    assert('pierce: the table says which kinds are weak (pots, loot clams, fish, corpses, rubble, finds) and strong (enemies, clam, tentacle, keeper, people, walls, bone, blocks, bombs)',
      ['pot', 'lootclam', 'ambient', 'corpse', 'rubble', 'find', 'droplet', 'pickup'].every((x) => pierces(x)) &&
      ['enemy', 'bone', 'gclam', 'tentacle', 'keeper', 'npc', 'ware', 'target', 'wall', 'block', 'bomb', 'rock', 'chest', 'relic'].every((x) => !pierces(x)) &&
      !pierces('pot', 'shot') && !pierces('nonsense') && PIERCE_KINDS.length === 22);
  }

  // ================================================================ Ink: pots, the cage, the background fish (unit level)
  {
    const props = createProps(), loot = createLoot(props);
    const li = loot.add({ lk: LK_POT, x: 10, y: 5, n: 2 });
    const jet = createInkJet();
    jet.fire(6, 5, 1, 0, 0);
    let broke = false;
    for (let t = 0; t < 0.6; t += DT) {
      jet.update(DT, OPEN, [], noHurt, { props, corpses: null });
      for (let k = 0; k < jet.events.nProp; k++) broke = loot.hitProp(jet.events.propHit[k], 'ink') || broke;
    }
    const ev = loot.takeEvents().find((e) => e.type === 'break');
    assert('ink: a blob reports the pot prop it hit and loot.hitProp breaks it (how ink)', broke && loot.data.state[li] === 1 && ev && ev.how === 'ink' && ev.shells === 2);
  }
  {
    const L = { meet: 'a', ask: 'b', help: 'c', thank: 'd' };
    const st = createQuestState({ qi: 0, kindId: Q_RESCUE, id: 'q', npc: 'pip', name: 'Q', reward: 4, count: 1, need: 0, max: 0, lines: L, done: 'd', journal: 'person-critter', variant: '', floorY: 11.05, pos: Float32Array.of(10.5, 10.5) });
    const miss = questInk(st, st.cx + CAGE_INK_R + 0.3, st.cy);
    const hit = questInk(st, st.cx - 0.5, st.cy);
    assert('ink: a blob splatting on the critter cage breaks it (he follows); a near miss does not', !miss && hit && st.following && st.brokenBy === 'ink');
  }
  {
    resetAmbient();
    killAmbient(12.37, 8.5);
    const p = ambientPos('fish', 12, 8, 1.2, 3, false, {});
    assert('ambient: a struck fish stays struck (by its base spot), others do not; drift matches the art (+-0.5 tiles)', isAmbientDead(12.37, 8.5) && !isAmbientDead(12, 8) && Math.abs(p.x - 12) <= 0.5 && Math.abs(p.y - 8) <= 0.12);
    resetAmbient();
  }

  // ================================================================ Dash: i-frames from the first frame, no damage
  {
    const o = createOctopus(5, 5);
    const press = { move: { x: 1, y: 0 }, dash: { pressed: true } }, idle = { move: { x: 0, y: 0 }, dash: { pressed: false } };
    stepOctopus(o, press, DT, OPEN);
    assert('dash: i-frames start on the dash step itself (' + o.dashInvuln.toFixed(3) + ' s)', Math.abs(o.dashInvuln - DASH_IFRAMES) < 1e-9 && octoPhasing(o));
    assert('dash: nothing hurts the octopus on its first frame (and no hurt blink is started)', !hurtOctopus(o, 6, 5, 'test') && o.hearts === 3 && o.invulnTimer === 0);
    let steps = 0;
    while (o.dashInvuln > 0 && steps < 100) { stepOctopus(o, idle, DT, OPEN); steps++; }
    assert('dash: the i-frames last ' + DASH_IFRAMES + ' s (' + steps + ' steps)', Math.abs(steps * DT - DASH_IFRAMES) < DT + 1e-9);
    assert('dash: after the i-frames a hit lands again', hurtOctopus(o, 6, 5, 'test') && o.hearts === 2);
  }
  {
    // a real dash straight into a piranha, a crab and a manta, every step through enemies.update: nobody is hurt
    const o = createOctopus(5, 5); o.angle = 90; // facing +x
    const en = createEnemies();
    const list = [en.spawnAt('piranha', 6.2, 5, 'open'), en.spawnAt('manta', 7.6, 5, 'open')];
    const press = { move: { x: 0, y: 0 }, dash: { pressed: true } }, idle = { move: { x: 0, y: 0 }, dash: { pressed: false } };
    let touched = 0;
    for (let i = 0; i < Math.round(DASH_IFRAMES / DT); i++) {
      stepOctopus(o, i === 0 ? press : idle, DT, OPEN);
      en.update(DT, 0, o, OPEN, []);
      for (const e of list) if (Math.hypot(e.x - o.x, e.y - o.y) < e.radius + o.radius) touched++;
    }
    assert('dash: it reached ram speed and touched the enemies (' + touched + ' contacts)', touched > 0);
    assert('dash without the Urchin Cap: the enemies live and the octopus loses nothing', list.every((e) => !e.dead) && o.hearts === 3);
  }

  // ================================================================ Urchin Cap
  {
    assert('urchin cap: a carried item with a name and blurb, one at most', ITEM_IDS.includes('urchincap') && ITEM_DEFS.urchincap.max === 1 && ITEM_DEFS.urchincap.name === 'Urchin Cap');
    const items = [], o = createOctopus(5, 5);
    assert('urchin cap: picking it up sets spikeHelmet', giveItem(items, o, 'urchincap') && o.spikeHelmet === true && !giveItem(items, o, 'urchincap'));
    const o2 = createOctopus(0, 0); applyCarried(o2, []);
    assert('urchin cap: without it the octopus has no spikes', o2.spikeHelmet === false);
    o.vx = RAM_SPEED + 0.5;
    assert('urchin cap: ramming needs the cap and dash speed', octoRams(o) && !octoRams(Object.assign(createOctopus(0, 0), { vx: 20 })) && !octoRams(Object.assign(createOctopus(0, 0), { vx: 3, spikeHelmet: true })));
    // the same real dash with the cap: the piranha dies, no damage taken
    const h = createOctopus(5, 5); h.angle = 90; applyCarried(h, items);
    const en = createEnemies(); const p = en.spawnAt('piranha', 6.2, 5, 'open');
    for (let i = 0; i < 15; i++) { stepOctopus(h, { move: { x: 0, y: 0 }, dash: { pressed: i === 0 } }, DT, OPEN); en.update(DT, 0, h, OPEN, []); }
    assert('urchin cap: a dash kills the piranha it hits, and the octopus is unhurt', p.dead && h.hearts === 3);
    const shop = await (await fetch('../data/shop-items.json')).json();
    const row = shop.items.find((r) => r.item === 'urchincap');
    const journal = await (await fetch('../data/journal.json')).json();
    const entries = Array.isArray(journal) ? journal : (journal.entries || []);
    assert('urchin cap: sold in the shop and has a journal entry with its icon', !!row && row.effect === 'carry' && row.journal === 'item-urchincap' && entries.some((e) => e.id === 'item-urchincap' && e.art && e.art.item === 'urchincap'));
    const img = await fetch('../img/v2/item-urchincap.webp');
    assert('urchin cap: its sprite loads', img.ok);
  }

  // ================================================================ hotbar: the Ink Jet slot shows the refill
  {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const ui = createHotbarUI(root);
    const st = { slots: [{ ids: ['inkcloud'] }], sel: 0, spellName: (id) => id, bombs: 1, bombMax: 3, juice: 0, cap: 6, perCast: 2, jetCharge: 0.5 };
    ui.update(st);
    const slot = root.querySelector('.octo-hb-jet'), shade = root.querySelector('.octo-hb-jetshade');
    const half = shade && shade.style.height;
    ui.update({ ...st, jetCharge: 1 });
    assert('hotbar: the Ink Jet slot veils half the ink sac at half charge and clears when ready (' + half + ')', !!slot && half === '50%' && shade.style.height === '0%' && slot.classList.contains('is-ready'));
    root.remove();
  }
}
