// 2026-10-18: the giant clam's pearl as a big carried thing (js/pearl.js; Daniel: "it should be bigger and you must bring it to
// the exit portal where it gets converted into the moon shell"). The hand kind and its weight, throw / drop / roll / blast, it
// never breaks, the clam as its source, the whirlpool's swirl, the press-while-held hook the exit uses, the Swift Current paying
// nothing any more, the texts, and the altar not taking it.
import {
  createPearl, spawnPearl, stepPearl, blastPearl, takePearl, registerPearlGrab, pearlLoose, pearlInLevel,
  PEARL_BIG_R, PEARL_WEIGHT, SWIRL_T, PL_FREE, PL_REST, PL_CARRY, PL_SWIRL, PL_GONE,
} from '../js/pearl.js';
import { registerInteract, clearInteracts, findTarget, createHand, handUse, stepHand, updateTarget, phoneHandMode, attach, PRI_THING, HOLD_DROP_S } from '../js/hand.js';
import { WEIGHT } from '../js/hand-kinds.js';
import { createOctopus } from '../js/octopus.js';
import { createCreatures, CR_GCLAM, CL_OPEN } from '../js/creatures.js';
import { createAltar, stepAltar } from '../js/altar.js';
import { createCorpses } from '../js/corpses.js';
import { ENTRIES } from '../js/journal.js';
import { MOON_VALUE } from '../js/shells.js';

const DT = 0.02;
const FLOOR = [{ x1: -50, y1: 10, x2: 100, y2: 10 }];
const flat = { isSolid: (x, y) => y > 10, tileAt: (x, y) => (y >= 10 ? 1 : 0), wallSegmentsNear: () => FLOOR, tileVersion: 0 };
// a slope down to the right: from (0, 4) to (20, 14), then flat
const SLOPE = [{ x1: 0, y1: 4, x2: 20, y2: 14 }, { x1: 20, y1: 14, x2: 60, y2: 14 }];
const slope = { isSolid: (x, y) => (x < 20 ? y > 4 + x / 2 : y > 14), tileAt: () => 0, wallSegmentsNear: () => SLOPE, tileVersion: 0 };
const ctx = { isSolid: flat.isSolid, thrownHit: () => false };
const UP = { pressed: false, held: false }, DOWN = { pressed: true, held: true }, HOLD = { pressed: false, held: true };
const settle = (p, w, s) => { for (let i = 0; i < Math.round(s / DT); i++) stepPearl(p, DT, w, null); };

