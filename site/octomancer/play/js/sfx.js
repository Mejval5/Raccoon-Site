// Code-synthesised sound effects (OVERNIGHT.md §2 Audio: "SFX are
// synthesised in code"; §4 S-1's "if time is left" list: dash, hurt,
// bomb). No samples, no library: plain WebAudio oscillators/noise through
// the shared AudioContext and master gain from audio.js, so mute covers SFX
// too. Every play is a no-op until the AudioContext exists (first input),
// matching "nothing audio is requested before the first input".
//
// Night batch 5 (IMPROVEMENTS.md): a natural palette, a voice limiter.
// - Sounds are water, shell, wood and clay: sine blips that bend upward (bubbles), filtered noise (water pushed, ink, sand),
//   short sines with an inharmonic partial (wood and shell knocks). No square waves; the one sawtooth left is the eel's shock,
//   behind a lowpass.
// - Every layer plays on a pooled voice from audio.js (MAX_VOICES; the one nearest its end is stolen past that). Only the
//   source node is new per layer, and second notes are scheduled on the audio clock (no timers).
// - A per-name cooldown (COOL, 40-80 ms) drops a repeat that comes too soon: a held Ink Jet, a chain or four players blasting
//   at once never machine-gun the same sound. Pitch and gain jitter (JIT) keep the repeats from sounding identical.
// - Nothing is scheduled while the context is suspended (a pad-only player before the first real gesture): those plays are
//   skipped, so they do not all go off at once when it resumes.

/** Per-name cooldown in s: a second call sooner than this is dropped. */
export const COOL = {
  chime: 0.06, shell: 0.04, inkJet: 0.06, inkPuff: 0.08, hurt: 0.08, thud: 0.06, dash: 0.06, slurp: 0.05, emptyJar: 0.08,
  chainTick: 0.04, crunch: 0.04, bomb: 0.05, potBreak: 0.05, harpoon: 0.06, splat: 0.08, impale: 0.08, zap: 0.06,
  dreadSwell: 1, beholderArrive: 1,
};
export const COOL_DEFAULT = 0.05;
/** Pitch / gain jitter (a fraction either way) on the sounds that repeat most. */
export const JIT = { chime: [0.08, 0.1], inkJet: [0.07, 0.15], hurt: [0.06, 0.15], thud: [0.08, 0.15] };
export const SHELL_RUN = 0.6; // s: shell pickups closer than this climb a step each

/**
 * One layer on a pooled voice. `o`: { noise?: true, type?: 'sine'|'triangle'|'sawtooth', freq, sweep?, bend? (s to reach
 * sweep, default dur), dur, gain, attack? (s), filter? BiquadFilterType, ffreq?, fsweep?, q?, delay? (s), ui?, kind? }.
 * Returns the source, or null when no voice / no noise buffer is there.
 */
export function layer(audio, ctx, o, rnd = Math.random) {
  const v = audio.voice(!!o.ui);
  if (!v) return null;
  const t = v.t0 + (o.delay || 0), dur = o.dur, end = t + dur;
  let s;
  if (o.noise) {
    const buf = audio.noise();
    if (!buf) return null;
    s = ctx.createBufferSource();
    s.buffer = buf;
  } else {
    s = ctx.createOscillator();
    s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.freq, t);
    if (o.sweep) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.sweep), t + (o.bend || dur));
  }
  const f = v.filter;
  f.type = o.filter || 'lowpass';
  f.frequency.cancelScheduledValues(v.t0);
  f.frequency.setValueAtTime(o.ffreq || 18000, t);
  if (o.fsweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.fsweep), end);
  f.Q.cancelScheduledValues(v.t0);
  f.Q.setValueAtTime(o.q !== undefined ? o.q : (f.type === 'lowpass' ? 0 : 0.8), t);
  const g = v.gain.gain;
  g.cancelScheduledValues(v.t0);
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + Math.min(dur * 0.5, o.attack || 0.004));
  g.exponentialRampToValueAtTime(0.0001, end);
  s.connect(f);
  audio.track(s, o.kind || (o.noise ? 'noise' : 'tone'), null, v);
  if (o.noise) {
    const len = buf_len(s.buffer);
    s.start(t, rnd() * Math.max(0, len - dur - 0.05), dur + 0.02);
  } else {
    s.start(t);
    s.stop(end + 0.02);
  }
  v.until = end + 0.02;
  return s;
}
function buf_len(b) { return b && b.duration ? b.duration : 2; }

