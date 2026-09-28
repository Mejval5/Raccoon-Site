// site/svatba/svatba.js
// Behaviour for the wedding invitation page: i18n, cookie/token gate, canvas sky
// (petals + fireflies + parallax), tilt, scroll reveal, countdown and RSVP form.
// Loaded with `defer`, after svatba-i18n.js (which defines window.SVATBA_I18N).
// Depends only on the ids/classes/keys documented in CONTRACT.md; every lookup
// is defensive so a missing element simply disables that feature.
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  function clamp(n, min, max) {
    return n < min ? min : n > max ? max : n;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  var motionQuery = null;
  try {
    motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  } catch (e) {
    motionQuery = null;
  }

  function prefersReducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function onMediaChange(mq, handler) {
    if (!mq) return;
    try {
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    } catch (e) {
      /* ignore */
    }
  }

  // Generic cookie helpers, shared by the gate (token) and the i18n module
  // (chosen language).
  function getCookie(name) {
    var cookies = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < cookies.length; i++) {
      var idx = cookies[i].indexOf('=');
      if (idx === -1) continue;
      if (cookies[i].slice(0, idx) === name) {
        var raw = cookies[i].slice(idx + 1);
        try {
          return decodeURIComponent(raw);
        } catch (e) {
          return raw;
        }
      }
    }
    return null;
  }

  function setCookie(name, value, maxAgeSeconds) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + maxAgeSeconds + '; SameSite=Lax' + secure;
  }

  // Canvas exposes a burstFromRect(rect) here so the RSVP module can trigger
  // it without creating any window global.
  var requestPetalBurst = null;

  // ---------------------------------------------------------------------
  // 1. i18n — must run synchronously before the gate resolves
  // ---------------------------------------------------------------------

  var i18n = (function () {
    var LANG_COOKIE = 'svatba-lang';
    var OLD_LANG_LOCALSTORAGE_KEY = 'svatba-lang'; // legacy, read once as a migration fallback then dropped
    var SUPPORTED = ['cs', 'en', 'fr'];
    var dict = (window.SVATBA_I18N && typeof window.SVATBA_I18N === 'object') ? window.SVATBA_I18N : { cs: {}, en: {}, fr: {} };
    var current = 'cs';
    var listeners = [];

    function isSupported(v) {
      return SUPPORTED.indexOf(v) !== -1;
    }

    // ---- Automatic first-visit language guess -----------------------------
    // Pure function: given the ordered language tags the browser reports and
    // a resolved IANA time zone, return the best-guess supported language.
    // Kept pure/standalone so it can be unit-checked outside the browser.
    function guessLangFromHints(languages, timeZone) {
      var langs = languages || [];
      var i, primary;

      // 1) Walk the whole list for the first entry whose primary subtag is
      // cs/sk (-> cs) or fr (-> fr); 'en' entries are skipped here on purpose
      // so a later cs/fr entry still wins over an earlier en one.
      for (i = 0; i < langs.length; i++) {
        primary = String(langs[i]).split('-')[0].toLowerCase();
        if (primary === 'cs' || primary === 'sk') return 'cs';
        if (primary === 'fr') return 'fr';
      }

      // 2) Nothing in the list was cs/sk/fr (it was all 'en', unsupported,
      // or empty) — use the country as a better hint before giving up.
      var hasFrLanguage = false;
      var regions = [];
      for (i = 0; i < langs.length; i++) {
        var parts = String(langs[i]).split('-');
        primary = parts[0].toLowerCase();
        if (primary === 'fr') hasFrLanguage = true;
        for (var k = 1; k < parts.length; k++) {
          if (/^[A-Za-z]{2}$/.test(parts[k])) {
            regions.push(parts[k].toUpperCase());
            break;
          }
        }
      }
      for (i = 0; i < regions.length; i++) {
        var region = regions[i];
        if (region === 'CZ' || region === 'SK') return 'cs';
        if (region === 'FR' || region === 'BE' || region === 'LU' || region === 'MC') return 'fr';
        if (region === 'CH' && hasFrLanguage) return 'fr';
      }

      if (timeZone === 'Europe/Prague' || timeZone === 'Europe/Bratislava') return 'cs';
      if (timeZone === 'Europe/Paris' || timeZone === 'Europe/Brussels' || timeZone === 'Europe/Luxembourg' || timeZone === 'Europe/Monaco') return 'fr';

      // 3) None of that points anywhere -> English for non-Czech browsers.
      return 'en';
    }

    function getNavigatorLanguages() {
      try {
        if (navigator.languages && navigator.languages.length) return Array.prototype.slice.call(navigator.languages);
      } catch (e) {
        /* ignore */
      }
      try {
        if (navigator.language) return [navigator.language];
      } catch (e) {
        /* ignore */
      }
      return [];
    }

    function getResolvedTimeZone() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      } catch (e) {
        return null;
      }
    }

    function getUrlLang() {
      try {
        var v = new URLSearchParams(location.search).get('lang');
        return isSupported(v) ? v : null;
      } catch (e) {
        return null;
      }
    }

    // Rewrites the URL's `lang` param via replaceState, preserving every
    // other query param and the hash (the gate strips its own `k` param
    // separately and independently, later, once it resolves).
    function rewriteUrlLang(lang) {
      try {
        var url = new URL(location.href);
        url.searchParams.set('lang', lang);
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      } catch (e) {
        /* ignore */
      }
    }

    function t(key) {
      if (!key) return null;
      var d = dict[current] || {};
      if (Object.prototype.hasOwnProperty.call(d, key)) return d[key];
      var cs = dict.cs || {};
      if (Object.prototype.hasOwnProperty.call(cs, key)) return cs[key];
      return null;
    }

    function applyText() {
      var nodes = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].getAttribute('data-i18n');
        var val = t(key);
        if (val != null) nodes[i].textContent = val;
      }
    }

    function applyHtml() {
      var nodes = document.querySelectorAll('[data-i18n-html]');
      for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].getAttribute('data-i18n-html');
        var val = t(key);
        if (val != null) nodes[i].innerHTML = val;
      }
    }

    function applyAttrs() {
      var nodes = document.querySelectorAll('[data-i18n-attr]');
      for (var i = 0; i < nodes.length; i++) {
        var spec = nodes[i].getAttribute('data-i18n-attr');
        if (!spec) continue;
        var parts = spec.split(',');
        for (var j = 0; j < parts.length; j++) {
          var pair = parts[j].split(':');
          if (pair.length !== 2) continue;
          var attrName = pair[0].trim();
          var attrKey = pair[1].trim();
          if (!attrName || !attrKey) continue;
          var val = t(attrKey);
          if (val != null) nodes[i].setAttribute(attrName, val);
        }
      }
    }

    function applyTitle() {
      var val = t('meta.title');
      if (val != null) document.title = val;
    }

    function updateToggleButtons() {
      var buttons = document.querySelectorAll('.lang-toggle [data-lang]');
      for (var i = 0; i < buttons.length; i++) {
        var isCurrent = buttons[i].getAttribute('data-lang') === current;
        buttons[i].setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
      }
    }

    function applyAll() {
      document.documentElement.lang = current;
      applyText();
      applyHtml();
      applyAttrs();
      applyTitle();
      updateToggleButtons();
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i]();
        } catch (e) {
          /* a listener must never break the rest */
        }
      }
    }

    // Every call writes the chosen language to the cookie (per spec, whatever
    // language ends up active is always persisted there); `rewriteUrl` is
    // only requested when the URL itself needs to start reflecting it too
    // (a toggle click, or an initial load whose URL had no ?lang= yet).
    function setLang(lang, rewriteUrl) {
      if (!isSupported(lang)) return;
      current = lang;
      setCookie(LANG_COOKIE, lang, 31536000);
      if (rewriteUrl) rewriteUrlLang(lang);
      applyAll();
    }

    function onLangChange(cb) {
      if (typeof cb === 'function') listeners.push(cb);
    }

    function initToggle() {
      var buttons = document.querySelectorAll('.lang-toggle [data-lang]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', (function (btn) {
          return function () {
            setLang(btn.getAttribute('data-lang'), true);
          };
        })(buttons[i]));
      }
    }

    // Precedence: (a) ?lang= URL query, (b) svatba-lang cookie, (c) legacy
    // localStorage key (migrated once, then dropped), (d) automatic
    // first-visit guess, (e) cs.
    function resolveInitialLang() {
      var urlLang = getUrlLang();
      if (urlLang) return { lang: urlLang, hadUrlLang: true };

      var cookieLang = getCookie(LANG_COOKIE);
      if (isSupported(cookieLang)) return { lang: cookieLang, hadUrlLang: false };

      var legacy = null;
      try {
        legacy = localStorage.getItem(OLD_LANG_LOCALSTORAGE_KEY);
      } catch (e) {
        legacy = null;
      }
      if (isSupported(legacy)) {
        try {
          localStorage.removeItem(OLD_LANG_LOCALSTORAGE_KEY);
        } catch (e) {
          /* ignore */
        }
        return { lang: legacy, hadUrlLang: false };
      }

      var guessed = guessLangFromHints(getNavigatorLanguages(), getResolvedTimeZone());
      return { lang: isSupported(guessed) ? guessed : 'cs', hadUrlLang: false };
    }

    function init() {
      var resolved = resolveInitialLang();
      setLang(resolved.lang, !resolved.hadUrlLang);
      initToggle();
    }

    return { init: init, t: t, getLang: function () { return current; }, setLang: setLang, onLangChange: onLangChange };
  })();

  i18n.init();

  // ---------------------------------------------------------------------
  // 2. Gate — token / cookie check, sets data-state on <html>
  // ---------------------------------------------------------------------

  var gate = (function () {
    var TOKEN_HASH = '9d8e254a008ba12ca209ab49dbdede7cf80c5c181b6070e9b64babc604f0de97';
    var token = null;
    var readyResolve = null;
    var ready = new Promise(function (resolve) {
      readyResolve = resolve;
    });

    function toHex(buffer) {
      var bytes = new Uint8Array(buffer);
      var hex = '';
      for (var i = 0; i < bytes.length; i++) {
        var h = bytes[i].toString(16);
        if (h.length < 2) h = '0' + h;
        hex += h;
      }
      return hex;
    }

    function stripKFromUrl() {
      try {
        var url = new URL(location.href);
        url.searchParams.delete('k');
        var next = url.pathname + url.search + url.hash;
        history.replaceState(history.state, '', next);
      } catch (e) {
        /* ignore */
      }
    }

    function setState(state) {
      document.documentElement.dataset.state = state;
    }

    function finish(state) {
      setState(state);
      if (readyResolve) {
        readyResolve(state);
        readyResolve = null;
      }
    }

    function check() {
      var urlToken = null;
      try {
        urlToken = new URLSearchParams(location.search).get('k');
      } catch (e) {
        urlToken = null;
      }
      var hadUrlToken = urlToken != null;
      var candidate = hadUrlToken ? urlToken : getCookie('svatba');

      if (!candidate || !window.crypto || !window.crypto.subtle) {
        if (hadUrlToken) stripKFromUrl();
        finish('locked');
        return;
      }

      var encoded;
      try {
        encoded = new TextEncoder().encode(candidate);
      } catch (e) {
        if (hadUrlToken) stripKFromUrl();
        finish('locked');
        return;
      }

      window.crypto.subtle.digest('SHA-256', encoded).then(function (buf) {
        var hex = toHex(buf);
        if (hadUrlToken) stripKFromUrl();
        if (hex === TOKEN_HASH) {
          token = candidate;
          setCookie('svatba', candidate, 31536000);
          finish('open');
        } else {
          finish('locked');
        }
      }).catch(function () {
        if (hadUrlToken) stripKFromUrl();
        finish('locked');
      });
    }

    return { check: check, ready: ready, getToken: function () { return token; } };
  })();

  gate.check();

  // ---------------------------------------------------------------------
  // 3. Canvas sky — apricot blossom petals + fireflies + burst API
  // ---------------------------------------------------------------------

  (function initSkyCanvas() {
    var canvas = document.getElementById('sky-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    var skyEl = document.querySelector('.sky');
    var reducedMotion = prefersReducedMotion();

    var dpr = 1;
    var width = 0;
    var height = 0;

    var petalSprites = [];
    var fireflySprite = null;
    var petals = [];
    var fireflies = [];
    var burstParticles = [];

    var running = false;
    var rafId = null;
    var lastTime = 0;
    var windPhase = 0;

    function petalCountFor(w, h) {
      var n = Math.round((w * h) / 28000);
      return clamp(n, 10, 48);
    }

    function fireflyCountFor(w) {
      var n = Math.round(w / 60);
      return clamp(n, 8, 22);
    }

    function makePetalSprite(variant) {
      var size = 9 + variant * 2;
      var pad = 4;
      var s = document.createElement('canvas');
      var dim = Math.max(1, Math.ceil((size + pad) * 2 * dpr));
      s.width = dim;
      s.height = dim;
      var sctx = s.getContext('2d');
      sctx.scale(dpr, dpr);
      sctx.translate(size + pad, size + pad);
      // A rounder blossom petal: wide bulge near the middle (not just near
      // the top), with a small notch at the outer tip instead of a sharp
      // point, so it doesn't collapse into a thin sliver when flipped.
      var w = size * 0.85;
      var notch = size * 0.14;
      sctx.beginPath();
      sctx.moveTo(0, size);
      sctx.bezierCurveTo(w, size * 0.55, w * 1.05, -size * 0.15, notch, -size * 0.92);
      sctx.quadraticCurveTo(0, -size * 0.78, -notch, -size * 0.92);
      sctx.bezierCurveTo(-w * 1.05, -size * 0.15, -w, size * 0.55, 0, size);
      sctx.closePath();
      var grad = sctx.createRadialGradient(0, size * 0.25, size * 0.15, 0, 0, size * 1.1);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.55, '#f7cfd9');
      grad.addColorStop(1, '#e9a3b8');
      sctx.fillStyle = grad;
      sctx.fill();
      sctx.lineWidth = 0.6;
      sctx.strokeStyle = 'rgba(233,163,184,0.4)';
      sctx.stroke();
      return { canvas: s, size: size, pad: pad };
    }

    // cos(phase) drives the "3D flip" but must never shrink the petal into a
    // near-invisible line: keep the sign (which side is showing) while
    // clamping the magnitude to at least 0.3.
    function flipScale(v) {
      var sign = v < 0 ? -1 : 1;
      return sign * (0.3 + 0.7 * Math.abs(v));
    }

    function makeFireflySprite() {
      var r = 10;
      var s = document.createElement('canvas');
      var dim = Math.max(1, Math.ceil(r * 2 * dpr));
      s.width = dim;
      s.height = dim;
      var sctx = s.getContext('2d');
      sctx.scale(dpr, dpr);
      var grad = sctx.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, 'rgba(255,213,138,0.95)');
      grad.addColorStop(0.35, 'rgba(255,213,138,0.55)');
      grad.addColorStop(1, 'rgba(255,213,138,0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, r * 2, r * 2);
      return { canvas: s, r: r };
    }

    function drawSprite(sp, scale, alpha) {
      var half = (sp.size + sp.pad) * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sp.canvas, -half, -half, half * 2, half * 2);
    }

    function randomPetal(fromTop) {
      // Two depth tiers so the sky reads as having actual depth: far petals
      // are smaller, slower and fainter; near petals are bigger, a little
      // faster and closer to opaque.
      var near = Math.random() < 0.55;
      var tierSpeed = near ? 1.15 : 0.7;
      return {
        x: Math.random() * width,
        y: fromTop ? -20 - Math.random() * height * 0.3 : Math.random() * height,
        vx: (Math.random() - 0.5) * 8 * tierSpeed,
        vy: (14 + Math.random() * 22) * tierSpeed,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 1.2 * tierSpeed,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: (0.6 + Math.random() * 0.8) * tierSpeed,
        swayAmp: 10 + Math.random() * 22,
        swayFreq: (0.3 + Math.random() * 0.5) * tierSpeed,
        swayPhase: Math.random() * Math.PI * 2,
        scale: near ? 1.0 + Math.random() * 0.4 : 0.55 + Math.random() * 0.25,
        alpha: near ? 0.82 + Math.random() * 0.13 : 0.4 + Math.random() * 0.15,
        sprite: petalSprites.length ? Math.floor(Math.random() * petalSprites.length) : 0
      };
    }

    function randomFirefly() {
      return {
        t: Math.random(),
        x: Math.random() * width,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.8 + Math.random() * 1.2,
        wanderPhase: Math.random() * Math.PI * 2
      };
    }

    function getBand() {
      if (!skyEl) return null;
      var r = skyEl.getBoundingClientRect();
      return { top: r.top + r.height * 0.58, bottom: r.top + r.height * 0.92 };
    }

    var resizeTimer = null;
    function resize() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = vw;
      height = vh;
      canvas.width = Math.max(1, Math.round(vw * dpr));
      canvas.height = Math.max(1, Math.round(vh * dpr));
      canvas.style.width = vw + 'px';
      canvas.style.height = vh + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!petalSprites.length) {
        for (var i = 0; i < 4; i++) petalSprites.push(makePetalSprite(i % 3));
      }
      if (!fireflySprite) fireflySprite = makeFireflySprite();

      var targetPetals = petalCountFor(width, height);
      while (petals.length < targetPetals) petals.push(randomPetal(false));
      if (petals.length > targetPetals) petals.length = targetPetals;
      for (var p = 0; p < petals.length; p++) {
        if (petals[p].x > width) petals[p].x = Math.random() * width;
      }

      var targetFlies = fireflyCountFor(width);
      while (fireflies.length < targetFlies) fireflies.push(randomFirefly());
      if (fireflies.length > targetFlies) fireflies.length = targetFlies;
      for (var f = 0; f < fireflies.length; f++) {
        if (fireflies[f].x > width) fireflies[f].x = Math.random() * width;
      }

      if (reducedMotion) drawStaticFrame();
    }

    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    }

    function updatePetals(dt) {
      windPhase += dt * 0.0006;
      var wind = Math.sin(windPhase) * 14 + Math.sin(windPhase * 2.3) * 6;
      for (var i = 0; i < petals.length; i++) {
        var petal = petals[i];
        petal.phase += dt * petal.phaseSpeed * 0.001;
        petal.swayPhase += dt * petal.swayFreq * 0.001;
        petal.rot += petal.rotSpeed * dt * 0.001;
        var sway = Math.sin(petal.swayPhase) * petal.swayAmp * dt * 0.001;
        petal.x += (petal.vx + wind) * dt * 0.001 + sway * 0.02;
        petal.y += petal.vy * dt * 0.001;
        if (petal.y - 30 > height) {
          var fresh = randomPetal(true);
          for (var key in fresh) petal[key] = fresh[key];
        }
      }
    }

    function drawPetals() {
      for (var i = 0; i < petals.length; i++) {
        var petal = petals[i];
        var sp = petalSprites[petal.sprite];
        if (!sp) continue;
        ctx.save();
        ctx.translate(petal.x, petal.y);
        ctx.rotate(petal.rot);
        ctx.scale(flipScale(Math.cos(petal.phase)), 1);
        drawSprite(sp, petal.scale, petal.alpha);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function updateFireflies(dt) {
      for (var i = 0; i < fireflies.length; i++) {
        var f = fireflies[i];
        f.wanderPhase += dt * 0.0004;
        f.x += Math.sin(f.wanderPhase * 1.3) * dt * 0.02;
        f.t += Math.sin(f.wanderPhase) * dt * 0.00005;
        if (f.t < 0) f.t = 0;
        if (f.t > 1) f.t = 1;
        if (f.x < -20) f.x = width + 20;
        if (f.x > width + 20) f.x = -20;
        f.phase += dt * f.pulseSpeed * 0.001;
      }
    }

    function drawFireflies() {
      var band = getBand();
      if (!band || !fireflySprite) return;
      if (band.bottom < 0 || band.top > height) return;
      for (var i = 0; i < fireflies.length; i++) {
        var f = fireflies[i];
        var y = band.top + f.t * (band.bottom - band.top);
        if (y < -20 || y > height + 20) continue;
        var pulse = 0.5 + 0.5 * Math.sin(f.phase);
        ctx.globalAlpha = 0.35 + 0.5 * pulse;
        var r = fireflySprite.r;
        ctx.drawImage(fireflySprite.canvas, f.x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }

    function updateBurst(dt) {
      for (var i = burstParticles.length - 1; i >= 0; i--) {
        var b = burstParticles[i];
        var drag = Math.exp(-0.0025 * dt);
        b.vx *= drag;
        b.vy *= drag;
        b.vy += 140 * dt * 0.001;
        b.x += b.vx * dt * 0.001;
        b.y += b.vy * dt * 0.001;
        b.rot += b.rotSpeed * dt * 0.001;
        b.age += dt;
        if (b.age > b.life) burstParticles.splice(i, 1);
      }
    }

    function drawBurst() {
      for (var i = 0; i < burstParticles.length; i++) {
        var b = burstParticles[i];
        var sp = petalSprites[b.sprite];
        if (!sp) continue;
        var alpha = Math.max(0, 1 - b.age / b.life);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(flipScale(Math.cos(b.phase + b.age * 0.004)), 1);
        drawSprite(sp, b.scale, alpha * 0.9);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!running) return;
      var dt = lastTime ? now - lastTime : 16;
      if (dt > 50) dt = 50;
      lastTime = now;

      ctx.clearRect(0, 0, width, height);
      updatePetals(dt);
      drawPetals();
      updateFireflies(dt);
      drawFireflies();
      if (burstParticles.length) {
        updateBurst(dt);
        drawBurst();
      }

      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reducedMotion || document.hidden) return;
      if (width <= 0 || height <= 0) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function drawStaticFrame() {
      ctx.clearRect(0, 0, width, height);
      var still = petals.slice(0, Math.min(petals.length, 10));
      for (var i = 0; i < still.length; i++) {
        var petal = still[i];
        var sp = petalSprites[petal.sprite];
        if (!sp) continue;
        ctx.save();
        ctx.translate(petal.x, petal.y);
        ctx.rotate(petal.rot);
        drawSprite(sp, petal.scale, petal.alpha);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      var band = getBand();
      if (band && fireflySprite && !(band.bottom < 0 || band.top > height)) {
        var flies = fireflies.slice(0, Math.min(fireflies.length, 6));
        for (var j = 0; j < flies.length; j++) {
          var f = flies[j];
          var y = band.top + f.t * (band.bottom - band.top);
          if (y < -20 || y > height + 20) continue;
          ctx.globalAlpha = 0.7;
          var r = fireflySprite.r;
          ctx.drawImage(fireflySprite.canvas, f.x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else if (!reducedMotion) {
        start();
      }
    }

    function handleReducedMotionChange(e) {
      reducedMotion = !!e.matches;
      if (reducedMotion) {
        stop();
        drawStaticFrame();
      } else {
        start();
      }
    }

    // Spawns petals along a DOMRect's left/right/top edges (never the
    // bottom), clamped to the viewport, with velocity pointing outward from
    // the rect and a slight upward bias — so they fly out onto the dark
    // backdrop behind the card instead of being hidden underneath it.
    function burstFromRect(rect) {
      if (reducedMotion || !rect) return;
      var left = clamp(rect.left, -50, width + 50);
      var right = clamp(rect.right, -50, width + 50);
      var top = clamp(rect.top, -50, height + 50);
      var bottom = clamp(rect.bottom, -50, height + 50);
      if (right <= left) right = left + 1;
      if (bottom <= top) bottom = top + 1;
      var cx = (left + right) / 2;
      var cy = (top + bottom) / 2;

      var count = 40 + Math.floor(Math.random() * 20);
      for (var i = 0; i < count; i++) {
        var edge = Math.floor(Math.random() * 3); // 0 top, 1 left, 2 right
        var x, y, dirX, dirY;
        if (edge === 0) {
          x = left + Math.random() * (right - left);
          y = top;
          dirX = (x - cx) / ((right - left) / 2);
          dirY = -1;
        } else if (edge === 1) {
          x = left;
          y = top + Math.random() * (bottom - top);
          dirX = -1;
          dirY = (y - cy) / ((bottom - top) / 2) - 0.3;
        } else {
          x = right;
          y = top + Math.random() * (bottom - top);
          dirX = 1;
          dirY = (y - cy) / ((bottom - top) / 2) - 0.3;
        }
        var mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        dirX /= mag;
        dirY /= mag;
        var speed = 70 + Math.random() * 170;
        burstParticles.push({
          x: x,
          y: y,
          vx: dirX * speed,
          vy: dirY * speed - 40,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 4,
          phase: Math.random() * Math.PI * 2,
          scale: 0.5 + Math.random() * 0.8,
          sprite: petalSprites.length ? Math.floor(Math.random() * petalSprites.length) : 0,
          age: 0,
          life: 2200 + Math.random() * 600
        });
      }
      if (!running) start();
    }

    resize();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    onMediaChange(motionQuery, handleReducedMotionChange);

    if (reducedMotion) {
      drawStaticFrame();
    } else {
      start();
    }

    requestPetalBurst = burstFromRect;
  })();

  // ---------------------------------------------------------------------
  // 4. Parallax — pointer + deviceorientation, smoothed onto .sky / #hero
  // ---------------------------------------------------------------------

  (function initParallax() {
    if (prefersReducedMotion()) return;
    var skyEl = document.querySelector('.sky');
    var heroEl = document.getElementById('hero');
    if (!skyEl && !heroEl) return;

    // Event-driven: the rAF loop only runs while the pointer/orientation is
    // still moving the target away from the current value, and it stops
    // itself (after applying the exact target once) as soon as it settles,
    // so an idle phone isn't forced through a style recalc every frame.
    var SETTLE_EPS = 0.0005;

    var targetX = 0;
    var targetY = 0;
    var curX = 0;
    var curY = 0;
    var running = false;
    var reduced = false;
    var rafId = null;
    var baseGamma = null;
    var baseBeta = null;

    function skyInView() {
      if (!skyEl) return true;
      return skyEl.getBoundingClientRect().bottom >= 0;
    }

    function apply(x, y) {
      var v = x.toFixed(4);
      var w = y.toFixed(4);
      if (skyEl) {
        skyEl.style.setProperty('--px', v);
        skyEl.style.setProperty('--py', w);
      }
      if (heroEl) {
        heroEl.style.setProperty('--px', v);
        heroEl.style.setProperty('--py', w);
      }
    }

    function start() {
      if (running || reduced) return;
      running = true;
      rafId = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function loop() {
      if (!skyInView()) {
        // Scrolled past the hero: stop touching styles until it's back.
        running = false;
        rafId = null;
        return;
      }
      curX = lerp(curX, targetX, 0.06);
      curY = lerp(curY, targetY, 0.06);
      if (Math.abs(curX - targetX) < SETTLE_EPS && Math.abs(curY - targetY) < SETTLE_EPS) {
        curX = targetX;
        curY = targetY;
        apply(curX, curY);
        running = false;
        rafId = null;
        return;
      }
      apply(curX, curY);
      rafId = requestAnimationFrame(loop);
    }

    function onPointerMove(e) {
      if (reduced || !skyInView()) return;
      var cx = window.innerWidth / 2;
      var cy = window.innerHeight / 2;
      targetX = clamp(cx ? (e.clientX - cx) / cx : 0, -1, 1);
      targetY = clamp(cy ? (e.clientY - cy) / cy : 0, -1, 1);
      start();
    }

    function onDeviceOrientation(e) {
      if (reduced || !skyInView()) return;
      if (e.gamma == null || e.beta == null) return;
      if (baseGamma == null) {
        baseGamma = e.gamma;
        baseBeta = e.beta;
      }
      targetX = clamp((e.gamma - baseGamma) / 30, -1, 1);
      targetY = clamp((e.beta - baseBeta) / 30, -1, 1);
      start();
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
    });
    onMediaChange(motionQuery, function (e) {
      reduced = !!e.matches;
      if (reduced) {
        stop();
        targetX = 0;
        targetY = 0;
        curX = 0;
        curY = 0;
        apply(0, 0);
      }
    });
  })();

  // ---------------------------------------------------------------------
  // 5. Tilt — [data-tilt] elements follow the pointer, hover+fine only
  // ---------------------------------------------------------------------

  (function initTilt() {
    if (prefersReducedMotion()) return;
    var hoverFine = false;
    try {
      hoverFine = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    } catch (e) {
      hoverFine = false;
    }
    if (!hoverFine) return;

    var els = document.querySelectorAll('[data-tilt]');
    if (!els.length) return;

    var MAX_DEG = 1.5;
    // The whole card reacts. Hit-testing uses the untransformed layout box and the tilt eases in slowly,
    // so entering at an edge no longer flickers and no dead-zone inset is needed.
    var INSET_RATIO = 0;
    var LERP_FACTOR = 0.06;
    var SETTLE_EPS = 0.002;

    // Smoothstep-style ease so the tilt ramps in gently from the inner
    // zone's edge instead of jumping straight to a linear response.
    function ease(t) {
      return t * t * (3 - 2 * t);
    }

    var items = [];
    for (var i = 0; i < els.length; i++) {
      items.push({
        el: els[i],
        rect: null, // untransformed, viewport-relative box: {left, top, width, height}
        targetRx: 0,
        targetRy: 0,
        curRx: 0,
        curRy: 0,
        running: false,
        rafId: null
      });
    }

    // The card itself is transformed (perspective/rotate) once tilted, so
    // getBoundingClientRect() on it would report the ALREADY-tilted box —
    // chasing that box is exactly what caused the flicker (tilt moves the
    // edge away from the pointer -> pointerleave -> snap back -> repeat).
    // offsetLeft/offsetTop/offsetWidth/offsetHeight are layout-box values
    // that transforms never affect, so we sum offsetLeft/Top up the
    // offsetParent chain (page coordinates) and subtract the current
    // scroll position to get a stable, untransformed viewport-relative box.
    function measure(item) {
      var el = item.el;
      var left = 0;
      var top = 0;
      var node = el;
      while (node) {
        left += node.offsetLeft || 0;
        top += node.offsetTop || 0;
        node = node.offsetParent;
      }
      item.rect = {
        left: left - window.scrollX,
        top: top - window.scrollY,
        width: el.offsetWidth,
        height: el.offsetHeight
      };
    }

    function applyStyle(item) {
      item.el.style.setProperty('--rx', item.curRx.toFixed(3) + 'deg');
      item.el.style.setProperty('--ry', item.curRy.toFixed(3) + 'deg');
    }

    function loop(item) {
      item.curRx = lerp(item.curRx, item.targetRx, LERP_FACTOR);
      item.curRy = lerp(item.curRy, item.targetRy, LERP_FACTOR);
      if (Math.abs(item.curRx - item.targetRx) < SETTLE_EPS && Math.abs(item.curRy - item.targetRy) < SETTLE_EPS) {
        item.curRx = item.targetRx;
        item.curRy = item.targetRy;
        applyStyle(item);
        item.running = false;
        item.rafId = null;
        return;
      }
      applyStyle(item);
      item.rafId = requestAnimationFrame(function () { loop(item); });
    }

    function start(item) {
      if (item.running) return;
      item.running = true;
      item.rafId = requestAnimationFrame(function () { loop(item); });
    }

    // No pointerleave handling at all: target tilt is derived purely from
    // the pointer's position against the card's stable box, every move, for
    // every card — so leaving the reactive zone (inner or outer) already
    // drives the target back to 0 through the same smoothed rAF loop.
    function onPointerMove(e) {
      for (var idx = 0; idx < items.length; idx++) {
        var item = items[idx];
        // Measured on every move: the cards are display:none until the invite gate opens, and fonts,
        // reveal and the RSVP thank-you all change layout later, so any cached box goes stale.
        // Two cards, a few offset reads each, is cheap.
        measure(item);
        var r = item.rect;
        if (!r || !r.width || !r.height) continue;

        var insetX = r.width * INSET_RATIO;
        var insetY = r.height * INSET_RATIO;
        var zoneLeft = r.left + insetX;
        var zoneTop = r.top + insetY;
        var zoneW = r.width - insetX * 2;
        var zoneH = r.height - insetY * 2;

        var x = e.clientX;
        var y = e.clientY;

        if (zoneW <= 0 || zoneH <= 0 || x < zoneLeft || x > zoneLeft + zoneW || y < zoneTop || y > zoneTop + zoneH) {
          item.targetRx = 0;
          item.targetRy = 0;
        } else {
          var relX = ((x - zoneLeft) / zoneW - 0.5) * 2; // -1..1
          var relY = ((y - zoneTop) / zoneH - 0.5) * 2;
          var signX = relX < 0 ? -1 : 1;
          var signY = relY < 0 ? -1 : 1;
          var magX = clamp(Math.abs(relX), 0, 1);
          var magY = clamp(Math.abs(relY), 0, 1);
          item.targetRy = signX * ease(magX) * MAX_DEG;
          item.targetRx = -signY * ease(magY) * MAX_DEG;
        }
        start(item);
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
  })();

  // ---------------------------------------------------------------------
  // 6. Reveal — IntersectionObserver adds .is-visible to .reveal elements
  // ---------------------------------------------------------------------

  (function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('is-visible');
      return;
    }

    document.documentElement.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  })();

  // ---------------------------------------------------------------------
  // 7. Countdown — days / hours / minutes to 2027-06-19 14:00 Europe/Prague
  // ---------------------------------------------------------------------

  function pluralKey(lang, n) {
    if (lang === 'cs') {
      if (n === 1) return 'one';
      if (n >= 2 && n <= 4) return 'few';
      return 'other';
    }
    if (lang === 'fr') {
      // French: 0 and 1 are both singular ("jour"/"jours").
      return (n === 0 || n === 1) ? 'one' : 'other';
    }
    return n === 1 ? 'one' : 'other';
  }

  var CD_LOCALE_MAP = { cs: 'cs-CZ', en: 'en-GB', fr: 'fr-FR' };

  function formatCountdownNumber(lang, n) {
    try {
      return new Intl.NumberFormat(CD_LOCALE_MAP[lang] || 'en-GB').format(n);
    } catch (e) {
      return String(n);
    }
  }

  function initCountdown() {
    var daysEl = document.getElementById('cd-days');
    var hoursEl = document.getElementById('cd-hours');
    var minsEl = document.getElementById('cd-mins');
    var secsEl = document.getElementById('cd-secs');
    var daysLabelEl = document.getElementById('cd-days-label');
    var hoursLabelEl = document.getElementById('cd-hours-label');
    var minsLabelEl = document.getElementById('cd-mins-label');
    var secsLabelEl = document.getElementById('cd-secs-label');
    var apricotsEl = document.getElementById('cd-apricots');
    // The wrapping <p class="cd-apricots"> (which also holds the little
    // apricot icon) is what actually needs to hide once the wedding has
    // started — hiding just the inner <span> would leave the icon behind.
    var apricotsWrapEl = apricotsEl && apricotsEl.closest ? (apricotsEl.closest('.cd-apricots') || apricotsEl) : apricotsEl;
    var countdownEl = document.getElementById('countdown');

    if (!daysEl && !hoursEl && !minsEl && !secsEl && !countdownEl && !apricotsEl) return;

    // 19 June 2027 14:00 Europe/Prague (CEST, UTC+2) = 12:00 UTC.
    var target = Date.UTC(2027, 5, 19, 12, 0, 0);
    var timer = null;
    var done = false;
    var doneEl = null;

    function setLabel(el, prefix, n, lang) {
      if (!el) return;
      var key = prefix + '.' + pluralKey(lang, n);
      el.setAttribute('data-i18n', key);
      var val = i18n.t(key);
      if (val != null) el.textContent = val;
    }

    function setApricots(lang, totalHours) {
      if (!apricotsEl) return;
      var key = 'cd.apricots.' + pluralKey(lang, totalHours);
      apricotsEl.setAttribute('data-i18n', key);
      var template = i18n.t(key);
      if (template != null) {
        apricotsEl.textContent = template.replace('{n}', formatCountdownNumber(lang, totalHours));
      }
    }

    function render() {
      var lang = i18n.getLang();
      var diff = target - Date.now();

      if (diff <= 0) {
        if (daysEl) daysEl.textContent = '0';
        if (hoursEl) hoursEl.textContent = '0';
        if (minsEl) minsEl.textContent = '0';
        if (secsEl) secsEl.textContent = '0';
        if (apricotsWrapEl) apricotsWrapEl.hidden = true;
        if (!done && countdownEl) {
          doneEl = countdownEl.querySelector('[data-cd-done]');
          if (!doneEl) {
            doneEl = document.createElement('p');
            doneEl.setAttribute('data-cd-done', '');
            countdownEl.appendChild(doneEl);
          }
        }
        done = true;
        if (doneEl) {
          doneEl.setAttribute('data-i18n', 'cd.done');
          var doneText = i18n.t('cd.done');
          if (doneText != null) doneEl.textContent = doneText;
        }
        return;
      }

      done = false;
      if (apricotsWrapEl) apricotsWrapEl.hidden = false;
      var totalSecs = Math.floor(diff / 1000);
      var days = Math.floor(totalSecs / 86400);
      var hours = Math.floor((totalSecs % 86400) / 3600);
      var mins = Math.floor((totalSecs % 3600) / 60);
      var secs = totalSecs % 60;
      var totalHours = Math.floor(diff / 3600000);

      if (daysEl) daysEl.textContent = String(days);
      if (hoursEl) hoursEl.textContent = String(hours);
      if (minsEl) minsEl.textContent = String(mins);
      if (secsEl) secsEl.textContent = String(secs);

      setLabel(daysLabelEl, 'cd.d', days, lang);
      setLabel(hoursLabelEl, 'cd.h', hours, lang);
      setLabel(minsLabelEl, 'cd.m', mins, lang);
      setLabel(secsLabelEl, 'cd.s', secs, lang);
      setApricots(lang, totalHours);
    }

    // Ticks once a second while the page is visible, aligned to the next
    // wall-clock second boundary; fully stops (no background timer) while
    // hidden, and resumes + repaints immediately when it becomes visible.
    function scheduleNext() {
      if (timer) {
        clearTimeout(timer);
        clearInterval(timer);
        timer = null;
      }
      if (document.hidden) return;
      var msToNextSecond = 1000 - (Date.now() % 1000);
      timer = setTimeout(function () {
        render();
        timer = setInterval(render, 1000);
      }, msToNextSecond);
    }

    render();
    scheduleNext();

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        render();
        scheduleNext();
      } else if (timer) {
        clearTimeout(timer);
        clearInterval(timer);
        timer = null;
      }
    });

    i18n.onLangChange(render);
  }

  // ---------------------------------------------------------------------
  // 8. RSVP form
  // ---------------------------------------------------------------------

  function initRsvp() {
    var form = document.getElementById('rsvp-form');
    if (!form) return;

    var nameEl = document.getElementById('rsvp-name');
    var emailEl = document.getElementById('rsvp-email');
    var partyEl = document.getElementById('rsvp-party');
    var noteEl = document.getElementById('rsvp-note');
    var websiteEl = document.getElementById('rsvp-website');
    var submitBtn = document.getElementById('rsvp-submit');
    var statusEl = document.getElementById('rsvp-status');
    var thanksEl = document.getElementById('rsvp-thanks');
    var thanksTitleEl = document.getElementById('rsvp-thanks-title');
    var thanksTextEl = document.getElementById('rsvp-thanks-text');

    var attendingRadios = form.querySelectorAll('input[name="attending"]');

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    var isSending = false;
    var fieldErrors = {}; // name -> i18n key, so a language switch can re-translate visible errors
    var lastFailKind = null; // 'fail' | 'invalid'
    var lastValues = null;
    var statusKey = null; // i18n key currently shown on the plain (non-failure) status line
    var statusShowsSummary = false; // true while statusKey === 'rsvp.err.summary'

    function endpoint() {
      var host = location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return 'https://europe-west1-website-raccoon.cloudfunctions.net/rsvp';
      }
      return '/api/rsvp';
    }

    // -----------------------------------------------------------------
    // ALTCHA captcha (https://altcha.org, npm package "altcha" v3.2.3)
    // -----------------------------------------------------------------
    // Loaded lazily (only once the gate is open), as a pinned-version ES
    // module from jsdelivr, which registers the <altcha-widget> custom
    // element and a window.$altcha registry as side effects of the import.
    var ALTCHA_VERSION = '3.2.3';
    var ALTCHA_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/altcha@' + ALTCHA_VERSION + '/dist/main/altcha.min.js';
    var altchaScriptPromise = null;

    function loadAltchaScript() {
      if (altchaScriptPromise) return altchaScriptPromise;
      altchaScriptPromise = new Promise(function (resolve, reject) {
        if (window.customElements && customElements.get('altcha-widget')) {
          resolve();
          return;
        }
        var script = document.createElement('script');
        script.type = 'module';
        script.src = ALTCHA_SCRIPT_URL;
        script.addEventListener('load', function () { resolve(); });
        script.addEventListener('error', function () { reject(new Error('altcha script failed to load')); });
        document.head.appendChild(script);
      });
      return altchaScriptPromise;
    }

    var captchaSlotEl = document.getElementById('rsvp-captcha');
    var captchaWidget = null;
    var captchaState = 'unverified'; // mirrors ALTCHA's own State enum (unverified/verifying/verified/error/expired/code)
    var captchaPayload = null;
    var captchaPendingSubmit = false; // true once the user hit submit while not yet verified
    var captchaLoadFailed = false;
    var pendingSubmitValues = null;

    function captchaChallengeUrl() {
      return endpoint() + '?challenge=1';
    }

    // Registers our own site-worded translations (not ALTCHA's bundled
    // ones) under all three language codes, merged onto ALTCHA's English
    // defaults so every Strings field stays populated. Done once, right
    // after the script loads; only the widget's `language` attribute needs
    // to change afterwards for a language switch to take effect.
    function registerAltchaTranslations() {
      if (!window.$altcha || !window.$altcha.i18n) return;
      var base = {};
      try {
        var got = window.$altcha.i18n.get('en');
        if (got) for (var k in got) base[k] = got[k];
      } catch (e) {
        /* ignore */
      }
      ['cs', 'en', 'fr'].forEach(function (lang) {
        var d = (window.SVATBA_I18N && window.SVATBA_I18N[lang]) || {};
        var merged = {};
        for (var k in base) merged[k] = base[k];
        if (d['rsvp.captcha.label'] != null) merged.label = d['rsvp.captcha.label'];
        if (d['rsvp.captcha.verifying'] != null) merged.verifying = d['rsvp.captcha.verifying'];
        if (d['rsvp.captcha.verified'] != null) merged.verified = d['rsvp.captcha.verified'];
        if (d['rsvp.captcha.error'] != null) merged.error = d['rsvp.captcha.error'];
        if (d['rsvp.captcha.expired'] != null) merged.expired = d['rsvp.captcha.expired'];
        window.$altcha.i18n.set(lang, merged);
      });
    }

    function onCaptchaStateChange(ev) {
      var detail = ev && ev.detail;
      var state = detail && detail.state;
      if (!state) return;
      captchaState = state;
      if (state === 'verified') {
        captchaPayload = (detail && detail.payload) || null;
        if (captchaPendingSubmit) {
          captchaPendingSubmit = false;
          var values = pendingSubmitValues;
          pendingSubmitValues = null;
          sendRsvp(values, captchaPayload);
        }
      } else if (state === 'error' || state === 'expired') {
        captchaPayload = null;
        if (captchaPendingSubmit) {
          captchaPendingSubmit = false;
          pendingSubmitValues = null;
          setSending(false);
          setStatus(state === 'expired' ? 'rsvp.captcha.expired' : 'rsvp.captcha.error', true);
        }
      }
    }

    function createCaptchaWidget() {
      var widget = document.createElement('altcha-widget');
      widget.setAttribute('name', 'altcha');
      widget.setAttribute('auto', 'onload');
      widget.setAttribute('language', i18n.getLang());
      widget.setAttribute('challenge', captchaChallengeUrl());
      widget.setAttribute('configuration', JSON.stringify({ hideFooter: true, hideLogo: true }));
      widget.addEventListener('statechange', onCaptchaStateChange);
      captchaSlotEl.innerHTML = '';
      captchaSlotEl.appendChild(widget);
      captchaWidget = widget;
    }

    function initCaptcha() {
      if (!captchaSlotEl) return; // markup doesn't include the slot: feature simply stays off
      loadAltchaScript().then(function () {
        if (!window.customElements || !customElements.get('altcha-widget')) {
          throw new Error('altcha-widget did not register');
        }
        registerAltchaTranslations();
        createCaptchaWidget();
      }).catch(function () {
        // No widget available (blocked CDN, offline dev, …): degrade
        // gracefully by letting submissions through without a captcha
        // field: the server is the source of truth and the mailto
        // fallback still covers any resulting failure.
        captchaLoadFailed = true;
      });
    }

    function fieldOf(el) {
      return el && el.closest ? el.closest('.field') : null;
    }

    function fieldsetFor(name) {
      var radios = form.querySelectorAll('input[name="' + name + '"]');
      return radios.length && radios[0].closest ? radios[0].closest('fieldset') : null;
    }

    function maybeClearSummary() {
      // Once every field is fixed, the "check the highlighted fields" status
      // line no longer applies to anything on screen — drop it.
      if (statusShowsSummary && Object.keys(fieldErrors).length === 0) {
        setStatus(null, false);
      }
    }

    function clearInputError(name, el) {
      delete fieldErrors[name];
      var f = fieldOf(el);
      if (f) f.classList.remove('has-error');
      if (el) el.removeAttribute('aria-invalid');
      var err = document.getElementById('err-' + name);
      if (err) {
        err.removeAttribute('data-i18n');
        err.textContent = '';
      }
      maybeClearSummary();
    }

    function setInputError(name, el, key) {
      fieldErrors[name] = key;
      var f = fieldOf(el);
      if (f) f.classList.add('has-error');
      if (el) el.setAttribute('aria-invalid', 'true');
      var err = document.getElementById('err-' + name);
      if (err) {
        err.setAttribute('data-i18n', key);
        var val = i18n.t(key);
        if (val != null) err.textContent = val;
      }
    }

    function clearGroupError(name) {
      delete fieldErrors[name];
      var fs = fieldsetFor(name);
      if (fs) {
        fs.classList.remove('has-error');
        fs.removeAttribute('aria-invalid');
      }
      var err = document.getElementById('err-' + name);
      if (err) {
        err.removeAttribute('data-i18n');
        err.textContent = '';
      }
      maybeClearSummary();
    }

    function setGroupError(name, key) {
      fieldErrors[name] = key;
      var fs = fieldsetFor(name);
      if (fs) {
        fs.classList.add('has-error');
        fs.setAttribute('aria-invalid', 'true');
      }
      var err = document.getElementById('err-' + name);
      if (err) {
        err.setAttribute('data-i18n', key);
        var val = i18n.t(key);
        if (val != null) err.textContent = val;
      }
    }

    function getRadioValue(radios) {
      for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) return radios[i].value;
      }
      return null;
    }

    // key is an i18n key (or null/'' to clear); storing the key rather than
    // the resolved text lets a language switch re-render this line correctly
    // (see the onLangChange handler below).
    function setStatus(key, isError) {
      if (!statusEl) return;
      statusKey = key || null;
      statusShowsSummary = key === 'rsvp.err.summary';
      statusEl.textContent = '';
      if (isError) statusEl.classList.add('is-error');
      else statusEl.classList.remove('is-error');
      if (key) {
        var text = labelFor(key);
        if (text) statusEl.textContent = text;
      }
    }

    function labelFor(key) {
      var val = i18n.t(key);
      return val != null ? val : key;
    }

    function buildMailBody(values) {
      var lines = [];
      lines.push(labelFor('rsvp.name') + ': ' + values.name);
      if (values.email) lines.push(labelFor('rsvp.email') + ': ' + values.email);
      lines.push(labelFor('rsvp.attending') + ': ' + (values.attending === 'yes' ? labelFor('rsvp.yes') : labelFor('rsvp.no')));
      if (values.party) lines.push(labelFor('rsvp.party') + ': ' + values.party);
      if (values.note) lines.push(labelFor('rsvp.note') + ': ' + values.note);
      return lines.join('\n');
    }

    function buildMailtoHref(values) {
      var subject = labelFor('rsvp.mail.subject') + ': ' + values.name;
      var body = buildMailBody(values);
      return 'mailto:necesal.daniel@gmail.com,terezasancova1999@gmail.com' +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
    }

    function showFailure(kind, values) {
      lastFailKind = kind;
      lastValues = values;
      statusKey = null;
      statusShowsSummary = false;
      if (!statusEl) return;
      statusEl.textContent = '';
      statusEl.classList.add('is-error');
      var msg = labelFor(kind === 'invalid' ? 'rsvp.fail.invalid' : 'rsvp.fail');
      statusEl.appendChild(document.createTextNode(msg + ' '));
      var a = document.createElement('a');
      a.href = buildMailtoHref(values);
      a.textContent = labelFor('rsvp.fail.mail');
      statusEl.appendChild(a);
    }

    function setSending(sending) {
      isSending = sending;
      if (submitBtn) {
        submitBtn.disabled = sending;
        submitBtn.classList.toggle('is-sending', sending);
      }
      form.setAttribute('aria-busy', sending ? 'true' : 'false');
    }

    function validate() {
      var name = nameEl ? nameEl.value.trim() : '';
      var email = emailEl ? emailEl.value.trim() : '';
      var attending = getRadioValue(attendingRadios);
      var party = partyEl ? partyEl.value.trim() : '';
      var note = noteEl ? noteEl.value.trim() : '';

      clearInputError('name', nameEl);
      clearInputError('email', emailEl);
      clearGroupError('attending');
      clearInputError('party', partyEl);
      clearInputError('note', noteEl);

      var ok = true;
      var firstInvalidEl = null;

      if (name.length < 2 || name.length > 120) {
        setInputError('name', nameEl, 'rsvp.err.name');
        ok = false;
        firstInvalidEl = firstInvalidEl || nameEl;
      }
      if (email && (email.length > 200 || !EMAIL_RE.test(email))) {
        setInputError('email', emailEl, 'rsvp.err.email');
        ok = false;
        firstInvalidEl = firstInvalidEl || emailEl;
      }
      if (attending !== 'yes' && attending !== 'no') {
        setGroupError('attending', 'rsvp.err.attending');
        ok = false;
        firstInvalidEl = firstInvalidEl || attendingRadios[0];
      }
      if (party.length > 300) {
        setInputError('party', partyEl, 'rsvp.err.party');
        ok = false;
        firstInvalidEl = firstInvalidEl || partyEl;
      }
      if (note.length > 1000) {
        setInputError('note', noteEl, 'rsvp.err.note');
        ok = false;
        firstInvalidEl = firstInvalidEl || noteEl;
      }

      return {
        ok: ok,
        firstInvalidEl: firstInvalidEl,
        values: {
          name: name,
          email: email,
          attending: attending || '',
          party: party,
          accommodation: '',
          note: note,
          website: websiteEl ? websiteEl.value : ''
        }
      };
    }

    function onSuccess(values) {
      form.hidden = true;
      if (thanksEl) thanksEl.hidden = false;
      var isYes = values.attending === 'yes';
      if (thanksTitleEl) {
        var titleKey = isYes ? 'rsvp.thanks.yes.title' : 'rsvp.thanks.no.title';
        thanksTitleEl.setAttribute('data-i18n', titleKey);
        var titleVal = i18n.t(titleKey);
        if (titleVal != null) thanksTitleEl.textContent = titleVal;
      }
      if (thanksTextEl) {
        var textKey = isYes ? 'rsvp.thanks.yes.text' : 'rsvp.thanks.no.text';
        thanksTextEl.setAttribute('data-i18n', textKey);
        var textVal = i18n.t(textKey);
        if (textVal != null) thanksTextEl.textContent = textVal;
      }
      setStatus(null, false);
      if (thanksTitleEl && thanksTitleEl.focus) thanksTitleEl.focus();

      if (typeof requestPetalBurst === 'function') {
        var rsvpSection = document.getElementById('rsvp');
        if (rsvpSection) {
          // Wait a frame (layout has just changed: the form collapsed and
          // the thanks panel appeared) so the rect reflects the new size
          // before we spawn petals along its edges.
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              requestPetalBurst(rsvpSection.getBoundingClientRect());
            });
          });
        }
      }
    }

    function handleCaptchaRejected(values) {
      captchaPayload = null;
      captchaState = 'unverified';
      if (captchaWidget && typeof captchaWidget.reset === 'function') {
        try {
          captchaWidget.reset();
        } catch (e) {
          /* ignore */
        }
      }
      setStatus('rsvp.err.captcha', true);
      lastFailKind = null;
      lastValues = values;
    }

    function sendRsvp(values, altchaPayload) {
      setStatus('rsvp.sending', false);
      setSending(true);

      var payload = {
        token: gate.getToken() || '',
        name: values.name,
        email: values.email,
        attending: values.attending,
        party: values.party,
        accommodation: '',
        note: values.note,
        lang: i18n.getLang(),
        website: values.website,
        altcha: altchaPayload || ''
      };

      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;

      fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          return { res: res, json: json };
        });
      }).then(function (r) {
        if (r.res.ok && r.json && r.json.ok === true) {
          onSuccess(values);
        } else if (r.res.status === 403 && r.json && r.json.ok === false && r.json.error === 'captcha') {
          handleCaptchaRejected(values);
        } else {
          showFailure(r.res.status === 400 ? 'invalid' : 'fail', values);
        }
      }).catch(function () {
        showFailure('fail', values);
      }).then(function () {
        if (timeoutId) clearTimeout(timeoutId);
        setSending(false);
      }, function () {
        if (timeoutId) clearTimeout(timeoutId);
        setSending(false);
      });
    }

    // If the widget never loaded (or there's no captcha slot at all) we
    // degrade gracefully and send straight away. Otherwise wait for a
    // verified payload: if it's already verified, go immediately; if not,
    // show the "still checking" status, nudge a (re)verify along, and let
    // onCaptchaStateChange resume the send once it settles.
    function trySend(values) {
      if (!captchaWidget || captchaLoadFailed) {
        sendRsvp(values, '');
        return;
      }
      if (captchaState === 'verified' && captchaPayload) {
        sendRsvp(values, captchaPayload);
        return;
      }
      pendingSubmitValues = values;
      captchaPendingSubmit = true;
      setStatus('rsvp.captcha.wait', false);
      setSending(true);
      if (captchaState !== 'verifying' && typeof captchaWidget.verify === 'function') {
        try {
          var vr = captchaWidget.verify();
          if (vr && typeof vr.catch === 'function') {
            vr.catch(function () { /* the resulting statechange already drives the UI */ });
          }
        } catch (e) {
          /* ignore */
        }
      }
    }

    function onSubmit(e) {
      e.preventDefault();
      if (isSending) return;

      var result = validate();
      if (!result.ok) {
        setStatus('rsvp.err.summary', true);
        if (result.firstInvalidEl && result.firstInvalidEl.focus) result.firstInvalidEl.focus();
        return;
      }

      lastFailKind = null;
      lastValues = null;
      setSending(true);
      trySend(result.values);
    }

    form.addEventListener('submit', onSubmit);

    [nameEl, emailEl, partyEl, noteEl].forEach(function (el) {
      if (!el) return;
      var name = el.getAttribute('name');
      el.addEventListener('input', function () {
        if (fieldErrors[name]) clearInputError(name, el);
      });
    });

    for (var i = 0; i < attendingRadios.length; i++) {
      attendingRadios[i].addEventListener('change', function () { clearGroupError('attending'); });
    }

    i18n.onLangChange(function () {
      Object.keys(fieldErrors).forEach(function (name) {
        var key = fieldErrors[name];
        var err = document.getElementById('err-' + name);
        if (err) {
          var val = i18n.t(key);
          if (val != null) err.textContent = val;
        }
      });
      // Re-translate whichever status line is currently showing: a plain
      // key-driven one (summary / sending / …) or, failing that, the
      // mailto failure message (which rebuilds its own link text/labels).
      if (statusKey && statusEl) {
        var statusText = labelFor(statusKey);
        if (statusText) statusEl.textContent = statusText;
      } else if (lastFailKind && lastValues) {
        showFailure(lastFailKind, lastValues);
      }
      // The widget's own translations for all three languages were already
      // registered once when it loaded — switching languages only needs to
      // point it at the right one.
      if (captchaWidget) {
        captchaWidget.setAttribute('language', i18n.getLang());
      }
    });

    initCaptcha();
  }

  // ---------------------------------------------------------------------
  // Wire countdown + RSVP once the gate state is known (open only)
  // ---------------------------------------------------------------------

  gate.ready.then(function (state) {
    if (state !== 'open') return;
    initCountdown();
    initRsvp();
  });
})();