export async function runPearlTests(assert) {
  clearInteracts();
  let pearl = createPearl();
  const clams = createCreatures();
  registerPearlGrab(registerInteract, PRI_THING, { pearl: () => pearl, clamPearl: (o, r) => clams.pearlNear(o, r), takeClamPearl: (i) => clams.takePearl(i) });

  // ---- the hand kind, its weight ----
  {
    const o = createOctopus(5, 8);
    spawnPearl(pearl, 5.8, 8);
    const t = findTarget(o, ctx);
    const hand = createHand();
    const used = handUse(hand, o, ctx);
    assert('pearl: a loose pearl in reach is a hand target of kind "pearl"; the hand lifts it', t && t.kind === 'pearl' && used && hand.heldKind === 'pearl' && hand.held.pearl === pearl && pearl.state === PL_CARRY);
    assert(`pearl: it is big (${(PEARL_BIG_R * 2).toFixed(2)} tiles) and heavy: the swim is slowed to x${PEARL_WEIGHT} (a pot x${WEIGHT.pot}), and it takes no hit for the octopus`,
      PEARL_BIG_R * 2 > 0.8 && PEARL_BIG_R * 2 < 0.95 && o.carryMul === PEARL_WEIGHT && PEARL_WEIGHT < WEIGHT.corpse && !o.shieldHit);
    assert('pearl: while it is held nothing else is a target (the hand is full)', updateTarget(hand, o, ctx) === null && phoneHandMode(hand, o) === 'throw');
    // throw: a tap
    stepHand(hand, o, DOWN, DT, { x: 1, y: 0 }, ctx); stepHand(hand, o, UP, DT, { x: 1, y: 0 }, ctx);
    assert('pearl: a tap throws it (it flies off loose, the swim speed is back)', !hand.held && hand.throws === 1 && pearl.state === PL_FREE && pearl.vx > 3 && o.carryMul === 1);
    settle(pearl, flat, 6);
    assert(`pearl: thrown, it sinks and rolls, then lies on the floor, whole (x ${pearl.x.toFixed(1)}, y ${pearl.y.toFixed(2)})`,
      pearl.state === PL_REST && Math.abs(pearl.y - (10 - PEARL_BIG_R)) < 0.06 && pearl.x > 7 && pearlInLevel(pearl));
  }
  // ---- drop: hold ----
  {
    const o = createOctopus(5, 8);
    spawnPearl(pearl, 5.5, 8);
    const hand = createHand();
    handUse(hand, o, ctx);
    stepHand(hand, o, DOWN, DT, null, ctx);
    for (let t = 0; t < HOLD_DROP_S + 0.05; t += DT) stepHand(hand, o, HOLD, DT, null, ctx);
    stepHand(hand, o, UP, DT, null, ctx);
    assert('pearl: holding the hand drops it gently (no throw)', !hand.held && hand.drops === 1 && hand.throws === 0 && pearl.state === PL_FREE && Math.hypot(pearl.vx, pearl.vy) < 1);
  }
  // ---- it never breaks: hurled into a wall at full speed ----
  {
    const wall = [{ x1: 10, y1: -50, x2: 10, y2: 50 }, ...FLOOR];
    const w = { isSolid: (x, y) => x > 10 || y > 10, tileAt: () => 0, wallSegmentsNear: () => wall, tileVersion: 0 };
    spawnPearl(pearl, 6, 8, 12, 0);
    let minX = 99, maxX = 0;
    for (let i = 0; i < 200; i++) { stepPearl(pearl, DT, w, null); maxX = Math.max(maxX, pearl.x); if (i > 10) minX = Math.min(minX, pearl.x); }
    assert(`pearl: thrown hard into rock it bounces off and stays whole (max x ${maxX.toFixed(2)})`, pearlLoose(pearl) && maxX <= 10 - PEARL_BIG_R + 0.05 && pearlInLevel(pearl));
  }
  // ---- it rolls down a slope (it can be lost down a shaft or into spikes) ----
  {
    spawnPearl(pearl, 2, 4 + 2 / 2 - PEARL_BIG_R / 0.894 - 0.03);
    settle(pearl, slope, 12);
    assert(`pearl: on a slope it rolls on down to the flat (x ${pearl.x.toFixed(1)})`, pearl.x > 20 && pearlLoose(pearl));
  }
  // ---- bombs knock it about ----
  {
    spawnPearl(pearl, 5, 10 - PEARL_BIG_R); settle(pearl, flat, 2);
    const moved = blastPearl(pearl, 4, 9.5, 2.5);
    const far = createPearl(); spawnPearl(far, 30, 9.5);
    assert('pearl: a bomb shoves a resting pearl away from the blast (one far off is untouched)', moved && pearl.state === PL_FREE && pearl.vx > 1 && pearl.vy < 0 && !blastPearl(far, 4, 9.5, 2.5));
    const o = createOctopus(5, 8); spawnPearl(pearl, 5.5, 8);
    const hand = createHand(); handUse(hand, o, ctx);
    assert('pearl: a blast does not tear it out of the hand', !blastPearl(pearl, 5.5, 8.5, 2.5) && pearl.state === PL_CARRY);
    attach(hand, o, ctx);
    assert('pearl: in the hand it rides at the hand point (the tentacles)', Math.hypot(pearl.x - o.x, pearl.y - o.y) < 1.2);
  }
  // ---- the source: the giant clam, open ----
  {
    pearl = createPearl();
    const rec = { type: 'creature', ck: CR_GCLAM, x: 7.5, y: 7.5, dx: 0, dy: -1, side: 1 };
    const i = clams.add(rec);
    const o = createOctopus(7.5, 6.9);
    const shut = findTarget(o, ctx);
    clams.data.state[i] = CL_OPEN; clams.data.ang[i] = 1;
    const t = findTarget(o, ctx);
    const far = findTarget(createOctopus(7.5, 5.8), ctx); // out of the clam's (shorter) reach
    const hand = createHand();
    handUse(hand, o, ctx);
    assert('pearl: a shut clam offers no pearl; an open one does (kind "pearl"), only within reach of its mouth', !shut && t && t.kind === 'pearl' && !far);
    assert('pearl: the hand takes the open clam\'s pearl: it is out (the clam is empty) and in the tentacles', hand.heldKind === 'pearl' && clams.data.pearl[i] === 0 && pearl.state === PL_CARRY && clams.events.some((e) => e.type === 'pearl'));
  }
  // ---- the whirlpool's swirl ----
  {
    const p = createPearl(); spawnPearl(p, 5, 5);
    const none = createPearl();
    const ok = takePearl(p, 6, 5);
    let n = 0; while (p.state === PL_SWIRL && n < 200) { stepPearl(p, DT, flat, null); n++; }
    assert(`pearl: the whirlpool takes it in a short swirl (${(n * DT).toFixed(2)} s), then it is gone; no pearl, nothing to take`,
      ok && p.state === PL_GONE && Math.abs(n * DT - SWIRL_T) < 0.05 && Math.hypot(p.x - 6, p.y - 5) < 0.05 && p.taken === 1 && !takePearl(none, 6, 5) && !pearlInLevel(p));
  }
  // ---- the exit's press while held (hand.js ctx.heldPress) ----
  {
    const o = createOctopus(5, 8);
    let asked = 0, at = false;
    const c2 = { ...ctx, heldPress: (h) => { asked++; return at && !!h.held.pearl; } };
    pearl = createPearl(); spawnPearl(pearl, 5.6, 8);
    const hand = createHand(); handUse(hand, o, c2);
    stepHand(hand, o, DOWN, DT, null, c2); stepHand(hand, o, UP, DT, null, c2);
    const thrownAway = hand.throws === 1 && !hand.held;
    spawnPearl(pearl, o.x + 0.6, o.y); const hand2 = createHand(); handUse(hand2, o, c2); at = true;
    stepHand(hand2, o, DOWN, DT, null, c2); stepHand(hand2, o, UP, DT, null, c2);
    hand2.heldPortal = true;
    assert('pearl: away from the exit the press throws it; at the exit (heldPress true) the press is used and nothing is thrown',
      thrownAway && asked === 2 && hand2.throws === 0 && hand2.held && phoneHandMode(hand2, o) === 'enter');
  }
  // ---- the Swift Current pays nothing; the moon shell comes from the pearl (main.js) ----
  {
    const src = await (await fetch(new URL('../js/main.js', import.meta.url))).text();
    const body = (name) => { const a = src.indexOf('function ' + name + '('); if (a < 0) return ''; const b = src.indexOf('\n}\n', a); return src.slice(a, b); };
    const es = body('earnSwift'), pw = body('pearlIntoWhirlpool'), fp = body('finishPortal');
    assert('swift: reaching the whirlpool in time pays nothing any more (no moon shell dropped, no shells)', es && !/gainShells|dropShell|SK_MOON|MOON_VALUE/.test(es) && !/paySwiftShell/.test(src));
    assert(`pearl: the exit whirlpool converts only a HELD pearl into the moon shell (+${MOON_VALUE}, journal item-moon), on entering the exit`,
      /PL_CARRY/.test(pw) && /gainShells\(run, MOON_VALUE\)/.test(pw) && /item-moon/.test(pw) && /The whirlpool takes the pearl: a moon shell/.test(pw) && /EV_EXIT[\s\S]*pearlIntoWhirlpool\(p\)/.test(fp));
  }
  // ---- texts ----
  {
    const big = ENTRIES.find((e) => e.id === 'item-bigpearl'), moon = ENTRIES.find((e) => e.id === 'item-moon'), sw = ENTRIES.find((e) => e.id === 'loot-swift');
    const tut = await (await fetch(new URL('../data/tutorial.json', import.meta.url))).text();
    const jr = await (await fetch(new URL('../data/journal.json', import.meta.url))).text();
    const rest = await (await fetch(new URL('../data/rest.json', import.meta.url))).text();
    assert('journal: an Items entry for the giant pearl: "Heavy. Bring it to the whirlpool."', big && big.cat === 'item' && big.text === 'Heavy. Bring it to the whirlpool.');
    assert('texts: no sign or journal entry promises a moon shell for the Swift Current any more', moon && !/Swift/.test(moon.text) && sw && !/moon/i.test(sw.text)
      && ![tut, jr, rest].some((s) => /Swift Current (earns|brings|shell)|earn a moon shell|Swift Current's prize/i.test(s)));
  }
  // ---- the altar does not take it (it is not a body) ----
  {
    const a = createAltar(5, 10), c = createCorpses();
    const p = createPearl(); spawnPearl(p, 5, 9.5);
    let evs = [];
    for (let i = 0; i < 200; i++) { stepPearl(p, DT, flat, null); evs = evs.concat(stepAltar(a, DT, { corpses: c, enemies: [], keepers: null }) || []); }
    assert('pearl: lying on the altar it is not taken (no offering, the pearl stays)', a.offerings === 0 && !evs.some((e) => e.type === 'offer' || e.type === 'gift') && pearlLoose(p));
  }
  clearInteracts();
}
