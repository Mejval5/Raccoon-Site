/*
 * "Gift milestone meter" — a progress meter for the wedding invitation.
 *
 * Guests pay into a shared account by QR code; a scheduled function will
 * later read the bank API and write the real total into the database. That
 * pipeline does not exist yet: `loadTotal()` is the single seam it will
 * plug into (see the comment above it), and for now it resolves to
 * DEMO_TOTAL. Everything downstream — the pin on the track, the big amount,
 * which milestones are lit, the panel list — is driven by that one number.
 *
 * Two interaction modes, chosen by the MODE constant below:
 *   - 'preview'  (default today): the apricot starts on the real total.
 *     Guests can drag/tap/key it further right to preview what more money
 *     would unlock. On release it glides back to the real total.
 *   - 'readonly' (future): the apricot just sits on the real total, no
 *     dragging. Hover/tap tooltips on the milestones still work in both
 *     modes.
 *
 * Everything here is self-contained: it reads window.SVATBA_I18N (defined in
 * svatba-i18n.js) and the current <html lang> for translated strings, and
 * never touches svatba.js or the RSVP/captcha code.
 *
 * Layout is never measured at load time (the whole page is display:none
 * until the invite token gate opens) — sizes are only read lazily, inside
 * pointer/tooltip handlers and a ResizeObserver callback.
 */
