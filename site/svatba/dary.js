/*
 * "Gift path" — the wedding gift meter, drawn as a Candy Crush style level map.
 *
 * Guests pay into a shared account by QR code; a scheduled function reads the
 * bank and /api/dary returns the total. That one number decides how far along
 * the path we are: levels below it are done, the next one is highlighted, the
 * rest can be explored by scrolling. Money itself is never shown to guests;
 * DEBUG_AMOUNTS adds small grey amounts for checking the curve and is meant to
 * be switched off.
 *
 * The path is laid out along a main axis (the direction of progress) and a
 * cross axis (the wiggle). ORIENTATION picks how those map to the screen:
 *   - 'vertical':   level 1 at the bottom, climbing upwards; scrolls up/down.
 *   - 'horizontal': level 1 on the left, going right; scrolls sideways.
 * A page can override it with data-orientation on #dary-meter, and
 * ?darypath=vertical|horizontal does the same for a quick look.
 *
 * Everything here is self-contained: it reads window.SVATBA_I18N (defined in
 * svatba-i18n.js) and the current <html lang> for translated strings, and
 * never touches svatba.js or the RSVP/captcha code.
 *
 * Layout is never measured at load time (the whole page is display:none
 * until the invite token gate opens). Positions are CSS (px along the main
 * axis, % across it); the only reads of box sizes happen when scrolling the
 * window, from a ResizeObserver or a scroll/click handler.
 */
