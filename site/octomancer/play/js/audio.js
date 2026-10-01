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

import { getMuted, setMuted, getSettings } from './save.js';

const CROSSFADE = 1.0; // seconds, DECISIONS §1 Q7 / OVERNIGHT §2

function pickExt() {
  const probe = document.createElement('audio');
  if (probe.canPlayType('audio/ogg; codecs="opus"')) return 'opus';
  return 'mp3';
}

/** Builds a looping <audio> element for `./audio/<base>.<ext>`, not yet added to the DOM. */
function makeTrack(base, ext) {
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

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null, sfxBus = null; // the settings menu's two volume sliders: music tracks / everything synthesised
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
  let swimFilter = null, swimGain = null;
  let dreadOsc = null, dreadGain = null;

  function fadeGain(node, target) {
    if (!ctx) return;
    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + CROSSFADE);
  }

  function crossfadeTo(which) {
    if (!started || which === current) return;
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
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // unsupported browser: play silently, no crash
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicVol;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxVol;
    sfxBus.connect(master);

    const ext = pickExt();
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

    // M7-2 swim whoosh: a bandpass-filtered noise loop, silent until
    // setSwimIntensity() opens its gain as the octopus speeds up.
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = makeNoiseBuffer(ctx);
    noiseSrc.loop = true;
    swimFilter = ctx.createBiquadFilter();
    swimFilter.type = 'bandpass';
    swimFilter.frequency.value = 500;
    swimFilter.Q.value = 0.7;
    swimGain = ctx.createGain();
    swimGain.gain.value = 0;
    noiseSrc.connect(swimFilter).connect(swimGain).connect(sfxBus);
    noiseSrc.start();

    // M7-2 Beholder drone: a low sine, silent until setBeholderDread() opens
    // its gain as the Beholder closes in.
    dreadOsc = ctx.createOscillator();
    dreadOsc.type = 'sine';
    dreadOsc.frequency.value = 48;
    dreadGain = ctx.createGain();
    dreadGain.gain.value = 0;
    dreadOsc.connect(dreadGain).connect(sfxBus);
    dreadOsc.start();
  }

  // First input, any modality: keydown, pointerdown (mouse and touch alike)
  // or touchstart. `once:true` self-removes each listener after it fires.
  const kickoff = () => start();
  window.addEventListener('keydown', kickoff, { once: true });
  window.addEventListener('pointerdown', kickoff, { once: true });
  window.addEventListener('touchstart', kickoff, { once: true, passive: true });

  // In play and focused: Flûte. Paused, game over or tab unfocused: Medles.
  let playing = true;
  let focused = !document.hidden && document.hasFocus();
  const pick = () => crossfadeTo(playing && focused ? 'flute' : 'medles');
  window.addEventListener('pause', () => { playing = false; pick(); });
  window.addEventListener('gameover', () => { playing = false; pick(); });
  window.addEventListener('resume', () => { playing = true; pick(); });
  window.addEventListener('restart', () => { playing = true; pick(); });
  window.addEventListener('blur', () => { focused = false; pick(); });
  window.addEventListener('focus', () => { focused = true; pick(); });
  document.addEventListener('visibilitychange', () => { focused = !document.hidden && document.hasFocus(); pick(); });

  return {
    isMuted() { return muted; },
    isStarted() { return started; },
    // Accessors (not the raw objects) for sfx.js: the context/gain are
    // created lazily on the first input, so sfx calls before that must see
    // `null` and skip rather than capture a stale `undefined`.
    getCtx() { return ctx; },
    getDest() { return sfxBus; }, // sfx.js plays through the SFX volume bus (which feeds the master / mute gain)
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
    /** Settings menu: volume of the synthesised effects (dash, hurt, bomb, swim whoosh, Beholder drone), 0..1. */
    setSfxVolume(v) {
      sfxVol = Math.max(0, Math.min(1, v));
      if (sfxBus) sfxBus.gain.value = sfxVol;
    },
    /** Test hook: the bus gain nodes' targets and current values (null before the first input creates them). */
    busGains() {
      return { music: musicVol, sfx: sfxVol, musicNow: musicBus ? musicBus.gain.value : null, sfxNow: sfxBus ? sfxBus.gain.value : null, masterNow: master ? master.gain.value : null };
    },
    /** For `__octo` test hooks: play/gameover-driven state without waiting on real audio playback. */
    currentTrack() { return current; },
    /** M7-2 swim whoosh: `frac` is speed/maxSpeed in [0,1]. A no-op before
     * the first input (swimGain doesn't exist yet). */
    setSwimIntensity(frac) {
      if (!swimGain) return;
      const f = Math.max(0, Math.min(1, frac));
      swimGain.gain.setTargetAtTime(f * 0.06, ctx.currentTime, 0.1);
      swimFilter.frequency.setTargetAtTime(300 + f * 900, ctx.currentTime, 0.15);
    },
    /** M7-2 Beholder drone: `frac` is dread intensity in [0,1] (0 = Beholder
     * absent or far away, matching render.js's own dread falloff). */
    setBeholderDread(frac) {
      if (!dreadGain) return;
      const f = Math.max(0, Math.min(1, frac));
      dreadGain.gain.setTargetAtTime(f * 0.16, ctx.currentTime, 0.2);
    },
  };
}
