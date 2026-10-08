// Controls 2026-10-08 (V2-PLAN 17, CONTROLS-IDEAS scheme A): the hand (hand.js, hand-kinds.js), the two bombs (bomb.js /
// props.js: a dropped bomb sinks straight with no bounce, an aimed one is a sticky urchin-mine), the fuse and the blast
// radius, the hotbar's bomb slot, and the key / mouse mapping (F hand, C / right click use, Q / E / wheel / 1-9 hotbar).
// Hand-made rooms through the real createLevelWorld (the smoothed outline collision the game uses).
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank } from '../js/level.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createProps, PK_BOMB, PK_POT, PS_HELD, PS_CARRY, BM_HEAVY, BM_STICKY } from '../js/props.js';
import { createBombs, BOMB_FUSE_V2, STICKY_ARM_S } from '../js/bomb.js';
import { createCorpses, CS_CARRY } from '../js/corpses.js';
import { createLoot, ST_INTACT, ST_DONE } from '../js/loot.js';
import { createOctopus, hurtOctopus, stepOctopus } from '../js/octopus.js';
import { createHand, stepHand, attach, stepFlying, updateTarget, phoneHandMode, registerInteract, unregisterInteract, clearInteracts, interactKinds, findTarget, handUse, HAND_REACH, HOLD_DROP_S, PRI_DOOR } from '../js/hand.js';
import { registerHandKinds, WEIGHT } from '../js/hand-kinds.js';
import { createHotbar, castableSpell, selectIndex, selectNext, ensureSlot, isItemId, BOMB_SLOT } from '../js/hotbar.js';
import { createInput } from '../js/input.js';
import { createShopState, shopBuy, shopGrab, shopLetGo, shopKnock, shopStep, W_SHELF, W_LOOSE, W_HELD } from '../js/shop.js';
import { BOMB_RADIUS } from '../js/config.js';
import { BLAST_DRAW_RADIUS } from '../js/enemy-draw.js';
import { loadRoomsJson } from './rooms.test.js';

const DT = 0.02;
function room(w, h, fn) {
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = (x < 2 || y < 2 || x >= w - 2 || y >= h - 2 || fn(x, y)) ? 1 : 0;
  return createLevelWorld(1, 0, { level: { tiles, w, h, startX: 4, startY: 4, exitX: -1, exitY: -1, spawns: [], walls: [] } });
}
const PRESS = { pressed: true, held: true }, HOLD = { pressed: false, held: true }, UP = { pressed: false, held: false };
const NOINPUT = { move: { x: 0, y: 0 }, dash: UP, bomb: UP };

/** A small level: props, corpses, loot, bombs and fake enemies wired into the hand like main.js does. */
function stage(w = 30, h = 20, fn = (x, y) => y >= 14) {
  const world = room(w, h, fn);
  const props = createProps(), corpses = createCorpses(), loot = createLoot(props), bombs = createBombs(props);
  const list = [];
  const enemies = { all: () => list, killInRadius() { return 0; } };
  const octo = createOctopus(10, 10);
  const shopEvents = [];
  const env = { props, corpses, enemies, loot, bombs, shopSt: null, world, run: { shells: 0, items: [] }, onShopEvent: (ev) => shopEvents.push(ev) };
  clearInteracts();
  registerHandKinds(env);
  const hits = [];
  const ctx = {
    isSolid: (x, y) => world.isSolid(x, y),
    thrownHit(x, y, r, vx, vy, dmg, rec) {
      for (const e of list) { if (e.dead || (rec && e === rec.enemy)) continue; if (Math.hypot(e.x - x, e.y - y) < r + e.radius) { e.hp -= dmg; if (e.hp <= 0) e.dead = true; hits.push({ e, dmg }); return true; } }
      return false;
    },
  };
  const hand = createHand();
  const s = { world, props, corpses, loot, bombs, list, octo, hand, ctx, env, hits, shopEvents };
  s.step = (n = 1, btn = UP, aim = null) => {
    for (let k = 0; k < n; k++) {
      stepOctopus(octo, NOINPUT, DT, world);
      stepHand(hand, octo, btn, DT, aim, ctx);
      props.step(DT, world, octo, list); corpses.update(DT, world, null);
      for (const e of list) if (e.stun > 0 && !e.dead) { e.stun = Math.max(0, e.stun - DT); if (!e.carried) { e.x += e.kvx * DT; e.y += e.kvy * DT; } }
      loot.update(DT, octo, world, null);
      bombs.update(DT, world, octo, enemies);
      attach(hand, octo, ctx); stepFlying(hand, DT, ctx); updateTarget(hand, octo, ctx);
      btn = btn.pressed ? (btn.held ? HOLD : UP) : btn;
    }
  };
  s.tap = () => { s.step(1, PRESS); s.step(1, UP); };
  return s;
}
function fish(x, y, extra = {}) { return { kind: 'piranha', x, y, vx: 0, vy: 0, kvx: 0, kvy: 0, radius: 0.4, hp: 4, dead: false, moving: true, stun: 0, ...extra }; }