(function () {
  'use strict';

  // ---- Settings ---------------------------------------------------------------
  var ORIENTATION = 'vertical';
  // Small grey amounts next to each level plus the raw total in a corner, for
  // checking the curve. Set to false and no amount appears anywhere.
  var DEBUG_AMOUNTS = true;

  var LEVEL_COUNT = 50;
  var MAX_AMOUNT = 2500000;
  // Level amounts follow MAX_AMOUNT * (i / LEVEL_COUNT) ^ CURVE, rounded to
  // friendly numbers: >1 makes early steps small and later ones bigger.
  var CURVE = 1.6;

  // Distances along the main axis are px, across it % of the window.
  // `focus` is where the next level sits in the window, as a fraction along
  // the direction of progress (0 = the level 1 end, 1 = the far end).
  var LAYOUT = {
    vertical: { step: 118, padStart: 64, padEnd: 130, amp: 30, focus: 0.58 },
    horizontal: { step: 176, padStart: 70, padEnd: 210, amp: 24, focus: 0.5 }
  };

  var DEMO_TOTAL = 0;
  // On localhost there is no hosting rewrite for /api/dary, so stay on
  // DEMO_TOTAL there (driven only by the test hooks below). Everywhere else,
  // ask the backend; on any failure (offline, a 403, ...) resolve to null so
  // the caller silently keeps the last known total. Never throws, never logs.
  function loadTotal() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return Promise.resolve(DEMO_TOTAL);
    }
    // Firebase Hosting drops our cookie on the way to the function, so send the invite token explicitly.
    var m = document.cookie.match(/(?:^|;\s*)svatba=([^;]*)/);
    var inviteToken = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/dary', { credentials: 'same-origin', headers: { 'X-Svatba-Token': inviteToken } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && typeof d.total === 'number' ? d.total : null; })
      .catch(function () { return null; });
  }

  // ---- Gift QR / bank details ------------------------------------------------
  // Filled in once the dedicated account exists; the whole QR block in the
  // markup (see #dary-qr) stays hidden while GIFT_IBAN is empty.
  var GIFT_IBAN = '';
  var GIFT_ACCOUNT_LABEL = '';

  // ---- Icons ------------------------------------------------------------------
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
    // three small cat heads huddled together
    threeCats:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2.6 9 L2 6.2 M5.4 9 L6 6.2"/><circle cx="4" cy="10.6" r="2.6"/>' +
      '<path d="M9.6 7.6 L9 4.8 M12.4 7.6 L13 4.8"/><circle cx="11" cy="9.2" r="2.6"/>' +
      '<path d="M16.6 9 L16 6.2 M19.4 9 L20 6.2"/><circle cx="18" cy="10.6" r="2.6"/>' +
      '</svg>',
    // a small push lawnmower, side view
    lawnmower:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="6.4" cy="18.2" r="2.2"/>' +
      '<circle cx="16.6" cy="18.2" r="2.2"/>' +
      '<path d="M4.6 15.6 H18.4 L16.8 12.2 H6.2 Z"/>' +
      '<path d="M15.6 12.6 L20.8 5"/>' +
      '<path d="M19 4.2 L22.2 6.2"/>' +
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
      '</svg>',
    // cat head wearing a small crown
    catCrown:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M8 11 L6.5 7 L10 9.6 M16 11 L17.5 7 L14 9.6"/>' +
      '<circle cx="12" cy="15.2" r="5.2"/>' +
      '<path d="M8.5 8.6 L9.6 5 L11.2 7.8 L12 4.6 L12.8 7.8 L14.4 5 L15.5 8.6"/>' +
      '</svg>',
    // two clinking champagne glasses
    champagneToast:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<g transform="rotate(-18 7 8)"><path d="M5 4 H9 L7.6 11 C7.6 12.4 6.4 12.4 6.4 11 Z"/><path d="M7 12.5 V16 M5.2 16.4 H8.8"/></g>' +
      '<g transform="rotate(18 17 8)"><path d="M15 4 H19 L17.6 11 C17.6 12.4 16.4 12.4 16.4 11 Z"/><path d="M17 12.5 V16 M15.2 16.4 H18.8"/></g>' +
      '<circle cx="12" cy="6.2" r=".6" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="3.8" r=".5" fill="currentColor" stroke="none"/>' +
      '</svg>',
    // scratching post: a wrapped post on a small base
    scratchingPost:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M8 21 H16"/>' +
      '<path d="M12 21 V4"/>' +
      '<path d="M9 6 Q12 7.2 15 6 M9 10 Q12 11.2 15 10 M9 14 Q12 15.2 15 14 M9 18 Q12 19.2 15 18"/>' +
      '</svg>',
    // d20 die: hexagonal silhouette with facet lines
    d20Die:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2.5 L21 8 V16 L12 21.5 L3 16 V8 Z"/>' +
      '<path d="M12 2.5 V21.5 M3 8 L12 12.5 L21 8 M3 16 L12 12.5 L21 16"/>' +
      '</svg>',
    // round robot vacuum, top-down
    robotVacuum:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="13" r="8"/>' +
      '<circle cx="12" cy="13" r="2.2"/>' +
      '<path d="M4 20 C7 18.4 17 18.4 20 20"/>' +
      '</svg>',
    // hot tub with rising bubbles
    hotTub:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="9" width="18" height="10" rx="5"/>' +
      '<path d="M6 13.5 Q8 12 10 13.5 T14 13.5 T18 13.5"/>' +
      '<circle cx="9" cy="6.5" r=".9" fill="currentColor" stroke="none"/>' +
      '<circle cx="12.5" cy="4.8" r=".7" fill="currentColor" stroke="none"/>' +
      '<circle cx="15" cy="6.8" r=".8" fill="currentColor" stroke="none"/>' +
      '</svg>',
    // a small bunch of grapes with a stem
    grapes:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3.5 V6"/>' +
      '<path d="M12 5 C9.5 5 8.5 7 9.5 8.3"/>' +
      '<circle cx="12" cy="8" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="9" cy="10.6" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="15" cy="10.6" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="13" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="7.5" cy="14.6" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="16.5" cy="14.6" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="10.5" cy="17" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="13.5" cy="17" r="2" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="19.5" r="2" fill="currentColor" stroke="none"/>' +
      '</svg>',
    // a brick wall
    wallBricks:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="5" width="18" height="14" rx="1"/>' +
      '<path d="M3 10 H21 M3 15 H21 M9 5 V10 M15 5 V10 M6 10 V15 M12 10 V15 M18 10 V15 M9 15 V19 M15 15 V19"/>' +
      '</svg>',
    // a roof (with a small chimney) sitting on a hint of wall
    roof:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2.5 13 L12 4 L21.5 13"/>' +
      '<path d="M5 12.4 V18 H19 V12.4"/>' +
      '<path d="M16 8.4 V4.5 H18.4 V6.4"/>' +
      '</svg>',
    // the finished house with a small heart above the door
    houseHeart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 11 L12 4 L20 11"/>' +
      '<path d="M6 10 V20 H18 V10"/>' +
      '<path d="M10.3 20 V16.6 H13.7 V20"/>' +
      '<path d="M12 15.4 C11.4 14.3 9.9 14.5 9.9 15.7 C9.9 16.8 12 18.3 12 18.3 C12 18.3 14.1 16.8 14.1 15.7 C14.1 14.5 12.6 14.3 12 15.4 Z" fill="currentColor" stroke="none"/>' +
      '</svg>',
    // a garage: peaked roof over a sectional door
    garage:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2.5 9 L12 3.5 L21.5 9"/>' +
      '<path d="M4 8.4 V20 H20 V8.4"/>' +
      '<path d="M6 11 H18 M6 14 H18 M6 17 H18"/>' +
      '</svg>'
  };

  // ---- Levels -----------------------------------------------------------------
  // One icon per level; texts are dary.l<N>.title / .text in svatba-i18n.js.
  var LEVEL_ICONS = [
    'scratchingPost', 'catTreat', 'd20Die', 'resinDrop', 'threeCats', 'lawnmower', 'workshop', 'waveSun', 'robotVacuum', 'apricotTree',
    'plane', 'houseDoor', 'catCrown', 'catTreat', 'd20Die', 'hotTub', 'houseDoor', 'champagneToast', 'catCrown', 'workshop',
    'apricotTree', 'plane', 'lawnmower', 'wallBricks', 'threeCats', 'resinDrop', 'grapes', 'grapes', 'apricotTree', 'hotTub',
    'lawnmower', 'roof', 'threeCats', 'waveSun', 'robotVacuum', 'apricotTree', 'd20Die', 'garage', 'houseDoor', 'threeCats',
    'waveSun', 'roof', 'houseHeart', 'catCrown', 'houseDoor', 'plane', 'grapes', 'grapes', 'catTreat', 'houseHeart'
  ];

  function niceRound(x) {
    var unit = x < 10000 ? 1000 : x < 100000 ? 5000 : x < 1000000 ? 10000 : 50000;
    return Math.max(unit, Math.round(x / unit) * unit);
  }
  var LEVELS = [];
  (function () {
    var prev = 0;
    for (var i = 1; i <= LEVEL_COUNT; i++) {
      var amount = i === LEVEL_COUNT ? MAX_AMOUNT : niceRound(MAX_AMOUNT * Math.pow(i / LEVEL_COUNT, CURVE));
      if (amount <= prev) amount = prev + 1000; // keep it strictly increasing whatever CURVE is
      LEVELS.push({ n: i, amount: amount, icon: ICON[LEVEL_ICONS[i - 1]] || ICON.catTreat });
      prev = amount;
    }
  })();

  // How far a total gets us: `done` levels reached, `frac` of the way to the next.
  function progressFor(amount) {
    var done = 0;
    while (done < LEVELS.length && amount >= LEVELS[done].amount) done++;
    if (done === LEVELS.length) return { done: done, frac: 0 };
    var from = done ? LEVELS[done - 1].amount : 0;
    var to = LEVELS[done].amount;
    return { done: done, frac: Math.max(0, Math.min(1, (amount - from) / (to - from))) };
  }

  // ---- State ------------------------------------------------------------------
  var root, scroller, map, levelsEl, svgEl, trailEl, doneEl, avatarEl, backBtn, statusEl, debugEl, toastEl, toastTimer = null;
  var orient = ORIENTATION, geo;
  var shownAmount = 0;     // what the path currently shows (animates towards realAmount)
  var realAmount = 0;
  var shownDone = -1;
  var realAnimRaf = null;
  var hasLoadedTotal = false;
  var hasScrolledToNow = false;
  var pollTimer = null;

  // ---- i18n helpers -------------------------------------------------------------
  function currentLang() {
    return document.documentElement.lang || 'cs';
  }
  function dict(lang) {
    return (window.SVATBA_I18N && window.SVATBA_I18N[lang]) || {};
  }
  function t(key, vars) {
    var d = dict(currentLang());
    var s = d[key] != null ? d[key] : dict('cs')[key] != null ? dict('cs')[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function localeTag(lang) {
    if (lang === 'en') return 'en-GB';
    if (lang === 'fr') return 'fr-FR';
    return 'cs-CZ';
  }
  function formatAmount(amount) {
    var rounded = Math.round(amount / 100) * 100;
    try {
      return new Intl.NumberFormat(localeTag(currentLang()), { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(rounded);
    } catch (e) {
      return rounded + ' Kč';
    }
  }
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // ---- Geometry -------------------------------------------------------------------
  // Point k: 0 is the start, 1..LEVEL_COUNT the levels. `s` runs along the main
  // axis in px, `c` across it in % (a gentle zigzag that never sits dead centre,
  // so every label has room on one side).
  function makeGeometry() {
    var L = LAYOUT[orient];
    var length = L.padStart + LEVEL_COUNT * L.step + L.padEnd;
    var pts = [];
    for (var k = 0; k <= LEVEL_COUNT; k++) {
      pts.push({ s: L.padStart + k * L.step, c: 50 + L.amp * Math.sin((k + 0.5) * Math.PI / 3) });
    }
    return { step: L.step, length: length, pts: pts };
  }
  // (s, c) -> SVG user units. Vertical: x = c, y grows downwards so level 1 is at the bottom.
  function toXY(s, c) {
    return orient === 'vertical' ? [c, geo.length - s] : [s, c];
  }
  function fmt(p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); }
  // The cubic between points k and k+1, in (s, c): flat tangents along the main axis.
  function bezier(k) {
    var a = geo.pts[k], b = geo.pts[k + 1], h = geo.step / 2;
    return [[a.s, a.c], [a.s + h, a.c], [b.s - h, b.c], [b.s, b.c]];
  }
  function lerp(p, q, u) { return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]; }
  // First part (0..u) of a cubic, by de Casteljau.
  function splitBezier(b, u) {
    var p01 = lerp(b[0], b[1], u), p12 = lerp(b[1], b[2], u), p23 = lerp(b[2], b[3], u);
    var p012 = lerp(p01, p12, u), p123 = lerp(p12, p23, u);
    return [b[0], p01, p012, lerp(p012, p123, u)];
  }
  function curveTo(b) {
    return ' C ' + fmt(toXY(b[1][0], b[1][1])) + ', ' + fmt(toXY(b[2][0], b[2][1])) + ', ' + fmt(toXY(b[3][0], b[3][1]));
  }
  // Path from the start through `upto` whole segments plus `u` of the next one.
  function pathD(upto, u) {
    var p0 = geo.pts[0];
    var d = 'M ' + fmt(toXY(p0.s, p0.c));
    for (var k = 0; k < upto && k < LEVEL_COUNT; k++) d += curveTo(bezier(k));
    if (upto < LEVEL_COUNT && u > 0) d += curveTo(splitBezier(bezier(upto), u));
    return d;
  }
  function positionOf(progress) {
    if (progress.done >= LEVEL_COUNT) {
      var last = geo.pts[LEVEL_COUNT];
      return { s: last.s, c: last.c };
    }
    var end = splitBezier(bezier(progress.done), progress.frac)[3];
    return { s: end[0], c: end[1] };
  }
  // Absolutely positions an element's centre (via CSS translate) on (s, c).
  function place(el, s, c) {
    if (orient === 'vertical') {
      el.style.left = c + '%';
      el.style.top = (geo.length - s) + 'px';
    } else {
      el.style.left = s + 'px';
      el.style.top = c + '%';
    }
  }
  // Labels go on the side of the dot with more room.
  var DOT_GAP = 26;
  function placeLabel(el, s, c) {
    el.className = 'dary-label';
    if (orient === 'vertical') {
      el.style.top = (geo.length - s) + 'px';
      if (c >= 50) {
        el.classList.add('is-left');
        el.style.left = '4px';
        el.style.right = 'calc(' + (100 - c) + '% + ' + DOT_GAP + 'px)';
      } else {
        el.classList.add('is-right');
        el.style.left = 'calc(' + c + '% + ' + DOT_GAP + 'px)';
        el.style.right = '4px';
      }
    } else {
      el.style.left = s + 'px';
      if (c < 50) {
        el.classList.add('is-below');
        el.style.top = 'calc(' + c + '% + ' + DOT_GAP + 'px)';
      } else {
        el.classList.add('is-above');
        el.style.bottom = 'calc(' + (100 - c) + '% + ' + DOT_GAP + 'px)';
      }
    }
  }

  // ---- DOM ------------------------------------------------------------------------
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var APRICOT =
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs><radialGradient id="dary-apricot-grad" cx="35%" cy="30%" r="75%">' +
    '<stop offset="0%" stop-color="#ffcf8a"></stop><stop offset="55%" stop-color="#f5a55a"></stop><stop offset="100%" stop-color="#e07b39"></stop>' +
    '</radialGradient></defs>' +
    '<circle cx="16" cy="17" r="12" fill="url(#dary-apricot-grad)"></circle>' +
    '<path d="M16,7 C14.5,10 14.5,13 16,16" fill="none" stroke="#c96a30" stroke-width="1" stroke-linecap="round" opacity=".55"></path>' +
    '<path d="M17,6 C19,3 22.5,2.7 24,4 C22,5 19.5,5.6 17,6 Z" fill="#6f9b52"></path>' +
    '</svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 L10 17 L19 7"/></svg>';

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function createDom() {
    root = document.getElementById('dary-meter');
    scroller = document.getElementById('dary-path');
    if (!root || !scroller) return false;
    // ?darypath= wins, then the guest's own pick, then the page's, then ORIENTATION.
    var param = (window.location.search.match(/[?&]darypath=(vertical|horizontal)/) || [])[1];
    var saved = null;
    try { saved = window.localStorage.getItem(VIEW_KEY); } catch (e) { /* storage blocked */ }
    orient = param || (LAYOUT[saved] ? saved : null) || root.getAttribute('data-orientation') || ORIENTATION;
    if (!LAYOUT[orient]) orient = 'vertical';

    var frame = scroller.parentElement; // .dary-frame, position: relative
    createViewToggle(frame);

    backBtn = el('button', 'dary-back', frame);
    backBtn.type = 'button';
    backBtn.hidden = true;
    backBtn.addEventListener('click', function () { scrollToNow(true); });

    toastEl = el('div', 'dary-toast', frame);
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.hidden = true;

    if (DEBUG_AMOUNTS) {
      debugEl = el('span', 'dary-debug-total', frame);
      debugEl.setAttribute('aria-hidden', 'true');
    }

    statusEl = el('p', 'dary-sr', frame);
    statusEl.setAttribute('aria-live', 'polite');

    scroller.addEventListener('scroll', updateBackButton, { passive: true });
    buildMap();
    return true;
  }

  // ---- Vertical / horizontal toggle ------------------------------------------------
  var VIEW_KEY = 'svatba-dary-view';
  var VIEW_ICONS = {
    vertical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20 C7 17 17 13 12 9 V4"/><path d="M8.5 7 L12 3.5 L15.5 7"/></svg>',
    horizontal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12 C7 7 11 17 15 12 H20"/><path d="M17 8.5 L20.5 12 L17 15.5"/></svg>'
  };
  var viewBtns = {};
  function createViewToggle(frame) {
    var wrap = document.createElement('div');
    wrap.className = 'dary-view';
    wrap.setAttribute('role', 'group');
    frame.parentElement.insertBefore(wrap, frame);
    ['vertical', 'horizontal'].forEach(function (o) {
      var b = el('button', 'dary-view-btn', wrap);
      b.type = 'button';
      b.innerHTML = VIEW_ICONS[o] + '<span></span>';
      b.addEventListener('click', function () { setOrientation(o); });
      viewBtns[o] = b;
    });
  }
  function renderViewToggle() {
    viewBtns.vertical.parentElement.setAttribute('aria-label', t('dary.view.label'));
    ['vertical', 'horizontal'].forEach(function (o) {
      viewBtns[o].querySelector('span').textContent = t('dary.view.' + o);
      viewBtns[o].setAttribute('aria-pressed', String(o === orient));
    });
  }
  function setOrientation(o) {
    if (!LAYOUT[o] || o === orient) return;
    try { window.localStorage.setItem(VIEW_KEY, o); } catch (e) { /* only this visit then */ }
    cancelRealAnim(); // a walk in progress jumps to its end
    shownAmount = realAmount;
    orient = o;
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
    map.remove();
    buildMap();
    renderTexts();
    scrollToNow(false);
    updateBackButton();
  }

  // The map itself: rebuilt from scratch when the orientation changes.
  function buildMap() {
    root.setAttribute('data-orientation', orient);
    geo = makeGeometry();
    map = el('div', 'dary-map', scroller);
    if (orient === 'vertical') map.style.height = geo.length + 'px';
    else map.style.width = geo.length + 'px';

    svgEl = document.createElementNS(SVG_NS, 'svg');
    svgEl.setAttribute('class', 'dary-trail');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.setAttribute('viewBox', orient === 'vertical' ? '0 0 100 ' + geo.length : '0 0 ' + geo.length + ' 100');
    trailEl = document.createElementNS(SVG_NS, 'path');
    trailEl.setAttribute('class', 'dary-trail-todo');
    trailEl.setAttribute('d', pathD(LEVEL_COUNT, 0));
    doneEl = document.createElementNS(SVG_NS, 'path');
    doneEl.setAttribute('class', 'dary-trail-done');
    svgEl.appendChild(trailEl);
    svgEl.appendChild(doneEl);
    map.appendChild(svgEl);

    var start = el('span', 'dary-start', map);
    place(start, geo.pts[0].s, geo.pts[0].c);
    start.setAttribute('aria-hidden', 'true');

    levelsEl = el('ol', 'dary-levels', map);
    LEVELS.forEach(function (lv, i) {
      var p = geo.pts[i + 1];
      var li = el('li', 'dary-level is-future', levelsEl);
      li.setAttribute('data-level', String(lv.n));
      var dot = el('span', 'dary-dot', li);
      dot.innerHTML = '<span class="dary-dot-icon">' + lv.icon + '</span><span class="dary-dot-check">' + CHECK + '</span>';
      place(dot, p.s, p.c);
      var label = el('div', 'dary-label', li);
      placeLabel(label, p.s, p.c);
      var kicker = el('span', 'dary-kicker', label);
      el('span', 'dary-kicker-level', kicker);
      el('span', 'dary-tag', kicker);
      if (DEBUG_AMOUNTS) el('span', 'dary-debug', kicker).textContent = formatAmount(lv.amount);
      el('span', 'dary-label-title', label);
      el('span', 'dary-label-text', label);
    });

    var endCap = el('p', 'dary-end', map);
    var endPt = geo.pts[LEVEL_COUNT];
    place(endCap, endPt.s + LAYOUT[orient].padEnd * 0.6, 50);

    avatarEl = el('span', 'dary-avatar', map);
    avatarEl.innerHTML = APRICOT;
    avatarEl.setAttribute('aria-hidden', 'true');
  }

  // Texts that depend on the language.
  function renderTexts() {
    var items = levelsEl.children;
    for (var i = 0; i < items.length; i++) {
      var n = i + 1;
      items[i].querySelector('.dary-kicker-level').textContent = t('dary.level', { n: n });
      items[i].querySelector('.dary-label-title').textContent = t('dary.l' + n + '.title');
      items[i].querySelector('.dary-label-text').textContent = t('dary.l' + n + '.text');
    }
    map.querySelector('.dary-end').textContent = t('dary.beyond');
    scroller.setAttribute('aria-label', t('dary.path.label'));
    backBtn.textContent = t('dary.backToNow');
    renderViewToggle();
    shownDone = -1; // refresh the tags and the status line
    render({ silent: true });
  }

  // ---- Drawing the current progress --------------------------------------------------
  function render(opts) {
    opts = opts || {};
    var prog = progressFor(shownAmount);
    doneEl.setAttribute('d', pathD(prog.done, prog.frac));
    var pos = positionOf(prog);
    place(avatarEl, pos.s, pos.c);
    if (debugEl) debugEl.textContent = formatAmount(realAmount);
    if (prog.done === shownDone) return;

    var items = levelsEl.children;
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var state = i < prog.done ? 'done' : i === prog.done ? 'next' : 'future';
      var was = li.getAttribute('data-state');
      if (was === state) continue;
      li.setAttribute('data-state', state);
      li.className = 'dary-level is-' + state;
      li.querySelector('.dary-tag').textContent = state === 'done' ? t('dary.done') : state === 'next' ? t('dary.nextLabel') : '';
      if (state === 'next') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      if (state === 'done' && was && was !== 'done' && !opts.silent) playLightUp(li);
    }
    shownDone = prog.done;
    statusEl.textContent = prog.done >= LEVEL_COUNT
      ? t('dary.statusAll', { total: LEVEL_COUNT })
      : t('dary.status', { done: prog.done, total: LEVEL_COUNT, title: t('dary.l' + (prog.done + 1) + '.title') });
  }

  function playLightUp(li) {
    if (prefersReducedMotion()) return;
    var dot = li.querySelector('.dary-dot');
    li.classList.remove('is-lighting');
    void li.offsetWidth; // restart the animation cleanly
    li.classList.add('is-lighting');
    var ring = el('span', 'dary-ring', dot);
    var sparks = [];
    var sparkCount = 6 + Math.floor(Math.random() * 3);
    for (var i = 0; i < sparkCount; i++) {
      var spark = el('span', 'dary-spark', dot);
      var angle = (Math.PI * 2 * i) / sparkCount + (Math.random() * 0.5 - 0.25);
      var dist = 16 + Math.random() * 10;
      spark.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      spark.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
      sparks.push(spark);
    }
    window.setTimeout(function () {
      li.classList.remove('is-lighting');
      ring.remove();
      sparks.forEach(function (s) { s.remove(); });
    }, 650);
  }

  // ---- Scrolling the window ----------------------------------------------------------
  // Main-axis position s -> the scroll offset that puts it at FOCUS along the window.
  function scrollTargetFor(s) {
    var focus = LAYOUT[orient].focus;
    if (orient === 'vertical') return geo.length - s - scroller.clientHeight * (1 - focus);
    return s - scroller.clientWidth * focus;
  }
  function nowS() {
    var prog = progressFor(shownAmount);
    var k = Math.min(LEVEL_COUNT, prog.done + 1);
    return geo.pts[k].s; // the next level (or the last one)
  }
  function getScroll() { return orient === 'vertical' ? scroller.scrollTop : scroller.scrollLeft; }
  function setScroll(v) {
    if (orient === 'vertical') scroller.scrollTop = v;
    else scroller.scrollLeft = v;
  }
  // Our own eased scroll: native smooth scrolling is skipped by some browsers
  // (and fights the page's scroll-behavior), this always runs.
  var scrollRaf = null;
  function animateScroll(target, ms) {
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = null;
    var from = getScroll();
    if (!ms || prefersReducedMotion() || document.hidden || Math.abs(target - from) < 2) {
      setScroll(target);
      return;
    }
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / ms);
      setScroll(from + (target - from) * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2));
      scrollRaf = p < 1 ? requestAnimationFrame(step) : null;
    }
    scrollRaf = requestAnimationFrame(step);
  }
  function scrollToNow(smooth) {
    if (!scroller.clientHeight) return false; // not laid out yet (page still hidden)
    animateScroll(Math.max(0, scrollTargetFor(nowS())), smooth ? 700 : 0);
    return true;
  }
  // While the apricot walks, keep it in view.
  function followAvatar() {
    if (!scroller.clientHeight) return;
    var s = positionOf(progressFor(shownAmount)).s;
    var target = Math.max(0, scrollTargetFor(s));
    var cur = getScroll();
    setScroll(cur + (target - cur) * 0.12);
  }
  // "Back to where we are" shows once the next level and the apricot are both out of view.
  function updateBackButton() {
    if (!scroller.clientHeight) return;
    var lo, hi;
    if (orient === 'vertical') {
      hi = geo.length - scroller.scrollTop;
      lo = hi - scroller.clientHeight;
    } else {
      lo = scroller.scrollLeft;
      hi = lo + scroller.clientWidth;
    }
    var s = nowS(), a = positionOf(progressFor(shownAmount)).s, m = 30;
    var inView = function (x) { return x > lo + m && x < hi - m; };
    backBtn.hidden = inView(s) || inView(a);
  }
  function initResizeObserver() {
    var onSize = function () {
      if (!hasScrolledToNow && hasLoadedTotal && scrollToNow(false)) hasScrolledToNow = true;
      updateBackButton();
    };
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', onSize);
      return;
    }
    new ResizeObserver(onSize).observe(scroller);
  }

  // ---- Live-increase toast ------------------------------------------------------------
  function showGiftToast() {
    toastEl.textContent = t('dary.live.toast');
    toastEl.hidden = false;
    void toastEl.offsetWidth; // restart the fade cleanly if a gift arrives again quickly
    toastEl.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
      toastTimer = window.setTimeout(function () { toastEl.hidden = true; }, 300);
    }, 3000);
  }

  // ---- Real total ---------------------------------------------------------------------
  function clampAmount(amount) {
    return Math.max(0, Math.min(MAX_AMOUNT, Number(amount) || 0));
  }
  function cancelRealAnim() {
    if (realAnimRaf) {
      cancelAnimationFrame(realAnimRaf);
      realAnimRaf = null;
    }
  }
  function setRealTotal(amount) {
    cancelRealAnim();
    realAmount = shownAmount = clampAmount(amount);
    render({ silent: true });
  }
  // The apricot walks forward along the path; each level it passes lights up
  // in turn, and the window follows to the new next level.
  var REAL_INCREASE_MS = 1600;
  function animateRealIncrease(newAmount) {
    cancelRealAnim();
    var from = shownAmount;
    realAmount = newAmount;
    showGiftToast();
    // A hidden tab gets no animation frames: jump straight to the result.
    if (prefersReducedMotion() || document.hidden) {
      shownAmount = newAmount;
      render();
      scrollToNow(false);
      updateBackButton();
      return;
    }
    var startTime = null;
    function ease(x) { return 1 - Math.pow(1 - x, 3); }
    function step(ts) {
      if (startTime === null) startTime = ts;
      var p = Math.min(1, (ts - startTime) / REAL_INCREASE_MS);
      shownAmount = from + (newAmount - from) * ease(p);
      render();
      followAvatar();
      if (p < 1) {
        realAnimRaf = requestAnimationFrame(step);
      } else {
        shownAmount = newAmount;
        render();
        realAnimRaf = null;
        scrollToNow(true);
      }
    }
    realAnimRaf = requestAnimationFrame(step);
  }
  // Single seam for both the poller and the test hook: the first value just
  // jumps there, an increase after that animates, anything else (equal, or a
  // downward admin correction) jumps quietly.
  function applyRealTotalUpdate(amount) {
    var newAmount = clampAmount(amount);
    if (!hasLoadedTotal) {
      setRealTotal(newAmount);
      hasLoadedTotal = true;
      if (scrollToNow(false)) hasScrolledToNow = true;
      return;
    }
    if (newAmount > realAmount + 0.5) {
      animateRealIncrease(newAmount);
    } else if (Math.abs(newAmount - realAmount) > 0.5) {
      setRealTotal(newAmount);
      scrollToNow(true);
    }
    updateBackButton();
  }

  // ---- Polling for a live-updating total ------------------------------------------------
  var POLL_MS = 60000;
  function clearPollTimer() {
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }
  function pollOnce() {
    loadTotal().then(function (amount) {
      if (amount != null) applyRealTotalUpdate(amount);
    });
  }
  function scheduleNextPoll() {
    clearPollTimer();
    pollTimer = window.setTimeout(function () {
      pollOnce();
      scheduleNextPoll();
    }, POLL_MS);
  }
  // Paused while the tab is hidden, resumed (on its normal cadence, not
  // immediately) when it becomes visible again.
  function startPolling() {
    if (!document.hidden) scheduleNextPoll();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearPollTimer();
      } else if (!pollTimer) {
        scheduleNextPoll();
      }
    });
  }

  // ---- Gift QR / bank details --------------------------------------------------
  function spdString() {
    return 'SPD*1.0*ACC:' + GIFT_IBAN + '*CC:CZK*MSG:SVATBA TEREZA A DANIEL';
  }
  function copyAccountNumber(btn) {
    var text = GIFT_ACCOUNT_LABEL;
    var mark = function () {
      btn.textContent = t('dary.contribute.copied');
      btn.classList.add('is-copied');
      window.setTimeout(function () {
        btn.textContent = t('dary.contribute.copy');
        btn.classList.remove('is-copied');
      }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(mark, mark);
      return;
    }
    // Fallback for browsers/contexts without the async clipboard API.
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* clipboard just won't fill in; the number is still on screen */ }
    mark();
  }
  // Hidden by default (see markup); only shown once both GIFT_IBAN and
  // GIFT_ACCOUNT_LABEL are filled in. Text/aria-label come from data-i18n /
  // data-i18n-attr on the static markup itself, so language changes need no
  // extra handling here.
  function initQrBlock() {
    var qrRoot = document.getElementById('dary-qr');
    if (!qrRoot) return;
    if (!GIFT_IBAN || !GIFT_ACCOUNT_LABEL) {
      qrRoot.hidden = true;
      return;
    }
    qrRoot.hidden = false;
    var accountEl = document.getElementById('dary-qr-account-value');
    if (accountEl) accountEl.textContent = GIFT_ACCOUNT_LABEL;
    var canvas = document.getElementById('dary-qr-canvas');
    if (canvas) {
      if (window.QRCode && window.QRCode.toCanvas) {
        window.QRCode.toCanvas(canvas, spdString(), {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 168,
          color: { dark: '#2b2230', light: '#f6efe4' }
        }, function (err) {
          if (err) qrRoot.hidden = true; // don't show a blank canvas
        });
      } else {
        qrRoot.hidden = true; // QR library failed to load
      }
    }
    var copyBtn = document.getElementById('dary-qr-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () { copyAccountNumber(copyBtn); });
  }

  // ---- Language changes -----------------------------------------------------------------
  function initLangObserver() {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'lang') {
          renderTexts();
          return;
        }
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  // ---- Test-only hooks (localhost only) ----------------------------------------------------
  function exposeTestHook() {
    var host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return;
    // Sets the real (shared) total, through the same path a 60 s poll takes.
    window.__daryMeterSetTotal = function (amount) {
      applyRealTotalUpdate(amount);
    };
    // The computed level amounts, for checking the curve.
    window.__daryMeterLevels = function () {
      return LEVELS.map(function (lv) { return lv.amount; });
    };
    // The exact SPD string the QR block encodes (null while GIFT_IBAN is empty).
    window.__daryMeterSpdString = function () {
      return GIFT_IBAN ? spdString() : null;
    };
  }

  function init() {
    if (!createDom()) return;
    initQrBlock();
    renderTexts();
    initResizeObserver();
    initLangObserver();
    exposeTestHook();
    loadTotal().then(function (amount) {
      applyRealTotalUpdate(amount || 0);
      startPolling();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
