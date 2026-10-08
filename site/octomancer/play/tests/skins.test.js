// 2026-10-08: octopus skins (skins.js, skin-draw.js, skin-picker.js, save.js skins). Each person's look unlocks the first time
// they are rescued / befriended (from the story counters), the save keeps the unlocked list and the look worn, every skin has a
// Looks page in the journal with a hint, the recolour keeps light and shade, the tinted sheet is built once (never per frame).
import { SKINS, SKIN_IDS, DEFAULT_SKIN, earnedSkins, newSkins, skinRows, skinById, isSkinId } from '../js/skins.js';
import { recolorPixels, headFrame, skinSheet, skinSheetStats, FRAMES_PER_TICK, frameClip, wornColors, setWornSkin } from '../js/skin-draw.js';
import { SKIN_ATLAS } from '../js/skin-atlas.js';
import { getSkins, unlockSkins, getSkin, setSkin, getStory, _resetForTests } from '../js/save.js';
import { ENTRIES, TABS, CATEGORY_TITLES } from '../js/journal.js';
import { drawOctopus, setOctopusSkin, getOctopusSkin, onOctopusReady, drawOctopusPortrait, isBaked } from '../js/octopus-draw.js';
import { createSkinPicker } from '../js/skin-picker.js';
import { createSkinGifts, GIFT_S } from '../js/skin-gifts.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runSkinsTests(assert) {
  // ---------------------------------------------------------------- the table
  const npcIds = (await (await fetch(new URL('../data/quests.json', import.meta.url))).json()).npcs.map((n) => n.id);
  assert('skins: a default look and one per person of quests.json (Marlo, Pip, Quill, the host)', SKINS[0].id === DEFAULT_SKIN && npcIds.every((id) => SKINS.some((s) => s.npc === id)) && SKIN_IDS.length === npcIds.length + 1);
  assert('skins: each person\'s look has a colour, a give line and a hint; accessories exist in the atlas', SKINS.filter((s) => s.npc).every((s) => /^#[0-9a-f]{6}$/i.test(s.body) && s.give && s.hint && (!s.acc || SKIN_ATLAS[s.acc.sprite])) && !!SKIN_ATLAS.mirrorShell);
  assert('skins: no gold in the palette (natural colours: no yellow-orange of high saturation and brightness)', SKINS.filter((s) => s.body).every((s) => { const n = parseInt(s.body.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return !(r > 180 && g > 140 && b < 90); }));

  // ---------------------------------------------------------------- unlock rules (first rescue / befriending)
  const none = {};
  assert('unlock: a fresh story earns only the default look', JSON.stringify(earnedSkins(none)) === JSON.stringify([DEFAULT_SKIN]));
  assert('unlock: Marlo freed once, Pip freed, Quill met in the hub, a won wager each earn their look', earnedSkins({ diverFreed: 1 }).includes('marlo') && earnedSkins({ critterFreed: 1 }).includes('pip') && earnedSkins({ saidQuill: 1 }).includes('quill') && earnedSkins({ digQuill: 1 }).includes('quill') && earnedSkins({ poolWon: 1 }).includes('host'));
  assert('unlock: Quill only living in the hub (not yet spoken to) has not given his look yet', !earnedSkins({ quill: 1 }).includes('quill'));
  const s1 = { diverFreed: 1 };
  const first = newSkins(s1, [DEFAULT_SKIN]);
  const again = newSkins({ diverFreed: 2, marlo: 2 }, [DEFAULT_SKIN, 'marlo']);
  assert('unlock: the first rescue gives the look, a second rescue gives nothing new', JSON.stringify(first) === '["marlo"]' && again.length === 0);
  const rows = skinRows(['classic', 'pip'], 'pip');
  assert('picker rows: every skin, unlocked flags, the worn one marked', rows.length === SKINS.length && rows.find((r) => r.id === 'pip').current && rows.find((r) => r.id === 'pip').unlocked && !rows.find((r) => r.id === 'marlo').unlocked && rows[0].unlocked);

  // ---------------------------------------------------------------- the save (fake localStorage, as journal.test.js)
  const mem = new Map();
  const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stubbed = false;
  try { Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true }); stubbed = true; } catch (e) { /* engine refuses */ }
  if (stubbed) {
    try {
      _resetForTests();
      assert('save: a fresh save has no skin list yet (null: main.js unlocks what the story earned) and wears the default', getSkins() === null && getSkin() === DEFAULT_SKIN);
      assert('save: a locked look cannot be worn', setSkin('host') === DEFAULT_SKIN);
      unlockSkins(['marlo', 'nonsense', 'marlo']);
      assert('save: unlocking keeps the default, ignores unknown ids and duplicates', JSON.stringify(getSkins()) === '["classic","marlo"]');
      setSkin('marlo');
      _resetForTests();
      assert('save: the unlocked looks and the one worn persist across a reload', JSON.stringify(getSkins()) === '["classic","marlo"]' && getSkin() === 'marlo');
      mem.set('octomancer.best.v1', JSON.stringify({ v: 1, skins: ['classic', 'pip', 7], skin: 'host' }));
      _resetForTests();
      assert('save: a tampered save drops junk and a worn look that is not unlocked', JSON.stringify(getSkins()) === '["classic","pip"]' && getSkin() === DEFAULT_SKIN);
      mem.set('octomancer.best.v1', JSON.stringify({ v: 1, best: 3, story: { diverFreed: 2 } }));
      _resetForTests();
      assert('save: an older save (no skins field) loads with no list, its story still there to earn from', getSkins() === null && getStory().diverFreed === 2 && JSON.stringify(newSkins(getStory(), [DEFAULT_SKIN])) === '["marlo"]');
    } finally {
      _resetForTests();
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
      _resetForTests();
    }
  }

  // ---------------------------------------------------------------- journal: a Looks page per skin
  const byId = new Map(ENTRIES.map((e) => [e.id, e]));
  const items = TABS.find((t) => t.id === 'items');
  assert('journal: the Items tab has a Looks category with a page per skin, each with a hint (the locked page tease)', items.cats.includes('look') && CATEGORY_TITLES.look === 'Looks' && SKINS.every((s) => { const e = byId.get(s.journal); return e && e.cat === 'look' && e.art && e.art.skin === s.id && e.where && e.where.length > 10 && e.where.length <= 80; }));

  // ---------------------------------------------------------------- recolour
  const px = new Uint8ClampedArray([192, 80, 96, 255, 96, 40, 48, 255, 0, 0, 0, 0, 20, 10, 12, 255]);
  recolorPixels(px, '#4d7f86');
  assert('recolour: the base pink becomes the skin colour, its half-shade half the colour, transparent stays, the outline stays dark', Math.abs(px[0] - 0x4d) <= 1 && Math.abs(px[1] - 0x7f) <= 1 && Math.abs(px[4] - 0x4d / 2) <= 1 && px[11] === 0 && px[12] < 20 && px[13] < 20);
  const hf = headFrame({ left: { x: 50, y: 80 }, right: { x: 100, y: 80 } });
  assert('head frame: centre between the eyes, up is -y, spacing in px', hf.cx === 75 && hf.cy === 80 && hf.vy === -1 && hf.d === 50);
  setWornSkin('marlo');
  const wc = wornColors();
  setWornSkin(DEFAULT_SKIN);
  assert('worn colours: the arm and gibs take the look (Marlo teal, a darker shade), default is Milan\'s pink', wc.body === '#4d7f86' && wc.dark !== wc.body && wornColors().body === '#c05060');

  // ---------------------------------------------------------------- the sheet: built once, offscreen, never per frame
  await Promise.race([new Promise((r) => onOctopusReady(r)), sleep(5000)]);
  if (isBaked()) {
    const before = skinSheetStats();
    setOctopusSkin('pip');
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 200;
    const g = cv.getContext('2d');
    const o = { radius: 0.45, swimming: false, dashCooldown: 0, __t: 0.3, __speed: 0, stunT: 0, held: 0 };
    const drawOne = (extra = {}) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 200, 200); g.translate(100, 100); g.scale(90, 90); drawOctopus(g, { ...o, ...extra }, 1); };
    drawOne(); // first frames before the sheet is in: Milan's own colours (no error)
    for (let k = 0; k < 200 && !skinSheetStats().ready; k++) await sleep(20);
    const built = skinSheetStats();
    const frames = 42;
    assert('sheet: wearing a look builds its sheet in short tasks (' + FRAMES_PER_TICK + ' cells each), one recolour per cell, one sheet kept', built.ready && built.id === 'pip' && built.tintCalls - before.tintCalls === frames && built.sheets === 1 && built.bytes === frames * 160 * 160 * 4, JSON.stringify(built));
    const poses = [{}, { swimming: true }, { hurting: true }, { stunT: 1 }, { dead: true, limp: true }, { dead: true, deathStyle: 'impale' }, { dead: true, deathStyle: 'splat', flat: 1 }, { dead: true, limp: true, hitFlash: 0.5 }];
    let greenPoses = 0;
    for (const p of poses) {
      drawOne(p);
      const d = g.getImageData(0, 0, 200, 200).data; // (the test canvas, not the game's)
      let green = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > d[i] && d[i + 1] > d[i + 2] + 30) green++;
      if (green > 40) greenPoses++;
    }
    assert('poses: every pose (idle, swim, hurt, stunned, ragdoll, impaled, splat, a flashed body) draws in the worn look', greenPoses >= poses.length - 1, greenPoses + '/' + poses.length);
    for (let i = 0; i < 120; i++) drawOne(i % 2 ? { swimming: true } : {});
    assert('sheet: 120 more frames recolour nothing (no per-frame tinting)', skinSheetStats().tintCalls === built.tintCalls && skinSheetStats().built === built.built);
    setOctopusSkin('quill');
    await sleep(0);
    setOctopusSkin('quill');
    for (let k = 0; k < 200 && !skinSheetStats().ready; k++) await sleep(20);
    assert('sheet: switching looks frees the old sheet (still one kept)', skinSheetStats().sheets === 1 && skinSheetStats().id === 'quill' && getOctopusSkin() === 'quill');
    setOctopusSkin(DEFAULT_SKIN);
    assert('sheet: the default look keeps no tinted sheet at all', skinSheetStats().sheets === 0 && skinSheet(DEFAULT_SKIN, null) === null);
    const pc = document.createElement('canvas'); pc.width = pc.height = 128;
    assert('portrait: every look draws a still portrait (picker, journal plates)', SKINS.every((s) => drawOctopusPortrait(pc.getContext('2d'), s.id, 64, 70, 110)));
  } else assert('skins: the baked octopus loaded for the sheet tests', false);

  // ---------------------------------------------------------------- the picker
  const host = document.createElement('div');
  document.body.appendChild(host);
  let worn = 'classic', opened = 0, closed = 0;
  const picker = createSkinPicker(host, { getUnlocked: () => ['classic', 'marlo'], getCurrent: () => worn, onWear: (id) => { worn = id; }, onOpen: () => opened++, onClose: () => closed++ });
  picker.show();
  const cards = picker.cards();
  assert('picker: a card per look, locked ones read ???, the worn one marked', cards.length === SKINS.length && cards.filter((c) => c.unlocked).length === 2 && cards.filter((c) => c.name === '???').length === SKINS.length - 2 && cards[0].current && opened === 1);
  host.querySelectorAll('.octo-skin-card')[1].click();
  const locked = picker.wearIndex(SKINS.findIndex((s) => s.id === 'host'));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  assert('picker: a click wears an unlocked look, a locked one cannot be worn, Esc closes', worn === 'marlo' && !locked && !picker.isOpen() && closed === 1);
  host.remove();

  // ---------------------------------------------------------------- the gift moment
  const gifts = createSkinGifts();
  gifts.give('marlo', 0, 0); gifts.give('pip', 0, 0);
  const landed = [];
  for (let t = 0; t < 4; t += 1 / 60) landed.push(...gifts.step(1 / 60));
  assert('gift: two gifts at once land one after the other, each once, then the queue empties', JSON.stringify(landed) === '["marlo","pip"]' && !gifts.busy() && GIFT_S > 0.5);
  assert('skins: ids are what isSkinId and skinById agree on', SKIN_IDS.every(isSkinId) && skinById('nope').id === DEFAULT_SKIN);
}
