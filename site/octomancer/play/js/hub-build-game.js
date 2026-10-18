// Hub building in the running game (octomancer-web/HUB-BUILDING.md): the glue between main.js and hub-build.js (rules),
// hub-build-draw.js (drawing), build-picker.js (the picker) and save.js (the hoard and the build). main.js only creates it
// and calls attach / draw / drawBack / tags / isOpen / hide; everything else lives here, so main.js keeps a few one-line hooks.

import { placeSpots, spotAt, spotPoint, builtPieces, decideBuild, CLEAR, TALLY_NEAR } from './hub-build.js';
import { drawHubBuild, drawHubBuildBack, buildBakeStats } from './hub-build-draw.js';
import { createBuildPicker } from './build-picker.js';
import { getHoard, spendHoard, getHubBuild, setHubPiece } from './save.js';

export const VILLAGE_JOURNAL = 'place-village';

/**
 * @param {{hudEl:HTMLElement, table:any, buildJson:any, level:()=>any, inHub:()=>boolean, octos:()=>Array<{x:number,y:number,dead?:boolean}>,
 *          ctx:()=>any, toast:(text:string)=>void, sfx:{chime:()=>void, thud:()=>void}, discover:(id:string)=>void,
 *          bump:(id:string)=>void, viewNear:(x:number,y:number)=>any, onOpen:()=>void, onClose:()=>void}} env
 */
export function createHubBuildGame(env) {
  const table = env.table;
  let hubBuild = getHubBuild();
  let pieces = [], piecesLevel = null, dirty = true;
  const drawState = { build: null, pieces, shells: 0, octos: [], hubBuild };

  const picker = createBuildPicker(env.hudEl, {
    table,
    ctx: env.ctx,
    hoard: getHoard,
    onBuild(spot, id) { return build(spot, id); },
    onRefuse() { env.sfx.thud(); },
    onOpen: env.onOpen,
    onClose: env.onClose,
  });

  function refresh() {
    const lv = env.level();
    if (!dirty && piecesLevel === lv) return;
    hubBuild = getHubBuild();
    pieces = builtPieces(table, lv && lv.build, hubBuild);
    piecesLevel = lv; dirty = false;
  }

  /** Build (or clear) a piece: pays from the hoard, stores it, chimes; the very first build names itself (toast) and finds the
   *  journal's Your Village page; every build counts on it. Returns true when something changed. */
  function build(spot, id) {
    const cur = getHubBuild()[spot.id] || '';
    const dec = decideBuild(table, spot, id, cur, getHoard(), env.ctx());
    if (!dec.ok) { env.sfx.thud(); return false; }
    if (dec.cost && !spendHoard(dec.cost)) { env.sfx.thud(); return false; }
    setHubPiece(spot.id, id === CLEAR ? null : id);
    dirty = true;
    env.sfx.chime();
    if (id !== CLEAR) {
      const first = !env.found(VILLAGE_JOURNAL);
      if (first) env.toast('Built: ' + table.byId.get(id).name);
      env.discover(VILLAGE_JOURNAL);
      env.bump(VILLAGE_JOURNAL);
    }
    return true;
  }

  function nearestSpot(x, y, reach) {
    const lv = env.level();
    return env.inHub() && lv && lv.build ? spotAt(lv.build, x, y, reach) : null;
  }

  return {
    /** The hub level was just built (main.js hubLevel, after applyHubRooms): lay the spots in. */
    attach(level) { placeSpots(level, env.buildJson); dirty = true; return level.build; },
    /** hand.js provider (main.js registerInteract('build', ...)). */
    interact: {
      find(o, reach) {
        if (picker.isOpen()) return null;
        const s = nearestSpot(o.x, o.y, reach);
        if (!s) return null;
        const p = spotPoint(s), d = Math.hypot(p.x - o.x, p.y - o.y), f = d > reach * 0.98 ? (reach * 0.98) / d : 1; // the hand reaches towards it
        return { x: o.x + (p.x - o.x) * f, y: o.y + (p.y - o.y) * f, ref: s.id, label: 'build', spot: s };
      },
      use(t) { return open(t && t.spot ? t.spot : null); },
    },
    /** The world pass (main.js v2Extra, after the hub rooms). */
    draw(c, camera, cw, ch, t) {
      if (!env.inHub()) return;
      refresh();
      const lv = env.level();
      drawState.build = lv && lv.build; drawState.pieces = pieces; drawState.shells = getHoard().shells; drawState.octos = env.octos(); drawState.hubBuild = hubBuild;
      drawHubBuild(c, camera, cw, ch, table, t, drawState);
    },
    /** The back-wall pass (main.js paintPass): the mosaics. */
    drawBack(c, camera, cw, ch) { if (!env.inHub()) return; refresh(); drawHubBuildBack(c, camera, cw, ch, pieces); },
    /** Anchored tags (main.js objectTags): the tally stone's count; '{hand} build' at the spot the hand is on. */
    tags(out, handTarget) {
      const lv = env.level();
      if (!env.inHub() || !lv || !lv.build || picker.isOpen()) return out;
      const T = lv.build.tally;
      if (T && env.octos().some((o) => !o.dead && Math.hypot(o.x - T.x, o.y - (T.y - 0.4)) < TALLY_NEAR)) {
        const n = getHoard().shells;
        out.push({ id: 'tally', x: T.x, y: T.y - 1.15, text: n + (n === 1 ? ' shell' : ' shells') + ' in the hoard', view: env.viewNear(T.x, T.y) });
      }
      if (handTarget && handTarget.kind === 'build' && handTarget.spot) {
        const s = handTarget.spot, p = spotPoint(s), v = env.viewNear(p.x, p.y), built = !!getHubBuild()[s.id];
        const y = s.type === 'hook' ? p.y + 0.9 : s.type === 'mural' ? s.y - s.h / 2 - 0.3 : s.type === 'niche' ? p.y - 0.9 : p.y - 1.0;
        out.push({ id: 'build', x: p.x, y, text: v.scheme === 'touch' ? (built ? 'Stay still, tap {use}: change' : 'Stay still, tap {use}: build') : (built ? '{hand} change' : '{hand} build'), view: v });
      }
      return out;
    },
    isOpen() { return picker.isOpen(); },
    hide() { picker.hide(); },
    picker,
    /** Open the picker for a spot (or the nearest one to the first octopus). */
    open,
    /** The build changed outside (tests, reset): reread it. */
    invalidate() { dirty = true; },
    /** Tests. */
    debug() {
      const lv = env.level();
      refresh();
      return { hoard: getHoard(), build: getHubBuild(), spots: lv && lv.build ? lv.build.spots.map((s) => ({ ...s, point: spotPoint(s) })) : [], pile: lv && lv.build ? lv.build.pile : null, tally: lv && lv.build ? lv.build.tally : null, pieces: pieces.map((p) => p.spot.id + ':' + p.deco.id), open: picker.isOpen(), spot: picker.spot(), cards: picker.isOpen() ? picker.cards() : [], focus: picker.focus(), bakes: buildBakeStats() };
    },
  };
  function open(spot) {
    if (picker.isOpen()) return false;
    if (!spot) { const o = env.octos()[0]; spot = o ? nearestSpot(o.x, o.y, 3) : null; }
    if (!spot || !spot.open) return false;
    return picker.show(spot, getHubBuild()[spot.id] || '');
  }
}
