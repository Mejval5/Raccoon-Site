// Music and mute (OVERNIGHT.md §2 Audio, §4 track S).
//
// One AudioContext, created only on the first player input (never before:
// autoplay policies aside, §2 says "Nothing audio is requested before the
// first input" and the budgets exclude music from the initial transfer).
// Flûte de forêt loops during play; the softer Medles crossfades in on `pause`,
// `gameover` and when the tab loses focus, Flûte crossfades back on `resume`,
// `restart` and refocus (Daniel's call). Both tracks
// are `<audio loop>` elements routed through a MediaElementAudioSourceNode
// into a master gain node, so `mute` (persisted via save.js) silences
// everything in one place, music and code-synth SFX alike.
//
// Format choice: `Audio().canPlayType()` picks Ogg Opus over MP3 fallback
// (encode_music.py writes both, ~0.9-1.1MB each, OVERNIGHT.md §2 "one
// format, fetched only after the first input"); only the chosen extension's
// file is ever assigned a `src`, so only it is requested (network-log
// verified in m4/s1 metrics).
//
// Night batch 5 (IMPROVEMENTS.md): every one-shot effect plays on a pooled voice (a filter and a gain that stay wired to the
// effects bus): MAX_VOICES for the world, UI_VOICES for the menus (their own bus, never ducked). A play takes a free voice or
// steals the one nearest its end (a 12 ms fade, so no click); only the oscillator / buffer source is new per play (Web Audio
// sources are one-shot), never per frame. Pause ducks the effects to DUCK_PAUSE and stops the swim whoosh; the death
// screen ducks the music to DUCK_DEATH (the tracks themselves are untouched). The context unlocks on the first key, click,
// touch or pad press (PAD_PRESS from gamepad.js) and retries resume() on later gestures until it runs: Chrome may not count
// a pad press as a user gesture, so a pad-only player's context can start suspended.

import { getMuted, setMuted, getSettings } from './save.js';

const SWIM_ON = 0.1; // r41: the whoosh loop is only built once the octopus really swims (a slow sink or drift never starts it)
const CROSSFADE = 1.0; // seconds, DECISIONS §1 Q7 / OVERNIGHT §2
export const MAX_VOICES = 24;  // world effect layers alive at once (a 4-player blast, a chain reaction); past it the voice nearest its end is stolen
export const UI_VOICES = 4;    // menu clicks
export const DUCK_PAUSE = 0.3; // the effects while paused
export const DUCK_DEATH = 0.5; // the music while the death screen is up
const STEAL_FADE = 0.012;      // s: a stolen voice fades out this fast before the new layer starts on it
export const PAD_PRESS = 'octo-padpress'; // gamepad.js fires it on a fresh pad press

function pickExt() {
  const probe = document.createElement('audio');
  if (probe.canPlayType('audio/ogg; codecs="opus"')) return 'opus';
  return 'mp3';
}

/** Builds a looping <audio> element for `./audio/<base>.<ext>`, not yet added to the DOM. */
function makeTrackEl(base, ext) {
  const a = document.createElement('audio');
  a.loop = true;
  a.preload = 'auto';
  a.src = `./audio/${base}.${ext}`;
  return a;
}

/** M7-2: a short loop of filtered white noise, source for both the swim
 * whoosh (bandpass sweeping with speed) and cheap enough to build once and
 * reuse via `AudioBufferSourceNode.loop`. */
function makeNoiseBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * @param {{ AudioContext?: Function, events?: EventTarget, doc?: Document, makeTrack?: (base: string, ext: string) => HTMLAudioElement, ext?: string }} [opts]
 * test seams: a fake context class, where the input / pause events arrive (window), the document, the music elements.
 */
