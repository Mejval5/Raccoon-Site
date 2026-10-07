// Friendly NPCs that can be hurt, killed and turned against you (V2-PLAN 16 point 5). Marlo (the diver), Pip (the critter),
// Quill (the collector) and the pool host each have a health pool. A bomb blast, a dash at speed and the Ink Jet (hit()) hurt
// them; the first hit makes them HOSTILE for the rest of the dive and fails their encounter. The shopkeeper is not ours: an
// attack of ours that reaches him calls shopAggro (shop-aggro.js, the Shop owner's) and nothing else.
//
//   calm      the owner of the NPC (quests.js state, the hub, the pool plan) says where it is: main.js calls place() each step
//   hostile   this module moves it. Marlo keeps 4-7 tiles away, AIMS for 0.7 s (a dashed sight line, his gun raised) and fires a
//             harpoon (heavy hit, 2 hearts). Pip, Quill and the host chase, wind up for 0.35 s and lunge to bite (one heart).
//             In the hub nobody fights back: a hurt resident flees, refuses to talk and can still be killed.
//   dead      one 'killed' event {kind, x, y, vx, vy, face} (main.js turns it into a corpse); no drops
//
// Data-oriented: one slot per present NPC in typed arrays (CAP 8), a few harpoons in their own arrays, no allocation per step.
// The per-run mood record (`createMoods`, owned by main.js) outlives the level: who was angered and how hurt they are.
// Deterministic: no Math.random here.

import { hurtOctopus, heavyHitOctopus } from './octopus.js';
import { DASH_KILL_SPEED, OCTO_RADIUS } from './config.js';
import { shopAggro } from './shop-aggro.js';
import { createTalk, say, talkStep } from './speech.js';

export const NPC_MARLO = 1, NPC_PIP = 2, NPC_QUILL = 3, NPC_HOST = 4;
export const NPC_IDS = ['', 'marlo', 'pip', 'quill', 'host'];
export const NPC_KINDS = ['', 'npc-marlo', 'npc-pip', 'npc-quill', 'npc-host'];
export const NPC_CAP = 8;
export const HARPOON_CAP = 4;
/** Health pools (hearts of damage taken before they die). A bomb does ~6 at its centre, a dash 2. */
export const NPC_HP = [0, 6, 2, 4, 5];
export const BLAST_DMG = 6, DASH_DMG = 2;
/** Body radius, and the body centre relative to the anchor (Marlo, Quill and the host are placed by their feet, Pip by his centre). */
export const NPC_RADIUS = [0, 0.5, 0.3, 0.6, 0.55];
export const NPC_CENTER_DY = [0, -0.55, 0, -0.65, -0.45];
export const NPC_HEAD = [0, 1.35, 0.7, 1.45, 1.2]; // speech bubble height above the anchor
/** Cause names the death screen knows (run.js): what hurt the octopus. */
export const NPC_CAUSE = ['', 'harpoon', 'pip', 'quill', 'host'];

// slot states
export const ST_CALM = 0, ST_MOVE = 1, ST_AIM = 2, ST_WIND = 3, ST_LUNGE = 4, ST_RECOVER = 5, ST_FLEE = 6;
export const ST_NAMES = ['calm', 'move', 'aim', 'wind', 'lunge', 'recover', 'flee'];
// place() flags: what protects the NPC right now
export const FL_SEALED = 1, FL_CAGED = 2, FL_FOLLOWING = 4, FL_TALKING = 8;

// Marlo's harpoon gun
export const AIM_S = 0.7, RELOAD_S = 1.6, HARPOON_SPEED = 13, HARPOON_LIFE = 2.2;
export const KEEP_MIN = 4, KEEP_MAX = 6, SIGHT_MAX = 10; // 6 not 7: on a portrait phone he must stay on screen when he shoots
const AIM_TURN = 1.3;            // rad/s the aim follows the octopus (slow: a moving octopus dodges)
const HARPOON_HIT_R = OCTO_RADIUS + 0.12;
// the melee three
export const WIND_S = 0.35, LUNGE_S = 0.22, LUNGE_SPEED = 8, RECOVER_S = 0.9, LUNGE_START_R = 1.7;
const SPEED = [0, 2.4, 3.4, 2.6, 2.8];     // hostile cruising speed (u/s)
const FLEE_SPEED = 2.8;
export const FREED_GRACE = 1.0;  // s of immunity after the protection (the rock pocket, the cage) goes
const KNOCK = 4;                 // u/s a hit pushes the NPC
const MAX_ANGRY_SAY = 3;

