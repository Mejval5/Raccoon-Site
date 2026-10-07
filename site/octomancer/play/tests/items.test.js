// Round 32: carried items (items.js) and the round-31 review fixes (clam ribs, swarm spots, shell pop / pickup delay).
import {
  ITEM_IDS, ITEM_DEFS, FLIPPER_MUL, MAGNET_R, LIGHT_BASE, LIGHT_LANTERN, applyCarried, giveItem, canCarry, itemFromCode, itemCount,
} from '../js/items.js';
import { createOctopus, stepOctopus } from '../js/octopus.js';
import { createRun, runEvent, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, EV_CONTINUE } from '../js/run.js';
import { parseShopItems, createShopState, shopStep, canUse } from '../js/shop.js';
import { createPickups, SHELL_PICKUP_DELAY } from '../js/pickups.js';
import {
  createLoot, makeLootRecord, spreadShells, findSwarmSpots, POCKET_ITEM, TRAP_SWARM,
} from '../js/loot.js';
import { createBombs } from '../js/bomb.js';
import { drawLoot } from '../js/loot-draw.js';
import { drawItemIcon } from '../js/items-draw.js';
import { ENTRIES } from '../js/journal.js';
import { HEART_MAX, BOMB_MAX } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { createLevelWorld } from '../js/world-v2.js';
import { buildLevelSpawns } from '../js/level-spawns.js';

const DT = 0.02;
const OPEN = { isSolid: () => false };

function fake(rows) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') tiles[y * w + x] = 1;
  const world = {
    w, h, tiles,
    tileAt: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]),
    isSolid: (x, y) => world.tileAt(Math.floor(x), Math.floor(y)) !== 0,
    breakTile(x, y) { x = Math.floor(x); y = Math.floor(y); if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1 || tiles[y * w + x] === 0) return false; tiles[y * w + x] = 0; return true; },
  };
  return world;
}

/** Terminal speed after holding right for 4 s in open water. */
function topSpeed(octo) {
  let top = 0;
  for (let i = 0; i < 200; i++) { stepOctopus(octo, { move: { x: 1, y: 0 }, dash: { pressed: false } }, DT, OPEN); top = Math.max(top, Math.hypot(octo.vx, octo.vy)); }
  return top;
}

