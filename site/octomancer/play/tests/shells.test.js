// V2-PLAN 16 point 7: currency shells by value (js/shells.js): payouts in natural pieces, the rarity of placed shells,
// pickups that carry a kind and a value, and the kinds a level places.
import { SK_COWRIE, SK_CONCH, SK_NAUTILUS, SK_PEARL, SHELL_VALUE, payout, pickPlacedKind } from '../js/shells.js';
import { createPickups } from '../js/pickups.js';
import { createOctopus } from '../js/octopus.js';
import { mulberry32 } from '../js/rng.js';
import { createRoomBank } from '../js/rooms.js';
import { setDefaultBank, generateLevel } from '../js/level.js';
import { buildLevelSpawns } from '../js/level-spawns.js';
import { loadRoomsJson } from './rooms.test.js';

const sum = (kinds) => kinds.reduce((a, k) => a + SHELL_VALUE[k], 0);

export async function runShellTests(assert) {
  // ---- payout ----
  {
    let exact = 0, natural = 0, noPearl = 0, rngExact = 0;
    const rng = mulberry32(7);
    for (let n = 1; n <= 120; n++) {
      const p = payout(n);
      if (sum(p) === n) exact++;
      const naut = p.filter((k) => k === SK_NAUTILUS).length, conch = p.filter((k) => k === SK_CONCH).length, cow = p.filter((k) => k === SK_COWRIE).length;
      if (naut === Math.floor(n / 15) && conch === Math.floor((n % 15) / 5) && cow === n % 5) natural++;
      if (!p.includes(SK_PEARL)) noPearl++;
      if (sum(payout(n, rng)) === n) rngExact++;
    }
    assert(`shells: payout(n) sums exactly to n for 1..120 (${exact}/120), also with a seeded rng (${rngExact}/120), and never pays a pearl`, exact === 120 && rngExact === 120 && noPearl === 120);
    assert(`shells: without an rng it pays in the biggest natural pieces (nautilus 15, conch 5, cowrie 1) (${natural}/120)`, natural === 120);
    assert('shells: payout(5) is one conch, payout(16) a nautilus and a cowrie, payout(0) nothing', payout(5).length === 1 && payout(5)[0] === SK_CONCH && payout(16).join() === [SK_NAUTILUS, SK_COWRIE].join() && payout(0).length === 0);
    const seen = new Set();
    for (let s = 1; s <= 60; s++) seen.add(payout(5, mulberry32(s)).join());
    assert(`shells: with an rng a small sum varies (a 5 is a conch or five cowries: ${[...seen].length} variants)`, seen.size === 2);
    let wrongOrder = 0;
    for (let n = 1; n <= 120; n++) { const p = payout(n); for (let i = 1; i < p.length; i++) if (p[i] > p[i - 1]) wrongOrder++; }
    assert('shells: pieces come out largest first', wrongOrder === 0);
  }

  // ---- placed rarity ----
  {
    const rng = mulberry32(12345), count = [0, 0, 0, 0, 0];
    for (let i = 0; i < 2000; i++) count[pickPlacedKind(rng, 1)]++;
    const f = count.map((c) => c / 2000);
    assert(`shells: 2000 placed rolls on level 1 are about 70% cowrie / 25% conch / 5% nautilus (${(f[1] * 100).toFixed(1)} / ${(f[2] * 100).toFixed(1)} / ${(f[3] * 100).toFixed(1)}), no pearl`, f[1] > 0.66 && f[1] < 0.74 && f[2] > 0.21 && f[2] < 0.29 && f[3] > 0.03 && f[3] < 0.07 && count[SK_PEARL] === 0);
    const deep = [0, 0, 0, 0, 0], rng2 = mulberry32(99);
    for (let i = 0; i < 4000; i++) deep[pickPlacedKind(rng2, 6)]++;
    assert(`shells: deeper levels place a bit more conch and nautilus (${(deep[2] / 40).toFixed(1)}% / ${(deep[3] / 40).toFixed(1)}%) and still no pearl`, deep[2] / 4000 > f[2] && deep[3] / 4000 > f[3] && deep[SK_PEARL] === 0);
  }

  // ---- pickups carry the value ----
  {
    const pk = createPickups();
    const W = 20, H = 12, tiles = new Uint8Array(W * H); // all water
    const chunk = { width: W, height: H, tiles, spawns: [{ type: 'shell', x: 3.5, y: 3.5, sk: SK_NAUTILUS }, { type: 'shell', x: 8.5, y: 3.5, sk: SK_CONCH }, { type: 'shell', x: 12.5, y: 3.5 }], salt: 5 };
    const resident = [{ index: 0, yOffset: 0, chunk }];
    const o = createOctopus(1, 9); o.invulnTimer = 1e9;
    const world = { isSolid: () => false };
    pk.update(0.02, 0, o, resident, world);
    const items = pk.visible(resident).filter((it) => it.type === 'shell');
    assert('shells: placed shells carry their kind and value (nautilus 15, conch 5, an unmarked one a cowrie 1)', items.length === 3 && items[0].value === 15 && items[1].value === 5 && items[2].value === 1 && items[2].sk === SK_COWRIE);
    const evs = [];
    for (const [x, kind] of [[3.5, SK_NAUTILUS], [8.5, SK_CONCH], [12.5, SK_COWRIE]]) {
      o.x = x; o.y = 3.5; pk.update(0.02, 0, o, resident, world);
      for (const e of pk.events) if (e.type === 'shell') evs.push(e);
      assert(`shells: collecting the ${kind === SK_NAUTILUS ? 'nautilus' : kind === SK_CONCH ? 'conch' : 'cowrie'} event carries sk and value ${SHELL_VALUE[kind]}`, evs.length && evs[evs.length - 1].sk === kind && evs[evs.length - 1].value === SHELL_VALUE[kind]);
    }
    assert(`shells: totals.shells counts the VALUE (${pk.totals.shells} = 15 + 5 + 1)`, pk.totals.shells === 21);
    // a dropped shell of a kind
    pk.dropShell(5, 6, 0, 0, SK_NAUTILUS); pk.dropShell(5, 6, 0, 0);
    o.x = 5; o.y = 6;
    for (let i = 0; i < 40; i++) pk.update(0.02, 0, o, resident, world);
    assert(`shells: dropped shells count their value too (a nautilus and a default cowrie: ${pk.totals.shells} = 21 + 16)`, pk.totals.shells === 37);
    pk.dropShell(5, 6, 0, 0, SK_PEARL);
    for (let i = 0; i < 40; i++) pk.update(0.02, 0, o, resident, world);
    assert('shells: a dropped pearl is worth 30', pk.totals.shells === 67);
  }

  // ---- level spawns ----
  {
    setDefaultBank(createRoomBank(await loadRoomsJson()));
    const kinds = new Set(); let total = 0, noSk = 0;
    for (let seed = 1; seed <= 10; seed++) for (let lvl = 1; lvl <= 6; lvl++) {
      const sp = buildLevelSpawns(generateLevel(seed, lvl), seed, lvl).spawns;
      for (const s of sp) if (s.type === 'shell') { total++; if (!s.sk) noSk++; kinds.add(s.sk); }
    }
    assert(`shells: over 10 seeds (x 6 levels, ${total} placed shells) cowrie, conch and nautilus all appear, no pearl, every record has a kind (${noSk} without)`,
      kinds.has(SK_COWRIE) && kinds.has(SK_CONCH) && kinds.has(SK_NAUTILUS) && !kinds.has(SK_PEARL) && noSk === 0);
    const again = [];
    for (const s of buildLevelSpawns(generateLevel(3, 2), 3, 2).spawns) if (s.type === 'shell') again.push(s.sk);
    const once = [];
    for (const s of buildLevelSpawns(generateLevel(3, 2), 3, 2).spawns) if (s.type === 'shell') once.push(s.sk);
    assert('shells: the kinds are seeded (the same level twice gives the same shells)', again.join() === once.join() && again.length > 0);
  }
}
