// Code-synthesised sound effects (OVERNIGHT.md §2 Audio: "SFX are
// synthesised in code"; §4 S-1's "if time is left" list: dash, hurt,
// bomb). No samples, no library: plain WebAudio oscillators/noise through
// the shared AudioContext and master gain from audio.js, so mute covers SFX
// too. Every play is a no-op until the AudioContext exists (first input),
// matching "nothing audio is requested before the first input".

/** @param {AudioContext} ctx @param {GainNode} dest */
function tone(audio, ctx, dest, { freq = 440, dur = 0.12, type = 'sine', gain = 0.25, sweep = null }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweep), ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g).connect(dest);
  audio.track(osc, 'tone', [g]);
  osc.start();
  osc.stop(ctx.currentTime + dur + 0.02);
}

/** Short filtered white-noise burst, for the bomb's percussive thump. */
function noiseBurst(audio, ctx, dest, { dur = 0.25, gain = 0.4, filterFreq = 800 }) {
  const src = ctx.createBufferSource();
  src.buffer = audio.noiseBuffer(dur); // shared per duration: no new multi-KB buffer on every blast
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filter).connect(g).connect(dest);
  audio.track(src, 'noise', [filter, g]);
  src.start();
}

/**
 * @param {{getCtx:()=>AudioContext|null, getDest:()=>AudioNode|null}} audio
 * an accessor pair rather than the raw context, since the context is created
 * lazily on the first input and may not exist yet when sfx calls arrive.
 */
export function createSfx(audio) {
  const timers = new Set(); // delayed second notes: cleared on teardown so none rings into the next level
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }
  let held = false; // r41: nothing new sounds while a level is torn down and the next one built
  function play(fn) {
    if (held) return;
    const ctx = audio.getCtx();
    const dest = audio.getDest();
    if (!ctx || !dest) return; // no input yet: silently skip, never throw
    try { fn(ctx, dest, audio); } catch (e) { /* never let a bad SFX crash the frame */ }
  }
  return {
    dash() { play((ctx, dest) => tone(audio, ctx, dest, { freq: 320, sweep: 720, dur: 0.14, type: 'sawtooth', gain: 0.18 })); },
    /** v2: a purchase or a finished quest, two rising notes. */
    chime() {
      play((ctx, dest) => {
        tone(audio, ctx, dest, { freq: 660, dur: 0.12, type: 'triangle', gain: 0.16 });
        later(() => play((c, d) => tone(audio, c, d, { freq: 990, dur: 0.18, type: 'triangle', gain: 0.16 })), 90);
      });
    },
    /** r41: while held, every effect is a no-op (the fade between two levels). */
    hold(on) { held = !!on; },
    /** r41: level teardown: drop pending notes and stop every live source. */
    stopAll() { for (const id of timers) clearTimeout(id); timers.clear(); audio.stopSfx(); },
    /** Section 14: the ink jet, a short wet squirt. */
    inkJet() {
      play((ctx, dest) => {
        noiseBurst(audio, ctx, dest, { dur: 0.08, gain: 0.12, filterFreq: 2200 });
        tone(audio, ctx, dest, { freq: 420, sweep: 180, dur: 0.07, type: 'triangle', gain: 0.07 });
      });
    },
    /** Ink Cloud: a soft, low puff of ink. */
    inkPuff() {
      play((ctx, dest) => {
        noiseBurst(audio, ctx, dest, { dur: 0.45, gain: 0.3, filterFreq: 600 });
        tone(audio, ctx, dest, { freq: 160, sweep: 55, dur: 0.4, type: 'sine', gain: 0.22 });
      });
    },
    /** A fish juice droplet goes into the jar: a quick rising slurp. */
    slurp() {
      play((ctx, dest) => {
        tone(audio, ctx, dest, { freq: 260, sweep: 620, dur: 0.09, type: 'sine', gain: 0.1 });
        later(() => play((c, d) => tone(audio, c, d, { freq: 380, sweep: 820, dur: 0.07, type: 'sine', gain: 0.07 })), 45);
      });
    },
    /** A cast with too little juice: two dull clunks of an empty jar. */
    emptyJar() {
      play((ctx, dest) => {
        tone(audio, ctx, dest, { freq: 150, sweep: 110, dur: 0.08, type: 'square', gain: 0.08 });
        later(() => play((c, d) => tone(audio, c, d, { freq: 130, sweep: 95, dur: 0.1, type: 'square', gain: 0.07 })), 85);
      });
    },
    hurt() { play((ctx, dest) => tone(audio, ctx, dest, { freq: 180, sweep: 70, dur: 0.22, type: 'square', gain: 0.22 })); },
    /** V2-PLAN 14: something hit the dead body: a soft low thump. */
    thud() { play((ctx, dest) => tone(audio, ctx, dest, { freq: 120, sweep: 55, dur: 0.12, type: 'triangle', gain: 0.2 })); },
    bomb() {
      play((ctx, dest) => {
        noiseBurst(audio, ctx, dest, { dur: 0.35, gain: 0.35, filterFreq: 1200 });
        tone(audio, ctx, dest, { freq: 90, sweep: 40, dur: 0.3, type: 'sine', gain: 0.3 });
      });
    },
  };
}
