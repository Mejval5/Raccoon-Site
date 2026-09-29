// HUD, pause overlay and game-over overlay: plain HTML/CSS laid over the
// canvas (OVERNIGHT.md §2 "Canvas 2D, one canvas, HUD and menus as HTML/CSS").
// OVERNIGHT.md §4 M4-1.

const HEART_SRC = './assets/ui-heart.webp';
const CREDIT_TEXT = 'Art & music: Milan Švancara'; // Milan Švancara

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} root the #hud element (pointer-events:none, children opt back in via CSS)
 * @param {{onRestart:()=>void, onExit:()=>void, onTogglePause:()=>void}} handlers
 */
export function createUI(root, handlers) {
  // --- HUD bar (hearts + stats), always visible during play ---
  const bar = el('div', 'octo-hud-bar');
  const heartsRow = el('div', 'octo-hud-hearts');
  const stats = el('div', 'octo-hud-stats');
  const bombsEl = el('span', 'octo-hud-stat octo-hud-bombs');
  const pearlsEl = el('span', 'octo-hud-stat octo-hud-pearls');
  const depthEl = el('span', 'octo-hud-stat octo-hud-depth');
  const scoreEl = el('span', 'octo-hud-stat octo-hud-score');
  const bestEl = el('span', 'octo-hud-stat octo-hud-best');
  stats.append(bombsEl, pearlsEl, depthEl, scoreEl, bestEl);
  bar.append(heartsRow, stats);

  const pauseBtn = el('button', 'octo-pause-btn', '⏸');
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', 'Pause');
  pauseBtn.addEventListener('click', () => handlers.onTogglePause && handlers.onTogglePause());

  root.append(bar, pauseBtn);

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

  function updateHud(state) {
    ensureHearts(state.heartMax);
    for (let i = 0; i < heartEls.length; i++) {
      const shown = i < state.heartMax;
      heartEls[i].style.display = shown ? '' : 'none';
      heartEls[i].style.opacity = i < state.hearts ? '1' : '0.25';
    }
    bombsEl.textContent = `Bombs ${state.bombs}`;
    pearlsEl.textContent = `Pearls ${state.pearls}`;
    depthEl.textContent = `Depth ${state.depth}m`;
    scoreEl.textContent = `Score ${state.score}`;
    bestEl.textContent = `Best ${state.best}`;
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
    el('div', 'octo-credit', CREDIT_TEXT),
  );
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
  gameover.panel.append(goTitle, goScore, goBest, restartBtn, exitBtn, goCredit);
  restartBtn.addEventListener('click', () => handlers.onRestart && handlers.onRestart());
  exitBtn.addEventListener('click', () => handlers.onExit && handlers.onExit());

  return {
    updateHud,
    showPause() { pause.overlayEl.style.display = 'flex'; },
    hidePause() { pause.overlayEl.style.display = 'none'; },
    isGameOverShown() { return gameover.overlayEl.style.display !== 'none'; },
    showGameOver(score, best) {
      goScore.textContent = `Score ${score}`;
      goBest.textContent = `Best ${best}`;
      gameover.overlayEl.style.display = 'flex';
    },
    hideGameOver() { gameover.overlayEl.style.display = 'none'; },
    focusRestart() { restartBtn.focus({ preventScroll: true }); },
  };
}
