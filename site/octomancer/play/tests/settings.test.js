// Round 38: settings (settings.js + save.js), the seed override of a dive, the shop room being unbreakable, the keeper's
// flinch, the settings-driven shake and the fixed shake / puff in particles.js, the octopus contact shadow.
import { SETTING_DEFS, cleanSetting, cleanSettings, cleanSeedText, seedFromText, defaultSettings, SEED_MAX } from '../js/settings.js';
import { getSettings, setSetting, resetProgress, saveJournalIds, getJournalIds, recordDive, getBestRuns, setMuted, getMuted, _resetForTests } from '../js/save.js';
import { OCTO_IDLE_SINK, setMotionSettings, prefersReducedMotion, shakeEnabled } from '../js/config.js';
import { createRun, runEvent, nextDiveSeed, levelTitle, EV_ENTER_DIVE } from '../js/run.js';
import { createLevelWorld } from '../js/world-v2.js';
import { createShopState, shopBlast, shopStep } from '../js/shop.js';
import { createParticles } from '../js/particles.js';
import { drawContactShadows } from '../js/feel-draw.js';

const desc0 = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

export async function runSettingsTests(assert) {
  const d = defaultSettings();
  assert('settings: defaults (volumes 1, shake on, reduced motion follows the OS, sink = OCTO_IDLE_SINK, blank seed)',
    d.musicVol === 1 && d.sfxVol === 1 && d.shake === true && d.reducedMotion === null && d.sink === OCTO_IDLE_SINK && d.seed === '');
  assert('settings: every definition has a label and a default', SETTING_DEFS.every((s) => s.label && 'def' in s));
  assert('settings: sliders clamp to their range and junk falls back to the default',
    cleanSetting('musicVol', 7) === 1 && cleanSetting('musicVol', -1) === 0 && cleanSetting('sink', 9) === 2 && cleanSetting('sink', 'abc') === OCTO_IDLE_SINK && cleanSetting('sfxVol', '') === 1);
  assert('settings: slider values snap to their step (no float dust)', cleanSetting('sink', 0.30000000000000004) === 0.3 && cleanSetting('musicVol', 0.5000001) === 0.5);
  assert('settings: toggles; reduced motion null stays null', cleanSetting('shake', 0) === false && cleanSetting('reducedMotion', null) === null && cleanSetting('reducedMotion', true) === true);
  assert('settings: seed text keeps digits, caps at 10 digits and 2^32-1, drops leading zeros',
    cleanSeedText('a1b2') === '12' && cleanSeedText('00042') === '42' && cleanSeedText('99999999999') === String(SEED_MAX) && cleanSeedText(null) === '' && cleanSeedText('0') === '0');
  assert('settings: seedFromText: blank = random (null)', seedFromText('') === null && seedFromText('42') === 42 && seedFromText('abc') === null);
  assert('settings: unknown keys are dropped when cleaning a stored object', (() => { const c = cleanSettings({ musicVol: 0.4, bogus: 1 }); return c.musicVol === 0.4 && !('bogus' in c); })());

  // ---- save.js round trip through a fake localStorage
  const mem = new Map();
  const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  let stubbed = false;
  try { Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true }); stubbed = true; } catch (e) { /* engine refuses */ }
  if (stubbed) {
    _resetForTests();
    assert('settings save: a fresh save has the defaults', getSettings().sink === OCTO_IDLE_SINK && getSettings().seed === '');
    setSetting('musicVol', 0.25); setSetting('seed', '777'); setSetting('reducedMotion', true); setSetting('nonsense', 1);
    _resetForTests();
    const s = getSettings();
    assert('settings save: values persist across a reload', s.musicVol === 0.25 && s.seed === '777' && s.reducedMotion === true && !('nonsense' in s));
    saveJournalIds(['place-hub']); recordDive({ depth: 2, shells: 3, time: 40, kills: 1, quests: 0, level: 2, cleared: false, cause: 'crab', seed: 5 }); setMuted(true);
    resetProgress();
    _resetForTests();
    assert('reset progress: journal, best runs and meta are gone, settings and mute stay', getJournalIds().length === 0 && getBestRuns().length === 0 && getSettings().musicVol === 0.25 && getSettings().seed === '777' && getMuted() === true);
    mem.set('octomancer.best.v1', '{"settings":{"sink":"x","musicVol":9}}'); _resetForTests();
    assert('settings save: a damaged settings block falls back per key', getSettings().sink === OCTO_IDLE_SINK && getSettings().musicVol === 1);
    _resetForTests();
    if (desc0) Object.defineProperty(globalThis, 'localStorage', desc0); else delete globalThis.localStorage;
  }

  // ---- motion settings reach prefersReducedMotion / shakeEnabled
  setMotionSettings(true, false);
  assert('motion: the player choice of reduced motion wins and shake can be switched off', prefersReducedMotion() === true && shakeEnabled() === false);
  setMotionSettings(false, true);
  assert('motion: reduced motion off overrides the OS value', prefersReducedMotion() === false && shakeEnabled() === true);
  {
    const p = createParticles(); setMotionSettings(false, false); p.shakeFx(4); p.blastFeel(1, 1, 0);
    const m = p.shakePx();
    assert('motion: shake off means no screen shake at all', m.x === 0 && m.y === 0);
    setMotionSettings(null, true);
  }

  // ---- shakeFx scales by the duration it was started with
  {
    const p = createParticles(); p.shakeFx(4, 0.12);
    p.update(0.06);
    let peak = 0; for (let i = 0; i < 60; i++) { const m = p.shakePx(i * 16.7); peak = Math.max(peak, Math.abs(m.x), Math.abs(m.y)); }
    assert('shake: a 0.12 s shake is at half strength after 0.06 s (fades over its own duration)', peak <= 2.01 && peak > 1, String(peak));
    p.update(0.07);
    const m = p.shakePx();
    assert('shake: gone after its duration', m.x === 0 && m.y === 0);
  }

  // ---- dash bounce puff: 12-14 bright particles plus 2-3 chips
  {
    const p = createParticles(); setMotionSettings(false, true);
    p.bouncePuff(1, 1, 1, 0);
    const live = p.pool.filter((q) => q.active);
    const chips = live.filter((q) => q.color[0] === '#').length;
    assert('puff: 13 dust particles and 3 rock chips', live.length === 16 && chips === 3, live.length + '/' + chips);
    setMotionSettings(null, true);
  }

  // ---- run: the settings seed drives the dive
  {
    const run = createRun(99, { tutorialDone: true });
    run.nextSeed = 424242;
    assert('seed: the next dive seed is the typed seed', nextDiveSeed(run) === 424242);
    runEvent(run, EV_ENTER_DIVE);
    assert('seed: the dive uses exactly the typed seed and the title card shows it', run.diveSeed === 424242 && levelTitle(run, true).sub === 'Seed 424242');
    const run2 = createRun(99, { tutorialDone: true });
    const expect = nextDiveSeed(createRun(99, { tutorialDone: true }));
    runEvent(run2, EV_ENTER_DIVE);
    assert('seed: blank (null) keeps the random per-dive seed', run2.diveSeed !== 424242 && run2.diveSeed === expect);
  }

  // ---- shop room: breakable since 2026-10-07 (Spelunky: bombing the stall angers the keeper); the keeper flinches on a nearby blast
  {
    let w = null;
    for (let seed = 1; seed < 60 && !w; seed++) { const c = createLevelWorld(seed, 0); if (c.level.shop) w = c; }
    assert('shop: a level with a shop was found', !!w);
    if (w) {
      const sh = w.level.shop;
      let solidInside = null;
      for (let y = sh.y0 + 2; y < sh.y1 - 1 && !solidInside; y++) for (let x = sh.x0 + 2; x < sh.x1 - 1; x++) if (w.tileAt(x, y) !== 0) { solidInside = [x, y]; break; }
      assert('shop: a rock tile inside the shop room breaks like any rock and counts as shop damage (2026-10-07)',
        !!solidInside && w.isBreakable(solidInside[0], solidInside[1]) === true && w.breakTile(solidInside[0], solidInside[1]) === true && w.tileAt(solidInside[0], solidInside[1]) === 0 && w.shopTilesBroken === 1);
      let outside = null;
      for (let y = 4; y < w.height - 4 && !outside; y++) for (let x = 4; x < w.width - 4; x++) if (w.tileAt(x, y) !== 0 && !(x >= sh.x0 && x < sh.x1 && y >= sh.y0 && y < sh.y1) && !w.isBedrock(x, y)) { outside = [x, y]; break; }
      assert('shop: rock outside the shop room still breaks', !!outside && w.breakTile(outside[0], outside[1]) === true);
      const st = createShopState(sh, [{ id: 'a', price: 1, effect: 'bombs', amount: 1 }], 1, 0, []);
      assert('shop: a blast within 3 radii makes the keeper flinch, a far one does not', shopBlast(st, st.keeperX + 2, st.keeperY, 2) === true && st.flinch > 0 && (() => { st.flinch = 0; return shopBlast(st, st.keeperX + 20, st.keeperY, 2) === false && st.flinch === 0; })());
      st.flinch = 0.5; shopStep(st, { x: -99, y: -99, bombs: 0, bombMax: 3 }, 0, 0.25);
      const mid = st.flinch;
      shopStep(st, { x: -99, y: -99, bombs: 0, bombMax: 3 }, 0, 1);
      assert('shop: the flinch dies away', mid > 0 && mid < 0.5 && st.flinch === 0);
    }
  }

  // ---- the octopus gets a contact shadow near a floor, none far from it
  {
    const calls = [];
    const ctx = { fillStyle: '', beginPath() {}, ellipse() { calls.push(1); }, fill() {} };
    const cam = { x: 0, y: 0, pxPerUnit: 20 };
    const floor = (tx, ty) => ty >= 10;
    const dd = { n: 0 };
    const octo = (y) => ({ x: 0.5, y, radius: 0.45, dead: false });
    drawContactShadows(ctx, cam, 800, 600, dd, [], floor, octo(9.4));
    assert('octopus shadow: drawn when it rests within 0.5 tiles of the floor', calls.length === 1);
    calls.length = 0; drawContactShadows(ctx, cam, 800, 600, dd, [], floor, octo(8.5));
    assert('octopus shadow: none when it is more than 0.5 tiles above the floor', calls.length === 0);
    calls.length = 0; drawContactShadows(ctx, cam, 800, 600, dd, [], floor, { ...octo(9.5), dead: true });
    assert('octopus shadow: none for a dead octopus', calls.length === 0);
  }
}