(function () {
  'use strict';

  // ---- Mode + real total ----------------------------------------------------
  // 'preview' (guests can drag to preview a bigger total) or 'readonly' (once
  // dragging no longer makes sense — e.g. after the wedding). Flip this one
  // constant to switch behaviour everywhere.
  var MODE = 'preview';

  // Placeholder for the real, shared total until the bank-reading scheduled
  // function exists. loadTotal() is the one seam that will change: swap its
  // body for a fetch to a Firestore-backed endpoint (e.g.
  // `/svatba/api/dary-total`) that returns the latest amount written by that
  // function. Everything else in this file only ever calls loadTotal() and
  // setRealTotal() — nothing else needs to know where the number comes from.
  var DEMO_TOTAL = 0;
  function loadTotal() {
    // TODO: replace with something like
    //   return fetch('/svatba/api/dary-total').then(function (r) { return r.json(); }).then(function (d) { return d.total; });
    // once the scheduled function that reads the bank API is in place.
    return Promise.resolve(DEMO_TOTAL);
  }

  // ---- Milestone data ---------------------------------------------------------
  // Amounts in CZK. Evenly spaced along the track: milestone i sits at
  // (i + 1) / (N + 1) of the track width, leaving a small tail at the end
  // for the "beyond the last milestone" range.
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

  // Amounts in CZK. `major` marks the six milestones whose amount also gets a
  // small label on the track itself (desktop only) — every milestone, major
  // or not, still shows its amount in the hover/tap card and the list below.
  var MILESTONES = [
    { amount: 1000, key: 'm1', icon: ICON.scratchingPost },
    { amount: 2000, key: 'm2', icon: ICON.catTreat },
    { amount: 3000, key: 'm3', icon: ICON.d20Die },
    { amount: 5000, key: 'm4', icon: ICON.resinDrop, major: true },
    { amount: 10000, key: 'm5', icon: ICON.threeCats },
    { amount: 20000, key: 'm6', icon: ICON.lawnmower },
    { amount: 35000, key: 'm7', icon: ICON.workshop },
    { amount: 50000, key: 'm8', icon: ICON.waveSun, major: true },
    { amount: 65000, key: 'm9', icon: ICON.robotVacuum },
    { amount: 80000, key: 'm10', icon: ICON.apricotTree },
    { amount: 120000, key: 'm11', icon: ICON.plane },
    { amount: 200000, key: 'm12', icon: ICON.houseDoor, major: true },
    { amount: 300000, key: 'm13', icon: ICON.catCrown },
    { amount: 400000, key: 'm14', icon: ICON.hotTub },
    { amount: 500000, key: 'm15', icon: ICON.champagneToast, major: true },
    { amount: 750000, key: 'm16', icon: ICON.wallBricks },
    { amount: 1000000, key: 'm17', icon: ICON.grapes, major: true },
    { amount: 1200000, key: 'm18', icon: ICON.roof },
    { amount: 1600000, key: 'm19', icon: ICON.garage },
    { amount: 2000000, key: 'm20', icon: ICON.houseHeart, major: true }
  ];

  // Breakpoints for the piecewise-linear position <-> amount mapping.
  // Node i (0-based) sits at pct = (i + 1) * SEG_PCT; BREAKPOINTS[0] is the
  // left end (0 CZK), BREAKPOINTS[1..N] are the milestone amounts,
  // BREAKPOINTS[N + 1] is the "beyond the last milestone" amount at the
  // right end of the track.
  var BREAKPOINTS = [0].concat(MILESTONES.map(function (m) { return m.amount; })).concat([2500000]);
  var MAX_AMOUNT = 2500000;
  var SEGMENTS = MILESTONES.length + 1;
  var SEG_PCT = 100 / SEGMENTS;

  // ---- State ---------------------------------------------------------------
  var root, track, trackWrap, fill, handle, nodesWrap, amountValueEl, previewTagEl, panelEl, pinEl, tooltipEl, chipEl;
  var displayPct = 0;     // what the handle/fill/nodes currently show
  var realPct = 0;        // where the real total sits on the track
  var realAmount = 0;
  var isPreviewing = false;
  var litState = [];
  var dragging = false;
  var snapbackRaf = null;

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
  function isMobileLayout() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 699px)').matches);
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
    var idx = Math.min(SEGMENTS - 1, Math.floor(pct / SEG_PCT));
    var p0 = idx * SEG_PCT;
    var p1 = p0 + SEG_PCT;
    var a0 = BREAKPOINTS[idx];
    var a1 = BREAKPOINTS[idx + 1];
    var frac = p1 === p0 ? 0 : (pct - p0) / (p1 - p0);
    return a0 + (a1 - a0) * frac;
  }
  function amountToPct(amount) {
    amount = Math.max(0, Math.min(MAX_AMOUNT, amount));
    for (var i = 0; i < SEGMENTS; i++) {
      var a0 = BREAKPOINTS[i];
      var a1 = BREAKPOINTS[i + 1];
      if (amount <= a1 || i === SEGMENTS - 1) {
        var frac = a1 === a0 ? 0 : (amount - a0) / (a1 - a0);
        return i * SEG_PCT + frac * SEG_PCT;
      }
    }
    return 100;
  }

  // ---- DOM setup -------------------------------------------------------------
  function createDom() {
    root = document.getElementById('dary-meter');
    if (!root) return false;
    track = document.getElementById('dary-track');
    trackWrap = track ? track.parentElement : null;
    fill = document.getElementById('dary-track-fill');
    handle = document.getElementById('dary-handle');
    nodesWrap = document.getElementById('dary-nodes');
    amountValueEl = document.getElementById('dary-amount-value');
    panelEl = document.getElementById('dary-panel');
    chipEl = root.querySelector('.dary-chip');
    return !!(track && trackWrap && fill && handle && nodesWrap && amountValueEl && panelEl);
  }

  function createPreviewTag() {
    var amountWrap = amountValueEl.parentElement; // .dary-amount
    previewTagEl = document.createElement('span');
    previewTagEl.className = 'dary-preview-tag';
    previewTagEl.hidden = true;
    // Placed right after the big amount, before the "raised" label.
    amountValueEl.insertAdjacentElement('afterend', previewTagEl);
  }

  function createPin() {
    pinEl = document.createElement('div');
    pinEl.className = 'dary-real-pin';
    pinEl.setAttribute('aria-hidden', 'true');
    track.appendChild(pinEl);
  }

  function createTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'dary-tooltip';
    tooltipEl.className = 'dary-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.hidden = true;
    // A SIBLING of trackWrap (not a child): trackWrap has a fixed height sized
    // just for the track itself, so an in-flow child on phones would overlap
    // it instead of sitting below it. Placed right after trackWrap, inside
    // `root` (a .paper card, already position:relative), which both gives the
    // desktop floating bubble a positioning context and lets the mobile
    // static card fall naturally below the track in the document flow.
    trackWrap.insertAdjacentElement('afterend', tooltipEl);
  }

  function renderNodes() {
    nodesWrap.innerHTML = '';
    var majorSeen = 0; // alternates above/below among the MAJOR nodes only
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      var pct = (i + 1) * SEG_PCT;
      var node = document.createElement('div');
      node.className = 'dary-node';
      node.style.left = pct + '%';
      node.setAttribute('data-index', String(i));

      var dot = document.createElement('span');
      dot.className = 'dary-node-dot';
      dot.innerHTML = m.icon;
      dot.setAttribute('aria-describedby', 'dary-tooltip');
      node.appendChild(dot);

      // Only the six `major` milestones get a track label (desktop only,
      // hidden on phones via CSS either way) — every milestone still shows
      // its amount in the hover/tap card and the reached/next list.
      if (m.major) {
        node.classList.add(majorSeen % 2 === 0 ? 'label-above' : 'label-below');
        majorSeen++;
        var label = document.createElement('span');
        label.className = 'dary-node-amount';
        label.textContent = formatAmount(m.amount);
        node.appendChild(label);
      }

      nodesWrap.appendChild(node);
      wireNodeTooltip(i, dot);
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
  // Top: the next goal as a faded row with the amount still missing. Below it: every milestone
  // already reached, newest first (the newest one is featured). Rows are added and removed
  // incrementally, so only a newly reached milestone animates in and dragging stays smooth.
  var panelBuilt = false;
  var shownCount = 0;   // how many reached milestones are in the list
  var nextShown = -2;   // index shown in the "next" row; -1 = everything reached
  var nextBox, emptyEl, reachedLabel, reachedList;

  function milestoneInner(idx) {
    var m = MILESTONES[idx];
    return (
      '<div class="dary-row-icon">' + m.icon + '</div>' +
      '<div class="dary-row-body">' +
      '<div class="dary-row-heading">' +
      '<h3 class="dary-row-title">' + escapeHtml(t('dary.' + m.key + '.title')) + '</h3>' +
      '<span class="dary-row-amount">' + escapeHtml(formatAmount(m.amount)) + '</span>' +
      '</div>' +
      '<p class="dary-row-desc">' + escapeHtml(t('dary.' + m.key + '.text')) + '</p>' +
      '</div>'
    );
  }

  function buildPanel() {
    panelEl.innerHTML =
      '<div class="dary-next"></div>' +
      '<p class="dary-panel-empty"></p>' +
      '<p class="dary-reached-label"></p>' +
      '<ol class="dary-reached"></ol>';
    nextBox = panelEl.querySelector('.dary-next');
    emptyEl = panelEl.querySelector('.dary-panel-empty');
    reachedLabel = panelEl.querySelector('.dary-reached-label');
    reachedList = panelEl.querySelector('.dary-reached');
    emptyEl.textContent = t('dary.none');
    reachedLabel.textContent = t('dary.reached');
    shownCount = 0;
    nextShown = -2;
    panelBuilt = true;
  }

  function updatePanel(amount, litArr) {
    var fresh = !panelBuilt;
    if (fresh) buildPanel();

    var count = 0;
    while (count < litArr.length && litArr[count]) count++;
    var animate = !fresh && !prefersReducedMotion();

    var nextIdx = count < MILESTONES.length ? count : -1;
    if (nextIdx !== nextShown) {
      if (nextIdx < 0) {
        nextBox.className = 'dary-next is-beyond';
        nextBox.innerHTML = '<p class="dary-beyond">' + escapeHtml(t('dary.beyond')) + '</p>';
      } else {
        nextBox.className = 'dary-next';
        nextBox.innerHTML =
          '<p class="dary-next-label">' + escapeHtml(t('dary.nextLabel')) + '</p>' +
          '<div class="dary-row is-next">' + milestoneInner(nextIdx) + '</div>' +
          '<p class="dary-next-missing"></p>';
      }
      nextShown = nextIdx;
    }
    if (nextIdx >= 0) {
      var missing = nextBox.querySelector('.dary-next-missing');
      if (missing) missing.textContent = t('dary.next').replace('{amount}', formatAmount(Math.max(0, MILESTONES[nextIdx].amount - amount)));
    }

    emptyEl.hidden = count > 0;
    reachedLabel.hidden = count === 0;

    while (shownCount < count) {
      var li = document.createElement('li');
      li.className = 'dary-row' + (animate ? ' is-new' : '');
      li.innerHTML = milestoneInner(shownCount);
      reachedList.insertBefore(li, reachedList.firstChild);
      shownCount++;
    }
    while (shownCount > count) {
      reachedList.removeChild(reachedList.firstChild);
      shownCount--;
    }
  }

  // ---- Core render ------------------------------------------------------------
  function render(opts) {
    opts = opts || {};
    var amount = pctToAmount(displayPct);

    fill.style.width = displayPct + '%';
    handle.style.left = displayPct + '%';
    renderAmount(amountValueEl, amount);
    if (previewTagEl) {
      previewTagEl.hidden = !isPreviewing;
      if (isPreviewing) previewTagEl.textContent = t('dary.previewTag');
    }

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

  function setDisplayPct(pct, opts) {
    displayPct = Math.max(0, Math.min(100, pct));
    render(opts);
  }

  // ---- Real total (the eventual shared/bank-fed number) -----------------------
  function positionPin() {
    if (pinEl) pinEl.style.left = realPct + '%';
  }
  function setRealTotal(amount) {
    realAmount = Math.max(0, Math.min(MAX_AMOUNT, Number(amount) || 0));
    realPct = amountToPct(realAmount);
    positionPin();
    if (!isPreviewing) {
      displayPct = realPct;
      render({ silent: true });
    }
  }

  // ---- Preview mode: drag away from the real total, then glide back ----------
  function beginPreview() {
    if (MODE !== 'preview') return false;
    if (snapbackRaf) {
      cancelAnimationFrame(snapbackRaf);
      snapbackRaf = null;
    }
    isPreviewing = true;
    return true;
  }

  function animateDisplayTo(targetPct, duration, onDone) {
    duration = duration || 450;
    if (prefersReducedMotion()) {
      displayPct = targetPct;
      render();
      if (onDone) onDone();
      return;
    }
    var startPct = displayPct;
    var delta = targetPct - startPct;
    if (Math.abs(delta) < 0.05) {
      displayPct = targetPct;
      render();
      if (onDone) onDone();
      return;
    }
    var startTime = null;
    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
    function step(ts) {
      if (startTime === null) startTime = ts;
      var elapsed = ts - startTime;
      var progress = Math.min(1, elapsed / duration);
      displayPct = startPct + delta * easeOutCubic(progress);
      render();
      if (progress < 1) {
        snapbackRaf = requestAnimationFrame(step);
      } else {
        displayPct = targetPct;
        render();
        snapbackRaf = null;
        if (onDone) onDone();
      }
    }
    snapbackRaf = requestAnimationFrame(step);
  }

  function endPreviewAndSnapBack() {
    if (!isPreviewing) return;
    animateDisplayTo(realPct, 450, function () {
      isPreviewing = false;
      render({ silent: true });
    });
  }

  // ---- Pointer + keyboard interaction ----------------------------------------
  function pctFromClientX(clientX) {
    // Layout is measured lazily, right here, never cached — the section can
    // still be display:none at load time behind the invite token gate.
    var rect = track.getBoundingClientRect();
    if (rect.width <= 0) return displayPct;
    var pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  // Nearest milestone to a given page X, by track position — purely
  // geometric, so it works regardless of how densely the (up to 20) node
  // hit-areas overlap on a narrow phone, and regardless of which exact
  // element the touch actually landed on.
  function nearestMilestoneIndex(clientX) {
    var rect = track.getBoundingClientRect();
    if (rect.width <= 0) return -1;
    var pct = ((clientX - rect.left) / rect.width) * 100;
    var best = -1;
    var bestDist = Infinity;
    for (var i = 0; i < MILESTONES.length; i++) {
      var nodePct = (i + 1) * SEG_PCT;
      var d = Math.abs(pct - nodePct);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function onPointerDown(e) {
    // Recorded regardless of MODE, so a touch tap still opens a milestone's
    // card in readonly mode even though nothing below moves the handle.
    if (e.pointerType === 'touch') {
      touchTapStart = { x: e.clientX, y: e.clientY };
    }
    if (!beginPreview()) return; // readonly mode: the track never drags
    if (typeof e.button === 'number' && e.button !== 0) return;
    dragging = true;
    handle.classList.add('is-dragging');
    if (track.setPointerCapture) {
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    setDisplayPct(pctFromClientX(e.clientX));
    handle.focus();
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (!dragging) return;
    setDisplayPct(pctFromClientX(e.clientX));
  }
  function onPointerUp(e) {
    if (e.pointerType === 'touch' && touchTapStart) {
      var dx = e.clientX - touchTapStart.x;
      var dy = e.clientY - touchTapStart.y;
      touchTapStart = null;
      if (Math.sqrt(dx * dx + dy * dy) <= 8) {
        // A tap, not a drag: open the nearest milestone's card. In preview
        // mode the drag logic below (if `dragging`) may ALSO move the
        // preview to this spot — both happening together is intended.
        var idx = nearestMilestoneIndex(e.clientX);
        if (idx !== -1) {
          var anchorDot = nodesWrap.children[idx] && nodesWrap.children[idx].querySelector('.dary-node-dot');
          if (anchorDot) toggleTooltip(idx, anchorDot, 4000);
        }
      }
    }
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    if (track.releasePointerCapture) {
      try { track.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    endPreviewAndSnapBack();
  }

  function onKeyDown(e) {
    if (MODE !== 'preview') return;
    if (e.key === 'Escape') {
      endPreviewAndSnapBack();
      e.preventDefault();
      return;
    }
    var step = 1;
    var big = 10;
    var moved = true;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        beginPreview();
        setDisplayPct(displayPct - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        beginPreview();
        setDisplayPct(displayPct + step);
        break;
      case 'PageDown':
        beginPreview();
        setDisplayPct(displayPct - big);
        break;
      case 'PageUp':
        beginPreview();
        setDisplayPct(displayPct + big);
        break;
      case 'Home':
        beginPreview();
        setDisplayPct(0);
        break;
      case 'End':
        beginPreview();
        setDisplayPct(100);
        break;
      default:
        moved = false;
    }
    if (moved) e.preventDefault();
  }
  function onHandleBlur() {
    endPreviewAndSnapBack();
  }

  // ---- Milestone hover/tap tooltips (both modes) ------------------------------
  var activeTooltipIndex = -1;
  var tooltipTimer = null;
  var touchTapStart = null; // { x, y } — set in onPointerDown, consumed in onPointerUp

  function clearTooltipTimer() {
    if (tooltipTimer) {
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
  }

  function hideTooltip() {
    if (activeTooltipIndex === -1) return;
    tooltipEl.hidden = true;
    tooltipEl.style.cssText = '';
    activeTooltipIndex = -1;
    clearTooltipTimer();
  }

  function positionTooltip(anchorEl) {
    if (isMobileLayout()) {
      // Phones: a full-width static card under the track (see CSS); no
      // floating-bubble math needed, just let it flow in the document.
      tooltipEl.style.cssText = '';
      return;
    }
    // Positioned relative to `root` (the .paper card, position:relative), not
    // trackWrap — tooltipEl is now a sibling of trackWrap, not its child (see
    // createTooltip), so its own absolute-positioning ancestor is the card.
    var cardRect = root.getBoundingClientRect();
    var dotRect = anchorEl.getBoundingClientRect();
    var tRect = tooltipEl.getBoundingClientRect();
    var centerX = dotRect.left + dotRect.width / 2 - cardRect.left;
    var left = centerX - tRect.width / 2;
    var maxLeft = cardRect.width - tRect.width - 4;
    if (left < 4) left = 4;
    if (maxLeft > 4 && left > maxLeft) left = maxLeft;
    var top = dotRect.top - cardRect.top - tRect.height - 12;
    if (top < 0) top = dotRect.bottom - cardRect.top + 12; // flip below if no room above
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function showTooltip(idx, anchorEl) {
    var m = MILESTONES[idx];
    tooltipEl.innerHTML =
      '<div class="dary-tooltip-icon">' + m.icon + '</div>' +
      '<div class="dary-tooltip-body">' +
      '<p class="dary-tooltip-amount">' + escapeHtml(formatAmount(m.amount)) + '</p>' +
      '<h4 class="dary-tooltip-title">' + escapeHtml(t('dary.' + m.key + '.title')) + '</h4>' +
      '<p class="dary-tooltip-desc">' + escapeHtml(t('dary.' + m.key + '.text')) + '</p>' +
      '</div>';
    tooltipEl.hidden = false;
    activeTooltipIndex = idx;
    positionTooltip(anchorEl);
  }

  function toggleTooltip(idx, anchorEl, autoDismissMs) {
    if (activeTooltipIndex === idx) {
      hideTooltip();
      return;
    }
    clearTooltipTimer();
    showTooltip(idx, anchorEl);
    if (autoDismissMs) tooltipTimer = window.setTimeout(hideTooltip, autoDismissMs);
  }

  // Mouse-only hover; touch taps are handled once, geometrically, by
  // nearestMilestoneIndex() inside onPointerDown/onPointerUp — with up to 20
  // nodes packed into a 360px track their enlarged hit areas overlap quite a
  // bit, so "nearest to where the finger landed" is more reliable than
  // relying on exactly which element the touch happened to hit.
  function wireNodeTooltip(idx, dot) {
    dot.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch') return;
      clearTooltipTimer();
      showTooltip(idx, dot);
    });
    dot.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'touch') return;
      hideTooltip();
    });
  }

  function initTooltipDismissal() {
    // Tap/click anywhere outside the tooltip and outside a node dot dismisses it.
    document.addEventListener('pointerdown', function (e) {
      if (activeTooltipIndex === -1) return;
      if (tooltipEl.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.dary-node-dot')) return;
      hideTooltip();
    }, true);
  }

  // ---- Lazy layout hook (ResizeObserver, no cached sizes anywhere) -----------
  function initResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    var ro = new ResizeObserver(function () {
      // Node/handle/pin positions are plain CSS percentages, so a resize
      // never needs a stored width — this just keeps everything else (aria
      // text, panel, an open tooltip's position) in sync, without reading or
      // caching any box size itself outside of this callback.
      render({ silent: true });
      if (activeTooltipIndex !== -1) {
        var anchor = nodesWrap.children[activeTooltipIndex] && nodesWrap.children[activeTooltipIndex].querySelector('.dary-node-dot');
        if (anchor) positionTooltip(anchor);
      }
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
    panelBuilt = false; // rebuild the panel text in the new language (without replaying animations)
    render({ silent: true });
    if (activeTooltipIndex !== -1) {
      var anchor = nodesWrap.children[activeTooltipIndex] && nodesWrap.children[activeTooltipIndex].querySelector('.dary-node-dot');
      if (anchor) showTooltip(activeTooltipIndex, anchor);
    }
  }

  // ---- Test-only hooks (localhost only, mockup value entry) -------------------
  function exposeTestHook() {
    var host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return;
    // Sets the REAL (shared) total — what loadTotal() will eventually return.
    window.__daryMeterSetTotal = function (amount) {
      setRealTotal(amount);
    };
    // Sets the PREVIEW position directly, without scheduling the snap-back —
    // handy for screenshots of a specific preview state.
    window.__daryMeterSet = function (amount) {
      isPreviewing = true;
      setDisplayPct(amountToPct(Number(amount) || 0));
    };
  }

  function init() {
    if (!createDom()) return;
    createPreviewTag();
    createPin();
    createTooltip();
    renderNodes();

    chipEl && (chipEl.hidden = MODE !== 'preview');
    handle.setAttribute('aria-valuemax', String(MAX_AMOUNT));

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    handle.addEventListener('keydown', onKeyDown);
    handle.addEventListener('blur', onHandleBlur);

    initTooltipDismissal();
    initResizeObserver();
    initLangObserver();
    exposeTestHook();

    setDisplayPct(0, { silent: true });
    loadTotal().then(function (amount) {
      setRealTotal(amount);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
