// The offering altar (js/altar.js): favour per body, the three hollows and their gifts, anger (a person, a bomb), the
// per-step offering check against real corpses / enemies / keepers, the floor finder (scenery only: tiles untouched) and the
// seeded level choice.
import {
  createAltar, offer, offerValue, tierOf, TIERS, stepAltar, altarBlast, inZone, findAltarSpot, altarLevel, altarItem,
  isPersonKind, ALTAR_ITEMS, OFFER_DWELL, registerKeeperGrab,
} from '../js/altar.js';
import { createCorpses, kindName, CS_CARRY } from '../js/corpses.js';
import { createKeepers, addKeeper, KM_ANGRY, KM_DEAD } from '../js/shopkeeper.js';
import { findTarget, clearInteracts, handUse, createHand } from '../js/hand.js';
import { ENTRIES } from '../js/journal.js';

const DT = 0.02;
const FLOOR = [{ x1: -50, y1: 10, x2: 100, y2: 10 }];
const world = { isSolid: (x, y) => y > 10, tileAt: (x, y) => (y >= 10 ? 1 : 0), wallSegmentsNear: () => FLOOR };

export async function runAltarTests(assert) {
  // ---- values and tiers ----
  assert('altar: a piranha is worth 1, a giant clam 3, a live stunned crab one more, a little ambient fish nothing',
    offerValue('piranha') === 1 && offerValue('gclam') === 3 && offerValue('crab', true) === 2 && offerValue('ambient-fish') === 0);
  assert('altar: people are persons (npc-*, keeper), creatures are not', isPersonKind('npc-pip') && isPersonKind('keeper') && !isPersonKind('piranha'));
  assert('altar: three hollows at rising favour', TIERS.length === 3 && TIERS[0].at < TIERS[1].at && TIERS[1].at < TIERS[2].at && tierOf(0) === 0 && tierOf(TIERS[2].at) === 3);
  {
    const a = createAltar(5, 10);
    const gifts = [];
    for (let i = 0; i < 12; i++) for (const ev of offer(a, 'piranha')) if (ev.type === 'gift') gifts.push(ev.gift);
    assert('altar: twelve piranhas light all three hollows once each: heart, juice, item (' + gifts.join(',') + ')',
      gifts.join(',') === 'heart,juice,item' && a.tier === 3 && a.offerings === 12 && !a.angry);
  }
  {
    const a = createAltar(5, 10);
    const evs = offer(a, 'gclam').concat(offer(a, 'tentacle'));
    assert('altar: a big offering can light two hollows at once', evs.filter((e) => e.type === 'gift').length === 2 && a.tier === 2);
  }
  // ---- anger ----
  {
    const a = createAltar(5, 10);
    offer(a, 'piranha');
    const evs = offer(a, 'npc-quill');
    const after = offer(a, 'gclam');
    assert('altar: a person\'s body angers it, and an angry altar takes nothing more', a.angry && a.why === 'person' && evs.some((e) => e.type === 'anger') && after.length === 0 && a.tier === 0);
  }
  {
    const a = createAltar(5, 10);
    const far = altarBlast(a, 15, 9, 2.5);
    const near = altarBlast(a, 6.8, 8.5, 2.5);
    assert('altar: a blast by the stone angers it (one far away does not)', !far && near && a.angry && a.why === 'bomb');
  }
  // ---- the zone ----
  {
    const a = createAltar(5, 10);
    assert('altar: the zone is the slab and a little water above it', inZone(a, 5, 9.5) && inZone(a, 6.2, 8) && !inZone(a, 7.5, 9.5) && !inZone(a, 5, 6) && !inZone(a, 5, 10.6));
  }
  // ---- stepping with real corpses ----
  {
    const a = createAltar(5, 10), c = createCorpses();
    const i = c.add('piranha', 5, 7, 0, 0, 1);
    const j = c.add('crab', 20, 7, 0, 0, 1); // elsewhere: stays
    const k = c.add('manta', 5.4, 9, 0, 0, 1); c.carry(k); // in the tentacles: not taken
    let n = 0;
    for (let s = 0; s < 150; s++) { c.update(DT, world, null); stepAltar(a, DT, { corpses: c, kindName }); n++; }
    assert('altar: a body that sinks onto the stone is taken (favour 1), one elsewhere and one still held are not',
      !c.data.alive[i] && c.data.alive[j] && c.data.alive[k] && c.data.state[k] === CS_CARRY && a.favour === 1 && a.offerings === 1);
    c.release(k, 0, 0);
    for (let s = 0; s < 10; s++) { c.update(DT, world, null); stepAltar(a, DT, { corpses: c, kindName }); }
    assert('altar: let go over it, the held manta is taken too (+2: the first hollow lights)', !c.data.alive[k] && a.favour === 3 && a.tier === 1);
    for (let s = 0; s < 100; s++) stepAltar(a, DT, {});
    assert('altar: the lit hollow glows, the others stay dark', a.glow[0] > 0.8 && a.glow[1] < 0.05 && a.glow[2] < 0.05);
  }
  {
    const a = createAltar(5, 10), c = createCorpses();
    c.add('piranha', 5, 9.5, 12, 0, 1); // thrown fast straight across: a single step in the zone is not an offering
    stepAltar(a, DT, { corpses: c, kindName });
    assert('altar: a body must stay a moment (OFFER_DWELL) before it is taken', a.offerings === 0 && OFFER_DWELL > DT);
  }
  // ---- live offerings ----
  {
    const a = createAltar(5, 10);
    const crab = { id: 1, kind: 'crab', x: 5, y: 9.4, stun: 1, dead: false };
    const awake = { id: 2, kind: 'piranha', x: 5.3, y: 9, stun: 0, dead: false };
    const held = { id: 3, kind: 'manta', x: 4.7, y: 9, stun: 1, dead: false, carried: true };
    for (let s = 0; s < 12; s++) stepAltar(a, DT, { enemies: [crab, awake, held] });
    assert('altar: a stunned creature on it is taken alive (no corpse, +1 bonus); an awake one and one still carried are not',
      crab.dead && !awake.dead && !held.dead && a.favour === 2 && a.tier === 1);
  }
  {
    const a = createAltar(5, 10), k = createKeepers();
    const i = addKeeper(k, 5, 9.3, KM_ANGRY, 1);
    k.stun[i] = 2;
    stepAltar(a, DT, { keepers: k, keeperDead: KM_DEAD });
    assert('altar: a stunned shopkeeper laid on it alive is taken, and it is angry', k.mode[i] === KM_DEAD && a.angry && a.why === 'person');
  }
  // ---- the hand can lift a stunned keeper ----
  {
    clearInteracts();
    const k = createKeepers();
    const i = addKeeper(k, 3, 3, KM_ANGRY, 1);
    registerKeeperGrab({ keepers: () => k, keeperDead: KM_DEAD });
    const octo = { x: 3.6, y: 3, vx: 0, vy: 0, radius: 0.45, angle: 0, throwDir: 1 };
    const none = findTarget(octo, {});
    k.stun[i] = 1.5;
    const t = findTarget(octo, {});
    const hand = createHand();
    const got = t && handUse(hand, octo, {});
    assert('altar: a shopkeeper can only be grabbed while stunned, and is heavy to carry',
      !none && t && t.kind === 'keeper' && got && hand.held && hand.held.weight < 0.6 && k.carried === i);
    clearInteracts();
  }
  // ---- the floor finder (scenery: no tile changes, reachable floor) ----
  {
    // a 40 x 20 box: rock border, floor at row 15, a pillar at x 20 that splits the floor, a ledge at row 8 x 30..33
    const W = 40, H = 20, tiles = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y >= 15 || (x === 20 && y >= 12)) tiles[y * W + x] = 1;
    for (let x = 30; x <= 33; x++) tiles[8 * W + x] = 1;
    const before = tiles.slice();
    const isSolid = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx < 0 || ty < 0 || tx >= W || ty >= H || tiles[ty * W + tx] !== 0; };
    const p = findAltarSpot(isSolid, 3, 5, 10, 40);
    const ok = p && isSolid(p.x - 1, p.y + 0.5) && isSolid(p.x, p.y + 0.5) && isSolid(p.x + 1, p.y + 0.5) && !isSolid(p.x - 1, p.y - 0.5) && !isSolid(p.x + 1, p.y - 2.5);
    const avoided = findAltarSpot(isSolid, 3, 5, 10, 40, (x) => x < 25);
    assert('altar: the floor finder picks three tiles of floor with water above, 10+ tiles from the start, and leaves the tiles as they were',
      ok && Math.hypot(p.x - 3.5, p.y - 6) >= 9 && before.every((v, i) => v === tiles[i]));
    assert('altar: the avoid callback moves it on (to the far side of the pillar or onto the ledge)', avoided && avoided.x >= 25);
    assert('altar: no floor in reach -> null', findAltarSpot(isSolid, 3, 5, 60, 80) === null);
  }
  // ---- level choice and the item gift ----
  {
    let none = 0; const per = [0, 0, 0, 0];
    for (let s = 1; s <= 400; s++) { const l = altarLevel(s * 7919, 1, 3); if (l < 0) none++; else per[l]++; }
    assert('altar: about three dives in four get one altar, on any of the three Shallows levels (' + none + ' none, ' + per.slice(1).join('/') + ')',
      none > 60 && none < 150 && per[1] > 50 && per[2] > 50 && per[3] > 50 && altarLevel(1234, 1, 3) === altarLevel(1234, 1, 3));
    const a = createAltar(0, 0, false, 99);
    const first = altarItem(a, () => true), skip = altarItem(a, (id) => id !== first), nothing = altarItem(a, () => false);
    assert('altar: the gift item is seeded, skips what you cannot carry, and is null when nothing fits',
      ALTAR_ITEMS.includes(first) && skip && skip !== first && nothing === null);
  }
  // ---- journal ----
  {
    const e = ENTRIES.find((x) => x.id === 'place-altar');
    assert('altar: the journal has a place page for it with a hint and the altar picture', e && e.cat === 'place' && e.where && e.art && e.art.img === 'img/v2/altar.webp' && e.text.length <= 80);
  }
}
