// Buried treasure (js/embed.js, js/embed-draw.js) and the Sea-glass Goggles (items.js 'goggles'): placement on real
// levels (deterministic per seed, never in the border, the shop, a vault's walls or a hidden pocket), release when the
// rock breaks (a physics prop that sinks and settles), taking it, what is drawn with and without the goggles, and the
// goggles as a carried item (persist between levels, lost on death, shop rarity, journal).
import {
  createEmbedded, planEmbedded, embedVisibility, embedCount, rollItemCode, shellValue,
  EK_SHELL, EK_BOMB, EK_ITEM, ES_BURIED, ES_LOOSE, ES_TAKEN, VIS_NONE, VIS_SHOWN, VIS_FULL, EMBED_SHELLS, EMBED_MIN, EMBED_MAX,
} from '../js/embed.js';
import { drawEmbedded, drawPocketReveal, drawTreasureTile } from '../js/embed-draw.js';
import { ITEM_IDS, ITEM_DEFS, applyCarried, giveItem, itemFromCode } from '../js/items.js';
import { createOctopus } from '../js/octopus.js';
import { createProps, PK_FIND, PS_REST } from '../js/props.js';
import { createBombs } from '../js/bomb.js';
import { createLoot, LK_POCKET } from '../js/loot.js';
import { createRun, runEvent, EV_ENTER_DIVE, EV_EXIT, EV_DEATH } from '../js/run.js';
import { parseShopItems, createShopState } from '../js/shop.js';
import { createLevelWorld } from '../js/world-v2.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { generateLevel, setDefaultBank, LEVEL_W, LEVEL_H, BORDER } from '../js/level.js';
import { createRoomBank } from '../js/rooms.js';
import { ENTRIES, CAT_ITEM, CAT_LOOT } from '../js/journal.js';
import { cullReset } from '../js/cull.js';
import { loadBiome1Json } from './biome1.test.js';

const DT = 0.02;
const embedsOf = (spawns) => spawns.filter((s) => s.type === 'embed');

