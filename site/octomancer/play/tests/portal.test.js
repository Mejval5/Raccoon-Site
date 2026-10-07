// Round 44: the portals. The state machine (Rise forward only when a portal appears, Bounce from swimming near returns straight to idle, the
// entry: Bounce then the Rise reversed as the swallow), every frame seated on the floor line by its stored visible bottom, the tint on the light
// arms only, the two sheets (normal and DPR 2 desktop, each under 300 KB) and the rule that picks one. The real-browser side (the octopus pulled in,
// the fade no earlier than BOUNCE_S + RISE_S after the touch) is tests/entry-cdp.js.
import {
  portalFrame, portalEnter, portalMode, portalTouch, setPortalHold, resetPortalStates, drawWhirlpoolSprite, whirlpoolReady,
  BOUNCE_S, RISE_S, ENTRY_S, PORTAL_SQUASH, portalCenter, idleHeightPx, PORTAL_SEAT,
} from '../js/portal-draw.js';
import { ensureV2Art, artUrl, pickWhirlSheet, whirlpoolSheetKey, WHIRLPOOL_HI_FILE } from '../js/v2-art.js';
import { WHIRL_SHEETS } from '../js/whirlpool-meta.js';

const IDLE = (f) => f >= 0 && f < 5, BOUNCE = (f) => f >= 5 && f < 15, RISE = (f) => f >= 15 && f < 21;

