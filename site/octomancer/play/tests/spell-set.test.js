// SPELLS-PICK.md (2026-10-08): the first spell set. Price folding and the whole-cast floor; Riptide moves a corpse, a prop and a free
// swimmer but not a rooted creature, and expires; Coral Wall skips occupied, border, shop and jet cells, refuses a blocked cast for
// free and crumbles at 25 s with a rebake; Anchor ignores jet, blast and knock impulses, crushes at >= 6 u/s, smashes timber and
// cannot dash; Delayed fires at 1.5 s; Ink Cloud rides a jet and a blast clears it; the rune pedestals' order and rules.
import {
  SPELLS, MODS, SLOT, JUICE, spellById, modById, resolveSlot, slotPrice, castSpell, createInkClouds, CAST_OK, CAST_NONE, CAST_BUSY, CAST_EMPTY,
} from '../js/spells.js';
import { createSpellFx, ANCHOR_CRUSH_SPEED } from '../js/spell-fx.js';
import { createHazards, JET_ACC, HZ_JET, HZ_NONE } from '../js/hazards.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps, PK_POT } from '../js/props.js';
import { createEnemies } from '../js/enemies.js';
import { createDamage } from '../js/damage.js';
import { createCorpses } from '../js/corpses.js';
import { createOctopus, stepOctopus, hurtOctopus } from '../js/octopus.js';
import { createBombs } from '../js/bomb.js';
import { MAT_CORAL, MAT_TIMBER, MAT_ROCK, MAT_BOMBABLE, MAT_BOULDER_BREAKS } from '../js/materials.js';
import { SOURCES, resolveHit, pushScale } from '../js/creature-rules.js';
import { createHotbar } from '../js/hotbar.js';
import { runeForLevel, takeRune, slotForMod, ownsRune, RUNE_SPELLS, RUNE_MODS } from '../js/runes.js';
import { setGameView, resetGameView } from '../js/cull.js';
import { createInfight } from '../js/infight.js';

