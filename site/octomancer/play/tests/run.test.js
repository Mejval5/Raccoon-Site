// B1-1 run flow tests (run.js): the hub -> Shallows 1-1..1-3 -> end -> hub state machine; the tutorial is its own place
// (hub -> tutorial -> hub) that unseals the dive; quick restart (EV_RESTART) from a dive straight into a new one.
import {
  createRun, runEvent, levelSpec, stageLabel, isSafeState,
  S_HUB, S_TUTORIAL, S_BIOME, S_END, S_REST, EV_ENTER_DIVE, EV_ENTER_TUTORIAL, EV_RESTART, EV_LEAVE, EV_ENTER_SHORTCUT, diveOpen, canQuickRestart, EV_EXIT, EV_DEATH, EV_CONTINUE, BIOME_LEVELS, CAUSE_TEXT, CAUSE_NAME, DEATH_TITLE, deathTitle,
} from '../js/run.js';

export function runRunTests(assert) {
  // first run: the tutorial is played, then the three levels, then the end screen
  const r = createRun(42, { tutorialDone: false });
  assert('run: starts in the hub with label "Hub"', r.state === S_HUB && stageLabel(r) === 'Hub' && levelSpec(r).kind === 'hub');
  assert('run: hub ignores exit / continue events', !runEvent(r, EV_EXIT) && !runEvent(r, EV_CONTINUE) && r.state === S_HUB);
  assert('run: the dive is sealed until the tutorial is done (the event is refused, nothing changes)',
    !diveOpen(r) && !runEvent(r, EV_ENTER_DIVE) && r.state === S_HUB && r.dives === 0);
  r.shortcut = true;
  assert('run: the shortcut ring is sealed too before the tutorial', !runEvent(r, EV_ENTER_SHORTCUT) && r.state === S_HUB);
  r.shortcut = false;
  assert('run: the tutorial ring enters the tutorial', runEvent(r, EV_ENTER_TUTORIAL) && r.state === S_TUTORIAL && stageLabel(r) === 'Tutorial' && levelSpec(r).kind === 'tutorial');
  assert('run: hub and tutorial are safe states (no enemies, no Beholder timer)', isSafeState(r));
  assert('run: tutorial ignores the dive event and the quick restart', !runEvent(r, EV_ENTER_DIVE) && !runEvent(r, EV_RESTART) && r.state === S_TUTORIAL && !canQuickRestart(r));
  assert('run: leaving the tutorial from the pause menu goes to the hub, still sealed', runEvent(r, EV_LEAVE) && r.state === S_HUB && !r.tutorialDone && !r.diveUnlocked);
  runEvent(r, EV_ENTER_TUTORIAL);
  assert('run: tutorial exit returns to the hub, marks the tutorial done and asks for the unlock moment',
    runEvent(r, EV_EXIT) && r.state === S_HUB && r.level === 0 && r.tutorialDone && r.diveUnlocked && diveOpen(r) && r.dives === 0);
  r.diveUnlocked = false;
  assert('run: the tutorial stays replayable; a second finish asks for no unlock moment',
    runEvent(r, EV_ENTER_TUTORIAL) && r.state === S_TUTORIAL && runEvent(r, EV_EXIT) && r.state === S_HUB && !r.diveUnlocked);
  assert('run: the open dive starts Shallows 1-1', runEvent(r, EV_ENTER_DIVE) && r.state === S_BIOME && r.level === 1 && stageLabel(r) === 'Shallows 1-1');
  assert('run: biome levels are generated with a per-dive seed', levelSpec(r).kind === 'generated' && levelSpec(r).levelIndex === 0 && !isSafeState(r));
  const seed1 = levelSpec(r).seed;
  runEvent(r, EV_EXIT);
  assert('run: exit of 1-1 goes to 1-2', r.state === S_BIOME && r.level === 2 && stageLabel(r) === 'Shallows 1-2' && levelSpec(r).levelIndex === 1);
  assert('run: all levels of a dive share its seed', levelSpec(r).seed === seed1);
  runEvent(r, EV_EXIT);
  assert('run: exit of 1-2 goes to 1-3', r.state === S_BIOME && r.level === 3 && stageLabel(r) === 'Shallows 1-3');
  assert('run: exit of 1-3 shows the biome-end screen', runEvent(r, EV_EXIT) && r.state === S_END && r.levelsCleared === BIOME_LEVELS && levelSpec(r).kind === 'end');
  assert('run: the end screen only reacts to continue', !runEvent(r, EV_EXIT) && !runEvent(r, EV_ENTER_DIVE) && r.state === S_END);
  assert('run: continue on the end screen returns to the hub', runEvent(r, EV_CONTINUE) && r.state === S_HUB && r.level === 0);

  // second dive: the tutorial is skipped, and the dive gets a new seed
  runEvent(r, EV_ENTER_DIVE);
  assert('run: with the tutorial done the hub entrance goes straight to Shallows 1-1', r.state === S_BIOME && r.level === 1 && r.levelsCleared === 0);
  assert('run: a new dive uses a new level seed', levelSpec(r).seed !== seed1);

  // death returns to the hub from anywhere
  let ok = true;
  for (const setup of [
    (x) => { x.state = S_TUTORIAL; },
    (x) => { x.state = S_BIOME; x.level = 1; },
    (x) => { x.state = S_BIOME; x.level = 3; },
    (x) => { x.state = S_HUB; },
  ]) {
    const d = createRun(7, { tutorialDone: true });
    setup(d);
    const deaths = d.deaths;
    if (!runEvent(d, EV_DEATH) || d.state !== S_HUB || d.level !== 0 || d.deaths !== deaths + 1 || d.levelsCleared !== 0) ok = false;
  }
  assert('run: death from the tutorial, any biome level or the hub returns to the hub', ok);

  // determinism: the same run seed and dive count give the same level seeds
  const a = createRun(99, { tutorialDone: true }), b = createRun(99, { tutorialDone: true });
  runEvent(a, EV_ENTER_DIVE); runEvent(b, EV_ENTER_DIVE);
  assert('run: level seeds are deterministic per (run seed, dive)', levelSpec(a).seed === levelSpec(b).seed);
  runEvent(a, EV_DEATH); runEvent(a, EV_ENTER_DIVE);
  assert('run: the second dive of a run differs from the first', levelSpec(a).seed !== levelSpec(b).seed);

  // quick restart: the same run state as death -> hub -> dive (seeds aside)
  const mk = () => { const x = createRun(5, { tutorialDone: true, juiceStart: 3, rest: true }); runEvent(x, EV_ENTER_DIVE); runEvent(x, EV_EXIT);
    x.shells = 40; x.items = ['lantern', 'siphon']; x.shopAggro = true; x.shopAggroWhy = 'theft'; x.juice = 9; x.hotbar = { slots: ['ink'] }; x.dive.kills = 4; x.dive.time = 33; return x; };
  const viaHub = mk(), quick = mk();
  runEvent(viaHub, EV_DEATH, 'crab'); runEvent(viaHub, EV_ENTER_DIVE);
  assert('run: quick restart applies in a dive', canQuickRestart(quick) && runEvent(quick, EV_RESTART, 'crab'));
  const strip = (x) => { const o = { ...x, dive: { ...x.dive } }; delete o.diveSeed; return JSON.stringify(o); };
  assert('run: quick restart (death) equals death -> hub -> dive', strip(quick) === strip(viaHub), strip(quick) + ' vs ' + strip(viaHub));
  assert('run: quick restart starts Shallows 1-1 with a fresh dive', quick.state === S_BIOME && quick.level === 1 && quick.shells === 0 && quick.items.length === 0 && !quick.shopAggro && quick.juice === 3 && quick.hotbar === null && quick.deaths === 1 && quick.last === null && quick.dive.kills === 0);
  const alive = mk(), d0 = alive.deaths;
  runEvent(alive, EV_RESTART);
  assert('run: quick restart from the pause menu (alive) is not a death', alive.deaths === d0 && alive.state === S_BIOME && alive.level === 1 && alive.items.length === 0);
  const seeded = mk(), s0 = seeded.diveSeed;
  runEvent(seeded, EV_RESTART, 'crab', { sameSeed: true });
  assert('run: a seeded quick restart replays the dive seed; an unseeded one gets a new seed', seeded.diveSeed === s0 && quick.diveSeed !== s0);
  const rest = mk(); rest.state = S_REST;
  assert('run: quick restart works from the rest grotto too', runEvent(rest, EV_RESTART, 'crab') && rest.state === S_BIOME && rest.level === 1);
  const hubR = createRun(5, { tutorialDone: true });
  assert('run: no quick restart in the hub or on the end screen', !runEvent(hubR, EV_RESTART) && (hubR.state = S_END, !runEvent(hubR, EV_RESTART)));

  // death screen titles: one per cause; only the Beholder and unknown keep 'The dark took you'
  const missing = Object.keys(CAUSE_TEXT).filter((k) => !DEATH_TITLE[k]);
  assert('run: every CAUSE_TEXT key has a death title' + (missing.length ? ' (missing ' + missing.join() + ')' : ''), missing.length === 0);
  assert('run: every CAUSE_NAME key has a death title', Object.keys(CAUSE_NAME).every((k) => DEATH_TITLE[k]));
  const dark = Object.keys(DEATH_TITLE).filter((k) => DEATH_TITLE[k] === 'The dark took you').sort().join();
  assert('run: only the Beholder and unknown keep "The dark took you"', dark === 'beholder,unknown');
  assert('run: death titles are cause specific', deathTitle('spikes') === 'Impaled' && deathTitle('rock') === 'Crushed' && deathTitle('shopkeeper') === "Shopkeeper's justice" && deathTitle('nonsense') === 'The dark took you' && deathTitle(undefined) === 'The dark took you');
}