export async function runItemTests(assert) {
  // ---- data ----
  const shopJson = await (await fetch('../data/shop-items.json')).json();
  const rows = parseShopItems(shopJson);
  const carry = rows.filter((r) => r.effect === 'carry');
  assert('items data: the seven carried items are shop rows (effect carry) priced 6-12 shells, bomb / heart / pack rows unchanged',
    carry.length === 7 && ITEM_IDS.every((id) => carry.some((r) => r.item === id)) && carry.every((r) => r.price >= 6 && r.price <= 12 && r.glyph && r.journal)
    && rows.find((r) => r.id === 'bomb').price === 3 && rows.find((r) => r.id === 'heart').price === 5 && rows.find((r) => r.id === 'bombpack').price === 8);
  let threw = false;
  try { parseShopItems({ items: [{ id: 'x', price: 5, effect: 'carry', item: 'banana' }] }); } catch (e) { threw = true; }
  assert('items data: a carry row naming an unknown item is rejected', threw);
  assert('items journal: one entry per item, in the Items category, with text', ITEM_IDS.every((id) => { const e = ENTRIES.find((x) => x.id === 'item-' + id); return e && e.cat === 'item' && e.text.length > 20 && e.name; }));
  assert('items: loot codes map to item ids', itemFromCode(0) === '' && itemFromCode(1) === 'flippers' && itemFromCode(5) === 'heartcontainer' && itemFromCode(6) === 'goggles' && itemFromCode(7) === 'siphon' && itemFromCode(8) === '');

  // ---- effects ----
  {
    const base = createOctopus(0, 0);
    assert('plain octopus: 3 hearts max, 5 bombs max, speed 1x, no magnet', base.heartMax === HEART_MAX && base.bombMax === BOMB_MAX && base.swimMul === 1 && base.magnetR === 0);
    const plain = topSpeed(createOctopus(0, 0));
    const fl = createOctopus(0, 0); const inv = [];
    giveItem(inv, fl, 'flippers');
    const fast = topSpeed(fl);
    assert(`flippers: +20% swim speed (${plain.toFixed(2)} -> ${fast.toFixed(2)} u/s, x${(fast / plain).toFixed(2)})`, FLIPPER_MUL === 1.2 && fast / plain > 1.17 && fast / plain < 1.23);
    assert('flippers: only one pair can be carried', !canCarry(inv, 'flippers') && giveItem(inv, fl, 'flippers') === false && inv.length === 1);

    const o = createOctopus(0, 0); const i2 = [];
    applyCarried(o, i2);
    const dark = o.lightR;
    giveItem(i2, o, 'lantern');
    assert(`lantern: a larger light radius (${dark} -> ${o.lightR} tiles)`, dark === LIGHT_BASE && o.lightR === LIGHT_LANTERN && o.lightR > dark * 1.6);

    const m = createOctopus(0, 0); const i3 = [];
    giveItem(i3, m, 'magnet');
    assert('magnet: pulls shells within 3 tiles', m.magnetR === MAGNET_R && MAGNET_R === 3);

    const b = createOctopus(0, 0); b.bombs = 2; const i4 = [];
    giveItem(i4, b, 'bombbag');
    assert('bomb bag: +3 bombs now and +1 max bombs', b.bombs === 5 && b.bombMax === BOMB_MAX + 1);
    giveItem(i4, b, 'bombbag');
    assert('bomb bag: two stack (max 7), a third is refused', b.bombMax === BOMB_MAX + 2 && b.bombs === 7 && giveItem(i4, b, 'bombbag') === false && itemCount(i4, 'bombbag') === 2);

    const h = createOctopus(0, 0); h.hearts = 1; const i5 = [];
    giveItem(i5, h, 'heartcontainer');
    assert('heart container: +1 max heart and heals 1', h.heartMax === HEART_MAX + 1 && h.hearts === 2);
    const hf = createOctopus(0, 0); const i6 = [];
    giveItem(i6, hf, 'heartcontainer');
    assert('heart container at full health: the new heart is filled', hf.hearts === HEART_MAX + 1);
  }

  // ---- persistence: across a level change, lost on death ----
  {
    const run = createRun(7, { tutorialDone: true });
    runEvent(run, EV_ENTER_DIVE);
    const o1 = createOctopus(0, 0);
    giveItem(run.items, o1, 'flippers'); giveItem(run.items, o1, 'heartcontainer'); giveItem(run.items, o1, 'lantern');
    runEvent(run, EV_EXIT);   // level 1 -> 2
    // main.js rebuilds the octopus for every level and re-derives the effects from run.items
    const o2 = createOctopus(0, 0); applyCarried(o2, run.items);
    assert('persistence: items survive a level change and the rebuilt octopus has the same effects',
      run.level === 2 && run.items.join() === 'flippers,heartcontainer,lantern' && o2.swimMul === FLIPPER_MUL && o2.heartMax === HEART_MAX + 1 && o2.lightR === LIGHT_LANTERN);
    runEvent(run, EV_EXIT); runEvent(run, EV_EXIT);
    assert('persistence: still carried through the end screen', run.items.length === 3);
    runEvent(run, EV_CONTINUE);
    assert('persistence: and back at the hub after finishing the biome', run.items.length === 3);
    // death
    const r2 = createRun(7, { tutorialDone: true });
    runEvent(r2, EV_ENTER_DIVE); r2.items.push('magnet', 'bombbag');
    runEvent(r2, EV_DEATH);
    const o3 = createOctopus(0, 0); applyCarried(o3, r2.items);
    assert('death: carried items are lost and the next octopus is plain', r2.items.length === 0 && o3.swimMul === 1 && o3.magnetR === 0 && o3.bombMax === BOMB_MAX);
    runEvent(r2, EV_ENTER_DIVE);
    assert('death: a fresh dive starts empty-handed', r2.items.length === 0);
    const r3 = createRun(9, { tutorialDone: true });
    runEvent(r3, EV_ENTER_DIVE); r3.items.push('lantern'); runEvent(r3, EV_EXIT);
    runEvent(r3, EV_DEATH);
    assert('death on level 2 also clears the items', r3.items.length === 0);
  }

  // ---- shop ----
  {
    const shop = { kx: 1, ky: 1, px: Int16Array.of(2, 5, 4, 5, 6, 5) };
    const buyOne = (id, shells, inv) => {
      const it = createShopState(shop, rows, 3, 0, inv);
      const slot = Array.from(it.stock).findIndex((i) => rows[i].id === id);
      // force the item onto slot 0 for the test
      it.stock[0] = rows.findIndex((r) => r.id === id);
      const o = createOctopus(it.px[0], it.px[1]); applyCarried(o, inv); o.bombs = 1; o.hearts = 1;
      return { ev: shopStep(it, o, shells, DT, inv), o, slot };
    };
    for (const id of ITEM_IDS) {
      const inv = [];
      const { ev, o } = buyOne(id, 20, inv);
      assert(`shop: ${id} is bought for its price and carried (${ev && ev.price} shells)`, ev && ev.type === 'bought' && ev.shells === 20 - ev.price && inv.length === 1 && inv[0] === id && canUse(rows.find((r) => r.id === id), o, []));
    }
    const poor = buyOne('lantern', 3, []);
    assert('shop: not enough shells buys nothing', poor.ev && poor.ev.type === 'poor');
    const owned = buyOne('flippers', 20, ['flippers']);
    assert('shop: a one-of item you already carry is refused and costs nothing', owned.ev && owned.ev.type === 'full');
    const st = createShopState(shop, rows, 3, 0, ['flippers', 'lantern', 'magnet']);
    assert('shop: items you already carry are not stocked again', Array.from(st.stock).every((i) => !(rows[i].effect === 'carry' && ['flippers', 'lantern', 'magnet'].includes(rows[i].item))));
    let carried = 0, N = 40;
    for (let s = 0; s < N; s++) { const sh = createShopState(shop, rows, s, s % 3, []); if (Array.from(sh.stock).some((i) => rows[i].effect === 'carry')) carried++; }
    assert(`shop: most stalls (${carried}/${N}) offer at least one carried item`, carried >= N * 0.7);
  }

  // ---- loot: chests and pockets hold items ----
  {
    let chestItems = 0, pocketItems = 0, nC = 600;
    const r = mulberry32(21);
    for (let i = 0; i < nC; i++) {
      const c = makeLootRecord('chest', 3.5, 3.5, 0, -1, r), p = makeLootRecord('pocket', 3.5, 3.5, -1, 0, r);
      if (c.item) chestItems++;
      if (p.aux === POCKET_ITEM) { pocketItems++; if (!p.item || p.n !== 0) pocketItems -= 1000; }
    }
    assert(`loot: about 30% of chests (${chestItems}/${nC}) and 25% of pockets (${pocketItems}/${nC}) hold a carried item`, chestItems > nC * 0.22 && chestItems < nC * 0.38 && pocketItems > nC * 0.17 && pocketItems < nC * 0.33);

    const world = fake(['####################', '#..................#', '#..................#', '#..................#', '#..................#', '####################']);
    const loot = createLoot();
    const rec = makeLootRecord('chest', 6.5, 3.5, 0, -1, mulberry32(1)); rec.aux = 0; rec.item = 3;
    loot.add(rec);
    const octo = createOctopus(6.5, 3.5);
    loot.update(DT, octo, world, null);
    const ch = loot.takeEvents().find((e) => e.type === 'chest');
    assert('loot: opening a chest with a carried item reports it', ch && ch.carry === 'magnet');
    const l2 = createLoot();
    const pr = makeLootRecord('pocket', 5.5, 2.5, -1, 0, mulberry32(2)); pr.aux = POCKET_ITEM; pr.item = 2; pr.n = 0;
    l2.add(pr);
    const w2 = fake(['####################', '#..####............#', '#..####............#', '#..####............#', '####################']);
    const o2 = createOctopus(2.5, 2.5);
    l2.update(DT, o2, w2, null);
    w2.tiles[2 * w2.w + 5] = 0;     // a bomb breaks the tile
    l2.update(DT, o2, w2, null);
    const rev = l2.takeEvents().find((e) => e.type === 'pocket');
    o2.x = 5.5; o2.y = 2.5;
    l2.update(DT, o2, w2, null);
    const it = l2.takeEvents().find((e) => e.type === 'item');
    assert('loot: a bombed pocket reveals the carried item and touching it reports which', rev && rev.item === POCKET_ITEM && it && it.carry === 'lantern');
    // drawn (smoke): the pocket item icon and the icons themselves
    let calls = 0;
    const ctxp = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => { calls++; }), set: () => true });
    drawLoot(ctxp, { x: 5.5, y: 2.5, pxPerUnit: 60 }, 600, 400, l2.data, 0);
    for (const id of ITEM_IDS) drawItemIcon(ctxp, id, 10, 10, 12);
    assert('draw: the pocket item and all five icons draw without errors', calls >= 6); // r46: a sprite icon is one drawImage

    // real levels: chests / pockets with items turn up
    let withItem = 0, total = 0;
    for (let seed = 1; seed <= 40; seed++) for (let lv = 0; lv < 3; lv++) {
      const w = createLevelWorld(seed * 13, lv);
      for (const s of w.residentChunks()[0].chunk.spawns) if (s.type === 'loot') { if (s.lk === 3 || s.lk === 4) { total++; if (s.item) withItem++; } }
    }
    assert(`placement: carried items turn up in real levels (${withItem} of ${total} chests and pockets)`, withItem > 5 && withItem < total);
  }

  // ---- fix: shells pop and wait before they can be collected ----
  {
    const sp = spreadShells(3, 5, 5);
    assert('shells: each dropped shell gets a pop velocity, upward and spread sideways', sp.length === 3 && sp.every((p) => p.vy < -1.5) && new Set(sp.map((p) => Math.sign(p.vx))).size >= 2);
    const inRock = spreadShells(3, 5.5, 5.5, (x, y) => x < 5.5 + 0.25 && x > 5.5 - 0.25 ? false : true);
    assert('shells: spots in rock fall back to the break point', inRock.every((p) => Math.abs(p.x - 5.5) < 1e-6));

    const chunk = { width: 20, height: 20, tiles: new Uint8Array(400), spawns: [], salt: 5 };
    const resident = [{ index: 0, yOffset: 0, chunk }];
    const world = { isSolid: () => false };
    const pk = createPickups();
    const octo = createOctopus(10, 10);
    pk.update(DT, 0, octo, resident, world);
    pk.dropShell(10, 10, 1.5, -2.3);   // right on the octopus
    for (let i = 0; i < 10; i++) pk.update(DT, i * DT, octo, resident, world);
    assert('shells: a shell dropped on the octopus is not collected for ~0.35 s (still visible)', pk.totals.shells === 0 && pk.visible(resident).filter((s) => s.type === 'shell').length === 1 && SHELL_PICKUP_DELAY === 0.35);
    const s0 = pk.visible(resident)[0];
    assert('shells: it moves away from the break point while it waits (popped)', Math.hypot(s0.x - 10, s0.y - 10) > 0.15);
    // octopus swims off: nothing is collected the moment the delay ends if it is away
    const away = createOctopus(14, 10);
    for (let i = 0; i < 30; i++) pk.update(DT, i * DT, away, resident, world);
    assert('shells: once the delay is over, swimming back through it collects it', pk.totals.shells === 0);
    away.x = s0.x; away.y = s0.y;
    pk.update(DT, 1, away, resident, world);
    assert('shells: ...and then it counts', pk.totals.shells === 1);
    // a pop never ends inside rock
    const wall = { isSolid: (x) => x > 10.3 };
    const p2 = createPickups(); p2.update(DT, 0, octo, resident, wall);
    p2.dropShell(10, 10, 4, 0);
    for (let i = 0; i < 40; i++) p2.update(DT, i * DT, createOctopus(0, 0), resident, wall);
    assert('shells: a popping shell stops at rock', p2.visible(resident)[0].x <= 10.3);
  }

  // ---- magnet pulls shells ----
  {
    const chunk = { width: 30, height: 20, tiles: new Uint8Array(600), spawns: [], salt: 5 };
    const resident = [{ index: 0, yOffset: 0, chunk }];
    const world = { isSolid: () => false };
    for (const [mag, label] of [[0, 'without'], [3, 'with']]) {
      const pk = createPickups();
      const octo = createOctopus(10, 10); octo.magnetR = mag;
      pk.update(DT, 0, octo, resident, world);
      pk.dropShell(12.7, 10); pk.dropShell(16, 10);
      for (let i = 0; i < 60; i++) pk.update(DT, i * DT, octo, resident, world);
      const near = pk.visible(resident);
      if (mag === 0) assert('magnet: without it a shell 2.7 tiles away stays put', pk.totals.shells === 0 && near.length === 2);
      else assert('magnet: with it the shell within 3 tiles is pulled in and collected, the one 6 tiles away stays', pk.totals.shells === 1 && near.length === 1 && Math.abs(near[0].x - 16) < 1e-6);
    }
  }

  // ---- fix: the swarm spawns in clear water, not in the dip's rock ----
  {
    // a chest in a one-tile dip in the floor; open water above, rock on both sides of the dip
    const rows = [];
    for (let y = 0; y < 14; y++) rows.push(y < 9 ? '#' + '.'.repeat(30) + '#' : '#'.repeat(32));
    rows[9] = '#'.repeat(14) + '..' + '#'.repeat(16);   // the dip (2 wide) at x 14-15, y 9
    rows[10] = '#'.repeat(32);
    const w = fake(rows);
    const spots = findSwarmSpots(w.isSolid, 14.5, 9.5, 3);
    let bad = 0;
    for (const p of spots) for (let dx = -1.2; dx <= 1.2; dx += 0.4) if (w.isSolid(p.x + dx, p.y) || w.isSolid(p.x + dx, p.y - 0.4) || w.isSolid(p.x + dx, p.y + 0.4)) bad++;
    let overlap = 0;
    for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) if (Math.abs(spots[a].y - spots[b].y) < 0.9 && Math.abs(spots[a].x - spots[b].x) < 1.4) overlap++;
    assert(`swarm: 3 spots with the whole sprite length in open water, stacked apart (${spots.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')})`, spots.length === 3 && bad === 0 && overlap === 0 && spots.every((p) => p.y < 9.5 - 1.2));
    // a narrow shaft: relaxes, still returns n spots and none in rock for the 0.4 half length
    const nr = [];
    for (let y = 0; y < 14; y++) nr.push('#'.repeat(14) + '..' + '#'.repeat(16));
    const wn = fake(nr);
    const sn = findSwarmSpots(wn.isSolid, 14.5, 12.5, 3);
    assert('swarm: in a narrow shaft it still returns 3 spots, in water', sn.length === 3 && sn.every((p) => !wn.isSolid(p.x, p.y)));
  }

  // ---- fix: the clam's ribs stay inside the shell ----
  {
    const ppu = 80, cx = 300, cy = 200;
    const loot = createLoot();
    loot.add(makeLootRecord('clam', 3.75, 2.5, 0, -1, mulberry32(3)));
    const calls = [];
    let clipped = false;
    const ctxp = new Proxy({}, {
      get: (t, k) => {
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
        return (...a) => { calls.push([k, a, clipped]); if (k === 'clip') clipped = true; if (k === 'restore') clipped = false; };
      },
      set: () => true,
    });
    drawLoot(ctxp, { x: 3.75, y: 2.5, pxPerUnit: ppu }, 2 * cx, 2 * cy, loot.data, 0);
    // x of the clam centre on screen = cx; the shell half width is 0.5 ppu
    const clipIdx = calls.findIndex((c) => c[0] === 'clip');
    const ribCalls = calls.filter((c) => c[2] && (c[0] === 'moveTo' || c[0] === 'quadraticCurveTo'));
    const xs = ribCalls.map((c) => (c[0] === 'moveTo' ? c[1][0] : c[1][2]));   // drawClam translates to the clam, so these are local
    const maxX = Math.max(...xs.map(Math.abs));
    const sprite = calls.some((c) => c[0] === 'drawImage'); // r46: the scallop sprite; the ribs are only the code fallback's
    assert(`clam: drawn as the scallop sprite, or its fallback's ribs are under a clip to the shell and stay within 0.8 of its half width (max ${(maxX / (0.5 * ppu)).toFixed(2)})`, sprite || (clipIdx > 0 && xs.length >= 10 && maxX <= 0.8 * 0.5 * ppu + 0.01));
  }
}
