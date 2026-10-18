// Night batch 5 (IMPROVEMENTS.md): the sound modules against a fake AudioContext. The voice pool and its cap, the per-name
// cooldown, the jitter, the shell run, the pause / death ducks, the unlock on the first input including a pad press
// (gamepad.js PAD_PRESS) with the context left suspended, and the menu sounds from menu-nav.js.
import { createAudio, MAX_VOICES, UI_VOICES, DUCK_PAUSE, DUCK_DEATH, PAD_PRESS } from '../js/audio.js';
import { createSfx, COOL } from '../js/sfx.js';
import { createUiSfx } from '../js/ui-sfx.js';
import { createMenuNav } from '../js/menu-nav.js';
import { createInput } from '../js/input.js';
import { createGamepad, fakePad } from '../js/gamepad.js';

/** A fake Web Audio context: counts what is made, throws where the real API throws (exp ramps to <= 0, non-finite times,
 *  a source started twice or stopped before its start). `state` starts as given. */
export function fakeAudioContext(log, state = 'running') {
  const chk = (t) => { if (!Number.isFinite(t)) throw new TypeError('non-finite time ' + t); };
  class Param {
    constructor(v) { this.value = v; }
    setValueAtTime(v, t) { chk(t); chk(v); this.value = v; return this; }
    linearRampToValueAtTime(v, t) { chk(t); chk(v); this.value = v; return this; }
    exponentialRampToValueAtTime(v, t) { chk(t); if (!(v > 0)) throw new RangeError('exp ramp to ' + v); this.value = v; return this; }
    setTargetAtTime(v, t, c) { chk(t); chk(v); chk(c); this.value = v; return this; }
    cancelScheduledValues(t) { chk(t); return this; }
  }
  class Node {
    constructor() { log.nodes++; }
    connect(n) { return n; }
    disconnect() {}
  }
  class Src extends Node {
    constructor() { super(); log.sources++; this.started = false; this.ended = null; }
    start(t = 0) { chk(t); if (this.started) throw new Error('InvalidStateError: started twice'); this.started = true; log.started++; }
    stop(t = 0) { chk(t); if (!this.started) throw new Error('InvalidStateError: stop before start'); }
    addEventListener(type, fn) { if (type === 'ended') this.ended = fn; }
  }
  return class FakeAC {
    constructor() { log.contexts++; this.currentTime = 0; this.sampleRate = 4000; this.state = state; this.destination = new Node(); log.ctx = this; }
    resume() { log.resumes++; return Promise.resolve(); }
    createGain() { const n = new Node(); n.gain = new Param(1); return n; }
    createBiquadFilter() { const n = new Node(); n.type = 'lowpass'; n.frequency = new Param(350); n.Q = new Param(1); return n; }
    createOscillator() { const n = new Src(); n.type = 'sine'; n.frequency = new Param(440); return n; }
    createBufferSource() { const n = new Src(); n.buffer = null; n.loop = false; return n; }
    createBuffer(ch, len, sr) { const d = new Float32Array(len); return { duration: len / sr, getChannelData: () => d }; }
    createMediaElementSource() { return new Node(); }
  };
}
const fakeTrack = () => ({ paused: true, currentTime: 0, play() { this.paused = false; return Promise.resolve(); } });
const fakeDoc = () => ({ hidden: false, hasFocus: () => true, addEventListener() {} });
function rig(state = 'running') {
  const log = { contexts: 0, resumes: 0, nodes: 0, sources: 0, started: 0, ctx: null };
  const events = new EventTarget();
  const audio = createAudio({ AudioContext: fakeAudioContext(log, state), events, doc: fakeDoc(), makeTrack: fakeTrack, ext: 'opus' });
  let t = 1000;
  const clock = { now: () => t, add: (ms) => { t += ms; } };
  const sfx = createSfx(audio, { now: clock.now });
  return { log, events, audio, sfx, clock };
}
const ev = (n) => new Event(n);

