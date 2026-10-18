// Night batch 5 (IMPROVEMENTS.md): menu sounds. Soft wooden clicks, synthesised like sfx.js (a short sine with an inharmonic
// partial for the knock, a breath of band-passed noise for the contact), on audio.js's small UI voice pool and its own bus:
// at the effects volume, never ducked by the pause (the menus are where you hear them). menu-nav.js calls them for the pad and
// the keyboard; its delegated click / input listeners cover the mouse on #hud.
//   focus   the cursor moved: a tiny dry tick (a fingernail on a bead)
//   confirm a button: a rounder wooden knock with a little ring
//   back    closing / going back: a lower, duller knock
//   page    a journal page or chapter: a soft swish, a leaf turned
//   slider  one notch of a slider: a very short tick whose pitch follows the value

import { layer, makeGate } from './sfx.js';

export const UI_COOL = { focus: 0.03, confirm: 0.06, back: 0.06, page: 0.1, slider: 0.035 };

/** @param {ReturnType<import('./audio.js').createAudio>} audio @param {{ now?: () => number, rnd?: () => number }} [opts] */
export function createUiSfx(audio, opts = {}) {
  const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const rnd = opts.rnd || Math.random;
  const gate = makeGate(now, UI_COOL, 0.04);
  const counts = { focus: 0, confirm: 0, back: 0, page: 0, slider: 0 }; // test hook: calls that got past the gate
  let ctx = null;
  const L = (o) => { o.ui = true; return layer(audio, ctx, o, rnd); };
  function play(name, fn) {
    const c = audio.getCtx();
    if (!c || (audio.canPlay && !audio.canPlay())) return;
    if (!gate.ok(name)) return;
    counts[name]++;
    ctx = c;
    try { fn(); } catch (e) { /* a menu click never throws */ }
  }
  return {
    focus() {
      play('focus', () => {
        const p = 1 + (rnd() * 2 - 1) * 0.03;
        L({ freq: 1250 * p, sweep: 1150 * p, dur: 0.028, gain: 0.05, attack: 0.001, ffreq: 5000 });
        L({ noise: true, filter: 'bandpass', ffreq: 3200, q: 3, dur: 0.01, gain: 0.025 });
      });
    },
    confirm() {
      play('confirm', () => {
        L({ freq: 640, sweep: 600, dur: 0.08, gain: 0.12, attack: 0.002, ffreq: 3000 });
        L({ freq: 640 * 2.71, dur: 0.035, gain: 0.04, attack: 0.001 });
        L({ noise: true, filter: 'bandpass', ffreq: 2200, q: 2, dur: 0.012, gain: 0.04 });
      });
    },
    back() {
      play('back', () => {
        L({ freq: 470, sweep: 400, dur: 0.07, gain: 0.1, attack: 0.002, ffreq: 1400 });
        L({ noise: true, ffreq: 900, dur: 0.015, gain: 0.04 });
      });
    },
    page() { play('page', () => L({ noise: true, filter: 'bandpass', ffreq: 900, fsweep: 2600, q: 0.8, dur: 0.14, gain: 0.1, attack: 0.03 })); },
    /** @param {number} frac the slider's value in 0..1 */
    slider(frac = 0.5) {
      const k = Math.max(0, Math.min(1, Number(frac) || 0));
      play('slider', () => L({ freq: 900 * (0.85 + 0.4 * k), dur: 0.018, gain: 0.04, attack: 0.001, ffreq: 4000 }));
    },
    counts,
  };
}
