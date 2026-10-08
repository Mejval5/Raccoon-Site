// Section 14 (2026-10-07): fish juice, the jar, Ink Cloud, enemies losing the octopus in ink, the run's juice, every input
// mapping of the new controls, and switching between two spells (a test-only second row).
import {
  JUICE, SPELLS, START_SPELL, spellById, juiceCap, juiceStart, castsOf, addJuice, jarFull, dropCount, castSpell, registerSpellForTest,
  createJuiceDrops, createInkClouds, CAST_OK, CAST_EMPTY, CAST_NONE, MAX_DROPS,
} from '../js/spells.js';
import { drawJuiceDrops, drawInkClouds, cloudAlpha } from '../js/spells-draw.js';
import { createHotbar, addSpell, selectNext, selectIndex, selectedSpell } from '../js/hotbar.js';
import { createEnemies, setHpMode, PS_PATROL, PS_WINDUP, PS_LUNGE, CS_WALK, CS_PAUSE, CN_CHARGE, CN_RELOAD, MA_GLIDE, MA_TELL, MA_DIVE } from '../js/enemies.js';
import { createOctopus } from '../js/octopus.js';
import { applyCarried } from '../js/items.js';
import { createRun, runEvent, EV_ENTER_DIVE, EV_EXIT, EV_DEATH, S_BIOME, S_REST, S_END } from '../js/run.js';
import { createInput } from '../js/input.js';
import { createTouchUI } from '../js/touch-ui.js';
import { cullReset } from '../js/cull.js';

const DT = 0.02;
const OPEN = { isSolid: () => false, breakTile() {} };
const calm = (o) => { o.invulnTimer = 1e9; return o; };
const run0 = () => ({ juice: 0 });
function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push(k); return k === 'createRadialGradient' || k === 'createLinearGradient' ? grad : undefined; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