export async function runHandTests(assert) {
  setDefaultBank(createRoomBank(await loadRoomsJson()));

  // ---------------------------------------------------------------- input mapping
  {
    const input = createInput();
    const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    key('KeyF', true); let s = input.snapshot(); key('KeyF', false);
    assert('input: F is the hand (pressed + held), not a spell', s.hand.pressed && s.hand.held && !s.spell.pressed && !s.use.pressed);
    s = input.snapshot();
    assert('input: F released reads not held', !s.hand.held);
    key('KeyC', true); s = input.snapshot(); key('KeyC', false);
    assert('input: C uses the selected hotbar slot', s.use.pressed && s.src.use === 'key' && !s.hand.pressed);
    key('KeyQ', true); key('KeyQ', false); key('KeyE', true); key('KeyE', false); key('KeyE', true); key('KeyE', false); s = input.snapshot();
    assert('input: Q / E scroll the hotbar (-1 +2 = +1)', s.cycle === 1);
    key('Digit3', true); key('Digit3', false); s = input.snapshot();
    assert('input: 3 picks slot index 2', s.select === 2);
    key('KeyB', true); s = input.snapshot(); key('KeyB', false);
    assert('input: B still drops a bomb (quick bomb, keyboard source)', s.bomb.pressed && s.src.bomb === 'key');
    key('KeyJ', true); s = input.snapshot(); key('KeyJ', false);
    assert('input: J still fires the ink jet', s.attack.pressed);
    input.setOverride({ hand: true, use: true });
    s = input.snapshot();
    assert('input: the test override passes hand and use', s.hand.held && s.use.held);
    input.setOverride(null);
    const cv = document.createElement('canvas'); cv.width = 100; cv.height = 100;
    const mi = createInput(cv);
    cv.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: 5, clientY: 5, bubbles: true }));
    s = mi.snapshot(); window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    assert('input: the right button uses the selected slot (src mouse)', s.use.pressed && s.src.use === 'mouse');
    cv.dispatchEvent(new MouseEvent('mousedown', { button: 1, clientX: 5, clientY: 5, bubbles: true }));
    s = mi.snapshot(); window.dispatchEvent(new MouseEvent('mouseup', { button: 1 }));
    assert('input: the middle button is the quick bomb (src mouse)', s.bomb.pressed && s.src.bomb === 'mouse');
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    s = mi.snapshot();
    assert('input: the wheel scrolls the hotbar (two notches = +2)', s.cycle === 2);
  }

  // ---------------------------------------------------------------- hotbar with the bomb stack
  {
    const hb = createHotbar(['ink-cloud', BOMB_SLOT]);
    assert('hotbar: the bomb is an item slot', isItemId(BOMB_SLOT) && !isItemId('ink-cloud') && hb.slots[1].ids[0] === 'bomb');
    selectIndex(hb, 1);
    assert('hotbar: with the bomb selected the phone Spell button still casts the last spell', castableSpell(hb) === 'ink-cloud');
    selectNext(hb, 1);
    assert('hotbar: scrolling wraps round', hb.sel === 0);
    const hb2 = createHotbar(['ink-cloud']);
    assert('hotbar: ensureSlot adds the bomb once', ensureSlot(hb2, BOMB_SLOT) === 1 && ensureSlot(hb2, BOMB_SLOT) === 1 && hb2.slots.length === 2);
  }

  // ---------------------------------------------------------------- bombs: drop and sticky, fuse and radius
  {
    assert(`bombs: fuse ${BOMB_FUSE_V2} s and a lethal radius of 2.0 drawn at its true size`, BOMB_FUSE_V2 === 1.6 && BOMB_RADIUS === 2 && BLAST_DRAW_RADIUS === BOMB_RADIUS);
    const s = stage();
    const o = s.octo; o.vx = 3; o.vy = 0;
    s.bombs.place(o, 10, 10.4, null);
    const b = s.bombs.list()[0], d = s.props.data;
    assert('drop: a plain use makes a heavy bomb with no sideways speed', d.mode[b.pid] === BM_HEAVY && d.vx[b.pid] === 0);
    let maxUp = 0, prevVy = 0, xs = [];
    for (let n = 0; n < 70 && !b.exploded; n++) {
      s.props.step(DT, s.world, null); s.bombs.update(DT, s.world, o, { killInRadius() { return 0; } });
      if (b.pid >= 0) { xs.push(d.x[b.pid]); if (d.vy[b.pid] < 0) maxUp = Math.max(maxUp, -d.vy[b.pid]); }
    }
    const landedY = xs.length ? d.y[b.pid] : 0;
    assert(`drop: it sinks straight down (x drift ${(Math.max(...xs) - Math.min(...xs)).toFixed(3)}), lands on the floor and never bounces up (max up ${maxUp.toFixed(2)})`, Math.max(...xs) - Math.min(...xs) < 0.02 && maxUp < 0.05 && landedY > 13.4);
    const s2 = stage();
    let boomAt = -1, t = 0;
    s2.bombs.place(s2.octo, 10, 10.4, null);
    for (let n = 0; n < 150 && boomAt < 0; n++) { t += DT; s2.props.step(DT, s2.world, null); s2.bombs.update(DT, s2.world, s2.octo, { killInRadius() { return 0; } }); if (s2.bombs.events.some((e) => e.type === 'exploded')) boomAt = t; }
    assert(`drop: it goes off ${BOMB_FUSE_V2} s after the drop (${boomAt.toFixed(2)} s)`, Math.abs(boomAt - BOMB_FUSE_V2) < 0.05);
    // aimed: thrown right at a wall at x = 20, it clings to the wall and only then counts
    const s3 = stage(30, 20, (x, y) => y >= 14 || x >= 20);
    s3.bombs.place(s3.octo, 10, 10, { x: 1, y: 0 });
    const b3 = s3.bombs.list()[0], d3 = s3.props.data;
    let stuckAt = -1, t3 = 0, boom3 = -1, fuseBefore = 0;
    for (let n = 0; n < 300 && boom3 < 0; n++) {
      t3 += DT; s3.props.step(DT, s3.world, null); s3.bombs.update(DT, s3.world, s3.octo, { killInRadius() { return 0; }, all: () => [] });
      if (stuckAt < 0 && b3.pid >= 0 && d3.state[b3.pid] === PS_HELD) { stuckAt = t3; fuseBefore = b3.fuse; }
      if (s3.bombs.events.some((e) => e.type === 'exploded')) boom3 = t3;
    }
    assert(`sticky: an aimed bomb flies to the wall and clings to it (at ${stuckAt.toFixed(2)} s, x ${b3.x.toFixed(2)}, fuse untouched until then ${fuseBefore.toFixed(2)})`, stuckAt > 0 && b3.x > 19 && b3.x < 20 && fuseBefore > BOMB_FUSE_V2 - 0.05);
    assert(`sticky: it goes off ${BOMB_FUSE_V2} s after it clung (${(boom3 - stuckAt).toFixed(2)} s)`, Math.abs(boom3 - stuckAt - BOMB_FUSE_V2) < 0.06);
    // aimed into open water: it arms after STICKY_ARM_S
    const s4 = stage(60, 30, (x, y) => y >= 28);
    s4.bombs.place(s4.octo, 10, 6, { x: 0.3, y: -0.2 });
    let boom4 = -1, t4 = 0;
    for (let n = 0; n < 300 && boom4 < 0; n++) { t4 += DT; s4.props.step(DT, s4.world, null); s4.bombs.update(DT, s4.world, s4.octo, { killInRadius() { return 0; }, all: () => [] }); if (s4.bombs.events.some((e) => e.type === 'exploded')) boom4 = t4; }
    assert(`sticky: a mine that meets nothing arms after ${STICKY_ARM_S} s and goes off (${boom4.toFixed(2)} s)`, Math.abs(boom4 - STICKY_ARM_S - BOMB_FUSE_V2) < 0.08);
    // a mine thrown at a creature rides on it
    const s5 = stage();
    const f5 = fish(13, 10);
    s5.list.push(f5);
    s5.bombs.place(s5.octo, 10, 10, { x: 1, y: 0 });
    const b5 = s5.bombs.list()[0];
    for (let n = 0; n < 30; n++) { s5.props.step(DT, s5.world, null, s5.list); s5.bombs.update(DT, s5.world, s5.octo, { killInRadius() { return 0; }, all: () => s5.list }); }
    f5.x += 2; f5.y -= 1;
    s5.props.step(DT, s5.world, null); s5.bombs.update(DT, s5.world, s5.octo, { killInRadius() { return 0; }, all: () => s5.list });
    assert('sticky: a mine clings to the creature it hits and moves with it', !!b5.stickE && Math.abs(b5.x - f5.x) < 0.8 && Math.abs(b5.y - f5.y) < 0.8 && s5.props.data.state[b5.pid] === PS_CARRY);
  }

  // ---------------------------------------------------------------- Daniel 2026-10-08: a blast kills the octopus outright
  {
    const blastAt = (setup) => {
      const s = stage(); const o = s.octo; o.x = 10; o.y = 10; setup(o);
      s.bombs.place(o, 10.5, 10, null, { pinned: true, free: true });
      const dm = { killInRadius() { return 0; }, all: () => [] };
      for (let n = 0; n < 100 && s.bombs.list().some((b) => !b.exploded); n++) { s.props.step(DT, s.world, null); s.bombs.update(DT, s.world, o, dm); }
      return o;
    };
    const a = blastAt((o) => { o.invulnTimer = 5; });
    assert('bomb kill: inside the radius the blast kills the octopus, i-frames or not (cause bomb)', a.dead && a.cause === 'bomb');
    const b = blastAt((o) => { o.bombNoKill = true; });
    assert('bomb kill: in the tutorial (bombNoKill) it costs one heart, never the life', !b.dead && b.hearts === 2);
    const c = blastAt((o) => { o.x = 12.7; });
    assert('bomb kill: just outside the 2.0 radius she lives', !c.dead && c.hearts === 3);
  }

  // ---------------------------------------------------------------- the hand: grab / carry / throw / drop, every kind
  {
    // a pot
    const s = stage();
    const li = s.loot.add({ lk: 2, x: 10.9, y: 10, dx: 0, dy: 0, n: 2 });
    s.step(5);
    assert('hand: a pot in reach is the target (the tell, the phone Grab)', s.hand.target && s.hand.target.kind === 'pot' && phoneHandMode(s.hand, s.octo) === 'grab');
    s.tap();
    const pid = s.loot.data.pid[li];
    assert('hand: F picks the pot up (carried prop, weight, shield)', s.hand.heldKind === 'pot' && s.props.data.state[pid] === PS_CARRY && s.octo.carryMul === WEIGHT.pot && !!s.octo.shieldHit && phoneHandMode(s.hand, s.octo) === 'throw');
    s.octo.x = 14; s.octo.y = 9; s.step(2);
    assert('hand: the pot follows the tentacles', Math.hypot(s.props.data.x[pid] - 14, s.props.data.y[pid] - 9) < 1.1);
    const hearts = s.octo.hearts;
    const hurt = hurtOctopus(s.octo, 15, 9, 'piranha');
    assert('hand: a carried pot takes the hit for the octopus and breaks', !hurt && s.octo.hearts === hearts && s.loot.data.state[li] !== ST_INTACT && s.hand.held === null && s.octo.carryMul === 1);
    // a second pot: thrown into a fish
    const li2 = s.loot.add({ lk: 2, x: 14.6, y: 9.6, dx: 0, dy: 0, n: 1 });
    s.octo.invulnTimer = 0;
    s.step(3); s.tap();
    const f = fish(18, 9); s.list.push(f);
    s.step(1, PRESS, { x: 1, y: 0 }); s.step(1, UP, { x: 1, y: 0 });
    let n = 0; while (n++ < 60 && s.loot.data.state[s.loot.data.n - 1] === ST_INTACT) s.step(1);
    assert('hand: a tap throws the pot along the aim; it hits the fish (one damage entry) and breaks', s.hits.length === 1 && s.hits[0].e === f && s.loot.data.state[li2] !== ST_INTACT && s.hand.throws === 1);
    // hold F to drop gently
    const li3 = s.loot.add({ lk: 1, x: s.octo.x + 0.7, y: s.octo.y, dx: 0, dy: 0, n: 1 });
    s.step(2); s.tap();
    assert('hand: a clam is carried too', s.hand.heldKind === 'pot');
    s.step(1, PRESS);
    s.step(Math.ceil(HOLD_DROP_S / DT) + 1, HOLD);
    s.step(1, UP);
    assert('hand: holding F drops it gently (no throw, nothing in flight)', s.hand.held === null && s.hand.drops === 1 && s.hand.throws === 1 && s.hand.flying.length === 0 && s.loot.data.state[li3] === ST_INTACT);
  }
  {
    // a corpse: no shield, weight, thrown as a club
    const s = stage();
    const ci = s.corpses.add('piranha', 10.8, 10.1, 0, 0, 1);
    s.step(2); s.tap();
    assert('hand: a corpse can be carried (no shield, heavier)', s.hand.heldKind === 'corpse' && s.corpses.data.state[ci] === CS_CARRY && !s.octo.shieldHit && s.octo.carryMul === WEIGHT.corpse);
    const hearts = s.octo.hearts;
    hurtOctopus(s.octo, 11, 10, 'piranha');
    assert('hand: a corpse does not shield', s.octo.hearts === hearts - 1 && s.hand.heldKind === 'corpse');
    s.octo.vx = s.octo.vy = 0; s.step(10);
    const f = fish(s.octo.x + 2.5, s.octo.y); s.list.push(f);
    s.step(1, PRESS, { x: 1, y: 0 }); s.step(1, UP, { x: 1, y: 0 });
    for (let n = 0; n < 60 && !s.hits.length; n++) s.step(1);
    assert('hand: a thrown corpse hits a creature', s.hits.length === 1 && s.corpses.data.state[ci] !== CS_CARRY);
  }
  {
    // a stunned creature: carried while stunned, wriggles free and reacts
    const s = stage();
    const f = fish(10.9, 10, { stun: 0.5 });
    s.list.push(f);
    s.step(1);
    assert('hand: a stunned creature is a target, a lively one is not', s.hand.target && s.hand.target.kind === 'creature');
    s.tap();
    assert('hand: the stunned creature is in the tentacles', s.hand.heldKind === 'creature' && f.carried === true);
    s.octo.x = 12; s.step(3);
    assert('hand: it is carried along', Math.hypot(f.x - 12, f.y - s.octo.y) < 1.2);
    s.step(40);
    assert('hand: when its stun runs out it wriggles free (and reacts: its AI runs again)', s.hand.held === null && !f.carried && f.stun === 0);
    const g = fish(15, 10, { stun: 0 }); s.list.push(g);
    s.step(1);
    assert('hand: a lively creature cannot be grabbed', !s.hand.target || s.hand.target.kind !== 'creature');
  }
  {
    // a bomb: picked up, its fuse keeps running, thrown it sticks
    const s = stage(30, 20, (x, y) => y >= 14 || x >= 15);
    s.bombs.place(s.octo, 10.8, 10.2, null, { free: true });
    s.step(1);
    s.tap();
    const b = s.bombs.list()[0];
    const f0 = b.fuse;
    s.step(10);
    assert('hand: a bomb can be picked up and its fuse keeps running in the tentacles', s.hand.heldKind === 'bomb' && b.fuse < f0 - 0.15 && s.props.data.state[b.pid] === PS_CARRY);
    s.step(1, PRESS, { x: 1, y: 0 }); s.step(1, UP, { x: 1, y: 0 });
    let stuck = false;
    for (let n = 0; n < 40 && !stuck && !b.exploded; n++) { s.step(1); stuck = s.props.data.state[b.pid] === PS_HELD; }
    assert('hand: a bomb thrown from the hand is a sticky mine (clings to the wall)', stuck && s.props.data.mode[b.pid] === BM_STICKY && b.x > 13.5);
  }

  // ---------------------------------------------------------------- interact registry (doors, altars, ...)
  {
    const s = stage();
    let used = 0;
    registerInteract('door', { priority: PRI_DOOR, find: (o, reach) => ({ x: o.x + 0.5, y: o.y, ref: 7 }), use: (t) => { used = t.ref; return true; } });
    s.loot.add({ lk: 2, x: 10.6, y: 10, dx: 0, dy: 0, n: 1 });
    s.step(2);
    assert('interact: a registered door beats a pot in reach (priority)', s.hand.target.kind === 'door' && interactKinds().indexOf('door') >= 0 && phoneHandMode(s.hand, s.octo) === 'use');
    s.tap();
    assert('interact: F uses it (nothing is held)', used === 7 && s.hand.held === null && s.hand.uses === 1);
    unregisterInteract('door');
    s.step(1);
    assert('interact: unregistered, the pot is the target again', s.hand.target && s.hand.target.kind === 'pot');
    s.octo.vx = 3; s.step(1); s.octo.vx = 3;
    assert('phone: the Spell button only turns into Grab when the octopus is nearly still', phoneHandMode(s.hand, s.octo) === '');
    s.octo.x = 25; s.step(1);
    assert(`interact: nothing in reach (${HAND_REACH} tiles) means no target`, !s.hand.target);
  }

  // ---------------------------------------------------------------- shop: buy on F, unpaid wares, shooting one off
  {
    const items = [{ id: 'bombs', name: 'Bombs', effect: 'bombs', amount: 1, price: 3 }, { id: 'heart', name: 'Heart', effect: 'heart', amount: 1, price: 5 }, { id: 'bombs2', name: 'Bombs', effect: 'bombs', amount: 1, price: 30 }];
    const shop = { kx: 10, ky: 10, px: Int16Array.from([8, 12, 10, 12, 12, 12]), x0: 5, y0: 8, x1: 16, y1: 14 };
    const st = createShopState(shop, items, 1, 0);
    const o = createOctopus(8.5, 12.3); o.bombs = 1;
    assert('shop: swimming onto a pedestal no longer buys (contact off)', shopStep(st, o, 99, DT, [], false) === null && !st.sold.some((v) => v));
    const slot = [...st.stock].findIndex((k) => items[k].price === 3);
    let ev = shopBuy(st, slot, o, 10, []);
    assert('shop: F on a ware you can pay for buys it', ev.type === 'bought' && ev.shells === 7 && st.sold[slot] === 1);
    const props = createProps();
    const dear = [...st.stock].findIndex((k) => items[k].price === 30);
    ev = shopBuy(st, dear, o, 7, []);
    assert('shop: F on one you cannot pay for answers grab (lifted unpaid)', ev.type === 'grab');
    const pid = shopGrab(st, props, dear);
    assert('shop: the unpaid ware is in the hand', pid >= 0 && st.ware[dear] === W_HELD);
    const thrown = shopLetGo(st, dear, true, o);
    assert('shop: throwing an unpaid ware is theft', thrown && thrown.type === 'stolen' && st.ware[dear] === W_LOOSE);
    const other = [0, 1, 2].find((i) => i !== slot && i !== dear);
    const k = shopKnock(st, props, st.px[other * 2] - 0.1, st.px[other * 2 + 1] - 0.15, 0.2, 6, 0);
    assert('shop: an ink blob or a thrown thing knocks a ware off its pedestal', k === 1 && st.ware[other] === W_LOOSE);
    assert('shop: a ware already gone is not knocked again', shopKnock(st, props, st.px[other * 2], st.px[other * 2 + 1], 0.3) === 0);
  }
  clearInteracts();
}