/** Per-run mood record: who was angered, how hurt they are (-1 = untouched), who died. Index = NPC_* id. */
export function createMoods() { return { hostile: new Uint8Array(5), dead: new Uint8Array(5), angered: new Uint16Array(5), hp: new Float32Array(5).fill(-1) }; }
export function resetMoods(m) { m.hostile.fill(0); m.dead.fill(0); m.angered.fill(0); m.hp.fill(-1); }
export function npcByName(name) { return NPC_IDS.indexOf(name); }

/**
 * @param {{isSolid:(x:number,y:number)=>boolean}} world
 * @param {{moods?:any, hub?:boolean, lines?:Record<string,{hurt?:string[],angry?:string[]}>, onKeeper?:(reason:string)=>void}} [opts]
 *   lines: speech by npc id (data/quests.json 'hurt' / 'angry'); onKeeper defaults to shop-aggro.js shopAggro (tests inject their own)
 */
export function createNpcs(world, opts = {}) {
  const moods = opts.moods || createMoods();
  const hub = !!opts.hub;
  const lines = opts.lines || {};
  const onKeeper = opts.onKeeper || shopAggro;
  const N = NPC_CAP;
  const d = {
    n: N, used: new Uint8Array(N), who: new Uint8Array(N), idx: new Uint8Array(N),
    x: new Float32Array(N), y: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), hp: new Float32Array(N),
    hostile: new Uint8Array(N), state: new Uint8Array(N), t: new Float32Array(N), reload: new Float32Array(N),
    aimT: new Float32Array(N), aimAng: new Float32Array(N), aimLen: new Float32Array(N), face: new Int8Array(N),
    flash: new Float32Array(N), immune: new Float32Array(N), flags: new Uint8Array(N), prot: new Uint8Array(N), placed: new Uint8Array(N),
    fixed: new Uint8Array(N), dashHit: new Int32Array(N), attacks: new Uint8Array(N), lastX: new Float32Array(N), lastY: new Float32Array(N),
    blocked: new Float32Array(N), lungeX: new Float32Array(N), lungeY: new Float32Array(N), biteDone: new Uint8Array(N),
  };
  const talks = []; for (let i = 0; i < N; i++) talks.push(createTalk());
  const hp = { // harpoons in flight
    n: HARPOON_CAP, on: new Uint8Array(HARPOON_CAP), x: new Float32Array(HARPOON_CAP), y: new Float32Array(HARPOON_CAP),
    vx: new Float32Array(HARPOON_CAP), vy: new Float32Array(HARPOON_CAP), life: new Float32Array(HARPOON_CAP), ang: new Float32Array(HARPOON_CAP),
  };
  const events = [];
  const lineIx = new Uint16Array(5), angrySaid = new Uint8Array(N);
  let dashId = 0, keeperX = -999, keeperY = -999, keeperDash = -1;

  // y is the anchor (the feet of Marlo, Quill and the host, Pip's centre); the body centre, which collides and gets hit, is y + CENTER_DY
  const cyOf = (i) => d.y[i] + NPC_CENTER_DY[d.who[i]];
  /** Clear water along a segment (nothing solid between the two points; the start itself is not tested). */
  function clear(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L / 0.2));
    for (let k = 1; k <= n; k++) if (world.isSolid(x0 + dx * k / n, y0 + dy * k / n)) return false;
    return true;
  }
  function free(x, y, r) {
    const o = r * 0.7;
    return !world.isSolid(x, y) && !world.isSolid(x - o, y) && !world.isSolid(x + o, y) && !world.isSolid(x, y - o) && !world.isSolid(x, y + o);
  }
  function find(who, idx) { for (let i = 0; i < N; i++) if (d.used[i] && d.who[i] === who && d.idx[i] === idx) return i; return -1; }

  function say1(i, text) {
    if (!text) return;
    const tk = talks[i];
    tk.q.length = 0; tk.left = 0; tk.text = '';
    say(tk, [text]); talkStep(tk, 0);
  }
  function pickLine(i, kind) {
    const w = d.who[i], set = lines[NPC_IDS[w]] && lines[NPC_IDS[w]][kind];
    if (!set || !set.length) return '';
    return set[lineIx[w]++ % set.length];
  }

  function create(who, idx, x, anchorY, hostile, fixed) {
    let i = -1;
    for (let k = 0; k < N; k++) if (!d.used[k]) { i = k; break; }
    if (i < 0) return -1;
    d.used[i] = 1; d.who[i] = who; d.idx[i] = idx;
    d.x[i] = x; d.y[i] = anchorY; d.vx[i] = d.vy[i] = 0;
    d.hp[i] = moods.hp[who] >= 0 ? moods.hp[who] : NPC_HP[who];
    d.hostile[i] = 0; d.state[i] = ST_CALM; d.t[i] = 0; d.reload[i] = 0.6; d.aimT[i] = 0; d.aimAng[i] = 0; d.aimLen[i] = 0; d.face[i] = 1;
    d.flash[i] = 0; d.immune[i] = 0; d.flags[i] = 0; d.prot[i] = 0; d.placed[i] = 1; d.fixed[i] = fixed ? 1 : 0; d.dashHit[i] = -1; d.attacks[i] = 0;
    d.blocked[i] = 0; d.biteDone[i] = 0; angrySaid[i] = 0;
    const tk = talks[i]; tk.q.length = 0; tk.left = 0; tk.text = ''; tk.total = 0;
    if (hostile || moods.hostile[who]) setHostile(i, false);
    return i;
  }
  function setHostile(i, announce) {
    const w = d.who[i];
    d.hostile[i] = 1; d.state[i] = hub ? ST_FLEE : ST_MOVE; d.t[i] = 0; d.reload[i] = Math.max(d.reload[i], 0.9);
    if (announce) {
      moods.hostile[w] = 1; moods.angered[w]++;
      events.push({ type: 'angered', who: w, name: NPC_IDS[w], x: d.x[i], y: cyOf(i), hub });
    } else moods.hostile[w] = 1;
  }

  function kill(i) {
    const w = d.who[i];
    events.push({ type: 'killed', kind: NPC_KINDS[w], who: w, name: NPC_IDS[w], x: d.x[i], y: cyOf(i), vx: d.vx[i], vy: d.vy[i] - 0.5, face: d.face[i] || 1, hub });
    moods.dead[w] = 1; moods.hostile[w] = 1; moods.hp[w] = 0;
    d.used[i] = 0;
    const tk = talks[i]; tk.q.length = 0; tk.left = 0; tk.text = '';
  }

  /** Is this NPC shielded from every hit right now (still sealed in rock, caged, or just freed)? */
  const shielded = (i) => d.immune[i] > 0 || (d.flags[i] & (FL_SEALED | FL_CAGED)) !== 0;

  /** Damage slot i. Returns true when it took the hit. */
  function damage(i, dmg, src, fx, fy) {
    if (!d.used[i] || shielded(i) || dmg <= 0) return false;
    d.hp[i] -= dmg; moods.hp[d.who[i]] = d.hp[i];
    d.flash[i] = 0.22;
    let dx = d.x[i] - fx, dy = cyOf(i) - fy, L = Math.hypot(dx, dy);
    if (L < 1e-3) { dx = 0; dy = -1; L = 1; }
    d.vx[i] += dx / L * KNOCK; d.vy[i] += dy / L * KNOCK;
    const wasHostile = d.hostile[i] === 1;
    if (!wasHostile) setHostile(i, true);
    events.push({ type: 'hurt', who: d.who[i], x: d.x[i], y: cyOf(i), dmg, src });
    if (d.hp[i] <= 0) { kill(i); return true; }
    // hurt line; a hub resident that is already angry keeps refusing instead
    say1(i, pickLine(i, hub && wasHostile ? 'angry' : 'hurt'));
    return true;
  }

  function protOf(i) { return d.flags[i] & (FL_SEALED | FL_CAGED); }

  // ---- hostile movement -------------------------------------------------------------------------------------
  function advance(i, dt) {
    const r = NPC_RADIUS[d.who[i]] * 0.8;
    const cx = d.x[i], cy = cyOf(i), nx = cx + d.vx[i] * dt, ny = cy + d.vy[i] * dt;
    if (free(nx, ny, r)) { d.x[i] = nx; d.y[i] = ny - NPC_CENTER_DY[d.who[i]]; }
    else if (free(nx, cy, r)) { d.x[i] = nx; d.vy[i] *= 0.3; }
    else if (free(cx, ny, r)) { d.y[i] = ny - NPC_CENTER_DY[d.who[i]]; d.vx[i] *= 0.3; }
    else { d.vx[i] *= 0.2; d.vy[i] *= 0.2; }
  }
  /** Swim toward a heading (unit dx, dy) at `speed`, turning away from rock in front of it. */
  function glide(i, ux, uy, speed, dt) {
    const r = NPC_RADIUS[d.who[i]] * 0.8, cx = d.x[i], cy = cyOf(i);
    let hx = ux, hy = uy;
    if (!free(cx + ux * 0.9, cy + uy * 0.9, r)) {
      let ok = false;
      for (const a of [0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
        const c = Math.cos(a), s = Math.sin(a), rx = ux * c - uy * s, ry = ux * s + uy * c;
        if (free(cx + rx * 0.9, cy + ry * 0.9, r)) { hx = rx; hy = ry; ok = true; break; }
      }
      if (!ok) { hx = 0; hy = 0; }
    }
    const k = Math.min(1, dt * 5);
    d.vx[i] += (hx * speed - d.vx[i]) * k; d.vy[i] += (hy * speed - d.vy[i]) * k;
    advance(i, dt);
  }
  function drift(i, dt) { const k = Math.min(1, dt * 4); d.vx[i] -= d.vx[i] * k; d.vy[i] -= d.vy[i] * k; advance(i, dt); }

  function fireHarpoon(i, ang) {
    let h = -1;
    for (let k = 0; k < HARPOON_CAP; k++) if (!hp.on[k]) { h = k; break; }
    if (h < 0) return;
    const sx = d.x[i] + d.face[i] * 0.22, sy = cyOf(i) + 0.09, c = Math.cos(ang), s = Math.sin(ang);
    hp.on[h] = 1; hp.x[h] = sx + c * 0.7; hp.y[h] = sy + s * 0.7; hp.vx[h] = c * HARPOON_SPEED; hp.vy[h] = s * HARPOON_SPEED; hp.life[h] = HARPOON_LIFE; hp.ang[h] = ang;
    events.push({ type: 'harpoon', x: hp.x[h], y: hp.y[h], ang });
  }

  function marlo(i, octo, dt) {
    const cx = d.x[i], cy = cyOf(i), dx = octo.x - cx, dy = octo.y - cy, dist = Math.hypot(dx, dy) || 1e-3;
    const sx = cx + d.face[i] * 0.22, sy = cy + 0.09;
    const los = !octo.dead && dist < SIGHT_MAX && clear(sx, sy, octo.x, octo.y);
    if (d.state[i] === ST_AIM) {
      const want = Math.atan2(octo.y - sy, octo.x - sx);
      let da = want - d.aimAng[i]; da = Math.atan2(Math.sin(da), Math.cos(da));
      const m = AIM_TURN * dt;
      d.aimAng[i] += Math.abs(da) < m ? da : Math.sign(da) * m;
      d.aimT[i] += dt;
      d.blocked[i] = los ? 0 : d.blocked[i] + dt;
      castAim(i, sx, sy, dist);
      drift(i, dt);
      if (octo.dead || d.blocked[i] > 0.25) { d.state[i] = ST_MOVE; d.reload[i] = 0.5; d.aimT[i] = 0; return; } // lost the line: no shot
      if (d.aimT[i] >= AIM_S) {
        if (los) { fireHarpoon(i, d.aimAng[i]); d.reload[i] = RELOAD_S; }
        d.state[i] = ST_MOVE; d.aimT[i] = 0;
      }
      return;
    }
    d.face[i] = dx >= 0 ? 1 : -1;
    if (octo.dead) { drift(i, dt); return; }
    // keep 4-7 tiles away: back off when close, close in when far, hold in between
    let ux = 0, uy = 0, sp = 0;
    if (dist < KEEP_MIN) { ux = -dx / dist; uy = -dy / dist; sp = SPEED[NPC_MARLO] * (1 + (KEEP_MIN - dist) * 0.2); }
    else if (dist > KEEP_MAX) { ux = dx / dist; uy = dy / dist; sp = SPEED[NPC_MARLO] * 0.8; }
    if (sp > 0) glide(i, ux, uy, sp, dt); else drift(i, dt);
    if (los && d.reload[i] <= 0 && dist >= 3 && dist <= 6.5) {
      d.state[i] = ST_AIM; d.aimT[i] = 0; d.blocked[i] = 0; d.aimAng[i] = Math.atan2(octo.y - sy, octo.x - sx); d.attacks[i]++;
      if ((d.attacks[i] & 3) === 1 && !talks[i].text) say1(i, pickLine(i, 'angry'));
    }
  }
  /** How far the sight line reaches: to the first rock, or a little past the octopus. */
  function castAim(i, sx, sy, dist) {
    const c = Math.cos(d.aimAng[i]), s = Math.sin(d.aimAng[i]), maxL = Math.min(12, dist + 0.7);
    let L = 0;
    for (; L < maxL; L += 0.25) if (world.isSolid(sx + c * L, sy + s * L)) break;
    d.aimLen[i] = L;
  }

  function melee(i, octo, dt) {
    const w = d.who[i], cx = d.x[i], cy = cyOf(i), dx = octo.x - cx, dy = octo.y - cy, dist = Math.hypot(dx, dy) || 1e-3;
    const reach = OCTO_RADIUS + NPC_RADIUS[w] + 0.15;
    if (d.state[i] !== ST_LUNGE) d.face[i] = dx >= 0 ? 1 : -1;
    switch (d.state[i]) {
      case ST_WIND: // rears back, then lunges at where the octopus is now
        d.t[i] -= dt; drift(i, dt);
        if (d.t[i] <= 0) {
          const L = Math.hypot(dx, dy) || 1;
          d.lungeX[i] = dx / L; d.lungeY[i] = dy / L; d.state[i] = ST_LUNGE; d.t[i] = LUNGE_S; d.biteDone[i] = 0;
          d.vx[i] = d.lungeX[i] * LUNGE_SPEED; d.vy[i] = d.lungeY[i] * LUNGE_SPEED;
        }
        break;
      case ST_LUNGE:
        d.t[i] -= dt; d.vx[i] = d.lungeX[i] * LUNGE_SPEED; d.vy[i] = d.lungeY[i] * LUNGE_SPEED; advance(i, dt);
        if (!d.biteDone[i] && !octo.dead && Math.hypot(octo.x - d.x[i], octo.y - cyOf(i)) < reach) {
          d.biteDone[i] = 1;
          if (hurtOctopus(octo, d.x[i], cyOf(i), NPC_CAUSE[w])) events.push({ type: 'bite', who: w, x: d.x[i], y: cyOf(i) });
        }
        if (d.t[i] <= 0) { d.state[i] = ST_RECOVER; d.t[i] = RECOVER_S; }
        break;
      case ST_RECOVER:
        d.t[i] -= dt; drift(i, dt);
        if (d.t[i] <= 0) d.state[i] = ST_MOVE;
        break;
      default: // ST_MOVE: chase
        if (octo.dead) { drift(i, dt); break; }
        glide(i, dx / dist, dy / dist, SPEED[w], dt);
        if (dist < LUNGE_START_R && clear(cx, cy, octo.x, octo.y)) {
          d.state[i] = ST_WIND; d.t[i] = WIND_S; d.attacks[i]++;
          if ((d.attacks[i] & 3) === 1 && !talks[i].text) say1(i, pickLine(i, 'angry'));
        }
    }
  }

  function flee(i, octo, dt) {
    const dx = octo.x - d.x[i], dy = octo.y - cyOf(i), dist = Math.hypot(dx, dy) || 1e-3;
    d.face[i] = dx >= 0 ? -1 : 1;
    if (dist < 9) glide(i, -dx / dist, -dy / dist, FLEE_SPEED, dt); else drift(i, dt);
  }

  // ---- harpoons ---------------------------------------------------------------------------------------------
  function stepHarpoons(octo, dt) {
    for (let h = 0; h < HARPOON_CAP; h++) {
      if (!hp.on[h]) continue;
      const nx = hp.x[h] + hp.vx[h] * dt, ny = hp.y[h] + hp.vy[h] * dt;
      const c = Math.cos(hp.ang[h]), s = Math.sin(hp.ang[h]);
      // the sweep is sampled so a fast tip never skips a thin wall or the octopus
      const n = Math.max(1, Math.ceil(Math.hypot(nx - hp.x[h], ny - hp.y[h]) / 0.2));
      let ended = false;
      for (let k = 1; k <= n && !ended; k++) {
        const px = hp.x[h] + (nx - hp.x[h]) * k / n, py = hp.y[h] + (ny - hp.y[h]) * k / n;
        if (world.isSolid(px + c * 0.15, py + s * 0.15)) { events.push({ type: 'harpoonHit', x: px, y: py, rock: true }); ended = true; break; }
        if (!octo.dead && Math.hypot(octo.x - px, octo.y - py) < HARPOON_HIT_R && heavyHitOctopus(octo, px - c, py - s, 'harpoon')) {
          events.push({ type: 'harpoonHit', x: px, y: py, rock: false }); ended = true;
        }
      }
      hp.x[h] = nx; hp.y[h] = ny; hp.life[h] -= dt;
      if (ended || hp.life[h] <= 0) hp.on[h] = 0;
    }
  }

  return {
    data: d, harpoons: hp, events, moods, talks,

    /** Take / update this step's position for a calm NPC (the anchor is the feet for Marlo, Quill and the host, the centre for Pip).
     *  Returns true when the owner may draw it; false when this module has taken it over (hostile or dead). */
    place(who, x, anchorY, idx = 0, flags = 0) {
      if (moods.dead[who]) return false;
      let i = find(who, idx);
      if (i < 0) i = create(who, idx, x, anchorY, false, false);
      if (i < 0) return false;
      d.placed[i] = 1; d.flags[i] = flags;
      if (d.hostile[i]) return false;
      d.x[i] = x; d.y[i] = anchorY;
      return true;
    },
    /** Has this module taken the NPC over (angry or dead, in this level or earlier in the dive)? */
    owns(who) { return !!(moods.hostile[who] || moods.dead[who]); },
    isDead(who) { return !!moods.dead[who]; },
    /** Test / debug hook: a slot that stays without place() calls. */
    spawn(who, x, anchorY, hostile = false, idx = 0) {
      let i = find(who, idx);
      if (i < 0) i = create(who, idx, x, anchorY, hostile, true);
      else { d.x[i] = x; d.y[i] = anchorY; d.fixed[i] = 1; if (hostile && !d.hostile[i]) setHostile(i, true); }
      return i;
    },
    remove(who, idx = 0) { const i = find(who, idx); if (i >= 0) d.used[i] = 0; },
    find,
    setKeeper(x, y) { keeperX = x; keeperY = y; },

    /** A bomb blast at (x, y) with radius R: damage falls off linearly from BLAST_DMG; rock between shields. Returns slots hurt. */
    blast(x, y, R) {
      let n = 0;
      for (let i = 0; i < N; i++) {
        if (!d.used[i]) continue;
        const dist = Math.hypot(d.x[i] - x, cyOf(i) - y);
        if (dist > R) continue;
        if (!clear(x, y, d.x[i], cyOf(i))) continue;
        if (damage(i, BLAST_DMG * (1 - dist / R), 'bomb', x, y)) n++;
      }
      if (keeperX > -900 && Math.hypot(keeperX - x, keeperY - y) <= R && clear(x, y, keeperX, keeperY)) onKeeper('bomb');
      return n;
    },
    /** The Ink Jet hook: a hit disc at (x, y) radius r. src 'ink' | 'dash' | 'bomb'. Returns how many things were hit. */
    hit(x, y, r, dmg, src = 'ink') {
      let n = 0;
      for (let i = 0; i < N; i++) {
        if (!d.used[i]) continue;
        if (Math.hypot(d.x[i] - x, cyOf(i) - y) > r + NPC_RADIUS[d.who[i]]) continue;
        if (!clear(x, y, d.x[i], cyOf(i))) continue;
        if (damage(i, dmg, src, x, y)) n++;
      }
      if (keeperX > -900 && Math.hypot(keeperX - x, keeperY - y) <= r + 0.6 && clear(x, y, keeperX, keeperY)) { onKeeper(src); n++; }
      return n;
    },
    /** Test hook: hurt one NPC directly. */
    hurt(who, dmg, src = 'test', idx = 0) { const i = find(who, idx); return i >= 0 ? damage(i, dmg, src, d.x[i], cyOf(i) + 1) : false; },

    /** One fixed step after the octopus moved. */
    step(octo, dt) {
      if (octo.dashedThisStep) dashId++;
      const fast = !octo.dead && Math.hypot(octo.vx, octo.vy) >= DASH_KILL_SPEED;
      for (let i = 0; i < N; i++) {
        if (!d.used[i]) continue;
        if (!d.placed[i] && !d.hostile[i] && !d.fixed[i]) { d.used[i] = 0; continue; } // the owner no longer shows it
        d.placed[i] = 0;
        talkStep(talks[i], dt);
        if (d.flash[i] > 0) d.flash[i] = Math.max(0, d.flash[i] - dt);
        if (d.immune[i] > 0) d.immune[i] = Math.max(0, d.immune[i] - dt);
        if (d.reload[i] > 0) d.reload[i] = Math.max(0, d.reload[i] - dt);
        const p = protOf(i);
        if (d.prot[i] && !p) d.immune[i] = FREED_GRACE; // freed from the rock / the cage: a second to get clear of the blast
        d.prot[i] = p;
        // dash contact at speed, once per dash; not while sealed / caged, not Pip at your side, not a hub resident who is talking
        if (fast && d.dashHit[i] !== dashId && Math.hypot(octo.x - d.x[i], octo.y - cyOf(i)) < OCTO_RADIUS + NPC_RADIUS[d.who[i]] + 0.1) {
          const safe = (d.flags[i] & FL_FOLLOWING) || (hub && (d.flags[i] & FL_TALKING) && !d.hostile[i]);
          if (!safe && !shielded(i)) { d.dashHit[i] = dashId; damage(i, DASH_DMG, 'dash', octo.x, octo.y); if (!d.used[i]) continue; }
        }
        if (!d.hostile[i]) continue;
        if (hub) { if (d.state[i] === ST_FLEE) flee(i, octo, dt); else drift(i, dt); continue; }
        if (d.who[i] === NPC_MARLO) marlo(i, octo, dt); else melee(i, octo, dt);
      }
      if (keeperX > -900 && fast && keeperDash !== dashId && Math.hypot(octo.x - keeperX, octo.y - keeperY) < OCTO_RADIUS + 0.7) { keeperDash = dashId; onKeeper('dash'); }
      stepHarpoons(octo, dt);
    },

    /** Hand every pending event to fn, then clear the list (main.js calls this after place/step and after a blast). */
    drain(fn) { for (let k = 0; k < events.length; k++) fn(events[k]); events.length = 0; },

    /** Plain snapshot for tests and review (__octo.npcs). */
    list() {
      const out = [];
      for (let i = 0; i < N; i++) {
        if (!d.used[i]) continue;
        out.push({
          who: NPC_IDS[d.who[i]], idx: d.idx[i], x: d.x[i], y: d.y[i], cy: cyOf(i), hp: d.hp[i], hostile: d.hostile[i] === 1, dead: false,
          state: ST_NAMES[d.state[i]], aim: d.state[i] === ST_AIM ? d.aimT[i] : 0, aimAng: d.aimAng[i], reload: d.reload[i], flash: d.flash[i], immune: d.immune[i], face: d.face[i],
        });
      }
      for (let w = 1; w <= 4; w++) if (moods.dead[w] && !out.some((o) => o.who === NPC_IDS[w])) out.push({ who: NPC_IDS[w], idx: 0, x: 0, y: 0, cy: 0, hp: 0, hostile: true, dead: true, state: 'dead', aim: 0, aimAng: 0, reload: 0, flash: 0, immune: 0, face: 1 });
      return out;
    },
    harpoonList() {
      const out = [];
      for (let h = 0; h < HARPOON_CAP; h++) if (hp.on[h]) out.push({ x: hp.x[h], y: hp.y[h], vx: hp.vx[h], vy: hp.vy[h], ang: hp.ang[h], life: hp.life[h] });
      return out;
    },
  };
}