export async function runSpellTests(assert) {
  // ---------------------------------------------------------------- data
  assert('spells.json: Ink Cloud is the starting spell, costs 1 cast, 4 s, a jar of 3 casts, a full jar at the start',
    START_SPELL === 'ink-cloud' && spellById('ink-cloud').cost === 1 && spellById('ink-cloud').duration === 4 && JUICE.jarCasts === 3 && JUICE.startCasts === 3
    && SPELLS.length === 5 && juiceCap() === 3 * JUICE.perCast && juiceStart() === juiceCap());
  {
    let lo = 9, hi = 0;
    for (let k = 0; k < 400; k++) { const n = dropCount(1234, k); lo = Math.min(lo, n); hi = Math.max(hi, n); }
    assert('a kill is worth 1 to 3 droplets (deterministic per seed and kill)', lo === 1 && hi === 3 && dropCount(7, 5) === dropCount(7, 5));
  }

  // ---------------------------------------------------------------- the jar
  {
    const r = run0();
    const k = addJuice(r, 999);
    assert('the jar caps at 3 casts', r.juice === juiceCap() && k === juiceCap() && castsOf(r.juice) === 3 && jarFull(r) && addJuice(r, 4) === 0);
    const cl = createInkClouds();
    const ok = castSpell(r, 'ink-cloud', { clouds: cl, x: 5, y: 5, vx: 0, vy: 0 });
    assert('casting Ink Cloud takes one cast of juice and puffs a cloud', ok === CAST_OK && r.juice === juiceCap() - JUICE.perCast && cl.count() === 1);
    r.juice = JUICE.perCast - 1;
    const no = castSpell(r, 'ink-cloud', { clouds: cl, x: 5, y: 5, vx: 0, vy: 0 });
    assert('casting with too little juice fails (the empty jar) and takes nothing', no === CAST_EMPTY && r.juice === JUICE.perCast - 1 && cl.count() === 1);
    assert('an unknown spell does nothing', castSpell({ juice: 99 }, 'nope', { clouds: cl, x: 0, y: 0, vx: 0, vy: 0 }) === CAST_NONE);
  }

  // ---------------------------------------------------------------- droplets: a body leaks them; only the Siphon Shell drinks them
  {
    const drops = createJuiceDrops();
    const o = createOctopus(10, 10); applyCarried(o, ['siphon']);
    drops.leak(10, 11.5, 3, 1.5); // a body 1.5 tiles below
    drops.update(DT, createOctopus(50, 50), OPEN, 99); // far away: the first droplet oozes out, nothing is collected
    const first = drops.count();
    for (let i = 0; i < 40; i++) drops.update(DT, createOctopus(50, 50), OPEN, 99);
    assert('a beaten creature leaks its juice slowly (one droplet at once, the rest over the next seconds)', first === 1 && drops.count() === 2 && drops.leaks() === 1);
    const d = drops.data; let i0 = -1; for (let i = 0; i < MAX_DROPS; i++) if (d.alive[i]) { i0 = i; break; }
    const sp = Math.hypot(d.vx[i0], d.vy[i0]);
    assert('leaked droplets ooze (slow drift), they do not pop out', sp < 0.8);
    for (let i = 0; i < 50; i++) drops.update(DT, createOctopus(50, 50), OPEN, 99);
    let got = 0;
    for (let i = 0; i < 150; i++) { drops.update(DT, o, OPEN, 99); got += drops.events.collected; }
    assert('with the Siphon Shell, droplets within 2 tiles are pulled to the octopus and drunk', o.siphonR === 2 && got === 3 && drops.count() === 0);
    const far = createJuiceDrops(); far.spawn(10, 13.5, 1, 0);
    let g2 = 0; for (let i = 0; i < 100; i++) { far.update(DT, o, OPEN, 99); g2 += far.events.collected; }
    assert('a droplet 3.5 tiles away is not pulled in', g2 === 0 && far.count() === 1);
    const plain = createOctopus(10, 10); applyCarried(plain, []);
    const no = createJuiceDrops(); no.spawn(10, 10.1, 3, 0);
    let g4 = 0; for (let i = 0; i < 100; i++) { no.update(DT, plain, OPEN, 99); g4 += no.events.collected; }
    assert('without the Siphon Shell the octopus cannot drink leaked juice, even swimming right through it', plain.siphonR === 0 && g4 === 0);
    for (let i = 0; i < 100; i++) no.update(DT, plain, OPEN, 99);
    assert('leaked juice dissolves after a few seconds', no.count() === 0);
    const full = createJuiceDrops(); full.spawn(10.2, 10, 2, 0); // (o carries the siphon)
    let g3 = 0; for (let i = 0; i < 60; i++) { full.update(DT, o, OPEN, 0); g3 += full.events.collected; }
    assert('a full jar leaves droplets where they are', g3 === 0 && full.count() === 2);
    const many = createJuiceDrops(); many.spawn(0, 0, MAX_DROPS + 10, 1);
    assert('the droplet pool is fixed: an overflow reuses the oldest', many.count() === MAX_DROPS);
    const wall = { isSolid: (x, y) => y >= 12 };
    const w = createJuiceDrops(); w.spawn(3, 11.5, 4, 0);
    for (let i = 0; i < 150; i++) w.update(DT, createOctopus(40, 0), wall, 99);
    let inRock = 0; for (let i = 0; i < MAX_DROPS; i++) if (w.data.alive[i] && wall.isSolid(w.data.x[i], w.data.y[i])) inRock++;
    assert('droplets settle on rock and never sink into it', inRock === 0 && w.count() === 4);
  }

  // ---------------------------------------------------------------- ink clouds: drift, fade, hiding
  {
    const cl = createInkClouds();
    cl.puff(5, 5, 0, 0, spellById('ink-cloud'));
    for (let i = 0; i < 10; i++) cl.update(DT);
    const r = spellById('ink-cloud').radius;
    assert('the octopus inside the cloud is hidden from every side', cl.hides(5 + 6, 5, 5.3, 5) && cl.hides(5, 5 - 6, 5, 5.3) && cl.inside(5.5, 5));
    assert('a creature whose line of sight passes through the cloud loses the octopus', cl.hides(0, 5, 10, 5) && !cl.hides(0, 5 + r + 1, 10, 5 + r + 1));
    assert('a creature inside the cloud loses the octopus', cl.hides(5.2, 5.2, 12, 9));
    let alive = 0; for (let i = 0; i < 300; i++) { cl.update(DT); if (cl.count()) alive = i; }
    const c = cl.data;
    assert('the cloud lasts its 4 s and is gone after it', alive > 180 && alive < 200 && cl.count() === 0 && !cl.hides(0, 5, 10, 5));
    const c2 = createInkClouds(); c2.puff(5, 5, 6, 0, spellById('ink-cloud'));
    for (let i = 0; i < 100; i++) c2.update(DT);
    assert('the cloud drifts a little (along the caster and up), not far', c2.data.x[0] > 5.05 && c2.data.x[0] < 6 && c2.data.y[0] < 5 && c2.data.y[0] > 4.3);
    assert('the cloud fades over its life', cloudAlpha(0.5, 4) > 0.9 && cloudAlpha(2, 4) > 0.6 && cloudAlpha(3.8, 4) < 0.2);
    for (let k = 0; k < 6; k++) c2.puff(k, 0, 0, 0, spellById('ink-cloud'));
    assert('at most 4 clouds at once (the oldest is replaced)', c2.count() === 4);
  }

  // ---------------------------------------------------------------- enemies lose the octopus in ink
  {
    const ink = createInkClouds();
    const puff = (x, y) => { ink.puff(x, y, 0, 0, spellById('ink-cloud')); ink.update(0.3); };
    // piranha: the same set-up that winds up and lunges without ink (enemies-r35), but the octopus is in a cloud
    {
      const o = calm(createOctopus(3, 2)); const en = createEnemies(); en.setInkClouds(ink); const p = en.spawnAt('piranha', 0, 0);
      puff(3, 2);
      let wound = false;
      for (let i = 0; i < 100; i++) { en.update(DT, i * DT, o, OPEN, []); if (p.st === PS_WINDUP || p.st === PS_LUNGE) wound = true; }
      assert('piranha: an octopus inside an ink cloud is never targeted', !wound);
    }
    {
      const o = calm(createOctopus(3, 2)); const en = createEnemies(); const p = en.spawnAt('piranha', 0, 0);
      const ink2 = createInkClouds(); en.setInkClouds(ink2);
      let lunging = false, aborted = false;
      for (let i = 0; i < 300 && !aborted; i++) {
        en.update(DT, i * DT, o, OPEN, []);
        if (!lunging && p.st === PS_LUNGE) { lunging = true; ink2.puff(p.x + 0.8, p.y, 0, 0, spellById('ink-cloud')); }
        if (lunging && p.st === PS_PATROL) aborted = true;
      }
      assert('piranha: a lunge stops when ink comes between it and the octopus, and it wanders off', lunging && aborted && p.lostInk >= 1);
    }
    // cannon: aims through open water, not through ink
    {
      const o = calm(createOctopus(0, -4)); const en = createEnemies(); en.setInkClouds(ink); const c = en.spawnAt('cannon', 0, 0, 'floor');
      c.st = CN_RELOAD; c.t = 0.05;
      const blocker = createInkClouds(); en.setInkClouds(blocker); blocker.puff(0, -2, 0, 0, spellById('ink-cloud')); blocker.update(0.3);
      let charged = false, shots = 0;
      for (let i = 0; i < 150; i++) { en.update(DT, i * DT, o, OPEN, []); if (c.st === CN_CHARGE) charged = true; shots += en.events.filter((e) => e.type === 'shotFired').length; }
      assert('cannon: cannot aim through an ink cloud (no charge, no shot)', !charged && shots === 0);
    }
    // crab: no pause, no snap
    {
      const floor = { isSolid: (x, y) => Math.floor(y) >= 1, breakTile() {} };
      const o = calm(createOctopus(0.9, 0.2)); const en = createEnemies(); const c = en.spawnAt('crab', 0, 0.45, 'floor'); c.dir = 1;
      const cl = createInkClouds(); en.setInkClouds(cl); cl.puff(0.9, 0.2, 0, 0, spellById('ink-cloud')); cl.update(0.3);
      const h0 = o.hearts; let paused = false;
      for (let i = 0; i < 150; i++) { en.update(DT, i * DT, o, floor, []); if (c.st === CS_PAUSE) paused = true; }
      assert('crab: the octopus in ink beside it is not snapped at', !paused && o.hearts === h0);
    }
    // manta: sweeps past instead of diving
    {
      const o = calm(createOctopus(0.3, 4)); const en = createEnemies(); const m = en.spawnAt('manta', 0, 0, 'open'); m.cool = 0; m.dir = 1;
      const cl = createInkClouds(); en.setInkClouds(cl); cl.puff(0.3, 4, 0, 0, spellById('ink-cloud')); cl.update(0.3);
      let dived = false;
      for (let i = 0; i < 150; i++) { en.update(DT, i * DT, o, OPEN, []); if (m.st === MA_DIVE) dived = true; }
      assert('manta: no dive at an octopus hidden in ink (it glides on past)', !dived && m.st === MA_GLIDE);
    }
    // the same piranha without ink does wind up (the test above is not passing for another reason)
    {
      const o = calm(createOctopus(3, 2)); const en = createEnemies(); en.setInkClouds(createInkClouds()); const p = en.spawnAt('piranha', 0, 0);
      let wound = false;
      for (let i = 0; i < 100; i++) { en.update(DT, i * DT, o, OPEN, []); if (p.st === PS_WINDUP) wound = true; }
      assert('piranha: without ink the same set-up does wind up', wound);
    }
  }

  // ---------------------------------------------------------------- the run's juice
  {
    const r = createRun(5, { tutorialDone: true, juiceStart: juiceStart() });
    assert('the hub before any dive: an empty jar', r.juice === 0);
    runEvent(r, EV_ENTER_DIVE);
    assert('a dive starts with a full jar (3 casts)', r.state === S_BIOME && r.juice === juiceCap() && castsOf(r.juice) === 3);
    r.juice -= 5; const mid = r.juice;
    runEvent(r, EV_EXIT);
    assert('the juice is kept from one level to the next', r.level === 2 && r.juice === mid);
    r.hotbar = createHotbar();
    runEvent(r, EV_DEATH);
    assert('a death empties the jar and drops the hotbar', r.juice === 0 && r.hotbar === null);
    runEvent(r, EV_ENTER_DIVE);
    assert('a new dive starts again with a full jar', r.juice === juiceCap());
  }

  // ---------------------------------------------------------------- two spells switch correctly (test-only row)
  {
    const remove = registerSpellForTest({ id: 'test-veil', name: 'Test Veil', effect: 'cloud', cost: 2, radius: 1, duration: 1, drift: 0 });
    try {
      const hb = createHotbar(); addSpell(hb, 'test-veil');
      const r = { juice: juiceCap() }, cl = createInkClouds();
      selectIndex(hb, 1);
      const a = castSpell(r, selectedSpell(hb), { clouds: cl, x: 0, y: 0, vx: 0, vy: 0 });
      assert('hotbar: the second spell, selected, is the one cast (its own cost and radius)', a === CAST_OK && r.juice === juiceCap() - 2 * JUICE.perCast && cl.data.r[0] === 1);
      selectNext(hb, 1);
      const b = castSpell(r, selectedSpell(hb), { clouds: cl, x: 0, y: 0, vx: 0, vy: 0 });
      assert('hotbar: switching back casts Ink Cloud' + ` [${selectedSpell(hb)} ${b} ${r.juice} ${cl.data.r[1]}]`, selectedSpell(hb) === 'ink-cloud' && b === CAST_OK && r.juice === 0 && Math.abs(cl.data.r[1] - spellById('ink-cloud').radius) < 1e-5);
    } finally { remove(); }
    assert('the test-only row is removed again', !spellById('test-veil') && SPELLS.length === 5);
  }

  // ---------------------------------------------------------------- drawing (culled, no throw)
  {
    cullReset();
    const ctx = recCtx(), drops = createJuiceDrops(), cl = createInkClouds();
    drops.spawn(0, 0, 3, 0); cl.puff(0, 0, 0, 0, spellById('ink-cloud')); cl.update(0.3); drops.update(0.3, createOctopus(90, 90), OPEN, 0);
    drawJuiceDrops(ctx, { x: 0, y: 0, pxPerUnit: 50 }, 800, 600, drops.data, 1);
    drawInkClouds(ctx, { x: 0, y: 0, pxPerUnit: 50 }, 800, 600, cl.data, 1, 0);
    const n1 = ctx.calls.filter((k) => k === 'drawImage').length;
    const ctx2 = recCtx();
    drawJuiceDrops(ctx2, { x: 500, y: 0, pxPerUnit: 50 }, 800, 600, drops.data, 1);
    drawInkClouds(ctx2, { x: 500, y: 0, pxPerUnit: 50 }, 800, 600, cl.data, 1, 0);
    assert('droplets and clouds draw on screen, and nothing far off screen (culled)', n1 >= 3 + 8 && ctx2.calls.filter((k) => k === 'drawImage').length === 0);
    cullReset();
  }

  // ---------------------------------------------------------------- every input mapping
  {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;opacity:0;pointer-events:auto';
    document.body.appendChild(canvas);
    const input = createInput(canvas);
    const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
    const tap = (code) => { key(code); const s = input.snapshot(); key(code, 'keyup'); input.snapshot(); return s; };
    const ok = (name, code, f) => { const s = tap(code); assert('input: ' + name, f(s)); };
    ok('Space dashes', 'Space', (s) => s.dash.pressed && !s.bomb.pressed);
    ok('Shift dashes', 'ShiftLeft', (s) => s.dash.pressed);
    ok('J fires the ink jet in the facing direction', 'KeyJ', (s) => s.attack.pressed && s.src.attack === 'key');
    ok('K fires the ink jet too', 'KeyK', (s) => s.attack.held && s.src.attack === 'key');
    ok('F is the hand (controls 2026-10-08), not a spell', 'KeyF', (s) => s.hand.pressed && !s.use.pressed && !s.spell.pressed);
    ok('C uses the selected hotbar slot (casts a selected spell)', 'KeyC', (s) => s.use.pressed && s.src.use === 'key');
    ok('B throws a bomb', 'KeyB', (s) => s.bomb.pressed && s.src.bomb === 'key' && !s.dash.pressed);
    ok('X throws a bomb', 'KeyX', (s) => s.bomb.pressed);
    ok('Q steps to the previous spell', 'KeyQ', (s) => s.cycle === -1);
    ok('E steps to the next spell', 'KeyE', (s) => s.cycle === 1);
    ok('3 picks hotbar slot 3', 'Digit3', (s) => s.select === 2);
    ok('Numpad 9 picks slot 9', 'Numpad9', (s) => s.select === 8);
    ok('Tab is the inventory key', 'Tab', (s) => s.inventory.pressed);
    ok('I is the inventory key', 'KeyI', (s) => s.inventory.pressed);
    key('KeyD'); let s = input.snapshot();
    assert('input: D swims right (and no mouse steering exists: move comes from the keys only)', s.move.x === 1 && s.move.y === 0);
    key('KeyD', 'keyup'); input.snapshot();
    const r = canvas.getBoundingClientRect();
    const mouse = (type, button, x = 400, y = 300) => canvas.dispatchEvent(new MouseEvent(type, { button, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }));
    mouse('mousedown', 0, 600, 200); s = input.snapshot();
    const s2 = input.snapshot();
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); const s3 = input.snapshot();
    assert('input: left button fires the ink jet at the cursor, holding repeats (held), releasing stops', s.attack.pressed && s.src.attack === 'mouse' && input.mouse.x === 600 && input.mouse.y === 200 && s2.attack.held && !s2.attack.pressed && !s3.attack.held);
    assert('input: holding the left button does not swim (pure mouse steering is gone)', s.move.x === 0 && s.move.y === 0 && s2.move.x === 0);
    mouse('mousedown', 2); s = input.snapshot(); window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })); input.snapshot();
    assert('input: right button uses the selected hotbar slot toward the cursor', s.use.pressed && s.src.use === 'mouse' && !s.dash.pressed);
    mouse('mousedown', 1); s = input.snapshot(); window.dispatchEvent(new MouseEvent('mouseup', { button: 1 })); input.snapshot();
    assert('input: middle button throws a bomb at the cursor', s.bomb.pressed && s.src.bomb === 'mouse');
    const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); canvas.dispatchEvent(cm);
    assert('input: no browser context menu over the canvas', cm.defaultPrevented);
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); s = input.snapshot();
    assert('input: a double-click is not a dash any more', !s.dash.pressed);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); s = input.snapshot();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); const sb = input.snapshot();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, bubbles: true, cancelable: true })); const sc = input.snapshot();
    assert('input: the wheel steps through the spells (one notch = one step, a small trackpad nudge is not)', s.cycle === 1 && sb.cycle === -1 && sc.cycle === 0);
    // touch buttons: Jet, Spell, Bomb, Dash
    const root = document.createElement('div'); root.style.cssText = 'position:fixed;inset:0;pointer-events:none'; document.body.appendChild(root);
    const tui = createTouchUI(root, input, canvas);
    tui.show();
    const pe = (el, type) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, bubbles: true, cancelable: true, clientX: 700, clientY: 500 }));
    const press = (id) => { const el = document.getElementById(id); pe(el, 'pointerdown'); const sn = input.snapshot(); pe(el, 'pointerup'); input.snapshot(); return sn; };
    s = press('octo-attack-btn');
    assert('touch: the Jet button fires the ink jet (auto-aimed)', s.attack.pressed && s.src.attack === 'touch');
    s = press('octo-spell-btn');
    assert('touch: the Spell button casts', s.spell.pressed && s.src.spell === 'touch');
    s = press('octo-use-btn');
    assert('touch: the Use button uses the selected hotbar slot (controls 2026-10-08)', s.use.pressed && s.src.use === 'touch');
    s = press('octo-dash-btn');
    assert('touch: the Dash button dashes', s.dash.pressed);
    // (no play.css on the test page: check the inline placement; the real layout is checked at phone size in the CDP script)
    const pos = ['octo-attack-btn', 'octo-spell-btn', 'octo-use-btn', 'octo-dash-btn'].map((id) => { const st = document.getElementById(id).style; return st.right + '|' + st.bottom; });
    assert('touch: the four buttons get four different places in a 2 x 2 block at the bottom right', new Set(pos).size === 4 && pos.every((p) => /safe-area-inset-right/.test(p)));
    tui.setSpell(false);
    assert('touch: the Spell button dims when the jar is short of a cast', document.getElementById('octo-spell-btn').classList.contains('is-empty'));
    tui.hide(); root.remove(); canvas.remove();
  }
}