export async function runEmbedTests(assert) {
  setDefaultBank(createRoomBank(await loadBiome1Json()));

  // ---- placement on real levels ----
  {
    const NS = 24;
    let bad = '', levels = 0, total = 0, sameOk = true, differ = 0;
    const perLvl = [0, 0, 0];
    let shells = 0, items = 0, bombs = 0, gogglesN = 0, rare = 0;
    for (let s = 0; s < NS; s++) {
      const seed = 101 + s * 7919;
      let prev = null;
      for (let lv = 0; lv < 3; lv++) {
        const level = generateLevel(seed, lv);
        const a = embedsOf(buildLevelSpawns(level, seed, lv).spawns);
        const b = embedsOf(buildLevelSpawns(generateLevel(seed, lv), seed, lv).spawns);
        if (JSON.stringify(a) !== JSON.stringify(b)) sameOk = false;
        if (prev && JSON.stringify(prev) !== JSON.stringify(a)) differ++;
        prev = a;
        levels++; total += a.length; perLvl[lv] += a.length;
        if (a.length < EMBED_MIN - 2 || a.length > EMBED_MAX) bad += ` count ${seed}/${lv}:${a.length}`;
        const t = level.tiles, W = LEVEL_W, H = LEVEL_H;
        const spawns = buildLevelSpawns(level, seed, lv).spawns;
        const pockets = spawns.filter((r) => r.type === 'loot' && r.lk === LK_POCKET);
        for (const e of a) {
          const x = Math.floor(e.x), y = Math.floor(e.y);
          if (x < BORDER || y < BORDER || x >= W - BORDER || y >= H - BORDER) bad += ` border ${seed}/${lv}@${x},${y}`;
          if (t[y * W + x] === 0) bad += ` water ${seed}/${lv}@${x},${y}`;
          const sh = level.shop;
          if (sh && x >= sh.x0 - 5 && x <= sh.x1 + 4 && y >= sh.y0 - 5 && y <= sh.y1 + 4) bad += ` shop ${seed}/${lv}`;
          for (let i = 0; i < (level.nPockets || 0); i++) {
            const px = level.pockets[i * 3], py = level.pockets[i * 3 + 1];
            if (x >= px - 2 && x <= px + 3 && y >= py - 2 && y <= py + 3) bad += ` vault ${seed}/${lv}`;
          }
          if (pockets.some((p) => Math.floor(p.x) === x && Math.floor(p.y) === y)) bad += ` pocket ${seed}/${lv}`;
          if (e.ek === EK_SHELL) { shells++; if (!EMBED_SHELLS[e.sub].shown) rare++; }
          else if (e.ek === EK_ITEM) { items++; if (itemFromCode(e.sub) === 'goggles') gogglesN++; if (!itemFromCode(e.sub)) bad += ' itemcode'; }
          else if (e.ek === EK_BOMB) { bombs++; if (e.sub < 1 || e.sub > 2) bad += ' bombs'; }
          else bad += ' kind';
        }
        if (a.filter((e) => e.ek === EK_ITEM).length > (lv >= 2 ? 2 : 1) || a.filter((e) => e.ek === EK_BOMB).length > 2) bad += ` caps ${seed}/${lv}`;
        // finds keep EMBED_GAP apart
        for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
          if (Math.max(Math.abs(a[i].x - a[j].x), Math.abs(a[i].y - a[j].y)) < 3) bad += ` gap ${seed}/${lv}`;
        }
      }
    }
    assert(`embed: placement is the same for the same seed and level (${levels} levels), and differs between levels`, sameOk && differ > NS);
    assert('embed: every find is in interior rock, never in the border, the shop, a quest vault\'s walls or a hidden pocket, 3 tiles apart' + bad.slice(0, 300), bad === '');
    const avg = perLvl.map((n) => n / NS);
    assert(`embed: about 6-12 finds per level, more deeper down (avg ${avg.map((v) => v.toFixed(1)).join(' / ')})`, avg[0] >= 5.5 && avg[2] <= 12 && avg[2] > avg[0]);
    assert(`embed: mostly shells, some rare tiers, a few bombs and items, the goggles among them (shells ${shells}, rare ${rare}, bombs ${bombs}, items ${items}, goggles ${gogglesN})`,
      shells > total * 0.7 && rare > 0 && bombs > 0 && items > 0 && gogglesN > 0);
    assert('embed: the count grows with the level and stays inside 6..12', embedCount(0, 0) === 6 && embedCount(0, 0.99) === 8 && embedCount(2, 0.99) === 10 && embedCount(9, 0.99) === 12);
    let codes = new Set();
    for (let i = 0; i < 200; i++) codes.add(itemFromCode(rollItemCode(i / 200)));
    assert('embed: an embedded item can be any carried item', ITEM_IDS.every((id) => codes.has(id)));
    assert('embed: shell tiers have rising values (cowrie < conch < nautilus < pearl)', shellValue(1) < shellValue(2) && shellValue(2) < shellValue(3) && shellValue(3) < shellValue(4) && shellValue(9) === 1);
  }

  // ---- plan on a hand-made map: reach and blocking ----
  {
    const W = 12, H = 12, t = new Uint8Array(W * H).fill(1), reached = new Uint8Array(W * H);
    for (let y = 2; y < 10; y++) for (let x = 5; x < 7; x++) { t[y * W + x] = 0; reached[y * W + x] = 1; } // a 2-wide shaft
    const out = planEmbedded(t, W, H, 2, reached, (x) => x === 4, 5, 0);
    assert('embed plan: only rock within 3 tiles of reachable water, never a blocked tile or the border',
      out.length > 0 && out.every((e) => { const x = Math.floor(e.x), y = Math.floor(e.y); return t[y * W + x] === 1 && x !== 4 && x >= 2 && x < 10 && y >= 2 && y < 10 && (x >= 2 && x <= 9); }));
    const none = planEmbedded(t, W, H, 2, new Uint8Array(W * H), () => false, 5, 0);
    assert('embed plan: nothing when no water is reachable', none.length === 0);
  }

  // ---- release on breaking, sink and settle, take ----
  {
    const seed = 4242, lv = 1;
    const world = createLevelWorld(seed, lv);
    const props = createProps();
    const emb = createEmbedded(props);
    const octo = createOctopus(world.startX, world.startY);
    const res = world.residentChunks();
    emb.update(DT, octo, world, res);
    const d = emb.data;
    const want = embedsOf(world.residentChunks()[0].chunk.spawns).length;
    assert(`embed live: the level's finds load once, all buried (${d.n})`, d.n === want && d.n > 0 && emb.buried() === d.n);
    emb.update(DT, octo, world, res);
    assert('embed live: loading twice does not double them', d.n === want);
    // pick a find with open water below it is not needed: break its tile and the find falls out
    const i = 0, tx = d.tx[i], ty = d.ty[i], y0 = d.y[i];
    assert('embed live: nothing is released while the rock stands', d.state[i] === ES_BURIED && emb.takeEvents().length === 0);
    world.breakTile(tx, ty);
    emb.update(DT, octo, world, res);
    const ev = emb.takeEvents();
    assert('embed live: breaking the tile releases the find as a physics prop (PK_FIND)', d.state[i] === ES_LOOSE && d.pid[i] >= 0 && props.data.kind[d.pid[i]] === PK_FIND && ev.some((e) => e.type === 'released' && e.i === i));
    octo.x = -50; octo.y = -50; // out of the way while it falls
    let maxY = d.y[i];
    for (let k = 0; k < 250; k++) { props.step(DT, world, octo, []); emb.update(DT, octo, world, res); maxY = Math.max(maxY, d.y[i]); }
    const pid = d.pid[i];
    assert(`embed live: the find sinks and settles (y ${y0.toFixed(2)} -> ${d.y[i].toFixed(2)}, ${props.data.state[pid] === PS_REST ? 'asleep' : 'awake'})`,
      maxY > y0 + 0.2 && props.data.state[pid] === PS_REST && !world.isSolid(d.x[i], d.y[i]));
    octo.x = d.x[i]; octo.y = d.y[i];
    emb.update(DT, octo, world, res);
    const tk = emb.takeEvents().find((e) => e.type === 'take');
    assert('embed live: swimming into it takes it (event with its kind) and removes the prop', d.state[i] === ES_TAKEN && tk && tk.ek === d.ek[i] && tk.sub === d.sub[i] && !props.data.alive[pid]);
    // a bomb releases too (bomb.js breaks the rock; embed.js only watches the tile)
    const j = 1, bx = d.tx[j] + 0.5, by = d.ty[j] + 0.5;
    const bombsys = createBombs(props), far = createOctopus(-40, -40);
    far.bombs = 3;
    bombsys.place(far, bx, by, null, { pinned: true });
    const noEnemies = { killInRadius() { return 0; }, knockInRadius() {} };
    for (let k = 0; k < 200 && d.state[j] === ES_BURIED; k++) { bombsys.update(DT, world, far, noEnemies); props.step(DT, world, far, []); emb.update(DT, far, world, res); }
    assert('embed live: a bomb next to a find releases it', d.state[j] === ES_LOOSE);
    // without props (endless / tests) a released find stays where it was
    const e2 = createEmbedded(null);
    e2.add({ x: 3.5, y: 3.5, ek: EK_BOMB, sub: 2 });
    const tiny = { tileAt: () => 0 };
    const o2 = createOctopus(10, 10);
    e2.update(DT, o2, tiny, null);
    assert('embed live: with no physics a released find stays in place', e2.data.state[0] === ES_LOOSE && e2.data.x[0] === 3.5);
    for (let k = 0; k < 30; k++) e2.update(DT, o2, tiny, null);
    o2.x = 3.5; o2.y = 3.5;
    e2.update(DT, o2, tiny, null);
    assert('embed live: a loose find cannot be taken during its short delay, then can', e2.takeEvents().some((e) => e.type === 'take' && e.ek === EK_BOMB && e.sub === 2));
  }

  // ---- visibility: basic shells always, the rest only with the goggles ----
  {
    assert('embed vis: basic shells (cowrie, conch) always show; nautilus, pearl, bombs and items only with the goggles',
      embedVisibility(EK_SHELL, 1, false) === VIS_SHOWN && embedVisibility(EK_SHELL, 2, false) === VIS_SHOWN && embedVisibility(EK_SHELL, 1, true) === VIS_SHOWN
      && embedVisibility(EK_SHELL, 3, false) === VIS_NONE && embedVisibility(EK_SHELL, 4, false) === VIS_NONE
      && embedVisibility(EK_BOMB, 1, false) === VIS_NONE && embedVisibility(EK_ITEM, 6, false) === VIS_NONE
      && [[EK_SHELL, 3], [EK_SHELL, 4], [EK_BOMB, 1], [EK_ITEM, 6]].every(([k, s]) => embedVisibility(k, s, true) === VIS_FULL));
    cullReset();
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300;
    const ctx = cv.getContext('2d');
    const cam = { x: 5, y: 5, pxPerUnit: 30 };
    const emb = createEmbedded(null);
    emb.add({ x: 2.5, y: 2.5, ek: EK_SHELL, sub: 1 });
    emb.add({ x: 5.5, y: 2.5, ek: EK_SHELL, sub: 2 });
    emb.add({ x: 8.5, y: 2.5, ek: EK_SHELL, sub: 4 });
    emb.add({ x: 2.5, y: 7.5, ek: EK_ITEM, sub: ITEM_IDS.indexOf('goggles') + 1 });
    emb.add({ x: 5.5, y: 7.5, ek: EK_BOMB, sub: 1 });
    const rock = () => 1;
    const off = drawEmbedded(ctx, cam, 400, 300, emb.data, { goggles: false, tileAt: rock });
    const on = drawEmbedded(ctx, cam, 400, 300, emb.data, { goggles: true, tileAt: rock });
    assert(`embed draw: without goggles only the 2 basic shells show (${off.shown} shown, ${off.full} silhouettes)`, off.shown === 2 && off.full === 0 && off.loose === 0);
    assert(`embed draw: with goggles the other 3 show as silhouettes too (${on.shown} + ${on.full})`, on.shown === 2 && on.full === 3);
    // nothing at all is drawn for a hidden find without the goggles
    ctx.clearRect(0, 0, 400, 300);
    const hid = createEmbedded(null); hid.add({ x: 5.5, y: 5.5, ek: EK_SHELL, sub: 4 }); hid.add({ x: 3.5, y: 5.5, ek: EK_ITEM, sub: 1 });
    drawEmbedded(ctx, cam, 400, 300, hid.data, { goggles: false, tileAt: rock });
    let lit = 0;
    const px = ctx.getImageData(0, 0, 400, 300).data;
    for (let k = 3; k < px.length; k += 4) if (px[k] > 0) lit++;
    drawEmbedded(ctx, cam, 400, 300, hid.data, { goggles: true, tileAt: rock });
    let lit2 = 0;
    const px2 = ctx.getImageData(0, 0, 400, 300).data;
    for (let k = 3; k < px2.length; k += 4) if (px2[k] > 0) lit2++;
    assert(`embed draw: a pearl and an item leave no pixel without the goggles (${lit}), and show with them (${lit2})`, lit === 0 && lit2 > 100);
    // the per-tile hook (terrain materials pass) draws the same thing for one tile
    assert('embed draw: per-tile hook drawTreasureTile draws the find of that tile only',
      drawTreasureTile(ctx, emb.data, 2, 2, 0, 0, 30, false) === VIS_SHOWN && drawTreasureTile(ctx, emb.data, 8, 2, 0, 0, 30, false) === VIS_NONE
      && drawTreasureTile(ctx, emb.data, 8, 2, 0, 0, 30, true) === VIS_FULL && drawTreasureTile(ctx, emb.data, 0, 0, 0, 0, 30, true) === VIS_NONE);
    const skip = drawEmbedded(ctx, cam, 400, 300, emb.data, { goggles: true, tileAt: rock, buried: false });
    const main = drawEmbedded(ctx, cam, 400, 300, emb.data, { goggles: true, tileAt: rock, isMainRock: (x, y) => y === 2 });
    assert('embed draw: buried:false leaves buried finds to the per-tile pass; isMainRock limits them to main rock', skip.shown + skip.full === 0 && main.shown === 2 && main.full === 1);
    emb.data.state[0] = ES_LOOSE;
    const loose = drawEmbedded(ctx, cam, 400, 300, emb.data, { goggles: false, tileAt: rock });
    assert('embed draw: a loose find is drawn as itself', loose.loose === 1 && loose.shown === 1 && drawTreasureTile(ctx, emb.data, 2, 2, 0, 0, 30, true) === VIS_NONE);
    emb.data.state[0] = ES_TAKEN;
    const gone = drawEmbedded(ctx, cam, 400, 300, emb.data, { goggles: true, tileAt: rock });
    assert('embed draw: a taken find is not drawn', gone.full === 3 && gone.shown === 1 && gone.loose === 0);
    // hidden pockets and vaults
    const loot = createLoot(null);
    loot.add({ lk: LK_POCKET, x: 3.5, y: 4.5, dx: 1, dy: 0, n: 2, aux: 0, item: 0 });
    loot.add({ lk: LK_POCKET, x: 6.5, y: 4.5, dx: 1, dy: 0, n: 0, aux: 3, item: 2 });
    const vaults = Int16Array.of(4, 1, 3);
    const rv = drawPocketReveal(ctx, cam, 400, 300, loot.data, vaults, 1, rock);
    assert(`embed draw: the goggles also reveal hidden pockets' contents and sealed vault hollows (${rv.pockets} pockets, ${rv.vaults} vaults)`, rv.pockets === 2 && rv.vaults === 1);
    const opened = drawPocketReveal(ctx, cam, 400, 300, loot.data, vaults, 1, (x, y) => (x === 3 && y === 1 ? 0 : 1));
    assert('embed draw: an opened vault is not outlined', opened.vaults === 0);
    cullReset();
  }

  // ---- the goggles as a carried item ----
  {
    assert('goggles: a carried item (one of), with a name and blurb', ITEM_IDS.includes('goggles') && ITEM_DEFS.goggles.max === 1 && ITEM_DEFS.goggles.name);
    const run = createRun(7, { tutorialDone: true });
    runEvent(run, EV_ENTER_DIVE);
    const o1 = createOctopus(0, 0);
    assert('goggles: a plain octopus does not see buried things', o1.seeBuried === false);
    assert('goggles: picking them up turns on seeBuried, a second pair is refused', giveItem(run.items, o1, 'goggles') && o1.seeBuried === true && !giveItem(run.items, o1, 'goggles'));
    runEvent(run, EV_EXIT);
    const o2 = createOctopus(0, 0); applyCarried(o2, run.items);
    assert('goggles: kept between levels (the rebuilt octopus still sees)', run.level === 2 && o2.seeBuried === true);
    runEvent(run, EV_DEATH);
    const o3 = createOctopus(0, 0); applyCarried(o3, run.items);
    assert('goggles: lost on death', run.items.length === 0 && o3.seeBuried === false);
    const rows = parseShopItems(await (await fetch('../data/shop-items.json')).json());
    const g = rows.find((r) => r.item === 'goggles');
    let offered = 0;
    const shop = { kx: 1, ky: 1, px: new Int16Array(6) };
    for (let s = 0; s < 200; s++) { const st = createShopState(shop, rows, s * 31 + 5, s % 3); if (Array.from(st.stock).some((k) => rows[k].item === 'goggles')) offered++; }
    assert(`goggles: sold in the shop, but rarely (${offered} of 200 stalls)`, g && g.effect === 'carry' && g.rare > 0 && offered > 4 && offered < 40);
    const e1 = ENTRIES.find((e) => e.id === 'item-goggles'), e2 = ENTRIES.find((e) => e.id === 'loot-buried');
    assert('goggles: journal entries for the goggles (Items) and buried treasure (Loot)', e1 && e1.cat === CAT_ITEM && e1.text.length > 40 && e1.art.item === 'goggles' && e2 && e2.cat === CAT_LOOT && e2.text.length > 40 && e2.art.fn === 'buried');
  }
}
