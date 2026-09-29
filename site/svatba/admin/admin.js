/*
 * Svatba gift admin page. Private, noindex, plain-but-tidy Czech UI.
 *
 * The admin key never lives in any file: it arrives as a URL hash fragment
 * (#key=...), gets copied into sessionStorage, and the hash is cleared
 * immediately so the key never sits in browser history or gets sent to any
 * server as part of a URL. Every request after that carries it as the
 * X-Admin-Key header instead.
 *
 * All network failure paths (wrong key, backend not deployed yet, CORS/DNS/
 * connection errors) show a clear inline error instead of leaving a blank
 * or broken page.
 */
(function () {
  'use strict';

  var SESSION_KEY = 'daryAdminKey';

  function apiBase() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'https://europe-west1-website-raccoon.cloudfunctions.net/dary';
    }
    return '/api/dary';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatAmount(n) {
    var v = Number(n) || 0;
    try {
      return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(v);
    } catch (e) {
      return v + ' Kč';
    }
  }

  function formatDate(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  }

  // ---- Key handling -----------------------------------------------------------
  function readKeyFromHash() {
    var m = /(?:^|[#&])key=([^&]+)/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function getStoredKey() {
    try { return window.sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }
  function storeKey(key) {
    try { window.sessionStorage.setItem(SESSION_KEY, key); } catch (e) { /* private mode etc: key just won't persist across reloads */ }
  }
  function clearStoredKey() {
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  var adminKey = null;

  function initKey() {
    var fromHash = readKeyFromHash();
    if (fromHash) {
      adminKey = fromHash;
      storeKey(fromHash);
      // Strip the key out of the URL/history immediately.
      var url = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url);
    } else {
      adminKey = getStoredKey();
    }
  }

  // ---- DOM refs -----------------------------------------------------------------
  var els = {};
  function cacheEls() {
    ['admin-key-gate', 'admin-key-status', 'admin-key-form', 'admin-key-input',
     'admin-dashboard', 'admin-error',
     'admin-tokenOk', 'admin-lastError', 'admin-lastSyncAt', 'admin-updatedAt',
     'admin-sync-btn', 'admin-sync-msg',
     'admin-bankTotal', 'admin-cashTotal', 'admin-total',
     'admin-cash-form', 'admin-cash-amount', 'admin-cash-note', 'admin-cash-msg',
     'admin-cash-tbody', 'admin-bank-tbody'
    ].forEach(function (id) { els[id] = document.getElementById(id); });
  }

  function showError(msg) {
    els['admin-error'].textContent = msg;
    els['admin-error'].hidden = false;
  }
  function clearError() {
    els['admin-error'].hidden = true;
    els['admin-error'].textContent = '';
  }

  function setKeyStatus(text, kind) {
    var el = els['admin-key-status'];
    el.textContent = text;
    el.className = 'admin-key-status' + (kind ? ' is-' + kind : '');
  }

  // ---- API calls ----------------------------------------------------------------
  // A single place that turns "fetch threw / non-2xx / bad JSON" into one
  // consistent { ok:false, status, message } shape, so every caller below
  // gets a graceful, human-readable failure instead of an uncaught error.
  function apiFetch(path, options) {
    options = options || {};
    var headers = options.headers || {};
    headers['X-Admin-Key'] = adminKey || '';
    return fetch(apiBase() + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body,
      credentials: 'omit'
    }).then(function (r) {
      if (r.status === 403) {
        return { ok: false, status: 403, message: 'Neplatný admin klíč.' };
      }
      if (!r.ok) {
        return r.json().catch(function () { return null; }).then(function (body) {
          return { ok: false, status: r.status, message: 'Server odpověděl chybou (' + r.status + ').', body: body };
        });
      }
      return r.json().then(function (body) {
        return { ok: true, status: r.status, body: body };
      }).catch(function () {
        return { ok: false, status: r.status, message: 'Neplatná odpověď serveru.' };
      });
    }).catch(function () {
      // Typically: backend not deployed yet, offline, DNS/CORS failure —
      // fetch() rejects instead of resolving with a status in all of these.
      return { ok: false, status: 0, message: 'Nelze se připojit k serveru (funkce zatím možná nejsou nasazené).' };
    });
  }

  // ---- Rendering ------------------------------------------------------------------
  function renderState(state) {
    state = state || {};
    els['admin-tokenOk'].textContent = state.tokenOk ? 'v pořádku' : 'nefunguje';
    els['admin-tokenOk'].className = state.tokenOk ? 'status-good' : 'status-bad';
    els['admin-lastError'].textContent = state.lastError || '–';
    els['admin-lastSyncAt'].textContent = formatDate(state.lastSyncAt);
    els['admin-updatedAt'].textContent = formatDate(state.updatedAt);
    els['admin-bankTotal'].textContent = formatAmount(state.bankTotal);
    els['admin-cashTotal'].textContent = formatAmount(state.cashTotal);
    els['admin-total'].textContent = formatAmount(state.total);
  }

  function renderBankTx(tx) {
    var tbody = els['admin-bank-tbody'];
    if (!tx || !tx.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Zatím žádné platby.</td></tr>';
      return;
    }
    tbody.innerHTML = tx.map(function (row) {
      return '<tr>' +
        '<td>' + escapeHtml(formatDate(row.date)) + '</td>' +
        '<td class="admin-amount">' + escapeHtml(formatAmount(row.amount)) + '</td>' +
        '<td>' + escapeHtml(row.counterName || '') + '</td>' +
        '<td>' + escapeHtml(row.message || '') + '</td>' +
        '<td>' + escapeHtml(row.vs || '') + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderCash(cash) {
    var tbody = els['admin-cash-tbody'];
    if (!cash || !cash.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="admin-empty">Zatím žádná hotovost.</td></tr>';
      return;
    }
    tbody.innerHTML = cash.map(function (row) {
      return '<tr data-id="' + escapeHtml(row.id) + '">' +
        '<td>' + escapeHtml(formatDate(row.createdAt)) + '</td>' +
        '<td class="admin-amount">' + escapeHtml(formatAmount(row.amount)) + '</td>' +
        '<td>' + escapeHtml(row.note || '') + '</td>' +
        '<td><button type="button" class="admin-row-delete" data-id="' + escapeHtml(row.id) + '">Smazat</button></td>' +
        '</tr>';
    }).join('');
    Array.prototype.forEach.call(tbody.querySelectorAll('.admin-row-delete'), function (btn) {
      btn.addEventListener('click', function () { deleteCash(btn.getAttribute('data-id'), btn); });
    });
  }

  // ---- Actions --------------------------------------------------------------------
  function loadAdminData() {
    clearError();
    return apiFetch('/admin').then(function (res) {
      if (!res.ok) {
        els['admin-dashboard'].hidden = true;
        els['admin-key-gate'].hidden = false;
        if (res.status === 403) {
          setKeyStatus('Klíč byl odmítnut (403).', 'bad');
        } else {
          setKeyStatus('Klíč zatím neověřen (viz chyba níže).', 'bad');
          showError(res.message);
        }
        return;
      }
      setKeyStatus('Klíč přijat.', 'ok');
      els['admin-key-gate'].hidden = true;
      els['admin-dashboard'].hidden = false;
      var body = res.body || {};
      renderState(body.state);
      renderBankTx(body.tx);
      renderCash(body.cash);
    });
  }

  function runSync() {
    els['admin-sync-btn'].disabled = true;
    els['admin-sync-msg'].textContent = 'Synchronizuji…';
    els['admin-sync-msg'].className = 'admin-inline-msg';
    apiFetch('/admin/sync', { method: 'POST' }).then(function (res) {
      els['admin-sync-btn'].disabled = false;
      if (!res.ok) {
        els['admin-sync-msg'].textContent = res.message;
        els['admin-sync-msg'].className = 'admin-inline-msg is-bad';
        return;
      }
      els['admin-sync-msg'].textContent = 'Hotovo.';
      els['admin-sync-msg'].className = 'admin-inline-msg is-ok';
      renderState(res.body && res.body.state);
      // A sync can also add new bank rows; reload the lists too.
      loadAdminData();
    });
  }

  function addCash(amount, note) {
    els['admin-cash-msg'].textContent = 'Ukládám…';
    els['admin-cash-msg'].className = 'admin-inline-msg';
    return apiFetch('/admin/cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amount, note: note })
    }).then(function (res) {
      if (!res.ok) {
        els['admin-cash-msg'].textContent = res.message;
        els['admin-cash-msg'].className = 'admin-inline-msg is-bad';
        return;
      }
      els['admin-cash-msg'].textContent = 'Přidáno.';
      els['admin-cash-msg'].className = 'admin-inline-msg is-ok';
      els['admin-cash-form'].reset();
      renderState(res.body && res.body.state);
      loadAdminData();
    });
  }

  function deleteCash(id, btn) {
    if (!id) return;
    if (!window.confirm('Opravdu smazat tento záznam?')) return;
    btn.disabled = true;
    apiFetch('/admin/cash/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (res) {
      if (!res.ok) {
        btn.disabled = false;
        showError(res.message);
        return;
      }
      renderState(res.body && res.body.state);
      loadAdminData();
    });
  }

  // ---- Wiring ---------------------------------------------------------------------
  function useKey(key) {
    adminKey = key;
    storeKey(key);
    els['admin-key-gate'].hidden = false; // stays visible until we know the key is good
    setKeyStatus('Ověřuji klíč…');
    loadAdminData();
  }

  function init() {
    cacheEls();
    initKey();

    els['admin-key-form'].addEventListener('submit', function (e) {
      e.preventDefault();
      var key = els['admin-key-input'].value.trim();
      if (!key) return;
      els['admin-key-input'].value = '';
      useKey(key);
    });

    els['admin-sync-btn'].addEventListener('click', runSync);

    els['admin-cash-form'].addEventListener('submit', function (e) {
      e.preventDefault();
      var amount = parseInt(els['admin-cash-amount'].value, 10);
      var note = els['admin-cash-note'].value.trim();
      if (!amount || amount < 1) {
        els['admin-cash-msg'].textContent = 'Zadejte platnou částku.';
        els['admin-cash-msg'].className = 'admin-inline-msg is-bad';
        return;
      }
      addCash(amount, note);
    });

    if (adminKey) {
      setKeyStatus('Ověřuji klíč…');
      loadAdminData();
    } else {
      setKeyStatus('Klíč zatím nezadán.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exposed only so a "change key" flow could be added later without
  // touching sessionStorage plumbing again; not otherwise used.
  window.__daryAdminClearKey = function () {
    clearStoredKey();
    adminKey = null;
  };
})();
