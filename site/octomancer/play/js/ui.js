// HUD, pause overlay and game-over overlay: plain HTML/CSS laid over the
// canvas (OVERNIGHT.md §2 "Canvas 2D, one canvas, HUD and menus as HTML/CSS").
// OVERNIGHT.md §4 M4-1.

import { artUrl } from './v2-art.js';
import { drawItemIcon, itemArtVersion } from './items-draw.js';
const HEART_SRC = new URL('../assets/ui-heart.webp', import.meta.url).href; // relative to this module, not the page (the test page lives in tests/)
const CREDIT_TEXT = 'Art & music: Milan Švancara'; // Milan Švancara

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Run summary block (round 33): the generated title banner carrying the headline, a result line, label / value
 * rows, the best-runs list and a note. One per overlay (death, biome clear); `set` fills it, `el` is the node.
 */
function createSummaryBlock() {
  const box = el('div', 'octo-summary');
  const banner = el('div', 'octo-banner');
  const bannerText = el('div', 'octo-banner-text');
  banner.appendChild(bannerText);
  const headline = el('div', 'octo-summary-headline');
  const rowsEl = el('div', 'octo-summary-rows');
  const bestHead = el('div', 'octo-summary-besthead', 'Best runs');
  const bestEl = el('ol', 'octo-summary-best');
  const note = el('div', 'octo-summary-note');
  box.append(banner, headline, rowsEl, bestHead, bestEl, note);
  return {
    el: box,
    /** @param {{title:string, headline:string, rows:string[][], best:string[], rank:number, note?:string}} d */
    set(d) {
      banner.style.backgroundImage = `url(${artUrl('title-banner.webp')})`;
      bannerText.textContent = d.title;
      headline.textContent = d.headline;
      rowsEl.textContent = '';
      for (const [k, v] of d.rows) {
        const row = el('div', 'octo-summary-row');
        row.append(el('span', 'octo-summary-key', k), el('span', 'octo-summary-val', v));
        rowsEl.appendChild(row);
      }
      bestEl.textContent = '';
      d.best.forEach((line, i) => {
        const li = el('li', 'octo-summary-bestrun' + (i === d.rank ? ' is-new' : ''), line);
        bestEl.appendChild(li);
      });
      bestHead.style.display = bestEl.style.display = d.best.length ? '' : 'none';
      note.textContent = d.note || '';
      note.style.display = d.note ? '' : 'none';
    },
  };
}

/**
 * @param {HTMLElement} root the #hud element (pointer-events:none, children opt back in via CSS)
 * @param {{onRestart:()=>void, onExit:()=>void, onTogglePause:()=>void, onToggleMute?:()=>boolean, onToggleSettings?:()=>void, onOpenJournal?:()=>void, muted?:boolean}} handlers
 */
