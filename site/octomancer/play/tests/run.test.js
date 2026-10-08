// B1-1 run flow tests (run.js): the hub -> tutorial -> Shallows 1-1..1-3 -> end -> hub state machine.
import {
  createRun, runEvent, levelSpec, stageLabel, isSafeState,
  S_HUB, S_TUTORIAL, S_BIOME, S_END, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, EV_CONTINUE, BIOME_LEVELS, CAUSE_TEXT, CAUSE_NAME, DEATH_TITLE, deathTitle,
} from '../js/run.js';

export function runRunTests(assert) {
  // first run: the tutorial is played, then the three levels, then the end screen
  const r = createRun(42, { tutorialDone: false });
  assert('run: starts in the hub with label "Hub"', r.state === S_HUB && stageLabel(r) === 'Hub' && levelSpec(r).kind === 'hub');
  assert('run: hub ignores exit / continue events', !runEvent(r, EV_EXIT) && !runEvent(r, EV_CONTINUE) && r.state === S_HUB);
  assert('run: entering the dive from the hub goes to the tutorial the first time',
    runEvent(r, EV_ENTER_DIVE) && r.state === S_TUTORIAL && stageLabel(r) === 'Tutorial' && levelSpec(r).kind === 'tutorial');
  assert('run: hub and tutorial are safe states (no enemies, no Beholder timer)', isSafeState(r));
  assert('run: tutorial ignores the dive event', !runEvent(r, EV_ENTER_DIVE) && r.state === S_TUTORIAL);
  assert('run: tutorial exit starts Shallows 1-1 and marks the tutorial done',
    runEvent(r, EV_EXIT) && r.state === S_BIOME && r.level === 1 && r.tutorialDone && stageLabel(r) === 'Shallows 1-1');
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

  // death screen titles: one per cause; only the Beholder and unknown keep 'The dark took you'
  const missing = Object.keys(CAUSE_TEXT).filter((k) => !DEATH_TITLE[k]);
  assert('run: every CAUSE_TEXT key has a death title' + (missing.length ? ' (missing ' + missing.join() + ')' : ''), missing.length === 0);
  assert('run: every CAUSE_NAME key has a death title', Object.keys(CAUSE_NAME).every((k) => DEATH_TITLE[k]));
  const dark = Object.keys(DEATH_TITLE).filter((k) => DEATH_TITLE[k] === 'The dark took you').sort().join();
  assert('run: only the Beholder and unknown keep "The dark took you"', dark === 'beholder,unknown');
  assert('run: death titles are cause specific', deathTitle('spikes') === 'Impaled' && deathTitle('rock') === 'Crushed' && deathTitle('shopkeeper') === "Shopkeeper's justice" && deathTitle('nonsense') === 'The dark took you' && deathTitle(undefined) === 'The dark took you');
}