export function runAudioTests(assert) {
  // --- before any input: nothing exists, nothing throws
  {
    const { log, audio, sfx } = rig();
    let threw = false;
    try { for (const k of Object.keys(sfx)) if (typeof sfx[k] === 'function' && k !== 'stopAll') sfx[k](); } catch (e) { threw = true; }
    assert('audio: before the first input no context exists and no sound call throws', !threw && log.contexts === 0 && !audio.isStarted());
  }

  // --- the voice cap and the cooldown
  {
    const { log, events, audio, sfx, clock } = rig();
    events.dispatchEvent(ev('keydown'));
    const ctx = log.ctx;
    assert('audio: the first key builds the context with the voice pools', log.contexts === 1 && audio.voiceStats().voices === MAX_VOICES && audio.voiceStats().uiVoices === UI_VOICES);
    const nodes0 = log.nodes;
    for (let i = 0; i < 100; i++) sfx.inkJet();
    let st = audio.voiceStats();
    assert('limiter: 100 inkJet calls in one tick start one squirt (its 2 layers), far under the cap', st.oneShots === 2 && st.busy === 2 && log.started === 2);
    assert('limiter: a play makes only its source nodes (the pooled filter / gain are reused)', log.nodes - nodes0 === 2);
    // no cooldown in the way (the clock moves 100 ms per call, the audio clock stands still so nothing ends): the cap holds
    const names = ['inkJet', 'hurt', 'thud', 'chime', 'bomb', 'splat', 'crunch', 'zap', 'dash', 'potBreak'];
    for (let i = 0; i < 100; i++) { clock.add(100); sfx[names[i % names.length]](); }
    st = audio.voiceStats();
    assert('limiter: 100 mixed effects never hold more than MAX_VOICES (' + MAX_VOICES + ') voices or one-shot sources', st.busy <= MAX_VOICES && st.oneShots <= MAX_VOICES && st.stolen > 0, JSON.stringify(st));
    const startedBefore = log.started;
    sfx.chime(); clock.add(10); sfx.chime();
    assert('limiter: two chime calls 10 ms apart start one voice set (the second is dropped)', log.started - startedBefore === 3);
    clock.add(COOL.chime * 1000 + 1); sfx.chime();
    assert('limiter: past its cooldown the chime plays again', log.started - startedBefore === 6);
    assert('limiter: every cooldown is 40-80 ms (the slow Beholder swells aside)', Object.entries(COOL).every(([k, v]) => /dread|beholder/i.test(k) || (v >= 0.04 && v <= 0.08)));
    // steal fades and the stolen sources are dropped: the audio clock moves on, everything ends, the pool is free again
    ctx.currentTime = 10;
    const stolen = audio.voiceStats().stolen;
    clock.add(1000); sfx.thud();
    st = audio.voiceStats();
    assert('limiter: once the audio clock is past their end, voices are free again (no steal), even before their ended events', st.stolen === stolen && st.busy === 2);
    sfx.stopAll();
    assert('audio: stopAll leaves no one-shot source and every voice free', audio.voiceStats().oneShots === 0 && audio.voiceStats().busy === 0);
  }

  // --- jitter and the shell run
  {
    const { log, events, sfx, clock } = rig();
    events.dispatchEvent(ev('keydown'));
    const freqs = new Set();
    const ctx = log.ctx;
    const orig = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => { const o = orig(); const set = o.frequency.setValueAtTime.bind(o.frequency); o.frequency.setValueAtTime = (v, t) => { freqs.add(Math.round(v * 100)); return set(v, t); }; return o; };
    for (let i = 0; i < 6; i++) { clock.add(200); sfx.thud(); }
    assert('jitter: six thuds are not all the same pitch', freqs.size >= 4);
    clock.add(2000); sfx.shell();
    const a = sfx.shellStep();
    clock.add(200); sfx.shell(); clock.add(200); sfx.shell();
    const b = sfx.shellStep();
    clock.add(900); sfx.shell();
    assert('shell: pickups within 0.6 s climb a step each, a pause starts the run again', a === 0 && b === 2 && sfx.shellStep() === 0);
  }

  // --- pause and death ducks
  {
    const { log, events, audio, sfx } = rig();
    events.dispatchEvent(ev('keydown'));
    audio.setSwimIntensity(0.8);
    assert('duck: the swim loop runs while swimming', audio.sources().some((s) => s.kind === 'swim'));
    events.dispatchEvent(ev('pause'));
    let st = audio.voiceStats();
    assert('duck: pause sets the effects duck to ' + DUCK_PAUSE + ' and stops the swim whoosh', Math.abs(st.sfxDuck - DUCK_PAUSE) < 1e-9 && !audio.sources().some((s) => s.kind === 'swim'));
    audio.setSwimIntensity(0.8);
    assert('duck: no swim loop is rebuilt while paused', !audio.sources().some((s) => s.kind === 'swim'));
    assert('duck: the volume slider value is not touched by the duck', audio.busGains().sfxNow === audio.busGains().sfx);
    events.dispatchEvent(ev('resume'));
    audio.setSwimIntensity(0.8);
    st = audio.voiceStats();
    assert('duck: resume lifts it back to 1 and the swim comes back', st.sfxDuck === 1 && audio.sources().some((s) => s.kind === 'swim'));
    events.dispatchEvent(ev('gameover'));
    assert('duck: the death screen ducks the music to ' + DUCK_DEATH, Math.abs(audio.voiceStats().musicDuck - DUCK_DEATH) < 1e-9);
    events.dispatchEvent(ev('restart'));
    assert('duck: a restart lifts the music back', audio.voiceStats().musicDuck === 1);
    // menu clicks keep their own bus: they still get voices while paused
    events.dispatchEvent(ev('pause'));
    const ui = createUiSfx(audio, { now: (() => { let t = 0; return () => (t += 500); })() });
    const s0 = log.started;
    ui.confirm(); ui.focus(); ui.back(); ui.page(); ui.slider(0.3);
    assert('ui-sfx: every menu sound plays (paused, on the UI pool) and never takes a world voice', log.started > s0 && audio.voiceStats().uiBusy <= UI_VOICES && ui.counts.confirm === 1 && ui.counts.slider === 1);
  }

  // --- the resume trigger: a pad press starts the context; a suspended one is retried on later gestures
  {
    const { log, events, audio, sfx } = rig('suspended');
    events.dispatchEvent(ev(PAD_PRESS));
    assert('unlock: the first pad press builds the context and asks it to resume', audio.isStarted() && log.contexts === 1 && log.resumes === 1);
    const s0 = log.started;
    let threw = false;
    try {
      for (const k of Object.keys(sfx)) if (typeof sfx[k] === 'function' && k !== 'stopAll' && k !== 'hold') sfx[k]();
      const ui = createUiSfx(audio); ui.focus(); ui.confirm(); ui.back(); ui.page(); ui.slider(1);
    } catch (e) { threw = true; }
    assert('unlock: with the context suspended no sound call throws and none is scheduled (no burst on resume)', !threw && log.started === s0);
    events.dispatchEvent(ev(PAD_PRESS));
    events.dispatchEvent(ev('keydown'));
    assert('unlock: each later pad press or key retries resume() while it stays suspended', log.resumes === 3 && !audio.voiceStats().unlocked);
    log.ctx.state = 'running';
    events.dispatchEvent(ev('pointerdown'));
    const tries = audio.voiceStats().unlockTries;
    events.dispatchEvent(ev('keydown'));
    assert('unlock: once it runs (and the music plays) the listeners go', audio.voiceStats().unlocked && audio.voiceStats().unlockTries === tries && log.contexts === 1);
    sfx.inkJet();
    assert('unlock: and effects play from then on', log.started > s0);
  }

  // --- gamepad.js fires PAD_PRESS on a fresh press (the smallest hook)
  {
    let n = 0;
    const on = () => n++;
    window.addEventListener(PAD_PRESS, on);
    const input = createInput();
    let state = {};
    const pad = createGamepad(input, { getPads: () => [fakePad(state)] });
    pad.poll(); // connects (what is held now is latched)
    const atConnect = n;
    state = { a: true }; pad.poll();
    const afterPress = n;
    pad.poll(); pad.poll(); // held: no new press
    window.removeEventListener(PAD_PRESS, on);
    assert('unlock: gamepad.js fires ' + PAD_PRESS + ' on a fresh button press, once per press', atConnect === 0 && afterPress === 1 && n === 1);
  }

  // --- menu-nav calls the menu sounds
  {
    const calls = [];
    const ui = { focus: () => calls.push('focus'), confirm: () => calls.push('confirm'), back: () => calls.push('back'), page: () => calls.push('page'), slider: () => calls.push('slider') };
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;width:200px;';
    const mk = (t) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'display:block;width:100px;height:30px'; root.appendChild(b); return b; };
    mk('one'); mk('two');
    const rng = document.createElement('input'); rng.type = 'range'; rng.min = '0'; rng.max = '1'; rng.step = '0.1'; rng.value = '0.5'; rng.style.cssText = 'display:block;width:200px;height:20px';
    root.appendChild(rng);
    document.body.appendChild(root);
    let backs = 0;
    const nav = createMenuNav({ current: () => ({ root, back: () => backs++ }), padMode: () => true, ui });
    nav.sync();
    nav.handle('down');
    assert('menu-nav: a focus move calls ui-sfx.focus', calls.join() === 'focus');
    nav.handle('down'); nav.handle('right');
    assert('menu-nav: a slider notch calls ui-sfx.slider', calls[calls.length - 1] === 'slider');
    nav.handle('up'); nav.handle('confirm'); nav.handle('back');
    assert('menu-nav: A calls confirm and B calls back', calls.slice(-2).join() === 'confirm,back' && backs === 1);
    const own = { root, pad: (a) => a === 'tabnext' };
    const nav2 = createMenuNav({ current: () => own, padMode: () => true, ui });
    nav2.sync(); nav2.handle('tabnext');
    assert('menu-nav: a page turn on a screen with its own selection calls page', calls[calls.length - 1] === 'page');
    root.remove();
  }
}