export async function runPortalTests(assert) {
  setPortalHold(false); resetPortalStates();
  assert('portal: the entry sequence is the Bounce (10 frames) plus the Rise (6 frames) at 12 fps = 0.83 s + 0.5 s', Math.abs(BOUNCE_S - 10 / 12) < 1e-9 && Math.abs(RISE_S - 0.5) < 1e-9 && Math.abs(ENTRY_S - 1.3333333) < 1e-5);

  // a portal appears: the Rise plays forward once, then the idle loop
  {
    const seen = []; for (let t = 10; t < 11.2; t += 0.02) seen.push(portalFrame('appear', t, false, true));
    const riseFrames = seen.filter(RISE), idxEnd = seen.findIndex((f) => !RISE(f));
    assert('portal: a new portal plays the Rise forward once (frames 15 -> 20), then the idle loop', riseFrames.length > 20 && seen[0] === 15 && seen.slice(0, idxEnd).every((f, i, a) => i === 0 || f >= a[i - 1]) && seen[idxEnd - 1] === 20 && seen.slice(idxEnd).every(IDLE));
    assert('portal: ... it takes the Rise 0.5 s', Math.abs(idxEnd * 0.02 - RISE_S) < 0.05);
  }
  // swimming near without going in: the Bounce once, then straight back to the idle loop (no Rise), and no second Bounce until the octopus has gone away
  {
    for (let t = 20; t < 20.7; t += 0.02) portalFrame('near', t, false, true); // appear
    const seq = [];
    for (let t = 21; t < 23; t += 0.02) seq.push(portalFrame('near', t, true, false)); // hovering near for 2 s
    const firstIdle = seq.findIndex((f, i) => i > 0 && IDLE(f));
    assert('portal: swimming near starts the Bounce at its first frame', seq[0] === 5);
    assert('portal: ... the Bounce plays all 10 frames in order, then the idle loop at once (no Rise frame anywhere)', seq.slice(0, firstIdle).every(BOUNCE) && seq[firstIdle - 1] === 14 && seq.slice(firstIdle).every(IDLE) && !seq.some(RISE));
    assert('portal: ... hovering on does not bounce again', seq.slice(firstIdle).every(IDLE));
    for (let t = 23; t < 23.5; t += 0.02) portalFrame('near', t, false, true); // goes away
    const again = portalFrame('near', 23.6, true, false);
    assert('portal: ... after the octopus has been away, coming near bounces again', again === 5);
  }
  // going in: the Bounce, forced, then the Rise reversed as the swallow, then the last frame stays
  {
    for (let t = 30; t < 30.7; t += 0.02) portalFrame('enter', t, false, true);
    portalEnter('enter', 31);
    const seq = []; for (let t = 31; t < 31 + ENTRY_S + 0.3; t += 0.01) seq.push([t, portalFrame('enter', t, true, false)]);
    const bounce = seq.filter(([t]) => t < 31 + BOUNCE_S - 0.011).map((x) => x[1]), swallow = seq.filter(([t]) => t > 31 + BOUNCE_S + 0.011 && t < 31 + ENTRY_S - 0.011).map((x) => x[1]);
    assert('portal: touching a portal forces the Bounce from its first frame', seq[0][1] === 5 && bounce.every(BOUNCE) && bounce[bounce.length - 1] >= 13);
    assert('portal: ... then the swallow: the Rise reversed, 20 -> 15, never forward', swallow.every(RISE) && swallow[0] >= 19 && swallow[swallow.length - 1] <= 16 && swallow.every((f, i, a) => i === 0 || f <= a[i - 1]));
    assert('portal: ... then it stays on the smallest frame', portalMode('enter') === 'gone' && seq[seq.length - 1][1] === 15);
  }
  // the appear clock waits while the new level is held behind the dark screen
  {
    setPortalHold(true);
    const a = portalFrame('held', 50, false, true), b = portalFrame('held', 52, false, true);
    setPortalHold(false);
    const c = portalFrame('held', 53, false, true), d = portalFrame('held', 53.3, false, true), e = portalFrame('held', 54, false, true);
    assert('portal: held behind the dark screen the Rise has not started (first frame), and it starts when the screen is back', a === 15 && b === 15 && c === 15 && d > 15 && IDLE(e));
  }
  { // a portal far off screen is still created (touch), so its Rise happens at the level start and not when it scrolls into view
    resetPortalStates(); portalTouch('far', 60);
    const f = portalFrame('far', 61, false, true);
    assert('portal: a touched portal has its appear clock running even if it is not drawn', IDLE(f));
  }
  assert('portal: the sheet is picked by the rule DPR >= 2 and wider than 900 css px', pickWhirlSheet(2, 1440) === 'hi' && pickWhirlSheet(2, 901) === 'hi' && pickWhirlSheet(2, 900) === 'lo' && pickWhirlSheet(3, 412) === 'lo' && pickWhirlSheet(1, 1920) === 'lo' && pickWhirlSheet(1.5, 1920) === 'lo');

  // ---- the sheets ----
  const lo = WHIRL_SHEETS.lo, hi = WHIRL_SHEETS.hi;
  for (const [k, sh, file] of [['lo', lo, 'whirlpool-sheet.webp'], ['hi', hi, WHIRLPOOL_HI_FILE]]) {
    const img = new Image(); img.src = artUrl(file);
    await new Promise((res) => { img.onload = res; img.onerror = res; });
    const blob = await (await fetch(artUrl(file))).blob();
    assert(`portal: the ${k} sheet is 7 x 3 cells of ${sh.cell} px and under 300 KB (${(blob.size / 1024).toFixed(0)} KB)`, img.naturalWidth === 7 * sh.cell && img.naturalHeight === 3 * sh.cell && blob.size < 300 * 1024);
    assert(`portal: the ${k} sheet's meta has a visible bottom and top for each of the 21 frames inside its cell`, sh.bottoms.length === 21 && sh.tops.length === 21 && sh.bottoms.every((b, i) => b > sh.tops[i] && b <= sh.cell && sh.tops[i] >= 0));
  }
  assert('portal: the big sheet is about 0.55 / 0.30 of the normal one (idle width)', Math.abs(hi.idlePx / lo.idlePx - 0.55 / 0.30) < 0.08);

  // ---- seating and tint, on the real sheet ----
  ensureV2Art();
  await new Promise((res) => { const t0 = performance.now(); const f = () => (whirlpoolReady() || performance.now() - t0 > 6000 ? res() : setTimeout(f, 50)); f(); });
  assert('portal: the sheet is decoded to a bitmap before it is drawn (no first-draw decode)', whirlpoolReady());
  const sh = WHIRL_SHEETS[whirlpoolSheetKey()];
  {
    const calls = [];
    const ctx = { drawImage: (...a) => calls.push(a) };
    let worst = 0, n = 0;
    for (const squash of [PORTAL_SQUASH, 1]) for (let f = 0; f < 21; f++) {
      calls.length = 0;
      drawWhirlpoolSprite(ctx, 300, 500, 120, squash, f, 'none');
      const a = calls[0]; if (!a) continue;
      const dy = a[6], dh = a[8];
      const bottom = dy + (sh.bottoms[f] / sh.cell) * dh; // where this frame's visible bottom lands
      worst = Math.max(worst, Math.abs(bottom - 500)); n++;
    }
    assert(`portal: all 21 frames seat their visible bottom on the same line, lying (squash 0.5) and upright (${n} draws, worst ${worst.toFixed(3)} px off)`, n === 42 && worst < 0.01);
    const spread = Math.max(...sh.bottoms.slice(0, 15)) - Math.min(...sh.bottoms.slice(0, 15));
    assert('portal: the frames really differ in their own bottoms (so seating them by the centre would hover / lift)', spread > 0.08 * sh.cell);
  }
  {
    const draw = (tint) => {
      const c = document.createElement('canvas'); c.width = c.height = sh.cell; const g = c.getContext('2d', { willReadFrequently: true });
      drawWhirlpoolSprite(g, sh.cell / 2, sh.bottoms[0], sh.idlePx, 1, 0, tint); // frame 0 at scale 1, its bottom on row bottoms[0]: the cell is drawn 1:1
      return g.getImageData(0, 0, sh.cell, sh.cell).data;
    };
    const plain = draw('none'), warm = draw('warm'), gold = draw('gold');
    let darkMax = 0, darkN = 0, lightShift = 0, lightN = 0, alphaSame = true;
    for (let i = 0; i < plain.length; i += 4) {
      if (plain[i + 3] !== warm[i + 3]) alphaSame = false;
      if (plain[i + 3] < 250) continue;
      const lum = plain[i] * 0.3 + plain[i + 1] * 0.59 + plain[i + 2] * 0.11;
      const d = Math.max(Math.abs(plain[i] - warm[i]), Math.abs(plain[i + 1] - warm[i + 1]), Math.abs(plain[i + 2] - warm[i + 2]));
      if (lum < 95) { darkMax = Math.max(darkMax, d); darkN++; }
      else if (lum > 190) { lightShift += (warm[i] - warm[i + 2]) - (plain[i] - plain[i + 2]); lightN++; }
    }
    assert(`portal: the warm tint leaves the dark core and dark arms alone (${darkN} dark pixels, largest change ${darkMax})`, darkN > 500 && darkMax <= 2 && alphaSame);
    assert(`portal: ... and moves the light arms towards warm (${lightN} light pixels, mean red-minus-blue +${(lightShift / Math.max(1, lightN)).toFixed(0)})`, lightN > 200 && lightShift / lightN > 40);
    let goldDiff = 0; for (let i = 0; i < gold.length; i += 4) goldDiff += Math.abs(gold[i + 1] - warm[i + 1]);
    assert('portal: the gold tint of Marlo\'s ring differs from the shortcut\'s warm one', goldDiff > 1000);
    resetPortalStates();
  }
  {
    const tileAt = (x, y) => (y >= 10 ? 1 : 0); // a flat floor from row 10
    const pc = portalCenter(tileAt, 5, 9), idleH = idleHeightPx(2.2 * 72, PORTAL_SQUASH) / 72;
    assert('portal: the centre the octopus is pulled to is the middle of the idle whirlpool on the floor', Math.abs(pc.y - (10 + PORTAL_SEAT - idleH / 2)) < 1e-6 && pc.y < 10 && pc.y > 9.2 && Math.abs(pc.x - 5.5) < 1.5);
  }
}