const DT = 1 / 60;
const NO_INPUT = { move: { x: 0, y: 0 }, dash: { pressed: false, held: false } };
const DASH = { move: { x: 0, y: 0 }, dash: { pressed: true, held: true } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/** A 30 x 30 open room (rock border 2 wide), an optional timber floor row. */
function room(opts = {}) {
  const W = 30, H = 30, tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles[y * W + x] = (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) ? MAT_ROCK : 0;
  if (opts.timberRow) for (let x = 2; x < W - 2; x++) tiles[opts.timberRow * W + x] = MAT_TIMBER;
  return createLevelWorld(1, 0, { level: { tiles, w: W, h: H, startX: 6, startY: 6, exitX: -1, exitY: -1, spawns: [], walls: [] } });
}
function rig(opts = {}) {
  const world = room(opts);
  const props = createProps(), hazards = createHazards(props), en = createEnemies(), dm = createDamage();
  dm.register(en.family);
  hazards.setDamage(dm);
  const clouds = createInkClouds();
  const fx = createSpellFx({ world: opts.worldWrap ? opts.worldWrap(world) : world, hazards, props, damage: dm, clouds });
  return { world, props, hazards, en, dm, clouds, fx };
}
const ctxOf = (r, x, y, dx = 1, dy = 0) => ({ clouds: r.clouds, fx: r.fx, x, y, vx: 0, vy: 0, dirX: dx, dirY: dy });

export async function runSpellSetTests(assert) {
  setGameView({ x: 15, y: 15, pxPerUnit: 32 }, 1280, 1280); // the whole room is "on screen" (hazards act only in view)
  try {
    // ------------------------------------------------------------ data and price folding
    assert('spell set: five spells (Ink Cloud, Riptide, Coral Wall, Anchor, Lure) and three runes (Heavy, Delayed, Lingering)',
      ['ink-cloud', 'riptide', 'coral-wall', 'anchor', 'lure'].every((id) => spellById(id)) && SPELLS.length === 5 &&
      ['heavy', 'delayed', 'lingering'].every((id) => modById(id)) && MODS.length === 3 && SLOT.maxMods === 2 && SLOT.castLock === 0.4);
    const rp = resolveSlot(['riptide']);
    assert('Riptide: 5 tiles, half width 1.1, 3 s, 0.8 x JET_ACC, 1 cast', rp.price === 1 && near(rp.length, 5) && near(rp.radius, 1.1) && near(rp.duration, 3) && near(rp.power, 0.8));
    const rh = resolveSlot(['riptide', 'heavy']);
    assert('Heavy Riptide: width 1.1 -> 1.76, length 5 -> 8, 0.6 of the time, 2 casts', rh.price === 2 && near(rh.radius, 1.76, 1e-5) && near(rh.length, 8, 1e-5) && near(rh.duration, 1.8, 1e-5));
    const rl = resolveSlot(['riptide', 'lingering']);
    assert('Lingering Riptide: 7.5 s at 0.48 x JET_ACC, 2 casts', rl.price === 2 && near(rl.duration, 7.5, 1e-5) && near(rl.power, 0.48, 1e-5));
    assert('Delayed is free: Riptide + Delayed costs 1 cast and goes off 1.5 s later', slotPrice(['riptide', 'delayed']) === 1 && near(resolveSlot(['riptide', 'delayed']).delay, 1.5));
    assert('Heavy + Lingering in one slot costs 3 casts (the whole jar)', slotPrice(['coral-wall', 'heavy', 'lingering']) === 3 && 3 * JUICE.perCast === JUICE.jarCasts * JUICE.perCast);
    const ch = resolveSlot(['coral-wall', 'heavy']), cl = resolveSlot(['coral-wall', 'lingering']);
    assert('Coral Wall: 3 cells, 25 s; Heavy 5 cells; Lingering lasts the level', resolveSlot(['coral-wall']).cells === 3 && near(resolveSlot(['coral-wall']).duration, 25) && ch.cells === 5 && cl.permanent && !ch.permanent);
    assert('Lingering Ink Cloud: 10 s', near(resolveSlot(['ink-cloud', 'lingering']).duration, 10, 1e-5));
    const ah = resolveSlot(['anchor', 'heavy', 'lingering']);
    assert('Heavy and Lingering are greyed on Anchor: no change, no price', ah.price === 1 && ah.greyed.join() === 'heavy,lingering' && ah.mods.length === 0 && near(ah.duration, 2));
    assert('at most two runes per slot: a third is greyed', resolveSlot(['ink-cloud', 'heavy', 'lingering', 'delayed']).greyed.join() === 'delayed');
    {
      let ok = true;
      const ids = ['ink-cloud', 'riptide', 'coral-wall', 'anchor', 'lure'], mods = [[], ['heavy'], ['delayed'], ['lingering'], ['heavy', 'delayed'], ['heavy', 'lingering'], ['delayed', 'lingering']];
      for (const s of ids) for (const m of mods) { const p = resolveSlot([s, ...m]); if (!Number.isInteger(p.price) || p.price < 1 || p.price > 3) ok = false; if (p.duration < spellById(s).duration * 0.4 - 1e-6 || p.duration > spellById(s).duration * 3 + 1e-6) ok = false; }
      assert('every slot price is a whole number of casts, never below 1; durations stay within the 0.4-3x clamp', ok);
    }
    assert('the source table: riptide is a push with no damage, anchor a body hit; the keeper rides a Riptide at half force',
      SOURCES.riptide && SOURCES.riptide.dmg === 0 && SOURCES.anchor.crush && pushScale('keeper', 'riptide') === 0.5 && pushScale('piranha', 'riptide') === 1 &&
      resolveHit('piranha', 'anchor').kill && !resolveHit('marlo', 'anchor').kill && !resolveHit('keeper', 'anchor').kill && resolveHit('beholder', 'anchor').ignore);
    assert('MAT_CORAL breaks under a bomb and under a boulder (or an Anchor)', MAT_BOMBABLE[MAT_CORAL] === 1 && MAT_BOULDER_BREAKS[MAT_CORAL] === 1);

    // ------------------------------------------------------------ the cast: jar, lock, refusal
    {
      const r = rig();
      const run = { juice: 12 };
      const o = createOctopus(6, 6); r.fx.setOcto(o);
      const c = ctxOf(r, 10.5, 20.5); c.now = 0;
      const a = castSpell(run, ['ink-cloud'], c);
      c.now = 0.2; const b = castSpell(run, ['ink-cloud'], c);
      c.now = 0.45; const d = castSpell(run, ['ink-cloud'], c);
      assert('one global 0.4 s cast lock: a second cast 0.2 s later is refused for free, 0.45 s later it goes', a === CAST_OK && b === CAST_BUSY && d === CAST_OK && run.juice === 4);
      run.juice = 4;
      assert('Heavy Riptide (2 casts) with one cast in the jar: the empty jar, nothing paid', castSpell(run, ['riptide', 'heavy'], ctxOf(r, 10, 10)) === CAST_EMPTY && run.juice === 4);
    }

    // ------------------------------------------------------------ Riptide
    {
      const r = rig();
      const o = createOctopus(20.5, 25.5); r.fx.setOcto(o);
      const run = { juice: 12 };
      const pot = r.props.add(PK_POT, 11, 10.5, 0, 0, { radius: 0.3 });
      const fish = r.en.spawnAt('piranha', 12, 9.8, 'open');
      const cannon = r.en.spawnAt('cannon', 13, 10.2, 'open');
      const corpses = createCorpses(); const ci = corpses.add('crab', 12.5, 10.5, 0, 0);
      const ok = castSpell(run, ['riptide'], ctxOf(r, 9.5, 10.2, 1, 0));
      const x0 = { pot: r.props.data.x[pot], fish: fish.x, cannon: cannon.x, corpse: corpses.data.x[ci] };
      for (let k = 0; k < 90; k++) { r.hazards.update(DT, k * DT, o, r.world, null); r.props.step(DT, r.world, o, []); corpses.update(DT, r.world, r.hazards.data); }
      assert(`Riptide: a cast adds one temporary jet to the right (cast ${ok})`, ok === CAST_OK && r.fx.riptideCount() === 1 && r.hazards.data.dx[0] === 1);
      assert(`Riptide carries a prop (pot ${x0.pot.toFixed(2)} -> ${r.props.data.x[pot].toFixed(2)}), a corpse (${x0.corpse.toFixed(2)} -> ${corpses.data.x[ci].toFixed(2)}) and a free swimmer (piranha ${x0.fish.toFixed(2)} -> ${fish.x.toFixed(2)})`,
        r.props.data.x[pot] > x0.pot + 0.4 && corpses.data.x[ci] > x0.corpse + 0.4 && fish.x > x0.fish + 0.05);
      assert('Riptide does not move a rooted creature (the cannon)', cannon.x === x0.cannon);
      for (let k = 0; k < 200; k++) r.hazards.update(DT, 1.5 + k * DT, o, r.world, null);
      assert('Riptide expires after its 3 s and its slot is free again', r.fx.riptideCount() === 0 && r.hazards.data.kind[0] === HZ_NONE);
      // the newest replaces the oldest; a jet pushes the octopus, an anchored one is not moved
      castSpell(run, ['riptide'], ctxOf(r, 4.5, 20.5, 1, 0)); castSpell(run, ['riptide'], ctxOf(r, 4.5, 15.5, 1, 0)); castSpell(run, ['riptide'], ctxOf(r, 4.5, 5.5, 1, 0));
      assert('at most two Riptides: the newest replaces the oldest', r.fx.riptideCount() === 2);
      const a = createOctopus(6, 15.5), b = createOctopus(6, 15.5); b.anchorT = 5;
      for (let k = 0; k < 30; k++) { r.hazards.update(DT, 5 + k * DT, a, r.world, null); r.hazards.update(DT, 0, b, r.world, null); }
      assert(`Riptide pushes the octopus too (vx ${a.vx.toFixed(2)}), but not an anchored one (vx ${b.vx.toFixed(2)})`, a.vx > 2 && b.vx === 0);
      assert('Riptide stops at the first rock along its line', (() => { const i = r.hazards.addTempJet(25, 10, 1, 0, 1, 1, 1, 1); r.hazards.endTempJet(i); const r2 = rig(); r2.fx.setOcto(o); r2.fx.riptide(25.5, 10.5, 1, 0, rp); return near(r2.hazards.data.len[0], 2.25, 0.3); })());
    }

    // ------------------------------------------------------------ Coral Wall
    {
      const r = rig({ worldWrap: (w) => Object.assign(Object.create(w), { inShop: (x, y) => x >= 20 && x < 24 && y >= 20 && y < 24, tileAt: w.tileAt, isSolid: w.isSolid, isBedrock: w.isBedrock, placeTile: w.placeTile, breakTile: w.breakTile, smashTile: w.smashTile, width: w.width, height: w.height }) });
      const o = createOctopus(6, 6); r.fx.setOcto(o);
      const run = { juice: 12 };
      const v0 = r.world.bandVersion(r.world.bandCount() > 1 ? 1 : 0), bands = r.world.bandCount();
      const ok = castSpell(run, ['coral-wall'], ctxOf(r, 10.5, 27.5));
      for (let k = 0; k < 40; k++) r.fx.update(DT, o);
      const col = [27, 26, 25].map((ty) => r.world.tileAt(10, ty));
      assert(`Coral Wall grows a column of 3 coral cells up from the target (${col.join(',')}) over 0.4 s`, ok === CAST_OK && col.every((m) => m === MAT_CORAL) && r.world.tileAt(10, 24) === 0 && r.fx.coralCount() === 3);
      let rebaked = false; for (let b = 0; b < bands; b++) if (r.world.bandVersion(b) > 0) rebaked = true;
      assert('the grown coral bumps its band (the wall cell is baked again)', rebaked);
      // the octopus sits in the middle cell: it is skipped, the column grows round it
      const body = createOctopus(15.5, 26.5); r.fx.setOcto(body);
      castSpell(run, ['coral-wall'], ctxOf(r, 15.5, 27.5));
      for (let k = 0; k < 40; k++) r.fx.update(DT, body);
      assert('a cell a body overlaps is skipped (the octopus), the column goes on above it', r.world.tileAt(15, 27) === MAT_CORAL && r.world.tileAt(15, 26) === 0 && r.world.tileAt(15, 25) === MAT_CORAL);
      // shop and jets and border: refused for free
      run.juice = 4;
      const shop = castSpell(run, ['coral-wall'], ctxOf(r, 21.5, 22.5));
      assert('inside the shop rect it does not grow, and nothing is paid', shop === CAST_NONE && run.juice === 4);
      r.hazards.add({ hk: HZ_JET, x: 5.5, y: 28, dx: 0, dy: -1, len: 10 });
      const jet = castSpell(run, ['coral-wall'], ctxOf(r, 5.5, 22.5));
      assert('inside a live jet stream it does not grow (free)', jet === CAST_NONE && run.juice === 4 && r.world.tileAt(5, 22) === 0);
      assert('never on the level border', !r.fx.canGrow(1, 10) && !r.fx.canGrow(0, 0));
      // crumbles at 25 s
      const r2 = rig(); const o2 = createOctopus(6, 6); r2.fx.setOcto(o2);
      castSpell({ juice: 4 }, ['coral-wall'], ctxOf(r2, 12.5, 27.5));
      let t = 0, at = -1;
      for (let k = 0; k < 27 * 60; k++) { r2.fx.update(DT, o2); t += DT; if (at < 0 && r2.fx.events.some((e) => e.type === 'coralCrumble')) at = t; }
      assert(`Coral Wall crumbles on its own 25 s after it grew (first cell at ${at.toFixed(2)} s) back to water`, at > 25.1 && at < 25.2 && r2.world.tileAt(12, 27) === 0 && r2.fx.coralCount() === 0);
      const r3 = rig(); const o3 = createOctopus(6, 6); r3.fx.setOcto(o3);
      castSpell({ juice: 12 }, ['coral-wall', 'lingering'], ctxOf(r3, 12.5, 27.5));
      for (let k = 0; k < 40 * 60; k++) r3.fx.update(DT, o3);
      assert('Lingering coral is still standing after 40 s', r3.world.tileAt(12, 27) === MAT_CORAL && r3.fx.coralCount() === 3);
      const r4 = rig(); const o4 = createOctopus(6, 6); r4.fx.setOcto(o4);
      for (let k = 0; k < 10; k++) { castSpell({ juice: 4 }, ['coral-wall'], ctxOf(r4, 4.5 + k * 2, 27.5)); for (let s = 0; s < 40; s++) r4.fx.update(DT, o4); }
      assert(`at most 24 coral cells: the oldest crumble first (${r4.fx.coralCount()})`, r4.fx.coralCount() === 24 && r4.world.tileAt(4, 27) === 0 && r4.world.tileAt(22, 27) === MAT_CORAL);
    }

    // ------------------------------------------------------------ Anchor
    {
      const r = rig();
      const o = createOctopus(10, 6); r.fx.setOcto(o);
      const run = { juice: 12 };
      const ok = castSpell(run, ['anchor'], ctxOf(r, o.x, o.y));
      const cool = o.dashCooldown;
      stepOctopus(o, DASH, DT, r.world);
      assert('Anchor: cast on self, no dash while it lasts', ok === CAST_OK && o.anchorT > 0 && !o.dashedThisStep && o.dashCooldown === cool);
      const vy0 = o.vy, vx0 = o.vx;
      hurtOctopus(o, o.x - 1, o.y, 'test');
      assert('a knock still hurts but does not move an anchored octopus', o.hearts === 2 && o.vx === vx0 && o.vy === vy0);
      // the blast: hurts (invulnerable here), never throws
      const bombs = createBombs(r.props); o.invulnTimer = 9;
      const vb = o.vx; bombs.place(o, o.x - 1.2, o.y, null, { pinned: true });
      for (let k = 0; k < 200; k++) bombs.update(DT, r.world, o, r.dm);
      assert(`a blast does not throw an anchored octopus (vx ${o.vx.toFixed(3)})`, near(o.vx, vb, 1e-3));
      // the swim-up is ignored: it keeps sinking
      for (let k = 0; k < 20; k++) stepOctopus(o, { move: { x: 0, y: -1 }, dash: { pressed: false } }, DT, r.world);
      assert(`no swim-up: holding up it still sinks (vy ${o.vy.toFixed(2)})`, o.vy > 3);
    }
    {
      // crush: a piranha under the falling octopus
      const r = rig();
      const o = createOctopus(10, 8); r.fx.setOcto(o);
      const fish = r.en.spawnAt('piranha', 10, 20, 'open');
      castSpell({ juice: 4 }, ['anchor'], ctxOf(r, o.x, o.y));
      let killed = false, vyHit = 0;
      for (let k = 0; k < 120 && !killed; k++) { stepOctopus(o, NO_INPUT, DT, r.world); r.fx.update(DT, o); if (fish.dead) { killed = true; vyHit = o.anchorVy; } fish.x = 10; fish.y = 20; }
      assert(`Anchor crushes a piranha it lands on at >= ${ANCHOR_CRUSH_SPEED} u/s (hit at ${vyHit.toFixed(1)} u/s)`, killed && vyHit >= ANCHOR_CRUSH_SPEED);
      const r2 = rig();
      const slow = createOctopus(10, 19.2); r2.fx.setOcto(slow);
      const fish2 = r2.en.spawnAt('piranha', 10, 20, 'open');
      castSpell({ juice: 4 }, ['anchor'], ctxOf(r2, slow.x, slow.y));
      for (let k = 0; k < 10; k++) { stepOctopus(slow, NO_INPUT, DT, r2.world); r2.fx.update(DT, slow); fish2.x = 10; fish2.y = 20; }
      assert('a slow touch (under 6 u/s) does not crush', !fish2.dead);
    }
    {
      // smash: a timber floor under it; the Anchor ends 0.4 s after coming to rest
      const r = rig({ timberRow: 20 });
      const o = createOctopus(10, 8); r.fx.setOcto(o);
      castSpell({ juice: 4 }, ['anchor'], ctxOf(r, o.x, o.y));
      let smashed = false;
      for (let k = 0; k < 150; k++) { stepOctopus(o, NO_INPUT, DT, r.world); r.fx.update(DT, o); if (r.world.tileAt(10, 20) === 0) smashed = true; }
      assert('Anchor smashes the timber it lands on', smashed && r.fx.stats.smashes >= 1);
      const r2 = rig();
      const o2 = createOctopus(10, 26.5); r2.fx.setOcto(o2);
      castSpell({ juice: 4 }, ['anchor'], ctxOf(r2, o2.x, o2.y));
      let t = 0; while (o2.anchorT > 0 && t < 3) { stepOctopus(o2, NO_INPUT, DT, r2.world); t += DT; }
      assert(`Anchor ends early 0.4 s after coming to rest (${t.toFixed(2)} s, not 2 s)`, t > 0.5 && t < 1.0);
    }

    // ------------------------------------------------------------ Delayed
    {
      const r = rig();
      const o = createOctopus(6, 6); r.fx.setOcto(o);
      castSpell({ juice: 4 }, ['ink-cloud', 'delayed'], ctxOf(r, 15, 15));
      let at = -1, t = 0;
      for (let k = 0; k < 150; k++) { r.fx.update(DT, o); t += DT; if (at < 0 && r.clouds.count() === 1) at = t; }
      assert(`Delayed: a mote drifts first and the cloud goes off 1.5 s later (at ${at.toFixed(2)} s)`, at > 1.45 && at < 1.56 && r.fx.moteCount() === 0);
      const r2 = rig(); const o2 = createOctopus(10, 8); r2.fx.setOcto(o2);
      castSpell({ juice: 4 }, ['anchor', 'delayed'], ctxOf(r2, o2.x, o2.y));
      const before = o2.anchorT;
      for (let k = 0; k < 100; k++) r2.fx.update(DT, o2);
      assert('Delayed Anchor: the drop starts 1.5 s later', before === 0 && o2.anchorT > 0);
      let n = 0; const run = { juice: 99 };
      for (let k = 0; k < 6; k++) if (castSpell(run, ['ink-cloud', 'delayed'], ctxOf(r, 15, 15)) === CAST_OK) n++;
      assert('at most four motes wait at once (the fifth cast is refused for free)', n === 4);
    }

    // ------------------------------------------------------------ Ink Cloud reactions
    {
      const r = rig();
      r.hazards.add({ hk: HZ_JET, x: 10.5, y: 27, dx: 0, dy: -1, len: 7 });
      const cl = r.clouds; cl.puff(10.5, 24, 0, 0, resolveSlot(['ink-cloud']));
      const still = createInkClouds(); still.puff(10.5, 24, 0, 0, resolveSlot(['ink-cloud']));
      for (let k = 0; k < 60; k++) { cl.update(DT, (x, y) => r.hazards.forceAt(x, y)); still.update(DT); }
      assert(`a jet carries an ink cloud along its stream (y ${cl.data.y[0].toFixed(2)} vs ${still.data.y[0].toFixed(2)} without)`, cl.data.y[0] < still.data.y[0] - 0.5);
      const b = createInkClouds(); b.puff(5, 5, 0, 0, resolveSlot(['ink-cloud']));
      b.blast(5.5, 5, 2);
      for (let k = 0; k < 30; k++) b.update(DT);
      assert('a blast inside a cloud blows it out (gone within half a second)', b.count() === 0);
    }

    // ------------------------------------------------------------ Lure (on the infighting owner's target override, infight.js setLure)
    {
      const lp = resolveSlot(['lure']), lh = resolveSlot(['lure', 'heavy']), ll = resolveSlot(['lure', 'lingering']);
      assert('Lure: light 2.5, 6 s, 1 cast; Heavy light 4; Lingering 15 s', lp.price === 1 && near(lp.radius, 2.5) && near(lp.duration, 6) && near(lh.radius, 4, 1e-5) && near(ll.duration, 15, 1e-5));
      const world = room(), props = createProps(), hazards = createHazards(props), en = createEnemies(), dm = createDamage();
      dm.register(en.family); hazards.setDamage(dm);
      const inf = createInfight(dm, { corpses: () => null, props: () => props });
      en.setInfight(inf);
      const fx = createSpellFx({ world, hazards, props, damage: dm, clouds: createInkClouds(), infight: inf });
      const octo = createOctopus(27, 3); octo.invulnTimer = 1e9; fx.setOcto(octo);
      const fish = en.spawnAt('piranha', 8, 10, 'open');
      const boss = en.spawnAt('beholder', 24, 20);
      const ok = castSpell({ juice: 4 }, ['lure'], { clouds: null, fx, x: 14, y: 16, vx: 0, vy: 0, dirX: 1, dirY: 0 });
      const step = (n) => { for (let k = 0; k < n; k++) { dm.tick(DT); inf.tick(DT); en.update(DT, 30, octo, world, [], null); hazards.update(DT, 0, octo, world, null); fx.update(DT, octo); } };
      step(20);
      const early = inf.lures().length;
      step(20);
      assert(`Lure: no pull during its 0.6 s grace, then one lure on the hook (${early} then ${inf.lures().length})`, ok === CAST_OK && early === 0 && inf.lures().length === 1 && fx.lureLive());
      const d0 = Math.hypot(fish.x - 14, fish.y - 16), b0 = Math.hypot(boss.x - octo.x, boss.y - octo.y);
      step(240);
      const d1 = Math.hypot(fish.x - 14, fish.y - 16), b1 = Math.hypot(boss.x - octo.x, boss.y - octo.y), bl = Math.hypot(boss.x - 14, boss.y - 16);
      assert(`Lure retargets a patrolling piranha (${d0.toFixed(1)} -> ${d1.toFixed(1)} tiles from it)`, d1 < 2 && d1 < d0 - 3);
      assert(`the Beholder ignores the Lure: it keeps closing on the octopus (${b0.toFixed(1)} -> ${b1.toFixed(1)})`, b1 < b0);
      step(120);
      assert('Lure runs out after 6 s and leaves the hook', !fx.lureData.on && inf.lures().length === 0);
      castSpell({ juice: 4 }, ['lure'], { clouds: null, fx, x: 14, y: 16, vx: 0, vy: 0, dirX: 1, dirY: 0 }); step(50);
      castSpell({ juice: 4 }, ['lure'], { clouds: null, fx, x: 10, y: 10, vx: 0, vy: 0, dirX: 1, dirY: 0 }); step(50);
      assert('at most one Lure: the newest replaces it', inf.lures().length === 1 && near(inf.lures()[0].x, 10, 0.3));
      const gone = fx.blast(10.5, 10, 1.5);
      assert('a blast on the Lure ends it', gone && inf.lures().length === 0 && !fx.lureData.on);
      hazards.addTempJet(4, 16, 1, 0, 6, 1.1, 0.8, 3);
      castSpell({ juice: 4 }, ['lure'], { clouds: null, fx, x: 5, y: 16, vx: 0, vy: 0, dirX: 1, dirY: 0 }); step(90);
      assert(`a Riptide carries the Lure (x 5 -> ${fx.lureData.x.toFixed(2)})`, fx.lureData.x > 5.5);
    }

    // ------------------------------------------------------------ runes
    {
      const hb = createHotbar();
      const first = runeForLevel(1234, hb);
      assert('pedestals offer spells before modifiers, the same order for the same dive', RUNE_SPELLS.includes(first) && runeForLevel(1234, hb) === first);
      takeRune(hb, 'riptide'); takeRune(hb, 'anchor');
      assert('a spell rune becomes a new slot and is selected', hb.slots.length === 3 && hb.slots[2].ids[0] === 'anchor' && hb.sel === 2 && ownsRune(hb, 'riptide'));
      const i = takeRune(hb, 'heavy');
      assert('Heavy cannot go on Anchor (selected): it goes to the first slot it changes', i === 0 && hb.slots[0].ids.join() === 'ink-cloud,heavy');
      hb.sel = 1; takeRune(hb, 'lingering');
      assert('a modifier goes into the selected slot when it fits', hb.slots[1].ids.join() === 'riptide,lingering');
      hb.slots = [{ ids: ['anchor'] }]; hb.sel = 0;
      assert('a modifier no slot takes stays on its pedestal', takeRune(hb, 'lingering') === -1 && slotForMod(hb, 'delayed') === 0);
      const full = createHotbar(); for (const id of RUNE_SPELLS) takeRune(full, id); for (const id of RUNE_MODS) takeRune(full, id);
      assert('every rune owned: no more pedestals', runeForLevel(5, full) === null);
    }
  } finally {
    resetGameView();
  }
}
