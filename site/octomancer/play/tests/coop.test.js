// Local co-op Phase 1 (octomancer-web/MULTIPLAYER-PLAN.md): players.js (the roster, device binding, per-device records and
// restore, the colours, the creature target pick, the shared camera's frame math, the exit pull) and gamepad.js's per-pad
// snapshots for the pads that are not the primary one.
import { createRoster, activePlayers, isSolo, joinDevice, removePlayer, deviceTaken, playerOfDevice, clearRecords, padKey, PLAYER_COLOURS, KEYBOARD, MAX_PLAYERS,
  pickTarget, leadOf, octoList, cameraFrame, leaderIndex, pullPos, PULL_S, ZOOM_CAP } from '../js/players.js';
import { createInput } from '../js/input.js';
import { createGamepad, fakePad } from '../js/gamepad.js';

export function runCoopTests(assert, approx) {
  const A = padKey('Xbox pad', 0), B = padKey('Xbox pad', 1), C = padKey('DualSense', 2);
  // --- the roster: solo, joining, binding player 1
  {
    const r = createRoster();
    assert('coop: a new roster is solo, player 1 on any device', isSolo(r) && activePlayers(r).length === 1 && activePlayers(r)[0].device === null);
    assert('coop: solo player 1 owns every device', playerOfDevice(r, A) === activePlayers(r)[0] && playerOfDevice(r, KEYBOARD) === activePlayers(r)[0]);
    assert('coop: player 1\'s own device cannot join as player 2', joinDevice(r, A, A) === null && isSolo(r));
    const j = joinDevice(r, B, A);
    assert('coop: pad B joins as player 2 (slot 1); player 1 is bound to pad A', j && j.player.slot === 1 && j.player.device === B && activePlayers(r)[0].device === A && !isSolo(r));
    assert('coop: no record for a fresh joiner', j.record === null);
    assert('coop: a device already playing cannot join again', joinDevice(r, B) === null && joinDevice(r, A) === null);
    assert('coop: the keyboard joins as player 3', joinDevice(r, KEYBOARD).player.slot === 2 && deviceTaken(r, KEYBOARD));
    assert('coop: a fourth (pad C) as player 4', joinDevice(r, C).player.slot === 3 && activePlayers(r).length === MAX_PLAYERS);
    assert('coop: a fifth device is refused (four at most)', joinDevice(r, padKey('Other', 4)) === null);
  }
  // --- leaving and coming back
  {
    const r = createRoster();
    joinDevice(r, B, A); joinDevice(r, KEYBOARD);
    const left = removePlayer(r, 1, { hearts: 1, heartMax: 3, bombs: 2, juice: 5, hotbar: null, items: ['lantern'], dead: false });
    assert('coop: Remove takes the player out and keeps a record under its device', left && left.device === B && r.slots[1] === null && r.records.get(B).hearts === 1 && r.records.get(B).slot === 1);
    const back = joinDevice(r, B);
    assert('coop: the same device back: its record (hearts, items) and its slot (colour) return', back.player.slot === 1 && back.record && back.record.hearts === 1 && back.record.items[0] === 'lantern' && !r.records.has(B));
    removePlayer(r, 1, { hearts: 2, heartMax: 3, bombs: 0, juice: 0, hotbar: null, items: [], dead: true });
    const other = joinDevice(r, C);
    assert('coop: a different device gets a fresh player, in the lowest free slot', other.record === null && other.player.slot === 1);
    const again = joinDevice(r, B);
    assert('coop: a returning device whose slot was taken gets another slot, with its record (dead too)', again.player.slot === 3 && again.record.dead === true);
    removePlayer(r, 3, null); removePlayer(r, 2, null);
    removePlayer(r, 1, null);
    assert('coop: back to one player: solo again, on any device', isSolo(r) && activePlayers(r)[0].device === null);
    assert('coop: the last player cannot leave', removePlayer(r, 0, null) === null && activePlayers(r).length === 1);
    clearRecords(r);
    assert('coop: a new run forgets every record', r.records.size === 0);
  }
  // --- colours
  {
    assert('coop: four colours: red (player 1 keeps the worn look), teal, ochre, violet', PLAYER_COLOURS.map((c) => c.id).join() === 'red,teal,ochre,violet' && PLAYER_COLOURS[0].body === null);
    assert('coop: players 2-4 have a body colour for the tint path and a HUD colour', PLAYER_COLOURS.slice(1).every((c) => /^#[0-9a-f]{6}$/.test(c.body) && /^#[0-9a-f]{6}$/.test(c.ui)));
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const sat = (h) => { const v = hex(h); return (Math.max(...v) - Math.min(...v)) / 255; };
    assert('coop: natural colours, not neon (saturation under 0.6)', PLAYER_COLOURS.slice(1).every((c) => sat(c.body) < 0.6));
  }
  // --- who a creature goes for
  {
    const o1 = { x: 0, y: 0 }, o2 = { x: 10, y: 0 }, dead = { x: 1, y: 0, dead: true }, hid = { x: 2, y: 0, hidden: true };
    assert('coop: pickTarget with one octopus is that octopus (solo: as before)', pickTarget(o1, 99, 99) === o1 && pickTarget([dead], 0, 0) === dead);
    assert('coop: pickTarget: the nearest live octopus', pickTarget([o1, o2], 8, 0) === o2 && pickTarget([o1, o2], 3, 0) === o1);
    assert('coop: pickTarget skips the dead and the hidden', pickTarget([o2, dead, hid], 1.5, 0) === o2);
    assert('coop: pickTarget: everyone dead: the nearest body', pickTarget([{ x: 5, y: 0, dead: true }, dead], 0, 0) === dead);
    assert('coop: leadOf: the first live one', leadOf([dead, o2, o1]) === o2 && leadOf(o1) === o1);
    const one = [null];
    assert('coop: octoList wraps one octopus without a new array', octoList(o1, one) === one && one[0] === o1 && octoList([o1, o2]).length === 2);
  }
  // --- the shared camera's frame
  {
    const hw = 10, hh = 6.25; // the solo view at 1440x900: 20 x 12.5 tiles
    let f = cameraFrame([{ x: 5, y: 5 }], hw, hh);
    assert('coop camera: one player: no zoom, on the player', f.zoom === 1 && f.x === 5 && f.y === 5);
    f = cameraFrame([{ x: 0, y: 0 }, { x: 4, y: 2 }], hw, hh);
    assert('coop camera: two close together: the middle, no zoom', f.zoom === 1 && f.x === 2 && f.y === 1 && !f.capped);
    f = cameraFrame([{ x: 0, y: 0 }, { x: 24, y: 0 }], hw, hh);
    assert('coop camera: spread wider than the view: zooms out just enough (margin kept)', f.zoom > 1 && approx(f.zoom, (12 + 3.5) / hw, 1e-9) && f.x === 12);
    f = cameraFrame([{ x: 0, y: 0 }, { x: 0, y: 9 }], hw, hh);
    assert('coop camera: spread in height: zooms out by the height', approx(f.zoom, (4.5 + 3.5) / hh, 1e-9));
    f = cameraFrame([{ x: 0, y: 0 }, { x: 60, y: 0 }], hw, hh, 0);
    assert('coop camera: past the cap: zoom at the cap, the leader (player 1) stays in view', f.capped && f.zoom === ZOOM_CAP && Math.abs(f.x - 0) <= hw * ZOOM_CAP - 3.5 + 1e-9);
    const g = cameraFrame([{ x: 0, y: 0 }, { x: 60, y: 0 }], hw, hh, 1);
    assert('coop camera: past the cap with the other leader: the view follows that one', g.capped && Math.abs(g.x - 60) <= hw * ZOOM_CAP - 3.5 + 1e-9);
    assert('coop camera: the cap is 1.6x', ZOOM_CAP === 1.6);
    assert('coop camera: leaderIndex: the one nearest the exit', leaderIndex([{ x: 0, y: 0 }, { x: 10, y: 10 }], 9, 9) === 1 && leaderIndex([{ x: 0, y: 0 }], -1, -1, 0) === 0);
  }
  // --- the exit pull
  {
    const p = pullPos(0, 0, 10, 0, 0), m = pullPos(0, 0, 10, 0, PULL_S / 2), e = pullPos(0, 0, 10, 0, PULL_S + 1);
    assert('coop pull: starts where they are, halfway at half time, at the whirlpool at the end', p.x === 0 && approx(m.x, 5, 1e-9) && e.x === 10 && PULL_S === 3);
  }
  // --- gamepad.js: pads that are not the primary one
  {
    const input = createInput(null);
    const pads = [fakePad({}, 0), fakePad({}, 1)];
    const free = [];
    let players = new Set(), primary;
    const gp = createGamepad(input, { getPads: () => pads, primaryKey: () => primary, isPlayer: (k) => players.has(k), onFree: (k, b) => free.push(k + ':' + b) });
    gp.poll();
    const kA = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)#0', kB = kA.replace('#0', '#1');
    assert('pads: solo: the first pad is primary, the second is another pad', gp.primaryKey() === kA && gp.others().length === 1 && gp.others()[0].key === kB);
    pads[1] = fakePad({ a: true }, 1); gp.poll(); pads[1] = fakePad({}, 1); gp.poll();
    assert('pads: a free pad reports its A (to join from the pause menu)', free.includes(kB + ':a'));
    pads[1] = fakePad({ lx: 1 }, 1); gp.poll();
    assert('pads: a free pad writes nothing to anyone', gp.snapshotOf(kB).move.x === 0 && input.snapshot().move.x === 0);
    players = new Set([kA, kB]); primary = '';
    gp.poll(); gp.poll();
    assert('pads: co-op: no primary pad; both are players', gp.primaryKey() === '' && gp.others().length === 2);
    pads[0] = fakePad({ lx: -1, rt: 1 }, 0); pads[1] = fakePad({ lx: 1, a: true }, 1); gp.poll();
    const sA = gp.snapshotOf(kA), sB = gp.snapshotOf(kB);
    assert('pads: each player pad has its own snapshot (stick and buttons)', sA.move.x < -0.9 && sA.attack.held && !sA.hand.held && sB.move.x > 0.9 && sB.hand.pressed && sA.mode === 'pad');
    assert('pads: the merged snapshot sees none of it', input.snapshot().move.x === 0);
    const sB2 = gp.snapshotOf(kB);
    assert('pads: a press is one edge per read', !sB2.hand.pressed && sB2.hand.held);
  }
}