/** A per-name cooldown gate on a ms clock: `ok(name)` is false (and stamps nothing) for a repeat inside its cooldown. */
export function makeGate(now, table = COOL, dflt = COOL_DEFAULT) {
  const last = Object.create(null);
  return {
    ok(name) {
      const t = now(), c = (table[name] !== undefined ? table[name] : dflt) * 1000, l = last[name];
      if (l !== undefined && t - l < c) return false;
      last[name] = t;
      return true;
    },
    last,
  };
}

/**
 * @param {{getCtx:()=>AudioContext|null, getDest:()=>AudioNode|null, canPlay?:()=>boolean, voice:Function, noise:Function, track:Function}} audio
 * an accessor set rather than the raw context, since the context is created
 * lazily on the first input and may not exist yet when sfx calls arrive.
 * @param {{ now?: () => number, rnd?: () => number }} [opts] test seams: a ms clock and the random source for the jitter.
 */
export function createSfx(audio, opts = {}) {
  const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const rnd = opts.rnd || Math.random;
  const gate = makeGate(now);
  let held = false; // r41: nothing new sounds while a level is torn down and the next one built
  let ctx = null;
  const L = (o) => layer(audio, ctx, o, rnd);
  const j = (p) => 1 + (rnd() * 2 - 1) * p;
  function play(name, fn) {
    if (held) return;
    const c = audio.getCtx();
    if (!c || !audio.getDest()) return; // no input yet: silently skip, never throw
    if (audio.canPlay && !audio.canPlay()) return; // suspended (or closed): skip, never queue
    if (!gate.ok(name)) return;
    ctx = c;
    try { fn(); } catch (e) { /* never let a bad SFX crash the frame */ }
  }
  /** A slow swell: a low sine (and its fifth) that rises in over `rise` s and fades over `fall` s (the Beholder's dread). */
  function swell(freq, gain, rise, fall) {
    for (const [f, gm] of [[freq, 1], [freq * 1.5, 0.45]]) L({ freq: f * 0.94, sweep: f, bend: rise, dur: rise + fall, gain: gain * gm, attack: rise });
  }
  /** A small rising bubble: a sine blip that bends up fast (bubbles rise in pitch as they leave). */
  function bubble(f, gain, delay = 0, dur = 0.05) { L({ freq: f, sweep: f * 1.9, bend: dur * 0.6, dur, gain, attack: 0.003, ffreq: 3000, delay }); }
  let shellStep = 0, shellAt = -1e9;
  return {
    /** Time pressure: the warning (a long, low swell) and the Beholder's entry (deeper, quicker). */
    dreadSwell() { play('dreadSwell', () => swell(55, 0.2, 2.4, 2.2)); },
    beholderArrive() { play('beholderArrive', () => { swell(41, 0.26, 0.6, 1.8); L({ noise: true, ffreq: 300, fsweep: 40, dur: 0.9, gain: 0.12 }); }); },
    /** Water shoved aside: a band of noise that opens upward (was a sawtooth sweep). */
    dash() { play('dash', () => L({ noise: true, filter: 'bandpass', ffreq: 380, fsweep: 1500, q: 1.1, dur: 0.17, gain: 0.3, attack: 0.025 })); },
    /** Pickups, buys, casts, quests: a soft bubble-pop, a sine that bends up, a breath of noise and a smaller second bubble;
     *  pitch +-8% each time (was two triangle notes, 660 then 990 Hz). */
    chime() {
      play('chime', () => {
        const p = j(JIT.chime[0]), g = j(JIT.chime[1]);
        L({ freq: 480 * p, sweep: 1150 * p, bend: 0.05, dur: 0.11, gain: 0.13 * g, attack: 0.003, ffreq: 3200 });
        L({ noise: true, filter: 'bandpass', ffreq: 2400 * p, q: 1.5, dur: 0.02, gain: 0.05 * g });
        L({ freq: 700 * p, sweep: 1600 * p, bend: 0.04, dur: 0.08, gain: 0.06 * g, delay: 0.07, ffreq: 3600 });
      });
    },
    /** A shell picked up: a little shell-on-shell tick that climbs a semitone for each pickup within SHELL_RUN s (up to 10). */
    shell() {
      play('shell', () => {
        const t = now();
        shellStep = t - shellAt < SHELL_RUN * 1000 ? Math.min(10, shellStep + 1) : 0;
        shellAt = t;
        const f = 820 * Math.pow(2, shellStep / 12) * j(0.02);
        L({ freq: f, sweep: f * 0.92, dur: 0.06, gain: 0.09, attack: 0.002, ffreq: 4000 });
        L({ freq: f * 2.76, dur: 0.03, gain: 0.03, attack: 0.001 });
        L({ noise: true, filter: 'bandpass', ffreq: 3500, q: 2, dur: 0.012, gain: 0.03 });
      });
    },
    /** Test hook: the shell run's step now (0 = the first of a run). */
    shellStep() { return shellStep; },
    /** r41: while held, every effect is a no-op (the fade between two levels). */
    hold(on) { held = !!on; },
    /** r41: level teardown: stop every live source (later notes are scheduled sources too, so they go with them). */
    stopAll() { audio.stopSfx(); },
    /** Section 14: the ink jet, a short wet squirt: noise closing down plus a falling sine, jittered. */
    inkJet() {
      play('inkJet', () => {
        const p = j(JIT.inkJet[0]), g = j(JIT.inkJet[1]);
        L({ noise: true, filter: 'bandpass', ffreq: 1500 * p, fsweep: 550 * p, q: 0.9, dur: 0.09, gain: 0.2 * g, attack: 0.004 });
        L({ freq: 360 * p, sweep: 150 * p, dur: 0.07, gain: 0.06 * g, ffreq: 1200 });
      });
    },
    /** Ink Cloud: a soft, low puff of ink. */
    inkPuff() {
      play('inkPuff', () => {
        L({ noise: true, ffreq: 600, fsweep: 40, dur: 0.45, gain: 0.3 });
        L({ freq: 160, sweep: 55, dur: 0.4, gain: 0.22 });
      });
    },
    /** A fish juice droplet goes into the jar: a quick rising slurp. */
    slurp() {
      play('slurp', () => {
        L({ freq: 260, sweep: 620, dur: 0.09, gain: 0.1 });
        L({ freq: 380, sweep: 820, dur: 0.07, gain: 0.07, delay: 0.045 });
      });
    },
    /** A cast with too little juice: two hollow knocks on an empty clay jar (was two square clunks). */
    emptyJar() {
      play('emptyJar', () => {
        L({ freq: 230, sweep: 200, dur: 0.09, gain: 0.14, attack: 0.002, ffreq: 1100 });
        L({ freq: 230 * 2.3, dur: 0.04, gain: 0.03, attack: 0.001, ffreq: 2000 });
        L({ freq: 205, sweep: 180, dur: 0.11, gain: 0.12, attack: 0.002, delay: 0.09, ffreq: 1000 });
      });
    },
    /** Hurt: a muffled low thump and a short burst of three bubbles, jittered (was a square 180 -> 70 Hz buzz). */
    hurt() {
      play('hurt', () => {
        const p = j(JIT.hurt[0]), g = j(JIT.hurt[1]);
        L({ freq: 150 * p, sweep: 52 * p, dur: 0.2, gain: 0.34 * g, attack: 0.004, ffreq: 420 });
        L({ noise: true, ffreq: 500, fsweep: 120, dur: 0.12, gain: 0.12 * g });
        for (let k = 0; k < 3; k++) bubble((520 + rnd() * 380) * p, 0.04 * g, 0.05 + k * 0.035 + rnd() * 0.02, 0.045);
      });
    },
    /** V2-PLAN 14: something hit the dead body (and grabs, drops, bumps): a soft low thump, jittered. */
    thud() {
      play('thud', () => {
        const p = j(JIT.thud[0]), g = j(JIT.thud[1]);
        L({ freq: 115 * p, sweep: 50 * p, dur: 0.13, gain: 0.26 * g, attack: 0.003, ffreq: 320 });
        L({ noise: true, ffreq: 300, dur: 0.04, gain: 0.08 * g });
      });
    },
    /** V2-PLAN 16: a boulder flattening the octopus: a low thud, a wet crunch, a squelch and a few crackling pops after it. */
    splat() {
      play('splat', () => {
        L({ freq: 120, sweep: 34, dur: 0.32, gain: 0.5 });
        L({ noise: true, ffreq: 2600, fsweep: 40, dur: 0.4, gain: 0.5 });
        L({ noise: true, filter: 'bandpass', ffreq: 900, fsweep: 300, q: 1.5, dur: 0.12, gain: 0.22 });
        for (let k = 1; k <= 3; k++) L({ noise: true, ffreq: 3200, fsweep: 40, dur: 0.06, gain: 0.2, delay: (60 * k + k * k * 12) / 1000 });
      });
    },
    /** V2-PLAN 16: skewered on spikes: a sharp stab of noise and a short wet thunk (was sawtooth + square). */
    impale() {
      play('impale', () => {
        L({ noise: true, filter: 'bandpass', ffreq: 2600, fsweep: 900, q: 3, dur: 0.09, gain: 0.3 });
        L({ freq: 150, sweep: 55, dur: 0.2, gain: 0.3, ffreq: 500 });
        L({ noise: true, ffreq: 1800, fsweep: 40, dur: 0.14, gain: 0.2 });
      });
    },
    /** Chain reactions (chain.js): a link going off: a hollow wood knock that rises with the chain's generation (depth 1..8). */
    chainTick(depth = 1) {
      const f = 380 * Math.pow(1.09, Math.min(8, Math.max(1, depth)) - 1);
      play('chainTick', () => {
        L({ freq: f, sweep: f * 0.8, dur: 0.07, gain: 0.14, attack: 0.002, ffreq: 2400 });
        L({ freq: f * 2.7, dur: 0.025, gain: 0.04, attack: 0.001 });
      });
    },
    /** V2-PLAN 16: an electric shock (the eel): a buzz that falls away, behind a closing lowpass, and a crackle. */
    zap() {
      play('zap', () => {
        L({ type: 'sawtooth', freq: 900, sweep: 70, dur: 0.28, gain: 0.16, ffreq: 2200, fsweep: 400 });
        L({ noise: true, ffreq: 4200, fsweep: 40, dur: 0.2, gain: 0.18 });
      });
    },
    /** Fragile terrain: a fish-bone block crumbling: a dry crunch, a bony tick and three crumbs after it; a dash through it
     *  adds a low knock. */
    crunch(dash = false) {
      play('crunch', () => {
        L({ noise: true, ffreq: 3400, fsweep: 40, dur: 0.12, gain: 0.26 });
        L({ noise: true, filter: 'bandpass', ffreq: 1800 + rnd() * 500, q: 4, dur: 0.02, gain: 0.08 });
        if (dash) L({ freq: 170, sweep: 80, dur: 0.1, gain: 0.2, ffreq: 600 });
        for (let k = 1; k <= 3; k++) L({ noise: true, ffreq: 4200 - k * 600, fsweep: 40, dur: 0.03, gain: 0.14, delay: (22 * k + rnd() * 18) / 1000 });
      });
    },
    /** A blast: a low boom under a closing roar, then a rush of bubbles. `gain` scales it (0..1.5; #4's far / small blasts). */
    bomb(gain = 1) {
      const k = Math.max(0, Math.min(1.5, Number(gain) || 0));
      if (k <= 0) return;
      play('bomb', () => {
        L({ noise: true, ffreq: 1200, fsweep: 40, dur: 0.35, gain: 0.35 * k });
        L({ freq: 90, sweep: 40, dur: 0.3, gain: 0.3 * k });
        for (let i = 0; i < 3; i++) bubble(420 + rnd() * 500, 0.03 * k, 0.14 + i * 0.07 + rnd() * 0.04, 0.06);
      });
    },
    /** A clay pot broken: a dull clay knock, the shatter and three shards ticking after it. */
    potBreak() {
      play('potBreak', () => {
        L({ freq: 300, sweep: 240, dur: 0.05, gain: 0.14, attack: 0.002, ffreq: 1500 });
        L({ noise: true, filter: 'bandpass', ffreq: 3000, q: 1.2, dur: 0.12, gain: 0.18 });
        for (let i = 0; i < 3; i++) L({ noise: true, filter: 'bandpass', ffreq: 4000 + rnd() * 1000, q: 3, dur: 0.02, gain: 0.08, delay: 0.03 + i * 0.035 + rnd() * 0.015 });
      });
    },
    /** A harpoon launched: a hiss through the water and the knock of the launch (main.js used the bomb for it). */
    harpoon() {
      play('harpoon', () => {
        L({ noise: true, filter: 'bandpass', ffreq: 2200, fsweep: 700, q: 2, dur: 0.14, gain: 0.2, attack: 0.008 });
        L({ freq: 180, sweep: 120, dur: 0.06, gain: 0.12, attack: 0.002, ffreq: 800 });
      });
    },
  };
}
