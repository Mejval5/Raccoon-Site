// Code-synthesised sound effects (OVERNIGHT.md §2 Audio: "SFX are
// synthesised in code"; §4 S-1's "if time is left" list: dash, hurt,
// bomb). No samples, no library: plain WebAudio oscillators/noise through
// the shared AudioContext and master gain from audio.js, so mute covers SFX
// too. Every play is a no-op until the AudioContext exists (first input),
// matching "nothing audio is requested before the first input".

/** @param {AudioContext} ctx @param {GainNode} dest */
function tone(ctx, dest, { freq = 440, dur = 0.12, type = 'sine', gain = 0.25, sweep = null }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweep), ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g).connect(dest);
  osc.start();
  osc.stop(ctx.currentTime + dur + 0.02);
}

/** Short filtered white-noise burst, for the bomb's percussive thump. */
function noiseBurst(ctx, dest, { dur = 0.25, gain = 0.4, filterFreq = 800 }) {
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filter).connect(g).connect(dest);
  src.start();
}

/**
 * @param {{getCtx:()=>AudioContext|null, getDest:()=>AudioNode|null}} audio
 * an accessor pair rather than the raw context, since the context is created
 * lazily on the first input and may not exist yet when sfx calls arrive.
 */
export function createSfx(audio) {
  function play(fn) {
    const ctx = audio.getCtx();
    const dest = audio.getDest();
    if (!ctx || !dest) return; // no input yet: silently skip, never throw
    try { fn(ctx, dest); } catch (e) { /* never let a bad SFX crash the frame */ }
  }
  return {
    dash() { play((ctx, dest) => tone(ctx, dest, { freq: 320, sweep: 720, dur: 0.14, type: 'sawtooth', gain: 0.18 })); },
    /** v2: a purchase or a finished quest, two rising notes. */
    chime() {
      play((ctx, dest) => {
        tone(ctx, dest, { freq: 660, dur: 0.12, type: 'triangle', gain: 0.16 });
        setTimeout(() => play((c, d) => tone(c, d, { freq: 990, dur: 0.18, type: 'triangle', gain: 0.16 })), 90);
      });
    },
    hurt() { play((ctx, dest) => tone(ctx, dest, { freq: 180, sweep: 70, dur: 0.22, type: 'square', gain: 0.22 })); },
    bomb() {
      play((ctx, dest) => {
        noiseBurst(ctx, dest, { dur: 0.35, gain: 0.35, filterFreq: 1200 });
        tone(ctx, dest, { freq: 90, sweep: 40, dur: 0.3, type: 'sine', gain: 0.3 });
      });
    },
  };
}