export function createUI(root, handlers) {
  // --- HUD bar (hearts + stats), always visible during play ---
  const bar = el('div', 'octo-hud-bar');
  const heartsRow = el('div', 'octo-hud-hearts');
  const stats = el('div', 'octo-hud-stats');
  const bombsEl = el('span', 'octo-hud-stat octo-hud-bombs');
  const depthEl = el('span', 'octo-hud-stat octo-hud-depth');
  const scoreEl = el('span', 'octo-hud-stat octo-hud-score');
  const bestEl = el('span', 'octo-hud-stat octo-hud-best');
  // v2 only: the run state and level ("Shallows 1-2"); it replaces depth and best.
  const stageEl = el('span', 'octo-hud-stat octo-hud-stage');
  stageEl.style.display = 'none';
  // v2 only: the shell currency (icon + count). There is no quest line: questlines are told in the world (speech bubbles, journal).
  const shellsEl = el('span', 'octo-hud-stat octo-hud-shells');
  const shellsIcon = el('img', 'octo-hud-shell-icon');
  shellsIcon.src = new URL('../assets/shell-blue.webp', import.meta.url).href;
  shellsIcon.alt = 'Shells';
  const shellsNum = el('span', 'octo-hud-shell-num', '0');
  shellsEl.append(shellsIcon, shellsNum);
  shellsEl.style.display = 'none';
  // v2 only: carried items (items.js) as small icons right after the shell counter
  const itemsEl = el('div', 'octo-hud-items'); // its own row under the stats (never runs under the pause button)
  itemsEl.style.display = 'none';
  let itemsKey = '';
  stats.append(stageEl, shellsEl, bombsEl, depthEl, scoreEl, bestEl);
  bar.append(heartsRow, stats, itemsEl);

  const pauseBtn = el('button', 'octo-pause-btn', '⏸');
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', 'Pause');
  pauseBtn.addEventListener('click', () => handlers.onTogglePause && handlers.onTogglePause());

  // Mute button: track S's "corner slot" (OVERNIGHT.md §4 S-1). Lives next
  // to the pause button, above the safe-area inset, and reflects whatever
  // `save.js`'s persisted `muted` flag already was on load.
  const muteBtn = el('button', 'octo-mute-btn', handlers.muted ? '🔇' : '🔊');
  muteBtn.type = 'button';
  muteBtn.setAttribute('aria-label', 'Mute');
  muteBtn.addEventListener('click', () => {
    const nowMuted = handlers.onToggleMute && handlers.onToggleMute();
    muteBtn.textContent = nowMuted ? '🔇' : '🔊';
  });

  // Settings gear (round 38): third corner button under mute; opens the settings panel (settings-ui.js, built by main.js)
  const gearBtn = el('button', 'octo-gear-btn', '⚙');
  gearBtn.type = 'button';
  gearBtn.setAttribute('aria-label', 'Settings');
  gearBtn.addEventListener('click', () => handlers.onToggleSettings && handlers.onToggleSettings());

  // Round-8 item 4 (NIGHT-LOG.md): "add [mouse control] to the on-screen
  // help" -- a small always-present control hint, bottom-left, listing both
  // keyboard and mouse actions (the two desktop input modes); main.js hides
  // it via `hideControlsHelp()` on the first touch input (touch-ui.js's own
  // on-screen stick/buttons are the touch equivalent) and shows it again if
  // the player switches back to keyboard/mouse.
  const controlsHelp = el('div', 'octo-controls-help',
    'Swim: WASD/arrows | Dash: Space/Shift | Bomb: B/X');
  // Round-9 fix (Daniel's screenshot review round 8, issue 3: a phone visitor
  // saw mouse/keyboard instructions at first load -- this used to always
  // start visible and only hide on the first touch input, via main.js's
  // `input.onModeChange`, so anyone opening the game on a touch device saw
  // it until their first tap. Start hidden for any coarse-pointer/touch
  // device (matching the check `main.js` already uses for its own DPR cap),
  // so it never flashes on phone at all; `onModeChange` can still show it
  // again if that device later gets a mouse/keyboard input (e.g. a
  // touch-and-mouse hybrid laptop).
  if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) {
    controlsHelp.style.display = 'none';
  }

  // v2: tutorial / hub prompt banner (top centre) and small toasts ("New journal entry")
  const promptEl = el('div', 'octo-prompt');
  promptEl.style.display = 'none';
  const promptTitle = el('div', 'octo-prompt-title');
  const promptText = el('div', 'octo-prompt-text');
  promptEl.append(promptTitle, promptText);
  const toastEl = el('div', 'octo-toast');
  toastEl.style.display = 'none';
  let toastTimer = 0;
  const toastQueue = [];

  // v2 level title card: the generated ribbon with the stage name, fades in and out at a level start
  const titleEl = el('div', 'octo-title');
  titleEl.style.display = 'none';
  const titleText = el('div', 'octo-title-text');
  const titleSub = el('div', 'octo-title-sub');
  titleEl.append(titleText, titleSub);
  let titleTimer = 0, titleTimer2 = 0;
  root.append(bar, pauseBtn, muteBtn, gearBtn, controlsHelp, promptEl, toastEl, titleEl);

  /** @type {HTMLImageElement[]} */
  const heartEls = [];
  function ensureHearts(max) {
    while (heartEls.length < max) {
      const img = el('img', 'octo-heart');
      img.src = HEART_SRC;
      img.alt = '';
      heartEls.push(img);
      heartsRow.appendChild(img);
    }
  }

  let helpV2 = false, helpRetired = false;
  let heartsKey = '';
  // r43: the HUD is updated every frame; a textContent write replaces the text node and invalidates layout even when the string is the
  // same (about 4 per frame, and the Layout showed up in the transition frames on a phone), so a write happens only on a change
  const setText = (e, t) => { if (e._t !== t) { e._t = t; e.textContent = t; } };
  function updateHud(state) {
    const hk = state.heartMax + ':' + state.hearts;
    if (hk !== heartsKey) {
      heartsKey = hk;
      ensureHearts(state.heartMax);
      for (let i = 0; i < heartEls.length; i++) {
        const shown = i < state.heartMax;
        heartEls[i].style.display = shown ? '' : 'none';
        heartEls[i].style.opacity = i < state.hearts ? '1' : '0.25';
      }
    }
    setText(bombsEl, `Bombs ${state.bombs}`);
    const v2 = state.stage !== undefined;
    if (v2 && !helpV2) { // v2 bombs are thrown: along the move keys, or at the cursor
      helpV2 = true;
      controlsHelp.textContent = 'Swim: WASD/arrows | Dash: Space/Shift | Ink jet: left-click or J/K | Spell: right-click or F | Bomb: middle-click or B/X | Spells: wheel, Q/E, 1-9 | Inventory: Tab/I';
    }
    stageEl.style.display = v2 ? '' : 'none';
    depthEl.style.display = v2 ? 'none' : '';
    bestEl.style.display = v2 ? 'none' : '';
    if (v2 && stageEl.textContent !== state.stage) stageEl.textContent = state.stage;
    shellsEl.style.display = v2 && state.shells !== undefined ? '' : 'none';
    if (state.shells !== undefined && shellsNum.textContent !== String(state.shells)) shellsNum.textContent = String(state.shells);
    const key = state.items && state.items.length ? state.items.join() + '/' + itemArtVersion() : '';
    if (key !== itemsKey) {
      itemsKey = key;
      itemsEl.textContent = '';
      // a stacked item is drawn once with an 'x2' badge
      const counts = new Map();
      for (const id of state.items || []) counts.set(id, (counts.get(id) || 0) + 1);
      for (const [id, n] of counts) {
        const c = document.createElement('canvas');
        c.width = 40; c.height = 40; c.className = 'octo-hud-item'; c.dataset.item = id; c.title = n > 1 ? id + ' x' + n : id;
        const cx = c.getContext('2d');
        drawItemIcon(cx, id, 20, 20, 15);
        if (n > 1) {
          cx.font = '700 15px Quicksand, sans-serif'; cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
          cx.lineWidth = 4; cx.strokeStyle = '#04121c'; cx.strokeText('x' + n, 40, 39);
          cx.fillStyle = '#f1e4c3'; cx.fillText('x' + n, 40, 39);
        }
        itemsEl.appendChild(c);
      }
      itemsEl.style.display = key ? '' : 'none';
    }
    setText(depthEl, `Depth ${state.depth}m`);
    setText(scoreEl, `Score ${state.score}`);
    setText(bestEl, `Best ${state.best}`);
  }

  // --- Overlays (pause, game over): dim backdrop + centred card ---
  function makeOverlay(extraClass) {
    const overlayEl = el('div', `octo-overlay ${extraClass}`);
    overlayEl.style.display = 'none';
    const panel = el('div', 'octo-overlay-panel');
    overlayEl.appendChild(panel);
    root.appendChild(overlayEl);
    return { overlayEl, panel };
  }

  const pause = makeOverlay('octo-pause-overlay');
  pause.panel.append(
    el('div', 'octo-overlay-title', 'Paused'),
    el('div', 'octo-overlay-hint', 'Esc, the pause button, or tap here to resume'),
  );
  // round 38: the journal opens from the pause menu too (not only from the hub board)
  const journalBtn = el('button', 'octo-btn-wide octo-btn-ghost', 'Journal');
  journalBtn.type = 'button';
  journalBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.onOpenJournal && handlers.onOpenJournal(); });
  pause.panel.append(journalBtn, el('div', 'octo-credit', CREDIT_TEXT));
  // Tapping the dimmed backdrop resumes too (but not clicks bubbling from
  // the panel's own future buttons, should any be added).
  pause.overlayEl.addEventListener('click', (e) => {
    if (e.target === pause.overlayEl || e.target === pause.panel || pause.panel.contains(e.target)) {
      handlers.onTogglePause && handlers.onTogglePause();
    }
  });

  const gameover = makeOverlay('octo-gameover-overlay');
  const goTitle = el('div', 'octo-overlay-title', 'The dark took you');
  const goScore = el('div', 'octo-overlay-score');
  const goBest = el('div', 'octo-overlay-best');
  const restartBtn = el('button', 'octo-btn-wide', 'Swim again');
  restartBtn.type = 'button';
  const exitBtn = el('button', 'octo-btn-wide octo-btn-ghost', 'Exit');
  exitBtn.type = 'button';
  const goCredit = el('div', 'octo-credit', CREDIT_TEXT);
  const goSummary = createSummaryBlock(); // v2: the run summary replaces the score lines
  goSummary.el.style.display = 'none';
  const goActions = el('div', 'octo-go-actions'); // V2-PLAN 14: stays in view at the bottom of the side panel / sheet
  goActions.append(restartBtn, exitBtn);
  gameover.panel.append(goTitle, goSummary.el, goScore, goBest, goActions, goCredit);
  // V2-PLAN 14: the death screen is a side panel (desktop) or a bottom sheet (phones) over a light tint with a clear hole
  // around the body, which keeps simulating. It is laid out (hidden) at the moment of death so the camera can frame the
  // body in the free part of the screen before the panel fades in.
  let goRect = null;
  window.addEventListener('resize', () => { goRect = null; });
  restartBtn.addEventListener('click', () => handlers.onRestart && handlers.onRestart());
  exitBtn.addEventListener('click', () => handlers.onExit && handlers.onExit());

  // --- v2 end-of-biome screen ---
  const endScreen = makeOverlay('octo-end-overlay');
  const endTitle = el('div', 'octo-overlay-title');
  const endSub = el('div', 'octo-overlay-score');
  const endBtn = el('button', 'octo-btn-wide', 'Back to the hub');
  endBtn.type = 'button';
  const endSummary = createSummaryBlock();
  endSummary.el.style.display = 'none';
  endScreen.panel.append(endTitle, endSub, endSummary.el, endBtn, el('div', 'octo-credit', CREDIT_TEXT));
  endBtn.addEventListener('click', () => handlers.onEndContinue && handlers.onEndContinue());

  const api = {
    updateHud,
    /** Prompt banner: title + text, or null to hide it. */
    setPrompt(title, text) {
      if (!title) { promptEl.style.display = 'none'; return; }
      if (promptTitle.textContent !== title) promptTitle.textContent = title;
      if (promptText.textContent !== text) promptText.textContent = text;
      promptEl.style.display = '';
    },
    /** Level title card ("Shallows 1-2"), optional small line under it (e.g. the seed); fades away by itself. */
    showTitle(text, sub = '', ms = 1500) {
      clearTimeout(titleTimer); clearTimeout(titleTimer2);
      titleText.textContent = text; titleSub.textContent = sub;
      titleSub.style.display = sub ? '' : 'none';
      titleEl.style.backgroundImage = `url(${artUrl('title-banner.webp')})`;
      titleEl.style.display = '';
      titleEl.style.opacity = '0';
      titleTimer2 = setTimeout(() => { titleEl.style.opacity = '1'; }, 30);
      titleTimer = setTimeout(() => { titleEl.style.opacity = '0'; titleTimer = setTimeout(() => { titleEl.style.display = 'none'; }, 700); }, ms);
    },
    /** Drop the level title card at once (a summary screen opened over it). */
    hideTitle() { clearTimeout(titleTimer); clearTimeout(titleTimer2); titleEl.style.display = 'none'; },
    titleShown() { return titleEl.style.display !== 'none'; },
    /** Text on the level title card: {text, sub}. */
    titleContent() { return { text: titleText.textContent, sub: titleSub.textContent }; },
    /** A toast replaces the one showing; with `queue` it waits for the current one to expire instead (journal announcements). */
    showToast(text, ms = 3200, queue = false, small = false) {
      if (queue && toastEl.style.display !== 'none') { if (toastQueue.length < 3) toastQueue.push({ text, ms, small }); return; }
      toastEl.textContent = text;
      toastEl.classList.toggle('is-small', !!small);
      toastEl.style.display = '';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastEl.style.display = 'none';
        const next = toastQueue.shift();
        if (next) api.showToast(next.text, next.ms, false, next.small);
      }, ms);
    },
    /** Biome-clear screen; with `detail` (see createSummaryBlock) it shows the run summary instead of the plain lines. */
    showEnd(title, sub, detail) {
      api.hideTitle();
      endTitle.textContent = title; endSub.textContent = sub;
      endTitle.style.display = endSub.style.display = detail ? 'none' : '';
      endSummary.el.style.display = detail ? '' : 'none';
      if (detail) endSummary.set(detail);
      endScreen.overlayEl.style.display = 'flex';
      endScreen.panel.scrollTop = 0;
    },
    hideEnd() { endScreen.overlayEl.style.display = 'none'; },
    isEndShown() { return endScreen.overlayEl.style.display !== 'none'; },
    /** v2: the game-over button returns to the hub. */
    setGameOverLabels(title, button) { goTitle.textContent = title; restartBtn.textContent = button; },
    hideControlsHelp() { controlsHelp.style.display = 'none'; },
    showControlsHelp() { controlsHelp.style.display = helpRetired ? 'none' : ''; },
    /** Retire the bottom-left controls line for good (the player knows the controls; Settings still lists them). */
    retireControlsHelp() { helpRetired = true; controlsHelp.style.display = 'none'; },
    showPause() { pause.overlayEl.style.display = 'flex'; },
    hidePause() { pause.overlayEl.style.display = 'none'; },
    isGameOverShown() { return gameover.overlayEl.style.display !== 'none' && !gameover.overlayEl.classList.contains('is-pending'); },
    /** The octopus just died: lay the death screen out, invisible, so its rect is known before it shows. */
    prepareGameOver() {
      gameover.overlayEl.classList.add('octo-death-ui', 'is-pending'); // v2 only (endless keeps the centred card)
      root.classList.add('octo-death-open');
      gameover.overlayEl.style.display = 'flex';
      goRect = null;
    },
    /** The death panel's rect in CSS px ({left, top, right, bottom, width, height}), or null when the death screen is not laid out. */
    gameOverPanelRect() {
      if (gameover.overlayEl.style.display === 'none') return null;
      if (!goRect) { const r = gameover.panel.getBoundingClientRect(); goRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }
      return goRect;
    },
    /** Where the clear hole in the tint is (CSS px, the body's screen position) and its radius. */
    setDeathFocus(x, y, r) {
      const st = gameover.overlayEl.style;
      st.setProperty('--bx', x.toFixed(0) + 'px'); st.setProperty('--by', y.toFixed(0) + 'px'); st.setProperty('--hole', r.toFixed(0) + 'px');
    },
    showGameOver(score, best, detail) {
      api.hideTitle();
      goScore.textContent = `Score ${score}`;
      goBest.textContent = `Best ${best}`;
      goTitle.style.display = goScore.style.display = goBest.style.display = detail ? 'none' : '';
      goSummary.el.style.display = detail ? '' : 'none';
      if (detail) goSummary.set(detail);
      gameover.overlayEl.style.display = 'flex';
      gameover.overlayEl.classList.remove('is-pending');
      gameover.panel.scrollTop = 0;
      goRect = null;
    },
    hideGameOver() { gameover.overlayEl.style.display = 'none'; gameover.overlayEl.classList.remove('is-pending'); root.classList.remove('octo-death-open'); goRect = null; },
    focusRestart() { restartBtn.focus({ preventScroll: true }); },
  };
  return api;
}