export function createAudio(opts = {}) {
  const win = opts.events || window;
  const doc = opts.doc || document;
  const makeTrack = opts.makeTrack || makeTrackEl;
  let ctx = null;
  let master = null;
  let musicBus = null, sfxBus = null; // the settings menu's two volume sliders: music tracks / everything synthesised
  let musicDuck = null, sfxDuck = null, uiBus = null; // after the volume buses: the death / pause ducks; the menu clicks' own bus (sfx volume, never ducked)
  let duckPause = false, duckDeath = false;
  const voices = [], uiVoices = []; // the pools, built in start()
  const stats = { stolen: 0 };
  let musicVol = getSettings().musicVol, sfxVol = getSettings().sfxVol;
  let medles = null, flute = null;
  let medlesGain = null, fluteGain = null;
  let started = false;
  let muted = getMuted();
  let current = 'flute'; // which track is the crossfade target
  // M7-2: two continuous, near-silent-by-default synth layers, gain-driven
  // each frame from main.js rather than one-shot like sfx.js's dash/hurt/
  // bomb. Created lazily in start() alongside the AudioContext, so
  // nothing is requested before the first input either.
  let swimFilter = null, swimGain = null, swimSrc = null;
  let dreadOsc = null, dreadGain = null;
  // r41: every synthesised source (one-shot or looping) is registered here, so a level change can stop and disconnect
  // them all (stopSfx) and a test can list what is still alive. Only the music elements and the master / bus gains outlive a level.
  /** @type {Map<AudioScheduledSourceNode, {kind:string, loop:boolean, nodes:AudioNode[], voice:object|null}>} */
  const live = new Map();
  let noiseBuf = null;
  function untrack(src) {
    const e = live.get(src);
    if (!e) return;
    live.delete(src);
    try { src.disconnect(); } catch (err) { /* already gone */ }
    if (e.voice) { const i = e.voice.srcs.indexOf(src); if (i >= 0) e.voice.srcs.splice(i, 1); return; } // a pooled voice stays wired
    for (const n of e.nodes) { try { n.disconnect(); } catch (err) { /* already gone */ } }
  }
  /** Register a started (or about to start) source with the nodes it feeds (disconnected when it ends or on stopSfx), or with
   *  the pooled voice it plays on (the voice stays wired, only the source goes). */
  function track(src, kind, nodes, loop = false, voice = null) {
    live.set(src, { kind, loop, nodes, voice });
    if (voice) voice.srcs.push(src);
    src.addEventListener('ended', () => untrack(src), { once: true });
    return src;
  }
  function makeVoice(bus) {
    const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = 'lowpass'; filter.frequency.value = 20000; filter.Q.value = 0.0001;
    gain.gain.value = 0;
    filter.connect(gain).connect(bus);
    return { filter, gain, srcs: [], until: 0, t0: 0 };
  }
  /** A voice to play one layer on, ready at `v.t0`: a free one, else the one nearest its end (faded out, its sources stopped). */
  function takeVoice(ui) {
    const pool = ui ? uiVoices : voices;
    if (!ctx || !pool.length) return null;
    const now = ctx.currentTime;
    let pick = null;
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i];
      if (v.until <= now) { pick = v; break; }
      if (!pick || v.until < pick.until) pick = v;
    }
    if (pick.until <= now) { // free: whatever is still listed on it has played out (its ended event is due)
      while (pick.srcs.length) { const s = pick.srcs[0]; untrack(s); if (pick.srcs[0] === s) pick.srcs.shift(); }
    } else { // steal: a quick fade, then its old sources stop
      const g = pick.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + STEAL_FADE);
      while (pick.srcs.length) {
        const s = pick.srcs[0];
        try { s.stop(now + STEAL_FADE + 0.002); } catch (err) { /* already stopped */ }
        untrack(s);
        if (pick.srcs[0] === s) pick.srcs.shift(); // (not tracked: never loop forever)
      }
      pick.t0 = now + STEAL_FADE + 0.003;
      stats.stolen++;
      pick.until = pick.t0 + 0.05; // the caller sets the layer's real end
      return pick;
    }
    pick.t0 = now;
    pick.until = pick.t0 + 0.05; // the caller sets the layer's real end
    return pick;
  }
  function stopSfx() {
    for (const src of [...live.keys()]) {
      try { src.stop(); } catch (err) { /* never started or already stopped */ }
      untrack(src);
    }
    for (const v of voices) { v.until = 0; v.srcs.length = 0; }
    for (const v of uiVoices) { v.until = 0; v.srcs.length = 0; }
    swimSrc = null; swimFilter = null; swimGain = null; dreadOsc = null; dreadGain = null;
  }
  /** Pause: the swim whoosh stops for real (it is built again the next time the octopus swims). */
  function stopSwim() {
    if (!swimSrc) return;
    const s = swimSrc;
    try { s.stop(); } catch (err) { /* already stopped */ }
    untrack(s);
    swimSrc = null; swimFilter = null; swimGain = null;
  }
  function applyDucks() {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (sfxDuck) sfxDuck.gain.setTargetAtTime(duckPause ? DUCK_PAUSE : 1, t, 0.06);
    if (musicDuck) musicDuck.gain.setTargetAtTime(duckDeath ? DUCK_DEATH : 1, t, 0.25);
  }
  /** The swim whoosh loop: at most one, built the first time it is needed (again after a stopSfx). */
  function ensureSwim() {
    if (swimSrc || !ctx || !sfxBus) return;
    if (!noiseBuf) noiseBuf = makeNoiseBuffer(ctx);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    swimFilter = ctx.createBiquadFilter();
    swimFilter.type = 'bandpass';
    swimFilter.frequency.value = 500;
    swimFilter.Q.value = 0.7;
    swimGain = ctx.createGain();
    swimGain.gain.value = 0;
    src.connect(swimFilter).connect(swimGain).connect(sfxBus);
    track(src, 'swim', [swimFilter, swimGain], true);
    src.start();
    swimSrc = src;
  }
  /** The Beholder drone: at most one low sine, built when the Beholder first comes close. */
  function ensureDread() {
    if (dreadOsc || !ctx || !sfxBus) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 48;
    dreadGain = ctx.createGain();
    dreadGain.gain.value = 0;
    o.connect(dreadGain).connect(sfxBus);
    track(o, 'dread', [dreadGain], true);
    o.start();
    dreadOsc = o;
  }

  function fadeGain(node, target) {
    if (!ctx) return;
    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + CROSSFADE);
  }

  function crossfadeTo(which) {
    if (!started || !ctx || which === current) return;
    current = which;
    if (which === 'flute') {
      flute.currentTime = flute.currentTime || 0;
      flute.play().catch(() => {});
      fadeGain(fluteGain, 1);
      fadeGain(medlesGain, 0);
    } else {
      medles.play().catch(() => {});
      fadeGain(medlesGain, 1);
      fadeGain(fluteGain, 0);
    }
  }

  function start() {
    if (started) return;
    started = true;
    const AC = opts.AudioContext || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    if (!AC) return; // unsupported browser: play silently, no crash
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicDuck = ctx.createGain();
    musicDuck.gain.value = duckDeath ? DUCK_DEATH : 1;
    musicDuck.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicVol;
    musicBus.connect(musicDuck);
    sfxDuck = ctx.createGain();
    sfxDuck.gain.value = duckPause ? DUCK_PAUSE : 1;
    sfxDuck.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxVol;
    sfxBus.connect(sfxDuck);
    uiBus = ctx.createGain();
    uiBus.gain.value = sfxVol;
    uiBus.connect(master);
    for (let i = 0; i < MAX_VOICES; i++) voices.push(makeVoice(sfxBus));
    for (let i = 0; i < UI_VOICES; i++) uiVoices.push(makeVoice(uiBus));
    noiseBuf = makeNoiseBuffer(ctx);

    const ext = opts.ext || pickExt();
    medles = makeTrack('medles', ext);
    flute = makeTrack('flute', ext);

    const medlesSrc = ctx.createMediaElementSource(medles);
    medlesGain = ctx.createGain();
    medlesGain.gain.value = 0;
    medlesSrc.connect(medlesGain).connect(musicBus);

    const fluteSrc = ctx.createMediaElementSource(flute);
    fluteGain = ctx.createGain();
    fluteGain.gain.value = 1;
    fluteSrc.connect(fluteGain).connect(musicBus);

    flute.play().catch(() => {});
    // resume(): some browsers create the context suspended until a gesture;
    // this call is itself inside the first-input handler, so it is one.
    ctx.resume().catch(() => {});

    // the swim whoosh and the Beholder drone are built on demand (ensureSwim / ensureDread), not kept running silent
  }

  // First input, any modality: keydown, pointerdown (mouse and touch alike), touchstart, or a pad press (gamepad.js
  // PAD_PRESS). The first one builds the context; each later one retries resume() (and the music's play()) until the
  // context runs and the track plays, then the listeners go. A pad press may not count as a gesture: the context then
  // stays suspended (sfx.js skips every effect meanwhile) until the first key, click or touch.
  const UNLOCK_ON = ['keydown', 'pointerdown', 'touchstart', PAD_PRESS];
  let unlockTries = 0, unlocked = false;
  function release() {
    unlocked = true;
    for (const t of UNLOCK_ON) win.removeEventListener(t, unlock);
  }
  function unlock() {
    if (unlocked) return;
    unlockTries++;
    if (!started) { start(); if (!ctx) { release(); return; } } // (no Web Audio at all: nothing to unlock)
    else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const el = current === 'flute' ? flute : medles;
    if (ctx.state === 'running' && el && !el.paused) { release(); return; }
    if (el && el.paused && unlockTries > 1) el.play().catch(() => {});
  }
  for (const t of UNLOCK_ON) win.addEventListener(t, unlock, t === 'touchstart' ? { passive: true } : false);

  // In play and focused: Flûte. Paused, game over or tab unfocused: Medles.
  let playing = true;
  const hasFocus = () => !doc.hidden && (!doc.hasFocus || doc.hasFocus());
  let focused = hasFocus();
  const pick = () => crossfadeTo(playing && focused ? 'flute' : 'medles');
  win.addEventListener('pause', () => { playing = false; duckPause = true; stopSwim(); applyDucks(); pick(); });
  win.addEventListener('gameover', () => { playing = false; duckDeath = true; applyDucks(); pick(); });
  win.addEventListener('resume', () => { playing = true; duckPause = false; applyDucks(); pick(); });
  win.addEventListener('restart', () => { playing = true; duckPause = false; duckDeath = false; applyDucks(); pick(); });
  win.addEventListener('blur', () => { focused = false; pick(); });
  win.addEventListener('focus', () => { focused = true; pick(); });
  doc.addEventListener('visibilitychange', () => { focused = hasFocus(); pick(); });

  return {
    isMuted() { return muted; },
    isStarted() { return started; },
    // Accessors (not the raw objects) for sfx.js: the context/gain are
    // created lazily on the first input, so sfx calls before that must see
    // `null` and skip rather than capture a stale `undefined`.
    getCtx() { return ctx; },
    getDest() { return sfxBus; }, // sfx.js plays through the SFX volume bus (which feeds the pause duck and the master / mute gain)
    /** True while effects may be scheduled: the context exists and runs (a suspended one would play them all at once later). */
    canPlay() { return !!(ctx && sfxBus && ctx.state === 'running'); },
    /** Night batch 5: a pooled voice for one layer ({filter, gain, t0, until}: schedule from t0, set until to the layer's end), or null. */
    voice(ui = false) { return takeVoice(ui); },
    /** The shared 2 s white-noise buffer (start it at a random offset for variety), or null before the first input. */
    noise() { return noiseBuf; },
    /** Test hook: the pools, the ducks and the unlock. */
    voiceStats() {
      const now = ctx ? ctx.currentTime : 0;
      let busy = 0, uiBusy = 0, oneShots = 0;
      for (const v of voices) if (v.until > now) busy++;
      for (const v of uiVoices) if (v.until > now) uiBusy++;
      for (const e of live.values()) if (!e.loop) oneShots++;
      return { voices: voices.length, uiVoices: uiVoices.length, busy, uiBusy, stolen: stats.stolen, oneShots, duckPause, duckDeath,
        unlocked, unlockTries, state: ctx ? ctx.state : null, sfxDuck: sfxDuck ? sfxDuck.gain.value : null, musicDuck: musicDuck ? musicDuck.gain.value : null };
    },
    toggleMute() {
      muted = !muted;
      setMuted(muted);
      if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
      return muted;
    },
    /** Settings menu: music volume 0..1, applied at once (before the first input it is remembered for start()). */
    setMusicVolume(v) {
      musicVol = Math.max(0, Math.min(1, v));
      if (musicBus) musicBus.gain.value = musicVol;
    },
    /** Settings menu: volume of the synthesised effects (dash, hurt, bomb, swim whoosh, Beholder drone, menu clicks), 0..1. */
    setSfxVolume(v) {
      sfxVol = Math.max(0, Math.min(1, v));
      if (sfxBus) sfxBus.gain.value = sfxVol;
      if (uiBus) uiBus.gain.value = sfxVol;
    },
    /** Test hook: the bus gain nodes' targets and current values (null before the first input creates them). */
    busGains() {
      return { music: musicVol, sfx: sfxVol, musicNow: musicBus ? musicBus.gain.value : null, sfxNow: sfxBus ? sfxBus.gain.value : null, masterNow: master ? master.gain.value : null };
    },
    /** r41: register a synthesised source (sfx.js) so it is stopped on teardown; with `voice`, the pooled voice it plays on. */
    track(src, kind, nodes, voice) { return track(src, kind, nodes || [], false, voice || null); },
    /** r41: a white-noise buffer (the shared one; kept for callers that ask by duration). */
    noiseBuffer() { return noiseBuf; },
    /** r41: level teardown: stop and disconnect every one-shot and looping synthesised source. Music and the master / bus gains stay. */
    stopSfx,
    /** r41 test hook: what is playing now. Synthesised sources (kind, loop) and the two music elements (kind 'music'). */
    sources() {
      const out = [];
      for (const [, e] of live) out.push({ kind: e.kind, loop: e.loop });
      if (started) {
        if (flute && !flute.paused) out.push({ kind: 'music', name: 'flute' });
        if (medles && !medles.paused) out.push({ kind: 'music', name: 'medles' });
      }
      return out;
    },
    /** For `__octo` test hooks: play/gameover-driven state without waiting on real audio playback. */
    currentTrack() { return current; },
    /** M7-2 swim whoosh: `frac` is speed/maxSpeed in [0,1]. A no-op before
     * the first input (swimGain doesn't exist yet) and while paused. */
    setSwimIntensity(frac) {
      if (!ctx) return;
      const f = Math.max(0, Math.min(1, frac));
      if (!swimSrc) { if (f < SWIM_ON || duckPause) return; ensureSwim(); }
      swimGain.gain.setTargetAtTime(f * 0.06, ctx.currentTime, 0.1);
      swimFilter.frequency.setTargetAtTime(300 + f * 900, ctx.currentTime, 0.15);
    },
    /** M7-2 Beholder drone: `frac` is dread intensity in [0,1] (0 = Beholder
     * absent or far away, matching render.js's own dread falloff). */
    setBeholderDread(frac) {
      if (!ctx) return;
      const f = Math.max(0, Math.min(1, frac));
      if (!dreadOsc) { if (f < 0.02) return; ensureDread(); }
      dreadGain.gain.setTargetAtTime(f * 0.16, ctx.currentTime, 0.2);
    },
  };
}
