/*
 * "Gift milestone meter" — a MOCKUP progress meter for the wedding invitation.
 * The amount shown is NOT real money; this only exists so Daniel can drag it
 * around with a mouse or a finger and see how the feel of it lands. Friends
 * of theirs did the same idea with honeymoon-destination milestones and their
 * guests loved pushing the number further, so this is our version with a
 * string of funny "life upgrades" instead.
 *
 * Everything here is self-contained: it reads window.SVATBA_I18N (defined in
 * svatba-i18n.js) and the current <html lang> for translated strings, and
 * never touches svatba.js or the RSVP/captcha code.
 *
 * Layout is never measured at load time (the whole page is display:none
 * until the invite token gate opens) — track width is only read inside
 * pointer handlers and a ResizeObserver callback, both of which run lazily,
 * long after the gate has actually opened.
 */
(function () {
  'use strict';

  // ---- Milestone data -----------------------------------------------------
  // Amounts in CZK. Evenly spaced along the track: milestone i sits at
  // (i + 1) / 10 of the track width (10%, 20%, … 90%), leaving a small tail
  // from 90% to 100% for the "beyond the last milestone" range.
  var ICON = {
    // cat head with a small treat
    catTreat:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M8 10 L6 4 L10 8 M16 10 L18 4 L14 8"/>' +
      '<path d="M8 10 C8 15 10 18 12 18 C14 18 16 15 16 10 C16 8 14 7 12 7 C10 7 8 8 8 10 Z"/>' +
      '<circle cx="9.5" cy="11" r=".6" fill="currentColor" stroke="none"/>' +
      '<circle cx="14.5" cy="11" r=".6" fill="currentColor" stroke="none"/>' +
      '<circle cx="18.5" cy="16.5" r="2" stroke-width="1.4"/>' +
      '</svg>',
    // resin drop above a casting mould
    resinDrop:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 8 H20 M6 8 L7 18 H17 L18 8"/>' +
      '<path d="M12 3.5 C10 6.8 9 9 9 10.5 C9 12.2 10.4 13.4 12 13.4 C13.6 13.4 15 12.2 15 10.5 C15 9 14 6.8 12 3.5 Z"/>' +
      '</svg>',
    // two cat heads
    twoCats:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4.5 7.5 L3.5 3.5 L6.5 6.2 M8.5 7.5 L9.5 3.5 L6.5 6.2"/>' +
      '<path d="M4.5 7.5 C4.5 11.5 5.5 14 6.5 14 C7.5 14 8.5 11.5 8.5 7.5 C8.5 6.4 7.6 5.6 6.5 5.6 C5.4 5.6 4.5 6.4 4.5 7.5 Z"/>' +
      '<path d="M15.5 9.5 L14.5 5.5 L17.5 8 M19.5 9.5 L20.5 5.5 L17.5 8"/>' +
      '<path d="M15.5 9.5 C15.5 13.3 16.5 15.8 17.5 15.8 C18.5 15.8 19.5 13.3 19.5 9.5 C19.5 8.4 18.6 7.6 17.5 7.6 C16.4 7.6 15.5 8.4 15.5 9.5 Z"/>' +
      '</svg>',
    // tent with a small tree
    tentTree:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 19 L9 8 L14 19 Z"/>' +
      '<path d="M9 8 L9 19 M6.4 13.5 H11.6"/>' +
      '<path d="M18 19 L18 14.5 M18 15.5 L15.7 17.5 M18 14.5 L20.3 16.5 M18 12.5 L16.2 14 M18 12.5 L19.8 14"/>' +
      '</svg>',
    // workshop drill / grinder
    workshop:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4.5 13 H12.5 V9 H4.5 Z"/>' +
      '<path d="M12.5 11 H15.5"/>' +
      '<path d="M15.5 9.2 L19.5 9.2 L17.6 11 L19.5 12.8 L15.5 12.8 Z"/>' +
      '<path d="M6.5 13 V16 M9.5 13 V16"/>' +
      '</svg>',
    // wave and sun
    waveSun:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="8" r="2.8"/>' +
      '<path d="M12 3.2 V1.8 M12 12.2 V13.6 M16.6 8 H18 M6 8 H7.4 M15.2 4.8 L16.2 3.8 M7.8 4.8 L6.8 3.8"/>' +
      '<path d="M3 16.5 C5 15.2 7 15.2 9 16.5 C11 17.8 13 17.8 15 16.5 C17 15.2 19 15.2 21 16.5"/>' +
      '<path d="M3 20 C5 18.7 7 18.7 9 20 C11 21.3 13 21.3 15 20 C17 18.7 19 18.7 21 20"/>' +
      '</svg>',
    // apricot tree with fruit
    apricotTree:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 21 V14.2"/>' +
      '<path d="M12 14.2 C8 14.2 6 11.3 6 8.4 C6 6 8 4.6 9.8 5.5 C10.3 3.6 12.3 3.1 13.3 4.5 C15.2 4 16.6 5.5 16.1 7.4 C17.6 7.9 17.6 10.4 15.7 11.3 C14.8 13.6 12 14.2 12 14.2 Z"/>' +
      '<circle cx="9.6" cy="9" r=".9" fill="currentColor" stroke="none"/>' +
      '<circle cx="14" cy="10.4" r=".9" fill="currentColor" stroke="none"/>' +
      '</svg>',
    // paper-plane style aircraft
    plane:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 13.5 L20 6 L14 20 L11.3 14.3 L4 13.5 Z"/>' +
      '<path d="M11.3 14.3 L15 10.5"/>' +
      '</svg>',
    // house with a door
    houseDoor:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 11 L12 4 L20 11"/>' +
      '<path d="M6 10 V20 H18 V10"/>' +
      '<path d="M10.3 20 V14.3 H13.7 V20"/>' +
      '</svg>'
  };

  var MILESTONES = [
    { amount: 2000, key: 'm1', icon: ICON.catTreat },
    { amount: 5000, key: 'm2', icon: ICON.resinDrop },
    { amount: 10000, key: 'm3', icon: ICON.twoCats },
    { amount: 20000, key: 'm4', icon: ICON.tentTree },
    { amount: 35000, key: 'm5', icon: ICON.workshop },
    { amount: 50000, key: 'm6', icon: ICON.waveSun },
    { amount: 80000, key: 'm7', icon: ICON.apricotTree },
    { amount: 120000, key: 'm8', icon: ICON.plane },
    { amount: 200000, key: 'm9', icon: ICON.houseDoor }
  ];

  // Breakpoints for the piecewise-linear position <-> amount mapping.
  // Index i sits at pct = i * 10; BREAKPOINTS[0] is the left end (0 CZK),
  // BREAKPOINTS[1..9] are the nine milestone amounts, BREAKPOINTS[10] is the
  // "beyond the last milestone" amount at the right end of the track.
  var BREAKPOINTS = [0].concat(MILESTONES.map(function (m) { return m.amount; })).concat([250000]);
  var MAX_AMOUNT = 250000;

  // ---- State ---------------------------------------------------------------
  var root, track, fill, handle, nodesWrap, amountValueEl, panelEl;
  var currentPct = 0;
  var litState = [];
  var panelKey = null; // null (not yet rendered) | 'none' | 'beyond' | <milestone index>
  var dragging = false;
  var crossfadeTimer = null;

  // ---- i18n helpers ---------------------------------------------------------
  function currentLang() {
    return document.documentElement.lang || 'cs';
  }
  function dict(lang) {
    return (window.SVATBA_I18N && window.SVATBA_I18N[lang]) || {};
  }
  function t(key) {
    var lang = currentLang();
    var d = dict(lang);
    if (d[key] != null) return d[key];
    var cs = dict('cs');
    return cs[key] != null ? cs[key] : key;
  }
  function localeTag(lang) {
    if (lang === 'en') return 'en-GB';
    if (lang === 'fr') return 'fr-FR';
    return 'cs-CZ';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function roundToHundred(amount) {
    return Math.round(amount / 100) * 100;
  }
  // The big amount: digits in the display serif, the currency (Kč / CZK) set small in the label font.
  // Cormorant's "č" carries a very tall floating háček that looks broken at display size.
  function renderAmount(el, amount) {
    var rounded = roundToHundred(amount);
    var parts;
    try {
      parts = new Intl.NumberFormat(localeTag(currentLang()), { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).formatToParts(rounded);
    } catch (e) {
      parts = [{ type: 'integer', value: String(rounded) }, { type: 'literal', value: ' ' }, { type: 'currency', value: 'Kč' }];
    }
    el.textContent = '';
    parts.forEach(function (p) {
      if (p.type === 'currency') {
        var cur = document.createElement('span');
        cur.className = 'dary-amount-currency';
        cur.textContent = p.value;
        el.appendChild(cur);
      } else {
        el.appendChild(document.createTextNode(p.value));
      }
    });
  }
  function formatAmount(amount) {
    var rounded = roundToHundred(amount);
    try {
      return new Intl.NumberFormat(localeTag(currentLang()), {
        style: 'currency',
        currency: 'CZK',
        maximumFractionDigits: 0
      }).format(rounded);
    } catch (e) {
      return rounded + ' Kč';
    }
  }

  // ---- Position <-> amount mapping -----------------------------------------
  function pctToAmount(pct) {
    pct = Math.max(0, Math.min(100, pct));
    var idx = Math.min(9, Math.floor(pct / 10));
    var p0 = idx * 10;
    var p1 = p0 + 10;
    var a0 = BREAKPOINTS[idx];
    var a1 = BREAKPOINTS[idx + 1];
    var frac = p1 === p0 ? 0 : (pct - p0) / (p1 - p0);
    return a0 + (a1 - a0) * frac;
  }
  function amountToPct(amount) {
    amount = Math.max(0, Math.min(MAX_AMOUNT, amount));
    for (var i = 0; i < 10; i++) {
      var a0 = BREAKPOINTS[i];
      var a1 = BREAKPOINTS[i + 1];
      if (amount <= a1 || i === 9) {
        var frac = a1 === a0 ? 0 : (amount - a0) / (a1 - a0);
        return i * 10 + frac * 10;
      }
    }
    return 100;
  }

  // ---- DOM setup -------------------------------------------------------------
  function createDom() {
    root = document.getElementById('dary-meter');
    if (!root) return false;
    track = document.getElementById('dary-track');
    fill = document.getElementById('dary-track-fill');
    handle = document.getElementById('dary-handle');
    nodesWrap = document.getElementById('dary-nodes');
    amountValueEl = document.getElementById('dary-amount-value');
    panelEl = document.getElementById('dary-panel');
    return !!(track && fill && handle && nodesWrap && amountValueEl && panelEl);
  }

  function renderNodes() {
    nodesWrap.innerHTML = '';
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      var pct = (i + 1) * 10;
      var node = document.createElement('div');
      node.className = 'dary-node ' + (i % 2 === 0 ? 'label-above' : 'label-below');
      node.style.left = pct + '%';
      node.setAttribute('data-index', String(i));

      var dot = document.createElement('span');
      dot.className = 'dary-node-dot';
      dot.innerHTML = m.icon;
      node.appendChild(dot);

      var label = document.createElement('span');
      label.className = 'dary-node-amount';
      label.textContent = formatAmount(m.amount);
      node.appendChild(label);

      nodesWrap.appendChild(node);
    }
  }

  function renderNodeLabels() {
    var nodeEls = nodesWrap.children;
    for (var i = 0; i < nodeEls.length && i < MILESTONES.length; i++) {
      var label = nodeEls[i].querySelector('.dary-node-amount');
      if (label) label.textContent = formatAmount(MILESTONES[i].amount);
    }
  }

  // ---- Light-up animation (pop + expanding ring + sparkles) -----------------
  function playLightUp(nodeEl) {
    if (prefersReducedMotion()) return;
    var dot = nodeEl.querySelector('.dary-node-dot');
    if (!dot) return;

    nodeEl.classList.remove('is-lighting');
    void nodeEl.offsetWidth; // force reflow so the animation restarts cleanly
    nodeEl.classList.add('is-lighting');

    var ring = document.createElement('span');
    ring.className = 'dary-node-ring';
    dot.appendChild(ring);

    var sparkCount = 6 + Math.floor(Math.random() * 3); // 6-8
    var sparks = [];
    for (var i = 0; i < sparkCount; i++) {
      var spark = document.createElement('span');
      spark.className = 'dary-spark';
      var angle = (Math.PI * 2 * i) / sparkCount + (Math.random() * 0.5 - 0.25);
      var dist = 13 + Math.random() * 9;
      spark.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      spark.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
      dot.appendChild(spark);
      sparks.push(spark);
    }

    window.setTimeout(function () {
      nodeEl.classList.remove('is-lighting');
      ring.remove();
      sparks.forEach(function (s) { s.remove(); });
    }, 650);
  }

  // ---- Detail panel -----------------------------------------------------------
  function lastLitIndex(litArr) {
    var last = -1;
    for (var i = 0; i < litArr.length; i++) {
      if (litArr[i]) last = i;
    }
    return last;
  }

  function panelMilestoneHtml(idx) {
    var m = MILESTONES[idx];
    var titleKey = 'dary.' + m.key + '.title';
    var textKey = 'dary.' + m.key + '.text';
    return (
      '<div class="dary-panel-icon">' + m.icon + '</div>' +
      '<div class="dary-panel-body">' +
      '<h3 class="dary-panel-title">' + escapeHtml(t(titleKey)) + '</h3>' +
      '<p class="dary-panel-desc">' + escapeHtml(t(textKey)) + '</p>' +
      '</div>'
    );
  }

  function crossfadeContent(updateFn) {
    if (prefersReducedMotion()) {
      updateFn();
      return;
    }
    window.clearTimeout(crossfadeTimer);
    panelEl.classList.add('is-fading');
    crossfadeTimer = window.setTimeout(function () {
      updateFn();
      panelEl.classList.remove('is-fading');
    }, 150);
  }

  function updatePanel(amount, litArr) {
    var last = lastLitIndex(litArr);
    var key = last < 0 ? 'none' : last === MILESTONES.length - 1 ? 'beyond' : last;

    var nextLine = '';
    if (last < 0) {
      nextLine = '';
    } else if (last === MILESTONES.length - 1) {
      nextLine = t('dary.beyond');
    } else {
      var remaining = Math.max(0, MILESTONES[last + 1].amount - amount);
      nextLine = t('dary.next').replace('{amount}', formatAmount(remaining));
    }

    var contentChanged = key !== panelKey;

    function paint() {
      if (last < 0) {
        panelEl.innerHTML = '<p class="dary-panel-empty">' + escapeHtml(t('dary.none')) + '</p>';
      } else {
        panelEl.innerHTML = panelMilestoneHtml(last) + '<p class="dary-panel-next">' + escapeHtml(nextLine) + '</p>';
      }
    }

    if (contentChanged) {
      panelKey = key;
      crossfadeContent(paint);
    } else if (last >= 0) {
      // Same milestone still shown: just keep the "next stop" line current,
      // without a fade, since it changes continuously while dragging.
      var nextEl = panelEl.querySelector('.dary-panel-next');
      if (nextEl) nextEl.textContent = nextLine;
    } else {
      var emptyEl = panelEl.querySelector('.dary-panel-empty');
      if (emptyEl) emptyEl.textContent = t('dary.none');
    }
  }

  // ---- Core render ------------------------------------------------------------
  function render(opts) {
    opts = opts || {};
    var amount = pctToAmount(currentPct);

    fill.style.width = currentPct + '%';
    handle.style.left = currentPct + '%';
    renderAmount(amountValueEl, amount);

    var rounded = roundToHundred(amount);
    handle.setAttribute('aria-valuenow', String(rounded));
    handle.setAttribute('aria-valuetext', formatAmount(amount));

    var nodeEls = nodesWrap.children;
    var newLit = [];
    for (var i = 0; i < MILESTONES.length; i++) {
      newLit[i] = amount >= MILESTONES[i].amount - 0.5;
    }
    for (i = 0; i < nodeEls.length && i < MILESTONES.length; i++) {
      var el = nodeEls[i];
      var wasLit = !!litState[i];
      var isLit = newLit[i];
      if (isLit && !wasLit && !opts.silent) playLightUp(el);
      el.classList.toggle('is-lit', isLit);
    }
    litState = newLit;

    updatePanel(amount, newLit);
  }

  function setPct(pct, opts) {
    currentPct = Math.max(0, Math.min(100, pct));
    render(opts);
  }

  // ---- Pointer + keyboard interaction ----------------------------------------
  function pctFromClientX(clientX) {
    // Layout is measured lazily, right here, never cached — the section can
    // still be display:none at load time behind the invite token gate.
    var rect = track.getBoundingClientRect();
    if (rect.width <= 0) return currentPct;
    var pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  function onPointerDown(e) {
    if (typeof e.button === 'number' && e.button !== 0) return;
    dragging = true;
    handle.classList.add('is-dragging');
    if (track.setPointerCapture) {
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    setPct(pctFromClientX(e.clientX));
    handle.focus();
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (!dragging) return;
    setPct(pctFromClientX(e.clientX));
  }
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    if (track.releasePointerCapture) {
      try { track.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }

  function onKeyDown(e) {
    var step = 1;
    var big = 10;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        setPct(currentPct - step);
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        setPct(currentPct + step);
        e.preventDefault();
        break;
      case 'PageDown':
        setPct(currentPct - big);
        e.preventDefault();
        break;
      case 'PageUp':
        setPct(currentPct + big);
        e.preventDefault();
        break;
      case 'Home':
        setPct(0);
        e.preventDefault();
        break;
      case 'End':
        setPct(100);
        e.preventDefault();
        break;
      default:
        return;
    }
  }

  // ---- Lazy layout hook (ResizeObserver, no cached sizes anywhere) -----------
  function initResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    var ro = new ResizeObserver(function () {
      // Node/handle positions are plain CSS percentages, so a resize never
      // needs a stored width — this just keeps everything else (aria text,
      // panel) in sync without reading or caching any box size itself.
      render({ silent: true });
    });
    ro.observe(track);
  }

  // ---- Language changes --------------------------------------------------------
  function initLangObserver() {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'lang') {
          onLangChange();
          return;
        }
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  function onLangChange() {
    renderNodeLabels();
    panelKey = null; // force the panel to rebuild its text in the new language
    render({ silent: true });
  }

  // ---- Test-only hook (localhost only, mockup value entry) -------------------
  function exposeTestHook() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      window.__daryMeterSet = function (amount) {
        setPct(amountToPct(Number(amount) || 0));
      };
    }
  }

  function init() {
    if (!createDom()) return;
    renderNodes();

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    handle.addEventListener('keydown', onKeyDown);

    initResizeObserver();
    initLangObserver();
    exposeTestHook();

    setPct(0, { silent: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
