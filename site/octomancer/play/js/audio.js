// Music and mute (OVERNIGHT.md §2 Audio, §4 track S).
//
// One AudioContext, created only on the first player input (never before:
// autoplay policies aside, §2 says "Nothing audio is requested before the
// first input" and the budgets exclude music from the initial transfer).
// Medles loops during play; Flûte de forêt crossfades in on `pause` and
// `gameover`, Medles crossfades back on `resume` and `restart`. Both tracks
// are `<audio loop>` elements routed through a MediaElementAudioSourceNode
// into a master gain node, so `mute` (persisted via save.js) silences
// everything in one place, music and code-synth SFX alike.
//
// Format choice: `Audio().canPlayType()` picks Ogg Opus over MP3 fallback
// (encode_music.py writes both, ~0.9-1.1MB each, OVERNIGHT.md §2 "one
// format, fetched only after the first input"); only the chosen extension's
// file is ever assigned a `src`, so only it is requested (network-log
// verified in m4/s1 metrics).

import { getMuted, setMuted } from './save.js';

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

export function createAudio() {
  let ctx = null;
  let master = null;
  let medles = null, flute = null;
  let medlesGain = null, fluteGain = null;
  let started = false;
  let muted = getMuted();
  let current = 'medles'; // which track is the crossfade target

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

    const ext = pickExt();
    medles = makeTrack('medles', ext);
    flute = makeTrack('flute', ext);

    const medlesSrc = ctx.createMediaElementSource(medles);
    medlesGain = ctx.createGain();
    medlesGain.gain.value = 1;
    medlesSrc.connect(medlesGain).connect(master);

    const fluteSrc = ctx.createMediaElementSource(flute);
    fluteGain = ctx.createGain();
    fluteGain.gain.value = 0;
    fluteSrc.connect(fluteGain).connect(master);

    medles.play().catch(() => {});
    // resume(): some browsers create the context suspended until a gesture;
    // this call is itself inside the first-input handler, so it is one.
    ctx.resume().catch(() => {});
  }

  // First input, any modality: keydown, pointerdown (mouse and touch alike)
  // or touchstart. `once:true` self-removes each listener after it fires.
  const kickoff = () => start();
  window.addEventListener('keydown', kickoff, { once: true });
  window.addEventListener('pointerdown', kickoff, { once: true });
  window.addEventListener('touchstart', kickoff, { once: true, passive: true });

  window.addEventListener('pause', () => crossfadeTo('flute'));
  window.addEventListener('gameover', () => crossfadeTo('flute'));
  window.addEventListener('resume', () => crossfadeTo('medles'));
  window.addEventListener('restart', () => crossfadeTo('medles'));

  return {
    isMuted() { return muted; },
    isStarted() { return started; },
    // Accessors (not the raw objects) for sfx.js: the context/gain are
    // created lazily on the first input, so sfx calls before that must see
    // `null` and skip rather than capture a stale `undefined`.
    getCtx() { return ctx; },
    getDest() { return master; },
    toggleMute() {
      muted = !muted;
      setMuted(muted);
      if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
      return muted;
    },
    /** For `__octo` test hooks: play/gameover-driven state without waiting on real audio playback. */
    currentTrack() { return current; },
  };
}
